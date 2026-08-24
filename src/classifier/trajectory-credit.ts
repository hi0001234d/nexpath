/**
 * Environment-trajectory movement credit.
 *
 * The per-session environment probe emits a change event when a project fact
 * confirmably moves (see env-trajectory). ACQUIRING a good capability — a test
 * runner, a security scanner, a CI pipeline appearing in the project — is
 * positive movement, and it credits the matching practice signal's score as a
 * one-shot bonus.
 *
 * Boundaries (load-bearing):
 *  - Movement is a score bonus ONLY. It never counts toward the stability gate
 *    (stability means the practice was repeatedly OBSERVED — a one-time
 *    environment change must not fabricate that), never marks a signal
 *    behaviour-verified (an environment change is not observed practice
 *    behaviour), and never adds to the opportunity denominator.
 *  - Only the `acquired` direction credits. Losing a capability is already
 *    handled by the absence side — a score penalty here would punish twice.
 *  - One credit per environment fact within the aggregation window, no matter
 *    how many times it flapped (acquired → lost → acquired counts once).
 *  - Every trajectory row is consumed here — none leak into the profile as
 *    inert signal entries (they would otherwise read as "history" to
 *    consumers that only check for any recorded occurrence).
 */

import type { ParamEvent } from '../telemetry/param-events.js';

/** Score bonus per acquired capability (tunable; recalibrate once telemetry exists). */
export const MOVEMENT_CREDIT = 1.0;

/** Env fact → the practice signal its acquisition credits. */
export const MOVEMENT_CREDIT_MAP: Readonly<Record<string, string>> = {
  has_test_runner:      'test_creation',
  has_security_scanner: 'security_check',
  has_ci_pipeline:      'ci_pipeline',
};

const MOVEMENT_KEY_PREFIX = 'env_fact_changed:';
const MOVEMENT_KEY_RE = /^env_fact_changed:([^:]+):acquired$/;

export interface MovementExtraction {
  /** The input events with every trajectory row removed. */
  events: ParamEvent[];
  /** Practice signalKey → total one-shot bonus for the window. */
  credits: ReadonlyMap<string, number>;
}

/**
 * Split trajectory rows out of an event window and convert the acquisitions
 * into practice-score credits. Call AFTER any window slicing, so movement
 * credit follows the same recency semantics as every other event.
 */
export function extractMovementCredits(events: readonly ParamEvent[]): MovementExtraction {
  const remaining: ParamEvent[] = [];
  const acquiredFacts = new Set<string>();
  for (const e of events) {
    if (!e.signalKey.startsWith(MOVEMENT_KEY_PREFIX)) {
      remaining.push(e);
      continue;
    }
    const match = MOVEMENT_KEY_RE.exec(e.signalKey);
    if (match?.[1] !== undefined) acquiredFacts.add(match[1]);
    // lost / changed / malformed trajectory rows: consumed without credit.
  }
  const credits = new Map<string, number>();
  for (const fact of acquiredFacts) {
    const practice = MOVEMENT_CREDIT_MAP[fact];
    if (practice === undefined) continue;
    credits.set(practice, (credits.get(practice) ?? 0) + MOVEMENT_CREDIT);
  }
  return { events: remaining, credits };
}
