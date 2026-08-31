/**
 * The gated composer submit — one mechanism, all three sites.
 *
 * The user presses Enter (or clicks send). We cancel that submission before the
 * site ever sees it, hold, show the popup, and then send exactly one prompt:
 * the modified one if the user accepted it, otherwise the original.
 *
 * ── WHY THIS REPLACED THE REQUEST-BODY REWRITE ON BOLT/LOVABLE ───────────────
 * Rewriting the outgoing `fetch` body looked cleaner on paper and is fully
 * implemented (see inject/submit-substitution.ts). Live testing on a real Bolt
 * project killed it, for two independent reasons:
 *
 *   1. **Bolt renders the user's bubble optimistically at submit**, from its own
 *      local state, before `fetch` is ever called. A perfect body rewrite still
 *      left the ORIGINAL text on screen next to a reply to the replacement.
 *   2. **Bolt's client gives up on a chat after 30 s and retries**
 *      (`Chat start timed out after 30000ms` → `chat.start.retry_succeeded`).
 *      A hold long enough for a human to read and edit a prompt always blows
 *      that ceiling, and the retry re-sent the original.
 *
 * Cancelling at the composer fixes both at once and by construction: the site
 * never renders a bubble, and never starts a chat, so there is no timer to beat
 * and no stale bubble to reconcile. Whatever we submit IS what the user sees.
 *
 * ── `stopImmediatePropagation` IS LOAD-BEARING ───────────────────────────────
 * Plain `stopPropagation()` is NOT enough and was proven insufficient live: Bolt
 * submitted anyway, because it has a document-level listener registered before
 * ours, and only the immediate form stops listeners on the SAME node. Downgrading
 * this call silently re-breaks every site.
 *
 * ── RE-ENTRANCY ──────────────────────────────────────────────────────────────
 * The prompt we submit travels back through the very listener that intercepted
 * the original. Without the guard that is an infinite loop.
 *
 * ── FAIL-OPEN ────────────────────────────────────────────────────────────────
 * Today a failure means "no popup". Here it would mean "the prompt never sends",
 * which is worse. Every branch ends in exactly one submitted prompt, and the
 * hold budget bounds the wait even if the decision never arrives.
 */
import { createHoldBudget, type HoldBudget, type HoldBudgetDeps } from '../adapters/submit-hold-budget.js';

export type ComposerDecision =
  | { kind: 'allow' }
  | { kind: 'block'; replacement: string };

export interface ComposerSubmitGateDeps {
  /** Agent id, used only for logging. */
  agent: string;
  /** Whether the switch is armed for this page. Read per event, never cached. */
  isArmed: () => boolean;
  /** Ask the service worker for a verdict. Bounded by the budget; may hang. */
  decide: (ctx: { prompt: string; submitId: string }) => Promise<ComposerDecision>;
  /** Put text in the composer and submit it. Resolves true when it went out. */
  deliverReplacement: (text: string) => Promise<boolean>;
  /** Re-submit what is already in the composer (the cancelled original). */
  reissueOriginal: () => Promise<boolean>;
  /** Read the composer's current text — used to verify a send actually happened. */
  readComposerText: () => string;
  emit?: (event: string, data?: Record<string, unknown>) => void;
  /**
   * Ceiling on the popup wait, or **null for none** (the shipped default).
   *
   * OWNER RULING 2026-08-26: the popup does not time out. The CLI's own popup
   * waits for a human indefinitely; the 60–90 s ceiling in the shipped hook
   * exists because Cursor ORPHANS a timed-out hook process, so that hook has to
   * bound itself or leak. **The browser has no orphan case** — the hold lives in
   * the tab, and the tab's death ends it — so the reason for the ceiling does
   * not apply here, while its cost is real: a 75 s limit fired on a user who was
   * still reading a 2,000-character prompt, released the original and threw the
   * enhancement away (live, Lovable, `submit_hold_expired heldMs:75551`).
   *
   * Fail-open is preserved by EVENT rather than by clock: the decision channel
   * answers `allow` on any messaging failure, and a torn-down worker makes
   * `sendMessage` reject — which is why the heartbeat that keeps it alive is
   * load-bearing now that nothing else bounds this wait.
   */
  holdTimeoutMs?: number | null;
  /** Overrides the send-verification window (tests keep it short). */
  verify?: { timeoutMs?: number; pollMs?: number };
  budget?: HoldBudgetDeps;
  makeBudget?: (deps?: HoldBudgetDeps) => HoldBudget;
}

export interface ComposerSubmitGate {
  /**
   * Called from the capture-phase listener. Returns true when this gate has
   * TAKEN OVER the submission (the caller must stop); false means "not mine,
   * carry on exactly as before".
   */
  maybeIntercept(ev: Event, prompt: string): boolean;
  /** True while our own submit is travelling back through the listener. */
  isReentrant(): boolean;
}

/**
 * How long to wait for a send to be observable before calling it unverified.
 *
 * Widened from 3 s after live runs on Bolt and Replit (2026-08-26) where the
 * inject fell back to the clipboard and left the replacement sitting in the
 * composer. The failure verdict was CORRECT there — what was wrong was the
 * label that followed it, which claimed the ORIGINAL was being released while
 * the box actually held the replacement. Both are fixed: a longer, poll-bounded
 * window, and a fallback that reports which text it is really sending.
 */
const SEND_VERIFY_TIMEOUT_MS = 8_000;
const SEND_VERIFY_POLL_MS = 150;
/**
 * A tighter cadence for the FIRST second, then the steady one above.
 *
 * A send that works clears the composer within a few frames, so the answer is
 * almost always available long before the first 150 ms tick — and this check
 * sits directly in front of the user, between their click and the prompt
 * appearing in the chat. The wide cadence exists for the tail (a site slow to
 * reconcile), which is exactly where it still applies.
 *
 * Ceilings are untouched: same total wall clock, same poll-count bound, same
 * verdict. Only the moment a SUCCESS becomes observable moves earlier — and a
 * denser early sample also makes `sawIt` below more likely to catch the text
 * before it leaves, which is what stops a real send being reported unverified.
 */
const SEND_VERIFY_FAST_POLL_MS = 50;
const SEND_VERIFY_FAST_WINDOW_MS = 1_000;

function submitIdFor(prompt: string): string {
  let h = 5381;
  for (let i = 0; i < prompt.length; i++) h = ((h << 5) + h + prompt.charCodeAt(i)) | 0;
  return `c${(h >>> 0).toString(36)}:${prompt.length}`;
}

export function createComposerSubmitGate(deps: ComposerSubmitGateDeps): ComposerSubmitGate {
  const makeBudget = deps.makeBudget ?? createHoldBudget;
  const now = deps.budget?.now ?? (() => Date.now());
  const emit = (event: string, data?: Record<string, unknown>): void => {
    try { deps.emit?.(event, { agent: deps.agent, ...data }); } catch { /* diagnostics only */ }
  };

  let reentrant = false;
  const inFlight = new Set<string>();
  // RC19: never let "off" be silent. Logged once per page so a disarmed session
  // is diagnosable without drowning the ring in one line per keystroke.
  let disarmedLogged = false;

  const normalize = (t: string): string => t.replace(/\s+/g, ' ').trim();

  /**
   * Has `text` left the composer?
   *
   * "The composer is empty" was the original test and it was WRONG in practice:
   * these editors keep a draft, a trailing newline or a placeholder node for a
   * moment after a programmatic send, so a real send read as a failure. What
   * actually matters is whether the text we submitted is still sitting there —
   * if it is gone, it went out.
   *
   * Bounded by poll count as well as by the clock so a stopped clock cannot turn
   * this into an unbounded wait while the user is stuck.
   */
  const verifyGone = async (text: string): Promise<boolean> => {
    const needle = normalize(text);
    const timeoutMs = deps.verify?.timeoutMs ?? SEND_VERIFY_TIMEOUT_MS;
    const pollMs = deps.verify?.pollMs ?? SEND_VERIFY_POLL_MS;
    // Never SLOWER than a caller explicitly asked for: an injected `pollMs` below
    // the fast cadence wins, so a test that pins a cadence keeps exactly it.
    const fastPollMs = Math.min(SEND_VERIFY_FAST_POLL_MS, pollMs);
    const fastPolls = Math.ceil(Math.min(timeoutMs, SEND_VERIFY_FAST_WINDOW_MS) / fastPollMs);
    const slowPolls = Math.ceil(Math.max(0, timeoutMs - SEND_VERIFY_FAST_WINDOW_MS) / pollMs);
    // Both bounds preserved: the same clock ceiling, and still bounded by a poll
    // COUNT so a stopped clock cannot turn this into an unbounded wait.
    const maxPolls = fastPolls + slowPolls;
    // `sawIt` is what stops "the text is not there" from meaning "it was sent".
    // If the paste never landed, the text was NEVER in the box, and reporting
    // that as delivered would silently drop the user's turn.
    let sawIt = needle.length === 0;
    for (let i = 0; i <= maxPolls; i++) {
      let current = '';
      try { current = deps.readComposerText(); } catch { return false; }
      const norm = normalize(current);
      if (norm.length === 0) return true;                  // box cleared ⇒ sent
      if (needle.length > 0 && norm.includes(needle)) sawIt = true;
      else if (sawIt) return true;                          // was there, now gone
      if (i < maxPolls) await new Promise((r) => setTimeout(r, i < fastPolls ? fastPollMs : pollMs));
    }
    return false;
  };

  /** Submit the original we cancelled. Always the fallback, never the goal. */
  const releaseOriginal = async (event: string, submitId: string, heldMs: number): Promise<void> => {
    emit(event, { submitId, heldMs });
    reentrant = true;
    try {
      // Capture what we are about to send BEFORE pressing send, so the check
      // asks "did THIS text leave?" rather than "is the box empty?" — the latter
      // reported real sends as failures on both Bolt and Replit.
      let pending = '';
      try { pending = deps.readComposerText(); } catch { /* unreadable */ }
      const sent = await deps.reissueOriginal();
      if (!sent || !await verifyGone(pending)) {
        // Loud on purpose: this is the one branch that can lose a prompt.
        emit('submit_reissue_unverified', { submitId });
      }
    } catch {
      emit('submit_reissue_failed', { submitId });
    } finally {
      reentrant = false;
    }
  };

  const runHold = async (prompt: string, submitId: string): Promise<void> => {
    const timeoutMs = deps.holdTimeoutMs ?? null;
    const startedAt = now();
    emit('submit_hold_started', { submitId, budgetMs: timeoutMs });

    let outcome: { timedOut: boolean; value?: ComposerDecision };
    try {
      if (timeoutMs === null) {
        // Unbounded: the popup waits for a human. See `holdTimeoutMs`.
        outcome = { timedOut: false, value: await deps.decide({ prompt, submitId }) };
      } else {
        outcome = await makeBudget({ ...deps.budget, totalMs: timeoutMs })
          .run(() => deps.decide({ prompt, submitId }));
      }
    } catch {
      outcome = { timedOut: false, value: undefined };
    }

    if (outcome.timedOut) { await releaseOriginal('submit_hold_expired', submitId, now() - startedAt); return; }
    const decision = outcome.value;
    if (decision === undefined) { await releaseOriginal('submit_hold_released_error', submitId, now() - startedAt); return; }
    if (decision.kind !== 'block' || decision.replacement.length === 0) {
      await releaseOriginal('submit_hold_released_allow', submitId, now() - startedAt);
      return;
    }

    emit('submit_hold_blocked', { submitId, heldMs: now() - startedAt, chars: decision.replacement.length });
    reentrant = true;
    let delivered = false;
    try {
      delivered = await deps.deliverReplacement(decision.replacement);
      if (delivered) delivered = await verifyGone(decision.replacement);
    } catch {
      delivered = false;
    } finally {
      reentrant = false;
    }
    if (delivered) {
      emit('submit_replacement_sent', { submitId, chars: decision.replacement.length });
      return;
    }

    emit('submit_hold_substitution_failed', { submitId });
    // What is actually in the composer decides what pressing send will do. If the
    // replacement landed but the send did not fire, the composer holds the text
    // the USER CHOSE — sending that is the right outcome, and calling it
    // "released the original" would be a lie in the ring buffer. Only when the
    // original is still sitting there is this genuinely a fallback.
    let pending = '';
    try { pending = deps.readComposerText(); } catch { /* unreadable */ }
    const replacementStillPending = normalize(decision.replacement).length > 0
      && normalize(pending).includes(normalize(decision.replacement));
    await releaseOriginal(
      replacementStillPending
        ? 'submit_hold_replacement_sent_by_fallback'
        : 'submit_hold_released_after_failed_substitution',
      submitId,
      now() - startedAt,
    );
  };

  return {
    isReentrant: () => reentrant,

    maybeIntercept(ev: Event, prompt: string): boolean {
      if (reentrant) return false;          // our own submit travelling back
      if (!deps.isArmed()) {
        if (!disarmedLogged) {
          disarmedLogged = true;
          emit('submit_gate_disarmed', { reason: 'switch_off' });
        }
        return false;                       // switch off ⇒ today's behaviour
      }
      if (prompt.trim().length === 0) return false;

      const submitId = submitIdFor(prompt);

      // Enter and click can both fire for one submission, and the site may
      // dispatch more than one event per press. One hold, not N — but every
      // duplicate must STILL be cancelled, or the site sends the original out
      // from under us.
      const duplicate = inFlight.has(submitId);

      // LOAD-BEARING: the immediate form. Plain stopPropagation was proven
      // insufficient on Bolt — see this module's header.
      ev.preventDefault();
      ev.stopImmediatePropagation();

      if (duplicate) {
        emit('submit_hold_claim_duplicate', { submitId });
        return true;
      }
      inFlight.add(submitId);
      void runHold(prompt, submitId).finally(() => { inFlight.delete(submitId); });
      return true;
    },
  };
}
