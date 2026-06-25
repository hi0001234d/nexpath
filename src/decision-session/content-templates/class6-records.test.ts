import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CLASS6_RECORDS, PLANNING_PARAM_AXES } from './class6-records.js';
import {
  runBuildGate, checkTopicKeyword, checkOptionLengthBudget, coverageMetric, SHIPPED_CONTENT_TEMPLATES,
} from '../content-template-tooling.js';
import { reviewRecord, checkVoice, checkEscalation, checkL2Safeguard } from '../content-authoring-rules.js';
import {
  ABSENCE_PHASE_TRANSITION, ABSENCE_IDEA_SCOPING, ABSENCE_IDEA_CONSTRAINT_CHECK, ABSENCE_IDEA_USER_DEFINITION,
  ABSENCE_TASK_ORDERING, ABSENCE_TASK_SIZING, ABSENCE_TASK_DEFINITION_OF_DONE, ABSENCE_USER_FEEDBACK_REVIEW,
  ABSENCE_ITERATION_PLANNING, ABSENCE_SCOPE_CREEP, ABSENCE_FEATURE_SCOPE, ABSENCE_IMPLEMENTATION_CHECKPOINT,
  ABSENCE_SPEC_BEFORE_CODE, ABSENCE_INCREMENTAL_BUILD,
} from './class6-planning-idea-task.js';
import type { DecisionContent } from '../options.js';

/** signalType → its own keyword (retained in every option + authored why-desc). */
const KEYWORDS: Record<string, string> = {
  ABSENCE_PHASE_TRANSITION: 'transition',
  ABSENCE_IDEA_SCOPING: 'scope',
  ABSENCE_IDEA_CONSTRAINT_CHECK: 'constraint',
  ABSENCE_IDEA_USER_DEFINITION: 'user',
  ABSENCE_TASK_ORDERING: 'order',
  ABSENCE_TASK_SIZING: 'siz',
  ABSENCE_TASK_DEFINITION_OF_DONE: 'complet',
  ABSENCE_USER_FEEDBACK_REVIEW: 'feedback',
  ABSENCE_ITERATION_PLANNING: 'iteration',
  ABSENCE_SCOPE_CREEP: 'scope',
  ABSENCE_FEATURE_SCOPE: 'feature',
  ABSENCE_IMPLEMENTATION_CHECKPOINT: 'checkpoint',
  ABSENCE_SPEC_BEFORE_CODE: 'spec',
  ABSENCE_INCREMENTAL_BUILD: 'increment',
};

/** signalType → the frozen DecisionContent whose L1[0] is the col-3 anchor (the formal variant). */
const FROZEN: Record<string, DecisionContent> = {
  ABSENCE_PHASE_TRANSITION, ABSENCE_IDEA_SCOPING, ABSENCE_IDEA_CONSTRAINT_CHECK, ABSENCE_IDEA_USER_DEFINITION,
  ABSENCE_TASK_ORDERING, ABSENCE_TASK_SIZING, ABSENCE_TASK_DEFINITION_OF_DONE, ABSENCE_USER_FEEDBACK_REVIEW,
  ABSENCE_ITERATION_PLANNING, ABSENCE_SCOPE_CREEP, ABSENCE_FEATURE_SCOPE, ABSENCE_IMPLEMENTATION_CHECKPOINT,
  ABSENCE_SPEC_BEFORE_CODE, ABSENCE_INCREMENTAL_BUILD,
};

/** Author-declared practice-richness weights (escalation input; named-practice judgment is human-review). */
const PRACTICE_WEIGHTS: Record<string, readonly number[]> = Object.fromEntries(
  Object.keys(KEYWORDS).map((s) => [s, [1, 2, 3, 4, 5]]),
);

/**
 * The two verification cadences are behavioural — their heaviest column stays a
 * behaviour (no file). The other twelve planning signals produce a written record.
 */
const BEHAVIOURAL = new Set(['ABSENCE_IMPLEMENTATION_CHECKPOINT', 'ABSENCE_INCREMENTAL_BUILD']);

const FILE_RE = /\b(files?|runbooks?|notes?|docs?|readme|plans?)\b/i;

describe('class-6 — set-level', () => {
  it('covers the 14 planning/idea/task signals (all formal-headline)', () => {
    expect(new Set(CLASS6_RECORDS.map((r) => r.signalType)).size).toBe(14);
  });
  it('the whole class passes the build gate (schema + level-1 floor)', () => {
    expect(runBuildGate(CLASS6_RECORDS).ok).toBe(true);
  });
});

describe('class-6 — per-record full-depth gates', () => {
  for (const r of CLASS6_RECORDS) {
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

      it('declares the grounded param axes; planning family carries no spine', () => {
        expect(r.paramAxes).toBeDefined();
        expect(r.paramAxes).toEqual(PLANNING_PARAM_AXES);
        expect(r.spine).toBeUndefined();
      });

      it('fits the copy-paste budget, col-1 ≤ col-5, voice-clean', () => {
        expect(checkOptionLengthBudget(r).overLevels).toEqual([]);
        expect(r.levelForms[1]!.cell.option.length).toBeLessThanOrEqual(r.levelForms[5]!.cell.option.length);
        expect(checkVoice(r).ok).toBe(true);
      });

      it('heaviest column: written artifact for planning signals, behavioural for the verification cadences', () => {
        const col5 = r.levelForms[5]!.cell.option;
        if (BEHAVIOURAL.has(r.signalType)) expect(col5).not.toMatch(FILE_RE);
        else expect(col5).toMatch(FILE_RE);
      });
    });
  }
});

describe('class-6 — sensitive-action safeguard (none: planning is not an ops action)', () => {
  it('no class-6 record is flagged intrinsically sensitive', () => {
    expect(CLASS6_RECORDS.filter((r) => r.l2SafeguardRequired).map((r) => r.signalType)).toEqual([]);
  });
  it('no class-6 form trips the sensitive-action proxy', () => {
    const flagged = CLASS6_RECORDS.filter((r) => !checkL2Safeguard(r).ok).map((r) => r.signalType);
    expect(flagged).toEqual([]);
  });
});

describe('class-6 — record↔runtime boundary (stored cells are bare core lines)', () => {
  const PLACEHOLDER = /\{[R{]/;
  for (const r of CLASS6_RECORDS) {
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

describe('class-6 — partition parity + registration (against the source of truth)', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  function canonicalClass6SignalTypes(): string[] {
    const src = readFileSync(join(HERE, '..', 'why-help-by-signal-type.ts'), 'utf-8');
    const re = /(\w+):\s*WHY_HELP_PER_CLASS\.(\w+)/g;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) if (m[2] === 'class6_planning_idea_task') out.push(m[1]);
    return out;
  }

  const canonical = canonicalClass6SignalTypes();
  const recordSigs = CLASS6_RECORDS.map((r) => r.signalType);

  it('the partition assigns exactly 14 signalTypes to class 6', () => {
    expect(canonical.length).toBe(14);
    expect(new Set(canonical).size).toBe(14);
  });

  it('the shipped records cover the canonical 14 exactly — none missing, none extra, no duplicates', () => {
    const cs = new Set(canonical);
    const rs = new Set(recordSigs);
    expect(canonical.filter((s) => !rs.has(s))).toEqual([]);
    expect(recordSigs.filter((s) => !cs.has(s))).toEqual([]);
    expect(recordSigs.filter((s, i) => recordSigs.indexOf(s) !== i)).toEqual([]);
    expect(recordSigs.length).toBe(14);
  });

  it('every class-6 record is registered in the live shipped registry', () => {
    const shipped = new Set(SHIPPED_CONTENT_TEMPLATES.map((r) => r.signalType));
    expect(recordSigs.filter((s) => !shipped.has(s))).toEqual([]);
  });

  it('soft coverage — the whole class is all-5-columns, zero thin', () => {
    const cov = coverageMetric(CLASS6_RECORDS);
    expect(cov.total).toBe(14);
    expect(cov.allLevels).toBe(14);
    expect(cov.thin).toBe(0);
  });
});
