import type { UserNature } from './types.js';

/**
 * User nature classifier — Two-Axis Model (per New-B-2 research).
 *
 * Axis 1 — Technical Precision (0–10):
 *   Domain jargon, constraint-explicit phrasing, spec references,
 *   alternative-seeking, tradeoff language.
 *
 * Axis 2 — Playfulness / Expressiveness (0–10):
 *   Informal vocabulary, humour markers, emoji, exclamation density,
 *   casual fragments.
 *
 * 2D quadrant → archetype:
 *   High Precision + High Playfulness  → pro_geek_soul
 *   High Precision + Low Playfulness   → hardcore_pro
 *   Low Precision  + High Playfulness  → cool_geek
 *   Low Precision  + Low Playfulness   → beginner
 *
 * Evaluated over the last 10–20 prompts.
 */

// ── Precision vocabulary ───────────────────────────────────────────────────────

const PRECISION_SIGNALS: string[] = [
  // Architecture & design jargon
  'architecture', 'coupling', 'abstraction', 'interface', 'contract',
  'component', 'service', 'module', 'layer',
  // Performance
  'throughput', 'latency', 'bottleneck', 'cache', 'async', 'concurrency',
  // Data
  'schema', 'migration', 'transaction', 'consistency', 'normalisation', 'normalization', 'index',
  // Design vocabulary
  'pattern', 'tradeoff', 'trade-off', 'invariant', 'constraint',
  // Comparison framing
  ' vs ', 'instead of', 'compared to', 'alternative',
  // Constraint-explicit phrasing
  'must not', 'must be', 'within the', 'no more than',
  // Spec/doc references
  'per the spec', 'per spec', 'per the prd', 'as defined', 'per the architecture',
  // Alternative-seeking
  'what are the options', 'pros and cons', 'what are the tradeoffs',
  'which would you recommend', 'downside of', 'what\'s the best approach',
];

// ── Playfulness vocabulary ─────────────────────────────────────────────────────

const PLAYFULNESS_SIGNALS: string[] = [
  // Informal vocabulary
  'nah', 'yeah', 'yep', 'nope', 'lol', 'haha', 'lmao', 'omg', 'wtf',
  'what even', 'wild', 'cool', 'neat', 'crazy', 'insane', 'awesome', 'sick',
  'dope', 'welp', 'oops', 'whoops', 'ugh', 'meh',
  // Internet-casual abbreviations
  'kinda', 'sorta', 'tbh', 'ngl', 'imo', 'tho ', 'rn ', 'idk',
  // Playful question markers
  'right?', 'yeah?', 'no?',
];

/** Scaling factor: N hits per prompt → score 10 when hits/prompt = 10/K */
const PRECISION_SCALE = 3.5;   // 2.86 hits/prompt → 10
const PLAYFULNESS_SCALE = 3.5; // 2.86 hits/prompt → 10

/** Above this score (0–10) the axis is considered "high". */
export const NATURE_HIGH_THRESHOLD = 5.0;

// ── Scoring helpers ────────────────────────────────────────────────────────────

function countSignals(text: string, signals: string[]): number {
  const lower = text.toLowerCase();
  return signals.reduce((n, sig) => n + (lower.includes(sig) ? 1 : 0), 0);
}

function countExclamations(text: string): number {
  return (text.match(/!/g) ?? []).length;
}

function hasEmoji(text: string): boolean {
  // Basic Unicode emoji range check (common emoji blocks)
  return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text);
}

function toScore(totalHits: number, promptCount: number, scale: number): number {
  if (promptCount === 0) return 0;
  return Math.min((totalHits / promptCount) * scale, 10);
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface NatureScores {
  precisionScore: number;    // 0–10
  playfulnessScore: number;  // 0–10
  nature: UserNature;
}

/**
 * Classify user nature from the last N prompt strings (10–20 recommended).
 * Accepts raw text strings — caller slices PromptRecord[].map(r => r.text).
 */
export function classifyNature(prompts: string[]): NatureScores {
  if (prompts.length === 0) {
    return { precisionScore: 0, playfulnessScore: 0, nature: 'beginner' };
  }

  let precisionHits = 0;
  let playfulnessHits = 0;

  for (const p of prompts) {
    precisionHits   += countSignals(p, PRECISION_SIGNALS);
    playfulnessHits += countSignals(p, PLAYFULNESS_SIGNALS);
    playfulnessHits += countExclamations(p);
    if (hasEmoji(p)) playfulnessHits += 2; // emoji is a strong playfulness signal
  }

  const precisionScore   = toScore(precisionHits,   prompts.length, PRECISION_SCALE);
  const playfulnessScore = toScore(playfulnessHits, prompts.length, PLAYFULNESS_SCALE);

  return {
    precisionScore,
    playfulnessScore,
    nature: quadrantToNature(precisionScore, playfulnessScore),
  };
}

/** Map (precisionScore, playfulnessScore) to one of the four archetypes. */
export function quadrantToNature(
  precisionScore: number,
  playfulnessScore: number,
): UserNature {
  const highPrec = precisionScore   >= NATURE_HIGH_THRESHOLD;
  const highPlay = playfulnessScore >= NATURE_HIGH_THRESHOLD;
  if (highPrec && highPlay)  return 'pro_geek_soul';
  if (highPrec && !highPlay) return 'hardcore_pro';
  if (!highPrec && highPlay) return 'cool_geek';
  return 'beginner';
}
