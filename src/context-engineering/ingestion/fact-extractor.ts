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

const EXPLICIT_LOCK_REGEX =
  /\b(lock\s+the\s+design|settled|locked\s+requirement|final\s+decision|lock\s+this|strictly\s+locked|locked)\b/i;

const INFERRED_LOCK_REGEX =
  /\b(always|never|must|only\s+allowed|strictly|do\s+not\s+allow|shall\s+not|prohibited)\b/i;

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
    (s) => EXPLICIT_LOCK_REGEX.test(s) && !isQuestion(s)
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
  } else if (EXPLICIT_LOCK_REGEX.test(trimmedPrompt) && !isQuestion(trimmedPrompt)) {
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
    if (EXPLICIT_LOCK_REGEX.test(sentence) || REPLY_RULE_REGEX.test(sentence) || REPLY_DECISION_LABEL_REGEX.test(sentence)) {
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

/**
 * Derives lock status and 2-tier confidence for a candidate text.
 */
export function evaluateLockConfidence(text: string): { locked: boolean; confidence: number } {
  if (EXPLICIT_LOCK_REGEX.test(text)) {
    return { locked: true, confidence: 0.95 };
  }
  if (INFERRED_LOCK_REGEX.test(text)) {
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

/** Splits text into sentences on ". ! ?" followed by whitespace, and on newlines. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isQuestion(text: string): boolean {
  if (text.endsWith('?')) return true;
  return matchesAny(text, QUESTION_PREFIXES);
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
  const words = content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['the', 'and', 'for', 'with', 'that', 'this'].includes(w))
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
