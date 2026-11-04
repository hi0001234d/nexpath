/**
 * v1(a) Phase 4 — MemOS driver and the host LLM bridge.
 *
 * Unit tests use a fake MemOS core and a fake OpenAI client. A real MemOS run is opt-in:
 * NEXPATH_MEMOS_E2E=1 (boots the installed package, no key needed).
 */

import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type OpenAI from 'openai';
import { createHostLlmBridge, HostLlmUnavailableError, HOST_LLM_MAX_TOKENS } from '../sources/host-llm-bridge.js';
import { MemosDriver, projectNamespace, cleanSnippet, type MemosCoreLike } from '../sources/memos-driver.js';
import { hashProjectPath } from '../core/project-scope.js';

function fakeOpenAI(reply: string | (() => never)) {
  const sent: Record<string, unknown>[] = [];
  const client = {
    chat: {
      completions: {
        create: async (body: Record<string, unknown>) => {
          sent.push(body);
          if (typeof reply === 'function') reply();
          return { model: 'gpt-4o-mini', choices: [{ message: { content: reply } }], usage: { prompt_tokens: 5, completion_tokens: 2 } };
        },
      },
    },
  } as unknown as OpenAI;
  return { client, sent };
}

const msg = [{ role: 'user', content: 'summarize' }];

describe('host LLM bridge', () => {
  it('uses Nexpath\'s client with gpt-4o-mini and at most 2048 tokens', async () => {
    const { client, sent } = fakeOpenAI('{"summary":"ok"}');
    const bridge = createHostLlmBridge({ getClient: () => client });
    const r = await bridge.complete({ messages: msg, model: 'gpt-5-huge', maxTokens: 99999, temperature: 0 });
    expect(r.text).toBe('{"summary":"ok"}');
    expect(sent[0]).toMatchObject({ model: 'gpt-4o-mini', max_tokens: HOST_LLM_MAX_TOKENS, temperature: 0 });
  });

  it('throws (never answers empty) when there is no credential or the answer is empty', async () => {
    await expect(createHostLlmBridge({ getClient: () => undefined }).complete({ messages: msg })).rejects.toBeInstanceOf(
      HostLlmUnavailableError
    );
    const { client } = fakeOpenAI('   ');
    await expect(createHostLlmBridge({ getClient: () => client }).complete({ messages: msg })).rejects.toThrow('empty answer');
  });

  it('keeps background calls to a small share per minute', async () => {
    let t = 0;
    const { client } = fakeOpenAI('x');
    const bridge = createHostLlmBridge({ getClient: () => client, maxCallsPerMinute: 2, now: () => t });
    await bridge.complete({ messages: msg });
    await bridge.complete({ messages: msg });
    await expect(bridge.complete({ messages: msg })).rejects.toThrow('background share');
    t = 61_000;
    await expect(bridge.complete({ messages: msg })).resolves.toBeDefined();
  });

  it('pauses after a 429 and after a 402', async () => {
    let t = 0;
    const limited = fakeOpenAI(() => {
      throw Object.assign(new Error('rate limit'), { status: 429 });
    });
    const bridge = createHostLlmBridge({ getClient: () => limited.client, now: () => t });
    await expect(bridge.complete({ messages: msg })).rejects.toThrow('rate limit');
    await expect(bridge.complete({ messages: msg })).rejects.toThrow('paused');
    expect(limited.sent).toHaveLength(1); // the paused call never reached the server
    t = 60_001;
    await expect(bridge.complete({ messages: msg })).rejects.toThrow('rate limit');

    let t2 = 0;
    const broke = fakeOpenAI(() => {
      throw Object.assign(new Error('insufficient_credit'), { status: 402 });
    });
    const b2 = createHostLlmBridge({ getClient: () => broke.client, now: () => t2 });
    await expect(b2.complete({ messages: msg })).rejects.toThrow('insufficient_credit');
    t2 = 5 * 60_000;
    await expect(b2.complete({ messages: msg })).rejects.toThrow('paused');
  });
});

function fakeCore() {
  const calls: { name: string; arg: Record<string, unknown> }[] = [];
  let hits: { refId: string; refKind: string; score: number; snippet: string }[] = [];
  const core: MemosCoreLike = {
    async shutdown() {
      calls.push({ name: 'shutdown', arg: {} });
    },
    async onTurnStart(turn) {
      calls.push({ name: 'onTurnStart', arg: turn as never });
      return { query: { episodeId: 'ep-1' }, hits: [] };
    },
    async onTurnEnd(result) {
      calls.push({ name: 'onTurnEnd', arg: result as never });
      return {};
    },
    async searchMemory(query) {
      calls.push({ name: 'searchMemory', arg: query as never });
      return { hits };
    },
  };
  return { core, calls, setHits: (h: typeof hits) => (hits = h) };
}

const bridge = createHostLlmBridge({ getClient: () => undefined });
const tick = () => new Promise((r) => setTimeout(r, 0));

async function readyDriver(core: MemosCoreLike, root = '/repo/a') {
  const homes: string[] = [];
  const driver = new MemosDriver({ home: '/base', bridge, boot: async (home) => (homes.push(home), core) });
  expect(await driver.available()).toBe(true);
  // a project's MemOS starts on its first prompt; that prompt gets nothing from MemOS
  expect(await driver.search({ prompt: 'warm up', projectRoot: root }, Date.now() + 1000)).toEqual([]);
  await tick();
  return { driver, homes };
}

describe('MemOS snippets', () => {
  it('keep the user words, add a reply only when it says more than OK, drop MemOS\'s memos_get hint', () => {
    expect(cleanSnippet('[user] add a dark mode toggle [assistant] OK → call `memos_get(id="tr_1", kind="trace")` for the full turn')).toBe('add a dark mode toggle');
    expect(cleanSnippet('[user] why did it fail [assistant] Error: processRetry crashed with ECONNRESET → call `memos_get(id="tr_2", kind="trace")` for the full turn')).toBe(
      'why did it fail — reply: Error: processRetry crashed with ECONNRESET'
    );
  });

  it('the user asking the same thing again is not memory', async () => {
    const { core, setHits } = fakeCore();
    setHits([
      { refId: 'tr_1', refKind: 'trace', score: 1, snippet: '[user] hello [assistant] OK' },
      { refId: 'tr_2', refKind: 'trace', score: 0.9, snippet: '[user] add a dark mode toggle to the settings screen [assistant] OK' },
    ]);
    const { driver } = await readyDriver(core);
    expect(await driver.search({ prompt: 'hello', projectRoot: '/repo/a' }, Date.now() + 1000)).toEqual([
      { source: 'memos', ref: 'trace:tr_2', text: 'add a dark mode toggle to the settings screen', score: 0.9 },
    ]);
    expect((await driver.search({ prompt: 'add a dark mode toggle to the settings screen', projectRoot: '/repo/a' }, Date.now() + 1000)).map((c) => c.ref)).toEqual(['trace:tr_1']);
  });
});

describe('MemosDriver', () => {
  it('turns MemOS hits into candidates for this project only', async () => {
    const { core, calls, setHits } = fakeCore();
    setHits([
      { refId: 'tr_1', refKind: 'trace', score: 1.01, snippet: '[user]  processRetry  crashed\n with ECONNRESET ' },
      { refId: 'tr_2', refKind: 'trace', score: 0.2, snippet: 'weak match' },
      { refId: 'tr_3', refKind: 'trace', score: 0.9, snippet: '   ' },
    ]);
    const { driver } = await readyDriver(core);
    const found = await driver.search({ prompt: 'fix processRetry', projectRoot: '/repo/a' }, 12345);
    expect(found).toEqual([{ source: 'memos', ref: 'trace:tr_1', text: 'processRetry crashed with ECONNRESET', score: 1 }]);
    // MemOS gets 200 ms less than our deadline, so its own AI filter returns in time (Phase 6)
    expect(calls[0].arg).toMatchObject({ agent: 'nexpath', query: 'fix processRetry', deadlineAt: 12145, namespace: projectNamespace('/repo/a') });
    expect(projectNamespace('/repo/a').profileId).not.toBe(projectNamespace('/repo/b').profileId);
  });

  it('keeps each project in its own MemOS folder (A2) and closes the least recently used', async () => {
    const shut: string[] = [];
    const driver = new MemosDriver({
      home: '/base',
      bridge,
      maxOpenProjects: 2,
      boot: async (home) => ({ ...fakeCore().core, shutdown: async () => void shut.push(home) }),
    });
    for (const root of ['/repo/a', '/repo/b', '/repo/c']) {
      await driver.search({ prompt: 'x', projectRoot: root }, Date.now() + 1000);
      await tick();
      await tick();
    }
    expect(driver.projectHome('/repo/a')).toBe(join('/base', hashProjectPath('/repo/a')));
    expect(driver.projectHome('/repo/a')).not.toBe(driver.projectHome('/repo/b'));
    expect(shut).toEqual([driver.projectHome('/repo/a')]); // a was used least recently
    await driver.close();
    expect(shut.sort()).toEqual([driver.projectHome('/repo/a'), driver.projectHome('/repo/b'), driver.projectHome('/repo/c')].sort());
  });

  it('saves a finished turn as one MemOS turn (start, then end with the reply), starting MemOS if needed', async () => {
    const { core, calls } = fakeCore();
    const homes: string[] = [];
    const driver = new MemosDriver({ home: '/base', bridge, boot: async (home) => (homes.push(home), core) });
    await driver.capture({ projectRoot: '/repo/a', sessionId: 's1', prompt: 'lock it', response: 'Noted.', ts: 100 });
    expect(homes).toEqual([driver.projectHome('/repo/a')]);
    expect(calls.map((c) => c.name)).toEqual(['onTurnStart', 'onTurnEnd']);
    expect(calls[1].arg).toMatchObject({ sessionId: 's1', episodeId: 'ep-1', agentText: 'Noted.' });
  });

  it('after a failed start reports unavailable for a minute, then tries again', async () => {
    let attempts = 0;
    let t = 1_000;
    const driver = new MemosDriver({
      home: '/base',
      bridge,
      now: () => t,
      boot: async () => {
        attempts++;
        throw new Error('native module missing');
      },
    });
    await driver.search({ prompt: 'x', projectRoot: '/repo/a' }, Date.now() + 1000);
    await tick();
    expect(await driver.available()).toBe(false);
    await driver.search({ prompt: 'x', projectRoot: '/repo/a' }, Date.now() + 1000);
    expect(attempts).toBe(1);
    t += 60_001;
    expect(await driver.available()).toBe(true);
    await driver.search({ prompt: 'x', projectRoot: '/repo/a' }, Date.now() + 1000);
    await tick();
    expect(attempts).toBe(2);
    await driver.close();
  });
});

describe.runIf(process.env.NEXPATH_MEMOS_E2E === '1')('real MemOS (installed package)', () => {
  it('saves a turn, finds it from a new session, keeps projects in their own folders, telemetry off', async () => {
    const home = mkdtempSync(join(tmpdir(), 'nexpath-memos-'));
    const driver = new MemosDriver({ home, bridge });
    try {
      await driver.capture({
        projectRoot: '/repo/a',
        sessionId: 's1',
        prompt: 'Locked requirement: processRetry in src/payment.ts is the only entry point for retries.',
        response: 'Noted. processRetry stays the only retry entry point.',
        ts: Date.now(),
      });
      await new Promise((r) => setTimeout(r, 1500)); // embeddings are written in the background
      const t = Date.now();
      const sameProject = await driver.search({ prompt: 'add jitter to processRetry in src/payment.ts', projectRoot: '/repo/a', sessionId: 's2' }, Date.now() + 2000);
      expect(Date.now() - t).toBeLessThan(1000);
      expect(sameProject[0]?.text).toMatch(/^Locked requirement: processRetry/);
      // by meaning, without the code name
      const byMeaning = await driver.search({ prompt: 'processRetry retries', projectRoot: '/repo/a', sessionId: 's2' }, Date.now() + 2000);
      expect(byMeaning.length).toBeGreaterThan(0);
      // project b: its own MemOS, its own folder, nothing from project a
      await driver.capture({ projectRoot: '/repo/b', sessionId: 's3', prompt: 'Use pnpm for installs.', response: 'OK.', ts: Date.now() });
      const otherProject = await driver.search({ prompt: 'add jitter to processRetry in src/payment.ts', projectRoot: '/repo/b', sessionId: 's3' }, Date.now() + 2000);
      expect(otherProject.filter((c) => /processRetry/.test(c.text))).toEqual([]);
      expect(existsSync(driver.projectHome('/repo/a'))).toBe(true);
      expect(existsSync(driver.projectHome('/repo/b'))).toBe(true);
      expect(readFileSync(join(driver.projectHome('/repo/a'), 'config.yaml'), 'utf8')).toContain('enabled: false');
    } finally {
      await driver.close();
      rmSync(home, { recursive: true, force: true });
    }
  }, 180_000);
});
