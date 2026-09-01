/**
 * H3 — submit-time poller: cross-process handoff and latency (H1's two open questions).
 *
 * These are the tests H1's spike could not produce. It tried twice to measure the
 * handoff through synthetic GUI input and produced no data both times. Because
 * the poller takes an injectable clock and interval, the same questions are
 * answered here deterministically — which is exactly why both were folded out of
 * the spike and into this phase.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createSubmitHookPoller,
  type PendingSubmitDecision,
  type SubmitHandoffTiming,
  type SubmitDeliveryOutcome,
} from './submit-hook-poller.js';

function decision(over: Partial<PendingSubmitDecision> = {}): PendingSubmitDecision {
  return { replacementText: 'replacement', createdAt: 1_000, blockIssuedAt: 900, hookPid: 4242, decisionId: 'd1', ...over };
}

/** Clock we advance by hand so latency assertions are exact, not timing-dependent. */
function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

function harness(over: Record<string, unknown> = {}) {
  const timings: SubmitHandoffTiming[] = [];
  const outcomes: SubmitDeliveryOutcome[] = [];
  const c = clock(500);
  const deps = {
    projectRoots: ['/p'],
    readPendingDecision: vi.fn().mockResolvedValue(null),
    onInject: vi.fn().mockResolvedValue(true),
    onSubmit: vi.fn().mockResolvedValue(true),
    onTiming: (t: SubmitHandoffTiming) => timings.push(t),
    onOutcome: (o: SubmitDeliveryOutcome) => outcomes.push(o),
    now: c.now,
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
    ...over,
  };
  return { timings, outcomes, clock: c, deps };
}

describe('H3 — the cross-process handoff closes in one turn', () => {
  it('delivers a decision parked AFTER start(): inject then submit, in that order', async () => {
    const h = harness({ readPendingDecision: vi.fn().mockResolvedValue(decision({ createdAt: 1_000 })) });
    const p = createSubmitHookPoller(h.deps);
    p.start();                    // startedAt = 500
    h.clock.advance(600);         // now 1100, decision createdAt 1000 > 500 ⇒ fresh
    await p.pollOnce();
    expect(h.deps.onInject).toHaveBeenCalledWith('replacement');
    expect(h.deps.onSubmit).toHaveBeenCalled();
    expect(h.outcomes).toEqual(['delivered']);
  });

  it('treats inject and submit as SEPARATE steps — H1 proved neither platform auto-submits', async () => {
    const h = harness({
      readPendingDecision: vi.fn().mockResolvedValue(decision()),
      onSubmit: vi.fn().mockResolvedValue(false),
    });
    const p = createSubmitHookPoller(h.deps);
    p.start(); h.clock.advance(600);
    await p.pollOnce();
    expect(h.deps.onInject).toHaveBeenCalled();
    expect(h.outcomes).toEqual(['submit_failed']); // inserted, but not sent
  });

  it('never submits when injection failed', async () => {
    const h = harness({
      readPendingDecision: vi.fn().mockResolvedValue(decision()),
      onInject: vi.fn().mockResolvedValue(false),
    });
    const p = createSubmitHookPoller(h.deps);
    p.start(); h.clock.advance(600);
    await p.pollOnce();
    expect(h.deps.onSubmit).not.toHaveBeenCalled();
    expect(h.outcomes).toEqual(['inject_failed']);
  });

  it('delivers a given decision only once, even across repeated polls', async () => {
    const h = harness({ readPendingDecision: vi.fn().mockResolvedValue(decision()) });
    const p = createSubmitHookPoller(h.deps);
    p.start(); h.clock.advance(600);
    await p.pollOnce();
    await p.pollOnce();
    await p.pollOnce();
    expect(h.deps.onInject).toHaveBeenCalledTimes(1);
  });
});

describe('H3 — the stale-turn guard (the pe-poller idiom)', () => {
  it('SKIPS a decision parked before start() — it belongs to an earlier turn', async () => {
    const h = harness({ readPendingDecision: vi.fn().mockResolvedValue(decision({ createdAt: 100 })) });
    const p = createSubmitHookPoller(h.deps); // startedAt = 500
    p.start(); h.clock.advance(600);
    await p.pollOnce();
    expect(h.deps.onInject).not.toHaveBeenCalled();
    expect(h.outcomes).toEqual(['skipped_stale']);
  });

  it('SKIPS a decision parked exactly AT start() — the boundary is <=, not <', async () => {
    const h = harness({ readPendingDecision: vi.fn().mockResolvedValue(decision({ createdAt: 500 })) });
    const p = createSubmitHookPoller(h.deps); // startedAt = 500
    p.start(); h.clock.advance(600);
    await p.pollOnce();
    expect(h.outcomes).toEqual(['skipped_stale']);
  });
});

describe('H3 — measured handoff latency (the number the evidence packet needs)', () => {
  it('records all FIVE mandated stages, timed from block_issued and from persistence', async () => {
    // The dev plan mandates five: block issued -> decision persisted -> extension
    // observed -> inject dispatched -> submit dispatched. This suite previously
    // asserted only four; `block_issued` was absent from the source entirely, so
    // the recorded latency omitted the hook's own decision time — which under
    // option-A ordering contains auto's LLM classification, the largest term.
    const h = harness({
      readPendingDecision: vi.fn().mockResolvedValue(decision({ createdAt: 1_000, blockIssuedAt: 900 })),
    });
    const p = createSubmitHookPoller(h.deps);
    p.start(); h.clock.advance(600); // now 1100 ⇒ 100ms after persist, 200ms after block
    await p.pollOnce();
    expect(h.timings.map((t) => t.stage)).toEqual([
      'block_issued', 'decision_persisted', 'extension_observed', 'inject_dispatched', 'submit_dispatched',
    ]);
    for (const t of h.timings) {
      expect(t.decisionId).toBe('d1');
      expect(t.sinceDecisionMs).toBe(100);      // exact — the clock is injected
      expect(t.sinceBlockIssuedMs).toBe(200);   // includes the hook's decision time
    }
  });

  it('sinceBlockIssuedMs exceeds sinceDecisionMs — the two are not the same number', async () => {
    // MUTATION GUARD: wiring sinceBlockIssuedMs to createdAt would make the new
    // field a duplicate and silently drop the hook's decision time again.
    const h = harness({
      readPendingDecision: vi.fn().mockResolvedValue(decision({ createdAt: 1_000, blockIssuedAt: 400 })),
    });
    const p = createSubmitHookPoller(h.deps);
    p.start(); h.clock.advance(600);
    await p.pollOnce();
    expect(h.timings[0].sinceBlockIssuedMs).toBe(700);
    expect(h.timings[0].sinceDecisionMs).toBe(100);
  });

  it('latency grows with real elapsed time — proving it measures rather than reports a constant', async () => {
    const c = clock(500);
    const h = harness({
      readPendingDecision: vi.fn().mockResolvedValue(decision({ createdAt: 1_000 })),
      now: c.now,
      // Injection takes time; the clock advances during it.
      onInject: vi.fn().mockImplementation(async () => { c.advance(250); return true; }),
    });
    h.clock.advance(0);
    const p = createSubmitHookPoller({ ...h.deps, now: c.now });
    p.start(); c.advance(600); // 1100
    await p.pollOnce();
    const observed = h.timings.find((t) => t.stage === 'extension_observed')!;
    const injected = h.timings.find((t) => t.stage === 'inject_dispatched')!;
    expect(observed.sinceDecisionMs).toBe(100);
    expect(injected.sinceDecisionMs).toBe(350); // 100 + 250 spent injecting
  });
});

describe('H3 — FAIL-OPEN (A3): delivery problems never cascade', () => {
  it('a throwing store read does not stop other roots or crash the tick', async () => {
    const read = vi.fn()
      .mockRejectedValueOnce(new Error('db locked'))
      .mockResolvedValueOnce(decision());
    const h = harness({ projectRoots: ['/bad', '/good'], readPendingDecision: read });
    const p = createSubmitHookPoller(h.deps);
    p.start(); h.clock.advance(600);
    await expect(p.pollOnce()).resolves.toBeUndefined();
    expect(h.deps.onInject).toHaveBeenCalledTimes(1);
  });

  it('a throwing injector is reported, not propagated', async () => {
    const h = harness({
      readPendingDecision: vi.fn().mockResolvedValue(decision()),
      onInject: vi.fn().mockRejectedValue(new Error('command missing')),
    });
    const p = createSubmitHookPoller(h.deps);
    p.start(); h.clock.advance(600);
    await expect(p.pollOnce()).resolves.toBeUndefined();
    expect(h.outcomes).toEqual(['inject_failed']);
  });

  it('a throwing submitter is reported, not propagated', async () => {
    const h = harness({
      readPendingDecision: vi.fn().mockResolvedValue(decision()),
      onSubmit: vi.fn().mockRejectedValue(new Error('keystroke failed')),
    });
    const p = createSubmitHookPoller(h.deps);
    p.start(); h.clock.advance(600);
    await expect(p.pollOnce()).resolves.toBeUndefined();
    expect(h.outcomes).toEqual(['submit_failed']);
  });

  it('never re-enters while a poll is already in flight', async () => {
    let resolve!: (v: PendingSubmitDecision | null) => void;
    const read = vi.fn().mockImplementation(() => new Promise((r) => { resolve = r; }));
    const h = harness({ readPendingDecision: read });
    const p = createSubmitHookPoller(h.deps);
    p.start();
    const first = p.pollOnce();
    await p.pollOnce();                 // must be a no-op while the first is open
    expect(read).toHaveBeenCalledTimes(1);
    resolve(null);
    await first;
  });
});

describe('H3 — lifecycle', () => {
  it('stop() clears the interval handle it created', () => {
    const clearFn = vi.fn();
    const h = harness({ setIntervalFn: () => 'handle-1', clearIntervalFn: clearFn });
    const p = createSubmitHookPoller(h.deps);
    p.start();
    p.stop();
    expect(clearFn).toHaveBeenCalledWith('handle-1');
  });

  it('stop() is safe before start() and idempotent', () => {
    const clearFn = vi.fn();
    const h = harness({ clearIntervalFn: clearFn });
    const p = createSubmitHookPoller(h.deps);
    expect(() => { p.stop(); p.stop(); }).not.toThrow();
    expect(clearFn).not.toHaveBeenCalled();
  });

  it('uses the 2000ms default interval, matching pe-poller/advisory-poller', () => {
    const setFn = vi.fn().mockReturnValue(1);
    const h = harness({ setIntervalFn: setFn });
    const p = createSubmitHookPoller(h.deps);
    p.start();
    expect(setFn).toHaveBeenCalledWith(expect.any(Function), 2000);
  });
});
