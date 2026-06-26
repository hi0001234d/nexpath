import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import { CLASS6_RECORDS } from './class6-records.js';
import { resolveRegisterForms, composeAdvisory, type RecordCandidateLookup } from '../content-template-engine.js';
import { reviewRecord, checkVoice, checkEscalation, checkL2Safeguard } from '../content-authoring-rules.js';
import { checkTopicKeyword, checkOptionLengthBudget } from '../content-template-tooling.js';
import { validateContentTemplateRecord, type ContentTemplateRecord } from '../content-template-schema.js';
import {
  ABSENCE_PHASE_TRANSITION_BEGINNER, ABSENCE_IDEA_SCOPING_BEGINNER, ABSENCE_IDEA_CONSTRAINT_CHECK_BEGINNER,
  ABSENCE_IDEA_USER_DEFINITION_BEGINNER, ABSENCE_TASK_ORDERING_BEGINNER, ABSENCE_TASK_SIZING_BEGINNER,
  ABSENCE_TASK_DEFINITION_OF_DONE_BEGINNER, ABSENCE_USER_FEEDBACK_REVIEW_BEGINNER,
  ABSENCE_ITERATION_PLANNING_BEGINNER, ABSENCE_SCOPE_CREEP_BEGINNER, ABSENCE_FEATURE_SCOPE_BEGINNER,
  ABSENCE_IMPLEMENTATION_CHECKPOINT_BEGINNER, ABSENCE_SPEC_BEFORE_CODE_BEGINNER, ABSENCE_INCREMENTAL_BUILD_BEGINNER,
} from './class6-planning-idea-task.js';
import type { DecisionContent } from '../options.js';

function mockClient(reply: string): OpenAI {
  return { chat: { completions: { create: async () => ({ choices: [{ message: { content: reply } }] }) } } } as unknown as OpenAI;
}
function lookupOf(map: Partial<Record<string, unknown>>): RecordCandidateLookup {
  return (source) => map[source];
}

/** Each beginner variant's OWN plain keyword (present in the frozen col-3, avoids the base keyword). */
const BEGINNER_KEYWORD: Record<string, string> = {
  ABSENCE_PHASE_TRANSITION: 'phase',
  ABSENCE_IDEA_SCOPING: 'describ',
  ABSENCE_IDEA_CONSTRAINT_CHECK: 'leav',
  ABSENCE_IDEA_USER_DEFINITION: 'person',
  ABSENCE_TASK_ORDERING: 'order',
  ABSENCE_TASK_SIZING: 'split',
  ABSENCE_TASK_DEFINITION_OF_DONE: 'done',
  ABSENCE_USER_FEEDBACK_REVIEW: 'feedback',
  ABSENCE_ITERATION_PLANNING: 'next',
  ABSENCE_SCOPE_CREEP: 'plan',
  ABSENCE_FEATURE_SCOPE: 'part',
  ABSENCE_IMPLEMENTATION_CHECKPOINT: 'work',
  ABSENCE_SPEC_BEFORE_CODE: 'code',
  ABSENCE_INCREMENTAL_BUILD: 'test',
};

const FROZEN_BEGINNER: Record<string, DecisionContent> = {
  ABSENCE_PHASE_TRANSITION: ABSENCE_PHASE_TRANSITION_BEGINNER,
  ABSENCE_IDEA_SCOPING: ABSENCE_IDEA_SCOPING_BEGINNER,
  ABSENCE_IDEA_CONSTRAINT_CHECK: ABSENCE_IDEA_CONSTRAINT_CHECK_BEGINNER,
  ABSENCE_IDEA_USER_DEFINITION: ABSENCE_IDEA_USER_DEFINITION_BEGINNER,
  ABSENCE_TASK_ORDERING: ABSENCE_TASK_ORDERING_BEGINNER,
  ABSENCE_TASK_SIZING: ABSENCE_TASK_SIZING_BEGINNER,
  ABSENCE_TASK_DEFINITION_OF_DONE: ABSENCE_TASK_DEFINITION_OF_DONE_BEGINNER,
  ABSENCE_USER_FEEDBACK_REVIEW: ABSENCE_USER_FEEDBACK_REVIEW_BEGINNER,
  ABSENCE_ITERATION_PLANNING: ABSENCE_ITERATION_PLANNING_BEGINNER,
  ABSENCE_SCOPE_CREEP: ABSENCE_SCOPE_CREEP_BEGINNER,
  ABSENCE_FEATURE_SCOPE: ABSENCE_FEATURE_SCOPE_BEGINNER,
  ABSENCE_IMPLEMENTATION_CHECKPOINT: ABSENCE_IMPLEMENTATION_CHECKPOINT_BEGINNER,
  ABSENCE_SPEC_BEFORE_CODE: ABSENCE_SPEC_BEFORE_CODE_BEGINNER,
  ABSENCE_INCREMENTAL_BUILD: ABSENCE_INCREMENTAL_BUILD_BEGINNER,
};

/** The two verification cadences stay behavioural at col-5; the other twelve yield a file. */
const BEHAVIOURAL = new Set(['ABSENCE_IMPLEMENTATION_CHECKPOINT', 'ABSENCE_INCREMENTAL_BUILD']);
const FILE_RE = /\b(files?|runbooks?|notes?|docs?|readme|plans?)\b/i;

const WITH_OVERRIDE = Object.keys(BEGINNER_KEYWORD);

function asOverrideRecord(r: ContentTemplateRecord): ContentTemplateRecord {
  return { ...r, levelForms: resolveRegisterForms(r, 'beginner') };
}

describe('class-6 beginner overrides — set level', () => {
  it('all 14 planning signals carry a structurally-divergent beginner override', () => {
    const withOverride = CLASS6_RECORDS.filter((r) => r.registerOverrides?.beginner?.divergence === 'structurally-divergent').map((r) => r.signalType);
    expect(withOverride.sort()).toEqual([...WITH_OVERRIDE].sort());
  });
});

describe('class-6 beginner overrides — per-variant T1-variant gates', () => {
  for (const r of CLASS6_RECORDS) {
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

      it('the override forms trip no sensitive-action proxy (class 6 planning is not sensitive)', () => {
        expect(r.l2SafeguardRequired).toBeUndefined();
        expect(checkL2Safeguard(synth).ok).toBe(true);
      });

      it("the heaviest column matches the base record's nature (file vs behavioural) — F2 parity", () => {
        const begCol5 = synth.levelForms[5]!.cell.option;
        const baseCol5 = r.levelForms[5]!.cell.option;
        if (BEHAVIOURAL.has(r.signalType)) expect(begCol5).not.toMatch(FILE_RE);
        else expect(begCol5).toMatch(FILE_RE);
        expect(FILE_RE.test(begCol5)).toBe(FILE_RE.test(baseCol5));
      });

      it('practice richness is monotonic; fits the copy-paste budget (col-3 exempt), col-1 ≤ col-5', () => {
        expect(checkEscalation([1, 2, 3, 4, 5]).ok).toBe(true);
        expect(checkOptionLengthBudget(synth).overLevels.filter((l) => l !== 3)).toEqual([]);
        expect(synth.levelForms[1]!.cell.option.length).toBeLessThanOrEqual(synth.levelForms[5]!.cell.option.length);
      });
    });
  }
});

describe('class-6 beginner overrides — engine serves them for the beginner register', () => {
  it('composeAdvisory serves the beginner override option when register=beginner, base otherwise', async () => {
    const rec = CLASS6_RECORDS.find((r) => r.signalType === 'ABSENCE_IDEA_SCOPING')!;
    const beg = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 1, register: 'beginner' }, mockClient(JSON.stringify({ whyDesc: 'w' })));
    const base = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 1 }, mockClient(JSON.stringify({ whyDesc: 'w' })));
    expect(beg?.option).toBe(resolveRegisterForms(rec, 'beginner')[1]!.cell.option);
    expect(base?.option).toBe(rec.levelForms[1]!.cell.option);
    expect(beg?.option).not.toBe(base?.option);
  });
});
