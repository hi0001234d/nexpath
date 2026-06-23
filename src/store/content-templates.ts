/**
 * Persistence for per-project content-template records — the generated and
 * user-uploaded option-content templates, keyed by (project_root, signal_type,
 * source). Shipped defaults ship in source code, not in this table.
 *
 * This module is the storage layer only: `record_json` holds the serializable
 * template payload exactly as written, and the content-template engine validates
 * the payload SHAPE on read. The storage layer guarantees two forward-compatible
 * safeguards so a read never crashes the caller:
 *   1. version tolerance — a row whose `schema_version` is newer than this build
 *      understands (> SCHEMA_VERSION) is ignored, so the caller falls back to its
 *      built-in default rather than mis-reading future fields.
 *   2. corrupt-payload tolerance — an unparseable `record_json` is treated as
 *      absent, again letting the caller fall back.
 */

import type { Database } from 'sql.js';
import { saveStore, type Store } from './db.js';
import { SCHEMA_VERSION } from './schema.js';

/** Where a stored template came from. Shipped defaults are NOT stored here. */
export type ContentTemplateSource = 'uploaded' | 'autogen';

export type ContentTemplateRow = {
  projectRoot: string;
  signalType: string;
  source: ContentTemplateSource;
  /** Serializable template payload; shape validated by the engine on read. */
  record: unknown;
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
};

export type UpsertContentTemplateInput = {
  projectRoot: string;
  signalType: string;
  source: ContentTemplateSource;
  record: unknown;
  /** Override the timestamp (tests); defaults to Date.now(). */
  now?: number;
};

/** Insert or replace a template record, stamped with the current SCHEMA_VERSION. */
export function upsertContentTemplate(store: Store, input: UpsertContentTemplateInput): void {
  const now = input.now ?? Date.now();
  store.db.run(
    `INSERT INTO content_templates
       (project_root, signal_type, source, record_json, schema_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_root, signal_type, source) DO UPDATE SET
       record_json    = excluded.record_json,
       schema_version = excluded.schema_version,
       updated_at     = excluded.updated_at`,
    [input.projectRoot, input.signalType, input.source, JSON.stringify(input.record), SCHEMA_VERSION, now, now],
  );
  saveStore(store);
}

/**
 * Read a template record, or null if absent / written by a newer schema /
 * corrupt. A null result means the caller should fall back to its default.
 */
export function getContentTemplate(
  db: Database,
  projectRoot: string,
  signalType: string,
  source: ContentTemplateSource,
): ContentTemplateRow | null {
  const res = db.exec(
    `SELECT project_root, signal_type, source, record_json, schema_version, created_at, updated_at
       FROM content_templates
      WHERE project_root = ? AND signal_type = ? AND source = ?`,
    [projectRoot, signalType, source],
  );
  const row = res[0]?.values?.[0];
  if (!row) return null;

  const schemaVersion = row[4] as number;
  // Forward-compatible read: ignore rows from a newer writer than we understand.
  if (schemaVersion > SCHEMA_VERSION) return null;

  let record: unknown;
  try {
    record = JSON.parse(row[3] as string);
  } catch {
    return null; // corrupt payload → treat as absent; caller falls back
  }

  return {
    projectRoot: row[0] as string,
    signalType: row[1] as string,
    source: row[2] as ContentTemplateSource,
    record,
    schemaVersion,
    createdAt: row[5] as number,
    updatedAt: row[6] as number,
  };
}

/** Delete a single template record. */
export function deleteContentTemplate(
  store: Store,
  projectRoot: string,
  signalType: string,
  source: ContentTemplateSource,
): void {
  store.db.run(
    'DELETE FROM content_templates WHERE project_root = ? AND signal_type = ? AND source = ?',
    [projectRoot, signalType, source],
  );
  saveStore(store);
}
