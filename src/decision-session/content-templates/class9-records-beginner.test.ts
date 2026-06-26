import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import { CLASS9_RECORDS } from './class9-records.js';
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
 * Class 9 is formal-only (academic / hardcore-pro) with NO frozen beginner variant. Per
 * USER decision (full scope) all 12 get a fresh beginner override. As in class 7/8, col-3
 * is authored (no frozen anchor) — F3-verbatim is replaced by a col-3-distinctness check,
 * and col-3 is held to the FULL bar (de-jargon, length, keyword-in-why-desc all apply).
 * The advanced topics are de-jargoned: each beginner keyword is a plain word, not the
 * technical label.
 */
const BEGINNER_KEYWORD: Record<string, string> = {
  ABSENCE_DECISION_RECORD_ABSENCE: 'decision',
  ABSENCE_OVER_ENGINEERING_CHECK: 'extra',
  ABSENCE_PAIR_REVIEW_ABSENCE: 'review',
  ABSENCE_OBSERVABILITY_FIRST: 'watch',
  ABSENCE_FAILURE_MODE_ANALYSIS: 'fail',
  ABSENCE_CONTRACT_TESTING_GAP: 'agree',
  ABSENCE_CAPACITY_PLANNING_GAP: 'load',
  ABSENCE_SECURITY_THREAT_MODELING: 'attack',
  ABSENCE_DATABASE_MIGRATION_SAFETY: 'database',
  ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE: 'undo',
  ABSENCE_OPERATIONAL_RUNBOOK_GAP: 'guide',
  ABSENCE_SLO_DEFINITION_GAP: 'target',
};

const WITH_OVERRIDE = Object.keys(BEGINNER_KEYWORD);

/** The 6 intrinsically-sensitive signals (override inherits the base l2SafeguardLine). */
const SENSITIVE = new Set([
  'ABSENCE_OVER_ENGINEERING_CHECK', 'ABSENCE_OBSERVABILITY_FIRST', 'ABSENCE_FAILURE_MODE_ANALYSIS',
  'ABSENCE_SECURITY_THREAT_MODELING', 'ABSENCE_DATABASE_MIGRATION_SAFETY', 'ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE',
]);

/** The 1 standing discipline whose heaviest column stays behavioural (no file). */
const BEHAVIOURAL = new Set(['ABSENCE_OVER_ENGINEERING_CHECK']);
const FILE_RE = /\b(files?|runbooks?|notes?|docs?|readme|plans?)\b/i;

function asOverrideRecord(r: ContentTemplateRecord): ContentTemplateRecord {
  return { ...r, levelForms: resolveRegisterForms(r, 'beginner') };
}

describe('class-9 beginner overrides — set level', () => {
  it('all 12 academic/hardcore-pro signals carry a structurally-divergent override', () => {
    const withOverride = CLASS9_RECORDS.filter((r) => r.registerOverrides?.beginner?.divergence === 'structurally-divergent').map((r) => r.signalType);
    expect(withOverride.sort()).toEqual([...WITH_OVERRIDE].sort());
  });
});

describe('class-9 beginner overrides — per-variant T1-variant gates', () => {
  for (const r of CLASS9_RECORDS) {
    const ov = r.registerOverrides?.beginner;
    if (!ov || ov.divergence !== 'structurally-divergent') continue;
    const kw = BEGINNER_KEYWORD[r.signalType];
    const synth = asOverrideRecord(r);

    describe(r.signalType, () => {
      it('is a schema-valid, all-5-column, floored ladder', () => {
        expect(validateContentTemplateRecord(synth).ok).toBe(true);
        expect(Object.keys(synth.levelForms).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
      });

      it('col-3 is authored beginner text (no frozen beginner anchor), distinct from the base col-3', () => {
        const beg = synth.levelForms[3]!.cell.option;
        const base = r.levelForms[3]!.cell.option;
        expect(beg.length).toBeGreaterThan(0);
        expect(beg).not.toBe(base);
      });

      it('keeps its own beginner keyword in every option AND every why-desc incl col-3 (authored fresh — no exemption)', () => {
        const res = checkTopicKeyword(synth, kw);
        expect(res.missingInOption).toEqual([]);
        expect(res.missingInWhyDesc).toEqual([]);
      });

      it('is de-jargon clean in EVERY column incl col-3 (authored fresh — no exemption), headline-only, full coverage, voice-clean', () => {
        const review = reviewRecord(synth, kw);
        expect(review.jargonByLevel).toEqual({});
        expect(review.headlineOnly.ok).toBe(true);
        expect(review.coverage.ok).toBe(true);
        expect(checkVoice(synth).ok).toBe(true);
      });

      it('L2: the 6 sensitive signals are guarded via their inherited line; the other 6 carry no flag and trip no proxy', () => {
        if (SENSITIVE.has(r.signalType)) expect(r.l2SafeguardRequired).toBe(true);
        else expect(r.l2SafeguardRequired).toBeUndefined();
        expect(checkL2Safeguard(synth).ok).toBe(true);
      });

      it("the heaviest column matches the base record's nature (file vs behavioural) — F2 parity", () => {
        const begCol5 = synth.levelForms[5]!.cell.option;
        if (BEHAVIOURAL.has(r.signalType)) expect(begCol5).not.toMatch(FILE_RE);
        else expect(begCol5).toMatch(FILE_RE);
        expect(FILE_RE.test(begCol5)).toBe(FILE_RE.test(r.levelForms[5]!.cell.option));
      });

      it('practice richness is monotonic; fits the copy-paste budget in EVERY column incl col-3 (authored fresh — no exemption), col-1 ≤ col-5', () => {
        expect(checkEscalation([1, 2, 3, 4, 5]).ok).toBe(true);
        expect(checkOptionLengthBudget(synth).overLevels).toEqual([]);
        expect(synth.levelForms[1]!.cell.option.length).toBeLessThanOrEqual(synth.levelForms[5]!.cell.option.length);
      });
    });
  }
});

describe('class-9 beginner overrides — engine serves them for the beginner register', () => {
  it('composeAdvisory serves the beginner override option when register=beginner, base otherwise', async () => {
    const rec = CLASS9_RECORDS.find((r) => r.signalType === 'ABSENCE_DECISION_RECORD_ABSENCE')!;
    const beg = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 1, register: 'beginner' }, mockClient(JSON.stringify({ whyDesc: 'w' })));
    const base = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 1 }, mockClient(JSON.stringify({ whyDesc: 'w' })));
    expect(beg?.option).toBe(resolveRegisterForms(rec, 'beginner')[1]!.cell.option);
    expect(base?.option).toBe(rec.levelForms[1]!.cell.option);
    expect(beg?.option).not.toBe(base?.option);
  });

  it('every sensitive signal appends its action-specific l2SafeguardLine to the beginner variant too (L2 per variant)', async () => {
    for (const sig of SENSITIVE) {
      const rec = CLASS9_RECORDS.find((r) => r.signalType === sig)!;
      expect(rec.l2SafeguardRequired).toBe(true);
      for (const lvl of [1, 3, 5] as const) {
        const out = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: lvl, register: 'beginner' }, mockClient(JSON.stringify({ whyDesc: 'woven' })));
        expect(out?.whyDesc).toContain(rec.l2SafeguardLine!);
      }
    }
  });
});
