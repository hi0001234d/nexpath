import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { envAction } from './env.js';
import { configSetAction } from './config.js';
import { openStore, closeStore } from '../../store/db.js';
import { upsertProject } from '../../store/projects.js';
import {
  setProjectEnvFacts,
  getProjectEnvFacts,
  setMachineFacts,
  getMachineFacts,
} from '../../store/env-facts.js';
import { setConfig } from '../../store/config.js';
import type { FactMap } from '../../env/types.js';

const NOW = 1_700_000_000_000;
function facts(): FactMap {
  return { has_version_control: { value: true, tier: 'C', confidence: 'high', detectedAt: NOW } };
}

describe('nexpath env command', () => {
  let dir: string;
  let dbPath: string;
  let logs: string[];
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexpath-envcmd-'));
    dbPath = join(dir, 'store.db');
    logs = [];
    spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')); });
  });
  afterEach(() => {
    spy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it('probes + displays machine and project facts', async () => {
    await envAction({ db: dbPath });
    const out = logs.join('\n');
    expect(out).toContain('Dev-environment facts');
    expect(out).toContain('Machine');
    expect(out).toContain('Project');
    expect(out).toContain('os_platform');
  });

  it('--clear purges all stored facts', async () => {
    // Seed facts in the persistent DB first.
    let store = await openStore(dbPath);
    upsertProject(store, { projectRoot: '/p', name: 'p' });
    setProjectEnvFacts(store, '/p', facts(), NOW);
    setMachineFacts(store, facts(), NOW);
    closeStore(store);

    await envAction({ db: dbPath, clear: true });
    expect(logs.join('\n')).toContain('Cleared all stored dev-env facts');

    store = await openStore(dbPath);
    expect(getProjectEnvFacts(store, '/p')).toBeNull();
    expect(getMachineFacts(store)).toBeNull();
    closeStore(store);
  });

  it('reports a disabled probe instead of probing', async () => {
    let store = await openStore(dbPath);
    setConfig(store, 'env_probe_enabled', 'false');
    closeStore(store);

    await envAction({ db: dbPath });
    const out = logs.join('\n');
    expect(out).toContain('disabled');
    expect(out).not.toContain('Machine');
  });

  it('S6: `config set env_probe_enabled false` auto-purges stored facts', async () => {
    let store = await openStore(dbPath);
    upsertProject(store, { projectRoot: '/p', name: 'p' });
    setProjectEnvFacts(store, '/p', facts(), NOW);
    setMachineFacts(store, facts(), NOW);
    closeStore(store);

    await configSetAction('env_probe_enabled', 'false', dbPath);

    store = await openStore(dbPath);
    // Re-enable to bypass the read gate and prove the rows are actually gone.
    setConfig(store, 'env_probe_enabled', 'true');
    expect(getProjectEnvFacts(store, '/p')).toBeNull();
    expect(getMachineFacts(store)).toBeNull();
    closeStore(store);
  });
});
