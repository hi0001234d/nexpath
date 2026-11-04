/**
 * Feature 1 — Context Engineering: Typed Fact Extractor
 *
 * Distills raw assistant responses and developer prompts into structured facts
 * across 3 practical buckets (`rule`, `failure`, `intent`) with 2-tier lock
 * confidence (0.95 explicit, 0.70 inferred) and exact verbatim user preservation.
 *
 * Implements:
 *  - TC-M2.1 to TC-M2.6
 *  - Decision A6 (2-Tier lock confidence)
 *  - Deterministic execution in <2ms with zero external network requests.
 */

import { createHash } from 'node:crypto';
import { normalizeText, phrase, literal, letterCount, splitSentences as splitUnicodeSentences } from '../core/unicode-text.js';
import type {
  ContextMemoryKind,
  ContextIdentity,
} from '../types/context-engineering.js';

export interface ExtractedFact {
  kind: ContextMemoryKind;
  key: string;
  content: string;
  verbatim?: string;
  identities?: ContextIdentity[];
  locked: boolean;
  confidence: number;
  fingerprint: string;
  evidence?: string;
}

export interface FactExtractionInput {
  projectRoot: string;
  prompt: string;
  assistantResponse: string;
}

// ============================================================================
// Lock Phrase Matchers
// ============================================================================

// English lock words: the same alternatives as before V2 #7, so English lock results do not change.
const ENGLISH_EXPLICIT_LOCK = 'lock\\s+the\\s+design|settled|locked\\s+requirement|final\\s+decision|lock\\s+this|strictly\\s+locked|locked';
const ENGLISH_INFERRED_LOCK = 'always|never|must|only\\s+allowed|strictly|do\\s+not\\s+allow|shall\\s+not|prohibited';

/** An apostrophe typed straight or curly (`that's` / `that’s`) or left out (`thats`). */
const APOS = "['\u2019]?";

/**
 * Lock words of the other languages Nexpath supports (multilingual #7, impl Step 2; user decision
 * 2026-11-03: all added now). Clear decisions lock a fact at 0.95; softer "don't change it" wording only
 * at 0.70, as English "never" / "must". Hindi, Hinglish, Gujarati and Gujlish are team-checked; the
 * Spanish, Portuguese, American slang and African-language words are drafts not yet checked by a native
 * speaker (v2-multilingual docs).
 */
const MULTILINGUAL_EXPLICIT_LOCK: Record<string, string[]> = {
  hi: ['यह final है', 'ये final है', 'यह फ़ाइनल है', 'ये फ़ाइनल है', 'पक्का फ़ैसला', 'पक्का फैसला', 'पक्का निर्णय', 'पक्का नियम', 'अंतिम फ़ैसला', 'अंतिम फैसला', 'अंतिम निर्णय'],
  'hi-latn': ['final hai', 'ye fix hai', 'yeh fix hai', 'ye fixed hai', 'pakka faisla', 'pakka niyam'],
  gu: ['આ final છે', 'આ ફાઇનલ છે', 'પાકો નિર્ણય', 'પાકો નિયમ', 'અંતિમ નિર્ણય'],
  'gu-latn': ['aa final che', 'aa final chhe', 'aa fix che', 'aa fix chhe', 'pako nirnay', 'pako niyam'],
  'en-US-slang': [`that${APOS}s final`, 'set in stone', 'locked in'],
  'es-419': ['ya está decidido', 'ya esta decidido', 'está decidido', 'es definitivo', 'decisión final', 'decision final'],
  'pt-BR': ['já está decidido', 'ja esta decidido', 'é definitivo', 'decisão final', 'decisao final'],
  sw: ['ni uamuzi wa mwisho', 'uamuzi wa mwisho', 'imeamuliwa'],
  pcm: ['na final be that'],
  'sw-sheng': ['hii ni final'],
  ha: ['an yanke shawara', 'wannan shi ne na ƙarshe', 'wannan shine na ƙarshe', 'wannan shi ne na karshe', 'wannan shine na karshe'],
  am: ['የመጨረሻ ውሳኔ'],
};
const MULTILINGUAL_INFERRED_LOCK: Record<string, string[]> = {
  hi: ['इसे मत बदलना', 'मत बदलना', 'बदलना नहीं है', 'इसे नहीं बदलना'],
  'hi-latn': ['change mat karna', 'change mat kar', 'mat badalna', 'mat chhedna', 'mat chedna', 'change nahi karna'],
  gu: ['આ બદલવાનું નથી', 'બદલવાનું નથી', 'બદલશો નહીં'],
  'gu-latn': ['badalvanu nahi', 'badalvanu nathi', 'badalso nahi'],
  'en-US-slang': [`don${APOS}t touch that`, 'hands off'],
  'es-419': ['no se cambia', 'no lo cambien', 'no lo cambies'],
  'pt-BR': ['não muda', 'nao muda', 'não mexam nisso', 'nao mexam nisso', 'não mexa nisso', 'nao mexa nisso'],
  sw: ['usibadilishe', 'msibadilishe'],
  pcm: ['make una no change am', 'no change am', 'no touch am'],
  'sw-sheng': ['msiibadilishe', 'usiguze hiyo', 'msiguze hiyo'],
  ha: ['kada a canza', 'kar a canza'],
  am: ['አትቀይሩት', 'አትቀይረው'],
};

/** Plain phrases become regex sources; an `APOS` slot is kept as a regex. */
const lockSources = (byLanguage: Record<string, string[]>) =>
  Object.values(byLanguage).flat().map((p) => p.split(APOS).map(literal).join(APOS));

const EXPLICIT_LOCK_REGEX = phrase([ENGLISH_EXPLICIT_LOCK, ...lockSources(MULTILINGUAL_EXPLICIT_LOCK)]);

const INFERRED_LOCK_REGEX = phrase([ENGLISH_INFERRED_LOCK, ...lockSources(MULTILINGUAL_INFERRED_LOCK)]);

/** Lock-word test in every script (text NFC-normalized first, see unicode-text.ts). */
const hasLockWord = (re: RegExp, text: string) => re.test(normalizeText(text));

// ============================================================================
// Bucket Matchers
// ============================================================================

const FAILURE_PATTERNS = [
  /\b(error|crash|exception|failed|failure|500|404|408|econnreset|typeerror|rejected|false\s+positives?)\b/i,
];

const INTENT_PATTERNS = [
  /\b(i\s+want|goal\s+is|aiming\s+to|we\s+need\s+to|requirement\s+is|objective|intend\s+to)\b/i,
];

const RULE_PATTERNS = [
  /\b(policy|convention|standard|architecture|retry|backoff|database|postgres|mongo|schema|timeout|only\s+entry\s+point|config|endpoint)\b/i,
];

/** Decision wording that makes a sentence in an agent reply a rule (besides EXPLICIT_LOCK_REGEX). */
const REPLY_RULE_REGEX =
  /\b(must\s+always|must\s+never|always\s+use|never\s+use|do\s+not\s+allow|only\s+allowed|shall\s+not|prohibited|only\s+entry\s+point)\b/i;

/**
 * A sentence the reply itself labels as a decision: "Decision: …", "Rule 3: …",
 * "Policy update: …", "Our architecture standard is: …".
 */
const REPLY_DECISION_LABEL_REGEX =
  /^(?:[a-z]+\s+){0,2}(?:decision|rule(?:\s+\d+)?|policy(?:\s+update)?|convention|standard|constraint|architecture(?:\s+(?:decision|standard|rule))?)(?:\s+is)?\s*:/i;

/** Signatures of a real failure in an agent reply. */
const REPLY_FAILURE_REGEX = new RegExp(
  [
    'error:', '\\bexception\\b', '\\bcrash(?:ed|es|ing)?\\b', '\\broot\\s+cause\\b', '\\bcaused\\b',
    '\\bstack\\s+trace\\b', '\\b(?:type|reference|syntax|range)error\\b',
    '\\b(?:ECONN[A-Z]+|ETIMEDOUT|ENOTFOUND|EADDRINUSE|EACCES|EPIPE)\\b', '\\bsegfault\\b', '\\bpanic(?:ked)?\\b',
    '\\bfalse\\s+positives?\\b', '\\btimed\\s+out\\b', '\\bfail(?:ed|s|ure)?\\b.*\\bbecause\\b',
  ].join('|'),
  'i'
);

/** "18 of 26 checks failed", "3/40 tests passed": a result count, not a project failure. */
const TEST_TALLY_REGEX = /\b\d+\s*(?:of|\/)\s*\d+\b.*\b(?:pass|fail|check|test)/i;

/** Longer sentences are explanations, not crisp facts. */
const MAX_REPLY_FACT_CHARS = 400;

const QUESTION_PREFIXES = [
  /^(how|what|why|when|where|which|who|can\s+we|could\s+we|is\s+there|are\s+we|should\s+we|do\s+we|does\s+it)\b/i,
];

/** Question words of the other languages (multilingual #7): at the start, or Hindi `kya` at the end. */
const MULTILINGUAL_QUESTION_WORDS = [
  'kya', 'kaise', 'kyun', 'kyu', 'kab', 'kahan', 'kaun sa', 'kaunsa', // Hinglish
  'shu', 'kem', 'kevi rite', 'kyare', // Gujlish
  'क्या', 'कैसे', 'क्यों', 'कब', 'कहाँ', 'कौन सा', // Hindi
  'શું', 'કેમ', 'ક્યારે', 'કેવી રીતે', // Gujarati
  'qué', 'cómo', 'por qué', 'cuándo', 'dónde', 'cuál', // Spanish
  'o que', 'como', 'por que', // Portuguese
  'nini', 'vipi', 'kwa nini', // Swahili
].map(literal);
const MULTILINGUAL_QUESTION_START = new RegExp(`^${phrase(MULTILINGUAL_QUESTION_WORDS).source}`, 'iu');
const MULTILINGUAL_QUESTION_END = new RegExp(`${phrase([literal('kya'), literal('क्या')]).source}\\s*[.!]?$`, 'iu');
/** `?`, the Arabic `؟`, the Amharic `፧`, or a Spanish opening `¿`. */
const QUESTION_MARK_END = /[?؟፧]$/u;


// ============================================================================
// Main Extractor
// ============================================================================

export function extractFacts(input: FactExtractionInput): ExtractedFact[] {
  const { projectRoot, prompt, assistantResponse } = input;
  const facts: ExtractedFact[] = [];

  // 1. Inspect Developer Prompt for INTENT facts (user goals)
  const trimmedPrompt = prompt.trim();

  // A prompt can carry both a goal and a decision ("I want X. Final decision: Y").
  // Each locked sentence becomes its own rule so it can be superseded later;
  // the rest of the prompt is still checked for intent.
  const lockSentences = splitSentences(trimmedPrompt).filter(
    (s) => hasLockWord(EXPLICIT_LOCK_REGEX, s) && !isQuestion(s)
  );
  if (lockSentences.length > 0) {
    for (const sentence of lockSentences) {
      facts.push(buildFact(projectRoot, 'rule', sentence, sentence, extractIdentities(sentence)));
    }
    const remainder = splitSentences(trimmedPrompt)
      .filter((s) => !lockSentences.includes(s))
      .join(' ');
    if (remainder && matchesAny(remainder, INTENT_PATTERNS)) {
      facts.push(buildFact(projectRoot, 'intent', remainder, remainder, extractIdentities(remainder)));
    }
  } else if (matchesAny(trimmedPrompt, INTENT_PATTERNS)) {
    const identities = extractIdentities(trimmedPrompt);
    facts.push(buildFact(projectRoot, 'intent', trimmedPrompt, trimmedPrompt, identities));
  } else if (hasLockWord(EXPLICIT_LOCK_REGEX, trimmedPrompt) && !isQuestion(trimmedPrompt)) {
    // Explicit user lock command (e.g. "Lock this requirement: ...")
    const identities = extractIdentities(trimmedPrompt);
    facts.push(buildFact(projectRoot, 'rule', trimmedPrompt, trimmedPrompt, identities));
  }

  // 2. Inspect Assistant Response for RULE and FAILURE facts.
  //    Replies are long markdown: read them as plain sentences (no code blocks, tables or
  //    markers, wrapped lines re-joined) and keep only clear decisions and real errors, so
  //    explanations, summaries and half-sentences never become project memory.
  for (const sentence of replyToSentences(assistantResponse)) {
    if (isQuestion(sentence) || sentence.length > MAX_REPLY_FACT_CHARS) continue;

    const identities = extractIdentities(sentence);

    // A. FAILURE facts: an actual error, crash or root cause, not a test tally.
    if (REPLY_FAILURE_REGEX.test(sentence) && !TEST_TALLY_REGEX.test(sentence)) {
      facts.push(buildFact(projectRoot, 'failure', sentence, undefined, identities));
      continue;
    }

    // B. RULE facts: only explicit decision wording.
    if (hasLockWord(EXPLICIT_LOCK_REGEX, sentence) || REPLY_RULE_REGEX.test(sentence) || REPLY_DECISION_LABEL_REGEX.test(sentence)) {
      facts.push(buildFact(projectRoot, 'rule', sentence, undefined, identities));
    }
  }

  // Deduplicate facts extracted from the same turn by fingerprint
  const uniqueMap = new Map<string, ExtractedFact>();
  for (const f of facts) {
    if (!uniqueMap.has(f.fingerprint)) {
      uniqueMap.set(f.fingerprint, f);
    }
  }

  return Array.from(uniqueMap.values());
}

/** A turn summary below this many words says nothing worth remembering ("User is agreeable."). */
const MIN_SUMMARY_WORDS = 5;
/** MemOS summaries are a model's paraphrase: never locked, never as strong as the user's own words. */
const MAX_SUMMARY_CONFIDENCE = 0.7;

/**
 * v1(a): MemOS's one-line summary of a turn → one fact for our map (a failure when it names an
 * error, otherwise a project note kept as a rule so later decisions can replace it). Our map then
 * understands turns our patterns miss ("let's just go with redis"). Returns undefined for a
 * summary too short to be a fact.
 */
export function factFromTurnSummary(projectRoot: string, summary: string, ref: string): ExtractedFact | undefined {
  const content = summary.replace(/\s+/g, ' ').trim();
  if (content.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length < MIN_SUMMARY_WORDS) return undefined;
  const kind: ContextMemoryKind = REPLY_FAILURE_REGEX.test(content) ? 'failure' : 'rule';
  const fact = buildFact(projectRoot, kind, content, undefined, extractIdentities(content));
  return {
    ...fact,
    locked: false,
    confidence: Math.min(fact.confidence, MAX_SUMMARY_CONFIDENCE),
    evidence: JSON.stringify({ source: 'memos', ref }),
  };
}

/**
 * Derives lock status and 2-tier confidence for a candidate text.
 */
export function evaluateLockConfidence(text: string): { locked: boolean; confidence: number } {
  if (hasLockWord(EXPLICIT_LOCK_REGEX, text)) {
    return { locked: true, confidence: 0.95 };
  }
  if (hasLockWord(INFERRED_LOCK_REGEX, text)) {
    return { locked: true, confidence: 0.70 };
  }
  return { locked: false, confidence: 0.50 };
}

/**
 * Extracts referenced files, classes, and functions from text.
 */
export function extractIdentities(text: string): ContextIdentity[] {
  const identities: ContextIdentity[] = [];

  // Match file paths (e.g. src/auth/token.ts, config.json, payment.ts)
  const fileMatches = text.match(/\b([A-Za-z0-9_./-]+\.(ts|tsx|js|jsx|json|py|go|rs|sql))\b/g);
  if (fileMatches) {
    for (const f of fileMatches) {
      if (!f.startsWith('http') && !identities.some((i) => i.file === f)) {
        identities.push({ file: f, type: 'file' });
      }
    }
  }

  // Match function definitions or references
  const funcMatches = text.match(/\b([a-zA-Z0-9_]+)\(\)/g);
  if (funcMatches) {
    for (const fn of funcMatches) {
      const clean = fn.replace('()', '');
      if (!identities.some((i) => i.symbol === clean)) {
        identities.push({ symbol: clean, type: 'function' });
      }
    }
  }

  // Match symbols written without parentheses: `backticked` names and camelCase
  // identifiers (processRetry, computeBackoff). File paths are removed first so
  // "src/paymentService.ts" does not also yield "paymentService".
  const withoutFiles = fileMatches
    ? fileMatches.reduce((acc, f) => acc.split(f).join(' '), text)
    : text;
  const symbolMatches = withoutFiles.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`|\b([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)\b/g);
  for (const m of symbolMatches) {
    const clean = m[1] ?? m[2];
    if (clean && !identities.some((i) => i.symbol === clean)) {
      identities.push({ symbol: clean, type: 'function' });
    }
  }

  return identities;
}

/**
 * Computes deterministic content fingerprint: sha256(project_root + ':' + kind + ':' + key + ':' + content)
 */
export function computeFactFingerprint(
  projectRoot: string,
  kind: ContextMemoryKind,
  key: string,
  content: string
): string {
  return createHash('sha256')
    .update(`${projectRoot}:${kind}:${key}:${content}`)
    .digest('hex');
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Splits text into sentences on ". ! ?" followed by whitespace, on the Hindi danda `।` / `॥` and the
 * Amharic `።`, and on newlines (unicode-text.ts SENTENCE_END).
 */
function splitSentences(text: string): string[] {
  return splitUnicodeSentences(text);
}

function isQuestion(text: string): boolean {
  if (text.endsWith('?')) return true;
  if (matchesAny(text, QUESTION_PREFIXES)) return true;
  const t = normalizeText(text.trim());
  return QUESTION_MARK_END.test(t) || t.startsWith('¿') || MULTILINGUAL_QUESTION_START.test(t) || MULTILINGUAL_QUESTION_END.test(t);
}

function buildFact(
  projectRoot: string,
  kind: ContextMemoryKind,
  content: string,
  verbatim?: string,
  identities?: ContextIdentity[]
): ExtractedFact {
  const { locked, confidence } = evaluateLockConfidence(content);
  const key = generateFactKey(content, kind);
  const fingerprint = computeFactFingerprint(projectRoot, kind, key, content);

  return {
    kind,
    key,
    content,
    verbatim,
    identities: identities && identities.length > 0 ? identities : undefined,
    locked,
    confidence,
    fingerprint,
  };
}

function generateFactKey(content: string, kind: ContextMemoryKind): string {
  // Letters of every script stay in the key (multilingual #7): Hindi or Gujarati-only rules used to all
  // get `rule-fact` and replace each other. Plain-ASCII text gives the same key as before.
  const words = normalizeText(content)
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, '')
    .split(/\s+/)
    // letters, not code units: a Hindi vowel sign is not a letter, so `में` / `है` are short words too
    .filter((w) => letterCount(w) > 2 && !['the', 'and', 'for', 'with', 'that', 'this'].includes(w))
    .slice(0, 4);

  const slug = words.join('-') || 'fact';
  return `${kind}-${slug}`;
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}


/**
 * Turns a markdown reply into plain sentences: code blocks, tables and rules are dropped,
 * list/heading/bold/code markers are stripped, and lines wrapped inside a paragraph or list
 * item are joined back before splitting into sentences.
 */
export function replyToSentences(reply: string): string[] {
  const units: string[] = [];
  let current: string[] = [];
  let inFence = false;
  const flush = () => {
    if (current.length > 0) units.push(current.join(' '));
    current = [];
  };

  for (const raw of reply.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      flush();
      continue;
    }
    if (inFence) continue;
    if (line === '' || line.startsWith('|') || /^[-*_]{3,}$/.test(line)) {
      flush();
      continue;
    }
    if (/^(#{1,6}\s|[-*+•]\s|\d+[.)]\s|>)/.test(line)) flush();
    current.push(stripMarkdown(line));
  }
  flush();

  return units
    .flatMap(splitSentences)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 10);
}

function stripMarkdown(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/^([-*+•]|\d+[.)])\s+/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim();
}
