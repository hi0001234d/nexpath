/**
 * The gated submit path, page-world side.
 *
 * This is the module that can WITHHOLD the user's request, so it is written
 * around one invariant:
 *
 *   ── EXACTLY ONE SEND, AND IT ALWAYS HAPPENS ────────────────────────────────
 *   Every path through `runGatedSubmit` ends in exactly one call to the caller's
 *   `send`. Allow, block, echo, duplicate claim, timeout, thrown decider,
 *   thrown anything — one send. The decision may only ever choose WHICH TEXT
 *   that single send carries, never WHETHER a second send happens.
 *
 * That is what makes the shipped CLI's worst failure mode (the hold expiring
 * after a decision was recorded, so the original AND the replacement both run)
 * structurally impossible here rather than merely unlikely: hold and send are
 * the same closure, reached once per claimed submit. Any future refactor that
 * moves the send out of this closure re-opens it and must be rejected in review.
 *
 * ── ORDER IS LOAD-BEARING ────────────────────────────────────────────────────
 *   1. ECHO CHECK FIRST — our own replacement re-enters this very path. Without
 *      this, a block loops forever.
 *   2. CLAIM — duplicate observers of one submission must produce one decision,
 *      not N.
 *   3. BUDGET — created once, shared by every later segment.
 *   4. DECIDE — bounded by the budget.
 *
 * ── FAIL-OPEN IS NOT OPTIONAL HERE ───────────────────────────────────────────
 * Today a failure means "no popup, prompt proceeds". While holding, a failure
 * would mean "the prompt never sends" — strictly worse. So every branch below
 * releases the original, and the budget guarantees a ceiling even if the decider
 * hangs forever.
 */
import { createHoldBudget, type HoldBudget, type HoldBudgetDeps } from '../adapters/submit-hold-budget.js';

/** What the decider may tell the gate to do. */
export type SubmitDecision =
  | { kind: 'allow' }
  | { kind: 'block'; replacement: string };

export interface GatedSubmitContext {
  /** The prompt text extracted from the request body. */
  prompt: string;
  /** Stable id for this submission, used for the claim. */
  submitId: string;
}

export interface SubmitGateDeps {
  /**
   * Ceiling on the popup wait, or **null for none** (the shipped default).
   * Owner ruling 2026-08-26 — see composer-submit-gate.ts's `holdTimeoutMs` for
   * the full reasoning: the CLI's popup waits for a human, the shipped hook's
   * ceiling exists only because Cursor orphans timed-out hooks, and the browser
   * has no orphan case.
   */
  holdTimeoutMs?: number | null;
  /** Ask for a decision. Bounded by the budget; may throw or hang safely. */
  decide: (ctx: GatedSubmitContext) => Promise<SubmitDecision>;
  /** Ring-event sink. Must never throw (the gate guards it anyway). */
  emit?: (event: string, data?: Record<string, unknown>) => void;
  budget?: HoldBudgetDeps;
  /** Injected for tests; production uses the real budget. */
  makeBudget?: (deps?: HoldBudgetDeps) => HoldBudget;
}

/**
 * How long an injected replacement stays recognisable as "ours".
 *
 * The echo arrives on the very next submit in practice; the window only needs to
 * outlive the site's own round-trip. Entries are also consumed on match, so the
 * window is a backstop against a replacement that never comes back (user edited
 * it away), not the primary mechanism.
 */
export const ECHO_TTL_MS = 120_000;

/** Anything shorter than this is too weak to identify an echo by text. */
const ECHO_MIN_LENGTH = 12;

interface EchoEntry { text: string; at: number }

export interface SubmitGate {
  /**
   * Record text we are about to inject, so the resulting submit is recognised as
   * our own echo and passes straight through.
   */
  noteEcho(text: string): void;
  /** True if `text` matches a live echo entry — consumes it. */
  isEcho(text: string): boolean;
  /** Number of live echo entries (diagnostics/tests). */
  echoCount(): number;
  /**
   * Run one gated submit. `send` performs the real request and is called EXACTLY
   * ONCE on every path. `sendReplacement` performs the substituted request; when
   * omitted, a block degrades to an allow (HB2 has no substitution yet).
   */
  runGatedSubmit<T>(
    ctx: GatedSubmitContext,
    send: () => T,
    sendReplacement?: (replacement: string) => T,
  ): Promise<T>;
}

export function createSubmitGate(deps: SubmitGateDeps): SubmitGate {
  const now = deps.budget?.now ?? (() => Date.now());
  const makeBudget = deps.makeBudget ?? createHoldBudget;
  const emit = (event: string, data?: Record<string, unknown>): void => {
    // A logging failure must never be able to break fail-open.
    try { deps.emit?.(event, data); } catch { /* diagnostics only */ }
  };

  const echoes: EchoEntry[] = [];
  /**
   * Claimed submits, and WHAT WE DECIDED for each.
   *
   * Remembering the decision — not just the id — is load-bearing. A duplicate of
   * a submit we already BLOCKED must not fall through to sending the original:
   * that re-sends the very text the user replaced, and the agent answers it.
   * Live-caught on Bolt 2026-08-26: `submit_hold_blocked` was immediately
   * followed by `submit_hold_claim_duplicate`, and the duplicate sent the
   * original. A duplicate now repeats the REPLACEMENT instead, so the site's
   * retry still gets a response and the agent still only ever sees one text.
   */
  const claimed = new Map<string, { replacement: string | null }>();
  const CLAIM_CAP = 50;
  const rememberClaim = (id: string, replacement: string | null): void => {
    claimed.set(id, { replacement });
    if (claimed.size > CLAIM_CAP) {
      const oldest = claimed.keys().next().value;
      if (oldest !== undefined) claimed.delete(oldest);
    }
  };

  const pruneEchoes = (): void => {
    const cutoff = now() - ECHO_TTL_MS;
    for (let i = echoes.length - 1; i >= 0; i--) {
      if (echoes[i]!.at < cutoff) echoes.splice(i, 1);
    }
  };

  const normalize = (t: string): string => t.replace(/\s+/g, ' ').trim();

  return {
    noteEcho(text: string): void {
      const norm = normalize(text);
      if (norm.length < ECHO_MIN_LENGTH) return;
      pruneEchoes();
      echoes.push({ text: norm, at: now() });
    },

    isEcho(text: string): boolean {
      pruneEchoes();
      const norm = normalize(text);
      if (norm.length < ECHO_MIN_LENGTH) return false;
      const idx = echoes.findIndex((e) => e.text === norm);
      if (idx === -1) return false;
      echoes.splice(idx, 1); // consume — an echo is answered once
      return true;
    },

    echoCount(): number {
      pruneEchoes();
      return echoes.length;
    },

    async runGatedSubmit<T>(
      ctx: GatedSubmitContext,
      send: () => T,
      sendReplacement?: (replacement: string) => T,
    ): Promise<T> {
      // ── 1. ECHO FIRST ────────────────────────────────────────────────────
      if (this.isEcho(ctx.prompt)) {
        emit('submit_hold_echo_skip', { submitId: ctx.submitId });
        return send();
      }

      // ── 2. CLAIM ─────────────────────────────────────────────────────────
      // Map.set after a has() check is atomic here: JS is single-threaded and
      // there is no await between the two.
      const prior = claimed.get(ctx.submitId);
      if (prior !== undefined) {
        // Already decided. If we blocked, REPEAT THE REPLACEMENT — never the
        // original (see the registry's comment: this is a live-caught defect).
        if (prior.replacement !== null && sendReplacement !== undefined) {
          emit('submit_hold_claim_duplicate', { submitId: ctx.submitId, repeated: 'replacement' });
          try {
            return sendReplacement(prior.replacement);
          } catch {
            emit('submit_hold_substitution_failed', { submitId: ctx.submitId });
            return send();
          }
        }
        emit('submit_hold_claim_duplicate', { submitId: ctx.submitId, repeated: 'original' });
        return send();
      }
      rememberClaim(ctx.submitId, null);

      // ── 3. BUDGET ────────────────────────────────────────────────────────
      const timeoutMs = deps.holdTimeoutMs ?? null;
      const startedAt = now();
      emit('submit_hold_started', { submitId: ctx.submitId, budgetMs: timeoutMs });

      // ── 4. DECIDE ────────────────────────────────────────────────────────
      // The whole block is guarded: this closure owes its caller a send no
      // matter what happens inside it.
      let outcome: { timedOut: boolean; value?: SubmitDecision };
      try {
        outcome = timeoutMs === null
          ? { timedOut: false, value: await deps.decide(ctx) }
          : await makeBudget({ ...deps.budget, totalMs: timeoutMs }).run(() => deps.decide(ctx));
      } catch {
        emit('submit_hold_released_error', { submitId: ctx.submitId, heldMs: now() - startedAt });
        return send();
      }

      if (outcome.timedOut) {
        emit('submit_hold_expired', { submitId: ctx.submitId, heldMs: now() - startedAt });
        return send();
      }

      const decision = outcome.value;
      if (decision === undefined) {
        // The decider threw; the budget reports that as "not timed out, no value".
        emit('submit_hold_released_error', { submitId: ctx.submitId, heldMs: now() - startedAt });
        return send();
      }

      if (decision.kind === 'block') {
        // Guard the block condition here too, not only at the decider: a block
        // with nothing to send would lose the user's prompt entirely.
        if (typeof decision.replacement !== 'string' || decision.replacement.length === 0) {
          emit('submit_hold_released_empty_replacement', { submitId: ctx.submitId, heldMs: now() - startedAt });
          return send();
        }
        if (sendReplacement === undefined) {
          emit('submit_hold_released_no_substitution', { submitId: ctx.submitId, heldMs: now() - startedAt });
          return send();
        }
        this.noteEcho(decision.replacement);
        // Record the decision BEFORE sending: a retry can arrive while the
        // replacement request is still in flight.
        rememberClaim(ctx.submitId, decision.replacement);
        emit('submit_hold_blocked', { submitId: ctx.submitId, heldMs: now() - startedAt });
        try {
          return sendReplacement(decision.replacement);
        } catch {
          // Substitution itself failed — the user's prompt must still go.
          emit('submit_hold_substitution_failed', { submitId: ctx.submitId });
          return send();
        }
      }

      emit('submit_hold_released_allow', { submitId: ctx.submitId, heldMs: now() - startedAt });
      return send();
    },
  };
}
