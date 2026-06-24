/**
 * LLM-backed grounding for the content-template engine — the real implementations
 * of the engine's injected seams (the per-click simpler-derive and the why-desc
 * weave). Mirrors the OptionGenerator runtime pattern (injectable client, bounded
 * timeout, one retry, JSON-object response, graceful fallback) so the engine reuses
 * the same proven machinery rather than a second LLM path.
 *
 * Cost note: each call here is one of the priced grounding calls — they run at
 * runtime, per advisory / per simpler-step.
 *
 * Safety: the why-desc is read by the coding agent. A sensitive-action safeguard
 * line, when supplied, is passed through VERBATIM and the weave is instructed never
 * to drop or weaken it; fact values are injection-guarded by the engine BEFORE they
 * reach this module (this layer adds no new prompt-text leakage).
 */

import OpenAI from 'openai';
import { logger } from '../logger.js';
import type { TwoChannelCell } from './content-template-schema.js';

export const GROUNDING_MODEL       = 'gpt-4o-mini';
export const GROUNDING_MAX_TOKENS  = 400;
export const GROUNDING_TEMP        = 0;
export const GROUNDING_TIMEOUT_MS  = 12_000;

/** One chat round-trip, returning the raw assistant text (or '' ). */
async function chat(client: OpenAI, prompt: string): Promise<string> {
  const response = await client.chat.completions.create(
    {
      model:           GROUNDING_MODEL,
      messages:        [{ role: 'user', content: prompt }],
      temperature:     GROUNDING_TEMP,
      max_tokens:      GROUNDING_MAX_TOKENS,
      response_format: { type: 'json_object' },
    },
    { timeout: GROUNDING_TIMEOUT_MS },
  );
  return response.choices[0]?.message?.content ?? '';
}

function parseJson(raw: string): Record<string, unknown> | null {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    const v = JSON.parse(stripped);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ── (b) one-notch-simpler derive ───────────────────────────────────────────────

function buildSimplerPrompt(current: TwoChannelCell): string {
  return `Rewrite this decision-session option ONE notch simpler — shorter, gentler, less jargon — WITHOUT changing what it asks for or dropping its key topic word. The "option" is the message the user sends to their coding agent; the "whyDesc" is the short explanation.

Current:
${JSON.stringify({ option: current.option, whyDesc: current.whyDesc })}

Return JSON only, no markdown:
{"option":"...","whyDesc":"..."}`;
}

/**
 * Derive the one-notch-simpler cell via the LLM. Rejects on failure / malformed
 * output / timeout so the engine's strength-step falls back to its (a) form — the
 * ONLY path to the fallback.
 *
 * Safeguard survival (non-negotiable): if `opts.l2Safeguard` is supplied and the
 * simplified why-desc dropped it, it is re-appended — a simpler sibling must never
 * shed the sensitive-action safeguard.
 */
export async function deriveSimplerCell(
  current: TwoChannelCell,
  client?: OpenAI,
  opts: { l2Safeguard?: string } = {},
): Promise<TwoChannelCell> {
  const openai = client ?? new OpenAI();
  const raw = await chat(openai, buildSimplerPrompt(current));
  const obj = parseJson(raw);
  if (!obj || typeof obj.option !== 'string' || typeof obj.whyDesc !== 'string' || obj.option.trim() === '') {
    logger.debug('content_template_simpler_derive_invalid', { raw: raw.slice(0, 200) });
    throw new Error('simpler-derive produced no valid cell');
  }
  let whyDesc = obj.whyDesc;
  if (opts.l2Safeguard && !whyDesc.includes(opts.l2Safeguard)) whyDesc = `${whyDesc}\n${opts.l2Safeguard}`;
  return { option: obj.option, whyDesc };
}

// ── prompt-derived param extraction ─────────────────────────────────────────────

/** A non-sensitive tooling/workflow fact mined from recent prompt text. */
export interface ExtractedParam {
  key: string;
  value: string;
}

function buildParamExtractionPrompt(prompts: readonly string[]): string {
  return `From these recent user prompts to a coding agent, extract concrete TOOLING / WORKFLOW / STACK facts the user has explicitly revealed (e.g. framework, test runner, language, deploy target, team size).
STRICT SAFETY: never extract secrets, API keys, tokens, credentials, file paths, URLs, emails, or any personal/identifying data. Only general, non-sensitive facts. Include a fact only if explicitly evidenced — no guesses. Summarise each as a short phrase; do NOT copy raw prompt text.

Prompts:
${JSON.stringify(prompts)}

Return JSON only, no markdown:
{"facts":[{"key":"test_runner","value":"uses Vitest"}]}`;
}

/**
 * Mine recent prompts for non-sensitive tooling/workflow param values via the LLM.
 * Returns summarised {key,value} facts (never raw prompt text). Graceful: returns
 * [] on empty input / failure / malformed output. The values are injection-guarded
 * by the engine before they reach any CA-bound output.
 */
export async function extractParamsFromPrompts(prompts: readonly string[], client?: OpenAI): Promise<ExtractedParam[]> {
  if (prompts.length === 0) return [];
  try {
    const openai = client ?? new OpenAI();
    const raw = await chat(openai, buildParamExtractionPrompt(prompts));
    const obj = parseJson(raw);
    const rawFacts = obj && Array.isArray(obj.facts) ? obj.facts : [];
    const out: ExtractedParam[] = [];
    for (const f of rawFacts as Array<Record<string, unknown>>) {
      if (f && typeof f.key === 'string' && typeof f.value === 'string' && f.key.trim() !== '' && f.value.trim() !== '') {
        out.push({ key: f.key, value: f.value });
      }
    }
    return out;
  } catch (err) {
    logger.debug('content_template_param_extract_error', { error: String(err) });
    return [];
  }
}

// ── why-desc multi-value weave ──────────────────────────────────────────────────

/** A grounding fact for the weave, carrying its trust tier (drives the wording). */
export interface WeaveFact {
  /** Already injection-guarded value text. */
  text: string;
  /** `corroborated` = the user DOES it (practice wording); `capability` = the environment HAS it (capability wording). */
  tier: 'corroborated' | 'capability';
}

export interface WeaveInput {
  /** The frozen core line (authored — kept intact). */
  coreLine: string;
  /** Already-selected, already-injection-guarded grounding facts (with tier). */
  facts: readonly WeaveFact[];
  /** Sensitive-action safeguard line — kept VERBATIM, never dropped. */
  l2Safeguard?: string;
  /** Soft line budget for the woven result. */
  maxLines?: number;
}

function buildWeavePrompt(input: WeaveInput): string {
  const factListing = input.facts
    .map((f) => `- [${f.tier === 'corroborated' ? 'established practice' : 'available capability'}] ${f.text}`)
    .join('\n');
  return `Weave the core line and the supporting facts below into a smooth why-desc of at most ${input.maxLines ?? 5} short lines, read by a coding agent. Rules: keep the core line's meaning; do NOT invent facts beyond those given; do NOT add new instructions. Phrase each fact by its tier: an [established practice] fact = something the user reliably DOES (e.g. "you already…"); an [available capability] fact = something the user's environment HAS or COULD use (e.g. "your setup has…", "you could…") — never state a capability as an established habit. Drop the bracketed tier tags from the final text. Preserve any placeholder tokens (e.g. {{name}}, {R4_OPEN}, {R4_CLOSE}, {R5_INJECT: ...}) EXACTLY as they appear — never reword, translate, move out of context, or remove them.${input.l2Safeguard ? ' Keep the final safeguard sentence EXACTLY as given — never reword or drop it.' : ''}

Core line: ${JSON.stringify(input.coreLine)}
Facts:
${factListing}${input.l2Safeguard ? `\nSafeguard (verbatim, must be the last line): ${JSON.stringify(input.l2Safeguard)}` : ''}

Return JSON only, no markdown:
{"whyDesc":"..."}`;
}

/**
 * Weave the grounding facts into the why-desc via the LLM. On any failure the
 * deterministic assembly (core line + facts + safeguard) is returned unchanged, so
 * the why-desc is never lost — and if a safeguard was supplied but the model
 * somehow dropped it, it is re-appended (survival is non-negotiable).
 */
/** Runtime / composition placeholder tokens that must survive the weave verbatim. */
const PLACEHOLDER_TOKEN_RE = /\{R4_OPEN\}|\{R4_CLOSE\}|\{R5_INJECT:[^}]*\}|\{\{\w+\}\}/g;

export async function weaveWhyDesc(input: WeaveInput, client?: OpenAI): Promise<string> {
  const deterministic = [input.coreLine, ...input.facts.map((f) => f.text), ...(input.l2Safeguard ? [input.l2Safeguard] : [])].join('\n');
  try {
    const openai = client ?? new OpenAI();
    const raw = await chat(openai, buildWeavePrompt(input));
    const obj = parseJson(raw);
    const woven = obj && typeof obj.whyDesc === 'string' ? obj.whyDesc.trim() : '';
    if (!woven) return deterministic;
    // Placeholder preservation: if the weave dropped/mangled any {R...} / {{...}}
    // token from the core line, fall back to the deterministic assembly (which keeps
    // them intact) so the downstream {{}}-compose / runtime / F7 pass still works.
    const required = input.coreLine.match(PLACEHOLDER_TOKEN_RE) ?? [];
    if (required.some((tok) => !woven.includes(tok))) {
      logger.debug('content_template_weave_dropped_placeholder', { required });
      return deterministic;
    }
    // Safeguard survival is non-negotiable: re-append if the weave dropped it.
    if (input.l2Safeguard && !woven.includes(input.l2Safeguard)) return `${woven}\n${input.l2Safeguard}`;
    return woven;
  } catch (err) {
    logger.debug('content_template_weave_error', { error: String(err) });
    return deterministic;
  }
}
