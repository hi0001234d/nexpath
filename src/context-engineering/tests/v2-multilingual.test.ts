/**
 * V2 #7 — multilingual memory (dev plan: /media/dhruv/newDisk/yagnik/v2-multilingual-devplan.md,
 * test plan: v2-multilingual-test-plan.md). Unit tests: no network, fake embedder / fake MemOS.
 * English behaviour must not change: every existing test passes unedited.
 */

import { describe, it, expect, vi } from 'vitest';

// Phase 6: installAction runs for real here; telemetry flushing is stubbed as in install.test.ts, and
// whether MemOS counts as installed can be switched per test.
vi.mock('../../telemetry/lifecycle-flush.js', () => ({ flushIfTelemetryOn: async () => {} }));
const toolsOverride = vi.hoisted(() => ({ memos: undefined as boolean | undefined }));
vi.mock('../worker/tools-status.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../worker/tools-status.js')>();
  return {
    ...actual,
    feature1ToolsStatus: () => {
      const status = actual.feature1ToolsStatus();
      return toolsOverride.memos === undefined ? status : { ...status, memos: toolsOverride.memos };
    },
  };
});
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createDesktopFeature1Tools } from '../delivery/desktop-feature1-tools.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../store/db.js';
import { extractFacts, factFromTurnSummary, evaluateLockConfidence } from '../ingestion/fact-extractor.js';
import { ingestExtractedFacts } from '../ingestion/decision-chainer.js';
import { getActiveContextMemory } from '../store/historical-map-store.js';
import { generateContextTags } from '../delivery/tag-generator.js';
import { analyzeSessionPatterns } from '../learning/pattern-learner.js';
import { MemOSAdapter } from '../adapters/memos-adapter.js';
import { selectCandidates } from '../sources/candidate-filter.js';
import { rankAndAllocateBudget } from '../retrieval/budget-ranker.js';
import { isEcho, memosConfigYaml, MEMOS_CONFIG_YAML } from '../sources/memos-driver.js';
import { MeaningDriver, MEANING_MIN_SCORE, MEANING_MIN_SCORE_DEVANAGARI, bundledModelsDir } from '../sources/meaning-driver.js';
import { bundledOpenClawEntry } from '../sources/openclaw-driver.js';
import { prefetchMemoryModel, removeMemoryModel, memoryModelDir, memoryModelCacheDir, memosDataDir, memoryToolDataDirs } from '../sources/memory-model.js';
import { installAction, uninstallAction } from '../../cli/commands/install.js';
import { resolveAgentPaths } from '../../cli/commands/install.js';
import { mkdirSync, existsSync, realpathSync } from 'node:fs';
import type { ContextMemoryRow } from '../types/context-engineering.js';
import type { SourceCandidate } from '../sources/source-driver.js';
import { words, phrase, literal, normalizeText, letterCount, scriptShare, splitSentences, SENTENCE_END } from '../core/unicode-text.js';

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

interface MlItem { id: string; lang: string; kind: string; locked: boolean; memory: string; related: string; unrelated: string; cross?: { lang: string; text: string } }
const fixture = JSON.parse(src('./fixtures/multilingual-memory.json')) as { items: MlItem[] };
const items = (lang: string) => fixture.items.filter((i) => i.lang === lang);
const item = (id: string) => fixture.items.find((i) => i.id === id)!;


describe('Phase 0 — MemOS writes in the user\'s own language (user decision 2026-11-03)', () => {
  it('desktop: every MemOS AI call asks for the user\'s language, never English', async () => {
    const bodies: any[] = [];
    const server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        bodies.push(JSON.parse(raw || '{}'));
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ id: 'x', object: 'chat.completion', model: 'gpt-4o-mini', choices: [{ index: 0, message: { role: 'assistant', content: '{"summary":"x"}' }, finish_reason: 'stop' }] }));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    try {
      const none = { name: 'codebase', available: async () => false, search: async () => [] } as never;
      const t = createDesktopFeature1Tools({ dataDir: '/unused', drivers: { memos: none, openclaw: none, codebase: none } });
      t.setCredentials({ deviceToken: 'npd_t', deviceId: 'd', apiBaseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
      await t.bridge.complete({ messages: [{ role: 'system', content: 'You condense a single agent/user exchange.' }, { role: 'user', content: 'ye final hai' }] });
      const system = bodies[0].messages[0].content as string;
      expect(system).toContain("same language as the user's own text; never switch to another language");
      expect(system).not.toContain('in English');
    } finally {
      server.close();
    }
  });

  it('CLI worker: the MemOS bridge is created with the user\'s language', () => {
    // worker-main.ts runs as its own process; its bridge options are checked in the source.
    const worker = src('../worker/worker-main.ts');
    const bridgeCall = worker.slice(worker.indexOf('createHostLlmBridge({'), worker.indexOf('}),', worker.indexOf('createHostLlmBridge({')));
    expect(bridgeCall).toContain("language: 'match'");
  });
});

describe('Phase 1 — Unicode word helper (core/unicode-text.ts)', () => {
  it('T1-1 words() keeps Devanagari whole, incl. vowel signs', () => {
    expect([...words('इसे मत बदलना')]).toEqual(['इसे', 'मत', 'बदलना']);
  });

  it('T1-2 words() keeps Gujarati, Ge\'ez and accented letters whole', () => {
    expect([...words('આ બદલવાનું નથી')]).toEqual(['આ', 'બદલવાનું', 'નથી']);
    expect([...words('አትቀይሩት።')]).toEqual(['አትቀይሩት']);
    expect([...words('não está decidido')]).toEqual(['não', 'está', 'decidido']);
  });

  it('T1-3 English parity: same words as the old a-z0-9 split, for every en memory and prompt', () => {
    const old = (t: string, n: number) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= n));
    const oldUnderscore = (t: string, n: number) => new Set((t.toLowerCase().match(/[a-z0-9_]+/g) ?? []).filter((w) => w.length >= n));
    const texts = items('en').flatMap((i) => [i.memory, i.related, i.unrelated]).concat('max_attempts is 3; use snake_case_names');
    expect(texts.length).toBeGreaterThanOrEqual(60);
    for (const t of texts) {
      for (const n of [1, 2, 3]) {
        expect(words(t, n)).toEqual(old(t, n));
        expect(words(t, n, { underscore: true })).toEqual(oldUnderscore(t, n));
      }
    }
  });

  it('T1-4 phrase() matches a Latin phrase only as whole words', () => {
    const re = phrase([literal('final hai')]);
    expect(re.test('ye final hai.')).toBe(true);
    expect(re.test('Ye FINAL  hai')).toBe(true);
    expect(re.test('ye finalhai')).toBe(false);
    expect(re.test('ye final haina')).toBe(false);
  });

  it('T1-5 phrase() matches inside script text, not inside a longer script word', () => {
    const re = phrase([literal('पक्का फ़ैसला')]);
    expect(re.test(normalizeText('यह पक्का फ़ैसला है'))).toBe(true);
    expect(re.test(normalizeText('यह पक्का फ़ैसला।'))).toBe(true);
    expect(re.test(normalizeText('पक्का फ़ैसलाओं'))).toBe(false);
    // the nukta typed as one code point (U+095E) or as फ + ़ is the same phrase after normalizeText
    expect(re.test(normalizeText('यह पक्का \u095Eैसला है'))).toBe(true);
  });

  it('T1-6 phrase() rejects a longer word', () => {
    const re = phrase([literal('es definitivo')]);
    expect(re.test('es definitivamente mejor')).toBe(false);
    expect(re.test('esto es definitivo.')).toBe(true);
    expect(phrase(['final']).test('vamos a finalizar')).toBe(false);
    expect(phrase(['final']).test('final_value')).toBe(false); // `_` is a word character, as with \b
  });

  it('T1-7 SENTENCE_END splits at । ॥ ። and still at . ! ?', () => {
    expect(splitSentences('पहला वाक्य। दूसरा वाक्य।')).toEqual(['पहला वाक्य।', 'दूसरा वाक्य।']);
    expect(splitSentences('पहला वाक्य।दूसरा वाक्य॥')).toEqual(['पहला वाक्य।', 'दूसरा वाक्य॥']);
    const am = item('am-01').memory;
    expect(splitSentences(am)).toEqual([am]); // ፦ and ፤ are a colon and a semicolon: one sentence
    expect(splitSentences(`${am} ቁልፉን ሰማያዊ አድርግ።`)).toHaveLength(2);
    expect(splitSentences('First. Second!')).toEqual(['First.', 'Second!']);
    expect(SENTENCE_END.unicode).toBe(true);
  });

  it('English sentence split is unchanged (old /(?<=[.!?])\\s+|\\r?\\n+/ split)', () => {
    const oldSplit = (t: string) => t.split(/(?<=[.!?])\s+|\r?\n+/).map((s) => s.trim()).filter((s) => s.length > 0);
    const texts = items('en').map((i) => `${i.memory} ${i.related}.\n${i.unrelated}? ok!  done`).concat('v1.2 is out. e.g. this\r\n\nnext');
    for (const t of texts) expect(splitSentences(t)).toEqual(oldSplit(t));
  });

  it('letterCount() and scriptShare()', () => {
    expect(letterCount('बदलना')).toBe(4);
    expect(letterCount('इसे')).toBe(2);
    expect(letterCount('retry')).toBe(5);
    expect(scriptShare('मुझे बटन का रंग बदलना है', 'Devanagari')).toBe(1);
    expect(scriptShare('add a retry', 'Devanagari')).toBe(0);
    expect(scriptShare('checkout pe payment fail ho to retry के लिए code add karo', 'Devanagari')).toBeLessThan(0.5);
    expect(scriptShare('', 'Devanagari')).toBe(0);
  });
});

/** Today's (pre-#7) generateFactKey, kept here to prove English keys do not change (T2-3). */
const oldFactKey = (content: string, kind: string) => {
  const w = content.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
    .filter((x) => x.length > 2 && !['the', 'and', 'for', 'with', 'that', 'this'].includes(x)).slice(0, 4);
  return `${kind}-${w.join('-') || 'fact'}`;
};
/** A MemOS turn summary → our map's fact; the path every script summary takes since Phase 0. */
const summaryFact = (text: string) => factFromTurnSummary('/repo/ml', text, 'ref-1')!;

describe('Phase 2 — keys, tags and slugs keep every script', () => {
  const GU_A = 'આ final છે: payment retry માટે ફક્ત processRetry જ entry point રહેશે';
  const GU_B = 'આ final છે: deploy મંગળવારે જ થશે';
  // Gujarati-only summaries (MemOS writes in the user's language since Phase 0)
  const GU_ONLY_A = 'ચુકવણી ફરી પ્રયાસ માટે ફક્ત એક જ રસ્તો રહેશે એ નક્કી થયું';
  const GU_ONLY_B = 'ડિપ્લોય હંમેશા મંગળવારે સાંજે જ કરવાનું નક્કી થયું';

  it('T2-1 two different Gujarati-script rules get two keys, neither rule-fact', () => {
    for (const [a, b] of [[GU_A, GU_B], [GU_ONLY_A, GU_ONLY_B]]) {
      const ka = summaryFact(a).key;
      const kb = summaryFact(b).key;
      expect(ka).not.toBe(kb);
      expect(ka).not.toBe('rule-fact');
      expect(kb).not.toBe('rule-fact');
    }
    expect(oldFactKey(GU_ONLY_A, 'rule')).toBe('rule-fact'); // the bug this fixes
  });

  it('T2-2 Hindi key keeps vowel signs', () => {
    expect(summaryFact('इसे बदलना नहीं है: token 15 मिनट तक ही रहेगा').key).toContain('बदलना');
  });

  it('T2-3 English keys unchanged for every en memory and prompt', () => {
    const texts = items('en').flatMap((i) => [i.memory, i.related, i.unrelated]);
    let checked = 0;
    for (const t of texts) {
      const f = factFromTurnSummary('/repo/en', t, 'r');
      if (f) { expect(f.key).toBe(oldFactKey(f.content, f.kind)); checked++; }
      for (const e of extractFacts({ projectRoot: '/repo/en', prompt: t, assistantResponse: t })) {
        expect(e.key).toBe(oldFactKey(e.content, e.kind));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('T2-4 store: two Gujarati rules both stay active (never overwrite each other)', async () => {
    const store = await openStore(':memory:');
    try {
      ingestExtractedFacts(store, '/repo/ml', [summaryFact(GU_ONLY_A)]);
      const r = ingestExtractedFacts(store, '/repo/ml', [summaryFact(GU_ONLY_B)]);
      expect(r.supersededCount).toBe(0);
      const active = getActiveContextMemory(store, '/repo/ml').map((m) => m.content);
      expect(active).toEqual(expect.arrayContaining([GU_ONLY_A, GU_ONLY_B]));
      expect(active).toHaveLength(2);
    } finally {
      store.close?.();
    }
  });

  it('T2-5 tag slug keeps Hindi letters', () => {
    expect(generateContextTags([], { gitBranch: 'भुगतान नियम' } as never)).toContain('@git:branch:भुगतान-नियम');
    expect(generateContextTags([], { gitBranch: 'Feature/Retry Logic' } as never)).toContain('@git:branch:feature/retry-logic');
  });

  it('T2-6 pattern slug keeps letters and is cut by whole characters (≤ 32)', async () => {
    const detail = 'ચુકવણી ફરી પ્રયાસ માટે ફક્ત એક જ રસ્તો રહેશે એ નક્કી થયું છે';
    const res = await analyzeSessionPatterns([{ prompt: 'x', response: `// TODO: ${detail}\n` }]);
    const key = res.alerts.find((a) => a.key.startsWith('alert:under_implemented:session:'))!.key;
    const slug = key.slice('alert:under_implemented:session:'.length);
    expect([...slug].length).toBeLessThanOrEqual(32);
    expect(slug).toMatch(/^[\p{Script=Gujarati}_]+$/u);
    expect(slug.startsWith('ચુકવણી_ફરી')).toBe(true);
    expect(/\p{M}/u.test([...slug][0]!)).toBe(false);
    // ASCII unchanged: old .replace(/[^a-z0-9_-]+/g, '_').slice(0, 32)
    const en = await analyzeSessionPatterns([{ prompt: 'x', response: '// TODO: Add the Retry backoff for checkout payments, then log it\n' }]);
    const enKey = en.alerts.find((a) => a.key.startsWith('alert:under_implemented:session:'))!.key;
    expect(enKey).toBe(`alert:under_implemented:session:${'add the retry backoff for checkout payments, then log it'.replace(/[^a-z0-9_-]+/g, '_').slice(0, 32)}`);
  });

  it('T2-7 fallback search finds a Hindi word', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexpath-ml-memos-'));
    try {
      const a = new MemOSAdapter({ projectRoot: '/repo/ml', storageDir: dir, timeoutMs: 2000 });
      await a.saveTurn({ prompt: item('hi-01').memory, response: 'ठीक है' });
      await a.saveTurn({ prompt: 'make the footer links a lighter grey', response: 'done' });
      // Hindi words only: the old \\W+ split found no search term at all
      const hits = await a.search('इसे बदलना');
      expect(hits).toHaveLength(1);
      expect(hits[0]!.text).toContain('बदलना');
      expect(await a.search('footer links')).toHaveLength(1); // English unchanged
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** Today's (pre-#7) lock regexes, kept here to prove English lock results do not change (T3-9). */
const OLD_EXPLICIT = /\b(lock\s+the\s+design|settled|locked\s+requirement|final\s+decision|lock\s+this|strictly\s+locked|locked)\b/i;
const OLD_INFERRED = /\b(always|never|must|only\s+allowed|strictly|do\s+not\s+allow|shall\s+not|prohibited)\b/i;
const oldLock = (t: string) => (OLD_EXPLICIT.test(t) ? { locked: true, confidence: 0.95 } : OLD_INFERRED.test(t) ? { locked: true, confidence: 0.7 } : { locked: false, confidence: 0.5 });
const promptRules = (prompt: string) =>
  extractFacts({ projectRoot: '/repo/ml', prompt, assistantResponse: 'Noted.' }).filter((f) => f.kind === 'rule');

describe('Phase 3 — lock words, sentence split, questions', () => {
  const LANGS = ['en', 'hi', 'hi-latn', 'gu', 'gu-latn', 'en-US-slang', 'es-419', 'pt-BR', 'pcm', 'sw-sheng', 'sw', 'ha', 'am'];

  it.each(LANGS)('T3-1 explicit lock word → locked rule (%s-01, from the prompt)', (lang) => {
    const m = item(`${lang}-01`);
    const rules = promptRules(m.memory);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ kind: 'rule', content: m.memory, locked: true, confidence: 0.95 });
  });

  it('T3-1b every locked fixture memory is locked; no related / unrelated prompt is', () => {
    const wrong: string[] = [];
    for (const m of fixture.items.filter((i) => i.lang !== 'en')) {
      if (evaluateLockConfidence(m.memory).locked !== m.locked) wrong.push(m.id);
      for (const t of [m.related, m.unrelated]) if (evaluateLockConfidence(t).locked) wrong.push(`${m.id} prompt: ${t}`);
    }
    expect(wrong).toEqual([]);
  });

  it.each(['isko change mat karna', 'aa badalvanu nahi', 'no se cambia', 'make una no change am', 'इसे मत बदलना', 'આ બદલવાનું નથી', 'não mexam nisso', 'usiguze hiyo', 'kada a canza', 'አትቀይሩት', "don't touch that"])(
    'T3-2 softer lock words → inferred tier: %s',
    (t) => {
      expect(evaluateLockConfidence(`processRetry stays the entry point, ${t}.`)).toEqual({ locked: true, confidence: 0.7 });
    },
  );

  it.each(['kya ye final hai?', 'kya ye final hai', 'ye final hai kya', 'shu aa final che', '¿ya está decidido?', 'શું આ final છે?', 'क्या यह पक्का फ़ैसला है?', 'यह पक्का फ़ैसला है क्या', 'ni uamuzi wa mwisho?'])(
    'T3-3 lock words inside a question → not saved as a rule: %s',
    (q) => {
      expect(promptRules(q)).toEqual([]);
    },
  );

  it.each(['vamos a finalizar el pago', 'finally the test passed', 'es definitivamente mejor', 'the finalhai typo', 'we unlockedit'])(
    'T3-4 look-alike words → not locked: %s',
    (t) => {
      expect(evaluateLockConfidence(t).locked).toBe(false);
      expect(promptRules(t)).toEqual([]);
    },
  );

  it('T3-5 Hindi danda splits a prompt; only the lock sentence becomes the rule', () => {
    const rules = promptRules('मुझे login page चाहिए। यह पक्का फ़ैसला है: token 15 मिनट का रहेगा।');
    expect(rules.map((r) => r.content)).toEqual(['यह पक्का फ़ैसला है: token 15 मिनट का रहेगा।']);
  });

  it('T3-6 Amharic ። splits a prompt; ፦ does not', () => {
    const am = item('am-01').memory;
    expect(promptRules(`${am} ቁልፉን ሰማያዊ አድርግ።`).map((r) => r.content)).toEqual([am]);
  });

  it('T3-7 spec "Today" case: a Hinglish decision through the Stop path is saved', () => {
    const facts = extractFacts({ projectRoot: '/repo/ml', prompt: 'Postgres hi use karenge, ye final hai.', assistantResponse: 'Noted.' });
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ kind: 'rule', locked: true, confidence: 0.95 });
  });

  it('T3-8 Gujlish decision through the Stop path is saved', () => {
    const m = item('gu-latn-01');
    expect(extractFacts({ projectRoot: '/repo/ml', prompt: m.memory, assistantResponse: 'Noted.' })).toEqual([
      expect.objectContaining({ kind: 'rule', locked: true, confidence: 0.95, content: m.memory }),
    ]);
  });

  it('T3-8b a decision in an agent reply in the user\'s language is a rule too', () => {
    const facts = extractFacts({ projectRoot: '/repo/ml', prompt: 'ok', assistantResponse: 'ठीक है। यह पक्का फ़ैसला है: deploy सिर्फ़ मंगलवार को होगा।' });
    expect(facts.filter((f) => f.kind === 'rule').map((f) => f.content)).toEqual(['यह पक्का फ़ैसला है: deploy सिर्फ़ मंगलवार को होगा।']);
  });

  it('T3-9 English lock parity: every string in the English ingestion tests + the 20 en memories', () => {
    const strings = ['phase2-ingestion.test.ts', 'regressions.test.ts']
      .flatMap((f) => [...src(`./${f}`).matchAll(/'((?:[^'\\\n]|\\.){8,})'|`([^`$]{8,})`|"((?:[^"\\\n]|\\.){8,})"/g)].map((m) => m[1] ?? m[2] ?? m[3]))
      .concat(items('en').flatMap((i) => [i.memory, i.related, i.unrelated]));
    expect(strings.length).toBeGreaterThan(150);
    for (const t of strings) expect(evaluateLockConfidence(t)).toEqual(oldLock(t));
  });
});

const NOW = Date.now();
const mapRow = (id: number, content: string, extra: Partial<ContextMemoryRow> = {}): ContextMemoryRow => ({
  id, project_root: '/repo/ml', kind: 'rule', key: `rule-${id}`, content, verbatim: null, identities: null,
  locked: 1, confidence: 0.95, staleness: null, superseded_by: null, active: 1, evidence: null,
  created_at: NOW, updated_at: NOW, ...extra,
});
const memosRun = (...texts: string[]) => ({
  candidates: texts.map((text, i): SourceCandidate => ({ source: 'memos', ref: `memos-${i}`, text, score: 0.9 })),
  succeeded: ['memos' as const], failed: [],
});

describe('Phase 4 — word matching: chaining, old-decision filter, ranker, echo', () => {
  it('T4-1 a new Gujarati decision on the same subject replaces the old one; a different one does not', async () => {
    const A = 'પાકો નિયમ: processRetry માં ફક્ત ત્રણ વાર ફરી પ્રયાસ થશે.';
    const B = 'પાકો નિયમ: processRetry ના logs માં card number ક્યારેય ન આવવો જોઈએ.';
    const A2 = 'પાકો નિયમ: processRetry માં હવે ફક્ત પાંચ વાર ફરી પ્રયાસ થશે.';
    const store = await openStore(':memory:');
    const save = (prompt: string) => ingestExtractedFacts(store, '/repo/ml', extractFacts({ projectRoot: '/repo/ml', prompt, assistantResponse: 'Noted.' }));
    try {
      save(A);
      expect(save(B).supersededCount).toBe(0); // before #7 B replaced A: only "processretry" was compared
      expect(save(A2).supersededCount).toBe(1);
      const active = getActiveContextMemory(store, '/repo/ml').map((m) => m.content).sort();
      expect(active).toEqual([A2, B].sort());
    } finally {
      store.close?.();
    }
  });

  it('T4-2 a replaced Hindi decision coming back from MemOS is dropped', () => {
    const oldText = 'पक्का फ़ैसला: तारीखें हमेशा स्थानीय समय में सहेजी जाएँगी।';
    const newText = 'पक्का फ़ैसला: सारी तारीखें UTC में सहेजी जाएँगी, स्थानीय समय में नहीं।';
    const sel = selectCandidates([mapRow(2, newText)], memosRun(oldText), [mapRow(1, oldText, { active: 0, superseded_by: 2 })]);
    expect(sel.droppedReplaced).toBe(1);
    expect(sel.rows.map((r) => r.content)).toEqual([newText]);
  });

  it('T4-3 a Hinglish copy of a map fact from MemOS is dropped as a duplicate; a different Hinglish fact is kept', () => {
    const fact = item('hi-latn-01').memory;
    const other = item('hi-latn-08').memory;
    const sel = selectCandidates([mapRow(1, fact)], memosRun(`${fact} Reply only with: Noted.`, other), []);
    expect(sel.droppedDuplicates).toBe(1);
    expect(sel.rows.map((r) => r.content)).toEqual([fact, other]);
  });

  const UNRELATED_EN = [
    'Locked requirement: sendMail queue is the only way to send email.',
    'Image uploads are limited to 5 MB.',
    'Tests are written in vitest, not jest.',
    'Product search may move to Meilisearch later.',
    'The public API allows 100 requests per minute per user.',
    'Prices are stored as integer cents, never floats.',
    'Deploys happen only on Tuesdays.',
    'API keys are read only from environment variables.',
    'Card numbers must never appear in payment logs.',
  ];

  it('T4-4 a Gujarati prompt ranks its Gujarati fact (shared Gujarati word only)', () => {
    const gu = mapRow(1, item('gu-03').memory);
    const facts = [gu, ...UNRELATED_EN.map((t, i) => mapRow(i + 2, t))];
    const res = rankAndAllocateBudget('તારીખો બતાવવાનું નવું પેજ બનાવો', facts, 'feature');
    expect(res.allocatedLines.map((l) => l.fact.id)).toEqual([1]);
    expect(res.allocatedLines[0]!.breakdown.keywordMatch).toBeGreaterThan(0);
  });

  it('T4-4b Hinglish grammar words alone do not make a fact relevant', () => {
    const facts = [mapRow(1, item('hi-latn-07').memory), mapRow(2, item('hi-latn-01').memory)];
    // shares only "hai", "karna", "ke liye" with the facts
    expect(rankAndAllocateBudget('button ka color blue karna hai ke liye', facts, 'feature').allocatedLines).toEqual([]);
    // a real shared word still counts
    expect(rankAndAllocateBudget('deploy ka din kab hai', facts, 'feature').allocatedLines.map((l) => l.fact.id)).toEqual([1]);
  });

  it('T4-5 ranker words are unchanged for English (old \\b[a-z0-9_]{2,}\\b match); English words still stemmed', () => {
    const oldWords = (t: string) => new Set(t.toLowerCase().match(/\b[a-z0-9_]{2,}\b/g) ?? []);
    for (const t of items('en').flatMap((i) => [i.memory, i.related, i.unrelated])) expect(words(t, 2, { underscore: true })).toEqual(oldWords(t));
    const facts = [mapRow(1, 'Retries use exponential backoff with a max of 3 attempts.')];
    expect(rankAndAllocateBudget('the retry backoff', facts, 'feature').allocatedLines.map((l) => l.fact.id)).toEqual([1]);
  });

  it('T4-6 a repeated Hindi prompt is an echo', () => {
    const p = item('hi-01').related;
    expect(isEcho(p, p)).toBe(true);
    expect(isEcho(`${p}।`, p)).toBe(true);
  });

  it('T4-7 a different Hindi prompt is not an echo', () => {
    expect(isEcho(item('hi-01').memory, item('hi-02').related)).toBe(false);
    // before #7 every Devanagari word was invisible, so two different Hindi-only prompts looked the same
    expect(isEcho('मुझे बटन का रंग बदलना है', 'मुझे लॉगिन पेज का रंग बदलना है')).toBe(false);
  });
});

describe('Phase 5 — Hindi-script floor in the meaning source', () => {
  /** Fake embedder: the prompt and the fact get vectors whose cosine is exactly `score`. */
  const driverWithScore = async (score: number) => {
    const fact = { id: 7, content: 'stored memory' };
    const d = new MeaningDriver({
      load: async () => async (text: string) => (text === fact.content ? new Float32Array([1, 0]) : new Float32Array([score, Math.sqrt(1 - score * score)])),
    });
    await d.available();
    await new Promise((r) => setTimeout(r, 0));
    expect(await d.available()).toBe(true);
    return (prompt: string) => d.search({ prompt, projectRoot: '/repo/ml', mapFacts: [fact] } as never, Date.now() + 1000);
  };

  it('the floors', () => {
    expect(MEANING_MIN_SCORE).toBe(0.5);
    expect(MEANING_MIN_SCORE_DEVANAGARI).toBe(0.6);
  });

  it('T5-1 a Devanagari prompt below 0.6 → nothing', async () => {
    expect(await (await driverWithScore(0.55))('मुझे बटन का रंग बदलना है')).toEqual([]);
  });

  it('T5-2 a Devanagari prompt at or above 0.6 → the fact', async () => {
    expect(await (await driverWithScore(0.65))('मुझे बटन का रंग बदलना है')).toHaveLength(1);
  });

  it('T5-3 English unchanged (0.5)', async () => {
    expect(await (await driverWithScore(0.55))('add a retry when the checkout payment fails')).toHaveLength(1);
    expect(await (await driverWithScore(0.45))('add a retry when the checkout payment fails')).toEqual([]);
  });

  it('T5-4 Hinglish (Latin letters) unchanged', async () => {
    expect(await (await driverWithScore(0.55))(item('hi-latn-01').related)).toHaveLength(1);
  });

  it('T5-5 a mixed prompt with mostly Latin letters keeps 0.5', async () => {
    expect(await (await driverWithScore(0.55))('checkout pe payment fail ho to retry के लिए code add karo')).toHaveLength(1);
  });

  it('T5-6 Gujarati and Amharic keep 0.5 (a higher floor loses their real matches)', async () => {
    expect(await (await driverWithScore(0.55))(item('gu-01').related)).toHaveLength(1);
    expect(await (await driverWithScore(0.55))(item('am-01').related)).toHaveLength(1);
  });
});

describe('Phase 6 — the memory model works offline', () => {
  const withHome = () => {
    const home = mkdtempSync(join(tmpdir(), 'nexpath-ml-home-'));
    return { home, done: () => rmSync(home, { recursive: true, force: true }) };
  };
  const logs = () => {
    const lines: string[] = [];
    return { lines, log: (l: string) => lines.push(l) };
  };
  /** installAction --yes in a temp folder, with a fake model download; returns the console output. */
  const runInstall = async (prefetchMemoryModelFn: () => Promise<unknown>, memos: boolean | undefined) => {
    const { home, done } = withHome();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const skip = process.env.NEXPATH_SKIP_MODEL_DOWNLOAD;
    delete process.env.NEXPATH_SKIP_MODEL_DOWNLOAD;
    toolsOverride.memos = memos;
    try {
      const summary = await installAction({ yes: true }, {
        paths: resolveAgentPaths(home, home, home), isWin: false, execFn: () => {}, skipClipboardCheck: true,
        dbPath: join(home, 'store.db'), prefetchMemoryModelFn,
      });
      return { summary, output: spy.mock.calls.map((c) => String(c[0])).join('\n') };
    } finally {
      toolsOverride.memos = undefined;
      if (skip !== undefined) process.env.NEXPATH_SKIP_MODEL_DOWNLOAD = skip;
      spy.mockRestore();
      done();
    }
  };

  it('T6-1 the model is fetched into MemOS\'s cache; install calls it once when MemOS is installed', async () => {
    const { home, done } = withHome();
    try {
      const out = logs();
      const load = vi.fn(async () => {});
      expect(await prefetchMemoryModel({ home, load, log: out.log })).toBe('ready');
      expect(load).toHaveBeenCalledTimes(1);
      expect(load).toHaveBeenCalledWith(join(home, '.cache', 'memos', 'models'));
      expect(out.lines[0]).toBe('Downloading the memory model (24 MB)…');
      expect(memoryModelDir(home)).toBe(join(memoryModelCacheDir(home), 'Xenova', 'all-MiniLM-L6-v2'));
    } finally {
      done();
    }
    const fetch = vi.fn(async () => 'ready');
    const { summary } = await runInstall(fetch, true);
    expect(summary).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('T6-2 no network → install still succeeds; the model downloads on first use', async () => {
    const out = logs();
    expect(await prefetchMemoryModel({ load: async () => { throw new Error('getaddrinfo ENOTFOUND huggingface.co'); }, log: out.log })).toBe('skipped');
    expect(out.lines.join('\n')).toContain('downloads on first use');
    const { summary } = await runInstall(async () => { throw new Error('seam broke'); }, true);
    expect(summary).not.toBeNull();
  });

  it('T6-3 a hanging download is skipped after 60 s', async () => {
    vi.useFakeTimers();
    try {
      const out = logs();
      const pending = prefetchMemoryModel({ load: () => new Promise<void>(() => {}), log: out.log });
      await vi.advanceTimersByTimeAsync(59_000);
      expect(out.lines.join('\n')).not.toContain('first use');
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await pending).toBe('skipped');
      expect(out.lines.join('\n')).toContain('downloads on first use');
    } finally {
      vi.useRealTimers();
    }
  });

  it('T6-4 no MemOS (or NEXPATH_SKIP_MODEL_DOWNLOAD=1) → no download', async () => {
    const fetch = vi.fn(async () => 'ready');
    await runInstall(fetch, false);
    expect(fetch).not.toHaveBeenCalled();
    process.env.NEXPATH_SKIP_MODEL_DOWNLOAD = '1';
    const { home, done } = withHome();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    toolsOverride.memos = true;
    try {
      await installAction({ yes: true }, { paths: resolveAgentPaths(home, home, home), isWin: false, execFn: () => {}, skipClipboardCheck: true, dbPath: join(home, 'store.db'), prefetchMemoryModelFn: fetch });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      toolsOverride.memos = undefined;
      spy.mockRestore();
      done();
    }
  });

  it('T6-5 uninstall removes only our model folder', async () => {
    const home = process.env.HOME!; // the suite's temp HOME (vitest.setup.ts)
    const ours = memoryModelDir(home);
    const otherModel = join(memoryModelCacheDir(home), 'other');
    const otherApp = join(home, '.cache', 'other-app');
    for (const d of [ours, otherModel, otherApp]) mkdirSync(d, { recursive: true });
    writeFileSync(join(ours, 'model_quantized.onnx'), 'x');
    expect(removeMemoryModel(join(home, 'nobody'))).toBe(false);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await uninstallAction({ paths: resolveAgentPaths(home, home, home), execFn: () => {}, apiKeyConfirmFn: async () => false, storeDeleteConfirmFn: async () => true, dbPath: join(home, 'none.db') });
      expect(spy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('Memory model removed');
    } finally {
      spy.mockRestore();
    }
    expect(existsSync(ours)).toBe(false);
    expect(existsSync(otherModel)).toBe(true);
    expect(existsSync(otherApp)).toBe(true);
    rmSync(join(home, '.cache'), { recursive: true, force: true });
  });

  it('T6-6 uninstall removes the memory tools\' data (MemOS, OpenClaw, codebase index) with the local data; kept when declined', async () => {
    const home = process.env.HOME!;
    const uninstall = (deleteData: boolean) => uninstallAction({
      paths: resolveAgentPaths(home, home, home), execFn: () => {}, apiKeyConfirmFn: async () => false,
      storeDeleteConfirmFn: async () => deleteData, dbPath: join(home, 'none.db'),
    });
    const project = join(memosDataDir(home), 'project-abc');
    const openclawWs = join(home, '.nexpath', 'openclaw', 'agents', 'nexpath-abc', 'workspace', 'memory');
    const codeIndex = join(home, '.nexpath', 'codebase-memory');
    const other = join(home, '.nexpath', 'keep-me.txt');
    const usersOwnOpenClaw = join(home, '.openclaw');
    for (const d of [project, openclawWs, codeIndex, usersOwnOpenClaw]) mkdirSync(d, { recursive: true });
    writeFileSync(join(project, 'memos.db'), 'x');
    writeFileSync(join(openclawWs, 'session.md'), 'x');
    writeFileSync(join(codeIndex, 'index.db'), 'x');
    writeFileSync(other, 'x');
    expect(memoryToolDataDirs(home).map((d) => d.dir)).toEqual([memosDataDir(home), join(home, '.nexpath', 'openclaw'), codeIndex]);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await uninstall(false);
      expect([project, openclawWs, codeIndex].every(existsSync)).toBe(true); // declined: nothing deleted
      await uninstall(true);
      const out = spy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(out).toContain('Saved memories (MemOS) removed');
      expect(out).toContain('OpenClaw agents and session notes removed');
      expect(out).toContain('Code index (codebase-memory-mcp) removed');
    } finally {
      spy.mockRestore();
    }
    for (const { dir } of memoryToolDataDirs(home)) expect(existsSync(dir)).toBe(false);
    expect(existsSync(other)).toBe(true); // only the tools' folders
    expect(existsSync(usersOwnOpenClaw)).toBe(true); // the user's own OpenClaw is never touched
    rmSync(other, { force: true });
    rmSync(usersOwnOpenClaw, { recursive: true, force: true });
  });
});

describe('Phase 7 — speed (S-1)', () => {
  it('S-1 lock check + key + ranking: a 400-character Hindi prompt costs < 1 ms more (p95) than English', () => {
    const fill = (base: string) => { let t = base; while (t.length < 400) t += ` ${base}`; return t.slice(0, 400); };
    const hindi = fill(item('hi-02').memory);
    const english = fill(item('en-02').memory);
    const facts = [...items('hi'), ...items('en')].slice(0, 30).map((m, i) => mapRow(i + 1, m.memory));
    const p95 = (prompt: string) => {
      const times: number[] = [];
      for (let i = 0; i < 220; i++) {
        const t = performance.now();
        extractFacts({ projectRoot: '/repo/ml', prompt, assistantResponse: prompt });
        rankAndAllocateBudget(prompt, facts, 'feature');
        if (i >= 20) times.push(performance.now() - t); // first 20 runs warm up
      }
      return times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)]!;
    };
    p95(english); // warm both paths
    const en = p95(english);
    const hi = p95(hindi);
    expect(hi - en).toBeLessThan(1);
  });
});

describe('Model and OpenClaw come with Nexpath (dependencies, 2026-11-04)', () => {
  it('the model inside the package is used with no download; MemOS gets its path', async () => {
    const out: string[] = [];
    const load = vi.fn(async () => {});
    expect(await prefetchMemoryModel({ bundled: () => '/pkg/dist/models', load, log: (l) => out.push(l) })).toBe('ready');
    expect(load).not.toHaveBeenCalled();
    expect(out).toEqual(['✓ Memory model included with Nexpath (works offline).']);
    const yaml = memosConfigYaml('/pkg/dist/models');
    expect(yaml).toContain('embedding:\n  provider: local\n  local:\n    modelPath: "/pkg/dist/models"\n');
    expect(memosConfigYaml(undefined)).toBe(MEMOS_CONFIG_YAML); // not bundled: config as before
    expect(memosConfigYaml('C:\\Users\\a b\\models')).toContain('modelPath: "C:\\\\Users\\\\a b\\\\models"'); // Windows path, YAML-escaped
    expect(bundledModelsDir()).toBeUndefined(); // the source tree has no dist/models
  });

  it('the OpenClaw that came with Nexpath is found in node_modules; none → undefined', () => {
    const root = mkdtempSync(join(tmpdir(), 'nexpath-oc-'));
    try {
      const deep = join(root, 'node_modules', 'nexpath-cli', 'dist', 'context-engineering', 'sources');
      mkdirSync(deep, { recursive: true });
      const from = join(deep, 'openclaw-driver.js');
      expect(bundledOpenClawEntry(from)).toBeUndefined();
      const oc = join(root, 'node_modules', 'openclaw');
      mkdirSync(oc, { recursive: true });
      writeFileSync(join(oc, 'package.json'), JSON.stringify({ name: 'openclaw', version: '2026.9.2', bin: { openclaw: 'openclaw.mjs' } }));
      expect(bundledOpenClawEntry(from)).toBeUndefined(); // bin file missing
      writeFileSync(join(oc, 'openclaw.mjs'), '');
      expect(bundledOpenClawEntry(from)).toBe(realpathSync(join(oc, 'openclaw.mjs')));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
