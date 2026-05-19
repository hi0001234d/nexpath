import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { TelemetryEventName } from './types.js';
import type { Store } from '../store/db.js';
import { getConfig } from '../store/config.js';
import { getInstallationId, getUserId, getTeamId } from './identity.js';

export const TELEMETRY_PATH = join(homedir(), '.nexpath', 'telemetry.jsonl');
const MAX_BYTES = 5 * 1024 * 1024;

// Module-level cache for the telemetry.enabled config value.
// Avoids a per-write SQL read; honours fail-open semantics if reading fails.
let _enabledCache: string | null = null;

function isEnabled(store?: Store): boolean {
  // No store available (e.g. inner runLevel call sites until Phase 3) →
  // fail-open: we cannot check the gate, so allow the write.
  if (!store) return true;
  if (_enabledCache !== null) return _enabledCache !== 'false';
  try {
    const v = getConfig(store.db, 'telemetry.enabled') ?? 'true';
    _enabledCache = v;
    return v !== 'false';
  } catch {
    // Config read failed — never crash the hook; default to enabled.
    return true;
  }
}

// Test-only — wipes the module-level cache so per-test isolation works.
export function _resetEnabledCache(): void {
  _enabledCache = null;
}

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
  store?:      Store,
): void {
  if (!isEnabled(store)) return;   // silent skip when telemetry.enabled = 'false'

  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    v:  1 as const,
    projectRoot,
    event,
    ...data,
  };

  if (store) {
    try {
      record['installationId'] = getInstallationId(store);
      record['userId']         = getUserId(store);
      record['teamId']         = getTeamId(store);
    } catch {
      // identity-read failure must never crash the hook — fall through without IDs
    }
  }

  try {
    rotate();
    appendFileSync(TELEMETRY_PATH, JSON.stringify(record) + '\n', 'utf8');
  } catch {
    // write failure must never crash the hook
  }
}
