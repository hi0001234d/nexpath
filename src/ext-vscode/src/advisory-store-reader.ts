import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Read-only reader for the advisory nexpath's pipeline parks in its store.
 *
 * Layer C's `nexpath auto` writes the generated decision-session content to the
 * `pending_advisories` table in `~/.nexpath/prompt-store.db` BEFORE `nexpath
 * stop` renders it in the terminal popup. When that popup can't open (headless
 * Linux, no terminal emulator, Wayland without an X11 foreground tool, a missing
 * session bus, …) the advisory is generated but never shown. This module lets
 * the extension surface it in-editor as a fallback — reading the SAME row Layer
 * C wrote, with NO write access and NO Layer C code change.
 *
 * The store is owned exclusively by the CLI (sql.js); we only read it. Reads use
 * the same staging-copy + dynamic-import-better-sqlite3 pattern the chat-history
 * watcher uses (ABI-safe, never blocks a concurrent CLI write). Every failure
 * path returns `null` rather than throwing — a fallback must never break the host.
 */

/** A pending advisory row from nexpath's `pending_advisories` table. */
export interface StoredAdvisory {
  projectRoot: string;
  stage:       string;
  flagType:    string;
  pinchLabel:  string;
  /** unix ms — when `nexpath auto` parked this advisory. */
  createdAt:   number;
  /** 'pending' | 'shown'. */
  status:      string;
  /** Generated option text per cascade level (full → simpler → minimal viable). */
  l1: string[];
  l2: string[];
  l3: string[];
}

/**
 * Default store path — mirrors Layer C's `DEFAULT_DB_PATH`
 * (`~/.nexpath/prompt-store.db`). The extension never passes `--db` to the CLI,
 * so the CLI uses this same default; reading it here keeps the two in lockstep.
 */
export function defaultStorePath(home: string = homedir()): string {
  return join(home, '.nexpath', 'prompt-store.db');
}

/** Reads the latest raw `pending_advisories` row for a project (injectable for tests). */
export type ReadAdvisoryRowFn = (
  dbPath:      string,
  projectRoot: string,
) => Promise<Record<string, unknown> | null>;

/**
 * Stage-copy the store and run a single-row read-only query. Mirrors the
 * watcher's `defaultReadItemTable` so the native module stays out of the eager
 * require graph and a concurrent CLI write can never corrupt the read. Returns
 * the first row, or null on any failure (missing file / missing table / drift).
 */
async function stagedGetRow(
  dbPath: string,
  sql:    string,
  param:  string,
): Promise<Record<string, unknown> | null> {
  const { copyFile, mkdir, rm } = await import('node:fs/promises');
  const { existsSync }          = await import('node:fs');
  const { tmpdir }              = await import('node:os');
  const { basename, join: pjoin } = await import('node:path');

  if (!existsSync(dbPath)) return null;

  const stagingDir = pjoin(
    tmpdir(),
    `nexpath-store-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await mkdir(stagingDir, { recursive: true });
  const staged = pjoin(stagingDir, basename(dbPath));
  try {
    await copyFile(dbPath, staged);
  } catch (err) {
    void rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  // sql.js rewrites the whole file (no WAL), but copy any siblings defensively.
  for (const suffix of ['-wal', '-shm'] as const) {
    const sib = dbPath + suffix;
    if (existsSync(sib)) {
      try { await copyFile(sib, staged + suffix); } catch { /* best-effort */ }
    }
  }

  const mod = (await import('better-sqlite3')) as unknown as {
    default: new (path: string, options?: { readonly?: boolean }) => {
      prepare(sql: string): { get(...params: unknown[]): Record<string, unknown> | undefined };
      close(): void;
    };
  };
  const Database = mod.default;
  const db = new Database(staged, { readonly: true });
  try {
    return db.prepare(sql).get(param) ?? null;
  } catch {
    return null;
  } finally {
    db.close();
    void rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Default reader: newest `pending_advisories` row for `projectRoot`. */
export const defaultReadAdvisoryRow: ReadAdvisoryRowFn = (dbPath, projectRoot) =>
  stagedGetRow(
    dbPath,
    `SELECT project_root, stage, flag_type, pinch_label,
            generated_l1, generated_l2, generated_l3, created_at, status
       FROM pending_advisories
      WHERE project_root = ?
      ORDER BY created_at DESC
      LIMIT 1`,
    projectRoot,
  );

/** Parse a JSON string-array column (Layer C stores generated_l1/l2/l3 as JSON). */
export function parseJsonStringArray(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export interface AdvisoryStoreReaderDeps {
  /** Override the store path (defaults to `~/.nexpath/prompt-store.db`). */
  dbPath?:  string;
  /** Override the raw-row reader (tests). */
  readRow?: ReadAdvisoryRowFn;
}

/**
 * Read the latest advisory nexpath generated for `projectRoot`, normalised into
 * a {@link StoredAdvisory}. Returns `null` when the store / row / generated
 * options are absent or malformed (nothing actionable to surface). Never throws.
 */
export async function readLatestAdvisory(
  projectRoot: string,
  deps: AdvisoryStoreReaderDeps = {},
): Promise<StoredAdvisory | null> {
  const dbPath  = deps.dbPath ?? defaultStorePath();
  const readRow = deps.readRow ?? defaultReadAdvisoryRow;

  let row: Record<string, unknown> | null;
  try {
    row = await readRow(dbPath, projectRoot);
  } catch {
    return null;
  }
  if (!row) return null;

  const l1 = parseJsonStringArray(row.generated_l1);
  const l2 = parseJsonStringArray(row.generated_l2);
  const l3 = parseJsonStringArray(row.generated_l3);
  // No generated options ⇒ nothing to show the user; skip.
  if (l1.length === 0 && l2.length === 0 && l3.length === 0) return null;

  const createdAtRaw = row.created_at;
  const createdAt =
    typeof createdAtRaw === 'number'
      ? createdAtRaw
      : Number.isFinite(Number(createdAtRaw))
        ? Number(createdAtRaw)
        : 0;

  return {
    projectRoot: typeof row.project_root === 'string' ? row.project_root : projectRoot,
    stage:       typeof row.stage === 'string' ? row.stage : '',
    flagType:    typeof row.flag_type === 'string' ? row.flag_type : '',
    pinchLabel:  typeof row.pinch_label === 'string' ? row.pinch_label : '',
    createdAt,
    status:      typeof row.status === 'string' ? row.status : '',
    l1, l2, l3,
  };
}

// ── Advisory metadata (option-independent) — for the Windsurf popup bridge ───

/**
 * Minimal advisory shape the Windsurf poller needs to DETECT + time an advisory:
 * just whether one exists, when it was parked, and its status. Deliberately does
 * NOT carry the generated options.
 */
export interface AdvisoryStatus {
  projectRoot: string;
  /** unix ms — when `nexpath auto` parked this advisory. */
  createdAt: number;
  /** 'pending' | 'shown'. */
  status: string;
}

/**
 * Read the latest advisory's metadata (created_at + status) for a project,
 * WITHOUT requiring `generated_l1/l2/l3` to be present.
 *
 * Why this exists: since the option generation `auto`→`stop` move (commit
 * 05ea1ca), options are produced at popup-render time and are NEVER parked in
 * the `pending_advisories` row. {@link readLatestAdvisory} discards a row with no
 * options (correct for the in-editor *display* fallback, which needs them), but
 * that also blinded the Windsurf popup→Cascade *bridge*, which only needs to know
 * an advisory exists so it can read the persisted selection
 * (`lastInjectedPrompt`). This reader restores that detection without reverting
 * the Layer-C move. Read-only; never throws.
 */
export async function readLatestAdvisoryMeta(
  projectRoot: string,
  deps: AdvisoryStoreReaderDeps = {},
): Promise<AdvisoryStatus | null> {
  const dbPath  = deps.dbPath ?? defaultStorePath();
  const readRow = deps.readRow ?? defaultReadAdvisoryRow;

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

// ── Selected-prompt recovery (Windows crash-on-exit safety net) ──────────────

/** Reads the `session_states.state_json` blob for a project (injectable for tests). */
export type ReadSessionStateFn = (
  dbPath:      string,
  projectRoot: string,
) => Promise<Record<string, unknown> | null>;

/** Default: read the project's session_states row, staged + read-only. */
export const defaultReadSessionState: ReadSessionStateFn = (dbPath, projectRoot) =>
  stagedGetRow(
    dbPath,
    'SELECT state_json FROM session_states WHERE project_root = ?',
    projectRoot,
  );

export interface InjectedPromptReaderDeps {
  dbPath?:    string;
  readState?: ReadSessionStateFn;
}

/**
 * Recover the prompt the user just selected in the terminal popup.
 *
 * Layer C's `nexpath stop` persists the chosen option to
 * `session_states.lastInjectedPrompt` BEFORE it writes stdout and force-exits.
 * On Windows that force-exit trips a libuv assertion (the process dies with a
 * non-zero code and stdout can be lost), so the extension can't rely on stdout
 * to learn the selection. Reading this persisted value recovers it so the
 * injection still happens. Read-only; returns null when absent/malformed.
 */
export async function readInjectedPrompt(
  projectRoot: string,
  deps: InjectedPromptReaderDeps = {},
): Promise<string | null> {
  const dbPath    = deps.dbPath ?? defaultStorePath();
  const readState = deps.readState ?? defaultReadSessionState;

  let row: Record<string, unknown> | null;
  try {
    row = await readState(dbPath, projectRoot);
  } catch {
    return null;
  }
  if (!row || typeof row.state_json !== 'string') return null;
  try {
    const state = JSON.parse(row.state_json) as { lastInjectedPrompt?: unknown };
    const v = state?.lastInjectedPrompt;
    return typeof v === 'string' && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}
