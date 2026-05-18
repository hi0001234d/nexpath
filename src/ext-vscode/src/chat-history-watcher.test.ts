import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createChatHistoryWatcher,
  defaultReadItemTable,
  defaultReadWindsurfJsonFiles,
  type ReadItemTableFn,
  type ReadWindsurfJsonFilesFn,
} from './chat-history-watcher.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import type {
  ChatHistoryEvent,
  ChatHistoryExtractor,
  ItemTableRow,
  WatchTarget,
} from './chat-history-types.js';

/** Fake fs.watch — returns a minimal EventEmitter compatible with FSWatcher. */
interface FakeFSWatcher extends EventEmitter {
  close: () => void;
}

function makeFakeWatcher(): FakeFSWatcher {
  const w = new EventEmitter() as FakeFSWatcher;
  w.close = vi.fn();
  return w;
}

function makeExtractor(
  id: string,
  events: ChatHistoryEvent[],
  ownsKey: (k: string) => boolean = () => true,
): ChatHistoryExtractor {
  return {
    id,
    label: id,
    fingerprintKeys: [id],
    ownsKey,
    decodeRow: () => events,
  };
}

function ev(
  prompt: string,
  rawSessionId: string,
  sourcePath: string,
): ChatHistoryEvent {
  return {
    prompt,
    rawSessionId,
    capturedAt: new Date(0),
    sourcePath,
    extractorId: 'test',
  };
}

const cursorTarget = (path: string, extractor?: ChatHistoryExtractor): WatchTarget => ({
  path,
  kind: 'cursor-sqlite',
  extractor,
});

describe('createChatHistoryWatcher', () => {
  let watchFn: ReturnType<typeof vi.fn>;
  let createdWatchers: FakeFSWatcher[];
  let readItemTableFn: ReturnType<typeof vi.fn>;
  let onEvent: ReturnType<typeof vi.fn>;
  let onError: ReturnType<typeof vi.fn>;
  let onSchemaUnknown: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createdWatchers = [];
    watchFn = vi.fn((_path: string, listener?: (event: string, filename: string) => void) => {
      const w = makeFakeWatcher();
      // Wire the listener so .emit('change', ...) actually triggers it.
      // Mirrors node:fs watch() behaviour where the listener arg is
      // registered as a 'change' / 'rename' event handler on the FSWatcher.
      if (listener) w.on('change', listener);
      createdWatchers.push(w);
      return w;
    });
    readItemTableFn = vi.fn<ReadItemTableFn>(async () => []);
    onEvent = vi.fn();
    onError = vi.fn();
    onSchemaUnknown = vi.fn();
  });

  it('start() registers a watcher for every target (plus WAL+SHM siblings for cursor-sqlite)', () => {
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/a/state.vscdb'), cursorTarget('/b/state.vscdb')],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
    });
    w.start();
    // Per target: main file + -wal + -shm = 3 watchers. Two targets = 6.
    // The -wal / -shm watches are load-bearing because live Cursor uses
    // SQLite WAL mode and writes go to the sibling, not the main file.
    expect(watchFn).toHaveBeenCalledTimes(6);
    expect(watchFn).toHaveBeenCalledWith('/a/state.vscdb', expect.any(Function));
    expect(watchFn).toHaveBeenCalledWith('/a/state.vscdb-wal', expect.any(Function));
    expect(watchFn).toHaveBeenCalledWith('/a/state.vscdb-shm', expect.any(Function));
    expect(watchFn).toHaveBeenCalledWith('/b/state.vscdb', expect.any(Function));
    expect(watchFn).toHaveBeenCalledWith('/b/state.vscdb-wal', expect.any(Function));
    expect(watchFn).toHaveBeenCalledWith('/b/state.vscdb-shm', expect.any(Function));
  });

  it('WAL sibling change triggers a re-read of the main target (WAL-mode liveness)', async () => {
    const fakeRows: ItemTableRow[] = [{ key: 'k1', value: 'v1' }];
    readItemTableFn.mockResolvedValue(fakeRows);
    const extractor = makeExtractor('test', [ev('prompt-from-wal', 's-1', '/p/state.vscdb')]);
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/p/state.vscdb', extractor)],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
      debounceMs: 5,
    });
    w.start();
    // Initial pass first
    await new Promise((r) => setTimeout(r, 20));
    expect(onEvent).toHaveBeenCalledTimes(1);
    onEvent.mockClear();
    readItemTableFn.mockResolvedValue([{ key: 'k1', value: 'v1' }, { key: 'k2', value: 'v2' }]);
    extractor.decodeRow = () => [ev('prompt-after-wal-fire', 's-2', '/p/state.vscdb')];

    // The 2nd watcher in createdWatchers is the -wal sibling (index 1).
    // Emit 'change' on it — the listener should re-schedule the main target.
    expect(createdWatchers.length).toBeGreaterThanOrEqual(2);
    createdWatchers[1]!.emit('change', 'change', '/p/state.vscdb-wal');
    await new Promise((r) => setTimeout(r, 30));

    // After the WAL fire + re-schedule + read, we should see the NEW event.
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]![0].prompt).toBe('prompt-after-wal-fire');
  });

  it('cursor-sqlite: runs ALL extractors that own a row, not just the fingerprint-winner', async () => {
    // Regression for the fingerprint-tie bug found in M2 manual testing R2.1:
    // workspaces with BOTH aiService.prompts (cursor-v2024-q4) AND
    // composer.composerData (cursor-v2025-q1) caused pickExtractor to tie at
    // 1 match each, registry order picked cursor-v2025-q1, which doesn't own
    // aiService.prompts → all Ask-mode prompts were silently discarded.
    // Fix: per-row, run every extractor whose ownsKey returns true.
    const fakeRows: ItemTableRow[] = [
      { key: 'composer.composerData', value: JSON.stringify({ selectedComposerIds: [] }) },
      { key: 'aiService.prompts', value: JSON.stringify([{ text: 'real prompt' }]) },
    ];
    readItemTableFn.mockResolvedValue(fakeRows);

    const w = createChatHistoryWatcher({
      targets: [{ path: '/p/state.vscdb', kind: 'cursor-sqlite' }],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
      debounceMs: 1,
    });
    w.start();
    await new Promise((r) => setTimeout(r, 20));

    // Expect: cursor-v2024-q4 decodes aiService.prompts → 1 event with our prompt
    // (cursor-v2025-q1 also runs but ownsKey returns false for aiService.prompts
    // and the composer.composerData value is metadata only → 0 events from it)
    expect(onEvent).toHaveBeenCalled();
    const events = onEvent.mock.calls.map((c) => c[0]);
    const prompts = events.map((e) => e.prompt);
    expect(prompts).toContain('real prompt');
  });

  it('windsurf-dir targets do NOT get WAL siblings watched (only cursor-sqlite uses WAL)', () => {
    const w = createChatHistoryWatcher({
      targets: [{ path: '/ws/codeium', kind: 'windsurf-dir' }],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
    });
    w.start();
    // Just the dir itself, no WAL siblings (Windsurf uses JSON files not SQLite)
    expect(watchFn).toHaveBeenCalledTimes(1);
    expect(watchFn).toHaveBeenCalledWith('/ws/codeium', expect.any(Function));
  });

  it('initial-pass after start() reads + emits events for already-existing rows', async () => {
    const fakeRows: ItemTableRow[] = [{ key: 'k1', value: 'v1' }];
    readItemTableFn.mockResolvedValue(fakeRows);
    const extractor = makeExtractor('test', [ev('hi', 's-1', '/p')]);
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/p', extractor)],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
      debounceMs: 1,
    });
    w.start();
    await new Promise((r) => setTimeout(r, 20));
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]![0].prompt).toBe('hi');
  });

  it('deduplicates events across multiple reads (signature dedup)', async () => {
    readItemTableFn.mockResolvedValue([{ key: 'k', value: 'v' }]);
    const extractor = makeExtractor('test', [ev('same', 's-1', '/p')]);
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/p', extractor)],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
      debounceMs: 1,
    });
    w.start();
    await new Promise((r) => setTimeout(r, 20));

    // simulate three more fs.watch events
    createdWatchers[0]!.emit('change', 'change', '/p');
    await new Promise((r) => setTimeout(r, 20));
    createdWatchers[0]!.emit('change', 'change', '/p');
    await new Promise((r) => setTimeout(r, 20));

    // still only one emission (the same prompt was already seen)
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('debounces a burst of change events into a single read', async () => {
    readItemTableFn.mockResolvedValue([]);
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/p', makeExtractor('test', []))],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
      debounceMs: 50,
    });
    w.start();
    // initial-pass schedule fires after 50ms; before it does, fire 5 more changes
    for (let i = 0; i < 5; i++) {
      createdWatchers[0]!.emit('change', 'change', '/p');
    }
    await new Promise((r) => setTimeout(r, 80));
    // Only one read should have occurred (the bursts coalesced)
    expect(readItemTableFn).toHaveBeenCalledTimes(1);
  });

  it('emits onSchemaUnknown when the ItemTable has no recognised fingerprint', async () => {
    readItemTableFn.mockResolvedValue([
      { key: 'unrelated.thing.1', value: 'x' },
      { key: 'unrelated.thing.2', value: 'x' },
    ]);
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/p')], // no explicit extractor — must fingerprint
      onEvent,
      onSchemaUnknown,
      watchFn: watchFn as never,
      readItemTableFn,
      debounceMs: 1,
    });
    w.start();
    await new Promise((r) => setTimeout(r, 20));
    expect(onSchemaUnknown).toHaveBeenCalledTimes(1);
    const arg = onSchemaUnknown.mock.calls[0]![0];
    expect(arg.path).toBe('/p');
    expect(arg.observedSampleKeys).toEqual([
      'unrelated.thing.1',
      'unrelated.thing.2',
    ]);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('forwards readItemTableFn errors to onError without crashing', async () => {
    readItemTableFn.mockRejectedValueOnce(new Error('sqlite parse error'));
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/p', makeExtractor('test', []))],
      onEvent,
      onError,
      watchFn: watchFn as never,
      readItemTableFn,
      debounceMs: 1,
    });
    w.start();
    await new Promise((r) => setTimeout(r, 20));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0].message).toContain('sqlite parse error');
  });

  it('forwards fs.watch error events to onError', async () => {
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/p', makeExtractor('test', []))],
      onEvent,
      onError,
      watchFn: watchFn as never,
      readItemTableFn,
      debounceMs: 1,
    });
    w.start();
    createdWatchers[0]!.emit('error', new Error('watch boom'));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0].message).toContain('watch boom');
  });

  it('stop() closes all watchers and cancels pending debouncers', async () => {
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/a'), cursorTarget('/b')],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
      debounceMs: 50,
    });
    w.start();
    // before the debounced read fires, stop
    w.stop();
    await new Promise((r) => setTimeout(r, 80));
    for (const fw of createdWatchers) {
      expect(fw.close).toHaveBeenCalled();
    }
    // no reads should have happened — debouncers were cancelled
    expect(readItemTableFn).not.toHaveBeenCalled();
  });

  it('stamps capturedAt with nowFn (clock injection)', async () => {
    const fixedDate = new Date('2026-05-14T17:00:00Z');
    readItemTableFn.mockResolvedValue([{ key: 'k', value: 'v' }]);
    const extractor = makeExtractor('test', [ev('hi', 's', '/p')]);
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/p', extractor)],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
      nowFn: () => fixedDate,
      debounceMs: 1,
    });
    w.start();
    await new Promise((r) => setTimeout(r, 20));
    expect(onEvent.mock.calls[0]![0].capturedAt).toEqual(fixedDate);
  });

  it('windsurf-dir targets are accepted without crashing (default stub decoder = no events)', () => {
    const w = createChatHistoryWatcher({
      targets: [{ path: '/ws', kind: 'windsurf-dir' }],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
      // Default readWindsurfJsonFilesFn handles missing dir (returns [])
      // so this passes without disk IO.
      debounceMs: 1,
    });
    expect(() => w.start()).not.toThrow();
    expect(() => w.stop()).not.toThrow();
  });

  // ── windsurf-dir code path (Drift A fix) ────────────────────────────────
  // These tests cover the new processWindsurfTarget flow: readWindsurf →
  // decodeWindsurf → dedup → onEvent. The default decoder is a stub, so
  // we inject `decodeWindsurfFn` to simulate what the engineer's real
  // decoder will eventually do.

  it('windsurf-dir: pipes readWindsurfJsonFilesFn output through decodeWindsurfFn → onEvent', async () => {
    const fakeFiles = [
      { path: '/ws/a.json', parsed: { user_prompt: 'first' } },
      { path: '/ws/b.json', parsed: { user_prompt: 'second' } },
    ];
    const readWindsurfJsonFilesFn = vi.fn<ReadWindsurfJsonFilesFn>(
      async () => fakeFiles,
    );
    // Test stand-in for the real decoder: emit one event per file with the
    // user_prompt field. Mirrors what the engineer's real decoder will do.
    const decodeWindsurfFn = vi.fn(
      (parsed: unknown, sourcePath: string): ChatHistoryEvent[] => {
        if (typeof parsed === 'object' && parsed !== null && 'user_prompt' in parsed) {
          return [
            ev(
              (parsed as { user_prompt: string }).user_prompt,
              `windsurf-session:${sourcePath}`,
              sourcePath,
            ),
          ];
        }
        return [];
      },
    );

    const w = createChatHistoryWatcher({
      targets: [{ path: '/ws', kind: 'windsurf-dir' }],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
      readWindsurfJsonFilesFn,
      decodeWindsurfFn,
      debounceMs: 1,
    });
    w.start();
    await new Promise((r) => setTimeout(r, 20));

    expect(readWindsurfJsonFilesFn).toHaveBeenCalledWith('/ws');
    expect(decodeWindsurfFn).toHaveBeenCalledTimes(2);
    expect(decodeWindsurfFn).toHaveBeenCalledWith(fakeFiles[0]!.parsed, '/ws/a.json');
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent.mock.calls[0]![0].prompt).toBe('first');
    expect(onEvent.mock.calls[1]![0].prompt).toBe('second');
  });

  it('windsurf-dir: deduplicates emitted events across multiple files (signature dedup)', async () => {
    // Realistic case: same conversation referenced in two JSON files (e.g.
    // Windsurf renamed a session file, leaving an old copy + a new one).
    // Both decode to the same prompt+sessionId+sourcePath* — dedup should
    // emit only the first.
    // (*signature includes sourcePath; we use the same path here to force
    // a true dedup hit. The realistic engineer's decoder will derive
    // `rawSessionId` from session metadata inside the JSON, not the file
    // path, making dedup work even when the same conversation is split
    // across files.)
    const fakeFiles = [
      { path: '/ws/a.json', parsed: { p: 'hi' } },
      { path: '/ws/a.json', parsed: { p: 'hi' } }, // same path → same signature
    ];
    const readWindsurfJsonFilesFn = vi.fn<ReadWindsurfJsonFilesFn>(
      async () => fakeFiles,
    );
    const decodeWindsurfFn = vi.fn(
      (_parsed: unknown, sourcePath: string): ChatHistoryEvent[] => [
        ev('hi', 'sess-1', sourcePath),
      ],
    );

    const w = createChatHistoryWatcher({
      targets: [{ path: '/ws', kind: 'windsurf-dir' }],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
      readWindsurfJsonFilesFn,
      decodeWindsurfFn,
      debounceMs: 1,
    });
    w.start();
    await new Promise((r) => setTimeout(r, 20));

    // Decoder ran for both files (one event each), but signature dedup
    // collapses them into a single onEvent emission.
    expect(decodeWindsurfFn).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('windsurf-dir: forwards readWindsurfJsonFilesFn errors to onError', async () => {
    const readWindsurfJsonFilesFn = vi.fn<ReadWindsurfJsonFilesFn>(async () => {
      throw new Error('windsurf read boom');
    });
    const w = createChatHistoryWatcher({
      targets: [{ path: '/ws', kind: 'windsurf-dir' }],
      onEvent,
      onError,
      watchFn: watchFn as never,
      readItemTableFn,
      readWindsurfJsonFilesFn,
      debounceMs: 1,
    });
    w.start();
    await new Promise((r) => setTimeout(r, 20));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0].message).toContain('windsurf read boom');
    expect(onEvent).not.toHaveBeenCalled();
  });
});

// ── defaultReadWindsurfJsonFiles — real fs scan against a tmp dir ─────────
//
// Tests the production reader's directory-scan + JSON-parse logic. Uses
// real fs (no mocks) because the implementation is fs-IO-bound and the
// test cost is trivial (a tmp dir + a few small files).

describe('defaultReadWindsurfJsonFiles', () => {
  let tmpDirPath: string;

  beforeEach(() => {
    tmpDirPath = mkdtempSync(join(tmpdir(), 'nexpath-windsurf-test-'));
  });
  afterEach(() => {
    rmSync(tmpDirPath, { recursive: true, force: true });
  });

  it('returns [] when the directory does not exist (no crash)', async () => {
    const out = await defaultReadWindsurfJsonFiles(
      join(tmpDirPath, 'does-not-exist'),
    );
    expect(out).toEqual([]);
  });

  it('returns [] for an empty directory', async () => {
    const out = await defaultReadWindsurfJsonFiles(tmpDirPath);
    expect(out).toEqual([]);
  });

  it('reads + parses every .json file in the directory', async () => {
    writeFileSync(join(tmpDirPath, 'a.json'), JSON.stringify({ x: 1 }));
    writeFileSync(join(tmpDirPath, 'b.json'), JSON.stringify({ y: 2 }));
    const out = await defaultReadWindsurfJsonFiles(tmpDirPath);
    expect(out).toHaveLength(2);
    const byPath = new Map(out.map((r) => [r.path, r.parsed]));
    expect(byPath.get(join(tmpDirPath, 'a.json'))).toEqual({ x: 1 });
    expect(byPath.get(join(tmpDirPath, 'b.json'))).toEqual({ y: 2 });
  });

  it('skips files that are not .json (case-insensitive on the suffix)', async () => {
    writeFileSync(join(tmpDirPath, 'data.json'), JSON.stringify({ ok: true }));
    writeFileSync(join(tmpDirPath, 'README.md'), 'not json');
    writeFileSync(join(tmpDirPath, 'binary.dat'), 'not json');
    const out = await defaultReadWindsurfJsonFiles(tmpDirPath);
    expect(out).toHaveLength(1);
    expect(out[0]!.path.endsWith('data.json')).toBe(true);
  });

  it('silently drops malformed JSON files (preserves valid siblings)', async () => {
    writeFileSync(join(tmpDirPath, 'good.json'), JSON.stringify({ valid: true }));
    writeFileSync(join(tmpDirPath, 'bad.json'), '{ not valid json,');
    const out = await defaultReadWindsurfJsonFiles(tmpDirPath);
    expect(out).toHaveLength(1);
    expect(out[0]!.path.endsWith('good.json')).toBe(true);
    expect(out[0]!.parsed).toEqual({ valid: true });
  });

  it('honours nested directories by NOT recursing (shallow scan only)', async () => {
    writeFileSync(join(tmpDirPath, 'top.json'), JSON.stringify({ depth: 0 }));
    mkdirSync(join(tmpDirPath, 'nested'));
    writeFileSync(join(tmpDirPath, 'nested', 'deep.json'), JSON.stringify({ depth: 1 }));
    const out = await defaultReadWindsurfJsonFiles(tmpDirPath);
    // Only top.json; nested/deep.json is not reached
    expect(out).toHaveLength(1);
    expect(out[0]!.parsed).toEqual({ depth: 0 });
  });
});

// ── defaultReadItemTable — the production better-sqlite3 + WAL reader ─────────
//
// These tests exercise the REAL reader against synthetic SQLite files (built
// with better-sqlite3 in the test setup). They cover the WAL-mode branch
// from dev plan §2.5 — the whole reason we swapped sql.js → better-sqlite3
// in M2/B4.

describe('defaultReadItemTable', () => {
  let tmpDirPath: string;

  beforeEach(() => {
    tmpDirPath = mkdtempSync(join(tmpdir(), 'nexpath-readtable-test-'));
  });
  afterEach(() => {
    rmSync(tmpDirPath, { recursive: true, force: true });
  });

  /** Build a real .vscdb file with an ItemTable populated from the given rows. */
  async function createTestVscdb(
    fileName: string,
    rows: Array<{ key: string; value: string }>,
    options: { walMode?: boolean } = {},
  ): Promise<string> {
    const mod = (await import('better-sqlite3')) as unknown as {
      default: new (path: string) => {
        exec(sql: string): unknown;
        prepare(sql: string): { run(...args: unknown[]): unknown };
        pragma(pragma: string): unknown;
        close(): void;
      };
    };
    const Database = mod.default;
    const path = join(tmpDirPath, fileName);
    const db = new Database(path);
    if (options.walMode) db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE ItemTable (key TEXT NOT NULL, value TEXT NOT NULL)');
    const insert = db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)');
    for (const r of rows) insert.run(r.key, r.value);
    db.close();
    return path;
  }

  /** Build a real .vscdb file with NO ItemTable (different schema). */
  async function createEmptyVscdb(fileName: string): Promise<string> {
    const mod = (await import('better-sqlite3')) as unknown as {
      default: new (path: string) => { exec(sql: string): unknown; close(): void };
    };
    const Database = mod.default;
    const path = join(tmpDirPath, fileName);
    const db = new Database(path);
    db.exec('CREATE TABLE OtherTable (x INTEGER)');
    db.close();
    return path;
  }

  it('reads happy-path ItemTable rows from a real .vscdb file', async () => {
    const dbPath = await createTestVscdb('happy.vscdb', [
      { key: 'aiService.prompts', value: '["hello","world"]' },
      { key: 'composer.composerData', value: '{"selectedComposerIds":[]}' },
      { key: 'workbench.editor.recent', value: '[]' },
    ]);
    const rows = await defaultReadItemTable(dbPath);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.key === 'aiService.prompts')?.value).toBe('["hello","world"]');
    expect(rows.find((r) => r.key === 'composer.composerData')?.value).toBe('{"selectedComposerIds":[]}');
  });

  it('returns [] when the .vscdb has no ItemTable (defensive)', async () => {
    const dbPath = await createEmptyVscdb('no-itemtable.vscdb');
    const rows = await defaultReadItemTable(dbPath);
    expect(rows).toEqual([]);
  });

  it('reads rows from a .vscdb opened in WAL mode (the Cursor scenario)', async () => {
    // Build a WAL-mode .vscdb. The journal-mode pragma + the inserts create
    // the .vscdb-wal sibling. better-sqlite3 reads from both transparently
    // when opening the staged copy.
    const dbPath = await createTestVscdb(
      'wal.vscdb',
      [
        { key: 'aiService.prompts', value: '[]' },
        { key: 'cursor/agentLayout.sidebarWidth', value: '320' },
      ],
      { walMode: true },
    );
    const rows = await defaultReadItemTable(dbPath);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.find((r) => r.key === 'aiService.prompts')?.value).toBe('[]');
    expect(rows.find((r) => r.key === 'cursor/agentLayout.sidebarWidth')?.value).toBe('320');
  });

  it('does not modify the source .vscdb file (operates on a tmp staging copy)', async () => {
    const dbPath = await createTestVscdb('source-untouched.vscdb', [
      { key: 'aiService.prompts', value: '["x"]' },
    ]);
    const { statSync } = await import('node:fs');
    const sizeBefore = statSync(dbPath).size;
    await defaultReadItemTable(dbPath);
    await defaultReadItemTable(dbPath);
    await defaultReadItemTable(dbPath);
    const sizeAfter = statSync(dbPath).size;
    expect(sizeAfter).toBe(sizeBefore);
  });
});
