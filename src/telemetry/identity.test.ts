import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openStore, type Store } from '../store/db.js';
import { isConfigSet, getConfig } from '../store/config.js';
import {
  getInstallationId,
  getUserId,
  getTeamId,
  _resetIdentityCache,
} from './identity.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('telemetry — identity', () => {
  let store: Store;

  beforeEach(async () => {
    _resetIdentityCache();
    store = await openStore(':memory:');
  });

  afterEach(() => {
    store.db.close();
    _resetIdentityCache();
  });

  it('getInstallationId generates a UUID, persists it to config, and returns it', () => {
    expect(isConfigSet(store.db, 'installation_id')).toBe(false);
    const id = getInstallationId(store);
    expect(id).toMatch(UUID_V4);
    expect(isConfigSet(store.db, 'installation_id')).toBe(true);
    expect(getConfig(store.db, 'installation_id')).toBe(id);
  });

  it('second call returns the cached value without regenerating', () => {
    const first  = getInstallationId(store);
    const second = getInstallationId(store);
    expect(first).toBe(second);
  });

  it('existing config value is returned without regeneration', () => {
    // Manually plant a known ID in config — should be picked up, not overwritten.
    const planted = '11111111-2222-4333-8444-555555555555';
    store.db.run(
      'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      ['installation_id', planted],
    );
    expect(getInstallationId(store)).toBe(planted);
  });

  it('after cache reset, value is re-read from config (not regenerated)', () => {
    const first = getInstallationId(store);
    _resetIdentityCache();
    const second = getInstallationId(store);
    expect(second).toBe(first);
  });

  it('getUserId behaves identically — generates, persists, caches', () => {
    expect(isConfigSet(store.db, 'user_id')).toBe(false);
    const a = getUserId(store);
    const b = getUserId(store);
    expect(a).toMatch(UUID_V4);
    expect(a).toBe(b);
    expect(getConfig(store.db, 'user_id')).toBe(a);
  });

  it('getTeamId behaves identically — generates, persists, caches', () => {
    expect(isConfigSet(store.db, 'team_id')).toBe(false);
    const a = getTeamId(store);
    const b = getTeamId(store);
    expect(a).toMatch(UUID_V4);
    expect(a).toBe(b);
    expect(getConfig(store.db, 'team_id')).toBe(a);
  });

  it('installation/user/team IDs are independent values', () => {
    const inst = getInstallationId(store);
    const user = getUserId(store);
    const team = getTeamId(store);
    expect(new Set([inst, user, team]).size).toBe(3);
  });

  it('IDs persist across a simulated process restart (cache reset + same DB)', async () => {
    const inst = getInstallationId(store);
    const user = getUserId(store);
    const team = getTeamId(store);

    // Simulate restart — fresh cache, but config is still in :memory: store.
    _resetIdentityCache();

    expect(getInstallationId(store)).toBe(inst);
    expect(getUserId(store)).toBe(user);
    expect(getTeamId(store)).toBe(team);
  });
});
