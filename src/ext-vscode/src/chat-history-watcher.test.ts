import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createChatHistoryWatcher,
  defaultReadItemTable,
  type ReadItemTableFn,
} from './chat-history-watcher.js';
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
    watchFn = vi.fn(() => {
      const w = makeFakeWatcher();
      createdWatchers.push(w);
      return w;
    });
    readItemTableFn = vi.fn<ReadItemTableFn>(async () => []);
    onEvent = vi.fn();
    onError = vi.fn();
    onSchemaUnknown = vi.fn();
  });

  it('start() registers a watcher for every target', () => {
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/a/state.vscdb'), cursorTarget('/b/state.vscdb')],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
    });
    w.start();
    expect(watchFn).toHaveBeenCalledTimes(2);
    expect(watchFn).toHaveBeenCalledWith('/a/state.vscdb', expect.any(Function));
    expect(watchFn).toHaveBeenCalledWith('/b/state.vscdb', expect.any(Function));
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

  it('windsurf-dir targets are accepted without crashing (decoding deferred to Branch 4)', () => {
    const w = createChatHistoryWatcher({
      targets: [{ path: '/ws', kind: 'windsurf-dir' }],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
      debounceMs: 1,
    });
    expect(() => w.start()).not.toThrow();
    expect(() => w.stop()).not.toThrow();
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
