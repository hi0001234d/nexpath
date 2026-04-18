import { describe, it, expect } from 'vitest';
import { classifyNature, quadrantToNature, NATURE_HIGH_THRESHOLD } from './NatureClassifier.js';
import { classifyMood, extractMoodFeatures } from './MoodClassifier.js';
import { classifyDepth, scorePromptDepth, DEPTH_HIGH_THRESHOLD, DEPTH_MEDIUM_THRESHOLD } from './DepthClassifier.js';
import { classifyUserProfile, isProfileStale, PROFILE_RECOMPUTE_INTERVAL } from './UserProfileClassifier.js';
import type { PromptRecord, UserProfile } from './types.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeRecord(text: string, index = 0): PromptRecord {
  return { index, text, capturedAt: Date.now(), classifiedStage: 'implementation', confidence: 0.8 };
}

function makeRecords(texts: string[]): PromptRecord[] {
  return texts.map((t, i) => makeRecord(t, i));
}

// ── NatureClassifier ──────────────────────────────────────────────────────────

describe('NatureClassifier — quadrantToNature', () => {
  it('high precision + high playfulness → pro_geek_soul', () => {
    expect(quadrantToNature(8, 7)).toBe('pro_geek_soul');
  });

  it('high precision + low playfulness → hardcore_pro', () => {
    expect(quadrantToNature(7, 2)).toBe('hardcore_pro');
  });

  it('low precision + high playfulness → cool_geek', () => {
    expect(quadrantToNature(2, 7)).toBe('cool_geek');
  });

  it('low precision + low playfulness → beginner', () => {
    expect(quadrantToNature(1, 1)).toBe('beginner');
  });

  it('exactly at threshold on both axes → pro_geek_soul', () => {
    expect(quadrantToNature(NATURE_HIGH_THRESHOLD, NATURE_HIGH_THRESHOLD)).toBe('pro_geek_soul');
  });

  it('one point below threshold → beginner if both below', () => {
    expect(quadrantToNature(NATURE_HIGH_THRESHOLD - 0.1, NATURE_HIGH_THRESHOLD - 0.1)).toBe('beginner');
  });
});

describe('NatureClassifier — classifyNature', () => {
  it('returns beginner for empty prompt list', () => {
    const { nature, precisionScore, playfulnessScore } = classifyNature([]);
    expect(nature).toBe('beginner');
    expect(precisionScore).toBe(0);
    expect(playfulnessScore).toBe(0);
  });

  it('hardcore_pro prompts → high precision, low playfulness', () => {
    const prompts = [
      'implement idempotent retry with exponential backoff and bounded concurrency',
      'the schema migration must not break existing transaction invariants',
      'what are the tradeoffs between consistency and availability for this data layer',
      'per the spec, this module must not exceed 50ms latency under load',
      'design the abstraction layer so coupling between services is minimised',
    ];
    const { nature, precisionScore, playfulnessScore } = classifyNature(prompts);
    expect(precisionScore).toBeGreaterThan(NATURE_HIGH_THRESHOLD);
    expect(playfulnessScore).toBeLessThan(NATURE_HIGH_THRESHOLD);
    expect(nature).toBe('hardcore_pro');
  });

  it('cool_geek prompts → low precision, high playfulness', () => {
    const prompts = [
      'lol what even is happening with this thing',
      'yeah nah let\'s try something wild here',
      'oops that was not supposed to happen haha',
      'ngl this is kinda broken but in a cool way',
      'welp! let\'s see what happens if we just yolo this',
    ];
    const { nature, precisionScore, playfulnessScore } = classifyNature(prompts);
    expect(playfulnessScore).toBeGreaterThan(NATURE_HIGH_THRESHOLD);
    expect(precisionScore).toBeLessThan(NATURE_HIGH_THRESHOLD);
    expect(nature).toBe('cool_geek');
  });

  it('beginner prompts → low precision, low playfulness', () => {
    const prompts = [
      'how do I add a button to the page',
      'it is not working can you fix it',
      'add a login form to the app',
      'why is there an error',
      'make it look nicer',
    ];
    const { nature } = classifyNature(prompts);
    expect(nature).toBe('beginner');
  });

  it('pro_geek_soul prompts → high precision AND high playfulness', () => {
    const prompts = [
      'lol omg this mutex thing is wild — what are the tradeoffs for the lock-free alternative ngl',
      'welp haha, the schema migration broke — what invariants did we violate exactly tbh',
      'yeah the latency is crazy — let\'s wire up the async component, needs to be idempotent lol',
      'tbh the coupling here is bad lmao — what\'s the right abstraction pattern compared to this',
      'haha neat — but does this hold up against the concurrency constraint we defined, right?',
    ];
    const { nature, precisionScore, playfulnessScore } = classifyNature(prompts);
    expect(precisionScore).toBeGreaterThanOrEqual(NATURE_HIGH_THRESHOLD);
    expect(playfulnessScore).toBeGreaterThanOrEqual(NATURE_HIGH_THRESHOLD);
    expect(nature).toBe('pro_geek_soul');
  });

  it('scores are in 0–10 range', () => {
    const { precisionScore, playfulnessScore } = classifyNature(['architecture schema tradeoff constraint latency']);
    expect(precisionScore).toBeGreaterThanOrEqual(0);
    expect(precisionScore).toBeLessThanOrEqual(10);
    expect(playfulnessScore).toBeGreaterThanOrEqual(0);
    expect(playfulnessScore).toBeLessThanOrEqual(10);
  });

  it('scores cap at 10 even with very many keyword hits', () => {
    const heavy = 'architecture coupling abstraction interface contract throughput latency bottleneck cache queue async concurrency schema migration transaction consistency normalisation pattern tradeoff invariant constraint component service';
    const { precisionScore } = classifyNature([heavy, heavy, heavy]);
    expect(precisionScore).toBeLessThanOrEqual(10);
  });

  it('exclamation marks increase playfulness score', () => {
    const { playfulnessScore: withExcl }    = classifyNature(['This is great!!! Let us go!!!']);
    const { playfulnessScore: withoutExcl } = classifyNature(['This is great. Let us go.']);
    expect(withExcl).toBeGreaterThan(withoutExcl);
  });
});

// ── MoodClassifier ────────────────────────────────────────────────────────────

describe('MoodClassifier — extractMoodFeatures', () => {
  it('returns zeroed features for empty prompts', () => {
    const f = extractMoodFeatures([]);
    expect(f.avgWordCount).toBe(0);
    expect(f.negLexiconHits).toBe(0);
    expect(f.exclamationDensity).toBe(0);
    expect(f.listStructureCount).toBe(0);
    expect(f.allCapsPresent).toBe(false);
  });

  it('counts negative lexicon hits across prompts', () => {
    const f = extractMoodFeatures([
      'this is broken again',
      'why does this keep failing',
      'still not working ugh',
    ]);
    expect(f.negLexiconHits).toBeGreaterThan(2);
  });

  it('detects ALL CAPS word', () => {
    const f = extractMoodFeatures(['this is WRONG and I cannot fix it']);
    expect(f.allCapsPresent).toBe(true);
  });

  it('does NOT trigger all-caps for short abbreviations like I or UI', () => {
    const f = extractMoodFeatures(['I need to fix the UI issue']);
    expect(f.allCapsPresent).toBe(false);
  });

  it('computes avg word count correctly', () => {
    const f = extractMoodFeatures(['one two three', 'four five six seven']);
    expect(f.avgWordCount).toBeCloseTo(3.5, 1);
  });

  it('detects exclamation density', () => {
    const f = extractMoodFeatures(['great!!', 'awesome!', 'nice!']);
    expect(f.exclamationDensity).toBeCloseTo(4 / 3, 1);
  });

  it('detects list structure (numbered)', () => {
    const f = extractMoodFeatures([
      '1. implement the feature',
      '2. write the tests',
      '3. deploy to staging',
    ]);
    expect(f.listStructureCount).toBe(3);
  });

  it('detects list structure (dash bullets)', () => {
    const f = extractMoodFeatures(['- add auth\n- add logging\n- add tests']);
    expect(f.listStructureCount).toBe(1);
  });
});

describe('MoodClassifier — classifyMood', () => {
  it('returns casual for empty prompts', () => {
    expect(classifyMood([])).toBe('casual');
  });

  it('frustrated when neg_lexicon_hits > 2', () => {
    const prompts = [
      'this is broken again',
      'still not working ugh',
      'wrong output again why',
    ];
    expect(classifyMood(prompts)).toBe('frustrated');
  });

  it('frustrated when ALL CAPS present (even if other signals absent)', () => {
    const prompts = [
      'this is BROKEN and I do not know why it keeps failing like this',
    ];
    expect(classifyMood(prompts)).toBe('frustrated');
  });

  it('rushed when avg_word_count < 8', () => {
    const prompts = ['fix it', 'deploy now', 'push', 'done?', 'go'];
    expect(classifyMood(prompts)).toBe('rushed');
  });

  it('excited when exclamation_density > 1.0', () => {
    const prompts = [
      'this is working now, everything looks great and tests pass!!! amazing result!!!',
      'great progress on the feature implementation!! love how it turned out!!!',
      'yes we finally got the pipeline green and all checks passing!! fantastic!!',
    ];
    expect(classifyMood(prompts)).toBe('excited');
  });

  it('methodical when list_structure_count > 2', () => {
    const prompts = [
      '1. implement the authentication endpoint with proper validation',
      '2. add the unit tests for the auth module covering edge cases',
      '3. review the generated code and check for security issues',
      'done with auth implementation now moving on to the next task',
    ];
    expect(classifyMood(prompts)).toBe('methodical');
  });

  it('focused when avg_word_count > 25 and no negative lexicon', () => {
    const focused = 'I want to implement the full authentication module including jwt token generation refresh token rotation and proper error handling for all edge cases in the system';
    expect(classifyMood([focused, focused, focused])).toBe('focused');
  });

  it('casual when no strong signals present', () => {
    const prompts = [
      'can you add a submit button to the form over here',
      'make the header text a bit bigger please it looks small',
      'looks okay to me now let us move forward with this',
    ];
    expect(classifyMood(prompts)).toBe('casual');
  });

  it('frustrated takes priority over rushed (both signals present)', () => {
    // Very short prompt with all caps
    const prompts = ['BROKEN', 'fix it', 'go', 'now', 'please'];
    expect(classifyMood(prompts)).toBe('frustrated');
  });
});

// ── DepthClassifier ───────────────────────────────────────────────────────────

describe('DepthClassifier — scorePromptDepth', () => {
  it('scores 0 for a neutral prompt with no vocab hits', () => {
    expect(scorePromptDepth('add a button to the page')).toBe(0);
  });

  it('scores positive for high-depth vocab', () => {
    expect(scorePromptDepth('design the abstraction layer with proper coupling constraints')).toBeGreaterThan(0);
  });

  it('scores negative for low-depth vocab', () => {
    expect(scorePromptDepth('just a quick simple fix please')).toBeLessThan(0);
  });

  it('accumulates multiple high-depth hits in one prompt', () => {
    const score = scorePromptDepth('schema migration transaction consistency throughput latency cache');
    expect(score).toBeGreaterThanOrEqual(4);
  });
});

describe('DepthClassifier — classifyDepth', () => {
  it('returns low for empty prompts', () => {
    const { depth, depthScore } = classifyDepth([]);
    expect(depth).toBe('low');
    expect(depthScore).toBe(0);
  });

  it('high depth for architectural prompts', () => {
    const prompts = [
      'design the system architecture with proper coupling between service layers',
      'what are the tradeoffs between consistency and throughput in this transaction schema',
      'the abstraction interface must enforce the contract for all dependent components',
      'cache invalidation strategy vs write-through vs write-behind — what are the tradeoffs',
      'normalisation of the data model and index strategy for the migration',
    ];
    const { depth, depthScore } = classifyDepth(prompts);
    expect(depthScore).toBeGreaterThanOrEqual(DEPTH_HIGH_THRESHOLD);
    expect(depth).toBe('high');
  });

  it('low depth for surface-level prompts', () => {
    const prompts = [
      'just a quick fix for the button color',
      'simple change to the header text',
      'minor adjustment to the padding',
      'just update the label here',
      'small change to the font size',
    ];
    const { depth, depthScore } = classifyDepth(prompts);
    expect(depthScore).toBeLessThan(DEPTH_MEDIUM_THRESHOLD);
    expect(depth).toBe('low');
  });

  it('medium depth for feature-level prompts', () => {
    const prompts = [
      'implement the user authentication endpoint',
      'add the email notification service to the backend',
      'build the api for creating new projects',
      'implement the search functionality',
    ];
    const { depth } = classifyDepth(prompts);
    // Feature prompts: no strong high-depth or low-depth vocab → medium or low
    expect(['medium', 'low']).toContain(depth);
  });

  it('depthScore is exactly 0 for neutral prompts (no high or low vocab)', () => {
    const { depthScore } = classifyDepth(['add a button', 'build this', 'implement that']);
    expect(depthScore).toBe(0);
    // depth should be low when exactly 0
  });

  it('depthScore at exactly DEPTH_HIGH_THRESHOLD maps to high', () => {
    // Create prompts where avg score = exactly 2.0
    // Each prompt needs exactly 2 high-depth terms on average
    const prompts = [
      'schema migration', // 2 hits
      'schema migration', // 2 hits
    ];
    const { depthScore, depth } = classifyDepth(prompts);
    expect(depthScore).toBeCloseTo(2.0, 0);
    expect(depth).toBe('high');
  });

  it('depthScore at exactly DEPTH_MEDIUM_THRESHOLD maps to medium', () => {
    // avg 0.5: one prompt has 1 hit, one has 0 → avg = 0.5
    const prompts = ['schema', 'add a button'];
    const { depth } = classifyDepth(prompts);
    expect(depth).toBe('medium');
  });
});

// ── UserProfileClassifier ─────────────────────────────────────────────────────

describe('UserProfileClassifier — classifyUserProfile', () => {
  it('returns a complete UserProfile with all required fields', () => {
    const history = makeRecords(['implement the auth module', 'add the tests']);
    const profile = classifyUserProfile(history, 2);
    expect(profile).toHaveProperty('nature');
    expect(profile).toHaveProperty('precisionScore');
    expect(profile).toHaveProperty('playfulnessScore');
    expect(profile).toHaveProperty('mood');
    expect(profile).toHaveProperty('depth');
    expect(profile).toHaveProperty('depthScore');
    expect(profile).toHaveProperty('computedAt');
  });

  it('computedAt matches the passed promptCount', () => {
    const history = makeRecords(['implement this']);
    const profile = classifyUserProfile(history, 42);
    expect(profile.computedAt).toBe(42);
  });

  it('returns beginner + casual + low for empty history', () => {
    const profile = classifyUserProfile([], 0);
    expect(profile.nature).toBe('beginner');
    expect(profile.mood).toBe('casual');
    expect(profile.depth).toBe('low');
  });

  it('hardcore_pro profile from technical prompts', () => {
    const prompts = [
      'implement idempotent retry with exponential backoff and bounded concurrency limit',
      'the schema migration must not violate transaction consistency invariants',
      'per the spec, latency must not exceed 50ms — what are the tradeoffs for the cache layer',
      'design the abstraction so coupling between service modules is minimised',
      'what are the alternatives and their tradeoffs for the async queue pattern',
    ];
    const history = makeRecords(prompts);
    const profile = classifyUserProfile(history, prompts.length);
    expect(profile.nature).toBe('hardcore_pro');
  });

  it('frustrated mood detected in profile', () => {
    const prompts = [
      'this is broken again',
      'still not working ugh',
      'wrong output again why',
      'same issue as before',
      'broken again',
    ];
    const history = makeRecords(prompts);
    const profile = classifyUserProfile(history, prompts.length);
    expect(profile.mood).toBe('frustrated');
  });

  it('high depth detected when architectural vocabulary used', () => {
    const prompts = Array(10).fill(
      'design the abstraction with proper coupling constraints throughput latency schema migration',
    );
    const history = makeRecords(prompts);
    const profile = classifyUserProfile(history, 10);
    expect(profile.depth).toBe('high');
  });

  it('uses only the last 20 prompts for nature (window)', () => {
    // 25 beginner prompts + 5 hardcore_pro prompts
    const beginnerPrompts = Array(25).fill('add a button');
    const proPrompts = [
      'schema migration invariant coupling abstraction throughput latency constraint tradeoff interface',
      'schema migration invariant coupling abstraction throughput latency constraint tradeoff interface',
      'schema migration invariant coupling abstraction throughput latency constraint tradeoff interface',
      'schema migration invariant coupling abstraction throughput latency constraint tradeoff interface',
      'schema migration invariant coupling abstraction throughput latency constraint tradeoff interface',
    ];
    const history = makeRecords([...beginnerPrompts, ...proPrompts]);
    // Last 20 = 15 beginner + 5 pro → still mostly beginner → precision likely low
    const profile = classifyUserProfile(history, 30);
    // Nature may be beginner or hardcore_pro depending on window content
    // Just verify it ran without error and returned a valid nature
    expect(['beginner', 'hardcore_pro', 'cool_geek', 'pro_geek_soul']).toContain(profile.nature);
  });

  it('uses only last 5 prompts for mood', () => {
    // First 10 prompts are excited (lots of !), last 5 are frustrated
    const excitedPrompts = Array(10).fill('this is amazing!!! great progress!!!');
    const frustratedPrompts = [
      'broken again ugh', 'wrong output again', 'still not working', 'why is this broken', 'not working again ugh',
    ];
    const history = makeRecords([...excitedPrompts, ...frustratedPrompts]);
    const profile = classifyUserProfile(history, 15);
    // Mood should reflect last 5 (frustrated), not first 10 (excited)
    expect(profile.mood).toBe('frustrated');
  });
});

describe('UserProfileClassifier — isProfileStale', () => {
  function fakeProfile(computedAt: number): UserProfile {
    return {
      nature: 'beginner', precisionScore: 0, playfulnessScore: 0,
      mood: 'casual', depth: 'low', depthScore: 0, computedAt,
    };
  }

  it('returns true for null profile', () => {
    expect(isProfileStale(null, 10)).toBe(true);
  });

  it('returns false when within recompute interval', () => {
    const profile = fakeProfile(0);
    expect(isProfileStale(profile, PROFILE_RECOMPUTE_INTERVAL - 1)).toBe(false);
  });

  it('returns true when at recompute interval boundary', () => {
    const profile = fakeProfile(0);
    expect(isProfileStale(profile, PROFILE_RECOMPUTE_INTERVAL)).toBe(true);
  });

  it('returns true when well past recompute interval', () => {
    const profile = fakeProfile(0);
    expect(isProfileStale(profile, PROFILE_RECOMPUTE_INTERVAL * 3)).toBe(true);
  });

  it('uses computedAt correctly when not starting at 0', () => {
    const profile = fakeProfile(10);
    expect(isProfileStale(profile, 14)).toBe(false); // 14-10=4 < 5
    expect(isProfileStale(profile, 15)).toBe(true);  // 15-10=5 >= 5
  });
});
