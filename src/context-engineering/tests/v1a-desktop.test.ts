/**
 * v1(a) Phase 7 — the tools inside the desktop app (Electron 45 / Node 24.22.0).
 *
 * MemOS's AI calls go through the device client (npd_ + X-Device-Id, gpt-4o-mini) and never get
 * the token as a string; tool programs run as Node under Electron; OpenClaw only runs on the
 * separate Node the install step provides.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

const runAutoCalls: { options: any }[] = [];
vi.mock('../../cli/commands/auto.js', () => ({
  runAuto: vi.fn(async (_input: unknown, _store: unknown, _openai: unknown, _pe: unknown, options: any) => {
    runAutoCalls.push({ options });
    return { outcome: 'no_action' };
  }),
}));

const { openStore } = await import('../../store/db.js');
const { getActiveContextMemory } = await import('../store/historical-map-store.js');
const { normalizeProjectId } = await import('../core/project-scope.js');
const { prepareNexpathWriterEnhancement } = await import('../delivery/nexpath-writer-enhancer.js');
const { createDesktopFeature1Tools } = await import('../delivery/desktop-feature1-tools.js');
const { nodeRuntimeEnv } = await import('../sources/codebase-memory-driver.js');
const { OpenClawDriver } = await import('../sources/openclaw-driver.js');

function fakeDriver(name: 'memos' | 'openclaw' | 'codebase', extra: Record<string, unknown> = {}) {
  return { name, available: async () => true, search: async () => [], ...extra } as never;
}

describe('running tool programs from Electron', () => {
  it('runs scripts as Node inside Electron, never as a second copy of the app', () => {
    expect(nodeRuntimeEnv(undefined, { electron: '45.0.0' } as never)).toEqual({ ELECTRON_RUN_AS_NODE: '1' });
    expect(nodeRuntimeEnv('/opt/node24/bin/node', { electron: '45.0.0' } as never)).toEqual({});
    expect(nodeRuntimeEnv(undefined, {} as never)).toEqual({});
  });

  it('OpenClaw is unavailable inside Electron without the separate Node (Electron 45 has 24.22.0)', async () => {
    Object.defineProperty(process.versions, 'electron', { value: '45.0.0', configurable: true });
    try {
      expect(await new OpenClawDriver({ home: '/unused' }).available()).toBe(false);
    } finally {
      delete (process.versions as Record<string, unknown>).electron;
    }
  });
});

describe('DesktopFeature1Tools', () => {
  const servers: ReturnType<typeof createServer>[] = [];
  afterEach(() => servers.splice(0).forEach((s) => s.close()));

  async function fakeProxy() {
    const seen: { url: string; headers: IncomingHttpHeaders; body: any }[] = [];
    const server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        seen.push({ url: req.url ?? '', headers: req.headers, body: JSON.parse(raw || '{}') });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ id: 'x', object: 'chat.completion', model: 'gpt-4o-mini', choices: [{ index: 0, message: { role: 'assistant', content: '{"ok":true}' }, finish_reason: 'stop' }] }));
      });
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
  }

  const tools = () =>
    createDesktopFeature1Tools({
      dataDir: '/unused',
      drivers: { memos: fakeDriver('memos'), openclaw: fakeDriver('openclaw'), codebase: fakeDriver('codebase') },
    });

  it('MemOS AI calls go to <base>/v1 with the npd_ token and X-Device-Id, as gpt-4o-mini', async () => {
    const proxy = await fakeProxy();
    const t = tools();
    await expect(t.bridge.complete({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow('no Nexpath credential');
    t.setCredentials({ deviceToken: 'npd_test', deviceId: 'dev-1', apiBaseUrl: proxy.base });
    const r = await t.bridge.complete({ messages: [{ role: 'user', content: 'summarize' }], model: 'other', maxTokens: 5000 });
    expect(r.text).toBe('{"ok":true}');
    expect(proxy.seen[0].url).toBe('/v1/chat/completions');
    expect(proxy.seen[0].headers.authorization).toBe('Bearer npd_test');
    expect(proxy.seen[0].headers['x-device-id']).toBe('dev-1');
    expect(proxy.seen[0].body).toMatchObject({ model: 'gpt-4o-mini', max_tokens: 2048 });
    expect(JSON.stringify(t.bridge)).not.toContain('npd_test'); // MemOS never sees the token
    t.setCredentials(undefined);
    await expect(t.bridge.complete({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow('no Nexpath credential');
  });

  it('capture saves the turn in MemOS and writes learned rules into the app store; OpenClaw gets the decisions at session end', async () => {
    const calls: string[] = [];
    const memos = fakeDriver('memos', {
      capture: async () => void calls.push('memos'),
      learnedRules: async (root: string) => [
        { projectRoot: normalizeProjectId(root), kind: 'convention', key: 'memos-policy-1', content: 'Retry jitter: add up to 200 ms', locked: false, confidence: 0.7 },
      ],
      close: async () => {},
    });
    const saved: any[] = [];
    const openclaw = fakeDriver('openclaw', { saveSessionDecisions: async (s: unknown) => (saved.push(s), true) });
    const t = createDesktopFeature1Tools({ dataDir: '/unused', drivers: { memos, openclaw, codebase: fakeDriver('codebase') } });
    const store = await openStore(':memory:');
    await t.capture({ projectRoot: '/w/app', sessionId: 's', prompt: 'p', response: 'r' }, store);
    expect(calls).toEqual(['memos']);
    expect(saved).toEqual([]); // the session is still open
    expect(getActiveContextMemory(store, normalizeProjectId('/w/app')).map((r) => r.key)).toEqual(['memos-policy-1']);
    await t.close(); // app quits: the open session ends
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ projectRoot: normalizeProjectId('/w/app'), sessionId: 's' });
    expect(saved[0].decisions.map((d: { content: string }) => d.content)).toEqual(['Retry jitter: add up to 200 ms']);
  });

  it('prepareNexpathWriterEnhancement hands the app tools to Feature 1 and sets their credentials', async () => {
    runAutoCalls.length = 0;
    const t = tools();
    const store = await openStore(':memory:');
    await prepareNexpathWriterEnhancement(
      'fix processRetry',
      { workspacePath: '/w/app', store, sessionId: 's', deviceToken: 'npd_x', deviceId: 'dev-2' },
      { tools: t, apiBaseUrl: 'http://127.0.0.1:9' }
    );
    expect(runAutoCalls[0].options.host.feature1Sources).toBe(t.drivers);
    expect(runAutoCalls[0].options.host.feature1Sources.map((d: { name: string }) => d.name)).toEqual(['memos', 'openclaw', 'codebase']);
  });
});
