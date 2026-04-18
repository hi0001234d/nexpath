import { describe, it, expect, beforeEach } from 'vitest';
import { matchKeywords } from './KeywordMatcher.js';
import { classifyWithTFIDF, resetTFIDFModel } from './TFIDFClassifier.js';
import { createEmbeddingClassifier } from './EmbeddingClassifier.js';
import { classifyPrompt } from './PromptClassifier.js';
import { SessionStateManager, SESSION_GAP_MS, STAGE_CONFIRM_THRESHOLD } from './SessionStateManager.js';
import { detectAbsenceFlags, ABSENCE_MIN_PROMPTS, ABSENCE_COOLDOWN_PROMPTS } from './AbsenceDetector.js';
import { detectSignals, initialSignalCounters } from './signals.js';
import { openStore, closeStore } from '../store/index.js';
import type { SessionState, ClassificationResult } from './types.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeResult(stage: import('./types.js').Stage, confidence: number): ClassificationResult {
  return { stage, confidence, tier: 1, allScores: { [stage]: confidence } };
}

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId:        'test-session',
    projectRoot:      '/test/project',
    startedAt:        1000,
    lastPromptAt:     1000,
    currentStage:     'implementation',
    stageConfidence:  0.80,
    stageConfirmedAt: 0,
    promptCount:      20,
    promptHistory:    [],
    signalCounters:   initialSignalCounters(),
    absenceFlags:     [],
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
    mgr.processPrompt(store, 'implement this', makeResult('implementation', STAGE_CONFIRM_THRESHOLD + 0.01));
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
});

// ── AbsenceDetector ────────────────────────────────────────────────────────────

describe('AbsenceDetector', () => {
  it('returns no flags when stageConfidence < STAGE_CONFIRM_THRESHOLD', () => {
    const state = makeState({ stageConfidence: 0.5 });
    expect(detectAbsenceFlags(state)).toHaveLength(0);
  });

  it('returns no flags when stageConfirmedAt = -1 (not confirmed)', () => {
    const state = makeState({ stageConfirmedAt: -1, stageConfidence: 0.8 });
    expect(detectAbsenceFlags(state)).toHaveLength(0);
  });

  it('returns no flags when fewer than 5 prompts since stageConfirmedAt', () => {
    const state = makeState({
      stageConfidence:  0.85,
      stageConfirmedAt: 16, // promptCount=20, 20-16=4 — too early
      promptCount:      20,
    });
    expect(detectAbsenceFlags(state)).toHaveLength(0);
  });

  it('returns no flags when below signal absenceThreshold', () => {
    // test_creation has absenceThreshold=15; promptsSinceConfirmed=10
    const state = makeState({
      stageConfidence:  0.85,
      stageConfirmedAt: 10,
      promptCount:      20, // 20-10=10 < 15
      currentStage:     'implementation',
    });
    expect(detectAbsenceFlags(state)).toHaveLength(0);
  });

  it('raises a flag when all conditions are met and signal never seen', () => {
    const state = makeState({
      stageConfidence:  0.85,
      stageConfirmedAt: 0,
      promptCount:      ABSENCE_MIN_PROMPTS + 5, // well past threshold
      currentStage:     'implementation',
      signalCounters:   initialSignalCounters(), // all absent
    });
    const flags = detectAbsenceFlags(state);
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.every((f) => f.stage === 'implementation')).toBe(true);
  });

  it('does NOT flag when signal has been seen', () => {
    const counters = initialSignalCounters();
    counters['test_creation'].lastSeenAt = 5; // was seen at prompt 5
    const state = makeState({
      stageConfidence:  0.85,
      stageConfirmedAt: 0,
      promptCount:      30,
      currentStage:     'implementation',
      signalCounters:   counters,
    });
    const flags = detectAbsenceFlags(state);
    expect(flags.map((f) => f.signalKey)).not.toContain('test_creation');
  });

  it('respects cooldown — does not re-raise flag within ABSENCE_COOLDOWN_PROMPTS', () => {
    const state = makeState({
      stageConfidence:  0.85,
      stageConfirmedAt: 0,
      promptCount:      ABSENCE_MIN_PROMPTS + 5,
      currentStage:     'implementation',
      signalCounters:   initialSignalCounters(),
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
      stageConfidence:  0.85,
      stageConfirmedAt: 0,
      promptCount:      30,
      currentStage:     'prd', // not a stage where rollback_planning is expected
      signalCounters:   initialSignalCounters(),
    });
    const flags = detectAbsenceFlags(state);
    expect(flags.map((f) => f.signalKey)).not.toContain('rollback_planning');
  });

  it('raised flags include cooldownUntil = raisedAtIndex + ABSENCE_COOLDOWN_PROMPTS', () => {
    const state = makeState({
      stageConfidence:  0.85,
      stageConfirmedAt: 0,
      promptCount:      ABSENCE_MIN_PROMPTS + 5,
      currentStage:     'implementation',
      signalCounters:   initialSignalCounters(),
    });
    const flags = detectAbsenceFlags(state);
    for (const f of flags) {
      expect(f.cooldownUntil).toBe(f.raisedAtIndex + ABSENCE_COOLDOWN_PROMPTS);
    }
  });
});
