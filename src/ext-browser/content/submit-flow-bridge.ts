/**
 * HB1 — the ISOLATED-world half of the submit-flow switch.
 *
 * Resolves the switch for this page's site and pushes the answer into the MAIN
 * world (which cannot read async storage at submit time), keeps it
 * fresh, and forwards the page's read-back to the ring buffer.
 *
 * ── RC15: NEVER RESOLVE CONFIG ONCE AT BOOT ─────────────────────────────────
 * MV3 restarts constantly and a developer flipping a key mid-session must not
 * have to reload every tab. `storage.onChanged` re-resolves and re-pushes, so
 * the page world tracks the key rather than a snapshot of it.
 *
 * ── ORDERING ────────────────────────────────────────────────────────────────
 * Two independent async things race at page load: this resolution, and the
 * main-world module script loading. Either can win, so both directions are
 * covered — we push as soon as we resolve, AND we answer the page's
 * `nexpath:submit-flow-request` (which it sends on load) with the current value.
 * A monotonic `seq` makes a late-arriving stale push a no-op on the page side.
 *
 * ── HB1 SCOPE ───────────────────────────────────────────────────────────────
 * Push and observe only. Nothing consumes the value yet; no existing call path
 * changes. The gated fetch path is HB2.
 */
import browser from 'webextension-polyfill';
import { resolveAgentFromHostname, resolveProjectRootFromLocation } from './agents/agent-hosts.js';
import { resolveSubmitFlow, submitFlowStorageKeys, type SubmitFlowResolution } from '../adapters/submit-flow-config.js';
import {
  SUBMIT_FLOW_PUSH_TYPE,
  SUBMIT_FLOW_REQUEST_TYPE,
  SUBMIT_FLOW_STATE_TYPE,
  SUBMIT_FLOW_EVENT_TYPE,
} from '../inject/submit-flow-page.js';
import {
  SUBMIT_DECISION_REQUEST_TYPE,
  SUBMIT_DECISION_RESPONSE_TYPE,
} from '../inject/submit-decision-channel.js';

/** See install-submit-gate.ts — same rationale, same cadence. */
const HOLD_HEARTBEAT_MS = 10_000;

export interface SubmitFlowBridgeDeps {
  win?: Window;
  /** Agent/site string for this page (defaults to the live hostname mapping). */
  site?: string;
  resolve?: (site: string) => Promise<SubmitFlowResolution>;
  /** Subscribe to storage changes; returns nothing. Tests inject. */
  onStorageChanged?: (cb: (changes: Record<string, unknown>, area: string) => void) => void;
  /** Forward the page's read-back to the SW. Failures are swallowed. */
  sendToSw?: (msg: unknown) => void;
  /** Round-trip ask to the SW (decision requests). Rejection ⇒ the caller allows. */
  askSw?: (msg: unknown) => Promise<unknown>;
}

export interface SubmitFlowBridgeHandle {
  /** Re-resolve and push. Exposed for tests and for future explicit refreshes. */
  refresh(): Promise<void>;
  /** The last resolution pushed, or null before the first one completes. */
  last(): SubmitFlowResolution | null;
}

function defaultSendToSw(msg: unknown): void {
  try {
    void browser.runtime.sendMessage(msg).catch(() => { /* SW asleep — diagnostics only */ });
  } catch {
    /* extension context invalidated mid-navigation */
  }
}

function defaultAskSw(msg: unknown): Promise<unknown> {
  return browser.runtime.sendMessage(msg);
}

function defaultOnStorageChanged(cb: (changes: Record<string, unknown>, area: string) => void): void {
  try {
    browser.storage.onChanged.addListener(cb as Parameters<typeof browser.storage.onChanged.addListener>[0]);
  } catch {
    /* no storage events available — the load-time resolution still applies */
  }
}

/**
 * The last resolution this page resolved, for content-script consumers that
 * cannot take the page-world push (Replit's DOM gate). Null until the first
 * resolution completes — and null must be read as DISARMED, the same fail-safe
 * the page world applies.
 */
let lastResolvedForPage: SubmitFlowResolution | null = null;

export function isSubmitFlowArmedForPage(): boolean {
  return lastResolvedForPage?.enabled === true;
}

export function setupSubmitFlowBridge(deps: SubmitFlowBridgeDeps = {}): SubmitFlowBridgeHandle {
  const win = deps.win ?? window;
  const resolve = deps.resolve ?? resolveSubmitFlow;
  const sendToSw = deps.sendToSw ?? defaultSendToSw;
  const onStorageChanged = deps.onStorageChanged ?? defaultOnStorageChanged;
  const askSw = deps.askSw ?? defaultAskSw;
  const watched = new Set(submitFlowStorageKeys());

  // Resolved lazily so an SPA navigation between sites re-reads the hostname
  // rather than a value frozen at content-script load.
  const siteOf = (): string =>
    deps.site ?? resolveAgentFromHostname(win.location.hostname);

  // Read at message time, not at setup: SPA navigations change the path without
  // re-injecting this script (the same rule main-world-injector.ts follows).
  const projectRootOf = (): string =>
    resolveProjectRootFromLocation(win.location.hostname, win.location.pathname, win.location.origin) ?? '';

  let seq = 0;
  let last: SubmitFlowResolution | null = null;

  const push = (resolution: SubmitFlowResolution): void => {
    seq += 1;
    try {
      win.postMessage(
        { type: SUBMIT_FLOW_PUSH_TYPE, enabled: resolution.enabled, source: resolution.source, seq },
        win.location.origin,
      );
    } catch {
      /* opaque origin — nothing to push to; page stays disarmed, which is safe */
    }
  };

  const refresh = async (): Promise<void> => {
    let resolution: SubmitFlowResolution;
    try {
      resolution = await resolve(siteOf());
    } catch {
      // Fail-open, and never as an unhandled rejection: leave the page in
      // whatever state it already holds — DISARMED if this was the first
      // attempt, which is the safe direction. `resolveSubmitFlow` itself never
      // rejects; this covers an injected or future resolver that does.
      return;
    }
    last = resolution;
    lastResolvedForPage = resolution;
    push(resolution);
  };

  // The page asks on load (it may have loaded after our first push), and reports
  // back what it believes after each accepted push.
  win.addEventListener('message', (ev: MessageEvent) => {
    if (ev.source !== win) return;
    const msg = ev.data as { type?: unknown } | null;
    if (msg === null || typeof msg !== 'object') return;

    if (msg.type === SUBMIT_FLOW_REQUEST_TYPE) {
      if (last !== null) push(last);
      else void refresh();
      return;
    }

    if (msg.type === SUBMIT_DECISION_REQUEST_TYPE) {
      // Relay the page's question to the SW and post the answer straight back to
      // the page. Every failure mode answers 'allow': a decision we cannot get
      // must never be able to withhold the user's prompt.
      const req = msg as { requestId?: unknown; prompt?: unknown; submitId?: unknown };
      if (typeof req.requestId !== 'string') return;
      const requestId = req.requestId;
      const answer = (decision: unknown): void => {
        try {
          win.postMessage(
            { type: SUBMIT_DECISION_RESPONSE_TYPE, requestId, decision },
            win.location.origin,
          );
        } catch {
          /* the page's budget will release the hold */
        }
      };
      // Keep the worker alive for as long as the page holds the user's prompt.
      // Without this a long hold ends in a worker restart, the decision dies and
      // the popup is orphaned (live-caught on Firefox 2026-08-26).
      const beat = setInterval(() => {
        sendToSw({ type: 'nexpath:pe-keepalive', projectRoot: projectRootOf() });
      }, HOLD_HEARTBEAT_MS);
      const answerAndStop = (decision: unknown): void => { clearInterval(beat); answer(decision); };
      void askSw({
        type: SUBMIT_DECISION_REQUEST_TYPE,
        site: siteOf(),
        projectRoot: projectRootOf(),
        requestId,
        prompt: typeof req.prompt === 'string' ? req.prompt : '',
        submitId: typeof req.submitId === 'string' ? req.submitId : '',
      }).then(
        (res) => { answerAndStop((res as { decision?: unknown } | null)?.decision ?? { kind: 'allow' }); },
        () => { answerAndStop({ kind: 'allow' }); },
      );
      return;
    }

    if (msg.type === SUBMIT_FLOW_EVENT_TYPE) {
      // One ring event from the gated submit path. Forwarded verbatim except
      // for the site stamp; the SW is what owns the durable buffer.
      const ev = msg as { event?: unknown; data?: unknown };
      if (typeof ev.event !== 'string') return;
      sendToSw({
        type: SUBMIT_FLOW_EVENT_TYPE,
        site: siteOf(),
        event: ev.event,
        data: (typeof ev.data === 'object' && ev.data !== null ? ev.data : {}) as Record<string, unknown>,
      });
      return;
    }

    if (msg.type === SUBMIT_FLOW_STATE_TYPE) {
      // A9 read-back: what the PAGE believes, forwarded verbatim to the ring
      // buffer. Deliberately not compared against `last` here — the value of this
      // record is that it is the page's own answer, not ours.
      const state = msg as { armed?: unknown; source?: unknown; seq?: unknown };
      sendToSw({
        type: SUBMIT_FLOW_STATE_TYPE,
        site: siteOf(),
        armed: state.armed === true,
        source: typeof state.source === 'string' ? state.source : 'unknown',
        seq: typeof state.seq === 'number' ? state.seq : -1,
      });
    }
  });

  onStorageChanged((changes, area) => {
    if (area !== 'local') return;
    if (!Object.keys(changes).some((k) => watched.has(k))) return;
    void refresh();
  });

  void refresh();

  return { refresh, last: () => last };
}
