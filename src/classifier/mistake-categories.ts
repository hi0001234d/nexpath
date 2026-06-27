/**
 * Declarative mistake-category registry.
 *
 * Each vibe-coding mistake category is ONE array-literal entry: a detector plus a
 * routing tag saying which engine (if any) owns the resulting fire. No interface
 * inheritance, DI, or plugin loader — adding a category is appending one entry.
 *
 * Routing tag → handling:
 *  - 'absence'    — surfaces as an `ABSENCE_*` advisory; `mapToAbsenceSignal` names
 *                   the signal it hooks on the existing absence-detection path, so
 *                   the corrective-polarity engine owns it.
 *  - 'governance' — a content-feature governance concern; owned by NEITHER engine.
 *  - 'meta'       — an internal meta concern (frequency / aggregation); NEITHER engine.
 * `mapToAbsenceSignal` is present ONLY for `routing: 'absence'`.
 *
 * Channel sequencing (`requiresChannel`): nexpath has detection channels (a) keyword,
 * (b) behavioral telemetry, and the AR-10 dev-environment probe (Channel Y, shipped).
 * Categories whose detection needs a channel-reader that is NOT shipped yet carry a
 * `requiresChannel` marker and a dark detector (returns 0) until that reader lands —
 * this SEQUENCES a category to its channel; it is not a permanent block. The unshipped
 * channels are: 'X' (agent-output / transcript diff reader — undesigned, expansion Task 7),
 * 'M' (coding-agent mode — ships with AR-10 B2 / Phase 3), and 'c' (LLM-presence semantic
 * extension of the Stream-B classifier). Categories on (a)/(b)/(Y) carry a real detector
 * and no `requiresChannel`. The full §4.E2 content for any genuinely-new `ABSENCE_*`
 * signal is authored separately; the registry ships dark.
 */

import type { PromptRecord } from './types.js';
import type { ParamPolarity } from '../decision-session/engine-registry.js';

/** Detector confidence a mistake pattern is present: 0 (absent) … 1 (certain). */
export type Confidence = number;

export type MistakeRouting = 'absence' | 'governance' | 'meta';

/** Right-time severity tier (closed-ordinal); the firing layer fires high immediately, accumulates low. */
export type MistakeSeverity = 'high' | 'medium' | 'low';

/** A detection channel whose reader is not yet shipped; the detector is dark until it lands. */
export type RequiresChannel = 'X' | 'M' | 'c';

/** Contextual inputs a detector may read beyond prompt history (populated as channels wire in live). */
export interface RuntimeContext {
  /** Current coding-agent mode, when known (Channel M). */
  currentAgentMode?: string;
  /** Consecutive accepted prompts without a correction (fatigue / over-trust streak detectors). */
  consecutiveAcceptanceStreak?: number;
  /** Consecutive recent prompts carrying a 'frustrated' mood (frustration-spiral detector). */
  consecutiveFrustratedPrompts?: number;
  /** AR-10 dev-env probe (Channel Y): is the project under version control? */
  hasVersionControl?: boolean;
  /** AR-10 dev-env probe (Channel Y): does a recovery/backup point exist? */
  hasBackups?: boolean;
  /** AR-10 dev-env probe (Channel Y): are prod/dev/test environments separated? */
  hasSeparateEnvs?: boolean;
  /** AR-10 dev-env probe (Channel Y): is an automated security scanner present? */
  hasSecurityScanner?: boolean;
}

export interface MistakeCategory {
  /** Stable category id (describes the runtime pattern). */
  name: string;
  /** Confidence the pattern is present given the prompt window + runtime context. */
  detect(promptHistory: readonly PromptRecord[], runtimeContext: RuntimeContext): Confidence;
  /** The `ABSENCE_*` signal this hooks — present ONLY when `routing === 'absence'`. */
  mapToAbsenceSignal?: string;
  routing: MistakeRouting;
  /** Right-time severity tier. */
  severity: MistakeSeverity;
  /** Set when the detector is dark pending an unshipped channel-reader; absent = detectable now. */
  requiresChannel?: RequiresChannel;
  metadata?: { description: string };
}

/** Map a category's routing tag to the engine polarity-class. */
export function routingToPolarity(routing: MistakeRouting): ParamPolarity {
  // 'absence' fires as a corrective advisory; 'governance'/'meta' pass through to neither engine.
  return routing === 'absence' ? 'corrective' : routing;
}

/**
 * Validate the routing invariant: `mapToAbsenceSignal` is present iff
 * `routing === 'absence'`. Returns the offending category names ([] = valid).
 */
export function findRoutingInvariantViolations(categories: readonly MistakeCategory[]): string[] {
  return categories
    .filter((c) => (c.routing === 'absence') !== (c.mapToAbsenceSignal !== undefined))
    .map((c) => c.name);
}

/** Categories that detect now (no unshipped-channel dependency). */
export function liveDetectors(categories: readonly MistakeCategory[]): readonly MistakeCategory[] {
  return categories.filter((c) => c.requiresChannel === undefined);
}

// ── Detection helpers (channel a/b — available now) ─────────────────────────────

/** Secret-shaped tokens a user might paste into a prompt (Channel a — over prompt text). */
const SECRET_IN_TEXT =
  /\b(sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{12,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,})\b|-----BEGIN [A-Z ]*PRIVATE KEY|\b(api[_-]?key|secret|password|passwd|token)\b\s*[:=]\s*\S{8,}/i;

/** Error / fix framing — used by the doom-loop velocity detector. */
const ERROR_FIX_TEXT =
  /\b(still (broken|failing|not working)|same error|again|didn'?t (work|fix)|now .* (broke|broken)|fix(ed)? (it|that|this).*(but|still)|error|broke|crash|undefined|exception)\b/i;

/** The most recent `n` prompts (newest last). */
function recent(promptHistory: readonly PromptRecord[], n: number): readonly PromptRecord[] {
  return n <= 0 ? [] : promptHistory.slice(-n);
}

/**
 * The registry. The 3 cross-cutting straddle seeds (one per routing tag) plus the
 * full WR-1/WR-1.1/WR-2 mistake-category population. Detectors on channels available
 * now (a keyword / b behavioral / Y AR-10 probe) are real; channel-X/M/c detectors are
 * dark with a `requiresChannel` marker until their reader ships.
 */
export const MISTAKE_CATEGORIES: readonly MistakeCategory[] = [
  // ── Family 1 — secrets / credential exposure ──────────────────────────────────
  {
    name: 'client_secret_exposure', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_CLIENT_SECRET_EXPOSURE',
    severity: 'high', requiresChannel: 'X', detect: () => 0,
    metadata: { description: 'secret/API key hardcoded in shipped client code' },
  },
  {
    name: 'secret_in_prompt', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_SECRET_IN_PROMPT',
    severity: 'high',
    detect: (history) => (recent(history, 6).some((p) => SECRET_IN_TEXT.test(p.text)) ? 1 : 0),
    metadata: { description: 'a real secret / credential pasted into a prompt' },
  },
  {
    name: 'public_storage_exposure', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_PUBLIC_STORAGE_EXPOSURE',
    severity: 'high', requiresChannel: 'X', detect: () => 0,
    metadata: { description: 'storage bucket / file store left publicly readable' },
  },
  // ── Family 2 — web security ──────────────────────────────────────────────────
  {
    name: 'broken_access_control_rls', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_BROKEN_ACCESS_CONTROL_RLS',
    severity: 'high', requiresChannel: 'X', detect: () => 0,
    metadata: { description: 'missing row-level / access control on data endpoints' },
  },
  {
    name: 'missing_web_security_headers', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_MISSING_WEB_SECURITY_HEADERS',
    severity: 'high', requiresChannel: 'X', detect: () => 0,
    metadata: { description: 'endpoints ship with no CSRF / security headers' },
  },
  {
    name: 'unverified_webhook', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_UNVERIFIED_WEBHOOK',
    severity: 'high', requiresChannel: 'X', detect: () => 0,
    metadata: { description: 'webhook handler skips signature verification' },
  },
  {
    name: 'weak_cryptography', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_WEAK_CRYPTOGRAPHY',
    severity: 'high', requiresChannel: 'X', detect: () => 0,
    metadata: { description: 'weak hashing / predictable RNG / wrong crypto mode' },
  },
  // ── Family 3 — trust & review ─────────────────────────────────────────────────
  {
    name: 'ai_overtrust_accept_without_read', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_OUTPUT_VERIFICATION',
    severity: 'high',
    detect: (_history, ctx) => ((ctx.consecutiveAcceptanceStreak ?? 0) >= 5 ? 1 : 0),
    metadata: { description: 'shipping AI output unread — long accept-without-review streak' },
  },
  {
    name: 'agent_blame_attribution_gap', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_AGENT_BLAME_ATTRIBUTION_GAP',
    severity: 'medium', requiresChannel: 'c', detect: () => 0,
    metadata: { description: 'post-incident reasoning stops at "the model hallucinated"' },
  },
  // ── Family 4 — testing & verification ─────────────────────────────────────────
  {
    name: 'eval_skip', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_TEST_CREATION',
    severity: 'medium', requiresChannel: 'c', detect: () => 0,
    metadata: { description: 'shipping a changed path with no test for it' },
  },
  {
    name: 'coverage_illusion', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_TEST_DEPTH_CHECK',
    severity: 'medium', requiresChannel: 'c', detect: () => 0,
    metadata: { description: 'high line coverage that pins implementation, not contracts' },
  },
  {
    name: 'live_data_testing', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_LIVE_DATA_TESTING',
    severity: 'high', requiresChannel: 'c', detect: () => 0,
    metadata: { description: 'testing against production data — risk of irreversible loss' },
  },
  {
    name: 'ai_fix_doom_loop', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_RESTART_IMPULSE_CHECK',
    severity: 'medium',
    detect: (history) => {
      const last = recent(history, 5);
      return last.length >= 4 && last.filter((p) => ERROR_FIX_TEXT.test(p.text)).length >= 4 ? 1 : 0;
    },
    metadata: { description: 'endless fix-A-breaks-B re-prompting with no convergence' },
  },
  {
    name: 'test_tampering_reward_hack', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_TEST_TAMPERING_REWARD_HACK',
    severity: 'high', requiresChannel: 'X', detect: () => 0,
    metadata: { description: 'tests deleted / weakened / patched to force a pass' },
  },
  {
    name: 'unverified_test_claim', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_UNVERIFIED_TEST_CLAIM',
    severity: 'medium', requiresChannel: 'c', detect: () => 0,
    metadata: { description: 'trusting an "all tests pass" claim with no real run' },
  },
  // ── Family 5 — architecture & tech-debt ───────────────────────────────────────
  {
    name: 'prompt_drift_inconsistency', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_ARCHITECTURE_CONFLICT',
    severity: 'medium', requiresChannel: 'c', detect: () => 0,
    metadata: { description: 'inconsistent styles / redundant logic across prompts' },
  },
  {
    name: 'copy_paste_sprawl', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_COPY_PASTE_SPRAWL',
    severity: 'medium', requiresChannel: 'X', detect: () => 0,
    metadata: { description: 'duplicate utilities the agent re-created with no memory of prior code' },
  },
  {
    name: 'agent_refactor_storm', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_AGENT_REFACTOR_STORM',
    severity: 'medium', requiresChannel: 'X', detect: () => 0,
    metadata: { description: 'agent over-scopes — many unrelated files changed for a small fix' },
  },
  {
    name: 'brownfield_vibe_mismatch', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_BROWNFIELD_VIBE_MISMATCH',
    severity: 'medium', requiresChannel: 'c', detect: () => 0,
    metadata: { description: 'vibe-coding a large existing codebase without enough context' },
  },
  {
    name: 'local_convention_violation', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_LOCAL_CONVENTION_VIOLATION',
    severity: 'medium', requiresChannel: 'X', detect: () => 0,
    metadata: { description: 'AI code violates the repo\'s local naming / structure conventions' },
  },
  // ── Family 6 — prompt & context management ────────────────────────────────────
  {
    name: 'mega_prompt_overload', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING',
    severity: 'medium',
    detect: (history) => (recent(history, 3).some((p) => p.text.length > 2000) ? 1 : 0),
    metadata: { description: 'one giant wishlist prompt → dropped / hallucinated features' },
  },
  {
    name: 'context_window_overflow', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_CONTEXT_LOSS',
    severity: 'medium',
    detect: (history) => (history.length >= 40 ? 1 : 0),
    metadata: { description: 'very long session → cascading, untraceable errors' },
  },
  {
    name: 'prompt_versioning_gap', routing: 'governance', severity: 'low', detect: () => 0,
    metadata: { description: 'no versioning discipline around prompt/content changes' },
  },
  {
    name: 'ai_attribution_gap', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_AI_ATTRIBUTION_GAP',
    severity: 'low', requiresChannel: 'X', detect: () => 0,
    metadata: { description: 'commit messages omit tool metadata → broken audit trail' },
  },
  {
    name: 'no_persistent_context_file', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_NO_PERSISTENT_CONTEXT_FILE',
    severity: 'medium', requiresChannel: 'c', detect: () => 0,
    metadata: { description: 'no CLAUDE.md / AGENTS.md → AI rebuilds wrong context each session' },
  },
  {
    name: 'stale_context_contamination', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_STALE_CONTEXT_CONTAMINATION',
    severity: 'medium', requiresChannel: 'c', detect: () => 0,
    metadata: { description: 'context not cleared between tasks; a wrong answer poisons history' },
  },
  {
    name: 'conflicting_instructions_drift', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_CONFLICTING_INSTRUCTIONS_DRIFT',
    severity: 'medium', requiresChannel: 'c', detect: () => 0,
    metadata: { description: 'contradictory instructions accumulate across prompts' },
  },
  // ── Family 7 — dev-environment & tooling hygiene (Channel Y — AR-10 probe) ─────
  {
    name: 'no_version_control', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_NO_VERSION_CONTROL',
    severity: 'high',
    detect: (_history, ctx) => (ctx.hasVersionControl === false ? 1 : 0),
    metadata: { description: 'working in a single fragile state with no version control' },
  },
  {
    name: 'no_backup_safety', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_NO_BACKUP_SAFETY',
    severity: 'high',
    detect: (_history, ctx) => (ctx.hasBackups === false ? 1 : 0),
    metadata: { description: 'sweeping AI changes with no recovery point' },
  },
  {
    name: 'no_separate_envs', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_NO_SEPARATE_ENVS',
    severity: 'medium',
    detect: (_history, ctx) => (ctx.hasSeparateEnvs === false ? 1 : 0),
    metadata: { description: 'one environment for prod/dev/test' },
  },
  {
    name: 'hallucinated_dependency_slopsquat', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_HALLUCINATED_DEPENDENCY_SLOPSQUAT',
    severity: 'high', requiresChannel: 'X', detect: () => 0,
    metadata: { description: 'installing an AI-suggested fabricated package name' },
  },
  {
    name: 'no_automated_security_scanning', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_NO_AUTOMATED_SECURITY_SCANNING',
    severity: 'high',
    detect: (_history, ctx) => (ctx.hasSecurityScanner === false ? 1 : 0),
    metadata: { description: 'no SAST / dependency / secret scanner in the workflow' },
  },
  {
    name: 'coding_agent_mode_mismatch', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_AGENT_MODE_MISMATCH',
    severity: 'high', requiresChannel: 'M', detect: () => 0,
    metadata: { description: 'wrong agent mode for the task (e.g. execute mode while still planning)' },
  },
  // ── Family 8 — workflow & process discipline ──────────────────────────────────
  {
    name: 'skip_planning_no_plan_mode', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_FEATURE_SCOPE_BEFORE_BUILD',
    severity: 'medium', requiresChannel: 'c', detect: () => 0,
    metadata: { description: 'jumping to code with no planning / plan-mode step' },
  },
  {
    name: 'agent_cost_runaway', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_AGENT_COST_RUNAWAY',
    severity: 'medium', requiresChannel: 'X', detect: () => 0,
    metadata: { description: 'agent token/cost runaway with no budget check' },
  },
  {
    name: 'ai_incident_no_postmortem', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_AI_INCIDENT_NO_POSTMORTEM',
    severity: 'medium', requiresChannel: 'c', detect: () => 0,
    metadata: { description: 'AI-caused breakage gets no root-cause / retrospective' },
  },
  {
    name: 'frustration_spiral', routing: 'absence', mapToAbsenceSignal: 'ABSENCE_FRUSTRATION_SPIRAL',
    severity: 'high',
    detect: (_history, ctx) => ((ctx.consecutiveFrustratedPrompts ?? 0) >= 3 ? 1 : 0),
    metadata: { description: 'persisting frustration across prompts with no step-back / recap' },
  },
  // ── Separate internal meta-signal (NOT one of the 37 params) ───────────────────
  {
    name: 'advisory_fatigue_dismissal_streak', routing: 'meta', severity: 'low',
    detect: (_history, ctx) => ((ctx.consecutiveAcceptanceStreak ?? 0) >= 8 ? 1 : 0),
    metadata: { description: 'long run of un-reviewed acceptances (advisory fatigue)' },
  },
];
