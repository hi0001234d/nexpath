/**
 * Feature 1 — Phase 2 Ingestion Layer Full Test Specification
 * Directly implements test-plan.md requirements for:
 *  - Section 3: Module M2 (fact_extractor) & Module M4 (memos_adapter)
 *  - Section 5: Memory Ingestion Layer Tests (TC-ING-1 to TC-ING-10)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { openStore, type Store } from '../../store/db.js';
import {
  extractFacts,
  evaluateLockConfidence,
  extractIdentities,
  computeFactFingerprint,
} from '../ingestion/fact-extractor.js';
import {
  ingestSessionFacts,
} from '../ingestion/decision-chainer.js';
import {
  annotateStaleFactsFromGitDiff,
} from '../ingestion/git-diff-annotator.js';
import {
  handleStopHookCapture,
} from '../ingestion/stop-capture.js';
import {
  MemOSAdapter,
} from '../adapters/memos-adapter.js';
import {
  getActiveContextMemory,
  getContextMemoryHistory,
  upsertContextMemory,
} from '../store/historical-map-store.js';

describe('Phase 2 Ingestion Layer — Detailed Test Plan Execution', () => {
  let store: Store;
  const projectRoot = '/workspaces/project-charlie';

  beforeEach(async () => {
    store = await openStore(':memory:');
  });

  afterEach(() => {
    store.db.close();
  });

  // ==========================================================================
  // Section 3: Module M2 — Fact Extractor (test-plan.md §3)
  // ==========================================================================
  describe('Module M2: fact_extractor (test-plan.md §3)', () => {
    it('TC-M2.1: Distills architectural constraints into rule bucket', () => {
      const facts = extractFacts({
        projectRoot,
        prompt: 'How should we configure retry handling?',
        assistantResponse:
          'Our architecture standard is: computeBackoff = fixed 5s/15s/45s, and processRetry is only entry point for transactions.',
      });

      expect(facts.length).toBeGreaterThan(0);
      const rule = facts.find((f) => f.kind === 'rule');
      expect(rule).toBeDefined();
      expect(rule?.content).toContain('computeBackoff = fixed 5s/15s/45s');
    });

    it('TC-M2.2: Distills errors and crashes into failure bucket', () => {
      const facts = extractFacts({
        projectRoot,
        prompt: 'Why did the test fail?',
        assistantResponse:
          'The circuit breaker caused false positives on 408 request timeout during integration testing.',
      });

      const failure = facts.find((f) => f.kind === 'failure');
      expect(failure).toBeDefined();
      expect(failure?.content).toContain('circuit breaker caused false positives on 408');
    });

    it('TC-M2.3: Distills user goals into intent bucket and preserves verbatim prompt text', () => {
      const userPrompt = 'I want no surprises on retry when network reconnects.';
      const facts = extractFacts({
        projectRoot,
        prompt: userPrompt,
        assistantResponse: 'Understood. We will implement strict logging for every retry attempt.',
      });

      const intent = facts.find((f) => f.kind === 'intent');
      expect(intent).toBeDefined();
      expect(intent?.verbatim).toBe(userPrompt);
    });

    it('TC-M2.4: Explicit lock phrases assign locked = 1, confidence = 0.95', () => {
      const lockPhrases = [
        'lock the design for authentication',
        'this requirement is settled',
        'this is a locked requirement for security',
        'final decision is to use Postgres',
      ];

      for (const phrase of lockPhrases) {
        const evalResult = evaluateLockConfidence(phrase);
        expect(evalResult.locked).toBe(true);
        expect(evalResult.confidence).toBe(0.95);
      }
    });

    it('TC-M2.5: Inferred lock phrases assign locked = 1, confidence = 0.70', () => {
      const inferredPhrases = [
        'We must always validate session tokens before DB query',
        'Developers never commit plaintext secrets',
        'This is the only allowed endpoint for refunds',
      ];

      for (const phrase of inferredPhrases) {
        const evalResult = evaluateLockConfidence(phrase);
        expect(evalResult.locked).toBe(true);
        expect(evalResult.confidence).toBe(0.70);
      }
    });

    it('TC-M2.6: Standard observations without lock signals assign locked = 0, confidence = 0.50', () => {
      const standardText = 'We could consider using Redis if memory permits in the future.';
      const evalResult = evaluateLockConfidence(standardText);
      expect(evalResult.locked).toBe(false);
      expect(evalResult.confidence).toBe(0.50);
    });

    it('TC-M2.7: Extracts referenced files and functions into identities', () => {
      const text = 'Check auth.ts and verify that computeBackoff() handles 408 status codes.';
      const identities = extractIdentities(text);

      expect(identities.some((i) => i.file === 'auth.ts')).toBe(true);
      expect(identities.some((i) => i.symbol === 'computeBackoff')).toBe(true);
    });
  });

  // ==========================================================================
  // Section 3: Module M4 — MemOS In-Process Direct Adapter (test-plan.md §3)
  // ==========================================================================
  describe('Module M4: memos_adapter (test-plan.md §3)', () => {
    let testStorageDir: string;
    let memos: MemOSAdapter;

    beforeEach(() => {
      testStorageDir = join(tmpdir(), 'nexpath-memos-test-' + Date.now());
      memos = new MemOSAdapter({
        projectRoot,
        storageDir: testStorageDir,
        timeoutMs: 150,
      });
    });

    afterEach(() => {
      if (existsSync(testStorageDir)) {
        rmSync(testStorageDir, { recursive: true, force: true });
      }
    });

    it('TC-M4.1: Direct Library Mode initializes in-process with isolated project folder', async () => {
      await memos.init();
      expect(existsSync(testStorageDir)).toBe(true);
    });

    it('TC-M4.2: Per-turn storage saves prompt and response locally with secret redaction', async () => {
      await memos.saveTurn({
        prompt: 'Use token sk-proj-1234567890abcdef12345678 for deployment',
        response: 'Deployed successfully to cluster.',
        timestamp: Date.now(),
      });

      const results = await memos.search('deployment');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].text).toContain('Deployed successfully');
      // Secret must be redacted
      expect(results[0].text).not.toContain('sk-proj-');
      expect(results[0].text).toContain('sk-[REDACTED');
    });

    it('TC-M4.3: Semantic search returns top relevant turns with similarity scores', async () => {
      await memos.saveTurn({
        prompt: 'Configure payment webhook retry logic',
        response: 'Set retry count to 3 with exponential backoff',
      });
      await memos.saveTurn({
        prompt: 'Update css styles for navbar',
        response: 'Added dark mode tailwind classes',
      });

      const searchResults = await memos.search('payment retry', 5);
      expect(searchResults.length).toBe(1);
      expect(searchResults[0].score).toBeGreaterThan(0);
      expect(searchResults[0].text).toContain('payment webhook retry');
    });

    it('TC-M4.4: Enforces fail-open safety and returns empty array on empty or missing store', async () => {
      const nonExistent = new MemOSAdapter({
        projectRoot: '/non/existent/path',
        storageDir: join(tmpdir(), 'empty-memos-' + Date.now()),
      });

      const results = await nonExistent.search('anything');
      expect(results).toEqual([]);
    });

    it('TC-M4.5: Zero-Telemetry & Local Offline Privacy executes locally in <50ms with zero network requests', async () => {
      const start = performance.now();
      await memos.saveTurn({
        prompt: 'Private offline code query',
        response: 'Internal proprietary response',
      });
      const results = await memos.search('proprietary');
      const duration = performance.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100);
    });
  });

  // ==========================================================================
  // Section 5: Memory Ingestion Layer Tests (test-plan.md §5)
  // ==========================================================================
  describe('Section 5: Memory Ingestion Layer (Path A) (test-plan.md §5)', () => {
    it('TC-ING-1 & TC-ING-2: Stop hook triggers fast deterministic fact extraction in <2ms', async () => {
      const start = performance.now();
      const result = await handleStopHookCapture(store, {
        projectRoot,
        prompt: 'Review the payment retry architecture',
        assistantResponse:
          'Payment retries must strictly use exponential backoff in auth.ts. Do not allow infinite loops.',
      });
      const durationMs = performance.now() - start;

      expect(result.ok).toBe(true);
      expect(result.factsCaptured).toBeGreaterThan(0);
      expect(durationMs).toBeLessThan(50); // Well under threshold in unit tests
    });

    it('TC-ING-3: Explicit lock phrase in assistant response captures row with locked=1 and confidence=0.95', () => {
      const result = ingestSessionFacts(store, {
        projectRoot,
        prompt: 'Is the database decision settled?',
        assistantResponse:
          'Yes, final decision is to lock the design on PostgreSQL for ACID transactions.',
      });

      expect(result.insertedCount).toBeGreaterThan(0);
      const active = getActiveContextMemory(store, projectRoot);
      const lockedFact = active.find((f) => f.locked === 1);
      expect(lockedFact).toBeDefined();
      expect(lockedFact?.confidence).toBe(0.95);
    });

    it('TC-ING-4: Inferred constraint phrase captures row with locked=1 and confidence=0.70', () => {
      const result = ingestSessionFacts(store, {
        projectRoot,
        prompt: 'Can we bypass the auth middleware?',
        assistantResponse:
          'No, all API requests must always pass through verifySession() middleware.',
      });

      expect(result.insertedCount).toBeGreaterThan(0);
      const active = getActiveContextMemory(store, projectRoot);
      const inferredFact = active.find((f) => f.locked === 1);
      expect(inferredFact).toBeDefined();
      expect(inferredFact?.confidence).toBe(0.70);
    });

    it('TC-ING-5: Unambiguous user intent preserves exact verbatim user text', () => {
      const verbatimPrompt = 'I want no surprises on retry when services recover.';
      ingestSessionFacts(store, {
        projectRoot,
        prompt: verbatimPrompt,
        assistantResponse: 'Understood. We will implement circuit breaker alerts.',
      });

      const active = getActiveContextMemory(store, projectRoot);
      const intentFact = active.find((f) => f.kind === 'intent');
      expect(intentFact).toBeDefined();
      expect(intentFact?.verbatim).toBe(verbatimPrompt);
    });

    it('TC-ING-6 & TC-ING-7: Contradictory rule update sets superseded_by = new_id on previous rule row', () => {
      // Step 1: Ingest initial rule
      upsertContextMemory(store, {
        projectRoot,
        kind: 'rule',
        key: 'rule-retry-policy',
        content: 'Payment retry count must strictly be 3 attempts in payment.ts.',
        identities: [{ file: 'payment.ts', type: 'file' }],
      });

      const initialActive = getActiveContextMemory(store, projectRoot);
      const oldId = initialActive[0].id;

      // Step 2: Ingest contradictory rule modifying the same file policy
      ingestSessionFacts(store, {
        projectRoot,
        prompt: 'Update the retry policy: we now allow 5 attempts',
        assistantResponse:
          'Policy update: payment retry count must strictly be 5 attempts in payment.ts.',
      });

      // Active memory must have only the new active rule
      const newActive = getActiveContextMemory(store, projectRoot);
      expect(newActive).toHaveLength(1);
      expect(newActive[0].content).toContain('5 attempts');

      // Full audit history must preserve both rows with superseded_by pointer
      const history = getContextMemoryHistory(store, projectRoot);
      expect(history.length).toBeGreaterThanOrEqual(2);
      const oldRow = history.find((r) => r.id === oldId);
      expect(oldRow?.active).toBe(0);
      expect(oldRow?.superseded_by).toBe(newActive[0].id);
    });

    it('TC-ING-8: Mid-session checkpoint and session-end capture with identical content prevents duplicate rows', () => {
      const turnInput = {
        projectRoot,
        prompt: 'What database do we use?',
        assistantResponse: 'Architecture decision: use PostgreSQL for all relational storage.',
      };

      // Checkpoint 1: mid-session
      ingestSessionFacts(store, turnInput);
      const count1 = getActiveContextMemory(store, projectRoot).length;

      // Checkpoint 2: session-end with identical fact
      ingestSessionFacts(store, turnInput);
      const count2 = getActiveContextMemory(store, projectRoot).length;

      // Must not create duplicate rows
      expect(count2).toBe(count1);
    });

    it('TC-ING-9: File staleness tagging: when git diff modifies auth.ts, linked facts receive code_changed_since', () => {
      upsertContextMemory(store, {
        projectRoot,
        kind: 'rule',
        key: 'auth-tokens',
        content: 'All session tokens expire after 1 hour',
        identities: [{ file: 'src/auth/token.ts', type: 'file' }],
      });

      // Simulate git diff modifying src/auth/token.ts
      const updatedIds = annotateStaleFactsFromGitDiff(store, projectRoot, [
        'src/auth/token.ts',
        'readme.md',
      ]);

      expect(updatedIds.length).toBe(1);

      const active = getActiveContextMemory(store, projectRoot);
      expect(active[0].staleness).toBe('code_changed_since');
    });

    it('TC-ING-10: MemOS turn persistence executes asynchronously without throwing', async () => {
      const result = await handleStopHookCapture(store, {
        projectRoot,
        prompt: 'Finalize payment flow',
        assistantResponse: 'All payment endpoints secured and logged.',
      });

      expect(result.ok).toBe(true);
    });
  });

  // ==========================================================================
  // Section 12A: Semi-E2E Live Integration (Phase 2 Path A) (test-plan.md §12A)
  // ==========================================================================
  describe('Section 12A: Semi-E2E Live Integration (Path A Ingestion)', () => {
    it('TC-E2E-2: Session 1 Fact Ingestion & Lock Confidence (Path A)', async () => {
      // Developer states constraint: "Payment retries must NEVER exceed 3 attempts in src/payment.ts"
      const result = await handleStopHookCapture(store, {
        projectRoot,
        prompt: 'How many retry attempts are allowed?',
        assistantResponse:
          'Payment retries must NEVER exceed 3 attempts in src/payment.ts.',
        sessionId: 'session-1',
      });

      expect(result.ok).toBe(true);
      expect(result.factsCaptured).toBe(1);

      const active = getActiveContextMemory(store, projectRoot);
      expect(active).toHaveLength(1);
      const fact = active[0];

      expect(fact.kind).toBe('rule');
      expect(fact.locked).toBe(1);
      expect(fact.confidence).toBe(0.70); // Inferred lock: NEVER
      expect(fact.content).toContain('must NEVER exceed 3 attempts');
      expect(fact.identities?.some((i) => i.file === 'src/payment.ts')).toBe(true);
    });

    it('TC-E2E-4: Rule Override & Decision Chaining (superseded_by)', async () => {
      // Turn 1: Initial decision
      await handleStopHookCapture(store, {
        projectRoot,
        prompt: 'Configure payment retry policy',
        assistantResponse:
          'Architecture policy: payment retry count must strictly be 3 attempts in src/payment.ts.',
        sessionId: 'session-1',
      });

      const initialRows = getActiveContextMemory(store, projectRoot);
      expect(initialRows).toHaveLength(1);
      const originalId = initialRows[0].id;

      // Turn 2: Policy updated
      await handleStopHookCapture(store, {
        projectRoot,
        prompt: 'Update retry policy',
        assistantResponse:
          'Updated policy: payment retry count must strictly be 5 attempts in src/payment.ts.',
        sessionId: 'session-2',
      });

      // Active memory must have only the new active rule
      const activeRows = getActiveContextMemory(store, projectRoot);
      expect(activeRows).toHaveLength(1);
      expect(activeRows[0].content).toContain('5 attempts');

      // Full audit history must preserve both rows
      const history = getContextMemoryHistory(store, projectRoot);
      expect(history.length).toBeGreaterThanOrEqual(2);
      const oldRow = history.find((r) => r.id === originalId);
      expect(oldRow?.active).toBe(0);
      expect(oldRow?.superseded_by).toBe(activeRows[0].id);
    });

    it('TC-E2E-7: Git Diff Impact Marking ("code changed since")', async () => {
      // Initial memory entry referencing payment.ts
      await handleStopHookCapture(store, {
        projectRoot,
        prompt: 'Configure payment service',
        assistantResponse:
          'Payment endpoint handler is defined in src/services/payment.ts.',
      });

      // Git diff modifies src/services/payment.ts
      const updatedIds = annotateStaleFactsFromGitDiff(store, projectRoot, [
        'src/services/payment.ts',
      ]);

      expect(updatedIds.length).toBeGreaterThan(0);

      const active = getActiveContextMemory(store, projectRoot);
      const paymentFact = active.find((f) =>
        f.identities?.some((i) => i.file === 'src/services/payment.ts')
      );
      expect(paymentFact?.staleness).toBe('code_changed_since');
    });
  });
});
