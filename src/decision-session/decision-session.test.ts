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
  RELEASE_TO_FEEDBACK,
  BEHAVIOUR_TESTING,
  BEHAVIOUR_TESTING_CASUAL,
  ABSENCE_TEST_CREATION,
  ABSENCE_TEST_CREATION_CASUAL,
  ABSENCE_REGRESSION_CHECK,
  ABSENCE_REGRESSION_CHECK_CASUAL,
  ABSENCE_SPEC_ACCEPTANCE,
  ABSENCE_SPEC_ACCEPTANCE_CASUAL,
  ABSENCE_CROSS_CONFIRMING,
  ABSENCE_CROSS_CONFIRMING_CASUAL,
  ABSENCE_SECURITY_CHECK,
  ABSENCE_SECURITY_CHECK_CASUAL,
  ABSENCE_ERROR_HANDLING,
  ABSENCE_ERROR_HANDLING_CASUAL,
  ABSENCE_DOCUMENTATION,
  ABSENCE_DOCUMENTATION_CASUAL,
  ABSENCE_OBSERVABILITY,
  ABSENCE_OBSERVABILITY_CASUAL,
  ABSENCE_COMPREHENSION,
  ABSENCE_COMPREHENSION_CASUAL,
  ABSENCE_REFACTORING,
  ABSENCE_REFACTORING_CASUAL,
  ABSENCE_NO_PUSHBACK,
  ABSENCE_NO_PUSHBACK_CASUAL,
  ABSENCE_CORRECTION_SEEKING,
  ABSENCE_CORRECTION_SEEKING_CASUAL,
  ABSENCE_PROBLEM_CORRECTION,
  ABSENCE_PROBLEM_CORRECTION_CASUAL,
  ABSENCE_ALTERNATIVES,
  ABSENCE_ALTERNATIVES_CASUAL,
  ABSENCE_ARCH_CONFLICT,
  ABSENCE_ARCH_CONFLICT_CASUAL,
  ABSENCE_PROMPT_CONTEXT,
  ABSENCE_PROMPT_CONTEXT_CASUAL,
  ABSENCE_ROLLBACK_PLANNING,
  ABSENCE_ROLLBACK_PLANNING_CASUAL,
  ABSENCE_DEPLOYMENT_PLANNING,
  ABSENCE_DEPLOYMENT_PLANNING_CASUAL,
  ABSENCE_DEPENDENCY_MGMT,
  ABSENCE_DEPENDENCY_MGMT_CASUAL,
  ABSENCE_PHASE_TRANSITION,
  ABSENCE_PHASE_TRANSITION_CASUAL,
  ABSENCE_SPEC_CROSS_CONFIRM,
  ABSENCE_SPEC_CROSS_CONFIRM_CASUAL,
  ABSENCE_SPEC_REVISION,
  ABSENCE_SPEC_REVISION_CASUAL,
  ABSENCE_IDEA_SCOPING,
  ABSENCE_IDEA_SCOPING_CASUAL,
  ABSENCE_IDEA_CONSTRAINT_CHECK,
  ABSENCE_IDEA_CONSTRAINT_CHECK_CASUAL,
  ABSENCE_IDEA_USER_DEFINITION,
  ABSENCE_IDEA_USER_DEFINITION_CASUAL,
  ABSENCE_TASK_ORDERING,
  ABSENCE_TASK_ORDERING_CASUAL,
  ABSENCE_TASK_SIZING,
  ABSENCE_TASK_SIZING_CASUAL,
  ABSENCE_TASK_DEFINITION_OF_DONE,
  ABSENCE_TASK_DEFINITION_OF_DONE_CASUAL,
  ABSENCE_USER_FEEDBACK_REVIEW,
  ABSENCE_USER_FEEDBACK_REVIEW_CASUAL,
  ABSENCE_ITERATION_PLANNING,
  ABSENCE_ITERATION_PLANNING_CASUAL,
  ABSENCE_SCOPE_CREEP,
  ABSENCE_SCOPE_CREEP_CASUAL,
  ABSENCE_CONTEXT_LOSS,
  ABSENCE_CONTEXT_LOSS_CASUAL,
  ABSENCE_API_DESIGN_REVIEW,
  ABSENCE_API_DESIGN_REVIEW_CASUAL,
  ABSENCE_ACCESSIBILITY,
  ABSENCE_ACCESSIBILITY_CASUAL,
  ABSENCE_ENV_AND_SECRETS,
  ABSENCE_ENV_AND_SECRETS_CASUAL,
  ABSENCE_DATA_VALIDATION,
  ABSENCE_DATA_VALIDATION_CASUAL,
  ABSENCE_CI_PIPELINE,
  ABSENCE_CI_PIPELINE_CASUAL,
  ABSENCE_RATE_LIMITING,
  ABSENCE_RATE_LIMITING_CASUAL,
  ABSENCE_FEATURE_SCOPE,
  ABSENCE_FEATURE_SCOPE_CASUAL,
  ABSENCE_IMPLEMENTATION_CHECKPOINT,
  ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL,
  ABSENCE_SPEC_BEFORE_CODE,
  ABSENCE_SPEC_BEFORE_CODE_CASUAL,
  ABSENCE_INCREMENTAL_BUILD,
  ABSENCE_INCREMENTAL_BUILD_CASUAL,
  ABSENCE_FEATURE_COMPLETION_CHECK_CASUAL,
  ABSENCE_FINISHING_LINE_AWARENESS_CASUAL,
  ABSENCE_POLISH_VS_FUNCTION_CASUAL,
  ABSENCE_MVP_SCOPE_DISCIPLINE_CASUAL,
  ABSENCE_IDEA_TO_SPEC_BRIDGE_CASUAL,
  ABSENCE_DEMO_VS_PRODUCT_CASUAL,
  ABSENCE_USER_JOURNEY_CHECK_CASUAL,
  ABSENCE_TECHNICAL_SPIKE_TREATMENT_CASUAL,
  ABSENCE_DEPENDENCY_ADVENTURE_CASUAL,
  ABSENCE_RESTART_IMPULSE_CHECK_CASUAL,
  ABSENCE_CREATIVE_VS_CORE_RATIO_CASUAL,
  ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL,
  ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL,
  ABSENCE_TEST_DEPTH_CHECK_CASUAL,
  ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL,
  ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL,
  ABSENCE_SECURITY_REVIEW_GAP_CASUAL,
  ABSENCE_API_CONTRACT_DEFINITION_CASUAL,
  ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL,
  ABSENCE_REFACTORING_CHECKPOINT_CASUAL,
  ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL,
  ABSENCE_SELF_REVIEW_HABIT_CASUAL,
  ABSENCE_PERFORMANCE_AWARENESS_CASUAL,
  ABSENCE_DECISION_RECORD_ABSENCE_FORMAL,
  ABSENCE_OVER_ENGINEERING_CHECK_FORMAL,
  ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL,
  ABSENCE_OBSERVABILITY_FIRST_FORMAL,
  ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL,
  ABSENCE_CONTRACT_TESTING_GAP_FORMAL,
  ABSENCE_CAPACITY_PLANNING_GAP_FORMAL,
  ABSENCE_SECURITY_THREAT_MODELING_FORMAL,
  ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL,
  ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL,
  ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL,
  ABSENCE_SLO_DEFINITION_GAP_FORMAL,
  ABSENCE_USER_VALUE_CHECK_CASUAL,
  ABSENCE_OUTCOME_DEFINITION_CASUAL,
  ABSENCE_FEATURE_PRIORITIZATION_CASUAL,
  ABSENCE_USER_PERSONA_CLARITY_CASUAL,
  ABSENCE_COMPETITIVE_AWARENESS_CASUAL,
  ABSENCE_MVP_BOUNDARY_DISCIPLINE_CASUAL,
  ABSENCE_USER_ACQUISITION_CONSIDERATION_CASUAL,
  ABSENCE_RETENTION_MECHANISM_CHECK_CASUAL,
  ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT_CASUAL,
  ABSENCE_HYPOTHESIS_BEFORE_BUILD_CASUAL,
  ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE_CASUAL,
  ABSENCE_NORTH_STAR_ALIGNMENT_CASUAL,
  ABSENCE_TIME_TO_VALUE_CHECK_CASUAL,
  ABSENCE_SHIP_READINESS_DEFINITION_CASUAL,
  ABSENCE_MANUAL_BEFORE_AUTOMATE_CASUAL,
  ABSENCE_TECH_STACK_COMPLEXITY_CHECK_CASUAL,
  ABSENCE_LAUNCH_STRATEGY_ABSENCE_CASUAL,
  ABSENCE_EARLY_USER_FEEDBACK_CASUAL,
  ABSENCE_SOLO_MAINTAINABILITY_CASUAL,
  ABSENCE_DISTRIBUTION_THINKING_CASUAL,
  ABSENCE_MONETIZATION_PATH_CLARITY_CASUAL,
  ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY_CASUAL,
  ABSENCE_SCOPE_VS_TIME_CHECK_CASUAL,
  ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_FORMAL,
  ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_FORMAL,
  ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_FORMAL,
  ABSENCE_DEPENDENCY_MAPPING_FORMAL,
  ABSENCE_DEFINITION_OF_DONE_FORMAL,
  ABSENCE_CROSS_TEAM_IMPACT_CHECK_FORMAL,
  ABSENCE_SUCCESS_METRIC_DEFINITION_FORMAL,
  ABSENCE_PRIORITY_JUSTIFICATION_FORMAL,
  ABSENCE_USER_STORY_COMPLETENESS_FORMAL,
  ABSENCE_RISK_FLAG_FORMAL,
  ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_FORMAL,
  ABSENCE_RETROSPECTIVE_HABIT_FORMAL,
  ABSENCE_DECISION_FATIGUE_PATTERN_CASUAL,
  ABSENCE_WORK_RHYTHM_CHECK_CASUAL,
  ABSENCE_FOCUS_DRIFT_DETECTION_CASUAL,
  ABSENCE_SESSION_LENGTH_CHECKPOINT_CASUAL,
  ABSENCE_PROGRESS_CONSOLIDATION_GAP_CASUAL,
  ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL,
  ABSENCE_WORK_RHYTHM_CHECK_FORMAL,
  ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL,
  ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL,
  ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL,
} from './options.js';
import {
  ABSENCE_CONTENT_BEGINNER,
  TRANSITION_CONTENT_BEGINNER,
  TASK_REVIEW_BEGINNER,
  ABSENCE_TEST_CREATION_BEGINNER,
  ABSENCE_REGRESSION_CHECK_BEGINNER,
  ABSENCE_SPEC_ACCEPTANCE_BEGINNER,
  ABSENCE_CROSS_CONFIRMING_BEGINNER,
  ABSENCE_SECURITY_CHECK_BEGINNER,
  ABSENCE_ERROR_HANDLING_BEGINNER,
  ABSENCE_DOCUMENTATION_BEGINNER,
  ABSENCE_OBSERVABILITY_BEGINNER,
  ABSENCE_COMPREHENSION_BEGINNER,
  ABSENCE_REFACTORING_BEGINNER,
  ABSENCE_NO_PUSHBACK_BEGINNER,
  ABSENCE_CORRECTION_SEEKING_BEGINNER,
  ABSENCE_PROBLEM_CORRECTION_BEGINNER,
  ABSENCE_ALTERNATIVES_BEGINNER,
  ABSENCE_ARCH_CONFLICT_BEGINNER,
  ABSENCE_PROMPT_CONTEXT_BEGINNER,
  ABSENCE_ROLLBACK_PLANNING_BEGINNER,
  ABSENCE_DEPLOYMENT_PLANNING_BEGINNER,
  ABSENCE_DEPENDENCY_MGMT_BEGINNER,
  ABSENCE_PHASE_TRANSITION_BEGINNER,
  ABSENCE_SPEC_CROSS_CONFIRM_BEGINNER,
  ABSENCE_SPEC_REVISION_BEGINNER,
  ABSENCE_IDEA_SCOPING_BEGINNER,
  ABSENCE_IDEA_CONSTRAINT_CHECK_BEGINNER,
  ABSENCE_IDEA_USER_DEFINITION_BEGINNER,
  ABSENCE_TASK_ORDERING_BEGINNER,
  ABSENCE_TASK_SIZING_BEGINNER,
  ABSENCE_TASK_DEFINITION_OF_DONE_BEGINNER,
  ABSENCE_USER_FEEDBACK_REVIEW_BEGINNER,
  ABSENCE_ITERATION_PLANNING_BEGINNER,
  ABSENCE_SCOPE_CREEP_BEGINNER,
  ABSENCE_CONTEXT_LOSS_BEGINNER,
  ABSENCE_API_DESIGN_REVIEW_BEGINNER,
  ABSENCE_ACCESSIBILITY_BEGINNER,
  ABSENCE_ENV_AND_SECRETS_BEGINNER,
  ABSENCE_DATA_VALIDATION_BEGINNER,
  ABSENCE_CI_PIPELINE_BEGINNER,
  ABSENCE_RATE_LIMITING_BEGINNER,
  ABSENCE_FEATURE_SCOPE_BEGINNER,
  ABSENCE_IMPLEMENTATION_CHECKPOINT_BEGINNER,
  ABSENCE_SPEC_BEFORE_CODE_BEGINNER,
  ABSENCE_INCREMENTAL_BUILD_BEGINNER,
  ABSENCE_ERROR_UNDERSTANDING_BEGINNER,
  ABSENCE_DOCUMENTATION_BEFORE_ASK_BEGINNER,
  ABSENCE_OUTPUT_VERIFICATION_BEGINNER,
  ABSENCE_REQUIREMENT_CLARITY_BEGINNER,
  ABSENCE_COPY_PASTE_AWARENESS_BEGINNER,
  ABSENCE_DEBUGGING_OBSERVATION_BEGINNER,
  ABSENCE_LEARNING_CONSOLIDATION_BEGINNER,
  ABSENCE_SIMPLE_SOLUTION_FIRST_BEGINNER,
  ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER,
  ABSENCE_ROLLBACK_AWARENESS_BEGINNER,
  ABSENCE_BUILD_VS_UNDERSTAND_RATIO_BEGINNER,
  ABSENCE_DECISION_FATIGUE_PATTERN_BEGINNER,
  ABSENCE_WORK_RHYTHM_CHECK_BEGINNER,
  ABSENCE_FOCUS_DRIFT_DETECTION_BEGINNER,
  ABSENCE_SESSION_LENGTH_CHECKPOINT_BEGINNER,
  ABSENCE_PROGRESS_CONSOLIDATION_GAP_BEGINNER,
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

  // ── BEHAVIOUR_TESTING_CASUAL buildOptionList at all 3 levels (sub-6) ─────────

  it('BEHAVIOUR_TESTING_CASUAL L1 has exactly 5 options (3 content + Show simpler + Skip)', () => {
    const { options, hasNextLevel } = buildOptionList(BEHAVIOUR_TESTING_CASUAL, 1);
    expect(options).toHaveLength(5);
    expect(hasNextLevel).toBe(true);
    expect(options.at(-1)).toBe(SKIP_NOW);
    expect(options.at(-2)).toBe(SHOW_SIMPLER);
  });

  it('BEHAVIOUR_TESTING_CASUAL L2 has exactly 4 options (2 content + Show simpler + Skip)', () => {
    const { options, hasNextLevel } = buildOptionList(BEHAVIOUR_TESTING_CASUAL, 2);
    expect(options).toHaveLength(4);
    expect(hasNextLevel).toBe(true);
    expect(options.at(-1)).toBe(SKIP_NOW);
    expect(options.at(-2)).toBe(SHOW_SIMPLER);
  });

  it('BEHAVIOUR_TESTING_CASUAL L3 has exactly 2 options (1 content + Skip, no Show simpler)', () => {
    const { options, hasNextLevel } = buildOptionList(BEHAVIOUR_TESTING_CASUAL, 3);
    expect(options).toHaveLength(2);
    expect(hasNextLevel).toBe(false);
    expect(options.at(-1)).toBe(SKIP_NOW);
    expect(options).not.toContain(SHOW_SIMPLER);
  });

  it('BEHAVIOUR_TESTING_CASUAL L1 first option is the end-to-end user flow prompt', () => {
    const { options } = buildOptionList(BEHAVIOUR_TESTING_CASUAL, 1);
    expect(options[0]).toContain('go through');
  });

  it('BEHAVIOUR_TESTING_CASUAL L3 only option mentions breaking or trying by hand', () => {
    const { options } = buildOptionList(BEHAVIOUR_TESTING_CASUAL, 3);
    expect(options[0]).toMatch(/break|tried by hand/);
  });

  // ── Sub-7 — ABSENCE_SCOPE_CREEP buildOptionList (formal, 3 L1 / 2 L2 / 1 L3) ─────────────

  it('ABSENCE_SCOPE_CREEP L1 has exactly 5 options (3 content + Show simpler + Skip)', () => {
    const { options, hasNextLevel } = buildOptionList(ABSENCE_SCOPE_CREEP, 1);
    expect(options).toHaveLength(5);
    expect(hasNextLevel).toBe(true);
    expect(options.at(-1)).toBe(SKIP_NOW);
    expect(options.at(-2)).toBe(SHOW_SIMPLER);
  });

  it('ABSENCE_SCOPE_CREEP L2 has exactly 4 options (2 content + Show simpler + Skip)', () => {
    const { options, hasNextLevel } = buildOptionList(ABSENCE_SCOPE_CREEP, 2);
    expect(options).toHaveLength(4);
    expect(hasNextLevel).toBe(true);
    expect(options.at(-1)).toBe(SKIP_NOW);
    expect(options.at(-2)).toBe(SHOW_SIMPLER);
  });

  it('ABSENCE_SCOPE_CREEP L3 has exactly 2 options (1 content + Skip, no Show simpler)', () => {
    const { options, hasNextLevel } = buildOptionList(ABSENCE_SCOPE_CREEP, 3);
    expect(options).toHaveLength(2);
    expect(hasNextLevel).toBe(false);
    expect(options.at(-1)).toBe(SKIP_NOW);
    expect(options).not.toContain(SHOW_SIMPLER);
  });

  // ── Sub-7 — ABSENCE_SCOPE_CREEP_BEGINNER buildOptionList (beginner, 2 L1 / 1 L2 / 1 L3) ──

  it('ABSENCE_SCOPE_CREEP_BEGINNER L1 has exactly 4 options (2 content + Show simpler + Skip)', () => {
    const { options, hasNextLevel } = buildOptionList(ABSENCE_SCOPE_CREEP_BEGINNER, 1);
    expect(options).toHaveLength(4);
    expect(hasNextLevel).toBe(true);
    expect(options.at(-1)).toBe(SKIP_NOW);
    expect(options.at(-2)).toBe(SHOW_SIMPLER);
  });

  it('ABSENCE_SCOPE_CREEP_BEGINNER L2 has exactly 3 options (1 content + Show simpler + Skip)', () => {
    const { options, hasNextLevel } = buildOptionList(ABSENCE_SCOPE_CREEP_BEGINNER, 2);
    expect(options).toHaveLength(3);
    expect(hasNextLevel).toBe(true);
    expect(options.at(-1)).toBe(SKIP_NOW);
    expect(options.at(-2)).toBe(SHOW_SIMPLER);
  });

  it('ABSENCE_SCOPE_CREEP_BEGINNER L3 has exactly 2 options (1 content + Skip, no Show simpler)', () => {
    const { options, hasNextLevel } = buildOptionList(ABSENCE_SCOPE_CREEP_BEGINNER, 3);
    expect(options).toHaveLength(2);
    expect(hasNextLevel).toBe(false);
    expect(options.at(-1)).toBe(SKIP_NOW);
    expect(options).not.toContain(SHOW_SIMPLER);
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

  it('stage_transition to feedback_loop → RELEASE_TO_FEEDBACK (no profile)', () => {
    const content = resolveDecisionContent('feedback_loop', 'stage_transition');
    expect(content).toBe(RELEASE_TO_FEEDBACK);
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

  it('absence:unknown_signal in feedback_loop stage → RELEASE_TO_FEEDBACK (falls through to TRANSITION_CONTENT, no profile)', () => {
    const content = resolveDecisionContent('feedback_loop', 'absence:some_signal');
    expect(content).toBe(RELEASE_TO_FEEDBACK);
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

  // ── Skipped-transition firing ────────────────────────────────────────────────

  it('skipped idea→implementation: returns task_breakdown transition content', () => {
    const content = resolveDecisionContent('implementation', 'stage_transition', null, 'idea');
    expect(content.question).toBe(ARCHITECTURE_TO_TASKS.question);
  });

  it('skipped idea→review_testing: returns task_breakdown transition content', () => {
    const content = resolveDecisionContent('review_testing', 'stage_transition', null, 'idea');
    expect(content.question).toBe(ARCHITECTURE_TO_TASKS.question);
  });

  it('normal idea→prd with prevStage: returns IDEA_TO_PRD', () => {
    const content = resolveDecisionContent('prd', 'stage_transition', null, 'idea');
    expect(content.question).toBe(IDEA_TO_PRD.question);
  });

  it('implementation without prevStage: falls to TASK_REVIEW', () => {
    const content = resolveDecisionContent('implementation', 'stage_transition', null);
    expect(content.question).toBe(TASK_REVIEW_CASUAL.question);
  });

  it('skipped task_breakdown→release: returns review_testing transition content', () => {
    const content = resolveDecisionContent('release', 'stage_transition', null, 'task_breakdown');
    expect(content.question).toBe(IMPLEMENTATION_TO_REVIEW.question);
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

  it('cool_geek + absence:test_creation → ABSENCE_TEST_CREATION_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:test_creation', makeProfile('cool_geek'));
    expect(content).toBe(ABSENCE_TEST_CREATION_CASUAL);
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

  // ── Group A signal routing ────────────────────────────────────────────────────

  it('hardcore_pro + absence:security_check → ABSENCE_SECURITY_CHECK (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:security_check', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_SECURITY_CHECK);
  });

  it('pro_geek_soul + absence:security_check → ABSENCE_SECURITY_CHECK_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:security_check', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_SECURITY_CHECK_CASUAL);
  });

  it('beginner + absence:security_check → ABSENCE_SECURITY_CHECK_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:security_check', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_SECURITY_CHECK_BEGINNER);
  });

  it('hardcore_pro + absence:error_handling → ABSENCE_ERROR_HANDLING (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:error_handling', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_ERROR_HANDLING);
  });

  it('pro_geek_soul + absence:error_handling → ABSENCE_ERROR_HANDLING_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:error_handling', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_ERROR_HANDLING_CASUAL);
  });

  it('beginner + absence:error_handling → ABSENCE_ERROR_HANDLING_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:error_handling', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_ERROR_HANDLING_BEGINNER);
  });

  it('hardcore_pro + absence:documentation → ABSENCE_DOCUMENTATION (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:documentation', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_DOCUMENTATION);
  });

  it('pro_geek_soul + absence:documentation → ABSENCE_DOCUMENTATION_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:documentation', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_DOCUMENTATION_CASUAL);
  });

  it('beginner + absence:documentation → ABSENCE_DOCUMENTATION_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:documentation', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_DOCUMENTATION_BEGINNER);
  });

  it('hardcore_pro + absence:observability → ABSENCE_OBSERVABILITY (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:observability', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_OBSERVABILITY);
  });

  it('pro_geek_soul + absence:observability → ABSENCE_OBSERVABILITY_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:observability', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_OBSERVABILITY_CASUAL);
  });

  it('beginner + absence:observability → ABSENCE_OBSERVABILITY_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:observability', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_OBSERVABILITY_BEGINNER);
  });

  it('hardcore_pro + absence:comprehension → ABSENCE_COMPREHENSION (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:comprehension', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_COMPREHENSION);
  });

  it('pro_geek_soul + absence:comprehension → ABSENCE_COMPREHENSION_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:comprehension', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_COMPREHENSION_CASUAL);
  });

  it('beginner + absence:comprehension → ABSENCE_COMPREHENSION_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:comprehension', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_COMPREHENSION_BEGINNER);
  });

  it('hardcore_pro + absence:refactoring_review → ABSENCE_REFACTORING (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:refactoring_review', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_REFACTORING);
  });

  it('pro_geek_soul + absence:refactoring_review → ABSENCE_REFACTORING_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:refactoring_review', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_REFACTORING_CASUAL);
  });

  it('beginner + absence:refactoring_review → ABSENCE_REFACTORING_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:refactoring_review', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_REFACTORING_BEGINNER);
  });

  // ── Group B signal routing ────────────────────────────────────────────────────

  it('hardcore_pro + absence:no_agent_pushback → ABSENCE_NO_PUSHBACK (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:no_agent_pushback', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_NO_PUSHBACK);
  });

  it('pro_geek_soul + absence:no_agent_pushback → ABSENCE_NO_PUSHBACK_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:no_agent_pushback', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_NO_PUSHBACK_CASUAL);
  });

  it('beginner + absence:no_agent_pushback → ABSENCE_NO_PUSHBACK_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:no_agent_pushback', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_NO_PUSHBACK_BEGINNER);
  });

  it('hardcore_pro + absence:correction_seeking → ABSENCE_CORRECTION_SEEKING (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:correction_seeking', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_CORRECTION_SEEKING);
  });

  it('pro_geek_soul + absence:correction_seeking → ABSENCE_CORRECTION_SEEKING_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:correction_seeking', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_CORRECTION_SEEKING_CASUAL);
  });

  it('beginner + absence:correction_seeking → ABSENCE_CORRECTION_SEEKING_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:correction_seeking', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_CORRECTION_SEEKING_BEGINNER);
  });

  it('hardcore_pro + absence:problem_correction → ABSENCE_PROBLEM_CORRECTION (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:problem_correction', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_PROBLEM_CORRECTION);
  });

  it('pro_geek_soul + absence:problem_correction → ABSENCE_PROBLEM_CORRECTION_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:problem_correction', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_PROBLEM_CORRECTION_CASUAL);
  });

  it('beginner + absence:problem_correction → ABSENCE_PROBLEM_CORRECTION_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:problem_correction', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_PROBLEM_CORRECTION_BEGINNER);
  });

  it('hardcore_pro + absence:alternatives_seeking → ABSENCE_ALTERNATIVES (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:alternatives_seeking', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_ALTERNATIVES);
  });

  it('pro_geek_soul + absence:alternatives_seeking → ABSENCE_ALTERNATIVES_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:alternatives_seeking', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_ALTERNATIVES_CASUAL);
  });

  it('beginner + absence:alternatives_seeking → ABSENCE_ALTERNATIVES_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:alternatives_seeking', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_ALTERNATIVES_BEGINNER);
  });

  it('hardcore_pro + absence:architecture_conflict → ABSENCE_ARCH_CONFLICT (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:architecture_conflict', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_ARCH_CONFLICT);
  });

  it('pro_geek_soul + absence:architecture_conflict → ABSENCE_ARCH_CONFLICT_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:architecture_conflict', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_ARCH_CONFLICT_CASUAL);
  });

  it('beginner + absence:architecture_conflict → ABSENCE_ARCH_CONFLICT_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:architecture_conflict', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_ARCH_CONFLICT_BEGINNER);
  });

  it('hardcore_pro + absence:prompt_context_richness → ABSENCE_PROMPT_CONTEXT (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:prompt_context_richness', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_PROMPT_CONTEXT);
  });

  it('pro_geek_soul + absence:prompt_context_richness → ABSENCE_PROMPT_CONTEXT_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:prompt_context_richness', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_PROMPT_CONTEXT_CASUAL);
  });

  it('beginner + absence:prompt_context_richness → ABSENCE_PROMPT_CONTEXT_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:prompt_context_richness', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_PROMPT_CONTEXT_BEGINNER);
  });

  // ── Group C signal routing ────────────────────────────────────────────────────

  it('hardcore_pro + absence:rollback_planning → ABSENCE_ROLLBACK_PLANNING (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:rollback_planning', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_ROLLBACK_PLANNING);
  });

  it('pro_geek_soul + absence:rollback_planning → ABSENCE_ROLLBACK_PLANNING_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:rollback_planning', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_ROLLBACK_PLANNING_CASUAL);
  });

  it('beginner + absence:rollback_planning → ABSENCE_ROLLBACK_PLANNING_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:rollback_planning', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_ROLLBACK_PLANNING_BEGINNER);
  });

  it('hardcore_pro + absence:deployment_planning → ABSENCE_DEPLOYMENT_PLANNING (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:deployment_planning', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_DEPLOYMENT_PLANNING);
  });

  it('pro_geek_soul + absence:deployment_planning → ABSENCE_DEPLOYMENT_PLANNING_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:deployment_planning', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_DEPLOYMENT_PLANNING_CASUAL);
  });

  it('beginner + absence:deployment_planning → ABSENCE_DEPLOYMENT_PLANNING_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:deployment_planning', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_DEPLOYMENT_PLANNING_BEGINNER);
  });

  it('hardcore_pro + absence:dependency_management → ABSENCE_DEPENDENCY_MGMT (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:dependency_management', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_DEPENDENCY_MGMT);
  });

  it('pro_geek_soul + absence:dependency_management → ABSENCE_DEPENDENCY_MGMT_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:dependency_management', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_DEPENDENCY_MGMT_CASUAL);
  });

  it('beginner + absence:dependency_management → ABSENCE_DEPENDENCY_MGMT_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:dependency_management', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_DEPENDENCY_MGMT_BEGINNER);
  });

  it('hardcore_pro + absence:phase_transition → ABSENCE_PHASE_TRANSITION (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:phase_transition', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_PHASE_TRANSITION);
  });

  it('pro_geek_soul + absence:phase_transition → ABSENCE_PHASE_TRANSITION_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:phase_transition', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_PHASE_TRANSITION_CASUAL);
  });

  it('beginner + absence:phase_transition → ABSENCE_PHASE_TRANSITION_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:phase_transition', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_PHASE_TRANSITION_BEGINNER);
  });

  // ── Group D signal routing ────────────────────────────────────────────────────

  it('hardcore_pro + absence:spec_cross_confirm → ABSENCE_SPEC_CROSS_CONFIRM (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:spec_cross_confirm', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_SPEC_CROSS_CONFIRM);
  });

  it('pro_geek_soul + absence:spec_cross_confirm → ABSENCE_SPEC_CROSS_CONFIRM_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:spec_cross_confirm', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_SPEC_CROSS_CONFIRM_CASUAL);
  });

  it('beginner + absence:spec_cross_confirm → ABSENCE_SPEC_CROSS_CONFIRM_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:spec_cross_confirm', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_SPEC_CROSS_CONFIRM_BEGINNER);
  });

  it('hardcore_pro + absence:spec_revision → ABSENCE_SPEC_REVISION (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:spec_revision', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_SPEC_REVISION);
  });

  it('pro_geek_soul + absence:spec_revision → ABSENCE_SPEC_REVISION_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:spec_revision', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_SPEC_REVISION_CASUAL);
  });

  it('beginner + absence:spec_revision → ABSENCE_SPEC_REVISION_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:spec_revision', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_SPEC_REVISION_BEGINNER);
  });

  // ── Sub-4 signal routing — all 8 new signals (Groups A + B + C) ─────────────

  // Group A — idea signals
  it('hardcore_pro + absence:idea_scoping → ABSENCE_IDEA_SCOPING (formal)', () => {
    const content = resolveDecisionContent('idea', 'absence:idea_scoping', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_IDEA_SCOPING);
  });

  it('pro_geek_soul + absence:idea_scoping → ABSENCE_IDEA_SCOPING_CASUAL', () => {
    const content = resolveDecisionContent('idea', 'absence:idea_scoping', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_IDEA_SCOPING_CASUAL);
  });

  it('beginner + absence:idea_scoping → ABSENCE_IDEA_SCOPING_BEGINNER', () => {
    const content = resolveDecisionContent('idea', 'absence:idea_scoping', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_IDEA_SCOPING_BEGINNER);
  });

  it('hardcore_pro + absence:idea_constraint_check → ABSENCE_IDEA_CONSTRAINT_CHECK (formal)', () => {
    const content = resolveDecisionContent('idea', 'absence:idea_constraint_check', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_IDEA_CONSTRAINT_CHECK);
  });

  it('pro_geek_soul + absence:idea_constraint_check → ABSENCE_IDEA_CONSTRAINT_CHECK_CASUAL', () => {
    const content = resolveDecisionContent('idea', 'absence:idea_constraint_check', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_IDEA_CONSTRAINT_CHECK_CASUAL);
  });

  it('beginner + absence:idea_constraint_check → ABSENCE_IDEA_CONSTRAINT_CHECK_BEGINNER', () => {
    const content = resolveDecisionContent('idea', 'absence:idea_constraint_check', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_IDEA_CONSTRAINT_CHECK_BEGINNER);
  });

  it('hardcore_pro + absence:idea_user_definition → ABSENCE_IDEA_USER_DEFINITION (formal)', () => {
    const content = resolveDecisionContent('idea', 'absence:idea_user_definition', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_IDEA_USER_DEFINITION);
  });

  it('pro_geek_soul + absence:idea_user_definition → ABSENCE_IDEA_USER_DEFINITION_CASUAL', () => {
    const content = resolveDecisionContent('idea', 'absence:idea_user_definition', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_IDEA_USER_DEFINITION_CASUAL);
  });

  it('beginner + absence:idea_user_definition → ABSENCE_IDEA_USER_DEFINITION_BEGINNER', () => {
    const content = resolveDecisionContent('idea', 'absence:idea_user_definition', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_IDEA_USER_DEFINITION_BEGINNER);
  });

  // Group B — task_breakdown signals
  it('hardcore_pro + absence:task_ordering → ABSENCE_TASK_ORDERING (formal)', () => {
    const content = resolveDecisionContent('task_breakdown', 'absence:task_ordering', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_TASK_ORDERING);
  });

  it('pro_geek_soul + absence:task_ordering → ABSENCE_TASK_ORDERING_CASUAL', () => {
    const content = resolveDecisionContent('task_breakdown', 'absence:task_ordering', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_TASK_ORDERING_CASUAL);
  });

  it('beginner + absence:task_ordering → ABSENCE_TASK_ORDERING_BEGINNER', () => {
    const content = resolveDecisionContent('task_breakdown', 'absence:task_ordering', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_TASK_ORDERING_BEGINNER);
  });

  it('hardcore_pro + absence:task_sizing → ABSENCE_TASK_SIZING (formal)', () => {
    const content = resolveDecisionContent('task_breakdown', 'absence:task_sizing', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_TASK_SIZING);
  });

  it('pro_geek_soul + absence:task_sizing → ABSENCE_TASK_SIZING_CASUAL', () => {
    const content = resolveDecisionContent('task_breakdown', 'absence:task_sizing', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_TASK_SIZING_CASUAL);
  });

  it('beginner + absence:task_sizing → ABSENCE_TASK_SIZING_BEGINNER', () => {
    const content = resolveDecisionContent('task_breakdown', 'absence:task_sizing', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_TASK_SIZING_BEGINNER);
  });

  it('hardcore_pro + absence:task_definition_of_done → ABSENCE_TASK_DEFINITION_OF_DONE (formal)', () => {
    const content = resolveDecisionContent('task_breakdown', 'absence:task_definition_of_done', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_TASK_DEFINITION_OF_DONE);
  });

  it('pro_geek_soul + absence:task_definition_of_done → ABSENCE_TASK_DEFINITION_OF_DONE_CASUAL', () => {
    const content = resolveDecisionContent('task_breakdown', 'absence:task_definition_of_done', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_TASK_DEFINITION_OF_DONE_CASUAL);
  });

  it('beginner + absence:task_definition_of_done → ABSENCE_TASK_DEFINITION_OF_DONE_BEGINNER', () => {
    const content = resolveDecisionContent('task_breakdown', 'absence:task_definition_of_done', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_TASK_DEFINITION_OF_DONE_BEGINNER);
  });

  // Group C — feedback_loop signals
  it('hardcore_pro + absence:user_feedback_review → ABSENCE_USER_FEEDBACK_REVIEW (formal)', () => {
    const content = resolveDecisionContent('feedback_loop', 'absence:user_feedback_review', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_USER_FEEDBACK_REVIEW);
  });

  it('pro_geek_soul + absence:user_feedback_review → ABSENCE_USER_FEEDBACK_REVIEW_CASUAL', () => {
    const content = resolveDecisionContent('feedback_loop', 'absence:user_feedback_review', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_USER_FEEDBACK_REVIEW_CASUAL);
  });

  it('beginner + absence:user_feedback_review → ABSENCE_USER_FEEDBACK_REVIEW_BEGINNER', () => {
    const content = resolveDecisionContent('feedback_loop', 'absence:user_feedback_review', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_USER_FEEDBACK_REVIEW_BEGINNER);
  });

  it('hardcore_pro + absence:iteration_planning → ABSENCE_ITERATION_PLANNING (formal)', () => {
    const content = resolveDecisionContent('feedback_loop', 'absence:iteration_planning', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_ITERATION_PLANNING);
  });

  it('pro_geek_soul + absence:iteration_planning → ABSENCE_ITERATION_PLANNING_CASUAL', () => {
    const content = resolveDecisionContent('feedback_loop', 'absence:iteration_planning', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_ITERATION_PLANNING_CASUAL);
  });

  it('beginner + absence:iteration_planning → ABSENCE_ITERATION_PLANNING_BEGINNER', () => {
    const content = resolveDecisionContent('feedback_loop', 'absence:iteration_planning', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_ITERATION_PLANNING_BEGINNER);
  });

  // ── Sub-7 signal routing — all 8 new signals ──────────────────────────────

  it('hardcore_pro + absence:scope_creep → ABSENCE_SCOPE_CREEP (formal)', () => {
    expect(resolveDecisionContent('implementation', 'absence:scope_creep', makeProfile('hardcore_pro'))).toBe(ABSENCE_SCOPE_CREEP);
  });
  it('pro_geek_soul + absence:scope_creep → ABSENCE_SCOPE_CREEP_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:scope_creep', makeProfile('pro_geek_soul'))).toBe(ABSENCE_SCOPE_CREEP_CASUAL);
  });
  it('beginner + absence:scope_creep → ABSENCE_SCOPE_CREEP_BEGINNER', () => {
    expect(resolveDecisionContent('implementation', 'absence:scope_creep', makeProfile('beginner'))).toBe(ABSENCE_SCOPE_CREEP_BEGINNER);
  });

  it('hardcore_pro + absence:context_loss → ABSENCE_CONTEXT_LOSS (formal)', () => {
    expect(resolveDecisionContent('implementation', 'absence:context_loss', makeProfile('hardcore_pro'))).toBe(ABSENCE_CONTEXT_LOSS);
  });
  it('pro_geek_soul + absence:context_loss → ABSENCE_CONTEXT_LOSS_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:context_loss', makeProfile('pro_geek_soul'))).toBe(ABSENCE_CONTEXT_LOSS_CASUAL);
  });
  it('beginner + absence:context_loss → ABSENCE_CONTEXT_LOSS_BEGINNER', () => {
    expect(resolveDecisionContent('implementation', 'absence:context_loss', makeProfile('beginner'))).toBe(ABSENCE_CONTEXT_LOSS_BEGINNER);
  });

  it('hardcore_pro + absence:api_design_review → ABSENCE_API_DESIGN_REVIEW (formal)', () => {
    expect(resolveDecisionContent('implementation', 'absence:api_design_review', makeProfile('hardcore_pro'))).toBe(ABSENCE_API_DESIGN_REVIEW);
  });
  it('pro_geek_soul + absence:api_design_review → ABSENCE_API_DESIGN_REVIEW_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:api_design_review', makeProfile('pro_geek_soul'))).toBe(ABSENCE_API_DESIGN_REVIEW_CASUAL);
  });
  it('beginner + absence:api_design_review → ABSENCE_API_DESIGN_REVIEW_BEGINNER', () => {
    expect(resolveDecisionContent('implementation', 'absence:api_design_review', makeProfile('beginner'))).toBe(ABSENCE_API_DESIGN_REVIEW_BEGINNER);
  });

  it('hardcore_pro + absence:accessibility → ABSENCE_ACCESSIBILITY (formal)', () => {
    expect(resolveDecisionContent('implementation', 'absence:accessibility', makeProfile('hardcore_pro'))).toBe(ABSENCE_ACCESSIBILITY);
  });
  it('pro_geek_soul + absence:accessibility → ABSENCE_ACCESSIBILITY_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:accessibility', makeProfile('pro_geek_soul'))).toBe(ABSENCE_ACCESSIBILITY_CASUAL);
  });
  it('beginner + absence:accessibility → ABSENCE_ACCESSIBILITY_BEGINNER', () => {
    expect(resolveDecisionContent('implementation', 'absence:accessibility', makeProfile('beginner'))).toBe(ABSENCE_ACCESSIBILITY_BEGINNER);
  });

  it('hardcore_pro + absence:environment_and_secrets → ABSENCE_ENV_AND_SECRETS (formal)', () => {
    expect(resolveDecisionContent('implementation', 'absence:environment_and_secrets', makeProfile('hardcore_pro'))).toBe(ABSENCE_ENV_AND_SECRETS);
  });
  it('pro_geek_soul + absence:environment_and_secrets → ABSENCE_ENV_AND_SECRETS_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:environment_and_secrets', makeProfile('pro_geek_soul'))).toBe(ABSENCE_ENV_AND_SECRETS_CASUAL);
  });
  it('beginner + absence:environment_and_secrets → ABSENCE_ENV_AND_SECRETS_BEGINNER', () => {
    expect(resolveDecisionContent('implementation', 'absence:environment_and_secrets', makeProfile('beginner'))).toBe(ABSENCE_ENV_AND_SECRETS_BEGINNER);
  });

  it('hardcore_pro + absence:data_validation → ABSENCE_DATA_VALIDATION (formal)', () => {
    expect(resolveDecisionContent('implementation', 'absence:data_validation', makeProfile('hardcore_pro'))).toBe(ABSENCE_DATA_VALIDATION);
  });
  it('pro_geek_soul + absence:data_validation → ABSENCE_DATA_VALIDATION_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:data_validation', makeProfile('pro_geek_soul'))).toBe(ABSENCE_DATA_VALIDATION_CASUAL);
  });
  it('beginner + absence:data_validation → ABSENCE_DATA_VALIDATION_BEGINNER', () => {
    expect(resolveDecisionContent('implementation', 'absence:data_validation', makeProfile('beginner'))).toBe(ABSENCE_DATA_VALIDATION_BEGINNER);
  });

  it('hardcore_pro + absence:ci_pipeline → ABSENCE_CI_PIPELINE (formal)', () => {
    expect(resolveDecisionContent('review_testing', 'absence:ci_pipeline', makeProfile('hardcore_pro'))).toBe(ABSENCE_CI_PIPELINE);
  });
  it('pro_geek_soul + absence:ci_pipeline → ABSENCE_CI_PIPELINE_CASUAL', () => {
    expect(resolveDecisionContent('review_testing', 'absence:ci_pipeline', makeProfile('pro_geek_soul'))).toBe(ABSENCE_CI_PIPELINE_CASUAL);
  });
  it('beginner + absence:ci_pipeline → ABSENCE_CI_PIPELINE_BEGINNER', () => {
    expect(resolveDecisionContent('review_testing', 'absence:ci_pipeline', makeProfile('beginner'))).toBe(ABSENCE_CI_PIPELINE_BEGINNER);
  });

  it('hardcore_pro + absence:rate_limiting → ABSENCE_RATE_LIMITING (formal)', () => {
    expect(resolveDecisionContent('implementation', 'absence:rate_limiting', makeProfile('hardcore_pro'))).toBe(ABSENCE_RATE_LIMITING);
  });
  it('pro_geek_soul + absence:rate_limiting → ABSENCE_RATE_LIMITING_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:rate_limiting', makeProfile('pro_geek_soul'))).toBe(ABSENCE_RATE_LIMITING_CASUAL);
  });
  it('beginner + absence:rate_limiting → ABSENCE_RATE_LIMITING_BEGINNER', () => {
    expect(resolveDecisionContent('implementation', 'absence:rate_limiting', makeProfile('beginner'))).toBe(ABSENCE_RATE_LIMITING_BEGINNER);
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
    BEHAVIOUR_TESTING_CASUAL,
    ABSENCE_TEST_CREATION,
    ABSENCE_TEST_CREATION_CASUAL,
    ABSENCE_REGRESSION_CHECK,
    ABSENCE_REGRESSION_CHECK_CASUAL,
    ABSENCE_SPEC_ACCEPTANCE,
    ABSENCE_SPEC_ACCEPTANCE_CASUAL,
    ABSENCE_CROSS_CONFIRMING,
    ABSENCE_CROSS_CONFIRMING_CASUAL,
    ABSENCE_SECURITY_CHECK,
    ABSENCE_SECURITY_CHECK_CASUAL,
    ABSENCE_ERROR_HANDLING,
    ABSENCE_ERROR_HANDLING_CASUAL,
    ABSENCE_DOCUMENTATION,
    ABSENCE_DOCUMENTATION_CASUAL,
    ABSENCE_OBSERVABILITY,
    ABSENCE_OBSERVABILITY_CASUAL,
    ABSENCE_COMPREHENSION,
    ABSENCE_COMPREHENSION_CASUAL,
    ABSENCE_REFACTORING,
    ABSENCE_REFACTORING_CASUAL,
    ABSENCE_NO_PUSHBACK,
    ABSENCE_NO_PUSHBACK_CASUAL,
    ABSENCE_CORRECTION_SEEKING,
    ABSENCE_CORRECTION_SEEKING_CASUAL,
    ABSENCE_PROBLEM_CORRECTION,
    ABSENCE_PROBLEM_CORRECTION_CASUAL,
    ABSENCE_ALTERNATIVES,
    ABSENCE_ALTERNATIVES_CASUAL,
    ABSENCE_ARCH_CONFLICT,
    ABSENCE_ARCH_CONFLICT_CASUAL,
    ABSENCE_PROMPT_CONTEXT,
    ABSENCE_PROMPT_CONTEXT_CASUAL,
    ABSENCE_ROLLBACK_PLANNING,
    ABSENCE_ROLLBACK_PLANNING_CASUAL,
    ABSENCE_DEPLOYMENT_PLANNING,
    ABSENCE_DEPLOYMENT_PLANNING_CASUAL,
    ABSENCE_DEPENDENCY_MGMT,
    ABSENCE_DEPENDENCY_MGMT_CASUAL,
    ABSENCE_PHASE_TRANSITION,
    ABSENCE_PHASE_TRANSITION_CASUAL,
    ABSENCE_SPEC_CROSS_CONFIRM,
    ABSENCE_SPEC_CROSS_CONFIRM_CASUAL,
    ABSENCE_SPEC_REVISION,
    ABSENCE_SPEC_REVISION_CASUAL,
    ABSENCE_SCOPE_CREEP,
    ABSENCE_SCOPE_CREEP_CASUAL,
    ABSENCE_CONTEXT_LOSS,
    ABSENCE_CONTEXT_LOSS_CASUAL,
    ABSENCE_API_DESIGN_REVIEW,
    ABSENCE_API_DESIGN_REVIEW_CASUAL,
    ABSENCE_ACCESSIBILITY,
    ABSENCE_ACCESSIBILITY_CASUAL,
    ABSENCE_ENV_AND_SECRETS,
    ABSENCE_ENV_AND_SECRETS_CASUAL,
    ABSENCE_DATA_VALIDATION,
    ABSENCE_DATA_VALIDATION_CASUAL,
    ABSENCE_CI_PIPELINE,
    ABSENCE_CI_PIPELINE_CASUAL,
    ABSENCE_RATE_LIMITING,
    ABSENCE_RATE_LIMITING_CASUAL,
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

  it('BEHAVIOUR_TESTING has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(BEHAVIOUR_TESTING.L1).toHaveLength(3);
    expect(BEHAVIOUR_TESTING.L2).toHaveLength(2);
    expect(BEHAVIOUR_TESTING.L3).toHaveLength(1);
  });

  it('BEHAVIOUR_TESTING_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(BEHAVIOUR_TESTING_CASUAL.L1).toHaveLength(3);
    expect(BEHAVIOUR_TESTING_CASUAL.L2).toHaveLength(2);
    expect(BEHAVIOUR_TESTING_CASUAL.L3).toHaveLength(1);
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

  it('ABSENCE_SECURITY_CHECK has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SECURITY_CHECK.L1).toHaveLength(3);
    expect(ABSENCE_SECURITY_CHECK.L2).toHaveLength(2);
    expect(ABSENCE_SECURITY_CHECK.L3).toHaveLength(1);
  });

  it('ABSENCE_SECURITY_CHECK_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SECURITY_CHECK_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_SECURITY_CHECK_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_SECURITY_CHECK_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_ERROR_HANDLING has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ERROR_HANDLING.L1).toHaveLength(3);
    expect(ABSENCE_ERROR_HANDLING.L2).toHaveLength(2);
    expect(ABSENCE_ERROR_HANDLING.L3).toHaveLength(1);
  });

  it('ABSENCE_ERROR_HANDLING_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ERROR_HANDLING_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_ERROR_HANDLING_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_ERROR_HANDLING_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_DOCUMENTATION has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_DOCUMENTATION.L1).toHaveLength(3);
    expect(ABSENCE_DOCUMENTATION.L2).toHaveLength(2);
    expect(ABSENCE_DOCUMENTATION.L3).toHaveLength(1);
  });

  it('ABSENCE_DOCUMENTATION_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_DOCUMENTATION_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_DOCUMENTATION_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_DOCUMENTATION_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_OBSERVABILITY has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_OBSERVABILITY.L1).toHaveLength(3);
    expect(ABSENCE_OBSERVABILITY.L2).toHaveLength(2);
    expect(ABSENCE_OBSERVABILITY.L3).toHaveLength(1);
  });

  it('ABSENCE_OBSERVABILITY_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_OBSERVABILITY_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_OBSERVABILITY_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_OBSERVABILITY_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_COMPREHENSION has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_COMPREHENSION.L1).toHaveLength(3);
    expect(ABSENCE_COMPREHENSION.L2).toHaveLength(2);
    expect(ABSENCE_COMPREHENSION.L3).toHaveLength(1);
  });

  it('ABSENCE_COMPREHENSION_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_COMPREHENSION_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_COMPREHENSION_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_COMPREHENSION_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_REFACTORING has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_REFACTORING.L1).toHaveLength(3);
    expect(ABSENCE_REFACTORING.L2).toHaveLength(2);
    expect(ABSENCE_REFACTORING.L3).toHaveLength(1);
  });

  it('ABSENCE_REFACTORING_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_REFACTORING_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_REFACTORING_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_REFACTORING_CASUAL.L3).toHaveLength(1);
  });

  it('every Group A formal/casual entry has non-empty L1[0], L1[1], L2[0], L3[0]', () => {
    const groupAFormalCasual = [
      ABSENCE_SECURITY_CHECK,     ABSENCE_SECURITY_CHECK_CASUAL,
      ABSENCE_ERROR_HANDLING,     ABSENCE_ERROR_HANDLING_CASUAL,
      ABSENCE_DOCUMENTATION,      ABSENCE_DOCUMENTATION_CASUAL,
      ABSENCE_OBSERVABILITY,      ABSENCE_OBSERVABILITY_CASUAL,
      ABSENCE_COMPREHENSION,      ABSENCE_COMPREHENSION_CASUAL,
      ABSENCE_REFACTORING,        ABSENCE_REFACTORING_CASUAL,
    ];
    for (const c of groupAFormalCasual) {
      expect(c.L1[0].length).toBeGreaterThan(0);
      expect(c.L1[1].length).toBeGreaterThan(0);
      expect(c.L2[0].length).toBeGreaterThan(0);
      expect(c.L3[0].length).toBeGreaterThan(0);
    }
  });

  it('ABSENCE_NO_PUSHBACK has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_NO_PUSHBACK.L1).toHaveLength(3);
    expect(ABSENCE_NO_PUSHBACK.L2).toHaveLength(2);
    expect(ABSENCE_NO_PUSHBACK.L3).toHaveLength(1);
  });

  it('ABSENCE_NO_PUSHBACK_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_NO_PUSHBACK_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_NO_PUSHBACK_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_NO_PUSHBACK_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_CORRECTION_SEEKING has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_CORRECTION_SEEKING.L1).toHaveLength(3);
    expect(ABSENCE_CORRECTION_SEEKING.L2).toHaveLength(2);
    expect(ABSENCE_CORRECTION_SEEKING.L3).toHaveLength(1);
  });

  it('ABSENCE_CORRECTION_SEEKING_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_CORRECTION_SEEKING_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_CORRECTION_SEEKING_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_CORRECTION_SEEKING_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_PROBLEM_CORRECTION has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_PROBLEM_CORRECTION.L1).toHaveLength(3);
    expect(ABSENCE_PROBLEM_CORRECTION.L2).toHaveLength(2);
    expect(ABSENCE_PROBLEM_CORRECTION.L3).toHaveLength(1);
  });

  it('ABSENCE_PROBLEM_CORRECTION_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_PROBLEM_CORRECTION_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_PROBLEM_CORRECTION_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_PROBLEM_CORRECTION_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_ALTERNATIVES has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ALTERNATIVES.L1).toHaveLength(3);
    expect(ABSENCE_ALTERNATIVES.L2).toHaveLength(2);
    expect(ABSENCE_ALTERNATIVES.L3).toHaveLength(1);
  });

  it('ABSENCE_ALTERNATIVES_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ALTERNATIVES_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_ALTERNATIVES_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_ALTERNATIVES_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_ARCH_CONFLICT has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ARCH_CONFLICT.L1).toHaveLength(3);
    expect(ABSENCE_ARCH_CONFLICT.L2).toHaveLength(2);
    expect(ABSENCE_ARCH_CONFLICT.L3).toHaveLength(1);
  });

  it('ABSENCE_ARCH_CONFLICT_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ARCH_CONFLICT_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_ARCH_CONFLICT_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_ARCH_CONFLICT_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_PROMPT_CONTEXT has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_PROMPT_CONTEXT.L1).toHaveLength(3);
    expect(ABSENCE_PROMPT_CONTEXT.L2).toHaveLength(2);
    expect(ABSENCE_PROMPT_CONTEXT.L3).toHaveLength(1);
  });

  it('ABSENCE_PROMPT_CONTEXT_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_PROMPT_CONTEXT_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_PROMPT_CONTEXT_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_PROMPT_CONTEXT_CASUAL.L3).toHaveLength(1);
  });

  it('every Group B formal/casual entry has non-empty L1[0], L1[1], L2[0], L3[0]', () => {
    const groupBFormalCasual = [
      ABSENCE_NO_PUSHBACK,        ABSENCE_NO_PUSHBACK_CASUAL,
      ABSENCE_CORRECTION_SEEKING, ABSENCE_CORRECTION_SEEKING_CASUAL,
      ABSENCE_PROBLEM_CORRECTION, ABSENCE_PROBLEM_CORRECTION_CASUAL,
      ABSENCE_ALTERNATIVES,       ABSENCE_ALTERNATIVES_CASUAL,
      ABSENCE_ARCH_CONFLICT,      ABSENCE_ARCH_CONFLICT_CASUAL,
      ABSENCE_PROMPT_CONTEXT,     ABSENCE_PROMPT_CONTEXT_CASUAL,
    ];
    for (const c of groupBFormalCasual) {
      expect(c.L1[0].length).toBeGreaterThan(0);
      expect(c.L1[1].length).toBeGreaterThan(0);
      expect(c.L2[0].length).toBeGreaterThan(0);
      expect(c.L3[0].length).toBeGreaterThan(0);
    }
  });

  it('ABSENCE_ROLLBACK_PLANNING has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ROLLBACK_PLANNING.L1).toHaveLength(3);
    expect(ABSENCE_ROLLBACK_PLANNING.L2).toHaveLength(2);
    expect(ABSENCE_ROLLBACK_PLANNING.L3).toHaveLength(1);
  });

  it('ABSENCE_ROLLBACK_PLANNING_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ROLLBACK_PLANNING_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_ROLLBACK_PLANNING_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_ROLLBACK_PLANNING_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_DEPLOYMENT_PLANNING has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_DEPLOYMENT_PLANNING.L1).toHaveLength(3);
    expect(ABSENCE_DEPLOYMENT_PLANNING.L2).toHaveLength(2);
    expect(ABSENCE_DEPLOYMENT_PLANNING.L3).toHaveLength(1);
  });

  it('ABSENCE_DEPLOYMENT_PLANNING_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_DEPLOYMENT_PLANNING_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_DEPLOYMENT_PLANNING_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_DEPLOYMENT_PLANNING_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_DEPENDENCY_MGMT has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_DEPENDENCY_MGMT.L1).toHaveLength(3);
    expect(ABSENCE_DEPENDENCY_MGMT.L2).toHaveLength(2);
    expect(ABSENCE_DEPENDENCY_MGMT.L3).toHaveLength(1);
  });

  it('ABSENCE_DEPENDENCY_MGMT_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_DEPENDENCY_MGMT_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_DEPENDENCY_MGMT_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_DEPENDENCY_MGMT_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_PHASE_TRANSITION has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_PHASE_TRANSITION.L1).toHaveLength(3);
    expect(ABSENCE_PHASE_TRANSITION.L2).toHaveLength(2);
    expect(ABSENCE_PHASE_TRANSITION.L3).toHaveLength(1);
  });

  it('ABSENCE_PHASE_TRANSITION_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_PHASE_TRANSITION_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_PHASE_TRANSITION_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_PHASE_TRANSITION_CASUAL.L3).toHaveLength(1);
  });

  it('every Group C formal/casual entry has non-empty L1[0], L1[1], L2[0], L3[0]', () => {
    const groupCFormalCasual = [
      ABSENCE_ROLLBACK_PLANNING,    ABSENCE_ROLLBACK_PLANNING_CASUAL,
      ABSENCE_DEPLOYMENT_PLANNING,  ABSENCE_DEPLOYMENT_PLANNING_CASUAL,
      ABSENCE_DEPENDENCY_MGMT,      ABSENCE_DEPENDENCY_MGMT_CASUAL,
      ABSENCE_PHASE_TRANSITION,     ABSENCE_PHASE_TRANSITION_CASUAL,
    ];
    for (const c of groupCFormalCasual) {
      expect(c.L1[0].length).toBeGreaterThan(0);
      expect(c.L1[1].length).toBeGreaterThan(0);
      expect(c.L2[0].length).toBeGreaterThan(0);
      expect(c.L3[0].length).toBeGreaterThan(0);
    }
  });

  it('ABSENCE_SPEC_CROSS_CONFIRM has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SPEC_CROSS_CONFIRM.L1).toHaveLength(3);
    expect(ABSENCE_SPEC_CROSS_CONFIRM.L2).toHaveLength(2);
    expect(ABSENCE_SPEC_CROSS_CONFIRM.L3).toHaveLength(1);
  });

  it('ABSENCE_SPEC_CROSS_CONFIRM_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SPEC_CROSS_CONFIRM_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_SPEC_CROSS_CONFIRM_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_SPEC_CROSS_CONFIRM_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_SPEC_REVISION has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SPEC_REVISION.L1).toHaveLength(3);
    expect(ABSENCE_SPEC_REVISION.L2).toHaveLength(2);
    expect(ABSENCE_SPEC_REVISION.L3).toHaveLength(1);
  });

  it('ABSENCE_SPEC_REVISION_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SPEC_REVISION_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_SPEC_REVISION_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_SPEC_REVISION_CASUAL.L3).toHaveLength(1);
  });

  it('every Group D formal/casual entry has non-empty L1[0], L1[1], L2[0], L3[0]', () => {
    const groupDFormalCasual = [
      ABSENCE_SPEC_CROSS_CONFIRM,  ABSENCE_SPEC_CROSS_CONFIRM_CASUAL,
      ABSENCE_SPEC_REVISION,       ABSENCE_SPEC_REVISION_CASUAL,
    ];
    for (const c of groupDFormalCasual) {
      expect(c.L1[0].length).toBeGreaterThan(0);
      expect(c.L1[1].length).toBeGreaterThan(0);
      expect(c.L2[0].length).toBeGreaterThan(0);
      expect(c.L3[0].length).toBeGreaterThan(0);
    }
  });

  // ── Sub-7 formal/casual option counts ────────────────────────────────────────

  it('ABSENCE_SCOPE_CREEP has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SCOPE_CREEP.L1).toHaveLength(3);
    expect(ABSENCE_SCOPE_CREEP.L2).toHaveLength(2);
    expect(ABSENCE_SCOPE_CREEP.L3).toHaveLength(1);
  });

  it('ABSENCE_SCOPE_CREEP_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SCOPE_CREEP_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_SCOPE_CREEP_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_SCOPE_CREEP_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_CONTEXT_LOSS has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_CONTEXT_LOSS.L1).toHaveLength(3);
    expect(ABSENCE_CONTEXT_LOSS.L2).toHaveLength(2);
    expect(ABSENCE_CONTEXT_LOSS.L3).toHaveLength(1);
  });

  it('ABSENCE_CONTEXT_LOSS_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_CONTEXT_LOSS_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_CONTEXT_LOSS_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_CONTEXT_LOSS_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_API_DESIGN_REVIEW has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_API_DESIGN_REVIEW.L1).toHaveLength(3);
    expect(ABSENCE_API_DESIGN_REVIEW.L2).toHaveLength(2);
    expect(ABSENCE_API_DESIGN_REVIEW.L3).toHaveLength(1);
  });

  it('ABSENCE_API_DESIGN_REVIEW_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_API_DESIGN_REVIEW_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_API_DESIGN_REVIEW_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_API_DESIGN_REVIEW_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_ACCESSIBILITY has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ACCESSIBILITY.L1).toHaveLength(3);
    expect(ABSENCE_ACCESSIBILITY.L2).toHaveLength(2);
    expect(ABSENCE_ACCESSIBILITY.L3).toHaveLength(1);
  });

  it('ABSENCE_ACCESSIBILITY_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ACCESSIBILITY_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_ACCESSIBILITY_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_ACCESSIBILITY_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_ENV_AND_SECRETS has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ENV_AND_SECRETS.L1).toHaveLength(3);
    expect(ABSENCE_ENV_AND_SECRETS.L2).toHaveLength(2);
    expect(ABSENCE_ENV_AND_SECRETS.L3).toHaveLength(1);
  });

  it('ABSENCE_ENV_AND_SECRETS_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ENV_AND_SECRETS_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_ENV_AND_SECRETS_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_ENV_AND_SECRETS_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_DATA_VALIDATION has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_DATA_VALIDATION.L1).toHaveLength(3);
    expect(ABSENCE_DATA_VALIDATION.L2).toHaveLength(2);
    expect(ABSENCE_DATA_VALIDATION.L3).toHaveLength(1);
  });

  it('ABSENCE_DATA_VALIDATION_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_DATA_VALIDATION_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_DATA_VALIDATION_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_DATA_VALIDATION_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_CI_PIPELINE has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_CI_PIPELINE.L1).toHaveLength(3);
    expect(ABSENCE_CI_PIPELINE.L2).toHaveLength(2);
    expect(ABSENCE_CI_PIPELINE.L3).toHaveLength(1);
  });

  it('ABSENCE_CI_PIPELINE_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_CI_PIPELINE_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_CI_PIPELINE_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_CI_PIPELINE_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_RATE_LIMITING has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_RATE_LIMITING.L1).toHaveLength(3);
    expect(ABSENCE_RATE_LIMITING.L2).toHaveLength(2);
    expect(ABSENCE_RATE_LIMITING.L3).toHaveLength(1);
  });

  it('ABSENCE_RATE_LIMITING_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_RATE_LIMITING_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_RATE_LIMITING_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_RATE_LIMITING_CASUAL.L3).toHaveLength(1);
  });

  it('every Group E formal/casual entry has non-empty L1[0], L1[1], L2[0], L3[0]', () => {
    const groupEFormalCasual = [
      ABSENCE_SCOPE_CREEP,          ABSENCE_SCOPE_CREEP_CASUAL,
      ABSENCE_CONTEXT_LOSS,         ABSENCE_CONTEXT_LOSS_CASUAL,
      ABSENCE_API_DESIGN_REVIEW,    ABSENCE_API_DESIGN_REVIEW_CASUAL,
      ABSENCE_ACCESSIBILITY,        ABSENCE_ACCESSIBILITY_CASUAL,
      ABSENCE_ENV_AND_SECRETS,      ABSENCE_ENV_AND_SECRETS_CASUAL,
      ABSENCE_DATA_VALIDATION,      ABSENCE_DATA_VALIDATION_CASUAL,
      ABSENCE_CI_PIPELINE,          ABSENCE_CI_PIPELINE_CASUAL,
      ABSENCE_RATE_LIMITING,        ABSENCE_RATE_LIMITING_CASUAL,
    ];
    for (const c of groupEFormalCasual) {
      expect(c.L1[0].length).toBeGreaterThan(0);
      expect(c.L1[1].length).toBeGreaterThan(0);
      expect(c.L2[0].length).toBeGreaterThan(0);
      expect(c.L3[0].length).toBeGreaterThan(0);
    }
  });
});

// ── DecisionContent structure — Group A beginner variants ────────────────────

describe('DecisionContent structure — Group A beginner variants', () => {
  const groupABeginner = [
    ABSENCE_SECURITY_CHECK_BEGINNER,
    ABSENCE_ERROR_HANDLING_BEGINNER,
    ABSENCE_DOCUMENTATION_BEGINNER,
    ABSENCE_OBSERVABILITY_BEGINNER,
    ABSENCE_COMPREHENSION_BEGINNER,
    ABSENCE_REFACTORING_BEGINNER,
  ];

  it('every Group A beginner entry has a non-empty question', () => {
    for (const c of groupABeginner) {
      expect(c.question.length).toBeGreaterThan(0);
    }
  });

  it('every Group A beginner entry has a non-empty pinchFallback', () => {
    for (const c of groupABeginner) {
      expect(c.pinchFallback.length).toBeGreaterThan(0);
    }
  });

  it('every Group A beginner entry has exactly 2 L1, 1 L2, 1 L3 options', () => {
    for (const c of groupABeginner) {
      expect(c.L1).toHaveLength(2);
      expect(c.L2).toHaveLength(1);
      expect(c.L3).toHaveLength(1);
    }
  });

  it('ABSENCE_SECURITY_CHECK_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_SECURITY_CHECK_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_SECURITY_CHECK_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_SECURITY_CHECK_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_ERROR_HANDLING_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_ERROR_HANDLING_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_ERROR_HANDLING_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_ERROR_HANDLING_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_DOCUMENTATION_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_DOCUMENTATION_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_DOCUMENTATION_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_DOCUMENTATION_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_OBSERVABILITY_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_OBSERVABILITY_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_OBSERVABILITY_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_OBSERVABILITY_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_COMPREHENSION_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_COMPREHENSION_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_COMPREHENSION_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_COMPREHENSION_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_REFACTORING_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_REFACTORING_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_REFACTORING_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_REFACTORING_BEGINNER.L3).toHaveLength(1);
  });

  it('every Group A beginner entry has non-empty L1[0], L1[1], L2[0], L3[0]', () => {
    for (const c of groupABeginner) {
      expect(c.L1[0].length).toBeGreaterThan(0);
      expect(c.L1[1].length).toBeGreaterThan(0);
      expect(c.L2[0].length).toBeGreaterThan(0);
      expect(c.L3[0].length).toBeGreaterThan(0);
    }
  });
});

// ── DecisionContent structure — Group B beginner variants ────────────────────

describe('DecisionContent structure — Group B beginner variants', () => {
  const groupBBeginner = [
    ABSENCE_NO_PUSHBACK_BEGINNER,
    ABSENCE_CORRECTION_SEEKING_BEGINNER,
    ABSENCE_PROBLEM_CORRECTION_BEGINNER,
    ABSENCE_ALTERNATIVES_BEGINNER,
    ABSENCE_ARCH_CONFLICT_BEGINNER,
    ABSENCE_PROMPT_CONTEXT_BEGINNER,
  ];

  it('every Group B beginner entry has a non-empty question', () => {
    for (const c of groupBBeginner) {
      expect(c.question.length).toBeGreaterThan(0);
    }
  });

  it('every Group B beginner entry has a non-empty pinchFallback', () => {
    for (const c of groupBBeginner) {
      expect(c.pinchFallback.length).toBeGreaterThan(0);
    }
  });

  it('every Group B beginner entry has exactly 2 L1, 1 L2, 1 L3 options', () => {
    for (const c of groupBBeginner) {
      expect(c.L1).toHaveLength(2);
      expect(c.L2).toHaveLength(1);
      expect(c.L3).toHaveLength(1);
    }
  });

  it('ABSENCE_NO_PUSHBACK_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_NO_PUSHBACK_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_NO_PUSHBACK_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_NO_PUSHBACK_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_CORRECTION_SEEKING_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_CORRECTION_SEEKING_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_CORRECTION_SEEKING_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_CORRECTION_SEEKING_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_PROBLEM_CORRECTION_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_PROBLEM_CORRECTION_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_PROBLEM_CORRECTION_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_PROBLEM_CORRECTION_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_ALTERNATIVES_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_ALTERNATIVES_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_ALTERNATIVES_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_ALTERNATIVES_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_ARCH_CONFLICT_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_ARCH_CONFLICT_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_ARCH_CONFLICT_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_ARCH_CONFLICT_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_PROMPT_CONTEXT_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_PROMPT_CONTEXT_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_PROMPT_CONTEXT_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_PROMPT_CONTEXT_BEGINNER.L3).toHaveLength(1);
  });

  it('every Group B beginner entry has non-empty L1[0], L1[1], L2[0], L3[0]', () => {
    for (const c of groupBBeginner) {
      expect(c.L1[0].length).toBeGreaterThan(0);
      expect(c.L1[1].length).toBeGreaterThan(0);
      expect(c.L2[0].length).toBeGreaterThan(0);
      expect(c.L3[0].length).toBeGreaterThan(0);
    }
  });
});

// ── DecisionContent structure — Group C beginner variants ────────────────────

describe('DecisionContent structure — Group C beginner variants', () => {
  const groupCBeginner = [
    ABSENCE_ROLLBACK_PLANNING_BEGINNER,
    ABSENCE_DEPLOYMENT_PLANNING_BEGINNER,
    ABSENCE_DEPENDENCY_MGMT_BEGINNER,
    ABSENCE_PHASE_TRANSITION_BEGINNER,
  ];

  it('every Group C beginner entry has a non-empty question', () => {
    for (const c of groupCBeginner) {
      expect(c.question.length).toBeGreaterThan(0);
    }
  });

  it('every Group C beginner entry has a non-empty pinchFallback', () => {
    for (const c of groupCBeginner) {
      expect(c.pinchFallback.length).toBeGreaterThan(0);
    }
  });

  it('every Group C beginner entry has exactly 2 L1, 1 L2, 1 L3 options', () => {
    for (const c of groupCBeginner) {
      expect(c.L1).toHaveLength(2);
      expect(c.L2).toHaveLength(1);
      expect(c.L3).toHaveLength(1);
    }
  });

  it('ABSENCE_ROLLBACK_PLANNING_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_ROLLBACK_PLANNING_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_ROLLBACK_PLANNING_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_ROLLBACK_PLANNING_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_DEPLOYMENT_PLANNING_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_DEPLOYMENT_PLANNING_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_DEPLOYMENT_PLANNING_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_DEPLOYMENT_PLANNING_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_DEPENDENCY_MGMT_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_DEPENDENCY_MGMT_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_DEPENDENCY_MGMT_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_DEPENDENCY_MGMT_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_PHASE_TRANSITION_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_PHASE_TRANSITION_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_PHASE_TRANSITION_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_PHASE_TRANSITION_BEGINNER.L3).toHaveLength(1);
  });

  it('every Group C beginner entry has non-empty L1[0], L1[1], L2[0], L3[0]', () => {
    for (const c of groupCBeginner) {
      expect(c.L1[0].length).toBeGreaterThan(0);
      expect(c.L1[1].length).toBeGreaterThan(0);
      expect(c.L2[0].length).toBeGreaterThan(0);
      expect(c.L3[0].length).toBeGreaterThan(0);
    }
  });
});

// ── DecisionContent structure — Group D beginner variants ────────────────────

describe('DecisionContent structure — Group D beginner variants', () => {
  const groupDBeginner = [
    ABSENCE_SPEC_CROSS_CONFIRM_BEGINNER,
    ABSENCE_SPEC_REVISION_BEGINNER,
  ];

  it('every Group D beginner entry has a non-empty question', () => {
    for (const c of groupDBeginner) {
      expect(c.question.length).toBeGreaterThan(0);
    }
  });

  it('every Group D beginner entry has a non-empty pinchFallback', () => {
    for (const c of groupDBeginner) {
      expect(c.pinchFallback.length).toBeGreaterThan(0);
    }
  });

  it('every Group D beginner entry has exactly 2 L1, 1 L2, 1 L3 options', () => {
    for (const c of groupDBeginner) {
      expect(c.L1).toHaveLength(2);
      expect(c.L2).toHaveLength(1);
      expect(c.L3).toHaveLength(1);
    }
  });

  it('ABSENCE_SPEC_CROSS_CONFIRM_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_SPEC_CROSS_CONFIRM_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_SPEC_CROSS_CONFIRM_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_SPEC_CROSS_CONFIRM_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_SPEC_REVISION_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_SPEC_REVISION_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_SPEC_REVISION_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_SPEC_REVISION_BEGINNER.L3).toHaveLength(1);
  });

  it('every Group D beginner entry has non-empty L1[0], L1[1], L2[0], L3[0]', () => {
    for (const c of groupDBeginner) {
      expect(c.L1[0].length).toBeGreaterThan(0);
      expect(c.L1[1].length).toBeGreaterThan(0);
      expect(c.L2[0].length).toBeGreaterThan(0);
      expect(c.L3[0].length).toBeGreaterThan(0);
    }
  });
});

// ── DecisionContent structure — Group E beginner variants (sub-7) ─────────────

describe('DecisionContent structure — Group E beginner variants', () => {
  const groupEBeginner = [
    ABSENCE_SCOPE_CREEP_BEGINNER,
    ABSENCE_CONTEXT_LOSS_BEGINNER,
    ABSENCE_API_DESIGN_REVIEW_BEGINNER,
    ABSENCE_ACCESSIBILITY_BEGINNER,
    ABSENCE_ENV_AND_SECRETS_BEGINNER,
    ABSENCE_DATA_VALIDATION_BEGINNER,
    ABSENCE_CI_PIPELINE_BEGINNER,
    ABSENCE_RATE_LIMITING_BEGINNER,
  ];

  it('every Group E beginner entry has a non-empty question', () => {
    for (const c of groupEBeginner) {
      expect(c.question.length).toBeGreaterThan(0);
    }
  });

  it('every Group E beginner entry has a non-empty pinchFallback', () => {
    for (const c of groupEBeginner) {
      expect(c.pinchFallback.length).toBeGreaterThan(0);
    }
  });

  it('every Group E beginner entry has exactly 2 L1, 1 L2, 1 L3 options', () => {
    for (const c of groupEBeginner) {
      expect(c.L1).toHaveLength(2);
      expect(c.L2).toHaveLength(1);
      expect(c.L3).toHaveLength(1);
    }
  });

  it('ABSENCE_SCOPE_CREEP_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_SCOPE_CREEP_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_SCOPE_CREEP_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_SCOPE_CREEP_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_CONTEXT_LOSS_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_CONTEXT_LOSS_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_CONTEXT_LOSS_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_CONTEXT_LOSS_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_API_DESIGN_REVIEW_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_API_DESIGN_REVIEW_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_API_DESIGN_REVIEW_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_API_DESIGN_REVIEW_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_ACCESSIBILITY_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_ACCESSIBILITY_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_ACCESSIBILITY_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_ACCESSIBILITY_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_ENV_AND_SECRETS_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_ENV_AND_SECRETS_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_ENV_AND_SECRETS_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_ENV_AND_SECRETS_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_DATA_VALIDATION_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_DATA_VALIDATION_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_DATA_VALIDATION_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_DATA_VALIDATION_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_CI_PIPELINE_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_CI_PIPELINE_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_CI_PIPELINE_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_CI_PIPELINE_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_RATE_LIMITING_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_RATE_LIMITING_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_RATE_LIMITING_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_RATE_LIMITING_BEGINNER.L3).toHaveLength(1);
  });

  it('every Group E beginner entry has non-empty L1[0], L1[1], L2[0], L3[0]', () => {
    for (const c of groupEBeginner) {
      expect(c.L1[0].length).toBeGreaterThan(0);
      expect(c.L1[1].length).toBeGreaterThan(0);
      expect(c.L2[0].length).toBeGreaterThan(0);
      expect(c.L3[0].length).toBeGreaterThan(0);
    }
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
    await runLevel(makeInput({ decisionSessionCount: 12 }), 1, selectFn);
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
    expect(BEHAVIOUR_TESTING.question).toBe('Implementation done — user scenarios tested?');
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

// ── BEHAVIOUR_TESTING_CASUAL content block (sub-6) ────────────────────────────

describe('BEHAVIOUR_TESTING_CASUAL content', () => {
  it('has correct question text', () => {
    expect(BEHAVIOUR_TESTING_CASUAL.question).toBe('Implementation done — user scenarios tested?');
  });

  it('has correct pinchFallback', () => {
    expect(BEHAVIOUR_TESTING_CASUAL.pinchFallback).toBe('User scenario?');
  });

  it('has 3 L1 options', () => {
    expect(BEHAVIOUR_TESTING_CASUAL.L1).toHaveLength(3);
  });

  it('has 2 L2 options', () => {
    expect(BEHAVIOUR_TESTING_CASUAL.L2).toHaveLength(2);
  });

  it('has 1 L3 option', () => {
    expect(BEHAVIOUR_TESTING_CASUAL.L3).toHaveLength(1);
  });

  it('L1 option 1 is end-to-end user flow — mentions user or go through', () => {
    expect(BEHAVIOUR_TESTING_CASUAL.L1[0].toLowerCase()).toMatch(/user|go through/);
  });

  it('L1 option 2 is scenario variety — mentions different ways or real life', () => {
    expect(BEHAVIOUR_TESTING_CASUAL.L1[1].toLowerCase()).toMatch(/different ways|real life/);
  });

  it('L1 option 3 is breakage hunting — mentions automated tests or wrong', () => {
    expect(BEHAVIOUR_TESTING_CASUAL.L1[2].toLowerCase()).toMatch(/automated|wrong/);
  });

  it('L3 minimum option ends with a question mark', () => {
    expect(BEHAVIOUR_TESTING_CASUAL.L3[0]).toMatch(/\?$/);
  });

  it('all L1 options are non-empty strings', () => {
    for (const opt of BEHAVIOUR_TESTING_CASUAL.L1) {
      expect(typeof opt).toBe('string');
      expect(opt.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('resolveDecisionContent — behaviour_testing absence (v0.3.0)', () => {
  it('returns BEHAVIOUR_TESTING_CASUAL for absence:behaviour_testing with no profile (casual default)', () => {
    expect(resolveDecisionContent('implementation', 'absence:behaviour_testing')).toBe(BEHAVIOUR_TESTING_CASUAL);
  });

  it('returns BEHAVIOUR_TESTING_CASUAL for absence:behaviour_testing in review_testing stage with no profile', () => {
    expect(resolveDecisionContent('review_testing', 'absence:behaviour_testing')).toBe(BEHAVIOUR_TESTING_CASUAL);
  });

  it('does NOT return BEHAVIOUR_TESTING for unrelated absence signals', () => {
    expect(resolveDecisionContent('implementation', 'absence:test_creation')).not.toBe(BEHAVIOUR_TESTING);
    expect(resolveDecisionContent('implementation', 'absence:regression_check')).not.toBe(BEHAVIOUR_TESTING);
  });
});

describe('resolveDecisionContent — behaviour_testing absence profile routing (sub-6)', () => {
  const proGeekSoulProfile   = { nature: 'pro_geek_soul' as const, precisionScore: 7, playfulnessScore: 5, precisionOrdinal: 'high' as const, playfulnessOrdinal: 'medium' as const, mood: 'focused' as const, depth: 'high' as const, depthScore: 7, computedAt: 0 };
  const hardcoreProProfile   = { nature: 'hardcore_pro' as const, precisionScore: 9, playfulnessScore: 2, precisionOrdinal: 'very_high' as const, playfulnessOrdinal: 'low' as const, mood: 'focused' as const, depth: 'high' as const, depthScore: 9, computedAt: 0 };
  const coolGeekProfile      = { nature: 'cool_geek' as const, precisionScore: 3, playfulnessScore: 8, precisionOrdinal: 'low' as const, playfulnessOrdinal: 'high' as const, mood: 'casual' as const, depth: 'medium' as const, depthScore: 5, computedAt: 0 };
  const beginnerProfile      = { nature: 'beginner' as const, precisionScore: 2, playfulnessScore: 2, precisionOrdinal: 'low' as const, playfulnessOrdinal: 'low' as const, mood: 'casual' as const, depth: 'low' as const, depthScore: 1, computedAt: 0 };

  it('pro_geek_soul + absence:behaviour_testing → BEHAVIOUR_TESTING_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:behaviour_testing', proGeekSoulProfile);
    expect(content).toBe(BEHAVIOUR_TESTING_CASUAL);
  });

  it('null profile + absence:behaviour_testing → BEHAVIOUR_TESTING_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:behaviour_testing', null);
    expect(content).toBe(BEHAVIOUR_TESTING_CASUAL);
  });

  it('hardcore_pro + absence:behaviour_testing → BEHAVIOUR_TESTING (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:behaviour_testing', hardcoreProProfile);
    expect(content).toBe(BEHAVIOUR_TESTING);
  });

  it('cool_geek + absence:behaviour_testing → BEHAVIOUR_TESTING_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:behaviour_testing', coolGeekProfile);
    expect(content).toBe(BEHAVIOUR_TESTING_CASUAL);
  });

  it('beginner + absence:behaviour_testing → BEHAVIOUR_TESTING_BEGINNER (via isVibe)', () => {
    const content = resolveDecisionContent('implementation', 'absence:behaviour_testing', beginnerProfile);
    expect(content).toBe(ABSENCE_CONTENT_BEGINNER.behaviour_testing);
  });
});

describe('IMPLEMENTATION_TO_REVIEW — v0.3.0 addition', () => {
  it('has 5 L1 options after v0.3.0 addition', () => {
    expect(IMPLEMENTATION_TO_REVIEW.L1).toHaveLength(5);
  });

  it('5th L1 option contains "manual acceptance test"', () => {
    expect(IMPLEMENTATION_TO_REVIEW.L1[4].toLowerCase()).toContain('manual acceptance test');
  });

  it('5th L1 option mentions spec scenarios', () => {
    expect(IMPLEMENTATION_TO_REVIEW.L1[4].toLowerCase()).toContain('spec scenarios');
  });

  it('5th L1 option mentions boundary conditions or error states', () => {
    expect(IMPLEMENTATION_TO_REVIEW.L1[4].toLowerCase()).toMatch(/boundary conditions|error states/);
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
  it('injects help item at bottom of options when decisionSessionCount < 12', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput({ decisionSessionCount: 0 }), 1, spy as SelectFn);
    const opts = (spy as ReturnType<typeof vi.fn>).mock.calls[0][0].options as { value: string; label: string }[];
    const helpItem = opts.find((o) => o.value === `${OPTION_SEPARATOR}help`);
    expect(helpItem).toBeDefined();
    expect(helpItem?.label).toContain('Ctrl+X');
    expect(helpItem?.label).toContain('Ctrl+T');
  });

  it('does NOT inject help item when decisionSessionCount >= 12', async () => {
    const spy = vi.fn().mockResolvedValue(SKIP_NOW);
    await runLevel(makeInput({ decisionSessionCount: 12 }), 1, spy as SelectFn);
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

  it('cool_geek + stage_transition to prd → IDEA_TO_PRD', () => {
    const content = resolveDecisionContent('prd', 'stage_transition', coolGeekProfile);
    expect(content).toBe(IDEA_TO_PRD);
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

  it('hardcore_pro + stage_transition to feedback_loop → RELEASE_TO_FEEDBACK', () => {
    const content = resolveDecisionContent('feedback_loop', 'stage_transition', hardcoreProProfile);
    expect(content).toBe(RELEASE_TO_FEEDBACK);
  });

  it('beginner + stage_transition to feedback_loop → RELEASE_TO_FEEDBACK_BEGINNER', () => {
    const content = resolveDecisionContent('feedback_loop', 'stage_transition', beginnerProfile);
    expect(content).toBe(TRANSITION_CONTENT_BEGINNER.feedback_loop);
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
    { name: 'RELEASE_TO_FEEDBACK_BEGINNER',        content: TRANSITION_CONTENT_BEGINNER.feedback_loop! },
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

// ── DecisionContent structure — Sub-4 Group A formal/casual (idea signals) ───

describe('DecisionContent structure — Sub-4 Group A formal/casual (idea signals)', () => {
  it('ABSENCE_IDEA_SCOPING has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_IDEA_SCOPING.L1).toHaveLength(3);
    expect(ABSENCE_IDEA_SCOPING.L2).toHaveLength(2);
    expect(ABSENCE_IDEA_SCOPING.L3).toHaveLength(1);
  });

  it('ABSENCE_IDEA_SCOPING_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_IDEA_SCOPING_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_IDEA_SCOPING_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_IDEA_SCOPING_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_IDEA_CONSTRAINT_CHECK has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_IDEA_CONSTRAINT_CHECK.L1).toHaveLength(3);
    expect(ABSENCE_IDEA_CONSTRAINT_CHECK.L2).toHaveLength(2);
    expect(ABSENCE_IDEA_CONSTRAINT_CHECK.L3).toHaveLength(1);
  });

  it('ABSENCE_IDEA_CONSTRAINT_CHECK_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_IDEA_CONSTRAINT_CHECK_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_IDEA_CONSTRAINT_CHECK_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_IDEA_CONSTRAINT_CHECK_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_IDEA_USER_DEFINITION has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_IDEA_USER_DEFINITION.L1).toHaveLength(3);
    expect(ABSENCE_IDEA_USER_DEFINITION.L2).toHaveLength(2);
    expect(ABSENCE_IDEA_USER_DEFINITION.L3).toHaveLength(1);
  });

  it('ABSENCE_IDEA_USER_DEFINITION_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_IDEA_USER_DEFINITION_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_IDEA_USER_DEFINITION_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_IDEA_USER_DEFINITION_CASUAL.L3).toHaveLength(1);
  });

  it('every Sub-4 Group A formal/casual entry has non-empty question, pinchFallback, L1[0], L1[1], L2[0], L3[0]', () => {
    const entries = [
      ABSENCE_IDEA_SCOPING,
      ABSENCE_IDEA_SCOPING_CASUAL,
      ABSENCE_IDEA_CONSTRAINT_CHECK,
      ABSENCE_IDEA_CONSTRAINT_CHECK_CASUAL,
      ABSENCE_IDEA_USER_DEFINITION,
      ABSENCE_IDEA_USER_DEFINITION_CASUAL,
    ];
    for (const c of entries) {
      expect(c.question.length).toBeGreaterThan(0);
      expect(c.pinchFallback.length).toBeGreaterThan(0);
      expect(c.L1[0].length).toBeGreaterThan(0);
      expect(c.L1[1].length).toBeGreaterThan(0);
      expect(c.L2[0].length).toBeGreaterThan(0);
      expect(c.L3[0].length).toBeGreaterThan(0);
    }
  });
});

// ── DecisionContent structure — Sub-4 Group A beginner (idea signals) ─────────

describe('DecisionContent structure — Sub-4 Group A beginner (idea signals)', () => {
  it('ABSENCE_IDEA_SCOPING_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_IDEA_SCOPING_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_IDEA_SCOPING_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_IDEA_SCOPING_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_IDEA_CONSTRAINT_CHECK_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_IDEA_CONSTRAINT_CHECK_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_IDEA_CONSTRAINT_CHECK_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_IDEA_CONSTRAINT_CHECK_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_IDEA_USER_DEFINITION_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_IDEA_USER_DEFINITION_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_IDEA_USER_DEFINITION_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_IDEA_USER_DEFINITION_BEGINNER.L3).toHaveLength(1);
  });

  it('every Sub-4 Group A beginner entry has non-empty question, pinchFallback, L1[0], L1[1], L2[0], L3[0]', () => {
    const entries = [
      ABSENCE_IDEA_SCOPING_BEGINNER,
      ABSENCE_IDEA_CONSTRAINT_CHECK_BEGINNER,
      ABSENCE_IDEA_USER_DEFINITION_BEGINNER,
    ];
    for (const c of entries) {
      expect(c.question.length).toBeGreaterThan(0);
      expect(c.pinchFallback.length).toBeGreaterThan(0);
      expect(c.L1[0].length).toBeGreaterThan(0);
      expect(c.L1[1].length).toBeGreaterThan(0);
      expect(c.L2[0].length).toBeGreaterThan(0);
      expect(c.L3[0].length).toBeGreaterThan(0);
    }
  });
});

// ── DecisionContent structure — Sub-4 Group B formal/casual (task_breakdown signals) ─

describe('DecisionContent structure — Sub-4 Group B formal/casual (task_breakdown signals)', () => {
  it('ABSENCE_TASK_ORDERING has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_TASK_ORDERING.L1).toHaveLength(3);
    expect(ABSENCE_TASK_ORDERING.L2).toHaveLength(2);
    expect(ABSENCE_TASK_ORDERING.L3).toHaveLength(1);
  });

  it('ABSENCE_TASK_ORDERING_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_TASK_ORDERING_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_TASK_ORDERING_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_TASK_ORDERING_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_TASK_SIZING has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_TASK_SIZING.L1).toHaveLength(3);
    expect(ABSENCE_TASK_SIZING.L2).toHaveLength(2);
    expect(ABSENCE_TASK_SIZING.L3).toHaveLength(1);
  });

  it('ABSENCE_TASK_SIZING_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_TASK_SIZING_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_TASK_SIZING_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_TASK_SIZING_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_TASK_DEFINITION_OF_DONE has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_TASK_DEFINITION_OF_DONE.L1).toHaveLength(3);
    expect(ABSENCE_TASK_DEFINITION_OF_DONE.L2).toHaveLength(2);
    expect(ABSENCE_TASK_DEFINITION_OF_DONE.L3).toHaveLength(1);
  });

  it('ABSENCE_TASK_DEFINITION_OF_DONE_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_TASK_DEFINITION_OF_DONE_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_TASK_DEFINITION_OF_DONE_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_TASK_DEFINITION_OF_DONE_CASUAL.L3).toHaveLength(1);
  });

  it('every Sub-4 Group B formal/casual entry has non-empty question, pinchFallback, L1[0], L1[1], L2[0], L3[0]', () => {
    const entries = [
      ABSENCE_TASK_ORDERING,
      ABSENCE_TASK_ORDERING_CASUAL,
      ABSENCE_TASK_SIZING,
      ABSENCE_TASK_SIZING_CASUAL,
      ABSENCE_TASK_DEFINITION_OF_DONE,
      ABSENCE_TASK_DEFINITION_OF_DONE_CASUAL,
    ];
    for (const c of entries) {
      expect(c.question.length).toBeGreaterThan(0);
      expect(c.pinchFallback.length).toBeGreaterThan(0);
      expect(c.L1[0].length).toBeGreaterThan(0);
      expect(c.L1[1].length).toBeGreaterThan(0);
      expect(c.L2[0].length).toBeGreaterThan(0);
      expect(c.L3[0].length).toBeGreaterThan(0);
    }
  });
});

// ── DecisionContent structure — Sub-4 Group B beginner (task_breakdown signals) ─

describe('DecisionContent structure — Sub-4 Group B beginner (task_breakdown signals)', () => {
  it('ABSENCE_TASK_ORDERING_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_TASK_ORDERING_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_TASK_ORDERING_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_TASK_ORDERING_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_TASK_SIZING_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_TASK_SIZING_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_TASK_SIZING_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_TASK_SIZING_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_TASK_DEFINITION_OF_DONE_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_TASK_DEFINITION_OF_DONE_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_TASK_DEFINITION_OF_DONE_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_TASK_DEFINITION_OF_DONE_BEGINNER.L3).toHaveLength(1);
  });

  it('every Sub-4 Group B beginner entry has non-empty question, pinchFallback, L1[0], L1[1], L2[0], L3[0]', () => {
    const entries = [
      ABSENCE_TASK_ORDERING_BEGINNER,
      ABSENCE_TASK_SIZING_BEGINNER,
      ABSENCE_TASK_DEFINITION_OF_DONE_BEGINNER,
    ];
    for (const c of entries) {
      expect(c.question.length).toBeGreaterThan(0);
      expect(c.pinchFallback.length).toBeGreaterThan(0);
      expect(c.L1[0].length).toBeGreaterThan(0);
      expect(c.L1[1].length).toBeGreaterThan(0);
      expect(c.L2[0].length).toBeGreaterThan(0);
      expect(c.L3[0].length).toBeGreaterThan(0);
    }
  });
});

// ── DecisionContent structure — Sub-4 Group C formal/casual (feedback_loop signals) ─

describe('DecisionContent structure — Sub-4 Group C formal/casual (feedback_loop signals)', () => {
  it('ABSENCE_USER_FEEDBACK_REVIEW has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_USER_FEEDBACK_REVIEW.L1).toHaveLength(3);
    expect(ABSENCE_USER_FEEDBACK_REVIEW.L2).toHaveLength(2);
    expect(ABSENCE_USER_FEEDBACK_REVIEW.L3).toHaveLength(1);
  });

  it('ABSENCE_USER_FEEDBACK_REVIEW_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_USER_FEEDBACK_REVIEW_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_USER_FEEDBACK_REVIEW_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_USER_FEEDBACK_REVIEW_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_ITERATION_PLANNING has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ITERATION_PLANNING.L1).toHaveLength(3);
    expect(ABSENCE_ITERATION_PLANNING.L2).toHaveLength(2);
    expect(ABSENCE_ITERATION_PLANNING.L3).toHaveLength(1);
  });

  it('ABSENCE_ITERATION_PLANNING_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ITERATION_PLANNING_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_ITERATION_PLANNING_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_ITERATION_PLANNING_CASUAL.L3).toHaveLength(1);
  });

  it('every Sub-4 Group C formal/casual entry has non-empty question, pinchFallback, L1[0], L1[1], L2[0], L3[0]', () => {
    const entries = [
      ABSENCE_USER_FEEDBACK_REVIEW,
      ABSENCE_USER_FEEDBACK_REVIEW_CASUAL,
      ABSENCE_ITERATION_PLANNING,
      ABSENCE_ITERATION_PLANNING_CASUAL,
    ];
    for (const c of entries) {
      expect(c.question.length).toBeGreaterThan(0);
      expect(c.pinchFallback.length).toBeGreaterThan(0);
      expect(c.L1[0].length).toBeGreaterThan(0);
      expect(c.L1[1].length).toBeGreaterThan(0);
      expect(c.L2[0].length).toBeGreaterThan(0);
      expect(c.L3[0].length).toBeGreaterThan(0);
    }
  });
});

// ── DecisionContent structure — Sub-4 Group C beginner (feedback_loop signals) ─

describe('DecisionContent structure — Sub-4 Group C beginner (feedback_loop signals)', () => {
  it('ABSENCE_USER_FEEDBACK_REVIEW_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_USER_FEEDBACK_REVIEW_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_USER_FEEDBACK_REVIEW_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_USER_FEEDBACK_REVIEW_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_ITERATION_PLANNING_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_ITERATION_PLANNING_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_ITERATION_PLANNING_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_ITERATION_PLANNING_BEGINNER.L3).toHaveLength(1);
  });

  it('every Sub-4 Group C beginner entry has non-empty question, pinchFallback, L1[0], L1[1], L2[0], L3[0]', () => {
    const entries = [
      ABSENCE_USER_FEEDBACK_REVIEW_BEGINNER,
      ABSENCE_ITERATION_PLANNING_BEGINNER,
    ];
    for (const c of entries) {
      expect(c.question.length).toBeGreaterThan(0);
      expect(c.pinchFallback.length).toBeGreaterThan(0);
      expect(c.L1[0].length).toBeGreaterThan(0);
      expect(c.L1[1].length).toBeGreaterThan(0);
      expect(c.L2[0].length).toBeGreaterThan(0);
      expect(c.L3[0].length).toBeGreaterThan(0);
    }
  });
});

// ── DecisionContent structure — Sub-5 RELEASE_TO_FEEDBACK (non-beginner) ──────

describe('DecisionContent structure — Sub-5 RELEASE_TO_FEEDBACK (non-beginner)', () => {
  it('RELEASE_TO_FEEDBACK has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(RELEASE_TO_FEEDBACK.L1).toHaveLength(3);
    expect(RELEASE_TO_FEEDBACK.L2).toHaveLength(2);
    expect(RELEASE_TO_FEEDBACK.L3).toHaveLength(1);
  });

  it('RELEASE_TO_FEEDBACK has non-empty question, pinchFallback, L1[0], L1[1], L2[0], L3[0]', () => {
    expect(RELEASE_TO_FEEDBACK.question.length).toBeGreaterThan(0);
    expect(RELEASE_TO_FEEDBACK.pinchFallback.length).toBeGreaterThan(0);
    expect(RELEASE_TO_FEEDBACK.L1[0].length).toBeGreaterThan(0);
    expect(RELEASE_TO_FEEDBACK.L1[1].length).toBeGreaterThan(0);
    expect(RELEASE_TO_FEEDBACK.L2[0].length).toBeGreaterThan(0);
    expect(RELEASE_TO_FEEDBACK.L3[0].length).toBeGreaterThan(0);
  });
});

// ── DecisionContent structure — Sub-5 RELEASE_TO_FEEDBACK_BEGINNER ────────────

describe('DecisionContent structure — Sub-5 RELEASE_TO_FEEDBACK_BEGINNER', () => {
  it('RELEASE_TO_FEEDBACK_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    const beginner = TRANSITION_CONTENT_BEGINNER.feedback_loop!;
    expect(beginner.L1).toHaveLength(2);
    expect(beginner.L2).toHaveLength(1);
    expect(beginner.L3).toHaveLength(1);
  });

  it('RELEASE_TO_FEEDBACK_BEGINNER has non-empty question, pinchFallback, L1[0], L1[1], L2[0], L3[0]', () => {
    const beginner = TRANSITION_CONTENT_BEGINNER.feedback_loop!;
    expect(beginner.question.length).toBeGreaterThan(0);
    expect(beginner.pinchFallback.length).toBeGreaterThan(0);
    expect(beginner.L1[0].length).toBeGreaterThan(0);
    expect(beginner.L1[1].length).toBeGreaterThan(0);
    expect(beginner.L2[0].length).toBeGreaterThan(0);
    expect(beginner.L3[0].length).toBeGreaterThan(0);
  });
});

// ── DecisionContent structure — Sub-7 formal content sets ────────────────────

describe('DecisionContent structure — Sub-7 formal content sets', () => {
  it('ABSENCE_SCOPE_CREEP has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SCOPE_CREEP.L1).toHaveLength(3);
    expect(ABSENCE_SCOPE_CREEP.L2).toHaveLength(2);
    expect(ABSENCE_SCOPE_CREEP.L3).toHaveLength(1);
  });

  it('ABSENCE_CONTEXT_LOSS has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_CONTEXT_LOSS.L1).toHaveLength(3);
    expect(ABSENCE_CONTEXT_LOSS.L2).toHaveLength(2);
    expect(ABSENCE_CONTEXT_LOSS.L3).toHaveLength(1);
  });

  it('ABSENCE_API_DESIGN_REVIEW has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_API_DESIGN_REVIEW.L1).toHaveLength(3);
    expect(ABSENCE_API_DESIGN_REVIEW.L2).toHaveLength(2);
    expect(ABSENCE_API_DESIGN_REVIEW.L3).toHaveLength(1);
  });

  it('ABSENCE_ACCESSIBILITY has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ACCESSIBILITY.L1).toHaveLength(3);
    expect(ABSENCE_ACCESSIBILITY.L2).toHaveLength(2);
    expect(ABSENCE_ACCESSIBILITY.L3).toHaveLength(1);
  });

  it('ABSENCE_ENV_AND_SECRETS has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ENV_AND_SECRETS.L1).toHaveLength(3);
    expect(ABSENCE_ENV_AND_SECRETS.L2).toHaveLength(2);
    expect(ABSENCE_ENV_AND_SECRETS.L3).toHaveLength(1);
  });

  it('ABSENCE_DATA_VALIDATION has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_DATA_VALIDATION.L1).toHaveLength(3);
    expect(ABSENCE_DATA_VALIDATION.L2).toHaveLength(2);
    expect(ABSENCE_DATA_VALIDATION.L3).toHaveLength(1);
  });

  it('ABSENCE_CI_PIPELINE has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_CI_PIPELINE.L1).toHaveLength(3);
    expect(ABSENCE_CI_PIPELINE.L2).toHaveLength(2);
    expect(ABSENCE_CI_PIPELINE.L3).toHaveLength(1);
  });

  it('ABSENCE_RATE_LIMITING has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_RATE_LIMITING.L1).toHaveLength(3);
    expect(ABSENCE_RATE_LIMITING.L2).toHaveLength(2);
    expect(ABSENCE_RATE_LIMITING.L3).toHaveLength(1);
  });

  it('every Sub-7 formal entry has non-empty question, pinchFallback, L1[0], L2[0], L3[0]', () => {
    const entries = [
      ABSENCE_SCOPE_CREEP,
      ABSENCE_CONTEXT_LOSS,
      ABSENCE_API_DESIGN_REVIEW,
      ABSENCE_ACCESSIBILITY,
      ABSENCE_ENV_AND_SECRETS,
      ABSENCE_DATA_VALIDATION,
      ABSENCE_CI_PIPELINE,
      ABSENCE_RATE_LIMITING,
    ];
    for (const c of entries) {
      expect(c.question.length).toBeGreaterThan(0);
      expect(c.pinchFallback.length).toBeGreaterThan(0);
      expect(c.L1[0].length).toBeGreaterThan(0);
      expect(c.L2[0].length).toBeGreaterThan(0);
      expect(c.L3[0].length).toBeGreaterThan(0);
    }
  });
});

// ── DecisionContent structure — Sub-7 casual content sets ─────────────────────

describe('DecisionContent structure — Sub-7 casual content sets', () => {
  it('ABSENCE_SCOPE_CREEP_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SCOPE_CREEP_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_SCOPE_CREEP_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_SCOPE_CREEP_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_CONTEXT_LOSS_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_CONTEXT_LOSS_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_CONTEXT_LOSS_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_CONTEXT_LOSS_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_API_DESIGN_REVIEW_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_API_DESIGN_REVIEW_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_API_DESIGN_REVIEW_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_API_DESIGN_REVIEW_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_ACCESSIBILITY_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ACCESSIBILITY_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_ACCESSIBILITY_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_ACCESSIBILITY_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_ENV_AND_SECRETS_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ENV_AND_SECRETS_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_ENV_AND_SECRETS_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_ENV_AND_SECRETS_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_DATA_VALIDATION_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_DATA_VALIDATION_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_DATA_VALIDATION_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_DATA_VALIDATION_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_CI_PIPELINE_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_CI_PIPELINE_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_CI_PIPELINE_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_CI_PIPELINE_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_RATE_LIMITING_CASUAL has exactly 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_RATE_LIMITING_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_RATE_LIMITING_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_RATE_LIMITING_CASUAL.L3).toHaveLength(1);
  });

  it('every Sub-7 casual entry has non-empty question, pinchFallback, L1[0], L2[0], L3[0]', () => {
    const entries = [
      ABSENCE_SCOPE_CREEP_CASUAL,
      ABSENCE_CONTEXT_LOSS_CASUAL,
      ABSENCE_API_DESIGN_REVIEW_CASUAL,
      ABSENCE_ACCESSIBILITY_CASUAL,
      ABSENCE_ENV_AND_SECRETS_CASUAL,
      ABSENCE_DATA_VALIDATION_CASUAL,
      ABSENCE_CI_PIPELINE_CASUAL,
      ABSENCE_RATE_LIMITING_CASUAL,
    ];
    for (const c of entries) {
      expect(c.question.length).toBeGreaterThan(0);
      expect(c.pinchFallback.length).toBeGreaterThan(0);
      expect(c.L1[0].length).toBeGreaterThan(0);
      expect(c.L2[0].length).toBeGreaterThan(0);
      expect(c.L3[0].length).toBeGreaterThan(0);
    }
  });
});

// ── DecisionContent structure — Sub-7 beginner content sets ───────────────────

describe('DecisionContent structure — Sub-7 beginner content sets', () => {
  it('ABSENCE_SCOPE_CREEP_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_SCOPE_CREEP_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_SCOPE_CREEP_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_SCOPE_CREEP_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_CONTEXT_LOSS_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_CONTEXT_LOSS_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_CONTEXT_LOSS_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_CONTEXT_LOSS_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_API_DESIGN_REVIEW_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_API_DESIGN_REVIEW_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_API_DESIGN_REVIEW_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_API_DESIGN_REVIEW_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_ACCESSIBILITY_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_ACCESSIBILITY_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_ACCESSIBILITY_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_ACCESSIBILITY_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_ENV_AND_SECRETS_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_ENV_AND_SECRETS_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_ENV_AND_SECRETS_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_ENV_AND_SECRETS_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_DATA_VALIDATION_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_DATA_VALIDATION_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_DATA_VALIDATION_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_DATA_VALIDATION_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_CI_PIPELINE_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_CI_PIPELINE_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_CI_PIPELINE_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_CI_PIPELINE_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_RATE_LIMITING_BEGINNER has exactly 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_RATE_LIMITING_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_RATE_LIMITING_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_RATE_LIMITING_BEGINNER.L3).toHaveLength(1);
  });

  it('every Sub-7 beginner entry has non-empty question, pinchFallback, L1[0], L1[1], L2[0], L3[0]', () => {
    const entries = [
      ABSENCE_SCOPE_CREEP_BEGINNER,
      ABSENCE_CONTEXT_LOSS_BEGINNER,
      ABSENCE_API_DESIGN_REVIEW_BEGINNER,
      ABSENCE_ACCESSIBILITY_BEGINNER,
      ABSENCE_ENV_AND_SECRETS_BEGINNER,
      ABSENCE_DATA_VALIDATION_BEGINNER,
      ABSENCE_CI_PIPELINE_BEGINNER,
      ABSENCE_RATE_LIMITING_BEGINNER,
    ];
    for (const c of entries) {
      expect(c.question.length).toBeGreaterThan(0);
      expect(c.pinchFallback.length).toBeGreaterThan(0);
      expect(c.L1[0].length).toBeGreaterThan(0);
      expect(c.L1[1].length).toBeGreaterThan(0);
      expect(c.L2[0].length).toBeGreaterThan(0);
      expect(c.L3[0].length).toBeGreaterThan(0);
    }
  });
});

// ── Phase 2 — Stream B universal signals content routing ─────────────────────

describe('resolveDecisionContent — Stream B universal signals', () => {
  const makeProfile = (nature: 'beginner' | 'cool_geek' | 'pro_geek_soul' | 'hardcore_pro') =>
    ({ nature } as UserProfile);

  // ── feature_scope_before_build routing ────────────────────────────────────────

  it('absence:feature_scope_before_build, no profile → ABSENCE_FEATURE_SCOPE_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:feature_scope_before_build');
    expect(content).toBe(ABSENCE_FEATURE_SCOPE_CASUAL);
  });

  it('absence:feature_scope_before_build, pro_geek_soul → ABSENCE_FEATURE_SCOPE_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:feature_scope_before_build', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_FEATURE_SCOPE_CASUAL);
  });

  it('absence:feature_scope_before_build, hardcore_pro → ABSENCE_FEATURE_SCOPE (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:feature_scope_before_build', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_FEATURE_SCOPE);
  });

  it('absence:feature_scope_before_build, beginner → ABSENCE_FEATURE_SCOPE_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:feature_scope_before_build', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_FEATURE_SCOPE_BEGINNER);
  });

  it('absence:feature_scope_before_build, cool_geek → ABSENCE_FEATURE_SCOPE_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:feature_scope_before_build', makeProfile('cool_geek'));
    expect(content).toBe(ABSENCE_FEATURE_SCOPE_CASUAL);
  });

  // ── implementation_checkpoint routing ─────────────────────────────────────────

  it('absence:implementation_checkpoint, no profile → ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:implementation_checkpoint');
    expect(content).toBe(ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL);
  });

  it('absence:implementation_checkpoint, pro_geek_soul → ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:implementation_checkpoint', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL);
  });

  it('absence:implementation_checkpoint, hardcore_pro → ABSENCE_IMPLEMENTATION_CHECKPOINT (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:implementation_checkpoint', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_IMPLEMENTATION_CHECKPOINT);
  });

  it('absence:implementation_checkpoint, beginner → ABSENCE_IMPLEMENTATION_CHECKPOINT_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:implementation_checkpoint', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_IMPLEMENTATION_CHECKPOINT_BEGINNER);
  });

  it('absence:implementation_checkpoint, cool_geek → ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:implementation_checkpoint', makeProfile('cool_geek'));
    expect(content).toBe(ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL);
  });

  // ── spec_before_code routing ──────────────────────────────────────────────────

  it('absence:spec_before_code, no profile → ABSENCE_SPEC_BEFORE_CODE_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:spec_before_code');
    expect(content).toBe(ABSENCE_SPEC_BEFORE_CODE_CASUAL);
  });

  it('absence:spec_before_code, pro_geek_soul → ABSENCE_SPEC_BEFORE_CODE_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:spec_before_code', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_SPEC_BEFORE_CODE_CASUAL);
  });

  it('absence:spec_before_code, hardcore_pro → ABSENCE_SPEC_BEFORE_CODE (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:spec_before_code', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_SPEC_BEFORE_CODE);
  });

  it('absence:spec_before_code, beginner → ABSENCE_SPEC_BEFORE_CODE_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:spec_before_code', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_SPEC_BEFORE_CODE_BEGINNER);
  });

  it('absence:spec_before_code, cool_geek → ABSENCE_SPEC_BEFORE_CODE_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:spec_before_code', makeProfile('cool_geek'));
    expect(content).toBe(ABSENCE_SPEC_BEFORE_CODE_CASUAL);
  });

  // ── Structure validation ──────────────────────────────────────────────────────

  it('ABSENCE_FEATURE_SCOPE has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_FEATURE_SCOPE.L1).toHaveLength(3);
    expect(ABSENCE_FEATURE_SCOPE.L2).toHaveLength(2);
    expect(ABSENCE_FEATURE_SCOPE.L3).toHaveLength(1);
  });

  it('ABSENCE_FEATURE_SCOPE_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_FEATURE_SCOPE_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_FEATURE_SCOPE_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_FEATURE_SCOPE_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_FEATURE_SCOPE_BEGINNER has 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_FEATURE_SCOPE_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_FEATURE_SCOPE_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_FEATURE_SCOPE_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_IMPLEMENTATION_CHECKPOINT has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_IMPLEMENTATION_CHECKPOINT.L1).toHaveLength(3);
    expect(ABSENCE_IMPLEMENTATION_CHECKPOINT.L2).toHaveLength(2);
    expect(ABSENCE_IMPLEMENTATION_CHECKPOINT.L3).toHaveLength(1);
  });

  it('ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_IMPLEMENTATION_CHECKPOINT_BEGINNER has 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_IMPLEMENTATION_CHECKPOINT_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_IMPLEMENTATION_CHECKPOINT_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_IMPLEMENTATION_CHECKPOINT_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_SPEC_BEFORE_CODE has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SPEC_BEFORE_CODE.L1).toHaveLength(3);
    expect(ABSENCE_SPEC_BEFORE_CODE.L2).toHaveLength(2);
    expect(ABSENCE_SPEC_BEFORE_CODE.L3).toHaveLength(1);
  });

  it('ABSENCE_SPEC_BEFORE_CODE_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SPEC_BEFORE_CODE_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_SPEC_BEFORE_CODE_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_SPEC_BEFORE_CODE_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_SPEC_BEFORE_CODE_BEGINNER has 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_SPEC_BEFORE_CODE_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_SPEC_BEFORE_CODE_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_SPEC_BEFORE_CODE_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_CONTENT_BEGINNER contains all 3 Stream B keys', () => {
    expect('feature_scope_before_build' in ABSENCE_CONTENT_BEGINNER).toBe(true);
    expect('implementation_checkpoint' in ABSENCE_CONTENT_BEGINNER).toBe(true);
    expect('spec_before_code' in ABSENCE_CONTENT_BEGINNER).toBe(true);
  });

  // ── Phase 5 D1 — incremental_build routing (universal) ───────────────────────

  it('absence:incremental_build, no profile → ABSENCE_INCREMENTAL_BUILD_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:incremental_build');
    expect(content).toBe(ABSENCE_INCREMENTAL_BUILD_CASUAL);
  });

  it('absence:incremental_build, pro_geek_soul → ABSENCE_INCREMENTAL_BUILD_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:incremental_build', makeProfile('pro_geek_soul'));
    expect(content).toBe(ABSENCE_INCREMENTAL_BUILD_CASUAL);
  });

  it('absence:incremental_build, hardcore_pro → ABSENCE_INCREMENTAL_BUILD (formal)', () => {
    const content = resolveDecisionContent('implementation', 'absence:incremental_build', makeProfile('hardcore_pro'));
    expect(content).toBe(ABSENCE_INCREMENTAL_BUILD);
  });

  it('absence:incremental_build, beginner → ABSENCE_INCREMENTAL_BUILD_BEGINNER', () => {
    const content = resolveDecisionContent('implementation', 'absence:incremental_build', makeProfile('beginner'));
    expect(content).toBe(ABSENCE_INCREMENTAL_BUILD_BEGINNER);
  });

  it('absence:incremental_build, cool_geek → ABSENCE_INCREMENTAL_BUILD_CASUAL', () => {
    const content = resolveDecisionContent('implementation', 'absence:incremental_build', makeProfile('cool_geek'));
    expect(content).toBe(ABSENCE_INCREMENTAL_BUILD_CASUAL);
  });

  it('ABSENCE_INCREMENTAL_BUILD has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_INCREMENTAL_BUILD.L1).toHaveLength(3);
    expect(ABSENCE_INCREMENTAL_BUILD.L2).toHaveLength(2);
    expect(ABSENCE_INCREMENTAL_BUILD.L3).toHaveLength(1);
  });

  it('ABSENCE_INCREMENTAL_BUILD_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_INCREMENTAL_BUILD_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_INCREMENTAL_BUILD_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_INCREMENTAL_BUILD_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_INCREMENTAL_BUILD_BEGINNER has 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_INCREMENTAL_BUILD_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_INCREMENTAL_BUILD_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_INCREMENTAL_BUILD_BEGINNER.L3).toHaveLength(1);
  });

  // ── Phase 5 D1-D3 — beginner signal routing ───────────────────────────────────

  it('absence:error_understanding, beginner → ABSENCE_ERROR_UNDERSTANDING_BEGINNER', () => {
    expect(resolveDecisionContent('implementation', 'absence:error_understanding', makeProfile('beginner'))).toBe(ABSENCE_ERROR_UNDERSTANDING_BEGINNER);
  });

  it('absence:error_understanding, cool_geek → TASK_REVIEW_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:error_understanding', makeProfile('cool_geek'))).toBe(TASK_REVIEW_CASUAL);
  });

  it('ABSENCE_ERROR_UNDERSTANDING_BEGINNER has 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_ERROR_UNDERSTANDING_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_ERROR_UNDERSTANDING_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_ERROR_UNDERSTANDING_BEGINNER.L3).toHaveLength(1);
  });

  it('absence:documentation_before_ask, beginner → ABSENCE_DOCUMENTATION_BEFORE_ASK_BEGINNER', () => {
    expect(resolveDecisionContent('implementation', 'absence:documentation_before_ask', makeProfile('beginner'))).toBe(ABSENCE_DOCUMENTATION_BEFORE_ASK_BEGINNER);
  });

  it('absence:documentation_before_ask, cool_geek → TASK_REVIEW_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:documentation_before_ask', makeProfile('cool_geek'))).toBe(TASK_REVIEW_CASUAL);
  });

  it('ABSENCE_DOCUMENTATION_BEFORE_ASK_BEGINNER has 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_DOCUMENTATION_BEFORE_ASK_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_DOCUMENTATION_BEFORE_ASK_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_DOCUMENTATION_BEFORE_ASK_BEGINNER.L3).toHaveLength(1);
  });

  it('absence:output_verification, beginner → ABSENCE_OUTPUT_VERIFICATION_BEGINNER', () => {
    expect(resolveDecisionContent('implementation', 'absence:output_verification', makeProfile('beginner'))).toBe(ABSENCE_OUTPUT_VERIFICATION_BEGINNER);
  });

  it('absence:output_verification, cool_geek → TASK_REVIEW_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:output_verification', makeProfile('cool_geek'))).toBe(TASK_REVIEW_CASUAL);
  });

  it('ABSENCE_OUTPUT_VERIFICATION_BEGINNER has 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_OUTPUT_VERIFICATION_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_OUTPUT_VERIFICATION_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_OUTPUT_VERIFICATION_BEGINNER.L3).toHaveLength(1);
  });

  it('absence:requirement_clarity_before_ask, beginner → ABSENCE_REQUIREMENT_CLARITY_BEGINNER', () => {
    expect(resolveDecisionContent('implementation', 'absence:requirement_clarity_before_ask', makeProfile('beginner'))).toBe(ABSENCE_REQUIREMENT_CLARITY_BEGINNER);
  });

  it('absence:requirement_clarity_before_ask, cool_geek → TASK_REVIEW_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:requirement_clarity_before_ask', makeProfile('cool_geek'))).toBe(TASK_REVIEW_CASUAL);
  });

  it('ABSENCE_REQUIREMENT_CLARITY_BEGINNER has 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_REQUIREMENT_CLARITY_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_REQUIREMENT_CLARITY_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_REQUIREMENT_CLARITY_BEGINNER.L3).toHaveLength(1);
  });

  it('absence:copy_paste_awareness, beginner → ABSENCE_COPY_PASTE_AWARENESS_BEGINNER', () => {
    expect(resolveDecisionContent('implementation', 'absence:copy_paste_awareness', makeProfile('beginner'))).toBe(ABSENCE_COPY_PASTE_AWARENESS_BEGINNER);
  });

  it('absence:copy_paste_awareness, cool_geek → TASK_REVIEW_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:copy_paste_awareness', makeProfile('cool_geek'))).toBe(TASK_REVIEW_CASUAL);
  });

  it('ABSENCE_COPY_PASTE_AWARENESS_BEGINNER has 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_COPY_PASTE_AWARENESS_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_COPY_PASTE_AWARENESS_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_COPY_PASTE_AWARENESS_BEGINNER.L3).toHaveLength(1);
  });

  it('absence:debugging_observation_gap, beginner → ABSENCE_DEBUGGING_OBSERVATION_BEGINNER', () => {
    expect(resolveDecisionContent('implementation', 'absence:debugging_observation_gap', makeProfile('beginner'))).toBe(ABSENCE_DEBUGGING_OBSERVATION_BEGINNER);
  });

  it('absence:debugging_observation_gap, cool_geek → TASK_REVIEW_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:debugging_observation_gap', makeProfile('cool_geek'))).toBe(TASK_REVIEW_CASUAL);
  });

  it('ABSENCE_DEBUGGING_OBSERVATION_BEGINNER has 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_DEBUGGING_OBSERVATION_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_DEBUGGING_OBSERVATION_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_DEBUGGING_OBSERVATION_BEGINNER.L3).toHaveLength(1);
  });

  it('absence:learning_consolidation, beginner → ABSENCE_LEARNING_CONSOLIDATION_BEGINNER', () => {
    expect(resolveDecisionContent('implementation', 'absence:learning_consolidation', makeProfile('beginner'))).toBe(ABSENCE_LEARNING_CONSOLIDATION_BEGINNER);
  });

  it('absence:learning_consolidation, cool_geek → TASK_REVIEW_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:learning_consolidation', makeProfile('cool_geek'))).toBe(TASK_REVIEW_CASUAL);
  });

  it('ABSENCE_LEARNING_CONSOLIDATION_BEGINNER has 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_LEARNING_CONSOLIDATION_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_LEARNING_CONSOLIDATION_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_LEARNING_CONSOLIDATION_BEGINNER.L3).toHaveLength(1);
  });

  it('absence:simple_solution_first, beginner → ABSENCE_SIMPLE_SOLUTION_FIRST_BEGINNER', () => {
    expect(resolveDecisionContent('implementation', 'absence:simple_solution_first', makeProfile('beginner'))).toBe(ABSENCE_SIMPLE_SOLUTION_FIRST_BEGINNER);
  });

  it('absence:simple_solution_first, cool_geek → TASK_REVIEW_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:simple_solution_first', makeProfile('cool_geek'))).toBe(TASK_REVIEW_CASUAL);
  });

  it('ABSENCE_SIMPLE_SOLUTION_FIRST_BEGINNER has 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_SIMPLE_SOLUTION_FIRST_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_SIMPLE_SOLUTION_FIRST_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_SIMPLE_SOLUTION_FIRST_BEGINNER.L3).toHaveLength(1);
  });

  it('absence:single_responsibility_prompting, beginner → ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER', () => {
    expect(resolveDecisionContent('implementation', 'absence:single_responsibility_prompting', makeProfile('beginner'))).toBe(ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER);
  });

  it('absence:single_responsibility_prompting, cool_geek → TASK_REVIEW_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:single_responsibility_prompting', makeProfile('cool_geek'))).toBe(TASK_REVIEW_CASUAL);
  });

  it('ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER has 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER.L3).toHaveLength(1);
  });

  it('absence:rollback_awareness, beginner → ABSENCE_ROLLBACK_AWARENESS_BEGINNER', () => {
    expect(resolveDecisionContent('implementation', 'absence:rollback_awareness', makeProfile('beginner'))).toBe(ABSENCE_ROLLBACK_AWARENESS_BEGINNER);
  });

  it('absence:rollback_awareness, cool_geek → TASK_REVIEW_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:rollback_awareness', makeProfile('cool_geek'))).toBe(TASK_REVIEW_CASUAL);
  });

  it('ABSENCE_ROLLBACK_AWARENESS_BEGINNER has 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_ROLLBACK_AWARENESS_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_ROLLBACK_AWARENESS_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_ROLLBACK_AWARENESS_BEGINNER.L3).toHaveLength(1);
  });

  it('absence:build_vs_understand_ratio, beginner → ABSENCE_BUILD_VS_UNDERSTAND_RATIO_BEGINNER', () => {
    expect(resolveDecisionContent('implementation', 'absence:build_vs_understand_ratio', makeProfile('beginner'))).toBe(ABSENCE_BUILD_VS_UNDERSTAND_RATIO_BEGINNER);
  });

  it('absence:build_vs_understand_ratio, cool_geek → TASK_REVIEW_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:build_vs_understand_ratio', makeProfile('cool_geek'))).toBe(TASK_REVIEW_CASUAL);
  });

  it('ABSENCE_BUILD_VS_UNDERSTAND_RATIO_BEGINNER has 2 L1, 1 L2, 1 L3 options', () => {
    expect(ABSENCE_BUILD_VS_UNDERSTAND_RATIO_BEGINNER.L1).toHaveLength(2);
    expect(ABSENCE_BUILD_VS_UNDERSTAND_RATIO_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_BUILD_VS_UNDERSTAND_RATIO_BEGINNER.L3).toHaveLength(1);
  });

  // ── Phase 5 D4-D6 — cool_geek signal routing (CASUAL map) ──────────────────

  it('absence:feature_completion_check, cool_geek → ABSENCE_FEATURE_COMPLETION_CHECK_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:feature_completion_check', makeProfile('cool_geek'))).toBe(ABSENCE_FEATURE_COMPLETION_CHECK_CASUAL);
  });

  it('ABSENCE_FEATURE_COMPLETION_CHECK_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_FEATURE_COMPLETION_CHECK_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_FEATURE_COMPLETION_CHECK_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_FEATURE_COMPLETION_CHECK_CASUAL.L3).toHaveLength(1);
  });

  it('absence:finishing_line_awareness, cool_geek → ABSENCE_FINISHING_LINE_AWARENESS_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:finishing_line_awareness', makeProfile('cool_geek'))).toBe(ABSENCE_FINISHING_LINE_AWARENESS_CASUAL);
  });

  it('ABSENCE_FINISHING_LINE_AWARENESS_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_FINISHING_LINE_AWARENESS_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_FINISHING_LINE_AWARENESS_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_FINISHING_LINE_AWARENESS_CASUAL.L3).toHaveLength(1);
  });

  it('absence:polish_vs_function, cool_geek → ABSENCE_POLISH_VS_FUNCTION_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:polish_vs_function', makeProfile('cool_geek'))).toBe(ABSENCE_POLISH_VS_FUNCTION_CASUAL);
  });

  it('ABSENCE_POLISH_VS_FUNCTION_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_POLISH_VS_FUNCTION_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_POLISH_VS_FUNCTION_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_POLISH_VS_FUNCTION_CASUAL.L3).toHaveLength(1);
  });

  it('absence:mvp_scope_discipline, cool_geek → ABSENCE_MVP_SCOPE_DISCIPLINE_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:mvp_scope_discipline', makeProfile('cool_geek'))).toBe(ABSENCE_MVP_SCOPE_DISCIPLINE_CASUAL);
  });

  it('ABSENCE_MVP_SCOPE_DISCIPLINE_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_MVP_SCOPE_DISCIPLINE_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_MVP_SCOPE_DISCIPLINE_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_MVP_SCOPE_DISCIPLINE_CASUAL.L3).toHaveLength(1);
  });

  it('absence:idea_to_spec_bridge, cool_geek → ABSENCE_IDEA_TO_SPEC_BRIDGE_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:idea_to_spec_bridge', makeProfile('cool_geek'))).toBe(ABSENCE_IDEA_TO_SPEC_BRIDGE_CASUAL);
  });

  it('ABSENCE_IDEA_TO_SPEC_BRIDGE_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_IDEA_TO_SPEC_BRIDGE_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_IDEA_TO_SPEC_BRIDGE_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_IDEA_TO_SPEC_BRIDGE_CASUAL.L3).toHaveLength(1);
  });

  it('absence:demo_vs_product, cool_geek → ABSENCE_DEMO_VS_PRODUCT_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:demo_vs_product', makeProfile('cool_geek'))).toBe(ABSENCE_DEMO_VS_PRODUCT_CASUAL);
  });

  it('ABSENCE_DEMO_VS_PRODUCT_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_DEMO_VS_PRODUCT_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_DEMO_VS_PRODUCT_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_DEMO_VS_PRODUCT_CASUAL.L3).toHaveLength(1);
  });

  it('absence:user_journey_check, cool_geek → ABSENCE_USER_JOURNEY_CHECK_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:user_journey_check', makeProfile('cool_geek'))).toBe(ABSENCE_USER_JOURNEY_CHECK_CASUAL);
  });

  it('ABSENCE_USER_JOURNEY_CHECK_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_USER_JOURNEY_CHECK_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_USER_JOURNEY_CHECK_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_USER_JOURNEY_CHECK_CASUAL.L3).toHaveLength(1);
  });

  it('absence:technical_spike_treatment, cool_geek → ABSENCE_TECHNICAL_SPIKE_TREATMENT_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:technical_spike_treatment', makeProfile('cool_geek'))).toBe(ABSENCE_TECHNICAL_SPIKE_TREATMENT_CASUAL);
  });

  it('ABSENCE_TECHNICAL_SPIKE_TREATMENT_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_TECHNICAL_SPIKE_TREATMENT_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_TECHNICAL_SPIKE_TREATMENT_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_TECHNICAL_SPIKE_TREATMENT_CASUAL.L3).toHaveLength(1);
  });

  it('absence:dependency_adventure, cool_geek → ABSENCE_DEPENDENCY_ADVENTURE_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:dependency_adventure', makeProfile('cool_geek'))).toBe(ABSENCE_DEPENDENCY_ADVENTURE_CASUAL);
  });

  it('ABSENCE_DEPENDENCY_ADVENTURE_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_DEPENDENCY_ADVENTURE_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_DEPENDENCY_ADVENTURE_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_DEPENDENCY_ADVENTURE_CASUAL.L3).toHaveLength(1);
  });

  it('absence:restart_impulse_check, cool_geek → ABSENCE_RESTART_IMPULSE_CHECK_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:restart_impulse_check', makeProfile('cool_geek'))).toBe(ABSENCE_RESTART_IMPULSE_CHECK_CASUAL);
  });

  it('ABSENCE_RESTART_IMPULSE_CHECK_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_RESTART_IMPULSE_CHECK_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_RESTART_IMPULSE_CHECK_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_RESTART_IMPULSE_CHECK_CASUAL.L3).toHaveLength(1);
  });

  it('absence:creative_vs_core_ratio, cool_geek → ABSENCE_CREATIVE_VS_CORE_RATIO_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:creative_vs_core_ratio', makeProfile('cool_geek'))).toBe(ABSENCE_CREATIVE_VS_CORE_RATIO_CASUAL);
  });

  it('ABSENCE_CREATIVE_VS_CORE_RATIO_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_CREATIVE_VS_CORE_RATIO_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_CREATIVE_VS_CORE_RATIO_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_CREATIVE_VS_CORE_RATIO_CASUAL.L3).toHaveLength(1);
  });

  // ── Phase 5 D7-D9 — pro_geek_soul signal routing ─────────────────────────────

  it('absence:code_documentation_gap, no profile → ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:code_documentation_gap')).toBe(ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL);
  });

  it('absence:code_documentation_gap, pro_geek_soul → ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:code_documentation_gap', makeProfile('pro_geek_soul'))).toBe(ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL);
  });

  it('ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL.L3).toHaveLength(1);
  });

  it('absence:technical_debt_acknowledgment, no profile → ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:technical_debt_acknowledgment')).toBe(ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL);
  });

  it('absence:technical_debt_acknowledgment, pro_geek_soul → ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:technical_debt_acknowledgment', makeProfile('pro_geek_soul'))).toBe(ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL);
  });

  it('ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL.L3).toHaveLength(1);
  });

  it('absence:test_depth_check, no profile → ABSENCE_TEST_DEPTH_CHECK_CASUAL', () => {
    expect(resolveDecisionContent('review_testing', 'absence:test_depth_check')).toBe(ABSENCE_TEST_DEPTH_CHECK_CASUAL);
  });

  it('absence:test_depth_check, pro_geek_soul → ABSENCE_TEST_DEPTH_CHECK_CASUAL', () => {
    expect(resolveDecisionContent('review_testing', 'absence:test_depth_check', makeProfile('pro_geek_soul'))).toBe(ABSENCE_TEST_DEPTH_CHECK_CASUAL);
  });

  it('ABSENCE_TEST_DEPTH_CHECK_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_TEST_DEPTH_CHECK_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_TEST_DEPTH_CHECK_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_TEST_DEPTH_CHECK_CASUAL.L3).toHaveLength(1);
  });

  it('absence:architecture_note_absence, no profile → ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:architecture_note_absence')).toBe(ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL);
  });

  it('absence:architecture_note_absence, pro_geek_soul → ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:architecture_note_absence', makeProfile('pro_geek_soul'))).toBe(ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL);
  });

  it('ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL.L3).toHaveLength(1);
  });

  it('absence:dependency_audit_gap, no profile → ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:dependency_audit_gap')).toBe(ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL);
  });

  it('absence:dependency_audit_gap, pro_geek_soul → ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:dependency_audit_gap', makeProfile('pro_geek_soul'))).toBe(ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL);
  });

  it('ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL.L3).toHaveLength(1);
  });

  it('absence:security_review_gap, no profile → ABSENCE_SECURITY_REVIEW_GAP_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:security_review_gap')).toBe(ABSENCE_SECURITY_REVIEW_GAP_CASUAL);
  });

  it('absence:security_review_gap, pro_geek_soul → ABSENCE_SECURITY_REVIEW_GAP_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:security_review_gap', makeProfile('pro_geek_soul'))).toBe(ABSENCE_SECURITY_REVIEW_GAP_CASUAL);
  });

  it('ABSENCE_SECURITY_REVIEW_GAP_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SECURITY_REVIEW_GAP_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_SECURITY_REVIEW_GAP_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_SECURITY_REVIEW_GAP_CASUAL.L3).toHaveLength(1);
  });

  it('absence:api_contract_definition, no profile → ABSENCE_API_CONTRACT_DEFINITION_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:api_contract_definition')).toBe(ABSENCE_API_CONTRACT_DEFINITION_CASUAL);
  });

  it('absence:api_contract_definition, pro_geek_soul → ABSENCE_API_CONTRACT_DEFINITION_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:api_contract_definition', makeProfile('pro_geek_soul'))).toBe(ABSENCE_API_CONTRACT_DEFINITION_CASUAL);
  });

  it('ABSENCE_API_CONTRACT_DEFINITION_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_API_CONTRACT_DEFINITION_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_API_CONTRACT_DEFINITION_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_API_CONTRACT_DEFINITION_CASUAL.L3).toHaveLength(1);
  });

  it('absence:error_handling_coverage, no profile → ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:error_handling_coverage')).toBe(ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL);
  });

  it('absence:error_handling_coverage, pro_geek_soul → ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:error_handling_coverage', makeProfile('pro_geek_soul'))).toBe(ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL);
  });

  it('ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL.L3).toHaveLength(1);
  });

  it('absence:refactoring_checkpoint, no profile → ABSENCE_REFACTORING_CHECKPOINT_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:refactoring_checkpoint')).toBe(ABSENCE_REFACTORING_CHECKPOINT_CASUAL);
  });

  it('absence:refactoring_checkpoint, pro_geek_soul → ABSENCE_REFACTORING_CHECKPOINT_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:refactoring_checkpoint', makeProfile('pro_geek_soul'))).toBe(ABSENCE_REFACTORING_CHECKPOINT_CASUAL);
  });

  it('ABSENCE_REFACTORING_CHECKPOINT_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_REFACTORING_CHECKPOINT_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_REFACTORING_CHECKPOINT_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_REFACTORING_CHECKPOINT_CASUAL.L3).toHaveLength(1);
  });

  it('absence:backwards_compatibility_check, no profile → ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:backwards_compatibility_check')).toBe(ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL);
  });

  it('absence:backwards_compatibility_check, pro_geek_soul → ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:backwards_compatibility_check', makeProfile('pro_geek_soul'))).toBe(ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL);
  });

  it('ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL.L3).toHaveLength(1);
  });

  it('absence:self_review_habit, no profile → ABSENCE_SELF_REVIEW_HABIT_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:self_review_habit')).toBe(ABSENCE_SELF_REVIEW_HABIT_CASUAL);
  });

  it('absence:self_review_habit, pro_geek_soul → ABSENCE_SELF_REVIEW_HABIT_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:self_review_habit', makeProfile('pro_geek_soul'))).toBe(ABSENCE_SELF_REVIEW_HABIT_CASUAL);
  });

  it('ABSENCE_SELF_REVIEW_HABIT_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SELF_REVIEW_HABIT_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_SELF_REVIEW_HABIT_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_SELF_REVIEW_HABIT_CASUAL.L3).toHaveLength(1);
  });

  it('absence:performance_awareness, no profile → ABSENCE_PERFORMANCE_AWARENESS_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:performance_awareness')).toBe(ABSENCE_PERFORMANCE_AWARENESS_CASUAL);
  });

  it('absence:performance_awareness, pro_geek_soul → ABSENCE_PERFORMANCE_AWARENESS_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:performance_awareness', makeProfile('pro_geek_soul'))).toBe(ABSENCE_PERFORMANCE_AWARENESS_CASUAL);
  });

  it('ABSENCE_PERFORMANCE_AWARENESS_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_PERFORMANCE_AWARENESS_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_PERFORMANCE_AWARENESS_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_PERFORMANCE_AWARENESS_CASUAL.L3).toHaveLength(1);
  });

  // ── Phase 5 D10-D12 — hardcore_pro signal routing ─────────────────────────────

  it('absence:decision_record_absence, hardcore_pro → ABSENCE_DECISION_RECORD_ABSENCE_FORMAL (formal)', () => {
    expect(resolveDecisionContent('implementation', 'absence:decision_record_absence', makeProfile('hardcore_pro'))).toBe(ABSENCE_DECISION_RECORD_ABSENCE_FORMAL);
  });

  it('ABSENCE_DECISION_RECORD_ABSENCE_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_DECISION_RECORD_ABSENCE_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_DECISION_RECORD_ABSENCE_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_DECISION_RECORD_ABSENCE_FORMAL.L3).toHaveLength(1);
  });

  it('absence:over_engineering_check, hardcore_pro → ABSENCE_OVER_ENGINEERING_CHECK_FORMAL (formal)', () => {
    expect(resolveDecisionContent('implementation', 'absence:over_engineering_check', makeProfile('hardcore_pro'))).toBe(ABSENCE_OVER_ENGINEERING_CHECK_FORMAL);
  });

  it('ABSENCE_OVER_ENGINEERING_CHECK_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_OVER_ENGINEERING_CHECK_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_OVER_ENGINEERING_CHECK_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_OVER_ENGINEERING_CHECK_FORMAL.L3).toHaveLength(1);
  });

  it('absence:pair_review_absence, hardcore_pro → ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL (formal)', () => {
    expect(resolveDecisionContent('implementation', 'absence:pair_review_absence', makeProfile('hardcore_pro'))).toBe(ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL);
  });

  it('ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL.L3).toHaveLength(1);
  });

  it('absence:observability_first, hardcore_pro → ABSENCE_OBSERVABILITY_FIRST_FORMAL (formal)', () => {
    expect(resolveDecisionContent('implementation', 'absence:observability_first', makeProfile('hardcore_pro'))).toBe(ABSENCE_OBSERVABILITY_FIRST_FORMAL);
  });

  it('ABSENCE_OBSERVABILITY_FIRST_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_OBSERVABILITY_FIRST_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_OBSERVABILITY_FIRST_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_OBSERVABILITY_FIRST_FORMAL.L3).toHaveLength(1);
  });

  it('absence:failure_mode_analysis, hardcore_pro → ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL (formal)', () => {
    expect(resolveDecisionContent('implementation', 'absence:failure_mode_analysis', makeProfile('hardcore_pro'))).toBe(ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL);
  });

  it('ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL.L3).toHaveLength(1);
  });

  it('absence:contract_testing_gap, hardcore_pro → ABSENCE_CONTRACT_TESTING_GAP_FORMAL (formal)', () => {
    expect(resolveDecisionContent('review_testing', 'absence:contract_testing_gap', makeProfile('hardcore_pro'))).toBe(ABSENCE_CONTRACT_TESTING_GAP_FORMAL);
  });

  it('ABSENCE_CONTRACT_TESTING_GAP_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_CONTRACT_TESTING_GAP_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_CONTRACT_TESTING_GAP_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_CONTRACT_TESTING_GAP_FORMAL.L3).toHaveLength(1);
  });

  it('absence:capacity_planning_gap, hardcore_pro → ABSENCE_CAPACITY_PLANNING_GAP_FORMAL (formal)', () => {
    expect(resolveDecisionContent('implementation', 'absence:capacity_planning_gap', makeProfile('hardcore_pro'))).toBe(ABSENCE_CAPACITY_PLANNING_GAP_FORMAL);
  });

  it('ABSENCE_CAPACITY_PLANNING_GAP_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_CAPACITY_PLANNING_GAP_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_CAPACITY_PLANNING_GAP_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_CAPACITY_PLANNING_GAP_FORMAL.L3).toHaveLength(1);
  });

  it('absence:security_threat_modeling, hardcore_pro → ABSENCE_SECURITY_THREAT_MODELING_FORMAL (formal)', () => {
    expect(resolveDecisionContent('implementation', 'absence:security_threat_modeling', makeProfile('hardcore_pro'))).toBe(ABSENCE_SECURITY_THREAT_MODELING_FORMAL);
  });

  it('ABSENCE_SECURITY_THREAT_MODELING_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SECURITY_THREAT_MODELING_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_SECURITY_THREAT_MODELING_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_SECURITY_THREAT_MODELING_FORMAL.L3).toHaveLength(1);
  });

  it('absence:database_migration_safety, hardcore_pro → ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL (formal)', () => {
    expect(resolveDecisionContent('implementation', 'absence:database_migration_safety', makeProfile('hardcore_pro'))).toBe(ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL);
  });

  it('ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL.L3).toHaveLength(1);
  });

  it('absence:deployment_strategy_absence, hardcore_pro → ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL (formal)', () => {
    expect(resolveDecisionContent('release', 'absence:deployment_strategy_absence', makeProfile('hardcore_pro'))).toBe(ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL);
  });

  it('ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL.L3).toHaveLength(1);
  });

  it('absence:operational_runbook_gap, hardcore_pro → ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL (formal)', () => {
    expect(resolveDecisionContent('release', 'absence:operational_runbook_gap', makeProfile('hardcore_pro'))).toBe(ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL);
  });

  it('ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL.L3).toHaveLength(1);
  });

  it('absence:slo_definition_gap, hardcore_pro → ABSENCE_SLO_DEFINITION_GAP_FORMAL (formal)', () => {
    expect(resolveDecisionContent('implementation', 'absence:slo_definition_gap', makeProfile('hardcore_pro'))).toBe(ABSENCE_SLO_DEFINITION_GAP_FORMAL);
  });

  it('ABSENCE_SLO_DEFINITION_GAP_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SLO_DEFINITION_GAP_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_SLO_DEFINITION_GAP_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_SLO_DEFINITION_GAP_FORMAL.L3).toHaveLength(1);
  });

  it('ABSENCE_CONTENT_BEGINNER contains all 12 Phase 5 D1-D3 keys', () => {
    const expected = [
      'incremental_build', 'error_understanding', 'documentation_before_ask',
      'output_verification', 'requirement_clarity_before_ask', 'copy_paste_awareness',
      'debugging_observation_gap', 'learning_consolidation', 'simple_solution_first',
      'single_responsibility_prompting', 'rollback_awareness', 'build_vs_understand_ratio',
    ];
    for (const key of expected) {
      expect(key in ABSENCE_CONTENT_BEGINNER).toBe(true);
    }
  });
});

describe('resolveDecisionContent — Phase 6 role-based signal routing', () => {
  const makeRoleProfile = (role: 'founder' | 'indie_hacker' | 'pm') =>
    ({ role } as UserProfile);

  // ── Phase 6 E1-E3 — founder role signals ──────────────────────────────────────

  it('absence:user_value_check, founder → ABSENCE_USER_VALUE_CHECK_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:user_value_check', makeRoleProfile('founder'))).toBe(ABSENCE_USER_VALUE_CHECK_CASUAL);
  });

  it('ABSENCE_USER_VALUE_CHECK_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_USER_VALUE_CHECK_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_USER_VALUE_CHECK_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_USER_VALUE_CHECK_CASUAL.L3).toHaveLength(1);
  });

  it('absence:outcome_definition, founder → ABSENCE_OUTCOME_DEFINITION_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:outcome_definition', makeRoleProfile('founder'))).toBe(ABSENCE_OUTCOME_DEFINITION_CASUAL);
  });

  it('ABSENCE_OUTCOME_DEFINITION_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_OUTCOME_DEFINITION_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_OUTCOME_DEFINITION_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_OUTCOME_DEFINITION_CASUAL.L3).toHaveLength(1);
  });

  it('absence:feature_prioritization, founder → ABSENCE_FEATURE_PRIORITIZATION_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:feature_prioritization', makeRoleProfile('founder'))).toBe(ABSENCE_FEATURE_PRIORITIZATION_CASUAL);
  });

  it('ABSENCE_FEATURE_PRIORITIZATION_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_FEATURE_PRIORITIZATION_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_FEATURE_PRIORITIZATION_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_FEATURE_PRIORITIZATION_CASUAL.L3).toHaveLength(1);
  });

  it('absence:user_persona_clarity, founder → ABSENCE_USER_PERSONA_CLARITY_CASUAL', () => {
    expect(resolveDecisionContent('idea', 'absence:user_persona_clarity', makeRoleProfile('founder'))).toBe(ABSENCE_USER_PERSONA_CLARITY_CASUAL);
  });

  it('ABSENCE_USER_PERSONA_CLARITY_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_USER_PERSONA_CLARITY_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_USER_PERSONA_CLARITY_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_USER_PERSONA_CLARITY_CASUAL.L3).toHaveLength(1);
  });

  it('absence:competitive_awareness, founder → ABSENCE_COMPETITIVE_AWARENESS_CASUAL', () => {
    expect(resolveDecisionContent('idea', 'absence:competitive_awareness', makeRoleProfile('founder'))).toBe(ABSENCE_COMPETITIVE_AWARENESS_CASUAL);
  });

  it('ABSENCE_COMPETITIVE_AWARENESS_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_COMPETITIVE_AWARENESS_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_COMPETITIVE_AWARENESS_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_COMPETITIVE_AWARENESS_CASUAL.L3).toHaveLength(1);
  });

  it('absence:mvp_boundary_discipline, founder → ABSENCE_MVP_BOUNDARY_DISCIPLINE_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:mvp_boundary_discipline', makeRoleProfile('founder'))).toBe(ABSENCE_MVP_BOUNDARY_DISCIPLINE_CASUAL);
  });

  it('ABSENCE_MVP_BOUNDARY_DISCIPLINE_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_MVP_BOUNDARY_DISCIPLINE_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_MVP_BOUNDARY_DISCIPLINE_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_MVP_BOUNDARY_DISCIPLINE_CASUAL.L3).toHaveLength(1);
  });

  it('absence:user_acquisition_consideration, founder → ABSENCE_USER_ACQUISITION_CONSIDERATION_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:user_acquisition_consideration', makeRoleProfile('founder'))).toBe(ABSENCE_USER_ACQUISITION_CONSIDERATION_CASUAL);
  });

  it('ABSENCE_USER_ACQUISITION_CONSIDERATION_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_USER_ACQUISITION_CONSIDERATION_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_USER_ACQUISITION_CONSIDERATION_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_USER_ACQUISITION_CONSIDERATION_CASUAL.L3).toHaveLength(1);
  });

  it('absence:retention_mechanism_check, founder → ABSENCE_RETENTION_MECHANISM_CHECK_CASUAL', () => {
    expect(resolveDecisionContent('release', 'absence:retention_mechanism_check', makeRoleProfile('founder'))).toBe(ABSENCE_RETENTION_MECHANISM_CHECK_CASUAL);
  });

  it('ABSENCE_RETENTION_MECHANISM_CHECK_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_RETENTION_MECHANISM_CHECK_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_RETENTION_MECHANISM_CHECK_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_RETENTION_MECHANISM_CHECK_CASUAL.L3).toHaveLength(1);
  });

  it('absence:feedback_loop_establishment, founder → ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT_CASUAL', () => {
    expect(resolveDecisionContent('release', 'absence:feedback_loop_establishment', makeRoleProfile('founder'))).toBe(ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT_CASUAL);
  });

  it('ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT_CASUAL.L3).toHaveLength(1);
  });

  it('absence:hypothesis_before_build, founder → ABSENCE_HYPOTHESIS_BEFORE_BUILD_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:hypothesis_before_build', makeRoleProfile('founder'))).toBe(ABSENCE_HYPOTHESIS_BEFORE_BUILD_CASUAL);
  });

  it('ABSENCE_HYPOTHESIS_BEFORE_BUILD_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_HYPOTHESIS_BEFORE_BUILD_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_HYPOTHESIS_BEFORE_BUILD_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_HYPOTHESIS_BEFORE_BUILD_CASUAL.L3).toHaveLength(1);
  });

  it('absence:technical_vs_product_time_balance, founder → ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:technical_vs_product_time_balance', makeRoleProfile('founder'))).toBe(ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE_CASUAL);
  });

  it('ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE_CASUAL.L3).toHaveLength(1);
  });

  it('absence:north_star_alignment, founder → ABSENCE_NORTH_STAR_ALIGNMENT_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:north_star_alignment', makeRoleProfile('founder'))).toBe(ABSENCE_NORTH_STAR_ALIGNMENT_CASUAL);
  });

  it('ABSENCE_NORTH_STAR_ALIGNMENT_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_NORTH_STAR_ALIGNMENT_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_NORTH_STAR_ALIGNMENT_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_NORTH_STAR_ALIGNMENT_CASUAL.L3).toHaveLength(1);
  });

  // ── Phase 6 E4-E6 — indie_hacker role signals ─────────────────────────────────

  it('absence:time_to_value_check, indie_hacker → ABSENCE_TIME_TO_VALUE_CHECK_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:time_to_value_check', makeRoleProfile('indie_hacker'))).toBe(ABSENCE_TIME_TO_VALUE_CHECK_CASUAL);
  });

  it('ABSENCE_TIME_TO_VALUE_CHECK_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_TIME_TO_VALUE_CHECK_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_TIME_TO_VALUE_CHECK_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_TIME_TO_VALUE_CHECK_CASUAL.L3).toHaveLength(1);
  });

  it('absence:ship_readiness_definition, indie_hacker → ABSENCE_SHIP_READINESS_DEFINITION_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:ship_readiness_definition', makeRoleProfile('indie_hacker'))).toBe(ABSENCE_SHIP_READINESS_DEFINITION_CASUAL);
  });

  it('ABSENCE_SHIP_READINESS_DEFINITION_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SHIP_READINESS_DEFINITION_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_SHIP_READINESS_DEFINITION_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_SHIP_READINESS_DEFINITION_CASUAL.L3).toHaveLength(1);
  });

  it('absence:manual_before_automate, indie_hacker → ABSENCE_MANUAL_BEFORE_AUTOMATE_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:manual_before_automate', makeRoleProfile('indie_hacker'))).toBe(ABSENCE_MANUAL_BEFORE_AUTOMATE_CASUAL);
  });

  it('ABSENCE_MANUAL_BEFORE_AUTOMATE_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_MANUAL_BEFORE_AUTOMATE_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_MANUAL_BEFORE_AUTOMATE_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_MANUAL_BEFORE_AUTOMATE_CASUAL.L3).toHaveLength(1);
  });

  it('absence:tech_stack_complexity_check, indie_hacker → ABSENCE_TECH_STACK_COMPLEXITY_CHECK_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:tech_stack_complexity_check', makeRoleProfile('indie_hacker'))).toBe(ABSENCE_TECH_STACK_COMPLEXITY_CHECK_CASUAL);
  });

  it('ABSENCE_TECH_STACK_COMPLEXITY_CHECK_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_TECH_STACK_COMPLEXITY_CHECK_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_TECH_STACK_COMPLEXITY_CHECK_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_TECH_STACK_COMPLEXITY_CHECK_CASUAL.L3).toHaveLength(1);
  });

  it('absence:launch_strategy_absence, indie_hacker → ABSENCE_LAUNCH_STRATEGY_ABSENCE_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:launch_strategy_absence', makeRoleProfile('indie_hacker'))).toBe(ABSENCE_LAUNCH_STRATEGY_ABSENCE_CASUAL);
  });

  it('ABSENCE_LAUNCH_STRATEGY_ABSENCE_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_LAUNCH_STRATEGY_ABSENCE_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_LAUNCH_STRATEGY_ABSENCE_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_LAUNCH_STRATEGY_ABSENCE_CASUAL.L3).toHaveLength(1);
  });

  it('absence:early_user_feedback, indie_hacker → ABSENCE_EARLY_USER_FEEDBACK_CASUAL', () => {
    expect(resolveDecisionContent('release', 'absence:early_user_feedback', makeRoleProfile('indie_hacker'))).toBe(ABSENCE_EARLY_USER_FEEDBACK_CASUAL);
  });

  it('ABSENCE_EARLY_USER_FEEDBACK_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_EARLY_USER_FEEDBACK_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_EARLY_USER_FEEDBACK_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_EARLY_USER_FEEDBACK_CASUAL.L3).toHaveLength(1);
  });

  it('absence:solo_maintainability, indie_hacker → ABSENCE_SOLO_MAINTAINABILITY_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:solo_maintainability', makeRoleProfile('indie_hacker'))).toBe(ABSENCE_SOLO_MAINTAINABILITY_CASUAL);
  });

  it('ABSENCE_SOLO_MAINTAINABILITY_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SOLO_MAINTAINABILITY_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_SOLO_MAINTAINABILITY_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_SOLO_MAINTAINABILITY_CASUAL.L3).toHaveLength(1);
  });

  it('absence:distribution_thinking, indie_hacker → ABSENCE_DISTRIBUTION_THINKING_CASUAL', () => {
    expect(resolveDecisionContent('idea', 'absence:distribution_thinking', makeRoleProfile('indie_hacker'))).toBe(ABSENCE_DISTRIBUTION_THINKING_CASUAL);
  });

  it('ABSENCE_DISTRIBUTION_THINKING_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_DISTRIBUTION_THINKING_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_DISTRIBUTION_THINKING_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_DISTRIBUTION_THINKING_CASUAL.L3).toHaveLength(1);
  });

  it('absence:monetization_path_clarity, indie_hacker → ABSENCE_MONETIZATION_PATH_CLARITY_CASUAL', () => {
    expect(resolveDecisionContent('idea', 'absence:monetization_path_clarity', makeRoleProfile('indie_hacker'))).toBe(ABSENCE_MONETIZATION_PATH_CLARITY_CASUAL);
  });

  it('ABSENCE_MONETIZATION_PATH_CLARITY_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_MONETIZATION_PATH_CLARITY_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_MONETIZATION_PATH_CLARITY_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_MONETIZATION_PATH_CLARITY_CASUAL.L3).toHaveLength(1);
  });

  it('absence:build_in_public_opportunity, indie_hacker → ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:build_in_public_opportunity', makeRoleProfile('indie_hacker'))).toBe(ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY_CASUAL);
  });

  it('ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY_CASUAL.L3).toHaveLength(1);
  });

  it('absence:scope_vs_time_check, indie_hacker → ABSENCE_SCOPE_VS_TIME_CHECK_CASUAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:scope_vs_time_check', makeRoleProfile('indie_hacker'))).toBe(ABSENCE_SCOPE_VS_TIME_CHECK_CASUAL);
  });

  it('ABSENCE_SCOPE_VS_TIME_CHECK_CASUAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SCOPE_VS_TIME_CHECK_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_SCOPE_VS_TIME_CHECK_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_SCOPE_VS_TIME_CHECK_CASUAL.L3).toHaveLength(1);
  });

  // ── Phase 6 E7-E9 — pm role signals ──────────────────────────────────────────

  it('absence:acceptance_criteria_before_dev, pm → ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_FORMAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:acceptance_criteria_before_dev', makeRoleProfile('pm'))).toBe(ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_FORMAL);
  });

  it('ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_FORMAL.L3).toHaveLength(1);
  });

  it('absence:stakeholder_alignment_check, pm → ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_FORMAL', () => {
    expect(resolveDecisionContent('idea', 'absence:stakeholder_alignment_check', makeRoleProfile('pm'))).toBe(ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_FORMAL);
  });

  it('ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_FORMAL.L3).toHaveLength(1);
  });

  it('absence:requirements_ambiguity_flag, pm → ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_FORMAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:requirements_ambiguity_flag', makeRoleProfile('pm'))).toBe(ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_FORMAL);
  });

  it('ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_FORMAL.L3).toHaveLength(1);
  });

  it('absence:dependency_mapping, pm → ABSENCE_DEPENDENCY_MAPPING_FORMAL', () => {
    expect(resolveDecisionContent('idea', 'absence:dependency_mapping', makeRoleProfile('pm'))).toBe(ABSENCE_DEPENDENCY_MAPPING_FORMAL);
  });

  it('ABSENCE_DEPENDENCY_MAPPING_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_DEPENDENCY_MAPPING_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_DEPENDENCY_MAPPING_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_DEPENDENCY_MAPPING_FORMAL.L3).toHaveLength(1);
  });

  it('absence:definition_of_done, pm → ABSENCE_DEFINITION_OF_DONE_FORMAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:definition_of_done', makeRoleProfile('pm'))).toBe(ABSENCE_DEFINITION_OF_DONE_FORMAL);
  });

  it('ABSENCE_DEFINITION_OF_DONE_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_DEFINITION_OF_DONE_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_DEFINITION_OF_DONE_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_DEFINITION_OF_DONE_FORMAL.L3).toHaveLength(1);
  });

  it('absence:cross_team_impact_check, pm → ABSENCE_CROSS_TEAM_IMPACT_CHECK_FORMAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:cross_team_impact_check', makeRoleProfile('pm'))).toBe(ABSENCE_CROSS_TEAM_IMPACT_CHECK_FORMAL);
  });

  it('ABSENCE_CROSS_TEAM_IMPACT_CHECK_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_CROSS_TEAM_IMPACT_CHECK_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_CROSS_TEAM_IMPACT_CHECK_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_CROSS_TEAM_IMPACT_CHECK_FORMAL.L3).toHaveLength(1);
  });

  it('absence:success_metric_definition, pm → ABSENCE_SUCCESS_METRIC_DEFINITION_FORMAL', () => {
    expect(resolveDecisionContent('idea', 'absence:success_metric_definition', makeRoleProfile('pm'))).toBe(ABSENCE_SUCCESS_METRIC_DEFINITION_FORMAL);
  });

  it('ABSENCE_SUCCESS_METRIC_DEFINITION_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SUCCESS_METRIC_DEFINITION_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_SUCCESS_METRIC_DEFINITION_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_SUCCESS_METRIC_DEFINITION_FORMAL.L3).toHaveLength(1);
  });

  it('absence:priority_justification, pm → ABSENCE_PRIORITY_JUSTIFICATION_FORMAL', () => {
    expect(resolveDecisionContent('idea', 'absence:priority_justification', makeRoleProfile('pm'))).toBe(ABSENCE_PRIORITY_JUSTIFICATION_FORMAL);
  });

  it('ABSENCE_PRIORITY_JUSTIFICATION_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_PRIORITY_JUSTIFICATION_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_PRIORITY_JUSTIFICATION_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_PRIORITY_JUSTIFICATION_FORMAL.L3).toHaveLength(1);
  });

  it('absence:user_story_completeness, pm → ABSENCE_USER_STORY_COMPLETENESS_FORMAL', () => {
    expect(resolveDecisionContent('idea', 'absence:user_story_completeness', makeRoleProfile('pm'))).toBe(ABSENCE_USER_STORY_COMPLETENESS_FORMAL);
  });

  it('ABSENCE_USER_STORY_COMPLETENESS_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_USER_STORY_COMPLETENESS_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_USER_STORY_COMPLETENESS_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_USER_STORY_COMPLETENESS_FORMAL.L3).toHaveLength(1);
  });

  it('absence:risk_flag, pm → ABSENCE_RISK_FLAG_FORMAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:risk_flag', makeRoleProfile('pm'))).toBe(ABSENCE_RISK_FLAG_FORMAL);
  });

  it('ABSENCE_RISK_FLAG_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_RISK_FLAG_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_RISK_FLAG_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_RISK_FLAG_FORMAL.L3).toHaveLength(1);
  });

  it('absence:scope_change_impact_assessment, pm → ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_FORMAL', () => {
    expect(resolveDecisionContent('implementation', 'absence:scope_change_impact_assessment', makeRoleProfile('pm'))).toBe(ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_FORMAL);
  });

  it('ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_FORMAL.L3).toHaveLength(1);
  });

  it('absence:retrospective_habit, pm → ABSENCE_RETROSPECTIVE_HABIT_FORMAL', () => {
    expect(resolveDecisionContent('feedback_loop', 'absence:retrospective_habit', makeRoleProfile('pm'))).toBe(ABSENCE_RETROSPECTIVE_HABIT_FORMAL);
  });

  it('ABSENCE_RETROSPECTIVE_HABIT_FORMAL has 3 L1, 2 L2, 1 L3 options', () => {
    expect(ABSENCE_RETROSPECTIVE_HABIT_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_RETROSPECTIVE_HABIT_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_RETROSPECTIVE_HABIT_FORMAL.L3).toHaveLength(1);
  });

  // ── Role map key coverage checks ──────────────────────────────────────────────

  it('resolveDecisionContent returns founder CASUAL content for all 12 E1-E3 keys', () => {
    const founderKeys = [
      'user_value_check', 'outcome_definition', 'feature_prioritization',
      'user_persona_clarity', 'competitive_awareness', 'mvp_boundary_discipline',
      'user_acquisition_consideration', 'retention_mechanism_check', 'feedback_loop_establishment',
      'hypothesis_before_build', 'technical_vs_product_time_balance', 'north_star_alignment',
    ];
    for (const key of founderKeys) {
      const result = resolveDecisionContent('implementation', `absence:${key}`, makeRoleProfile('founder'));
      expect(result).toBeDefined();
    }
  });

  it('resolveDecisionContent returns indie_hacker CASUAL content for all 11 E4-E6 keys', () => {
    const indieKeys = [
      'time_to_value_check', 'ship_readiness_definition', 'manual_before_automate',
      'tech_stack_complexity_check', 'launch_strategy_absence', 'early_user_feedback',
      'solo_maintainability', 'distribution_thinking', 'monetization_path_clarity',
      'build_in_public_opportunity', 'scope_vs_time_check',
    ];
    for (const key of indieKeys) {
      const result = resolveDecisionContent('implementation', `absence:${key}`, makeRoleProfile('indie_hacker'));
      expect(result).toBeDefined();
    }
  });

  it('resolveDecisionContent returns pm FORMAL content for all 12 E7-E9 keys', () => {
    const pmKeys = [
      'acceptance_criteria_before_dev', 'stakeholder_alignment_check', 'requirements_ambiguity_flag',
      'dependency_mapping', 'definition_of_done', 'cross_team_impact_check',
      'success_metric_definition', 'priority_justification', 'user_story_completeness',
      'risk_flag', 'scope_change_impact_assessment', 'retrospective_habit',
    ];
    for (const key of pmKeys) {
      const result = resolveDecisionContent('implementation', `absence:${key}`, makeRoleProfile('pm'));
      expect(result).toBeDefined();
    }
  });
});

// ── Phase 7 F1-F2 — session-quality content ───────────────────────────────────

describe('Phase 7 content — CASUAL variants', () => {
  it('ABSENCE_DECISION_FATIGUE_PATTERN_CASUAL has 3 L1, 2 L2, 1 L3', () => {
    expect(ABSENCE_DECISION_FATIGUE_PATTERN_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_DECISION_FATIGUE_PATTERN_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_DECISION_FATIGUE_PATTERN_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_WORK_RHYTHM_CHECK_CASUAL has 3 L1, 2 L2, 1 L3', () => {
    expect(ABSENCE_WORK_RHYTHM_CHECK_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_WORK_RHYTHM_CHECK_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_WORK_RHYTHM_CHECK_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_FOCUS_DRIFT_DETECTION_CASUAL has 3 L1, 2 L2, 1 L3', () => {
    expect(ABSENCE_FOCUS_DRIFT_DETECTION_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_FOCUS_DRIFT_DETECTION_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_FOCUS_DRIFT_DETECTION_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_SESSION_LENGTH_CHECKPOINT_CASUAL has 3 L1, 2 L2, 1 L3', () => {
    expect(ABSENCE_SESSION_LENGTH_CHECKPOINT_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_SESSION_LENGTH_CHECKPOINT_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_SESSION_LENGTH_CHECKPOINT_CASUAL.L3).toHaveLength(1);
  });

  it('ABSENCE_PROGRESS_CONSOLIDATION_GAP_CASUAL has 3 L1, 2 L2, 1 L3', () => {
    expect(ABSENCE_PROGRESS_CONSOLIDATION_GAP_CASUAL.L1).toHaveLength(3);
    expect(ABSENCE_PROGRESS_CONSOLIDATION_GAP_CASUAL.L2).toHaveLength(2);
    expect(ABSENCE_PROGRESS_CONSOLIDATION_GAP_CASUAL.L3).toHaveLength(1);
  });
});

describe('Phase 7 content — FORMAL variants', () => {
  it('ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL has 3 L1, 2 L2, 1 L3', () => {
    expect(ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL.L3).toHaveLength(1);
  });

  it('ABSENCE_WORK_RHYTHM_CHECK_FORMAL has 3 L1, 2 L2, 1 L3', () => {
    expect(ABSENCE_WORK_RHYTHM_CHECK_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_WORK_RHYTHM_CHECK_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_WORK_RHYTHM_CHECK_FORMAL.L3).toHaveLength(1);
  });

  it('ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL has 3 L1, 2 L2, 1 L3', () => {
    expect(ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL.L3).toHaveLength(1);
  });

  it('ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL has 3 L1, 2 L2, 1 L3', () => {
    expect(ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL.L3).toHaveLength(1);
  });

  it('ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL has 3 L1, 2 L2, 1 L3', () => {
    expect(ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL.L1).toHaveLength(3);
    expect(ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL.L2).toHaveLength(2);
    expect(ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL.L3).toHaveLength(1);
  });
});

describe('Phase 7 content — BEGINNER variants', () => {
  it('ABSENCE_DECISION_FATIGUE_PATTERN_BEGINNER has 3 L1, 1 L2, 1 L3', () => {
    expect(ABSENCE_DECISION_FATIGUE_PATTERN_BEGINNER.L1).toHaveLength(3);
    expect(ABSENCE_DECISION_FATIGUE_PATTERN_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_DECISION_FATIGUE_PATTERN_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_WORK_RHYTHM_CHECK_BEGINNER has 3 L1, 1 L2, 1 L3', () => {
    expect(ABSENCE_WORK_RHYTHM_CHECK_BEGINNER.L1).toHaveLength(3);
    expect(ABSENCE_WORK_RHYTHM_CHECK_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_WORK_RHYTHM_CHECK_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_FOCUS_DRIFT_DETECTION_BEGINNER has 3 L1, 1 L2, 1 L3', () => {
    expect(ABSENCE_FOCUS_DRIFT_DETECTION_BEGINNER.L1).toHaveLength(3);
    expect(ABSENCE_FOCUS_DRIFT_DETECTION_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_FOCUS_DRIFT_DETECTION_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_SESSION_LENGTH_CHECKPOINT_BEGINNER has 3 L1, 1 L2, 1 L3', () => {
    expect(ABSENCE_SESSION_LENGTH_CHECKPOINT_BEGINNER.L1).toHaveLength(3);
    expect(ABSENCE_SESSION_LENGTH_CHECKPOINT_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_SESSION_LENGTH_CHECKPOINT_BEGINNER.L3).toHaveLength(1);
  });

  it('ABSENCE_PROGRESS_CONSOLIDATION_GAP_BEGINNER has 3 L1, 1 L2, 1 L3', () => {
    expect(ABSENCE_PROGRESS_CONSOLIDATION_GAP_BEGINNER.L1).toHaveLength(3);
    expect(ABSENCE_PROGRESS_CONSOLIDATION_GAP_BEGINNER.L2).toHaveLength(1);
    expect(ABSENCE_PROGRESS_CONSOLIDATION_GAP_BEGINNER.L3).toHaveLength(1);
  });
});

// ── Phase 7 F1-F2 — content invariants ────────────────────────────────────────
// Locks pinch-UI labels (question + pinchFallback) and bans count-literal tokens
// in the L1 / L2 / L3 option arrays for the 5 session-quality signals × 3 registers.

describe('Phase 7 content — question + pinchFallback invariants', () => {
  const pinchLabels: Array<{ name: string; c: import('./options.js').DecisionContent; q: string; pf: string }> = [
    // FORMAL — 3 preserve question, 2 override (count-free)
    { name: 'ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL',   c: ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL,   q: 'Long acceptance streak — applied critical review recently?',     pf: 'Streak alert.' },
    { name: 'ABSENCE_WORK_RHYTHM_CHECK_FORMAL',          c: ABSENCE_WORK_RHYTHM_CHECK_FORMAL,          q: 'Rapid prompting — verified each response before continuing?',    pf: 'Slow down.' },
    { name: 'ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL',      c: ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL,      q: 'Multiple areas open — completed any end-to-end?',                pf: 'Focus drift.' },
    { name: 'ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL',  c: ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL,  q: 'Extended session — context checkpoint done?',                    pf: 'Checkpoint due.' },
    { name: 'ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL', c: ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL, q: 'Extended implementation — progress documented?',                 pf: 'Document now.' },
    // CASUAL — same overrides for session_length / progress_consolidation
    { name: 'ABSENCE_DECISION_FATIGUE_PATTERN_CASUAL',   c: ABSENCE_DECISION_FATIGUE_PATTERN_CASUAL,   q: 'Long acceptance streak — applied critical review recently?',     pf: 'Streak alert.' },
    { name: 'ABSENCE_WORK_RHYTHM_CHECK_CASUAL',          c: ABSENCE_WORK_RHYTHM_CHECK_CASUAL,          q: 'Rapid prompting — verified each response before continuing?',    pf: 'Slow down.' },
    { name: 'ABSENCE_FOCUS_DRIFT_DETECTION_CASUAL',      c: ABSENCE_FOCUS_DRIFT_DETECTION_CASUAL,      q: 'Multiple areas open — completed any end-to-end?',                pf: 'Focus drift.' },
    { name: 'ABSENCE_SESSION_LENGTH_CHECKPOINT_CASUAL',  c: ABSENCE_SESSION_LENGTH_CHECKPOINT_CASUAL,  q: 'Extended session — context checkpoint done?',                    pf: 'Checkpoint due.' },
    { name: 'ABSENCE_PROGRESS_CONSOLIDATION_GAP_CASUAL', c: ABSENCE_PROGRESS_CONSOLIDATION_GAP_CASUAL, q: 'Extended implementation — progress documented?',                 pf: 'Document now.' },
    // BEGINNER — all 5 preserve question + pinchFallback (no count literals existed in BEGINNER questions)
    { name: 'ABSENCE_DECISION_FATIGUE_PATTERN_BEGINNER',   c: ABSENCE_DECISION_FATIGUE_PATTERN_BEGINNER,   q: 'Accepting without reviewing — applied critical check recently?', pf: 'Streak alert.' },
    { name: 'ABSENCE_WORK_RHYTHM_CHECK_BEGINNER',          c: ABSENCE_WORK_RHYTHM_CHECK_BEGINNER,          q: 'Sending fast — read the last response fully before continuing?', pf: 'Slow down.' },
    { name: 'ABSENCE_FOCUS_DRIFT_DETECTION_BEGINNER',      c: ABSENCE_FOCUS_DRIFT_DETECTION_BEGINNER,      q: 'Working on many things — finished any of them yet?',             pf: 'Focus drift.' },
    { name: 'ABSENCE_SESSION_LENGTH_CHECKPOINT_BEGINNER',  c: ABSENCE_SESSION_LENGTH_CHECKPOINT_BEGINNER,  q: 'Working for a while — what have you built so far?',              pf: 'Checkpoint due.' },
    { name: 'ABSENCE_PROGRESS_CONSOLIDATION_GAP_BEGINNER', c: ABSENCE_PROGRESS_CONSOLIDATION_GAP_BEGINNER, q: 'Built a lot — have you written down what you made?',             pf: 'Document now.' },
  ];

  for (const { name, c, q, pf } of pinchLabels) {
    it(`${name} question matches expected (preserved or count-free override)`, () => {
      expect(c.question).toBe(q);
    });
    it(`${name} pinchFallback is preserved verbatim`, () => {
      expect(c.pinchFallback).toBe(pf);
    });
  }
});

describe('Phase 7 content — no count-literal tokens in L1/L2/L3', () => {
  const constants: Array<{ name: string; c: import('./options.js').DecisionContent }> = [
    { name: 'ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL',   c: ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL },
    { name: 'ABSENCE_WORK_RHYTHM_CHECK_FORMAL',          c: ABSENCE_WORK_RHYTHM_CHECK_FORMAL },
    { name: 'ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL',      c: ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL },
    { name: 'ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL',  c: ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL },
    { name: 'ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL', c: ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL },
    { name: 'ABSENCE_DECISION_FATIGUE_PATTERN_CASUAL',   c: ABSENCE_DECISION_FATIGUE_PATTERN_CASUAL },
    { name: 'ABSENCE_WORK_RHYTHM_CHECK_CASUAL',          c: ABSENCE_WORK_RHYTHM_CHECK_CASUAL },
    { name: 'ABSENCE_FOCUS_DRIFT_DETECTION_CASUAL',      c: ABSENCE_FOCUS_DRIFT_DETECTION_CASUAL },
    { name: 'ABSENCE_SESSION_LENGTH_CHECKPOINT_CASUAL',  c: ABSENCE_SESSION_LENGTH_CHECKPOINT_CASUAL },
    { name: 'ABSENCE_PROGRESS_CONSOLIDATION_GAP_CASUAL', c: ABSENCE_PROGRESS_CONSOLIDATION_GAP_CASUAL },
    { name: 'ABSENCE_DECISION_FATIGUE_PATTERN_BEGINNER',   c: ABSENCE_DECISION_FATIGUE_PATTERN_BEGINNER },
    { name: 'ABSENCE_WORK_RHYTHM_CHECK_BEGINNER',          c: ABSENCE_WORK_RHYTHM_CHECK_BEGINNER },
    { name: 'ABSENCE_FOCUS_DRIFT_DETECTION_BEGINNER',      c: ABSENCE_FOCUS_DRIFT_DETECTION_BEGINNER },
    { name: 'ABSENCE_SESSION_LENGTH_CHECKPOINT_BEGINNER',  c: ABSENCE_SESSION_LENGTH_CHECKPOINT_BEGINNER },
    { name: 'ABSENCE_PROGRESS_CONSOLIDATION_GAP_BEGINNER', c: ABSENCE_PROGRESS_CONSOLIDATION_GAP_BEGINNER },
  ];

  // Forbidden tokens that previously appeared in the inverted-cascade L1/L2 content.
  // Allowed: ordinary uses of "N" as a sentence-initial pronoun (none expected here), or
  //          regular text that happens to contain the letter — patterns below use \b word
  //          boundaries to avoid false positives.
  const forbidden: Array<{ pattern: RegExp; description: string }> = [
    { pattern: /\bN prompts\b/,          description: 'unsubstituted "N prompts" placeholder' },
    { pattern: /\bN AI\b/,               description: 'unsubstituted "N AI" placeholder' },
    { pattern: /\bN distinct\b/,         description: 'unsubstituted "N distinct" placeholder' },
    { pattern: /\b25\+\b/,               description: '"25+" hardcoded threshold' },
    { pattern: /\b20\+\b/,               description: '"20+" hardcoded threshold' },
    { pattern: /\b25 prompts\b/,         description: '"25 prompts" hardcoded count' },
    { pattern: /\b20 prompts\b/,         description: '"20 prompts" hardcoded count' },
  ];

  for (const { name, c } of constants) {
    it(`${name} L1/L2/L3 entries contain no count-literal tokens`, () => {
      const all: string[] = [...c.L1, ...c.L2, ...c.L3];
      for (let i = 0; i < all.length; i++) {
        const text = all[i];
        for (const { pattern, description } of forbidden) {
          expect(text, `entry index ${i} contains ${description}: "${text}"`).not.toMatch(pattern);
        }
      }
    });
  }
});

// ── Phase 5 D10-D12 — academic-register content invariants ────────────────────
// Locks pinch-UI labels (question + pinchFallback) and bans academic-citation /
// tool-callout patterns in the L1 / L2 option arrays for the 12 hardcore_pro
// FORMAL signals rewritten under Sub-Issue 3.

describe('D10-D12 academic-register — question + pinchFallback invariants', () => {
  const pinchLabels: Array<{ name: string; c: import('./options.js').DecisionContent; q: string; pf: string }> = [
    { name: 'ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL',      c: ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL,      q: 'External dependencies integrated — failure modes enumerated?', pf: 'Enumerate failure modes for each dependency.' },
    { name: 'ABSENCE_CONTRACT_TESTING_GAP_FORMAL',       c: ABSENCE_CONTRACT_TESTING_GAP_FORMAL,       q: 'Service boundary established — contract tests defined?',      pf: 'Define consumer-driven contract tests for this boundary.' },
    { name: 'ABSENCE_CAPACITY_PLANNING_GAP_FORMAL',      c: ABSENCE_CAPACITY_PLANNING_GAP_FORMAL,      q: 'Load-adding feature — capacity estimate done?',                pf: 'Complete a capacity estimate before shipping.' },
    { name: 'ABSENCE_SECURITY_THREAT_MODELING_FORMAL',   c: ABSENCE_SECURITY_THREAT_MODELING_FORMAL,   q: 'Security-sensitive feature — STRIDE threat model completed?',  pf: 'Complete a STRIDE threat model before shipping.' },
    { name: 'ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL',  c: ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL,  q: 'Schema change — expand-migrate-contract pattern applied?',     pf: 'Apply backwards-compatible phased migration.' },
    { name: 'ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL', c: ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL, q: 'Significant feature shipping — deployment strategy defined?', pf: 'Define deployment strategy and rollback plan before shipping.' },
    { name: 'ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL',    c: ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL,    q: 'New service/feature shipping — operational runbook written?',  pf: 'Write the runbook before shipping.' },
    { name: 'ABSENCE_SLO_DEFINITION_GAP_FORMAL',         c: ABSENCE_SLO_DEFINITION_GAP_FORMAL,         q: 'User-facing feature/service — SLOs defined?',                  pf: 'Define SLOs before shipping.' },
    { name: 'ABSENCE_DECISION_RECORD_ABSENCE_FORMAL',    c: ABSENCE_DECISION_RECORD_ABSENCE_FORMAL,    q: 'Architectural decision made — ADR recorded?',                  pf: 'Record the decision with context and consequences.' },
    { name: 'ABSENCE_OVER_ENGINEERING_CHECK_FORMAL',     c: ABSENCE_OVER_ENGINEERING_CHECK_FORMAL,     q: 'Is this abstraction required by current requirements?',        pf: 'Apply YAGNI — build only what current requirements require.' },
    { name: 'ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL',        c: ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL,        q: 'Critical implementation complete — review plan established?',  pf: 'Establish a review plan before merging.' },
    { name: 'ABSENCE_OBSERVABILITY_FIRST_FORMAL',        c: ABSENCE_OBSERVABILITY_FIRST_FORMAL,        q: 'Feature shipping — observability instrumented?',               pf: 'Add logging, metrics, and tracing before shipping.' },
  ];

  for (const { name, c, q, pf } of pinchLabels) {
    it(`${name} question is preserved verbatim`, () => {
      expect(c.question).toBe(q);
    });
    it(`${name} pinchFallback is preserved verbatim`, () => {
      expect(c.pinchFallback).toBe(pf);
    });
  }
});

describe('D10-D12 academic-register — no citation patterns or tool callouts in L1/L2', () => {
  const constants: Array<{ name: string; c: import('./options.js').DecisionContent }> = [
    { name: 'ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL',      c: ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL },
    { name: 'ABSENCE_CONTRACT_TESTING_GAP_FORMAL',       c: ABSENCE_CONTRACT_TESTING_GAP_FORMAL },
    { name: 'ABSENCE_CAPACITY_PLANNING_GAP_FORMAL',      c: ABSENCE_CAPACITY_PLANNING_GAP_FORMAL },
    { name: 'ABSENCE_SECURITY_THREAT_MODELING_FORMAL',   c: ABSENCE_SECURITY_THREAT_MODELING_FORMAL },
    { name: 'ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL',  c: ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL },
    { name: 'ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL', c: ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL },
    { name: 'ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL',    c: ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL },
    { name: 'ABSENCE_SLO_DEFINITION_GAP_FORMAL',         c: ABSENCE_SLO_DEFINITION_GAP_FORMAL },
    { name: 'ABSENCE_DECISION_RECORD_ABSENCE_FORMAL',    c: ABSENCE_DECISION_RECORD_ABSENCE_FORMAL },
    { name: 'ABSENCE_OVER_ENGINEERING_CHECK_FORMAL',     c: ABSENCE_OVER_ENGINEERING_CHECK_FORMAL },
    { name: 'ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL',        c: ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL },
    { name: 'ABSENCE_OBSERVABILITY_FIRST_FORMAL',        c: ABSENCE_OBSERVABILITY_FIRST_FORMAL },
  ];

  // Forbidden patterns: opener citations, URL citations, et-al citations, MIL-STD
  // identifiers, and standalone "Tools: " list-callouts. Regex set narrowed to avoid
  // false positives on inline engineering terms (STRIDE, RPS, SLO, ADR, etc.) which
  // are acceptable inside the action-first prose.
  const forbidden: Array<{ pattern: RegExp; description: string }> = [
    // "(Nygard, 2011)" or "(Fowler/Sadalage, 2003)"-style paren-citation.
    { pattern: /\([A-Z][a-z]+(?:\/[A-Z][a-z]+)?(?:,| et al\.,?) \d{4}\)/, description: 'opener paren-citation like (Author, year) or (Author et al., year)' },
    // "Beyer et al., 2016"-style inline et-al citation.
    { pattern: /\b[A-Z][a-z]+ et al\.,? \d{4}\b/, description: 'inline et-al citation like Author et al., year' },
    // "Adam Shostack, 'Title' (Publisher YYYY)"-style attribution.
    { pattern: /\b[A-Z][a-z]+ [A-Z][a-z]+, '[^']+' \(/, description: 'attribution like "First Last, \'Title\' (Publisher...)"' },
    // Year-tag opener like "Author Name (2011):" — note the colon after the paren.
    { pattern: /\b[A-Z][a-z]+(?: [A-Z][a-z]+)? \(\d{4}\):/, description: 'opener attribution like "Author (YYYY):"' },
    // martinfowler.com URL citation.
    { pattern: /martinfowler\.com/, description: 'martinfowler.com URL citation' },
    // MIL-STD identifier (FMEA opener).
    { pattern: /\bMIL-STD-\d+[A-Z]?\b/, description: 'MIL-STD identifier (citation)' },
    // Standalone "Tools: X, Y, Z" list-callout at the start of a clause.
    { pattern: /(?:^|\. )Tools: [A-Z]/, description: 'standalone "Tools: X, Y, Z" list-callout' },
  ];

  for (const { name, c } of constants) {
    it(`${name} L1/L2 entries contain no academic citation or tool-callout patterns`, () => {
      const checkable: string[] = [...c.L1, ...c.L2];
      for (let i = 0; i < checkable.length; i++) {
        const text = checkable[i];
        for (const { pattern, description } of forbidden) {
          expect(text, `entry index ${i} matches ${description}: "${text}"`).not.toMatch(pattern);
        }
      }
    });
  }
});

// ── Phase 6 E7-E9 — PM role content invariants ────────────────────────────────
// Locks pinch-UI labels (question + pinchFallback) and bans citation / framework
// reference patterns in the affected L1 slots for the 12 PM-role FORMAL signals
// where surgical slot rewrites were applied. Unaffected L1 slots, L2, and L3
// are NOT covered by the sweep below (they may legitimately contain framework
// references in casual prose); only the affected slots are locked.

describe('PM role — question + pinchFallback invariants', () => {
  const pinchLabels: Array<{ name: string; c: import('./options.js').DecisionContent; q: string; pf: string }> = [
    { name: 'ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_FORMAL',  c: ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_FORMAL,  q: 'Are acceptance criteria defined for this story before development begins?',                                pf: 'Define acceptance criteria for this story before starting implementation.' },
    { name: 'ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_FORMAL',     c: ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_FORMAL,     q: 'Have relevant stakeholders been aligned on this feature before development begins?',                       pf: 'Verify stakeholder alignment before proceeding with significant development work.' },
    { name: 'ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_FORMAL',     c: ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_FORMAL,     q: 'Are there ambiguous quality attributes in these requirements that need a measurable definition?',          pf: 'Resolve ambiguous quality attributes to measurable criteria before implementation.' },
    { name: 'ABSENCE_DEPENDENCY_MAPPING_FORMAL',              c: ABSENCE_DEPENDENCY_MAPPING_FORMAL,              q: 'Have upstream and downstream dependencies for this work been identified before starting?',                 pf: 'Map dependencies before beginning this work to prevent blocked integration.' },
    { name: 'ABSENCE_DEFINITION_OF_DONE_FORMAL',              c: ABSENCE_DEFINITION_OF_DONE_FORMAL,              q: 'Is there an explicit Definition of Done for this sprint item?',                                            pf: 'Define the completion criteria for this item before starting work.' },
    { name: 'ABSENCE_CROSS_TEAM_IMPACT_CHECK_FORMAL',         c: ABSENCE_CROSS_TEAM_IMPACT_CHECK_FORMAL,         q: 'Have teams affected by this change been notified before development begins?',                              pf: 'Identify and notify affected teams before building this change to shared systems.' },
    { name: 'ABSENCE_SUCCESS_METRIC_DEFINITION_FORMAL',       c: ABSENCE_SUCCESS_METRIC_DEFINITION_FORMAL,       q: 'Is there a success metric defined for this feature before development begins?',                            pf: 'Define how success will be measured for this feature before starting implementation.' },
    { name: 'ABSENCE_PRIORITY_JUSTIFICATION_FORMAL',          c: ABSENCE_PRIORITY_JUSTIFICATION_FORMAL,          q: 'Is there an explicit justification for why this item is the current highest priority?',                    pf: 'Articulate the priority justification for this item before beginning work.' },
    { name: 'ABSENCE_USER_STORY_COMPLETENESS_FORMAL',         c: ABSENCE_USER_STORY_COMPLETENESS_FORMAL,         q: 'Is this work item expressed as a complete user story with who, what, and why?',                            pf: 'Reframe this work item as a user story — who benefits, what they need, why it matters.' },
    { name: 'ABSENCE_RISK_FLAG_FORMAL',                       c: ABSENCE_RISK_FLAG_FORMAL,                       q: 'Have risks been identified for this decision or scope change before proceeding?',                          pf: 'Identify and document risks before proceeding with this significant decision.' },
    { name: 'ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_FORMAL',  c: ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_FORMAL,  q: 'Has the impact of this scope change on the current sprint been assessed?',                                 pf: 'Assess sprint impact before accepting this scope change.' },
    { name: 'ABSENCE_RETROSPECTIVE_HABIT_FORMAL',             c: ABSENCE_RETROSPECTIVE_HABIT_FORMAL,             q: 'Has this sprint or iteration been closed with a retrospective before starting the next?',                  pf: 'Run a retrospective on this sprint before moving to the next cycle.' },
  ];

  for (const { name, c, q, pf } of pinchLabels) {
    it(`${name} question is preserved verbatim`, () => {
      expect(c.question).toBe(q);
    });
    it(`${name} pinchFallback is preserved verbatim`, () => {
      expect(c.pinchFallback).toBe(pf);
    });
  }
});

describe('PM role — no opener-citation or framework-only opener tokens in rewritten L1 entries', () => {
  // Affected slots per analysis §12.8. Sweep ONLY these specific slot indices —
  // unaffected L1 entries are out of scope (may legitimately contain framework
  // references in casual prose).
  const affectedSlots: Array<{ name: string; c: import('./options.js').DecisionContent; slots: number[] }> = [
    { name: 'ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_FORMAL',  c: ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_FORMAL,  slots: [0, 1] },
    { name: 'ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_FORMAL',     c: ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_FORMAL,     slots: [0, 1] },
    { name: 'ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_FORMAL',     c: ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_FORMAL,     slots: [0, 1, 2] },
    { name: 'ABSENCE_DEPENDENCY_MAPPING_FORMAL',              c: ABSENCE_DEPENDENCY_MAPPING_FORMAL,              slots: [1, 2] },
    { name: 'ABSENCE_DEFINITION_OF_DONE_FORMAL',              c: ABSENCE_DEFINITION_OF_DONE_FORMAL,              slots: [0, 1, 2] },
    { name: 'ABSENCE_CROSS_TEAM_IMPACT_CHECK_FORMAL',         c: ABSENCE_CROSS_TEAM_IMPACT_CHECK_FORMAL,         slots: [0, 1] },
    { name: 'ABSENCE_SUCCESS_METRIC_DEFINITION_FORMAL',       c: ABSENCE_SUCCESS_METRIC_DEFINITION_FORMAL,       slots: [0, 2] },
    { name: 'ABSENCE_PRIORITY_JUSTIFICATION_FORMAL',          c: ABSENCE_PRIORITY_JUSTIFICATION_FORMAL,          slots: [0] },
    { name: 'ABSENCE_USER_STORY_COMPLETENESS_FORMAL',         c: ABSENCE_USER_STORY_COMPLETENESS_FORMAL,         slots: [0, 1] },
    { name: 'ABSENCE_RISK_FLAG_FORMAL',                       c: ABSENCE_RISK_FLAG_FORMAL,                       slots: [0] },
    { name: 'ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_FORMAL',  c: ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_FORMAL,  slots: [0] },
    { name: 'ABSENCE_RETROSPECTIVE_HABIT_FORMAL',             c: ABSENCE_RETROSPECTIVE_HABIT_FORMAL,             slots: [0, 1, 2] },
  ];

  // Forbidden patterns: opener attributions and framework-only openers that the
  // §12.8 rewrites removed. Inline references to a framework name (e.g. "Apply
  // INVEST to..." or "SMART criteria" inside an instruction) are acceptable; the
  // patterns below catch only opener-style citations and bare "(Wiegers, SEI)"-
  // style citations.
  const forbidden: Array<{ pattern: RegExp; description: string }> = [
    // "(Wiegers, SEI)" / "(Beyer et al., 2016)" paren-citations
    { pattern: /\([A-Z][a-z]+(?:\/[A-Z][a-z]+)?(?:,| et al\.,?) [A-Z0-9]/, description: 'paren-citation like (Author, Org/Year)' },
    // "PMBOK ... (Ch.NN)" framework-reference opener
    { pattern: /\bPMBOK [a-z][a-z\s]+\(Ch\.\d+\)/, description: 'PMBOK chapter-reference opener' },
    // "Scrum Guide 2020"-style version citation
    { pattern: /\bScrum Guide \d{4}\b/, description: 'Scrum Guide year-version citation' },
    // "Norm Kerth's Prime Directive framework" — opener attribution to a named person+framework
    { pattern: /\bNorm Kerth's [A-Z][a-z]+ [A-Z][a-z]+\b/, description: 'Norm Kerth attribution opener' },
    // Inline et-al style citation
    { pattern: /\b[A-Z][a-z]+ et al\.,? \d{4}\b/, description: 'inline et-al citation' },
  ];

  for (const { name, c, slots } of affectedSlots) {
    for (const slotIndex of slots) {
      it(`${name} L1[${slotIndex}] (rewritten) contains no citation or framework-opener patterns`, () => {
        const text = c.L1[slotIndex];
        for (const { pattern, description } of forbidden) {
          expect(text, `L1[${slotIndex}] matches ${description}: "${text}"`).not.toMatch(pattern);
        }
      });
    }
  }
});

describe('Phase 7 content routing', () => {
  function makeProfile(nature: import('../classifier/types.js').UserNature, role?: import('../classifier/types.js').UserRole): import('../classifier/types.js').UserProfile {
    return {
      nature,
      precisionScore: 5, playfulnessScore: 5,
      precisionOrdinal: 'medium', playfulnessOrdinal: 'medium',
      mood: 'focused', depth: 'medium', depthScore: 5,
      computedAt: 0,
      role: role ?? null,
    };
  }

  const phase7Keys = [
    'decision_fatigue_pattern', 'work_rhythm_check', 'focus_drift_detection',
    'session_length_checkpoint', 'progress_consolidation_gap',
  ];

  it('beginner profile gets BEGINNER content for all 5 Phase 7 signals', () => {
    const profile = makeProfile('beginner');
    for (const key of phase7Keys) {
      const result = resolveDecisionContent('implementation', `absence:${key}`, profile);
      expect(result).toBeDefined();
    }
  });

  it('cool_geek profile gets CASUAL content for all 5 Phase 7 signals', () => {
    const profile = makeProfile('cool_geek');
    const expected = [
      ABSENCE_DECISION_FATIGUE_PATTERN_CASUAL,
      ABSENCE_WORK_RHYTHM_CHECK_CASUAL,
      ABSENCE_FOCUS_DRIFT_DETECTION_CASUAL,
      ABSENCE_SESSION_LENGTH_CHECKPOINT_CASUAL,
      ABSENCE_PROGRESS_CONSOLIDATION_GAP_CASUAL,
    ];
    for (let i = 0; i < phase7Keys.length; i++) {
      const result = resolveDecisionContent('implementation', `absence:${phase7Keys[i]!}`, profile);
      expect(result).toBe(expected[i]);
    }
  });

  it('hardcore_pro profile gets FORMAL content for all 5 Phase 7 signals', () => {
    const profile = makeProfile('hardcore_pro');
    const expected = [
      ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL,
      ABSENCE_WORK_RHYTHM_CHECK_FORMAL,
      ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL,
      ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL,
      ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL,
    ];
    for (let i = 0; i < phase7Keys.length; i++) {
      const result = resolveDecisionContent('implementation', `absence:${phase7Keys[i]!}`, profile);
      expect(result).toBe(expected[i]);
    }
  });

  it('pm role gets FORMAL content for all 5 Phase 7 signals', () => {
    const profile = makeProfile('pro_geek_soul', 'pm');
    const expected = [
      ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL,
      ABSENCE_WORK_RHYTHM_CHECK_FORMAL,
      ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL,
      ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL,
      ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL,
    ];
    for (let i = 0; i < phase7Keys.length; i++) {
      const result = resolveDecisionContent('implementation', `absence:${phase7Keys[i]!}`, profile);
      expect(result).toBe(expected[i]);
    }
  });

  it('pro_geek_soul (no role) gets FORMAL content for all 5 Phase 7 signals', () => {
    const profile = makeProfile('pro_geek_soul');
    const expected = [
      ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL,
      ABSENCE_WORK_RHYTHM_CHECK_FORMAL,
      ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL,
      ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL,
      ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL,
    ];
    for (let i = 0; i < phase7Keys.length; i++) {
      const result = resolveDecisionContent('implementation', `absence:${phase7Keys[i]!}`, profile);
      expect(result).toBe(expected[i]);
    }
  });

  it('pro_geek_soul (no role) still gets CASUAL for non-Phase-7 absence signals', () => {
    const profile = makeProfile('pro_geek_soul');
    const result = resolveDecisionContent('implementation', 'absence:test_creation', profile);
    expect(result).toBe(ABSENCE_TEST_CREATION_CASUAL);
  });
});

