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
  1: form('Note the one key decision you made building this and why you chose it over the other option.', "Just the one key decision you made building this and why you chose it over the other option."),
  2: form('Write down the main decision: the problem it solved, the choice you made, and the main option you turned down.', "Get down the main decision — the problem it solved, the choice you made, and the main option you turned down."),
  3: form("1. Think about the key decision you made building this.\n2. Write down the problem it solved, the choice you made, the other options you turned down, and what it costs you.\n3. Months later someone — maybe you — will wonder why it's built this way; this decision note answers that.", "Write down the decision — the problem it solved, the choice you made, the other options you turned down, and what it costs — so months later, someone (maybe you) knows why it's built this way."),
  4: form('Capture the decision so a newcomer needs no backstory: the problem, the choice, each option you turned down and why, and the downsides you accepted.', "Record the decision so a newcomer needs no backstory — the problem, the choice, each option you turned down and why, and the downsides you accepted."),
  5: form('Write the decision into a short decision note kept with the code: the problem, the choice, the options turned down, and the downsides — so the reason survives people leaving.', "Commit the decision to a short note kept with the code — the problem, the choice, the options turned down, and the downsides — so the reason survives people leaving."),
});

/** OVER_ENGINEERING_CHECK (beginner) — keyword "extra". Behavioural. SENSITIVE. */
export const OVER_ENGINEERING_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Spot one thing built just in case — an extra option or layer nothing actually uses yet — and flag it to remove or postpone.", "Just one thing built just in case — an extra option or layer nothing uses yet — flag it to remove or postpone."),
  2: form("Scan what you built for extras added 'in case we need it' that nothing uses now, and mark each to remove or postpone.", "Go over what you built for extras added 'in case we need it' that nothing uses now, and mark each remove-or-postpone."),
  3: form("1. Look at what you just built for anything added 'just in case' — an extra setting, layer, or option nothing uses yet.\n2. Tell me each one.\n3. Remove it or postpone it until something actually needs it — unused extras pile up as code no one can explain later.", "Find anything added 'just in case' — an extra setting, layer, or option nothing uses yet — and remove or postpone it until something actually needs it."),
  4: form("For each extra with nothing using it yet, decide remove-it-now or wait-until-something-really-needs-it, and act on that — don't leave it sitting unused.", "Take each extra with nothing using it yet and decide remove-it-now or wait-until-something-really-needs-it, then act on that — don't leave it sitting unused."),
  5: form('Make it a habit: nothing extra stays unless something uses it now — every option or layer earns its place against a real, present need.', "Hold it as a habit — nothing extra stays unless something uses it now; every option or layer earns its place against a real, present need."),
});

/** PAIR_REVIEW_ABSENCE (beginner) — keyword "review". File. */
export const PAIR_REVIEW_ABSENCE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Name who'll review this change and the one thing the review must catch before it goes in.", "Just name who'll review this change and the one thing the review must catch before it goes in."),
  2: form('Sketch the review: who reviews it, the main things they check, and what must pass before it goes in.', "Lay out the review — who reviews it, the main things they check, and what must pass before it goes in."),
  3: form("1. Before this change goes in, decide who will review it.\n2. Tell me what the review must check — does it work right, are errors handled, the tricky cases covered, is it safe.\n3. Confirm the review happens before it goes in, not after.", "Decide who reviews it, say what the review must check (does it work right, are errors handled, tricky cases covered, is it safe), and confirm the review happens before it goes in, not after."),
  4: form('Make the review work: read your own change first and point the reviewer at the riskiest parts, keep the change small enough to review well, and set what it must pass.', "Read your own change first and point the reviewer at the riskiest parts, keep the change small enough to review well, and set what it must pass."),
  5: form('Write the review plan: who reviews, the full checklist, the riskiest parts called out, and the gate it must pass — confirmed before the change goes in.', "Capture the review plan — who reviews, the full checklist, the riskiest parts called out, and the gate it must pass — confirmed before the change goes in."),
});

/** OBSERVABILITY_FIRST (beginner) — keyword "watch". File. SENSITIVE. */
export const OBSERVABILITY_FIRST_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Add one way to watch what this does once it's live — a log line at the key step — before shipping.", "Just one way to watch what this does once it's live — a log line at the key step — before shipping."),
  2: form('Make the main behaviour easy to watch: log the key events and track how often it errors, before shipping.', "Log the key events and track how often it errors before shipping, so the main behaviour is easy to watch."),
  3: form("1. Before shipping, add ways to watch what this does once real users hit it.\n2. Tell me: can you see when it runs, how often it fails, and how slow it is?\n3. Without that, when it breaks you're blind to it — add the watching first.", "Add ways to see when it runs, how often it fails, and how slow it is — without that, when it breaks you're blind to it, so add the watching first."),
  4: form('Go beyond just watching: pick the one sign of trouble worth an alert, so a problem reaches you — visibly — before users report it, instead of sitting unread in what you watch.', "Pick the one sign of trouble worth an alert, so a problem reaches you — visibly — before users report it, instead of sitting unread in what you watch."),
  5: form("Write a short watching plan and build to it: the events to log, the numbers to track, the one alert on trouble, and where you'd look — so what it does in production is never invisible.", "Capture a short watching plan and build to it — the events to log, the numbers to track, the one alert on trouble, and where you'd look — so what it does in production is never invisible."),
});

/** FAILURE_MODE_ANALYSIS (beginner) — keyword "fail". File. SENSITIVE. */
export const FAILURE_MODE_ANALYSIS_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Name the most likely way one outside thing this relies on could fail, and what happens when it does.', "Just the most likely way one outside thing this relies on could fail, and what happens when it does."),
  2: form('List the outside things this relies on and the main way each could fail — slow, error, or down — and whether each is handled.', "For each outside thing this relies on, name the main way it could fail — slow, error, or down — and whether it's handled."),
  3: form("1. List the outside things this feature relies on — other services, APIs, the database.\n2. For each, tell me how it could fail: slow, error, or completely down.\n3. Then tell me what your feature does when that happens — if the answer is 'it fails too', that's the gap to close.", "Go through the outside things this relies on (services, APIs, the database), how each could fail (slow, error, or down), and what your feature does then — if the answer is 'it fails too', that's the gap to close."),
  4: form('For the ones whose failure hurts most, actually make them fail (unplug it, force a timeout) and confirm your backup behaviour really works — not just that you wrote it.', "Take the ones whose failure hurts most and actually make them fail (unplug it, force a timeout), then confirm your backup behaviour really works — not just that you wrote it."),
  5: form("Write a short failure note: each outside thing, how it can fail, what your feature does when it does, and the test that proves the backup holds — so one failure doesn't take everything down.", "Capture a short failure note — each outside thing, how it can fail, what your feature does when it does, and the test that proves the backup holds — so one failure doesn't take everything down."),
});

/** CONTRACT_TESTING_GAP (beginner) — keyword "agree". File. */
export const CONTRACT_TESTING_GAP_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Write one test that pins the agreed format between this part and the part it talks to, before they ship separately.', "Just one test that pins the agreed format between this part and the part it talks to, before they ship separately."),
  2: form("Pin the main agreed format between the two sides, and a test that the other side still gives what's agreed.", "Lock the main agreed format between the two sides, and a test that the other side still gives what's agreed."),
  3: form("1. This part talks to another part, and they've agreed on a format for what's sent and returned.\n2. Write a test, from this side's view, that checks the other side still gives what was agreed.\n3. Run it automatically — so if someone changes the other side and breaks the agreement, it's caught before it ships.", "Write a test, from this side's view, that checks the other side still gives what was agreed, and run it automatically — so a change that breaks the agreement is caught before it ships."),
  4: form('Make the agreement a gate: write down its version from your side, and set the check so a change that breaks the agreed format fails the build — before it reaches you broken.', "Turn the agreement into a gate — write down its version from your side, and set the check so a change that breaks the agreed format fails the build before it reaches you broken."),
  5: form("Write the agreement tests into a test file and run them automatically: the versioned agreed format, the check on the other side, and the build gate on breaks — so a separate change can't quietly break the link.", "Capture the agreement tests in a test file and run them automatically — the versioned agreed format, the check on the other side, and the build gate on breaks — so a separate change can't quietly break the link."),
});

/** CAPACITY_PLANNING_GAP (beginner) — keyword "load". File. */
export const CAPACITY_PLANNING_GAP_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Estimate the most traffic this must handle at once, and check it can cope with that load.', "Just estimate the most traffic this must handle at once and check it can cope with that load."),
  2: form('Sketch the load: the busiest request rate and how fast the data will grow, against what you have today.', "Rough out the load — the busiest request rate and how fast the data will grow, against what you have today."),
  3: form("1. Estimate the heaviest load this feature must handle — the most requests at once, and how fast its data grows.\n2. Tell me whether what you're running on can handle that load.\n3. Guessing 'it'll be fine' is how things fall over right after launch — check the numbers.", "Work out the heaviest load this must handle — the most requests at once and how fast its data grows — and check what you're running on can handle it; 'it'll be fine' is how things fall over right after launch."),
  4: form("Don't just estimate the load — push it: run a load test toward that peak to see what gives out first, and add room at that weakest point.", "Push the load, don't just estimate it — run a load test toward that peak to see what gives out first, and add room at that weakest point."),
  5: form('Write a short load note: the expected peak, the data growth, the weak point the load test found, and the room you added — so it doesn\'t fall over under real traffic.', "Capture a short load note — the expected peak, the data growth, the weak point the load test found, and the room you added — so it doesn't fall over under real traffic."),
});

/** SECURITY_THREAT_MODELING (beginner) — keyword "attack". File. SENSITIVE. */
export const SECURITY_THREAT_MODELING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Name the single most likely way someone could attack or abuse this, and how you'd block it.", "Just the single most likely way someone could attack or abuse this, and how you'd block it."),
  2: form('List the main ways this could be attacked — faking who they are, tampering with what they send, getting at data they should not, overloading it — and a block for each.', "For the main attacks — faking who they are, tampering with what they send, getting at data they shouldn't, overloading it — name a block for each."),
  3: form("1. Go through the main ways someone could attack or abuse this feature: pretending to be someone else, tampering with what's sent in, getting at data they shouldn't, overloading it, or doing things they're not allowed.\n2. Tell me each one that applies.\n3. For each, tell me what blocks it — and confirm that block is in place before shipping.", "Work through the main ways someone could attack or abuse this — pretending to be someone else, tampering with input, getting at data they shouldn't, overloading it, doing things they're not allowed — and for each that applies, name what blocks it and confirm it's in place before shipping."),
  4: form('Rank the attacks by how easy and how damaging each is, and for the worst few actually try the attack to confirm your block stops it — not just that a block exists.', "Order the attacks by how easy and how damaging each is, and for the worst few actually try the attack to confirm your block stops it — not just that a block exists."),
  5: form('Write a short attack-and-block note: each way in ranked by how easy it is to attack, the block for each, and the test that proves the block holds — so nothing ships with an open way in.', "Capture a short attack-and-block note — each way in ranked by how easy it is to attack, the block for each, and the test that proves the block holds — so nothing ships with an open way in."),
});

/** DATABASE_MIGRATION_SAFETY (beginner) — keyword "database". File. SENSITIVE. */
export const DATABASE_MIGRATION_SAFETY_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Check this database change can be done safely — add the new shape first, before removing anything old.', "Just check this database change can be done safely — add the new shape first, before removing anything old."),
  2: form('Sketch the database change in safe steps: add the new shape, move the data over, then remove the old — each step reversible.', "Break the database change into safe steps — add the new shape, move the data over, then remove the old, each reversible."),
  3: form("1. Before changing the database shape, plan it as safe steps instead of one risky change.\n2. Tell me: can you add the new shape first (so old and new both work for a while), move the data, then remove the old?\n3. Each step should be reversible — so nothing destroys data with no way back.", "Plan the database change as safe steps, not one risky change — add the new shape first (old and new both work for a while), move the data, then remove the old, each step reversible so nothing destroys data with no way back."),
  4: form('Rehearse before you run it: try each step of the database change on a copy of the real data, confirm old and new both work during the change, and write exactly how to undo each step.', "Test it before you run it — try each step of the database change on a copy of the real data, confirm old and new both work during the change, and write exactly how to undo each step."),
  5: form('Write a short plan for the database change: the add, move, and remove steps, each reversible, the rehearsal result, and how to undo each — so no single step destroys data.', "Capture a short plan for the database change — the add, move, and remove steps, each reversible, the rehearsal result, and how to undo each — so no single step destroys data."),
});

/** DEPLOYMENT_STRATEGY_ABSENCE (beginner) — keyword "undo". File. SENSITIVE. */
export const DEPLOYMENT_STRATEGY_ABSENCE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Before shipping, name how this goes live and how you'd undo it fast if it breaks.", "Just name how this goes live and how you'd undo it fast if it breaks, before shipping."),
  2: form('Sketch the rollout: release it to a few users first, and the undo if the numbers dip.', "Lay out the rollout — release it to a few users first, and the undo if the numbers dip."),
  3: form("1. Before shipping, decide how this goes live — all at once is risky.\n2. Tell me: can you release it to a few users first, watch, then widen it?\n3. And tell me the undo — how you'd pull it back fast if it breaks — and that you can do it quickly.", "Decide how this goes live — all at once is risky; release to a few users first, watch, then widen — and settle the undo: how you'd pull it back fast if it breaks, and that you can do it quickly."),
  4: form('Make the undo automatic: pick the health number that, if it crosses a line, pulls the release back on its own without waiting for a person — and confirm the undo acts fast enough.', "Automate the undo — pick the health number that, if it crosses a line, pulls the release back on its own without waiting for a person, and confirm the undo acts fast enough."),
  5: form('Write a short go-live plan: how it rolls out a bit at a time, the automatic undo and the line that triggers it, and how fast it must act — so a release is never all-at-once and blind.', "Capture a short go-live plan — how it rolls out a bit at a time, the automatic undo and the line that triggers it, and how fast it must act — so a release is never all-at-once and blind."),
});

/** OPERATIONAL_RUNBOOK_GAP (beginner) — keyword "guide". File. */
export const OPERATIONAL_RUNBOOK_GAP_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Start a fix-it guide with the one thing whoever's on call most needs — the key health signal to watch.", "Just start a fix-it guide with the one thing whoever's on call most needs — the key health signal to watch."),
  2: form('Draft the guide basics: what this does, the health signs to watch, and who to escalate to.', "Get down the guide basics — what this does, the health signs to watch, and who to escalate to."),
  3: form("1. Write a short guide for whoever has to deal with this when it breaks.\n2. Put in: what it does, the health signs to watch, how to spot the most likely problems, and how to fix it or who to call.\n3. Without it, whoever's on call at 2am is stuck with no idea where to start.", "Put together a short guide for whoever deals with this when it breaks — what it does, the health signs to watch, how to spot the most likely problems, and how to fix it or who to call — so no one's stuck at 2am with no idea where to start."),
  4: form("Make the guide usable under pressure: for each likely warning, write the very first thing to check, and have someone who didn't build it try to follow the guide — fixing every spot they get stuck.", "For each likely warning, write the very first thing to check, and have someone who didn't build it try to follow the guide — fixing every spot they get stuck."),
  5: form("Write the fix-it guide doc: what it does, the health signs, each likely warning mapped to its first step, and who to escalate to — so no one's ever stranded when it breaks.", "Capture the fix-it guide doc — what it does, the health signs, each likely warning mapped to its first step, and who to escalate to — so no one's ever stranded when it breaks."),
});

/** SLO_DEFINITION_GAP (beginner) — keyword "target". File. */
export const SLO_DEFINITION_GAP_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Name one target this must hit — how often it should be up, or how fast it should respond.', "Just one target this must hit — how often it should be up, or how fast it should respond."),
  2: form('Sketch the targets: how often it is up, how fast it responds, how rarely it errors — and how each is watched.', "Rough out the targets — how often it's up, how fast it responds, how rarely it errors — and how each is watched."),
  3: form("1. Set the targets this feature must hit — how often it's up, how fast it responds, how rarely it errors.\n2. Tell me each target and how you'll watch it.\n3. Then make sure an alert fires when a target is missed — so you find out before users do.", "Pin down the targets this must hit — how often it's up, how fast it responds, how rarely it errors — say how you'll watch each, and make an alert fire when one is missed, so you find out before users do."),
  4: form('Decide what changes when a target starts slipping: pause risky changes, alert someone, or switch to fixing reliability — so a missed target drives action, not just a number on a chart.', "Set what changes when a target starts slipping — pause risky changes, alert someone, or switch to fixing reliability — so a missed target drives action, not just a number on a chart."),
  5: form('Write a short targets note: the up, speed, and error targets, how much room each has, the alerts tied to them, and what happens when one slips — the bar others can count on.', "Capture a short targets note — the up, speed, and error targets, how much room each has, the alerts tied to them, and what happens when one slips — the bar others can count on."),
});
