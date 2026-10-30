/**
 * Feature 1 — Context Engineering: Decision Chainer & Ingestion Coordinator
 *
 * Coordinates fact ingestion into SQLite `context_memory`:
 *  - Enforces checkpoint deduplication (TC-ING-8).
 *  - Automatically detects rule updates and contradictions, chaining older
 *    decisions to newer ones via `superseded_by = newId` (TC-ING-6, TC-M3.3).
 *  - Preserves 100% of audit history without ever deleting records from disk.
 */

import { createHash } from 'node:crypto';
import type { Store } from '../../store/db.js';
import type { ContextIdentity, ContextMemoryRow } from '../types/context-engineering.js';
import {
  upsertContextMemory,
  getActiveContextMemory,
  supersedeDecision,
} from '../store/historical-map-store.js';
import { extractFacts, type FactExtractionInput, type ExtractedFact } from './fact-extractor.js';
import { normalizeProjectId } from '../core/project-scope.js';

export interface IngestionResult {
  insertedCount: number;
  supersededCount: number;
  facts: ExtractedFact[];
}

export function ingestSessionFacts(
  store: Store,
  input: FactExtractionInput
): IngestionResult {
  // Store facts under the same canonical path that retrieval looks up
  // (preparePromptEnhancement / onTurnComplete normalise too), so a trailing
  // slash, relative path or symlink from the caller cannot hide the memory.
  const projectRoot = normalizeProjectId(input.projectRoot);
  const facts = extractFacts({ ...input, projectRoot });

  let insertedCount = 0;
  let supersededCount = 0;

  if (facts.length === 0) {
    return { insertedCount: 0, supersededCount: 0, facts: [] };
  }

  // Fetch current active memory for contradiction/superseding checks
  const activeMemory = getActiveContextMemory(store, projectRoot);

  for (const fact of facts) {
    // 1. Find active rows this fact replaces: same key, same symbol, or same
    //    file with similar wording. Sharing only a file is not enough, and an
    //    unlocked fact never replaces a locked one.
    const conflictingOlderRows = activeMemory.filter((row) => {
      if (row.kind !== fact.kind) return false;
      if (row.content === fact.content) return false;
      if (row.locked === 1 && !fact.locked) return false;
      return isSameTopic(row, fact);
    });

    // 2. Keys come from the first words of the text, so a changed decision often
    //    keeps the old key. Upserting on that key would overwrite the old row in
    //    place (and then supersede it with itself), so give the new text its own key.
    const key = keyTakenByOtherContent(store, projectRoot, fact)
      ? `${fact.key}-${shortHash(fact.content)}`
      : fact.key;

    // 3. Insert the new decision first (identical text dedupes onto its own row)
    const newId = upsertContextMemory(store, {
      projectRoot,
      kind: fact.kind,
      key,
      content: fact.content,
      verbatim: fact.verbatim,
      identities: fact.identities,
      locked: fact.locked,
      confidence: fact.confidence,
    });
    insertedCount++;

    // 4. Mark the older decisions as superseded (never delete)
    for (const row of conflictingOlderRows) {
      if (row.id === newId) continue;
      supersedeDecision(store, projectRoot, row.id, newId);
      supersededCount++;
    }
  }

  return { insertedCount, supersededCount, facts };
}

const SAME_FILE_SIMILARITY = 0.5;
const SAME_SUBJECT_SIMILARITY = 0.2;
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'now', 'uses', 'use', 'final', 'decision',
  'locked', 'requirement', 'lock', 'design', 'stays', 'must', 'should',
]);

function isSameTopic(row: ContextMemoryRow, fact: ExtractedFact): boolean {
  if (row.key === fact.key) return true;
  if (fact.kind !== 'rule') return false;

  const rowIds = row.identities ?? [];
  const factIds = fact.identities ?? [];

  // Same subject: both rules are mainly about the same function (the first one
  // named) and share some wording. Merely mentioning a function is not enough:
  // "applyIdempotencyKey stays inside processRetry" is not about processRetry's
  // entry-point rule.
  const rowSubject = primarySymbol(row.content, rowIds);
  if (
    rowSubject &&
    rowSubject === primarySymbol(fact.content, factIds) &&
    wordSimilarity(row.content, fact.content) >= SAME_SUBJECT_SIMILARITY
  ) {
    return true;
  }

  const rowFiles = rowIds.map((i) => i.file).filter(Boolean);
  const hasCommonFile = factIds.some((i) => i.file && rowFiles.includes(i.file));
  return hasCommonFile && wordSimilarity(row.content, fact.content) >= SAME_FILE_SIMILARITY;
}

/** The symbol that appears earliest in the text, i.e. what the rule is about. */
function primarySymbol(content: string, identities: ContextIdentity[]): string | undefined {
  let best: { symbol: string; at: number } | undefined;
  for (const { symbol } of identities) {
    if (!symbol) continue;
    const at = content.indexOf(symbol);
    if (at >= 0 && (!best || at < best.at)) best = { symbol, at };
  }
  return best?.symbol;
}

/** Jaccard similarity over meaningful words (lowercased, 3+ chars, no stop words). */
function wordSimilarity(a: string, b: string): number {
  const words = (t: string) =>
    new Set(
      t
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    );
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / new Set([...wa, ...wb]).size;
}

/** True when any row (active or historical) already holds this key with different text. */
function keyTakenByOtherContent(store: Store, projectRoot: string, fact: ExtractedFact): boolean {
  const res = store.db.exec(
    'SELECT content FROM context_memory WHERE project_root = ? AND kind = ? AND key = ?',
    [projectRoot, fact.kind, fact.key]
  );
  const existing = res[0]?.values[0]?.[0];
  return existing !== undefined && existing !== fact.content;
}

function shortHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 8);
}
