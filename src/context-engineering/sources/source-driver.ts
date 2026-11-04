/**
 * Feature 1 — v1(a) Source Drivers (architecture.md Module 4: one interface, three drivers).
 *
 * MemOS, OpenClaw and codebase-memory-mcp each sit behind this interface. A driver only
 * returns *candidates*; our historical map stays the authority (v1(a) D2) and V1 retrieval
 * is the fallback whenever a driver fails (D7).
 *
 * Every driver call is bounded by one shared deadline. A driver that is unavailable,
 * throws, times out or is cancelled is reported in `failed` — it never throws out of
 * `runSourceDrivers`, so a broken tool can never break the prompt.
 */

import type { ContextIdentity, WorkspaceContext } from '../types/context-engineering.js';

/** `meaning`: MemOS's local embedding model, matching the prompt to our own map's facts by meaning. */
export type SourceName = 'memos' | 'openclaw' | 'codebase' | 'meaning';

/** Tools that hold memory of past turns; when one of them fails, V1 memory search fills in. */
export const MEMORY_SOURCES: ReadonlySet<SourceName> = new Set<SourceName>(['memos', 'openclaw']);

export interface SourceQuery {
  prompt: string;
  /** Canonical project id (normalizeProjectId). */
  projectRoot: string;
  sessionId?: string;
  context?: WorkspaceContext;
  /** The gap detector's verdict for this prompt (architecture.md [6]: is an OpenClaw lookup worth it?). */
  hasGaps?: boolean;
  /** Our map's active facts (id + text), for the meaning source. */
  mapFacts?: readonly { id: number; content: string }[];
}

export interface SourceCandidate {
  source: SourceName;
  /** Stable id inside the tool (trace id, file path + line, qualified symbol name). */
  ref: string;
  /** The text to show; one fact, kept short by the driver. */
  text: string;
  /** The tool's own relevance, 0..1. */
  score: number;
  identities?: ContextIdentity[];
  /** Epoch ms the remembered thing happened, when the tool knows it. */
  observedAt?: number;
  /** Set by the meaning source: this candidate IS our map's fact with this id (never a new row). */
  mapRowId?: number;
}

export interface SourceDriver {
  readonly name: SourceName;
  /** Cheap check (installed, configured, worker reachable). */
  available(): Promise<boolean>;
  /** Must honour `signal`; should stop by `deadlineAt` (epoch ms). */
  search(query: SourceQuery, deadlineAt: number, signal: AbortSignal): Promise<SourceCandidate[]>;
}

export type SourceFailure = 'unavailable' | 'error' | 'timeout' | 'cancelled';

export interface SourceRunResult {
  candidates: SourceCandidate[];
  succeeded: SourceName[];
  failed: { source: SourceName; reason: SourceFailure; message?: string }[];
}

const MAX_CANDIDATES_PER_SOURCE = 10;

/**
 * Ask every driver in parallel, all bounded by `budgetMs`. Never throws.
 * Candidates with an empty text or a score outside 0..1 are dropped (score clamped).
 */
export async function runSourceDrivers(
  drivers: readonly SourceDriver[],
  query: SourceQuery,
  budgetMs: number,
  parentSignal?: AbortSignal
): Promise<SourceRunResult> {
  const result: SourceRunResult = { candidates: [], succeeded: [], failed: [] };
  if (drivers.length === 0) return result;

  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener('abort', onParentAbort, { once: true });

  const deadlineAt = Date.now() + Math.max(0, budgetMs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve('timeout');
    }, Math.max(0, budgetMs));
  });

  try {
    await Promise.all(
      drivers.map(async (driver) => {
        const run = (async (): Promise<SourceCandidate[] | SourceFailure> => {
          if (controller.signal.aborted) return 'cancelled';
          if (!(await driver.available())) return 'unavailable';
          return driver.search(query, deadlineAt, controller.signal);
        })();

        try {
          const outcome = await Promise.race([run, deadline]);
          if (outcome === 'timeout') {
            result.failed.push({ source: driver.name, reason: parentSignal?.aborted ? 'cancelled' : 'timeout' });
            run.catch(() => {}); // a late rejection must not surface as unhandled
            return;
          }
          if (!Array.isArray(outcome)) {
            result.failed.push({ source: driver.name, reason: outcome });
            return;
          }
          result.succeeded.push(driver.name);
          for (const c of outcome.slice(0, MAX_CANDIDATES_PER_SOURCE)) {
            const text = typeof c.text === 'string' ? c.text.trim() : '';
            if (!text) continue;
            const score = Number.isFinite(c.score) ? Math.min(1, Math.max(0, c.score)) : 0;
            result.candidates.push({ ...c, source: driver.name, text, score });
          }
        } catch (err) {
          result.failed.push({
            source: driver.name,
            reason: parentSignal?.aborted ? 'cancelled' : 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      })
    );
  } finally {
    if (timer) clearTimeout(timer);
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
  return result;
}
