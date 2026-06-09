import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdvisoryPoller } from './advisory-poller.js';
import type { StoredAdvisory } from './advisory-store-reader.js';

const advisory = (overrides: Partial<StoredAdvisory> = {}): StoredAdvisory => ({
  projectRoot: '/proj',
  stage: 'implementation',
  flagType: 'stage_transition',
  pinchLabel: 'Quick check.',
  createdAt: 1000,
  status: 'pending',
  l1: ['opt'],
  l2: [],
  l3: [],
  ...overrides,
});

describe('createAdvisoryPoller', () => {
  let onFresh: ReturnType<typeof vi.fn>;
  let read: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onFresh = vi.fn();
    read = vi.fn();
  });

  it('fires onFreshAdvisory for an advisory parked after start()', async () => {
    read.mockResolvedValue(advisory({ projectRoot: '/proj', createdAt: 6000 }));
    const poller = createAdvisoryPoller({
      projectRoots: ['/proj'], onFreshAdvisory: onFresh, read,
      now: () => 5000, setIntervalFn: () => 1, clearIntervalFn: () => {},
    });
    poller.start();          // seeds lastDeliveredAt = 5000
    await poller.pollOnce();
    expect(onFresh).toHaveBeenCalledWith('/proj');
  });

  it('does NOT fire for advisories that predate start() (no replay)', async () => {
    read.mockResolvedValue(advisory({ createdAt: 4000 }));
    const poller = createAdvisoryPoller({
      projectRoots: ['/proj'], onFreshAdvisory: onFresh, read,
      now: () => 5000, setIntervalFn: () => 1, clearIntervalFn: () => {},
    });
    poller.start();
    await poller.pollOnce();
    expect(onFresh).not.toHaveBeenCalled();
  });

  it('fires only once per advisory (dedup by createdAt), then again for a newer one', async () => {
    const poller = createAdvisoryPoller({
      projectRoots: ['/proj'], onFreshAdvisory: onFresh, read,
      now: () => 1000, setIntervalFn: () => 1, clearIntervalFn: () => {},
    });
    poller.start();
    read.mockResolvedValue(advisory({ createdAt: 2000 }));
    await poller.pollOnce();
    await poller.pollOnce();           // same advisory — no re-fire
    expect(onFresh).toHaveBeenCalledTimes(1);
    read.mockResolvedValue(advisory({ createdAt: 3000 })); // a newer one
    await poller.pollOnce();
    expect(onFresh).toHaveBeenCalledTimes(2);
  });

  it('picks the newest advisory across candidate roots (canonical vs raw)', async () => {
    read.mockImplementation(async (root: string) =>
      root === '/private/var/proj'
        ? advisory({ projectRoot: root, createdAt: 7000 })
        : advisory({ projectRoot: root, createdAt: 6000 }),
    );
    const poller = createAdvisoryPoller({
      projectRoots: ['/var/proj', '/private/var/proj'], onFreshAdvisory: onFresh, read,
      now: () => 5000, setIntervalFn: () => 1, clearIntervalFn: () => {},
    });
    poller.start();
    await poller.pollOnce();
    expect(onFresh).toHaveBeenCalledWith('/private/var/proj');
  });

  it('no-ops when no advisory exists under any root', async () => {
    read.mockResolvedValue(null);
    const poller = createAdvisoryPoller({
      projectRoots: ['/a', '/b'], onFreshAdvisory: onFresh, read,
      now: () => 5000, setIntervalFn: () => 1, clearIntervalFn: () => {},
    });
    poller.start();
    await poller.pollOnce();
    expect(onFresh).not.toHaveBeenCalled();
  });

  it('tolerates a reader that rejects for one root', async () => {
    read.mockImplementation(async (root: string) => {
      if (root === '/bad') throw new Error('db locked');
      return advisory({ projectRoot: root, createdAt: 9000 });
    });
    const poller = createAdvisoryPoller({
      projectRoots: ['/bad', '/good'], onFreshAdvisory: onFresh, read,
      now: () => 5000, setIntervalFn: () => 1, clearIntervalFn: () => {},
    });
    poller.start();
    await poller.pollOnce();
    expect(onFresh).toHaveBeenCalledWith('/good');
  });

  it('start() schedules on the injected timer; stop() clears it', () => {
    const setIntervalFn = vi.fn(() => 42);
    const clearIntervalFn = vi.fn();
    const poller = createAdvisoryPoller({
      projectRoots: ['/proj'], onFreshAdvisory: onFresh, read,
      intervalMs: 1234, setIntervalFn, clearIntervalFn, now: () => 0,
    });
    poller.start();
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 1234);
    poller.start(); // idempotent — no second timer
    expect(setIntervalFn).toHaveBeenCalledTimes(1);
    poller.stop();
    expect(clearIntervalFn).toHaveBeenCalledWith(42);
  });

  it('does not overlap cycles (a slow read blocks the next pollOnce)', async () => {
    let resolveRead: (v: StoredAdvisory | null) => void = () => {};
    read.mockImplementation(() => new Promise((r) => { resolveRead = r; }));
    const poller = createAdvisoryPoller({
      projectRoots: ['/proj'], onFreshAdvisory: onFresh, read,
      now: () => 0, setIntervalFn: () => 1, clearIntervalFn: () => {},
    });
    poller.start();
    const p1 = poller.pollOnce();   // starts, blocks on read
    await poller.pollOnce();        // should early-return (inFlight)
    expect(read).toHaveBeenCalledTimes(1);
    resolveRead(advisory({ createdAt: 5000 }));
    await p1;
    expect(onFresh).toHaveBeenCalledTimes(1);
  });
});
