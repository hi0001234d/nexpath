import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createHoldBudget,
  DEFAULT_HOLD_BUDGET_MS,
  MIN_HOLD_BUDGET_MS,
  MAX_HOLD_BUDGET_MS,
} from './submit-hold-budget.js';

/** A controllable clock + timer pair, so no test depends on real time. */
function harness(startAt = 1_000) {
  let t = startAt;
  const timers: Array<{ fn: () => void; at: number }> = [];
  return {
    now: () => t,
    /** Advance time and fire any timer that is now due. */
    advance(ms: number): void {
      t += ms;
      for (const timer of [...timers]) {
        if (timer.at <= t) {
          timers.splice(timers.indexOf(timer), 1);
          timer.fn();
        }
      }
    },
    setTimeoutFn: (fn: () => void, ms: number) => {
      const entry = { fn, at: t + ms };
      timers.push(entry);
      return entry;
    },
    clearTimeoutFn: (h: unknown) => {
      const i = timers.indexOf(h as { fn: () => void; at: number });
      if (i !== -1) timers.splice(i, 1);
    },
    pending: () => timers.length,
  };
}

describe('createHoldBudget (verbatim port of the shipped CLI module)', () => {
  describe('clamping — a caller may not defeat the guarantee', () => {
    it('defaults to 75s, inside the mandated 60–90s window', () => {
      expect(DEFAULT_HOLD_BUDGET_MS).toBe(75_000);
      expect(MIN_HOLD_BUDGET_MS).toBe(60_000);
      expect(MAX_HOLD_BUDGET_MS).toBe(90_000);
      const h = harness();
      expect(createHoldBudget({ now: h.now }).remaining()).toBe(75_000);
    });

    it('clamps 0 up to the minimum rather than producing an instantly-expired hold', () => {
      const h = harness();
      expect(createHoldBudget({ now: h.now, totalMs: 0 }).remaining()).toBe(MIN_HOLD_BUDGET_MS);
    });

    it('clamps ten minutes down to the maximum', () => {
      const h = harness();
      expect(createHoldBudget({ now: h.now, totalMs: 600_000 }).remaining()).toBe(MAX_HOLD_BUDGET_MS);
    });
  });

  describe('the budget is SHARED across segments (independent timeouts would sum)', () => {
    it('a second segment only gets what the first left behind', async () => {
      const h = harness();
      const b = createHoldBudget({ now: h.now, totalMs: 60_000, setTimeoutFn: h.setTimeoutFn, clearTimeoutFn: h.clearTimeoutFn });

      await b.run(async () => { h.advance(20_000); });
      expect(b.remaining()).toBe(40_000);

      await b.run(async () => { h.advance(35_000); });
      expect(b.remaining()).toBe(5_000);
    });

    it('remaining never goes negative', () => {
      const h = harness();
      const b = createHoldBudget({ now: h.now, totalMs: 60_000 });
      h.advance(999_000);
      expect(b.remaining()).toBe(0);
      expect(b.expired()).toBe(true);
    });
  });

  describe('refuses to START an already-exhausted segment', () => {
    it('reports timedOut without running the work at all', async () => {
      const h = harness();
      const b = createHoldBudget({ now: h.now, totalMs: 60_000, setTimeoutFn: h.setTimeoutFn, clearTimeoutFn: h.clearTimeoutFn });
      h.advance(60_001);

      const work = vi.fn().mockResolvedValue('should not run');
      expect(await b.run(work)).toEqual({ timedOut: true });
      expect(work).not.toHaveBeenCalled();
    });
  });

  describe('never rejects — the caller needs no try/catch', () => {
    it('a throwing segment resolves as NOT timed out, with no value', async () => {
      const h = harness();
      const b = createHoldBudget({ now: h.now, totalMs: 60_000, setTimeoutFn: h.setTimeoutFn, clearTimeoutFn: h.clearTimeoutFn });
      const res = await b.run(async () => { throw new Error('popup crashed'); });
      // Distinguishable from a timeout on purpose: "crashed" and "user walked
      // away" are different evidence even though both fail open.
      expect(res).toEqual({ timedOut: false, value: undefined });
    });

    it('a SYNCHRONOUSLY-throwing segment DOES propagate — the documented limit of "never rejects"', async () => {
      // The shipped module calls `work()` outside the promise chain, so a throw
      // before the first await escapes. This is pinned rather than fixed: the
      // port is verbatim, and diverging here would make the browser copy behave
      // differently from the CLI's. The gate that consumes this budget wraps the
      // whole call for exactly this reason — see submit-gate.test.ts's
      // "a synchronously-throwing decider" case.
      const h = harness();
      const b = createHoldBudget({ now: h.now, totalMs: 60_000, setTimeoutFn: h.setTimeoutFn, clearTimeoutFn: h.clearTimeoutFn });
      await expect(b.run((() => { throw new Error('sync'); }) as unknown as () => Promise<never>))
        .rejects.toThrow('sync');
    });

    it('still clears its timer when a synchronous throw escapes', async () => {
      const h = harness();
      const b = createHoldBudget({ now: h.now, totalMs: 60_000, setTimeoutFn: h.setTimeoutFn, clearTimeoutFn: h.clearTimeoutFn });
      await b.run((() => { throw new Error('sync'); }) as unknown as () => Promise<never>).catch(() => {});
      expect(h.pending()).toBe(0);
    });
  });

  describe('timeout wins over a hanging segment', () => {
    it('resolves timedOut when the work never settles', async () => {
      const h = harness();
      const b = createHoldBudget({ now: h.now, totalMs: 60_000, setTimeoutFn: h.setTimeoutFn, clearTimeoutFn: h.clearTimeoutFn });

      const promise = b.run(() => new Promise<string>(() => { /* never settles */ }));
      h.advance(60_000);
      expect(await promise).toEqual({ timedOut: true });
    });

    it('a completed segment returns its value and clears the timer', async () => {
      const h = harness();
      const b = createHoldBudget({ now: h.now, totalMs: 60_000, setTimeoutFn: h.setTimeoutFn, clearTimeoutFn: h.clearTimeoutFn });
      expect(await b.run(async () => 'decided')).toEqual({ timedOut: false, value: 'decided' });
      expect(h.pending()).toBe(0); // no timer left running
    });
  });

  describe('contract with the shipped CLI copy (the two must not drift)', () => {
    const shipped = readFileSync(
      join(process.cwd(), 'src', 'cli', 'commands', 'submit-hold-budget.ts'), 'utf8',
    );

    it('the constants match the shipped module exactly', () => {
      expect(shipped).toContain('export const DEFAULT_HOLD_BUDGET_MS = 75_000;');
      expect(shipped).toContain('export const MIN_HOLD_BUDGET_MS = 60_000;');
      expect(shipped).toContain('export const MAX_HOLD_BUDGET_MS = 90_000;');
    });

    it('the shipped module still clamps the same way and refuses an exhausted start', () => {
      expect(shipped).toContain('Math.min(MAX_HOLD_BUDGET_MS, Math.max(MIN_HOLD_BUDGET_MS, requested))');
      expect(shipped).toContain('if (left <= 0) return { timedOut: true };');
    });
  });
});
