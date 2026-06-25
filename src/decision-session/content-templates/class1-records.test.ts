import { describe, it, expect } from 'vitest';
import { CLASS1_RECORDS } from './class1-records.js';
import { runBuildGate, checkTopicKeyword } from '../content-template-tooling.js';
import { reviewRecord, checkVoice, checkL2Safeguard, checkEscalation } from '../content-authoring-rules.js';
import {
  IDEA_TO_PRD, PRD_TO_ARCHITECTURE, ARCHITECTURE_TO_TASKS, TASK_REVIEW,
  IMPLEMENTATION_TO_REVIEW, REVIEW_TO_RELEASE, RELEASE_TO_FEEDBACK,
} from './class1-stage-transition.js';
import type { DecisionContent } from '../options.js';

/** signalType → the frozen DecisionContent whose L1[0] is the col-3 anchor (F3). */
const FROZEN: Record<string, DecisionContent> = {
  IDEA_TO_PRD, PRD_TO_ARCHITECTURE, ARCHITECTURE_TO_TASKS, TASK_REVIEW,
  IMPLEMENTATION_TO_REVIEW, REVIEW_TO_RELEASE, RELEASE_TO_FEEDBACK,
};

/** Per-column practice-richness weights (author-supplied; the I2 monotonicity check). */
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
      it('is de-jargon clean and headline-only with full coverage', () => {
        const review = reviewRecord(r, KEYWORDS[r.signalType]);
        expect(review.jargonByLevel).toEqual({});
        expect(review.headlineOnly.ok).toBe(true);
        expect(review.coverage.ok).toBe(true);
      });

      it('F3 — col-3 is the frozen text verbatim (option + a real frozen core line)', () => {
        const frozen = FROZEN[r.signalType];
        const col3 = r.levelForms[3]!.cell;
        expect(col3.option).toBe(frozen.L1[0].option);              // verbatim anchor
        expect(frozen.L1[0].descBase).toContain(col3.whyDesc);       // a real frozen core line, not invented
      });

      it('T1 — keyword in every column option, and in every AUTHORED why-desc (col-3 frozen core exempt)', () => {
        const res = checkTopicKeyword(r, KEYWORDS[r.signalType]);
        expect(res.missingInOption).toEqual([]);
        // The why-desc keyword must hold for the authored columns (1,2,4,5); the
        // frozen col-3 core may legitimately lack the literal keyword (proxy limit).
        expect(res.missingInWhyDesc.filter((l) => l !== 3)).toEqual([]);
      });

      it('I2 — practice richness is monotonic across columns 1→5', () => {
        expect(checkEscalation(PRACTICE_WEIGHTS[r.signalType]).ok).toBe(true);
      });

      it('is voice-clean', () => {
        expect(checkVoice(r).ok).toBe(true);
      });
    });
  }
});

describe('class-1 records — L2 sensitive-action safeguard (substantive)', () => {
  // The L2 authoring gate is a keyword-proxy review aid (a stage keyword like
  // "release"/"production" trips it even on a pre-release CHECK). The substantive
  // requirement is that a form which genuinely proposes a sensitive ACTION carries
  // the confirm-seek — here, only REVIEW_TO_RELEASE col-5 (production rollout).
  const release = CLASS1_RECORDS.find((r) => r.signalType === 'REVIEW_TO_RELEASE');

  it('the production-rollout form (col-5) carries an explicit confirm-seek', () => {
    const cell = release?.levelForms[5]?.cell;
    expect(cell?.option).toMatch(/ask me for go-ahead/i);
    expect(cell?.whyDesc).toMatch(/confirm with me/i);
  });

  it('the gate surfaces that rollout form as a sensitive candidate', () => {
    expect(checkL2Safeguard(release!).unguardedLevels).not.toContain(5); // col-5 IS guarded
  });
});
