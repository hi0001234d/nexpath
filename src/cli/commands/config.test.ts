import { describe, it, expect, vi, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { openStore, closeStore, setConfig, saveStore } from '../../store/index.js';
import { configGetAction, configSetAction } from './config.js';

// Creates a real temp DB, optionally pre-populates it, closes it (flushed to disk).
async function tempDb(setup?: (store: Awaited<ReturnType<typeof openStore>>) => void) {
  const path = join(tmpdir(), `nexpath-test-${randomUUID()}.db`);
  const store = await openStore(path);
  setup?.(store);
  closeStore(store);
  return {
    path,
    cleanup: () => { try { rmSync(path); } catch { /* ignore */ } },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('configGetAction', () => {
  it('prints the built-in default for prompt_capture_enabled', async () => {
    const { path, cleanup } = await tempDb();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await configGetAction('prompt_capture_enabled', path);
    expect(spy.mock.calls[0][0]).toBe('true');
    cleanup();
  });

  it('prints the built-in default for prompt_store_max_per_project', async () => {
    const { path, cleanup } = await tempDb();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await configGetAction('prompt_store_max_per_project', path);
    expect(spy.mock.calls[0][0]).toBe('500');
    cleanup();
  });

  it('prints (not set) for an unknown key', async () => {
    const { path, cleanup } = await tempDb();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await configGetAction('completely_unknown_key', path);
    expect(spy.mock.calls[0][0]).toBe('(not set)');
    cleanup();
  });

  it('reads a value that was stored in a previous open/close cycle', async () => {
    const { path, cleanup } = await tempDb((store) => {
      setConfig(store, 'prompt_capture_enabled', 'false');
    });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await configGetAction('prompt_capture_enabled', path);
    expect(spy.mock.calls[0][0]).toBe('false');
    cleanup();
  });
});

describe('configSetAction', () => {
  it('prints "key = value" confirmation', async () => {
    const { path, cleanup } = await tempDb();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await configSetAction('prompt_capture_enabled', 'false', path);
    expect(spy.mock.calls[0][0]).toBe('prompt_capture_enabled = false');
    cleanup();
  });

  it('persisted value is readable by configGetAction', async () => {
    const { path, cleanup } = await tempDb();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await configSetAction('prompt_store_max_per_project', '1000', path);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await configGetAction('prompt_store_max_per_project', path);
    expect(spy.mock.calls[0][0]).toBe('1000');
    cleanup();
  });

  it('overwrites an existing value', async () => {
    const { path, cleanup } = await tempDb();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await configSetAction('prompt_store_max_per_project', '200', path);
    await configSetAction('prompt_store_max_per_project', '750', path);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await configGetAction('prompt_store_max_per_project', path);
    expect(spy.mock.calls[0][0]).toBe('750');
    cleanup();
  });
});
