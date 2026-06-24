// Per-class decision-session content (class9_academic_hardcore_pro). Relocated verbatim from
// options.ts / options-beginner.ts — one home per signal class.

import type { DecisionContent } from '../options.js';
import { WHY_HELP_BY_SIGNAL_TYPE } from '../why-help-by-signal-type.js';

// ── Phase 5 D10 — hardcore_pro cluster 1 (FORMAL register) ───────────────────
export const ABSENCE_DECISION_RECORD_ABSENCE_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_DECISION_RECORD_ABSENCE",
  question:      'Architectural decision made — ADR recorded?',
  pinchFallback: 'Record the decision with context and consequences.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DECISION_RECORD_ABSENCE'],
  L1: [
    {
      option: 'Write an architecture decision record for the key design decision made here: document the context (what problem was being solved), the decision made, the alternatives that were considered and rejected, and the consequences — so future engineers understand why this exists as it does.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Architectural decision just made without an ADR written to capture rationale."}
An architecture decision record for this design decision hasn't been written — design rationale risks being lost as team composition changes.
Document: context / decision / alternatives considered + rejected / consequences.
{R4_CLOSE}`,
    },
    {
      option: 'Create an ADR capturing this architectural decision: what was decided, what were the alternatives, what tradeoffs were accepted, and what constraints or assumptions this decision depends on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "ADR with tradeoffs + assumptions not written."}
The ADR with tradeoffs + assumptions hasn't been written.
Decided / alternatives / tradeoffs accepted / constraints + assumptions.
{R4_CLOSE}`,
    },
    {
      option: 'Record this architectural decision before the session ends: context, decision, consequences, alternatives considered — without this, the design rationale will be lost as team composition or memory changes.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "End-of-session ADR write not done."}
The pre-session-end ADR write hasn't been done.
Context / decision / consequences / alternatives — lost otherwise as team or memory changes.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Write an ADR for this decision — context, decision, consequences, and alternatives considered.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Decision made."}
Lighter: ADR with context / decision / consequences / alternatives.
{R4_CLOSE}`,
    },
    {
      option: 'Document the key architectural decision made here: what was decided and why, and what the main alternative was.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Decision made."}
Narrower: key decision + why + main alternative.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Write an ADR for this decision: context, decision, consequences, and alternatives considered.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Decision made."}
Minimum next step: ADR with context / decision / consequences / alternatives.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_OVER_ENGINEERING_CHECK_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_OVER_ENGINEERING_CHECK",
  question:      'Is this abstraction required by current requirements?',
  pinchFallback: 'Apply YAGNI — build only what current requirements require.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_OVER_ENGINEERING_CHECK'],
  L1: [
    {
      option: 'Apply YAGNI to what was just built: identify any abstraction, interface, or configuration option that was added speculatively — not required by a current story or use case — and remove or defer it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Speculative abstractions added without current requirements justifying them."}
YAGNI hasn't been applied to what was just built — speculative abstractions accumulate as code with no current consumer.
Identify: abstraction / interface / config option added speculatively / remove or defer.
Still, before you delete or restructure any code you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Audit what was just built for speculative design: flag any abstraction layer, plugin interface, or extensibility mechanism that has no current consumer, and propose removing or simplifying it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Speculative-design audit not done."}
The speculative-design audit hasn't been done.
Flag: abstraction layer / plugin interface / extensibility mechanism with no current consumer / remove or simplify.
Still, before you delete or simplify any code you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Apply YAGNI: for each abstraction in what was just built, confirm there is a current requirement that justifies it — if not, propose the simpler implementation that still satisfies the present use case.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Per-abstraction current-requirement check not done."}
The per-abstraction requirement-check hasn't been done.
Per abstraction: current requirement justifies? / simpler-implementation proposal if not.
Still, before you delete or replace any abstraction in code you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Apply YAGNI to what was just built — identify and remove any abstraction not required by a current story or use case.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Code just built."}
Lighter: YAGNI — identify + remove unrequired abstraction.
Still, before you delete any abstraction you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Is there any abstraction in what was just built that has no current consumer? If so, propose removing it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Code just built."}
Narrower: any-no-current-consumer abstraction → propose removal.
Still, before you remove any abstraction you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Apply YAGNI — remove speculative abstraction and implement only what current requirements require.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Code just built."}
Minimum next step: YAGNI — remove speculative + implement current-requirement only.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_PAIR_REVIEW_ABSENCE",
  question:      'Critical implementation complete — review plan established?',
  pinchFallback: 'Establish a review plan before merging.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_PAIR_REVIEW_ABSENCE'],
  L1: [
    {
      option: 'Establish a review plan for this change before merging: define who reviews it, what the review checklist covers (design correctness, error handling, edge cases, security, performance implications), and what the merge gate is — confirm the plan is in place before the branch is merged.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Critical change about to merge without a review plan established."}
A review plan for this change hasn't been established — risk of merging without checklist coverage of design / errors / edge cases / security.
Define: reviewer / checklist (design / errors / edge cases / security / performance) / merge gate — pre-merge.
{R4_CLOSE}`,
    },
    {
      option: 'Define a review checklist for this change: design correctness, error handling completeness, edge case coverage, security implications, and any performance concerns — then assign reviewers and set a merge gate before proceeding.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Review checklist + reviewer + merge gate not defined."}
The checklist + reviewer + merge-gate triple hasn't been defined.
Checklist / assigned reviewer / merge gate set pre-proceed.
{R4_CLOSE}`,
    },
    {
      option: 'Complete a structured review of what was just built: verify the design decision, check error handling for every failure path, confirm edge cases are covered, and flag any security implications before this merges.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Structured review of build not completed."}
The structured-review completion hasn't been done.
Design decision verified / per-failure-path error handling / edge-case coverage / security flag — pre-merge.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Set up a review plan for this change: define the checklist, assign reviewers, and set a merge gate before merging.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Change pending merge."}
Lighter: checklist + reviewers + merge gate pre-merge.
{R4_CLOSE}`,
    },
    {
      option: 'What is the review plan for this change? Who reviews it, what does the checklist cover, and what is the merge gate?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Change pending merge."}
Narrower: who reviews / checklist scope / merge gate.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Establish and complete a review plan before merging — design correctness, error handling, security surface.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Change pending merge."}
Minimum next step: review plan — design / errors / security — pre-merge.
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 5 D11 — hardcore_pro cluster 2 (FORMAL register) ───────────────────
export const ABSENCE_OBSERVABILITY_FIRST_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_OBSERVABILITY_FIRST",
  question:      'Feature shipping — observability instrumented?',
  pinchFallback: 'Add logging, metrics, and tracing before shipping.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_OBSERVABILITY_FIRST'],
  L1: [
    {
      option: 'Add observability to this feature before shipping: instrument all three pillars — structured logging at each significant event boundary, metrics for request rate, error rate, and latency, and distributed trace spans for every external call — so production behavior is visible from day one.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature about to ship without observability across the three pillars."}
Observability instrumentation (logs / metrics / traces) hasn't been added — production behaviour invisible from day one.
Three pillars: structured logging at event boundaries / metrics (RPS, error rate, latency) / trace spans per external call.
Still, before you add instrumentation across multiple files you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Define and implement the observability strategy for this feature before it ships: what events get logged (and at what level), what metrics are emitted, and what trace spans are added for every external dependency call.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Observability strategy definition + implementation not done."}
The strategy + implementation pair hasn't been done.
Events logged + level / metrics emitted / trace spans per external-dep call.
Still, before you implement instrumentation across multiple files you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Instrument this feature with logs, metrics, and traces before shipping: confirm all three observability pillars are in place, that the metrics are wired to dashboards, and that alerts are defined before launch.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Three-pillar instrumentation + dashboard wire-up + alerts not in place."}
The instrumentation + dashboard + alerts triple hasn't been done.
Logs + metrics + traces / metrics → dashboards / alerts defined pre-launch.
Still, before you add instrumentation, dashboards, or alerts across the codebase you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Add logging, metrics, and distributed tracing to this feature before shipping — all three observability pillars required.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Lighter: logs + metrics + tracing — all three required.
{R4_CLOSE}`,
    },
    {
      option: 'What logs, metrics, and trace spans does this feature emit? Confirm all three are in place before it ships.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Narrower: per-pillar emission audit pre-ship.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Add logging, metrics, and tracing instrumentation before shipping — all three pillars required.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Minimum next step: instrument all three pillars pre-ship.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_FAILURE_MODE_ANALYSIS",
  question:      'External dependencies integrated — failure modes enumerated?',
  pinchFallback: 'Enumerate failure modes for each dependency.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_FAILURE_MODE_ANALYSIS'],
  L1: [
    {
      option: 'Enumerate failure modes for every external dependency this feature relies on: for each dependency, name the failure mode (timeout, error response, partial data, unavailability), specify the stability pattern that handles it (circuit breaker, timeout + fallback, bulkhead, retry with backoff), and confirm the pattern is implemented before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature uses external dependencies without failure modes enumerated per dependency."}
Failure modes for external dependencies haven't been enumerated — risk of cascading failure when a dependency fails.
Per dependency: failure mode / stability pattern (circuit breaker / timeout+fallback / bulkhead / retry+backoff) / implemented pre-ship.
Still, before you implement any stability pattern across multiple files you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Identify the top three external dependencies in this feature and define the failure behavior for each: what happens when each dependency is slow, returns an error, or is unavailable — and what stability pattern prevents cascading failure.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Top-3 external deps + per-failure-behaviour not defined."}
The top-3-deps + per-behaviour definition hasn't been done.
Slow / error / unavailable per dep / stability pattern preventing cascade.
Still, before you implement any stability pattern in the codebase you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Audit every external call in this feature for failure handling: confirm each has a timeout, a defined error response, and a documented degradation path.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Per-external-call failure-handling audit not done."}
The per-call failure-handling audit hasn't been done.
Timeout / defined error response / documented degradation path per external call.
Still, before you add timeouts or error-handling across multiple call sites you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'For each external dependency in this feature: name the failure mode and confirm the stability pattern (circuit breaker, timeout, fallback) is in place.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "External deps in feature."}
Lighter: per-dep failure mode + stability pattern in place.
{R4_CLOSE}`,
    },
    {
      option: 'What is the worst failure scenario for this feature\'s most critical external dependency, and is there a stability pattern preventing it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "External deps in feature."}
Narrower: worst-failure + critical-dep + stability pattern preventing.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Enumerate failure modes for each dependency and specify the stability pattern for each before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "External deps in feature."}
Minimum next step: enumerate failure modes + stability pattern per dep pre-ship.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_CONTRACT_TESTING_GAP_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_CONTRACT_TESTING_GAP",
  question:      'Service boundary established — contract tests defined?',
  pinchFallback: 'Define consumer-driven contract tests for this boundary.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_CONTRACT_TESTING_GAP'],
  L1: [
    {
      option: 'Define consumer-driven contract tests for this service boundary before independent deployment: write the contract from the consumer\'s perspective, verify the provider satisfies it in isolation, and add provider verification to the CI pipeline.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Service boundary about to be deployed independently without contract tests."}
Consumer-driven contract tests for this service boundary haven't been defined — risk of breaking-change surprises during independent deployment.
Consumer-perspective contract / provider verifies in isolation / CI pipeline provider-verification gate.
{R4_CLOSE}`,
    },
    {
      option: 'Write contract tests that verify this service\'s API from the consumer\'s view: define the expected request/response shape, the error responses, and the versioning behavior — independently of the provider\'s implementation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Consumer-view contract-test write not done."}
The consumer-view contract-test write hasn't been done.
Request/response shape / error responses / versioning behaviour — independent of provider impl.
{R4_CLOSE}`,
    },
    {
      option: 'Establish a contract testing gate for this service boundary: define what the consumer expects, implement provider verification, and confirm the CI pipeline enforces it before any consumer or provider changes ship independently.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "CI-enforced contract-testing gate not established."}
The CI-enforced contract-testing gate hasn't been established.
Consumer expectations / provider verification impl / CI enforcement pre-independent-ship.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Write consumer-driven contract tests for this service boundary — define the contract from the consumer\'s perspective and verify the provider satisfies it in isolation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Service boundary in use."}
Lighter: consumer-driven contract / provider satisfies in isolation.
{R4_CLOSE}`,
    },
    {
      option: 'Define the expected API contract for this service boundary and implement provider verification before independent deployment.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Service boundary in use."}
Narrower: API contract + provider verification pre-independent-deploy.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Define consumer-driven contract tests for this service boundary before independent deployment.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Service boundary in use."}
Minimum next step: consumer-driven contract tests pre-independent-deploy.
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 5 D12 — hardcore_pro clusters 3+4 (FORMAL register) ────────────────
export const ABSENCE_CAPACITY_PLANNING_GAP_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_CAPACITY_PLANNING_GAP",
  question:      'Load-adding feature — capacity estimate done?',
  pinchFallback: 'Complete a capacity estimate before shipping.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_CAPACITY_PLANNING_GAP'],
  L1: [
    {
      option: 'Estimate capacity requirements for this feature before shipping: project peak request rate (RPS), storage growth over 90 days, and required infrastructure headroom — then verify current infrastructure can serve the estimated peak load.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature adds load but capacity estimate not done."}
Capacity estimate for this feature hasn't been completed — risk of infrastructure saturation post-launch.
Project: peak RPS / 90-day storage growth / infra headroom — verify current infra serves estimated peak.
{R4_CLOSE}`,
    },
    {
      option: 'Define capacity targets for this feature: what is the expected RPS at launch and at 10× scale, what is the storage growth rate, and is current provisioning sufficient for each?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Capacity targets at launch + 10× scale not defined."}
The launch + 10× capacity targets haven't been defined.
RPS at launch + 10× / storage growth rate / current provisioning sufficient per each.
{R4_CLOSE}`,
    },
    {
      option: 'Audit infrastructure requirements for this feature: estimate peak load, define headroom thresholds, and confirm monitoring alerts are in place before any metric approaches the estimated saturation point.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Headroom thresholds + saturation monitoring not in place."}
The headroom + saturation-monitoring setup hasn't been done.
Peak load / headroom thresholds / monitoring alerts pre-saturation-approach.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Estimate peak RPS, storage growth over 90 days, and infrastructure headroom for this feature before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Lighter: peak RPS + 90-day storage + infra headroom estimate pre-ship.
{R4_CLOSE}`,
    },
    {
      option: 'At what RPS does this feature saturate its current infrastructure, and is that load likely within the next 90 days?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Narrower: saturation RPS + 90-day likelihood.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Capacity estimate required: RPS at peak, storage growth rate, infrastructure headroom. Provide all three before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Minimum next step: RPS + storage growth + headroom — all three pre-ship.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SECURITY_THREAT_MODELING_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_SECURITY_THREAT_MODELING",
  question:      'Security-sensitive feature — STRIDE threat model completed?',
  pinchFallback: 'Complete a STRIDE threat model before shipping.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SECURITY_THREAT_MODELING'],
  L1: [
    {
      option: 'Enumerate applicable STRIDE threats for this feature and define a mitigation control per threat: Spoofing (identity verification), Tampering (input validation + integrity checks), Repudiation (audit logging), Information Disclosure (data exposure scope), Denial of Service (rate limiting + timeouts), Elevation of Privilege (authorization checks) — confirm each relevant threat has a control before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Security-sensitive feature pending ship without STRIDE threat model."}
STRIDE threat model for this feature hasn't been completed — risk of un-mitigated attack vectors at ship.
Per STRIDE category: Spoofing / Tampering / Repudiation / Info Disclosure / DoS / Elevation — control per relevant threat pre-ship.
Still, before you implement any security control in code you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Apply STRIDE to this feature\'s threat surface: for each applicable threat category, name the attack vector, identify the data or component at risk, and define the control that mitigates it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "STRIDE-to-threat-surface application not done."}
The STRIDE → threat-surface application hasn't been done.
Per category: attack vector / at-risk data or component / mitigating control.
Still, before you implement any mitigating control in code you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Threat-model this feature using STRIDE categories: enumerate threats, assign severity, and confirm each threat has a documented mitigation or an accepted-risk decision before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "STRIDE threats + severity + mitigation/accepted-risk not documented."}
The threats + severity + mitigation-or-accepted-risk documentation hasn't been done.
Enumerate / severity / mitigation OR accepted-risk decision per threat pre-ship.
Still, before you implement any security mitigation in code you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Identify the top three STRIDE threats for this feature and define mitigation controls for each.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Security-sensitive feature."}
Lighter: top-3 STRIDE threats + mitigation per.
{R4_CLOSE}`,
    },
    {
      option: 'Apply STRIDE to this feature: for each applicable category, what is the threat and what control mitigates it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Security-sensitive feature."}
Narrower: per-category threat + mitigating control.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'STRIDE threat model required: enumerate applicable threats and define mitigation controls before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Security-sensitive feature."}
Minimum next step: STRIDE enumerate + mitigation controls pre-ship.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_DATABASE_MIGRATION_SAFETY",
  question:      'Schema change — expand-migrate-contract pattern applied?',
  pinchFallback: 'Apply backwards-compatible phased migration.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DATABASE_MIGRATION_SAFETY'],
  L1: [
    {
      option: 'Apply the expand-migrate-contract sequence to this database change: confirm the schema change can be split into a backward-compatible add phase, a data migration phase, and a cleanup phase — so each phase deploys independently without downtime or rollback risk.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Schema change pending without expand-migrate-contract sequencing."}
Expand-migrate-contract safety check for this schema change hasn't been applied — risk of destructive single-step migration without rollback.
3 phases: backward-compatible add / data migration / cleanup — each deploys independently no-downtime no-rollback-risk.
Still, before you run any schema migration you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Verify this migration is reversible and safe under concurrent writes: confirm no destructive operation (DROP, NOT NULL without default, column rename) occurs in a single migration step, and that the expand-migrate-contract pattern applies.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Reversibility + concurrent-write safety not verified."}
The reversibility + concurrent-write-safety verification hasn't been done.
No single-step destructive (DROP / NOT NULL no-default / rename) / expand-migrate-contract applies.
Still, before you run any schema migration you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Audit this database migration for safety: identify any destructive schema changes, verify backward compatibility during the migration window, and confirm rollback is possible at each step.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Migration safety audit not done."}
The migration safety audit hasn't been done.
Destructive changes identified / backward compat during window / rollback per step.
Still, before you apply any destructive schema change you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Verify this migration uses the expand-migrate-contract pattern — confirm no destructive schema operation happens in a single deployment step.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Schema change pending."}
Lighter: expand-migrate-contract pattern verified — no single-step destructive.
Still, before you run any schema migration you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Is this migration reversible? Can it be rolled back without data loss if the deployment is reverted mid-migration?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Schema change pending."}
Narrower: reversible + no-data-loss-on-mid-migration-revert.
Still, before you run any schema migration you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Expand-migrate-contract required: no destructive schema changes in a single deployment. Phase across multiple deployments.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Schema change pending."}
Minimum next step: phase the schema change across deployments.
Still, before you run any schema migration you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE",
  question:      'Significant feature shipping — deployment strategy defined?',
  pinchFallback: 'Define deployment strategy and rollback plan before shipping.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE'],
  L1: [
    {
      option: 'Define the deployment strategy for this feature before shipping: choose the strategy (canary, feature flag, blue-green, staged rollout), define the rollback procedure, and confirm the rollback can be completed within the acceptable downtime window.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Significant feature pending ship without deployment strategy."}
Deployment strategy and rollback plan haven't been defined — risk of un-isolated full-traffic deploy.
Strategy: canary / feature flag / blue-green / staged rollout / rollback procedure / rollback within downtime window.
Still, before you trigger any deployment you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Establish a deployment plan for this feature: what strategy isolates risk (canary or staged rollout), what signals trigger an abort, and what the rollback procedure is if those signals are observed post-deploy.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Risk-isolating strategy + abort signals + rollback not defined."}
The strategy + abort-signals + rollback definition hasn't been done.
Risk-isolating strategy / abort signals / rollback procedure on signals observed post-deploy.
Still, before you trigger any deployment you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Audit deployment readiness: confirm deployment strategy, verify rollback procedure, and check that monitoring is in place to detect a failed deploy before it reaches full traffic.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Deployment readiness audit not done."}
The deployment readiness audit hasn't been done.
Strategy confirmed / rollback verified / failed-deploy-detection monitoring pre-full-traffic.
Still, before you trigger any deployment you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Define deployment strategy and rollback plan for this feature before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Lighter: strategy + rollback plan pre-ship.
Still, before you trigger any deployment you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'What is the deployment strategy for this feature, and what triggers a rollback if the deploy fails?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Narrower: strategy + rollback trigger on deploy-fail.
Still, before you trigger any deployment you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Define deployment strategy (canary/feature flag/blue-green/staged) and rollback plan before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Minimum next step: strategy (canary/flag/blue-green/staged) + rollback pre-ship.
Still, before you trigger any deployment you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_OPERATIONAL_RUNBOOK_GAP",
  question:      'New service/feature shipping — operational runbook written?',
  pinchFallback: 'Write the runbook before shipping.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_OPERATIONAL_RUNBOOK_GAP'],
  L1: [
    {
      option: 'Write the operational runbook for this feature before shipping: document what the feature does, how to deploy it, the key health metrics to monitor, how to diagnose the most likely failure scenarios, and the escalation path if on-call cannot resolve the issue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "New service/feature pending ship without operational runbook."}
Operational runbook for this feature hasn't been written — risk of on-call without diagnostic or escalation path when the feature fails.
Document: what / deploy / key health metrics / diagnose likely failures / escalation path.
{R4_CLOSE}`,
    },
    {
      option: 'Define the operational documentation for this feature: deployment steps, expected normal behavior, failure indicators, debug steps for the top three failure modes, and escalation contacts.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Operational docs not defined."}
The operational-docs definition hasn't been done.
Deploy steps / normal behaviour / failure indicators / top-3 debug steps / escalation contacts.
{R4_CLOSE}`,
    },
    {
      option: 'Write the runbook before this ships: what it does, how it is deployed, how to confirm it is healthy, how to debug it when it is not, and who to escalate to.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Pre-ship runbook write not done."}
The pre-ship runbook write hasn't been done.
What / deploy / health-confirm / debug-when-not-healthy / escalate-to.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Write the runbook for this feature before shipping — cover deploy steps, health metrics, failure scenarios, and escalation path.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Lighter: deploy + health + failure scenarios + escalation pre-ship.
{R4_CLOSE}`,
    },
    {
      option: 'Document how to debug this feature when it is misbehaving in production — the top two or three failure modes and how to diagnose each.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Narrower: top 2-3 failure modes + diagnostic per.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Write the runbook before shipping: what it does, how to debug failures, key metrics, and escalation path.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Minimum next step: runbook — what / debug / metrics / escalation.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SLO_DEFINITION_GAP_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_SLO_DEFINITION_GAP",
  question:      'User-facing feature/service — SLOs defined?',
  pinchFallback: 'Define SLOs before shipping.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SLO_DEFINITION_GAP'],
  L1: [
    {
      option: 'Define SLOs for this feature before shipping: specify the availability target, the latency p99 budget, and the error rate budget — then confirm alerting and on-call escalation are tied to each SLO before launch.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "User-facing feature/service pending ship without SLOs defined."}
SLOs for this feature haven't been defined — risk of un-evaluable service-quality contract with consumers.
Availability % / latency p99 budget / error rate budget / alerting + on-call escalation per SLO pre-launch.
{R4_CLOSE}`,
    },
    {
      option: 'Establish service level objectives for this feature: what availability does the consumer depend on, what is the acceptable latency at p99, and what error rate triggers an incident — document these before any consumer dependency is established.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Consumer-dependency SLO documentation not done."}
The consumer-dependency-SLO documentation hasn't been done.
Availability depended-on / p99 latency / error rate incident-trigger — pre-consumer-dependency.
{R4_CLOSE}`,
    },
    {
      option: 'Set and document SLOs before this ships: availability %, latency p99, error rate budget, and the burn rate at which the error budget is exhausted — so on-call knows what to page on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "SLO + burn-rate + page-trigger not set."}
The SLO + burn-rate + page-trigger setup hasn't been done.
Availability % / latency p99 / error budget / burn rate at budget-exhaustion / on-call page basis.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Define availability, latency p99, and error rate SLOs for this feature before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Lighter: availability + p99 latency + error rate SLOs pre-ship.
{R4_CLOSE}`,
    },
    {
      option: 'What are the SLOs for this feature? Specify availability %, latency p99, and error rate budget.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Narrower: SLO triple — availability % / p99 / error rate budget.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Define SLOs before shipping: availability target, latency target (p99), and error rate budget.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Minimum next step: SLOs — availability + p99 + error rate pre-ship.
{R4_CLOSE}`,
    },
  ],
};
