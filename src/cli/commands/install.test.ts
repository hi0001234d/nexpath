import { describe, it, expect, vi, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

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

  it('includes alwaysAllow with capture_prompt', () => {
    expect(buildClineEntry(false).alwaysAllow).toContain('capture_prompt');
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

  it('includes alwaysAllow with capture_prompt', () => {
    expect(buildKiloEntry(false).alwaysAllow).toContain('capture_prompt');
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
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {}, confirmFn: confirmSpy });
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
      await installAction({}, { paths, isWin: false, execFn: () => {}, confirmFn: async () => false });
      expect(spy.mock.calls.some((c) => (c[0] as string).includes('Cancelled'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('writes Cursor config file when Cursor is detected', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      mkdirSync(join(dir, '.cursor'), { recursive: true });
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {} });
      const data = readJson(paths.cursor);
      expect((data.mcpServers as Record<string, unknown>)[MCP_SERVER_NAME]).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it('writes Windsurf config file when Windsurf is detected', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      mkdirSync(join(dir, '.codeium', 'windsurf'), { recursive: true });
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {} });
      const data = readJson(paths.windsurf);
      expect((data.mcpServers as Record<string, unknown>)[MCP_SERVER_NAME]).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it('writes KiloCode config with type:stdio when detected', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      mkdirSync(join(dir, '.kilocode'), { recursive: true });
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {} });
      const entry = ((readJson(paths.kiloCode).mcpServers as Record<string, unknown>)[MCP_SERVER_NAME]) as { type: string };
      expect(entry.type).toBe('stdio');
    } finally {
      cleanup();
    }
  });

  it('writes OpenCode config with mcp key when detected', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      mkdirSync(join(dir, '.config', 'opencode'), { recursive: true });
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {} });
      const data = readJson(paths.openCodeGlobal);
      expect((data.mcp as Record<string, unknown>)[MCP_SERVER_NAME]).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it('falls back to file write when Claude CLI fails', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, {
        paths,
        isWin: false,
        execFn: () => { throw new Error('claude not found'); },
      });
      const data = readJson(paths.claudeJson);
      expect((data.mcpServers as Record<string, unknown>)[MCP_SERVER_NAME]).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it('prints restart and status instructions on success', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: false, execFn: () => {} });
      const output = spy.mock.calls.map((c) => c[0] as string).join('\n');
      expect(output).toContain('Restart your agents');
      expect(output).toContain('nexpath status');
    } finally {
      cleanup();
    }
  });

  it('writes Windows cmd/c format when isWin is true', async () => {
    const { dir, cleanup } = tmpDir();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      mkdirSync(join(dir, '.cursor'), { recursive: true });
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, { paths, isWin: true, execFn: () => {} });
      const entry = ((readJson(paths.cursor).mcpServers as Record<string, unknown>)[MCP_SERVER_NAME]) as { command: string };
      expect(entry.command).toBe('cmd');
    } finally {
      cleanup();
    }
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
});
