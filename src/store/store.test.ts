import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openStore, type Store } from './db.js';
import { insertPrompt, deleteProjectPrompts, deleteAllPrompts, pruneOlderThan, getPromptStats } from './prompts.js';
import { getConfig, setConfig, getAllConfig, isConfigSet } from './config.js';
import { redactSecrets } from './redact.js';
import {
  insertSkippedSession,
  getSkippedSessions,
  getSkippedSessionCount,
  deleteSkippedSession,
  deleteAllSkippedSessions,
} from './skipped-sessions.js';
import {
  upsertPendingAdvisory,
  getPendingAdvisory,
  markAdvisoryShown,
} from './pending-advisories.js';
import type { UpsertPendingAdvisoryInput } from './pending-advisories.js';

// ── redactSecrets ─────────────────────────────────────────────────────────────

describe('redactSecrets', () => {
  it('redacts sk- API keys', () => {
    const out = redactSecrets('key is sk-abc123def456ghi789jkl012mno');
    expect(out).toContain('sk-[REDACTED]');
    expect(out).not.toContain('sk-abc123');
  });

  it('redacts GitHub PATs (ghp_)', () => {
    const token = 'ghp_' + 'a'.repeat(36);
    const out = redactSecrets(`token: ${token}`);
    expect(out).toContain('ghp_[REDACTED]');
    expect(out).not.toContain('ghp_aaa');
  });

  it('redacts GitHub user tokens (ghu_)', () => {
    const token = 'ghu_' + 'b'.repeat(36);
    const out = redactSecrets(`auth: ${token}`);
    expect(out).toContain('ghu_[REDACTED]');
  });

  it('redacts Bearer tokens', () => {
    const out = redactSecrets('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload');
    expect(out).toContain('Bearer [REDACTED]');
    expect(out).not.toContain('eyJ');
  });

  it('redacts PEM private key blocks', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----';
    const out = redactSecrets(pem);
    expect(out).toContain('[PEM-REDACTED]');
    expect(out).not.toContain('BEGIN RSA PRIVATE KEY');
  });

  it('leaves clean prompt text unchanged', () => {
    const text = 'Please write a function that parses JSON from a file';
    expect(redactSecrets(text)).toBe(text);
  });
});

// ── Schema ────────────────────────────────────────────────────────────────────

describe('store — schema', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('creates the prompts table', () => {
    const res = store.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='prompts'");
    expect(res[0]?.values[0]?.[0]).toBe('prompts');
  });

  it('creates the config table', () => {
    const res = store.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='config'");
    expect(res[0]?.values[0]?.[0]).toBe('config');
  });

  it('creates the index on prompts(project_root, id)', () => {
    const res = store.db.exec("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_prompts_project_id'");
    expect(res[0]?.values[0]?.[0]).toBe('idx_prompts_project_id');
  });

  it('creates the skipped_sessions table', () => {
    const res = store.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='skipped_sessions'");
    expect(res[0]?.values[0]?.[0]).toBe('skipped_sessions');
  });

  it('creates the index on skipped_sessions(project_root, skipped_at)', () => {
    const res = store.db.exec("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_skipped_sessions_project'");
    expect(res[0]?.values[0]?.[0]).toBe('idx_skipped_sessions_project');
  });

  it('creates the pending_advisories table', () => {
    const res = store.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='pending_advisories'");
    expect(res[0]?.values[0]?.[0]).toBe('pending_advisories');
  });

  it('creates the index on pending_advisories(project_root, status, created_at)', () => {
    const res = store.db.exec("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_pending_advisories_project'");
    expect(res[0]?.values[0]?.[0]).toBe('idx_pending_advisories_project');
  });
});

// ── Prompt CRUD ───────────────────────────────────────────────────────────────

describe('store — prompt CRUD', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('inserts a prompt with correct fields', () => {
    insertPrompt(store, { projectRoot: '/proj/a', promptText: 'hello world', agent: 'claude-code' });
    const res = store.db.exec('SELECT project_root, prompt_text, agent FROM prompts');
    expect(res[0]?.values).toHaveLength(1);
    expect(res[0]?.values[0]).toEqual(['/proj/a', 'hello world', 'claude-code']);
  });

  it('captured_at is set to a timestamp close to Date.now()', () => {
    const before = Date.now();
    insertPrompt(store, { projectRoot: '/proj/a', promptText: 'ts test' });
    const after = Date.now();
    const res = store.db.exec('SELECT captured_at FROM prompts');
    const ts = res[0]?.values[0]?.[0] as number;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('agent is stored as null when omitted', () => {
    insertPrompt(store, { projectRoot: '/proj/a', promptText: 'no agent' });
    const res = store.db.exec('SELECT agent FROM prompts');
    expect(res[0]?.values[0]?.[0]).toBeNull();
  });

  it('redacts secrets before writing to disk', () => {
    insertPrompt(store, { projectRoot: '/proj/a', promptText: 'use sk-abc123def456ghi789jkl012mno please' });
    const res = store.db.exec('SELECT prompt_text FROM prompts');
    const stored = res[0]?.values[0]?.[0] as string;
    expect(stored).toContain('sk-[REDACTED]');
    expect(stored).not.toContain('sk-abc123');
  });

  it('deleteProjectPrompts removes only that project', () => {
    insertPrompt(store, { projectRoot: '/proj/a', promptText: 'a' });
    insertPrompt(store, { projectRoot: '/proj/b', promptText: 'b' });
    deleteProjectPrompts(store, '/proj/a');
    const res = store.db.exec('SELECT project_root FROM prompts');
    expect(res[0]?.values.map((r) => r[0])).toEqual(['/proj/b']);
  });

  it('deleteAllPrompts clears every row', () => {
    insertPrompt(store, { projectRoot: '/proj/a', promptText: 'a' });
    insertPrompt(store, { projectRoot: '/proj/b', promptText: 'b' });
    deleteAllPrompts(store);
    const res = store.db.exec('SELECT COUNT(*) FROM prompts');
    expect(res[0]?.values[0]?.[0]).toBe(0);
  });
});

// ── FIFO retention ────────────────────────────────────────────────────────────

describe('store — FIFO retention', () => {
  let store: Store;

  beforeEach(async () => {
    store = await openStore(':memory:');
    setConfig(store, 'prompt_store_max_per_project', '5');
  });
  afterEach(() => { store.db.close(); });

  it('caps prompts at max per project', () => {
    for (let i = 0; i < 7; i++) {
      insertPrompt(store, { projectRoot: '/proj/a', promptText: `p-${i}` });
    }
    const res = store.db.exec("SELECT COUNT(*) FROM prompts WHERE project_root='/proj/a'");
    expect(res[0]?.values[0]?.[0]).toBe(5);
  });

  it('drops the oldest prompts first (FIFO)', () => {
    for (let i = 0; i < 7; i++) {
      insertPrompt(store, { projectRoot: '/proj/a', promptText: `p-${i}` });
    }
    const res = store.db.exec("SELECT prompt_text FROM prompts WHERE project_root='/proj/a' ORDER BY id ASC");
    expect(res[0]?.values.map((r) => r[0])).toEqual(['p-2', 'p-3', 'p-4', 'p-5', 'p-6']);
  });

  it('does not drop prompts from other projects', () => {
    for (let i = 0; i < 7; i++) {
      insertPrompt(store, { projectRoot: '/proj/a', promptText: `a-${i}` });
    }
    insertPrompt(store, { projectRoot: '/proj/b', promptText: 'b-1' });
    const res = store.db.exec("SELECT COUNT(*) FROM prompts WHERE project_root='/proj/b'");
    expect(res[0]?.values[0]?.[0]).toBe(1);
  });

  it('unlimited when max is 0', () => {
    setConfig(store, 'prompt_store_max_per_project', '0');
    for (let i = 0; i < 10; i++) {
      insertPrompt(store, { projectRoot: '/proj/a', promptText: `p-${i}` });
    }
    const res = store.db.exec("SELECT COUNT(*) FROM prompts WHERE project_root='/proj/a'");
    expect(res[0]?.values[0]?.[0]).toBe(10);
  });
});

// ── pruneOlderThan ────────────────────────────────────────────────────────────

describe('store — pruneOlderThan', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('removes prompts older than the cutoff', () => {
    const old = Date.now() - 10_000;
    const recent = Date.now() - 1_000;
    store.db.run('INSERT INTO prompts (project_root, prompt_text, captured_at) VALUES (?,?,?)', ['/p', 'old', old]);
    store.db.run('INSERT INTO prompts (project_root, prompt_text, captured_at) VALUES (?,?,?)', ['/p', 'recent', recent]);

    pruneOlderThan(store, 5_000); // prune older than 5 s

    const res = store.db.exec('SELECT prompt_text FROM prompts');
    expect(res[0]?.values.map((r) => r[0])).toEqual(['recent']);
  });

  it('returns the number of deleted rows', () => {
    const old = Date.now() - 10_000;
    store.db.run('INSERT INTO prompts (project_root, prompt_text, captured_at) VALUES (?,?,?)', ['/p', 'a', old]);
    store.db.run('INSERT INTO prompts (project_root, prompt_text, captured_at) VALUES (?,?,?)', ['/p', 'b', old]);

    const deleted = pruneOlderThan(store, 5_000);
    expect(deleted).toBe(2);
  });

  it('scopes deletion to a single project when projectRoot is given', () => {
    const old = Date.now() - 10_000;
    store.db.run('INSERT INTO prompts (project_root, prompt_text, captured_at) VALUES (?,?,?)', ['/proj/a', 'a-old', old]);
    store.db.run('INSERT INTO prompts (project_root, prompt_text, captured_at) VALUES (?,?,?)', ['/proj/b', 'b-old', old]);

    pruneOlderThan(store, 5_000, '/proj/a');

    const res = store.db.exec('SELECT project_root FROM prompts');
    expect(res[0]?.values.map((r) => r[0])).toEqual(['/proj/b']);
  });
});

// ── getPromptStats ────────────────────────────────────────────────────────────

describe('store — getPromptStats', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('returns zero totals for an empty store', () => {
    const stats = getPromptStats(store);
    expect(stats.totalPrompts).toBe(0);
    expect(stats.perProject).toHaveLength(0);
    expect(stats.dbSizeBytes).toBeGreaterThan(0); // empty DB still has a file header
  });

  it('counts total prompts correctly', () => {
    insertPrompt(store, { projectRoot: '/proj/a', promptText: 'a1' });
    insertPrompt(store, { projectRoot: '/proj/a', promptText: 'a2' });
    insertPrompt(store, { projectRoot: '/proj/b', promptText: 'b1' });
    const stats = getPromptStats(store);
    expect(stats.totalPrompts).toBe(3);
  });

  it('groups per-project stats correctly', () => {
    insertPrompt(store, { projectRoot: '/proj/a', promptText: 'a1' });
    insertPrompt(store, { projectRoot: '/proj/a', promptText: 'a2' });
    insertPrompt(store, { projectRoot: '/proj/b', promptText: 'b1' });
    const stats = getPromptStats(store);
    expect(stats.perProject).toHaveLength(2);
    const a = stats.perProject.find((p) => p.projectRoot === '/proj/a');
    expect(a?.count).toBe(2);
    expect(a?.oldest).toBeLessThanOrEqual(a?.newest ?? 0);
  });
});

// ── Config ────────────────────────────────────────────────────────────────────

describe('store — config', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('getConfig returns built-in default for unset keys', () => {
    expect(getConfig(store.db, 'prompt_capture_enabled')).toBe('true');
    expect(getConfig(store.db, 'prompt_store_max_per_project')).toBe('500');
    expect(getConfig(store.db, 'prompt_store_max_db_mb')).toBe('100');
  });

  it('getConfig returns undefined for unknown non-default keys', () => {
    expect(getConfig(store.db, 'completely_unknown_key')).toBeUndefined();
  });

  it('setConfig stores a value', () => {
    setConfig(store, 'prompt_capture_enabled', 'false');
    expect(getConfig(store.db, 'prompt_capture_enabled')).toBe('false');
  });

  it('setConfig overwrites an existing value', () => {
    setConfig(store, 'prompt_store_max_per_project', '1000');
    setConfig(store, 'prompt_store_max_per_project', '250');
    expect(getConfig(store.db, 'prompt_store_max_per_project')).toBe('250');
  });

  it('getAllConfig merges defaults with stored values', () => {
    setConfig(store, 'prompt_capture_enabled', 'false');
    const all = getAllConfig(store.db);
    expect(all['prompt_capture_enabled']).toBe('false');       // overridden
    expect(all['prompt_store_max_per_project']).toBe('500');   // still default
    expect(all['prompt_store_max_db_mb']).toBe('100');         // still default
  });

  it('getAllConfig includes stored custom keys', () => {
    setConfig(store, 'language_override', 'es');
    const all = getAllConfig(store.db);
    expect(all['language_override']).toBe('es');
  });

  // ── isConfigSet ──────────────────────────────────────────────────────────────

  it('isConfigSet returns false for a key that has never been written', () => {
    expect(isConfigSet(store.db, 'prompt_capture_enabled')).toBe(false);
  });

  it('isConfigSet returns false even though getConfig returns a default for the same key', () => {
    // getConfig falls back to DEFAULT_CONFIG, but isConfigSet must not
    expect(getConfig(store.db, 'prompt_capture_enabled')).toBe('true');
    expect(isConfigSet(store.db, 'prompt_capture_enabled')).toBe(false);
  });

  it('isConfigSet returns true after setConfig is called', () => {
    setConfig(store, 'prompt_capture_enabled', 'true');
    expect(isConfigSet(store.db, 'prompt_capture_enabled')).toBe(true);
  });

  it('isConfigSet returns true when the stored value is false', () => {
    setConfig(store, 'prompt_capture_enabled', 'false');
    expect(isConfigSet(store.db, 'prompt_capture_enabled')).toBe(true);
  });

  it('isConfigSet returns false for a completely unknown key', () => {
    expect(isConfigSet(store.db, 'nonexistent_key')).toBe(false);
  });

  it('isConfigSet is independent per key', () => {
    setConfig(store, 'prompt_capture_enabled', 'true');
    expect(isConfigSet(store.db, 'prompt_capture_enabled')).toBe(true);
    expect(isConfigSet(store.db, 'prompt_store_max_per_project')).toBe(false);
  });
});

// ── skipped_sessions CRUD ─────────────────────────────────────────────────────

describe('store — skipped_sessions', () => {
  let store: Store;

  const BASE = {
    projectRoot:          '/proj/alpha',
    sessionId:            'session-abc',
    flagType:             'stage_transition',
    stage:                'implementation',
    levelReached:         1,
    skippedAtPromptCount: 22,
  };

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('inserts a skipped session and returns it via getSkippedSessions', () => {
    insertSkippedSession(store, BASE);
    const rows = getSkippedSessions(store, '/proj/alpha');
    expect(rows).toHaveLength(1);
    expect(rows[0].projectRoot).toBe('/proj/alpha');
    expect(rows[0].sessionId).toBe('session-abc');
    expect(rows[0].flagType).toBe('stage_transition');
    expect(rows[0].stage).toBe('implementation');
    expect(rows[0].levelReached).toBe(1);
    expect(rows[0].skippedAtPromptCount).toBe(22);
  });

  it('skipped_at is set to a unix ms timestamp close to Date.now()', () => {
    const before = Date.now();
    insertSkippedSession(store, BASE);
    const after = Date.now();
    const row = getSkippedSessions(store, '/proj/alpha')[0];
    expect(row.skippedAt).toBeGreaterThanOrEqual(before);
    expect(row.skippedAt).toBeLessThanOrEqual(after);
  });

  it('assigns an auto-incremented id', () => {
    insertSkippedSession(store, BASE);
    insertSkippedSession(store, { ...BASE, flagType: 'absence:test_creation' });
    const rows = getSkippedSessions(store, '/proj/alpha');
    expect(rows[0].id).toBe(1);
    expect(rows[1].id).toBe(2);
  });

  it('getSkippedSessions returns rows ordered oldest-first (by skipped_at ASC)', () => {
    insertSkippedSession(store, { ...BASE, flagType: 'stage_transition' });
    insertSkippedSession(store, { ...BASE, flagType: 'absence:test_creation' });
    const rows = getSkippedSessions(store, '/proj/alpha');
    expect(rows[0].flagType).toBe('stage_transition');
    expect(rows[1].flagType).toBe('absence:test_creation');
  });

  it('getSkippedSessions returns only rows for the given project', () => {
    insertSkippedSession(store, BASE);
    insertSkippedSession(store, { ...BASE, projectRoot: '/proj/beta' });
    expect(getSkippedSessions(store, '/proj/alpha')).toHaveLength(1);
    expect(getSkippedSessions(store, '/proj/beta')).toHaveLength(1);
  });

  it('getSkippedSessions returns empty array when no rows exist', () => {
    expect(getSkippedSessions(store, '/no/project')).toEqual([]);
  });

  it('getSkippedSessionCount returns correct count', () => {
    expect(getSkippedSessionCount(store, '/proj/alpha')).toBe(0);
    insertSkippedSession(store, BASE);
    insertSkippedSession(store, { ...BASE, flagType: 'absence:security_check' });
    expect(getSkippedSessionCount(store, '/proj/alpha')).toBe(2);
  });

  it('getSkippedSessionCount is project-scoped', () => {
    insertSkippedSession(store, BASE);
    insertSkippedSession(store, { ...BASE, projectRoot: '/proj/beta' });
    expect(getSkippedSessionCount(store, '/proj/alpha')).toBe(1);
    expect(getSkippedSessionCount(store, '/proj/beta')).toBe(1);
  });

  it('deleteSkippedSession removes the row by id', () => {
    insertSkippedSession(store, BASE);
    const id = getSkippedSessions(store, '/proj/alpha')[0].id;
    deleteSkippedSession(store, id);
    expect(getSkippedSessions(store, '/proj/alpha')).toHaveLength(0);
  });

  it('deleteSkippedSession removes only the targeted row', () => {
    insertSkippedSession(store, BASE);
    insertSkippedSession(store, { ...BASE, flagType: 'absence:test_creation' });
    const rows = getSkippedSessions(store, '/proj/alpha');
    deleteSkippedSession(store, rows[0].id);
    const remaining = getSkippedSessions(store, '/proj/alpha');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].flagType).toBe('absence:test_creation');
  });

  it('deleteSkippedSession is a no-op for a non-existent id', () => {
    insertSkippedSession(store, BASE);
    deleteSkippedSession(store, 9999); // id does not exist
    expect(getSkippedSessions(store, '/proj/alpha')).toHaveLength(1);
  });

  it('deleteAllSkippedSessions removes all rows for the project', () => {
    insertSkippedSession(store, BASE);
    insertSkippedSession(store, { ...BASE, flagType: 'absence:test_creation' });
    deleteAllSkippedSessions(store, '/proj/alpha');
    expect(getSkippedSessions(store, '/proj/alpha')).toHaveLength(0);
  });

  it('deleteAllSkippedSessions only removes rows for the given project', () => {
    insertSkippedSession(store, BASE);
    insertSkippedSession(store, { ...BASE, projectRoot: '/proj/beta' });
    deleteAllSkippedSessions(store, '/proj/alpha');
    expect(getSkippedSessions(store, '/proj/alpha')).toHaveLength(0);
    expect(getSkippedSessions(store, '/proj/beta')).toHaveLength(1);
  });

  it('stores absence flag type with signal key', () => {
    insertSkippedSession(store, { ...BASE, flagType: 'absence:security_check' });
    const row = getSkippedSessions(store, '/proj/alpha')[0];
    expect(row.flagType).toBe('absence:security_check');
  });

  it('stores level_reached = 2 (user reached Level 2 before skipping)', () => {
    insertSkippedSession(store, { ...BASE, levelReached: 2 });
    const row = getSkippedSessions(store, '/proj/alpha')[0];
    expect(row.levelReached).toBe(2);
  });

  it('stores level_reached = 3 (user reached Level 3 before skipping)', () => {
    insertSkippedSession(store, { ...BASE, levelReached: 3 });
    const row = getSkippedSessions(store, '/proj/alpha')[0];
    expect(row.levelReached).toBe(3);
  });
});

// ── pending_advisories CRUD ───────────────────────────────────────────────────

describe('store — pending_advisories', () => {
  let store: Store;

  const BASE_ADVISORY: UpsertPendingAdvisoryInput = {
    projectRoot: '/proj/main',
    stage:       'implementation',
    flagType:    'absence:test_creation',
    pinchLabel:  'Hold up.',
    sessionId:   'sess-abc',
    promptCount: 7,
  };

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('upsertPendingAdvisory inserts a row retrievable by getPendingAdvisory', () => {
    upsertPendingAdvisory(store, BASE_ADVISORY);
    const row = getPendingAdvisory(store, '/proj/main');
    expect(row).not.toBeNull();
    expect(row!.projectRoot).toBe('/proj/main');
    expect(row!.stage).toBe('implementation');
    expect(row!.flagType).toBe('absence:test_creation');
    expect(row!.pinchLabel).toBe('Hold up.');
    expect(row!.sessionId).toBe('sess-abc');
    expect(row!.promptCount).toBe(7);
    expect(row!.status).toBe('pending');
  });

  it('getPendingAdvisory returns null when no advisory exists for a project', () => {
    const row = getPendingAdvisory(store, '/proj/none');
    expect(row).toBeNull();
  });

  it('getPendingAdvisory only returns pending rows (not shown)', () => {
    upsertPendingAdvisory(store, BASE_ADVISORY);
    const row = getPendingAdvisory(store, '/proj/main');
    markAdvisoryShown(store, row!.id);
    expect(getPendingAdvisory(store, '/proj/main')).toBeNull();
  });

  it('markAdvisoryShown changes status to shown', () => {
    upsertPendingAdvisory(store, BASE_ADVISORY);
    const row = getPendingAdvisory(store, '/proj/main')!;
    markAdvisoryShown(store, row.id);
    const res = store.db.exec(
      "SELECT status FROM pending_advisories WHERE id = ?",
      [row.id],
    );
    expect(res[0]?.values[0]?.[0]).toBe('shown');
  });

  it('upsertPendingAdvisory replaces any existing advisory (one per project)', () => {
    upsertPendingAdvisory(store, BASE_ADVISORY);
    upsertPendingAdvisory(store, { ...BASE_ADVISORY, pinchLabel: 'Updated label.' });
    const row = getPendingAdvisory(store, '/proj/main');
    expect(row).not.toBeNull();
    expect(row!.pinchLabel).toBe('Updated label.');
    // Only one row should exist for the project
    const res = store.db.exec(
      "SELECT COUNT(*) FROM pending_advisories WHERE project_root = '/proj/main'",
    );
    expect(res[0]?.values[0]?.[0]).toBe(1);
  });

  it('advisories are isolated per project_root', () => {
    upsertPendingAdvisory(store, BASE_ADVISORY);
    upsertPendingAdvisory(store, { ...BASE_ADVISORY, projectRoot: '/proj/other', pinchLabel: 'Other label.' });
    expect(getPendingAdvisory(store, '/proj/main')!.pinchLabel).toBe('Hold up.');
    expect(getPendingAdvisory(store, '/proj/other')!.pinchLabel).toBe('Other label.');
  });

  it('created_at is set to a unix ms timestamp close to Date.now()', () => {
    const before = Date.now();
    upsertPendingAdvisory(store, BASE_ADVISORY);
    const after = Date.now();
    const row = getPendingAdvisory(store, '/proj/main')!;
    expect(row.createdAt).toBeGreaterThanOrEqual(before);
    expect(row.createdAt).toBeLessThanOrEqual(after);
  });

  it('upsertPendingAdvisory also removes old shown rows for the project', () => {
    upsertPendingAdvisory(store, BASE_ADVISORY);
    const first = getPendingAdvisory(store, '/proj/main')!;
    markAdvisoryShown(store, first.id);
    // Now upsert again — old shown row should be deleted
    upsertPendingAdvisory(store, { ...BASE_ADVISORY, pinchLabel: 'Fresh.' });
    const res = store.db.exec(
      "SELECT COUNT(*) FROM pending_advisories WHERE project_root = '/proj/main'",
    );
    expect(res[0]?.values[0]?.[0]).toBe(1);
    expect(getPendingAdvisory(store, '/proj/main')!.pinchLabel).toBe('Fresh.');
  });

  it('markAdvisoryShown is a no-op for a non-existent id', () => {
    upsertPendingAdvisory(store, BASE_ADVISORY);
    markAdvisoryShown(store, 9999); // id does not exist
    expect(getPendingAdvisory(store, '/proj/main')).not.toBeNull();
  });
});
