export type ApiProvider = 'openai' | 'anthropic' | 'unknown';

export interface ApiErrorDetails {
  provider: ApiProvider;
  message:  string;
  status?:  number;
  code?:    string;
  type?:    string;
}

/**
 * Extract structured error details from any provider API error.
 * Duck-typed — works for OpenAI SDK errors, Anthropic SDK errors, and plain Errors.
 * Fields status / code / type are omitted when not present (client-side errors,
 * e.g. missing API key, never reach the network).
 */
export function extractApiError(err: unknown, provider: ApiProvider): ApiErrorDetails {
  const message = err instanceof Error ? err.message : String(err);
  const e = err as Record<string, unknown>;

  const status = typeof e['status'] === 'number' ? e['status'] : undefined;
  const code   = typeof e['code']   === 'string'  ? e['code']   : undefined;
  const type   = typeof e['type']   === 'string'  ? e['type']   : undefined;

  return { provider, message, status, code, type };
}
