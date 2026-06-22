import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { windsurfAdapter, windsurfConfigDir } from './windsurf.js';
import { getWindsurfHooksPath } from '../../windsurf-hook/install.js';
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

  it('writes the Cascade capture hook AND prints deep-link instructions when detected', async () => {
    mkdirSync(join(tmp, '.config', 'Windsurf'), { recursive: true });
    const r = await windsurfAdapter.install(makeCtx(tmp));
    expect(r.status).toBe('installed');
    // capture: hooks.json written under ~/.codeium/windsurf with pre_user_prompt only
    const hooksPath = getWindsurfHooksPath(tmp);
    expect(existsSync(hooksPath)).toBe(true);
    const hooks = JSON.parse(readFileSync(hooksPath, 'utf8')).hooks;
    expect(hooks.pre_user_prompt[0].command).toContain('windsurf-hook pre_user_prompt');
    expect(hooks.post_cascade_response[0].command).toContain('windsurf-hook post_cascade_response');
    // delivery: extension deep-link still printed
    const allLogs = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allLogs).toContain('Cascade capture hook written');
    expect(allLogs).toContain('Open VSX');
    expect(allLogs).toContain('windsurf --install-extension');
  });

  it('still writes the Cascade hook but suppresses the marketplace deep-links when NEXPATH_EXT_SETUP is set', async () => {
    mkdirSync(join(tmp, '.config', 'Windsurf'), { recursive: true });
    const prev = process.env.NEXPATH_EXT_SETUP;
    process.env.NEXPATH_EXT_SETUP = '1';
    try {
      const r = await windsurfAdapter.install(makeCtx(tmp));
      expect(r.status).toBe('installed');
      // capture hook is STILL written (extension-driven setup needs it)
      const hooksPath = getWindsurfHooksPath(tmp);
      expect(existsSync(hooksPath)).toBe(true);
      const allLogs = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(allLogs).toContain('Cascade capture hook written');
      // but the redundant "install the extension" deep-links are gone
      expect(allLogs).not.toContain('Open VSX');
      expect(allLogs).not.toContain('windsurf --install-extension');
    } finally {
      if (prev === undefined) delete process.env.NEXPATH_EXT_SETUP;
      else process.env.NEXPATH_EXT_SETUP = prev;
    }
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

  it('removes the Cascade capture hook AND logs uninstall instructions when detected', async () => {
    mkdirSync(join(tmp, '.config', 'Windsurf'), { recursive: true });
    // seed a hooks.json with our capture hook
    await windsurfAdapter.install(makeCtx(tmp));
    const hooksPath = getWindsurfHooksPath(tmp);
    expect(existsSync(hooksPath)).toBe(true);
    logSpy.mockClear();

    await windsurfAdapter.uninstall(makeCtx(tmp));
    const hooks = JSON.parse(readFileSync(hooksPath, 'utf8')).hooks ?? {};
    expect(hooks.pre_user_prompt).toBeUndefined(); // our capture hook removed
    const allLogs = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allLogs).toContain('Cascade capture hook removed');
    expect(allLogs).toContain('windsurf --uninstall-extension');
  });

  it("preserves another tool's hooks.json entries on uninstall", async () => {
    mkdirSync(join(tmp, '.codeium', 'windsurf'), { recursive: true });
    const hooksPath = getWindsurfHooksPath(tmp);
    writeFileSync(hooksPath, JSON.stringify({ hooks: { pre_write_code: [{ command: 'node guard.js' }] } }));
    await windsurfAdapter.uninstall(makeCtx(tmp));
    const hooks = JSON.parse(readFileSync(hooksPath, 'utf8')).hooks;
    expect(hooks.pre_write_code[0].command).toBe('node guard.js');
  });
});

describe('windsurfAdapter registry registration', () => {
  it('is registered with the global registry under id "windsurf"', async () => {
    await import('../index.js');
    const { getAdapter } = await import('../registry.js');
    expect(getAdapter('windsurf')).toBe(windsurfAdapter);
  });
});
