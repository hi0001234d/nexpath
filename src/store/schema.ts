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
  env_facts              TEXT,
  env_facts_detected_at  INTEGER,
  prompt_facts             TEXT,
  prompt_facts_detected_at INTEGER,
  prompt_facts_at_count    INTEGER,
  env_trajectory         TEXT,
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

-- Prompt Enhancement popup deferred to the Stop hook (owner decision B-i, 2026-08-04).
-- The UserPromptSubmit auto hook prepares the PE and stores it here without showing a
-- popup; the Stop hook reads the pending row, shows the PE popup, and injects the enhanced
-- prompt as a new turn. request_json / result_json hold the typed prepared PE payload.
CREATE TABLE IF NOT EXISTS pending_prompt_enhancements (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_root TEXT    NOT NULL,
  session_id   TEXT    NOT NULL,
  prompt_count INTEGER NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'pending',
  created_at   INTEGER NOT NULL,
  request_json TEXT    NOT NULL,
  result_json  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_prompt_enhancements_project
  ON pending_prompt_enhancements (project_root, status, created_at);

-- Active multi-prompt sequence bookkeeping for the Stop-hook continuation flow. One active
-- sequence per project_root. Ids, counts and status live in columns; the planned item list
-- and the sequence-wide fields that travel with it live in the additive payload columns
-- (items_json, prompt_directives_json, suggested_next_prompt_policy, original_length,
-- offer_disposition). Item text is stored as OFFSETS into the original prompt plus the
-- wording written once for each item — the original prompt itself is already stored in full
-- in the prompts table, so this introduces no new class of data and no separate retention
-- policy.
-- The runtime gate stays the authority for whether the continuation surface may run at all;
-- a row is never proof of completion.
CREATE TABLE IF NOT EXISTS pending_prompt_sequences (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  project_root       TEXT    NOT NULL,
  session_id         TEXT    NOT NULL,
  sequence_id        TEXT    NOT NULL,
  enhancement_id     TEXT    NOT NULL,
  item_count         INTEGER NOT NULL,
  current_item_index INTEGER NOT NULL,
  status             TEXT    NOT NULL,
  last_action_id     TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  -- MPS continuation content foundation (sub-11, 2026-08-14): the REDACTED, length-preserving
  -- original prompt text (so an item's original slice can render at the continuation Stop —
  -- MPS-12) and the handoffKind (so the packager's continuable-kind check passes). Local store
  -- only, nullable; NEVER raw text, NEVER emitted in telemetry. Nothing reads them yet.
  redacted_original_prompt_text TEXT,
  handoff_kind                  TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_prompt_sequences_project
  ON pending_prompt_sequences (project_root, status, updated_at);

CREATE TABLE IF NOT EXISTS feedback_signals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_root TEXT    NOT NULL,
  kind         TEXT    NOT NULL,   -- 'advisory_fired' | 'option_selected'
  occurred_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_signals_project
  ON feedback_signals (project_root, occurred_at);

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

CREATE TABLE IF NOT EXISTS prompt_enhancement_memory (
  project_root          TEXT    NOT NULL,
  signal_key            TEXT    NOT NULL,
  schema_version        INTEGER NOT NULL,
  evidence_count        INTEGER NOT NULL DEFAULT 0,
  positive_count        INTEGER NOT NULL DEFAULT 0,
  negative_count        INTEGER NOT NULL DEFAULT 0,
  current_evidence_state TEXT   NOT NULL,
  confidence_band       TEXT    NOT NULL,
  source_strength       TEXT    NOT NULL,
  protection_state      TEXT    NOT NULL,
  fatigue_state         TEXT    NOT NULL,
  suppression_state     TEXT    NOT NULL,
  last_used_at          INTEGER,
  last_evidence_at      INTEGER,
  decay_after           INTEGER,
  status                TEXT    NOT NULL,
  reason_codes_json     TEXT    NOT NULL,
  provenance_json       TEXT    NOT NULL,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  PRIMARY KEY (project_root, signal_key)
);

CREATE INDEX IF NOT EXISTS idx_pe_memory_project_updated
  ON prompt_enhancement_memory (project_root, updated_at);

CREATE INDEX IF NOT EXISTS idx_pe_memory_project_status_updated
  ON prompt_enhancement_memory (project_root, status, updated_at);

CREATE TABLE IF NOT EXISTS prompt_enhancement_source_use (
  source_use_id        TEXT    PRIMARY KEY,
  project_root         TEXT    NOT NULL,
  enhancement_id       TEXT    NOT NULL,
  body_id              TEXT    NOT NULL,
  body_revision        INTEGER NOT NULL,
  source_kind          TEXT    NOT NULL,
  source_id            TEXT    NOT NULL,
  section_ids_json     TEXT    NOT NULL,
  use_kind             TEXT    NOT NULL,
  memory_evidence      INTEGER NOT NULL DEFAULT 0,
  schema_version       INTEGER NOT NULL,
  reason_codes_json    TEXT    NOT NULL,
  created_at           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pe_source_use_project_body
  ON prompt_enhancement_source_use (project_root, body_id, body_revision);

CREATE INDEX IF NOT EXISTS idx_pe_source_use_project_source
  ON prompt_enhancement_source_use (project_root, source_kind, source_id);

CREATE INDEX IF NOT EXISTS idx_pe_source_use_project_created
  ON prompt_enhancement_source_use (project_root, created_at);

CREATE TABLE IF NOT EXISTS prompt_enhancement_generated_origin (
  generated_origin_id          TEXT    PRIMARY KEY,
  project_root                 TEXT    NOT NULL,
  enhancement_id               TEXT    NOT NULL,
  body_id                      TEXT    NOT NULL,
  body_revision                INTEGER NOT NULL,
  generated_origin_state       TEXT    NOT NULL,
  delivery_channel             TEXT    NOT NULL,
  prompt_submit_processing_policy TEXT NOT NULL,
  learning_eligible            INTEGER NOT NULL DEFAULT 0,
  learning_eligibility_json     TEXT    NOT NULL,
  source_use_ids_json          TEXT    NOT NULL,
  action_ids_json              TEXT    NOT NULL,
  fallback_state               TEXT    NOT NULL,
  privacy_storage_policy       TEXT    NOT NULL,
  schema_version               INTEGER NOT NULL,
  reason_codes_json            TEXT    NOT NULL,
  created_at                   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pe_generated_origin_project_body
  ON prompt_enhancement_generated_origin (project_root, body_id, body_revision);

CREATE INDEX IF NOT EXISTS idx_pe_generated_origin_project_created
  ON prompt_enhancement_generated_origin (project_root, created_at);

CREATE TABLE IF NOT EXISTS prompt_enhancement_feedback (
  feedback_event_id     TEXT    PRIMARY KEY,
  project_root          TEXT    NOT NULL,
  enhancement_id        TEXT    NOT NULL,
  body_id               TEXT    NOT NULL,
  body_revision         INTEGER NOT NULL,
  feedback_category     TEXT    NOT NULL,
  feedback_scope_key    TEXT    NOT NULL,
  learning_eligibility  TEXT    NOT NULL,
  safety_impact_state   TEXT    NOT NULL,
  raw_text_stored       INTEGER NOT NULL DEFAULT 0,
  memory_evidence       INTEGER NOT NULL DEFAULT 0,
  schema_version        INTEGER NOT NULL,
  reason_codes_json     TEXT    NOT NULL,
  created_at            INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pe_feedback_project_body
  ON prompt_enhancement_feedback (project_root, body_id, body_revision);

CREATE INDEX IF NOT EXISTS idx_pe_feedback_project_category
  ON prompt_enhancement_feedback (project_root, feedback_category, created_at);

CREATE INDEX IF NOT EXISTS idx_pe_feedback_project_scope
  ON prompt_enhancement_feedback (project_root, feedback_scope_key, created_at);

CREATE TABLE IF NOT EXISTS prompt_enhancement_status (
  project_root       TEXT    NOT NULL,
  status_key         TEXT    NOT NULL,
  status_value       TEXT    NOT NULL,
  schema_version     INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  PRIMARY KEY (project_root, status_key)
);

CREATE INDEX IF NOT EXISTS idx_pe_status_project_updated
  ON prompt_enhancement_status (project_root, updated_at);

-- Feature 1 (Context Engineering): Master Historical Map
CREATE TABLE IF NOT EXISTS context_memory (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_root    TEXT    NOT NULL,
  kind            TEXT    NOT NULL,
  key             TEXT    NOT NULL,
  content         TEXT    NOT NULL,
  verbatim        TEXT,
  identities_json TEXT,
  locked          INTEGER NOT NULL DEFAULT 0,
  confidence      REAL    NOT NULL DEFAULT 0.50,
  staleness       TEXT,
  superseded_by   INTEGER REFERENCES context_memory(id),
  active          INTEGER NOT NULL DEFAULT 1,
  evidence        TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  UNIQUE(project_root, kind, key)
);

CREATE INDEX IF NOT EXISTS idx_context_memory_project_active
  ON context_memory (project_root, active);

CREATE INDEX IF NOT EXISTS idx_context_memory_project_kind
  ON context_memory (project_root, kind);

-- Feature 1 (Context Engineering): Delivered Enhancement Payloads & Metrics
CREATE TABLE IF NOT EXISTS delivered_items (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  project_root           TEXT    NOT NULL,
  session_id             TEXT,
  raw_prompt             TEXT    NOT NULL,
  enhanced_prompt        TEXT    NOT NULL,
  is_enhanced            INTEGER NOT NULL,
  stage                  TEXT    NOT NULL,
  stage_confidence       REAL    NOT NULL,
  injected_context_tags  TEXT    NOT NULL,
  context_token_estimate INTEGER NOT NULL,
  processing_time_ms     INTEGER NOT NULL,
  created_at             INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_delivered_items_project_created
  ON delivered_items (project_root, created_at);
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

  // v0.1.1 — dev-environment probe
  addIfMissing('projects', 'env_facts',             'TEXT');
  addIfMissing('projects', 'env_facts_detected_at', 'INTEGER');
  // A3 step 7 (owner-approved adjustment): prompt-derived extracted params, CACHED. The extractor
  // is an LLM call, and PE runs on every prompt while the DS engine that used to own it ran
  // occasionally — so the value is mined over a window and stored, never mined per prompt.
  addIfMissing('projects', 'prompt_facts',             'TEXT');
  addIfMissing('projects', 'prompt_facts_detected_at', 'INTEGER');
  addIfMissing('projects', 'prompt_facts_at_count',    'INTEGER');
  addIfMissing('projects', 'env_trajectory',        'TEXT');

  // sub-11 prompt enhancement store contract
  addIfMissing('prompt_enhancement_source_use', 'section_ids_json', "TEXT NOT NULL DEFAULT '[]'");
  addIfMissing('prompt_enhancement_generated_origin', 'learning_eligibility_json', "TEXT NOT NULL DEFAULT '{}'");
  addIfMissing('prompt_enhancement_generated_origin', 'action_ids_json', "TEXT NOT NULL DEFAULT '[]'");
  addIfMissing('prompt_enhancement_generated_origin', 'fallback_state', "TEXT NOT NULL DEFAULT 'unknown_not_applicable'");
  addIfMissing('prompt_enhancement_generated_origin', 'privacy_storage_policy', "TEXT NOT NULL DEFAULT 'raw_text_excluded_by_default'");

  // sub-11 multi-prompt sequence payload. Column-additive so in-flight rows survive the
  // migration; `offer_disposition` back-fills to 'accepted' because a pre-migration row
  // exists at all, which means its sequence was sent.
  addIfMissing('pending_prompt_sequences', 'items_json',                   "TEXT NOT NULL DEFAULT '[]'");
  addIfMissing('pending_prompt_sequences', 'prompt_directives_json',       "TEXT NOT NULL DEFAULT '[]'");
  addIfMissing('pending_prompt_sequences', 'suggested_next_prompt_policy', "TEXT NOT NULL DEFAULT 'not_generated'");
  addIfMissing('pending_prompt_sequences', 'original_length',              'INTEGER NOT NULL DEFAULT 0');
  addIfMissing('pending_prompt_sequences', 'offer_disposition',            "TEXT NOT NULL DEFAULT 'accepted'");

  // sub-11 MPS continuation content foundation (2026-08-14). Nullable, default NULL — old rows
  // read back as null. Local store only; the stored original is the redacted length-preserving
  // copy, never raw, and neither field is ever emitted in telemetry.
  addIfMissing('pending_prompt_sequences', 'redacted_original_prompt_text', 'TEXT');
  addIfMissing('pending_prompt_sequences', 'handoff_kind',                  'TEXT');

  // sub-11 MPS content pipeline P1b-ii (2026-08-14). The UserPromptSubmit planner's full item
  // list, carried so the Stop-hook background wording batch can read it (the planner runs in a
  // different process than the popup+batch — owner decision B-i). Nullable, default NULL — old
  // rows and every non-sequence prepare read back as null. Items are OFFSETS/roles into the
  // original (no wording yet); local store only, never emitted in telemetry.
  addIfMissing('pending_prompt_enhancements', 'planner_items_json', 'TEXT');
  // The sequence's whole-prompt directive ranges (offsets into the original), carried beside the
  // item list so the Stop-hook batch can resolve them to text for items 2…N. Same nullable/local
  // treatment as planner_items_json — old rows and non-sequence prepares read back NULL.
  addIfMissing('pending_prompt_enhancements', 'planner_prompt_directives_json', 'TEXT');

  // Popup emphasis (2026-09-17). The phrases the submit popup renders in bold, carried on the pending
  // row so the Stop-hook popup draws the same emphasis the prepare decided — whether it renders in
  // process or in a spawned window. Nullable, default NULL: old rows and every prepare that produced
  // none read back as null, which is deliberately distinct from a computed-but-empty '[]'. Local store
  // only, never emitted in telemetry, and never read back into anything the agent receives.
  addIfMissing('pending_prompt_enhancements', 'emphasis_phrases_json', 'TEXT');
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

  // v0.1.1 — dev-environment probe
  addIfMissing('projects', 'env_facts',             'TEXT');
  addIfMissing('projects', 'env_facts_detected_at', 'INTEGER');
  // A3 step 7 (owner-approved adjustment): prompt-derived extracted params, CACHED. The extractor
  // is an LLM call, and PE runs on every prompt while the DS engine that used to own it ran
  // occasionally — so the value is mined over a window and stored, never mined per prompt.
  addIfMissing('projects', 'prompt_facts',             'TEXT');
  addIfMissing('projects', 'prompt_facts_detected_at', 'INTEGER');
  addIfMissing('projects', 'prompt_facts_at_count',    'INTEGER');
  addIfMissing('projects', 'env_trajectory',        'TEXT');

  // sub-11 prompt enhancement store contract
  addIfMissing('prompt_enhancement_source_use', 'section_ids_json', "TEXT NOT NULL DEFAULT '[]'");
  addIfMissing('prompt_enhancement_generated_origin', 'learning_eligibility_json', "TEXT NOT NULL DEFAULT '{}'");
  addIfMissing('prompt_enhancement_generated_origin', 'action_ids_json', "TEXT NOT NULL DEFAULT '[]'");
  addIfMissing('prompt_enhancement_generated_origin', 'fallback_state', "TEXT NOT NULL DEFAULT 'unknown_not_applicable'");
  addIfMissing('prompt_enhancement_generated_origin', 'privacy_storage_policy', "TEXT NOT NULL DEFAULT 'raw_text_excluded_by_default'");

  // sub-11 multi-prompt sequence payload. Column-additive so in-flight rows survive the
  // migration; `offer_disposition` back-fills to 'accepted' because a pre-migration row
  // exists at all, which means its sequence was sent.
  addIfMissing('pending_prompt_sequences', 'items_json',                   "TEXT NOT NULL DEFAULT '[]'");
  addIfMissing('pending_prompt_sequences', 'prompt_directives_json',       "TEXT NOT NULL DEFAULT '[]'");
  addIfMissing('pending_prompt_sequences', 'suggested_next_prompt_policy', "TEXT NOT NULL DEFAULT 'not_generated'");
  addIfMissing('pending_prompt_sequences', 'original_length',              'INTEGER NOT NULL DEFAULT 0');
  addIfMissing('pending_prompt_sequences', 'offer_disposition',            "TEXT NOT NULL DEFAULT 'accepted'");

  // sub-11 MPS continuation content foundation (2026-08-14). Nullable, default NULL — old rows
  // read back as null. Local store only; the stored original is the redacted length-preserving
  // copy, never raw, and neither field is ever emitted in telemetry.
  addIfMissing('pending_prompt_sequences', 'redacted_original_prompt_text', 'TEXT');
  addIfMissing('pending_prompt_sequences', 'handoff_kind',                  'TEXT');

  // sub-11 MPS content pipeline P1b-ii (2026-08-14). The UserPromptSubmit planner's full item
  // list, carried so the Stop-hook background wording batch can read it (the planner runs in a
  // different process than the popup+batch — owner decision B-i). Nullable, default NULL — old
  // rows and every non-sequence prepare read back as null. Items are OFFSETS/roles into the
  // original (no wording yet); local store only, never emitted in telemetry.
  addIfMissing('pending_prompt_enhancements', 'planner_items_json', 'TEXT');
  // The sequence's whole-prompt directive ranges (offsets into the original), carried beside the
  // item list so the Stop-hook batch can resolve them to text for items 2…N. Same nullable/local
  // treatment as planner_items_json — old rows and non-sequence prepares read back NULL.
  addIfMissing('pending_prompt_enhancements', 'planner_prompt_directives_json', 'TEXT');

  // Popup emphasis (2026-09-17). The phrases the submit popup renders in bold, carried on the pending
  // row so the Stop-hook popup draws the same emphasis the prepare decided — whether it renders in
  // process or in a spawned window. Nullable, default NULL: old rows and every prepare that produced
  // none read back as null, which is deliberately distinct from a computed-but-empty '[]'. Local store
  // only, never emitted in telemetry, and never read back into anything the agent receives.
  addIfMissing('pending_prompt_enhancements', 'emphasis_phrases_json', 'TEXT');
}
