// Visual chrome for the popup render path — corner glyph, left rail,
// option bullets, and focus highlight. Decorates each styled line with
// a per-LineKind prefix that matches the @clack/prompts visual idiom
// the legacy popup path used, so users do not perceive a regression in
// popup appearance when the render-loop path becomes live.
//
// Chrome is applied AFTER styling so the styler's dev-only ESC-byte
// guard does not trip on the chrome prefix's ANSI codes. The result is
// a parallel array of decorated strings; computeLayout exposes both
// styledLines and chromedLines so consumers can pick the level they
// need (tests usually want unadorned styled; the interactive writeFrame
// writes the chromed version).
//
// Color policy: chrome glyphs always render (they are plain Unicode
// characters); only their colors gate on NO_COLOR + process.stdout.isTTY
// so the popup remains readable on accessibility-driven no-color setups
// and piped output stays clean of control sequences.

import type { LineEmission } from './render-loop.js';

/**
 * Maximum chrome prefix width across all per-LineKind rules. Used by
 * computeLayout to reserve room in the desc-base wrap budget so post-
 * chrome lines stay within `opts.cols` and the writeFrame cursor-rewind
 * count stays correct.
 *
 * Computed as the widest prefix below: option-label focused / not
 * focused (`│ ● ` / `│ ○ `, 4 columns) and desc-base sub-lines
 * (`│   `, 4 columns). All other prefixes are narrower.
 */
export const CHROME_MAX_PREFIX_WIDTH = 4;

/** Options passed to `applyChrome` per render call. */
export interface ChromeOptions {
  /** Index of the focused option in `RenderLoopOptions.options`. */
  focusedOptionIndex: number;
}

// SGR color constants — kept inline to avoid coupling the chrome module
// to the styler's picocolors instance. Each color wraps with an explicit
// foreground-reset (`\x1b[39m`) so the chrome color does not bleed into
// the trailing styled content.
const SGR_CYAN  = '\x1b[36m';
const SGR_GREEN = '\x1b[32m';
const SGR_GRAY  = '\x1b[90m';
const SGR_RESET_FG = '\x1b[39m';

/**
 * Returns true when the chrome layer should emit colors. Matches the
 * styler's NO_COLOR + isTTY gate so the two layers behave consistently
 * across pipe / non-TTY / accessibility-driven no-color setups.
 */
export function shouldChromeColor(): boolean {
  if (process.env['NO_COLOR'])    return false;
  if (!process.stdout.isTTY)      return false;
  return true;
}

function cyan(text: string):  string { return shouldChromeColor() ? SGR_CYAN  + text + SGR_RESET_FG : text; }
function green(text: string): string { return shouldChromeColor() ? SGR_GREEN + text + SGR_RESET_FG : text; }
function gray(text: string):  string { return shouldChromeColor() ? SGR_GRAY  + text + SGR_RESET_FG : text; }

/**
 * Compute the chrome prefix for a single emission given its context.
 *
 *   - first pinch-label emission   -> `◆ ` (cyan corner)
 *   - subsequent pinch-label rows  -> `│ ` (cyan rail) — covers subtitle case
 *   - question / popup-why-help / shortcut-hint -> `│ ` (cyan rail)
 *   - option-label, focused        -> `│ ● ` (cyan rail + green bullet)
 *   - option-label, not focused    -> `│ ○ ` (cyan rail + gray bullet)
 *   - option-label, isPadding=true -> `│ ` (separator row — rail only)
 *   - desc-base-truncated/expanded -> `│   ` (rail + 3-space indent that
 *                                       aligns desc-base text under the
 *                                       option-label bullet column)
 *   - unknown kind                 -> `│ ` (defensive fallback)
 *
 * Exported for unit testability; the typical caller is `applyChrome`.
 */
export function computeChromePrefix(
  e:                LineEmission,
  options:          ChromeOptions,
  seenFirstPinch:   boolean,
): string {
  switch (e.kind) {
    case 'page-header':
      // The page-header carries its own visual identity (e.g. the
      // `▲ NEXPATH CLI` wordmark + dim rule). Adding the cyan
      // `│` rail prefix would visually conflict with the header's
      // glyphs, so emit no chrome prefix for this kind.
      return '';
    case 'pinch-label':
      return seenFirstPinch ? cyan('│') + ' ' : cyan('◆') + ' ';
    case 'question':
    case 'popup-why-help':
    case 'shortcut-hint':
      return cyan('│') + ' ';
    case 'option-label':
      // computeLayout emits this kind ONLY for the focused option (the
      // separator-padding case is emitted with isPadding=true). The
      // focusedOptionIndex check is kept as a defensive fallback so
      // unit tests that synthesise option-label emissions with mismatched
      // indices still get a sensible prefix.
      if (e.isPadding) return cyan('│') + ' ';  // separator — rail only
      if (e.optionIndex === options.focusedOptionIndex) {
        return cyan('│') + ' ' + green('●') + ' ';
      }
      return cyan('│') + ' ' + gray('○') + ' ';
    case 'option-label-unfocused':
      // Non-focused option label — gray ○ bullet (matches the
      // pre-restoration option-label non-focused branch above). Kept as
      // a separate case so the styler can route this kind to pc.dim
      // without affecting the focused option's full-weight label.
      return cyan('│') + ' ' + gray('○') + ' ';
    case 'desc-base-truncated':
    case 'desc-base-expanded':
      return cyan('│') + '   ';  // rail + 3 spaces to align with bullet column
    default:
      return cyan('│') + ' ';
  }
}

/**
 * Decorate a parallel array of styled lines with per-LineKind chrome
 * prefixes. Returns a new array of decorated strings; length matches
 * the input arrays.
 *
 * The first pinch-label emission in the sequence gets the corner glyph
 * `◆`; subsequent pinch-label rows (typically the subtitle) get the
 * left rail glyph `│` for visual continuity.
 */
export function applyChrome(
  styledLines: readonly string[],
  emissions:   readonly LineEmission[],
  options:     ChromeOptions,
): string[] {
  const result: string[] = [];
  let seenFirstPinch = false;

  for (let i = 0; i < emissions.length; i++) {
    const e = emissions[i];
    const prefix = computeChromePrefix(e, options, seenFirstPinch);
    if (e.kind === 'pinch-label' && !seenFirstPinch) seenFirstPinch = true;
    result.push(prefix + styledLines[i]);
  }

  return result;
}
