import { setConfig } from '../../store/config.js';
import type { Store } from '../../store/db.js';

export const VALID_ROLES = ['founder', 'indie_hacker', 'pm', 'vibe_coder'] as const;
export type RoleValue = typeof VALID_ROLES[number];

export const VALID_ADVISORY_FREQUENCY_LEVELS = [
  'off',
  'major_only',
  'once_per_session',
  'every_event',
  'optimum',
] as const;
export type AdvisoryFrequencyValue = typeof VALID_ADVISORY_FREQUENCY_LEVELS[number];

/** Thrown when an attempted role / frequency write does not pass validation. */
export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Validate and persist an advisory_frequency value at the given config key
 * (e.g. 'advisory_frequency' or 'advisory_frequency:/some/project').
 * Empty string is accepted and treated as unset.
 */
export function setAdvisoryFrequency(store: Store, key: string, value: string): void {
  if (value !== '' && !(VALID_ADVISORY_FREQUENCY_LEVELS as readonly string[]).includes(value)) {
    throw new ConfigValidationError(
      `Invalid advisory_frequency "${value}". Valid values: ${VALID_ADVISORY_FREQUENCY_LEVELS.join(', ')}`,
    );
  }
  setConfig(store, key, value);
}

/**
 * Validate and persist a role value at the given config key
 * (e.g. 'role' or 'role:/some/project').
 * Empty string is accepted and treated as unset.
 */
export function setRole(store: Store, key: string, value: string): void {
  if (value !== '' && !(VALID_ROLES as readonly string[]).includes(value)) {
    throw new ConfigValidationError(
      `Invalid role "${value}". Valid values: ${VALID_ROLES.join(', ')}`,
    );
  }
  setConfig(store, key, value);
}
