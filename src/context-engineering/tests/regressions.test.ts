/**
 * Regression suite for defects found by the manual E2E run (2026-10-30):
 *  - R1: an unrelated rule on the same file superseded a locked rule
 *  - R2: "Final decision" inside a goal prompt was stored as intent, so old and
 *        new values were both injected
 *  - R3: a changed decision with the same leading words superseded itself,
 *        leaving zero active rules
 *  - R4: facts with no relation to the prompt were injected ("hello")
 *  - R5: the public result carried an 8th field (`sections`)
 *  - R6: timeoutMs was not enforced across synchronous work
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as packageEntry from '../index.js';
import {
  preparePromptEnhancement,
  preparePromptEnhancementWithSections,
  extractFacts,
  ingestSessionFacts,
  getActiveContextMemory,
  getContextMemoryHistory,
  normalizeProjectId,
  classifyTask,
  rankAndAllocateBudget,
  openStore,
  closeStore,
  type Store,
  type WorkspaceContext,
} from '../index.js';

describe('Regressions from manual E2E', () => {
  let store: Store;
  const projectRoot = '/workspaces/regression-project';
  const canonicalId = normalizeProjectId(projectRoot);

  const ingest = (assistantResponse: string, prompt = 'continue') =>
    ingestSessionFacts(store, { projectRoot: canonicalId, prompt, assistantResponse });
  const activeContents = () => getActiveContextMemory(store, canonicalId).map((r) => r.content);
  const ctx = (sessionId: string, extra: Partial<WorkspaceContext> = {}): WorkspaceContext =>
    ({ workspacePath: projectRoot, store, sessionId, ...extra }) as WorkspaceContext;

  beforeEach(async () => {
    store = await openStore(':memory:');
  });

  afterEach(() => {
    try {
      closeStore(store);
    } catch {
      // ignore
    }
  });

  describe('R1: superseding needs the same topic, not just the same file', () => {
    it('keeps rules about different symbols in the same file both active', () => {
      ingest('Locked requirement: processRetry in src/payment.ts is the only entry point for retries.');
      const result = ingest('Final decision: computeBackoff in src/payment.ts now uses exponential 2s/4s/8s.');

      expect(result.supersededCount).toBe(0);
      expect(activeContents()).toEqual(
        expect.arrayContaining([
          expect.stringContaining('processRetry'),
          expect.stringContaining('computeBackoff'),
        ])
      );
    });

    it('supersedes a rule when a new rule names the same symbol', () => {
      ingest('Locked requirement: computeBackoff uses fixed 5s/15s/45s delays.');
      const result = ingest('Final decision: switch computeBackoff to exponential 2s/4s/8s delays.');

      expect(result.supersededCount).toBe(1);
      expect(activeContents().join('\n')).not.toContain('5s/15s/45s');
      expect(activeContents().join('\n')).toContain('2s/4s/8s');
    });

    it('never lets an unlocked rule supersede a locked one', () => {
      ingest('Locked requirement: computeBackoff uses fixed 5s/15s/45s delays.');
      const result = ingest('The computeBackoff retry config could use jitter.');

      expect(result.supersededCount).toBe(0);
      expect(activeContents().join('\n')).toContain('5s/15s/45s');
    });

    it('keeps two locked decisions that merely mention the same function', () => {
      ingestSessionFacts(store, {
        projectRoot: canonicalId,
        prompt: 'lock the design: PaymentRetryService.processRetry stays the only entry point for retries',
        assistantResponse: '',
      });
      const result = ingestSessionFacts(store, {
        projectRoot: canonicalId,
        prompt: 'lock the design: applyIdempotencyKey stays inside processRetry, not in checkout.ts',
        assistantResponse: '',
      });

      expect(result.supersededCount).toBe(0);
      expect(activeContents()).toEqual(
        expect.arrayContaining([expect.stringContaining('only entry point'), expect.stringContaining('applyIdempotencyKey')])
      );
    });
  });

  describe('R2: a decision inside a goal prompt is stored as a rule', () => {
    it('splits "I want X. Final decision: Y" into one intent and one rule', () => {
      const facts = extractFacts({
        projectRoot: canonicalId,
        prompt: 'I want no surprises on retry. Final decision: computeBackoff in src/payment.ts uses fixed 5s/15s/45s.',
        assistantResponse: '',
      });

      expect(facts.filter((f) => f.kind === 'intent').map((f) => f.content)).toEqual(['I want no surprises on retry.']);
      expect(facts.filter((f) => f.kind === 'rule').map((f) => f.content)).toEqual([
        'Final decision: computeBackoff in src/payment.ts uses fixed 5s/15s/45s.',
      ]);
    });

    it('injects only the newest value after the decision changes', async () => {
      ingestSessionFacts(store, {
        projectRoot: canonicalId,
        prompt: 'I want no surprises on retry. Final decision: computeBackoff in src/payment.ts uses fixed 5s/15s/45s.',
        assistantResponse: '',
      });
      ingest('Final decision: computeBackoff in src/payment.ts now uses exponential 2s/4s/8s.');

      const result = await preparePromptEnhancement('fix the retry crash in computeBackoff', ctx('r2'));

      expect(result.isEnhanced).toBe(true);
      expect(result.enhancedPrompt).toContain('2s/4s/8s');
      expect(result.enhancedPrompt).not.toContain('5s/15s/45s');
    });
  });

  describe('R3: a changed decision with the same leading words', () => {
    it('keeps the new decision active and the old one in history', () => {
      ingest('Final decision: computeBackoff in src/payment.ts uses fixed 5s/15s/45s.');
      ingest('Final decision: computeBackoff in src/payment.ts now uses exponential 2s/4s/8s.');

      expect(activeContents()).toEqual(['Final decision: computeBackoff in src/payment.ts now uses exponential 2s/4s/8s.']);

      const history = getContextMemoryHistory(store, canonicalId);
      expect(history).toHaveLength(2);
      const oldRow = history.find((h) => h.content.includes('5s/15s/45s'));
      const newRow = history.find((h) => h.content.includes('2s/4s/8s'));
      expect(oldRow?.superseded_by).toBe(newRow?.id);
      expect(newRow?.superseded_by).toBeNull();
    });

    it('does not create a duplicate when the same changed decision is captured twice', () => {
      ingest('Final decision: computeBackoff in src/payment.ts uses fixed 5s/15s/45s.');
      ingest('Final decision: computeBackoff in src/payment.ts now uses exponential 2s/4s/8s.');
      ingest('Final decision: computeBackoff in src/payment.ts now uses exponential 2s/4s/8s.');

      expect(activeContents()).toHaveLength(1);
      expect(getContextMemoryHistory(store, canonicalId)).toHaveLength(2);
    });
  });

  describe('R4: only facts related to the prompt are injected', () => {
    beforeEach(() => {
      ingest('Locked requirement: processRetry in src/payment.ts is the only entry point for retries.');
    });

    it('leaves an unrelated prompt untouched', async () => {
      const result = await preparePromptEnhancement('hello', ctx('r4a'));
      expect(result.isEnhanced).toBe(false);
      expect(result.enhancedPrompt).toBe('hello');
      expect(result.injectedContextTags).toEqual([]);
    });

    it('does not enhance with workspace lines alone', async () => {
      const result = await preparePromptEnhancement('hello', ctx('r4b', { activeFilePath: 'src/ui/button.tsx', gitBranch: 'main' }));
      expect(result.isEnhanced).toBe(false);
      expect(result.enhancedPrompt).toBe('hello');
    });

    it('does not attach open-file facts to chat like "hello"', async () => {
      const result = await preparePromptEnhancement('hello', ctx('r4d', { activeFilePath: 'src/payment.ts' }));
      expect(result.isEnhanced).toBe(false);
      expect(result.enhancedPrompt).toBe('hello');
    });

    it('attaches open-file facts to a task that shares no words with them', async () => {
      const result = await preparePromptEnhancement('fix this bug', ctx('r4e', { activeFilePath: 'src/payment.ts' }));
      expect(result.isEnhanced).toBe(true);
      expect(result.enhancedPrompt).toContain('only entry point');
    });

    it('does not treat a shared file extension as relevance ("discount.ts" vs "payment.ts")', async () => {
      const result = await preparePromptEnhancement('add applyCoupon to discount.ts for the summer sale', ctx('r4f'));
      expect(result.isEnhanced).toBe(false);
    });

    it('does not treat a shared src/ folder as relevance', async () => {
      const result = await preparePromptEnhancement(
        'Final decision: getPool in src/db.ts now allows a maximum of 25 connections.',
        ctx('r4g')
      );
      expect(result.isEnhanced).toBe(false);
    });

    it('still enhances a related prompt', async () => {
      const result = await preparePromptEnhancement('fix the retries in processRetry', ctx('r4c'));
      expect(result.isEnhanced).toBe(true);
      expect(result.enhancedPrompt).toContain('only entry point');
    });
  });

  describe('R5: the public result is exactly the 7-field contract', () => {
    it('returns no extra fields; the CLI variant still exposes sections', async () => {
      ingest('Locked requirement: processRetry in src/payment.ts is the only entry point for retries.');

      const result = await preparePromptEnhancement('fix the retries in processRetry', ctx('r5a'));
      expect(Object.keys(result).sort()).toEqual([
        'contextTokenEstimate',
        'enhancedPrompt',
        'injectedContextTags',
        'isEnhanced',
        'processingTimeMs',
        'stage',
        'stageConfidence',
      ]);

      const detailed = await preparePromptEnhancementWithSections('fix the retries in processRetry', ctx('r5b'));
      expect(detailed.sections?.length).toBeGreaterThan(0);
    });
  });

  describe('R6: timeoutMs covers synchronous work', () => {
    it('falls back and records nothing when the pipeline overruns the deadline', async () => {
      ingest('Locked requirement: processRetry in src/payment.ts is the only entry point for retries.');

      // Make every query slow; sql.js is synchronous, so the timer alone cannot interrupt it.
      const exec = store.db.exec.bind(store.db);
      store.db.exec = ((...args: Parameters<typeof exec>) => {
        const until = performance.now() + 20;
        while (performance.now() < until) {
          // busy-wait
        }
        return exec(...args);
      }) as typeof store.db.exec;

      const result = await preparePromptEnhancement('fix the retries in processRetry', ctx('r6'), { timeoutMs: 5 });

      store.db.exec = exec;
      expect(result.isEnhanced).toBe(false);
      expect(result.enhancedPrompt).toBe('fix the retries in processRetry');
      const delivered = store.db.exec('SELECT COUNT(*) FROM delivered_items')[0]?.values[0]?.[0];
      expect(delivered).toBe(0);
    });
  });

  describe('R9: "already delivered" dedup is per session', () => {
    it('shows a fact once per session and again in the next session', async () => {
      ingest('Locked requirement: processRetry in src/payment.ts is the only entry point for retries.');
      const prompt = 'fix the retries in processRetry';

      expect((await preparePromptEnhancement(prompt, ctx('session-a'))).isEnhanced).toBe(true);
      expect((await preparePromptEnhancement(prompt, ctx('session-a'))).isEnhanced).toBe(false);
      const next = await preparePromptEnhancement(prompt, ctx('session-b'));
      expect(next.isEnhanced).toBe(true);
      expect(next.enhancedPrompt).toContain('only entry point');
    });
  });

  describe('R10: F3 calls pass the server desktop gate (device token + X-Device-Id)', () => {
    const f3Headers = async (extra: Partial<WorkspaceContext>) => {
      ingest('Locked requirement: processRetry in src/payment.ts is the only entry point for retries.');
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ target: 'pro', decisionId: 'd1' }), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      try {
        await preparePromptEnhancement('fix the retries in processRetry', ctx(`r10-${Math.random()}`, extra), { delegateToLlm: true });
        await new Promise((r) => setTimeout(r, 20)); // /resource-result is fire-and-forget
      } finally {
        vi.unstubAllGlobals();
      }
      const headersFor = (path: string) =>
        (fetchMock.mock.calls.find(([url]) => String(url).endsWith(path))?.[1] as RequestInit | undefined)?.headers as Record<string, string> | undefined;
      return { resource: headersFor('/f3/v1/resource'), result: headersFor('/f3/v1/resource-result') };
    };

    it('sends Bearer <deviceToken> and X-Device-Id on /resource and /resource-result', async () => {
      const { resource, result } = await f3Headers({ deviceToken: 'npd_xyz', deviceId: 'dev-1' });
      for (const headers of [resource, result]) {
        expect(headers?.Authorization).toBe('Bearer npd_xyz');
        expect(headers?.['X-Device-Id']).toBe('dev-1');
      }
    });

    it('omits X-Device-Id when the desktop gives no device id', async () => {
      const { resource } = await f3Headers({ deviceToken: 'npd_xyz' });
      expect(resource?.Authorization).toBe('Bearer npd_xyz');
      expect(resource?.['X-Device-Id']).toBeUndefined();
    });
  });

  describe('R11: F3 and cloud URLs are configurable (per call > env > parseos.tech)', () => {
    const urlsFor = async (options: Record<string, unknown>, env: Record<string, string> = {}) => {
      ingest('Locked requirement: processRetry in src/payment.ts is the only entry point for retries.');
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ target: 'pro', decisionId: 'd1' }), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      try {
        await preparePromptEnhancement('fix the retries in processRetry', ctx(`r11-${Math.random()}`, { deviceToken: 'npd_x', deviceId: 'dev-1' }), {
          delegateToLlm: true,
          ...options,
        });
      } finally {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
      }
      return fetchMock.mock.calls.map(([url]) => String(url));
    };

    it('uses parseos.tech by default', async () => {
      const urls = await urlsFor({});
      expect(urls).toContain('https://parseos.tech/f3/v1/resource');
      expect(urls).toContain('https://parseos.tech/v1/chat/completions');
    });

    it('uses the env variables when no per-call value is given', async () => {
      const urls = await urlsFor({}, { NEXPATH_F3_URL: 'http://f3.env', NEXPATH_CLOUD_PRO_URL: 'http://cloud.env/v1/chat/completions' });
      expect(urls).toContain('http://f3.env/f3/v1/resource');
      expect(urls).toContain('http://cloud.env/v1/chat/completions');
    });

    it('per-call values win over the env variables', async () => {
      const urls = await urlsFor(
        { f3BaseUrl: 'http://desktop.base', cloudProUrl: 'http://desktop.base/v1/chat/completions' },
        { NEXPATH_F3_URL: 'http://f3.env', NEXPATH_CLOUD_PRO_URL: 'http://cloud.env/v1/chat/completions' },
      );
      expect(urls).toContain('http://desktop.base/f3/v1/resource');
      expect(urls).toContain('http://desktop.base/v1/chat/completions');
      expect(urls.some((u) => u.includes('.env'))).toBe(false);
    });
  });

  describe('R12: the LLM step is cancelled on time-out or abort, never paid-and-dropped', () => {
    type Call = { url: string; signal?: AbortSignal };
    // Every LLM request hangs until it is aborted, like a slow provider.
    const hangingFetch = (calls: Call[]) =>
      vi.fn((url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), signal: init?.signal ?? undefined });
        if (String(url).endsWith('/f3/v1/resource-result')) return Promise.resolve(new Response('{"status":"ok"}'));
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      });
    const proDecisionClient = { getResourceDecision: async () => ({ decisionId: 'd', target: 'pro', reason: 'x', lanDevice: null, pro: { model: 'm' } }), reportResult: () => {} };
    const localDecisionClient = {
      getResourceDecision: async () => ({ decisionId: 'd', target: 'local', reason: 'x', lanDevice: { deviceId: 'lan', tier: 't', model: 'm', endpoint: 'e' }, pro: null }),
      reportResult: () => {},
    };

    beforeEach(() => {
      ingest('Locked requirement: processRetry in src/payment.ts is the only entry point for retries.');
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('V1 (2.5s): a slow cloud call is cancelled and the non-LLM enhanced prompt comes back in time', async () => {
      const calls: Call[] = [];
      vi.stubGlobal('fetch', hangingFetch(calls));
      const t0 = performance.now();
      const r = await preparePromptEnhancement('fix the retries in processRetry', ctx('r12a', { deviceToken: 'npd_x' }), { f3Client: proDecisionClient });
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(2500);
      expect(r.isEnhanced).toBe(true);
      expect(r.enhancedPrompt).toContain('only entry point');
      const cloud = calls.find((c) => c.url.endsWith('/v1/chat/completions'));
      expect(cloud?.signal?.aborted).toBe(true);
    }, 10_000);

    it('a caller cancel during the cloud call stops it at once and returns the original prompt', async () => {
      const calls: Call[] = [];
      vi.stubGlobal('fetch', hangingFetch(calls));
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 100);
      const t0 = performance.now();
      const r = await preparePromptEnhancement('fix the retries in processRetry', ctx('r12b', { deviceToken: 'npd_x' }), {
        f3Client: proDecisionClient,
        signal: controller.signal,
      });

      expect(performance.now() - t0).toBeLessThan(400);
      expect(r.isEnhanced).toBe(false);
      expect(r.enhancedPrompt).toBe('fix the retries in processRetry');
      await new Promise((res) => setTimeout(res, 50));
      expect(calls.filter((c) => c.url.endsWith('/v1/chat/completions'))).toHaveLength(1);
      expect(calls[0].signal?.aborted).toBe(true);
    }, 10_000);

    it('a cancelled local call does not fall back to the cloud', async () => {
      const calls: Call[] = [];
      vi.stubGlobal('fetch', hangingFetch(calls));
      await preparePromptEnhancement('fix the retries in processRetry', ctx('r12c', { deviceToken: 'npd_x' }), { f3Client: localDecisionClient });
      await new Promise((res) => setTimeout(res, 50));

      expect(calls.some((c) => c.url.includes('127.0.0.1'))).toBe(true);
      expect(calls.some((c) => c.url.endsWith('parseos.tech/v1/chat/completions'))).toBe(false);
    }, 10_000);

    it('writer version: a longer timeoutMs lets the LLM rewrite finish', async () => {
      vi.stubGlobal('fetch', vi.fn(async (url: string | URL) =>
        String(url).endsWith('/v1/chat/completions')
          ? new Promise<Response>((res) => setTimeout(() => res(new Response(JSON.stringify({ choices: [{ message: { content: 'Rewritten prompt.' } }] }))), 300))
          : new Response('{"status":"ok"}'),
      ));
      const r = await preparePromptEnhancement('fix the retries in processRetry', ctx('r12d', { deviceToken: 'npd_x' }), {
        f3Client: proDecisionClient,
        timeoutMs: 15000,
      });
      expect(r.isEnhanced).toBe(true);
      expect(r.enhancedPrompt).toBe('Rewritten prompt.');
    }, 10_000);
  });

  describe('R13: long markdown replies do not become junk memory', () => {
    // Shaped like the facts found in manual testing (2026-10-31): markdown bullets, bold,
    // code blocks hard-wrapped mid-sentence, tables, test tallies and plain explanations.
    const junkReply = [
      'Here is what changed:',
      '',
      '- **Point 1:** the lock is treated as stale after 30 seconds, and every save writes the whole database file (`src/store/db.ts`).',
      '- This is about 10 lines. Afterwards F3 stops returning 401 and can choose local or cloud.',
      '',
      '**Before you test in Claude Code,** your global `nexpath` must include the fixes.',
      '',
      '```',
      'Hi Ved,',
      '- Decide on the LLM timeout. After change 4, the LLM gets only what is left of',
      'the 2.5s, so the rewrite will rarely finish. You must always pass sessionId.',
      '```',
      '',
      '| File | Purpose |',
      '|---|---|',
      '| `run-check.mjs` | Runs all 40 prompts; the only entry point for the check |',
      '',
      'On the first run with the API, 18 of 26 checks failed.',
    ].join('\n');

    it('stores nothing from explanations, code blocks, tables or test tallies', () => {
      expect(extractFacts({ projectRoot: canonicalId, prompt: 'what changed?', assistantResponse: junkReply })).toEqual([]);
    });

    it('still keeps a real decision and a real error, without markdown and with wrapped lines joined', () => {
      const facts = extractFacts({
        projectRoot: canonicalId,
        prompt: 'continue',
        assistantResponse: [
          junkReply,
          '',
          '- **Final decision:** `computeBackoff` uses fixed 5s/15s/45s delays.',
          '',
          'Error: processRetry crashed with ECONNRESET',
          'because the gateway socket was reused.',
        ].join('\n'),
      });
      expect(facts.map((f) => [f.kind, f.content])).toEqual([
        ['rule', 'Final decision: computeBackoff uses fixed 5s/15s/45s delays.'],
        ['failure', 'Error: processRetry crashed with ECONNRESET because the gateway socket was reused.'],
      ]);
    });
  });

  describe('R14: task type is not fooled by "fixed" as an adjective', () => {
    it('classifies a rework that mentions "fixed intervals" as a refactor, not a bug fix', () => {
      expect(classifyTask('rework processRetry: make the fixed backoff intervals configurable').taskType).toBe('refactor');
      expect(classifyTask('fix the retry crash in processRetry').taskType).toBe('bugfix');
    });
  });

  describe('R15: unused budget is backfilled with relevant locked decisions', () => {
    const rows = (n: number, locked: boolean) =>
      Array.from({ length: n }, (_, i) => ({
        id: i + 1, project_root: canonicalId, kind: 'rule', key: `rule-${locked ? 'l' : 'o'}-${i}`,
        content: `${locked ? 'Locked requirement' : 'Note'}: payment retry decision number ${i}.`,
        verbatim: null, identities: [], staleness: null, locked: locked ? 1 : 0, confidence: locked ? 0.95 : 0.6,
        superseded_by: null, active: 1, created_at: Date.now(), updated_at: Date.now(),
      })) as unknown as Parameters<typeof rankAndAllocateBudget>[1];

    it('keeps every relevant locked decision when the 10-line budget has room', () => {
      const r = rankAndAllocateBudget('rework the payment retry', rows(6, true), 'refactor', { maxTotalLines: 10 });
      expect(r.allocatedLines).toHaveLength(6);
    });

    it('does not backfill unlocked notes past the cap, and never exceeds 10 lines', () => {
      expect(rankAndAllocateBudget('rework the payment retry', rows(6, false), 'refactor', { maxTotalLines: 10 }).allocatedLines).toHaveLength(4);
      expect(rankAndAllocateBudget('rework the payment retry', rows(25, true), 'refactor', { maxTotalLines: 10 }).allocatedLines).toHaveLength(10);
    });
  });

  describe('R7: desktop runtime can open the shared store through the package entry', () => {
    it('exports openStore, closeStore from nexpath-cli/context-engineering', () => {
      expect(typeof packageEntry.openStore).toBe('function');
      expect(typeof packageEntry.closeStore).toBe('function');
    });
  });

  describe('R8: ingestion and retrieval agree on the project path', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'f1-path-'));
      mkdirSync(join(dir, 'real-project'));
      symlinkSync(join(dir, 'real-project'), join(dir, 'linked-project'));
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it.each([
      ['a trailing slash', (d: string) => join(d, 'real-project') + '/'],
      ['a symlink', (d: string) => join(d, 'linked-project')],
    ])('finds facts ingested through %s when retrieving by the real path', async (_label, ingestPath) => {
      ingestSessionFacts(store, {
        projectRoot: ingestPath(dir),
        prompt: 'continue',
        assistantResponse: 'Locked requirement: processRetry in src/payment.ts is the only entry point for retries.',
      });

      const result = await preparePromptEnhancement('fix the retries in processRetry', {
        workspacePath: join(dir, 'real-project'),
        store,
        sessionId: 'r8',
      } as WorkspaceContext);

      expect(result.isEnhanced).toBe(true);
      expect(result.enhancedPrompt).toContain('only entry point');
    });
  });
});
