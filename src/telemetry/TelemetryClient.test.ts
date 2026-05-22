import { describe, it, expect, vi } from 'vitest';
import {
  postEvent,
  parseRetryAfter,
  DEFAULT_POSTHOG_ENDPOINT,
  DEFAULT_TIMEOUT_MS,
  type FetchLike,
} from './TelemetryClient.js';
import type { PostHogSingleEnvelope } from './types.js';

const ENDPOINT = DEFAULT_POSTHOG_ENDPOINT;
const ENVELOPE: PostHogSingleEnvelope = {
  api_key:     'phc_test',
  event:       'prompt_received',
  distinct_id: 'install-uuid',
  timestamp:   '2026-05-19T10:00:00.000Z',
  properties:  { $lib: 'nexpath', $lib_version: '0.1.1' },
};

function mockResponse(opts: { ok: boolean; status: number; headers?: Record<string, string> }): Parameters<FetchLike>[1] extends never ? never : ReturnType<FetchLike> extends Promise<infer R> ? R : never {
  return {
    ok:      opts.ok,
    status:  opts.status,
    headers: { get: (name: string) => opts.headers?.[name] ?? null },
  } as ReturnType<FetchLike> extends Promise<infer R> ? R : never;
}

describe('TelemetryClient — successful POST', () => {
  it('returns ok=true and acceptedCount=1 on 200', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => mockResponse({ ok: true, status: 200 }));
    const result    = await postEvent(ENDPOINT, ENVELOPE, { fetch: fetchMock });
    expect(result).toEqual({ ok: true, status: 200, acceptedCount: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends POST method and Content-Type: application/json', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => mockResponse({ ok: true, status: 200 }));
    await postEvent(ENDPOINT, ENVELOPE, { fetch: fetchMock });
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('sends User-Agent header with nexpath version', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => mockResponse({ ok: true, status: 200 }));
    await postEvent(ENDPOINT, ENVELOPE, { fetch: fetchMock });
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers['User-Agent']).toMatch(/^nexpath\/\d/);
  });

  it('does NOT send Authorization header (PostHog uses api_key in body)', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => mockResponse({ ok: true, status: 200 }));
    await postEvent(ENDPOINT, ENVELOPE, { fetch: fetchMock });
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('body is valid JSON with flat PostHog single-event shape (api_key, event, distinct_id, timestamp, properties)', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => mockResponse({ ok: true, status: 200 }));
    await postEvent(ENDPOINT, ENVELOPE, { fetch: fetchMock });
    const init   = fetchMock.mock.calls[0][1];
    const parsed = JSON.parse(init.body);
    expect(parsed.api_key).toBe('phc_test');
    expect(parsed.event).toBe('prompt_received');
    expect(parsed.distinct_id).toBe('install-uuid');
    expect(parsed.batch).toBeUndefined();
  });
});

describe('TelemetryClient — error responses', () => {
  it('4xx (non-429) returns kind=http with status', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => mockResponse({ ok: false, status: 400 }));
    const result    = await postEvent(ENDPOINT, ENVELOPE, { fetch: fetchMock });
    expect(result).toEqual({ ok: false, kind: 'http', status: 400 });
  });

  it('5xx returns kind=http with status', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => mockResponse({ ok: false, status: 503 }));
    const result    = await postEvent(ENDPOINT, ENVELOPE, { fetch: fetchMock });
    expect(result).toEqual({ ok: false, kind: 'http', status: 503 });
  });

  it('429 returns retryAfterSeconds parsed from numeric Retry-After header', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => mockResponse({
      ok: false, status: 429, headers: { 'Retry-After': '120' },
    }));
    const result = await postEvent(ENDPOINT, ENVELOPE, { fetch: fetchMock });
    expect(result).toEqual({ ok: false, kind: 'http', status: 429, retryAfterSeconds: 120 });
  });

  it('429 with no Retry-After header omits retryAfterSeconds', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => mockResponse({ ok: false, status: 429 }));
    const result    = await postEvent(ENDPOINT, ENVELOPE, { fetch: fetchMock });
    expect(result).toEqual({ ok: false, kind: 'http', status: 429 });
  });
});

describe('TelemetryClient — network and timeout', () => {
  it('network error returns kind=network', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => { throw new Error('ECONNREFUSED'); });
    const result    = await postEvent(ENDPOINT, ENVELOPE, { fetch: fetchMock });
    expect(result).toEqual({ ok: false, kind: 'network' });
  });

  it('does not throw when fetch rejects', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => { throw new Error('boom'); });
    await expect(postEvent(ENDPOINT, ENVELOPE, { fetch: fetchMock })).resolves.toBeDefined();
  });

  it('aborts the request after timeoutMs and returns network error', async () => {
    const fetchMock = vi.fn<FetchLike>(async (_url, init) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });
    const result = await postEvent(ENDPOINT, ENVELOPE, { fetch: fetchMock, timeoutMs: 50 });
    expect(result).toEqual({ ok: false, kind: 'network' });
  });
});

describe('parseRetryAfter', () => {
  it('parses positive integer seconds', () => {
    expect(parseRetryAfter('120')).toBe(120);
  });

  it('parses zero', () => {
    expect(parseRetryAfter('0')).toBe(0);
  });

  it('floors fractional seconds', () => {
    expect(parseRetryAfter('1.9')).toBe(1);
  });

  it('returns undefined for null header', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  it('returns undefined for empty header', () => {
    expect(parseRetryAfter('  ')).toBeUndefined();
  });

  it('returns undefined for unparseable header', () => {
    expect(parseRetryAfter('not-a-time')).toBeUndefined();
  });

  it('parses HTTP-date header and returns seconds until that date', () => {
    const now      = new Date('2026-05-19T10:00:00.000Z').getTime();
    const target   = new Date(now + 90_000).toUTCString();
    const seconds  = parseRetryAfter(target, () => now);
    expect(seconds).toBe(90);
  });

  it('clamps past HTTP-date to 0 (no negative seconds)', () => {
    const now    = new Date('2026-05-19T10:00:00.000Z').getTime();
    const past   = new Date(now - 60_000).toUTCString();
    expect(parseRetryAfter(past, () => now)).toBe(0);
  });
});

describe('TelemetryClient — options', () => {
  it('passes the supplied URL to fetch', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => mockResponse({ ok: true, status: 200 }));
    const url       = 'https://eu.posthog.example/capture/';
    await postEvent(url, ENVELOPE, { fetch: fetchMock });
    expect(fetchMock.mock.calls[0][0]).toBe(url);
  });

  it('honours custom timeoutMs option', async () => {
    let signalRef: AbortSignal | null = null;
    const fetchMock = vi.fn<FetchLike>(async (_url, init) => {
      signalRef = init.signal;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });
    const start  = Date.now();
    const result = await postEvent(ENDPOINT, ENVELOPE, { fetch: fetchMock, timeoutMs: 30 });
    const elapsed = Date.now() - start;
    expect(result).toEqual({ ok: false, kind: 'network' });
    expect(elapsed).toBeLessThan(500);
    expect(signalRef).not.toBeNull();
  });
});

describe('parseRetryAfter — negative inputs rejected', () => {
  it('returns undefined for negative numeric seconds', () => {
    expect(parseRetryAfter('-30')).toBeUndefined();
  });
});

describe('TelemetryClient — constants', () => {
  it('DEFAULT_POSTHOG_ENDPOINT points at PostHog US cloud /capture/', () => {
    expect(DEFAULT_POSTHOG_ENDPOINT).toBe('https://us.i.posthog.com/capture/');
  });

  it('DEFAULT_TIMEOUT_MS is 10 seconds', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(10_000);
  });
});
