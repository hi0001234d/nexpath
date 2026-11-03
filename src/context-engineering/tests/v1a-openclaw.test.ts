/**
 * v1(a) Phase 5 — OpenClaw driver: months-old search only, never on the prompt path.
 *
 * The fake runner returns the JSON shape the real CLI returned in Phase 0 (v1(a).md §9.5).
 * A real run is opt-in: NEXPATH_OPENCLAW_E2E=1 (needs `openclaw` on PATH; ~1 minute).
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenClawDriver, agentId, parseSearch, isOpenClawInstalled, nodeVersionOkForOpenClaw, satisfiesNodeRange, isMissingEmbeddingKeyError, OPENCLAW_DEFAULT_VERSION, OPENCLAW_DEFAULT_NODE_RANGE, type OpenClawRunner } from '../sources/openclaw-driver.js';

const SEARCH_JSON = JSON.stringify({
  results: [
    {
      path: 'memory/2026-07-01-session-ab12cd34.md',
      startLine: 3,
      endLine: 4,
      score: 0.91,
      snippet: '- locked rule: processRetry is the only retry entry point.\n- failure: processRetry crashed with ECONNRESET.',
      provenance: { observedAt: 1782900000000 },
    },
    { path: 'memory/2026-07-02.md', startLine: 1, score: 0.1, snippet: 'weak' },
  ],
});

function fakeRunner() {
  const calls: { args: string[]; env: Record<string, string> }[] = [];
  const run: OpenClawRunner = async (args, env) => {
    calls.push({ args, env });
    if (args[0] === 'memory' && args[1] === 'search') return `[state] noise line\n${SEARCH_JSON}\n[state] done`;
    return '{}';
  };
  return { run, calls };
}

function queue() {
  const jobs: (() => Promise<void>)[] = [];
  return { schedule: (job: () => Promise<void>) => jobs.push(job), drain: async () => { while (jobs.length) await jobs.shift()!(); }, jobs };
}

const homes: string[] = [];
const newHome = () => {
  const h = mkdtempSync(join(tmpdir(), 'nx-oc-'));
  homes.push(h);
  return h;
};

describe('Node 22 decision (2026-11-03): OpenClaw 2026.9.2 and its own Node range', () => {
  it('reads engines ranges like OpenClaw writes them', () => {
    expect(satisfiesNodeRange('22.23.2', '>=22.22.3 <23 || >=24.15.0 <25 || >=25.9.0')).toBe(true);
    expect(satisfiesNodeRange('22.22.2', '>=22.22.3 <23 || >=24.15.0 <25 || >=25.9.0')).toBe(false);
    expect(satisfiesNodeRange('23.4.0', '>=22.22.3 <23 || >=24.15.0 <25 || >=25.9.0')).toBe(false);
    expect(satisfiesNodeRange('24.22.2', '>=22.22.3 <23 || >=24.15.0 <25 || >=25.9.0')).toBe(true);
    expect(satisfiesNodeRange('22.23.2', '>=24.22.1 <25 || >=26.12.1')).toBe(false); // OpenClaw 2026.10.9
    expect(satisfiesNodeRange('24.22.2', '>=24.22.1 <25 || >=26.12.1')).toBe(true);
    expect(satisfiesNodeRange('20.0.0', '>=18')).toBe(true);
    expect(satisfiesNodeRange('20.0.0', 'nonsense')).toBe(false);
  });

  it('defaults to OpenClaw 2026.9.2, which runs on Node 22', () => {
    expect(OPENCLAW_DEFAULT_VERSION).toBe('2026.9.2');
    expect(nodeVersionOkForOpenClaw('22.23.2', OPENCLAW_DEFAULT_NODE_RANGE)).toBe(true);
    expect(nodeVersionOkForOpenClaw('22.23.2', '>=24.22.1 <25 || >=26.12.1')).toBe(false); // a newer OpenClaw on Node 22: unavailable
  });

  it('2026.9.2 without an embedding key: its keyword index counts as built (no retry before every search)', async () => {
    expect(isMissingEmbeddingKeyError(new Error('Memory index failed (nx-1): No API key found for provider "openai". | missing-provider-auth'))).toBe(true);
    expect(isMissingEmbeddingKeyError(new Error('ENOENT'))).toBe(false);
    const calls: string[] = [];
    const run: OpenClawRunner = async (args) => {
      calls.push(args.slice(0, 2).join(' '));
      if (args[1] === 'index') throw new Error('Memory index failed: No API key found for provider "openai" | missing-provider-auth');
      if (args[1] === 'search') return SEARCH_JSON;
      return '{}';
    };
    const home = newHome();
    const driver = new OpenClawDriver({ home, run, installed: () => true });
    const decisions = [{ kind: 'rule', content: 'Use processRetry for retries.', locked: false }];
    await driver.saveSessionDecisions({ projectRoot: '/repo/a', sessionId: 's', startedAt: Date.now(), decisions });
    await new Promise((r) => setTimeout(r, 0));
    expect(await driver.indexIfNeeded('/repo/a')).toBe(false); // marker already cleared by the scheduled index
    expect(calls.filter((c) => c === 'memory index')).toHaveLength(1);
  });

  it('any other index failure still counts as not indexed', async () => {
    const run: OpenClawRunner = async (args) => {
      if (args[1] === 'index') throw new Error('database is locked');
      return '{}';
    };
    const driver = new OpenClawDriver({ home: newHome(), run, installed: () => true, schedule: () => {} });
    await driver.saveSessionDecisions({ projectRoot: '/repo/a', sessionId: 's', startedAt: Date.now(), decisions: [{ kind: 'rule', content: 'x y z w v', locked: false }] });
    await expect(driver.indexIfNeeded('/repo/a')).rejects.toThrow('database is locked');
  });
});

describe('parseSearch', () => {
  it('reads OpenClaw JSON (with log noise around it), keeps strong matches, one candidate per decision', () => {
    expect(parseSearch(`[state] x\n${SEARCH_JSON}`)).toEqual([
      { source: 'openclaw', ref: 'memory/2026-07-01-session-ab12cd34.md:3', text: 'processRetry is the only retry entry point.', score: 0.91, observedAt: 1782900000000 },
      { source: 'openclaw', ref: 'memory/2026-07-01-session-ab12cd34.md:4', text: 'processRetry crashed with ECONNRESET.', score: 0.91, observedAt: 1782900000000 },
    ]);
    expect(parseSearch(JSON.stringify({ results: [{ path: 'm.md', score: 0.9, snippet: '# Decisions from the session of 2026-11-03T06:35:32.600Z\n\n- intent: build a checkout' }] })).map((c) => c.text)).toEqual(['build a checkout']);
    expect(parseSearch('not json')).toEqual([]);
  });
});

describe('OpenClawDriver', () => {
  it('never runs OpenClaw while the prompt waits: first prompt queues, next prompt gets the cached answer', async () => {
    const { run, calls } = fakeRunner();
    const q = queue();
    const driver = new OpenClawDriver({ home: newHome(), run, schedule: q.schedule, installed: () => true });
    const query = { prompt: 'add jitter to processRetry', projectRoot: '/repo/a' };

    expect(await driver.search(query)).toEqual([]);
    expect(calls).toEqual([]); // nothing ran yet
    expect(q.jobs).toHaveLength(1);
    expect(await driver.search(query)).toEqual([]); // same term already queued: no second job
    expect(q.jobs).toHaveLength(1);

    await q.drain();
    expect(calls.map((c) => c.args.slice(0, 2).join(' '))).toEqual(['agents add', 'memory search']);
    expect(calls[1].args).toContain('processRetry');
    expect(calls[1].env.OPENCLAW_STATE_DIR).toMatch(/state$/);

    const next = await driver.search(query);
    expect(next.map((c) => c.text)).toEqual(['processRetry is the only retry entry point.', 'processRetry crashed with ECONNRESET.']);
  });

  it('asks nothing when the gap detector found nothing missing in the prompt', async () => {
    const { run, calls } = fakeRunner();
    const q = queue();
    const driver = new OpenClawDriver({ home: newHome(), run, schedule: q.schedule, installed: () => true });
    expect(await driver.search({ prompt: 'fix processRetry in src/payment.ts', projectRoot: '/repo/a', hasGaps: false })).toEqual([]);
    await q.drain();
    expect(calls).toEqual([]);
  });

  it('asks nothing for a prompt without code names', async () => {
    const { run, calls } = fakeRunner();
    const q = queue();
    const driver = new OpenClawDriver({ home: newHome(), run, schedule: q.schedule, installed: () => true });
    expect(await driver.search({ prompt: 'make the page blue', projectRoot: '/repo/a' })).toEqual([]);
    expect(q.jobs).toHaveLength(0);
    expect(calls).toEqual([]);
  });

  it('saves a session\'s decisions to one file per session (written again, not appended) and indexes once', async () => {
    const { run, calls } = fakeRunner();
    const q = queue();
    const home = newHome();
    const driver = new OpenClawDriver({ home, run, schedule: q.schedule, installed: () => true });
    const session = {
      projectRoot: '/repo/a',
      sessionId: 'sess-1',
      startedAt: Date.UTC(2026, 10, 2, 9),
      decisions: [
        { kind: 'rule', content: 'processRetry in src/payment.ts is the only entry point for retries.', locked: true },
        { kind: 'failure', content: 'processRetry crashed with ECONNRESET.', locked: false },
      ],
    };
    expect(await driver.saveSessionDecisions(session)).toBe(true);
    expect(await driver.saveSessionDecisions(session)).toBe(true); // same session ends twice
    const dir = join(home, 'agents', agentId('/repo/a'), 'workspace', 'memory');
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^2026-11-02-session-[0-9a-f]{8}\.md$/);
    const text = readFileSync(join(dir, files[0]), 'utf8');
    expect(text).toContain('- locked rule: processRetry in src/payment.ts is the only entry point for retries.');
    expect(text).toContain('- failure: processRetry crashed with ECONNRESET.');
    expect(text).not.toMatch(/user:|agent:/); // no conversation, only decisions
    await q.drain();
    expect(calls.filter((c) => c.args[1] === 'index')).toHaveLength(1); // second job saw nothing new
  });

  it('a session without decisions writes nothing', async () => {
    const { run, calls } = fakeRunner();
    const home = newHome();
    const driver = new OpenClawDriver({ home, run, installed: () => true });
    expect(await driver.saveSessionDecisions({ projectRoot: '/repo/a', sessionId: 's', startedAt: 0, decisions: [] })).toBe(false);
    expect(calls).toEqual([]);
  });

  it('files saved just before the worker stopped are indexed before the next search', async () => {
    const { run, calls } = fakeRunner();
    const home = newHome();
    const dropped = (_job: () => Promise<void>) => {}; // worker closing: the index job never runs
    await new OpenClawDriver({ home, run, schedule: dropped, installed: () => true }).saveSessionDecisions({
      projectRoot: '/repo/a', sessionId: 's', startedAt: Date.now(), decisions: [{ kind: 'rule', content: 'Use processRetry for retries.', locked: false }],
    });
    const q = queue();
    const next = new OpenClawDriver({ home, run, schedule: q.schedule, installed: () => true });
    await next.search({ prompt: 'fix processRetry', projectRoot: '/repo/a' });
    await q.drain();
    expect(calls.map((c) => c.args[1])).toEqual(['add', 'index', 'search']);
  });

  it('keeps projects apart: one OpenClaw agent per project', () => {
    expect(agentId('/repo/a')).not.toBe(agentId('/repo/b'));
    expect(agentId('/repo/a')).toMatch(/^nx-[0-9a-f]{12}$/);
  });

  it('is unavailable when OpenClaw is not installed', async () => {
    const driver = new OpenClawDriver({ home: newHome(), installed: () => false });
    expect(await driver.available()).toBe(false);
  });
});

describe.runIf(process.env.NEXPATH_OPENCLAW_E2E === '1' && isOpenClawInstalled())('real OpenClaw', () => {
  it('saves a session\'s decisions, indexes, and answers the next prompt about the same code from cache', async () => {
    const home = newHome();
    const q = queue();
    const driver = new OpenClawDriver({ home, schedule: q.schedule });
    try {
      await driver.saveSessionDecisions({
        projectRoot: '/repo/e2e',
        sessionId: 's',
        startedAt: Date.now(),
        decisions: [{ kind: 'rule', content: 'processRetry in src/payment.ts is the only entry point for retries.', locked: true }],
      });
      await q.drain(); // agents add + memory index (~25 s)
      expect(await driver.search({ prompt: 'add jitter to processRetry', projectRoot: '/repo/e2e' })).toEqual([]);
      await q.drain(); // background search (~10–20 s)
      const t = Date.now();
      const found = await driver.search({ prompt: 'add jitter to processRetry', projectRoot: '/repo/e2e' });
      expect(Date.now() - t).toBeLessThan(50); // served from cache
      expect(found[0]?.text).toContain('processRetry');
    } finally {
      for (const h of homes.splice(0)) rmSync(h, { recursive: true, force: true });
    }
  }, 240_000);
});
