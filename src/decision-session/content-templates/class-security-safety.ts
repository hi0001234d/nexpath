/**
 * Security / safety content-template records.
 *
 * A new cluster of security/safety signals from the mistake-category registry (§3.F),
 * distinct from the CTA-C1 classes 1–9. Each is a NEW signal with no legacy shipped
 * headline, so ALL five maturity columns are authored fresh — there is no frozen col-3
 * anchor, and col-3 is subject to the same authoring gates as the other columns. Sensitive
 * records are marked `l2SafeguardRequired` and carry an action-specific `l2SafeguardLine`;
 * the engine appends it as the last line of whichever column is served.
 *
 * No record echoes a literal sensitive value — the content is static (never carries prompt
 * text), and the fire-time grounding runs the secret/PII sanitize gate.
 */

import type { ContentTemplateRecord, LevelForm, ParamAxisTag } from '../content-template-schema.js';
import {
  SECRET_IN_PROMPT_BEGINNER_OVERRIDE,
  NO_VERSION_CONTROL_BEGINNER_OVERRIDE,
  NO_BACKUP_SAFETY_BEGINNER_OVERRIDE,
  NO_SEPARATE_ENVS_BEGINNER_OVERRIDE,
  NO_AUTOMATED_SECURITY_SCANNING_BEGINNER_OVERRIDE,
} from './class-security-safety-beginner.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}

/** The param axes a security/safety why-desc grounds (the same generic sources as the other classes). */
export const SECURITY_SAFETY_PARAM_AXES: Readonly<Record<string, ParamAxisTag>> = {
  workflow_pattern: 'extensible',
  decision_making_rhythm: 'closed-ordinal',
  explanation_learning_depth: 'closed-ordinal',
  abstraction_level_orientation: 'closed-ordinal',
  project_framework: 'open',
};

/**
 * ABSENCE_SECRET_IN_PROMPT — a real secret/credential was pasted into a prompt (a LEAKAGE
 * EVENT), keyword "secret". Sensitive: the response rotates the exposed secret and scrubs it
 * from history → `l2SafeguardRequired` + a rotation/history-rewrite safeguard line. This is
 * the REACTIVE "treat the exposed secret as compromised" response — deliberately distinct
 * from ABSENCE_ENV_AND_SECRETS (proactive secrets-storage hygiene: don't hardcode, use env
 * vars, `.env.example`, rotation policy), which it never restates.
 */
export const ABSENCE_SECRET_IN_PROMPT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SECRET_IN_PROMPT', source: 'shipped', schemaVersion: 1, slots: [],
  question: 'A secret was just pasted into a prompt — treat it as leaked and rotate it?',
  pinchFallback: 'Secret exposed.',
  registerOverrides: { beginner: SECRET_IN_PROMPT_BEGINNER_OVERRIDE },
  paramAxes: SECURITY_SAFETY_PARAM_AXES, l2SafeguardRequired: true,
  l2SafeguardLine: 'Ask me for go-ahead before you rotate any keys or rewrite git history.',
  levelForms: {
    1: form("Rotate the secret that was just pasted into a prompt — treat it as compromised and replace it with a fresh one before continuing.", "Assume the pasted secret is already in someone else's hands — rotating it is urgent, not optional; a secret that touched a prompt can't be trusted again."),
    2: form("Rotate the exposed secret and clear it from the prompt and chat history — a pasted secret should be treated as leaked.", "Don't stop at rotating the secret — scrub it from the prompt and history too, so the old value isn't left sitting there to be reused."),
    3: form("Rotate the secret that was pasted, clear it from the prompt and history, and confirm it was not committed to source or written to a log — treat the exposure as a real leak.", "Check everywhere the secret could have landed — commits, logs, history — not just the prompt; a leaked secret is only handled once every copy is gone."),
    4: form("Rotate the exposed secret, scrub it from the prompt and history and anywhere else it may have landed (commits, logs), and move it into a proper store so it is never pasted again.", "After rotating and scrubbing, move the secret into a proper store — the point is that it can't be pasted into a prompt again, not just that this one is fixed."),
    5: form("Write a short incident note for the exposed secret: what it was for, that it was rotated, where it was scrubbed from, and the one change that prevents a secret being pasted again — kept out of source.", "Keep an incident note — what the secret was for, that it's rotated, where it was scrubbed, and the change that stops a repeat — so the fix sticks past this moment."),
  },
};

/**
 * ABSENCE_NO_VERSION_CONTROL — the project is not under version control, keyword "version".
 * MILD sensitivity: establishing version control (initialize, commit, ignore-list, remote,
 * workflow note) is non-destructive, so the record carries NO record-level safeguard — the
 * base advice never proposes a history-rewrite or force-push. Per the locked design, the L2
 * safeguard would attach ONLY to an option that touched history-rewrite/force-push; the ladder
 * here deliberately contains none, so no option is an L2 trigger and the record is unflagged
 * (verified by the A4 no-destructive-action test).
 */
export const ABSENCE_NO_VERSION_CONTROL_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_NO_VERSION_CONTROL', source: 'shipped', schemaVersion: 1, slots: [],
  question: "This project isn't under version control yet — set that up?",
  pinchFallback: 'No version control.',
  registerOverrides: { beginner: NO_VERSION_CONTROL_BEGINNER_OVERRIDE },
  paramAxes: SECURITY_SAFETY_PARAM_AXES,
  levelForms: {
    1: form("Set up version control for this project — initialize a git repository so the work is tracked from here on.", "Getting the project under version control now makes every later change recoverable — without it, a bad edit has nothing to fall back to."),
    2: form("Put the project under version control and make the first commit, so a known-good version is saved and the work can be brought back to it.", "Make that first commit a real known-good version to return to — an initialized repo with nothing committed still leaves the work unprotected."),
    3: form("Put the project under version control properly: initialize the repository, make a first commit, and add a .gitignore so generated files and local-only config stay out of the tracked version.", "Add the ignore list as part of setting up version control — generated files and local config in the tracked version make every diff noisy and can leak local paths."),
    4: form("Put the project under version control with a working rhythm: initialize the repo, commit in small logical steps, keep a .gitignore current, and connect a remote so every version lives off this machine too.", "Commit in small logical steps and push to a remote — version control only protects the work if a copy of every version lives off this machine too."),
    5: form("Write a short version-control note for the project: how to commit, the branch and commit-message convention, and what stays out of the tracked version — kept with the project so the rhythm is repeatable.", "Keep a short version-control note with the conventions — the commit style and what stays untracked — so the rhythm holds even as the project grows or hands change."),
  },
};

/**
 * ABSENCE_NO_BACKUP_SAFETY — the project has no backup / safety net, keyword "backup".
 * MILD data-sensitivity with a PER-OPTION safeguard. Standing up + scheduling a backup (cols
 * 1–2) is non-destructive → unguarded. Proving recovery means actually restoring, and a real
 * restore OVERWRITES the current data — the destructive-adjacent case the locked design says
 * MUST carry the L2 safeguard. So cols 3–5 propose the restore AND carry an action-named
 * confirm-seek; cols 1–2 (base "set up a backup" advice) do not.
 *
 * Placement note: the confirm-seek lives in BOTH channels of cols 3–5. The OPTION text is the
 * reliably-served copy — composeOption serves it verbatim, so the agent always sees it. The
 * why-desc carries it too, as the sensitive-action desc-base rule requires (the agent reads the
 * why-desc as the detailed explanation); that copy is best-effort served, since the LLM weave
 * can reword the why-desc — only a RECORD-level l2SafeguardLine survives the weave verbatim, and
 * a record-level line would wrongly guard the base cols 1–2 too, so it is not used here.
 */
export const ABSENCE_NO_BACKUP_SAFETY_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_NO_BACKUP_SAFETY', source: 'shipped', schemaVersion: 1, slots: [],
  question: "There's no backup or safety net for this project's data — add one?",
  pinchFallback: 'No safety net.',
  registerOverrides: { beginner: NO_BACKUP_SAFETY_BEGINNER_OVERRIDE },
  paramAxes: SECURITY_SAFETY_PARAM_AXES,
  levelForms: {
    1: form("Set up a backup for this project's important data, so a copy exists if the original is ever lost.", "Get one backup of the important data in place first — right now a single loss, a bad delete or a dead disk, takes everything with it."),
    2: form("Set up a backup and schedule it to run on its own regularly, so the saved copy stays current instead of going stale.", "Put the backup on a schedule so the copy stays current — a backup taken once and never refreshed is stale the moment the data moves on."),
    3: form("Set up a scheduled backup, then prove recovery by restoring from it — a real restore overwrites the current data with the backed-up copy, so ask me for go-ahead before you run one.", "A backup that's never been restored from isn't proven — recover from it once for real. Since a real restore overwrites the current data, ask me for go-ahead before you run one."),
    4: form("Set up an automated backup with sensible retention, and prove recovery on a schedule with a periodic restore drill — a restore overwrites what's there now, so ask me for go-ahead before running it against live data.", "Make restore-testing a routine, not a one-off — a backup only counts if recovery works on demand. A restore overwrites what's there now, so ask me for go-ahead before running it against live data."),
    5: form("Write a short backup-and-recovery runbook and rehearse a full restore from it: what is backed up, how often, and the recovery steps — and since a real recovery overwrites the current data, ask me for go-ahead before you run the restore.", "Keep a short backup-and-recovery runbook and rehearse the restore against it, so recovery is a known procedure, not a scramble. Since a real recovery overwrites the current data, ask me for go-ahead before you run the restore."),
  },
};

/**
 * ABSENCE_NO_SEPARATE_ENVS — the project has no dev/staging/production separation, keyword
 * "environment". HIGH-RISK: standing up separate environments touches production and moves
 * environment credentials → RECORD-LEVEL `l2SafeguardRequired` + an action-named safeguard line
 * (the engine appends it to every served column). Deliberately about environment SEPARATION only
 * (stand up distinct environments with a promotion path) — never restating ABSENCE_ENV_AND_SECRETS'
 * secrets-storage hygiene (don't hardcode, use env vars, `.env.example`, rotation). No literal
 * environment or credential value is echoed — the record is static and the grounding runs the
 * secret/PII sanitize gate at fire time.
 */
export const ABSENCE_NO_SEPARATE_ENVS_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_NO_SEPARATE_ENVS', source: 'shipped', schemaVersion: 1, slots: [],
  question: "Dev, staging, and production aren't separated — stand up separate environments?",
  pinchFallback: 'No separate envs.',
  registerOverrides: { beginner: NO_SEPARATE_ENVS_BEGINNER_OVERRIDE },
  paramAxes: SECURITY_SAFETY_PARAM_AXES, l2SafeguardRequired: true,
  l2SafeguardLine: 'Ask me for go-ahead before you touch production or move any environment credentials.',
  levelForms: {
    1: form("Set up a separate environment for this project so changes can be tried before they reach the live one — today there is a single environment and every change goes straight to where users are.", "Stand up one environment apart from the live one so changes get tried before users see them — today a single slip goes straight to production."),
    2: form("Stand up a staging environment separate from production, and run changes there first — so a broken change is caught in staging instead of hitting production.", "Route every change through the staging environment first — a broken change caught there is a non-event; the same change in production is an outage."),
    3: form("Separate this project into distinct development, staging, and production environments, each with its own configuration, so work in one never disturbs another.", "Give each environment its own configuration so work in one can't reach into another — shared config is how a dev change quietly breaks production."),
    4: form("Give the project a full environment separation with a promotion path — development to staging to production — where each environment is isolated and a change is promoted forward only after it holds up.", "Set up a promotion path so a change only moves toward production after it holds up in the environment before it — isolation without a path just blocks progress."),
    5: form("Write a short environments note for the project: what development, staging, and production are each for, how a change is promoted between them, and what keeps them isolated — kept with the project.", "Keep a short note on the environments — what each is for and how a change is promoted between them — so the separation is understood, not just set up once."),
  },
};

/**
 * ABSENCE_NO_AUTOMATED_SECURITY_SCANNING — the project has no automated security scanning,
 * keyword "scan". HIGH-RISK: acting on scan results means installing/upgrading dependencies and
 * changing the CI/deploy config → RECORD-LEVEL `l2SafeguardRequired` + an action-named safeguard
 * line (the engine appends it to every served column). Heavily de-jargoned: the plain action
 * leads ("scan the dependencies for known problems"), and SAST/CVE/CI appear ONLY as an optional
 * trailing parenthetical. No literal dependency/credential value is echoed — static record + the
 * fire-time secret/PII sanitize gate.
 */
export const ABSENCE_NO_AUTOMATED_SECURITY_SCANNING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_NO_AUTOMATED_SECURITY_SCANNING', source: 'shipped', schemaVersion: 1, slots: [],
  question: 'No automated security scanning is set up — add a dependency/code scan?',
  pinchFallback: 'No security scan.',
  registerOverrides: { beginner: NO_AUTOMATED_SECURITY_SCANNING_BEGINNER_OVERRIDE },
  paramAxes: SECURITY_SAFETY_PARAM_AXES, l2SafeguardRequired: true,
  l2SafeguardLine: 'Ask me for go-ahead before you install or upgrade dependencies or change the CI/deploy config.',
  levelForms: {
    1: form("Set up an automatic scan that flags known security problems in this project's dependencies, so a risky package is caught early.", "Get an automatic scan watching the dependencies so a known-bad package is flagged early — most dependency risk is public and already catalogued."),
    2: form("Add a security scan that runs on its own and reports known problems in the dependencies, and review what the scan finds before shipping.", "Have the scan run on its own and actually read what it reports before shipping — a scan whose findings nobody looks at is just noise."),
    3: form("Set up automatic security scanning for this project: a scan of the dependencies for known problems (a SAST or dependency-vulnerability scan), run on every change, with a plan to upgrade anything the scan flags.", "Run the scan on every change, not just once, and pair it with a plan to upgrade what it flags — a scan with no follow-through leaves the risk in place."),
    4: form("Wire security scanning into the project's automatic checks so a dependency scan and a code scan run on every change, and make a serious finding block the change until the finding is resolved.", "Let a serious finding from the scan actually block the change, wired into the automatic checks — a scan that only warns gets ignored under deadline."),
    5: form("Write a short security-scanning note for the project: what is scanned (dependencies and code), how often the scan runs, and how a serious finding is handled — kept with the project.", "Keep a short note on the scanning — what's scanned, how often, and how a serious finding is handled — so the practice survives past whoever set it up."),
  },
};

/** All security/safety records (A3, A4, A5, A6, A7 authored; A8 FRUSTRATION_SPIRAL → class-mood-meta.ts). */
export const CLASS_SECURITY_SAFETY_RECORDS: readonly ContentTemplateRecord[] = [
  ABSENCE_SECRET_IN_PROMPT_RECORD,
  ABSENCE_NO_VERSION_CONTROL_RECORD,
  ABSENCE_NO_BACKUP_SAFETY_RECORD,
  ABSENCE_NO_SEPARATE_ENVS_RECORD,
  ABSENCE_NO_AUTOMATED_SECURITY_SCANNING_RECORD,
];
