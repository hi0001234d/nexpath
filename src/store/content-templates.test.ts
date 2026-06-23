import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openStore, type Store } from './db.js';
import { migrate, applyIncrementalMigrations, SCHEMA_VERSION } from './schema.js';
import {
  upsertContentTemplate,
  getContentTemplate,
  deleteContentTemplate,
} from './content-templates.js';

function tableExists(store: Store, name: string): boolean {
  const res = store.db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
    [name],
  );
  return (res[0]?.values?.length ?? 0) > 0;
}

function columnsOf(store: Store, table: string): string[] {
  const res = store.db.exec(`PRAGMA table_info(${table})`);
  return (res[0]?.values ?? []).map((r) => r[1] as string);
}

describe('schema — versioned tables', () => {
  let store: Store;
  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('creates the content_templates and user_depth_level tables on migrate', () => {
    expect(tableExists(store, 'content_templates')).toBe(true);
    expect(tableExists(store, 'user_depth_level')).toBe(true);
  });

  it('is idempotent — re-running migrate + incremental migrations does not throw', () => {
    expect(() => {
      migrate(store.db);
      applyIncrementalMigrations(store.db);
      migrate(store.db);
    }).not.toThrow();
    expect(tableExists(store, 'content_templates')).toBe(true);
    expect(tableExists(store, 'user_depth_level')).toBe(true);
  });

  it('content_templates has the planned columns', () => {
    expect(columnsOf(store, 'content_templates')).toEqual([
      'project_root', 'signal_type', 'source', 'record_json', 'schema_version', 'created_at', 'updated_at',
    ]);
  });

  it('user_depth_level has the planned columns', () => {
    expect(columnsOf(store, 'user_depth_level')).toEqual([
      'project_root', 'current_level', 'stability_counter', 'last_graduation_at', 'hysteresis_counter', 'schema_version', 'updated_at',
    ]);
  });
});

describe('content-templates persistence', () => {
  let store: Store;
  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('round-trips a record and stamps the current schema_version', () => {
    const record = { signalType: 'ABSENCE_SPEC_ACCEPTANCE', levelForms: { 5: { L1: 'x' } } };
    upsertContentTemplate(store, {
      projectRoot: '/proj', signalType: 'ABSENCE_SPEC_ACCEPTANCE', source: 'autogen', record, now: 100,
    });

    const got = getContentTemplate(store.db, '/proj', 'ABSENCE_SPEC_ACCEPTANCE', 'autogen');
    expect(got).not.toBeNull();
    expect(got!.record).toEqual(record);
    expect(got!.source).toBe('autogen');
    expect(got!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(got!.createdAt).toBe(100);
  });

  it('returns null for an absent record', () => {
    expect(getContentTemplate(store.db, '/proj', 'NOPE', 'autogen')).toBeNull();
  });

  it('upsert replaces the record for the same (project_root, signal_type, source) key', () => {
    const key = { projectRoot: '/p', signalType: 'S', source: 'uploaded' as const };
    upsertContentTemplate(store, { ...key, record: { v: 1 }, now: 1 });
    upsertContentTemplate(store, { ...key, record: { v: 2 }, now: 2 });
    const got = getContentTemplate(store.db, '/p', 'S', 'uploaded');
    expect(got!.record).toEqual({ v: 2 });
    expect(got!.updatedAt).toBe(2);
  });

  it('keeps distinct source rows for the same (project_root, signal_type)', () => {
    upsertContentTemplate(store, { projectRoot: '/p', signalType: 'S', source: 'uploaded', record: { who: 'user' } });
    upsertContentTemplate(store, { projectRoot: '/p', signalType: 'S', source: 'autogen', record: { who: 'gen' } });
    expect(getContentTemplate(store.db, '/p', 'S', 'uploaded')!.record).toEqual({ who: 'user' });
    expect(getContentTemplate(store.db, '/p', 'S', 'autogen')!.record).toEqual({ who: 'gen' });
  });

  it('accepts a row written by an older schema_version (<= current)', () => {
    // An older writer (schema_version below current) must still be read — the
    // reader accepts any row whose version is <= the current SCHEMA_VERSION.
    store.db.run(
      `INSERT INTO content_templates
         (project_root, signal_type, source, record_json, schema_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['/p', 'S', 'autogen', JSON.stringify({ old: true }), SCHEMA_VERSION - 1, 1, 1],
    );
    const got = getContentTemplate(store.db, '/p', 'S', 'autogen');
    expect(got).not.toBeNull();
    expect(got!.record).toEqual({ old: true });
    expect(got!.schemaVersion).toBe(SCHEMA_VERSION - 1);
  });

  it('ignores a row written by a newer schema_version (forward-compatible read)', () => {
    // Simulate a future writer by inserting a row directly with a higher version.
    store.db.run(
      `INSERT INTO content_templates
         (project_root, signal_type, source, record_json, schema_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['/p', 'S', 'autogen', JSON.stringify({ future: true }), SCHEMA_VERSION + 1, 1, 1],
    );
    expect(getContentTemplate(store.db, '/p', 'S', 'autogen')).toBeNull();
  });

  it('treats a corrupt payload as absent rather than crashing', () => {
    store.db.run(
      `INSERT INTO content_templates
         (project_root, signal_type, source, record_json, schema_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['/p', 'S', 'autogen', '{not valid json', SCHEMA_VERSION, 1, 1],
    );
    expect(getContentTemplate(store.db, '/p', 'S', 'autogen')).toBeNull();
  });

  it('deletes a record', () => {
    upsertContentTemplate(store, { projectRoot: '/p', signalType: 'S', source: 'autogen', record: { a: 1 } });
    deleteContentTemplate(store, '/p', 'S', 'autogen');
    expect(getContentTemplate(store.db, '/p', 'S', 'autogen')).toBeNull();
  });
});
