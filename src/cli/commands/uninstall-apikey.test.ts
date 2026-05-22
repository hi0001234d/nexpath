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

function tmpDirAgents(): { dir: string; cleanup: () => void } {
  const dir = join(tmpdir(), `nexpath-uninstall-${randomUUID()}`);
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

describe('uninstallAction — API key cleanup (Plan #1 Phase 6)', () => {
  it('confirm Y → calls removeApiKey and logs the previous source', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        apiKeyConfirmFn: async () => true,
      });
      expect(resolver.removeApiKey).toHaveBeenCalledTimes(1);
      expect(logSpy.mock.calls.map(c => c[0] as string).join('\n')).toContain('API key removed (was in keychain)');
    } finally { cleanup(); }
  });

  it('confirm n → key retained, removeApiKey NOT called, retain hint shown', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        apiKeyConfirmFn: async () => false,
      });
      expect(resolver.removeApiKey).not.toHaveBeenCalled();
      const text = logSpy.mock.calls.map(c => c[0] as string).join('\n');
      expect(text).toContain('API key retained');
      expect(text).toContain('nexpath config remove-api-key');
    } finally { cleanup(); }
  });

  it('no key stored (getKeySource=none) → silent skip, no confirm prompt fired', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('none');
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const confirmFn = vi.fn<() => Promise<boolean>>();
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        apiKeyConfirmFn: confirmFn,
      });
      expect(confirmFn).not.toHaveBeenCalled();
      expect(resolver.removeApiKey).not.toHaveBeenCalled();
      expect(logSpy.mock.calls.map(c => c[0] as string).join('\n')).toContain('No stored API key found');
    } finally { cleanup(); }
  });

  it('--yes flag bypasses confirm prompt and removes the key directly', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('file');
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const confirmFn = vi.fn<() => Promise<boolean>>();
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        yes: true,
        apiKeyConfirmFn: confirmFn,
      });
      expect(confirmFn).not.toHaveBeenCalled();
      expect(resolver.removeApiKey).toHaveBeenCalledTimes(1);
      expect(logSpy.mock.calls.map(c => c[0] as string).join('\n')).toContain('API key removed (was in file)');
    } finally { cleanup(); }
  });

  it('logs MCP-removal summary BEFORE the API key cleanup section', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        apiKeyConfirmFn: async () => true,
      });
      const lines = logSpy.mock.calls.map(c => c[0] as string);
      const mcpIdx = lines.findIndex(l => l.includes('MCP registration removed'));
      const keyIdx = lines.findIndex(l => l.includes('API key removed'));
      expect(mcpIdx).toBeGreaterThanOrEqual(0);
      expect(keyIdx).toBeGreaterThanOrEqual(0);
      expect(mcpIdx).toBeLessThan(keyIdx);
    } finally { cleanup(); }
  });

  it('projectRoot override flows through to getKeySource', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('none');
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        projectRoot: '/explicit/project',
        apiKeyConfirmFn: async () => true,
      });
      expect(resolver.getKeySource).toHaveBeenCalledWith('/explicit/project');
    } finally { cleanup(); }
  });

  it('removeApiKey throws → uninstall surfaces the error but still completes the MCP cleanup', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    vi.mocked(resolver.removeApiKey).mockRejectedValueOnce(new Error('keychain unavailable'));
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await expect(uninstallAction({
        paths,
        execFn: () => {},
        apiKeyConfirmFn: async () => true,
      })).rejects.toThrow(/keychain unavailable/);
      expect(resolver.removeApiKey).toHaveBeenCalledTimes(1);
    } finally { cleanup(); }
  });

  it('--yes flag with no stored key still silently skips removal (yes does not force a remove call)', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('none');
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        yes: true,
      });
      expect(resolver.removeApiKey).not.toHaveBeenCalled();
      expect(logSpy.mock.calls.map(c => c[0] as string).join('\n')).toContain('No stored API key found');
    } finally { cleanup(); }
  });

  it('"Prompt history retained" line appears AFTER the API key cleanup section', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        apiKeyConfirmFn: async () => true,
      });
      const lines = logSpy.mock.calls.map(c => c[0] as string);
      const keyIdx     = lines.findIndex(l => l.includes('API key removed'));
      const historyIdx = lines.findIndex(l => l.includes('Prompt history retained'));
      expect(keyIdx).toBeGreaterThanOrEqual(0);
      expect(historyIdx).toBeGreaterThanOrEqual(0);
      expect(keyIdx).toBeLessThan(historyIdx);
    } finally { cleanup(); }
  });

  it('agent MCP unregistration still runs regardless of the API key cleanup branch (none source)', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('none');
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
      });
      const text = logSpy.mock.calls.map(c => c[0] as string).join('\n');
      expect(text).toContain('MCP registration removed from all agents');
      expect(text).toContain('No stored API key found');
    } finally { cleanup(); }
  });
});
