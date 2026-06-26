import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import { CLASS5_RECORDS } from './class5-records.js';
import { resolveRegisterForms, composeAdvisory, type RecordCandidateLookup } from '../content-template-engine.js';
import { reviewRecord, checkVoice, checkEscalation, checkL2Safeguard } from '../content-authoring-rules.js';
import { checkTopicKeyword, checkOptionLengthBudget } from '../content-template-tooling.js';
import { validateContentTemplateRecord, type ContentTemplateRecord } from '../content-template-schema.js';
import {
  ABSENCE_COMPREHENSION_BEGINNER, ABSENCE_NO_PUSHBACK_BEGINNER, ABSENCE_CONTEXT_LOSS_BEGINNER,
  ABSENCE_DECISION_FATIGUE_PATTERN_BEGINNER, ABSENCE_WORK_RHYTHM_CHECK_BEGINNER,
  ABSENCE_FOCUS_DRIFT_DETECTION_BEGINNER, ABSENCE_SESSION_LENGTH_CHECKPOINT_BEGINNER,
  ABSENCE_PROGRESS_CONSOLIDATION_GAP_BEGINNER,
} from './class5-session-quality.js';
import type { DecisionContent } from '../options.js';

function mockClient(reply: string): OpenAI {
  return { chat: { completions: { create: async () => ({ choices: [{ message: { content: reply } }] }) } } } as unknown as OpenAI;
}
function lookupOf(map: Partial<Record<string, unknown>>): RecordCandidateLookup {
  return (source) => map[source];
}

/** Each beginner variant's OWN plain keyword (present in the frozen col-3, avoids the base keyword). */
const BEGINNER_KEYWORD: Record<string, string> = {
  ABSENCE_COMPREHENSION: 'understand',
  ABSENCE_NO_PUSHBACK: 'suggestion',
  ABSENCE_CONTEXT_LOSS: 'track',
  ABSENCE_DECISION_FATIGUE_PATTERN: 'check',
  ABSENCE_WORK_RHYTHM_CHECK: 'read',
  ABSENCE_FOCUS_DRIFT_DETECTION: 'finish',
  ABSENCE_SESSION_LENGTH_CHECKPOINT: 'session',
  ABSENCE_PROGRESS_CONSOLIDATION_GAP: 'note',
};

const FROZEN_BEGINNER: Record<string, DecisionContent> = {
  ABSENCE_COMPREHENSION: ABSENCE_COMPREHENSION_BEGINNER,
  ABSENCE_NO_PUSHBACK: ABSENCE_NO_PUSHBACK_BEGINNER,
  ABSENCE_CONTEXT_LOSS: ABSENCE_CONTEXT_LOSS_BEGINNER,
  ABSENCE_DECISION_FATIGUE_PATTERN: ABSENCE_DECISION_FATIGUE_PATTERN_BEGINNER,
  ABSENCE_WORK_RHYTHM_CHECK: ABSENCE_WORK_RHYTHM_CHECK_BEGINNER,
  ABSENCE_FOCUS_DRIFT_DETECTION: ABSENCE_FOCUS_DRIFT_DETECTION_BEGINNER,
  ABSENCE_SESSION_LENGTH_CHECKPOINT: ABSENCE_SESSION_LENGTH_CHECKPOINT_BEGINNER,
  ABSENCE_PROGRESS_CONSOLIDATION_GAP: ABSENCE_PROGRESS_CONSOLIDATION_GAP_BEGINNER,
};

/** The two pure pacing/sequencing habits stay behavioural at col-5; the other six yield a file. */
const BEHAVIOURAL = new Set(['ABSENCE_WORK_RHYTHM_CHECK', 'ABSENCE_FOCUS_DRIFT_DETECTION']);
const FILE_RE = /\b(files?|runbooks?|notes?|docs?|readme|plans?)\b/i;

const WITH_OVERRIDE = Object.keys(BEGINNER_KEYWORD);

function asOverrideRecord(r: ContentTemplateRecord): ContentTemplateRecord {
  return { ...r, levelForms: resolveRegisterForms(r, 'beginner') };
}

describe('class-5 beginner overrides — set level', () => {
  it('all 8 session-quality signals carry a structurally-divergent beginner override', () => {
    const withOverride = CLASS5_RECORDS.filter((r) => r.registerOverrides?.beginner?.divergence === 'structurally-divergent').map((r) => r.signalType);
    expect(withOverride.sort()).toEqual([...WITH_OVERRIDE].sort());
  });
});

describe('class-5 beginner overrides — per-variant T1-variant gates', () => {
  for (const r of CLASS5_RECORDS) {
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

      it('the override forms trip no sensitive-action proxy (class 5 is meta-cognitive, not sensitive)', () => {
        expect(r.l2SafeguardRequired).toBeUndefined();
        expect(checkL2Safeguard(synth).ok).toBe(true);
      });

      it("the heaviest column matches the base record's nature (file vs behavioural) — F2 parity", () => {
        const begCol5 = synth.levelForms[5]!.cell.option;
        const baseCol5 = r.levelForms[5]!.cell.option;
        // Capture signals produce a written record; pure pacing/sequencing habits stay behavioural.
        if (BEHAVIOURAL.has(r.signalType)) expect(begCol5).not.toMatch(FILE_RE);
        else expect(begCol5).toMatch(FILE_RE);
        // …and the override never flips the base record's nature.
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

describe('class-5 beginner overrides — engine serves them for the beginner register', () => {
  it('composeAdvisory serves the beginner override option when register=beginner, base otherwise', async () => {
    const rec = CLASS5_RECORDS.find((r) => r.signalType === 'ABSENCE_COMPREHENSION')!;
    const beg = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 1, register: 'beginner' }, mockClient(JSON.stringify({ whyDesc: 'w' })));
    const base = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 1 }, mockClient(JSON.stringify({ whyDesc: 'w' })));
    expect(beg?.option).toBe(resolveRegisterForms(rec, 'beginner')[1]!.cell.option);
    expect(base?.option).toBe(rec.levelForms[1]!.cell.option);
    expect(beg?.option).not.toBe(base?.option);
  });
});
