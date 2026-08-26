import { isShowAdvisoryMsg } from './ipc.js';
import { mountNexpathPanel } from '../ui/panel.js';
import type {
  PanelController,
  PanelEvent as UiPanelEvent,
  AdvisoryPayload as UiAdvisoryPayload,
} from '../ui/ui-contract.js';
import type { PanelEvent } from '../../core/ports/ui.port.js';
import { showToast } from './agents/inject-kit.js';
// Per-agent inject-back dispatch (B4) — extracted to inject-dispatch.ts in PB4
// so the PE panel wiring shares it; the dispatch table + fallback rule are
// unchanged. (It imports the *-inject.ts modules, NOT the capture entries —
// see inject-dispatch.ts for the duplicate-observer rule.)
import { injectPromptText } from './inject-dispatch.js';
// PE panel wiring (PB4) — a SIBLING listener set for the prompt-enhancement
// popup; the advisory flow in this file is untouched (PE-BR-15).
import { setupPeListener } from './pe-inject.js';

declare global {
  interface Window {
    __nexpathInjectBootstrapped?: boolean;
  }
}

const SUPPORTED_SCHEMA_VERSION = 1;

// ── Real UI panel (B5b) ─────────────────────────────────────────────────────────
//
// B5b swaps the B2 stub for the UI developer's accepted panel.js (mountNexpathPanel).
// Contract difference that shapes this file: the stub was mount-per-advisory; the
// real panel is mount-ONCE per content-script lifetime, then driven via the
// PanelController (show/setBusy/hide/destroy) — see src/ext-browser/ui/ui-contract.ts.
//
// The panel emits the 5 contract PanelEvents. They split into two classes:
//   • TERMINAL (select/skip/dismiss/copy) — end the advisory. Reported back to the SW
//     via the existing `nexpath:panel-event` round-trip (main-world-injector.ts resolves
//     ContentScriptUIAdapter.showAdvisory()'s awaited Promise with it), exactly as the
//     stub did. The SW's showAdvisory result handling is generic over event.type, so
//     nothing SW-side changes. copy CLOSES too (CLI clipboard_only resolves + exits) —
//     the clipboard write happens here, then it reports as a skip like disable-project.
//   • NON-TERMINAL (show-simpler) — the panel stays open. Handled entirely here
//     (level-nav is panel-internal); NOT sent through the
//     `nexpath:panel-event` round-trip (that would prematurely resolve showAdvisory).
//
// This keeps B5b contained to this content-script file + the vendored panel — no
// change to main-world-injector.ts, panel-adapter.ts, the SW, or core.

// The engine's AdvisoryPayload (core/ports/ui.port.ts) and the frozen UI contract's
// AdvisoryPayload are structurally identical field-for-field; the engine's types are
// the widened ones (stage: string vs the 8-value union, etc.), and the engine only
// ever sends valid values. This one boundary cast is the "reconcile at B5b" the
// architecture doc flagged — done here, once, with the runtime shapes proven equal.
let controller: PanelController | null = null;
let panelHost: HTMLDivElement | null = null;
let currentPayload: UiAdvisoryPayload | null = null;

function findOptionTitle(optionId: string): string {
  if (!currentPayload) return '';
  // Flat view first (shipped panel's ids: l1-0/l2-0/l3-0)…
  const inFlat = currentPayload.options.find((o) => o.id === optionId);
  if (inFlat) return inFlat.title;
  // …then the CLI-parity per-level lists (ids like l1-1 that the flat view omits).
  const lv = currentPayload.levels;
  const all = lv ? [...lv.L1, ...lv.L2, ...lv.L3] : [];
  return all.find((o) => o.id === optionId)?.title ?? '';
}

/**
 * CLI-parity footer shortcuts. Fire-and-forget to the SW via a window event that
 * main-world-injector.ts forwards (it holds the runtime.sendMessage + projectRoot).
 * Kept off the `nexpath:panel-event` round-trip so open-settings doesn't resolve
 * (and thereby end) the in-flight advisory.
 */
function dispatchFooterIntent(
  intent: 'disable-project' | 'open-settings' | 'set-frequency' | 'set-role',
  value?: string,
): void {
  window.dispatchEvent(new CustomEvent('nexpath:footer-intent', { detail: { intent, value } }));
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    // Clipboard unavailable/denied — copy is a best-effort convenience; never throw.
  }
}

/** Report a TERMINAL outcome to the SW (resolves showAdvisory's awaited Promise). */
function reportTerminal(event: PanelEvent): void {
  window.dispatchEvent(new CustomEvent('nexpath:panel-event', { detail: event }));
  // ALSO fire-and-forget the outcome (main-world-injector → SW): the round-trip
  // above resolves against the SW instance that opened it, which MV3 may have torn
  // down while the popup sat open — this one-way notice reaches whichever SW
  // instance is alive so the advisory_dismissed record always lands.
  if (event.type === 'select' || event.type === 'skip' || event.type === 'dismiss') {
    window.dispatchEvent(new CustomEvent('nexpath:advisory-terminal-notice', {
      detail: { eventType: event.type, advisoryId: event.advisoryId },
    }));
  }
}

function handlePanelEvent(event: UiPanelEvent): void {
  const advisoryId = currentPayload?.advisoryId ?? '';

  switch (event.type) {
    case 'select': {
      // CLI parity (DecisionSession.ts): inject the selected option's SHORT text —
      // payload `title` (= the CLI's OptionEntry.option), never the longer `body`
      // (= descBase). Confirmed as the CLI's `selectedPrompt` and matches every live
      // test to date. The panel also sends `event.body`, deliberately unused here.
      const title = findOptionTitle(event.optionId);
      // Mark the injected text BEFORE it lands: the SW records it as the last seen
      // prompt so the auto-submitted echo dedups instead of counting as a fresh
      // user prompt (CLI parity — the CLI marks injected prompts to skip
      // re-processing; before this the echo cost a promptCount++).
      window.dispatchEvent(new CustomEvent('nexpath:prompt-injected-notice', { detail: { text: title } }));
      controller?.setBusy(true);
      void injectPromptText(title)
        .catch(() => { /* clipboardFallback already handles paste failure internally */ })
        .finally(() => {
          controller?.setBusy(false);
          controller?.hide();
        });
      reportTerminal({ type: 'select', advisoryId, selectedOptionId: event.optionId });
      break;
    }
    case 'skip': {
      controller?.hide();
      reportTerminal({ type: 'skip', advisoryId });
      break;
    }
    case 'dismiss': {
      controller?.hide();
      reportTerminal({ type: 'dismiss', advisoryId });
      break;
    }
    case 'copy': {
      // CLI `clipboard_only` parity: copy the SAME text a select would inject (the
      // title), then CLOSE — the CLI resolves clipboard_only and exits; it does NOT
      // return to the option list. Terminal like disable-project: hide + record the
      // dismissal so showAdvisory resolves and advisory_dismissed lands.
      void copyToClipboard(findOptionTitle(event.optionId));
      console.log('[nexpath] advisory option copied to clipboard');
      controller?.hide();
      reportTerminal({ type: 'skip', advisoryId });
      break;
    }
    case 'show-simpler': {
      // Panel manages its own L1→L2→L3 level display; engine just notes it. Panel
      // stays open — no terminal report.
      console.log('[nexpath] advisory: show-simpler (level navigation)');
      break;
    }
    case 'disable-project': {
      // CLI Ctrl+X: disable this project (SW writes advisory_frequency:<root>=off),
      // print the re-activation notice, close as SKIP — TtySelectFn's Ctrl+X handler
      // does exactly this ("Advisory disabled. …" + cleanup(SKIP_NOW)).
      dispatchFooterIntent('disable-project');
      showToast('Advisory disabled for this project.');
      controller?.hide();
      reportTerminal({ type: 'skip', advisoryId });
      break;
    }
    case 'open-settings': {
      // Open the extension options page. Panel STAYS open — non-terminal, no report.
      // (The CLI-parity Alt+Shift+T frequency/role chooser is panel-INTERNAL; this event
      // remains for any explicit options-page affordance.)
      dispatchFooterIntent('open-settings');
      break;
    }
    case 'set-frequency': {
      // CLI Ctrl+T → frequency submenu: SW writes advisory_frequency:<root>=<value>.
      // Non-terminal — the panel loops back to its chooser exactly like the CLI.
      dispatchFooterIntent('set-frequency', event.value);
      break;
    }
    case 'set-role': {
      // CLI Ctrl+T → role submenu: SW writes role:<root>=<value>. Non-terminal.
      dispatchFooterIntent('set-role', event.value);
      break;
    }
    case 'move': {
      // User is dragging the popup aside (by its header) to see the screen behind.
      // The engine owns the host's placement, so the panel emits a delta and we move
      // the host. First move converts the centered transform to explicit px so the
      // delta applies without a jump.
      moveHostBy(event.dx, event.dy);
      break;
    }
  }
}

/** Drag the panel host by a pixel delta (see the 'move' PanelEvent). */
function moveHostBy(dx: number, dy: number): void {
  if (!panelHost) return;
  const r = panelHost.getBoundingClientRect(); // current visual position (incl. transform)
  panelHost.style.left = `${Math.round(r.left + dx)}px`;
  panelHost.style.top = `${Math.round(r.top + dy)}px`;
  panelHost.style.transform = 'none';
}

/** Re-center the host (undo any drag) — called each time a NEW advisory is shown. */
function recenterHost(): void {
  if (!panelHost) return;
  panelHost.style.left = '50%';
  panelHost.style.top = '50%';
  panelHost.style.transform = 'translate(-50%, -50%)';
}

/** Lazily create the closed Shadow root + mount the panel ONCE (contract). */
function ensurePanelMounted(): PanelController {
  if (controller) return controller;

  panelHost = document.createElement('div');
  panelHost.id = 'nexpath-panel-host';
  // CENTERED overlay — CLI parity (the CLI popup is a centered "Action Required"
  // window; user requirement 2026-07-08). The engine owns the host's PLACEMENT
  // (the panel styles only its own content, inside the shadow — it can't position
  // its own host). Without this the host is a static, in-flow block appended to
  // <body>. z-index maxed so it sits above the agent's own UI; max-height +
  // auto-scroll so a tall advisory can't overflow a short viewport. The panel is
  // focused on show() (see panel.js) so ↑/↓/Enter work immediately; clicking back
  // into the page releases the keys (focus-scoped, not a modal backdrop) so the
  // user can still type in the agent's chat.
  panelHost.style.cssText =
    'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
    'z-index:2147483647;max-height:calc(100vh - 40px);overflow-y:auto;';
  document.body.appendChild(panelHost);

  // Engine owns the closed Shadow root (sign-off B); panel.js renders INTO the
  // element we pass (it does root.appendChild, not root.attachShadow) — so the
  // Shadow boundary here is what isolates the panel's CSS from the host page.
  const shadow = panelHost.attachShadow({ mode: 'closed' });
  const mountEl = document.createElement('div');
  shadow.appendChild(mountEl);

  controller = mountNexpathPanel(mountEl, { onEvent: handlePanelEvent });
  return controller;
}

function setupListener(): void {
  window.addEventListener('nexpath:sw-message', (ev) => {
    const msg = (ev as CustomEvent<unknown>).detail;
    if (!isShowAdvisoryMsg(msg)) return;

    // Graceful schema guard — log and bail rather than crash or mount a bad payload.
    if (msg.payload.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
      console.warn(
        `[nexpath] Advisory schemaVersion mismatch: got ${msg.payload.schemaVersion}, expected ${SUPPORTED_SCHEMA_VERSION}. Ignoring.`,
      );
      return;
    }

    // See the boundary-cast note above: engine payload ≡ contract payload at runtime.
    currentPayload = msg.payload as unknown as UiAdvisoryPayload;
    const ctrl = ensurePanelMounted();
    // Re-attach if the host was detached from the DOM (a host-page SPA re-render can
    // wipe body children) — the mount-once panel is worthless if its host is orphaned.
    if (panelHost && !panelHost.isConnected) document.body.appendChild(panelHost);
    recenterHost(); // each new advisory starts centered, undoing any previous drag
    ctrl.show(currentPayload);
  });

  // Content scripts have no clean unload hook; pagehide is the closest — tear the
  // panel down so no listeners/timers leak across a navigation away from the agent.
  window.addEventListener('pagehide', () => {
    controller?.destroy();
    controller = null;
    panelHost?.remove();
    panelHost = null;
    currentPayload = null;
  });
}

// Idempotent-injection guard — see main-world-injector.ts / replit.ts for the full
// explanation (stale content-script instances from a prior extension reload can stay
// alive in an already-open tab; without this, 2+ copies of this listener would each
// independently mount a panel for the same advisory).
if (window.__nexpathInjectBootstrapped) {
  console.log('[nexpath] inject: skipped, already bootstrapped in this page (stale re-injection guard)');
} else {
  window.__nexpathInjectBootstrapped = true;
  setupListener();
  setupPeListener();
}
