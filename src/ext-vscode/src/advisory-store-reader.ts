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
 * Default reader: stage-copy the DB, open it read-only with better-sqlite3, and
 * pull the newest advisory row for `projectRoot`. Mirrors the watcher's
 * `defaultReadItemTable` so the native module stays out of the eager require
 * graph and a concurrent CLI write can never corrupt the read.
 */
export const defaultReadAdvisoryRow: ReadAdvisoryRowFn = async (dbPath, projectRoot) => {
  const { copyFile, mkdir, rm } = await import('node:fs/promises');
  const { existsSync }          = await import('node:fs');
  const { tmpdir }              = await import('node:os');
  const { basename, join: pjoin } = await import('node:path');

  if (!existsSync(dbPath)) return null;

  const stagingDir = pjoin(
    tmpdir(),
    `nexpath-advisory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
    const row = db
      .prepare(
        `SELECT project_root, stage, flag_type, pinch_label,
                generated_l1, generated_l2, generated_l3, created_at, status
           FROM pending_advisories
          WHERE project_root = ?
          ORDER BY created_at DESC
          LIMIT 1`,
      )
      .get(projectRoot);
    return row ?? null;
  } catch {
    // Table absent on a fresh store, or schema drift — treat as no advisory.
    return null;
  } finally {
    db.close();
    void rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  }
};

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
