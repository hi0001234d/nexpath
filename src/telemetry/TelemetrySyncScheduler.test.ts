import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TelemetrySyncScheduler,
  loadSyncState,
  saveSyncState,
  createDefaultScheduler,
} from './TelemetrySyncScheduler.js';
import { openStore, closeStore } from '../store/db.js';
import { setConfig } from '../store/config.js';
import type { SyncState } from './types.js';

let tmpDir: string;
let statePath: string;

beforeEach(() => {
  tmpDir    = mkdtempSync(join(tmpdir(), 'nexpath-scheduler-'));
  statePath = join(tmpDir, 'state.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.useRealTimers();
});

const FROZEN_NOW = new Date('2026-05-19T10:00:00.000Z');
const fixedNow = () => FROZEN_NOW;

describe('loadSyncState', () => {
  it('returns null when state file does not exist', () => {
    expect(loadSyncState(statePath)).toBeNull();
  });

  it('returns parsed state when valid file exists', () => {
    const state: SyncState = {
      next_sync_at:         '2026-05-19T10:30:00.000Z',
      last_attempt_at:      '2026-05-19T09:50:00.000Z',
      last_success_at:      '2026-05-19T09:50:01.000Z',
      last_error:           null,
      consecutive_failures: 0,
    };
    writeFileSync(statePath, JSON.stringify(state), 'utf8');
    expect(loadSyncState(statePath)).toEqual(state);
  });

  it('returns null when state file is corrupt JSON', () => {
    writeFileSync(statePath, 'not-json{', 'utf8');
    expect(loadSyncState(statePath)).toBeNull();
  });

  it('normalises missing fields to safe defaults', () => {
    writeFileSync(statePath, JSON.stringify({ next_sync_at: '2026-05-19T10:30:00.000Z' }), 'utf8');
    expect(loadSyncState(statePath)).toEqual({
      next_sync_at:         '2026-05-19T10:30:00.000Z',
      last_attempt_at:      null,
      last_success_at:      null,
      last_error:           null,
      consecutive_failures: 0,
    });
  });
});

describe('saveSyncState', () => {
  it('writes state to disk', () => {
    const state: SyncState = {
      next_sync_at:         '2026-05-19T10:30:00.000Z',
      last_attempt_at:      null,
      last_success_at:      null,
      last_error:           null,
      consecutive_failures: 0,
    };
    saveSyncState(state, statePath);
    expect(existsSync(statePath)).toBe(true);
    expect(JSON.parse(readFileSync(statePath, 'utf8'))).toEqual(state);
  });

  it('creates parent directory if missing', () => {
    const nested = join(tmpDir, 'a', 'b', 'state.json');
    saveSyncState({
      next_sync_at: null, last_attempt_at: null, last_success_at: null, last_error: null, consecutive_failures: 0,
    }, nested);
    expect(existsSync(nested)).toBe(true);
  });

  it('does not throw on unwritable path', () => {
    expect(() => saveSyncState({
      next_sync_at: null, last_attempt_at: null, last_success_at: null, last_error: null, consecutive_failures: 0,
    }, '/nonexistent/readonly/state.json')).not.toThrow();
  });
});

describe('TelemetrySyncScheduler — constructor', () => {
  it('initialises empty state when no state file exists', () => {
    const s = new TelemetrySyncScheduler({ statePath, now: fixedNow });
    expect(s.getState()).toEqual({
      next_sync_at:         null,
      last_attempt_at:      null,
      last_success_at:      null,
      last_error:           null,
      consecutive_failures: 0,
    });
  });

  it('loads existing state from disk', () => {
    const state: SyncState = {
      next_sync_at:         '2026-05-19T10:30:00.000Z',
      last_attempt_at:      '2026-05-19T09:50:00.000Z',
      last_success_at:      '2026-05-19T09:50:01.000Z',
      last_error:           null,
      consecutive_failures: 0,
    };
    saveSyncState(state, statePath);
    const s = new TelemetrySyncScheduler({ statePath, now: fixedNow });
    expect(s.getState()).toEqual(state);
  });
});

describe('TelemetrySyncScheduler — randomDelayMs falls within [min, max]', () => {
  it('over 200 samples the delay is always within [10, 30] minutes', () => {
    const onSync = vi.fn(async () => {});
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);

    const min = 10 * 60 * 1000;
    const max = 30 * 60 * 1000;

    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 200; i++) {
      const s = new TelemetrySyncScheduler({
        onSync, statePath, now: () => new Date(), random: Math.random,
      });
      s.start();
      const ns = new Date(s.getState().next_sync_at!).getTime() - FROZEN_NOW.getTime();
      if (ns < lo) lo = ns;
      if (ns > hi) hi = ns;
      s.stop();
      rmSync(statePath, { force: true });
    }
    expect(lo).toBeGreaterThanOrEqual(min);
    expect(hi).toBeLessThanOrEqual(max);
  });

  it('honours custom minMinutes/maxMinutes', () => {
    const s = new TelemetrySyncScheduler({
      statePath, now: fixedNow, random: () => 0,
      minMinutes: 1, maxMinutes: 2,
    });
    s.start();
    const ns = new Date(s.getState().next_sync_at!).getTime() - FROZEN_NOW.getTime();
    expect(ns).toBe(60 * 1000);
    s.stop();
  });
});

describe('TelemetrySyncScheduler — syncNow gating', () => {
  it('short-circuits when isEnabled returns false', async () => {
    const onSync = vi.fn(async () => {});
    const s = new TelemetrySyncScheduler({
      onSync, isEnabled: () => false, statePath, now: fixedNow,
    });
    await s.syncNow();
    expect(onSync).not.toHaveBeenCalled();
    expect(s.getState().last_attempt_at).toBeNull();
  });

  it('prevents concurrent runs via in-memory flag', async () => {
    let resolveRunner!: () => void;
    const runnerPromise = new Promise<void>(r => { resolveRunner = r; });
    const onSync        = vi.fn(() => runnerPromise);
    const s             = new TelemetrySyncScheduler({ onSync, statePath, now: fixedNow });

    const first  = s.syncNow();
    const second = s.syncNow();

    expect(onSync).toHaveBeenCalledTimes(1);
    resolveRunner();
    await Promise.all([first, second]);
    expect(onSync).toHaveBeenCalledTimes(1);
  });
});

describe('TelemetrySyncScheduler — syncNow success/failure paths', () => {
  it('on success: clears last_error, resets consecutive_failures, updates last_success_at', async () => {
    const s = new TelemetrySyncScheduler({
      onSync:    async () => {},
      isEnabled: () => true,
      statePath, now: fixedNow,
    });
    await s.syncNow();
    const st = s.getState();
    expect(st.last_attempt_at).toBe(FROZEN_NOW.toISOString());
    expect(st.last_success_at).toBe(FROZEN_NOW.toISOString());
    expect(st.last_error).toBeNull();
    expect(st.consecutive_failures).toBe(0);
  });

  it('on failure: sets last_error, increments consecutive_failures, does not set last_success_at', async () => {
    const s = new TelemetrySyncScheduler({
      onSync:    async () => { throw new Error('boom'); },
      isEnabled: () => true,
      statePath, now: fixedNow,
    });
    await s.syncNow();
    const st = s.getState();
    expect(st.last_error).toBe('boom');
    expect(st.consecutive_failures).toBe(1);
    expect(st.last_success_at).toBeNull();
  });

  it('persists state to disk after a sync attempt', async () => {
    const s = new TelemetrySyncScheduler({
      onSync:    async () => {},
      isEnabled: () => true,
      statePath, now: fixedNow,
    });
    await s.syncNow();
    expect(loadSyncState(statePath)?.last_success_at).toBe(FROZEN_NOW.toISOString());
  });

  it('consecutive_failures accumulates across failed runs', async () => {
    const s = new TelemetrySyncScheduler({
      onSync:    async () => { throw new Error('fail'); },
      isEnabled: () => true,
      statePath, now: fixedNow,
    });
    await s.syncNow();
    await s.syncNow();
    await s.syncNow();
    expect(s.getState().consecutive_failures).toBe(3);
  });
});

describe('TelemetrySyncScheduler — start/stop with fake timers', () => {
  it('fires onSync after the scheduled delay', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);

    const onSync = vi.fn(async () => {});
    const s      = new TelemetrySyncScheduler({
      onSync, isEnabled: () => true, statePath,
      now: () => new Date(), random: () => 0.5,
      minMinutes: 10, maxMinutes: 30,
    });

    s.start();
    expect(onSync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(20 * 60 * 1000);
    expect(onSync).toHaveBeenCalledTimes(1);

    s.stop();
  });

  it('stop() cancels the pending timer (onSync never fires)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);

    const onSync = vi.fn(async () => {});
    const s      = new TelemetrySyncScheduler({
      onSync, isEnabled: () => true, statePath,
      now: () => new Date(), random: () => 0.5,
    });

    s.start();
    s.stop();

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(onSync).not.toHaveBeenCalled();
  });

  it('double start() is a no-op', () => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);

    const s = new TelemetrySyncScheduler({
      onSync: async () => {}, statePath,
      now: () => new Date(), random: () => 0.5,
    });

    s.start();
    const firstNext = s.getState().next_sync_at;
    s.start();
    expect(s.getState().next_sync_at).toBe(firstNext);
    s.stop();
  });
});

describe('createDefaultScheduler — isEnabled wired through config', () => {
  it('returns false when telemetry_sync_enabled config key is unset (default disabled)', async () => {
    const store = await openStore(':memory:');
    try {
      const onSync = vi.fn(async () => {});
      const s     = createDefaultScheduler(store, onSync);
      await s.syncNow();
      expect(onSync).not.toHaveBeenCalled();
    } finally {
      closeStore(store);
    }
  });

  it('returns true only when telemetry_sync_enabled config key is set to "true"', async () => {
    const store = await openStore(':memory:');
    try {
      setConfig(store, 'telemetry_sync_enabled', 'true');
      const onSync = vi.fn(async () => {});
      const s     = createDefaultScheduler(store, onSync);
      await s.syncNow();
      expect(onSync).toHaveBeenCalledTimes(1);
    } finally {
      closeStore(store);
    }
  });

  it('treats any value other than "true" as disabled', async () => {
    const store = await openStore(':memory:');
    try {
      setConfig(store, 'telemetry_sync_enabled', 'false');
      const onSync = vi.fn(async () => {});
      const s     = createDefaultScheduler(store, onSync);
      await s.syncNow();
      expect(onSync).not.toHaveBeenCalled();
    } finally {
      closeStore(store);
    }
  });
});

describe('TelemetrySyncScheduler — restart survival', () => {
  it('next_sync_at persists across new scheduler instance (process restart)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);

    const first = new TelemetrySyncScheduler({
      onSync: async () => {}, statePath,
      now: () => new Date(), random: () => 0.25,
    });
    first.start();
    const savedNext = first.getState().next_sync_at;
    first.stop();
    expect(savedNext).not.toBeNull();

    const second = new TelemetrySyncScheduler({
      onSync: async () => {}, statePath,
      now: () => new Date(), random: () => 0.99,
    });
    expect(second.getState().next_sync_at).toBe(savedNext);
  });

  it('a past next_sync_at fires immediately on start', async () => {
    saveSyncState({
      next_sync_at:         '2026-05-19T09:00:00.000Z',
      last_attempt_at:      null,
      last_success_at:      null,
      last_error:           null,
      consecutive_failures: 0,
    }, statePath);

    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);

    const onSync = vi.fn(async () => {});
    const s      = new TelemetrySyncScheduler({
      onSync, isEnabled: () => true, statePath,
      now: () => new Date(), random: () => 0.5,
    });
    s.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(onSync).toHaveBeenCalledTimes(1);

    s.stop();
  });
});
