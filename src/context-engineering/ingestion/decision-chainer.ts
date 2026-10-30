/**
 * Feature 1 — Context Engineering: Decision Chainer & Ingestion Coordinator
 *
 * Coordinates fact ingestion into SQLite `context_memory`:
 *  - Enforces checkpoint deduplication (TC-ING-8).
 *  - Automatically detects rule updates and contradictions, chaining older
 *    decisions to newer ones via `superseded_by = newId` (TC-ING-6, TC-M3.3).
 *  - Preserves 100% of audit history without ever deleting records from disk.
 */

import type { Store } from '../../store/db.js';
import {
  upsertContextMemory,
  getActiveContextMemory,
  supersedeDecision,
} from '../store/historical-map-store.js';
import { extractFacts, type FactExtractionInput, type ExtractedFact } from './fact-extractor.js';

export interface IngestionResult {
  insertedCount: number;
  supersededCount: number;
  facts: ExtractedFact[];
}

export function ingestSessionFacts(
  store: Store,
  input: FactExtractionInput
): IngestionResult {
  const { projectRoot } = input;
  const facts = extractFacts(input);

  let insertedCount = 0;
  let supersededCount = 0;

  if (facts.length === 0) {
    return { insertedCount: 0, supersededCount: 0, facts: [] };
  }

  // Fetch current active memory for contradiction/superseding checks
  const activeMemory = getActiveContextMemory(store, projectRoot);

  for (const fact of facts) {
    // 1. Check if an active decision exists with the same key or matching file identity
    const conflictingOlderRow = activeMemory.find((row) => {
      if (row.kind !== fact.kind) return false;
      if (row.key === fact.key && row.content !== fact.content) return true;

      // Check if both reference the same target file and are both rules
      if (fact.kind === 'rule' && row.identities && fact.identities) {
        const rowFiles = row.identities.map((i) => i.file).filter(Boolean);
        const factFiles = fact.identities.map((i) => i.file).filter(Boolean);
        const hasCommonFile = rowFiles.some((rf) => factFiles.includes(rf));
        if (hasCommonFile && row.content !== fact.content) {
          return true;
        }
      }

      return false;
    });

    if (conflictingOlderRow) {
      // 2. Chaining: Insert the new decision first
      const newId = upsertContextMemory(store, {
        projectRoot,
        kind: fact.kind,
        key: fact.key,
        content: fact.content,
        verbatim: fact.verbatim,
        identities: fact.identities,
        locked: fact.locked,
        confidence: fact.confidence,
      });

      // 3. Mark the older decision as superseded (never delete)
      supersedeDecision(store, projectRoot, conflictingOlderRow.id, newId);
      supersededCount++;
      insertedCount++;
    } else {
      // 4. Standard insert or identical checkpoint deduplication
      upsertContextMemory(store, {
        projectRoot,
        kind: fact.kind,
        key: fact.key,
        content: fact.content,
        verbatim: fact.verbatim,
        identities: fact.identities,
        locked: fact.locked,
        confidence: fact.confidence,
      });
      insertedCount++;
    }
  }

  return { insertedCount, supersededCount, facts };
}
