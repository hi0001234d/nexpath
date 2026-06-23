import { homedir } from 'node:os';
import { join } from 'node:path';

export const TELEMETRY_DIR = join(homedir(), '.nexpath');
export const TELEMETRY_PATH = join(TELEMETRY_DIR, 'telemetry.jsonl');
export const TELEMETRY_ROTATED_PATH = `${TELEMETRY_PATH}.1`;
export const TELEMETRY_SYNC_CURSOR_PATH = join(TELEMETRY_DIR, 'telemetry-sync-cursor.json');
export const TELEMETRY_SYNC_STATE_PATH      = join(TELEMETRY_DIR, 'telemetry-sync-state.json');
export const TELEMETRY_SYNC_ERROR_LOG_PATH  = join(TELEMETRY_DIR, 'telemetry-sync-errors.log');

// Append-only param-detection log (local-only; NEVER synced server-side).
// The actual file lives next to the prompt-store DB; this is the default
// location (matches the default DB dir). See telemetry/param-events.ts.
export const PARAM_EVENTS_FILENAME = 'param-events.jsonl';
export const PARAM_EVENTS_PATH = join(TELEMETRY_DIR, PARAM_EVENTS_FILENAME);
