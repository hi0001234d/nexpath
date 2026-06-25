/**
 * Academic / hardcore-pro content-template records (class 9). One record per signal;
 * column 3 is the existing shipped headline (kept verbatim), and columns 1/2/4/5
 * escalate the same practice from a quick step up to its heaviest form.
 *
 * These are the advanced-engineering signals — architecture decision records, YAGNI,
 * review plans, production-visibility, failure-mode analysis, contract testing, capacity
 * planning, threat modelling, database-migration safety, deployment strategy, operational
 * runbooks, and SLOs. Every signal is single-register (formal only), so column 3 is the
 * frozen formal L1[0]; one anchor (threat modelling) cites the full STRIDE set and runs
 * long, so the option length budget exempts the frozen col-3.
 *
 * These topics are inherently technical, so the authored columns follow the de-jargon
 * rule strictly: each is a plain observable action a disciplined non-coder could request
 * and recognise, with a technical term only as an optional trailing parenthetical (the
 * genuine-concept set — ADR, canary, blue-green — appears bare only at the heaviest
 * column). The per-signal keyword is therefore a plain word ("visible", "rollback",
 * "decision") rather than the jargon label.
 *
 * Eleven produce a written record at the heaviest column (a decision doc, a review plan,
 * a visibility plan, a failure-mode note, a contract-test file, a capacity note, a
 * threat-model note, a migration plan, a deployment plan, an operational runbook, an SLO
 * doc). One is a standing discipline whose heaviest column stays a behaviour (no file):
 * the YAGNI over-engineering gate.
 *
 * Six signals concern an intrinsically-sensitive action — deleting/restructuring code,
 * instrumenting across files, implementing stability patterns across files, implementing
 * security controls, running a schema migration, and triggering a deployment — so each
 * carries the confirm-seek safeguard (the `l2SafeguardRequired` flag + an action-specific
 * `l2SafeguardLine` the engine appends as the LAST line of every served column, covering
 * the frozen col-3 anchor too). The escalation is the engineering practice deepening, so
 * none threads a separate spine.
 */

import type { ContentTemplateRecord, LevelForm, ParamAxisTag } from '../content-template-schema.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}

/** The param axes an academic/hardcore-pro why-desc grounds (same generic sources as the other classes). */
export const CLASS9_PARAM_AXES: Readonly<Record<string, ParamAxisTag>> = {
  workflow_pattern: 'extensible',
  decision_making_rhythm: 'closed-ordinal',
  explanation_learning_depth: 'closed-ordinal',
  abstraction_level_orientation: 'closed-ordinal',
  project_framework: 'open',
};

/** ABSENCE_DECISION_RECORD_ABSENCE — record the design decision + rationale, keyword "decision". Produces a written doc. */
export const ABSENCE_DECISION_RECORD_ABSENCE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DECISION_RECORD_ABSENCE', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS9_PARAM_AXES,
  levelForms: {
    1: form("Note the one key design decision made here and why you chose it over the alternative.", "The lightest step: the key decision and its reason noted."),
    2: form("Record the main design decision: the problem, the choice made, and the main alternative rejected.", "A light pass: the decision, its context, and the rejected alternative recorded."),
    3: form("Write an architecture decision record for the key design decision made here: document the context (what problem was being solved), the decision made, the alternatives that were considered and rejected, and the consequences — so future engineers understand why this exists as it does.", "An architecture decision record for this design decision hasn't been written — design rationale risks being lost as team composition changes."),
    4: form("Capture the decision with its full rationale: the context, the decision, the alternatives weighed and why each was rejected, and the consequences accepted — enough that a future engineer needs no backstory.", "Beyond a note: the decision captured with alternatives weighed and consequences accepted."),
    5: form("Write the decision into a durable design-decision doc: the context, the decision, the alternatives rejected, and the consequences — so the rationale survives team changes.", "A durable design-decision doc of context, choice, alternatives, and consequences."),
  },
};

/** ABSENCE_OVER_ENGINEERING_CHECK — apply YAGNI, remove speculative code, keyword "speculativ". Behavioural gate. SENSITIVE (delete/restructure). */
export const ABSENCE_OVER_ENGINEERING_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_OVER_ENGINEERING_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS9_PARAM_AXES,
  l2SafeguardRequired: true,
  l2SafeguardLine: "Before you delete or restructure any code, ask me for go-ahead confirmation first.",
  levelForms: {
    1: form("Spot one thing built speculatively — an abstraction or option with no current use — and flag it to remove or defer.", "The lightest check: one speculative addition flagged."),
    2: form("Scan what was just built for speculative abstractions not required by a current need, and mark each remove-or-defer.", "A light pass: the speculative additions marked remove-or-defer."),
    3: form("Apply YAGNI to what was just built: identify any abstraction, interface, or configuration option that was added speculatively — not required by a current story or use case — and remove or defer it.", "YAGNI hasn't been applied to what was just built — speculative abstractions accumulate as code with no current consumer."),
    4: form("Apply YAGNI across the change: for each speculative abstraction, interface, or config option with no current consumer, decide remove-now or defer-until-a-real-need-appears, and act on the decision.", "Beyond flagging: each speculative element decided remove-now or defer-until-needed."),
    5: form("Make YAGNI a standing gate: nothing speculative ships without a current consumer — every abstraction earns its place against a real, present need before it stays.", "A standing gate: no speculative abstraction kept without a present need."),
  },
};

/** ABSENCE_PAIR_REVIEW_ABSENCE — establish a review plan before merge, keyword "review". Produces a written plan. */
export const ABSENCE_PAIR_REVIEW_ABSENCE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_PAIR_REVIEW_ABSENCE', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS9_PARAM_AXES,
  levelForms: {
    1: form("Name who will review this change and the one thing the review must catch before merge.", "The lightest step: the reviewer and the key review focus named."),
    2: form("Sketch the review plan: who reviews, the main checklist points, and the merge gate.", "A light pass: the review's reviewer, checklist, and merge gate sketched."),
    3: form("Establish a review plan for this change before merging: define who reviews it, what the review checklist covers (design correctness, error handling, edge cases, security, performance implications), and what the merge gate is — confirm the plan is in place before the branch is merged.", "A review plan for this change hasn't been established — risk of merging without checklist coverage of design / errors / edge cases / security."),
    4: form("Make the review effective before it starts: self-review the diff and flag the riskiest parts for the reviewer, keep the change small enough to review well, and set the merge gate it must pass.", "Beyond a plan: the diff self-reviewed, risky parts flagged, and the change sized for review."),
    5: form("Write the review plan: the reviewer, the full review checklist, the riskiest parts called out, and the merge gate — the plan confirmed in place before any merge.", "A durable review plan of reviewer, checklist, flagged risks, and merge gate."),
  },
};

/** ABSENCE_OBSERVABILITY_FIRST — make production behaviour visible, keyword "visib". Produces a written plan. SENSITIVE (instrument across files). */
export const ABSENCE_OBSERVABILITY_FIRST_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_OBSERVABILITY_FIRST', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS9_PARAM_AXES,
  l2SafeguardRequired: true,
  l2SafeguardLine: "Before you add instrumentation across multiple files, ask me for go-ahead confirmation first.",
  levelForms: {
    1: form("Add one way to make this feature's behaviour visible in production before shipping — a log line at the key step.", "The lightest step: one signal making the feature's behaviour visible."),
    2: form("Make the main behaviour visible: log the key events and capture the error rate before shipping.", "A light pass: the key events and error rate made visible before ship."),
    3: form("Add observability to this feature before shipping: instrument all three pillars — structured logging at each significant event boundary, metrics for request rate, error rate, and latency, and distributed trace spans for every external call — so production behavior is visible from day one.", "Observability instrumentation (logs / metrics / traces) hasn't been added — production behaviour invisible from day one."),
    4: form("Make the signals actionable, not just present: beyond logging events, measuring rates, and tracing calls, define the one symptom worth alerting on so a problem reaches you, visibly, before users report it.", "Beyond instrumenting: the key symptom made visible as an alert, not just recorded."),
    5: form("Write a visibility plan and instrument to it: the events to log, the rates to measure, the calls to trace, the alert on the key symptom, and the dashboard — so production behaviour is visible from day one (observability).", "A durable visibility plan covering logs, metrics, traces, the alert, and the dashboard."),
  },
};

/** ABSENCE_FAILURE_MODE_ANALYSIS — enumerate dependency failure modes, keyword "failure". Produces a written note. SENSITIVE (patterns across files). */
export const ABSENCE_FAILURE_MODE_ANALYSIS_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_FAILURE_MODE_ANALYSIS', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS9_PARAM_AXES,
  l2SafeguardRequired: true,
  l2SafeguardLine: "Before you implement any stability pattern across multiple files, ask me for go-ahead confirmation first.",
  levelForms: {
    1: form("Name the most likely failure of one external dependency this feature relies on, and how it's handled.", "The lightest step: one dependency's likely failure and its handling named."),
    2: form("List the external dependencies and the main failure of each — timeout, error, or unavailability — and whether each is handled.", "A light pass: each dependency's main failure listed and handling checked."),
    3: form("Enumerate failure modes for every external dependency this feature relies on: for each dependency, name the failure mode (timeout, error response, partial data, unavailability), specify the stability pattern that handles it (circuit breaker, timeout + fallback, bulkhead, retry with backoff), and confirm the pattern is implemented before shipping.", "Failure modes for external dependencies haven't been enumerated — risk of cascading failure when a dependency fails."),
    4: form("Prove the handling holds: for the dependencies whose failure hurts most, simulate the failure (timeout, error, unavailability) and confirm the fallback actually works — not just that a pattern is coded.", "Beyond naming handling: the worst dependency failures simulated and the fallback proven."),
    5: form("Write a failure-mode analysis note: each dependency, its failure modes, the handling for each, and the simulation that proves the fallback holds — so failures are contained, not cascading.", "A durable failure-mode analysis note of dependencies, modes, handling, and proof."),
  },
};

/** ABSENCE_CONTRACT_TESTING_GAP — consumer-driven contract tests, keyword "contract". Produces a written test file. */
export const ABSENCE_CONTRACT_TESTING_GAP_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_CONTRACT_TESTING_GAP', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS9_PARAM_AXES,
  levelForms: {
    1: form("Write one contract test for this service boundary from the consumer's view before they ship separately.", "The lightest step: one consumer-view contract test written."),
    2: form("Define the main contract for this boundary and a test that the provider satisfies it.", "A light pass: the boundary's contract and a provider test defined."),
    3: form("Define consumer-driven contract tests for this service boundary before independent deployment: write the contract from the consumer's perspective, verify the provider satisfies it in isolation, and add provider verification to the CI pipeline.", "Consumer-driven contract tests for this service boundary haven't been defined — risk of breaking-change surprises during independent deployment."),
    4: form("Make the contract a gate: version it from the consumer's side, and wire the provider check so a breaking change fails the build before it ships — not after the consumer breaks.", "Beyond one test: the contract versioned and enforced as a build gate on breaking changes."),
    5: form("Write the contract tests into the test file and wire provider verification into the pipeline: the versioned consumer contract, the provider check, and the build gate on breaks — so independent deploys can't break the boundary.", "A durable contract-test file with versioned contracts and a build gate on breaks."),
  },
};

/** ABSENCE_CAPACITY_PLANNING_GAP — estimate capacity before ship, keyword "capacity". Produces a written note. */
export const ABSENCE_CAPACITY_PLANNING_GAP_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_CAPACITY_PLANNING_GAP', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS9_PARAM_AXES,
  levelForms: {
    1: form("Estimate the peak load this feature must handle and check current capacity covers it.", "The lightest step: the peak load estimated against current capacity."),
    2: form("Sketch capacity needs: the peak request rate and the storage growth, against current headroom.", "A light pass: the feature's capacity needs sketched against headroom."),
    3: form("Estimate capacity requirements for this feature before shipping: project peak request rate (RPS), storage growth over 90 days, and required infrastructure headroom — then verify current infrastructure can serve the estimated peak load.", "Capacity estimate for this feature hasn't been completed — risk of infrastructure saturation post-launch."),
    4: form("Find the limit, don't just estimate: load-test toward the projected peak to see which resource saturates first, and size the capacity headroom to that bottleneck.", "Beyond a projection: the capacity bottleneck found by load-testing toward the peak."),
    5: form("Write a capacity note: the projected peak load, storage growth, the bottleneck resource found by load-testing, and the headroom sized to it — so the feature doesn't saturate after launch.", "A durable capacity note of projected load, the bottleneck, and headroom sized to it."),
  },
};

/** ABSENCE_SECURITY_THREAT_MODELING — STRIDE threats + controls, keyword "threat". Produces a written note. SENSITIVE (security control in code). */
export const ABSENCE_SECURITY_THREAT_MODELING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SECURITY_THREAT_MODELING', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS9_PARAM_AXES,
  l2SafeguardRequired: true,
  l2SafeguardLine: "Before you implement any security control in code, ask me for go-ahead confirmation first.",
  levelForms: {
    1: form("Name the single biggest security threat to this feature and the control that mitigates it.", "The lightest step: the top security threat and its control named."),
    2: form("List the main threats to this feature — spoofing, tampering, disclosure, denial of service — and a control for each.", "A light pass: the main threats listed with a control each."),
    3: form("Enumerate applicable STRIDE threats for this feature and define a mitigation control per threat: Spoofing (identity verification), Tampering (input validation + integrity checks), Repudiation (audit logging), Information Disclosure (data exposure scope), Denial of Service (rate limiting + timeouts), Elevation of Privilege (authorization checks) — confirm each relevant threat has a control before shipping.", "STRIDE threat model for this feature hasn't been completed — risk of un-mitigated attack vectors at ship."),
    4: form("Prioritise and verify the controls: rank the threats by how exploitable and damaging each is, and for the top ones test that the control actually blocks the attack — not just that a control exists.", "Beyond a control list: threats ranked by exploitability and the top controls tested."),
    5: form("Write a threat-model note: each applicable threat by category ranked by exploitability, its mitigation control, and the test confirming the control blocks it — so no attack vector ships un-mitigated.", "A durable threat-model note of ranked threats, controls, and the tests confirming them."),
  },
};

/** ABSENCE_DATABASE_MIGRATION_SAFETY — expand-migrate-contract phasing, keyword "migrat". Produces a written plan. SENSITIVE (run migration). */
export const ABSENCE_DATABASE_MIGRATION_SAFETY_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DATABASE_MIGRATION_SAFETY', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS9_PARAM_AXES,
  l2SafeguardRequired: true,
  l2SafeguardLine: "Before you run any schema migration, ask me for go-ahead confirmation first.",
  levelForms: {
    1: form("Check this database change can be done as a safe migration — a backward-compatible add before any removal.", "The lightest step: the schema migration checked for a backward-compatible first phase."),
    2: form("Sketch the migration in safe phases: add the new shape first, migrate the data, then clean up — each reversible.", "A light pass: the migration sketched as reversible phases."),
    3: form("Apply the expand-migrate-contract sequence to this database change: confirm the schema change can be split into a backward-compatible add phase, a data migration phase, and a cleanup phase — so each phase deploys independently without downtime or rollback risk.", "Expand-migrate-contract safety check for this schema change hasn't been applied — risk of destructive single-step migration without rollback."),
    4: form("Rehearse the migration before running it: dry-run each phase against a copy of production data, confirm the backward-compatible window holds, and write the exact rollback for each phase.", "Beyond phasing: the migration dry-run on a copy with a per-phase rollback written."),
    5: form("Write a migration plan: the expand, migrate, and contract phases, each independently deployable and reversible, the dry-run result, and the rollback for each — so no single destructive step risks downtime.", "A durable migration plan of reversible phases, the dry-run, and per-phase rollback."),
  },
};

/** ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE — rollout strategy + rollback, keyword "rollback". Produces a written plan. SENSITIVE (trigger deployment). */
export const ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS9_PARAM_AXES,
  l2SafeguardRequired: true,
  l2SafeguardLine: "Before you trigger any deployment, ask me for go-ahead confirmation first.",
  levelForms: {
    1: form("Before shipping, name how this rolls out and the rollback if it goes wrong.", "The lightest step: the rollout approach and its rollback named."),
    2: form("Sketch the rollout: a gradual release to a few users first, and the rollback procedure if metrics dip.", "A light pass: a gradual rollout and its rollback sketched."),
    3: form("Define the deployment strategy for this feature before shipping: choose the strategy (canary, feature flag, blue-green, staged rollout), define the rollback procedure, and confirm the rollback can be completed within the acceptable downtime window.", "Deployment strategy and rollback plan haven't been defined — risk of un-isolated full-traffic deploy."),
    4: form("Make rollback automatic: define the health metric and threshold that aborts the rollout and triggers rollback without a human in the loop, and confirm it fires within the acceptable downtime window.", "Beyond a procedure: an automatic rollback trigger defined on a health threshold."),
    5: form("Write a deployment plan: the rollout strategy (canary, blue-green, feature flag, or staged rollout), the automatic rollback trigger and procedure, and the downtime window it must fit — so a release is isolated and reversible, never full-traffic blind.", "A durable deployment plan of rollout strategy, the automatic rollback trigger, and the downtime window."),
  },
};

/** ABSENCE_OPERATIONAL_RUNBOOK_GAP — write the operational runbook, keyword "runbook". Produces a written runbook. */
export const ABSENCE_OPERATIONAL_RUNBOOK_GAP_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_OPERATIONAL_RUNBOOK_GAP', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS9_PARAM_AXES,
  levelForms: {
    1: form("Start the runbook with the one thing on-call most needs — the key health signal to watch.", "The lightest step: the runbook started with the key health signal."),
    2: form("Draft the runbook basics: what the feature does, the health metrics to watch, and who to escalate to.", "A light pass: the runbook's basics — function, metrics, escalation — drafted."),
    3: form("Write the operational runbook for this feature before shipping: document what the feature does, how to deploy it, the key health metrics to monitor, how to diagnose the most likely failure scenarios, and the escalation path if on-call cannot resolve the issue.", "Operational runbook for this feature hasn't been written — risk of on-call without diagnostic or escalation path when the feature fails."),
    4: form("Make the runbook usable under pressure: map the top failure alerts directly to the first diagnostic step for each, and have someone who didn't build it try to follow the runbook — fixing every gap they hit.", "Beyond basics: the runbook's alerts mapped to first steps and dry-run by a non-builder."),
    5: form("Write the operational runbook: what it does, how to operate it, the health metrics, each top alert mapped to its first diagnostic step, and the escalation path — so on-call is never stranded when it fails.", "A durable operational runbook of operation, metrics, alert-to-step mapping, and escalation."),
  },
};

/** ABSENCE_SLO_DEFINITION_GAP — define SLOs + alerting, keyword "slo". Produces a written doc. */
export const ABSENCE_SLO_DEFINITION_GAP_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SLO_DEFINITION_GAP', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS9_PARAM_AXES,
  levelForms: {
    1: form("Name one SLO for this feature — the availability or latency target it must meet.", "The lightest step: one SLO target named for the feature."),
    2: form("Sketch the SLOs: availability, latency, and error-rate targets, and how each is watched.", "A light pass: the feature's SLO targets and how they're watched sketched."),
    3: form("Define SLOs for this feature before shipping: specify the availability target, the latency p99 budget, and the error rate budget — then confirm alerting and on-call escalation are tied to each SLO before launch.", "SLOs for this feature haven't been defined — risk of un-evaluable service-quality contract with consumers."),
    4: form("Add the error-budget policy to the SLOs: decide what changes when a budget is burning — freeze risky changes, page on-call, or shift to reliability work — so the SLO drives action, not just measurement.", "Beyond setting targets: an SLO error-budget burn policy that drives action."),
    5: form("Write an SLO doc: the availability, latency, and error-rate targets, the budget for each, the alerting and escalation tied to them, and the error-budget burn policy — the service-quality contract consumers can rely on.", "A durable SLO doc of targets, budgets, tied alerting, and the burn policy."),
  },
};

/** All class-9 academic/hardcore-pro records = the 12 signals (all formal-anchored). */
export const CLASS9_RECORDS: readonly ContentTemplateRecord[] = [
  ABSENCE_DECISION_RECORD_ABSENCE_RECORD,
  ABSENCE_OVER_ENGINEERING_CHECK_RECORD,
  ABSENCE_PAIR_REVIEW_ABSENCE_RECORD,
  ABSENCE_OBSERVABILITY_FIRST_RECORD,
  ABSENCE_FAILURE_MODE_ANALYSIS_RECORD,
  ABSENCE_CONTRACT_TESTING_GAP_RECORD,
  ABSENCE_CAPACITY_PLANNING_GAP_RECORD,
  ABSENCE_SECURITY_THREAT_MODELING_RECORD,
  ABSENCE_DATABASE_MIGRATION_SAFETY_RECORD,
  ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_RECORD,
  ABSENCE_OPERATIONAL_RUNBOOK_GAP_RECORD,
  ABSENCE_SLO_DEFINITION_GAP_RECORD,
];
