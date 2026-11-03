/**
 * Feature 1 — Context Engineering: 10-Line Budget Ranking & Deduplication Engine (Module 7, Piece 6 & 7)
 *
 * Scores candidate context facts via the 4-factor relevance formula:
 *   Score = (KeywordMatch * 0.40) + (Confidence * 0.30) + (RecencyDecay * 0.20) + (FileProximity * 0.10)
 *
 * Allocates lines based on TaskType caps (bugfix, feature, refactor, test, config, general),
 * backfills unused lines with further relevant LOCKED decisions, and enforces a strict,
 * unbreakable ceiling of at most 10 lines.
 *
 * Deduplicates facts already delivered in the active session to eliminate repetitive prompt noise.
 */

import { estimateTokenCount } from '../delivery/tag-generator.js';
import { isToolCandidateKind } from '../sources/candidate-filter.js';
import type {
  ContextMemoryRow,
  WorkspaceContext,
  TaskType,
  ScoredFact,
  ScoreBreakdown,
  BudgetRankingOptions,
  BudgetRankingResult,
} from '../types/context-engineering.js';

export const MAX_BUDGET_LINES = 10;
/** Backfilled decisions stop before the context passes the initial-turn token budget. */
const BACKFILL_TOKEN_BUDGET = 500;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface CategoryCaps {
  failure: number;
  rule: number;
  intent: number;
  workspace: number;
}

const TASK_CAPS: Record<TaskType, CategoryCaps> = {
  bugfix:   { failure: 4, rule: 3, intent: 1, workspace: 2 },
  feature:  { failure: 2, rule: 4, intent: 2, workspace: 2 },
  refactor: { failure: 2, rule: 4, intent: 2, workspace: 2 },
  test:     { failure: 3, rule: 3, intent: 1, workspace: 3 },
  config:   { failure: 2, rule: 3, intent: 2, workspace: 3 },
  general:  { failure: 2, rule: 3, intent: 2, workspace: 3 },
};

/**
 * Ranks, deduplicates, and allocates candidate facts to a strict <=10 line budget.
 */
export function rankAndAllocateBudget(
  rawPrompt: string,
  candidateFacts: ContextMemoryRow[],
  taskType: TaskType,
  options?: BudgetRankingOptions
): BudgetRankingResult {
  const startTime = performance.now();
  const maxTotalLines = options?.maxTotalLines ?? MAX_BUDGET_LINES;
  const promptTokens = tokenize(rawPrompt);
  const promptCodeNames = codeNameTokens(rawPrompt);
  const meaningOnlyIds = new Set<number>();
  // Project-wide words are ignored only when some fact shares a more specific word with the
  // prompt. In "rework the payment retry", where every fact is about payment retries and none
  // shares "rework", they ARE the topic and still count (V1 behaviour).
  const projectWide = projectWideStems(candidateFacts);
  const ownStems = [...promptTokens].filter((t) => !RELEVANCE_STOP_WORDS.has(t)).map(stem).filter((st) => !projectWide.has(st));
  const someFactSharesOwnWord =
    projectWide.size > 0 && ownStems.length > 0 && candidateFacts.some((f) => ownStems.some((st) => factStems(f).has(st)));
  const commonStems = someFactSharesOwnWord ? projectWide : new Set<string>();
  const now = Date.now();

  const deliveredMemoryIds = options?.deliveredMemoryIds ?? new Set<number>();
  const deliveredTags = options?.deliveredTags ?? new Set<string>();
  const context = options?.context;

  let deduplicatedCount = 0;
  const scoredCandidates: ScoredFact[] = [];

  // 1. Score each candidate fact and filter out deduplicated items
  for (const fact of candidateFacts) {
    if (fact.active === 0 || fact.superseded_by !== null) {
      continue;
    }

    // Deterministic Low-Confidence Fact Pruning (Decision T4 Rule 2 / TC-RNK-9): confidence < 0.40 pruned
    if (fact.confidence < 0.40) {
      continue;
    }

    const tag = formatFactTag(fact);

    // Session Deduplication Guard
    if (
      deliveredMemoryIds.has(fact.id) ||
      deliveredTags.has(tag) ||
      deliveredTags.has(fact.key)
    ) {
      deduplicatedCount++;
      continue;
    }

    const breakdown = calculateScoreBreakdown(fact, promptTokens, now, context);

    // v1(a) tool candidates (MemOS / OpenClaw / codebase-memory-mcp): the tool's score
    // stands in for the keyword match when it is higher.
    const isTool = isToolCandidateKind(fact.kind);
    if (isTool) {
      breakdown.keywordMatch = Math.max(breakdown.keywordMatch, fact.confidence);
    }

    // Relevance gate: confidence and recency alone must not pull a fact into an
    // unrelated prompt. A fact needs shared words, or a link to the active/recent
    // files when the prompt is an actual task ("fix this bug"), not chat ("hello").
    // Pattern alerts are exempt so unfinished work is still surfaced.
    // v1(a): MemOS / OpenClaw lines pass the same gate (2026-11-03 40-prompt run: MemOS scores
    // are relative — its best hit always scores 1.0 — so "what is the capital of France" still
    // got a "match"). Code lines are exempt: they come from code names in the prompt itself.
    const linkedToWorkingFiles = breakdown.fileProximity > 0 && taskType !== 'general';
    let foundByMeaningOnly = false;
    if (fact.kind !== 'code_context' && fact.kind !== 'pattern_alert' && !linkedToWorkingFiles && !sharesMeaningfulWord(promptTokens, fact, commonStems, promptCodeNames)) {
      if (!options?.meaningMatchedIds?.has(fact.id)) continue;
      foundByMeaningOnly = true; // leftover lines only: V1's own choice never changes
    }

    const score = Number(
      (
        breakdown.keywordMatch * 0.40 +
        breakdown.confidence * 0.30 +
        breakdown.recencyDecay * 0.20 +
        breakdown.fileProximity * 0.10
      ).toFixed(4)
    );

    const formattedLine = formatFactLine(fact);

    scoredCandidates.push({
      fact,
      score,
      breakdown,
      formattedLine,
      tag,
    });
    if (foundByMeaningOnly) meaningOnlyIds.add(fact.id);
  }

  // Sort descending by score
  scoredCandidates.sort((a, b) => b.score - a.score);

  // 2. Generate workspace lines if context is present
  const workspaceLines: string[] = [];
  const caps = TASK_CAPS[taskType] || TASK_CAPS.general;

  if (context?.activeFilePath && caps.workspace > 0) {
    const branchPart = context.gitBranch ? ` (branch: ${context.gitBranch})` : '';
    workspaceLines.push(`• Active file: ${context.activeFilePath}${branchPart}`);
  }

  if (context?.gitStatus && workspaceLines.length < caps.workspace) {
    workspaceLines.push(`• Git status: ${context.gitStatus}`);
  }

  // 3. Task-driven allocation by category
  const failures: ScoredFact[] = [];
  const rules: ScoredFact[] = [];
  const intents: ScoredFact[] = [];
  const tools: ScoredFact[] = [];

  for (const item of scoredCandidates) {
    const kind = item.fact.kind;
    if (isToolCandidateKind(kind) || meaningOnlyIds.has(item.fact.id)) {
      tools.push(item);
    } else if (kind === 'failure' || kind === 'pattern_alert') {
      failures.push(item);
    } else if (kind === 'intent') {
      intents.push(item);
    } else {
      // rule, constraint, convention, decision, pattern
      rules.push(item);
    }
  }

  const selectedFacts: ScoredFact[] = [];
  const maxFactLines = Math.max(0, maxTotalLines - workspaceLines.length);

  // Primary pass: Take up to strict category caps
  const primaryFailures = failures.slice(0, caps.failure);
  const primaryRules = rules.slice(0, caps.rule);
  const primaryIntents = intents.slice(0, caps.intent);

  selectedFacts.push(...primaryFailures, ...primaryRules, ...primaryIntents);

  // Backfill pass: the caps decide the mix, but they must not leave budget unused while a
  // relevant LOCKED decision is left out (e.g. a rework prompt naming DeadLetterSink while
  // 6 of 10 lines sit empty). Only locked decisions qualify; the 10-line ceiling still holds.
  // Backfill never pushes the context past the initial-turn token budget (TC-RNK-8).
  let selectedTokens = selectedFacts.reduce((sum, item) => sum + estimateTokenCount(item.formattedLine), 0);
  for (const item of rules.slice(caps.rule)) {
    if (selectedFacts.length >= maxFactLines) break;
    if (item.fact.locked !== 1) continue;
    const tokens = estimateTokenCount(item.formattedLine);
    if (selectedTokens + tokens > BACKFILL_TOKEN_BUDGET) break;
    selectedFacts.push(item);
    selectedTokens += tokens;
  }

  // v1(a) tool pass: tool candidates only fill lines left after our own allocation and the
  // locked backfill, inside the same line ceiling and token budget — so a tool can never
  // push a locked decision (or any map fact V1 would have shown) out of the prompt.
  let toolsSelected = false;
  for (const item of tools) {
    if (selectedFacts.length >= maxFactLines) break;
    const tokens = estimateTokenCount(item.formattedLine);
    if (selectedTokens + tokens > BACKFILL_TOKEN_BUDGET) continue;
    selectedFacts.push(item);
    selectedTokens += tokens;
    toolsSelected = true;
  }

  // Sort selected by score (with tool lines present, locked decisions stay on top).
  selectedFacts.sort((a, b) =>
    toolsSelected && a.fact.locked !== b.fact.locked ? b.fact.locked - a.fact.locked : b.score - a.score
  );

  // Enforce strict total line hard cap: never exceed maxTotalLines (10 lines)
  const finalAllocatedFacts = selectedFacts.slice(0, maxFactLines);
  const totalLines = finalAllocatedFacts.length + workspaceLines.length;

  const executionTimeMs = Number((performance.now() - startTime).toFixed(3));

  return {
    allocatedLines: finalAllocatedFacts,
    workspaceLines,
    totalLines,
    taskType,
    deduplicatedCount,
    executionTimeMs,
  };
}

// ============================================================================
// Scoring Formula Calculation
// ============================================================================

function calculateScoreBreakdown(
  fact: ContextMemoryRow,
  promptTokens: Set<string>,
  now: number,
  context?: WorkspaceContext
): ScoreBreakdown {
  // 1. Keyword Match (Jaccard similarity / token intersection)
  const factTokens = tokenize(`${fact.key} ${fact.content} ${fact.verbatim ?? ''}`);
  let intersectionCount = 0;

  for (const token of promptTokens) {
    if (factTokens.has(token)) {
      intersectionCount++;
    }
  }

  const unionSize = new Set([...promptTokens, ...factTokens]).size;
  const keywordMatch = unionSize > 0
    ? Math.min(1.0, (intersectionCount / Math.min(promptTokens.size, 10)) * 0.8 + (intersectionCount / unionSize) * 0.2)
    : 0.0;

  // 2. Confidence (Explicit lock boosted to 0.95+)
  let confidence = fact.confidence;
  if (fact.locked === 1) {
    confidence = Math.max(0.95, confidence);
  }

  // 3. Recency Decay (Exponential half-life around 7 days)
  const ageMs = Math.max(0, now - (fact.updated_at || fact.created_at));
  const recencyDecay = Math.max(0.10, Math.exp(-ageMs / SEVEN_DAYS_MS));

  // 4. File Proximity (1.0 for active file match, 0.5 for recent files)
  let fileProximity = 0.0;
  if (fact.identities && fact.identities.length > 0) {
    const factFiles = fact.identities
      .map((id) => id.file?.toLowerCase())
      .filter((f): f is string => Boolean(f));

    if (context?.activeFilePath) {
      const activeFile = context.activeFilePath.toLowerCase();
      const activeBasename = activeFile.split(/[\/\\]/).pop() ?? '';

      const matchesActive = factFiles.some(
        (f) => f === activeFile || activeFile.endsWith(f) || f.endsWith(activeBasename)
      );

      if (matchesActive) {
        fileProximity = 1.0;
      }
    }

    if (fileProximity < 1.0 && context?.recentModifiedFiles && context.recentModifiedFiles.length > 0) {
      const recentList = context.recentModifiedFiles.map((f) => f.toLowerCase());
      const matchesRecent = factFiles.some((f) =>
        recentList.some((r) => r === f || r.endsWith(f))
      );
      if (matchesRecent) {
        fileProximity = 0.5;
      }
    }
  }

  return {
    keywordMatch: Number(keywordMatch.toFixed(3)),
    confidence: Number(confidence.toFixed(3)),
    recencyDecay: Number(recencyDecay.toFixed(3)),
    fileProximity: Number(fileProximity.toFixed(3)),
  };
}

// ============================================================================
// Formatting Helpers
// ============================================================================

export function formatFactLine(fact: ContextMemoryRow): string {
  const content = fact.content.trim();
  if (fact.kind === 'intent') {
    return `• ${fact.verbatim?.trim() || content}`;
  }
  return `• ${content}`;
}

export function formatFactTag(fact: ContextMemoryRow): string {
  const prefix = fact.kind === 'memos_recall'
    ? 'memos'
    : fact.kind === 'openclaw_recall'
    ? 'openclaw'
    : fact.kind === 'code_context'
    ? 'code'
    : fact.kind === 'failure'
    ? 'failure'
    : fact.kind === 'intent'
    ? 'intent'
    : fact.kind === 'pattern_alert'
    ? 'alert'
    : 'rule';
  return `@${prefix}:${fact.key}`;
}

// Words that say nothing about the topic: grammar, generic task verbs, the lock
// vocabulary ("lock the design", "final decision"), key prefixes, and file
// extensions (so "discount.ts" does not match every fact that names a .ts file).
const RELEVANCE_STOP_WORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'of', 'to', 'for', 'and', 'or', 'is', 'are', 'it', 'be',
  'this', 'that', 'with', 'from', 'by', 'at', 'as', 'we', 'you', 'my', 'our', 'please',
  'can', 'do', 'does', 'how', 'what', 'why', 'now', 'use', 'uses', 'not', 'no', 'all', 'only',
  'also', 'into', 'out', 'new', 'add', 'fix', 'make', 'update', 'change', 'create', 'implement',
  'keep', 'get', 'set', 'run', 'show', 'write', 'need', 'want', 'should', 'must', 'stays',
  'rule', 'intent', 'failure', 'alert', 'lock', 'locked', 'design', 'final', 'decision',
  'requirement', 'settled',
  // Folder names that appear in almost every path; sharing them says nothing about the topic.
  'src', 'lib', 'dist',
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'rs', 'java', 'rb', 'php', 'cs',
  'css', 'scss', 'html', 'json', 'yml', 'yaml', 'md', 'sql', 'sh', 'txt',
]);

function sharesMeaningfulWord(
  promptTokens: Set<string>,
  fact: ContextMemoryRow,
  commonStems: ReadonlySet<string> = new Set(),
  promptCodeNames: ReadonlySet<string> = new Set()
): boolean {
  const stems = factStems(fact);
  for (const token of promptTokens) {
    const s = stem(token);
    // A shared code name always counts, however many facts name it; a plain word common to
    // most of the project's facts does not.
    if (RELEVANCE_STOP_WORDS.has(token) || (commonStems.has(s) && !promptCodeNames.has(token))) continue;
    if (stems.has(s)) return true;
  }
  return false;
}

/** Cheap suffix folding so "retries"/"retry" and "pooling"/"pool" count as the same word. */
function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';
  else if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

/**
 * Words of a text, lowercased. Code names also give their parts (2026-11-03): a prompt naming
 * `handleStripeWebhook` must match "Handle Stripe webhooks idempotently…", which is how an AI
 * summary writes it.
 */
function tokenize(text: string): Set<string> {
  const words = new Set(text.toLowerCase().match(/\b[a-z0-9_]{2,}\b/g) ?? []);
  for (const name of text.match(/\b[a-z]+(?:[A-Z][a-z0-9]*)+\b|\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+\b/g) ?? []) {
    for (const part of name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(' ')) {
      if (part.length >= 2) words.add(part);
    }
  }
  for (const name of text.match(/\b[a-z0-9]+(?:_[a-z0-9]+)+\b/gi) ?? []) {
    for (const part of name.toLowerCase().split('_')) if (part.length >= 2) words.add(part);
  }
  return words;
}

const factStemCache = new WeakMap<ContextMemoryRow, Set<string>>();
/** A fact's word stems (key, text, verbatim), computed once per fact object. */
function factStems(fact: ContextMemoryRow): Set<string> {
  let stems = factStemCache.get(fact);
  if (!stems) {
    stems = new Set([...tokenize(`${fact.key} ${fact.content} ${fact.verbatim ?? ''}`)].map(stem));
    factStemCache.set(fact, stems);
  }
  return stems;
}

/** Code names in a text (camelCase, PascalCase with a hump, snake_case), lowercased. */
function codeNameTokens(text: string): Set<string> {
  const names = text.match(/\b[a-z]+(?:[A-Z][a-z0-9]*)+\b|\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+\b|\b[a-z0-9]+(?:_[a-z0-9]+)+\b/gi) ?? [];
  return new Set(names.filter((n) => /[a-z][A-Z]|_/.test(n)).map((n) => n.toLowerCase()));
}

/** With at least this many facts, a word in more than 30% of them says nothing about the topic. */
const COMMON_WORD_MIN_FACTS = 6;
const COMMON_WORD_SHARE = 0.3;

/**
 * Words (stems) that appear in most of the project's facts — "invoice" in an invoicing project.
 * Sharing only such a word does not make a fact relevant (2026-11-03 natural-work run).
 */
export function projectWideStems(facts: readonly ContextMemoryRow[]): Set<string> {
  const mapFacts = facts.filter((f) => !isToolCandidateKind(f.kind));
  const common = new Set<string>();
  if (mapFacts.length < COMMON_WORD_MIN_FACTS) return common;
  const counts = new Map<string, number>();
  for (const fact of mapFacts) {
    for (const s of factStems(fact)) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  for (const [s, n] of counts) if (n / mapFacts.length > COMMON_WORD_SHARE) common.add(s);
  return common;
}
