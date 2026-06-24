/**
 * Append-only param-detection event log (sibling to recent-prompts.ts).
 *
 * Records WHICH workflow-discipline signals were detected per prompt — the
 * signal key + the detection channel + the session stage — so longitudinal
 * detectors can measure behaviour across the user's full prompt history even
 * after the 500-prompt FIFO evicts the prompt TEXT. It stores **no prompt text**
 * (PII-safe by construction) and is **local-only — never synced server-side**
 * (distinct lifecycle from telemetry.jsonl).
 *
 * The log file lives next to the prompt-store DB (`<db-dir>/param-events.jsonl`),
 * so it follows a custom `--db` path and is naturally skipped for in-memory
 * stores (tests) — no write touches real disk there. Writes are fail-open and
 * never crash the hook, mirroring TelemetryWriter; the file rotates at ~5 MB.
 *
 * Every row carries `schemaVersion` (see SCHEMA_VERSION). The reader accepts any
 * row whose version is <= current and ignores newer / corrupt rows
 * (forward-compatible, additive-only — old rows are never rewritten).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Store } from '../store/db.js';
import { SCHEMA_VERSION } from '../store/schema.js';
import { PARAM_EVENTS_FILENAME } from './paths.js';
import type { Stage } from '../classifier/types.js';

const MAX_BYTES = 5 * 1024 * 1024;

/** Where a detected signal came from. Extensible (additive): `'transcript'` and `'probe'` land with their readers. */
export type ParamEventChannel = 'keyword' | 'vibe' | 'stream_b' | 'stage2' | 'transcript' | 'probe';

export type ParamEventSource = 'live' | 'historical_import';

export type ParamEvent = {
  schemaVersion: number;
  ts: number;
  projectRoot: string;
  sessionId: string;
  promptIndex: number;
  signalKey: string;
  channel: ParamEventChannel;
  /** Session stage at detection time; `null` for historical-import rows (stage-agnostic). */
  stage: Stage | null;
  stageConfidence: number | null;
  source: ParamEventSource;
};

/** Caller-supplied fields; `schemaVersion`/`ts` are stamped by the writer. */
export type ParamEventInput = Omit<ParamEvent, 'schemaVersion' | 'ts'> & { ts?: number };

/**
 * The log path for a store, or `null` for an in-memory store (no disk → skip).
 * Colocated with the DB so it honours a custom `--db` path.
 */
export function paramEventsPathFor(store: Store): string | null {
  if (store.dbPath === ':memory:') return null;
  return join(dirname(store.dbPath), PARAM_EVENTS_FILENAME);
}

function rotate(path: string): void {
  try {
    if (!existsSync(path)) {
      mkdirSync(dirname(path), { recursive: true });
      return;
    }
    if (statSync(path).size > MAX_BYTES) {
      renameSync(path, `${path}.1`);
    }
  } catch {
    // rotation failure is non-fatal
  }
}

function stamp(input: ParamEventInput): ParamEvent {
  return {
    schemaVersion: SCHEMA_VERSION,
    ts: input.ts ?? Date.now(),
    projectRoot: input.projectRoot,
    sessionId: input.sessionId,
    promptIndex: input.promptIndex,
    signalKey: input.signalKey,
    channel: input.channel,
    stage: input.stage,
    stageConfidence: input.stageConfidence,
    source: input.source,
  };
}

/** Append param-detection events (one rotate + write pass). Fail-open; no-op for in-memory stores. */
export function appendParamEvents(store: Store, inputs: ParamEventInput[]): void {
  const path = paramEventsPathFor(store);
  if (!path || inputs.length === 0) return;
  const lines = inputs.map((i) => JSON.stringify(stamp(i))).join('\n') + '\n';
  try {
    rotate(path);
    appendFileSync(path, lines, 'utf8');
  } catch {
    // write failure must never crash the hook
  }
}

/** Append a single param-detection event. */
export function appendParamEvent(store: Store, input: ParamEventInput): void {
  appendParamEvents(store, [input]);
}

/**
 * Read param-detection events (optionally filtered to one project). Returns []
 * for an in-memory store or a missing file. Accepts rows with
 * `schemaVersion <= SCHEMA_VERSION`; silently skips newer or corrupt rows.
 */
export function readParamEvents(store: Store, projectRoot?: string): ParamEvent[] {
  const path = paramEventsPathFor(store);
  if (!path) return [];
  let raw: string;
  try {
    if (!existsSync(path)) return [];
    raw = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const out: ParamEvent[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row: ParamEvent;
    try {
      row = JSON.parse(trimmed) as ParamEvent;
    } catch {
      continue; // corrupt line → skip
    }
    if (typeof row.schemaVersion !== 'number' || row.schemaVersion > SCHEMA_VERSION) continue;
    if (projectRoot !== undefined && row.projectRoot !== projectRoot) continue;
    out.push(row);
  }
  return out;
}
