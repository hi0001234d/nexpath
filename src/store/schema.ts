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
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_root TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  project_type TEXT,
  language     TEXT,
  description  TEXT,
  created_at   INTEGER NOT NULL
);
`;

export function migrate(db: Database): void {
  db.run(DDL);
}
