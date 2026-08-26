import { afterEach, describe, expect, it } from 'vitest';
import OpenAIStub from './openai-sdk.js';

type EnvHolder = { process?: { env?: Record<string, string | undefined> } };

const setEnvKey = (value: string | undefined): void => {
  const holder = globalThis as EnvHolder;
  holder.process ??= { env: {} };
  holder.process.env ??= {};
  if (value === undefined) delete holder.process.env['OPENAI_API_KEY'];
  else holder.process.env['OPENAI_API_KEY'] = value;
};

describe('openai SDK browser stub', () => {
  afterEach(() => setEnvKey(undefined));

  it('throws at construction with no key — the real SDK behaviour the engine fallback paths rely on', () => {
    setEnvKey(undefined);
    expect(() => new OpenAIStub()).toThrow(/OPENAI_API_KEY environment variable is missing/);
  });

  it('constructs the fetch-backed SDK-shaped client from the env slot (the pe-engine refresh path)', () => {
    setEnvKey('sk-test-env-key');
    const client = new OpenAIStub() as unknown as { chat: { completions: { create: unknown } } };
    expect(typeof client.chat.completions.create).toBe('function');
  });

  it('an explicit apiKey option wins over the env slot', () => {
    setEnvKey(undefined);
    const client = new OpenAIStub({ apiKey: 'sk-test-direct' }) as unknown as {
      chat: { completions: { create: unknown } };
    };
    expect(typeof client.chat.completions.create).toBe('function');
  });
});
