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

  // 2. Inspect Assistant Response for RULE and FAILURE facts
  const assistantLines = assistantResponse
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 10);

  for (const line of assistantLines) {
    if (isQuestion(line)) continue;

    const identities = extractIdentities(line);

    // A. FAILURE facts (errors, root causes, exceptions)
    if (
      matchesAny(line, FAILURE_PATTERNS) &&
      (line.includes('caused') ||
        line.includes('crashed') ||
        line.includes('error') ||
        line.includes('failed') ||
        line.includes('timeout'))
    ) {
      facts.push(buildFact(projectRoot, 'failure', line, undefined, identities));
      continue;
    }

    // B. RULE facts (architectural choices, policies, constraints)
    if (
      matchesAny(line, RULE_PATTERNS) ||
      EXPLICIT_LOCK_REGEX.test(line) ||
      INFERRED_LOCK_REGEX.test(line)
    ) {
      facts.push(buildFact(projectRoot, 'rule', line, undefined, identities));
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
