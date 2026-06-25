import { describe, it, expect } from 'vitest';
import { CLASS2_RECORDS_BATCH_A } from './class2-records.js';
import { runBuildGate, checkTopicKeyword, checkOptionLengthBudget } from '../content-template-tooling.js';
import { reviewRecord, checkVoice, checkEscalation } from '../content-authoring-rules.js';
import {
  BEHAVIOUR_TESTING, ABSENCE_TEST_CREATION, ABSENCE_REGRESSION_CHECK, ABSENCE_SECURITY_CHECK,
  ABSENCE_ERROR_HANDLING, ABSENCE_DOCUMENTATION, ABSENCE_REFACTORING, ABSENCE_CORRECTION_SEEKING,
  ABSENCE_PROBLEM_CORRECTION, ABSENCE_ACCESSIBILITY, ABSENCE_DATA_VALIDATION,
} from './class2-verification-quality.js';
import type { DecisionContent } from '../options.js';

/** signalType → own keyword (retained across every authored column). */
const KEYWORDS: Record<string, string> = {
  BEHAVIOUR_TESTING: 'test',
  ABSENCE_TEST_CREATION: 'test',
  ABSENCE_REGRESSION_CHECK: 'regression',
  ABSENCE_SECURITY_CHECK: 'security',
  ABSENCE_ERROR_HANDLING: 'error',
  ABSENCE_DOCUMENTATION: 'document',
  ABSENCE_REFACTORING: 'refactor',
  ABSENCE_CORRECTION_SEEKING: 'review',
  ABSENCE_PROBLEM_CORRECTION: 'fix',
  ABSENCE_ACCESSIBILITY: 'accessible',
  ABSENCE_DATA_VALIDATION: 'validation',
};

/** signalType → frozen DecisionContent (col-3 anchor, F3). */
const FROZEN: Record<string, DecisionContent> = {
  BEHAVIOUR_TESTING, ABSENCE_TEST_CREATION, ABSENCE_REGRESSION_CHECK, ABSENCE_SECURITY_CHECK,
  ABSENCE_ERROR_HANDLING, ABSENCE_DOCUMENTATION, ABSENCE_REFACTORING, ABSENCE_CORRECTION_SEEKING,
  ABSENCE_PROBLEM_CORRECTION, ABSENCE_ACCESSIBILITY, ABSENCE_DATA_VALIDATION,
};

describe('class-2 batch A — set-level', () => {
  it('covers the 11 formal-base signalTypes', () => {
    expect(CLASS2_RECORDS_BATCH_A.map((r) => r.signalType)).toEqual(Object.keys(KEYWORDS));
  });
  it('passes the build gate (schema + level-1 floor)', () => {
    expect(runBuildGate(CLASS2_RECORDS_BATCH_A).ok).toBe(true);
  });
});

describe('class-2 batch A — per-record full-depth gates', () => {
  for (const r of CLASS2_RECORDS_BATCH_A) {
    describe(r.signalType, () => {
      const kw = KEYWORDS[r.signalType];

      it('authors all 5 maturity columns', () => {
        expect(Object.keys(r.levelForms).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
      });

      it('is de-jargon clean, headline-only, full coverage', () => {
        const review = reviewRecord(r, kw);
        expect(review.jargonByLevel).toEqual({});
        expect(review.headlineOnly.ok).toBe(true);
        expect(review.coverage.ok).toBe(true);
      });

      it('F3 — col-3 is the frozen text verbatim (option + a real frozen core line)', () => {
        const frozen = FROZEN[r.signalType];
        const col3 = r.levelForms[3]!.cell;
        expect(col3.option).toBe(frozen.L1[0].option);
        expect(frozen.L1[0].descBase).toContain(col3.whyDesc);
      });

      it('T1 — keyword in every option, and every AUTHORED why-desc (col-3 frozen exempt)', () => {
        const res = checkTopicKeyword(r, kw);
        expect(res.missingInOption).toEqual([]);
        expect(res.missingInWhyDesc.filter((l) => l !== 3)).toEqual([]);
      });

      it('I2 — practice richness monotonic', () => {
        expect(checkEscalation([1, 2, 3, 4, 5]).ok).toBe(true);
      });

      it('declares grounded param axes (valid AR-1 tags) + a spine', () => {
        expect(Object.values(r.paramAxes ?? {}).every((t) => ['closed-ordinal', 'nominal', 'extensible', 'open'].includes(t))).toBe(true);
        expect((r.spine ?? []).length).toBeGreaterThan(0);
      });

      it('fits the length budget, col-1 ≤ col-5, voice-clean', () => {
        expect(checkOptionLengthBudget(r).overLevels).toEqual([]);
        expect(r.levelForms[1]!.cell.option.length).toBeLessThanOrEqual(r.levelForms[5]!.cell.option.length);
        expect(checkVoice(r).ok).toBe(true);
      });

      it('F2 — col-5 yields a file/artifact', () => {
        expect(r.levelForms[5]!.cell.option).toMatch(/\b(files?|runbooks?|notes?|docs?|readme|plans?)\b/i);
      });
    });
  }
});
