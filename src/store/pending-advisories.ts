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
  generatedL1: string[] | null;
  generatedL2: string[] | null;
  generatedL3: string[] | null;
}

export interface UpsertPendingAdvisoryInput {
  projectRoot:  string;
  stage:        Stage;
  flagType:     FlagType;
  pinchLabel:   string;
  sessionId:    string;
  promptCount:  number;
  generatedL1?: string[];
  generatedL2?: string[];
  generatedL3?: string[];
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
       (project_root, stage, flag_type, pinch_label, session_id, prompt_count, status, created_at,
        generated_l1, generated_l2, generated_l3)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    [
      input.projectRoot,
      input.stage,
      input.flagType,
      input.pinchLabel,
      input.sessionId,
      input.promptCount,
      Date.now(),
      input.generatedL1 !== undefined ? JSON.stringify(input.generatedL1) : null,
      input.generatedL2 !== undefined ? JSON.stringify(input.generatedL2) : null,
      input.generatedL3 !== undefined ? JSON.stringify(input.generatedL3) : null,
    ],
  );
  saveStore(store);
}

function parseJsonArray(raw: unknown): string[] | null {
  if (raw === null || raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw as string);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      return parsed as string[];
    }
    return null;
  } catch {
    return null;
  }
}

/** Return the most recent pending advisory for a project, or null if none. */
export function getPendingAdvisory(
  store: Store,
  projectRoot: string,
): PendingAdvisory | null {
  const result = store.db.exec(
    `SELECT id, project_root, stage, flag_type, pinch_label, session_id, prompt_count, status,
            created_at, generated_l1, generated_l2, generated_l3
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
    generatedL1: parseJsonArray(row[9]),
    generatedL2: parseJsonArray(row[10]),
    generatedL3: parseJsonArray(row[11]),
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
