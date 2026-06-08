/**
 * Feature word grounding configuration for option text generation.
 *
 * When enabled, Pass 2 (feature noun embedding) receives the most recent
 * session prompts and embeds at most `maxWords` feature-specific words
 * (e.g. "recurring invoices", "login page") into the Pass 1 adapted option text.
 *
 * All three knobs are developer-facing — change here and rebuild to take effect.
 * No CLI command or DB config key is needed.
 */
export const GroundingConfig = {
  /** Master switch. false = Pass 2 (feature noun embedding) is skipped entirely; Pass 1 (vocabulary adaptation) still runs. */
  enabled:      true,

  /**
   * Maximum number of grounding words the LLM may embed per option text.
   * 3–5 is the sweet spot — enough to feel contextual, not enough to be awkward.
   * Set to 1 for very conservative grounding; 9 for richer (higher hallucination risk).
   */
  maxWords:     9,

  /**
   * How many of the most recent session prompts to pass as grounding context.
   * Smaller = tighter (current feature only).
   * Larger = broader (may pull in older, less relevant context).
   * Must not exceed MAX_HISTORY (30) in SessionStateManager.
   */
  promptWindow: 12,

  /**
   * Per-call token budget for the R5 runtime substitution module's
   * deterministic vocab extraction step (`extractVocab` in
   * r5-injection.ts). Dev plan §10.3 fixes the canonical value at 8
   * but locks it as configurable here. Smaller = tighter (less
   * grounding) — bigger = broader (more user-grounded vocab passed
   * to the rewrite LLM, potentially diluting concentration).
   *
   * Override per-call via `InjectR5Options.vocabTokenBudget` when
   * a specific advisory fire needs a different budget without
   * changing the global default.
   */
  r5VocabTokenBudget: 8,
};

export type GroundingConfigShape = typeof GroundingConfig;
