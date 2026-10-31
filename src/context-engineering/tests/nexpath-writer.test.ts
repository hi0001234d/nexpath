/**
 * Desktop writer version (Ved, option b): Nexpath's pipeline runs in the desktop's own
 * process with ONE scoped LLM client (npd_ token + <base>/v1 + X-Device-Id). These tests
 * run the real pipeline against a mocked parseos.tech proxy.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import OpenAI from 'openai';

import { openStore, closeStore, type Store } from '../../store/db.js';
import { prepareNexpathWriterEnhancement } from '../delivery/nexpath-writer-enhancer.js';
import { ingestSessionFacts } from '../ingestion/decision-chainer.js';
import { newNexpathOpenAIClient, runWithNexpathLlmClient } from '../../config/llm-client-scope.js';

type Call = { url: string; authorization: string | null; deviceId: string | null; signal?: AbortSignal };

const USER_KEY = 'sk-userOwnKeyThatMustNeverBeUsed000000';
const PROMPT = '1. fix the retry crash in processRetry 2. then add tests for computeBackoff';

describe('prepareNexpathWriterEnhancement (desktop writer version)', () => {
  let store: Store;
  let calls: Call[];
  const projectRoot = '/workspaces/desktop-writer';
  const context = () => ({
    workspacePath: projectRoot,
    store,
    sessionId: 'desktop-session-1',
    deviceToken: 'npd_desktopToken',
    deviceId: 'device-123',
  });

  const stubProxy = (respond: (url: string, init?: RequestInit) => Promise<Response>) =>
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const headers = new Headers(init?.headers);
      calls.push({ url, authorization: headers.get('authorization'), deviceId: headers.get('x-device-id'), signal: init?.signal ?? undefined });
      return respond(url, init);
    }));

  beforeEach(async () => {
    calls = [];
    store = await openStore(':memory:');
    ingestSessionFacts(store, {
      projectRoot,
      prompt: 'continue',
      assistantResponse: 'Locked requirement: processRetry in src/payment.ts is the only entry point for retries.',
    });
    // The desktop process may carry a user's own key and the desktop flag; neither may leak in.
    vi.stubEnv('OPENAI_API_KEY', USER_KEY);
    vi.stubEnv('OPENAI_BASE_URL', 'https://api.openai.com/v1');
    vi.stubEnv('NEXPATH_DESKTOP_SESSION', '1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    try { closeStore(store); } catch { /* ignore */ }
  });

  it('sends every LLM call to <base>/v1 with the npd_ token and X-Device-Id, never the user key', async () => {
    stubProxy(async () => new Response(JSON.stringify({ error: 'insufficient_credit' }), { status: 402 }));

    await prepareNexpathWriterEnhancement(PROMPT, context(), { apiBaseUrl: 'https://desk.example' });

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.url.startsWith('https://desk.example/v1/')).toBe(true);
      expect(call.authorization).toBe('Bearer npd_desktopToken');
      expect(call.deviceId).toBe('device-123');
    }
    expect(calls.some((c) => c.url.includes('api.openai.com'))).toBe(false);
    expect(JSON.stringify(calls)).not.toContain(USER_KEY);
    expect(calls.some((c) => c.url.endsWith('/v1/me'))).toBe(false);
    // Feature 1 only supplies memory here; its own F3 + rewrite step must not run.
    expect(calls.some((c) => c.url.includes('/f3/'))).toBe(false);
  }, 30_000);

  it.each([
    [402, 'insufficient_credit'],
    [429, 'rate_limit_exceeded'],
  ])('fails open on %i (%s): original prompt, isEnhanced false', async (status, error) => {
    stubProxy(async () => new Response(JSON.stringify({ error }), { status }));

    const r = await prepareNexpathWriterEnhancement(PROMPT, context(), { apiBaseUrl: 'https://desk.example' });

    expect(r.isEnhanced).toBe(false);
    expect(r.enhancedPrompt).toBe(PROMPT);
    expect(Object.keys(r).sort()).toEqual(['contextTokenEstimate', 'enhancedPrompt', 'injectedContextTags', 'isEnhanced', 'processingTimeMs', 'stage', 'stageConfidence']);
  }, 30_000);

  it('fails open on time-out and cancels the in-flight calls', async () => {
    stubProxy((_url, init) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));

    const t0 = performance.now();
    const r = await prepareNexpathWriterEnhancement(PROMPT, context(), { apiBaseUrl: 'https://desk.example', timeoutMs: 400 });

    expect(performance.now() - t0).toBeLessThan(1500);
    expect(r.isEnhanced).toBe(false);
    expect(r.enhancedPrompt).toBe(PROMPT);
    await new Promise((res) => setTimeout(res, 50));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.signal?.aborted)).toBe(true);
  }, 30_000);

  it('returns the original prompt without any call when the desktop credential is missing', async () => {
    stubProxy(async () => new Response('{}'));
    const r = await prepareNexpathWriterEnhancement(PROMPT, { workspacePath: projectRoot, store });
    expect(r.isEnhanced).toBe(false);
    expect(r.enhancedPrompt).toBe(PROMPT);
    expect(calls).toHaveLength(0);
  });

  it('stores no pending CLI popup row for the desktop call', async () => {
    stubProxy(async () => new Response(JSON.stringify({ error: 'insufficient_credit' }), { status: 402 }));
    await prepareNexpathWriterEnhancement(PROMPT, context(), { apiBaseUrl: 'https://desk.example' });
    const rows = store.db.exec('SELECT COUNT(*) FROM pending_prompt_enhancements')[0]?.values[0]?.[0];
    expect(rows).toBe(0);
  }, 30_000);
});

describe('scoped LLM client', () => {
  it('gives each concurrent call its own client and leaves code outside a scope on the environment', async () => {
    const a = new OpenAI({ apiKey: 'npd_a', baseURL: 'https://a.example/v1' });
    const b = new OpenAI({ apiKey: 'npd_b', baseURL: 'https://b.example/v1' });
    const seen: string[] = [];
    const tick = () => new Promise((r) => setTimeout(r, 5));

    await Promise.all([
      runWithNexpathLlmClient(a, async () => { await tick(); seen.push(newNexpathOpenAIClient().baseURL); await tick(); seen.push(newNexpathOpenAIClient().baseURL); }),
      runWithNexpathLlmClient(b, async () => { await tick(); seen.push(newNexpathOpenAIClient().baseURL); }),
    ]);

    expect(seen.filter((u) => u.includes('a.example'))).toHaveLength(2);
    expect(seen.filter((u) => u.includes('b.example'))).toHaveLength(1);
    vi.stubEnv('OPENAI_API_KEY', 'sk-outsideScopeKey0000000000000');
    expect(newNexpathOpenAIClient().apiKey).toBe('sk-outsideScopeKey0000000000000');
    vi.unstubAllEnvs();
  });
});
