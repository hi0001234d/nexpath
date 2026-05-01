import type { UserProfile, PromptRecord } from './types.js';
import { classifyUserProfileLLM } from './LLMProfileClassifier.js';

/** Recompute profile every N prompts — matches the LLM call frequency in auto.ts. */
export const NATURE_DEPTH_RECOMPUTE_INTERVAL = 3;

export function isProfileStale(
  profile: UserProfile | null,
  currentPromptCount: number,
): boolean {
  if (!profile) return true;
  return (currentPromptCount - profile.computedAt) >= NATURE_DEPTH_RECOMPUTE_INTERVAL;
}

/**
 * Classify the user profile from prompt history via the LLM.
 * Delegates entirely to classifyUserProfileLLM — see that module for gate logic,
 * fallback behaviour, and API parameters.
 */
export async function classifyUserProfile(
  history:         PromptRecord[],
  promptCount:     number,
  existing:        UserProfile | null = null,
): Promise<UserProfile> {
  return classifyUserProfileLLM(history, promptCount, existing);
}
