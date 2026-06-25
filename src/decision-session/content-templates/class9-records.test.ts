import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CLASS9_RECORDS, CLASS9_PARAM_AXES } from './class9-records.js';
import {
  runBuildGate, checkTopicKeyword, checkOptionLengthBudget, coverageMetric, SHIPPED_CONTENT_TEMPLATES,
} from '../content-template-tooling.js';
import {
  reviewRecord, checkVoice, checkEscalation, checkL2Safeguard, findVoiceViolations, findJargonViolations,
} from '../content-authoring-rules.js';
import { composeWhyDesc } from '../content-template-engine.js';
import {
  ABSENCE_DECISION_RECORD_ABSENCE_FORMAL, ABSENCE_OVER_ENGINEERING_CHECK_FORMAL, ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL,
  ABSENCE_OBSERVABILITY_FIRST_FORMAL, ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL, ABSENCE_CONTRACT_TESTING_GAP_FORMAL,
  ABSENCE_CAPACITY_PLANNING_GAP_FORMAL, ABSENCE_SECURITY_THREAT_MODELING_FORMAL, ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL,
  ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL, ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL, ABSENCE_SLO_DEFINITION_GAP_FORMAL,
} from './class9-academic-hardcore-pro.js';
import type { DecisionContent } from '../options.js';

/** signalType → its own keyword (plain word, not the jargon label — kept in every option + authored why-desc). */
const KEYWORDS: Record<string, string> = {
  ABSENCE_DECISION_RECORD_ABSENCE: 'decision',
  ABSENCE_OVER_ENGINEERING_CHECK: 'speculativ',
  ABSENCE_PAIR_REVIEW_ABSENCE: 'review',
  ABSENCE_OBSERVABILITY_FIRST: 'visib',
  ABSENCE_FAILURE_MODE_ANALYSIS: 'failure',
  ABSENCE_CONTRACT_TESTING_GAP: 'contract',
  ABSENCE_CAPACITY_PLANNING_GAP: 'capacity',
  ABSENCE_SECURITY_THREAT_MODELING: 'threat',
  ABSENCE_DATABASE_MIGRATION_SAFETY: 'migrat',
  ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE: 'rollback',
  ABSENCE_OPERATIONAL_RUNBOOK_GAP: 'runbook',
  ABSENCE_SLO_DEFINITION_GAP: 'slo',
};

/** signalType → the frozen DecisionContent whose L1[0] is the col-3 anchor (formal-only single register). */
const FROZEN: Record<string, DecisionContent> = {
  ABSENCE_DECISION_RECORD_ABSENCE: ABSENCE_DECISION_RECORD_ABSENCE_FORMAL,
  ABSENCE_OVER_ENGINEERING_CHECK: ABSENCE_OVER_ENGINEERING_CHECK_FORMAL,
  ABSENCE_PAIR_REVIEW_ABSENCE: ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL,
  ABSENCE_OBSERVABILITY_FIRST: ABSENCE_OBSERVABILITY_FIRST_FORMAL,
  ABSENCE_FAILURE_MODE_ANALYSIS: ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL,
  ABSENCE_CONTRACT_TESTING_GAP: ABSENCE_CONTRACT_TESTING_GAP_FORMAL,
  ABSENCE_CAPACITY_PLANNING_GAP: ABSENCE_CAPACITY_PLANNING_GAP_FORMAL,
  ABSENCE_SECURITY_THREAT_MODELING: ABSENCE_SECURITY_THREAT_MODELING_FORMAL,
  ABSENCE_DATABASE_MIGRATION_SAFETY: ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL,
  ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE: ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL,
  ABSENCE_OPERATIONAL_RUNBOOK_GAP: ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL,
  ABSENCE_SLO_DEFINITION_GAP: ABSENCE_SLO_DEFINITION_GAP_FORMAL,
};

/** Author-declared practice-richness weights (escalation input; named-practice judgment is human-review). */
const PRACTICE_WEIGHTS: Record<string, readonly number[]> = Object.fromEntries(
  Object.keys(KEYWORDS).map((s) => [s, [1, 2, 3, 4, 5]]),
);

/**
 * The one signal whose heaviest column stays a behaviour (no file): the YAGNI
 * over-engineering gate. The other eleven produce a written record at col-5 (a decision
 * doc, review plan, visibility plan, failure-mode note, contract-test file, capacity
 * note, threat-model note, migration plan, deployment plan, operational runbook, SLO doc).
 */
const BEHAVIOURAL = new Set(['ABSENCE_OVER_ENGINEERING_CHECK']);

const FILE_RE = /\b(files?|runbooks?|notes?|docs?|readme|plans?)\b/i;

describe('class-9 — set-level', () => {
  it('covers the 12 academic/hardcore-pro signals (all formal-anchored)', () => {
    expect(new Set(CLASS9_RECORDS.map((r) => r.signalType)).size).toBe(12);
  });
  it('the whole class passes the build gate (schema + level-1 floor)', () => {
    expect(runBuildGate(CLASS9_RECORDS).ok).toBe(true);
  });
});

describe('class-9 — per-record full-depth gates', () => {
  for (const r of CLASS9_RECORDS) {
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

      it('declares the grounded param axes; academic/hardcore-pro family carries no spine', () => {
        expect(r.paramAxes).toBeDefined();
        expect(r.paramAxes).toEqual(CLASS9_PARAM_AXES);
        expect(r.spine).toBeUndefined();
      });

      it('fits the copy-paste budget (col-3 exempt — the threat-model anchor cites the full STRIDE set), col-1 ≤ col-5, voice-clean', () => {
        expect(checkOptionLengthBudget(r).overLevels.filter((l) => l !== 3)).toEqual([]);
        expect(r.levelForms[1]!.cell.option.length).toBeLessThanOrEqual(r.levelForms[5]!.cell.option.length);
        expect(checkVoice(r).ok).toBe(true);
      });

      it('heaviest column: written record for the eleven note/plan signals, behavioural for the YAGNI gate', () => {
        const col5 = r.levelForms[5]!.cell.option;
        if (BEHAVIOURAL.has(r.signalType)) expect(col5).not.toMatch(FILE_RE);
        else expect(col5).toMatch(FILE_RE);
      });
    });
  }
});

describe('class-9 — sensitive-action safeguard (six intrinsically-sensitive signals)', () => {
  // Per the dev plan, "intrinsically sensitive" is grounded in the frozen
  // l2SafeguardRequired flag. The frozen class-9 source flags exactly six signals —
  // deleting/restructuring code, instrumenting across files, implementing stability
  // patterns across files, implementing security controls, running a schema migration,
  // and triggering a deployment. Each carries the flag + an action-specific l2SafeguardLine.
  const FLAGGED = [
    'ABSENCE_OVER_ENGINEERING_CHECK', 'ABSENCE_OBSERVABILITY_FIRST', 'ABSENCE_FAILURE_MODE_ANALYSIS',
    'ABSENCE_SECURITY_THREAT_MODELING', 'ABSENCE_DATABASE_MIGRATION_SAFETY', 'ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE',
  ];
  const SAFEGUARD_RE = /\b(confirm|go-ahead|go ahead|ask me|check with me)\b/i;
  const CONFIRM_SEEK: Record<string, RegExp> = {
    ABSENCE_OVER_ENGINEERING_CHECK: /\bdelete\b|\brestructure\b|\bcode\b/i,
    ABSENCE_OBSERVABILITY_FIRST: /\binstrument/i,
    ABSENCE_FAILURE_MODE_ANALYSIS: /\bstability pattern\b|\bpattern\b/i,
    ABSENCE_SECURITY_THREAT_MODELING: /\bsecurity\b/i,
    ABSENCE_DATABASE_MIGRATION_SAFETY: /\bmigration\b|\bschema\b/i,
    ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE: /\bdeployment\b|\bdeploy\b/i,
  };

  it('exactly the six sensitive signals are flagged l2SafeguardRequired', () => {
    expect(CLASS9_RECORDS.filter((r) => r.l2SafeguardRequired).map((r) => r.signalType)).toEqual(FLAGGED);
  });

  for (const sig of FLAGGED) {
    const r = CLASS9_RECORDS.find((x) => x.signalType === sig)!;
    describe(sig, () => {
      it('carries a record-specific l2SafeguardLine that names its own action', () => {
        expect(typeof r.l2SafeguardLine).toBe('string');
        expect(r.l2SafeguardLine).toMatch(SAFEGUARD_RE);
        expect(r.l2SafeguardLine).toMatch(CONFIRM_SEEK[sig]);
      });

      it('the engine appends the safeguard as the LAST line of EVERY served column, incl. frozen col-3', () => {
        for (const lvl of [1, 2, 3, 4, 5] as const) {
          const composed = composeWhyDesc({ cell: r.levelForms[lvl]!.cell, slots: r.slots, l2Safeguard: r.l2SafeguardLine });
          expect(composed.endsWith(r.l2SafeguardLine!)).toBe(true);
        }
      });

      it('the safeguard gate finds the record fully guarded (record-level line covers all columns)', () => {
        expect(checkL2Safeguard(r).unguardedLevels).toEqual([]);
      });

      it('the l2SafeguardLine is itself CA-bound-clean: voice-clean, de-jargon-clean, no runtime placeholders', () => {
        const line = r.l2SafeguardLine!;
        expect(findVoiceViolations(line)).toEqual([]);
        expect(findJargonViolations(line)).toEqual([]);
        expect(line).not.toMatch(/\{[R{]/);
      });
    });
  }

  // The keyword-proxy gate over-flags STAGE NOUNS (per the dev plan, it "over-flags
  // stage nouns AND misses some"). The frozen OPERATIONAL_RUNBOOK col-3 says "how to
  // deploy it" — "deploy" used DESCRIPTIVELY (documenting deploy steps in the runbook),
  // not proposing a deploy — so the proxy reports it sensitive at col-3 only. It is NOT
  // intrinsically flagged (the frozen source does not flag it); the authored cols avoid
  // the word, so the over-flag is confined to the unalterable frozen anchor.
  it('OPERATIONAL_RUNBOOK_GAP — not intrinsically flagged; the proxy over-flags only the frozen col-3 "deploy"', () => {
    const r = CLASS9_RECORDS.find((x) => x.signalType === 'ABSENCE_OPERATIONAL_RUNBOOK_GAP')!;
    expect(r.l2SafeguardRequired).toBeUndefined();
    expect(checkL2Safeguard(r).unguardedLevels).toEqual([3]);
  });

  it('every other class-9 record is unflagged AND clean of the sensitive-action proxy', () => {
    const exempt = new Set([...FLAGGED, 'ABSENCE_OPERATIONAL_RUNBOOK_GAP']);
    const others = CLASS9_RECORDS.filter((r) => !exempt.has(r.signalType));
    expect(others.filter((r) => r.l2SafeguardRequired).map((r) => r.signalType)).toEqual([]);
    expect(others.filter((r) => !checkL2Safeguard(r).ok).map((r) => r.signalType)).toEqual([]);
  });
});

describe('class-9 — sensitivity parity vs the frozen source of truth', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  function frozenFlaggedSignals(): Set<string> {
    const src = readFileSync(join(HERE, 'class9-academic-hardcore-pro.ts'), 'utf-8');
    const blocks = src.split(/export const \w+: DecisionContent =/).slice(1);
    const flagged = new Set<string>();
    for (const b of blocks) {
      const body = b.split('export const')[0];
      const m = body.match(/signalType:\s*"(\w+)"/);
      if (m && /l2SafeguardRequired:\s*true/.test(body)) flagged.add(m[1]);
    }
    return flagged;
  }

  it('every frozen-flagged class-9 signal has its content-template record flagged', () => {
    const frozenFlagged = frozenFlaggedSignals();
    expect(frozenFlagged.size).toBe(6); // not vacuous; the six sensitive signals
    const recordFlagged = new Set(CLASS9_RECORDS.filter((r) => r.l2SafeguardRequired).map((r) => r.signalType));
    expect([...frozenFlagged].filter((s) => !recordFlagged.has(s))).toEqual([]);
  });
});

describe('class-9 — record↔runtime boundary (stored cells are bare core lines)', () => {
  const PLACEHOLDER = /\{[R{]/;
  for (const r of CLASS9_RECORDS) {
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

describe('class-9 — partition parity + registration (against the source of truth)', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  function canonicalClass9SignalTypes(): string[] {
    const src = readFileSync(join(HERE, '..', 'why-help-by-signal-type.ts'), 'utf-8');
    const re = /(\w+):\s*WHY_HELP_PER_CLASS\.(\w+)/g;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) if (m[2] === 'class9_academic_hardcore_pro') out.push(m[1]);
    return out;
  }

  const canonical = canonicalClass9SignalTypes();
  const recordSigs = CLASS9_RECORDS.map((r) => r.signalType);

  it('the partition assigns exactly 12 signalTypes to class 9', () => {
    expect(canonical.length).toBe(12);
    expect(new Set(canonical).size).toBe(12);
  });

  it('the shipped records cover the canonical 12 exactly — none missing, none extra, no duplicates', () => {
    const cs = new Set(canonical);
    const rs = new Set(recordSigs);
    expect(canonical.filter((s) => !rs.has(s))).toEqual([]);
    expect(recordSigs.filter((s) => !cs.has(s))).toEqual([]);
    expect(recordSigs.filter((s, i) => recordSigs.indexOf(s) !== i)).toEqual([]);
    expect(recordSigs.length).toBe(12);
  });

  it('every class-9 record is registered in the live shipped registry', () => {
    const shipped = new Set(SHIPPED_CONTENT_TEMPLATES.map((r) => r.signalType));
    expect(recordSigs.filter((s) => !shipped.has(s))).toEqual([]);
  });

  it('soft coverage — the whole class is all-5-columns, zero thin', () => {
    const cov = coverageMetric(CLASS9_RECORDS);
    expect(cov.total).toBe(12);
    expect(cov.allLevels).toBe(12);
    expect(cov.thin).toBe(0);
  });
});
