// Structural line-kind tag used to label every emitted line of the
// decision-session popup. The layout MUST emit each LineKind as a SEPARATE
// element even when styling renders all kinds as plain text — keeping kinds
// separable is what lets the styling layer attach kind-specific formatting
// without re-parsing rendered output.
//
// Extensibility rule: if a new LineKind is added in a future change, both
// the layout and the styler must update together. The default styler
// behaviour for an unknown kind is to return the line unchanged (graceful
// fallback).
//
// Debug bypass: setting NEXPATH_STYLE_PASSTHROUGH=1 makes the styler
// return the input line unchanged regardless of LineKind. Useful for
// diagnosing whether a rendering bug is in layout (which shows even
// with bypass) or in styling (which disappears with bypass).
//
// Cross-terminal safeguards: the styler additionally honours the
// industry-standard NO_COLOR env-var (https://no-color.org) and skips
// ANSI emission when stdout is not a TTY (piped/redirected output).
// Either signal returns the input line unchanged. Combined with the
// debug bypass and the unknown-kind fallback, these three signals form
// an environment-adaptive no-styling fallback path.

import { createColors } from 'picocolors';

// Force-enabled picocolors instance — the styler's own safeguards
// (NEXPATH_STYLE_PASSTHROUGH bypass, NO_COLOR env-var, !isTTY) are the
// single source of truth for whether ANSI is emitted. The default
// picocolors instance auto-detects at module-load time and caches the
// decision, which collapses to identity functions in non-TTY workers
// even when the runtime environment is later mutated. createColors(true)
// keeps the formatter functions live so the safeguards above can decide
// each call independently.
const pc = createColors(true);

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
 * Env-var key for the styler-bypass diagnostic toggle. Set to the
 * value `'1'` to make the styler return its input unchanged regardless
 * of LineKind.
 */
export const STYLE_PASSTHROUGH_ENV = 'NEXPATH_STYLE_PASSTHROUGH';

/** Returns true when the styler-bypass env-var is currently set to `'1'`. */
export function isStylePassthroughActive(): boolean {
  return process.env[STYLE_PASSTHROUGH_ENV] === '1';
}

/**
 * Apply per-LineKind styling to a layout-emitted line.
 *
 * Layout has already done line-wrapping, truncation, padding, and `...`
 * marker insertion before calling this function — styler does NOT
 * re-truncate or re-wrap. ANSI escape codes are the styler's
 * responsibility; layout never emits them.
 *
 * Style mapping (hierarchical — option labels remain the visual anchor,
 * supporting content fades in subordinate steps):
 *   - popup-why-help     → gray (readable, subordinate to options)
 *   - desc-base-expanded → gray (focused detail is fully readable)
 *   - desc-base-truncated→ dim + gray (unfocused previews fade so the
 *                          user scans labels first)
 *   - shortcut-hint      → dim + italic (matches the existing
 *                          dim+italic precedent for hint text)
 *   - option-label       → inherit (existing option-label styling)
 *   - pinch-label        → inherit (existing pinch-label styling)
 *   - question           → inherit (plain reads naturally)
 *
 * Fallback signals (any one returns the input line unchanged):
 *   1. NEXPATH_STYLE_PASSTHROUGH=1 — diagnostic bypass.
 *   2. NO_COLOR env-var set — industry-standard accessibility / CI hook.
 *   3. process.stdout.isTTY falsy — piped or redirected output.
 *   4. Unknown LineKind — graceful fallback per extensibility rule.
 *
 * Double-styling guard (dev builds only): if the input line already
 * contains an ESC byte (\x1b), throw — surfaces a layout-leak where
 * ANSI escape codes were emitted before reaching the styler.
 *
 * Fallback ladder for the per-kind dispatch pattern (carried as
 * documentation only — code change deferred unless the primary
 * dispatch shape proves insufficient):
 *   - Fallback 1: descriptor objects {kind, text, focused?, position?}.
 *   - Fallback 2: style-tag markup `{style:dim}text{/style}`.
 *   - Fallback 3: inline ANSI directly in layout (degraded — accepts
 *     mixing layout + styling concerns).
 *   - Cross-cutting: route specific line-kinds through picocolors
 *     directly within this function as an internal implementation
 *     choice without changing the interface.
 *
 * @param line  The raw text content from the layout.
 * @param kind  The line-kind tag.
 * @returns     The styled string ready to write to stdout.
 */
export function styler(line: string, kind: LineKind): string {
  // Debug bypass — return raw layout output for diagnosis. Runs FIRST so
  // the bypass is honoured even when the dispatch body grows.
  if (isStylePassthroughActive()) return line;

  // Industry-standard NO_COLOR honoured (https://no-color.org).
  if (process.env['NO_COLOR']) return line;

  // Non-TTY output (pipe / redirect / CI) — skip ANSI emission.
  if (!process.stdout.isTTY) return line;

  // Dev-only double-styling guard. Layout must emit raw text; if an ESC
  // byte already slipped through, the styler would compound the ANSI and
  // mask the underlying layout leak.
  if (process.env['NODE_ENV'] !== 'production' && line.includes('\x1b')) {
    throw new Error(`styler received pre-styled input (kind=${kind}); layout must emit raw text only`);
  }

  switch (kind) {
    case 'popup-why-help':      return pc.gray(line);
    case 'desc-base-expanded':  return pc.gray(line);
    case 'desc-base-truncated': return pc.dim(pc.gray(line));
    case 'shortcut-hint':       return pc.dim(pc.italic(line));
    case 'option-label':
    case 'pinch-label':
    case 'question':
      return line;
    default:
      // Unknown kind — graceful fallback per the LineKind extensibility rule.
      return line;
  }
}
