import { describe, it, expect, vi, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { openStore, closeStore } from '../../store/db.js';
import { setConfig, isConfigSet } from '../../store/config.js';

import {
  MCP_SERVER_NAME,
  buildStandardEntry,
  buildClineEntry,
  buildKiloEntry,
  buildOpenCodeEntry,
  getClinePath,
  getRooCodePath,
  resolveAgentPaths,
  detectAgents,
  writeMcpEntry,
  removeMcpEntry,
  writeOpenCodeEntry,
  removeOpenCodeEntry,
  claudeCliInstall,
  claudeCliUninstall,
  installAction,
  uninstallAction,
  getClaudeSettingsPath,
  buildHookCommand,
  buildStopHookCommand,
  buildHookEntry,
  writeHookEntry,
  removeHookEntry,
  ensureLinuxClipboard,
} from './install.js';

afterEach(() => vi.restoreAllMocks());

// ── helpers ───────────────────────────────────────────────────────────────────

function tmpDir(): { dir: string; cleanup: () => void } {
  const dir = join(tmpdir(), `nexpath-install-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return { dir, cleanup: () => { try { rmSync(dir, { recursive: true }); } catch { /* ignore */ } } };
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

// ── buildStandardEntry ────────────────────────────────────────────────────────

describe('buildStandardEntry', () => {
  it('returns npx form on non-Windows', () => {
    const entry = buildStandardEntry(false);
    expect(entry).toEqual({ command: 'npx', args: ['-y', 'nexpath-serve'] });
  });

  it('returns cmd /c npx form on Windows', () => {
    const entry = buildStandardEntry(true);
    expect(entry).toEqual({ command: 'cmd', args: ['/c', 'npx', '-y', 'nexpath-serve'] });
  });
});

// ── buildClineEntry ───────────────────────────────────────────────────────────

describe('buildClineEntry', () => {
  it('non-Windows has npx command', () => {
    const entry = buildClineEntry(false);
    expect(entry.command).toBe('npx');
    expect(entry.args).toEqual(['-y', 'nexpath-serve']);
  });

  it('Windows has cmd /c command', () => {
    const entry = buildClineEntry(true);
    expect(entry.command).toBe('cmd');
    expect(entry.args).toEqual(['/c', 'npx', '-y', 'nexpath-serve']);
  });

  it('includes disabled: false', () => {
    expect(buildClineEntry(false).disabled).toBe(false);
  });

  it('does not include alwaysAllow (capture_prompt removed)', () => {
    expect(buildClineEntry(false)).not.toHaveProperty('alwaysAllow');
  });

  it('does NOT include a type field', () => {
    expect(buildClineEntry(false)).not.toHaveProperty('type');
  });
});

// ── buildKiloEntry ────────────────────────────────────────────────────────────

describe('buildKiloEntry', () => {
  it('includes type: stdio', () => {
    expect(buildKiloEntry(false).type).toBe('stdio');
  });

  it('non-Windows has npx command', () => {
    expect(buildKiloEntry(false).command).toBe('npx');
  });

  it('Windows has cmd /c command', () => {
    expect(buildKiloEntry(true).command).toBe('cmd');
  });

  it('includes disabled: false', () => {
    expect(buildKiloEntry(false).disabled).toBe(false);
  });

  it('does not include alwaysAllow (capture_prompt removed)', () => {
    expect(buildKiloEntry(false)).not.toHaveProperty('alwaysAllow');
  });
});

// ── buildOpenCodeEntry ────────────────────────────────────────────────────────

describe('buildOpenCodeEntry', () => {
  it('type is local', () => {
    expect(buildOpenCodeEntry(false).type).toBe('local');
  });

  it('command is an array (not a string) on non-Windows', () => {
    const { command } = buildOpenCodeEntry(false);
    expect(Array.isArray(command)).toBe(true);
    expect(command).toEqual(['npx', '-y', 'nexpath-serve']);
  });

  it('command array includes cmd /c prefix on Windows', () => {
    const { command } = buildOpenCodeEntry(true);
    expect(command).toEqual(['cmd', '/c', 'npx', '-y', 'nexpath-serve']);
  });

  it('enabled is true', () => {
    expect(buildOpenCodeEntry(false).enabled).toBe(true);
  });

  it('does NOT have a disabled field', () => {
    expect(buildOpenCodeEntry(false)).not.toHaveProperty('disabled');
  });
});

// ── getClinePath ──────────────────────────────────────────────────────────────

describe('getClinePath', () => {
  it('win32 starts from appdata', () => {
    const p = getClinePath('/home/u', 'C:\\AppData\\Roaming', 'win32');
    expect(p).toContain('saoudrizwan.claude-dev');
    expect(p.startsWith('C:')).toBe(true);
  });

  it('darwin uses Library/Application Support', () => {
    const p = getClinePath('/Users/u', '/unused', 'darwin');
    expect(p).toContain('Library');
    expect(p).toContain('Application Support');
    expect(p).toContain('saoudrizwan.claude-dev');
  });

  it('linux uses .config', () => {
    const p = getClinePath('/home/u', '/unused', 'linux');
    expect(p).toContain('.config');
    expect(p).toContain('saoudrizwan.claude-dev');
  });

  it('ends with cline_mcp_settings.json', () => {
    expect(getClinePath('/h', '/a', 'linux').endsWith('cline_mcp_settings.json')).toBe(true);
  });
});

// ── getRooCodePath ────────────────────────────────────────────────────────────

describe('getRooCodePath', () => {
  it('win32 starts from appdata', () => {
    const p = getRooCodePath('/home/u', 'C:\\AppData\\Roaming', 'win32');
    expect(p).toContain('rooveterinaryinc.roo-cline');
    expect(p.startsWith('C:')).toBe(true);
  });

  it('darwin uses Library/Application Support', () => {
    const p = getRooCodePath('/Users/u', '/unused', 'darwin');
    expect(p).toContain('Library');
    expect(p).toContain('rooveterinaryinc.roo-cline');
  });

  it('linux uses .config', () => {
    const p = getRooCodePath('/home/u', '/unused', 'linux');
    expect(p).toContain('.config');
    expect(p).toContain('rooveterinaryinc.roo-cline');
  });

  it('ends with cline_mcp_settings.json', () => {
    expect(getRooCodePath('/h', '/a', 'linux').endsWith('cline_mcp_settings.json')).toBe(true);
  });
});

// ── resolveAgentPaths ─────────────────────────────────────────────────────────

describe('resolveAgentPaths', () => {
  it('claudeJson is under home', () => {
    const paths = resolveAgentPaths('/home/u', '/appdata', '/cwd');
    expect(paths.claudeJson).toBe(join('/home/u', '.claude.json'));
  });

  it('cursor is under home/.cursor', () => {
    const paths = resolveAgentPaths('/home/u', '/appdata', '/cwd');
    expect(paths.cursor).toBe(join('/home/u', '.cursor', 'mcp.json'));
  });

  it('windsurf is under home/.codeium/windsurf', () => {
    const paths = resolveAgentPaths('/home/u', '/appdata', '/cwd');
    expect(paths.windsurf).toBe(join('/home/u', '.codeium', 'windsurf', 'mcp_config.json'));
  });

  it('kiloCode is under cwd/.kilocode', () => {
    const paths = resolveAgentPaths('/home/u', '/appdata', '/cwd');
    expect(paths.kiloCode).toBe(join('/cwd', '.kilocode', 'mcp.json'));
  });

  it('openCodeProject is opencode.json under cwd', () => {
    const paths = resolveAgentPaths('/home/u', '/appdata', '/cwd');
    expect(paths.openCodeProject).toBe(join('/cwd', 'opencode.json'));
  });
});

// ── detectAgents ──────────────────────────────────────────────────────────────

describe('detectAgents', () => {
  it('always includes Claude Code (home dir is always present)', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const agents = detectAgents(paths);
      expect(agents.some((a) => a.id === 'claude')).toBe(true);
    } finally { cleanup(); }
  });

  it('Claude Code type is claude-cli', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const agents = detectAgents(paths);
      const claude = agents.find((a) => a.id === 'claude')!;
      expect(claude.type).toBe('claude-cli');
    } finally { cleanup(); }
  });

  it('detects Cursor when ~/.cursor/ directory exists', () => {
    const { dir, cleanup } = tmpDir();
    try {
      mkdirSync(join(dir, '.cursor'), { recursive: true });
      const paths = resolveAgentPaths(dir, dir, dir);
      const agents = detectAgents(paths);
      expect(agents.some((a) => a.id === 'cursor')).toBe(true);
    } finally { cleanup(); }
  });

  it('does not detect Cursor when ~/.cursor/ is absent', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const agents = detectAgents(paths);
      expect(agents.some((a) => a.id === 'cursor')).toBe(false);
    } finally { cleanup(); }
  });

  it('detects Windsurf when ~/.codeium/windsurf/ exists', () => {
    const { dir, cleanup } = tmpDir();
    try {
      mkdirSync(join(dir, '.codeium', 'windsurf'), { recursive: true });
      const paths = resolveAgentPaths(dir, dir, dir);
      const agents = detectAgents(paths);
      expect(agents.some((a) => a.id === 'windsurf')).toBe(true);
    } finally { cleanup(); }
  });

  it('detects KiloCode when .kilocode/ dir exists in CWD', () => {
    const { dir, cleanup } = tmpDir();
    try {
      mkdirSync(join(dir, '.kilocode'), { recursive: true });
      const paths = resolveAgentPaths(dir, dir, dir);
      const agents = detectAgents(paths);
      expect(agents.some((a) => a.id === 'kiloCode')).toBe(true);
    } finally { cleanup(); }
  });

  it('does not detect KiloCode when .kilocode/ is absent from CWD', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const agents = detectAgents(paths);
      expect(agents.some((a) => a.id === 'kiloCode')).toBe(false);
    } finally { cleanup(); }
  });

  it('detects OpenCode via global config dir', () => {
    const { dir, cleanup } = tmpDir();
    try {
      mkdirSync(join(dir, '.config', 'opencode'), { recursive: true });
      const paths = resolveAgentPaths(dir, dir, dir);
      const agents = detectAgents(paths);
      expect(agents.some((a) => a.id === 'openCode')).toBe(true);
    } finally { cleanup(); }
  });

  it('detects OpenCode via project-level opencode.json when global dir absent', () => {
    const { dir, cleanup } = tmpDir();
    try {
      writeFileSync(join(dir, 'opencode.json'), '{}');
      const paths = resolveAgentPaths(dir, dir, dir);
      const agents = detectAgents(paths);
      expect(agents.some((a) => a.id === 'openCode')).toBe(true);
    } finally { cleanup(); }
  });

  it('does not detect OpenCode when neither path exists', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const agents = detectAgents(paths);
      expect(agents.some((a) => a.id === 'openCode')).toBe(false);
    } finally { cleanup(); }
  });

  it('Cursor type is standard', () => {
    const { dir, cleanup } = tmpDir();
    try {
      mkdirSync(join(dir, '.cursor'), { recursive: true });
      const paths = resolveAgentPaths(dir, dir, dir);
      const cursor = detectAgents(paths).find((a) => a.id === 'cursor')!;
      expect(cursor.type).toBe('standard');
    } finally { cleanup(); }
  });
});

// ── writeMcpEntry ─────────────────────────────────────────────────────────────

describe('writeMcpEntry', () => {
  it('creates the file with mcpServers key if it does not exist', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'mcp.json');
      writeMcpEntry(file, buildStandardEntry(false));
      const data = readJson(file);
      expect((data.mcpServers as Record<string, unknown>)[MCP_SERVER_NAME]).toBeDefined();
    } finally { cleanup(); }
  });

  it('creates parent directories if missing', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'nested', 'deep', 'mcp.json');
      writeMcpEntry(file, buildStandardEntry(false));
      const data = readJson(file);
      expect((data.mcpServers as Record<string, unknown>)[MCP_SERVER_NAME]).toBeDefined();
    } finally { cleanup(); }
  });

  it('preserves existing mcpServers entries', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'mcp.json');
      writeFileSync(file, JSON.stringify({ mcpServers: { 'other-server': { command: 'other' } } }));
      writeMcpEntry(file, buildStandardEntry(false));
      const servers = readJson(file).mcpServers as Record<string, unknown>;
      expect(servers['other-server']).toBeDefined();
      expect(servers[MCP_SERVER_NAME]).toBeDefined();
    } finally { cleanup(); }
  });

  it('preserves top-level keys other than mcpServers', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'mcp.json');
      writeFileSync(file, JSON.stringify({ version: 1, mcpServers: {} }));
      writeMcpEntry(file, buildStandardEntry(false));
      expect((readJson(file) as { version: number }).version).toBe(1);
    } finally { cleanup(); }
  });

  it('overwrites an existing nexpath entry', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'mcp.json');
      writeMcpEntry(file, { command: 'old' });
      writeMcpEntry(file, buildStandardEntry(false));
      const servers = readJson(file).mcpServers as Record<string, unknown>;
      expect((servers[MCP_SERVER_NAME] as { command: string }).command).toBe('npx');
    } finally { cleanup(); }
  });

  it('writes valid JSON', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'mcp.json');
      writeMcpEntry(file, buildStandardEntry(false));
      expect(() => JSON.parse(readFileSync(file, 'utf8'))).not.toThrow();
    } finally { cleanup(); }
  });
});

// ── removeMcpEntry ────────────────────────────────────────────────────────────

describe('removeMcpEntry', () => {
  it('returns false if the file does not exist', () => {
    const { dir, cleanup } = tmpDir();
    try {
      expect(removeMcpEntry(join(dir, 'nonexistent.json'))).toBe(false);
    } finally { cleanup(); }
  });

  it('returns false if nexpath key is not in mcpServers', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'mcp.json');
      writeFileSync(file, JSON.stringify({ mcpServers: { other: {} } }));
      expect(removeMcpEntry(file)).toBe(false);
    } finally { cleanup(); }
  });

  it('returns true and removes the nexpath key', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'mcp.json');
      writeMcpEntry(file, buildStandardEntry(false));
      expect(removeMcpEntry(file)).toBe(true);
      const servers = readJson(file).mcpServers as Record<string, unknown>;
      expect(servers[MCP_SERVER_NAME]).toBeUndefined();
    } finally { cleanup(); }
  });

  it('preserves other mcpServers entries when removing', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'mcp.json');
      writeFileSync(file, JSON.stringify({ mcpServers: { 'other-server': { command: 'x' } } }));
      writeMcpEntry(file, buildStandardEntry(false));
      removeMcpEntry(file);
      const servers = readJson(file).mcpServers as Record<string, unknown>;
      expect(servers['other-server']).toBeDefined();
      expect(servers[MCP_SERVER_NAME]).toBeUndefined();
    } finally { cleanup(); }
  });
});

// ── writeOpenCodeEntry ────────────────────────────────────────────────────────

describe('writeOpenCodeEntry', () => {
  it('creates file with $schema and mcp key', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'opencode.json');
      writeOpenCodeEntry(file, buildOpenCodeEntry(false));
      const data = readJson(file);
      expect(data.$schema).toBe('https://opencode.ai/config.json');
      expect((data.mcp as Record<string, unknown>)[MCP_SERVER_NAME]).toBeDefined();
    } finally { cleanup(); }
  });

  it('preserves existing $schema if already set', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'opencode.json');
      writeFileSync(file, JSON.stringify({ $schema: 'https://custom.schema.json', mcp: {} }));
      writeOpenCodeEntry(file, buildOpenCodeEntry(false));
      expect((readJson(file) as { $schema: string }).$schema).toBe('https://custom.schema.json');
    } finally { cleanup(); }
  });

  it('preserves other mcp entries', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'opencode.json');
      writeFileSync(file, JSON.stringify({ mcp: { 'other-mcp': { type: 'local', command: ['x'] } } }));
      writeOpenCodeEntry(file, buildOpenCodeEntry(false));
      const mcp = readJson(file).mcp as Record<string, unknown>;
      expect(mcp['other-mcp']).toBeDefined();
      expect(mcp[MCP_SERVER_NAME]).toBeDefined();
    } finally { cleanup(); }
  });

  it('entry has type local, array command, enabled true', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'opencode.json');
      writeOpenCodeEntry(file, buildOpenCodeEntry(false));
      const entry = ((readJson(file).mcp as Record<string, unknown>)[MCP_SERVER_NAME]) as {
        type: string; command: string[]; enabled: boolean;
      };
      expect(entry.type).toBe('local');
      expect(Array.isArray(entry.command)).toBe(true);
      expect(entry.enabled).toBe(true);
    } finally { cleanup(); }
  });
});

// ── removeOpenCodeEntry ───────────────────────────────────────────────────────

describe('removeOpenCodeEntry', () => {
  it('returns false if file does not exist', () => {
    const { dir, cleanup } = tmpDir();
    try {
      expect(removeOpenCodeEntry(join(dir, 'opencode.json'))).toBe(false);
    } finally { cleanup(); }
  });

  it('returns false if nexpath key is absent from mcp', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'opencode.json');
      writeFileSync(file, JSON.stringify({ mcp: { other: {} } }));
      expect(removeOpenCodeEntry(file)).toBe(false);
    } finally { cleanup(); }
  });

  it('removes the nexpath key and returns true', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'opencode.json');
      writeOpenCodeEntry(file, buildOpenCodeEntry(false));
      expect(removeOpenCodeEntry(file)).toBe(true);
      const mcp = readJson(file).mcp as Record<string, unknown>;
      expect(mcp[MCP_SERVER_NAME]).toBeUndefined();
    } finally { cleanup(); }
  });

  it('preserves other mcp entries when removing', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'opencode.json');
      writeFileSync(file, JSON.stringify({ mcp: { 'other-mcp': { type: 'local' } } }));
      writeOpenCodeEntry(file, buildOpenCodeEntry(false));
      removeOpenCodeEntry(file);
      const mcp = readJson(file).mcp as Record<string, unknown>;
      expect(mcp['other-mcp']).toBeDefined();
      expect(mcp[MCP_SERVER_NAME]).toBeUndefined();
    } finally { cleanup(); }
  });
});

// ── claudeCliInstall / Uninstall ──────────────────────────────────────────────

describe('claudeCliInstall', () => {
  it('returns true when execFn does not throw', () => {
    expect(claudeCliInstall(() => {})).toBe(true);
  });

  it('passes the correct command string to execFn', () => {
    let captured = '';
    claudeCliInstall((cmd) => { captured = cmd; });
    expect(captured).toContain('claude mcp add');
    expect(captured).toContain('--scope user');
    expect(captured).toContain(MCP_SERVER_NAME);
    expect(captured).toContain('npx -y nexpath-serve');
  });

  it('returns false when execFn throws', () => {
    expect(claudeCliInstall(() => { throw new Error('not found'); })).toBe(false);
  });
});

describe('claudeCliUninstall', () => {
  it('returns true when execFn does not throw', () => {
    expect(claudeCliUninstall(() => {})).toBe(true);
  });

  it('passes claude mcp remove command to execFn', () => {
    let captured = '';
    claudeCliUninstall((cmd) => { captured = cmd; });
    expect(captured).toContain('claude mcp remove');
    expect(captured).toContain(MCP_SERVER_NAME);
  });

  it('returns false when execFn throws', () => {
    expect(claudeCliUninstall(() => { throw new Error('not found'); })).toBe(false);
  });
});

// ── installAction ─────────────────────────────────────────────────────────────

describe('installAction', () => {
  it('prints no-agents message when only Claude Code is detected and it is the sole agent', async () => {
    // Use a fake home that doesn't exist at all to prevent any agent dir detection
    // Claude Code is always detected — test with --yes so we don't prompt
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, {
        paths,
        isWin: false,
        execFn: () => {},   // claude CLI succeeds
        skipClipboardCheck: true,
      });
      const output = spy.mock.calls.map((c) => c[0] as string).join('\n');
      expect(output).toContain('Claude Code');
    } finally {
      cleanup();
    }
  });

  it('with --yes skips confirmation and proceeds', async () => {
    const { dir, cleanup } = tmpDir();
    const confirmSpy = vi.fn(async () => true);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {}, confirmFn: confirmSpy, skipClipboardCheck: true });
      expect(confirmSpy).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('cancelled by confirmFn — prints Cancelled and writes nothing', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({}, { paths, isWin: false, execFn: () => {}, confirmFn: async () => false, skipClipboardCheck: true });
      expect(spy.mock.calls.some((c) => (c[0] as string).includes('Cancelled'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  // REGISTER_MCP_SERVER = false: MCP config files are NOT written for non-claude-cli agents.
  // These tests verify that behaviour — re-enable and flip assertions when MCP tools are added.
  it('does not write Cursor MCP config while REGISTER_MCP_SERVER is false', async () => {
    const { dir, cleanup } = tmpDir();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      mkdirSync(join(dir, '.cursor'), { recursive: true });
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {}, skipClipboardCheck: true });
      expect(() => readJson(paths.cursor)).toThrow();
    } finally {
      cleanup();
    }
  });

  it('does not write Windsurf MCP config while REGISTER_MCP_SERVER is false', async () => {
    const { dir, cleanup } = tmpDir();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      mkdirSync(join(dir, '.codeium', 'windsurf'), { recursive: true });
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {}, skipClipboardCheck: true });
      expect(() => readJson(paths.windsurf)).toThrow();
    } finally {
      cleanup();
    }
  });

  it('does not write KiloCode MCP config while REGISTER_MCP_SERVER is false', async () => {
    const { dir, cleanup } = tmpDir();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      mkdirSync(join(dir, '.kilocode'), { recursive: true });
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {}, skipClipboardCheck: true });
      expect(() => readJson(paths.kiloCode)).toThrow();
    } finally {
      cleanup();
    }
  });

  it('does not write OpenCode MCP config while REGISTER_MCP_SERVER is false', async () => {
    const { dir, cleanup } = tmpDir();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      mkdirSync(join(dir, '.config', 'opencode'), { recursive: true });
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {}, skipClipboardCheck: true });
      expect(() => readJson(paths.openCodeGlobal)).toThrow();
    } finally {
      cleanup();
    }
  });

  it('does not fall back to file write for claude-cli when REGISTER_MCP_SERVER is false', async () => {
    const { dir, cleanup } = tmpDir();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, {
        paths,
        isWin: false,
        execFn: () => { throw new Error('claude not found'); },
        skipClipboardCheck: true,
      });
      expect(() => readJson(paths.claudeJson)).toThrow();
    } finally {
      cleanup();
    }
  });

  it('prints restart and status instructions on success', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {}, skipClipboardCheck: true });
      const output = spy.mock.calls.map((c) => c[0] as string).join('\n');
      expect(output).toContain('Restart your agents');
      expect(output).toContain('nexpath status');
    } finally {
      cleanup();
    }
  });

  it('still writes advisory hook when isWin is true (REGISTER_MCP_SERVER has no effect on hooks)', async () => {
    const { dir, cleanup } = tmpDir();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: true, execFn: () => {}, skipClipboardCheck: true });
      const data = readJson(paths.claudeSettings) as Record<string, unknown>;
      const hooks = data.hooks as Record<string, unknown>;
      const groups = hooks.UserPromptSubmit as Array<Record<string, unknown>>;
      expect(groups.some((g) => g._nexpath_hook === true)).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('writes advisory hook to claudeSettings when claude CLI succeeds', async () => {
    const { dir, cleanup } = tmpDir();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {}, skipClipboardCheck: true });
      const data  = readJson(paths.claudeSettings) as Record<string, unknown>;
      const hooks = data.hooks as Record<string, unknown>;
      const groups = hooks.UserPromptSubmit as Array<Record<string, unknown>>;
      expect(groups.some((g) => g._nexpath_hook === true)).toBe(true);
      const stopGroups = hooks.Stop as Array<Record<string, unknown>>;
      expect(stopGroups.some((g) => g._nexpath_hook === true)).toBe(true);
    } finally { cleanup(); }
  });

  it('writes advisory hook to claudeSettings even when claude CLI falls back', async () => {
    const { dir, cleanup } = tmpDir();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, {
        paths,
        isWin: false,
        execFn: () => { throw new Error('claude not found'); },
        skipClipboardCheck: true,
      });
      const data  = readJson(paths.claudeSettings) as Record<string, unknown>;
      const hooks = data.hooks as Record<string, unknown>;
      const groups = hooks.UserPromptSubmit as Array<Record<string, unknown>>;
      expect(groups.some((g) => g._nexpath_hook === true)).toBe(true);
      const stopGroups = hooks.Stop as Array<Record<string, unknown>>;
      expect(stopGroups.some((g) => g._nexpath_hook === true)).toBe(true);
    } finally { cleanup(); }
  });

  it('hook write failure is non-blocking — prints warning and install continues', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      // Create .claude as a FILE — writeJson's mkdirSync will fail (ENOTDIR)
      writeFileSync(join(dir, '.claude'), 'not-a-directory');
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {}, skipClipboardCheck: true });
      const output = spy.mock.calls.map((c) => c[0] as string).join('\n');
      expect(output).toContain('hook write failed');
      // MCP registration still happened (install did not abort)
      expect(output).toContain('Claude Code');
    } finally { cleanup(); }
  });

  it('prints advisory pipeline auto-wired note after agent loop', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {}, skipClipboardCheck: true });
      const output = spy.mock.calls.map((c) => c[0] as string).join('\n');
      expect(output).toContain('advisory pipeline');
      expect(output).toContain('Claude Code only');
    } finally { cleanup(); }
  });
});

// ── uninstallAction ───────────────────────────────────────────────────────────

describe('uninstallAction', () => {
  it('always prints prompt history retention message', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({ paths, execFn: () => {} });
      const output = spy.mock.calls.map((c) => c[0] as string).join('\n');
      expect(output).toContain('Prompt history retained');
      expect(output).toContain('nexpath store delete');
    } finally {
      cleanup();
    }
  });

  it('removes Cursor config entry', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      mkdirSync(join(dir, '.cursor'), { recursive: true });
      const paths = resolveAgentPaths(dir, dir, dir);
      writeMcpEntry(paths.cursor, buildStandardEntry(false));
      await uninstallAction({ paths, execFn: () => {} });
      const servers = readJson(paths.cursor).mcpServers as Record<string, unknown>;
      expect(servers[MCP_SERVER_NAME]).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it('removes OpenCode config entry', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      mkdirSync(join(dir, '.config', 'opencode'), { recursive: true });
      const paths = resolveAgentPaths(dir, dir, dir);
      writeOpenCodeEntry(paths.openCodeGlobal, buildOpenCodeEntry(false));
      await uninstallAction({ paths, execFn: () => {} });
      const mcp = readJson(paths.openCodeGlobal).mcp as Record<string, unknown>;
      expect(mcp[MCP_SERVER_NAME]).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it('prints "not registered, skipped" for agents with no config', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      mkdirSync(join(dir, '.cursor'), { recursive: true });
      const paths = resolveAgentPaths(dir, dir, dir);
      // Don't write cursor config — so cursor has no nexpath entry
      await uninstallAction({ paths, execFn: () => {} });
      const output = spy.mock.calls.map((c) => c[0] as string).join('\n');
      expect(output).toContain('not registered');
    } finally {
      cleanup();
    }
  });

  it('falls back to file edit when claude CLI fails during uninstall', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      writeMcpEntry(paths.claudeJson, buildStandardEntry(false));
      await uninstallAction({
        paths,
        execFn: () => { throw new Error('claude not found'); },
      });
      const servers = readJson(paths.claudeJson).mcpServers as Record<string, unknown>;
      expect(servers[MCP_SERVER_NAME]).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it('removes advisory hook from claudeSettings and prints advisory hook removed', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      // Pre-write the hook so uninstall has something to remove
      writeHookEntry(paths.claudeSettings, dir, 'linux');
      await uninstallAction({ paths, execFn: () => {} });
      // File should no longer contain the nexpath hook group
      const data  = readJson(paths.claudeSettings) as Record<string, unknown>;
      const hooks = data.hooks as Record<string, unknown>;
      expect(hooks.UserPromptSubmit).toBeUndefined();
      const output = spy.mock.calls.map((c) => c[0] as string).join('\n');
      expect(output).toContain('advisory hook removed');
    } finally { cleanup(); }
  });

  it('reports hook not registered when no settings file exists', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      // settings.json never written — hook was never registered
      await uninstallAction({ paths, execFn: () => {} });
      const output = spy.mock.calls.map((c) => c[0] as string).join('\n');
      expect(output).toContain('hook not registered');
    } finally { cleanup(); }
  });
});

// ── getClaudeSettingsPath ─────────────────────────────────────────────────────

describe('getClaudeSettingsPath', () => {
  it('returns path inside .claude directory', () => {
    const p = getClaudeSettingsPath('/home/user');
    expect(p).toContain('.claude');
    expect(p.endsWith('settings.json')).toBe(true);
  });

  it('is separate from .claude.json (MCP config)', () => {
    const settings = getClaudeSettingsPath('/home/user');
    expect(settings).not.toBe(join('/home/user', '.claude.json'));
  });
});

// ── buildHookCommand ──────────────────────────────────────────────────────────

describe('buildHookCommand', () => {
  it('starts with node prefix', () => {
    const cmd = buildHookCommand('/home/user', 'linux');
    expect(cmd.startsWith('node "')).toBe(true);
  });

  it('contains auto --db flags', () => {
    const cmd = buildHookCommand('/home/user', 'linux');
    expect(cmd).toContain('" auto --db "');
  });

  it('db path ends with prompt-store.db', () => {
    const cmd = buildHookCommand('/home/user', 'linux');
    expect(cmd).toContain('prompt-store.db"');
  });

  it('db path includes .nexpath directory', () => {
    const cmd = buildHookCommand('/home/user', 'linux');
    expect(cmd).toContain('.nexpath');
  });

  it('uses forward slashes on Windows (no backslashes)', () => {
    const cmd = buildHookCommand('C:\\Users\\Test', 'win32');
    expect(cmd).not.toContain('\\');
  });

  it('cli path is absolute (not relative)', () => {
    const cmd = buildHookCommand('/home/user', 'linux');
    const match = /^node "([^"]+)"/.exec(cmd);
    expect(match).not.toBeNull();
    const cliPath = match![1];
    expect(cliPath.startsWith('/') || /^[A-Za-z]:/.test(cliPath)).toBe(true);
  });
});

// ── buildStopHookCommand ──────────────────────────────────────────────────────

describe('buildStopHookCommand', () => {
  it('contains stop --db', () => {
    const cmd = buildStopHookCommand('/home/user', 'linux');
    expect(cmd).toContain('stop --db');
  });

  it('contains the nexpath db path', () => {
    const cmd = buildStopHookCommand('/home/user', 'linux');
    expect(cmd).toContain('.nexpath/prompt-store.db');
  });

  it('starts with node "..."', () => {
    const cmd = buildStopHookCommand('/home/user', 'linux');
    expect(cmd).toMatch(/^node "/);
  });

  it('uses forward slashes on Windows', () => {
    const cmd = buildStopHookCommand('C:\\Users\\Test', 'win32');
    expect(cmd).not.toContain('\\');
  });
});

// ── buildHookEntry ────────────────────────────────────────────────────────────

describe('buildHookEntry', () => {
  it('has UserPromptSubmit key', () => {
    const entry = buildHookEntry('/home/user', 'linux');
    expect(entry).toHaveProperty('UserPromptSubmit');
  });

  it('has Stop key', () => {
    const entry = buildHookEntry('/home/user', 'linux');
    expect(entry).toHaveProperty('Stop');
  });

  it('UserPromptSubmit is an array', () => {
    const entry = buildHookEntry('/home/user', 'linux');
    expect(Array.isArray(entry.UserPromptSubmit)).toBe(true);
  });

  it('Stop is an array', () => {
    const entry = buildHookEntry('/home/user', 'linux');
    expect(Array.isArray(entry.Stop)).toBe(true);
  });

  it('UserPromptSubmit hook group has _nexpath_hook: true marker', () => {
    const entry  = buildHookEntry('/home/user', 'linux');
    const groups = entry.UserPromptSubmit as Array<Record<string, unknown>>;
    expect(groups[0]._nexpath_hook).toBe(true);
  });

  it('Stop hook group has _nexpath_hook: true marker', () => {
    const entry  = buildHookEntry('/home/user', 'linux');
    const groups = entry.Stop as Array<Record<string, unknown>>;
    expect(groups[0]._nexpath_hook).toBe(true);
  });

  it('matcher is empty string (fires on all prompts)', () => {
    const entry  = buildHookEntry('/home/user', 'linux');
    const groups = entry.UserPromptSubmit as Array<Record<string, unknown>>;
    expect(groups[0].matcher).toBe('');
  });

  it('Stop matcher is empty string', () => {
    const entry  = buildHookEntry('/home/user', 'linux');
    const groups = entry.Stop as Array<Record<string, unknown>>;
    expect(groups[0].matcher).toBe('');
  });

  it('inner hooks array has one entry with type command', () => {
    const entry  = buildHookEntry('/home/user', 'linux');
    const groups = entry.UserPromptSubmit as Array<Record<string, unknown>>;
    const hooks  = groups[0].hooks as Array<Record<string, unknown>>;
    expect(hooks).toHaveLength(1);
    expect(hooks[0].type).toBe('command');
  });

  it('does NOT include a timeout field (uses Claude Code default)', () => {
    const entry  = buildHookEntry('/home/user', 'linux');
    const groups = entry.UserPromptSubmit as Array<Record<string, unknown>>;
    const hooks  = groups[0].hooks as Array<Record<string, unknown>>;
    expect(hooks[0]).not.toHaveProperty('timeout');
  });

  it('UserPromptSubmit hook command contains nexpath auto --db', () => {
    const entry  = buildHookEntry('/home/user', 'linux');
    const groups = entry.UserPromptSubmit as Array<Record<string, unknown>>;
    const hooks  = groups[0].hooks as Array<Record<string, unknown>>;
    expect(hooks[0].command as string).toContain('auto --db');
  });

  it('Stop hook command contains nexpath stop --db', () => {
    const entry  = buildHookEntry('/home/user', 'linux');
    const groups = entry.Stop as Array<Record<string, unknown>>;
    const hooks  = groups[0].hooks as Array<Record<string, unknown>>;
    expect(hooks[0].command as string).toContain('stop --db');
  });
});

// ── writeHookEntry ────────────────────────────────────────────────────────────

describe('writeHookEntry', () => {
  it('creates settings.json with UserPromptSubmit hook when file is absent', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'settings.json');
      writeHookEntry(file, '/home/user', 'linux');
      const data  = readJson(file) as Record<string, unknown>;
      const hooks = data.hooks as Record<string, unknown>;
      expect(hooks).toHaveProperty('UserPromptSubmit');
    } finally { cleanup(); }
  });

  it('creates settings.json with Stop hook when file is absent', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'settings.json');
      writeHookEntry(file, '/home/user', 'linux');
      const data  = readJson(file) as Record<string, unknown>;
      const hooks = data.hooks as Record<string, unknown>;
      expect(hooks).toHaveProperty('Stop');
    } finally { cleanup(); }
  });

  it('preserves existing UserPromptSubmit hooks from other tools', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'settings.json');
      writeFileSync(file, JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            { matcher: 'UserPromptSubmit', hooks: [{ type: 'command', command: 'other-tool' }] },
          ],
        },
      }), 'utf8');
      writeHookEntry(file, '/home/user', 'linux');
      const data   = readJson(file) as Record<string, unknown>;
      const hooks  = data.hooks as Record<string, unknown>;
      const groups = hooks.UserPromptSubmit as Array<Record<string, unknown>>;
      expect(groups.length).toBe(2);
      const commands = groups.flatMap(
        (g) => (g.hooks as Array<Record<string, unknown>>).map((h) => h.command as string),
      );
      expect(commands).toContain('other-tool');
      expect(commands.some((c) => c.includes('auto --db'))).toBe(true);
    } finally { cleanup(); }
  });

  it('replaces prior nexpath hook on reinstall without duplicating', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'settings.json');
      writeHookEntry(file, '/home/user', 'linux');
      writeHookEntry(file, '/home/user', 'linux');
      const data    = readJson(file) as Record<string, unknown>;
      const hooks   = data.hooks as Record<string, unknown>;
      const groups  = hooks.UserPromptSubmit as Array<Record<string, unknown>>;
      const nexpath = groups.filter((g) => g._nexpath_hook);
      expect(nexpath).toHaveLength(1);
    } finally { cleanup(); }
  });

  it('replaces prior Stop hook on reinstall without duplicating', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'settings.json');
      writeHookEntry(file, '/home/user', 'linux');
      writeHookEntry(file, '/home/user', 'linux');
      const data    = readJson(file) as Record<string, unknown>;
      const hooks   = data.hooks as Record<string, unknown>;
      const groups  = hooks.Stop as Array<Record<string, unknown>>;
      const nexpath = groups.filter((g) => g._nexpath_hook);
      expect(nexpath).toHaveLength(1);
    } finally { cleanup(); }
  });

  it('preserves existing Stop hooks from other tools when writing', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'settings.json');
      writeFileSync(file, JSON.stringify({
        hooks: {
          Stop: [
            { matcher: '', hooks: [{ type: 'command', command: 'other-stop-tool' }] },
          ],
        },
      }), 'utf8');
      writeHookEntry(file, '/home/user', 'linux');
      const data   = readJson(file) as Record<string, unknown>;
      const hooks  = data.hooks as Record<string, unknown>;
      const groups = hooks.Stop as Array<Record<string, unknown>>;
      expect(groups.length).toBe(2);
      const commands = groups.flatMap(
        (g) => (g.hooks as Array<Record<string, unknown>>).map((h) => h.command as string),
      );
      expect(commands).toContain('other-stop-tool');
      expect(commands.some((c) => c.includes('stop --db'))).toBe(true);
    } finally { cleanup(); }
  });

  it('creates parent directory if it does not exist', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'nested', 'settings.json');
      writeHookEntry(file, '/home/user', 'linux');
      const data = readJson(file) as Record<string, unknown>;
      expect(data).toHaveProperty('hooks');
    } finally { cleanup(); }
  });
});

// ── removeHookEntry ───────────────────────────────────────────────────────────

describe('removeHookEntry', () => {
  it('returns false when settings.json does not exist', () => {
    const absent = join(tmpdir(), `nexpath-absent-${randomUUID()}.json`);
    expect(removeHookEntry(absent)).toBe(false);
  });

  it('returns false when file has no hooks key', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'settings.json');
      writeFileSync(file, JSON.stringify({}), 'utf8');
      expect(removeHookEntry(file)).toBe(false);
    } finally { cleanup(); }
  });

  it('returns false when nexpath hook is absent', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'settings.json');
      writeFileSync(file, JSON.stringify({ hooks: {} }), 'utf8');
      expect(removeHookEntry(file)).toBe(false);
    } finally { cleanup(); }
  });

  it('removes nexpath hook group and returns true', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'settings.json');
      writeHookEntry(file, '/home/user', 'linux');
      expect(removeHookEntry(file)).toBe(true);
      const data  = readJson(file) as Record<string, unknown>;
      const hooks = data.hooks as Record<string, unknown>;
      expect(hooks.UserPromptSubmit).toBeUndefined();
      expect(hooks.Stop).toBeUndefined();
    } finally { cleanup(); }
  });

  it('preserves non-nexpath UserPromptSubmit hooks when removing', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'settings.json');
      writeFileSync(file, JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            { matcher: 'UserPromptSubmit', hooks: [{ type: 'command', command: 'other-tool' }] },
            { _nexpath_hook: true, matcher: 'UserPromptSubmit', hooks: [{ type: 'command', command: 'node "/x" auto --db "/y"' }] },
          ],
        },
      }), 'utf8');
      removeHookEntry(file);
      const data   = readJson(file) as Record<string, unknown>;
      const hooks  = data.hooks as Record<string, unknown>;
      const groups = hooks.UserPromptSubmit as Array<Record<string, unknown>>;
      expect(groups).toHaveLength(1);
      const cmd = (groups[0].hooks as Array<Record<string, unknown>>)[0].command;
      expect(cmd).toBe('other-tool');
    } finally { cleanup(); }
  });

  it('returns false on second call (idempotent)', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const file = join(dir, 'settings.json');
      writeHookEntry(file, '/home/user', 'linux');
      removeHookEntry(file);
      expect(removeHookEntry(file)).toBe(false);
    } finally { cleanup(); }
  });
});

// ── installAction — first-run disclosure (Issue 7 + 1.2) ─────────────────────

describe('installAction — first-run disclosure', () => {
  it('shows disclosure when first_run_shown is not set in config', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      // dbPath ':memory:' = fresh DB, first_run_shown never set
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {}, dbPath: ':memory:', skipClipboardCheck: true });
      const output = spy.mock.calls.map((c) => c[0] as string).join('\n');
      expect(output).toContain('Before installing nexpath');
    } finally {
      spy.mockRestore();
      cleanup();
    }
  });

  it('does NOT show disclosure when first_run_shown is already set', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const dbPath = join(dir, 'test.db');
    try {
      // Pre-seed first_run_shown
      const store = await openStore(dbPath);
      setConfig(store, 'first_run_shown', 'true');
      closeStore(store);

      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {}, dbPath, skipClipboardCheck: true });
      const output = spy.mock.calls.map((c) => c[0] as string).join('\n');
      expect(output).not.toContain('Before installing nexpath');
    } finally {
      spy.mockRestore();
      cleanup();
    }
  });

  it('disclosure contains OpenAI API key mention', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {}, dbPath: ':memory:', skipClipboardCheck: true });
      const output = spy.mock.calls.map((c) => c[0] as string).join('\n');
      expect(output).toContain('OPENAI_API_KEY');
    } finally {
      spy.mockRestore();
      cleanup();
    }
  });

  it('disclosure contains local storage path mention', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {}, dbPath: ':memory:', skipClipboardCheck: true });
      const output = spy.mock.calls.map((c) => c[0] as string).join('\n');
      expect(output).toContain('prompt-store.db');
    } finally {
      spy.mockRestore();
      cleanup();
    }
  });

  it('disclosure contains opt-out instructions (Ctrl+X and nexpath uninstall)', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {}, dbPath: ':memory:', skipClipboardCheck: true });
      const output = spy.mock.calls.map((c) => c[0] as string).join('\n');
      expect(output).toContain('Ctrl+X');
      expect(output).toContain('nexpath uninstall');
    } finally {
      spy.mockRestore();
      cleanup();
    }
  });

  it('sets first_run_shown in config after disclosure', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const dbPath = join(dir, 'test.db');
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {}, dbPath, skipClipboardCheck: true });

      // Re-open same DB and check key is set
      const store = await openStore(dbPath);
      const result = isConfigSet(store.db, 'first_run_shown');
      closeStore(store);
      expect(result).toBe(true);
    } finally {
      spy.mockRestore();
      cleanup();
    }
  });

  it('disclosure fires before confirmation — shown even when confirmFn cancels', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({}, {
        paths, isWin: false, execFn: () => {},
        confirmFn: async () => false,
        dbPath: ':memory:',
        skipClipboardCheck: true,
      });
      const output = spy.mock.calls.map((c) => c[0] as string).join('\n');
      // Disclosure appeared even though install was cancelled
      expect(output).toContain('Before installing nexpath');
      expect(output).toContain('Cancelled');
    } finally {
      spy.mockRestore();
      cleanup();
    }
  });
});

// ── resolveAgentPaths — claudeSettings field ──────────────────────────────────

describe('resolveAgentPaths — claudeSettings', () => {
  it('includes claudeSettings pointing inside .claude directory', () => {
    const paths = resolveAgentPaths('/home/user', '/appdata', '/cwd', 'linux');
    expect(paths.claudeSettings).toContain('.claude');
    expect(paths.claudeSettings.endsWith('settings.json')).toBe(true);
  });

  it('claudeSettings is different from claudeJson', () => {
    const paths = resolveAgentPaths('/home/user', '/appdata', '/cwd', 'linux');
    expect(paths.claudeSettings).not.toBe(paths.claudeJson);
  });
});

// ── ensureLinuxClipboard ──────────────────────────────────────────────────────

describe('ensureLinuxClipboard', () => {
  const mockSpawn = vi.fn();
  const mockExec  = vi.fn();

  afterEach(() => vi.restoreAllMocks());

  it('skips on macOS (pbcopy built-in)', async () => {
    await ensureLinuxClipboard({ platform: 'darwin', spawnFn: mockSpawn as any });
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('skips on Windows (clip.exe built-in)', async () => {
    await ensureLinuxClipboard({ platform: 'win32', spawnFn: mockSpawn as any });
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('skips on Linux when xclip is already installed', async () => {
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' && args[0] === 'xclip') return { status: 0 };
      return { status: 1 };
    });
    const logSpy = vi.spyOn(console, 'log');
    await ensureLinuxClipboard({ platform: 'linux', spawnFn: mockSpawn as any });
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('xclip'));
  });

  it('skips on Linux when wl-copy is installed (no xclip)', async () => {
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' && args[0] === 'wl-copy') return { status: 0 };
      return { status: 1 };
    });
    const logSpy = vi.spyOn(console, 'log');
    await ensureLinuxClipboard({ platform: 'linux', spawnFn: mockSpawn as any });
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('xclip'));
  });

  it('skips on Linux when xsel is installed (no xclip, no wl-copy)', async () => {
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' && args[0] === 'xsel') return { status: 0 };
      return { status: 1 };
    });
    const logSpy = vi.spyOn(console, 'log');
    await ensureLinuxClipboard({ platform: 'linux', spawnFn: mockSpawn as any });
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('xclip'));
  });

  it('warns when no clipboard tool and no package manager found', async () => {
    mockSpawn.mockReturnValue({ status: 1 });
    const logSpy = vi.spyOn(console, 'log');
    await ensureLinuxClipboard({ platform: 'linux', spawnFn: mockSpawn as any });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No clipboard tool'));
  });

  it('calls execSync with apt install when user confirms and verifies', async () => {
    let installed = false;
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' && args[0] === 'apt') return { status: 0 };
      if (cmd === 'which' && args[0] === 'xclip') return { status: installed ? 0 : 1 };
      return { status: 1 };
    });
    mockExec.mockImplementation(() => { installed = true; });
    const logSpy = vi.spyOn(console, 'log');
    await ensureLinuxClipboard({
      platform: 'linux',
      spawnFn: mockSpawn as any,
      execFn: mockExec as any,
      confirmFn: async () => true,
    });
    expect(mockExec).toHaveBeenCalledWith('sudo apt install -y xclip', { stdio: 'inherit' });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('installed successfully'));
  });

  it('calls execSync with dnf install when user confirms on Fedora/RHEL', async () => {
    let installed = false;
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' && args[0] === 'dnf') return { status: 0 };
      if (cmd === 'which' && args[0] === 'xclip') return { status: installed ? 0 : 1 };
      return { status: 1 };
    });
    mockExec.mockImplementation(() => { installed = true; });
    await ensureLinuxClipboard({
      platform: 'linux',
      spawnFn: mockSpawn as any,
      execFn: mockExec as any,
      confirmFn: async () => true,
    });
    expect(mockExec).toHaveBeenCalledWith('sudo dnf install -y xclip', { stdio: 'inherit' });
  });

  it('calls execSync with pacman install when user confirms on Arch/Manjaro', async () => {
    let installed = false;
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' && args[0] === 'pacman') return { status: 0 };
      if (cmd === 'which' && args[0] === 'xclip') return { status: installed ? 0 : 1 };
      return { status: 1 };
    });
    mockExec.mockImplementation(() => { installed = true; });
    await ensureLinuxClipboard({
      platform: 'linux',
      spawnFn: mockSpawn as any,
      execFn: mockExec as any,
      confirmFn: async () => true,
    });
    expect(mockExec).toHaveBeenCalledWith('sudo pacman -S --noconfirm xclip', { stdio: 'inherit' });
  });

  it('does not call execSync when user declines', async () => {
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' && args[0] === 'apt') return { status: 0 };
      return { status: 1 };
    });
    const logSpy = vi.spyOn(console, 'log');
    await ensureLinuxClipboard({
      platform: 'linux',
      spawnFn: mockSpawn as any,
      execFn: mockExec as any,
      confirmFn: async () => false,
    });
    expect(mockExec).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Skipped'));
  });

  it('warns but does not crash when install command fails', async () => {
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' && args[0] === 'dnf') return { status: 0 };
      return { status: 1 };
    });
    mockExec.mockImplementation(() => { throw new Error('sudo failed'); });
    const logSpy = vi.spyOn(console, 'log');
    await ensureLinuxClipboard({
      platform: 'linux',
      spawnFn: mockSpawn as any,
      execFn: mockExec as any,
      confirmFn: async () => true,
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('installation failed'));
  });

  // ── Phase 3: --yes flag, post-install verify, Wayland ─────────────────────

  it('autoConfirm skips prompt and installs directly', async () => {
    let installed = false;
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' && args[0] === 'apt') return { status: 0 };
      if (cmd === 'which' && args[0] === 'xclip') return { status: installed ? 0 : 1 };
      return { status: 1 };
    });
    mockExec.mockImplementation(() => { installed = true; });
    const mockConfirm = vi.fn();
    await ensureLinuxClipboard({
      platform: 'linux',
      spawnFn: mockSpawn as any,
      execFn: mockExec as any,
      confirmFn: mockConfirm as any,
      autoConfirm: true,
    });
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockExec).toHaveBeenCalledWith('sudo apt install -y xclip', { stdio: 'inherit' });
  });

  it('warns when post-install verification fails (tool not found after exec)', async () => {
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' && args[0] === 'apt') return { status: 0 };
      // xclip still not found even after install
      return { status: 1 };
    });
    const logSpy = vi.spyOn(console, 'log');
    await ensureLinuxClipboard({
      platform: 'linux',
      spawnFn: mockSpawn as any,
      execFn: mockExec as any,
      confirmFn: async () => true,
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });

  it('installs wl-clipboard instead of xclip on Wayland', async () => {
    let installed = false;
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' && args[0] === 'apt') return { status: 0 };
      if (cmd === 'which' && args[0] === 'wl-copy') return { status: installed ? 0 : 1 };
      return { status: 1 };
    });
    mockExec.mockImplementation(() => { installed = true; });
    const logSpy = vi.spyOn(console, 'log');
    await ensureLinuxClipboard({
      platform: 'linux',
      spawnFn: mockSpawn as any,
      execFn: mockExec as any,
      confirmFn: async () => true,
      waylandDisplay: 'wayland-0',
    });
    expect(mockExec).toHaveBeenCalledWith('sudo apt install -y wl-clipboard', { stdio: 'inherit' });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('wl-clipboard installed successfully'));
  });

  it('shows wl-copy in prompt message on Wayland', async () => {
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' && args[0] === 'apt') return { status: 0 };
      return { status: 1 };
    });
    const logSpy = vi.spyOn(console, 'log');
    await ensureLinuxClipboard({
      platform: 'linux',
      spawnFn: mockSpawn as any,
      execFn: mockExec as any,
      confirmFn: async () => false,
      waylandDisplay: 'wayland-0',
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('wl-copy'));
  });
});
