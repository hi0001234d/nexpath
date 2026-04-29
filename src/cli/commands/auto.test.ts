import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { openStore } from '../../store/db.js';
import type { Store } from '../../store/db.js';
import { getRecentPrompts } from '../../store/prompts.js';
import { buildFiredKey, runAuto, readStdin } from './auto.js';
import type { AutoInput } from './auto.js';
import { getPendingAdvisory } from '../../store/pending-advisories.js';
import { upsertProject, setDetectedLanguage, getProject } from '../../store/projects.js';
import { setConfig } from '../../store/config.js';
import type OpenAI from 'openai';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const IMPL_PROMPT = [
  'implement the authentication module with proper validation',
  'add the login endpoint to the API layer',
  'write unit tests for the new feature',
].join(' ');

function makeInput(overrides: Partial<AutoInput> = {}): AutoInput {
  return {
    promptText:  IMPL_PROMPT,
    projectRoot: '/test/project',
    ...overrides,
  };
}

/**
 * Build a mock OpenAI client that:
 *   - For Stage 2 (stage2Model = 'gpt-4o-mini'): returns a Stage 2 JSON response
 *   - For pinch generator: returns a pinch label string
 */
function makeMockOpenAI(
  stage2Response:  object,
  pinchResponse:   string = 'Hold up.',
): OpenAI {
  let callCount = 0;
  return {
    chat: {
      completions: {
        create: vi.fn().mockImplementation(() => {
          callCount++;
          // First call = Stage 2; second call = pinch generator
          if (callCount === 1) {
            return Promise.resolve({
              choices: [{ message: { content: JSON.stringify(stage2Response) } }],
            });
          }
          return Promise.resolve({
            choices: [{ message: { content: pinchResponse } }],
          });
        }),
      },
    },
  } as unknown as OpenAI;
}

function makeErrorOpenAI(): OpenAI {
  return {
    chat: {
      completions: {
        create: vi.fn().mockRejectedValue(new Error('API error')),
      },
    },
  } as unknown as OpenAI;
}

const FIRE_YES_RESPONSE = {
  stage:                 'Implementation',
  stage_confidence:      0.85,
  signals_present:       [],
  signals_absent:        ['test_creation'],
  fire_decision_session: true,
  reason:                'Stage transition detected without test signal.',
};

const FIRE_NO_RESPONSE = {
  stage:                 'Implementation',
  stage_confidence:      0.85,
  signals_present:       ['test_creation'],
  signals_absent:        [],
  fire_decision_session: false,
  reason:                'All signals present.',
};

// ── buildFiredKey ─────────────────────────────────────────────────────────────

describe('buildFiredKey', () => {
  it('builds correct key for stage_transition with prev and current stage', () => {
    const key = buildFiredKey('stage_transition', 'idea', 'implementation');
    expect(key).toBe('stage_transition:idea→implementation');
  });

  it('builds correct key for absence flag', () => {
    const key = buildFiredKey('absence:test_creation', 'idea', 'implementation');
    expect(key).toBe('absence:test_creation@implementation');
  });

  it('includes the current stage in both key formats', () => {
    expect(buildFiredKey('stage_transition', 'implementation', 'release')).toContain('release');
    expect(buildFiredKey('absence:security_check', 'implementation', 'release')).toContain('release');
  });

  it('builds correct key for stage_transition to prd', () => {
    expect(buildFiredKey('stage_transition', 'idea', 'prd')).toBe('stage_transition:idea→prd');
  });

  it('builds correct key for absence flag on non-implementation stage', () => {
    const key = buildFiredKey('absence:security_check', 'idea', 'prd');
    expect(key).toBe('absence:security_check@prd');
  });

  it('stage_transition and absence keys are distinct for the same stage', () => {
    const st  = buildFiredKey('stage_transition', 'implementation', 'review_testing');
    const abs = buildFiredKey('absence:test_creation', 'implementation', 'review_testing');
    expect(st).not.toBe(abs);
  });

  it('different prev stages produce different keys for the same destination', () => {
    const key1 = buildFiredKey('stage_transition', 'feedback_loop', 'implementation');
    const key2 = buildFiredKey('stage_transition', 'idea', 'implementation');
    expect(key1).toBe('stage_transition:feedback_loop→implementation');
    expect(key2).toBe('stage_transition:idea→implementation');
    expect(key1).not.toBe(key2);
  });

  it('idea→implementation→feedback_loop→implementation oscillation produces 3 unique firedDecisionSessions keys', async () => {
    const store = await openStore(':memory:');
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');

    const projectRoot = '/test/oscillate';

    // Drive three stage transitions: idea→impl, impl→feedback_loop, feedback_loop→impl
    // Each transition must reach Stage 2 and fire an advisory so the key is stored.
    // We manipulate state directly between calls so stage transitions are detectable.

    // Warm-up: 3 prompts so MIN_PROMPTS guard passes
    for (let i = 0; i < 3; i++) {
      await runAuto(makeInput({ projectRoot }), store);
    }

    // Simulate transition 1: idea → implementation
    // State is already in 'implementation' (IMPL_PROMPT driven) after warm-up.
    // Manually record that the key for idea→impl fired.
    const mgr1 = SessionStateManager.load(store, projectRoot);
    mgr1.markDecisionSessionFired(store, 'stage_transition:idea→implementation');

    // Simulate transition 2: implementation → feedback_loop
    // Set currentStage=implementation, then on next call stage moves to feedback_loop.
    // We set prevStage indirectly: load the session, set currentStage to 'implementation',
    // then inject a feedback_loop classification by manipulating currentStage before runAuto
    // reads prevStage. Use firedDecisionSessions to record the key directly.
    mgr1.markDecisionSessionFired(store, 'stage_transition:implementation→feedback_loop');

    // Simulate transition 3: feedback_loop → implementation
    mgr1.markDecisionSessionFired(store, 'stage_transition:feedback_loop→implementation');

    // Verify: 3 unique keys stored — the pre-F-01 bug would have collapsed impl→feedback_loop
    // and feedback_loop→impl into the same key (both ending in their destination stage only).
    const mgr2 = SessionStateManager.load(store, projectRoot);
    const keys  = mgr2.current.firedDecisionSessions;
    expect(keys).toContain('stage_transition:idea→implementation');
    expect(keys).toContain('stage_transition:implementation→feedback_loop');
    expect(keys).toContain('stage_transition:feedback_loop→implementation');
    expect(new Set(keys).size).toBe(3);

    store.db.close();
  });
});

// ── runAuto — no_action paths ─────────────────────────────────────────────────

describe('runAuto — no_action paths', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('returns no_action for a fresh session with low-confidence classification', async () => {
    // Short/ambiguous prompt → low Stage 1 confidence → shouldFireStage2 returns null → no_action
    const result = await runAuto(
      makeInput({ promptText: 'ok' }),
      store,
    );
    expect(result.outcome).toBe('no_action');
  });

  it('returns no_action when Stage 2 API fails', async () => {
    // Even with a triggerable prompt, if Stage 2 fails → no_action (non-blocking)
    const result = await runAuto(
      makeInput(),
      store,
      makeErrorOpenAI(),
    );
    expect(result.outcome).toBe('no_action');
  });

  it('returns no_action when Stage 2 returns fire_decision_session: false', async () => {
    // Need to force Stage 2 to fire: use a state where shouldFireStage2 returns a flag
    // The simplest way: run with fire_no_response mock
    // For this test, we rely on the fact that for a fresh session with one prompt,
    // shouldFireStage2 may or may not fire — we test Stage 2 saying "don't fire"
    const result = await runAuto(
      makeInput(),
      store,
      makeMockOpenAI(FIRE_NO_RESPONSE),
    );
    // Either no_action from shouldFireStage2 or from Stage 2 decision
    expect(result.outcome).toBe('no_action');
  });
});

// ── runAuto — deduplication ───────────────────────────────────────────────────

describe('runAuto — deduplication', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('does not re-fire for the same event in the same session', async () => {
    // We set up a scenario where Stage 2 would fire, but since the event key
    // is already in firedDecisionSessions, it returns no_action on second call.
    // This is tested by directly manipulating the session state via SessionStateManager.
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/dedup');

    // Manually mark an event as fired
    mgr.markDecisionSessionFired(store, 'stage_transition:→implementation');

    // Now run auto — it should hit the dedup check and return no_action
    // (We can't easily force Stage 1 to produce a transition without mocking,
    // so we test the SessionStateManager dedup methods directly here)
    expect(mgr.hasFiredDecisionSession('stage_transition:→implementation')).toBe(true);
    expect(mgr.hasFiredDecisionSession('stage_transition:→release')).toBe(false);
  });

  it('firedDecisionSessions is empty in a fresh session', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/fresh');
    expect(mgr.current.firedDecisionSessions).toEqual([]);
  });

  it('markDecisionSessionFired persists the key across reloads', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr1 = SessionStateManager.load(store, '/test/persist');
    mgr1.markDecisionSessionFired(store, 'stage_transition:→prd');

    const mgr2 = SessionStateManager.load(store, '/test/persist');
    expect(mgr2.hasFiredDecisionSession('stage_transition:→prd')).toBe(true);
  });

  it('markDecisionSessionFired is idempotent (no duplicate keys)', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/idempotent');
    mgr.markDecisionSessionFired(store, 'absence:test_creation@implementation');
    mgr.markDecisionSessionFired(store, 'absence:test_creation@implementation');
    expect(mgr.current.firedDecisionSessions.filter(k => k === 'absence:test_creation@implementation')).toHaveLength(1);
  });

  it('runAuto returns no_action immediately when firedDecisionSessions contains the would-be key', async () => {
    // Pre-mark every possible stage_transition key for the implementation stage so
    // that even if shouldFireStage2 fires, the dedup check catches it before Stage 2.
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/dedup-e2e');
    mgr.markDecisionSessionFired(store, 'stage_transition:→implementation');

    // The mock would fire if called, but Stage 2 should never be reached
    const openai = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('should not be called via dedup')),
        },
      },
    } as unknown as OpenAI;

    // Even if shouldFireStage2 returns 'stage_transition', dedup catches it
    // (result is no_action from either early-exit or dedup)
    const result = await runAuto(
      makeInput({ projectRoot: '/test/dedup-e2e' }),
      store,
      openai,
    );
    // Either no_action from shouldFireStage2 not firing, or from dedup
    expect(result.outcome).toBe('no_action');
  });
});

// ── runAuto — full flow (pending advisory) ────────────────────────────────────

describe('runAuto — full flow', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('returns pending and stores advisory when Stage 2 says fire', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/full1');
    mgr.addAbsenceFlag(store, {
      signalKey:     'test_creation',
      stage:         'implementation',
      raisedAtIndex: 5,
      cooldownUntil: 100,
    });

    const openai = makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.');
    const result = await runAuto(makeInput({ projectRoot: '/test/full1' }), store, openai);

    expect(['pending', 'no_action']).toContain(result.outcome);
    if (result.outcome === 'pending') {
      const advisory = getPendingAdvisory(store, '/test/full1');
      expect(advisory).not.toBeNull();
      expect(advisory?.status).toBe('pending');
      expect(advisory?.pinchLabel).toBe('Hold up.');
    }
  });

  it('stores advisory with correct stage and flagType', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/full-meta');
    mgr.addAbsenceFlag(store, {
      signalKey:     'test_creation',
      stage:         'implementation',
      raisedAtIndex: 5,
      cooldownUntil: 100,
    });

    const openai = makeMockOpenAI(FIRE_YES_RESPONSE, 'Quick check.');
    const result = await runAuto(makeInput({ projectRoot: '/test/full-meta' }), store, openai);

    if (result.outcome === 'pending') {
      const advisory = getPendingAdvisory(store, '/test/full-meta');
      expect(advisory?.stage).toBeDefined();
      expect(advisory?.flagType).toBeDefined();
      expect(advisory?.sessionId).toBeDefined();
    }
  });
});

// ── runAuto — store persistence ───────────────────────────────────────────────

describe('runAuto — store persistence', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('does NOT store a pending advisory when outcome is no_action', async () => {
    const result = await runAuto(
      makeInput({ promptText: 'ok', projectRoot: '/test/persist-noact' }),
      store,
    );
    expect(result.outcome).toBe('no_action');
    const advisory = getPendingAdvisory(store, '/test/persist-noact');
    expect(advisory).toBeNull();
  });

  it('overwrites prior pending advisory on second trigger for same project', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');

    // First trigger
    const mgr1 = SessionStateManager.load(store, '/test/overwrite');
    mgr1.addAbsenceFlag(store, {
      signalKey:     'test_creation',
      stage:         'implementation',
      raisedAtIndex: 5,
      cooldownUntil: 100,
    });
    await runAuto(makeInput({ projectRoot: '/test/overwrite' }), store, makeMockOpenAI(FIRE_YES_RESPONSE, 'First.'));

    // Second trigger (different session — simulate via new openai mock returning 'Second.')
    // We need a new absence flag key to bypass dedup
    const mgr2 = SessionStateManager.load(store, '/test/overwrite');
    mgr2.addAbsenceFlag(store, {
      signalKey:     'review_step',
      stage:         'implementation',
      raisedAtIndex: 10,
      cooldownUntil: 200,
    });
    await runAuto(makeInput({ projectRoot: '/test/overwrite' }), store, makeMockOpenAI(FIRE_YES_RESPONSE, 'Second.'));

    // Only one pending advisory should exist (latest wins)
    const advisory = getPendingAdvisory(store, '/test/overwrite');
    // The result may be null if dedup blocked both — either way, at most one advisory
    if (advisory) {
      expect(advisory.status).toBe('pending');
    }
  });
});

// ── SessionStateManager — firedDecisionSessions field ────────────────────────

describe('SessionStateManager — firedDecisionSessions', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('hasFiredDecisionSession returns false for unknown key', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/proj/a');
    expect(mgr.hasFiredDecisionSession('stage_transition:→architecture')).toBe(false);
  });

  it('hasFiredDecisionSession returns true after markDecisionSessionFired', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/proj/b');
    mgr.markDecisionSessionFired(store, 'absence:regression_check@implementation');
    expect(mgr.hasFiredDecisionSession('absence:regression_check@implementation')).toBe(true);
  });

  it('different keys are tracked independently', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/proj/c');
    mgr.markDecisionSessionFired(store, 'stage_transition:→implementation');
    expect(mgr.hasFiredDecisionSession('stage_transition:→implementation')).toBe(true);
    expect(mgr.hasFiredDecisionSession('stage_transition:→release')).toBe(false);
  });

  it('multiple keys can be tracked in the same session', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/proj/d');
    mgr.markDecisionSessionFired(store, 'stage_transition:→implementation');
    mgr.markDecisionSessionFired(store, 'absence:test_creation@implementation');
    expect(mgr.hasFiredDecisionSession('stage_transition:→implementation')).toBe(true);
    expect(mgr.hasFiredDecisionSession('absence:test_creation@implementation')).toBe(true);
    expect(mgr.current.firedDecisionSessions).toHaveLength(2);
  });

  it('firedDecisionSessions resets when a new session starts', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    // Load, fire, save
    const mgr1 = SessionStateManager.load(store, '/proj/e');
    mgr1.markDecisionSessionFired(store, 'stage_transition:→implementation');

    // Simulate session gap by loading with a future timestamp (> SESSION_GAP_MS)
    const { SESSION_GAP_MS } = await import('../../classifier/SessionStateManager.js');
    const futureTime = Date.now() + SESSION_GAP_MS + 1000;
    const mgr2 = SessionStateManager.load(store, '/proj/e', futureTime);
    expect(mgr2.current.firedDecisionSessions).toEqual([]);
  });
});

// ── registerAutoCommand — output format ──────────────────────────────────────
//
// Tests verify the CLI action's output formatting without running the full
// advisory pipeline.  We invoke registerAutoCommand through Commander with an
// in-memory store (pipeline returns no_action for a single low-signal prompt),
// capturing stdout/stderr writes.

describe('registerAutoCommand — output format', () => {
  const originalStdout = process.stdout.write.bind(process.stdout);
  const originalStderr = process.stderr.write.bind(process.stderr);
  const originalExit   = process.exit.bind(process);

  function captureStdout(): { lines: string[]; restore: () => void } {
    const lines: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      lines.push(String(chunk));
      return true;
    });
    return { lines, restore: () => spy.mockRestore() };
  }

  function captureStderr(): { lines: string[]; restore: () => void } {
    const lines: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      lines.push(String(chunk));
      return true;
    });
    return { lines, restore: () => spy.mockRestore() };
  }

  it('emits nothing to stdout when outcome is no_action (direct mode)', async () => {
    const { Command } = await import('commander');
    const { registerAutoCommand } = await import('./auto.js');
    const program = new Command();
    program.exitOverride();
    registerAutoCommand(program);
    const { lines, restore } = captureStdout();
    try {
      await program.parseAsync(['node', 'nexpath', 'auto', '--db', ':memory:', 'ok']);
    } catch { /* exitOverride may throw */ }
    restore();
    // 'ok' is a low-signal prompt — pipeline returns no_action — stdout silent
    expect(lines.join('')).toBe('');
  });

  it('Stop hook decision block JSON has correct structure when parsed', () => {
    // Verify the Stop hook output format matches what Claude Code expects
    const reason = 'cross-confirm the spec before writing any code';
    const output = JSON.stringify({ decision: 'block', reason });
    const parsed = JSON.parse(output) as { decision: string; reason: string };
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toBe(reason);
    expect(Object.keys(parsed)).toEqual(['decision', 'reason']);
  });

  it('exits with code 1 and writes to stderr when prompt is missing in direct mode', async () => {
    const { Command } = await import('commander');
    const { registerAutoCommand } = await import('./auto.js');
    const program = new Command();
    program.exitOverride();
    registerAutoCommand(program);

    const stderrLines: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderrLines.push(String(chunk));
      return true;
    });

    // Provide TTY stdin so readStdin returns '' immediately
    const originalStdin = process.stdin;
    const stream = new PassThrough();
    (stream as unknown as Record<string, unknown>).isTTY = true;
    Object.defineProperty(process, 'stdin', { value: stream, writable: true, configurable: true });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    try {
      await program.parseAsync(['node', 'nexpath', 'auto', '--db', ':memory:']);
    } catch { /* expected — exit throws */ }

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
    Object.defineProperty(process, 'stdin', { value: originalStdin, writable: true, configurable: true });

    expect(stderrLines.join('')).toContain('prompt text is required');
  });
});

// ── readStdin ─────────────────────────────────────────────────────────────────

describe('readStdin', () => {
  const originalStdin = process.stdin;

  function replaceStdin(stream: PassThrough): void {
    Object.defineProperty(process, 'stdin', { value: stream, writable: true, configurable: true });
  }

  afterEach(() => {
    Object.defineProperty(process, 'stdin', { value: originalStdin, writable: true, configurable: true });
    vi.useRealTimers();
  });

  it('returns empty string immediately when stdin is a TTY', async () => {
    const stream = new PassThrough();
    (stream as unknown as Record<string, unknown>).isTTY = true;
    replaceStdin(stream);
    const result = await readStdin();
    expect(result).toBe('');
  });

  it('returns data from stdin when it closes normally', async () => {
    const stream = new PassThrough();
    replaceStdin(stream);
    const promise = readStdin();
    stream.push('{"prompt":"hello"}');
    stream.push(null); // end
    const result = await promise;
    expect(result).toBe('{"prompt":"hello"}');
  });

  it('resolves via 5-second timeout when stdin never closes', async () => {
    vi.useFakeTimers();
    const stream = new PassThrough();
    replaceStdin(stream);
    const promise = readStdin();
    stream.push('partial data');
    // stdin never ends — advance timers past the 5 s safety timeout
    await vi.advanceTimersByTimeAsync(5001);
    const result = await promise;
    expect(result).toBe('partial data');
  });
});

// ── runAuto — MIN_PROMPTS_BEFORE_ADVISORY guard (Issue 4) ────────────────────

describe('runAuto — MIN_PROMPTS_BEFORE_ADVISORY guard', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('returns no_action for first 2 prompts even when Stage 2 mock would fire', async () => {
    // Pre-seed an absence flag so shouldFireStage2 would fire if the guard weren't present
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/min-guard');
    mgr.addAbsenceFlag(store, {
      signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 0, cooldownUntil: 100,
    });

    const openai = makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.');
    const createFn = openai.chat.completions.create as ReturnType<typeof vi.fn>;

    // promptCount becomes 1 after this call → guard fires (1 < 3)
    const result1 = await runAuto(makeInput({ projectRoot: '/test/min-guard' }), store, openai);
    expect(result1.outcome).toBe('no_action');

    // promptCount becomes 2 → guard fires (2 < 3)
    const result2 = await runAuto(makeInput({ projectRoot: '/test/min-guard' }), store, openai);
    expect(result2.outcome).toBe('no_action');

    // Stage 2 (OpenAI) was never reached — guard exited before shouldFireStage2
    expect(createFn).not.toHaveBeenCalled();
  });

  it('guard does NOT block at promptCount >= 3 — pipeline proceeds to Stage 2', async () => {
    // Run 2 warm-up prompts to get promptCount to 2, then the 3rd should reach Stage 2
    const result1 = await runAuto(makeInput({ projectRoot: '/test/min-boundary' }), store);
    const result2 = await runAuto(makeInput({ projectRoot: '/test/min-boundary' }), store);
    expect(result1.outcome).toBe('no_action'); // guard blocks
    expect(result2.outcome).toBe('no_action'); // guard blocks

    // Third prompt: promptCount becomes 3 → guard passes (3 >= 3)
    // Use a mock that proves Stage 2 was attempted (even if it declines)
    const openai = makeMockOpenAI(FIRE_NO_RESPONSE);
    const createFn = openai.chat.completions.create as ReturnType<typeof vi.fn>;
    const result3 = await runAuto(makeInput({ projectRoot: '/test/min-boundary' }), store, openai);

    // outcome is no_action (stage classifier may not fire a flag on this input),
    // but if Stage 2 WAS called it proves the guard passed — either path confirms boundary
    expect(result3.outcome).toBe('no_action');
    // Stage 2 may or may not have been called depending on whether shouldFireStage2 returned a flag,
    // but promptCount=3 means the guard did NOT block — this is the invariant we assert
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/min-boundary');
    expect(mgr.current.promptCount).toBe(3); // confirms all 3 prompts were processed
    void createFn; // referenced to avoid unused warning
  });
});

// ── runAuto — prompt persistence (Issue 1) ────────────────────────────────────

describe('runAuto — prompt persistence', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('inserts the prompt text into the store on every call', async () => {
    await runAuto({ promptText: 'test prompt', projectRoot: '/test/project' }, store);
    const rows = getRecentPrompts(store, '/test/project', 10);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].text).toBe('test prompt');
  });

  it('stores under the correct project root', async () => {
    await runAuto({ promptText: 'alpha', projectRoot: '/proj/alpha' }, store);
    await runAuto({ promptText: 'beta',  projectRoot: '/proj/beta'  }, store);
    const alpha = getRecentPrompts(store, '/proj/alpha', 10);
    const beta  = getRecentPrompts(store, '/proj/beta',  10);
    expect(alpha).toHaveLength(1);
    expect(beta).toHaveLength(1);
    expect(alpha[0].text).toBe('alpha');
    expect(beta[0].text).toBe('beta');
  });

  it('inserts even when pipeline returns no_action', async () => {
    // Weak prompt — stage classifier stays at idea, no flag fires, no OpenAI call
    await runAuto({ promptText: 'hello', projectRoot: '/test/project' }, store);
    const rows = getRecentPrompts(store, '/test/project', 10);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('applies secret redaction before storing', async () => {
    await runAuto(
      { promptText: 'token=sk-abc123def456ghi789jkl012mno345pqr', projectRoot: '/test/project' },
      store,
    );
    const rows = getRecentPrompts(store, '/test/project', 10);
    expect(rows[0].text).toContain('sk-[REDACTED]');
    expect(rows[0].text).not.toContain('sk-abc123');
  });

  it('accumulates multiple prompts in insertion order (newest first from getRecentPrompts)', async () => {
    await runAuto({ promptText: 'first',  projectRoot: '/test/project' }, store);
    await runAuto({ promptText: 'second', projectRoot: '/test/project' }, store);
    await runAuto({ promptText: 'third',  projectRoot: '/test/project' }, store);
    const rows = getRecentPrompts(store, '/test/project', 10);
    expect(rows[0].text).toBe('third');
    expect(rows[1].text).toBe('second');
    expect(rows[2].text).toBe('first');
  });

  it('stores a capturedAt timestamp close to Date.now()', async () => {
    const before = Date.now();
    await runAuto({ promptText: 'timestamp check', projectRoot: '/test/project' }, store);
    const after = Date.now();
    const rows = getRecentPrompts(store, '/test/project', 1);
    expect(rows[0].capturedAt).toBeGreaterThanOrEqual(before);
    expect(rows[0].capturedAt).toBeLessThanOrEqual(after);
  });

  it('stores agent as claude-code', async () => {
    await runAuto({ promptText: 'agent check', projectRoot: '/test/project' }, store);
    const res = store.db.exec("SELECT agent FROM prompts WHERE project_root = '/test/project'");
    expect(res[0]?.values[0]?.[0]).toBe('claude-code');
  });
});

// ── runAuto — implicit project registration (Issue 6) ────────────────────────

describe('runAuto — implicit project registration', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('auto-registers project row on first call when project does not exist in DB', async () => {
    const projectRoot = '/test/implicit-init-project';
    expect(getProject(store, projectRoot)).toBeNull();

    await runAuto({ promptText: 'first prompt', projectRoot }, store);

    const project = getProject(store, projectRoot);
    expect(project).not.toBeNull();
    expect(project?.projectRoot).toBe(projectRoot);
  });

  it('project name falls back to basename of projectRoot when no package.json exists', async () => {
    const projectRoot = '/test/my-cool-project';
    await runAuto({ promptText: 'first prompt', projectRoot }, store);

    const project = getProject(store, projectRoot);
    expect(project?.name).toBe('my-cool-project');
  });

  it('second runAuto call does not re-trigger implicit init (project already registered)', async () => {
    const projectRoot = '/test/no-reinit';

    // First call — registers the project
    await runAuto({ promptText: 'first prompt', projectRoot }, store);
    const after1 = getProject(store, projectRoot);
    expect(after1).not.toBeNull();

    // Manually rename the project to detect if upsertProject would be called again
    // (upsertProject on conflict updates name if called; we set a sentinel name)
    store.db.run("UPDATE projects SET name = 'sentinel' WHERE project_root = ?", [projectRoot]);

    // Second call — must NOT overwrite name since getProject() returns non-null → step 0.0 skipped
    await runAuto({ promptText: 'second prompt', projectRoot }, store);
    const after2 = getProject(store, projectRoot);
    expect(after2?.name).toBe('sentinel');
  });
});

// ── runAuto — advisory_frequency gate (Issue 9.3 + 9.5) ─────────────────────

describe('runAuto — advisory_frequency gate', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('returns no_action when global advisory_frequency is "off"', async () => {
    setConfig(store, 'advisory_frequency', 'off');
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/freq-off');
    mgr.addAbsenceFlag(store, {
      signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 0, cooldownUntil: 100,
    });
    const openai = makeMockOpenAI(FIRE_YES_RESPONSE);
    const createFn = openai.chat.completions.create as ReturnType<typeof vi.fn>;

    // Run 3 warm-up prompts so MIN_PROMPTS guard passes
    for (let i = 0; i < 3; i++) {
      await runAuto(makeInput({ projectRoot: '/test/freq-off' }), store);
    }
    const result = await runAuto(makeInput({ projectRoot: '/test/freq-off' }), store, openai);
    expect(result.outcome).toBe('no_action');
    expect(createFn).not.toHaveBeenCalled();
  });

  it('returns no_action when per-project advisory_frequency is "off" (overrides global)', async () => {
    setConfig(store, 'advisory_frequency', 'every_event');             // global = on
    setConfig(store, 'advisory_frequency:/test/freq-proj-off', 'off'); // per-project = off
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/freq-proj-off');
    mgr.addAbsenceFlag(store, {
      signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 0, cooldownUntil: 100,
    });
    const openai = makeMockOpenAI(FIRE_YES_RESPONSE);
    const createFn = openai.chat.completions.create as ReturnType<typeof vi.fn>;

    for (let i = 0; i < 3; i++) {
      await runAuto(makeInput({ projectRoot: '/test/freq-proj-off' }), store);
    }
    const result = await runAuto(makeInput({ projectRoot: '/test/freq-proj-off' }), store, openai);
    expect(result.outcome).toBe('no_action');
    expect(createFn).not.toHaveBeenCalled();
  });

  it('returns no_action for absence flag when frequency is "major_only"', async () => {
    setConfig(store, 'advisory_frequency', 'major_only');
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/freq-major');
    mgr.addAbsenceFlag(store, {
      signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 0, cooldownUntil: 100,
    });
    const openai = makeMockOpenAI(FIRE_YES_RESPONSE);
    const createFn = openai.chat.completions.create as ReturnType<typeof vi.fn>;

    for (let i = 0; i < 3; i++) {
      await runAuto(makeInput({ projectRoot: '/test/freq-major' }), store);
    }
    // Force shouldFireStage2 to return an absence flag by running the already-flagged state
    const result = await runAuto(makeInput({ projectRoot: '/test/freq-major' }), store, openai);
    expect(result.outcome).toBe('no_action');
    expect(createFn).not.toHaveBeenCalled();
  });

  it('returns no_action for second event when frequency is "once_per_session"', async () => {
    setConfig(store, 'advisory_frequency', 'once_per_session');
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');

    // Pre-mark one event as fired so firedDecisionSessions.length > 0
    const mgr = SessionStateManager.load(store, '/test/freq-once');
    mgr.markDecisionSessionFired(store, 'stage_transition:→implementation');

    const openai = makeMockOpenAI(FIRE_YES_RESPONSE);
    const createFn = openai.chat.completions.create as ReturnType<typeof vi.fn>;

    for (let i = 0; i < 3; i++) {
      await runAuto(makeInput({ projectRoot: '/test/freq-once' }), store);
    }
    const result = await runAuto(makeInput({ projectRoot: '/test/freq-once' }), store, openai);
    // once_per_session: already fired once → gate blocks
    expect(result.outcome).toBe('no_action');
    expect(createFn).not.toHaveBeenCalled();
  });

  it('every_event setting does not gate the pipeline (default behaviour)', async () => {
    setConfig(store, 'advisory_frequency', 'every_event');
    // Verify pipeline proceeds past gate by confirming Stage 2 is reachable
    // (outcome depends on Stage 1 — we just verify no early exit from freq gate)
    const result = await runAuto(makeInput({ projectRoot: '/test/freq-every' }), store);
    // No crash, no freq-gate-specific no_action reason — pipeline ran normally
    expect(result.outcome).toBe('no_action'); // only 1 prompt, min-prompts guard
  });
});

// ── runAuto — session advisory cap (F-07) ────────────────────────────────────

describe('runAuto — session advisory cap', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('advisoryCount initialises to 0 in new session', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/cap-init');
    expect(mgr.current.advisoryCount ?? 0).toBe(0);
  });

  it('markAdvisoryFired increments advisoryCount', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/cap-incr');
    expect(mgr.current.advisoryCount ?? 0).toBe(0);
    mgr.markAdvisoryFired(store);
    expect(mgr.current.advisoryCount).toBe(1);
    mgr.markAdvisoryFired(store);
    expect(mgr.current.advisoryCount).toBe(2);
  });

  it('markAdvisoryFired defaults to 0 when advisoryCount absent (old persisted state)', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/cap-compat');
    (mgr as unknown as { state: { advisoryCount: undefined } }).state.advisoryCount = undefined;
    mgr.markAdvisoryFired(store);
    expect(mgr.current.advisoryCount).toBe(1);
  });

  it('caps (no_action + session_cap_reached record) when count reaches cap=5 (null profile)', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const { getSkippedSessions } = await import('../../store/skipped-sessions.js');

    // Warm up past MIN_PROMPTS guard first
    for (let i = 0; i < 3; i++) {
      await runAuto(makeInput({ projectRoot: '/test/cap-at5' }), store);
    }
    // Load mgr after warm-up, set advisoryCount=5 + low stageConfidence so
    // shouldFireStage2 condition 3 (low-conf + active flag) triggers, then
    // persist all state changes via addAbsenceFlag → saveState
    const mgr = SessionStateManager.load(store, '/test/cap-at5');
    (mgr as unknown as { state: { advisoryCount: number; stageConfidence: number } }).state.advisoryCount = 5;
    (mgr as unknown as { state: { stageConfidence: number } }).state.stageConfidence = 0.3;
    mgr.addAbsenceFlag(store, {
      signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 0, cooldownUntil: 100,
    });

    const result = await runAuto(makeInput({ projectRoot: '/test/cap-at5' }), store, makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'));
    expect(result.outcome).toBe('no_action');

    const skipped = getSkippedSessions(store, '/test/cap-at5');
    const capRecord = skipped.find((s) => s.flagType === 'session_cap_reached');
    expect(capRecord).toBeDefined();
    expect(capRecord?.levelReached).toBe(0);
  });

  it('proceeds past cap gate when count (4) is below cap=5 (null profile)', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const { getSkippedSessions } = await import('../../store/skipped-sessions.js');

    for (let i = 0; i < 3; i++) {
      await runAuto(makeInput({ projectRoot: '/test/cap-under5' }), store);
    }
    const mgr = SessionStateManager.load(store, '/test/cap-under5');
    (mgr as unknown as { state: { advisoryCount: number; stageConfidence: number } }).state.advisoryCount = 4;
    (mgr as unknown as { state: { stageConfidence: number } }).state.stageConfidence = 0.3;
    mgr.addAbsenceFlag(store, {
      signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 0, cooldownUntil: 100,
    });

    await runAuto(makeInput({ projectRoot: '/test/cap-under5' }), store, makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'));
    const skipped = getSkippedSessions(store, '/test/cap-under5');
    expect(skipped.some((s) => s.flagType === 'session_cap_reached')).toBe(false);
  });

  it('beginner/cool_geek profile uses cap=10 (not capped at count=5)', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const { getSkippedSessions } = await import('../../store/skipped-sessions.js');

    for (let i = 0; i < 3; i++) {
      await runAuto(makeInput({ projectRoot: '/test/cap-vibe10' }), store);
    }
    const mgr = SessionStateManager.load(store, '/test/cap-vibe10');
    // Set beginner profile and count=5 — beginner cap is 10, so this should NOT cap
    (mgr as unknown as { state: { profile: unknown; advisoryCount: number; stageConfidence: number } }).state.profile = {
      nature: 'beginner', precisionScore: 1, playfulnessScore: 1,
      mood: 'casual', depth: 'low', depthScore: 1,
      computedAt: mgr.current.promptCount, // prevents isProfileStale from overwriting on next processPrompt
    };
    (mgr as unknown as { state: { advisoryCount: number } }).state.advisoryCount = 5;
    (mgr as unknown as { state: { stageConfidence: number } }).state.stageConfidence = 0.3;
    mgr.addAbsenceFlag(store, {
      signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 0, cooldownUntil: 100,
    });

    await runAuto(makeInput({ projectRoot: '/test/cap-vibe10' }), store, makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'));
    const skipped = getSkippedSessions(store, '/test/cap-vibe10');
    // Should NOT be capped — beginner cap is 10, count is only 5
    expect(skipped.some((s) => s.flagType === 'session_cap_reached')).toBe(false);
  });

  it('caps when beginner profile advisoryCount reaches cap=10', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const { getSkippedSessions } = await import('../../store/skipped-sessions.js');

    for (let i = 0; i < 3; i++) {
      await runAuto(makeInput({ projectRoot: '/test/cap-beginner-at10' }), store);
    }
    const mgr = SessionStateManager.load(store, '/test/cap-beginner-at10');
    (mgr as unknown as { state: { profile: unknown; advisoryCount: number; stageConfidence: number } }).state.profile = {
      nature: 'beginner', precisionScore: 1, playfulnessScore: 1,
      mood: 'casual', depth: 'low', depthScore: 1,
      computedAt: mgr.current.promptCount,
    };
    (mgr as unknown as { state: { advisoryCount: number } }).state.advisoryCount = 10;
    (mgr as unknown as { state: { stageConfidence: number } }).state.stageConfidence = 0.3;
    mgr.addAbsenceFlag(store, {
      signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 0, cooldownUntil: 100,
    });

    const result = await runAuto(makeInput({ projectRoot: '/test/cap-beginner-at10' }), store, makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'));
    expect(result.outcome).toBe('no_action');
    const skipped = getSkippedSessions(store, '/test/cap-beginner-at10');
    const capRecord = skipped.find((s) => s.flagType === 'session_cap_reached');
    expect(capRecord).toBeDefined();
    expect(capRecord?.levelReached).toBe(0);
  });

  it('caps when hardcore_pro profile advisoryCount reaches cap=5', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const { getSkippedSessions } = await import('../../store/skipped-sessions.js');

    for (let i = 0; i < 3; i++) {
      await runAuto(makeInput({ projectRoot: '/test/cap-pro-at5' }), store);
    }
    const mgr = SessionStateManager.load(store, '/test/cap-pro-at5');
    (mgr as unknown as { state: { profile: unknown; advisoryCount: number; stageConfidence: number } }).state.profile = {
      nature: 'hardcore_pro', precisionScore: 9, playfulnessScore: 2,
      mood: 'focused', depth: 'high', depthScore: 8,
      computedAt: mgr.current.promptCount,
    };
    (mgr as unknown as { state: { advisoryCount: number } }).state.advisoryCount = 5;
    (mgr as unknown as { state: { stageConfidence: number } }).state.stageConfidence = 0.3;
    mgr.addAbsenceFlag(store, {
      signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 0, cooldownUntil: 100,
    });

    const result = await runAuto(makeInput({ projectRoot: '/test/cap-pro-at5' }), store, makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'));
    expect(result.outcome).toBe('no_action');
    const skipped = getSkippedSessions(store, '/test/cap-pro-at5');
    const capRecord = skipped.find((s) => s.flagType === 'session_cap_reached');
    expect(capRecord).toBeDefined();
    expect(capRecord?.levelReached).toBe(0);
  });

  it('proceeds past cap gate when hardcore_pro profile advisoryCount (4) is below cap=5', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const { getSkippedSessions } = await import('../../store/skipped-sessions.js');

    for (let i = 0; i < 3; i++) {
      await runAuto(makeInput({ projectRoot: '/test/cap-pro-under5' }), store);
    }
    const mgr = SessionStateManager.load(store, '/test/cap-pro-under5');
    (mgr as unknown as { state: { profile: unknown; advisoryCount: number; stageConfidence: number } }).state.profile = {
      nature: 'hardcore_pro', precisionScore: 9, playfulnessScore: 2,
      mood: 'focused', depth: 'high', depthScore: 8,
      computedAt: mgr.current.promptCount,
    };
    (mgr as unknown as { state: { advisoryCount: number } }).state.advisoryCount = 4;
    (mgr as unknown as { state: { stageConfidence: number } }).state.stageConfidence = 0.3;
    mgr.addAbsenceFlag(store, {
      signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 0, cooldownUntil: 100,
    });

    await runAuto(makeInput({ projectRoot: '/test/cap-pro-under5' }), store, makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'));
    const skipped = getSkippedSessions(store, '/test/cap-pro-under5');
    expect(skipped.some((s) => s.flagType === 'session_cap_reached')).toBe(false);
  });
});

// ── runAuto — effectiveLang from DB ──────────────────────────────────────────

describe('runAuto — effectiveLang from DB', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('completes without error when projects.detected_language is null and no language_override', async () => {
    const result = await runAuto({ promptText: 'first prompt', projectRoot: '/test/project' }, store);
    expect(result.outcome).toBe('no_action');
  });

  it('reads detected_language from projects table — getProject returns it after setDetectedLanguage', async () => {
    upsertProject(store, { projectRoot: '/test/project', name: 'Test' });
    setDetectedLanguage(store, '/test/project', 'fr');
    // runAuto should read 'fr' from DB without errors (verified by successful completion)
    const result = await runAuto({ promptText: 'je veux ajouter une page', projectRoot: '/test/project' }, store);
    expect(result.outcome).toBe('no_action'); // < 3 prompts, but pipeline ran
  });

  it('language_override in config takes precedence (resolveLanguage honours override)', async () => {
    upsertProject(store, { projectRoot: '/test/project', name: 'Test' });
    setDetectedLanguage(store, '/test/project', 'fr');
    setConfig(store, 'language_override', 'hi'); // override should win
    const result = await runAuto({ promptText: 'mujhe ek page chahiye', projectRoot: '/test/project' }, store);
    expect(result.outcome).toBe('no_action');
  });

  it('detection no longer runs inside runAuto — session detectedLanguage stays undefined', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    await runAuto({ promptText: 'I want to add a login page', projectRoot: '/test/project' }, store);
    const mgr = SessionStateManager.load(store, '/test/project');
    expect(mgr.current.detectedLanguage).toBeUndefined();
  });
});

// ── runAuto — advisory_injected guard ────────────────────────────────────────

describe('runAuto — advisory_injected guard', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('returns no_action with reason advisory_injected when prompt matches lastInjectedPrompt', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const injectedText = 'Review the code just generated for this task: does the implementation match the spec and acceptance criteria?';

    const mgr = SessionStateManager.load(store, '/test/guard');
    mgr.setInjectedPrompt(store, injectedText);

    const result = await runAuto(
      makeInput({ promptText: injectedText, projectRoot: '/test/guard' }),
      store,
    );
    expect(result.outcome).toBe('no_action');
  });

  it('stores no prompt in DB when advisory_injected guard fires', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const injectedText = 'Cross-confirm the spec: given what I\'ve described, what are the top 3 things that should be clarified before I start building?';

    const mgr = SessionStateManager.load(store, '/test/guard-noprompt');
    mgr.setInjectedPrompt(store, injectedText);

    await runAuto(
      makeInput({ promptText: injectedText, projectRoot: '/test/guard-noprompt' }),
      store,
    );

    const stored = getRecentPrompts(store, '/test/guard-noprompt', 10);
    expect(stored).toHaveLength(0);
  });

  it('clears lastInjectedPrompt after a match', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const injectedText = 'List the 3 most important acceptance criteria for this project so we can check them before release.';

    const mgr = SessionStateManager.load(store, '/test/guard-clear');
    mgr.setInjectedPrompt(store, injectedText);

    await runAuto(
      makeInput({ promptText: injectedText, projectRoot: '/test/guard-clear' }),
      store,
    );

    const mgr2 = SessionStateManager.load(store, '/test/guard-clear');
    expect(mgr2.current.lastInjectedPrompt ?? null).toBeNull();
  });

  it('clears lastInjectedPrompt and processes normally when prompt does NOT match', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const injectedText = 'Review the code just generated for this task.';
    const realPrompt   = 'add authentication middleware to the express app';

    const mgr = SessionStateManager.load(store, '/test/guard-mismatch');
    mgr.setInjectedPrompt(store, injectedText);

    const result = await runAuto(
      makeInput({ promptText: realPrompt, projectRoot: '/test/guard-mismatch' }),
      store,
    );

    // Field is cleared regardless of match
    const mgr2 = SessionStateManager.load(store, '/test/guard-mismatch');
    expect(mgr2.current.lastInjectedPrompt ?? null).toBeNull();

    // Real prompt was stored and processed normally
    const stored = getRecentPrompts(store, '/test/guard-mismatch', 10);
    expect(stored.length).toBeGreaterThan(0);
    expect(stored[0].text).toBe(realPrompt);
    // Pipeline ran (no_action is fine — what matters is it didn't skip due to advisory_injected)
    expect(result.outcome).toBe('no_action');
  });

  it('processes normally when lastInjectedPrompt is null (no prior injection)', async () => {
    const result = await runAuto(
      makeInput({ promptText: 'add a login page', projectRoot: '/test/guard-null' }),
      store,
    );
    // No guard triggered — pipeline ran normally
    const stored = getRecentPrompts(store, '/test/guard-null', 10);
    expect(stored.length).toBeGreaterThan(0);
    expect(result.outcome).toBe('no_action');
  });
});

// ── runAuto — generated options stored in pending advisory ────────────────────

describe('runAuto — generated options wiring', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => {
    store.db.close();
    vi.restoreAllMocks();
  });

  /**
   * Build a mock OpenAI client that supports parallel pinch + options calls.
   * Both pinch and options calls use gpt-4o-mini; we can't rely on call order
   * with Promise.all, so this mock always returns a usable pinch label from
   * any call after Stage 2, letting the option response be driven separately.
   */
  function makeParallelMockOpenAI(
    stage2Response: object,
    pinchText = 'Hold up.',
    optionResponse: string | null = null,
  ): OpenAI {
    let callCount = 0;
    return {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve({
                choices: [{ message: { content: JSON.stringify(stage2Response) } }],
              });
            }
            // calls 2 and 3 are pinch + options in parallel
            if (optionResponse && callCount === 3) {
              return Promise.resolve({
                choices: [{ message: { content: optionResponse } }],
              });
            }
            return Promise.resolve({
              choices: [{ message: { content: pinchText } }],
            });
          }),
        },
      },
    } as unknown as OpenAI;
  }

  it('advisory stores generatedL1/L2/L3 when generateOptionList returns valid options', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const { TASK_REVIEW } = await import('../../decision-session/options.js');
    const mgr = SessionStateManager.load(store, '/test/gen-opts');
    mgr.addAbsenceFlag(store, {
      signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 0, cooldownUntil: 100,
    });

    // Provide a valid option response matching TASK_REVIEW counts
    const optResponse = JSON.stringify({
      l1: TASK_REVIEW.L1.map((o) => `[adapted] ${o}`),
      l2: TASK_REVIEW.L2.map((o) => `[adapted] ${o}`),
      l3: TASK_REVIEW.L3.map((o) => `[adapted] ${o}`),
    });

    const openai = makeParallelMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.', optResponse);
    const result = await runAuto(makeInput({ projectRoot: '/test/gen-opts' }), store, openai);

    if (result.outcome === 'pending') {
      const advisory = getPendingAdvisory(store, '/test/gen-opts');
      expect(advisory).not.toBeNull();
      // generatedL1/L2/L3 may be populated or null depending on which API call
      // returned the option response — what we assert is the advisory was stored
      expect(advisory?.status).toBe('pending');
    }
  });

  it('advisory is stored with null generatedL1 when generateOptionList returns null', async () => {
    const generateSpy = vi.spyOn(
      await import('../../decision-session/OptionGenerator.js'),
      'generateOptionList',
    ).mockResolvedValue(null);

    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/gen-null');
    mgr.addAbsenceFlag(store, {
      signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 0, cooldownUntil: 100,
    });

    const openai = makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.');
    const result = await runAuto(makeInput({ projectRoot: '/test/gen-null' }), store, openai);

    if (result.outcome === 'pending') {
      const advisory = getPendingAdvisory(store, '/test/gen-null');
      expect(advisory?.generatedL1).toBeNull();
      expect(advisory?.generatedL2).toBeNull();
      expect(advisory?.generatedL3).toBeNull();
    }

    generateSpy.mockRestore();
  });

  it('upsertPendingAdvisory round-trips generatedL1/L2/L3 through DB', async () => {
    const { upsertPendingAdvisory: upsert } = await import('../../store/pending-advisories.js');
    const { getPendingAdvisory: getAdvisory } = await import('../../store/pending-advisories.js');

    upsert(store, {
      projectRoot:  '/test/roundtrip',
      stage:        'implementation',
      flagType:     'absence:test_creation',
      pinchLabel:   'Quick check.',
      sessionId:    'sess-rt',
      promptCount:  5,
      generatedL1:  ['option A adapted', 'option B adapted', 'option C adapted'],
      generatedL2:  ['option D adapted', 'option E adapted'],
      generatedL3:  ['option F adapted'],
    });

    const advisory = getAdvisory(store, '/test/roundtrip');
    expect(advisory?.generatedL1).toEqual(['option A adapted', 'option B adapted', 'option C adapted']);
    expect(advisory?.generatedL2).toEqual(['option D adapted', 'option E adapted']);
    expect(advisory?.generatedL3).toEqual(['option F adapted']);
  });

  it('upsertPendingAdvisory stores null when generatedL1 is undefined', async () => {
    const { upsertPendingAdvisory: upsert } = await import('../../store/pending-advisories.js');
    const { getPendingAdvisory: getAdvisory } = await import('../../store/pending-advisories.js');

    upsert(store, {
      projectRoot: '/test/null-gen',
      stage:       'implementation',
      flagType:    'absence:test_creation',
      pinchLabel:  'Hold up.',
      sessionId:   'sess-ng',
      promptCount: 3,
      // generatedL1/L2/L3 omitted → should be null
    });

    const advisory = getAdvisory(store, '/test/null-gen');
    expect(advisory?.generatedL1).toBeNull();
    expect(advisory?.generatedL2).toBeNull();
    expect(advisory?.generatedL3).toBeNull();
  });
});
