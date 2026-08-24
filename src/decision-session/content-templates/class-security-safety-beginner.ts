/**
 * Security / safety `_BEGINNER` register overrides — plain-language, warm rewrites of the
 * security/safety content-template records. Structurally divergent (each is a full 5-column
 * ladder in beginner voice, not a vocabulary tweak of the base). Attached via
 * `registerOverrides.beginner`.
 *
 * Voice note: the option is the user's own next message TO the agent, so an event that the
 * user caused (e.g. a pasted secret) is phrased AGENT-NEUTRAL ("the secret that was pasted"),
 * never "the secret you pasted" (which the agent would read as itself).
 */

import type { LevelForm, RegisterOverride, MaturityLevel } from '../content-template-schema.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}
function structural(levelForms: Partial<Record<MaturityLevel, LevelForm>>): RegisterOverride {
  return { divergence: 'structurally-divergent', levelForms };
}

/** SECRET_IN_PROMPT (beginner) — keyword "secret". A pasted secret is no longer safe: replace it. */
export const SECRET_IN_PROMPT_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("The secret that was just pasted should be treated as no longer safe — make a new one and swap it in before continuing.", "Treat the pasted secret as already seen by others — making a new one and swapping it in comes first, before anything else."),
  2: form("Make a new secret to replace the one that was pasted, and delete the old one from the chat — once a secret is pasted, treat it as seen.", "Swap in a new secret and clear the old one from the chat too — a pasted secret that's still lying around can still be used."),
  3: form("1. The secret that was pasted should be treated as leaked. 2. Make a new one, swap it in, and remove the old one from the chat and anywhere it was saved. 3. Tell me once it's replaced.", "Check every place the old secret could still be — the chat, saved files, past commits — a leaked secret is only handled once every copy is gone."),
  4: form("Replace the pasted secret with a new one, then find every place the old secret might still be — the chat, saved files, past commits — and clear it, so the leaked secret is gone everywhere.", "After swapping it out, move the secret somewhere it won't get pasted again — the goal is that this can't happen next time, not just that it's cleaned up now."),
  5: form("Write a short note about the leaked secret: what it was for, that it was replaced, where it was cleared from, and one change that stops a secret being pasted again.", "Keep a short note on it — what the secret was for, that it's replaced, where it was cleared, and the change that stops a repeat — so the fix isn't forgotten."),
});

/** NO_VERSION_CONTROL (beginner) — keyword "version". Plain "start saving versions of the work". */
export const NO_VERSION_CONTROL_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Turn on version control for this project so the work is saved step by step — start by setting up a git project.", "Getting version control on now means the work is saved as you go — without it, one bad change has nothing to go back to."),
  2: form("Set up version control and save the first version, so there's always a working copy to go back to.", "Save that first version as a real working copy to return to — version control with nothing saved yet doesn't protect anything."),
  3: form("Set up version control for the project: start the git project, save the first version, and mark which files to skip (like generated files) so only the real work is versioned.", "Mark the throwaway files to skip as part of setting up version control — otherwise generated files clutter every saved version and can leak local paths."),
  4: form("Set up version control with a steady habit: save small versions along the way, skip the throwaway files, and connect an online copy so the versions are safe if the machine is lost.", "Save small versions as you go and push a copy online — version control only keeps the work safe if a copy lives somewhere other than this machine."),
  5: form("Write a short note on how this project saves versions: how to save a new version, how they're named, and which files to skip — so the habit is easy to repeat.", "Keep a short note on how versions are saved here — how to make one, how they're named, what to skip — so the habit is easy to keep up."),
});

/**
 * NO_BACKUP_SAFETY (beginner) — keyword "backup". Plain "keep a spare copy and check it works".
 * Same per-option safeguard as the base: making/scheduling a backup (cols 1–2) is safe, but an
 * actual restore overwrites the current data (cols 3–5) → those carry a plain confirm-seek.
 */
export const NO_BACKUP_SAFETY_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Make a backup of this project's important stuff, so there's a spare copy if the original is ever lost.", "Get one backup of the important stuff in place first — right now a single loss, a bad delete or a broken disk, takes it all."),
  2: form("Make a backup and set it to happen automatically on a regular basis, so the spare copy stays up to date.", "Put the backup on a schedule so the spare copy stays current — a backup made once and never refreshed is out of date fast."),
  3: form("Make a backup, then check it really works by doing a restore — because a restore overwrites what's there now, check with me before you run it.", "A backup that's never been brought back isn't really proven — try restoring it once. Since a restore overwrites what's there now, check with me before you run it."),
  4: form("Set up an automatic backup that keeps a few past copies, and every so often practice a restore to make sure the data really comes back — since a restore overwrites what's there, check with me before you run it.", "Make practising a restore a routine, not a one-off — a backup only counts if it really comes back when needed. Since a restore overwrites what's there, check with me before you run it."),
  5: form("Write a short note on how this project's backup works and practice a restore once: what's saved, how often, where it's kept, and the steps to bring it back — since a restore overwrites what's there, check with me first.", "Keep a short note on how the backup works and try a restore against it once, so bringing things back is a known routine. Since a restore overwrites what's there, check with me first."),
});

/**
 * NO_SEPARATE_ENVS (beginner) — keyword "environment". Plain "keep a separate place to try
 * changes, apart from the live one". Record-level sensitive (inherits l2SafeguardRequired +
 * l2SafeguardLine from the base — the override only swaps levelForms), so the engine appends the
 * confirm-seek to every beginner column. About SEPARATION only — not secrets storage.
 */
export const NO_SEPARATE_ENVS_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Set up a second environment for this project — a separate place to try changes — so nothing is changed straight on the live one.", "Stand up one environment apart from the live one so changes get a trial run first — right now every change lands straight where users are."),
  2: form("Set up a testing environment separate from the live one, and try every change there first, so a broken change is caught before real users see it.", "Send every change through the test environment first — a broken change caught there is nothing; the same change live is a real problem."),
  3: form("Give the project three separate environments — one to build in, one to test in, and the live one — each kept apart, so work in one doesn't break another.", "Keep each environment on its own so work in one can't spill into another — sharing setup is how a change meant for testing breaks the live one."),
  4: form("Set up the project's environments so a change moves along a path — build it, test it, then let it reach the live environment — with each kept separate and a change only moving forward once it holds up.", "Make a change move forward to the live environment only after it holds up in the one before — that path is what makes separate environments help instead of just getting in the way."),
  5: form("Write a short note on this project's environments: what the build, test, and live ones are each for, how a change moves between them, and what keeps them separate.", "Keep a short note on the environments — what each is for and how a change moves between them — so the setup is understood, not just built once."),
});

/**
 * NO_AUTOMATED_SECURITY_SCANNING (beginner) — keyword "scan". Plain "have something automatically
 * check the outside code for known problems". Fully de-jargoned (no SAST/CVE/CI). Record-level
 * sensitive (inherits l2SafeguardRequired + l2SafeguardLine — the override only swaps levelForms),
 * so the engine appends the confirm-seek to every beginner column.
 */
export const NO_AUTOMATED_SECURITY_SCANNING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Set up an automatic check that scans this project's building blocks for known security problems, so a risky one is caught early.", "Get an automatic scan watching the building blocks so a known-risky one is flagged early — most of this risk is already known and listed somewhere."),
  2: form("Add a scan that runs on its own and points out known security problems in the outside code this project uses, and look at what it finds before shipping.", "Have the scan run on its own and actually read what it finds before shipping — a scan nobody looks at is just noise."),
  3: form("Set up a security scan for this project that runs every time something changes: it checks the outside code for known problems, and flags anything that should be updated.", "Run the scan on every change, not just once, and plan to update whatever it flags — a scan with nothing done about it leaves the risk sitting there."),
  4: form("Make the security scan part of the project's automatic checks, so it runs on every change and a serious problem stops the change until the problem is dealt with.", "Build the scan into the automatic checks and let a serious problem stop the change — a scan that only warns gets skipped when things are busy."),
  5: form("Write a short note on this project's security scan: what it checks, how often it runs, and what happens when it finds something serious — so the scan stays a regular habit.", "Keep a short note on the scan — what it checks, how often, and what happens on a serious find — so it stays a regular habit, not a one-time thing."),
});
