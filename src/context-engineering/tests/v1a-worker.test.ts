/**
 * v1(a) Phase 3 — the worker: local pipe, single instance, idle exit, background jobs that
 * step aside for prompts, and hooks that fall back to V1 when the worker is not there.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../store/db.js';
import { ingestSessionFacts } from '../ingestion/decision-chainer.js';
import { preparePromptEnhancementWithSections } from '../delivery/prompt-enhancer.js';
import { createWorkerServer, WorkerAlreadyRunningError, type WorkerServer } from '../worker/worker-server.js';
import { cliWorkerSources, requestWorker, WorkerLink } from '../worker/worker-client.js';
import { toWireQuery, workerPaths, type WorkerTurn } from '../worker/protocol.js';
import { runSourceDrivers, type SourceDriver, type SourceName } from '../sources/source-driver.js';

const homes: string[] = [];
const servers: WorkerServer[] = [];
function newHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'nxw-'));
  homes.push(home);
  return home;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
  homes.splice(0).forEach((h) => rmSync(h, { recursive: true, force: true }));
});

function fakeDriver(name: SourceName, text: string, delayMs = 0, available = true): SourceDriver & { closed: boolean } {
  return {
    name,
    closed: false,
    available: async () => available,
    search: async () => {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      return [{ source: name, ref: `${name}-1`, text, score: 0.8 }];
    },
    async close() {
      this.closed = true;
    },
  } as SourceDriver & { closed: boolean };
}

async function startServer(home: string, drivers: SourceDriver[], extra: Partial<Parameters<typeof createWorkerServer>[0]> = {}) {
  const server = createWorkerServer({ socketPath: workerPaths(home).socket, drivers, ...extra });
  await server.listen();
  servers.push(server);
  return server;
}

const noStart = () => {};

describe('worker over the local pipe', () => {
  it('reports its tools and answers searches through the proxy drivers', async () => {
    const home = newHome();
    await startServer(home, [fakeDriver('memos', 'processRetry crashed with ECONNRESET'), fakeDriver('openclaw', 'old note', 0, false)]);
    const { drivers } = cliWorkerSources({ nexpathHome: home, start: noStart });
    const run = await runSourceDrivers(drivers, { prompt: 'fix processRetry', projectRoot: '/p' }, 1000);
    expect(run.succeeded).toEqual(['memos']);
    expect(run.candidates.map((c) => c.text)).toEqual(['processRetry crashed with ECONNRESET']);
    const failed = Object.fromEntries(run.failed.map((f) => [f.source, f.reason]));
    expect(failed).toEqual({ openclaw: 'unavailable', codebase: 'unavailable', meaning: 'unavailable' });
  });

  it('when the worker is down, the hook gets V1 at once and starts the worker once', async () => {
    const home = newHome();
    let starts = 0;
    const { drivers } = cliWorkerSources({ nexpathHome: home, start: () => starts++ });
    const t = Date.now();
    const run = await runSourceDrivers(drivers, { prompt: 'fix processRetry', projectRoot: '/p' }, 1000);
    expect(Date.now() - t).toBeLessThan(800);
    expect(run.succeeded).toEqual([]);
    expect(run.failed.every((f) => f.reason === 'unavailable')).toBe(true);
    // a second hook a moment later does not start a second worker
    await new WorkerLink({ nexpathHome: home, start: () => starts++ }).status();
    expect(starts).toBe(1);
  });

  it('a second worker refuses to start; a stale socket from a crash is taken over', async () => {
    const home = newHome();
    await startServer(home, []);
    await expect(createWorkerServer({ socketPath: workerPaths(home).socket, drivers: [] }).listen()).rejects.toBeInstanceOf(
      WorkerAlreadyRunningError
    );

    const crashed = newHome();
    const paths = workerPaths(crashed);
    mkdirSync(paths.dir, { recursive: true });
    if (process.platform !== 'win32') writeFileSync(paths.socket, ''); // leftover file, nobody listening
    await startServer(crashed, []);
    expect(await requestWorker<{ pid: number }>(paths.socket, { type: 'ping' }, 500)).toEqual({ pid: process.pid });
  });

  it('stops after being idle: closes its tools and removes its socket', async () => {
    const home = newHome();
    const driver = fakeDriver('memos', 'x');
    let idle = false;
    const server = createWorkerServer({ socketPath: workerPaths(home).socket, drivers: [driver], idleMs: 60, onIdle: () => (idle = true) });
    await server.listen();
    await new Promise((r) => setTimeout(r, 200));
    expect(idle).toBe(true);
    expect(driver.closed).toBe(true);
    if (process.platform !== 'win32') expect(existsSync(workerPaths(home).socket)).toBe(false);
  });

  it('background jobs wait while a prompt is being answered', async () => {
    const home = newHome();
    const order: string[] = [];
    const slow: SourceDriver = {
      name: 'memos',
      available: async () => true,
      search: async () => {
        order.push('search-start');
        await new Promise((r) => setTimeout(r, 120));
        order.push('search-end');
        return [];
      },
    };
    const captured: WorkerTurn[] = [];
    await startServer(home, [slow], {
      onCapture: async (turn) => {
        order.push('capture');
        captured.push(turn);
      },
    });
    const link = new WorkerLink({ nexpathHome: home, start: noStart });
    const search = link.search('memos', { prompt: 'p', projectRoot: '/p' }, Date.now() + 1000);
    await new Promise((r) => setTimeout(r, 20));
    const turn = { projectRoot: '/p', sessionId: 's', prompt: 'p', response: 'r', ts: 1 };
    expect(await link.capture(turn)).toBe(true);
    await search;
    await new Promise((r) => setTimeout(r, 30));
    expect(order).toEqual(['search-start', 'search-end', 'capture']);
    expect(captured).toEqual([turn]);
  });
});

describe('what crosses the pipe', () => {
  it('never sends the store, device token or device id', () => {
    const wire = toWireQuery({
      prompt: 'p',
      projectRoot: '/p',
      context: { workspacePath: '/p', activeFilePath: 'a.ts', deviceToken: 'npd_secret', deviceId: 'dev', store: {} as never } as never,
    });
    expect(JSON.stringify(wire)).not.toMatch(/npd_secret|deviceId|store/);
    expect(wire.context).toEqual({ workspacePath: '/p', activeFilePath: 'a.ts' });
  });
});

describe('prepareEnhancement through the worker', () => {
  it('memory from the worker reaches the prompt next to the locked decision', async () => {
    const home = newHome();
    await startServer(home, [
      fakeDriver('memos', 'Last time processRetry crashed with ECONNRESET from the payment gateway.'),
      fakeDriver('openclaw', 'Payment retries were moved out of checkout in March.'),
    ]);
    const store = await openStore(':memory:');
    ingestSessionFacts(store, {
      projectRoot: '/workspaces/v1a',
      prompt: 'Locked requirement: processRetry in src/payment.ts is the only entry point for retries.',
      assistantResponse: '',
    });
    const { drivers } = cliWorkerSources({ nexpathHome: home, start: noStart });
    const r = await preparePromptEnhancementWithSections(
      'add jitter to processRetry in src/payment.ts',
      { workspacePath: '/workspaces/v1a', store, sessionId: 's-worker' },
      { skipLlmRewrite: true, recordDelivery: false, sources: drivers }
    );
    expect(r.enhancedPrompt).toContain('only entry point for retries');
    expect(r.enhancedPrompt).toContain('ECONNRESET');
    expect(r.injectedContextTags.some((t) => t.startsWith('@memos:'))).toBe(true);
  });
});
