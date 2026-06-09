// Maps each runtime `signalType` (the string value carried on every
// DecisionContent at runtime) to the WhyHelpEntry for its signal class.
//
// At decision-session-message build time the popup's why-help block
// resolves to the correct per-class content by looking up the active
// DecisionContent's `signalType` against this map. The 9 signal classes
// (class1_stage_transition through class9_academic_hardcore_pro) cover
// every signalType in the runtime catalog — 136 unique signalTypes
// total, split: class 1 stage transitions (7) + class 2 verification /
// quality (21) + class 3 spec / architecture (11) + class 4 release /
// observability / infra (8) + class 5 session quality (8) + class 6
// planning / idea / task (14) + class 7 cool_geek vibe-coder (20) +
// class 8 role cluster (35) + class 9 academic hardcore_pro (12).
//
// Per-register / per-role rendering is handled downstream by
// `composeWhyHelpBlock` (which selects the appropriate sub-field on the
// returned WhyHelpEntry based on the user's profile.register / role /
// mood). This map only resolves signalType → class.

import { WHY_HELP_PER_CLASS, type WhyHelpEntry } from './why-help.js';

export const WHY_HELP_BY_SIGNAL_TYPE: Record<string, WhyHelpEntry> = {
  // ── Class 1 — stage transitions ─────────────────────────────────────────
  IDEA_TO_PRD:              WHY_HELP_PER_CLASS.class1_stage_transition,
  PRD_TO_ARCHITECTURE:      WHY_HELP_PER_CLASS.class1_stage_transition,
  ARCHITECTURE_TO_TASKS:    WHY_HELP_PER_CLASS.class1_stage_transition,
  TASK_REVIEW:              WHY_HELP_PER_CLASS.class1_stage_transition,
  IMPLEMENTATION_TO_REVIEW: WHY_HELP_PER_CLASS.class1_stage_transition,
  REVIEW_TO_RELEASE:        WHY_HELP_PER_CLASS.class1_stage_transition,
  RELEASE_TO_FEEDBACK:      WHY_HELP_PER_CLASS.class1_stage_transition,

  // ── Class 2 — verification / quality ────────────────────────────────────
  BEHAVIOUR_TESTING:                     WHY_HELP_PER_CLASS.class2_verification_quality,
  ABSENCE_TEST_CREATION:                 WHY_HELP_PER_CLASS.class2_verification_quality,
  ABSENCE_REGRESSION_CHECK:              WHY_HELP_PER_CLASS.class2_verification_quality,
  ABSENCE_SECURITY_CHECK:                WHY_HELP_PER_CLASS.class2_verification_quality,
  ABSENCE_ERROR_HANDLING:                WHY_HELP_PER_CLASS.class2_verification_quality,
  ABSENCE_PROBLEM_CORRECTION:            WHY_HELP_PER_CLASS.class2_verification_quality,
  ABSENCE_OUTPUT_VERIFICATION:           WHY_HELP_PER_CLASS.class2_verification_quality,
  ABSENCE_ACCESSIBILITY:                 WHY_HELP_PER_CLASS.class2_verification_quality,
  ABSENCE_DATA_VALIDATION:               WHY_HELP_PER_CLASS.class2_verification_quality,
  ABSENCE_DOCUMENTATION:                 WHY_HELP_PER_CLASS.class2_verification_quality,
  ABSENCE_REFACTORING:                   WHY_HELP_PER_CLASS.class2_verification_quality,
  ABSENCE_CORRECTION_SEEKING:            WHY_HELP_PER_CLASS.class2_verification_quality,
  ABSENCE_REFACTORING_CHECKPOINT:        WHY_HELP_PER_CLASS.class2_verification_quality,
  ABSENCE_DOCUMENTATION_BEFORE_ASK:      WHY_HELP_PER_CLASS.class2_verification_quality,
  ABSENCE_CODE_DOCUMENTATION_GAP:        WHY_HELP_PER_CLASS.class2_verification_quality,
  ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT: WHY_HELP_PER_CLASS.class2_verification_quality,
  ABSENCE_TEST_DEPTH_CHECK:              WHY_HELP_PER_CLASS.class2_verification_quality,
  ABSENCE_SECURITY_REVIEW_GAP:           WHY_HELP_PER_CLASS.class2_verification_quality,
  ABSENCE_ERROR_HANDLING_COVERAGE:       WHY_HELP_PER_CLASS.class2_verification_quality,
  ABSENCE_SELF_REVIEW_HABIT:             WHY_HELP_PER_CLASS.class2_verification_quality,
  ABSENCE_PERFORMANCE_AWARENESS:         WHY_HELP_PER_CLASS.class2_verification_quality,

  // ── Class 3 — spec / architecture ───────────────────────────────────────
  ABSENCE_SPEC_ACCEPTANCE:               WHY_HELP_PER_CLASS.class3_spec_architecture,
  ABSENCE_CROSS_CONFIRMING:              WHY_HELP_PER_CLASS.class3_spec_architecture,
  ABSENCE_SPEC_CROSS_CONFIRM:            WHY_HELP_PER_CLASS.class3_spec_architecture,
  ABSENCE_SPEC_REVISION:                 WHY_HELP_PER_CLASS.class3_spec_architecture,
  ABSENCE_ARCH_CONFLICT:                 WHY_HELP_PER_CLASS.class3_spec_architecture,
  ABSENCE_API_DESIGN_REVIEW:             WHY_HELP_PER_CLASS.class3_spec_architecture,
  ABSENCE_PROMPT_CONTEXT:                WHY_HELP_PER_CLASS.class3_spec_architecture,
  ABSENCE_ALTERNATIVES:                  WHY_HELP_PER_CLASS.class3_spec_architecture,
  ABSENCE_ARCHITECTURE_NOTE_ABSENCE:     WHY_HELP_PER_CLASS.class3_spec_architecture,
  ABSENCE_API_CONTRACT_DEFINITION:       WHY_HELP_PER_CLASS.class3_spec_architecture,
  ABSENCE_BACKWARDS_COMPATIBILITY_CHECK: WHY_HELP_PER_CLASS.class3_spec_architecture,

  // ── Class 4 — release / observability / infra ──────────────────────────
  ABSENCE_OBSERVABILITY:        WHY_HELP_PER_CLASS.class4_release_observability_infra,
  ABSENCE_ROLLBACK_PLANNING:    WHY_HELP_PER_CLASS.class4_release_observability_infra,
  ABSENCE_DEPLOYMENT_PLANNING:  WHY_HELP_PER_CLASS.class4_release_observability_infra,
  ABSENCE_DEPENDENCY_MGMT:      WHY_HELP_PER_CLASS.class4_release_observability_infra,
  ABSENCE_ENV_AND_SECRETS:      WHY_HELP_PER_CLASS.class4_release_observability_infra,
  ABSENCE_CI_PIPELINE:          WHY_HELP_PER_CLASS.class4_release_observability_infra,
  ABSENCE_RATE_LIMITING:        WHY_HELP_PER_CLASS.class4_release_observability_infra,
  ABSENCE_DEPENDENCY_AUDIT_GAP: WHY_HELP_PER_CLASS.class4_release_observability_infra,

  // ── Class 5 — session quality ──────────────────────────────────────────
  ABSENCE_WORK_RHYTHM_CHECK:          WHY_HELP_PER_CLASS.class5_session_quality,
  ABSENCE_DECISION_FATIGUE_PATTERN:   WHY_HELP_PER_CLASS.class5_session_quality,
  ABSENCE_FOCUS_DRIFT_DETECTION:      WHY_HELP_PER_CLASS.class5_session_quality,
  ABSENCE_SESSION_LENGTH_CHECKPOINT:  WHY_HELP_PER_CLASS.class5_session_quality,
  ABSENCE_PROGRESS_CONSOLIDATION_GAP: WHY_HELP_PER_CLASS.class5_session_quality,
  ABSENCE_CONTEXT_LOSS:               WHY_HELP_PER_CLASS.class5_session_quality,
  ABSENCE_COMPREHENSION:              WHY_HELP_PER_CLASS.class5_session_quality,
  ABSENCE_NO_PUSHBACK:                WHY_HELP_PER_CLASS.class5_session_quality,

  // ── Class 6 — planning / idea / task ───────────────────────────────────
  ABSENCE_PHASE_TRANSITION:          WHY_HELP_PER_CLASS.class6_planning_idea_task,
  ABSENCE_IDEA_SCOPING:              WHY_HELP_PER_CLASS.class6_planning_idea_task,
  ABSENCE_IDEA_CONSTRAINT_CHECK:     WHY_HELP_PER_CLASS.class6_planning_idea_task,
  ABSENCE_IDEA_USER_DEFINITION:      WHY_HELP_PER_CLASS.class6_planning_idea_task,
  ABSENCE_TASK_ORDERING:             WHY_HELP_PER_CLASS.class6_planning_idea_task,
  ABSENCE_TASK_SIZING:               WHY_HELP_PER_CLASS.class6_planning_idea_task,
  ABSENCE_TASK_DEFINITION_OF_DONE:   WHY_HELP_PER_CLASS.class6_planning_idea_task,
  ABSENCE_USER_FEEDBACK_REVIEW:      WHY_HELP_PER_CLASS.class6_planning_idea_task,
  ABSENCE_ITERATION_PLANNING:        WHY_HELP_PER_CLASS.class6_planning_idea_task,
  ABSENCE_SCOPE_CREEP:               WHY_HELP_PER_CLASS.class6_planning_idea_task,
  ABSENCE_FEATURE_SCOPE:             WHY_HELP_PER_CLASS.class6_planning_idea_task,
  ABSENCE_IMPLEMENTATION_CHECKPOINT: WHY_HELP_PER_CLASS.class6_planning_idea_task,
  ABSENCE_SPEC_BEFORE_CODE:          WHY_HELP_PER_CLASS.class6_planning_idea_task,
  ABSENCE_INCREMENTAL_BUILD:         WHY_HELP_PER_CLASS.class6_planning_idea_task,

  // ── Class 7 — cool_geek / vibe-coder ───────────────────────────────────
  ABSENCE_FEATURE_COMPLETION_CHECK:        WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder,
  ABSENCE_FINISHING_LINE_AWARENESS:        WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder,
  ABSENCE_POLISH_VS_FUNCTION:              WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder,
  ABSENCE_MVP_SCOPE_DISCIPLINE:            WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder,
  ABSENCE_IDEA_TO_SPEC_BRIDGE:             WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder,
  ABSENCE_DEMO_VS_PRODUCT:                 WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder,
  ABSENCE_USER_JOURNEY_CHECK:              WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder,
  ABSENCE_TECHNICAL_SPIKE_TREATMENT:       WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder,
  ABSENCE_DEPENDENCY_ADVENTURE:            WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder,
  ABSENCE_RESTART_IMPULSE_CHECK:           WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder,
  ABSENCE_CREATIVE_VS_CORE_RATIO:          WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder,
  ABSENCE_ERROR_UNDERSTANDING:             WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder,
  ABSENCE_REQUIREMENT_CLARITY:             WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder,
  ABSENCE_COPY_PASTE_AWARENESS:            WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder,
  ABSENCE_DEBUGGING_OBSERVATION:           WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder,
  ABSENCE_LEARNING_CONSOLIDATION:          WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder,
  ABSENCE_SIMPLE_SOLUTION_FIRST:           WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder,
  ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING: WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder,
  ABSENCE_ROLLBACK_AWARENESS:              WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder,
  ABSENCE_BUILD_VS_UNDERSTAND_RATIO:       WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder,

  // ── Class 8 — role cluster (founder / indie_hacker / pm) ───────────────
  ABSENCE_USER_VALUE_CHECK:                  WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_OUTCOME_DEFINITION:                WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_FEATURE_PRIORITIZATION:            WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_USER_PERSONA_CLARITY:              WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_COMPETITIVE_AWARENESS:             WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_MVP_BOUNDARY_DISCIPLINE:           WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_USER_ACQUISITION_CONSIDERATION:    WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_RETENTION_MECHANISM_CHECK:         WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT:       WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_HYPOTHESIS_BEFORE_BUILD:           WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE: WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_NORTH_STAR_ALIGNMENT:              WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_TIME_TO_VALUE_CHECK:               WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_SHIP_READINESS_DEFINITION:         WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_MANUAL_BEFORE_AUTOMATE:            WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_TECH_STACK_COMPLEXITY_CHECK:       WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_LAUNCH_STRATEGY_ABSENCE:           WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_EARLY_USER_FEEDBACK:               WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_SOLO_MAINTAINABILITY:              WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_DISTRIBUTION_THINKING:             WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_MONETIZATION_PATH_CLARITY:         WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY:       WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_SCOPE_VS_TIME_CHECK:               WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV:    WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK:       WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG:       WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_DEPENDENCY_MAPPING:                WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_DEFINITION_OF_DONE:                WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_CROSS_TEAM_IMPACT_CHECK:           WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_SUCCESS_METRIC_DEFINITION:         WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_PRIORITY_JUSTIFICATION:            WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_USER_STORY_COMPLETENESS:           WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_RISK_FLAG:                         WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT:    WHY_HELP_PER_CLASS.class8_role_cluster,
  ABSENCE_RETROSPECTIVE_HABIT:               WHY_HELP_PER_CLASS.class8_role_cluster,

  // ── Class 9 — academic / hardcore_pro ──────────────────────────────────
  ABSENCE_DECISION_RECORD_ABSENCE:     WHY_HELP_PER_CLASS.class9_academic_hardcore_pro,
  ABSENCE_OVER_ENGINEERING_CHECK:      WHY_HELP_PER_CLASS.class9_academic_hardcore_pro,
  ABSENCE_PAIR_REVIEW_ABSENCE:         WHY_HELP_PER_CLASS.class9_academic_hardcore_pro,
  ABSENCE_OBSERVABILITY_FIRST:         WHY_HELP_PER_CLASS.class9_academic_hardcore_pro,
  ABSENCE_FAILURE_MODE_ANALYSIS:       WHY_HELP_PER_CLASS.class9_academic_hardcore_pro,
  ABSENCE_CONTRACT_TESTING_GAP:        WHY_HELP_PER_CLASS.class9_academic_hardcore_pro,
  ABSENCE_CAPACITY_PLANNING_GAP:       WHY_HELP_PER_CLASS.class9_academic_hardcore_pro,
  ABSENCE_SECURITY_THREAT_MODELING:    WHY_HELP_PER_CLASS.class9_academic_hardcore_pro,
  ABSENCE_DATABASE_MIGRATION_SAFETY:   WHY_HELP_PER_CLASS.class9_academic_hardcore_pro,
  ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE: WHY_HELP_PER_CLASS.class9_academic_hardcore_pro,
  ABSENCE_OPERATIONAL_RUNBOOK_GAP:     WHY_HELP_PER_CLASS.class9_academic_hardcore_pro,
  ABSENCE_SLO_DEFINITION_GAP:          WHY_HELP_PER_CLASS.class9_academic_hardcore_pro,
};

/**
 * Lookup the WhyHelpEntry for a runtime signalType string. Returns `null`
 * when the signalType is unknown (caller skips the why-help region per
 * §11.2 graceful-fail invariant).
 */
export function getWhyHelpForSignalType(signalType: string): WhyHelpEntry | null {
  return WHY_HELP_BY_SIGNAL_TYPE[signalType] ?? null;
}
