import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveLLMCredentials,
  applyLLMCredentialEnv,
  isValidNexpathTokenShape,
  NEXPATH_TOKEN_KEY,
  NEXPATH_BASE_URL_KEY,
  DEFAULT_API_BASE_URL,
} from './llm-credentials.js';
import type { KeyStorePort } from '../../core/ports/keystore.port.js';

const VALID_TOKEN = 'npk_0123456789abcdefghij';

function storeWith(values: Record<string, string>): KeyStorePort {
  return {
    getKey: async (name: string) => values[name] ?? null,
    setKey: async () => { /* unused */ },
  } as unknown as KeyStorePort;
}

type EnvHolder = { process?: { env?: Record<string, string | undefined> } };
function env(): Record<string, string | undefined> {
  const holder = globalThis as EnvHolder;
  holder.process ??= {};
  holder.process.env ??= {};
  return holder.process.env;
}

describe('resolveLLMCredentials — the browser mirror of the CLI resolution order', () => {
  it('the own OpenAI key ALWAYS wins, even with a token stored', async () => {
    const creds = await resolveLLMCredentials(storeWith({
      openai_api_key: 'sk-own-key',
      [NEXPATH_TOKEN_KEY]: VALID_TOKEN,
      [NEXPATH_BASE_URL_KEY]: 'https://service.example/v1',
    }));
    expect(creds).toEqual({ apiKey: 'sk-own-key', source: 'openai', baseUrl: null });
  });

  it('token-only resolves to nexpath_token mode with the stored base URL', async () => {
    const creds = await resolveLLMCredentials(storeWith({
      [NEXPATH_TOKEN_KEY]: VALID_TOKEN,
      [NEXPATH_BASE_URL_KEY]: 'https://service.example/v1/',
    }));
    expect(creds.source).toBe('nexpath_token');
    expect(creds.apiKey).toBe(VALID_TOKEN);
    // trailing slashes normalised away so URL joins cannot double them
    expect(creds.baseUrl).toBe('https://service.example/v1');
  });

  it('token-only with no stored base URL falls back to the shipped default', async () => {
    const creds = await resolveLLMCredentials(storeWith({ [NEXPATH_TOKEN_KEY]: VALID_TOKEN }));
    expect(creds.baseUrl).toBe(DEFAULT_API_BASE_URL);
  });

  it('a malformed stored token is ignored, not sent', async () => {
    const creds = await resolveLLMCredentials(storeWith({ [NEXPATH_TOKEN_KEY]: 'not-a-token' }));
    expect(creds).toEqual({ apiKey: null, source: 'none', baseUrl: null });
  });

  it('neither credential resolves to none', async () => {
    const creds = await resolveLLMCredentials(storeWith({}));
    expect(creds).toEqual({ apiKey: null, source: 'none', baseUrl: null });
  });
});

describe('applyLLMCredentialEnv — the fake-env bridge the adapters read', () => {
  beforeEach(() => {
    delete env()['OPENAI_API_KEY'];
    delete env()['OPENAI_BASE_URL'];
  });

  it('token mode publishes BOTH the key and the base URL', () => {
    applyLLMCredentialEnv({ apiKey: VALID_TOKEN, source: 'nexpath_token', baseUrl: 'https://service.example/v1' });
    expect(env()['OPENAI_API_KEY']).toBe(VALID_TOKEN);
    expect(env()['OPENAI_BASE_URL']).toBe('https://service.example/v1');
  });

  it('openai mode publishes the key and REMOVES any stale base URL', () => {
    env()['OPENAI_BASE_URL'] = 'https://stale.example/v1';
    applyLLMCredentialEnv({ apiKey: 'sk-own-key', source: 'openai', baseUrl: null });
    expect(env()['OPENAI_API_KEY']).toBe('sk-own-key');
    expect(env()['OPENAI_BASE_URL']).toBeUndefined();
  });

  it('none clears both — no credential can linger', () => {
    env()['OPENAI_API_KEY'] = 'sk-stale';
    env()['OPENAI_BASE_URL'] = 'https://stale.example/v1';
    applyLLMCredentialEnv({ apiKey: null, source: 'none', baseUrl: null });
    expect(env()['OPENAI_API_KEY']).toBeUndefined();
    expect(env()['OPENAI_BASE_URL']).toBeUndefined();
  });
});

describe('isValidNexpathTokenShape — mirror of the CLI token validator', () => {
  it('accepts the served shape (npk_ + 20+ url-safe chars)', () => {
    expect(isValidNexpathTokenShape(VALID_TOKEN)).toBe(true);
    expect(isValidNexpathTokenShape('npk_-7zI1d-H_obJzkBkWgzA97lEWGUR_BUvMXFrz2AzgJk')).toBe(true);
  });
  it('rejects everything else', () => {
    expect(isValidNexpathTokenShape('sk-not-a-token-000000000000')).toBe(false);
    expect(isValidNexpathTokenShape('npk_short')).toBe(false);
    expect(isValidNexpathTokenShape('')).toBe(false);
  });
});
