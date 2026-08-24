/**
 * Experiment configuration — deterministic forced-variant pinning.
 *
 * An experiment pins a signalType to a specific content variant (the record
 * source tier and/or the maturity level its forms resolve at) for a cohort of
 * installations, so comparison arms are deterministic: the same installation
 * always gets the same arm for the same experiment, with no draw at serve
 * time. Content composition itself is untouched — a pin only changes WHICH
 * record/level the existing pipeline resolves, never how a cell composes.
 *
 * Config lives in the local config table under one key as JSON; a missing or
 * malformed value simply disables pinning (fail-open, like every read on the
 * serving path). Cohort membership is a stable hash of the installation id and
 * the experiment id — different experiments bucket independently.
 */

import { getConfig } from '../store/config.js';
import { getInstallationId } from '../telemetry/identity.js';
import type { Store } from '../store/db.js';
import { CONTENT_TEMPLATE_SOURCES, type ContentTemplateSource, type MaturityLevel } from './content-template-schema.js';
import type { RecordCandidateLookup } from './content-template-engine.js';

export const EXPERIMENT_CONFIG_KEY = 'experiment_config';

export interface VariantPin {
  /** The signalType this pin applies to. */
  signalType: string;
  /** Force the record source tier (e.g. always the shipped preset). */
  forcedSource?: ContentTemplateSource;
  /** Force the maturity level the forms resolve at (1–5). */
  forcedLevel?: MaturityLevel;
}

export interface ExperimentConfig {
  /** Experiment identifier — stamped onto served-variant rows for measurement. */
  id: string;
  /** Percentage of installations in the pinned cohort (0–100; default 100). */
  cohortPercent?: number;
  pins: VariantPin[];
}

/** Stable 0–99 bucket for a seed — same inputs, same bucket, forever. */
export function cohortBucket(installationId: string, experimentId: string): number {
  // FNV-1a over the combined seed; cheap, deterministic, dependency-free.
  let hash = 0x811c9dc5;
  const seed = `${experimentId}:${installationId}`;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}

/** Parse the stored experiment config; missing/malformed → null (pinning off). */
export function loadExperimentConfig(store: Store): ExperimentConfig | null {
  const raw = getConfig(store.db, EXPERIMENT_CONFIG_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ExperimentConfig;
    if (
      typeof parsed !== 'object' || parsed === null ||
      typeof parsed.id !== 'string' || parsed.id.length === 0 ||
      !Array.isArray(parsed.pins)
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface ActivePin {
  experimentId: string;
  pin: VariantPin;
}

/**
 * The pin that applies to this signalType for this installation, or null.
 * Deterministic: config + installation id fully decide the answer.
 */
/**
 * Drop invalid pin values rather than letting them reach the serving path: a
 * typo'd source would suppress every cascade tier (an unlogged fallback serve),
 * and an out-of-range level would log an identity the engine never actually
 * served. A pin with no valid dimension left is no pin at all.
 */
function sanitizePin(pin: VariantPin): VariantPin | null {
  const source =
    pin.forcedSource !== undefined && (CONTENT_TEMPLATE_SOURCES as readonly string[]).includes(pin.forcedSource)
      ? pin.forcedSource
      : undefined;
  const level =
    typeof pin.forcedLevel === 'number' && Number.isInteger(pin.forcedLevel) && pin.forcedLevel >= 1 && pin.forcedLevel <= 5
      ? pin.forcedLevel
      : undefined;
  if (source === undefined && level === undefined) return null;
  return {
    signalType: pin.signalType,
    ...(source !== undefined ? { forcedSource: source } : {}),
    ...(level !== undefined ? { forcedLevel: level } : {}),
  };
}

export function activePinFor(store: Store, signalType: string): ActivePin | null {
  const config = loadExperimentConfig(store);
  if (!config) return null;
  const raw = config.pins.find((p) => p?.signalType === signalType);
  if (!raw) return null;
  const pin = sanitizePin(raw);
  if (!pin) return null;
  const percent = config.cohortPercent ?? 100;
  if (percent <= 0) return null;
  if (percent < 100 && cohortBucket(getInstallationId(store), config.id) >= percent) return null;
  return { experimentId: config.id, pin };
}

/**
 * Pin the record-source cascade: only the forced source's candidate resolves.
 * Without a forced source the lookup is returned unchanged.
 */
export function applyPinToLookup(lookup: RecordCandidateLookup, pin: VariantPin): RecordCandidateLookup {
  const forced = pin.forcedSource;
  if (forced === undefined) return lookup;
  return (source) => (source === forced ? lookup(source) : undefined);
}

/** The maturity level the forms should resolve at under this pin. */
export function applyPinToLevel(level: MaturityLevel, pin: VariantPin): MaturityLevel {
  return pin.forcedLevel ?? level;
}
