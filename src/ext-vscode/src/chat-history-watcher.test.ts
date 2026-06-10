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

  it('pollMs backstop captures new prompts even when fs.watch NEVER fires (Windows)', async () => {
    // Simulates the Windows failure: fs.watch goes silent after start, so the
    // ONLY way new prompts surface is the poll. No watcher .emit() is called.
    readItemTableFn.mockResolvedValue([]);
    const extractor = makeExtractor('test', [ev('polled-prompt', 's-poll', '/p/state.vscdb')]);
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/p/state.vscdb', extractor)],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
      debounceMs: 5,
      pollMs: 10,
    });
    w.start();
    await new Promise((r) => setTimeout(r, 20)); // prime pass reads [] → no emit
    expect(onEvent).toHaveBeenCalledTimes(0);

    // A new prompt lands; fs.watch is dead → only the poll can catch it.
    readItemTableFn.mockResolvedValue([{ key: 'k', value: 'v' }]);
    await new Promise((r) => setTimeout(r, 40)); // poll (10ms) re-reads → emit
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]![0].prompt).toBe('polled-prompt');

    // stop() must cancel the poll — no further emits after a new row appears.
    w.stop();
    onEvent.mockClear();
    readItemTableFn.mockResolvedValue([{ key: 'k2', value: 'v2' }]);
    await new Promise((r) => setTimeout(r, 40));
    expect(onEvent).toHaveBeenCalledTimes(0);
  });

  it('WAL sibling change triggers a re-read of the main target (WAL-mode liveness)', async () => {
    // Start with no rows so the initial pass primes nothing; then a NEW row
    // appears via a WAL-sibling change and that should produce one emit.
    readItemTableFn.mockResolvedValue([]);
    const extractor = makeExtractor('test', [ev('prompt-after-wal-fire', 's-2', '/p/state.vscdb')]);
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/p/state.vscdb', extractor)],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
      debounceMs: 5,
    });
    w.start();
    await new Promise((r) => setTimeout(r, 20));
    // After prime: no events emitted yet.
    expect(onEvent).toHaveBeenCalledTimes(0);

    // Now a new row appears. WAL-sibling change should drive a re-read.
    readItemTableFn.mockResolvedValue([{ key: 'k2', value: 'v2' }]);
    // The 2nd watcher in createdWatchers is the -wal sibling (index 1).
    expect(createdWatchers.length).toBeGreaterThanOrEqual(2);
    createdWatchers[1]!.emit('change', 'change', '/p/state.vscdb-wal');
    await new Promise((r) => setTimeout(r, 30));

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
    // Empty first read primes nothing; then the multi-key rows appear.
    readItemTableFn.mockResolvedValue([]);

    const w = createChatHistoryWatcher({
      targets: [{ path: '/p/state.vscdb', kind: 'cursor-sqlite' }],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
      debounceMs: 1,
    });
    w.start();
    await new Promise((r) => setTimeout(r, 20));

    readItemTableFn.mockResolvedValue([
      { key: 'composer.composerData', value: JSON.stringify({ selectedComposerIds: [] }) },
      { key: 'aiService.prompts', value: JSON.stringify([{ text: 'real prompt' }]) },
    ]);
    createdWatchers[0]!.emit('change', 'change', '/p/state.vscdb');
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

  it('FIFO-shift regression: a single new prompt that pushes the oldest out emits exactly once (real cursor-v2024-q4 wiring)', async () => {
    // The exact M2 R3 live-test scenario (2026-05-20): Cursor's
    // aiService.prompts is a rolling FIFO of ~10 prompts. When a new
    // prompt is submitted, the oldest is dropped and ALL indexes shift.
    // Before the cursor-v2024-q4 rawSessionId fix, the dedup signature
    // shifted along with the indexes → every restart re-emitted all 10
    // prompts. After the fix (rawSessionId = 'ask-mode' constant), the
    // signature is sourcePath+text-driven and survives FIFO shifts.
    // This test wires the real cursor-v2024-q4 extractor — via the
    // unified extractor cache — to prove the integration works.
    const { cursorV2024Q4 } = await import('./extractors/cursor-v2024-q4.js');
    const initialPrompts = Array.from({ length: 10 }, (_, i) => ({ text: `prompt-${i}` }));
    readItemTableFn.mockResolvedValueOnce([
      { key: 'aiService.prompts', value: JSON.stringify(initialPrompts) },
    ]);
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/p/state.vscdb', cursorV2024Q4)],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
      debounceMs: 1,
    });
    w.start();
    await new Promise((r) => setTimeout(r, 20));
    expect(onEvent).toHaveBeenCalledTimes(0); // initial pass primed only

    // User submits a new prompt — FIFO drops prompt-0, appends prompt-10.
    const shifted = [
      ...Array.from({ length: 9 }, (_, i) => ({ text: `prompt-${i + 1}` })),
      { text: 'prompt-10' },
    ];
    readItemTableFn.mockResolvedValue([
      { key: 'aiService.prompts', value: JSON.stringify(shifted) },
    ]);
    createdWatchers[0]!.emit('change', 'change', '/p/state.vscdb');
    await new Promise((r) => setTimeout(r, 20));

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]![0].prompt).toBe('prompt-10');
  });

  it('prime-then-new-prompt: existing rows are primed silently, NEW row after start() emits once', async () => {
    // End-to-end of the M2 R2/R3 fix: extension activation must not replay
    // historical state.vscdb rows to Layer C; only prompts that appear
    // AFTER the watcher has primed should fire onEvent. Mirrors what
    // happens when the user (a) opens Cursor with prior Ask-mode history
    // already in state.vscdb, then (b) submits a brand-new prompt.
    const oldRow = { key: 'aiService.prompts', value: '[{"text":"old"}]' };
    const newRow = { key: 'aiService.prompts', value: '[{"text":"old"},{"text":"new"}]' };
    // Initial read: only the "old" row is present.
    readItemTableFn.mockResolvedValueOnce([oldRow]);
    const extractor = makeExtractor('test', []);
    extractor.ownsKey = (k: string) => k === 'aiService.prompts';
    extractor.decodeRow = (row) => {
      const arr = JSON.parse(row.value) as Array<{ text: string }>;
      return arr.map((p, i) => ev(p.text, `prompts-index:${i}`, '/p/state.vscdb'));
    };
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/p/state.vscdb', extractor)],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
      debounceMs: 1,
    });
    w.start();
    await new Promise((r) => setTimeout(r, 20));
    // Prime registered both signatures internally; no events emitted.
    expect(onEvent).toHaveBeenCalledTimes(0);

    // Now a new prompt arrives — state.vscdb grows by one entry.
    readItemTableFn.mockResolvedValue([newRow]);
    createdWatchers[0]!.emit('change', 'change', '/p/state.vscdb');
    await new Promise((r) => setTimeout(r, 20));

    // Exactly ONE event for the NEW prompt; the "old" one is deduped.
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]![0].prompt).toBe('new');
  });

  it('initial-pass after start() reads existing rows but does NOT emit them (prime-only dedup)', async () => {
    // Prime-only initial-pass behaviour. Historical prompts that already exist
    // in state.vscdb when the extension activates must NOT be replayed to
    // Layer C — Layer C is built around Claude Code's hook semantics, which
    // fire only on NEW prompts. Replaying historical prompts on every Cursor
    // restart bypassed Layer C's 3-prompt warmup + 5-prompt cooldown gates
    // and caused advisory storms (root-caused during M2 R2/R3 manual testing).
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
    // Read happened (so dedup is primed) but no event was emitted.
    expect(readItemTableFn).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledTimes(0);
  });

  it('deduplicates events across multiple reads (signature dedup)', async () => {
    // Initial pass primes dedup with the existing row (no emit). Then we
    // simulate a NEW row appearing — that's the first emit. A subsequent
    // change with the same row hits dedup and does not re-emit.
    const extractor = makeExtractor('test', [ev('same', 's-1', '/p')]);
    readItemTableFn.mockResolvedValue([]); // first read = empty (prime with no rows)
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/p', extractor)],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
      debounceMs: 1,
    });
    w.start();
    await new Promise((r) => setTimeout(r, 20));

    // Now a real new prompt arrives on disk. Subsequent reads return the row.
    readItemTableFn.mockResolvedValue([{ key: 'k', value: 'v' }]);
    createdWatchers[0]!.emit('change', 'change', '/p');
    await new Promise((r) => setTimeout(r, 20));
    createdWatchers[0]!.emit('change', 'change', '/p');
    await new Promise((r) => setTimeout(r, 20));

    // First post-prime read emitted once; subsequent reads dedup the same row.
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  // ── Cross-extractor dedup (Cursor 3.x Composer↔Ask mirror) ──────────────
  // Cursor 3.x writes Composer prompts to BOTH globalStorage cursorDiskKV
  // (decoded as bubbleId rawSessionId) AND workspaceStorage aiService.prompts
  // (decoded as 'ask-mode' rawSessionId). Different sourcePath|rawSessionId|prompt
  // signatures bypass the primary dedup. The cross-extractor map dedups by
  // prompt text alone within a 60s window.

  it('cross-extractor dedup: same prompt text from two extractors within 60s emits once', async () => {
    const t0 = new Date('2026-05-27T12:00:00Z');
    // Same prompt text, but the two events arrive with different rawSessionIds
    // and sourcePaths — mimicking Composer (bubbleId) + Ask (ask-mode) mirror.
    const extractor = makeExtractor('mixed', [
      ev('write a test', 'bubbleId-abc', '/global/state.vscdb'),
      ev('write a test', 'ask-mode',     '/workspace/state.vscdb'),
    ]);
    readItemTableFn.mockResolvedValue([]); // prime empty
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/global/state.vscdb', extractor)],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
      nowFn: () => t0,
      debounceMs: 1,
    });
    w.start();
    await new Promise((r) => setTimeout(r, 20));

    // Now both mirror events arrive in one read.
    readItemTableFn.mockResolvedValue([{ key: 'k', value: 'v' }]);
    createdWatchers[0]!.emit('change', 'change', '/global/state.vscdb');
    await new Promise((r) => setTimeout(r, 20));

    // Only ONE emit — the second event was suppressed by cross-extractor dedup.
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('cross-extractor dedup: same prompt text re-submitted after 60s passes through', async () => {
    let clock = new Date('2026-05-27T12:00:00Z').getTime();
    readItemTableFn.mockResolvedValue([]);
    const extractor = makeExtractor('mixed', [
      ev('write a test', 'session-a', '/p/state.vscdb'),
    ]);
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/p/state.vscdb', extractor)],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
      nowFn: () => new Date(clock),
      debounceMs: 1,
    });
    w.start();
    await new Promise((r) => setTimeout(r, 20));

    // First emission of the prompt.
    readItemTableFn.mockResolvedValue([{ key: 'k', value: 'v' }]);
    createdWatchers[0]!.emit('change', 'change', '/p/state.vscdb');
    await new Promise((r) => setTimeout(r, 20));
    expect(onEvent).toHaveBeenCalledTimes(1);

    // Advance clock past 60s window + swap signature so primary dedup doesn't catch it.
    clock += 65_000;
    const reEmit = makeExtractor('mixed', [
      ev('write a test', 'session-b', '/p/state.vscdb'),
    ]);
    // Replace the watcher's extractor lookup by mocking decodeRow via the
    // single-extractor cache — easiest path is a second target with a fresh
    // extractor pointing at the same prompt text.
    readItemTableFn.mockImplementation(async () => [{ key: 'k', value: 'v' }]);
    // Force the extractor decode to return the new rawSessionId by replacing
    // the underlying mock; cursor target's per-row extractor is fed by
    // extractorsToTry which uses target.extractor.
    Object.assign(extractor, { decodeRow: reEmit.decodeRow });

    createdWatchers[0]!.emit('change', 'change', '/p/state.vscdb');
    await new Promise((r) => setTimeout(r, 20));

    // Window expired → second emission passes through.
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it('cross-extractor dedup: initial-pass priming does NOT block fresh emissions of same text', async () => {
    // globalStorage state.vscdb is workspace-agnostic — initial-pass primes
    // dedup with bubble rows from PRIOR workspaces. A fresh user prompt with
    // matching text must still emit. Regression guard for the priming bug
    // discovered during S01 manual run 2026-05-27: priming with NOW timestamp
    // dropped legit P1 captures. Fix primes with timestamp 0 (far past).
    const t0 = new Date('2026-05-27T12:00:00Z');
    // Initial pass returns one historical row decoding to "write a test".
    readItemTableFn.mockResolvedValue([{ key: 'historical', value: 'v' }]);
    const extractor = makeExtractor('mixed', [
      ev('write a test', 'historical-session', '/global/state.vscdb'),
    ]);
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/global/state.vscdb', extractor)],
      onEvent,
      watchFn: watchFn as never,
      readItemTableFn,
      nowFn: () => t0,
      debounceMs: 1,
    });
    w.start();
    await new Promise((r) => setTimeout(r, 20));

    // Initial pass primed the historical row silently — no emit yet.
    expect(onEvent).toHaveBeenCalledTimes(0);

    // Now the user submits a NEW prompt with identical text in the live session.
    // Different rawSessionId so primary signature dedup does NOT match.
    const liveExtractor = makeExtractor('mixed', [
      ev('write a test', 'live-session', '/global/state.vscdb'),
    ]);
    Object.assign(extractor, { decodeRow: liveExtractor.decodeRow });
    readItemTableFn.mockResolvedValue([{ key: 'live', value: 'v' }]);
    createdWatchers[0]!.emit('change', 'change', '/global/state.vscdb');
    await new Promise((r) => setTimeout(r, 20));

    // MUST emit. If priming had used NOW timestamp, this would have been
    // deduped inside the 60s window and the user's P1 prompt would vanish.
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

  it('emits onSchemaUnknown only once per path across repeated unknown reads', async () => {
    // Windsurf's workspaceStorage state.vscdb never holds chat, so it stays
    // unknown on every fs.watch fire. The watcher must keep re-checking (a
    // fresh Cursor workspace gains chat keys later) but notify the user only
    // once — otherwise the log + info toast re-fire endlessly.
    readItemTableFn.mockResolvedValue([
      { key: 'windsurf.cascadeViewContainerId.state', value: 'x' },
    ]);
    const w = createChatHistoryWatcher({
      targets: [cursorTarget('/p')], // no extractor — fingerprinted every read
      onEvent,
      onSchemaUnknown,
      watchFn: watchFn as never,
      readItemTableFn,
      debounceMs: 1,
    });
    w.start();
    await new Promise((r) => setTimeout(r, 15)); // initial read: unknown -> notify once
    // Three more spaced fs.watch fires (beyond the debounce so they don't coalesce).
    for (let i = 0; i < 3; i++) {
      createdWatchers[0]!.emit('change', 'change', '/p');
      await new Promise((r) => setTimeout(r, 15));
    }
    // Re-checked on every read (still unknown each time) ...
    expect(readItemTableFn.mock.calls.length).toBeGreaterThanOrEqual(4);
    // ... but surfaced to the user exactly once.
    expect(onSchemaUnknown).toHaveBeenCalledTimes(1);
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
    // Empty first read so the initial pass primes nothing — then the real
    // emit happens after a simulated change.
    readItemTableFn.mockResolvedValue([]);
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
    readItemTableFn.mockResolvedValue([{ key: 'k', value: 'v' }]);
    createdWatchers[0]!.emit('change', 'change', '/p');
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
    // Initial pass primes (empty), then files appear → emits.
    const fakeFiles = [
      { path: '/ws/a.json', parsed: { user_prompt: 'first' } },
      { path: '/ws/b.json', parsed: { user_prompt: 'second' } },
    ];
    const readWindsurfJsonFilesFn = vi.fn<ReadWindsurfJsonFilesFn>(async () => []);
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

    readWindsurfJsonFilesFn.mockResolvedValue(fakeFiles);
    createdWatchers[0]!.emit('change', 'change', '/ws');
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
    const readWindsurfJsonFilesFn = vi.fn<ReadWindsurfJsonFilesFn>(async () => []);
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

    // Initial pass primes (empty). Now the duplicate-file scenario appears.
    readWindsurfJsonFilesFn.mockResolvedValue(fakeFiles);
    createdWatchers[0]!.emit('change', 'change', '/ws');
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

  it('returns [] when the .vscdb path does not exist (host cleaned up workspace between activate and first read)', async () => {
    // Reproduces the live 2026-05-20 R3 finding: Cursor enumerated 4
    // workspaceStorage dirs at activate-time, then cleaned up two of them
    // before the debounced first read fired. The watcher previously threw
    // ENOENT through onError on every fire; now defaultReadItemTable treats
    // a missing main file as "no rows" so it never escalates.
    const missingPath = join(tmpDirPath, 'never-existed.vscdb');
    const rows = await defaultReadItemTable(missingPath);
    expect(rows).toEqual([]);
  });

  it('returns [] when the .vscdb is deleted between existsSync and copyFile (race)', async () => {
    // Simulates the existsSync→copyFile race window. We delete the file
    // through a wrapped readItemTable that runs deletion just before the
    // copy. Here we use a more straightforward approach: create the file,
    // then move it aside on the same tick the read starts. The real race
    // happens at the OS level when Cursor's cleanup overlaps with our read.
    const dbPath = await createTestVscdb('race.vscdb', [
      { key: 'aiService.prompts', value: '[]' },
    ]);
    // Read once to verify happy path.
    expect(await defaultReadItemTable(dbPath)).toHaveLength(1);
    // Delete and read again — second read should return [] cleanly.
    rmSync(dbPath, { force: true });
    expect(await defaultReadItemTable(dbPath)).toEqual([]);
  });
});
