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
  1: form('Pick the one part of what was just built you understand least and read it line by line until it makes sense.', 'The lightest step: the part you understand least read until it makes sense.'),
  2: form('Go through the main parts of what was just built and, for each, say in your own words what it does — so you actually understand it, not just recognise it.', 'A light pass: the main parts explained in your own words to confirm you understand them.'),
  3: form("1. Read through what was just built slowly — not to check if it looks right, but to understand what each part actually does.\n2. Share with me: is there anything you're not sure about or that doesn't make sense to you?\n3. Then tell me: is there any part you just accepted because it looked okay without actually understanding it?", "A slow read-through and shared comprehension check hasn't happened together yet."),
  4: form('Go through every part of what was just built and find the ones you could not explain to someone else without re-reading — then dig into each until you understand it well enough to explain it simply.', 'Beyond a read: every can\'t-explain part dug into until you understand it well enough to teach.'),
  5: form('Write a short understanding note: for each main part, what it does, why it was built that way, and how the pieces fit — so your understanding is written down, not just in your head.', 'A durable understanding note of what each part does and why.'),
});

/** NO_PUSHBACK (beginner) — keyword "suggestion". File at col-5. */
export const NO_PUSHBACK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Take the one suggestion in what was just built you accepted fastest and check whether it was actually the best call.', 'The lightest step: the fastest-accepted suggestion checked for real.'),
  2: form('Go through the main suggestions used in what was just built and, for each, ask whether you checked the reasoning or just went with it because it sounded right.', 'A light pass: the main suggestions checked for real reasoning, not just confidence.'),
  3: form("1. Look at the last few suggestions made while building this feature.\n2. Share with me: is there anything you accepted just because it sounded right, without checking if it was really the best option?\n3. Then pick one and tell me: why did you go with that suggestion over other ways of doing it?", "The looked-right-without-checking pushback hasn't been talked through together."),
  4: form('Go through every important suggestion used in what was just built and push back on each: name what it assumes, find one other way it skipped, and check it against the docs or a quick test instead of trusting how it sounded.', 'Beyond spotting them: every suggestion pushed back on with an assumption, an alternative, and an independent check.'),
  5: form('Write a short note on the suggestions: per important one, what it assumed, the alternative you found, the check you ran, and your keep-or-change call — so nothing stands just because it sounded right.', "A durable note of each suggestion's assumption, check, and keep-or-change call."),
});

/** CONTEXT_LOSS (beginner) — keyword "track". File at col-5. */
export const CONTEXT_LOSS_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Write one line to keep track of where what was just built stands — what is done and what is next.', 'The lightest step: one line to keep track of done-and-next.'),
  2: form('Note the main things to keep track of this session — the key decisions made and what still needs doing — as a quick re-anchor.', 'A light pass: the main decisions and open work tracked as a re-anchor.'),
  3: form("1. Think about everything we've done with what was just built this session. 2. Write down what's working and what still needs to be done. 3. Share that with me before we keep going — it'll help us stay on track.", "Where we are with this feature hasn't been thought through."),
  4: form("Pull together the full picture to keep track of: the limits you're working within, the things you assumed but haven't confirmed, and the thread from the original goal to now — so nothing quietly slips.", 'Beyond a recap: the constraints, unconfirmed assumptions, and goal-to-now thread tracked.'),
  5: form('Write a short note to keep track of the session: the decisions made, where things stand, the open limits and assumptions, and the next two or three steps — the anchor for the rest of the session.', 'A durable note tracking the decisions, state, and next steps.'),
});

/** DECISION_FATIGUE_PATTERN (beginner) — keyword "check". File at col-5. */
export const DECISION_FATIGUE_PATTERN_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Check the most recent change in what was just built with fresh eyes — a long run of quick yeses can let something slip.', 'The lightest step: one fresh-eyes check on the latest change.'),
  2: form('Check the recent run of changes for anything you accepted quickly — flag any assumption or edge case that slipped past.', 'A light pass: the recent streak checked for slipped assumptions and edge cases.'),
  3: form('Look back at the last few suggestions made — is there anything that looks right but you have not double-checked?', "The double-check on recent suggestions hasn't been done."),
  4: form("Go back over the whole run of quick yeses and check it properly: re-run the changed parts, work the key assumptions out again from scratch, and compare what you accepted against what you'd write now — flag every difference.", 'Beyond a re-read: the streak checked by re-testing and re-deriving, with differences flagged.'),
  5: form('Write a short check note: the changes you re-ran, the assumptions you re-derived, the edge cases you re-tested, and what needs fixing — then go back to checking each change instead of accepting on a roll.', 'A durable check note of the re-run streak and the fixes, with the steady checking restored.'),
});

/** WORK_RHYTHM_CHECK (beginner) — keyword "read". Behavioural (no file). */
export const WORK_RHYTHM_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Read the last response in full before sending the next one — confirm it's right, don't just skim it.", 'The lightest step: the last response read in full before the next.'),
  2: form('Read the last change closely: follow the main logic and confirm the assumptions hold before you continue.', 'A light pass: the last change read closely and its assumptions confirmed.'),
  3: form('Read the last response carefully before continuing — is there anything that looks right but you have not actually checked?', "The careful read on the last response hasn't been done."),
  4: form('Read every response before moving on, not just the last: follow what it does, check the state it assumes, confirm it handles errors, and flag anything generated but never read.', 'Beyond the last: every response read and checked before the next, nothing left unread.'),
  5: form('Make reading every response in full a steady habit — check its logic, assumptions, and completeness before the next message — so no unread change ever builds on another.', 'A standing habit: every response read in full before the next message.'),
});

/** FOCUS_DRIFT_DETECTION (beginner) — keyword "finish". Behavioural (no file). */
export const FOCUS_DRIFT_DETECTION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Pick the single most important open thing in this session and finish it before starting anything else.', 'The lightest step: one thing finished before the next is started.'),
  2: form("List what's open in this session, pick the most important, and finish it before touching the others.", 'A light pass: the open work named and one finished first.'),
  3: form('Let us focus on one thing at a time — what is the most important thing to finish in this session before we start anything new?', "The one-thing-at-a-time discipline hasn't been applied."),
  4: form("Take stock of everything open in this session, rank it by importance, decide what 'finished' means for the top one, and commit to finishing it before any switch.", 'Beyond picking one: every open thing ranked and the top one committed to finish.'),
  5: form("Make finishing one thing before starting another a steady habit — carry the current thing to a clear finish, hold off every new one until it's done, then pick the next.", 'A standing habit: one thing carried to a finish before any other is opened.'),
});

/** SESSION_LENGTH_CHECKPOINT (beginner) — keyword "session". File at col-5. */
export const SESSION_LENGTH_CHECKPOINT_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Note a quick checkpoint for this session — what's done and what the next step is.", 'The lightest step: a quick session checkpoint of done-and-next.'),
  2: form('Sum up this session so far: the decisions made and what still remains, as a clear anchor before continuing.', "A light pass: the session's decisions and remaining work summed up."),
  3: form('Summarize what we have built so far in this session — what is working, what is still in progress, and what we still need to do.', "A session summary hasn't been done."),
  4: form('Check this long session against what you set out to do: what got finished, what got put off, the trade-offs you hit, and the decisions worth revisiting — so the next stretch starts from a clear picture.', 'Beyond a summary: the session measured against its goal, with deferrals and decisions named.'),
  5: form("Write a short session checkpoint note: the decisions made, where things stand, what's been put off, the open limits, and the next steps — the anchor the next stretch of the session builds on.", 'A durable session checkpoint note of decisions, state, and next steps.'),
});

/** PROGRESS_CONSOLIDATION_GAP (beginner) — keyword "note". File at col-5. */
export const PROGRESS_CONSOLIDATION_GAP_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Note the one most important thing about what was just built before continuing.', 'The lightest step: the single most important point noted.'),
  2: form('Note the current progress: what was built and the key decisions made, before the session moves on.', 'A light pass: the built work and key decisions noted.'),
  3: form('Write a short note about what we built in this session, even just a few sentences, before we continue.', "A short note about what we built hasn't been written."),
  4: form("Note the full picture of what was just built: the features done, why they were built that way, what was put off, and what's still left — so the session's progress isn't left only in your head.", 'Beyond a few sentences: the full progress noted with rationale, deferrals, and what is left.'),
  5: form('Write the session\'s progress into a note in the project docs: what was built, why it was built this way, what was deferred, and what remains — a lasting note, not something only you remember.', 'A durable progress note of what was built, why, and what remains.'),
});
