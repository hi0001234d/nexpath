import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../telemetry/index.js', () => ({
  writeTelemetry: vi.fn(),
  TELEMETRY_PATH: '/mock/telemetry.jsonl',
}));
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
  TASK_REVIEW_CASUAL,
  IMPLEMENTATION_TO_REVIEW,
  REVIEW_TO_RELEASE,
  BEHAVIOUR_TESTING,
  ABSENCE_TEST_CREATION,
  ABSENCE_TEST_CREATION_CASUAL,
  ABSENCE_REGRESSION_CHECK,
  ABSENCE_REGRESSION_CHECK_CASUAL,
  ABSENCE_SPEC_ACCEPTANCE,
  ABSENCE_SPEC_ACCEPTANCE_CASUAL,
  ABSENCE_CROSS_CONFIRMING,
  ABSENCE_CROSS_CONFIRMING_CASUAL,
} from './options.js';
import {
  ABSENCE_CONTENT_BEGINNER,
  TRANSITION_CONTENT_BEGINNER,
  TASK_REVIEW_BEGINNER,
  ABSENCE_TEST_CREATION_BEGINNER,
  ABSENCE_REGRESSION_CHECK_BEGINNER,
  ABSENCE_SPEC_ACCEPTANCE_BEGINNER,
  ABSENCE_CROSS_CONFIRMING_BEGINNER,
} from './options-beginner.js';
import type { UserProfile } from '../classifier/types.js';
import {
  buildSelectMessage,
  formatPinchLabel,
  formatQuestion,
  formatSubtitle,
  formatOptionLabel,
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
import { writeTelemetry } from '../telemetry/index.js';

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

  it('stage_transition to implementation → TASK_REVIEW_CASUAL (no profile → casual default)', () => {
    // implementation is not in TRANSITION_CONTENT; falls to selectNonBeginnerVariant(undefined) = TASK_REVIEW_CASUAL
    const content = resolveDecisionContent('implementation', 'stage_transition');
    expect(content).toBe(TASK_REVIEW_CASUAL);
  });

  it('stage_transition to idea → TASK_REVIEW_CASUAL (generic fallback, no profile)', () => {
    // idea is not in TRANSITION_CONTENT; falls to selectNonBeginnerVariant(undefined) = TASK_REVIEW_CASUAL
    const content = resolveDecisionContent('idea', 'stage_transition');
    expect(content).toBe(TASK_REVIEW_CASUAL);
  });

  it('stage_transition to feedback_loop → TASK_REVIEW_CASUAL (generic fallback, no profile)', () => {
    const content = resolveDecisionContent('feedback_loop', 'stage_transition');
    expect(content).toBe(TASK_REVIEW_CASUAL);
  });

  it('absence:test_creation → ABSENCE_TEST_CREATION_CASUAL content (no profile, casual default)', () => {
    const content = resolveDecisionContent('implementation', 'absence:test_creation');
    expect(content).toBe(ABSENCE_TEST_CREATION_CASUAL);
  });

  it('absence:regression_check → ABSENCE_REGRESSION_CHECK_CASUAL content (no profile, casual default)', () => {
    const content = resolveDecisionContent('implementation', 'absence:regression_check');
    expect(content).toBe(ABSENCE_REGRESSION_CHECK_CASUAL);
  });

  it('absence:cross_confirming → ABSENCE_CROSS_CONFIRMING_CASUAL content (no profile, casual default)', () => {
    const content = resolveDecisionContent('implementation', 'absence:cross_confirming');
    expect(content).toBe(ABSENCE_CROSS_CONFIRMING_CASUAL);
  });

  it('absence:spec_acceptance_check → ABSENCE_SPEC_ACCEPTANCE_CASUAL content (no profile, casual default)', () => {
    const content = resolveDecisionContent('review_testing', 'absence:spec_acceptance_check');
    expect(content).toBe(ABSENCE_SPEC_ACCEPTANCE_CASUAL);
  });

  it('absence:unknown_signal in implementation → falls back to TASK_REVIEW_CASUAL (no profile)', () => {
    const content = resolveDecisionContent('implementation', 'absence:some_unknown_signal');
    expect(content).toBe(TASK_REVIEW_CASUAL);
  });

  it('absence:unknown_signal in idea stage → falls back to TASK_REVIEW_CASUAL (no profile)', () => {
    // No specific override, 'idea' not in TRANSITION_CONTENT → selectNonBeginnerVariant(undefined) = TASK_REVIEW_CASUAL
    const content = resolveDecisionContent('idea', 'absence:some_signal');
    expect(content).toBe(TASK_REVIEW_CASUAL);
  });

  it('absence:unknown_signal in feedback_loop stage → falls back to TASK_REVIEW_CASUAL (no profile)', () => {
    const content = resolveDecisionContent('feedback_loop', 'absence:some_signal');
    expect(content).toBe(TASK_REVIEW_CASUAL);
  });

  // Priority contract: absence override wins over TRANSITION_CONTENT
  it('absence:test_creation on prd stage → ABSENCE_TEST_CREATION_CASUAL (override wins over IDEA_TO_PRD transition)', () => {
    // Priority 1 (absence override) takes precedence over priority 2 (stage-based transition).
    // 'prd' is in TRANSITION_CONTENT → IDEA_TO_PRD, but absence:test_creation override → ABSENCE_TEST_CREATION_CASUAL (no profile → casual default).
    const content = resolveDecisionContent('prd', 'absence:test_creation');
    expect(content).toBe(ABSENCE_TEST_CREATION_CASUAL);
  });

  it('absence:regression_check on architecture stage → ABSENCE_REGRESSION_CHECK_CASUAL (override wins over PRD_TO_ARCHITECTURE)', () => {
    const content = resolveDecisionContent('architecture', 'absence:regression_check');
    expect(content).toBe(ABSENCE_REGRESSION_CHECK_CASUAL);
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

// ── resolveDecisionContent — heuristic variant routing ───────────────────────

describe('resolveDecisionContent — heuristic variant routing', () => {
  const makeProfile = (nature: 'beginner' | 'cool_geek' | 'pro_geek_soul' | 'hardcore_pro') =>
    ({ nature } as UserProfile);

  it('hardcore_pro → TASK_REVIEW (formal variant)', () => {
    const content = resolveDecisionContent('implementation', 'stage_transition', makeProfile('hardcore_pro'));
    expect(content).toBe(TASK_REVIEW);
  });

  it('cool_geek → TASK_REVIEW_CASUAL (casual variant)', () => {
    const content = resolveDecisionContent('implementation', 'stage_transition', makeProfile('cool_geek'));
    expect(content).toBe(TASK_REVIEW_CASUAL);
  });

  it('pro_geek_soul → TASK_REVIEW_CASUAL (casual variant)', () => {
    const content = resolveDecisionContent('implementation', 'stage_transition', makeProfile('pro_geek_soul'));
    expect(content).toBe(TASK_REVIEW_CASUAL);
  });

  it('beginner → TASK_REVIEW_BEGINNER (beginner variant, unchanged)', () => {
    const content = resolveDecisionContent('implementation', 'stage_transition', makeProfile('beginner'));
    expect(content).toBe(TASK_REVIEW_BEGINNER);
  });

  it('null profile → TASK_REVIEW_CASUAL (safe casual default)', () => {
    const content = resolveDecisionContent('implementation', 'stage_transition', null);
    expect(content).toBe(TASK_REVIEW_CASUAL);
  });

  it('undefined profile → TASK_REVIEW_CASUAL (safe casual default)', () => {
    const content = resolveDecisionContent('implementation', 'stage_transition', undefined);
    expect(content).toBe(TASK_REVIEW_CASUAL);
  });

  it('hardcore_pro generic fallback (non-implementation stage) → TASK_REVIEW', () => {
    const content = resolveDecisionContent('idea', 'stage_transition', makeProfile('hardcore_pro'));
    expect(content).toBe(TASK_REVIEW);
  });

  it('cool_geek still uses beginner absence map — absence:test_creation → ABSENCE_TEST_CREATION_BEGINNER', () => {
    // isVibe=true for cool_geek → absenceMap = ABSENCE_CONTENT_BEGINNER → test_creation → ABSENCE_TEST_CREATION_BEGINNER
    const content = resolveDecisionContent('implementation', 'absence:test_creation', makeProfile('cool_geek'));
    expect(content).toBe(ABSENCE_TEST_CREATION_BEGINNER);
  });

  it('pro_geek_soul + absence:test_creation → ABSENCE_TEST_CREATION_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:test_creation', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_TEST_CREATION_CASUAL);
  });

  it('pro_geek_soul + absence:regression_check → ABSENCE_REGRESSION_CHECK_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:regression_check', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_REGRESSION_CHECK_CASUAL);
  });

  it('pro_geek_soul + absence:spec_acceptance_check → ABSENCE_SPEC_ACCEPTANCE_CASUAL', () => {
    const content = resolveDecisionContent('review_testing', 'absence:spec_acceptance_check', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_SPEC_ACCEPTANCE_CASUAL);
  });

  it('pro_geek_soul + absence:cross_confirming → ABSENCE_CROSS_CONFIRMING_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:cross_confirming', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_CROSS_CONFIRMING_CASUAL);
  });

  it('null profile + absence:test_creation → ABSENCE_TEST_CREATION_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:test_creation', null);
    expect(content).toBe(ABSENCE_TEST_CREATION_CASUAL);
  });

  it('hardcore_pro + absence:test_creation → ABSENCE_TEST_CREATION (formal, not casual)', () => {
    const content = resolveDecisionContent('implementation', 'absence:test_creation', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_TEST_CREATION);
  });

  it('hardcore_pro + absence:regression_check → ABSENCE_REGRESSION_CHECK (formal, not casual)', () => {
    const content = resolveDecisionContent('implementation', 'absence:regression_check', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_REGRESSION_CHECK);
  });

  it('hardcore_pro + absence:spec_acceptance_check → ABSENCE_SPEC_ACCEPTANCE (formal, not casual)', () => {
    const content = resolveDecisionContent('review_testing', 'absence:spec_acceptance_check', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_SPEC_ACCEPTANCE);
  });

  it('hardcore_pro + absence:cross_confirming → ABSENCE_CROSS_CONFIRMING (formal, not casual)', () => {
    const content = resolveDecisionContent('implementation', 'absence:cross_confirming', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_CROSS_CONFIRMING);
  });
});

// ── Content structure validation ──────────────────────────────────────────────

describe('DecisionContent structure', () => {
  const allContent = [
    IDEA_TO_PRD,
    PRD_TO_ARCHITECTURE,
    ARCHITECTURE_TO_TASKS,
    TASK_REVIEW,
    TASK_REVIEW_CASUAL,
    IMPLEMENTATION_TO_REVIEW,
    REVIEW_TO_RELEASE,
    BEHAVIOUR_TESTING,
    ABSENCE_TEST_CREATION,
    ABSENCE_TEST_CREATION_CASUAL,
    ABSENCE_REGRESSION_CHECK,
    ABSENCE_REGRESSION_CHECK_CASUAL,
    ABSENCE_SPEC_ACCEPTANCE,
    ABSENCE_SPEC_ACCEPTANCE_CASUAL,
    ABSENCE_CROSS_CONFIRMING,
    ABSENCE_CROSS_CONFIRMING_CASUAL,
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

  it('TASK_REVIEW_CASUAL has exactly 3 L1, 2 L2, 1 L3 options (same structure as TASK_REVIEW)', () => {
    expect(TASK_REVIEW_CASUAL.L1).toHaveLength(3);
    expect(TASK_REVIEW_CASUAL.L2).toHaveLength(2);
    expect(TASK_REVIEW_CASUAL.L3).toHaveLength(1);
  });

  it('TASK_REVIEW_CASUAL — every option contains "what was just built" (grounding target in all 6)', () => {
    const allOptions = [
      ...TASK_REVIEW_CASUAL.L1,
      ...TASK_REVIEW_CASUAL.L2,
      ...TASK_REVIEW_CASUAL.L3,
    ];
    expect(allOptions).toHaveLength(6);
    for (const opt of allOptions) {
      expect(opt).toContain('what was just built');
    }
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

  it('ABSENCE_TEST_CREATION has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_TEST_CREATION.L1).toHaveLength(3);
    expect(ABSENCE_TEST_CREATION.L2).toHaveLength(2);
    expect(ABSENCE_TEST_CREATION.L3).toHaveLength(1);
  });

  it('ABSENCE_TEST_CREATION_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_TEST_CREATION_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_TEST_CREATION_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_TEST_CREATION_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_REGRESSION_CHECK has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_REGRESSION_CHECK.L1).toHaveLength(3);
    expect(ABSENCE_REGRESSION_CHECK.L2).toHaveLength(2);
    expect(ABSENCE_REGRESSION_CHECK.L3).toHaveLength(1);
  });

  it('ABSENCE_REGRESSION_CHECK_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_REGRESSION_CHECK_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_REGRESSION_CHECK_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_REGRESSION_CHECK_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_SPEC_ACCEPTANCE has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SPEC_ACCEPTANCE.L1).toHaveLength(3);
    expect(ABSENCE_SPEC_ACCEPTANCE.L2).toHaveLength(2);
    expect(ABSENCE_SPEC_ACCEPTANCE.L3).toHaveLength(1);
  });

  it('ABSENCE_SPEC_ACCEPTANCE_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SPEC_ACCEPTANCE_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_SPEC_ACCEPTANCE_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_SPEC_ACCEPTANCE_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_CROSS_CONFIRMING has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_CROSS_CONFIRMING.L1).toHaveLength(3);
    expect(ABSENCE_CROSS_CONFIRMING.L2).toHaveLength(2);
    expect(ABSENCE_CROSS_CONFIRMING.L3).toHaveLength(1);
  });

  it('ABSENCE_CROSS_CONFIRMING_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_CROSS_CONFIRMING_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_CROSS_CONFIRMING_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_CROSS_CONFIRMING_CASUAL.L3).toHaveLength(1);
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

  it('value and label are equal for every non-separator, non-SKIP_NOW, non-SHOW_SIMPLER option (content prompts are pre-filled)', () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    return runLevel(makeInput(), 1, spy).then(() => {
      const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string; label: string }[];
      const realOpts = opts.filter(
        (o) => !o.value.startsWith(OPTION_SEPARATOR) && o.value !== SKIP_NOW && o.value !== SHOW_SIMPLER,
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
  it('injects help item at bottom of options when decisionSessionCount < 3', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput({ decisionSessionCount: 0 }), 1, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string; label: string }[];
    const helpItem = opts.find((o) => o.value === `${OPTION_SEPARATOR}help`);
    expect(helpItem).toBeDefined();
    expect(helpItem?.label).toContain('Ctrl+X');
    expect(helpItem?.label).toContain('Ctrl+T');
  });

  it('does NOT inject help item when decisionSessionCount >= 3', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput({ decisionSessionCount: 3 }), 1, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string; label: string }[];
    const helpItem = opts.find((o) => o.value === `${OPTION_SEPARATOR}help`);
    expect(helpItem).toBeUndefined();
  });

  it('help item has non-empty styled label', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput({ decisionSessionCount: 1 }), 1, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string; label: string }[];
    const helpItem = opts.find((o) => o.value === `${OPTION_SEPARATOR}help`);
    expect(helpItem?.label.trim().length).toBeGreaterThan(0);
  });

  it('help item is preceded by 2 blank separator lines', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput({ decisionSessionCount: 0 }), 1, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string; label: string }[];
    const helpIdx = opts.findIndex((o) => o.value === `${OPTION_SEPARATOR}help`);
    expect(helpIdx).toBeGreaterThanOrEqual(2);
    expect(opts[helpIdx - 1]?.label).toBe('');
    expect(opts[helpIdx - 2]?.label).toBe('');
  });

  it('help hint is NOT in message header', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput({ decisionSessionCount: 0 }), 1, spy as SelectFn);
    const msg = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].message as string;
    expect(msg).not.toContain('Ctrl+X');
    expect(msg).not.toContain('Ctrl+T');
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

  it('SKIP_NOW option label is plain text and differs from its value', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput({ decisionSessionCount: 5 }), 1, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string; label: string }[];
    const skipItem = opts.find((o) => o.value === SKIP_NOW);
    expect(skipItem?.label).not.toBe(SKIP_NOW);
    expect(skipItem?.label).toContain('Skip for now');
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

// ── generatedOptions — runLevel and runDecisionSession ────────────────────────

describe('runLevel — generatedOptions wiring', () => {
  const GEN_L1 = ['[adapted] Do a quick spec review before continuing', '[adapted] Run the test suite now', '[adapted] Cross-check your task list'];
  const GEN_L2 = ['[adapted] Verify coverage on the happy path', '[adapted] Check the edge cases'];
  const GEN_L3 = ['[adapted] What one thing could break this?'];

  const generatedOptions = { l1: GEN_L1, l2: GEN_L2, l3: GEN_L3 };

  it('uses generated L1 options (not static) when generatedOptions is provided', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput({ generatedOptions }), 1, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string }[];
    const values = opts.map((o) => o.value);
    expect(values).toContain(GEN_L1[0]);
    expect(values).toContain(GEN_L1[1]);
    expect(values).toContain(GEN_L1[2]);
  });

  it('does NOT include static L1 options when generated options are provided', async () => {
    const staticContent = resolveDecisionContent('implementation', 'stage_transition');
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput({ generatedOptions }), 1, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string }[];
    const values = opts.map((o) => o.value);
    for (const staticOpt of staticContent.L1) {
      expect(values).not.toContain(staticOpt);
    }
  });

  it('uses generated L2 options at level 2', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput({ generatedOptions }), 2, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string }[];
    const values = opts.map((o) => o.value);
    expect(values).toContain(GEN_L2[0]);
    expect(values).toContain(GEN_L2[1]);
  });

  it('uses generated L3 options at level 3', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput({ generatedOptions }), 3, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string }[];
    const values = opts.map((o) => o.value);
    expect(values).toContain(GEN_L3[0]);
  });

  it('question line in message is always from static content, not from generatedOptions', async () => {
    const staticContent = resolveDecisionContent('implementation', 'stage_transition');
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput({ generatedOptions }), 1, spy as SelectFn);
    const msg = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].message as string;
    expect(msg).toContain(staticContent.question);
  });

  it('selecting a generated L1 option returns that option text', async () => {
    const result = await runLevel(makeInput({ generatedOptions }), 1, mockSelect(GEN_L1[0]));
    expect(result).toBe(GEN_L1[0]);
  });

  it('selecting a generated L3 option returns that option text', async () => {
    const result = await runLevel(makeInput({ generatedOptions }), 3, mockSelect(GEN_L3[0]));
    expect(result).toBe(GEN_L3[0]);
  });

  it('SHOW_SIMPLER and SKIP_NOW are still present alongside generated options at level 1', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput({ generatedOptions }), 1, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string }[];
    const values = opts.map((o) => o.value);
    expect(values).toContain(SHOW_SIMPLER);
    expect(values).toContain(SKIP_NOW);
  });

  it('uses static options when generatedOptions is undefined', async () => {
    const staticContent = resolveDecisionContent('implementation', 'stage_transition');
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput({ generatedOptions: undefined }), 1, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string }[];
    const values = opts.map((o) => o.value);
    expect(values).toContain(staticContent.L1[0]);
  });
});

describe('runDecisionSession — generatedOptions wiring', () => {
  const GEN_L1 = ['[adapted] Do a quick spec review before continuing', '[adapted] Run the test suite now', '[adapted] Cross-check your task list'];
  const GEN_L2 = ['[adapted] Verify coverage on the happy path', '[adapted] Check the edge cases'];
  const GEN_L3 = ['[adapted] What one thing could break this?'];
  const generatedOptions = { l1: GEN_L1, l2: GEN_L2, l3: GEN_L3 };

  it('returns selected outcome with generated option text when user picks generated L1 option', async () => {
    const result = await runDecisionSession(makeInput({ generatedOptions }), undefined, mockSelect(GEN_L1[0]));
    expect(result.outcome).toBe('selected');
    if (result.outcome === 'selected') {
      expect(result.selectedPrompt).toBe(GEN_L1[0]);
    }
  });

  it('advances to L2 and returns generated L2 option text', async () => {
    const selectFn = vi.fn()
      .mockResolvedValueOnce(SHOW_SIMPLER)
      .mockResolvedValueOnce(GEN_L2[0]);
    const result = await runDecisionSession(makeInput({ generatedOptions }), undefined, selectFn as SelectFn);
    expect(result.outcome).toBe('selected');
    if (result.outcome === 'selected') {
      expect(result.selectedPrompt).toBe(GEN_L2[0]);
    }
  });

  it('advances to L3 and returns generated L3 option text', async () => {
    const selectFn = vi.fn()
      .mockResolvedValueOnce(SHOW_SIMPLER)
      .mockResolvedValueOnce(SHOW_SIMPLER)
      .mockResolvedValueOnce(GEN_L3[0]);
    const result = await runDecisionSession(makeInput({ generatedOptions }), undefined, selectFn as SelectFn);
    expect(result.outcome).toBe('selected');
    if (result.outcome === 'selected') {
      expect(result.selectedPrompt).toBe(GEN_L3[0]);
    }
  });

  it('skip still works normally when generatedOptions is provided', async () => {
    const result = await runDecisionSession(makeInput({ generatedOptions }), undefined, mockSelect(SKIP_NOW));
    expect(result.outcome).toBe('skipped');
  });
});

// ── C-02: resolveDecisionContent — profile routing ────────────────────────────

describe('resolveDecisionContent — C-02 profile routing', () => {
  const beginnerProfile = { nature: 'beginner' as const, precisionScore: 2, playfulnessScore: 2, precisionOrdinal: 'low' as const, playfulnessOrdinal: 'low' as const, mood: 'casual' as const, depth: 'low' as const, depthScore: 1, computedAt: 0 };
  const coolGeekProfile = { nature: 'cool_geek' as const, precisionScore: 3, playfulnessScore: 8, precisionOrdinal: 'low' as const, playfulnessOrdinal: 'high' as const, mood: 'casual' as const, depth: 'medium' as const, depthScore: 5, computedAt: 0 };
  const hardcoreProProfile = { nature: 'hardcore_pro' as const, precisionScore: 9, playfulnessScore: 2, precisionOrdinal: 'very_high' as const, playfulnessOrdinal: 'low' as const, mood: 'focused' as const, depth: 'high' as const, depthScore: 9, computedAt: 0 };

  it('beginner profile + stage_transition to prd → IDEA_TO_PRD_BEGINNER', () => {
    const content = resolveDecisionContent('prd', 'stage_transition', beginnerProfile);
    expect(content).toBe(TRANSITION_CONTENT_BEGINNER.prd);
  });

  it('cool_geek profile routes to same beginner path as beginner', () => {
    const content = resolveDecisionContent('prd', 'stage_transition', coolGeekProfile);
    expect(content).toBe(TRANSITION_CONTENT_BEGINNER.prd);
  });

  it('hardcore_pro profile → existing pro content (IDEA_TO_PRD)', () => {
    const content = resolveDecisionContent('prd', 'stage_transition', hardcoreProProfile);
    expect(content).toBe(IDEA_TO_PRD);
  });

  it('null profile → pro path', () => {
    const content = resolveDecisionContent('prd', 'stage_transition', null);
    expect(content).toBe(IDEA_TO_PRD);
  });

  it('undefined profile → pro path (existing callers unaffected)', () => {
    const content = resolveDecisionContent('prd', 'stage_transition');
    expect(content).toBe(IDEA_TO_PRD);
  });

  it('beginner + absence:behaviour_testing → BEHAVIOUR_TESTING_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:behaviour_testing', beginnerProfile);
    expect(content).toBe(ABSENCE_CONTENT_BEGINNER.behaviour_testing);
  });

  it('beginner + absence:cross_confirming → ABSENCE_CROSS_CONFIRMING_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:cross_confirming', beginnerProfile);
    expect(content).toBe(ABSENCE_CROSS_CONFIRMING_BEGINNER);
  });

  it('beginner + absence:unknown_signal + implementation → TASK_REVIEW_BEGINNER fallback', () => {
    const content = resolveDecisionContent('implementation', 'absence:unknown_signal', beginnerProfile);
    expect(content).toBe(TASK_REVIEW_BEGINNER);
  });

  it('beginner + stage_transition to architecture → PRD_TO_ARCHITECTURE_BEGINNER', () => {
    const content = resolveDecisionContent('architecture', 'stage_transition', beginnerProfile);
    expect(content).toBe(TRANSITION_CONTENT_BEGINNER.architecture);
  });

  it('beginner + stage_transition to task_breakdown → ARCHITECTURE_TO_TASKS_BEGINNER', () => {
    const content = resolveDecisionContent('task_breakdown', 'stage_transition', beginnerProfile);
    expect(content).toBe(TRANSITION_CONTENT_BEGINNER.task_breakdown);
  });

  it('beginner + stage_transition to review_testing → IMPLEMENTATION_TO_REVIEW_BEGINNER', () => {
    const content = resolveDecisionContent('review_testing', 'stage_transition', beginnerProfile);
    expect(content).toBe(TRANSITION_CONTENT_BEGINNER.review_testing);
  });

  it('beginner + stage_transition to release → REVIEW_TO_RELEASE_BEGINNER', () => {
    const content = resolveDecisionContent('release', 'stage_transition', beginnerProfile);
    expect(content).toBe(TRANSITION_CONTENT_BEGINNER.release);
  });
});

// ── C-02: options-beginner.ts per-block structure assertions ──────────────────

describe('C-02: beginner content blocks structure', () => {
  const blocks = [
    { name: 'IDEA_TO_PRD_BEGINNER',               content: TRANSITION_CONTENT_BEGINNER.prd! },
    { name: 'PRD_TO_ARCHITECTURE_BEGINNER',        content: TRANSITION_CONTENT_BEGINNER.architecture! },
    { name: 'ARCHITECTURE_TO_TASKS_BEGINNER',      content: TRANSITION_CONTENT_BEGINNER.task_breakdown! },
    { name: 'TASK_REVIEW_BEGINNER',                content: TASK_REVIEW_BEGINNER },
    { name: 'IMPLEMENTATION_TO_REVIEW_BEGINNER',   content: TRANSITION_CONTENT_BEGINNER.review_testing! },
    { name: 'REVIEW_TO_RELEASE_BEGINNER',          content: TRANSITION_CONTENT_BEGINNER.release! },
    { name: 'BEHAVIOUR_TESTING_BEGINNER',          content: ABSENCE_CONTENT_BEGINNER.behaviour_testing! },
    { name: 'ABSENCE_TEST_CREATION_BEGINNER',      content: ABSENCE_TEST_CREATION_BEGINNER },
    { name: 'ABSENCE_REGRESSION_CHECK_BEGINNER',   content: ABSENCE_REGRESSION_CHECK_BEGINNER },
    { name: 'ABSENCE_SPEC_ACCEPTANCE_BEGINNER',    content: ABSENCE_SPEC_ACCEPTANCE_BEGINNER },
    { name: 'ABSENCE_CROSS_CONFIRMING_BEGINNER',   content: ABSENCE_CROSS_CONFIRMING_BEGINNER },
  ];

  for (const { name, content } of blocks) {
    it(`${name}: L1.length === 2`, () => {
      expect(content.L1).toHaveLength(2);
    });
    it(`${name}: L2.length === 1`, () => {
      expect(content.L2).toHaveLength(1);
    });
    it(`${name}: L3.length === 1`, () => {
      expect(content.L3).toHaveLength(1);
    });
    it(`${name}: L1[0] contains \\n (numbered steps)`, () => {
      expect(content.L1[0]).toContain('\n');
    });
  }
});

// ── W-05: formatOptionLabel + clack-path label styling ────────────────────────

describe('W-05: formatOptionLabel', () => {
  it('returns unchanged string when no \\n present', () => {
    expect(formatOptionLabel('Simple option text')).toBe('Simple option text');
  });

  it('prefixes continuation lines with \\n│    when \\n present', () => {
    const result = formatOptionLabel('Line 1\nLine 2\nLine 3');
    expect(result).toBe('Line 1\n│    Line 2\n│    Line 3');
  });

  it('handles a single \\n correctly', () => {
    const result = formatOptionLabel('First\nSecond');
    expect(result).toBe('First\n│    Second');
  });
});

describe('W-05: clack-path label styling', () => {
  const DIM_GRAY = '\x1b[2m';
  const RESET    = '\x1b[0m';
  const BOLD     = '\x1b[1m';

  it('SHOW_SIMPLER item gets DIM_GRAY styled label in clackOptions', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput(), 1, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string; label: string }[];
    const showSimplerOpt = opts.find((o) => o.value === SHOW_SIMPLER);
    expect(showSimplerOpt).toBeDefined();
    expect(showSimplerOpt!.label).toContain(DIM_GRAY);
    expect(showSimplerOpt!.label).toContain('Show simpler options');
  });

  it('SHOW_SIMPLER label is NOT the raw string (has styling)', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput(), 1, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string; label: string }[];
    const showSimplerOpt = opts.find((o) => o.value === SHOW_SIMPLER);
    expect(showSimplerOpt).toBeDefined();
    expect(showSimplerOpt!.label).not.toBe(SHOW_SIMPLER);
  });

  it('SKIP_NOW item gets BOLD+DIM_GRAY styled label in clackOptions', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput(), 1, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string; label: string }[];
    const skipNowOpt = opts.find((o) => o.value === SKIP_NOW);
    expect(skipNowOpt).toBeDefined();
    expect(skipNowOpt!.label).toContain(BOLD);
    expect(skipNowOpt!.label).toContain(DIM_GRAY);
    expect(skipNowOpt!.label).toContain('Skip for now');
  });

  it('multi-line option text (via generatedOptions) gets label with \\n│    prefix on continuation lines', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    const multiLineL1 = ['1. Step one\n2. Step two\n3. Step three', 'Short lighter option'];
    const input = makeInput({ generatedOptions: { l1: multiLineL1, l2: ['L2 opt'], l3: ['L3 opt'] } });
    await runLevel(input, 1, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string; label: string }[];
    const multiLineOpt = opts.find((o) => o.label.includes('\n│    '));
    expect(multiLineOpt).toBeDefined();
    expect(multiLineOpt!.label).toBe('1. Step one\n│    2. Step two\n│    3. Step three');
  });
});

// ── DecisionSession — telemetry events ────────────────────────────────────────

describe('runDecisionSession — telemetry: decision_session_started', () => {
  beforeEach(() => { vi.mocked(writeTelemetry).mockClear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('emits decision_session_started with flagType, stage, pinchLabel, sessionId', async () => {
    await runDecisionSession(makeInput(), undefined, mockSelect(SKIP_NOW));
    expect(writeTelemetry).toHaveBeenCalledWith(
      '/test/project',
      'decision_session_started',
      expect.objectContaining({
        flagType:   'stage_transition',
        stage:      'implementation',
        pinchLabel: 'Hold up.',
        sessionId:  'session-test',
      }),
    );
  });

  it('emits decision_session_started even when no store is provided', async () => {
    await runDecisionSession(makeInput(), undefined, mockSelect(SKIP_NOW));
    expect(writeTelemetry).toHaveBeenCalledWith(
      '/test/project',
      'decision_session_started',
      expect.any(Object),
    );
  });
});

describe('runLevel — NEXPATH_SIM=1 support', () => {
  beforeEach(() => { vi.mocked(writeTelemetry).mockClear(); });
  afterEach(() => {
    delete process.env['NEXPATH_SIM'];
    vi.restoreAllMocks();
  });

  it('auto-selects first content option without calling selectFn when NEXPATH_SIM=1', async () => {
    process.env['NEXPATH_SIM'] = '1';
    const selectFn = vi.fn();
    const content = resolveDecisionContent('implementation', 'stage_transition');
    const result = await runLevel(makeInput(), 1, selectFn as SelectFn);
    expect(selectFn).not.toHaveBeenCalled();
    expect(result).toBe(content.L1[0]);
  }, 2000);

  it('emits decision_session_sim_dismissed with level and autoSelectedText when NEXPATH_SIM=1', async () => {
    process.env['NEXPATH_SIM'] = '1';
    await runLevel(makeInput(), 1, vi.fn() as SelectFn);
    expect(writeTelemetry).toHaveBeenCalledWith(
      '/test/project',
      'decision_session_sim_dismissed',
      expect.objectContaining({
        level: 1,
        autoSelectedText: expect.any(String),
      }),
    );
  }, 2000);

  it('calls selectFn normally when NEXPATH_SIM is not set', async () => {
    const selectFn = mockSelect(SKIP_NOW);
    await runLevel(makeInput(), 1, selectFn);
    expect(selectFn).toHaveBeenCalledTimes(1);
  });
});
