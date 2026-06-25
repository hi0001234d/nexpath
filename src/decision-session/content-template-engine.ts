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

import type OpenAI from 'openai';
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
import type { OptionEntry } from './options.js';
import type { FactMap } from '../env/types.js';
import type { RightGoodProfile } from '../classifier/right-good-aggregator.js';
import type { WorkStyleProfile } from '../classifier/work-style-traits.js';
import type { SignalDefinition } from '../classifier/types.js';
import { SIGNAL_MAP } from '../classifier/signals.js';
import { deriveSimplerCell, weaveWhyDesc, extractParamsFromPrompts, type ExtractedParam } from './content-template-grounding.js';

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

// ── Live grounding wiring (the real LLM seams bound to the orchestration) ───────

/**
 * The (a)+(b) hybrid, live: run the always-fire simpler-derive through the real
 * LLM grounding, with the supplied (a) form as the bounded-failure fallback.
 */
export function stepSimplerLive(
  current: TwoChannelCell,
  fallback: TwoChannelCell,
  client?: OpenAI,
  opts: { timeoutMs?: number; l2Safeguard?: string } = {},
): Promise<StrengthStepResult> {
  return stepSimpler(current, (cell) => deriveSimplerCell(cell, client, { l2Safeguard: opts.l2Safeguard }), fallback, opts);
}

/** Default weight for a prompt-derived fact (stated-in-prompt → `capability` tier). */
export const PROMPT_FACT_WEIGHT = 1;

/** Map extracted prompt params to grounding facts (prompt-stated → capability tier). */
export function promptDerivedFacts(extracted: readonly ExtractedParam[]): GroundingFact[] {
  return extracted.map((p) => ({ key: p.key, value: p.value, weight: PROMPT_FACT_WEIGHT, tier: 'capability' as const }));
}

/** Extract prompt-derived grounding facts via the LLM, mapped for the engine. */
export async function extractPromptFacts(prompts: readonly string[], client?: OpenAI): Promise<GroundingFact[]> {
  return promptDerivedFacts(await extractParamsFromPrompts(prompts, client));
}

// ── Param-source retrieval: map the AR param SETS into grounding facts ──────────

/**
 * AR-10 dev-env probe → grounding facts. Only PRESENT capabilities ground content
 * (a `null` UNKNOWN or `false` absence is skipped). A string fact carries its
 * value (e.g. the framework); a boolean capability carries its key (the weave
 * phrases it). Probe tier 'C'→capability / 'P'→corroborated; confidence sets weight.
 */
export function envFactsToGrounding(facts: FactMap): GroundingFact[] {
  const out: GroundingFact[] = [];
  for (const [key, f] of Object.entries(facts)) {
    if (f.value === null || f.value === false) continue;
    out.push({
      key,
      value: typeof f.value === 'string' ? f.value : key,
      weight: f.confidence === 'high' ? 1 : 0.5,
      tier: f.tier === 'P' ? 'corroborated' : 'capability',
    });
  }
  return out;
}

/**
 * AR-9 workflow aggregate → grounding facts. Only the GOOD side grounds the
 * content-template engine (signals the user reliably DOES → corroborated). The
 * human phrasing reuses the existing signal `description` (not new content).
 */
export function rightGoodToGrounding(
  profile: RightGoodProfile,
  lookup: (key: string) => SignalDefinition | undefined = (k) => SIGNAL_MAP.get(k),
): GroundingFact[] {
  const out: GroundingFact[] = [];
  for (const [key, sig] of Object.entries(profile)) {
    if (sig.state !== 'right_good') continue;
    out.push({ key, value: lookup(key)?.description ?? key, weight: sig.score, tier: 'corroborated' });
  }
  return out;
}

/**
 * AR-3 work-style traits → grounding facts. Each SET trait (non-UNSET) becomes a
 * neutral descriptor fact carrying its pole value (the weave renders the tone);
 * UNSET traits are skipped. Neutral → capability tier (never a signed claim).
 */
export function workStyleToGrounding(profile: WorkStyleProfile): GroundingFact[] {
  const out: GroundingFact[] = [];
  for (const [key, trait] of Object.entries(profile)) {
    if (trait.value === null) continue;
    out.push({ key, value: trait.value, weight: PROMPT_FACT_WEIGHT, tier: 'capability' });
  }
  return out;
}

export interface GroundingSources {
  /** AR-10 dev-env probe facts. */
  env?: FactMap;
  /** AR-9 workflow aggregate. */
  rightGood?: RightGoodProfile;
  /** AR-3 work-style traits. */
  workStyle?: WorkStyleProfile;
  /** Recent prompts for prompt-derived extraction. */
  prompts?: readonly string[];
}

/**
 * Retrieve the full grounding-fact set from the param SOURCES (AR-10 dev-env /
 * AR-9 workflow / AR-3 work-style / prompt-derived). The caller obtains the raw
 * profiles via the existing loaders (`loadRightGoodProfile`/`loadWorkStyleProfile`/
 * the env probe); this maps + combines them into one fact list for select/rank/cap.
 */
export async function retrieveGroundingFacts(sources: GroundingSources, client?: OpenAI): Promise<GroundingFact[]> {
  const facts: GroundingFact[] = [];
  if (sources.env) facts.push(...envFactsToGrounding(sources.env));
  if (sources.rightGood) facts.push(...rightGoodToGrounding(sources.rightGood));
  if (sources.workStyle) facts.push(...workStyleToGrounding(sources.workStyle));
  if (sources.prompts && sources.prompts.length > 0) facts.push(...(await extractPromptFacts(sources.prompts, client)));
  return facts;
}

// ── Render-path bridge: the (a)+(b) hybrid over a strength tier's OptionEntry[] ──

/**
 * The "show simpler" intercept, level-wise: derive each option's one-notch-simpler
 * form via (b), with the matching static next-tier entry as its (a) fallback. The
 * `option`↔`whyDesc`/`descBase` mapping bridges the engine's two-channel cell to
 * the render path's OptionEntry. A per-entry derive failure falls back to that
 * entry's static form — never blank, never the whole tier lost.
 */
export async function deriveSimplerLevel(
  current: readonly OptionEntry[],
  fallback: readonly OptionEntry[],
  client?: OpenAI,
  opts: { timeoutMs?: number } = {},
): Promise<OptionEntry[]> {
  return Promise.all(current.map(async (entry, i) => {
    const fb = fallback[i] ?? entry;
    const res = await stepSimplerLive(
      { option: entry.option, whyDesc: entry.descBase },
      { option: fb.option, whyDesc: fb.descBase },
      client,
      opts,
    );
    return { option: res.cell.option, descBase: res.cell.whyDesc };
  }));
}

export interface DerivedLadder {
  l1: OptionEntry[];
  l2: OptionEntry[];
  l3: OptionEntry[];
}

/**
 * Produce the full strength ladder EAGERLY from the authored L1 tier: L2 is one
 * notch simpler than L1, L3 one notch simpler than L2 (progressive). All tiers are
 * derived up front (no per-click LLM call) so the render path serves them
 * instantly — same UX as today, with the engine producing the simpler tiers
 * instead of hand-authoring them. Per-entry static fallbacks (the existing
 * authored L2/L3, when supplied) keep a failed derive from blanking a tier.
 */
export async function deriveLadder(
  l1: readonly OptionEntry[],
  fallback: { l2?: readonly OptionEntry[]; l3?: readonly OptionEntry[] } = {},
  client?: OpenAI,
  opts: { timeoutMs?: number } = {},
): Promise<DerivedLadder> {
  const l1Out = [...l1];
  const l2 = await deriveSimplerLevel(l1Out, fallback.l2 ?? l1Out, client, opts);
  const l3 = await deriveSimplerLevel(l2, fallback.l3 ?? l2, client, opts);
  return { l1: l1Out, l2, l3 };
}

/**
 * The why-desc multi-value grounding, live: deterministically select/rank/cap the
 * facts and injection-guard their values, then weave them with the frozen core
 * line via the LLM (the deterministic assembly is the weave's own fallback, and
 * the safeguard survives regardless). The result still carries any `{R...}` for
 * the downstream runtime/F7 pass — which runs AFTER this, via the existing
 * substitution pipeline (wired at the migration step), not through the weave.
 */
export async function groundWhyDescLive(input: ComposeWhyDescInput, client?: OpenAI): Promise<string> {
  const facts = (input.facts && input.factCap !== undefined ? selectRankCapFacts(input.facts, input.factCap) : [])
    .map((f) => ({ text: escapeSlotValue(f.value), tier: f.tier }));
  return weaveWhyDesc({ coreLine: input.cell.whyDesc, facts, l2Safeguard: input.l2Safeguard }, client);
}

// ── End-to-end orchestration (stages 1 → 4 for one advisory) ────────────────────

export interface ComposeAdvisoryInput {
  /** Source-cascade lookup (keyed by signalType × register × role upstream). */
  lookup: RecordCandidateLookup;
  /** The user's maturity level (AR-5) to resolve the column for. */
  level: MaturityLevel;
  ctx?: SlotContext;
  /** Grounding facts for the why-desc weave (topic-filtered upstream). */
  facts?: readonly GroundingFact[];
  factCap?: number;
  l2Safeguard?: string;
  /** Optional action anchor for the option (droppable-first under budget). */
  anchor?: string;
  lengthBudget?: number;
}

export interface ComposedAdvisory {
  source: ContentTemplateSource;
  level: MaturityLevel;
  option: string;
  whyDesc: string;
}

/**
 * Compose one advisory end-to-end: resolve the record (source cascade), resolve the
 * maturity column, then compose the two-channel cell — the option deterministically
 * (slots + droppable-first anchor) and the why-desc with live grounding (select/
 * rank/cap + injection-guard + weave, safeguard preserved). Returns null when no
 * source yields a valid record. The downstream `{R...}`→F7 runtime pass runs after,
 * via the existing substitution pipeline (wired at the migration step).
 */
export async function composeAdvisory(input: ComposeAdvisoryInput, client?: OpenAI): Promise<ComposedAdvisory | null> {
  const resolved = resolveRecord(input.lookup);
  if (!resolved) return null;
  const col = resolveColumn(resolved.record, input.level);
  if (!col) return null;
  const option = composeOption({
    cell: col.form.cell, slots: resolved.record.slots, ctx: input.ctx, anchor: input.anchor, lengthBudget: input.lengthBudget,
  });
  const whyDesc = await groundWhyDescLive({
    cell: col.form.cell, slots: resolved.record.slots, ctx: input.ctx, facts: input.facts, factCap: input.factCap,
    // Auto-source the sensitive-action safeguard from the record so the live wiring
    // can never forget it: a flagged record's l2SafeguardLine is always applied (the
    // explicit input wins only if a caller overrides it).
    l2Safeguard: input.l2Safeguard ?? resolved.record.l2SafeguardLine,
  }, client);
  return { source: resolved.source, level: col.level, option, whyDesc };
}
