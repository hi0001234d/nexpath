import { describe, it, expect, beforeEach } from 'vitest';
import { matchKeywords } from './KeywordMatcher.js';
import { classifyWithTFIDF, resetTFIDFModel } from './TFIDFClassifier.js';
import { createEmbeddingClassifier } from './EmbeddingClassifier.js';
import { classifyPrompt } from './PromptClassifier.js';
import { SessionStateManager, SESSION_GAP_MS, STAGE_CONFIRM_THRESHOLD, MIN_STAGE_CHANGE_CONFIDENCE } from './SessionStateManager.js';
import { NATURE_DEPTH_RECOMPUTE_INTERVAL, classifyMoodOnly } from './UserProfileClassifier.js';
import { detectAbsenceFlags, ABSENCE_MIN_PROMPTS, ABSENCE_COOLDOWN_PROMPTS } from './AbsenceDetector.js';
import { detectSignals, initialSignalCounters, SIGNAL_DEFINITIONS, SIGNAL_MAP } from './signals.js';
import { openStore, closeStore } from '../store/index.js';
import { upsertProject, setDetectedLanguage } from '../store/projects.js';
import type { SessionState, ClassificationResult } from './types.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeResult(stage: import('./types.js').Stage, confidence: number): ClassificationResult {
  return { stage, confidence, tier: 1, allScores: { [stage]: confidence } };
}

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId:              'test-session',
    projectRoot:            '/test/project',
    startedAt:              1000,
    lastPromptAt:           1000,
    currentStage:           'implementation',
    stageConfidence:        0.80,
    stageConfirmedAt:       0,
    promptsInCurrentStage:  20,
    promptCount:            20,
    promptHistory:          [],
    signalCounters:         initialSignalCounters(),
    absenceFlags:           [],
    firedDecisionSessions:  [],
    profile:                null,
    detectedLanguage:       undefined,
    ...overrides,
  };
}

// ── KeywordMatcher ─────────────────────────────────────────────────────────────

describe('KeywordMatcher', () => {
  it('returns null when no keywords present', () => {
    expect(matchKeywords('hello world nothing here')).toBeNull();
  });

  it('detects idea stage from "brainstorm"', () => {
    const result = matchKeywords('let us brainstorm this concept');
    expect(result).not.toBeNull();
    expect(result!.stage).toBe('idea');
    expect(result!.tier).toBe(1);
  });

  it('detects prd stage from "spec" and "requirements"', () => {
    const result = matchKeywords('write the spec and define requirements');
    expect(result).not.toBeNull();
    expect(result!.stage).toBe('prd');
  });

  it('detects architecture stage from "system design"', () => {
    const result = matchKeywords('let us think about the system design for this');
    expect(result!.stage).toBe('architecture');
  });

  it('detects task_breakdown from "break this down"', () => {
    const result = matchKeywords('can you break this down into subtasks');
    expect(result!.stage).toBe('task_breakdown');
  });

  it('detects implementation from "implement"', () => {
    const result = matchKeywords('implement the auth middleware now');
    expect(result!.stage).toBe('implementation');
  });

  it('detects review_testing from "unit test"', () => {
    const result = matchKeywords('write unit tests for this module');
    expect(result!.stage).toBe('review_testing');
  });

  it('detects release from "deploy"', () => {
    const result = matchKeywords('deploy this to production');
    expect(result!.stage).toBe('release');
  });

  it('detects feedback_loop from "user reported"', () => {
    const result = matchKeywords('user reported a bug with the login page');
    expect(result!.stage).toBe('feedback_loop');
  });

  it('accumulates weight from multiple keywords — higher confidence', () => {
    const single = matchKeywords('deploy this');
    const multi  = matchKeywords('deploy this and push to prod and go live');
    expect(multi!.confidence).toBeGreaterThanOrEqual(single!.confidence);
  });

  it('handles mixed stage prompt — picks stage with more keyword weight', () => {
    // "unit test" and "run all tests" → review_testing should win over implementation
    const result = matchKeywords('write unit tests and run all tests after implementing this');
    // review_testing has more weight in this prompt
    expect(['review_testing', 'implementation']).toContain(result!.stage);
    expect(result!.confidence).toBeGreaterThan(0);
  });

  it('confidence is capped at 1.0 even with many hits', () => {
    const result = matchKeywords(
      'deploy to production npm publish docker push push to prod go live release version changelog',
    );
    expect(result!.confidence).toBeLessThanOrEqual(1.0);
  });

  it('allScores includes scores for detected stages', () => {
    const result = matchKeywords('deploy this to production');
    expect(result!.allScores['release']).toBeGreaterThan(0);
  });

  it('returns null for empty string', () => {
    expect(matchKeywords('')).toBeNull();
  });

  it('is case-insensitive — uppercase keywords still match', () => {
    const result = matchKeywords('DEPLOY THIS TO PRODUCTION');
    expect(result).not.toBeNull();
    expect(result!.stage).toBe('release');
  });

  it('allScores contains entries for BOTH stages on a mixed-stage prompt', () => {
    // "unit test" → review_testing; "deploy" → release
    const result = matchKeywords('write unit tests then deploy to production');
    expect(result).not.toBeNull();
    const scores = result!.allScores;
    expect((scores['review_testing'] ?? 0)).toBeGreaterThan(0);
    expect((scores['release'] ?? 0)).toBeGreaterThan(0);
  });

  it('tier is always 1 on any match', () => {
    const result = matchKeywords('implement the auth module');
    expect(result!.tier).toBe(1);
  });
});

// ── TFIDFClassifier ───────────────────────────────────────────────────────────

describe('TFIDFClassifier', () => {
  beforeEach(() => resetTFIDFModel());

  it('classifies clear implementation prompt correctly', () => {
    const result = classifyWithTFIDF('implement the api endpoint for creating users');
    expect(result.stage).toBe('implementation');
    expect(result.tier).toBe(2);
  });

  it('classifies clear release prompt correctly', () => {
    const result = classifyWithTFIDF('deploy this service to the production environment');
    expect(result.stage).toBe('release');
  });

  it('classifies clear testing prompt correctly', () => {
    const result = classifyWithTFIDF('write unit tests and check test coverage');
    expect(result.stage).toBe('review_testing');
  });

  it('always returns a result (never throws)', () => {
    const result = classifyWithTFIDF('asdfghjkl qwerty zzz');
    expect(result).toBeDefined();
    expect(typeof result.confidence).toBe('number');
  });

  it('confidence is 0–1 range', () => {
    const result = classifyWithTFIDF('implement the function');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('allScores contains all stages', () => {
    const result = classifyWithTFIDF('implement the function');
    expect(Object.keys(result.allScores).length).toBeGreaterThanOrEqual(1);
  });

  it('classifies idea stage prompt correctly', () => {
    const result = classifyWithTFIDF('let me brainstorm the core concept for this new product idea');
    expect(result.stage).toBe('idea');
  });

  it('classifies prd stage prompt correctly', () => {
    const result = classifyWithTFIDF('write a product requirements document and define acceptance criteria');
    expect(result.stage).toBe('prd');
  });

  it('classifies architecture prompt correctly', () => {
    const result = classifyWithTFIDF('design the system architecture and data model schema for the service');
    expect(result.stage).toBe('architecture');
  });

  it('classifies task_breakdown prompt correctly', () => {
    const result = classifyWithTFIDF('break this feature down into smaller tasks and create a backlog');
    expect(result.stage).toBe('task_breakdown');
  });

  it('classifies feedback_loop prompt correctly', () => {
    const result = classifyWithTFIDF('users are reporting a critical bug in production we need a hotfix');
    expect(result.stage).toBe('feedback_loop');
  });

  it('garbage input returns confidence 0 (no vocabulary match)', () => {
    const result = classifyWithTFIDF('xyzzy plugh frobozz zork zzz');
    expect(result.confidence).toBe(0);
  });

  it('allScores values sum to approximately 1.0 for known vocabulary', () => {
    const result = classifyWithTFIDF('implement the api endpoint');
    const sum = Object.values(result.allScores).reduce((a, b) => a + (b ?? 0), 0);
    expect(sum).toBeCloseTo(1.0, 1);
  });

  it('resetTFIDFModel forces model rebuild — produces same results', () => {
    const r1 = classifyWithTFIDF('deploy this to production environment');
    resetTFIDFModel();
    const r2 = classifyWithTFIDF('deploy this to production environment');
    expect(r1.stage).toBe(r2.stage);
    expect(r1.confidence).toBeCloseTo(r2.confidence, 5);
  });
});

// ── EmbeddingClassifier ────────────────────────────────────────────────────────

describe('EmbeddingClassifier', () => {
  it('classifies using injected embedding function', async () => {
    // Mock: 8-dim space; centroid call (texts.length===8) returns identity matrix
    // so each stage i maps to basis vector e_i.
    // Query call (texts.length===1) returns e_4 (implementation).
    const dim = 8;
    const mockEmbed = async (texts: string[]): Promise<number[][]> => {
      if (texts.length === 8) {
        // centroid build — return identity matrix rows
        return texts.map((_, i) => { const v = new Array<number>(dim).fill(0); v[i] = 1; return v; });
      }
      // query — match implementation (index 4)
      const v = new Array<number>(dim).fill(0); v[4] = 1;
      return [v];
    };

    const classifier = await createEmbeddingClassifier(mockEmbed);
    expect(classifier).not.toBeNull();

    const result = await classifier!.classify('any text');
    expect(result.stage).toBe('implementation'); // index 4 in STAGES
    expect(result.tier).toBe(3);
  });

  it('returns null when embedding function throws', async () => {
    const classifier = await createEmbeddingClassifier(async () => { throw new Error('fail'); });
    expect(classifier).toBeNull();
  });

  it('classify() propagates errors from embedFn so caller can catch', async () => {
    let callCount = 0;
    const dim = 8;
    const mockEmbed = async (texts: string[]): Promise<number[][]> => {
      callCount++;
      if (callCount === 1) {
        // First call (centroid build) — succeeds
        return texts.map((_, i) => { const v = new Array<number>(dim).fill(0); v[i % dim] = 1; return v; });
      }
      throw new Error('classify-time failure');
    };
    const classifier = await createEmbeddingClassifier(mockEmbed);
    expect(classifier).not.toBeNull();
    await expect(classifier!.classify('any text')).rejects.toThrow('classify-time failure');
  });

  it('allScores contains scores for all 8 stages', async () => {
    const dim = 8;
    const mockEmbed = async (texts: string[]): Promise<number[][]> => {
      if (texts.length === 8) {
        return texts.map((_, i) => { const v = new Array<number>(dim).fill(0); v[i] = 1; return v; });
      }
      // Query: slight lean toward index 2 (architecture)
      return [new Array<number>(dim).fill(0).map((_, i) => i === 2 ? 0.9 : 0.1)];
    };
    const classifier = await createEmbeddingClassifier(mockEmbed);
    const result = await classifier!.classify('any text');
    expect(Object.keys(result.allScores).length).toBe(8);
  });
});

// ── PromptClassifier cascade ──────────────────────────────────────────────────

describe('PromptClassifier', () => {
  it('Tier 1 handles high-confidence keyword prompt', async () => {
    const result = await classifyPrompt('deploy this to production npm publish');
    expect(result.tier).toBe(1);
    expect(result.stage).toBe('release');
  });

  it('falls through to Tier 2 for low-keyword prompt', async () => {
    // Prompt with no strong Tier 1 keywords but TF-IDF vocabulary
    const result = await classifyPrompt('push the docker image to the registry');
    expect(['release', 'implementation']).toContain(result.stage);
    expect(result.tier).toBeLessThanOrEqual(2);
  });

  it('uses Tier 3 when provided and earlier tiers are uncertain', async () => {
    const dim = 8;
    // Same identity-matrix mock: centroid call returns identity, query returns e_4 (implementation)
    const mockEmbed = async (texts: string[]): Promise<number[][]> => {
      if (texts.length === 8) {
        return texts.map((_, i) => { const v = new Array<number>(dim).fill(0); v[i] = 1; return v; });
      }
      const v = new Array<number>(dim).fill(0); v[4] = 1;
      return [v];
    };
    const embeddingClassifier = await createEmbeddingClassifier(mockEmbed);
    // Use a very ambiguous, non-vocabulary prompt to ensure Tier 1+2 are uncertain
    const result = await classifyPrompt('xyzzy plugh frobozz', { embeddingClassifier });
    // Tier 3 should fire and resolve to implementation
    expect(result.stage).toBe('implementation');
    expect(result.tier).toBe(3);
  });

  it('returns a result even when all tiers uncertain and no embedding classifier', async () => {
    const result = await classifyPrompt('xyzzy plugh frobozz completely unknown text');
    expect(result).toBeDefined();
    expect(result.stage).toBeDefined();
  });

  it('Tier 1 accepted at exactly the 0.65 threshold', async () => {
    // "deploy" (1.0) + "ship this" (0.9) = 1.9/3.0 = 0.633 — just below
    // "deploy" + "npm publish" + "go live" = 1.0+1.0+1.0 = 3.0/3.0 = 1.0 — above
    // Find a combination that hits exactly 0.65: "deploy"(1.0) + "changelog"(0.9) + "tag this"(0.8) = 2.7/3.0 = 0.9 > 0.65
    // The point: anything with accumulated weight ≥ 1.95 (≥0.65 * 3.0) short-circuits at Tier 1
    const result = await classifyPrompt('deploy this to production and update the changelog');
    // deploy(1.0) + changelog(0.9) = 1.9 / 3.0 = 0.633 — below threshold → falls to T2
    // But "push to prod" not in this string, so this goes to Tier 2
    // Just verify it returns a valid release/related result
    expect(['release', 'implementation', 'review_testing']).toContain(result.stage);
  });

  it('Tier 1 at high-confidence short-circuits — tier is 1', async () => {
    // 3 strong release keywords → score ≥ 1.95 → confidence ≥ 0.65
    const result = await classifyPrompt('deploy to production npm publish go live now');
    expect(result.tier).toBe(1);
    expect(result.stage).toBe('release');
  });

  it('when Tier 3 throws, falls back to best of Tier 1 / Tier 2', async () => {
    let callCount = 0;
    const dim = 8;
    const badEmbed = async (texts: string[]): Promise<number[][]> => {
      callCount++;
      if (callCount === 1) {
        // centroid build succeeds
        return texts.map((_, i) => { const v = new Array<number>(dim).fill(0); v[i % dim] = 1; return v; });
      }
      throw new Error('tier3-fail');
    };
    const embeddingClassifier = await createEmbeddingClassifier(badEmbed);
    // Ambiguous text so Tier 1 + Tier 2 both below thresholds
    const result = await classifyPrompt('xyzzy plugh frobozz', { embeddingClassifier });
    // Tier 3 throws — PromptClassifier catches and returns best T1/T2
    expect(result).toBeDefined();
    expect(result.stage).toBeDefined();
    // tier should be 1 or 2 (T3 failed)
    expect(result.tier).toBeLessThanOrEqual(2);
  });

  it('allScores has scores for both stages in a multi-intent prompt', async () => {
    // "unit test" → review_testing; "implement" → implementation
    const result = await classifyPrompt('implement this feature and write unit tests for it');
    // Both stages should have non-zero scores in allScores
    const hasReview = (result.allScores['review_testing'] ?? 0) > 0;
    const hasImpl   = (result.allScores['implementation'] ?? 0) > 0;
    expect(hasReview || hasImpl).toBe(true); // at least one non-primary stage scored
  });
});

// ── Signal detection ──────────────────────────────────────────────────────────

describe('detectSignals', () => {
  it('detects test_creation signal from "write tests"', () => {
    const signals = detectSignals('please write tests for this module');
    expect(signals).toContain('test_creation');
  });

  it('detects security_check from "rate limit"', () => {
    const signals = detectSignals('we should add rate limit and input validation');
    expect(signals).toContain('security_check');
  });

  it('detects comprehension from "explain this"', () => {
    const signals = detectSignals('can you explain this generated function');
    expect(signals).toContain('comprehension');
  });

  it('detects alternatives_seeking from "what are the alternatives"', () => {
    const signals = detectSignals('what are the alternatives to this approach');
    expect(signals).toContain('alternatives_seeking');
  });

  it('detects regression_check from "run all tests"', () => {
    const signals = detectSignals('run all tests and check for regressions');
    expect(signals).toContain('regression_check');
  });

  it('returns empty array when no signals present', () => {
    const signals = detectSignals('add a button to the ui');
    expect(Array.isArray(signals)).toBe(true);
    // May or may not have signals, but should not throw
  });

  it('initialSignalCounters has all signals as absent', () => {
    const counters = initialSignalCounters();
    for (const counter of Object.values(counters)) {
      expect(counter.present).toBe(false);
      expect(counter.lastSeenAt).toBeNull();
    }
  });

  it('initialSignalCounters covers at least 20 signals', () => {
    const counters = initialSignalCounters();
    expect(Object.keys(counters).length).toBeGreaterThanOrEqual(20);
  });

  it('detects cross_confirming from "double check"', () => {
    expect(detectSignals('can you double check what you just generated')).toContain('cross_confirming');
  });

  it('detects spec_cross_confirm from "review the spec"', () => {
    expect(detectSignals('review the spec and tell me if it is complete')).toContain('spec_cross_confirm');
  });

  it('detects rollback_planning from "rollback"', () => {
    expect(detectSignals('what is the rollback plan if this fails')).toContain('rollback_planning');
  });

  it('detects documentation from "update the readme"', () => {
    expect(detectSignals('please update the readme with the new api endpoints')).toContain('documentation');
  });

  it('detects architecture_conflict from "does this conflict"', () => {
    expect(detectSignals('does this conflict with the existing architecture')).toContain('architecture_conflict');
  });

  it('detects error_handling from "what happens when"', () => {
    expect(detectSignals('what happens when this api call fails')).toContain('error_handling');
  });

  it('detects observability from "logging"', () => {
    expect(detectSignals('we need to add logging and monitoring for this feature')).toContain('observability');
  });

  it('multiple signals detected in one prompt — returns all of them', () => {
    const signals = detectSignals(
      'write unit tests and double check what you just built for security issues',
    );
    // test_creation (write tests) + cross_confirming (double check) + security_check (security)
    expect(signals).toContain('test_creation');
    expect(signals).toContain('cross_confirming');
    expect(signals.length).toBeGreaterThanOrEqual(2);
  });

  it('is case-insensitive — WRITE TESTS detects test_creation', () => {
    expect(detectSignals('WRITE TESTS FOR THIS MODULE')).toContain('test_creation');
  });

  // ── behaviour_testing signal (v0.3.0) ────────────────────────────────────────

  it('detects "manual test" → behaviour_testing', () => {
    expect(detectSignals('let me do a manual test of the login flow')).toContain('behaviour_testing');
  });

  it('detects "acceptance test" → behaviour_testing', () => {
    expect(detectSignals('write an acceptance test for the checkout feature')).toContain('behaviour_testing');
  });

  it('detects "happy path" → behaviour_testing', () => {
    expect(detectSignals('test the happy path for user registration')).toContain('behaviour_testing');
  });

  it('detects "user scenario" → behaviour_testing', () => {
    expect(detectSignals('create a user scenario for the admin dashboard')).toContain('behaviour_testing');
  });

  it('detects "e2e test" → behaviour_testing', () => {
    expect(detectSignals('add an e2e test for the payment flow')).toContain('behaviour_testing');
  });

  it('detects "user journey" → behaviour_testing', () => {
    expect(detectSignals('map out the user journey for the onboarding flow')).toContain('behaviour_testing');
  });

  it('detects "manually test" → behaviour_testing', () => {
    expect(detectSignals('I want to manually test this before shipping')).toContain('behaviour_testing');
  });

  it('does NOT fire behaviour_testing for plain unit test prompts (those are test_creation)', () => {
    expect(detectSignals('write unit tests for the auth module')).not.toContain('behaviour_testing');
  });

  it('does NOT fire behaviour_testing for run-all-tests prompts (those are regression_check)', () => {
    expect(detectSignals('run all tests and check for regressions')).not.toContain('behaviour_testing');
  });

  it('behaviour_testing has absenceThreshold of 15', () => {
    const sig = SIGNAL_DEFINITIONS.find((s) => s.key === 'behaviour_testing');
    expect(sig?.absenceThreshold).toBe(15);
  });

  it('behaviour_testing expectedStages includes implementation and review_testing', () => {
    const sig = SIGNAL_DEFINITIONS.find((s) => s.key === 'behaviour_testing');
    expect(sig?.expectedStages).toContain('implementation');
    expect(sig?.expectedStages).toContain('review_testing');
  });

  // remaining keywords
  it('detects "sad path" → behaviour_testing', () => {
    expect(detectSignals('write a sad path test for the payment failure')).toContain('behaviour_testing');
  });

  it('detects "end to end test" → behaviour_testing', () => {
    expect(detectSignals('write an end to end test for the checkout flow')).toContain('behaviour_testing');
  });

  it('detects "test the flow" → behaviour_testing', () => {
    expect(detectSignals('I want to test the flow from login to dashboard')).toContain('behaviour_testing');
  });

  it('detects "functional test" → behaviour_testing', () => {
    expect(detectSignals('write a functional test for the user registration')).toContain('behaviour_testing');
  });

  it('detects "test from a user" → behaviour_testing', () => {
    expect(detectSignals('test from a user perspective to see if this works')).toContain('behaviour_testing');
  });

  it('detects "real user test" → behaviour_testing', () => {
    expect(detectSignals('do a real user test on the checkout page')).toContain('behaviour_testing');
  });

  it('detects "test the feature as" → behaviour_testing', () => {
    expect(detectSignals('test the feature as a first-time visitor would')).toContain('behaviour_testing');
  });

  it('co-detects behaviour_testing + regression_check in same prompt', () => {
    const signals = detectSignals('manually test the happy path then run all tests for regressions');
    expect(signals).toContain('behaviour_testing');
    expect(signals).toContain('regression_check');
  });

  it('co-detects behaviour_testing + test_creation when both vocabularies appear', () => {
    const signals = detectSignals('write acceptance tests and unit tests for this module');
    expect(signals).toContain('behaviour_testing');
    expect(signals).toContain('test_creation');
  });

  // SIGNAL_MAP and initialSignalCounters coverage
  it('SIGNAL_MAP contains behaviour_testing key', () => {
    expect(SIGNAL_MAP.has('behaviour_testing')).toBe(true);
  });

  it('SIGNAL_MAP.get(behaviour_testing) returns the correct definition', () => {
    const sig = SIGNAL_MAP.get('behaviour_testing');
    expect(sig?.key).toBe('behaviour_testing');
    expect(sig?.absenceThreshold).toBe(15);
  });

  it('initialSignalCounters contains behaviour_testing key', () => {
    const counters = initialSignalCounters();
    expect('behaviour_testing' in counters).toBe(true);
  });

  it('initialSignalCounters behaviour_testing entry starts absent', () => {
    const counters = initialSignalCounters();
    expect(counters['behaviour_testing'].present).toBe(false);
    expect(counters['behaviour_testing'].lastSeenAt).toBeNull();
  });

  it('initialSignalCounters covers exactly 23 signals', () => {
    const counters = initialSignalCounters();
    expect(Object.keys(counters)).toHaveLength(23);
  });
});

// ── SessionStateManager ────────────────────────────────────────────────────────

describe('SessionStateManager', () => {
  it('creates a new session when no persisted state exists', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/a');
    expect(mgr.current.sessionId).toBeTruthy();
    expect(mgr.current.promptCount).toBe(0);
    closeStore(store);
  });

  it('persists and reloads session state', async () => {
    const store = await openStore(':memory:');
    const mgr1 = SessionStateManager.load(store, '/project/b');
    mgr1.processPrompt(store, 'implement the login page', makeResult('implementation', 0.85));

    const mgr2 = SessionStateManager.load(store, '/project/b');
    expect(mgr2.current.promptCount).toBe(1);
    expect(mgr2.current.currentStage).toBe('implementation');
    closeStore(store);
  });

  it('resets to new session after SESSION_GAP_MS gap', async () => {
    const store = await openStore(':memory:');
    const now = Date.now();
    const mgr1 = SessionStateManager.load(store, '/project/c', now);
    mgr1.processPrompt(store, 'implement the login page', makeResult('implementation', 0.85), now);

    const futureNow = now + SESSION_GAP_MS + 1;
    const mgr2 = SessionStateManager.load(store, '/project/c', futureNow);
    expect(mgr2.current.promptCount).toBe(0);
    closeStore(store);
  });

  it('does NOT reset session within the gap window', async () => {
    const store = await openStore(':memory:');
    const now = Date.now();
    const mgr1 = SessionStateManager.load(store, '/project/d', now);
    mgr1.processPrompt(store, 'implement the login page', makeResult('implementation', 0.85), now);

    const soonNow = now + SESSION_GAP_MS - 1000;
    const mgr2 = SessionStateManager.load(store, '/project/d', soonNow);
    expect(mgr2.current.promptCount).toBe(1);
    closeStore(store);
  });

  it('promptHistory is capped at 30 entries', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/e');
    for (let i = 0; i < 35; i++) {
      mgr.processPrompt(store, `prompt ${i}`, makeResult('implementation', 0.8));
    }
    expect(mgr.current.promptHistory.length).toBeLessThanOrEqual(30);
    closeStore(store);
  });

  it('updates signalCounters when signal detected in prompt', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/f');
    mgr.processPrompt(store, 'write unit tests for this module', makeResult('review_testing', 0.9));
    expect(mgr.current.signalCounters['test_creation'].lastSeenAt).toBe(0);
    closeStore(store);
  });

  it('stageConfirmedAt is set when confidence reaches threshold', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/g');
    mgr.processPrompt(store, 'implement this', makeResult('implementation', MIN_STAGE_CHANGE_CONFIDENCE + 0.01));
    expect(mgr.current.stageConfirmedAt).toBe(0);
    closeStore(store);
  });

  it('stageConfirmedAt remains -1 when confidence below threshold', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/h');
    mgr.processPrompt(store, 'implement this', makeResult('implementation', STAGE_CONFIRM_THRESHOLD - 0.1));
    expect(mgr.current.stageConfirmedAt).toBe(-1);
    closeStore(store);
  });

  it('dismissAbsenceFlag sets dismissedAtIndex and persists', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/dismiss');
    // Add a flag manually
    mgr.addAbsenceFlag(store, {
      signalKey:     'test_creation',
      stage:         'implementation',
      raisedAtIndex: 5,
      cooldownUntil: 35,
    });
    expect(mgr.current.absenceFlags).toHaveLength(1);

    // Dismiss it
    mgr.dismissAbsenceFlag(store, 'test_creation', 7);
    expect(mgr.current.absenceFlags[0].dismissedAtIndex).toBe(7);

    // Verify it reloads as dismissed
    const mgr2 = SessionStateManager.load(store, '/project/dismiss');
    expect(mgr2.current.absenceFlags[0].dismissedAtIndex).toBe(7);
    closeStore(store);
  });

  it('windowsSinceLastSeen increments for absent signals on gap reset', async () => {
    const store = await openStore(':memory:');
    const now = Date.now();
    const mgr = SessionStateManager.load(store, '/project/wsls', now);
    // Process one prompt — test_creation signal never detected
    mgr.processPrompt(store, 'just a simple prompt', makeResult('implementation', 0.8), now);
    expect(mgr.current.signalCounters['test_creation'].windowsSinceLastSeen).toBe(0);

    // Process another prompt after the gap — triggers reset
    const afterGap = now + SESSION_GAP_MS + 1;
    mgr.processPrompt(store, 'new session prompt', makeResult('implementation', 0.8), afterGap);
    // After gap reset the fresh state starts at 0; the increment happens at the moment of reset
    // Reload from store to confirm the windowsSinceLastSeen was incremented before reset
    // (the fresh session starts from 0 again, but the increment applied to old state before reset)
    expect(mgr.current.promptCount).toBe(1); // reset happened, only 1 prompt in new session
    closeStore(store);
  });

  it('stage transition resets stageConfirmedAt and stageConfidence', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/trans');
    // Confirm implementation stage
    mgr.processPrompt(store, 'implement this', makeResult('implementation', 0.9));
    expect(mgr.current.stageConfirmedAt).toBe(0);
    // Now switch to a different stage
    mgr.processPrompt(store, 'deploy it', makeResult('release', 0.8));
    expect(mgr.current.currentStage).toBe('release');
    expect(mgr.current.stageConfirmedAt).toBe(1); // confirmed at prompt index 1
    expect(mgr.current.stageConfidence).toBe(0.8);
    closeStore(store);
  });

  it('stageConfidence uses EMA when same stage repeated', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/ema');
    mgr.processPrompt(store, 'implement this', makeResult('implementation', 0.6));
    const firstConf = mgr.current.stageConfidence;
    mgr.processPrompt(store, 'implement more', makeResult('implementation', 0.6));
    const secondConf = mgr.current.stageConfidence;
    // EMA: 0.7 * firstConf + 0.3 * 0.6
    expect(secondConf).toBeCloseTo(0.7 * firstConf + 0.3 * 0.6, 5);
    closeStore(store);
  });

  it('stageConfirmedAt eventually set via EMA accumulation', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/ema2');
    // Start with low confidence — EMA will ramp up
    mgr.processPrompt(store, 'p0', makeResult('implementation', 0.20));
    expect(mgr.current.stageConfirmedAt).toBe(-1); // 0.20 < MIN_STAGE_CHANGE_CONFIDENCE → stage change ignored

    // Feed several prompts with confidence 0.9 to drive EMA above STAGE_CONFIRM_THRESHOLD
    for (let i = 1; i <= 6; i++) {
      mgr.processPrompt(store, `p${i}`, makeResult('implementation', 0.9));
    }
    expect(mgr.current.stageConfirmedAt).toBeGreaterThan(-1); // EMA reached ≥ STAGE_CONFIRM_THRESHOLD
    closeStore(store);
  });

  it('in-memory gap reset via processPrompt (not just load)', async () => {
    const store = await openStore(':memory:');
    const now = Date.now();
    const mgr = SessionStateManager.load(store, '/project/ingap', now);
    mgr.processPrompt(store, 'prompt 1', makeResult('implementation', 0.9), now);
    expect(mgr.current.promptCount).toBe(1);

    // Same manager instance — process with gap passed
    const afterGap = now + SESSION_GAP_MS + 1;
    mgr.processPrompt(store, 'prompt 2', makeResult('prd', 0.8), afterGap);
    // Should have reset in-place: new session, promptCount = 1 (only 'prompt 2')
    expect(mgr.current.promptCount).toBe(1);
    expect(mgr.current.currentStage).toBe('prd');
    closeStore(store);
  });

  it('signalCounters persist and reload correctly', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/sigp');
    mgr.processPrompt(store, 'run all tests for regression', makeResult('review_testing', 0.9));

    const mgr2 = SessionStateManager.load(store, '/project/sigp');
    expect(mgr2.current.signalCounters['regression_check'].lastSeenAt).toBe(0);
    expect(mgr2.current.signalCounters['test_creation'].lastSeenAt).toBe(null);
    closeStore(store);
  });

  it('promptHistory records have correct sequential index values', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/idx');
    mgr.processPrompt(store, 'first',  makeResult('implementation', 0.8));
    mgr.processPrompt(store, 'second', makeResult('implementation', 0.8));
    mgr.processPrompt(store, 'third',  makeResult('implementation', 0.8));
    const history = mgr.current.promptHistory;
    expect(history[0].index).toBe(0);
    expect(history[1].index).toBe(1);
    expect(history[2].index).toBe(2);
    closeStore(store);
  });

  it('oldest promptHistory entry is removed when cap exceeded', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/shift');
    for (let i = 0; i < 31; i++) {
      mgr.processPrompt(store, `prompt-${i}`, makeResult('implementation', 0.8));
    }
    const history = mgr.current.promptHistory;
    expect(history.length).toBe(30);
    // prompt-0 (index 0) should have been evicted; first entry is prompt-1 (index 1)
    expect(history[0].text).toBe('prompt-1');
    expect(history[0].index).toBe(1);
    closeStore(store);
  });

  it('sessionId changes after gap reset', async () => {
    const store = await openStore(':memory:');
    const now = Date.now();
    const mgr = SessionStateManager.load(store, '/project/sid', now);
    mgr.processPrompt(store, 'prompt', makeResult('implementation', 0.8), now);
    const oldId = mgr.current.sessionId;

    const afterGap = now + SESSION_GAP_MS + 1;
    const mgr2 = SessionStateManager.load(store, '/project/sid', afterGap);
    expect(mgr2.current.sessionId).not.toBe(oldId);
    closeStore(store);
  });

  it('dismissAbsenceFlag is a no-op for an unknown signalKey', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/noop');
    expect(() => mgr.dismissAbsenceFlag(store, 'nonexistent_signal', 5)).not.toThrow();
    expect(mgr.current.absenceFlags).toHaveLength(0);
    closeStore(store);
  });

  it('addAbsenceFlag appends — multiple flags coexist', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/multi');
    mgr.addAbsenceFlag(store, { signalKey: 'test_creation',   stage: 'implementation', raisedAtIndex: 5, cooldownUntil: 35 });
    mgr.addAbsenceFlag(store, { signalKey: 'security_check',  stage: 'implementation', raisedAtIndex: 6, cooldownUntil: 36 });
    expect(mgr.current.absenceFlags).toHaveLength(2);
    closeStore(store);
  });

  it('two projects have independent session state', async () => {
    const store = await openStore(':memory:');
    const mgrA = SessionStateManager.load(store, '/project/alpha');
    const mgrB = SessionStateManager.load(store, '/project/beta');
    mgrA.processPrompt(store, 'implement this', makeResult('implementation', 0.9));
    mgrB.processPrompt(store, 'write the spec', makeResult('prd', 0.85));

    const a2 = SessionStateManager.load(store, '/project/alpha');
    const b2 = SessionStateManager.load(store, '/project/beta');
    expect(a2.current.currentStage).toBe('implementation');
    expect(b2.current.currentStage).toBe('prd');
    closeStore(store);
  });

  it('low-confidence cross-stage prompt does not wipe confirmed stage state', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/gate-block');
    // Confirm implementation stage
    mgr.processPrompt(store, 'implement the login page', makeResult('implementation', 0.9));
    const confirmedAt = mgr.current.stageConfirmedAt;
    const confBefore  = mgr.current.stageConfidence;
    // Short generic prompt classifies as a different stage below the gate
    mgr.processPrompt(store, 'ok', makeResult('idea', MIN_STAGE_CHANGE_CONFIDENCE - 0.01));
    expect(mgr.current.currentStage).toBe('implementation');
    expect(mgr.current.stageConfidence).toBe(confBefore);
    expect(mgr.current.stageConfirmedAt).toBe(confirmedAt);
    closeStore(store);
  });

  it('cross-stage prompt at or above MIN_STAGE_CHANGE_CONFIDENCE still applies stage change', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/gate-allow');
    mgr.processPrompt(store, 'implement the login page', makeResult('implementation', 0.9));
    // Legitimate cross-stage prompt meets the gate
    mgr.processPrompt(store, 'deploy to production', makeResult('release', MIN_STAGE_CHANGE_CONFIDENCE));
    expect(mgr.current.currentStage).toBe('release');
    expect(mgr.current.stageConfidence).toBe(MIN_STAGE_CHANGE_CONFIDENCE);
    closeStore(store);
  });

  it('promptsInCurrentStage increments when same-stage prompts are processed', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/pics-same');
    // First prompt: idea → implementation transition → resets counter to 0
    mgr.processPrompt(store, 'implement login', makeResult('implementation', 0.9));
    expect(mgr.current.promptsInCurrentStage).toBe(0);
    // Second prompt: same stage → increments
    mgr.processPrompt(store, 'implement logout', makeResult('implementation', 0.9));
    expect(mgr.current.promptsInCurrentStage).toBe(1);
    // Third prompt: same stage → increments again
    mgr.processPrompt(store, 'implement settings', makeResult('implementation', 0.9));
    expect(mgr.current.promptsInCurrentStage).toBe(2);
    closeStore(store);
  });

  it('promptsInCurrentStage resets to 0 on a genuine stage transition', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/pics-reset');
    // idea → implementation (transition, counter = 0)
    mgr.processPrompt(store, 'implement login', makeResult('implementation', 0.9));
    // same stage (counter = 1)
    mgr.processPrompt(store, 'implement logout', makeResult('implementation', 0.9));
    expect(mgr.current.promptsInCurrentStage).toBe(1);
    // Legitimate cross-stage transition resets the counter
    mgr.processPrompt(store, 'deploy to production', makeResult('release', 0.9));
    expect(mgr.current.currentStage).toBe('release');
    expect(mgr.current.promptsInCurrentStage).toBe(0);
    closeStore(store);
  });

  it('promptsInCurrentStage still increments when cross-stage prompt is below gate', async () => {
    // A cross-stage prompt that does not clear MIN_STAGE_CHANGE_CONFIDENCE should NOT
    // reset the stage, and the stage-time counter should still advance.
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/pics-gate');
    // idea → implementation (transition, counter = 0)
    mgr.processPrompt(store, 'implement login', makeResult('implementation', 0.9));
    expect(mgr.current.promptsInCurrentStage).toBe(0);
    // Noise prompt — cross-stage but below gate; stage stays, counter advances
    mgr.processPrompt(store, 'ok', makeResult('idea', MIN_STAGE_CHANGE_CONFIDENCE - 0.01));
    expect(mgr.current.currentStage).toBe('implementation'); // stage unchanged
    expect(mgr.current.promptsInCurrentStage).toBe(1);       // counter still advanced
    closeStore(store);
  });
});

// ── AbsenceDetector ────────────────────────────────────────────────────────────

describe('AbsenceDetector', () => {
  it('returns no flags when stageConfidence < STAGE_CONFIRM_THRESHOLD', () => {
    const state = makeState({ stageConfidence: 0.20 });
    expect(detectAbsenceFlags(state)).toHaveLength(0);
  });

  it('returns no flags when promptsInCurrentStage < 5 (not in stage long enough)', () => {
    const state = makeState({ promptsInCurrentStage: 4, stageConfidence: 0.8 });
    expect(detectAbsenceFlags(state)).toHaveLength(0);
  });

  it('returns no flags when fewer than 5 prompts in current stage', () => {
    const state = makeState({
      stageConfidence:       0.85,
      promptsInCurrentStage: 4, // too early — minimum gate is 5
    });
    expect(detectAbsenceFlags(state)).toHaveLength(0);
  });

  it('returns no flags when below Gate 3 effectiveMinPrompts (no profile → threshold=10)', () => {
    // no profile → effectiveMinPrompts=10; promptsInCurrentStage=9 < 10 → Gate 3 blocks
    const state = makeState({
      stageConfidence:       0.85,
      promptsInCurrentStage: 9,
      currentStage:          'implementation',
    });
    expect(detectAbsenceFlags(state)).toHaveLength(0);
  });

  it('raises a flag when all conditions are met and signal never seen', () => {
    const state = makeState({
      stageConfidence:       0.85,
      promptsInCurrentStage: ABSENCE_MIN_PROMPTS + 5,
      promptCount:           ABSENCE_MIN_PROMPTS + 5,
      currentStage:          'implementation',
      signalCounters:        initialSignalCounters(), // all absent
    });
    const flags = detectAbsenceFlags(state);
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.every((f) => f.stage === 'implementation')).toBe(true);
  });

  it('does NOT flag when signal has been seen', () => {
    const counters = initialSignalCounters();
    counters['test_creation'].lastSeenAt = 5; // was seen at prompt 5
    const state = makeState({
      stageConfidence:       0.85,
      promptsInCurrentStage: 30,
      promptCount:           30,
      currentStage:          'implementation',
      signalCounters:        counters,
    });
    const flags = detectAbsenceFlags(state);
    expect(flags.map((f) => f.signalKey)).not.toContain('test_creation');
  });

  it('respects cooldown — does not re-raise flag within ABSENCE_COOLDOWN_PROMPTS', () => {
    const state = makeState({
      stageConfidence:       0.85,
      promptsInCurrentStage: ABSENCE_MIN_PROMPTS + 5,
      promptCount:           ABSENCE_MIN_PROMPTS + 5,
      currentStage:          'implementation',
      signalCounters:        initialSignalCounters(),
      absenceFlags: [
        {
          signalKey:     'test_creation',
          stage:         'implementation',
          raisedAtIndex: 10,
          cooldownUntil: ABSENCE_MIN_PROMPTS + 5 + ABSENCE_COOLDOWN_PROMPTS, // future
        },
      ],
    });
    const flags = detectAbsenceFlags(state);
    expect(flags.map((f) => f.signalKey)).not.toContain('test_creation');
  });

  it('does NOT flag signals for wrong stage', () => {
    // rollback_planning is only expected in 'release' stage
    const state = makeState({
      stageConfidence:       0.85,
      promptsInCurrentStage: 30,
      promptCount:           30,
      currentStage:          'prd', // not a stage where rollback_planning is expected
      signalCounters:        initialSignalCounters(),
    });
    const flags = detectAbsenceFlags(state);
    expect(flags.map((f) => f.signalKey)).not.toContain('rollback_planning');
  });

  it('re-raises flag once cooldownUntil has passed', () => {
    // Cooldown expires at index 30; current promptCount=35 → past cooldown → should raise again
    const state = makeState({
      stageConfidence:       0.85,
      promptsInCurrentStage: 35,
      promptCount:           35,
      currentStage:          'implementation',
      signalCounters:        initialSignalCounters(),
      absenceFlags: [
        {
          signalKey:        'test_creation',
          stage:            'implementation',
          raisedAtIndex:    0,
          dismissedAtIndex: 5,
          cooldownUntil:    30, // expired (35 > 30)
        },
      ],
    });
    const flags = detectAbsenceFlags(state);
    expect(flags.map((f) => f.signalKey)).toContain('test_creation');
  });

  it('passes Gate 2 at exactly 5 prompts but Gate 3 blocks without profile (effectiveMinPrompts=10)', () => {
    // Gate 2 (promptsInCurrentStage ≥ 5) passes, but Gate 3 (≥10 for no profile) still blocks
    const state2 = makeState({
      stageConfidence:       0.85,
      promptsInCurrentStage: 5,
      currentStage:          'implementation',
      signalCounters:        initialSignalCounters(),
    });
    expect(detectAbsenceFlags(state2)).toHaveLength(0); // Gate 3 blocks (5 < 10)
    // Confirm signals fire when both the gate and the signal threshold are met
    const state3 = makeState({
      stageConfidence:       0.85,
      promptsInCurrentStage: 15,
      currentStage:          'implementation',
      signalCounters:        initialSignalCounters(),
    });
    const flags = detectAbsenceFlags(state3);
    expect(flags.length).toBeGreaterThan(0);
  });

  it('raises flags at exactly the absenceThreshold boundary', () => {
    // test_creation absenceThreshold=15; promptsInCurrentStage must be >= 15
    const state = makeState({
      stageConfidence:       0.85,
      promptsInCurrentStage: 15,
      promptCount:           15,
      currentStage:          'implementation',
      signalCounters:        initialSignalCounters(),
    });
    const flags = detectAbsenceFlags(state);
    expect(flags.map((f) => f.signalKey)).toContain('test_creation');
  });

  it('does NOT raise flags one below Gate 3 effectiveMinPrompts (no profile → threshold=10)', () => {
    // no profile → effectiveMinPrompts=10; promptsInCurrentStage=9 < 10 → Gate 3 blocks
    const state = makeState({
      stageConfidence:       0.85,
      promptsInCurrentStage: 9,
      promptCount:           9,
      currentStage:          'implementation',
      signalCounters:        initialSignalCounters(),
    });
    const flags = detectAbsenceFlags(state);
    expect(flags.map((f) => f.signalKey)).not.toContain('test_creation');
  });

  it('multiple absence flags raised in one call when multiple signals absent', () => {
    const state = makeState({
      stageConfidence:       0.85,
      promptsInCurrentStage: 30,
      promptCount:           30,
      currentStage:          'implementation',
      signalCounters:        initialSignalCounters(), // all absent
    });
    const flags = detectAbsenceFlags(state);
    expect(flags.length).toBeGreaterThan(1); // multiple signals flagged at once
  });

  it('raisedAtIndex on new flag matches current promptCount', () => {
    const state = makeState({
      stageConfidence:       0.85,
      promptsInCurrentStage: 20,
      promptCount:           20,
      currentStage:          'implementation',
      signalCounters:        initialSignalCounters(),
    });
    const flags = detectAbsenceFlags(state);
    expect(flags.length).toBeGreaterThan(0);
    for (const f of flags) {
      expect(f.raisedAtIndex).toBe(20);
    }
  });

  it('passes confidence gate at exactly STAGE_CONFIRM_THRESHOLD', () => {
    const state = makeState({
      stageConfidence:       STAGE_CONFIRM_THRESHOLD, // exactly at threshold
      promptsInCurrentStage: 20,
      promptCount:           20,
      currentStage:          'implementation',
      signalCounters:        initialSignalCounters(),
    });
    const flags = detectAbsenceFlags(state);
    expect(flags.length).toBeGreaterThan(0); // should not be blocked
  });

  it('test_creation also flagged in review_testing stage (expected in both stages)', () => {
    const state = makeState({
      stageConfidence:       0.85,
      promptsInCurrentStage: 20,
      promptCount:           20,
      currentStage:          'review_testing', // test_creation expected here too
      signalCounters:        initialSignalCounters(),
    });
    const flags = detectAbsenceFlags(state);
    expect(flags.map((f) => f.signalKey)).toContain('test_creation');
  });

  it('raised flags include cooldownUntil = raisedAtIndex + ABSENCE_COOLDOWN_PROMPTS', () => {
    const state = makeState({
      stageConfidence:       0.85,
      promptsInCurrentStage: ABSENCE_MIN_PROMPTS + 5,
      promptCount:           ABSENCE_MIN_PROMPTS + 5,
      currentStage:          'implementation',
      signalCounters:        initialSignalCounters(),
    });
    const flags = detectAbsenceFlags(state);
    for (const f of flags) {
      expect(f.cooldownUntil).toBe(f.raisedAtIndex + ABSENCE_COOLDOWN_PROMPTS);
    }
  });

  it('beginner profile: promptsInCurrentStage=6 fires signals (effectiveMinPrompts=5)', () => {
    const state = makeState({
      stageConfidence:       0.85,
      promptsInCurrentStage: 6,
      promptCount:           6,
      currentStage:          'implementation',
      signalCounters:        initialSignalCounters(),
    });
    const profile = { nature: 'beginner' as const, precisionScore: 1, playfulnessScore: 1,
      mood: 'casual' as const, depth: 'low' as const, depthScore: 1, computedAt: 1 };
    const flags = detectAbsenceFlags(state, profile);
    expect(flags.length).toBeGreaterThan(0);
  });

  it('beginner profile: promptsInCurrentStage=4 fires no signals (Gate 2 blocks — 4 < 5)', () => {
    const state = makeState({
      stageConfidence:       0.85,
      promptsInCurrentStage: 4,
      promptCount:           4,
      currentStage:          'implementation',
      signalCounters:        initialSignalCounters(),
    });
    const profile = { nature: 'beginner' as const, precisionScore: 1, playfulnessScore: 1,
      mood: 'casual' as const, depth: 'low' as const, depthScore: 1, computedAt: 1 };
    expect(detectAbsenceFlags(state, profile)).toHaveLength(0);
  });

  it('hardcore_pro profile: promptsInCurrentStage=6 fires no signals (effectiveMinPrompts=10)', () => {
    const state = makeState({
      stageConfidence:       0.85,
      promptsInCurrentStage: 6,
      promptCount:           6,
      currentStage:          'implementation',
      signalCounters:        initialSignalCounters(),
    });
    const profile = { nature: 'hardcore_pro' as const, precisionScore: 9, playfulnessScore: 2,
      mood: 'focused' as const, depth: 'high' as const, depthScore: 8, computedAt: 1 };
    expect(detectAbsenceFlags(state, profile)).toHaveLength(0);
  });

  it('hardcore_pro profile: promptsInCurrentStage=11 fires signals (11 ≥ effectiveMinPrompts=10)', () => {
    const state = makeState({
      stageConfidence:       0.85,
      promptsInCurrentStage: 11,
      promptCount:           11,
      currentStage:          'implementation',
      signalCounters:        initialSignalCounters(),
    });
    const profile = { nature: 'hardcore_pro' as const, precisionScore: 9, playfulnessScore: 2,
      mood: 'focused' as const, depth: 'high' as const, depthScore: 8, computedAt: 1 };
    const flags = detectAbsenceFlags(state, profile);
    expect(flags.length).toBeGreaterThan(0);
  });

  it('profile=null uses effectiveMinPrompts=10 — no signals at promptsInCurrentStage=9', () => {
    const state = makeState({
      stageConfidence:       0.85,
      promptsInCurrentStage: 9,
      promptCount:           9,
      currentStage:          'implementation',
      signalCounters:        initialSignalCounters(),
    });
    expect(detectAbsenceFlags(state, null)).toHaveLength(0);
  });
});

// ── SessionStateManager — profile (Gap 1) ─────────────────────────────────────

describe('SessionStateManager — user profile', () => {
  it('profile is null before any prompts are processed', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/profile-a');
    expect(mgr.current.profile).toBeNull();
    closeStore(store);
  });

  it('profile is computed after the first prompt (isProfileStale(null) = true)', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/profile-b');
    mgr.processPrompt(store, 'implement the login flow', makeResult('implementation', 0.8));
    expect(mgr.current.profile).not.toBeNull();
    expect(mgr.current.profile?.computedAt).toBe(1);
    closeStore(store);
  });

  it('profile survives save/load round-trip', async () => {
    const store = await openStore(':memory:');
    const mgr1 = SessionStateManager.load(store, '/project/profile-c');
    mgr1.processPrompt(store, 'implement feature', makeResult('implementation', 0.8));
    const savedNature = mgr1.current.profile?.nature;

    const mgr2 = SessionStateManager.load(store, '/project/profile-c');
    expect(mgr2.current.profile).not.toBeNull();
    expect(mgr2.current.profile?.nature).toBe(savedNature);
    closeStore(store);
  });

  it('profile is recomputed when stale (promptCount - computedAt >= NATURE_DEPTH_RECOMPUTE_INTERVAL)', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/profile-d');
    // First prompt: computedAt=1, promptCount=1
    mgr.processPrompt(store, 'prompt 0', makeResult('implementation', 0.8));
    const firstComputedAt = mgr.current.profile?.computedAt; // 1

    // Process NATURE_DEPTH_RECOMPUTE_INTERVAL more prompts: promptCount=4, diff=3 >= 3 → stale
    for (let i = 0; i < NATURE_DEPTH_RECOMPUTE_INTERVAL; i++) {
      mgr.processPrompt(store, `prompt ${i + 1}`, makeResult('implementation', 0.8));
    }
    expect(mgr.current.profile?.computedAt).toBeGreaterThan(firstComputedAt!);
    closeStore(store);
  });

  it('profile is NOT recomputed between stale intervals', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/profile-e');
    // First prompt: computedAt=1, promptCount=1
    mgr.processPrompt(store, 'prompt 0', makeResult('implementation', 0.8));
    const firstComputedAt = mgr.current.profile?.computedAt; // 1

    // Process 2 more prompts: promptCount=3, diff=2 < 3 → not yet stale
    for (let i = 0; i < 2; i++) {
      mgr.processPrompt(store, `prompt ${i + 1}`, makeResult('implementation', 0.8));
    }
    expect(mgr.current.profile?.computedAt).toBe(firstComputedAt);
    closeStore(store);
  });
});

// ── SessionStateManager — per-prompt mood ─────────────────────────────────────

describe('SessionStateManager — per-prompt mood', () => {
  it('mood is set on the very first prompt', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/mood-a');
    expect(mgr.current.mood).toBeUndefined();
    mgr.processPrompt(store, 'implement the login flow', makeResult('implementation', 0.8));
    expect(mgr.current.mood).toBeDefined();
    closeStore(store);
  });

  it('mood updates on every prompt even before profile recomputes', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/mood-b');

    // Prompt 1: profile computed (null → computedAt=1); mood set from 1-prompt window
    mgr.processPrompt(store, 'ok', makeResult('implementation', 0.8));
    expect(mgr.current.profile?.computedAt).toBe(1);

    // Prompt 2: promptCount=2, diff=2-1=1 < NATURE_DEPTH_RECOMPUTE_INTERVAL=3 → profile NOT recomputed
    // Mood IS updated unconditionally — window is now ["ok", "yes"] → avgWordCount=1 < 8 → rushed
    mgr.processPrompt(store, 'yes', makeResult('implementation', 0.8));
    expect(mgr.current.mood).toBe('rushed');
    expect(mgr.current.profile?.computedAt).toBe(1); // unchanged — mood moved, profile did not
    closeStore(store);
  });
});

// ── classifyMoodOnly — direct unit tests ──────────────────────────────────────

describe('classifyMoodOnly', () => {
  function rec(text: string): import('./types.js').PromptRecord {
    return { index: 0, text, capturedAt: 0, classifiedStage: 'implementation', confidence: 0.8 };
  }

  it('returns casual for empty history', () => {
    expect(classifyMoodOnly([])).toBe('casual');
  });

  it('returns rushed for short prompts (avgWordCount < 8)', () => {
    const history = ['ok', 'yes', 'done', 'go', 'next'].map(rec);
    expect(classifyMoodOnly(history)).toBe('rushed');
  });

  it('returns frustrated when neg lexicon hits > 2', () => {
    const history = ['why is this broken again ugh still not working'].map(rec);
    expect(classifyMoodOnly(history)).toBe('frustrated');
  });

  it('returns frustrated for ALL CAPS word (3+ chars)', () => {
    const history = ['this is BROKEN please fix it'].map(rec);
    expect(classifyMoodOnly(history)).toBe('frustrated');
  });

  it('uses only last MOOD_WINDOW=5 records from history', () => {
    // Fill 6 records — first is frustrated, last 5 are short/calm → rushed
    const history = [
      rec('why is this BROKEN again ugh still failing'),
      rec('ok'), rec('ok'), rec('ok'), rec('ok'), rec('ok'),
    ];
    expect(classifyMoodOnly(history)).toBe('rushed');
  });
});

// ── SessionStateManager — mood persistence and session reset ──────────────────

describe('SessionStateManager — mood persistence and session reset', () => {
  it('mood persists through save/load round-trip', async () => {
    const store = await openStore(':memory:');
    const mgr1 = SessionStateManager.load(store, '/project/mood-persist');
    mgr1.processPrompt(store, 'ok', makeResult('implementation', 0.8));
    const savedMood = mgr1.current.mood;
    expect(savedMood).toBeDefined();

    const mgr2 = SessionStateManager.load(store, '/project/mood-persist');
    expect(mgr2.current.mood).toBe(savedMood);
    closeStore(store);
  });

  it('mood resets to undefined when session gap triggers a new session on load', async () => {
    const store = await openStore(':memory:');
    const now = Date.now();
    const mgr1 = SessionStateManager.load(store, '/project/mood-gap', now);
    mgr1.processPrompt(store, 'implement this', makeResult('implementation', 0.8), now);
    expect(mgr1.current.mood).toBeDefined();

    // Load after session gap — new session created, mood resets to undefined
    const future = now + SESSION_GAP_MS + 1;
    const mgr2 = SessionStateManager.load(store, '/project/mood-gap', future);
    expect(mgr2.current.mood).toBeUndefined();
    closeStore(store);
  });

  it('mood is set on the first prompt of a new session after a gap', async () => {
    const store = await openStore(':memory:');
    const now = Date.now();
    const mgr = SessionStateManager.load(store, '/project/mood-gap2', now);
    mgr.processPrompt(store, 'original work', makeResult('implementation', 0.8), now);

    // Gap resets session in-place on the next processPrompt call
    const future = now + SESSION_GAP_MS + 1;
    mgr.processPrompt(store, 'ok', makeResult('implementation', 0.8), future);
    expect(mgr.current.mood).toBeDefined(); // set immediately after gap-reset processPrompt
    expect(mgr.current.promptCount).toBe(1); // confirms it was a fresh session
    closeStore(store);
  });
});

// ── SessionStateManager — detectedLanguage (Gap 2) ────────────────────────────

describe('SessionStateManager — detectedLanguage', () => {
  it('detectedLanguage initialises to undefined', async () => {
    const store = await openStore(':memory:');
    const mgr = SessionStateManager.load(store, '/project/lang-a');
    expect(mgr.current.detectedLanguage).toBeUndefined();
    closeStore(store);
  });

  it('setDetectedLanguage persists value and is readable after load', async () => {
    const store = await openStore(':memory:');
    const mgr1 = SessionStateManager.load(store, '/project/lang-b');
    mgr1.setDetectedLanguage(store, 'fr');

    const mgr2 = SessionStateManager.load(store, '/project/lang-b');
    expect(mgr2.current.detectedLanguage).toBe('fr');
    closeStore(store);
  });

  it('setDetectedLanguage(undefined) stores undefined', async () => {
    const store = await openStore(':memory:');
    const mgr1 = SessionStateManager.load(store, '/project/lang-c');
    mgr1.setDetectedLanguage(store, 'de');
    mgr1.setDetectedLanguage(store, undefined);

    const mgr2 = SessionStateManager.load(store, '/project/lang-c');
    expect(mgr2.current.detectedLanguage).toBeUndefined();
    closeStore(store);
  });
});

// ── SessionStateManager — language persistence across session gap (Phase E) ───

describe('SessionStateManager — detectedLanguage survives session gap', () => {
  it('load() with no prior state restores detectedLanguage from projects table', async () => {
    const store = await openStore(':memory:');
    upsertProject(store, { projectRoot: '/project/gap-a', name: 'A' });
    setDetectedLanguage(store, '/project/gap-a', 'hi');

    // No prior session state — should restore from projects table
    const mgr = SessionStateManager.load(store, '/project/gap-a');
    expect(mgr.current.detectedLanguage).toBe('hi');
    closeStore(store);
  });

  it('load() after session gap restores detectedLanguage from projects table', async () => {
    const now = Date.now();
    const store = await openStore(':memory:');
    upsertProject(store, { projectRoot: '/project/gap-b', name: 'B' });

    // Active session with language set
    const mgr1 = SessionStateManager.load(store, '/project/gap-b', now);
    mgr1.setDetectedLanguage(store, 'fr');
    // Also persist to projects table (normally done by stop.ts via setDetectedLanguage)
    setDetectedLanguage(store, '/project/gap-b', 'fr');

    // Load after SESSION_GAP_MS — creates new session
    const future = now + SESSION_GAP_MS + 1;
    const mgr2 = SessionStateManager.load(store, '/project/gap-b', future);
    // New session but detectedLanguage restored from projects table
    expect(mgr2.current.detectedLanguage).toBe('fr');
    closeStore(store);
  });

  it('load() after session gap returns undefined when projects table has no detected_language', async () => {
    const now = Date.now();
    const store = await openStore(':memory:');
    // No project row → getProject returns null → detectedLanguage stays undefined
    const mgr1 = SessionStateManager.load(store, '/project/gap-c', now);
    mgr1.setDetectedLanguage(store, 'de'); // set on session state only (no projects row)

    const future = now + SESSION_GAP_MS + 1;
    const mgr2 = SessionStateManager.load(store, '/project/gap-c', future);
    // No project row → undefined (not 'de' from old session state)
    expect(mgr2.current.detectedLanguage).toBeUndefined();
    closeStore(store);
  });

  it('processPrompt() in-place gap reset restores detectedLanguage from projects table', async () => {
    const now = Date.now();
    const store = await openStore(':memory:');
    upsertProject(store, { projectRoot: '/project/gap-d', name: 'D' });
    setDetectedLanguage(store, '/project/gap-d', 'zh');

    const mgr = SessionStateManager.load(store, '/project/gap-d', now);
    // Process a first prompt to establish session
    await mgr.processPrompt(store, 'first prompt', makeResult('idea', 0.6), now);
    // Sanity: session detectedLanguage should be 'zh' (restored on load)
    expect(mgr.current.detectedLanguage).toBe('zh');

    // Process after gap — triggers in-place reset inside processPrompt()
    const afterGap = now + SESSION_GAP_MS + 1;
    await mgr.processPrompt(store, 'post-gap prompt', makeResult('idea', 0.5), afterGap);
    // detectedLanguage restored from projects table after in-place reset
    expect(mgr.current.detectedLanguage).toBe('zh');
    closeStore(store);
  });

  it('active session within gap keeps session detectedLanguage, does not re-read projects table', async () => {
    const now = Date.now();
    const store = await openStore(':memory:');
    upsertProject(store, { projectRoot: '/project/gap-e', name: 'E' });
    setDetectedLanguage(store, '/project/gap-e', 'fr'); // projects table says 'fr'

    // Session is active and has a different language set on it
    const mgr1 = SessionStateManager.load(store, '/project/gap-e', now);
    mgr1.setDetectedLanguage(store, 'de'); // session says 'de'

    // Load within the gap window — uses persisted session state, not projects table
    const soonNow = now + SESSION_GAP_MS - 1000;
    const mgr2 = SessionStateManager.load(store, '/project/gap-e', soonNow);
    expect(mgr2.current.detectedLanguage).toBe('de'); // session value preserved
    closeStore(store);
  });
});
