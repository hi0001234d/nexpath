/**
 * Feature 1 — v1(a): MemOS's turn summaries → our map (D12, 2026-11-03).
 *
 * Our own extractor only knows fixed phrasing ("Final decision: …"); in the natural-work run it
 * saved 1 fact from 10 turns full of decisions. MemOS already asks the AI for a one-line summary
 * of every turn ("Rate limiting will use Redis with 100 requests/minute per API key."), so that
 * summary is saved into our map with V1's own rules (replaced decisions chained, duplicates
 * skipped). No extra AI call: MemOS makes this one anyway.
 */

import type { Store } from '../../store/db.js';
import { ingestExtractedFacts } from '../ingestion/decision-chainer.js';
import { factFromTurnSummary } from '../ingestion/fact-extractor.js';
import { getActiveContextMemory } from '../store/historical-map-store.js';
import { factOverlap } from './candidate-filter.js';
import type { MemosCapturedTurn } from './memos-driver.js';

/** MemOS writes the summary in the background after the turn; read it this much later. */
export const TURN_SUMMARY_DELAY_MS = 20_000;
/** A summary saying the same as a fact our map already has is not saved again. */
const SAME_FACT = 0.8;

/** Saves one turn summary into our map. Returns true when a new fact was written. */
export function saveTurnSummary(store: Store, turn: MemosCapturedTurn, summary: string): boolean {
  const fact = factFromTurnSummary(turn.projectRoot, summary, `trace:${turn.traceId}`);
  if (!fact) return false;
  if (getActiveContextMemory(store, turn.projectRoot).some((row) => factOverlap(row.content, fact.content) >= SAME_FACT)) return false;
  return ingestExtractedFacts(store, turn.projectRoot, [fact]).insertedCount > 0;
}
