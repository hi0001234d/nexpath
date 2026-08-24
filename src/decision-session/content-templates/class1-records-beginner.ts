/**
 * Class-1 stage-transition `_BEGINNER` register overrides (§4.E2 item 2 / §6.1 gate 3).
 *
 * Structurally-divergent beginner-register rewrites of the six class-1 stage
 * transitions that have a frozen `_BEGINNER` variant (TASK_REVIEW has none — it stays
 * vocab-adaptable). Each is a full 5-maturity-column ladder: column 3 is the frozen
 * beginner shipped headline (verbatim) and columns 1/2/4/5 radiate the same practice in
 * the plain, encouraging beginner voice. The beginner variant carries its OWN plain
 * keyword (the frozen beginner text deliberately avoids the jargon keyword the base
 * record uses), asserted independently by the T1-variant test.
 *
 * The two production signals (REVIEW_TO_RELEASE, RELEASE_TO_FEEDBACK) are flagged
 * sensitive at the RECORD level; the engine appends that record's `l2SafeguardLine` to
 * whichever register's forms are served, so these overrides carry no baked seek.
 *
 * Attached to the base records via `registerOverrides.beginner` (structurally-divergent).
 */

import type { LevelForm, RegisterOverride, MaturityLevel } from '../content-template-schema.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}
function structural(levelForms: Partial<Record<MaturityLevel, LevelForm>>): RegisterOverride {
  return { divergence: 'structurally-divergent', levelForms };
}

/** IDEA → PRD (beginner) — keyword "understanding". */
export const IDEA_TO_PRD_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form(
    "Tell me in one line what you're building, so we share a basic understanding before going further.",
    "Keep it to one plain line — just enough shared understanding of what's being built to move forward. Don't plan or design yet.",
  ),
  2: form(
    "Describe what you're building and who it's for, and check we share the same understanding before planning.",
    "Add who it's for, and check back with me that we share the same understanding before any planning starts.",
  ),
  3: form(
    "1. Help me describe what I'm building in plain terms — what it does and who it's for.\n2. Share your understanding with me before we go further so I can confirm we're on the same page.\n3. Then tell me: what's the most important thing to figure out before we start building?",
    "First say back to me, in plain words, what you understand I'm building — so we catch any mismatch before we start planning. Keep it simple, no jargon.",
  ),
  4: form(
    "Before planning, name the one assumption that, if it's wrong, would most change what you build — and check we share that understanding, not just the description.",
    "Surface the single riskiest assumption — the one that, if wrong, changes the most — and confirm we share that understanding, not just the description.",
  ),
  5: form(
    "Write a short plan note: what you're building, who it's for, what 'done' looks like, and the riskiest assumption to check — so we start from a shared, written understanding.",
    "Capture it as a short plan note — what it is, who it's for, what 'done' means, and the riskiest assumption — so we start from a written, shared understanding.",
  ),
});

/** PRD → ARCHITECTURE (beginner) — keyword "part". */
export const PRD_TO_ARCHITECTURE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form(
    'Name in one line the main part of how this fits together before we plan the build.',
    "Just name the main part of how it fits together — one line, no full plan yet.",
  ),
  2: form(
    "List the main parts of what we're building and how they connect, in plain words.",
    "Cover each main part and how it connects, in plain words — no technical detail yet.",
  ),
  3: form(
    "1. List the main parts of what we're building and how they connect — in plain language, no technical terms.\n2. Share that list with me before we move on so I can confirm it covers everything.\n3. Then tell me: what's the one thing we need to decide before writing any code?",
    "Say back to me how the pieces fit together in plain language — no code until we agree it covers everything.",
  ),
  4: form(
    'List the parts and how they connect, then point to the part most likely to be missing or to cause trouble, and settle it before any code.',
    "Point to the part most likely to be missing or to cause trouble, and settle that one part before any code.",
  ),
  5: form(
    'Write a short structure note: the main parts, how they connect, the part most likely to cause trouble, and the key decision to make first — so we build from a clear, shared picture.',
    "Capture it as a short structure note — the main parts, how they connect, the riskiest part, and the first decision to make — so we build from a clear shared picture.",
  ),
});

/** ARCHITECTURE → TASKS (beginner) — keyword "step". */
export const ARCHITECTURE_TO_TASKS_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form(
    'Name the first small step to build before you start.',
    "Just the first small step to build — one thing to start on, nothing more planned yet.",
  ),
  2: form(
    'List the next few steps in order, each small enough to finish in one sitting.',
    "Keep each step small enough to finish in one sitting, and put them in the order you'd do them.",
  ),
  3: form(
    "1. Break this down into small steps — each one should be something you can build in a single session.\n2. Share the list with me so I can check the order makes sense before you start.\n3. Then tell me: what's the first thing to build that shows the whole thing actually works?",
    "Split this into small steps I can start on, in a sensible order, and show me the first one that proves the whole thing works.",
  ),
  4: form(
    'Order the small steps so the one with the most unknowns comes early — prove that riskiest step works before building the rest.',
    "Put the step with the most unknowns first, and prove that riskiest step works before building the rest.",
  ),
  5: form(
    "Write a steps note: the ordered small steps, what 'done' is for each, and the risky step to prove first — so you always know the next step and tackle risk early.",
    "Capture it as a steps note — the ordered small steps, what 'done' means for each, and the risky step to prove first — so the next step is always clear and risk comes early.",
  ),
});

/** IMPLEMENTATION → REVIEW (beginner) — keyword "work". */
export const IMPLEMENTATION_TO_REVIEW_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form(
    'Quickly check the work from this phase still works before moving on.',
    "Keep it quick — just confirm this phase's work still runs before moving on, not a full review.",
  ),
  2: form(
    'Go through the main things built this phase and confirm they work together.',
    "Check the main things built and confirm the work holds together — not each detail yet.",
  ),
  3: form(
    "1. Go through everything built in this phase — does it all work together the way it should?\n2. Share that with me before we move on and flag anything that looks incomplete or broken.\n3. Then check: is there anything a real person using this could run into that we haven't covered?",
    "Run through everything built this phase, flag anything incomplete or broken, and check what a real user could run into.",
  ),
  4: form(
    'Actually run the main thing this phase built — don\'t just read it — and note where the work breaks or a real user could get stuck.',
    "Run the main thing for real instead of reading it, and note where the work breaks or a real user could get stuck.",
  ),
  5: form(
    "Write a short check note: what you ran and what worked, what's broken or incomplete, and the user cases not yet covered — so the next phase starts on tested work.",
    "Capture it as a short check note — what you ran and what worked, what's broken, and the user cases not covered — so the next phase starts on tested work.",
  ),
});

/** REVIEW → RELEASE (beginner) — keyword "ship"; record-level sensitive (production release). */
export const REVIEW_TO_RELEASE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form(
    'Before you ship, do a quick check that the main thing still works.',
    "Keep the pre-ship check to the main thing — just confirm it still works, nothing more yet.",
  ),
  2: form(
    'Before shipping, run the main checks that need to pass and share the results with me.',
    "Run only the checks that must pass before you ship, and share the results with me.",
  ),
  3: form(
    "1. Check that everything still works — go through the main things that need to pass before we ship.\n2. Share the results with me before we release anything.\n3. Then tell me: is there anything that could go wrong once this is live that we haven't tested in here?",
    "Go through the must-pass checks, share the results with me, and call out anything that could break once it's live.",
  ),
  4: form(
    'Before you ship, try it once in a setup close to the real one, so problems surface here instead of after going live.',
    "Try it once in a setup close to the real one before you ship, so problems surface here, not after going live.",
  ),
  5: form(
    'Write a short ship checklist: what must pass, the results, a dry-run in a real-ish setup, the live risks, and what to do if something breaks after shipping — so going live is deliberate.',
    "Capture it as a short ship checklist — what must pass, the results, a dry-run in a real-ish setup, the live risks, and the plan if something breaks after — so going live is deliberate.",
  ),
});

/** RELEASE → FEEDBACK (beginner) — keyword "break"; record-level sensitive (production monitoring). */
export const RELEASE_TO_FEEDBACK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form(
    "Now it's live, check the main thing works — and that you'd know if it breaks.",
    "Confirm the live feature works and that you'd actually be told if it breaks.",
  ),
  2: form(
    "Try the main thing now it's live, and confirm you'd be told if it breaks later.",
    "Run the live feature once and make sure a break later would actually reach you, not pass silently.",
  ),
  3: form(
    "1. Check that what was just built is actually working now that it's live — try the main thing it does and see if it works the way you expected.\n2. Share what you find with me before we move on and flag anything that looks off or unexpected.\n3. Then check: will we know if something breaks after we stop watching, or will it fail without showing an obvious error?",
    "Try the main thing in the live version, flag anything off, and check whether a later break would show an obvious error or fail silently.",
  ),
  4: form(
    'Set up the one alert that would tell you if the main thing breaks, so a silent failure can\'t slip by after you stop watching.',
    "Put in the one alert that fires if the main thing breaks, so a silent failure can't slip by after you stop watching.",
  ),
  5: form(
    'Write a short monitoring note: how you will know it works, the alert that fires if it breaks, and what to do when it does — so a break is caught, not silent.',
    "Capture it as a short monitoring note — how you'll know it works, the alert that fires on a break, and what to do when it does — so a break is caught, not silent.",
  ),
});
