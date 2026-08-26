/**
 * HB1 — the MAIN-world half of the submit-flow switch.
 *
 * WHY THIS EXISTS AT ALL. The hold that HB2+ builds lives in the page's own
 * `fetch` closure, because that is the only place that can withhold the request.
 * That closure is synchronous at the moment of submit, and `storage.local` reads
 * are async — so the page world can never read the switch itself.
 * The content script resolves it and PUSHES the answer here, ahead of time.
 *
 * ── DISARMED UNTIL TOLD (the load-bearing rule) ──────────────────────────────
 * The initial state is `armed: false`, i.e. today's behaviour. If the push never
 * arrives — content script blocked, storage broken, extension mid-reload — the
 * page keeps behaving exactly as it does today. Under the inverted-risk rule
 * a failure while holding means the user's prompt never
 * sends, which is worse than no popup, so an unresolved switch must never hold.
 * Note this is NOT the same as the ship polarity: the resolver defaults to ON
 * (HB-D2); this is about never acting on a value we have not received.
 *
 * ── HB1 SCOPE: INERT ─────────────────────────────────────────────────────────
 * Nothing here is read by `patchedFetch` yet — that wiring is HB2. This phase
 * only proves the value arrives, tracks changes, and can be read back.
 *
 * ── READ-BACK (A7/A9: content-verified, never presence-verified) ─────────────
 * Every accepted push is echoed back as `nexpath:submit-flow-state` carrying what
 * the page world NOW BELIEVES — not what storage said. The content script
 * forwards it to the ring buffer, so a debug session can tell "storage says ON"
 * apart from "the page world actually armed".
 */

/** Content script → page: here is the resolved value. */
export const SUBMIT_FLOW_PUSH_TYPE = 'nexpath:submit-flow';
/** Page → content script: I just loaded, send me the current value. */
export const SUBMIT_FLOW_REQUEST_TYPE = 'nexpath:submit-flow-request';
/** Page → content script: this is what I now believe (the A9 read-back). */
export const SUBMIT_FLOW_STATE_TYPE = 'nexpath:submit-flow-state';
/** Page → content script: one ring event from the gated submit path. */
export const SUBMIT_FLOW_EVENT_TYPE = 'nexpath:submit-flow-event';

export interface SubmitFlowPageState {
  armed: boolean;
  /** Resolver reason label, or 'unresolved' before the first accepted push. */
  source: string;
  /** Push sequence this state came from; -1 before the first accepted push. */
  seq: number;
}

export interface SubmitFlowPageHandle {
  /** The single question HB2's gated fetch path will ask. */
  isArmed(): boolean;
  /** Full state, for the read-back channel and tests. */
  state(): SubmitFlowPageState;
}

interface PushMsg {
  type: string;
  enabled?: unknown;
  source?: unknown;
  seq?: unknown;
}

/**
 * Install the page-world listener and announce readiness.
 *
 * `win` is injectable so tests drive a real jsdom window without touching the
 * module's own globals; production passes the page's `window`.
 */
export function setupSubmitFlowPage(win: Window = window): SubmitFlowPageHandle {
  let armed = false;
  let source = 'unresolved';
  let seq = -1;

  // Never let a postMessage failure escape: on a sandboxed/opaque-origin page
  // `targetOrigin` can be "null" and postMessage throws. Diagnostics must not be
  // able to break the page (fail-open includes logging).
  const post = (msg: Record<string, unknown>): void => {
    try {
      win.postMessage(msg, win.location.origin);
    } catch {
      /* diagnostics only */
    }
  };

  const onMessage = (ev: MessageEvent): void => {
    // Same-window discipline, matching main-world-injector.ts's convention —
    // an iframe's messages are not ours.
    if (ev.source !== win) return;
    const msg = ev.data as PushMsg | null;
    if (msg === null || typeof msg !== 'object' || msg.type !== SUBMIT_FLOW_PUSH_TYPE) return;

    // Shape-guard before trusting anything: a malformed push must leave the
    // current state alone rather than coercing it to `false`/`undefined`.
    if (typeof msg.enabled !== 'boolean' || typeof msg.seq !== 'number') return;
    // Stale-guard (the viewSeq pattern the PE dock already uses): an async
    // storage read that resolves late must never overwrite a newer push.
    if (msg.seq <= seq) return;

    armed = msg.enabled;
    seq = msg.seq;
    source = typeof msg.source === 'string' ? msg.source : 'unknown';

    post({ type: SUBMIT_FLOW_STATE_TYPE, armed, source, seq });
  };

  // NOTHING HERE MAY THROW. This runs at module scope in main-world.ts, so an
  // exception would abort the rest of that file — including the globalThis
  // helper exports the agent modules depend on. (The fetch patch is installed
  // BEFORE this point precisely so it can never be lost, but the rule stands.)
  // If we cannot listen, we simply stay disarmed forever, which is today's
  // behaviour.
  try {
    win.addEventListener('message', onMessage);
  } catch {
    /* no listener — permanently disarmed, i.e. unchanged behaviour */
  }

  // The content script may have resolved and pushed before this module existed
  // (module scripts are deferred). Ask for the current value on load; the bridge
  // answers with a fresh push.
  post({ type: SUBMIT_FLOW_REQUEST_TYPE });

  return {
    isArmed: () => armed,
    state: () => ({ armed, source, seq }),
  };
}
