// ============================================================================
// nexpath surface dock — host + closed shadow root + mount-once controller.
// ----------------------------------------------------------------------------
// Sub-phases D1.1 to D1.5 of the CLI-parity static UI plan. This file owns the
// WINDOW the four surfaces will live in, and deliberately nothing inside it:
//
//   D1.1  the host element in the agent page's DOM, the CLOSED shadow root that
//         isolates our CSS from that page, and a controller mounted ONCE per
//         content-script lifetime,
//   D1.2  the dock's geometry — 60% x 90%, flush right, the CLI's clamp order,
//   D1.3  the collapse affordance,
//   D1.4  the close button,
//   D1.5  the re-attach guard and `pagehide` teardown.
//
// Everything above is browser-only window furniture. What goes INSIDE the window
// — the CLI frame and the four surfaces — belongs to D2 onwards and never appears
// here; the dock hands renderers `mountEl` and does not look at what they draw.
//
// Mirrors `content/inject.ts`'s `ensurePanelMounted()` rather than reinventing
// it: same host-element-then-closed-shadow-then-mount-element shape, same
// mount-once discipline. The advisory panel keeps using that function; this dock
// is a separate host for the four new surfaces (PE / MPS-1 / MPS-2 / PEF), so
// nothing here touches the shipped panel or its frozen contract.
//
// Two things D1.3 had to decide, recorded here because the code alone does not
// say them out loud:
//   OVERLAY, NOT PUSH (A3.7). The dock is `position:fixed` and never reflows the
//     agent page. Pushing would mean mutating the host page's layout — an
//     intrusion that also breaks the moment a site uses its own fixed chrome.
//     Collapsing is what makes the overlay liveable, which is exactly why D-3
//     paired the right dock with this affordance.
//   COLLAPSE STATE IS IN-MEMORY (A3.4). It lives in this closure and resets on
//     reload. Persisting it would need storage: `chrome.storage` means reaching
//     into the adapters layer, and `sessionStorage` means writing into the agent
//     page's own origin. Both are wiring, which C-5 rules out for now. Recorded
//     as deferred rather than decided against.
//
// Explicitly NOT in this file yet — each is a later sub-phase, and adding it
// early would make the dock look finished when it is not:
//   D2    the CLI frame's `STYLES` string. The dock already carries one for its
//         own chrome (the two dock buttons); D2 adds a second for the frame, and
//         two style nodes in one shadow root is fine. Visibility here is a raw
//         `display` swap inside paint() — plumbing, not visual design, and D2 may
//         replace it with a class-based transition like the panel's `.np-hidden`.
//   D3/D4 surface rendering. Renderers draw into `controller.mountEl`; the dock
//         never inspects or owns what they put there.
// ============================================================================

/** Host element id. Stable so a stale instance's host can be identified (see below). */
export const NEXPATH_DOCK_HOST_ID = 'nexpath-dock-host';

// ── D1.2 — dock geometry ────────────────────────────────────────────────────
// The four numbers below are the CLI's own docked-popup constants, not new ones.
// Source: `src/decision-session/screen-geometry.ts`. They are re-declared rather
// than imported: that module is CLI/Node code, and C-5 keeps this layer free of
// cross-layer imports. Keep them in sync by hand if the CLI ever changes them.

/** Fraction of the viewport width the dock occupies. CLI `DEFAULT_POPUP_WIDTH_RATIO`. */
export const DOCK_WIDTH_RATIO = 0.6;

/** Ultrawide guard: 60% of a very wide screen stays readable. CLI `POPUP_MAX_WIDTH_PX`. */
export const DOCK_MAX_WIDTH_PX = 1600;

/**
 * Readability floor. CLI `POPUP_MIN_COLS` (80 cells) x `DEFAULT_CELL_WIDTH_PX` (10px).
 *
 * D7.4 — THE BREAKPOINT MODEL IS THE CLAMP ITSELF; there is no separate one.
 * The single declaration `min-width: min(800px, 100%)` already resolves every
 * band, and adding media queries on top would re-state it:
 *   viewport >= 2667px   the 1600px ultrawide cap wins
 *   1334px - 2666px      plain 60%
 *   801px - 1333px       this 800px floor wins
 *   viewport <= 800px    the dock is the full viewport width
 * Height stays 90% throughout. No separate phone layout, decided rather than
 * omitted: every supported agent (Replit, Bolt, Lovable) is a desktop IDE, and
 * below the floor the frame's own C-2 behaviour — wrapping content, a scrolling
 * band, pinned header and footer — is what carries the narrow case. The
 * boundary maths is pinned in dock.test.ts; the live look is the harness sweep.
 */
export const DOCK_MIN_WIDTH_PX = 800;

/**
 * Fraction of the viewport height the dock occupies. The CLI uses 100% of the
 * WORKING area — the screen minus the taskbar / menu bar. A browser viewport has
 * no such furniture to subtract, so 90% of it is the faithful equivalent, not a
 * deviation (owner requirement, and recorded in the analysis doc).
 */
export const DOCK_HEIGHT_RATIO = 0.9;

/** Above the agent's own UI. Same value the advisory panel host uses. */
export const DOCK_Z_INDEX = 2147483647;

/**
 * Inline geometry for the host element.
 *
 * WHY INLINE, NEVER A STYLESHEET: the host itself lives in the agent page's light
 * DOM — only its shadow CONTENTS are isolated — so a page rule such as
 * `#nexpath-dock-host { display: none }` matches it. An inline declaration beats a
 * page stylesheet, which is what keeps the dock ours. `content/inject.ts` sets the
 * advisory panel's host the same way, for the same reason.
 *
 * CLAMP-ORDER PARITY: the CLI computes the width imperatively
 * (`computeDockedPopupGeometry`):
 *
 *     w = min( max( min(0.6 * V, 1600), 800 ), V )
 *       60%  ->  cap at 1600  ->  floor at 800  ->  never exceed the viewport
 *
 * CSS resolves a used width as `max(min-width, min(max-width, width))`, so the
 * declarations below evaluate to:
 *
 *     w = max( min(800, V), min(1600, 0.6 * V) )
 *
 * Those two expressions agree for every viewport width V — `min(800px, 100%)` is
 * what supplies the CLI's final "never exceed the viewport" step, which a bare
 * `min-width: 800px` would break (min-width otherwise always wins in CSS).
 * `dock.test.ts` pins the equivalence by evaluating both forms across a range of
 * widths, so a future edit to either side cannot silently drift.
 *
 * Letting CSS do this also means the dock re-resolves on window resize with no
 * listener to own, leak, or forget to remove.
 *
 * VERTICAL PLACEMENT: the CLI docks flush to the top of the work area because its
 * popup is 100% of that height — there is nothing left over to place. At 90% there
 * is 10%, so it is split evenly rather than dumped at the bottom, which would read
 * as a layout bug.
 *
 * THE BOX-MODEL RESET IS NOT DECORATION. Inline styling only protects the properties
 * it actually declares, and everything else on the host is still the agent page's to
 * set. Verified against a page stylesheet: `div { padding: 20px; margin: 30px;
 * border: 5px }` all applied to the host and moved/grew the docked box —
 * `margin` alone defeats `right:0`. Rules that broad (`div`, `body > div`, a `*`
 * reset) are ordinary on real sites, so the declared geometry only holds if these
 * are pinned too. With padding and border at zero, `box-sizing` no longer changes
 * anything, so it is deliberately not declared. `transform` is here because a page
 * transform relocates or scales the whole box.
 *
 * THE SAME ARGUMENT REACHES PAST GEOMETRY. `visibility`, `opacity`,
 * `pointer-events`, `filter` and `clip-path` were left to a later phase on the
 * grounds that they are not geometry. That was the wrong line to draw: a page
 * rule setting `visibility: hidden` defeats show() exactly as `display: none`
 * did, `pointer-events: none` makes the dock unclickable, and `opacity: 0` makes
 * it invisible — all while the controller still reports itself visible. Verified
 * against a page stylesheet: every one of them applied. They are pinned here for
 * the same reason as the box model, and for the same cost.
 *
 * The rules themselves are split in two: what both the expanded dock and the
 * collapsed tab share (below), and what only the expanded state adds.
 */

/**
 * What both states share: the fixing, the edge it docks to, the stacking, and the
 * box-model reset. Kept in one place so expanded and collapsed cannot drift apart
 * — a collapsed tab that quietly lost `margin:0` would slide off the edge exactly
 * like the expanded box would.
 */
const DOCK_HOST_BASE_CSS = [
  'position:fixed',
  'right:0',
  `z-index:${DOCK_Z_INDEX}`,
  'margin:0',
  'padding:0',
  'border:0',
  'transform:none',
  'visibility:visible',
  'opacity:1',
  'pointer-events:auto',
  'filter:none',
  'clip-path:none',
  // The host must CLIP what the shadow draws. Without it the collapsed tab
  // (64x24) still painted the full-height frame down the page's right edge,
  // because nothing hid the mount (measured in real Chrome, 2026-08-26).
  'overflow:hidden',
].join(';') + ';';

/** Expanded geometry: the 60% x 90% docked box described above. */
export const DOCK_HOST_GEOMETRY_CSS = DOCK_HOST_BASE_CSS + [
  `top:${(100 - DOCK_HEIGHT_RATIO * 100) / 2}%`,
  `width:${DOCK_WIDTH_RATIO * 100}%`,
  `max-width:${DOCK_MAX_WIDTH_PX}px`,
  `min-width:min(${DOCK_MIN_WIDTH_PX}px,100%)`,
  `height:${DOCK_HEIGHT_RATIO * 100}%`,
].join(';') + ';';

// ── D1.3 — collapse affordance ──────────────────────────────────────────────
// D-3 put the dock on the right edge, which is also where every supported agent
// keeps its chat. Collapsing is what makes that liveable: the dock shrinks to a
// tab, the chat is usable again, and one click brings it back.

/**
 * Width of the collapsed tab, and of the toggle handle in both states.
 * Not an arbitrary number: the handle IS the whole target when collapsed, and
 * WCAG 2.2 SC 2.5.8 (Target Size, Minimum, AA) puts the floor at 24x24 CSS px.
 * Narrower than that and the only way back from a collapsed dock is a hard target.
 */
export const DOCK_COLLAPSED_WIDTH_PX = 24;

/**
 * Height of the collapsed tab. The toggle is only this tall while collapsed —
 * expanded it is a {@link MIN_TARGET_SIZE_PX} square in the corner.
 */
export const DOCK_COLLAPSED_HEIGHT_PX = 64;

/** WCAG 2.2 SC 2.5.8 minimum target size, in CSS px. */
export const MIN_TARGET_SIZE_PX = 24;

/**
 * Collapsed geometry: the host becomes the tab.
 *
 * Same `top` as the expanded dock, deliberately. The toggle sits at the host's
 * top-right in both states, so sharing the top edge means the control does not
 * move when you click it — press collapse and the button you just hit is still
 * under the cursor, ready to expand. Centring the tab vertically instead would
 * make it jump to mid-screen.
 *
 * `min-width` is explicitly cleared: the expanded rule sets an 800px floor, and a
 * leftover floor would keep a "collapsed" host 800px wide. The two states are
 * applied by replacing `cssText` wholesale, so this is belt-and-braces — but the
 * failure it prevents is silent and total, and one declaration is cheap.
 */
export const DOCK_HOST_COLLAPSED_CSS = DOCK_HOST_BASE_CSS + [
  `top:${(100 - DOCK_HEIGHT_RATIO * 100) / 2}%`,
  `width:${DOCK_COLLAPSED_WIDTH_PX}px`,
  'max-width:none',
  'min-width:0',
  `height:${DOCK_COLLAPSED_HEIGHT_PX}px`,
].join(';') + ';';

/**
 * Styles for the dock's own chrome — the collapse toggle and the close button,
 * which share `.np-dock-btn` and differ only in where they sit and what they
 * do on hover. Separate from the CLI
 * frame styling D2 will add: this control is browser-only furniture the CLI has
 * no equivalent for, so per the ownership rule it follows the advisory panel's
 * idiom rather than CLI parity. Same authoring standard as `panel.js`: one string,
 * `np-` classes, literal hex, appended as a `<style>` inside the shadow root.
 *
 * WHY THE TOP-RIGHT CORNER, NOT THE LEFT EDGE. The obvious place for a drawer
 * handle is the inner edge facing the page — but that edge is where every CLI
 * frame puts its `│` rail, and a control sitting on the rail breaks the parity
 * this whole workstream exists for. Three alternatives were weighed and dropped:
 * a left gutter costs every surface 24px permanently and shifts the rail inward;
 * overhanging outside the host puts the handle off-screen once the viewport is
 * narrow enough that the dock spans it (`left:-24px` from x=0), which is exactly
 * when collapsing matters most; and a header-only control still leaves the
 * collapsed tab needing a second one. The corner is clear of the rail, is where
 * window chrome is expected, and is where D1.4's close button will sit too.
 *
 * ONE BUTTON, TWO PRESENTATIONS. Expanded it is a ${MIN_TARGET_SIZE_PX}px square in the
 * corner; collapsed the host IS the tab, so the same button simply fills it. No
 * second element, and nothing to keep in sync.
 */
const DOCK_CHROME_STYLES = `
  /* The renderer's mount: it must be exactly as tall as the dock so the frame's
     own height:100% has something real to resolve against (see mountEl). */
  .np-dock-mount { height: 100%; overflow: hidden; }

  .np-dock-btn {
    position: absolute;
    top: 0;
    width: ${DOCK_COLLAPSED_WIDTH_PX}px;
    height: ${MIN_TARGET_SIZE_PX}px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: #310823;
    color: #2cc7dd;
    font-family: "SF Mono", "Cascadia Code", "JetBrains Mono", Consolas, "Liberation Mono", ui-monospace, monospace;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
    -webkit-user-select: none;
    user-select: none;
  }
  .np-dock-btn:hover { color: #f5f5f4; }
  .np-dock-btn:focus-visible { outline: 2px solid #2cc7dd; outline-offset: 2px; }

  /* Window-chrome order: close sits outermost, collapse to its left. */
  .np-dock-close { right: 0; border-radius: 0 0 0 4px; }
  .np-dock-close:hover { color: #f38ba8; }
  .np-dock-toggle { right: ${DOCK_COLLAPSED_WIDTH_PX}px; }

  /* Collapsed: the tab does one thing. The toggle becomes the whole host and
     close is withdrawn — two controls will not fit, and "expand" is the only
     action that makes sense from a tab. */
  .np-dock-toggle--collapsed {
    right: 0;
    height: ${DOCK_COLLAPSED_HEIGHT_PX}px;
    border-radius: 4px 0 0 4px;
    box-shadow: -2px 0 8px rgba(0,0,0,.35);
  }
  .np-dock-close--hidden { display: none; }
`;

// ── D1.4 — close button ─────────────────────────────────────────────────────
// The frozen panel contract already describes this control — `DismissEvent` is
// documented as "User clicked ✕ or pressed Escape … Panel should close"
// (`ui-contract.ts:128-132`) — but `panel.js` never renders one and never calls
// its own `emitDismiss()`. So the ✕ is new work, not a port.
//
// ✕ means CLOSE AND DO NOTHING: the dock hides and the caller is told. It is
// deliberately not Escape, which carries a different meaning on every CLI surface
// (PE cancels, MPS-2 cancels the whole sequence, PEF skips). Keeping them separate
// is what lets a user dismiss the window without triggering a surface's semantics.
// Escape itself belongs to D6.

/** What the dock reports upward. One member today; D6 extends it. */
export type NexpathDockEvent = { type: 'dismiss' };

export interface MountNexpathDockOptions {
  /**
   * Called when the dock reports something. Mirrors the panel's
   * `mountNexpathPanel(root, { onEvent })` shape rather than inventing a second
   * convention. Optional: under C-5 nothing is wired yet, and a dock with no
   * listener must still behave.
   */
  onEvent?: (event: NexpathDockEvent) => void;

  /**
   * Document to mount into. Defaults to the ambient `document`; parameterised
   * only so tests can supply their own.
   */
  doc?: Document;
}

export interface NexpathDockController {
  /**
   * The element surface renderers draw into. It lives INSIDE the closed shadow
   * root, so it is unreachable from the agent page's `document` — that boundary
   * is the whole reason the host exists.
   */
  readonly mountEl: HTMLElement;

  /** Make the dock visible. Safe to call repeatedly. */
  show(): void;

  /** Hide the dock WITHOUT tearing it down — `show()` may be called again. */
  hide(): void;

  /** True while the dock is showing. False before the first `show()`. */
  isVisible(): boolean;

  /** Shrink the dock to its edge tab, freeing the agent's chat. Safe to repeat. */
  collapse(): void;

  /** Restore the dock to full size. Safe to repeat. */
  expand(): void;

  /** True while the dock is collapsed to its tab. */
  isCollapsed(): boolean;

  /**
   * Remove the host from the page and end this dock's lifetime. After this,
   * every method on this controller is a safe no-op; a fresh `mountNexpathDock()`
   * starts a new lifetime.
   */
  destroy(): void;
}

/**
 * The live controller for this content-script instance, or null when no dock is
 * mounted. Module-level so repeated `mountNexpathDock()` calls in one instance
 * return the same dock — that is what "mount once" means here.
 */
let current: NexpathDockController | null = null;

/**
 * Create the dock, or return the one already mounted in this instance.
 *
 * Note that on a second call the options are IGNORED — the existing dock is
 * returned as-is. That is what mount-once means, and it is why the first caller
 * owns the `onEvent` listener.
 */
export function mountNexpathDock(options: MountNexpathDockOptions = {}): NexpathDockController {
  if (current) return current;

  const doc = options.doc ?? document;
  const emit = options.onEvent;

  // A stale content-script instance from a prior extension reload can still be
  // alive in an already-open tab, holding a host we can never reach again (its
  // shadow root is closed, and its module scope is not ours). Left in place it
  // would sit in the DOM as a second, permanently inert dock. Its host is
  // identifiable by id, so drop it before creating ours — this is what keeps
  // "mount once" true across instances, not just within one.
  // (`content/inject.ts` solves the same problem for the panel one level up,
  // with its `__nexpathInjectBootstrapped` bootstrap guard.)
  doc.getElementById(NEXPATH_DOCK_HOST_ID)?.remove();

  const host = doc.createElement('div');
  host.id = NEXPATH_DOCK_HOST_ID;
  doc.body.appendChild(host);

  // CLOSED, matching the panel: the agent page cannot reach into our DOM through
  // `host.shadowRoot`, and page CSS cannot select into it. The cost is that our
  // own key handling must be element-scoped rather than document-scoped —
  // `composedPath()` hides a closed root's internals from any listener outside
  // it. That is a D6 concern; noted here because the closed mode is what causes it.
  const shadow = host.attachShadow({ mode: 'closed' });

  // The dock's own chrome styles. D2 will append a second <style> for the CLI
  // frame; two style nodes in one shadow root is fine, and it keeps browser-only
  // furniture separate from CLI-parity styling.
  const style = doc.createElement('style');
  style.textContent = DOCK_CHROME_STYLES;
  shadow.appendChild(style);

  // Renderers get this element, never the shadow root itself — same split the
  // panel uses, so a renderer can freely clear its own subtree without touching
  // anything the dock owns (the style node and the toggle are siblings, not
  // children, so a renderer clearing mountEl cannot delete the collapse control).
  const mountEl = doc.createElement('div');
  // LOAD-BEARING: the renderer's `.np-surface-root{height:100%}` and
  // `.np-frame{height:100%}` resolve against THIS element. As a bare div it was
  // `height:auto`, so both collapsed to content height and the frame ignored the
  // dock entirely — measured in real Chrome: a 120-line body produced a frame
  // ~1100px BELOW the viewport with no scrollbar, so the footer and every row
  // under the body were unreachable, and the scroll band + adaptive field cap
  // (which measures the band) were inert. One class fixes the whole chain.
  mountEl.className = 'np-dock-mount';
  shadow.appendChild(mountEl);

  // A real <button>: focusable, Enter/Space activated, and announced by a screen
  // reader — none of which a styled <div> gives for free.
  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.className = 'np-dock-btn np-dock-toggle';
  shadow.appendChild(toggle);

  const close = doc.createElement('button');
  close.type = 'button';
  close.className = 'np-dock-btn np-dock-close';
  close.textContent = '✕';                  // ✕ — the glyph the contract names
  close.setAttribute('aria-label', 'Close nexpath');
  shadow.appendChild(close);

  let visible = false;
  let collapsed = false;
  let destroyed = false;

  /**
   * The single writer of host geometry and toggle state. Collapse and show/hide
   * both change how the host must look, so folding them into one paint removes
   * the whole class of bug where one silently overwrites the other's work.
   */
  function paint(): void {
    host.style.cssText =
      (collapsed ? DOCK_HOST_COLLAPSED_CSS : DOCK_HOST_GEOMETRY_CSS) +
      `display:${visible ? 'block' : 'none'};`;
    // Collapsed = the tab only. Hiding the mount (rather than relying on the
    // host's size) keeps the surface out of the layout AND out of the focus
    // guard's reach, which used to yank the keyboard into the invisible panel.
    mountEl.style.display = collapsed ? 'none' : 'block';
    toggle.textContent = collapsed ? '‹' : '›';
    toggle.classList.toggle('np-dock-toggle--collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'Expand nexpath' : 'Collapse nexpath');
    close.classList.toggle('np-dock-close--hidden', collapsed);
  }

  // Named, so destroy() can take them off again — the panel's idiom
  // (`panel.js:679-688` removes every listener it added). That detachment is also
  // why neither handler checks `destroyed`: destroy() removes both listeners in
  // the same synchronous block that sets the flag, so a post-destroy click cannot
  // reach this code at all. A guard here would be unreachable.
  function onToggleClick(): void {
    collapsed = !collapsed;
    paint();
  }

  function onCloseClick(): void {
    // Hide, never destroy: the contract's dismiss is "close", and a later show()
    // must still work. Hiding first means a listener that throws cannot leave the
    // dock on screen after the user asked for it to go.
    visible = false;
    paint();
    emit?.({ type: 'dismiss' });
  }

  /**
   * D1.5 — a content script has no clean unload hook; `pagehide` is the closest.
   * Tear the dock down on navigation away from the agent so nothing survives into
   * the next page. `inject.ts:279-286` does the same for the panel.
   */
  function onPageHide(): void {
    controller.destroy();
  }

  toggle.addEventListener('click', onToggleClick);
  close.addEventListener('click', onCloseClick);
  // `doc.defaultView`, not the ambient `window`, so a caller-supplied document is
  // honoured here too and the listener is removable in tests.
  const view = doc.defaultView;
  view?.addEventListener('pagehide', onPageHide);

  paint();

  const controller: NexpathDockController = {
    mountEl,

    show(): void {
      if (destroyed) return;
      // D1.5 re-attach guard. A host-page SPA re-render can wipe <body>'s children
      // and orphan our host; a mount-once dock whose host is orphaned is dead with
      // no way back, because mountNexpathDock() would just hand back this same
      // controller. Checked on show() — the moment it matters — exactly as
      // `inject.ts:272-274` does for the panel.
      if (!host.isConnected) doc.body.appendChild(host);
      // paint() writes an explicit `display`, never ''. The host element lives in
      // the agent page's light DOM — only its shadow CONTENTS are isolated — so a
      // page rule like `#nexpath-dock-host { display: none }` applies to it.
      // Clearing the inline value would hand the decision to that rule and show()
      // would fail silently; inline beats a page stylesheet, so this keeps the
      // dock ours.
      visible = true;
      paint();
    },

    hide(): void {
      if (destroyed) return;
      visible = false;
      paint();
    },

    isVisible(): boolean {
      return !destroyed && visible;
    },

    collapse(): void {
      if (destroyed) return;
      collapsed = true;
      paint();
    },

    expand(): void {
      if (destroyed) return;
      collapsed = false;
      paint();
    },

    isCollapsed(): boolean {
      return !destroyed && collapsed;
    },

    destroy(): void {
      // One-shot. This early return is what makes a late second destroy() — say
      // from a stale reference held after a remount — harmless: it never reaches
      // the teardown below, so it cannot touch a newer dock.
      if (destroyed) return;
      destroyed = true;
      visible = false;
      // Every listener this mount added, taken off again (panel.js:679-688).
      // The two button listeners are load-bearing: without these lines a click on
      // an orphaned button still runs, which is why neither handler needs its own
      // `destroyed` guard.
      toggle.removeEventListener('click', onToggleClick);
      close.removeEventListener('click', onCloseClick);
      // The `pagehide` one is hygiene, and deliberately kept even though no test
      // can observe it: a stale handler would call destroy() on an
      // already-destroyed controller and short-circuit, so the only cost of
      // leaking it is that this whole closure stays reachable from the view for
      // the life of the page. Mutation testing flags removing this line as an
      // uncaught change — that is expected, and not a reason to delete it.
      view?.removeEventListener('pagehide', onPageHide);
      host.remove();
      // Unconditional, and safe: `current` can only be some OTHER controller if a
      // second dock was mounted, and `mountNexpathDock` refuses to create one
      // while `current` is set — so by the time another exists, this one has
      // already run the line below. Guarding with `current === controller` here
      // would be unreachable code.
      current = null;
    },
  };

  current = controller;
  return controller;
}

/**
 * The dock mounted in this instance, or null. Exists so a caller can ask without
 * mounting as a side effect — `mountNexpathDock()` always creates one.
 */
export function getNexpathDock(): NexpathDockController | null {
  return current;
}
