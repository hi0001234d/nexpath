import type { ClassificationResult } from './types.js';
import { matchKeywords } from './KeywordMatcher.js';
import { classifyWithTFIDF } from './TFIDFClassifier.js';
import type { EmbeddingClassifier } from './EmbeddingClassifier.js';

/**
 * Three-tier cascade classifier.
 *
 * Tier 1 (keyword match, <1ms):
 *   If the keyword matcher returns confidence ≥ 0.65, accept it.
 *
 * Tier 2 (TF-IDF, <5ms):
 *   If Tier 1 returned null or confidence < 0.65, run TF-IDF.
 *   If TF-IDF confidence ≥ 0.40, accept it.
 *
 * Tier 3 (MiniLM embedding, <30ms, optional):
 *   If Tier 2 confidence < 0.40 AND an EmbeddingClassifier is available,
 *   try it. Accept whatever confidence it returns.
 *
 * Final fallback:
 *   Return best result available with "ambiguous" logged in the
 *   allScores map (the stage is still set to the best guess).
 */

export const TIER1_CONFIDENCE_THRESHOLD = 0.65;
export const TIER2_CONFIDENCE_THRESHOLD = 0.40;

export interface ClassifierOptions {
  /** Optional Tier 3 embedding classifier (loaded once at startup). */
  embeddingClassifier?: EmbeddingClassifier | null;
}

export async function classifyPrompt(
  text: string,
  opts: ClassifierOptions = {},
): Promise<ClassificationResult> {
  // ── Tier 1 ────────────────────────────────────────────────────────────────
  const t1 = matchKeywords(text);
  if (t1 && t1.confidence >= TIER1_CONFIDENCE_THRESHOLD) {
    return t1;
  }

  // ── Tier 2 ────────────────────────────────────────────────────────────────
  const t2 = classifyWithTFIDF(text);
  if (t2.confidence >= TIER2_CONFIDENCE_THRESHOLD) {
    return t2;
  }

  // ── Tier 3 ────────────────────────────────────────────────────────────────
  const emb = opts.embeddingClassifier;
  if (emb) {
    try {
      const t3 = await emb.classify(text);
      return t3;
    } catch {
      // fall through to best available
    }
  }

  // Return best guess from whichever tier got furthest
  if (t1 && t1.confidence > t2.confidence) return t1;
  return t2;
}
