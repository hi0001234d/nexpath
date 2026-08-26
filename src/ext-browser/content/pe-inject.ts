/**
 * Content-side wiring for the prompt-enhancement panel (PB4) — the sibling of
 * inject.ts's advisory wiring, kept in its own module so the shipped advisory
 * flow is not edited (PE-BR-15). Runs in the MAIN world alongside inject.ts
 * (imported from it, same bundle) and talks to the isolated-world
 * main-world-injector via window events, exactly like the advisory panel:
 *
 *   SW ─ show-pe ─▶ injector ─ 'nexpath:sw-message' ─▶ here → mount/render panel
 *   panel command ─ 'nexpath:pe-command-out' ─▶ injector ─ runtime msg ─▶ SW
 *   SW ─ pe-inject ─▶ here → echo-guard notice → inject kit paste + auto-submit
 *
 * Fail-open rules carried in:
 *  - terminal clicks (use enhanced / use original / close) arm a watchdog: if
 *    the SW never answers (MV3 teardown mid-popup), the panel closes and a
 *    toast says nothing was sent — unvalidated text is NEVER injected locally;
 *  - every terminal click also fires a one-way notice so the pending-PE row is
 *    consumed by whichever SW instance is alive;
 *  - a keepalive heartbeat runs while the panel is open so that teardown is
 *    rare in the first place.
 */

import { isPeCloseMsg, isPeInjectMsg, isPePreparingMsg, isShowPeMsg } from './ipc.js';
// The renderer is the UI developer's dock (PR #1) behind the pe-dock-adapter
// bridge — same PePanelControllerV1 contract the retired pe-panel implemented,
// so nothing else in this file or SW-side changed for the swap.
import { mountNexpathPeDock } from '../ui/pe-dock-adapter.js';
import type { PePanelControllerV1, PePanelEventV1 } from '../ui/pe-contract.js';
import { injectPromptText } from './inject-dispatch.js';
import { showToast, showStickyNotice, dismissStickyNotice } from './agents/inject-kit.js';

/**
 * Shown while a submit is held and the enhancement is being prepared.
 *
 * The worker sends `nexpath:pe-preparing` only once it has decided a popup IS
 * coming — a pending enhancement exists and the cooldown has passed. That
 * matters: an earlier version announced the hold on EVERY gated submit, so a
 * prompt that never produced a popup still told the user something was being
 * prepared, which is worse than saying nothing.
 */
const HOLD_NOTICE = 'Nexpath is reviewing this prompt — it has not been sent. A suggestion will appear shortly.';

const KEEPALIVE_INTERVAL_MS = 20_000;
/** How long a terminal click may wait for the SW before failing open (closed). */
const TERMINAL_WATCHDOG_MS = 12_000;
const SUPPORTED_SCHEMA_VERSION = 1;

let controller: PePanelControllerV1 | null = null;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

function stopKeepalive(): void {
  if (keepaliveTimer !== null) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
}

function startKeepalive(): void {
  stopKeepalive();
  keepaliveTimer = setInterval(() => {
    if (!controller?.isOpen()) {
      stopKeepalive();
      return;
    }
    window.dispatchEvent(new CustomEvent('nexpath:pe-keepalive-out'));
  }, KEEPALIVE_INTERVAL_MS);
}

function clearWatchdog(): void {
  if (watchdogTimer !== null) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

/**
 * Fail-open for a NON-terminal command (details apply, go back, …): if the
 * service worker never answers, give the panel back to the user rather than
 * leaving it frozen. Deliberately does not close the popup and sends no
 * terminal notice — nothing was decided.
 */
function armRecoveryWatchdog(): void {
  clearWatchdog();
  watchdogTimer = setTimeout(() => {
    console.warn('[nexpath] PE popup: no response to a non-terminal command — releasing the panel');
    controller?.setBusy(false);
    showToast('Nexpath: that action did not go through — the popup is usable again.');
  }, TERMINAL_WATCHDOG_MS);
}

function armTerminalWatchdog(): void {
  clearWatchdog();
  watchdogTimer = setTimeout(() => {
    // The SW never came back — never inject unvalidated text; close, say so.
    console.warn('[nexpath] PE popup: no response from the service worker — closing, nothing sent');
    showToast('Nexpath: connection lost — nothing was sent.');
    closePanel();
  }, TERMINAL_WATCHDOG_MS);
}

function closePanel(): void {
  clearWatchdog();
  stopKeepalive();
  controller?.hide();
}

function handlePanelEvent(event: PePanelEventV1): void {
  // 'move' is a retired pe-panel affordance — the dock owns its geometry
  // (right-docked with collapse); the contract still carries the event type.
  if (event.type === 'move') return;
  // One user command → one short-lived runtime message (the injector attaches
  // the project root + forwards). Panel goes busy until the SW's next view —
  // EXCEPT feedback (both kinds): it's non-terminal and produces no re-render
  // (the SW persists it host-side), so the panel must stay interactive for
  // the terminal command that follows immediately behind it.
  if (event.command.type !== 'feedback_suggested' && event.command.type !== 'feedback_other') {
    controller?.setBusy(true);
  }
  window.dispatchEvent(new CustomEvent('nexpath:pe-command-out', {
    detail: { viewSeq: event.viewSeq, command: event.command },
  }));
  const t = event.command.type;
  if (t === 'use_current' || t === 'use_original' || t === 'close') {
    // Terminal: also record the outcome one-way (survives SW teardown), and
    // arm the fail-open watchdog for the answer.
    window.dispatchEvent(new CustomEvent('nexpath:pe-terminal-out', { detail: { outcome: t } }));
    armTerminalWatchdog();
  } else if (event.command.type !== 'feedback_suggested' && event.command.type !== 'feedback_other') {
    // EVERY other command goes busy too (above), so every other command needs a
    // way out. `edit_body` — what Enter on "Additional details" sends — had
    // none: a dropped command or a dead worker left the panel behind its
    // progress overlay with the keyboard dead and Escape refused, recoverable
    // only by reloading the page. This releases the panel instead of closing
    // it: the command was NOT terminal, so the user's prompt is still theirs to
    // act on.
    armRecoveryWatchdog();
  }
}

/**
 * Mount the dock adapter once per content-script lifetime. The dock owns its
 * host element, closed shadow root, geometry, and re-attach guard (D1.5) — the
 * old panel-host plumbing that lived here moved behind the adapter.
 */
function ensureMounted(): PePanelControllerV1 {
  if (controller) return controller;
  controller = mountNexpathPeDock({
    onEvent: handlePanelEvent,
    // "Use original prompt" shows a satisfaction step BEFORE it emits its
    // command. On the submit path the user's prompt is HELD until that command
    // lands, and there is no hold ceiling — so an abandoned survey stranded the
    // prompt for good. This announces the decision immediately, over the same
    // teardown-proof one-way channel the terminal click uses, so the worker can
    // release the prompt while feedback carries on. Deliberately no watchdog:
    // nothing is pending, the panel is not busy, and the user is still typing.
    onTerminalIntent: (outcome) => {
      window.dispatchEvent(new CustomEvent('nexpath:pe-terminal-out', { detail: { outcome } }));
    },
  });
  return controller;
}

export function setupPeListener(): void {
  window.addEventListener('nexpath:sw-message', (ev) => {
    const msg = (ev as CustomEvent<unknown>).detail;

    if (isPePreparingMsg(msg)) {
      showStickyNotice(HOLD_NOTICE);
      return;
    }

    if (isShowPeMsg(msg)) {
      dismissStickyNotice();   // the popup itself replaces the notice
      if (msg.payload.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
        console.warn(`[nexpath] PE view schemaVersion mismatch: got ${String(msg.payload.schemaVersion)}, expected ${SUPPORTED_SCHEMA_VERSION}. Ignoring.`);
        return;
      }
      clearWatchdog(); // a fresh view answers whatever command was in flight
      const ctrl = ensureMounted();
      ctrl.show(msg.payload);
      startKeepalive();
      // Ack AFTER the mount so the SW's first-render bookkeeping (consume row,
      // mark cooldown) reflects a panel that actually exists on screen.
      window.dispatchEvent(new CustomEvent('nexpath:pe-view-ack'));
      return;
    }

    if (isPeCloseMsg(msg)) {
      dismissStickyNotice();   // the hold ended without a popup, or it closed
      // Releasing a held prompt closes the popup from the content side — and
      // after an early release that close arrives WHILE the user is answering
      // the feedback step. Closing then would erase the question mid-answer.
      // The panel stays until feedback completes; its own terminal command
      // closes it a moment later (or the terminal watchdog does).
      if (controller?.isCollectingFeedback?.() === true) return;
      closePanel();
      return;
    }

    if (isPeInjectMsg(msg)) {
      clearWatchdog();
      // Echo guard BEFORE the text lands (advisory-select parity): the SW
      // records it as the last seen prompt so the auto-submitted echo dedups
      // instead of re-entering the pipeline (and re-preparing a PE).
      window.dispatchEvent(new CustomEvent('nexpath:prompt-injected-notice', { detail: { text: msg.text } }));
      closePanel();
      void injectPromptText(msg.text)
        .catch(() => { /* clipboardFallback inside the kit already handles paste failure */ });
      return;
    }
  });

  window.addEventListener('pagehide', () => {
    clearWatchdog();
    stopKeepalive();
    controller?.destroy();
    controller = null;
  });
}
