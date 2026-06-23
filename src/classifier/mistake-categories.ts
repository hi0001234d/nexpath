/**
 * Declarative mistake-category registry.
 *
 * Each vibe-coding mistake category is ONE array-literal entry: a detector plus a
 * routing tag saying which engine (if any) owns the resulting fire. No interface
 * inheritance, DI, or plugin loader — adding a category is appending one entry.
 *
 * Routing tag → handling:
 *  - 'absence'    — surfaces as an `ABSENCE_*` advisory; `mapToAbsenceSignal` names
 *                   the signal it hooks on the existing absence-detection path, so
 *                   the corrective-polarity engine owns it.
 *  - 'governance' — a content-feature governance concern; owned by NEITHER engine.
 *  - 'meta'       — an internal meta concern (frequency / aggregation); NEITHER engine.
 * `mapToAbsenceSignal` is present ONLY for `routing: 'absence'`.
 *
 * This module is the registry MECHANISM + the routing tag + the engine connection,
 * seeded with the three cross-cutting straddle categories (one per routing tag).
 * The remaining category population — the other detectors and any new `ABSENCE_*`
 * signal definitions + the live detection hook — is authored alongside content
 * later; nothing here is wired into the live path yet.
 */

import type { PromptRecord } from './types.js';
import type { ParamPolarity } from '../decision-session/engine-registry.js';

/** Detector confidence a mistake pattern is present: 0 (absent) … 1 (certain). */
export type Confidence = number;

export type MistakeRouting = 'absence' | 'governance' | 'meta';

/** Contextual inputs a detector may read beyond prompt history (extended as channels land). */
export interface RuntimeContext {
  /** Current coding-agent mode, when known. */
  currentAgentMode?: string;
  /** Consecutive accepted prompts without a correction (fatigue / streak detectors). */
  consecutiveAcceptanceStreak?: number;
}

export interface MistakeCategory {
  /** Stable category id (describes the runtime pattern). */
  name: string;
  /** Confidence the pattern is present given the prompt window + runtime context. */
  detect(promptHistory: readonly PromptRecord[], runtimeContext: RuntimeContext): Confidence;
  /** The `ABSENCE_*` signal this hooks — present ONLY when `routing === 'absence'`. */
  mapToAbsenceSignal?: string;
  routing: MistakeRouting;
  metadata?: { description: string };
}

/** Map a category's routing tag to the engine polarity-class. */
export function routingToPolarity(routing: MistakeRouting): ParamPolarity {
  // 'absence' fires as a corrective advisory; 'governance'/'meta' pass through to neither engine.
  return routing === 'absence' ? 'corrective' : routing;
}

/**
 * Validate the routing invariant: `mapToAbsenceSignal` is present iff
 * `routing === 'absence'`. Returns the offending category names ([] = valid).
 */
export function findRoutingInvariantViolations(categories: readonly MistakeCategory[]): string[] {
  return categories
    .filter((c) => (c.routing === 'absence') !== (c.mapToAbsenceSignal !== undefined))
    .map((c) => c.name);
}

/**
 * The registry. Seeded with the three cross-cutting straddle categories — one per
 * routing tag — that demonstrate the mechanism end to end. Further categories
 * append here as their detectors (and any new `ABSENCE_*` signals) are authored.
 */
export const MISTAKE_CATEGORIES: readonly MistakeCategory[] = [
  {
    name: 'coding_agent_mode_mismatch',
    routing: 'absence',
    mapToAbsenceSignal: 'ABSENCE_AGENT_MODE_MISMATCH', // signal definition + live hook added with the population
    // A true mismatch needs the captured agent mode + a task→mode lookup; until
    // the mode channel lands the detector cannot assert a mismatch.
    detect: () => 0,
    metadata: { description: 'wrong agent mode for the task (e.g. execute mode while still planning)' },
  },
  {
    name: 'prompt_versioning_gap',
    routing: 'governance', // about the content-feature's own governance → neither engine
    detect: () => 0,       // governance handler authored later
    metadata: { description: 'no versioning discipline around prompt/content changes' },
  },
  {
    name: 'advisory_fatigue_dismissal_streak',
    routing: 'meta',       // internal frequency/fatigue signal → neither engine
    detect: (_history, ctx) => ((ctx.consecutiveAcceptanceStreak ?? 0) >= 8 ? 1 : 0),
    metadata: { description: 'long run of un-reviewed acceptances (advisory fatigue)' },
  },
];
