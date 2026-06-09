// Custom popup render loop — Path A successor to the @clack/prompts.select()
// call inside the spawned TtySelectFn subprocess.
//
// Layered design:
//
//   - `computeLayout(opts, state)` is a PURE function. Given the popup inputs
//     and current focus/expand/scroll state, it returns the ordered list of
//     styled lines ready for stdout, along with parallel LineKind tags so
//     tests can assert structural invariants (separate-element emission per
//     dev-plan §11.11) without scraping styled output. No I/O, no readline.
//
//   - `renderLoop(opts)` is the INTERACTIVE wrapper. It owns a minimal
//     readline keypress loop for arrow-key focus + Enter/Esc handling,
//     re-renders via computeLayout on every state change, and resolves with
//     the SelectableItem the user picked. The Space-key D3 toggle is wired
//     via a small hook (registerKeyHandler) so the Bhavnesh Phase 6 task
//     adds the actual toggle body without restructuring this module.
//
// Vertical render order (dev-plan §11.2) — top to bottom:
//
//   pinch label                                        ┐
//   (optional subtitle)                                │ header pair (existing)
//   question line                                      ┘
//   why-help block (R4 open + content + mood + R4 close, multi-line)
//   [1 padding row — D4]
//   option-label
//     ↳ option desc-base (truncated/expanded — D1/D2/D5)
//   ... (repeat per option)
//   (focused option's shortcut hint — Bhavnesh task, hook only here)
//   [bottom OPTION_SEPARATOR padding rows — existing pattern preserved]
//
// LineKind separate-element invariant (dev-plan §11.11):
// every emitted line is its own LineKind-tagged element even when the
// pass-through styler renders them identically. Future R10 styling work
// depends on this separation.
//
// Dev-plan deviation note: §11.12 defines RenderLoopOptions with a single
// pre-composed `message: string` field. This implementation takes
// STRUCTURED inputs (pinchLabel / subtitle / question / whyHelpBlock)
// instead so the render layer can assign correct LineKind tags without
// fragile ANSI-prefix parsing. The caller composes the structured parts
// (existing buildSelectMessage in DecisionSession.ts gets a parallel
// helper for the structured shape; the legacy `message: string` builder
// stays in place for the unchanged sub-menu select() call sites).

import { emitKeypressEvents } from 'node:readline';
import type { LineKind } from './styler.js';
import { styler } from './styler.js';
import type { OptionEntry } from './options.js';
import { writeRenderDebug } from './render-telemetry.js';

// ── Public types ────────────────────────────────────────────────────────────

/**
 * A selectable item shown in the popup option list.
 *
 * Documented deviations from dev-plan §11.12 module-shape literal:
 *
 *   - `value: string` is ADDED here. The dev-plan literal omits it, but
 *     `renderLoop` resolves with the picked SelectableItem and callers
 *     need an identifier to map back to the originating OptionEntry /
 *     SHOW_SIMPLER / SKIP_NOW / HELP_LABEL sentinel. The label alone is
 *     not unique enough (duplicate option-texts across levels would
 *     collide).
 *
 *   - `descBase?: string` is OPTIONAL here. The dev-plan literal has
 *     it required. Meta items (SHOW_SIMPLER / SKIP_NOW / HELP_LABEL)
 *     and separators have no desc-base; making the field optional
 *     lets callers omit it cleanly without passing an empty string.
 */
export interface SelectableItem {
  /** Selection sentinel value returned when the user picks this item. */
  value:        string;
  /** Display label (the option text). */
  label:        string;
  /**
   * Desc-base content shown as a `↳`-prefixed sub-line under the option-label.
   * Empty / undefined skips the sub-line.
   */
  descBase?:    string;
  /** True for blank-row OPTION_SEPARATOR padding items. Layout emits a blank row, never receives focus. */
  isSeparator?: boolean;
  /** True for SHOW_SIMPLER / SKIP_NOW / HELP_LABEL meta items — no desc-base sub-line. */
  isMeta?:      boolean;
}

/** Inputs to the render loop — structured shape (deviation from dev-plan §11.12 literal). */
export interface RenderLoopOptions {
  /** Pinch label (`formatPinchLabel`-style — may already carry ANSI codes per legacy pattern). */
  pinchLabel:     string;
  /** Optional level subtitle. */
  subtitle?:      string;
  /** Question line text (may already carry ANSI codes per `formatQuestion`). */
  question:       string;
  /**
   * Pre-composed why-help block (R4 open + R6 content + optional R6 mood
   * sentence + R4 close — composed by `composeWhyHelpBlock` in DecisionSession.ts).
   * Multi-line allowed; each line emits as its own popup-why-help LineKind.
   * Undefined / empty: the whole why-help region is omitted and the D4
   * padding row still separates the question from the first option.
   */
  whyHelpBlock?:  string;
  /** Option list (already includes any bottom OPTION_SEPARATOR rows + meta entries). */
  options:        readonly SelectableItem[];
  /** Terminal rows. */
  rows:           number;
  /** Terminal columns. */
  cols:           number;
  /** Minimum maxItems floor — TtySelectFn precedent is 5. */
  maxItemsFloor?: number;
}

/** Current layout state — focus + per-option expand state + scroll offset. */
export interface LayoutState {
  /** Index into `options` of the focused item. */
  focusedIndex:    number;
  /** Indices of options currently in the expanded desc-base state (D3 toggle). */
  expandedOptions: ReadonlySet<number>;
  /** Top-of-viewport row offset for auto-scrolling (D5). 0 = no scroll. */
  scrollOffset:    number;
}

/** Single emitted line with its LineKind tag + the index of the option it belongs to (or null for header/padding rows). */
export interface LineEmission {
  kind:        LineKind;
  text:        string;
  /** Index into `options` if this line is part of an option's render block; null for header / padding / why-help. */
  optionIndex: number | null;
  /** True when this row is a blank padding/separator row. Styler is still called for uniform dispatch. */
  isPadding:   boolean;
}

/** Output of `computeLayout` — ordered list of emissions + post-styler lines + per-option line ranges + budget metadata + viewport. */
export interface RenderedLayout {
  /** Raw per-line emissions including LineKind tags. */
  emissions:        readonly LineEmission[];
  /** Per-line styled output (parallel to emissions). What goes to stdout WHEN no viewport clipping is applied. */
  styledLines:      readonly string[];
  /** Per-option visible-range map — startIdx/endIdx into emissions for each option's lines. */
  optionLineRanges: readonly { startIdx: number; endIdx: number; itemIndex: number }[];
  /**
   * Budget metadata adapted from the TtySelectFn.ts:72-92 precedent.
   * Phase 4 USER deliverable per dev-plan §11.4 / §11.8 step 2 / §11.12.
   *
   *   fixedLines : count of header / why-help / D4-padding rows above the option list
   *   avail      : rows - fixedLines - 2 (clamped to 0)
   *   maxItems   : how many options fit in `avail`, with the
   *                opts.maxItemsFloor (default 5) applied as a minimum
   *   fittedItems: raw fitted count BEFORE the floor (informational; lets
   *                the interactive shell decide whether to scroll)
   */
  budget: {
    fixedLines:  number;
    avail:       number;
    maxItems:    number;
    fittedItems: number;
  };
  /**
   * Auto-scroll viewport — what's actually visible after applying
   * `state.scrollOffset` plus any auto-adjustment to keep the focused
   * option (+ its expanded body) inside the visible band per §11.7
   * step 5 + §11.9 step 5. The interactive renderLoop writes
   * `visibleStyledLines` to stdout (not `styledLines`).
   *
   *   appliedScrollOffset : the scrollOffset actually used after
   *                         auto-adjustment (may differ from
   *                         state.scrollOffset when focus forced a shift)
   *   totalOptionRows     : total emission row count across all options
   *                         (informational; lets the shell decide if
   *                         scrolling is needed at all)
   *   visibleStyledLines  : styled lines to write to stdout — header
   *                         rows always included; option rows clipped
   *                         to the viewport window
   */
  viewport: {
    appliedScrollOffset: number;
    totalOptionRows:     number;
    visibleStyledLines:  readonly string[];
  };
}

// ── Locked constants (dev-plan §11.5 / §11.6 / §11.8 / §11.9 / R1.1-Sub1.4) ─

/** D1 — visible line cap for the truncated desc-base state. */
export const D1_TRUNCATED_LINE_CAP = 2;

/** D5 — hard truncate cap for the expanded desc-base state. */
export const D5_EXPANDED_LINE_CAP = 8;

/** D4 — number of blank rows between the why-help block and the first option. */
export const D4_PADDING_ROW_COUNT = 1;

/** D2 — truncation marker appended when content overflows the active cap. */
export const D2_TRUNCATION_MARKER = '...';

/** R1.1-Sub1.4 Variant A — desc-base sub-line prefix glyph. */
export const SUB_LINE_PREFIX = '↳ ';

/** Continuation-line indent for wrapped desc-base content (visually aligned under the `↳` glyph). */
export const SUB_LINE_CONTINUATION_INDENT = '  ';

/** Default minimum maxItems floor — matches TtySelectFn precedent. */
export const DEFAULT_MAX_ITEMS_FLOOR = 5;

/**
 * Minimum effective expanded cap. If the secondary cap drops below this
 * (terminal too short to fit a meaningful expansion plus the surrounding
 * option-list context), the layout refuses to expand and silently falls
 * back to the truncated D1 cap. Surfaced via the
 * `whyhelp_expand_skipped_too_short` telemetry event.
 */
export const D5_MIN_EFFECTIVE_CAP = 2;

/**
 * Compute the effective expanded cap for the desc-base. Applies the
 * secondary cap `min(D5_EXPANDED_LINE_CAP, max(0, avail - 5))` so at
 * least 5 other rows remain visible in the option region. Returns 0
 * when the terminal is too short for any expansion — callers compare
 * against `D5_MIN_EFFECTIVE_CAP` to decide whether to refuse the
 * expansion and stay in the truncated state.
 */
export function effectiveExpandedCap(avail: number): number {
  return Math.min(D5_EXPANDED_LINE_CAP, Math.max(0, avail - 5));
}

/**
 * Locked shortcut-hint wording per dev-plan §13.5 + §13.10 + §14.2
 * (user pick W5, locked 2026-06-07). Single canonical constant —
 * the Space key toggles desc-base detail regardless of the current
 * truncated/expanded direction, so the wording stays static across
 * states. Tests assert against this constant as the single source
 * of truth (catches render leaks + accidental wording changes).
 */
export const SHORTCUT_HINT_TEXT = 'press Space to toggle details' as const;

// ── OptionGenerator → SelectableItem bridge (§11.15) ────────────────────────

/**
 * Convert a list of OptionEntry records (the post-R5 + R4 substitution
 * output of OptionGenerator / runtime-substitutions) into the
 * SelectableItem shape `renderLoop` consumes — one SelectableItem per
 * OptionEntry per dev-plan §11.15 wiring contract.
 *
 *   - SelectableItem.value    ← OptionEntry.option (the prompt text;
 *                                doubles as the selection sentinel)
 *   - SelectableItem.label    ← OptionEntry.option
 *   - SelectableItem.descBase ← OptionEntry.descBase
 *
 * Meta items (SHOW_SIMPLER / SKIP_NOW / HELP_LABEL) and OPTION_SEPARATOR
 * blanks are NOT produced here — they live outside the OptionEntry data
 * model. Callers compose the final SelectableItem[] by concatenating
 * this helper's output with the meta items in the order the popup
 * needs them.
 */
export function optionEntriesToSelectableItems(entries: readonly OptionEntry[]): SelectableItem[] {
  return entries.map((e) => ({ value: e.option, label: e.option, descBase: e.descBase }));
}

// ── Wrapping + truncation helpers (D1 / D2 / D5) ────────────────────────────

/**
 * Word-wrap a single line of plain text to the given visual width.
 *
 * Phase 4 USER basic: counts characters, ignores ANSI escape sequences for
 * visual-width computation (desc-bases don't usually carry ANSI after the
 * R5 + R4 substitutions). Phase 8 Bhavnesh polish handles ANSI-aware
 * width measurement when the styler body grows real ANSI mappings.
 *
 * Exported for unit testability.
 */
export function wrapLine(text: string, width: number): string[] {
  if (width <= 0 || text.length <= width) return [text];
  const out:   string[] = [];
  const words = text.split(/(\s+)/);  // preserve whitespace runs as tokens
  let current = '';
  for (const w of words) {
    if (current.length + w.length <= width) {
      current += w;
      continue;
    }
    if (current.length > 0) {
      out.push(current);
      current = '';
    }
    if (w.length > width) {
      // Hard-break a token longer than the width.
      for (let i = 0; i < w.length; i += width) out.push(w.substring(i, i + width));
    } else {
      current = w;
    }
  }
  if (current.length > 0) out.push(current);
  return out.length > 0 ? out : [''];
}

/**
 * Word-wrap arbitrary text (may contain embedded newlines) and apply a
 * line cap with the D2 truncation marker. Used by both D1 (truncated
 * desc-base, cap=2) and D5 (expanded desc-base, cap=8).
 *
 * Returns the wrapped lines, with `...` appended to the last visible
 * line ONLY when the source overflowed the cap (per dev-plan §11.6 — no
 * marker when content fits naturally).
 *
 * Exported for unit testability.
 */
export function wrapAndCap(
  text:   string,
  width:  number,
  cap:    number,
  marker: string,
): { lines: readonly string[]; didTruncate: boolean } {
  const sourceLines = text.split('\n');
  const wrapped:     string[] = [];
  for (const ln of sourceLines) {
    for (const w of wrapLine(ln, width)) wrapped.push(w);
  }
  if (wrapped.length <= cap) return { lines: wrapped, didTruncate: false };

  // Overflow — keep the first `cap` lines and append marker to the last visible line.
  const kept = wrapped.slice(0, cap);
  const last = kept[kept.length - 1];

  // If appending the marker would overflow the width, drop characters from
  // the END of the last line so `last + marker` fits inside width.
  const room = width - marker.length;
  let trimmed = last;
  if (last.length > room) {
    // Prefer trimming at a word boundary when room > 0; else hard-cut.
    trimmed = last.substring(0, Math.max(0, room));
  }
  kept[kept.length - 1] = trimmed + marker;
  return { lines: kept, didTruncate: true };
}

/**
 * Render a desc-base for one option as the `↳`-prefixed sub-line block —
 * applies wrapping at terminal width, applies the active line cap (D1 for
 * truncated state, D5 for expanded state), appends the D2 `...` marker on
 * overflow, and returns one entry per wrapped line so each line emits as
 * a separate LineKind element per §11.11.
 *
 * Exported for unit testability.
 */
export function renderDescBaseSubLines(
  descBase: string,
  cols:     number,
  cap:      number,
): readonly string[] {
  // First-line prefix consumes SUB_LINE_PREFIX.length visual cols.
  const prefixCols = SUB_LINE_PREFIX.length;
  const bodyWidth  = Math.max(1, cols - prefixCols);

  const { lines } = wrapAndCap(descBase, bodyWidth, cap, D2_TRUNCATION_MARKER);
  if (lines.length === 0) return [];

  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(i === 0 ? `${SUB_LINE_PREFIX}${lines[i]}` : `${SUB_LINE_CONTINUATION_INDENT}${lines[i]}`);
  }
  return out;
}

// ── Pure layout computation ─────────────────────────────────────────────────

/**
 * Build the ordered list of line emissions for the popup, applying every
 * dev-plan §11 layout rule (vertical order, LineKind separate-element
 * invariant, D1/D2/D4/D5 truncation + padding, styler dispatch). Returns
 * structural metadata alongside the styled lines so tests can assert
 * invariants without scraping the styled output.
 *
 * Per §11.2 the layout iterates:
 *
 *   1. pinch-label    — one emission
 *   2. (subtitle)     — one emission with pinch-label kind (no subtitle-specific kind in §11.10)
 *   3. question       — one emission
 *   4. why-help block — one emission per line
 *   5. D4 padding     — one blank row (popup-why-help kind, isPadding=true)
 *   6. per-option:
 *        option-label     — one emission
 *        desc-base sub-line(s) — D1 / D5 truncated, with `↳` prefix on first line + `...` marker on overflow
 *   7. (caller appends any bottom OPTION_SEPARATOR / meta rows via `options`)
 *
 * D1/D2/D5 are filled in by sub-batch 4b/4d; the 4a skeleton emits each
 * option's desc-base as a single un-truncated line so the structural
 * surface is in place for the truncation work to plug into.
 */
export function computeLayout(opts: RenderLoopOptions, state: LayoutState): RenderedLayout {
  const emissions: LineEmission[] = [];

  // ── Pre-compute fixedLines + avail (needed before the option loop so
  //    the per-option desc-base cap can apply the secondary terminal-
  //    size cap deterministically — D5 edge case (c)). The earlier
  //    inline emission-filter recount is preserved below as a defensive
  //    cross-check.
  let preFixedLines = 2;  // pinch-label + question (always emitted)
  if (opts.subtitle && opts.subtitle.length > 0) preFixedLines += 1;
  if (opts.whyHelpBlock && opts.whyHelpBlock.length > 0) {
    preFixedLines += opts.whyHelpBlock.split('\n').length;
  }
  preFixedLines += D4_PADDING_ROW_COUNT;
  const preAvail        = Math.max(0, opts.rows - preFixedLines - 2);
  const preExpandedCap  = effectiveExpandedCap(preAvail);
  const expansionAllowed = preExpandedCap >= D5_MIN_EFFECTIVE_CAP;

  // ── Header pair ────────────────────────────────────────────────────────────
  emissions.push({ kind: 'pinch-label', text: opts.pinchLabel, optionIndex: null, isPadding: false });

  if (opts.subtitle && opts.subtitle.length > 0) {
    // No separate subtitle LineKind exists in §11.10 — emit under pinch-label
    // since the subtitle is part of the header pair.
    emissions.push({ kind: 'pinch-label', text: opts.subtitle, optionIndex: null, isPadding: false });
  }

  emissions.push({ kind: 'question', text: opts.question, optionIndex: null, isPadding: false });

  // ── Why-help block ─────────────────────────────────────────────────────────
  // Each line of the composed why-help block emits as a SEPARATE popup-why-help
  // LineKind element (dev-plan §11.11 load-bearing separate-element invariant).
  if (opts.whyHelpBlock && opts.whyHelpBlock.length > 0) {
    const lines = opts.whyHelpBlock.split('\n');
    for (const ln of lines) {
      emissions.push({ kind: 'popup-why-help', text: ln, optionIndex: null, isPadding: false });
    }
  }

  // ── D4 padding row(s) between why-help and first option ────────────────────
  //
  // Documented deviation from dev-plan §11.3 C4 + §11.8 step 4: those
  // sections prescribe prepending a blank-separator item to clackOptions
  // (per the existing OPTION_SEPARATOR convention) specifically because
  // appending a `\n` to TtySelectFn's `message` string would silently
  // shift its `_msgLineCount` and break the `_avail` budget math.
  //
  // This render-loop module doesn't share that budget plumbing — it
  // counts ALL header / why-help / D4 padding rows uniformly under
  // `_fixedLines` (the budget-computation pass below counts emissions
  // with optionIndex === null), so the mechanism choice is purely
  // structural rather than budget-load-bearing. Keeping the padding as
  // an `isPadding: true` emission (with `optionIndex: null` so it
  // counts as a fixed header row, not an option row) preserves the
  // §11.11 separate-element invariant and removes the need to
  // synthesise an OPTION_SEPARATOR-shape item just for spacing.
  for (let p = 0; p < D4_PADDING_ROW_COUNT; p++) {
    // Padding row carries no semantic content — emitted as a blank popup-why-help
    // line so dispatch is uniform (styler is still called) without inventing a
    // new "padding" LineKind.
    emissions.push({ kind: 'popup-why-help', text: '', optionIndex: null, isPadding: true });
  }

  // ── Option list ────────────────────────────────────────────────────────────
  const optionLineRanges: { startIdx: number; endIdx: number; itemIndex: number }[] = [];
  for (let i = 0; i < opts.options.length; i++) {
    const item     = opts.options[i];
    const startIdx = emissions.length;

    if (item.isSeparator) {
      // Blank padding row, no LineKind-specific styling.
      emissions.push({ kind: 'option-label', text: '', optionIndex: i, isPadding: true });
    } else {
      // option-label line.
      emissions.push({ kind: 'option-label', text: item.label, optionIndex: i, isPadding: false });

      // desc-base sub-line — only for non-meta items with descBase content.
      // Wrap at terminal width, apply D1 cap (truncated) or D5 cap
      // (expanded), append D2 `...` marker on overflow. Each wrapped line
      // emits as a SEPARATE element with the same LineKind so §11.11
      // separate-element invariant holds at the per-line granularity.
      const requestedExpanded = state.expandedOptions.has(i);
      // D5 edge case (c): when the terminal is too short for the secondary
      // cap to leave at least D5_MIN_EFFECTIVE_CAP rows of body, refuse the
      // expansion and silently fall back to the truncated state. The
      // refusal is surfaced via the whyhelp_expand_skipped_too_short
      // telemetry event below.
      const isExpanded = requestedExpanded && expansionAllowed;
      if (!item.isMeta && item.descBase && item.descBase.length > 0) {
        const cap      = isExpanded ? preExpandedCap : D1_TRUNCATED_LINE_CAP;
        const kind     = isExpanded ? 'desc-base-expanded' : 'desc-base-truncated';
        const subLines = renderDescBaseSubLines(item.descBase, opts.cols, cap);
        for (const ln of subLines) {
          emissions.push({ kind, text: ln, optionIndex: i, isPadding: false });
        }
        // Refusal surface — emit once per refused-expansion so external
        // observability can count occurrences. Only fires when the user
        // requested expansion (state.expandedOptions had the index) but
        // the terminal was too short to honour it.
        if (requestedExpanded && !isExpanded) {
          writeRenderDebug({
            event:       'whyhelp_expand_skipped_too_short',
            optionIndex: i,
            availBudget: preAvail,
            secondaryCap: preExpandedCap,
            minRequired: D5_MIN_EFFECTIVE_CAP,
          });
        }
      }

      // Shortcut hint — emitted ONLY under the currently focused option,
      // and only when the focused option carries a desc-base (no hint for
      // meta items or items without descBase content). Single locked
      // wording per §13.5 W5 lock — the Space key toggles regardless of
      // current direction so the hint text is state-agnostic.
      // Placement: inline-below-focused-option per §11.2 Gap 4 fix.
      if (i === state.focusedIndex && !item.isMeta && item.descBase && item.descBase.length > 0) {
        emissions.push({
          kind:        'shortcut-hint',
          text:        SHORTCUT_HINT_TEXT,
          optionIndex: i,
          isPadding:   false,
        });
      }
    }

    optionLineRanges.push({ startIdx, endIdx: emissions.length, itemIndex: i });
  }

  // ── Styler dispatch (D6) ───────────────────────────────────────────────────
  // Every emitted line passes through styler(text, kind). Pass-through today
  // (Phase 1 styler returns input unchanged); Bhavnesh R10 work replaces the
  // body with per-kind ANSI mapping. The dispatch site stays the same.
  const styledLines = emissions.map((e) => styler(e.text, e.kind));

  // ── Budget computation (§11.4 / §11.8 / §11.12) ────────────────────────────
  // Adapt the TtySelectFn.ts:72-92 precedent — header rows count as
  // _fixedLines; remaining rows minus a 2-line gutter is _avail;
  // _maxItems is the count of options whose total emission cost fits
  // within _avail, bumped up to the maxItemsFloor (default 5) so the
  // popup always tries to render at least that many.
  const fixedLines = emissions.filter((e) => e.optionIndex === null).length;
  const avail      = Math.max(0, opts.rows - fixedLines - 2);

  let budget = 0;
  let fittedItems = 0;
  for (const range of optionLineRanges) {
    const cost = range.endIdx - range.startIdx;
    if (budget + cost > avail) break;
    budget += cost;
    fittedItems++;
  }
  const floor    = opts.maxItemsFloor ?? DEFAULT_MAX_ITEMS_FLOOR;
  const maxItems = Math.max(fittedItems, floor);

  // ── Viewport / auto-scroll (§11.7 step 5 + §11.9 step 5) ──────────────────
  // Header emissions always render; option emissions are the scrolled band.
  // Determine where the option region starts in the emissions array.
  const optionRegionStart = emissions.findIndex((e) => e.optionIndex !== null);
  const headerEnd         = optionRegionStart === -1 ? emissions.length : optionRegionStart;
  const totalOptionRows   = emissions.length - headerEnd;

  // Focused-option emission range within the OPTION REGION (offset from headerEnd).
  // Find the optionLineRange whose itemIndex matches state.focusedIndex.
  const focusedRange   = optionLineRanges.find((r) => r.itemIndex === state.focusedIndex);
  const focusedStartOR = focusedRange ? focusedRange.startIdx - headerEnd : 0;
  const focusedEndOR   = focusedRange ? focusedRange.endIdx   - headerEnd : 0;

  // Auto-adjust scrollOffset so the focused option's emissions stay
  // inside [scroll, scroll + avail]. Clamp to non-negative + to
  // `max(0, totalOptionRows - avail)` so we never scroll past the end.
  let appliedScrollOffset = Math.max(0, state.scrollOffset);
  if (focusedRange) {
    if (focusedEndOR > appliedScrollOffset + avail) {
      appliedScrollOffset = Math.max(0, focusedEndOR - avail);
    }
    if (focusedStartOR < appliedScrollOffset) {
      appliedScrollOffset = focusedStartOR;
    }
  }
  const maxScroll = Math.max(0, totalOptionRows - avail);
  if (appliedScrollOffset > maxScroll) appliedScrollOffset = maxScroll;

  // Build the visible styled lines: header (always) + windowed option rows.
  const headerStyled = styledLines.slice(0, headerEnd);
  const optionStyled = styledLines.slice(headerEnd);
  const windowed     = optionStyled.slice(appliedScrollOffset, appliedScrollOffset + avail);
  const visibleStyledLines: readonly string[] = [...headerStyled, ...windowed];

  return {
    emissions,
    styledLines,
    optionLineRanges,
    budget:   { fixedLines, avail, maxItems, fittedItems },
    viewport: { appliedScrollOffset, totalOptionRows, visibleStyledLines },
  };
}

// ── Interactive shell ──────────────────────────────────────────────────────

/** Canonical key-event names produced by `eventsFromReadline` + accepted by `renderLoop`. */
export type KeyEventName =
  | 'arrow-up'
  | 'arrow-down'
  | 'enter'
  | 'escape'
  | 'space'
  | 'tab'
  | 'ctrl-c'
  | 'other';

/** Single key event delivered to the render loop. */
export interface KeyEvent {
  name: KeyEventName;
  /** Raw input string from readline keypress — preserved for diagnostics. */
  raw?: string;
}

/** Interactive renderLoop options. Distinct from the layout-only RenderLoopOptions. */
export interface RenderLoopRunOptions {
  /** Pure-layout inputs (forwarded to computeLayout). */
  layout:      RenderLoopOptions;
  /** Output stream to write styled lines to. Defaults to `process.stdout`. */
  out?:        NodeJS.WritableStream;
  /** Async iterable of keypress events. Caller wires readline (or a mock in tests). */
  keyEvents:   AsyncIterable<KeyEvent>;
  /**
   * D3 Space-key handler. Default flips the focused option's index in
   * `state.expandedOptions` — adds when not present, removes when present.
   * Returns the original state unchanged when the focused item is a
   * separator, a meta item, or carries no desc-base content (nothing to
   * expand). Callers can override to add custom toggle behaviour.
   */
  onSpace?:    (state: LayoutState, focusedItem: SelectableItem | undefined) => LayoutState;
  /**
   * Optional structured-telemetry sink. Called by the render loop after
   * each state-changing key event with a stable event name + payload.
   * Render-loop has no projectRoot context, so callers wire this to
   * writeTelemetry (or similar) with their own context. No-op when
   * omitted.
   */
  telemetryHook?: (event: string, payload: Record<string, unknown>) => void;
}

/**
 * Default D3 Space hook — toggles the focused option's index in
 * `state.expandedOptions`. Returns the original state unchanged when
 * the focused item has nothing to expand (separator, meta, or missing
 * desc-base content).
 *
 * The terminal-size precondition (D5 edge case (c) — refuse to expand
 * when avail-5 is below D5_MIN_EFFECTIVE_CAP) is enforced inside
 * computeLayout, NOT here. This keeps the hook decoupled from layout
 * dimensions so it can be invoked without the full RenderLoopOptions
 * context.
 */
function defaultOnSpace(state: LayoutState, focusedItem: SelectableItem | undefined): LayoutState {
  if (!focusedItem || focusedItem.isSeparator || focusedItem.isMeta) return state;
  if (!focusedItem.descBase || focusedItem.descBase.length === 0)    return state;

  const next = new Set(state.expandedOptions);
  if (next.has(state.focusedIndex)) next.delete(state.focusedIndex);
  else                              next.add(state.focusedIndex);
  return { ...state, expandedOptions: next };
}

/** Advance focus while skipping isSeparator items (R2 C1 + existing pattern). */
function moveFocus(options: readonly SelectableItem[], current: number, delta: 1 | -1): number {
  const n = options.length;
  if (n === 0) return current;
  let next = current;
  for (let step = 0; step < n; step++) {
    next = (next + delta + n) % n;
    if (!options[next].isSeparator) return next;
  }
  return current;  // every item is a separator (degenerate; keep focus put)
}

/**
 * Minimal interactive render-loop shell — drives the popup via keypress
 * events from the caller. Resolves with the SelectableItem the user
 * selected (Enter), or `null` if the user cancelled (Escape / Ctrl+C).
 *
 * The interactive shell is intentionally thin: arrow-up / arrow-down
 * move focus (skipping isSeparator items); Enter resolves; Escape /
 * Ctrl+C resolves with null; Space dispatches to `onSpace` (Bhavnesh
 * Phase 6 D3 binding fills in the body); every other key is ignored.
 *
 * Re-renders the full layout to `out` after every state change. The
 * Phase 4 USER basic render writes each styled line followed by `\n`;
 * Bhavnesh Phase 8 polish adds the cursor-positioning + clear-screen
 * sequences and the auto-scroll edge cases.
 */
export async function renderLoop(opts: RenderLoopRunOptions): Promise<SelectableItem | null> {
  const out      = opts.out ?? process.stdout;
  const onSpace  = opts.onSpace ?? defaultOnSpace;

  // Find initial focus — first non-separator option.
  let initialFocus = 0;
  for (let i = 0; i < opts.layout.options.length; i++) {
    if (!opts.layout.options[i].isSeparator) { initialFocus = i; break; }
  }

  let state: LayoutState = {
    focusedIndex:    initialFocus,
    expandedOptions: new Set<number>(),
    scrollOffset:    0,
  };

  const writeFrame = () => {
    const layout = computeLayout(opts.layout, state);
    // Persist the auto-adjusted scroll offset back into state so subsequent
    // events (focus moves, expand toggles) start from the correctly
    // scrolled viewport rather than a stale state.scrollOffset value.
    if (layout.viewport.appliedScrollOffset !== state.scrollOffset) {
      state = { ...state, scrollOffset: layout.viewport.appliedScrollOffset };
    }
    for (const line of layout.viewport.visibleStyledLines) {
      out.write(line);
      out.write('\n');
    }
  };

  writeFrame();

  for await (const ev of opts.keyEvents) {
    switch (ev.name) {
      case 'arrow-up':
        state = { ...state, focusedIndex: moveFocus(opts.layout.options, state.focusedIndex, -1) };
        break;
      case 'arrow-down':
        state = { ...state, focusedIndex: moveFocus(opts.layout.options, state.focusedIndex,  1) };
        break;
      case 'space': {
        const focusedItem  = opts.layout.options[state.focusedIndex];
        const prevExpanded = state.expandedOptions.has(state.focusedIndex);
        const prevFocus    = state.focusedIndex;
        state = onSpace(state, focusedItem);

        // Recompute layout to populate the telemetry payload with the
        // post-toggle budget + focused-option range. Cheap (pure function;
        // the same recompute happens inside writeFrame() below).
        const layout         = computeLayout(opts.layout, state);
        const nowExpanded    = state.expandedOptions.has(state.focusedIndex);
        const focusedRange   = layout.optionLineRanges.find((r) => r.itemIndex === state.focusedIndex);
        const expandedHeight = focusedRange ? focusedRange.endIdx - focusedRange.startIdx : 0;
        const finalCap       = nowExpanded
          ? effectiveExpandedCap(layout.budget.avail)
          : D1_TRUNCATED_LINE_CAP;
        const descLineCount  = focusedItem?.descBase ? focusedItem.descBase.split('\n').length : 0;

        const payload = {
          optionIndex:    state.focusedIndex,
          descLineCount,
          expandedHeight,
          availBudget:    layout.budget.avail,
          finalCap,
          didTruncate:    expandedHeight > finalCap + 1,
          focusRetained:  state.focusedIndex === prevFocus,
          prevExpanded,
          nowExpanded,
        };
        writeRenderDebug({ event: 'whyhelp_expand_toggled', ...payload });
        opts.telemetryHook?.('whyhelp_expand_toggled', payload);
        break;
      }
      case 'enter': {
        const picked = opts.layout.options[state.focusedIndex];
        if (picked && !picked.isSeparator) return picked;
        break;
      }
      case 'escape':
      case 'ctrl-c':
        return null;
      // 'tab' / 'other' — ignored.
    }
    writeFrame();
  }

  // Iterator exhausted without a terminal event — treat as cancel.
  return null;
}

/**
 * Normalise a Node readline keypress into a KeyEvent. Exported for test
 * parity with the production wiring.
 */
export function normaliseKeypress(
  ch:  string | undefined,
  key: { name?: string; sequence?: string; ctrl?: boolean } | undefined,
): KeyEvent {
  const seq = key?.sequence ?? ch ?? '';
  if (key?.name === 'up')                            return { name: 'arrow-up',   raw: seq };
  if (key?.name === 'down')                          return { name: 'arrow-down', raw: seq };
  if (key?.name === 'return' || seq === '\r' || seq === '\n') return { name: 'enter',  raw: seq };
  if (key?.name === 'escape' || seq === '\x1b')      return { name: 'escape',     raw: seq };
  if (key?.ctrl && key?.name === 'c')                return { name: 'ctrl-c',     raw: seq };
  if (key?.name === 'space' || seq === ' ')          return { name: 'space',      raw: seq };
  if (key?.name === 'tab' || seq === '\t')           return { name: 'tab',        raw: seq };
  return { name: 'other', raw: seq };
}

/**
 * Build an async-iterable of KeyEvents from a Node ReadableStream
 * (typically `process.stdin` inside the subprocess script). Wires
 * `readline.emitKeypressEvents` and pushes normalised events through
 * a queue with backpressure-aware waiters.
 *
 * Returns the iterable + a cancel() function the caller invokes on
 * cleanup to stop emitting.
 */
export function eventsFromReadline(
  input: NodeJS.ReadableStream,
): { events: AsyncIterable<KeyEvent>; cancel: () => void } {
  const queue:   KeyEvent[] = [];
  const waiters: Array<(v: IteratorResult<KeyEvent>) => void> = [];
  let cancelled = false;

  emitKeypressEvents(input);
  const onKey = (ch: string | undefined, key: { name?: string; sequence?: string; ctrl?: boolean } | undefined) => {
    if (cancelled) return;
    const event = normaliseKeypress(ch, key);
    const w     = waiters.shift();
    if (w) w({ value: event, done: false });
    else queue.push(event);
  };
  input.on('keypress', onKey);

  const events: AsyncIterable<KeyEvent> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<KeyEvent>> {
          if (cancelled)         return Promise.resolve({ value: undefined as unknown as KeyEvent, done: true });
          if (queue.length > 0)  return Promise.resolve({ value: queue.shift()!, done: false });
          return new Promise<IteratorResult<KeyEvent>>((resolve) => waiters.push(resolve));
        },
      };
    },
  };

  const cancel = () => {
    cancelled = true;
    input.off('keypress', onKey);
    while (waiters.length > 0) {
      const w = waiters.shift();
      if (w) w({ value: undefined as unknown as KeyEvent, done: true });
    }
  };

  return { events, cancel };
}
