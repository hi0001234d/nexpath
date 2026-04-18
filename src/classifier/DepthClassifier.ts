import type { SessionDepth } from './types.js';

/**
 * Session technical depth classifier (per New-B-2 research).
 *
 * Vocabulary scoring over the last 10 prompts:
 *   Each high-depth vocab hit in a prompt: +1
 *   Each low-depth vocab hit in a prompt:  -1
 *   avg_depth_score = average score per prompt across the window
 *
 * Thresholds:
 *   avg_depth_score >= 2.0  → High   ("Architectural")
 *   avg_depth_score >= 0.5  → Medium ("Feature")
 *   avg_depth_score < 0.5   → Low    ("Surface")
 *
 * Re-evaluated every 10 prompts; stickiness is the caller's responsibility.
 */

// ── Vocabulary lists ───────────────────────────────────────────────────────────

const HIGH_DEPTH_VOCAB: string[] = [
  // Architecture terms
  'component', 'service', 'module', 'layer', 'coupling', 'abstraction',
  'interface', 'contract',
  // Performance terms
  'throughput', 'latency', 'bottleneck', 'cache', 'queue', 'async', 'concurrency',
  // Data terms
  'schema', 'migration', 'index', 'transaction', 'consistency',
  'normalisation', 'normalization',
  // Design terms
  'pattern', 'tradeoff', 'trade-off', 'alternative', 'constraint', 'invariant',
  // Comparison framing
  ' vs ', 'instead of', 'compared to',
];

const LOW_DEPTH_VOCAB: string[] = [
  'just', 'quick', 'simple', 'small change', 'minor', 'little fix',
];

// Thresholds (from research)
export const DEPTH_HIGH_THRESHOLD   = 2.0;
export const DEPTH_MEDIUM_THRESHOLD = 0.5;

// ── Scoring helpers ────────────────────────────────────────────────────────────

function scorePrompt(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const term of HIGH_DEPTH_VOCAB) if (lower.includes(term)) score += 1;
  for (const term of LOW_DEPTH_VOCAB)  if (lower.includes(term)) score -= 1;
  return score;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface DepthResult {
  depthScore: number;    // average score per prompt (may be negative)
  depth: SessionDepth;
}

/**
 * Classify session depth from the last N=10 prompt strings.
 * Accepts raw text strings — caller slices PromptRecord[].map(r => r.text).
 */
export function classifyDepth(prompts: string[]): DepthResult {
  if (prompts.length === 0) {
    return { depthScore: 0, depth: 'low' };
  }

  const totalScore = prompts.reduce((sum, p) => sum + scorePrompt(p), 0);
  const avgScore   = totalScore / prompts.length;

  const depth: SessionDepth =
    avgScore >= DEPTH_HIGH_THRESHOLD   ? 'high' :
    avgScore >= DEPTH_MEDIUM_THRESHOLD ? 'medium' : 'low';

  return { depthScore: avgScore, depth };
}

/** Score a single prompt (exposed for testing). */
export { scorePrompt as scorePromptDepth };
