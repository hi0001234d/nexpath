import type { Store } from './db.js';
import { saveStore } from './db.js';
import type { Stage } from '../classifier/types.js';
import type { FlagType } from '../classifier/Stage2Trigger.js';

export interface PendingAdvisory {
  id:          number;
  projectRoot: string;
  stage:       Stage;
  flagType:    FlagType;
  pinchLabel:  string;
  sessionId:   string;
  promptCount: number;
  status:      'pending' | 'shown';
  createdAt:   number;
}

export interface UpsertPendingAdvisoryInput {
  projectRoot: string;
  stage:       Stage;
  flagType:    FlagType;
  pinchLabel:  string;
  sessionId:   string;
  promptCount: number;
}

/**
 * Replace any existing pending advisory for the project with a fresh one.
 * Only one pending advisory per project_root is kept at a time.
 */
export function upsertPendingAdvisory(
  store: Store,
  input: UpsertPendingAdvisoryInput,
): void {
  store.db.run(
    'DELETE FROM pending_advisories WHERE project_root = ?',
    [input.projectRoot],
  );
  store.db.run(
    `INSERT INTO pending_advisories
       (project_root, stage, flag_type, pinch_label, session_id, prompt_count, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      input.projectRoot,
      input.stage,
      input.flagType,
      input.pinchLabel,
      input.sessionId,
      input.promptCount,
      Date.now(),
    ],
  );
  saveStore(store);
}

/** Return the most recent pending advisory for a project, or null if none. */
export function getPendingAdvisory(
  store: Store,
  projectRoot: string,
): PendingAdvisory | null {
  const result = store.db.exec(
    `SELECT id, project_root, stage, flag_type, pinch_label, session_id, prompt_count, status, created_at
     FROM pending_advisories
     WHERE project_root = ? AND status = 'pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    [projectRoot],
  );
  const row = result[0]?.values[0];
  if (!row) return null;
  return {
    id:          row[0] as number,
    projectRoot: row[1] as string,
    stage:       row[2] as Stage,
    flagType:    row[3] as FlagType,
    pinchLabel:  row[4] as string,
    sessionId:   row[5] as string,
    promptCount: row[6] as number,
    status:      row[7] as 'pending' | 'shown',
    createdAt:   row[8] as number,
  };
}

/** Mark a pending advisory as shown so the Stop hook doesn't re-show it. */
export function markAdvisoryShown(store: Store, id: number): void {
  store.db.run(
    "UPDATE pending_advisories SET status = 'shown' WHERE id = ?",
    [id],
  );
  saveStore(store);
}
