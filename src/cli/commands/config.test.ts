import { describe, it, expect, vi, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { openStore, closeStore, setConfig, deleteConfig } from '../../store/index.js';
import { configGetAction, configSetAction, configUnsetAction } from './config.js';

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
    expect(spy.mock.calls[0][0]).toBe('prompt_capture_enabled = true');
    cleanup();
  });

  it('prints the built-in default for prompt_store_max_per_project', async () => {
    const { path, cleanup } = await tempDb();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await configGetAction('prompt_store_max_per_project', path);
    expect(spy.mock.calls[0][0]).toBe('prompt_store_max_per_project = 500');
    cleanup();
  });

  it('prints (not set) for an unknown key', async () => {
    const { path, cleanup } = await tempDb();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await configGetAction('completely_unknown_key', path);
    expect(spy.mock.calls[0][0]).toBe('completely_unknown_key = (not set)');
    cleanup();
  });

  it('reads a value that was stored in a previous open/close cycle', async () => {
    const { path, cleanup } = await tempDb((store) => {
      setConfig(store, 'prompt_capture_enabled', 'false');
    });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await configGetAction('prompt_capture_enabled', path);
    expect(spy.mock.calls[0][0]).toBe('prompt_capture_enabled = false');
    cleanup();
  });
});

describe('deleteConfig', () => {
  it('deletes an existing key so getConfig returns the default', async () => {
    const { path, cleanup } = await tempDb((store) => {
      setConfig(store, 'log_level', 'debug');
    });
    const store = await openStore(path);
    deleteConfig(store, 'log_level');
    closeStore(store);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await configGetAction('log_level', path);
    expect(spy.mock.calls[0][0]).toBe('log_level = info'); // reverts to built-in default
    cleanup();
  });

  it('does not throw when key does not exist', async () => {
    const { path, cleanup } = await tempDb();
    const store = await openStore(path);
    expect(() => deleteConfig(store, 'nonexistent_key')).not.toThrow();
    closeStore(store);
    cleanup();
  });
});

describe('configUnsetAction', () => {
  it('prints "<key> unset" confirmation', async () => {
    const { path, cleanup } = await tempDb((store) => {
      setConfig(store, 'log_level', 'debug');
    });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await configUnsetAction('log_level', path);
    expect(spy.mock.calls[0][0]).toBe('log_level unset');
    cleanup();
  });

  it('removes the key so configGetAction returns the built-in default', async () => {
    const { path, cleanup } = await tempDb((store) => {
      setConfig(store, 'log_level', 'debug');
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await configUnsetAction('log_level', path);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await configGetAction('log_level', path);
    expect(spy.mock.calls[0][0]).toBe('log_level = info'); // back to default
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
    expect(spy.mock.calls[0][0]).toBe('prompt_store_max_per_project = 1000');
    cleanup();
  });

  it('overwrites an existing value', async () => {
    const { path, cleanup } = await tempDb();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await configSetAction('prompt_store_max_per_project', '200', path);
    await configSetAction('prompt_store_max_per_project', '750', path);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await configGetAction('prompt_store_max_per_project', path);
    expect(spy.mock.calls[0][0]).toBe('prompt_store_max_per_project = 750');
    cleanup();
  });
});
