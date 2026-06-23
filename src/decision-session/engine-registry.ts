/**
 * Layer B — the routing spine for decision-session content.
 *
 * An `Engine` OWNS one polarity-class of signal fires. The router walks the
 * registered engines and the FIRST whose `accepts()` matches owns the fire.
 * Because polarity + ownership make at most one engine accept a given fire,
 * array order is a determinism tie-break, not a correctness lever (the
 * ContentTemplateEngine is kept first). Adding an engine = one module + one
 * array entry — the router never changes.
 *
 * Routing follows the polarity contract:
 *  - good-pattern-present        → ContentTemplateEngine
 *  - corrective (absence-of-good OR presence-of-bad) → AbsenceSignalEngine
 *  - governance / meta           → NEITHER engine (handled outside the engines)
 * A given fire is exactly one polarity, so signed/bidirectional params never
 * route to two engines. Cross-engine READS (guard-rails, detection inputs) are
 * non-owning and are not expressed through `accepts()`.
 *
 * This is the spine only and ships dark: the ContentTemplateEngine's `run()`
 * internals are authored separately (content-template composition); the
 * AbsenceSignalEngine wraps the existing absence-detection path. Wiring this
 * registry into the live decision path is the later migration step.
 */

import type { AbsenceFlag, SessionState, UserProfile } from '../classifier/types.js';
import { contentTemplateEngine } from './content-template-engine.js';
import { absenceSignalEngine } from './absence-signal-engine.js';

/**
 * The routing polarity-class of a fire:
 *  - `'good_present'` — a good pattern is present → ContentTemplateEngine
 *  - `'corrective'`   — absence-of-good OR presence-of-bad → AbsenceSignalEngine
 *  - `'governance'`   — content-feature governance; owned by NEITHER engine
 *  - `'meta'`         — internal meta (frequency / aggregation); owned by NEITHER engine
 */
export type ParamPolarity = 'good_present' | 'corrective' | 'governance' | 'meta';

/** The param vector handed to an engine's `run()`. Extended as the vector grows. */
export interface EngineInput {
  state: SessionState;
  profile?: UserProfile | null;
  projectType?: string;
}

/** An engine's output. `kind` discriminates the producing engine. */
export type ContentSpec =
  | { kind: 'absence'; flags: AbsenceFlag[] }
  | { kind: 'content-template'; payload: unknown }; // payload shape authored at the content-template layer

export interface Engine {
  readonly name: string;
  /** Ownership test — does this engine OWN (produce + fire) this polarity-class? */
  accepts(polarity: ParamPolarity): boolean;
  /** Produce the content for a fire this engine owns. */
  run(input: EngineInput): ContentSpec;
}

/**
 * Registered engines, in determinism order (ContentTemplateEngine first).
 * Adding an engine = append one entry here — `resolveEngine` is unchanged.
 */
export const ENGINES: readonly Engine[] = [contentTemplateEngine, absenceSignalEngine];

/**
 * Return the first engine that OWNS `polarity`, or `null` when none do — the
 * governance / meta classes route to neither engine.
 */
export function resolveEngine(
  polarity: ParamPolarity,
  engines: readonly Engine[] = ENGINES,
): Engine | null {
  return engines.find((e) => e.accepts(polarity)) ?? null;
}
