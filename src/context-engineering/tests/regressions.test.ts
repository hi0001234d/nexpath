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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
