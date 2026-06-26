import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import { CLASS1_RECORDS } from './class1-records.js';
import { resolveRegisterForms, composeAdvisory, type RecordCandidateLookup } from '../content-template-engine.js';
import { reviewRecord, checkVoice, checkEscalation, checkL2Safeguard } from '../content-authoring-rules.js';
import { checkTopicKeyword, checkOptionLengthBudget } from '../content-template-tooling.js';
import { validateContentTemplateRecord, type ContentTemplateRecord } from '../content-template-schema.js';
import {
  IDEA_TO_PRD_BEGINNER, PRD_TO_ARCHITECTURE_BEGINNER, ARCHITECTURE_TO_TASKS_BEGINNER,
  IMPLEMENTATION_TO_REVIEW_BEGINNER, REVIEW_TO_RELEASE_BEGINNER, RELEASE_TO_FEEDBACK_BEGINNER,
} from './class1-stage-transition.js';
import type { DecisionContent } from '../options.js';

/** Fake OpenAI returning a fixed weave (no real spend). */
function mockClient(reply: string): OpenAI {
  return { chat: { completions: { create: async () => ({ choices: [{ message: { content: reply } }] }) } } } as unknown as OpenAI;
}
function lookupOf(map: Partial<Record<string, unknown>>): RecordCandidateLookup {
  return (source) => map[source];
}

/** Each beginner variant's OWN plain keyword (the frozen beginner text avoids the base jargon keyword). */
const BEGINNER_KEYWORD: Record<string, string> = {
  IDEA_TO_PRD: 'understanding',
  PRD_TO_ARCHITECTURE: 'part',
  ARCHITECTURE_TO_TASKS: 'step',
  IMPLEMENTATION_TO_REVIEW: 'work',
  REVIEW_TO_RELEASE: 'ship',
  RELEASE_TO_FEEDBACK: 'break',
};

/** signalType → the frozen beginner DecisionContent whose L1[0] is the override's col-3 anchor. */
const FROZEN_BEGINNER: Record<string, DecisionContent> = {
  IDEA_TO_PRD: IDEA_TO_PRD_BEGINNER,
  PRD_TO_ARCHITECTURE: PRD_TO_ARCHITECTURE_BEGINNER,
  ARCHITECTURE_TO_TASKS: ARCHITECTURE_TO_TASKS_BEGINNER,
  IMPLEMENTATION_TO_REVIEW: IMPLEMENTATION_TO_REVIEW_BEGINNER,
  REVIEW_TO_RELEASE: REVIEW_TO_RELEASE_BEGINNER,
  RELEASE_TO_FEEDBACK: RELEASE_TO_FEEDBACK_BEGINNER,
};

/** The class-1 signals that have a beginner override (TASK_REVIEW has no frozen beginner variant). */
const WITH_OVERRIDE = Object.keys(BEGINNER_KEYWORD);

/** A synthetic record exposing the beginner override forms as its levelForms, for the content-agnostic checkers. */
function asOverrideRecord(r: ContentTemplateRecord): ContentTemplateRecord {
  return { ...r, levelForms: resolveRegisterForms(r, 'beginner') };
}

describe('class-1 beginner overrides — set level', () => {
  it('exactly the six frozen-beginner signals carry a structurally-divergent beginner override; TASK_REVIEW does not', () => {
    const withOverride = CLASS1_RECORDS.filter((r) => r.registerOverrides?.beginner?.divergence === 'structurally-divergent').map((r) => r.signalType);
    expect(withOverride.sort()).toEqual([...WITH_OVERRIDE].sort());
    expect(CLASS1_RECORDS.find((r) => r.signalType === 'TASK_REVIEW')?.registerOverrides).toBeUndefined();
  });
});

describe('class-1 beginner overrides — per-variant T1-variant gates', () => {
  for (const r of CLASS1_RECORDS) {
    const ov = r.registerOverrides?.beginner;
    if (!ov || ov.divergence !== 'structurally-divergent') continue;
    const kw = BEGINNER_KEYWORD[r.signalType];
    const synth = asOverrideRecord(r);

    describe(r.signalType, () => {
      it('the override is a schema-valid, all-5-column, floored ladder', () => {
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

      it('the override forms are L2-safe: unflagged variants trip no sensitive-action proxy; flagged ones are guarded', () => {
        // synth inherits the base record's l2SafeguardRequired/l2SafeguardLine, so a flagged
        // record's override is guarded on every column; an unflagged override must carry no
        // un-guarded sensitive-action trigger in its beginner options.
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

describe('class-1 beginner overrides — engine serves them for the beginner register', () => {
  it('composeAdvisory serves the beginner override option when register=beginner, base otherwise', async () => {
    const rec = CLASS1_RECORDS.find((r) => r.signalType === 'IDEA_TO_PRD')!;
    const beg = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 1, register: 'beginner' }, mockClient(JSON.stringify({ whyDesc: 'w' })));
    const base = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 1 }, mockClient(JSON.stringify({ whyDesc: 'w' })));
    expect(beg?.option).toBe(resolveRegisterForms(rec, 'beginner')[1]!.cell.option);
    expect(base?.option).toBe(rec.levelForms[1]!.cell.option);
    expect(beg?.option).not.toBe(base?.option);
  });

  it('a flagged record appends its l2SafeguardLine to the beginner variant too (L2 per variant)', async () => {
    for (const sig of ['REVIEW_TO_RELEASE', 'RELEASE_TO_FEEDBACK']) {
      const rec = CLASS1_RECORDS.find((r) => r.signalType === sig)!;
      expect(rec.l2SafeguardRequired).toBe(true);
      for (const lvl of [1, 3, 5] as const) {
        const out = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: lvl, register: 'beginner' }, mockClient(JSON.stringify({ whyDesc: 'woven' })));
        expect(out?.whyDesc).toContain(rec.l2SafeguardLine!);
      }
    }
  });
});
