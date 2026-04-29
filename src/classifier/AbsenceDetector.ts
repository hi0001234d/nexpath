import type { SessionState, AbsenceFlag, UserProfile } from './types.js';
import { SIGNAL_MAP } from './signals.js';
import { STAGE_CONFIRM_THRESHOLD } from './SessionStateManager.js';

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
  state:   SessionState,
  profile?: UserProfile | null,
): AbsenceFlag[] {
  const { currentStage, stageConfidence, promptsInCurrentStage, promptCount } = state;

  // Gate 1 — stage must be confirmed
  if (stageConfidence < STAGE_CONFIRM_THRESHOLD) return [];

  // Profile-aware threshold for Gate 3
  const isVibeProfile = profile?.nature === 'beginner' || profile?.nature === 'cool_geek';
  const effectiveMinPrompts = isVibeProfile ? 5 : 10;

  // Gate 2 — must have been in this stage long enough before checking
  if (promptsInCurrentStage < 5) return [];

  const newFlags: AbsenceFlag[] = [];

  for (const sig of SIGNAL_MAP.values()) {
    // Gate — signal expected in this stage?
    if (!sig.expectedStages.includes(currentStage)) continue;

    // Gate 3 — profile-aware: enough prompts in stage for this signal?
    if (promptsInCurrentStage < effectiveMinPrompts) continue;

    // Gate — signal never detected?
    const counter = state.signalCounters[sig.key];
    if (!counter || counter.lastSeenAt !== null) continue;

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
