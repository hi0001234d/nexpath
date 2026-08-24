/**
 * Release / observability / infrastructure content-template records (class 4).
 * One record per signal; column 3 is the existing shipped headline (kept verbatim),
 * and columns 1/2/4/5 escalate the same practice from a quick check up to a written
 * artifact (a runbook, a deployment plan, a CI workflow file, a secrets-handling note).
 *
 * These are ops signals concerning intrinsically sensitive actions — deploys,
 * secrets and credentials, dependency installs, production touches, multi-file
 * changes. Every record is marked sensitive (`l2SafeguardRequired`) and carries an
 * action-specific `l2SafeguardLine` — the engine appends that line as the LAST line
 * of whichever maturity column is served (after the grounding facts), so the
 * confirm-seek covers every column uniformly, including the frozen col-3 anchor
 * whose stored why-desc cannot carry it.
 *
 * BATCH A = the 7 signals with a formal shipped headline. BATCH B = the 1 casual-only
 * signal (column 3 anchors on the casual variant, which cites a named standard).
 */

import type { ContentTemplateRecord, LevelForm, ParamAxisTag } from '../content-template-schema.js';
import {
  OBSERVABILITY_BEGINNER_OVERRIDE, ROLLBACK_PLANNING_BEGINNER_OVERRIDE, DEPLOYMENT_PLANNING_BEGINNER_OVERRIDE,
  DEPENDENCY_MGMT_BEGINNER_OVERRIDE, ENV_AND_SECRETS_BEGINNER_OVERRIDE, CI_PIPELINE_BEGINNER_OVERRIDE,
  RATE_LIMITING_BEGINNER_OVERRIDE,
} from './class4-records-beginner.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}

/** The param axes a release/ops why-desc grounds (same generic sources as the other classes). */
export const OPS_PARAM_AXES: Readonly<Record<string, ParamAxisTag>> = {
  workflow_pattern: 'extensible',
  decision_making_rhythm: 'closed-ordinal',
  explanation_learning_depth: 'closed-ordinal',
  abstraction_level_orientation: 'closed-ordinal',
  project_framework: 'open',
};

// ── BATCH A — the 7 formal-headline ops signals (all sensitive) ─────────────────

/** ABSENCE_OBSERVABILITY — ops, keyword "logging". Sensitive. */
export const ABSENCE_OBSERVABILITY_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_OBSERVABILITY', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: OBSERVABILITY_BEGINNER_OVERRIDE },
  paramAxes: OPS_PARAM_AXES, l2SafeguardRequired: true,
  l2SafeguardLine: 'Ask me for go-ahead before adding logging across the codebase.',
  levelForms: {
    1: form("Add logging for the one failure in what was just built that would otherwise be silent in production.", "Just one logging line — on the single failure that would otherwise be silent in production. Don't instrument the whole thing yet."),
    2: form("Add structured logging to what was just built for the main failure and latency paths, so a silent break is visible.", "Cover the main failure and latency paths with structured logging — enough to see a silent break, not full coverage yet."),
    3: form("Review what was just built for observability gaps: identify what this feature does in production that is currently invisible — requests, failures, latency, state changes — and add structured logging for the events that would allow you to diagnose a production incident without SSH access.", "Focus on what's invisible in production — requests, failures, latency, state changes — and add structured logging you could diagnose an incident from without SSH access."),
    4: form("Audit what was just built for monitoring coverage: structured logging on every failure path, metrics for latency and throughput, and an alert that fires on silent degradation.", "Go wider than the main paths — logging on every failure path, latency and throughput metrics, and an alert that fires on silent degradation."),
    5: form("Write a monitoring note file plus the logging: the events logged, the metrics emitted, the alert conditions, and how to diagnose an incident from them — kept with the feature.", "Keep a monitoring note file alongside the logging — the events logged, metrics emitted, alert conditions, and how to diagnose an incident from them."),
  },
};

/** ABSENCE_ROLLBACK_PLANNING — ops, keyword "rollback". Sensitive. */
export const ABSENCE_ROLLBACK_PLANNING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_ROLLBACK_PLANNING', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: ROLLBACK_PLANNING_BEGINNER_OVERRIDE },
  paramAxes: OPS_PARAM_AXES, l2SafeguardRequired: true,
  l2SafeguardLine: 'Ask me for go-ahead before running or scripting the rollback.',
  levelForms: {
    1: form("Note the one rollback step needed if the release of what was just built fails.", "Just the single rollback step you'd need if this release fails — one revert action, written down."),
    2: form("Document the main rollback steps for this release before shipping: how to revert and how to confirm the revert worked.", "Cover the main rollback steps before shipping — how to revert and how to confirm the revert actually worked."),
    3: form("Define the rollback procedure for this feature before shipping: identify the steps to revert if the deployment fails, confirm the rollback can be completed within your acceptable downtime window, and verify that database migrations or data changes are reversible.", "Lay out the revert steps, confirm they fit the acceptable downtime window, and verify any database migrations or data changes are reversible."),
    4: form("Audit rollback readiness: the revert steps, the data and migration reversibility, the downtime window, and what would be left inconsistent — document each before shipping.", "Go past the steps to rollback reversibility — data and migrations, the downtime window, and what state would be left inconsistent; document each before shipping."),
    5: form("Write a rollback runbook file: the ordered revert steps, the reversibility of each migration, the downtime window, the owner, and the manual cleanup — executable under pressure without improvisation.", "Capture a rollback runbook file — ordered revert steps, per-migration reversibility, downtime window, owner, and manual cleanup — so it runs under pressure without improvising."),
  },
};

/** ABSENCE_DEPLOYMENT_PLANNING — ops, keyword "deploy". Sensitive. */
export const ABSENCE_DEPLOYMENT_PLANNING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DEPLOYMENT_PLANNING', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: DEPLOYMENT_PLANNING_BEGINNER_OVERRIDE },
  paramAxes: OPS_PARAM_AXES, l2SafeguardRequired: true,
  l2SafeguardLine: 'Ask me for go-ahead before deploying or changing infrastructure.',
  levelForms: {
    1: form("Note the one thing the production environment needs before what was just built can deploy.", "Just name the one production prerequisite this needs before it can deploy — nothing more yet."),
    2: form("List the main deploy prerequisites for this feature — environment config, secrets, infrastructure — and confirm each before shipping.", "Cover the main deploy prerequisites — env config, secrets, infrastructure — and confirm each before shipping."),
    3: form("Define the deployment plan for this feature before shipping: confirm the target environment configuration, document any environment variables or secrets that need to be provisioned, and verify that the deployment process has been tested outside of production.", "Confirm the target environment config, document the env variables and secrets to provision, and verify the deploy process has been tested outside production."),
    4: form("Audit deploy readiness end-to-end: staging-vs-production config differences, new environment variables, required infrastructure changes, and external integrations — flag each gap.", "Take deploy readiness end-to-end — staging-vs-production config drift, new env variables, infra changes, and external integrations; flag each gap."),
    5: form("Write a deployment runbook file: the target config, the secrets and variables to provision, the infrastructure changes, the staging verification, and the cutover steps — kept with the release.", "Capture a deployment runbook file — target config, secrets and variables to provision, infra changes, staging verification, and cutover steps — kept with the release."),
  },
};

/** ABSENCE_DEPENDENCY_MGMT — ops, keyword "dependenc". Sensitive. */
export const ABSENCE_DEPENDENCY_MGMT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DEPENDENCY_MGMT', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: DEPENDENCY_MGMT_BEGINNER_OVERRIDE },
  paramAxes: OPS_PARAM_AXES, l2SafeguardRequired: true,
  l2SafeguardLine: 'Ask me for go-ahead before installing, upgrading, or removing any dependency.',
  levelForms: {
    1: form("Check the one new dependency in what was just built most likely to have a conflict or a known vulnerability.", "Just the single riskiest new dependency — the one most likely to conflict or carry a known vulnerability. Skip the rest for now."),
    2: form("Review the new dependencies in what was just built for version conflicts and known vulnerabilities before shipping.", "Scope this to the new dependencies only — version conflicts and known vulnerabilities — before shipping."),
    3: form("Review the new dependencies introduced in what was just built: check for version conflicts with existing packages, known security vulnerabilities in the chosen version, and whether a more stable or widely-adopted alternative exists for the same purpose.", "For each new package, check version conflicts with existing ones, known vulnerabilities in the chosen version, and whether a more stable or widely-adopted alternative fits."),
    4: form("Audit the new dependencies by category: version conflicts, known vulnerabilities, licence compatibility, maintenance status, and transitive conflicts — flag each package's risks.", "Go category by category over the new dependencies — conflicts, vulnerabilities, licence compatibility, maintenance status, transitive conflicts — and flag each package's risks."),
    5: form("Write a dependency note file: per new package the version, the conflict and vulnerability findings, the licence, the maintenance status, and the keep-or-replace decision — kept with the project.", "Capture a dependency note file — per package: version, conflict and vulnerability findings, licence, maintenance status, and the keep-or-replace call — kept with the project."),
  },
};

/** ABSENCE_ENV_AND_SECRETS — ops, keyword "secret". Sensitive. */
export const ABSENCE_ENV_AND_SECRETS_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_ENV_AND_SECRETS', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: ENV_AND_SECRETS_BEGINNER_OVERRIDE },
  paramAxes: OPS_PARAM_AXES, l2SafeguardRequired: true,
  l2SafeguardLine: 'Ask me for go-ahead before moving, rotating, or deleting any credential.',
  levelForms: {
    1: form("Check what was just built for the one secret most likely hardcoded in source instead of an environment variable.", "Just the single secret most likely hardcoded in source instead of an environment variable — find that one first."),
    2: form("Review the secrets handling for this feature: confirm no credential is hardcoded and each is loaded from an environment variable.", "Scope this to the secrets — confirm none is hardcoded and each loads from an environment variable."),
    3: form("Audit the secrets storage pattern for what was just built: identify every credential, API key, and environment-specific value used — confirm none are hardcoded in source, all are loaded from environment variables, and the variable names are documented in a `.env.example` file.", "Find every credential, API key, and environment-specific value, confirm none is hardcoded and all load from environment variables, and document the names in a `.env.example`."),
    4: form("Audit the secrets posture end-to-end: nothing hardcoded, every value environment-loaded, a documented `.env.example`, the `.env` git-ignored, and a rotation path for each credential.", "Take the secrets posture end-to-end — nothing hardcoded, every value env-loaded, a documented `.env.example`, the `.env` git-ignored, and a rotation path for each."),
    5: form("Write a secrets-handling note file: each credential, where it is stored, the `.env.example` coverage, and the rotation procedure if one is compromised — kept out of source control.", "Capture a secrets-handling note file — each credential, where it's stored, the `.env.example` coverage, and the rotation procedure if one is compromised — kept out of source control."),
  },
};

/** ABSENCE_CI_PIPELINE — ops, keyword "test". Sensitive. */
export const ABSENCE_CI_PIPELINE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_CI_PIPELINE', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: CI_PIPELINE_BEGINNER_OVERRIDE },
  paramAxes: OPS_PARAM_AXES, l2SafeguardRequired: true,
  l2SafeguardLine: 'Ask me for go-ahead before changing the CI configuration or merge gates.',
  levelForms: {
    1: form("Confirm the CI workflow runs the test suite on every pull request to what was just built.", "Just check the CI runs the test suite on every pull request — nothing more elaborate yet."),
    2: form("Check the CI workflow for this project: the test suite runs on every pull request and a test failure blocks the merge.", "Make sure the test suite runs on every pull request and that a test failure actually blocks the merge."),
    3: form("Confirm automated test execution is configured for this project: check that a CI workflow (e.g. GitHub Actions) runs the full test suite on every pull request and push to main — verify the workflow file exists, the test command is correct, and test failures block merges.", "Verify the CI workflow file exists, runs the full test suite on every PR and push to main, uses the right command, and blocks merges on failure."),
    4: form("Audit the CI coverage: the test suite, type-checking, linting, and security scans all run on every pull request, failures block merges, and nothing checked locally is missing from CI.", "Go wider than tests — type-checking, linting, and security scans all run per pull request, failures block merges, and nothing you run locally is missing from CI."),
    5: form("Write the CI configuration into a workflow file: the test suite, the type and lint checks, the security scans, and the rule that failures block merges — versioned with the project.", "Capture the CI config in a workflow file — the test suite, type and lint checks, security scans, and the rule that failures block merges — versioned with the project."),
  },
};

/** ABSENCE_RATE_LIMITING — ops, keyword "limit". Sensitive. */
export const ABSENCE_RATE_LIMITING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_RATE_LIMITING', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: RATE_LIMITING_BEGINNER_OVERRIDE },
  paramAxes: OPS_PARAM_AXES, l2SafeguardRequired: true,
  l2SafeguardLine: 'Ask me for go-ahead before adding throttling to production request paths.',
  levelForms: {
    1: form("Note the per-user request limit for the endpoint in what was just built, and whether anything enforces it.", "Just the per-user request limit for this endpoint and whether anything currently enforces it — one number and its status."),
    2: form("Define the basic rate limit for this endpoint: the per-user or per-key limit and what happens when a caller exceeds it.", "Set the basic rate limit — the per-user or per-key number and what happens when a caller goes over it."),
    3: form("Define the rate limiting strategy for what was just built: specify the throttle limits per user, per API key, or per IP address — confirm which identifier is used for tracking, what the limit is (requests per second or per minute), and what happens when the limit is exceeded.", "Pick the tracking identifier (user, key, or IP), set the limit per window, and say what happens when a caller exceeds it."),
    4: form("Design the rate-limit model end-to-end: the identifier (user, key, or IP), the limit per window, the 429 response with a retry signal, and whether the window is rolling or fixed.", "Take the rate-limit model end-to-end — the identifier, the limit per window, the over-limit response with a retry signal, and whether the window is rolling or fixed."),
    5: form("Write a rate-limit design note file: the per-identifier limits, the time window, the over-limit response, the abuse paths it guards, and where the throttle is enforced — kept with the API.", "Capture a rate-limit design note file — per-identifier limits, the time window, the over-limit response, the abuse paths it guards, and where enforcement lives — kept with the API."),
  },
};

/** Class-4 BATCH A — the 7 formal-headline ops records (all sensitive). */
export const CLASS4_RECORDS_BATCH_A: readonly ContentTemplateRecord[] = [
  ABSENCE_OBSERVABILITY_RECORD,
  ABSENCE_ROLLBACK_PLANNING_RECORD,
  ABSENCE_DEPLOYMENT_PLANNING_RECORD,
  ABSENCE_DEPENDENCY_MGMT_RECORD,
  ABSENCE_ENV_AND_SECRETS_RECORD,
  ABSENCE_CI_PIPELINE_RECORD,
  ABSENCE_RATE_LIMITING_RECORD,
];

// ── BATCH B — the 1 casual-only signal ─────────────────────────────────────────

/** ABSENCE_DEPENDENCY_AUDIT_GAP — evaluate before adopting, keyword "dependenc". Sensitive (adoption → install). */
export const ABSENCE_DEPENDENCY_AUDIT_GAP_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DEPENDENCY_AUDIT_GAP', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: OPS_PARAM_AXES, l2SafeguardRequired: true,
  l2SafeguardLine: 'Ask me for go-ahead before installing this dependency.',
  levelForms: {
    1: form("Before adding the new dependency, check when it was last released and whether it is actively maintained.", "Just the maintenance signals for this new dependency — last release date and whether it's actively maintained — before adopting it."),
    2: form("Evaluate the new dependency before committing to it: maintenance status, licence compatibility, and whether a lighter alternative exists.", "Weigh this new dependency before committing — maintenance status, licence compatibility, and whether a simpler alternative fits."),
    3: form("NIST SSDF requires evaluating third-party components for maintenance status, license compatibility, and security properties before integration. For the dependency just added: Is it actively maintained (last release date, open issues trend)? Is the license compatible? Are there lighter-weight alternatives? A few minutes of evaluation now prevents being stuck with an abandoned or license-incompatible package later.", "Check maintenance (last release, open-issue trend), licence compatibility, and lighter-weight alternatives before integrating — a few minutes now avoids being stuck with an abandoned or licence-incompatible package."),
    4: form("Evaluate the dependency thoroughly before adopting: last-release recency, open-issue trend, licence compatibility, bundle-size impact, and the lighter-weight alternatives compared.", "Go thorough before adopting the dependency — last-release recency, open-issue trend, licence compatibility, bundle-size impact, and lighter-weight alternatives compared."),
    5: form("Write a dependency evaluation note file: the maintenance signals, the licence, the bundle-size impact, the alternatives considered, and the adopt-or-not decision — kept with the project.", "Capture a dependency evaluation note file — the maintenance signals, licence, bundle-size impact, alternatives considered, and the adopt-or-not decision — kept with the project."),
  },
};

/** Class-4 BATCH B — the 1 casual-only record. */
export const CLASS4_RECORDS_BATCH_B: readonly ContentTemplateRecord[] = [
  ABSENCE_DEPENDENCY_AUDIT_GAP_RECORD,
];

/** All class-4 records (batch A + batch B) = the 8 release/observability/infra signals. */
export const CLASS4_RECORDS: readonly ContentTemplateRecord[] = [
  ...CLASS4_RECORDS_BATCH_A,
  ...CLASS4_RECORDS_BATCH_B,
];
