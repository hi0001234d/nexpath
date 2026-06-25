/**
 * Stage-transition content-template records (class 1) — the maturity-column
 * ladders the engine resolves at the shipped tier.
 *
 *  - column 3 is the existing shipped headline (kept verbatim, never edited);
 *  - columns 1/2 (lighter) and 4/5 (heavier) escalate the same practice outward
 *    from it, by family — planning, spec/design, verification, ops/ship — each
 *    column keeping the signal's own keyword;
 *  - the leaf is the headline cell `{ option, whyDesc }`; the lighter on-click
 *    strength variants are produced at runtime, not stored.
 *
 * Voice and the sensitive-action safeguard are applied: the only sensitive column
 * here is REVIEW_TO_RELEASE col-5 (production rollout), which carries the
 * confirm-seek. Register vocabulary is adapted at runtime.
 *
 * Spine (an authoring thread that intensifies across the columns, stored in the
 * optional `spine` field where a family has one):
 *  - ARCHITECTURE_TO_TASKS (planning): session-sized work intensifying from
 *    "one next task" to "atomic tasks + milestones";
 *  - TASK_REVIEW + IMPLEMENTATION_TO_REVIEW (verification): the review + commit
 *    cadence intensifying from a quick look to a PR-grade review + rollback commits;
 *  - the spec/design and ops/ship signals carry no spine — each column is its own
 *    stage practice.
 */

import type { ContentTemplateRecord, LevelForm, ParamAxisTag } from '../content-template-schema.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}

/**
 * The param axes a stage-transition why-desc grounds, each tagged with how its
 * values are drawn:
 *  - workflow pattern → a closed but extensible set → `extensible`;
 *  - the three work-style traits → ordered scales → `closed-ordinal`;
 *  - the project framework identity → an open set → `open`.
 * The categories are common across stage transitions (per-signal relevance is the
 * runtime select/rank/cap, not a per-record axis difference).
 */
const STAGE_TRANSITION_PARAM_AXES: Readonly<Record<string, ParamAxisTag>> = {
  workflow_pattern: 'extensible',
  decision_making_rhythm: 'closed-ordinal',
  explanation_learning_depth: 'closed-ordinal',
  abstraction_level_orientation: 'closed-ordinal',
  project_framework: 'open',
};

/** IDEA → PRD — spec/design family, keyword "PRD". */
export const IDEA_TO_PRD_RECORD: ContentTemplateRecord = {
  signalType: 'IDEA_TO_PRD',
  source: 'shipped',
  schemaVersion: 1,
  slots: [],
  paramAxes: STAGE_TRANSITION_PARAM_AXES,
  levelForms: {
    1: form(
      "Name in one line what this PRD must capture — what 'done' looks like for the project.",
      'The idea is still open-ended; one line of intended scope is the lightest first pin toward a PRD.',
    ),
    2: form(
      'Name who this PRD is for and the one acceptance condition that means it is done.',
      'A lighter pin than the full PRD: the audience plus the single done-condition.',
    ),
    3: form(
      'Write a PRD for this project: define the problem, target user, core features with acceptance criteria, what is explicitly out of scope, and any technical constraints.',
      'The idea has been in open-ended exploration; pinning it down is the next step before architecture decisions get made ad-hoc.',
    ),
    4: form(
      'Write the PRD, then enumerate the tricky cases (bad inputs, concurrent use, failures) and note the architecture approach you would take.',
      'Beyond the standard PRD: the edge cases and the intended architecture direction, captured before code.',
    ),
    5: form(
      'Write a PRD file: problem, target users, acceptance criteria, an edge-case table (given / when / then), and a short note recording why you chose this approach.',
      'The PRD as a committed file with an edge-case table and a recorded rationale — the durable spec artifact.',
    ),
  },
};

/** PRD → ARCHITECTURE — spec/design family, keyword "architecture". */
export const PRD_TO_ARCHITECTURE_RECORD: ContentTemplateRecord = {
  signalType: 'PRD_TO_ARCHITECTURE',
  source: 'shipped',
  schemaVersion: 1,
  slots: [],
  paramAxes: STAGE_TRANSITION_PARAM_AXES,
  levelForms: {
    1: form(
      'Name in one line the architecture approach you are leaning toward for this project.',
      'The spec is set; one line naming the intended architecture is the lightest pin before design.',
    ),
    2: form(
      'Sketch the architecture in a few lines: the main components and how data flows between them.',
      'A light architecture sketch: components plus data flow, short of a full design brief.',
    ),
    3: form(
      'Design the system architecture for this project: list the main components, how they interact, the data model, API contracts (if any), and the tech stack with rationale for key choices.',
      'The spec is in place; this is the moment to translate it into architecture before any code gets written.',
    ),
    4: form(
      'Design the architecture, then enumerate the edge cases (wrong state, concurrency, failure) and the maintainability, performance, and security trade-offs of each key decision.',
      'Beyond the standard design: the edge cases plus the impact-axis trade-offs of the architecture decisions.',
    ),
    5: form(
      'Write an architecture file: components, data model, API contracts, a table of the tricky cases (given / when / then), and a short note recording why you chose each key approach.',
      'The architecture as a committed file with a tricky-case table and recorded decision rationale.',
    ),
  },
};

/** ARCHITECTURE → TASKS — planning family, keyword "task". */
export const ARCHITECTURE_TO_TASKS_RECORD: ContentTemplateRecord = {
  signalType: 'ARCHITECTURE_TO_TASKS',
  source: 'shipped',
  schemaVersion: 1,
  slots: [],
  paramAxes: STAGE_TRANSITION_PARAM_AXES,
  spine: ['small-supervised-loops'],
  levelForms: {
    1: form(
      'Name the single next task to start with before you begin coding.',
      'Architecture is laid out; naming the one next task is the lightest step before code.',
    ),
    2: form(
      'List the next 2-3 tasks in order, each with a one-line definition of done.',
      'A light task plan: the next few ordered steps with a done-line each.',
    ),
    3: form(
      'Break the implementation into an ordered task list: each task should be completable in one coding session, delivered as a vertical slice where possible, and have a clear definition of done.',
      'Architecture is laid out; translate it into ordered tasks before implementation begins.',
    ),
    4: form(
      'Break the work into atomic, independently-testable tasks with their order and dependencies, each with a clear definition of done.',
      'Beyond the standard list: atomic tasks with explicit dependencies and ordering.',
    ),
    5: form(
      'Write a task plan file: the atomic task breakdown with dependencies, a definition of done per task, and milestone checkpoints.',
      'The task plan as a committed file with dependencies, per-task done-conditions, and milestones — durable cross-session context.',
    ),
  },
};

/** TASK_REVIEW — verification family, keyword "review". */
export const TASK_REVIEW_RECORD: ContentTemplateRecord = {
  signalType: 'TASK_REVIEW',
  source: 'shipped',
  schemaVersion: 1,
  slots: [],
  paramAxes: STAGE_TRANSITION_PARAM_AXES,
  spine: ['review-cadence', 'commit-cadence'],
  levelForms: {
    1: form(
      'Quickly review what was just built — does it do what the task asked?',
      'A task just finished; a quick review is the lightest catch before the next one.',
    ),
    2: form(
      'Review the change on its main path and confirm this step is committed cleanly.',
      'A light review: the main path plus a clean checkpoint commit.',
    ),
    3: form(
      'Review what was just built for this task: does the implementation match the spec and acceptance criteria? List any discrepancies, missing logic, hallucinated code, or potential issues before I mark this done.',
      'A task just finished; this is the gap where a review catches misses before the next task starts.',
    ),
    4: form(
      'Review what was just built like a junior-dev pull request, run the full test suite, and commit it as a labelled rollback checkpoint.',
      'Beyond the standard review: a PR-grade pass, the full suite, and a rollback-point commit.',
    ),
    5: form(
      'Review what was just built against a written test file, run the whole suite plus a check of dependencies and obvious security issues, and commit rollback checkpoints noting the change was AI-assisted.',
      'The heaviest review: backed by a durable test file, a dependency and security pass, and attributed rollback commits.',
    ),
  },
};

/** IMPLEMENTATION → REVIEW — verification family, keyword "test". */
export const IMPLEMENTATION_TO_REVIEW_RECORD: ContentTemplateRecord = {
  signalType: 'IMPLEMENTATION_TO_REVIEW',
  source: 'shipped',
  schemaVersion: 1,
  slots: [],
  paramAxes: STAGE_TRANSITION_PARAM_AXES,
  spine: ['review-cadence', 'commit-cadence'],
  levelForms: {
    1: form(
      'Smoke-test what was built this phase before moving on.',
      "The phase's implementation is done; a quick smoke test is the lightest gate before the next phase.",
    ),
    2: form(
      'Run the tests for the new code in this phase and commit the phase as a checkpoint.',
      'A light phase gate: the new-code tests plus a checkpoint commit.',
    ),
    3: form(
      'Run the full test suite for this phase: unit tests, integration tests, and any regression tests. Report results, failures, and what needs to be fixed.',
      'Implementation for this phase is complete; this is the gate where review and testing happen before the next phase starts.',
    ),
    4: form(
      'Run the full test suite for this phase, review the changes like a junior-dev pull request, and commit an atomic rollback checkpoint.',
      'Beyond the standard run: a PR-grade review alongside the full test suite and a rollback-point commit.',
    ),
    5: form(
      'Run the full test suite backed by a written test file for this phase, add a check of dependencies and obvious security issues, and make the checks run before merging.',
      'The heaviest phase gate: a durable test file, a dependency and security pass, and checks gating the merge.',
    ),
  },
};

/** REVIEW → RELEASE — ops/ship family, keyword "release"; intrinsically sensitive (production release). */
export const REVIEW_TO_RELEASE_RECORD: ContentTemplateRecord = {
  signalType: 'REVIEW_TO_RELEASE',
  l2SafeguardLine: 'Confirm with me before releasing to production.',
  source: 'shipped',
  schemaVersion: 1,
  slots: [],
  paramAxes: STAGE_TRANSITION_PARAM_AXES,
  l2SafeguardRequired: true,
  levelForms: {
    1: form(
      'Before you release, do a quick smoke check that the main flow still works.',
      'Review is wrapping up; a quick smoke check is the lightest gate before release.',
    ),
    2: form(
      'Before release, run the critical-path tests and confirm no secrets were committed.',
      'A light release check: the critical path plus a secrets sweep.',
    ),
    3: form(
      'Run all tests one final time before release: unit, integration, and regression. Confirm everything passes or tell me what is still failing.',
      'Review is complete; this is the final gate before shipping to production.',
    ),
    4: form(
      'Before release, run the full suite, confirm secrets live in environment variables, and check it against a staging environment with error tracking on.',
      'Beyond the final test pass: a staging check with secrets handled and error tracking before release.',
    ),
    5: form(
      'Write a release runbook: a final test pass, a scan for committed secrets, a staged rollout to a small slice of users first while you watch, monitoring and alerts, and a rollback path.',
      'The heaviest release gate: a runbook covering staged rollout, monitoring, and rollback.',
    ),
  },
};

/** RELEASE → FEEDBACK — ops/monitoring family, keyword "monitoring"; intrinsically sensitive (production monitoring). */
export const RELEASE_TO_FEEDBACK_RECORD: ContentTemplateRecord = {
  signalType: 'RELEASE_TO_FEEDBACK',
  l2SafeguardLine: 'Ask me for go-ahead before changing production monitoring or alerting.',
  source: 'shipped',
  schemaVersion: 1,
  slots: [],
  paramAxes: STAGE_TRANSITION_PARAM_AXES,
  l2SafeguardRequired: true,
  levelForms: {
    1: form(
      'Confirm error tracking is on for what just shipped — the lightest monitoring check.',
      'The feature just shipped; confirming error tracking is the lightest monitoring step.',
    ),
    2: form(
      'Check that monitoring covers the main flow and that you would be alerted if it broke.',
      'A light monitoring check: the main flow plus a break-alert.',
    ),
    3: form(
      'Verify the production monitoring setup for what was just built: confirm error tracking is active, alert thresholds are configured, and dashboards show live metrics — list what is collecting and what still needs to be set up.',
      'The feature just shipped to production; close the feedback loop before attention drifts.',
    ),
    4: form(
      'Audit the monitoring across error tracking, alert thresholds, and the signals that tell you the feature works (analytics events, error rates, user reports) — list what is in place and what is missing.',
      'Beyond the standard monitoring check: the full signal set that confirms the feature is actually working.',
    ),
    5: form(
      'Write a monitoring note: the signals that prove the feature works, alert thresholds, dashboards, and what to do when an alert fires.',
      'The heaviest feedback gate: a durable monitoring note of signals, alerts, and the response when something fires.',
    ),
  },
};

/** All class-1 stage-transition records, registered into the shipped-preset set. */
export const CLASS1_RECORDS: readonly ContentTemplateRecord[] = [
  IDEA_TO_PRD_RECORD,
  PRD_TO_ARCHITECTURE_RECORD,
  ARCHITECTURE_TO_TASKS_RECORD,
  TASK_REVIEW_RECORD,
  IMPLEMENTATION_TO_REVIEW_RECORD,
  REVIEW_TO_RELEASE_RECORD,
  RELEASE_TO_FEEDBACK_RECORD,
];
