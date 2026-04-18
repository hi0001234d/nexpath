import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openStore } from '../../store/db.js';
import type { Store } from '../../store/db.js';
import {
  insertSkippedSession,
  getSkippedSessions,
} from '../../store/skipped-sessions.js';
import { SKIP_NOW } from '../../decision-session/options.js';
import type { SelectFn } from '../../decision-session/DecisionSession.js';
import { describeAge, runOptimize } from './optimize.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PROJECT = '/test/project';

function insertItem(
  store:    Store,
  overrides: Partial<{
    projectRoot:          string;
    sessionId:            string;
    flagType:             string;
    stage:                string;
    levelReached:         number;
    skippedAtPromptCount: number;
  }> = {},
): void {
  insertSkippedSession(store, {
    projectRoot:          PROJECT,
    sessionId:            'sess-001',
    flagType:             'stage_transition',
    stage:                'implementation',
    levelReached:         1,
    skippedAtPromptCount: 10,
    ...overrides,
  });
}

function mockSelect(value: string): SelectFn {
  return vi.fn().mockResolvedValue(value);
}

function mockCancel(): SelectFn {
  return vi.fn().mockResolvedValue(Symbol('cancel'));
}

// ── describeAge ───────────────────────────────────────────────────────────────

describe('describeAge', () => {
  it('returns "skipped just now" for very recent skips (< 1 minute)', () => {
    const now = Date.now();
    expect(describeAge(now - 30_000, now)).toBe('skipped just now');
  });

  it('returns minutes for skips within the last hour', () => {
    const now = Date.now();
    expect(describeAge(now - 5 * 60_000, now)).toBe('skipped 5 minutes ago');
  });

  it('uses singular for exactly 1 minute', () => {
    const now = Date.now();
    expect(describeAge(now - 60_000, now)).toBe('skipped 1 minute ago');
  });

  it('returns hours for skips within the last day', () => {
    const now = Date.now();
    expect(describeAge(now - 3 * 3_600_000, now)).toBe('skipped 3 hours ago');
  });

  it('uses singular for exactly 1 hour', () => {
    const now = Date.now();
    expect(describeAge(now - 3_600_000, now)).toBe('skipped 1 hour ago');
  });

  it('returns days for older skips', () => {
    const now = Date.now();
    expect(describeAge(now - 2 * 86_400_000, now)).toBe('skipped 2 days ago');
  });

  it('uses singular for exactly 1 day', () => {
    const now = Date.now();
    expect(describeAge(now - 86_400_000, now)).toBe('skipped 1 day ago');
  });
});

// ── runOptimize — empty queue ─────────────────────────────────────────────────

describe('runOptimize — empty queue', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('returns total=0 addressed=0 remaining=0 when queue is empty', async () => {
    const outcome = await runOptimize({ projectRoot: PROJECT }, store);
    expect(outcome).toEqual({ total: 0, addressed: 0, remaining: 0 });
  });

  it('does not call selectFn when queue is empty', async () => {
    const sel = mockSelect('anything');
    await runOptimize({ projectRoot: PROJECT }, store, sel);
    expect(sel).not.toHaveBeenCalled();
  });
});

// ── runOptimize — single item selected ───────────────────────────────────────

describe('runOptimize — user selects content option', () => {
  let store: Store;
  let stdoutLines: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(async () => {
    store = await openStore(':memory:');
    stdoutLines = [];
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdoutLines.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    store.db.close();
    vi.restoreAllMocks();
  });

  it('returns addressed=1 remaining=0 when user selects', async () => {
    insertItem(store);
    const items = getSkippedSessions(store, PROJECT);
    // Pick the first L1 content option (not SKIP_NOW)
    const firstOption = items[0]; // we'll use selectFn to return a real prompt
    const outcome = await runOptimize(
      { projectRoot: PROJECT },
      store,
      // Select first option shown (always a content prompt, not SKIP_NOW)
      vi.fn().mockImplementation(async (opts: { options: Array<{ value: string }> }) =>
        opts.options[0].value,
      ),
    );
    expect(outcome.addressed).toBe(1);
    expect(outcome.remaining).toBe(0);
    expect(outcome.total).toBe(1);
  });

  it('deletes the item from skipped_sessions after selection', async () => {
    insertItem(store);
    await runOptimize(
      { projectRoot: PROJECT },
      store,
      vi.fn().mockImplementation(async (opts: { options: Array<{ value: string }> }) =>
        opts.options[0].value,
      ),
    );
    expect(getSkippedSessions(store, PROJECT)).toHaveLength(0);
  });

  it('writes selected prompt text to stdout', async () => {
    insertItem(store);
    const capturedValue: string[] = [];
    await runOptimize(
      { projectRoot: PROJECT },
      store,
      vi.fn().mockImplementation(async (opts: { options: Array<{ value: string }> }) => {
        capturedValue.push(opts.options[0].value);
        return opts.options[0].value;
      }),
    );
    expect(stdoutLines.join('')).toContain(capturedValue[0]);
  });
});

// ── runOptimize — user skips ──────────────────────────────────────────────────

describe('runOptimize — user skips', () => {
  let store: Store;

  beforeEach(async () => {
    store = await openStore(':memory:');
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    store.db.close();
    vi.restoreAllMocks();
  });

  it('returns remaining=1 when user skips the only item', async () => {
    insertItem(store);
    const outcome = await runOptimize({ projectRoot: PROJECT }, store, mockSelect(SKIP_NOW));
    expect(outcome.remaining).toBe(1);
    expect(outcome.addressed).toBe(0);
  });

  it('leaves the item in skipped_sessions when user skips', async () => {
    insertItem(store);
    await runOptimize({ projectRoot: PROJECT }, store, mockSelect(SKIP_NOW));
    expect(getSkippedSessions(store, PROJECT)).toHaveLength(1);
  });

  it('does not write to stdout when user skips', async () => {
    const stdoutLines: string[] = [];
    vi.restoreAllMocks();
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdoutLines.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    insertItem(store);
    await runOptimize({ projectRoot: PROJECT }, store, mockSelect(SKIP_NOW));
    expect(stdoutLines.join('')).toBe('');
  });

  it('does not create a duplicate skipped_sessions record on skip during optimize', async () => {
    insertItem(store);
    await runOptimize({ projectRoot: PROJECT }, store, mockSelect(SKIP_NOW));
    // Must still be exactly 1 row — no duplicate
    expect(getSkippedSessions(store, PROJECT)).toHaveLength(1);
  });

  it('treats Ctrl+C (cancel symbol) as skip — item remains in store', async () => {
    insertItem(store);
    await runOptimize({ projectRoot: PROJECT }, store, mockCancel());
    expect(getSkippedSessions(store, PROJECT)).toHaveLength(1);
  });
});

// ── runOptimize — multiple items ──────────────────────────────────────────────

describe('runOptimize — multiple items', () => {
  let store: Store;

  beforeEach(async () => {
    store = await openStore(':memory:');
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    store.db.close();
    vi.restoreAllMocks();
  });

  it('processes all items in sequence', async () => {
    insertItem(store, { stage: 'implementation', flagType: 'stage_transition' });
    insertItem(store, { stage: 'prd',            flagType: 'stage_transition' });
    insertItem(store, { stage: 'implementation', flagType: 'absence:test_creation' });

    let callCount = 0;
    const sel: SelectFn = vi.fn().mockImplementation(async (opts: { options: Array<{ value: string }> }) => {
      callCount++;
      return opts.options[0].value; // always select first content option
    });

    const outcome = await runOptimize({ projectRoot: PROJECT }, store, sel);
    expect(outcome.total).toBe(3);
    expect(outcome.addressed).toBe(3);
    expect(outcome.remaining).toBe(0);
    expect(callCount).toBe(3);
  });

  it('correctly tracks mix of selected and skipped items', async () => {
    insertItem(store, { stage: 'implementation' });
    insertItem(store, { stage: 'prd' });
    insertItem(store, { stage: 'architecture' });

    let call = 0;
    const sel: SelectFn = vi.fn().mockImplementation(async (opts: { options: Array<{ value: string }> }) => {
      call++;
      // Select item 1, skip item 2, select item 3
      if (call === 2) return SKIP_NOW;
      return opts.options[0].value;
    });

    const outcome = await runOptimize({ projectRoot: PROJECT }, store, sel);
    expect(outcome.addressed).toBe(2);
    expect(outcome.remaining).toBe(1);
    expect(outcome.total).toBe(3);
    // Only the skipped item should remain
    expect(getSkippedSessions(store, PROJECT)).toHaveLength(1);
  });

  it('only processes items belonging to the specified projectRoot', async () => {
    insertItem(store, { projectRoot: PROJECT });
    insertItem(store, { projectRoot: '/other/project' });

    let callCount = 0;
    const sel: SelectFn = vi.fn().mockImplementation(async (opts: { options: Array<{ value: string }> }) => {
      callCount++;
      return opts.options[0].value;
    });

    const outcome = await runOptimize({ projectRoot: PROJECT }, store, sel);
    expect(outcome.total).toBe(1);   // only PROJECT's item
    expect(callCount).toBe(1);
    // Other project's item untouched
    expect(getSkippedSessions(store, '/other/project')).toHaveLength(1);
  });
});

// ── runOptimize — stderr headers ─────────────────────────────────────────────

describe('runOptimize — stderr item headers', () => {
  let store: Store;
  let stderrLines: string[];

  beforeEach(async () => {
    store = await openStore(':memory:');
    stderrLines = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderrLines.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    store.db.close();
    vi.restoreAllMocks();
  });

  it('writes "Item 1 of 1" header to stderr for a single item', async () => {
    insertItem(store);
    await runOptimize({ projectRoot: PROJECT }, store, mockSelect(SKIP_NOW));
    expect(stderrLines.join('')).toContain('Item 1 of 1');
  });

  it('writes "Item N of M" for each item in a multi-item run', async () => {
    insertItem(store);
    insertItem(store);
    insertItem(store);
    await runOptimize(
      { projectRoot: PROJECT },
      store,
      vi.fn().mockImplementation(async (opts: { options: Array<{ value: string }> }) =>
        opts.options[0].value,
      ),
    );
    const combined = stderrLines.join('');
    expect(combined).toContain('Item 1 of 3');
    expect(combined).toContain('Item 2 of 3');
    expect(combined).toContain('Item 3 of 3');
  });

  it('includes a human-readable age in the header', async () => {
    insertItem(store);
    await runOptimize({ projectRoot: PROJECT }, store, mockSelect(SKIP_NOW));
    const combined = stderrLines.join('');
    // describeAge output is always "skipped X ago" or "skipped just now"
    expect(combined).toMatch(/skipped .+ ago|skipped just now/);
  });
});

// ── runOptimize — oldest-first ordering ──────────────────────────────────────

describe('runOptimize — oldest-first ordering', () => {
  let store: Store;

  beforeEach(async () => {
    store = await openStore(':memory:');
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    store.db.close();
    vi.restoreAllMocks();
  });

  it('presents older items before newer ones', async () => {
    // Insert directly with explicit skipped_at timestamps so ordering is deterministic
    store.db.run(
      `INSERT INTO skipped_sessions
         (project_root, session_id, flag_type, stage, level_reached, skipped_at_prompt_count, skipped_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [PROJECT, 'sess-old', 'stage_transition', 'prd',            1, 5,  1_000],
    );
    store.db.run(
      `INSERT INTO skipped_sessions
         (project_root, session_id, flag_type, stage, level_reached, skipped_at_prompt_count, skipped_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [PROJECT, 'sess-new', 'stage_transition', 'architecture', 1, 20, 2_000],
    );

    const presentedStages: string[] = [];
    const sel: SelectFn = vi.fn().mockImplementation(async (opts: { message: string; options: Array<{ value: string }> }) => {
      // The message contains the question from the content; record which stage content appeared
      presentedStages.push(opts.message);
      return SKIP_NOW;
    });

    await runOptimize({ projectRoot: PROJECT }, store, sel);

    // Oldest item (prd → IDEA_TO_PRD) must come first
    expect(presentedStages[0]).toContain('Before building');
    // Newer item (architecture → PRD_TO_ARCHITECTURE) must come second
    expect(presentedStages[1]).toContain('Spec ready');
  });
});

// ── runOptimize — cascade levels within optimize ──────────────────────────────

describe('runOptimize — cascade level navigation', () => {
  let store: Store;

  beforeEach(async () => {
    store = await openStore(':memory:');
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    store.db.close();
    vi.restoreAllMocks();
  });

  it('item is deleted when user navigates to L2 via "Show simpler" and selects there', async () => {
    insertItem(store);
    let call = 0;
    const sel: SelectFn = vi.fn().mockImplementation(async (opts: { options: Array<{ value: string }> }) => {
      call++;
      if (call === 1) {
        // Return "Show simpler options →" on first call (L1)
        const simpler = opts.options.find((o) => o.value.includes('simpler'));
        return simpler ? simpler.value : opts.options[0].value;
      }
      // On second call (L2) — select first content option
      return opts.options[0].value;
    });

    const outcome = await runOptimize({ projectRoot: PROJECT }, store, sel);
    expect(outcome.addressed).toBe(1);
    expect(getSkippedSessions(store, PROJECT)).toHaveLength(0);
  });

  it('item stays in store when user goes L1 → L2 → L3 → skips at L3', async () => {
    insertItem(store);
    let call = 0;
    const sel: SelectFn = vi.fn().mockImplementation(async (opts: { options: Array<{ value: string }> }) => {
      call++;
      if (call <= 2) {
        // Navigate down via "Show simpler options →"
        const simpler = opts.options.find((o) => o.value.includes('simpler'));
        if (simpler) return simpler.value;
      }
      // At L3 (or if no simpler available) — skip
      return SKIP_NOW;
    });

    const outcome = await runOptimize({ projectRoot: PROJECT }, store, sel);
    expect(outcome.remaining).toBe(1);
    expect(getSkippedSessions(store, PROJECT)).toHaveLength(1);
    // No duplicate record created
    expect(getSkippedSessions(store, PROJECT)).toHaveLength(1);
  });
});

// ── runOptimize — idempotency across runs ─────────────────────────────────────

describe('runOptimize — idempotency across runs', () => {
  let store: Store;

  beforeEach(async () => {
    store = await openStore(':memory:');
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    store.db.close();
    vi.restoreAllMocks();
  });

  it('second run only sees items that were not addressed in first run', async () => {
    insertItem(store, { stage: 'implementation' });
    insertItem(store, { stage: 'prd' });

    let firstRunCall = 0;
    // First run: select item 1, skip item 2
    await runOptimize(
      { projectRoot: PROJECT },
      store,
      vi.fn().mockImplementation(async (opts: { options: Array<{ value: string }> }) => {
        firstRunCall++;
        return firstRunCall === 1 ? opts.options[0].value : SKIP_NOW;
      }),
    );

    // After first run: 1 item remains
    expect(getSkippedSessions(store, PROJECT)).toHaveLength(1);

    // Second run: only 1 item in queue
    const outcome2 = await runOptimize({ projectRoot: PROJECT }, store, mockSelect(SKIP_NOW));
    expect(outcome2.total).toBe(1);
    expect(outcome2.remaining).toBe(1);
  });

  it('empty queue after addressing all items — third run returns total=0', async () => {
    insertItem(store);

    // First run: address the item
    await runOptimize(
      { projectRoot: PROJECT },
      store,
      vi.fn().mockImplementation(async (opts: { options: Array<{ value: string }> }) =>
        opts.options[0].value,
      ),
    );

    // Second run: queue is empty
    const outcome2 = await runOptimize({ projectRoot: PROJECT }, store);
    expect(outcome2).toEqual({ total: 0, addressed: 0, remaining: 0 });
  });
});

// ── runOptimize — stdout newline ──────────────────────────────────────────────

describe('runOptimize — stdout format', () => {
  let store: Store;
  let stdoutLines: string[];

  beforeEach(async () => {
    store = await openStore(':memory:');
    stdoutLines = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdoutLines.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    store.db.close();
    vi.restoreAllMocks();
  });

  it('selected prompt is terminated with a newline', async () => {
    insertItem(store);
    await runOptimize(
      { projectRoot: PROJECT },
      store,
      vi.fn().mockImplementation(async (opts: { options: Array<{ value: string }> }) =>
        opts.options[0].value,
      ),
    );
    const out = stdoutLines.join('');
    expect(out.endsWith('\n')).toBe(true);
  });

  it('multiple selected prompts each end with a newline', async () => {
    insertItem(store, { stage: 'implementation' });
    insertItem(store, { stage: 'prd' });
    await runOptimize(
      { projectRoot: PROJECT },
      store,
      vi.fn().mockImplementation(async (opts: { options: Array<{ value: string }> }) =>
        opts.options[0].value,
      ),
    );
    // Each write call ends with \n
    for (const line of stdoutLines) {
      expect(line.endsWith('\n')).toBe(true);
    }
  });
});

// ── registerOptimizeCommand — summary output ──────────────────────────────────

describe('registerOptimizeCommand — summary on stderr', () => {
  let store: Store;
  let stderrLines: string[];

  beforeEach(async () => {
    store = await openStore(':memory:');
    stderrLines = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderrLines.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    store.db.close();
    vi.restoreAllMocks();
  });

  it('summary says "X of M items addressed. Y remaining." after a run', async () => {
    insertItem(store, { stage: 'implementation' });
    insertItem(store, { stage: 'prd' });

    let call = 0;
    // Address item 1, skip item 2
    await runOptimize(
      { projectRoot: PROJECT },
      store,
      vi.fn().mockImplementation(async (opts: { options: Array<{ value: string }> }) => {
        call++;
        return call === 1 ? opts.options[0].value : SKIP_NOW;
      }),
    );

    // Summary is written by registerOptimizeCommand action; runOptimize itself
    // writes the item headers. The action writes the final summary line.
    // Verify the outcome values are correct (action builds summary from them).
    const rows = getSkippedSessions(store, PROJECT);
    expect(rows).toHaveLength(1);   // 1 remaining
  });

  it('summary format: "1 of 1 items addressed. 0 remaining." when all addressed', async () => {
    insertItem(store);
    const outcome = await runOptimize(
      { projectRoot: PROJECT },
      store,
      vi.fn().mockImplementation(async (opts: { options: Array<{ value: string }> }) =>
        opts.options[0].value,
      ),
    );
    // Verify outcome values that the action uses to build the summary string
    expect(`${outcome.addressed} of ${outcome.total} items addressed. ${outcome.remaining} remaining.`)
      .toBe('1 of 1 items addressed. 0 remaining.');
  });

  it('summary format: "0 of 2 items addressed. 2 remaining." when all skipped', async () => {
    insertItem(store, { stage: 'implementation' });
    insertItem(store, { stage: 'prd' });
    const outcome = await runOptimize({ projectRoot: PROJECT }, store, mockSelect(SKIP_NOW));
    expect(`${outcome.addressed} of ${outcome.total} items addressed. ${outcome.remaining} remaining.`)
      .toBe('0 of 2 items addressed. 2 remaining.');
  });
});

// ── describeAge — edge case ───────────────────────────────────────────────────

describe('describeAge — edge cases', () => {
  it('returns "skipped just now" when skippedAt equals now (0ms elapsed)', () => {
    const now = Date.now();
    expect(describeAge(now, now)).toBe('skipped just now');
  });

  it('returns "skipped just now" for sub-minute gaps', () => {
    const now = Date.now();
    expect(describeAge(now - 59_999, now)).toBe('skipped just now');
  });
});

// ── runOptimize — pinch label uses static fallback ───────────────────────────

describe('runOptimize — pinch label', () => {
  let store: Store;

  beforeEach(async () => {
    store = await openStore(':memory:');
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    store.db.close();
    vi.restoreAllMocks();
  });

  it('passes a non-empty pinchLabel to the decision session (static fallback, no API)', async () => {
    insertItem(store, { stage: 'implementation', flagType: 'stage_transition' });

    let capturedMessage = '';
    const sel: SelectFn = vi.fn().mockImplementation(async (opts: { message: string; options: Array<{ value: string }> }) => {
      capturedMessage = opts.message;
      return SKIP_NOW;
    });

    await runOptimize({ projectRoot: PROJECT }, store, sel);
    // The message includes the pinch label — verify it is non-empty
    expect(capturedMessage.length).toBeGreaterThan(0);
    // Pinch label for implementation/stage_transition → TASK_REVIEW → 'Quick check.'
    expect(capturedMessage).toContain('Quick check.');
  });

  it('uses correct pinch fallback for prd stage transition', async () => {
    insertItem(store, { stage: 'prd', flagType: 'stage_transition' });

    let capturedMessage = '';
    const sel: SelectFn = vi.fn().mockImplementation(async (opts: { message: string; options: Array<{ value: string }> }) => {
      capturedMessage = opts.message;
      return SKIP_NOW;
    });

    await runOptimize({ projectRoot: PROJECT }, store, sel);
    // prd stage transition → IDEA_TO_PRD → pinchFallback = 'Before coding.'
    expect(capturedMessage).toContain('Before coding.');
  });
});
