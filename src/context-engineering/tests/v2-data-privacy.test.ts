/**
 * F3 privacy switch (`dataPrivacy`, F3 Version 2, live 2026-11-05; plan agreed with F3 2026-11-06).
 *
 * Rule: while the prompt bar's switch is on, no cloud AI processes the user's data.
 *  - F3 gets `dataPrivacy: true` and answers "skip" where it would answer "pro".
 *  - A skip, any F3 error, a failed LAN call or no time left → the original prompt, unchanged
 *    (the desktop sends whatever we return to the server). No Cloud Pro call, no result report.
 *  - A rewrite on the user's own LAN machine (memory included) is allowed.
 *  - The writer pipeline is skipped as a whole; MemOS makes no cloud call and never gets a private turn.
 *  - Switch off → exactly today's behaviour (the request does not even carry the field).
 * Network calls are answered by a fake fetch; nothing leaves the machine.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const runAutoCalls: unknown[] = [];
vi.mock('../../cli/commands/auto.js', () => ({
  runAuto: vi.fn(async () => {
    runAutoCalls.push(1);
    return { outcome: 'no_action' };
  }),
}));

const { F3ResourceClient, executeLocalOrProCompletion, preparePromptEnhancement, upsertContextMemory, normalizeProjectId } = await import('../index.js');
const { prepareNexpathWriterEnhancement } = await import('../delivery/nexpath-writer-enhancer.js');
const { createDesktopFeature1Tools } = await import('../delivery/desktop-feature1-tools.js');
const { openStore, closeStore } = await import('../../store/db.js');
type Store = Awaited<ReturnType<typeof openStore>>;

/** What each fake endpoint answers; a function may throw (network error) or hang (timeout). */
type Answer = { status?: number; json?: unknown } | 'network-error' | 'hang';
interface Seen { url: string; body: any }

function fakeNetwork(routes: { resource?: Answer; result?: Answer; lan?: Answer; pro?: Answer }) {
  const seen: Seen[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    seen.push({ url, body });
    const answer: Answer | undefined = url.includes('/f3/v1/resource-result')
      ? routes.result ?? { status: 200, json: {} }
      : url.includes('/f3/v1/resource')
        ? routes.resource
        : url.includes('127.0.0.1')
          ? routes.lan
          : url.includes('/chat/completions')
            ? routes.pro ?? { status: 200, json: { choices: [{ message: { content: 'PRO REWRITE' } }] } }
            : undefined;
    if (!answer || answer === 'network-error') throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    if (answer === 'hang') {
      return new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    }
    const status = answer.status ?? 200;
    return { ok: status < 400, status, json: async () => answer.json } as any;
  });
  const calls = (part: string) => seen.filter((s) => s.url.includes(part));
  return {
    seen,
    resource: () => calls('/f3/v1/resource').filter((s) => !s.url.includes('resource-result')),
    results: () => calls('/f3/v1/resource-result'),
    lan: () => calls('127.0.0.1'),
    pro: () => seen.filter((s) => s.url.includes('/chat/completions') && !s.url.includes('127.0.0.1')),
  };
}

const LAN = { deviceId: 'lan-1', tier: 'T5', model: 'qwen2.5-coder:7b', endpoint: 'peer-1' };
const localAnswer = { status: 200, json: { decisionId: 'd-local-1', target: 'local', reason: 'LAN_OK', lanDevice: LAN, pro: null } };
const skipAnswer = { status: 200, json: { decisionId: 'd-9', target: 'skip', reason: 'NO_LAN_DEVICE', lanDevice: null, pro: null } };
const request = (extra: Record<string, unknown> = {}) => ({
  requestId: 'req-1', callKind: 'pe_composer' as const, approxInputTokens: 300, typicalOutputTokens: 300, maxOutputTokens: 2000,
  timeoutMs: 5000, needsJson: false, language: 'en', background: false, localAllowed: true, ...extra,
});
const flush = () => new Promise((r) => setTimeout(r, 20));

afterEach(() => vi.restoreAllMocks());

describe('F3 client with the privacy switch', () => {
  it('switch off: the request is exactly today\'s (no dataPrivacy field) and a 500 still means Pro', async () => {
    const net = fakeNetwork({ resource: { status: 500 } });
    const d = await new F3ResourceClient({ baseUrl: 'http://f3' }).getResourceDecision(request());
    expect(net.resource()[0].body).not.toHaveProperty('dataPrivacy');
    expect(d.target).toBe('pro');
  });

  it('switch on: sends dataPrivacy: true and reads "skip" (reason kept, no device, no pro)', async () => {
    const net = fakeNetwork({ resource: skipAnswer });
    const d = await new F3ResourceClient({ baseUrl: 'http://f3' }).getResourceDecision(request({ dataPrivacy: true }));
    expect(net.resource()[0].body.dataPrivacy).toBe(true);
    expect(d).toMatchObject({ target: 'skip', reason: 'NO_LAN_DEVICE', lanDevice: null, pro: null });
  });

  it.each([
    ['HTTP 500', { status: 500 }, 'HTTP_500'],
    ['HTTP 413 TOO_LARGE', { status: 413, json: { detail: 'TOO_LARGE' } }, 'HTTP_413'],
    ['HTTP 429', { status: 429 }, 'HTTP_429'],
    ['network error', 'network-error', 'ROUTER_NETWORK_ERROR'],
    ['a "pro" answer (never expected)', { status: 200, json: { decisionId: 'd-p', target: 'pro', reason: 'X', pro: { model: 'gpt-4o-mini' } } }, 'INVALID_RESPONSE'],
    ['"local" without a device', { status: 200, json: { decisionId: 'd-l', target: 'local', reason: 'X', lanDevice: null } }, 'INVALID_RESPONSE'],
    ['a bad answer', { status: 200, json: { nothing: true } }, 'INVALID_RESPONSE'],
  ] as const)('switch on: %s → skip, never Pro', async (_name, answer, reason) => {
    fakeNetwork({ resource: answer as Answer });
    const d = await new F3ResourceClient({ baseUrl: 'http://f3' }).getResourceDecision(request({ dataPrivacy: true }));
    expect(d).toMatchObject({ target: 'skip', reason, lanDevice: null, pro: null });
  });

  it('switch on: a timeout → skip', async () => {
    fakeNetwork({ resource: 'hang' });
    const d = await new F3ResourceClient({ baseUrl: 'http://f3', timeoutMs: 50 }).getResourceDecision(request({ dataPrivacy: true }));
    expect(d).toMatchObject({ target: 'skip', reason: 'ROUTER_TIMEOUT' });
  });

  it('switch on: a usable LAN answer runs locally', async () => {
    fakeNetwork({ resource: localAnswer });
    const d = await new F3ResourceClient({ baseUrl: 'http://f3' }).getResourceDecision(request({ dataPrivacy: true }));
    expect(d).toMatchObject({ target: 'local', lanDevice: LAN, pro: null });
  });

  it('switch on with local not allowed → skip without asking F3 (off: Pro, as today)', async () => {
    const net = fakeNetwork({});
    const client = new F3ResourceClient({ baseUrl: 'http://f3' });
    expect((await client.getResourceDecision(request({ localAllowed: false, dataPrivacy: true }))).target).toBe('skip');
    expect((await client.getResourceDecision(request({ localAllowed: false }))).target).toBe('pro');
    expect(net.resource()).toHaveLength(0);
  });

  it('the 30 s cache keeps privacy and normal answers apart', async () => {
    const net = fakeNetwork({ resource: skipAnswer });
    const client = new F3ResourceClient({ baseUrl: 'http://f3' });
    await client.getResourceDecision(request({ dataPrivacy: true }));
    vi.restoreAllMocks();
    const net2 = fakeNetwork({ resource: localAnswer });
    expect((await client.getResourceDecision(request())).target).toBe('local'); // not the cached skip
    expect((await client.getResourceDecision(request({ dataPrivacy: true }))).target).toBe('skip'); // cached
    expect(net.resource()).toHaveLength(1);
    expect(net2.resource()).toHaveLength(1);
  });

  it('no /resource-result is ever sent for a skip; a normal decision still reports', async () => {
    const net = fakeNetwork({ resource: skipAnswer });
    const client = new F3ResourceClient({ baseUrl: 'http://f3' });
    const skip = await client.getResourceDecision(request({ dataPrivacy: true }));
    client.reportResult({ decisionId: skip.decisionId, ranOn: 'local', ok: false, latencyMs: 1, failType: 'LOCAL_ERROR', fellBackToPro: false });
    client.reportResult({ decisionId: 'd-local-1', ranOn: 'local', ok: true, latencyMs: 1, failType: null, fellBackToPro: false });
    await flush();
    expect(net.results().map((r) => r.body.decisionId)).toEqual(['d-local-1']);
  });
});

describe('LAN call without the Cloud Pro fallback', () => {
  it('allowProFallback: false → a failed LAN call ends with no content and no Pro call', async () => {
    const net = fakeNetwork({ lan: { status: 500 } });
    const r = await executeLocalOrProCompletion(LAN, { messages: [{ role: 'user', content: 'x' }] }, { allowProFallback: false });
    expect(r).toMatchObject({ content: '', ranOn: 'local', fellBackToPro: false, failType: 'LOCAL_ERROR' });
    expect(net.pro()).toHaveLength(0);
  });

  it('default (switch off): a failed LAN call still falls back to Pro, as today', async () => {
    const net = fakeNetwork({ lan: { status: 500 } });
    const r = await executeLocalOrProCompletion(LAN, { messages: [{ role: 'user', content: 'x' }] });
    expect(r).toMatchObject({ content: 'PRO REWRITE', ranOn: 'pro', fellBackToPro: true });
    expect(net.pro()).toHaveLength(1);
  });
});

describe('preparePromptEnhancement with the privacy switch', () => {
  const projectRoot = '/w/privacy-app';
  const PROMPT = 'add a retry when processRetry fails for a payment';
  let store: Store;

  beforeEach(async () => {
    store = await openStore(':memory:');
    upsertContextMemory(store, {
      projectRoot: normalizeProjectId(projectRoot),
      kind: 'rule',
      key: 'retry-entry',
      content: 'processRetry in src/payments/retry.ts is the only entry point for payment retries',
      locked: true,
      confidence: 0.95,
    });
  });
  afterEach(() => closeStore(store));

  const context = (dataPrivacy?: boolean) => ({ workspacePath: projectRoot, store, sessionId: `s-${Math.random()}`, deviceToken: 'npd_t', deviceId: 'dev-1', dataPrivacy });
  const delivered = () => Number(store.db.exec('SELECT COUNT(*) FROM delivered_items')[0]?.values[0]?.[0] ?? 0);
  const run = (dataPrivacy: boolean | undefined, extra: Record<string, unknown> = {}) =>
    preparePromptEnhancement(PROMPT, context(dataPrivacy), { timeoutMs: 5000, f3BaseUrl: 'http://f3', cloudProUrl: 'http://pro/v1/chat/completions', ...extra });

  it.each([
    ['F3 says skip', { resource: skipAnswer }],
    ['F3 error', { resource: { status: 500 } }],
    ['F3 network error', { resource: 'network-error' }],
    ['LAN call fails', { resource: localAnswer, lan: { status: 500 } }],
    ['LAN answers empty', { resource: localAnswer, lan: { status: 200, json: { choices: [{ message: { content: '  ' } }] } } }],
  ] as const)('%s → the original prompt unchanged, no Pro call, nothing recorded as shown', async (_n, routes) => {
    const net = fakeNetwork(routes as any);
    const before = delivered();
    const r = await run(true);
    expect(r).toMatchObject({ isEnhanced: false, enhancedPrompt: PROMPT, injectedContextTags: [], contextTokenEstimate: 0 });
    expect(net.pro()).toHaveLength(0);
    expect(net.resource()[0].body.dataPrivacy).toBe(true);
    expect(delivered()).toBe(before);
    await flush();
    if ((routes as any).resource === skipAnswer) expect(net.results()).toHaveLength(0);
    // a failed LAN run is reported as failed, without a fallback (found by semi-e2e TC-E2E-33)
    if ((routes as any).lan) expect(net.results().map((x) => x.body)).toEqual([expect.objectContaining({ ok: false, fellBackToPro: false })]);
  });

  it('LAN rewrite works → its text (memory sent only to the LAN machine), no Pro call', async () => {
    const net = fakeNetwork({ resource: localAnswer, lan: { status: 200, json: { choices: [{ message: { content: 'LAN REWRITE with processRetry rule' } }] } } });
    const r = await run(true);
    expect(r).toMatchObject({ isEnhanced: true, enhancedPrompt: 'LAN REWRITE with processRetry rule' });
    expect(JSON.stringify(net.lan()[0].body)).toContain('only entry point for payment retries');
    expect(net.pro()).toHaveLength(0);
    await flush();
    expect(net.results().map((x) => x.body)).toEqual([expect.objectContaining({ decisionId: 'd-local-1', ranOn: 'local', ok: true, fellBackToPro: false })]);
  });

  it('no LLM step at all (skipLlmRewrite) → the original prompt, never the locally composed one', async () => {
    const net = fakeNetwork({});
    const r = await run(true, { skipLlmRewrite: true });
    expect(r).toMatchObject({ isEnhanced: false, enhancedPrompt: PROMPT });
    expect(net.seen).toHaveLength(0);
  });

  it('switch off: unchanged — an F3 error goes to Pro, and the request has no dataPrivacy field', async () => {
    const net = fakeNetwork({ resource: { status: 500 } });
    const r = await run(undefined);
    expect(r).toMatchObject({ isEnhanced: true, enhancedPrompt: 'PRO REWRITE' });
    expect(net.resource()[0].body).not.toHaveProperty('dataPrivacy');
    expect(net.pro()).toHaveLength(1);
  });
});

describe('desktop writer function and tools with the privacy switch', () => {
  const projectRoot = '/w/privacy-desk';
  let store: Store;
  beforeEach(async () => {
    runAutoCalls.length = 0;
    store = await openStore(':memory:');
    upsertContextMemory(store, {
      projectRoot: normalizeProjectId(projectRoot), kind: 'rule', key: 'retry-entry',
      content: 'processRetry in src/payments/retry.ts is the only entry point for payment retries', locked: true, confidence: 0.95,
    });
  });
  afterEach(() => closeStore(store));

  const fakeMemos = (log: string[]) =>
    ({ name: 'memos', available: async () => true, search: async () => (log.push('search'), []), capture: async () => (log.push('capture'), undefined), learnedRules: async () => [], close: async () => {} }) as never;
  const fake = (name: string) => ({ name, available: async () => true, search: async () => [] }) as never;

  it('switch on: the writer pipeline never runs; the local path does (LAN rewrite, no Pro)', async () => {
    const net = fakeNetwork({ resource: localAnswer, lan: { status: 200, json: { choices: [{ message: { content: 'LAN TEXT' } }] } } });
    const log: string[] = [];
    const tools = createDesktopFeature1Tools({ dataDir: '/unused', drivers: { memos: fakeMemos(log), openclaw: fake('openclaw'), codebase: fake('codebase') } });
    const r = await prepareNexpathWriterEnhancement(
      'add a retry when processRetry fails for a payment',
      { workspacePath: projectRoot, store, sessionId: 's1', deviceToken: 'npd_t', deviceId: 'dev-1', dataPrivacy: true },
      { tools, apiBaseUrl: 'http://f3' }
    );
    expect(runAutoCalls).toHaveLength(0);
    expect(r).toMatchObject({ isEnhanced: true, enhancedPrompt: 'LAN TEXT' });
    expect(net.resource()[0].url).toBe('http://f3/f3/v1/resource');
    expect(net.resource()[0].body.dataPrivacy).toBe(true);
    expect(net.pro()).toHaveLength(0);
    expect(log).toContain('search'); // the tools still give memory, on the device
  });

  it('switch on and F3 skips: the original prompt from the writer function', async () => {
    fakeNetwork({ resource: skipAnswer });
    const r = await prepareNexpathWriterEnhancement(
      'add a retry when processRetry fails for a payment',
      { workspacePath: projectRoot, store, sessionId: 's2', deviceToken: 'npd_t', deviceId: 'dev-1', dataPrivacy: true },
      { apiBaseUrl: 'http://f3' }
    );
    expect(runAutoCalls).toHaveLength(0);
    expect(r).toMatchObject({ isEnhanced: false, enhancedPrompt: 'add a retry when processRetry fails for a payment' });
  });

  it('switch off: the writer pipeline runs as today', async () => {
    fakeNetwork({});
    await prepareNexpathWriterEnhancement(
      'add a retry when processRetry fails for a payment',
      { workspacePath: projectRoot, store, sessionId: 's3', deviceToken: 'npd_t', deviceId: 'dev-1' },
      { apiBaseUrl: 'http://127.0.0.1:9' }
    );
    expect(runAutoCalls).toHaveLength(1);
  });

  it('MemOS cloud calls are refused while the switch is on, and work again when it is off', async () => {
    const tools = createDesktopFeature1Tools({ dataDir: '/unused', drivers: { memos: fakeMemos([]), openclaw: fake('openclaw'), codebase: fake('codebase') } });
    let hits = 0;
    const server = createServer((_req, res) => {
      hits++;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: 'x', object: 'chat.completion', model: 'gpt-4o-mini', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] }));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    try {
      tools.setCredentials({ deviceToken: 'npd_t', deviceId: 'dev-1', apiBaseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
      tools.setDataPrivacy(true);
      await expect(tools.bridge.complete({ messages: [{ role: 'user', content: 'summarize' }] })).rejects.toThrow();
      expect(hits).toBe(0);
      tools.setDataPrivacy(false);
      expect((await tools.bridge.complete({ messages: [{ role: 'user', content: 'summarize' }] })).text).toBe('ok');
      expect(hits).toBe(1);
    } finally {
      server.close();
    }
  });

  it('a MemOS search follows the prompt\'s switch (old function path)', async () => {
    const tools = createDesktopFeature1Tools({ dataDir: '/unused', drivers: { memos: fakeMemos([]), openclaw: fake('openclaw'), codebase: fake('codebase') } });
    tools.setCredentials({ deviceToken: 'npd_t', deviceId: 'dev-1', apiBaseUrl: 'http://pro' });
    const memos = tools.drivers.find((d) => d.name === 'memos')!;
    await memos.search({ prompt: 'x', projectRoot, context: { workspacePath: projectRoot, dataPrivacy: true } }, Date.now() + 1000, new AbortController().signal);
    await expect(tools.bridge.complete({ messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow();
  });

  it('a private turn is never given to MemOS; the session is still kept for OpenClaw', async () => {
    const log: string[] = [];
    const saved: unknown[] = [];
    const openclaw = { name: 'openclaw', available: async () => true, search: async () => [], saveSessionDecisions: async (s: unknown) => (saved.push(s), true) } as never;
    const tools = createDesktopFeature1Tools({ dataDir: '/unused', drivers: { memos: fakeMemos(log), openclaw, codebase: fake('codebase') } });
    await tools.capture({ projectRoot, sessionId: 's', prompt: 'secret plan', response: 'ok', dataPrivacy: true }, store);
    expect(log).not.toContain('capture');
    await tools.capture({ projectRoot, sessionId: 's', prompt: 'normal', response: 'ok' }, store);
    expect(log).toContain('capture');
    await tools.close();
    expect(saved).toHaveLength(1);
  });
});
