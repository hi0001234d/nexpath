import type { Database } from 'sql.js';

/**
 * Current row schema version stamped onto rows in versioned tables
 * (`content_templates`, `user_depth_level`, and the param-event log).
 * Readers accept any row whose `schema_version` is <= this value; rows written
 * by a newer, not-yet-understood writer are ignored so the caller can fall back
 * to its built-in default. New writer versions only ADD fields — they never
 * reinterpret existing ones — so old rows are never rewritten.
 */
export const SCHEMA_VERSION = 1;

const DDL = `
CREATE TABLE IF NOT EXISTS prompts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_root TEXT    NOT NULL,
  prompt_text  TEXT    NOT NULL,
  agent        TEXT,
  captured_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prompts_project_id
  ON prompts (project_root, id);

CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  project_root           TEXT    NOT NULL UNIQUE,
  name                   TEXT    NOT NULL,
  project_type           TEXT,
  language               TEXT,
  description            TEXT,
  detected_language      TEXT,
  decision_session_count INTEGER NOT NULL DEFAULT 0,
  created_at             INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_states (
  project_root TEXT    PRIMARY KEY,
  session_id   TEXT    NOT NULL,
  state_json   TEXT    NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS skipped_sessions (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  project_root            TEXT    NOT NULL,
  session_id              TEXT    NOT NULL,
  flag_type               TEXT    NOT NULL,
  stage                   TEXT    NOT NULL,
  level_reached           INTEGER NOT NULL,
  skipped_at_prompt_count INTEGER NOT NULL,
  skipped_at              INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skipped_sessions_project
  ON skipped_sessions (project_root, skipped_at);

CREATE TABLE IF NOT EXISTS pending_advisories (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_root TEXT    NOT NULL,
  stage        TEXT    NOT NULL,
  flag_type    TEXT    NOT NULL,
  pinch_label  TEXT    NOT NULL,
  session_id   TEXT    NOT NULL,
  prompt_count INTEGER NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'pending',
  created_at   INTEGER NOT NULL,
  generated_l1 TEXT,
  generated_l2 TEXT,
  generated_l3 TEXT,
  prev_stage   TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_advisories_project
  ON pending_advisories (project_root, status, created_at);

-- Per-project generated + user-uploaded option-content templates, keyed by
-- (project_root, signal_type, source). Shipped defaults live in source code,
-- NOT here. record_json holds the serializable template payload as written;
-- its shape is validated by the content-template engine on read. schema_version
-- enables forward-compatible reads (see SCHEMA_VERSION).
CREATE TABLE IF NOT EXISTS content_templates (
  project_root   TEXT    NOT NULL,
  signal_type    TEXT    NOT NULL,
  source         TEXT    NOT NULL,
  record_json    TEXT    NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (project_root, signal_type, source)
);

-- Per-project workflow-maturity level + graduation state. A running aggregate
-- that survives prompt pruning: current_level is the user's detected maturity
-- band; the counters + timestamp drive graduation / down-graduation.
CREATE TABLE IF NOT EXISTS user_depth_level (
  project_root       TEXT    NOT NULL PRIMARY KEY,
  current_level      INTEGER NOT NULL,
  stability_counter  INTEGER NOT NULL DEFAULT 0,
  last_graduation_at INTEGER,
  hysteresis_counter INTEGER NOT NULL DEFAULT 0,
  schema_version     INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
`;

export function migrate(db: Database): void {
  db.run(DDL);
}

/**
 * Silently apply incremental schema migrations — no console output.
 * Safe to call from openStore() on every startup; each step checks column
 * existence before attempting ALTER TABLE.
 */
export function applyIncrementalMigrations(db: Database): void {
  const addIfMissing = (table: string, column: string, definition: string): void => {
    const res = db.exec(`PRAGMA table_info(${table})`);
    const cols = (res[0]?.values ?? []).map((row) => row[1] as string);
    if (!cols.includes(column)) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

  // v0.1.1 — Phase B
  addIfMissing('projects', 'detected_language',      'TEXT');
  addIfMissing('projects', 'decision_session_count', 'INTEGER NOT NULL DEFAULT 0');

  // v0.1.1 — options-text-generation
  addIfMissing('pending_advisories', 'generated_l1', 'TEXT');
  addIfMissing('pending_advisories', 'generated_l2', 'TEXT');
  addIfMissing('pending_advisories', 'generated_l3', 'TEXT');

  // sub-10 — deferred option gen + cross-session guard
  addIfMissing('pending_advisories', 'prev_stage', 'TEXT');
}

/**
 * Apply incremental schema migrations with console output.
 * Safe to run multiple times — each step checks column existence before ALTER.
 * Run via: nexpath db migrate
 */
export function runMigrations(db: Database): void {
  const addIfMissing = (table: string, column: string, definition: string): void => {
    const res = db.exec(`PRAGMA table_info(${table})`);
    const cols = (res[0]?.values ?? []).map((row) => row[1] as string);
    if (!cols.includes(column)) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`  + ${table}.${column}`);
    } else {
      console.log(`  ✓ ${table}.${column} (already present)`);
    }
  };

  // v0.1.1 — Phase B
  addIfMissing('projects', 'detected_language',      'TEXT');
  addIfMissing('projects', 'decision_session_count', 'INTEGER NOT NULL DEFAULT 0');

  // v0.1.1 — options-text-generation
  addIfMissing('pending_advisories', 'generated_l1', 'TEXT');
  addIfMissing('pending_advisories', 'generated_l2', 'TEXT');
  addIfMissing('pending_advisories', 'generated_l3', 'TEXT');

  // sub-10 — deferred option gen + cross-session guard
  addIfMissing('pending_advisories', 'prev_stage', 'TEXT');
}
