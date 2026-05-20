import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { readNewEvents, type ReadResult } from './TelemetryReader.js';
import { saveCursor } from './TelemetryCursor.js';
import { buildEnvelopes } from './TelemetryBatcher.js';
import { postEvent, DEFAULT_POSTHOG_ENDPOINT, DEFAULT_TIMEOUT_MS, type FetchLike, type SendResult } from './TelemetryClient.js';
import { TELEMETRY_SYNC_ERROR_LOG_PATH } from './paths.js';
import type { TelemetryEvent, TelemetryEventName } from './types.js';

export const DEFAULT_FAILURE_DISABLE_THRESHOLD = 10;

const SYNC_SELF_EVENT_NAMES: ReadonlySet<TelemetryEventName> = new Set<TelemetryEventName>([
  'telemetry_sync_attempt',
  'telemetry_sync_success',
  'telemetry_sync_failed',
]);

export type RunnerStatus =
  | 'ok'
  | 'noop'
  | 'network'
  | 'http_4xx'
  | 'http_5xx'
  | 'rate_limited';

export interface RunnerResult {
  status:                   RunnerStatus;
  sentEvents:               number;
  httpStatus?:              number;
  retryAfterSeconds?:       number;
  consecutiveFailuresAfter: number;
  shouldDisableSync:        boolean;
}

export interface RunnerOptions {
  endpoint?:                  string;
  apiKey:                     string;
  hashProjectRoot?:           boolean;
  timeoutMs?:                 number;
  maxEventsPerBatch?:         number;
  maxBytesPerBatch?:          number;
  maxBatchesPerRun?:          number;
  maxEventsPerRun?:           number;
  failureDisableThreshold?:   number;
  liveLogPath?:               string;
  rotatedLogPath?:            string;
  cursorPath?:                string;
  errorLogPath?:              string;
  fetch?:                     FetchLike;
  now?:                       () => Date;
  emitTelemetry?:             (event: TelemetryEventName, props: Record<string, unknown>) => void;
  readNewEvents?:             () => ReadResult;
}

export async function runSyncAttempt(
  opts:                       RunnerOptions,
  consecutiveFailuresBefore:  number = 0,
): Promise<RunnerResult> {
  const endpoint            = opts.endpoint     ?? DEFAULT_POSTHOG_ENDPOINT;
  const timeoutMs           = opts.timeoutMs    ?? DEFAULT_TIMEOUT_MS;
  const errorLogPath        = opts.errorLogPath ?? TELEMETRY_SYNC_ERROR_LOG_PATH;
  const failureThreshold    = opts.failureDisableThreshold ?? DEFAULT_FAILURE_DISABLE_THRESHOLD;
  const now                 = opts.now ?? (() => new Date());
  const emit                = opts.emitTelemetry ?? (() => {});
  const reader              = opts.readNewEvents ?? (() => readNewEvents({
    liveLogPath:    opts.liveLogPath,
    rotatedLogPath: opts.rotatedLogPath,
    cursorPath:     opts.cursorPath,
  }));

  const startTime = now().getTime();
  const read      = reader();

  const filteredIndices: number[] = [];
  const filteredEvents:  TelemetryEvent[] = [];
  for (let i = 0; i < read.events.length; i++) {
    if (!SYNC_SELF_EVENT_NAMES.has(read.events[i].event)) {
      filteredEvents.push(read.events[i]);
      filteredIndices.push(i);
    }
  }

  if (filteredEvents.length === 0) {
    if (read.events.length > 0) {
      saveCursor({
        inode:          read.newInode,
        offset:         read.newOffset,
        last_synced_ts: new Date(startTime).toISOString(),
      }, opts.cursorPath);
    }
    return {
      status:                   'noop',
      sentEvents:               0,
      consecutiveFailuresAfter: consecutiveFailuresBefore,
      shouldDisableSync:        false,
    };
  }

  const buildOptions: Parameters<typeof buildEnvelopes>[1] = { apiKey: opts.apiKey };
  if (opts.hashProjectRoot !== undefined) buildOptions.hashProjectRoot = opts.hashProjectRoot;
  if (opts.maxEventsPerRun !== undefined) buildOptions.maxEventsPerRun = opts.maxEventsPerRun;
  const { envelopes, consumedCount } = buildEnvelopes(filteredEvents, buildOptions);

  if (envelopes.length === 0) {
    saveCursor({
      inode:          read.newInode,
      offset:         read.newOffset,
      last_synced_ts: new Date(startTime).toISOString(),
    }, opts.cursorPath);
    return {
      status:                   'noop',
      sentEvents:               0,
      consecutiveFailuresAfter: consecutiveFailuresBefore,
      shouldDisableSync:        false,
    };
  }

  emit('telemetry_sync_attempt', { event_count: consumedCount });

  let sentEvents              = 0;
  let lastSuccessfulFilteredIdx = -1;

  for (let i = 0; i < envelopes.length; i++) {
    const sendResult: SendResult = await postEvent(endpoint, envelopes[i], {
      fetch:     opts.fetch,
      timeoutMs,
    });

    if (sendResult.ok) {
      sentEvents += 1;
      lastSuccessfulFilteredIdx = i;
      continue;
    }

    const latencyMs = now().getTime() - startTime;

    if (lastSuccessfulFilteredIdx >= 0) {
      advanceCursorAfter(read, filteredIndices, lastSuccessfulFilteredIdx + 1, opts.cursorPath, startTime);
    }

    if (sendResult.kind === 'network') {
      emit('telemetry_sync_failed', { reason: 'network', latency_ms: latencyMs });
      return {
        status:                   'network',
        sentEvents,
        consecutiveFailuresAfter: consecutiveFailuresBefore + 1,
        shouldDisableSync:        false,
      };
    }

    if (sendResult.status === 429) {
      emit('telemetry_sync_failed', { reason: 'rate_limited', http_status: 429, latency_ms: latencyMs });
      const out: RunnerResult = {
        status:                   'rate_limited',
        sentEvents,
        httpStatus:               429,
        consecutiveFailuresAfter: consecutiveFailuresBefore + 1,
        shouldDisableSync:        false,
      };
      if (sendResult.retryAfterSeconds !== undefined) out.retryAfterSeconds = sendResult.retryAfterSeconds;
      return out;
    }

    if (sendResult.status >= 400 && sendResult.status < 500) {
      logErrorLine(errorLogPath, {
        ts:          new Date(startTime).toISOString(),
        status:      sendResult.status,
        eventIndex:  i,
      });
      const newFailures   = consecutiveFailuresBefore + 1;
      const shouldDisable = newFailures >= failureThreshold;
      emit('telemetry_sync_failed', { reason: 'http_4xx', http_status: sendResult.status, latency_ms: latencyMs });
      return {
        status:                   'http_4xx',
        sentEvents,
        httpStatus:               sendResult.status,
        consecutiveFailuresAfter: newFailures,
        shouldDisableSync:        shouldDisable,
      };
    }

    emit('telemetry_sync_failed', { reason: 'http_5xx', http_status: sendResult.status, latency_ms: latencyMs });
    return {
      status:                   'http_5xx',
      sentEvents,
      httpStatus:               sendResult.status,
      consecutiveFailuresAfter: consecutiveFailuresBefore + 1,
      shouldDisableSync:        false,
    };
  }

  advanceCursorAfter(read, filteredIndices, envelopes.length, opts.cursorPath, startTime);

  const latencyMs = now().getTime() - startTime;
  emit('telemetry_sync_success', { event_count: sentEvents, latency_ms: latencyMs });

  return {
    status:                   'ok',
    sentEvents,
    consecutiveFailuresAfter: 0,
    shouldDisableSync:        false,
  };
}

function advanceCursorAfter(
  read:               ReadResult,
  filteredIndices:    number[],
  filteredCount:      number,
  cursorPath:         string | undefined,
  startTimeMs:        number,
): void {
  if (filteredCount === 0) return;

  if (filteredCount === filteredIndices.length) {
    saveCursor({
      inode:          read.newInode,
      offset:         read.newOffset,
      last_synced_ts: new Date(startTimeMs).toISOString(),
    }, cursorPath);
    return;
  }

  const lastFilteredIdx = filteredCount - 1;
  const originalIdx     = filteredIndices[lastFilteredIdx];

  let offset: number;
  if (originalIdx === read.events.length - 1) {
    offset = read.newOffset;
  } else {
    const nextSelfEventIdx = filteredIndices[lastFilteredIdx + 1] ?? read.events.length;
    const advanceThrough   = nextSelfEventIdx - 1;
    offset = read.eventByteEnds[advanceThrough] ?? read.newOffset;
  }

  saveCursor({
    inode:          read.newInode,
    offset,
    last_synced_ts: new Date(startTimeMs).toISOString(),
  }, cursorPath);
}

function logErrorLine(errorLogPath: string, line: Record<string, unknown>): void {
  try {
    mkdirSync(dirname(errorLogPath), { recursive: true });
    appendFileSync(errorLogPath, JSON.stringify(line) + '\n', 'utf8');
  } catch {
    // error log failure must not propagate
  }
}
