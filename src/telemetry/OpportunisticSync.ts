import { closeSync, openSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Store } from '../store/db.js';
import { getConfig, setConfig } from '../store/config.js';
import { DEFAULT_POSTHOG_ENDPOINT } from './TelemetryClient.js';
import { runSyncAttempt } from './TelemetrySyncRunner.js';
import { loadSyncState, saveSyncState } from './TelemetrySyncScheduler.js';

const SYNC_LOCK_PATH       = join(homedir(), '.nexpath', 'sync.lock');
const DEFAULT_STALE_LOCK_MS = 60_000;

export interface OpportunisticSyncOptions {
  lockStaleMs?: number;
  now?:         () => number;
  lockPath?:    string;
}

/**
 * Fire one sync attempt opportunistically from the auto/stop hooks.
 *
 * Guards (skip-and-return on any):
 *   1. telemetry_sync_enabled !== 'true'
 *   2. telemetry_sync_api_key missing
 *   3. another process already holds the cross-process lock (and lock is fresh)
 *
 * Hook-safety contract: this function NEVER throws. All errors are swallowed
 * by an outer try/catch so the caller's hook UX is never blocked by a
 * telemetry failure.
 *
 * Callers should invoke as `void triggerOpportunisticSync(store).catch(() => {})`
 * to also defend against a synchronous throw before the outer try begins.
 */
export async function triggerOpportunisticSync(
  store: Store,
  opts:  OpportunisticSyncOptions = {},
): Promise<void> {
  const lockPath     = opts.lockPath    ?? SYNC_LOCK_PATH;
  const lockStaleMs  = opts.lockStaleMs ?? DEFAULT_STALE_LOCK_MS;
  const now          = opts.now         ?? (() => Date.now());

  let lockHeld = false;
  try {
    if (getConfig(store.db, 'telemetry_sync_enabled') !== 'true') return;

    const apiKey = getConfig(store.db, 'telemetry_sync_api_key');
    if (!apiKey) return;

    if (!acquireLock(lockPath, lockStaleMs, now)) return;
    lockHeld = true;

    const endpoint = getConfig(store.db, 'telemetry_sync_endpoint') ?? DEFAULT_POSTHOG_ENDPOINT;
    const state    = loadSyncState();
    const before   = state?.consecutive_failures ?? 0;

    const result = await runSyncAttempt({ apiKey, endpoint }, before);

    const nowIso = new Date(now()).toISOString();
    saveSyncState({
      next_sync_at:         state?.next_sync_at ?? null,
      last_attempt_at:      nowIso,
      last_success_at:      result.status === 'ok' ? nowIso : (state?.last_success_at ?? null),
      last_error:           result.status === 'ok' ? null : `sync_${result.status}`,
      consecutive_failures: result.consecutiveFailuresAfter,
    });

    if (result.shouldDisableSync) {
      try { setConfig(store, 'telemetry_sync_enabled', 'false'); } catch { /* never propagate */ }
    }
  } catch {
    // Hook UX must never be blocked by a telemetry failure.
  } finally {
    if (lockHeld) {
      try { unlinkSync(lockPath); } catch { /* ignore */ }
    }
  }
}

/**
 * Atomic cross-process lock acquire via O_CREAT | O_EXCL ('wx' flag).
 * Returns true on success, false if another process holds a fresh lock.
 * Overwrites a stale lock (older than lockStaleMs) and acquires it.
 */
function acquireLock(lockPath: string, lockStaleMs: number, now: () => number): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lockPath, 'wx');
      try { writeSync(fd, String(process.pid)); } catch { /* best-effort pid write */ }
      closeSync(fd);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') return false;
      // EEXIST — check if the existing lock is stale
      try {
        const age = now() - statSync(lockPath).mtimeMs;
        if (age > lockStaleMs) {
          unlinkSync(lockPath);
          continue;  // retry once
        }
      } catch {
        // Lock file disappeared between EEXIST and statSync — retry
        continue;
      }
      return false;
    }
  }
  return false;
}
