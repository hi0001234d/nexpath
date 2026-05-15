import { watch, type FSWatcher, type WatchListener } from 'node:fs';
import type {
  ChatHistoryEvent,
  ChatHistoryExtractor,
  ItemTableRow,
  WatchTarget,
} from './chat-history-types.js';
import { pickExtractor } from './extractors/index.js';

/**
 * Chat-history watcher (M2 Branch 2).
 *
 * Watches the agent's persisted chat-history storage and emits a
 * `ChatHistoryEvent` for every NEW user prompt that appears.
 *
 * Per-agent storage model:
 *   - Cursor: a single SQLite file (`state.vscdb`) under
 *     `User/globalStorage/`. Treated as kind `cursor-sqlite`.
 *   - Windsurf: a directory under `~/.codeium/windsurf/` containing JSON
 *     conversation files. Treated as kind `windsurf-dir`. Decoding lands
 *     in Branch 4; here the watcher only fires the file events and
 *     forwards them to a no-op extractor.
 *
 * Pipeline (Cursor / sqlite):
 *   fs.watch fires -> debounce (default 250 ms) -> read file bytes
 *   -> parse ItemTable -> pickExtractor(observed keys) -> for each row
 *   the extractor owns, decode -> dedupe new events by signature ->
 *   emit via `onEvent`.
 *
 * The actual SQLite parsing is injected via `readItemTableFn` so tests
 * can run without better-sqlite3. In production a better-sqlite3-backed
 * reader is used — chosen over sql.js because the live Cursor `.vscdb`
 * file is in **WAL mode** (the main file is ~4 KB; all writes go to the
 * sibling `.vscdb-wal`). sql.js operates on a buffer and cannot read the
 * WAL siblings, so it never sees the live data (dev plan §2.5). The
 * better-sqlite3 reader copies main + wal + shm to a tmp staging dir,
 * checkpoints the WAL into the staged main file, then reads — never
 * touching the live file Cursor is actively writing to.
 */

/** Pure function that turns a state.vscdb FILE PATH into ItemTable rows. */
export type ReadItemTableFn = (dbPath: string) => Promise<ItemTableRow[]>;

/**
 * Default WAL-aware reader using better-sqlite3.
 *
 * Strategy:
 *   1. Stage: copy main + .vscdb-wal + .vscdb-shm to a tmp dir.
 *   2. Open the staged copy read-only with better-sqlite3 (native module —
 *      handles WAL transparently because the staged copy retains the WAL
 *      file alongside).
 *   3. Run `PRAGMA wal_checkpoint(TRUNCATE)` on the staged copy to fold
 *      the WAL pages into the main file (belt-and-braces; better-sqlite3
 *      reads them either way).
 *   4. Query `ItemTable`.
 *   5. Close + clean up the staging dir.
 *
 * Dynamic import keeps the native module out of the eager require graph
 * (cheaper extension startup; only loaded on first chat-history read).
 */
export const defaultReadItemTable: ReadItemTableFn = async (dbPath) => {
  const { copyFile, mkdir, rm } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { basename, join } = await import('node:path');

  const stagingDir = join(
    tmpdir(),
    `nexpath-watcher-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await mkdir(stagingDir, { recursive: true });
  const stagedMain = join(stagingDir, basename(dbPath));
  await copyFile(dbPath, stagedMain);
  for (const suffix of ['-wal', '-shm'] as const) {
    const sibling = dbPath + suffix;
    if (existsSync(sibling)) await copyFile(sibling, stagedMain + suffix);
  }

  const mod = (await import('better-sqlite3')) as unknown as {
    default: new (path: string, options?: { readonly?: boolean }) => {
      prepare(sql: string): {
        all(...params: unknown[]): Array<Record<string, unknown>>;
      };
      pragma(pragma: string): unknown;
      close(): void;
    };
  };
  const Database = mod.default;
  const db = new Database(stagedMain, { readonly: true });
  try {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      // Not in WAL mode — fine, continue.
    }
    // Defensive: ItemTable may not exist on freshly-created VS Code
    // state.vscdb files; treat as empty rather than throwing.
    const tables = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='ItemTable'",
        )
        .all() as Array<{ name: string }>
    ).length;
    if (tables === 0) return [];
    const rows = db
      .prepare('SELECT key, value FROM ItemTable')
      .all() as Array<{ key: string; value: string }>;
    return rows.map((r) => ({ key: String(r.key), value: String(r.value) }));
  } finally {
    db.close();
    // Best-effort cleanup — staging dir is in /tmp, OS will clean up eventually.
    void rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  }
};

export interface ChatHistoryWatcherOptions {
  /** Paths the watcher should monitor. */
  targets: WatchTarget[];
  /** Emitted for every NEW user prompt detected. */
  onEvent: (e: ChatHistoryEvent) => void;
  /** Emitted on any non-fatal error (read failure, watch error, etc.). */
  onError?: (err: Error) => void;
  /**
   * Emitted when a Cursor target's ItemTable doesn't fingerprint to any
   * known extractor — extension layer surfaces this as a "schema unknown,
   * please update nexpath extension" toast.
   */
  onSchemaUnknown?: (info: {
    path: string;
    observedSampleKeys: readonly string[];
  }) => void;

  // ── Dependency injection (tests substitute these) ─────────────────────────
  /** Debounce window for coalescing fs.watch events. Default 250 ms. */
  debounceMs?: number;
  /** Inject `fs.watch` (defaults to node:fs `watch`). */
  watchFn?: typeof watch;
  /** Inject the ItemTable reader (defaults to better-sqlite3 WAL-aware reader). */
  readItemTableFn?: ReadItemTableFn;
  /** Inject the clock (defaults to `() => new Date()`). */
  nowFn?: () => Date;
}

export interface ChatHistoryWatcher {
  /** Start fs watchers + fire an initial read so existing rows are diffed. */
  start(): void;
  /** Stop all watchers + cancel pending debouncers. */
  stop(): void;
}

export function createChatHistoryWatcher(
  opts: ChatHistoryWatcherOptions,
): ChatHistoryWatcher {
  const debounceMs = opts.debounceMs ?? 250;
  const watchFn = opts.watchFn ?? watch;
  const readItemTableFn = opts.readItemTableFn ?? defaultReadItemTable;
  const nowFn = opts.nowFn ?? (() => new Date());

  const fsWatchers: FSWatcher[] = [];
  const debouncers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Deduplication key per emitted event so we never emit the same prompt twice. */
  const seenSignatures = new Set<string>();
  /** Per-target extractor cache — first read decides; subsequent reads reuse. */
  const extractorCache = new Map<string, ChatHistoryExtractor>();

  function signatureOf(e: ChatHistoryEvent): string {
    return `${e.sourcePath}|${e.rawSessionId}|${e.prompt}`;
  }

  function reportError(err: unknown, path: string): void {
    const e = err instanceof Error ? err : new Error(String(err));
    opts.onError?.(new Error(`[chat-history-watcher] ${path}: ${e.message}`));
  }

  async function processSqliteTarget(target: WatchTarget): Promise<void> {
    try {
      const rows = await readItemTableFn(target.path);

      let extractor: ChatHistoryExtractor | undefined =
        target.extractor ?? extractorCache.get(target.path);

      if (!extractor) {
        const fp = pickExtractor(rows.map((r) => r.key));
        if (fp.kind === 'known') {
          extractor = fp.extractor;
          extractorCache.set(target.path, extractor);
        } else {
          opts.onSchemaUnknown?.({
            path: target.path,
            observedSampleKeys: fp.observedSampleKeys,
          });
          return;
        }
      }

      for (const row of rows) {
        if (!extractor.ownsKey(row.key)) continue;
        const decoded = extractor.decodeRow(row, target.path);
        for (const ev of decoded) {
          const sig = signatureOf(ev);
          if (seenSignatures.has(sig)) continue;
          seenSignatures.add(sig);
          opts.onEvent({ ...ev, capturedAt: nowFn() });
        }
      }
    } catch (err) {
      reportError(err, target.path);
    }
  }

  function processWindsurfTarget(_target: WatchTarget): void {
    // Branch 4 wires Windsurf JSON-file decoding alongside the
    // windsurfAdapter.chatHistoryPaths implementation. For Branch 2
    // we only ensure the watcher itself doesn't crash on Windsurf targets.
  }

  function schedule(target: WatchTarget): void {
    const existing = debouncers.get(target.path);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      debouncers.delete(target.path);
      if (target.kind === 'cursor-sqlite') {
        void processSqliteTarget(target);
      } else {
        processWindsurfTarget(target);
      }
    }, debounceMs);
    debouncers.set(target.path, t);
  }

  return {
    start(): void {
      for (const target of opts.targets) {
        try {
          const listener: WatchListener<string> = () => schedule(target);
          const w = watchFn(target.path, listener);
          w.on('error', (err: Error) => reportError(err, target.path));
          fsWatchers.push(w);
          // Initial pass so any existing rows are diffed immediately
          schedule(target);
        } catch (err) {
          reportError(err, target.path);
        }
      }
    },
    stop(): void {
      for (const t of debouncers.values()) clearTimeout(t);
      debouncers.clear();
      for (const w of fsWatchers) {
        try {
          w.close();
        } catch {
          // ignore
        }
      }
      fsWatchers.length = 0;
    },
  };
}
