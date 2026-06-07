// Failure-mode tags for the R5 runtime injection path.
//
// The injection path normally runs the deterministic-vocab + voice-rule-filter
// + LLM-rewrite chain to produce a user-grounded reason-context string. When
// any of these 7 conditions fire, the path falls back to a pre-authored
// static summary (the D-fallback) for the relevant (signal_type, register)
// pair.
//
// Per-mode trigger conditions are codified at the handler call sites; this
// module just declares the tag set and the handler-result shape. The
// handlers themselves live alongside the injection logic.

/** Failure-mode enum — one tag per F-handler defined in the runtime injection path. */
export enum FailureMode {
  /** Fewer than 2 qualifying prompts (early session). */
  F1_EARLY_SESSION   = 'F1_EARLY_SESSION',
  /** PII / secret tokens detected after masking; too few useful tokens remain. */
  F2_PII_MASK        = 'F2_PII_MASK',
  /** Previous prompts contradict the static desc-base direction. */
  F3_CONTRADICTION   = 'F3_CONTRADICTION',
  /** Output exceeds the per-substitution line/char budget or per-set total overflow. */
  F4_LENGTH_OVERFLOW = 'F4_LENGTH_OVERFLOW',
  /** Repeated similar prompts (e.g., same verb 5 times). */
  F5_REPEATED_PROMPTS = 'F5_REPEATED_PROMPTS',
  /** Cross-project / cross-session history bleed. */
  F6_CROSS_PROJECT   = 'F6_CROSS_PROJECT',
  /** Sensitive-action language carry-over from user prompts. */
  F7_L2_CARRYOVER    = 'F7_L2_CARRYOVER',
}

/** All failure-mode tags as a const array — useful for exhaustive iteration in tests / dispatch tables. */
export const ALL_FAILURE_MODES: readonly FailureMode[] = [
  FailureMode.F1_EARLY_SESSION,
  FailureMode.F2_PII_MASK,
  FailureMode.F3_CONTRADICTION,
  FailureMode.F4_LENGTH_OVERFLOW,
  FailureMode.F5_REPEATED_PROMPTS,
  FailureMode.F6_CROSS_PROJECT,
  FailureMode.F7_L2_CARRYOVER,
] as const;

/**
 * Handler-result shape — what each F-handler returns to the injection coordinator.
 *
 * `triggered` = the handler's condition fired for this call.
 * `useFallback` = the coordinator should substitute the static D-fallback for this option.
 * `note` = optional human-readable annotation for telemetry / logs.
 */
export interface FailureModeHandlerResult {
  triggered:   boolean;
  useFallback: boolean;
  note?:       string;
}
