import { describe, it, expect } from 'vitest';
import { openStore, type Store } from './db.js';
import { upsertProject } from './projects.js';
import { setConfig } from './config.js';
import {
  isEnvProbeEnabled,
  setProjectEnvFacts,
  getProjectEnvFacts,
  setMachineFacts,
  getMachineFacts,
  clearProjectEnvFacts,
  purgeAllEnvFacts,
  ENV_PROBE_ENABLED_KEY,
} from './env-facts.js';
import type { FactMap } from '../env/types.js';

const ROOT = '/test/project';
const NOW = 1_700_000_000_000;

function sampleFacts(): FactMap {
  return {
    has_version_control: { value: true, tier: 'C', confidence: 'high', detectedAt: NOW },
    project_framework:   { value: 'nextjs', tier: 'C', confidence: 'high', detectedAt: NOW },
  };
}

async function freshStore(): Promise<Store> {
  const store = await openStore(':memory:');
  upsertProject(store, { projectRoot: ROOT, name: 'proj' });
  return store;
}

describe('env-facts — consent default', () => {
  it('is enabled by default (no key set)', async () => {
    const store = await freshStore();
    expect(isEnvProbeEnabled(store.db)).toBe(true);
    store.db.close();
  });
});

describe('env-facts — project facts round-trip', () => {
  it('stores and reads back project facts + detectedAt', async () => {
    const store = await freshStore();
    setProjectEnvFacts(store, ROOT, sampleFacts(), NOW);
    const got = getProjectEnvFacts(store, ROOT);
    expect(got?.detectedAt).toBe(NOW);
    expect(got?.facts.project_framework.value).toBe('nextjs');
    store.db.close();
  });

  it('returns null for an unknown / unstored project', async () => {
    const store = await freshStore();
    expect(getProjectEnvFacts(store, '/no/such/project')).toBeNull();
    store.db.close();
  });

  it('refreshes facts on re-store (staleness)', async () => {
    const store = await freshStore();
    setProjectEnvFacts(store, ROOT, sampleFacts(), NOW);
    const next: FactMap = { has_version_control: { value: false, tier: 'C', confidence: 'high', detectedAt: NOW + 9 } };
    setProjectEnvFacts(store, ROOT, next, NOW + 9);
    const got = getProjectEnvFacts(store, ROOT);
    expect(got?.detectedAt).toBe(NOW + 9);
    expect(got?.facts.has_version_control.value).toBe(false);
    store.db.close();
  });
});

describe('env-facts — machine facts round-trip', () => {
  it('stores and reads back machine facts', async () => {
    const store = await freshStore();
    const machine: FactMap = { os_platform: { value: 'linux', tier: 'C', confidence: 'high', detectedAt: NOW } };
    setMachineFacts(store, machine, NOW);
    expect(getMachineFacts(store)?.facts.os_platform.value).toBe('linux');
    store.db.close();
  });
});

describe('env-facts — S6 consent-off read gate', () => {
  it('hides project AND machine facts while consent is off', async () => {
    const store = await freshStore();
    setProjectEnvFacts(store, ROOT, sampleFacts(), NOW);
    setMachineFacts(store, { os_platform: { value: 'linux', tier: 'C', confidence: 'high', detectedAt: NOW } }, NOW);
    setConfig(store, ENV_PROBE_ENABLED_KEY, 'false');
    expect(isEnvProbeEnabled(store.db)).toBe(false);
    expect(getProjectEnvFacts(store, ROOT)).toBeNull();
    expect(getMachineFacts(store)).toBeNull();
    store.db.close();
  });

  it('reveals facts again once consent is re-enabled (when not yet purged)', async () => {
    const store = await freshStore();
    setProjectEnvFacts(store, ROOT, sampleFacts(), NOW);
    setConfig(store, ENV_PROBE_ENABLED_KEY, 'false');
    expect(getProjectEnvFacts(store, ROOT)).toBeNull();
    setConfig(store, ENV_PROBE_ENABLED_KEY, 'true');
    expect(getProjectEnvFacts(store, ROOT)?.facts.project_framework.value).toBe('nextjs');
    store.db.close();
  });
});

describe('env-facts — purge', () => {
  it('purgeAllEnvFacts wipes project rows + machine blob', async () => {
    const store = await freshStore();
    setProjectEnvFacts(store, ROOT, sampleFacts(), NOW);
    setMachineFacts(store, { os_platform: { value: 'linux', tier: 'C', confidence: 'high', detectedAt: NOW } }, NOW);
    purgeAllEnvFacts(store);
    expect(getProjectEnvFacts(store, ROOT)).toBeNull();
    expect(getMachineFacts(store)).toBeNull();
    store.db.close();
  });

  it('clearProjectEnvFacts clears a single project only', async () => {
    const store = await freshStore();
    upsertProject(store, { projectRoot: '/other', name: 'other' });
    setProjectEnvFacts(store, ROOT, sampleFacts(), NOW);
    setProjectEnvFacts(store, '/other', sampleFacts(), NOW);
    clearProjectEnvFacts(store, ROOT);
    expect(getProjectEnvFacts(store, ROOT)).toBeNull();
    expect(getProjectEnvFacts(store, '/other')?.facts.project_framework.value).toBe('nextjs');
    store.db.close();
  });
});
