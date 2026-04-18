import { describe, it, expect, vi } from 'vitest';
import { isCancel } from '@clack/prompts';
import {
  resolveDecisionContent,
  buildOptionList,
  getLevelSubtitle,
  SHOW_SIMPLER,
  SKIP_NOW,
  IDEA_TO_PRD,
  PRD_TO_ARCHITECTURE,
  ARCHITECTURE_TO_TASKS,
  TASK_REVIEW,
  IMPLEMENTATION_TO_REVIEW,
  REVIEW_TO_RELEASE,
} from './options.js';
import {
  buildSelectMessage,
  formatPinchLabel,
  formatQuestion,
  formatSubtitle,
  runLevel,
  runDecisionSession,
} from './DecisionSession.js';
import type { DecisionSessionInput, SelectFn } from './DecisionSession.js';
import type { Store } from '../store/db.js';
import { openStore } from '../store/db.js';
import { getSkippedSessions } from '../store/skipped-sessions.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<DecisionSessionInput> = {}): DecisionSessionInput {
  return {
    stage:       'implementation',
    flagType:    'stage_transition',
    pinchLabel:  'Hold up.',
    sessionId:   'session-test',
    projectRoot: '/test/project',
    promptCount: 20,
    ...overrides,
  };
}

// selectFn that returns a specific value
function mockSelect(value: string): SelectFn {
  return vi.fn().mockResolvedValue(value);
}

// selectFn that returns a cancel symbol (simulates Ctrl+C)
function mockCancel(): SelectFn {
  return vi.fn().mockResolvedValue(Symbol('cancel'));
}

// ── getLevelSubtitle ──────────────────────────────────────────────────────────

describe('getLevelSubtitle', () => {
  it('returns null for Level 1 (no subtitle shown)', () => {
    expect(getLevelSubtitle(1)).toBeNull();
  });

  it('returns "— lighter options" for Level 2', () => {
    expect(getLevelSubtitle(2)).toBe('— lighter options');
  });

  it('returns "— minimum viable step" for Level 3', () => {
    expect(getLevelSubtitle(3)).toBe('— minimum viable step');
  });
});

// ── buildOptionList ───────────────────────────────────────────────────────────

describe('buildOptionList', () => {
  it('Level 1: includes L1 content options + Show simpler + Skip', () => {
    const { options, hasNextLevel } = buildOptionList(TASK_REVIEW, 1);
    expect(options).toContain(SHOW_SIMPLER);
    expect(options).toContain(SKIP_NOW);
    expect(options[options.length - 1]).toBe(SKIP_NOW);
    expect(options[options.length - 2]).toBe(SHOW_SIMPLER);
    expect(hasNextLevel).toBe(true);
    // L1 content appears before the special options
    for (const opt of TASK_REVIEW.L1) {
      expect(options).toContain(opt);
    }
  });

  it('Level 2: includes L2 content options + Show simpler + Skip', () => {
    const { options, hasNextLevel } = buildOptionList(TASK_REVIEW, 2);
    expect(options).toContain(SHOW_SIMPLER);
    expect(options).toContain(SKIP_NOW);
    expect(options[options.length - 1]).toBe(SKIP_NOW);
    expect(options[options.length - 2]).toBe(SHOW_SIMPLER);
    expect(hasNextLevel).toBe(true);
    for (const opt of TASK_REVIEW.L2) {
      expect(options).toContain(opt);
    }
  });

  it('Level 3: includes L3 content options + Skip only (no Show simpler)', () => {
    const { options, hasNextLevel } = buildOptionList(TASK_REVIEW, 3);
    expect(options).not.toContain(SHOW_SIMPLER);
    expect(options).toContain(SKIP_NOW);
    expect(options[options.length - 1]).toBe(SKIP_NOW);
    expect(hasNextLevel).toBe(false);
    for (const opt of TASK_REVIEW.L3) {
      expect(options).toContain(opt);
    }
  });

  it('Skip option is always the very last option on all levels', () => {
    for (const level of [1, 2, 3] as const) {
      const { options } = buildOptionList(TASK_REVIEW, level);
      expect(options[options.length - 1]).toBe(SKIP_NOW);
    }
  });

  it('L1 has more options than L2 which has more than L3', () => {
    const { options: l1 } = buildOptionList(IMPLEMENTATION_TO_REVIEW, 1);
    const { options: l2 } = buildOptionList(IMPLEMENTATION_TO_REVIEW, 2);
    const { options: l3 } = buildOptionList(IMPLEMENTATION_TO_REVIEW, 3);
    // L1 has 4 content + Show simpler + Skip = 6; L2 has 2+2=4; L3 has 1+1=2
    expect(l1.length).toBeGreaterThan(l2.length);
    expect(l2.length).toBeGreaterThan(l3.length);
  });
});

// ── resolveDecisionContent ────────────────────────────────────────────────────

describe('resolveDecisionContent', () => {
  it('stage_transition to prd → IDEA_TO_PRD content', () => {
    const content = resolveDecisionContent('prd', 'stage_transition');
    expect(content).toBe(IDEA_TO_PRD);
  });

  it('stage_transition to architecture → PRD_TO_ARCHITECTURE content', () => {
    const content = resolveDecisionContent('architecture', 'stage_transition');
    expect(content).toBe(PRD_TO_ARCHITECTURE);
  });

  it('stage_transition to task_breakdown → ARCHITECTURE_TO_TASKS content', () => {
    const content = resolveDecisionContent('task_breakdown', 'stage_transition');
    expect(content).toBe(ARCHITECTURE_TO_TASKS);
  });

  it('stage_transition to review_testing → IMPLEMENTATION_TO_REVIEW content', () => {
    const content = resolveDecisionContent('review_testing', 'stage_transition');
    expect(content).toBe(IMPLEMENTATION_TO_REVIEW);
  });

  it('stage_transition to release → REVIEW_TO_RELEASE content', () => {
    const content = resolveDecisionContent('release', 'stage_transition');
    expect(content).toBe(REVIEW_TO_RELEASE);
  });

  it('absence:test_creation → TASK_REVIEW content (specific override)', () => {
    const content = resolveDecisionContent('implementation', 'absence:test_creation');
    expect(content).toBe(TASK_REVIEW);
  });

  it('absence:regression_check → TASK_REVIEW content', () => {
    const content = resolveDecisionContent('implementation', 'absence:regression_check');
    expect(content).toBe(TASK_REVIEW);
  });

  it('absence:cross_confirming → TASK_REVIEW content', () => {
    const content = resolveDecisionContent('implementation', 'absence:cross_confirming');
    expect(content).toBe(TASK_REVIEW);
  });

  it('absence:spec_acceptance_check → TASK_REVIEW content', () => {
    const content = resolveDecisionContent('review_testing', 'absence:spec_acceptance_check');
    expect(content).toBe(TASK_REVIEW);
  });

  it('absence:unknown_signal in implementation → falls back to TASK_REVIEW', () => {
    const content = resolveDecisionContent('implementation', 'absence:some_unknown_signal');
    expect(content).toBe(TASK_REVIEW);
  });

  it('absence:unknown_signal in idea stage → falls back to TASK_REVIEW', () => {
    // No specific override, 'idea' not in TRANSITION_CONTENT → TASK_REVIEW fallback
    const content = resolveDecisionContent('idea', 'absence:some_signal');
    expect(content).toBe(TASK_REVIEW);
  });
});

// ── Content structure validation ──────────────────────────────────────────────

describe('DecisionContent structure', () => {
  const allContent = [
    IDEA_TO_PRD,
    PRD_TO_ARCHITECTURE,
    ARCHITECTURE_TO_TASKS,
    TASK_REVIEW,
    IMPLEMENTATION_TO_REVIEW,
    REVIEW_TO_RELEASE,
  ];

  it('every content entry has a non-empty question', () => {
    for (const c of allContent) {
      expect(c.question.length).toBeGreaterThan(0);
    }
  });

  it('every content entry has a non-empty pinchFallback', () => {
    for (const c of allContent) {
      expect(c.pinchFallback.length).toBeGreaterThan(0);
    }
  });

  it('every content entry has at least 1 L1 option', () => {
    for (const c of allContent) {
      expect(c.L1.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('every content entry has at least 1 L2 option', () => {
    for (const c of allContent) {
      expect(c.L2.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('every content entry has at least 1 L3 option', () => {
    for (const c of allContent) {
      expect(c.L3.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('SKIP_NOW constant matches research spec wording', () => {
    expect(SKIP_NOW).toBe('Skip for now — nexpath optimize will remind me later');
  });

  it('SHOW_SIMPLER constant matches research spec wording', () => {
    expect(SHOW_SIMPLER).toBe('Show simpler options →');
  });
});

// ── ANSI formatting helpers ───────────────────────────────────────────────────

describe('ANSI formatting helpers', () => {
  it('formatPinchLabel wraps text in bold cyan ANSI codes', () => {
    const result = formatPinchLabel('Hold up.');
    expect(result).toContain('Hold up.');
    expect(result).toContain('\x1b['); // ANSI escape
    expect(result).toContain('\x1b[0m'); // reset
  });

  it('formatQuestion wraps text in bold white ANSI codes', () => {
    const result = formatQuestion('Is the plan written?');
    expect(result).toContain('Is the plan written?');
    expect(result).toContain('\x1b[');
    expect(result).toContain('\x1b[0m');
  });

  it('formatSubtitle wraps text in dim yellow ANSI codes', () => {
    const result = formatSubtitle('— lighter options');
    expect(result).toContain('— lighter options');
    expect(result).toContain('\x1b[');
    expect(result).toContain('\x1b[0m');
  });
});

// ── buildSelectMessage ────────────────────────────────────────────────────────

describe('buildSelectMessage', () => {
  it('Level 1: contains pinch label and question, no subtitle', () => {
    const msg = buildSelectMessage('Hold up.', 'Is the plan written?', 1);
    expect(msg).toContain('Hold up.');
    expect(msg).toContain('Is the plan written?');
    expect(msg).not.toContain('lighter options');
    expect(msg).not.toContain('minimum viable');
  });

  it('Level 2: contains pinch label, "lighter options" subtitle, and question', () => {
    const msg = buildSelectMessage('Hold up.', 'Is the plan written?', 2);
    expect(msg).toContain('Hold up.');
    expect(msg).toContain('lighter options');
    expect(msg).toContain('Is the plan written?');
  });

  it('Level 3: contains pinch label, "minimum viable step" subtitle, and question', () => {
    const msg = buildSelectMessage('Hold up.', 'Is the plan written?', 3);
    expect(msg).toContain('Hold up.');
    expect(msg).toContain('minimum viable step');
    expect(msg).toContain('Is the plan written?');
  });
});

// ── runLevel ──────────────────────────────────────────────────────────────────

describe('runLevel', () => {
  it('returns the selected prompt text when a content option is chosen', async () => {
    const content  = resolveDecisionContent('implementation', 'stage_transition');
    const firstOpt = content.L1[0];
    const result   = await runLevel(makeInput(), 1, mockSelect(firstOpt));
    expect(result).toBe(firstOpt);
  });

  it('returns "next" when user selects "Show simpler options →" on Level 1', async () => {
    const result = await runLevel(makeInput(), 1, mockSelect(SHOW_SIMPLER));
    expect(result).toBe('next');
  });

  it('returns "next" when user selects "Show simpler options →" on Level 2', async () => {
    const result = await runLevel(makeInput(), 2, mockSelect(SHOW_SIMPLER));
    expect(result).toBe('next');
  });

  it('returns "skip" when user selects SKIP_NOW', async () => {
    const result = await runLevel(makeInput(), 1, mockSelect(SKIP_NOW));
    expect(result).toBe('skip');
  });

  it('returns "skip" on Ctrl+C (isCancel symbol)', async () => {
    const result = await runLevel(makeInput(), 1, mockCancel());
    expect(result).toBe('skip');
  });

  it('passes the correct option list to selectFn on Level 1', async () => {
    const selectFn = mockSelect(SKIP_NOW);
    await runLevel(makeInput(), 1, selectFn);
    const call = (selectFn as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const values = call.options.map((o: { value: string }) => o.value);
    expect(values).toContain(SHOW_SIMPLER);
    expect(values).toContain(SKIP_NOW);
    expect(values[values.length - 1]).toBe(SKIP_NOW);
  });

  it('does NOT include "Show simpler options →" on Level 3', async () => {
    const selectFn = mockSelect(SKIP_NOW);
    await runLevel(makeInput(), 3, selectFn);
    const call = (selectFn as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const values = call.options.map((o: { value: string }) => o.value);
    expect(values).not.toContain(SHOW_SIMPLER);
  });
});

// ── runDecisionSession ────────────────────────────────────────────────────────

describe('runDecisionSession', () => {
  it('returns { outcome: selected, selectedPrompt } when user picks a content option', async () => {
    const content  = resolveDecisionContent('implementation', 'stage_transition');
    const firstOpt = content.L1[0];
    const result   = await runDecisionSession(makeInput(), undefined, mockSelect(firstOpt));
    expect(result.outcome).toBe('selected');
    if (result.outcome === 'selected') {
      expect(result.selectedPrompt).toBe(firstOpt);
    }
  });

  it('returns { outcome: skipped } when user selects SKIP_NOW', async () => {
    const result = await runDecisionSession(makeInput(), undefined, mockSelect(SKIP_NOW));
    expect(result.outcome).toBe('skipped');
  });

  it('returns { outcome: skipped } on Ctrl+C / Escape', async () => {
    const result = await runDecisionSession(makeInput(), undefined, mockCancel());
    expect(result.outcome).toBe('skipped');
  });

  it('advances to Level 2 when user selects "Show simpler options →" on Level 1', async () => {
    // First call: Show simpler; second call: skip
    const selectFn = vi.fn()
      .mockResolvedValueOnce(SHOW_SIMPLER)
      .mockResolvedValueOnce(SKIP_NOW);
    const result = await runDecisionSession(makeInput(), undefined, selectFn as SelectFn);
    expect(selectFn).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe('skipped');
  });

  it('advances to Level 3 when user selects "Show simpler options →" twice', async () => {
    const content  = resolveDecisionContent('implementation', 'stage_transition');
    const l3Option = content.L3[0];
    const selectFn = vi.fn()
      .mockResolvedValueOnce(SHOW_SIMPLER)  // L1 → L2
      .mockResolvedValueOnce(SHOW_SIMPLER)  // L2 → L3
      .mockResolvedValueOnce(l3Option);      // L3 → selected
    const result = await runDecisionSession(makeInput(), undefined, selectFn as SelectFn);
    expect(selectFn).toHaveBeenCalledTimes(3);
    expect(result.outcome).toBe('selected');
    if (result.outcome === 'selected') {
      expect(result.selectedPrompt).toBe(l3Option);
    }
  });

  it('does not cascade beyond Level 3 (stops at L3 even if "next" somehow fires)', async () => {
    // If level 3 selectFn somehow returns SHOW_SIMPLER (shouldn't happen per UI),
    // it should be treated as a skip (defensive case)
    const selectFn = vi.fn()
      .mockResolvedValueOnce(SHOW_SIMPLER)
      .mockResolvedValueOnce(SHOW_SIMPLER)
      .mockResolvedValueOnce(SHOW_SIMPLER); // "next" on Level 3 → treated as skip
    const result = await runDecisionSession(makeInput(), undefined, selectFn as SelectFn);
    expect(result.outcome).toBe('skipped');
  });

  it('persists skip to store when store is provided', async () => {
    const store = await openStore(':memory:');
    try {
      const input = makeInput({ projectRoot: '/proj/test', levelReached: undefined } as Partial<DecisionSessionInput>);
      await runDecisionSession(input, store, mockSelect(SKIP_NOW));
      const rows = getSkippedSessions(store, '/proj/test');
      expect(rows).toHaveLength(1);
      expect(rows[0].flagType).toBe('stage_transition');
      expect(rows[0].stage).toBe('implementation');
      expect(rows[0].levelReached).toBe(1);
    } finally {
      store.db.close();
    }
  });

  it('persists correct level_reached when skip happens at Level 2', async () => {
    const store = await openStore(':memory:');
    try {
      const selectFn = vi.fn()
        .mockResolvedValueOnce(SHOW_SIMPLER)  // L1 → L2
        .mockResolvedValueOnce(SKIP_NOW);      // skip at L2
      await runDecisionSession(makeInput({ projectRoot: '/proj/test2' }), store, selectFn as SelectFn);
      const rows = getSkippedSessions(store, '/proj/test2');
      expect(rows[0].levelReached).toBe(2);
    } finally {
      store.db.close();
    }
  });

  it('persists correct level_reached when skip happens at Level 3', async () => {
    const store = await openStore(':memory:');
    try {
      const selectFn = vi.fn()
        .mockResolvedValueOnce(SHOW_SIMPLER)
        .mockResolvedValueOnce(SHOW_SIMPLER)
        .mockResolvedValueOnce(SKIP_NOW);
      await runDecisionSession(makeInput({ projectRoot: '/proj/test3' }), store, selectFn as SelectFn);
      const rows = getSkippedSessions(store, '/proj/test3');
      expect(rows[0].levelReached).toBe(3);
    } finally {
      store.db.close();
    }
  });

  it('does NOT persist to store when user selects a content option', async () => {
    const store = await openStore(':memory:');
    try {
      const content = resolveDecisionContent('implementation', 'stage_transition');
      await runDecisionSession(makeInput({ projectRoot: '/proj/select' }), store, mockSelect(content.L1[0]));
      const rows = getSkippedSessions(store, '/proj/select');
      expect(rows).toHaveLength(0);
    } finally {
      store.db.close();
    }
  });

  it('does NOT persist when no store is provided (no crash)', async () => {
    // Should not throw even without a store
    const result = await runDecisionSession(makeInput(), undefined, mockSelect(SKIP_NOW));
    expect(result.outcome).toBe('skipped');
  });

  it('records promptCount and sessionId correctly in the skip row', async () => {
    const store = await openStore(':memory:');
    try {
      const input = makeInput({ promptCount: 42, sessionId: 'sess-xyz', projectRoot: '/proj/pc' });
      await runDecisionSession(input, store, mockSelect(SKIP_NOW));
      const rows = getSkippedSessions(store, '/proj/pc');
      expect(rows[0].skippedAtPromptCount).toBe(42);
      expect(rows[0].sessionId).toBe('sess-xyz');
    } finally {
      store.db.close();
    }
  });
});
