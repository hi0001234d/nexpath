/**
 * Feature word grounding configuration for option text generation.
 *
 * When enabled, the option generation LLM prompt receives a slice of the
 * user's most recent session prompts and is instructed to embed at most
 * `maxWords` feature-specific words (e.g. "recurring invoices", "login page")
 * naturally into each option text.
 *
 * All three knobs are developer-facing — change here and rebuild to take effect.
 * No CLI command or DB config key is needed.
 */
export const GroundingConfig = {
  /** Master switch. false = exact current behaviour, zero prompt change. */
  enabled:      true,

  /**
   * Maximum number of grounding words the LLM may embed per option text.
   * 2–3 is the sweet spot — enough to feel contextual, not enough to be awkward.
   * Set to 1 for very conservative grounding; 5 for richer (higher hallucination risk).
   */
  maxWords:     3,

  /**
   * How many of the most recent session prompts to pass as grounding context.
   * Smaller = tighter (current feature only).
   * Larger = broader (may pull in older, less relevant context).
   * Must not exceed MAX_HISTORY (30) in SessionStateManager.
   */
  promptWindow: 5,
} as const;

export type GroundingConfigShape = typeof GroundingConfig;
