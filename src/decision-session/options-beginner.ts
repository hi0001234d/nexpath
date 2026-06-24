import type { DecisionContent } from './options.js';

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
  ARCHITECTURE_TO_TASKS_BEGINNER,
  IDEA_TO_PRD_BEGINNER,
  IMPLEMENTATION_TO_REVIEW_BEGINNER,
  PRD_TO_ARCHITECTURE_BEGINNER,
  RELEASE_TO_FEEDBACK_BEGINNER,
  REVIEW_TO_RELEASE_BEGINNER,
} from './content-templates/class1-stage-transition.js';
import {
  ABSENCE_ACCESSIBILITY_BEGINNER,
  ABSENCE_CORRECTION_SEEKING_BEGINNER,
  ABSENCE_DATA_VALIDATION_BEGINNER,
  ABSENCE_DOCUMENTATION_BEFORE_ASK_BEGINNER,
  ABSENCE_DOCUMENTATION_BEGINNER,
  ABSENCE_ERROR_HANDLING_BEGINNER,
  ABSENCE_OUTPUT_VERIFICATION_BEGINNER,
  ABSENCE_PROBLEM_CORRECTION_BEGINNER,
  ABSENCE_REFACTORING_BEGINNER,
  ABSENCE_REGRESSION_CHECK_BEGINNER,
  ABSENCE_SECURITY_CHECK_BEGINNER,
  ABSENCE_TEST_CREATION_BEGINNER,
  BEHAVIOUR_TESTING_BEGINNER,
} from './content-templates/class2-verification-quality.js';
import {
  ABSENCE_ALTERNATIVES_BEGINNER,
  ABSENCE_API_DESIGN_REVIEW_BEGINNER,
  ABSENCE_ARCH_CONFLICT_BEGINNER,
  ABSENCE_CROSS_CONFIRMING_BEGINNER,
  ABSENCE_PROMPT_CONTEXT_BEGINNER,
  ABSENCE_SPEC_ACCEPTANCE_BEGINNER,
  ABSENCE_SPEC_CROSS_CONFIRM_BEGINNER,
  ABSENCE_SPEC_REVISION_BEGINNER,
} from './content-templates/class3-spec-architecture.js';
import {
  ABSENCE_CI_PIPELINE_BEGINNER,
  ABSENCE_DEPENDENCY_MGMT_BEGINNER,
  ABSENCE_DEPLOYMENT_PLANNING_BEGINNER,
  ABSENCE_ENV_AND_SECRETS_BEGINNER,
  ABSENCE_OBSERVABILITY_BEGINNER,
  ABSENCE_RATE_LIMITING_BEGINNER,
  ABSENCE_ROLLBACK_PLANNING_BEGINNER,
} from './content-templates/class4-release-observability-infra.js';
import {
  ABSENCE_COMPREHENSION_BEGINNER,
  ABSENCE_CONTEXT_LOSS_BEGINNER,
  ABSENCE_DECISION_FATIGUE_PATTERN_BEGINNER,
  ABSENCE_FOCUS_DRIFT_DETECTION_BEGINNER,
  ABSENCE_NO_PUSHBACK_BEGINNER,
  ABSENCE_PROGRESS_CONSOLIDATION_GAP_BEGINNER,
  ABSENCE_SESSION_LENGTH_CHECKPOINT_BEGINNER,
  ABSENCE_WORK_RHYTHM_CHECK_BEGINNER,
} from './content-templates/class5-session-quality.js';
import {
  ABSENCE_FEATURE_SCOPE_BEGINNER,
  ABSENCE_IDEA_CONSTRAINT_CHECK_BEGINNER,
  ABSENCE_IDEA_SCOPING_BEGINNER,
  ABSENCE_IDEA_USER_DEFINITION_BEGINNER,
  ABSENCE_IMPLEMENTATION_CHECKPOINT_BEGINNER,
  ABSENCE_INCREMENTAL_BUILD_BEGINNER,
  ABSENCE_ITERATION_PLANNING_BEGINNER,
  ABSENCE_PHASE_TRANSITION_BEGINNER,
  ABSENCE_SCOPE_CREEP_BEGINNER,
  ABSENCE_SPEC_BEFORE_CODE_BEGINNER,
  ABSENCE_TASK_DEFINITION_OF_DONE_BEGINNER,
  ABSENCE_TASK_ORDERING_BEGINNER,
  ABSENCE_TASK_SIZING_BEGINNER,
  ABSENCE_USER_FEEDBACK_REVIEW_BEGINNER,
} from './content-templates/class6-planning-idea-task.js';
import {
  ABSENCE_BUILD_VS_UNDERSTAND_RATIO_BEGINNER,
  ABSENCE_COPY_PASTE_AWARENESS_BEGINNER,
  ABSENCE_DEBUGGING_OBSERVATION_BEGINNER,
  ABSENCE_ERROR_UNDERSTANDING_BEGINNER,
  ABSENCE_LEARNING_CONSOLIDATION_BEGINNER,
  ABSENCE_REQUIREMENT_CLARITY_BEGINNER,
  ABSENCE_ROLLBACK_AWARENESS_BEGINNER,
  ABSENCE_SIMPLE_SOLUTION_FIRST_BEGINNER,
  ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER,
} from './content-templates/class7-cool-geek-vibe-coder.js';

import type { Stage } from '../classifier/types.js';
import { WHY_HELP_BY_SIGNAL_TYPE } from './why-help-by-signal-type.js';

export const ABSENCE_CONTENT_BEGINNER: Partial<Record<string, DecisionContent>> = {
  test_creation:         ABSENCE_TEST_CREATION_BEGINNER,
  regression_check:      ABSENCE_REGRESSION_CHECK_BEGINNER,
  spec_acceptance_check: ABSENCE_SPEC_ACCEPTANCE_BEGINNER,
  cross_confirming:      ABSENCE_CROSS_CONFIRMING_BEGINNER,
  behaviour_testing:     BEHAVIOUR_TESTING_BEGINNER,
  security_check:        ABSENCE_SECURITY_CHECK_BEGINNER,
  error_handling:        ABSENCE_ERROR_HANDLING_BEGINNER,
  documentation:         ABSENCE_DOCUMENTATION_BEGINNER,
  observability:         ABSENCE_OBSERVABILITY_BEGINNER,
  comprehension:         ABSENCE_COMPREHENSION_BEGINNER,
  refactoring_review:      ABSENCE_REFACTORING_BEGINNER,
  no_agent_pushback:       ABSENCE_NO_PUSHBACK_BEGINNER,
  correction_seeking:      ABSENCE_CORRECTION_SEEKING_BEGINNER,
  problem_correction:      ABSENCE_PROBLEM_CORRECTION_BEGINNER,
  alternatives_seeking:    ABSENCE_ALTERNATIVES_BEGINNER,
  architecture_conflict:   ABSENCE_ARCH_CONFLICT_BEGINNER,
  prompt_context_richness: ABSENCE_PROMPT_CONTEXT_BEGINNER,
  rollback_planning:       ABSENCE_ROLLBACK_PLANNING_BEGINNER,
  deployment_planning:     ABSENCE_DEPLOYMENT_PLANNING_BEGINNER,
  dependency_management:   ABSENCE_DEPENDENCY_MGMT_BEGINNER,
  phase_transition:        ABSENCE_PHASE_TRANSITION_BEGINNER,
  spec_cross_confirm:      ABSENCE_SPEC_CROSS_CONFIRM_BEGINNER,
  spec_revision:           ABSENCE_SPEC_REVISION_BEGINNER,
  idea_scoping:            ABSENCE_IDEA_SCOPING_BEGINNER,
  idea_constraint_check:   ABSENCE_IDEA_CONSTRAINT_CHECK_BEGINNER,
  idea_user_definition:    ABSENCE_IDEA_USER_DEFINITION_BEGINNER,
  task_ordering:           ABSENCE_TASK_ORDERING_BEGINNER,
  task_sizing:             ABSENCE_TASK_SIZING_BEGINNER,
  task_definition_of_done: ABSENCE_TASK_DEFINITION_OF_DONE_BEGINNER,
  user_feedback_review:    ABSENCE_USER_FEEDBACK_REVIEW_BEGINNER,
  iteration_planning:      ABSENCE_ITERATION_PLANNING_BEGINNER,
  scope_creep:             ABSENCE_SCOPE_CREEP_BEGINNER,
  context_loss:            ABSENCE_CONTEXT_LOSS_BEGINNER,
  api_design_review:       ABSENCE_API_DESIGN_REVIEW_BEGINNER,
  accessibility:           ABSENCE_ACCESSIBILITY_BEGINNER,
  environment_and_secrets: ABSENCE_ENV_AND_SECRETS_BEGINNER,
  data_validation:         ABSENCE_DATA_VALIDATION_BEGINNER,
  ci_pipeline:             ABSENCE_CI_PIPELINE_BEGINNER,
  rate_limiting:           ABSENCE_RATE_LIMITING_BEGINNER,
  feature_scope_before_build:    ABSENCE_FEATURE_SCOPE_BEGINNER,
  implementation_checkpoint:     ABSENCE_IMPLEMENTATION_CHECKPOINT_BEGINNER,
  spec_before_code:              ABSENCE_SPEC_BEFORE_CODE_BEGINNER,
  incremental_build:              ABSENCE_INCREMENTAL_BUILD_BEGINNER,
  error_understanding:            ABSENCE_ERROR_UNDERSTANDING_BEGINNER,
  documentation_before_ask:       ABSENCE_DOCUMENTATION_BEFORE_ASK_BEGINNER,
  output_verification:            ABSENCE_OUTPUT_VERIFICATION_BEGINNER,
  requirement_clarity_before_ask: ABSENCE_REQUIREMENT_CLARITY_BEGINNER,
  copy_paste_awareness:           ABSENCE_COPY_PASTE_AWARENESS_BEGINNER,
  debugging_observation_gap:      ABSENCE_DEBUGGING_OBSERVATION_BEGINNER,
  learning_consolidation:         ABSENCE_LEARNING_CONSOLIDATION_BEGINNER,
  simple_solution_first:          ABSENCE_SIMPLE_SOLUTION_FIRST_BEGINNER,
  single_responsibility_prompting: ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER,
  rollback_awareness:             ABSENCE_ROLLBACK_AWARENESS_BEGINNER,
  build_vs_understand_ratio:      ABSENCE_BUILD_VS_UNDERSTAND_RATIO_BEGINNER,
  decision_fatigue_pattern:       ABSENCE_DECISION_FATIGUE_PATTERN_BEGINNER,
  work_rhythm_check:              ABSENCE_WORK_RHYTHM_CHECK_BEGINNER,
  focus_drift_detection:          ABSENCE_FOCUS_DRIFT_DETECTION_BEGINNER,
  session_length_checkpoint:      ABSENCE_SESSION_LENGTH_CHECKPOINT_BEGINNER,
  progress_consolidation_gap:     ABSENCE_PROGRESS_CONSOLIDATION_GAP_BEGINNER,
};

export const TRANSITION_CONTENT_BEGINNER: Partial<Record<Stage, DecisionContent>> = {
  prd:            IDEA_TO_PRD_BEGINNER,
  architecture:   PRD_TO_ARCHITECTURE_BEGINNER,
  task_breakdown: ARCHITECTURE_TO_TASKS_BEGINNER,
  review_testing: IMPLEMENTATION_TO_REVIEW_BEGINNER,
  release:        REVIEW_TO_RELEASE_BEGINNER,
  feedback_loop:  RELEASE_TO_FEEDBACK_BEGINNER,
};
