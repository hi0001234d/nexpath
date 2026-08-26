/**
 * Hold budget for the gated submit path — a VERBATIM port of the shipped CLI
 * module `src/cli/commands/submit-hold-budget.ts`.
 *
 * The original has zero imports and an injectable clock/timer, which is exactly
 * why it ports rather than gets re-designed. The ONLY change is the default
 * `clearTimeoutFn`'s cast: the CLI names `NodeJS.Timeout`, which does not exist
 * in a page. Behaviour, names, constants and semantics are otherwise identical,
 * and a contract test pins the numbers against the shipped file so the two
 * copies cannot drift.
 *
 * ── WHY A SHARED BUDGET, NOT PER-CALL TIMEOUTS ───────────────────────────────
 * The hold has several segments in sequence (extract → decide → compose the
 * popup → wait for the user). Independent per-segment timeouts do not produce a
 * total cap — they SUM. One budget created when the gated path starts, drawn
 * down by every segment, is the only shape that can actually bound the hold.
 *
 * ── WHY EXPIRY MEANS "ALLOW" ─────────────────────────────────────────────────
 * A failure while HOLDING the user's prompt is strictly worse than today's "no
 * advisory appears": the prompt would never send. Expiry therefore releases the
 * original unmodified — it never blocks and never injects.
 *
 * ── WHY IT NEVER REJECTS ─────────────────────────────────────────────────────
 * A throwing segment resolves as `{ timedOut: false, value: undefined }`, so
 * "the popup crashed" stays distinguishable from "the user walked away" while
 * both fail open. Callers need no try/catch around the budget itself.
 */

/** 75 s sits in the middle of the mandated 60–90 s window. */
export const DEFAULT_HOLD_BUDGET_MS = 75_000;

/** Mandated bounds; a caller may not silently pick something outside them. */
export const MIN_HOLD_BUDGET_MS = 60_000;
export const MAX_HOLD_BUDGET_MS = 90_000;

export interface HoldBudget {
  /** Milliseconds left, never negative. */
  remaining: () => number;
  /** True once the budget is exhausted. */
  expired: () => boolean;
  /**
   * Run `work` against the remaining budget. Resolves `{ timedOut: false, value }`
   * if it finishes in time, `{ timedOut: true }` if the budget ran out first.
   * Never rejects.
   */
  run: <T>(work: () => Promise<T>) => Promise<{ timedOut: boolean; value?: T }>;
}

export interface HoldBudgetDeps {
  now?: () => number;
  totalMs?: number;
  setTimeoutFn?: (fn: () => void, ms: number) => { unref?: () => void };
  clearTimeoutFn?: (handle: unknown) => void;
}

/**
 * Create a hold budget.
 *
 * `totalMs` is clamped into the 60–90 s window rather than trusted: a caller
 * passing 0 or ten minutes would silently defeat the guarantee this module
 * exists to provide, and a clamp fails safe where a throw would break the page.
 */
export function createHoldBudget(deps: HoldBudgetDeps = {}): HoldBudget {
  const now = deps.now ?? (() => Date.now());
  const setT = deps.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms) as unknown as { unref?: () => void });
  const clearT = deps.clearTimeoutFn ?? ((h) => { clearTimeout(h as ReturnType<typeof setTimeout>); });

  const requested = deps.totalMs ?? DEFAULT_HOLD_BUDGET_MS;
  const totalMs = Math.min(MAX_HOLD_BUDGET_MS, Math.max(MIN_HOLD_BUDGET_MS, requested));

  const startedAt = now();
  const remaining = (): number => Math.max(0, totalMs - (now() - startedAt));

  return {
    remaining,
    expired: () => remaining() <= 0,
    async run<T>(work: () => Promise<T>): Promise<{ timedOut: boolean; value?: T }> {
      const left = remaining();
      // Already exhausted — do not even start the work. Starting it would be how
      // a "bounded" path quietly overshoots: the last segment always got to run.
      if (left <= 0) return { timedOut: true };

      let handle: unknown;
      const timeout = new Promise<{ timedOut: true }>((resolve) => {
        handle = setT(() => resolve({ timedOut: true }), left);
        const h = handle as { unref?: () => void };
        if (typeof h?.unref === 'function') h.unref();
      });

      try {
        const done = work().then(
          (value) => ({ timedOut: false as const, value }),
          // A throwing segment is a failure, not a timeout — the caller fails
          // open on both, but conflating them would misreport the evidence.
          () => ({ timedOut: false as const, value: undefined }),
        );
        return await Promise.race([done, timeout]);
      } finally {
        if (handle !== undefined) clearT(handle);
      }
    },
  };
}
