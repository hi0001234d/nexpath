/**
 * v1(a) Phase 6 — MemOS AI filter deadline and D12 write-back into our map.
 *
 * The worker writes only with the database lock, never waits on a hook and never steals a
 * fresh lock; learned rules land as ordinary unlocked conventions and never outrank a locked
 * decision.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, closeStore } from '../../store/db.js';
import { ingestSessionFacts } from '../ingestion/decision-chainer.js';
import { getActiveContextMemory, upsertContextMemory } from '../store/historical-map-store.js';
import { normalizeProjectId } from '../core/project-scope.js';
import { preparePromptEnhancementWithSections } from '../delivery/prompt-enhancer.js';
import { withStoreWrite } from '../worker/store-writer.js';
import { MemosDriver, policiesToMapRows, type MemosCoreLike } from '../sources/memos-driver.js';
import { createHostLlmBridge } from '../sources/host-llm-bridge.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

async function dbWithLockedRule(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'nx-wb-'));
  dirs.push(dir);
  const dbPath = join(dir, 'prompt-store.db');
  const store = await openStore(dbPath);
  ingestSessionFacts(store, {
    projectRoot: '/workspaces/wb',
    prompt: 'Locked requirement: processRetry in src/payment.ts is the only entry point for retries.',
    assistantResponse: '',
  });
  closeStore(store);
  return dbPath;
}

const learned = policiesToMapRows('/workspaces/wb', [
  { id: 'po_1', title: 'Retry jitter', procedure: 'add random jitter of up to 200 ms between processRetry attempts', status: 'active', confidence: 0.99 },
  { id: 'po_2', title: 'Unproven idea', procedure: 'retry forever', status: 'candidate' },
]);

describe('policiesToMapRows', () => {
  it('keeps active rules only, as unlocked conventions below locked strength, tagged MemOS', () => {
    expect(learned).toEqual([
      {
        projectRoot: normalizeProjectId('/workspaces/wb'),
        kind: 'convention',
        key: 'memos-policy-po_1',
        content: 'Retry jitter: add random jitter of up to 200 ms between processRetry attempts',
        locked: false,
        confidence: 0.85,
        evidence: JSON.stringify({ source: 'memos', ref: 'po_1' }),
      },
    ]);
  });
});

describe('withStoreWrite (worker → our map)', () => {
  it('writes with the lock and releases it', async () => {
    const dbPath = await dbWithLockedRule();
    const r = await withStoreWrite(dbPath, (store) => learned.forEach((row) => upsertContextMemory(store, row)));
    expect(r.written).toBe(true);
    expect(existsSync(`${dbPath}.lock`)).toBe(false);
    const store = await openStore(dbPath);
    const rows = getActiveContextMemory(store, normalizeProjectId('/workspaces/wb'));
    closeStore(store);
    expect(rows.map((x) => x.key)).toContain('memos-policy-po_1');
  });

  it('never waits on and never steals a lock a hook is holding', async () => {
    const dbPath = await dbWithLockedRule();
    writeFileSync(`${dbPath}.lock`, '');
    const before = readFileSync(dbPath);
    const t = Date.now();
    const r = await withStoreWrite(dbPath, () => {
      throw new Error('must not run');
    });
    expect(Date.now() - t).toBeLessThan(200);
    expect(r).toEqual({ written: false, reason: 'busy' });
    expect(existsSync(`${dbPath}.lock`)).toBe(true); // the hook's lock is untouched
    expect(readFileSync(dbPath).equals(before)).toBe(true);
  });

  it('takes over a stale lock left by a crashed process', async () => {
    const dbPath = await dbWithLockedRule();
    writeFileSync(`${dbPath}.lock`, '');
    const old = new Date(Date.now() - 60_000);
    utimesSync(`${dbPath}.lock`, old, old);
    expect((await withStoreWrite(dbPath, () => 1)).written).toBe(true);
  });

  it('never creates the database', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nx-wb-'));
    dirs.push(dir);
    expect(await withStoreWrite(join(dir, 'prompt-store.db'), () => 1)).toEqual({ written: false, reason: 'missing' });
    expect(existsSync(join(dir, 'prompt-store.db'))).toBe(false);
  });
});

describe('a written-back rule in the prompt', () => {
  it('reaches the prompt and stays below the locked decision', async () => {
    const dbPath = await dbWithLockedRule();
    await withStoreWrite(dbPath, (store) => learned.forEach((row) => upsertContextMemory(store, row)));
    const store = await openStore(dbPath);
    try {
      const r = await preparePromptEnhancementWithSections(
        'add jitter to processRetry in src/payment.ts',
        { workspacePath: '/workspaces/wb', store, sessionId: 's-wb' },
        { skipLlmRewrite: true, recordDelivery: false }
      );
      const locked = r.enhancedPrompt.indexOf('only entry point for retries');
      const rule = r.enhancedPrompt.indexOf('random jitter of up to 200 ms');
      expect(locked).toBeGreaterThan(-1);
      expect(rule).toBeGreaterThan(-1);
      expect(locked).toBeLessThan(rule);
    } finally {
      closeStore(store);
    }
  });
});

describe('MemOS AI filter deadline', () => {
  it('gives MemOS an earlier deadline than ours, so its filter returns safe results in time', async () => {
    const seen: number[] = [];
    const core: MemosCoreLike = {
      shutdown: async () => {},
      onTurnStart: async () => ({}),
      onTurnEnd: async () => ({}),
      searchMemory: async (q) => {
        seen.push(q.deadlineAt ?? 0);
        return { hits: [] };
      },
    };
    const driver = new MemosDriver({ home: '/unused', bridge: createHostLlmBridge({ getClient: () => undefined }), boot: async () => core });
    await driver.search({ prompt: 'warm up', projectRoot: '/p' }, 10_000); // first prompt starts this project's MemOS
    await new Promise((r) => setTimeout(r, 0));
    await driver.search({ prompt: 'fix processRetry', projectRoot: '/p' }, 10_000);
    expect(seen).toEqual([9_800]);
  });
});
