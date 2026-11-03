/**
 * Feature 1 — v1(a) safe writes from the worker into our map (D12, v1(a).md §9.1).
 *
 * The hooks hold `prompt-store.db`'s lock for their whole run, and a hook that waits longer
 * than 8 s carries on without it. The worker must never add to that risk, so its rule is
 * stricter: if the lock is held (and not stale), it does not wait and does not write — the
 * caller tries again later. It also never creates the database; that is the hooks' job.
 */

import { closeSync, existsSync, openSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { getSql, saveStore, type Store } from '../../store/db.js';

/** Same rule as the hooks: a lock older than this was left by a crashed process. */
const LOCK_STALE_MS = 30_000;

export type StoreWriteResult<T> = { written: true; result: T } | { written: false; reason: 'busy' | 'missing' };

export async function withStoreWrite<T>(dbPath: string, write: (store: Store) => T): Promise<StoreWriteResult<T>> {
  return withStore(dbPath, write, true);
}

/**
 * Read our map under the same lock rule (never wait, never steal), without saving. The hooks
 * write the file in place, so reading it without the lock could see half a file.
 */
export async function withStoreRead<T>(dbPath: string, read: (store: Store) => T): Promise<StoreWriteResult<T>> {
  return withStore(dbPath, read, false);
}

async function withStore<T>(dbPath: string, fn: (store: Store) => T, save: boolean): Promise<StoreWriteResult<T>> {
  if (!existsSync(dbPath)) return { written: false, reason: 'missing' };
  const lockPath = `${dbPath}.lock`;
  if (!takeLock(lockPath)) return { written: false, reason: 'busy' };
  try {
    const SQL = await getSql();
    const store: Store = { db: new SQL.Database(readFileSync(dbPath)), dbPath, _releaseLock: () => {} };
    try {
      const result = fn(store);
      if (save) saveStore(store);
      return { written: true, result };
    } finally {
      store.db.close();
    }
  } finally {
    try {
      unlinkSync(lockPath);
    } catch {
      /* already gone */
    }
  }
}

function takeLock(lockPath: string): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      closeSync(openSync(lockPath, 'wx'));
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') return false;
      let age = 0;
      try {
        age = Date.now() - statSync(lockPath).mtimeMs;
      } catch {
        continue; // released in between: try again
      }
      if (age <= LOCK_STALE_MS) return false; // a hook is working: never wait, never steal
      try {
        unlinkSync(lockPath); // crashed holder
      } catch {
        return false;
      }
    }
  }
  return false;
}
