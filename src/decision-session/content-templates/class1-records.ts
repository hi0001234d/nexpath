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
import {
  IDEA_TO_PRD_BEGINNER_OVERRIDE,
  PRD_TO_ARCHITECTURE_BEGINNER_OVERRIDE,
  ARCHITECTURE_TO_TASKS_BEGINNER_OVERRIDE,
  IMPLEMENTATION_TO_REVIEW_BEGINNER_OVERRIDE,
  REVIEW_TO_RELEASE_BEGINNER_OVERRIDE,
  RELEASE_TO_FEEDBACK_BEGINNER_OVERRIDE,
} from './class1-records-beginner.js';

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
  registerOverrides: { beginner: IDEA_TO_PRD_BEGINNER_OVERRIDE },
  source: 'shipped',
  schemaVersion: 1,
  slots: [],
  paramAxes: STAGE_TRANSITION_PARAM_AXES,
  levelForms: {
    1: form(
      "Name in one line what this PRD must capture — what 'done' looks like for the project.",
      "One sentence, not a document — just the outcome that means the project is done. Don't open the full PRD or any architecture yet.",
    ),
    2: form(
      'Name who this PRD is for and the one acceptance condition that means it is done.',
      "Two things only — the target user and one pass/fail condition that means it's done. Skip the rest of the PRD for now.",
    ),
    3: form(
      'Write a PRD for this project: define the problem, target user, core features with acceptance criteria, what is explicitly out of scope, and any technical constraints.',
      "Fill all five sections and treat each as required — don't move on to architecture or tasks until the PRD is written.",
    ),
    4: form(
      'Write the PRD, then enumerate the tricky cases (bad inputs, concurrent use, failures) and note the architecture approach you would take.',
      "After the PRD's five sections, add a tricky-cases list and a short note on the architecture direction you'd take — capture the direction before any code, not the full design yet.",
    ),
    5: form(
      'Write a PRD file: problem, target users, acceptance criteria, an edge-case table (given / when / then), and a short note recording why you chose this approach.',
      "Commit the PRD as an actual file, put the edge cases in given/when/then form, and record the why in one paragraph — so the file, not the chat, is the source of truth.",
    ),
  },
};

/** PRD → ARCHITECTURE — spec/design family, keyword "architecture". */
export const PRD_TO_ARCHITECTURE_RECORD: ContentTemplateRecord = {
  signalType: 'PRD_TO_ARCHITECTURE',
  registerOverrides: { beginner: PRD_TO_ARCHITECTURE_BEGINNER_OVERRIDE },
  source: 'shipped',
  schemaVersion: 1,
  slots: [],
  paramAxes: STAGE_TRANSITION_PARAM_AXES,
  levelForms: {
    1: form(
      'Name in one line the architecture approach you are leaning toward for this project.',
      "One line naming the architecture direction — just the approach you're leaning toward, not the component design, and no code yet.",
    ),
    2: form(
      'Sketch the architecture in a few lines: the main components and how data flows between them.',
      "Keep the architecture sketch to the main components and how data flows between them — no full design brief or API contracts yet.",
    ),
    3: form(
      'Design the system architecture for this project: list the main components, how they interact, the data model, API contracts (if any), and the tech stack with rationale for key choices.',
      "Cover the components, how they interact, the data model, API contracts, and the tech stack with a reason for each key choice — settle this architecture before any code gets written.",
    ),
    4: form(
      'Design the architecture, then enumerate the edge cases (wrong state, concurrency, failure) and the maintainability, performance, and security trade-offs of each key decision.',
      "On top of the architecture, add the edge cases (wrong state, concurrency, failure) and weigh each key decision on maintainability, performance, and security — trade-offs, not just the happy path.",
    ),
    5: form(
      'Write an architecture file: components, data model, API contracts, a table of the tricky cases (given / when / then), and a short note recording why you chose each key approach.',
      "Commit the architecture as a file with the components, data model, API contracts, a given/when/then table of tricky cases, and one paragraph on why each key choice — the file is the source of truth, not the chat.",
    ),
  },
};

/** ARCHITECTURE → TASKS — planning family, keyword "task". */
export const ARCHITECTURE_TO_TASKS_RECORD: ContentTemplateRecord = {
  signalType: 'ARCHITECTURE_TO_TASKS',
  registerOverrides: { beginner: ARCHITECTURE_TO_TASKS_BEGINNER_OVERRIDE },
  source: 'shipped',
  schemaVersion: 1,
  slots: [],
  paramAxes: STAGE_TRANSITION_PARAM_AXES,
  spine: ['small-supervised-loops'],
  levelForms: {
    1: form(
      'Name the single next task to start with before you begin coding.',
      "Just the one next task to start — don't plan the whole backlog or start coding yet.",
    ),
    2: form(
      'List the next 2-3 tasks in order, each with a one-line definition of done.',
      "Only the next 2-3 tasks, in order, each with a one-line definition of done — no full task breakdown yet.",
    ),
    3: form(
      'Break the implementation into an ordered task list: each task should be completable in one coding session, delivered as a vertical slice where possible, and have a clear definition of done.',
      "Size each task to one coding session, deliver a vertical slice where you can, and give each a clear definition of done.",
    ),
    4: form(
      'Break the work into atomic, independently-testable tasks with their order and dependencies, each with a clear definition of done.',
      "Make each task atomic and independently testable, and state the order and dependencies between them — not just a flat list.",
    ),
    5: form(
      'Write a task plan file: the atomic task breakdown with dependencies, a definition of done per task, and milestone checkpoints.',
      "Commit the task plan as a file with the atomic breakdown, dependencies, a per-task definition of done, and milestone checkpoints — so it persists across sessions, not just in this chat.",
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
      "Keep the review quick — just check it does what the task asked before the next one. Don't start a deep audit yet.",
    ),
    2: form(
      'Review the change on its main path and confirm this step is committed cleanly.',
      "Scope the review to the main path, then make sure this step is committed cleanly as its own checkpoint.",
    ),
    3: form(
      'Review what was just built for this task: does the implementation match the spec and acceptance criteria? List any discrepancies, missing logic, hallucinated code, or potential issues before I mark this done.',
      "Check the implementation against the spec and acceptance criteria, and call out discrepancies, missing logic, hallucinated code, or risks before I mark it done.",
    ),
    4: form(
      'Review what was just built like a junior-dev pull request, run the full test suite, and commit it as a labelled rollback checkpoint.',
      "Read for correctness like a real PR reviewer, not just style, and label the checkpoint clearly so I can find it to roll back — the full suite must actually pass, not just run.",
    ),
    5: form(
      'Review what was just built against a written test file, run the whole suite plus a check of dependencies and obvious security issues, and commit rollback checkpoints noting the change was AI-assisted.',
      "Anchor the review to a written test file, extend it to dependencies and obvious security issues, and note in the checkpoints that the change was AI-assisted.",
    ),
  },
};

/** IMPLEMENTATION → REVIEW — verification family, keyword "test". */
export const IMPLEMENTATION_TO_REVIEW_RECORD: ContentTemplateRecord = {
  signalType: 'IMPLEMENTATION_TO_REVIEW',
  registerOverrides: { beginner: IMPLEMENTATION_TO_REVIEW_BEGINNER_OVERRIDE },
  source: 'shipped',
  schemaVersion: 1,
  slots: [],
  paramAxes: STAGE_TRANSITION_PARAM_AXES,
  spine: ['review-cadence', 'commit-cadence'],
  levelForms: {
    1: form(
      'Smoke-test what was built this phase before moving on.',
      "Just a quick smoke test of this phase's main path before moving on — not the full suite yet.",
    ),
    2: form(
      'Run the tests for the new code in this phase and commit the phase as a checkpoint.',
      "Scope the tests to this phase's new code, then commit the phase as its own checkpoint.",
    ),
    3: form(
      'Run the full test suite for this phase: unit tests, integration tests, and any regression tests. Report results, failures, and what needs to be fixed.',
      "Cover unit, integration, and regression for this phase, and report results, failures, and what needs fixing.",
    ),
    4: form(
      'Run the full test suite for this phase, review the changes like a junior-dev pull request, and commit an atomic rollback checkpoint.',
      "On top of the full test run, read the diff like a real PR review and commit an atomic checkpoint I can roll back to.",
    ),
    5: form(
      'Run the full test suite backed by a written test file for this phase, add a check of dependencies and obvious security issues, and make the checks run before merging.',
      "Back the test run with a written test file, extend it to dependencies and obvious security issues, and wire the checks into the merge gate so they block a bad merge.",
    ),
  },
};

/** REVIEW → RELEASE — ops/ship family, keyword "release"; intrinsically sensitive (production release). */
export const REVIEW_TO_RELEASE_RECORD: ContentTemplateRecord = {
  signalType: 'REVIEW_TO_RELEASE',
  registerOverrides: { beginner: REVIEW_TO_RELEASE_BEGINNER_OVERRIDE },
  l2SafeguardLine: 'Ask me for go-ahead before you release to production.',
  source: 'shipped',
  schemaVersion: 1,
  slots: [],
  paramAxes: STAGE_TRANSITION_PARAM_AXES,
  l2SafeguardRequired: true,
  levelForms: {
    1: form(
      'Before you release, do a quick smoke check that the main flow still works.',
      "Keep the pre-release check to the main flow — just confirm it still works, don't kick off a full regression pass.",
    ),
    2: form(
      'Before release, run the critical-path tests and confirm no secrets were committed.',
      "Scope the pre-release check to the critical-path tests plus a sweep that no secrets were committed.",
    ),
    3: form(
      'Run all tests one final time before release: unit, integration, and regression. Confirm everything passes or tell me what is still failing.',
      "Cover unit, integration, and regression one final time, and tell me plainly whether everything passes or what's still failing.",
    ),
    4: form(
      'Before release, run the full suite, confirm secrets live in environment variables, and check it against a staging environment with error tracking on.',
      "Escalate the release check: run the whole suite, confirm secrets sit in environment variables not the code, and validate against staging with error tracking on.",
    ),
    5: form(
      'Write a release runbook: a final test pass, a scan for committed secrets, a staged rollout to a small slice of users first while you watch, monitoring and alerts, and a rollback path.',
      "Capture the release as a runbook — final tests, a committed-secrets scan, a staged rollout you watch, monitoring and alerts, and a written path to roll back if it goes wrong.",
    ),
  },
};

/** RELEASE → FEEDBACK — ops/monitoring family, keyword "monitoring"; intrinsically sensitive (production monitoring). */
export const RELEASE_TO_FEEDBACK_RECORD: ContentTemplateRecord = {
  signalType: 'RELEASE_TO_FEEDBACK',
  registerOverrides: { beginner: RELEASE_TO_FEEDBACK_BEGINNER_OVERRIDE },
  l2SafeguardLine: 'Ask me for go-ahead before changing production monitoring or alerting.',
  source: 'shipped',
  schemaVersion: 1,
  slots: [],
  paramAxes: STAGE_TRANSITION_PARAM_AXES,
  l2SafeguardRequired: true,
  levelForms: {
    1: form(
      'Confirm error tracking is on for what just shipped — the lightest monitoring check.',
      "Just confirm error tracking is actually on for what shipped — that one monitoring signal has to exist before anything more.",
    ),
    2: form(
      'Check that monitoring covers the main flow and that you would be alerted if it broke.',
      "Make sure the monitoring covers the main flow and would actually alert me if it broke — coverage plus a live alert.",
    ),
    3: form(
      'Verify the production monitoring setup for what was just built: confirm error tracking is active, alert thresholds are configured, and dashboards show live metrics — list what is collecting and what still needs to be set up.',
      "Confirm error tracking is active, alert thresholds are set, and dashboards show live metrics — and list what's collecting versus what still needs setup.",
    ),
    4: form(
      'Audit the monitoring across error tracking, alert thresholds, and the signals that tell you the feature works (analytics events, error rates, user reports) — list what is in place and what is missing.',
      "Widen the monitoring audit to the full signal set — error rates, analytics events, user reports — and separate what's in place from what's missing.",
    ),
    5: form(
      'Write a monitoring note: the signals that prove the feature works, alert thresholds, dashboards, and what to do when an alert fires.',
      "Capture the monitoring as a note — the signals that prove the feature works, alert thresholds, dashboards, and the response when an alert fires.",
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
