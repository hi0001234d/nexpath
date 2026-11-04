/**
 * v1(a) 2026-11-03 — MemOS works properly (natural-work run with the real key):
 *  - its AI calls get a language line (English now; "the user's language" later),
 *  - its one-line turn summary goes into our map (our patterns miss natural wording),
 *  - its full, AI-filtered search runs in the background and serves the next prompts.
 */

import { describe, it, expect } from 'vitest';
import { openStore } from '../../store/db.js';
import { getActiveContextMemory } from '../store/historical-map-store.js';
import { normalizeProjectId } from '../core/project-scope.js';
import { withLanguageLine, createHostLlmBridge } from '../sources/host-llm-bridge.js';
import { factFromTurnSummary } from '../ingestion/fact-extractor.js';
import { saveTurnSummary } from '../sources/memos-summary.js';
import { ingestSessionFacts } from '../ingestion/decision-chainer.js';
import { MemosDriver, type MemosCoreLike } from '../sources/memos-driver.js';
import { createDesktopFeature1Tools } from '../delivery/desktop-feature1-tools.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('language line on MemOS AI calls', () => {
  it('English by default; the user\'s language when set to match (multilingual later)', () => {
    const msgs = [{ role: 'system', content: 'You condense a single agent/user exchange.' }, { role: 'user', content: 'x' }];
    expect(withLanguageLine(msgs, 'en')[0].content).toMatch(/condense[\s\S]*Write every free-text value in English\.$/);
    expect(withLanguageLine(msgs, 'match')[0].content).toMatch(/same language as the user's own text/);
    expect(withLanguageLine([{ role: 'user', content: 'x' }], 'en')[0]).toEqual({ role: 'system', content: 'Write every free-text value in English.' });
  });

  it('the bridge sends it', async () => {
    const sent: any[] = [];
    const client = { chat: { completions: { create: async (b: any) => (sent.push(b), { model: 'gpt-4o-mini', choices: [{ message: { content: '{"summary":"x"}' } }] }) } } } as any;
    await createHostLlmBridge({ getClient: () => client }).complete({ messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'u' }] });
    expect(sent[0].messages[0].content).toBe('S\n\nWrite every free-text value in English.');
  });
});

describe('MemOS turn summary → a fact for our map', () => {
  it('a failure when it names an error, otherwise a rule; never locked, at most 0.7', () => {
    const f = factFromTurnSummary('/p', 'One failure: TypeError in calculateTax for empty carts.', 'trace:t1')!;
    expect(f).toMatchObject({ kind: 'failure', locked: false });
    expect(f.confidence).toBeLessThanOrEqual(0.7);
    expect(JSON.parse(f.evidence!)).toEqual({ source: 'memos', ref: 'trace:t1' });
    expect(factFromTurnSummary('/p', 'Rate limiting will use Redis with 100 requests/minute per API key.', 'trace:t2')).toMatchObject({ kind: 'rule', locked: false });
  });

  it('too short to be a fact → nothing ("User is agreeable.")', () => {
    expect(factFromTurnSummary('/p', 'User is agreeable.', 'trace:t3')).toBeUndefined();
  });

  it('is saved into our map, and not again when our map already has it', async () => {
    const store = await openStore(':memory:');
    const root = normalizeProjectId('/w/inv');
    const turn = { projectRoot: root, traceId: 't1', userText: 'for rate limiting lets just go with redis' };
    expect(saveTurnSummary(store, turn, 'Rate limiting will use Redis with 100 requests/minute per API key.')).toBe(true);
    expect(saveTurnSummary(store, turn, 'Rate limiting will use Redis with 100 requests/minute per API key.')).toBe(false);
    ingestSessionFacts(store, { projectRoot: root, prompt: 'Final decision: invoices are sent from billing@ourco.com only.', assistantResponse: '' });
    expect(saveTurnSummary(store, { ...turn, traceId: 't2' }, 'Final decision: invoices are sent from billing@ourco.com only.')).toBe(false);
    expect(getActiveContextMemory(store, root).map((r) => r.content).sort()).toEqual([
      'Final decision: invoices are sent from billing@ourco.com only.',
      'Rate limiting will use Redis with 100 requests/minute per API key.',
    ]);
  });
});

function fakeCore(over: Partial<MemosCoreLike> = {}) {
  const searches: { query: string; deadlineAt?: number }[] = [];
  let hitsFor: (q: string) => { refId: string; refKind: string; score: number; snippet: string }[] = () => [];
  const core: MemosCoreLike = {
    shutdown: async () => {},
    onTurnStart: async () => ({ episodeId: 'ep' }),
    onTurnEnd: async () => ({ traceId: 'tr_1' }),
    searchMemory: async (q) => (searches.push({ query: q.query, deadlineAt: q.deadlineAt }), { hits: hitsFor(q.query) }),
    getTrace: async () => ({ summary: 'Handle Stripe webhooks idempotently by storing event ids in processed_events.' }),
    ...over,
  };
  return { core, searches, setHits: (f: typeof hitsFor) => (hitsFor = f) };
}

describe('MemosDriver: summary read-back and background search', () => {
  const bridge = createHostLlmBridge({ getClient: () => undefined });

  it('capture returns the trace; the summary is read back, but not MemOS\'s fallback copy', async () => {
    const { core } = fakeCore();
    const d = new MemosDriver({ home: '/b', bridge, boot: async () => core });
    const captured = await d.capture({ projectRoot: '/r', sessionId: 's', prompt: 'how should we deal with duplicate webhooks?', response: 'I made it idempotent.', ts: 1 });
    expect(captured).toEqual({ projectRoot: normalizeProjectId('/r'), traceId: 'tr_1', userText: 'how should we deal with duplicate webhooks?' });
    expect(await d.turnSummary(captured!)).toBe('Handle Stripe webhooks idempotently by storing event ids in processed_events.');
    const copy = fakeCore({ getTrace: async () => ({ summary: 'how should we deal with duplicate webhooks?' }) });
    const d2 = new MemosDriver({ home: '/b', bridge, boot: async () => copy.core });
    expect(await d2.turnSummary((await d2.capture({ projectRoot: '/r', sessionId: 's', prompt: 'how should we deal with duplicate webhooks?', response: 'I made the handler idempotent.', ts: 1 }))!)).toBeUndefined();
  });

  it('a turn whose reply says nothing ("OK") gives no summary to save', async () => {
    const { core } = fakeCore();
    const d = new MemosDriver({ home: '/b', bridge, boot: async () => core });
    expect(await d.capture({ projectRoot: '/r', sessionId: 's', prompt: 'switch the invoice sender to noreply', response: 'OK', ts: 1 })).toBeUndefined();
  });

  it('each prompt also searches in the background (10 s for the AI filter); results serve later prompts', async () => {
    const { core, searches, setHits } = fakeCore();
    const jobs: (() => Promise<void>)[] = [];
    let t = 1_000_000;
    const d = new MemosDriver({ home: '/b', bridge, boot: async () => core, schedule: (j) => jobs.push(j), now: () => t });
    await d.search({ prompt: 'warm', projectRoot: '/r' }, Date.now() + 1000);
    await tick();
    // in the worker MemOS answers instantly from earlier background results (none yet) and
    // searches in the background, with time for its AI filter
    setHits((q) => (q === 'why are invoices sent twice' ? [{ refId: 'tr_9', refKind: 'trace', score: 0.8, snippet: '[user] duplicate webhooks [assistant] handleStripeWebhook is idempotent via processed_events now' }] : []));
    const t0 = performance.now();
    expect(await d.search({ prompt: 'why are invoices sent twice', projectRoot: '/r' }, Date.now() + 1000)).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(searches).toHaveLength(0); // no live search
    for (const j of jobs.splice(0)) await j();
    expect(searches.at(-1)!.deadlineAt).toBe(t + 10_000);
    const next = await d.search({ prompt: 'fix the duplicate invoice emails', projectRoot: '/r' }, Date.now() + 1000);
    expect(next.map((c) => c.ref)).toEqual(['trace:tr_9']);
    t += 31 * 60_000; // kept 30 minutes
    expect(await d.search({ prompt: 'fix the duplicate invoice emails', projectRoot: '/r' }, Date.now() + 1000)).toEqual([]);
  });
});

describe('desktop: MemOS turn summary into the app store', () => {
  it('a little after the turn, the summary is in our map', async () => {
    const { core } = fakeCore();
    const memos = new MemosDriver({ home: '/b', bridge: createHostLlmBridge({ getClient: () => undefined }), boot: async () => core });
    const none = { name: 'openclaw', available: async () => false, search: async () => [], saveSessionDecisions: async () => false } as never;
    const t = createDesktopFeature1Tools({ dataDir: '/unused', summaryDelayMs: 5, drivers: { memos, openclaw: none, codebase: { name: 'codebase', available: async () => false, search: async () => [] } as never } });
    const store = await openStore(':memory:');
    await t.capture({ projectRoot: '/w/app', sessionId: 's', prompt: 'how should we deal with duplicate webhooks?', response: 'I made it idempotent.' }, store);
    await new Promise((r) => setTimeout(r, 30));
    expect(getActiveContextMemory(store, normalizeProjectId('/w/app')).map((r) => r.content)).toContain(
      'Handle Stripe webhooks idempotently by storing event ids in processed_events.'
    );
  });
});

describe('marking memory as shown: only what the popup really carries', () => {
  it('facts whose section is in the final body count; the rest stay available', async () => {
    const { feature1FactsInBodyV1 } = await import('../../cli/commands/auto.js');
    const facts = [
      { id: 1, kind: 'rule', locked: true, content: 'a', sectionId: 'context_and_constraints', tag: '@rule:a' },
      { id: 2, kind: 'rule', locked: false, content: 'b', sectionId: 'project_facts', tag: '@rule:b' },
      { id: -1, kind: 'memos_recall', locked: false, content: 'c', sectionId: 'project_facts', tag: '@memos:c' },
    ] as any;
    const body = { currentBody: { sections: [
      { sourceIds: ['project_memory:context_and_constraints:locked:rule:1', 'nexpath:x'] },
      { sourceIds: ['project_memory:project_facts:open:memos_recall:-1'] },
    ] } } as any;
    expect(feature1FactsInBodyV1(body, facts).map((f: any) => f.tag)).toEqual(['@rule:a', '@memos:c']);
    expect(feature1FactsInBodyV1({ currentBody: { sections: [] } } as any, facts)).toEqual([]);
  });
});

describe('marking memory as shown: the writer\'s fact ids are traced back', () => {
  const facts = [
    { id: 2, kind: 'rule', locked: true, content: 'processRetry is the only entry point.', sectionId: 'context_and_constraints', tag: '@rule:entry' },
    { id: 9, kind: 'failure', locked: false, content: 'processRetry crashed with ECONNRESET.', sectionId: 'risk_safety_confirmation', tag: '@failure:econn' },
    { id: -6, kind: 'code_context', locked: false, content: 'processRetry is in src/payment.ts.', sectionId: 'project_grounding_facts', tag: '@code:x' },
  ] as any[];
  const request = async () => {
    const { buildProjectMemoryRefV1 } = await import('../../prompt-enhancement/project-memory-facts.js');
    const refs = facts.map((f) => buildProjectMemoryRefV1(f));
    return {
      sourceSignals: {
        normalizedStageAbsenceSignalRefs: [], contentTemplateRecordFactRefs: [], missingMemoryCandidateRefs: [], sourceOnlyHardFactRefs: [],
        rightGoodWorkStyleEnvRuntimeRefs: refs,
        groundingEvidenceByRef: Object.fromEntries(refs.map((r, i) => [r, { key: 'k', value: facts[i].content, runtimePath: 'local_store', anchorScope: 'project_root' }])),
      },
      reviewMomentContext: { triggerProvenance: { triggerKind: 'none', currentStage: 'implementation' } },
    } as any;
  };

  it('a section naming guidance_fact:pe-fact-project-memory-N counts the fact it came from', async () => {
    const { feature1FactsInBodyV1 } = await import('../../cli/commands/auto.js');
    const { buildPromptEnhancementGuidanceFactsV1 } = await import('../../prompt-enhancement/guidance-facts.js');
    const req = await request();
    const ids = buildPromptEnhancementGuidanceFactsV1(req).filter((g) => g.factId.includes('project-memory')).map((g) => g.factId);
    expect(ids).toHaveLength(3);
    // the popup kept the first and the third memory facts
    const body = { currentBody: { sections: [{ sourceIds: ['prompt:1'], sourceFactIds: [`guidance_fact:${ids[0]}`, 'section_kind:x'] }, { sourceIds: ['prompt:1'], sourceFactIds: [`guidance_fact:${ids[2]}`] }] } } as any;
    expect(feature1FactsInBodyV1(body, facts, req).map((f: any) => f.id)).toEqual([2, -6]);
  });

  it('a memory fact the body names but that cannot be traced → every fact counts (never silently off)', async () => {
    const { feature1FactsInBodyV1 } = await import('../../cli/commands/auto.js');
    const body = { currentBody: { sections: [{ sourceIds: ['prompt:1'], sourceFactIds: ['guidance_fact:pe-fact-project-memory-99'] }] } } as any;
    expect(feature1FactsInBodyV1(body, facts, await request())).toHaveLength(3);
    expect(feature1FactsInBodyV1(body, facts)).toHaveLength(3);
  });
});
