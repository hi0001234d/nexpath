import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, appendFileSync, statSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readNewEvents } from './TelemetryReader.js';
import { saveCursor } from './TelemetryCursor.js';

let tmpDir: string;
let livePath: string;
let rotPath: string;
let cursorPath: string;

function writeLine(path: string, obj: Record<string, unknown>): void {
  appendFileSync(path, JSON.stringify(obj) + '\n', 'utf8');
}

function sampleEvent(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ts: '2026-05-19T10:00:00.000Z',
    v: 1,
    projectRoot: '/tmp/proj',
    event: name,
    ...extra,
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'nexpath-reader-'));
  livePath = join(tmpDir, 'telemetry.jsonl');
  rotPath = `${livePath}.1`;
  cursorPath = join(tmpDir, 'cursor.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('TelemetryReader — file does not exist', () => {
  it('returns empty result when telemetry file is missing', () => {
    const result = readNewEvents({ liveLogPath: livePath, rotatedLogPath: rotPath, cursorPath });
    expect(result.events).toEqual([]);
    expect(result.newOffset).toBe(0);
    expect(result.rotated).toBe(false);
  });
});

describe('TelemetryReader — first run (no cursor)', () => {
  it('reads all events from the start when cursor is missing', () => {
    writeLine(livePath, sampleEvent('prompt_received', { promptCount: 1 }));
    writeLine(livePath, sampleEvent('prompt_classified', { stage: 'planning' }));

    const result = readNewEvents({ liveLogPath: livePath, rotatedLogPath: rotPath, cursorPath });
    expect(result.events).toHaveLength(2);
    expect(result.events[0].event).toBe('prompt_received');
    expect(result.events[1].event).toBe('prompt_classified');
    expect(result.newOffset).toBe(statSync(livePath).size);
    expect(result.rotated).toBe(false);
  });

  it('returns empty events when file exists but is empty', () => {
    writeFileSync(livePath, '', 'utf8');
    const result = readNewEvents({ liveLogPath: livePath, rotatedLogPath: rotPath, cursorPath });
    expect(result.events).toEqual([]);
    expect(result.newOffset).toBe(0);
  });
});

describe('TelemetryReader — cursor advances incrementally', () => {
  it('reads only new events appended after the previous offset', () => {
    writeLine(livePath, sampleEvent('prompt_received', { promptCount: 1 }));
    const firstSize = statSync(livePath).size;
    const inode = statSync(livePath).ino;

    saveCursor({ inode, offset: firstSize, last_synced_ts: null }, cursorPath);

    writeLine(livePath, sampleEvent('prompt_classified', { stage: 'planning' }));
    writeLine(livePath, sampleEvent('profile_computed', { profile: 'cool_geek' }));

    const result = readNewEvents({ liveLogPath: livePath, rotatedLogPath: rotPath, cursorPath });
    expect(result.events).toHaveLength(2);
    expect(result.events.map(e => e.event)).toEqual(['prompt_classified', 'profile_computed']);
    expect(result.newOffset).toBe(statSync(livePath).size);
    expect(result.rotated).toBe(false);
  });

  it('returns empty events when no new bytes since last cursor', () => {
    writeLine(livePath, sampleEvent('prompt_received'));
    const size = statSync(livePath).size;
    const inode = statSync(livePath).ino;
    saveCursor({ inode, offset: size, last_synced_ts: null }, cursorPath);

    const result = readNewEvents({ liveLogPath: livePath, rotatedLogPath: rotPath, cursorPath });
    expect(result.events).toEqual([]);
    expect(result.newOffset).toBe(size);
  });
});

describe('TelemetryReader — rotation handling', () => {
  it('drains .1 first then reads new live file when inode differs', () => {
    writeLine(livePath, sampleEvent('prompt_received', { promptCount: 1 }));
    writeLine(livePath, sampleEvent('prompt_classified', { stage: 'planning' }));
    const oldStat = statSync(livePath);

    saveCursor(
      { inode: oldStat.ino, offset: oldStat.size, last_synced_ts: null },
      cursorPath,
    );

    writeLine(livePath, sampleEvent('profile_computed', { profile: 'hardcore_pro' }));
    const afterRotSize = statSync(livePath).size;
    renameSync(livePath, rotPath);

    writeLine(livePath, sampleEvent('absence_flags_detected', { flagType: 'missing_tests' }));

    const result = readNewEvents({ liveLogPath: livePath, rotatedLogPath: rotPath, cursorPath });

    expect(result.rotated).toBe(true);
    expect(result.events.map(e => e.event)).toEqual([
      'profile_computed',
      'absence_flags_detected',
    ]);
    expect(result.newOffset).toBe(statSync(livePath).size);
    expect(result.newInode).toBe(statSync(livePath).ino);
    expect(afterRotSize).toBeGreaterThan(oldStat.size);
  });

  it('handles rotation when .1 does not exist (only reads new live file)', () => {
    saveCursor(
      { inode: 999999, offset: 100, last_synced_ts: null },
      cursorPath,
    );

    writeLine(livePath, sampleEvent('prompt_received'));

    const result = readNewEvents({ liveLogPath: livePath, rotatedLogPath: rotPath, cursorPath });
    expect(result.rotated).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].event).toBe('prompt_received');
  });
});

describe('TelemetryReader — defensive behavior', () => {
  it('handles truncation: live size < cursor offset → reads from 0', () => {
    writeLine(livePath, sampleEvent('prompt_received'));
    const inode = statSync(livePath).ino;

    saveCursor(
      { inode, offset: 1_000_000, last_synced_ts: null },
      cursorPath,
    );

    const result = readNewEvents({ liveLogPath: livePath, rotatedLogPath: rotPath, cursorPath });
    expect(result.events).toHaveLength(1);
    expect(result.events[0].event).toBe('prompt_received');
  });

  it('does not advance past a partial (mid-write) trailing line', () => {
    writeLine(livePath, sampleEvent('prompt_received'));
    appendFileSync(livePath, '{"ts":"2026-05-19T10:00:00.000Z","v":1,"projectRoot":"/tmp","event":"prompt_class', 'utf8');
    const truncatedSize = statSync(livePath).size;

    const result = readNewEvents({ liveLogPath: livePath, rotatedLogPath: rotPath, cursorPath });
    expect(result.events).toHaveLength(1);
    expect(result.events[0].event).toBe('prompt_received');
    expect(result.newOffset).toBeLessThan(truncatedSize);
  });

  it('drops malformed JSON lines but keeps valid ones', () => {
    writeLine(livePath, sampleEvent('prompt_received'));
    appendFileSync(livePath, 'this-is-not-json{}{\n', 'utf8');
    writeLine(livePath, sampleEvent('prompt_classified', { stage: 'planning' }));

    const result = readNewEvents({ liveLogPath: livePath, rotatedLogPath: rotPath, cursorPath });
    expect(result.events.map(e => e.event)).toEqual(['prompt_received', 'prompt_classified']);
  });

  it('returns empty events when there is no complete line yet (only a partial)', () => {
    appendFileSync(livePath, '{"ts":"2026-05-19T10:00:00.000Z","v":1', 'utf8');

    const result = readNewEvents({ liveLogPath: livePath, rotatedLogPath: rotPath, cursorPath });
    expect(result.events).toEqual([]);
    expect(result.newOffset).toBe(0);
  });
});

describe('TelemetryReader — round-trip with cursor save', () => {
  it('after advancing cursor, second read returns only newly-appended events', () => {
    writeLine(livePath, sampleEvent('prompt_received', { promptCount: 1 }));
    writeLine(livePath, sampleEvent('prompt_classified', { stage: 'planning' }));

    const first = readNewEvents({ liveLogPath: livePath, rotatedLogPath: rotPath, cursorPath });
    expect(first.events).toHaveLength(2);

    saveCursor(
      { inode: first.newInode, offset: first.newOffset, last_synced_ts: '2026-05-19T10:00:00.000Z' },
      cursorPath,
    );

    writeLine(livePath, sampleEvent('profile_computed', { profile: 'cool_geek' }));

    const second = readNewEvents({ liveLogPath: livePath, rotatedLogPath: rotPath, cursorPath });
    expect(second.events).toHaveLength(1);
    expect(second.events[0].event).toBe('profile_computed');
  });
});
