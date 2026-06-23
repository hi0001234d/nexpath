import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appendFileSync, writeFileSync, existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, type Store } from '../store/db.js';
import { SCHEMA_VERSION } from '../store/schema.js';
import { deleteAllPrompts } from '../store/prompts.js';
import {
  appendParamEvent,
  appendParamEvents,
  readParamEvents,
  paramEventsPathFor,
  type ParamEventInput,
} from './param-events.js';
import { detectSignals, detectSignalsByChannel } from '../classifier/signals.js';
import { SessionStateManager } from '../classifier/SessionStateManager.js';
import type { ClassificationResult, Stage } from '../classifier/types.js';
import type { StreamBPresenceResult } from '../classifier/StreamBPresenceClassifier.js';

function makeResult(stage: Stage, confidence: number): ClassificationResult {
  return { stage, confidence, tier: 1, allScores: { [stage]: confidence } };
}

function ev(over: Partial<ParamEventInput> = {}): ParamEventInput {
  return {
    projectRoot: '/p',
    sessionId: 's1',
    promptIndex: 0,
    signalKey: 'spec_before_code',
    channel: 'keyword',
    stage: 'implementation',
    stageConfidence: 0.9,
    source: 'live',
    ...over,
  };
}

function rawRow(schemaVersion: number): Record<string, unknown> {
  return {
    schemaVersion, ts: 1, projectRoot: '/p', sessionId: 's', promptIndex: 0,
    signalKey: 'k', channel: 'keyword', stage: null, stageConfidence: null,
    source: 'historical_import',
  };
}

// ── Disk-backed store (real temp dir; param-events.jsonl colocated with the db) ──
describe('param-events — disk-backed store', () => {
  let store: Store;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexpath-pe-'));
    store = await openStore(join(tmpDir, 'prompt-store.db'));
  });
  afterEach(() => {
    store.db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trips an event and stamps schemaVersion', () => {
    appendParamEvent(store, ev({ ts: 123 }));
    const rows = readParamEvents(store);
    expect(rows).toHaveLength(1);
    expect(rows[0].signalKey).toBe('spec_before_code');
    expect(rows[0].channel).toBe('keyword');
    expect(rows[0].schemaVersion).toBe(SCHEMA_VERSION);
    expect(rows[0].ts).toBe(123);
    expect(rows[0].source).toBe('live');
  });

  it('appends many events in order', () => {
    appendParamEvents(store, [ev({ promptIndex: 0 }), ev({ promptIndex: 1, signalKey: 'test_creation' })]);
    expect(readParamEvents(store).map((r) => r.signalKey)).toEqual(['spec_before_code', 'test_creation']);
  });

  it('appendParamEvents([]) is a no-op', () => {
    appendParamEvents(store, []);
    expect(readParamEvents(store)).toEqual([]);
  });

  it('filters by projectRoot', () => {
    appendParamEvents(store, [ev({ projectRoot: '/a' }), ev({ projectRoot: '/b' })]);
    const a = readParamEvents(store, '/a');
    expect(a).toHaveLength(1);
    expect(a[0].projectRoot).toBe('/a');
  });

  it('stores NO prompt text — only the declared fields (PII-safe)', () => {
    appendParamEvent(store, ev());
    const raw = readFileSync(paramEventsPathFor(store)!, 'utf8').trim();
    const keys = Object.keys(JSON.parse(raw)).sort();
    expect(keys).toEqual(
      ['channel', 'projectRoot', 'promptIndex', 'schemaVersion', 'sessionId', 'signalKey', 'source', 'stage', 'stageConfidence', 'ts'].sort(),
    );
    expect(raw).not.toContain('promptText');
  });

  it('reader accepts schemaVersion <= current and ignores a newer row', () => {
    appendParamEvent(store, ev());                                  // current
    const path = paramEventsPathFor(store)!;
    appendFileSync(path, JSON.stringify(rawRow(SCHEMA_VERSION - 1)) + '\n');  // older → accepted
    appendFileSync(path, JSON.stringify(rawRow(SCHEMA_VERSION + 1)) + '\n');  // newer → ignored
    const versions = readParamEvents(store).map((r) => r.schemaVersion);
    expect(versions).toContain(SCHEMA_VERSION);
    expect(versions).toContain(SCHEMA_VERSION - 1);
    expect(versions).not.toContain(SCHEMA_VERSION + 1);
  });

  it('reader skips a corrupt line without crashing', () => {
    appendParamEvent(store, ev());
    appendFileSync(paramEventsPathFor(store)!, '{not valid json\n');
    expect(readParamEvents(store)).toHaveLength(1);
  });

  it('rotates the log once it passes ~5 MB', () => {
    const path = paramEventsPathFor(store)!;
    writeFileSync(path, 'x'.repeat(5 * 1024 * 1024 + 16), 'utf8');
    appendParamEvent(store, ev());
    expect(existsSync(`${path}.1`)).toBe(true);
  });

  it('events survive prompt-table eviction (separate file, FIFO-independent)', () => {
    appendParamEvent(store, ev());
    deleteAllPrompts(store);
    expect(readParamEvents(store)).toHaveLength(1);
  });

  it('is fail-open — an unwritable target path never throws', () => {
    // Parent is a regular file, so the events dir cannot be created → write fails.
    const filePath = join(tmpDir, 'a-file');
    writeFileSync(filePath, 'x', 'utf8');
    const badStore = { db: store.db, dbPath: join(filePath, 'nested', 'prompt-store.db'), _releaseLock: () => {} } as Store;
    expect(() => appendParamEvent(badStore, ev())).not.toThrow();
    expect(readParamEvents(badStore)).toEqual([]);
  });
});

// ── In-memory store (tests / no disk) ───────────────────────────────────────────
describe('param-events — in-memory store', () => {
  it('paramEventsPathFor is null; writes/reads are no-ops', async () => {
    const store = await openStore(':memory:');
    expect(paramEventsPathFor(store)).toBeNull();
    appendParamEvent(store, ev());           // no-op, must not throw
    appendParamEvents(store, [ev(), ev()]);  // no-op
    expect(readParamEvents(store)).toEqual([]);
    store.db.close();
  });
});

// ── Live emission from processPrompt ────────────────────────────────────────────
describe('param-events — live emission via processPrompt', () => {
  let store: Store;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexpath-pe-live-'));
    store = await openStore(join(tmpDir, 'prompt-store.db'));
  });
  afterEach(() => {
    store.db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('records a live event per detected signal (channel + stage + source=live)', () => {
    const prompt = 'can you double check this implementation';   // → cross_confirming (keyword)
    expect(detectSignals(prompt)).toContain('cross_confirming');

    const mgr = SessionStateManager.load(store, '/test/project');
    mgr.processPrompt(store, prompt, makeResult('implementation', 0.9));

    const rows = readParamEvents(store, mgr.current.projectRoot);
    const cc = rows.find((r) => r.signalKey === 'cross_confirming');
    expect(cc).toBeDefined();
    expect(cc!.channel).toBe('keyword');
    expect(cc!.source).toBe('live');
    expect(cc!.stage).toBe('implementation');
    expect(cc!.promptIndex).toBe(0);
  });

  it('records a stream_b-channel event for a Stream-B-asserted signal', () => {
    const overrides: StreamBPresenceResult = {
      feature_scope_before_build: true,
      implementation_checkpoint:  false,
      spec_before_code:           false,
    };
    const mgr = SessionStateManager.load(store, '/test/project');
    mgr.processPrompt(store, 'a neutral prompt with no keywords', makeResult('implementation', 0.9), undefined, undefined, overrides);

    const sb = readParamEvents(store, mgr.current.projectRoot).find((r) => r.signalKey === 'feature_scope_before_build');
    expect(sb).toBeDefined();
    expect(sb!.channel).toBe('stream_b');
    expect(sb!.source).toBe('live');
  });

  it('applyStage2SignalUpdates records stage2-channel events', () => {
    const mgr = SessionStateManager.load(store, '/test/project');
    mgr.processPrompt(store, 'working on the module', makeResult('implementation', 0.9));
    mgr.applyStage2SignalUpdates(store, ['spec_before_code']);

    const s2 = readParamEvents(store, mgr.current.projectRoot).find((r) => r.channel === 'stage2');
    expect(s2).toBeDefined();
    expect(s2!.signalKey).toBe('spec_before_code');
    expect(s2!.source).toBe('live');
  });
});

describe('detectSignalsByChannel', () => {
  it('tags a full-keyword match as keyword', () => {
    const r = detectSignalsByChannel('please double check this');
    expect(r.some((d) => d.key === 'cross_confirming' && d.channel === 'keyword')).toBe(true);
  });

  it('tags a 2+ vibe-keyword match (no full keyword) as vibe', () => {
    const r = detectSignalsByChannel('wait is this right and does this look good');
    expect(r.some((d) => d.key === 'cross_confirming' && d.channel === 'vibe')).toBe(true);
  });

  it('detectSignals returns the same keys as detectSignalsByChannel', () => {
    const t = 'please double check this implementation';
    expect(detectSignals(t)).toEqual(detectSignalsByChannel(t).map((d) => d.key));
  });
});
