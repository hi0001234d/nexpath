/**
 * Pending Prompt Enhancement — browser mirror of the CLI's
 * `store/pending-prompt-enhancements.ts` semantics over `storage.local`
 * (same pattern as the pending-advisory record the service worker already
 * keeps):
 *
 *  - ONE row per project root (`nexpath_pending_pe::<root>`), replaced on
 *    every upsert;
 *  - the submit pipeline prepares + parks it WITHOUT showing anything
 *    (owner decision B-i); the response-stop handler reads it, shows the PE
 *    panel, and consumes it;
 *  - reads are session-scoped and typed FAIL-CLOSED: a corrupt / wrong-shape
 *    row reads as absent (so the panel can never render an unvalidated
 *    payload), exactly like the CLI store's `parseTyped` guard;
 *  - `markShown` flips status so a stop re-fire cannot re-show, while a row
 *    that never rendered stays `pending` for the next stop (the CLI's
 *    `not_shown` semantics).
 */

import browser from 'webextension-polyfill';
import type {
  PromptEnhancementPrepareRequestV1,
  PromptEnhancementPrepareResultV1,
} from '../../prompt-enhancement/contracts.js';
import {
  validatePromptEnhancementPrepareRequestV1,
  validatePromptEnhancementPrepareResultV1,
} from '../background/pe-engine.js';

export interface PendingPeRecord {
  sessionId:   string;
  promptCount: number;
  status:      'pending' | 'shown';
  createdAt:   number;
  request:     PromptEnhancementPrepareRequestV1;
  result:      PromptEnhancementPrepareResultV1;
}

export const PENDING_PE_KEY_PREFIX = 'nexpath_pending_pe::';

export function pendingPeKey(projectRoot: string): string {
  return `${PENDING_PE_KEY_PREFIX}${projectRoot}`;
}

/** Replace any existing pending PE for the project with a fresh one. */
export async function upsertPendingPe(
  projectRoot: string,
  input: { sessionId: string; promptCount: number; request: PromptEnhancementPrepareRequestV1; result: PromptEnhancementPrepareResultV1; now?: number },
): Promise<void> {
  const record: PendingPeRecord = {
    sessionId:   input.sessionId,
    promptCount: input.promptCount,
    status:      'pending',
    createdAt:   input.now ?? Date.now(),
    request:     input.request,
    result:      input.result,
  };
  await browser.storage.local.set({ [pendingPeKey(projectRoot)]: record });
}

function parseRecord(raw: unknown): PendingPeRecord | null {
  if (raw === null || typeof raw !== 'object') return null;
  const rec = raw as Partial<PendingPeRecord>;
  if (typeof rec.sessionId !== 'string') return null;
  if (typeof rec.promptCount !== 'number') return null;
  if (rec.status !== 'pending' && rec.status !== 'shown') return null;
  if (typeof rec.createdAt !== 'number') return null;
  // Typed fail-closed validation — the same posture as the CLI store: a payload
  // that no longer passes the engine validators reads as ABSENT, never as a
  // renderable record.
  if (!validatePromptEnhancementPrepareRequestV1(rec.request).ok) return null;
  if (!validatePromptEnhancementPrepareResultV1(rec.result).ok) return null;
  return rec as PendingPeRecord;
}

/**
 * Return the project's pending PE, or null when absent / consumed / corrupt /
 * from another session. `sessionId` scoping mirrors the CLI (stop.ts passes the
 * live session id so a record queued in one session never surfaces in another).
 */
export async function getPendingPe(
  projectRoot: string,
  sessionId?: string,
): Promise<PendingPeRecord | null> {
  const key = pendingPeKey(projectRoot);
  let raw: unknown;
  try {
    const got = await browser.storage.local.get(key);
    raw = (got as Record<string, unknown>)[key];
  } catch {
    return null; // storage failure reads as absent — fail-open for the pipeline
  }
  const record = parseRecord(raw);
  if (!record) return null;
  if (record.status !== 'pending') return null;
  if (sessionId !== undefined && record.sessionId !== sessionId) return null;
  return record;
}

/** Consume the record (displayed or injected) so a stop re-fire cannot re-show it. */
export async function markPendingPeShown(projectRoot: string): Promise<void> {
  const key = pendingPeKey(projectRoot);
  try {
    const got = await browser.storage.local.get(key);
    const raw = (got as Record<string, unknown>)[key];
    if (raw === null || typeof raw !== 'object') return;
    await browser.storage.local.set({ [key]: { ...(raw as object), status: 'shown' } });
  } catch {
    /* consuming is best-effort; a failure only risks one duplicate show attempt */
  }
}
