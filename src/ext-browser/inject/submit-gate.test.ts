import { describe, it, expect, vi } from 'vitest';
import { createSubmitGate, ECHO_TTL_MS, type SubmitDecision } from './submit-gate.js';
import type { HoldBudget, HoldBudgetDeps } from '../adapters/submit-hold-budget.js';

/**
 * A budget stub with no timers: `run` awaits the work unless the test asks for a
 * timeout. The real budget has its own suite; here we test the GATE's branching.
 */
function stubBudget(opts: { timeout?: boolean; remaining?: number } = {}) {
  const budget: HoldBudget = {
    remaining: () => opts.remaining ?? 75_000,
    expired: () => false,
    async run<T>(work: () => Promise<T>) {
      if (opts.timeout === true) return { timedOut: true };
      try { return { timedOut: false, value: await work() }; }
      catch { return { timedOut: false, value: undefined }; }
    },
  };
  return (_deps?: HoldBudgetDeps): HoldBudget => budget;
}

function makeGate(
  decide: (ctx: { prompt: string; submitId: string }) => Promise<SubmitDecision>,
  opts: { timeout?: boolean; now?: () => number } = {},
) {
  const events: Array<{ event: string; data?: Record<string, unknown> }> = [];
  const gate = createSubmitGate({
    decide,
    emit: (event, data) => { events.push({ event, data }); },
    makeBudget: stubBudget({ timeout: opts.timeout }),
    budget: opts.now !== undefined ? { now: opts.now } : undefined,
    // The SHIPPED default is no ceiling (the popup waits for a human). Tests that
    // exercise the timeout path opt into one explicitly.
    ...(opts.timeout === true ? { holdTimeoutMs: 75_000 } : {}),
  });
  const names = (): string[] => events.map((e) => e.event);
  return { gate, events, names };
}

const ALLOW = async (): Promise<SubmitDecision> => ({ kind: 'allow' });
const ctx = (over: Partial<{ prompt: string; submitId: string }> = {}) => ({
  prompt: 'build me a login page with tests', submitId: 's1', ...over,
});

describe('createSubmitGate — the closure that may withhold the user request', () => {
  describe('THE INVARIANT: exactly one send, on every path', () => {
    const paths: Array<[string, () => ReturnType<typeof makeGate>, boolean]> = [
      ['allow', () => makeGate(ALLOW), false],
      ['decider throws', () => makeGate(async () => { throw new Error('boom'); }), false],
      ['decider hangs → budget expires', () => makeGate(() => new Promise<SubmitDecision>(() => {}), { timeout: true }), false],
      ['block with an empty replacement', () => makeGate(async () => ({ kind: 'block', replacement: '' })), false],
      ['block with no substitution function', () => makeGate(async () => ({ kind: 'block', replacement: 'new text here' })), false],
    ];

    for (const [name, build] of paths) {
      it(`${name} → the original is sent exactly once`, async () => {
        const { gate } = build();
        const send = vi.fn().mockReturnValue('sent');
        expect(await gate.runGatedSubmit(ctx(), send)).toBe('sent');
        expect(send).toHaveBeenCalledTimes(1);
      });
    }

    it('block WITH a substitution sends the replacement exactly once and the original never', async () => {
      const { gate } = makeGate(async () => ({ kind: 'block', replacement: 'the improved prompt text' }));
      const send = vi.fn().mockReturnValue('original');
      const sendReplacement = vi.fn().mockReturnValue('replaced');

      expect(await gate.runGatedSubmit(ctx(), send, sendReplacement)).toBe('replaced');
      expect(sendReplacement).toHaveBeenCalledTimes(1);
      expect(sendReplacement).toHaveBeenCalledWith('the improved prompt text');
      expect(send).not.toHaveBeenCalled();
    });

    it('a substitution that THROWS still sends the original — the prompt is never lost', async () => {
      const { gate, names } = makeGate(async () => ({ kind: 'block', replacement: 'the improved prompt text' }));
      const send = vi.fn().mockReturnValue('original');
      const sendReplacement = vi.fn(() => { throw new Error('rewrite failed'); });

      expect(await gate.runGatedSubmit(ctx(), send, sendReplacement)).toBe('original');
      expect(send).toHaveBeenCalledTimes(1);
      expect(names()).toContain('submit_hold_substitution_failed');
    });

    it('a SYNCHRONOUSLY-throwing decider still sends the original exactly once', async () => {
      // The budget deliberately does not catch a throw that happens before the
      // first await (see submit-hold-budget.test.ts), so the gate must — this is
      // the test that makes that limitation harmless.
      const gate = createSubmitGate({
        decide: (() => { throw new Error('sync boom'); }) as unknown as () => Promise<SubmitDecision>,
        makeBudget: stubBudget(),
      });
      const send = vi.fn().mockReturnValue('sent');
      expect(await gate.runGatedSubmit(ctx(), send)).toBe('sent');
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('an emit that throws cannot break the send path', async () => {
      const gate = createSubmitGate({
        decide: ALLOW,
        emit: () => { throw new Error('logging exploded'); },
        makeBudget: stubBudget(),
      });
      const send = vi.fn().mockReturnValue('sent');
      expect(await gate.runGatedSubmit(ctx(), send)).toBe('sent');
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('1. ECHO CHECK FIRST (without it, a block loops forever)', () => {
    it('a noted echo passes straight through without consulting the decider', async () => {
      const decide = vi.fn(ALLOW);
      const { gate, names } = makeGate(decide);
      gate.noteEcho('the improved prompt text');

      const send = vi.fn().mockReturnValue('sent');
      await gate.runGatedSubmit(ctx({ prompt: 'the improved prompt text' }), send);

      expect(decide).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledTimes(1);
      expect(names()).toEqual(['submit_hold_echo_skip']);
    });

    it('the echo check runs BEFORE the claim — the event order proves it', async () => {
      const { gate, names } = makeGate(ALLOW);
      gate.noteEcho('the improved prompt text');
      await gate.runGatedSubmit(ctx({ prompt: 'the improved prompt text' }), () => 'x');
      expect(names()[0]).toBe('submit_hold_echo_skip');
      expect(names()).not.toContain('submit_hold_started');
    });

    it('matches through whitespace reflow (rich editors re-wrap pasted text)', async () => {
      const decide = vi.fn(ALLOW);
      const { gate } = makeGate(decide);
      gate.noteEcho('please add   tests\n\nfor the login flow');
      await gate.runGatedSubmit(ctx({ prompt: 'please add tests for the login flow' }), () => 'x');
      expect(decide).not.toHaveBeenCalled();
    });

    it('an echo is consumed — the SAME text submitted again later is a real prompt', async () => {
      const decide = vi.fn(ALLOW);
      const { gate } = makeGate(decide);
      gate.noteEcho('the improved prompt text');

      await gate.runGatedSubmit(ctx({ prompt: 'the improved prompt text', submitId: 'a' }), () => 'x');
      expect(decide).not.toHaveBeenCalled();

      await gate.runGatedSubmit(ctx({ prompt: 'the improved prompt text', submitId: 'b' }), () => 'x');
      expect(decide).toHaveBeenCalledTimes(1);
    });

    it('holds MULTIPLE echoes — a second replacement cannot evict the first', async () => {
      const decide = vi.fn(ALLOW);
      const { gate } = makeGate(decide);
      gate.noteEcho('first replacement text');
      gate.noteEcho('second replacement text');
      expect(gate.echoCount()).toBe(2);

      await gate.runGatedSubmit(ctx({ prompt: 'first replacement text', submitId: 'a' }), () => 'x');
      await gate.runGatedSubmit(ctx({ prompt: 'second replacement text', submitId: 'b' }), () => 'x');
      expect(decide).not.toHaveBeenCalled();
    });

    it('short text is never treated as an echo (too weak to identify by text)', async () => {
      const decide = vi.fn(ALLOW);
      const { gate } = makeGate(decide);
      gate.noteEcho('fix it');
      expect(gate.echoCount()).toBe(0);
      await gate.runGatedSubmit(ctx({ prompt: 'fix it' }), () => 'x');
      expect(decide).toHaveBeenCalledTimes(1);
    });

    it('an echo older than the TTL is no longer honoured', async () => {
      let t = 1_000;
      const decide = vi.fn(ALLOW);
      const { gate } = makeGate(decide, { now: () => t });
      gate.noteEcho('the improved prompt text');
      t += ECHO_TTL_MS + 1;
      await gate.runGatedSubmit(ctx({ prompt: 'the improved prompt text' }), () => 'x');
      expect(decide).toHaveBeenCalledTimes(1);
    });

    it('a blocked replacement is auto-noted, so its own submit is not re-gated', async () => {
      const decide = vi.fn(async (): Promise<SubmitDecision> => ({ kind: 'block', replacement: 'the improved prompt text' }));
      const { gate } = makeGate(decide);
      await gate.runGatedSubmit(ctx({ submitId: 'a' }), () => 'x', () => 'y');
      expect(decide).toHaveBeenCalledTimes(1);

      // The replacement comes back through the same path:
      await gate.runGatedSubmit(ctx({ prompt: 'the improved prompt text', submitId: 'b' }), () => 'x', () => 'y');
      expect(decide).toHaveBeenCalledTimes(1); // not consulted again
    });
  });

  describe('2. ATOMIC CLAIM (duplicate observers → one decision, not N)', () => {
    it('a repeated submitId is passed through without a second decision', async () => {
      const decide = vi.fn(ALLOW);
      const { gate, names } = makeGate(decide);
      await gate.runGatedSubmit(ctx({ submitId: 'dup' }), () => 'x');
      await gate.runGatedSubmit(ctx({ submitId: 'dup' }), () => 'x');
      expect(decide).toHaveBeenCalledTimes(1);
      expect(names()).toContain('submit_hold_claim_duplicate');
    });

    it('two concurrent gated submits with the same id produce ONE decision', async () => {
      let resolveDecide: (d: SubmitDecision) => void = () => {};
      const decide = vi.fn(() => new Promise<SubmitDecision>((r) => { resolveDecide = r; }));
      const { gate } = makeGate(decide);
      const send = vi.fn().mockReturnValue('sent');

      const a = gate.runGatedSubmit(ctx({ submitId: 'same' }), send);
      const b = gate.runGatedSubmit(ctx({ submitId: 'same' }), send);
      resolveDecide({ kind: 'allow' });
      await Promise.all([a, b]);

      expect(decide).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(2); // both callers still get their send
    });

    it('LIVE-CAUGHT (Bolt, 2026-08-26): a duplicate after a BLOCK repeats the replacement, never the original', async () => {
      const { gate, names } = makeGate(async () => ({ kind: 'block', replacement: 'the improved prompt text' }));
      const send = vi.fn().mockReturnValue('ORIGINAL');
      const sendReplacement = vi.fn().mockReturnValue('REPLACEMENT');

      await gate.runGatedSubmit(ctx({ submitId: 'dup' }), send, sendReplacement);
      // The site retries the same submission (observed live: submit_hold_blocked
      // was immediately followed by submit_hold_claim_duplicate).
      const second = await gate.runGatedSubmit(ctx({ submitId: 'dup' }), send, sendReplacement);

      expect(second).toBe('REPLACEMENT');
      expect(sendReplacement).toHaveBeenCalledTimes(2);
      expect(sendReplacement).toHaveBeenLastCalledWith('the improved prompt text');
      // The whole point: the text the user replaced never goes out.
      expect(send).not.toHaveBeenCalled();
      expect(names()).toContain('submit_hold_claim_duplicate');
    });

    it('a duplicate after an ALLOW still sends the original', async () => {
      const { gate } = makeGate(ALLOW);
      const send = vi.fn().mockReturnValue('ORIGINAL');
      await gate.runGatedSubmit(ctx({ submitId: 'dup' }), send);
      expect(await gate.runGatedSubmit(ctx({ submitId: 'dup' }), send)).toBe('ORIGINAL');
      expect(send).toHaveBeenCalledTimes(2);
    });

    it('a duplicate after a block falls back to the original when no substitution exists', async () => {
      const { gate } = makeGate(async () => ({ kind: 'block', replacement: 'the improved prompt text' }));
      const send = vi.fn().mockReturnValue('ORIGINAL');
      await gate.runGatedSubmit(ctx({ submitId: 'dup' }), send); // no sendReplacement → degrades to allow
      expect(await gate.runGatedSubmit(ctx({ submitId: 'dup' }), send)).toBe('ORIGINAL');
    });

    it('different submitIds are decided independently', async () => {
      const decide = vi.fn(ALLOW);
      const { gate } = makeGate(decide);
      await gate.runGatedSubmit(ctx({ submitId: 'a' }), () => 'x');
      await gate.runGatedSubmit(ctx({ submitId: 'b' }), () => 'x');
      expect(decide).toHaveBeenCalledTimes(2);
    });
  });

  describe('3–4. BUDGET + DECIDE, and the ring events for every branch', () => {
    it('allow emits started then released_allow, with a measured hold', async () => {
      let t = 1_000;
      const { gate, events } = makeGate(async () => { t += 250; return { kind: 'allow' }; }, { now: () => t });
      await gate.runGatedSubmit(ctx(), () => 'x');
      expect(events.map((e) => e.event)).toEqual(['submit_hold_started', 'submit_hold_released_allow']);
      expect(events[1]!.data).toMatchObject({ submitId: 's1', heldMs: 250 });
    });

    it('expiry emits submit_hold_expired', async () => {
      const { gate, names } = makeGate(() => new Promise<SubmitDecision>(() => {}), { timeout: true });
      await gate.runGatedSubmit(ctx(), () => 'x');
      expect(names()).toEqual(['submit_hold_started', 'submit_hold_expired']);
    });

    it('a thrown decider emits released_error, distinct from an expiry', async () => {
      const { gate, names } = makeGate(async () => { throw new Error('crash'); });
      await gate.runGatedSubmit(ctx(), () => 'x');
      expect(names()).toEqual(['submit_hold_started', 'submit_hold_released_error']);
    });

    it('an empty replacement emits its own reason rather than silently allowing', async () => {
      const { gate, names } = makeGate(async () => ({ kind: 'block', replacement: '' }));
      await gate.runGatedSubmit(ctx(), () => 'x', () => 'y');
      expect(names()).toContain('submit_hold_released_empty_replacement');
    });

    it('the started event reports NO ceiling by default — the popup waits for a human', async () => {
      const { gate, events } = makeGate(ALLOW);
      await gate.runGatedSubmit(ctx(), () => 'x');
      expect(events[0]!.data).toMatchObject({ budgetMs: null });
    });

    it('with no ceiling, a slow decision is NOT cut off', async () => {
      // The 75 s ceiling fired on a user still reading a 2,000-character prompt
      // (live, Lovable). Nothing may end the wait but the user or a failure.
      let release: (d: SubmitDecision) => void = () => {};
      const decide = vi.fn(() => new Promise<SubmitDecision>((r) => { release = r; }));
      const { gate, names } = makeGate(decide);
      const send = vi.fn().mockReturnValue('sent');

      const inFlight = gate.runGatedSubmit(ctx(), send);
      await new Promise((r) => setTimeout(r, 60));
      expect(send).not.toHaveBeenCalled();      // still holding
      expect(names()).not.toContain('submit_hold_expired');

      release({ kind: 'allow' });
      await inFlight;
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('a ceiling still works when one is configured', async () => {
      const { gate, names } = makeGate(() => new Promise<SubmitDecision>(() => {}), { timeout: true });
      await gate.runGatedSubmit(ctx(), () => 'x');
      expect(names()).toContain('submit_hold_expired');
    });
  });
});
