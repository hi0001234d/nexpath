/**
 * Content-template build tooling — the CREATE/REVIEW/TEST harness for the shipped
 * preset records. Pure, dependency-light functions the CLI command and the
 * build-time CTA-D3 tests both call:
 *
 *  - the shipped-preset REGISTRY (the in-source records the engine resolves);
 *  - a set schema-validator (one gate, reused from the record schema);
 *  - the build-GATE checks — every record has a mandatory level-1 floor (HARD;
 *    a miss must fail the build so presets never fail at runtime), and the
 *    same-topic keyword check over both channels;
 *  - a soft coverage metric (how many records author all levels vs stay thin);
 *  - a read-only fixture enumerator (signalType × param-vector × level).
 *
 * Authoring the per-signalType CONTENT itself is USER-owned (HIGH-RISK); this
 * module is the content-agnostic scaffolding that validates + gates whatever is
 * registered. The registry is empty until content is authored — the gate then
 * holds it to the level-1-floor contract.
 */

import {
  validateContentTemplateRecord,
  resolveLevelForm,
  MATURITY_LEVELS,
  type ContentTemplateRecord,
  type MaturityLevel,
} from './content-template-schema.js';
import { CLASS1_RECORDS } from './content-templates/class1-records.js';
import { CLASS2_RECORDS } from './content-templates/class2-records.js';
import { CLASS3_RECORDS } from './content-templates/class3-records.js';
import { CLASS4_RECORDS } from './content-templates/class4-records.js';
import { CLASS5_RECORDS } from './content-templates/class5-records.js';

/**
 * The in-source shipped-preset records the engine resolves at the `shipped` tier.
 * Authored per class (§4.E2 CTA-D1); the build gate + harness operate over the set.
 */
export const SHIPPED_CONTENT_TEMPLATES: readonly ContentTemplateRecord[] = [
  ...CLASS1_RECORDS,
  ...CLASS2_RECORDS,
  ...CLASS3_RECORDS,
  ...CLASS4_RECORDS,
  ...CLASS5_RECORDS,
];

// ── Set schema validation (one gate over the whole registry) ───────────────────

export interface SetValidation {
  ok: boolean;
  /** signalType → schema errors (only failing records appear). */
  errorsBySignalType: Record<string, string[]>;
}

/** Schema-validate every record (the single §4.E1 gate, applied to the set). */
export function validateRecordSet(records: readonly ContentTemplateRecord[]): SetValidation {
  const errorsBySignalType: Record<string, string[]> = {};
  for (const r of records) {
    const res = validateContentTemplateRecord(r);
    if (!res.ok) errorsBySignalType[r.signalType] = res.errors;
  }
  return { ok: Object.keys(errorsBySignalType).length === 0, errorsBySignalType };
}

// ── T3 coverage — the HARD level-1-floor build gate ────────────────────────────

export interface FloorCoverage {
  ok: boolean;
  /** signalTypes missing the mandatory level-1 form. */
  missingFloor: string[];
}

/** Every record MUST author a level-1 floor form; a miss fails the build (T3). */
export function checkLevel1FloorCoverage(records: readonly ContentTemplateRecord[]): FloorCoverage {
  const missingFloor = records.filter((r) => !r.levelForms[MATURITY_LEVELS[0]]).map((r) => r.signalType);
  return { ok: missingFloor.length === 0, missingFloor };
}

// ── T1-BUILD same-topic — keyword present in BOTH channels of every column ──────

export interface TopicKeywordResult {
  ok: boolean;
  /** Authored levels whose option is missing the keyword. */
  missingInOption: MaturityLevel[];
  /** Authored levels whose why-desc is missing the keyword. */
  missingInWhyDesc: MaturityLevel[];
}

/** T1-BUILD: the signalType's own keyword appears in the option AND the why-desc of every authored column. */
export function checkTopicKeyword(record: ContentTemplateRecord, keyword: string): TopicKeywordResult {
  const kw = keyword.toLowerCase();
  const missingInOption: MaturityLevel[] = [];
  const missingInWhyDesc: MaturityLevel[] = [];
  for (const level of MATURITY_LEVELS) {
    const form = record.levelForms[level];
    if (!form) continue;
    if (!form.cell.option.toLowerCase().includes(kw)) missingInOption.push(level);
    if (!form.cell.whyDesc.toLowerCase().includes(kw)) missingInWhyDesc.push(level);
  }
  return { ok: missingInOption.length === 0 && missingInWhyDesc.length === 0, missingInOption, missingInWhyDesc };
}

// ── T3-metric (SOFT) — coverage shape ──────────────────────────────────────────

export interface CoverageMetric {
  total: number;
  /** Records authoring a form at every maturity level. */
  allLevels: number;
  /** Records authoring only the level-1 floor (thin). */
  thin: number;
  allLevelsPct: number;
  thinPct: number;
}

/** Soft coverage shape — track all-levels vs thin (a review flag, not a build fail). */
export function coverageMetric(records: readonly ContentTemplateRecord[]): CoverageMetric {
  const total = records.length;
  let allLevels = 0;
  let thin = 0;
  for (const r of records) {
    const authored = MATURITY_LEVELS.filter((l) => r.levelForms[l]).length;
    if (authored === MATURITY_LEVELS.length) allLevels++;
    if (authored === 1) thin++;
  }
  return {
    total,
    allLevels,
    thin,
    allLevelsPct: total === 0 ? 0 : allLevels / total,
    thinPct: total === 0 ? 0 : thin / total,
  };
}

// ── Copy-paste / option length budget (§5.10.5.7) ──────────────────────────────

/**
 * Char budget for a stored option (the copy-pasteable prompt). The runtime anchor
 * is droppable-first on top of this; this caps the AUTHORED option so it stays a
 * sendable single message. An authoring discipline value, not a runtime limit.
 */
export const OPTION_MAX_CHARS = 400;

export interface OptionBudgetResult {
  ok: boolean;
  /** Authored levels whose option exceeds the char budget. */
  overLevels: MaturityLevel[];
}

/** Every authored option must fit the copy-paste char budget. */
export function checkOptionLengthBudget(record: ContentTemplateRecord, max: number = OPTION_MAX_CHARS): OptionBudgetResult {
  const over = MATURITY_LEVELS.filter((l) => {
    const f = record.levelForms[l];
    return f !== undefined && f.cell.option.length > max;
  });
  return { ok: over.length === 0, overLevels: over };
}

// ── Build gate (aggregate: schema + HARD floor) ────────────────────────────────

export interface BuildGateResult {
  ok: boolean;
  schema: SetValidation;
  floor: FloorCoverage;
}

/** Run the build-time gate: the schema gate + the HARD level-1-floor gate. */
export function runBuildGate(records: readonly ContentTemplateRecord[] = SHIPPED_CONTENT_TEMPLATES): BuildGateResult {
  const schema = validateRecordSet(records);
  const floor = checkLevel1FloorCoverage(records);
  return { ok: schema.ok && floor.ok, schema, floor };
}

// ── Fixture generator (W-6) — read-only enumeration ────────────────────────────

export interface Fixture {
  signalType: string;
  paramVector: Record<string, string>;
  level: MaturityLevel;
  /** The level actually served (closest-level fallback may differ from `level`). */
  servedLevel: MaturityLevel | null;
}

/**
 * Enumerate signalType × param-vector × level fixtures for the harness — read-only.
 * `servedLevel` records what the level resolver would actually serve (so the
 * fixtures exercise the closest-level fallback, not just exact hits).
 */
export function enumerateFixtures(
  records: readonly ContentTemplateRecord[],
  paramVectors: readonly Record<string, string>[] = [{}],
): Fixture[] {
  const out: Fixture[] = [];
  for (const r of records) {
    for (const paramVector of paramVectors) {
      for (const level of MATURITY_LEVELS) {
        out.push({ signalType: r.signalType, paramVector, level, servedLevel: resolveLevelForm(r.levelForms, level)?.level ?? null });
      }
    }
  }
  return out;
}
