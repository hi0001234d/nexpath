// Per-class decision-session content (class4_release_observability_infra). Relocated verbatim from
// options.ts / options-beginner.ts — one home per signal class.

import type { DecisionContent } from '../options.js';
import { WHY_HELP_BY_SIGNAL_TYPE } from '../why-help-by-signal-type.js';

export const ABSENCE_OBSERVABILITY: DecisionContent = {
  signalType:   "ABSENCE_OBSERVABILITY",
  question:      'Feature built — how will you know it\'s working?',
  pinchFallback: 'No observability.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_OBSERVABILITY'],
  L1: [
    {
      option: 'Review what was just built for observability gaps: identify what this feature does in production that is currently invisible — requests, failures, latency, state changes — and add structured logging for the events that would allow you to diagnose a production incident without SSH access.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: feature implementation. Observability hooks not added in the visible window."}
Observability for what was just built hasn't been set up — silent failures in production could go undetected.
Identify invisible production events; add structured logging for diagnosable signals.
Still, before you add structured logging across the codebase you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Audit what was just built for monitoring coverage: what SLI would you define for this feature, what metrics would you emit, and what alert condition would page someone if this feature degraded silently in production?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature implemented; SLI/metrics/alert design not done."}
Monitoring coverage hasn't been designed.
Define SLI + emit metrics + alert condition. Don't fix coverage gaps in this pass.
{R4_CLOSE}`,
    },
    {
      option: 'Check what was just built for error tracking integration: are failures captured in your error tracking system with enough context — request ID, user ID, stack trace — to diagnose the issue without reproducing it locally?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature implemented; error-tracker context coverage not verified."}
Error tracking integration hasn't been verified for diagnostic completeness.
Per failure path: request ID / user ID / stack trace present? Flag gaps.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What events in what was just built are currently invisible in production? Add structured logging for the ones that would be essential to diagnose a failure.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature implemented; invisible events not enumerated."}
Lighter: invisible events first. Log the diagnostic-essential ones.
{R4_CLOSE}`,
    },
    {
      option: 'If this feature broke silently in production tonight, what would you see in your logs and monitoring to detect it? If the answer is "nothing", what needs to be added?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature implemented; silent-break detection not verified."}
Narrower: silent-break detection — what's already visible, what's missing.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that could fail silently in production with no log entry or alert to detect it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature implemented."}
Minimum next step: one silent-fail path with no log/alert.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_ROLLBACK_PLANNING: DecisionContent = {
  signalType:   "ABSENCE_ROLLBACK_PLANNING",
  question:      'Release pending — rollback plan defined?',
  pinchFallback: 'No rollback plan.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ROLLBACK_PLANNING'],
  L1: [
    {
      option: 'Define the rollback procedure for this feature before shipping: identify the steps to revert if the deployment fails, confirm the rollback can be completed within your acceptable downtime window, and verify that database migrations or data changes are reversible.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Pre-ship stage; rollback procedure not authored."}
A rollback plan for what was just built hasn't been defined.
Document revert steps + downtime window + migration reversibility.
{R4_CLOSE}`,
    },
    {
      option: 'Audit the rollback readiness of this feature: what happens to data, sessions, and dependent services if this deploy is reverted? Document the rollback steps, assign ownership, and confirm the plan can be executed without live debugging during an incident.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Pre-ship; rollback impact on data/sessions/deps not audited."}
The rollback impact audit hasn't been done.
Document data/session/dep effects + ownership + executable-under-pressure steps.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm rollback viability for what was just built: if you rolled back this feature in production right now, what would break, what state would be left in an inconsistent state, and what would need to be cleaned up manually? Address any gaps before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Pre-ship; revert-viability not confirmed."}
Whether a clean rollback is possible right now hasn't been confirmed.
Identify what would break + inconsistent-state items + manual cleanup. Address gaps.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the rollback procedure if the deployment of this feature fails? Document it before shipping — it should be executable under pressure without needing to invent steps on the fly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Pre-ship; rollback steps not documented."}
Lighter: document executable-under-pressure rollback steps.
{R4_CLOSE}`,
    },
    {
      option: 'Are there any parts of this feature — database migrations, external API integrations, data format changes — that cannot be cleanly rolled back? Address those before shipping or accept them as known risks.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Pre-ship; unrollback-able pieces not flagged."}
Narrower: parts that can't roll back cleanly (migrations, integrations, data formats).
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there a documented rollback plan for this feature that could be executed in production under pressure, or would reverting require improvisation?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Pre-ship."}
Minimum next step: rollback plan documented + executable under pressure, or improvisational?
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_DEPLOYMENT_PLANNING: DecisionContent = {
  signalType:   "ABSENCE_DEPLOYMENT_PLANNING",
  question:      'Release pending — deployment plan confirmed?',
  pinchFallback: 'No deploy plan.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DEPLOYMENT_PLANNING'],
  L1: [
    {
      option: 'Define the deployment plan for this feature before shipping: confirm the target environment configuration, document any environment variables or secrets that need to be provisioned, and verify that the deployment process has been tested outside of production.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Pre-ship stage; deployment plan not authored."}
A deployment plan hasn't been authored.
Define target env config + secrets/vars to provision + deploy-tested-outside-prod confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Audit the deployment readiness of this feature: are there environment-specific configuration differences between staging and production that could cause a failure, any new environment variables required, or any infrastructure changes needed before this can deploy cleanly?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Pre-ship; staging-vs-prod diff and infra-change check not done."}
The deploy-readiness audit hasn't been done.
Identify staging-vs-prod config differences, new env vars, required infra changes.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm deployment readiness for this feature: what does the production environment need to have in place before this deploys successfully — configuration, secrets, database state, external service integrations — and is each of those confirmed and ready?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Pre-ship; production-prerequisite audit not done."}
Production prerequisites haven't been cross-confirmed.
Per prerequisite (config / secrets / DB state / external integrations): confirmed-ready or pending?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What environment configuration does this feature require in production that is not yet confirmed — secrets, environment variables, infrastructure dependencies? Resolve each before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Pre-ship; prod-config gap not resolved."}
Lighter: prod config required but not confirmed — secrets, env vars, infra deps. Resolve each.
{R4_CLOSE}`,
    },
    {
      option: 'Has this feature been deployed to a staging environment that mirrors production? If not, what deployment risks are you accepting by shipping without a staging verification?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Pre-ship; staging verification not done."}
Narrower: staging-mirror verification status + accepted-risk list if skipped.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there a confirmed deployment plan for this feature, or is the deployment process still undefined and untested outside of development?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Pre-ship."}
Minimum next step: deployment plan confirmed + tested-outside-dev, or undefined?
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_DEPENDENCY_MGMT: DecisionContent = {
  signalType:   "ABSENCE_DEPENDENCY_MGMT",
  question:      'Dependencies added — conflicts and risks reviewed?',
  pinchFallback: 'Dependency risk.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DEPENDENCY_MGMT'],
  L1: [
    {
      option: 'Review the new dependencies introduced in what was just built: check for version conflicts with existing packages, known security vulnerabilities in the chosen version, and whether a more stable or widely-adopted alternative exists for the same purpose.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: new dependencies added. Conflict/CVE/alternative audit not done."}
New dependencies haven't been audited for conflicts/CVEs/alternatives.
Per package: version-conflict / known CVE / better alternative available?
{R4_CLOSE}`,
    },
    {
      option: 'Audit the packages added in what was just built for dependency health: are the chosen versions the latest stable releases, do any have known CVEs in the installed version, and are the licences compatible with this project\'s licence requirements?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Dependencies added; health audit not done."}
Dependency health hasn't been audited.
Per package: latest-stable / CVE-clean / licence-compatible.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm the dependency decisions made in what was just built: for each new package, verify it is actively maintained, has adequate documentation, does not introduce transitive dependencies that conflict with the existing dependency tree, and is not a single-maintainer package with no succession plan.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Dependencies added; maintenance/transitive-deps/bus-factor not cross-confirmed."}
The dependency decision cross-confirmation hasn't been done.
Per package: maintenance status / docs / transitive conflicts / bus-factor risk.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Check the new packages added in what was just built for version conflicts and known vulnerabilities — run a dependency audit and confirm there are no high-severity issues before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Dependencies added; npm/pip/cargo audit not run."}
Lighter: run a dependency audit; confirm zero high-severity issues.
{R4_CLOSE}`,
    },
    {
      option: 'Is there any package added in what was just built that is unmaintained, has an incompatible licence, or pulls in a transitive dependency that conflicts with what is already installed?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Dependencies added; risk audit not done."}
Narrower: any package unmaintained / licence-incompatible / transitive-conflict.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Have the new packages added in what was just built been checked for version conflicts, known security vulnerabilities, and licence compatibility?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Dependencies added."}
Minimum next step: conflict / CVE / licence check on new packages.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_OBSERVABILITY_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_OBSERVABILITY",
  question:      'Feature built — will you know when it breaks?',
  pinchFallback: 'No observability.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_OBSERVABILITY'],
  L1: [
    {
      option: 'Look at what was just built — if it breaks in production tonight, what would you see in your logs? If the answer is "not much", add logging for the key events: requests coming in, failures happening, anything that changed state.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built something but I haven't added any logging or monitoring yet."}
Production visibility for what was just built hasn't been set up.
Identify key events (requests, failures, state changes); add structured logs.
Still, before you add structured logs across the codebase you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Check what was just built for blind spots in production — what does it do that you currently can\'t see? Add logging or metrics for the things you\'d want to know about when something goes wrong.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; blind-spot list not made."}
The production blind-spot audit hasn't been done.
Spot what's invisible; add logs/metrics for diagnosable signals.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the first thing you\'d check if what was just built stopped working in production? Is that thing actually observable right now, or would you be flying blind?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; first-check observability not verified."}
The "first thing I'd check" observability path hasn't been verified.
Identify what I'd check first; confirm it's actually observable.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What would you see in your logs if what was just built failed in production right now? If not much, add logging for the key failure points.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built; failure-log coverage unclear."}
Lighter: what would I see in logs on failure? Add logging where missing.
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in what was just built that could break silently in production without triggering an alert or showing up in logs?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built; silent-fail audit not done."}
Narrower: silent-break paths with no alert/log trace.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'If what was just built broke in production, would you be able to detect it from logs or monitoring? What\'s missing?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built."}
Minimum next step: detection coverage from logs/monitoring; what's missing.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_ROLLBACK_PLANNING_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_ROLLBACK_PLANNING",
  question:      'Shipping soon — what\'s the rollback plan?',
  pinchFallback: 'No rollback plan.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ROLLBACK_PLANNING'],
  L1: [
    {
      option: 'Before you ship this feature, work out what you\'d do if the deployment goes wrong — what\'s the rollback plan, how long would it take, and is there anything in this feature that can\'t be undone cleanly?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I'm about to ship but I haven't worked out what to do if the deploy goes wrong."}
A rollback plan hasn't been worked out.
Define steps + time-to-revert + anything that can't be cleanly undone.
{R4_CLOSE}`,
    },
    {
      option: 'Walk through what would happen if you had to roll back this feature in production tonight — what steps would you follow, what could go wrong during the rollback, and is there anything left in an inconsistent state if you do?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Pre-ship; haven't walked through what a rollback would actually do."}
The rollback walkthrough hasn't been done.
Walk through: steps / what could go wrong / inconsistent-state risks.
{R4_CLOSE}`,
    },
    {
      option: 'Check the rollback risk in this feature — any database migrations, external integrations, or data changes that would be a pain to undo? Flag those before shipping and decide if you\'re okay with them.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Pre-ship; hard-to-undo pieces not flagged."}
The hard-to-undo audit hasn't been done.
Flag migrations / integrations / data changes; decide acceptance per item.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the rollback plan for this feature if the deployment goes sideways? Write it down — it should be something you could follow in a panic without thinking.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship; rollback plan not written."}
Lighter: write down the executable-in-panic rollback plan.
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in this feature that can\'t be rolled back cleanly? Know that before you ship.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship; clean-rollback check not done."}
Narrower: anything that can't roll back cleanly.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Do you have a plan for rolling back this feature if the deployment fails, or would you be making it up as you go?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship."}
Minimum next step: rollback plan documented or improvisational?
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_DEPLOYMENT_PLANNING_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_DEPLOYMENT_PLANNING",
  question:      'Shipping soon — is the deployment actually planned?',
  pinchFallback: 'No deploy plan.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DEPLOYMENT_PLANNING'],
  L1: [
    {
      option: 'Before shipping this feature, check: do you actually have a deployment plan? What environment config does it need, what secrets need to be in place, and has anything been tested outside your local setup?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I'm about to ship but I haven't actually checked if there's a deployment plan."}
A deployment plan hasn't been confirmed.
Spot env config + secrets + outside-local testing status.
{R4_CLOSE}`,
    },
    {
      option: 'Walk through how this feature is actually going to get deployed — what\'s the process, what needs to be configured in the production environment, and is there anything that only exists in your local config that hasn\'t been provisioned yet?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Pre-ship; deploy-process walkthrough not done."}
The deployment process walkthrough hasn't been done.
Walk through process / prod env requirements / local-only-not-provisioned gaps.
{R4_CLOSE}`,
    },
    {
      option: 'Check the gap between where this feature runs now and what production actually needs — are there environment variables, secrets, or infrastructure pieces that aren\'t set up yet? Sort those out before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Pre-ship; local-to-prod gap not enumerated."}
The local-to-prod gap hasn't been enumerated.
Spot env vars / secrets / infra missing in prod; resolve each.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What does the production environment need to have in place before this feature can deploy cleanly? Confirm each of those is actually ready.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship; prod-readiness items not confirmed."}
Lighter: prod prerequisites — confirm each.
{R4_CLOSE}`,
    },
    {
      option: 'Has this feature been tested anywhere other than your local machine? If it goes straight to production, what are you not sure about?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship; only-local-tested risk unclear."}
Narrower: tested outside local? If straight-to-prod, accepted risks.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there a deployment plan for this feature, or are you planning to figure it out when you push?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship."}
Minimum next step: deploy plan exists, or figure-it-out-at-push?
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_DEPENDENCY_MGMT_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_DEPENDENCY_MGMT",
  question:      'Added packages — any issues checked?',
  pinchFallback: 'Dependency risk.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DEPENDENCY_MGMT'],
  L1: [
    {
      option: 'Check the packages added in what was just built — do they conflict with anything already installed, is there a security issue with the version you picked, and is there a better or more popular alternative you didn\'t consider?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I installed some packages but I haven't checked them for issues."}
New packages haven't been checked.
Conflicts / security issues / better alternatives.
{R4_CLOSE}`,
    },
    {
      option: 'Look at the new dependencies in what was just built: are they actively maintained, is the version you\'re using the latest stable one, and do they pull in anything that clashes with what\'s already in the project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Packages added; maintenance/version/clash check not done."}
The maintenance + version + transitive-clash check hasn't been done.
Spot unmaintained / outdated / clashing pulled-in deps.
{R4_CLOSE}`,
    },
    {
      option: 'Run a quick audit on the packages added in what was just built — any known CVEs in the version you\'re using, licence issues that could cause problems, or extra packages they pull in that don\'t play nice with what\'s already there?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Packages added; CVE/licence/transitive audit not done."}
The quick audit hasn't been run.
Run it; spot CVEs / licence issues / nasty transitive pulls.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Have the packages added in what was just built been checked for conflicts and vulnerabilities? Run a dependency audit and flag anything suspicious.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Packages added; audit not run."}
Lighter: run audit, flag suspicious results.
{R4_CLOSE}`,
    },
    {
      option: 'Is there any package added in what was just built that looks risky — old version, no maintenance, licence mismatch, or something that clashes with existing dependencies?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Packages added; risk spot-check not done."}
Narrower: any risky package — old / unmaintained / licence-mismatched / clashing.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Have the new packages added in what was just built been checked for conflicts, vulnerabilities, or licence issues?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Packages added."}
Minimum next step: conflicts / vulnerabilities / licence issues on new packages.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_ENV_AND_SECRETS: DecisionContent = {
  signalType:   "ABSENCE_ENV_AND_SECRETS",
  question:      'Credentials in use — secrets management reviewed?',
  pinchFallback: 'Secrets setup?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ENV_AND_SECRETS'],
  L1: [
    {
      option: 'Audit the secrets storage pattern for what was just built: identify every credential, API key, and environment-specific value used — confirm none are hardcoded in source, all are loaded from environment variables, and the variable names are documented in a `.env.example` file.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: feature with credential/API-key usage. Storage pattern not audited."}
The secrets storage pattern hasn't been audited.
Per credential: not-hardcoded / env-loaded / documented in \`.env.example\`.
{R4_CLOSE}`,
    },
    {
      option: 'Review the environment configuration for this feature: confirm a `.env.example` exists with all required keys (values redacted), that `.env` is in `.gitignore`, and that any secret loaded at runtime has a clear failure path if the variable is missing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature with env vars; .env.example / .gitignore / failure-path not verified."}
The env-config hygiene hasn't been verified.
Confirm: \`.env.example\` complete / \`.env\` git-ignored / missing-var failure path.
{R4_CLOSE}`,
    },
    {
      option: 'Define the secret rotation plan for this project: for each credential in use, identify who holds it, how it gets rotated if compromised, and whether the current implementation supports hot-swapping secrets without a redeploy.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Project uses secrets; rotation plan not authored."}
A secret rotation plan hasn't been authored.
Per credential: holder / rotation procedure / hot-swap-support.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Are there any hardcoded credentials, API keys, or secrets in what was just built — and if so, what is the remediation plan before this reaches production?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature with secrets; hardcoded check not done."}
Lighter: hardcoded credentials in source + remediation plan if so.
Still, before you remediate any hardcoded credential (move it to env, rotate, or delete) you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Is there a `.env.example` that documents every environment variable required by this feature, and is the actual `.env` file excluded from source control?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature with env vars; example file + git exclusion not verified."}
Narrower: \`.env.example\` documents all required vars + \`.env\` excluded from VCS.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is the most sensitive credential used by this feature — and where is it currently stored?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature with credentials."}
Minimum next step: most sensitive credential identified + storage location confirmed.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_CI_PIPELINE: DecisionContent = {
  signalType:   "ABSENCE_CI_PIPELINE",
  question:      'Moving toward release — CI pipeline configured?',
  pinchFallback: 'CI pipeline?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_CI_PIPELINE'],
  L1: [
    {
      option: 'Confirm automated test execution is configured for this project: check that a CI workflow (e.g. GitHub Actions) runs the full test suite on every pull request and push to main — verify the workflow file exists, the test command is correct, and test failures block merges.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Project moving toward release; automated test execution config not verified."}
Automated test execution on PR/main hasn't been confirmed.
Verify: workflow file present / test command correct / failures block merges.
{R4_CLOSE}`,
    },
    {
      option: 'Review the CI build verification for this feature: confirm that a failing build — compilation errors, type errors, or broken imports — is caught automatically before code reaches the main branch, and that the pipeline status is visible on every pull request.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "CI present; build-verification scope not confirmed."}
CI build-verification coverage hasn't been confirmed.
Confirm: compile / type errors / broken imports caught before main + PR-visible status.
{R4_CLOSE}`,
    },
    {
      option: 'Audit the CI pipeline coverage for what was just built: list every check currently configured (tests, linting, type-checking, security scans), confirm each is wired up correctly, and identify any verification that runs locally but is missing from the pipeline.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "CI present; full check inventory not audited."}
CI pipeline coverage hasn't been fully audited.
List configured checks; verify each wired correctly; spot local-only-not-in-CI gaps.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does this project have a CI pipeline that automatically runs its tests on every pull request — and does a test failure block a merge?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Project status; CI test-block check not done."}
Lighter: CI runs tests on PRs + failures block merge.
{R4_CLOSE}`,
    },
    {
      option: 'What does the CI pipeline for this feature actually verify — and is there anything checked locally during development that is not running automatically in CI?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "CI present; local-only-gap not enumerated."}
Narrower: CI verification scope + local-only-but-not-CI items.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is the most important automated check missing from the CI pipeline for this project right now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Project status."}
Minimum next step: most important missing automated CI check.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_RATE_LIMITING: DecisionContent = {
  signalType:   "ABSENCE_RATE_LIMITING",
  question:      'API endpoint built — rate limiting designed?',
  pinchFallback: 'Rate limiting?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_RATE_LIMITING'],
  L1: [
    {
      option: 'Define the rate limiting strategy for what was just built: specify the throttle limits per user, per API key, or per IP address — confirm which identifier is used for tracking, what the limit is (requests per second or per minute), and what happens when the limit is exceeded.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: API endpoint built. Rate limiting strategy not defined."}
A rate limiting strategy hasn't been defined.
Specify: identifier (user / key / IP) + limit (rps / rpm) + over-limit behaviour.
{R4_CLOSE}`,
    },
    {
      option: 'Design the throttle response for this feature: when a caller exceeds the rate limit, confirm the API returns a 429 status with a `Retry-After` header or equivalent signal — and document the expected backoff behaviour for clients.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "API present; throttle response design not done."}
The throttle response hasn't been designed.
Confirm: 429 + Retry-After + documented client backoff.
{R4_CLOSE}`,
    },
    {
      option: 'Establish the quota model for this project: decide whether rate limits are applied per second, per minute, or per hour, whether limits differ by user tier or API key, and whether the throttle resets on a rolling window or a fixed interval.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "API present; quota model not established."}
The quota model hasn't been established.
Decide: time window (s/m/h) / per-tier differentiation / rolling-vs-fixed reset.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the per-user or per-key request limit for what was just built — and is there any middleware or layer currently enforcing that limit?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "API present; per-id limit + enforcement unclear."}
Lighter: per-user/key limit + middleware enforcing it.
{R4_CLOSE}`,
    },
    {
      option: 'What response does this feature return when a caller is throttled — and does the response include enough information for the client to know when to retry?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "API present; throttle-response detail unclear."}
Narrower: throttle response + retry-information completeness.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is the most likely way this feature gets abused through excessive requests — and is there any throttle mechanism currently in place to prevent it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "API present."}
Minimum next step: most likely abuse path + current throttle mechanism status.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_ENV_AND_SECRETS_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_ENV_AND_SECRETS",
  question:      'Credentials in use — secrets management reviewed?',
  pinchFallback: 'Secrets setup?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ENV_AND_SECRETS'],
  L1: [
    {
      option: 'Take a look at what was just built and check whether any API keys, passwords, or credentials are written directly into the code — if so, move them out now and load them from a separate config file instead.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built something with credentials but I haven't checked if anything is hardcoded."}
The hardcoded-credentials check hasn't been done.
Find any inline API keys / passwords / credentials; load from config instead.
{R4_CLOSE}`,
    },
    {
      option: 'Go through the environment setup for this feature — is there a `.env.example` file that lists every variable the app needs to run? Does the real `.env` file stay out of the repo?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feature has env vars; setup hygiene not checked."}
The env-setup hygiene hasn't been verified.
Confirm: \`.env.example\` lists all vars + real \`.env\` out of repo.
{R4_CLOSE}`,
    },
    {
      option: 'Think about what happens if one of the secrets used by this project gets leaked or needs to be changed — how would you swap it out, and does the current setup make that easy or painful?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feature uses secrets; rotation hasn't been thought through."}
Secret-rotation feasibility hasn't been considered.
Walk through: how to swap a compromised secret + how painful the current setup makes it.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that has a real password, API key, or token written directly into the code rather than loaded from a config file?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature uses credentials; inline check not done."}
Lighter: any real credentials inline in source?
Still, before you move or rotate any credential you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'What happens in this feature if a required environment variable isn\'t set — does something break immediately with a clear message, or does it fail in a confusing way later?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature uses env vars; missing-var failure mode unclear."}
Narrower: missing-env-var failure path — clear immediate error or confusing later failure?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Where are the passwords and API keys for this feature sitting right now — are they safe, or is there something that needs to move?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature uses credentials."}
Minimum next step: where credentials sit + safe-vs-needs-moving verdict.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_CI_PIPELINE_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_CI_PIPELINE",
  question:      'Moving toward release — CI pipeline configured?',
  pinchFallback: 'CI pipeline?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_CI_PIPELINE'],
  L1: [
    {
      option: 'Take a look at whether this project has something set up to automatically run the tests whenever code is pushed — if not, setting up a simple GitHub Actions workflow now means you catch failures before they reach the main branch.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been pushing code but I'm not sure if there's a CI workflow running tests."}
Automated CI test execution hasn't been verified.
Check; if missing, set up a simple GH Actions workflow to catch failures pre-main.
{R4_CLOSE}`,
    },
    {
      option: 'Go through what a CI run actually does for this feature — when someone pushes code, does it automatically run the tests and stop a bad merge if something fails?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "CI exists; what-it-does walkthrough not done."}
The CI walkthrough hasn't been done.
Walk through: tests run on push + bad-merge block on failure?
{R4_CLOSE}`,
    },
    {
      option: 'Think about what was just built and whether the CI pipeline is actually checking everything it should — are the tests running, is the build being verified, and is anything important only being checked locally but not automatically?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "CI exists; coverage gaps not enumerated."}
CI coverage hasn't been checked against what's needed.
Tests / build / local-only-but-should-be-automated items.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does this project run its tests automatically whenever code is pushed — and does it stop a bad merge if the tests fail?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Project; auto-test-on-push unclear."}
Lighter: CI runs tests on push + blocks bad merge?
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything about this feature that gets checked by hand during development but isn\'t running automatically in CI — and should it be?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature; local-only-checks not promoted to CI."}
Narrower: hand-checked locally but not in CI; should it be?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s the most important thing the CI pipeline should be catching for this project that it isn\'t catching right now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Project."}
Minimum next step: most important uncaught-in-CI thing.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_RATE_LIMITING_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_RATE_LIMITING",
  question:      'API endpoint built — rate limiting designed?',
  pinchFallback: 'Rate limiting?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_RATE_LIMITING'],
  L1: [
    {
      option: 'Take a look at what was just built and think about what happens if someone calls this endpoint way too many times in a short period — is there anything stopping them from doing that, and if not, what would happen to the app?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built an API endpoint but I haven't added any rate limiting."}
Rate limiting hasn't been added.
Walk through abuse path; identify what'd happen to the app under hammer-traffic.
{R4_CLOSE}`,
    },
    {
      option: 'Think about how this feature handles someone who keeps hammering the API — what does it tell them when they\'ve made too many requests, and does it give them enough info to know when to try again?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "API present; over-limit response not designed."}
The over-limit response hasn't been designed.
Throttle response content + retry-info sufficiency.
{R4_CLOSE}`,
    },
    {
      option: 'Go through the rate limiting design for this project — how many requests does a user or API key get before they\'re throttled, does the limit reset every minute or every hour, and does it work the same way for everyone?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "API present; quota model not chosen."}
The quota model hasn't been chosen.
Limit per id / reset window / per-tier differentiation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that prevents a single user or caller from hitting the endpoint too many times — and if not, is that something that needs to be added?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "API present; per-user throttle status unclear."}
Lighter: any single-caller throttle present + needs-adding decision if not.
{R4_CLOSE}`,
    },
    {
      option: 'What does this feature say back to someone who\'s sent too many requests — do they get a useful response that tells them when they can try again?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "API present; over-limit response not verified."}
Narrower: throttle response + retry-when-info.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s the most realistic way this feature gets overwhelmed by too many requests — and is there anything in place right now to prevent that?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "API present."}
Minimum next step: most realistic overwhelm path + current prevention.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

// ── Phase 5 D8 — pro_geek_soul cluster 2 (CASUAL register) ───────────────────
export const ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_DEPENDENCY_AUDIT_GAP",
  question:      'New dependency added — evaluated it before adopting?',
  pinchFallback: 'Check the dependency before adding.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DEPENDENCY_AUDIT_GAP'],
  L1: [
    {
      option: 'NIST SSDF requires evaluating third-party components for maintenance status, license compatibility, and security properties before integration. For the dependency just added: Is it actively maintained (last release date, open issues trend)? Is the license compatible? Are there lighter-weight alternatives? A few minutes of evaluation now prevents being stuck with an abandoned or license-incompatible package later.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I just added a new dependency without evaluating it for maintenance status, license, or alternatives."}
The new dependency hasn't been evaluated against the third-party-component checks (maintenance, license, alternatives) before adoption.
Run the eval pass now: maintenance signals (last release, open issues), license compatibility, and lighter-weight alternative comparisons. Don't broaden into existing-deps audit in this pass.
{R4_CLOSE}`,
    },
    {
      option: 'Three things to check before committing to a new dependency: (1) maintenance status — last release date, whether the repo is active; (2) license compatibility — MIT/Apache are generally safe, GPL has restrictions; (3) bundle size impact — what does this add to the build? The smaller the scope of what\'s needed, the more alternatives to compare. Evaluate first, install after.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Added the dependency; didn't run the maintenance / license / bundle-size checks first."}
Pre-commit evaluation of this dependency (maintenance / license / bundle-size) hasn't been recorded.
Run the three checks: maintenance signals, license compatibility, bundle-size impact. Stop before broader project-deps audit.
{R4_CLOSE}`,
    },
    {
      option: 'Dependencies aren\'t free — they\'re ongoing maintenance commitments. Before adopting: check when it was last released, check whether there are lighter-weight alternatives that cover the needed scope, and confirm the license is compatible with the project. A package left unevaluated is a silent risk every time a security advisory hits.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Pulled in a new dependency without thinking about whether it's actively maintained or whether a lighter alternative exists."}
The maintenance-commitment evaluation for this dependency hasn't been done — last-release / alternatives / license remain unverified.
Confirm the dep is actively released, confirm no lighter-scope alternative exists, and confirm the license is compatible. Don't audit unrelated existing deps in this pass.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Before committing to this dependency: check maintenance status (last release date, open issues), license compatibility, and whether alternatives exist.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Added a new dep; didn't evaluate maintenance / license / alternatives."}
Pre-commit dependency evaluation hasn't been done.
Check maintenance status, license, and alternatives now before continuing.
{R4_CLOSE}`,
    },
    {
      option: 'Dependencies are ongoing maintenance commitments. Evaluate maintenance status, license, and alternatives before adopting.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Took on a new dependency without weighing the maintenance commitment."}
This dependency's ongoing-maintenance signals (status, license, alternatives) haven't been weighed.
Evaluate the three before continuing. Don't expand into a full project-wide deps sweep.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Check maintenance status, license compatibility, and alternatives before adding this dependency.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Added a dep; didn't audit it first."}
Pre-add dependency check (maintenance / license / alternatives) hasn't been done.
Run the minimum check on this single dependency now.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_OBSERVABILITY_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_OBSERVABILITY",
  question:      'Feature built — will you know when it breaks?',
  pinchFallback: 'No observability.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_OBSERVABILITY'],
  L1: [
    {
      option: '1. Think about what was just built running in the real world — if it stopped working, how would you find out?\n2. Share with me: is there anything that records what it\'s doing, or would it just fail without warning?\n3. Then tell me: what\'s the most important thing to log so you\'d know it\'s working?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built a feature but I haven't set up anything to tell me when it breaks."}
Production-failure detection hasn't been set up.
Walk me through it: how would I find out if it stops working, is there any logging, what's most important to log?
Still, before you add logging across the codebase you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what was just built and tell me — if something went wrong when real users were using it, would you get any warning, or would you find out when users complained? Share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; warning system not set up."}
Same moment, simpler: would I get a warning on user-facing failure, or find out via complaint?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that could stop working without you noticing? Share with me what would help you detect that.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built; silent-fail detection unclear."}
Lighter: silent-fail risk + what'd detect it.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that could fail silently in production without triggering a log entry or alert?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built."}
Minimum next step: silent-fail-without-trace risk.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_ROLLBACK_PLANNING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_ROLLBACK_PLANNING",
  question:      'Shipping soon — what\'s the rollback plan?',
  pinchFallback: 'No rollback plan.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ROLLBACK_PLANNING'],
  L1: [
    {
      option: '1. Think about what would happen if this feature caused a problem when it went live.\n2. Share with me: what would you do to undo the deployment if something went wrong?\n3. Then check: is there anything in this feature that would be hard to reverse once it\'s live?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I'm about to ship but I haven't thought about what to do if things go wrong."}
A rollback plan hasn't been thought through.
Walk me through it: live-failure scenario, undo procedure, hard-to-reverse pieces.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what you\'d do if this feature broke in production right after shipping — would you know how to roll it back, or would you need to figure it out under pressure? Share your plan with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Pre-ship; rollback procedure not known."}
Same moment, simpler: rollback procedure known or figure-out-under-pressure?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there a plan for what to do if this feature causes a problem after it\'s deployed? Share it with me before we ship.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship; post-deploy-problem plan unclear."}
Lighter: post-deploy-problem plan exists?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Do you know what you\'d do to roll back this feature if something went wrong after shipping?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship."}
Minimum next step: rollback procedure known.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_DEPLOYMENT_PLANNING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_DEPLOYMENT_PLANNING",
  question:      'Shipping soon — is the deployment actually planned?',
  pinchFallback: 'No deploy plan.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DEPLOYMENT_PLANNING'],
  L1: [
    {
      option: '1. Think about how this feature is going to get from your computer to where users will use it.\n2. Share with me: is there a plan for that, or is it still not figured out?\n3. Then check: is there anything the live environment needs that isn\'t set up yet — like settings or secret keys?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built something but I haven't figured out how it'll actually get to users."}
The deploy-to-users path hasn't been figured out.
Walk me through it: deploy plan, missing live-env pieces (settings, secrets).
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through how this feature would actually get deployed — what are the steps, and is there anything that needs to be set up in the live environment before it\'ll work? Share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Pre-ship; deploy steps unclear."}
Same moment, simpler: deploy steps + live-env prerequisites.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there a plan for how this feature gets deployed to where real users will use it? Share it with me so we can check if anything\'s missing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship; deploy plan unclear."}
Lighter: deploy plan exists?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Do you know how this feature is going to be deployed, or is the deployment still not planned out?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship."}
Minimum next step: deployment planned or undefined.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_DEPENDENCY_MGMT_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_DEPENDENCY_MGMT",
  question:      'Added packages — any issues checked?',
  pinchFallback: 'Dependency risk.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DEPENDENCY_MGMT'],
  L1: [
    {
      option: '1. Look at the new packages that were added while building this feature.\n2. Share with me: do any of them have known problems, or did you just install them because they looked like what you needed?\n3. Then check: do they work alongside everything else that\'s already installed, or could they cause a conflict?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I installed some packages while building this but I didn't check them for problems."}
The new-package check hasn't been done.
Walk me through it: known-problem audit + conflict-with-existing check.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through the packages added in what was just built — are they the right ones for the job, and have you checked if there are any known problems with the versions you installed? Share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Packages added; right-fit + known-problem check not done."}
Same moment, simpler: right-fit for job + known-problem check on installed versions.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything about the packages added in what was just built that could cause a problem — like a conflict with existing packages or a known security issue? Share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Packages added; problem-screen not done."}
Lighter: conflict or known-security-issue screen.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Have the new packages added in what was just built been checked to make sure they don\'t cause any conflicts or known issues?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Packages added."}
Minimum next step: conflicts or known-issues on new packages.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_ENV_AND_SECRETS_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_ENV_AND_SECRETS",
  question:      'Credentials in use — secrets management reviewed?',
  pinchFallback: 'Secrets setup?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ENV_AND_SECRETS'],
  L1: [
    {
      option: '1. Go through what was just built and check — are any passwords, API keys, or other secrets written directly in the code? 2. If they are, those need to be moved to a separate `.env` file. 3. Share what you find with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I used some passwords and API keys while building but I haven't checked if they're hardcoded."}
The hardcoded-secrets check hasn't been done.
Walk me through it: find inline secrets + move to \`.env\` + share what's found.
{R4_CLOSE}`,
    },
    {
      option: 'Check whether this feature has a `.env.example` file that lists every secret or config value it needs to run — without the real values. Share what you find with me before we move on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feature uses env vars; .env.example status unclear."}
Same moment, simpler: \`.env.example\` lists every required secret/config?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there a password, API key, or any other secret in what was just built that\'s written directly into the code? Tell me what it is and we\'ll figure out how to move it somewhere safe.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature uses credentials; inline-secret check not done."}
Lighter: any inline secret in source.
Still, before you move any inline secret out of source you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s one secret or password this feature uses — and where is it stored right now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature uses credentials."}
Minimum next step: one secret + its current storage location.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_CI_PIPELINE_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_CI_PIPELINE",
  question:      'Moving toward release — CI pipeline configured?',
  pinchFallback: 'CI pipeline?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_CI_PIPELINE'],
  L1: [
    {
      option: '1. Check whether this project has anything set up to run the tests automatically whenever code is pushed. 2. If not, this is a good time to set that up so mistakes get caught before they reach the final code. 3. Share what you find with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been pushing code but I haven't checked if tests run automatically."}
Auto-test-on-push hasn't been set up or verified.
Walk me through it: check current status + set up if missing.
{R4_CLOSE}`,
    },
    {
      option: 'Go through what happens when code gets pushed to this feature — do the tests run automatically, or does someone have to remember to run them by hand? Share what you find with me before we move on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Project; auto-vs-manual test trigger unclear."}
Same moment, simpler: tests run auto on push or manual?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does this project have something that automatically runs the tests whenever code is pushed — and does it stop bad code from getting merged if the tests fail?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Project; CI status unclear."}
Lighter: CI auto-tests + bad-merge block.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything that runs automatically when new code is added to this project — like the tests? Tell me what happens and we\'ll figure out if anything is missing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Project."}
Minimum next step: anything that runs auto on new code; any gaps.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_RATE_LIMITING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_RATE_LIMITING",
  question:      'API endpoint built — rate limiting designed?',
  pinchFallback: 'Rate limiting?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_RATE_LIMITING'],
  L1: [
    {
      option: '1. Think about what would happen if someone sent a huge number of requests to this feature very quickly. 2. Check whether the app has any limit on how many times it can be called in a short period. 3. Share what you find with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built an API endpoint but I haven't set any limit on how often it can be called."}
A request limit hasn't been set.
Walk me through it: hammer-traffic scenario + current limit status + add if missing.
{R4_CLOSE}`,
    },
    {
      option: 'Go through what was just built and check — if someone calls this API endpoint hundreds of times in a row, does the app handle that, or would it start having problems? Share what you find with me before we move on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "API present; hammer-test not done."}
Same moment, simpler: hundreds-of-requests handling + problem-points.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does this feature have any kind of limit on how many times someone can call it in a short period — and what happens if they go over that limit?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "API present; limit + over-limit behaviour unclear."}
Lighter: limit + over-limit behaviour status.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s one way someone could use this feature too much — and is there anything currently stopping that from happening?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "API present."}
Minimum next step: one overuse path + current prevention.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};
