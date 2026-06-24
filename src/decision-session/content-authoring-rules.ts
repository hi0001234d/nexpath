/**
 * Content-authoring rule checkers for the per-maturity-column content templates.
 *
 * These are content-AGNOSTIC validators that encode the authoring methodology so
 * the preset-authoring workflow can enforce it as review gates and tests. They
 * CHECK records/text; they never author content.
 *
 *  - de-jargon: a maturity column reads as a plain observable action a non-coder
 *    could request and recognise; technical terms appear only as an optional
 *    trailing parenthetical (a small genuine-concept set is allowed at the top
 *    column).
 *  - keyword retention: a template's own keyword appears in every authored column.
 *  - escalation: practice-richness is non-decreasing across columns (a supplied
 *    per-column practice weight must be monotonic; thin templates may be flat).
 *  - coverage: every maturity level resolves (authored or closest-level fallback).
 *  - headline-only: a stored column form is just the two-channel headline cell —
 *    strength rows (amount/detail) are produced at runtime, never stored.
 */

import {
  MATURITY_LEVELS,
  resolveLevelForm,
  type ContentTemplateRecord,
  type MaturityLevel,
} from './content-template-schema.js';

// ── De-jargon ──────────────────────────────────────────────────────────────────

export interface JargonTerm {
  /** The technical term to avoid as a load-bearing instruction. */
  term: string;
  /** A plain-language way to ask for the same outcome. */
  plain: string;
}

/** Technical terms that must not carry the instruction on their own. */
export const DE_JARGON_TABLE: readonly JargonTerm[] = [
  { term: 'ADR',              plain: 'write down why you chose this approach' },
  { term: 'canary',          plain: 'roll it out to a few users first' },
  { term: 'blue-green',      plain: 'roll it out to a few users first' },
  { term: 'CI gate',         plain: 'make the checks run before merging' },
  { term: 'observability',   plain: 'hear about failures before users do' },
  { term: 'secrets manager', plain: 'keep keys out of the code' },
  { term: 'min-permission DB', plain: 'give the app only the database access it needs' },
  { term: 'edge-case matrix', plain: 'list the tricky cases and check each' },
];

/** The few genuine-concept terms permitted (de-worded) at the heaviest column. */
export const TOP_COLUMN_ALLOWED_CONCEPTS: readonly string[] = ['ADR', 'canary', 'blue-green', 'min-permission DB'];

export interface JargonViolation {
  term: string;
  plain: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Drop parenthetical spans — a term inside `(...)` is an allowed trailing aside. */
function stripParentheticals(text: string): string {
  return text.replace(/\([^)]*\)/g, ' ');
}

/**
 * Flag any technical term carrying the instruction on its own (i.e. appearing
 * OUTSIDE a parenthetical). At the heaviest column (level 5) the genuine-concept
 * set is allowed even bare.
 */
export function findJargonViolations(text: string, opts: { level?: MaturityLevel } = {}): JargonViolation[] {
  const bare = stripParentheticals(text);
  const atTop = opts.level === MATURITY_LEVELS[MATURITY_LEVELS.length - 1];
  const out: JargonViolation[] = [];
  for (const { term, plain } of DE_JARGON_TABLE) {
    if (!new RegExp(`\\b${escapeRegex(term)}\\b`, 'i').test(bare)) continue;
    if (atTop && TOP_COLUMN_ALLOWED_CONCEPTS.some((c) => c.toLowerCase() === term.toLowerCase())) continue;
    out.push({ term, plain });
  }
  return out;
}

// ── Same-topic / keyword retention ─────────────────────────────────────────────

/** The template's own keyword must appear in every AUTHORED column's option text. */
export function checkKeywordRetention(
  record: ContentTemplateRecord,
  keyword: string,
): { ok: boolean; missingLevels: MaturityLevel[] } {
  const kw = keyword.toLowerCase();
  const missing: MaturityLevel[] = [];
  for (const level of MATURITY_LEVELS) {
    const form = record.levelForms[level];
    if (!form) continue; // sparse — only authored columns are checked
    if (!form.cell.option.toLowerCase().includes(kw)) missing.push(level);
  }
  return { ok: missing.length === 0, missingLevels: missing };
}

// ── Escalating-form monotonicity ───────────────────────────────────────────────

/**
 * Practice-richness must be non-decreasing column-1→N. The semantic
 * "named-practice delta" judgment is a human/LLM review step; this checks a
 * supplied per-column practice-weight sequence is monotonic (thin = flat is OK).
 */
export function checkEscalation(practiceWeights: readonly number[]): { ok: boolean; firstDropIndex: number } {
  for (let i = 1; i < practiceWeights.length; i++) {
    if (practiceWeights[i] < practiceWeights[i - 1]) return { ok: false, firstDropIndex: i };
  }
  return { ok: true, firstDropIndex: -1 };
}

// ── Coverage (no column dropped) ───────────────────────────────────────────────

/** Every maturity level must resolve — authored, or via closest-level fallback. */
export function checkCoverage(record: ContentTemplateRecord): { ok: boolean; unreachableLevels: MaturityLevel[] } {
  const unreachable = MATURITY_LEVELS.filter((l) => resolveLevelForm(record.levelForms, l) === null);
  return { ok: unreachable.length === 0, unreachableLevels: unreachable };
}

// ── Headline-only (no stored strength rows) ────────────────────────────────────

/**
 * A stored column form is the two-channel HEADLINE cell only ({ option, whyDesc }).
 * Strength rows (amount/detail variants) are produced at runtime and must never be
 * smuggled into the stored record.
 */
export function checkHeadlineOnly(record: ContentTemplateRecord): { ok: boolean; offendingLevels: MaturityLevel[] } {
  const offending: MaturityLevel[] = [];
  for (const level of MATURITY_LEVELS) {
    const form = record.levelForms[level];
    if (!form) continue;
    const keys = Object.keys(form.cell).sort();
    if (keys.length !== 2 || keys[0] !== 'option' || keys[1] !== 'whyDesc') offending.push(level);
  }
  return { ok: offending.length === 0, offendingLevels: offending };
}

// ── Aggregate review (the record-level checks) ─────────────────────────────────

export interface RecordReview {
  ok: boolean;
  keywordRetention: ReturnType<typeof checkKeywordRetention>;
  coverage: ReturnType<typeof checkCoverage>;
  headlineOnly: ReturnType<typeof checkHeadlineOnly>;
  /** Per authored level: any de-jargon violations in the option + whyDesc. */
  jargonByLevel: Partial<Record<MaturityLevel, JargonViolation[]>>;
}

/** Run all content-agnostic record checks. (Escalation needs caller-supplied weights.) */
export function reviewRecord(record: ContentTemplateRecord, keyword: string): RecordReview {
  const keywordRetention = checkKeywordRetention(record, keyword);
  const coverage = checkCoverage(record);
  const headlineOnly = checkHeadlineOnly(record);
  const jargonByLevel: Partial<Record<MaturityLevel, JargonViolation[]>> = {};
  let jargonClean = true;
  for (const level of MATURITY_LEVELS) {
    const form = record.levelForms[level];
    if (!form) continue;
    const v = [...findJargonViolations(form.cell.option, { level }), ...findJargonViolations(form.cell.whyDesc, { level })];
    if (v.length) { jargonByLevel[level] = v; jargonClean = false; }
  }
  return {
    ok: keywordRetention.ok && coverage.ok && headlineOnly.ok && jargonClean,
    keywordRetention,
    coverage,
    headlineOnly,
    jargonByLevel,
  };
}
