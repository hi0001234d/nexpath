import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openStore, type Store } from './db.js';
import { insertPrompt, deleteProjectPrompts, deleteAllPrompts, pruneOlderThan, getPromptStats } from './prompts.js';
import { getConfig, setConfig, getAllConfig } from './config.js';
import { redactSecrets } from './redact.js';

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
});
