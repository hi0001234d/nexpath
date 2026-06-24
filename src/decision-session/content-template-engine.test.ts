import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import {
  resolveRecord,
  resolveColumn,
  stepSimpler,
  withTimeout,
  selectRankCapFacts,
  composeOption,
  composeWhyDesc,
  stepSimplerLive,
  groundWhyDescLive,
  promptDerivedFacts,
  extractPromptFacts,
  deriveSimplerLevel,
  PROMPT_FACT_WEIGHT,
  SOURCE_CASCADE,
  type GroundingFact,
  type RecordCandidateLookup,
} from './content-template-engine.js';
import type { OptionEntry } from './options.js';
import type { ContentTemplateRecord, TwoChannelCell, Slot } from './content-template-schema.js';

/** A fake OpenAI whose chat.completions.create returns `reply` (or throws). */
function mockClient(reply: string | 'throw'): OpenAI {
  return {
    chat: { completions: { create: async () => {
      if (reply === 'throw') throw new Error('network');
      return { choices: [{ message: { content: reply } }] };
    } } },
  } as unknown as OpenAI;
}

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

describe('content-template-engine — live grounding wiring (stage 3/4 + real seams)', () => {
  it('stepSimplerLive returns the LLM-derived cell on success', async () => {
    const client = mockClient(JSON.stringify({ option: 'simpler', whyDesc: 'why' }));
    const res = await stepSimplerLive(cell('cur'), cell('fb'), client);
    expect(res).toEqual({ cell: { option: 'simpler', whyDesc: 'why' }, source: 'derived' });
  });

  it('stepSimplerLive falls back to the (a) form when the derive fails', async () => {
    const res = await stepSimplerLive(cell('cur'), cell('fb'), mockClient('throw'));
    expect(res).toEqual({ cell: cell('fb'), source: 'fallback' });
  });

  it('groundWhyDescLive selects/caps + injection-guards facts then weaves', async () => {
    const facts: GroundingFact[] = [
      { key: 'a', value: 'uses Vitest', weight: 3, tier: 'corroborated' },
      { key: 'b', value: '{{evil}}', weight: 1, tier: 'capability' },
    ];
    const woven = await groundWhyDescLive({ cell: cell('o', 'core'), slots: [], facts, factCap: 5 }, mockClient(JSON.stringify({ whyDesc: 'core — uses Vitest' })));
    expect(woven).toBe('core — uses Vitest');
  });

  it('groundWhyDescLive falls back deterministically (guarded facts) when the weave fails', async () => {
    const facts: GroundingFact[] = [{ key: 'b', value: '{{evil}}', weight: 1, tier: 'capability' }];
    const out = await groundWhyDescLive({ cell: cell('o', 'core'), slots: [], facts, factCap: 5, l2Safeguard: 'confirm first' }, mockClient('throw'));
    expect(out).not.toMatch(/\{\{evil\}\}/); // value was injection-guarded before weave
    expect(out.endsWith('confirm first')).toBe(true); // safeguard survives
  });

  it('promptDerivedFacts maps extracted params to capability-tier facts', () => {
    expect(promptDerivedFacts([{ key: 'k', value: 'v' }])).toEqual([{ key: 'k', value: 'v', weight: PROMPT_FACT_WEIGHT, tier: 'capability' }]);
  });

  it('extractPromptFacts extracts via the LLM and maps to grounding facts', async () => {
    const client = mockClient(JSON.stringify({ facts: [{ key: 'test_runner', value: 'uses Vitest' }] }));
    const facts = await extractPromptFacts(['I run vitest'], client);
    expect(facts).toEqual([{ key: 'test_runner', value: 'uses Vitest', weight: PROMPT_FACT_WEIGHT, tier: 'capability' }]);
  });
});

describe('content-template-engine — render-path bridge (deriveSimplerLevel)', () => {
  const current: OptionEntry[] = [{ option: 'Review the change.', descBase: 'why a' }, { option: 'Run the tests.', descBase: 'why b' }];
  const fallback: OptionEntry[] = [{ option: 'Look it over.', descBase: 'fb a' }, { option: 'Run tests.', descBase: 'fb b' }];

  it('derives each entry one notch simpler via (b)', async () => {
    const client = mockClient(JSON.stringify({ option: 'simpler', whyDesc: 'simpler why' }));
    const out = await deriveSimplerLevel(current, fallback, client);
    expect(out).toEqual([
      { option: 'simpler', descBase: 'simpler why' },
      { option: 'simpler', descBase: 'simpler why' },
    ]);
  });

  it('falls back per-entry to the static next-tier form when a derive fails', async () => {
    const out = await deriveSimplerLevel(current, fallback, mockClient('throw'));
    expect(out).toEqual([
      { option: 'Look it over.', descBase: 'fb a' },
      { option: 'Run tests.', descBase: 'fb b' },
    ]);
  });

  it('uses the entry itself as fallback when the static tier has fewer entries', async () => {
    const out = await deriveSimplerLevel(current, [fallback[0]], mockClient('throw'));
    expect(out[1]).toEqual({ option: 'Run the tests.', descBase: 'why b' }); // own entry as fallback
  });
});
