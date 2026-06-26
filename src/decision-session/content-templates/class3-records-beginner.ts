/**
 * Class-3 spec/architecture `_BEGINNER` register overrides (§4.E2 item 2 / §6.1 gate 3).
 *
 * Structurally-divergent beginner-register rewrites of the 8 class-3 signals that have a
 * frozen beginner variant (ARCHITECTURE_NOTE_ABSENCE, API_CONTRACT_DEFINITION,
 * BACKWARDS_COMPATIBILITY_CHECK have none → vocab-adaptable). Each is a full 5-column
 * ladder: col-3 frozen-beginner verbatim, cols 1/2/4/5 in plain beginner voice carrying
 * the variant's own keyword, with col-4 adding a distinct named practice and col-5
 * absorbing it. No class-3 signal is sensitive → no l2Safeguard. Attached via
 * registerOverrides.beginner.
 */

import type { LevelForm, RegisterOverride, MaturityLevel } from '../content-template-schema.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}
function structural(levelForms: Partial<Record<MaturityLevel, LevelForm>>): RegisterOverride {
  return { divergence: 'structurally-divergent', levelForms };
}

/** ALTERNATIVES (beginner) — keyword "decision". */
export const ALTERNATIVES_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Name the biggest decision made building this, and one other way it could have gone.', 'The lightest step: the biggest decision and one alternative named.'),
  2: form('For the biggest decision, list the main alternatives and why this one won.', "A light pass: the decision's alternatives and the reason for the pick."),
  3: form("1. Think about the biggest decision that was made while building this feature.\n2. Share with me: what other ways could it have been done, and why did we go with this one?\n3. Then tell me: is this still the best approach now that you think about it, or would something else have been simpler?", "The biggest decision's alternatives haven't been talked through together."),
  4: form('Re-judge the decision now with hindsight: would a simpler alternative do the same job, and is it worth switching before more is built on it?', 'Beyond listing: the decision re-judged against a simpler alternative, with a switch call.'),
  5: form('Write a short decision note: the choice, the alternatives weighed, why this one, and whether hindsight still backs it — so the decision is recorded, not just made.', 'A durable decision note of the choice, alternatives, and the hindsight check.'),
});

/** API_DESIGN_REVIEW (beginner) — keyword "api". */
export const API_DESIGN_REVIEW_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Check whether what was just built changes the API in a way that could break callers.', 'The lightest step: one API change checked for breaking callers.'),
  2: form('List the API changes — what it expects and returns — and flag any that break existing callers.', 'A light pass: the API changes listed and breaking ones flagged.'),
  3: form('1. Look at what was just built and check whether it could break anything that\'s already using this API. 2. List any changes to how it works — what it expects and what it sends back. 3. Share your list with me before we continue.', 'Breaking-change check on the API hasn\'t been done.'),
  4: form('For each API change, trace who calls it and confirm old callers still work — or note exactly what they must change.', 'Beyond a list: each API change traced to its callers and their impact named.'),
  5: form('Write a short API-change note: the changes, the affected callers, and how each is kept working or migrated — so a breaking change cannot slip out unannounced.', 'A durable API-change note of the changes and affected callers.'),
});

/** ARCH_CONFLICT (beginner) — keyword "project". */
export const ARCH_CONFLICT_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Check whether what was just built matches how the rest of the project is written.', "The lightest step: the new code checked against the project's style."),
  2: form('Compare it to similar parts of the project and note where it does things differently.', "A light pass: the new code compared to the project's patterns, differences noted."),
  3: form("1. Look at what was just built and compare it to how other parts of the project are written.\n2. Share with me: does it feel like it belongs, or does it do things in a different way than everything else?\n3. Then tell me: is there anything that could cause problems when we try to connect it with the rest of the project?", 'Codebase-fit check hasn\'t been done.'),
  4: form('Pick the project\'s pattern for this kind of thing and bring the new code in line with it — or note why it deliberately differs.', "Beyond noticing: the new code aligned to the project's pattern, or a deliberate-difference note."),
  5: form("Write a short fit note: how this matches the project's patterns, where it differs and why, and any clash to fix before connecting it — so it belongs, not bolts on.", 'A durable fit note of how the code matches the project and the clashes to fix.'),
});

/** CROSS_CONFIRMING (beginner) — keyword "check". */
export const CROSS_CONFIRMING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Read the generated code closely and check you understand what it actually does.', 'The lightest step: the generated code read and checked for understanding.'),
  2: form("Read it line by line, check anything that seems off, and note what you haven't verified.", 'A light pass: the code checked line by line, unverified parts noted.'),
  3: form("1. Read through what was just built carefully — not just to check if it looks right, but to understand what it actually does.\n2. Share with me: is there anything that seems off, confusing, or that you're not sure about?\n3. Then tell me: is there anything in what was just built you haven't manually checked yet?", "The piece-by-piece check on generated code hasn't been done."),
  4: form('Trace one real input through the code by hand to check it does what it claims — not just that it looks right.', 'Beyond a read: one input traced by hand to check actual behaviour.'),
  5: form("Write a short review note: what you read and traced, what you confirmed works, and what's still unchecked — so generated code is understood, not trusted blind.", "A durable review note of what was checked and what's unverified."),
});

/** PROMPT_CONTEXT (beginner) — keyword "plan". */
export const PROMPT_CONTEXT_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Check you've actually seen the overall plan, not just the last instruction.", 'The lightest step: the overall plan confirmed seen, not just instructions.'),
  2: form('Paste the plan into the chat and check what was built so far lines up with it.', 'A light pass: the plan in view and the build checked against it.'),
  3: form("1. Think about what you've been building in this session.\n2. Share with me: have you seen the original plan for what we're building, or have you just been following each instruction without knowing the bigger picture?\n3. Then paste the plan or the task description into the conversation and check that what was just built matches what was planned.", "The full-plan-vs-individual-instructions check hasn't been done."),
  4: form("Read the whole plan against the build and name where they've drifted apart — so later steps follow the plan, not just the last prompt.", 'Beyond a glance: plan-vs-build drift named so later steps stay on plan.'),
  5: form('Make plan-checking a habit: before each step, look back at the plan and confirm the work still follows it — not just the last instruction — so the bigger picture never drops out of view.', 'A standing habit of checking the plan before each step so the build never drifts from it.'),
});

/** SPEC_ACCEPTANCE (beginner) — keyword "plan". */
export const SPEC_ACCEPTANCE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Compare what was built to what we planned, and note one thing missing or different.', 'The lightest step: the build compared to the plan, one gap noted.'),
  2: form('Go through what we planned point by point and check the build does each one.', 'A light pass: each planned point checked against the build.'),
  3: form("1. Look at what was just built and compare it to what we planned to build.\n2. Share with me: does it do everything it was supposed to, or is something missing or different?\n3. Then check: are there any situations it should handle that it doesn't?", "Spec-vs-build comparison hasn't been done."),
  4: form("Check the build against the plan for the cases the plan implies but doesn't spell out — empty, error, or edge situations it should still handle.", "Beyond the listed points: the build checked against the plan's implied edge cases."),
  5: form("Write a short acceptance note: each planned item, whether the build meets it, and the gaps or extras — so 'done' means matches-the-plan, not looks-finished.", 'A durable acceptance note of plan items met and the gaps.'),
});

/** SPEC_CROSS_CONFIRM (beginner) — keyword "spec". */
export const SPEC_CROSS_CONFIRM_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Check one thing in the spec is something actually agreed, not an assumption.', 'The lightest step: one spec item checked as agreed, not assumed.'),
  2: form('Go through the spec and flag anything that looks like an assumption rather than a confirmed requirement.', "A light pass: the spec's assumptions flagged against confirmed requirements."),
  3: form("1. Read through this project's spec and check: does everything in it come from something that was actually decided or agreed on?\n2. Share with me: is there anything in the spec that looks like an assumption rather than a confirmed requirement?\n3. Then tell me: is there anything that could be misunderstood or built in the wrong way because it's not specific enough?", "Spec-vs-actually-agreed check hasn't been done."),
  4: form('For each flagged spec item, get it confirmed or marked open — and reword anything vague enough to be built the wrong way.', 'Beyond flagging: each shaky spec item confirmed or marked, vague ones reworded.'),
  5: form('Write a short spec-check note: which items are confirmed, which are assumptions to verify, and which are too vague — so the spec rests on agreement, not guesses.', 'A durable spec-check note of confirmed items, assumptions, and vague ones.'),
});

/** SPEC_REVISION (beginner) — keyword "spec". */
export const SPEC_REVISION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Check whether the spec still matches what's actually been built.", 'The lightest step: the spec checked against the actual build.'),
  2: form("Compare the spec to the build and note where they've fallen out of sync.", 'A light pass: the spec-vs-build differences noted.'),
  3: form("1. Look at this project's spec and then look at what has actually been built so far.\n2. Share with me: are they still in sync, or have things changed since the spec was first written?\n3. Then tell me: what would need to be updated in the spec to make it match what's actually happening?", "Spec-vs-build sync check hasn't been done."),
  4: form('Go through the spec section by section and mark exactly what to update so it matches what was actually built and decided.', 'Beyond noticing drift: each spec section marked with the update needed.'),
  5: form('Update the spec doc: the changed sections, what now matches the build, and any open decisions — so the spec stays the source of truth, not stale.', 'A durable spec doc update of what changed to match the build.'),
});
