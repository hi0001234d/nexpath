import { describe, it, expect } from 'vitest';
import {
  SHIPPED_CONTENT_TEMPLATES,
  validateRecordSet,
  checkLevel1FloorCoverage,
  checkTopicKeyword,
  coverageMetric,
  runBuildGate,
  enumerateFixtures,
} from './content-template-tooling.js';
import type { ContentTemplateRecord, LevelForm, MaturityLevel } from './content-template-schema.js';

function form(option: string, whyDesc = 'why'): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}
function rec(signalType: string, levelForms: Partial<Record<MaturityLevel, LevelForm>>): ContentTemplateRecord {
  return { signalType, source: 'shipped', schemaVersion: 1, levelForms, slots: [] };
}

describe('content-template-tooling — shipped registry + build gate', () => {
  it('the shipped registry holds the authored records and passes the build gate', () => {
    expect(SHIPPED_CONTENT_TEMPLATES.length).toBeGreaterThan(0); // class-1 onward authored
    expect(runBuildGate(SHIPPED_CONTENT_TEMPLATES).ok).toBe(true);
  });

  it('runBuildGate passes a valid, floored set and fails a missing-floor set', () => {
    const good = [rec('A', { 1: form('a') }), rec('B', { 1: form('b'), 3: form('b3') })];
    expect(runBuildGate(good).ok).toBe(true);
    const bad = [rec('C', { 2: form('c2') })]; // no level-1 floor
    const res = runBuildGate(bad);
    expect(res.ok).toBe(false);
    expect(res.floor.missingFloor).toEqual(['C']);
  });
});

describe('content-template-tooling — schema validation over the set', () => {
  it('passes a clean set', () => {
    expect(validateRecordSet([rec('A', { 1: form('a') })]).ok).toBe(true);
  });
  it('reports schema errors keyed by signalType', () => {
    const broken = { ...rec('Bad', { 1: form('a') }), source: 'bogus' } as unknown as ContentTemplateRecord;
    const res = validateRecordSet([broken]);
    expect(res.ok).toBe(false);
    expect(res.errorsBySignalType['Bad']?.join(' ')).toMatch(/source/);
  });
});

describe('content-template-tooling — T3 level-1 floor (HARD gate)', () => {
  it('passes when every record has a level-1 form', () => {
    expect(checkLevel1FloorCoverage([rec('A', { 1: form('a') })]).ok).toBe(true);
  });
  it('flags records missing the floor', () => {
    expect(checkLevel1FloorCoverage([rec('A', { 1: form('a') }), rec('B', { 5: form('b') })]).missingFloor).toEqual(['B']);
  });
});

describe('content-template-tooling — T1-BUILD same-topic keyword (both channels)', () => {
  it('passes when the keyword is in option AND why-desc of every authored column', () => {
    const r = rec('plan', { 1: form('plan it', 'plan because'), 3: form('plan with a doc', 'the plan helps') });
    expect(checkTopicKeyword(r, 'plan').ok).toBe(true);
  });
  it('reports the channels/levels missing the keyword', () => {
    const r = rec('plan', { 1: form('plan it', 'no kw here'), 3: form('just code', 'plan note') });
    const res = checkTopicKeyword(r, 'plan');
    expect(res.ok).toBe(false);
    expect(res.missingInWhyDesc).toEqual([1]);
    expect(res.missingInOption).toEqual([3]);
  });
});

describe('content-template-tooling — coverage metric (soft)', () => {
  it('counts all-levels vs thin', () => {
    const records = [
      rec('full', { 1: form('a'), 2: form('a'), 3: form('a'), 4: form('a'), 5: form('a') }),
      rec('thin', { 1: form('b') }),
      rec('mid', { 1: form('c'), 3: form('c') }),
    ];
    const m = coverageMetric(records);
    expect(m.total).toBe(3);
    expect(m.allLevels).toBe(1);
    expect(m.thin).toBe(1);
    expect(m.allLevelsPct).toBeCloseTo(1 / 3, 5);
    expect(m.thinPct).toBeCloseTo(1 / 3, 5);
  });
  it('an empty set has zero percentages (no divide-by-zero)', () => {
    expect(coverageMetric([])).toEqual({ total: 0, allLevels: 0, thin: 0, allLevelsPct: 0, thinPct: 0 });
  });
});

describe('content-template-tooling — fixture generator (read-only)', () => {
  it('enumerates signalType × param-vector × level, recording the served (fallback) level', () => {
    const records = [rec('A', { 1: form('a'), 3: form('a3') })];
    const fixtures = enumerateFixtures(records, [{ framework: 'next' }, { framework: 'vite' }]);
    expect(fixtures).toHaveLength(1 * 2 * 5); // 1 record × 2 vectors × 5 levels
    const lvl2 = fixtures.find((f) => f.level === 2 && f.paramVector.framework === 'next');
    expect(lvl2?.servedLevel).toBe(1); // level 2 unauthored → closest-level fallback to floor (tie → lower)
  });
});
