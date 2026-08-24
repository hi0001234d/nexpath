/**
 * Tier-P promotion. A dev-environment CAPABILITY fact (the project HAS the thing — tier 'C')
 * is promoted to a PRACTICE fact (tier 'P' — the user reliably DOES it) only when a matching
 * behavioural signal corroborates it: e.g. `has_test_runner` becomes practice-grade when the
 * user's test behaviour reads RIGHT&GOOD. Without corroboration a fact stays tier 'C'
 * (grounds capability-aware wording only, never a discipline/practice claim).
 *
 * A practice claim needs evidence the practice actually HAPPENED, so promotion requires the
 * corroborating signal to be behaviour-verified (transcript evidence — a test really written
 * or run, a scanner really invoked), not merely claimed in prompt text. Signal presence sets
 * the RIGHT&GOOD state; the transcript sets its verification — the two compose.
 */

import type { FactMap } from './types.js';
import type { RightGoodProfile } from '../classifier/right-good-aggregator.js';

/** Env capability fact → the behavioural signals whose verified RIGHT&GOOD state corroborates the practice. */
export const ENV_FACT_CORROBORATOR: Readonly<Record<string, readonly string[]>> = {
  has_test_runner:      ['test_creation', 'regression_check'],
  has_security_scanner: ['security_check'],
  has_ci_pipeline:      ['ci_pipeline'],
};

/**
 * Promote each corroborated capability fact to tier 'P'. A fact qualifies only when it is
 * present (`value === true`), has a known corroborator, and at least one corroborating signal
 * reads `right_good` AND is behaviour-verified. Every other fact is returned unchanged
 * (tier 'C'). Pure — no probe, no store.
 */
export function promoteEnvFactsToTierP(facts: FactMap, rightGood: RightGoodProfile): FactMap {
  const out: FactMap = {};
  for (const [key, f] of Object.entries(facts)) {
    const corroborators = ENV_FACT_CORROBORATOR[key] ?? [];
    const promote =
      f.value === true &&
      corroborators.some((signalKey) => {
        const sig = rightGood[signalKey];
        return sig?.state === 'right_good' && sig.behaviourVerified;
      });
    out[key] = promote ? { ...f, tier: 'P' } : f;
  }
  return out;
}
