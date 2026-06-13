import { watch, type FSWatcher, type WatchListener } from 'node:fs';
import type {
  ChatHistoryEvent,
  ChatHistoryExtractor,
  ItemTableRow,
  WatchTarget,
} from './chat-history-types.js';
import { ALL_EXTRACTORS, pickExtractor } from './extractors/index.js';
import { decodeWindsurfJsonFile } from './extractors/windsurf.js';

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
 *     conversation files. Treated as kind `windsurf-dir`. Each fs.watch
 *     fire rescans the directory, parses every .json file, and passes the
 *     parsed value to `decodeWindsurfJsonFile` (in `extractors/windsurf.ts`).
 *     The decoder is currently a no-op pending live-install schema
 *     inspection (see its TODO); the FS plumbing is in place so the only
 *     missing piece is the field extraction.
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
 * Pure function that scans a Windsurf chat-data directory and returns its
 * `.json` files as `{path, parsed}` pairs. Malformed or unreadable files
 * are skipped silently (drop one bad file, don't blow up the whole scan);
 * a missing directory returns `[]` so activate-time enumeration doesn't
 * have to pre-check existence.
 */
export type ReadWindsurfJsonFilesFn = (
  dirPath: string,
) => Promise<Array<{ path: string; parsed: unknown }>>;

/**
 * Default Windsurf JSON reader: lists `<dir>/*.json`, reads each file,
 * `JSON.parse`s the contents, skips files that fail either step. Used by
 * the watcher when the host is Windsurf and a codeium cascade target was
 * enumerated at activate time.
 */
export const defaultReadWindsurfJsonFiles: ReadWindsurfJsonFilesFn = async (
  dirPath,
) => {
  const { readdir, readFile } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');

  if (!existsSync(dirPath)) return [];
  let entries: string[];
  try {
    entries = await readdir(dirPath);
  } catch {
    return [];
  }

  const out: Array<{ path: string; parsed: unknown }> = [];
  for (const name of entries) {
    if (!name.toLowerCase().endsWith('.json')) continue;
    const fullPath = join(dirPath, name);
    let content: string;
    try {
      content = await readFile(fullPath, 'utf8');
    } catch {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      continue;
    }
    out.push({ path: fullPath, parsed });
  }
  return out;
};

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

  // Race-safe read: a workspace storage dir enumerated at activate-time can
  // be deleted by the host (e.g. Cursor cleaning up stale workspaces) before
  // the first debounced read fires. Treat a missing main file as "no rows"
  // rather than throwing a noisy ENOENT through onError. fs.watch on the
  // missing path will continue to fire harmlessly if the file ever returns.
  if (!existsSync(dbPath)) return [];

  const stagingDir = join(
    tmpdir(),
    `nexpath-watcher-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await mkdir(stagingDir, { recursive: true });
  const stagedMain = join(stagingDir, basename(dbPath));
  try {
    await copyFile(dbPath, stagedMain);
  } catch (err) {
    // Lost the race between the existsSync above and the copyFile here, or
    // the file became unreadable for another reason. Clean up the (empty)
    // staging dir and treat as no rows.
    void rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  for (const suffix of ['-wal', '-shm'] as const) {
    const sibling = dbPath + suffix;
    if (existsSync(sibling)) {
      try {
        await copyFile(sibling, stagedMain + suffix);
      } catch {
        // WAL/SHM races are common; better-sqlite3 reads main regardless.
      }
    }
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
    // Discover which of the known chat-data tables exist in this DB.
    // - `ItemTable` is the standard VS Code state table — holds Ask-mode
    //   `aiService.prompts` (cursor-v2024-q4) and the Composer-metadata
    //   `composer.composerData` row (cursor-v2025-q1).
    // - `cursorDiskKV` is Cursor's modern Composer / Agent chat storage —
    //   `composerData:<uuid>` (metadata) + `bubbleId:<composerId>:<bubbleId>`
    //   (individual user / assistant messages). Lives in `globalStorage/
    //   state.vscdb` and is the default storage location for Cursor's
    //   Agent mode (the right-side chat panel in 3.4.20+).
    // Either table may be absent on freshly-created state.vscdb files;
    // treat as empty rather than throwing.
    const tableNames = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ItemTable','cursorDiskKV')",
        )
        .all() as Array<{ name: string }>
    ).map((r) => r.name);
    const out: Array<{ key: string; value: string }> = [];
    if (tableNames.includes('ItemTable')) {
      const rows = db
        .prepare('SELECT key, value FROM ItemTable')
        .all() as Array<{ key: string; value: string }>;
      for (const r of rows) {
        out.push({ key: String(r.key), value: String(r.value) });
      }
    }
    if (tableNames.includes('cursorDiskKV')) {
      // cursorDiskKV keys are prefixed with `cursorDiskKV/` in the row
      // stream so existing ItemTable extractors (which match keys like
      // `aiService.prompts` exactly) can NEVER accidentally consume them,
      // and the new composer-bubble extractor uses the prefix as a
      // load-bearing fingerprint signal. The extractor strips the prefix
      // before parsing the row's value.
      const rows = db
        .prepare('SELECT key, value FROM cursorDiskKV')
        .all() as Array<{ key: string; value: string }>;
      for (const r of rows) {
        out.push({
          key: `cursorDiskKV/${String(r.key)}`,
          value: String(r.value),
        });
      }
    }
    return out;
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
  /**
   * Polling backstop interval (ms). When > 0, every target is re-read on this
   * interval IN ADDITION to fs.watch. Default 0 (off — preserves test behaviour;
   * production wiring sets it). This exists because `fs.watch` is unreliable on
   * Windows for SQLite files written by another process: WAL checkpoints
   * delete+recreate the `-wal`/`-shm` siblings, which orphans the Windows watch
   * handle so it fires once (or not at all) and then goes silent — observed as
   * "only the first 1–2 prompts captured, then nothing". Polling re-reads
   * regardless; the dedup set means already-seen prompts are never re-emitted,
   * so a poll only surfaces genuinely new prompts.
   */
  pollMs?: number;
  /** Inject `fs.watch` (defaults to node:fs `watch`). */
  watchFn?: typeof watch;
  /** Inject the ItemTable reader (defaults to better-sqlite3 WAL-aware reader). */
  readItemTableFn?: ReadItemTableFn;
  /** Inject the Windsurf JSON-dir reader (defaults to fs/promises-backed scan). */
  readWindsurfJsonFilesFn?: ReadWindsurfJsonFilesFn;
  /**
   * Inject the Windsurf JSON-file decoder. Defaults to
   * `decodeWindsurfJsonFile` from `./extractors/windsurf.js`. Exposed for
   * tests; once a real decoder is filled in upstream, production callers
   * normally leave this unset and pick up the new behaviour automatically.
   */
  decodeWindsurfFn?: (parsed: unknown, sourcePath: string) => ChatHistoryEvent[];
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
  const pollMs = opts.pollMs ?? 0;
  const watchFn = opts.watchFn ?? watch;
  const readItemTableFn = opts.readItemTableFn ?? defaultReadItemTable;
  const readWindsurfJsonFilesFn =
    opts.readWindsurfJsonFilesFn ?? defaultReadWindsurfJsonFiles;
  const decodeWindsurfFn = opts.decodeWindsurfFn ?? decodeWindsurfJsonFile;
  const nowFn = opts.nowFn ?? (() => new Date());

  const fsWatchers: FSWatcher[] = [];
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  const debouncers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Deduplication key per emitted event so we never emit the same prompt twice. */
  const seenSignatures = new Set<string>();
  /** Per-target extractor cache — first read decides; subsequent reads reuse. */
  const extractorCache = new Map<string, readonly ChatHistoryExtractor[]>();
  /**
   * Targets whose initial read has completed. On the first read for a target,
   * existing rows are registered in `seenSignatures` WITHOUT calling `onEvent`
   * — this matches the Claude-Code-hook contract that downstream Layer C is
   * built around (only NEW user prompts feed the pipeline; historical prompts
   * accumulated in state.vscdb are NOT replayed every activation). Without
   * this prime-only behaviour, every Cursor restart re-emitted the entire
   * prompt backlog, flooding Layer C's session-state machine and producing
   * advisory storms that bypass the 3-prompt warmup + 5-prompt cooldown gates.
   */
  const primedTargets = new Set<string>();

  /**
   * Paths already surfaced via `onSchemaUnknown`. The unknown-schema branch
   * does NOT cache an extractor (it must keep re-checking, because a fresh
   * Cursor workspace's state.vscdb starts with no chat keys and only gains
   * them once the user chats). But re-notifying on every fs.watch fire floods
   * the log and re-pops the info toast — acutely visible on Windsurf, whose
   * workspaceStorage state.vscdb never holds chat and so stays unknown forever.
   * Notify once per path; keep re-checking silently thereafter.
   */
  const reportedUnknownPaths = new Set<string>();

  /**
   * Cross-extractor dedup. Cursor 3.x mirrors Composer prompts into BOTH
   * globalStorage cursorDiskKV (decoded by cursor-composer-bubble) AND
   * workspaceStorage ItemTable.aiService.prompts (decoded by cursor-v2024-q4
   * as "ask-mode"). Without this map every Composer prompt is captured twice
   * → Layer C's prompt_count grows at 2× rate → classifier fires at wrong
   * positions. Discovered during S01 manual testing 2026-05-27.
   *
   * Keyed by trimmed prompt text → last-seen epoch ms. A prompt re-emitted
   * within DEDUP_WINDOW_MS of its first sighting is dropped.
   */
  const recentPromptTimestamps = new Map<string, number>();
  const DEDUP_WINDOW_MS = 60_000;

  function signatureOf(e: ChatHistoryEvent): string {
    return `${e.sourcePath}|${e.rawSessionId}|${e.prompt}`;
  }

  /** Returns true if this prompt text was already emitted in the dedup window. */
  function isCrossExtractorDuplicate(promptText: string, now: number): boolean {
    const key = promptText.trim();
    const last = recentPromptTimestamps.get(key);
    if (last !== undefined && now - last < DEDUP_WINDOW_MS) {
      return true;
    }
    recentPromptTimestamps.set(key, now);
    // Lazy GC: drop entries older than the window so the map doesn't grow forever.
    if (recentPromptTimestamps.size > 200) {
      for (const [k, t] of recentPromptTimestamps) {
        if (now - t >= DEDUP_WINDOW_MS) recentPromptTimestamps.delete(k);
      }
    }
    return false;
  }

  function reportError(err: unknown, path: string): void {
    const e = err instanceof Error ? err : new Error(String(err));
    opts.onError?.(new Error(`[chat-history-watcher] ${path}: ${e.message}`));
  }

  async function processSqliteTarget(target: WatchTarget): Promise<void> {
    try {
      const rows = await readItemTableFn(target.path);
      const isInitialPass = !primedTargets.has(target.path);
      primedTargets.add(target.path);

      // Per-row, run ALL extractors that own the row's key — not just the
      // single "fingerprint winner". The old logic picked one extractor via
      // `pickExtractor` and used it for every row, which silently dropped
      // prompts when the workspace had keys from multiple Cursor eras: e.g.
      // both `aiService.prompts` (cursor-v2024-q4) AND `composer.composerData`
      // (cursor-v2025-q1) exist in modern Cursor workspaces. The fingerprint
      // count tied at 1 each, registry order picked cursor-v2025-q1, which
      // doesn't own aiService.prompts → all Ask-mode prompts were silently
      // discarded. Discovered during M2 manual testing Round 2 after the WAL
      // fix (which got fs.watch firing correctly) revealed that events
      // STILL weren't emitting.
      //
      // `pickExtractor` is still used to drive the schema-unknown toast
      // (matching ANY extractor = schema known, matching NONE = unknown),
      // but the per-row decoding now uses every extractor whose `ownsKey`
      // returns true for that row.
      const extractorsToTry = target.extractor
        ? [target.extractor]
        : (extractorCache.get(target.path) ?? ALL_EXTRACTORS);

      if (!target.extractor && !extractorCache.has(target.path)) {
        const fp = pickExtractor(rows.map((r) => r.key));
        if (fp.kind === 'known') {
          // Cache ALL_EXTRACTORS once we've confirmed at least one matches —
          // subsequent reads of this target skip the unknown-schema check.
          extractorCache.set(target.path, ALL_EXTRACTORS);
        } else {
          if (!reportedUnknownPaths.has(target.path)) {
            reportedUnknownPaths.add(target.path);
            opts.onSchemaUnknown?.({
              path: target.path,
              observedSampleKeys: fp.observedSampleKeys,
            });
          }
          return;
        }
      }

      for (const row of rows) {
        for (const extractor of extractorsToTry) {
          if (!extractor.ownsKey(row.key)) continue;
          const decoded = extractor.decodeRow(row, target.path);
          for (const ev of decoded) {
            const sig = signatureOf(ev);
            if (seenSignatures.has(sig)) continue;
            seenSignatures.add(sig);
            // Initial pass: prime dedup only. Subsequent fs.watch fires emit
            // only truly-new prompts. See primedTargets docstring.
            if (isInitialPass) {
              // Cross-extractor dedup is meant to catch Composer→Ask MIRROR
              // emissions seconds apart, NOT historical prompts from prior
              // sessions that happen to share text with a fresh user prompt.
              // globalStorage state.vscdb is workspace-agnostic so initial
              // pass sees bubbles from ALL prior workspaces. Priming with
              // timestamp 0 ensures `now - 0 >> DEDUP_WINDOW_MS`, so any
              // genuinely new emission of the same text passes through.
              recentPromptTimestamps.set(ev.prompt.trim(), 0);
              continue;
            }
            const now = nowFn();
            if (isCrossExtractorDuplicate(ev.prompt, now.getTime())) continue;
            opts.onEvent({ ...ev, capturedAt: now });
          }
        }
      }
    } catch (err) {
      reportError(err, target.path);
    }
  }

  async function processWindsurfTarget(target: WatchTarget): Promise<void> {
    try {
      const files = await readWindsurfJsonFilesFn(target.path);
      const isInitialPass = !primedTargets.has(target.path);
      primedTargets.add(target.path);
      for (const { path: filePath, parsed } of files) {
        const decoded = decodeWindsurfFn(parsed, filePath);
        for (const ev of decoded) {
          const sig = signatureOf(ev);
          if (seenSignatures.has(sig)) continue;
          seenSignatures.add(sig);
          if (isInitialPass) {
            // See sqlite-target's comment on why timestamp=0 here.
            recentPromptTimestamps.set(ev.prompt.trim(), 0);
            continue;
          }
          const now = nowFn();
          if (isCrossExtractorDuplicate(ev.prompt, now.getTime())) continue;
          opts.onEvent({ ...ev, capturedAt: now });
        }
      }
    } catch (err) {
      reportError(err, target.path);
    }
  }

  function schedule(target: WatchTarget): void {
    const existing = debouncers.get(target.path);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      debouncers.delete(target.path);
      if (target.kind === 'cursor-sqlite') {
        void processSqliteTarget(target);
      } else {
        void processWindsurfTarget(target);
      }
    }, debounceMs);
    debouncers.set(target.path, t);
  }

  return {
    start(): void {
      for (const target of opts.targets) {
        try {
          const listener: WatchListener<string> = () => schedule(target);
          // Watch the primary path (the SQLite main file for cursor-sqlite,
          // or the codeium dir for windsurf-dir).
          const w = watchFn(target.path, listener);
          w.on('error', (err: Error) => reportError(err, target.path));
          fsWatchers.push(w);

          // ── WAL-mode liveness fix ────────────────────────────────────────
          // For cursor-sqlite targets, Cursor uses SQLite WAL mode — all
          // writes go to `<path>-wal`, NOT the main file. fs.watch on the
          // main file alone would never fire for new prompts (the main file
          // only changes at checkpoint time, which can be minutes or hours
          // later). Also watch the WAL sibling so we re-read whenever Cursor
          // writes a new prompt. The read path (defaultReadItemTable) already
          // copies main + wal + shm to a tmp staging dir and checkpoints
          // before reading, so it always sees the latest data regardless of
          // which file triggered the watch. Discovered during M2 manual
          // testing Round 2 when live Cursor prompts didn't reach the store.
          if (target.kind === 'cursor-sqlite') {
            for (const suffix of ['-wal', '-shm'] as const) {
              const siblingPath = target.path + suffix;
              try {
                const sw = watchFn(siblingPath, listener);
                sw.on('error', (err: Error) => reportError(err, siblingPath));
                fsWatchers.push(sw);
              } catch {
                // Sibling doesn't exist yet (WAL hasn't been initialised) —
                // that's fine; Cursor creates it on first chat write, and
                // the main-file watch will fire when SQLite eventually
                // checkpoints, prompting a re-read that sees the new rows.
              }
            }
          }

          // Initial pass so any existing rows are diffed immediately
          schedule(target);
        } catch (err) {
          reportError(err, target.path);
        }
      }

      // Polling backstop — re-read every target on an interval so capture does
      // not depend on fs.watch firing (which is unreliable on Windows for the
      // SQLite WAL recreate pattern; see pollMs doc). Dedup makes this safe: a
      // poll only emits prompts not already seen.
      if (pollMs > 0) {
        pollTimer = setInterval(() => {
          for (const target of opts.targets) schedule(target);
        }, pollMs);
        if (typeof (pollTimer as { unref?: () => void }).unref === 'function') {
          (pollTimer as { unref: () => void }).unref();
        }
      }
    },
    stop(): void {
      if (pollTimer !== undefined) { clearInterval(pollTimer); pollTimer = undefined; }
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
