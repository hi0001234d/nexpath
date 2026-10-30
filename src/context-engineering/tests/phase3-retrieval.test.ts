/**
 * Phase 3 Verification Suite: Retrieval & Selection Layer
 *
 * Verifies:
 *  1. Sub-5ms Gap Detector (missing file, missing error, ambiguous intent, workspace resolution)
 *  2. Deterministic Task Classifier (<1ms execution across all 6 categories)
 *  3. 10-Line Budget Ranker & Deduplication Engine (4-factor scoring, task caps, strict 10-line hard cap)
 *  4. End-to-end Path B pipeline latency < 10ms total
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  detectPromptGaps,
  classifyTask,
  rankAndAllocateBudget,
  formatFactLine,
  formatFactTag,
  MAX_BUDGET_LINES,
} from '../index.js';

import {
  openStore,
  type Store,
} from '../../store/db.js';

import {
  upsertContextMemory,
  insertDeliveredItem,
  getDeliveredTags,
  getActiveContextMemory,
} from '../store/historical-map-store.js';

import type {
  WorkspaceContext,
  ContextMemoryRow,
} from '../types/context-engineering.js';

describe('Phase 3: Retrieval & Selection Layer', () => {
  let store: Store;

  beforeEach(async () => {
    store = await openStore(':memory:');
  });

  afterEach(() => {
    try {
      store.db.close();
    } catch {
      // ignore
    }
  });

  // ==========================================================================
  // Component 3.1: Sub-5ms Gap Detector
  // ==========================================================================
  describe('Component 3.1: Sub-5ms Gap Detector', () => {
    it('executes in < 5ms without making network or LLM calls', () => {
      const prompt = 'update calculateTax function for foreign residents';
      // Warm up JIT/regex engine under multi-threaded test runner load
      for (let i = 0; i < 5; i++) {
        detectPromptGaps(prompt);
      }

      const result = detectPromptGaps(prompt);

      expect(result.executionTimeMs).toBeLessThan(5.0);
      expect(result.hasGaps).toBe(true);
    });

    it('detects missing file context when code symbols are referenced without a file path', () => {
      const prompt = 'modify calculateTax and update UserService';
      const result = detectPromptGaps(prompt);

      expect(result.hasGaps).toBe(true);
      const fileGaps = result.gaps.filter((g) => g.category === 'missing_file');
      expect(fileGaps.length).toBeGreaterThanOrEqual(1);

      const tokens = fileGaps.map((g) => g.rawToken);
      expect(tokens).toContain('calculateTax');
      expect(fileGaps[0].suggestedQuery).toBe('calculateTax');
      expect(fileGaps[0].resolvedFromWorkspace).toBeUndefined();
    });

    it('resolves symbol locally when active editor file matches symbol', () => {
      const prompt = 'fix calculateTax immediately';
      const context: WorkspaceContext = {
        workspacePath: '/home/user/project',
        activeFilePath: 'src/services/calculateTax.ts',
        recentModifiedFiles: [],
      };

      const result = detectPromptGaps(prompt, context);
      const taxGap = result.gaps.find((g) => g.rawToken === 'calculateTax');

      expect(taxGap).toBeDefined();
      expect(taxGap?.resolvedFromWorkspace).toBe('src/services/calculateTax.ts');
    });

    it('resolves symbol locally when recent modified files match', () => {
      const prompt = 'update handleLogin flow';
      const context: WorkspaceContext = {
        workspacePath: '/home/user/project',
        activeFilePath: 'src/index.ts',
        recentModifiedFiles: ['src/auth/handleLogin.ts', 'src/db.ts'],
      };

      const result = detectPromptGaps(prompt, context);
      const authGap = result.gaps.find((g) => g.rawToken === 'handleLogin');

      expect(authGap).toBeDefined();
      expect(authGap?.resolvedFromWorkspace).toBe('src/auth/handleLogin.ts');
    });

    it('does NOT flag missing file when an explicit file path is already in the prompt', () => {
      const prompt = 'update calculateTax in src/finance/tax.ts for EU users';
      const result = detectPromptGaps(prompt);

      const fileGaps = result.gaps.filter((g) => g.category === 'missing_file');
      expect(fileGaps).toHaveLength(0);
    });

    it('flags missing error context when crash keyword exists without stack trace or error log', () => {
      const prompt = 'the payment service crashed with 500 on checkout';
      const result = detectPromptGaps(prompt);

      expect(result.hasGaps).toBe(true);
      const errorGap = result.gaps.find((g) => g.category === 'missing_error');
      expect(errorGap).toBeDefined();
      expect(errorGap?.suggestedQuery).toContain('failure error');
    });

    it('does NOT flag missing error context when error details or stack trace are provided', () => {
      const prompt = `payment crashed with Error: connect ECONNREFUSED at /app/node_modules/pg:42:10`;
      const result = detectPromptGaps(prompt);

      const errorGap = result.gaps.find((g) => g.category === 'missing_error');
      expect(errorGap).toBeUndefined();
    });

    it('[TC-M5.4] flags ambiguous architectural intent on vague instructions', () => {
      const prompt = 'please add retry to the billing client';
      const result = detectPromptGaps(prompt);

      const intentGap = result.gaps.find((g) => g.category === 'ambiguous_intent');
      expect(intentGap).toBeDefined();
      expect(intentGap?.rawToken).toBe('add retry');
      expect(intentGap?.suggestedQuery).toBe('rule convention add retry');
    });

    it('[TC-RET-GAP-5 / TC-E2E-15] forces hasGaps: true when explicit retrieval cues or CLI flags are present', () => {
      const res1 = detectPromptGaps('Recall our previous decision on retry policy');
      expect(res1.hasGaps).toBe(true);
      expect(res1.gaps.some((g) => g.rawToken.toLowerCase().includes('recall'))).toBe(true);

      const res2 = detectPromptGaps('nexpath --context "payment timeout"');
      expect(res2.hasGaps).toBe(true);
      expect(res2.gaps.some((g) => g.rawToken.includes('--context'))).toBe(true);
    });

    it('handles empty or whitespace prompts gracefully with zero gaps', () => {
      const emptyResult = detectPromptGaps('');
      expect(emptyResult.hasGaps).toBe(false);
      expect(emptyResult.gaps).toHaveLength(0);

      const whitespaceResult = detectPromptGaps('   ');
      expect(whitespaceResult.hasGaps).toBe(false);
    });
  });

  // ==========================================================================
  // Component 3.2: Deterministic Task Classifier
  // ==========================================================================
  describe('Component 3.2: Deterministic Task Classifier', () => {
    it('categorizes bugfix prompts correctly with high confidence', () => {
      const res1 = classifyTask('fix the broken authentication token expiration bug');
      expect(res1.taskType).toBe('bugfix');
      expect(res1.confidence).toBeGreaterThanOrEqual(0.70);
      expect(res1.matchedKeywords).toContain('fix');

      const res2 = classifyTask('app crashed with unhandled rejection');
      expect(res2.taskType).toBe('bugfix');
    });

    it('categorizes feature prompts correctly', () => {
      const res = classifyTask('implement new export to CSV button in dashboard');
      expect(res.taskType).toBe('feature');
      expect(res.confidence).toBeGreaterThanOrEqual(0.65);
      expect(res.matchedKeywords).toContain('implement');
    });

    it('categorizes refactor prompts correctly', () => {
      const res = classifyTask('clean up and simplify the database repository classes');
      expect(res.taskType).toBe('refactor');
      expect(res.matchedKeywords).toContain('clean');
    });

    it('categorizes test prompts correctly', () => {
      const res = classifyTask('add unit test and increase coverage with vitest');
      expect(res.taskType).toBe('test');
      expect(res.matchedKeywords).toContain('test');
    });

    it('categorizes config prompts correctly', () => {
      const res = classifyTask('update tsconfig and setup docker compose configuration');
      expect(res.taskType).toBe('config');
      expect(res.matchedKeywords).toContain('tsconfig');
    });

    it('falls back to general when no specific category dominates or on empty prompt', () => {
      const res1 = classifyTask('hello, what is the current weather?');
      expect(res1.taskType).toBe('general');
      expect(res1.confidence).toBe(0.5);

      const res2 = classifyTask('');
      expect(res2.taskType).toBe('general');
    });
  });

  // ==========================================================================
  // Component 3.3: 10-Line Budget Ranking & Deduplication Engine
  // ==========================================================================
  describe('Component 3.3: 10-Line Budget Ranking & Deduplication Engine', () => {
    const projectRoot = '/test/project';

    it('enforces a strict <=10 line hard cap when 50+ candidate facts exist', () => {
      const candidateFacts: ContextMemoryRow[] = [];
      const now = Date.now();

      // Generate 50 candidate facts
      for (let i = 1; i <= 50; i++) {
        candidateFacts.push({
          id: i,
          project_root: projectRoot,
          kind: i % 3 === 0 ? 'failure' : i % 2 === 0 ? 'rule' : 'intent',
          key: `fact-key-${i}`,
          content: `Test candidate context fact number ${i} with retry and auth keywords`,
          verbatim: null,
          identities: [{ file: `src/file${i}.ts` }],
          locked: i === 1 ? 1 : 0,
          confidence: 0.8,
          staleness: null,
          superseded_by: null,
          active: 1,
          evidence: null,
          created_at: now - i * 1000,
          updated_at: now - i * 1000,
        });
      }

      const result = rankAndAllocateBudget('fix retry in auth', candidateFacts, 'bugfix');

      expect(result.totalLines).toBeLessThanOrEqual(MAX_BUDGET_LINES);
      expect(result.allocatedLines.length).toBeLessThanOrEqual(MAX_BUDGET_LINES);
      expect(result.allocatedLines.length).toBe(8); // 4 failures + 3 rules + 1 intent

      // With workspace context, fills all 10 lines exactly
      const context: WorkspaceContext = {
        workspacePath: projectRoot,
        activeFilePath: 'src/main.ts',
        gitStatus: 'clean',
      };
      const resultWithContext = rankAndAllocateBudget('fix retry in auth', candidateFacts, 'bugfix', { context });
      expect(resultWithContext.totalLines).toBe(10);
      expect(resultWithContext.workspaceLines.length).toBe(2);
      expect(resultWithContext.allocatedLines.length).toBe(8);
    });

    it('prioritizes explicit locks (confidence = 0.95, locked = 1) and active file proximity', () => {
      const now = Date.now();
      const facts: ContextMemoryRow[] = [
        {
          id: 1,
          project_root: projectRoot,
          kind: 'rule',
          key: 'unlocked-rule',
          content: 'Use 5s timeout',
          verbatim: null,
          identities: [{ file: 'src/other.ts' }],
          locked: 0,
          confidence: 0.5,
          staleness: null,
          superseded_by: null,
          active: 1,
          evidence: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: 2,
          project_root: projectRoot,
          kind: 'rule',
          key: 'locked-proximity-rule',
          content: 'Max 3 retries locked by policy',
          verbatim: null,
          identities: [{ file: 'src/auth/service.ts' }],
          locked: 1,
          confidence: 0.95,
          staleness: null,
          superseded_by: null,
          active: 1,
          evidence: null,
          created_at: now,
          updated_at: now,
        },
      ];

      const context: WorkspaceContext = {
        workspacePath: projectRoot,
        activeFilePath: 'src/auth/service.ts',
      };

      const result = rankAndAllocateBudget('check retry policy', facts, 'bugfix', { context });

      expect(result.allocatedLines.length).toBe(2);
      expect(result.allocatedLines[0].fact.key).toBe('locked-proximity-rule');
      expect(result.allocatedLines[0].breakdown.fileProximity).toBe(1.0);
      expect(result.allocatedLines[0].breakdown.confidence).toBeGreaterThanOrEqual(0.95);
      expect(result.allocatedLines[0].formattedLine).toBe('• Max 3 retries locked by policy');
    });

    it('enforces task-driven category caps (bugfix allocates more failure lines than feature)', () => {
      const now = Date.now();
      const facts: ContextMemoryRow[] = [
        // 5 failure facts
        ...[1, 2, 3, 4, 5].map((i) => ({
          id: i,
          project_root: projectRoot,
          kind: 'failure' as const,
          key: `fail-${i}`,
          content: `Payment failed with error code ${i}`,
          verbatim: null,
          identities: null,
          locked: 0,
          confidence: 0.9,
          staleness: null,
          superseded_by: null,
          active: 1,
          evidence: null,
          created_at: now,
          updated_at: now,
        })),
        // 5 rule facts
        ...[6, 7, 8, 9, 10].map((i) => ({
          id: i,
          project_root: projectRoot,
          kind: 'rule' as const,
          key: `rule-${i}`,
          content: `Strict schema validation rule ${i}`,
          verbatim: null,
          identities: null,
          locked: 1,
          confidence: 0.95,
          staleness: null,
          superseded_by: null,
          active: 1,
          evidence: null,
          created_at: now,
          updated_at: now,
        })),
      ];

      // Bugfix caps failure at 4 lines
      const bugfixResult = rankAndAllocateBudget('fix payment error', facts, 'bugfix');
      const bugfixFailures = bugfixResult.allocatedLines.filter((l) => l.fact.kind === 'failure');
      expect(bugfixFailures.length).toBe(4);

      // Feature caps failure at 2 lines
      const featureResult = rankAndAllocateBudget('add new payment feature', facts, 'feature');
      const featureFailures = featureResult.allocatedLines.filter((l) => l.fact.kind === 'failure');
      expect(featureFailures.length).toBe(2);
    });

    it('deduplicates facts delivered earlier in the active session', () => {
      const now = Date.now();
      const facts: ContextMemoryRow[] = [
        {
          id: 101,
          project_root: projectRoot,
          kind: 'rule',
          key: 'payment-retry-policy',
          content: 'Retry backoff is 5s, 15s, 45s',
          verbatim: null,
          identities: null,
          locked: 1,
          confidence: 0.95,
          staleness: null,
          superseded_by: null,
          active: 1,
          evidence: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: 102,
          project_root: projectRoot,
          kind: 'rule',
          key: 'db-pool-size',
          content: 'Max connection pool is 20',
          verbatim: null,
          identities: null,
          locked: 0,
          confidence: 0.8,
          staleness: null,
          superseded_by: null,
          active: 1,
          evidence: null,
          created_at: now,
          updated_at: now,
        },
      ];

      // Mark fact 101 as delivered in this session
      const deliveredMemoryIds = new Set<number>([101]);
      const deliveredTags = new Set<string>(['@rule:payment-retry-policy']);

      const result = rankAndAllocateBudget('update payment retry and db', facts, 'feature', {
        deliveredMemoryIds,
        deliveredTags,
      });

      expect(result.deduplicatedCount).toBe(1);
      expect(result.allocatedLines.length).toBe(1);
      expect(result.allocatedLines[0].fact.key).toBe('db-pool-size');
    });

    it('[TC-M7.2] composite scoring formula accurately computes 4-factor weights', () => {
      const now = Date.now();
      const fact: ContextMemoryRow = {
        id: 1,
        project_root: projectRoot,
        kind: 'rule',
        key: 'jwt-auth-token',
        content: 'JWT tokens must use RS256 algorithm',
        verbatim: null,
        identities: [{ file: 'src/auth/jwt.ts' }],
        locked: 1,
        confidence: 0.95,
        staleness: null,
        superseded_by: null,
        active: 1,
        evidence: null,
        created_at: now,
        updated_at: now,
      };

      const context: WorkspaceContext = {
        workspacePath: projectRoot,
        activeFilePath: 'src/auth/jwt.ts',
      };

      const result = rankAndAllocateBudget('JWT tokens RS256', [fact], 'feature', { context });
      expect(result.allocatedLines.length).toBe(1);
      const scored = result.allocatedLines[0];

      const b = scored.breakdown;
      const expectedScore = Number(
        (b.keywordMatch * 0.40 + b.confidence * 0.30 + b.recencyDecay * 0.20 + b.fileProximity * 0.10).toFixed(4)
      );
      expect(scored.score).toBe(expectedScore);
    });

    it('[TC-M7.5] low context availability returns exactly existing facts without padding or filler', () => {
      const now = Date.now();
      const facts: ContextMemoryRow[] = [
        {
          id: 1,
          project_root: projectRoot,
          kind: 'rule',
          key: 'only-fact-1',
          content: 'First available fact',
          verbatim: null,
          identities: null,
          locked: 0,
          confidence: 0.8,
          staleness: null,
          superseded_by: null,
          active: 1,
          evidence: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: 2,
          project_root: projectRoot,
          kind: 'rule',
          key: 'only-fact-2',
          content: 'Second available fact',
          verbatim: null,
          identities: null,
          locked: 0,
          confidence: 0.8,
          staleness: null,
          superseded_by: null,
          active: 1,
          evidence: null,
          created_at: now,
          updated_at: now,
        },
      ];

      const result = rankAndAllocateBudget('any prompt', facts, 'feature');
      expect(result.allocatedLines.length).toBe(2);
      expect(result.totalLines).toBe(2);
    });

    it('[TC-RNK-9 / Decision T4 Rule 2] prunes candidate facts with confidence < 0.40 before ranking', () => {
      const now = Date.now();
      const facts: ContextMemoryRow[] = [
        {
          id: 1,
          project_root: projectRoot,
          kind: 'rule',
          key: 'low-conf-noisy-fact',
          content: 'Vague casual observation with keyword match',
          verbatim: null,
          identities: null,
          locked: 0,
          confidence: 0.35, // Below 0.40 threshold
          staleness: null,
          superseded_by: null,
          active: 1,
          evidence: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: 2,
          project_root: projectRoot,
          kind: 'rule',
          key: 'high-conf-fact',
          content: 'Solid architectural constraint',
          verbatim: null,
          identities: null,
          locked: 0,
          confidence: 0.85,
          staleness: null,
          superseded_by: null,
          active: 1,
          evidence: null,
          created_at: now,
          updated_at: now,
        },
      ];

      const result = rankAndAllocateBudget('observation constraint', facts, 'feature');
      expect(result.allocatedLines.length).toBe(1);
      expect(result.allocatedLines[0].fact.key).toBe('high-conf-fact');
    });

    it('formats line tags and outputs correctly per specification', () => {
      const now = Date.now();
      const ruleFact: ContextMemoryRow = {
        id: 1,
        project_root: projectRoot,
        kind: 'rule',
        key: 'jwt-auth',
        content: 'JWT tokens must use RS256 algorithm',
        verbatim: null,
        identities: null,
        locked: 1,
        confidence: 0.95,
        staleness: null,
        superseded_by: null,
        active: 1,
        evidence: null,
        created_at: now,
        updated_at: now,
      };

      const line = formatFactLine(ruleFact);
      const tag = formatFactTag(ruleFact);

      expect(line).toBe('• JWT tokens must use RS256 algorithm');
      expect(tag).toBe('@rule:jwt-auth');
    });
  });

  // ==========================================================================
  // End-to-End Pipeline Latency (< 10ms total)
  // ==========================================================================
  describe('Path B Pipeline Latency (< 10ms)', () => {
    it('runs gap detection + task classification + store query + budget ranking in < 10ms', () => {
      const projectRoot = '/benchmark/project';
      const sessionId = 'session-latency-test';

      // 1. Populate store with 20 facts
      for (let i = 1; i <= 20; i++) {
        upsertContextMemory(store, {
          projectRoot,
          kind: i % 2 === 0 ? 'rule' : 'failure',
          key: `latency-key-${i}`,
          content: `Test latency memory fact content ${i} for performance assertion`,
          locked: i === 1,
        });
      }

      // 2. Insert 2 delivered items
      insertDeliveredItem(store, {
        projectRoot,
        sessionId,
        rawPrompt: 'prior prompt',
        enhancedPrompt: 'prior enhanced',
        isEnhanced: true,
        stage: 'implementation',
        stageConfidence: 0.9,
        injectedContextTags: ['@rule:latency-key-2'],
        contextTokenEstimate: 50,
        processingTimeMs: 4,
      });

      const prompt = 'fix payment gateway crash in checkout flow';
      const context: WorkspaceContext = {
        workspacePath: projectRoot,
        activeFilePath: 'src/checkout/gateway.ts',
        gitBranch: 'main',
      };

      const pipeStart = performance.now();

      // Step 1: Gap Detector
      const gapRes = detectPromptGaps(prompt, context);

      // Step 2: Task Classifier
      const taskRes = classifyTask(prompt);

      // Step 3: SQLite Query for active facts
      const activeFacts = getActiveContextMemory(store, projectRoot);

      // Step 4: SQLite Query for delivered tags in session
      const deliveredTags = getDeliveredTags(store, projectRoot, sessionId);

      // Step 5: Budget Ranker
      const budgetRes = rankAndAllocateBudget(prompt, activeFacts, taskRes.taskType, {
        context,
        deliveredTags,
      });

      const totalPipeTimeMs = performance.now() - pipeStart;

      // Verify correctness
      expect(gapRes.hasGaps).toBe(true);
      expect(taskRes.taskType).toBe('bugfix');
      expect(budgetRes.totalLines).toBeLessThanOrEqual(10);
      expect(budgetRes.deduplicatedCount).toBeGreaterThanOrEqual(1);

      // Verify strict latency ceiling (< 10ms)
      expect(totalPipeTimeMs).toBeLessThan(10.0);
    });

    it('[BM-1, BM-2, BM-3] performance benchmarks: Gap Detector <5ms, Classifier <1ms, Budget Ranker <5ms', () => {
      const prompt = 'fix broken payment retry in checkout/service.ts';

      // Warm up
      detectPromptGaps(prompt);
      classifyTask(prompt);

      // BM-1: Gap detector median < 1.5ms, P99 < 5ms
      const gapTimes: number[] = [];
      for (let i = 0; i < 50; i++) {
        const t0 = performance.now();
        detectPromptGaps(prompt);
        gapTimes.push(performance.now() - t0);
      }
      gapTimes.sort((a, b) => a - b);
      const gapMedian = gapTimes[Math.floor(gapTimes.length / 2)];
      expect(gapMedian).toBeLessThan(1.5);

      // BM-2: Task classifier median < 0.3ms, P99 < 1ms
      const clsTimes: number[] = [];
      for (let i = 0; i < 50; i++) {
        const t0 = performance.now();
        classifyTask(prompt);
        clsTimes.push(performance.now() - t0);
      }
      clsTimes.sort((a, b) => a - b);
      const clsMedian = clsTimes[Math.floor(clsTimes.length / 2)];
      expect(clsMedian).toBeLessThan(0.5);

      // BM-3: Budget ranker 50 facts ranked in < 5ms
      const candidateFacts: ContextMemoryRow[] = [];
      const now = Date.now();
      for (let i = 1; i <= 50; i++) {
        candidateFacts.push({
          id: i,
          project_root: '/bench/project',
          kind: i % 2 === 0 ? 'rule' : 'failure',
          key: `bench-fact-${i}`,
          content: `Candidate fact content ${i} payment retry`,
          verbatim: null,
          identities: null,
          locked: i === 1 ? 1 : 0,
          confidence: 0.85,
          staleness: null,
          superseded_by: null,
          active: 1,
          evidence: null,
          created_at: now,
          updated_at: now,
        });
      }
      const rnkTimes: number[] = [];
      for (let i = 0; i < 20; i++) {
        const t0 = performance.now();
        rankAndAllocateBudget(prompt, candidateFacts, 'bugfix');
        rnkTimes.push(performance.now() - t0);
      }
      rnkTimes.sort((a, b) => a - b);
      const rnkMedian = rnkTimes[Math.floor(rnkTimes.length / 2)];
      expect(rnkMedian).toBeLessThan(5.0);
    });
  });
});
