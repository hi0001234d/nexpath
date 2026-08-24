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
  1: form('Write one test for the main thing just built.', "Just one test for the main thing just built — the single most important behaviour, not full coverage yet."),
  2: form('Write tests for the main thing and one likely failure, and share them so I can check coverage.', "Cover the main thing and one likely failure with tests, and share them so I can check coverage."),
  3: form("1. Write a test for what was just built — start with the main thing it's supposed to do.\n2. Share the test with me so I can check it covers the right thing.\n3. Then tell me: is there anything else in what was just built that could break without a test catching it?", "Cover the main thing what was just built should do with a test, share it so I can check it covers the right thing, then flag anything else that could break without a test catching it."),
  4: form('Beyond the main test, add a test for the trickiest case — bad input or an edge — that could break silently without one.', "Add a test for the trickiest case — bad input or an edge — that could otherwise break silently, on top of the main test."),
  5: form('Write the tests into the test file: the main behaviour, the likely failures, and the tricky edge — so a future change cannot break it unnoticed.', "Land the tests in the test file — the main behaviour, the likely failures, and the tricky edge — so a future change can't break it unnoticed."),
});

/** REGRESSION_CHECK (beginner) — keyword "work". */
export const REGRESSION_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Run the existing tests now and check nothing that used to work is broken.', "Just re-run the existing tests to confirm nothing that used to work broke — a quick catch before moving on."),
  2: form("Run the existing tests, note which pass and fail, and flag anything that used to work but doesn't now.", "Note which existing tests pass and fail, and flag anything that used to work but doesn't now."),
  3: form("1. Run the existing tests for this project now that what was just built has been added.\n2. Share the results with me — which ones pass, which ones fail.\n3. Then tell me: is there anything that used to work that might not work anymore?", "Re-run the existing tests now that what was just built is in, share which pass and fail, and call out anything that used to work and might not anymore."),
  4: form('Beyond running the tests, try by hand the older work most likely to be affected by this change — to catch a break the tests do not cover.', "Try by hand the older work most likely to be affected by this change — to catch a break the tests don't cover — on top of running them."),
  5: form('Write a short check note: which existing tests passed or failed, the older parts you re-checked by hand, and anything that stopped working — so regressions are caught, not shipped.', "Capture a short check note — which existing tests passed or failed, the older parts you re-checked by hand, and anything that stopped working — so regressions are caught, not shipped."),
});

/** BEHAVIOUR_TESTING (beginner) — keyword "user". */
export const BEHAVIOUR_TESTING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Click through the main flow once as a real user would.', "Just click through the main flow once as a real user would — the user-facing feel automated tests miss."),
  2: form("Walk the feature as a user — each step you'd take — and note anything that feels wrong.", "Step through the feature as a user would and note anything that feels wrong along the way."),
  3: form("1. Walk through this feature as if you're a real user — tell me each step, what you'd click or type, and whether it works the way it should.\n2. Share what you find with me before we move on.\n3. Flag anything that feels wrong or missing along the way.", "Go through the feature as a real user — each step, what you'd click or type, whether it works right — and flag anything that feels wrong or missing before moving on."),
  4: form('Walk it as a user who does the unexpected — wrong order, empty fields, a mis-click — and note where it confuses or breaks.', "Push it as a user who does the unexpected — wrong order, empty fields, a mis-click — and note where it confuses or breaks."),
  5: form('Write a short walkthrough note: the steps a user takes, what worked, and where it felt wrong or broke — so the real-user feel is checked, not assumed.', "Capture a short walkthrough note — the steps a user takes, what worked, and where it felt wrong or broke — so the real-user feel is checked, not assumed."),
});

/** SECURITY_CHECK (beginner) — keyword "type". */
export const SECURITY_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Check one thing a user can type into this, and whether something odd would cause a problem.', "Just one thing a user can type into this, checked for whether something odd causes a problem."),
  2: form('Go through what a user can type or send, and check odd input cannot break it or skip a needed login.', "Check what a user can type or send — can odd input break it or skip a needed login?"),
  3: form("1. Look at what was just built and check if it handles anything a user types in or sends to the app.\n2. Share with me: could someone type something unexpected and cause a problem?\n3. Then check: does anything in what was just built need a login or permission to use, and is that actually enforced?", "Check whether what was just built handles what a user types or sends, whether odd input can cause a problem, and whether anything needing a login or permission actually enforces it."),
  4: form('Type something deliberately bad into each input — too long, wrong kind, empty — and confirm a login or permission is actually enforced, not just assumed.', "Push deliberately bad input into each thing a user can type — too long, wrong kind, empty — and confirm a login or permission is actually enforced, not just assumed."),
  5: form('Write a short check note: each place a user types or sends data, what bad input you tried, and which actions need a login — so unchecked input and permissions do not ship.', "Capture a short check note — each place a user types or sends data, what bad input you tried, and which actions need a login — so unchecked input and permissions don't ship."),
});

/** ERROR_HANDLING (beginner) — keyword "break". */
export const ERROR_HANDLING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Check what happens if the main thing breaks — does it show a useful message?', "Just what happens if the main thing breaks — does it show a useful message? — checked before moving on."),
  2: form('Go through what could break and confirm each fails with a clear message, not a crash.', "Check each thing that could break and confirm it fails with a clear message, not a crash."),
  3: form("1. Look at what was just built and think: what happens if it doesn't work the way it's supposed to?\n2. Share with me: is there anything that could break without showing a useful message?\n3. Then check: what happens if a user does something unexpected — does the app handle it or crash?", "Think through what happens if what was just built doesn't work as intended — could anything break without a useful message, and does an unexpected user action get handled or crash?"),
  4: form('Make each likely break handled on purpose: a failed call, bad input, or unexpected action each gets a safe message or fallback — not a crash.', "Handle each likely break on purpose — a failed call, bad input, or unexpected action each gets a safe message or fallback, not a crash."),
  5: form('Write a short error note: the ways this can break, what the user sees for each, and the fallback — so a break is handled, not a crash.', "Capture a short error note — the ways this can break, what the user sees for each, and the fallback — so a break is handled, not a crash."),
});

/** DOCUMENTATION (beginner) — keyword "explain". */
export const DOCUMENTATION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Add one line explaining the least-obvious part just built.', "Just one line explaining the least-obvious part just built — the reason it works that way, not the what."),
  2: form("Explain the parts that would confuse someone who didn't write this, and share them.", "Spell out, and share, the parts that would confuse someone who didn't write this — explain why each works as it does."),
  3: form("1. Look at what was just built and find one part that would be hard to understand for someone who didn't write it.\n2. Add a short explanation of why it works that way and share it with me.\n3. Then check: is there anything else in what was just built that needs explaining before we move on?", "Find one part of what was just built that's hard to understand for someone who didn't write it, add a short explanation of why it works that way, share it, then flag anything else that needs explaining."),
  4: form('For each hard-to-follow part, explain WHY it works that way (the reason, not the what) — the context a future reader cannot guess.', "Explain the WHY behind every hard-to-follow part, not just one — the reason it works that way, the context a future reader can't guess."),
  5: form('Write a short docs note and add in-code comments that explain the why behind each non-obvious part — so the next reader does not guess.', "Capture a short docs note and add in-code comments that explain the why behind each non-obvious part — so the next reader doesn't guess."),
});

/** REFACTORING (beginner) — keyword "organis". */
export const REFACTORING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Read what was just built once — does it still feel organised?', "Just one read of what was just built — does it still feel organised? — a quick clarity check, nothing changed yet."),
  2: form('Read it through and note anything messy or repeated that hurts how organised it is.', "Note anything messy or repeated in it that hurts how organised the code is."),
  3: form("1. Read through what was just built from start to finish — does it still feel organised and easy to follow?\n2. Share with me: is there anything that feels messy, repeated, or harder to understand than it needs to be?\n3. Then tell me: is there anything that should be tidied up before we add more features on top?", "Go through what was just built start to finish for whether it still feels organised and easy to follow, share what's messy or repeated, and call out anything to tidy before more features land on top."),
  4: form('Tidy the worst part before adding more: pull out the repeated bit or rename the confusing one, so it stays organised as it grows.', "Pull the worst part into shape before adding more — extract the repeated bit or rename the confusing one — so it stays organised as it grows."),
  5: form('Write a short cleanup note and do the tidy-up: the messy parts, and what you simplified or renamed — so the code stays organised before more lands on it.', "Capture a short cleanup note and do the tidy-up — the messy parts, and what you simplified or renamed — so the code stays organised before more lands on it."),
});

/** CORRECTION_SEEKING (beginner) — keyword "wrong". */
export const CORRECTION_SEEKING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Look again at what was built and find one thing that might be wrong.', "Just one thing that might be wrong in what was built — found by looking again, not confirmed fine."),
  2: form("Re-read it looking for what's wrong — not to confirm it's fine — and share what you find.", "Read it again hunting for what's wrong — not to confirm it's fine — and share what you find."),
  3: form("1. Look at what was just built again — but this time, find what might be wrong with it.\n2. Share what you find with me.\n3. Then tell me: does what you found make sense, or does something still seem off?", "Go back over what was just built hunting for what might be wrong this time, share what you find, and say whether it holds up or something still seems off."),
  4: form("Actively try to break your own work: assume something IS wrong, hunt for it, and judge whether what you find is real or a false alarm.", "Try to break your own work — assume something IS wrong, hunt it down, and judge whether what you find is real or a false alarm."),
  5: form("Write a short critique note: what you suspected was wrong, what you confirmed, and what's still uncertain — so a self-check catches what a quick look misses.", "Capture a short critique note — what you suspected was wrong, what you confirmed, and what's still uncertain — so a self-check catches what a quick look misses."),
});

/** PROBLEM_CORRECTION (beginner) — keyword "fix". */
export const PROBLEM_CORRECTION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Name one thing from earlier this session that may not be fixed.', "Just one thing from earlier this session that may not be fixed — named before moving on."),
  2: form("Look back at what looked wrong earlier and check it's actually fixed, not just moved past.", "Go back to what seemed wrong earlier and check it's actually fixed, not just moved past."),
  3: form("1. Think back through this session — was there anything that didn't work or looked wrong earlier on?\n2. Share with me: is that thing actually fixed now, or did we move on without dealing with it?\n3. Then check: are there any other problems in what was just built that haven't been properly sorted out?", "Trace back over this session for anything that didn't work or looked wrong, check whether it's actually fixed now or was moved past, and sort out any other unresolved problems in what was just built."),
  4: form('Track down each issue noticed this session and confirm it is fixed and verified — not silently carried forward — and re-test the fix.', "Confirm each issue noticed this session is actually fixed and verified — not silently carried forward — and re-test the fix."),
  5: form('Write a short loose-ends note: the issues noticed this session, which are fixed and verified, and which are still open — so nothing broken is quietly carried forward.', "Capture a short loose-ends note — the issues noticed this session, which are fixed and verified, and which remain open — so nothing broken is quietly carried forward."),
});

/** ACCESSIBILITY (beginner) — keyword "label". */
export const ACCESSIBILITY_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Check one button or link has a clear label saying what it does.', "Just one button or link, checked for a clear label saying what it does."),
  2: form('Check the main buttons and links have clear labels and can be reached by keyboard.', "Confirm the main buttons and links have clear labels and can be reached by keyboard."),
  3: form('1. Go through what was just built and check that every button and link has a clear label describing what it does. 2. Try tabbing through the whole feature using only the keyboard — no mouse. 3. Share what you find with me before we continue.', "Check every button and link for a clear label describing what it does, tab through the whole feature using only the keyboard, and share what you find before continuing."),
  4: form('Tab through the whole feature with no mouse and confirm every control has a clear label and is reachable in a sensible order.', "Move through the whole feature with the keyboard only and confirm every control has a clear label and a sensible focus order."),
  5: form('Write a short access note: the controls and their labels, the keyboard-only path through the feature, and anything unreachable — so it works without a mouse or sight of every label.', "Capture a short access note — the controls and their labels, the keyboard-only path through the feature, and anything unreachable — so it works without a mouse or sight of every label."),
});

/** DATA_VALIDATION (beginner) — keyword "data". */
export const DATA_VALIDATION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Try sending one piece of bad data and see what the feature does.', "Just one piece of bad data sent through, to see what the feature does with it."),
  2: form('Send a few kinds of bad data — missing, wrong type, unexpected — and note what happens.', "Feed the feature a few kinds of bad data — missing, wrong type, unexpected — and note what happens with each."),
  3: form('1. Think about what happens in this feature if someone sends the wrong data — a missing field, a number where text is expected, or something completely unexpected. 2. Try sending some bad data and see what happens. 3. Share what you find with me before we continue.', "Work out what happens if someone sends the wrong data — a missing field, a number where text is expected, or something unexpected — try some of it, and share what you find before continuing."),
  4: form('For each input, send deliberately wrong data (missing field, wrong type, junk) and confirm it is rejected cleanly with a clear message, not accepted or crashed.', "Push deliberately wrong data into every input (missing field, wrong type, junk) and confirm each is rejected cleanly with a clear message, not accepted or crashed."),
  5: form('Write a short validation note: the inputs, the bad data you tried for each, and how it is handled — so wrong data is caught at the edge, not deep inside.', "Capture a short validation note — the inputs, the bad data you tried for each, and how it's handled — so wrong data is caught at the edge, not deep inside."),
});
