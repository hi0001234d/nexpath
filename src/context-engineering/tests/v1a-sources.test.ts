/**
 * v1(a) Phase 1 — source drivers, candidate selection (D2 / D7) and the ranker's tool pass.
 *
 * Tools are the main retrieval path, V1 retrieval is the fallback, and our map decides:
 * replaced decisions never come back through a tool, locked decisions always stay.
 */

import { describe, it, expect } from 'vitest';
import { openStore } from '../../store/db.js';
import { ingestSessionFacts } from '../ingestion/decision-chainer.js';
import { preparePromptEnhancementWithSections } from '../delivery/prompt-enhancer.js';
import { rankAndAllocateBudget, formatFactTag } from '../retrieval/budget-ranker.js';
import { runSourceDrivers, type SourceCandidate, type SourceDriver, type SourceName, type SourceRunResult } from '../sources/source-driver.js';
import { selectCandidates } from '../sources/candidate-filter.js';
import type { ContextMemoryRow } from '../types/context-engineering.js';
import { buildProjectMemoryRefV1, buildProjectMemoryGuidanceFactV1 } from '../../prompt-enhancement/project-memory-facts.js';

const NOW = Date.now();

function row(id: number, content: string, extra: Partial<ContextMemoryRow> = {}): ContextMemoryRow {
  return {
    id, project_root: '/p', kind: 'rule', key: `rule-${id}`, content, verbatim: null, identities: null,
    locked: 0, confidence: 0.8, staleness: null, superseded_by: null, active: 1, evidence: null,
    created_at: NOW, updated_at: NOW, ...extra,
  };
}

function driver(name: SourceName, behaviour: 'ok' | 'unavailable' | 'throw' | 'hang', candidates: Partial<SourceCandidate>[] = []): SourceDriver {
  return {
    name,
    available: async () => behaviour !== 'unavailable',
    search: (_q, _deadline, signal) => {
      if (behaviour === 'throw') return Promise.reject(new Error(`${name} broke`));
      if (behaviour === 'hang') {
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
      }
      return Promise.resolve(candidates.map((c, i) => ({ source: name, ref: `${name}-${i}`, text: '', score: 0.5, ...c })));
    },
  };
}

const QUERY = { prompt: 'add jitter to processRetry', projectRoot: '/p' };

describe('runSourceDrivers', () => {
  it('returns candidates from working drivers, clamps scores and drops empty texts', async () => {
    const run = await runSourceDrivers([driver('memos', 'ok', [{ text: ' processRetry retried 3 times ', score: 1.7 }, { text: '   ' }])], QUERY, 500);
    expect(run.succeeded).toEqual(['memos']);
    expect(run.failed).toEqual([]);
    expect(run.candidates).toHaveLength(1);
    expect(run.candidates[0].text).toBe('processRetry retried 3 times');
    expect(run.candidates[0].score).toBe(1);
  });

  it('reports unavailable, throwing and slow drivers without throwing itself', async () => {
    const t = Date.now();
    const run = await runSourceDrivers(
      [driver('memos', 'unavailable'), driver('openclaw', 'throw'), driver('codebase', 'hang')],
      QUERY,
      150
    );
    expect(Date.now() - t).toBeLessThan(1000);
    expect(run.succeeded).toEqual([]);
    const byName = Object.fromEntries(run.failed.map((f) => [f.source, f.reason]));
    expect(byName).toEqual({ memos: 'unavailable', openclaw: 'error', codebase: 'timeout' });
    expect(run.failed.find((f) => f.source === 'openclaw')?.message).toBe('openclaw broke');
  });

  it('a slow driver does not hold back a fast one', async () => {
    const run = await runSourceDrivers([driver('memos', 'ok', [{ text: 'fast memory' }]), driver('codebase', 'hang')], QUERY, 120);
    expect(run.succeeded).toEqual(['memos']);
    expect(run.candidates.map((c) => c.text)).toEqual(['fast memory']);
    expect(run.failed).toEqual([{ source: 'codebase', reason: 'timeout' }]);
  });

  it('marks drivers cancelled when the caller aborts', async () => {
    const ac = new AbortController();
    const pending = runSourceDrivers([driver('memos', 'hang')], QUERY, 5000, ac.signal);
    setTimeout(() => ac.abort(), 20);
    const run = await pending;
    expect(run.failed).toEqual([{ source: 'memos', reason: 'cancelled', message: 'aborted' }]);
  });

  it('does nothing without drivers', async () => {
    expect(await runSourceDrivers([], QUERY, 100)).toEqual({ candidates: [], succeeded: [], failed: [] });
  });
});

describe('selectCandidates (D7 our map always first, tools only add; D2 our map decides)', () => {
  const locked = row(1, 'Locked requirement: processRetry in src/payment.ts is the only entry point for retries.', { locked: 1, confidence: 0.95 });
  const plain = row(2, 'Retries use exponential backoff with a max of 3 attempts.');
  const alert = row(3, 'TODO left in processRetry: missing rollback.', { kind: 'pattern_alert' });
  const replaced = row(4, 'Retries use linear backoff with a max of 5 attempts.', { active: 0, superseded_by: 2 });
  const run = (succeeded: SourceName[], failed: SourceName[], candidates: Partial<SourceCandidate>[]): SourceRunResult => ({
    succeeded,
    failed: failed.map((source) => ({ source, reason: 'error' as const })),
    candidates: candidates.map((c, i) => ({ source: 'memos' as SourceName, ref: `r${i}`, text: '', score: 0.7, ...c })),
  });

  it('without tools returns exactly the map rows (V1)', () => {
    const sel = selectCandidates([locked, plain, alert], undefined, []);
    expect(sel.rows).toEqual([locked, plain, alert]);
  });

  it('tools working: every map row stays, tool rows are added after them', () => {
    const sel = selectCandidates([locked, plain, alert], run(['memos', 'openclaw'], [], [{ text: 'Last crash was ECONNRESET from the gateway.' }]), []);
    expect(sel.rows.map((r) => r.id)).toEqual([1, 2, 3, -1]);
    const tool = sel.rows[3];
    expect(tool.kind).toBe('memos_recall');
    expect(tool.locked).toBe(0);
    expect(tool.confidence).toBe(0.7);
    expect(JSON.parse(tool.evidence!)).toEqual({ source: 'memos', ref: 'r0' });
  });

  it('tools failing or finding nothing: exactly the map rows', () => {
    for (const r of [run(['memos', 'openclaw'], [], []), run(['memos'], ['openclaw'], []), run([], ['memos', 'openclaw', 'codebase'], [])]) {
      expect(selectCandidates([locked, plain, alert], r, []).rows).toEqual([locked, plain, alert]);
    }
  });

  it('a code result is added like any tool result', () => {
    const sel = selectCandidates([locked, plain], run(['codebase'], [], [{ source: 'codebase', text: 'processRetry is called by checkout.ts' }]), []);
    expect(sel.rows.map((r) => r.kind)).toEqual(['rule', 'rule', 'code_context']);
  });

  it('a tool result that repeats a map row is not added twice', () => {
    const sel = selectCandidates([locked, plain], run(['memos'], [], [{ text: 'Retries use exponential backoff with a max of 3 attempts.', score: 0.9 }]), []);
    expect(sel.rows).toEqual([locked, plain]);
    expect(sel.droppedDuplicates).toBe(1);
  });

  it('a raw turn that contains a map fact counts as a duplicate (tools return the whole prompt)', () => {
    const fact = row(5, 'Final decision: computeBackoff in src/payment.ts uses fixed 5s/15s/45s delays.');
    const sel = selectCandidates([fact], run(['memos'], [], [{ text: 'Final decision: computeBackoff in src/payment.ts uses fixed 5s/15s/45s delays. Reply only with: Noted.' }]), []);
    expect(sel.rows).toEqual([fact]);
    expect(sel.droppedDuplicates).toBe(1);
  });

  it('a raw turn holding a replaced decision is dropped; one holding the new decision is not', () => {
    const now = row(6, 'Final decision: computeBackoff in src/payment.ts now uses exponential 2s/4s/8s delays with jitter.');
    const old = row(7, 'Final decision: computeBackoff in src/payment.ts uses fixed 5s/15s/45s delays.', { active: 0, superseded_by: 6 });
    const oldTurn = 'Final decision: computeBackoff in src/payment.ts uses fixed 5s/15s/45s delays. Reply only with: Noted.';
    const sel = selectCandidates([now], run(['memos'], [], [{ text: oldTurn }, { text: 'Why are the computeBackoff delays exponential now? They use jitter too.' }]), [old]);
    expect(sel.droppedReplaced).toBe(1);
    expect(sel.rows.map((r) => r.content)).toEqual([now.content, 'Why are the computeBackoff delays exponential now? They use jitter too.']);
  });

  it('drops a tool result that brings back a replaced decision', () => {
    const sel = selectCandidates([locked, plain], run(['memos', 'openclaw'], [], [{ text: 'Retries use linear backoff with a max of 5 attempts.' }]), [replaced]);
    expect(sel.droppedReplaced).toBe(1);
    expect(sel.rows.some((r) => r.content.includes('linear backoff'))).toBe(false);
  });

  it('drops a tool result that repeats a locked decision', () => {
    const sel = selectCandidates([locked], run(['memos', 'openclaw'], [], [{ text: 'Locked requirement: processRetry in src/payment.ts is the only entry point for retries.' }]), []);
    expect(sel.droppedDuplicates).toBe(1);
    expect(sel.rows).toEqual([locked]);
  });
});

describe('ranker tool pass', () => {
  const locked = row(1, 'Locked requirement: processRetry in src/payment.ts is the only entry point for retries.', { locked: 1, confidence: 0.95 });

  it('a MemOS / OpenClaw line must share words with the prompt, like our own facts (MemOS scores are relative)', () => {
    const prompt = 'what is the capital of France';
    const memos = row(-1, 'verifyToken failed for users in other time zones.', { kind: 'memos_recall', confidence: 1 });
    const openclaw = row(-2, 'Gateway resets happen when the TLS session is reused.', { kind: 'openclaw_recall', confidence: 1 });
    expect(rankAndAllocateBudget(prompt, [memos, openclaw], 'general').allocatedLines).toEqual([]);
    const related = row(-3, 'Last time processRetry crashed with ECONNRESET.', { kind: 'memos_recall', confidence: 0.8 });
    expect(rankAndAllocateBudget('fix the crash in processRetry', [related], 'bugfix').allocatedLines.map((l) => l.fact.id)).toEqual([-3]);
  });

  it('a code line is kept without shared words (it comes from code names in the prompt)', () => {
    const code = row(-4, 'computeBackoff is a function defined in src/payment.ts:2-2.', { kind: 'code_context', confidence: 0.75 });
    const r = rankAndAllocateBudget('make the delays configurable', [code], 'feature');
    expect(r.allocatedLines.map((l) => l.fact.id)).toEqual([-4]);
  });

  it('never pushes a locked decision out, and keeps it on top', () => {
    const tools = Array.from({ length: 12 }, (_, i) =>
      row(-(i + 1), `processRetry note ${i}: retry jitter idea number ${i}.`, { kind: 'memos_recall', confidence: 0.99 })
    );
    const r = rankAndAllocateBudget('add jitter to processRetry in src/payment.ts', [locked, ...tools], 'feature');
    expect(r.allocatedLines.length).toBeLessThanOrEqual(10);
    expect(r.allocatedLines[0].fact.id).toBe(1);
  });

  it('tags tool lines by source', () => {
    expect(formatFactTag(row(-1, 'x', { kind: 'memos_recall', key: 'memos-abc' }))).toBe('@memos:memos-abc');
    expect(formatFactTag(row(-2, 'x', { kind: 'openclaw_recall', key: 'openclaw-abc' }))).toBe('@openclaw:openclaw-abc');
    expect(formatFactTag(row(-3, 'x', { kind: 'code_context', key: 'codebase-abc' }))).toBe('@code:codebase-abc');
  });
});

describe('prepareEnhancement with sources', () => {
  async function setup() {
    const store = await openStore(':memory:');
    ingestSessionFacts(store, {
      projectRoot: '/workspaces/v1a',
      prompt: 'Locked requirement: processRetry in src/payment.ts is the only entry point for retries.',
      assistantResponse: '',
    });
    return store;
  }
  const PROMPT = 'add jitter to processRetry in src/payment.ts';
  const opts = { skipLlmRewrite: true, recordDelivery: false } as const;

  it('all tools failing gives exactly the V1 result', async () => {
    const store = await setup();
    const ctx = { workspacePath: '/workspaces/v1a', store, sessionId: 's-fail' };
    const v1 = await preparePromptEnhancementWithSections(PROMPT, ctx, opts);
    const withTools = await preparePromptEnhancementWithSections(PROMPT, ctx, {
      ...opts,
      sources: [driver('memos', 'throw'), driver('openclaw', 'unavailable'), driver('codebase', 'hang')],
    });
    const strip = (r: typeof v1) => ({ ...r, processingTimeMs: 0 });
    expect(strip(withTools)).toEqual(strip(v1));
    expect(v1.isEnhanced).toBe(true);
  });

  it('a MemOS result reaches the prompt next to the locked decision', async () => {
    const store = await setup();
    const r = await preparePromptEnhancementWithSections(PROMPT, { workspacePath: '/workspaces/v1a', store, sessionId: 's-ok' }, {
      ...opts,
      sources: [
        driver('memos', 'ok', [{ text: 'Last time processRetry crashed with ECONNRESET from the payment gateway.', score: 0.8 }]),
        driver('openclaw', 'ok', []),
      ],
    });
    expect(r.isEnhanced).toBe(true);
    expect(r.enhancedPrompt).toContain('only entry point for retries');
    expect(r.enhancedPrompt).toContain('ECONNRESET');
    expect(r.injectedContextTags.some((t) => t.startsWith('@memos:'))).toBe(true);

    // The writer AI gets the tool line too (same ref → fact path auto.ts uses), not only the locked rule.
    const writerFacts = (r.facts ?? []).map((f, i) =>
      buildProjectMemoryGuidanceFactV1(buildProjectMemoryRefV1(f), `f${i}`, { key: 'k', value: f.content })
    );
    expect(writerFacts.every(Boolean)).toBe(true);
    expect(writerFacts.map((f) => f!.evidence?.value).join('\n')).toContain('ECONNRESET');
    expect(r.facts!.some((f) => f.id < 0 && f.kind === 'memos_recall')).toBe(true);
  });
});
