import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, appendFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  telemetrySyncStatusAction,
  telemetrySyncEnableAction,
  telemetrySyncDisableAction,
  telemetrySyncResetCursorAction,
  telemetrySyncRunAction,
  telemetrySyncPingAction,
} from './telemetry-sync.js';
import type { FetchLike } from '../../telemetry/TelemetryClient.js';
import { openStore, closeStore } from '../../store/db.js';
import { setConfig, getConfig } from '../../store/config.js';
import { saveCursor, loadCursor } from '../../telemetry/TelemetryCursor.js';
import { saveSyncState } from '../../telemetry/TelemetrySyncScheduler.js';

let tmpDir:       string;
let dbPath:       string;
let statePath:    string;
let cursorPath:   string;
let livePath:     string;
let rotPath:      string;
let errorLogPath: string;

beforeEach(() => {
  tmpDir       = mkdtempSync(join(tmpdir(), 'nexpath-cli-ts-'));
  dbPath       = join(tmpDir, `${randomUUID()}.db`);
  statePath    = join(tmpDir, 'state.json');
  cursorPath   = join(tmpDir, 'cursor.json');
  livePath     = join(tmpDir, 'telemetry.jsonl');
  rotPath      = `${livePath}.1`;
  errorLogPath = join(tmpDir, 'sync-errors.log');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  process.exitCode = 0;
});

async function withConfig(setup: (store: Awaited<ReturnType<typeof openStore>>) => void) {
  const store = await openStore(dbPath);
  setup(store);
  closeStore(store);
}

function captureOutput(): { lines: string[]; print: (line: string) => void } {
  const lines: string[] = [];
  return { lines, print: (l) => lines.push(l) };
}

describe('telemetrySyncStatusAction', () => {
  it('prints status with defaults when no state, cursor, or config is set', async () => {
    const { lines, print } = captureOutput();
    await telemetrySyncStatusAction({ dbPath, statePath, cursorPath, output: print });
    const text = lines.join('\n');
    expect(text).toContain('Enabled:              no');
    expect(text).toContain('Endpoint:             https://us.i.posthog.com/capture/');
    expect(text).toContain('API key configured:   yes');
    expect(text).toContain('Last attempt:         (never)');
    expect(text).toContain('Last success:         (never)');
    expect(text).toContain('Consecutive failures: 0');
    expect(text).toContain('Cursor offset:        0');
  });

  it('gracefully shows defaults when state and cursor files are corrupt JSON', async () => {
    writeFileSync(statePath,  'not-json{', 'utf8');
    writeFileSync(cursorPath, 'also-corrupt}}}', 'utf8');
    const { lines, print } = captureOutput();
    await telemetrySyncStatusAction({ dbPath, statePath, cursorPath, output: print });
    const text = lines.join('\n');
    expect(text).toContain('Last attempt:         (never)');
    expect(text).toContain('Cursor inode:         (uninitialised)');
    expect(text).toContain('Cursor offset:        0');
  });

  it('reflects config and persisted state', async () => {
    await withConfig(store => {
      setConfig(store, 'telemetry_sync_enabled', 'true');
      setConfig(store, 'telemetry_sync_api_key', 'phc_abc');
      setConfig(store, 'telemetry_sync_endpoint', 'https://eu.example/capture/');
    });
    saveSyncState({
      next_sync_at:         '2026-05-19T12:00:00.000Z',
      last_attempt_at:      '2026-05-19T11:50:00.000Z',
      last_success_at:      '2026-05-19T11:50:01.000Z',
      last_error:           null,
      consecutive_failures: 0,
    }, statePath);
    saveCursor({ inode: 12345, offset: 67890, last_synced_ts: null }, cursorPath);

    const { lines, print } = captureOutput();
    await telemetrySyncStatusAction({ dbPath, statePath, cursorPath, output: print });
    const text = lines.join('\n');
    expect(text).toContain('Enabled:              yes');
    expect(text).toContain('Endpoint:             https://eu.example/capture/');
    expect(text).toContain('API key configured:   yes');
    expect(text).toContain('Last success:         2026-05-19T11:50:01.000Z');
    expect(text).toContain('Cursor inode:         12345');
    expect(text).toContain('Cursor offset:        67890');
  });
});

describe('telemetrySyncEnableAction — first-time consent flow', () => {
  it('shows privacy banner on first invocation and sets flag when confirmed', async () => {
    const { lines, print } = captureOutput();
    const audit            = vi.fn();
    await telemetrySyncEnableAction(
      { dbPath, output: print },
      async () => true,
      audit,
    );

    const text = lines.join('\n');
    expect(text).toContain('Telemetry sync — privacy notice');
    expect(text).toContain('What is uploaded:');
    expect(text).toContain('What is NEVER uploaded:');
    expect(text).toContain('Raw user prompt text');
    expect(text).toContain('How often:  every 10–30 minutes');
    expect(text).toContain('Where to:   https://us.i.posthog.com/capture/');
    expect(text).toContain('Telemetry sync enabled.');

    const store = await openStore(dbPath);
    expect(getConfig(store.db, 'telemetry_sync_enabled')).toBe('true');
    expect(getConfig(store.db, 'telemetry_sync_consent_granted')).toBe('true');
    closeStore(store);

    expect(audit).toHaveBeenCalledWith('telemetry_sync_consent_granted', expect.objectContaining({
      nexpath_version:   '0.1.1',
      hash_project_root: true,
    }));
  });

  it('does NOT set flag when user declines confirmation', async () => {
    const { lines, print } = captureOutput();
    const audit            = vi.fn();
    await telemetrySyncEnableAction(
      { dbPath, output: print },
      async () => false,
      audit,
    );

    const store = await openStore(dbPath);
    expect(getConfig(store.db, 'telemetry_sync_enabled')).toBeUndefined();
    expect(getConfig(store.db, 'telemetry_sync_consent_granted')).toBeUndefined();
    closeStore(store);

    expect(audit).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('Telemetry sync NOT enabled');
  });

  it('skips the banner on subsequent invocations once consent is granted', async () => {
    await withConfig(store => setConfig(store, 'telemetry_sync_consent_granted', 'true'));

    const { lines, print } = captureOutput();
    const confirmFn        = vi.fn(async () => true);
    const audit            = vi.fn();
    await telemetrySyncEnableAction({ dbPath, output: print }, confirmFn, audit);

    const text = lines.join('\n');
    expect(text).not.toContain('Telemetry sync — privacy notice');
    expect(confirmFn).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();

    const store = await openStore(dbPath);
    expect(getConfig(store.db, 'telemetry_sync_enabled')).toBe('true');
    closeStore(store);
  });

  it('banner reflects hash_project_root config — "raw" when disabled', async () => {
    await withConfig(store => setConfig(store, 'telemetry_sync_hash_project_root', 'false'));

    const { lines, print } = captureOutput();
    await telemetrySyncEnableAction(
      { dbPath, output: print },
      async () => false,
      () => {},
    );
    const text = lines.join('\n');
    expect(text).toContain('Project root path (raw');
  });

  it('audit payload includes endpoint and hash flag', async () => {
    await withConfig(store => setConfig(store, 'telemetry_sync_endpoint', 'https://eu.example/capture/'));

    const audit = vi.fn();
    const { print } = captureOutput();
    await telemetrySyncEnableAction(
      { dbPath, output: print },
      async () => true,
      audit,
    );

    expect(audit).toHaveBeenCalledWith('telemetry_sync_consent_granted', {
      nexpath_version:   '0.1.1',
      endpoint:          'https://eu.example/capture/',
      hash_project_root: true,
    });
  });

  it('banner shows the configured endpoint, not just the PostHog default', async () => {
    await withConfig(store => setConfig(store, 'telemetry_sync_endpoint', 'https://eu.example/capture/'));

    const { lines, print } = captureOutput();
    await telemetrySyncEnableAction(
      { dbPath, output: print },
      async () => false,
      () => {},
    );
    const text = lines.join('\n');
    expect(text).toContain('Where to:   https://eu.example/capture/');
    expect(text).not.toContain('https://us.i.posthog.com');
  });

  it('default audit swallows logger failures (enable still completes)', async () => {
    const loggerModule = await import('../../logger.js');
    vi.spyOn(loggerModule.logger, 'info').mockImplementation(() => {
      throw new Error('logger broken');
    });

    const { lines, print } = captureOutput();
    await expect(
      telemetrySyncEnableAction({ dbPath, output: print }, async () => true),
    ).resolves.toBeUndefined();

    const store = await openStore(dbPath);
    expect(getConfig(store.db, 'telemetry_sync_enabled')).toBe('true');
    expect(getConfig(store.db, 'telemetry_sync_consent_granted')).toBe('true');
    closeStore(store);
    expect(lines.join('\n')).toContain('Telemetry sync enabled.');
  });
});

describe('telemetrySyncDisableAction', () => {
  it('sets telemetry_sync_enabled to "false"', async () => {
    await withConfig(store => setConfig(store, 'telemetry_sync_enabled', 'true'));
    const { lines, print } = captureOutput();
    await telemetrySyncDisableAction({ dbPath, output: print });

    const store = await openStore(dbPath);
    expect(getConfig(store.db, 'telemetry_sync_enabled')).toBe('false');
    closeStore(store);
    expect(lines.join('\n')).toContain('Telemetry sync disabled.');
  });
});

describe('telemetrySyncResetCursorAction', () => {
  it('moves cursor to current end-of-file (offset = file size)', async () => {
    appendFileSync(livePath, '{"ts":"2026-05-19T10:00:00.000Z","v":1,"event":"prompt_received","projectRoot":"/tmp"}\n', 'utf8');
    appendFileSync(livePath, '{"ts":"2026-05-19T10:01:00.000Z","v":1,"event":"prompt_classified","projectRoot":"/tmp"}\n', 'utf8');

    const { lines, print } = captureOutput();
    await telemetrySyncResetCursorAction({ liveLogPath: livePath, cursorPath, output: print });

    const cursor = loadCursor(cursorPath);
    expect(cursor).not.toBeNull();
    expect(cursor!.offset).toBe(statSync(livePath).size);
    expect(cursor!.inode).toBe(statSync(livePath).ino);
    expect(lines.join('\n')).toContain('Cursor reset to end of telemetry log');
  });

  it('clears cursor file when telemetry log does not exist', async () => {
    writeFileSync(cursorPath, JSON.stringify({ inode: 1, offset: 100, last_synced_ts: null }), 'utf8');
    const { lines, print } = captureOutput();
    await telemetrySyncResetCursorAction({ liveLogPath: livePath, cursorPath, output: print });
    expect(existsSync(cursorPath)).toBe(false);
    expect(lines.join('\n')).toContain('No telemetry log present');
  });
});

describe('telemetrySyncRunAction', () => {
  it('bails with exit code 1 when api_key is cleared (empty)', async () => {
    await withConfig(store => setConfig(store, 'telemetry_sync_api_key', ''));
    const { lines, print } = captureOutput();
    await telemetrySyncRunAction({ dbPath, output: print });
    expect(process.exitCode).toBe(1);
    expect(lines.join('\n')).toContain('telemetry_sync_api_key is not configured');
  });

  it('runs the sync attempt and prints the result status', async () => {
    await withConfig(store => {
      setConfig(store, 'telemetry_sync_api_key', 'phc_test');
    });

    const ev = {
      ts:             '2026-05-19T10:00:00.000Z',
      v:              1,
      installationId: '550e8400-e29b-41d4-a716-446655440000',
      userId:         'u',
      teamId:         't',
      projectRoot:    '/tmp/p',
      event:          'prompt_received',
    };
    appendFileSync(livePath, JSON.stringify(ev) + '\n', 'utf8');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }) as unknown as Response,
    );

    const { lines, print } = captureOutput();
    await telemetrySyncRunAction({
      dbPath, cursorPath, liveLogPath: livePath, rotatedLogPath: rotPath, errorLogPath, output: print,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const text = lines.join('\n');
    expect(text).toContain('Status:      ok');
    expect(text).toContain('Sent events: 1');
  });

  it('prints "noop" and exit code 0 when there are no events to send', async () => {
    await withConfig(store => {
      setConfig(store, 'telemetry_sync_api_key', 'phc_test');
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { lines, print } = captureOutput();
    await telemetrySyncRunAction({
      dbPath, cursorPath, liveLogPath: livePath, rotatedLogPath: rotPath, errorLogPath, output: print,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
    expect(lines.join('\n')).toContain('Status:      noop');
  });

  it('uses telemetry_sync_endpoint config override when sending', async () => {
    await withConfig(store => {
      setConfig(store, 'telemetry_sync_api_key',  'phc_test');
      setConfig(store, 'telemetry_sync_endpoint', 'https://eu.example/capture/');
    });
    const ev = {
      ts: '2026-05-19T10:00:00.000Z', v: 1,
      installationId: '550e8400-e29b-41d4-a716-446655440000',
      userId: 'u', teamId: 't', projectRoot: '/tmp/p', event: 'prompt_received',
    };
    appendFileSync(livePath, JSON.stringify(ev) + '\n', 'utf8');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }) as unknown as Response,
    );

    const { print } = captureOutput();
    await telemetrySyncRunAction({
      dbPath, cursorPath, liveLogPath: livePath, rotatedLogPath: rotPath, errorLogPath, output: print,
    });
    expect(fetchSpy.mock.calls[0][0]).toBe('https://eu.example/capture/');
  });

  it('sends raw projectRoot when telemetry_sync_hash_project_root=false', async () => {
    await withConfig(store => {
      setConfig(store, 'telemetry_sync_api_key',              'phc_test');
      setConfig(store, 'telemetry_sync_hash_project_root',    'false');
    });
    const ev = {
      ts: '2026-05-19T10:00:00.000Z', v: 1,
      installationId: '550e8400-e29b-41d4-a716-446655440000',
      userId: 'u', teamId: 't', projectRoot: '/home/jemi/raw-path', event: 'prompt_received',
    };
    appendFileSync(livePath, JSON.stringify(ev) + '\n', 'utf8');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }) as unknown as Response,
    );

    const { print } = captureOutput();
    await telemetrySyncRunAction({
      dbPath, cursorPath, liveLogPath: livePath, rotatedLogPath: rotPath, errorLogPath, output: print,
    });
    const init = fetchSpy.mock.calls[0][1] as { body: string };
    const body = JSON.parse(init.body);
    expect(body.properties.projectRoot).toBe('/home/jemi/raw-path');
  });

  it('prints Retry-After value on 429', async () => {
    await withConfig(store => {
      setConfig(store, 'telemetry_sync_api_key', 'phc_test');
    });
    const ev = {
      ts: '2026-05-19T10:00:00.000Z', v: 1,
      installationId: '550e8400-e29b-41d4-a716-446655440000',
      userId: 'u', teamId: 't', projectRoot: '/tmp/p', event: 'prompt_received',
    };
    appendFileSync(livePath, JSON.stringify(ev) + '\n', 'utf8');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 429, headers: { 'Retry-After': '120' } }) as unknown as Response,
    );

    const { lines, print } = captureOutput();
    await telemetrySyncRunAction({
      dbPath, cursorPath, liveLogPath: livePath, rotatedLogPath: rotPath, errorLogPath, output: print,
    });
    const text = lines.join('\n');
    expect(text).toContain('Status:      rate_limited');
    expect(text).toContain('Retry-After: 120s');
    expect(process.exitCode).toBe(1);
  });

});

describe('telemetrySyncPingAction', () => {
  it('exits 1 when api_key is cleared (empty)', async () => {
    await withConfig(store => setConfig(store, 'telemetry_sync_api_key', ''));
    const { lines, print } = captureOutput();
    await telemetrySyncPingAction({ dbPath, output: print });
    expect(process.exitCode).toBe(1);
    expect(lines.join('\n')).toContain('telemetry_sync_api_key is not configured');
  });

  it('sends a single test event with valid PostHog shape and reports success', async () => {
    await withConfig(store => setConfig(store, 'telemetry_sync_api_key', 'phc_ping_test'));

    const fetchMock = vi.fn<FetchLike>(async () => ({
      ok: true, status: 200, headers: { get: () => null },
    }));

    const { lines, print } = captureOutput();
    await telemetrySyncPingAction({ dbPath, output: print }, fetchMock);
    expect(process.exitCode).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const init = fetchMock.mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.api_key).toBe('phc_ping_test');
    expect(body.event).toBe('nexpath_ping_test');
    expect(body.distinct_id).toMatch(/^nexpath-ping-/);
    expect(body.properties.ping).toBe(true);
    expect(body.properties.$lib).toBe('nexpath');
    expect(body.batch).toBeUndefined();
    expect(lines.join('\n')).toContain('Ping succeeded');
  });

  it('uses configured endpoint when set', async () => {
    await withConfig(store => {
      setConfig(store, 'telemetry_sync_api_key',  'phc_test');
      setConfig(store, 'telemetry_sync_endpoint', 'https://eu.example/capture/');
    });
    const fetchMock = vi.fn<FetchLike>(async () => ({
      ok: true, status: 200, headers: { get: () => null },
    }));
    const { print } = captureOutput();
    await telemetrySyncPingAction({ dbPath, output: print }, fetchMock);
    expect(fetchMock.mock.calls[0][0]).toBe('https://eu.example/capture/');
  });

  it('reports network error and exits 1', async () => {
    await withConfig(store => setConfig(store, 'telemetry_sync_api_key', 'phc_test'));
    const fetchMock = vi.fn<FetchLike>(async () => { throw new Error('ENETDOWN'); });
    const { lines, print } = captureOutput();
    await telemetrySyncPingAction({ dbPath, output: print }, fetchMock);
    expect(process.exitCode).toBe(1);
    expect(lines.join('\n')).toContain('Network error');
  });

  it('reports HTTP error with status and exits 1', async () => {
    await withConfig(store => setConfig(store, 'telemetry_sync_api_key', 'phc_test'));
    const fetchMock = vi.fn<FetchLike>(async () => ({
      ok: false, status: 401, headers: { get: () => null },
    }));
    const { lines, print } = captureOutput();
    await telemetrySyncPingAction({ dbPath, output: print }, fetchMock);
    expect(process.exitCode).toBe(1);
    expect(lines.join('\n')).toContain('HTTP 401');
  });

  it('prints retry-after seconds on 429', async () => {
    await withConfig(store => setConfig(store, 'telemetry_sync_api_key', 'phc_test'));
    const fetchMock = vi.fn<FetchLike>(async () => ({
      ok: false, status: 429,
      headers: { get: (h: string) => h === 'Retry-After' ? '60' : null },
    }));
    const { lines, print } = captureOutput();
    await telemetrySyncPingAction({ dbPath, output: print }, fetchMock);
    expect(lines.join('\n')).toContain('Retry-After: 60s');
  });

  it('does NOT touch cursor or sync-state files (ping is isolated debug-only)', async () => {
    await withConfig(store => setConfig(store, 'telemetry_sync_api_key', 'phc_test'));
    const fetchMock = vi.fn<FetchLike>(async () => ({
      ok: true, status: 200, headers: { get: () => null },
    }));

    const cursorPathBefore = existsSync(cursorPath);
    const statePathBefore  = existsSync(statePath);

    const { print } = captureOutput();
    await telemetrySyncPingAction({ dbPath, output: print }, fetchMock);

    expect(existsSync(cursorPath)).toBe(cursorPathBefore);
    expect(existsSync(statePath)).toBe(statePathBefore);
  });
});

describe('telemetrySyncRunAction (continued)', () => {
  it('non-ok / non-noop result sets exit code 1', async () => {
    await withConfig(store => {
      setConfig(store, 'telemetry_sync_api_key', 'phc_test');
    });
    const ev = {
      ts:             '2026-05-19T10:00:00.000Z',
      v:              1,
      installationId: '550e8400-e29b-41d4-a716-446655440000',
      userId:         'u',
      teamId:         't',
      projectRoot:    '/tmp/p',
      event:          'prompt_received',
    };
    appendFileSync(livePath, JSON.stringify(ev) + '\n', 'utf8');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 503 }) as unknown as Response,
    );

    const { print } = captureOutput();
    await telemetrySyncRunAction({
      dbPath, cursorPath, liveLogPath: livePath, rotatedLogPath: rotPath, errorLogPath, output: print,
    });
    expect(process.exitCode).toBe(1);
  });
});
