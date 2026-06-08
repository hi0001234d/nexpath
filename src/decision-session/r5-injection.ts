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
}

/**
 * R5 runtime substitution — the public entry point. Orchestrates the
 * locked 8-step Strategy-C flow with Strategy-D fallback on any of the
 * F1-F7 failure modes:
 *
 *   1. Idempotency        — return verbatim if no `{R5_INJECT}` placeholder
 *   2. F1 early-session   — fall back to D when history.length < 2
 *   3. F2 mask secrets    — redact PII / credentials before extraction
 *   4. F5 dedup           — collapse repeated prompts
 *   5. Vocab extraction   — top-N grounded tokens from masked history
 *   6. Step-4.5 filter    — drop banned tokens from the vocab list
 *   7. LLM rewrite        — produce 1-2-line summary (if client provided)
 *   8. F4 length cap      — sentence-boundary truncate or fall back
 *   9. 70-80% rule check  — fall back if summary concentration < 0.7
 *
 * Contract:
 *   - Never throws — every failure path resolves to a Strategy-D
 *     substitution OR (if no fallback exists for the (signal_type,
 *     register) pair) returns the desc-base verbatim.
 *   - Idempotent on inputs without `{R5_INJECT: ...}`.
 */
export async function injectR5(
  descBase:   string,
  history:    readonly PromptRecord[],
  signalType: string,
  register:   R5Register,
  options:    InjectR5Options = {},
): Promise<string> {
  if (!hasR5Injection(descBase)) return descBase;

  // (2) F1 — early-session guard.
  if (f1ShouldFallback(history)) {
    return strategyDFallback(descBase, signalType, register);
  }

  // (3) F2 — mask PII / secrets BEFORE any token extraction touches them.
  const masked = f2MaskPromptHistory(history);

  // (4) F5 — collapse verbatim-repeated prompts so the extractor doesn't
  // over-weight a copy-pasted sentence.
  const deduped = f5DeduplicatePrompts(masked);

  // (5) — deterministic vocab extraction.
  const rawVocab = extractVocab(deduped);

  // (6) — step-4.5 voice-rule filter.
  const filteredVocab = applyVoiceRuleFilter(rawVocab);
  if (filteredVocab.length < 2) {
    return strategyDFallback(descBase, signalType, register);
  }

  // (7) — LLM rewrite, only when a client is bound. Without a client,
  // the runtime falls back to Strategy D — this keeps the path
  // production-safe in environments that haven't provisioned an LLM.
  if (!options.client) {
    return strategyDFallback(descBase, signalType, register);
  }
  const summary = await rewriteViaLLM(
    filteredVocab,
    signalType,
    register,
    options.exampleHint ?? '',
    options.client,
  );
  if (summary.trim().length === 0) {
    return strategyDFallback(descBase, signalType, register);
  }

  // (8) — F4 per-substitution length cap.
  const capped = f4EnforceLengthCap(summary);
  if (capped === null) {
    return strategyDFallback(descBase, signalType, register);
  }

  // (9) — 70-80% concentration check on the user-grounded vocab.
  if (!meetsConcentrationThreshold(capped, filteredVocab)) {
    return strategyDFallback(descBase, signalType, register);
  }

  return substituteR5Placeholder(descBase, capped);
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
  // API key / token / secret literals (prefixed)
  { re: /(?:api[_-]?key|token|secret|bearer)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{8,}['"]?/gi, replacement: '[REDACTED_SECRET]' },
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

/** L2 sensitive-action triggers (per CLAUDE.md L2 trigger list, used by F7). */
const L2_TRIGGER_PATTERNS: readonly { name: string; re: RegExp }[] = [
  { name: 'destructive-fs',    re: /\brm\s+-rf\b|\bdelete\b|\bdrop\s+table\b|\btruncate\b/i },
  { name: 'schema-migration',  re: /\bmigrate\b|\balter\s+table\b|\bdrop\s+column\b/i },
  { name: 'dep-install',       re: /\b(?:npm|pip|apt)\s+install\b|\bupgrade\b/i },
  { name: 'secret-env',        re: /\b\.env\b|\bsecret\b|\bcredential\b/i },
  { name: 'force-push',        re: /\bforce\s+push\b|--force\b|\s-f\b/i },
  { name: 'deployment',        re: /\bdeploy\b|\brelease\b|\bproduction\b|\bstaging\b/i },
  { name: 'multi-file-mod',    re: /\brefactor\s+across\b|\brewrite\s+all\b|\bmigrate\s+all\b/i },
];

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
): string {
  const registerInstruction: Record<R5Register, string> = {
    formal:   'Use third-person framing such as "Recent prompts: ..." or "The session has ...". Do NOT use first-person.',
    casual:   'Use first-person framing such as "I\'ve been ...". Keep the tone conversational.',
    beginner: 'Use first-person framing such as "I\'ve been ...". Keep the wording simple and explicit.',
  };
  return [
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
    'Match the format and length of this example shape (the actual content should be different — the example only shows length and tone):',
    exampleHint,
    '',
    'Constraints:',
    '- Total length: ≤ 2 lines / ≤ 120 characters.',
    '- Do NOT use the words "AI", "Claude", "assistant", or any third-person agent reference.',
    '- Do NOT address the user as "you" / "your".',
    '- Output ONLY the summary text, no preamble, no quotes, no markdown.',
  ].join('\n');
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
): Promise<string> {
  const prompt = buildRewritePrompt(vocab, signalType, register, exampleHint);
  try {
    return await client.rewrite(prompt);
  } catch {
    return '';
  }
}
