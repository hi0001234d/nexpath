import { describe, it, expect, vi } from 'vitest';
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
  BEHAVIOUR_TESTING,
} from './options.js';
import {
  buildSelectMessage,
  formatPinchLabel,
  formatQuestion,
  formatSubtitle,
  runLevel,
  runDecisionSession,
  OPTION_SEPARATOR,
  OPT_OUT_SENTINEL,
} from './DecisionSession.js';
import type { DecisionSessionInput, SelectFn } from './DecisionSession.js';
import type { Store } from '../store/db.js';
import { openStore } from '../store/db.js';
import { getSkippedSessions } from '../store/skipped-sessions.js';
import { getProject, upsertProject } from '../store/projects.js';
import { getConfig } from '../store/config.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<DecisionSessionInput> = {}): DecisionSessionInput {
  return {
    stage:                'implementation',
    flagType:             'stage_transition',
    pinchLabel:           'Hold up.',
    sessionId:            'session-test',
    projectRoot:          '/test/project',
    promptCount:          20,
    decisionSessionCount: 5,
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

  it('TASK_REVIEW L1 has exactly 5 options (3 content + Show simpler + Skip)', () => {
    const { options } = buildOptionList(TASK_REVIEW, 1);
    expect(options).toHaveLength(5);
  });

  it('TASK_REVIEW L2 has exactly 4 options (2 content + Show simpler + Skip)', () => {
    const { options } = buildOptionList(TASK_REVIEW, 2);
    expect(options).toHaveLength(4);
  });

  it('TASK_REVIEW L3 has exactly 2 options (1 content + Skip)', () => {
    const { options } = buildOptionList(TASK_REVIEW, 3);
    expect(options).toHaveLength(2);
  });

  it('IMPLEMENTATION_TO_REVIEW L1 has exactly 7 options (5 content + Show simpler + Skip)', () => {
    const { options } = buildOptionList(IMPLEMENTATION_TO_REVIEW, 1);
    expect(options).toHaveLength(7); // 5 content options (4 original + 1 v0.3.0) + Show simpler + Skip
  });

  // ── BEHAVIOUR_TESTING buildOptionList at all 3 levels (v0.3.0) ───────────────

  it('BEHAVIOUR_TESTING L1 has exactly 5 options (3 content + Show simpler + Skip)', () => {
    const { options, hasNextLevel } = buildOptionList(BEHAVIOUR_TESTING, 1);
    expect(options).toHaveLength(5);
    expect(hasNextLevel).toBe(true);
    expect(options.at(-1)).toBe(SKIP_NOW);
    expect(options.at(-2)).toBe(SHOW_SIMPLER);
  });

  it('BEHAVIOUR_TESTING L2 has exactly 4 options (2 content + Show simpler + Skip)', () => {
    const { options, hasNextLevel } = buildOptionList(BEHAVIOUR_TESTING, 2);
    expect(options).toHaveLength(4);
    expect(hasNextLevel).toBe(true);
    expect(options.at(-1)).toBe(SKIP_NOW);
    expect(options.at(-2)).toBe(SHOW_SIMPLER);
  });

  it('BEHAVIOUR_TESTING L3 has exactly 2 options (1 content + Skip, no Show simpler)', () => {
    const { options, hasNextLevel } = buildOptionList(BEHAVIOUR_TESTING, 3);
    expect(options).toHaveLength(2);
    expect(hasNextLevel).toBe(false);
    expect(options.at(-1)).toBe(SKIP_NOW);
    expect(options).not.toContain(SHOW_SIMPLER);
  });

  it('BEHAVIOUR_TESTING L1 first option is the user journey prompt', () => {
    const { options } = buildOptionList(BEHAVIOUR_TESTING, 1);
    expect(options[0]).toContain('manual test scenario');
  });

  it('BEHAVIOUR_TESTING L3 only option is the minimum scenario prompt', () => {
    const { options } = buildOptionList(BEHAVIOUR_TESTING, 3);
    expect(options[0]).toContain('manually test right now');
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

  it('stage_transition to implementation → TASK_REVIEW (within-implementation fallback)', () => {
    // implementation is not in TRANSITION_CONTENT; special case branch returns TASK_REVIEW
    const content = resolveDecisionContent('implementation', 'stage_transition');
    expect(content).toBe(TASK_REVIEW);
  });

  it('stage_transition to idea → TASK_REVIEW (generic fallback for unmapped stage)', () => {
    // idea is not in TRANSITION_CONTENT and not the implementation special case
    const content = resolveDecisionContent('idea', 'stage_transition');
    expect(content).toBe(TASK_REVIEW);
  });

  it('stage_transition to feedback_loop → TASK_REVIEW (generic fallback for terminal stage)', () => {
    const content = resolveDecisionContent('feedback_loop', 'stage_transition');
    expect(content).toBe(TASK_REVIEW);
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

  it('absence:unknown_signal in feedback_loop stage → falls back to TASK_REVIEW', () => {
    const content = resolveDecisionContent('feedback_loop', 'absence:some_signal');
    expect(content).toBe(TASK_REVIEW);
  });

  // Priority contract: absence override wins over TRANSITION_CONTENT
  it('absence:test_creation on prd stage → TASK_REVIEW (override wins over IDEA_TO_PRD transition)', () => {
    // Priority 1 (absence override) takes precedence over priority 2 (stage-based transition).
    // 'prd' is in TRANSITION_CONTENT → IDEA_TO_PRD, but absence:test_creation override → TASK_REVIEW.
    const content = resolveDecisionContent('prd', 'absence:test_creation');
    expect(content).toBe(TASK_REVIEW);
  });

  it('absence:regression_check on architecture stage → TASK_REVIEW (override wins over PRD_TO_ARCHITECTURE)', () => {
    const content = resolveDecisionContent('architecture', 'absence:regression_check');
    expect(content).toBe(TASK_REVIEW);
  });

  it('unmapped absence on prd stage → IDEA_TO_PRD (falls through to TRANSITION_CONTENT)', () => {
    // No override for 'some_signal' → falls to TRANSITION_CONTENT['prd'] = IDEA_TO_PRD
    const content = resolveDecisionContent('prd', 'absence:some_unknown_signal');
    expect(content).toBe(IDEA_TO_PRD);
  });

  it('unmapped absence on review_testing stage → IMPLEMENTATION_TO_REVIEW (falls through to TRANSITION_CONTENT)', () => {
    const content = resolveDecisionContent('review_testing', 'absence:some_unknown_signal');
    expect(content).toBe(IMPLEMENTATION_TO_REVIEW);
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
    BEHAVIOUR_TESTING,  // v0.3.0 — must be included in structural invariant checks
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

  // Exact option counts per content block (guards against accidental truncation)
  it('IDEA_TO_PRD has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(IDEA_TO_PRD.L1).toHaveLength(3);
    expect(IDEA_TO_PRD.L2).toHaveLength(2);
    expect(IDEA_TO_PRD.L3).toHaveLength(1);
  });

  it('PRD_TO_ARCHITECTURE has exactly 4 L1, 2 L2, 1 L3 options', () => {
    expect(PRD_TO_ARCHITECTURE.L1).toHaveLength(4);
    expect(PRD_TO_ARCHITECTURE.L2).toHaveLength(2);
    expect(PRD_TO_ARCHITECTURE.L3).toHaveLength(1);
  });

  it('ARCHITECTURE_TO_TASKS has exactly 4 L1, 2 L2, 1 L3 options', () => {
    expect(ARCHITECTURE_TO_TASKS.L1).toHaveLength(4);
    expect(ARCHITECTURE_TO_TASKS.L2).toHaveLength(2);
    expect(ARCHITECTURE_TO_TASKS.L3).toHaveLength(1);
  });

  it('TASK_REVIEW has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(TASK_REVIEW.L1).toHaveLength(3);
    expect(TASK_REVIEW.L2).toHaveLength(2);
    expect(TASK_REVIEW.L3).toHaveLength(1);
  });

  it('IMPLEMENTATION_TO_REVIEW has exactly 5 L1, 2 L2, 1 L3 options', () => {
    expect(IMPLEMENTATION_TO_REVIEW.L1).toHaveLength(5); // 4 original + 1 added in v0.3.0
    expect(IMPLEMENTATION_TO_REVIEW.L2).toHaveLength(2);
    expect(IMPLEMENTATION_TO_REVIEW.L3).toHaveLength(1);
  });

  it('REVIEW_TO_RELEASE has exactly 4 L1, 2 L2, 1 L3 options', () => {
    expect(REVIEW_TO_RELEASE.L1).toHaveLength(4);
    expect(REVIEW_TO_RELEASE.L2).toHaveLength(2);
    expect(REVIEW_TO_RELEASE.L3).toHaveLength(1);
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

  it('formatPinchLabel uses bold cyan escape (\x1b[1;96m)', () => {
    expect(formatPinchLabel('test')).toContain('\x1b[1;96m');
  });

  it('formatQuestion wraps text in bold white ANSI codes', () => {
    const result = formatQuestion('Is the plan written?');
    expect(result).toContain('Is the plan written?');
    expect(result).toContain('\x1b[');
    expect(result).toContain('\x1b[0m');
  });

  it('formatQuestion uses bold white escape (\x1b[1;97m)', () => {
    expect(formatQuestion('test')).toContain('\x1b[1;97m');
  });

  it('formatSubtitle wraps text in dim yellow ANSI codes', () => {
    const result = formatSubtitle('— lighter options');
    expect(result).toContain('— lighter options');
    expect(result).toContain('\x1b[');
    expect(result).toContain('\x1b[0m');
  });

  it('formatSubtitle uses dim yellow escape (\x1b[2;33m)', () => {
    expect(formatSubtitle('test')).toContain('\x1b[2;33m');
  });

  it('each formatter uses a distinct ANSI color (pinch ≠ question ≠ subtitle)', () => {
    const pinch    = formatPinchLabel('x').split('x')[0];
    const question = formatQuestion('x').split('x')[0];
    const subtitle = formatSubtitle('x').split('x')[0];
    expect(pinch).not.toBe(question);
    expect(pinch).not.toBe(subtitle);
    expect(question).not.toBe(subtitle);
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

  it('Level 1: pinch label appears before the question in the message', () => {
    const msg = buildSelectMessage('Hold up.', 'Is the plan written?', 1);
    expect(msg.indexOf('Hold up.')).toBeLessThan(msg.indexOf('Is the plan written?'));
  });

  it('Level 2: order is pinch → subtitle → question', () => {
    const msg = buildSelectMessage('Hold up.', 'Is the plan written?', 2);
    const pinchPos    = msg.indexOf('Hold up.');
    const subtitlePos = msg.indexOf('lighter options');
    const questionPos = msg.indexOf('Is the plan written?');
    expect(pinchPos).toBeLessThan(subtitlePos);
    expect(subtitlePos).toBeLessThan(questionPos);
  });

  it('parts are separated by newlines', () => {
    const msg = buildSelectMessage('Hold up.', 'Is the plan written?', 2);
    expect(msg).toContain('\n');
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

  it('value and label are equal for every non-separator, non-SKIP_NOW option (content prompts are pre-filled)', () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    return runLevel(makeInput(), 1, spy).then(() => {
      const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string; label: string }[];
      const realOpts = opts.filter(
        (o) => !o.value.startsWith(OPTION_SEPARATOR) && o.value !== SKIP_NOW,
      );
      for (const opt of realOpts) {
        expect(opt.value).toBe(opt.label);
      }
    });
  });

  it('selecting an L2 content option returns that prompt text', async () => {
    const content  = resolveDecisionContent('implementation', 'stage_transition');
    const l2Option = content.L2[0];
    const result   = await runLevel(makeInput(), 2, mockSelect(l2Option));
    expect(result).toBe(l2Option);
  });

  it('selecting an L3 content option returns that prompt text', async () => {
    const content  = resolveDecisionContent('prd', 'stage_transition');
    const l3Option = content.L3[0];
    const result   = await runLevel(
      makeInput({ stage: 'prd', flagType: 'stage_transition' }),
      3,
      mockSelect(l3Option),
    );
    expect(result).toBe(l3Option);
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
      const input = makeInput({ projectRoot: '/proj/test' });
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

  it('persists skip to store on Ctrl+C (cancel symbol)', async () => {
    const store = await openStore(':memory:');
    try {
      await runDecisionSession(makeInput({ projectRoot: '/proj/cancel-store' }), store, mockCancel());
      const rows = getSkippedSessions(store, '/proj/cancel-store');
      expect(rows).toHaveLength(1);
      expect(rows[0].levelReached).toBe(1);
    } finally {
      store.db.close();
    }
  });

  it('multiple skips create multiple rows (no dedup at storage layer)', async () => {
    const store = await openStore(':memory:');
    try {
      await runDecisionSession(makeInput({ projectRoot: '/proj/multi' }), store, mockSelect(SKIP_NOW));
      await runDecisionSession(makeInput({ projectRoot: '/proj/multi' }), store, mockSelect(SKIP_NOW));
      const rows = getSkippedSessions(store, '/proj/multi');
      expect(rows).toHaveLength(2);
    } finally {
      store.db.close();
    }
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

// ── BEHAVIOUR_TESTING content block (v0.3.0) ──────────────────────────────────

describe('BEHAVIOUR_TESTING content', () => {
  it('has correct question text', () => {
    expect(BEHAVIOUR_TESTING.question).toBe('Phase done — any real-user scenario tested?');
  });

  it('has correct pinchFallback', () => {
    expect(BEHAVIOUR_TESTING.pinchFallback).toBe('User scenario?');
  });

  it('has 3 L1 options', () => {
    expect(BEHAVIOUR_TESTING.L1).toHaveLength(3);
  });

  it('has 2 L2 options', () => {
    expect(BEHAVIOUR_TESTING.L2).toHaveLength(2);
  });

  it('has 1 L3 option', () => {
    expect(BEHAVIOUR_TESTING.L3).toHaveLength(1);
  });

  it('L1 option 1 mentions user journey or user steps', () => {
    expect(BEHAVIOUR_TESTING.L1[0].toLowerCase()).toMatch(/user|journey|step/);
  });

  it('L1 option 2 mentions acceptance tests or scenarios', () => {
    expect(BEHAVIOUR_TESTING.L1[1].toLowerCase()).toMatch(/acceptance|scenario/);
  });

  it('L1 option 3 is adversarial framing — mentions automated tests or break', () => {
    expect(BEHAVIOUR_TESTING.L1[2].toLowerCase()).toMatch(/automated|break/);
  });

  it('L3 minimum option ends with a question mark', () => {
    expect(BEHAVIOUR_TESTING.L3[0]).toMatch(/\?$/);
  });

  it('all L1 options are non-empty strings', () => {
    for (const opt of BEHAVIOUR_TESTING.L1) {
      expect(typeof opt).toBe('string');
      expect(opt.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('resolveDecisionContent — behaviour_testing absence (v0.3.0)', () => {
  it('returns BEHAVIOUR_TESTING for absence:behaviour_testing in implementation stage', () => {
    expect(resolveDecisionContent('implementation', 'absence:behaviour_testing')).toBe(BEHAVIOUR_TESTING);
  });

  it('returns BEHAVIOUR_TESTING for absence:behaviour_testing in review_testing stage', () => {
    expect(resolveDecisionContent('review_testing', 'absence:behaviour_testing')).toBe(BEHAVIOUR_TESTING);
  });

  it('does NOT return BEHAVIOUR_TESTING for unrelated absence signals', () => {
    expect(resolveDecisionContent('implementation', 'absence:test_creation')).not.toBe(BEHAVIOUR_TESTING);
    expect(resolveDecisionContent('implementation', 'absence:regression_check')).not.toBe(BEHAVIOUR_TESTING);
  });
});

describe('IMPLEMENTATION_TO_REVIEW — v0.3.0 addition', () => {
  it('has 5 L1 options after v0.3.0 addition', () => {
    expect(IMPLEMENTATION_TO_REVIEW.L1).toHaveLength(5);
  });

  it('5th L1 option contains "manual acceptance test"', () => {
    expect(IMPLEMENTATION_TO_REVIEW.L1[4].toLowerCase()).toContain('manual acceptance test');
  });

  it('5th L1 option mentions user journey', () => {
    expect(IMPLEMENTATION_TO_REVIEW.L1[4].toLowerCase()).toContain('user journey');
  });

  it('5th L1 option mentions edge cases', () => {
    expect(IMPLEMENTATION_TO_REVIEW.L1[4].toLowerCase()).toContain('edge cases');
  });

  it('first 4 L1 options are unchanged from before v0.3.0', () => {
    expect(IMPLEMENTATION_TO_REVIEW.L1[0]).toContain('Run the full test suite');
    expect(IMPLEMENTATION_TO_REVIEW.L1[1]).toContain('Check the spec acceptance criteria');
    expect(IMPLEMENTATION_TO_REVIEW.L1[2]).toContain('Cross-confirm the full implementation');
    expect(IMPLEMENTATION_TO_REVIEW.L1[3]).toContain('Review for regression');
  });
});

// ── Phase H — decisionSessionCount, help line, SKIP_NOW label, sentinels ────────

describe('runDecisionSession — decisionSessionCount increment', () => {
  it('increments decision_session_count in projects table on each call', async () => {
    const store = await openStore(':memory:');
    try {
      upsertProject(store, { projectRoot: '/proj/count', name: 'count' });
      const input = makeInput({ projectRoot: '/proj/count' });

      await runDecisionSession(input, store, mockSelect(SKIP_NOW));
      expect(getProject(store, '/proj/count')?.decisionSessionCount).toBe(1);

      await runDecisionSession(input, store, mockSelect(SKIP_NOW));
      expect(getProject(store, '/proj/count')?.decisionSessionCount).toBe(2);
    } finally {
      store.db.close();
    }
  });

  it('does not crash when store is undefined (no increment, no error)', async () => {
    const input = makeInput({ projectRoot: '/proj/no-store' });
    const result = await runDecisionSession(input, undefined, mockSelect(SKIP_NOW));
    expect(result.outcome).toBe('skipped');
  });
});

describe('runLevel — help line injection', () => {
  it('injects help line when decisionSessionCount < 3', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput({ decisionSessionCount: 0 }), 1, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string; label: string }[];
    const helpItem = opts.find((o) => o.value === `${OPTION_SEPARATOR}help`);
    expect(helpItem).toBeDefined();
    expect(helpItem?.label).toContain('Ctrl+X');
    expect(helpItem?.label).toContain('Ctrl+T');
  });

  it('does NOT inject help line when decisionSessionCount >= 3', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput({ decisionSessionCount: 3 }), 1, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string; label: string }[];
    const helpItem = opts.find((o) => o.value === `${OPTION_SEPARATOR}help`);
    expect(helpItem).toBeUndefined();
  });

  it('help line has a non-empty label (renders styled hint, not blank row)', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput({ decisionSessionCount: 1 }), 1, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string; label: string }[];
    const helpItem = opts.find((o) => o.value === `${OPTION_SEPARATOR}help`);
    expect(helpItem?.label.trim().length).toBeGreaterThan(0);
  });
});

describe('runLevel — SKIP_NOW label split', () => {
  it('SKIP_NOW option has value === SKIP_NOW constant', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput({ decisionSessionCount: 5 }), 1, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string; label: string }[];
    const skipItem = opts.find((o) => o.value === SKIP_NOW);
    expect(skipItem).toBeDefined();
  });

  it('SKIP_NOW option label differs from its value (styled bold)', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput({ decisionSessionCount: 5 }), 1, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string; label: string }[];
    const skipItem = opts.find((o) => o.value === SKIP_NOW);
    expect(skipItem?.label).not.toBe(SKIP_NOW);
    expect(skipItem?.label).toContain('\x1b[1m'); // bold ANSI escape
  });

  it('SKIP_NOW still resolves as "skip" outcome despite label change', async () => {
    const result = await runDecisionSession(
      makeInput({ decisionSessionCount: 5 }),
      undefined,
      mockSelect(SKIP_NOW),
    );
    expect(result.outcome).toBe('skipped');
  });
});

describe('runDecisionSession — OPT_OUT_SENTINEL handling', () => {
  it('returns skipped outcome when selectFn returns OPT_OUT_SENTINEL', async () => {
    const store = await openStore(':memory:');
    try {
      upsertProject(store, { projectRoot: '/proj/optout', name: 'optout' });
      const result = await runDecisionSession(
        makeInput({ projectRoot: '/proj/optout' }),
        store,
        mockSelect(OPT_OUT_SENTINEL),
      );
      expect(result.outcome).toBe('skipped');
    } finally {
      store.db.close();
    }
  });

  it('writes advisory_frequency:<projectRoot>=off to config on OPT_OUT_SENTINEL', async () => {
    const store = await openStore(':memory:');
    try {
      upsertProject(store, { projectRoot: '/proj/optout2', name: 'optout2' });
      await runDecisionSession(
        makeInput({ projectRoot: '/proj/optout2' }),
        store,
        mockSelect(OPT_OUT_SENTINEL),
      );
      expect(getConfig(store.db, 'advisory_frequency:/proj/optout2')).toBe('off');
    } finally {
      store.db.close();
    }
  });

  it('does NOT record a skipped_sessions row on OPT_OUT_SENTINEL (config change, not a skip)', async () => {
    const store = await openStore(':memory:');
    try {
      upsertProject(store, { projectRoot: '/proj/optout3', name: 'optout3' });
      await runDecisionSession(
        makeInput({ projectRoot: '/proj/optout3' }),
        store,
        mockSelect(OPT_OUT_SENTINEL),
      );
      const rows = getSkippedSessions(store, '/proj/optout3');
      expect(rows).toHaveLength(0);
    } finally {
      store.db.close();
    }
  });
});

describe('runDecisionSession — __FREQ__ sentinel handling', () => {
  it('returns skipped outcome when selectFn returns __FREQ__:major_only', async () => {
    const store = await openStore(':memory:');
    try {
      upsertProject(store, { projectRoot: '/proj/freq', name: 'freq' });
      const result = await runDecisionSession(
        makeInput({ projectRoot: '/proj/freq' }),
        store,
        mockSelect('__FREQ__:major_only'),
      );
      expect(result.outcome).toBe('skipped');
    } finally {
      store.db.close();
    }
  });

  it('writes the chosen frequency to config on __FREQ__:<value>', async () => {
    const store = await openStore(':memory:');
    try {
      upsertProject(store, { projectRoot: '/proj/freq2', name: 'freq2' });
      await runDecisionSession(
        makeInput({ projectRoot: '/proj/freq2' }),
        store,
        mockSelect('__FREQ__:once_per_session'),
      );
      expect(getConfig(store.db, 'advisory_frequency:/proj/freq2')).toBe('once_per_session');
    } finally {
      store.db.close();
    }
  });

  it('writes off when __FREQ__:off is returned', async () => {
    const store = await openStore(':memory:');
    try {
      upsertProject(store, { projectRoot: '/proj/freq3', name: 'freq3' });
      await runDecisionSession(
        makeInput({ projectRoot: '/proj/freq3' }),
        store,
        mockSelect('__FREQ__:off'),
      );
      expect(getConfig(store.db, 'advisory_frequency:/proj/freq3')).toBe('off');
    } finally {
      store.db.close();
    }
  });
});
