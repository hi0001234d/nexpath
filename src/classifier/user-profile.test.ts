import { describe, it, expect } from 'vitest';
import { isProfileStale, classifyUserProfile, NATURE_DEPTH_RECOMPUTE_INTERVAL } from './UserProfileClassifier.js';
import type { UserProfile, PromptRecord } from './types.js';

// ── UserProfileClassifier — isProfileStale ────────────────────────────────────

describe('UserProfileClassifier — isProfileStale', () => {
  function fakeProfile(computedAt: number): UserProfile {
    return {
      nature: 'beginner', precisionScore: 0, playfulnessScore: 0,
      precisionOrdinal: 'low', playfulnessOrdinal: 'low',
      mood: 'casual', depth: 'low', depthScore: 0, computedAt,
    };
  }

  it('returns true for null profile', () => {
    expect(isProfileStale(null, 10)).toBe(true);
  });

  it('returns false when within recompute interval', () => {
    const profile = fakeProfile(0);
    expect(isProfileStale(profile, NATURE_DEPTH_RECOMPUTE_INTERVAL - 1)).toBe(false);
  });

  it('returns true when at recompute interval boundary', () => {
    const profile = fakeProfile(0);
    expect(isProfileStale(profile, NATURE_DEPTH_RECOMPUTE_INTERVAL)).toBe(true);
  });

  it('returns true when well past recompute interval', () => {
    const profile = fakeProfile(0);
    expect(isProfileStale(profile, NATURE_DEPTH_RECOMPUTE_INTERVAL * 3)).toBe(true);
  });

  it('uses computedAt correctly when not starting at 0', () => {
    const profile = fakeProfile(10);
    expect(isProfileStale(profile, 12)).toBe(false); // 12-10=2 < 3
    expect(isProfileStale(profile, 13)).toBe(true);  // 13-10=3 >= 3
  });
});

// ── UserProfileClassifier — classifyUserProfile delegate ──────────────────────

describe('UserProfileClassifier — classifyUserProfile', () => {
  function makeHistory(n: number): PromptRecord[] {
    return Array.from({ length: n }, (_, i) => ({
      index: i, text: `prompt ${i}`, capturedAt: 0,
      classifiedStage: 'implementation' as const, confidence: 0.8,
    }));
  }

  it('returns safe defaults when history is below MIN_PROFILE_PROMPTS gate', async () => {
    const result = await classifyUserProfile(makeHistory(3), 3, null);
    expect(result.nature).toBe('beginner');
    expect(result.mood).toBe('casual');
    expect(result.depth).toBe('medium');
  });

  it('returns existing profile unchanged when below gate and existing is non-null', async () => {
    const existing: UserProfile = {
      nature: 'hardcore_pro', precisionScore: 9, playfulnessScore: 2,
      precisionOrdinal: 'very_high', playfulnessOrdinal: 'low',
      mood: 'focused', depth: 'high', depthScore: 3, computedAt: 1,
    };
    const result = await classifyUserProfile(makeHistory(2), 2, existing);
    expect(result.nature).toBe('hardcore_pro');
    expect(result.computedAt).toBe(1);
  });

  it('delegates through to LLM layer when history meets the gate — API failure falls back to defaults', async () => {
    // history=4 clears the MIN_PROFILE_PROMPTS gate; no real OpenAI key in test env →
    // classifyUserProfileLLM catches the API error and returns safe defaults.
    // A thrown exception here would mean the delegate did NOT call through correctly.
    const result = await classifyUserProfile(makeHistory(4), 4, null);
    expect(result).toMatchObject({
      nature:             expect.any(String),
      mood:               expect.any(String),
      depth:              expect.any(String),
      precisionOrdinal:   expect.any(String),
      playfulnessOrdinal: expect.any(String),
    });
    expect(result.computedAt).toBe(4);
  });
});
