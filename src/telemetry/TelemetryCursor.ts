import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { TELEMETRY_SYNC_CURSOR_PATH } from './paths.js';
import type { CursorState } from './types.js';

export function loadCursor(cursorPath: string = TELEMETRY_SYNC_CURSOR_PATH): CursorState | null {
  try {
    if (!existsSync(cursorPath)) return null;
    const raw = readFileSync(cursorPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CursorState>;
    if (typeof parsed.inode !== 'number' || typeof parsed.offset !== 'number') return null;
    return {
      inode:          parsed.inode,
      offset:         parsed.offset,
      last_synced_ts: typeof parsed.last_synced_ts === 'string' ? parsed.last_synced_ts : null,
    };
  } catch {
    return null;
  }
}

export function saveCursor(state: CursorState, cursorPath: string = TELEMETRY_SYNC_CURSOR_PATH): void {
  try {
    mkdirSync(dirname(cursorPath), { recursive: true });
    writeFileSync(cursorPath, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // Never throw — sync must not crash the host process.
  }
}

export function clearCursor(cursorPath: string = TELEMETRY_SYNC_CURSOR_PATH): void {
  try {
    if (existsSync(cursorPath)) rmSync(cursorPath);
  } catch {
    // silent
  }
}
