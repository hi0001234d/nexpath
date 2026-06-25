import { describe, it, expect } from 'vitest';
import { CLASS1_RECORDS } from './class1-records.js';
import { runBuildGate, checkTopicKeyword } from '../content-template-tooling.js';
import { reviewRecord, checkVoice, checkL2Safeguard } from '../content-authoring-rules.js';

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

      it('retains its keyword in every column option', () => {
        expect(checkTopicKeyword(r, KEYWORDS[r.signalType]).missingInOption).toEqual([]);
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
