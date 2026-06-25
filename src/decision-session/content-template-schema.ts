/**
 * Content-template record FORMAT + schema validator + slot/level primitives.
 *
 * The serializable DATA record the content-template engine resolves and composes:
 * a per-signal record carrying a sparse maturity-level map of two-channel leaf
 * cells ({ option, whyDesc }), a declared slot list, param-axis tags, a source
 * tier, and a schema version. This module is the single shared gate — the engine
 * (runtime) and the build-time preset checks both validate through it.
 *
 * Two slot grammars, two delimiters, no collision:
 *   - composition slots `{{name}}` (double brace) — resolved by the compose pass.
 *   - runtime slots `{R4_OPEN}` / `{R4_CLOSE}` / `{R5_INJECT: hint}` (single brace)
 *     — reserved + UNCHANGED; the compose pass never touches them.
 */

import { SCHEMA_VERSION } from '../store/schema.js';

/** Maturity levels the content surface supports — declared in ONE place. Adding a
 *  6th level = extend this array + author its forms; no logic rewrite. */
export const MATURITY_LEVELS = [1, 2, 3, 4, 5] as const;
export type MaturityLevel = (typeof MATURITY_LEVELS)[number];
const MIN_LEVEL = MATURITY_LEVELS[0];
const MAX_LEVEL = MATURITY_LEVELS[MATURITY_LEVELS.length - 1];

/** T6 cascade tier a record came from (uploaded → autogen → shipped → default). */
export type ContentTemplateSource = 'uploaded' | 'autogen' | 'shipped' | 'default';
export const CONTENT_TEMPLATE_SOURCES: readonly ContentTemplateSource[] = ['uploaded', 'autogen', 'shipped', 'default'];

/** A level form is either a slot-fill over a shared base, or a full standalone form. */
export type LevelFormKind = 'slot-variant' | 'structural-variant';

/** The two-channel leaf cell. Both strings carry slots ({{}} compose + {R...} runtime). */
export interface TwoChannelCell {
  option: string;
  whyDesc: string;
}

/** One maturity-column headline (strength-L1) form. L2/L3 strength rows are produced
 *  by the engine's (a)+(b) hybrid, not stored. */
export interface LevelForm {
  kind: LevelFormKind;
  cell: TwoChannelCell;
}

/** The 4 composition slot types. */
export type SlotType = 'static-ref' | 'literal' | 'param-value' | 'choice';
export const SLOT_TYPES: readonly SlotType[] = ['static-ref', 'literal', 'param-value', 'choice'];

/** AR-1 Option-C param-axis representation tags (the closed set a record may declare). */
export type ParamAxisTag = 'closed-ordinal' | 'nominal' | 'extensible' | 'open';
export const PARAM_AXIS_TAGS: readonly ParamAxisTag[] = ['closed-ordinal', 'nominal', 'extensible', 'open'];

export interface Slot {
  /** Referenced in a cell as `{{name}}`. */
  name: string;
  type: SlotType;
  /** `literal` → the literal value; `static-ref`/`param-value` → the source key. */
  ref?: string;
  /** `choice` → the enumerated variant set. */
  choices?: string[];
  /** Value used when the source yields nothing. */
  fallback?: string;
}

export interface ContentTemplateRecord {
  signalType: string;
  source: ContentTemplateSource;
  schemaVersion: number;
  /** Sparse maturity map: level → headline form. The level-1 floor is MANDATORY. */
  levelForms: Partial<Record<MaturityLevel, LevelForm>>;
  slots: Slot[];
  /** AR-1 param-axis tags, keyed by axis name (each value is a closed AR-1 tag). */
  paramAxes?: Record<string, ParamAxisTag>;
  /**
   * F8 spine practices — the named rhythms that intensify across ALL maturity
   * columns (a strengthening thread, not slotted to one cell), e.g. review/commit
   * cadence. An authoring annotation (the engine does not consume it); optional +
   * additive (§3.C optionality / §6.1 S9). Omitted when the family has no spine.
   */
  spine?: string[];
  /**
   * Marks a record whose topic is an intrinsically sensitive action (deploys,
   * secrets/credentials, dependency installs, production touches, destructive or
   * multi-file changes). When set, every authored column carries a confirm-seek in
   * its why-desc, and the runtime safeguard path treats the record as sensitive.
   * Optional + additive; omitted (defaults false) for non-sensitive records.
   */
  l2SafeguardRequired?: boolean;
  /**
   * The action-specific confirm-seek sentence for a sensitive record. The engine
   * appends it as the LAST line of whichever maturity column is served (after the
   * grounding facts) — so it covers every column uniformly, including the frozen
   * col-3 anchor whose stored why-desc cannot carry it. Present iff the record is
   * sensitive; names that record's own action (no cross-record mismatch).
   */
  l2SafeguardLine?: string;
}

// ── Validation (the single schema gate) ───────────────────────────────────────

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function isCell(c: unknown): c is TwoChannelCell {
  return !!c && typeof c === 'object'
    && typeof (c as TwoChannelCell).option === 'string'
    && typeof (c as TwoChannelCell).whyDesc === 'string';
}

/** Validate a content-template record's shape. One gate, used at runtime + build. */
export function validateContentTemplateRecord(record: unknown): ValidationResult {
  const errors: string[] = [];
  const r = record as ContentTemplateRecord;
  if (!r || typeof r !== 'object') return { ok: false, errors: ['record is not an object'] };

  if (typeof r.signalType !== 'string' || r.signalType === '') errors.push('signalType must be a non-empty string');
  if (!CONTENT_TEMPLATE_SOURCES.includes(r.source)) errors.push(`source must be one of ${CONTENT_TEMPLATE_SOURCES.join('|')}`);
  if (typeof r.schemaVersion !== 'number' || r.schemaVersion > SCHEMA_VERSION) {
    errors.push(`schemaVersion must be a number <= ${SCHEMA_VERSION}`);
  }

  // levelForms — sparse, level-1 floor mandatory, each form well-formed.
  const lf = r.levelForms;
  if (!lf || typeof lf !== 'object') {
    errors.push('levelForms must be an object');
  } else {
    if (!lf[MIN_LEVEL]) errors.push(`levelForms is missing the mandatory level-${MIN_LEVEL} floor`);
    for (const [k, form] of Object.entries(lf)) {
      const lvl = Number(k);
      if (!(MATURITY_LEVELS as readonly number[]).includes(lvl)) errors.push(`levelForms has out-of-range level ${k}`);
      if (!form || (form.kind !== 'slot-variant' && form.kind !== 'structural-variant')) errors.push(`levelForms[${k}].kind invalid`);
      else if (!isCell(form.cell)) errors.push(`levelForms[${k}].cell must be { option, whyDesc } strings`);
    }
  }

  // slots — each well-formed for its type.
  if (!Array.isArray(r.slots)) {
    errors.push('slots must be an array');
  } else {
    for (const s of r.slots) {
      if (!s || typeof s.name !== 'string' || s.name === '') { errors.push('slot.name must be a non-empty string'); continue; }
      if (!SLOT_TYPES.includes(s.type)) errors.push(`slot ${s.name}: type must be one of ${SLOT_TYPES.join('|')}`);
      if ((s.type === 'static-ref' || s.type === 'param-value') && (typeof s.ref !== 'string' || s.ref === '')) {
        errors.push(`slot ${s.name}: ${s.type} requires a ref`);
      }
      if (s.type === 'choice' && (!Array.isArray(s.choices) || s.choices.length === 0)) {
        errors.push(`slot ${s.name}: choice requires a non-empty choices[]`);
      }
    }
  }

  // param-axes — optional, but when present every value must be a closed AR-1 tag.
  if (r.paramAxes !== undefined) {
    if (typeof r.paramAxes !== 'object' || r.paramAxes === null) {
      errors.push('paramAxes must be an object when present');
    } else {
      for (const [axis, tag] of Object.entries(r.paramAxes)) {
        if (!PARAM_AXIS_TAGS.includes(tag as ParamAxisTag)) {
          errors.push(`paramAxes.${axis}: tag must be one of ${PARAM_AXIS_TAGS.join('|')}`);
        }
      }
    }
  }

  // spine — optional; when present, a non-empty array of named-practice strings.
  if (r.spine !== undefined) {
    if (!Array.isArray(r.spine) || r.spine.some((s) => typeof s !== 'string' || s === '')) {
      errors.push('spine must be an array of non-empty strings when present');
    }
  }

  // l2SafeguardRequired — optional; when present, a boolean.
  if (r.l2SafeguardRequired !== undefined && typeof r.l2SafeguardRequired !== 'boolean') {
    errors.push('l2SafeguardRequired must be a boolean when present');
  }

  // l2SafeguardLine — optional; when present, a non-empty string.
  if (r.l2SafeguardLine !== undefined && (typeof r.l2SafeguardLine !== 'string' || r.l2SafeguardLine === '')) {
    errors.push('l2SafeguardLine must be a non-empty string when present');
  }

  return { ok: errors.length === 0, errors };
}

// ── Slot resolution + injection guard ─────────────────────────────────────────

const COMPOSE_SLOT_RE = /\{\{(\w+)\}\}/g;

/**
 * Injection guard: a slot VALUE is literal data, so neutralise any composition
 * or runtime grammar inside it (a value must never inject a `{{…}}` or `{R…}`
 * placeholder). Breaks the opening token so neither pass re-processes it.
 */
export function escapeSlotValue(value: string): string {
  return value
    .replace(/\{\{/g, '{ {')
    .replace(/\{R(?=4_OPEN|4_CLOSE|5_INJECT)/g, '{ R');
}

/** Sources the 4 slot types resolve against. */
export interface SlotContext {
  /** `param-value`: ref → value. */
  params?: Record<string, string>;
  /** `static-ref`: ref → value (filled from static content by signalType×register×param). */
  staticRefs?: Record<string, string>;
  /** `choice`: pick one of slot.choices (defaults to the first). */
  choiceSelector?: (slot: Slot) => string | undefined;
}

/** Resolve one slot's value (with fallback), already injection-guarded. */
export function resolveSlotValue(slot: Slot, ctx: SlotContext = {}): string {
  let v: string | undefined;
  switch (slot.type) {
    case 'literal':     v = slot.ref; break;
    case 'param-value': v = ctx.params?.[slot.ref ?? '']; break;
    case 'static-ref':  v = ctx.staticRefs?.[slot.ref ?? '']; break;
    case 'choice':      v = ctx.choiceSelector?.(slot) ?? slot.choices?.[0]; break;
  }
  return escapeSlotValue(v ?? slot.fallback ?? '');
}

/**
 * Phase-1 compose: fill `{{name}}` from resolved slot values, PRESERVING every
 * `{R...}` runtime placeholder untouched (distinct delimiter). An unfilled
 * `{{name}}` is left as-is (the runtime/Phase-2 never matches it).
 */
export function composePhase1(template: string, slots: readonly Slot[], ctx: SlotContext = {}): string {
  const byName = new Map(slots.map((s) => [s.name, s]));
  return template.replace(COMPOSE_SLOT_RE, (whole, name: string) => {
    const slot = byName.get(name);
    return slot ? resolveSlotValue(slot, ctx) : whole;
  });
}

// ── Level-form resolution (closest-level downward fallback) ────────────────────

/**
 * Resolve the form for the requested maturity level. Exact match wins; otherwise
 * the NEAREST authored level within `[level-1 floor, L+1 clamp]`, ties → lower.
 * The mandatory level-1 floor guarantees a result.
 */
export function resolveLevelForm(
  levelForms: ContentTemplateRecord['levelForms'],
  level: MaturityLevel,
): { level: MaturityLevel; form: LevelForm } | null {
  const exact = levelForms[level];
  if (exact) return { level, form: exact };

  const upper = Math.min(MAX_LEVEL, level + 1) as MaturityLevel;
  let best: { level: MaturityLevel; form: LevelForm } | null = null;
  let bestDist = Infinity;
  for (const l of MATURITY_LEVELS) {
    if (l > upper) break;            // within the L+1 clamp
    const form = levelForms[l];
    if (!form) continue;
    const dist = Math.abs(l - level);
    if (dist < bestDist) {           // strict < → ascending scan keeps the LOWER on a tie
      best = { level: l, form };
      bestDist = dist;
    }
  }
  return best;
}
