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
  existsSync, mkdirSync, readFileSync, writeFileSync,
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

const LOCK_STALE_MS = 30_000; // lock older than 30 s → crashed holder, remove
const LOCK_WAIT_MS  =  8_000; // max time to wait before proceeding without lock
const LOCK_RETRY_MS =    80;  // poll interval while waiting

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

  // Timeout: forcibly remove the stale lock and proceed without one
  try { unlinkSync(lockPath); } catch { /* ignore */ }
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

  let buffer: Buffer | null = null;
  if (dbPath !== ':memory:' && existsSync(dbPath)) {
    buffer = readFileSync(dbPath);
  }

  let db: Database;
  try {
    db = buffer ? new SQL.Database(buffer) : new SQL.Database();
  } catch (err) {
    logger.error('db_open_failed', { path: dbPath, error: (err as Error).message });
    db = new SQL.Database(); // blank fallback — prevents hook crash
  }
  migrate(db);
  applyIncrementalMigrations(db);

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

function _writeToDisk(store: Store): void {
  const data = store.db.export();
  writeFileSync(store.dbPath, data);

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
    writeFileSync(store.dbPath, store.db.export());
  }
}

export function closeStore(store: Store): void {
  saveStore(store);
  store.db.close();
  store._releaseLock();
}
