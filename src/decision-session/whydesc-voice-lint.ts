/**
 * why-desc agent-voice LINT (detection) — the enforcement side of the rule enumerated in
 * `content-authoring-rules.ts` (`LADDER_META_TERMS`, `WHYDESC_VOICE_PATTERNS`) and specified in
 * docs `why-desc-agent-voice-spec-phase0`.
 *
 * It flags the mechanically-detectable why-desc voice drifts:
 *   - A-ladder-meta       : ladder-position meta vocabulary (`LADDER_META_TERMS`)
 *   - A-situation-rationale: a state described to the reader ("hasn't been…", "become possible")
 *   - B-user-narration    : 1st-person-user self-narration ("I'm at the moment…", "I need a shared…")
 *   - C-human-only        : a human performing the action ("you can check", "your device")
 *   - coherence-restate   : the why-desc opens with the SAME imperative verb as the option
 *
 * NECESSARY, NOT SUFFICIENT: a green cell is free of these detectable drifts, but authoring still
 * reviews every cell for voice. The Phase-0 gold exemplars are its fixtures — every AFTER must be
 * clean, every BEFORE must flag.
 */

import { LADDER_META_TERMS } from './content-authoring-rules.js';
import { MATURITY_LEVELS } from './content-template-schema.js';
import type { ContentTemplateRecord, MaturityLevel } from './content-template-schema.js';

export type WhyDescPatternId =
  | 'A-ladder-meta'
  | 'A-situation-rationale'
  | 'B-user-narration'
  | 'C-human-only'
  | 'coherence-restate';

export interface WhyDescViolation {
  pattern: WhyDescPatternId;
  /** The offending cue / term that matched. */
  match: string;
}

/** A2 — situation-rationale cues: a state described to the reader, not an instruction. */
const SITUATION_RATIONALE_CUES: readonly string[] = [
  "hasn't been",
  "haven't been",
  'has been in',
  'have been in',
  'not yet been',
  'become possible',
  'becomes possible',
  'is still open',
  'are still',
  'risk of un',
];

/** B — 1st-person-user narration cues (the user narrating their own state, not addressing the agent). */
const USER_NARRATION_CUES: readonly string[] = [
  "i'm at the moment",
  "i'm at the point",
  'i need a shared',
  'i need to understand',
];

/** C — human-only cues (a human performing the action on a screen); "you" addressed to the agent is allowed. */
const HUMAN_ONLY_CUES: readonly string[] = [
  'you can see',
  'you can check',
  'you can test',
  'you can open',
  'you can try',
  'you can verify',
  'your phone',
  'your device',
  'your browser',
  'your machine',
  'your screen',
];

/** Imperative verbs used for the coherence (restate) check. */
const IMPERATIVE_VERBS: ReadonlySet<string> = new Set([
  'write', 'run', 'list', 'check', 'ask', 'add', 'name', 'define', 'review', 'look', 'make',
  'turn', 'set', 'confirm', 'describe', 'trace', 'map', 'pick', 'draft', 'create', 'verify',
  'produce', 'explain', 'sketch', 'outline', 'break', 'split', 'note', 'enumerate', 'walk',
  'tell', 'give', 'show', 'cover', 'wire', 'scope', 'prioritise', 'prioritize', 'rank',
]);

/** Leading word of a string, skipping list numbering ("1. Name …" → "name"). */
function leadingWord(s: string): string {
  const m = s.trim().match(/^[0-9.)\s]*([A-Za-z']+)/);
  return m ? m[1].toLowerCase() : '';
}

/**
 * Detect why-desc voice violations. When `option` is supplied, the coherence (restate) check
 * runs: a why-desc that opens with the option's own leading imperative verb is a restate.
 */
export function findWhyDescVoiceViolations(whyDesc: string, option?: string): WhyDescViolation[] {
  const out: WhyDescViolation[] = [];
  const w = whyDesc.toLowerCase();

  for (const t of LADDER_META_TERMS) {
    if (w.includes(t)) { out.push({ pattern: 'A-ladder-meta', match: t }); break; }
  }
  for (const c of SITUATION_RATIONALE_CUES) {
    if (w.includes(c)) { out.push({ pattern: 'A-situation-rationale', match: c }); break; }
  }
  for (const c of USER_NARRATION_CUES) {
    if (w.includes(c)) { out.push({ pattern: 'B-user-narration', match: c }); break; }
  }
  for (const c of HUMAN_ONLY_CUES) {
    if (w.includes(c)) { out.push({ pattern: 'C-human-only', match: c }); break; }
  }
  if (option) {
    const ov = leadingWord(option);
    const wv = leadingWord(whyDesc);
    if (ov && ov === wv && IMPERATIVE_VERBS.has(ov)) {
      out.push({ pattern: 'coherence-restate', match: ov });
    }
  }
  return out;
}

export interface CellVoiceViolation {
  signalType: string;
  register: 'base' | 'beginner' | 'formal' | 'casual' | string;
  level: MaturityLevel;
  role?: string;
  violations: WhyDescViolation[];
}

/** Scan one record's cells (base + register overrides + role overrides) for why-desc voice drifts. */
export function scanRecordWhyDescVoice(record: ContentTemplateRecord): CellVoiceViolation[] {
  const out: CellVoiceViolation[] = [];
  const scan = (
    forms: Partial<Record<MaturityLevel, { cell: { option: string; whyDesc: string } }>> | undefined,
    register: string,
    role?: string,
  ) => {
    if (!forms) return;
    for (const level of MATURITY_LEVELS) {
      const cell = forms[level]?.cell;
      if (!cell) continue;
      const violations = findWhyDescVoiceViolations(cell.whyDesc, cell.option);
      if (violations.length) out.push({ signalType: record.signalType, register, level, role, violations });
    }
  };
  scan(record.levelForms, 'base');
  const ro = (record.registerOverrides ?? {}) as Record<string, { levelForms?: Parameters<typeof scan>[0] }>;
  for (const reg of Object.keys(ro)) scan(ro[reg]?.levelForms, reg);
  const rlo = (record.roleOverrides ?? {}) as Record<string, { levelForms?: Parameters<typeof scan>[0] }>;
  for (const role of Object.keys(rlo)) scan(rlo[role]?.levelForms, 'base', role);
  return out;
}

export interface WhyDescScanReport {
  /** Total flagged cells. */
  total: number;
  /** Flagged cells per signalType. */
  bySignal: Record<string, number>;
  /** Flagged cells per pattern id. */
  byPattern: Record<WhyDescPatternId, number>;
  /** The flat list. */
  cells: CellVoiceViolation[];
}

/** Scan a whole record set → the per-signal / per-pattern worklist (the red-count reporter). */
export function scanWhyDescVoice(records: readonly ContentTemplateRecord[]): WhyDescScanReport {
  const cells: CellVoiceViolation[] = [];
  for (const r of records) cells.push(...scanRecordWhyDescVoice(r));
  const bySignal: Record<string, number> = {};
  const byPattern = {} as Record<WhyDescPatternId, number>;
  for (const c of cells) {
    bySignal[c.signalType] = (bySignal[c.signalType] ?? 0) + 1;
    for (const v of c.violations) byPattern[v.pattern] = (byPattern[v.pattern] ?? 0) + 1;
  }
  return { total: cells.length, bySignal, byPattern, cells };
}
