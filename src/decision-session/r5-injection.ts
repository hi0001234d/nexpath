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
 * Dev-plan §10.2 illustrative type alias. Re-exported so callers
 * matching the dev-plan literal signature can import `Register`
 * directly without renaming. Structurally identical to `R5Register`.
 */
export type Register = R5Register;

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
 * Optional inputs for the Strategy-C primary path. When omitted the
 * runtime skips Strategy C entirely and uses the Strategy-D fallback —
 * this is the safe default for callers that don't yet have an LLM
 * client bound (the production caller binds one; the tests bind a
 * mock).
 */
export interface InjectR5Options {
  /** Pluggable rewrite client. Omit to skip the Strategy-C LLM call. */
  client?:      R5RewriteClient;
  /** Format/length hint passed to the rewrite prompt (typically the `{R5_INJECT: ...}` example text from the desc-base template). */
  exampleHint?: string;
  /**
   * Per-set total-length budget tier applied to the FULL desc-base
   * AFTER R5 substitution. Defaults to MEDIUM when omitted.
   * Triggers a Strategy-D fallback when the post-substitution desc-base
   * exceeds the tier's line or char ceiling.
   */
  lengthBudget?: LengthBudgetTier;
  /**
   * Per-set marker from the static DecisionContent. When `true`, the
   * static desc-base already carries a confirmation-seek safeguard
   * sentence — runtime escalation (appending another) is suppressed.
   * Runtime still strips L2 trigger words from the prompt vocab before
   * extraction so the rewrite output does not echo sensitive verbs.
   */
  l2SafeguardRequired?: boolean;
}

/** Per-set length budget tier. */
export type LengthBudgetTier = 'LIGHT' | 'MEDIUM' | 'HEAVY';

/**
 * Per-tier total-length ceilings applied to the FULL post-R5
 * substituted desc-base. `maxExpandedLines` matches the expanded
 * (untruncated) line count; `maxChars` is the total char count.
 */
export const LENGTH_BUDGETS: Readonly<Record<LengthBudgetTier, { maxExpandedLines: number; maxChars: number }>> = {
  LIGHT:  { maxExpandedLines: 2,  maxChars: 200  },
  MEDIUM: { maxExpandedLines: 4,  maxChars: 400  },
  HEAVY:  { maxExpandedLines: 10, maxChars: 1000 },
};

/**
 * Returns true when the full post-substitution desc-base fits inside
 * the tier's line + char ceilings. Falsey result triggers a Strategy-D
 * fallback in `injectR5`.
 */
export function fitsLengthBudget(descBase: string, tier: LengthBudgetTier): boolean {
  const { maxExpandedLines, maxChars } = LENGTH_BUDGETS[tier];
  if (descBase.length > maxChars) return false;
  if (descBase.split('\n').length > maxExpandedLines) return false;
  return true;
}

/**
 * R5 runtime substitution — the public entry point. Orchestrates the
 * Strategy-C flow with Strategy-D fallback on any of the F1-F7
 * failure modes:
 *
 *   1. Idempotency             — return verbatim if no `{R5_INJECT}` placeholder
 *   2. F1 early-session        — fall back to D when history.length < 2
 *   3. F2 mask secrets         — redact PII / credentials before extraction
 *   4. F7 detect + strip       — detect L2 sensitive-action triggers and
 *                                strip trigger phrases before extraction
 *   5. F5 repetition + dedup   — compute pre-dedup cross-prompt repetition
 *                                counts; then dedup verbatim repeats
 *   6. Vocab extraction        — top-N grounded tokens from stripped/deduped history
 *   7. Step-4.5 voice filter   — drop banned tokens from the vocab list
 *   8. LLM rewrite             — produce 1-2-line summary (if client provided),
 *                                with the repetition list passed as a hint
 *   9. F4 length cap           — sentence-boundary truncate or fall back
 *  10. 70-80% concentration    — fall back if summary concentration < 0.7
 *  11. Substitute placeholder  — fill the {R5_INJECT: ...} slot
 *  12. F7 path-(a) escalation  — append the safeguard sentence when triggers
 *                                were detected AND static is L2-clean
 *  13. Per-set length budget   — fall back to D when the final desc-base
 *                                exceeds the set's LIGHT/MEDIUM/HEAVY ceilings
 *
 * Contract:
 *   - Never throws — every failure path resolves to a Strategy-D
 *     substitution OR (if no fallback exists for the (signal_type,
 *     register) pair) returns the desc-base verbatim.
 *   - Idempotent on inputs without `{R5_INJECT: ...}`.
 *
 * Documented deviations from dev plan §10:
 *   - §10.6.1 F7 two-tier (a)/(b) — the dev plan treats path (a)
 *     (escalate via safeguard append) and path (b) (strip L2 trigger
 *     tokens from vocab) as mutually exclusive. This implementation
 *     applies (b) ALWAYS (strip trigger phrases before vocab
 *     extraction) and applies (a) on top when the static set is
 *     L2-clean. The combined approach was chosen for content-
 *     sensitivity safety per the private submodule's "Content
 *     Sensitivity / Security — high-risk by default" rule: a
 *     sensitive verb must never flow into the LLM rewrite output
 *     even when the safeguard sentence already covers it elsewhere
 *     in the desc-base.
 *   - §10.1 step 3 — the dev plan places the "<2 useful tokens after
 *     masking → fall back to D" check directly after F2 mask. This
 *     implementation places it directly after vocab extraction (one
 *     step later in the flow). Functionally equivalent because
 *     `extractVocab` operates on the masked content; the check fires
 *     on the same condition (insufficient meaningful tokens
 *     surviving the mask).
 */
export async function injectR5(
  descBase:   string,
  history:    readonly PromptRecord[],
  signalType: string,
  register:   R5Register,
  options:    InjectR5Options = {},
): Promise<string> {
  if (!hasR5Injection(descBase)) return descBase;

  // Helper closures — finalize wraps every return path so F7 escalation
  // and the per-set length budget check apply uniformly to both
  // Strategy-C output and every Strategy-D fallback.
  const isAlreadyL2 = options.l2SafeguardRequired === true;
  const tier        = options.lengthBudget ?? 'MEDIUM';

  // (2) F1 — early-session guard.
  if (f1ShouldFallback(history)) {
    return finalize(strategyDFallback(descBase, signalType, register), []);
  }

  // (3) F2 — mask PII / secrets BEFORE any token extraction touches them.
  const masked = f2MaskPromptHistory(history);

  // (4) F7 — detect L2 sensitive-action triggers + strip trigger phrases
  // BEFORE F5 dedup, so the cross-prompt repetition counts and the
  // deduped vocab share the same content-safety boundary (sensitive
  // verbs are never surfaced to the LLM rewrite step).
  const triggerMatches = f7DetectL2TriggerMatches(masked);
  // Path-(b) drop applied uniformly — see dev-plan §10.6.1 deviation note.
  const strippedAll    = triggerMatches.length > 0 ? stripL2TriggerText(masked) : masked;

  // (5) F5 — compute per-token cross-prompt repetition counts BEFORE
  // dedup so the "repeated [verb]" signal (dev-plan §10.6 F5 row)
  // survives the dedup collapse, then dedup so vocab extraction
  // does not over-weight copy-pasted sentences.
  const repetitions      = computeRepetitionCounts(strippedAll);
  const promptsForVocab  = f5DeduplicatePrompts(strippedAll);

  // (6) — deterministic vocab extraction.
  const rawVocab = extractVocab(promptsForVocab);

  // Dev-plan §10.1 step 3: "If <2 useful tokens after masking → fall
  // back to D." This early check catches the case where F2 masking
  // (plus F7 stripping) removed substantially all meaningful content
  // from the prompts, BEFORE running the voice-rule filter on an
  // already-empty vocab.
  if (rawVocab.length < 2) {
    return finalize(strategyDFallback(descBase, signalType, register), triggerMatches);
  }

  // (7) — step-4.5 voice-rule filter.
  const filteredVocab = applyVoiceRuleFilter(rawVocab);
  if (filteredVocab.length < 2) {
    return finalize(strategyDFallback(descBase, signalType, register), triggerMatches);
  }

  // (8) — LLM rewrite, only when a client is bound. Without a client,
  // the runtime falls back to Strategy D — this keeps the path
  // production-safe in environments that haven't provisioned an LLM.
  if (!options.client) {
    return finalize(strategyDFallback(descBase, signalType, register), triggerMatches);
  }
  const summary = await rewriteViaLLM(
    filteredVocab,
    signalType,
    register,
    options.exampleHint ?? '',
    options.client,
    repetitions,
  );
  if (summary.trim().length === 0) {
    return finalize(strategyDFallback(descBase, signalType, register), triggerMatches);
  }

  // (9) — F4 per-substitution length cap.
  const capped = f4EnforceLengthCap(summary);
  if (capped === null) {
    return finalize(strategyDFallback(descBase, signalType, register), triggerMatches);
  }

  // (10) — 70-80% concentration check on the user-grounded vocab.
  if (!meetsConcentrationThreshold(capped, filteredVocab)) {
    return finalize(strategyDFallback(descBase, signalType, register), triggerMatches);
  }

  const substituted = substituteR5Placeholder(descBase, capped);
  return finalize(substituted, triggerMatches);

  function finalize(out: string, detected: ReadonlyArray<L2TriggerMatch>): string {
    // Path (a) — escalate to L2 when triggers detected AND static
    // desc-base is currently L2-clean. Skip when static is already
    // L2-flagged (l2SafeguardRequired === true) since the static
    // safeguard sentence already covers it.
    const withSafeguard = (!isAlreadyL2 && detected.length > 0)
      ? appendL2Safeguard(out, detected)
      : out;

    // Per-set total-length budget check on the final desc-base. When
    // overflow occurs, fall back to Strategy D for that option (D
    // strings are shorter and fit within the same budget). The
    // safeguard still applies on top of the D fallback when relevant.
    if (!fitsLengthBudget(withSafeguard, tier)) {
      const dFallback = strategyDFallback(descBase, signalType, register);
      return (!isAlreadyL2 && detected.length > 0)
        ? appendL2Safeguard(dFallback, detected)
        : dFallback;
    }

    return withSafeguard;
  }
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

// ─── F1-F7 failure-mode handlers ────────────────────────────────────────
//
// Each handler is a pure predicate or transformer over the inputs the
// runtime has at each step. The orchestrating injectR5 path calls them
// in their numbered order and switches to Strategy D whenever any
// handler signals failure.
//
//   F1 — early-session guard (history.length < 2)
//   F2 — PII / secret masking on prompt text
//   F3 — contradiction handling: NO handler (static desc-base wins)
//   F4 — output length cap: ≤ 2 lines / 120 chars per substitution
//   F5 — repeated-prompts deduplication
//   F6 — cross-project history: NO handler (scope is at the
//        getRecentPrompts boundary)
//   F7 — L2 sensitive-action carry-over detection
//
// F3 and F6 carry no runtime handler — they're satisfied structurally
// upstream. They are exposed as no-op exports for completeness so the
// dispatch table can iterate every numbered handler uniformly.

/** F1 — early-session guard. Returns true when Strategy D should be used. */
export function f1ShouldFallback(history: readonly PromptRecord[]): boolean {
  return history.length < 2;
}

/** Mask patterns applied to prompt text before vocab extraction (F2). */
const SECRET_PATTERNS: readonly { re: RegExp; replacement: string }[] = [
  // API key / password / token / secret literals (prefixed)
  { re: /(?:api[_-]?key|password|token|secret|bearer)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{8,}['"]?/gi, replacement: '[REDACTED_SECRET]' },
  // Email addresses
  { re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: '[REDACTED_EMAIL]' },
  // Phone numbers (loose — 10+ contiguous digits or formatted)
  { re: /\b(?:\+?\d{1,3}[\s-]?)?(?:\(\d{3}\)|\d{3})[\s-]?\d{3}[\s-]?\d{4}\b/g, replacement: '[REDACTED_PHONE]' },
  // IPv4 addresses in code-like contexts
  { re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: '[REDACTED_IP]' },
  // Secret-store paths
  { re: /(?:~|\$HOME)?\/\.ssh\/\S+/g,         replacement: '[REDACTED_SECRET_PATH]' },
  { re: /(?:~|\$HOME)?\/\.aws\/credentials\b/g, replacement: '[REDACTED_SECRET_PATH]' },
  { re: /(?:~|\$HOME)?\/\.gnupg\/\S+/g,       replacement: '[REDACTED_SECRET_PATH]' },
  { re: /(?:^|\s)\.env(?:\.\w+)?\b/g,          replacement: ' [REDACTED_SECRET_PATH]' },
  { re: /\S+\.(?:pem|key)\b/g,                 replacement: '[REDACTED_SECRET_PATH]' },
];

/**
 * F2 — apply PII / secret masking to a prompt-history list. Returns a
 * new list with the same length; each entry's `text` has secrets
 * replaced. Other fields are passed through.
 */
export function f2MaskPromptHistory(history: readonly PromptRecord[]): PromptRecord[] {
  return history.map((p) => ({ ...p, text: maskSecretsInText(p.text) }));
}

/** Apply every mask pattern to a single string. */
export function maskSecretsInText(text: string): string {
  let out = text;
  for (const { re, replacement } of SECRET_PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}

/** F4 — sentence-boundary truncation cap. */
export const F4_MAX_LINES = 2;
export const F4_MAX_CHARS = 120;

/**
 * F4 — enforce the per-substitution length cap. If the substitution
 * fits, returns it as-is. If it overflows on line-count or char-count,
 * attempts a sentence-boundary truncation. Returns null if no clean
 * truncation is possible — the caller must fall back to Strategy D.
 */
export function f4EnforceLengthCap(substitution: string): string | null {
  const lineCount = substitution.split('\n').length;
  if (lineCount <= F4_MAX_LINES && substitution.length <= F4_MAX_CHARS) {
    return substitution;
  }
  // Attempt sentence-boundary truncation. Find the last sentence
  // terminator within the char cap; require that the line-count post-
  // truncation is ≤ F4_MAX_LINES.
  const truncated = substitution.slice(0, F4_MAX_CHARS);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? '),
    truncated.lastIndexOf('.\n'),
  );
  if (lastSentenceEnd < 20) return null;  // truncation would leave nothing useful
  const candidate = substitution.slice(0, lastSentenceEnd + 1).trim();
  if (candidate.split('\n').length > F4_MAX_LINES) return null;
  return candidate;
}

/**
 * F5 — deduplicate near-identical prompts. Returns a deduplicated copy
 * of `history` preserving first-occurrence order. Comparison is
 * case-insensitive whitespace-normalised string equality (a loose
 * heuristic that covers verbatim repeated prompts; minor textual
 * variation slips through, which is intentional — the LLM rewrite
 * already handles natural language variation).
 */
export function f5DeduplicatePrompts(history: readonly PromptRecord[]): PromptRecord[] {
  const seen = new Set<string>();
  const out: PromptRecord[] = [];
  for (const p of history) {
    const key = p.text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/** Single repetition record returned by `computeRepetitionCounts`. */
export interface RepetitionEntry {
  /** Original-cased token (first occurrence wins). */
  token:       string;
  /** Number of distinct prompts (pre-dedup) that contained the token. */
  promptCount: number;
}

/**
 * Compute per-token cross-prompt repetition counts on the PRE-dedup
 * prompt set. The F5 dedup step collapses verbatim duplicates so
 * vocab extraction doesn't over-weight a copy-pasted phrase, but
 * that collapse hides the F5 "repeated [verb] pattern" signal the
 * rewrite summary is supposed to surface (dev-plan §10.6 F5 row).
 *
 * Returns tokens that appear in ≥ 2 distinct prompts, sorted by
 * promptCount descending. Stopwords + tokens shorter than 2 chars
 * are skipped (same filter as `extractVocab`).
 */
export function computeRepetitionCounts(history: readonly PromptRecord[]): RepetitionEntry[] {
  const promptsContaining = new Map<string, Set<number>>();
  const rawByLower        = new Map<string, string>();
  for (let i = 0; i < history.length; i++) {
    const seen = new Set<string>();
    for (const raw of history[i].text.split(/\s+/)) {
      const cleaned = trimPunctuation(raw);
      if (cleaned.length < 2) continue;
      const lower = cleaned.toLowerCase();
      if (STOPWORDS.has(lower)) continue;
      if (!rawByLower.has(lower)) rawByLower.set(lower, cleaned);
      seen.add(lower);
    }
    for (const t of seen) {
      let bucket = promptsContaining.get(t);
      if (!bucket) {
        bucket = new Set<number>();
        promptsContaining.set(t, bucket);
      }
      bucket.add(i);
    }
  }
  const out: RepetitionEntry[] = [];
  for (const [lower, prompts] of promptsContaining) {
    if (prompts.size >= 2) {
      out.push({ token: rawByLower.get(lower)!, promptCount: prompts.size });
    }
  }
  out.sort((a, b) => b.promptCount - a.promptCount);
  return out;
}

/**
 * L2 sensitive-action triggers (per CLAUDE.md L2 trigger list, used by F7).
 *
 * False-positive note: `\benv\b` (standalone) is per dev-plan §10.6.1
 * literal trigger-token list but will match common non-sensitive
 * phrasings like "env variable" / "set env" / "use env". The
 * downstream behaviour (path-(b) strip + path-(a) safeguard append)
 * is conservatively safe — extra escalations are noisy but not
 * destructive — so the dev-plan literal stays. Revisit if FP rate
 * becomes a UX issue.
 */
const L2_TRIGGER_PATTERNS: readonly { name: string; re: RegExp }[] = [
  { name: 'destructive-fs',    re: /\brm\s+-rf\b|\bdelete\b|\bdrop\s+table\b|\btruncate\b/i },
  { name: 'schema-migration',  re: /\bmigrate\b|\balter\s+table\b|\bdrop\s+column\b/i },
  { name: 'dep-install',       re: /\b(?:npm|pip|apt)\s+install\b|\bupgrade\b/i },
  { name: 'secret-env',        re: /\benv\b|\.env\b|\bsecret\b|\bcredential\b/i },
  { name: 'force-push',        re: /\bforce\s+push\b|--force\b|\s-f\b/i },
  { name: 'deployment',        re: /\bdeploy\b|\brelease\b|\bprod\b|\bproduction\b|\bstaging\b/i },
  { name: 'multi-file-mod',    re: /\brefactor\s+across\b|\brewrite\s+all\b|\bmigrate\s+all\b/i },
];

/**
 * Build the runtime L2 escalation safeguard sentence. Plugs the FIRST
 * detected trigger's literal user-prompt span into the `<action>`
 * slot of the locked template. Per dev-plan §10.6.1, the safeguard
 * sentence is user-grounded — the actual phrasing the user typed (as
 * matched by the trigger regex) fills the slot, preserving the
 * specificity of what the runtime is flagging.
 *
 * Falls back to a generic 'this sensitive action' phrase only when
 * `matches` is empty (defensive — callers should never invoke this
 * with an empty list).
 */
export function buildL2SafeguardSentence(matches: ReadonlyArray<L2TriggerMatch>): string {
  const first  = matches[0];
  const action = first ? first.matchedText : 'this sensitive action';
  return `Still, before you do this ${action} you must ask me for go-ahead confirmation.`;
}

/**
 * Strip L2 trigger phrases from each prompt's text. Used before vocab
 * extraction so sensitive verbs do not flow into the LLM rewrite
 * output. The masked replacements preserve word boundaries by
 * substituting a single space (collapsed afterwards in vocab tokenise).
 */
export function stripL2TriggerText(history: readonly PromptRecord[]): PromptRecord[] {
  // Each L2 trigger regex carries an alternation that may match multiple
  // times in a single prompt. The detection regexes do not have the
  // global flag (test() on /g would mutate lastIndex across calls), so
  // build a per-call /gi clone here for full-text replacement.
  const globalPatterns = L2_TRIGGER_PATTERNS.map(({ re }) => new RegExp(re.source, 'gi'));
  return history.map((p) => ({
    ...p,
    text: globalPatterns.reduce((t, re) => t.replace(re, ' '), p.text),
  }));
}

/**
 * Append the L2 safeguard sentence to a substituted desc-base. The
 * placement is at the end of the body (just before any trailing
 * `{R4_CLOSE}` placeholder so the bookend stays on the final line).
 * Returns the input unchanged when `matches` is empty.
 */
export function appendL2Safeguard(descBase: string, matches: ReadonlyArray<L2TriggerMatch>): string {
  if (matches.length === 0) return descBase;
  const sentence = buildL2SafeguardSentence(matches);
  // If the desc-base still carries an unsubstituted `{R4_CLOSE}` placeholder,
  // insert before it; otherwise append at the end.
  if (descBase.includes('{R4_CLOSE}')) {
    return descBase.replace('{R4_CLOSE}', `${sentence}\n{R4_CLOSE}`);
  }
  return `${descBase}\n${sentence}`;
}

/**
 * F7 — detect L2 sensitive-action triggers in the prompt history.
 * Returns the list of detected trigger names (deduplicated, ordered
 * by trigger-category iteration). Empty array means no L2 trigger
 * detected.
 */
export function f7DetectL2Triggers(history: readonly PromptRecord[]): string[] {
  const hits = new Set<string>();
  for (const p of history) {
    for (const { name, re } of L2_TRIGGER_PATTERNS) {
      if (re.test(p.text)) hits.add(name);
    }
  }
  return Array.from(hits);
}

/** Per-match record returned by `f7DetectL2TriggerMatches`. */
export interface L2TriggerMatch {
  /** Category name (e.g. 'destructive-fs', 'deployment'). */
  name:        string;
  /** Literal text from the user prompt that satisfied the trigger regex (whitespace-normalised). */
  matchedText: string;
  /** 0-based index of the prompt where the match was found (history order). */
  promptIndex: number;
}

/**
 * F7 — return the FIRST matched-text occurrence per (prompt, category)
 * pair, preserving prompt + pattern order. Distinct from
 * `f7DetectL2Triggers` which deduplicates to category names — this
 * variant surfaces the literal user-prompt text so the runtime can
 * fill the `<specific sensitive action>` slot in the safeguard
 * sentence with the actual user phrasing (per dev-plan §10.6.1).
 */
export function f7DetectL2TriggerMatches(history: readonly PromptRecord[]): L2TriggerMatch[] {
  const out: L2TriggerMatch[] = [];
  for (let i = 0; i < history.length; i++) {
    const text = history[i].text;
    for (const { name, re } of L2_TRIGGER_PATTERNS) {
      const m = text.match(re);
      if (m) {
        out.push({
          name,
          matchedText: m[0].replace(/\s+/g, ' ').trim(),
          promptIndex: i,
        });
      }
    }
  }
  return out;
}

// ─── Haiku LLM rewrite wrapper + 70-80% concentration rule ────────────
//
// The rewrite step takes the filtered vocab list + signal + register
// + the in-template R5_INJECT example as guidance and asks a Haiku-
// tier model to produce a 1-2-line summary that concentrates ≥ 70%
// of its output vocabulary from the user-grounded extracted tokens.
//
// The client is passed in by the caller (dependency-injected) so the
// production binding can use the existing OpenAI client while the
// tests use a mock implementation. The wrapper itself is responsible
// only for prompt construction + post-output concentration check.

/** 70-80% concentration rule lower bound. */
export const CONCENTRATION_THRESHOLD = 0.7;

/** Pluggable rewrite client interface — production binds an OpenAI / Anthropic implementation. */
export interface R5RewriteClient {
  /** Run the rewrite prompt and return the model's text output. Never throws — falls back to the empty string on error. */
  rewrite(prompt: string): Promise<string>;
}

/** Compose the rewrite prompt sent to the Haiku model. */
export function buildRewritePrompt(
  vocab:       readonly string[],
  signalType:  string,
  register:    R5Register,
  exampleHint: string,
  repetitions: ReadonlyArray<RepetitionEntry> = [],
): string {
  const registerInstruction: Record<R5Register, string> = {
    formal:   'Use third-person framing such as "Recent prompts: ..." or "The session has ...". Do NOT use first-person.',
    casual:   'Use first-person framing such as "I\'ve been ...". Keep the tone conversational.',
    beginner: 'Use first-person framing such as "I\'ve been ...". Keep the wording simple and explicit.',
  };

  const lines: string[] = [
    `You are summarising recent user prompts for a coding-agent signal of type "${signalType}".`,
    '',
    `Register: ${register}.`,
    registerInstruction[register],
    '',
    'Produce a 1-2-line summary where AT LEAST 70-80% of the words come from this user-grounded vocabulary set:',
    JSON.stringify(vocab),
    '',
    'Add only the remaining ≤ 30% as structural connective words (e.g., "I\'ve been", "Recent prompts:", "without") for grammatical coherence.',
    '',
  ];

  // F5 repetition hint — surface tokens that appeared across multiple
  // distinct prompts (pre-dedup) so the summary can naturally call out
  // the "repeated [verb]" pattern per dev-plan §10.6 F5 row.
  if (repetitions.length > 0) {
    const hint = repetitions.map((r) => `${r.token} (×${r.promptCount})`).join(', ');
    lines.push(
      `These tokens appeared in multiple distinct user prompts (indicating a repeated focus): ${hint}.`,
      'Reflect this repetition naturally in the summary (e.g. "I\'ve been repeatedly ..." or "Recent prompts have repeatedly ...").',
      '',
    );
  }

  lines.push(
    'Match the format and length of this example shape (the actual content should be different — the example only shows length and tone):',
    exampleHint,
    '',
    'Constraints:',
    '- Total length: ≤ 2 lines / ≤ 120 characters.',
    '- Do NOT use the words "AI", "Claude", "assistant", or any third-person agent reference.',
    '- Do NOT address the user as "you" / "your".',
    '- Output ONLY the summary text, no preamble, no quotes, no markdown.',
  );

  return lines.join('\n');
}

/**
 * Calculate the fraction of summary words that come from the
 * user-grounded vocabulary set. Returns 0 when the summary is empty.
 * Comparison is case-insensitive on whitespace-split tokens.
 */
export function calculateUserVocabConcentration(
  summary: string,
  vocab:   readonly string[],
): number {
  const words = summary
    .toLowerCase()
    .split(/[^a-z0-9_$.]+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return 0;
  const vocabLower = new Set(vocab.map((t) => t.toLowerCase()));
  let fromVocab = 0;
  for (const w of words) {
    if (vocabLower.has(w)) fromVocab++;
  }
  return fromVocab / words.length;
}

/** Returns true when the summary meets the 70-80% concentration threshold. */
export function meetsConcentrationThreshold(
  summary: string,
  vocab:   readonly string[],
): boolean {
  return calculateUserVocabConcentration(summary, vocab) >= CONCENTRATION_THRESHOLD;
}

/**
 * Run the rewrite call against the provided client + return the model
 * output verbatim. The caller is responsible for downstream length-cap
 * and concentration checks. Returns the empty string when the client
 * throws (the contract is: this wrapper never throws).
 */
export async function rewriteViaLLM(
  vocab:       readonly string[],
  signalType:  string,
  register:    R5Register,
  exampleHint: string,
  client:      R5RewriteClient,
  repetitions: ReadonlyArray<RepetitionEntry> = [],
): Promise<string> {
  const prompt = buildRewritePrompt(vocab, signalType, register, exampleHint, repetitions);
  try {
    return await client.rewrite(prompt);
  } catch {
    return '';
  }
}
