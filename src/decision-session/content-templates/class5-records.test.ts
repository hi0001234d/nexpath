import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CLASS5_RECORDS, SESSION_QUALITY_PARAM_AXES } from './class5-records.js';
import {
  runBuildGate, checkTopicKeyword, checkOptionLengthBudget, coverageMetric, SHIPPED_CONTENT_TEMPLATES,
} from '../content-template-tooling.js';
import { reviewRecord, checkVoice, checkEscalation, checkL2Safeguard } from '../content-authoring-rules.js';
import {
  ABSENCE_COMPREHENSION, ABSENCE_NO_PUSHBACK, ABSENCE_CONTEXT_LOSS,
  ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL, ABSENCE_WORK_RHYTHM_CHECK_FORMAL,
  ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL, ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL,
  ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL,
} from './class5-session-quality.js';
import type { DecisionContent } from '../options.js';

/** signalType → its own keyword (retained in every option + authored why-desc). */
const KEYWORDS: Record<string, string> = {
  ABSENCE_COMPREHENSION: 'comprehension',
  ABSENCE_NO_PUSHBACK: 'question',
  ABSENCE_CONTEXT_LOSS: 'state',
  ABSENCE_DECISION_FATIGUE_PATTERN: 'review',
  ABSENCE_WORK_RHYTHM_CHECK: 'verif',
  ABSENCE_FOCUS_DRIFT_DETECTION: 'concern',
  ABSENCE_SESSION_LENGTH_CHECKPOINT: 'session',
  ABSENCE_PROGRESS_CONSOLIDATION_GAP: 'document',
};

/** signalType → the frozen DecisionContent whose L1[0] is the col-3 anchor (the formal variant). */
const FROZEN: Record<string, DecisionContent> = {
  ABSENCE_COMPREHENSION, ABSENCE_NO_PUSHBACK, ABSENCE_CONTEXT_LOSS,
  ABSENCE_DECISION_FATIGUE_PATTERN: ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL,
  ABSENCE_WORK_RHYTHM_CHECK: ABSENCE_WORK_RHYTHM_CHECK_FORMAL,
  ABSENCE_FOCUS_DRIFT_DETECTION: ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL,
  ABSENCE_SESSION_LENGTH_CHECKPOINT: ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL,
  ABSENCE_PROGRESS_CONSOLIDATION_GAP: ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL,
};

/** Author-declared practice-richness weights (escalation input; named-practice judgment is human-review). */
const PRACTICE_WEIGHTS: Record<string, readonly number[]> = Object.fromEntries(
  Object.keys(KEYWORDS).map((s) => [s, [1, 2, 3, 4, 5]]),
);

/**
 * Only the two pure pacing/sequencing habits stay behavioural (no artifact at col-5).
 * The other six produce a written record: the three session-capture signals and the
 * three verification-of-output signals (whose heaviest form, like the verification
 * class, is a written review/critique/comprehension note).
 */
const BEHAVIOURAL = new Set([
  'ABSENCE_WORK_RHYTHM_CHECK', 'ABSENCE_FOCUS_DRIFT_DETECTION',
]);

const FILE_RE = /\b(files?|runbooks?|notes?|docs?|readme|plans?)\b/i;

describe('class-5 — set-level', () => {
  it('covers the 8 session-quality signals (all formal-headline)', () => {
    expect(new Set(CLASS5_RECORDS.map((r) => r.signalType)).size).toBe(8);
  });
  it('the whole class passes the build gate (schema + level-1 floor)', () => {
    expect(runBuildGate(CLASS5_RECORDS).ok).toBe(true);
  });
});

describe('class-5 — per-record full-depth gates', () => {
  for (const r of CLASS5_RECORDS) {
    describe(r.signalType, () => {
      const kw = KEYWORDS[r.signalType];

      it('authors all 5 maturity columns', () => {
        expect(Object.keys(r.levelForms).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
      });

      it('is de-jargon clean in authored columns (col-3 frozen exempt), headline-only, full coverage', () => {
        const review = reviewRecord(r, kw);
        const jargon = { ...review.jargonByLevel };
        delete jargon[3];
        expect(jargon).toEqual({});
        expect(review.headlineOnly.ok).toBe(true);
        expect(review.coverage.ok).toBe(true);
      });

      it('column 3 is the frozen shipped text verbatim (option + a real frozen core line)', () => {
        const frozen = FROZEN[r.signalType];
        const col3 = r.levelForms[3]!.cell;
        expect(col3.option).toBe(frozen.L1[0].option);
        expect(frozen.L1[0].descBase).toContain(col3.whyDesc);
      });

      it('keeps its keyword in every option and every authored why-desc (col-3 frozen core exempt)', () => {
        const res = checkTopicKeyword(r, kw);
        expect(res.missingInOption).toEqual([]);
        expect(res.missingInWhyDesc.filter((l) => l !== 3)).toEqual([]);
      });

      it('practice richness is monotonic for THIS record (author-declared)', () => {
        expect(PRACTICE_WEIGHTS[r.signalType]).toBeDefined();
        expect(checkEscalation(PRACTICE_WEIGHTS[r.signalType]).ok).toBe(true);
      });

      it('declares the grounded param axes; session-meta family carries no spine', () => {
        expect(r.paramAxes).toBeDefined();
        expect(r.paramAxes).toEqual(SESSION_QUALITY_PARAM_AXES);
        expect(r.spine).toBeUndefined();
      });

      it('fits the copy-paste budget, col-1 ≤ col-5, voice-clean', () => {
        expect(checkOptionLengthBudget(r).overLevels).toEqual([]);
        expect(r.levelForms[1]!.cell.option.length).toBeLessThanOrEqual(r.levelForms[5]!.cell.option.length);
        expect(checkVoice(r).ok).toBe(true);
      });

      it('heaviest column: written artifact for capture signals, behavioural for discipline signals', () => {
        const col5 = r.levelForms[5]!.cell.option;
        if (BEHAVIOURAL.has(r.signalType)) expect(col5).not.toMatch(FILE_RE);
        else expect(col5).toMatch(FILE_RE);
      });
    });
  }
});

describe('class-5 — sensitive-action safeguard (none: session-quality is meta-cognitive)', () => {
  it('no class-5 record is flagged intrinsically sensitive', () => {
    expect(CLASS5_RECORDS.filter((r) => r.l2SafeguardRequired).map((r) => r.signalType)).toEqual([]);
  });
  it('no class-5 form trips the sensitive-action proxy (no sensitive action in the class)', () => {
    const flagged = CLASS5_RECORDS.filter((r) => !checkL2Safeguard(r).ok).map((r) => r.signalType);
    expect(flagged).toEqual([]);
  });
});

describe('class-5 — record↔runtime boundary (stored cells are bare core lines)', () => {
  const PLACEHOLDER = /\{[R{]/;
  for (const r of CLASS5_RECORDS) {
    it(`${r.signalType} — no {R...} / {{...}} token in any stored option or whyDesc`, () => {
      for (const lvl of [1, 2, 3, 4, 5] as const) {
        const cell = r.levelForms[lvl]?.cell;
        if (!cell) continue;
        expect(cell.option).not.toMatch(PLACEHOLDER);
        expect(cell.whyDesc).not.toMatch(PLACEHOLDER);
      }
    });
  }
});

describe('class-5 — partition parity + registration (against the source of truth)', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  function canonicalClass5SignalTypes(): string[] {
    const src = readFileSync(join(HERE, '..', 'why-help-by-signal-type.ts'), 'utf-8');
    const re = /(\w+):\s*WHY_HELP_PER_CLASS\.(\w+)/g;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) if (m[2] === 'class5_session_quality') out.push(m[1]);
    return out;
  }

  const canonical = canonicalClass5SignalTypes();
  const recordSigs = CLASS5_RECORDS.map((r) => r.signalType);

  it('the partition assigns exactly 8 signalTypes to class 5', () => {
    expect(canonical.length).toBe(8);
    expect(new Set(canonical).size).toBe(8);
  });

  it('the shipped records cover the canonical 8 exactly — none missing, none extra, no duplicates', () => {
    const cs = new Set(canonical);
    const rs = new Set(recordSigs);
    expect(canonical.filter((s) => !rs.has(s))).toEqual([]);
    expect(recordSigs.filter((s) => !cs.has(s))).toEqual([]);
    expect(recordSigs.filter((s, i) => recordSigs.indexOf(s) !== i)).toEqual([]);
    expect(recordSigs.length).toBe(8);
  });

  it('every class-5 record is registered in the live shipped registry', () => {
    const shipped = new Set(SHIPPED_CONTENT_TEMPLATES.map((r) => r.signalType));
    expect(recordSigs.filter((s) => !shipped.has(s))).toEqual([]);
  });

  it('soft coverage — the whole class is all-5-columns, zero thin', () => {
    const cov = coverageMetric(CLASS5_RECORDS);
    expect(cov.total).toBe(8);
    expect(cov.allLevels).toBe(8);
    expect(cov.thin).toBe(0);
  });
});
