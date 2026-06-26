/**
 * Class-9 academic / hardcore-pro `_BEGINNER` register overrides (all 12 signals).
 *
 * Class 9 is formal-only in the frozen content (no beginner variant for any signal). Per
 * USER decision (full scope, consistent with class 8) all 12 get a fresh
 * structurally-divergent beginner override. With no frozen beginner headline, col-3 is
 * authored as the beginner-voice EXPRESSION of the shipped practice. These topics are
 * deliberately advanced, so every column is de-jargoned into a plain observable action a
 * disciplined non-coder could request and recognise — the technical labels (ADR, STRIDE,
 * observability, SLO, canary/blue-green, expand-migrate-contract) are dropped, not just
 * parenthesised, while the practice itself is kept intact, not dumbed down.
 *
 * F2 mirrors the base: 11 produce a written record at col-5; 1 stays behavioural (the
 * YAGNI / over-engineering gate). Six signals are intrinsically sensitive (over-engineering
 * = delete/restructure, observability = instrument across files, failure-mode = stability
 * patterns across files, security-threat = security control in code, database-migration =
 * run a migration, deployment = trigger a deploy); the override inherits the base record's
 * l2SafeguardRequired + l2SafeguardLine, so the engine appends the confirm-seek to every
 * served beginner column. Attached via registerOverrides.beginner.
 */

import type { LevelForm, RegisterOverride, MaturityLevel } from '../content-template-schema.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}
function structural(levelForms: Partial<Record<MaturityLevel, LevelForm>>): RegisterOverride {
  return { divergence: 'structurally-divergent', levelForms };
}

/** DECISION_RECORD_ABSENCE (beginner) — keyword "decision". File. */
export const DECISION_RECORD_ABSENCE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Note the one key decision you made building this and why you chose it over the other option.', 'The lightest step: the key decision and its reason noted.'),
  2: form('Write down the main decision: the problem it solved, the choice you made, and the main option you turned down.', 'A light pass: the decision, its reason, and the rejected option written down.'),
  3: form("1. Think about the key decision you made building this.\n2. Write down the problem it solved, the choice you made, the other options you turned down, and what it costs you.\n3. Months later someone — maybe you — will wonder why it's built this way; this decision note answers that.", 'Why this was built this way — the decision and its reasons — hasn\'t been written down.'),
  4: form('Capture the decision so a newcomer needs no backstory: the problem, the choice, each option you turned down and why, and the downsides you accepted.', 'Beyond a note: the decision captured with rejected options and accepted downsides.'),
  5: form('Write the decision into a short decision note kept with the code: the problem, the choice, the options turned down, and the downsides — so the reason survives people leaving.', 'A durable decision note of the problem, choice, options, and downsides.'),
});

/** OVER_ENGINEERING_CHECK (beginner) — keyword "extra". Behavioural. SENSITIVE. */
export const OVER_ENGINEERING_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Spot one thing built just in case — an extra option or layer nothing actually uses yet — and flag it to remove or postpone.", 'The lightest step: one just-in-case extra flagged.'),
  2: form("Scan what you built for extras added 'in case we need it' that nothing uses now, and mark each to remove or postpone.", 'A light pass: the unused extras marked remove-or-postpone.'),
  3: form("1. Look at what you just built for anything added 'just in case' — an extra setting, layer, or option nothing uses yet.\n2. Tell me each one.\n3. Remove it or postpone it until something actually needs it — unused extras pile up as code no one can explain later.", 'Just-in-case extras haven\'t been weeded out — unused code piles up with nothing using it.'),
  4: form("For each extra with nothing using it yet, decide remove-it-now or wait-until-something-really-needs-it, and act on that — don't leave it sitting unused.", 'Beyond flagging: each extra decided remove-now or wait, and acted on.'),
  5: form('Make it a habit: nothing extra stays unless something uses it now — every option or layer earns its place against a real, present need.', 'A standing habit: no just-in-case extra kept without a present use.'),
});

/** PAIR_REVIEW_ABSENCE (beginner) — keyword "review". File. */
export const PAIR_REVIEW_ABSENCE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Name who'll review this change and the one thing the review must catch before it goes in.", 'The lightest step: the reviewer and the key review focus named.'),
  2: form('Sketch the review: who reviews it, the main things they check, and what must pass before it goes in.', 'A light pass: the reviewer, the checklist, and the go-in gate sketched.'),
  3: form("1. Before this change goes in, decide who will review it.\n2. Tell me what the review must check — does it work right, are errors handled, the tricky cases covered, is it safe.\n3. Confirm the review happens before it goes in, not after.", 'A review plan for this change hasn\'t been set — it risks going in unchecked.'),
  4: form('Make the review work: read your own change first and point the reviewer at the riskiest parts, keep the change small enough to review well, and set what it must pass.', 'Beyond a plan: the change self-reviewed, risky parts flagged, and kept small.'),
  5: form('Write the review plan: who reviews, the full checklist, the riskiest parts called out, and the gate it must pass — confirmed before the change goes in.', 'A durable review plan of reviewer, checklist, flagged risks, and gate.'),
});

/** OBSERVABILITY_FIRST (beginner) — keyword "watch". File. SENSITIVE. */
export const OBSERVABILITY_FIRST_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Add one way to watch what this does once it's live — a log line at the key step — before shipping.", 'The lightest step: one way to watch the key step added.'),
  2: form('Make the main behaviour easy to watch: log the key events and track how often it errors, before shipping.', 'A light pass: the key events and error rate made watchable before ship.'),
  3: form("1. Before shipping, add ways to watch what this does once real users hit it.\n2. Tell me: can you see when it runs, how often it fails, and how slow it is?\n3. Without that, when it breaks you're blind to it — add the watching first.", 'Ways to watch this in production (logs, error counts, timing) haven\'t been added — it\'s invisible once live.'),
  4: form('Go beyond just watching: pick the one sign of trouble worth an alert, so a problem reaches you — visibly — before users report it, instead of sitting unread in what you watch.', 'Beyond watching: the key trouble sign made an alert, not just recorded.'),
  5: form("Write a short watching plan and build to it: the events to log, the numbers to track, the one alert on trouble, and where you'd look — so what it does in production is never invisible.", 'A durable watching plan of what to log, track, alert on, and where to look.'),
});

/** FAILURE_MODE_ANALYSIS (beginner) — keyword "fail". File. SENSITIVE. */
export const FAILURE_MODE_ANALYSIS_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Name the most likely way one outside thing this relies on could fail, and what happens when it does.', 'The lightest step: one dependency\'s likely failure and its effect named.'),
  2: form('List the outside things this relies on and the main way each could fail — slow, error, or down — and whether each is handled.', 'A light pass: each dependency\'s main failure listed and handling checked.'),
  3: form("1. List the outside things this feature relies on — other services, APIs, the database.\n2. For each, tell me how it could fail: slow, error, or completely down.\n3. Then tell me what your feature does when that happens — if the answer is 'it fails too', that's the gap to close.", 'How the things this relies on could fail — and what happens then — hasn\'t been thought through.'),
  4: form('For the ones whose failure hurts most, actually make them fail (unplug it, force a timeout) and confirm your backup behaviour really works — not just that you wrote it.', 'Beyond naming handling: the worst failures forced and the backup proven.'),
  5: form("Write a short failure note: each outside thing, how it can fail, what your feature does when it does, and the test that proves the backup holds — so one failure doesn't take everything down.", 'A durable failure note of each dependency, its failures, the handling, and the proof.'),
});

/** CONTRACT_TESTING_GAP (beginner) — keyword "agree". File. */
export const CONTRACT_TESTING_GAP_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Write one test that pins the agreed format between this part and the part it talks to, before they ship separately.', 'The lightest step: one test pinning the agreed format written.'),
  2: form("Pin the main agreed format between the two sides, and a test that the other side still gives what's agreed.", 'A light pass: the agreed format and a matching test defined.'),
  3: form("1. This part talks to another part, and they've agreed on a format for what's sent and returned.\n2. Write a test, from this side's view, that checks the other side still gives what was agreed.\n3. Run it automatically — so if someone changes the other side and breaks the agreement, it's caught before it ships.", 'A test of the agreed format between these two parts hasn\'t been written — a change could break it unnoticed.'),
  4: form('Make the agreement a gate: write down its version from your side, and set the check so a change that breaks the agreed format fails the build — before it reaches you broken.', 'Beyond one test: the agreed format versioned and enforced as a build gate.'),
  5: form("Write the agreement tests into a test file and run them automatically: the versioned agreed format, the check on the other side, and the build gate on breaks — so a separate change can't quietly break the link.", 'A durable test file of the versioned agreed format and a build gate on breaks.'),
});

/** CAPACITY_PLANNING_GAP (beginner) — keyword "load". File. */
export const CAPACITY_PLANNING_GAP_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Estimate the most traffic this must handle at once, and check it can cope with that load.', 'The lightest step: the peak load estimated against what it can handle.'),
  2: form('Sketch the load: the busiest request rate and how fast the data will grow, against what you have today.', 'A light pass: the feature\'s load needs sketched against today\'s capacity.'),
  3: form("1. Estimate the heaviest load this feature must handle — the most requests at once, and how fast its data grows.\n2. Tell me whether what you're running on can handle that load.\n3. Guessing 'it'll be fine' is how things fall over right after launch — check the numbers.", 'Whether this can handle its expected load hasn\'t been checked — it could fall over after launch.'),
  4: form("Don't just estimate the load — push it: run a load test toward that peak to see what gives out first, and add room at that weakest point.", 'Beyond a guess: the weak point found by load-testing toward the peak.'),
  5: form('Write a short load note: the expected peak, the data growth, the weak point the load test found, and the room you added — so it doesn\'t fall over under real traffic.', 'A durable load note of the peak, the weak point, and the room added.'),
});

/** SECURITY_THREAT_MODELING (beginner) — keyword "attack". File. SENSITIVE. */
export const SECURITY_THREAT_MODELING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Name the single most likely way someone could attack or abuse this, and how you'd block it.", 'The lightest step: the top way it could be attacked, and its block, named.'),
  2: form('List the main ways this could be attacked — faking who they are, tampering with what they send, getting at data they should not, overloading it — and a block for each.', 'A light pass: the main attacks listed with a block each.'),
  3: form("1. Go through the main ways someone could attack or abuse this feature: pretending to be someone else, tampering with what's sent in, getting at data they shouldn't, overloading it, or doing things they're not allowed.\n2. Tell me each one that applies.\n3. For each, tell me what blocks it — and confirm that block is in place before shipping.", 'The main ways this could be attacked — and the blocks for them — haven\'t been worked through.'),
  4: form('Rank the attacks by how easy and how damaging each is, and for the worst few actually try the attack to confirm your block stops it — not just that a block exists.', 'Beyond a list: the attacks ranked and the top blocks tested against a real attempt.'),
  5: form('Write a short attack-and-block note: each way in ranked by how easy it is to attack, the block for each, and the test that proves the block holds — so nothing ships with an open way in.', 'A durable attack-and-block note of ranked attacks, their blocks, and the tests.'),
});

/** DATABASE_MIGRATION_SAFETY (beginner) — keyword "database". File. SENSITIVE. */
export const DATABASE_MIGRATION_SAFETY_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Check this database change can be done safely — add the new shape first, before removing anything old.', 'The lightest step: the database change checked for a safe add-first start.'),
  2: form('Sketch the database change in safe steps: add the new shape, move the data over, then remove the old — each step reversible.', 'A light pass: the database change sketched as reversible steps.'),
  3: form("1. Before changing the database shape, plan it as safe steps instead of one risky change.\n2. Tell me: can you add the new shape first (so old and new both work for a while), move the data, then remove the old?\n3. Each step should be reversible — so nothing destroys data with no way back.", 'Whether this database change can be done as safe reversible steps hasn\'t been checked.'),
  4: form('Rehearse before you run it: try each step of the database change on a copy of the real data, confirm old and new both work during the change, and write exactly how to undo each step.', 'Beyond planning steps: the database change rehearsed on a copy with a per-step undo.'),
  5: form('Write a short plan for the database change: the add, move, and remove steps, each reversible, the rehearsal result, and how to undo each — so no single step destroys data.', 'A durable plan of the reversible database steps, the rehearsal, and the per-step undo.'),
});

/** DEPLOYMENT_STRATEGY_ABSENCE (beginner) — keyword "undo". File. SENSITIVE. */
export const DEPLOYMENT_STRATEGY_ABSENCE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Before shipping, name how this goes live and how you'd undo it fast if it breaks.", 'The lightest step: the go-live approach and its undo named.'),
  2: form('Sketch the rollout: release it to a few users first, and the undo if the numbers dip.', 'A light pass: a gradual rollout and its undo sketched.'),
  3: form("1. Before shipping, decide how this goes live — all at once is risky.\n2. Tell me: can you release it to a few users first, watch, then widen it?\n3. And tell me the undo — how you'd pull it back fast if it breaks — and that you can do it quickly.", 'How this goes live, and how you\'d undo it if it breaks, haven\'t been decided.'),
  4: form('Make the undo automatic: pick the health number that, if it crosses a line, pulls the release back on its own without waiting for a person — and confirm the undo acts fast enough.', 'Beyond a manual undo: an automatic undo set on a health threshold.'),
  5: form('Write a short go-live plan: how it rolls out a bit at a time, the automatic undo and the line that triggers it, and how fast it must act — so a release is never all-at-once and blind.', 'A durable go-live plan of the gradual rollout and the automatic undo.'),
});

/** OPERATIONAL_RUNBOOK_GAP (beginner) — keyword "guide". File. */
export const OPERATIONAL_RUNBOOK_GAP_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Start a fix-it guide with the one thing whoever's on call most needs — the key health signal to watch.", 'The lightest step: the fix-it guide started with the key signal.'),
  2: form('Draft the guide basics: what this does, the health signs to watch, and who to escalate to.', 'A light pass: the guide\'s basics — what it does, signs, escalation — drafted.'),
  3: form("1. Write a short guide for whoever has to deal with this when it breaks.\n2. Put in: what it does, the health signs to watch, how to spot the most likely problems, and how to fix it or who to call.\n3. Without it, whoever's on call at 2am is stuck with no idea where to start.", 'A fix-it guide for when this breaks hasn\'t been written — whoever\'s on call has nowhere to start.'),
  4: form("Make the guide usable under pressure: for each likely warning, write the very first thing to check, and have someone who didn't build it try to follow the guide — fixing every spot they get stuck.", 'Beyond basics: each warning mapped to a first step and the guide dry-run by a non-builder.'),
  5: form("Write the fix-it guide doc: what it does, the health signs, each likely warning mapped to its first step, and who to escalate to — so no one's ever stranded when it breaks.", 'A durable fix-it guide doc of signs, warning-to-step, and escalation.'),
});

/** SLO_DEFINITION_GAP (beginner) — keyword "target". File. */
export const SLO_DEFINITION_GAP_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Name one target this must hit — how often it should be up, or how fast it should respond.', 'The lightest step: one reliability target named.'),
  2: form('Sketch the targets: how often it is up, how fast it responds, how rarely it errors — and how each is watched.', 'A light pass: the up/speed/error targets and how they\'re watched sketched.'),
  3: form("1. Set the targets this feature must hit — how often it's up, how fast it responds, how rarely it errors.\n2. Tell me each target and how you'll watch it.\n3. Then make sure an alert fires when a target is missed — so you find out before users do.", 'Reliability targets for this feature haven\'t been set — there\'s no agreed bar for how good it must be.'),
  4: form('Decide what changes when a target starts slipping: pause risky changes, alert someone, or switch to fixing reliability — so a missed target drives action, not just a number on a chart.', 'Beyond setting targets: a policy for what happens when a target starts slipping.'),
  5: form('Write a short targets note: the up, speed, and error targets, how much room each has, the alerts tied to them, and what happens when one slips — the bar others can count on.', 'A durable targets note of the targets, their room, the alerts, and the slip policy.'),
});
