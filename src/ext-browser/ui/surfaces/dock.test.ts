// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import {
  mountNexpathDock,
  getNexpathDock,
  NEXPATH_DOCK_HOST_ID,
  DOCK_WIDTH_RATIO,
  DOCK_MAX_WIDTH_PX,
  DOCK_MIN_WIDTH_PX,
  DOCK_HEIGHT_RATIO,
  DOCK_Z_INDEX,
  DOCK_COLLAPSED_WIDTH_PX,
  DOCK_COLLAPSED_HEIGHT_PX,
  MIN_TARGET_SIZE_PX,
} from './dock.js';

/** Hosts currently in the page, by the dock's stable id. */
function hosts(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`#${NEXPATH_DOCK_HOST_ID}`)];
}

afterEach(() => {
  // The dock is a module-level singleton; leaving one mounted would leak into the
  // next test. destroy() is also what clears the singleton, so this covers both.
  getNexpathDock()?.destroy();
  document.body.innerHTML = '';
});

describe('mountNexpathDock — host element', () => {
  it('appends exactly one host, carrying the stable id', () => {
    mountNexpathDock();

    expect(hosts()).toHaveLength(1);
    expect(hosts()[0]!.parentElement).toBe(document.body);
  });

  it('starts hidden so an unpositioned host never flashes into the page layout', () => {
    const dock = mountNexpathDock();

    expect(hosts()[0]!.style.display).toBe('none');
    expect(dock.isVisible()).toBe(false);
  });

});

describe('mountNexpathDock — dock geometry (D1.2)', () => {
  it('carries the CLI\'s own docked-popup values, not invented ones', () => {
    // These are re-declared rather than imported (C-5 keeps this layer free of
    // cross-layer imports), so the "keep in sync by hand" note in dock.ts needs
    // teeth. Literals on purpose: every other geometry test derives from these
    // constants, so without this one a wrong value would agree with itself.
    // Source: src/decision-session/screen-geometry.ts.
    expect(DOCK_WIDTH_RATIO).toBe(0.6);       // DEFAULT_POPUP_WIDTH_RATIO
    expect(DOCK_MAX_WIDTH_PX).toBe(1600);     // POPUP_MAX_WIDTH_PX
    expect(DOCK_MIN_WIDTH_PX).toBe(800);      // POPUP_MIN_COLS 80 x DEFAULT_CELL_WIDTH_PX 10
    expect(DOCK_HEIGHT_RATIO).toBe(0.9);      // browser equivalent of 100% of the work area
    expect(DOCK_Z_INDEX).toBe(2147483647);
  });

  it('docks flush right, fixed, above the agent UI', () => {
    mountNexpathDock();
    const style = hosts()[0]!.style;

    expect(style.position).toBe('fixed');
    expect(style.right).toBe('0px');
    expect(style.zIndex).toBe(String(DOCK_Z_INDEX));
  });

  it('sizes from the CLI constants, not hard-coded literals', () => {
    mountNexpathDock();
    const style = hosts()[0]!.style;

    expect(style.width).toBe(`${DOCK_WIDTH_RATIO * 100}%`);
    expect(style.maxWidth).toBe(`${DOCK_MAX_WIDTH_PX}px`);
    expect(style.height).toBe(`${DOCK_HEIGHT_RATIO * 100}%`);
  });

  it('floors the width without letting it exceed the viewport', () => {
    // A bare `min-width: 800px` would always win in CSS and overflow a narrow
    // viewport; min(...) is what supplies the CLI's final viewport clamp.
    mountNexpathDock();

    expect(hosts()[0]!.style.minWidth).toBe(`min(${DOCK_MIN_WIDTH_PX}px,100%)`);
  });

  it('splits the leftover height evenly instead of dumping it at the bottom', () => {
    mountNexpathDock();

    const expectedTop = (100 - DOCK_HEIGHT_RATIO * 100) / 2;
    expect(hosts()[0]!.style.top).toBe(`${expectedTop}%`);
  });

  it('declares the geometry INLINE, where a page stylesheet cannot outrank it', () => {
    mountNexpathDock();
    const host = hosts()[0]!;

    // Every geometry property is on the element's own style attribute.
    for (const prop of ['position', 'top', 'right', 'width', 'max-width', 'min-width', 'height', 'z-index']) {
      expect(host.style.getPropertyValue(prop), prop).not.toBe('');
    }
  });

  it('pins the box model, so a broad page rule cannot move or grow the docked box', () => {
    // Verified exposure: inline styling protects only the properties it declares, and
    // `div { padding; margin; border }` — the kind of rule ordinary sites ship — was
    // observed applying to the host. `margin` alone defeats `right:0`.
    const pageCss = document.createElement('style');
    pageCss.textContent = 'div { padding: 20px; margin: 30px; border: 5px solid red; }';
    document.head.appendChild(pageCss);

    mountNexpathDock();
    const computed = getComputedStyle(hosts()[0]!);

    expect(computed.padding).toBe('0px');
    expect(computed.margin).toBe('0px');
    expect(computed.borderTopWidth).toBe('0px');

    pageCss.remove();
  });

  it('pins visibility and interaction, so a page cannot blank or deaden the dock', () => {
    // Same exposure as `display`, reached by other properties. Each of these was
    // observed applying to the host from a page stylesheet, and each would leave
    // the controller reporting a visible, live dock that the user cannot see or
    // click.
    const pageCss = document.createElement('style');
    pageCss.textContent =
      `#${NEXPATH_DOCK_HOST_ID} { visibility: hidden; opacity: 0.05; pointer-events: none; }`;
    document.head.appendChild(pageCss);

    const dock = mountNexpathDock();
    dock.show();
    const computed = getComputedStyle(hosts()[0]!);

    expect(computed.visibility).toBe('visible');
    expect(computed.opacity).toBe('1');
    expect(computed.pointerEvents).toBe('auto');
    expect(dock.isVisible()).toBe(true);

    pageCss.remove();
  });

  it('pins filter and clip-path, which can hide a box just as completely', () => {
    const pageCss = document.createElement('style');
    pageCss.textContent = `#${NEXPATH_DOCK_HOST_ID} { filter: opacity(0); clip-path: inset(100%); }`;
    document.head.appendChild(pageCss);

    mountNexpathDock();
    const computed = getComputedStyle(hosts()[0]!);

    expect(computed.filter).toBe('none');
    expect(computed.clipPath).toBe('none');

    pageCss.remove();
  });

  it('pins transform, so a page cannot relocate or scale the dock', () => {
    const pageCss = document.createElement('style');
    pageCss.textContent = `#${NEXPATH_DOCK_HOST_ID} { transform: scale(0.2) translateX(-500px); }`;
    document.head.appendChild(pageCss);

    mountNexpathDock();

    expect(getComputedStyle(hosts()[0]!).transform).toBe('none');

    pageCss.remove();
  });

  it('the CSS clamp resolves exactly like the CLI computeDockedPopupGeometry order', () => {
    // The comment in dock.ts claims these two forms agree. Pin that claim, so an
    // edit to either the constants or the declarations cannot silently drift.
    const cliOrder = (viewport: number): number => {
      let w = Math.round(viewport * DOCK_WIDTH_RATIO);
      w = Math.min(w, DOCK_MAX_WIDTH_PX);   // ultrawide cap
      w = Math.max(w, DOCK_MIN_WIDTH_PX);   // readability floor
      w = Math.min(w, viewport);            // never exceed the work area
      return w;
    };
    // CSS used width = max(min-width, min(max-width, width)),
    // with min-width itself being min(800px, 100%).
    const cssOrder = (viewport: number): number => {
      const width = Math.round(viewport * DOCK_WIDTH_RATIO);
      const minWidth = Math.min(DOCK_MIN_WIDTH_PX, viewport);
      return Math.max(minWidth, Math.min(DOCK_MAX_WIDTH_PX, width));
    };

    for (const viewport of [320, 600, 800, 900, 1024, 1280, 1440, 1920, 2560, 3440, 5120]) {
      expect(cssOrder(viewport), `viewport ${viewport}px`).toBe(cliOrder(viewport));
    }
  });

  it('the clamp actually bites at each boundary', () => {
    const used = (viewport: number): number => {
      const width = Math.round(viewport * DOCK_WIDTH_RATIO);
      return Math.max(Math.min(DOCK_MIN_WIDTH_PX, viewport), Math.min(DOCK_MAX_WIDTH_PX, width));
    };

    expect(used(600)).toBe(600);                  // narrower than the floor: viewport wins
    expect(used(1000)).toBe(DOCK_MIN_WIDTH_PX);   // 60% would be 600: floor wins
    expect(used(2000)).toBe(1200);                // plain 60%
    expect(used(4000)).toBe(DOCK_MAX_WIDTH_PX);   // 60% would be 2400: cap wins
  });
});

describe('mountNexpathDock — closed shadow root', () => {
  it('attaches a CLOSED root, so the page cannot reach in through host.shadowRoot', () => {
    mountNexpathDock();

    expect(hosts()[0]!.shadowRoot).toBeNull();
  });

  it('puts mountEl inside that closed root, out of the page document', () => {
    const dock = mountNexpathDock();
    const root = dock.mountEl.getRootNode() as ShadowRoot;

    expect(root).toBeInstanceOf(ShadowRoot);
    expect(root.mode).toBe('closed');
    expect(root.host).toBe(hosts()[0]);
    // Connected to the page, yet not findable from the document — the isolation
    // boundary the host exists to create.
    expect(dock.mountEl.isConnected).toBe(true);
    expect(document.contains(dock.mountEl)).toBe(false);
  });

  it('gives renderers an element, never the shadow root itself', () => {
    const dock = mountNexpathDock();

    expect(dock.mountEl).toBeInstanceOf(HTMLElement);
    expect(dock.mountEl.parentNode).toBe(dock.mountEl.getRootNode());
  });
});

describe('mountNexpathDock — mount once', () => {
  it('returns the same controller and creates no second host', () => {
    const first = mountNexpathDock();
    const second = mountNexpathDock();

    expect(second).toBe(first);
    expect(second.mountEl).toBe(first.mountEl);
    expect(hosts()).toHaveLength(1);
  });

  it('preserves what a renderer already drew when mount is called again', () => {
    const first = mountNexpathDock();
    first.mountEl.textContent = 'rendered by a surface';

    expect(mountNexpathDock().mountEl.textContent).toBe('rendered by a surface');
  });

  it('removes a stale host left by a previous content-script instance', () => {
    // A prior instance's host: same id, unreachable shadow root, not ours.
    const stale = document.createElement('div');
    stale.id = NEXPATH_DOCK_HOST_ID;
    stale.attachShadow({ mode: 'closed' });
    document.body.appendChild(stale);

    const dock = mountNexpathDock();

    expect(hosts()).toHaveLength(1);
    expect(stale.isConnected).toBe(false);
    expect(hosts()[0]).toBe((dock.mountEl.getRootNode() as ShadowRoot).host);
  });

  it('getNexpathDock reports the mounted dock without mounting one itself', () => {
    expect(getNexpathDock()).toBeNull();
    expect(hosts()).toHaveLength(0);

    const dock = mountNexpathDock();

    expect(getNexpathDock()).toBe(dock);
  });
});

describe('NexpathDockController — collapse affordance (D1.3)', () => {
  /** The toggle lives in the closed shadow root; reach it through a known sibling. */
  function toggle(dock: { mountEl: HTMLElement }): HTMLButtonElement {
    const root = dock.mountEl.getRootNode() as ShadowRoot;
    return root.querySelector('.np-dock-toggle') as HTMLButtonElement;
  }

  it('the tab meets the minimum target size — it is the only way back when collapsed', () => {
    // A literal floor, not a value derived from the constant, so shrinking the tab
    // has to be a deliberate decision rather than a quiet edit.
    expect(MIN_TARGET_SIZE_PX).toBe(24);                                  // WCAG 2.2 SC 2.5.8 (AA)
    expect(DOCK_COLLAPSED_WIDTH_PX).toBeGreaterThanOrEqual(MIN_TARGET_SIZE_PX);
    expect(DOCK_COLLAPSED_HEIGHT_PX).toBeGreaterThanOrEqual(MIN_TARGET_SIZE_PX);
  });

  it('is a real button, so it is focusable and keyboard-activated for free', () => {
    const dock = mountNexpathDock();
    const el = toggle(dock);

    expect(el).toBeInstanceOf(HTMLButtonElement);
    expect(el.type).toBe('button');
  });

  it('is a sibling of mountEl, so a surface clearing its own subtree cannot delete it', () => {
    const dock = mountNexpathDock();

    dock.mountEl.innerHTML = '';
    dock.mountEl.replaceChildren();

    expect(toggle(dock)).not.toBeNull();
    expect(toggle(dock).isConnected).toBe(true);
    // The dock's chrome styles survive the same way.
    const root = dock.mountEl.getRootNode() as ShadowRoot;
    expect(root.querySelector('style')?.textContent).toContain('.np-dock-toggle');
  });

  it('starts expanded and says so', () => {
    const dock = mountNexpathDock();

    expect(dock.isCollapsed()).toBe(false);
    expect(toggle(dock).getAttribute('aria-expanded')).toBe('true');
    expect(toggle(dock).getAttribute('aria-label')).toBe('Collapse nexpath');
  });

  it('clicking the toggle collapses the dock to its tab, and clicking again restores it', () => {
    const dock = mountNexpathDock();
    dock.show();

    toggle(dock).click();

    expect(dock.isCollapsed()).toBe(true);
    expect(hosts()[0]!.style.width).toBe(`${DOCK_COLLAPSED_WIDTH_PX}px`);
    expect(hosts()[0]!.style.height).toBe(`${DOCK_COLLAPSED_HEIGHT_PX}px`);
    expect(toggle(dock).getAttribute('aria-expanded')).toBe('false');
    expect(toggle(dock).getAttribute('aria-label')).toBe('Expand nexpath');

    toggle(dock).click();

    expect(dock.isCollapsed()).toBe(false);
    expect(hosts()[0]!.style.width).toBe(`${DOCK_WIDTH_RATIO * 100}%`);
    expect(hosts()[0]!.style.height).toBe(`${DOCK_HEIGHT_RATIO * 100}%`);
  });

  it('the expanded 800px floor does not survive into the collapsed tab', () => {
    // Left behind, min-width would keep a "collapsed" dock 800px wide — a silent,
    // total failure of the affordance.
    const dock = mountNexpathDock();

    dock.collapse();

    expect(hosts()[0]!.style.minWidth).toBe('0');
    expect(hosts()[0]!.style.maxWidth).toBe('none');
  });

  it('keeps the dock pinned and reset while collapsed', () => {
    const dock = mountNexpathDock();

    dock.collapse();
    const style = hosts()[0]!.style;

    expect(style.position).toBe('fixed');
    expect(style.right).toBe('0px');
    expect(style.zIndex).toBe(String(DOCK_Z_INDEX));
    expect(style.margin).toBe('0px');
    expect(style.padding).toBe('0px');
    expect(style.transform).toBe('none');
  });

  it('collapse() and expand() are idempotent', () => {
    const dock = mountNexpathDock();

    dock.collapse();
    dock.collapse();
    expect(dock.isCollapsed()).toBe(true);

    dock.expand();
    dock.expand();
    expect(dock.isCollapsed()).toBe(false);
  });

  it('collapsing does not show a hidden dock, and showing does not expand a collapsed one', () => {
    const dock = mountNexpathDock();

    dock.collapse();
    expect(dock.isVisible()).toBe(false);
    expect(hosts()[0]!.style.display).toBe('none');

    dock.show();
    expect(dock.isCollapsed()).toBe(true);
    expect(hosts()[0]!.style.display).toBe('block');
    expect(hosts()[0]!.style.width).toBe(`${DOCK_COLLAPSED_WIDTH_PX}px`);
  });

  it('keeps the same top edge when collapsed, so the control stays under the cursor', () => {
    // The toggle is pinned to the host's top-right in both states, so sharing the
    // top edge is what stops it jumping when you click it.
    const dock = mountNexpathDock();
    const expandedTop = hosts()[0]!.style.top;

    dock.collapse();

    expect(hosts()[0]!.style.top).toBe(expandedTop);
    expect(hosts()[0]!.style.top).toBe(`${(100 - DOCK_HEIGHT_RATIO * 100) / 2}%`);
  });

  it('sits in the top-right corner, clear of the CLI frame rail on the left edge', () => {
    // The rail is the leftmost column of every CLI frame; a control on it would
    // break the parity this workstream exists for. Both dock buttons share
    // `.np-dock-btn`, which is where the top-right anchoring lives.
    const dock = mountNexpathDock();
    const css = (dock.mountEl.getRootNode() as ShadowRoot).querySelector('style')!.textContent!;
    const shared = css.slice(css.indexOf('.np-dock-btn {'), css.indexOf('.np-dock-btn:hover'));

    expect(shared).toContain('top: 0');
    expect(shared).not.toContain('left:');
    // Neither control is ever anchored to the left edge.
    expect(css).not.toMatch(/\.np-dock-(btn|toggle|close)[^{]*\{[^}]*left:/);
  });

  it('is one button in two presentations — a corner square, then the whole tab', () => {
    const dock = mountNexpathDock();
    const root = dock.mountEl.getRootNode() as ShadowRoot;
    const css = root.querySelector('style')!.textContent!;

    // Expanded: a square that still clears the minimum target size.
    expect(css).toContain(`width: ${DOCK_COLLAPSED_WIDTH_PX}px`);
    expect(css).toContain(`height: ${MIN_TARGET_SIZE_PX}px`);
    // Collapsed: the same element grows to fill the tab — no second control.
    expect(css).toContain(`height: ${DOCK_COLLAPSED_HEIGHT_PX}px`);
    expect(root.querySelectorAll('.np-dock-toggle')).toHaveLength(1);
  });

  it('flags its collapsed presentation with a class, so one element serves both states', () => {
    const dock = mountNexpathDock();

    expect(toggle(dock).classList.contains('np-dock-toggle--collapsed')).toBe(false);

    dock.collapse();
    expect(toggle(dock).classList.contains('np-dock-toggle--collapsed')).toBe(true);

    dock.expand();
    expect(toggle(dock).classList.contains('np-dock-toggle--collapsed')).toBe(false);
  });

  it('the toggle is inert once the dock is destroyed', () => {
    const dock = mountNexpathDock();
    const el = toggle(dock);
    // Keep the host reference: after destroy it is detached, and asserting only
    // through isCollapsed() would pass even if the click still repainted it.
    const hostEl = hosts()[0]!;
    const widthBefore = hostEl.style.width;
    dock.destroy();

    el.click();

    expect(dock.isCollapsed()).toBe(false);
    expect(hostEl.style.width).toBe(widthBefore);
    expect(hosts()).toHaveLength(0);
  });
});

describe('NexpathDockController — close button (D1.4)', () => {
  function btn(dock: { mountEl: HTMLElement }, cls: string): HTMLButtonElement {
    const root = dock.mountEl.getRootNode() as ShadowRoot;
    return root.querySelector(cls) as HTMLButtonElement;
  }
  const closeBtn = (d: { mountEl: HTMLElement }) => btn(d, '.np-dock-close');

  it('is a real button carrying the glyph the contract names', () => {
    const dock = mountNexpathDock();
    const el = closeBtn(dock);

    expect(el).toBeInstanceOf(HTMLButtonElement);
    expect(el.type).toBe('button');
    expect(el.textContent).toBe('✕');
    expect(el.getAttribute('aria-label')).toBe('Close nexpath');
  });

  it('is a sibling of mountEl, so a surface cannot delete it either', () => {
    const dock = mountNexpathDock();

    dock.mountEl.replaceChildren();

    expect(closeBtn(dock).isConnected).toBe(true);
  });

  it('sits outermost, with collapse to its left — window-chrome order', () => {
    const dock = mountNexpathDock();
    const css = (dock.mountEl.getRootNode() as ShadowRoot).querySelector('style')!.textContent!;

    expect(css).toContain('.np-dock-close { right: 0;');
    expect(css).toContain(`.np-dock-toggle { right: ${DOCK_COLLAPSED_WIDTH_PX}px; }`);
  });

  it('hides the dock and reports dismiss', () => {
    const seen: unknown[] = [];
    const dock = mountNexpathDock({ onEvent: (e) => seen.push(e) });
    dock.show();

    closeBtn(dock).click();

    expect(dock.isVisible()).toBe(false);
    expect(hosts()[0]!.style.display).toBe('none');
    expect(seen).toEqual([{ type: 'dismiss' }]);
  });

  it('closes, never destroys — show() brings the same dock back', () => {
    const dock = mountNexpathDock();
    dock.show();
    dock.mountEl.textContent = 'surface content';

    closeBtn(dock).click();
    dock.show();

    expect(dock.isVisible()).toBe(true);
    expect(hosts()).toHaveLength(1);
    expect(dock.mountEl.textContent).toBe('surface content');
    expect(getNexpathDock()).toBe(dock);
  });

  it('works with no listener at all — nothing is wired yet under C-5', () => {
    const dock = mountNexpathDock();
    dock.show();

    expect(() => closeBtn(dock).click()).not.toThrow();
    expect(dock.isVisible()).toBe(false);
  });

  it('hides BEFORE notifying, so a broken consumer cannot keep the dock on screen', () => {
    // Asserted through ordering rather than by throwing: an exception inside a DOM
    // listener never propagates out of click(), so a throw-based test would prove
    // nothing. What matters is that the dock is already hidden by the time any
    // consumer code runs.
    let visibleWhenNotified: boolean | null = null;
    let displayWhenNotified: string | null = null;
    const dock = mountNexpathDock({
      onEvent: () => {
        visibleWhenNotified = dock.isVisible();
        displayWhenNotified = hosts()[0]!.style.display;
      },
    });
    dock.show();

    closeBtn(dock).click();

    expect(visibleWhenNotified).toBe(false);
    expect(displayWhenNotified).toBe('none');
  });

  it('is withdrawn while collapsed — the tab does one thing', () => {
    const dock = mountNexpathDock();

    expect(closeBtn(dock).classList.contains('np-dock-close--hidden')).toBe(false);

    dock.collapse();
    expect(closeBtn(dock).classList.contains('np-dock-close--hidden')).toBe(true);

    dock.expand();
    expect(closeBtn(dock).classList.contains('np-dock-close--hidden')).toBe(false);
  });

  it('is inert once the dock is destroyed', () => {
    const seen: unknown[] = [];
    const dock = mountNexpathDock({ onEvent: (e) => seen.push(e) });
    const el = closeBtn(dock);
    dock.destroy();

    el.click();

    expect(seen).toEqual([]);
  });

  it('mount options are ignored on a second call — the first caller owns the listener', () => {
    const first: unknown[] = [];
    const second: unknown[] = [];
    const dock = mountNexpathDock({ onEvent: (e) => first.push(e) });
    mountNexpathDock({ onEvent: (e) => second.push(e) });

    closeBtn(dock).click();

    expect(first).toEqual([{ type: 'dismiss' }]);
    expect(second).toEqual([]);
  });
});

describe('NexpathDockController — show / hide', () => {
  it('show reveals the host and hide conceals it', () => {
    const dock = mountNexpathDock();

    dock.show();
    expect(hosts()[0]!.style.display).toBe('block');
    expect(dock.isVisible()).toBe(true);

    dock.hide();
    expect(hosts()[0]!.style.display).toBe('none');
    expect(dock.isVisible()).toBe(false);
  });

  it('show wins over an agent page rule targeting our host', () => {
    // The host is in the page's light DOM — only its shadow contents are isolated —
    // so page CSS can match it. Clearing the inline display would hand the decision
    // to that rule and show() would fail silently.
    const pageCss = document.createElement('style');
    pageCss.textContent = `#${NEXPATH_DOCK_HOST_ID} { display: none; }`;
    document.head.appendChild(pageCss);

    const dock = mountNexpathDock();
    dock.show();

    expect(getComputedStyle(hosts()[0]!).display).toBe('block');

    pageCss.remove();
  });

  it('hide tears nothing down — the host, the root and rendered content survive', () => {
    const dock = mountNexpathDock();
    dock.mountEl.textContent = 'still here';
    dock.show();

    dock.hide();

    expect(hosts()).toHaveLength(1);
    expect(dock.mountEl.isConnected).toBe(true);
    expect(dock.mountEl.textContent).toBe('still here');
  });

  it('never clobbers the geometry, however many times visibility flips', () => {
    // show/hide repaint the whole cssText rather than poking `display`, so the
    // guarantee is that every geometry declaration survives the round trip.
    const dock = mountNexpathDock();
    const style = hosts()[0]!.style;

    dock.show();
    dock.hide();
    dock.show();

    expect(style.position).toBe('fixed');
    expect(style.right).toBe('0px');
    expect(style.width).toBe(`${DOCK_WIDTH_RATIO * 100}%`);
    expect(style.maxWidth).toBe(`${DOCK_MAX_WIDTH_PX}px`);
    expect(style.minWidth).toBe(`min(${DOCK_MIN_WIDTH_PX}px,100%)`);
    expect(style.height).toBe(`${DOCK_HEIGHT_RATIO * 100}%`);
    expect(style.zIndex).toBe(String(DOCK_Z_INDEX));
  });

  it('is idempotent — repeated show / hide keep the same state', () => {
    const dock = mountNexpathDock();

    dock.show();
    dock.show();
    expect(dock.isVisible()).toBe(true);

    dock.hide();
    dock.hide();
    expect(dock.isVisible()).toBe(false);
  });
});

describe('NexpathDockController — re-attach guard and pagehide teardown (D1.5)', () => {
  it('re-attaches a host an SPA re-render tore out of the page', () => {
    // A mount-once dock whose host is orphaned is dead with no way back:
    // mountNexpathDock() would just hand back the same controller.
    const dock = mountNexpathDock();
    dock.mountEl.textContent = 'surface content';
    document.body.innerHTML = '';            // the SPA wipes <body>
    expect(hosts()).toHaveLength(0);

    dock.show();

    expect(hosts()).toHaveLength(1);
    expect(dock.isVisible()).toBe(true);
    expect(dock.mountEl.textContent).toBe('surface content');
    expect(dock.mountEl.isConnected).toBe(true);
  });

  it('leaves an attached host exactly where it is', () => {
    // Re-appending unconditionally would MOVE the node to the end of <body> on
    // every show — a detach/re-attach that a real browser pays for with a reflow
    // and a lost focus. Observable here as a change in sibling order.
    const dock = mountNexpathDock();
    const after = document.createElement('div');
    document.body.appendChild(after);

    dock.show();
    dock.show();

    expect(hosts()).toHaveLength(1);
    expect(hosts()[0]!.nextElementSibling).toBe(after);
  });

  it('tears the dock down on pagehide', () => {
    const dock = mountNexpathDock();
    dock.show();

    window.dispatchEvent(new Event('pagehide'));

    expect(hosts()).toHaveLength(0);
    expect(getNexpathDock()).toBeNull();
    expect(dock.isVisible()).toBe(false);
  });

  it('a fresh dock can be mounted after a pagehide teardown', () => {
    const first = mountNexpathDock();
    window.dispatchEvent(new Event('pagehide'));

    const second = mountNexpathDock();

    expect(second).not.toBe(first);
    expect(hosts()).toHaveLength(1);
  });

  it('a destroyed dock never tears down the live one on pagehide', () => {
    // destroy() also removes the pagehide listener. That removal is not
    // behaviourally observable on its own — a stale handler would call destroy()
    // on an already-destroyed controller and short-circuit — so what is asserted
    // here is the property that actually matters: after a remount, pagehide
    // affects exactly the live dock and nothing else.
    const first = mountNexpathDock();
    first.destroy();
    const second = mountNexpathDock();
    second.show();

    window.dispatchEvent(new Event('pagehide'));

    expect(getNexpathDock()).toBeNull();
    expect(hosts()).toHaveLength(0);
    expect(second.isVisible()).toBe(false);
  });

  it('mounts into a document with no view, and adds no listener there', () => {
    // `doc.defaultView` is null for a detached document. The optional call is what
    // keeps that from throwing during mount.
    const detached = document.implementation.createHTMLDocument('detached');

    const dock = mountNexpathDock({ doc: detached });

    expect(detached.getElementById(NEXPATH_DOCK_HOST_ID)).not.toBeNull();
    expect(() => dock.destroy()).not.toThrow();
  });

  it('pagehide after destroy is inert', () => {
    const dock = mountNexpathDock();
    dock.destroy();

    expect(() => window.dispatchEvent(new Event('pagehide'))).not.toThrow();
    expect(getNexpathDock()).toBeNull();
  });

  it('a destroyed dock does not re-attach itself on a stale show()', () => {
    const dock = mountNexpathDock();
    dock.destroy();

    dock.show();

    expect(hosts()).toHaveLength(0);
    expect(dock.isVisible()).toBe(false);
  });
});

describe('NexpathDockController — destroy', () => {
  it('removes the host from the page', () => {
    const dock = mountNexpathDock();
    dock.show();

    dock.destroy();

    expect(hosts()).toHaveLength(0);
    expect(dock.mountEl.isConnected).toBe(false);
    expect(dock.isVisible()).toBe(false);
  });

  it('clears the singleton, so a later mount starts a fresh lifetime', () => {
    const first = mountNexpathDock();
    first.destroy();

    expect(getNexpathDock()).toBeNull();

    const second = mountNexpathDock();

    expect(second).not.toBe(first);
    expect(second.mountEl).not.toBe(first.mountEl);
    expect(hosts()).toHaveLength(1);
  });

  it('makes every later call a safe no-op', () => {
    const dock = mountNexpathDock();
    dock.destroy();

    expect(() => {
      dock.show();
      dock.hide();
      dock.destroy();
    }).not.toThrow();
    expect(dock.isVisible()).toBe(false);
    expect(hosts()).toHaveLength(0);
  });

  it('is one-shot — a late destroy() from a stale reference cannot unmount the newer dock', () => {
    const first = mountNexpathDock();
    first.destroy();
    const second = mountNexpathDock();

    first.destroy(); // stale reference, called after a remount

    expect(getNexpathDock()).toBe(second);
    expect(second.mountEl.isConnected).toBe(true);
    expect(hosts()).toHaveLength(1);
  });

  it('a destroyed dock cannot be re-shown, even if its orphaned host is re-attached', () => {
    // The host is detached but still referenced — exactly the situation D1.5's
    // re-attach guard will create when it re-appends a host an SPA re-render tore
    // out. A destroyed dock must stay dead through that.
    const dock = mountNexpathDock();
    const hostEl = hosts()[0]!;
    dock.destroy();

    dock.show();

    expect(hostEl.style.display).toBe('none');
    document.body.appendChild(hostEl);
    expect(hostEl.style.display).toBe('none');
    expect(dock.isVisible()).toBe(false);
  });

  it('a stale show()/hide() cannot resurrect or disturb the newer dock either', () => {
    const first = mountNexpathDock();
    first.destroy();
    const second = mountNexpathDock();
    second.show();

    first.show();
    first.hide();

    expect(second.isVisible()).toBe(true);
    expect(hosts()).toHaveLength(1);
    expect(hosts()[0]!.style.display).toBe('block');
  });
});

// The renderer's frame is `height:100%`; that resolves against the MOUNT. As a
// bare div the mount was height:auto, so the frame ignored the dock and a long
// prompt ran ~1100px below the viewport with no scrollbar — footer and every row
// under the body unreachable (measured in real Chrome, 2026-08-26). jsdom does no
// layout, so these pin the CONTRACT that was missing.
describe('the mount carries the dock height (long-prompt overflow fix)', () => {
  it('the mount element is classed so the stylesheet can size it', () => {
    const dock = mountNexpathDock({ doc: document });
    try {
      expect(dock.mountEl.className).toBe('np-dock-mount');
    } finally { dock.destroy(); }
  });

  it('the dock stylesheet gives that class a real height and clips it', () => {
    const dock = mountNexpathDock({ doc: document });
    try {
      const root = dock.mountEl.getRootNode() as ShadowRoot;
      const css = [...root.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
      expect(css).toMatch(/\.np-dock-mount\s*\{[^}]*height:\s*100%/);
      expect(css).toMatch(/\.np-dock-mount\s*\{[^}]*overflow:\s*hidden/);
    } finally { dock.destroy(); }
  });

  it('the host clips its shadow content, so a collapsed dock cannot paint down the page edge', () => {
    const dock = mountNexpathDock({ doc: document });
    try {
      const host = document.getElementById(NEXPATH_DOCK_HOST_ID) as HTMLElement;
      dock.show();
      expect(host.style.overflow).toBe('hidden');
    } finally { dock.destroy(); }
  });

  it('collapsing hides the mount entirely (not just shrinks the host)', () => {
    const dock = mountNexpathDock({ doc: document });
    try {
      dock.show();
      expect(dock.mountEl.style.display).toBe('block');
      const root = dock.mountEl.getRootNode() as ShadowRoot;
      (root.querySelector('.np-dock-toggle') as HTMLButtonElement).click();
      expect(dock.mountEl.style.display).toBe('none');
    } finally { dock.destroy(); }
  });
});
