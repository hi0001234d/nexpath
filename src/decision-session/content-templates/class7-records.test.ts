import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CLASS7_RECORDS, VIBE_PARAM_AXES } from './class7-records.js';
import {
  runBuildGate, checkTopicKeyword, checkOptionLengthBudget, coverageMetric, SHIPPED_CONTENT_TEMPLATES,
} from '../content-template-tooling.js';
import {
  reviewRecord, checkVoice, checkEscalation, checkL2Safeguard, findVoiceViolations, findJargonViolations,
} from '../content-authoring-rules.js';
import { composeWhyDesc } from '../content-template-engine.js';
import {
  ABSENCE_FEATURE_COMPLETION_CHECK_CASUAL, ABSENCE_FINISHING_LINE_AWARENESS_CASUAL, ABSENCE_POLISH_VS_FUNCTION_CASUAL,
  ABSENCE_MVP_SCOPE_DISCIPLINE_CASUAL, ABSENCE_IDEA_TO_SPEC_BRIDGE_CASUAL, ABSENCE_DEMO_VS_PRODUCT_CASUAL,
  ABSENCE_USER_JOURNEY_CHECK_CASUAL, ABSENCE_TECHNICAL_SPIKE_TREATMENT_CASUAL, ABSENCE_DEPENDENCY_ADVENTURE_CASUAL,
  ABSENCE_RESTART_IMPULSE_CHECK_CASUAL, ABSENCE_CREATIVE_VS_CORE_RATIO_CASUAL,
  ABSENCE_ERROR_UNDERSTANDING_BEGINNER, ABSENCE_REQUIREMENT_CLARITY_BEGINNER, ABSENCE_COPY_PASTE_AWARENESS_BEGINNER,
  ABSENCE_DEBUGGING_OBSERVATION_BEGINNER, ABSENCE_LEARNING_CONSOLIDATION_BEGINNER, ABSENCE_SIMPLE_SOLUTION_FIRST_BEGINNER,
  ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER, ABSENCE_ROLLBACK_AWARENESS_BEGINNER,
  ABSENCE_BUILD_VS_UNDERSTAND_RATIO_BEGINNER,
} from './class7-cool-geek-vibe-coder.js';
import type { DecisionContent } from '../options.js';

/** signalType → its own keyword (retained in every option + authored why-desc). */
const KEYWORDS: Record<string, string> = {
  ABSENCE_FEATURE_COMPLETION_CHECK: 'feature',
  ABSENCE_FINISHING_LINE_AWARENESS: 'progress',
  ABSENCE_POLISH_VS_FUNCTION: 'polish',
  ABSENCE_MVP_SCOPE_DISCIPLINE: 'mvp',
  ABSENCE_IDEA_TO_SPEC_BRIDGE: 'spec',
  ABSENCE_DEMO_VS_PRODUCT: 'demo',
  ABSENCE_USER_JOURNEY_CHECK: 'state',
  ABSENCE_TECHNICAL_SPIKE_TREATMENT: 'spike',
  ABSENCE_DEPENDENCY_ADVENTURE: 'dependency',
  ABSENCE_RESTART_IMPULSE_CHECK: 'restart',
  ABSENCE_CREATIVE_VS_CORE_RATIO: 'creative',
  ABSENCE_ERROR_UNDERSTANDING: 'error',
  ABSENCE_REQUIREMENT_CLARITY: 'work',
  ABSENCE_COPY_PASTE_AWARENESS: 'read',
  ABSENCE_DEBUGGING_OBSERVATION: 'bug',
  ABSENCE_LEARNING_CONSOLIDATION: 'learn',
  ABSENCE_SIMPLE_SOLUTION_FIRST: 'simpl',
  ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING: 'message',
  ABSENCE_ROLLBACK_AWARENESS: 'commit',
  ABSENCE_BUILD_VS_UNDERSTAND_RATIO: 'understand',
};

/** signalType → the frozen DecisionContent whose L1[0] is the col-3 anchor (the single-register variant). */
const FROZEN: Record<string, DecisionContent> = {
  ABSENCE_FEATURE_COMPLETION_CHECK: ABSENCE_FEATURE_COMPLETION_CHECK_CASUAL,
  ABSENCE_FINISHING_LINE_AWARENESS: ABSENCE_FINISHING_LINE_AWARENESS_CASUAL,
  ABSENCE_POLISH_VS_FUNCTION: ABSENCE_POLISH_VS_FUNCTION_CASUAL,
  ABSENCE_MVP_SCOPE_DISCIPLINE: ABSENCE_MVP_SCOPE_DISCIPLINE_CASUAL,
  ABSENCE_IDEA_TO_SPEC_BRIDGE: ABSENCE_IDEA_TO_SPEC_BRIDGE_CASUAL,
  ABSENCE_DEMO_VS_PRODUCT: ABSENCE_DEMO_VS_PRODUCT_CASUAL,
  ABSENCE_USER_JOURNEY_CHECK: ABSENCE_USER_JOURNEY_CHECK_CASUAL,
  ABSENCE_TECHNICAL_SPIKE_TREATMENT: ABSENCE_TECHNICAL_SPIKE_TREATMENT_CASUAL,
  ABSENCE_DEPENDENCY_ADVENTURE: ABSENCE_DEPENDENCY_ADVENTURE_CASUAL,
  ABSENCE_RESTART_IMPULSE_CHECK: ABSENCE_RESTART_IMPULSE_CHECK_CASUAL,
  ABSENCE_CREATIVE_VS_CORE_RATIO: ABSENCE_CREATIVE_VS_CORE_RATIO_CASUAL,
  ABSENCE_ERROR_UNDERSTANDING: ABSENCE_ERROR_UNDERSTANDING_BEGINNER,
  ABSENCE_REQUIREMENT_CLARITY: ABSENCE_REQUIREMENT_CLARITY_BEGINNER,
  ABSENCE_COPY_PASTE_AWARENESS: ABSENCE_COPY_PASTE_AWARENESS_BEGINNER,
  ABSENCE_DEBUGGING_OBSERVATION: ABSENCE_DEBUGGING_OBSERVATION_BEGINNER,
  ABSENCE_LEARNING_CONSOLIDATION: ABSENCE_LEARNING_CONSOLIDATION_BEGINNER,
  ABSENCE_SIMPLE_SOLUTION_FIRST: ABSENCE_SIMPLE_SOLUTION_FIRST_BEGINNER,
  ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING: ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER,
  ABSENCE_ROLLBACK_AWARENESS: ABSENCE_ROLLBACK_AWARENESS_BEGINNER,
  ABSENCE_BUILD_VS_UNDERSTAND_RATIO: ABSENCE_BUILD_VS_UNDERSTAND_RATIO_BEGINNER,
};

/** Author-declared practice-richness weights (escalation input; named-practice judgment is human-review). */
const PRACTICE_WEIGHTS: Record<string, readonly number[]> = Object.fromEntries(
  Object.keys(KEYWORDS).map((s) => [s, [1, 2, 3, 4, 5]]),
);

/**
 * The eight signals whose heaviest column produces a written record (note / doc).
 * The other twelve are ongoing habits or verification cadences — their col-5 stays a
 * behaviour (no file), consistent with the session-meta / planning cadence-vs-record split.
 */
const FILE_SIGNALS = new Set([
  'ABSENCE_MVP_SCOPE_DISCIPLINE', 'ABSENCE_IDEA_TO_SPEC_BRIDGE', 'ABSENCE_DEMO_VS_PRODUCT',
  'ABSENCE_USER_JOURNEY_CHECK', 'ABSENCE_RESTART_IMPULSE_CHECK', 'ABSENCE_CREATIVE_VS_CORE_RATIO',
  'ABSENCE_REQUIREMENT_CLARITY', 'ABSENCE_LEARNING_CONSOLIDATION',
]);

const FILE_RE = /\b(files?|runbooks?|notes?|docs?|readme|plans?)\b/i;

/** The eleven casual-anchored signals (col-3 = casual L1[0]); the rest are beginner-anchored. */
const CASUAL_ANCHORED = new Set([
  'ABSENCE_FEATURE_COMPLETION_CHECK', 'ABSENCE_FINISHING_LINE_AWARENESS', 'ABSENCE_POLISH_VS_FUNCTION',
  'ABSENCE_MVP_SCOPE_DISCIPLINE', 'ABSENCE_IDEA_TO_SPEC_BRIDGE', 'ABSENCE_DEMO_VS_PRODUCT',
  'ABSENCE_USER_JOURNEY_CHECK', 'ABSENCE_TECHNICAL_SPIKE_TREATMENT', 'ABSENCE_DEPENDENCY_ADVENTURE',
  'ABSENCE_RESTART_IMPULSE_CHECK', 'ABSENCE_CREATIVE_VS_CORE_RATIO',
]);

describe('class-7 — set-level', () => {
  it('covers the 20 vibe-coder signals (11 casual-anchored + 9 beginner-anchored)', () => {
    expect(new Set(CLASS7_RECORDS.map((r) => r.signalType)).size).toBe(20);
    expect(CLASS7_RECORDS.filter((r) => CASUAL_ANCHORED.has(r.signalType)).length).toBe(11);
    expect(CLASS7_RECORDS.filter((r) => !CASUAL_ANCHORED.has(r.signalType)).length).toBe(9);
  });
  it('the whole class passes the build gate (schema + level-1 floor)', () => {
    expect(runBuildGate(CLASS7_RECORDS).ok).toBe(true);
  });
});

describe('class-7 — per-record full-depth gates', () => {
  for (const r of CLASS7_RECORDS) {
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

      it('declares the grounded param axes; vibe-coder family carries no spine', () => {
        expect(r.paramAxes).toBeDefined();
        expect(r.paramAxes).toEqual(VIBE_PARAM_AXES);
        expect(r.spine).toBeUndefined();
      });

      it('fits the copy-paste budget, col-1 ≤ col-5, voice-clean', () => {
        expect(checkOptionLengthBudget(r).overLevels).toEqual([]);
        expect(r.levelForms[1]!.cell.option.length).toBeLessThanOrEqual(r.levelForms[5]!.cell.option.length);
        expect(checkVoice(r).ok).toBe(true);
      });

      it('heaviest column: written record for the eight note/doc signals, behavioural for the rest', () => {
        const col5 = r.levelForms[5]!.cell.option;
        if (FILE_SIGNALS.has(r.signalType)) expect(col5).toMatch(FILE_RE);
        else expect(col5).not.toMatch(FILE_RE);
      });
    });
  }
});

describe('class-7 — sensitive-action safeguard (only the dependency-add signal is intrinsically sensitive)', () => {
  // Per the dev plan, "intrinsically sensitive" is grounded in the frozen
  // l2SafeguardRequired flag. The frozen class-7 source flags exactly one signal —
  // ABSENCE_DEPENDENCY_ADVENTURE (adding a dependency = a CLAUDE.md sensitive action).
  // It carries the flag + an action-specific l2SafeguardLine the engine appends as the
  // LAST line of every served column (incl. the frozen col-3 anchor).
  const FLAGGED = 'ABSENCE_DEPENDENCY_ADVENTURE';
  const CONFIRM_SEEK = /\bdependenc/i; // names THIS record's action (no cross-record mismatch)
  const SAFEGUARD_RE = /\b(confirm|go-ahead|go ahead|ask me|check with me)\b/i;

  it('exactly the dependency-add signal is flagged l2SafeguardRequired', () => {
    expect(CLASS7_RECORDS.filter((r) => r.l2SafeguardRequired).map((r) => r.signalType)).toEqual([FLAGGED]);
  });

  const flaggedRecord = CLASS7_RECORDS.find((r) => r.signalType === FLAGGED)!;

  it('the flagged record carries a record-specific l2SafeguardLine that names its own action', () => {
    expect(typeof flaggedRecord.l2SafeguardLine).toBe('string');
    expect(flaggedRecord.l2SafeguardLine).toMatch(SAFEGUARD_RE);
    expect(flaggedRecord.l2SafeguardLine).toMatch(CONFIRM_SEEK);
  });

  it('the engine appends the safeguard as the LAST line of EVERY served column, incl. frozen col-3', () => {
    for (const lvl of [1, 2, 3, 4, 5] as const) {
      const composed = composeWhyDesc({ cell: flaggedRecord.levelForms[lvl]!.cell, slots: flaggedRecord.slots, l2Safeguard: flaggedRecord.l2SafeguardLine });
      expect(composed.endsWith(flaggedRecord.l2SafeguardLine!)).toBe(true);
    }
  });

  it('the safeguard gate finds the flagged record fully guarded (record-level line covers all columns)', () => {
    expect(checkL2Safeguard(flaggedRecord).unguardedLevels).toEqual([]);
  });

  it('the l2SafeguardLine is itself CA-bound-clean: voice-clean, de-jargon-clean, no runtime placeholders', () => {
    const line = flaggedRecord.l2SafeguardLine!;
    expect(findVoiceViolations(line)).toEqual([]);
    expect(findJargonViolations(line)).toEqual([]);
    expect(line).not.toMatch(/\{[R{]/);
  });

  // The keyword-proxy gate over-flags STAGE NOUNS (per the dev plan, it "over-flags
  // stage nouns AND misses some" — the frozen flag is the hard discipline). Two frozen
  // col-3 anchors use the word "production" DESCRIPTIVELY (demo-vs-production quality
  // standard / never copy spike code into production code), not as a deploy action — so
  // the proxy reports them as sensitive at col-3 only. They are NOT intrinsically
  // flagged (the frozen source does not flag them), matching the dev-plan discipline.
  const PROXY_OVERFLAG = ['ABSENCE_DEMO_VS_PRODUCT', 'ABSENCE_TECHNICAL_SPIKE_TREATMENT'];

  for (const sig of PROXY_OVERFLAG) {
    const r = CLASS7_RECORDS.find((x) => x.signalType === sig)!;
    it(`${sig} — not intrinsically flagged; the proxy over-flags only the frozen col-3 "production"`, () => {
      expect(r.l2SafeguardRequired).toBeUndefined();
      expect(checkL2Safeguard(r).unguardedLevels).toEqual([3]); // confined to the unalterable frozen anchor
    });
  }

  it('every other class-7 record is unflagged AND clean of the sensitive-action proxy', () => {
    const exempt = new Set([FLAGGED, ...PROXY_OVERFLAG]);
    const others = CLASS7_RECORDS.filter((r) => !exempt.has(r.signalType));
    expect(others.filter((r) => r.l2SafeguardRequired).map((r) => r.signalType)).toEqual([]);
    expect(others.filter((r) => !checkL2Safeguard(r).ok).map((r) => r.signalType)).toEqual([]);
  });
});

describe('class-7 — sensitivity parity vs the frozen source of truth', () => {
  // The frozen DecisionContent is the authoritative "intrinsically sensitive" marker.
  // Every signal the frozen source flags MUST have its content-template record flagged
  // too — catches a frozen-sensitive signal authored without the flag (a silent hole).
  const HERE = dirname(fileURLToPath(import.meta.url));
  function frozenFlaggedSignals(): Set<string> {
    const src = readFileSync(join(HERE, 'class7-cool-geek-vibe-coder.ts'), 'utf-8');
    const blocks = src.split(/export const \w+: DecisionContent =/).slice(1);
    const flagged = new Set<string>();
    for (const b of blocks) {
      const body = b.split('export const')[0];
      const m = body.match(/signalType:\s*"(\w+)"/);
      if (m && /l2SafeguardRequired:\s*true/.test(body)) flagged.add(m[1]);
    }
    return flagged;
  }

  it('every frozen-flagged class-7 signal has its content-template record flagged', () => {
    const frozenFlagged = frozenFlaggedSignals();
    expect(frozenFlagged.size).toBeGreaterThan(0); // not vacuous
    const recordFlagged = new Set(CLASS7_RECORDS.filter((r) => r.l2SafeguardRequired).map((r) => r.signalType));
    expect([...frozenFlagged].filter((s) => !recordFlagged.has(s))).toEqual([]);
  });
});

describe('class-7 — record↔runtime boundary (stored cells are bare core lines)', () => {
  const PLACEHOLDER = /\{[R{]/;
  for (const r of CLASS7_RECORDS) {
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

describe('class-7 — partition parity + registration (against the source of truth)', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  function canonicalClass7SignalTypes(): string[] {
    const src = readFileSync(join(HERE, '..', 'why-help-by-signal-type.ts'), 'utf-8');
    const re = /(\w+):\s*WHY_HELP_PER_CLASS\.(\w+)/g;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) if (m[2] === 'class7_cool_geek_vibe_coder') out.push(m[1]);
    return out;
  }

  const canonical = canonicalClass7SignalTypes();
  const recordSigs = CLASS7_RECORDS.map((r) => r.signalType);

  it('the partition assigns exactly 20 signalTypes to class 7', () => {
    expect(canonical.length).toBe(20);
    expect(new Set(canonical).size).toBe(20);
  });

  it('the shipped records cover the canonical 20 exactly — none missing, none extra, no duplicates', () => {
    const cs = new Set(canonical);
    const rs = new Set(recordSigs);
    expect(canonical.filter((s) => !rs.has(s))).toEqual([]);
    expect(recordSigs.filter((s) => !cs.has(s))).toEqual([]);
    expect(recordSigs.filter((s, i) => recordSigs.indexOf(s) !== i)).toEqual([]);
    expect(recordSigs.length).toBe(20);
  });

  it('every class-7 record is registered in the live shipped registry', () => {
    const shipped = new Set(SHIPPED_CONTENT_TEMPLATES.map((r) => r.signalType));
    expect(recordSigs.filter((s) => !shipped.has(s))).toEqual([]);
  });

  it('soft coverage — the whole class is all-5-columns, zero thin', () => {
    const cov = coverageMetric(CLASS7_RECORDS);
    expect(cov.total).toBe(20);
    expect(cov.allLevels).toBe(20);
    expect(cov.thin).toBe(0);
  });
});
