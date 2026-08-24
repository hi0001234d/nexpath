/**
 * Class-5 session-quality `_BEGINNER` register overrides.
 *
 * Structurally-divergent beginner-register rewrites of all 8 class-5 session/meta-cognitive
 * signals (each has a frozen beginner variant). Each is a full 5-column ladder: col-3
 * frozen-beginner verbatim, cols 1/2/4/5 in plain beginner voice carrying the variant's own
 * keyword, col-4 adding a distinct named practice that col-5 absorbs.
 *
 * F2 split mirrors the base records: six signals produce a written note at col-5
 * (comprehension, no-pushback, context-loss, decision-fatigue, session-checkpoint,
 * progress) — the three session-capture and three verification-of-output signals — while
 * the two pure pacing/sequencing habits (work-rhythm, focus-drift) stay behavioural and
 * carry no file at col-5. No class-5 signal concerns a sensitive action, so none is
 * flagged and the engine appends no confirm-seek. Attached via registerOverrides.beginner.
 */

import type { LevelForm, RegisterOverride, MaturityLevel } from '../content-template-schema.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}
function structural(levelForms: Partial<Record<MaturityLevel, LevelForm>>): RegisterOverride {
  return { divergence: 'structurally-divergent', levelForms };
}

/** COMPREHENSION (beginner) — keyword "understand". File at col-5. */
export const COMPREHENSION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Pick the one part of what was just built you understand least and read it line by line until it makes sense.', "Just the part you understand least — read that one line by line until it makes sense, not the whole thing."),
  2: form('Go through the main parts of what was just built and, for each, say in your own words what it does — so you actually understand it, not just recognise it.', "For each main part, say in your own words what it does — enough to understand it, not just recognise it."),
  3: form("1. Read through what was just built slowly — not to check if it looks right, but to understand what each part actually does.\n2. Share with me: is there anything you're not sure about or that doesn't make sense to you?\n3. Then tell me: is there any part you just accepted because it looked okay without actually understanding it?", "Go slowly to grasp what each part actually does, flag anything you're unsure of, and call out any part you accepted because it looked okay without really understanding it."),
  4: form('Go through every part of what was just built and find the ones you could not explain to someone else without re-reading — then dig into each until you understand it well enough to explain it simply.', "Find every part you couldn't explain to someone else without re-reading, and dig into each until you understand it well enough to explain it simply."),
  5: form('Write a short understanding note: for each main part, what it does, why it was built that way, and how the pieces fit — so your understanding is written down, not just in your head.', "Capture a short understanding note — for each main part, what it does, why it was built that way, and how the pieces fit — so it's written down, not just in your head."),
});

/** NO_PUSHBACK (beginner) — keyword "suggestion". File at col-5. */
export const NO_PUSHBACK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Take the one suggestion in what was just built you accepted fastest and check whether it was actually the best call.', "Just the suggestion you accepted fastest — check whether it was actually the best call, before the rest."),
  2: form('Go through the main suggestions used in what was just built and, for each, ask whether you checked the reasoning or just went with it because it sounded right.', "For each main suggestion, ask whether you checked the reasoning or just went with it because it sounded right."),
  3: form("1. Look at the last few suggestions made while building this feature.\n2. Share with me: is there anything you accepted just because it sounded right, without checking if it was really the best option?\n3. Then pick one and tell me: why did you go with that suggestion over other ways of doing it?", "Call out any suggestion you accepted just because it sounded right without checking it was the best option, then pick one and say why you went with it over other ways."),
  4: form('Go through every important suggestion used in what was just built and push back on each: name what it assumes, find one other way it skipped, and check it against the docs or a quick test instead of trusting how it sounded.', "Push back on each important suggestion — name what it assumes, find one other way it skipped, and check it against the docs or a quick test, not just how it sounded."),
  5: form('Write a short note on the suggestions: per important one, what it assumed, the alternative you found, the check you ran, and your keep-or-change call — so nothing stands just because it sounded right.', "Capture a short note on the suggestions — per important one: what it assumed, the alternative you found, the check you ran, and your keep-or-change call — so nothing stands just because it sounded right."),
});

/** CONTEXT_LOSS (beginner) — keyword "track". File at col-5. */
export const CONTEXT_LOSS_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Write one line to keep track of the main decision so far and what the next step depends on.', "Just one line to track the main decision so far and what the next step depends on."),
  2: form("Note the main things to keep track of this session — the key decisions made, the limits you're working within, and what still needs doing — as a quick re-anchor.", "Keep track of the main things — the key decisions, the limits you're working within, and what still needs doing — as a quick re-anchor."),
  3: form("1. Think about everything we've done with what was just built this session. 2. Write down what's working and what still needs to be done. 3. Share that with me before we keep going — it'll help us stay on track.", "Write down what's working and what still needs doing across the session, and share it with me before we keep going."),
  4: form("Pull together the full picture to keep track of: the limits you're working within, the things you assumed but haven't confirmed, and the thread from the original goal to now — so nothing quietly slips.", "Track the full picture — the limits you're working within, the things you assumed but haven't confirmed, and the thread from the original goal to now — so nothing quietly slips."),
  5: form('Write a short note to keep track of the session: the decisions made, where things stand, the open limits and assumptions, and the next two or three steps — the anchor for the rest of the session.', "Capture a short note to track the session — the decisions made, where things stand, the open limits and assumptions, and the next two or three steps — the anchor for the rest."),
});

/** DECISION_FATIGUE_PATTERN (beginner) — keyword "check". File at col-5. */
export const DECISION_FATIGUE_PATTERN_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Check the most recent change in what was just built with fresh eyes — a long run of quick yeses can let something slip.', "Just one fresh-eyes check on the latest change — a long run of quick yeses can let something slip."),
  2: form('Check the recent run of changes for anything you accepted quickly — flag any assumption or edge case that slipped past.', "Scope the check to the recent run of changes — flag any assumption or edge case that slipped past while you accepted quickly."),
  3: form('Look back at the last few suggestions made — is there anything that looks right but you have not double-checked?', "Go back over the last few suggestions and flag anything that looks right but you haven't actually double-checked."),
  4: form("Go back over the whole run of quick yeses and check it properly: re-run the changed parts, work the key assumptions out again from scratch, and compare what you accepted against what you'd write now — flag every difference.", "Check the whole run properly — re-run the changed parts, work the key assumptions out again from scratch, and compare what you accepted against what you'd write now; flag every difference."),
  5: form('Write a short check note: the changes you re-ran, the assumptions you re-derived, the edge cases you re-tested, and what needs fixing — then go back to checking each change instead of accepting on a roll.', "Capture a short check note — the changes you re-ran, the assumptions you re-derived, the edge cases you re-tested, and what needs fixing — then go back to checking each change instead of accepting on a roll."),
});

/** WORK_RHYTHM_CHECK (beginner) — keyword "read". Behavioural (no file). */
export const WORK_RHYTHM_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Read the last response in full before sending the next one — confirm it's right, don't just skim it.", "Just the last response — read it in full and confirm it's right before the next one, don't skim."),
  2: form('Read the last change closely: follow the main logic and confirm the assumptions hold before you continue.', "Scope the read to the last change — follow its main logic and confirm the assumptions hold before continuing."),
  3: form('Read the last response carefully before continuing — is there anything that looks right but you have not actually checked?', "Go through the last response carefully before continuing and flag anything that looks right but you haven't actually checked."),
  4: form('Read every response before moving on, not just the last: follow what it does, check the state it assumes, confirm it handles errors, and flag anything generated but never read.', "Extend the read to every response, not just the last — follow what it does, check the state it assumes, confirm it handles errors, and flag anything generated but never read."),
  5: form('Make reading every response in full a steady habit — check its logic, assumptions, and completeness before the next message — so no unread change ever builds on another.', "Set reading every response in full as a steady habit — check its logic, assumptions, and completeness before the next message, so no unread change builds on another."),
});

/** FOCUS_DRIFT_DETECTION (beginner) — keyword "finish". Behavioural (no file). */
export const FOCUS_DRIFT_DETECTION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Pick the single most important open thing in this session and finish it before starting anything else.', "Just the single most important open thing — finish that one before starting anything else."),
  2: form("List what's open in this session, pick the most important, and finish it before touching the others.", "Name what's open, pick the most important, and finish that before touching the others."),
  3: form('Let us focus on one thing at a time — what is the most important thing to finish in this session before we start anything new?', "Focus on one thing at a time — settle which is the most important to finish this session before starting anything new."),
  4: form("Take stock of everything open in this session, rank it by importance, decide what 'finished' means for the top one, and commit to finishing it before any switch.", "Rank everything open by importance, decide what 'finished' means for the top one, and commit to finishing it before any switch."),
  5: form("Make finishing one thing before starting another a steady habit — carry the current thing to a clear finish, hold off every new one until it's done, then pick the next.", "Keep finishing one thing before starting another as a steady habit — carry the current one to a clear finish, hold off every new one until it's done, then pick the next."),
});

/** SESSION_LENGTH_CHECKPOINT (beginner) — keyword "session". File at col-5. */
export const SESSION_LENGTH_CHECKPOINT_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Note a quick checkpoint for this session — what's done and what the next step is.", "Just a quick session checkpoint — what's done and what the next step is."),
  2: form('Sum up this session so far: the decisions made and what still remains, as a clear anchor before continuing.', "Pull this session's decisions and what remains into a clear anchor before continuing."),
  3: form('Summarize what we have built so far in this session — what is working, what is still in progress, and what we still need to do.', "Lay out what's built so far — what's working, what's still in progress, and what's still to do."),
  4: form('Check this long session against what you set out to do: what got finished, what got put off, the trade-offs you hit, and the decisions worth revisiting — so the next stretch starts from a clear picture.', "Measure this long session against what you set out to do — what got finished, what got put off, the trade-offs you hit, and the decisions worth revisiting — so the next stretch starts clear."),
  5: form("Write a short session checkpoint note: the decisions made, where things stand, what's been put off, the open limits, and the next steps — the anchor the next stretch of the session builds on.", "Capture a short session checkpoint note — the decisions made, where things stand, what's been put off, the open limits, and the next steps — the anchor the next stretch builds on."),
});

/** PROGRESS_CONSOLIDATION_GAP (beginner) — keyword "note". File at col-5. */
export const PROGRESS_CONSOLIDATION_GAP_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Note the one most important thing about what was just built before continuing.', "Write down just the single most important point about what was built, as a note, before continuing."),
  2: form('Note the current progress: what was built and the key decisions made, before the session moves on.', "Capture the current progress as a note — what was built and the key decisions — before the session moves on."),
  3: form('Write a short note about what we built in this session, even just a few sentences, before we continue.', "Put down a few sentences on what we built this session before continuing."),
  4: form("Note the full picture of what was just built: the features done, why they were built that way, what was put off, and what's still left — so the session's progress isn't left only in your head.", "Get the full picture into the note — the features done, why they were built that way, what was put off, and what's still left — so the progress isn't only in your head."),
  5: form('Write the session\'s progress into a note in the project docs: what was built, why it was built this way, what was deferred, and what remains — a lasting note, not something only you remember.', "Capture the session's progress as a note in the project docs — what was built, why it was built this way, what was deferred, and what remains — a lasting record, not just in memory."),
});
