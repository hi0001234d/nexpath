import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';

vi.mock('../../config/ApiKeyResolver.js', () => ({
  storeApiKey:    vi.fn(),
  removeApiKey:   vi.fn(),
  getKeySource:   vi.fn(),
  isValidApiKey:  (key: string) => /^sk-[A-Za-z0-9_-]{20,}$/.test(key),
}));

import { uninstallAction, resolveAgentPaths } from './install.js';
import * as resolver from '../../config/ApiKeyResolver.js';
import { openStore, closeStore } from '../../store/db.js';
import { getConfig, setConfig } from '../../store/config.js';

function tmpDirAgents(): { dir: string; cleanup: () => void } {
  const dir = join(tmpdir(), `nexpath-uninstall-telem-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return { dir, cleanup: () => { try { rmSync(dir, { recursive: true }); } catch { /* ignore */ } } };
}

beforeEach(() => {
  vi.mocked(resolver.removeApiKey).mockReset().mockResolvedValue(undefined);
  vi.mocked(resolver.getKeySource).mockReset().mockResolvedValue('none');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('uninstallAction — telemetry config cleanup', () => {
  it('sets both telemetry.enabled and telemetry_sync_enabled to "false" in DB', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dbPath = join(dir, 'uninstall-telem.db');
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        apiKeyConfirmFn: async () => false,
        dbPath,
      });
      const store = await openStore(dbPath);
      expect(getConfig(store.db, 'telemetry.enabled')).toBe('false');
      expect(getConfig(store.db, 'telemetry_sync_enabled')).toBe('false');
      closeStore(store);
    } finally { cleanup(); }
  });

  it('clears pre-existing "true" flags from a prior install', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dbPath = join(dir, 'uninstall-after-install.db');
    try {
      // Simulate a prior install having set both flags to 'true'.
      const seed = await openStore(dbPath);
      setConfig(seed, 'telemetry.enabled',      'true');
      setConfig(seed, 'telemetry_sync_enabled', 'true');
      closeStore(seed);

      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        apiKeyConfirmFn: async () => false,
        dbPath,
      });

      const store = await openStore(dbPath);
      expect(getConfig(store.db, 'telemetry.enabled')).toBe('false');
      expect(getConfig(store.db, 'telemetry_sync_enabled')).toBe('false');
      closeStore(store);
    } finally { cleanup(); }
  });

  it('logs a confirmation line when telemetry is disabled', async () => {
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const dbPath = join(dir, 'uninstall-log.db');
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        apiKeyConfirmFn: async () => false,
        dbPath,
      });
      const text = logSpy.mock.calls.map(c => c[0] as string).join('\n');
      expect(text).toContain('Telemetry disabled');
    } finally { cleanup(); }
  });

  it('does not crash when the store cannot be opened (best-effort)', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    // Point dbPath at an existing directory — openStore expects a file path,
    // so this will fail and the catch block must swallow it.
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await expect(uninstallAction({
        paths,
        execFn: () => {},
        apiKeyConfirmFn: async () => false,
        dbPath: dir,
      })).resolves.toBeUndefined();
    } finally { cleanup(); }
  });

  it('--yes mode → both flags still cleared (telemetry cleanup runs unconditionally)', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dbPath = join(dir, 'uninstall-yes.db');
    const confirmFn = vi.fn<() => Promise<boolean>>();
    try {
      // Seed prior install state.
      const seed = await openStore(dbPath);
      setConfig(seed, 'telemetry.enabled',      'true');
      setConfig(seed, 'telemetry_sync_enabled', 'true');
      closeStore(seed);

      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        apiKeyConfirmFn: confirmFn,
        yes: true,
        dbPath,
      });

      // --yes bypasses the API key prompt entirely.
      expect(confirmFn).not.toHaveBeenCalled();

      const store = await openStore(dbPath);
      expect(getConfig(store.db, 'telemetry.enabled')).toBe('false');
      expect(getConfig(store.db, 'telemetry_sync_enabled')).toBe('false');
      closeStore(store);
    } finally { cleanup(); }
  });

  it('clears telemetry flags even when the API key is also being removed (full flow)', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dbPath = join(dir, 'uninstall-full-flow.db');
    try {
      // Seed prior install state — both flags 'true'.
      const seed = await openStore(dbPath);
      setConfig(seed, 'telemetry.enabled',      'true');
      setConfig(seed, 'telemetry_sync_enabled', 'true');
      closeStore(seed);

      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        apiKeyConfirmFn: async () => true,  // user confirms API key removal
        dbPath,
      });

      // API key removal happened.
      expect(resolver.removeApiKey).toHaveBeenCalledTimes(1);

      // AND telemetry flags also cleared in the same run.
      const store = await openStore(dbPath);
      expect(getConfig(store.db, 'telemetry.enabled')).toBe('false');
      expect(getConfig(store.db, 'telemetry_sync_enabled')).toBe('false');
      closeStore(store);
    } finally { cleanup(); }
  });
});
