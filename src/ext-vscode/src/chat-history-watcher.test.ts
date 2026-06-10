import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  createChatHistoryWatcher,
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
  let readFileFn: ReturnType<typeof vi.fn>;
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
    readFileFn = vi.fn(async () => Buffer.from('fake-db-bytes'));
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
      readFileFn,
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
      readFileFn,
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
      readFileFn,
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
      readFileFn,
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
      readFileFn,
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
      readFileFn,
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
      readFileFn,
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

  it('forwards readFileFn errors to onError without crashing', async () => {
    readFileFn.mockRejectedValueOnce(new Error('disk gone'));
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/p', makeExtractor('test', []))],
      onEvent,
      onError,
      watchFn: watchFn as never,
      readFileFn,
      readItemTableFn,
      debounceMs: 1,
    });
    w.start();
    await new Promise((r) => setTimeout(r, 20));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0].message).toContain('disk gone');
  });

  it('forwards readItemTableFn errors to onError without crashing', async () => {
    readItemTableFn.mockRejectedValueOnce(new Error('sqlite parse error'));
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/p', makeExtractor('test', []))],
      onEvent,
      onError,
      watchFn: watchFn as never,
      readFileFn,
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
      readFileFn,
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
      readFileFn,
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
      readFileFn,
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
      readFileFn,
      readItemTableFn,
      debounceMs: 1,
    });
    expect(() => w.start()).not.toThrow();
    expect(() => w.stop()).not.toThrow();
  });
});
