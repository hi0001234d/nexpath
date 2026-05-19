import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCursor, saveCursor, clearCursor } from './TelemetryCursor.js';
import type { CursorState } from './types.js';

let tmpDir: string;
let cursorPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'nexpath-cursor-'));
  cursorPath = join(tmpDir, 'cursor.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('TelemetryCursor — loadCursor', () => {
  it('returns null when cursor file does not exist (clean state)', () => {
    expect(loadCursor(cursorPath)).toBeNull();
  });

  it('returns cursor state when valid file exists', () => {
    const state: CursorState = { inode: 12345, offset: 67890, last_synced_ts: '2026-05-19T10:00:00.000Z' };
    writeFileSync(cursorPath, JSON.stringify(state), 'utf8');
    expect(loadCursor(cursorPath)).toEqual(state);
  });

  it('returns null when cursor file is corrupt JSON', () => {
    writeFileSync(cursorPath, 'not-json-{}{', 'utf8');
    expect(loadCursor(cursorPath)).toBeNull();
  });

  it('returns null when cursor file is missing required fields', () => {
    writeFileSync(cursorPath, JSON.stringify({ last_synced_ts: null }), 'utf8');
    expect(loadCursor(cursorPath)).toBeNull();
  });

  it('normalises missing last_synced_ts to null', () => {
    writeFileSync(cursorPath, JSON.stringify({ inode: 1, offset: 2 }), 'utf8');
    expect(loadCursor(cursorPath)).toEqual({ inode: 1, offset: 2, last_synced_ts: null });
  });
});

describe('TelemetryCursor — saveCursor', () => {
  it('writes valid cursor state to disk', () => {
    const state: CursorState = { inode: 1, offset: 2, last_synced_ts: '2026-05-19T10:00:00.000Z' };
    saveCursor(state, cursorPath);
    expect(existsSync(cursorPath)).toBe(true);
    const reloaded = JSON.parse(readFileSync(cursorPath, 'utf8'));
    expect(reloaded).toEqual(state);
  });

  it('creates parent directory if missing', () => {
    const nestedPath = join(tmpDir, 'sub', 'dir', 'cursor.json');
    saveCursor({ inode: 1, offset: 0, last_synced_ts: null }, nestedPath);
    expect(existsSync(nestedPath)).toBe(true);
  });

  it('persists across simulated restart — save → load returns identical state', () => {
    const state: CursorState = { inode: 99, offset: 1024, last_synced_ts: '2026-05-19T11:30:00.000Z' };
    saveCursor(state, cursorPath);
    expect(loadCursor(cursorPath)).toEqual(state);
  });

  it('does not throw when write fails (read-only dir)', () => {
    const bogusPath = '/nonexistent/readonly/cursor.json';
    expect(() => saveCursor({ inode: 1, offset: 0, last_synced_ts: null }, bogusPath)).not.toThrow();
  });
});

describe('TelemetryCursor — clearCursor', () => {
  it('removes existing cursor file', () => {
    writeFileSync(cursorPath, JSON.stringify({ inode: 1, offset: 2, last_synced_ts: null }), 'utf8');
    clearCursor(cursorPath);
    expect(existsSync(cursorPath)).toBe(false);
  });

  it('is silent when cursor file does not exist', () => {
    expect(() => clearCursor(cursorPath)).not.toThrow();
  });
});
