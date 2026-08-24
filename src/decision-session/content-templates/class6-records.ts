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
    1: form("Name the one thing that must be true before this project can move to the next phase — the key transition criterion.", "Just the one thing that must be true before this project moves to the next phase — the key transition criterion."),
    2: form("List the main exit criteria for this phase and check which are met before the transition.", "Cover the main exit criteria for this phase and check which are met before the transition."),
    3: form("Assess transition readiness for this project: define what must be complete before moving to the next phase, confirm which of those criteria are currently met, and identify what is blocking the transition. If no criteria are defined, define them now.", "Define what must be complete before the next phase, confirm which criteria are met, and identify what's blocking — and if no criteria exist, define them now."),
    4: form("Audit transition readiness end-to-end: every exit criterion for this phase, which are met, and what is blocking the transition — resolve or accept each blocker.", "Take transition readiness end-to-end — every exit criterion for this phase, which are met, and what's blocking — and resolve or accept each blocker."),
    5: form("Write a transition-readiness note: the exit criteria, their status, the open blockers, and the go/no-go call — the record the next phase starts from.", "Capture a transition-readiness note — the exit criteria, their status, the open blockers, and the go/no-go call — the record the next phase starts from."),
  },
};

/** ABSENCE_IDEA_SCOPING — define the project scope, keyword "scope". Produces a written note. */
export const ABSENCE_IDEA_SCOPING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_IDEA_SCOPING', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: IDEA_SCOPING_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("State the core problem this project solves in one line — the seed of its scope.", "Just the core problem this project solves, in one line — the seed of its scope."),
    2: form("Sketch the scope: the core problem, the main capabilities, and a rough first version.", "Rough out the scope — the core problem, the main capabilities, and a rough first version."),
    3: form("Define the scope of this project precisely: what is the core problem it solves, what are the primary capabilities it must deliver, and what does a complete first version look like?", "Pin down the core problem it solves, the primary capabilities it must deliver, and what a complete first version looks like."),
    4: form("Define the scope thoroughly: the core problem, every primary capability, what the first version includes, and what it deliberately leaves out.", "Take the scope full — the core problem, every primary capability, what the first version includes, and what it deliberately leaves out."),
    5: form("Write a scope note: the core problem, the primary capabilities, what a complete first version looks like, and the explicit boundaries — the anchor the build works against.", "Capture a scope note — the core problem, the primary capabilities, what a complete first version looks like, and the explicit boundaries — the anchor the build works against."),
  },
};

/** ABSENCE_IDEA_CONSTRAINT_CHECK — non-goals and constraints, keyword "constraint". Produces a written note. */
export const ABSENCE_IDEA_CONSTRAINT_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_IDEA_CONSTRAINT_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: IDEA_CONSTRAINT_CHECK_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Name the one thing this project will explicitly NOT do — its clearest constraint.", "Just the one thing this project will explicitly NOT do — its clearest constraint."),
    2: form("List the main constraints and non-goals: what is out of scope and what will not be built.", "Cover the main constraints and non-goals — what's out of scope and what won't be built."),
    3: form("Define the constraints and non-goals for this project: what is explicitly out of scope for the first version, what functionality will not be built, and what technical constraints limit the solution space?", "State what's explicitly out of scope for the first version, what won't be built, and what technical constraints limit the solution space."),
    4: form("Stress the constraints: for each non-goal and technical constraint, note what would force a revisit and check it against the defined scope for conflicts — so the boundaries hold under pressure.", "For each non-goal and technical constraint, note what would force a revisit and check it against the defined scope for conflicts — so the boundaries hold under pressure."),
    5: form("Write a constraints note: the explicit non-goals, the out-of-scope items, the technical constraints, and for each what would force a revisit — the boundary the build holds to.", "Capture a constraints note — the explicit non-goals, the out-of-scope items, the technical constraints, and for each what would force a revisit — the boundary the build holds to."),
  },
};

/** ABSENCE_IDEA_USER_DEFINITION — define the target user, keyword "user". Produces a written note. */
export const ABSENCE_IDEA_USER_DEFINITION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_IDEA_USER_DEFINITION', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: IDEA_USER_DEFINITION_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Name the primary user this project is for in one line.", "Just the primary user this project is for, in one line."),
    2: form("Sketch the target user: who they are, their context, and the problem this solves for them.", "Rough out the target user — who they are, their context, and the problem this solves for them."),
    3: form("Define the target user for this project precisely: who is the primary user, what is their context and skill level, what problem do they have that this project solves, and what does success look like from their perspective?", "Pin down who the primary user is, their context and skill level, the problem this solves for them, and what success looks like from their view."),
    4: form("Pressure-test the target-user definition: name one secondary or deliberately-excluded user, surface the riskiest assumption about the primary user, and decide how to validate it — so the user anchor is tested, not just asserted.", "Name one secondary or deliberately-excluded user, surface the riskiest assumption about the primary user, and decide how to validate it — so the user anchor is tested, not just asserted."),
    5: form("Write a target-user note: the primary user with context and skill, the problem and success from their view, the secondary or excluded users, and the assumptions to validate — the tested anchor design decisions hold to.", "Capture a target-user note — the primary user with context and skill, the problem and success from their view, the secondary or excluded users, and the assumptions to validate — the tested anchor design decisions hold to."),
  },
};

/** ABSENCE_TASK_ORDERING — order tasks by dependency, keyword "order". Produces a written plan. */
export const ABSENCE_TASK_ORDERING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_TASK_ORDERING', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: TASK_ORDERING_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Identify the one task that blocks the most others and order it first.", "Just the one task that blocks the most others — order that first."),
    2: form("Order the main tasks by dependency: what blocks what, and a rough sequence.", "Sequence the main tasks by dependency — what blocks what, in a rough order."),
    3: form("Order the tasks for this project by dependency and priority: identify which tasks block others, which can be done in parallel, and establish the sequence that minimises rework and delivers the earliest working state.", "Identify which tasks block others, which can run in parallel, and set the sequence that minimises rework and delivers the earliest working state."),
    4: form("Beyond the dependency order, identify the critical path and the first end-to-end slice that proves the design, and order the tasks so that proving slice lands earliest.", "Past the dependency order, find the critical path and the first end-to-end slice that proves the design, and order the tasks so that proving slice lands earliest."),
    5: form("Write the ordered task plan: the dependency order, the critical path, what can run in parallel, and the earliest end-to-end slice that proves the design — the plan the build follows.", "Capture the ordered task plan — the dependency order, the critical path, what can run in parallel, and the earliest end-to-end slice that proves the design — the plan the build follows."),
  },
};

/** ABSENCE_TASK_SIZING — single-session task sizing, keyword "siz". Produces a written plan. */
export const ABSENCE_TASK_SIZING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_TASK_SIZING', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: TASK_SIZING_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Check the largest task for sizing: can it be finished in one focused session, or must it be split?", "Just the largest task — can it be finished in one focused session, or must it be split for sizing?"),
    2: form("Review the main tasks for sizing: flag any that can't be completed and verified in a single session.", "For sizing, flag any main task that can't be completed and verified in a single session."),
    3: form("Review the task list for this project and validate sizing: each task should be completable in a single focused session. Identify any tasks that span multiple concerns, require too many unknowns to resolve in one sitting, or are so large that progress cannot be verified at the end of a session.", "Check each task is completable in one focused session — flag any that span multiple concerns, carry too many unknowns, or are too large to verify at a session's end."),
    4: form("Validate sizing across the task list: flag every task that spans multiple concerns, carries too many unknowns, or is too large to verify at a session's end — and split each.", "Across the whole list, flag every task that spans multiple concerns, carries too many unknowns, or is too large to verify at a session's end for sizing — and split each."),
    5: form("Write the re-sized task plan: each task scoped to a single verifiable session, with oversized ones split into checkable units — the plan the build executes.", "Capture the re-sized task plan — each task scoped to a single verifiable session, with oversized ones split into checkable units — the plan the build executes."),
  },
};

/** ABSENCE_TASK_DEFINITION_OF_DONE — per-task completion criteria, keyword "complet". Produces a written note. */
export const ABSENCE_TASK_DEFINITION_OF_DONE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_TASK_DEFINITION_OF_DONE', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: TASK_DEFINITION_OF_DONE_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("State the completion criterion for the current task: what must be true for it to be complete?", "Just the completion criterion for the current task — what must be true for it to be complete?"),
    2: form("Define completion criteria for the main tasks: what output must exist and be verified for each to be complete.", "For the main tasks, define what output must exist and be verified for each to be complete."),
    3: form("Define the completion criteria for each task in this project: for every task, state what must be true for the task to be considered complete — what output exists, what has been verified, and what has not been left in an ambiguous or partially done state.", "For every task, state what must be true for it to be complete — what output exists, what's verified, and that nothing's left ambiguous or half-done."),
    4: form("Make each task's completion criteria observable: for every task, state how completion is confirmed without re-reading the code — a check, output, or test anyone could verify.", "Turn each task's completion into something observable — for every task, state how it's confirmed without re-reading the code: a check, output, or test anyone could verify."),
    5: form("Write a definition-of-done note: per task the completion criteria stated as observable checks — output exists, verified, nothing left partial — so completion is unambiguous and anyone can confirm it.", "Capture a definition-of-done note — per task the completion criteria as observable checks (output exists, verified, nothing left partial) — so completion is unambiguous and anyone can confirm it."),
  },
};

/** ABSENCE_USER_FEEDBACK_REVIEW — systematic feedback review, keyword "feedback". Produces a written note. */
export const ABSENCE_USER_FEEDBACK_REVIEW_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_USER_FEEDBACK_REVIEW', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: USER_FEEDBACK_REVIEW_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Pick the one piece of feedback that recurs most and note the pattern it points to.", "Just the one piece of feedback that recurs most — note the pattern it points to."),
    2: form("Review the main feedback: group it by theme and surface the top recurring complaints.", "Group the main feedback by theme and surface the top recurring complaints."),
    3: form("Review the feedback received for this project systematically: collect all available feedback, categorize it by theme or feature area, and identify the recurring complaints, requests, and points of confusion that appear across multiple users.", "Collect all the feedback, categorise it by theme or feature area, and identify the recurring complaints, requests, and points of confusion that appear across multiple users."),
    4: form("Go beyond categorising the feedback: weight each theme by frequency and severity, and separate the symptoms reported from the root causes behind them.", "Past categorising the feedback, weight each theme by frequency and severity, and separate the symptoms reported from the root causes behind them."),
    5: form("Write a feedback-review note: the categorised feedback weighted by frequency and severity, the symptoms-versus-root-causes, and the recurring patterns — the input the next iteration plans from.", "Capture a feedback-review note — the categorised feedback weighted by frequency and severity, symptoms versus root causes, and the recurring patterns — the input the next iteration plans from."),
  },
};

/** ABSENCE_ITERATION_PLANNING — plan the next iteration, keyword "iteration". Produces a written plan. */
export const ABSENCE_ITERATION_PLANNING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_ITERATION_PLANNING', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: ITERATION_PLANNING_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Name the one feedback item the next iteration must address first.", "Just the one feedback item the next iteration must address first."),
    2: form("Sketch the next iteration: rank the main feedback and decide what is in versus deferred.", "For the next iteration, rank the main feedback and decide what's in versus deferred."),
    3: form("Define the priorities for the next iteration of this project based on the feedback: rank the issues identified, determine what must be addressed in this iteration versus what can be deferred, and establish the scope of the next version.", "Rank the issues found, decide what must be addressed this round versus deferred, and set the scope of the next version."),
    4: form("Plan the next iteration thoroughly: rank every issue, decide this-iteration versus deferred, and set the scope and success criteria of the next version.", "Scope the next iteration fully — rank every issue, decide this-iteration versus deferred, and set the scope and success criteria of the next version."),
    5: form("Write the next-iteration plan: the prioritised changes, what is deferred, the scope of the next version, and its success criteria — the plan the next round executes.", "Capture the next-iteration plan — the prioritised changes, what's deferred, the scope of the next version, and its success criteria — the plan the next round executes."),
  },
};

/** ABSENCE_SCOPE_CREEP — audit build against original scope, keyword "scope". Produces a written note. */
export const ABSENCE_SCOPE_CREEP_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SCOPE_CREEP', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: SCOPE_CREEP_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Name the one thing built that was not in the original scope, and decide: keep, defer, or cut?", "Just the one thing built that wasn't in the original scope — decide keep, defer, or cut."),
    2: form("Compare what was built to the original scope: list the additions not planned and decide each keep/defer/cut.", "Line what was built up against the original scope — list the additions not planned and decide each keep/defer/cut."),
    3: form("Audit what was just built against the original scope for this iteration: list what is complete, what is still in progress, and what has been added that was not in the original plan — and decide whether each addition stays in scope, gets deferred, or gets cut.", "List what's complete, what's in progress, and what was added that wasn't in the original plan — and decide whether each addition stays, gets deferred, or gets cut."),
    4: form("Beyond auditing the scope additions, cost each kept addition against the iteration's remaining budget, and defer or cut whatever the budget cannot absorb.", "Past keep/defer/cut, cost each kept scope addition against the iteration's remaining budget, and defer or cut whatever the budget can't absorb."),
    5: form("Write a scope-audit note: the planned work done, the unplanned additions with a keep/defer/cut decision and a cost for each — so scope stays explicit and within budget, not crept.", "Capture a scope-audit note — the planned work done, the unplanned additions with a keep/defer/cut decision and a cost for each — so scope stays explicit and within budget, not crept."),
  },
};

/** ABSENCE_FEATURE_SCOPE — feature definition-of-ready, keyword "feature". Produces a written note. */
export const ABSENCE_FEATURE_SCOPE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_FEATURE_SCOPE', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: FEATURE_SCOPE_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("State in one line what this feature does and the one condition for calling it done.", "Just what this feature does, in one line, and the one condition for calling it done."),
    2: form("Sketch the feature's scope: what it does, the main out-of-scope items, and the acceptance conditions.", "Rough out the feature's scope — what it does, the main out-of-scope items, and the acceptance conditions."),
    3: form("Define the scope and acceptance criteria for this feature before implementation continues: what is the feature doing, what are the explicit out-of-scope items, and what conditions must be true for the feature to be accepted as done? This is the Definition of Ready for sprint planning.", "Pin down what the feature does, the explicit out-of-scope items, and the conditions that must be true for it to be accepted as done — the Definition of Ready before implementation continues."),
    4: form("Beyond defining the feature, confirm it is ready to build: each acceptance criterion is testable, and every dependency the feature needs is already in place — a true Definition of Ready.", "Confirm the feature is ready to build — each acceptance criterion is testable, and every dependency it needs is already in place: a true Definition of Ready."),
    5: form("Write a feature-readiness note: what the feature does, the out-of-scope items, the testable acceptance criteria, and the confirmed dependencies — the written, ready target implementation is built against.", "Capture a feature-readiness note — what the feature does, the out-of-scope items, the testable acceptance criteria, and the confirmed dependencies — the written, ready target implementation is built against."),
  },
};

/** ABSENCE_IMPLEMENTATION_CHECKPOINT — verify each unit before continuing, keyword "checkpoint". Behavioural cadence. */
export const ABSENCE_IMPLEMENTATION_CHECKPOINT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_IMPLEMENTATION_CHECKPOINT', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: IMPLEMENTATION_CHECKPOINT_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Run a quick checkpoint: is the last unit of work passing before you continue?", "Just a quick checkpoint — is the last unit of work passing before you continue?"),
    2: form("Checkpoint the last change: run its tests or trace the main path, and continue only if it is green.", "Run the last change's tests or trace its main path, and continue only if it's green — the checkpoint before layering more."),
    3: form("Run an implementation checkpoint before continuing: verify the last unit of work is in a passing state — either by running the relevant tests or by manually tracing the main path through the recently added code. Per TDD Red-Green-Refactor practice, only continue building once the current state is green.", "Verify the last unit of work is passing — run the relevant tests or manually trace the main path through the recent code — and only continue once it's green."),
    4: form("Run a thorough checkpoint: verify the last unit by running the relevant tests and tracing the main path, fix anything not green, and only then continue.", "Make this checkpoint thorough — verify the last unit by running the relevant tests and tracing the main path, fix anything not green, and only then continue."),
    5: form("Make the checkpoint a standing gate: after each unit of work, verify it is green by tests or a main-path trace before starting the next — never layer changes on an unverified base.", "Hold the checkpoint as a standing gate — after each unit of work, verify it's green by tests or a main-path trace before starting the next; never layer changes on an unverified base."),
  },
};

/** ABSENCE_SPEC_BEFORE_CODE — behaviour spec before coding, keyword "spec". Produces a written doc. */
export const ABSENCE_SPEC_BEFORE_CODE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SPEC_BEFORE_CODE', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: SPEC_BEFORE_CODE_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Write the primary scenario spec as Given/When/Then before continuing the code.", "Just the primary scenario spec as Given/When/Then, before continuing the code."),
    2: form("Sketch the behaviour spec: the primary Given/When/Then scenario and the main alternate path.", "Rough out the behaviour spec — the primary Given/When/Then scenario and the main alternate path."),
    3: form("Write a behaviour specification before continuing implementation: using BDD Given/When/Then format, define at least the primary scenario — Given [context], When [action], Then [expected outcome]. Per spec-driven development practice, the specification is the source of truth; code is the verification.", "Capture at least the primary scenario in Given/When/Then — Given [context], When [action], Then [expected outcome] — as the source of truth the code verifies against."),
    4: form("Write the behaviour spec before continuing: the primary scenario and the key edge and error scenarios in Given/When/Then — the target the code verifies against.", "Extend the behaviour spec past the primary scenario — the key edge and error scenarios in Given/When/Then, the target the code verifies against."),
    5: form("Write the behaviour spec into a doc: the Given/When/Then scenarios (primary, edge, error) as the source of truth the code is verified against — spec first, code second.", "Capture the behaviour spec into a doc — the Given/When/Then scenarios (primary, edge, error) as the source of truth the code is verified against — spec first, code second."),
  },
};

/** ABSENCE_INCREMENTAL_BUILD — verify between increments, keyword "increment". Behavioural cadence. */
export const ABSENCE_INCREMENTAL_BUILD_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_INCREMENTAL_BUILD', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: INCREMENTAL_BUILD_BEGINNER_OVERRIDE },
  paramAxes: PLANNING_PARAM_AXES,
  levelForms: {
    1: form("Verify the last increment before adding the next — confirm it works on its own.", "Just verify the last increment before adding the next — confirm it works on its own."),
    2: form("Check the build cadence: verify the most recent increment passes before stacking the next change.", "Confirm the most recent increment passes before stacking the next change."),
    3: form("Review the build cadence: is each incremental change being verified before the next is added? Compounding unverified changes increases debugging complexity — verify at each increment.", "Check each incremental change is verified before the next is added — compounding unverified changes makes debugging harder, so verify at each increment."),
    4: form("Audit the increment cadence: confirm each recent change was verified before the next was added, and re-verify any increment that was stacked without confirmation.", "Confirm each recent change was verified before the next was added, and re-verify any increment stacked without confirmation."),
    5: form("Make verify-each-increment the cadence: confirm each change works before adding the next, so unverified changes never compound — small verified steps over big unverified leaps.", "Hold verify-each-increment as the cadence — confirm each change works before adding the next, so unverified changes never compound: small verified steps over big unverified leaps."),
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
