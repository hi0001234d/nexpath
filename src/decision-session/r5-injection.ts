// R5 runtime injection — replaces the `{R5_INJECT: ...}` placeholder in
// an OptionEntry's desc-base with a 1–2-line summary grounded in the
// user's recent prompts.
//
// Primary mechanism (Strategy C): deterministic vocab extraction →
// step-4.5 voice-rule filter → Haiku-tier LLM rewrite.
//
// Fallback (Strategy D): pre-authored per-(signal_type, register)
// summary from r5-fallbacks.ts. Triggered by any of the F1–F7 failure
// modes.
//
// Called from `generateOptionList` AFTER Pass 2 returns the final
// `GeneratedOptions` (O-A locked substitution order). Substitution into
// the desc-base happens via simple placeholder replacement; the desc-
// base wrapper (R4 bookend) is substituted afterwards by
// `substituteCAFacingBookend`.

import type { PromptRecord } from '../classifier/types.js';
import { getR5DFallback } from './r5-fallbacks.js';

/** Register key used to look up D-fallback variants. */
export type R5Register = 'formal' | 'casual' | 'beginner';

/**
 * R5_INJECT placeholder pattern. The placeholder allows free-form
 * content between the colon and the closing brace (registers, length
 * hints, quoted example text); the runtime treats the entire matched
 * span as a single substitution slot.
 */
const R5_INJECT_RE = /\{R5_INJECT:[\s\S]*?\}/g;

/** Returns true when a desc-base template carries at least one `{R5_INJECT: ...}` placeholder. */
export function hasR5Injection(descBase: string): boolean {
  // Reset regex lastIndex by creating a fresh test each call.
  return /\{R5_INJECT:[\s\S]*?\}/.test(descBase);
}

/**
 * Replace every `{R5_INJECT: ...}` placeholder in `descBase` with the
 * given substitution text. Idempotent on inputs that carry no
 * placeholder.
 */
export function substituteR5Placeholder(descBase: string, substitution: string): string {
  return descBase.replace(R5_INJECT_RE, substitution);
}

/**
 * R5 runtime substitution — the public entry point.
 *
 * Strategy C primary (deterministic vocab + voice-rule filter + Haiku
 * LLM rewrite) is wired up in subsequent sub-batches. The current
 * implementation falls back to Strategy D (the static D-fallback per
 * signal_type × register) whenever Strategy C is not yet wired or
 * any of the F1-F7 failure modes fires.
 *
 * Contract:
 *   - Never throws — all failures resolve to a Strategy D substitution
 *     OR (if no fallback exists for the (signal_type, register) pair)
 *     return the original desc-base unchanged.
 *   - Idempotent on inputs without `{R5_INJECT: ...}` — returns the
 *     desc-base verbatim.
 */
export async function injectR5(
  descBase:   string,
  history:    readonly PromptRecord[],
  signalType: string,
  register:   R5Register,
): Promise<string> {
  if (!hasR5Injection(descBase)) return descBase;

  // Strategy C primary will be wired in subsequent sub-batches.
  // Until then, every call falls through to Strategy D so the runtime
  // is functional end-to-end from the moment this module lands.
  return strategyDFallback(descBase, signalType, register);
}

/**
 * Strategy D fallback path — substitutes the placeholder with the
 * pre-authored static summary for the (signal_type, register) pair.
 *
 * If no D-fallback exists for the pair, returns the desc-base
 * unchanged (the placeholder stays — the caller sees the locked
 * substitution-absent marker rather than a misleading empty body).
 */
export function strategyDFallback(
  descBase:   string,
  signalType: string,
  register:   R5Register,
): string {
  // r5-fallbacks.ts exposes a typed `Register = 'formal' | 'casual' | 'beginner'`
  // matching R5Register; the cast is a structural identity.
  const fallback = getR5DFallback(signalType, register);
  if (fallback === undefined) return descBase;
  return substituteR5Placeholder(descBase, fallback);
}

// ─── Deterministic vocab extraction ─────────────────────────────────────
//
// Pulls up to N user-grounded tokens out of the recent-prompts history
// for the Haiku rewrite step. Three buckets in priority order:
//
//   1. Repeated tokens — any word that appears in ≥ 2 prompts. Highest
//      priority; signals what the user is consistently focused on.
//   2. Verbs           — common software-engineering action verbs
//      matched against a curated list. Preserves the user's voice.
//   3. Nouns / feature names — capitalised words (in original case),
//      file-path basenames, quoted strings. Catches feature-noun
//      grounding signals.
//
// Output is deduplicated (case-insensitive) and sorted by bucket
// priority + within-bucket frequency.

/** English stopwords filtered before vocab extraction (case-insensitive). */
const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'so', 'as',
  'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'onto', 'to',
  'with', 'without', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'has', 'have', 'had', 'will', 'would', 'can',
  'could', 'should', 'shall', 'may', 'might', 'must', 'this', 'that',
  'these', 'those', 'it', 'its', 'they', 'them', 'their', 'there', 'here',
  'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'you', 'your', 'he', 'she',
  'his', 'her', 'him', 'who', 'what', 'when', 'where', 'why', 'how',
  'not', 'no', 'too', 'very', 'just', 'only', 'own', 'than', 'same',
  'all', 'any', 'some', 'each', 'few', 'more', 'most', 'other', 'such',
  'new', 'old', 'now', 'then', 'still', 'also', 'about', 'before', 'after',
  'up', 'down', 'out', 'off', 'over', 'under', 'again',
]);

/** Common software-engineering verb stems matched against tokens (case-insensitive). */
const VERB_STEMS: readonly string[] = [
  'add', 'build', 'check', 'commit', 'configure', 'create', 'debug',
  'delete', 'deploy', 'design', 'document', 'edit', 'fix', 'flag',
  'implement', 'install', 'integrate', 'merge', 'migrate', 'mock',
  'monitor', 'optimize', 'parse', 'patch', 'plan', 'prototype', 'pull',
  'push', 'refactor', 'release', 'remove', 'rename', 'replace', 'review',
  'rewrite', 'rollback', 'run', 'ship', 'show', 'split', 'submit', 'test',
  'trace', 'update', 'upgrade', 'validate', 'verify', 'write',
];

/** Returns true when a lowercase token matches one of the verb stems (with common suffixes). */
function isVerb(token: string): boolean {
  const lower = token.toLowerCase();
  for (const stem of VERB_STEMS) {
    if (lower === stem) return true;
    if (lower === stem + 'ed') return true;
    if (lower === stem + 'ing') return true;
    if (lower === stem + 's') return true;
    // Handle e-drop forms: configure → configured / configuring
    if (stem.endsWith('e') && (lower === stem.slice(0, -1) + 'ed' || lower === stem.slice(0, -1) + 'ing')) {
      return true;
    }
  }
  return false;
}

/** Returns true when a token (in its original casing) looks like a noun or feature name. */
function isNounLike(rawToken: string): boolean {
  // File path basename — contains a dot followed by extension chars.
  if (/^[\w-]+\.[A-Za-z0-9]+$/.test(rawToken)) return true;
  // Quoted-string-like.
  if (/^["'`].+["'`]$/.test(rawToken)) return true;
  // Capitalised word that is not all-caps acronym-of-length-1.
  if (/^[A-Z][a-z]+/.test(rawToken)) return true;
  // CamelCase or snake_case identifier.
  if (/^[a-z]+[A-Z]/.test(rawToken)) return true;
  if (/^[a-z_]+_[a-z_]+$/.test(rawToken)) return true;
  return false;
}

/** Strip surrounding punctuation while preserving internal characters like dots and slashes. */
function trimPunctuation(token: string): string {
  return token.replace(/^[^A-Za-z0-9$_]+|[^A-Za-z0-9$_.]+$/g, '');
}

/**
 * Extract up to `maxTokens` deterministic user-grounded tokens from the
 * recent-prompts history. Pure function (no LLM call).
 */
export function extractVocab(
  history: readonly PromptRecord[],
  maxTokens = 8,
): string[] {
  if (history.length === 0) return [];

  // Tokenise each prompt and accumulate frequency + per-prompt presence
  // for the "repeated tokens" priority.
  const freqByLower = new Map<string, number>();
  const rawByLower  = new Map<string, string>();    // preserves casing of first occurrence
  const promptsContaining = new Map<string, Set<number>>();

  for (let i = 0; i < history.length; i++) {
    const seenInThisPrompt = new Set<string>();
    const tokens = history[i].text.split(/\s+/);
    for (const raw of tokens) {
      const cleaned = trimPunctuation(raw);
      if (cleaned.length < 2) continue;            // skip 1-char tokens / stray punctuation
      const lower = cleaned.toLowerCase();
      if (STOPWORDS.has(lower)) continue;         // filter out grammatical filler words

      freqByLower.set(lower, (freqByLower.get(lower) ?? 0) + 1);
      if (!rawByLower.has(lower)) rawByLower.set(lower, cleaned);
      seenInThisPrompt.add(lower);
    }
    for (const t of seenInThisPrompt) {
      let bucket = promptsContaining.get(t);
      if (!bucket) {
        bucket = new Set<number>();
        promptsContaining.set(t, bucket);
      }
      bucket.add(i);
    }
  }

  // Score each token: high score = higher priority.
  //   - Repeated (≥ 2 distinct prompts)  → +1000
  //   - Verb                              → + 200
  //   - Noun-like                         → + 100
  //   - Plus its overall frequency        → +    n  (tiebreaker)
  const scored: { lower: string; raw: string; score: number }[] = [];
  for (const [lower, raw] of rawByLower) {
    let score = freqByLower.get(lower) ?? 0;
    const inPrompts = (promptsContaining.get(lower)?.size ?? 0);
    if (inPrompts >= 2) score += 1000;
    if (isVerb(lower))  score += 200;
    if (isNounLike(raw)) score += 100;
    if (score > freqByLower.get(lower)!) {
      // Token qualifies in at least one bucket.
      scored.push({ lower, raw, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxTokens).map((s) => s.raw);
}

// ─── Step 4.5 — voice-rule filter on extracted vocab ────────────────────
//
// User prompts naturally carry banned-pattern tokens (`you`, `the AI`,
// `Claude`, etc.). Letting those tokens into the LLM rewrite step would
// produce CA-bound output that violates the L1 voice rule. This filter
// runs BEFORE the LLM call, on the extracted-vocab set returned by
// `extractVocab`, applying:
//
//   - DROP    — tokens that have no acceptable use in CA-bound output
//               (`ai`, `claude`, `assistant`, `it`, `its`)
//   - DROP    — second-person tokens addressing the USER as "you"
//               (`you`, `your`). The dev-plan allows context-aware
//               REWRITE here; the simpler safe choice is to drop and
//               let the LLM choose grammar that doesn't need them.
//   - KEEP    — every other token (first-person USER, verbs, feature
//               names, file paths, quoted strings, etc.)

/**
 * Lowercase tokens dropped outright — any token whose lowercase form
 * matches an entry in this set is removed from the vocab list.
 */
const DROP_TOKENS_LOWER: ReadonlySet<string> = new Set([
  'ai',
  'claude',
  'assistant',
  'it',
  'its',
  'you',
  'your',
]);

/** Returns true when a token should be dropped per the L1 voice-rule filter. */
export function isDroppedByVoiceRuleFilter(token: string): boolean {
  return DROP_TOKENS_LOWER.has(token.toLowerCase());
}

/**
 * Apply the step-4.5 voice-rule filter to an extracted-vocab array.
 * Returns a new array with banned tokens removed. Order preserved.
 */
export function applyVoiceRuleFilter(vocab: readonly string[]): string[] {
  return vocab.filter((t) => !isDroppedByVoiceRuleFilter(t));
}
