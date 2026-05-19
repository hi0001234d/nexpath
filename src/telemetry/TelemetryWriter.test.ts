import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openStore, type Store } from '../store/db.js';
import { setConfig } from '../store/config.js';
import { _resetIdentityCache } from './identity.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual };
});

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TelemetryWriter — hook latency budget (Plan §18)', () => {
  it('1000 writeTelemetry calls complete in under 500ms (avg <0.5ms/call)', async () => {
    const { writeTelemetry } = await import('./TelemetryWriter.js');
    const fs = await import('node:fs');
    vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);
    vi.spyOn(fs, 'statSync').mockReturnValue({ size: 100 } as ReturnType<typeof fs.statSync>);

    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      writeTelemetry('/tmp/proj', 'prompt_received', { promptCount: i });
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  it('writeTelemetry has no static dependency on the sync module — telemetry_sync_enabled does not alter the writer code path', async () => {
    const { writeTelemetry } = await import('./TelemetryWriter.js');
    const fs = await import('node:fs');
    const appends: string[] = [];
    vi.spyOn(fs, 'appendFileSync').mockImplementation((_p, data) => { appends.push(String(data)); });
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);
    vi.spyOn(fs, 'statSync').mockReturnValue({ size: 100 } as ReturnType<typeof fs.statSync>);

    writeTelemetry('/tmp/proj', 'prompt_received', { promptCount: 1 });
    expect(appends).toHaveLength(1);
    const written = JSON.parse(appends[0].trim());
    expect(written.event).toBe('prompt_received');
  });

  it('with a real store where telemetry_sync_enabled=true, 1000 writeTelemetry calls still complete in <500ms', async () => {
    const { writeTelemetry } = await import('./TelemetryWriter.js');
    const fs = await import('node:fs');
    vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);
    vi.spyOn(fs, 'statSync').mockReturnValue({ size: 100 } as ReturnType<typeof fs.statSync>);

    const store = await openStore(':memory:');
    try {
      setConfig(store, 'telemetry_sync_enabled', 'true');
      setConfig(store, 'telemetry.enabled',      'true');

      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        writeTelemetry('/tmp/proj', 'prompt_received', { promptCount: i }, store);
      }
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(500);
    } finally {
      store.db.close();
    }
  });
});

describe('TelemetryWriter — writeTelemetry', () => {
  beforeEach(() => {
    vi.resetModules();
    _resetIdentityCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _resetIdentityCache();
  });

  it('creates the directory and writes on first call when file does not exist', async () => {
    const { writeTelemetry, TELEMETRY_PATH } = await import('./TelemetryWriter.js');
    const fs = await import('node:fs');

    const mkdirSpy  = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);
    const appendSpy = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    writeTelemetry('/tmp/proj', 'prompt_received');

    expect(mkdirSpy).toHaveBeenCalledWith(expect.stringContaining('.nexpath'), { recursive: true });
    expect(appendSpy).toHaveBeenCalledWith(TELEMETRY_PATH, expect.any(String), 'utf8');
  });

  it('written line is valid JSON', async () => {
    const { writeTelemetry, TELEMETRY_PATH } = await import('./TelemetryWriter.js');
    const fs = await import('node:fs');

    let written = '';
    vi.spyOn(fs, 'appendFileSync').mockImplementation((_p, data) => {
      if (_p === TELEMETRY_PATH) written += String(data);
    });
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

    writeTelemetry('/tmp/proj', 'prompt_classified', { stage: 'implementation', confidence: 0.9 });

    expect(() => JSON.parse(written.trim())).not.toThrow();
  });

  it('written line always contains ts, v, projectRoot, event', async () => {
    const { writeTelemetry, TELEMETRY_PATH } = await import('./TelemetryWriter.js');
    const fs = await import('node:fs');

    let written = '';
    vi.spyOn(fs, 'appendFileSync').mockImplementation((_p, data) => {
      if (_p === TELEMETRY_PATH) written += String(data);
    });
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

    writeTelemetry('/my/project', 'profile_computed', { nature: 'beginner' });

    const parsed = JSON.parse(written.trim()) as Record<string, unknown>;
    expect(typeof parsed['ts']).toBe('string');
    expect(parsed['v']).toBe(1);
    expect(parsed['projectRoot']).toBe('/my/project');
    expect(parsed['event']).toBe('profile_computed');
  });

  it('spreads extra data fields onto the record', async () => {
    const { writeTelemetry, TELEMETRY_PATH } = await import('./TelemetryWriter.js');
    const fs = await import('node:fs');

    let written = '';
    vi.spyOn(fs, 'appendFileSync').mockImplementation((_p, data) => {
      if (_p === TELEMETRY_PATH) written += String(data);
    });
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

    writeTelemetry('/proj', 'prompt_classified', { stage: 'implementation', confidence: 0.87 });

    const parsed = JSON.parse(written.trim()) as Record<string, unknown>;
    expect(parsed['stage']).toBe('implementation');
    expect(parsed['confidence']).toBe(0.87);
  });

  it('rotates file by renaming when size exceeds 5MB', async () => {
    const { writeTelemetry, TELEMETRY_PATH } = await import('./TelemetryWriter.js');
    const fs = await import('node:fs');

    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {});
    vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'statSync').mockReturnValue({ size: 6 * 1024 * 1024 } as ReturnType<typeof fs.statSync>);

    writeTelemetry('/proj', 'pipeline_no_action', { reason: 'no_flag' });

    expect(renameSpy).toHaveBeenCalledWith(TELEMETRY_PATH, `${TELEMETRY_PATH}.1`);
  });

  it('does not rotate when file is under 5MB', async () => {
    const { writeTelemetry } = await import('./TelemetryWriter.js');
    const fs = await import('node:fs');

    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {});
    vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 } as ReturnType<typeof fs.statSync>);

    writeTelemetry('/proj', 'pipeline_no_action', { reason: 'no_flag' });

    expect(renameSpy).not.toHaveBeenCalled();
  });

  it('never throws even if appendFileSync throws', async () => {
    const { writeTelemetry } = await import('./TelemetryWriter.js');
    const fs = await import('node:fs');

    vi.spyOn(fs, 'appendFileSync').mockImplementation(() => { throw new Error('disk full'); });
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

    expect(() => writeTelemetry('/proj', 'prompt_received')).not.toThrow();
  });

  it('never throws even if rotate throws', async () => {
    const { writeTelemetry } = await import('./TelemetryWriter.js');
    const fs = await import('node:fs');

    vi.spyOn(fs, 'existsSync').mockImplementation(() => { throw new Error('fs error'); });
    vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});

    expect(() => writeTelemetry('/proj', 'prompt_received')).not.toThrow();
  });

  it('TELEMETRY_PATH is exported and contains telemetry.jsonl', async () => {
    const { TELEMETRY_PATH } = await import('./TelemetryWriter.js');
    expect(typeof TELEMETRY_PATH).toBe('string');
    expect(TELEMETRY_PATH).toContain('telemetry.jsonl');
  });

  // ── Identity-ID injection (Phase 1) ──────────────────────────────────────────

  describe('identity-ID injection when store is provided', () => {
    let store: Store;

    beforeEach(async () => {
      store = await openStore(':memory:');
    });

    afterEach(() => {
      store.db.close();
    });

    it('record carries installationId, userId, teamId when store is passed', async () => {
      const { writeTelemetry, TELEMETRY_PATH } = await import('./TelemetryWriter.js');
      const fs = await import('node:fs');

      let written = '';
      vi.spyOn(fs, 'appendFileSync').mockImplementation((_p, data) => {
        if (_p === TELEMETRY_PATH) written += String(data);
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

      writeTelemetry('/proj', 'prompt_received', { promptCount: 1 }, store);

      const parsed = JSON.parse(written.trim()) as Record<string, unknown>;
      expect(parsed['installationId']).toMatch(UUID_V4);
      expect(parsed['userId']).toMatch(UUID_V4);
      expect(parsed['teamId']).toMatch(UUID_V4);
    });

    it('record omits identity IDs when store is NOT passed', async () => {
      const { writeTelemetry, TELEMETRY_PATH } = await import('./TelemetryWriter.js');
      const fs = await import('node:fs');

      let written = '';
      vi.spyOn(fs, 'appendFileSync').mockImplementation((_p, data) => {
        if (_p === TELEMETRY_PATH) written += String(data);
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

      writeTelemetry('/proj', 'prompt_received', { promptCount: 1 });

      const parsed = JSON.parse(written.trim()) as Record<string, unknown>;
      expect(parsed).not.toHaveProperty('installationId');
      expect(parsed).not.toHaveProperty('userId');
      expect(parsed).not.toHaveProperty('teamId');
    });

    it('IDs are stable across multiple writes within the same process', async () => {
      const { writeTelemetry, TELEMETRY_PATH } = await import('./TelemetryWriter.js');
      const fs = await import('node:fs');

      const lines: string[] = [];
      vi.spyOn(fs, 'appendFileSync').mockImplementation((_p, data) => {
        if (_p === TELEMETRY_PATH) lines.push(String(data).trim());
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

      writeTelemetry('/proj', 'prompt_received', { promptCount: 1 }, store);
      writeTelemetry('/proj', 'prompt_classified', { stage: 'planning' }, store);

      const a = JSON.parse(lines[0]) as Record<string, string>;
      const b = JSON.parse(lines[1]) as Record<string, string>;
      expect(a['installationId']).toBe(b['installationId']);
      expect(a['userId']).toBe(b['userId']);
      expect(a['teamId']).toBe(b['teamId']);
    });

    it('IDs persist across a simulated process restart (close + reopen)', async () => {
      const { writeTelemetry, TELEMETRY_PATH } = await import('./TelemetryWriter.js');
      const fs = await import('node:fs');

      const lines: string[] = [];
      vi.spyOn(fs, 'appendFileSync').mockImplementation((_p, data) => {
        if (_p === TELEMETRY_PATH) lines.push(String(data).trim());
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

      writeTelemetry('/proj', 'prompt_received', { promptCount: 1 }, store);
      const first = JSON.parse(lines[0]) as Record<string, string>;

      // Simulate restart: same in-memory DB, but identity cache wiped.
      _resetIdentityCache();

      writeTelemetry('/proj', 'prompt_classified', { stage: 'planning' }, store);
      const second = JSON.parse(lines[1]) as Record<string, string>;

      expect(second['installationId']).toBe(first['installationId']);
      expect(second['userId']).toBe(first['userId']);
      expect(second['teamId']).toBe(first['teamId']);
    });

    it('still writes the record (without IDs) when identity-read throws', async () => {
      const { writeTelemetry, TELEMETRY_PATH } = await import('./TelemetryWriter.js');
      const fs = await import('node:fs');
      const identity = await import('./identity.js');

      let written = '';
      vi.spyOn(fs, 'appendFileSync').mockImplementation((_p, data) => {
        if (_p === TELEMETRY_PATH) written += String(data);
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

      // Force the first identity getter to throw — exercises the
      // try/catch fail-open path inside writeTelemetry.
      vi.spyOn(identity, 'getInstallationId').mockImplementation(() => {
        throw new Error('simulated config-read failure');
      });

      expect(() =>
        writeTelemetry('/proj', 'prompt_received', { promptCount: 1 }, store),
      ).not.toThrow();

      const parsed = JSON.parse(written.trim()) as Record<string, unknown>;
      // Record still landed with core fields intact …
      expect(parsed['event']).toBe('prompt_received');
      expect(parsed['promptCount']).toBe(1);
      // … but the 3 identity fields were skipped because the read failed.
      expect(parsed).not.toHaveProperty('installationId');
      expect(parsed).not.toHaveProperty('userId');
      expect(parsed).not.toHaveProperty('teamId');
    });

    it('accepts undefined data plus store (stop.ts:91 stop_no_pending shape)', async () => {
      const { writeTelemetry, TELEMETRY_PATH } = await import('./TelemetryWriter.js');
      const fs = await import('node:fs');

      let written = '';
      vi.spyOn(fs, 'appendFileSync').mockImplementation((_p, data) => {
        if (_p === TELEMETRY_PATH) written += String(data);
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

      writeTelemetry('/proj', 'stop_no_pending', undefined, store);

      const parsed = JSON.parse(written.trim()) as Record<string, unknown>;
      expect(parsed['event']).toBe('stop_no_pending');
      expect(parsed['installationId']).toMatch(UUID_V4);
      expect(parsed['userId']).toMatch(UUID_V4);
      expect(parsed['teamId']).toMatch(UUID_V4);
    });
  });

  // ── telemetry.enabled gate (Phase 2) ─────────────────────────────────────────

  describe('telemetry.enabled config gate', () => {
    let store: Store;

    beforeEach(async () => {
      store = await openStore(':memory:');
    });

    afterEach(() => {
      store.db.close();
    });

    it('writes happen by default when no config key is set (DEFAULT_CONFIG = true)', async () => {
      const { writeTelemetry } = await import('./TelemetryWriter.js');
      const fs = await import('node:fs');

      const appendSpy = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

      writeTelemetry('/proj', 'prompt_received', { promptCount: 1 }, store);

      expect(appendSpy).toHaveBeenCalledTimes(1);
    });

    it('writes happen when telemetry.enabled is explicitly set to "true"', async () => {
      setConfig(store, 'telemetry.enabled', 'true');
      const { writeTelemetry } = await import('./TelemetryWriter.js');
      const fs = await import('node:fs');

      const appendSpy = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

      writeTelemetry('/proj', 'prompt_received', { promptCount: 1 }, store);

      expect(appendSpy).toHaveBeenCalledTimes(1);
    });

    it('writes are silently skipped when telemetry.enabled is "false"', async () => {
      setConfig(store, 'telemetry.enabled', 'false');
      const { writeTelemetry } = await import('./TelemetryWriter.js');
      const fs = await import('node:fs');

      const appendSpy = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

      writeTelemetry('/proj', 'prompt_received', { promptCount: 1 }, store);

      expect(appendSpy).not.toHaveBeenCalled();
      // Gate runs BEFORE rotate(), so mkdirSync should not run either.
      expect(mkdirSpy).not.toHaveBeenCalled();
    });

    it('toggle false → true with cache reset resumes writes', async () => {
      // Pull writeTelemetry AND _resetEnabledCache from the same fresh module
      // instance — top-level imports are a different instance after resetModules.
      const tw = await import('./TelemetryWriter.js');
      const fs = await import('node:fs');

      const appendSpy = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

      // Step 1 — disabled, write skipped.
      setConfig(store, 'telemetry.enabled', 'false');
      tw.writeTelemetry('/proj', 'prompt_received', { promptCount: 1 }, store);
      expect(appendSpy).not.toHaveBeenCalled();

      // Step 2 — flip to true; without cache reset the cached 'false' still wins.
      setConfig(store, 'telemetry.enabled', 'true');
      tw.writeTelemetry('/proj', 'prompt_received', { promptCount: 2 }, store);
      expect(appendSpy).not.toHaveBeenCalled();

      // Step 3 — reset cache; gate re-reads config and writes resume.
      tw._resetEnabledCache();
      tw.writeTelemetry('/proj', 'prompt_received', { promptCount: 3 }, store);
      expect(appendSpy).toHaveBeenCalledTimes(1);
    });

    it('config read failure fails open — write still happens', async () => {
      // Spy on the freshly-imported config module so the binding inside
      // the freshly-imported TelemetryWriter sees the mock.
      const config = await import('../store/config.js');
      const { writeTelemetry } = await import('./TelemetryWriter.js');
      const fs = await import('node:fs');

      const appendSpy = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

      // Make getConfig throw — isEnabled's try/catch should swallow and return true.
      vi.spyOn(config, 'getConfig').mockImplementation(() => {
        throw new Error('simulated config read failure');
      });

      expect(() =>
        writeTelemetry('/proj', 'prompt_received', { promptCount: 1 }, store),
      ).not.toThrow();
      expect(appendSpy).toHaveBeenCalledTimes(1);
    });

    it('no-store call bypasses the gate (fail-open — runLevel sites until Phase 3)', async () => {
      const { writeTelemetry } = await import('./TelemetryWriter.js');
      const fs = await import('node:fs');

      // Even with telemetry.enabled='false' in the only known store, a writer
      // call WITHOUT a store cannot check the gate — so it must still write.
      setConfig(store, 'telemetry.enabled', 'false');

      const appendSpy = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

      writeTelemetry('/proj', 'prompt_received', { promptCount: 1 });

      expect(appendSpy).toHaveBeenCalledTimes(1);
    });

    it('cache avoids repeated config reads within the same process', async () => {
      const config = await import('../store/config.js');
      const { writeTelemetry } = await import('./TelemetryWriter.js');
      const fs = await import('node:fs');

      vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

      const getConfigSpy = vi.spyOn(config, 'getConfig');

      writeTelemetry('/proj', 'prompt_received', { promptCount: 1 }, store);
      writeTelemetry('/proj', 'prompt_classified', { stage: 'planning' }, store);
      writeTelemetry('/proj', 'absence_flags_detected', { newFlagsCount: 0 }, store);

      // getConfig should only be called once for 'telemetry.enabled' — the cache
      // serves subsequent isEnabled() invocations.
      const enabledReads = getConfigSpy.mock.calls.filter(
        (call) => call[1] === 'telemetry.enabled',
      );
      expect(enabledReads.length).toBe(1);
    });
  });
});
