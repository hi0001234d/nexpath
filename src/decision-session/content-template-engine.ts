/**
 * ContentTemplateEngine — owns the good-pattern-present polarity. It composes
 * personalised decision-session content (the two-channel option / why-desc model
 * plus per-user generated templates).
 *
 * Two layers live here:
 *  - the ENGINE identity + routing (`contentTemplateEngine`), registered in the
 *    Layer-B router; its `run()` is the live entry point.
 *  - the per-advisory CONTENT COMPOSITOR stages (below) — the deterministic
 *    orchestration the engine uses to resolve + compose one record per advisory.
 *
 * Compositor pipeline (content compositor ONLY — no fire/no-fire decision; that
 * stays upstream):
 *  1. Resolve the record by source cascade: prefer an uploaded record, then an
 *     auto-generated one, then the shipped default, then the closest default —
 *     each candidate schema-validated through the shared gate; an invalid
 *     candidate is rejected and the cascade falls through to the next source.
 *  2. Resolve the maturity column: the form for the requested level, or the
 *     closest authored level (downward, within a +1 clamp); the level-1 floor
 *     guarantees a result.
 *  3. Strength step ("show simpler"): an always-run derive produces the
 *     one-notch-simpler cell on every step; a bounded timeout / error is the ONLY
 *     path to the shared simpler-form fallback (no shortcut may pre-empt the
 *     derive for any other reason).
 *  4. Two-channel compose: the option text (with an optional droppable-first
 *     action anchor) and the why-desc (a frozen core line + ranked, capped,
 *     injection-guarded grounding facts; any sensitive-action safeguard line is
 *     preserved in EVERY level sibling and is never dropped).
 *
 * The LLM-backed operations (the simpler-derive and the option/why-desc grounding
 * weave) are INJECTED seams: this module owns the deterministic orchestration and
 * composition; the caller supplies the grounding runtime. With no seam supplied,
 * the engine composes deterministically and fires nothing. `run()` stays dark
 * until the records, the live render-path wiring, and the grounding runtime are
 * in place (a later activation step).
 */

import type { Engine, ContentSpec } from './engine-registry.js';
import {
  validateContentTemplateRecord,
  resolveLevelForm,
  composePhase1,
  escapeSlotValue,
  CONTENT_TEMPLATE_SOURCES,
  type ContentTemplateRecord,
  type ContentTemplateSource,
  type TwoChannelCell,
  type LevelForm,
  type MaturityLevel,
  type Slot,
  type SlotContext,
} from './content-template-schema.js';

export const contentTemplateEngine: Engine = {
  name: 'content-template',
  accepts: (polarity) => polarity === 'good_present',
  run: (): ContentSpec => {
    throw new Error(
      'ContentTemplateEngine.run() is not yet wired live — the compositor stages exist, but record content, the render-path intercept, and the grounding runtime are authored/activated separately',
    );
  },
};

// ── Stage 1: record resolution by source cascade ───────────────────────────────

/** Source preference order: uploaded → auto-gen → shipped → default. */
export const SOURCE_CASCADE: readonly ContentTemplateSource[] = CONTENT_TEMPLATE_SOURCES;

/** Looks up the raw record candidate for a given source tier (undefined = none here). */
export type RecordCandidateLookup = (source: ContentTemplateSource) => unknown;

export interface ResolvedRecord {
  record: ContentTemplateRecord;
  source: ContentTemplateSource;
}

/**
 * Walk the source cascade and return the first candidate that passes the schema
 * gate. An invalid candidate is rejected (not served) and the cascade continues —
 * a corrupt higher-priority record never blocks a valid lower one.
 */
export function resolveRecord(lookup: RecordCandidateLookup): ResolvedRecord | null {
  for (const source of SOURCE_CASCADE) {
    const candidate = lookup(source);
    if (candidate === undefined || candidate === null) continue;
    if (validateContentTemplateRecord(candidate).ok) {
      return { record: candidate as ContentTemplateRecord, source };
    }
    // invalid → reject + fall through to the next source
  }
  return null;
}

// ── Stage 2: maturity-column resolution ────────────────────────────────────────

/** Resolve the level form (exact, else closest authored downward within the clamp). */
export function resolveColumn(record: ContentTemplateRecord, level: MaturityLevel): { level: MaturityLevel; form: LevelForm } | null {
  return resolveLevelForm(record.levelForms, level);
}

// ── Stage 3: strength step — always-run derive, bounded-timeout → fallback ──────

/** The injected "one-notch-simpler" derive. May reject or hang; the engine bounds it. */
export type SimplerDeriver = (current: TwoChannelCell) => Promise<TwoChannelCell>;

export interface StrengthStepResult {
  cell: TwoChannelCell;
  /** `derived` = the derive produced it; `fallback` = the derive failed/timed out. */
  source: 'derived' | 'fallback';
}

/** Default bound for the derive before falling back (ms). */
export const DERIVE_TIMEOUT_MS = 4000;

/** Race a promise against a timeout; rejects with a timeout error if it loses. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('derive-timeout')), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Run the simpler-step. The derive is ALWAYS invoked; the supplied fallback cell
 * is used ONLY when the derive errors or exceeds the timeout — no other path may
 * substitute the fallback (the always-run guarantee).
 */
export async function stepSimpler(
  current: TwoChannelCell,
  derive: SimplerDeriver,
  fallback: TwoChannelCell,
  opts: { timeoutMs?: number } = {},
): Promise<StrengthStepResult> {
  try {
    const cell = await withTimeout(derive(current), opts.timeoutMs ?? DERIVE_TIMEOUT_MS);
    return { cell, source: 'derived' };
  } catch {
    return { cell: fallback, source: 'fallback' };
  }
}

// ── Stage 4: grounding-fact select / rank / cap ────────────────────────────────

/** One grounding fact from a param source (dev-env / workflow / work-style). */
export interface GroundingFact {
  key: string;
  value: string;
  /** Relevance/confidence weight (higher = ranked first). */
  weight: number;
  /** `corroborated` (observed practice) outranks `capability` (environment-stated) at equal weight. */
  tier: 'corroborated' | 'capability';
}

const TIER_RANK: Record<GroundingFact['tier'], number> = { corroborated: 1, capability: 0 };

/** Rank facts (weight desc, then corroborated over capability, then key) and cap to `max`. */
export function selectRankCapFacts(facts: readonly GroundingFact[], max: number): GroundingFact[] {
  if (max <= 0) return [];
  return [...facts]
    .sort((a, b) => (b.weight - a.weight) || (TIER_RANK[b.tier] - TIER_RANK[a.tier]) || a.key.localeCompare(b.key))
    .slice(0, max);
}

// ── Stage 4: two-channel composition ───────────────────────────────────────────

export interface ComposeOptionInput {
  cell: TwoChannelCell;
  slots: readonly Slot[];
  ctx?: SlotContext;
  /** Optional 2–5-word action anchor, merged onto the option. */
  anchor?: string;
  /** Char budget — when set and the anchored option overflows, the anchor is dropped FIRST. */
  lengthBudget?: number;
}

/**
 * Compose the option text: fill composition slots (runtime `{R...}` preserved),
 * then merge the optional action anchor — dropping the anchor first if the result
 * would exceed the length budget (the static option text is never truncated).
 */
export function composeOption(input: ComposeOptionInput): string {
  const base = composePhase1(input.cell.option, input.slots, input.ctx);
  if (!input.anchor) return base;
  const anchored = `${base} ${input.anchor}`.trimEnd();
  if (input.lengthBudget !== undefined && anchored.length > input.lengthBudget) return base; // anchor droppable-first
  return anchored;
}

export interface ComposeWhyDescInput {
  cell: TwoChannelCell;
  slots: readonly Slot[];
  ctx?: SlotContext;
  /** Grounding facts to weave in (already topic-filtered by the caller). */
  facts?: readonly GroundingFact[];
  /** Max grounding lines (the why-desc budget). */
  factCap?: number;
  /** Sensitive-action safeguard line — preserved in EVERY sibling, never dropped/capped. */
  l2Safeguard?: string;
}

/**
 * Compose the CA-bound why-desc: the frozen core line, then the ranked/capped
 * grounding facts (their values are external data → injection-guarded so they can
 * never inject composition or runtime grammar), then — always, regardless of the
 * fact cap — the sensitive-action safeguard line if present. Composition slots are
 * filled; runtime `{R...}` placeholders are preserved for the downstream pass.
 */
export function composeWhyDesc(input: ComposeWhyDescInput): string {
  const lines: string[] = [input.cell.whyDesc];
  if (input.facts && input.factCap !== undefined) {
    for (const f of selectRankCapFacts(input.facts, input.factCap)) lines.push(escapeSlotValue(f.value));
  }
  if (input.l2Safeguard) lines.push(input.l2Safeguard); // survives in every sibling — never dropped
  return composePhase1(lines.join('\n'), input.slots, input.ctx);
}
