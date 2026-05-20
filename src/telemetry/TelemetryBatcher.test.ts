import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  buildEnvelopes,
  toPostHogEnvelope,
  hashProjectRootValue,
  ALLOWED_PROPERTY_KEYS,
  POSTHOG_LIB_NAME,
  POSTHOG_LIB_VERSION,
} from './TelemetryBatcher.js';
import { postEvent, type FetchLike } from './TelemetryClient.js';
import type { TelemetryEvent } from './types.js';

const API_KEY = 'phc_test_key';

function ev(overrides: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    ts:             '2026-05-19T10:00:00.000Z',
    v:              1,
    installationId: '550e8400-e29b-41d4-a716-446655440000',
    userId:         '8a3f1c2e-5b6d-4e7f-9a2c-1d3e5f7b9c0d',
    teamId:         'team-stub-2c8e4f6a-1b3d-5e7f-9a2c-4d6e8f0b2c1d',
    projectRoot:    '/home/jemi/projects/demo',
    event:          'prompt_received',
    ...overrides,
  };
}

describe('TelemetryBatcher — toPostHogEnvelope (single-event shape)', () => {
  it('maps installationId → distinct_id at the top level', () => {
    const out = toPostHogEnvelope(ev(), API_KEY, { hashProjectRoot: false, libVersion: '0.1.1', allowedKeys: ALLOWED_PROPERTY_KEYS });
    expect(out?.distinct_id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('maps ts → timestamp at the top level', () => {
    const out = toPostHogEnvelope(ev({ ts: '2026-05-19T11:22:33.444Z' }), API_KEY, {
      hashProjectRoot: false, libVersion: '0.1.1', allowedKeys: ALLOWED_PROPERTY_KEYS,
    });
    expect(out?.timestamp).toBe('2026-05-19T11:22:33.444Z');
  });

  it('places event name at the top level (not inside properties)', () => {
    const out = toPostHogEnvelope(ev({ event: 'prompt_classified' }), API_KEY, {
      hashProjectRoot: false, libVersion: '0.1.1', allowedKeys: ALLOWED_PROPERTY_KEYS,
    });
    expect(out?.event).toBe('prompt_classified');
  });

  it('places api_key at the top level', () => {
    const out = toPostHogEnvelope(ev(), API_KEY, { hashProjectRoot: false, libVersion: '0.1.1', allowedKeys: ALLOWED_PROPERTY_KEYS });
    expect(out?.api_key).toBe(API_KEY);
  });

  it('moves remaining whitelisted fields into properties', () => {
    const out = toPostHogEnvelope(
      ev({ event: 'prompt_classified', stage: 'planning', confidence: 0.92 }),
      API_KEY,
      { hashProjectRoot: false, libVersion: '0.1.1', allowedKeys: ALLOWED_PROPERTY_KEYS },
    );
    expect(out?.properties.userId).toBe('8a3f1c2e-5b6d-4e7f-9a2c-1d3e5f7b9c0d');
    expect(out?.properties.teamId).toBe('team-stub-2c8e4f6a-1b3d-5e7f-9a2c-4d6e8f0b2c1d');
    expect(out?.properties.stage).toBe('planning');
    expect(out?.properties.confidence).toBe(0.92);
  });

  it('injects $lib and $lib_version properties', () => {
    const out = toPostHogEnvelope(ev(), API_KEY, { hashProjectRoot: false, libVersion: '0.1.1', allowedKeys: ALLOWED_PROPERTY_KEYS });
    expect(out?.properties.$lib).toBe(POSTHOG_LIB_NAME);
    expect(out?.properties.$lib_version).toBe('0.1.1');
  });

  it('hashes projectRoot when hashProjectRoot=true (sha256: prefix)', () => {
    const out = toPostHogEnvelope(ev({ projectRoot: '/home/jemi/x' }), API_KEY, {
      hashProjectRoot: true, libVersion: '0.1.1', allowedKeys: ALLOWED_PROPERTY_KEYS,
    });
    const expected = `sha256:${createHash('sha256').update('/home/jemi/x').digest('hex')}`;
    expect(out?.properties.projectRoot).toBe(expected);
  });

  it('passes projectRoot raw when hashProjectRoot=false', () => {
    const out = toPostHogEnvelope(ev({ projectRoot: '/home/jemi/x' }), API_KEY, {
      hashProjectRoot: false, libVersion: '0.1.1', allowedKeys: ALLOWED_PROPERTY_KEYS,
    });
    expect(out?.properties.projectRoot).toBe('/home/jemi/x');
  });

  it('returns null when installationId is missing', () => {
    const raw = ev();
    delete raw.installationId;
    const out = toPostHogEnvelope(raw, API_KEY, { hashProjectRoot: false, libVersion: '0.1.1', allowedKeys: ALLOWED_PROPERTY_KEYS });
    expect(out).toBeNull();
  });

  it('drops keys not on the whitelist (security)', () => {
    const raw = ev({ secretApiKey: 'sk-leaked-key', somethingElse: 'wat' }) as TelemetryEvent;
    const out = toPostHogEnvelope(raw, API_KEY, { hashProjectRoot: false, libVersion: '0.1.1', allowedKeys: ALLOWED_PROPERTY_KEYS });
    expect(out?.properties.secretApiKey).toBeUndefined();
    expect(out?.properties.somethingElse).toBeUndefined();
  });

  it('honours custom allowedKeys parameter', () => {
    const out = toPostHogEnvelope(
      ev({ stage: 'planning', confidence: 0.92 }),
      API_KEY,
      { hashProjectRoot: false, libVersion: '0.1.1', allowedKeys: ['stage'] },
    );
    expect(out?.properties.stage).toBe('planning');
    expect(out?.properties.confidence).toBeUndefined();
    expect(out?.properties.userId).toBeUndefined();
  });
});

describe('TelemetryBatcher — hashProjectRootValue', () => {
  it('produces deterministic SHA-256 hash with sha256: prefix', () => {
    const a = hashProjectRootValue('/home/x');
    const b = hashProjectRootValue('/home/x');
    expect(a).toBe(b);
    expect(a.startsWith('sha256:')).toBe(true);
    expect(a.length).toBe('sha256:'.length + 64);
  });

  it('produces different hashes for different paths', () => {
    expect(hashProjectRootValue('/home/a')).not.toBe(hashProjectRootValue('/home/b'));
  });
});

describe('TelemetryBatcher — buildEnvelopes (one envelope per event)', () => {
  it('empty events produce empty envelopes', () => {
    const result = buildEnvelopes([], { apiKey: API_KEY });
    expect(result.envelopes).toHaveLength(0);
    expect(result.consumedCount).toBe(0);
  });

  it('single event produces one envelope', () => {
    const result = buildEnvelopes([ev()], { apiKey: API_KEY, hashProjectRoot: false });
    expect(result.envelopes).toHaveLength(1);
    expect(result.envelopes[0].api_key).toBe(API_KEY);
    expect(result.envelopes[0].event).toBe('prompt_received');
    expect(result.consumedCount).toBe(1);
  });

  it('envelope keys are the PostHog single-event shape (api_key, event, distinct_id, timestamp, properties)', () => {
    const result = buildEnvelopes([ev()], { apiKey: API_KEY });
    expect(Object.keys(result.envelopes[0]).sort()).toEqual(['api_key', 'distinct_id', 'event', 'properties', 'timestamp']);
  });

  it('events without installationId are skipped but consumedCount advances', () => {
    const valid   = ev();
    const noId    = ev();
    delete noId.installationId;
    const result = buildEnvelopes([valid, noId, valid], { apiKey: API_KEY });
    expect(result.envelopes).toHaveLength(2);
    expect(result.consumedCount).toBe(3);
  });

  it('produces N envelopes for N events (one per event, FIFO order)', () => {
    const events = [
      ev({ event: 'prompt_received',   promptCount: 1 }),
      ev({ event: 'prompt_classified', promptCount: 2 }),
      ev({ event: 'profile_computed',  promptCount: 3 }),
    ];
    const result = buildEnvelopes(events, { apiKey: API_KEY, hashProjectRoot: false });
    expect(result.envelopes).toHaveLength(3);
    expect(result.envelopes.map(e => e.event)).toEqual(['prompt_received', 'prompt_classified', 'profile_computed']);
    expect(result.envelopes.map(e => e.properties.promptCount)).toEqual([1, 2, 3]);
  });

  it('caps at maxEventsPerRun — overflow events are NOT consumed', () => {
    const events = Array.from({ length: 10 }, () => ev());
    const result = buildEnvelopes(events, { apiKey: API_KEY, maxEventsPerRun: 4 });
    expect(result.envelopes).toHaveLength(4);
    expect(result.consumedCount).toBe(4);
  });
});

describe('TelemetryBatcher — nested types and defaults', () => {
  it('passes recentPrompts metadata array through untouched (PII-safe shape)', () => {
    const recentPrompts = [
      { index: 1, classifiedStage: 'planning',       confidence: 0.9, capturedAt: 1715000000 },
      { index: 2, classifiedStage: 'implementation', confidence: 0.8, capturedAt: 1715000100 },
    ];
    const result = buildEnvelopes([ev({ event: 'decision_session_started', recentPrompts })], {
      apiKey: API_KEY, hashProjectRoot: false,
    });
    expect(result.envelopes[0].properties.recentPrompts).toEqual(recentPrompts);
  });

  it('with an empty allowedKeys, properties contain only $lib and $lib_version', () => {
    const result = buildEnvelopes([ev({ stage: 'planning', confidence: 0.9 })], {
      apiKey: API_KEY, allowedKeys: [], hashProjectRoot: false,
    });
    expect(Object.keys(result.envelopes[0].properties).sort()).toEqual(['$lib', '$lib_version']);
  });

  it('defaults libVersion to POSTHOG_LIB_VERSION constant', () => {
    const result = buildEnvelopes([ev()], { apiKey: API_KEY });
    expect(result.envelopes[0].properties.$lib_version).toBe(POSTHOG_LIB_VERSION);
  });

  it('defaults hashProjectRoot to true', () => {
    const result = buildEnvelopes([ev({ projectRoot: '/some/path' })], { apiKey: API_KEY });
    expect(String(result.envelopes[0].properties.projectRoot)).toMatch(/^sha256:/);
  });
});

describe('TelemetryBatcher → TelemetryClient integration (single-event POST)', () => {
  it('built envelope reaches fetch with valid PostHog single-event shape and returns ok=true', async () => {
    const events = [ev({ event: 'prompt_received', promptCount: 1 })];
    const { envelopes } = buildEnvelopes(events, { apiKey: API_KEY, hashProjectRoot: true });

    const fetchMock = vi.fn<FetchLike>(async () => ({
      ok:      true,
      status:  200,
      headers: { get: () => null },
    }));

    const result = await postEvent('https://us.i.posthog.com/capture/', envelopes[0], { fetch: fetchMock });
    expect(result).toEqual({ ok: true, status: 200, acceptedCount: 1 });

    const init     = fetchMock.mock.calls[0][1];
    const body     = JSON.parse(init.body);
    expect(body.api_key).toBe(API_KEY);
    expect(body.event).toBe('prompt_received');
    expect(body.distinct_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(body.properties.$lib).toBe('nexpath');
    expect(String(body.properties.projectRoot)).toMatch(/^sha256:/);
    expect(body.batch).toBeUndefined();
  });
});
