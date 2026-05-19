import { statSync } from 'node:fs';
import { confirm, isCancel } from '@clack/prompts';
import { openStore, closeStore, DEFAULT_DB_PATH } from '../../store/db.js';
import { getConfig, setConfig } from '../../store/config.js';
import { loadSyncState } from '../../telemetry/TelemetrySyncScheduler.js';
import { loadCursor, saveCursor, clearCursor } from '../../telemetry/TelemetryCursor.js';
import { runSyncAttempt } from '../../telemetry/TelemetrySyncRunner.js';
import { DEFAULT_POSTHOG_ENDPOINT, postBatch, type FetchLike } from '../../telemetry/TelemetryClient.js';
import { POSTHOG_LIB_NAME, POSTHOG_LIB_VERSION } from '../../telemetry/TelemetryBatcher.js';
import { TELEMETRY_PATH, TELEMETRY_SYNC_CURSOR_PATH } from '../../telemetry/paths.js';
import { logger } from '../../logger.js';
import type { PostHogBatchEnvelope } from '../../telemetry/types.js';

const NEXPATH_VERSION = '0.1.1';

export interface TelemetrySyncActionOpts {
  dbPath?:         string;
  statePath?:      string;
  cursorPath?:     string;
  liveLogPath?:    string;
  rotatedLogPath?: string;
  errorLogPath?:   string;
  output?:         (line: string) => void;
}

const defaultPrint = (line: string): void => { console.log(line); };

export type ConfirmFn = () => Promise<boolean>;
export type AuditFn   = (event: string, props: Record<string, unknown>) => void;

const defaultEnableConfirm: ConfirmFn = async () => {
  const answer = await confirm({
    message:      'Enable telemetry sync?',
    initialValue: false,
  });
  return !isCancel(answer) && answer === true;
};

const defaultAudit: AuditFn = (event, props) => {
  try {
    logger.info(event, props);
  } catch {
    // Audit logging failure must never crash the command.
  }
};

function printPrivacyBanner(
  print:       (line: string) => void,
  hashEnabled: boolean,
  endpoint:    string,
): void {
  print('');
  print('Telemetry sync — privacy notice');
  print('');
  print('What is uploaded:');
  print('  • Event names (e.g. prompt_received, decision_session_started)');
  print('  • Structured metadata (counters, classifications, timestamps)');
  print('  • Auto-generated installation / user / team UUIDs');
  print(`  • Project root path (${hashEnabled ? 'SHA-256 hashed' : 'raw'} — toggle via telemetry_sync_hash_project_root)`);
  print('');
  print('What is NEVER uploaded:');
  print('  • Raw user prompt text');
  print('  • Your source code');
  print('  • OpenAI API key');
  print('  • Any personal information beyond what is listed above');
  print('');
  print('How often:  every 10–30 minutes (random)');
  print(`Where to:   ${endpoint}`);
  print('To disable: nexpath telemetry-sync disable');
  print('');
}

export async function telemetrySyncStatusAction(opts: TelemetrySyncActionOpts = {}): Promise<void> {
  const print = opts.output ?? defaultPrint;
  const store = await openStore(opts.dbPath ?? DEFAULT_DB_PATH);
  try {
    const enabled    = getConfig(store.db, 'telemetry_sync_enabled') === 'true';
    const endpoint   = getConfig(store.db, 'telemetry_sync_endpoint') ?? DEFAULT_POSTHOG_ENDPOINT;
    const apiKeySet  = (getConfig(store.db, 'telemetry_sync_api_key') ?? '').length > 0;
    const state      = loadSyncState(opts.statePath);
    const cursor     = loadCursor(opts.cursorPath);

    print('Telemetry sync status:');
    print(`  Enabled:              ${enabled ? 'yes' : 'no'}`);
    print(`  Endpoint:             ${endpoint}`);
    print(`  API key configured:   ${apiKeySet ? 'yes' : 'no'}`);
    print(`  Last attempt:         ${state?.last_attempt_at  ?? '(never)'}`);
    print(`  Last success:         ${state?.last_success_at  ?? '(never)'}`);
    print(`  Last error:           ${state?.last_error       ?? '(none)'}`);
    print(`  Consecutive failures: ${state?.consecutive_failures ?? 0}`);
    print(`  Next scheduled:       ${state?.next_sync_at     ?? '(not scheduled)'}`);
    print(`  Cursor inode:         ${cursor?.inode  ?? '(uninitialised)'}`);
    print(`  Cursor offset:        ${cursor?.offset ?? 0}`);
  } finally {
    closeStore(store);
  }
}

export async function telemetrySyncEnableAction(
  opts:       TelemetrySyncActionOpts = {},
  confirmFn:  ConfirmFn = defaultEnableConfirm,
  audit:      AuditFn   = defaultAudit,
): Promise<void> {
  const print = opts.output ?? defaultPrint;
  const store = await openStore(opts.dbPath ?? DEFAULT_DB_PATH);
  try {
    const alreadyConsented = getConfig(store.db, 'telemetry_sync_consent_granted') === 'true';

    if (!alreadyConsented) {
      const hashEnabled = getConfig(store.db, 'telemetry_sync_hash_project_root') !== 'false';
      const endpoint    = getConfig(store.db, 'telemetry_sync_endpoint') ?? DEFAULT_POSTHOG_ENDPOINT;
      printPrivacyBanner(print, hashEnabled, endpoint);

      const confirmed = await confirmFn();
      if (!confirmed) {
        print('Telemetry sync NOT enabled. Run "nexpath telemetry-sync enable" again to opt in.');
        return;
      }

      setConfig(store, 'telemetry_sync_consent_granted', 'true');
      audit('telemetry_sync_consent_granted', {
        nexpath_version:    NEXPATH_VERSION,
        endpoint,
        hash_project_root:  hashEnabled,
      });
    }

    setConfig(store, 'telemetry_sync_enabled', 'true');
    print('Telemetry sync enabled.');
    print('Sync window: 10–30 minutes (override via telemetry_sync_min_minutes / _max_minutes).');
    print('Disable anytime: nexpath telemetry-sync disable');
  } finally {
    closeStore(store);
  }
}

export async function telemetrySyncDisableAction(opts: TelemetrySyncActionOpts = {}): Promise<void> {
  const print = opts.output ?? defaultPrint;
  const store = await openStore(opts.dbPath ?? DEFAULT_DB_PATH);
  try {
    setConfig(store, 'telemetry_sync_enabled', 'false');
    print('Telemetry sync disabled.');
    print('Note: in-flight syncs will complete; no new ones will fire.');
  } finally {
    closeStore(store);
  }
}

export async function telemetrySyncResetCursorAction(opts: TelemetrySyncActionOpts = {}): Promise<void> {
  const print       = opts.output      ?? defaultPrint;
  const liveLogPath = opts.liveLogPath ?? TELEMETRY_PATH;
  const cursorPath  = opts.cursorPath  ?? TELEMETRY_SYNC_CURSOR_PATH;
  try {
    const stat = statSync(liveLogPath);
    saveCursor({
      inode:          stat.ino,
      offset:         stat.size,
      last_synced_ts: new Date().toISOString(),
    }, cursorPath);
    print(`Cursor reset to end of telemetry log (offset=${stat.size}).`);
    print('Existing backlog will be skipped; new events from this point forward will sync.');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      clearCursor(cursorPath);
      print('No telemetry log present — cursor cleared.');
      return;
    }
    print(`Error: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

export async function telemetrySyncPingAction(
  opts:      TelemetrySyncActionOpts = {},
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): Promise<void> {
  const print = opts.output ?? defaultPrint;
  const store = await openStore(opts.dbPath ?? DEFAULT_DB_PATH);
  try {
    const apiKey = getConfig(store.db, 'telemetry_sync_api_key');
    if (!apiKey) {
      print('Error: telemetry_sync_api_key is not configured.');
      print('Set it with: nexpath config set telemetry_sync_api_key <token>');
      process.exitCode = 1;
      return;
    }
    const endpoint = getConfig(store.db, 'telemetry_sync_endpoint') ?? DEFAULT_POSTHOG_ENDPOINT;

    const envelope: PostHogBatchEnvelope = {
      api_key: apiKey,
      batch: [{
        event:       'nexpath_ping_test',
        distinct_id: `nexpath-ping-${Date.now()}`,
        timestamp:   new Date().toISOString(),
        properties: {
          $lib:          POSTHOG_LIB_NAME,
          $lib_version:  POSTHOG_LIB_VERSION,
          ping:          true,
        },
      }],
    };

    print(`Pinging ${endpoint}...`);
    const result = await postBatch(endpoint, envelope, { fetch: fetchImpl });

    if (result.ok) {
      print(`✓ Ping succeeded (HTTP ${result.status}). Telemetry sync is reachable.`);
      return;
    }
    if (result.kind === 'network') {
      print('✗ Network error. Check connectivity and endpoint.');
      process.exitCode = 1;
      return;
    }
    print(`✗ HTTP ${result.status}. Check api_key and endpoint config.`);
    if (result.retryAfterSeconds !== undefined) print(`  Retry-After: ${result.retryAfterSeconds}s`);
    process.exitCode = 1;
  } finally {
    closeStore(store);
  }
}

export async function telemetrySyncRunAction(opts: TelemetrySyncActionOpts = {}): Promise<void> {
  const print = opts.output ?? defaultPrint;
  const store = await openStore(opts.dbPath ?? DEFAULT_DB_PATH);
  try {
    const apiKey = getConfig(store.db, 'telemetry_sync_api_key');
    if (!apiKey) {
      print('Error: telemetry_sync_api_key is not configured.');
      print('Set it with: nexpath config set telemetry_sync_api_key <token>');
      process.exitCode = 1;
      return;
    }

    const endpoint        = getConfig(store.db, 'telemetry_sync_endpoint') ?? DEFAULT_POSTHOG_ENDPOINT;
    const timeoutMsRaw    = getConfig(store.db, 'telemetry_sync_timeout_ms');
    const maxEventsRaw    = getConfig(store.db, 'telemetry_sync_batch_max_events');
    const maxBytesRaw     = getConfig(store.db, 'telemetry_sync_batch_max_bytes');
    const hashFlag        = getConfig(store.db, 'telemetry_sync_hash_project_root');

    const runnerOpts: Parameters<typeof runSyncAttempt>[0] = { apiKey, endpoint };
    if (opts.liveLogPath    !== undefined) runnerOpts.liveLogPath    = opts.liveLogPath;
    if (opts.rotatedLogPath !== undefined) runnerOpts.rotatedLogPath = opts.rotatedLogPath;
    if (opts.cursorPath     !== undefined) runnerOpts.cursorPath     = opts.cursorPath;
    if (opts.errorLogPath   !== undefined) runnerOpts.errorLogPath   = opts.errorLogPath;
    if (timeoutMsRaw && Number.isFinite(Number(timeoutMsRaw))) runnerOpts.timeoutMs         = Number(timeoutMsRaw);
    if (maxEventsRaw && Number.isFinite(Number(maxEventsRaw))) runnerOpts.maxEventsPerBatch = Number(maxEventsRaw);
    if (maxBytesRaw  && Number.isFinite(Number(maxBytesRaw)))  runnerOpts.maxBytesPerBatch  = Number(maxBytesRaw);
    if (hashFlag !== undefined) runnerOpts.hashProjectRoot = hashFlag !== 'false';

    print('Running sync...');
    const result = await runSyncAttempt(runnerOpts);

    print(`Status:      ${result.status}`);
    print(`Sent events: ${result.sentEvents}`);
    if (result.httpStatus        !== undefined) print(`HTTP status: ${result.httpStatus}`);
    if (result.retryAfterSeconds !== undefined) print(`Retry-After: ${result.retryAfterSeconds}s`);
    if (result.shouldDisableSync) {
      print('Threshold reached — auto-disable would trigger in scheduled mode.');
    }
    if (result.status !== 'ok' && result.status !== 'noop') {
      process.exitCode = 1;
    }
  } finally {
    closeStore(store);
  }
}
