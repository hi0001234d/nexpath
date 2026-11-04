/**
 * V2 #7 — multilingual memory, real model / real key (opt-in). Results here are measured on
 * AI-written sample sentences (multilingual-memory.json), not on real users' text.
 *
 *   REAL_HOME=$HOME NEXPATH_REAL_KEYCHAIN=1 NEXPATH_ML_KEY_E2E=1   real MemOS + the user's key: summaries stay in the user's language (Phase 0)
 *   REAL_HOME=$HOME NEXPATH_TEST_REAL_EMBEDDINGS=1                  real model, no key: save + bring back in every language (T7, S-2)
 *
 * REAL_HOME points at the model cache (~/.cache/memos/models); without it the model is downloaded once
 * into the test's temp home (24 MB).
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemosDriver } from '../sources/memos-driver.js';
import { createHostLlmBridge } from '../sources/host-llm-bridge.js';
import { newNexpathOpenAIClient, hasUsableNexpathLlmCredential } from '../../config/llm-client-scope.js';
import { resolveOpenAIKey } from '../../config/ApiKeyResolver.js';
import { writeFileSync } from 'node:fs';
import { openStore, type Store } from '../../store/db.js';
import { handleStopHookCapture } from '../ingestion/stop-capture.js';
import { getActiveContextMemory, getContextMemoryHistory } from '../store/historical-map-store.js';
import { preparePromptEnhancementWithSections } from '../delivery/prompt-enhancer.js';
import { MeaningDriver, isMeaningModelInstalled } from '../sources/meaning-driver.js';
import { memoryModelCacheDir } from '../sources/memory-model.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEVANAGARI = /\p{Script=Devanagari}/u;
const GUJARATI = /\p{Script=Gujarati}/u;

describe.runIf(process.env.NEXPATH_ML_KEY_E2E === '1')('Phase 0 (real key) — MemOS summaries stay in the user\'s language', () => {
  it('Hinglish stays Latin-letter Hinglish, Gujarati stays Gujarati script, English stays English', async () => {
    // The test setup moves HOME to a temp dir; the key is read from the real home (REAL_HOME).
    const testHome = process.env.HOME;
    process.env.HOME = process.env.REAL_HOME ?? testHome;
    try {
      await resolveOpenAIKey(process.env.HOME ?? '');
    } finally {
      process.env.HOME = testHome;
    }
    expect(hasUsableNexpathLlmCredential()).toBe(true);
    const home = mkdtempSync(join(tmpdir(), 'nexpath-ml-'));
    const bridge = createHostLlmBridge({ getClient: () => newNexpathOpenAIClient(), maxCallsPerMinute: 100, language: 'match' });
    const d = new MemosDriver({ home, bridge });
    try {
      const turns = {
        hinglish: { prompt: 'Ye final hai: payment retry ke liye sirf processRetry hi entry point rahega, isko change mat karna.', response: 'Theek hai, processRetry hi ek entry point rahega, maine baaki raste hata diye.' },
        gujarati: { prompt: 'આ final છે: payment retry માટે ફક્ત processRetry જ entry point રહેશે, આ બદલવાનું નથી.', response: 'બરાબર, processRetry જ એક માત્ર entry point રહેશે, બીજા રસ્તા કાઢી નાખ્યા.' },
        english: { prompt: 'Final decision: processRetry is the only entry point for payment retries.', response: 'Done, processRetry is now the only retry entry point; I removed the other paths.' },
      };
      const captured: Record<string, Awaited<ReturnType<MemosDriver['capture']>>> = {};
      for (const [name, t] of Object.entries(turns)) captured[name] = await d.capture({ projectRoot: '/repo/ml', sessionId: 's', prompt: t.prompt, response: t.response, ts: Date.now() });
      await new Promise((r) => setTimeout(r, 25_000)); // MemOS writes the summaries in the background
      const summary = async (name: string) => (await d.turnSummary(captured[name]!)) ?? '';
      const hinglish = await summary('hinglish');
      const gujarati = await summary('gujarati');
      const english = await summary('english');
      console.log({ hinglish, gujarati, english });
      expect(hinglish).not.toBe('');
      expect(DEVANAGARI.test(hinglish)).toBe(false); // not switched to Hindi script
      expect(/\b(hai|ke|liye|rahega|sirf|hi|karna|mat)\b/i.test(hinglish)).toBe(true); // still Hinglish words
      expect(GUJARATI.test(gujarati)).toBe(true);
      expect(GUJARATI.test(english) || DEVANAGARI.test(english)).toBe(false);
    } finally {
      await d.close();
      rmSync(home, { recursive: true, force: true });
    }
  }, 120_000);
});

interface MlItem { id: string; lang: string; kind: string; locked: boolean; memory: string; related: string; unrelated: string; cross?: { lang: string; text: string } }
const fixture = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/multilingual-memory.json', import.meta.url)), 'utf8')) as { items: MlItem[] };
const item = (id: string) => fixture.items.find((i) => i.id === id)!;

describe.runIf(process.env.NEXPATH_TEST_REAL_EMBEDDINGS === '1' && isMeaningModelInstalled())('T7 real model — saved and brought back in every language (AI-written sample sentences)', () => {
  const PROJECT = '/repo/ml-real';
  const meaning = new MeaningDriver({ cacheDir: memoryModelCacheDir(process.env.REAL_HOME ?? process.env.HOME) });
  const report: string[] = [];
  const ready = async () => {
    await meaning.available();
    for (let i = 0; i < 600 && !(await meaning.available()); i++) await new Promise((r) => setTimeout(r, 100));
    expect(await meaning.available()).toBe(true);
  };
  /** A fresh map holding these memories, each saved through the real Stop-hook path. */
  const mapWith = async (memories: string[]): Promise<Store> => {
    const store = await openStore(':memory:');
    for (const m of memories) await handleStopHookCapture(store, { projectRoot: PROJECT, prompt: m, assistantResponse: 'Noted.' } as never);
    return store;
  };
  /** The memory facts Feature 1 selects for this prompt (map + meaning source, no key needed). */
  const shown = async (store: Store, prompt: string) => {
    const r = await preparePromptEnhancementWithSections(prompt, { workspacePath: PROJECT, store } as never, { sources: [meaning], timeoutMs: 5000, recordDelivery: false } as never);
    return (r.facts ?? []).map((f) => f.content);
  };
  const FIVE = ['en-01', 'hi-01', 'hi-latn-01', 'gu-01', 'gu-latn-01'];
  // Another project fact in the map, so "brought back" is a choice and not the only row
  const OTHER = 'Locked requirement: the footer uses the brand grey #6b7280 only.';

  it('T7-1 the spec\'s 5 test sentences are saved, the locked ones locked', async () => {
    for (const id of FIVE) {
      const rows = getActiveContextMemory(await mapWith([item(id).memory, OTHER]), PROJECT);
      const row = rows.find((r) => r.content === item(id).memory);
      expect(row, id).toBeDefined();
      expect(row!.kind).toBe('rule');
      expect(row!.locked).toBe(1);
    }
    // The 5 are one decision in 5 forms: saved one after another, each replaces the one before
    // (decision chaining across languages), so only the newest stays active.
    const store = await mapWith(FIVE.map((id) => item(id).memory));
    const history = getContextMemoryHistory(store, PROJECT).filter((r) => FIVE.some((id) => item(id).memory === r.content));
    expect(history).toHaveLength(5);
    expect(history.every((r) => r.locked === 1 && r.kind === 'rule')).toBe(true);
    expect(getActiveContextMemory(store, PROJECT).map((r) => r.content)).toEqual([item('gu-latn-01').memory]);
  });

  it('T7-2 / T7-3 a related prompt in the same form brings each back; an unrelated one does not', async () => {
    await ready();
    for (const id of FIVE) {
      const m = item(id);
      const store = await mapWith([m.memory, OTHER]);
      const related = await shown(store, m.related);
      const unrelated = await shown(store, m.unrelated);
      report.push(`${id}: related ${related.includes(m.memory) ? 'FOUND' : 'missed'} · unrelated ${unrelated.includes(m.memory) ? 'SHOWN (wrong)' : 'clean'}`);
      expect(related, `${id} related: ${m.related}`).toContain(m.memory);
      expect(unrelated, `${id} unrelated: ${m.unrelated}`).not.toContain(m.memory);
    }
  }, 120_000);

  it('T7-4 a related prompt in another form (recorded; target ≥ 8/10 of the bench)', async () => {
    await ready();
    let found = 0;
    let total = 0;
    for (const m of fixture.items.filter((i) => ['en', 'hi', 'hi-latn', 'gu', 'gu-latn'].includes(i.lang) && i.cross)) {
      const store = await mapWith([m.memory, OTHER]);
      total++;
      if ((await shown(store, m.cross!.text)).includes(m.memory)) found++;
    }
    report.push(`cross-form: ${found}/${total}`);
    expect(total).toBeGreaterThan(0);
  }, 300_000);

  it('T7-5 / T7-6 goal languages: saved, locked, brought back (recorded for sw / am, known gaps)', async () => {
    await ready();
    for (const lang of ['en-US-slang', 'es-419', 'pt-BR', 'pcm', 'sw-sheng', 'ha', 'sw', 'am']) {
      const m = item(`${lang}-01`);
      const store = await mapWith([m.memory, OTHER]);
      const row = getActiveContextMemory(store, PROJECT).find((r) => r.content === m.memory);
      expect(row, `${lang} saved`).toBeDefined();
      expect(row!.locked, `${lang} locked`).toBe(1);
      const related = (await shown(store, m.related)).includes(m.memory);
      const unrelated = (await shown(store, m.unrelated)).includes(m.memory);
      report.push(`${lang}-01: related ${related ? 'FOUND' : 'missed'} · unrelated ${unrelated ? 'SHOWN (wrong)' : 'clean'}`);
      if (lang !== 'sw' && lang !== 'am') {
        expect(related, `${lang} related: ${m.related}`).toBe(true);
        expect(unrelated, `${lang} unrelated: ${m.unrelated}`).toBe(false);
      }
    }
  }, 300_000);

  it('T7-7 two Gujarati rules end to end: both active, each prompt brings back its own', async () => {
    await ready();
    const a = item('gu-01');
    const b = item('gu-07');
    const store = await mapWith([a.memory, b.memory]);
    const rows = getActiveContextMemory(store, PROJECT).map((r) => r.content);
    expect(rows).toEqual(expect.arrayContaining([a.memory, b.memory]));
    const forA = await shown(store, a.related);
    const forB = await shown(store, b.related);
    report.push(`T7-7: gu-01 prompt → ${forA.length} fact(s), own=${forA.includes(a.memory)}; gu-07 prompt → ${forB.length}, own=${forB.includes(b.memory)}`);
    expect(forA).toContain(a.memory);
    expect(forB).toContain(b.memory);
  }, 120_000);

  it('S-2 Hindi and Gujlish prompts: p95 < 2.5 s with the real model', async () => {
    await ready();
    const store = await mapWith(fixture.items.filter((i) => i.locked).slice(0, 40).map((i) => i.memory));
    for (const id of ['hi-02', 'gu-latn-02']) {
      const times: number[] = [];
      for (let i = 0; i < 20; i++) {
        const t = performance.now();
        await shown(store, item(id).related);
        times.push(performance.now() - t);
      }
      const p95 = times.sort((x, y) => x - y)[18]!;
      report.push(`S-2 ${id}: p95 ${p95.toFixed(0)} ms`);
      expect(p95).toBeLessThan(2500);
    }
    if (process.env.NEXPATH_ML_REPORT) writeFileSync(process.env.NEXPATH_ML_REPORT, report.join('\n') + '\n');
  }, 300_000);
});
