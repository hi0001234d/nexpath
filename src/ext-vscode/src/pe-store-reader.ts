import { defaultStorePath, stagedGetRow } from './advisory-store-reader.js';

/**
 * Read-only reader for nexpath's Prompt Enhancement pending-row store (P3).
 *
 * The `auto` hook prepares a PE and parks it in the `pending_prompt_enhancements`
 * table (schema: `src/store/schema.ts`); the `stop` hook later reads it, shows
 * the PE popup, and injects the result. This module is the EXTENSION's own
 * read-only view of that same table — direct sibling of `advisory-store-reader.ts`,
 * reusing its `stagedGetRow` staging-copy + ABI-safe better-sqlite3 pattern so a
 * concurrent CLI write can never corrupt the read and the native module never
 * blocks extension activation.
 *
 * Deliberately does NOT import anything from `src/prompt-enhancement/**`,
 * `src/store/**`, or any other Layer C module — the architectural rule is that
 * the extension never imports Layer C directly (SQLite reads and CLI subprocess
 * IPC are the only accepted channels). `requestJson`/`resultJson` are therefore
 * exposed as opaque strings here, exactly as `advisory-store-reader.ts` exposes
 * `generated_l1/l2/l3` without importing the classifier's option types. Parsing
 * them into a typed payload is a later phase's job (P5's `pe-payload.ts`).
 *
 * Every failure path returns `null` rather than throwing — a read-only
 * fallback must never break the host. Queries `pending_prompt_enhancements` by
 * `project_root` only, per the phase spec; never reads `pending_advisories`.
 *
 * TRACEABILITY: PEH-5 (PE fallback is not the Decision-Session path). Verified
 * by `pe-traceability.test.ts`, which greps this file with comments STRIPPED —
 * a naive grep matches these very sentences and would pass while the code did
 * the opposite.
 */

/** A pending Prompt Enhancement row, normalised from `pending_prompt_enhancements`. */
export interface PendingPromptEnhancementRow {
  id:          number;
  projectRoot: string;
  sessionId:   string;
  promptCount: number;
  /** 'pending' | 'shown' — kept as a plain string; see AdvisoryStatus for the same defensive choice. */
  status:      string;
  /** unix ms — when `nexpath auto` prepared this PE. */
  createdAt:   number;
  /** Opaque JSON text of the typed prepare-request payload. Not parsed here. */
  requestJson: string;
  /** Opaque JSON text of the typed prepare-result payload. Not parsed here. */
  resultJson:  string;
}

/** Reads the latest raw `pending_prompt_enhancements` row for a project (injectable for tests). */
export type ReadPendingPromptEnhancementRowFn = (
  dbPath:      string,
  projectRoot: string,
) => Promise<Record<string, unknown> | null>;

/**
 * Default reader: newest **pending** `pending_prompt_enhancements` row for
 * `projectRoot` — mirrors the CLI's own `getPendingPromptEnhancement`'s
 * `status = 'pending'` filter, so a later phase deciding "is this Stop result
 * PE-origin" sees the same pending/shown semantics the CLI itself uses.
 * Queries `pending_prompt_enhancements` only; never touches `pending_advisories`.
 */
export const defaultReadPendingPromptEnhancementRow: ReadPendingPromptEnhancementRowFn = (
  dbPath,
  projectRoot,
) =>
  stagedGetRow(
    dbPath,
    `SELECT id, project_root, session_id, prompt_count, status, created_at, request_json, result_json
       FROM pending_prompt_enhancements
      WHERE project_root = ? AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1`,
    projectRoot,
  );

/**
 * Latest `pending_prompt_enhancements` row REGARDLESS of status.
 *
 * Why any-status when `defaultReadPendingPromptEnhancementRow` filters to
 * `'pending'`: this reader exists for the advisory-poller's SELECTION BRIDGE
 * (owner ruling 2026-08-11 — Windsurf must behave like the CLI, popup-first).
 * On a PE-only turn (no advisory row) the bridge needs "a PE event happened
 * this turn" as its freshness signal — and by the time the user picks "Use
 * enhanced" in the popup, `stop` has ALREADY marked the row `'shown'` (it does
 * so when the popup displays, before the user decides). A pending-only read
 * would go blind at exactly the moment the selection lands in
 * `session_states.lastInjectedPrompt`.
 */
export const defaultReadLatestPromptEnhancementMetaRow: ReadPendingPromptEnhancementRowFn = (
  dbPath,
  projectRoot,
) =>
  stagedGetRow(
    dbPath,
    `SELECT project_root, status, created_at
       FROM pending_prompt_enhancements
      WHERE project_root = ?
      ORDER BY created_at DESC
      LIMIT 1`,
    projectRoot,
  );

/**
 * Detection-only metadata of the newest PE row (any status). Structurally
 * identical to `advisory-store-reader.ts`'s `AdvisoryStatus` on purpose — the
 * advisory-poller consumes both shapes the same way.
 */
export interface PromptEnhancementMeta {
  projectRoot: string;
  /** unix ms — when `nexpath auto` prepared this PE. */
  createdAt: number;
  /** 'pending' | 'shown' — plain string, same defensive choice as the row reader. */
  status: string;
}

export interface PeStoreReaderDeps {
  /** Override the store path (defaults to `~/.nexpath/prompt-store.db`). */
  dbPath?:  string;
  /** Override the raw-row reader (tests). */
  readRow?: ReadPendingPromptEnhancementRowFn;
}

/**
 * Read the newest PE row's metadata (any status) for `projectRoot` — the
 * advisory-poller's PE-event freshness signal (see
 * `defaultReadLatestPromptEnhancementMetaRow` for why any-status). Returns
 * `null` when the store/row is absent or the row is unusable. Never throws.
 * Read-only staged copy; `pending_prompt_enhancements` only.
 */
export async function readLatestPromptEnhancementMeta(
  projectRoot: string,
  deps: PeStoreReaderDeps = {},
): Promise<PromptEnhancementMeta | null> {
  const dbPath  = deps.dbPath ?? defaultStorePath();
  const readRow = deps.readRow ?? defaultReadLatestPromptEnhancementMetaRow;

  let row: Record<string, unknown> | null;
  try {
    row = await readRow(dbPath, projectRoot);
  } catch {
    return null;
  }
  if (!row) return null;

  const createdAtRaw = row.created_at;
  const createdAt =
    typeof createdAtRaw === 'number'
      ? createdAtRaw
      : Number.isFinite(Number(createdAtRaw))
        ? Number(createdAtRaw)
        : 0;

  return {
    projectRoot: typeof row.project_root === 'string' ? row.project_root : projectRoot,
    createdAt,
    status: typeof row.status === 'string' ? row.status : '',
  };
}

/**
 * Read the latest pending Prompt Enhancement for `projectRoot`, normalised into
 * a {@link PendingPromptEnhancementRow}. Returns `null` when the store / row /
 * required fields are absent or malformed (nothing actionable to surface).
 * Never throws. No DB mutation — read-only staged copy throughout.
 */
export async function readPendingPromptEnhancement(
  projectRoot: string,
  deps: PeStoreReaderDeps = {},
): Promise<PendingPromptEnhancementRow | null> {
  const dbPath  = deps.dbPath ?? defaultStorePath();
  const readRow = deps.readRow ?? defaultReadPendingPromptEnhancementRow;

  let row: Record<string, unknown> | null;
  try {
    row = await readRow(dbPath, projectRoot);
  } catch {
    return null;
  }
  if (!row) return null;

  // Both JSON columns are NOT NULL in the schema; a row missing either as a
  // string is corrupt/drifted — treat it as absent rather than guess.
  if (typeof row.request_json !== 'string' || row.request_json.length === 0) return null;
  if (typeof row.result_json !== 'string' || row.result_json.length === 0) return null;

  const idRaw = row.id;
  const id = typeof idRaw === 'number' ? idRaw : Number.isFinite(Number(idRaw)) ? Number(idRaw) : 0;

  const promptCountRaw = row.prompt_count;
  const promptCount =
    typeof promptCountRaw === 'number'
      ? promptCountRaw
      : Number.isFinite(Number(promptCountRaw))
        ? Number(promptCountRaw)
        : 0;

  const createdAtRaw = row.created_at;
  const createdAt =
    typeof createdAtRaw === 'number'
      ? createdAtRaw
      : Number.isFinite(Number(createdAtRaw))
        ? Number(createdAtRaw)
        : 0;

  return {
    id,
    projectRoot: typeof row.project_root === 'string' ? row.project_root : projectRoot,
    sessionId:   typeof row.session_id === 'string' ? row.session_id : '',
    promptCount,
    status:      typeof row.status === 'string' ? row.status : '',
    createdAt,
    requestJson: row.request_json,
    resultJson:  row.result_json,
  };
}
