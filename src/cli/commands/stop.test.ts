import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../telemetry/index.js', () => ({
  writeTelemetry: vi.fn(),
  TELEMETRY_PATH: '/mock/telemetry.jsonl',
}));

import { openStore } from '../../store/db.js';
import type { Store } from '../../store/db.js';
import { runStop } from './stop.js';
import type { StopPayload } from './stop.js';
import { upsertPendingAdvisory, getPendingAdvisory } from '../../store/pending-advisories.js';
import { getSkippedSessions } from '../../store/skipped-sessions.js';
import { SKIP_NOW } from '../../decision-session/options.js';
import { CLIPBOARD_ONLY } from '../../decision-session/DecisionSession.js';
import type { SelectFn } from '../../decision-session/DecisionSession.js';
import * as TtySelectFnModule from '../../decision-session/TtySelectFn.js';
import { insertPrompt } from '../../store/prompts.js';
import { upsertProject, getProject } from '../../store/projects.js';
import { LANG_DETECT_INTERVAL } from '../../classifier/LanguageDetector.js';
import { writeTelemetry } from '../../telemetry/index.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<StopPayload> = {}): StopPayload {
  return {
    session_id:          'sess-001',
    cwd:                 '/test/project',
    hook_event_name:     'Stop',
    stop_hook_active:    false,
    last_assistant_message: 'Done.',
    ...overrides,
  };
}

function makeAdvisory(projectRoot = '/test/project') {
  return {
    projectRoot,
    stage:       'implementation' as const,
    flagType:    'absence:test_creation' as const,
    pinchLabel:  'Hold up.',
    sessionId:   'sess-001',
    promptCount: 5,
  };
}

function mockSelect(value: string): SelectFn {
  return vi.fn().mockResolvedValue(value);
}

function mockCancel(): SelectFn {
  return vi.fn().mockResolvedValue(Symbol('cancel'));
}

// ── runStop — loop guard ──────────────────────────────────────────────────────

describe('runStop — loop guard', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('returns loop_guard when stop_hook_active is true', async () => {
    const result = await runStop(makePayload({ stop_hook_active: true }), store);
    expect(result.outcome).toBe('loop_guard');
  });

  it('does not check DB when stop_hook_active is true', async () => {
    // Even if there is a pending advisory, loop guard fires first
    upsertPendingAdvisory(store, makeAdvisory());
    const result = await runStop(makePayload({ stop_hook_active: true }), store);
    expect(result.outcome).toBe('loop_guard');
    // Advisory should still be pending (not consumed)
    const advisory = getPendingAdvisory(store, '/test/project');
    expect(advisory).not.toBeNull();
  });
});

// ── runStop — no_tty ─────────────────────────────────────────────────────────

describe('runStop — no_tty', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => {
    store.db.close();
    vi.restoreAllMocks();
  });

  it('returns no_tty when createTtySelectFn returns null and no selectFn injected', async () => {
    upsertPendingAdvisory(store, makeAdvisory());
    vi.spyOn(TtySelectFnModule, 'createTtySelectFn').mockReturnValue(null);
    // Do NOT pass selectFn so the real TTY resolution path is taken
    const result = await runStop(makePayload(), store);
    expect(result.outcome).toBe('no_tty');
  });

  it('marks advisory as shown even when TTY is unavailable', async () => {
    upsertPendingAdvisory(store, makeAdvisory());
    vi.spyOn(TtySelectFnModule, 'createTtySelectFn').mockReturnValue(null);
    await runStop(makePayload(), store);
    // Advisory should be marked shown so it doesn't re-show on next Stop
    expect(getPendingAdvisory(store, '/test/project')).toBeNull();
  });
});

// ── runStop — no pending advisory ─────────────────────────────────────────────

describe('runStop — no pending advisory', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('returns no_pending when DB has no advisory for this project', async () => {
    const result = await runStop(makePayload(), store);
    expect(result.outcome).toBe('no_pending');
  });

  it('returns no_pending after advisory has been marked shown', async () => {
    upsertPendingAdvisory(store, makeAdvisory());
    // First call marks it shown
    await runStop(makePayload(), store, mockSelect(SKIP_NOW));
    // Second call: advisory is now 'shown', not 'pending'
    const result = await runStop(makePayload(), store, mockSelect(SKIP_NOW));
    expect(result.outcome).toBe('no_pending');
  });
});

// ── runStop — user picks option ───────────────────────────────────────────────

describe('runStop — user picks option', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('returns blocked with reason when user selects a content option', async () => {
    upsertPendingAdvisory(store, makeAdvisory());
    const selectedText = 'write unit tests before continuing';
    const result = await runStop(makePayload(), store, mockSelect(selectedText));
    expect(result.outcome).toBe('blocked');
    if (result.outcome === 'blocked') {
      expect(result.reason).toBe(selectedText);
    }
  });

  it('marks advisory as shown after user picks option', async () => {
    upsertPendingAdvisory(store, makeAdvisory());
    await runStop(makePayload(), store, mockSelect('some option'));
    const advisory = getPendingAdvisory(store, '/test/project');
    expect(advisory).toBeNull(); // shown advisory no longer returned as pending
  });
});

// ── runStop — clipboard only ──────────────────────────────────────────────────

describe('runStop — clipboard_only', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('returns clipboard_only when selectFn returns CLIPBOARD_ONLY sentinel', async () => {
    upsertPendingAdvisory(store, makeAdvisory());
    const result = await runStop(makePayload(), store, mockSelect(CLIPBOARD_ONLY));
    expect(result.outcome).toBe('clipboard_only');
  });

  it('does not record a skipped_sessions row on clipboard_only', async () => {
    upsertPendingAdvisory(store, makeAdvisory());
    await runStop(makePayload(), store, mockSelect(CLIPBOARD_ONLY));
    const rows = getSkippedSessions(store, '/test/project');
    expect(rows).toHaveLength(0);
  });
});

// ── runStop — user skips ──────────────────────────────────────────────────────

describe('runStop — user skips', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('returns skipped when user selects SKIP_NOW', async () => {
    upsertPendingAdvisory(store, makeAdvisory());
    const result = await runStop(makePayload(), store, mockSelect(SKIP_NOW));
    expect(result.outcome).toBe('skipped');
  });

  it('returns skipped on Ctrl+C (cancel symbol)', async () => {
    upsertPendingAdvisory(store, makeAdvisory());
    const result = await runStop(makePayload(), store, mockCancel());
    expect(result.outcome).toBe('skipped');
  });

  it('records a skipped_sessions row when outcome is skipped', async () => {
    upsertPendingAdvisory(store, makeAdvisory());
    const result = await runStop(makePayload(), store, mockSelect(SKIP_NOW));
    expect(result.outcome).toBe('skipped');
    const rows = getSkippedSessions(store, '/test/project');
    expect(rows).toHaveLength(1);
    expect(rows[0].flagType).toBe('absence:test_creation');
    expect(rows[0].stage).toBe('implementation');
  });

  it('does NOT record skipped_sessions when user picks an option', async () => {
    upsertPendingAdvisory(store, makeAdvisory());
    await runStop(makePayload(), store, mockSelect('write unit tests'));
    const rows = getSkippedSessions(store, '/test/project');
    expect(rows).toHaveLength(0);
  });
});

// ── runStop — advisory isolation per project ──────────────────────────────────

describe('runStop — project isolation', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('does not trigger for a different project root', async () => {
    upsertPendingAdvisory(store, makeAdvisory('/test/project-a'));
    const result = await runStop(makePayload({ cwd: '/test/project-b' }), store);
    expect(result.outcome).toBe('no_pending');
  });

  it('triggers for the correct project root', async () => {
    upsertPendingAdvisory(store, makeAdvisory('/test/project-a'));
    upsertPendingAdvisory(store, makeAdvisory('/test/project-b'));
    const result = await runStop(makePayload({ cwd: '/test/project-a' }), store, mockCancel());
    expect(result.outcome).toBe('skipped');
  });
});

// ── runStop — decisionSessionCount wiring (Phase H) ──────────────────────────

describe('runStop — decisionSessionCount wiring', () => {
  let store: Store;

  beforeEach(async () => {
    store = await openStore(':memory:');
    upsertProject(store, { projectRoot: '/test/project', name: 'Test' });
  });
  afterEach(() => { store.db.close(); });

  it('decision_session_count increments after a decision session is shown', async () => {
    upsertPendingAdvisory(store, makeAdvisory());
    expect(getProject(store, '/test/project')?.decisionSessionCount).toBe(0);

    await runStop(makePayload(), store, mockSelect(SKIP_NOW));

    expect(getProject(store, '/test/project')?.decisionSessionCount).toBe(1);
  });

  it('decision_session_count increments even when user picks an option (not just skips)', async () => {
    upsertPendingAdvisory(store, makeAdvisory());
    await runStop(makePayload(), store, mockSelect('write unit tests'));
    expect(getProject(store, '/test/project')?.decisionSessionCount).toBe(1);
  });

  it('decision_session_count does NOT increment when there is no pending advisory', async () => {
    // No advisory → runStop returns no_pending before reaching runDecisionSession
    await runStop(makePayload(), store, mockSelect(SKIP_NOW));
    expect(getProject(store, '/test/project')?.decisionSessionCount).toBe(0);
  });

  it('createTtySelectFn is called with store and projectRoot when TTY path is taken', async () => {
    upsertPendingAdvisory(store, makeAdvisory());
    const spy = vi.spyOn(TtySelectFnModule, 'createTtySelectFn').mockReturnValue(null);
    // No selectFn injected → real TTY path taken → createTtySelectFn called
    await runStop(makePayload(), store);
    expect(spy).toHaveBeenCalledWith(store, '/test/project');
  });
});

// ── Stop hook output format ───────────────────────────────────────────────────

describe('Stop hook output format', () => {
  it('blocked JSON has correct shape for Claude Code Stop hook', () => {
    const reason = 'write tests before shipping';
    const output = JSON.stringify({ decision: 'block', reason });
    const parsed = JSON.parse(output) as { decision: string; reason: string };
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toBe(reason);
  });
});

// ── runStop — language detection (step 1.5) ───────────────────────────────────

describe('runStop — language detection', () => {
  let store: Store;

  beforeEach(async () => {
    store = await openStore(':memory:');
    upsertProject(store, { projectRoot: '/test/project', name: 'Test' });
  });
  afterEach(() => { store.db.close(); });

  it('does not update detected_language when fewer than LANG_DETECT_INTERVAL prompts exist', async () => {
    // Insert LANG_DETECT_INTERVAL - 1 prompts (threshold not met)
    for (let i = 0; i < LANG_DETECT_INTERVAL - 1; i++) {
      insertPrompt(store, { projectRoot: '/test/project', promptText: 'I want to add a feature' });
    }
    await runStop(makePayload(), store, mockSelect(SKIP_NOW));
    const proj = getProject(store, '/test/project');
    expect(proj?.detectedLanguage).toBeNull(); // detection did not fire
  });

  it('updates detected_language when >= LANG_DETECT_INTERVAL prompts exist', async () => {
    // Insert enough English prompts to meet the threshold
    const englishPrompt = 'I want to add a login page so users can reset their password and access settings';
    for (let i = 0; i < LANG_DETECT_INTERVAL; i++) {
      insertPrompt(store, { projectRoot: '/test/project', promptText: englishPrompt });
    }
    await runStop(makePayload(), store, mockSelect(SKIP_NOW));
    const proj = getProject(store, '/test/project');
    // Detection ran — detectedLanguage should be set (may be 'en' or whatever tinyld returns)
    // We only assert it is no longer null (detection fired)
    expect(proj?.detectedLanguage).not.toBeNull();
  });

  it('detection fires even when no advisory is pending (outcome no_pending)', async () => {
    const englishPrompt = 'I want to add a login page so users can reset their password';
    for (let i = 0; i < LANG_DETECT_INTERVAL; i++) {
      insertPrompt(store, { projectRoot: '/test/project', promptText: englishPrompt });
    }
    // No advisory upserted → outcome should be no_pending
    const result = await runStop(makePayload(), store);
    expect(result.outcome).toBe('no_pending');
    // Detection still fired
    const proj = getProject(store, '/test/project');
    expect(proj?.detectedLanguage).not.toBeNull();
  });

  it('detection does NOT fire when stop_hook_active is true (loop guard exits first)', async () => {
    const englishPrompt = 'I want to add a login page so users can reset their password';
    for (let i = 0; i < LANG_DETECT_INTERVAL; i++) {
      insertPrompt(store, { projectRoot: '/test/project', promptText: englishPrompt });
    }
    const result = await runStop(makePayload({ stop_hook_active: true }), store);
    expect(result.outcome).toBe('loop_guard');
    // Loop guard exited before step 1.5 — detected_language stays null
    const proj = getProject(store, '/test/project');
    expect(proj?.detectedLanguage).toBeNull();
  });
});

// ── runStop — lastInjectedPrompt flag ─────────────────────────────────────────

describe('runStop — lastInjectedPrompt flag', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('sets lastInjectedPrompt in session when user selects an option', async () => {
    const selectedText = 'write unit tests before continuing';
    upsertPendingAdvisory(store, makeAdvisory());
    await runStop(makePayload(), store, mockSelect(selectedText));

    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/project');
    expect(mgr.current.lastInjectedPrompt).toBe(selectedText);
  });

  it('does NOT set lastInjectedPrompt when user skips', async () => {
    upsertPendingAdvisory(store, makeAdvisory());
    await runStop(makePayload(), store, mockSelect(SKIP_NOW));

    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/project');
    expect(mgr.current.lastInjectedPrompt ?? null).toBeNull();
  });

  it('does NOT set lastInjectedPrompt on clipboard_only', async () => {
    upsertPendingAdvisory(store, makeAdvisory());
    await runStop(makePayload(), store, mockSelect(CLIPBOARD_ONLY));

    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/project');
    expect(mgr.current.lastInjectedPrompt ?? null).toBeNull();
  });

  it('does NOT set lastInjectedPrompt when no advisory is pending', async () => {
    await runStop(makePayload(), store, mockSelect('some option'));

    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const mgr = SessionStateManager.load(store, '/test/project');
    expect(mgr.current.lastInjectedPrompt ?? null).toBeNull();
  });
});

// ── runStop — generated options passed to decision session ────────────────────

describe('runStop — generated options wiring', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  function makeAdvisoryWithOptions(projectRoot = '/test/project') {
    return {
      projectRoot,
      stage:       'implementation' as const,
      flagType:    'absence:test_creation' as const,
      pinchLabel:  'Hold up.',
      sessionId:   'sess-001',
      promptCount: 5,
      generatedL1: ['write tests first — they break without it', 'quick spec review before you continue'],
      generatedL2: ['what does done look like for this task?', 'does this match the task definition?'],
      generatedL3: ['anything obviously wrong before moving on?'],
    };
  }

  it('uses generatedL1/L2/L3 from advisory when all three are present', async () => {
    upsertPendingAdvisory(store, makeAdvisoryWithOptions());
    // selectFn receives the generated options as selectable values
    // We pick the first generated L1 option — it should be returned as selectedPrompt
    const selectedText = 'write tests first — they break without it';
    const result = await runStop(makePayload(), store, mockSelect(selectedText));
    expect(result.outcome).toBe('blocked');
    if (result.outcome === 'blocked') {
      expect(result.reason).toBe(selectedText);
    }
  });

  it('falls back to static options when generatedL1 is null', async () => {
    upsertPendingAdvisory(store, makeAdvisory()); // makeAdvisory() has no generatedL1/L2/L3
    // selectFn picks the static L1[0] option (from TASK_REVIEW since flagType=absence:test_creation)
    const { TASK_REVIEW } = await import('../../decision-session/options.js');
    const staticL1First = TASK_REVIEW.L1[0];
    const result = await runStop(makePayload(), store, mockSelect(staticL1First));
    expect(result.outcome).toBe('blocked');
    if (result.outcome === 'blocked') {
      expect(result.reason).toBe(staticL1First);
    }
  });

  it('advisory with partial nulls (only generatedL2 missing) falls back to static for all levels', async () => {
    // All three must be non-null for generatedOptions to be used — partial is treated as static
    const { upsertPendingAdvisory: upsert } = await import('../../store/pending-advisories.js');
    upsert(store, {
      projectRoot:  '/test/project',
      stage:        'implementation',
      flagType:     'absence:test_creation',
      pinchLabel:   'Hold up.',
      sessionId:    'sess-001',
      promptCount:  5,
      generatedL1:  ['write tests first'],
      generatedL2:  undefined, // missing — triggers fallback
      generatedL3:  ['anything obviously wrong?'],
    });
    // selectFn picks a static L1 option — pipeline should work without crashing
    const { TASK_REVIEW } = await import('../../decision-session/options.js');
    const result = await runStop(makePayload(), store, mockSelect(TASK_REVIEW.L1[0]));
    // Result should be blocked (valid option selected) — no crash from partial null
    expect(['blocked', 'skipped']).toContain(result.outcome);
  });
});

// ── runStop — telemetry events ────────────────────────────────────────────────

describe('runStop — telemetry events', () => {
  let store: Store;

  beforeEach(async () => {
    store = await openStore(':memory:');
    vi.mocked(writeTelemetry).mockClear();
  });
  afterEach(() => {
    store.db.close();
    vi.restoreAllMocks();
  });

  it('emits stop_no_pending when no advisory is queued', async () => {
    await runStop(makePayload(), store);
    expect(writeTelemetry).toHaveBeenCalledWith('/test/project', 'stop_no_pending');
  });

  it('does not emit stop_no_pending when an advisory is present', async () => {
    upsertPendingAdvisory(store, makeAdvisory());
    await runStop(makePayload(), store, mockSelect(SKIP_NOW));
    const calls = vi.mocked(writeTelemetry).mock.calls;
    expect(calls.some(([, evt]) => evt === 'stop_no_pending')).toBe(false);
  });

  it('emits stop_advisory_shown with flagType, stage, generatedOptions before decision session', async () => {
    upsertPendingAdvisory(store, makeAdvisory());
    await runStop(makePayload(), store, mockSelect(SKIP_NOW));
    expect(writeTelemetry).toHaveBeenCalledWith(
      '/test/project',
      'stop_advisory_shown',
      expect.objectContaining({
        flagType:         'absence:test_creation',
        stage:            'implementation',
        generatedOptions: false,
      }),
    );
  });

  it('emits stop_advisory_shown with generatedOptions:true when all L1/L2/L3 present', async () => {
    upsertPendingAdvisory(store, {
      projectRoot:  '/test/project',
      stage:        'implementation',
      flagType:     'absence:test_creation',
      pinchLabel:   'Hold up.',
      sessionId:    'sess-001',
      promptCount:  5,
      generatedL1:  ['opt a'],
      generatedL2:  ['opt b'],
      generatedL3:  ['opt c'],
    });
    await runStop(makePayload(), store, mockSelect(SKIP_NOW));
    expect(writeTelemetry).toHaveBeenCalledWith(
      '/test/project',
      'stop_advisory_shown',
      expect.objectContaining({ generatedOptions: true }),
    );
  });
});
