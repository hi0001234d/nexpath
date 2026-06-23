import { describe, it, expect } from 'vitest';
import { openStore, type Store } from './db.js';
import { migrate, SCHEMA_VERSION } from './schema.js';
import {
  getUserDepthLevel,
  listUserDepthLevels,
  upsertUserDepthLevel,
  type UserDepthRow,
} from './user-depth-level.js';

const NOW = 1_700_000_000_000;

function row(projectRoot: string, currentLevel: number, extra: Partial<UserDepthRow> = {}): UserDepthRow {
  return {
    projectRoot,
    currentLevel,
    stabilityCounter: 0,
    hysteresisCounter: 0,
    lastGraduationAt: null,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: NOW,
    ...extra,
  };
}

async function mem(): Promise<Store> {
  return openStore(':memory:');
}

describe('user-depth-level — CRUD', () => {
  it('round-trips a row and stamps schema_version', async () => {
    const store = await mem();
    upsertUserDepthLevel(store, row('/p', 3, { stabilityCounter: 1, lastGraduationAt: NOW }));
    const got = getUserDepthLevel(store, '/p');
    expect(got?.currentLevel).toBe(3);
    expect(got?.stabilityCounter).toBe(1);
    expect(got?.lastGraduationAt).toBe(NOW);
    expect(got?.schemaVersion).toBe(SCHEMA_VERSION);
    store.db.close();
  });

  it('upsert updates the existing row on conflict (project_root key)', async () => {
    const store = await mem();
    upsertUserDepthLevel(store, row('/p', 2));
    upsertUserDepthLevel(store, row('/p', 4, { hysteresisCounter: 2 }));
    const got = getUserDepthLevel(store, '/p');
    expect(got?.currentLevel).toBe(4);
    expect(got?.hysteresisCounter).toBe(2);
    expect(listUserDepthLevels(store)).toHaveLength(1); // updated, not duplicated
    store.db.close();
  });

  it('returns null for an unknown project; lists all rows', async () => {
    const store = await mem();
    expect(getUserDepthLevel(store, '/none')).toBeNull();
    upsertUserDepthLevel(store, row('/a', 2));
    upsertUserDepthLevel(store, row('/b', 5));
    expect(listUserDepthLevels(store).map((r) => r.currentLevel).sort()).toEqual([2, 5]);
    store.db.close();
  });

  it('the table is created by migrate and re-running it is idempotent (CREATE IF NOT EXISTS)', async () => {
    const store = await mem();
    upsertUserDepthLevel(store, row('/p', 3));
    // Re-running migrate must not error nor drop the existing row.
    expect(() => migrate(store.db)).not.toThrow();
    expect(getUserDepthLevel(store, '/p')?.currentLevel).toBe(3);
    store.db.close();
  });
});
