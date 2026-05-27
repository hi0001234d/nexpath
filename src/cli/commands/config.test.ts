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

describe('configSetAction — advisory_frequency validation', () => {
  it('accepts all valid advisory_frequency values', async () => {
    const validLevels = ['off', 'major_only', 'once_per_session', 'every_event', 'optimum'];
    for (const level of validLevels) {
      const { path, cleanup } = await tempDb();
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await configSetAction('advisory_frequency', level, path);
      expect(spy.mock.calls[0][0]).toBe(`advisory_frequency = ${level}`);
      cleanup();
    }
  });

  it('rejects an invalid advisory_frequency value with console.error and process.exit(1)', async () => {
    const { path, cleanup } = await tempDb();
    const errSpy  = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as (code?: string | number | null | undefined) => never);
    await expect(configSetAction('advisory_frequency', 'always', path)).rejects.toThrow('process.exit called');
    expect(errSpy.mock.calls[0][0]).toContain('Invalid advisory_frequency "always"');
    expect(exitSpy).toHaveBeenCalledWith(1);
    cleanup();
  });

  it('accepts empty string for advisory_frequency (clears value)', async () => {
    const { path, cleanup } = await tempDb();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await configSetAction('advisory_frequency', '', path);
    expect(spy.mock.calls[0][0]).toBe('advisory_frequency = ');
    cleanup();
  });

  it('validates project-scoped advisory_frequency key and rejects invalid value', async () => {
    const { path, cleanup } = await tempDb();
    const errSpy  = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as (code?: string | number | null | undefined) => never);
    await expect(configSetAction('advisory_frequency:/some/project', 'always', path)).rejects.toThrow('process.exit called');
    expect(errSpy.mock.calls[0][0]).toContain('Invalid advisory_frequency "always"');
    expect(exitSpy).toHaveBeenCalledWith(1);
    cleanup();
  });

  it('accepts "optimum" as a valid advisory_frequency level', async () => {
    const { path, cleanup } = await tempDb();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await configSetAction('advisory_frequency', 'optimum', path);
    expect(spy.mock.calls[0][0]).toBe('advisory_frequency = optimum');
    cleanup();
  });
});

describe('configSetAction — role validation', () => {
  it('accepts a valid role value and stores it', async () => {
    const { path, cleanup } = await tempDb();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await configSetAction('role', 'founder', path);
    expect(spy.mock.calls[0][0]).toBe('role = founder');
    cleanup();
  });

  it('accepts "vibe_coder" as a valid role value and stores it', async () => {
    const { path, cleanup } = await tempDb();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await configSetAction('role', 'vibe_coder', path);
    expect(spy.mock.calls[0][0]).toBe('role = vibe_coder');
    cleanup();
  });

  it('accepts "vibe_coder" for a project-scoped role key', async () => {
    const { path, cleanup } = await tempDb();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await configSetAction('role:/some/project', 'vibe_coder', path);
    expect(spy.mock.calls[0][0]).toBe('role:/some/project = vibe_coder');
    cleanup();
  });

  it('rejects an invalid role value with console.error and process.exit(1)', async () => {
    const { path, cleanup } = await tempDb();
    const errSpy  = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as (code?: string | number | null | undefined) => never);
    await expect(configSetAction('role', 'developer', path)).rejects.toThrow('process.exit called');
    expect(errSpy.mock.calls[0][0]).toContain('Invalid role "developer"');
    expect(exitSpy).toHaveBeenCalledWith(1);
    cleanup();
  });

  it('error message for invalid role lists all four valid roles', async () => {
    const { path, cleanup } = await tempDb();
    const errSpy  = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as (code?: string | number | null | undefined) => never);
    await expect(configSetAction('role', 'developer', path)).rejects.toThrow('process.exit called');
    const message = errSpy.mock.calls[0][0] as string;
    expect(message).toContain('founder');
    expect(message).toContain('indie_hacker');
    expect(message).toContain('pm');
    expect(message).toContain('vibe_coder');
    expect(exitSpy).toHaveBeenCalledWith(1);
    cleanup();
  });

  it('accepts empty string for role key (clears role)', async () => {
    const { path, cleanup } = await tempDb();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await configSetAction('role', '', path);
    expect(spy.mock.calls[0][0]).toBe('role = ');
    cleanup();
  });

  it('validates project-scoped role key and rejects invalid value', async () => {
    const { path, cleanup } = await tempDb();
    const errSpy  = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as (code?: string | number | null | undefined) => never);
    await expect(configSetAction('role:/some/project', 'developer', path)).rejects.toThrow('process.exit called');
    expect(errSpy.mock.calls[0][0]).toContain('Invalid role "developer"');
    expect(exitSpy).toHaveBeenCalledWith(1);
    cleanup();
  });
});
