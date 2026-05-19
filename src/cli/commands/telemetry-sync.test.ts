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
} from './telemetry-sync.js';
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
    expect(text).toContain('API key configured:   no');
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

describe('telemetrySyncEnableAction', () => {
  it('sets telemetry_sync_enabled to "true"', async () => {
    const { lines, print } = captureOutput();
    await telemetrySyncEnableAction({ dbPath, output: print });

    const store = await openStore(dbPath);
    expect(getConfig(store.db, 'telemetry_sync_enabled')).toBe('true');
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
  it('bails with exit code 1 when api_key is unset', async () => {
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
    expect(body.batch[0].properties.projectRoot).toBe('/home/jemi/raw-path');
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
