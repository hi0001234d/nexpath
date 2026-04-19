import type { Database } from 'sql.js';
import { saveStore, type Store } from './db.js';

// Defaults applied when a key has not been explicitly set by the user
export const DEFAULT_CONFIG: Record<string, string> = {
  prompt_capture_enabled: 'true',
  prompt_store_max_per_project: '500',
  prompt_store_max_db_mb: '100',
  log_level: 'info',
};

/** Returns true only if the key has been explicitly written to the config table. */
export function isConfigSet(db: Database, key: string): boolean {
  const result = db.exec('SELECT COUNT(*) FROM config WHERE key = ?', [key]);
  return (result[0]?.values[0]?.[0] as number) > 0;
}

/** Returns the stored value, or the built-in default, or undefined if neither exists. */
export function getConfig(db: Database, key: string): string | undefined {
  const result = db.exec('SELECT value FROM config WHERE key = ?', [key]);
  const stored = result[0]?.values[0]?.[0] as string | undefined;
  return stored !== undefined ? stored : DEFAULT_CONFIG[key];
}

/** Upserts a config value and persists the store to disk. */
export function setConfig(store: Store, key: string, value: string): void {
  store.db.run(
    `INSERT INTO config (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
  saveStore(store);
}

/** Returns all config keys merged with defaults (stored values take precedence). */
export function getAllConfig(db: Database): Record<string, string> {
  const result = db.exec('SELECT key, value FROM config ORDER BY key');
  const stored: Record<string, string> = {};
  for (const row of result[0]?.values ?? []) {
    stored[row[0] as string] = row[1] as string;
  }
  return { ...DEFAULT_CONFIG, ...stored };
}
