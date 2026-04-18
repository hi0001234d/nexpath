import { describe, it, expect, vi, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { openStore, closeStore, insertPrompt, getConfig } from '../../store/index.js';
import { parsePeriod, storeDeleteAction, storeDisableAction, storePruneAction } from './store.js';

async function tempDb(setup?: (store: Awaited<ReturnType<typeof openStore>>) => void) {
  const path = join(tmpdir(), `nexpath-test-${randomUUID()}.db`);
  const store = await openStore(path);
  setup?.(store);
  closeStore(store);
  return {
    path,
    cleanup: () => { try { rmSync(path); } catch { /* ignore */ } },
  };
}

afterEach(() => vi.restoreAllMocks());

// ── parsePeriod ───────────────────────────────────────────────────────────────

describe('parsePeriod', () => {
  it('parses hours', () => {
    expect(parsePeriod('24h')).toBe(24 * 60 * 60 * 1000);
  });

  it('parses days', () => {
    expect(parsePeriod('30d')).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('parses months (approximate 30d)', () => {
    expect(parsePeriod('6m')).toBe(6 * 30 * 24 * 60 * 60 * 1000);
  });

  it('parses years (approximate 365d)', () => {
    expect(parsePeriod('1y')).toBe(365 * 24 * 60 * 60 * 1000);
  });

  it('is case-insensitive', () => {
    expect(parsePeriod('30D')).toBe(parsePeriod('30d'));
  });

  it('throws on invalid format', () => {
    expect(() => parsePeriod('30')).toThrow();
    expect(() => parsePeriod('abc')).toThrow();
    expect(() => parsePeriod('')).toThrow();
  });
});

// ── storeDeleteAction ─────────────────────────────────────────────────────────

describe('storeDeleteAction — full delete', () => {
  it('deletes all prompts with --yes', async () => {
    const { path, cleanup } = await tempDb((store) => {
      insertPrompt(store, { projectRoot: '/proj/a', promptText: 'hello' });
      insertPrompt(store, { projectRoot: '/proj/b', promptText: 'world' });
    });

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await storeDeleteAction({ yes: true }, path);
    expect(spy.mock.calls[0][0]).toBe('All stored prompts deleted.');

    // Verify DB is empty
    const store = await openStore(path);
    const res = store.db.exec('SELECT COUNT(*) FROM prompts');
    expect(res[0]?.values[0]?.[0]).toBe(0);
    closeStore(store);
    cleanup();
  });

  it('cancels when confirmFn returns false', async () => {
    const { path, cleanup } = await tempDb((store) => {
      insertPrompt(store, { projectRoot: '/proj/a', promptText: 'keep me' });
    });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await storeDeleteAction({}, path, async () => false);
    expect(spy.mock.calls[0][0]).toBe('Cancelled.');

    // Prompts should still be there
    const store = await openStore(path);
    const res = store.db.exec('SELECT COUNT(*) FROM prompts');
    expect(res[0]?.values[0]?.[0]).toBe(1);
    closeStore(store);
    cleanup();
  });
});

describe('storeDeleteAction — project delete', () => {
  it('deletes only the specified project', async () => {
    const { path, cleanup } = await tempDb((store) => {
      insertPrompt(store, { projectRoot: '/proj/a', promptText: 'a1' });
      insertPrompt(store, { projectRoot: '/proj/b', promptText: 'b1' });
    });

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await storeDeleteAction({ project: '/proj/a' }, path);
    expect(spy.mock.calls[0][0]).toContain('/proj/a');

    const store = await openStore(path);
    const res = store.db.exec('SELECT project_root FROM prompts');
    expect(res[0]?.values.map((r) => r[0])).toEqual(['/proj/b']);
    closeStore(store);
    cleanup();
  });

  it('does not require --yes for project delete', async () => {
    const { path, cleanup } = await tempDb();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Should complete without throwing or prompting
    await storeDeleteAction({ project: '/proj/x' }, path);
    expect(spy.mock.calls.length).toBeGreaterThan(0);
    cleanup();
  });
});

// ── storeDisableAction ────────────────────────────────────────────────────────

describe('storeDisableAction', () => {
  it('sets prompt_capture_enabled to false', async () => {
    const { path, cleanup } = await tempDb();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await storeDisableAction(path);

    const store = await openStore(path);
    expect(getConfig(store.db, 'prompt_capture_enabled')).toBe('false');
    closeStore(store);
    cleanup();
  });

  it('prints two informational lines', async () => {
    const { path, cleanup } = await tempDb();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await storeDisableAction(path);
    expect(spy.mock.calls).toHaveLength(2);
    expect(spy.mock.calls[0][0]).toContain('Prompt capture disabled');
    expect(spy.mock.calls[1][0]).toContain('nexpath store delete');
    cleanup();
  });

  it('leaves existing prompts intact', async () => {
    const { path, cleanup } = await tempDb((store) => {
      insertPrompt(store, { projectRoot: '/proj/a', promptText: 'kept' });
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await storeDisableAction(path);

    const store = await openStore(path);
    const res = store.db.exec('SELECT COUNT(*) FROM prompts');
    expect(res[0]?.values[0]?.[0]).toBe(1);
    closeStore(store);
    cleanup();
  });
});

// ── storePruneAction ──────────────────────────────────────────────────────────

describe('storePruneAction', () => {

  it('prunes with a valid period and reports count', async () => {
    const old = Date.now() - 2 * 24 * 60 * 60 * 1000; // 2 days ago
    const { path, cleanup } = await tempDb((store) => {
      store.db.run('INSERT INTO prompts (project_root, prompt_text, captured_at) VALUES (?,?,?)', ['/p', 'old', old]);
      store.db.run('INSERT INTO prompts (project_root, prompt_text, captured_at) VALUES (?,?,?)', ['/p', 'recent', Date.now()]);
    });

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await storePruneAction({ olderThan: '1d' }, path);
    expect(spy.mock.calls[0][0]).toMatch(/Pruned 1 prompt\(s\) older than 1d/);

    const store = await openStore(path);
    const res = store.db.exec('SELECT COUNT(*) FROM prompts');
    expect(res[0]?.values[0]?.[0]).toBe(1);
    closeStore(store);
    cleanup();
  });

  it('scopes to a project with --project', async () => {
    const old = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const { path, cleanup } = await tempDb((store) => {
      store.db.run('INSERT INTO prompts (project_root, prompt_text, captured_at) VALUES (?,?,?)', ['/proj/a', 'a-old', old]);
      store.db.run('INSERT INTO prompts (project_root, prompt_text, captured_at) VALUES (?,?,?)', ['/proj/b', 'b-old', old]);
    });

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await storePruneAction({ olderThan: '1d', project: '/proj/a' }, path);
    expect(spy.mock.calls[0][0]).toContain('/proj/a');

    const store = await openStore(path);
    const res = store.db.exec('SELECT project_root FROM prompts');
    expect(res[0]?.values.map((r) => r[0])).toEqual(['/proj/b']);
    closeStore(store);
    cleanup();
  });

  it('prints an error and sets exitCode when --older-than is missing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const originalExitCode = process.exitCode;
    await storePruneAction({}, ':memory:');
    expect(spy.mock.calls[0][0]).toContain('--older-than');
    expect(process.exitCode).toBe(1);
    process.exitCode = originalExitCode;
  });

  it('prints an error and sets exitCode for invalid period format', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const originalExitCode = process.exitCode;
    await storePruneAction({ olderThan: 'invalid' }, ':memory:');
    expect(spy.mock.calls[0][0]).toContain('Error');
    expect(process.exitCode).toBe(1);
    process.exitCode = originalExitCode;
  });
});
