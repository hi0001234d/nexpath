import type { PromptRecord, UserProfile } from './types.js';
import { classifyNature } from './NatureClassifier.js';
import { classifyMood } from './MoodClassifier.js';
import { classifyDepth } from './DepthClassifier.js';

/**
 * Orchestrates nature, mood, and depth classifiers into a single UserProfile.
 *
 * Window sizes (per research):
 *   Nature: last 20 prompts (10–20 range; use 20 for fuller signal)
 *   Mood:   last 5 prompts
 *   Depth:  last 10 prompts
 *
 * All classifiers operate on raw prompt text — PromptRecord.text is extracted.
 * This function is pure (no side effects); call it whenever a profile is needed
 * before firing the decision session.
 *
 * Stickiness (re-evaluation cadence per research):
 *   Mood:  re-evaluate every 5 prompts
 *   Depth: re-evaluate every 10 prompts
 * Stickiness enforcement is the caller's responsibility (check computedAt).
 */

const NATURE_WINDOW = 20;
const MOOD_WINDOW   = 5;
const DEPTH_WINDOW  = 10;

export function classifyUserProfile(
  history: PromptRecord[],
  currentPromptCount: number,
): UserProfile {
  const texts = history.map((r) => r.text);

  // Slice windows from the tail of history (most recent first via slice(-N))
  const natureTexts = texts.slice(-NATURE_WINDOW);
  const moodTexts   = texts.slice(-MOOD_WINDOW);
  const depthTexts  = texts.slice(-DEPTH_WINDOW);

  const { nature, precisionScore, playfulnessScore } = classifyNature(natureTexts);
  const mood = classifyMood(moodTexts);
  const { depth, depthScore } = classifyDepth(depthTexts);

  return {
    nature,
    precisionScore,
    playfulnessScore,
    mood,
    depth,
    depthScore,
    computedAt: currentPromptCount,
  };
}

/**
 * Returns true if the cached profile should be recomputed.
 *
 * Rules:
 *   - Mood:  re-evaluate every 5 prompts
 *   - Depth: re-evaluate every 10 prompts
 *   - Nature: re-evaluate every 10 prompts (less volatile than mood)
 * => Recompute when any dimension is stale (every 5 prompts = mood cadence).
 */
export const PROFILE_RECOMPUTE_INTERVAL = 5;

export function isProfileStale(
  profile: UserProfile | null,
  currentPromptCount: number,
): boolean {
  if (!profile) return true;
  return (currentPromptCount - profile.computedAt) >= PROFILE_RECOMPUTE_INTERVAL;
}
