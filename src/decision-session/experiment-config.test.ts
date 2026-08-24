import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, closeStore, type Store } from '../store/db.js';
import { setConfig } from '../store/config.js';
import { getInstallationId, _resetIdentityCache } from '../telemetry/identity.js';
import {
  EXPERIMENT_CONFIG_KEY,
  cohortBucket,
  loadExperimentConfig,
  activePinFor,
  applyPinToLookup,
  applyPinToLevel,
  type ExperimentConfig,
} from './experiment-config.js';
import type { RecordCandidateLookup } from './content-template-engine.js';

describe('experiment-config', () => {
  let dir: string;
  let store: Store;

  beforeEach(async () => {
    _resetIdentityCache();
    dir = mkdtempSync(join(tmpdir(), 'experiment-config-'));
    store = await openStore(join(dir, 'prompt-store.db'));
  });
  afterEach(() => {
    closeStore(store);
    rmSync(dir, { recursive: true, force: true });
  });

  const config = (over: Partial<ExperimentConfig> = {}): ExperimentConfig => ({
    id: 'exp-1',
    pins: [{ signalType: 'context_loss', forcedSource: 'shipped', forcedLevel: 2 }],
    ...over,
  });
  const save = (c: ExperimentConfig | string): void =>
    setConfig(store, EXPERIMENT_CONFIG_KEY, typeof c === 'string' ? c : JSON.stringify(c));

  it('cohort buckets are deterministic and experiment-independent', () => {
    expect(cohortBucket('install-a', 'exp-1')).toBe(cohortBucket('install-a', 'exp-1'));
    expect(cohortBucket('install-a', 'exp-1')).toBeGreaterThanOrEqual(0);
    expect(cohortBucket('install-a', 'exp-1')).toBeLessThan(100);
    // Different experiments bucket the same installation independently: at
    // least one of these ids lands in a different bucket.
    const buckets = new Set(['exp-1', 'exp-2', 'exp-3', 'exp-4'].map((id) => cohortBucket('install-a', id)));
    expect(buckets.size).toBeGreaterThan(1);
  });

  it('missing, empty, or malformed config disables pinning', () => {
    expect(loadExperimentConfig(store)).toBeNull();
    save('{not json');
    expect(loadExperimentConfig(store)).toBeNull();
    save(JSON.stringify({ id: '', pins: [] }));
    expect(loadExperimentConfig(store)).toBeNull();
    expect(activePinFor(store, 'context_loss')).toBeNull();
  });

  it('a full-cohort pin always applies to its signalType and never to others', () => {
    save(config());
    const active = activePinFor(store, 'context_loss');
    expect(active?.experimentId).toBe('exp-1');
    expect(active?.pin.forcedSource).toBe('shipped');
    expect(activePinFor(store, 'other_signal')).toBeNull();
  });

  it('cohortPercent 0 pins nobody; the same installation always gets the same arm', () => {
    save(config({ cohortPercent: 0 }));
    expect(activePinFor(store, 'context_loss')).toBeNull();

    const bucket = cohortBucket(getInstallationId(store), 'exp-1');
    save(config({ cohortPercent: bucket + 1 })); // this installation is inside the cohort
    expect(activePinFor(store, 'context_loss')).not.toBeNull();
    save(config({ cohortPercent: bucket })); // and outside it
    expect(activePinFor(store, 'context_loss')).toBeNull();
  });

  it('applyPinToLookup pins the source cascade to the forced tier only', () => {
    const lookup: RecordCandidateLookup = (source) =>
      source === 'autogen' ? { fake: 'autogen' } : source === 'shipped' ? { fake: 'shipped' } : undefined;
    const pinned = applyPinToLookup(lookup, { signalType: 'x', forcedSource: 'shipped' });
    expect(pinned('shipped')).toEqual({ fake: 'shipped' });
    expect(pinned('autogen')).toBeUndefined(); // the normally-winning tier is suppressed
    // No forced source → the lookup passes through unchanged.
    expect(applyPinToLookup(lookup, { signalType: 'x' })).toBe(lookup);
  });

  it('applyPinToLevel forces the maturity level only when pinned', () => {
    expect(applyPinToLevel(4, { signalType: 'x', forcedLevel: 2 })).toBe(2);
    expect(applyPinToLevel(4, { signalType: 'x' })).toBe(4);
  });

  it('a typo\'d forced source is dropped — it must never suppress the whole cascade', () => {
    save(config({ pins: [{ signalType: 'context_loss', forcedSource: 'shiped' as never, forcedLevel: 2 }] }));
    const active = activePinFor(store, 'context_loss');
    expect(active?.pin.forcedSource).toBeUndefined(); // invalid source stripped
    expect(active?.pin.forcedLevel).toBe(2); // the valid dimension survives
  });

  it('an out-of-range forced level is dropped — the logged identity must match what serves', () => {
    save(config({ pins: [{ signalType: 'context_loss', forcedLevel: 9 as never }] }));
    expect(activePinFor(store, 'context_loss')).toBeNull(); // nothing valid left → no pin
    save(config({ pins: [{ signalType: 'context_loss', forcedSource: 'shipped', forcedLevel: 0 as never }] }));
    expect(activePinFor(store, 'context_loss')?.pin).toEqual({ signalType: 'context_loss', forcedSource: 'shipped' });
  });
});
