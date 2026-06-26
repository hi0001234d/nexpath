/**
 * Class-2 verification-quality `_BEGINNER` register overrides (§4.E2 item 2 / §6.1 gate 3).
 *
 * Structurally-divergent beginner-register rewrites of the 11 batch-A verification
 * signals whose base record is formal-anchored and which have a distinct frozen
 * beginner variant. (DOCUMENTATION_BEFORE_ASK and OUTPUT_VERIFICATION are already
 * beginner-anchored in their base record, so they need no override; the other 8
 * batch-B signals have no frozen beginner variant — vocab-adaptable.)
 *
 * Each is a full 5-column ladder: column 3 is the frozen beginner shipped headline
 * (verbatim) and columns 1/2/4/5 radiate the same verification practice in the plain
 * beginner voice, each carrying the variant's own plain keyword, with col-4 adding a
 * distinct named practice over col-3 and col-5 absorbing it. No class-2 signal is
 * sensitive, so none carries an l2Safeguard. Attached via registerOverrides.beginner.
 */

import type { LevelForm, RegisterOverride, MaturityLevel } from '../content-template-schema.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}
function structural(levelForms: Partial<Record<MaturityLevel, LevelForm>>): RegisterOverride {
  return { divergence: 'structurally-divergent', levelForms };
}

/** TEST_CREATION (beginner) — keyword "test". */
export const TEST_CREATION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Write one test for the main thing just built.', 'The lightest step: one test for the main behaviour.'),
  2: form('Write tests for the main thing and one likely failure, and share them so I can check coverage.', 'A light pass: a test for the main path and a likely failure, shared.'),
  3: form("1. Write a test for what was just built — start with the main thing it's supposed to do.\n2. Share the test with me so I can check it covers the right thing.\n3. Then tell me: is there anything else in what was just built that could break without a test catching it?", "Tests haven't been written; whatever I built could break next time I change something."),
  4: form('Beyond the main test, add a test for the trickiest case — bad input or an edge — that could break silently without one.', 'Beyond the happy path: a test for the trickiest case that could break silently.'),
  5: form('Write the tests into the test file: the main behaviour, the likely failures, and the tricky edge — so a future change cannot break it unnoticed.', 'A durable test file covering the main path, failures, and the tricky edge.'),
});

/** REGRESSION_CHECK (beginner) — keyword "work". */
export const REGRESSION_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Run the existing tests now and check nothing that used to work is broken.', 'The lightest step: the existing tests run to catch newly-broken work.'),
  2: form("Run the existing tests, note which pass and fail, and flag anything that used to work but doesn't now.", 'A light pass: pass/fail noted and newly-broken work flagged.'),
  3: form("1. Run the existing tests for this project now that what was just built has been added.\n2. Share the results with me — which ones pass, which ones fail.\n3. Then tell me: is there anything that used to work that might not work anymore?", "Whether the changes broke things that used to work hasn't been checked."),
  4: form('Beyond running the tests, try by hand the older work most likely to be affected by this change — to catch a break the tests do not cover.', 'Beyond the test run: the at-risk older work tried by hand for an uncaught break.'),
  5: form('Write a short check note: which existing tests passed or failed, the older parts you re-checked by hand, and anything that stopped working — so regressions are caught, not shipped.', 'A durable note of the regression check and any work that stopped working.'),
});

/** BEHAVIOUR_TESTING (beginner) — keyword "user". */
export const BEHAVIOUR_TESTING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Click through the main flow once as a real user would.', 'The lightest step: the main flow tried once as a user.'),
  2: form("Walk the feature as a user — each step you'd take — and note anything that feels wrong.", 'A light pass: the feature walked as a user, snags noted.'),
  3: form("1. Walk through this feature as if you're a real user — tell me each step, what you'd click or type, and whether it works the way it should.\n2. Share what you find with me before we move on.\n3. Flag anything that feels wrong or missing along the way.", "I haven't manually used what was just built; automated tests miss the real-user feel."),
  4: form('Walk it as a user who does the unexpected — wrong order, empty fields, a mis-click — and note where it confuses or breaks.', 'Beyond the happy path: the feature walked as a user doing the unexpected.'),
  5: form('Write a short walkthrough note: the steps a user takes, what worked, and where it felt wrong or broke — so the real-user feel is checked, not assumed.', 'A durable walkthrough note of the user steps and where it broke.'),
});

/** SECURITY_CHECK (beginner) — keyword "type". */
export const SECURITY_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Check one thing a user can type into this, and whether something odd would cause a problem.', 'The lightest step: one user-typed input checked for trouble.'),
  2: form('Go through what a user can type or send, and check odd input cannot break it or skip a needed login.', 'A light pass: the typed inputs and the login checked.'),
  3: form("1. Look at what was just built and check if it handles anything a user types in or sends to the app.\n2. Share with me: could someone type something unexpected and cause a problem?\n3. Then check: does anything in what was just built need a login or permission to use, and is that actually enforced?", 'Security check hasn\'t been done; the input-handling and permission paths are unchecked.'),
  4: form('Type something deliberately bad into each input — too long, wrong kind, empty — and confirm a login or permission is actually enforced, not just assumed.', 'Beyond a look: bad input typed in and permissions confirmed enforced.'),
  5: form('Write a short check note: each place a user types or sends data, what bad input you tried, and which actions need a login — so unchecked input and permissions do not ship.', 'A durable note of the typed-input checks and the permission gaps.'),
});

/** ERROR_HANDLING (beginner) — keyword "break". */
export const ERROR_HANDLING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Check what happens if the main thing breaks — does it show a useful message?', 'The lightest step: the main break path checked for a useful message.'),
  2: form('Go through what could break and confirm each fails with a clear message, not a crash.', 'A light pass: the break paths given clear messages.'),
  3: form("1. Look at what was just built and think: what happens if it doesn't work the way it's supposed to?\n2. Share with me: is there anything that could break without showing a useful message?\n3. Then check: what happens if a user does something unexpected — does the app handle it or crash?", 'The "what happens when it breaks" hasn\'t been considered.'),
  4: form('Make each likely break handled on purpose: a failed call, bad input, or unexpected action each gets a safe message or fallback — not a crash.', 'Beyond noticing: each likely break given a deliberate safe handling.'),
  5: form('Write a short error note: the ways this can break, what the user sees for each, and the fallback — so a break is handled, not a crash.', 'A durable error note of the break paths and their handling.'),
});

/** DOCUMENTATION (beginner) — keyword "explain". */
export const DOCUMENTATION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Add one line explaining the least-obvious part just built.', 'The lightest step: the least-obvious part explained in one line.'),
  2: form("Explain the parts that would confuse someone who didn't write this, and share them.", 'A light pass: the confusing parts explained and shared.'),
  3: form("1. Look at what was just built and find one part that would be hard to understand for someone who didn't write it.\n2. Add a short explanation of why it works that way and share it with me.\n3. Then check: is there anything else in what was just built that needs explaining before we move on?", "A hard-to-understand part explanation hasn't been shared."),
  4: form('For each hard-to-follow part, explain WHY it works that way (the reason, not the what) — the context a future reader cannot guess.', 'Beyond a note: the WHY behind each hard part explained.'),
  5: form('Write a short docs note and add in-code comments that explain the why behind each non-obvious part — so the next reader does not guess.', 'A durable docs note explaining the why behind the non-obvious parts.'),
});

/** REFACTORING (beginner) — keyword "organis". */
export const REFACTORING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Read what was just built once — does it still feel organised?', 'The lightest step: a quick read for whether the code stays organised.'),
  2: form('Read it through and note anything messy or repeated that hurts how organised it is.', 'A light pass: the messy or repeated parts noted against how organised it is.'),
  3: form("1. Read through what was just built from start to finish — does it still feel organised and easy to follow?\n2. Share with me: is there anything that feels messy, repeated, or harder to understand than it needs to be?\n3. Then tell me: is there anything that should be tidied up before we add more features on top?", 'A start-to-finish read-through for organisation + clarity hasn\'t been shared.'),
  4: form('Tidy the worst part before adding more: pull out the repeated bit or rename the confusing one, so it stays organised as it grows.', 'Beyond noticing: the worst part tidied to keep it organised.'),
  5: form('Write a short cleanup note and do the tidy-up: the messy parts, and what you simplified or renamed — so the code stays organised before more lands on it.', 'A durable cleanup note keeping the code organised before extension.'),
});

/** CORRECTION_SEEKING (beginner) — keyword "wrong". */
export const CORRECTION_SEEKING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Look again at what was built and find one thing that might be wrong.', 'The lightest step: one possibly-wrong thing found.'),
  2: form("Re-read it looking for what's wrong — not to confirm it's fine — and share what you find.", "A light pass: a find-what's-wrong read shared."),
  3: form("1. Look at what was just built again — but this time, find what might be wrong with it.\n2. Share what you find with me.\n3. Then tell me: does what you found make sense, or does something still seem off?", "A find-what-might-be-wrong critique pass hasn't been shared."),
  4: form("Actively try to break your own work: assume something IS wrong, hunt for it, and judge whether what you find is real or a false alarm.", "Beyond a re-read: an assume-it's-wrong hunt with a real-vs-false-alarm judgment."),
  5: form("Write a short critique note: what you suspected was wrong, what you confirmed, and what's still uncertain — so a self-check catches what a quick look misses.", "A durable critique note of what was wrong and what's uncertain."),
});

/** PROBLEM_CORRECTION (beginner) — keyword "fix". */
export const PROBLEM_CORRECTION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Name one thing from earlier this session that may not be fixed.', 'The lightest step: one possibly-unfixed earlier issue named.'),
  2: form("Look back at what looked wrong earlier and check it's actually fixed, not just moved past.", 'A light pass: the earlier issue checked as actually fixed.'),
  3: form("1. Think back through this session — was there anything that didn't work or looked wrong earlier on?\n2. Share with me: is that thing actually fixed now, or did we move on without dealing with it?\n3. Then check: are there any other problems in what was just built that haven't been properly sorted out?", 'A noticed-but-maybe-unfixed issue is hanging over what was just built.'),
  4: form('Track down each issue noticed this session and confirm it is fixed and verified — not silently carried forward — and re-test the fix.', 'Beyond a recall: each earlier issue confirmed fixed and re-tested.'),
  5: form('Write a short loose-ends note: the issues noticed this session, which are fixed and verified, and which are still open — so nothing broken is quietly carried forward.', 'A durable note of which issues are fixed and which stay open.'),
});

/** ACCESSIBILITY (beginner) — keyword "label". */
export const ACCESSIBILITY_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Check one button or link has a clear label saying what it does.', "The lightest step: one control's label checked for clarity."),
  2: form('Check the main buttons and links have clear labels and can be reached by keyboard.', "A light pass: the main controls' labels and keyboard reach checked."),
  3: form('1. Go through what was just built and check that every button and link has a clear label describing what it does. 2. Try tabbing through the whole feature using only the keyboard — no mouse. 3. Share what you find with me before we continue.', 'A clear-label + keyboard-only walkthrough hasn\'t been shared together.'),
  4: form('Tab through the whole feature with no mouse and confirm every control has a clear label and is reachable in a sensible order.', 'Beyond a check: a keyboard-only pass confirming labels and order.'),
  5: form('Write a short access note: the controls and their labels, the keyboard-only path through the feature, and anything unreachable — so it works without a mouse or sight of every label.', 'A durable access note of labels and the keyboard path.'),
});

/** DATA_VALIDATION (beginner) — keyword "data". */
export const DATA_VALIDATION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Try sending one piece of bad data and see what the feature does.', 'The lightest step: one bad-data input tried.'),
  2: form('Send a few kinds of bad data — missing, wrong type, unexpected — and note what happens.', 'A light pass: a few bad-data inputs tried and the behaviour noted.'),
  3: form('1. Think about what happens in this feature if someone sends the wrong data — a missing field, a number where text is expected, or something completely unexpected. 2. Try sending some bad data and see what happens. 3. Share what you find with me before we continue.', 'A bad-data behavior probe hasn\'t been done together.'),
  4: form('For each input, send deliberately wrong data (missing field, wrong type, junk) and confirm it is rejected cleanly with a clear message, not accepted or crashed.', 'Beyond a probe: each input confirmed to reject bad data cleanly.'),
  5: form('Write a short validation note: the inputs, the bad data you tried for each, and how it is handled — so wrong data is caught at the edge, not deep inside.', 'A durable validation note of the bad-data checks per input.'),
});
