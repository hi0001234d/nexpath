import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openStore } from '../../store/db.js';
import type { Store } from '../../store/db.js';
import { runStop } from './stop.js';
import type { StopPayload } from './stop.js';
import { upsertPendingAdvisory, getPendingAdvisory } from '../../store/pending-advisories.js';
import { getSkippedSessions } from '../../store/skipped-sessions.js';
import { SKIP_NOW } from '../../decision-session/options.js';
import type { SelectFn } from '../../decision-session/DecisionSession.js';
import * as TtySelectFnModule from '../../decision-session/TtySelectFn.js';

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
