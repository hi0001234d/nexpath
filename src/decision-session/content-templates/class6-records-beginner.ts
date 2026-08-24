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
  1: form('Name the one thing that must be finished before this project can move to the next phase.', "Just the one thing that must be finished before this project moves to the next phase."),
  2: form('List the main things that need to be done before this phase is over, and check which are finished.', "Cover the main things that need doing before this phase is over, and check which are finished."),
  3: form("1. Think about what phase of development this project is currently in.\n2. Share with me: have you finished what you set out to do in this phase, or are you still in the middle of it?\n3. Then tell me: what needs to be done before it makes sense to move on to the next phase?", "Say whether you've finished what this phase set out to do or are mid-way, and what needs doing before it makes sense to move on."),
  4: form('Go through everything that should be true before leaving this phase: which are done, which are still blocking, and for each blocker decide fix-it-now or accept-it — so the next phase starts clean.', "Work through everything that should be true before leaving this phase — which are done, which still block — and for each blocker decide fix-now or accept-it, so the next phase starts clean."),
  5: form('Write a short note on the phase move: what had to be finished, what is done, the open blockers, and the go/no-go call — the record the next phase starts from.', "Capture a short note on the phase move — what had to be finished, what's done, the open blockers, and the go/no-go call — the record the next phase starts from."),
});

/** IDEA_SCOPING (beginner) — keyword "describ". File at col-5. */
export const IDEA_SCOPING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Describe this project in one plain line — what it does and the problem it solves.', "Just describe this project in one plain line — what it does and the problem it solves."),
  2: form('Describe the project a bit fuller: the problem, the main things it does, and a rough first version.', "Fill out the picture — describe the problem, the main things it does, and a rough first version."),
  3: form("1. Help me describe this project in plain words — what it does and what problem it solves.\n2. Share your description with me before we go further so I can check it sounds right.\n3. Then tell me: is there anything about what we're building that's still unclear or not decided yet?", "Say back what this project does and what problem it solves in plain words, and flag anything still unclear or not decided."),
  4: form('Describe the project fully and mark its edges: the problem, everything the first version does, and — just as important — what it deliberately leaves out for now.', "Round out the picture and mark its edges — describe the problem, everything the first version does, and, just as important, what it deliberately leaves out for now."),
  5: form('Write a short note describing the project: the problem, what it does, what the first version includes, and what it leaves out — the anchor the build works to.', "Capture a short note describing the project — the problem, what it does, what the first version includes, and what it leaves out — the anchor the build works to."),
});

/** IDEA_CONSTRAINT_CHECK (beginner) — keyword "leav". File at col-5. */
export const IDEA_CONSTRAINT_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Name the one thing this project will leave out on purpose — its clearest line in the sand.', "Just the one thing this project will leave out on purpose — its clearest line in the sand."),
  2: form('List the main things this project will leave out — what is not getting built and what is out of bounds.', "Cover the main things this project will leave out — what's not getting built and what's out of bounds."),
  3: form("1. Think about this project — what is it NOT going to do?\n2. Share a list of at least two things we're leaving out of this project on purpose, even if they seem obvious.\n3. Then tell me: why is it helpful to say those things out loud now?", "Give at least two things this project is leaving out on purpose, even if they seem obvious, and say why saying them out loud now helps."),
  4: form("For each thing you are leaving out, note what would make you reconsider it, and check none of them quietly clash with what you DID plan to build.", "Take each thing you're leaving out, note what would make you reconsider it, and check none quietly clash with what you DID plan to build."),
  5: form('Write a short note on the things this project leaves out: the deliberate non-goals, the limits, and what would force a rethink for each — the boundary the build holds to.', "Capture a short note on what this project leaves out — the deliberate non-goals, the limits, and what would force a rethink for each — the boundary the build holds to."),
});

/** IDEA_USER_DEFINITION (beginner) — keyword "person". File at col-5. */
export const IDEA_USER_DEFINITION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Name the main person this project is for in one line.', "Just the main person this project is for, in one line."),
  2: form('Describe the main person this is for: who they are, what they are trying to do, and the problem this solves for them.', "Sketch the main person this is for — who they are, what they're trying to do, and the problem this solves for them."),
  3: form("1. Think about who will use this project — who is the main person it's for?\n2. Share a description of that person with me: who they are and what they're trying to do.\n3. Then tell me: what does that mean for how we build this project?", "Say who the main person is and what they're trying to do, and what that means for how this project gets built."),
  4: form('Push on the picture of the person: name one other kind of person this is NOT really for, say the riskiest guess you are making about the main person, and how you would check it.', "Name one other kind of person this is NOT really for, say the riskiest guess you're making about the main person, and how you'd check it."),
  5: form('Write a short note on the person this is for: who they are, what they need and what success looks like for them, who it is NOT for, and the guesses to check — the anchor design holds to.', "Capture a short note on the person this is for — who they are, what they need and what success looks like for them, who it's NOT for, and the guesses to check — the anchor design holds to."),
});

/** TASK_ORDERING (beginner) — keyword "order". File at col-5. */
export const TASK_ORDERING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Find the one task that blocks the most others and put it first in the order.', "Just the one task that blocks the most others — put it first in the order."),
  2: form('Order the main tasks by what depends on what — a rough sequence to follow.', "Sequence the main tasks by what depends on what — a rough order to follow."),
  3: form("1. Look at the tasks for this project.\n2. Share with me: which one should we do first, and which ones can't be done until something else is finished?\n3. Then tell me: what's the order we should follow to build this?", "Say which task to do first, which can't start until something else is finished, and the order to follow to build this."),
  4: form('Beyond the order, find the shortest run of tasks that gets one whole thing working end to end, and order those first — so something real works early.', "Past the dependency order, find the shortest run of tasks that gets one whole thing working end to end, and order those first — so something real works early."),
  5: form('Write the task order down: what comes first, what depends on what, what can run side by side, and the shortest run to something that works — the plan the build follows.', "Capture the task order — what comes first, what depends on what, what can run side by side, and the shortest run to something that works — the plan the build follows."),
});

/** TASK_SIZING (beginner) — keyword "split". File at col-5. */
export const TASK_SIZING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Take the biggest task and, if it can't be finished in one sitting, split it into smaller pieces.", "Just the biggest task — if it can't be finished in one sitting, split it into smaller pieces."),
  2: form('Go through the main tasks and split any that are too big to finish and check in a single sitting.', "Take the main tasks and split any too big to finish and check in a single sitting."),
  3: form("1. Look at the tasks for this project.\n2. Share with me: is there any task that feels too big to finish in one sitting?\n3. Then tell me: how would you split that task into smaller pieces that are easier to finish one at a time?", "Flag any task that feels too big to finish in one sitting, and say how you'd split it into smaller pieces that are easier to finish one at a time."),
  4: form('Go through every task and split the ones that pack in several things, carry too many unknowns, or are too big to check at the end of a sitting — into pieces you can finish and check one by one.', "Split every task that packs in several things, carries too many unknowns, or is too big to check at the end of a sitting — into pieces you can finish and check one by one."),
  5: form('Write the split-up task list: each task small enough to finish and check in one sitting, the big ones split into pieces — the plan the build runs.', "Capture the split-up task list — each task small enough to finish and check in one sitting, the big ones split into pieces — the plan the build runs."),
});

/** TASK_DEFINITION_OF_DONE (beginner) — keyword "done". File at col-5. */
export const TASK_DEFINITION_OF_DONE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Pick the current task and say what 'done' means for it — what you would check to know it is finished.", "Just the current task — say what 'done' means for it, what you'd check to know it's finished."),
  2: form("For each main task, write one line on what 'done' means — something you could actually check.", "One line per main task on what 'done' means — something you could actually check."),
  3: form("1. Pick one task from this project.\n2. Share with me: how would you know when that task is finished? What would you check?\n3. Then do the same for each of the other tasks — for each one, tell me what 'done' looks like.", "Say how you'd know each task is finished — what you'd check — and do the same for every task, so each has a clear 'done'."),
  4: form("Make each task's 'done' something anyone could confirm without re-reading the code — a check to run, an output to see, or a result to look for.", "Turn each task's 'done' into something anyone could confirm without re-reading the code — a check to run, an output to see, or a result to look for."),
  5: form("Write a short note listing each task and what 'done' means for it, written as a check anyone can run — so 'done' is never a guess.", "Capture a short note listing each task and what 'done' means for it, written as a check anyone can run — so 'done' is never a guess."),
});

/** USER_FEEDBACK_REVIEW (beginner) — keyword "feedback". File at col-5. */
export const USER_FEEDBACK_REVIEW_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Pick the feedback that comes up most often and note the pattern it points to.', "Just the feedback that comes up most often — note the pattern it points to."),
  2: form('Group the main feedback by theme and pull out the complaints that keep coming up.', "Sort the main feedback by theme and pull out the complaints that keep coming up."),
  3: form("1. Look at the feedback users have given about this project.\n2. Share with me: what are the most common things people are saying? What keeps coming up?\n3. Then tell me: what's the one piece of feedback that feels most important to address?", "Say what users keep saying most, what recurs, and the one piece of feedback that feels most important to address."),
  4: form('Go further with the feedback: rank each theme by how often it comes up and how much it hurts, and separate what users complain about from the real cause underneath.', "Rank each feedback theme by how often it comes up and how much it hurts, and separate what users complain about from the real cause underneath."),
  5: form('Write a short feedback note: the themes ranked by how often and how badly they bite, the real causes under the complaints, and the patterns — the input the next round plans from.', "Capture a short feedback note — the themes ranked by how often and how badly they bite, the real causes under the complaints, and the patterns — the input the next round plans from."),
});

/** ITERATION_PLANNING (beginner) — keyword "next". File at col-5. */
export const ITERATION_PLANNING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Name the one feedback item the next round must fix first.', "Just the one feedback item the next round must fix first."),
  2: form("Sketch what is next: rank the main feedback and decide what is in the next round versus held back.", "Rank the main feedback for the next round and decide what's in versus held back."),
  3: form("1. Look at the feedback for this project.\n2. Share with me: what's the most important thing users want fixed or added?\n3. Then tell me: what would you work on first in the next version, and why?", "Say the most important thing users want fixed or added, and what you'd work on first in the next version and why."),
  4: form('Plan the next round properly: rank every item, decide what is in next versus later, and set what the next version covers and how you will know it worked.', "Scope the next round properly — rank every item, decide what's in next versus later, and set what the next version covers and how you'll know it worked."),
  5: form('Write the next-round plan: what is getting fixed or built next, what is held back, what the next version covers, and how you will know it worked — the plan the next round runs.', "Capture the next-round plan — what's getting fixed or built next, what's held back, what the next version covers, and how you'll know it worked — the plan the next round runs."),
});

/** SCOPE_CREEP (beginner) — keyword "plan". File at col-5. */
export const SCOPE_CREEP_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Name the one thing built that wasn't in the original plan, and decide: keep, hold, or cut?", "Just the one thing built that wasn't in the original plan — decide keep, hold, or cut."),
  2: form('Compare what is built to the original plan and list the extras that crept in — decide keep, hold, or cut for each.', "Line what's built up against the original plan and list the extras that crept in — decide keep, hold, or cut for each."),
  3: form("1. Look at what was just built and make a list of everything it does now. 2. Compare that list to what you originally planned to build. 3. Share anything that wasn't in the original plan with me before we continue.", "List everything the build does now, compare it to what you originally planned, and flag anything that wasn't in the original plan before continuing."),
  4: form('For each extra that was not in the plan and you want to keep, weigh it against the time you have left — and hold or cut whatever will not fit.', "Take each extra not in the plan that you want to keep, weigh it against the time you have left — and hold or cut whatever won't fit."),
  5: form('Write a short note comparing the build to the plan: the planned work done, the extras that crept in, and for each a keep/hold/cut call with its cost — so the plan stays real.', "Capture a short note comparing the build to the plan — the planned work done, the extras that crept in, and for each a keep/hold/cut call with its cost — so the plan stays real."),
});

/** FEATURE_SCOPE (beginner) — keyword "part". File at col-5. */
export const FEATURE_SCOPE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Say in one line what this part of the app should do and the one thing that means it's done.", "Just what this part of the app should do, in one line, and the one thing that means it's done."),
  2: form("Sketch this part's scope: what it does, what it won't cover, and what 'working' looks like.", "Rough out this part's scope — what it does, what it won't cover, and what 'working' looks like."),
  3: form("1. Before we keep going — help me describe in plain words what this part of the app should do and what 'finished' looks like for it.\n2. Share that back with me so we're both on the same page.\n3. Then tell me: is there anything about what I want that is still unclear to you?", "Describe in plain words what this part should do and what 'finished' looks like, say it back so you're both on the same page, and flag anything still unclear."),
  4: form('Before building this part further, make sure it is ready: each working condition is something you can actually test, and everything this part needs from elsewhere already exists.', "Make sure this part is ready to build on — each working condition is something you can actually test, and everything it needs from elsewhere already exists."),
  5: form("Write a short note on this part: what it does, what it won't cover, the conditions that mean it works (each testable), and what it depends on — the ready target the build aims at.", "Capture a short note on this part — what it does, what it won't cover, the conditions that mean it works (each testable), and what it depends on — the ready target the build aims at."),
});

/** IMPLEMENTATION_CHECKPOINT (beginner) — keyword "work". Behavioural (no file). */
export const IMPLEMENTATION_CHECKPOINT_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before adding more, quickly try what was just built and confirm it works.', "Just quickly try what was just built and confirm it works before adding more."),
  2: form('Try the last change — run it or walk its main path — and keep going only if it works.', "Run the last change or walk its main path, and keep going only if it works."),
  3: form("1. Before adding anything else — can you quickly try out what was just built?\n2. Tell me: does it do what we expected, or is something not working yet?\n3. If something's off, let's fix it before we keep going — it's easier to catch now than after more code is added on top.", "Quickly try what was just built — does it do what you expected, or is something not working? If something's off, fix it before adding more code on top."),
  4: form('Check the last piece properly: try its main path AND run any quick test it has, fix anything that does not work, and only then add more.', "Confirm the last piece properly — try its main path AND run any quick test it has, fix anything that doesn't work, and only then add more."),
  5: form('Make a quick works-check the habit: after each piece, try it or test it and confirm it works before starting the next — never stack new code on something you have not seen work.', "Hold a quick works-check as the habit — after each piece, try or test it and confirm it works before starting the next; never stack new code on something you haven't seen work."),
});

/** SPEC_BEFORE_CODE (beginner) — keyword "code". File at col-5. */
export const SPEC_BEFORE_CODE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before writing the code, write down in plain words what it should do when it works right.', "Just write down in plain words what the code should do when it works right, before writing it."),
  2: form('Sketch what the code should do: the main thing that should happen, plus one other case it has to handle.', "Rough out what the code should do — the main thing that should happen, plus one other case it has to handle."),
  3: form("1. Before we write more code — describe in plain words what this is supposed to do.\n2. What should happen when it works correctly? Share that with me first.\n3. Then we'll write it — having that clear makes the code much simpler.", "Describe in plain words what this should do — what happens when it works correctly — before writing more code; having that clear makes the code much simpler."),
  4: form('Before writing the code, write down what should happen in plain words — the normal case plus the tricky and the went-wrong cases — so the code has a clear target to match.', "Ahead of writing the code, write what should happen in plain words — the normal case plus the tricky and went-wrong cases — so the code has a clear target to match."),
  5: form('Write a short note describing what the code should do — the normal case, the edge cases, and the error cases — kept as the thing the code is checked against, written before the code.', "Capture a short note describing what the code should do — the normal case, the edge cases, and the error cases — kept as the thing the code is checked against, written before the code."),
});

/** INCREMENTAL_BUILD (beginner) — keyword "test". Behavioural (no file). */
export const INCREMENTAL_BUILD_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Test the last piece before adding the next — confirm it does what you expected on its own.', "Just test the last piece before adding the next — confirm it does what you expected on its own."),
  2: form('Test the most recent piece and confirm it passes before stacking the next change on top.', "Confirm the most recent piece passes its test before stacking the next change on top."),
  3: form("1. Before adding the next thing — quickly test what was just built.\n2. Share with me: does it do what you expected, or is something off?\n3. Then tell me: is it safe to move on, or should we fix something first?", "Quickly test what was just built — does it do what you expected, or is something off — and say whether it's safe to move on or something needs fixing first."),
  4: form('Check the build piece by piece: confirm each recent piece was tested before the next went on, and go back and test any that got stacked without a check.', "Go through the build piece by piece — confirm each recent piece was tested before the next went on, and go back and test any that got stacked without a check."),
  5: form('Make testing each piece before the next the steady habit — confirm a piece works before building on it, so unchecked changes never pile up — small tested steps over big untested leaps.', "Hold testing each piece before the next as the steady habit — confirm a piece works before building on it, so unchecked changes never pile up: small tested steps over big untested leaps."),
});
