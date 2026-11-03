/**
 * v1(a) Phase 2 — codebase-memory-mcp driver.
 *
 * The fake client returns the same JSON shapes the real tool returned in Phase 0
 * (v1(a).md §9.4). A real end-to-end run is opt-in: NEXPATH_CBM_E2E=1.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CodebaseMemoryDriver,
  codeNamesIn,
  createStdioCodebaseClient,
  resolveCodebaseMemoryBin,
  type CodebaseMcpClient,
} from '../sources/codebase-memory-driver.js';
import { runSourceDrivers } from '../sources/source-driver.js';

const ROOT = '/repo';
const PROJECT = 'repo';

function fakeClient(projects: { name: string; root_path: string }[] = [{ name: PROJECT, root_path: ROOT }]) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client: CodebaseMcpClient = {
    async callTool(name, args) {
      calls.push({ name, args });
      if (name === 'list_projects') return { projects };
      if (name === 'search_graph') {
        if (String(args.name_pattern) !== '^processRetry$') return { cols: ['name', 'label', 'lines', 'in', 'out'], groups: [] };
        return {
          cols: ['name', 'label', 'lines', 'in', 'out'],
          groups: [{ qn_prefix: 'repo.src.payment', file: 'src/payment.ts', rows: [['processRetry', 'Function', '12-40', 2, 3]] }],
        };
      }
      if (name === 'trace_path') {
        return {
          function: args.function_name,
          callers: {
            cols: ['name', 'hop'],
            groups: [
              { qn_prefix: 'repo.src.checkout', rows: [['handlePay', 1]] },
              { qn_prefix: 'repo.src.jobs.retry', rows: [['retryAll', 1]] },
            ],
          },
        };
      }
      if (name === 'index_repository') return { status: 'queued' };
      throw new Error(`unexpected tool ${name}`);
    },
    async close() {},
  };
  return { client, calls };
}

async function connectedDriver(client: CodebaseMcpClient) {
  const driver = new CodebaseMemoryDriver({ connect: async () => client });
  expect(await driver.available()).toBe(false); // first call only starts the connect
  await new Promise((r) => setTimeout(r, 0));
  expect(await driver.available()).toBe(true);
  return driver;
}

const signal = new AbortController().signal;
const later = () => Date.now() + 1000;

describe('codeNamesIn', () => {
  it('finds code names, not plain words', () => {
    expect(codeNamesIn('add jitter to processRetry in src/payment.ts')).toEqual(['processRetry']);
    expect(codeNamesIn('make the checkout page blue')).toEqual([]);
  });
});

describe('CodebaseMemoryDriver', () => {
  it('describes the definition and its callers for a code name in the prompt', async () => {
    const { client } = fakeClient();
    const driver = await connectedDriver(client);
    const found = await driver.search({ prompt: 'add jitter to processRetry', projectRoot: ROOT }, later(), signal);
    expect(found).toHaveLength(1);
    expect(found[0].text).toBe(
      'processRetry is a function defined in src/payment.ts:12-40. It is called by handlePay (src/checkout), retryAll (src/jobs/retry).'
    );
    expect(found[0].identities).toEqual([{ symbol: 'processRetry', file: 'src/payment.ts' }]);
    expect(found[0].score).toBe(0.75);
  });

  it('sends only code names and makes no tool call for a prompt without any', async () => {
    const { client, calls } = fakeClient();
    const driver = await connectedDriver(client);
    expect(await driver.search({ prompt: 'make the checkout page blue', projectRoot: ROOT }, later(), signal)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('asks once to index an unknown project, in the background, and returns nothing for now', async () => {
    const { client, calls } = fakeClient([]);
    const driver = await connectedDriver(client);
    const q = { prompt: 'fix processRetry', projectRoot: '/other' };
    expect(await driver.search(q, later(), signal)).toEqual([]);
    expect(await driver.search(q, later(), signal)).toEqual([]);
    const index = calls.filter((c) => c.name === 'index_repository');
    expect(index).toEqual([{ name: 'index_repository', args: { repo_path: '/other', async: true } }]);
  });

  it('matches the workspace to the longest indexed project root', async () => {
    const { client, calls } = fakeClient([
      { name: 'outer', root_path: '/repo' },
      { name: 'inner', root_path: '/repo/packages/pay' },
    ]);
    const driver = await connectedDriver(client);
    await driver.search({ prompt: 'fix processRetry', projectRoot: '/repo/packages/pay' }, later(), signal);
    expect(calls.find((c) => c.name === 'search_graph')?.args.project).toBe('inner');
  });

  it('is unavailable while the connect fails, and tries again later', async () => {
    let attempts = 0;
    const driver = new CodebaseMemoryDriver({
      connect: async () => {
        attempts++;
        throw new Error('not installed');
      },
    });
    expect(await driver.available()).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(await driver.available()).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(attempts).toBe(2);
  });

  it('a not-yet-connected driver falls back to V1 via runSourceDrivers', async () => {
    const driver = new CodebaseMemoryDriver({ connect: () => new Promise(() => {}) });
    const run = await runSourceDrivers([driver], { prompt: 'fix processRetry', projectRoot: ROOT }, 100);
    expect(run.failed).toEqual([{ source: 'codebase', reason: 'unavailable' }]);
  });
});

describe.runIf(process.env.NEXPATH_CBM_E2E === '1' && resolveCodebaseMemoryBin())('codebase-memory-mcp end to end', () => {
  it('indexes this module and describes rankAndAllocateBudget with its caller', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'nexpath-cbm-'));
    const root = join(__dirname, '..');
    const client = await createStdioCodebaseClient({ cacheDir });
    try {
      await client.callTool('index_repository', { repo_path: root });
      const driver = new CodebaseMemoryDriver({ connect: async () => client });
      await driver.available();
      await new Promise((r) => setTimeout(r, 0));
      const t = Date.now();
      const found = await driver.search({ prompt: 'why does rankAndAllocateBudget drop facts', projectRoot: root }, Date.now() + 5000, signal);
      expect(Date.now() - t).toBeLessThan(1000);
      expect(found[0].text).toContain('rankAndAllocateBudget is a function defined in retrieval/budget-ranker.ts');
      expect(found[0].text).toContain('preparePromptEnhancementWithSections');
    } finally {
      await client.close();
      rmSync(cacheDir, { recursive: true, force: true });
    }
  }, 120_000);
});
