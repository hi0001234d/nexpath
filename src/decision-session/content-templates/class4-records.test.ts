import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CLASS4_RECORDS, CLASS4_RECORDS_BATCH_A, CLASS4_RECORDS_BATCH_B, OPS_PARAM_AXES,
} from './class4-records.js';
import {
  runBuildGate, checkTopicKeyword, checkOptionLengthBudget, coverageMetric, SHIPPED_CONTENT_TEMPLATES,
} from '../content-template-tooling.js';
import { reviewRecord, checkVoice, checkEscalation, checkL2Safeguard } from '../content-authoring-rules.js';
import {
  ABSENCE_OBSERVABILITY, ABSENCE_ROLLBACK_PLANNING, ABSENCE_DEPLOYMENT_PLANNING, ABSENCE_DEPENDENCY_MGMT,
  ABSENCE_ENV_AND_SECRETS, ABSENCE_CI_PIPELINE, ABSENCE_RATE_LIMITING,
  ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL,
} from './class4-release-observability-infra.js';
import type { DecisionContent } from '../options.js';

/** signalType → its own keyword (retained in every option + authored why-desc). */
const KEYWORDS: Record<string, string> = {
  ABSENCE_OBSERVABILITY: 'logging',
  ABSENCE_ROLLBACK_PLANNING: 'rollback',
  ABSENCE_DEPLOYMENT_PLANNING: 'deploy',
  ABSENCE_DEPENDENCY_MGMT: 'dependenc',
  ABSENCE_ENV_AND_SECRETS: 'secret',
  ABSENCE_CI_PIPELINE: 'test',
  ABSENCE_RATE_LIMITING: 'limit',
  ABSENCE_DEPENDENCY_AUDIT_GAP: 'dependenc',
};

/** signalType → the frozen DecisionContent whose L1[0] is the col-3 anchor. */
const FROZEN: Record<string, DecisionContent> = {
  ABSENCE_OBSERVABILITY, ABSENCE_ROLLBACK_PLANNING, ABSENCE_DEPLOYMENT_PLANNING, ABSENCE_DEPENDENCY_MGMT,
  ABSENCE_ENV_AND_SECRETS, ABSENCE_CI_PIPELINE, ABSENCE_RATE_LIMITING,
  ABSENCE_DEPENDENCY_AUDIT_GAP: ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL,
};

/** Author-declared practice-richness weights (the escalation input; named-practice judgment is human-review). */
const PRACTICE_WEIGHTS: Record<string, readonly number[]> = Object.fromEntries(
  Object.keys(KEYWORDS).map((s) => [s, [1, 2, 3, 4, 5]]),
);

/** Casual-only signal — column 3 anchors on the long standard-citing casual text (length-exempt). */
const BATCH_B = new Set(CLASS4_RECORDS_BATCH_B.map((r) => r.signalType));

const FILE_RE = /\b(files?|runbooks?|notes?|docs?|readme|plans?)\b/i;
/** Confirm-seek markers (mirrors the safeguard gate's accepted markers). */
const SAFEGUARD_RE = /\b(ask me|go-ahead|go ahead|confirm|check with me)\b/i;

describe('class-4 — set-level', () => {
  it('batch A (7 formal) + batch B (1 casual-only) = the 8 release/observability/infra signals', () => {
    expect(CLASS4_RECORDS_BATCH_A.length).toBe(7);
    expect(CLASS4_RECORDS_BATCH_B.length).toBe(1);
    expect(new Set(CLASS4_RECORDS.map((r) => r.signalType)).size).toBe(8);
  });
  it('the whole class passes the build gate (schema + level-1 floor)', () => {
    expect(runBuildGate(CLASS4_RECORDS).ok).toBe(true);
  });
});

describe('class-4 — per-record full-depth gates', () => {
  for (const r of CLASS4_RECORDS) {
    describe(r.signalType, () => {
      const kw = KEYWORDS[r.signalType];

      it('authors all 5 maturity columns', () => {
        expect(Object.keys(r.levelForms).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
      });

      it('is de-jargon clean in authored columns (col-3 frozen exempt), headline-only, full coverage', () => {
        const review = reviewRecord(r, kw);
        const jargon = { ...review.jargonByLevel };
        delete jargon[3]; // col-3 is frozen shipped text — not subject to the authoring de-jargon discipline
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

      it('declares the grounded param axes; ops signals carry no spine', () => {
        expect(r.paramAxes).toBeDefined();
        expect(r.paramAxes).toEqual(OPS_PARAM_AXES);
        expect(r.spine).toBeUndefined(); // release/ops family has no intensifying spine
      });

      it('fits the copy-paste budget (col-3 exempt for casual-only), col-1 ≤ col-5, voice-clean', () => {
        const over = checkOptionLengthBudget(r).overLevels;
        expect(BATCH_B.has(r.signalType) ? over.filter((l) => l !== 3) : over).toEqual([]);
        expect(r.levelForms[1]!.cell.option.length).toBeLessThanOrEqual(r.levelForms[5]!.cell.option.length);
        expect(checkVoice(r).ok).toBe(true);
      });

      it('heaviest column yields a written artifact (all ops signals produce one)', () => {
        expect(r.levelForms[5]!.cell.option).toMatch(FILE_RE);
      });
    });
  }
});

describe('class-4 — sensitive-action safeguard (every record is intrinsically sensitive)', () => {
  // Class 4 is release/ops/infra: every signal concerns a CLAUDE.md sensitive action
  // (deploy, secrets, dependency install, production touch, multi-file change). Per the
  // utmost-delicacy decision, EVERY record is flagged and EVERY authored column carries
  // a confirm-seek in its why-desc. Column 3 (frozen shipped text) is exempt — its
  // safeguard is carried by the record-level flag + the runtime safeguard path.
  for (const r of CLASS4_RECORDS) {
    describe(r.signalType, () => {
      it('is flagged l2SafeguardRequired', () => {
        expect(r.l2SafeguardRequired).toBe(true);
      });

      it('carries a confirm-seek in every authored why-desc (1/2/4/5); col-3 frozen exempt', () => {
        for (const lvl of [1, 2, 4, 5] as const) {
          expect(r.levelForms[lvl]!.cell.whyDesc).toMatch(SAFEGUARD_RE);
        }
      });

      it('the safeguard gate finds no unguarded authored column (col-3 frozen exempt)', () => {
        expect(checkL2Safeguard(r).unguardedLevels.filter((l) => l !== 3)).toEqual([]);
      });
    });
  }
});

describe('class-4 — record↔runtime boundary (stored cells are bare core lines)', () => {
  const PLACEHOLDER = /\{[R{]/; // runtime bookends "{R..." and slots "{{" — added at runtime, never stored
  for (const r of CLASS4_RECORDS) {
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

describe('class-4 — partition parity + registration (against the source of truth)', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  function canonicalClass4SignalTypes(): string[] {
    const src = readFileSync(join(HERE, '..', 'why-help-by-signal-type.ts'), 'utf-8');
    const re = /(\w+):\s*WHY_HELP_PER_CLASS\.(\w+)/g;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) if (m[2] === 'class4_release_observability_infra') out.push(m[1]);
    return out;
  }

  const canonical = canonicalClass4SignalTypes();
  const recordSigs = CLASS4_RECORDS.map((r) => r.signalType);

  it('the partition assigns exactly 8 signalTypes to class 4', () => {
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

  it('every class-4 record is registered in the live shipped registry', () => {
    const shipped = new Set(SHIPPED_CONTENT_TEMPLATES.map((r) => r.signalType));
    expect(recordSigs.filter((s) => !shipped.has(s))).toEqual([]);
  });

  it('soft coverage — the whole class is all-5-columns, zero thin', () => {
    const cov = coverageMetric(CLASS4_RECORDS);
    expect(cov.total).toBe(8);
    expect(cov.allLevels).toBe(8);
    expect(cov.thin).toBe(0);
  });
});
