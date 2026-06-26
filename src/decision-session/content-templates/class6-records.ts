/**
 * Planning / idea / task content-template records (class 6). One record per signal;
 * column 3 is the existing shipped headline (kept verbatim), and columns 1/2/4/5
 * escalate the same practice from a quick step up to its heaviest form.
 *
 * These are planning signals — scoping an idea, defining users and constraints,
 * ordering and sizing tasks, definition of done, feedback review, iteration
 * planning, scope control, spec-before-code. Twelve of them produce a written
 * record at the heaviest column (a scope note, a task plan, a spec doc, etc.). Two
 * are verification cadences — implementation checkpoint and incremental build — whose
 * heaviest column stays a behaviour (verify each step before the next), not a file.
 * None concerns a sensitive action, so none carries a confirm-seek; the escalation
 * is the planning practice deepening, so none threads a separate spine. All fourteen
 * are formal-headline signals.
 */

import type { ContentTemplateRecord, LevelForm, ParamAxisTag } from '../content-template-schema.js';
import {
  PHASE_TRANSITION_BEGINNER_OVERRIDE, IDEA_SCOPING_BEGINNER_OVERRIDE, IDEA_CONSTRAINT_CHECK_BEGINNER_OVERRIDE,
  IDEA_USER_DEFINITION_BEGINNER_OVERRIDE, TASK_ORDERING_BEGINNER_OVERRIDE, TASK_SIZING_BEGINNER_OVERRIDE,
  TASK_DEFINITION_OF_DONE_BEGINNER_OVERRIDE, USER_FEEDBACK_REVIEW_BEGINNER_OVERRIDE,
  ITERATION_PLANNING_BEGINNER_OVERRIDE, SCOPE_CREEP_BEGINNER_OVERRIDE, FEATURE_SCOPE_BEGINNER_OVERRIDE,
  IMPLEMENTATION_CHECKPOINT_BEGINNER_OVERRIDE, SPEC_BEFORE_CODE_BEGINNER_OVERRIDE,
  INCREMENTAL_BUILD_BEGINNER_OVERRIDE,
} from './class6-records-beginner.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}

/** The param axes a planning why-desc grounds (same generic sources as the other classes). */
export const PLANNING_PARAM_AXES: Readonly<Record<string, ParamAxisTag>> = {
  workflow_pattern: 'extensible',
  decision_making_rhythm: 'closed-ordinal',
  explanation_learning_depth: 'closed-ordinal',
  abstraction_level_orientation: 'closed-ordinal',
  project_framework: 'open',
};

/** ABSENCE_PHASE_TRANSITION — phase exit readiness, keyword "transition". Produces a written note. */
export const ABSENCE_PHASE_TRANSITION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_PHASE_TRANSITION', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: PHASE_TRANSITION_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Name the one thing that must be true before this project can move to the next phase — the key transition criterion.", "The lightest transition check: the one must-be-true exit criterion named."),
    2: form("List the main exit criteria for this phase and check which are met before the transition.", "A light transition pass: the main exit criteria listed and checked."),
    3: form("Assess transition readiness for this project: define what must be complete before moving to the next phase, confirm which of those criteria are currently met, and identify what is blocking the transition. If no criteria are defined, define them now.", "Exit criteria for the current phase haven't been assessed — the phase has been active long enough to risk drift without a clean handoff."),
    4: form("Audit transition readiness end-to-end: every exit criterion for this phase, which are met, and what is blocking the transition — resolve or accept each blocker.", "Beyond the main criteria: full transition readiness audited with blockers resolved."),
    5: form("Write a transition-readiness note: the exit criteria, their status, the open blockers, and the go/no-go call — the record the next phase starts from.", "A durable transition-readiness note of criteria, blockers, and the go/no-go."),
  },
};

/** ABSENCE_IDEA_SCOPING — define the project scope, keyword "scope". Produces a written note. */
export const ABSENCE_IDEA_SCOPING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_IDEA_SCOPING', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: IDEA_SCOPING_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("State the core problem this project solves in one line — the seed of its scope.", "The lightest scope step: the core problem named."),
    2: form("Sketch the scope: the core problem, the main capabilities, and a rough first version.", "A light scope pass: the problem, capabilities, and a rough first version."),
    3: form("Define the scope of this project precisely: what is the core problem it solves, what are the primary capabilities it must deliver, and what does a complete first version look like?", "The scope of this project hasn't been defined — what it is, what problem it solves, and what the first version includes are still implicit."),
    4: form("Define the scope thoroughly: the core problem, every primary capability, what the first version includes, and what it deliberately leaves out.", "Beyond a sketch: the full scope including the first version's boundaries."),
    5: form("Write a scope note: the core problem, the primary capabilities, what a complete first version looks like, and the explicit boundaries — the anchor the build works against.", "A durable scope note of the problem, capabilities, and first-version boundaries."),
  },
};

/** ABSENCE_IDEA_CONSTRAINT_CHECK — non-goals and constraints, keyword "constraint". Produces a written note. */
export const ABSENCE_IDEA_CONSTRAINT_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_IDEA_CONSTRAINT_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: IDEA_CONSTRAINT_CHECK_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Name the one thing this project will explicitly NOT do — its clearest constraint.", "The lightest constraint step: one explicit non-goal named."),
    2: form("List the main constraints and non-goals: what is out of scope and what will not be built.", "A light constraint pass: the main non-goals and limits listed."),
    3: form("Define the constraints and non-goals for this project: what is explicitly out of scope for the first version, what functionality will not be built, and what technical constraints limit the solution space?", "Non-goals and constraints for this project haven't been stated — without explicit boundaries, scope creeps during implementation."),
    4: form("Stress the constraints: for each non-goal and technical constraint, note what would force a revisit and check it against the defined scope for conflicts — so the boundaries hold under pressure.", "Beyond listing non-goals: each constraint's revisit-trigger and scope-conflict checked."),
    5: form("Write a constraints note: the explicit non-goals, the out-of-scope items, the technical constraints, and for each what would force a revisit — the boundary the build holds to.", "A durable constraints note of non-goals, limits, and their revisit-triggers."),
  },
};

/** ABSENCE_IDEA_USER_DEFINITION — define the target user, keyword "user". Produces a written note. */
export const ABSENCE_IDEA_USER_DEFINITION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_IDEA_USER_DEFINITION', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: IDEA_USER_DEFINITION_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Name the primary user this project is for in one line.", "The lightest user step: the primary user named."),
    2: form("Sketch the target user: who they are, their context, and the problem this solves for them.", "A light user pass: the primary user and their core problem."),
    3: form("Define the target user for this project precisely: who is the primary user, what is their context and skill level, what problem do they have that this project solves, and what does success look like from their perspective?", "The target user for this project hasn't been defined — without a primary-user anchor, design decisions drift on assumptions."),
    4: form("Pressure-test the target-user definition: name one secondary or deliberately-excluded user, surface the riskiest assumption about the primary user, and decide how to validate it — so the user anchor is tested, not just asserted.", "Beyond defining the user: the definition pressure-tested with a riskiest assumption to validate."),
    5: form("Write a target-user note: the primary user with context and skill, the problem and success from their view, the secondary or excluded users, and the assumptions to validate — the tested anchor design decisions hold to.", "A durable target-user note: the tested primary user, edge users, and assumptions to validate."),
  },
};

/** ABSENCE_TASK_ORDERING — order tasks by dependency, keyword "order". Produces a written plan. */
export const ABSENCE_TASK_ORDERING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_TASK_ORDERING', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: TASK_ORDERING_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Identify the one task that blocks the most others and order it first.", "The lightest ordering step: the top blocking task placed first."),
    2: form("Order the main tasks by dependency: what blocks what, and a rough sequence.", "A light ordering pass: the main dependencies and a rough sequence."),
    3: form("Order the tasks for this project by dependency and priority: identify which tasks block others, which can be done in parallel, and establish the sequence that minimises rework and delivers the earliest working state.", "The task list hasn't been ordered by dependency and priority — work risks proceeding on tasks that block later progress or invite rework."),
    4: form("Beyond the dependency order, identify the critical path and the first end-to-end slice that proves the design, and order the tasks so that proving slice lands earliest.", "Beyond ordering by dependency: the critical path and earliest design-proving slice ordered first."),
    5: form("Write the ordered task plan: the dependency order, the critical path, what can run in parallel, and the earliest end-to-end slice that proves the design — the plan the build follows.", "A durable ordered task plan with the critical path and earliest proving slice."),
  },
};

/** ABSENCE_TASK_SIZING — single-session task sizing, keyword "siz". Produces a written plan. */
export const ABSENCE_TASK_SIZING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_TASK_SIZING', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: TASK_SIZING_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Check the largest task for sizing: can it be finished in one focused session, or must it be split?", "The lightest sizing check: the largest task split if it can't fit one session."),
    2: form("Review the main tasks for sizing: flag any that can't be completed and verified in a single session.", "A light sizing pass: the oversized main tasks flagged."),
    3: form("Review the task list for this project and validate sizing: each task should be completable in a single focused session. Identify any tasks that span multiple concerns, require too many unknowns to resolve in one sitting, or are so large that progress cannot be verified at the end of a session.", "Tasks haven't been sized to single-session scope — oversized tasks cannot be verified done in one focused sitting."),
    4: form("Validate sizing across the task list: flag every task that spans multiple concerns, carries too many unknowns, or is too large to verify at a session's end — and split each.", "Beyond the main tasks: every oversized task identified and split."),
    5: form("Write the re-sized task plan: each task scoped to a single verifiable session, with oversized ones split into checkable units — the plan the build executes.", "A durable plan of single-session-sized tasks, oversized ones split."),
  },
};

/** ABSENCE_TASK_DEFINITION_OF_DONE — per-task completion criteria, keyword "complet". Produces a written note. */
export const ABSENCE_TASK_DEFINITION_OF_DONE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_TASK_DEFINITION_OF_DONE', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: TASK_DEFINITION_OF_DONE_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("State the completion criterion for the current task: what must be true for it to be complete?", "The lightest done-check: the current task's completion criterion stated."),
    2: form("Define completion criteria for the main tasks: what output must exist and be verified for each to be complete.", "A light pass: the main tasks' completion criteria defined."),
    3: form("Define the completion criteria for each task in this project: for every task, state what must be true for the task to be considered complete — what output exists, what has been verified, and what has not been left in an ambiguous or partially done state.", "Definition of Done hasn't been written per task — without explicit completion criteria, 'done' is ambiguous and verification cannot anchor."),
    4: form("Make each task's completion criteria observable: for every task, state how completion is confirmed without re-reading the code — a check, output, or test anyone could verify.", "Beyond writing criteria: each task's completion made independently observable."),
    5: form("Write a definition-of-done note: per task the completion criteria stated as observable checks — output exists, verified, nothing left partial — so completion is unambiguous and anyone can confirm it.", "A durable note of per-task observable completion criteria."),
  },
};

/** ABSENCE_USER_FEEDBACK_REVIEW — systematic feedback review, keyword "feedback". Produces a written note. */
export const ABSENCE_USER_FEEDBACK_REVIEW_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_USER_FEEDBACK_REVIEW', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: USER_FEEDBACK_REVIEW_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Pick the one piece of feedback that recurs most and note the pattern it points to.", "The lightest feedback step: the most-recurring feedback item and its pattern."),
    2: form("Review the main feedback: group it by theme and surface the top recurring complaints.", "A light feedback pass: the main themes and top recurring complaints."),
    3: form("Review the feedback received for this project systematically: collect all available feedback, categorize it by theme or feature area, and identify the recurring complaints, requests, and points of confusion that appear across multiple users.", "User feedback hasn't been reviewed systematically — recurring complaints, blockers, and pattern signals risk being missed without categorisation."),
    4: form("Go beyond categorising the feedback: weight each theme by frequency and severity, and separate the symptoms reported from the root causes behind them.", "Beyond categorising: the feedback weighted by frequency and severity, symptoms separated from root causes."),
    5: form("Write a feedback-review note: the categorised feedback weighted by frequency and severity, the symptoms-versus-root-causes, and the recurring patterns — the input the next iteration plans from.", "A durable feedback-review note of weighted themes and root causes."),
  },
};

/** ABSENCE_ITERATION_PLANNING — plan the next iteration, keyword "iteration". Produces a written plan. */
export const ABSENCE_ITERATION_PLANNING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_ITERATION_PLANNING', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: ITERATION_PLANNING_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Name the one feedback item the next iteration must address first.", "The lightest iteration step: the top item for the next iteration named."),
    2: form("Sketch the next iteration: rank the main feedback and decide what is in versus deferred.", "A light iteration pass: the main feedback ranked, in-versus-deferred decided."),
    3: form("Define the priorities for the next iteration of this project based on the feedback: rank the issues identified, determine what must be addressed in this iteration versus what can be deferred, and establish the scope of the next version.", "The next iteration hasn't been planned from feedback — without prioritised changes and success criteria, the next round risks repeating prior gaps."),
    4: form("Plan the next iteration thoroughly: rank every issue, decide this-iteration versus deferred, and set the scope and success criteria of the next version.", "Beyond the top items: the full next iteration scoped with success criteria."),
    5: form("Write the next-iteration plan: the prioritised changes, what is deferred, the scope of the next version, and its success criteria — the plan the next round executes.", "A durable next-iteration plan of prioritised changes and success criteria."),
  },
};

/** ABSENCE_SCOPE_CREEP — audit build against original scope, keyword "scope". Produces a written note. */
export const ABSENCE_SCOPE_CREEP_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SCOPE_CREEP', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: SCOPE_CREEP_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Name the one thing built that was not in the original scope, and decide: keep, defer, or cut?", "The lightest scope-creep check: one unplanned addition decided keep/defer/cut."),
    2: form("Compare what was built to the original scope: list the additions not planned and decide each keep/defer/cut.", "A light scope pass: the unplanned additions listed and decided."),
    3: form("Audit what was just built against the original scope for this iteration: list what is complete, what is still in progress, and what has been added that was not in the original plan — and decide whether each addition stays in scope, gets deferred, or gets cut.", "What was built hasn't been audited against the original scope — additions that crept in haven't been resolved keep / defer / cut."),
    4: form("Beyond auditing the scope additions, cost each kept addition against the iteration's remaining budget, and defer or cut whatever the budget cannot absorb.", "Beyond keep/defer/cut: each kept scope addition costed against the remaining budget."),
    5: form("Write a scope-audit note: the planned work done, the unplanned additions with a keep/defer/cut decision and a cost for each — so scope stays explicit and within budget, not crept.", "A durable scope-audit note of additions, decisions, and their cost."),
  },
};

/** ABSENCE_FEATURE_SCOPE — feature definition-of-ready, keyword "feature". Produces a written note. */
export const ABSENCE_FEATURE_SCOPE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_FEATURE_SCOPE', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: FEATURE_SCOPE_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("State in one line what this feature does and the one condition for calling it done.", "The lightest feature-readiness step: what the feature does and its done condition."),
    2: form("Sketch the feature's scope: what it does, the main out-of-scope items, and the acceptance conditions.", "A light feature pass: the feature's scope and acceptance conditions sketched."),
    3: form("Define the scope and acceptance criteria for this feature before implementation continues: what is the feature doing, what are the explicit out-of-scope items, and what conditions must be true for the feature to be accepted as done? This is the Definition of Ready for sprint planning.", "Definition of Ready / acceptance criteria for this feature haven't been written — implementation is proceeding without a written target."),
    4: form("Beyond defining the feature, confirm it is ready to build: each acceptance criterion is testable, and every dependency the feature needs is already in place — a true Definition of Ready.", "Beyond the feature definition: acceptance criteria testable and dependencies confirmed ready."),
    5: form("Write a feature-readiness note: what the feature does, the out-of-scope items, the testable acceptance criteria, and the confirmed dependencies — the written, ready target implementation is built against.", "A durable feature-readiness note of scope, testable acceptance criteria, and ready dependencies."),
  },
};

/** ABSENCE_IMPLEMENTATION_CHECKPOINT — verify each unit before continuing, keyword "checkpoint". Behavioural cadence. */
export const ABSENCE_IMPLEMENTATION_CHECKPOINT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_IMPLEMENTATION_CHECKPOINT', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: IMPLEMENTATION_CHECKPOINT_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Run a quick checkpoint: is the last unit of work passing before you continue?", "The lightest checkpoint: the last unit confirmed green before continuing."),
    2: form("Checkpoint the last change: run its tests or trace the main path, and continue only if it is green.", "A light checkpoint: the last change verified green before more is layered."),
    3: form("Run an implementation checkpoint before continuing: verify the last unit of work is in a passing state — either by running the relevant tests or by manually tracing the main path through the recently added code. Per TDD Red-Green-Refactor practice, only continue building once the current state is green.", "The last unit of work hasn't been verified before continuing — layering changes on an unverified base compounds debugging cost."),
    4: form("Run a thorough checkpoint: verify the last unit by running the relevant tests and tracing the main path, fix anything not green, and only then continue.", "Beyond a quick check: the last unit fully verified green at this checkpoint before continuing."),
    5: form("Make the checkpoint a standing gate: after each unit of work, verify it is green by tests or a main-path trace before starting the next — never layer changes on an unverified base.", "A standing checkpoint gate: every unit verified green before the next begins."),
  },
};

/** ABSENCE_SPEC_BEFORE_CODE — behaviour spec before coding, keyword "spec". Produces a written doc. */
export const ABSENCE_SPEC_BEFORE_CODE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SPEC_BEFORE_CODE', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: SPEC_BEFORE_CODE_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Write the primary scenario spec as Given/When/Then before continuing the code.", "The lightest spec step: the primary Given/When/Then scenario specified."),
    2: form("Sketch the behaviour spec: the primary Given/When/Then scenario and the main alternate path.", "A light spec pass: the primary and one alternate scenario specified."),
    3: form("Write a behaviour specification before continuing implementation: using BDD Given/When/Then format, define at least the primary scenario — Given [context], When [action], Then [expected outcome]. Per spec-driven development practice, the specification is the source of truth; code is the verification.", "Behaviour spec for what is being built hasn't been written — code is being produced without a Given/When/Then or equivalent target to verify against."),
    4: form("Write the behaviour spec before continuing: the primary scenario and the key edge and error scenarios in Given/When/Then — the target the code verifies against.", "Beyond the primary scenario: the spec covering edge and error cases."),
    5: form("Write the behaviour spec into a doc: the Given/When/Then scenarios (primary, edge, error) as the source of truth the code is verified against — spec first, code second.", "A durable behaviour-spec doc as the source of truth for the code."),
  },
};

/** ABSENCE_INCREMENTAL_BUILD — verify between increments, keyword "increment". Behavioural cadence. */
export const ABSENCE_INCREMENTAL_BUILD_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_INCREMENTAL_BUILD', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: INCREMENTAL_BUILD_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Verify the last increment before adding the next — confirm it works on its own.", "The lightest increment check: the last increment verified before the next."),
    2: form("Check the build cadence: verify the most recent increment passes before stacking the next change.", "A light increment pass: the latest increment confirmed before more is added."),
    3: form("Review the build cadence: is each incremental change being verified before the next is added? Compounding unverified changes increases debugging complexity — verify at each increment.", "Verification between increments hasn't been done — multiple changes are stacking without intermediate confirmation, increasing rework risk."),
    4: form("Audit the increment cadence: confirm each recent change was verified before the next was added, and re-verify any increment that was stacked without confirmation.", "Beyond the latest: every recent increment confirmed, unverified ones re-checked."),
    5: form("Make verify-each-increment the cadence: confirm each change works before adding the next, so unverified changes never compound — small verified steps over big unverified leaps.", "A standing increment cadence: each change verified before the next is added."),
  },
};

/** All class-6 planning/idea/task records = the 14 signals (all formal-headline). */
export const CLASS6_RECORDS: readonly ContentTemplateRecord[] = [
  ABSENCE_PHASE_TRANSITION_RECORD,
  ABSENCE_IDEA_SCOPING_RECORD,
  ABSENCE_IDEA_CONSTRAINT_CHECK_RECORD,
  ABSENCE_IDEA_USER_DEFINITION_RECORD,
  ABSENCE_TASK_ORDERING_RECORD,
  ABSENCE_TASK_SIZING_RECORD,
  ABSENCE_TASK_DEFINITION_OF_DONE_RECORD,
  ABSENCE_USER_FEEDBACK_REVIEW_RECORD,
  ABSENCE_ITERATION_PLANNING_RECORD,
  ABSENCE_SCOPE_CREEP_RECORD,
  ABSENCE_FEATURE_SCOPE_RECORD,
  ABSENCE_IMPLEMENTATION_CHECKPOINT_RECORD,
  ABSENCE_SPEC_BEFORE_CODE_RECORD,
  ABSENCE_INCREMENTAL_BUILD_RECORD,
];
