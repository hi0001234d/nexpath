import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { logger } from '../logger.js';
import { TELEMETRY_PATH, TELEMETRY_ROTATED_PATH } from './paths.js';
import { loadCursor } from './TelemetryCursor.js';
import type { CursorState, TelemetryEvent } from './types.js';

export interface ReadOptions {
  liveLogPath?:    string;
  rotatedLogPath?: string;
  cursorPath?:     string;
}

export interface ReadResult {
  events:    TelemetryEvent[];
  newOffset: number;
  newInode:  number;
  rotated:   boolean;
}

const EMPTY_RESULT: ReadResult = { events: [], newOffset: 0, newInode: 0, rotated: false };

export function readNewEvents(opts: ReadOptions = {}): ReadResult {
  const livePath = opts.liveLogPath ?? TELEMETRY_PATH;
  const rotPath  = opts.rotatedLogPath ?? TELEMETRY_ROTATED_PATH;

  const liveStat = safeStat(livePath);
  if (!liveStat) return EMPTY_RESULT;

  const cursor = loadCursor(opts.cursorPath);

  if (cursor === null) {
    return readWholeFile(livePath, liveStat.ino, liveStat.size);
  }

  if (cursor.inode !== liveStat.ino) {
    return readAcrossRotation(cursor, rotPath, livePath, liveStat.ino, liveStat.size);
  }

  const startOffset = liveStat.size < cursor.offset ? 0 : cursor.offset;
  return readForward(livePath, startOffset, liveStat.size, liveStat.ino, false);
}

function readWholeFile(path: string, inode: number, size: number): ReadResult {
  return readForward(path, 0, size, inode, false);
}

function readAcrossRotation(
  cursor:   CursorState,
  rotPath:  string,
  livePath: string,
  liveInode: number,
  liveSize:  number,
): ReadResult {
  const events: TelemetryEvent[] = [];

  const rotStat = safeStat(rotPath);
  if (rotStat && rotStat.ino === cursor.inode && rotStat.size > cursor.offset) {
    const drained = readAndParse(rotPath, cursor.offset, rotStat.size);
    events.push(...drained.events);
  }

  const liveTail = readAndParse(livePath, 0, liveSize);
  events.push(...liveTail.events);

  return {
    events,
    newOffset: liveTail.consumedTo,
    newInode:  liveInode,
    rotated:   true,
  };
}

function readForward(
  path:    string,
  start:   number,
  end:     number,
  inode:   number,
  rotated: boolean,
): ReadResult {
  if (end <= start) {
    return { events: [], newOffset: start, newInode: inode, rotated };
  }
  const result = readAndParse(path, start, end);
  return {
    events:    result.events,
    newOffset: result.consumedTo,
    newInode:  inode,
    rotated,
  };
}

function safeStat(path: string): { ino: number; size: number } | null {
  try {
    const s = statSync(path);
    return { ino: s.ino, size: s.size };
  } catch {
    return null;
  }
}

interface ParseResult {
  events:     TelemetryEvent[];
  consumedTo: number;
}

function readAndParse(path: string, start: number, end: number): ParseResult {
  if (end <= start) return { events: [], consumedTo: start };

  let data = '';
  try {
    const fd = openSync(path, 'r');
    try {
      const buf = Buffer.alloc(end - start);
      readSync(fd, buf, 0, end - start, start);
      data = buf.toString('utf8');
    } finally {
      closeSync(fd);
    }
  } catch {
    return { events: [], consumedTo: start };
  }

  const lastNewline = data.lastIndexOf('\n');
  if (lastNewline === -1) {
    return { events: [], consumedTo: start };
  }

  const completeData = data.slice(0, lastNewline + 1);
  const consumedBytes = Buffer.byteLength(completeData, 'utf8');

  const events: TelemetryEvent[] = [];
  for (const line of completeData.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as TelemetryEvent);
    } catch {
      try {
        logger.debug('telemetry_reader_malformed_line', { sample: trimmed.slice(0, 80) });
      } catch {
        // logger may be uninitialised in some contexts — never crash
      }
    }
  }

  return { events, consumedTo: start + consumedBytes };
}
