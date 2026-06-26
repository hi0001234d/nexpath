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
    'The lightest step: a one-line shared understanding of what is being built.',
  ),
  2: form(
    "Describe what you're building and who it's for, and check we share the same understanding before planning.",
    'A light pass: what it is and who it is for, with a shared understanding confirmed.',
  ),
  3: form(
    "1. Help me describe what I'm building in plain terms — what it does and who it's for.\n2. Share your understanding with me before we go further so I can confirm we're on the same page.\n3. Then tell me: what's the most important thing to figure out before we start building?",
    "I'm at the moment where talking about the idea turns into actually planning it; I need a shared understanding before going further.",
  ),
  4: form(
    "Before planning, write down what it does, who it's for, and the one thing most important to figure out first — then confirm we share that understanding.",
    'Beyond a description: the key unknown named and the understanding confirmed before planning.',
  ),
  5: form(
    "Write a short plan note: what you're building, who it's for, what 'done' looks like, and the big open question — so we start from a shared, written understanding.",
    'A durable plan note capturing the shared understanding before building.',
  ),
});

/** PRD → ARCHITECTURE (beginner) — keyword "part". */
export const PRD_TO_ARCHITECTURE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form(
    'Name in one line the main part of how this fits together before we plan the build.',
    'The lightest step: the main part of how it fits together named.',
  ),
  2: form(
    "List the main parts of what we're building and how they connect, in plain words.",
    'A light pass: the main parts and how they connect, listed plainly.',
  ),
  3: form(
    "1. List the main parts of what we're building and how they connect — in plain language, no technical terms.\n2. Share that list with me before we move on so I can confirm it covers everything.\n3. Then tell me: what's the one thing we need to decide before writing any code?",
    'The spec feels solid; I need to know how the pieces fit together before any code gets written.',
  ),
  4: form(
    'List the parts and how they connect, then name the one thing we must decide before any code — and check the list covers everything.',
    'Beyond a list: the parts, their connections, and the key decision before code.',
  ),
  5: form(
    'Write a short structure note: the main parts, how they connect, and the key decision to make first — so we build from a clear, shared picture.',
    'A durable structure note of the parts, their connections, and the first decision.',
  ),
});

/** ARCHITECTURE → TASKS (beginner) — keyword "step". */
export const ARCHITECTURE_TO_TASKS_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form(
    'Name the first small step to build before you start.',
    'The lightest step: the first build step named.',
  ),
  2: form(
    'List the next few steps in order, each small enough to finish in one sitting.',
    'A light pass: the next steps in order, each session-sized.',
  ),
  3: form(
    "1. Break this down into small steps — each one should be something you can build in a single session.\n2. Share the list with me so I can check the order makes sense before you start.\n3. Then tell me: what's the first thing to build that shows the whole thing actually works?",
    'I see how the pieces fit; I need this broken into steps I can actually start on, in order.',
  ),
  4: form(
    'Break the work into small ordered steps, each finishable in one session, and name the first step that shows the whole thing works.',
    'Beyond a list: ordered session-sized steps with the proving step first.',
  ),
  5: form(
    "Write a steps note: the ordered small steps, what 'done' is for each, and the first step that proves it all works — so you always know the next step.",
    'A durable steps note of ordered, done-defined build steps.',
  ),
});

/** IMPLEMENTATION → REVIEW (beginner) — keyword "work". */
export const IMPLEMENTATION_TO_REVIEW_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form(
    'Quickly check the work from this phase still works before moving on.',
    'The lightest step: the phase work given a quick does-it-work check.',
  ),
  2: form(
    'Go through the main things built this phase and confirm they work together.',
    'A light pass: the main work checked for working together.',
  ),
  3: form(
    "1. Go through everything built in this phase — does it all work together the way it should?\n2. Share that with me before we move on and flag anything that looks incomplete or broken.\n3. Then check: is there anything a real person using this could run into that we haven't covered?",
    'A whole phase just finished; I need to know it all works together before I start the next one.',
  ),
  4: form(
    "Go through everything built this phase, confirm it works together, flag anything broken, and check what a real user might hit that the work doesn't cover.",
    'Beyond a check: the whole phase work verified together with user-facing gaps named.',
  ),
  5: form(
    "Write a short check note: what works, what's broken or incomplete, and the user cases not yet covered — so the next phase starts on solid work.",
    'A durable check note of what works and the gaps before the next phase.',
  ),
});

/** REVIEW → RELEASE (beginner) — keyword "ship"; record-level sensitive (production release). */
export const REVIEW_TO_RELEASE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form(
    'Before you ship, do a quick check that the main thing still works.',
    'The lightest step: a quick works-check before you ship.',
  ),
  2: form(
    'Before shipping, run the main checks that need to pass and share the results with me.',
    'A light pass: the main pre-ship checks run and shared.',
  ),
  3: form(
    "1. Check that everything still works — go through the main things that need to pass before we ship.\n2. Share the results with me before we release anything.\n3. Then tell me: is there anything that could go wrong once this is live that we haven't tested in here?",
    "Review is done; this is the last step before going live, and I need to be sure it's actually ready.",
  ),
  4: form(
    "Before shipping, go through everything that must pass, share the results, and name anything that could go wrong once it's live that hasn't been tested.",
    'Beyond the checks: the pre-ship results shared and the live risks named.',
  ),
  5: form(
    'Write a short ship checklist: what must pass, the results, the live risks, and what to do if something breaks after shipping — so going live is deliberate.',
    'A durable ship checklist of must-pass checks and the live-risk plan.',
  ),
});

/** RELEASE → FEEDBACK (beginner) — keyword "break"; record-level sensitive (production monitoring). */
export const RELEASE_TO_FEEDBACK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form(
    "Now it's live, check the main thing works — and that you'd know if it breaks.",
    'The lightest step: the live feature checked, and break-alerting confirmed.',
  ),
  2: form(
    "Try the main thing now it's live, and confirm you'd be told if it breaks later.",
    'A light pass: the live feature tried and break-notification confirmed.',
  ),
  3: form(
    "1. Check that what was just built is actually working now that it's live — try the main thing it does and see if it works the way you expected.\n2. Share what you find with me before we move on and flag anything that looks off or unexpected.\n3. Then check: will we know if something breaks after we stop watching, or will it fail without showing an obvious error?",
    "It just went live; I need to know it actually works in production and that I'll find out if it breaks later.",
  ),
  4: form(
    'Check what is live actually works, share what you find, and make sure something will tell you if it breaks after you stop watching — not fail silently.',
    'Beyond a check: the live feature verified with a break-signal in place.',
  ),
  5: form(
    'Write a short monitoring note: how you will know it works, what alerts you if it breaks, and what to do when one fires — so a break is caught, not silent.',
    'A durable monitoring note of how a break gets caught and handled.',
  ),
});
