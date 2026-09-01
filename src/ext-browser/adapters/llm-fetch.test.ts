import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FetchLLMAdapter } from './llm-fetch.js';

const mockFetch = vi.fn();

// Provide fetch as a global in the test env (JSDOM/Node doesn't have it by default in older setups)
vi.stubGlobal('fetch', mockFetch);

function makeResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('FetchLLMAdapter', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('returns content string from first choice', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ choices: [{ message: { content: 'hello world' } }] }),
    );
    const adapter = new FetchLLMAdapter('sk-test');
    const result = await adapter.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result).toBe('hello world');
  });

  it('returns empty string when content is null', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ choices: [{ message: { content: null } }] }),
    );
    const adapter = new FetchLLMAdapter('sk-test');
    const result = await adapter.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result).toBe('');
  });

  it('returns empty string when choices is empty', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ choices: [] }));
    const adapter = new FetchLLMAdapter('sk-test');
    const result = await adapter.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result).toBe('');
  });

  it('passes Authorization header with api key', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ choices: [{ message: { content: 'x' } }] }),
    );
    const adapter = new FetchLLMAdapter('sk-mykey');
    await adapter.chat({ model: 'gpt-4o', messages: [{ role: 'user', content: 'x' }] });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-mykey');
  });

  it('passes model and messages in request body', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ choices: [{ message: { content: 'x' } }] }),
    );
    const adapter = new FetchLLMAdapter('sk-test');
    await adapter.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'usr' }],
      temperature: 0,
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['model']).toBe('gpt-4o-mini');
    expect(body['messages']).toHaveLength(2);
    expect(body['temperature']).toBe(0);
  });

  it('passes max_tokens when provided', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ choices: [{ message: { content: 'x' } }] }),
    );
    const adapter = new FetchLLMAdapter('sk-test');
    await adapter.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'x' }],
      max_tokens: 100,
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['max_tokens']).toBe(100);
  });

  it('passes response_format when provided', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ choices: [{ message: { content: '{}' } }] }),
    );
    const adapter = new FetchLLMAdapter('sk-test');
    await adapter.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'x' }],
      response_format: { type: 'json_object' },
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['response_format']).toEqual({ type: 'json_object' });
  });

  it('throws on non-ok HTTP response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Unauthorized',
    } as unknown as Response);
    const adapter = new FetchLLMAdapter('sk-bad');
    await expect(
      adapter.chat({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow('401');
  });

  it('propagates fetch network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));
    const adapter = new FetchLLMAdapter('sk-test');
    await expect(
      adapter.chat({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow('network error');
  });

  it('sends AbortSignal when timeoutMs is provided', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ choices: [{ message: { content: 'x' } }] }),
    );
    const adapter = new FetchLLMAdapter('sk-test');
    await adapter.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'x' }],
      timeoutMs: 5000,
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('does not send AbortSignal when timeoutMs is not provided', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ choices: [{ message: { content: 'x' } }] }),
    );
    const adapter = new FetchLLMAdapter('sk-test');
    await adapter.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'x' }],
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeUndefined();
  });
});

describe('timeout presentation (engine classification faithfulness)', () => {
  it('an aborted fetch surfaces as "timed out" — the wording llm-composer.ts:116-120 classifies as a timeout, exactly like the real SDK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(Object.assign(new DOMException('The operation was aborted', 'AbortError')));
        });
      })));
    try {
      const adapter = new FetchLLMAdapter('sk-test');
      await expect(adapter.chat({
        model: 'm', messages: [], temperature: 0, timeoutMs: 10,
      } as never)).rejects.toThrow(/timed out after 10ms/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('FetchLLMAdapter — endpoint resolution (Nexpath-token mode, llm-credentials.ts)', () => {
  type EnvHolder = { process?: { env?: Record<string, string | undefined> } };
  function env(): Record<string, string | undefined> {
    const holder = globalThis as EnvHolder;
    holder.process ??= {};
    holder.process.env ??= {};
    return holder.process.env;
  }

  beforeEach(() => {
    // An earlier test ends with vi.unstubAllGlobals(), which removes the
    // module-level fetch stub — without re-stubbing here these tests would hit
    // the real network (C-12 forbids that; it happened on first run: a real
    // OpenAI 401 came back).
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockClear();
    delete env()['OPENAI_BASE_URL'];
  });

  const ok = () => makeResponse({ choices: [{ message: { content: 'ok' } }] });
  const params = { model: 'gpt-4o-mini', messages: [], temperature: 0 } as never;

  it('defaults to the OpenAI endpoint when no env base URL is set (unchanged behaviour)', async () => {
    mockFetch.mockResolvedValueOnce(ok());
    await new FetchLLMAdapter('sk-test').chat(params);
    expect(mockFetch.mock.calls[0]![0]).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('honours the env OPENAI_BASE_URL published by applyLLMCredentialEnv', async () => {
    env()['OPENAI_BASE_URL'] = 'https://service.example/v1';
    mockFetch.mockResolvedValueOnce(ok());
    await new FetchLLMAdapter('npk_0123456789abcdefghij').chat(params);
    expect(mockFetch.mock.calls[0]![0]).toBe('https://service.example/v1/chat/completions');
    // and the bearer is the token, exactly as passed
    const init = mockFetch.mock.calls[0]![1] as { headers: Record<string, string> };
    expect(init.headers['Authorization']).toBe('Bearer npk_0123456789abcdefghij');
  });

  it('an explicit constructor URL outranks the env (test seam)', async () => {
    env()['OPENAI_BASE_URL'] = 'https://ignored.example/v1';
    mockFetch.mockResolvedValueOnce(ok());
    await new FetchLLMAdapter('sk-test', 'https://explicit.example/v1/chat/completions').chat(params);
    expect(mockFetch.mock.calls[0]![0]).toBe('https://explicit.example/v1/chat/completions');
  });
});
