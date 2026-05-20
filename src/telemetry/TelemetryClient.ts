import { POSTHOG_LIB_VERSION } from './TelemetryBatcher.js';
import type { PostHogSingleEnvelope } from './types.js';

export const DEFAULT_POSTHOG_ENDPOINT = 'https://us.i.posthog.com/capture/';
export const DEFAULT_TIMEOUT_MS       = 10_000;

export type FetchLike = (input: string, init: {
  method:  string;
  headers: Record<string, string>;
  body:    string;
  signal:  AbortSignal;
}) => Promise<{
  ok:      boolean;
  status:  number;
  headers: { get(name: string): string | null };
}>;

export interface ClientOptions {
  fetch?:     FetchLike;
  timeoutMs?: number;
}

export interface SuccessResult {
  ok:            true;
  status:        number;
  acceptedCount: 1;
}

export interface NetworkErrorResult {
  ok:   false;
  kind: 'network';
}

export interface HttpErrorResult {
  ok:                 false;
  kind:               'http';
  status:             number;
  retryAfterSeconds?: number;
}

export type SendResult = SuccessResult | NetworkErrorResult | HttpErrorResult;

export async function postEvent(
  url:      string,
  envelope: PostHogSingleEnvelope,
  opts:     ClientOptions = {},
): Promise<SendResult> {
  const fetchImpl = opts.fetch     ?? (globalThis.fetch as unknown as FetchLike);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(url, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':   `nexpath/${POSTHOG_LIB_VERSION}`,
      },
      body:    JSON.stringify(envelope),
      signal:  controller.signal,
    });

    if (res.ok) {
      return { ok: true, status: res.status, acceptedCount: 1 };
    }

    if (res.status === 429) {
      const retryAfterSeconds = parseRetryAfter(res.headers.get('Retry-After'));
      const out: HttpErrorResult = { ok: false, kind: 'http', status: 429 };
      if (retryAfterSeconds !== undefined) out.retryAfterSeconds = retryAfterSeconds;
      return out;
    }

    return { ok: false, kind: 'http', status: res.status };
  } catch {
    return { ok: false, kind: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

export function parseRetryAfter(header: string | null, now: () => number = Date.now): number | undefined {
  if (header === null || header.trim() === '') return undefined;
  const trimmed = header.trim();

  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && asNumber >= 0) return Math.floor(asNumber);

  const asDate = new Date(trimmed).getTime();
  if (Number.isFinite(asDate)) {
    return Math.max(0, Math.floor((asDate - now()) / 1000));
  }

  return undefined;
}
