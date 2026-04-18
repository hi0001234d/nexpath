import { describe, it, expect, vi, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import {
  openStore,
  closeStore,
  insertPrompt,
  getConfig,
  setConfig,
  insertSkippedSession,
  getSkippedSessionCount,
  pruneSkippedSessions,
} from '../../store/index.js';
import { parsePeriod, storeDeleteAction, storeEnableAction, storeDisableAction, storePruneAction } from './store.js';

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

// ── storeEnableAction ─────────────────────────────────────────────────────────

describe('storeEnableAction', () => {
  it('sets prompt_capture_enabled to true', async () => {
    const { path, cleanup } = await tempDb();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await storeEnableAction(path);

    const store = await openStore(path);
    expect(getConfig(store.db, 'prompt_capture_enabled')).toBe('true');
    closeStore(store);
    cleanup();
  });

  it('prints four informational lines', async () => {
    const { path, cleanup } = await tempDb();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await storeEnableAction(path);
    expect(spy.mock.calls).toHaveLength(4);
    expect(spy.mock.calls[0][0]).toContain('Prompt capture enabled');
    cleanup();
  });

  it('overwrites a previously disabled state', async () => {
    const { path, cleanup } = await tempDb((store) => {
      setConfig(store, 'prompt_capture_enabled', 'false');
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await storeEnableAction(path);

    const store = await openStore(path);
    expect(getConfig(store.db, 'prompt_capture_enabled')).toBe('true');
    closeStore(store);
    cleanup();
  });

  it('leaves existing prompts intact', async () => {
    const { path, cleanup } = await tempDb((store) => {
      insertPrompt(store, { projectRoot: '/p', promptText: 'kept' });
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await storeEnableAction(path);

    const store = await openStore(path);
    const res = store.db.exec('SELECT COUNT(*) FROM prompts');
    expect(res[0]?.values[0]?.[0]).toBe(1);
    closeStore(store);
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

// ── Gap 3 — skipped_sessions cleanup ──────────────────────────────────────────

function insertSkip(store: Awaited<ReturnType<typeof openStore>>, projectRoot: string) {
  insertSkippedSession(store, {
    projectRoot,
    sessionId: 'sess-1',
    flagType: 'stage_transition',
    stage: 'implementation',
    levelReached: 1,
    skippedAtPromptCount: 1,
  });
}

describe('storeDeleteAction — project delete cleans skipped_sessions', () => {
  it('deletes skipped_sessions for the deleted project', async () => {
    const { path, cleanup } = await tempDb((store) => {
      insertSkip(store, '/proj/a');
      insertSkip(store, '/proj/b');
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await storeDeleteAction({ project: '/proj/a' }, path);

    const store = await openStore(path);
    expect(getSkippedSessionCount(store, '/proj/a')).toBe(0);
    closeStore(store);
    cleanup();
  });

  it('preserves skipped_sessions for other projects', async () => {
    const { path, cleanup } = await tempDb((store) => {
      insertSkip(store, '/proj/a');
      insertSkip(store, '/proj/b');
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await storeDeleteAction({ project: '/proj/a' }, path);

    const store = await openStore(path);
    expect(getSkippedSessionCount(store, '/proj/b')).toBe(1);
    closeStore(store);
    cleanup();
  });
});

describe('storeDeleteAction — full delete cleans all skipped_sessions', () => {
  it('removes every skipped_sessions row', async () => {
    const { path, cleanup } = await tempDb((store) => {
      insertSkip(store, '/proj/a');
      insertSkip(store, '/proj/b');
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await storeDeleteAction({ yes: true }, path);

    const store = await openStore(path);
    const res = store.db.exec('SELECT COUNT(*) FROM skipped_sessions');
    expect(res[0]?.values[0]?.[0]).toBe(0);
    closeStore(store);
    cleanup();
  });
});

describe('storePruneAction — prunes skipped_sessions', () => {
  it('prunes skipped_sessions older than cutoff for a specific project', async () => {
    const old = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const { path, cleanup } = await tempDb((store) => {
      store.db.run(
        'INSERT INTO skipped_sessions (project_root, session_id, flag_type, stage, level_reached, skipped_at_prompt_count, skipped_at) VALUES (?,?,?,?,?,?,?)',
        ['/proj/a', 'sess-old', 'stage_transition', 'implementation', 1, 1, old],
      );
      store.db.run(
        'INSERT INTO skipped_sessions (project_root, session_id, flag_type, stage, level_reached, skipped_at_prompt_count, skipped_at) VALUES (?,?,?,?,?,?,?)',
        ['/proj/b', 'sess-b', 'stage_transition', 'implementation', 1, 1, old],
      );
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await storePruneAction({ olderThan: '1d', project: '/proj/a' }, path);

    const store = await openStore(path);
    expect(getSkippedSessionCount(store, '/proj/a')).toBe(0);
    expect(getSkippedSessionCount(store, '/proj/b')).toBe(1); // other project untouched
    closeStore(store);
    cleanup();
  });

  it('prunes skipped_sessions older than cutoff across all projects (no --project)', async () => {
    const old = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const { path, cleanup } = await tempDb((store) => {
      store.db.run(
        'INSERT INTO skipped_sessions (project_root, session_id, flag_type, stage, level_reached, skipped_at_prompt_count, skipped_at) VALUES (?,?,?,?,?,?,?)',
        ['/proj/a', 'sess-old-a', 'stage_transition', 'implementation', 1, 1, old],
      );
      store.db.run(
        'INSERT INTO skipped_sessions (project_root, session_id, flag_type, stage, level_reached, skipped_at_prompt_count, skipped_at) VALUES (?,?,?,?,?,?,?)',
        ['/proj/b', 'sess-old-b', 'stage_transition', 'implementation', 1, 1, old],
      );
      store.db.run(
        'INSERT INTO skipped_sessions (project_root, session_id, flag_type, stage, level_reached, skipped_at_prompt_count, skipped_at) VALUES (?,?,?,?,?,?,?)',
        ['/proj/b', 'sess-recent', 'stage_transition', 'implementation', 1, 1, Date.now()],
      );
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await storePruneAction({ olderThan: '1d' }, path);

    const store = await openStore(path);
    const res = store.db.exec('SELECT COUNT(*) FROM skipped_sessions');
    expect(res[0]?.values[0]?.[0]).toBe(1); // only the recent one remains
    closeStore(store);
    cleanup();
  });
});

describe('pruneSkippedSessions (unit)', () => {
  it('deletes only items with skipped_at before the cutoff', async () => {
    const old = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const { path, cleanup } = await tempDb((store) => {
      store.db.run(
        'INSERT INTO skipped_sessions (project_root, session_id, flag_type, stage, level_reached, skipped_at_prompt_count, skipped_at) VALUES (?,?,?,?,?,?,?)',
        ['/proj/a', 'sess-old', 'stage_transition', 'implementation', 1, 1, old],
      );
      store.db.run(
        'INSERT INTO skipped_sessions (project_root, session_id, flag_type, stage, level_reached, skipped_at_prompt_count, skipped_at) VALUES (?,?,?,?,?,?,?)',
        ['/proj/a', 'sess-new', 'stage_transition', 'implementation', 1, 2, Date.now()],
      );
    });

    const store = await openStore(path);
    pruneSkippedSessions(store, 24 * 60 * 60 * 1000); // 1d cutoff
    expect(getSkippedSessionCount(store, '/proj/a')).toBe(1);
    closeStore(store);
    cleanup();
  });
});
