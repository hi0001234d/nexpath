import { randomUUID } from 'node:crypto';
import { getConfig, setConfig } from '../store/config.js';
import type { Store } from '../store/db.js';

const KEY_INSTALLATION = 'installation_id';
const KEY_USER         = 'user_id';
const KEY_TEAM         = 'team_id';

// Module-level cache — avoid repeated config reads per process.
let _installCache: string | null = null;
let _userCache:    string | null = null;
let _teamCache:    string | null = null;

function getOrCreate(
  store: Store,
  key:   string,
  cache: string | null,
): { value: string; cache: string } {
  if (cache) return { value: cache, cache };
  const existing = getConfig(store.db, key);
  if (existing) return { value: existing, cache: existing };
  const fresh = randomUUID();
  setConfig(store, key, fresh);
  return { value: fresh, cache: fresh };
}

export function getInstallationId(store: Store): string {
  const r = getOrCreate(store, KEY_INSTALLATION, _installCache);
  _installCache = r.cache;
  return r.value;
}

export function getUserId(store: Store): string {
  const r = getOrCreate(store, KEY_USER, _userCache);
  _userCache = r.cache;
  return r.value;
}

export function getTeamId(store: Store): string {
  const r = getOrCreate(store, KEY_TEAM, _teamCache);
  _teamCache = r.cache;
  return r.value;
}

// Test-only — clears module-level cache so per-test isolation works.
export function _resetIdentityCache(): void {
  _installCache = null;
  _userCache    = null;
  _teamCache    = null;
}
