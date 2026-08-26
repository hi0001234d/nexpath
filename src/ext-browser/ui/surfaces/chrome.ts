// ============================================================================
// nexpath CLI frame — shared chrome.
// ----------------------------------------------------------------------------
// Sub-phases D2.1, D2.5 and D2.6 of the CLI-parity static UI plan: the frame's
// layout skeleton, the C-2 invariants that keep it usable at any content length,
// and the C-3 compatibility floor.
//
// D2.1 and D2.5 are the same CSS rules and cannot be written apart — the plan
// requires the C-2 invariants "from the start, not retrofitted" — and D2.6 is the
// test that pins them, which belongs with the rule it pins.
//
// WHY A SECOND STYLE NODE. `dock.ts` already injects one for the dock's own
// buttons. That is browser-only window furniture; this is the CLI frame. Two
// style nodes in one shadow root is fine, and keeping them apart means the
// window chrome and the frame can change without touching each other.
//
// THREE HEX VALUES ARE REPEATED IN `dock.ts`, DELIBERATELY. `#310823`, `#2cc7dd`
// and `#f5f5f4` appear in both files: the dock's buttons are drawn in the same
// palette so they do not look bolted on. Hoisting them into a shared module is
// the obvious tidy-up and is wrong here — `chrome.ts` already imports `dock.ts`
// for the header clearance, so a palette both files imported would either add a
// third module for three values or turn a one-way dependency into a cycle. The
// "written once" rule this file follows applies across the five SURFACE modules,
// which is where repetition would actually multiply; across this one deliberate
// boundary, three literals are the cheaper price.
//
// AUTHORING STANDARD (C-1), copied from `ui/panel.js`: one template string, no
// external stylesheet and no `<link>`, `np-` on every class, literal values with
// zero CSS variables. This module owns the shared skeleton; each surface module
// (D3/D4) contributes only its own delta, which is what keeps the values written
// once across five surfaces.
//
// ── D2.4 — the second chrome variant ────────────────────────────────────────
// The CLI has two chromes, so this module has two. Variant A is the
// `◆ NEXPATH CLI · <surface>` frame the four prompt-enhancement surfaces use.
// Variant B is the render-loop chrome behind the advisory decision session and
// the satisfaction feedback popup, and it differs in four concrete ways — read
// out of `decision-session/DecisionSession.ts:72-77` and
// `decision-session/render-loop-chrome.ts:63-120`, not inferred:
//
//   1. The header is `▲  NEXPATH CLI` — two spaces, a cyan triangle and a
//      full-weight wordmark — and it carries NO rail. The CLI says why: the
//      header "carries its own visual identity" and a rail prefix "would
//      visually conflict with the header's glyphs".
//   2. Its rule is a FIXED 24 characters, not the header's own width.
//   3. The pinch label is its own line, prefixed `◆ ` where the rail would
//      otherwise be. Only the FIRST pinch row gets the corner; a following
//      subtitle row falls back to the rail.
//   4. Description rows indent by three columns after the rail, not four.
//
// Everything else — question, why-help, hints, option bullets, footer — uses the
// same rail and the same tones as variant A, so only the pieces above are new.
// ============================================================================
//
// ── D2.2 — the SGR-to-CSS mapping ───────────────────────────────────────────
// The CLI renderers style every line with one of ten tones — cyan, bold, dim,
// plain, gray, green, yellow, lightYellow, paleYellow, and the 256-colour
// 38;5;252 used for a focused description. This is the whole table,
// read out of `cli-submit-popup.ts:719-840` and `cli-mps-popup.ts` rather than
// guessed:
//
//   header            cyan + bold        rule              dim
//   pinch label       bold (no colour)   trust cue         plain
//   why-help          gray               provider failure  yellow
//   focused bullet    green              unfocused bullet  gray
//   focused label     bold               unfocused label   dim
//   field content     plain              hint              lightYellow
//   Cancel row        paleYellow         footer            dim
//   rail              cyan               focused desc      38;5;252
//
// ONE SGR, ONE VALUE. `panel.js` renders the CLI's single `gray` as two different
// hexes (`#9ba7a7` for why-help, `#7d8686` for bullets and descriptions). That is
// a panel inconsistency, not a CLI distinction, and reproducing it would make the
// table above a lie. Each tone below appears exactly once. The panel's four-tier
// fade still holds under that rule — 16.18 : 11.45 : 7.49 : 7.13 against the
// frame ground, still strictly descending, so the eye still walks focused label →
// focused description → unfocused label → unfocused description.
//
// THREE PLACES THE PANEL DEVIATED FROM THE CLI, where the CLI wins per the
// ownership rule — and where it also happens to be the more readable choice.
// Contrast measured against the frame's own `#310823`:
//   RAIL     The CLI uses `c.cyan`, the same tone as the header. The panel
//            darkened it to `#2a667b`, which is 2.76:1 — under the 3:1 that WCAG
//            2.2 SC 1.4.11 asks of a graphical object. CLI cyan is 8.68:1.
//   FOOTER   The CLI uses `c.dim`, the same tier as an unfocused label. The panel
//            invented `#6f7373` at 3.68:1, below AA for body text. The dim tier
//            is 7.49:1 — and the footer is the only place a user learns Esc
//            exists, so it is the last thing that should fade.
//   PINCH    The CLI emits bold with no colour. The panel tints it cyan.
//
// A2.3 — DIM IS A RESOLVED COLOUR, NOT `opacity`. Opacity compounds: a dim row
// inside a dim container is doubly dim, and it fades a row's bullet along with
// its text, which would break the focused/unfocused bullet distinction. A colour
// is deterministic and is what `panel.js` already does.
//
// A2.4 — HINTS ARE THE CLI'S BRIGHT YELLOW, not the panel's dim italic. The two
// disagree, and the ownership rule puts appearance with the CLI. The CLI's own
// comment calls this out as deliberate: bright yellow was chosen so shortcut
// hints stay visible on every OS, "unlike the faint attribute".
// ============================================================================

import { DOCK_COLLAPSED_WIDTH_PX } from './dock.js';

/**
 * Space the header must leave clear on its right, so its text never runs under
 * the dock's collapse and close buttons. Derived from the dock's own button width
 * rather than hard-coded, so the two cannot drift: two buttons, side by side.
 *
 * This over-reserves by the frame's own right padding, and does so deliberately.
 * The buttons are positioned against the HOST, so the frame's `padding-right`
 * already covers part of the strip they occupy and a precise figure would be
 * `48 - <that padding>`. Subtracting it would tie this constant to a value that
 * exists for unrelated reasons, and getting it wrong runs header text under a
 * button. Reserving the buttons' full width costs a few percent of one line and
 * cannot be wrong.
 */
export const FRAME_HEADER_CLEARANCE_PX = DOCK_COLLAPSED_WIDTH_PX * 2;

/**
 * Minimum height of the scrolling band, in px.
 *
 * This number is load-bearing, and the bug it prevents already happened once in
 * the advisory panel: on a short window the header kept its size and squeezed the
 * options band to zero height, so no option rendered at all and a blind Enter
 * jumped straight to the send-confirm. It reproduced across all six fixtures at
 * viewport <= 230px. See `ui/panel.styles.test.ts`, which guards the same pair of
 * invariants for the panel and explains why they are asserted at source level:
 * jsdom computes no flexbox layout, so only a live sweep (D7) can prove the
 * rendered result.
 *
 * The floor must clear one focused row. The panel uses a 15px line-height and a
 * 30px floor; this keeps the panel's own value for its scrolling band.
 */
export const FRAME_SCROLL_MIN_HEIGHT_PX = 56;

/** One text line, in px. Also the height a blank row must hold so the rail has no gap. */
export const FRAME_LINE_HEIGHT_PX = 15;

/**
 * How many lines of a field are shown before it windows.
 *
 * The CLI windows at `max(4, terminalRows - 26)` — about fourteen lines on a
 * normal terminal — and shows `↑ N more lines above` / `↓ N more lines below`
 * for the rest. A browser textarea has no such limit: left alone it grows to
 * its content, and thirty blank lines from Ctrl+J push the hint line and every
 * row below it off the frame. That is the bug this exists to stop.
 */
export const FIELD_VIEWPORT_LINES = 14;

/**
 * The frame's layout skeleton.
 *
 * THE SHAPE, and why it is this shape. A CLI frame is a fixed header (the
 * `◆ NEXPATH CLI · …` line, its rule, the pinch label and why-help), a body of
 * rows, and a footer naming the two keys that matter. In a terminal all three
 * simply occupy rows. In a window of fixed height they have to compete, and the
 * competition is what the C-2 invariants below settle:
 *
 *   .np-fixed-top   `flex: 0 1 auto` + `min-height: 0` + `overflow: hidden`
 *                   The header may SHRINK and clip its own overflow. Pinned at
 *                   `0 0 auto` it would instead squeeze the band below it to
 *                   nothing — the exact panel bug described above.
 *   .np-scroll      `flex: 1 1 auto` + a px `min-height`
 *                   Takes the remaining space, and reserves enough to keep at
 *                   least one row visible even when the header is at full size.
 *   .np-footer      `flex: 0 0 auto`
 *                   Never shrinks: the footer is how a user learns Esc exists.
 *
 * `overflow-wrap: anywhere` on content is the other half of C-2 — a 2000-character
 * unbroken token must wrap rather than widen the frame and push the page into a
 * horizontal scroll.
 *
 * C-3: no `:has()`, `clamp()`, `:is()`, `:where()`, `dvh`/`svh`, `@layer`,
 * `aspect-ratio` or container queries anywhere in this string; the Firefox floor
 * is 112 and `panel.js` holds the same bar. Scrollbars are styled twice on
 * purpose — `scrollbar-width`/`scrollbar-color` is the Firefox spelling and
 * `::-webkit-scrollbar` the Chrome one, exactly as `panel.js:70-74` does.
 */
export const CHROME_STYLES = `
  .np-frame {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
    padding: 16px 20px 16px 12px;
    background: #310823;
    color: #f5f5f4;
    font-family: "SF Mono", "Cascadia Code", "JetBrains Mono", Consolas, "Liberation Mono", ui-monospace, monospace;
    font-size: 12.5px;
    line-height: ${FRAME_LINE_HEIGHT_PX}px;
  }
  .np-frame * { box-sizing: border-box; }

  /* ── the rail ────────────────────────────────────────────────────────────
     A border, not a column of "│" glyphs. The CLI draws the glyph on every line
     precisely so the left edge reads as "one unbroken vertical border" (its own
     words); a border IS that, and unlike a per-row glyph it cannot break apart
     when a line wraps — which under fluid CSS it will. A min-height keeps a blank
     row exactly one line tall so the rail has no gap where the text does. */
  .np-row {
    display: flex;
    min-height: ${FRAME_LINE_HEIGHT_PX}px;
    border-left: 1px solid #2cc7dd;
    padding-left: 1ch;
  }
  /* C-2: content wraps rather than widening the frame. A 2000-character
     unbroken token must not push the page into a horizontal scroll. */
  .np-content { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }

  /* ── tones: one CSS value per CLI SGR ────────────────────────────────────── */
  .np-header  { color: #2cc7dd; font-weight: 700; }   /* cyan + bold */
  .np-rule    { color: #a8a9a8; }                     /* dim          */
  .np-pinch   { font-weight: 700; }                   /* bold, no colour */
  .np-why     { color: #9ba7a7; }                     /* gray         */
  .np-caution { color: #e0b341; }                     /* yellow       */
  .np-hint    { color: #ffdf6e; }                     /* lightYellow  */
  .np-cancel  { color: #f5eab0; }                     /* paleYellow   */
  .np-dim     { color: #a8a9a8; }                     /* dim          */

  /* ── rows, and the four-tier focus fade ──────────────────────────────────── */
  .np-bullet { flex: 0 0 2ch; color: #9ba7a7; }                    /* gray  */
  .np-focused .np-bullet { color: #1ca46d; }                       /* green */
  .np-label { color: #a8a9a8; }                                    /* dim   */
  .np-focused .np-label { color: #f5f5f4; font-weight: 700; }      /* bold  */
  /* A SELECTED field row that is not being edited reads light gray. Owner
     request 2026-08-24: leaving the editable prompt should take the title above
     it back down, so "this row is selected" and "I am typing in it" stop looking
     identical. Neither the CLI nor panel.js has a precedent — a terminal has no
     blur — so this is a browser-only addition.
     Pure CSS: the renderer puts a field's label, editor and hints in one
     np-field-group, so :focus-within has a common ancestor to test. A JS class
     toggled on focus/blur was tried first and measured wrong — headless Firefox
     never delivered the blur, leaving the state stuck on. :has() would remove
     the wrapper but is Firefox 121 against a 112 floor. */
  .np-focused.np-has-field .np-label { color: #a8a9a8; font-weight: 400; }
  .np-focused.np-has-field .np-bullet { color: #9ba7a7; }
  /* ...and brightens again while the caret is actually in it. Ordered after the
     rule above and at equal specificity, so editing wins. */
  .np-field-group:focus-within .np-label { color: #f5f5f4; font-weight: 700; }
  .np-field-group:focus-within .np-bullet { color: #1ca46d; }
  /* THREE TIERS, not two. The body recedes with its title — a dim heading over
     bright text still reads as the active block — and inside the active block
     the title sits one step above its own body, so the heading is legible as a
     heading rather than as more prose at the same weight and colour:

         #f5f5f4  16.18:1   title, editing (and bold)
         #d0d0d0  11.45:1   body, editing
         #a8a9a8   7.49:1   both, idle

     All three clear AA 4.5:1 on this ground, and #d0d0d0 is the palette's
     existing focused-supporting-text tier rather than a new colour.

     A deliberate divergence — the CLI leaves content at full brightness in one
     flat tier, because a terminal frame has no second block to recede against.
     Owner requests 2026-08-25. Parity compares text, not colour, so it holds. */
  .np-field-group .np-field { color: #a8a9a8; }
  .np-field-group:focus-within .np-field { color: #d0d0d0; }
  .np-desc { color: #9ba7a7; }                                     /* gray  */
  .np-focused .np-desc { color: #d0d0d0; }                         /* 38;5;252 */

  /* ── editable fields ─────────────────────────────────────────────────────
     A textarea arrives with the browser's own furniture: its own font, a white
     ground, a border, padding and a resize grip. In a CLI frame every one of
     those is wrong, so each is turned off and the frame's own type and colour
     inherited — the field has to read as the plain text lines the CLI prints.
     resize:none and overflow:hidden are not cosmetic: auto-grow owns the
     height, and a scrollbar or a drag handle would fight it. */
  .np-field {
    font: inherit;
    line-height: inherit;
    color: inherit;
    background: transparent;
    border: none;
    outline: none;
    padding: 0;
    margin: 0;
    width: 100%;
    display: block;
    resize: none;
    /* Scrollable once capped; overflow:hidden would clip the text with no way
       to reach it. The cap itself is no longer a CSS constant: growFields sets
       per-field inline max-heights the CLI's way — the details field windows
       at 5 lines (cli-submit-popup.ts:1335) and the body fills the remaining
       band adaptively (:1354-1365), instead of one fixed 14-line cap. */
    overflow-x: hidden;
    overflow-y: auto;
  }
  /* No focus ring. The CLI draws no box around its editor, and a browser
     outline here reads as a form control dropped into a terminal frame. Focus
     is still shown, and more strongly than an outline would: the bullet fills
     (o -> *) and the label goes bright while the field is being edited. */
  /* One placeholder colour on both browsers — the defaults differ, and C-3
     wants one look. The gray tier, matching unfocused supporting text. */
  .np-field::placeholder { color: #9ba7a7; opacity: 1; }
  /* The scroll markers. Dimmed so they read as a hint rather than as part of
     the body — the CLI dims them for the same reason (owner, 2026-08-07). */
  .np-scroll-marker { color: #9ba7a7; }
  /* Structural, and declared rather than left implicit: a marker row is an
     ordinary row until it is hidden, and the unstyled-class guard is right to
     insist that every class the code applies has a rule to point at. */
  .np-marker-row { }
  .np-marker-hidden { display: none; }

  /* Indent columns, named for the column they land on. The CLI uses four of
     them and does not use one number everywhere: field content sits at 4 in PE
     and MPS but 6 in PEF, hints at 4 in PE and 6 elsewhere, non-interactive
     notes at 2, and variant B's descriptions at 3. */
  .np-ind-2 { padding-left: 2ch; }
  .np-ind-3 { padding-left: 3ch; }
  .np-ind-4 { padding-left: 4ch; }
  .np-ind-6 { padding-left: 6ch; }

  /* ── variant B ───────────────────────────────────────────────────────────
     The wordmark header carries no rail — the CLI suppresses it there so the
     prefix does not collide with the header's own glyphs. The pinch row keeps
     the rail's width but shows the corner marker in its place. */
  .np-row-bare { border-left-color: transparent; }
  .np-marker { flex: 0 0 2ch; color: #2cc7dd; }
  .np-wordmark { color: #f5f5f4; font-weight: 700; }
  .np-wordmark-tri { color: #2cc7dd; }

  .np-fixed-top {
    flex: 0 1 auto;
    min-height: 0;
    overflow: hidden;
    padding-right: ${FRAME_HEADER_CLEARANCE_PX}px;
  }

  .np-scroll {
    flex: 1 1 auto;
    overflow-y: auto;
    min-height: ${FRAME_SCROLL_MIN_HEIGHT_PX}px;
    scrollbar-width: thin;
    scrollbar-color: #5a3a52 transparent;
  }
  .np-scroll::-webkit-scrollbar { width: 8px; }
  .np-scroll::-webkit-scrollbar-thumb { background: #5a3a52; border-radius: 4px; }
  .np-scroll::-webkit-scrollbar-track { background: transparent; }

  .np-footer { flex: 0 0 auto; }

  /* The controller's focusable wrapper (D6). It holds the element-scoped
     keydown listener, so it must be focusable; the outline is suppressed
     because row focus is already drawn by the bullets and the label weight. */
  .np-surface-root { height: 100%; outline: none; }
  /* No box of its own: the rows inside stay in normal flow, so grouping them
     changes what CSS can ASK and nothing about what is drawn. */
  .np-field-group { display: block; }
`;

/**
 * Append the frame's stylesheet to a shadow root, the panel's way
 * (`panel.js:151-153`): create a `<style>`, set `textContent`, append.
 *
 * Returns the node so a caller can remove it again. Callers arrive in D3/D4; under
 * C-5 nothing imports this yet.
 */
export function installChromeStyles(root: ShadowRoot | HTMLElement): HTMLStyleElement {
  const doc = root.ownerDocument ?? document;
  const style = doc.createElement('style');
  style.textContent = CHROME_STYLES;
  root.appendChild(style);
  return style;
}

// ── D2.3 — frame primitives ─────────────────────────────────────────────────
// One line builder for all four surfaces. Their grammars are identical — header,
// rule, blank, text, bullet row, indented content, hint, footer — so a surface
// module declares WHICH rows it has and never how a row is made.
//
// Markup is built in JS with `escapeHtml` on every interpolated value, which is
// the panel's idiom (`panel.js`, 8 uses). Nothing here reads the DOM back or
// holds state; these are pure element factories.

/** The panel's own escaper (`panel.js:185-190`), character for character. */
export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Tones a plain text row can carry. Each maps to exactly one CLI SGR. */
export type FrameTone = 'plain' | 'pinch' | 'why' | 'caution' | 'cancel' | 'dim' | 'hint';

const TONE_CLASS: Readonly<Record<FrameTone, string>> = {
  plain: '',
  pinch: 'np-pinch',
  why: 'np-why',
  caution: 'np-caution',
  cancel: 'np-cancel',
  dim: 'np-dim',
  hint: 'np-hint',
};

/** The frame skeleton: a header region, a scrolling band, and a pinned footer. */
export interface FrameParts {
  frame: HTMLElement;
  fixedTop: HTMLElement;
  scroll: HTMLElement;
  footer: HTMLElement;
}

export function buildFrame(doc: Document): FrameParts {
  const frame = doc.createElement('div');
  frame.className = 'np-frame';

  const fixedTop = doc.createElement('div');
  fixedTop.className = 'np-fixed-top';

  const scroll = doc.createElement('div');
  scroll.className = 'np-scroll';

  const footer = doc.createElement('div');
  footer.className = 'np-footer';

  frame.append(fixedTop, scroll, footer);
  return { frame, fixedTop, scroll, footer };
}

/** A rail row carrying one content cell. The building block of every row below. */
function row(doc: Document, contentClass: string, html: string): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'np-row';
  el.innerHTML = `<div class="${contentClass}">${html}</div>`;
  return el;
}

/** `◆ NEXPATH CLI · <surface>` and the rule beneath it, exactly as wide. */
export function buildHeader(doc: Document, surfaceLabel: string): HTMLElement[] {
  const text = `◆ NEXPATH CLI · ${surfaceLabel}`;
  return [
    row(doc, 'np-content np-header', escapeHtml(text)),
    // The CLI writes `'─'.repeat(header.length)`. Repeating the character rather
    // than drawing a border is what keeps the rule the header's width instead of
    // the frame's — and in a monospace face the two are the same thing.
    row(doc, 'np-content np-rule', '─'.repeat(text.length)),
  ];
}

/** A rail-only line. The CLI emits these to separate blocks; they are not padding. */
export function buildBlankRow(doc: Document): HTMLElement {
  return row(doc, 'np-content', '');
}

/** A line of text at the rail, in one of the CLI's tones. */
export function buildTextRow(doc: Document, text: string, tone: FrameTone = 'plain'): HTMLElement {
  return row(doc, `np-content ${TONE_CLASS[tone]}`.trim(), escapeHtml(text));
}

/** `● label` when focused, `○ label` when not. */
export function buildBulletRow(
  doc: Document,
  label: string,
  focused: boolean,
  tone?: 'plain' | 'cancel',
  hasField = false,
): HTMLElement {
  const el = doc.createElement('div');
  // `np-has-field` marks the rows whose bright state depends on whether the
  // user is actually editing. An action row has nothing to edit, so its
  // selected state stays bright exactly as the CLI shows it.
  const kind = hasField ? ' np-has-field' : '';
  el.className = (focused ? 'np-row np-focused' : 'np-row') + kind;
  // MPS's Cancel row is the one label the CLI tints — paleYellow, so destroying
  // the rest of a sequence does not look like every other option.
  const toneClass = tone === 'cancel' ? ' np-cancel' : '';
  el.innerHTML =
    `<div class="np-bullet">${focused ? '●' : '○'}</div>` +
    `<div class="np-content np-label${toneClass}">${escapeHtml(label)}</div>`;
  return el;
}

/**
 * Field content or an option's description, at the CLI's 4-column indent.
 * `focused` selects the brighter of the two description tiers.
 */
export function buildIndentedRow(doc: Document, text: string, focused = false): HTMLElement {
  const el = row(doc, 'np-content np-ind-4 np-desc', escapeHtml(text));
  if (focused) el.classList.add('np-focused');
  return el;
}

/**
 * A windowed field's scroll indicator.
 *
 * The CLI replaces the first or last VISIBLE LINE of the field with the marker.
 * A textarea cannot have one of its lines styled or substituted without
 * corrupting the value the user is editing, so here the marker is its own row
 * above or below the field. Same words, same dim tone, same information — the
 * count of lines you cannot currently see.
 */
export function buildScrollMarkerRow(doc: Document, indent: 4 | 6): HTMLElement {
  const el = row(doc, `np-content np-ind-${indent} np-scroll-marker`, '');
  // Two classes, two jobs. The ROW carries the structural ones — how to find it
  // and whether it is shown — because hiding the content cell alone would leave
  // the row's height and a segment of the rail behind, an empty line where the
  // CLI prints nothing. The cell keeps the tone.
  el.classList.add('np-marker-row', 'np-marker-hidden');
  return el;
}

/**
 * A shortcut hint, indented with the content it describes.
 *
 * The column is a parameter because the CLI does not agree with itself: PE puts
 * hints at four, MPS and PEF at six.
 */
export function buildHintRow(doc: Document, text: string, indent: 4 | 6 = 4): HTMLElement {
  return row(doc, `np-content np-ind-${indent} np-hint`, escapeHtml(text));
}

/**
 * A line the user cannot act on — MPS-1's `Sequence plan` block, MPS-2's
 * `Your original:` and the prompt beneath it. No bullet and no focus: the CLI
 * prints these as indented text and never counts them among its rows.
 */
export function buildNoteRow(
  doc: Document,
  text: string,
  indent: 2 | 4 = 2,
  tone: 'dim' | 'plain' = 'dim',
): HTMLElement {
  const toneClass = tone === 'dim' ? ' np-dim' : '';
  return row(doc, `np-content np-ind-${indent}${toneClass}`, escapeHtml(text));
}

/** The footer line — the only place a user learns Esc exists, so it never fades. */
export function buildFooterRow(doc: Document, text: string): HTMLElement {
  return row(doc, 'np-content np-dim', escapeHtml(text));
}

// ── D2.4 — variant B primitives ─────────────────────────────────────────────

/**
 * Variant B's rule, a fixed 24 characters wide.
 *
 * Not derived from the wordmark's length, because the CLI does not derive it
 * either — `NEXPATH_HEADER` hard-codes exactly this many box-drawing characters
 * (`DecisionSession.ts:72-74`), and the rule is visibly wider than the wordmark
 * above it as a result. Matching the CLI means copying the number.
 */
export const WORDMARK_RULE = '─'.repeat(24);

/**
 * Variant B's header: `▲  NEXPATH CLI`, its rule, and a blank line — the three
 * rows `NEXPATH_HEADER_LINES` counts.
 *
 * None of them draws the rail. That is the CLI's own decision, and its reason is
 * that the rail glyph "would visually conflict with the header's glyphs".
 */
export function buildWordmarkHeader(doc: Document): HTMLElement[] {
  const wordmark = doc.createElement('div');
  wordmark.className = 'np-row np-row-bare';
  wordmark.innerHTML =
    '<div class="np-content np-wordmark">' +
    '<span class="np-wordmark-tri">▲</span>  NEXPATH CLI' +
    '</div>';

  const rule = row(doc, 'np-content np-rule', WORDMARK_RULE);
  rule.classList.add('np-row-bare');

  const blank = buildBlankRow(doc);
  blank.classList.add('np-row-bare');

  return [wordmark, rule, blank];
}

/**
 * Variant B's pinch label: `◆ <text>`, the corner marker standing where the rail
 * would be.
 *
 * `subsequent` is for the row after it — a subtitle. The CLI gives the corner to
 * the FIRST pinch row only and lets any that follow fall back to the rail, so a
 * caller rendering a subtitle passes `true` and gets a plain rail row.
 */
export function buildPinchRow(doc: Document, text: string, subsequent = false): HTMLElement {
  if (subsequent) return buildTextRow(doc, text, 'pinch');

  const el = doc.createElement('div');
  el.className = 'np-row np-row-bare';
  el.innerHTML =
    '<div class="np-marker">◆</div>' +
    `<div class="np-content np-pinch">${escapeHtml(text)}</div>`;
  return el;
}

/**
 * Variant B's description row, indented three columns to sit under its bullet
 * column rather than variant A's four.
 */
export function buildTightIndentRow(doc: Document, text: string, focused = false): HTMLElement {
  const el = row(doc, 'np-content np-ind-3 np-desc', escapeHtml(text));
  if (focused) el.classList.add('np-focused');
  return el;
}
