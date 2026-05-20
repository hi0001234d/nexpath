import { createHash } from 'node:crypto';
import type { PostHogSingleEnvelope, TelemetryEvent } from './types.js';

export const POSTHOG_LIB_NAME    = 'nexpath';
export const POSTHOG_LIB_VERSION = '0.1.1';

export const MAX_EVENTS_PER_RUN = 2000;

export const ALLOWED_PROPERTY_KEYS: ReadonlyArray<string> = [
  '$lib', '$lib_version',
  'userId', 'teamId',
  'projectRoot', 'schema_version', 'v',
  'promptCount', 'stage', 'confidence', 'classifier',
  'profile',
  'flagType', 'pinchLabel', 'sessionId',
  'level', 'reason',
  'cooldownSecondsRemaining', 'currentCap',
  'advisoryCountInSession', 'decisionSessionCountInProject',
  'optionId', 'optionLabel',
  'recentPrompts', 'skipCountInProject',
  'language',
  'confirmed',
  'event_count', 'latency_ms', 'http_status',
];

export interface BuildOptions {
  apiKey:           string;
  hashProjectRoot?: boolean;
  libVersion?:      string;
  allowedKeys?:     ReadonlyArray<string>;
  maxEventsPerRun?: number;
}

export interface BuildResult {
  envelopes:     PostHogSingleEnvelope[];
  consumedCount: number;
}

export function hashProjectRootValue(raw: string): string {
  return `sha256:${createHash('sha256').update(raw).digest('hex')}`;
}

export function toPostHogEnvelope(
  raw:    TelemetryEvent,
  apiKey: string,
  opts:   { hashProjectRoot: boolean; libVersion: string; allowedKeys: ReadonlyArray<string> },
): PostHogSingleEnvelope | null {
  if (typeof raw.installationId !== 'string' || raw.installationId === '') return null;

  const properties: Record<string, unknown> = {
    $lib:         POSTHOG_LIB_NAME,
    $lib_version: opts.libVersion,
  };

  for (const key of opts.allowedKeys) {
    if (key === '$lib' || key === '$lib_version') continue;
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;

    let value: unknown = (raw as Record<string, unknown>)[key];
    if (key === 'projectRoot' && opts.hashProjectRoot && typeof value === 'string') {
      value = hashProjectRootValue(value);
    }
    properties[key] = value;
  }

  return {
    api_key:     apiKey,
    event:       raw.event,
    distinct_id: raw.installationId,
    timestamp:   raw.ts,
    properties,
  };
}

export function buildEnvelopes(events: TelemetryEvent[], opts: BuildOptions): BuildResult {
  const libVersion       = opts.libVersion       ?? POSTHOG_LIB_VERSION;
  const allowedKeys      = opts.allowedKeys      ?? ALLOWED_PROPERTY_KEYS;
  const hashProjectRoot  = opts.hashProjectRoot  ?? true;
  const maxEventsPerRun  = opts.maxEventsPerRun  ?? MAX_EVENTS_PER_RUN;

  const envelopes:     PostHogSingleEnvelope[] = [];
  let consumedCount = 0;

  for (const raw of events) {
    if (envelopes.length >= maxEventsPerRun) break;

    const envelope = toPostHogEnvelope(raw, opts.apiKey, { hashProjectRoot, libVersion, allowedKeys });
    if (envelope === null) {
      consumedCount++;
      continue;
    }

    envelopes.push(envelope);
    consumedCount++;
  }

  return { envelopes, consumedCount };
}
