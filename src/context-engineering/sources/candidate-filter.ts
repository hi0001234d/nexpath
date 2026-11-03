/**
 * Feature 1 — v1(a) candidate selection: tools first, V1 as fallback, our map decides.
 *
 * D2  Our historical map is the authority. A tool result that matches a decision the map
 *     marked as replaced is dropped; locked decisions are always included.
 * D7  Our map always comes first (architecture.md Path B: tools *plus* the map, merged): every
 *     map row goes to the ranker exactly as in V1, and tool results only add lines. A tool that
 *     fails, is not running or finds nothing leaves exactly the V1 result. A tool result that
 *     repeats a map row is not added twice (the map row is kept).
 *
 * Tool results become per-prompt rows with negative ids and their own kinds; they are never
 * written to the map here (write-back is the worker's job, D12).
 */

import { createHash } from 'node:crypto';
import type { Store } from '../../store/db.js';
import type { ContextMemoryKind, ContextMemoryRow } from '../types/context-engineering.js';
import { getContextMemoryHistory } from '../store/historical-map-store.js';
import { wordSimilarity } from '../ingestion/decision-chainer.js';
import { extractIdentities } from '../ingestion/fact-extractor.js';
import { type SourceCandidate, type SourceName, type SourceRunResult } from './source-driver.js';

const KIND_BY_SOURCE: Record<SourceName, ContextMemoryKind> = {
  memos: 'memos_recall',
  openclaw: 'openclaw_recall',
  codebase: 'code_context',
  meaning: 'memos_recall', // never used: meaning results are our own map rows (mapRowId)
};

const TOOL_KINDS: ReadonlySet<ContextMemoryKind> = new Set(Object.values(KIND_BY_SOURCE));

export function isToolCandidateKind(kind: ContextMemoryKind): boolean {
  return TOOL_KINDS.has(kind);
}

/** Same threshold the decision chainer uses for "same file, similar wording". */
const REPLACED_SIMILARITY = 0.5;
/** Two texts this similar say the same thing; keep the first (map rows come first). */
const DUPLICATE_SIMILARITY = 0.8;

export interface CandidateSelection {
  rows: ContextMemoryRow[];
  /** Map rows the meaning source found relevant to this prompt (cosine above its bar). */
  meaningMatchedIds: Set<number>;
  droppedReplaced: number;
  droppedDuplicates: number;
}

/** Decisions our map has marked replaced or inactive. */
export function getReplacedContextMemory(store: Store, projectRoot: string): ContextMemoryRow[] {
  return getContextMemoryHistory(store, projectRoot).filter(
    (row) => row.active === 0 || row.superseded_by !== null
  );
}

export function selectCandidates(
  mapRows: readonly ContextMemoryRow[],
  run: SourceRunResult | undefined,
  replacedRows: readonly ContextMemoryRow[],
  now: number = Date.now()
): CandidateSelection {
  let droppedReplaced = 0;
  let droppedDuplicates = 0;
  const kept: ContextMemoryRow[] = [];
  const mapIds = new Set(mapRows.map((r) => r.id));
  const meaningMatchedIds = new Set<number>();
  for (const c of run?.candidates ?? []) if (c.mapRowId !== undefined && mapIds.has(c.mapRowId)) meaningMatchedIds.add(c.mapRowId);
  const keptTexts: string[] = [];

  const ordered = [...(run?.candidates ?? [])].filter((c) => c.mapRowId === undefined).sort((a, b) => b.score - a.score);
  ordered.forEach((candidate, index) => {
    if (matchesReplacedDecision(candidate.text, mapRows, replacedRows)) {
      droppedReplaced++;
      return;
    }
    if (mapRows.some((row) => factOverlap(row.content, candidate.text) >= DUPLICATE_SIMILARITY) || keptTexts.some((text) => wordSimilarity(text, candidate.text) >= DUPLICATE_SIMILARITY)) {
      droppedDuplicates++;
      return;
    }
    keptTexts.push(candidate.text);
    kept.push(toCandidateRow(candidate, index, now));
  });

  return { rows: [...mapRows, ...kept], meaningMatchedIds, droppedReplaced, droppedDuplicates };
}

/**
 * A tool brought back wording that our map has replaced: it is closer to a replaced
 * decision than to any current one.
 */
function matchesReplacedDecision(
  text: string,
  activeRows: readonly ContextMemoryRow[],
  replacedRows: readonly ContextMemoryRow[]
): boolean {
  let bestReplaced = 0;
  for (const row of replacedRows) bestReplaced = Math.max(bestReplaced, factOverlap(row.content, text));
  if (bestReplaced < REPLACED_SIMILARITY) return false;
  let bestActive = 0;
  for (const row of activeRows) bestActive = Math.max(bestActive, factOverlap(row.content, text));
  return bestReplaced > bestActive;
}

/**
 * How much a tool text says the same as a map fact: word overlap, or — since tools return the raw
 * turn ("Final decision: … Reply only with: Noted.") while our map keeps the cleaned fact — how
 * much of the shorter text is inside the longer one (only for texts of 4+ words).
 */
export function factOverlap(a: string, b: string): number {
  const words = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const wa = words(a);
  const wb = words(b);
  const smaller = wa.size <= wb.size ? wa : wb;
  const larger = smaller === wa ? wb : wa;
  let inside = 0;
  for (const w of smaller) if (larger.has(w)) inside++;
  const contained = smaller.size >= 4 ? inside / smaller.size : 0;
  return Math.max(wordSimilarity(a, b), contained);
}

function toCandidateRow(candidate: SourceCandidate, index: number, now: number): ContextMemoryRow {
  const at = candidate.observedAt && candidate.observedAt > 0 ? candidate.observedAt : now;
  return {
    id: -(index + 1),
    project_root: '',
    kind: KIND_BY_SOURCE[candidate.source],
    key: `${candidate.source}-${createHash('sha256').update(candidate.ref).digest('hex').slice(0, 10)}`,
    content: candidate.text,
    verbatim: null,
    identities: candidate.identities?.length ? candidate.identities : extractIdentities(candidate.text),
    locked: 0,
    confidence: candidate.score,
    staleness: null,
    superseded_by: null,
    active: 1,
    evidence: JSON.stringify({ source: candidate.source, ref: candidate.ref }),
    created_at: at,
    updated_at: at,
  };
}
