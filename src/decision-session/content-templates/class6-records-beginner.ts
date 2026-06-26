/**
 * Class-6 planning / idea / task `_BEGINNER` register overrides.
 *
 * Structurally-divergent beginner-register rewrites of all 14 class-6 planning signals
 * (each has a frozen beginner variant). Each is a full 5-column ladder: col-3
 * frozen-beginner verbatim, cols 1/2/4/5 in plain beginner voice carrying the variant's
 * own keyword, col-4 adding a distinct named practice that col-5 absorbs.
 *
 * F2 split mirrors the base records: twelve signals produce a written record at col-5
 * (a phase note, a scope note, a task plan, a feedback note, a spec note, etc.); the two
 * verification cadences (implementation-checkpoint, incremental-build) stay behavioural —
 * a standing works-check / test-each-piece habit, no file. No planning signal concerns a
 * sensitive action, so none is flagged and the engine appends no confirm-seek. Attached
 * via registerOverrides.beginner.
 */

import type { LevelForm, RegisterOverride, MaturityLevel } from '../content-template-schema.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}
function structural(levelForms: Partial<Record<MaturityLevel, LevelForm>>): RegisterOverride {
  return { divergence: 'structurally-divergent', levelForms };
}

/** PHASE_TRANSITION (beginner) — keyword "phase". File at col-5. */
export const PHASE_TRANSITION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Name the one thing that must be finished before this project can move to the next phase.', 'The lightest step: the one must-finish thing before the next phase named.'),
  2: form('List the main things that need to be done before this phase is over, and check which are finished.', 'A light pass: the main phase-exit items listed and checked.'),
  3: form("1. Think about what phase of development this project is currently in.\n2. Share with me: have you finished what you set out to do in this phase, or are you still in the middle of it?\n3. Then tell me: what needs to be done before it makes sense to move on to the next phase?", "The phase-status check hasn't been done."),
  4: form('Go through everything that should be true before leaving this phase: which are done, which are still blocking, and for each blocker decide fix-it-now or accept-it — so the next phase starts clean.', 'Beyond the checklist: every phase-exit item checked and each blocker resolved or accepted.'),
  5: form('Write a short note on the phase move: what had to be finished, what is done, the open blockers, and the go/no-go call — the record the next phase starts from.', 'A durable note of the phase-exit items, blockers, and the go/no-go.'),
});

/** IDEA_SCOPING (beginner) — keyword "describ". File at col-5. */
export const IDEA_SCOPING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Describe this project in one plain line — what it does and the problem it solves.', 'The lightest step: the project described in one plain line.'),
  2: form('Describe the project a bit fuller: the problem, the main things it does, and a rough first version.', 'A light pass: the project described with its problem and a rough first version.'),
  3: form("1. Help me describe this project in plain words — what it does and what problem it solves.\n2. Share your description with me before we go further so I can check it sounds right.\n3. Then tell me: is there anything about what we're building that's still unclear or not decided yet?", "The plain-words description hasn't been done."),
  4: form('Describe the project fully and mark its edges: the problem, everything the first version does, and — just as important — what it deliberately leaves out for now.', 'Beyond a sketch: the project described with the first version\'s boundaries drawn.'),
  5: form('Write a short note describing the project: the problem, what it does, what the first version includes, and what it leaves out — the anchor the build works to.', 'A durable note describing the problem, what it does, and the first-version edges.'),
});

/** IDEA_CONSTRAINT_CHECK (beginner) — keyword "leav". File at col-5. */
export const IDEA_CONSTRAINT_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Name the one thing this project will leave out on purpose — its clearest line in the sand.', 'The lightest step: one deliberate leave-out named.'),
  2: form('List the main things this project will leave out — what is not getting built and what is out of bounds.', 'A light pass: the main leave-outs and limits listed.'),
  3: form("1. Think about this project — what is it NOT going to do?\n2. Share a list of at least two things we're leaving out of this project on purpose, even if they seem obvious.\n3. Then tell me: why is it helpful to say those things out loud now?", "The will-not-do list hasn't been made."),
  4: form("For each thing you are leaving out, note what would make you reconsider it, and check none of them quietly clash with what you DID plan to build.", "Beyond a list: each leave-out's reconsider-trigger noted and checked against the plan."),
  5: form('Write a short note on the things this project leaves out: the deliberate non-goals, the limits, and what would force a rethink for each — the boundary the build holds to.', 'A durable note of the leave-outs, limits, and their rethink-triggers.'),
});

/** IDEA_USER_DEFINITION (beginner) — keyword "person". File at col-5. */
export const IDEA_USER_DEFINITION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Name the main person this project is for in one line.', 'The lightest step: the main person named.'),
  2: form('Describe the main person this is for: who they are, what they are trying to do, and the problem this solves for them.', 'A light pass: the main person and the problem this solves for them.'),
  3: form("1. Think about who will use this project — who is the main person it's for?\n2. Share a description of that person with me: who they are and what they're trying to do.\n3. Then tell me: what does that mean for how we build this project?", "The main-user description hasn't been done."),
  4: form('Push on the picture of the person: name one other kind of person this is NOT really for, say the riskiest guess you are making about the main person, and how you would check it.', 'Beyond naming them: the person definition pushed with a riskiest guess to check.'),
  5: form('Write a short note on the person this is for: who they are, what they need and what success looks like for them, who it is NOT for, and the guesses to check — the anchor design holds to.', 'A durable note of the person, their need, the edge cases, and the guesses to check.'),
});

/** TASK_ORDERING (beginner) — keyword "order". File at col-5. */
export const TASK_ORDERING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Find the one task that blocks the most others and put it first in the order.', 'The lightest step: the top blocking task ordered first.'),
  2: form('Order the main tasks by what depends on what — a rough sequence to follow.', 'A light pass: the main tasks ordered by dependency.'),
  3: form("1. Look at the tasks for this project.\n2. Share with me: which one should we do first, and which ones can't be done until something else is finished?\n3. Then tell me: what's the order we should follow to build this?", "The task ordering hasn't been done."),
  4: form('Beyond the order, find the shortest run of tasks that gets one whole thing working end to end, and order those first — so something real works early.', 'Beyond dependency order: the earliest end-to-end slice ordered first.'),
  5: form('Write the task order down: what comes first, what depends on what, what can run side by side, and the shortest run to something that works — the plan the build follows.', 'A durable ordered plan with the earliest run to something working.'),
});

/** TASK_SIZING (beginner) — keyword "split". File at col-5. */
export const TASK_SIZING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Take the biggest task and, if it can't be finished in one sitting, split it into smaller pieces.", "The lightest step: the biggest task split if it won't fit one sitting."),
  2: form('Go through the main tasks and split any that are too big to finish and check in a single sitting.', 'A light pass: the oversized main tasks split.'),
  3: form("1. Look at the tasks for this project.\n2. Share with me: is there any task that feels too big to finish in one sitting?\n3. Then tell me: how would you split that task into smaller pieces that are easier to finish one at a time?", "The too-big-to-finish-in-one-sitting check hasn't been done."),
  4: form('Go through every task and split the ones that pack in several things, carry too many unknowns, or are too big to check at the end of a sitting — into pieces you can finish and check one by one.', 'Beyond the big ones: every oversized task split into checkable pieces.'),
  5: form('Write the split-up task list: each task small enough to finish and check in one sitting, the big ones split into pieces — the plan the build runs.', 'A durable plan of single-sitting tasks, the big ones split.'),
});

/** TASK_DEFINITION_OF_DONE (beginner) — keyword "done". File at col-5. */
export const TASK_DEFINITION_OF_DONE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Pick the current task and say what 'done' means for it — what you would check to know it is finished.", "The lightest step: the current task's done-check stated."),
  2: form("For each main task, write one line on what 'done' means — something you could actually check.", "A light pass: the main tasks' done-checks written."),
  3: form("1. Pick one task from this project.\n2. Share with me: how would you know when that task is finished? What would you check?\n3. Then do the same for each of the other tasks — for each one, tell me what 'done' looks like.", "The per-task done-check hasn't been pinned."),
  4: form("Make each task's 'done' something anyone could confirm without re-reading the code — a check to run, an output to see, or a result to look for.", "Beyond writing them: each task's done made something anyone can confirm."),
  5: form("Write a short note listing each task and what 'done' means for it, written as a check anyone can run — so 'done' is never a guess.", "A durable note of each task's done as a checkable result."),
});

/** USER_FEEDBACK_REVIEW (beginner) — keyword "feedback". File at col-5. */
export const USER_FEEDBACK_REVIEW_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Pick the feedback that comes up most often and note the pattern it points to.', 'The lightest step: the most-common feedback and its pattern noted.'),
  2: form('Group the main feedback by theme and pull out the complaints that keep coming up.', 'A light pass: the main feedback grouped and the top complaints surfaced.'),
  3: form("1. Look at the feedback users have given about this project.\n2. Share with me: what are the most common things people are saying? What keeps coming up?\n3. Then tell me: what's the one piece of feedback that feels most important to address?", "The feedback walk-through hasn't been done."),
  4: form('Go further with the feedback: rank each theme by how often it comes up and how much it hurts, and separate what users complain about from the real cause underneath.', 'Beyond grouping: the feedback ranked by frequency and pain, symptoms split from causes.'),
  5: form('Write a short feedback note: the themes ranked by how often and how badly they bite, the real causes under the complaints, and the patterns — the input the next round plans from.', 'A durable feedback note of ranked themes and the real causes.'),
});

/** ITERATION_PLANNING (beginner) — keyword "next". File at col-5. */
export const ITERATION_PLANNING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Name the one feedback item the next round must fix first.', 'The lightest step: the top item for next named.'),
  2: form("Sketch what is next: rank the main feedback and decide what is in the next round versus held back.", 'A light pass: the main items ranked for next, in-versus-held decided.'),
  3: form("1. Look at the feedback for this project.\n2. Share with me: what's the most important thing users want fixed or added?\n3. Then tell me: what would you work on first in the next version, and why?", "The what-to-build-next decision hasn't been made."),
  4: form('Plan the next round properly: rank every item, decide what is in next versus later, and set what the next version covers and how you will know it worked.', 'Beyond the top items: the next version scoped with a success check.'),
  5: form('Write the next-round plan: what is getting fixed or built next, what is held back, what the next version covers, and how you will know it worked — the plan the next round runs.', 'A durable next-round plan of changes and a success check.'),
});

/** SCOPE_CREEP (beginner) — keyword "plan". File at col-5. */
export const SCOPE_CREEP_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Name the one thing built that wasn't in the original plan, and decide: keep, hold, or cut?", 'The lightest step: one off-plan addition decided keep/hold/cut.'),
  2: form('Compare what is built to the original plan and list the extras that crept in — decide keep, hold, or cut for each.', 'A light pass: the off-plan additions listed and decided.'),
  3: form("1. Look at what was just built and make a list of everything it does now. 2. Compare that list to what you originally planned to build. 3. Share anything that wasn't in the original plan with me before we continue.", "The original-plan-vs-now check hasn't been done."),
  4: form('For each extra that was not in the plan and you want to keep, weigh it against the time you have left — and hold or cut whatever will not fit.', 'Beyond keep/hold/cut: each kept extra weighed against the time left in the plan.'),
  5: form('Write a short note comparing the build to the plan: the planned work done, the extras that crept in, and for each a keep/hold/cut call with its cost — so the plan stays real.', 'A durable note of the plan, the extras, and the keep/hold/cut calls.'),
});

/** FEATURE_SCOPE (beginner) — keyword "part". File at col-5. */
export const FEATURE_SCOPE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Say in one line what this part of the app should do and the one thing that means it's done.", 'The lightest step: what this part does and its done condition stated.'),
  2: form("Sketch this part's scope: what it does, what it won't cover, and what 'working' looks like.", 'A light pass: this part\'s scope and what working looks like.'),
  3: form("1. Before we keep going — help me describe in plain words what this part of the app should do and what 'finished' looks like for it.\n2. Share that back with me so we're both on the same page.\n3. Then tell me: is there anything about what I want that is still unclear to you?", "The plain-words description + finished-state hasn't been done."),
  4: form('Before building this part further, make sure it is ready: each working condition is something you can actually test, and everything this part needs from elsewhere already exists.', "Beyond defining it: this part's done conditions made testable and its needs confirmed ready."),
  5: form("Write a short note on this part: what it does, what it won't cover, the conditions that mean it works (each testable), and what it depends on — the ready target the build aims at.", "A durable note of this part's scope, testable conditions, and ready needs."),
});

/** IMPLEMENTATION_CHECKPOINT (beginner) — keyword "work". Behavioural (no file). */
export const IMPLEMENTATION_CHECKPOINT_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before adding more, quickly try what was just built and confirm it works.', 'The lightest step: the last piece confirmed to work before more.'),
  2: form('Try the last change — run it or walk its main path — and keep going only if it works.', 'A light pass: the last change confirmed to work before more is layered.'),
  3: form("1. Before adding anything else — can you quickly try out what was just built?\n2. Tell me: does it do what we expected, or is something not working yet?\n3. If something's off, let's fix it before we keep going — it's easier to catch now than after more code is added on top.", "The quick try-it hasn't been done."),
  4: form('Check the last piece properly: try its main path AND run any quick test it has, fix anything that does not work, and only then add more.', 'Beyond a glance: the last piece fully confirmed to work before more is added.'),
  5: form('Make a quick works-check the habit: after each piece, try it or test it and confirm it works before starting the next — never stack new code on something you have not seen work.', 'A standing habit: each piece confirmed to work before the next begins.'),
});

/** SPEC_BEFORE_CODE (beginner) — keyword "code". File at col-5. */
export const SPEC_BEFORE_CODE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before writing the code, write down in plain words what it should do when it works right.', 'The lightest step: what the code should do written before coding.'),
  2: form('Sketch what the code should do: the main thing that should happen, plus one other case it has to handle.', "A light pass: the code's main case and one other written before coding."),
  3: form("1. Before we write more code — describe in plain words what this is supposed to do.\n2. What should happen when it works correctly? Share that with me first.\n3. Then we'll write it — having that clear makes the code much simpler.", "The plain-words what-it-should-do hasn't been said."),
  4: form('Before writing the code, write down what should happen in plain words — the normal case plus the tricky and the went-wrong cases — so the code has a clear target to match.', "Beyond the main case: the code's tricky and error cases written before coding."),
  5: form('Write a short note describing what the code should do — the normal case, the edge cases, and the error cases — kept as the thing the code is checked against, written before the code.', 'A durable note of what the code should do, checked against the code.'),
});

/** INCREMENTAL_BUILD (beginner) — keyword "test". Behavioural (no file). */
export const INCREMENTAL_BUILD_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Test the last piece before adding the next — confirm it does what you expected on its own.', 'The lightest step: the last piece tested before the next.'),
  2: form('Test the most recent piece and confirm it passes before stacking the next change on top.', 'A light pass: the latest piece tested before more is added.'),
  3: form("1. Before adding the next thing — quickly test what was just built.\n2. Share with me: does it do what you expected, or is something off?\n3. Then tell me: is it safe to move on, or should we fix something first?", "The pre-next-piece test hasn't been done."),
  4: form('Check the build piece by piece: confirm each recent piece was tested before the next went on, and go back and test any that got stacked without a check.', 'Beyond the latest: every recent piece tested, the skipped ones tested now.'),
  5: form('Make testing each piece before the next the steady habit — confirm a piece works before building on it, so unchecked changes never pile up — small tested steps over big untested leaps.', 'A standing habit: each piece tested before the next is added.'),
});
