import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, closeStore, setConfig } from '../store/index.js';
import type { Store } from '../store/db.js';
import { triggerOpportunisticSync } from './OpportunisticSync.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('./TelemetrySyncRunner.js', () => ({
  runSyncAttempt: vi.fn(),
}));

vi.mock('./TelemetrySyncScheduler.js', () => ({
  loadSyncState: vi.fn(),
  saveSyncState: vi.fn(),
}));

import { runSyncAttempt } from './TelemetrySyncRunner.js';
import { loadSyncState, saveSyncState } from './TelemetrySyncScheduler.js';

const mockedRunSyncAttempt = vi.mocked(runSyncAttempt);
const mockedLoadSyncState  = vi.mocked(loadSyncState);
const mockedSaveSyncState  = vi.mocked(saveSyncState);

// ── Helpers ──────────────────────────────────────────────────────────────────

let store: Store;
let tmpDir: string;
let lockPath: string;

beforeEach(async () => {
  store = await openStore(':memory:');
  tmpDir   = mkdtempSync(join(tmpdir(), 'opportunistic-sync-test-'));
  lockPath = join(tmpDir, 'sync.lock');
  mockedRunSyncAttempt.mockReset();
  mockedLoadSyncState.mockReset();
  mockedSaveSyncState.mockReset();
  mockedLoadSyncState.mockReturnValue(null);
  mockedRunSyncAttempt.mockResolvedValue({
    status:                   'ok',
    sentEvents:               1,
    consecutiveFailuresAfter: 0,
    shouldDisableSync:        false,
  });
});

afterEach(() => {
  closeStore(store);
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function enableSync(): void {
  setConfig(store, 'telemetry_sync_enabled', 'true');
  setConfig(store, 'telemetry_sync_api_key', 'phc_test_key');
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('triggerOpportunisticSync', () => {
  it('skips when telemetry_sync_enabled is not "true"', async () => {
    setConfig(store, 'telemetry_sync_api_key', 'phc_test_key');
    // sync flag intentionally NOT set

    await triggerOpportunisticSync(store, { lockPath });

    expect(mockedRunSyncAttempt).not.toHaveBeenCalled();
    expect(mockedSaveSyncState).not.toHaveBeenCalled();
    expect(existsSync(lockPath)).toBe(false);
  });

  it('skips when api_key is missing', async () => {
    setConfig(store, 'telemetry_sync_enabled', 'true');
    // api_key intentionally NOT set — but DEFAULT_CONFIG ships one, so override empty
    setConfig(store, 'telemetry_sync_api_key', '');

    await triggerOpportunisticSync(store, { lockPath });

    expect(mockedRunSyncAttempt).not.toHaveBeenCalled();
    expect(mockedSaveSyncState).not.toHaveBeenCalled();
  });

  it('fires sync on every call when guards 1+2 pass and no lock contention', async () => {
    enableSync();

    await triggerOpportunisticSync(store, { lockPath });
    await triggerOpportunisticSync(store, { lockPath });
    await triggerOpportunisticSync(store, { lockPath });

    expect(mockedRunSyncAttempt).toHaveBeenCalledTimes(3);
    expect(mockedSaveSyncState).toHaveBeenCalledTimes(3);
  });

  it('acquires and releases the lock around the sync call', async () => {
    enableSync();

    let lockExistedDuringSync = false;
    mockedRunSyncAttempt.mockImplementationOnce(async () => {
      lockExistedDuringSync = existsSync(lockPath);
      return {
        status:                   'ok',
        sentEvents:               1,
        consecutiveFailuresAfter: 0,
        shouldDisableSync:        false,
      };
    });

    await triggerOpportunisticSync(store, { lockPath });

    expect(lockExistedDuringSync).toBe(true);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('skips when lock file is held by another process and fresh (< 60s old)', async () => {
    enableSync();
    writeFileSync(lockPath, '99999');  // simulate another process's lock

    await triggerOpportunisticSync(store, { lockPath });

    expect(mockedRunSyncAttempt).not.toHaveBeenCalled();
    // Original lock must be untouched
    expect(existsSync(lockPath)).toBe(true);
    expect(readFileSync(lockPath, 'utf8')).toBe('99999');
  });

  it('overwrites stale lock file older than 60s and proceeds with sync', async () => {
    enableSync();
    writeFileSync(lockPath, '99999');
    // Backdate lock file to 2 minutes ago
    const twoMinAgoSec = Math.floor(Date.now() / 1000) - 120;
    utimesSync(lockPath, twoMinAgoSec, twoMinAgoSec);

    await triggerOpportunisticSync(store, { lockPath });

    expect(mockedRunSyncAttempt).toHaveBeenCalledTimes(1);
    // After successful sync, lock should be released
    expect(existsSync(lockPath)).toBe(false);
  });

  it('silently catches all errors — never throws', async () => {
    enableSync();
    mockedRunSyncAttempt.mockRejectedValueOnce(new Error('PostHog exploded'));

    await expect(triggerOpportunisticSync(store, { lockPath })).resolves.toBeUndefined();
    // Lock must still be released after error
    expect(existsSync(lockPath)).toBe(false);
  });
});
