import { describe, it, expect, vi } from 'vitest';
import { createProgram } from './index.js';

async function run(...args: string[]) {
  // Fresh Commander instance per call — avoids option state bleed between tests
  const prog = createProgram();
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  await prog.parseAsync(['node', 'nexpath', ...args]);
  const calls = spy.mock.calls.map((c) => c[0] as string);
  spy.mockRestore();
  return calls;
}

describe('nexpath CLI — metadata', () => {
  it('version is 0.1.1', () => {
    expect(createProgram().version()).toBe('0.1.1');
  });

  it('name is nexpath', () => {
    expect(createProgram().name()).toBe('nexpath');
  });

  it('registers all expected top-level commands', () => {
    const names = createProgram().commands.map((c) => c.name());
    expect(names).toEqual(
      expect.arrayContaining(['install', 'uninstall', 'init', 'auto', 'optimize', 'status', 'config', 'store'])
    );
  });

  it('config registers set, get, and unset sub-commands', () => {
    const prog = createProgram();
    const configCmd = prog.commands.find((c) => c.name() === 'config')!;
    const subNames = configCmd.commands.map((c) => c.name());
    expect(subNames).toEqual(expect.arrayContaining(['set', 'get', 'unset']));
  });

  it('store registers enable, disable, delete, and prune sub-commands', () => {
    const prog = createProgram();
    const storeCmd = prog.commands.find((c) => c.name() === 'store')!;
    const subNames = storeCmd.commands.map((c) => c.name());
    expect(subNames).toEqual(expect.arrayContaining(['enable', 'disable', 'delete', 'prune']));
  });
});

// Remaining stubs (items 15/16 — not yet started)
// Config + store + auto commands are wired to real handlers; tested in commands/*.test.ts

describe('nexpath CLI — auto command registration', () => {
  it('auto command is registered with --project and --db options', () => {
    const prog   = createProgram();
    const autoCmd = prog.commands.find((c) => c.name() === 'auto')!;
    expect(autoCmd).toBeDefined();
    const longFlags = autoCmd.options.map((o) => o.long);
    expect(longFlags).toContain('--project');
    expect(longFlags).toContain('--db');
  });

  it('auto command description mentions advisory pipeline', () => {
    const prog    = createProgram();
    const autoCmd = prog.commands.find((c) => c.name() === 'auto')!;
    expect(autoCmd.description()).toContain('advisory pipeline');
  });
});

describe('nexpath CLI — optimize command registration', () => {
  it('optimize command is registered with --project and --db options', () => {
    const prog       = createProgram();
    const optCmd = prog.commands.find((c) => c.name() === 'optimize')!;
    expect(optCmd).toBeDefined();
    const longFlags = optCmd.options.map((o) => o.long);
    expect(longFlags).toContain('--project');
    expect(longFlags).toContain('--db');
  });

  it('optimize command description mentions skipped suggestions', () => {
    const prog   = createProgram();
    const optCmd = prog.commands.find((c) => c.name() === 'optimize')!;
    expect(optCmd.description()).toContain('skipped');
  });

  it('optimize prints "No skipped items" when queue is empty', async () => {
    // run() captures console.log; optimize writes to stdout directly —
    // capture stdout instead
    const lines: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      lines.push(String(chunk));
      return true;
    });
    const prog = createProgram();
    await prog.parseAsync(['node', 'nexpath', 'optimize', '--db', ':memory:']);
    spy.mockRestore();
    expect(lines.join('')).toContain('No skipped items');
  });
});

describe('nexpath CLI — status command', () => {
  it('status command is registered with --db option', () => {
    const prog    = createProgram();
    const statCmd = prog.commands.find((c) => c.name() === 'status')!;
    expect(statCmd).toBeDefined();
    const longFlags = statCmd.options.map((o) => o.long);
    expect(longFlags).toContain('--db');
  });

  it('status description mentions MCP connections', () => {
    const prog    = createProgram();
    const statCmd = prog.commands.find((c) => c.name() === 'status')!;
    expect(statCmd.description().toLowerCase()).toContain('mcp');
  });

  it('status prints MCP connections section to stdout', async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      lines.push(String(chunk));
      return true;
    });
    const prog = createProgram();
    await prog.parseAsync(['node', 'nexpath', 'status', '--db', ':memory:']);
    spy.mockRestore();
    expect(lines.join('')).toContain('MCP connections');
  });
});
