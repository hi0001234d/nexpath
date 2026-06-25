import { describe, it, expect } from 'vitest';
import { CLASS1_RECORDS } from './class1-records.js';
import { runBuildGate, checkTopicKeyword, checkOptionLengthBudget, OPTION_MAX_CHARS } from '../content-template-tooling.js';
import { reviewRecord, checkVoice, checkL2Safeguard, checkEscalation } from '../content-authoring-rules.js';
import {
  IDEA_TO_PRD, PRD_TO_ARCHITECTURE, ARCHITECTURE_TO_TASKS, TASK_REVIEW,
  IMPLEMENTATION_TO_REVIEW, REVIEW_TO_RELEASE, RELEASE_TO_FEEDBACK,
} from './class1-stage-transition.js';
import type { DecisionContent } from '../options.js';

/** signalType → the frozen DecisionContent whose L1[0] is the col-3 anchor. */
const FROZEN: Record<string, DecisionContent> = {
  IDEA_TO_PRD, PRD_TO_ARCHITECTURE, ARCHITECTURE_TO_TASKS, TASK_REVIEW,
  IMPLEMENTATION_TO_REVIEW, REVIEW_TO_RELEASE, RELEASE_TO_FEEDBACK,
};

/** Per-column practice-richness weights (author-supplied; the escalation-monotonicity check). */
const PRACTICE_WEIGHTS: Record<string, readonly number[]> = {
  IDEA_TO_PRD: [1, 2, 3, 4, 5],
  PRD_TO_ARCHITECTURE: [1, 2, 3, 4, 5],
  ARCHITECTURE_TO_TASKS: [1, 2, 3, 4, 5],
  TASK_REVIEW: [1, 2, 3, 4, 5],
  IMPLEMENTATION_TO_REVIEW: [1, 2, 3, 4, 5],
  REVIEW_TO_RELEASE: [1, 2, 3, 4, 5],
  RELEASE_TO_FEEDBACK: [1, 2, 3, 4, 5],
};

/** signalType → its own keyword (retained across every authored column's option). */
const KEYWORDS: Record<string, string> = {
  IDEA_TO_PRD: 'PRD',
  PRD_TO_ARCHITECTURE: 'architecture',
  ARCHITECTURE_TO_TASKS: 'task',
  TASK_REVIEW: 'review',
  IMPLEMENTATION_TO_REVIEW: 'test',
  REVIEW_TO_RELEASE: 'release',
  RELEASE_TO_FEEDBACK: 'monitoring',
};

describe('class-1 records — set-level build gate', () => {
  it('covers all 7 stage-transition signalTypes', () => {
    expect(CLASS1_RECORDS.map((r) => r.signalType)).toEqual(Object.keys(KEYWORDS));
  });

  it('passes the build gate (schema + level-1 floor) for the whole class', () => {
    expect(runBuildGate(CLASS1_RECORDS).ok).toBe(true);
  });

  it('every record authors all 5 maturity columns', () => {
    for (const r of CLASS1_RECORDS) {
      expect(Object.keys(r.levelForms).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    }
  });
});

describe('class-1 records — per-record review gates', () => {
  for (const r of CLASS1_RECORDS) {
    describe(r.signalType, () => {
      it('is de-jargon clean in authored columns (col-3 frozen exempt), headline-only, fully covered', () => {
        const review = reviewRecord(r, KEYWORDS[r.signalType]);
        const jargon = { ...review.jargonByLevel };
        delete jargon[3]; // col-3 is frozen shipped text — not subject to the authoring de-jargon discipline
        expect(jargon).toEqual({});
        expect(review.headlineOnly.ok).toBe(true);
        expect(review.coverage.ok).toBe(true);
      });

      it('column 3 is the frozen text verbatim (option + a real frozen core line)', () => {
        const frozen = FROZEN[r.signalType];
        const col3 = r.levelForms[3]!.cell;
        expect(col3.option).toBe(frozen.L1[0].option);              // verbatim anchor
        expect(frozen.L1[0].descBase).toContain(col3.whyDesc);       // a real frozen core line, not invented
      });

      it('keeps its keyword in every column option, and in every AUTHORED why-desc (col-3 frozen core exempt)', () => {
        const res = checkTopicKeyword(r, KEYWORDS[r.signalType]);
        expect(res.missingInOption).toEqual([]);
        // The why-desc keyword must hold for the authored columns (1,2,4,5); the
        // frozen col-3 core may legitimately lack the literal keyword (proxy limit).
        expect(res.missingInWhyDesc.filter((l) => l !== 3)).toEqual([]);
      });

      it('practice richness is monotonic across columns 1→5', () => {
        expect(checkEscalation(PRACTICE_WEIGHTS[r.signalType]).ok).toBe(true);
      });

      it('declares the grounded param axes with valid representation tags', () => {
        expect(r.paramAxes).toBeDefined();
        const tags = Object.values(r.paramAxes ?? {});
        expect(tags.length).toBeGreaterThan(0);
        for (const t of tags) expect(['closed-ordinal', 'nominal', 'extensible', 'open']).toContain(t);
      });

      it('every option fits the copy-paste length budget, and col-1 ≤ col-5 (extremes strain)', () => {
        expect(checkOptionLengthBudget(r).overLevels).toEqual([]);
        expect(r.levelForms[1]!.cell.option.length).toBeLessThanOrEqual(r.levelForms[5]!.cell.option.length);
        expect(OPTION_MAX_CHARS).toBe(400);
      });

      it('is voice-clean', () => {
        expect(checkVoice(r).ok).toBe(true);
      });

      it('the heaviest column (col-5) yields a file/artifact (all class-1 families are artifact or mixed)', () => {
        expect(r.levelForms[5]!.cell.option).toMatch(/\b(files?|runbooks?|notes?|docs?|readme|plans?)\b/i);
      });
    });
  }
});

describe('class-1 records — spine (stored annotation)', () => {
  // Spine = the rhythm that intensifies across all columns. The planning and
  // verification families carry one; spec/design and ops/ship do not (each column
  // is its own stage practice).
  const SPINE_FAMILIES = new Set(['ARCHITECTURE_TO_TASKS', 'TASK_REVIEW', 'IMPLEMENTATION_TO_REVIEW']);

  for (const r of CLASS1_RECORDS) {
    it(`${r.signalType} declares a spine iff its family has one`, () => {
      if (SPINE_FAMILIES.has(r.signalType)) {
        expect(r.spine && r.spine.length).toBeGreaterThan(0);
      } else {
        expect(r.spine).toBeUndefined();
      }
    });
  }
});

describe('class-1 records — sensitive-action safeguard', () => {
  // The two production signals here — releasing to production, and changing
  // production monitoring — are intrinsically sensitive: they are flagged and carry
  // a confirm-seek in EVERY authored why-desc (col-3 frozen exempt). The other five
  // stage transitions (planning / spec / verification) propose no sensitive action,
  // so they are not flagged.
  const SENSITIVE = new Set(['REVIEW_TO_RELEASE', 'RELEASE_TO_FEEDBACK']);
  const SAFEGUARD_RE = /\b(ask me|go-ahead|go ahead|confirm)\b/i;

  for (const r of CLASS1_RECORDS) {
    it(`${r.signalType} is flagged sensitive iff it concerns a production action`, () => {
      expect(r.l2SafeguardRequired ?? false).toBe(SENSITIVE.has(r.signalType));
    });
  }

  for (const sig of SENSITIVE) {
    const rec = CLASS1_RECORDS.find((r) => r.signalType === sig)!;
    it(`${sig} carries a confirm-seek in every authored why-desc (1/2/4/5); col-3 frozen exempt`, () => {
      for (const lvl of [1, 2, 4, 5] as const) {
        expect(rec.levelForms[lvl]!.cell.whyDesc).toMatch(SAFEGUARD_RE);
      }
      expect(checkL2Safeguard(rec).unguardedLevels.filter((l) => l !== 3)).toEqual([]);
    });
  }

  it('the production-rollout form (REVIEW_TO_RELEASE col-5) carries the action-level confirm-seek in the option itself', () => {
    const cell = CLASS1_RECORDS.find((r) => r.signalType === 'REVIEW_TO_RELEASE')!.levelForms[5]!.cell;
    expect(cell.option).toMatch(/ask me for go-ahead/i); // the heaviest form proposes the deploy → safeguard in the option too
  });
});
