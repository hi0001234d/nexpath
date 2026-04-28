import type { PromptRecord, UserProfile, UserMood } from './types.js';
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
 * This function is pure (no side effects); used for the nature/depth recompute cycle.
 *
 * Mood cadence: mood is re-evaluated every prompt via classifyMoodOnly() in
 * SessionStateManager.processPrompt() — NOT governed by NATURE_DEPTH_RECOMPUTE_INTERVAL.
 * Nature + depth: re-evaluated every NATURE_DEPTH_RECOMPUTE_INTERVAL prompts.
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

/** Recompute nature + depth every N prompts. Mood is handled separately (every prompt). */
export const NATURE_DEPTH_RECOMPUTE_INTERVAL = 3;

export function isProfileStale(
  profile: UserProfile | null,
  currentPromptCount: number,
): boolean {
  if (!profile) return true;
  return (currentPromptCount - profile.computedAt) >= NATURE_DEPTH_RECOMPUTE_INTERVAL;
}

/** Classify mood from the most recent MOOD_WINDOW prompt records. Called every prompt. */
export function classifyMoodOnly(history: PromptRecord[]): UserMood {
  const texts = history.slice(-MOOD_WINDOW).map((r) => r.text);
  return classifyMood(texts);
}
