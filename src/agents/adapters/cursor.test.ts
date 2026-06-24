import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cursorAdapter, cursorConfigDir } from './cursor.js';
import type { InstallContext } from '../types.js';

const makeCtx = (home: string): InstallContext => ({
  home,
  cwd: join(home, 'cwd'),
  yes: true,
  dbPath: ':memory:',
});

describe('cursorConfigDir', () => {
  it('returns the linux path under ~/.config/Cursor', () => {
    expect(cursorConfigDir('/home/u', 'linux')).toBe('/home/u/.config/Cursor');
  });

  it('returns the darwin path under Application Support', () => {
    expect(cursorConfigDir('/Users/u', 'darwin')).toBe(
      '/Users/u/Library/Application Support/Cursor',
    );
  });

  it('returns the win32 path under APPDATA when provided', () => {
    expect(
      cursorConfigDir('C:\\Users\\u', 'win32', 'C:\\Users\\u\\AppData\\Roaming'),
    ).toBe('C:\\Users\\u\\AppData\\Roaming/Cursor');
  });

  it('falls back to <home>/AppData/Roaming on win32 when APPDATA missing', () => {
    expect(cursorConfigDir('C:/U', 'win32')).toContain('Cursor');
  });
});

describe('cursorAdapter — static fields', () => {
  it('has the expected id, label, category', () => {
    expect(cursorAdapter.id).toBe('cursor');
    expect(cursorAdapter.label).toBe('Cursor');
    expect(cursorAdapter.category).toBe('vscode-extension');
  });

  it('declares Open VSX + VS Code Marketplace ids', () => {
    expect(cursorAdapter.marketplace.openVsx).toBe('nexpath.nexpath-vscode');
    expect(cursorAdapter.marketplace.vsCode).toBe('nexpath.nexpath-vscode');
  });
});

describe('cursorAdapter.detect', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'cursor-detect-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns false when ~/.config/Cursor/ does not exist', () => {
    expect(cursorAdapter.detect(makeCtx(tmp))).toBe(false);
  });

  it('returns true when ~/.config/Cursor/ does exist (linux fixture)', () => {
    mkdirSync(join(tmp, '.config', 'Cursor'), { recursive: true });
    expect(cursorAdapter.detect(makeCtx(tmp))).toBe(true);
  });
});

describe('cursorAdapter.chatHistoryPaths', () => {
  it('returns the workspaceStorage base path under the Cursor config dir', () => {
    const paths = cursorAdapter.chatHistoryPaths(makeCtx('/home/u'));
    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain('Cursor');
    expect(paths[0]).toContain('User/workspaceStorage');
  });
});

describe('cursorAdapter.extractPrompt', () => {
  it('returns null (decoding happens in the extension, not the CLI adapter)', () => {
    expect(cursorAdapter.extractPrompt('any.key', { anything: true })).toBeNull();
    expect(cursorAdapter.extractPrompt('aiService.prompts', '[]')).toBeNull();
  });
});

describe('cursorAdapter.install', () => {
  let tmp: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'cursor-install-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    logSpy.mockRestore();
  });

  it('skips when Cursor is not detected and returns status=skipped', async () => {
    const r = await cursorAdapter.install(makeCtx(tmp));
    expect(r.status).toBe('skipped');
    const allLogs = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allLogs).toContain('not detected');
  });

  it('prints deep-link instructions when Cursor IS detected', async () => {
    mkdirSync(join(tmp, '.config', 'Cursor'), { recursive: true });
    const r = await cursorAdapter.install(makeCtx(tmp));
    expect(r.status).toBe('installed');
    const allLogs = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allLogs).toContain('Open VSX');
    expect(allLogs).toContain('open-vsx.org');
    expect(allLogs).toContain('marketplace.visualstudio.com');
    expect(allLogs).toContain('cursor --install-extension');
    expect(allLogs).toContain('nexpath.nexpath-vscode');
  });

  it('suppresses the marketplace deep-links when NEXPATH_EXT_SETUP is set (extension-driven)', async () => {
    mkdirSync(join(tmp, '.config', 'Cursor'), { recursive: true });
    const prev = process.env.NEXPATH_EXT_SETUP;
    process.env.NEXPATH_EXT_SETUP = '1';
    try {
      const r = await cursorAdapter.install(makeCtx(tmp));
      expect(r.status).toBe('installed');
      const allLogs = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(allLogs).not.toContain('Open VSX');
      expect(allLogs).not.toContain('open-vsx.org');
      expect(allLogs).not.toContain('cursor --install-extension');
      expect(allLogs).toContain('ready');
    } finally {
      if (prev === undefined) delete process.env.NEXPATH_EXT_SETUP;
      else process.env.NEXPATH_EXT_SETUP = prev;
    }
  });
});

describe('cursorAdapter.uninstall', () => {
  let tmp: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'cursor-uninstall-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    logSpy.mockRestore();
  });

  it('logs the skip line when Cursor is not detected', async () => {
    await cursorAdapter.uninstall(makeCtx(tmp));
    const allLogs = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allLogs).toContain('not detected');
  });

  it('logs the uninstall instructions when Cursor IS detected', async () => {
    mkdirSync(join(tmp, '.config', 'Cursor'), { recursive: true });
    await cursorAdapter.uninstall(makeCtx(tmp));
    const allLogs = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allLogs).toContain('uninstall');
    expect(allLogs).toContain('cursor --uninstall-extension');
  });
});

describe('cursorAdapter registry registration', () => {
  it('is registered with the global registry under id "cursor"', async () => {
    // Importing the side-effect entry registers all adapters
    await import('../index.js');
    const { getAdapter } = await import('../registry.js');
    expect(getAdapter('cursor')).toBe(cursorAdapter);
  });
});
