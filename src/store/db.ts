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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import type { SqlJsStatic, Database } from 'sql.js';
import { migrate } from './schema.js';
import { logger } from '../logger.js';

export const DEFAULT_DB_PATH = join(homedir(), '.nexpath', 'prompt-store.db');

// 100 MB soft ceiling from retention-privacy-research
const MAX_DB_BYTES = 100 * 1024 * 1024;

export type Store = {
  db: Database;
  dbPath: string; // ':memory:' skips all file I/O
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

  const store: Store = { db, dbPath };

  if (dbPath !== ':memory:') {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
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
}
