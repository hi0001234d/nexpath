/**
 * The decision channel, page-world side.
 *
 * The page holds the request and asks "allow, or block with this replacement?".
 * The answer comes back through `window.postMessage` — page-direct — rather than
 * through anything the service worker must stay alive to complete.
 *
 * ── WHY THE SW IS NEVER THE ONLY HOLDER ──────────────────────────────────────
 * An MV3 service worker is torn down aggressively. If the outcome lived only in
 * an SW-side promise, a teardown mid-decision would leave the held request
 * unresolved FOREVER — the user's prompt would simply never send. So:
 *
 *   - the PAGE holds the request and owns the ceiling (its death ends the tab,
 *     so there is no orphan case);
 *   - the SW computes and is ALLOWED to die;
 *   - if it dies, no response arrives, the hold budget expires, and the original
 *     is released. Fail-open by construction, not by handler.
 *
 * This module therefore has no timeout of its own. Adding one would create a
 * second, competing ceiling — the budget is the single source of truth for how
 * long a user's prompt may sit.
 */

/** Page → content script: decide this submission. */
export const SUBMIT_DECISION_REQUEST_TYPE = 'nexpath:submit-decision-request';
/** Content script → page: here is the verdict. */
export const SUBMIT_DECISION_RESPONSE_TYPE = 'nexpath:submit-decision-response';

export type ChannelDecision =
  | { kind: 'allow' }
  | { kind: 'block'; replacement: string };

export interface DecisionChannel {
  /**
   * Ask for a verdict. The returned promise settles only when an answer arrives;
   * it is the caller's budget that bounds the wait. Never rejects — an
   * unusable channel resolves `allow`, because a broken channel must not be able
   * to withhold the user's prompt.
   */
  request(ctx: { prompt: string; submitId: string }): Promise<ChannelDecision>;
  /** Outstanding request count (diagnostics/tests). */
  pending(): number;
}

interface ResponseMsg {
  type?: unknown;
  requestId?: unknown;
  decision?: unknown;
}

function parseDecision(raw: unknown): ChannelDecision {
  if (typeof raw !== 'object' || raw === null) return { kind: 'allow' };
  const d = raw as { kind?: unknown; replacement?: unknown };
  if (d.kind === 'block' && typeof d.replacement === 'string' && d.replacement.length > 0) {
    return { kind: 'block', replacement: d.replacement };
  }
  // Anything else — including a malformed "block" with no text — is an allow.
  // A block we cannot honour would lose the prompt; an allow never does.
  return { kind: 'allow' };
}

export function createDecisionChannel(win: Window = window): DecisionChannel {
  const waiting = new Map<string, (d: ChannelDecision) => void>();
  let seq = 0;

  // ONE listener for the channel's lifetime, not one per request: a listener per
  // request leaks on every hold that times out (the common case when a user
  // walks away), and those leaks accumulate for as long as the tab lives.
  try {
    win.addEventListener('message', (ev: MessageEvent) => {
      if (ev.source !== win) return;
      const msg = ev.data as ResponseMsg | null;
      if (msg === null || typeof msg !== 'object') return;
      if (msg.type !== SUBMIT_DECISION_RESPONSE_TYPE) return;
      if (typeof msg.requestId !== 'string') return;

      const resolve = waiting.get(msg.requestId);
      if (resolve === undefined) return; // late answer for an expired hold — ignore
      waiting.delete(msg.requestId);
      resolve(parseDecision(msg.decision));
    });
  } catch {
    /* no listener — every request will resolve allow below */
  }

  return {
    pending: () => waiting.size,

    request(ctx: { prompt: string; submitId: string }): Promise<ChannelDecision> {
      seq += 1;
      const requestId = `${ctx.submitId}#${seq}`;

      return new Promise<ChannelDecision>((resolve) => {
        waiting.set(requestId, resolve);
        try {
          win.postMessage(
            { type: SUBMIT_DECISION_REQUEST_TYPE, requestId, prompt: ctx.prompt, submitId: ctx.submitId },
            win.location.origin,
          );
        } catch {
          // Could not even ask — do not hold the user's prompt on a channel that
          // does not work.
          waiting.delete(requestId);
          resolve({ kind: 'allow' });
        }
      });
    },
  };
}
