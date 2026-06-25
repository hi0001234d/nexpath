import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CLASS8_RECORDS, CLASS8_PARAM_AXES } from './class8-records.js';
import {
  runBuildGate, checkTopicKeyword, checkOptionLengthBudget, coverageMetric, SHIPPED_CONTENT_TEMPLATES,
} from '../content-template-tooling.js';
import {
  reviewRecord, checkVoice, checkEscalation, checkL2Safeguard, findVoiceViolations, findJargonViolations,
} from '../content-authoring-rules.js';
import { composeWhyDesc } from '../content-template-engine.js';
import {
  ABSENCE_USER_VALUE_CHECK_CASUAL, ABSENCE_OUTCOME_DEFINITION_CASUAL, ABSENCE_FEATURE_PRIORITIZATION_CASUAL,
  ABSENCE_USER_PERSONA_CLARITY_CASUAL, ABSENCE_COMPETITIVE_AWARENESS_CASUAL, ABSENCE_MVP_BOUNDARY_DISCIPLINE_CASUAL,
  ABSENCE_USER_ACQUISITION_CONSIDERATION_CASUAL, ABSENCE_RETENTION_MECHANISM_CHECK_CASUAL,
  ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT_CASUAL, ABSENCE_HYPOTHESIS_BEFORE_BUILD_CASUAL,
  ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE_CASUAL, ABSENCE_NORTH_STAR_ALIGNMENT_CASUAL,
  ABSENCE_TIME_TO_VALUE_CHECK_CASUAL, ABSENCE_SHIP_READINESS_DEFINITION_CASUAL, ABSENCE_MANUAL_BEFORE_AUTOMATE_CASUAL,
  ABSENCE_TECH_STACK_COMPLEXITY_CHECK_CASUAL, ABSENCE_LAUNCH_STRATEGY_ABSENCE_CASUAL, ABSENCE_EARLY_USER_FEEDBACK_CASUAL,
  ABSENCE_SOLO_MAINTAINABILITY_CASUAL, ABSENCE_DISTRIBUTION_THINKING_CASUAL, ABSENCE_MONETIZATION_PATH_CLARITY_CASUAL,
  ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY_CASUAL, ABSENCE_SCOPE_VS_TIME_CHECK_CASUAL,
  ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_FORMAL, ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_FORMAL,
  ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_FORMAL, ABSENCE_DEPENDENCY_MAPPING_FORMAL, ABSENCE_DEFINITION_OF_DONE_FORMAL,
  ABSENCE_CROSS_TEAM_IMPACT_CHECK_FORMAL, ABSENCE_SUCCESS_METRIC_DEFINITION_FORMAL, ABSENCE_PRIORITY_JUSTIFICATION_FORMAL,
  ABSENCE_USER_STORY_COMPLETENESS_FORMAL, ABSENCE_RISK_FLAG_FORMAL, ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_FORMAL,
  ABSENCE_RETROSPECTIVE_HABIT_FORMAL,
} from './class8-role-cluster.js';
import type { DecisionContent } from '../options.js';

/** signalType → its own keyword (retained in every option + authored why-desc). */
const KEYWORDS: Record<string, string> = {
  ABSENCE_USER_VALUE_CHECK: 'signal',
  ABSENCE_OUTCOME_DEFINITION: 'outcome',
  ABSENCE_FEATURE_PRIORITIZATION: 'priorit',
  ABSENCE_USER_PERSONA_CLARITY: 'user',
  ABSENCE_COMPETITIVE_AWARENESS: 'competit',
  ABSENCE_MVP_BOUNDARY_DISCIPLINE: 'mvp',
  ABSENCE_USER_ACQUISITION_CONSIDERATION: 'user',
  ABSENCE_RETENTION_MECHANISM_CHECK: 'retention',
  ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT: 'measure',
  ABSENCE_HYPOTHESIS_BEFORE_BUILD: 'hypothesis',
  ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE: 'direction',
  ABSENCE_NORTH_STAR_ALIGNMENT: 'north',
  ABSENCE_TIME_TO_VALUE_CHECK: 'scale',
  ABSENCE_SHIP_READINESS_DEFINITION: 'ship',
  ABSENCE_MANUAL_BEFORE_AUTOMATE: 'manual',
  ABSENCE_TECH_STACK_COMPLEXITY_CHECK: 'stack',
  ABSENCE_LAUNCH_STRATEGY_ABSENCE: 'launch',
  ABSENCE_EARLY_USER_FEEDBACK: 'user',
  ABSENCE_SOLO_MAINTAINABILITY: 'solo',
  ABSENCE_DISTRIBUTION_THINKING: 'distribution',
  ABSENCE_MONETIZATION_PATH_CLARITY: 'monetization',
  ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY: 'public',
  ABSENCE_SCOPE_VS_TIME_CHECK: 'scope',
  ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV: 'acceptance',
  ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK: 'stakeholder',
  ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG: 'ambig',
  ABSENCE_DEPENDENCY_MAPPING: 'dependenc',
  ABSENCE_DEFINITION_OF_DONE: 'done',
  ABSENCE_CROSS_TEAM_IMPACT_CHECK: 'team',
  ABSENCE_SUCCESS_METRIC_DEFINITION: 'metric',
  ABSENCE_PRIORITY_JUSTIFICATION: 'priorit',
  ABSENCE_USER_STORY_COMPLETENESS: 'user',
  ABSENCE_RISK_FLAG: 'risk',
  ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT: 'impact',
  ABSENCE_RETROSPECTIVE_HABIT: 'retro',
};

/** signalType → the frozen DecisionContent whose L1[0] is the col-3 anchor (casual or formal single-register variant). */
const FROZEN: Record<string, DecisionContent> = {
  ABSENCE_USER_VALUE_CHECK: ABSENCE_USER_VALUE_CHECK_CASUAL,
  ABSENCE_OUTCOME_DEFINITION: ABSENCE_OUTCOME_DEFINITION_CASUAL,
  ABSENCE_FEATURE_PRIORITIZATION: ABSENCE_FEATURE_PRIORITIZATION_CASUAL,
  ABSENCE_USER_PERSONA_CLARITY: ABSENCE_USER_PERSONA_CLARITY_CASUAL,
  ABSENCE_COMPETITIVE_AWARENESS: ABSENCE_COMPETITIVE_AWARENESS_CASUAL,
  ABSENCE_MVP_BOUNDARY_DISCIPLINE: ABSENCE_MVP_BOUNDARY_DISCIPLINE_CASUAL,
  ABSENCE_USER_ACQUISITION_CONSIDERATION: ABSENCE_USER_ACQUISITION_CONSIDERATION_CASUAL,
  ABSENCE_RETENTION_MECHANISM_CHECK: ABSENCE_RETENTION_MECHANISM_CHECK_CASUAL,
  ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT: ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT_CASUAL,
  ABSENCE_HYPOTHESIS_BEFORE_BUILD: ABSENCE_HYPOTHESIS_BEFORE_BUILD_CASUAL,
  ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE: ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE_CASUAL,
  ABSENCE_NORTH_STAR_ALIGNMENT: ABSENCE_NORTH_STAR_ALIGNMENT_CASUAL,
  ABSENCE_TIME_TO_VALUE_CHECK: ABSENCE_TIME_TO_VALUE_CHECK_CASUAL,
  ABSENCE_SHIP_READINESS_DEFINITION: ABSENCE_SHIP_READINESS_DEFINITION_CASUAL,
  ABSENCE_MANUAL_BEFORE_AUTOMATE: ABSENCE_MANUAL_BEFORE_AUTOMATE_CASUAL,
  ABSENCE_TECH_STACK_COMPLEXITY_CHECK: ABSENCE_TECH_STACK_COMPLEXITY_CHECK_CASUAL,
  ABSENCE_LAUNCH_STRATEGY_ABSENCE: ABSENCE_LAUNCH_STRATEGY_ABSENCE_CASUAL,
  ABSENCE_EARLY_USER_FEEDBACK: ABSENCE_EARLY_USER_FEEDBACK_CASUAL,
  ABSENCE_SOLO_MAINTAINABILITY: ABSENCE_SOLO_MAINTAINABILITY_CASUAL,
  ABSENCE_DISTRIBUTION_THINKING: ABSENCE_DISTRIBUTION_THINKING_CASUAL,
  ABSENCE_MONETIZATION_PATH_CLARITY: ABSENCE_MONETIZATION_PATH_CLARITY_CASUAL,
  ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY: ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY_CASUAL,
  ABSENCE_SCOPE_VS_TIME_CHECK: ABSENCE_SCOPE_VS_TIME_CHECK_CASUAL,
  ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV: ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_FORMAL,
  ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK: ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_FORMAL,
  ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG: ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_FORMAL,
  ABSENCE_DEPENDENCY_MAPPING: ABSENCE_DEPENDENCY_MAPPING_FORMAL,
  ABSENCE_DEFINITION_OF_DONE: ABSENCE_DEFINITION_OF_DONE_FORMAL,
  ABSENCE_CROSS_TEAM_IMPACT_CHECK: ABSENCE_CROSS_TEAM_IMPACT_CHECK_FORMAL,
  ABSENCE_SUCCESS_METRIC_DEFINITION: ABSENCE_SUCCESS_METRIC_DEFINITION_FORMAL,
  ABSENCE_PRIORITY_JUSTIFICATION: ABSENCE_PRIORITY_JUSTIFICATION_FORMAL,
  ABSENCE_USER_STORY_COMPLETENESS: ABSENCE_USER_STORY_COMPLETENESS_FORMAL,
  ABSENCE_RISK_FLAG: ABSENCE_RISK_FLAG_FORMAL,
  ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT: ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_FORMAL,
  ABSENCE_RETROSPECTIVE_HABIT: ABSENCE_RETROSPECTIVE_HABIT_FORMAL,
};

/** Author-declared practice-richness weights (escalation input; named-practice judgment is human-review). */
const PRACTICE_WEIGHTS: Record<string, readonly number[]> = Object.fromEntries(
  Object.keys(KEYWORDS).map((s) => [s, [1, 2, 3, 4, 5]]),
);

/** The twelve formal (PM) signals; the rest are casual (founder / indie). */
const FORMAL_ANCHORED = new Set([
  'ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV', 'ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK', 'ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG',
  'ABSENCE_DEPENDENCY_MAPPING', 'ABSENCE_DEFINITION_OF_DONE', 'ABSENCE_CROSS_TEAM_IMPACT_CHECK',
  'ABSENCE_SUCCESS_METRIC_DEFINITION', 'ABSENCE_PRIORITY_JUSTIFICATION', 'ABSENCE_USER_STORY_COMPLETENESS',
  'ABSENCE_RISK_FLAG', 'ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT', 'ABSENCE_RETROSPECTIVE_HABIT',
]);

/**
 * The five signals whose heaviest column stays a behaviour (no file): the
 * product-direction check, manual-first validation, early-user-feedback contact, the
 * solo-maintainability gate, and the build-in-public cadence. The other thirty produce
 * a written record at col-5 — consistent with the cadence-vs-record split.
 */
const BEHAVIOURAL = new Set([
  'ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE', 'ABSENCE_MANUAL_BEFORE_AUTOMATE', 'ABSENCE_EARLY_USER_FEEDBACK',
  'ABSENCE_SOLO_MAINTAINABILITY', 'ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY',
]);

const FILE_RE = /\b(files?|runbooks?|notes?|docs?|readme|plans?)\b/i;

describe('class-8 — set-level', () => {
  it('covers the 35 role-cluster signals (23 casual-anchored + 12 formal-anchored)', () => {
    expect(new Set(CLASS8_RECORDS.map((r) => r.signalType)).size).toBe(35);
    expect(CLASS8_RECORDS.filter((r) => FORMAL_ANCHORED.has(r.signalType)).length).toBe(12);
    expect(CLASS8_RECORDS.filter((r) => !FORMAL_ANCHORED.has(r.signalType)).length).toBe(23);
  });
  it('the whole class passes the build gate (schema + level-1 floor)', () => {
    expect(runBuildGate(CLASS8_RECORDS).ok).toBe(true);
  });
});

describe('class-8 — per-record full-depth gates', () => {
  for (const r of CLASS8_RECORDS) {
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

      it('declares the grounded param axes; role-cluster family carries no spine', () => {
        expect(r.paramAxes).toBeDefined();
        expect(r.paramAxes).toEqual(CLASS8_PARAM_AXES);
        expect(r.spine).toBeUndefined();
      });

      it('fits the copy-paste budget (col-3 exempt — several casual anchors cite a named principle), col-1 ≤ col-5, voice-clean', () => {
        expect(checkOptionLengthBudget(r).overLevels.filter((l) => l !== 3)).toEqual([]);
        expect(r.levelForms[1]!.cell.option.length).toBeLessThanOrEqual(r.levelForms[5]!.cell.option.length);
        expect(checkVoice(r).ok).toBe(true);
      });

      it('heaviest column: written record for the thirty note signals, behavioural for the five cadences', () => {
        const col5 = r.levelForms[5]!.cell.option;
        if (BEHAVIOURAL.has(r.signalType)) expect(col5).not.toMatch(FILE_RE);
        else expect(col5).toMatch(FILE_RE);
      });
    });
  }
});

describe('class-8 — sensitive-action safeguard (four intrinsically-sensitive signals)', () => {
  // Per the dev plan, "intrinsically sensitive" is grounded in the frozen
  // l2SafeguardRequired flag. The frozen class-8 source flags exactly four signals —
  // publishing a launch, posting publicly, contacting stakeholders for sign-off, and
  // notifying other teams of a shared-system change. Each carries the flag + an
  // action-specific l2SafeguardLine the engine appends as the LAST line of every column.
  const FLAGGED = [
    'ABSENCE_LAUNCH_STRATEGY_ABSENCE', 'ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY',
    'ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK', 'ABSENCE_CROSS_TEAM_IMPACT_CHECK',
  ];
  const SAFEGUARD_RE = /\b(confirm|go-ahead|go ahead|ask me|check with me)\b/i;
  const CONFIRM_SEEK: Record<string, RegExp> = {
    ABSENCE_LAUNCH_STRATEGY_ABSENCE: /\blaunch\b/i,
    ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY: /\bpublic\b|\bpost\b/i,
    ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK: /\bstakeholder\b/i,
    ABSENCE_CROSS_TEAM_IMPACT_CHECK: /\bteam\b|\bnotification\b/i,
  };

  it('exactly the four sensitive signals are flagged l2SafeguardRequired', () => {
    expect(CLASS8_RECORDS.filter((r) => r.l2SafeguardRequired).map((r) => r.signalType)).toEqual(FLAGGED);
  });

  for (const sig of FLAGGED) {
    const r = CLASS8_RECORDS.find((x) => x.signalType === sig)!;
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
  // stage nouns AND misses some" — the frozen flag is the hard discipline). The frozen
  // SOLO_MAINTAINABILITY col-3 uses "production" DESCRIPTIVELY ("debugging it in
  // production"), not as a deploy action — so the proxy reports it sensitive at col-3
  // only. It is NOT intrinsically flagged (the frozen source does not flag it), matching
  // the dev-plan discipline; the authored cols 1/2/4/5 avoid the word.
  it('SOLO_MAINTAINABILITY — not intrinsically flagged; the proxy over-flags only the frozen col-3 "production"', () => {
    const r = CLASS8_RECORDS.find((x) => x.signalType === 'ABSENCE_SOLO_MAINTAINABILITY')!;
    expect(r.l2SafeguardRequired).toBeUndefined();
    expect(checkL2Safeguard(r).unguardedLevels).toEqual([3]);
  });

  it('every other class-8 record is unflagged AND clean of the sensitive-action proxy', () => {
    const exempt = new Set([...FLAGGED, 'ABSENCE_SOLO_MAINTAINABILITY']);
    const others = CLASS8_RECORDS.filter((r) => !exempt.has(r.signalType));
    expect(others.filter((r) => r.l2SafeguardRequired).map((r) => r.signalType)).toEqual([]);
    expect(others.filter((r) => !checkL2Safeguard(r).ok).map((r) => r.signalType)).toEqual([]);
  });
});

describe('class-8 — sensitivity parity vs the frozen source of truth', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  function frozenFlaggedSignals(): Set<string> {
    const src = readFileSync(join(HERE, 'class8-role-cluster.ts'), 'utf-8');
    const blocks = src.split(/export const \w+: DecisionContent =/).slice(1);
    const flagged = new Set<string>();
    for (const b of blocks) {
      const body = b.split('export const')[0];
      const m = body.match(/signalType:\s*"(\w+)"/);
      if (m && /l2SafeguardRequired:\s*true/.test(body)) flagged.add(m[1]);
    }
    return flagged;
  }

  it('every frozen-flagged class-8 signal has its content-template record flagged', () => {
    const frozenFlagged = frozenFlaggedSignals();
    expect(frozenFlagged.size).toBe(4); // not vacuous; the four sensitive signals
    const recordFlagged = new Set(CLASS8_RECORDS.filter((r) => r.l2SafeguardRequired).map((r) => r.signalType));
    expect([...frozenFlagged].filter((s) => !recordFlagged.has(s))).toEqual([]);
  });
});

describe('class-8 — record↔runtime boundary (stored cells are bare core lines)', () => {
  const PLACEHOLDER = /\{[R{]/;
  for (const r of CLASS8_RECORDS) {
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

describe('class-8 — partition parity + registration (against the source of truth)', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  function canonicalClass8SignalTypes(): string[] {
    const src = readFileSync(join(HERE, '..', 'why-help-by-signal-type.ts'), 'utf-8');
    const re = /(\w+):\s*WHY_HELP_PER_CLASS\.(\w+)/g;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) if (m[2] === 'class8_role_cluster') out.push(m[1]);
    return out;
  }

  const canonical = canonicalClass8SignalTypes();
  const recordSigs = CLASS8_RECORDS.map((r) => r.signalType);

  it('the partition assigns exactly 35 signalTypes to class 8', () => {
    expect(canonical.length).toBe(35);
    expect(new Set(canonical).size).toBe(35);
  });

  it('the shipped records cover the canonical 35 exactly — none missing, none extra, no duplicates', () => {
    const cs = new Set(canonical);
    const rs = new Set(recordSigs);
    expect(canonical.filter((s) => !rs.has(s))).toEqual([]);
    expect(recordSigs.filter((s) => !cs.has(s))).toEqual([]);
    expect(recordSigs.filter((s, i) => recordSigs.indexOf(s) !== i)).toEqual([]);
    expect(recordSigs.length).toBe(35);
  });

  it('every class-8 record is registered in the live shipped registry', () => {
    const shipped = new Set(SHIPPED_CONTENT_TEMPLATES.map((r) => r.signalType));
    expect(recordSigs.filter((s) => !shipped.has(s))).toEqual([]);
  });

  it('soft coverage — the whole class is all-5-columns, zero thin', () => {
    const cov = coverageMetric(CLASS8_RECORDS);
    expect(cov.total).toBe(35);
    expect(cov.allLevels).toBe(35);
    expect(cov.thin).toBe(0);
  });
});
