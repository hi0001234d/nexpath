import { homedir } from 'node:os';
import { join } from 'node:path';

export const TELEMETRY_DIR = join(homedir(), '.nexpath');
export const TELEMETRY_PATH = join(TELEMETRY_DIR, 'telemetry.jsonl');
export const TELEMETRY_ROTATED_PATH = `${TELEMETRY_PATH}.1`;
export const TELEMETRY_SYNC_CURSOR_PATH = join(TELEMETRY_DIR, 'telemetry-sync-cursor.json');
export const TELEMETRY_SYNC_STATE_PATH = join(TELEMETRY_DIR, 'telemetry-sync-state.json');
