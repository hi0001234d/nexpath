import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import { CLASS7_RECORDS } from './class7-records.js';
import { resolveRegisterForms, composeAdvisory, type RecordCandidateLookup } from '../content-template-engine.js';
import { reviewRecord, checkVoice, checkEscalation, checkL2Safeguard } from '../content-authoring-rules.js';
import { checkTopicKeyword, checkOptionLengthBudget } from '../content-template-tooling.js';
import { validateContentTemplateRecord, type ContentTemplateRecord } from '../content-template-schema.js';

function mockClient(reply: string): OpenAI {
  return { chat: { completions: { create: async () => ({ choices: [{ message: { content: reply } }] }) } } } as unknown as OpenAI;
}
function lookupOf(map: Partial<Record<string, unknown>>): RecordCandidateLookup {
  return (source) => map[source];
}

/**
 * Class 7 is single-register: 9 signals are already beginner-anchored (need no override) and
 * 11 are casual-anchored with NO frozen beginner variant. The 11 get a fresh beginner override
 * here. Because there is no frozen beginner headline, the usual F3-verbatim col-3 check cannot
 * exist — it is replaced by a "col-3 is authored beginner text, distinct from the casual base
 * col-3" check. Each override carries its own plain beginner keyword.
 */
const BEGINNER_KEYWORD: Record<string, string> = {
  ABSENCE_FEATURE_COMPLETION_CHECK: 'feature',
  ABSENCE_FINISHING_LINE_AWARENESS: 'finish',
  ABSENCE_POLISH_VS_FUNCTION: 'polish',
  ABSENCE_MVP_SCOPE_DISCIPLINE: 'core',
  ABSENCE_IDEA_TO_SPEC_BRIDGE: 'plan',
  ABSENCE_DEMO_VS_PRODUCT: 'demo',
  ABSENCE_USER_JOURNEY_CHECK: 'happen',
  ABSENCE_TECHNICAL_SPIKE_TREATMENT: 'experiment',
  ABSENCE_DEPENDENCY_ADVENTURE: 'package',
  ABSENCE_RESTART_IMPULSE_CHECK: 'restart',
  ABSENCE_CREATIVE_VS_CORE_RATIO: 'creative',
};

const WITH_OVERRIDE = Object.keys(BEGINNER_KEYWORD);

/** The 9 beginner-anchored signals — already beginner, so they carry NO override. */
const NO_OVERRIDE = [
  'ABSENCE_ERROR_UNDERSTANDING', 'ABSENCE_REQUIREMENT_CLARITY', 'ABSENCE_COPY_PASTE_AWARENESS',
  'ABSENCE_DEBUGGING_OBSERVATION', 'ABSENCE_LEARNING_CONSOLIDATION', 'ABSENCE_SIMPLE_SOLUTION_FIRST',
  'ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING', 'ABSENCE_ROLLBACK_AWARENESS', 'ABSENCE_BUILD_VS_UNDERSTAND_RATIO',
];

/** Of the 11 overrides, the six whose heaviest column produces a written record. */
const FILE_OVERRIDE = new Set([
  'ABSENCE_MVP_SCOPE_DISCIPLINE', 'ABSENCE_IDEA_TO_SPEC_BRIDGE', 'ABSENCE_DEMO_VS_PRODUCT',
  'ABSENCE_USER_JOURNEY_CHECK', 'ABSENCE_RESTART_IMPULSE_CHECK', 'ABSENCE_CREATIVE_VS_CORE_RATIO',
]);
const FILE_RE = /\b(files?|runbooks?|notes?|docs?|readme|plans?)\b/i;

function asOverrideRecord(r: ContentTemplateRecord): ContentTemplateRecord {
  return { ...r, levelForms: resolveRegisterForms(r, 'beginner') };
}

describe('class-7 beginner overrides — set level', () => {
  it('exactly the 11 casual-anchored signals carry a structurally-divergent override', () => {
    const withOverride = CLASS7_RECORDS.filter((r) => r.registerOverrides?.beginner?.divergence === 'structurally-divergent').map((r) => r.signalType);
    expect(withOverride.sort()).toEqual([...WITH_OVERRIDE].sort());
  });
  it('the 9 already-beginner-anchored signals carry no override', () => {
    for (const sig of NO_OVERRIDE) {
      expect(CLASS7_RECORDS.find((r) => r.signalType === sig)?.registerOverrides).toBeUndefined();
    }
  });
});

describe('class-7 beginner overrides — per-variant T1-variant gates', () => {
  for (const r of CLASS7_RECORDS) {
    const ov = r.registerOverrides?.beginner;
    if (!ov || ov.divergence !== 'structurally-divergent') continue;
    const kw = BEGINNER_KEYWORD[r.signalType];
    const synth = asOverrideRecord(r);

    describe(r.signalType, () => {
      it('is a schema-valid, all-5-column, floored ladder', () => {
        expect(validateContentTemplateRecord(synth).ok).toBe(true);
        expect(Object.keys(synth.levelForms).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
      });

      it('col-3 is authored beginner text (no frozen beginner anchor), distinct from the casual base col-3', () => {
        const beg = synth.levelForms[3]!.cell.option;
        const base = r.levelForms[3]!.cell.option;
        expect(beg.length).toBeGreaterThan(0);
        expect(beg).not.toBe(base);
      });

      it('keeps its own beginner keyword in every option and every authored why-desc (col-3 frozen core exempt)', () => {
        const res = checkTopicKeyword(synth, kw);
        expect(res.missingInOption).toEqual([]);
        expect(res.missingInWhyDesc.filter((l) => l !== 3)).toEqual([]);
      });

      it('is de-jargon clean in EVERY column incl col-3 (authored fresh, not frozen — no exemption), headline-only, full coverage, voice-clean', () => {
        // Unlike classes 1-6, class-7 col-3 is authored (no frozen beginner anchor), so it is
        // NOT exempt from the de-jargon bar — assert the whole record is jargon-clean.
        const review = reviewRecord(synth, kw);
        expect(review.jargonByLevel).toEqual({});
        expect(review.headlineOnly.ok).toBe(true);
        expect(review.coverage.ok).toBe(true);
        expect(checkVoice(synth).ok).toBe(true);
      });

      it('L2: DEPENDENCY_ADVENTURE is guarded via its inherited line; the other 10 carry no flag and trip no proxy', () => {
        if (r.signalType === 'ABSENCE_DEPENDENCY_ADVENTURE') expect(r.l2SafeguardRequired).toBe(true);
        else expect(r.l2SafeguardRequired).toBeUndefined();
        expect(checkL2Safeguard(synth).ok).toBe(true);
      });

      it("the heaviest column matches the base record's nature (file vs behavioural) — F2 parity", () => {
        const begCol5 = synth.levelForms[5]!.cell.option;
        if (FILE_OVERRIDE.has(r.signalType)) expect(begCol5).toMatch(FILE_RE);
        else expect(begCol5).not.toMatch(FILE_RE);
        expect(FILE_RE.test(begCol5)).toBe(FILE_RE.test(r.levelForms[5]!.cell.option));
      });

      it('practice richness is monotonic; fits the copy-paste budget (col-3 exempt), col-1 ≤ col-5', () => {
        expect(checkEscalation([1, 2, 3, 4, 5]).ok).toBe(true);
        expect(checkOptionLengthBudget(synth).overLevels.filter((l) => l !== 3)).toEqual([]);
        expect(synth.levelForms[1]!.cell.option.length).toBeLessThanOrEqual(synth.levelForms[5]!.cell.option.length);
      });
    });
  }
});

describe('class-7 beginner overrides — engine serves them for the beginner register', () => {
  it('composeAdvisory serves the beginner override option when register=beginner, base otherwise', async () => {
    const rec = CLASS7_RECORDS.find((r) => r.signalType === 'ABSENCE_MVP_SCOPE_DISCIPLINE')!;
    const beg = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 1, register: 'beginner' }, mockClient(JSON.stringify({ whyDesc: 'w' })));
    const base = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 1 }, mockClient(JSON.stringify({ whyDesc: 'w' })));
    expect(beg?.option).toBe(resolveRegisterForms(rec, 'beginner')[1]!.cell.option);
    expect(base?.option).toBe(rec.levelForms[1]!.cell.option);
    expect(beg?.option).not.toBe(base?.option);
  });

  it('the sensitive DEPENDENCY_ADVENTURE appends its l2SafeguardLine to the beginner variant too (L2 per variant)', async () => {
    const rec = CLASS7_RECORDS.find((r) => r.signalType === 'ABSENCE_DEPENDENCY_ADVENTURE')!;
    expect(rec.l2SafeguardRequired).toBe(true);
    for (const lvl of [1, 3, 5] as const) {
      const out = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: lvl, register: 'beginner' }, mockClient(JSON.stringify({ whyDesc: 'woven' })));
      expect(out?.whyDesc).toContain(rec.l2SafeguardLine!);
    }
  });
});
