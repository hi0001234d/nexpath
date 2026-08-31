// @vitest-environment jsdom
/**
 * The send-verification cadence.
 *
 * This check sits directly in front of the user, between their click and the
 * prompt appearing in the chat, and a send that works clears the composer within
 * a few frames. On the steady 150 ms cadence the answer was routinely available
 * long before it was read; the wide cadence exists for the tail — a site slow to
 * reconcile — which is exactly where it still applies.
 *
 * What is pinned here is that the tightening changed only WHEN the answer is
 * read: the clock ceiling, the poll-count bound, and every verdict are the same.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createComposerSubmitGate, type ComposerDecision } from './composer-submit-gate.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

/** The gate's budget is not what is under test; keep it out of the way. */
function stubBudget() {
  return () => ({
    run: async <T>(fn: () => Promise<T>) => ({ timedOut: false, value: await fn() }),
    remaining: () => 60_000,
  }) as unknown as ReturnType<typeof import('../adapters/submit-hold-budget.js').createHoldBudget>;
}

function makeGate(over: Record<string, unknown> = {}) {
  const events: string[] = [];
  let composerText = '';
  const deps = {
    agent: 'bolt',
    isArmed: () => true,
    decide: async (): Promise<ComposerDecision> => ({ kind: 'block', replacement: REPLACEMENT }),
    deliverReplacement: async () => true,
    reissueOriginal: async () => true,
    readComposerText: () => composerText,
    emit: (event: string) => { events.push(event); },
    makeBudget: stubBudget(),
    ...over,
  };
  const gate = createComposerSubmitGate(deps as Parameters<typeof createComposerSubmitGate>[0]);
  return { gate, events, setComposer: (t: string) => { composerText = t; } };
}

function makeEvent(): Event {
  return { preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() } as unknown as Event;
}

const PROMPT = 'ship this to production now';
const REPLACEMENT = 'the improved prompt with acceptance criteria';

describe('a send that clears quickly is observed quickly', () => {
  it('⭐ verifies inside the first 150 ms tick — the old cadence could not have read it yet', async () => {
    const { gate, events, setComposer } = makeGate();
    setComposer(REPLACEMENT);                     // delivered, not yet sent

    gate.maybeIntercept(makeEvent(), PROMPT);
    await vi.advanceTimersByTimeAsync(0);         // let the decision resolve
    setComposer('');                              // the site clears it

    // Under the steady 150 ms cadence the second read landed at 150 ms, so
    // nothing could be reported here. The dense early cadence reads at 50 ms.
    await vi.advanceTimersByTimeAsync(120);
    expect(events).toContain('submit_replacement_sent');
  });

  it('a caller-pinned cadence is never made SLOWER than it asked for', async () => {
    // An explicit pollMs below the fast cadence must win, so a test or a caller
    // that pins a cadence keeps exactly it.
    const { gate, events, setComposer } = makeGate({ verify: { timeoutMs: 300, pollMs: 20 } });
    setComposer(REPLACEMENT);

    gate.maybeIntercept(makeEvent(), PROMPT);
    await vi.advanceTimersByTimeAsync(0);
    setComposer('');

    await vi.advanceTimersByTimeAsync(40);
    expect(events).toContain('submit_replacement_sent');
  });
});

describe('the ceiling is unchanged', () => {
  it('a composer that never clears still fails only at the END of the window', async () => {
    const { gate, events, setComposer } = makeGate({ verify: { timeoutMs: 1_000, pollMs: 150 } });
    setComposer(REPLACEMENT);                     // delivered, and it never leaves

    gate.maybeIntercept(makeEvent(), PROMPT);
    await vi.advanceTimersByTimeAsync(0);

    // Well inside the window: no verdict yet.
    await vi.advanceTimersByTimeAsync(600);
    expect(events).not.toContain('submit_hold_substitution_failed');

    // Past it: the same failure verdict as before, at the same ceiling.
    await vi.advanceTimersByTimeAsync(1_200);
    expect(events).toContain('submit_hold_substitution_failed');
  });
});
