/**
 * Pending-sequence bookkeeping (PB6) — the browser mirror of the CLI's
 * `pending_prompt_sequences` row, recorded when the user SENDS the MPS first
 * popup. IDS AND COUNTS ONLY: requestId / handoff decision / body identity /
 * remaining count — never prompt or body text. v1 is bookkeeping + telemetry
 * for the deferred continuation phase; nothing reads it to drive behaviour,
 * and no local queue/pointer/auto-advance authority exists (the engine's MPS
 * gates own all of that).
 *
 * storage.local, one row per project root, replace-on-write (latest sequence
 * wins — the CLI upserts the same way).
 */
import browser from 'webextension-polyfill';

export interface PendingSequenceRow {
  sessionId: string;
  createdAt: number;
  status: 'first_sent';
  requestId: string;
  handoffDecisionId: string;
  currentBodyId: string;
  bodyRevision: number;
  remainingTaskCount: number;
}

function pendingSequenceKey(projectRoot: string): string {
  return `nexpath_pending_sequence::${projectRoot}`;
}

export async function recordPendingSequence(projectRoot: string, row: PendingSequenceRow): Promise<void> {
  await browser.storage.local.set({ [pendingSequenceKey(projectRoot)]: row });
}

export async function getPendingSequence(projectRoot: string): Promise<PendingSequenceRow | null> {
  try {
    const key = pendingSequenceKey(projectRoot);
    const got = await browser.storage.local.get(key);
    const raw = (got as Record<string, unknown>)[key];
    if (raw === null || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (r['status'] !== 'first_sent'
      || typeof r['sessionId'] !== 'string'
      || typeof r['requestId'] !== 'string'
      || typeof r['handoffDecisionId'] !== 'string'
      || typeof r['currentBodyId'] !== 'string'
      || typeof r['bodyRevision'] !== 'number'
      || typeof r['remainingTaskCount'] !== 'number'
      || typeof r['createdAt'] !== 'number') return null;
    return raw as unknown as PendingSequenceRow;
  } catch {
    return null;
  }
}
