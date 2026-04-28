import type { Database } from 'sql.js';

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
  generated_l3 TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_advisories_project
  ON pending_advisories (project_root, status, created_at);
`;

export function migrate(db: Database): void {
  db.run(DDL);
}

/**
 * Apply incremental schema migrations to an existing database.
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
}
