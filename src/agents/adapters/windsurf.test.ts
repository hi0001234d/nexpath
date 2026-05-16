import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { windsurfAdapter, windsurfConfigDir } from './windsurf.js';
import type { InstallContext } from '../types.js';

const makeCtx = (home: string): InstallContext => ({
  home,
  cwd: join(home, 'cwd'),
  yes: true,
  dbPath: ':memory:',
});

describe('windsurfConfigDir', () => {
  it('returns the linux path under ~/.config/Windsurf', () => {
    expect(windsurfConfigDir('/home/u', 'linux')).toBe('/home/u/.config/Windsurf');
  });

  it('returns the darwin path under Application Support', () => {
    expect(windsurfConfigDir('/Users/u', 'darwin')).toBe(
      '/Users/u/Library/Application Support/Windsurf',
    );
  });

  it('returns the win32 path under APPDATA when provided', () => {
    expect(
      windsurfConfigDir('C:\\Users\\u', 'win32', 'C:\\Users\\u\\AppData\\Roaming'),
    ).toBe('C:\\Users\\u\\AppData\\Roaming/Windsurf');
  });
});

describe('windsurfAdapter — static fields', () => {
  it('has the expected id, label, category', () => {
    expect(windsurfAdapter.id).toBe('windsurf');
    expect(windsurfAdapter.label).toBe('Windsurf');
    expect(windsurfAdapter.category).toBe('vscode-extension');
  });

  it('declares Open VSX + VS Code Marketplace ids', () => {
    expect(windsurfAdapter.marketplace.openVsx).toBe('nexpath.nexpath-vscode');
    expect(windsurfAdapter.marketplace.vsCode).toBe('nexpath.nexpath-vscode');
  });
});

describe('windsurfAdapter.detect', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'windsurf-detect-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns false when neither Windsurf nor codeium dir exists', () => {
    expect(windsurfAdapter.detect(makeCtx(tmp))).toBe(false);
  });

  it('returns true when only the VS-Code-fork dir exists', () => {
    mkdirSync(join(tmp, '.config', 'Windsurf'), { recursive: true });
    expect(windsurfAdapter.detect(makeCtx(tmp))).toBe(true);
  });

  it('returns true when only the legacy codeium dir exists', () => {
    mkdirSync(join(tmp, '.codeium', 'windsurf'), { recursive: true });
    expect(windsurfAdapter.detect(makeCtx(tmp))).toBe(true);
  });

  it('returns true when both dirs exist', () => {
    mkdirSync(join(tmp, '.config', 'Windsurf'), { recursive: true });
    mkdirSync(join(tmp, '.codeium', 'windsurf'), { recursive: true });
    expect(windsurfAdapter.detect(makeCtx(tmp))).toBe(true);
  });
});

describe('windsurfAdapter.chatHistoryPaths', () => {
  it('returns both the workspaceStorage AND the codeium Cascade base path', () => {
    const paths = windsurfAdapter.chatHistoryPaths(makeCtx('/home/u'));
    expect(paths).toHaveLength(2);
    expect(paths.some((p) => p.includes('Windsurf') && p.includes('workspaceStorage'))).toBe(true);
    expect(paths.some((p) => p.endsWith('.codeium/windsurf'))).toBe(true);
  });
});

describe('windsurfAdapter.extractPrompt', () => {
  it('returns null (decoding happens in the extension, not the CLI adapter)', () => {
    expect(windsurfAdapter.extractPrompt('cascade.history', '[]')).toBeNull();
    expect(windsurfAdapter.extractPrompt('any.key', { x: 1 })).toBeNull();
  });
});

describe('windsurfAdapter.install', () => {
  let tmp: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'windsurf-install-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    logSpy.mockRestore();
  });

  it('skips when Windsurf is not detected and returns status=skipped', async () => {
    const r = await windsurfAdapter.install(makeCtx(tmp));
    expect(r.status).toBe('skipped');
    const allLogs = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allLogs).toContain('not detected');
  });

  it('prints deep-link instructions when Windsurf IS detected', async () => {
    mkdirSync(join(tmp, '.config', 'Windsurf'), { recursive: true });
    const r = await windsurfAdapter.install(makeCtx(tmp));
    expect(r.status).toBe('installed');
    const allLogs = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allLogs).toContain('Open VSX');
    expect(allLogs).toContain('windsurf --install-extension');
    expect(allLogs).toContain('nexpath.nexpath-vscode');
  });
});

describe('windsurfAdapter.uninstall', () => {
  let tmp: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'windsurf-uninstall-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    logSpy.mockRestore();
  });

  it('logs the skip line when Windsurf is not detected', async () => {
    await windsurfAdapter.uninstall(makeCtx(tmp));
    expect(logSpy.mock.calls.map((c) => c.join(' ')).join('\n')).toContain('not detected');
  });

  it('logs the uninstall instructions when Windsurf IS detected', async () => {
    mkdirSync(join(tmp, '.config', 'Windsurf'), { recursive: true });
    await windsurfAdapter.uninstall(makeCtx(tmp));
    const allLogs = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allLogs).toContain('uninstall');
    expect(allLogs).toContain('windsurf --uninstall-extension');
  });
});

describe('windsurfAdapter registry registration', () => {
  it('is registered with the global registry under id "windsurf"', async () => {
    await import('../index.js');
    const { getAdapter } = await import('../registry.js');
    expect(getAdapter('windsurf')).toBe(windsurfAdapter);
  });
});
