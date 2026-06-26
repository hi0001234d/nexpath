import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import { CLASS3_RECORDS } from './class3-records.js';
import { resolveRegisterForms, composeAdvisory, type RecordCandidateLookup } from '../content-template-engine.js';
import { reviewRecord, checkVoice, checkEscalation, checkL2Safeguard } from '../content-authoring-rules.js';
import { checkTopicKeyword, checkOptionLengthBudget } from '../content-template-tooling.js';
import { validateContentTemplateRecord, type ContentTemplateRecord } from '../content-template-schema.js';
import {
  ABSENCE_ALTERNATIVES_BEGINNER, ABSENCE_API_DESIGN_REVIEW_BEGINNER, ABSENCE_ARCH_CONFLICT_BEGINNER,
  ABSENCE_CROSS_CONFIRMING_BEGINNER, ABSENCE_PROMPT_CONTEXT_BEGINNER, ABSENCE_SPEC_ACCEPTANCE_BEGINNER,
  ABSENCE_SPEC_CROSS_CONFIRM_BEGINNER, ABSENCE_SPEC_REVISION_BEGINNER,
} from './class3-spec-architecture.js';
import type { DecisionContent } from '../options.js';

function mockClient(reply: string): OpenAI {
  return { chat: { completions: { create: async () => ({ choices: [{ message: { content: reply } }] }) } } } as unknown as OpenAI;
}
function lookupOf(map: Partial<Record<string, unknown>>): RecordCandidateLookup {
  return (source) => map[source];
}

const BEGINNER_KEYWORD: Record<string, string> = {
  ABSENCE_ALTERNATIVES: 'decision',
  ABSENCE_API_DESIGN_REVIEW: 'api',
  ABSENCE_ARCH_CONFLICT: 'project',
  ABSENCE_CROSS_CONFIRMING: 'check',
  ABSENCE_PROMPT_CONTEXT: 'plan',
  ABSENCE_SPEC_ACCEPTANCE: 'plan',
  ABSENCE_SPEC_CROSS_CONFIRM: 'spec',
  ABSENCE_SPEC_REVISION: 'spec',
};

const FROZEN_BEGINNER: Record<string, DecisionContent> = {
  ABSENCE_ALTERNATIVES: ABSENCE_ALTERNATIVES_BEGINNER,
  ABSENCE_API_DESIGN_REVIEW: ABSENCE_API_DESIGN_REVIEW_BEGINNER,
  ABSENCE_ARCH_CONFLICT: ABSENCE_ARCH_CONFLICT_BEGINNER,
  ABSENCE_CROSS_CONFIRMING: ABSENCE_CROSS_CONFIRMING_BEGINNER,
  ABSENCE_PROMPT_CONTEXT: ABSENCE_PROMPT_CONTEXT_BEGINNER,
  ABSENCE_SPEC_ACCEPTANCE: ABSENCE_SPEC_ACCEPTANCE_BEGINNER,
  ABSENCE_SPEC_CROSS_CONFIRM: ABSENCE_SPEC_CROSS_CONFIRM_BEGINNER,
  ABSENCE_SPEC_REVISION: ABSENCE_SPEC_REVISION_BEGINNER,
};

const WITH_OVERRIDE = Object.keys(BEGINNER_KEYWORD);

function asOverrideRecord(r: ContentTemplateRecord): ContentTemplateRecord {
  return { ...r, levelForms: resolveRegisterForms(r, 'beginner') };
}

describe('class-3 beginner overrides — set level', () => {
  it('exactly the 8 signals with a frozen beginner variant carry a structurally-divergent override', () => {
    const withOverride = CLASS3_RECORDS.filter((r) => r.registerOverrides?.beginner?.divergence === 'structurally-divergent').map((r) => r.signalType);
    expect(withOverride.sort()).toEqual([...WITH_OVERRIDE].sort());
  });
  it('the 3 signals with no frozen beginner variant carry no override', () => {
    for (const sig of ['ABSENCE_ARCHITECTURE_NOTE_ABSENCE', 'ABSENCE_API_CONTRACT_DEFINITION', 'ABSENCE_BACKWARDS_COMPATIBILITY_CHECK']) {
      expect(CLASS3_RECORDS.find((r) => r.signalType === sig)?.registerOverrides).toBeUndefined();
    }
  });
});

describe('class-3 beginner overrides — per-variant T1-variant gates', () => {
  for (const r of CLASS3_RECORDS) {
    const ov = r.registerOverrides?.beginner;
    if (!ov || ov.divergence !== 'structurally-divergent') continue;
    const kw = BEGINNER_KEYWORD[r.signalType];
    const synth = asOverrideRecord(r);

    describe(r.signalType, () => {
      it('is a schema-valid, all-5-column, floored ladder', () => {
        expect(validateContentTemplateRecord(synth).ok).toBe(true);
        expect(Object.keys(synth.levelForms).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
      });

      it('column 3 is the frozen beginner shipped text verbatim (option + a real frozen core line)', () => {
        const frozen = FROZEN_BEGINNER[r.signalType];
        const col3 = synth.levelForms[3]!.cell;
        expect(col3.option).toBe(frozen.L1[0].option);
        expect(frozen.L1[0].descBase).toContain(col3.whyDesc);
      });

      it('keeps its own beginner keyword in every option and every authored why-desc (col-3 frozen core exempt)', () => {
        const res = checkTopicKeyword(synth, kw);
        expect(res.missingInOption).toEqual([]);
        expect(res.missingInWhyDesc.filter((l) => l !== 3)).toEqual([]);
      });

      it('is de-jargon clean (col-3 frozen exempt), headline-only, full coverage, voice-clean', () => {
        const review = reviewRecord(synth, kw);
        const jargon = { ...review.jargonByLevel };
        delete jargon[3];
        expect(jargon).toEqual({});
        expect(review.headlineOnly.ok).toBe(true);
        expect(review.coverage.ok).toBe(true);
        expect(checkVoice(synth).ok).toBe(true);
      });

      it('the override forms trip no sensitive-action proxy (class 3 has no sensitive signal)', () => {
        expect(checkL2Safeguard(synth).ok).toBe(true);
      });

      it('practice richness is monotonic; fits the copy-paste budget (col-3 exempt), col-1 ≤ col-5', () => {
        expect(checkEscalation([1, 2, 3, 4, 5]).ok).toBe(true);
        expect(checkOptionLengthBudget(synth).overLevels.filter((l) => l !== 3)).toEqual([]);
        expect(synth.levelForms[1]!.cell.option.length).toBeLessThanOrEqual(synth.levelForms[5]!.cell.option.length);
      });
    });
  }
});

describe('class-3 beginner overrides — engine serves them for the beginner register', () => {
  it('composeAdvisory serves the beginner override option when register=beginner, base otherwise', async () => {
    const rec = CLASS3_RECORDS.find((r) => r.signalType === 'ABSENCE_ALTERNATIVES')!;
    const beg = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 1, register: 'beginner' }, mockClient(JSON.stringify({ whyDesc: 'w' })));
    const base = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 1 }, mockClient(JSON.stringify({ whyDesc: 'w' })));
    expect(beg?.option).toBe(resolveRegisterForms(rec, 'beginner')[1]!.cell.option);
    expect(base?.option).toBe(rec.levelForms[1]!.cell.option);
    expect(beg?.option).not.toBe(base?.option);
  });
});
