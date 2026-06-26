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
    1: form("Add logging for the one failure in what was just built that would otherwise be silent in production.", "The lightest logging step: one silent failure made visible."),
    2: form("Add structured logging to what was just built for the main failure and latency paths, so a silent break is visible.", "A light logging pass: the main failure and latency paths made visible."),
    3: form("Review what was just built for observability gaps: identify what this feature does in production that is currently invisible — requests, failures, latency, state changes — and add structured logging for the events that would allow you to diagnose a production incident without SSH access.", "Observability for what was just built hasn't been set up — silent failures in production could go undetected."),
    4: form("Audit what was just built for monitoring coverage: structured logging on every failure path, metrics for latency and throughput, and an alert that fires on silent degradation.", "Beyond the main paths: full logging, metrics, and alerting coverage audited."),
    5: form("Write a monitoring note file plus the logging: the events logged, the metrics emitted, the alert conditions, and how to diagnose an incident from them — kept with the feature.", "A durable monitoring note of the logging, metrics, and alerts for the feature."),
  },
};

/** ABSENCE_ROLLBACK_PLANNING — ops, keyword "rollback". Sensitive. */
export const ABSENCE_ROLLBACK_PLANNING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_ROLLBACK_PLANNING', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: ROLLBACK_PLANNING_BEGINNER_OVERRIDE },
  paramAxes: OPS_PARAM_AXES, l2SafeguardRequired: true,
  l2SafeguardLine: 'Ask me for go-ahead before running or scripting the rollback.',
  levelForms: {
    1: form("Note the one rollback step needed if the release of what was just built fails.", "The lightest rollback step: one documented revert action."),
    2: form("Document the main rollback steps for this release before shipping: how to revert and how to confirm the revert worked.", "A light rollback plan: the main revert steps documented before shipping."),
    3: form("Define the rollback procedure for this feature before shipping: identify the steps to revert if the deployment fails, confirm the rollback can be completed within your acceptable downtime window, and verify that database migrations or data changes are reversible.", "A rollback plan for what was just built hasn't been defined."),
    4: form("Audit rollback readiness: the revert steps, the data and migration reversibility, the downtime window, and what would be left inconsistent — document each before shipping.", "Beyond the main steps: rollback reversibility, downtime, and inconsistent-state risks audited."),
    5: form("Write a rollback runbook file: the ordered revert steps, the reversibility of each migration, the downtime window, the owner, and the manual cleanup — executable under pressure without improvisation.", "A durable rollback runbook executable under incident pressure."),
  },
};

/** ABSENCE_DEPLOYMENT_PLANNING — ops, keyword "deploy". Sensitive. */
export const ABSENCE_DEPLOYMENT_PLANNING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DEPLOYMENT_PLANNING', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: DEPLOYMENT_PLANNING_BEGINNER_OVERRIDE },
  paramAxes: OPS_PARAM_AXES, l2SafeguardRequired: true,
  l2SafeguardLine: 'Ask me for go-ahead before deploying or changing infrastructure.',
  levelForms: {
    1: form("Note the one thing the production environment needs before what was just built can deploy.", "The lightest deploy check: one prerequisite named."),
    2: form("List the main deploy prerequisites for this feature — environment config, secrets, infrastructure — and confirm each before shipping.", "A light deploy-readiness pass: the main prerequisites confirmed."),
    3: form("Define the deployment plan for this feature before shipping: confirm the target environment configuration, document any environment variables or secrets that need to be provisioned, and verify that the deployment process has been tested outside of production.", "A deployment plan hasn't been authored."),
    4: form("Audit deploy readiness end-to-end: staging-vs-production config differences, new environment variables, required infrastructure changes, and external integrations — flag each gap.", "Beyond the main prerequisites: config drift, infra changes, and integrations audited for deploy."),
    5: form("Write a deployment runbook file: the target config, the secrets and variables to provision, the infrastructure changes, the staging verification, and the cutover steps — kept with the release.", "A durable deployment runbook of config, secrets, infra, and cutover steps."),
  },
};

/** ABSENCE_DEPENDENCY_MGMT — ops, keyword "dependenc". Sensitive. */
export const ABSENCE_DEPENDENCY_MGMT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DEPENDENCY_MGMT', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: DEPENDENCY_MGMT_BEGINNER_OVERRIDE },
  paramAxes: OPS_PARAM_AXES, l2SafeguardRequired: true,
  l2SafeguardLine: 'Ask me for go-ahead before installing, upgrading, or removing any dependency.',
  levelForms: {
    1: form("Check the one new dependency in what was just built most likely to have a conflict or a known vulnerability.", "The lightest dependency check: the riskiest new package."),
    2: form("Review the new dependencies in what was just built for version conflicts and known vulnerabilities before shipping.", "A light dependency pass: conflicts and known vulnerabilities flagged."),
    3: form("Review the new dependencies introduced in what was just built: check for version conflicts with existing packages, known security vulnerabilities in the chosen version, and whether a more stable or widely-adopted alternative exists for the same purpose.", "New dependencies haven't been audited for conflicts/CVEs/alternatives."),
    4: form("Audit the new dependencies by category: version conflicts, known vulnerabilities, licence compatibility, maintenance status, and transitive conflicts — flag each package's risks.", "Beyond the main risks: every new dependency audited for health and licence."),
    5: form("Write a dependency note file: per new package the version, the conflict and vulnerability findings, the licence, the maintenance status, and the keep-or-replace decision — kept with the project.", "A durable dependency note of per-package risk and the keep-or-replace calls."),
  },
};

/** ABSENCE_ENV_AND_SECRETS — ops, keyword "secret". Sensitive. */
export const ABSENCE_ENV_AND_SECRETS_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_ENV_AND_SECRETS', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: ENV_AND_SECRETS_BEGINNER_OVERRIDE },
  paramAxes: OPS_PARAM_AXES, l2SafeguardRequired: true,
  l2SafeguardLine: 'Ask me for go-ahead before moving, rotating, or deleting any credential.',
  levelForms: {
    1: form("Check what was just built for the one secret most likely hardcoded in source instead of an environment variable.", "The lightest secrets check: the one credential at risk in source."),
    2: form("Review the secrets handling for this feature: confirm no credential is hardcoded and each is loaded from an environment variable.", "A light secrets pass: hardcoded credentials and env-loading checked."),
    3: form("Audit the secrets storage pattern for what was just built: identify every credential, API key, and environment-specific value used — confirm none are hardcoded in source, all are loaded from environment variables, and the variable names are documented in a `.env.example` file.", "The secrets storage pattern hasn't been audited."),
    4: form("Audit the secrets posture end-to-end: nothing hardcoded, every value environment-loaded, a documented `.env.example`, the `.env` git-ignored, and a rotation path for each credential.", "Beyond the basics: storage, documentation, and rotation for every secret audited."),
    5: form("Write a secrets-handling note file: each credential, where it is stored, the `.env.example` coverage, and the rotation procedure if one is compromised — kept out of source control.", "A durable secrets-handling note of storage and rotation per secret."),
  },
};

/** ABSENCE_CI_PIPELINE — ops, keyword "test". Sensitive. */
export const ABSENCE_CI_PIPELINE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_CI_PIPELINE', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: CI_PIPELINE_BEGINNER_OVERRIDE },
  paramAxes: OPS_PARAM_AXES, l2SafeguardRequired: true,
  l2SafeguardLine: 'Ask me for go-ahead before changing the CI configuration or merge gates.',
  levelForms: {
    1: form("Confirm the CI workflow runs the test suite on every pull request to what was just built.", "The lightest CI check: tests run automatically on each PR."),
    2: form("Check the CI workflow for this project: the test suite runs on every pull request and a test failure blocks the merge.", "A light CI pass: tests run and failures block merges."),
    3: form("Confirm automated test execution is configured for this project: check that a CI workflow (e.g. GitHub Actions) runs the full test suite on every pull request and push to main — verify the workflow file exists, the test command is correct, and test failures block merges.", "Automated test execution on PR/main hasn't been confirmed."),
    4: form("Audit the CI coverage: the test suite, type-checking, linting, and security scans all run on every pull request, failures block merges, and nothing checked locally is missing from CI.", "Beyond tests: the full CI check set audited against what runs locally."),
    5: form("Write the CI configuration into a workflow file: the test suite, the type and lint checks, the security scans, and the rule that failures block merges — versioned with the project.", "A durable CI workflow file running the test and check suite as a merge gate."),
  },
};

/** ABSENCE_RATE_LIMITING — ops, keyword "limit". Sensitive. */
export const ABSENCE_RATE_LIMITING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_RATE_LIMITING', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: RATE_LIMITING_BEGINNER_OVERRIDE },
  paramAxes: OPS_PARAM_AXES, l2SafeguardRequired: true,
  l2SafeguardLine: 'Ask me for go-ahead before adding throttling to production request paths.',
  levelForms: {
    1: form("Note the per-user request limit for the endpoint in what was just built, and whether anything enforces it.", "The lightest rate-limit check: the intended limit and current enforcement."),
    2: form("Define the basic rate limit for this endpoint: the per-user or per-key limit and what happens when a caller exceeds it.", "A light rate-limit pass: the limit and the over-limit response defined."),
    3: form("Define the rate limiting strategy for what was just built: specify the throttle limits per user, per API key, or per IP address — confirm which identifier is used for tracking, what the limit is (requests per second or per minute), and what happens when the limit is exceeded.", "A rate limiting strategy hasn't been defined."),
    4: form("Design the rate-limit model end-to-end: the identifier (user, key, or IP), the limit per window, the 429 response with a retry signal, and whether the window is rolling or fixed.", "Beyond the basic limit: the full quota model and throttle response designed."),
    5: form("Write a rate-limit design note file: the per-identifier limits, the time window, the over-limit response, the abuse paths it guards, and where the throttle is enforced — kept with the API.", "A durable rate-limit design note of limits, windows, and enforcement."),
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
    1: form("Before adding the new dependency, check when it was last released and whether it is actively maintained.", "The lightest dependency check: maintenance signals before adopting."),
    2: form("Evaluate the new dependency before committing to it: maintenance status, licence compatibility, and whether a lighter alternative exists.", "A light dependency evaluation: maintenance, licence, and alternatives weighed."),
    3: form("NIST SSDF requires evaluating third-party components for maintenance status, license compatibility, and security properties before integration. For the dependency just added: Is it actively maintained (last release date, open issues trend)? Is the license compatible? Are there lighter-weight alternatives? A few minutes of evaluation now prevents being stuck with an abandoned or license-incompatible package later.", "The new dependency hasn't been evaluated against the third-party-component checks (maintenance, license, alternatives) before adoption."),
    4: form("Evaluate the dependency thoroughly before adopting: last-release recency, open-issue trend, licence compatibility, bundle-size impact, and the lighter-weight alternatives compared.", "Beyond the basics: maintenance, licence, size, and alternatives compared for the dependency."),
    5: form("Write a dependency evaluation note file: the maintenance signals, the licence, the bundle-size impact, the alternatives considered, and the adopt-or-not decision — kept with the project.", "A durable dependency evaluation note of the checks and the adopt-or-not decision."),
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
