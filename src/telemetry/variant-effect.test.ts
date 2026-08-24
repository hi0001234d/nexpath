import { describe, it, expect } from 'vitest';
import { measureVariantEffects, outcomeSignalKeyFor } from './variant-effect.js';
import type { ParamEvent, VariantIdentity } from './param-events.js';

const T0 = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const VARIANT_A: VariantIdentity = { level: 2, register: 'casual', source: 'shipped', path: 'llm' };
const VARIANT_B: VariantIdentity = { level: 3, register: 'casual', source: 'shipped', path: 'llm' };

function ev(over: Partial<ParamEvent>): ParamEvent {
  return {
    schemaVersion: 1,
    ts: T0,
    projectRoot: '/p',
    sessionId: 's1',
    promptIndex: 0,
    signalKey: 'test_creation',
    channel: 'keyword',
    stage: 'implementation',
    stageConfidence: 0.8,
    source: 'live',
    ...over,
  };
}

function serve(variant: VariantIdentity, over: Partial<ParamEvent> = {}): ParamEvent {
  return ev({ signalKey: 'ABSENCE_TEST_CREATION', channel: 'served', variant, ...over });
}

describe('outcomeSignalKeyFor', () => {
  it('maps an absence signalType to its behaviour signal key', () => {
    expect(outcomeSignalKeyFor('ABSENCE_TEST_CREATION')).toBe('test_creation');
    expect(outcomeSignalKeyFor('ABSENCE_SECRET_IN_PROMPT')).toBe('secret_in_prompt');
  });

  it('a signalType with no behaviour mapping yields null', () => {
    expect(outcomeSignalKeyFor('TASK_REVIEW')).toBeNull();
  });
});

describe('measureVariantEffects', () => {
  it('a serve followed by transcript behaviour is a verified outcome', () => {
    const rows = measureVariantEffects([
      serve(VARIANT_A, { ts: T0 }),
      ev({ channel: 'transcript', ts: T0 + 1000 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fires: 1, verifiedOutcomes: 1, claimedOutcomes: 0, verifiedRate: 1, measurable: true });
  });

  it('a serve followed only by prompt-side detections is a claimed outcome', () => {
    const rows = measureVariantEffects([
      serve(VARIANT_A, { ts: T0 }),
      ev({ channel: 'keyword', ts: T0 + 1000 }),
    ]);
    expect(rows[0]).toMatchObject({ verifiedOutcomes: 0, claimedOutcomes: 1, manifestedRate: 1, verifiedRate: 0 });
  });

  it('behaviour BEFORE the serve never counts as an outcome', () => {
    const rows = measureVariantEffects([
      ev({ channel: 'transcript', ts: T0 - 1000 }),
      serve(VARIANT_A, { ts: T0 }),
    ]);
    expect(rows[0]).toMatchObject({ fires: 1, verifiedOutcomes: 0, claimedOutcomes: 0, manifestedRate: 0 });
  });

  it('the horizon excludes late outcomes', () => {
    const rows = measureVariantEffects(
      [serve(VARIANT_A, { ts: T0 }), ev({ channel: 'transcript', ts: T0 + 20 * DAY })],
      { horizonDays: 14 },
    );
    expect(rows[0]!.verifiedOutcomes).toBe(0);
  });

  it('arms group by full variant identity with independent rates', () => {
    const rows = measureVariantEffects([
      serve(VARIANT_A, { ts: T0, promptIndex: 0 }),
      serve(VARIANT_A, { ts: T0 + 10 * DAY, promptIndex: 5 }),
      serve(VARIANT_B, { ts: T0, promptIndex: 9 }),
      ev({ channel: 'transcript', ts: T0 + 1000 }), // after A's first serve and B's serve
    ]);
    const a = rows.find((r) => r.variant.level === 2)!;
    const b = rows.find((r) => r.variant.level === 3)!;
    expect(a.fires).toBe(2);
    expect(a.verifiedOutcomes).toBe(1); // only the first A serve has behaviour after it
    expect(a.verifiedRate).toBeCloseTo(0.5, 5);
    expect(b).toMatchObject({ fires: 1, verifiedOutcomes: 1, verifiedRate: 1 });
  });

  it('an experiment-pinned arm groups separately from the organic arm', () => {
    const pinned: VariantIdentity = { ...VARIANT_A, experiment: 'exp-1' };
    const rows = measureVariantEffects([serve(VARIANT_A), serve(pinned)]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.variant.experiment ?? null).sort()).toEqual(['exp-1', null].sort());
  });

  it('a non-mappable signalType counts fires but stays unmeasurable', () => {
    const rows = measureVariantEffects([
      serve(VARIANT_A, { signalKey: 'TASK_REVIEW', ts: T0 }),
      ev({ channel: 'transcript', ts: T0 + 1000 }),
    ]);
    expect(rows[0]).toMatchObject({ fires: 1, measurable: false, verifiedOutcomes: 0, manifestedRate: 0 });
  });

  it('an empty or serve-less log yields no rows', () => {
    expect(measureVariantEffects([])).toEqual([]);
    expect(measureVariantEffects([ev({})])).toEqual([]);
  });

  it('behaviour in ANOTHER project is never an outcome (no cross-project attribution)', () => {
    const rows = measureVariantEffects([
      serve(VARIANT_A, { ts: T0, projectRoot: '/A' }),
      ev({ channel: 'transcript', ts: T0 + 5000, projectRoot: '/B' }),
    ]);
    expect(rows[0]).toMatchObject({ fires: 1, verifiedOutcomes: 0, manifestedRate: 0 });
  });

  it('historical-import behaviour is never an outcome — pre-install behaviour cannot result from a serve', () => {
    const rows = measureVariantEffects([
      serve(VARIANT_A, { ts: T0 }),
      ev({ channel: 'keyword', ts: T0 + 5000, source: 'historical_import', sessionId: 'historical-import', stage: null, stageConfidence: null }),
    ]);
    expect(rows[0]).toMatchObject({ fires: 1, claimedOutcomes: 0, verifiedOutcomes: 0, manifestedRate: 0 });
  });
});
