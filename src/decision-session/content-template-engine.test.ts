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
  deriveLadder,
  composeAdvisory,
  envFactsToGrounding,
  rightGoodToGrounding,
  workStyleToGrounding,
  retrieveGroundingFacts,
  PROMPT_FACT_WEIGHT,
  SOURCE_CASCADE,
  type GroundingFact,
  type RecordCandidateLookup,
} from './content-template-engine.js';
import type { OptionEntry } from './options.js';
import type { FactMap } from '../env/types.js';
import type { RightGoodProfile } from './../classifier/right-good-aggregator.js';
import type { WorkStyleProfile } from './../classifier/work-style-traits.js';
import type { SignalDefinition } from '../classifier/types.js';
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

  it('breaks a full tie (same weight + tier) by key for determinism', () => {
    const tie: GroundingFact[] = [
      { key: 'zeta', value: 'z', weight: 2, tier: 'capability' },
      { key: 'alpha', value: 'a', weight: 2, tier: 'capability' },
    ];
    expect(selectRankCapFacts(tie, 2).map((f) => f.key)).toEqual(['alpha', 'zeta']);
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

  it('always merges the anchor when no length budget is set', () => {
    const out = composeOption({ cell: cell('do it'), slots: [], anchor: '(then run the whole suite)' });
    expect(out).toBe('do it (then run the whole suite)');
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

  it('stepSimplerLive preserves the L2 safeguard in the derived sibling', async () => {
    const safeguard = 'confirm with me before this';
    const client = mockClient(JSON.stringify({ option: 'simpler', whyDesc: 'simpler why' }));
    const res = await stepSimplerLive(cell('cur'), cell('fb'), client, { l2Safeguard: safeguard });
    expect(res.source).toBe('derived');
    expect(res.cell.whyDesc.endsWith(safeguard)).toBe(true);
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

  it('deriveLadder produces L1 (as-is) + eagerly-derived L2 + L3', async () => {
    const l1: OptionEntry[] = [{ option: 'Carefully review the diff.', descBase: 'why' }];
    const ladder = await deriveLadder(l1, {}, mockClient(JSON.stringify({ option: 'simpler', whyDesc: 'sw' })));
    expect(ladder.l1).toEqual(l1); // L1 unchanged
    expect(ladder.l2).toEqual([{ option: 'simpler', descBase: 'sw' }]);
    expect(ladder.l3).toEqual([{ option: 'simpler', descBase: 'sw' }]);
  });

  it('deriveLadder falls back to the supplied static tiers when a derive fails', async () => {
    const l1: OptionEntry[] = [{ option: 'L1 opt', descBase: 'L1 why' }];
    const fb = { l2: [{ option: 'static L2', descBase: 'L2 why' }], l3: [{ option: 'static L3', descBase: 'L3 why' }] };
    const ladder = await deriveLadder(l1, fb, mockClient('throw'));
    expect(ladder.l2).toEqual(fb.l2);
    expect(ladder.l3).toEqual(fb.l3);
  });
});

describe('content-template-engine — param-source retrieval (AR-10 / AR-9 / AR-3)', () => {
  it('envFactsToGrounding maps present capabilities, skips unknown/absent', () => {
    const facts: FactMap = {
      project_framework: { value: 'next.js', tier: 'C', confidence: 'high', detectedAt: 0 },
      has_test_runner: { value: true, tier: 'C', confidence: 'high', detectedAt: 0 },
      has_ci_pipeline: { value: false, tier: 'C', confidence: 'high', detectedAt: 0 }, // absent → skip
      shell_type: { value: null, tier: 'C', confidence: 'low', detectedAt: 0 },        // unknown → skip
    };
    expect(envFactsToGrounding(facts)).toEqual([
      { key: 'project_framework', value: 'next.js', weight: 1, tier: 'capability' },
      { key: 'has_test_runner', value: 'has_test_runner', weight: 1, tier: 'capability' },
    ]);
  });

  it('envFactsToGrounding honours tier P (corroborated) and low confidence (weight 0.5)', () => {
    const facts: FactMap = { x: { value: 'v', tier: 'P', confidence: 'low', detectedAt: 0 } };
    expect(envFactsToGrounding(facts)).toEqual([{ key: 'x', value: 'v', weight: 0.5, tier: 'corroborated' }]);
  });

  it('rightGoodToGrounding maps only the good side, using the signal description', () => {
    const profile: RightGoodProfile = {
      good_sig: { score: 0.8, state: 'right_good', stability: { sessions: 2, occurrences: 3, stable: true }, lastUpdated: 1 },
      bad_sig: { score: 0.1, state: 'mistake', stability: { sessions: 1, occurrences: 1, stable: false }, lastUpdated: 1 },
      meh_sig: { score: 0.2, state: 'neutral', stability: { sessions: 1, occurrences: 1, stable: false }, lastUpdated: 1 },
    };
    const lookup = (k: string): SignalDefinition | undefined =>
      k === 'good_sig' ? ({ key: k, description: 'reliably cross-confirms changes' } as SignalDefinition) : undefined;
    expect(rightGoodToGrounding(profile, lookup)).toEqual([
      { key: 'good_sig', value: 'reliably cross-confirms changes', weight: 0.8, tier: 'corroborated' },
    ]);
  });

  it('rightGoodToGrounding falls back to the key when no description exists', () => {
    const profile: RightGoodProfile = {
      k: { score: 0.6, state: 'right_good', stability: { sessions: 2, occurrences: 3, stable: true }, lastUpdated: 1 },
    };
    expect(rightGoodToGrounding(profile, () => undefined)).toEqual([{ key: 'k', value: 'k', weight: 0.6, tier: 'corroborated' }]);
  });

  it('workStyleToGrounding maps SET traits and skips UNSET', () => {
    const profile: WorkStyleProfile = {
      decisionRhythm: { value: 'decisive', stable: true, observations: 5, sessions: 2, dormant: false },
      abstractionLevel: { value: null, stable: false, observations: 0, sessions: 0, dormant: false },
      explanationDepth: { value: null, stable: false, observations: 0, sessions: 0, dormant: true },
    };
    expect(workStyleToGrounding(profile)).toEqual([
      { key: 'decisionRhythm', value: 'decisive', weight: PROMPT_FACT_WEIGHT, tier: 'capability' },
    ]);
  });

  it('retrieveGroundingFacts combines all four sources', async () => {
    const env: FactMap = { project_framework: { value: 'vite', tier: 'C', confidence: 'high', detectedAt: 0 } };
    const rightGood: RightGoodProfile = {
      g: { score: 0.7, state: 'right_good', stability: { sessions: 2, occurrences: 3, stable: true }, lastUpdated: 1 },
    };
    const workStyle: WorkStyleProfile = {
      decisionRhythm: { value: 'deliberative', stable: true, observations: 5, sessions: 2, dormant: false },
      abstractionLevel: { value: null, stable: false, observations: 0, sessions: 0, dormant: false },
      explanationDepth: { value: null, stable: false, observations: 0, sessions: 0, dormant: true },
    };
    const facts = await retrieveGroundingFacts(
      { env, rightGood, workStyle, prompts: ['I use vite'] },
      mockClient(JSON.stringify({ facts: [{ key: 'test_runner', value: 'uses Vitest' }] })),
    );
    expect(facts.map((f) => f.key)).toEqual(['project_framework', 'g', 'decisionRhythm', 'test_runner']);
  });

  it('retrieveGroundingFacts returns [] for no sources', async () => {
    expect(await retrieveGroundingFacts({})).toEqual([]);
  });
});

describe('content-template-engine — end-to-end orchestration (composeAdvisory)', () => {
  it('resolves a record, resolves the column, and composes both channels', async () => {
    const rec = record({ levelForms: { 1: { kind: 'slot-variant', cell: cell('do the thing', 'core line') } } });
    const out = await composeAdvisory(
      { lookup: lookupOf({ shipped: rec }), level: 1 },
      mockClient(JSON.stringify({ whyDesc: 'woven why' })),
    );
    expect(out).toEqual({ source: 'shipped', level: 1, option: 'do the thing', whyDesc: 'woven why' });
  });

  it('returns null when no source yields a valid record', async () => {
    const out = await composeAdvisory({ lookup: lookupOf({ uploaded: { bad: true } }), level: 1 }, mockClient('{}'));
    expect(out).toBeNull();
  });

  it('resolves a lower column via the floor when the requested level is unauthored', async () => {
    const rec = record({ levelForms: { 1: { kind: 'slot-variant', cell: cell('floor opt', 'floor why') } } });
    const out = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 5 }, mockClient(JSON.stringify({ whyDesc: 'w' })));
    expect(out?.level).toBe(1); // level-1 floor served for an unauthored level 5
    expect(out?.option).toBe('floor opt');
  });

  it('preserves runtime {R...} in the why-desc end-to-end (weave drops it -> deterministic fallback)', async () => {
    const rec = record({ levelForms: { 1: { kind: 'slot-variant', cell: cell('opt', 'core {R5_INJECT: last prompts}') } } });
    // The mock weave returns prose without the token -> composeAdvisory must keep it via fallback.
    const out = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 1 }, mockClient(JSON.stringify({ whyDesc: 'core only, token gone' })));
    expect(out?.whyDesc).toContain('{R5_INJECT: last prompts}');
  });

  it('composeWhyDesc appends the safeguard last, and never duplicates one already in the core line', () => {
    const seek = 'Ask me for go-ahead before deploying.';
    const appended = composeWhyDesc({ cell: cell('opt', 'core line'), slots: [], l2Safeguard: seek });
    expect(appended.endsWith(seek)).toBe(true);
    const alreadyThere = composeWhyDesc({ cell: cell('opt', `core line. ${seek}`), slots: [], l2Safeguard: seek });
    expect((alreadyThere.match(/Ask me for go-ahead before deploying\./g) ?? []).length).toBe(1); // not duplicated
  });

  it('auto-applies the record l2SafeguardLine to the why-desc when the caller passes none', async () => {
    const rec = record({
      levelForms: { 1: { kind: 'slot-variant', cell: cell('opt', 'core line') } },
      l2SafeguardRequired: true,
      l2SafeguardLine: 'Ask me for go-ahead before deploying.',
    });
    // No l2Safeguard in the input — the engine must source it from the resolved record,
    // so the live wiring can never forget the sensitive-action safeguard.
    const out = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 1 }, mockClient(JSON.stringify({ whyDesc: 'woven why' })));
    expect(out?.whyDesc).toContain('Ask me for go-ahead before deploying.');
  });
});

describe('content-template-engine — T2: served column never exceeds L+1', () => {
  // CTA-D3 §5.10.18 T2 (+1-form-clamp): the engine never serves a column > requested+1;
  // the served column ∈ [floor, L+1], and may fall BELOW L via closest-level fallback.
  // The schema-level resolveLevelForm clamp is tested in content-template-schema.test.ts;
  // these pin the same guarantee at the engine's resolveColumn / composeAdvisory boundary
  // using a record with a far-upper authored level (1 and 5, nothing between).
  const rec = record({ levelForms: {
    1: { kind: 'slot-variant', cell: cell('lvl1', 'w1') },
    5: { kind: 'slot-variant', cell: cell('lvl5', 'w5') },
  } });

  it('resolveColumn excludes a far-upper level beyond L+1 (serves the floor instead)', () => {
    expect(resolveColumn(rec, 2)?.level).toBe(1); // 5 > 2+1 → excluded; floor served
    expect(resolveColumn(rec, 3)?.level).toBe(1); // 5 > 3+1 → excluded; floor served
    expect(resolveColumn(rec, 4)?.level).toBe(5); // 5 ≤ 4+1 → in-window
  });

  it('composeAdvisory serves a column within [floor, L+1], never the far-upper', async () => {
    const out = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 2 }, mockClient(JSON.stringify({ whyDesc: 'w' })));
    expect(out!.level).toBeLessThanOrEqual(2 + 1);
    expect(out?.option).toBe('lvl1'); // the far-upper lvl5 is NOT served
  });

  it('T2-cap: a request at the max level serves at most the max authored', async () => {
    const out = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 5 }, mockClient(JSON.stringify({ whyDesc: 'w' })));
    expect(out?.level).toBe(5);
  });
});

describe('content-template-engine — T1-RUNTIME: keyword survives the (b)-derive', () => {
  // CTA-D3 §5.10.18 T1-RUNTIME: the one-notch-simpler (b)-derive output preserves the
  // signalType keyword. The derive is the LLM seam (prompt instructs "without ... dropping
  // its key topic word"); these tests pin that the ENGINE carries the keyword through the
  // derived cell AND that the always-available static fallback guarantees a keyword-bearing
  // form on any derive failure — so a served strength ladder is never keyword-less.
  const KW = 'review';
  const keepsKeyword = mockClient(JSON.stringify({ option: 'take a quick review pass', whyDesc: 'a light review' }));

  it('the derived simpler cell carries the keyword through (b) on success', async () => {
    const res = await stepSimplerLive(cell('Do a thorough review of the change', 'review the diff'), cell('a quick review', 'review it'), keepsKeyword);
    expect(res.source).toBe('derived');
    expect(res.cell.option.toLowerCase()).toContain(KW);
    expect(res.cell.whyDesc.toLowerCase()).toContain(KW);
  });

  it('the fallback path preserves the keyword (the static next-tier form carries it)', async () => {
    const res = await stepSimplerLive(cell('review now', 'review'), cell('a quick review', 'review it'), mockClient('throw'));
    expect(res.source).toBe('fallback');
    expect(res.cell.option.toLowerCase()).toContain(KW);
    expect(res.cell.whyDesc.toLowerCase()).toContain(KW);
  });

  it('deriveLadder carries the keyword across L1 → L2 → L3', async () => {
    const l1: OptionEntry[] = [{ option: 'Carefully review the diff', descBase: 'review the change' }];
    const ladder = await deriveLadder(l1, {}, keepsKeyword);
    for (const tier of [ladder.l1, ladder.l2, ladder.l3]) {
      expect(tier[0].option.toLowerCase()).toContain(KW);
    }
  });

  it('keyword retention on a SUCCESSFUL derive is the LLM contract (T1-proxy-limit); the fallback is the guarantee', async () => {
    // A derive that returns keyword-less text "succeeds" — the engine does not silently
    // re-inject the keyword (retention is the prompt's instruction to the model, a human-
    // reviewed proxy limit). The guarantee is the static fallback, which always carries it.
    const dropsKeyword = mockClient(JSON.stringify({ option: 'simpler', whyDesc: 'simpler' }));
    const onDrop = await deriveSimplerLevel([{ option: 'review it', descBase: 'review' }], [{ option: 'a quick review', descBase: 'review' }], dropsKeyword);
    expect(onDrop[0].option.toLowerCase()).not.toContain(KW); // documents: engine doesn't enforce on success
    const onFail = await deriveSimplerLevel([{ option: 'review it', descBase: 'review' }], [{ option: 'a quick review', descBase: 'review' }], mockClient('throw'));
    expect(onFail[0].option.toLowerCase()).toContain(KW); // fallback guarantees it
  });
});
