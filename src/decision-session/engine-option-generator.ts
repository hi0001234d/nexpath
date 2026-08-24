/**
 * Engine-backed pre-generate path (§6.1 items 2/3/4/5) — the content-template analogue
 * of `generateOptionList`. For a MIGRATED signalType it composes the maturity-column
 * headline via the §4.E0 engine (`composeAdvisory` — grounded why-desc + the sensitive-
 * action safeguard auto-sourced from the record, engine-side), then derives the strength
 * ladder (`deriveLadder` — L2/L3 one notch simpler each). Returns `GeneratedOptions` (one
 * option per strength tier — the §5.10.5 "author only L1, derive the rest" model) or null
 * (no record → the caller falls back to the static set).
 *
 * The `{R...}`→F7 after-pass (item 3) is a no-op for content-template cells (they carry no
 * runtime `{R...}` tokens — the grounding + safeguard are composed engine-side, items 6/9),
 * so the engine output is served directly. Only reached for a signalType in
 * `MIGRATED_SIGNALS` (the 6 §4.E2 signals + the Group-B classes migrated so far; empty = ship-dark).
 */

import type OpenAI from 'openai';
import type { GeneratedOptions } from './OptionGenerator.js';
import type { OptionEntry } from './options.js';
import { resolveLevelForm, type MaturityLevel } from './content-template-schema.js';
import type { Store } from '../store/db.js';
import type { PromptRecord } from '../classifier/types.js';
import {
  composeAdvisory,
  deriveLadder,
  retrieveGroundingFacts,
  composeOption,
  composeWhyDesc,
  resolveRegisterForms,
  resolveRecord,
  type RecordCandidateLookup,
  type GroundingFact,
} from './content-template-engine.js';
import { loadRightGoodProfile } from '../classifier/right-good-aggregator.js';
import { loadWorkStyleProfile } from '../classifier/work-style-traits.js';
import { probeProject } from '../env/env-probe.js';
import { promoteEnvFactsToTierP } from '../env/env-tier-promotion.js';

export interface EngineGenerateInput {
  /** Source-cascade record lookup for the migrated signalType (dual-source). */
  lookup: RecordCandidateLookup;
  /** The user's maturity level to resolve the column for. */
  level: MaturityLevel;
  /** Target register (structurally-divergent override selection; else base). */
  register?: string;
  /** Target role (founder / indie_hacker / pm) — selects a role override (role → register → base). */
  role?: string;
  /** Grounding facts for the why-desc weave (dev-env / workflow / work-style / prompt-derived). */
  facts?: readonly GroundingFact[];
  /** Grounding-line budget for the why-desc. */
  factCap?: number;
}

/**
 * Produce `GeneratedOptions` for a migrated signal from the content-template engine.
 * Returns null when no record resolves (caller falls back to the static generate path).
 */
export async function generateFromEngine(
  input: EngineGenerateInput,
  client?: OpenAI,
): Promise<GeneratedOptions | null> {
  const advisory = await composeAdvisory(
    { lookup: input.lookup, level: input.level, register: input.register, role: input.role, facts: input.facts, factCap: input.factCap },
    client,
  );
  if (!advisory) return null;

  // The composed headline is the L1 strength tier; derive L2/L3 one notch simpler each.
  // Thread the record's safeguard into the derive so each simpler tier re-appends it
  // VERBATIM — the sensitive-action line survives every tier regardless of its phrasing.
  const l1: OptionEntry[] = [{ option: advisory.option, descBase: advisory.whyDesc }];
  const ladder = await deriveLadder(l1, {}, client, { l2Safeguard: advisory.l2Safeguard });

  return {
    l1: ladder.l1.map((e) => e.option),
    l2: ladder.l2.map((e) => e.option),
    l3: ladder.l3.map((e) => e.option),
    generatedDescBases: {
      l1: ladder.l1.map((e) => e.descBase),
      l2: ladder.l2.map((e) => e.descBase),
      l3: ladder.l3.map((e) => e.descBase),
    },
  };
}

/**
 * DETERMINISTIC fallback options — composed from the record with NO LLM, for when the grounded engine
 * path fails (missing key / API error, caught by the caller). The option is served verbatim and the
 * why-desc is the deterministic assembly (core line + the record's safeguard line), register/role-aware.
 * The simpler strength tiers (L2/L3) use one/two LOWER maturity columns (a lighter practice) since the
 * LLM strength-derive is unavailable. Returns null when no record resolves (caller has nothing to serve).
 */
export function composeDeterministicOptions(
  input: { lookup: RecordCandidateLookup; level: MaturityLevel; register?: string; role?: string },
): GeneratedOptions | null {
  const resolved = resolveRecord(input.lookup);
  if (!resolved) return null;
  const forms = resolveRegisterForms(resolved.record, input.register, input.role);
  const l2Safeguard = resolved.record.l2SafeguardLine;
  const clamp = (n: number): MaturityLevel => Math.max(1, Math.min(5, n)) as MaturityLevel;
  const tier = (lv: MaturityLevel): OptionEntry | null => {
    const col = resolveLevelForm(forms, lv);
    if (!col) return null;
    const option   = composeOption({ cell: col.form.cell, slots: resolved.record.slots });
    const descBase = composeWhyDesc({ cell: col.form.cell, slots: resolved.record.slots, l2Safeguard });
    return { option, descBase };
  };
  const t1 = tier(input.level);
  if (!t1) return null;
  const t2 = tier(clamp(input.level - 1)) ?? t1;
  const t3 = tier(clamp(input.level - 2)) ?? t2;
  return {
    l1: [t1.option], l2: [t2.option], l3: [t3.option],
    generatedDescBases: { l1: [t1.descBase], l2: [t2.descBase], l3: [t3.descBase] },
  };
}

/**
 * §6.1 item 4 — assemble grounding facts from the AR param SOURCES at fire time, via the
 * live store: dev-env (`probeProject`), workflow (`loadRightGoodProfile`),
 * work-style (`loadWorkStyleProfile`), and the recent prompts (prompt-derived, LLM).
 * The engine maps + ranks/caps them; this is the store-load wiring.
 */
export async function buildEngineGrounding(
  store: Store,
  root: string,
  history: readonly PromptRecord[],
  client?: OpenAI,
): Promise<GroundingFact[]> {
  const rightGood = loadRightGoodProfile(store, root);
  // Promote corroborated capability facts to practice-grade (tier 'P') before grounding: a fact
  // the project HAS grounds a discipline claim only when the matching behaviour reads RIGHT&GOOD.
  const env = promoteEnvFactsToTierP(probeProject(root).facts, rightGood);
  const workStyle = loadWorkStyleProfile(store, root);
  const prompts = history.slice(-5).map((p) => p.text);
  return retrieveGroundingFacts({ env, rightGood, workStyle, prompts }, client);
}
