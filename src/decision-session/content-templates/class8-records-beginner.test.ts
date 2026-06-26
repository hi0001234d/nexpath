import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import { CLASS8_RECORDS } from './class8-records.js';
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
 * Class 8 is single-register (23 casual founder/indie + 12 formal PM) with NO frozen
 * beginner variant. Per USER decision (option 2, full scope) all 35 get a fresh beginner
 * override. As in class 7, col-3 is authored (no frozen anchor) — so the F3-verbatim check
 * is replaced by a col-3-distinctness check, and col-3 is held to the FULL bar (de-jargon,
 * length, keyword-in-why-desc all apply — no col-3 exemptions).
 */
const BEGINNER_KEYWORD: Record<string, string> = {
  ABSENCE_USER_VALUE_CHECK: 'want',
  ABSENCE_OUTCOME_DEFINITION: 'success',
  ABSENCE_FEATURE_PRIORITIZATION: 'first',
  ABSENCE_USER_PERSONA_CLARITY: 'person',
  ABSENCE_COMPETITIVE_AWARENESS: 'other',
  ABSENCE_MVP_BOUNDARY_DISCIPLINE: 'core',
  ABSENCE_USER_ACQUISITION_CONSIDERATION: 'find',
  ABSENCE_RETENTION_MECHANISM_CHECK: 'return',
  ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT: 'measure',
  ABSENCE_HYPOTHESIS_BEFORE_BUILD: 'guess',
  ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE: 'direction',
  ABSENCE_NORTH_STAR_ALIGNMENT: 'goal',
  ABSENCE_TIME_TO_VALUE_CHECK: 'simple',
  ABSENCE_SHIP_READINESS_DEFINITION: 'ship',
  ABSENCE_MANUAL_BEFORE_AUTOMATE: 'hand',
  ABSENCE_TECH_STACK_COMPLEXITY_CHECK: 'alone',
  ABSENCE_LAUNCH_STRATEGY_ABSENCE: 'launch',
  ABSENCE_EARLY_USER_FEEDBACK: 'show',
  ABSENCE_SOLO_MAINTAINABILITY: 'own',
  ABSENCE_DISTRIBUTION_THINKING: 'discover',
  ABSENCE_MONETIZATION_PATH_CLARITY: 'money',
  ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY: 'public',
  ABSENCE_SCOPE_VS_TIME_CHECK: 'time',
  ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV: 'check',
  ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK: 'agree',
  ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG: 'vague',
  ABSENCE_DEPENDENCY_MAPPING: 'depend',
  ABSENCE_DEFINITION_OF_DONE: 'done',
  ABSENCE_CROSS_TEAM_IMPACT_CHECK: 'tell',
  ABSENCE_SUCCESS_METRIC_DEFINITION: 'number',
  ABSENCE_PRIORITY_JUSTIFICATION: 'instead',
  ABSENCE_USER_STORY_COMPLETENESS: 'story',
  ABSENCE_RISK_FLAG: 'risk',
  ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT: 'change',
  ABSENCE_RETROSPECTIVE_HABIT: 'learn',
};

const WITH_OVERRIDE = Object.keys(BEGINNER_KEYWORD);

/** The 4 intrinsically-sensitive signals (override inherits the base l2SafeguardLine). */
const SENSITIVE = new Set([
  'ABSENCE_LAUNCH_STRATEGY_ABSENCE', 'ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY',
  'ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK', 'ABSENCE_CROSS_TEAM_IMPACT_CHECK',
]);

/** The 5 ongoing cadences/habits whose heaviest column stays behavioural (no file). */
const BEHAVIOURAL = new Set([
  'ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE', 'ABSENCE_MANUAL_BEFORE_AUTOMATE',
  'ABSENCE_EARLY_USER_FEEDBACK', 'ABSENCE_SOLO_MAINTAINABILITY', 'ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY',
]);
const FILE_RE = /\b(files?|runbooks?|notes?|docs?|readme|plans?)\b/i;

function asOverrideRecord(r: ContentTemplateRecord): ContentTemplateRecord {
  return { ...r, levelForms: resolveRegisterForms(r, 'beginner') };
}

describe('class-8 beginner overrides — set level', () => {
  it('all 35 role-cluster signals carry a structurally-divergent override', () => {
    const withOverride = CLASS8_RECORDS.filter((r) => r.registerOverrides?.beginner?.divergence === 'structurally-divergent').map((r) => r.signalType);
    expect(withOverride.sort()).toEqual([...WITH_OVERRIDE].sort());
  });
});

describe('class-8 beginner overrides — per-variant T1-variant gates', () => {
  for (const r of CLASS8_RECORDS) {
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

      it('L2: the 4 sensitive signals are guarded via their inherited line; the other 31 carry no flag and trip no proxy', () => {
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

describe('class-8 beginner overrides — engine serves them for the beginner register', () => {
  it('composeAdvisory serves the beginner override option when register=beginner, base otherwise', async () => {
    const rec = CLASS8_RECORDS.find((r) => r.signalType === 'ABSENCE_USER_VALUE_CHECK')!;
    const beg = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 1, register: 'beginner' }, mockClient(JSON.stringify({ whyDesc: 'w' })));
    const base = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 1 }, mockClient(JSON.stringify({ whyDesc: 'w' })));
    expect(beg?.option).toBe(resolveRegisterForms(rec, 'beginner')[1]!.cell.option);
    expect(base?.option).toBe(rec.levelForms[1]!.cell.option);
    expect(beg?.option).not.toBe(base?.option);
  });

  it('every sensitive signal appends its action-specific l2SafeguardLine to the beginner variant too (L2 per variant)', async () => {
    for (const sig of SENSITIVE) {
      const rec = CLASS8_RECORDS.find((r) => r.signalType === sig)!;
      expect(rec.l2SafeguardRequired).toBe(true);
      for (const lvl of [1, 3, 5] as const) {
        const out = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: lvl, register: 'beginner' }, mockClient(JSON.stringify({ whyDesc: 'woven' })));
        expect(out?.whyDesc).toContain(rec.l2SafeguardLine!);
      }
    }
  });
});
