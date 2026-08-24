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
  1: form('Name the biggest decision made building this, and one other way it could have gone.', "Just the biggest decision made building this and one other way it could have gone — name that, not every choice."),
  2: form('For the biggest decision, list the main alternatives and why this one won.', "List the main alternatives to the biggest decision and why this one won."),
  3: form("1. Think about the biggest decision that was made while building this feature.\n2. Share with me: what other ways could it have been done, and why did we go with this one?\n3. Then tell me: is this still the best approach now that you think about it, or would something else have been simpler?", "Lay out the other ways the biggest decision could have gone and why this one, then say whether it's still the best or something simpler would do."),
  4: form('Re-judge the decision now with hindsight: would a simpler alternative do the same job, and is it worth switching before more is built on it?', "With hindsight, weigh the decision against a simpler alternative — same job for less, and worth switching before more is built on it?"),
  5: form('Write a short decision note: the choice, the alternatives weighed, why this one, and whether hindsight still backs it — so the decision is recorded, not just made.', "Capture a short decision note — the choice, the alternatives weighed, why this one, and whether hindsight still backs it — so it's recorded, not just made."),
});

/** API_DESIGN_REVIEW (beginner) — keyword "api". */
export const API_DESIGN_REVIEW_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Check whether what was just built changes the API in a way that could break callers.', "Just whether this changes the API in a way that could break existing callers."),
  2: form('List the API changes — what it expects and returns — and flag any that break existing callers.', "Note the API changes — what it expects and returns — and flag any that break existing callers."),
  3: form('1. Look at what was just built and check whether it could break anything that\'s already using this API. 2. List any changes to how it works — what it expects and what it sends back. 3. Share your list with me before we continue.', "List any changes to how the API works — what it expects and sends back — and flag anything that could break what already uses it."),
  4: form('For each API change, trace who calls it and confirm old callers still work — or note exactly what they must change.', "Trace each API change to who calls it and confirm old callers still work — or note exactly what they must change."),
  5: form('Write a short API-change note: the changes, the affected callers, and how each is kept working or migrated — so a breaking change cannot slip out unannounced.', "Capture a short API-change note — the changes, the affected callers, and how each is kept working or migrated — so a breaking change can't slip out unannounced."),
});

/** ARCH_CONFLICT (beginner) — keyword "project". */
export const ARCH_CONFLICT_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Check whether what was just built matches how the rest of the project is written.', "Just whether this matches how the rest of the project is written."),
  2: form('Compare it to similar parts of the project and note where it does things differently.', "Line it up against similar parts of the project and note where it does things differently."),
  3: form("1. Look at what was just built and compare it to how other parts of the project are written.\n2. Share with me: does it feel like it belongs, or does it do things in a different way than everything else?\n3. Then tell me: is there anything that could cause problems when we try to connect it with the rest of the project?", "Compare this to how other parts of the project are written — does it belong, and would anything clash when connecting it to the rest?"),
  4: form('Pick the project\'s pattern for this kind of thing and bring the new code in line with it — or note why it deliberately differs.', "Bring the new code in line with the project's pattern for this kind of thing — or note why it deliberately differs."),
  5: form("Write a short fit note: how this matches the project's patterns, where it differs and why, and any clash to fix before connecting it — so it belongs, not bolts on.", "Capture a short fit note — how this matches the project's patterns, where it differs and why, and any clash to fix before connecting it — so it belongs, not bolts on."),
});

/** CROSS_CONFIRMING (beginner) — keyword "check". */
export const CROSS_CONFIRMING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Read the generated code closely and check you understand what it actually does.', "Just read the generated code closely and check you understand what it actually does."),
  2: form("Read it line by line, check anything that seems off, and note what you haven't verified.", "Go line by line, check anything that seems off, and note what you haven't verified."),
  3: form("1. Read through what was just built carefully — not just to check if it looks right, but to understand what it actually does.\n2. Share with me: is there anything that seems off, confusing, or that you're not sure about?\n3. Then tell me: is there anything in what was just built you haven't manually checked yet?", "Go through it carefully to understand what it actually does, flag anything off or confusing, and call out anything you haven't manually checked yet."),
  4: form('Trace one real input through the code by hand to check it does what it claims — not just that it looks right.', "Run one real input through the code by hand to check it does what it claims — not just that it looks right."),
  5: form("Write a short review note: what you read and traced, what you confirmed works, and what's still unchecked — so generated code is understood, not trusted blind.", "Capture a short review note — what you read and traced, what you confirmed works, and what's still unchecked — so generated code is understood, not trusted blind."),
});

/** PROMPT_CONTEXT (beginner) — keyword "plan". */
export const PROMPT_CONTEXT_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Check you've actually seen the overall plan, not just the last instruction.", "Just confirm you've actually seen the overall plan, not only the last instruction."),
  2: form('Paste the plan into the chat and check what was built so far lines up with it.', "Put the plan in view and check what's been built so far lines up with it."),
  3: form("1. Think about what you've been building in this session.\n2. Share with me: have you seen the original plan for what we're building, or have you just been following each instruction without knowing the bigger picture?\n3. Then paste the plan or the task description into the conversation and check that what was just built matches what was planned.", "Check whether you've seen the original plan or just been following each instruction blind, then paste the plan in and confirm the build matches what was planned."),
  4: form("Read the whole plan against the build and name where they've drifted apart — so later steps follow the plan, not just the last prompt.", "Compare the whole plan against the build and name where they've drifted apart — so later steps follow the plan, not just the last prompt."),
  5: form('Make plan-checking a habit: before each step, look back at the plan and confirm the work still follows it — not just the last instruction — so the bigger picture never drops out of view.', "Set plan-checking as a habit — before each step, look back at the plan and confirm the work still follows it, not just the last instruction."),
});

/** SPEC_ACCEPTANCE (beginner) — keyword "plan". */
export const SPEC_ACCEPTANCE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Compare what was built to what we planned, and note one thing missing or different.', "Just compare what was built to what we planned and note one thing missing or different."),
  2: form('Go through what we planned point by point and check the build does each one.', "Take what we planned point by point and check the build does each one."),
  3: form("1. Look at what was just built and compare it to what we planned to build.\n2. Share with me: does it do everything it was supposed to, or is something missing or different?\n3. Then check: are there any situations it should handle that it doesn't?", "Compare the build to what we planned — does it do everything it should, is anything missing or different, and are there situations it should handle but doesn't?"),
  4: form("Check the build against the plan for the cases the plan implies but doesn't spell out — empty, error, or edge situations it should still handle.", "Test the build against the cases the plan implies but doesn't spell out — empty, error, or edge situations it should still handle."),
  5: form("Write a short acceptance note: each planned item, whether the build meets it, and the gaps or extras — so 'done' means matches-the-plan, not looks-finished.", "Capture a short acceptance note — each planned item, whether the build meets it, and the gaps or extras — so 'done' means matches-the-plan, not looks-finished."),
});

/** SPEC_CROSS_CONFIRM (beginner) — keyword "spec". */
export const SPEC_CROSS_CONFIRM_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Check one thing in the spec is something actually agreed, not an assumption.', "Just one spec item — is it something actually agreed, not an assumption? Check that one."),
  2: form('Go through the spec and flag anything that looks like an assumption rather than a confirmed requirement.', "Read through the spec and flag anything that looks like an assumption rather than a confirmed requirement."),
  3: form("1. Read through this project's spec and check: does everything in it come from something that was actually decided or agreed on?\n2. Share with me: is there anything in the spec that looks like an assumption rather than a confirmed requirement?\n3. Then tell me: is there anything that could be misunderstood or built in the wrong way because it's not specific enough?", "Check that everything in the spec comes from something decided or agreed, flag anything that's really an assumption, and reword anything vague enough to be built wrong."),
  4: form('For each flagged spec item, get it confirmed or marked open — and reword anything vague enough to be built the wrong way.', "Take each flagged spec item and get it confirmed or marked open — and reword anything vague enough to be built the wrong way."),
  5: form('Write a short spec-check note: which items are confirmed, which are assumptions to verify, and which are too vague — so the spec rests on agreement, not guesses.', "Capture a short spec-check note — which items are confirmed, which are assumptions to verify, and which are too vague — so the spec rests on agreement, not guesses."),
});

/** SPEC_REVISION (beginner) — keyword "spec". */
export const SPEC_REVISION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Check whether the spec still matches what's actually been built.", "Just whether the spec still matches what's actually been built."),
  2: form("Compare the spec to the build and note where they've fallen out of sync.", "Line the spec up against the build and note where they've fallen out of sync."),
  3: form("1. Look at this project's spec and then look at what has actually been built so far.\n2. Share with me: are they still in sync, or have things changed since the spec was first written?\n3. Then tell me: what would need to be updated in the spec to make it match what's actually happening?", "Check whether the spec and the actual build still line up, and say what the spec would need updated to match what's happening now."),
  4: form('Go through the spec section by section and mark exactly what to update so it matches what was actually built and decided.', "Take the spec section by section and mark exactly what to update so it matches what was actually built and decided."),
  5: form('Update the spec doc: the changed sections, what now matches the build, and any open decisions — so the spec stays the source of truth, not stale.', "Bring the spec doc up to date — the changed sections, what now matches the build, and any open decisions — so it stays the source of truth, not stale."),
});
