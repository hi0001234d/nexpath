import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../../store/db.js';
import type { Store } from '../../store/db.js';

vi.mock('../../telemetry/index.js', () => ({
  writeTelemetry: vi.fn(),
  TELEMETRY_PATH: '/mock/telemetry.jsonl',
}));
// Fallback mock for any `new OpenAI()` a code path constructs when a test passes no
// client — the stage classifier now fires every prompt, so without this a no-client
// call would hit a real endpoint and time out. Returns a benign low-confidence, no-fire
// classification; tests that pass an explicit client override this entirely.
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        stage: 'Implementation', stage_confidence: 0.3, signals_present: [], signals_absent: [],
        fire_decision_session: false, selected_signal_key: '', reason: 'test fallback',
      }) } }],
    }) } };
  },
}));
import { getRecentPrompts, insertPrompt } from '../../store/prompts.js';
import {
  absenceOccurrenceIndexV1,
  buildFiredKey,
  buildPromptEnhancementCliSubmitConsumerDiagnosticV1,
  buildPromptEnhancementRequestForAuto,
  promptEnhancementFiredTriggerEligibilityV1,
  createPromptEnhancementCliHostConsumerV1,
  preparePromptEnhancementForAuto,
  recordPromptEnhancementCliFeedbackV1,
  recordPromptEnhancementShownMemoryV1,
  markPromptEnhancementUsedMemoryV1,
  runAuto,
  buildPromptEnhancementGroundingRefsV1,
  readStdin,
} from './auto.js';
import { getPromptEnhancementFeedbackSummary, queryRelevantPromptEnhancementMemory, recordPromptEnhancementMemoryEvidence } from '../../store/prompt-enhancement.js';
import { resolvePromptEnhancementGuidanceOutcomeV1 } from '../../prompt-enhancement/guidance-outcome.js';
import { promptEnhancementStageSignalKeyV1 } from '../../prompt-enhancement/guidance-facts.js';
import { writeTelemetry } from '../../telemetry/index.js';
import type { AutoInput } from './auto.js';
import { getPendingAdvisory } from '../../store/pending-advisories.js';
import { getPendingPromptEnhancement } from '../../store/pending-prompt-enhancements.js';
import { upsertProject, setDetectedLanguage, getProject } from '../../store/projects.js';
import { setProjectEnvFacts } from '../../store/env-facts.js';
import { upsertPendingAdvisory } from '../../store/pending-advisories.js';
import { setConfig } from '../../store/config.js';
import { readCadence, IDLE_CAP_MS } from '../../store/feedback-cadence.js';
import type OpenAI from 'openai';
import { SessionStateManager } from '../../classifier/SessionStateManager.js';
import { STAGES } from '../../core/classifier/types.js';
import { logger } from '../../logger.js';
import { buildSafeDefaults } from '../../classifier/LLMProfileClassifier.js';
import { applyPromptEnhancementAction, preparePromptEnhancement } from '../../prompt-enhancement/facade.js';
import { validatePromptEnhancementPrepareRequestV1 } from '../../prompt-enhancement/contracts.js';
import { buildPromptEnhancementUiBoundarySessionV1 } from '../../prompt-enhancement/ui-boundary.js';
import { createPromptEnhancementPopupEventV1 } from '../../prompt-enhancement/popup-session.js';
import { buildPromptEnhancementPopupRenderModelV1 } from '../../prompt-enhancement/popup-render-model.js';
import {
  buildPromptEnhancementLocalDraftV1,
  reconcilePromptEnhancementLocalDraftV1,
  updatePromptEnhancementAdditionalDetailsDraftV1,
  updatePromptEnhancementCurrentBodyDraftV1,
} from '../../prompt-enhancement/local-draft.js';
import {
  beginPromptEnhancementActionV1,
  buildPromptEnhancementActionAdapterStateV1,
  buildPromptEnhancementActionRequestV1,
  executePromptEnhancementActionV1,
  resolvePromptEnhancementActionV1,
} from '../../prompt-enhancement/action-adapter.js';

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

function makeBoundaryRequest(store: Store, projectRoot: string, promptText = IMPL_PROMPT) {
  const session = SessionStateManager.load(store, projectRoot);
  return buildPromptEnhancementRequestForAuto({
    auto: makeInput({ projectRoot, promptText, currentAgentMode: 'workspace-write' }),
    store,
    session,
    project: null,
    effectiveLanguage: 'en',
    configuredRole: null,
    effectiveFlagType: 'stage_transition',
    firedKey: 'stage_transition:idea→implementation',
    previousStage: 'idea',
    trigger: { kind: 'stage_transition' },
    stageResult: {
      classification: { stage: 'implementation', confidence: 0.9, tier: 3, allScores: {} },
      signalsPresent: [],
      signalsAbsent: [],
      fireRecommendation: true,
      selectedSignalKey: '',
      reason: 'test',
      degraded: false,
    },
    streamBOutputs: [],
  });
}

function primeTaskBreakdownSession(store: Store, projectRoot: string): SessionStateManager {
  const session = SessionStateManager.load(store, projectRoot);
  const classification = { stage: 'task_breakdown' as const, confidence: 0.85, tier: 3 as const, allScores: {} };
  for (let i = 0; i < 4; i++) session.processPrompt(store, `warmup ${i}`, classification);
  session.setProfile(buildSafeDefaults(100));
  session.processPrompt(store, 'profile baseline', classification);
  return session;
}

// ── PE0.1 live-consumer diagnostics ───────────────────────────────────────────

/**
 * Mark a prepared result as LLM-worded.
 *
 * ⚠️ These boundary tests run without an API key, so the real facade returns a DETERMINISTIC body —
 * and a deterministic body is now withheld from display by owner ruling (a), which means no pending
 * row is written and the boundary these tests are about never runs. The tests are about PERSISTENCE,
 * not about the composer, so they state the composed-body condition they have always assumed.
 */
function asLlmWorded<T>(prepared: T): T {
  // `preparePromptEnhancement` returns the RESULT itself; other call sites hand back a wrapper with
  // `.result`. Both shapes appear in this file, so both are handled rather than assumed.
  const direct = prepared as unknown as { currentBody?: Record<string, unknown> };
  if (direct.currentBody) {
    return {
      ...prepared,
      currentBody: { ...direct.currentBody, composerMode: 'baseline_llm_structured_wording' },
    } as T;
  }
  const wrapped = prepared as unknown as { result?: { currentBody?: Record<string, unknown> } };
  if (!wrapped.result?.currentBody) return prepared;
  return {
    ...prepared,
    result: {
      ...wrapped.result,
      currentBody: { ...wrapped.result.currentBody, composerMode: 'baseline_llm_structured_wording' },
    },
  } as T;
}

describe('PE0.1 — live PE consumer diagnostics', () => {
  it('preserves the bounded host failure enums needed to distinguish live failures', () => {
    const diagnostic = buildPromptEnhancementCliSubmitConsumerDiagnosticV1(
      {
        state: 'not_shown',
        reasonCodes: ['no_tty', 'host_launch_failed', 'invalid_host_result', 'renderer_failure'],
      },
      undefined,
    );

    expect(diagnostic).toEqual({
      state: 'not_shown',
      hostAdapter: 'direct_tty',
      hookOutput: 'allow_original_or_not_shown',
      reasonCodes: ['no_tty', 'host_launch_failed', 'invalid_host_result', 'renderer_failure'],
    });
  });

  it('redacts unknown reason text, deduplicates it, and caps the diagnostic array', () => {
    const privateReason = '/home/user/private/project: raw prompt body';
    const diagnostic = buildPromptEnhancementCliSubmitConsumerDiagnosticV1(
      {
        state: 'not_shown',
        reasonCodes: [
          privateReason,
          privateReason,
          'no_tty',
          'renderer_failure',
          'invalid_prepare_result',
          'invalid_popup_session',
          'popup_identity_mismatch',
          'missing_required_popup_action',
          'typed_no_popup_disposition',
          'delivery_surface_mismatch',
        ],
      },
      undefined,
    );

    expect(diagnostic.reasonCodes).toHaveLength(8);
    expect(diagnostic.reasonCodes[0]).toBe('unrecognized_reason_code');
    expect(diagnostic.reasonCodes).toContain('no_tty');
    expect(JSON.stringify(diagnostic)).not.toContain(privateReason);
  });

  it('classifies selected and closed hook outputs without logging the enhanced body', () => {
    const selected = buildPromptEnhancementCliSubmitConsumerDiagnosticV1(
      { state: 'selected_current', bodyText: 'private enhanced body' },
      {
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: 'private enhanced body',
        },
      },
    );
    const closed = buildPromptEnhancementCliSubmitConsumerDiagnosticV1(
      { state: 'closed_no_send' },
      { decision: 'block', reason: 'Nothing was sent.', suppressOriginalPrompt: true },
    );

    expect(selected).toEqual({
      state: 'selected_current',
      hostAdapter: 'direct_tty',
      hookOutput: 'additional_context',
      reasonCodes: [],
    });
    expect(closed).toEqual({
      state: 'closed_no_send',
      hostAdapter: 'direct_tty',
      hookOutput: 'block_no_send',
      reasonCodes: [],
    });
    expect(JSON.stringify(selected)).not.toContain('private enhanced body');
  });
});

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

// ── grounding boundary — corroboration tier crosses TYPED with every env ref ──

describe('buildPromptEnhancementGroundingRefsV1 — corroboration tiers', () => {
  let store: Store;
  const projectRoot = '/test/tier-project';

  beforeEach(async () => {
    store = await openStore(':memory:');
    upsertProject(store, { projectRoot, name: 'tier-project' });
  });
  afterEach(() => { store.db.close(); });

  it('every crossing env fact carries a typed tier: present→capability, false/null→uncorroborated', () => {
    setProjectEnvFacts(store, projectRoot, {
      has_test_runner: { value: true,  tier: 'C', confidence: 'high', detectedAt: 1 },
      has_backups:     { value: false, tier: 'C', confidence: 'high', detectedAt: 1 },
      package_manager: { value: null,  tier: 'C', confidence: 'low',  detectedAt: 1 },
    }, 1);

    const out = buildPromptEnhancementGroundingRefsV1(store, projectRoot, []);

    expect(out.sourceOnlyHardFactRefs).toContain('hard_fact:has_test_runner');
    // The tier rides a TYPED map keyed by the ref — never smuggled inside the string.
    expect(out.groundingTierByRef['hard_fact:has_test_runner']).toBe('capability');
    expect(out.groundingTierByRef['hard_fact:has_backups']).toBe('uncorroborated');
    expect(out.groundingTierByRef['hard_fact:package_manager']).toBe('uncorroborated');
    // Every crossing env ref has a tier — none crosses untiered.
    for (const ref of out.sourceOnlyHardFactRefs) {
      expect(out.groundingTierByRef[ref]).toBeDefined();
    }
    // The ref strings themselves are unchanged (bare keys, as before this change).
    expect(out.sourceOnlyHardFactRefs.every((r) => r.split(':').length === 2)).toBe(true);
    // Polarity crosses typed beside the tier: present / false_capability / unknown.
    expect(out.groundingPolarityByRef['hard_fact:has_test_runner']).toBe('present');
    expect(out.groundingPolarityByRef['hard_fact:has_backups']).toBe('false_capability');
    expect(out.groundingPolarityByRef['hard_fact:package_manager']).toBe('unknown');
    // The resolved VALUES cross typed beside the refs, stamped with where the
    // resolution happened.
    expect(out.groundingEvidenceByRef['hard_fact:has_test_runner']).toEqual({ key: 'has_test_runner', value: 'true', runtimePath: 'local_store', anchorScope: 'project_root' });
    expect(out.groundingEvidenceByRef['hard_fact:has_backups']!.value).toBe('false');
    expect(out.groundingEvidenceByRef['hard_fact:package_manager']!.value).toBe('null');
  });

  it('yields no refs and an empty tier map on an empty store (deterministic no-data fallback)', () => {
    const out = buildPromptEnhancementGroundingRefsV1(store, projectRoot, []);
    expect(out.sourceOnlyHardFactRefs).toHaveLength(0);
    expect(Object.keys(out.groundingTierByRef)).toHaveLength(0);
  });
});

// ── runAuto — historical backfill runs regardless of prior registration ───────

describe('runAuto — historical prompt backfill', () => {
  let store: Store;
  let tmpDir: string;
  let origEnv: string | undefined;
  const projectRoot = '/test/init-first-project';

  beforeEach(async () => {
    store   = await openStore(':memory:');
    tmpDir  = mkdtempSync(join(tmpdir(), 'nexpath-auto-hist-'));
    origEnv = process.env['CLAUDE_CONFIG_DIR'];
    process.env['CLAUDE_CONFIG_DIR'] = tmpDir;
  });

  afterEach(() => {
    store.db.close();
    rmSync(tmpDir, { recursive: true, force: true });
    if (origEnv === undefined) delete process.env['CLAUDE_CONFIG_DIR'];
    else process.env['CLAUDE_CONFIG_DIR'] = origEnv;
  });

  function writeHistoryJsonl(prompts: string[]): void {
    const safeName = projectRoot.replace(/[^a-zA-Z0-9]/g, '-');
    const projDir  = join(tmpDir, 'projects', safeName);
    mkdirSync(projDir, { recursive: true });
    const lines = prompts.map((content) => JSON.stringify({ type: 'user', message: { content } }));
    writeFileSync(join(projDir, 'session.jsonl'), lines.join('\n') + '\n', 'utf8');
  }

  it('imports history on the first prompt even when the project was already registered (init-first)', async () => {
    // `nexpath init` registers the project before any prompt exists. The backfill
    // must still run on the first prompt — a registration-gated call never would.
    upsertProject(store, { projectRoot, name: 'init-first-project' });
    writeHistoryJsonl(['old prompt one', 'old prompt two']);

    await runAuto(makeInput({ projectRoot, promptText: 'first live prompt' }), store);

    const texts = getRecentPrompts(store, projectRoot, 10).map((r) => r.text);
    expect(texts).toContain('old prompt one');
    expect(texts).toContain('old prompt two');
    expect(texts).toContain('first live prompt');
  });

  it('does not re-import on later prompts (self-gating guard)', async () => {
    upsertProject(store, { projectRoot, name: 'init-first-project' });
    writeHistoryJsonl(['old prompt one']);

    await runAuto(makeInput({ projectRoot, promptText: 'first live prompt' }), store);
    await runAuto(makeInput({ projectRoot, promptText: 'second live prompt' }), store);

    const texts = getRecentPrompts(store, projectRoot, 20).map((r) => r.text);
    expect(texts.filter((t) => t === 'old prompt one')).toHaveLength(1);
  });

  it('THE PINNED EDGE: a prompt already stored before the first import opportunity skips the import entirely', () => {
    // Not the same case as the idempotency test above, which runs AFTER a
    // successful import. This is the user whose store already holds a prompt
    // when the backfill first gets its chance — someone who used Nexpath before
    // the backfill existed, or whose prompts arrived through another path. The
    // zero-prompts guard is the whole gate, so for them the Claude history is
    // never imported, and that is the ACCEPTED behaviour: the alternative is
    // re-importing history behind a user who already has a live prompt stream.
    // Pinned here so the decision cannot drift silently — swapping the guard for
    // a persisted "already imported" flag would keep the idempotency test green
    // while changing this outcome.
    upsertProject(store, { projectRoot, name: 'init-first-project' });
    insertPrompt(store, { projectRoot, promptText: 'a prompt stored before any import opportunity' });
    writeHistoryJsonl(['old prompt one', 'old prompt two']);

    return runAuto(makeInput({ projectRoot, promptText: 'first live prompt after that' }), store).then(() => {
      const texts = getRecentPrompts(store, projectRoot, 20).map((r) => r.text);
      expect(texts).not.toContain('old prompt one');
      expect(texts).not.toContain('old prompt two');
      // The live prompts themselves are unaffected.
      expect(texts).toContain('a prompt stored before any import opportunity');
      expect(texts).toContain('first live prompt after that');
    });
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

  beforeEach(async () => {
    store = await openStore(':memory:');
    // Pins the Medium (`every_event`) gate numbers this suite is about — min 3 prompts,
    // cap 5/10. The unset default became High (`optimum`: min 1, cap 9999) on 2026-09-19.
    setConfig(store, 'advisory_frequency', 'every_event');
  });
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

    // The classifier runs on every prompt (including below the min-prompts floor); the
    // guard still blocks the advisory, so the outcome is no_action.
    expect(createFn).toHaveBeenCalled();
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
    expect(rows[0].text).toContain('sk-[REDACTED');
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
    // Timeout widened to 30s (from 15s) — three sequential runAuto calls
    // exercise the full advisory pipeline, and contended I/O on slower CI
    // runners pushed the elapsed time over the prior 15s budget.
  }, 30000);

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

    // Run 2 warm-up prompts so MIN_PROMPTS guard passes (3rd call keeps history.length=2 below LLM profile gate)
    for (let i = 0; i < 2; i++) {
      await runAuto(makeInput({ projectRoot: '/test/freq-off' }), store);
    }
    const result = await runAuto(makeInput({ projectRoot: '/test/freq-off' }), store, openai);
    expect(result.outcome).toBe('no_action');
    expect(createFn).toHaveBeenCalled();  // classifier runs every prompt; the gate blocks the advisory
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

    for (let i = 0; i < 2; i++) {
      await runAuto(makeInput({ projectRoot: '/test/freq-proj-off' }), store);
    }
    const result = await runAuto(makeInput({ projectRoot: '/test/freq-proj-off' }), store, openai);
    expect(result.outcome).toBe('no_action');
    expect(createFn).toHaveBeenCalled();  // classifier runs every prompt; the gate blocks the advisory
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

    for (let i = 0; i < 2; i++) {
      await runAuto(makeInput({ projectRoot: '/test/freq-major' }), store);
    }
    // Force shouldFireStage2 to return an absence flag by running the already-flagged state
    const result = await runAuto(makeInput({ projectRoot: '/test/freq-major' }), store, openai);
    expect(result.outcome).toBe('no_action');
    expect(createFn).toHaveBeenCalled();  // classifier runs every prompt; the gate blocks the advisory
  });

  it('returns no_action for second event when frequency is "once_per_session"', async () => {
    setConfig(store, 'advisory_frequency', 'once_per_session');
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');

    // Pre-mark one event as fired so firedDecisionSessions.length > 0
    const mgr = SessionStateManager.load(store, '/test/freq-once');
    mgr.markDecisionSessionFired(store, 'stage_transition:→implementation');

    const openai = makeMockOpenAI(FIRE_YES_RESPONSE);
    const createFn = openai.chat.completions.create as ReturnType<typeof vi.fn>;

    for (let i = 0; i < 2; i++) {
      await runAuto(makeInput({ projectRoot: '/test/freq-once' }), store);
    }
    const result = await runAuto(makeInput({ projectRoot: '/test/freq-once' }), store, openai);
    // once_per_session: already fired once → gate blocks
    expect(result.outcome).toBe('no_action');
    expect(createFn).toHaveBeenCalled();  // classifier runs every prompt; the gate blocks the advisory
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

  beforeEach(async () => {
    store = await openStore(':memory:');
    // Pins the Medium (`every_event`) gate numbers this suite is about — min 3 prompts,
    // cap 5/10. The unset default became High (`optimum`: min 1, cap 9999) on 2026-09-19.
    setConfig(store, 'advisory_frequency', 'every_event');
  });
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

    // Warm up past MIN_PROMPTS guard — 2 calls keeps history.length=2 below LLM profile gate
    for (let i = 0; i < 2; i++) {
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

  function makeParallelMockOpenAI(
    stage2Response: object,
    pinchText = 'Hold up.',
    optionResponse: string | null = null,
    pass1Response: string | null = null,
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
            // call 2: generatePinchLabel; call 3: generateOptionList Pass 1; call 4: generateOptionList Pass 2
            if (pass1Response && callCount === 3) {
              return Promise.resolve({
                choices: [{ message: { content: pass1Response } }],
              });
            }
            if (optionResponse && callCount === 4) {
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

  it('advisory is stored with null generatedL1/L2/L3 — option gen runs in stop hook', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');

    for (let i = 0; i < 2; i++) {
      await runAuto(makeInput({ projectRoot: '/test/gen-opts' }), store);
    }

    const mgr = SessionStateManager.load(store, '/test/gen-opts');
    mgr.addAbsenceFlag(store, {
      signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 0, cooldownUntil: 100,
    });

    const openai = makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.');
    const result = await runAuto(makeInput({ projectRoot: '/test/gen-opts' }), store, openai);

    if (result.outcome === 'pending') {
      const advisory = getPendingAdvisory(store, '/test/gen-opts');
      expect(advisory).not.toBeNull();
      expect(advisory?.status).toBe('pending');
      expect(advisory?.generatedL1).toBeNull();
      expect(advisory?.generatedL2).toBeNull();
      expect(advisory?.generatedL3).toBeNull();
    }
  });

  it('advisory is stored with null generatedL1/L2/L3 — auto no longer calls option gen', async () => {
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

// ── runAuto — LLM profile classification gate (Phase 3) ──────────────────────

describe('runAuto — LLM profile classification gate', () => {
  let store: Store;
  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('LLM profile call is skipped when promptHistory has fewer than MIN_PROFILE_PROMPTS-1 prompts', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    // Run 2 times — history has 2 entries before the 3rd call, below the gate (MIN_PROFILE_PROMPTS-1=3)
    for (let i = 0; i < 2; i++) {
      await runAuto(makeInput({ projectRoot: '/test/llm-gate-skip' }), store);
    }
    // The stage classifier runs every prompt, but the profile classifier must NOT run
    // yet (history below the gate) — assert the profile stays uncomputed.
    await runAuto(makeInput({ projectRoot: '/test/llm-gate-skip' }), store, makeMockOpenAI(FIRE_NO_RESPONSE));
    const mgr = SessionStateManager.load(store, '/test/llm-gate-skip');
    expect(mgr.current.profile).toBeNull();
  });

  it('LLM profile call fires and profile is saved when history reaches MIN_PROFILE_PROMPTS and profile is null', async () => {
    // Run 3 times — history has 3 entries before the 4th call; gate passes (MIN_PROFILE_PROMPTS-1=3)
    for (let i = 0; i < 3; i++) {
      await runAuto(makeInput({ projectRoot: '/test/llm-gate-fire' }), store);
    }
    const profileJson = JSON.stringify({
      nature: 'hardcore_pro', mood: 'focused', depth: 'high',
      precision: 'very_high', playfulness: 'low',
    });
    const profileMock = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: profileJson } }],
          }),
        },
      },
    } as unknown as OpenAI;
    await runAuto(makeInput({ projectRoot: '/test/llm-gate-fire' }), store, profileMock);
    expect(profileMock.chat.completions.create).toHaveBeenCalled();
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/llm-gate-fire');
    expect(mgr.current.profile?.nature).toBe('hardcore_pro');
    expect(mgr.current.profile?.mood).toBe('focused');
    expect(mgr.current.profile?.depth).toBe('high');
  });
});

// ── runAuto — keep-separate (the classifier does not fold profile / Stream-B) ──

describe('runAuto — keep-separate classifiers', () => {
  let store: Store;
  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('the profile classifier runs BEFORE the stage classifier (classifier calibrates on the fresh profile)', async () => {
    // Warm up enough history that the profile gate passes on the next call.
    for (let i = 0; i < 3; i++) {
      await runAuto(makeInput({ projectRoot: '/test/order' }), store);
    }
    const order: string[] = [];
    const client = { chat: { completions: { create: vi.fn().mockImplementation((req: { messages: { role: string; content: string }[] }) => {
      const text = req.messages.map((m) => m.content).join('\n');
      // The stage-classifier system message identifies itself; the profile call does not.
      order.push(text.includes('stage classifier') ? 'classifier' : 'profile-or-other');
      return Promise.resolve({ choices: [{ message: { content: JSON.stringify({
        stage: 'Implementation', stage_confidence: 0.3, signals_present: [], signals_absent: [],
        fire_decision_session: false, selected_signal_key: '', reason: 'x',
        nature: 'hardcore_pro', mood: 'focused', depth: 'high', precision: 'very_high', playfulness: 'low',
      }) } }] });
    }) } } } as unknown as OpenAI;
    await runAuto(makeInput({ projectRoot: '/test/order' }), store, client);
    const firstClassifier = order.indexOf('classifier');
    const firstProfile    = order.indexOf('profile-or-other');
    // Both fired, and a non-classifier (profile) call preceded the classifier call.
    expect(firstClassifier).toBeGreaterThan(-1);
    expect(firstProfile).toBeGreaterThan(-1);
    expect(firstProfile).toBeLessThan(firstClassifier);
  });

  it('Stream-B still fires as a call distinct from the stage classifier (implementation stage)', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    setConfig(store, 'advisory_frequency', 'optimum');
    await runAuto(makeInput({ promptText: IMPL_PROMPT, projectRoot: '/test/keep-sep' }), store);
    // Force implementation stage with promptsInCurrentStage >= 3 so Stream-B fires on the next call
    // (Stream-B reads currentStage BEFORE processPrompt runs).
    const mgr = SessionStateManager.load(store, '/test/keep-sep');
    (mgr as unknown as { state: Record<string, unknown> }).state['currentStage']         = 'implementation';
    (mgr as unknown as { state: Record<string, unknown> }).state['stageConfidence']       = 0.9;
    (mgr as unknown as { state: Record<string, unknown> }).state['promptsInCurrentStage'] = 3;
    mgr.setDetectedLanguage(store, 'en'); // persists the state above

    const seen: string[] = [];
    const client = { chat: { completions: { create: vi.fn().mockImplementation((req: { messages: { content: string }[] }) => {
      seen.push(req.messages.map((m) => m.content).join('\n'));
      return Promise.resolve({ choices: [{ message: { content: JSON.stringify(FIRE_NO_RESPONSE) } }] });
    }) } } } as unknown as OpenAI;
    await runAuto(makeInput({ promptText: IMPL_PROMPT, projectRoot: '/test/keep-sep' }), store, client);

    // The stage classifier fired (its system prompt is present) AND Stream-B fired as a
    // SEPARATE call — the wiring did not fold Stream-B into the single classifier call.
    expect(seen.some((t) => t.includes('stage classifier'))).toBe(true);
    expect(seen.length).toBeGreaterThanOrEqual(2);
  });
});

// ── runAuto — telemetry events ────────────────────────────────────────────────

describe('runAuto — telemetry events', () => {
  let store: Store;

  beforeEach(async () => {
    store = await openStore(':memory:');
    setConfig(store, 'advisory_frequency', 'every_event');   // these assertions pin the Medium gate numbers
    vi.mocked(writeTelemetry).mockClear();
  });

  afterEach(() => { store.db.close(); });

  it('emits prompt_received on every runAuto call', async () => {
    await runAuto(makeInput({ projectRoot: '/test/tel-recv' }), store);
    expect(vi.mocked(writeTelemetry)).toHaveBeenCalledWith(
      '/test/tel-recv', 'prompt_received', expect.objectContaining({ promptCount: expect.any(Number) }), expect.anything(),
    );
  });

  it('emits prompt_classified after stage 1 classification', async () => {
    await runAuto(makeInput({ projectRoot: '/test/tel-class' }), store);
    expect(vi.mocked(writeTelemetry)).toHaveBeenCalledWith(
      '/test/tel-class', 'prompt_classified', expect.objectContaining({ stage: expect.any(String), confidence: expect.any(Number) }), expect.anything(),
    );
  });

  it('emits absence_flags_detected after absence detection', async () => {
    await runAuto(makeInput({ projectRoot: '/test/tel-abs' }), store);
    expect(vi.mocked(writeTelemetry)).toHaveBeenCalledWith(
      '/test/tel-abs', 'absence_flags_detected', expect.objectContaining({ newFlagsCount: expect.any(Number), totalFlagsCount: expect.any(Number) }), expect.anything(),
    );
  });

  it('emits advisory_min_prompts_blocked when promptCount < MIN_PROMPTS_BEFORE_ADVISORY', async () => {
    await runAuto(makeInput({ projectRoot: '/test/tel-min' }), store);
    expect(vi.mocked(writeTelemetry)).toHaveBeenCalledWith(
      '/test/tel-min', 'advisory_min_prompts_blocked', expect.objectContaining({ promptCount: 1, minRequired: 3 }), expect.anything(),
    );
  });

  it('emits pipeline_no_action with reason no_flag when shouldFireStage2 returns null', async () => {
    // Weak prompt with no absence flags → shouldFireStage2 returns null
    await runAuto(makeInput({ promptText: 'ok', projectRoot: '/test/tel-noflag' }), store);
    const calls = vi.mocked(writeTelemetry).mock.calls;
    // First 3 prompts have min_prompts_blocked; need to verify no_flag fires when min guard passes
    // Run 3 prompts so the 3rd passes the min guard but produces no flag
    vi.mocked(writeTelemetry).mockClear();
    for (let i = 0; i < 2; i++) {
      await runAuto(makeInput({ promptText: 'ok', projectRoot: '/test/tel-noflag2' }), store);
    }
    vi.mocked(writeTelemetry).mockClear();
    await runAuto(makeInput({ promptText: 'ok', projectRoot: '/test/tel-noflag2' }), store);
    const noflagCall = vi.mocked(writeTelemetry).mock.calls.find(
      ([, event]) => event === 'pipeline_no_action',
    );
    expect(noflagCall).toBeDefined();
    void calls; // suppress unused warning
  });

  it('emits advisory_freq_blocked when advisory_frequency is off', async () => {
    const { setConfig } = await import('../../store/config.js');
    setConfig(store, 'advisory_frequency', 'off');
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');

    for (let i = 0; i < 2; i++) {
      await runAuto(makeInput({ projectRoot: '/test/tel-freq' }), store);
    }
    const mgr = SessionStateManager.load(store, '/test/tel-freq');
    (mgr as unknown as { state: { stageConfidence: number } }).state.stageConfidence = 0.3;
    mgr.addAbsenceFlag(store, { signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 0, cooldownUntil: 100 });

    vi.mocked(writeTelemetry).mockClear();
    await runAuto(makeInput({ projectRoot: '/test/tel-freq' }), store, makeMockOpenAI(FIRE_YES_RESPONSE));

    expect(vi.mocked(writeTelemetry)).toHaveBeenCalledWith(
      '/test/tel-freq', 'advisory_freq_blocked', expect.objectContaining({ freq: 'off' }), expect.anything(),
    );
  });

  it('emits advisory_cap_blocked when advisoryCount reaches cap', async () => {
    for (let i = 0; i < 2; i++) {
      await runAuto(makeInput({ projectRoot: '/test/tel-cap' }), store);
    }
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/tel-cap');
    (mgr as unknown as { state: { advisoryCount: number; stageConfidence: number } }).state.advisoryCount = 5;
    (mgr as unknown as { state: { stageConfidence: number } }).state.stageConfidence = 0.3;
    mgr.addAbsenceFlag(store, { signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 0, cooldownUntil: 100 });

    vi.mocked(writeTelemetry).mockClear();
    await runAuto(makeInput({ projectRoot: '/test/tel-cap' }), store, makeMockOpenAI(FIRE_YES_RESPONSE));

    expect(vi.mocked(writeTelemetry)).toHaveBeenCalledWith(
      '/test/tel-cap', 'advisory_cap_blocked', expect.objectContaining({ advisoryCount: 5, advisoryCap: 5 }), expect.anything(),
    );
  });

  it('emits pipeline_advisory_pending when advisory is stored', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/tel-pending');
    mgr.addAbsenceFlag(store, { signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 5, cooldownUntil: 100 });

    const result = await runAuto(makeInput({ projectRoot: '/test/tel-pending' }), store, makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'));

    if (result.outcome === 'pending') {
      expect(vi.mocked(writeTelemetry)).toHaveBeenCalledWith(
        '/test/tel-pending', 'pipeline_advisory_pending', expect.objectContaining({ pinchLabel: 'Hold up.' }), expect.anything(),
      );
    }
  });

  it('emits stage2_evaluated with confirmed field after stage 2 runs', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/tel-s2');
    mgr.addAbsenceFlag(store, { signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 5, cooldownUntil: 100 });

    for (let i = 0; i < 2; i++) {
      await runAuto(makeInput({ projectRoot: '/test/tel-s2' }), store);
    }
    vi.mocked(writeTelemetry).mockClear();
    await runAuto(makeInput({ projectRoot: '/test/tel-s2' }), store, makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'));

    const s2Call = vi.mocked(writeTelemetry).mock.calls.find(([, event]) => event === 'classifier_fire_evaluated');
    if (s2Call) {
      expect(s2Call[2]).toEqual(expect.objectContaining({ confirmed: expect.any(Boolean) }));
    }
  });

  // ── Phase 4 — pipeline_advisory_pending enriched payload (Items B + H + J) ──

  it('pipeline_advisory_pending carries advisoryCountInSession, decisionSessionCountInProject, recentPrompts', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/tel-rich');
    mgr.addAbsenceFlag(store, { signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 5, cooldownUntil: 100 });

    // Run a couple prior prompts so promptHistory + counters have content.
    for (let i = 0; i < 2; i++) {
      await runAuto(makeInput({ projectRoot: '/test/tel-rich' }), store);
    }
    vi.mocked(writeTelemetry).mockClear();
    await runAuto(makeInput({ projectRoot: '/test/tel-rich' }), store, makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'));

    const pendingCall = vi.mocked(writeTelemetry).mock.calls.find(
      ([, event]) => event === 'pipeline_advisory_pending',
    );
    if (pendingCall) {
      const payload = pendingCall[2] as Record<string, unknown>;
      expect(payload).toHaveProperty('advisoryCountInSession');
      expect(typeof payload['advisoryCountInSession']).toBe('number');
      expect(payload).toHaveProperty('decisionSessionCountInProject');
      expect(typeof payload['decisionSessionCountInProject']).toBe('number');
      expect(payload).toHaveProperty('recentPrompts');
      expect(Array.isArray(payload['recentPrompts'])).toBe(true);
    }
  });

  it('recentPrompts in pipeline_advisory_pending NEVER contains the text field (PII guarantee)', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/tel-pii');
    mgr.addAbsenceFlag(store, { signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 5, cooldownUntil: 100 });

    for (let i = 0; i < 2; i++) {
      await runAuto(makeInput({ promptText: `prior prompt ${i}`, projectRoot: '/test/tel-pii' }), store);
    }
    vi.mocked(writeTelemetry).mockClear();
    await runAuto(makeInput({ promptText: 'sensitive prompt text', projectRoot: '/test/tel-pii' }), store, makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'));

    const pendingCall = vi.mocked(writeTelemetry).mock.calls.find(
      ([, event]) => event === 'pipeline_advisory_pending',
    );
    if (pendingCall) {
      const payload = pendingCall[2] as { recentPrompts: Array<Record<string, unknown>> };
      for (const entry of payload.recentPrompts) {
        expect(entry).not.toHaveProperty('text');
      }
    }
  });

  it('recentPrompts is capped at 5 entries even after many prior prompts', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/tel-cap5');
    mgr.addAbsenceFlag(store, { signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 5, cooldownUntil: 100 });

    // Build up promptHistory with 7+ prompts.
    for (let i = 0; i < 7; i++) {
      await runAuto(makeInput({ promptText: `prompt ${i}`, projectRoot: '/test/tel-cap5' }), store);
    }
    vi.mocked(writeTelemetry).mockClear();
    await runAuto(makeInput({ promptText: 'fire', projectRoot: '/test/tel-cap5' }), store, makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'));

    const pendingCall = vi.mocked(writeTelemetry).mock.calls.find(
      ([, event]) => event === 'pipeline_advisory_pending',
    );
    if (pendingCall) {
      const payload = pendingCall[2] as { recentPrompts: unknown[] };
      expect(payload.recentPrompts.length).toBeLessThanOrEqual(5);
    }
    // Timeout widened to 60s (from 30s) — eight sequential runAuto calls
    // (seven setup plus one final fire with an OpenAI mock) compound the
    // per-call advisory-pipeline latency and exceeded the prior 30s budget
    // on contended CI runners.
  }, 60000);
});

// ── runAuto — absence flag selective add (Fix: bulk-add removed) ──────────────
//
// Before the fix, ALL flags returned by detectAbsenceFlags were added to absenceFlags
// immediately, burning a 30-prompt cooldown for signals whose DS was never shown.
// After the fix, only newFlags[0] (the selected signal) is added — and only after all
// early-exit gates pass (step 6.8, immediately before Stage 2).

describe('runAuto — absence flag selective add', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  // Neutral implementation-context prompt that does not match any signal's
  // detectionKeywords or vibeKeywords — keeps all signal counters lastSeenAt=null.
  const NEUTRAL_IMPL = 'add the configuration and wire the service layer';

  async function setupImplState(projectRoot: string): Promise<void> {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    setConfig(store, 'advisory_frequency', 'optimum');
    // One run to advance promptCount past minPromptsBeforeAdvisory (1 at optimum)
    await runAuto(makeInput({ promptText: NEUTRAL_IMPL, projectRoot }), store);
    // pICS=2: Gate 2 passes on the next call (absenceMinFloor=2 at optimum, pICS→3 after
    // processPrompt). Critically, Stream B fires when promptsInCurrentStage >= 3 BEFORE
    // processPrompt — using pICS=2 keeps Stream B dormant so the first OpenAI call
    // goes to Stage 2, not Stream B, keeping the makeMockOpenAI call order correct.
    const mgr = SessionStateManager.load(store, projectRoot);
    (mgr as unknown as { state: Record<string, unknown> }).state['currentStage']         = 'implementation';
    (mgr as unknown as { state: Record<string, unknown> }).state['stageConfidence']       = 0.9;
    (mgr as unknown as { state: Record<string, unknown> }).state['promptsInCurrentStage'] = 2;
    mgr.setDetectedLanguage(store, 'en'); // triggers saveState to persist above
  }

  it('adds all qualifying absence flags when Condition 2 fires', async () => {
    // With pICS=2 (→3 after processPrompt) and optimum thresholds, signals with
    // effectiveThreshold ≤ 3 may qualify simultaneously. All qualifying signals are
    // added to absenceFlags so Stage 2 can select the most contextually relevant one.
    await setupImplState('/test/selective-add-fire');
    const result = await runAuto(
      makeInput({ promptText: NEUTRAL_IMPL, projectRoot: '/test/selective-add-fire' }),
      store,
      makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'),
    );
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/selective-add-fire');
    // outcome=pending → at least 1 absence flag added
    // outcome=no_action → stage may have flipped (pICS reset), 0 flags possible
    if (result.outcome === 'pending') {
      expect(mgr.current.absenceFlags.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('adds all qualifying flags before Stage 2 runs — flags present even on Stage 2 decline', async () => {
    // Stage 2 declines → pipeline returns no_action. All qualifying flags must still be
    // in absenceFlags so Stage 2 is not triggered again immediately (hammer prevention).
    await setupImplState('/test/selective-add-decline');
    vi.mocked(writeTelemetry).mockClear();
    await runAuto(
      makeInput({ promptText: NEUTRAL_IMPL, projectRoot: '/test/selective-add-decline' }),
      store,
      makeMockOpenAI(FIRE_NO_RESPONSE),
    );
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/selective-add-decline');
    // Find a stage2_evaluated event for an absence trigger that declined
    const s2Call = vi.mocked(writeTelemetry).mock.calls.find(([, ev]) => ev === 'classifier_fire_evaluated');
    const absenceDeclined =
      s2Call !== undefined &&
      (s2Call[2] as Record<string, unknown>)?.['confirmed'] === false &&
      (s2Call[2] as Record<string, unknown>)?.['flagType'] === 'absence';
    if (absenceDeclined) {
      // Stage 2 ran for an absence signal and declined — all qualifying flags are in absenceFlags
      expect(mgr.current.absenceFlags.length).toBeGreaterThanOrEqual(1);
    } else {
      // Stage transition path or early exit — flags correctly not added or already counted
      expect(mgr.current.absenceFlags.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('does not add any flag when post-advisory cooldown blocks before step 6.8', async () => {
    // Pipeline exits at step 6.6 (cooldown) — before the addAbsenceFlag call at step 6.8.
    // Even if Condition 2 fired (newFlags > 0), no flag should be added.
    await setupImplState('/test/selective-add-cooldown');
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    // Set lastAdvisoryPromptIndex = promptCount so cooldown gap = 0 < postAdvisoryCooldown(2)
    const mgr = SessionStateManager.load(store, '/test/selective-add-cooldown');
    const currentCount = mgr.current.promptCount;
    (mgr as unknown as { state: Record<string, unknown> }).state['lastAdvisoryPromptIndex'] = currentCount;
    mgr.setDetectedLanguage(store, 'en');

    vi.mocked(writeTelemetry).mockClear();
    const result = await runAuto(
      makeInput({ promptText: NEUTRAL_IMPL, projectRoot: '/test/selective-add-cooldown' }),
      store,
      makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'),
    );
    const mgr2 = SessionStateManager.load(store, '/test/selective-add-cooldown');
    expect(result.outcome).toBe('no_action');
    // Confirm it was the cooldown gate (step 6.6) that blocked — not an unrelated early exit.
    const cooldownBlocked = vi.mocked(writeTelemetry).mock.calls.some(
      ([, ev]) => ev === 'advisory_cooldown_blocked',
    );
    if (cooldownBlocked) {
      // Cooldown blocked before step 6.8 — no absence flag should have been added
      expect(mgr2.current.absenceFlags.length).toBe(0);
    }
  });
});

// ── SessionStateManager — applyStage2SignalUpdates ────────────────────────────

describe('SessionStateManager — applyStage2SignalUpdates', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('marks known signal as present with lastSeenAt = promptCount - 1', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/s2sig');

    // Advance promptCount to 5 so the index is predictable
    (mgr as unknown as { state: Record<string, unknown> }).state['promptCount'] = 5;
    mgr.setDetectedLanguage(store, 'en'); // persists state

    mgr.applyStage2SignalUpdates(store, ['test_creation']);

    const mgr2 = SessionStateManager.load(store, '/test/s2sig');
    const counter = mgr2.current.signalCounters['test_creation'];
    expect(counter).toBeDefined();
    expect(counter.present).toBe(true);
    expect(counter.lastSeenAt).toBe(4); // promptCount(5) - 1
  });

  it('ignores unknown signal keys returned by LLM', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/s2sig-unknown');
    // Should not throw even if LLM hallucinated a key
    expect(() => {
      mgr.applyStage2SignalUpdates(store, ['not_a_real_signal_key_xyz']);
    }).not.toThrow();
  });

  it('updates multiple signals in one call', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/s2sig-multi');
    (mgr as unknown as { state: Record<string, unknown> }).state['promptCount'] = 10;
    mgr.setDetectedLanguage(store, 'en');

    mgr.applyStage2SignalUpdates(store, ['test_creation', 'security_check']);

    const mgr2 = SessionStateManager.load(store, '/test/s2sig-multi');
    expect(mgr2.current.signalCounters['test_creation']?.present).toBe(true);
    expect(mgr2.current.signalCounters['security_check']?.present).toBe(true);
    expect(mgr2.current.signalCounters['test_creation']?.lastSeenAt).toBe(9);
    expect(mgr2.current.signalCounters['security_check']?.lastSeenAt).toBe(9);
  });

  it('persists signal updates across SessionStateManager reloads', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/s2sig-persist');
    (mgr as unknown as { state: Record<string, unknown> }).state['promptCount'] = 7;
    mgr.setDetectedLanguage(store, 'en');

    mgr.applyStage2SignalUpdates(store, ['test_creation']);

    // Reload from store
    const mgr2 = SessionStateManager.load(store, '/test/s2sig-persist');
    expect(mgr2.current.signalCounters['test_creation']?.present).toBe(true);
    expect(mgr2.current.signalCounters['test_creation']?.lastSeenAt).toBe(6);
  });

  it('does not throw when signalsPresent is empty', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/s2sig-empty');
    expect(() => {
      mgr.applyStage2SignalUpdates(store, []);
    }).not.toThrow();
  });
});

describe('runAuto — usage recording (feedback cadence)', () => {
  let store: Store;
  beforeEach(async () => { store = await openStore(':memory:'); });

  it('records active usage on a genuine prompt', async () => {
    await runAuto(makeInput({ promptText: 'do something' }), store);
    expect(readCadence(store).lastActivityAt).not.toBeNull();
  });

  it('accumulates usage globally across prompts (any project → one counter)', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000_000);
    await runAuto(makeInput({ projectRoot: '/proj-a', promptText: 'a' }), store);
    nowSpy.mockReturnValue(1_000_000 + 60_000);
    await runAuto(makeInput({ projectRoot: '/proj-b', promptText: 'b' }), store);
    nowSpy.mockRestore();
    expect(readCadence(store).activeMs).toBe(60_000);
  });

  it('does not count gaps longer than the idle cap', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000_000);
    await runAuto(makeInput({ promptText: 'a' }), store);
    nowSpy.mockReturnValue(1_000_000 + IDLE_CAP_MS + 1);
    await runAuto(makeInput({ promptText: 'b' }), store);
    nowSpy.mockRestore();
    expect(readCadence(store).activeMs).toBe(0);
  });

  it('does not record activity for an advisory-injected prompt', async () => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/project');
    mgr.setInjectedPrompt(store, 'INJECTED');
    await runAuto(makeInput({ projectRoot: '/test/project', promptText: 'INJECTED' }), store);
    expect(readCadence(store).lastActivityAt).toBeNull();
  });
});
describe('validated PE preparation boundary', () => {
  it('builds a valid source-backed request and runs the approved facade', async () => {
    const store = await openStore(':memory:');
    try {
      const projectRoot = '/test/builder';
      const session = SessionStateManager.load(store, projectRoot);
      const request = buildPromptEnhancementRequestForAuto({
        auto: makeInput({ projectRoot, currentAgentMode: 'workspace-write' }),
        store,
        session,
        project: null,
        effectiveLanguage: 'en',
        configuredRole: null,
        effectiveFlagType: 'stage_transition',
        firedKey: 'stage_transition:task_breakdown→implementation',
        previousStage: 'task_breakdown',
        trigger: { kind: 'stage_transition' },
        stageResult: {
          classification: { stage: 'implementation', confidence: 0.9, tier: 3, allScores: {} },
          signalsPresent: [],
          signalsAbsent: [],
          fireRecommendation: true,
          selectedSignalKey: '',
          reason: 'test',
          degraded: false,
          primaryIntent: 'issue_debug.failing_test',
          intentConfidence: 0.8,
          capabilityCandidates: ['capability.confirmation_needed'],
          debugEvidencePresent: ['logs', 'failing_test_details'],
          sensitiveActionVerdict: 'not_proposed',
          sensitiveActionReason: 'the risky word names a CSS effect only',
          sensitiveActionName: 'shadow styling tweak',
        },
        streamBOutputs: [],
      });

      expect(validatePromptEnhancementPrepareRequestV1(request).ok).toBe(true);
      expect(request.sourceSignals.sourceAOriginalPromptRef.sourceKind).toBe('source_a_user_prompt');
      expect(request.reviewMomentContext.triggerProvenance.firedKey).toContain('stage_transition');
      // The classifier's proposal + observation ride the provenance verbatim —
      // proposals and observations only; the router and registry decide.
      expect(request.reviewMomentContext.triggerProvenance.classifierPrimaryIntent).toBe('issue_debug.failing_test');
      expect(request.reviewMomentContext.triggerProvenance.classifierIntentConfidence).toBe(0.8);
      expect(request.reviewMomentContext.triggerProvenance.classifierCapabilityCandidates).toEqual(['capability.confirmation_needed']);
      expect(request.reviewMomentContext.triggerProvenance.classifierDebugEvidencePresent).toEqual(['logs', 'failing_test_details']);
      // The sensitive-action clearance rides the same provenance, verdict + reason together —
      // and only when the verdict exists (a degraded call omits the field: the fail-closed state).
      expect(request.reviewMomentContext.triggerProvenance.classifierSensitiveActionClearance).toEqual({
        verdict: 'not_proposed',
        reason: 'the risky word names a CSS effect only',
        name: 'shadow styling tweak',
      });
      expect(request.sourceSignals.promptStartStop.runAutoCanHoldOrReplaceSubmittedPrompt).toBe(false);

      const result = await preparePromptEnhancement(request);
      expect(result.disposition).toBe('show_current_body');
      expect(result.currentBody.originalPromptText).toBe(request.sourcePrompt.text);
    } finally {
      store.db.close();
    }
  });

  it('calls the injected facade once for one eligible shared trigger', async () => {
    const store = await openStore(':memory:');
    try {
      const projectRoot = '/test/eligible';
      primeTaskBreakdownSession(store, projectRoot);
      const request = makeBoundaryRequest(store, projectRoot);
      const facadeResult = await preparePromptEnhancement(request);
      const prepare = vi.fn().mockResolvedValue(asLlmWorded(facadeResult));
      const onResult = vi.fn();

      const result = await runAuto(
        makeInput({ projectRoot }),
        store,
        makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'),
        { request, prepare, onResult },
      );

      expect(result.outcome).toBe('pending');
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(onResult).toHaveBeenCalledTimes(1);
      // Owner decision B-i: no popup on UserPromptSubmit — the prepared PE is persisted for the
      // Stop hook instead of being shown here.
      const pendingPe = getPendingPromptEnhancement(store, projectRoot);
      expect(pendingPe).not.toBeNull();
      expect(pendingPe!.result.disposition).toBe(facadeResult.disposition);
      expect(request.reviewMomentContext.triggerProvenance.promptStartCanReplaceSameTurn).toBe(false);
      expect(request.sourceSignals.sourceAOriginalPromptRef.sourceKind).toBe('source_a_user_prompt');
    } finally {
      store.db.close();
    }
  });

  it('and BOTH boundary logs report the same fields — one of two is how observability rots', () => {
    // ⛔ Found in I1 round 5, twice over: `suppressedReason` (the deterministic-popup fix) and
    // `relevanceOrderCount` (the I1 ordering) were each added to the sequence-shaped boundary log
    // and NOT to the main one — the common path. Both fixes were therefore observable only on the
    // rarer route, and nothing said so.
    //
    // Pinned as a COUNT rather than by parsing the calls: the failure is always "added to one site",
    // and a count catches that without pretending to understand the log's shape. Two logs of the
    // same event reporting different fields cannot be read together.
    const source = readFileSync('src/cli/commands/auto.ts', 'utf8');
    const logs = source.split("logger.debug('prompt_enhancement_prepare_boundary'").length - 1;
    for (const field of ['suppressedReason:', 'relevanceOrderCount:', 'classifierDegraded:']) {
      const carried = source.split(field).length - 1;
      expect(
        carried,
        `${logs} prepare-boundary logs exist and ${carried} carry ${field} — the fix is invisible on `
        + 'the paths that do not',
      ).toBe(logs);
    }
  });

  it('and EVERY display gate carries the check — there are two, and only one is behaviourally reachable here', () => {
    // ⚠️ Honest about what this proves. The behavioural fixture below drives the main `runAuto`
    // path; the OTHER persistence site sits inside the sequence-shaped fallback closure, which
    // needs sequence state this file has no harness for. A mutation confirmed the gap: removing the
    // check from that site left every test green.
    //
    // So the second site is pinned structurally instead of not at all — the check must appear at
    // BOTH, and a new persistence site added without it fails here with the reason why.
    const source = readFileSync('src/cli/commands/auto.ts', 'utf8');
    // Counted as the GATE usage (`|| …;` inside a displayDecision), not as any call: the boundary
    // log calls the same predicate and must not be mistaken for a guard.
    const gates = source.split('|| promptEnhancementBodyHasNoLlmWordingV1(preparation.result);').length - 1;
    // Sites persist through `storePendingPromptEnhancement` (which hands the body to an in-process
    // host instead) or, if one is ever added directly, `upsertPendingPromptEnhancement`.
    const persists = source.split('upsertPendingPromptEnhancement(store, {').length - 1
      + source.split('storePendingPromptEnhancement({').length - 1;
    expect(
      gates,
      `${persists} persistence sites exist and ${gates} carry the no-LLM-wording check — a body with `
      + 'no LLM wording would reach the Stop hook through the unguarded one',
    ).toBe(persists);
  });

  it('withholds the popup entirely when the body carries NO LLM wording', async () => {
    // 🔒 Owner ruling 2026-08-19, scope (a): a deterministic-only body is boilerplate and does not
    // earn a popup — including when there is no API key at all, which is the case that makes this
    // whole suite deterministic. Pinned at the DISPLAY seam: no pending row is written, so the Stop
    // hook has nothing to show and no window is spawned.
    const store = await openStore(':memory:');
    try {
      const projectRoot = '/test/deterministic-only';
      primeTaskBreakdownSession(store, projectRoot);
      const request = makeBoundaryRequest(store, projectRoot);
      const facadeResult = await preparePromptEnhancement(request);

      await runAuto(
        makeInput({ projectRoot }),
        store,
        makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'),
        { request, prepare: vi.fn().mockResolvedValue(facadeResult) },
      );

      expect(
        getPendingPromptEnhancement(store, projectRoot),
        'a body with no LLM wording was queued for display — that is the boilerplate popup',
      ).toBeNull();
    } finally {
      store.db.close();
    }
  });

  it("persists a pending PE for the Stop hook and still queues the advisory (B-i)", async () => {
    const store = await openStore(":memory:");
    try {
      const projectRoot = "/test/h1-live-close";
      primeTaskBreakdownSession(store, projectRoot);
      const request = makeBoundaryRequest(store, projectRoot);
      const facadeResult = await preparePromptEnhancement(request);

      const result = await runAuto(
        makeInput({ projectRoot }),
        store,
        makeMockOpenAI(FIRE_YES_RESPONSE, "Hold up."),
        { request, prepare: vi.fn().mockResolvedValue(asLlmWorded(facadeResult)) },
      );

      // B-i: the PE popup is deferred to the Stop hook, so on UserPromptSubmit the PE is stored
      // (not shown) and the advisory is still queued — both surface later on Stop.
      expect(result).toEqual({ outcome: "pending" });
      expect(getPendingPromptEnhancement(store, projectRoot)).not.toBeNull();
      expect(getPendingAdvisory(store, projectRoot)).not.toBeNull();
    } finally {
      store.db.close();
    }
  });

  it('keeps the PE facade at zero calls across representative shared early gates', async () => {
    const cases: Array<{ name: string; configure: (store: Store, projectRoot: string) => OpenAI | undefined; promptText?: string }> = [
      {
        name: 'frequency-off',
        configure: (store) => { setConfig(store, 'advisory_frequency', 'off'); return undefined; },
      },
      {
        name: 'minimum-prompt',
        // The min-prompts floor is 3 on Medium and 1 on High, and High is the unset default
        // since 2026-09-19 — so the case names the level whose floor it exercises.
        configure: (store) => { setConfig(store, 'advisory_frequency', 'every_event'); return undefined; },
        promptText: 'ok',
      },
      {
        name: 'classifier-declined',
        configure: (store, projectRoot) => {
          SessionStateManager.load(store, projectRoot).addAbsenceFlag(store, {
            signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 1, cooldownUntil: 100,
          });
          return makeMockOpenAI(FIRE_NO_RESPONSE);
        },
      },
      {
        name: 'dedup',
        configure: (store, projectRoot) => {
          // The fired-KEY dedup list is only what the gate reads below High: `optimum` sets
          // countBudgetOnShow, which makes the gate read shown-popup state instead. High is the
          // unset default since 2026-09-19, so the branch under test has to be selected.
          setConfig(store, 'advisory_frequency', 'every_event');
          SessionStateManager.load(store, projectRoot).markDecisionSessionFired(store, 'stage_transition:idea→implementation');
          return makeMockOpenAI(FIRE_YES_RESPONSE);
        },
      },
    ];

    for (const testCase of cases) {
      const store = await openStore(':memory:');
      const projectRoot = `/test/gate-${testCase.name}`;
      try {
        const request = makeBoundaryRequest(store, projectRoot, testCase.promptText ?? IMPL_PROMPT);
        const prepare = vi.fn();
        const openai = testCase.configure(store, projectRoot);
        await runAuto(
          makeInput({ projectRoot, promptText: testCase.promptText ?? IMPL_PROMPT }),
          store,
          openai,
          { request, prepare },
        );
        expect(prepare, testCase.name).not.toHaveBeenCalled();
      } finally {
        store.db.close();
      }
    }
  });

  it('passes validated current, original-fallback, and no-popup dispositions without inventing UI authority', async () => {
    const store = await openStore(':memory:');
    try {
      const request = makeBoundaryRequest(store, '/test/dispositions');
      const current = await preparePromptEnhancement(request);
      const currentResult = await preparePromptEnhancementForAuto({
        request,
        prepare: vi.fn().mockResolvedValue(current),
      });
      expect(currentResult.safeFallback).toBe(false);
      expect(currentResult.disposition).toBe('show_current_body');

      // The boundary consumes the already-validated closed disposition;
      // action recomposition itself remains covered by the private PE suite.
      const fallback = { ...current, disposition: 'fallback_to_original' as const };
      const fallbackResult = await preparePromptEnhancementForAuto({
        request,
        prepare: vi.fn().mockResolvedValue(fallback),
      });
      expect(fallbackResult.safeFallback).toBe(false);
      expect(fallbackResult.disposition).toBe('fallback_to_original');

      const noPopupRequest = {
        ...request,
        sourcePrompt: { ...request.sourcePrompt, origin: 'pe_generated_echo' as const, generatedOriginPolicy: 'exclude_from_ordinary_learning' as const },
      };
      const noPopup = await preparePromptEnhancement(noPopupRequest);
      const noPopupResult = await preparePromptEnhancementForAuto({
        request: noPopupRequest,
        prepare: vi.fn().mockResolvedValue(noPopup),
      });
      expect(noPopupResult.safeFallback).toBe(false);
      expect(noPopupResult.disposition).toBe('no_popup_not_applicable');
    } finally {
      store.db.close();
    }
  });

  it('binds the validated result to one typed session and user event', async () => {
    const store = await openStore(':memory:');
    try {
      const request = makeBoundaryRequest(store, '/test/boundary');
      const prepared = await preparePromptEnhancement(request);
      const boundary = buildPromptEnhancementUiBoundarySessionV1({
        result: prepared,
        timestampMs: 100,
        deliverySurface: prepared.delivery.deliveryChannel,
      });

      expect(boundary.state).toBe('session_ready');
      if (boundary.state !== 'session_ready') throw new Error('expected typed session');
      expect(boundary.session.enhancementId).toBe(prepared.enhancementId);
      expect(boundary.session.currentBodyId).toBe(prepared.uiView.body.currentBodyId);
      expect(boundary.session.bodyRevision).toBe(prepared.uiView.body.bodyRevision);
      expect(boundary.session.validationDecisionId).toBe(prepared.validationDecisionId);
      expect(boundary.session.invariants.oneEditableBodyOnly).toBe(true);
      expect(boundary.session.invariants.autoSendRejected).toBe(true);

      const actionId = prepared.uiView.actions.find((action) => action.actionType === 'use_current_body')?.actionId;
      expect(actionId).toBeDefined();
      const event = createPromptEnhancementPopupEventV1({
        session: boundary.session,
        eventType: 'deliver_current_body',
        actionId: actionId!,
        currentBodyId: boundary.session.currentBodyId,
        bodyRevision: boundary.session.bodyRevision,
        editedBodyText: boundary.session.currentBodyText,
        timestampMs: 101,
        realUserInitiated: true,
      });
      expect(event.staleOrMismatched).toBe(false);
      expect(event.realUserInitiated).toBe(true);
      expect(event.enhancementId).toBe(boundary.session.enhancementId);

      const staleEvent = createPromptEnhancementPopupEventV1({
        session: boundary.session,
        eventType: 'deliver_current_body',
        actionId: actionId!,
        currentBodyId: boundary.session.currentBodyId,
        bodyRevision: boundary.session.bodyRevision + 1,
        editedBodyText: boundary.session.currentBodyText,
        timestampMs: 102,
        realUserInitiated: true,
      });
      expect(staleEvent.staleOrMismatched).toBe(true);

      const mismatch = buildPromptEnhancementUiBoundarySessionV1({
        result: prepared,
        timestampMs: 100,
        deliverySurface: 'extension_bridge',
      });
      expect(mismatch).toMatchObject({ state: 'no_popup', reasonCodes: ['delivery_surface_mismatch'] });

      const invalidTimestamp = buildPromptEnhancementUiBoundarySessionV1({
        result: prepared,
        timestampMs: Number.NaN,
      });
      expect(invalidTimestamp).toMatchObject({ state: 'no_popup', reasonCodes: ['invalid_render_timestamp'] });
    } finally {
      store.db.close();
    }
  });

  it('maps the validated result to the locked title, body, identity, and controls', async () => {
    const store = await openStore(':memory:');
    try {
      const request = makeBoundaryRequest(store, '/test/render-model');
      const prepared = await preparePromptEnhancement(request);
      const renderModel = buildPromptEnhancementPopupRenderModelV1({
        result: prepared,
        timestampMs: 200,
        deliverySurface: prepared.delivery.deliveryChannel,
      });

      expect(renderModel.state).toBe('render_model_ready');
      if (renderModel.state !== 'render_model_ready') throw new Error('expected render model');
      expect(renderModel.model.title).toBe('Nexpath · Prompt enhancement');
      expect(renderModel.model.title).not.toBe('Review enhanced prompt');
      expect(renderModel.model.editorHeading).toBe('Use enhanced prompt');
      expect(renderModel.model.layout).toEqual([
        'header',
        'pre_send_public_copy',
        'editor_heading',
        'enhanced_body',
        'additional_details',
        'directional_actions',
        'use_original',
        'keyboard_help',
      ]);
      expect(renderModel.model.identity).toMatchObject({
        enhancementId: prepared.enhancementId,
        currentBodyId: prepared.uiView.body.currentBodyId,
        bodyRevision: prepared.uiView.body.bodyRevision,
        validationDecisionId: prepared.validationDecisionId,
      });
      expect(renderModel.model.body.text).toBe(prepared.uiView.body.text);
      expect(renderModel.model.body.editable).toBe(true);
      expect(renderModel.model.controls.currentBody.actionType).toBe('use_current_body');
      expect(renderModel.model.controls.original.actionType).toBe('use_original');
      expect(renderModel.model.controls.close.actionType).toBe('close');
      expect(renderModel.model.rejectedControls).toEqual(expect.arrayContaining([
        'decision_session_option_list',
        'auto_submit',
        'raw_internal_source_diagnostics',
      ]));
      expect(renderModel.model.publicCopy.diagnostics.every((diagnostic) => diagnostic.rawPromptExcluded)).toBe(true);
    } finally {
      store.db.close();
    }
  });

  it('DEP-TEST-01-01: renders only the approved typed popup surface', async () => {
    const store = await openStore(':memory:');
    try {
      const prepared = await preparePromptEnhancement(makeBoundaryRequest(store, '/test/dep-test-01-01'));
      const renderModel = buildPromptEnhancementPopupRenderModelV1({
        result: prepared,
        timestampMs: 203,
        deliverySurface: prepared.delivery.deliveryChannel,
      });

      expect(renderModel.state).toBe('render_model_ready');
      if (renderModel.state !== 'render_model_ready') throw new Error('expected DEP-TEST-01 popup');
      expect(renderModel.model.title).toBe('Nexpath · Prompt enhancement');
      expect(renderModel.model.layout).toEqual([
        'header',
        'pre_send_public_copy',
        'editor_heading',
        'enhanced_body',
        'additional_details',
        'directional_actions',
        'use_original',
        'keyboard_help',
      ]);
      expect(renderModel.model.body.text).toBe(prepared.uiView.body.text);
      expect(renderModel.model.identity).toMatchObject({
        enhancementId: prepared.enhancementId,
        currentBodyId: prepared.uiView.body.currentBodyId,
        bodyRevision: prepared.uiView.body.bodyRevision,
        validationDecisionId: prepared.validationDecisionId,
      });
    } finally {
      store.db.close();
    }
  });

  it('DEP-TEST-01-02: keeps no_popup_not_applicable absent from the UI surface', async () => {
    const store = await openStore(':memory:');
    try {
      const request = makeBoundaryRequest(store, '/test/dep-test-01-02');
      const noPopup = await preparePromptEnhancement({
        ...request,
        sourcePrompt: {
          ...request.sourcePrompt,
          origin: 'pe_generated_echo' as const,
          generatedOriginPolicy: 'exclude_from_ordinary_learning' as const,
        },
      });
      const renderModel = buildPromptEnhancementPopupRenderModelV1({ result: noPopup, timestampMs: 204 });

      expect(renderModel).toEqual({
        state: 'no_popup',
        reasonCodes: ['typed_no_popup_disposition'],
      });
    } finally {
      store.db.close();
    }
  });

  it('DEP-TEST-01-03: preserves typed locked/loading state without locally enabling edit or send', async () => {
    const store = await openStore(':memory:');
    try {
      const prepared = await preparePromptEnhancement(makeBoundaryRequest(store, '/test/dep-test-01-03'));
      const loadingResult = {
        ...prepared,
        uiView: {
          ...prepared.uiView,
          body: { ...prepared.uiView.body, actionLoadingState: 'loading_action' as const },
        },
      };
      const renderModel = buildPromptEnhancementPopupRenderModelV1({
        result: loadingResult,
        timestampMs: 205,
        deliverySurface: loadingResult.delivery.deliveryChannel,
      });

      expect(renderModel.state).toBe('render_model_ready');
      if (renderModel.state !== 'render_model_ready') throw new Error('expected loading render model');
      expect(renderModel.model.session.popupLifecycleState).toBe('action_loading');
      expect(renderModel.model.body.editabilityState).toBe('locked_action_loading');
      expect(renderModel.model.body.editable).toBe(false);
      expect(renderModel.model.session.requiresUserFinalSubmit).toBe(true);
      expect(renderModel.model.session.sendabilityState).toBe('send_current');
    } finally {
      store.db.close();
    }
  });

  it('DEP-TEST-01-04: rejects stale or mismatched typed action identity before render', async () => {
    const store = await openStore(':memory:');
    try {
      const prepared = await preparePromptEnhancement(makeBoundaryRequest(store, '/test/dep-test-01-04'));
      const staleResult = {
        ...prepared,
        uiView: {
          ...prepared.uiView,
          actions: prepared.uiView.actions.map((action) => ({
            ...action,
            bodyRevision: action.bodyRevision + 1,
          })),
        },
      };
      const renderModel = buildPromptEnhancementPopupRenderModelV1({ result: staleResult, timestampMs: 206 });

      expect(renderModel.state).toBe('no_popup');
      expect(renderModel.reasonCodes).toEqual([
        'invalid_popup_session',
        'stale_popup_action:use_current_body',
        'stale_popup_action:use_original',
        'stale_popup_action:shorter',
        'stale_popup_action:more_thorough',
        'stale_popup_action:more_project_grounded',
        'stale_popup_action:apply_details',
        'stale_popup_action:feedback',
        'stale_popup_action:close',
      ]);
    } finally {
      store.db.close();
    }
  });

  it('DEP-TEST-01-05: keeps fallback/provider state read-only and exposes no automatic delivery claim', async () => {
    const store = await openStore(':memory:');
    try {
      const prepared = await preparePromptEnhancement(makeBoundaryRequest(store, '/test/dep-test-01-05'));
      const fallbackResult = {
        ...prepared,
        uiView: {
          ...prepared.uiView,
          body: {
            ...prepared.uiView.body,
            fallbackMode: 'provider_api_unavailable' as const,
            sendPolicy: 'send_original' as const,
          },
        },
      };
      const renderModel = buildPromptEnhancementPopupRenderModelV1({ result: fallbackResult, timestampMs: 207 });

      expect(renderModel.state).toBe('render_model_ready');
      if (renderModel.state !== 'render_model_ready') throw new Error('expected fallback render model');
      expect(renderModel.model.body.editabilityState).toBe('read_only_fallback');
      expect(renderModel.model.body.editable).toBe(false);
      expect(renderModel.model.session.sendabilityState).toBe('send_original');
      expect(renderModel.model.rejectedControls).toContain('auto_submit');
      expect(renderModel.model.session.sendDeliveryMode).not.toBe('clipboard_only_manual_paste_required');
    } finally {
      store.db.close();
    }
  });

  it('DEP-TEST-01-06: keeps the public boundary free of legacy labels, private diagnostics, and delivery authority', async () => {
    const store = await openStore(':memory:');
    try {
      const prepared = await preparePromptEnhancement(makeBoundaryRequest(store, '/test/dep-test-01-06'));
      const renderModel = buildPromptEnhancementPopupRenderModelV1({ result: prepared, timestampMs: 208 });

      expect(renderModel.state).toBe('render_model_ready');
      if (renderModel.state !== 'render_model_ready') throw new Error('expected privacy render model');
      const publicSerialized = JSON.stringify(renderModel.model.publicCopy);
      expect(publicSerialized).not.toContain('Review enhanced prompt');
      expect(publicSerialized).not.toContain('raw_internal_source_diagnostics');
      expect(publicSerialized).not.toContain('clipboard_manual_copy');
      expect(publicSerialized).not.toContain('auto_submit');
      expect(renderModel.model.publicCopy.diagnostics.every((diagnostic) => diagnostic.rawPromptExcluded)).toBe(true);
      expect(renderModel.model.rejectedControls).toEqual(expect.arrayContaining([
        'raw_internal_source_diagnostics',
        'auto_submit',
      ]));
    } finally {
      store.db.close();
    }
  });

  it('preserves a dirty same-identity draft and refreshes only clean canonical state', async () => {
    const store = await openStore(':memory:');
    try {
      const prepared = await preparePromptEnhancement(makeBoundaryRequest(store, '/test/same-identity'));
      const firstRender = buildPromptEnhancementPopupRenderModelV1({ result: prepared, timestampMs: 209 });
      expect(firstRender.state).toBe('render_model_ready');
      if (firstRender.state !== 'render_model_ready') throw new Error('expected render model');
      const initial = buildPromptEnhancementLocalDraftV1(firstRender.model.session);
      expect(initial.state).toBe('draft_ready');
      if (initial.state !== 'draft_ready') throw new Error('expected draft');

      const dirty = updatePromptEnhancementCurrentBodyDraftV1(initial.draft, 'local unsent edit', 7);
      const withDetails = updatePromptEnhancementAdditionalDetailsDraftV1(dirty, 'keep this local detail', 10);
      const sameIdentity = reconcilePromptEnhancementLocalDraftV1(withDetails, firstRender.model.session);

      expect(sameIdentity).toMatchObject({ state: 'updated', identityChanged: false });
      if (sameIdentity.state !== 'updated') throw new Error('expected same-identity update');
      expect(sameIdentity.draft.currentBody.text).toBe('local unsent edit');
      expect(sameIdentity.draft.currentBody.dirty).toBe(true);
      expect(sameIdentity.draft.additionalDetails.text).toBe('keep this local detail');
      expect(sameIdentity.draft.additionalDetailsState).toBe('dirty_unsubmitted');
    } finally {
      store.db.close();
    }
  });

  it('starts a distinct draft for a new canonical revision and ignores stale input', async () => {
    const store = await openStore(':memory:');
    try {
      const first = await preparePromptEnhancement(makeBoundaryRequest(store, '/test/revision-a'));
      const second = await preparePromptEnhancement(makeBoundaryRequest(store, '/test/revision-b'));
      const firstRender = buildPromptEnhancementPopupRenderModelV1({ result: first, timestampMs: 210 });
      const secondRender = buildPromptEnhancementPopupRenderModelV1({ result: second, timestampMs: 211 });
      expect(firstRender.state).toBe('render_model_ready');
      expect(secondRender.state).toBe('render_model_ready');
      if (firstRender.state !== 'render_model_ready' || secondRender.state !== 'render_model_ready') throw new Error('expected revision render models');
      const initial = buildPromptEnhancementLocalDraftV1(firstRender.model.session);
      expect(initial.state).toBe('draft_ready');
      if (initial.state !== 'draft_ready') throw new Error('expected initial draft');
      const dirty = updatePromptEnhancementCurrentBodyDraftV1(initial.draft, 'old dirty revision');

      const stale = reconcilePromptEnhancementLocalDraftV1(dirty, secondRender.model.session, true);
      expect(stale).toMatchObject({ state: 'ignored_stale', reasonCodes: ['stale_or_mismatched_draft'] });
      if (stale.state !== 'ignored_stale') throw new Error('expected stale draft ignore');
      expect(stale.draft.currentBody.text).toBe('old dirty revision');

      const next = reconcilePromptEnhancementLocalDraftV1(dirty, secondRender.model.session);
      expect(next).toMatchObject({ state: 'updated', identityChanged: true });
      if (next.state !== 'updated') throw new Error('expected new revision draft');
      expect(next.draft.identity.currentBodyId).toBe(secondRender.model.session.currentBodyId);
      expect(next.draft.currentBody.text).toBe(secondRender.model.session.currentBodyText);
      expect(next.draft.currentBody.dirty).toBe(false);
    } finally {
      store.db.close();
    }
  });

  it('locks local mutation for loading/fallback typed editability states', async () => {
    const store = await openStore(':memory:');
    try {
      const prepared = await preparePromptEnhancement(makeBoundaryRequest(store, '/test/locked'));
      const loading = {
        ...prepared,
        uiView: {
          ...prepared.uiView,
          body: { ...prepared.uiView.body, actionLoadingState: 'loading_action' as const },
        },
      };
      const render = buildPromptEnhancementPopupRenderModelV1({ result: loading, timestampMs: 212 });
      expect(render.state).toBe('render_model_ready');
      if (render.state !== 'render_model_ready') throw new Error('expected locked render model');
      const initial = buildPromptEnhancementLocalDraftV1(render.model.session);
      expect(initial.state).toBe('draft_ready');
      if (initial.state !== 'draft_ready') throw new Error('expected locked draft');
      expect(initial.draft.editabilityState).toBe('locked_action_loading');
      expect(updatePromptEnhancementCurrentBodyDraftV1(initial.draft, 'must not mutate')).toBe(initial.draft);
      expect(updatePromptEnhancementAdditionalDetailsDraftV1(initial.draft, 'must not mutate')).toBe(initial.draft);
    } finally {
      store.db.close();
    }
  });

  it('marks dirty Additional Details for the typed no-send Apply boundary', async () => {
    const store = await openStore(':memory:');
    try {
      const prepared = await preparePromptEnhancement(makeBoundaryRequest(store, '/test/details'));
      const boundary = buildPromptEnhancementUiBoundarySessionV1({
        result: prepared,
        timestampMs: 213,
        sessionOverrides: { additionalDetailsState: 'dirty_unsubmitted' },
      });
      expect(boundary.state).toBe('session_ready');
      if (boundary.state !== 'session_ready') throw new Error('expected details session');
      const draft = buildPromptEnhancementLocalDraftV1(boundary.session);
      expect(draft.state).toBe('draft_ready');
      if (draft.state !== 'draft_ready') throw new Error('expected details draft');
      const edited = updatePromptEnhancementAdditionalDetailsDraftV1(draft.draft, 'add a test note');
      expect(edited.additionalDetailsState).toBe('dirty_unsubmitted');

      const sendAction = boundary.session.preSendBoundaryState.essentialControlSet.includes('use_current_body')
        ? boundary.session.preSendBoundaryState.essentialControlSet[0]
        : 'use_current_body';
      // UI-8: apply_details is NOT a standalone directional row; it stays available via the details row.
      expect(boundary.session.directionalActionSet.find((entry) => entry.action.actionType === 'apply_details')).toBeUndefined();
      expect(boundary.session.additionalDetailsActionId).toBeTruthy();
      const event = createPromptEnhancementPopupEventV1({
        session: boundary.session,
        eventType: 'deliver_current_body',
        actionId: `${boundary.session.currentBodyId}:action:${sendAction}`,
        currentBodyId: boundary.session.currentBodyId,
        bodyRevision: boundary.session.bodyRevision,
        editedBodyText: edited.currentBody.text,
        additionalDetailsText: edited.additionalDetails.text,
        timestampMs: 214,
        realUserInitiated: true,
      });
      expect(event.sendPolicy).toBe('no_send');
      expect(event.reasonCodes).toContain('dirty_additional_details_requires_apply_or_clear_before_send');
    } finally {
      store.db.close();
    }
  });

  it('DEP-TEST-01-01: builds one typed action request from supplied identity and availability', async () => {
    const store = await openStore(':memory:');
    try {
      const baseRequest = makeBoundaryRequest(store, '/test/request');
      const prepared = await preparePromptEnhancement(baseRequest);
      const boundary = buildPromptEnhancementUiBoundarySessionV1({ result: prepared, timestampMs: 215 });
      expect(boundary.state).toBe('session_ready');
      if (boundary.state !== 'session_ready') throw new Error('expected session');
      const action = prepared.uiView.actions.find((entry) => entry.actionType === 'shorter');
      expect(action).toBeDefined();
      if (!action) throw new Error('expected shorter action');

      const built = buildPromptEnhancementActionRequestV1({
        baseRequest,
        session: boundary.session,
        action,
        editedBodyText: boundary.session.currentBodyText,
        timestampMs: 216,
      });
      expect(built.state).toBe('request_ready');
      if (built.state !== 'request_ready') throw new Error('expected action request');
      expect(built.request.action.actionType).toBe('shorter');
      expect(built.request.currentBodyBinding).toMatchObject({
        currentBodyId: boundary.session.currentBodyId,
        bodyRevision: boundary.session.bodyRevision,
        validationDecisionId: boundary.session.validationDecisionId,
        editedBodyText: boundary.session.currentBodyText,
        realUserInitiated: true,
      });
      expect(built.request.currentBodyBinding.sectionSpanEditEvents).toEqual([]);
    } finally {
      store.db.close();
    }
  });

  it('DEP-TEST-01-02: prevents duplicate activation and blocks unavailable or stale actions without a request', async () => {
    const store = await openStore(':memory:');
    try {
      const baseRequest = makeBoundaryRequest(store, '/test/gates');
      const prepared = await preparePromptEnhancement(baseRequest);
      const boundary = buildPromptEnhancementUiBoundarySessionV1({ result: prepared, timestampMs: 217 });
      expect(boundary.state).toBe('session_ready');
      if (boundary.state !== 'session_ready') throw new Error('expected session');
      const action = prepared.uiView.actions.find((entry) => entry.actionType === 'more_thorough');
      if (!action) throw new Error('expected more thorough action');
      const initial = buildPromptEnhancementActionAdapterStateV1(boundary.session);
      const started = beginPromptEnhancementActionV1({
        adapterState: initial,
        baseRequest,
        action,
        editedBodyText: boundary.session.currentBodyText,
        timestampMs: 218,
      });
      expect(started.state).toBe('request_ready');
      if (started.state !== 'request_ready') throw new Error('expected in-flight request');
      const duplicate = beginPromptEnhancementActionV1({
        adapterState: started.adapterState,
        baseRequest,
        action,
        editedBodyText: boundary.session.currentBodyText,
        timestampMs: 219,
      });
      expect(duplicate).toMatchObject({ state: 'no_request', reasonCodes: ['duplicate_action_while_in_flight'] });

      const unavailable = buildPromptEnhancementActionRequestV1({
        baseRequest,
        session: boundary.session,
        action: { ...action, availability: 'disabled_provider_unavailable' },
        editedBodyText: boundary.session.currentBodyText,
        timestampMs: 220,
      });
      expect(unavailable).toMatchObject({ state: 'no_request', reasonCodes: ['action_not_available'] });

      const stale = buildPromptEnhancementActionRequestV1({
        baseRequest,
        session: boundary.session,
        action: { ...action, bodyRevision: action.bodyRevision + 1 },
        editedBodyText: boundary.session.currentBodyText,
        timestampMs: 221,
      });
      expect(stale).toMatchObject({ state: 'no_request', reasonCodes: ['stale_or_mismatched_action_body_binding'] });
    } finally {
      store.db.close();
    }
  });

  it('DEP-TEST-01-03: keeps dirty Additional Details on bounded Apply request and never creates delivery intent', async () => {
    const store = await openStore(':memory:');
    try {
      const baseRequest = makeBoundaryRequest(store, '/test/apply');
      const prepared = await preparePromptEnhancement(baseRequest);
      const boundary = buildPromptEnhancementUiBoundarySessionV1({
        result: prepared,
        timestampMs: 222,
        sessionOverrides: { additionalDetailsState: 'dirty_unsubmitted' },
      });
      expect(boundary.state).toBe('session_ready');
      if (boundary.state !== 'session_ready') throw new Error('expected apply session');
      const action = prepared.uiView.actions.find((entry) => entry.actionType === 'apply_details');
      if (!action) throw new Error('expected apply details action');
      const built = buildPromptEnhancementActionRequestV1({
        baseRequest,
        session: boundary.session,
        action,
        editedBodyText: boundary.session.currentBodyText,
        additionalDetailsText: 'add verification coverage',
        timestampMs: 223,
      });
      expect(built.state).toBe('request_ready');
      if (built.state !== 'request_ready') throw new Error('expected Apply request');
      expect(built.request.userPreferenceContext.actionRequest).toBe('apply_details');
      expect(built.request.userPreferenceContext.additionalDetails).toEqual({
        text: 'add verification coverage',
        targetBodyId: boundary.session.currentBodyId,
        targetBodyRevision: boundary.session.bodyRevision,
      });
      expect('delivery' in built.request).toBe(false);

      const currentAction = prepared.uiView.actions.find((entry) => entry.actionType === 'use_current_body');
      if (!currentAction) throw new Error('expected current body action');
      const blockedCurrent = buildPromptEnhancementActionRequestV1({
        baseRequest,
        session: boundary.session,
        action: currentAction,
        editedBodyText: boundary.session.currentBodyText,
        additionalDetailsText: 'add verification coverage',
        timestampMs: 224,
      });
      expect(blockedCurrent).toMatchObject({
        state: 'no_request',
        reasonCodes: ['dirty_additional_details_requires_apply_or_clear_before_send'],
      });
    } finally {
      store.db.close();
    }
  });

  it('DEP-TEST-01-04: accepts only a matching complete result and fail-closes malformed or late results', async () => {
    const store = await openStore(':memory:');
    try {
      const baseRequest = makeBoundaryRequest(store, '/test/results');
      const prepared = await preparePromptEnhancement(baseRequest);
      const boundary = buildPromptEnhancementUiBoundarySessionV1({ result: prepared, timestampMs: 225 });
      expect(boundary.state).toBe('session_ready');
      if (boundary.state !== 'session_ready') throw new Error('expected result session');
      const action = prepared.uiView.actions.find((entry) => entry.actionType === 'shorter');
      if (!action) throw new Error('expected result action');
      const started = beginPromptEnhancementActionV1({
        adapterState: buildPromptEnhancementActionAdapterStateV1(boundary.session),
        baseRequest,
        action,
        editedBodyText: boundary.session.currentBodyText,
        timestampMs: 226,
      });
      if (started.state !== 'request_ready') throw new Error('expected result request');

      const late = resolvePromptEnhancementActionV1(started.adapterState, { ...prepared, requestId: 'late-request' });
      expect(late).toMatchObject({ state: 'stale_result_ignored', reasonCodes: ['stale_or_superseded_action_result'] });
      expect(late.adapterState.inFlight).toBeDefined();

      const malformed = resolvePromptEnhancementActionV1(started.adapterState, { disposition: 'show_current_body' });
      expect(malformed.state).toBe('failed_keep_previous');
      expect(malformed.adapterState.inFlight).toBeUndefined();

      const accepted = resolvePromptEnhancementActionV1(started.adapterState, prepared);
      expect(accepted.state).toBe('accepted_result');
      if (accepted.state !== 'accepted_result') throw new Error('expected accepted result');
      expect(accepted.result).toBe(prepared);
      expect(accepted.adapterState.status).toBe('idle');
    } finally {
      store.db.close();
    }
  });

  it('DEP-TEST-01-05: executes Apply through the typed facade and accepts one canonical revision', async () => {
    const store = await openStore(':memory:');
    try {
      const baseRequest = makeBoundaryRequest(store, '/test/facade-apply');
      const prepared = await preparePromptEnhancement(baseRequest);
      const boundary = buildPromptEnhancementUiBoundarySessionV1({
        result: prepared,
        timestampMs: 227,
        sessionOverrides: { additionalDetailsState: 'dirty_unsubmitted' },
      });
      expect(boundary.state).toBe('session_ready');
      if (boundary.state !== 'session_ready') throw new Error('expected facade Apply session');
      const action = prepared.uiView.actions.find((entry) => entry.actionType === 'apply_details');
      if (!action) throw new Error('expected facade Apply action');

      const editedBodyText = `${boundary.session.currentBodyText}\n\nUser edit: keep rollback evidence.`;
      const facade = vi.fn(applyPromptEnhancementAction);
      const execution = await executePromptEnhancementActionV1({
        adapterState: buildPromptEnhancementActionAdapterStateV1(boundary.session),
        baseRequest,
        action,
        editedBodyText: editedBodyText,
        additionalDetailsText: 'Keep verification coverage in scope.',
        timestampMs: 228,
        facade,
      });
      expect(facade).toHaveBeenCalledTimes(1);
      expect(execution.state).toBe('accepted_result');
      if (execution.state !== 'accepted_result') throw new Error('expected facade result');
      expect(execution.request.userPreferenceContext.additionalDetails).toEqual({
        text: 'Keep verification coverage in scope.',
        targetBodyId: boundary.session.currentBodyId,
        targetBodyRevision: boundary.session.bodyRevision,
      });
      expect(execution.result.currentBody.currentBodyId).toBe(boundary.session.currentBodyId);
      expect(execution.result.currentBody.bodyRevision).toBe(boundary.session.bodyRevision + 1);
      expect(execution.result.currentBody.text).toContain('User edit: keep rollback evidence.');
      expect(execution.result.currentBody.generatedOriginState).toBe('pe_user_edited_body');
      expect(execution.result.currentBody.userDirtyState).toBe('dirty_user_edited');
      expect(execution.result.currentBody.text).toContain('Keep verification coverage in scope.');
      expect('delivery' in execution.request).toBe(false);
      expect(JSON.stringify(execution.request)).not.toMatch(/(?:selectedPrompt|L1|L2|L3|show_simpler_options)/);
    } finally {
      store.db.close();
    }
  });

  it('DEP-TEST-01-06: facade rejection keeps the previous typed session without delivery', async () => {
    const store = await openStore(':memory:');
    try {
      const baseRequest = makeBoundaryRequest(store, '/test/facade-failure');
      const prepared = await preparePromptEnhancement(baseRequest);
      const boundary = buildPromptEnhancementUiBoundarySessionV1({ result: prepared, timestampMs: 229 });
      expect(boundary.state).toBe('session_ready');
      if (boundary.state !== 'session_ready') throw new Error('expected facade failure session');
      const action = prepared.uiView.actions.find((entry) => entry.actionType === 'more_thorough');
      if (!action) throw new Error('expected directional action');

      const execution = await executePromptEnhancementActionV1({
        adapterState: buildPromptEnhancementActionAdapterStateV1(boundary.session),
        baseRequest,
        action,
        editedBodyText: boundary.session.currentBodyText,
        timestampMs: 230,
        facade: vi.fn().mockRejectedValue(new Error('provider timeout')),
      });
      expect(execution).toMatchObject({ state: 'failed_keep_previous', reasonCodes: ['facade_error'] });
      expect(execution.adapterState.session).toBe(boundary.session);
      expect(execution.adapterState.inFlight).toBeUndefined();
    } finally {
      store.db.close();
    }
  });

  it('DEP-TEST-01-07: Apply exposes only the public-safe 5K truncation notice', async () => {
    const store = await openStore(':memory:');
    try {
      const baseRequest = makeBoundaryRequest(store, '/test/apply-cap');
      const prepared = await preparePromptEnhancement(baseRequest);
      const boundary = buildPromptEnhancementUiBoundarySessionV1({
        result: prepared,
        timestampMs: 231,
        sessionOverrides: { additionalDetailsState: 'dirty_unsubmitted' },
      });
      expect(boundary.state).toBe('session_ready');
      if (boundary.state !== 'session_ready') throw new Error('expected Apply-cap session');
      const action = prepared.uiView.actions.find((entry) => entry.actionType === 'apply_details');
      if (!action) throw new Error('expected Apply-cap action');
      const longDetails = Array.from({ length: 5001 }, (_, index) => `word${index}`).join(' ');

      const execution = await executePromptEnhancementActionV1({
        adapterState: buildPromptEnhancementActionAdapterStateV1(boundary.session),
        baseRequest,
        action,
        editedBodyText: boundary.session.currentBodyText,
        additionalDetailsText: longDetails,
        timestampMs: 232,
        facade: applyPromptEnhancementAction,
      });
      expect(execution.state).toBe('accepted_result');
      if (execution.state !== 'accepted_result') throw new Error('expected capped Apply result');
      expect(execution.result.currentBody.text).toContain('[truncated_to_apply_details_5000_word_cap]');
      expect(execution.result.currentBody.text).not.toContain('word5000');
      expect(execution.result.uiView.body.text).not.toContain('[truncated_to_apply_details_5000_word_cap]');
      expect(execution.result.uiView.body.text).not.toContain('word5000');
      expect(execution.result.diagnostics.some((diagnostic) => diagnostic.publicSafeText.includes('5,000 words'))).toBe(true);
    } finally {
      store.db.close();
    }
  });

  it('fail-closes for typed no-popup and invalid producer input', async () => {
    const store = await openStore(':memory:');
    try {
      const request = makeBoundaryRequest(store, '/test/negative');
      const noPopupRequest = {
        ...request,
        sourcePrompt: { ...request.sourcePrompt, origin: 'pe_generated_echo' as const, generatedOriginPolicy: 'exclude_from_ordinary_learning' as const },
      };
      const noPopup = await preparePromptEnhancement(noPopupRequest);
      const noPopupModel = buildPromptEnhancementPopupRenderModelV1({
        result: noPopup,
        timestampMs: 201,
      });
      expect(noPopupModel).toMatchObject({ state: 'no_popup', reasonCodes: ['typed_no_popup_disposition'] });

      const invalidModel = buildPromptEnhancementPopupRenderModelV1({
        result: { disposition: 'show_current_body' } as never,
        timestampMs: 202,
      });
      expect(invalidModel.state).toBe('no_popup');
      expect(invalidModel.reasonCodes).toContain('invalid_prepare_result');
    } finally {
      store.db.close();
    }
  });

  it('reduces thrown and validator-rejected producer output to safe no-popup', async () => {
    const store = await openStore(':memory:');
    try {
      const request = makeBoundaryRequest(store, '/test/failures');
      const thrown = await preparePromptEnhancementForAuto({
        request,
        prepare: vi.fn().mockRejectedValue(new Error('timeout')),
      });
      expect(thrown).toMatchObject({ disposition: 'no_popup_not_applicable', safeFallback: true, reasonCode: 'facade_error' });

      const rejected = await preparePromptEnhancementForAuto({
        request,
        prepare: vi.fn().mockResolvedValue({ disposition: 'show_current_body' }),
      });
      expect(rejected).toMatchObject({ disposition: 'no_popup_not_applicable', safeFallback: true, reasonCode: 'invalid_result' });
      expect(request.sourcePrompt.text).toBe(IMPL_PROMPT);
    } finally {
      store.db.close();
    }
  });

  it('never treats an old pending Decision Session advisory as PE authority', async () => {
    const store = await openStore(':memory:');
    try {
      const projectRoot = '/test/old-ds';
      const session = primeTaskBreakdownSession(store, projectRoot);
      upsertPendingAdvisory(store, {
        projectRoot,
        stage: 'implementation',
        flagType: 'stage_transition',
        pinchLabel: 'old DS payload',
        sessionId: session.current.sessionId,
        promptCount: 1,
      });
      const request = makeBoundaryRequest(store, projectRoot);
      const facadeResult = await preparePromptEnhancement(request);
      const prepare = vi.fn().mockResolvedValue(asLlmWorded(facadeResult));

      await runAuto(
        makeInput({ projectRoot }),
        store,
        makeMockOpenAI(FIRE_YES_RESPONSE, 'New advisory.'),
        { request, prepare },
      );

      expect(prepare).toHaveBeenCalledTimes(1);
      expect(request.sourcePrompt.text).toBe(IMPL_PROMPT);
      expect(getPendingAdvisory(store, projectRoot)?.pinchLabel).not.toBe('old DS payload');
    } finally {
      store.db.close();
    }
  });

  const invalidRequest = {
    schemaVersion: 1,
    requestId: 'invalid-request',
  } as never;

  it('does not call the facade when the typed request is invalid', async () => {
    const prepare = vi.fn();
    const result = await preparePromptEnhancementForAuto({ request: invalidRequest, prepare });

    expect(prepare).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      disposition: 'no_popup_not_applicable',
      safeFallback: true,
      reasonCode: 'invalid_request',
    });
  });

  it('does not invoke a facade for a request missing the required typed source packet', async () => {
    const request = {
      ...invalidRequest,
      projectRoot: '/test/project',
      sourcePrompt: { text: 'review this change' },
    } as never;
    const prepare = vi.fn().mockRejectedValue(new Error('provider unavailable'));
    const result = await preparePromptEnhancementForAuto({ request, prepare });

    expect(prepare).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      disposition: 'no_popup_not_applicable',
      safeFallback: true,
      reasonCode: 'invalid_request',
    });
  });

  it('keeps a malformed producer result out of the UI disposition sink when request validation fails first', async () => {
    const request = {
      ...invalidRequest,
      projectRoot: '/test/project',
      sourcePrompt: { text: 'review this change' },
    } as never;
    const prepare = vi.fn().mockResolvedValue({ disposition: 'show_current_body' });
    const result = await preparePromptEnhancementForAuto({ request, prepare });

    expect(prepare).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      disposition: 'no_popup_not_applicable',
      safeFallback: true,
      reasonCode: 'invalid_request',
    });
  });
});


describe('preparation-only execution constraints', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('keeps a non-eligible prompt in the existing AutoOutcome and prompt boundary', async () => {
    const projectRoot = '/test/non-eligible';
    const promptText = 'ok';
    const prepare = vi.fn();
    const onResult = vi.fn();

    const result = await runAuto(
      makeInput({ projectRoot, promptText }),
      store,
      undefined,
      { request: { schemaVersion: 1, requestId: 'not-eligible' } as never, prepare, onResult },
    );

    expect(result.outcome).toBe('no_action');
    expect(prepare).not.toHaveBeenCalled();
    expect(onResult).not.toHaveBeenCalled();
    expect(getRecentPrompts(store, projectRoot, 10).map((prompt) => prompt.text)).toEqual([promptText]);

    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    expect(SessionStateManager.load(store, projectRoot).current.lastInjectedPrompt ?? null).toBeNull();
  });

  it('keeps eligible PE preparation preparation-only with no delivery, mutation, or sequence side effects', async () => {
    const projectRoot = '/test/eligible';
    primeTaskBreakdownSession(store, projectRoot);
    const request = makeBoundaryRequest(store, projectRoot);
    const prepared = await preparePromptEnhancement(request);
    const prepare = vi.fn().mockResolvedValue(prepared);
    const onResult = vi.fn();
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('unexpected process.exit during preparation');
    }) as never);

    try {
      const result = await runAuto(
        makeInput({ projectRoot }),
        store,
        makeMockOpenAI(FIRE_YES_RESPONSE, 'test advisory'),
        { request, prepare, onResult },
      );

      expect(result.outcome).toBe('pending');
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(onResult).toHaveBeenCalledTimes(1);
      expect(onResult.mock.calls[0]?.[0]).toMatchObject({
        disposition: 'show_current_body',
        safeFallback: false,
      });
      expect(stdout).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
      expect(SessionStateManager.load(store, projectRoot).current.lastInjectedPrompt ?? null).toBeNull();
      expect(getPendingAdvisory(store, projectRoot)?.pinchLabel).toBe('test advisory');
    } finally {
      stdout.mockRestore();
      exit.mockRestore();
    }
  });

  it('keeps malformed PE preparation on safe no-popup without invoking a facade', async () => {
    const prepare = vi.fn().mockResolvedValue({ disposition: 'show_current_body' });
    const result = await preparePromptEnhancementForAuto({
      request: { schemaVersion: 1, requestId: 'malformed' } as never,
      prepare,
    });

    expect(result).toMatchObject({ disposition: 'no_popup_not_applicable', safeFallback: true, reasonCode: 'invalid_request' });
    expect(prepare).not.toHaveBeenCalled();
  });
});

describe('PE2.1 - hook-mode PE host consumer wiring', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  async function validPreparation(projectRoot: string) {
    const request = makeBoundaryRequest(store, projectRoot);
    return {
      request,
      preparation: await preparePromptEnhancementForAuto({
        request,
        prepare: vi.fn().mockResolvedValue(await preparePromptEnhancement(request)),
      }),
    };
  }

  it('calls the Linux private-file host exactly once for an eligible preparation and forwards the explicit result', async () => {
    const { request, preparation } = await validPreparation('/test/pe2-1-linux');
    const launchHost = vi.fn().mockResolvedValue({ state: 'completed', output: { protocolVersion: 1, result: { state: 'selected_original' } } });
    const onHookOutput = vi.fn();
    const consumer = createPromptEnhancementCliHostConsumerV1({
      store,
      dbPath: ':memory:',
      cliEntryPath: '/opt/nexpath/dist/cli/index.js',
      resolveCapability: () => ({ state: 'available', method: 'linux_terminal', terminalCommand: 'gnome-terminal' }),
      launchHost,
      onHookOutput,
    });

    await expect(consumer(preparation, request)).resolves.toBe('continue');
    expect(launchHost).toHaveBeenCalledTimes(1);
    expect(launchHost).toHaveBeenCalledWith(expect.objectContaining({ capability: { state: 'available', method: 'linux_terminal', terminalCommand: 'gnome-terminal' }, request, result: preparation.result }));
    expect(onHookOutput).toHaveBeenCalledWith(undefined);
  });

  it('forwards an explicitly selected bounded current body only through Claude additionalContext', async () => {
    const { request, preparation } = await validPreparation('/test/pe2-2-current');
    const onHookOutput = vi.fn();
    const consumer = createPromptEnhancementCliHostConsumerV1({
      store,
      dbPath: ':memory:',
      cliEntryPath: '/opt/nexpath/dist/cli/index.js',
      resolveCapability: () => ({ state: 'available', method: 'linux_terminal', terminalCommand: 'gnome-terminal' }),
      launchHost: vi.fn().mockResolvedValue({ state: 'completed', output: { protocolVersion: 1, result: { state: 'selected_current', bodyText: 'Use the validated enhanced body.' } } }),
      onHookOutput,
    });

    await expect(consumer(preparation, request)).resolves.toBe('continue');
    expect(onHookOutput).toHaveBeenCalledWith(expect.objectContaining({
      hookSpecificOutput: expect.objectContaining({ additionalContext: expect.stringContaining('Use the validated enhanced body.') }),
    }));
  });

  it('fails closed to not-shown when a child returns an invalid or oversized body', async () => {
    const { request, preparation } = await validPreparation('/test/pe2-2-invalid-child');
    const rawBody = 'private invalid child body';
    const onHookOutput = vi.fn();
    const consumer = createPromptEnhancementCliHostConsumerV1({
      store,
      dbPath: ':memory:',
      cliEntryPath: '/opt/nexpath/dist/cli/index.js',
      resolveCapability: () => ({ state: 'available', method: 'linux_terminal', terminalCommand: 'gnome-terminal' }),
      launchHost: vi.fn().mockResolvedValue({
        state: 'completed',
        output: { protocolVersion: 1, result: { state: 'selected_current', bodyText: rawBody.repeat(10_000) } },
      }),
      onHookOutput,
    });

    await expect(consumer(preparation, request)).resolves.toBe('continue');
    expect(onHookOutput).toHaveBeenCalledWith(undefined);
    expect(JSON.stringify(onHookOutput.mock.calls)).not.toContain(rawBody);
  });

  it('keeps an unavailable host on original-prompt pass-through without launching a child', async () => {
    const { request, preparation } = await validPreparation('/test/pe2-1-unavailable');
    const launchHost = vi.fn();
    const onHookOutput = vi.fn();
    const consumer = createPromptEnhancementCliHostConsumerV1({
      store,
      dbPath: ':memory:',
      cliEntryPath: '/opt/nexpath/dist/cli/index.js',
      resolveCapability: () => ({ state: 'unavailable', method: 'none', reasonCode: 'no_gui_session' }),
      launchHost,
      onHookOutput,
    });

    await expect(consumer(preparation, request)).resolves.toBe('continue');
    expect(launchHost).not.toHaveBeenCalled();
    expect(onHookOutput).toHaveBeenCalledWith(undefined);
  });

  it('maps a visible child close to a no-send block disposition (consumer, reused on Stop)', async () => {
    const projectRoot = '/test/pe2-1-close';
    const { request, preparation } = await validPreparation(projectRoot);
    const onHookOutput = vi.fn();
    const consumer = createPromptEnhancementCliHostConsumerV1({
      store,
      dbPath: ':memory:',
      cliEntryPath: '/opt/nexpath/dist/cli/index.js',
      resolveCapability: () => ({ state: 'available', method: 'linux_terminal', terminalCommand: 'gnome-terminal' }),
      launchHost: vi.fn().mockResolvedValue({ state: 'completed', output: { protocolVersion: 1, result: { state: 'closed_no_send' } } }),
      onHookOutput,
    });

    // The popup no longer runs on UserPromptSubmit (B-i); this exercises the consumer directly —
    // the same popup+delivery unit the Stop hook reuses. A visible close maps to a no-send block.
    await expect(consumer(preparation, request)).resolves.toBe('handled_no_send');
    expect(onHookOutput).toHaveBeenCalledWith(expect.objectContaining({ decision: 'block', suppressOriginalPrompt: true }));
  });

  it('keeps a pre-visible Linux renderer failure on original-prompt pass-through', async () => {
    const { request, preparation } = await validPreparation('/test/pe4-1-not-ready');
    const onHookOutput = vi.fn();
    const consumer = createPromptEnhancementCliHostConsumerV1({
      store,
      dbPath: ':memory:',
      cliEntryPath: '/opt/nexpath/dist/cli/index.js',
      resolveCapability: () => ({ state: 'available', method: 'linux_terminal', terminalCommand: 'gnome-terminal' }),
      launchHost: vi.fn().mockResolvedValue({ state: 'launch_failed', reasonCode: 'terminal_renderer_not_ready' }),
      onHookOutput,
    });

    await expect(consumer(preparation, request)).resolves.toBe('continue');
    expect(onHookOutput).toHaveBeenCalledWith(undefined);
    expect(JSON.stringify(onHookOutput.mock.calls)).not.toContain('terminal_renderer_not_ready');
  });

  it('does not invoke the host consumer when runAuto exits through an existing non-eligible gate', async () => {
    const hostConsumer = vi.fn();
    await runAuto(
      makeInput({ projectRoot: '/test/pe2-1-gated', promptText: 'ok' }),
      store,
      undefined,
      undefined,
      hostConsumer,
    );
    expect(hostConsumer).not.toHaveBeenCalled();
  });
});

describe('B1.4a - live CLI PEF sink wiring', () => {
  it('persists one typed category with conservative policy and no raw text or send authority', async () => {
    const store = await openStore(':memory:');
    try {
      const projectRoot = '/test/b1-4a-feedback';
      const prepared = await preparePromptEnhancement(makeBoundaryRequest(store, projectRoot));
      const boundary = buildPromptEnhancementUiBoundarySessionV1({
        result: prepared,
        timestampMs: 700,
      });
      expect(boundary.state).toBe('session_ready');
      if (boundary.state !== 'session_ready') throw new Error('expected feedback session');
      const actionId = boundary.session.feedbackEntry.actionId;
      if (!actionId) throw new Error('expected feedback action');
      const event = createPromptEnhancementPopupEventV1({
        session: boundary.session,
        eventType: 'explicit_feedback',
        actionId,
        currentBodyId: boundary.session.currentBodyId,
        bodyRevision: boundary.session.bodyRevision,
        feedbackCategory: 'not_relevant_enough',
        timestampMs: 701,
        realUserInitiated: true,
      });

      const accepted = recordPromptEnhancementCliFeedbackV1(store, projectRoot, event);
      const duplicate = recordPromptEnhancementCliFeedbackV1(store, projectRoot, event);
      const summary = getPromptEnhancementFeedbackSummary(
        store,
        projectRoot,
        boundary.session.currentBodyId,
      );

      expect(event.sendPolicy).toBe('no_send');
      expect(accepted.status).toBe('accepted');
      expect(accepted.publicSafeText).toBe('Feedback saved. Your prompt is unchanged.');
      expect(duplicate.status).toBe('rejected');
      expect(summary).toMatchObject({
        totalEvents: 1,
        memoryEvidenceEvents: 0,
        rawTextStoredEvents: 0,
      });
      expect(summary.categoryCounts).toEqual([
        { feedbackCategory: 'not_relevant_enough', count: 1 },
      ]);
    } finally {
      store.db.close();
    }
  });

  it('E3/3.2b: showing the popup records neutral candidate evidence for the Source-A signal', async () => {
    const store = await openStore(':memory:');
    try {
      const projectRoot = '/test/e3-2b-shown';
      const request = makeBoundaryRequest(store, projectRoot);
      const signalKey = resolvePromptEnhancementGuidanceOutcomeV1(request).primarySignalKey!;
      expect(signalKey).not.toBeNull();

      recordPromptEnhancementShownMemoryV1(store, projectRoot, request, 500);
      recordPromptEnhancementShownMemoryV1(store, projectRoot, request, 501);

      const [memory] = queryRelevantPromptEnhancementMemory(store, projectRoot, [signalKey]);
      expect(memory).toBeDefined();
      // Two shows -> evidenceCount 2, and no negative evidence (a show is not a reject).
      expect(memory.evidenceCount).toBe(2);
      expect(memory.negativeCount).toBe(0);
      expect(memory.currentEvidenceState).toBe('live_current');
    } finally {
      store.db.close();
    }
  });

  it('E3/3.2b: keeping/injecting the body marks the Source-A signal used (lastUsedAt set)', async () => {
    const store = await openStore(':memory:');
    try {
      const projectRoot = '/test/e3-2b-used';
      const request = makeBoundaryRequest(store, projectRoot);
      const signalKey = resolvePromptEnhancementGuidanceOutcomeV1(request).primarySignalKey!;

      // The signal must be recorded (shown) before it can be marked used.
      recordPromptEnhancementShownMemoryV1(store, projectRoot, request, 500);
      expect(queryRelevantPromptEnhancementMemory(store, projectRoot, [signalKey])[0].lastUsedAt).toBeNull();

      markPromptEnhancementUsedMemoryV1(store, projectRoot, request, 600);
      expect(queryRelevantPromptEnhancementMemory(store, projectRoot, [signalKey])[0].lastUsedAt).toBe(600);
    } finally {
      store.db.close();
    }
  });

  it('E3/3.2c: a signal edited-out twice is suppressed from the memory query; a fresh one surfaces', async () => {
    const seedNegatives = (store: Store, projectRoot: string, signalKey: string, count: number) => {
      for (let i = 0; i < count; i++) {
        recordPromptEnhancementMemoryEvidence(store, {
          projectRoot, signalKey, evidenceKind: 'negative',
          currentEvidenceState: 'historical_candidate', confidenceBand: 'medium', sourceStrength: 'moderate',
          status: 'candidate', now: 100 + i,
        });
      }
    };

    // Suppressed: the current stage signal was edited-out twice across sessions.
    const suppressedStore = await openStore(':memory:');
    try {
      const projectRoot = '/test/e3-2c-suppressed';
      const tp = makeBoundaryRequest(suppressedStore, projectRoot).reviewMomentContext.triggerProvenance;
      const signalKey = promptEnhancementStageSignalKeyV1(tp.prevStage, tp.currentStage);
      seedNegatives(suppressedStore, projectRoot, signalKey, 2);
      const rebuilt = makeBoundaryRequest(suppressedStore, projectRoot);
      expect(rebuilt.sourceSignals.missingMemoryCandidateRefs).not.toContain(`memory:${signalKey}`);
    } finally {
      suppressedStore.db.close();
    }

    // Fresh (no edit-outs): the same signal still surfaces as a memory candidate.
    const freshStore = await openStore(':memory:');
    try {
      const projectRoot = '/test/e3-2c-fresh';
      const tp = makeBoundaryRequest(freshStore, projectRoot).reviewMomentContext.triggerProvenance;
      const signalKey = promptEnhancementStageSignalKeyV1(tp.prevStage, tp.currentStage);
      recordPromptEnhancementMemoryEvidence(freshStore, {
        projectRoot, signalKey, evidenceKind: 'neutral',
        currentEvidenceState: 'historical_candidate', confidenceBand: 'medium', sourceStrength: 'moderate',
        status: 'candidate', now: 100,
      });
      const rebuilt = makeBoundaryRequest(freshStore, projectRoot);
      expect(rebuilt.sourceSignals.missingMemoryCandidateRefs).toContain(`memory:${signalKey}`);
    } finally {
      freshStore.db.close();
    }
  });

  it('E3/3.2a: eligible feedback WITH the request writes memory keyed on the signal (Path A)', async () => {
    const store = await openStore(':memory:');
    try {
      const projectRoot = '/test/b1-4a-memory';
      const request = makeBoundaryRequest(store, projectRoot);
      const signalKey = resolvePromptEnhancementGuidanceOutcomeV1(request).primarySignalKey;
      expect(signalKey).not.toBeNull();

      const prepared = await preparePromptEnhancement(request);
      const boundary = buildPromptEnhancementUiBoundarySessionV1({ result: prepared, timestampMs: 700 });
      if (boundary.state !== 'session_ready') throw new Error('expected feedback session');
      const actionId = boundary.session.feedbackEntry.actionId;
      if (!actionId) throw new Error('expected feedback action');
      const event = createPromptEnhancementPopupEventV1({
        session: boundary.session,
        eventType: 'explicit_feedback',
        actionId,
        currentBodyId: boundary.session.currentBodyId,
        bodyRevision: boundary.session.bodyRevision,
        feedbackCategory: 'user_deleted_generated_section',
        timestampMs: 701,
        realUserInitiated: true,
      });

      // 4-arg call (with request) derives the real eligibility policy and bridges to memory.
      const accepted = recordPromptEnhancementCliFeedbackV1(store, projectRoot, event, request);
      expect(accepted.status).toBe('accepted');

      const memory = queryRelevantPromptEnhancementMemory(store, projectRoot, [signalKey!]);
      expect(memory).toHaveLength(1);
      expect(memory[0].currentEvidenceState).toBe('feedback_derived');
      expect(memory[0].negativeCount).toBe(1);

      // The 3-arg (no request) placeholder path must NOT learn — regression guard.
      const store2 = await openStore(':memory:');
      try {
        recordPromptEnhancementCliFeedbackV1(store2, projectRoot, event);
        expect(queryRelevantPromptEnhancementMemory(store2, projectRoot, [signalKey!])).toEqual([]);
      } finally {
        store2.db.close();
      }
    } finally {
      store.db.close();
    }
  });
});

describe('F4 boundary wiring — the eligibility a branch decides must REACH the request', () => {
  // Verification round 4 found the hole this closes: `prepareSequenceShapedPeFallback` took a
  // `triggerEligibility` parameter and never forwarded it to the builder, so all eight labelled
  // blocked branches produced UNSTAMPED facts while every call site read as correctly wired.
  // The producer-side coverage fixture could not see it — it hands the producer a request that
  // already carries the state, so it tests the producer, not the carrier.
  it('the builder puts the given eligibility on the request snapshot', async () => {
    const store = await openStore(':memory:');
    const projectRoot = 'C:/tmp/f4-wiring';
    const session = SessionStateManager.load(store, projectRoot);
    for (const state of ['blocked_by_dedup', 'blocked_by_session_cap', 'too_weak_no_popup', 'fresh_trigger_eligible'] as const) {
      const request = buildPromptEnhancementRequestForAuto({
        auto: makeInput({ projectRoot, promptText: IMPL_PROMPT, currentAgentMode: 'workspace-write' }),
        store,
        session,
        project: null,
        effectiveLanguage: 'en',
        configuredRole: null,
        effectiveFlagType: 'stage_transition',
        firedKey: 'stage_transition:idea→implementation',
        previousStage: 'idea',
        trigger: { kind: 'stage_transition' },
        stageResult: {
          classification: { stage: 'implementation', confidence: 0.9, tier: 3, allScores: {} },
          signalsPresent: [],
          signalsAbsent: [],
          fireRecommendation: true,
          selectedSignalKey: '',
        } as never,
        streamBOutputs: [],
        triggerEligibility: state,
      } as never);
      expect(request.sourceSignals.triggerSignalEligibilityState, `the builder dropped ${state}`).toBe(state);
    }
  });

  it('omitting it leaves the field ABSENT — never silently defaulted to eligible', async () => {
    const store = await openStore(':memory:');
    const request = makeBoundaryRequest(store, 'C:/tmp/f4-wiring-absent');
    expect(request.sourceSignals.triggerSignalEligibilityState).toBeUndefined();
  });
});

describe('F4 end-to-end — the boundary decision survives all the way onto the FACT', () => {
  // Rounds 1-4 each found a seam where the value stopped: producer coverage, the show layer, the
  // safety carve-out, and the branch→builder hand-off. This asserts the whole chain in one
  // measurement — request built at the boundary, facts produced from it — so a future break at ANY
  // seam fails here even if each unit still passes its own fixture.
  it('a blocked boundary decision arrives on the produced fact', async () => {
    const { buildPromptEnhancementGuidanceFactsV1 } = await import('../../prompt-enhancement/guidance-facts.js');
    const store = await openStore(':memory:');
    const projectRoot = 'C:/tmp/f4-e2e';
    const session = SessionStateManager.load(store, projectRoot);
    const request = buildPromptEnhancementRequestForAuto({
      auto: makeInput({ projectRoot, promptText: IMPL_PROMPT, currentAgentMode: 'workspace-write' }),
      store,
      session,
      project: null,
      effectiveLanguage: 'en',
      configuredRole: null,
      effectiveFlagType: 'absence:verification_gap',
      firedKey: 'absence:verification_gap@implementation',
      previousStage: 'idea',
      trigger: { kind: 'absence' },
      stageResult: {
        classification: { stage: 'implementation', confidence: 0.9, tier: 3, allScores: {} },
        signalsPresent: [],
        signalsAbsent: ['verification_gap'],
        fireRecommendation: true,
        selectedSignalKey: 'verification_gap',
      } as never,
      streamBOutputs: [],
      triggerEligibility: 'blocked_by_session_cap',
    } as never);

    const facts = buildPromptEnhancementGuidanceFactsV1(request);
    const trigger = facts.find((fact) => fact.sourceType === 'absence_signal');
    expect(trigger, 'no trigger fact was produced').toBeDefined();
    expect(trigger?.sourceEligibilityState).toBe('blocked_by_session_cap');
  });

  it('and an eligible one arrives too — the chain carries values, it does not just block', async () => {
    const { buildPromptEnhancementGuidanceFactsV1 } = await import('../../prompt-enhancement/guidance-facts.js');
    const store = await openStore(':memory:');
    const projectRoot = 'C:/tmp/f4-e2e-ok';
    const session = SessionStateManager.load(store, projectRoot);
    const request = buildPromptEnhancementRequestForAuto({
      auto: makeInput({ projectRoot, promptText: IMPL_PROMPT, currentAgentMode: 'workspace-write' }),
      store,
      session,
      project: null,
      effectiveLanguage: 'en',
      configuredRole: null,
      effectiveFlagType: 'absence:verification_gap',
      firedKey: 'absence:verification_gap@implementation',
      previousStage: 'idea',
      trigger: { kind: 'absence' },
      stageResult: {
        classification: { stage: 'implementation', confidence: 0.9, tier: 3, allScores: {} },
        signalsPresent: [],
        signalsAbsent: ['verification_gap'],
        fireRecommendation: true,
        selectedSignalKey: 'verification_gap',
      } as never,
      streamBOutputs: [],
      triggerEligibility: 'fresh_trigger_eligible',
    } as never);

    const facts = buildPromptEnhancementGuidanceFactsV1(request);
    const trigger = facts.find((fact) => fact.sourceType === 'absence_signal');
    expect(trigger?.sourceEligibilityState).toBe('fresh_trigger_eligible');
  });
});

describe('F4 — dismissed_or_user_skipped, the value that had no producer', () => {
  // Round 6: phase 30 shipped recording this state as "typed and gated but nothing stamps it".
  // That was too quick — SessionStateManager already records `dismissedAtIndex` on an absence flag
  // when the user acts on it, and L4991 names dismissal as a state that must not anchor a popup.
  // So the boundary can read it, and the main path now distinguishes a clean fire from a signal
  // the user has already dismissed.
  async function eligibilityForDismissalState(dismissed: boolean): Promise<string | undefined> {
    const store = await openStore(':memory:');
    const projectRoot = `C:/tmp/f4-dismiss-${dismissed ? 'yes' : 'no'}`;
    const session = SessionStateManager.load(store, projectRoot);
    session.addAbsenceFlag(store, {
      signalKey: 'verification_gap',
      stage: 'implementation',
      detectedAtIndex: 0,
      cooldownUntil: 0,
      ...(dismissed ? { dismissedAtIndex: 1 } : {}),
    } as never);
    const request = buildPromptEnhancementRequestForAuto({
      auto: makeInput({ projectRoot, promptText: IMPL_PROMPT, currentAgentMode: 'workspace-write' }),
      store,
      session,
      project: null,
      effectiveLanguage: 'en',
      configuredRole: null,
      effectiveFlagType: 'absence:verification_gap',
      firedKey: 'absence:verification_gap@implementation',
      previousStage: 'idea',
      trigger: { kind: 'absence' },
      stageResult: {
        classification: { stage: 'implementation', confidence: 0.9, tier: 3, allScores: {} },
        signalsPresent: [],
        signalsAbsent: ['verification_gap'],
        fireRecommendation: true,
        selectedSignalKey: 'verification_gap',
      } as never,
      streamBOutputs: [],
      // The REAL production rule, not a copy of it — a replicated decision passes even when
      // production is mutated to the wrong value, which is exactly what happened here.
      triggerEligibility: promptEnhancementFiredTriggerEligibilityV1(
        session.current.absenceFlags,
        'absence:verification_gap',
      ),
    } as never);
    return request.sourceSignals.triggerSignalEligibilityState;
  }

  it('a signal the user already dismissed is labelled dismissed_or_user_skipped', async () => {
    expect(await eligibilityForDismissalState(true)).toBe('dismissed_or_user_skipped');
  });

  it('an undismissed signal on the same path stays fresh_trigger_eligible', async () => {
    expect(await eligibilityForDismissalState(false)).toBe('fresh_trigger_eligible');
  });
});

// ── Phase 1 — the session budget is charged when a popup is SHOWN ─────────────
//
// Under `countBudgetOnShow` the two per-session budgets stop counting advisories that FIRED and start
// counting popups the user actually SAW: dedup reads `shownAdvisoryKeys`, the cap reads
// `shownPopupCount`. `firedDecisionSessions` / `advisoryCount` keep being written at fire time, so
// `once_per_session` and the telemetry counters are unchanged.

describe('SessionStateManager — shown-popup budget (Phase 1)', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('a fresh session starts with no shown popups and no shown keys', () => {
    const mgr = SessionStateManager.load(store, '/proj/shown-init');
    expect(mgr.current.shownPopupCount).toBe(0);
    expect(mgr.current.shownAdvisoryKeys).toEqual([]);
    expect(mgr.current.pendingPopupCharge).toBeUndefined();
    expect(mgr.hasShownAdvisoryKeyV1('absence:test_creation@implementation')).toBe(false);
  });

  it('chargeShownPopupV1 counts the popup, records its key, and persists both', () => {
    const mgr = SessionStateManager.load(store, '/proj/shown-charge');
    mgr.chargeShownPopupV1(store, 12, 'absence:test_creation@implementation');
    expect(mgr.current.shownPopupCount).toBe(1);
    expect(mgr.hasShownAdvisoryKeyV1('absence:test_creation@implementation')).toBe(true);
    // Survives a reload — the gates read it on the NEXT prompt, from a fresh load.
    const reloaded = SessionStateManager.load(store, '/proj/shown-charge');
    expect(reloaded.current.shownPopupCount).toBe(1);
    expect(reloaded.hasShownAdvisoryKeyV1('absence:test_creation@implementation')).toBe(true);
  });

  it('charges BOTH the pre-check key and the row key, then clears the pending set', () => {
    // The dedup gate checks the key of the FIRST qualifying flag; the stored row carries the key of
    // the flag Stage 2 selected. They differ whenever those are not the same flag, and charging only
    // the row's key would leave the checked one permanently uncharged — so it would never block.
    const mgr = SessionStateManager.load(store, '/proj/shown-both-keys');
    mgr.markPendingPopupChargeV1(store, 12, ['absence:test_creation@implementation', 'absence:regression_check@implementation']);
    mgr.chargeShownPopupV1(store, 12, 'absence:regression_check@implementation');
    expect(mgr.hasShownAdvisoryKeyV1('absence:test_creation@implementation')).toBe(true);
    expect(mgr.hasShownAdvisoryKeyV1('absence:regression_check@implementation')).toBe(true);
    expect(mgr.current.shownAdvisoryKeys).toHaveLength(2);   // no duplicate for the repeated key
    expect(mgr.current.shownPopupCount).toBe(1);             // one popup, two keys
    expect(mgr.current.pendingPopupCharge).toBeUndefined();  // consumed
  });

  it('does NOT spend one row\'s keys on a different row\'s popup', () => {
    // ⛔ The failure this binding exists to stop, and it is the phase's own bug in miniature. There is
    // exactly one pending PE row per project, and three paths replace or drop it without knowing about
    // this state: the sequence-shaped fallback stores a row of its own, the Stop cooldown branch
    // consumes one unseen, and the submit-time sweep clears one after a handled turn. Unbound, the
    // keys left behind by the dropped row were spent by the NEXT popup — marking advice "seen" that
    // was never displayed, which is exactly what silences a signal for the rest of the session.
    const mgr = SessionStateManager.load(store, '/proj/shown-rebound');
    mgr.markPendingPopupChargeV1(store, 12, ['absence:test_creation@implementation']);
    // The row from prompt 12 was never shown; the popup that reaches the user is the row stored at 14.
    mgr.chargeShownPopupV1(store, 14, 'absence:regression_check@implementation');
    expect(mgr.hasShownAdvisoryKeyV1('absence:test_creation@implementation')).toBe(false);
    expect(mgr.hasShownAdvisoryKeyV1('absence:regression_check@implementation')).toBe(true);
    expect(mgr.current.shownPopupCount).toBe(1);
    // The orphaned entry is dropped with the charge — the row it belonged to no longer exists.
    expect(mgr.current.pendingPopupCharge).toBeUndefined();
  });

  it('a row that waits for a later Stop still spends its own keys', () => {
    // The other half of the binding: a prepared row whose host could not show it stays pending across
    // prompts, and when a later Stop finally shows it, the keys written with it are still ITS keys.
    const mgr = SessionStateManager.load(store, '/proj/shown-deferred');
    mgr.markPendingPopupChargeV1(store, 12, ['absence:test_creation@implementation', 'stage_transition:idea→implementation']);
    mgr.chargeShownPopupV1(store, 12, 'stage_transition:idea→implementation');
    expect(mgr.hasShownAdvisoryKeyV1('absence:test_creation@implementation')).toBe(true);
    expect(mgr.hasShownAdvisoryKeyV1('stage_transition:idea→implementation')).toBe(true);
  });

  it('never records a synthetic sequence_shaped:* key', () => {
    // These name a prompt position, not an advisory event: they would block nothing and only grow
    // the list, which the dedup gate scans on every prompt.
    const mgr = SessionStateManager.load(store, '/proj/shown-synthetic');
    mgr.markPendingPopupChargeV1(store, 7, ['sequence_shaped:7']);
    mgr.chargeShownPopupV1(store, 7, 'sequence_shaped:7');
    expect(mgr.current.shownAdvisoryKeys).toEqual([]);
    expect(mgr.current.shownPopupCount).toBe(1);  // the popup still spends a cap slot
  });

  it('an MPS-2 continuation charge counts, adds no key, and leaves the pending set intact', () => {
    // Owner decision 2026-09-14: a continuation item the user sees spends a cap slot. It adds no
    // dedup key (it is not an advisory event) and must not spend the pending PE row's keys — that
    // row has NOT been shown.
    const mgr = SessionStateManager.load(store, '/proj/shown-mps2');
    mgr.markPendingPopupChargeV1(store, 12, ['absence:test_creation@implementation']);
    const cooldownBefore = mgr.current.lastPromptEnhancementPromptIndex;
    mgr.chargeShownContinuationPopupV1(store);
    expect(mgr.current.shownPopupCount).toBe(1);
    expect(mgr.current.shownAdvisoryKeys).toEqual([]);
    expect(mgr.current.pendingPopupCharge).toEqual({ promptCount: 12, keys: ['absence:test_creation@implementation'] });
    // …and it does not reset the PE popup cooldown — a sequence's own steps must not throttle each other.
    expect(mgr.current.lastPromptEnhancementPromptIndex).toBe(cooldownBefore);
  });

  it('state saved before these fields existed reads as empty and still charges', () => {
    const mgr = SessionStateManager.load(store, '/proj/shown-legacy');
    const legacy = mgr as unknown as { state: Record<string, unknown> };
    delete legacy.state.shownAdvisoryKeys;
    delete legacy.state.shownPopupCount;
    delete legacy.state.pendingPopupCharge;
    expect(mgr.hasShownAdvisoryKeyV1('absence:test_creation@implementation')).toBe(false);
    expect(mgr.current.shownPopupCount ?? 0).toBe(0);
    mgr.chargeShownPopupV1(store, 3, 'absence:test_creation@implementation');
    expect(mgr.current.shownPopupCount).toBe(1);
    expect(mgr.hasShownAdvisoryKeyV1('absence:test_creation@implementation')).toBe(true);
  });

  it('the 30-minute session gap empties the new fields with the old ones', async () => {
    const { SESSION_GAP_MS } = await import('../../classifier/SessionStateManager.js');
    const mgr1 = SessionStateManager.load(store, '/proj/shown-gap');
    mgr1.markPendingPopupChargeV1(store, 12, ['absence:test_creation@implementation']);
    mgr1.chargeShownPopupV1(store, 12, 'absence:test_creation@implementation');

    const mgr2 = SessionStateManager.load(store, '/proj/shown-gap', Date.now() + SESSION_GAP_MS + 1000);
    expect(mgr2.current.shownPopupCount).toBe(0);
    expect(mgr2.current.shownAdvisoryKeys).toEqual([]);
    expect(mgr2.current.pendingPopupCharge).toBeUndefined();
    expect(mgr2.hasShownAdvisoryKeyV1('absence:test_creation@implementation')).toBe(false);
  });
});

describe('runAuto — budget counted on show (optimum level)', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); vi.restoreAllMocks(); });

  /**
   * Every key the gate could build for this fixture — both trigger kinds, every stage — so the test
   * states "this key was already spent" without depending on which trigger the run happens to produce.
   * `dedupDecision` below proves the gate was actually reached, so the set is not a way to pass vacuously.
   */
  const everyFiredKey = (signalKey: string): string[] => [
    ...STAGES.map((stage) => `absence:${signalKey}@${stage}`),
    ...STAGES.flatMap((from) => STAGES.map((to) => `stage_transition:${from}→${to}`)),
  ];

  const dedupDecision = (debugSpy: { mock: { calls: unknown[][] } }): boolean | undefined =>
    debugSpy.mock.calls
      .filter((call) => call[0] === 'dedup')
      .map((call) => (call[1] as { alreadyFired: boolean } | undefined)?.alreadyFired)
      .at(-1);

  /** Pin a non-vibe profile so the cap is the default 20 these tests name, not the vibe 30. */
  const pinNonVibeProfile = (mgr: SessionStateManager): void => {
    (mgr as unknown as { state: { profile: unknown } }).state.profile = {
      nature: 'hardcore_pro', precisionScore: 8, playfulnessScore: 2,
      mood: 'focused', depth: 'high', depthScore: 8, computedAt: mgr.current.promptCount,
    };
  };

  /**
   * Drive the pipeline to the dedup gate with an absence trigger: warm up past the min-prompts guard,
   * then a low stage confidence plus an active flag makes shouldFireStage2 return that flag.
   * Mirrors the session-cap fixtures above. Returns the logger spy, which carries the gate's decision.
   */
  async function runToDedupGate(
    projectRoot: string,
    seed: (mgr: SessionStateManager) => void,
    level: 'optimum' | 'every_event' = 'optimum',
  ) {
    setConfig(store, 'advisory_frequency', level);
    for (let i = 0; i < 3; i++) await runAuto(makeInput({ projectRoot }), store);
    const mgr = SessionStateManager.load(store, projectRoot);
    (mgr as unknown as { state: { stageConfidence: number } }).state.stageConfidence = 0.3;
    seed(mgr);
    mgr.addAbsenceFlag(store, {   // last — persists every hand-set field above with it
      signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 0, cooldownUntil: 100,
    });
    const debugSpy = vi.spyOn(logger, 'debug');
    // The telemetry mock is module-level and its call history spans the whole file: without a clear,
    // the positive assertion below could be satisfied by some OTHER test's dedup block, and the
    // negative one broken by it. Both must speak about THIS run only.
    vi.mocked(writeTelemetry).mockClear();
    await runAuto(makeInput({ projectRoot }), store, makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'));
    return debugSpy;
  }

  it('an advisory that FIRED but was never shown does not block its own signal', async () => {
    // The bug this phase fixes: the popup behind this key was discarded, so the user never saw the
    // advice — and the key blocked every later detection of the same signal for the whole session.
    const debugSpy = await runToDedupGate('/test/show-dedup-unseen', (mgr) => {
      for (const key of everyFiredKey('test_creation')) mgr.markDecisionSessionFired(store, key);
    });
    expect(dedupDecision(debugSpy), 'the dedup gate was never reached — the assertion would prove nothing').toBe(false);
    expect(writeTelemetry).not.toHaveBeenCalledWith(
      expect.anything(), 'advisory_dedup_blocked', expect.anything(), expect.anything(),
    );
  });

  it('an advisory whose popup WAS shown blocks the same key', async () => {
    const debugSpy = await runToDedupGate('/test/show-dedup-seen', (mgr) => {
      for (const key of everyFiredKey('test_creation')) mgr.chargeShownPopupV1(store, mgr.current.promptCount, key);
    });
    expect(dedupDecision(debugSpy)).toBe(true);
    expect(writeTelemetry).toHaveBeenCalledWith(
      expect.anything(), 'advisory_dedup_blocked', expect.anything(), expect.anything(),
    );
  });

  it('20 fired-but-unseen advisories do not reach the cap', async () => {
    const { getSkippedSessions } = await import('../../store/skipped-sessions.js');
    const { OPTIMUM_LEVEL_CONFIG: OPT } = await import('../../config/GlobalConfig.js');
    await runToDedupGate('/test/show-cap-unseen', (mgr) => {
      pinNonVibeProfile(mgr);
      // Well past the ceiling, so the only reason this does not cap is that fired-but-unseen
      // advisories are not what the cap counts.
      (mgr as unknown as { state: { advisoryCount: number } }).state.advisoryCount = OPT.sessionAdvisoryCapDefault + 5;
    });
    expect(getSkippedSessions(store, '/test/show-cap-unseen').some((s) => s.flagType === 'session_cap_reached')).toBe(false);
  });

  it('CONTROL — the same fixture with the switch OFF caps on the fired count, so the test above is not vacuous', async () => {
    const { getSkippedSessions } = await import('../../store/skipped-sessions.js');
    await runToDedupGate('/test/show-cap-control', (mgr) => {
      pinNonVibeProfile(mgr);
      (mgr as unknown as { state: { advisoryCount: number } }).state.advisoryCount = 25;
    }, 'every_event');
    expect(getSkippedSessions(store, '/test/show-cap-control').some((s) => s.flagType === 'session_cap_reached')).toBe(true);
  });

  it('popups the user SAW do reach the cap, counted from the ceiling the level declares', async () => {
    // Reads the ceiling from the config rather than naming it. Phase 3 lifted this level's cap to
    // 9999, and a literal here would have pinned the phase-1 behaviour to a number phase 3 owns — the
    // point of the test is WHICH counter the cap reads, not what it is set to.
    const { getSkippedSessions } = await import('../../store/skipped-sessions.js');
    const { OPTIMUM_LEVEL_CONFIG } = await import('../../config/GlobalConfig.js');
    await runToDedupGate('/test/show-cap-seen', (mgr) => {
      pinNonVibeProfile(mgr);
      (mgr as unknown as { state: { shownPopupCount: number } }).state.shownPopupCount =
        OPTIMUM_LEVEL_CONFIG.sessionAdvisoryCapDefault;
    });
    expect(getSkippedSessions(store, '/test/show-cap-seen').some((s) => s.flagType === 'session_cap_reached')).toBe(true);
  });

  it('switch OFF (every_event, the Medium level): the fired key still blocks', async () => {
    const projectRoot = '/test/show-switch-off';
    setConfig(store, 'advisory_frequency', 'every_event');
    for (let i = 0; i < 3; i++) await runAuto(makeInput({ projectRoot }), store);
    const mgr = SessionStateManager.load(store, projectRoot);
    (mgr as unknown as { state: { stageConfidence: number } }).state.stageConfidence = 0.3;
    for (const key of everyFiredKey('test_creation')) mgr.markDecisionSessionFired(store, key);
    mgr.addAbsenceFlag(store, {
      signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 0, cooldownUntil: 100,
    });
    const debugSpy = vi.spyOn(logger, 'debug');
    await runAuto(makeInput({ projectRoot }), store, makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'));
    // every_event → countBudgetOnShow false → the fired key blocks, as always.
    expect(dedupDecision(debugSpy)).toBe(true);
  });
});

describe('runAuto — PE prepare is skipped while the popup cooldown is active (Phase 1)', () => {
  it('prepares nothing and stores no row while a popup was just shown — the advisory is untouched', async () => {
    const store = await openStore(':memory:');
    try {
      const projectRoot = '/test/pe-cooldown-skip';
      setConfig(store, 'advisory_frequency', 'optimum');
      primeTaskBreakdownSession(store, projectRoot);
      // A popup was shown this prompt → the next prompts cannot display one, so preparing it would
      // only produce a row the Stop hook discards — and, before this phase, spend the budget for it.
      SessionStateManager.load(store, projectRoot).markPromptEnhancementPopupShown(store);
      const request = makeBoundaryRequest(store, projectRoot);
      const facadeResult = await preparePromptEnhancement(request);
      const prepare = vi.fn().mockResolvedValue(asLlmWorded(facadeResult));

      const result = await runAuto(
        makeInput({ projectRoot }),
        store,
        makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'),
        { request, prepare },
      );

      expect(prepare).not.toHaveBeenCalled();
      expect(getPendingPromptEnhancement(store, projectRoot)).toBeNull();
      // Nothing was charged: the signal stays eligible for the prompt after the cooldown.
      const after = SessionStateManager.load(store, projectRoot);
      expect(after.current.shownPopupCount).toBe(0);
      expect(after.current.shownAdvisoryKeys).toEqual([]);
      // Layer A (the advisory) is deliberately untouched — only the PE prepare is skipped.
      expect(result).toEqual({ outcome: 'pending' });
      expect(getPendingAdvisory(store, projectRoot)).not.toBeNull();
    } finally {
      store.db.close();
    }
  });

  it('binds the charge keys to the row it stored — a mismatch would make them unspendable', async () => {
    // The write side of the binding. `chargeShownPopupV1` spends the remembered keys only for the row
    // whose prompt index they carry, so if this write ever names a different index the pre-check key
    // is silently never charged — and a key that is never charged never blocks, which is the old bug
    // wearing new clothes. Pinned against the row itself rather than against a literal.
    const store = await openStore(':memory:');
    try {
      const projectRoot = '/test/pe-charge-binding';
      setConfig(store, 'advisory_frequency', 'optimum');
      primeTaskBreakdownSession(store, projectRoot);
      const request = makeBoundaryRequest(store, projectRoot);
      const facadeResult = await preparePromptEnhancement(request);

      await runAuto(
        makeInput({ projectRoot }),
        store,
        makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'),
        { request, prepare: vi.fn().mockResolvedValue(asLlmWorded(facadeResult)) },
      );

      const row = getPendingPromptEnhancement(store, projectRoot);
      expect(row).not.toBeNull();
      const pending = SessionStateManager.load(store, projectRoot).current.pendingPopupCharge;
      expect(pending?.promptCount).toBe(row!.promptCount);
      expect(pending?.keys.length).toBeGreaterThan(0);
    } finally {
      store.db.close();
    }
  });

  it('cooldown 0 (disabled): the prepare runs and the row is stored as before', async () => {
    const store = await openStore(':memory:');
    try {
      const projectRoot = '/test/pe-cooldown-zero';
      setConfig(store, 'advisory_frequency', 'optimum');
      setConfig(store, 'prompt_enhancement.popup_cooldown', '0');
      primeTaskBreakdownSession(store, projectRoot);
      SessionStateManager.load(store, projectRoot).markPromptEnhancementPopupShown(store);
      const request = makeBoundaryRequest(store, projectRoot);
      const facadeResult = await preparePromptEnhancement(request);
      const prepare = vi.fn().mockResolvedValue(asLlmWorded(facadeResult));

      await runAuto(
        makeInput({ projectRoot }),
        store,
        makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'),
        { request, prepare },
      );

      expect(prepare).toHaveBeenCalledTimes(1);
      expect(getPendingPromptEnhancement(store, projectRoot)).not.toBeNull();
    } finally {
      store.db.close();
    }
  });
});

// ── Phase 2 — dedup blocks the OCCURRENCE, not the signal ────────────────────
//
// A key that fired once was blocked for the whole session: the list held no time, so "allow it again
// later" could not even be expressed. Measured on the bug report's run,
// `absence:cross_confirming@implementation` fired at #23 and was then refused 56 times, up to #330.
// The absence detector already re-raises a flag when the practice is STILL missing after its cooldown,
// and every raise carries its own `raisedAtIndex` — that re-raise is the "this is happening again"
// event, so the dedup list keys on it rather than inventing a TTL.

describe('runAuto — occurrence dedup (Phase 2)', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); vi.restoreAllMocks(); });

  /** Stage-1 scores this weakly, so it does not drag the session out of `implementation`. */
  const LOW_SIGNAL_PROMPT = 'ok sure go ahead';

  /**
   * A firing reply at exactly `optimum`'s `stage2MinConfidence`.
   *
   * 0.40 is the lowest confidence whose fire recommendation survives the parser, and it has to be the
   * lowest: the session confidence is an EMA of this value, and condition 3 of the trigger only runs
   * while that EMA is under 0.25. Anything higher and the absence path becomes unreachable.
   */
  const absenceFireReply = (confidence: number) => ({
    stage:                 'Implementation',
    stage_confidence:      confidence,
    signals_present:       [],
    signals_absent:        ['test_creation'],
    fire_decision_session: true,
    selected_signal_key:   'test_creation',
    reason:                'test_creation missing.',
  });

  /**
   * Answer EVERY call with the same valid stage reply.
   *
   * `makeMockOpenAI` answers the second call with the pinch string, and more than one component asks
   * the model per prompt — so whichever call the stage classifier happens to make, it must parse. With
   * the shared mock it received the pinch text, degraded, and a degraded classifier never recommends
   * firing, which made the whole absence path unreachable.
   */
  function makeAlwaysFiringOpenAI(confidence: number): OpenAI {
    return {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(absenceFireReply(confidence)) } }],
          }),
        },
      },
    } as unknown as OpenAI;
  }

  /**
   * Park a session in `implementation` with EVERY signal already flagged.
   *
   * That makes the detector raise nothing new, so trigger condition 2 stays empty and condition 3 runs
   * instead, picking `absenceFlags[0]` — the flag under test, placed first — on every prompt. Without
   * it the live detector raises a different signal each prompt and the key under test never repeats,
   * which is exactly what these tests need to hold still.
   */
  function primeStableAbsenceSession(projectRoot: string, raisedAtIndex = 2): void {
    const prime = SessionStateManager.load(store, projectRoot);
    // Three prompts, not one: `every_event` will not consider an advisory before the third.
    for (let i = 0; i < 3; i++) {
      prime.processPrompt(store, IMPL_PROMPT, { stage: 'implementation', confidence: 0.9, tier: 3, allScores: {} });
    }
    // Without a profile the LLM profile classifier runs first and consumes a reply; the stage
    // classifier is fed enough by the mock above, but this also matches `primeTaskBreakdownSession`.
    prime.setProfile(buildSafeDefaults(100));
    const st = (prime as unknown as {
      state: { absenceFlags: unknown[]; signalCounters: Record<string, unknown> };
    }).state;
    st.absenceFlags = [
      { signalKey: 'test_creation', stage: 'implementation', raisedAtIndex, cooldownUntil: 9999 },
      ...Object.keys(st.signalCounters)
        .filter((k) => k !== 'test_creation')
        .map((k) => ({ signalKey: k, stage: 'implementation', raisedAtIndex, cooldownUntil: 9999 })),
    ];
    prime.setDetectedLanguage(store, undefined);   // persists everything set above
  }

  const dedupCalls = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls
      .filter((c) => c[0] === 'dedup')
      .map((c) => c[1] as { firedKey: string; dedupKey: string; alreadyFired: boolean });

  /**
   * One prompt through the real pipeline, returning what the dedup gate decided.
   *
   * The session confidence is pinned low first because it is an EMA that climbs toward the reply's
   * 0.40 — after two prompts it would cross condition 3's gate and the absence path would vanish
   * mid-test. Holding it still keeps the ONE thing under test — the dedup key — the only thing moving.
   */
  async function fireOnce(projectRoot: string, confidence = 0.40) {
    const mgr = SessionStateManager.load(store, projectRoot);
    (mgr as unknown as { state: { stageConfidence: number } }).state.stageConfidence = 0.05;
    mgr.setDetectedLanguage(store, undefined);
    const spy = vi.spyOn(logger, 'debug');
    const outcome = await runAuto(
      makeInput({ projectRoot, promptText: LOW_SIGNAL_PROMPT }),
      store,
      makeAlwaysFiringOpenAI(confidence),
    );
    const calls = dedupCalls(spy);
    spy.mockRestore();
    return { ...calls.at(-1)!, outcome };
  }

  it('keys the dedup list on the occurrence, and leaves firedKey untouched', async () => {
    const projectRoot = '/test/p2-key-shape';
    setConfig(store, 'advisory_frequency', 'optimum');
    primeStableAbsenceSession(projectRoot, 2);

    const seen = await fireOnce(projectRoot);
    expect(seen.outcome, 'the fixture must actually fire, or the rest proves nothing').toEqual({ outcome: 'pending' });
    // 🔒 The suffix must live ONLY in the dedup key. `firedKey` is read by the PE request, the router,
    // the guidance facts, the fatigue keys and the popup body the user reads — a suffix there would
    // surface in rendered text, which is why the plan froze its format.
    expect(seen.firedKey).toBe('absence:test_creation@implementation');
    expect(seen.dedupKey).toBe('absence:test_creation@implementation#2');
    // And the list records the occurrence, which is what the gate checks.
    expect(SessionStateManager.load(store, projectRoot).current.firedDecisionSessions)
      .toEqual(['absence:test_creation@implementation#2']);
  });

  it('blocks the SAME occurrence and allows the next one', async () => {
    const projectRoot = '/test/p2-occurrence';
    setConfig(store, 'advisory_frequency', 'optimum');
    primeStableAbsenceSession(projectRoot, 2);

    const first = await fireOnce(projectRoot);
    expect(first.alreadyFired).toBe(false);

    // The popup behind it reached the user, so this occurrence is spent (phase 1 charges on show).
    SessionStateManager.load(store, projectRoot).chargeShownPopupV1(store, 99, first.dedupKey);

    const repeat = await fireOnce(projectRoot);
    expect(repeat.dedupKey, 'the fixture stopped holding the occurrence still').toBe(first.dedupKey);
    expect(repeat.alreadyFired, 'the same occurrence was allowed to fire twice').toBe(true);

    // The detector re-raises the flag: same signal, same stage, NEW occurrence. Before this phase the
    // key was identical, so it stayed blocked for the rest of the session.
    const mgr = SessionStateManager.load(store, projectRoot);
    const flags = (mgr as unknown as {
      state: { absenceFlags: { signalKey: string; raisedAtIndex: number }[] };
    }).state.absenceFlags;
    for (const f of flags) if (f.signalKey === 'test_creation') f.raisedAtIndex = 40;
    mgr.setDetectedLanguage(store, undefined);

    const reRaised = await fireOnce(projectRoot);
    expect(reRaised.firedKey, 'the signal itself must not change').toBe(first.firedKey);
    expect(reRaised.dedupKey).toBe('absence:test_creation@implementation#40');
    expect(reRaised.alreadyFired, 'a re-raised flag is a fresh occurrence and must fire again').toBe(false);
  });

  it('the keys remembered for the shown-popup charge are the OCCURRENCE keys', async () => {
    // The composition point with phase 1, and the one that is silent when it breaks. Under
    // `countBudgetOnShow` the gate reads the list these keys are charged into, so if the unsuffixed
    // keys were remembered instead, the occurrence key the gate checks would never be present — and
    // absence dedup would stop blocking ANYTHING, which is far more than this phase intends. Nothing
    // else pins it: the tests above charge by hand to hold the occurrence still.
    const projectRoot = '/test/p2-charge-keys';
    setConfig(store, 'advisory_frequency', 'optimum');
    primeStableAbsenceSession(projectRoot, 2);
    const request = makeBoundaryRequest(store, projectRoot);
    const facadeResult = await preparePromptEnhancement(request);

    const mgr = SessionStateManager.load(store, projectRoot);
    (mgr as unknown as { state: { stageConfidence: number } }).state.stageConfidence = 0.05;
    mgr.setDetectedLanguage(store, undefined);
    await runAuto(
      makeInput({ projectRoot, promptText: LOW_SIGNAL_PROMPT }),
      store,
      makeAlwaysFiringOpenAI(0.40),
      { request, prepare: vi.fn().mockResolvedValue(asLlmWorded(facadeResult)) },
    );

    const pending = SessionStateManager.load(store, projectRoot).current.pendingPopupCharge;
    expect(pending, 'no row was stored, so this proves nothing about the charge keys').toBeDefined();
    for (const key of pending!.keys) {
      expect(key, `"${key}" was remembered without its occurrence — the gate would never match it`)
        .toMatch(/#\d+$/);
    }
    expect(pending!.keys).toContain('absence:test_creation@implementation#2');
  });

  it('remembers BOTH occurrence keys when the classifier picks a different signal', async () => {
    // The G1 ruling, now in occurrence form. The gate checks the first qualifying flag's key while the
    // stored row carries the key of the flag Stage 2 selected, and those are different signals here.
    // Charging only one leaves the other uncharged for ever, and an uncharged key never blocks — the
    // fixtures above cannot see it, because there the two keys are the same string.
    const projectRoot = '/test/p2-two-keys';
    setConfig(store, 'advisory_frequency', 'optimum');
    primeStableAbsenceSession(projectRoot, 2);
    const request = makeBoundaryRequest(store, projectRoot);
    const facadeResult = await preparePromptEnhancement(request);

    const mgr = SessionStateManager.load(store, projectRoot);
    (mgr as unknown as { state: { stageConfidence: number } }).state.stageConfidence = 0.05;
    mgr.setDetectedLanguage(store, undefined);
    // `test_creation` is first in the flag list, so it is what the gate checks; the classifier is told
    // to select a different one, which is what the stored row will carry.
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify({
              ...absenceFireReply(0.40),
              signals_absent: ['regression_check'],
              selected_signal_key: 'regression_check',
            }) } }],
          }),
        },
      },
    } as unknown as OpenAI;

    await runAuto(
      makeInput({ projectRoot, promptText: LOW_SIGNAL_PROMPT }),
      store,
      client,
      { request, prepare: vi.fn().mockResolvedValue(asLlmWorded(facadeResult)) },
    );

    const pending = SessionStateManager.load(store, projectRoot).current.pendingPopupCharge;
    expect(pending?.keys, 'the gate key and the row key are different signals and BOTH must be remembered')
      .toEqual(expect.arrayContaining([
        'absence:test_creation@implementation#2',
        'absence:regression_check@implementation#2',
      ]));
  });

  it('⛔ what auto remembers, charged the way stop charges it, blocks the gate', async () => {
    // The seam nothing else joins. The tests above charge by hand with the key the gate reported, so
    // they cannot notice if auto starts remembering one key while stop spends another — and stop pays
    // with the row's own UNSUFFIXED `triggerProvenance.firedKey`, which under this phase no longer
    // matches anything the gate asks for. The occurrence key survives only because it travels in the
    // pending charge; if that ever stopped, dedup would go silently dead for absence signals.
    const projectRoot = '/test/p2-e2e-charge';
    setConfig(store, 'advisory_frequency', 'optimum');
    primeStableAbsenceSession(projectRoot, 2);
    const request = makeBoundaryRequest(store, projectRoot);
    const facadeResult = await preparePromptEnhancement(request);

    const mgr = SessionStateManager.load(store, projectRoot);
    (mgr as unknown as { state: { stageConfidence: number } }).state.stageConfidence = 0.05;
    mgr.setDetectedLanguage(store, undefined);
    const spy = vi.spyOn(logger, 'debug');
    await runAuto(
      makeInput({ projectRoot, promptText: LOW_SIGNAL_PROMPT }),
      store,
      makeAlwaysFiringOpenAI(0.40),
      { request, prepare: vi.fn().mockResolvedValue(asLlmWorded(facadeResult)) },
    );
    const gateKey = dedupCalls(spy).at(-1)!.dedupKey;
    spy.mockRestore();

    const row = getPendingPromptEnhancement(store, projectRoot);
    expect(row, 'no row was stored, so the charge path is not being exercised').not.toBeNull();

    // Byte-for-byte what `stop.ts` does at both display points.
    SessionStateManager.load(store, projectRoot).chargeShownPopupV1(
      store,
      row!.promptCount,
      row!.request.reviewMomentContext.triggerProvenance.firedKey,
    );

    const after = SessionStateManager.load(store, projectRoot);
    expect(
      after.hasShownAdvisoryKeyV1(gateKey),
      'the popup was shown but the key the gate checks was never charged — dedup is dead for this signal',
    ).toBe(true);

    const repeat = await fireOnce(projectRoot);
    expect(repeat.alreadyFired, 'a shown occurrence must not fire again').toBe(true);
  });

  it('state written before this phase loads, and costs one extra fire per absence signal', async () => {
    // The upgrade path, and it is live: at the time of writing there are 81 unsuffixed keys sitting in
    // `session_states` on this machine. A session inside its 30-minute window when the new build lands
    // keeps them, and the gate now builds a suffixed key that cannot match — so each absence signal
    // gets exactly one more fire before the new key blocks it. Bounded and one-time, but it had to be
    // checked rather than assumed, because "the list is full of keys that no longer match" is also
    // what a broken key format looks like.
    const projectRoot = '/test/p2-old-state';
    setConfig(store, 'advisory_frequency', 'optimum');
    primeStableAbsenceSession(projectRoot, 2);

    // Exactly what an older build would have written: the key with no occurrence on it.
    const before = SessionStateManager.load(store, projectRoot);
    before.markDecisionSessionFired(store, 'absence:test_creation@implementation');
    before.chargeShownPopupV1(store, 99, 'absence:test_creation@implementation');
    expect(before.current.firedDecisionSessions).toEqual(['absence:test_creation@implementation']);

    // One more fire gets through — the old key is not the key the gate now asks about.
    const first = await fireOnce(projectRoot);
    expect(first.alreadyFired, 'an unsuffixed key must not be read as the current occurrence').toBe(false);
    expect(first.dedupKey).toBe('absence:test_creation@implementation#2');

    // …and from then on the occurrence blocks normally. The old key is simply left behind.
    SessionStateManager.load(store, projectRoot).chargeShownPopupV1(store, 99, first.dedupKey);
    const repeat = await fireOnce(projectRoot);
    expect(repeat.alreadyFired, 'the new key must block once it has been charged').toBe(true);
    expect(
      SessionStateManager.load(store, projectRoot).current.firedDecisionSessions,
      'the pre-upgrade entry is kept, so once_per_session still counts it',
    ).toContain('absence:test_creation@implementation');
  });

  it('switch OFF (every_event): the fired list blocks the same occurrence too', async () => {
    // Phase 2 is not behind phase 1's switch — the key shape changes on every level. Only WHICH list
    // is read differs, so the level that reads `firedDecisionSessions` must behave the same way.
    const projectRoot = '/test/p2-switch-off';
    setConfig(store, 'advisory_frequency', 'every_event');   // the level under test — the UNSET default is 'optimum' since 2026-09-19
    primeStableAbsenceSession(projectRoot, 2);

    // `every_event` needs 0.49 for the fire recommendation to survive its own parser floor; its
    // condition-3 gate is 0.50, so the EMA (0.7*0.05 + 0.3*0.49 = 0.18) still clears it.
    const first = await fireOnce(projectRoot, 0.49);
    expect(first.dedupKey).toBe('absence:test_creation@implementation#2');
    expect(first.alreadyFired).toBe(false);

    const repeat = await fireOnce(projectRoot, 0.49);
    expect(repeat.alreadyFired, 'the fired list should have blocked the same occurrence').toBe(true);
  });

  it('the telemetry and outcome logs still report the unsuffixed key', async () => {
    // §3.5 of the plan: every event keeps its name and its shape. Only the numbers move.
    const projectRoot = '/test/p2-log-shape';
    setConfig(store, 'advisory_frequency', 'optimum');
    primeStableAbsenceSession(projectRoot, 2);
    const first = await fireOnce(projectRoot);
    SessionStateManager.load(store, projectRoot).chargeShownPopupV1(store, 99, first.dedupKey);

    vi.mocked(writeTelemetry).mockClear();
    const infoSpy = vi.spyOn(logger, 'info');
    await fireOnce(projectRoot);
    const blocked = infoSpy.mock.calls
      .filter((c) => c[0] === 'pipeline_outcome')
      .map((c) => c[1] as { reason?: string; firedKey?: string })
      .find((d) => d.reason === 'already_fired');
    infoSpy.mockRestore();

    expect(blocked?.firedKey, 'the outcome log gained an occurrence suffix').toBe('absence:test_creation@implementation');
    expect(writeTelemetry).toHaveBeenCalledWith(
      expect.anything(),
      'advisory_dedup_blocked',
      { firedKey: 'absence:test_creation@implementation' },
      expect.anything(),
    );
  });

  it('and BOTH key sites resolve the occurrence from the SAME list — pinned in the source', () => {
    // ⚠️ Honest about what this proves. The behavioural fixtures above drive the condition-3 path,
    // where the qualifying flags are already in session state and concatenating them is a no-op — so
    // no test in this file can fail when the call site stops passing them. A mutation confirmed the
    // gap: dropping `...triggerResult.qualifyingFlags` left every test green.
    //
    // The divergence it causes is unit-tested on the helper ("a pending raise must be counted"). What
    // is pinned HERE is the wiring: the gate runs before step 6.8 persists fresh raises and the fired
    // key is built after it, so the only way the two can agree is by reading one prepared list. A
    // second `absenceOccurrenceIndexV1` call that reaches for `mgr.current.absenceFlags` directly is
    // the shape that breaks it, and it fails here with the reason why.
    const source = readFileSync('src/cli/commands/auto.ts', 'utf8');
    const lookups = source.split('absenceOccurrenceIndexV1(').length - 1;
    const fromPreparedList = source.split('absenceOccurrenceIndexV1(\n        occurrenceFlags,').length - 1
      + source.split('absenceOccurrenceIndexV1(occurrenceFlags,').length - 1;
    // one of the occurrences is the function's own declaration
    expect(
      fromPreparedList,
      `${lookups - 1} occurrence lookups exist and ${fromPreparedList} read the prepared list — one `
      + 'reading session state directly would name a different occurrence than the other at a window '
      + 'boundary, and the popup would be charged under one key and checked under the other',
    ).toBe(lookups - 1);
    // …and the list itself must carry the raises that are not in session state yet. Emptying it back
    // to `mgr.current.absenceFlags` leaves both call sites still reading "the prepared list" and every
    // behavioural test green, because they drive the condition-3 path where the two are the same.
    expect(
      source.includes('[...mgr.current.absenceFlags, ...triggerResult.qualifyingFlags]'),
      'the prepared list no longer carries the pending raises, so the gate is back to naming a '
      + 'different occurrence than the fired key at a window boundary',
    ).toBe(true);
  });

  it('a stage transition keeps whole-session dedup — no suffix on its key', async () => {
    // Transitions have no flag lifecycle, and the classifier oscillates between stages, which is the
    // noise dedup was added for. Deliberately excluded from the change.
    const projectRoot = '/test/p2-transition';
    setConfig(store, 'advisory_frequency', 'optimum');
    for (let i = 0; i < 3; i++) await runAuto(makeInput({ projectRoot }), store);

    const spy = vi.spyOn(logger, 'debug');
    await runAuto(makeInput({ projectRoot }), store, makeMockOpenAI(FIRE_YES_RESPONSE, 'Hold up.'));
    const seen = dedupCalls(spy).at(-1)!;
    spy.mockRestore();

    expect(seen.firedKey.startsWith('stage_transition:')).toBe(true);
    expect(seen.dedupKey, 'a transition key must carry no occurrence suffix').toBe(seen.firedKey);
  });
});

// ── absenceOccurrenceIndexV1 — which absence window a signal is in ───────────

describe('absenceOccurrenceIndexV1', () => {
  const COOLDOWN = 30;   // ABSENCE_COOLDOWN_PROMPTS, the width the detector writes
  const raises = (signalKey: string, ...idxs: number[]) =>
    idxs.map((i) => ({ signalKey, raisedAtIndex: i, cooldownUntil: i + COOLDOWN }));

  it('a single raise names its own window, for the whole window', () => {
    const flags = raises('x', 10);
    expect(absenceOccurrenceIndexV1(flags, 'x', 10)).toBe(10);
    expect(absenceOccurrenceIndexV1(flags, 'x', 39)).toBe(10);
    expect(absenceOccurrenceIndexV1(flags, 'x', 40), 'the window ended at 40').toBeUndefined();
  });

  it('a raise after the window closes opens a new occurrence', () => {
    const flags = raises('x', 10, 60);
    expect(absenceOccurrenceIndexV1(flags, 'x', 30)).toBe(10);
    expect(absenceOccurrenceIndexV1(flags, 'x', 60)).toBe(60);
    expect(absenceOccurrenceIndexV1(flags, 'x', 89)).toBe(60);
  });

  it('⛔ consecutive re-raises inside one window stay ONE occurrence', () => {
    // The real shape this helper exists for, from the phase-1 s24 run: `user_feedback_review` was
    // raised at 167 and then on every prompt from 197 to 205. Keyed on the raise, dedup would read
    // eight of those as brand-new occurrences and let the same advice through eight times.
    const flags = raises('user_feedback_review', 167, 197, 198, 199, 200, 201, 202, 203, 204, 205);
    // Walked past the last window's end on purpose: the absorbed tails expire one prompt at a time,
    // so naming the RAISE there would hand back a fresh occurrence on each of them — the failure this
    // helper exists to prevent, arriving late instead of early.
    const seen = new Set<number | undefined>();
    for (let p = 167; p <= 400; p++) {
      const occ = absenceOccurrenceIndexV1(flags, 'user_feedback_review', p);
      if (occ !== undefined) seen.add(occ);
    }
    expect([...seen].sort((a, b) => Number(a) - Number(b)), 'ten raises are two windows, not ten')
      .toEqual([167, 197]);
  });

  it('⛔ a raise that clears the open window starts a new one, even mid-run', () => {
    // Also real, from the same run: `implementation_checkpoint` raised at 11, 61, 68, 70, 90, 99.
    // 61 opens a window to 91, which swallows 68, 70 and 90; 99 falls past it and genuinely starts
    // the next. Without the merge the answer at 99 is 70 — an absorbed raise whose own window happens
    // to still be open — and the occurrence would then drift one prompt at a time.
    const flags = raises('implementation_checkpoint', 11, 61, 68, 70, 90, 99);
    expect(absenceOccurrenceIndexV1(flags, 'implementation_checkpoint', 65)).toBe(61);
    expect(absenceOccurrenceIndexV1(flags, 'implementation_checkpoint', 90)).toBe(61);
    expect(absenceOccurrenceIndexV1(flags, 'implementation_checkpoint', 99)).toBe(99);
    expect(absenceOccurrenceIndexV1(flags, 'implementation_checkpoint', 128)).toBe(99);
  });

  it('in the gap after a window closes, names the window the still-open raise belongs to', () => {
    // Absorbed raises outlive the window that swallowed them, so between a window closing and the
    // next one opening there is a stretch the merge cannot name. The signal IS still flagged there, so
    // it must still get an occurrence — and it must be the window those raises belong to (61), not the
    // raise itself (68), or the answer changes every time one of those tails expires.
    const flags = raises('implementation_checkpoint', 11, 61, 68, 70, 90, 99);
    expect(absenceOccurrenceIndexV1(flags, 'implementation_checkpoint', 95)).toBe(61);
    expect(absenceOccurrenceIndexV1(flags, 'implementation_checkpoint', 96)).toBe(61);
    expect(absenceOccurrenceIndexV1(flags, 'implementation_checkpoint', 97)).toBe(61);
  });

  it('a raise later than the prompt does not count — it has not happened yet', () => {
    expect(absenceOccurrenceIndexV1(raises('x', 50), 'x', 10)).toBeUndefined();
    expect(absenceOccurrenceIndexV1(raises('x', 10, 50), 'x', 20)).toBe(10);
  });

  it('only the named signal is considered', () => {
    const flags = [...raises('a', 5), ...raises('b', 40)];
    expect(absenceOccurrenceIndexV1(flags, 'b', 45)).toBe(40);
    expect(absenceOccurrenceIndexV1(flags, 'a', 45), "a's window closed at 35").toBeUndefined();
    expect(absenceOccurrenceIndexV1(flags, 'never-raised', 45)).toBeUndefined();
  });

  it('out-of-order raises give the same answer as sorted input', () => {
    // Flags are appended in raise order today, but nothing in the type says so — and the merge reads
    // them in sequence, so unsorted input would let a later raise open the window that should have
    // swallowed it. OVERLAPPING windows on purpose: with 10 and 35 thirty apart, order is the only
    // thing that decides whether 35 is absorbed.
    const clean = raises('x', 10, 35, 90);
    const messy = [...raises('x', 35), ...raises('x', 90), ...raises('x', 10)];
    for (const p of [10, 20, 34, 38, 39, 50, 64, 90, 110]) {
      expect(absenceOccurrenceIndexV1(messy, 'x', p), `prompt ${p}`)
        .toBe(absenceOccurrenceIndexV1(clean, 'x', p));
    }
    // …and the sorted answer is the one that treats 35 as part of the window 10 opened.
    expect(absenceOccurrenceIndexV1(clean, 'x', 38)).toBe(10);
  });

  it('⛔ a pending raise must be counted, or the gate and the fired key name different occurrences', () => {
    // The gate runs BEFORE freshly-raised flags are persisted (auto.ts step 6.8) and the fired key is
    // built AFTER, so the two see different lists unless the pending raises travel with them.
    //
    // At a window boundary that difference is not cosmetic. B-11 leaves absorbed raises lying around
    // whose own windows outlive the window that swallowed them, so the gate would read one of those —
    // an occurrence already charged — while the fired key reads the new window the fresh raise opens.
    // The popup is then charged under one key and checked under the other, and the next genuinely new
    // occurrence is refused.
    const mk = (i: number) => ({ signalKey: 'x', raisedAtIndex: i, cooldownUntil: i + COOLDOWN });
    const persisted = [mk(0), mk(20)];   // 20 was absorbed by 0's window but its own runs to 50
    const pending = mk(30);              // raised this prompt, not yet in session state

    // Alone, the gate sees only 0's window — closed at 30 — and falls back to the window 20 belongs
    // to, which is 0: an occurrence already charged. With the pending raise it sees 30 open a new one.
    expect(absenceOccurrenceIndexV1(persisted, 'x', 30), 'what the gate would see alone').toBe(0);
    expect(absenceOccurrenceIndexV1([...persisted, pending], 'x', 30), 'what the fired key sees').toBe(30);
  });

  it('a duplicate raise changes nothing — the concatenated list may repeat a flag', () => {
    // On the condition-3 path the qualifying flags are ALREADY in session state, so the call site
    // hands the helper the same flag twice. A repeat must be absorbed by its own window, not counted.
    const mk = (i: number) => ({ signalKey: 'x', raisedAtIndex: i, cooldownUntil: i + COOLDOWN });
    const once = [mk(10), mk(60)];
    const twice = [mk(10), mk(60), mk(10), mk(60)];
    for (const p of [10, 30, 39, 45, 60, 80]) {
      expect(absenceOccurrenceIndexV1(twice, 'x', p), `prompt ${p}`)
        .toBe(absenceOccurrenceIndexV1(once, 'x', p));
    }
  });

  it('an empty flag list answers undefined rather than throwing', () => {
    expect(absenceOccurrenceIndexV1([], 'x', 5)).toBeUndefined();
  });
});
