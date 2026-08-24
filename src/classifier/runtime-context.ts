/**
 * Build the mistake-category `RuntimeContext` at fire time (dev-plan §6.1 item 10b).
 *
 * The registry-detected absence signals read their condition from a `RuntimeContext`:
 *  - behavioural streaks from the live `SessionState` (frustration / acceptance), and
 *  - the dev-environment probe booleans, mapped from `probeProject`.
 *
 * A boolean fact maps straight through; a `null`/unknown fact leaves the field `undefined` so a
 * detector "stays dark on unknown" (it fires only on an explicit `false`).
 */

import type { SessionState } from './types.js';
import type { RuntimeContext } from './mistake-categories.js';
import { probeProject } from '../env/env-probe.js';

export function buildRuntimeContext(state: SessionState): RuntimeContext {
  const facts = probeProject(state.projectRoot).facts;
  const flag = (key: string): boolean | undefined => {
    const v = facts[key]?.value;
    return typeof v === 'boolean' ? v : undefined;
  };
  return {
    currentAgentMode:             state.currentAgentMode,
    stage:                        state.currentStage,
    stageConfidence:              state.stageConfidence,
    consecutiveAcceptanceStreak:  state.consecutiveAcceptanceStreak,
    consecutiveFrustratedPrompts: state.consecutiveFrustratedPrompts,
    hasVersionControl:  flag('has_version_control'),
    hasBackups:         flag('has_backups'),
    hasSeparateEnvs:    flag('has_env_separation'),
    hasSecurityScanner: flag('has_security_scanner'),
  };
}
