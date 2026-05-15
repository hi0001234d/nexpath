import { watch, type FSWatcher, type WatchListener } from 'node:fs';
import { readFile } from 'node:fs/promises';
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
 * can run without sql.js. In production a sql.js-backed reader is used
 * (loaded lazily so the wasm boot cost only hits on first read).
 */

/** Pure function that turns a state.vscdb byte buffer into ItemTable rows. */
export type ReadItemTableFn = (dbBytes: Buffer) => Promise<ItemTableRow[]>;

/**
 * Default sql.js-backed reader. Dynamic import keeps wasm out of the eager
 * require graph; only loaded on first read.
 */
const defaultReadItemTable: ReadItemTableFn = async (dbBytes) => {
  const mod = (await import('sql.js')) as unknown as {
    default: (config?: { locateFile?: (f: string) => string }) => Promise<{
      Database: new (data: Uint8Array) => {
        exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
        close(): void;
      };
    }>;
  };
  const SQL = await mod.default();
  const db = new SQL.Database(new Uint8Array(dbBytes));
  try {
    const result = db.exec('SELECT key, value FROM ItemTable');
    const rows: ItemTableRow[] = [];
    for (const r of result) {
      for (const v of r.values) {
        rows.push({ key: String(v[0]), value: String(v[1]) });
      }
    }
    return rows;
  } finally {
    db.close();
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
  /** Inject the file reader (defaults to node:fs/promises `readFile`). */
  readFileFn?: (path: string) => Promise<Buffer>;
  /** Inject the ItemTable reader (defaults to sql.js-backed reader). */
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
  const readFileFn = opts.readFileFn ?? readFile;
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
      const buf = await readFileFn(target.path);
      const rows = await readItemTableFn(buf);

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
