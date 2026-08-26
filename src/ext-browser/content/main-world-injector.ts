import browser from 'webextension-polyfill';
import { resolveAgentFromHostname, resolveProjectRootFromLocation } from './agents/agent-hosts.js';
import { isPromptCapturedMsg, isResponseStoppedMsg, isShowAdvisoryMsg, isShowPeMsg } from './ipc.js';
import { setupSubmitFlowBridge } from './submit-flow-bridge.js';
import type { PromptSubmitMsg, ResponseStopMsg, AdvisoryFooterIntentMsg, PromptInjectedMsg, AdvisoryTerminalMsg, PeCommandMsg, PeTerminalNoticeMsg, PeKeepaliveMsg } from './ipc.js';
import { isPePanelCommandV1 } from '../ui/pe-contract.js';
import type { PanelEvent } from '../../core/ports/ui.port.js';

/**
 * Runs in the ISOLATED content-script world.
 *
 * Responsibilities:
 *   1. Drop a <script> tag pointing at main-world.js (runs in MAIN world to
 *      intercept window.fetch and emit postMessage events).
 *   2. Listen for postMessage events from the MAIN-world script.
 *   3. Forward them to the service worker via chrome.runtime.sendMessage.
 *   4. Listen for service-worker → content messages and hand them to inject.ts.
 */

declare global {
  interface Window {
    __nexpathMainWorldInjectorBootstrapped?: boolean;
  }
}

// ── Resolve project root from current tab URL ─────────────────────────────────

function resolveProjectRoot(): string | null {
  // Per-project session root (CLI parity: session keyed to the project, not the
  // whole site) — see agent-hosts.ts for the shapes and why null means "skip".
  // Read at message time, not module load: SPA navigations change the path
  // without re-injecting this script.
  return resolveProjectRootFromLocation(
    window.location.hostname,
    window.location.pathname,
    window.location.origin,
  );
}

function resolveAgent(): string {
  // Shared hostname→agent table (content/agents/agent-hosts.ts) — extracted in B4
  // when inject.ts's per-agent inject-back dispatch needed the same mapping.
  return resolveAgentFromHostname(window.location.hostname);
}

// browser.runtime.sendMessage() is supposed to transparently wake a terminated/idle
// MV3 service worker, but this has a real, confirmed failure mode: the SW can be
// asleep or mid-restart at the exact moment a message arrives (more likely the longer
// a tab sits idle relative to capture — e.g. a long-running agent turn, or a page-level
// flow like Replit's Publish pipeline running for minutes with no new prompt sent).
// Previously any sendMessage failure was swallowed by an empty catch — completely
// silent, no log, no retry — which is indistinguishable from "nothing was ever
// captured" from the console. Confirmed live 2026-07-03: prompt_submit_received simply
// never appeared for prompts submitted during/after a multi-minute Publish flow, with
// zero error anywhere. Retry once after a short delay (covers the transient wake-up
// race), and always log loudly on final failure so a dropped message is never silent
// again, even if the retry doesn't recover it.
// Escalating retry schedule (2026-08-25): the single 400ms retry was tuned for
// the pre-PE service worker; the engine-carrying bundle is ~3MB and a COLD
// start can take multiple seconds — live-observed on Replit: a real prompt AND
// its response-stop both vanished into a wake gap (kit captured them, the SW
// never received them, ring silent). The schedule must outlast a slow cold
// start; total worst-case wait ≈ 4.5s, after which the drop is logged loudly.
const SEND_RETRY_SCHEDULE_MS = [300, 600, 1200, 2400];

// ── Rejected-capture stash ─────────────────────────────────────────────────────
//
// A prompt typed on a landing/home page has no project context yet, so delivery is
// rejected — but the SAME page instance then soft-navigates into the newly created
// project (Bolt landing → /~/<slug>, Replit home box → /@user/<repl>). The
// capture-rejected feedback lets DOM/fetch channels re-capture it there, but that
// depends on the agent having such a channel on the project page: Replit's newer
// workspace renders user messages with hashed CSS classes only (no data-cy) and its
// chat transport is binary WS — nothing re-captures, the prompt is lost (confirmed
// live 2026-07-06, twice). The stash removes every DOM/transport assumption: hold
// the rejected text here and deliver it directly as soon as the URL resolves to a
// project root. Layering is safe — if a channel re-captures the same text too, the
// SW's cross-page same-text dedup collapses the duplicate.
const PENDING_CAPTURE_TTL_MS = 120_000;
const PENDING_FLUSH_POLL_MS = 1_000;
// sessionStorage (per-origin, per-tab, survives same-tab navigations, dies with the
// tab): module memory alone loses the stash whenever the landing → project
// transition is a HARD navigation — Lovable's dashboard flow is exactly that
// (confirmed live 2026-07-06, internal recon), unlike Bolt/Replit's soft-navs.
// The prompt text stays within the page's own storage, which already held it in
// the composer the user typed it into.
const PENDING_CAPTURE_STORAGE_KEY = 'nexpath_pending_capture';

let pendingRejectedCapture: { promptText: string; agent: string; stashedAt: number } | null = null;
let pendingFlushTimer: ReturnType<typeof setInterval> | null = null;

function persistPendingCapture(): void {
  try {
    if (pendingRejectedCapture === null) {
      window.sessionStorage.removeItem(PENDING_CAPTURE_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(PENDING_CAPTURE_STORAGE_KEY, JSON.stringify(pendingRejectedCapture));
    }
  } catch {
    // storage unavailable (sandboxed page) — module memory still covers soft-navs
  }
}

function stopPendingFlush(): void {
  if (pendingFlushTimer !== null) {
    clearInterval(pendingFlushTimer);
    pendingFlushTimer = null;
  }
}

function armPendingFlush(): void {
  // Always re-arm: a fresh interval per stash keeps the poll's lifetime tied to the
  // newest stash (and never leaves a stale timer from an earlier one running).
  stopPendingFlush();
  pendingFlushTimer = setInterval(() => {
    if (pendingRejectedCapture === null) {
      stopPendingFlush();
      return;
    }
    if (Date.now() - pendingRejectedCapture.stashedAt > PENDING_CAPTURE_TTL_MS) {
      console.log('[nexpath] stashed prompt expired without entering a project — dropped');
      pendingRejectedCapture = null;
      persistPendingCapture();
      stopPendingFlush();
      return;
    }
    const projectRoot = resolveProjectRoot();
    if (projectRoot === null) return;
    const sw: PromptSubmitMsg = {
      type: 'nexpath:prompt-submit',
      promptText: pendingRejectedCapture.promptText,
      projectRoot,
      agent: pendingRejectedCapture.agent,
      tabId: 0,
    };
    sendToServiceWorker(sw);
    console.log('[nexpath] stashed prompt delivered after navigating into the project');
    pendingRejectedCapture = null;
    persistPendingCapture();
    stopPendingFlush();
  }, PENDING_FLUSH_POLL_MS);
}

function stashRejectedCapture(promptText: string, agent: string): void {
  pendingRejectedCapture = { promptText, agent, stashedAt: Date.now() };
  persistPendingCapture();
  armPendingFlush();
}

/**
 * Resume a stash written by a PREVIOUS page instance in this tab (hard navigation)
 * or a previous extension generation (reload). Runs at module scope OUTSIDE the
 * bootstrap guard — a stale-re-injection scenario must also resume, because only
 * the NEWEST generation has a live runtime to deliver through.
 */
function resumePendingCaptureFromStorage(): void {
  try {
    const raw = window.sessionStorage.getItem(PENDING_CAPTURE_STORAGE_KEY);
    if (!raw) return;
    const rec = JSON.parse(raw) as { promptText?: unknown; agent?: unknown; stashedAt?: unknown };
    if (typeof rec.promptText !== 'string' || typeof rec.agent !== 'string' || typeof rec.stashedAt !== 'number'
        || Date.now() - rec.stashedAt > PENDING_CAPTURE_TTL_MS) {
      window.sessionStorage.removeItem(PENDING_CAPTURE_STORAGE_KEY);
      return;
    }
    pendingRejectedCapture = { promptText: rec.promptText, agent: rec.agent, stashedAt: rec.stashedAt };
    armPendingFlush();
  } catch {
    // storage unavailable — nothing to resume
  }
}

function sendToServiceWorker(msg: PromptSubmitMsg | ResponseStopMsg | AdvisoryFooterIntentMsg | PromptInjectedMsg | AdvisoryTerminalMsg | PeCommandMsg | PeTerminalNoticeMsg | PeKeepaliveMsg): void {
  const attempt = (retryIndex: number): void => {
    browser.runtime.sendMessage(msg).catch((err: unknown) => {
      const delay = SEND_RETRY_SCHEDULE_MS[retryIndex];
      if (delay === undefined) {
        console.error('[nexpath] sendMessage failed after all retries, message DROPPED:', msg.type, String(err));
        return;
      }
      console.warn(`[nexpath] sendMessage failed (attempt ${retryIndex + 1}), retrying in ${delay}ms:`, msg.type, String(err));
      setTimeout(() => attempt(retryIndex + 1), delay);
    });
  };
  attempt(0);
}

function setupListeners(): void {
  // ── window.postMessage → service worker ──────────────────────────────────────

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const msg = ev.data as unknown;

    // Read-only debug channel: SW console lines die with the SW (MV3 teardown), and
    // neither chrome:// nor chrome-extension:// pages are reachable by tooling — this
    // is the only way to inspect the last Stage-2 verdict from the page itself.
    // Strictly whitelisted (never the API key or any other storage content).
    if ((msg as { type?: unknown } | null)?.type === 'nexpath:debug-request') {
      void browser.storage.local.get(['nexpath_last_stage2_result', 'nexpath_recent_events', 'nexpath_last_pe_prepare']).then((res) => {
        window.postMessage(
          {
            type: 'nexpath:debug-state',
            lastStage2Result: typeof res['nexpath_last_stage2_result'] === 'string'
              ? res['nexpath_last_stage2_result']
              : null,
            recentEvents: typeof res['nexpath_recent_events'] === 'string'
              ? res['nexpath_recent_events']
              : null,
            // PB5: the last PE prepare's WHITELISTED summary (disposition/
            // sendPolicy/eligibility/counters — never request or body text;
            // see the SW's recordPeDisposition for the exact field set).
            lastPePrepare: typeof res['nexpath_last_pe_prepare'] === 'string'
              ? res['nexpath_last_pe_prepare']
              : null,
          },
          window.location.origin,
        );
      });
      return;
    }

    if (isPromptCapturedMsg(msg)) {
      const projectRoot = resolveProjectRoot();
      if (projectRoot === null) {
        console.log('[nexpath] capture skipped — no project context on this page (e.g. landing page)');
        // Tell the capture kit the text was NOT delivered so its dedup funnel
        // clears the record — otherwise Bolt's soft navigation (landing → new
        // project, same page instance) lets the funnel collapse the project
        // page's re-send of this exact prompt and it is lost forever
        // (confirmed live 2026-07-06).
        window.postMessage(
          { type: 'nexpath:capture-rejected', promptText: msg.promptText },
          window.location.origin,
        );
        // And hold the text ourselves: some agents have no re-capture channel on
        // the project page at all (see stashRejectedCapture).
        stashRejectedCapture(msg.promptText, msg.agent || resolveAgent());
        return;
      }
      const sw: PromptSubmitMsg = {
        type: 'nexpath:prompt-submit',
        promptText: msg.promptText,
        projectRoot,
        agent: msg.agent || resolveAgent(),
        tabId: 0, // SW fills real tab ID from sender.tab.id
      };
      sendToServiceWorker(sw);
      return;
    }

    if (isResponseStoppedMsg(msg)) {
      const projectRoot = resolveProjectRoot();
      if (projectRoot === null) return; // same skip rule as prompt-submit, no log needed
      const sw: ResponseStopMsg = {
        type: 'nexpath:response-stop',
        projectRoot,
        agent: msg.agent || resolveAgent(),
        tabId: 0,
      };
      sendToServiceWorker(sw);
    }
  });

  // ── CLI-parity panel footer shortcuts → service worker ───────────────────────
  //
  // inject.ts (which has no runtime.sendMessage of its own) dispatches this window
  // event for the "Disable for this project" / "Adjust frequency or role" links;
  // we attach the project context and forward it fire-and-forget. Skipped when the
  // page has no project context (same rule as capture) — nothing to disable.
  window.addEventListener('nexpath:footer-intent', (ev) => {
    const detail = (ev as CustomEvent<{ intent?: unknown; value?: unknown }>).detail;
    const intent = detail?.intent;
    if (intent !== 'disable-project' && intent !== 'open-settings' &&
        intent !== 'set-frequency' && intent !== 'set-role') return;
    const projectRoot = resolveProjectRoot();
    if (projectRoot === null) return;
    const sw: AdvisoryFooterIntentMsg = {
      type: 'nexpath:advisory-footer-intent',
      intent,
      projectRoot,
      ...(typeof detail?.value === 'string' ? { value: detail.value } : {}),
    };
    sendToServiceWorker(sw);
  });

  // One-way notice: the panel is injecting + auto-submitting this text — the SW
  // marks it as the last seen prompt so the capture echo dedups (CLI parity with
  // marking injected prompts). Same skip rule as capture: no project, no-op.
  window.addEventListener('nexpath:prompt-injected-notice', (ev) => {
    const detail = (ev as CustomEvent<{ text?: unknown }>).detail;
    if (typeof detail?.text !== 'string') return;
    const projectRoot = resolveProjectRoot();
    if (projectRoot === null) return;
    const sw: PromptInjectedMsg = {
      type: 'nexpath:prompt-injected',
      projectRoot,
      text: detail.text,
    };
    sendToServiceWorker(sw);
  });

  // ── PE panel channels (PB4) — same pattern as the advisory set above ─────────

  // One user command from the PE panel → one short-lived runtime message. The
  // command shape is re-validated here: a compromised page can dispatch window
  // events, so nothing unvalidated is ever forwarded into the SW's popup loop.
  window.addEventListener('nexpath:pe-command-out', (ev) => {
    const detail = (ev as CustomEvent<{ viewSeq?: unknown; command?: unknown }>).detail;
    if (typeof detail?.viewSeq !== 'number' || !isPePanelCommandV1(detail.command)) return;
    const projectRoot = resolveProjectRoot();
    if (projectRoot === null) return;
    const sw: PeCommandMsg = {
      type: 'nexpath:pe-command',
      projectRoot,
      viewSeq: detail.viewSeq,
      command: detail.command,
    };
    sendToServiceWorker(sw);
  });

  // One-way PE terminal-outcome record — the popup loop's in-SW await dies with
  // an MV3 teardown; this reaches whichever SW instance is alive (advisory
  // parity: see nexpath:advisory-terminal-notice below).
  window.addEventListener('nexpath:pe-terminal-out', (ev) => {
    const outcome = (ev as CustomEvent<{ outcome?: unknown }>).detail?.outcome;
    if (outcome !== 'use_current' && outcome !== 'use_original' && outcome !== 'close') return;
    const projectRoot = resolveProjectRoot();
    if (projectRoot === null) return;
    const sw: PeTerminalNoticeMsg = { type: 'nexpath:pe-terminal-notice', projectRoot, outcome };
    sendToServiceWorker(sw);
  });

  // Keepalive heartbeat while the PE panel is open (resets the SW idle timer).
  window.addEventListener('nexpath:pe-keepalive-out', () => {
    const projectRoot = resolveProjectRoot();
    if (projectRoot === null) return;
    const sw: PeKeepaliveMsg = { type: 'nexpath:pe-keepalive', projectRoot };
    sendToServiceWorker(sw);
  });

  // One-way terminal-outcome record — survives the SW teardown that kills the
  // showAdvisory round-trip's resolution (see inject.ts reportTerminal).
  window.addEventListener('nexpath:advisory-terminal-notice', (ev) => {
    const detail = (ev as CustomEvent<{ eventType?: unknown; advisoryId?: unknown }>).detail;
    const eventType = detail?.eventType;
    if (eventType !== 'select' && eventType !== 'skip' && eventType !== 'dismiss') return;
    if (typeof detail?.advisoryId !== 'string') return;
    const sw: AdvisoryTerminalMsg = {
      type: 'nexpath:advisory-terminal',
      eventType,
      advisoryId: detail.advisoryId,
    };
    sendToServiceWorker(sw);
  });

  // ── Service worker → content → inject-back ───────────────────────────────────

  // Must always return a Promise (never a bare value) to match webextension-polyfill's
  // OnMessageListenerAsync shape exactly — a mixed Promise|undefined return doesn't
  // structurally match any of OnMessageListener's 3 alternatives and silently degrades
  // to an untyped callback (confirmed via tsconfig.ext-browser.json, 2026-07-02 — see
  // that file's header comment for why this class of error went uncaught all session).
  browser.runtime.onMessage.addListener((msg: unknown): Promise<unknown> => {
    // show-pe ack (PB4): pe-inject.ts dispatches 'nexpath:pe-view-ack' AFTER the
    // panel is mounted and rendered. The SW's popup loop awaits this resolution
    // as its "the panel really exists" signal (first-render bookkeeping: consume
    // row, mark cooldown), so a page whose PE wiring is absent/stale must FAIL
    // the send, not silently ack it — hence the reject on timeout. The listener
    // must be registered BEFORE the re-dispatch below or a same-tick ack races.
    if (isShowPeMsg(msg)) {
      const ack = new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          window.removeEventListener('nexpath:pe-view-ack', onAck);
          reject(new Error('pe view ack timeout'));
        }, 3_000);
        const onAck = (): void => {
          clearTimeout(timer);
          window.removeEventListener('nexpath:pe-view-ack', onAck);
          resolve({ rendered: true });
        };
        window.addEventListener('nexpath:pe-view-ack', onAck);
      });
      window.dispatchEvent(new CustomEvent('nexpath:sw-message', { detail: msg }));
      return ack;
    }

    // Re-dispatch to inject.ts (which handles panel mounting).
    window.dispatchEvent(new CustomEvent('nexpath:sw-message', { detail: msg }));

    if (!isShowAdvisoryMsg(msg)) return Promise.resolve(undefined);

    // panel-adapter.ts's ContentScriptUIAdapter.showAdvisory() awaits this listener's
    // return value directly (via browser.tabs.sendMessage) — without returning a
    // Promise here, it resolves as undefined almost immediately, which showAdvisory()
    // treats as a synthetic 'dismiss' regardless of what the user actually does. Wait
    // for inject.ts to report the real outcome (dispatched as 'nexpath:panel-event'
    // once the user selects or dismisses) before resolving, so session-state/cooldown
    // bookkeeping reflects reality. Single-in-flight assumption: the engine awaits
    // showAdvisory() before it can fire another advisory, so at most one listener is
    // ever pending at a time — no advisoryId correlation needed.
    return new Promise<PanelEvent>((resolve) => {
      const handlePanelEvent = (ev: Event): void => {
        window.removeEventListener('nexpath:panel-event', handlePanelEvent);
        resolve((ev as CustomEvent<PanelEvent>).detail);
      };
      window.addEventListener('nexpath:panel-event', handlePanelEvent);
    });
  });
}

// ── Idempotent-injection guard ──────────────────────────────────────────────────
//
// MV3 does not remove an old content script's running instance from an already-open
// tab just because the extension was reloaded — reload the extension without also
// hard-refreshing every open target tab, and 2+ independent copies of this script can
// end up alive in the same page simultaneously, each registering its own listeners,
// each independently forwarding every event to the service worker (confirmed root
// cause of duplicate nexpath:prompt-submit/response-stop deliveries, 2026-07-02 — see
// replit.ts's matching guard for the full explanation). A marker on `window` (shared
// across re-injections into the same page) makes this script's setup a no-op for any
// instance after the first.
if (window.__nexpathMainWorldInjectorBootstrapped) {
  console.log('[nexpath] main-world-injector: skipped, already bootstrapped in this page (stale re-injection guard)');
} else {
  window.__nexpathMainWorldInjectorBootstrapped = true;

  // ── Inject the MAIN-world script ──────────────────────────────────────────────

  const script = document.createElement('script');
  script.src = browser.runtime.getURL('inject/main-world.js');
  script.type = 'module';
  (document.head ?? document.documentElement).appendChild(script);
  script.remove();

  setupListeners();

  // HB1: resolve the submit-flow switch and push it into the MAIN world, which
  // cannot read async storage at submit time (analysis §8). Started right after
  // the script tag so the resolution races the module load rather than following
  // it — either order is handled (the page re-requests on load, and a monotonic
  // seq makes a late push a no-op). Nothing consumes the value until HB2.
  // Guarded: a throw here would abort the rest of this module, and the switch is
  // never worth losing the shipped capture wiring over.
  try {
    setupSubmitFlowBridge();
  } catch (err) {
    console.warn('[nexpath] submit-flow bridge failed to start — page stays on today\'s flow', err);
  }
}

// Runs for EVERY instance (see its doc comment) — after the guard block above.
resumePendingCaptureFromStorage();
