import type { SessionState, AbsenceFlag, UserProfile } from './types.js';
import { SIGNAL_MAP } from './signals.js';
import { STAGE_CONFIRM_THRESHOLD } from './SessionStateManager.js';

// ── Phase 7 F1 custom detection constants ─────────────────────────────────────

/** Average inter-prompt interval (ms) below which work_rhythm_check fires. */
const WORK_RHYTHM_VELOCITY_THRESHOLD_MS = 30_000;
/** Number of recent prompts to average for velocity check. */
const WORK_RHYTHM_WINDOW = 10;

/** Number of distinct active domains in last 20 prompts to trigger focus_drift_detection. */
const FOCUS_DRIFT_DOMAIN_THRESHOLD = 5;
/** Prompt window for domain-bucket scan. */
const FOCUS_DRIFT_WINDOW = 20;

const FOCUS_DOMAINS: Record<string, string[]> = {
  auth:         ['login', 'password', 'token', 'authentication', 'jwt', 'oauth', 'session', 'permission'],
  database:     ['database', 'query', 'migration', 'schema', 'table', 'sql', 'orm', 'mongodb', 'postgres'],
  ui:           ['component', 'frontend', 'css', 'style', 'button', 'modal', 'layout', 'render', 'react', 'vue'],
  api:          ['endpoint', 'route', 'request', 'response', 'rest', 'graphql', 'fetch', 'axios', 'webhook'],
  testing:      ['test', 'spec', 'assert', 'mock', 'fixture', 'coverage', 'jest', 'vitest', 'cypress'],
  deployment:   ['deploy', 'docker', 'ci', 'pipeline', 'build', 'release', 'kubernetes', 'staging'],
  performance:  ['cache', 'optimize', 'latency', 'memory', 'profiling', 'benchmark', 'slow'],
  architecture: ['refactor', 'design', 'pattern', 'architecture', 'module', 'abstraction', 'structure'],
};

const FOCUS_COMPLETION_KEYWORDS = ['done', 'finished', 'merged', 'shipped', 'closed'];

function detectWorkRhythmFlag(state: SessionState): boolean {
  const history = state.promptHistory;
  if (history.length < WORK_RHYTHM_WINDOW) return false;
  const recent = history.slice(-WORK_RHYTHM_WINDOW);
  let totalInterval = 0;
  for (let i = 1; i < recent.length; i++) {
    totalInterval += (recent[i]!.capturedAt - recent[i - 1]!.capturedAt);
  }
  const avgInterval = totalInterval / (recent.length - 1);
  return avgInterval < WORK_RHYTHM_VELOCITY_THRESHOLD_MS;
}

function detectFocusDriftFlag(state: SessionState): boolean {
  const history = state.promptHistory;
  const window = history.slice(-FOCUS_DRIFT_WINDOW);
  const windowText = window.map((r) => r.text.toLowerCase()).join(' ');
  const hasCompletion = FOCUS_COMPLETION_KEYWORDS.some((kw) => windowText.includes(kw));
  if (hasCompletion) return false;
  const activeDomains = Object.values(FOCUS_DOMAINS).filter(
    (keywords) => keywords.some((kw) => windowText.includes(kw)),
  );
  return activeDomains.length >= FOCUS_DRIFT_DOMAIN_THRESHOLD;
}

/**
 * Minimum prompts in current stage before checking for absences.
 * Research: 15-20 prompts. We use 15 (lower bound) as default.
 */
export const ABSENCE_MIN_PROMPTS = 15;

/** Cooldown: don't re-raise a flag dismissed within this many prompts. */
export const ABSENCE_COOLDOWN_PROMPTS = 30;

/**
 * Inspect the current session state and return any new absence flags
 * that should be raised.
 *
 * Stage-gating rules (from research):
 *   1. stageConfidence ≥ STAGE_CONFIRM_THRESHOLD  — stage must be confirmed
 *   2. promptsInCurrentStage ≥ 5                  — don't fire immediately on entry
 *   3. promptsInCurrentStage ≥ signal.absenceThreshold — enough depth in stage
 *   4. signal not present (lastSeenAt === null)
 *   5. signal expected in current stage
 *   6. not in cooldown (same flag raised/dismissed recently)
 *
 * Gate 2/3 uses state.promptsInCurrentStage — a rolling counter maintained by
 * SessionStateManager that resets to 0 on any genuine stage transition and
 * increments on every prompt where the stage stays the same (whether because
 * the classification agreed with the current stage, or because a cross-stage
 * classification was below the minimum confidence gate that would have flipped
 * the stage).
 *
 * Earlier iterations used (promptCount - stageConfirmedAt) for gates 2/3,
 * where stageConfirmedAt is the prompt index at which stage confidence first
 * crossed STAGE_CONFIRM_THRESHOLD.  That measure was coupled to the cross-stage
 * confidence gate (MIN_STAGE_CHANGE_CONFIDENCE): when that gate is set high to
 * prevent noise prompts from resetting accumulated stage state, early lower-
 * confidence prompts no longer trigger a stage flip, so stageConfirmedAt ends
 * up recorded later in the session — inadvertently delaying the absence window
 * even though the project has been in the new stage since the first prompt that
 * signalled it.  promptsInCurrentStage counts wall-prompts in the stage, not
 * confidence-epoch prompts, so it remains accurate regardless of how the cross-
 * stage gate is tuned.  stageConfirmedAt is kept on SessionState for the EMA /
 * confirmation-epoch logic in SessionStateManager; it is intentionally not used
 * here.
 *
 * Returns only NEW flags (not already active/in-cooldown).
 */
export function detectAbsenceFlags(
  state:               SessionState,
  profile?:            UserProfile | null,
  projectType?:        string,
  thresholdMultiplier = 1.0,
  absenceMinFloor     = 5,
): AbsenceFlag[] {
  const { currentStage, stageConfidence, promptsInCurrentStage, promptCount } = state;

  // Gate 1 — stage must be confirmed
  if (stageConfidence < STAGE_CONFIRM_THRESHOLD) return [];

  const isVibeProfile    = profile?.nature === 'beginner' || profile?.nature === 'cool_geek';
  const profileMultiplier = isVibeProfile ? 0.5 : 1.0;

  // Gate 2 — must have been in this stage long enough before checking
  if (promptsInCurrentStage < 5) return [];

  const newFlags: AbsenceFlag[] = [];

  for (const sig of SIGNAL_MAP.values()) {
    // Gate — signal expected in this stage?
    if (!sig.expectedStages.includes(currentStage)) continue;

    // Gate — project-type filter: null/undefined/'other' bypasses the filter entirely
    if (sig.relevantProjectTypes && projectType && projectType !== 'other'
        && !sig.relevantProjectTypes.includes(projectType)) continue;

    // Nature gate — Dim1 signals: fire only when profile.nature matches
    if (sig.nature && sig.nature !== profile?.nature) continue;

    // Role gate — Dim2 signals: fire only when profile.role matches
    if (sig.role && sig.role !== profile?.role) continue;

    // Gate 3 — per-signal threshold with profile multiplier and global frequency multiplier
    const effectiveThreshold = Math.max(absenceMinFloor, Math.ceil(sig.absenceThreshold * profileMultiplier * thresholdMultiplier));
    if (promptsInCurrentStage < effectiveThreshold) continue;

    // Custom detection for F1 signals (streak/velocity/domain-bucket based)
    if (sig.key === 'decision_fatigue_pattern') {
      const streak = state.consecutiveAcceptanceStreak ?? 0;
      if (streak < sig.absenceThreshold) continue;
    } else if (sig.key === 'work_rhythm_check') {
      if (!detectWorkRhythmFlag(state)) continue;
    } else if (sig.key === 'focus_drift_detection') {
      if (!detectFocusDriftFlag(state)) continue;
    } else {
      // Standard gate — signal never detected?
      const counter = state.signalCounters[sig.key];
      if (!counter || counter.lastSeenAt !== null) continue;
    }

    // Gate — cooldown: is there an active flag whose cooldown window hasn't expired?
    const existingFlag = state.absenceFlags.find((f) => f.signalKey === sig.key);
    if (existingFlag && promptCount < existingFlag.cooldownUntil) continue;

    newFlags.push({
      signalKey:     sig.key,
      stage:         currentStage,
      raisedAtIndex: promptCount,
      cooldownUntil: promptCount + ABSENCE_COOLDOWN_PROMPTS,
    });
  }

  return newFlags;
}
