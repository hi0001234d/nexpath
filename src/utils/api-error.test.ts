import { describe, it, expect } from 'vitest';
import { extractApiError } from './api-error.js';

describe('extractApiError', () => {
  it('extracts message from a plain Error', () => {
    const result = extractApiError(new Error('something went wrong'), 'openai');
    expect(result.provider).toBe('openai');
    expect(result.message).toBe('something went wrong');
    expect(result.status).toBeUndefined();
    expect(result.code).toBeUndefined();
    expect(result.type).toBeUndefined();
  });

  it('extracts status, code, type from a provider-shaped error object', () => {
    const apiErr = Object.assign(new Error('invalid api key'), {
      status: 401,
      code:   'invalid_api_key',
      type:   'authentication_error',
    });
    const result = extractApiError(apiErr, 'openai');
    expect(result.status).toBe(401);
    expect(result.code).toBe('invalid_api_key');
    expect(result.type).toBe('authentication_error');
    expect(result.message).toBe('invalid api key');
  });

  it('handles non-Error thrown values', () => {
    const result = extractApiError('raw string error', 'anthropic');
    expect(result.provider).toBe('anthropic');
    expect(result.message).toBe('raw string error');
  });

  it('omits fields that are not present or wrong type', () => {
    const partial = Object.assign(new Error('quota exceeded'), { status: 429 });
    const result = extractApiError(partial, 'openai');
    expect(result.status).toBe(429);
    expect(result.code).toBeUndefined();
    expect(result.type).toBeUndefined();
  });
});
