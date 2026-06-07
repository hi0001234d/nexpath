// Structural line-kind tag used to label every emitted line of the
// decision-session popup. The layout MUST emit each LineKind as a SEPARATE
// element even when styling renders all kinds as plain text — keeping kinds
// separable is what lets the styling layer attach kind-specific formatting
// later without re-parsing rendered output.
//
// Extensibility rule: if a new LineKind is added in a future change, both
// the layout and the styler must update together. The default styler
// behavior for an unknown kind is to return the line unchanged (graceful
// fallback).

export type LineKind =
  | 'popup-why-help'
  | 'desc-base-truncated'
  | 'desc-base-expanded'
  | 'shortcut-hint'
  | 'option-label'
  | 'pinch-label'
  | 'question';

/** All LineKind values as a const array — useful for exhaustive iteration in tests / dispatch tables. */
export const ALL_LINE_KINDS: readonly LineKind[] = [
  'popup-why-help',
  'desc-base-truncated',
  'desc-base-expanded',
  'shortcut-hint',
  'option-label',
  'pinch-label',
  'question',
] as const;

/**
 * Apply per-LineKind styling to a layout-emitted line.
 *
 * Layout has already done line-wrapping, truncation, padding, and `...`
 * marker insertion before calling this function — styler does NOT
 * re-truncate or re-wrap. ANSI escape codes are the styler's
 * responsibility; layout never emits them.
 *
 * Initial implementation is pass-through (returns input unchanged for
 * every kind). The per-kind ANSI / picocolors mapping is added by the
 * styling implementation pass.
 *
 * Default behavior for an unknown kind: return the line unchanged
 * (graceful fallback per the LineKind extensibility rule above).
 *
 * @param line  The raw text content from the layout.
 * @param kind  The line-kind tag.
 * @returns     The styled string ready to write to stdout.
 */
export function styler(line: string, _kind: LineKind): string {
  return line;
}
