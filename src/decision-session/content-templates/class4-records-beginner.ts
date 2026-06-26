/**
 * Class-4 release / observability / infrastructure `_BEGINNER` register overrides.
 *
 * Structurally-divergent beginner-register rewrites of the 7 class-4 signals that have
 * a frozen beginner variant (OBSERVABILITY, ROLLBACK_PLANNING, DEPLOYMENT_PLANNING,
 * DEPENDENCY_MGMT, ENV_AND_SECRETS, CI_PIPELINE, RATE_LIMITING). The 1 casual-only
 * signal (DEPENDENCY_AUDIT_GAP) has no frozen beginner variant → vocab-adaptable.
 *
 * Each is a full 5-column ladder: col-3 frozen-beginner verbatim, cols 1/2/4/5 in plain
 * beginner voice carrying the variant's own keyword, col-4 adding a distinct named
 * practice that col-5 absorbs into a written record (every class-4 heaviest column
 * yields a file). Every class-4 signal is intrinsically sensitive: each base record
 * carries `l2SafeguardRequired` + an action-specific `l2SafeguardLine`, and the override
 * inherits both (it only swaps `levelForms`), so the engine appends the confirm-seek as
 * the last line of every served beginner column too. Attached via registerOverrides.beginner.
 */

import type { LevelForm, RegisterOverride, MaturityLevel } from '../content-template-schema.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}
function structural(levelForms: Partial<Record<MaturityLevel, LevelForm>>): RegisterOverride {
  return { divergence: 'structurally-divergent', levelForms };
}

/** OBSERVABILITY (beginner) — keyword "log". */
export const OBSERVABILITY_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Add a log line for the one part of what was just built that would fail silently — so a break leaves a trace.', 'The lightest step: one silent failure given a log line.'),
  2: form('Add log lines to the main parts of what was just built — the failures and the slow paths — so a break shows up in the logs instead of staying hidden.', 'A light pass: the main failure and slow paths given log lines.'),
  3: form("1. Think about what was just built running in the real world — if it stopped working, how would you find out?\n2. Share with me: is there anything that records what it's doing, or would it just fail without warning?\n3. Then tell me: what's the most important thing to log so you'd know it's working?", "Production-failure detection hasn't been set up."),
  4: form('Go through what was just built and list every spot that could fail quietly, add a log line to each, and set one alert that fires when something breaks — not just a log to read after the fact.', 'Beyond scattered logs: every quiet-failure spot logged and one alert wired up.'),
  5: form('Write a short logging note alongside the code: what each part logs, which failures raise an alert, and how to use the logs to find the cause of a problem — so the next person can spot a break fast.', 'A durable logging note of what is logged, what alerts, and how to trace a failure.'),
});

/** ROLLBACK_PLANNING (beginner) — keyword "undo". */
export const ROLLBACK_PLANNING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Note the one step to undo this release if it caused a problem after going live.', 'The lightest step: one undo step written down.'),
  2: form('Write down the main steps to undo this release — how to put things back and how to check the undo actually worked.', 'A light pass: the main undo steps and the check written down.'),
  3: form("1. Think about what would happen if this feature caused a problem when it went live.\n2. Share with me: what would you do to undo the deployment if something went wrong?\n3. Then check: is there anything in this feature that would be hard to reverse once it's live?", "A rollback plan hasn't been thought through."),
  4: form('Go through what was just built and check the undo end to end: which changes are hard to reverse (like database changes), how long the undo would take, and what would be left half-changed — note each before shipping.', "Beyond the steps: the undo's hard-to-reverse parts, timing, and leftover risks checked."),
  5: form('Write a short undo plan file: the ordered steps to roll back, which database changes can be reversed, how long it takes, and who runs it — so the undo can be done under pressure without guessing.', 'A durable undo plan of the ordered steps, reversibility, and owner.'),
});

/** DEPLOYMENT_PLANNING (beginner) — keyword "live". */
export const DEPLOYMENT_PLANNING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Check the one thing the live environment needs before what was just built can go live — like a setting or a key.', 'The lightest step: one thing the live setup needs, checked.'),
  2: form('List the main things needed to take this feature live — the settings, the keys, and any setup on the live server — and confirm each before shipping.', 'A light pass: the main things needed to go live, confirmed.'),
  3: form("1. Think about how this feature is going to get from your computer to where users will use it.\n2. Share with me: is there a plan for that, or is it still not figured out?\n3. Then check: is there anything the live environment needs that isn't set up yet — like settings or secret keys?", "The deploy-to-users path hasn't been figured out."),
  4: form('Go through everything needed to take this feature live end to end: where the live setup differs from the local machine, the new settings and keys, and any server changes — and try the whole thing somewhere safe before doing it live.', 'Beyond the checklist: live-vs-local differences found and a safe rehearsal before going live.'),
  5: form('Write a short go-live plan file: the settings and keys to set up, the differences from the local machine, the steps to take it live, and the rehearsal result — so the live release follows a plan, not guesswork.', 'A durable go-live plan of the setup, the differences, and the steps.'),
});

/** DEPENDENCY_MGMT (beginner) — keyword "package". */
export const DEPENDENCY_MGMT_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Check the one new package added in what was just built that's most likely to clash with something or have a known problem.", 'The lightest step: the riskiest new package checked.'),
  2: form('Go through the new packages added in what was just built and check each for known problems and clashes with what is already installed, before shipping.', 'A light pass: the new packages checked for problems and clashes.'),
  3: form("1. Look at the new packages that were added while building this feature.\n2. Share with me: do any of them have known problems, or did you just install them because they looked like what you needed?\n3. Then check: do they work alongside everything else that's already installed, or could they cause a conflict?", "The new-package check hasn't been done."),
  4: form('Go through every new package one by one: is it still looked after by its makers, does its licence allow this use, and does it quietly pull in other packages that clash — note the risk for each.', "Beyond clashes: each package's upkeep, licence, and hidden extra packages checked."),
  5: form('Write a short package note file: for each new package the version, what was found, the licence, whether it is still maintained, and keep-or-replace — kept with the project.', "A durable package note of each package's risk and the keep-or-replace call."),
});

/** ENV_AND_SECRETS (beginner) — keyword "secret". */
export const ENV_AND_SECRETS_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Check what was just built for the one secret — a password or key — written straight into the code instead of a separate file.', 'The lightest step: the one secret most likely sitting in the code.'),
  2: form('Go through what was just built and check no secret — password, key, or token — is written into the code; each should load from a separate `.env` file.', 'A light pass: the code checked so no secret is hardcoded.'),
  3: form("1. Go through what was just built and check — are any passwords, API keys, or other secrets written directly in the code? 2. If they are, those need to be moved to a separate `.env` file. 3. Share what you find with me before we continue.", "The hardcoded-secrets check hasn't been done."),
  4: form('Go through every secret this feature uses: confirm none sit in the code, each loads from `.env`, the `.env` is kept out of version control, and an example file lists the names — and note how each secret would be changed if it leaked.', "Beyond the inline check: every secret's storage, the ignored `.env`, the example file, and a change-if-leaked plan."),
  5: form('Write a short secrets note file: each secret, where it is stored, the example file that lists the names, and how to change one if it leaks — kept out of the code.', 'A durable secrets note of where each secret lives and how to change a leaked one.'),
});

/** CI_PIPELINE (beginner) — keyword "test". */
export const CI_PIPELINE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Check whether the tests run automatically every time code is pushed to what was just built.', 'The lightest step: confirm the tests run on each push.'),
  2: form('Check the project runs its tests automatically on every push and that a failing test stops the code from being merged.', 'A light pass: tests run on push and a failing test blocks the merge.'),
  3: form("1. Check whether this project has anything set up to run the tests automatically whenever code is pushed. 2. If not, this is a good time to set that up so mistakes get caught before they reach the final code. 3. Share what you find with me before we continue.", "Auto-test-on-push hasn't been set up or verified."),
  4: form('Go through what runs automatically when code is pushed: the tests, plus the type and style checks and any security scan run by hand — confirm each runs, a failure blocks the merge, and nothing checked locally is missing.', 'Beyond the tests: the full automatic check set confirmed against what runs locally.'),
  5: form('Write the automatic checks into a workflow file: the tests, the type and style checks, the security scan, and the rule that a failure blocks the merge — saved with the project so it runs for everyone.', 'A durable workflow file running the tests and checks as a merge gate.'),
});

/** RATE_LIMITING (beginner) — keyword "limit". */
export const RATE_LIMITING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Note how many times someone should be able to call what was just built in a short time, and whether anything limits it today.', 'The lightest step: the intended limit and whether anything enforces it.'),
  2: form('Set a basic limit on how often this feature can be called, and decide what the caller sees when they go over the limit.', 'A light pass: a basic call limit and the over-limit response decided.'),
  3: form("1. Think about what would happen if someone sent a huge number of requests to this feature very quickly. 2. Check whether the app has any limit on how many times it can be called in a short period. 3. Share what you find with me before we continue.", "A request limit hasn't been set."),
  4: form('Work out the full limit for what was just built: who it counts (each user, each key, or each address), how many calls per minute, what the caller gets back when they pass the limit, and whether the count resets on a rolling or fixed window.', 'Beyond a basic cap: the per-caller limit, the window, and the over-limit response worked out.'),
  5: form('Write a short limit note file: the limit per user or key, the time window, what happens over the limit, and the overuse it guards against — kept with the feature.', 'A durable limit note of the caps, the window, and what they guard.'),
});
