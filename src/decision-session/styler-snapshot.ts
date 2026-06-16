// Test scaffold helpers for the styler diagnostic-bypass pattern.
//
// Dual-snapshot pattern: produce both a styled snapshot AND an unstyled
// snapshot (captured with NEXPATH_STYLE_PASSTHROUGH=1) so a mismatch
// between the two flags either a broken styler (identical when it
// shouldn't be) or a layout-state leak through the styler.

import { STYLE_PASSTHROUGH_ENV } from './styler.js';

/**
 * Run `fn` with the `NEXPATH_STYLE_PASSTHROUGH` env-var set to `value`
 * (or unset when `value` is `undefined`). Restores the prior env-var
 * state on completion, including on thrown exceptions (try/finally).
 *
 * Synchronous variant — for async render paths use
 * `withStylerEnvAsync` below.
 */
export function withStylerEnv<T>(value: '1' | undefined, fn: () => T): T {
  const prev = process.env[STYLE_PASSTHROUGH_ENV];
  try {
    if (value === undefined) delete process.env[STYLE_PASSTHROUGH_ENV];
    else                     process.env[STYLE_PASSTHROUGH_ENV] = value;
    return fn();
  } finally {
    if (prev === undefined) delete process.env[STYLE_PASSTHROUGH_ENV];
    else                    process.env[STYLE_PASSTHROUGH_ENV] = prev;
  }
}

/**
 * Async variant of `withStylerEnv`. The env-var is restored after the
 * returned promise settles (either resolved or rejected).
 */
export async function withStylerEnvAsync<T>(value: '1' | undefined, fn: () => Promise<T>): Promise<T> {
  const prev = process.env[STYLE_PASSTHROUGH_ENV];
  try {
    if (value === undefined) delete process.env[STYLE_PASSTHROUGH_ENV];
    else                     process.env[STYLE_PASSTHROUGH_ENV] = value;
    return await fn();
  } finally {
    if (prev === undefined) delete process.env[STYLE_PASSTHROUGH_ENV];
    else                    process.env[STYLE_PASSTHROUGH_ENV] = prev;
  }
}

/**
 * Capture render output twice — once with the styler bypass ON
 * (`NEXPATH_STYLE_PASSTHROUGH=1`) and once with it OFF. Returns both
 * results so callers can snapshot them independently or assert
 * structural invariants between them.
 *
 * @param produce Pure function that, given the current env-var state,
 *                produces a snapshot-friendly value (string,
 *                string[], JSON-stringifiable, etc.). Called twice.
 */
export function captureStyledAndUnstyled<T>(produce: () => T): { styled: T; unstyled: T } {
  const unstyled = withStylerEnv('1',       produce);
  const styled   = withStylerEnv(undefined, produce);
  return { styled, unstyled };
}

/** Async variant of `captureStyledAndUnstyled`. */
export async function captureStyledAndUnstyledAsync<T>(
  produce: () => Promise<T>,
): Promise<{ styled: T; unstyled: T }> {
  const unstyled = await withStylerEnvAsync('1',       produce);
  const styled   = await withStylerEnvAsync(undefined, produce);
  return { styled, unstyled };
}
