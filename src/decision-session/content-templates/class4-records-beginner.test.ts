import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import { CLASS4_RECORDS } from './class4-records.js';
import { resolveRegisterForms, composeAdvisory, type RecordCandidateLookup } from '../content-template-engine.js';
import { reviewRecord, checkVoice, checkEscalation, checkL2Safeguard } from '../content-authoring-rules.js';
import { checkTopicKeyword, checkOptionLengthBudget } from '../content-template-tooling.js';
import { validateContentTemplateRecord, type ContentTemplateRecord } from '../content-template-schema.js';
import {
  ABSENCE_OBSERVABILITY_BEGINNER, ABSENCE_ROLLBACK_PLANNING_BEGINNER, ABSENCE_DEPLOYMENT_PLANNING_BEGINNER,
  ABSENCE_DEPENDENCY_MGMT_BEGINNER, ABSENCE_ENV_AND_SECRETS_BEGINNER, ABSENCE_CI_PIPELINE_BEGINNER,
  ABSENCE_RATE_LIMITING_BEGINNER,
} from './class4-release-observability-infra.js';
import type { DecisionContent } from '../options.js';

function mockClient(reply: string): OpenAI {
  return { chat: { completions: { create: async () => ({ choices: [{ message: { content: reply } }] }) } } } as unknown as OpenAI;
}
function lookupOf(map: Partial<Record<string, unknown>>): RecordCandidateLookup {
  return (source) => map[source];
}

/** Each beginner variant's OWN plain keyword (present in the frozen col-3, avoids the base jargon). */
const BEGINNER_KEYWORD: Record<string, string> = {
  ABSENCE_OBSERVABILITY: 'log',
  ABSENCE_ROLLBACK_PLANNING: 'undo',
  ABSENCE_DEPLOYMENT_PLANNING: 'live',
  ABSENCE_DEPENDENCY_MGMT: 'package',
  ABSENCE_ENV_AND_SECRETS: 'secret',
  ABSENCE_CI_PIPELINE: 'test',
  ABSENCE_RATE_LIMITING: 'limit',
};

const FROZEN_BEGINNER: Record<string, DecisionContent> = {
  ABSENCE_OBSERVABILITY: ABSENCE_OBSERVABILITY_BEGINNER,
  ABSENCE_ROLLBACK_PLANNING: ABSENCE_ROLLBACK_PLANNING_BEGINNER,
  ABSENCE_DEPLOYMENT_PLANNING: ABSENCE_DEPLOYMENT_PLANNING_BEGINNER,
  ABSENCE_DEPENDENCY_MGMT: ABSENCE_DEPENDENCY_MGMT_BEGINNER,
  ABSENCE_ENV_AND_SECRETS: ABSENCE_ENV_AND_SECRETS_BEGINNER,
  ABSENCE_CI_PIPELINE: ABSENCE_CI_PIPELINE_BEGINNER,
  ABSENCE_RATE_LIMITING: ABSENCE_RATE_LIMITING_BEGINNER,
};

const WITH_OVERRIDE = Object.keys(BEGINNER_KEYWORD);

function asOverrideRecord(r: ContentTemplateRecord): ContentTemplateRecord {
  return { ...r, levelForms: resolveRegisterForms(r, 'beginner') };
}

/**
 * Whether a heaviest-column option is a BEHAVIOURAL standing practice (vs producing a
 * written record). Every class-4 signal yields a file at col-5, so each beginner override
 * must be file too — `isBehavioural` must be false for all of them (F2 parity).
 */
function isBehavioural(option: string): boolean {
  return /\b(habit|cadence|standing)\b/i.test(option);
}

describe('class-4 beginner overrides — set level', () => {
  it('exactly the 7 signals with a frozen beginner variant carry a structurally-divergent override', () => {
    const withOverride = CLASS4_RECORDS.filter((r) => r.registerOverrides?.beginner?.divergence === 'structurally-divergent').map((r) => r.signalType);
    expect(withOverride.sort()).toEqual([...WITH_OVERRIDE].sort());
  });
  it('the casual-only signal with no frozen beginner variant carries no override', () => {
    expect(CLASS4_RECORDS.find((r) => r.signalType === 'ABSENCE_DEPENDENCY_AUDIT_GAP')?.registerOverrides).toBeUndefined();
  });
});

describe('class-4 beginner overrides — per-variant T1-variant gates', () => {
  for (const r of CLASS4_RECORDS) {
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

      it('is L2-guarded: the override inherits the base sensitive flag + line, so every column is covered', () => {
        // Class 4 is the all-sensitive ops class: synth inherits l2SafeguardRequired +
        // l2SafeguardLine from the base record, so checkL2Safeguard treats every beginner
        // column (incl. the frozen col-3 anchor) as guarded.
        expect(r.l2SafeguardRequired).toBe(true);
        expect(checkL2Safeguard(synth).ok).toBe(true);
      });

      it("the heaviest column matches the base record's nature (file, not behaviour) — F2 parity", () => {
        // Every class-4 signal yields a written record at col-5, so both base and override
        // must be file (non-behavioural).
        expect(isBehavioural(synth.levelForms[5]!.cell.option)).toBe(false);
        expect(isBehavioural(synth.levelForms[5]!.cell.option)).toBe(isBehavioural(r.levelForms[5]!.cell.option));
      });

      it('practice richness is monotonic; fits the copy-paste budget (col-3 exempt), col-1 ≤ col-5', () => {
        expect(checkEscalation([1, 2, 3, 4, 5]).ok).toBe(true);
        expect(checkOptionLengthBudget(synth).overLevels.filter((l) => l !== 3)).toEqual([]);
        expect(synth.levelForms[1]!.cell.option.length).toBeLessThanOrEqual(synth.levelForms[5]!.cell.option.length);
      });
    });
  }
});

describe('class-4 beginner overrides — engine serves them for the beginner register', () => {
  it('composeAdvisory serves the beginner override option when register=beginner, base otherwise', async () => {
    const rec = CLASS4_RECORDS.find((r) => r.signalType === 'ABSENCE_OBSERVABILITY')!;
    const beg = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 1, register: 'beginner' }, mockClient(JSON.stringify({ whyDesc: 'w' })));
    const base = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: 1 }, mockClient(JSON.stringify({ whyDesc: 'w' })));
    expect(beg?.option).toBe(resolveRegisterForms(rec, 'beginner')[1]!.cell.option);
    expect(base?.option).toBe(rec.levelForms[1]!.cell.option);
    expect(beg?.option).not.toBe(base?.option);
  });

  it('every flagged record appends its action-specific l2SafeguardLine to the beginner variant too (L2 per variant)', async () => {
    for (const sig of WITH_OVERRIDE) {
      const rec = CLASS4_RECORDS.find((r) => r.signalType === sig)!;
      expect(rec.l2SafeguardRequired).toBe(true);
      for (const lvl of [1, 3, 5] as const) {
        const out = await composeAdvisory({ lookup: lookupOf({ shipped: rec }), level: lvl, register: 'beginner' }, mockClient(JSON.stringify({ whyDesc: 'woven' })));
        expect(out?.whyDesc).toContain(rec.l2SafeguardLine!);
      }
    }
  });
});
