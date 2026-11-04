/**
 * v1(a) 2026-11-03 — meaning source: the prompt matched to OUR map's facts by meaning (MemOS's
 * local embedding model). Unit tests use a fake embedder; NEXPATH_MEANING_E2E=1 runs the real model.
 */

import { describe, it, expect } from 'vitest';
import { MeaningDriver, MEANING_MIN_SCORE, isMeaningModelInstalled, type Embedder } from '../sources/meaning-driver.js';
import { selectCandidates } from '../sources/candidate-filter.js';
import { rankAndAllocateBudget } from '../retrieval/budget-ranker.js';
import type { ContextMemoryRow } from '../types/context-engineering.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Fake embedder: texts with the same topic word point the same way. */
const topics = ['tax', 'webhook', 'redis', 'weather'];
const fake: Embedder = async (text) => {
  const v = new Float32Array(topics.length + 1);
  topics.forEach((t, i) => { if (text.toLowerCase().includes(t) || (t === 'tax' && /carts?/.test(text))) v[i] = 1; });
  v[topics.length] = 0.2;
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};

function row(id: number, content: string, extra: Partial<ContextMemoryRow> = {}): ContextMemoryRow {
  return { id, project_root: '/p', kind: 'rule', key: `k${id}`, content, verbatim: null, identities: null, locked: 0, confidence: 0.7, staleness: null, superseded_by: null, active: 1, evidence: null, created_at: Date.now(), updated_at: Date.now(), ...extra };
}

describe('MeaningDriver', () => {
  it('returns our own map rows that match by meaning, never new text', async () => {
    const d = new MeaningDriver({ load: async () => fake });
    expect(await d.available()).toBe(false); // first call starts loading the model
    await tick();
    expect(await d.available()).toBe(true);
    const found = await d.search({ prompt: 'why is the tax zero for some carts', projectRoot: '/p', mapFacts: [{ id: 3, content: 'TypeError in calculateTax for empty carts.' }, { id: 4, content: 'Rate limiting uses Redis.' }] }, Date.now() + 1000);
    expect(found.map((c) => [c.mapRowId, c.source])).toEqual([[3, 'meaning']]);
    expect(found[0].score).toBeGreaterThanOrEqual(MEANING_MIN_SCORE);
  });

  it('embeds only new facts; ones that do not fit before the deadline are embedded in the background', async () => {
    let calls = 0;
    const counting: Embedder = async (t) => (calls++, fake(t));
    const d = new MeaningDriver({ load: async () => counting });
    await d.available();
    await tick();
    const facts = [{ id: 1, content: 'Rate limiting uses Redis.' }];
    await d.search({ prompt: 'move redis', projectRoot: '/p', mapFacts: facts }, Date.now() + 1000);
    expect(calls).toBe(2); // prompt + fact
    await d.search({ prompt: 'redis again', projectRoot: '/p', mapFacts: facts }, Date.now() + 1000);
    expect(calls).toBe(3); // prompt only
    const late = await d.search({ prompt: 'redis', projectRoot: '/p', mapFacts: [...facts, { id: 2, content: 'Redis cluster has 3 nodes.' }] }, Date.now()); // no time left
    expect(late.map((c) => c.mapRowId)).toEqual([1]);
    await tick();
    await tick();
    expect((await d.search({ prompt: 'redis', projectRoot: '/p', mapFacts: [...facts, { id: 2, content: 'Redis cluster has 3 nodes.' }] }, Date.now() + 1000)).map((c) => c.mapRowId).sort()).toEqual([1, 2]);
  });
});

describe('meaning matches in selection and ranking', () => {
  it('become a set of map row ids, not extra rows', () => {
    const map = [row(3, 'TypeError in calculateTax for empty carts.')];
    const sel = selectCandidates(map, { succeeded: ['meaning'], failed: [], candidates: [{ source: 'meaning', ref: 'map:3', text: map[0].content, score: 0.6, mapRowId: 3 }] }, []);
    expect(sel.rows).toEqual(map);
    expect([...sel.meaningMatchedIds]).toEqual([3]);
  });

  it('a fact that shares no word with the prompt fills a leftover line; V1\'s own choice is unchanged', () => {
    const prompt = 'why is the tax zero for some carts';
    const byMeaning = row(3, 'TypeError in computeLevy for empty basket orders.', { kind: 'failure' });
    expect(rankAndAllocateBudget(prompt, [byMeaning], 'bugfix').allocatedLines).toEqual([]);
    expect(rankAndAllocateBudget(prompt, [byMeaning], 'bugfix', { meaningMatchedIds: new Set([3]) }).allocatedLines.map((l) => l.fact.id)).toEqual([3]);
    const v1Facts = Array.from({ length: 12 }, (_, i) => row(100 + i, `tax rule ${i} for carts`));
    const v1 = rankAndAllocateBudget(prompt, [...v1Facts, byMeaning], 'bugfix').allocatedLines.map((l) => l.fact.id);
    const withMeaning = rankAndAllocateBudget(prompt, [...v1Facts, byMeaning], 'bugfix', { meaningMatchedIds: new Set([3]) }).allocatedLines.map((l) => l.fact.id);
    expect(withMeaning).toEqual(expect.arrayContaining(v1));
  });
});

describe.runIf(process.env.NEXPATH_MEANING_E2E === '1' && isMeaningModelInstalled())('real model (MemOS\'s all-MiniLM-L6-v2)', () => {
  it('links questions with no shared words to the right fact, and keeps unrelated prompts clean', async () => {
    const d = new MeaningDriver();
    await d.available();
    for (let i = 0; i < 100 && !(await d.available()); i++) await new Promise((r) => setTimeout(r, 100));
    const mapFacts = [
      'Handle Stripe webhooks idempotently by storing event ids in processed_events.',
      'Rate limiting will use Redis with 100 requests/minute per API key.',
      'TypeError in calculateTax for empty carts; added guard for zero tax.',
      'Invoices will be sent from billing@ourco.com, not noreply.',
      'Invoice PDFs stored in invoices-archive for 7 years.',
    ].map((content, i) => ({ id: i + 1, content }));
    const top = async (prompt: string) => (await d.search({ prompt, projectRoot: '/p', mapFacts }, Date.now() + 5000)).map((c) => c.mapRowId);
    expect((await top('why is the tax zero for some carts'))[0]).toBe(3);
    expect((await top('stripe sends the same event again and customers are billed twice'))[0]).toBe(1);
    expect((await top('who do customers reply to on invoices'))[0]).toBe(4);
    for (const p of ['hello', 'what is the capital of France', 'add a dark mode toggle to the dashboard']) expect(await top(p)).toEqual([]);
  }, 60_000);
});
