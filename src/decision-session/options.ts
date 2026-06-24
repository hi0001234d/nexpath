import type { Stage, UserProfile } from '../classifier/types.js';
import { STAGES } from '../classifier/types.js';
import type { FlagType } from '../classifier/Stage2Trigger.js';
import {
  ABSENCE_CONTENT_BEGINNER,
  TRANSITION_CONTENT_BEGINNER,
  TASK_REVIEW_BEGINNER,
} from './options-beginner.js';
import { WHY_HELP_BY_SIGNAL_TYPE } from './why-help-by-signal-type.js';

// ── Relocated per-class content (Layer-G split) ────────────────────────────────
export * from './content-templates/class1-stage-transition.js';
export * from './content-templates/class2-verification-quality.js';
export * from './content-templates/class3-spec-architecture.js';
export * from './content-templates/class4-release-observability-infra.js';
export * from './content-templates/class5-session-quality.js';
export * from './content-templates/class6-planning-idea-task.js';
export * from './content-templates/class7-cool-geek-vibe-coder.js';
export * from './content-templates/class8-role-cluster.js';
export * from './content-templates/class9-academic-hardcore-pro.js';
import {
  ARCHITECTURE_TO_TASKS,
  IDEA_TO_PRD,
  IMPLEMENTATION_TO_REVIEW,
  PRD_TO_ARCHITECTURE,
  RELEASE_TO_FEEDBACK,
  REVIEW_TO_RELEASE,
  TASK_REVIEW,
  TASK_REVIEW_CASUAL,
} from './content-templates/class1-stage-transition.js';
import {
  ABSENCE_ACCESSIBILITY,
  ABSENCE_ACCESSIBILITY_CASUAL,
  ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL,
  ABSENCE_CORRECTION_SEEKING,
  ABSENCE_CORRECTION_SEEKING_CASUAL,
  ABSENCE_DATA_VALIDATION,
  ABSENCE_DATA_VALIDATION_CASUAL,
  ABSENCE_DOCUMENTATION,
  ABSENCE_DOCUMENTATION_CASUAL,
  ABSENCE_ERROR_HANDLING,
  ABSENCE_ERROR_HANDLING_CASUAL,
  ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL,
  ABSENCE_PERFORMANCE_AWARENESS_CASUAL,
  ABSENCE_PROBLEM_CORRECTION,
  ABSENCE_PROBLEM_CORRECTION_CASUAL,
  ABSENCE_REFACTORING,
  ABSENCE_REFACTORING_CASUAL,
  ABSENCE_REFACTORING_CHECKPOINT_CASUAL,
  ABSENCE_REGRESSION_CHECK,
  ABSENCE_REGRESSION_CHECK_CASUAL,
  ABSENCE_SECURITY_CHECK,
  ABSENCE_SECURITY_CHECK_CASUAL,
  ABSENCE_SECURITY_REVIEW_GAP_CASUAL,
  ABSENCE_SELF_REVIEW_HABIT_CASUAL,
  ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL,
  ABSENCE_TEST_CREATION,
  ABSENCE_TEST_CREATION_BEGINNER,
  ABSENCE_TEST_CREATION_CASUAL,
  ABSENCE_TEST_DEPTH_CHECK_CASUAL,
  BEHAVIOUR_TESTING,
  BEHAVIOUR_TESTING_CASUAL,
} from './content-templates/class2-verification-quality.js';
import {
  ABSENCE_ALTERNATIVES,
  ABSENCE_ALTERNATIVES_CASUAL,
  ABSENCE_API_CONTRACT_DEFINITION_CASUAL,
  ABSENCE_API_DESIGN_REVIEW,
  ABSENCE_API_DESIGN_REVIEW_CASUAL,
  ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL,
  ABSENCE_ARCH_CONFLICT,
  ABSENCE_ARCH_CONFLICT_CASUAL,
  ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL,
  ABSENCE_CROSS_CONFIRMING,
  ABSENCE_CROSS_CONFIRMING_CASUAL,
  ABSENCE_PROMPT_CONTEXT,
  ABSENCE_PROMPT_CONTEXT_CASUAL,
  ABSENCE_SPEC_ACCEPTANCE,
  ABSENCE_SPEC_ACCEPTANCE_CASUAL,
  ABSENCE_SPEC_CROSS_CONFIRM,
  ABSENCE_SPEC_CROSS_CONFIRM_CASUAL,
  ABSENCE_SPEC_REVISION,
  ABSENCE_SPEC_REVISION_CASUAL,
} from './content-templates/class3-spec-architecture.js';
import {
  ABSENCE_CI_PIPELINE,
  ABSENCE_CI_PIPELINE_CASUAL,
  ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL,
  ABSENCE_DEPENDENCY_MGMT,
  ABSENCE_DEPENDENCY_MGMT_CASUAL,
  ABSENCE_DEPLOYMENT_PLANNING,
  ABSENCE_DEPLOYMENT_PLANNING_CASUAL,
  ABSENCE_ENV_AND_SECRETS,
  ABSENCE_ENV_AND_SECRETS_CASUAL,
  ABSENCE_OBSERVABILITY,
  ABSENCE_OBSERVABILITY_CASUAL,
  ABSENCE_RATE_LIMITING,
  ABSENCE_RATE_LIMITING_CASUAL,
  ABSENCE_ROLLBACK_PLANNING,
  ABSENCE_ROLLBACK_PLANNING_CASUAL,
} from './content-templates/class4-release-observability-infra.js';
import {
  ABSENCE_COMPREHENSION,
  ABSENCE_COMPREHENSION_CASUAL,
  ABSENCE_CONTEXT_LOSS,
  ABSENCE_CONTEXT_LOSS_CASUAL,
  ABSENCE_DECISION_FATIGUE_PATTERN_CASUAL,
  ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL,
  ABSENCE_FOCUS_DRIFT_DETECTION_CASUAL,
  ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL,
  ABSENCE_NO_PUSHBACK,
  ABSENCE_NO_PUSHBACK_CASUAL,
  ABSENCE_PROGRESS_CONSOLIDATION_GAP_CASUAL,
  ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL,
  ABSENCE_SESSION_LENGTH_CHECKPOINT_CASUAL,
  ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL,
  ABSENCE_WORK_RHYTHM_CHECK_CASUAL,
  ABSENCE_WORK_RHYTHM_CHECK_FORMAL,
} from './content-templates/class5-session-quality.js';
import {
  ABSENCE_FEATURE_SCOPE,
  ABSENCE_FEATURE_SCOPE_CASUAL,
  ABSENCE_IDEA_CONSTRAINT_CHECK,
  ABSENCE_IDEA_CONSTRAINT_CHECK_CASUAL,
  ABSENCE_IDEA_SCOPING,
  ABSENCE_IDEA_SCOPING_CASUAL,
  ABSENCE_IDEA_USER_DEFINITION,
  ABSENCE_IDEA_USER_DEFINITION_CASUAL,
  ABSENCE_IMPLEMENTATION_CHECKPOINT,
  ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL,
  ABSENCE_INCREMENTAL_BUILD,
  ABSENCE_INCREMENTAL_BUILD_CASUAL,
  ABSENCE_ITERATION_PLANNING,
  ABSENCE_ITERATION_PLANNING_CASUAL,
  ABSENCE_PHASE_TRANSITION,
  ABSENCE_PHASE_TRANSITION_CASUAL,
  ABSENCE_SCOPE_CREEP,
  ABSENCE_SCOPE_CREEP_CASUAL,
  ABSENCE_SPEC_BEFORE_CODE,
  ABSENCE_SPEC_BEFORE_CODE_CASUAL,
  ABSENCE_TASK_DEFINITION_OF_DONE,
  ABSENCE_TASK_DEFINITION_OF_DONE_CASUAL,
  ABSENCE_TASK_ORDERING,
  ABSENCE_TASK_ORDERING_CASUAL,
  ABSENCE_TASK_SIZING,
  ABSENCE_TASK_SIZING_CASUAL,
  ABSENCE_USER_FEEDBACK_REVIEW,
  ABSENCE_USER_FEEDBACK_REVIEW_CASUAL,
} from './content-templates/class6-planning-idea-task.js';
import {
  ABSENCE_CREATIVE_VS_CORE_RATIO_CASUAL,
  ABSENCE_DEMO_VS_PRODUCT_CASUAL,
  ABSENCE_DEPENDENCY_ADVENTURE_CASUAL,
  ABSENCE_FEATURE_COMPLETION_CHECK_CASUAL,
  ABSENCE_FINISHING_LINE_AWARENESS_CASUAL,
  ABSENCE_IDEA_TO_SPEC_BRIDGE_CASUAL,
  ABSENCE_MVP_SCOPE_DISCIPLINE_CASUAL,
  ABSENCE_POLISH_VS_FUNCTION_CASUAL,
  ABSENCE_RESTART_IMPULSE_CHECK_CASUAL,
  ABSENCE_TECHNICAL_SPIKE_TREATMENT_CASUAL,
  ABSENCE_USER_JOURNEY_CHECK_CASUAL,
} from './content-templates/class7-cool-geek-vibe-coder.js';
import {
  ABSENCE_CAPACITY_PLANNING_GAP_FORMAL,
  ABSENCE_CONTRACT_TESTING_GAP_FORMAL,
  ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL,
  ABSENCE_DECISION_RECORD_ABSENCE_FORMAL,
  ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL,
  ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL,
  ABSENCE_OBSERVABILITY_FIRST_FORMAL,
  ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL,
  ABSENCE_OVER_ENGINEERING_CHECK_FORMAL,
  ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL,
  ABSENCE_SECURITY_THREAT_MODELING_FORMAL,
  ABSENCE_SLO_DEFINITION_GAP_FORMAL,
} from './content-templates/class9-academic-hardcore-pro.js';
import {
  ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_FORMAL,
  ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY_CASUAL,
  ABSENCE_COMPETITIVE_AWARENESS_CASUAL,
  ABSENCE_CROSS_TEAM_IMPACT_CHECK_FORMAL,
  ABSENCE_DEFINITION_OF_DONE_FORMAL,
  ABSENCE_DEPENDENCY_MAPPING_FORMAL,
  ABSENCE_DISTRIBUTION_THINKING_CASUAL,
  ABSENCE_EARLY_USER_FEEDBACK_CASUAL,
  ABSENCE_FEATURE_PRIORITIZATION_CASUAL,
  ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT_CASUAL,
  ABSENCE_HYPOTHESIS_BEFORE_BUILD_CASUAL,
  ABSENCE_LAUNCH_STRATEGY_ABSENCE_CASUAL,
  ABSENCE_MANUAL_BEFORE_AUTOMATE_CASUAL,
  ABSENCE_MONETIZATION_PATH_CLARITY_CASUAL,
  ABSENCE_MVP_BOUNDARY_DISCIPLINE_CASUAL,
  ABSENCE_NORTH_STAR_ALIGNMENT_CASUAL,
  ABSENCE_OUTCOME_DEFINITION_CASUAL,
  ABSENCE_PRIORITY_JUSTIFICATION_FORMAL,
  ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_FORMAL,
  ABSENCE_RETENTION_MECHANISM_CHECK_CASUAL,
  ABSENCE_RETROSPECTIVE_HABIT_FORMAL,
  ABSENCE_RISK_FLAG_FORMAL,
  ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_FORMAL,
  ABSENCE_SCOPE_VS_TIME_CHECK_CASUAL,
  ABSENCE_SHIP_READINESS_DEFINITION_CASUAL,
  ABSENCE_SOLO_MAINTAINABILITY_CASUAL,
  ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_FORMAL,
  ABSENCE_SUCCESS_METRIC_DEFINITION_FORMAL,
  ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE_CASUAL,
  ABSENCE_TECH_STACK_COMPLEXITY_CHECK_CASUAL,
  ABSENCE_TIME_TO_VALUE_CHECK_CASUAL,
  ABSENCE_USER_ACQUISITION_CONSIDERATION_CASUAL,
  ABSENCE_USER_PERSONA_CLARITY_CASUAL,
  ABSENCE_USER_STORY_COMPLETENESS_FORMAL,
  ABSENCE_USER_VALUE_CHECK_CASUAL,
} from './content-templates/class8-role-cluster.js';


/**
 * Per-stage decision session content (from spec-driven-stages-research.md Part 3).
 *
 * Each entry has:
 *   - question     : bold-white question line shown in the header pair
 *   - pinchFallback: static label used when the pinch-word API call fails/times-out
 *   - L1           : Level 1 options (full, pre-filled agent prompts)
 *   - L2           : Level 2 options (easier)
 *   - L3           : Level 3 options (minimum viable step)
 *
 * Every option IS a pre-filled prompt ready to send to the agent — user hits Enter.
 */

import type { WhyHelpEntry } from './why-help.js';

/**
 * Per-option entry — option text plus an optional desc-base template.
 *
 * `option`   is the prompt text the user sees and sends to the agent.
 * `descBase` is the R3 desc-base template attached to that option; it
 *            contains substitution placeholders that the runtime resolves
 *            before the option is rendered. Empty string means no
 *            desc-base for this option yet (populated by later content
 *            authoring passes).
 */
/**
 * Content-type forward-compat discipline: every NEW field added to an in-source
 * content interface below MUST be optional (`?:`) with a documented
 * default-when-omitted, and consumers narrow-check it (e.g. `x ?? default`), so
 * older code keeps compiling when fields are added. Required slots are fixed;
 * new capability/behaviour fields are additive-optional. Enforced by
 * content-type-optionality.test.ts.
 */
export interface OptionEntry {
  option:   string;
  descBase: string;
}

export interface DecisionContent {
  /**
   * Per-set signal_type key matching the r5-fallbacks lookup table.
   * Multiple register variants of the same logical set
   * (e.g. ABSENCE_TEST_CREATION / ABSENCE_TEST_CREATION_CASUAL /
   * ABSENCE_TEST_CREATION_BEGINNER) share the same base signalType
   * so the D-fallback lookup is register-agnostic.
   */
  signalType:    string;
  question:      string;
  pinchFallback: string;
  L1: OptionEntry[];
  L2: OptionEntry[];
  L3: OptionEntry[];
  /**
   * Optional popup why-help entry — discriminated-union shape supporting the 4
   * register-structure groups per signal class (universal-triplet for classes
   * 1-6, class7-vibe-coder for class 7, class8-role-cluster for class 8,
   * class9-formal-only for class 9). Resolved per (signal class × register
   * × role) by `composeWhyHelpBlock` and rendered as the popup why-help
   * block per dev-plan §11.2.
   */
  whyHelp?:      WhyHelpEntry;
  /**
   * Per-set opt-out flag for the desc-base rendering + substitution pipeline.
   * When `false`, the runtime skips desc-base processing for this set's
   * options regardless of whether `descBase` content is present. Defaults
   * to `true` (desc-bases active) when omitted.
   */
  descBaseEnabled?: boolean;
  /**
   * Per-set marker for the deferred L2 safeguard pass. When `true`, this
   * set is in scope for the L2 sensitive-action safeguard authoring pass
   * — author inlines a confirmation-seek sentence into the relevant
   * options' desc-base content during the L2 pass. Sets without this
   * marker are out of scope. Defaults to `undefined` / `false` when
   * omitted.
   */
  l2SafeguardRequired?: boolean;
  /**
   * Per-set total-length budget that bounds the FULL desc-base after R5
   * runtime substitution (open bookend + gap-framing + direction-body +
   * substituted R5 content + close bookend). Three tiers:
   *
   *   LIGHT   — up to 2 visible lines, up to 2 expanded lines,  ≤  200 chars total
   *   MEDIUM  — up to 2 visible lines, up to 4 expanded lines,  ≤  400 chars total
   *   HEAVY   — up to 2 visible lines, up to 10 expanded lines, ≤ 1000 chars total
   *
   * Omitted = `MEDIUM` at runtime (the default tier).
   *
   * When the post-substitution total exceeds the set's tier, the
   * injection module falls back to the static D-fallback string for that
   * option — the fallback string is shorter and stays inside the budget.
   */
  lengthBudget?: 'LIGHT' | 'MEDIUM' | 'HEAVY';
}

// ── Content resolution ─────────────────────────────────────────────────────────

/**
 * Absence-signal content overrides.
 * When Stage 2 fires for an absence flag, map the signal to the most relevant content.
 * Signals not listed here fall back to the stage-based transition content.
 */
const ABSENCE_CONTENT: Partial<Record<string, DecisionContent>> = {
  test_creation:         ABSENCE_TEST_CREATION,
  regression_check:      ABSENCE_REGRESSION_CHECK,
  spec_acceptance_check: ABSENCE_SPEC_ACCEPTANCE,
  cross_confirming:      ABSENCE_CROSS_CONFIRMING,
  behaviour_testing:     BEHAVIOUR_TESTING,
  security_check:        ABSENCE_SECURITY_CHECK,
  error_handling:        ABSENCE_ERROR_HANDLING,
  documentation:         ABSENCE_DOCUMENTATION,
  observability:         ABSENCE_OBSERVABILITY,
  comprehension:         ABSENCE_COMPREHENSION,
  refactoring_review:      ABSENCE_REFACTORING,
  no_agent_pushback:       ABSENCE_NO_PUSHBACK,
  correction_seeking:      ABSENCE_CORRECTION_SEEKING,
  problem_correction:      ABSENCE_PROBLEM_CORRECTION,
  alternatives_seeking:    ABSENCE_ALTERNATIVES,
  architecture_conflict:   ABSENCE_ARCH_CONFLICT,
  prompt_context_richness: ABSENCE_PROMPT_CONTEXT,
  rollback_planning:       ABSENCE_ROLLBACK_PLANNING,
  deployment_planning:     ABSENCE_DEPLOYMENT_PLANNING,
  dependency_management:   ABSENCE_DEPENDENCY_MGMT,
  phase_transition:        ABSENCE_PHASE_TRANSITION,
  spec_cross_confirm:      ABSENCE_SPEC_CROSS_CONFIRM,
  spec_revision:           ABSENCE_SPEC_REVISION,
  idea_scoping:            ABSENCE_IDEA_SCOPING,
  idea_constraint_check:   ABSENCE_IDEA_CONSTRAINT_CHECK,
  idea_user_definition:    ABSENCE_IDEA_USER_DEFINITION,
  task_ordering:           ABSENCE_TASK_ORDERING,
  task_sizing:             ABSENCE_TASK_SIZING,
  task_definition_of_done: ABSENCE_TASK_DEFINITION_OF_DONE,
  user_feedback_review:    ABSENCE_USER_FEEDBACK_REVIEW,
  iteration_planning:      ABSENCE_ITERATION_PLANNING,
  scope_creep:             ABSENCE_SCOPE_CREEP,
  context_loss:            ABSENCE_CONTEXT_LOSS,
  api_design_review:       ABSENCE_API_DESIGN_REVIEW,
  accessibility:           ABSENCE_ACCESSIBILITY,
  environment_and_secrets: ABSENCE_ENV_AND_SECRETS,
  data_validation:         ABSENCE_DATA_VALIDATION,
  ci_pipeline:             ABSENCE_CI_PIPELINE,
  rate_limiting:           ABSENCE_RATE_LIMITING,
  feature_scope_before_build:    ABSENCE_FEATURE_SCOPE,
  implementation_checkpoint:     ABSENCE_IMPLEMENTATION_CHECKPOINT,
  spec_before_code:              ABSENCE_SPEC_BEFORE_CODE,
  incremental_build:             ABSENCE_INCREMENTAL_BUILD,
  decision_record_absence:       ABSENCE_DECISION_RECORD_ABSENCE_FORMAL,
  over_engineering_check:        ABSENCE_OVER_ENGINEERING_CHECK_FORMAL,
  pair_review_absence:           ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL,
  observability_first:           ABSENCE_OBSERVABILITY_FIRST_FORMAL,
  failure_mode_analysis:         ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL,
  contract_testing_gap:          ABSENCE_CONTRACT_TESTING_GAP_FORMAL,
  capacity_planning_gap:         ABSENCE_CAPACITY_PLANNING_GAP_FORMAL,
  security_threat_modeling:      ABSENCE_SECURITY_THREAT_MODELING_FORMAL,
  database_migration_safety:     ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL,
  deployment_strategy_absence:   ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL,
  operational_runbook_gap:       ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL,
  slo_definition_gap:            ABSENCE_SLO_DEFINITION_GAP_FORMAL,
  decision_fatigue_pattern:      ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL,
  work_rhythm_check:             ABSENCE_WORK_RHYTHM_CHECK_FORMAL,
  focus_drift_detection:         ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL,
  session_length_checkpoint:     ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL,
  progress_consolidation_gap:    ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL,
};

const ABSENCE_CONTENT_CASUAL: Partial<Record<string, DecisionContent>> = {
  test_creation:         ABSENCE_TEST_CREATION_CASUAL,
  regression_check:      ABSENCE_REGRESSION_CHECK_CASUAL,
  spec_acceptance_check: ABSENCE_SPEC_ACCEPTANCE_CASUAL,
  cross_confirming:      ABSENCE_CROSS_CONFIRMING_CASUAL,
  behaviour_testing:     BEHAVIOUR_TESTING_CASUAL,
  security_check:        ABSENCE_SECURITY_CHECK_CASUAL,
  error_handling:        ABSENCE_ERROR_HANDLING_CASUAL,
  documentation:         ABSENCE_DOCUMENTATION_CASUAL,
  observability:         ABSENCE_OBSERVABILITY_CASUAL,
  comprehension:         ABSENCE_COMPREHENSION_CASUAL,
  refactoring_review:      ABSENCE_REFACTORING_CASUAL,
  no_agent_pushback:       ABSENCE_NO_PUSHBACK_CASUAL,
  correction_seeking:      ABSENCE_CORRECTION_SEEKING_CASUAL,
  problem_correction:      ABSENCE_PROBLEM_CORRECTION_CASUAL,
  alternatives_seeking:    ABSENCE_ALTERNATIVES_CASUAL,
  architecture_conflict:   ABSENCE_ARCH_CONFLICT_CASUAL,
  prompt_context_richness: ABSENCE_PROMPT_CONTEXT_CASUAL,
  rollback_planning:       ABSENCE_ROLLBACK_PLANNING_CASUAL,
  deployment_planning:     ABSENCE_DEPLOYMENT_PLANNING_CASUAL,
  dependency_management:   ABSENCE_DEPENDENCY_MGMT_CASUAL,
  phase_transition:        ABSENCE_PHASE_TRANSITION_CASUAL,
  spec_cross_confirm:      ABSENCE_SPEC_CROSS_CONFIRM_CASUAL,
  spec_revision:           ABSENCE_SPEC_REVISION_CASUAL,
  idea_scoping:            ABSENCE_IDEA_SCOPING_CASUAL,
  idea_constraint_check:   ABSENCE_IDEA_CONSTRAINT_CHECK_CASUAL,
  idea_user_definition:    ABSENCE_IDEA_USER_DEFINITION_CASUAL,
  task_ordering:           ABSENCE_TASK_ORDERING_CASUAL,
  task_sizing:             ABSENCE_TASK_SIZING_CASUAL,
  task_definition_of_done: ABSENCE_TASK_DEFINITION_OF_DONE_CASUAL,
  user_feedback_review:    ABSENCE_USER_FEEDBACK_REVIEW_CASUAL,
  iteration_planning:      ABSENCE_ITERATION_PLANNING_CASUAL,
  scope_creep:             ABSENCE_SCOPE_CREEP_CASUAL,
  context_loss:            ABSENCE_CONTEXT_LOSS_CASUAL,
  api_design_review:       ABSENCE_API_DESIGN_REVIEW_CASUAL,
  accessibility:           ABSENCE_ACCESSIBILITY_CASUAL,
  environment_and_secrets: ABSENCE_ENV_AND_SECRETS_CASUAL,
  data_validation:         ABSENCE_DATA_VALIDATION_CASUAL,
  ci_pipeline:             ABSENCE_CI_PIPELINE_CASUAL,
  rate_limiting:           ABSENCE_RATE_LIMITING_CASUAL,
  feature_scope_before_build:    ABSENCE_FEATURE_SCOPE_CASUAL,
  implementation_checkpoint:     ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL,
  spec_before_code:              ABSENCE_SPEC_BEFORE_CODE_CASUAL,
  incremental_build:             ABSENCE_INCREMENTAL_BUILD_CASUAL,
  feature_completion_check:      ABSENCE_FEATURE_COMPLETION_CHECK_CASUAL,
  finishing_line_awareness:      ABSENCE_FINISHING_LINE_AWARENESS_CASUAL,
  polish_vs_function:            ABSENCE_POLISH_VS_FUNCTION_CASUAL,
  mvp_scope_discipline:          ABSENCE_MVP_SCOPE_DISCIPLINE_CASUAL,
  idea_to_spec_bridge:           ABSENCE_IDEA_TO_SPEC_BRIDGE_CASUAL,
  demo_vs_product:               ABSENCE_DEMO_VS_PRODUCT_CASUAL,
  user_journey_check:            ABSENCE_USER_JOURNEY_CHECK_CASUAL,
  technical_spike_treatment:     ABSENCE_TECHNICAL_SPIKE_TREATMENT_CASUAL,
  dependency_adventure:          ABSENCE_DEPENDENCY_ADVENTURE_CASUAL,
  restart_impulse_check:         ABSENCE_RESTART_IMPULSE_CHECK_CASUAL,
  creative_vs_core_ratio:        ABSENCE_CREATIVE_VS_CORE_RATIO_CASUAL,
  code_documentation_gap:        ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL,
  technical_debt_acknowledgment: ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL,
  test_depth_check:              ABSENCE_TEST_DEPTH_CHECK_CASUAL,
  architecture_note_absence:     ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL,
  dependency_audit_gap:          ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL,
  security_review_gap:           ABSENCE_SECURITY_REVIEW_GAP_CASUAL,
  api_contract_definition:       ABSENCE_API_CONTRACT_DEFINITION_CASUAL,
  error_handling_coverage:       ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL,
  refactoring_checkpoint:        ABSENCE_REFACTORING_CHECKPOINT_CASUAL,
  backwards_compatibility_check: ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL,
  self_review_habit:             ABSENCE_SELF_REVIEW_HABIT_CASUAL,
  performance_awareness:         ABSENCE_PERFORMANCE_AWARENESS_CASUAL,
  decision_fatigue_pattern:      ABSENCE_DECISION_FATIGUE_PATTERN_CASUAL,
  work_rhythm_check:             ABSENCE_WORK_RHYTHM_CHECK_CASUAL,
  focus_drift_detection:         ABSENCE_FOCUS_DRIFT_DETECTION_CASUAL,
  session_length_checkpoint:     ABSENCE_SESSION_LENGTH_CHECKPOINT_CASUAL,
  progress_consolidation_gap:    ABSENCE_PROGRESS_CONSOLIDATION_GAP_CASUAL,
};

const ABSENCE_CONTENT_FOUNDER: Partial<Record<string, DecisionContent>> = {
  user_value_check:                  ABSENCE_USER_VALUE_CHECK_CASUAL,
  outcome_definition:                ABSENCE_OUTCOME_DEFINITION_CASUAL,
  feature_prioritization:            ABSENCE_FEATURE_PRIORITIZATION_CASUAL,
  user_persona_clarity:              ABSENCE_USER_PERSONA_CLARITY_CASUAL,
  competitive_awareness:             ABSENCE_COMPETITIVE_AWARENESS_CASUAL,
  mvp_boundary_discipline:           ABSENCE_MVP_BOUNDARY_DISCIPLINE_CASUAL,
  user_acquisition_consideration:    ABSENCE_USER_ACQUISITION_CONSIDERATION_CASUAL,
  retention_mechanism_check:         ABSENCE_RETENTION_MECHANISM_CHECK_CASUAL,
  feedback_loop_establishment:       ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT_CASUAL,
  hypothesis_before_build:           ABSENCE_HYPOTHESIS_BEFORE_BUILD_CASUAL,
  technical_vs_product_time_balance: ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE_CASUAL,
  north_star_alignment:              ABSENCE_NORTH_STAR_ALIGNMENT_CASUAL,
};

const ABSENCE_CONTENT_INDIE_HACKER: Partial<Record<string, DecisionContent>> = {
  time_to_value_check:         ABSENCE_TIME_TO_VALUE_CHECK_CASUAL,
  ship_readiness_definition:   ABSENCE_SHIP_READINESS_DEFINITION_CASUAL,
  manual_before_automate:      ABSENCE_MANUAL_BEFORE_AUTOMATE_CASUAL,
  tech_stack_complexity_check: ABSENCE_TECH_STACK_COMPLEXITY_CHECK_CASUAL,
  launch_strategy_absence:     ABSENCE_LAUNCH_STRATEGY_ABSENCE_CASUAL,
  early_user_feedback:         ABSENCE_EARLY_USER_FEEDBACK_CASUAL,
  solo_maintainability:        ABSENCE_SOLO_MAINTAINABILITY_CASUAL,
  distribution_thinking:       ABSENCE_DISTRIBUTION_THINKING_CASUAL,
  monetization_path_clarity:   ABSENCE_MONETIZATION_PATH_CLARITY_CASUAL,
  build_in_public_opportunity: ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY_CASUAL,
  scope_vs_time_check:         ABSENCE_SCOPE_VS_TIME_CHECK_CASUAL,
};

const ABSENCE_CONTENT_PM: Partial<Record<string, DecisionContent>> = {
  acceptance_criteria_before_dev: ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_FORMAL,
  stakeholder_alignment_check:    ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_FORMAL,
  requirements_ambiguity_flag:    ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_FORMAL,
  dependency_mapping:             ABSENCE_DEPENDENCY_MAPPING_FORMAL,
  definition_of_done:             ABSENCE_DEFINITION_OF_DONE_FORMAL,
  cross_team_impact_check:        ABSENCE_CROSS_TEAM_IMPACT_CHECK_FORMAL,
  success_metric_definition:      ABSENCE_SUCCESS_METRIC_DEFINITION_FORMAL,
  priority_justification:         ABSENCE_PRIORITY_JUSTIFICATION_FORMAL,
  user_story_completeness:        ABSENCE_USER_STORY_COMPLETENESS_FORMAL,
  risk_flag:                      ABSENCE_RISK_FLAG_FORMAL,
  scope_change_impact_assessment: ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_FORMAL,
  retrospective_habit:            ABSENCE_RETROSPECTIVE_HABIT_FORMAL,
  decision_fatigue_pattern:       ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL,
  work_rhythm_check:              ABSENCE_WORK_RHYTHM_CHECK_FORMAL,
  focus_drift_detection:          ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL,
  session_length_checkpoint:      ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL,
  progress_consolidation_gap:     ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL,
};

const ABSENCE_CONTENT_PRO_GEEK_SOUL: Partial<Record<string, DecisionContent>> = {
  decision_fatigue_pattern:   ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL,
  work_rhythm_check:          ABSENCE_WORK_RHYTHM_CHECK_FORMAL,
  focus_drift_detection:      ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL,
  session_length_checkpoint:  ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL,
  progress_consolidation_gap: ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL,
};

/**
 * Stage transition content lookup.
 * Keyed by the DESTINATION stage (currentStage after transition).
 */
const TRANSITION_CONTENT: Partial<Record<Stage, DecisionContent>> = {
  prd:            IDEA_TO_PRD,
  architecture:   PRD_TO_ARCHITECTURE,
  task_breakdown: ARCHITECTURE_TO_TASKS,
  review_testing: IMPLEMENTATION_TO_REVIEW,
  release:        REVIEW_TO_RELEASE,
  feedback_loop:  RELEASE_TO_FEEDBACK,
};

function selectAbsenceMap(nature: UserProfile['nature'] | null | undefined): Partial<Record<string, DecisionContent>> {
  if (nature === 'hardcore_pro') return ABSENCE_CONTENT;
  return ABSENCE_CONTENT_CASUAL;
}

function selectRoleAbsenceMap(role: UserProfile['role'] | null | undefined): Partial<Record<string, DecisionContent>> | null {
  if (role === 'founder')      return ABSENCE_CONTENT_FOUNDER;
  if (role === 'indie_hacker') return ABSENCE_CONTENT_INDIE_HACKER;
  if (role === 'pm')           return ABSENCE_CONTENT_PM;
  return null;
}

function selectNonBeginnerVariant(nature: UserProfile['nature'] | null | undefined): DecisionContent {
  if (nature === 'hardcore_pro') return TASK_REVIEW;
  return TASK_REVIEW_CASUAL;
}

/**
 * Resolve the decision content to display.
 *
 * Priority:
 *   1. Absence flag with a specific override → use it
 *   2. Stage transition → use destination-stage content
 *   3. Implementation stage (within-stage absence) → heuristic variant by profile.nature
 *   4. Ultimate fallback → heuristic variant by profile.nature
 */
function resolveSkippedTransitionContent(
  transitionMap: Partial<Record<Stage, DecisionContent>>,
  prevStage:     Stage,
  currentStage:  Stage,
): DecisionContent | null {
  const prevIdx = STAGES.indexOf(prevStage);
  const currIdx = STAGES.indexOf(currentStage);
  if (prevIdx < 0 || currIdx < 0 || currIdx - prevIdx <= 1) return null;
  for (let i = currIdx - 1; i > prevIdx; i--) {
    const stage = STAGES[i];
    if (stage && transitionMap[stage]) return transitionMap[stage]!;
  }
  return null;
}

export function resolveDecisionContent(
  currentStage: Stage,
  flagType:     FlagType,
  profile?:     UserProfile | null,
  prevStage?:   Stage,
): DecisionContent {
  const isBeginner    = profile?.nature === 'beginner';
  const isVibe        = isBeginner;
  const absenceMap    = isVibe ? ABSENCE_CONTENT_BEGINNER : selectAbsenceMap(profile?.nature);
  const roleMap       = isVibe ? null : selectRoleAbsenceMap(profile?.role);
  const transitionMap = isVibe ? TRANSITION_CONTENT_BEGINNER : TRANSITION_CONTENT;

  if (flagType.startsWith('absence:')) {
    const signalKey  = flagType.slice('absence:'.length);
    const roleHit    = roleMap?.[signalKey];
    if (roleHit) return roleHit;
    if (profile?.nature === 'pro_geek_soul') {
      const pgOverride = ABSENCE_CONTENT_PRO_GEEK_SOUL[signalKey];
      if (pgOverride) return pgOverride;
    }
    const override   = absenceMap[signalKey];
    if (override) return override;
  }

  if (flagType === 'stage_transition' && prevStage) {
    const skipped = resolveSkippedTransitionContent(transitionMap, prevStage, currentStage);
    if (skipped) return skipped;
  }

  const direct = transitionMap[currentStage];
  if (direct) return direct;

  if (currentStage === 'implementation') return isBeginner ? TASK_REVIEW_BEGINNER : selectNonBeginnerVariant(profile?.nature);

  return isBeginner ? TASK_REVIEW_BEGINNER : selectNonBeginnerVariant(profile?.nature);
}

// ── Option list building ───────────────────────────────────────────────────────

export const SHOW_SIMPLER  = 'Show simpler options →' as const;
export const SKIP_NOW      = 'Skip for now — nexpath optimize will remind me later' as const;

export type SpecialOption  = typeof SHOW_SIMPLER | typeof SKIP_NOW;
export type DecisionOption = string | SpecialOption;

export interface BuiltOptionList {
  /** The selectable options for this level, including "Show simpler options →" and "Skip for now". */
  options: DecisionOption[];
  /** Whether "Show simpler options →" is included (levels 1 and 2 only). */
  hasNextLevel: boolean;
}

/**
 * Build the full option list for a given level.
 *
 * Structure (per research):
 *   - Content options for this level
 *   - [separator implied in UI — not a selectable option]
 *   - "Show simpler options →"  (levels 1 and 2 only)
 *   - "Skip for now — nexpath optimize will remind me later"  (always last)
 */
export function buildOptionList(
  content: DecisionContent,
  level:   1 | 2 | 3,
): BuiltOptionList {
  const contentOptions: OptionEntry[] =
    level === 1 ? content.L1 :
    level === 2 ? content.L2 :
                  content.L3;

  const hasNextLevel = level < 3;
  // Surface the user-facing option text for the list. Desc-base content
  // attached to each OptionEntry is consumed by the render layer when
  // rendering the why-help / desc-base regions, not in the flat option
  // list shown for selection.
  const options: DecisionOption[] = contentOptions.map((e) => e.option);

  if (hasNextLevel) options.push(SHOW_SIMPLER);
  options.push(SKIP_NOW);

  return { options, hasNextLevel };
}

// ── Level subtitle ─────────────────────────────────────────────────────────────

/** Returns the level subtitle shown below the pinch label (research spec). */
export function getLevelSubtitle(level: 1 | 2 | 3): string | null {
  if (level === 1) return null;
  if (level === 2) return '— lighter options';
  return '— minimum viable step';
}

// ── Selection-axis maps + helper (consumed by the single-dispatch
//    selection-registry, which mirrors the resolveDecisionContent cascade) ───────
export {
  ABSENCE_CONTENT,
  ABSENCE_CONTENT_CASUAL,
  ABSENCE_CONTENT_FOUNDER,
  ABSENCE_CONTENT_INDIE_HACKER,
  ABSENCE_CONTENT_PM,
  ABSENCE_CONTENT_PRO_GEEK_SOUL,
  TRANSITION_CONTENT,
  resolveSkippedTransitionContent,
};
