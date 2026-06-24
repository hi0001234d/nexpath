/**
 * Workflow-maturity level detection + graduation.
 *
 * Produces the per-user workflow-maturity LEVEL (1–5) the content-template
 * maturity matrix consumes. This is NET-NEW and ORTHOGONAL to the existing
 * `SessionDepth` ('low'|'medium'|'high') and to the L1/L2/L3 strength tiers.
 *
 * Detection: a relevance-weighted average of the RIGHT&GOOD `score` over the
 * user's ACTIVE good-practice set — universal + nature-matched + role-matched +
 * in-scope-domain signals. Irrelevant / role-mismatched / out-of-domain signals
 * are EXCLUDED from the set (NOT scored 0, which would wrongly drag the average).
 * The anti-pattern detectors are excluded from the good set; v1 runs on the
 * signal-rate score alone.
 *
 * Bands: equal-fifth placeholder, recalibrated to percentiles once telemetry
 * exists. Cold-start → L2. Storage + graduation: the `user_depth_level` running
 * aggregate; +1-only graduation via a stability counter, −1 down-graduation via
 * a (stickier) hysteresis counter; a new project seeds from the median level of
 * the user's existing projects.
 */

import type { SignalDefinition, UserNature, UserRole } from './types.js';
import { SIGNAL_DEFINITIONS } from './signals.js';
import type { RightGoodProfile } from './right-good-aggregator.js';
import type { Store } from '../store/db.js';
import { SCHEMA_VERSION } from '../store/schema.js';
import {
  getUserDepthLevel,
  listUserDepthLevels,
  upsertUserDepthLevel,
  type UserDepthRow,
} from '../store/user-depth-level.js';

export type MaturityLevel = 1 | 2 | 3 | 4 | 5;

/** Cold-start default for a first-ever project with no seed. */
export const COLD_START_LEVEL: MaturityLevel = 2;

/** Consecutive above-level detections before a +1 graduation (months-scale; tunable). */
export const GRADUATION_STABILITY = 3;
/** Consecutive below-level detections before a −1 down-graduation (stickier; tunable). */
export const HYSTERESIS_THRESHOLD = 5;

/**
 * The (−) anti-pattern state detectors. Excluded from the good-practice active
 * set; a later refinement may fold them in as a subtracting fire-rate penalty,
 * but v1 scores on `s_core` alone.
 */
export const ANTI_PATTERN_KEYS: ReadonlySet<string> = new Set([
  'decision_fatigue_pattern',
  'work_rhythm_check',
  'focus_drift_detection',
]);

/** The user/project facets that gate which signals are in the active set. */
export interface MaturityMeta {
  nature?: UserNature;
  role?: UserRole | null;
  projectType?: string | null;
}

export interface MaturityScore {
  /** s_core ∈ [0,1] — the relevance-weighted average over the active set. */
  score: number;
  /** Size of the active good-practice set. */
  activeCount: number;
  /** Whether any active signal has recorded occurrences (false ⇒ cold-start/hold). */
  hasData: boolean;
}

export interface MaturityScoreOptions {
  signalDefs?: readonly SignalDefinition[];
}

function clampLevel(n: number): MaturityLevel {
  return Math.max(1, Math.min(5, Math.round(n))) as MaturityLevel;
}

/**
 * Whether a signal is in the user's ACTIVE good-practice set. Excludes the (−)
 * anti-patterns, and any nature/role/domain-specific signal whose facet does not
 * match the user (those are irrelevant, not zero).
 */
export function isActiveSignal(sig: SignalDefinition, meta: MaturityMeta): boolean {
  if (ANTI_PATTERN_KEYS.has(sig.key)) return false;
  if (sig.nature !== undefined && sig.nature !== meta.nature) return false;
  if (sig.role !== undefined && sig.role !== meta.role) return false;
  if (sig.relevantProjectTypes !== undefined) {
    if (!meta.projectType || !sig.relevantProjectTypes.includes(meta.projectType)) return false;
  }
  return true;
}

/**
 * Compute the maturity score `s_core` as the equal-weighted average of the
 * RIGHT&GOOD score over the active set. An active signal the user hasn't done
 * counts as 0 (legitimately drags the average); irrelevant signals are excluded.
 */
export function computeMaturityScore(
  profile: RightGoodProfile,
  meta: MaturityMeta,
  opts: MaturityScoreOptions = {},
): MaturityScore {
  const defs = opts.signalDefs ?? SIGNAL_DEFINITIONS;
  let sum = 0;
  let activeCount = 0;
  let hasData = false;
  for (const sig of defs) {
    if (!isActiveSignal(sig, meta)) continue;
    const sigState = profile[sig.key];
    sum += sigState?.score ?? 0;
    activeCount += 1;
    if ((sigState?.stability.occurrences ?? 0) > 0) hasData = true;
  }
  return { score: activeCount > 0 ? sum / activeCount : 0, activeCount, hasData };
}

/** Map s∈[0,1] to a level via equal-fifth bands (PLACEHOLDER — recalibrate to percentiles). */
export function scoreToLevel(score: number): MaturityLevel {
  const s = Math.max(0, Math.min(1, score));
  if (s < 0.2) return 1;
  if (s < 0.4) return 2;
  if (s < 0.6) return 3;
  if (s < 0.8) return 4;
  return 5;
}

/** Cross-project seed: the median current level of existing projects, else cold-start L2. */
export function medianSeedLevel(existingLevels: readonly number[]): MaturityLevel {
  if (existingLevels.length === 0) return COLD_START_LEVEL;
  const sorted = [...existingLevels].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return clampLevel(median);
}

export interface GraduationState {
  currentLevel: MaturityLevel;
  stabilityCounter: number;
  hysteresisCounter: number;
  lastGraduationAt: number | null;
}

/**
 * Advance the graduation state by one observation. +1 only, gated by the
 * stability counter; −1 only, gated by the (stickier) hysteresis counter; a
 * detection AT the current level resets both counters.
 */
export function applyGraduation(
  state: GraduationState,
  detected: MaturityLevel,
  now: number,
): GraduationState {
  let { currentLevel, stabilityCounter, hysteresisCounter, lastGraduationAt } = state;
  if (detected > currentLevel) {
    stabilityCounter += 1;
    hysteresisCounter = 0;
    if (stabilityCounter >= GRADUATION_STABILITY) {
      currentLevel = clampLevel(currentLevel + 1);
      stabilityCounter = 0;
      lastGraduationAt = now;
    }
  } else if (detected < currentLevel) {
    hysteresisCounter += 1;
    stabilityCounter = 0;
    if (hysteresisCounter >= HYSTERESIS_THRESHOLD) {
      currentLevel = clampLevel(currentLevel - 1);
      hysteresisCounter = 0;
    }
  } else {
    stabilityCounter = 0;
    hysteresisCounter = 0;
  }
  return { currentLevel, stabilityCounter, hysteresisCounter, lastGraduationAt };
}

/**
 * Store-backed orchestration: read (or seed) the project's maturity row, fold in
 * one observation from the RIGHT&GOOD profile, persist, and return the new row.
 * With insufficient data (cold-start / no recorded behaviour) the level is held
 * — never graduated off a near-empty profile.
 */
export function updateProjectMaturity(
  store: Store,
  projectRoot: string,
  profile: RightGoodProfile,
  meta: MaturityMeta,
  now: number = Date.now(),
  opts: MaturityScoreOptions = {},
): UserDepthRow {
  const existing = getUserDepthLevel(store, projectRoot);
  const base: UserDepthRow = existing ?? {
    projectRoot,
    currentLevel: medianSeedLevel(listUserDepthLevels(store).map((r) => r.currentLevel)),
    stabilityCounter: 0,
    hysteresisCounter: 0,
    lastGraduationAt: null,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now,
  };

  const score = computeMaturityScore(profile, meta, opts);
  let next: UserDepthRow;
  if (score.hasData) {
    const grad = applyGraduation(
      {
        currentLevel: base.currentLevel as MaturityLevel,
        stabilityCounter: base.stabilityCounter,
        hysteresisCounter: base.hysteresisCounter,
        lastGraduationAt: base.lastGraduationAt,
      },
      scoreToLevel(score.score),
      now,
    );
    next = { ...base, ...grad, updatedAt: now };
  } else {
    next = { ...base, updatedAt: now }; // cold-start / hold — no graduation off near-empty data
  }

  upsertUserDepthLevel(store, next);
  return next;
}
