import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Count every write of the store file: the batch must write it once, not once per row.
const writes = vi.hoisted(() => ({ paths: [] as string[] }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      if (typeof args[0] === 'string') writes.paths.push(args[0]);
      return actual.writeFileSync(...args);
    },
  };
});

const { openStore } = await import('./db.js');
const { insertPrompt, insertPromptsBatch } = await import('./prompts.js');
const { setConfig } = await import('./config.js');

type StoreHandle = Awaited<ReturnType<typeof openStore>>;
const PROJECT = '/test/batch-project';

function rows(store: StoreHandle, project = PROJECT): Array<[string, string | null, number]> {
  const res = store.db.exec('SELECT prompt_text, agent, captured_at FROM prompts WHERE project_root = ? ORDER BY id', [project]);
  return (res[0]?.values ?? []).map((r) => [String(r[0]), r[1] === null ? null : String(r[1]), Number(r[2])]);
}

describe('insertPromptsBatch', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexpath-batch-'));
    writes.paths.length = 0;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const batch = [
    { promptText: 'first', agent: 'cursor', capturedAt: 1000 },
    { promptText: 'my key is sk-abcdefghijklmnopqrstuvwxyz0123456789', agent: 'devin', capturedAt: 2000 },
    { promptText: 'third', capturedAt: 3000 },
  ];

  it('stores exactly what insertPrompt would, row by row — text, redaction, agent, time, order', async () => {
    const one = await openStore(':memory:');
    const two = await openStore(':memory:');
    for (const row of batch) insertPrompt(one, { projectRoot: PROJECT, ...row });
    insertPromptsBatch(two, PROJECT, batch);
    expect(rows(two)).toEqual(rows(one));
    expect(rows(two)[1]![0]).not.toContain('sk-abcdefghijklmnopqrstuvwxyz0123456789');
    one.db.close();
    two.db.close();
  });

  it('applies the per-project cap the same way: the newest rows by insertion order stay', async () => {
    const one = await openStore(':memory:');
    const two = await openStore(':memory:');
    for (const s of [one, two]) setConfig(s, 'prompt_store_max_per_project', '2');
    for (const row of batch) insertPrompt(one, { projectRoot: PROJECT, ...row });
    insertPromptsBatch(two, PROJECT, batch);
    expect(rows(two)).toEqual(rows(one));
    expect(rows(two).map((r) => r[0])).toEqual([rows(one)[0]![0], 'third']);
    one.db.close();
    two.db.close();
  });

  it('never touches another project', async () => {
    const store = await openStore(':memory:');
    insertPrompt(store, { projectRoot: '/other', promptText: 'elsewhere' });
    insertPromptsBatch(store, PROJECT, batch);
    expect(rows(store, '/other').map((r) => r[0])).toEqual(['elsewhere']);
    store.db.close();
  });

  it('writes the store file once for the whole batch (insertPrompt writes it once per row)', async () => {
    const dbPath = join(dir, 'prompt-store.db');
    const store = await openStore(dbPath);
    writes.paths.length = 0;
    insertPromptsBatch(store, PROJECT, batch);
    expect(writes.paths.filter((p) => p === dbPath || p.startsWith(`${dbPath}.tmp.`))).toHaveLength(1);

    writes.paths.length = 0;
    for (const row of batch) insertPrompt(store, { projectRoot: '/control', ...row });
    expect(writes.paths.filter((p) => p === dbPath || p.startsWith(`${dbPath}.tmp.`))).toHaveLength(batch.length); // the control: per-row saves
    store.db.close();
  });

  it('does nothing for an empty batch', async () => {
    const dbPath = join(dir, 'prompt-store.db');
    const store = await openStore(dbPath);
    writes.paths.length = 0;
    insertPromptsBatch(store, PROJECT, []);
    expect(writes.paths).toHaveLength(0);
    expect(rows(store)).toEqual([]);
    store.db.close();
  });

  it('is all-or-nothing: a failing row leaves the project as it was', async () => {
    const store = await openStore(':memory:');
    insertPrompt(store, { projectRoot: PROJECT, promptText: 'before' });
    const bad = [{ promptText: 'ok' }, { promptText: null as unknown as string }]; // NOT NULL column
    expect(() => insertPromptsBatch(store, PROJECT, bad)).toThrow();
    expect(rows(store).map((r) => r[0])).toEqual(['before']);
    store.db.close();
  });
});
