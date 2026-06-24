import { describe, it, expect } from 'vitest';
import {
  resolveRecord,
  resolveColumn,
  stepSimpler,
  withTimeout,
  selectRankCapFacts,
  composeOption,
  composeWhyDesc,
  SOURCE_CASCADE,
  type GroundingFact,
  type RecordCandidateLookup,
} from './content-template-engine.js';
import type { ContentTemplateRecord, TwoChannelCell, Slot } from './content-template-schema.js';

function cell(option = 'o', whyDesc = 'w'): TwoChannelCell { return { option, whyDesc }; }
function record(over: Partial<ContentTemplateRecord> = {}): ContentTemplateRecord {
  return {
    signalType: 'X',
    source: 'shipped',
    schemaVersion: 1,
    levelForms: { 1: { kind: 'slot-variant', cell: cell() } },
    slots: [],
    ...over,
  };
}
/** A cascade lookup backed by a per-tier map. */
function lookupOf(map: Partial<Record<string, unknown>>): RecordCandidateLookup {
  return (source) => map[source];
}

describe('content-template-engine — record cascade (stage 1)', () => {
  it('cascades uploaded → auto-gen → shipped → default', () => {
    expect(SOURCE_CASCADE).toEqual(['uploaded', 'autogen', 'shipped', 'default']);
  });

  it('returns the first valid candidate by source preference', () => {
    const res = resolveRecord(lookupOf({ uploaded: record({ source: 'uploaded' }), shipped: record() }));
    expect(res?.source).toBe('uploaded');
  });

  it('rejects a corrupt higher-priority candidate and falls through to the next', () => {
    const res = resolveRecord(lookupOf({ uploaded: { not: 'a valid record' }, shipped: record() }));
    expect(res?.source).toBe('shipped'); // invalid uploaded rejected, shipped served
  });

  it('returns null when no source yields a valid record', () => {
    expect(resolveRecord(lookupOf({ uploaded: { bad: true } }))).toBeNull();
    expect(resolveRecord(lookupOf({}))).toBeNull();
  });
});

describe('content-template-engine — maturity column (stage 2)', () => {
  const rec = record({ levelForms: { 1: { kind: 'slot-variant', cell: cell('lvl1') }, 3: { kind: 'slot-variant', cell: cell('lvl3') } } });

  it('exact match wins; otherwise closest authored downward', () => {
    expect(resolveColumn(rec, 3)?.level).toBe(3);
    expect(resolveColumn(rec, 2)?.level).toBe(1); // tie |2-1|=|2-3| → lower
  });

  it('the level-1 floor guarantees a result at any level (mid-session re-resolve)', () => {
    for (const l of [1, 2, 3, 4, 5] as const) expect(resolveColumn(rec, l)).not.toBeNull();
  });
});

describe('content-template-engine — strength step (stage 3, always-run derive)', () => {
  it('always invokes the derive and returns its cell on success', async () => {
    let calls = 0;
    const derive = async (): Promise<TwoChannelCell> => { calls++; return cell('simpler'); };
    const res = await stepSimpler(cell('cur'), derive, cell('fb'));
    expect(calls).toBe(1); // genuinely invoked, not shortcut to fallback
    expect(res).toEqual({ cell: cell('simpler'), source: 'derived' });
  });

  it('falls back ONLY on a derive error', async () => {
    const derive = async (): Promise<TwoChannelCell> => { throw new Error('boom'); };
    const res = await stepSimpler(cell('cur'), derive, cell('fb'));
    expect(res).toEqual({ cell: cell('fb'), source: 'fallback' });
  });

  it('falls back on a derive timeout', async () => {
    const hang: () => Promise<TwoChannelCell> = () => new Promise(() => {}); // never settles
    const res = await stepSimpler(cell('cur'), hang, cell('fb'), { timeoutMs: 10 });
    expect(res.source).toBe('fallback');
  });

  it('withTimeout resolves a fast promise and rejects a slow one', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok');
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toThrow(/timeout/);
  });
});

describe('content-template-engine — grounding facts (stage 4 select/rank/cap)', () => {
  const facts: GroundingFact[] = [
    { key: 'a', value: 'A', weight: 1, tier: 'capability' },
    { key: 'b', value: 'B', weight: 3, tier: 'capability' },
    { key: 'c', value: 'C', weight: 2, tier: 'capability' },
  ];

  it('ranks by weight desc and caps to max', () => {
    expect(selectRankCapFacts(facts, 2).map((f) => f.key)).toEqual(['b', 'c']);
  });

  it('prefers corroborated over capability at equal weight', () => {
    const tie: GroundingFact[] = [
      { key: 'cap', value: 'x', weight: 2, tier: 'capability' },
      { key: 'corr', value: 'y', weight: 2, tier: 'corroborated' },
    ];
    expect(selectRankCapFacts(tie, 1).map((f) => f.key)).toEqual(['corr']);
  });

  it('a non-positive cap selects nothing', () => {
    expect(selectRankCapFacts(facts, 0)).toEqual([]);
  });
});

describe('content-template-engine — option compose (stage 4)', () => {
  const slots: Slot[] = [{ name: 'feature', type: 'literal', ref: 'checkout' }];

  it('fills composition slots and preserves runtime {R...}', () => {
    const out = composeOption({ cell: cell('Work on {{feature}} {R5_INJECT: hint}'), slots });
    expect(out).toBe('Work on checkout {R5_INJECT: hint}');
  });

  it('merges the action anchor when it fits', () => {
    const out = composeOption({ cell: cell('do it'), slots: [], anchor: '(then run tests)', lengthBudget: 100 });
    expect(out).toBe('do it (then run tests)');
  });

  it('drops the anchor FIRST when over the length budget (static text never truncated)', () => {
    const out = composeOption({ cell: cell('do it'), slots: [], anchor: '(then run the whole suite)', lengthBudget: 8 });
    expect(out).toBe('do it'); // anchor dropped, base intact
  });
});

describe('content-template-engine — why-desc compose (stage 4)', () => {
  it('weaves the core line + ranked/capped facts and preserves {R...}', () => {
    const facts: GroundingFact[] = [{ key: 'env', value: 'uses Vitest', weight: 1, tier: 'corroborated' }];
    const out = composeWhyDesc({ cell: cell('o', 'core line {R4_OPEN}'), slots: [], facts, factCap: 3 });
    expect(out).toContain('core line {R4_OPEN}'); // {R...} preserved
    expect(out).toContain('uses Vitest');
  });

  it('injection-guards fact values (a value cannot inject composition or runtime grammar)', () => {
    const facts: GroundingFact[] = [
      { key: 'a', value: '{{evil}}', weight: 2, tier: 'capability' },
      { key: 'b', value: '{R5_INJECT: pwn}', weight: 1, tier: 'capability' },
    ];
    const out = composeWhyDesc({ cell: cell(), slots: [], facts, factCap: 5 });
    expect(out).not.toMatch(/\{\{evil\}\}/);
    expect(out).not.toMatch(/\{R5_INJECT: pwn\}/);
  });

  it('preserves the L2 safeguard in every sibling — never dropped, even at cap 0', () => {
    const out = composeWhyDesc({ cell: cell(), slots: [], facts: [], factCap: 0, l2Safeguard: 'still, confirm with me before this' });
    expect(out).toContain('still, confirm with me before this');
  });
});
