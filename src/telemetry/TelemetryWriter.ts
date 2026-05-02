import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { TelemetryEventName } from './types.js';

export const TELEMETRY_PATH = join(homedir(), '.nexpath', 'telemetry.jsonl');
const MAX_BYTES = 5 * 1024 * 1024;

function rotate(): void {
  try {
    if (!existsSync(TELEMETRY_PATH)) {
      mkdirSync(dirname(TELEMETRY_PATH), { recursive: true });
      return;
    }
    if (statSync(TELEMETRY_PATH).size > MAX_BYTES) {
      renameSync(TELEMETRY_PATH, `${TELEMETRY_PATH}.1`);
    }
  } catch {
    // rotation failure is non-fatal
  }
}

export function writeTelemetry(
  projectRoot: string,
  event:       TelemetryEventName,
  data?:       Record<string, unknown>,
): void {
  const record = {
    ts: new Date().toISOString(),
    v:  1 as const,
    projectRoot,
    event,
    ...data,
  };

  try {
    rotate();
    appendFileSync(TELEMETRY_PATH, JSON.stringify(record) + '\n', 'utf8');
  } catch {
    // write failure must never crash the hook
  }
}
