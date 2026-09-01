/**
 * Turning a verdict's replacement text into the request that actually goes out.
 *
 * ── THE PER-SITE STRATEGY SEAM ───────────────────────────────────────────────
 * Two ways to deliver a replacement exist in principle:
 *
 *   'body_rewrite'        — send ONE request, with the prompt field replaced.
 *   'cancel_and_resubmit' — drop the held request and let the composer path
 *                           submit the replacement instead.
 *
 * Which one a site needs depends on whether it optimistically renders the user's
 * bubble at submit: if it does, a body rewrite would show the ORIGINAL text
 * beside a reply to the REPLACEMENT.
 *
 * Live recon on a real Lovable project settled that question for Lovable: no
 * user bubble is rendered at submit, the request can be held with the app
 * showing its normal busy state, and `message` is the single field to rewrite.
 * So Lovable is `body_rewrite` on evidence.
 *
 * Bolt is `body_rewrite` by INFERENCE, not evidence — the same recon session
 * could not test Bolt at all (the account's composer was locked). Its transport
 * shape is the AI-SDK `messages` array, which rewrites cleanly, but whether Bolt
 * paints an optimistic bubble is UNVERIFIED. That is the one open question in
 * this module, and this table is where the answer lands: flipping a site to
 * 'cancel_and_resubmit' is a one-line change here.
 *
 * `cancel_and_resubmit` is deliberately NOT implemented. Implementing an unproven
 * second delivery path would be speculation, and an unimplemented strategy fails
 * open (the caller sends the original), which is the safe direction.
 */

export type SubstitutionStrategy = 'body_rewrite' | 'composer_intercept';

/**
 * Which mechanism delivers the replacement, per site.
 *
 * `body_rewrite` is the BETTER mechanism where a site supports it: one request,
 * no DOM manipulation, no visible re-paste, and the agent's backend never sees
 * the original at all. It is used wherever the evidence allows.
 *
 * **Bolt: `composer_intercept`** — forced by live evidence. Bolt paints the user's
 * bubble optimistically at submit and abandons a chat after 30 s, so rewriting the
 * body leaves the original on screen and the hold trips the timeout.
 *
 * **Lovable: `body_rewrite`** — its live recon showed the opposite behaviour:
 * the request holds cleanly, the app shows its normal busy state, and NO user
 * bubble is painted at submit, so a rewrite creates no mismatch. `message` is the
 * single field to change.
 *
 * The once-unproven Lovable leg is now PROVEN LIVE (2026-08-31, owner's real
 * project): a blocked submit (23.5s hold, 1496-char replacement) rendered the
 * ENHANCED text as the user bubble in the transcript — body_rewrite is correct
 * for Lovable and no strategy flip is needed.
 *
 * A site listed as `body_rewrite` is gated in the page's fetch patch. A site
 * listed as `composer_intercept` is gated in the capture-phase composer listener
 * instead, and its fetch is left completely untouched — exactly one of the two
 * may ever gate a given site, or a single submission would be decided twice.
 */
export const SITE_SUBSTITUTION_STRATEGY: Record<string, SubstitutionStrategy> = {
  bolt: 'composer_intercept',
  lovable: 'body_rewrite',
};

/** True when the page's fetch patch owns this site's gating. */
export function fetchGateOwnsSite(agent: string): boolean {
  return SITE_SUBSTITUTION_STRATEGY[agent] === 'body_rewrite';
}

/**
 * Replace the newest `{role:'user'}` message's content in an AI-SDK-style body.
 *
 * Mirrors `extractLastUserMessage` exactly — same backwards walk, same guards —
 * so the field we rewrite is always the field we read the prompt from. Returns
 * null if the shape is not what we expect; the caller then sends the original.
 */
export function rewriteLastUserMessage(bodyText: string, replacement: string): string | null {
  try {
    const parsed = JSON.parse(bodyText) as { messages?: Array<{ role?: unknown; content?: unknown }> };
    if (!Array.isArray(parsed.messages)) return null;
    for (let i = parsed.messages.length - 1; i >= 0; i--) {
      const m = parsed.messages[i];
      if (m && m.role === 'user' && typeof m.content === 'string') {
        m.content = replacement;
        return JSON.stringify(parsed);
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Replace Lovable's flat `message` field. Mirrors `extractLovableMessage`'s
 * strict shape guard (`id` must be a `umsg_…` string) so a lookalike payload is
 * never rewritten.
 */
export function rewriteLovableMessage(bodyText: string, replacement: string): string | null {
  try {
    const parsed = JSON.parse(bodyText) as { id?: unknown; message?: unknown };
    if (typeof parsed.id !== 'string' || !parsed.id.startsWith('umsg_')) return null;
    if (typeof parsed.message !== 'string') return null;
    (parsed as { message: string }).message = replacement;
    return JSON.stringify(parsed);
  } catch {
    return null;
  }
}

/**
 * Rewrite `bodyText` for `agent`, or null when it cannot be done safely —
 * unknown agent, unimplemented strategy, unexpected body shape, or an empty
 * replacement. Null always means "send the original".
 */
export function rewriteBodyForAgent(
  agent: string,
  bodyText: string,
  replacement: string,
): string | null {
  if (replacement.length === 0) return null;
  if (SITE_SUBSTITUTION_STRATEGY[agent] !== 'body_rewrite') return null;
  if (agent === 'bolt') return rewriteLastUserMessage(bodyText, replacement);
  if (agent === 'lovable') return rewriteLovableMessage(bodyText, replacement);
  return null;
}

/**
 * Build the argument pair for the replacement request.
 *
 * Two shapes reach us: a plain `fetch(url, {body})` — the common one on both
 * sites — and a `Request` object. For the latter the original Request is used as
 * the template so method, headers, credentials and mode are preserved, with only
 * the body swapped.
 */
export function withReplacedBody(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  newBody: string,
): [RequestInfo | URL, RequestInit | undefined] {
  if (typeof init?.body === 'string') return [input, { ...init, body: newBody }];
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return [new Request(input, { body: newBody }), init];
  }
  // Nothing we know how to rewrite — the caller checks for this by comparing
  // against the original body and falls back to sending the original.
  return [input, init];
}

// ── F4: the orphaned-hold guard (2026-08-31) ─────────────────────────────────
//
// LIVE-CAUGHT: a popup held a Lovable submission ~5 minutes; the page's own
// AbortController gave up while we held, so releasing afterwards fired the
// native fetch with an ALREADY-ABORTED signal — instant AbortError, nothing
// reached the platform, and the user's prompt was gone (the composer had been
// cleared at submit). The 2026-08-26 unbounded-hold ruling assumed "the browser
// has no orphan case"; this is that case, found.
//
// The fix is NOT a clock (a 75s ceiling once threw away a real human decision —
// see composer-submit-gate.ts): it is detection. At release time, if the page
// has abandoned the request, sending is pointless — instead the prompt is put
// BACK into the composer (insert only, never submit; the user stays in charge)
// and the caller surfaces the same AbortError the page already expects from an
// aborted fetch, keeping page semantics untouched.

/**
 * Where a restored prompt is typed back, per fetch-gated site. Only sites in
 * SITE_SUBSTITUTION_STRATEGY with 'body_rewrite' can ever need this (only a
 * held REQUEST can be orphaned; the composer path holds no request).
 * Lovable's selector is the one its own delivery path targets.
 */
export const RESTORE_COMPOSER_SELECTOR: Record<string, string> = {
  lovable: 'div.tiptap.ProseMirror',
};

export interface OrphanGuardDeps {
  /** The page caller's own signal for the held request; null when it has none. */
  signal: AbortSignal | null;
  agent: string;
  prompt: string;
  /** Best-effort in-page insert (no submit). Must not throw to the caller. */
  insertText: (selector: string, text: string) => boolean;
  emit: (event: string, data?: Record<string, unknown>) => void;
}

/**
 * Wrap a send closure so an orphaned hold restores the prompt instead of
 * firing into the void. Restoration runs AT MOST ONCE per guard, even when the
 * gate's fallback chain calls both wrapped closures.
 */
export function makeOrphanGuard(deps: OrphanGuardDeps): {
  guard: <A extends unknown[], T>(sendFn: (...args: A) => T) => (...args: A) => T;
} {
  let restored = false;
  const guard = <A extends unknown[], T>(sendFn: (...args: A) => T): ((...args: A) => T) => (...args: A) => {
    if (deps.signal?.aborted) {
      if (!restored) {
        restored = true;
        const selector = RESTORE_COMPOSER_SELECTOR[deps.agent];
        let landed = false;
        if (selector) {
          try { landed = deps.insertText(selector, deps.prompt); } catch { landed = false; }
        }
        // Ring events carry counts only — never prompt text (L11 posture).
        deps.emit('submit_hold_orphaned', {
          agent: deps.agent, restored: landed, chars: deps.prompt.length,
        });
      }
      // The page's caller aborted; an AbortError is exactly what it expects.
      throw new DOMException('nexpath: page abandoned the held request', 'AbortError');
    }
    return sendFn(...args);
  };
  return { guard };
}
