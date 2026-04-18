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
});

describe('nexpath CLI — lifecycle stubs', () => {
  it('install prints stub message', async () => {
    const out = await run('install');
    expect(out[0]).toBe('[nexpath install] — not yet implemented');
  });

  it('uninstall prints stub message', async () => {
    const out = await run('uninstall');
    expect(out[0]).toBe('[nexpath uninstall] — not yet implemented');
  });

  it('init prints stub message', async () => {
    const out = await run('init');
    expect(out[0]).toBe('[nexpath init] — not yet implemented');
  });
});

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

describe('nexpath CLI — config sub-commands', () => {
  it('config set <key> <value> prints stub message', async () => {
    const out = await run('config', 'set', 'language_override', 'en');
    expect(out[0]).toBe('[nexpath config set language_override en] — not yet implemented');
  });

  it('config get <key> prints stub message', async () => {
    const out = await run('config', 'get', 'language_override');
    expect(out[0]).toBe('[nexpath config get language_override] — not yet implemented');
  });
});

describe('nexpath CLI — store sub-commands', () => {
  it('store delete prints stub message', async () => {
    const out = await run('store', 'delete');
    expect(out[0]).toBe('[nexpath store delete] — not yet implemented');
  });

  it('store disable prints stub message', async () => {
    const out = await run('store', 'disable');
    expect(out[0]).toBe('[nexpath store disable] — not yet implemented');
  });

  it('store prune --older-than 30d prints stub message', async () => {
    const out = await run('store', 'prune', '--older-than', '30d');
    expect(out[0]).toBe('[nexpath store prune --older-than 30d] — not yet implemented');
  });

  it('store prune without --older-than uses ? placeholder', async () => {
    const out = await run('store', 'prune');
    expect(out[0]).toBe('[nexpath store prune --older-than ?] — not yet implemented');
  });
});
