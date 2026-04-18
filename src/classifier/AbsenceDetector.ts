import type { SessionState, AbsenceFlag } from './types.js';
import { SIGNAL_MAP } from './signals.js';
import { STAGE_CONFIRM_THRESHOLD } from './SessionStateManager.js';

/**
 * Minimum prompts in confirmed stage before checking for absences.
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
 *   1. stageConfidence ≥ 0.70        — stage must be confirmed
 *   2. promptsSinceConfirmed ≥ 5     — don't fire immediately on entry
 *   3. promptsSinceConfirmed ≥ signal.absenceThreshold — enough depth
 *   4. signal not present (lastSeenAt === null)
 *   5. signal expected in current stage
 *   6. not in cooldown (same flag raised/dismissed recently)
 *
 * Returns only NEW flags (not already active/in-cooldown).
 */
export function detectAbsenceFlags(state: SessionState): AbsenceFlag[] {
  const { currentStage, stageConfidence, stageConfirmedAt, promptCount } = state;

  // Gate 1 — stage must be confirmed
  if (stageConfidence < STAGE_CONFIRM_THRESHOLD) return [];

  // Gate 2 — must have been in this stage long enough
  if (stageConfirmedAt < 0) return [];
  const promptsSinceConfirmed = promptCount - stageConfirmedAt;
  if (promptsSinceConfirmed < 5) return [];

  const newFlags: AbsenceFlag[] = [];

  for (const sig of SIGNAL_MAP.values()) {
    // Gate — signal expected in this stage?
    if (!sig.expectedStages.includes(currentStage)) continue;

    // Gate — enough prompts in stage for this signal's threshold?
    if (promptsSinceConfirmed < sig.absenceThreshold) continue;

    // Gate — signal never detected?
    const counter = state.signalCounters[sig.key];
    if (!counter || counter.lastSeenAt !== null) continue;

    // Gate — cooldown: is there a recently active flag for this signal?
    const existingFlag = state.absenceFlags.find((f) => f.signalKey === sig.key);
    if (existingFlag) {
      const refIndex = existingFlag.dismissedAtIndex ?? existingFlag.raisedAtIndex;
      if (promptCount - refIndex < ABSENCE_COOLDOWN_PROMPTS) continue;
    }

    newFlags.push({
      signalKey:     sig.key,
      stage:         currentStage,
      raisedAtIndex: promptCount,
      cooldownUntil: promptCount + ABSENCE_COOLDOWN_PROMPTS,
    });
  }

  return newFlags;
}
