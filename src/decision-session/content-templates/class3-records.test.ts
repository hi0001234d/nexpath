import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CLASS3_RECORDS, CLASS3_RECORDS_BATCH_A, CLASS3_RECORDS_BATCH_B,
  SPEC_ARCH_PARAM_AXES, VERIFY_SPINE, NOTE_SPINE,
} from './class3-records.js';
import {
  runBuildGate, checkTopicKeyword, checkOptionLengthBudget, coverageMetric, SHIPPED_CONTENT_TEMPLATES,
} from '../content-template-tooling.js';
import { reviewRecord, checkVoice, checkEscalation, checkL2Safeguard } from '../content-authoring-rules.js';
import {
  ABSENCE_SPEC_ACCEPTANCE, ABSENCE_CROSS_CONFIRMING, ABSENCE_ALTERNATIVES, ABSENCE_ARCH_CONFLICT,
  ABSENCE_PROMPT_CONTEXT, ABSENCE_SPEC_CROSS_CONFIRM, ABSENCE_SPEC_REVISION, ABSENCE_API_DESIGN_REVIEW,
  ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL, ABSENCE_API_CONTRACT_DEFINITION_CASUAL,
  ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL,
} from './class3-spec-architecture.js';
import type { DecisionContent } from '../options.js';

/** signalType → its own keyword (retained in every option + authored why-desc). */
const KEYWORDS: Record<string, string> = {
  ABSENCE_SPEC_ACCEPTANCE: 'spec',
  ABSENCE_CROSS_CONFIRMING: 'verif',
  ABSENCE_ALTERNATIVES: 'alternative',
  ABSENCE_ARCH_CONFLICT: 'architect',
  ABSENCE_PROMPT_CONTEXT: 'context',
  ABSENCE_SPEC_CROSS_CONFIRM: 'spec',
  ABSENCE_SPEC_REVISION: 'spec',
  ABSENCE_API_DESIGN_REVIEW: 'api',
  ABSENCE_ARCHITECTURE_NOTE_ABSENCE: 'architect',
  ABSENCE_API_CONTRACT_DEFINITION: 'contract',
  ABSENCE_BACKWARDS_COMPATIBILITY_CHECK: 'compatib',
};

/** signalType → the frozen DecisionContent whose L1[0] is the col-3 anchor. */
const FROZEN: Record<string, DecisionContent> = {
  ABSENCE_SPEC_ACCEPTANCE, ABSENCE_CROSS_CONFIRMING, ABSENCE_ALTERNATIVES, ABSENCE_ARCH_CONFLICT,
  ABSENCE_PROMPT_CONTEXT, ABSENCE_SPEC_CROSS_CONFIRM, ABSENCE_SPEC_REVISION, ABSENCE_API_DESIGN_REVIEW,
  ABSENCE_ARCHITECTURE_NOTE_ABSENCE: ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL,
  ABSENCE_API_CONTRACT_DEFINITION: ABSENCE_API_CONTRACT_DEFINITION_CASUAL,
  ABSENCE_BACKWARDS_COMPATIBILITY_CHECK: ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL,
};

/** Author-declared practice-richness weights (the escalation input; the named-practice judgment is human-review). */
const PRACTICE_WEIGHTS: Record<string, readonly number[]> = Object.fromEntries(
  Object.keys(KEYWORDS).map((s) => [s, [1, 2, 3, 4, 5]]),
);

/** signalType → expected spine (only verification/note signals carry one; the rest must omit it). */
const SPINE_BY_SIGNAL: Record<string, readonly string[] | undefined> = {
  ABSENCE_CROSS_CONFIRMING: VERIFY_SPINE,
  ABSENCE_BACKWARDS_COMPATIBILITY_CHECK: VERIFY_SPINE,
  ABSENCE_ARCHITECTURE_NOTE_ABSENCE: NOTE_SPINE,
};

/** Casual-only signals — column 3 anchors on the long principle-citing casual text (length-exempt). */
const BATCH_B = new Set(CLASS3_RECORDS_BATCH_B.map((r) => r.signalType));

/** The prompting signal is a pure behaviour — its heaviest column must NOT yield a file. */
const BEHAVIOURAL_NO_FILE = new Set(['ABSENCE_PROMPT_CONTEXT']);

const FILE_RE = /\b(files?|runbooks?|notes?|docs?|readme|plans?)\b/i;

describe('class-3 — set-level', () => {
  it('batch A (8 formal) + batch B (3 casual-only) = the 11 spec/architecture signals', () => {
    expect(CLASS3_RECORDS_BATCH_A.length).toBe(8);
    expect(CLASS3_RECORDS_BATCH_B.length).toBe(3);
    expect(new Set(CLASS3_RECORDS.map((r) => r.signalType)).size).toBe(11);
  });
  it('the whole class passes the build gate (schema + level-1 floor)', () => {
    expect(runBuildGate(CLASS3_RECORDS).ok).toBe(true);
  });
});

describe('class-3 — per-record full-depth gates', () => {
  for (const r of CLASS3_RECORDS) {
    describe(r.signalType, () => {
      const kw = KEYWORDS[r.signalType];

      it('authors all 5 maturity columns', () => {
        expect(Object.keys(r.levelForms).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
      });

      it('is jargon-free in authored columns (col-3 frozen text exempt), headline-only, fully covered', () => {
        const review = reviewRecord(r, kw);
        const jargon = { ...review.jargonByLevel };
        delete jargon[3]; // col-3 is frozen shipped text — its jargon can't be re-authored away
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

      it('declares the grounded param axes, and a family spine only where the family has one', () => {
        expect(r.paramAxes).toBeDefined();
        expect(r.paramAxes).toEqual(SPEC_ARCH_PARAM_AXES);
        const expectedSpine = SPINE_BY_SIGNAL[r.signalType];
        if (expectedSpine) {
          expect(r.spine).toEqual(expectedSpine);
        } else {
          expect(r.spine).toBeUndefined(); // spec/design + prompting signals carry no spine
        }
      });

      it('fits the copy-paste budget (col-3 exempt for casual-only), col-1 ≤ col-5, voice-clean', () => {
        const over = checkOptionLengthBudget(r).overLevels;
        expect(BATCH_B.has(r.signalType) ? over.filter((l) => l !== 3) : over).toEqual([]);
        expect(r.levelForms[1]!.cell.option.length).toBeLessThanOrEqual(r.levelForms[5]!.cell.option.length);
        expect(checkVoice(r).ok).toBe(true);
      });

      it('heaviest column yields a written artifact — except the prompting signal, which stays behavioural', () => {
        const col5 = r.levelForms[5]!.cell.option;
        if (BEHAVIOURAL_NO_FILE.has(r.signalType)) {
          expect(col5).not.toMatch(FILE_RE);
        } else {
          expect(col5).toMatch(FILE_RE);
        }
      });
    });
  }
});

describe('class-3 — sensitive-action safeguard (whole-class review)', () => {
  // Class 3 is spec/architecture work: every form proposes a REVIEW / DEFINE /
  // NOTE action — none proposes a genuinely sensitive ACTION, so none owes a
  // confirm-seek and the keyword proxy should flag nothing.
  const flagged = CLASS3_RECORDS
    .map((r) => ({ signalType: r.signalType, review: checkL2Safeguard(r) }))
    .filter((x) => !x.review.ok);

  it('no class-3 form trips the sensitive-action proxy (no genuinely-sensitive action in the class)', () => {
    expect(flagged.map((x) => x.signalType)).toEqual([]);
  });
});

describe('class-3 — record↔runtime boundary (stored cells are bare core lines)', () => {
  const PLACEHOLDER = /\{[R{]/; // matches "{R..." bookends and "{{" slots — added by the engine at runtime, never stored
  for (const r of CLASS3_RECORDS) {
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

describe('class-3 — partition parity + registration (against the source of truth)', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  function canonicalClass3SignalTypes(): string[] {
    const src = readFileSync(join(HERE, '..', 'why-help-by-signal-type.ts'), 'utf-8');
    const re = /(\w+):\s*WHY_HELP_PER_CLASS\.(\w+)/g;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) if (m[2] === 'class3_spec_architecture') out.push(m[1]);
    return out;
  }

  const canonical = canonicalClass3SignalTypes();
  const recordSigs = CLASS3_RECORDS.map((r) => r.signalType);

  it('the partition assigns exactly 11 signalTypes to class 3', () => {
    expect(canonical.length).toBe(11);
    expect(new Set(canonical).size).toBe(11);
  });

  it('the shipped records cover the canonical 11 exactly — none missing, none extra, no duplicates', () => {
    const cs = new Set(canonical);
    const rs = new Set(recordSigs);
    expect(canonical.filter((s) => !rs.has(s))).toEqual([]);
    expect(recordSigs.filter((s) => !cs.has(s))).toEqual([]);
    expect(recordSigs.filter((s, i) => recordSigs.indexOf(s) !== i)).toEqual([]);
    expect(recordSigs.length).toBe(11);
  });

  it('every class-3 record is registered in the live shipped registry', () => {
    const shipped = new Set(SHIPPED_CONTENT_TEMPLATES.map((r) => r.signalType));
    expect(recordSigs.filter((s) => !shipped.has(s))).toEqual([]);
  });

  it('soft coverage — the whole class is all-5-columns, zero thin', () => {
    const cov = coverageMetric(CLASS3_RECORDS);
    expect(cov.total).toBe(11);
    expect(cov.allLevels).toBe(11);
    expect(cov.thin).toBe(0);
  });
});
