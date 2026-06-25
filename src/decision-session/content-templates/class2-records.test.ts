import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CLASS2_RECORDS_BATCH_A, CLASS2_RECORDS, VERIFICATION_PARAM_AXES } from './class2-records.js';
import {
  runBuildGate, checkTopicKeyword, checkOptionLengthBudget, coverageMetric, SHIPPED_CONTENT_TEMPLATES,
} from '../content-template-tooling.js';
import { reviewRecord, checkVoice, checkEscalation, checkL2Safeguard } from '../content-authoring-rules.js';
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

      it('declares grounded param axes (defined, non-empty, valid AR-1 tags) + a spine', () => {
        expect(r.paramAxes).toBeDefined();                                    // not vacuous: a missing axes block must fail
        expect(Object.keys(r.paramAxes ?? {}).length).toBeGreaterThan(0);
        expect(r.paramAxes).toEqual(VERIFICATION_PARAM_AXES);                 // the class's grounded axes, pinned
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

describe('class-2 — L2 sensitive-action safeguard (whole-class review, batch A + B)', () => {
  // Class 2 is verification-quality: every form proposes a REVIEW / CHECK /
  // WRITE-A-NOTE action — none proposes a genuinely sensitive ACTION (a deploy,
  // a destructive fs op, a schema migration, a secret write, a force-push). The
  // L2 keyword-proxy over-flags stage NOUNS; the substantive requirement is that
  // ONLY a genuinely-sensitive form carries the confirm-seek — here, none do, so
  // the one proxy hit must be a false-positive, not a missing safeguard.
  const flagged = CLASS2_RECORDS
    .map((r) => ({ signalType: r.signalType, review: checkL2Safeguard(r) }))
    .filter((x) => !x.review.ok);

  it('the proxy flags only the single stage-noun false-positive in the class', () => {
    expect(flagged.map((x) => x.signalType)).toEqual(['ABSENCE_CORRECTION_SEEKING']);
    expect(flagged[0]!.review.unguardedLevels).toEqual([5]);
  });

  it('that flagged form is a note-writing action — the stage noun is analytical, no confirm-seek owed', () => {
    const rec = CLASS2_RECORDS.find((r) => r.signalType === 'ABSENCE_CORRECTION_SEEKING')!;
    const col5 = rec.levelForms[5]!.cell.option;
    expect(col5).toMatch(/write a failure-analysis note/i);                          // the ACTION is "write a note"
    expect(col5).toMatch(/production failure modes/i);                               // the trigger noun is analytical
    expect(col5).not.toMatch(/\b(deploy|roll ?out|ship to production|push to production)\b/i); // not a prod ACTION
  });
});

describe('class-2 — partition parity + registration (against the source of truth, not self-defined keys)', () => {
  // The canonical class-2 membership is the why-help partition map (the same
  // source `content-split.test.ts` uses), NOT the keyword table in this file —
  // so a missing / extra / mistyped record signalType is caught against the
  // real partition, closing the self-referential hole in the set-level checks.
  const HERE = dirname(fileURLToPath(import.meta.url));
  function canonicalClass2SignalTypes(): string[] {
    const src = readFileSync(join(HERE, '..', 'why-help-by-signal-type.ts'), 'utf-8');
    const re = /(\w+):\s*WHY_HELP_PER_CLASS\.(\w+)/g;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) if (m[2] === 'class2_verification_quality') out.push(m[1]);
    return out;
  }

  const canonical = canonicalClass2SignalTypes();
  const recordSigs = CLASS2_RECORDS.map((r) => r.signalType);

  it('the partition assigns exactly 21 signalTypes to class 2 (matches content-split EXPECTED)', () => {
    expect(canonical.length).toBe(21);
    expect(new Set(canonical).size).toBe(21);
  });

  it('the shipped records cover the canonical 21 exactly — none missing, none extra, no duplicates', () => {
    const cs = new Set(canonical);
    const rs = new Set(recordSigs);
    expect(canonical.filter((s) => !rs.has(s))).toEqual([]);          // nothing in the partition lacks a record
    expect(recordSigs.filter((s) => !cs.has(s))).toEqual([]);          // no record outside the partition
    expect(recordSigs.filter((s, i) => recordSigs.indexOf(s) !== i)).toEqual([]); // no dup record
    expect(recordSigs.length).toBe(21);
  });

  it('every class-2 record is registered in the live shipped registry', () => {
    const shipped = new Set(SHIPPED_CONTENT_TEMPLATES.map((r) => r.signalType));
    expect(recordSigs.filter((s) => !shipped.has(s))).toEqual([]);
  });

  it('T3-metric (soft coverage) — the whole class is all-5-columns, zero thin', () => {
    const cov = coverageMetric(CLASS2_RECORDS);
    expect(cov.total).toBe(21);
    expect(cov.allLevels).toBe(21);
    expect(cov.thin).toBe(0);
    expect(cov.allLevelsPct).toBe(1);   // ≥ 0.60–0.70 plan floor, in fact 100%
    expect(cov.thinPct).toBe(0);        // < 0.50 plan ceiling
  });
});
