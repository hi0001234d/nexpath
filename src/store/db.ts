/**
 * Core DB lifecycle for the nexpath prompt store.
 *
 * sql.js keeps the database entirely in memory during operation.
 * Every mutation must call saveStore() to persist the DB to disk.
 *
 * Pass ':memory:' as dbPath to skip all disk I/O (used in tests).
 */

import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, renameSync,
  openSync, writeSync, closeSync as closeFd, statSync, unlinkSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import type { SqlJsStatic, Database } from 'sql.js';
import { migrate, applyIncrementalMigrations } from './schema.js';
import { logger } from '../logger.js';

export const DEFAULT_DB_PATH = join(homedir(), '.nexpath', 'prompt-store.db');

// 100 MB soft ceiling from retention-privacy-research
const MAX_DB_BYTES = 100 * 1024 * 1024;

// ── File locking ───────────────────────────────────────────────────────────────
// sql.js is in-memory: concurrent hook processes can overwrite each other's
// changes if they both read the DB file, one writes a change, and the other
// saves its stale in-memory copy on top. A per-DB lock file serialises access.

const LOCK_STALE_MS = 45_000; // lock older than 45 s → crashed holder, remove
const LOCK_WAIT_MS  = 15_000; // max time to wait before proceeding without lock
const LOCK_RETRY_MS =     80; // poll interval while waiting

async function acquireLock(lockPath: string): Promise<() => void> {
  const deadline = Date.now() + LOCK_WAIT_MS;

  while (Date.now() < deadline) {
    try {
      // 'wx' = write + exclusive — atomically fails (EEXIST) if file exists
      const fd = openSync(lockPath, 'wx');
      writeSync(fd, String(process.pid));
      closeFd(fd);
      return () => { try { unlinkSync(lockPath); } catch { /* ignore */ } };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
        // Unexpected error (e.g. permissions) — skip lock rather than crash hook
        return () => {};
      }
      // Lock file exists — check if it is stale (holder crashed)
      try {
        const age = Date.now() - statSync(lockPath).mtimeMs;
        if (age > LOCK_STALE_MS) {
          unlinkSync(lockPath);
          continue; // retry immediately
        }
      } catch {
        // File disappeared between EEXIST and statSync — retry immediately
        continue;
      }
      await new Promise<void>((r) => setTimeout(r, LOCK_RETRY_MS));
    }
  }

  // Timeout: only remove the lock if it is actually stale; never delete a live holder's lock.
  try {
    const age = Date.now() - statSync(lockPath).mtimeMs;
    if (age > LOCK_STALE_MS) unlinkSync(lockPath);
  } catch { /* ignore */ }
  return () => {};
}

export type Store = {
  db:           Database;
  dbPath:       string;     // ':memory:' skips all file I/O
  _releaseLock: () => void; // no-op for ':memory:' stores
};

// Module-level singleton — WASM is loaded once per process
let _SQL: SqlJsStatic | null = null;

export async function getSql(): Promise<SqlJsStatic> {
  if (_SQL) return _SQL;
  const _require = createRequire(import.meta.url);
  // sql.js main entry: dist/sql-wasm.js → WASM lives in the same dist/ dir
  const wasmDir = dirname(_require.resolve('sql.js'));
  _SQL = await initSqlJs({ locateFile: (file) => join(wasmDir, file) });
  return _SQL;
}

function openAndMigrateDatabase(SQL: SqlJsStatic, dbPath: string): Database {
  const buffer = dbPath !== ':memory:' && existsSync(dbPath) ? readFileSync(dbPath) : null;
  let db: Database;
  try {
    db = buffer ? new SQL.Database(buffer) : new SQL.Database();
    migrate(db);
    applyIncrementalMigrations(db);
  } catch (err) {
    logger.error('db_open_failed', { path: dbPath, error: (err as Error).message });
    if (dbPath !== ':memory:' && existsSync(dbPath)) {
      try {
        renameSync(dbPath, `${dbPath}.corrupt.${Date.now()}`);
      } catch { /* ignore backup failure */ }
    }
    db = new SQL.Database(); // blank fallback — prevents hook & desktop crash
    migrate(db);
    applyIncrementalMigrations(db);
  }
  return db;
}

export async function openStore(dbPath: string = DEFAULT_DB_PATH): Promise<Store> {
  // Acquire exclusive lock before any disk read so no other hook process can
  // read a stale copy while we are working, then overwrite our writes.
  let releaseLock: () => void = () => {};
  if (dbPath !== ':memory:') {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    releaseLock = await acquireLock(dbPath + '.lock');
  }

  const SQL = await getSql();
  const db = openAndMigrateDatabase(SQL, dbPath);

  const store: Store = { db, dbPath, _releaseLock: releaseLock };

  if (dbPath !== ':memory:') {
    // Write initial file (creates it if new, updates schema if existing)
    _writeToDisk(store);
  }

  return store;
}

export function saveStore(store: Store): void {
  if (store.dbPath === ':memory:') return;
  _writeToDisk(store);
}

function writeDbFileAtomically(dbPath: string, data: Uint8Array): void {
  const tmpPath = `${dbPath}.tmp.${process.pid}`;
  writeFileSync(tmpPath, data);
  try {
    renameSync(tmpPath, dbPath);
  } catch {
    writeFileSync(dbPath, data);
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

function _writeToDisk(store: Store): void {
  const data = store.db.export();
  writeDbFileAtomically(store.dbPath, data);

  // Enforce 100 MB soft ceiling — drop oldest 20% across all projects then VACUUM
  if (data.byteLength > MAX_DB_BYTES) {
    store.db.run(`
      DELETE FROM prompts
      WHERE id IN (
        SELECT id FROM prompts
        ORDER BY captured_at ASC
        LIMIT MAX(1, (SELECT COUNT(*) FROM prompts) / 5)
      )
    `);
    store.db.run('VACUUM');
    writeDbFileAtomically(store.dbPath, store.db.export());
  }
}

export function closeStore(store: Store): void {
  saveStore(store);
  store.db.close();
  store._releaseLock();
}

/**
 * Release this store's lock during a long blocking operation (e.g. the feedback
 * popup) without closing the db, so other sessions are not blocked on it. No-op
 * for ':memory:' stores (they hold no lock). Pair with reacquireStoreLock()
 * before the next write.
 */
export function releaseStoreLock(store: Store): void {
  store._releaseLock();
  store._releaseLock = () => {};
}

/**
 * Re-acquire the lock and reload the db from disk, so writes other sessions made
 * while the lock was released are not clobbered by a stale in-memory image on the
 * next save. No-op for ':memory:' (no lock, no disk).
 */
export async function reacquireStoreLock(store: Store): Promise<void> {
  if (store.dbPath === ':memory:') return;
  store._releaseLock = await acquireLock(store.dbPath + '.lock');
  if (existsSync(store.dbPath)) {
    const SQL   = await getSql();
    const fresh = openAndMigrateDatabase(SQL, store.dbPath);
    store.db.close();
    store.db = fresh;
  }
}

/**
 * Run a long, blocking operation (a user-facing popup wait, or a batch that waits on the LLM) WITHOUT
 * holding this store's lock across it: release the lock, run `fn`, then re-acquire it AND reload the db
 * from disk (via `reacquireStoreLock`) so writes another session made while the lock was released are
 * not clobbered by a stale in-memory image on the next save. The re-acquire+reload runs even if `fn`
 * throws. No-op lock handling for ':memory:' (no lock, no disk).
 *
 * This is the single home for the "never hold the lock across a wait" pattern (MPS-8): every wait that
 * would otherwise hold the lock goes through here — the feedback popup and the spawned GUI popup host
 * today, and (when wired at P5) the sequence continuation Stop wait and the background wording batch.
 */
export async function withReleasedStoreLockV1<T>(store: Store, fn: () => Promise<T>): Promise<T> {
  releaseStoreLock(store);
  try {
    return await fn();
  } finally {
    await reacquireStoreLock(store);
  }
}
