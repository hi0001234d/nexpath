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

  it('config registers set and get sub-commands', () => {
    const prog = createProgram();
    const configCmd = prog.commands.find((c) => c.name() === 'config')!;
    const subNames = configCmd.commands.map((c) => c.name());
    expect(subNames).toEqual(expect.arrayContaining(['set', 'get']));
  });

  it('store registers enable, disable, delete, and prune sub-commands', () => {
    const prog = createProgram();
    const storeCmd = prog.commands.find((c) => c.name() === 'store')!;
    const subNames = storeCmd.commands.map((c) => c.name());
    expect(subNames).toEqual(expect.arrayContaining(['enable', 'disable', 'delete', 'prune']));
  });
});

// Stub commands — these still print "not yet implemented"
// Config + store commands are wired to real handlers; tested in commands/*.test.ts


describe('nexpath CLI — guidance stubs', () => {
  it('auto prints stub message', async () => {
    const out = await run('auto');
    expect(out[0]).toBe('[nexpath auto] — not yet implemented');
  });

  it('optimize prints stub message', async () => {
    const out = await run('optimize');
    expect(out[0]).toBe('[nexpath optimize] — not yet implemented');
  });
});

describe('nexpath CLI — status stub', () => {
  it('status prints stub message', async () => {
    const out = await run('status');
    expect(out[0]).toBe('[nexpath status] — not yet implemented');
  });
});
