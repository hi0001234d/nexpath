// Per-class decision-session content (class6_planning_idea_task). Relocated verbatim from
// options.ts / options-beginner.ts — one home per signal class.

import type { DecisionContent } from '../options.js';
import { WHY_HELP_BY_SIGNAL_TYPE } from '../why-help-by-signal-type.js';

export const ABSENCE_PHASE_TRANSITION: DecisionContent = {
  signalType:   "ABSENCE_PHASE_TRANSITION",
  question:      'Extended phase — transition readiness assessed?',
  pinchFallback: 'Phase check.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_PHASE_TRANSITION'],
  L1: [
    {
      option: 'Assess transition readiness for this project: define what must be complete before moving to the next phase, confirm which of those criteria are currently met, and identify what is blocking the transition. If no criteria are defined, define them now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended phase activity; exit criteria not assessed."}
Exit criteria for the current phase haven't been assessed — the phase has been active long enough to risk drift without a clean handoff.
Define exit criteria / confirm which are met / identify blockers.
{R4_CLOSE}`,
    },
    {
      option: 'Review the current phase of this project against its original definition: have the objectives for this phase been met, what work is still in progress, and is there a clear handoff point that marks the end of this phase and the beginning of the next?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended phase; review vs original definition not done."}
The phase-vs-original-definition review hasn't been done.
Check: objectives met / work still in progress / clear handoff point.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm phase completion for this project: what artifacts, decisions, or quality gates were supposed to be produced in this phase, which are complete, which are missing, and what would need to be done to be confident that proceeding to the next phase is the right call?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended phase; cross-confirmation of completion not done."}
Phase-completion cross-confirmation hasn't been done.
List: artifacts/decisions/gates expected vs complete vs missing — gate proceeding decision on that.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What are the exit criteria for the current phase of this project? Assess which are met and which are not before committing to the next phase.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended phase."}
Lighter: name exit criteria / met vs not.
{R4_CLOSE}`,
    },
    {
      option: 'Is there any unfinished work from the current phase of this project that should be resolved before transitioning — decisions deferred, quality gates not cleared, or artifacts not produced?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended phase; unfinished items not surveyed."}
Narrower: unfinished items — deferred decisions / un-cleared gates / un-produced artifacts.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What needs to be true for this project to be ready to move to the next phase, and is any of that currently incomplete or unresolved?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended phase."}
Minimum next step: name the next-phase-readiness condition + status.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_PHASE_TRANSITION_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_PHASE_TRANSITION",
  question:      'Been in this phase a while — what comes next?',
  pinchFallback: 'Phase check.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_PHASE_TRANSITION'],
  L1: [
    {
      option: 'Step back from this project and think about where you are in the overall flow — have you actually finished this phase, or have you just been in it for a while? What needs to be done before it makes sense to move on?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been in this phase a while; I haven't checked whether I've actually finished it."}
The finished-vs-just-been-in-it check hasn't been done for this phase.
Step back; name what's left before moving on.
{R4_CLOSE}`,
    },
    {
      option: 'Look at what you set out to accomplish in this phase of this project — is it done, partially done, or have you moved past it without properly closing it off? Figure out where you actually are before starting something new.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long phase; original-objectives check not done."}
The done-vs-partially-done-vs-skipped check on this phase hasn't been done.
Figure out where you actually are before starting something new.
{R4_CLOSE}`,
    },
    {
      option: 'Check what you set out to finish before moving on from this phase of this project — what\'s actually done, what\'s been skipped or deferred? Make a call on whether you\'re ready to transition.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long phase; transition-readiness call not made."}
The transition-readiness call hasn't been made.
What's done / skipped / deferred — then call: ready or not.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything left unfinished in the current phase of this project that should be sorted before you move on to the next one?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long phase."}
Lighter: anything unfinished in the current phase to sort before moving on.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the next phase for this project, and what needs to be in place before you can properly start it? Are those things ready?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long phase; next-phase prereqs not checked."}
Narrower: next phase + prereqs + ready-state.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is this project actually ready to move to the next phase, or has it just been in the current phase for a long time without a clear exit point?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long phase."}
Minimum next step: ready or just been-here-a-while?
{R4_CLOSE}`,
    },
  ],
};

// ── Sub-4 — idea / task_breakdown / feedback_loop ─────────────────────────────
// Group A — idea signals
export const ABSENCE_IDEA_SCOPING: DecisionContent = {
  signalType:   "ABSENCE_IDEA_SCOPING",
  question:      'Idea in mind — is the scope defined?',
  pinchFallback: 'Scope undefined.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_IDEA_SCOPING'],
  L1: [
    {
      option: 'Define the scope of this project precisely: what is the core problem it solves, what are the primary capabilities it must deliver, and what does a complete first version look like?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Idea forming; scope not yet defined."}
The scope of this project hasn't been defined — what it is, what problem it solves, and what the first version includes are still implicit.
Define: core problem / primary capabilities / what a complete first version looks like.
{R4_CLOSE}`,
    },
    {
      option: 'Write a scope statement for this project: describe the problem in one sentence, the solution in one paragraph, and draw an explicit boundary around what is and is not included in the initial version.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Idea forming; scope statement not written."}
The scope statement hasn't been written.
Problem in one sentence / solution in one paragraph / explicit boundary on initial-version contents.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm the project scope: summarize in your own words what this project is, what problem it solves, and what \'built\' means for this project — then flag what is still ambiguous or undefined.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Idea forming; scope cross-confirm not done."}
Scope cross-confirmation hasn't been done.
Summarize: what / what problem / what 'built' means — flag ambiguous.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Summarize the scope of this project in three sentences: the problem, the core solution, and the boundary of the first version.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea forming."}
Lighter: 3-sentence scope — problem / solution / boundary.
{R4_CLOSE}`,
    },
    {
      option: 'What is the single most important thing to define about this project before building starts? Articulate it precisely.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea forming; key-anchor not pinned."}
Narrower: single most important thing to define before building.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is this project, what problem does it solve, and what will the first version include?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea forming."}
Minimum next step: what / problem / first version contents.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_IDEA_SCOPING_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_IDEA_SCOPING",
  question:      'Idea forming — what exactly are we building?',
  pinchFallback: 'Scope unclear.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_IDEA_SCOPING'],
  L1: [
    {
      option: 'Walk me through this project — what\'s the main idea, what problem does it solve, and what\'s in vs out for the first version?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I have an idea but I haven't walked through what's actually in vs out."}
The walk-through of main idea / problem / in vs out hasn't been done.
Main idea / problem / in-vs-out for v1.
{R4_CLOSE}`,
    },
    {
      option: 'What exactly are we building here? Describe this project in your own words — what it does, why it exists, and where the line is on what\'s included first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; haven't put it in plain words."}
The plain-words description hasn't been done.
What it does / why it exists / where v1's line is.
{R4_CLOSE}`,
    },
    {
      option: 'Summarize this project back to me in your own words — what it does, what problem it solves, and what \'done\' looks like. Flag anything that still feels fuzzy.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; summary back to me not done."}
The summary-back-to-me hasn't been done.
Summarize: what / problem / what done looks like + flag fuzzy.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s this project and what\'s it supposed to do for the first version? Give me the short version.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Lighter: short version — what + v1 contents.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the most important thing to pin down about this project before we start building?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming; key-anchor not pinned."}
Narrower: most important thing to pin down before building.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is this project and what will it do?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Minimum next step: what + what it does.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_IDEA_CONSTRAINT_CHECK: DecisionContent = {
  signalType:   "ABSENCE_IDEA_CONSTRAINT_CHECK",
  question:      'Idea scoped — are the non-goals defined?',
  pinchFallback: 'Non-goals missing.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_IDEA_CONSTRAINT_CHECK'],
  L1: [
    {
      option: 'Define the constraints and non-goals for this project: what is explicitly out of scope for the first version, what functionality will not be built, and what technical constraints limit the solution space?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Idea scoped; non-goals not defined."}
Non-goals and constraints for this project haven't been stated — without explicit boundaries, scope creeps during implementation.
Define: out-of-scope / functionality-not-built / technical constraints.
{R4_CLOSE}`,
    },
    {
      option: 'Identify the boundary conditions of this project: what adjacent problems will not be solved, what user requests will be deferred, and what are the explicit constraints on scope, technology, or resources?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Idea scoped; boundary conditions not identified."}
Boundary conditions haven't been identified.
Adjacent problems not solved / user requests deferred / explicit scope/tech/resource constraints.
{R4_CLOSE}`,
    },
    {
      option: 'Write the non-goals section for this project: list at least three things this project will not do, at least one technical constraint, and at least one explicit decision to defer for a future version.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Idea scoped; non-goals section not written."}
The non-goals section hasn't been written.
List: 3+ things not done / 1+ technical constraint / 1+ explicit defer-to-future decision.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What are the top three things this project will not do in the first version? Document them explicitly so they do not creep in during implementation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea scoped."}
Lighter: top 3 will-not-do for v1.
{R4_CLOSE}`,
    },
    {
      option: 'What is the clearest out-of-scope decision for this project? State it as an explicit non-goal.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea scoped."}
Narrower: clearest out-of-scope decision as explicit non-goal.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is one thing this project will not do, and why is that boundary important to state now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea scoped."}
Minimum next step: one will-not-do + why-now.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_IDEA_CONSTRAINT_CHECK_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_IDEA_CONSTRAINT_CHECK",
  question:      'Idea forming — what\'s out of scope?',
  pinchFallback: 'No non-goals set.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_IDEA_CONSTRAINT_CHECK'],
  L1: [
    {
      option: 'What are we NOT building in the first version of this project? Walk me through what\'s intentionally out of scope — things that could be asked for but we\'re not doing yet.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; haven't said out loud what we're NOT doing."}
The not-building list for v1 hasn't been called out.
Walk through what's intentionally out of scope — could-be-asked-for but not-doing-yet.
{R4_CLOSE}`,
    },
    {
      option: 'What are the constraints on this project? What won\'t it do, what can\'t it do, and what have we decided to skip for now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; constraints not stated."}
The constraints haven't been stated.
Won't do / can't do / decided to skip for now.
{R4_CLOSE}`,
    },
    {
      option: 'List the things this project will not do — at least three things that could be asked for but are deliberately left out. Then tell me which one is most likely to cause confusion if it\'s not stated clearly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; will-not-do list not made."}
The will-not-do list hasn't been made.
List 3+ deliberate omissions / flag the one most likely to confuse if unsaid.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s one thing this project won\'t do — something someone might expect it to do but we\'re leaving out? State it clearly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Lighter: one won't-do — expected-but-leaving-out.
{R4_CLOSE}`,
    },
    {
      option: 'What are we keeping out of this project on purpose? Give me the short list.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Narrower: short list of intentional omissions.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Name one thing this project will not do that should be stated clearly before we start building.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Minimum next step: one will-not-do to state clearly before building.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_IDEA_USER_DEFINITION: DecisionContent = {
  signalType:   "ABSENCE_IDEA_USER_DEFINITION",
  question:      'Idea scoped — is the target user defined?',
  pinchFallback: 'Target user undefined.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_IDEA_USER_DEFINITION'],
  L1: [
    {
      option: 'Define the target user for this project precisely: who is the primary user, what is their context and skill level, what problem do they have that this project solves, and what does success look like from their perspective?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Idea scoped; target user not defined."}
The target user for this project hasn't been defined — without a primary-user anchor, design decisions drift on assumptions.
Define: primary user / context+skill / problem they have / success from their perspective.
{R4_CLOSE}`,
    },
    {
      option: 'Write a target user profile for this project: describe who will use it, what they are trying to accomplish, what they already know and do not know, and how this project fits into their workflow.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Idea scoped; user profile not written."}
The target user profile hasn't been written.
Who / accomplishing what / knows-doesn't-know / fits-into-workflow.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm the target user definition for this project: given what has been described, who is this project for, who is explicitly not the target user, and what does that boundary imply for the feature set?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Idea scoped; user cross-confirm not done."}
Target-user cross-confirmation hasn't been done.
Who it's for / who it's not for / feature-set implications of the boundary.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Who is the primary user of this project and what are they trying to accomplish? Define them precisely enough that you could make a product decision on their behalf.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea scoped."}
Lighter: primary user + what they accomplish — decision-on-their-behalf-precise.
{R4_CLOSE}`,
    },
    {
      option: 'What does the target user of this project already know and not know? That context will drive every design decision.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea scoped."}
Narrower: known-vs-unknown context that drives design decisions.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Who is this project for, and what are they trying to do?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea scoped."}
Minimum next step: who + what they're trying to do.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_IDEA_USER_DEFINITION_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_IDEA_USER_DEFINITION",
  question:      'Idea forming — who is this actually for?',
  pinchFallback: 'User not defined.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_IDEA_USER_DEFINITION'],
  L1: [
    {
      option: 'Who is this project for? Walk me through who the main user is, what they\'re trying to do, and what they know going in — be specific enough that we could make decisions about this project on their behalf.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; haven't pinned down who this is for."}
The who-this-is-for walk-through hasn't been done.
Main user / what they're trying / what they know — specific enough for on-their-behalf decisions.
{R4_CLOSE}`,
    },
    {
      option: 'Describe the person who\'ll use this project — who they are, what they want to do with it, and what level of experience they have. Then tell me who it\'s definitely NOT for.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; user persona + non-user not described."}
The user-and-non-user description hasn't been done.
Who they are / want / experience-level / who it's NOT for.
{R4_CLOSE}`,
    },
    {
      option: 'Think about the person using this project — who are they? Describe them to me, including what problem they have and how this project fits into what they\'re already doing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; user-in-context not described."}
The user-in-context description hasn't been done.
Who / problem / how this fits into what they already do.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Who\'s the main person this project is for? Give me enough detail that we could make a feature decision based on what they need.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Lighter: main user with feature-decision-grade detail.
{R4_CLOSE}`,
    },
    {
      option: 'What does the person using this project actually want to do with it? Describe them simply.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Narrower: what they want to do with it — simply.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Who is this project for and what are they trying to do?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Minimum next step: who + what they're trying to do.
{R4_CLOSE}`,
    },
  ],
};

// Group B — task_breakdown signals
export const ABSENCE_TASK_ORDERING: DecisionContent = {
  signalType:   "ABSENCE_TASK_ORDERING",
  question:      'Tasks listed — have they been ordered?',
  pinchFallback: 'Tasks unordered.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_TASK_ORDERING'],
  L1: [
    {
      option: 'Order the tasks for this project by dependency and priority: identify which tasks block others, which can be done in parallel, and establish the sequence that minimises rework and delivers the earliest working state.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Tasks listed; not ordered."}
The task list hasn't been ordered by dependency and priority — work risks proceeding on tasks that block later progress or invite rework.
Order: blocking / parallel-eligible / sequence-minimising-rework / earliest-working-state.
{R4_CLOSE}`,
    },
    {
      option: 'Review the task list for this project and establish an explicit order: which task must be done first, which tasks have hard dependencies on others, and what is the critical path to a testable first version?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Tasks listed; explicit order not established."}
The explicit task order hasn't been established.
First task / hard dependencies / critical path to testable v1.
{R4_CLOSE}`,
    },
    {
      option: 'Prioritize the task list for this project: rank tasks by impact and dependency, identify the single highest-priority task to start with, and flag any tasks that should be deferred until a working core is established.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Tasks listed; prioritisation not done."}
Task prioritisation hasn't been done.
Rank by impact/dependency / single highest-priority start / defer-until-core-works items.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the correct order of tasks for this project? Identify the first three tasks in sequence and explain why each one must come before the next.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Tasks listed."}
Lighter: first 3 tasks in sequence + why-before-next.
{R4_CLOSE}`,
    },
    {
      option: 'Which task in this project should be done first, and why? Establish the top of the ordered list before anything else starts.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Tasks listed."}
Narrower: first task + why — top of the list before anything else.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is the first task to work on for this project, and what does it unblock?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Tasks listed."}
Minimum next step: first task + what it unblocks.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_TASK_ORDERING_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_TASK_ORDERING",
  question:      'Tasks listed — what order do we do them in?',
  pinchFallback: 'No order set.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_TASK_ORDERING'],
  L1: [
    {
      option: 'Put the tasks for this project in order — which ones have to happen before others, which ones are independent, and what\'s the sequence that gets us to something working as fast as possible?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've got a task list but haven't put it in order."}
The task ordering hasn't been done.
Which before which / independent ones / sequence to fastest-working-state.
{R4_CLOSE}`,
    },
    {
      option: 'Look at the task list for this project and sort it — what comes first, what depends on what, and what\'s the critical path to something we can actually test?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Task list unsorted."}
Sorting the task list hasn't been done.
First / dependencies / critical path to testable.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the right order to tackle the tasks for this project? Rank them by what\'s blocking what, and tell me which task to start with and why.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Task list unsorted; blocker analysis not done."}
The blocker-rank and start-task hasn't been called out.
Rank by what blocks what / start-task + why.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What are the first three tasks for this project in order? Tell me what order makes sense and why.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Task list unsorted."}
Lighter: first 3 tasks + why-this-order.
{R4_CLOSE}`,
    },
    {
      option: 'Which task should we do first for this project and why does it come before everything else?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Task list unsorted."}
Narrower: first task + why-it-comes-before-everything-else.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s the first task to work on for this project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Task list unsorted."}
Minimum next step: first task.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_TASK_SIZING: DecisionContent = {
  signalType:   "ABSENCE_TASK_SIZING",
  question:      'Tasks defined — are they scoped to single sessions?',
  pinchFallback: 'Tasks oversized.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_TASK_SIZING'],
  L1: [
    {
      option: 'Review the task list for this project and validate sizing: each task should be completable in a single focused session. Identify any tasks that span multiple concerns, require too many unknowns to resolve in one sitting, or are so large that progress cannot be verified at the end of a session.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Tasks defined; sizing not validated."}
Tasks haven't been sized to single-session scope — oversized tasks cannot be verified done in one focused sitting.
Identify: spans-multiple-concerns / too-many-unknowns / too-large-to-verify-at-session-end.
{R4_CLOSE}`,
    },
    {
      option: 'Break down any oversized tasks in this project: for each task that could not be completed in a single session, decompose it into subtasks — each subtask should have a clear output that can be verified when done.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Oversized tasks not decomposed."}
Oversized task decomposition hasn't been done.
Decompose: per oversized task → subtasks with clear-and-verifiable outputs.
{R4_CLOSE}`,
    },
    {
      option: 'Assess the scope of each task for this project: flag any that are too large to complete in one session, too vague to know when they\'re done, or dependent on so many unknowns that work could not proceed without stopping midway.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Task scope assessment not done."}
The per-task scope assessment hasn't been done.
Flag: too-large / too-vague / too-many-unknowns-to-proceed.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Which tasks in this project are too large to finish in a single session? Break the largest one down into smaller units now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Tasks defined."}
Lighter: too-large tasks + break-down-largest-now.
{R4_CLOSE}`,
    },
    {
      option: 'Is there any task in this project that could not be completed in a single focused session? Identify it and propose how to split it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Tasks defined."}
Narrower: any not-single-session task + split proposal.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Identify any task in this project that is too large to finish in a single session and break it into smaller units.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Tasks defined."}
Minimum next step: identify too-large + break it.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_TASK_SIZING_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_TASK_SIZING",
  question:      'Tasks listed — are they small enough to do in one go?',
  pinchFallback: 'Tasks too big.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_TASK_SIZING'],
  L1: [
    {
      option: 'Go through the tasks for this project — are any of them too big to finish in one session? If so, break them down into smaller pieces that each have a clear endpoint.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Tasks listed; haven't checked if any are too big."}
The too-big check hasn't been done.
Go through; break too-big ones into smaller-clear-endpoint pieces.
{R4_CLOSE}`,
    },
    {
      option: 'Check the task list for this project: which tasks are small enough to finish in one focused session, and which ones are really multiple tasks lumped together? Split the big ones.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Task sizing not checked."}
The single-session-vs-lumped check hasn't been done.
Single-session-sized vs really-multiple — split the big.
{R4_CLOSE}`,
    },
    {
      option: 'Is any task in this project too big to do in one go? Walk me through the tasks and flag anything that would require stopping midway because there\'s too much or too many unknowns.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Task sizing not checked."}
Mid-session-stop risk hasn't been flagged.
Walk through; flag anything requiring midway-stop — too-much or too-many-unknowns.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Which task in this project feels the biggest? Break it down into two or three smaller tasks that could each be finished in one session.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks listed."}
Lighter: biggest task + break into 2-3 single-session pieces.
{R4_CLOSE}`,
    },
    {
      option: 'Are the tasks for this project small enough to finish one at a time, or do any of them need to be split up?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks listed."}
Narrower: small-enough vs need-splitting.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there any task in this project that\'s too big to do in one session?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks listed."}
Minimum next step: any task too big for one session?
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_TASK_DEFINITION_OF_DONE: DecisionContent = {
  signalType:   "ABSENCE_TASK_DEFINITION_OF_DONE",
  question:      'Tasks ordered — does each task have a definition of done?',
  pinchFallback: 'No done criteria.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_TASK_DEFINITION_OF_DONE'],
  L1: [
    {
      option: 'Define the completion criteria for each task in this project: for every task, state what must be true for the task to be considered complete — what output exists, what has been verified, and what has not been left in an ambiguous or partially done state.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Tasks ordered; DoD not defined per task."}
Definition of Done hasn't been written per task — without explicit completion criteria, 'done' is ambiguous and verification cannot anchor.
Per task: output exists / verified / nothing left ambiguous or partially-done.
{R4_CLOSE}`,
    },
    {
      option: 'Audit the task list for this project for missing definitions of done: identify every task that lacks explicit completion criteria, then define what \'done\' means for each — the specific, verifiable condition that ends work on that task.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "DoD audit not done."}
The DoD-missing audit hasn't been done.
Identify DoD-lacking tasks / define per task: specific verifiable end-condition.
{R4_CLOSE}`,
    },
    {
      option: 'Write the definition of done for the highest-priority task in this project: what is the exact state of the codebase, tests, and documentation when this task is complete? Use that as a template to define done for the remaining tasks in this project.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "DoD not written for highest-priority task."}
The highest-priority-task DoD hasn't been written.
Codebase + tests + docs state when complete — use as template for the rest.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'For each task in this project, write one sentence stating what \'done\' looks like — a specific, verifiable condition, not a vague description of intent.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Tasks defined."}
Lighter: per-task one-sentence DoD — verifiable, not vague.
{R4_CLOSE}`,
    },
    {
      option: 'Which task in this project is missing the clearest definition of done? Define what completion looks like for that task before it starts.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Tasks defined."}
Narrower: DoD-clearest-missing task + define before-start.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Does every task in this project have a clear, verifiable definition of done, or are any tasks missing that?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Tasks defined."}
Minimum next step: every task has DoD or any missing?
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_TASK_DEFINITION_OF_DONE_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_TASK_DEFINITION_OF_DONE",
  question:      'Tasks set — how do we know when each one\'s done?',
  pinchFallback: 'Done criteria missing.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_TASK_DEFINITION_OF_DONE'],
  L1: [
    {
      option: 'For each task in this project, define what done looks like — not just \'it works\' but what specifically is true when the task is finished. What can be checked? What exists that didn\'t before?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Tasks listed; haven't pinned down what 'done' actually means per task."}
The per-task DoD hasn't been pinned down.
Per task: not 'it works' but what-specifically-true / what-can-be-checked / what-exists-that-didn't.
{R4_CLOSE}`,
    },
    {
      option: 'Go through the tasks for this project and for each one, write what \'done\' means — the specific thing you\'d check to know it\'s complete. No vague descriptions, just the actual finish line.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "DoD per task not written."}
The DoD-per-task walkthrough hasn't been done.
Specific thing-to-check per task — actual finish line, not vague.
{R4_CLOSE}`,
    },
    {
      option: 'Pick the most important task for this project and tell me exactly what done looks like for it — what\'s been built, what\'s been tested, what\'s been verified. Use that as a template to define done for the remaining tasks in this project.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "DoD not pinned for most important task."}
The most-important-task DoD hasn't been pinned.
Built / tested / verified — use as template for remaining.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What does done look like for each task in this project? Write a one-liner for each that describes the specific finish line.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks listed."}
Lighter: per-task one-liner finish line.
{R4_CLOSE}`,
    },
    {
      option: 'Is there any task in this project where it\'s not clear how we\'d know it\'s done? Define the finish line for that one first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks listed."}
Narrower: DoD-unclear task + define-first.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'How do we know when the first task in this project is done?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks listed."}
Minimum next step: how to know first task is done.
{R4_CLOSE}`,
    },
  ],
};

// Group C — feedback_loop signals
export const ABSENCE_USER_FEEDBACK_REVIEW: DecisionContent = {
  signalType:   "ABSENCE_USER_FEEDBACK_REVIEW",
  question:      'Feedback received — has it been reviewed systematically?',
  pinchFallback: 'Feedback not reviewed.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_USER_FEEDBACK_REVIEW'],
  L1: [
    {
      option: 'Review the feedback received for this project systematically: collect all available feedback, categorize it by theme or feature area, and identify the recurring complaints, requests, and points of confusion that appear across multiple users.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feedback received; not reviewed systematically."}
User feedback hasn't been reviewed systematically — recurring complaints, blockers, and pattern signals risk being missed without categorisation.
Collect / categorise by theme/feature / surface recurring complaints / requests / confusion points.
{R4_CLOSE}`,
    },
    {
      option: 'Analyze the feedback for this project for patterns: what issues surface most frequently, which complaints indicate users cannot complete their primary goal, and where does actual behavior diverge most from what was expected?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Pattern analysis on feedback not done."}
Feedback pattern analysis hasn't been done.
Most-frequent issues / cannot-complete-primary-goal complaints / behavior-vs-expected divergence.
{R4_CLOSE}`,
    },
    {
      option: 'Prioritize the feedback for this project by impact: distinguish critical feedback (blocking users from their goal) from high-friction feedback (users struggle but succeed) from low-signal noise, and establish which issues demand immediate action.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Impact prioritisation on feedback not done."}
The impact prioritisation of feedback hasn't been done.
Distinguish: critical (blocking) / high-friction (succeed-with-pain) / low-signal noise.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the most critical piece of feedback for this project — the one issue that, if left unaddressed, blocks users from achieving their primary goal?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feedback in."}
Lighter: most critical feedback — primary-goal blocker.
{R4_CLOSE}`,
    },
    {
      option: 'What are the top two or three recurring themes across all feedback for this project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feedback in."}
Narrower: top 2-3 recurring themes.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What are users saying about this project, and what is the most critical issue in the feedback?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feedback in."}
Minimum next step: what users say + most critical issue.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_USER_FEEDBACK_REVIEW_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_USER_FEEDBACK_REVIEW",
  question:      'Feedback in — have we actually gone through it?',
  pinchFallback: 'Feedback not reviewed.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_USER_FEEDBACK_REVIEW'],
  L1: [
    {
      option: 'Go through the feedback for this project — collect what users have said, group it by theme, and tell me what comes up over and over. What are the most common complaints or requests?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feedback in; I haven't actually gone through it systematically."}
The systematic walk-through of feedback hasn't been done.
Collect / group by theme / surface common complaints+requests.
{R4_CLOSE}`,
    },
    {
      option: 'What patterns are you seeing in the feedback for this project? Walk me through what users are saying — what are the recurring issues, and where are people getting stuck?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feedback patterns not surfaced."}
Feedback-pattern walk-through hasn't been done.
Recurring issues / where people get stuck.
{R4_CLOSE}`,
    },
    {
      option: 'Look at the feedback for this project and rank it — what\'s critical (users can\'t do what they need to do), what\'s high friction (they get there but it\'s painful), and what\'s just noise? Tell me what needs to be fixed first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feedback ranking not done."}
The feedback ranking hasn't been done.
Critical / high-friction / noise — fix-first call.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the most critical piece of feedback for this project — the one thing that, if we don\'t fix it, blocks users from doing what they came here to do?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feedback in."}
Lighter: most critical feedback — the blocker if unfixed.
{R4_CLOSE}`,
    },
    {
      option: 'What are the top two or three things users keep saying about this project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feedback in."}
Narrower: top 2-3 things users keep saying.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What are users saying about this project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feedback in."}
Minimum next step: what users are saying.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_ITERATION_PLANNING: DecisionContent = {
  signalType:   "ABSENCE_ITERATION_PLANNING",
  question:      'Feedback reviewed — has the next iteration been planned?',
  pinchFallback: 'Next iteration unplanned.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ITERATION_PLANNING'],
  L1: [
    {
      option: 'Define the priorities for the next iteration of this project based on the feedback: rank the issues identified, determine what must be addressed in this iteration versus what can be deferred, and establish the scope of the next version.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feedback reviewed; next iteration not planned."}
The next iteration hasn't been planned from feedback — without prioritised changes and success criteria, the next round risks repeating prior gaps.
Rank feedback / this-iteration vs deferred / scope of next version.
{R4_CLOSE}`,
    },
    {
      option: 'Identify the trade-offs for the next iteration of this project: which feedback-driven changes deliver the highest impact for the lowest effort, which require significant rework, and what should be deferred to preserve shipping velocity?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Iteration trade-offs not identified."}
Iteration trade-offs haven't been identified.
Highest impact/lowest effort / significant rework / defer-to-preserve-velocity.
{R4_CLOSE}`,
    },
    {
      option: 'Write the success criteria for the next iteration of this project: given the feedback received, what specific, measurable outcomes would confirm the next iteration resolved the most critical user issues?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Iteration success criteria not written."}
Iteration success criteria haven't been written.
Specific measurable outcomes confirming the most critical issues are resolved.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What are the top three changes to make in the next iteration of this project, ordered by priority? Identify them from the feedback.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feedback reviewed."}
Lighter: top 3 next-iteration changes — feedback-derived, priority-ordered.
{R4_CLOSE}`,
    },
    {
      option: 'What is the single most important thing to build or fix in the next iteration of this project, and why does it take priority over everything else?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feedback reviewed."}
Narrower: single most important next-iteration item + why-priority.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is the first change to make in the next iteration of this project based on what users said?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feedback reviewed."}
Minimum next step: first feedback-derived change.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_ITERATION_PLANNING_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_ITERATION_PLANNING",
  question:      'Feedback reviewed — what are we building next?',
  pinchFallback: 'Next iteration unplanned.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ITERATION_PLANNING'],
  L1: [
    {
      option: 'Figure out what to build next for this project based on the feedback — what needs to be fixed or added in the next round, what can wait, and what\'s the scope of the next version?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feedback reviewed; what to build next is not pinned."}
The next-round build pinning hasn't been done.
What to fix/add next / what can wait / scope of next version.
{R4_CLOSE}`,
    },
    {
      option: 'Look at the feedback for this project and tell me what the trade-offs are for the next round — what\'s high impact and quick to do, what\'s a big change that needs more thought, and what should we hold off on?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Next-round trade-offs not surfaced."}
Next-round trade-off analysis hasn't been done.
High-impact-quick / big-change-needs-thought / hold-off items.
{R4_CLOSE}`,
    },
    {
      option: 'What does success look like for the next version of this project? Given what users said, what specific things would tell us the next iteration actually fixed the problems?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Next-version success criteria unclear."}
The next-version success-criteria sketch hasn't been done.
Specific things that would tell us the next iteration actually fixed the problems.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What are the top three things to work on next for this project based on the feedback? Put them in priority order.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feedback reviewed."}
Lighter: top 3 next-items priority-ordered.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the single most important thing to fix or build next for this project, and why does it come first?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feedback reviewed."}
Narrower: single most important next + why-first.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s the first thing to build or fix in the next version of this project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feedback reviewed."}
Minimum next step: first next-version item.
{R4_CLOSE}`,
    },
  ],
};

// ── Sub-7 — formal content sets ───────────────────────────────────────────────
export const ABSENCE_SCOPE_CREEP: DecisionContent = {
  signalType:   "ABSENCE_SCOPE_CREEP",
  question:      'Scope expanding — still on original plan?',
  pinchFallback: 'Scope check?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SCOPE_CREEP'],
  L1: [
    {
      option: 'Audit what was just built against the original scope for this iteration: list what is complete, what is still in progress, and what has been added that was not in the original plan — and decide whether each addition stays in scope, gets deferred, or gets cut.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Build progressed; original-scope audit not done."}
What was built hasn't been audited against the original scope — additions that crept in haven't been resolved keep / defer / cut.
Audit: complete / in-progress / unplanned additions — per-addition decision.
{R4_CLOSE}`,
    },
    {
      option: 'List every behaviour and feature added to this feature since implementation began — for each item, confirm whether it was in the agreed scope or was introduced along the way, and make a call: keep it, defer it, or cut it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Per-addition keep/defer/cut call not made."}
The per-addition keep/defer/cut audit hasn't been done.
List behaviours+features added since start / agreed-scope vs introduced-along-way / per-item call.
{R4_CLOSE}`,
    },
    {
      option: 'Write a scope summary for this project before continuing: what was the original plan for this iteration, what is now in the implementation, and what is the delta — treat anything outside the original plan as a decision that must be made now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Scope-delta summary not written."}
The scope-delta summary hasn't been written.
Original plan / current state / delta — delta items are decisions now.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What was the original scope for this feature, and does the current implementation match it — or has it grown beyond the plan?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Build progressed."}
Lighter: original scope vs current — match or grown?
{R4_CLOSE}`,
    },
    {
      option: 'What is the most important addition to what was just built that was not in the original scope — and what is the decision on it: in, deferred, or cut?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Build progressed."}
Narrower: most important unplanned addition + in/deferred/cut decision.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is one thing currently in this feature that was not in the original scope for this session?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Build progressed."}
Minimum next step: one item in feature not in original-scope.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_FEATURE_SCOPE: DecisionContent = {
  signalType:   "ABSENCE_FEATURE_SCOPE",
  question:      'Feature started — Definition of Ready confirmed?',
  pinchFallback: 'Scope this first.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_FEATURE_SCOPE'],
  L1: [
    {
      option: 'Define the scope and acceptance criteria for this feature before implementation continues: what is the feature doing, what are the explicit out-of-scope items, and what conditions must be true for the feature to be accepted as done? This is the Definition of Ready for sprint planning.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature started; Definition of Ready not confirmed."}
Definition of Ready / acceptance criteria for this feature haven't been written — implementation is proceeding without a written target.
Define: what feature does / explicit out-of-scope / acceptance-as-done conditions.
{R4_CLOSE}`,
    },
    {
      option: 'Write a feature specification before proceeding: intended behaviour, input/output contract, acceptance criteria (at least 3 scenarios covering happy path and key edge cases), and explicit scope boundaries. Implementation without this is a Definition of Ready violation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature spec not written."}
The feature spec hasn't been written.
Intended behaviour / IO contract / 3+ acceptance scenarios (happy + edge) / scope boundaries.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm the feature scope: given what has been built so far in this session, is there a written definition of what the feature does and how it will be accepted? If not, define it now — spec the behaviour before writing more code.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature-scope cross-confirm not done."}
Feature-scope cross-confirmation hasn't been done.
Written definition: what does it do / acceptance — spec before more code.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'State the acceptance criteria for this feature: what specific conditions must be true for this feature to be considered complete and ready for review?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature in progress."}
Lighter: acceptance criteria — complete-and-ready-for-review conditions.
{R4_CLOSE}`,
    },
    {
      option: 'Define the scope boundary: what does this feature do, and what is explicitly deferred or out of scope? One paragraph before continuing implementation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature in progress."}
Narrower: scope boundary — what does / deferred / out-of-scope.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What are the acceptance criteria for this feature? List them before adding more code.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature in progress."}
Minimum next step: list acceptance criteria before more code.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_IMPLEMENTATION_CHECKPOINT: DecisionContent = {
  signalType:   "ABSENCE_IMPLEMENTATION_CHECKPOINT",
  question:      'Implementation continued — current state verified?',
  pinchFallback: 'Verify first.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_IMPLEMENTATION_CHECKPOINT'],
  L1: [
    {
      option: 'Run an implementation checkpoint before continuing: verify the last unit of work is in a passing state — either by running the relevant tests or by manually tracing the main path through the recently added code. Per TDD Red-Green-Refactor practice, only continue building once the current state is green.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation continued; current state not verified."}
The last unit of work hasn't been verified before continuing — layering changes on an unverified base compounds debugging cost.
Verify: run tests or manually trace main path / continue only when green.
{R4_CLOSE}`,
    },
    {
      option: 'Apply the TDD feedback loop to the last change: does what was just built satisfy its stated requirement? Trace the code path, run the tests if they exist, and confirm the current state is working before layering the next change on top of it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "TDD feedback loop on last change not applied."}
The TDD feedback loop on the last change hasn't been applied.
Trace path / run tests if exist / confirm working before next layer.
{R4_CLOSE}`,
    },
    {
      option: 'Checkpoint the implementation before proceeding: what is the current state — working, broken, or untested? Identify the specific condition that confirms this unit of work is done and verify it now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation state not labeled."}
The implementation-state label hasn't been applied.
Working / broken / untested — identify done-condition and verify now.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Before the next implementation step — does the current build pass? Run existing tests or manually verify the most recent change against its requirements.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation continued."}
Lighter: build pass check — run tests or manually verify last change.
{R4_CLOSE}`,
    },
    {
      option: 'What was the last thing built, and is it verified to work? Run the tests or do a quick manual trace before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation continued."}
Narrower: last-thing-built + verified-or-not.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Verify the last change works before adding the next one — run tests or manually confirm the current build is functional.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation continued."}
Minimum next step: verify last change before next.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SPEC_BEFORE_CODE: DecisionContent = {
  signalType:   "ABSENCE_SPEC_BEFORE_CODE",
  question:      'Implementation started — behaviour specified first?',
  pinchFallback: 'Spec before code.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SPEC_BEFORE_CODE'],
  L1: [
    {
      option: 'Write a behaviour specification before continuing implementation: using BDD Given/When/Then format, define at least the primary scenario — Given [context], When [action], Then [expected outcome]. Per spec-driven development practice, the specification is the source of truth; code is the verification.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation started; behaviour spec not written."}
Behaviour spec for what is being built hasn't been written — code is being produced without a Given/When/Then or equivalent target to verify against.
Write at minimum the primary Given/When/Then scenario — spec is source of truth, code is verification.
{R4_CLOSE}`,
    },
    {
      option: "Define the acceptance criteria for what is being built before writing more code: what specific behaviour must be true for this implementation to be considered correct? Per Dan North's BDD principle: 'a story's behaviour is simply its acceptance criteria' — write them before you implement.",
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Acceptance criteria not defined pre-code."}
Acceptance criteria for the current implementation unit haven't been defined before code.
What specific behaviour must be true for correctness — write before implementing.
{R4_CLOSE}`,
    },
    {
      option: 'Apply spec-first discipline to the current implementation unit: write the expected behaviour (inputs, process, outputs, error cases) before continuing. This is the boundary between planning and execution — the spec defines the target, implementation verifies against it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Spec-first discipline not applied."}
Spec-first discipline hasn't been applied to the current implementation unit.
Inputs / process / outputs / error cases — spec is the target, implementation verifies.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Write the Given/When/Then scenario for what is being built before adding more code: what context, what action, and what expected outcome?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation in progress."}
Lighter: G/W/T scenario — context / action / outcome.
{R4_CLOSE}`,
    },
    {
      option: 'Define the expected behaviour of this implementation unit before continuing: what must be true for this to be considered correct?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation in progress."}
Narrower: expected behaviour — what-must-be-true-for-correct.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Write one Given/When/Then scenario for what is being built before the next implementation step.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation in progress."}
Minimum next step: one G/W/T scenario before next step.
{R4_CLOSE}`,
    },
  ],
};

// ── Sub-7 — casual content sets ───────────────────────────────────────────────
export const ABSENCE_SCOPE_CREEP_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_SCOPE_CREEP",
  question:      'Scope expanding — still on original plan?',
  pinchFallback: 'Scope check?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SCOPE_CREEP'],
  L1: [
    {
      option: 'Take a look at what was just built and compare it to what you originally set out to do — is anything in there that wasn\'t part of the plan? Go through it and flag any extras before adding more.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been building; haven't compared to the original plan."}
The compare-to-original-plan check hasn't been done.
Look at what's built vs original / flag extras before adding more.
{R4_CLOSE}`,
    },
    {
      option: 'Think about what this feature was supposed to do when you started — has anything crept in that wasn\'t in the original idea? Go through it and decide what to keep, what to push to later, and what to drop.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Crept-in items not surfaced."}
The crept-in audit hasn't been done.
Original idea vs now / keep / push later / drop.
{R4_CLOSE}`,
    },
    {
      option: 'Before going further with this project — list what you originally planned to build this session and what\'s actually in there now. For anything extra, make a call: now, later, or never.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Original-vs-now list not made."}
The original-vs-now list hasn't been made.
Originally planned vs actually in / extras → now/later/never.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What did you originally set out to build in this feature, and does what\'s there now actually match that — or has it grown?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Build progressed."}
Lighter: originally-set-out vs now — match or grown.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the most important thing added to what was just built that wasn\'t part of the original plan — and what are you going to do with it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Build progressed."}
Narrower: most important unplanned addition + your call.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s one thing in this feature that ended up there but wasn\'t in the original plan?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Build progressed."}
Minimum next step: one not-in-original item.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_FEATURE_SCOPE_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_FEATURE_SCOPE",
  question:      'Started building — is scope defined?',
  pinchFallback: 'What\'s in scope?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_FEATURE_SCOPE'],
  L1: [
    {
      option: 'Before going further — write a quick scope statement for this feature: what it does, what it doesn\'t do, and what done looks like. One paragraph is enough. This prevents mid-build scope drift.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Started building; no scope statement yet."}
The quick scope statement hasn't been written.
What it does / doesn't do / what done looks like — one paragraph.
{R4_CLOSE}`,
    },
    {
      option: 'Quick scope check: what exactly is this feature supposed to do, and what would confirm it\'s working correctly? Define the boundaries before continuing — it saves rework.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Scope boundaries unclear."}
The quick scope check hasn't been done.
What it does / what confirms it's working / define boundaries.
{R4_CLOSE}`,
    },
    {
      option: 'Write a one-sentence definition of done for this feature before the next prompt. What needs to be true for this to be \'finished\' — not perfect, just done?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "DoD for feature unwritten."}
The one-sentence DoD hasn't been written.
What needs to be true for finished — not perfect, just done.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What are the 2-3 things this feature must do to be considered complete? List them before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature in progress."}
Lighter: 2-3 must-do-for-complete items.
{R4_CLOSE}`,
    },
    {
      option: 'Scope check: what is this feature doing, and what is it explicitly NOT doing? Quick answer before next step.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature in progress."}
Narrower: doing vs explicitly-not-doing.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What does \'done\' look like for this feature? One sentence before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature in progress."}
Minimum next step: one-sentence done.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_IMPLEMENTATION_CHECKPOINT",
  question:      'Kept building — is the last change verified?',
  pinchFallback: 'Checkpoint.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_IMPLEMENTATION_CHECKPOINT'],
  L1: [
    {
      option: 'Quick checkpoint before continuing — does what was last built actually work end to end? Try running it or walk through the main path manually. If it\'s broken, fix it now before the next change makes the bug harder to locate.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Kept building; I haven't checked the last thing works."}
The quick-checkpoint hasn't been done.
Run it or walk through manually / fix before next change layers a harder-bug.
{R4_CLOSE}`,
    },
    {
      option: 'Smoke test the last change before adding more: what\'s the simplest way to verify it works right now? Run it or try the main path and report what you get.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Smoke-test on last change not done."}
The smoke test hasn't been done.
Simplest verification / report what you get.
{R4_CLOSE}`,
    },
    {
      option: 'Before moving to the next feature — does everything built so far still work? Quick manual check: try the main flow and flag anything that looks off.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Pre-next-feature still-works check not done."}
The pre-next-feature still-works check hasn't been done.
Quick manual: try main flow / flag anything off.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does the last change work? Run it or try it manually before continuing — one quick verification before the next prompt.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Kept building."}
Lighter: last change verification before next prompt.
{R4_CLOSE}`,
    },
    {
      option: 'Checkpoint: what\'s the most recent thing that was built, and does it actually work? Verify before adding anything else.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Kept building."}
Narrower: most recent thing + works-or-not.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Does what was last built work? Quick try before the next step.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Kept building."}
Minimum next step: quick try of last.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SPEC_BEFORE_CODE_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_SPEC_BEFORE_CODE",
  question:      'Building this — behaviour defined first?',
  pinchFallback: 'Spec it first.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SPEC_BEFORE_CODE'],
  L1: [
    {
      option: 'Before writing more code — write a quick behaviour spec: what inputs does this take, what should it do, and what output or side effect should it produce? One paragraph is enough. Spec before code avoids building the wrong thing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building this; haven't spec'd the behaviour first."}
The quick behaviour spec hasn't been written.
Inputs / what it does / output or side effect — one paragraph.
{R4_CLOSE}`,
    },
    {
      option: 'Define the expected behaviour before implementing: given X (the context), when Y (the trigger), then Z (the outcome). Even one sentence of Given/When/Then saves more time than it takes to write.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "G/W/T not written."}
The G/W/T sentence hasn't been written.
Given X / When Y / Then Z.
{R4_CLOSE}`,
    },
    {
      option: 'Quick spec before continuing: what is this code supposed to DO? Not how — what. Describe the behaviour in plain terms, then implement against that description.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Quick spec unwritten."}
The quick what-it-does-spec hasn't been written.
What (not how) in plain terms / implement against it.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What should this do? Describe the expected behaviour in one or two sentences before writing the implementation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this."}
Lighter: 1-2 sentence expected-behaviour.
{R4_CLOSE}`,
    },
    {
      option: 'Spec this out before coding it: what\'s the input, what happens, what\'s the expected output? Quick answer first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this."}
Narrower: input / happens / expected output.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is this supposed to do? One sentence spec before the next prompt.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this."}
Minimum next step: one-sentence spec before next prompt.
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 5 D1 — incremental_build (CASUAL + FORMAL registers) ────────────────
export const ABSENCE_INCREMENTAL_BUILD_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_INCREMENTAL_BUILD",
  question:      'Building incrementally — verifying between steps?',
  pinchFallback: 'Verify between steps.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_INCREMENTAL_BUILD'],
  L1: [
    {
      option: 'Between each change — stop and verify what was just built actually works before adding the next layer. Debugging compound changes is harder than debugging one change at a time.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been stacking changes without verifying between them."}
The between-changes verification hasn't been done.
Stop / verify / then add next — one-at-a-time debugging is faster.
{R4_CLOSE}`,
    },
    {
      option: 'Before moving to the next part of the implementation — try what was just built. If it\'s broken, fix it now. Layering changes on top of a broken base will cost more time than the verification takes.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Layering changes without verifying base."}
The pre-next-part verification hasn't been done.
Try what was built / fix if broken / no-layering-on-broken-base.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the last thing that was built, and has it been verified as working? If not, verify before adding more. Incremental verification is faster than debugging a pile of changes at once.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Last-thing-built verification not done."}
The last-thing-built verification hasn't been done.
What was last / verified or not / verify-before-more.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Has what was just built been tested before continuing? Quick verification now is faster than debugging later.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building incrementally."}
Lighter: tested-before-continuing check.
{R4_CLOSE}`,
    },
    {
      option: 'Is each piece being verified as done before the next is added, or are multiple changes being stacked before any are checked?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building incrementally."}
Narrower: per-piece verified vs stacked-without-check.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is what was last built working and verified before adding the next change?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building incrementally."}
Minimum next step: last-built working+verified before next.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_INCREMENTAL_BUILD: DecisionContent = {
  signalType:   "ABSENCE_INCREMENTAL_BUILD",
  question:      'Incremental build — is each step verified before the next?',
  pinchFallback: 'Verify before proceeding.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_INCREMENTAL_BUILD'],
  L1: [
    {
      option: 'Review the build cadence: is each incremental change being verified before the next is added? Compounding unverified changes increases debugging complexity — verify at each increment.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Build cadence; incremental verification not happening."}
Verification between increments hasn't been done — multiple changes are stacking without intermediate confirmation, increasing rework risk.
Verify at each increment — compounding unverified changes raises debugging complexity.
{R4_CLOSE}`,
    },
    {
      option: 'Audit the current state: what was the last change made, and has it been confirmed working? If not, verify before continuing — a clean failing test is faster to diagnose than multiple layered failures.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Last-change confirmation not done."}
The last-change confirmation hasn't been done.
What was last / confirmed working / verify before continuing — one failing test diagnoses faster than layered.
{R4_CLOSE}`,
    },
    {
      option: 'Check whether the implementation is proceeding incrementally with verification gates, or whether multiple changes are being stacked without intermediate confirmation. The latter increases rework risk significantly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Incremental-vs-stacked pattern not audited."}
The incremental-vs-stacked audit hasn't been done.
Verification gates present? Or stacked without confirmation? Latter significantly increases rework.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is each increment being verified before the next change is added? Identify the last unverified change and confirm it before proceeding.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Build cadence."}
Lighter: increment verification + identify last unverified.
{R4_CLOSE}`,
    },
    {
      option: 'What is the current state of the build? Which pieces have been verified as working and which have not?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Build cadence."}
Narrower: verified-vs-unverified inventory.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Has the most recent change been verified as working before the next one is introduced?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Build cadence."}
Minimum next step: most-recent change verified before next.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_PHASE_TRANSITION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_PHASE_TRANSITION",
  question:      'Been in this phase a while — what comes next?',
  pinchFallback: 'Phase check.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_PHASE_TRANSITION'],
  L1: [
    {
      option: '1. Think about what phase of development this project is currently in.\n2. Share with me: have you finished what you set out to do in this phase, or are you still in the middle of it?\n3. Then tell me: what needs to be done before it makes sense to move on to the next phase?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long time in this phase; I haven't paused to check where we actually are."}
The phase-status check hasn't been done.
Walk me through: current phase / done or still mid / what's left before moving on.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through where this project stands right now — are you still in the middle of the current phase, or have you finished it without realising it? Share what still needs to be done before moving on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long phase; where-we-stand walk-through not done."}
Same moment, simpler: where we stand / mid or finished / what's left.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in this project that needs to be finished or decided before moving to the next phase? Share what you think is still missing with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long phase."}
Lighter: anything still needed before next phase — share what's missing.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is this project ready to move to the next phase, or are there things that should be finished first?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long phase."}
Minimum next step: ready or things-to-finish-first?
{R4_CLOSE}`,
    },
  ],
};

// ── Sub-4 — idea / task_breakdown / feedback_loop ─────────────────────────────
// Group A — idea signals (beginner)
export const ABSENCE_IDEA_SCOPING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_IDEA_SCOPING",
  question:      'Idea forming — what exactly are we building?',
  pinchFallback: 'Scope unclear.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_IDEA_SCOPING'],
  L1: [
    {
      option: '1. Help me describe this project in plain words — what it does and what problem it solves.\n2. Share your description with me before we go further so I can check it sounds right.\n3. Then tell me: is there anything about what we\'re building that\'s still unclear or not decided yet?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I'm forming an idea but haven't described it in plain words yet."}
The plain-words description hasn't been done.
Walk me through: what it does / what problem it solves / what's still unclear.
{R4_CLOSE}`,
    },
    {
      option: 'Describe this project in plain language — what it does, what problem it solves, and what we\'re building first. Share your answer with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; plain-language description not done."}
Same moment, simpler: plain-language description — what / problem / building first.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Describe this project to me in two sentences: what it does, and what it\'s for. Share it with me before we move on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Lighter: 2-sentence description — what + what for.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is it clear what this project is and what it\'s supposed to do?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Minimum next step: is it clear what / what for?
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_IDEA_CONSTRAINT_CHECK_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_IDEA_CONSTRAINT_CHECK",
  question:      'Idea forming — what\'s out of scope?',
  pinchFallback: 'No non-goals set.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_IDEA_CONSTRAINT_CHECK'],
  L1: [
    {
      option: '1. Think about this project — what is it NOT going to do?\n2. Share a list of at least two things we\'re leaving out of this project on purpose, even if they seem obvious.\n3. Then tell me: why is it helpful to say those things out loud now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; will-not-do list not made."}
The will-not-do list hasn't been made.
Walk me through: 2+ deliberate omissions / why saying them out loud helps now.
{R4_CLOSE}`,
    },
    {
      option: 'Help me list the things this project is NOT going to do — at least two. Share the list with me before we go further.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; will-not-do list not shared."}
Same moment, simpler: 2+ will-not-do items shared back.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s one thing this project won\'t do? Share your answer with me and tell me why it\'s good to state that now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Lighter: one won't-do + why-state-now.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything this project won\'t do that we haven\'t said out loud yet?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Minimum next step: any will-not-do still unsaid.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_IDEA_USER_DEFINITION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_IDEA_USER_DEFINITION",
  question:      'Idea forming — who is this actually for?',
  pinchFallback: 'User not defined.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_IDEA_USER_DEFINITION'],
  L1: [
    {
      option: '1. Think about who will use this project — who is the main person it\'s for?\n2. Share a description of that person with me: who they are and what they\'re trying to do.\n3. Then tell me: what does that mean for how we build this project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; main-user description not done."}
The main-user description hasn't been done.
Walk me through: who / what they're trying to do / what that means for how we build.
{R4_CLOSE}`,
    },
    {
      option: 'Describe the person who will use this project in plain words — who they are and what they need it to do. Share your description with me before we go further.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; plain-words user description not shared."}
Same moment, simpler: plain-words who-they-are and what-they-need.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Who is this project for? Describe that person to me in a sentence or two, then share it with me so I can check it sounds right.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Lighter: 1-2 sentence user description shared back.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is it clear who this project is for and what they\'re trying to do?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Minimum next step: is it clear who + trying-to-do?
{R4_CLOSE}`,
    },
  ],
};

// Group B — task_breakdown signals (beginner)
export const ABSENCE_TASK_ORDERING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_TASK_ORDERING",
  question:      'Tasks listed — what order do we do them in?',
  pinchFallback: 'No order set.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_TASK_ORDERING'],
  L1: [
    {
      option: '1. Look at the tasks for this project.\n2. Share with me: which one should we do first, and which ones can\'t be done until something else is finished?\n3. Then tell me: what\'s the order we should follow to build this?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I have tasks but haven't put them in order yet."}
The task ordering hasn't been done.
Walk me through: which first / which can't start yet / overall order to follow.
{R4_CLOSE}`,
    },
    {
      option: 'Put the tasks for this project in order — which one goes first? Share the order with me before we start building.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Tasks unordered."}
Same moment, simpler: order them — which first — share before building.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the first task to work on for this project? Tell me what it is and why it should come first, then share it with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks unordered."}
Lighter: first task + why-first — share it.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is the order of tasks for this project clear, or does anything still need to be sorted out?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks unordered."}
Minimum next step: order clear or still to sort?
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_TASK_SIZING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_TASK_SIZING",
  question:      'Tasks listed — are they small enough to do in one go?',
  pinchFallback: 'Tasks too big.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_TASK_SIZING'],
  L1: [
    {
      option: '1. Look at the tasks for this project.\n2. Share with me: is there any task that feels too big to finish in one sitting?\n3. Then tell me: how would you split that task into smaller pieces that are easier to finish one at a time?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I haven't checked if any tasks feel too big to finish in one sitting."}
The too-big-to-finish-in-one-sitting check hasn't been done.
Walk me through: any too-big / split it into easier-one-at-a-time pieces.
{R4_CLOSE}`,
    },
    {
      option: 'Are any tasks in this project too big to do in one session? Share which ones feel too large, and let\'s figure out how to break them down.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Task sizing not checked."}
Same moment, simpler: which feel too large + break-down plan.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Pick the biggest task for this project. Share it with me, and then tell me how you\'d split it into smaller steps that could each be finished in one sitting.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks defined."}
Lighter: biggest task + split-into-single-sitting-steps.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Are all the tasks for this project small enough to finish one at a time, or do any of them need to be broken down more?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks defined."}
Minimum next step: all small enough vs any-needing-break-down.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_TASK_DEFINITION_OF_DONE_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_TASK_DEFINITION_OF_DONE",
  question:      'Tasks set — how do we know when each one\'s done?',
  pinchFallback: 'Done criteria missing.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_TASK_DEFINITION_OF_DONE'],
  L1: [
    {
      option: '1. Pick one task from this project.\n2. Share with me: how would you know when that task is finished? What would you check?\n3. Then do the same for each of the other tasks — for each one, tell me what \'done\' looks like.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I have tasks but haven't said per task how I'd know each is done."}
The per-task done-check hasn't been pinned.
Walk me through: pick one / how to know finished / what to check / repeat for each.
{R4_CLOSE}`,
    },
    {
      option: 'For each task in this project, help me write one sentence about what \'done\' means — something you could check to know the task is finished. Share the list with me when you\'re done.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Per-task DoD list not written."}
Same moment, simpler: per-task one-sentence DoD list — checkable.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Pick the first task for this project and tell me: how would you know it\'s finished? Share your answer with me before we start building.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks defined."}
Lighter: first-task DoD before building.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is it clear how we\'ll know when each task in this project is done?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks defined."}
Minimum next step: per-task done clarity check.
{R4_CLOSE}`,
    },
  ],
};

// Group C — feedback_loop signals (beginner)
export const ABSENCE_USER_FEEDBACK_REVIEW_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_USER_FEEDBACK_REVIEW",
  question:      'Feedback in — have we actually gone through it?',
  pinchFallback: 'Feedback not reviewed.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_USER_FEEDBACK_REVIEW'],
  L1: [
    {
      option: '1. Look at the feedback users have given about this project.\n2. Share with me: what are the most common things people are saying? What keeps coming up?\n3. Then tell me: what\'s the one piece of feedback that feels most important to address?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feedback in; I haven't gone through it yet."}
The feedback walk-through hasn't been done.
Walk me through: most common + most important to address.
{R4_CLOSE}`,
    },
    {
      option: 'Go through the feedback for this project and share what you find — what are users saying? Pick the most important thing they mentioned and tell me what it is.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feedback not gone through."}
Same moment, simpler: what users say + most important mention.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the most important piece of feedback about this project? Share it with me and tell me why it matters.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feedback in."}
Lighter: most important feedback + why-matters.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Have you gone through the feedback for this project yet, or is that still to do?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feedback in."}
Minimum next step: gone-through or still-to-do?
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_ITERATION_PLANNING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_ITERATION_PLANNING",
  question:      'Feedback reviewed — what are we building next?',
  pinchFallback: 'Next iteration unplanned.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ITERATION_PLANNING'],
  L1: [
    {
      option: '1. Look at the feedback for this project.\n2. Share with me: what\'s the most important thing users want fixed or added?\n3. Then tell me: what would you work on first in the next version, and why?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feedback in; haven't decided what to build next."}
The what-to-build-next decision hasn't been made.
Walk me through: most important user ask + what to work on first + why.
{R4_CLOSE}`,
    },
    {
      option: 'Based on what users said about this project, what do you want to fix or build next? Share your top pick with me before we start planning.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Top next-iteration pick not shared."}
Same moment, simpler: top next-iteration pick shared before planning.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the first thing to fix or build in the next version of this project based on the feedback? Share your answer with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feedback in."}
Lighter: first next-version item from feedback.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is it clear what to work on next for this project based on what users said?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feedback in."}
Minimum next step: clear-what-next or still-deciding?
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 5 D1-D3 — beginner signals (BEGINNER register) ─────────────────────
export const ABSENCE_INCREMENTAL_BUILD_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_INCREMENTAL_BUILD",
  question:      'Building something — verifying each piece as you go?',
  pinchFallback: 'One piece at a time.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_INCREMENTAL_BUILD'],
  L1: [
    {
      option: '1. Before adding the next thing — quickly test what was just built.\n2. Share with me: does it do what you expected, or is something off?\n3. Then tell me: is it safe to move on, or should we fix something first?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building piece by piece; I haven't tested the last piece yet."}
The pre-next-piece test hasn't been done.
Walk me through: quick test / works-as-expected or off / safe-to-move-on or fix-first.
{R4_CLOSE}`,
    },
    {
      option: 'Test the part that was just built before adding anything else — tell me if it works the way you expected, and share what you find.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Last-piece test not done."}
Same moment, simpler: test last piece / share findings.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does what was just built work the way it should? Try it and tell me before we add anything else.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building piece by piece."}
Lighter: try-it-before-more.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is what was just built working before we continue?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building piece by piece."}
Minimum next step: working-before-continuing check.
{R4_CLOSE}`,
    },
  ],
};

// ── Sub-7 — beginner content sets ─────────────────────────────────────────────
export const ABSENCE_SCOPE_CREEP_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_SCOPE_CREEP",
  question:      'Scope expanding — still on original plan?',
  pinchFallback: 'Scope check?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SCOPE_CREEP'],
  L1: [
    {
      option: '1. Look at what was just built and make a list of everything it does now. 2. Compare that list to what you originally planned to build. 3. Share anything that wasn\'t in the original plan with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I haven't checked whether anything extra got added beyond the original plan."}
The original-plan-vs-now check hasn't been done.
Walk me through: list of what it does now / compare to original / share extras.
{R4_CLOSE}`,
    },
    {
      option: 'Go through this feature and check — did anything extra get added that wasn\'t part of the original plan? Share what you find with me before we keep going.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Extras-check not done."}
Same moment, simpler: extras-check shared before continuing.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in this feature that you didn\'t originally plan to build? Tell me what it is and we\'ll decide what to do with it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Build progressed."}
Lighter: any unplanned items — decide together.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Can you name one thing in this feature that ended up there but wasn\'t part of the original plan?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Build progressed."}
Minimum next step: name one extra item.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_FEATURE_SCOPE_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_FEATURE_SCOPE",
  question:      'Building this — what should it actually do?',
  pinchFallback: 'Scope first.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_FEATURE_SCOPE'],
  L1: [
    {
      option: '1. Before we keep going — help me describe in plain words what this part of the app should do and what \'finished\' looks like for it.\n2. Share that back with me so we\'re both on the same page.\n3. Then tell me: is there anything about what I want that is still unclear to you?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building this part of the app but I haven't said clearly what it should do."}
The plain-words description + finished-state hasn't been done.
Walk me through: what it should do / what finished looks like / what's still unclear.
{R4_CLOSE}`,
    },
    {
      option: 'Help me write one sentence about what we\'re building right now and how I\'d know it\'s done — then share it with me before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "What we're building + done-check unwritten."}
Same moment, simpler: one-sentence what + how-I'd-know-done.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the one thing this part of the app is supposed to do — and how will I know when it\'s working the way I want? Share your answer with me first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature in progress."}
Lighter: one thing it does + how-I'd-know-working.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'In plain words — what exactly are we building here and how will we know it\'s done?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature in progress."}
Minimum next step: plain-words what + how-done.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_IMPLEMENTATION_CHECKPOINT_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_IMPLEMENTATION_CHECKPOINT",
  question:      'Built something new — does it actually work?',
  pinchFallback: 'Quick check.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_IMPLEMENTATION_CHECKPOINT'],
  L1: [
    {
      option: '1. Before adding anything else — can you quickly try out what was just built?\n2. Tell me: does it do what we expected, or is something not working yet?\n3. If something\'s off, let\'s fix it before we keep going — it\'s easier to catch now than after more code is added on top.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built something but haven't tried it yet."}
The quick try-it hasn't been done.
Walk me through: try it / does it work as expected / fix-before-more if off.
{R4_CLOSE}`,
    },
    {
      option: 'Try what was just built and share what happens — does it work the way we want it to? One quick test before we continue building.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Quick test on last build not done."}
Same moment, simpler: try it / share what happens / continue-or-fix.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does what was just built actually work? Try it and tell me what you see before we add anything else.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built something new."}
Lighter: try and tell me before more.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Does this work yet? Quick check before we keep building.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built something new."}
Minimum next step: quick check before continuing.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SPEC_BEFORE_CODE_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_SPEC_BEFORE_CODE",
  question:      'Coding this — what\'s it supposed to do?',
  pinchFallback: 'Spec first.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SPEC_BEFORE_CODE'],
  L1: [
    {
      option: '1. Before we write more code — describe in plain words what this is supposed to do.\n2. What should happen when it works correctly? Share that with me first.\n3. Then we\'ll write it — having that clear makes the code much simpler.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Coding this but haven't said in plain words what it's supposed to do."}
The plain-words what-it-should-do hasn't been said.
Walk me through: what it's supposed to do / what happens when correct / then write.
{R4_CLOSE}`,
    },
    {
      option: 'Tell me what you want this to do — in plain English, step by step — before we start coding it. What happens when it works? Share that first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Plain-English step-by-step unwritten."}
Same moment, simpler: plain-English step-by-step + what-happens-when-works.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What should this do and how will I know it\'s working? Describe it in plain words before we write the code.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this."}
Lighter: what it should do + how-I'd-know-working.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'In plain words — what should this do? Tell me before we start coding.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this."}
Minimum next step: plain-words what-it-should-do.
{R4_CLOSE}`,
    },
  ],
};
