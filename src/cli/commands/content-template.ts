/**
 * `nexpath content-template create [--shape] / validate <file>` — the authoring CLI
 * for shipped-preset content-template records.
 *
 *  - `create` scaffolds a record skeleton (a single level-1 floor, or `--shape`
 *    for the full 5-column ladder) for an author to fill in.
 *  - `validate` schema-validates a record file through the single §4.E1 gate and
 *    runs the §4.E3 review gates (de-jargon / coverage / headline-only, plus
 *    keyword retention when `--keyword` is given), naming which gate failed.
 *
 * The pure helpers (`scaffoldRecord`, `validateRecordObject`) carry the logic so
 * the actions stay thin and the behaviour is unit-tested without spawning a CLI.
 */

import { readFileSync } from 'node:fs';
import { SCHEMA_VERSION } from '../../store/schema.js';
import {
  validateContentTemplateRecord,
  MATURITY_LEVELS,
  type ContentTemplateRecord,
  type LevelForm,
  type MaturityLevel,
  type ValidationResult,
} from '../../decision-session/content-template-schema.js';
import { reviewRecord, type RecordReview } from '../../decision-session/content-authoring-rules.js';

const PLACEHOLDER: LevelForm = { kind: 'slot-variant', cell: { option: 'TODO: option text', whyDesc: 'TODO: why-desc core line' } };

/** Scaffold a record skeleton. `--shape` lays out the full 5-column ladder; otherwise just the level-1 floor. */
export function scaffoldRecord(signalType: string, opts: { shape?: boolean } = {}): ContentTemplateRecord {
  const levelForms: Partial<Record<MaturityLevel, LevelForm>> = {};
  if (opts.shape) {
    for (const level of MATURITY_LEVELS) levelForms[level] = { kind: PLACEHOLDER.kind, cell: { ...PLACEHOLDER.cell } };
  } else {
    levelForms[MATURITY_LEVELS[0]] = { kind: PLACEHOLDER.kind, cell: { ...PLACEHOLDER.cell } };
  }
  return { signalType, source: 'shipped', schemaVersion: SCHEMA_VERSION, levelForms, slots: [] };
}

export interface RecordValidation {
  schema: ValidationResult;
  /** Review gates — present only when the schema passed (and, for keyword retention, a keyword was given). */
  review?: RecordReview;
}

/** Schema-validate a record object, then (if valid) run the review gates. */
export function validateRecordObject(record: unknown, keyword?: string): RecordValidation {
  const schema = validateContentTemplateRecord(record);
  if (!schema.ok) return { schema };
  return { schema, review: reviewRecord(record as ContentTemplateRecord, keyword ?? '') };
}

// ── CLI actions (thin) ─────────────────────────────────────────────────────────

export function contentTemplateCreateAction(signalType: string, opts: { shape?: boolean } = {}): void {
  console.log(JSON.stringify(scaffoldRecord(signalType, opts), null, 2));
}

export function contentTemplateValidateAction(filePath: string, opts: { keyword?: string } = {}): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`content-template validate: cannot read/parse ${filePath}: ${String(err)}`);
    process.exitCode = 1;
    return;
  }
  const { schema, review } = validateRecordObject(parsed, opts.keyword);
  if (!schema.ok) {
    console.error('SCHEMA FAIL:');
    for (const e of schema.errors) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }
  const gateFailures: string[] = [];
  if (review) {
    if (!review.coverage.ok) gateFailures.push(`coverage: unreachable levels ${review.coverage.unreachableLevels.join(', ')}`);
    if (!review.headlineOnly.ok) gateFailures.push(`headline-only: stored strength rows at levels ${review.headlineOnly.offendingLevels.join(', ')}`);
    if (opts.keyword && !review.keywordRetention.ok) gateFailures.push(`keyword retention: missing at levels ${review.keywordRetention.missingLevels.join(', ')}`);
    for (const [lvl, viols] of Object.entries(review.jargonByLevel)) {
      gateFailures.push(`de-jargon (level ${lvl}): ${viols.map((v) => v.term).join(', ')}`);
    }
  }
  if (gateFailures.length > 0) {
    console.error('REVIEW GATE FAIL:');
    for (const f of gateFailures) console.error(`  - ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log(`OK: ${filePath} passes schema${opts.keyword ? ' + review gates' : ''}.`);
}
