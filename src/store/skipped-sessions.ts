import type { Store } from './db.js';

/**
 * Skipped decision session store (per decision-session-ux-research.md).
 *
 * When a user selects "Skip for now — nexpath optimize will remind me later"
 * (or presses Ctrl+C / Escape), the skipped item is persisted here so that
 * `nexpath optimize` (item 15) can surface it for replay.
 *
 * Columns:
 *   project_root            — which project this belongs to
 *   session_id              — session in which the skip happened
 *   flag_type               — 'stage_transition' | 'absence:<signalKey>'
 *   stage                   — Stage enum value at the time of the skip
 *   level_reached           — which cascade level was showing when user skipped (1, 2, or 3)
 *   skipped_at_prompt_count — promptCount value when the skip happened
 *   skipped_at              — unix ms timestamp
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SkippedSessionRecord {
  id:                    number;
  projectRoot:           string;
  sessionId:             string;
  /** 'stage_transition' | 'absence:<signalKey>' */
  flagType:              string;
  /** Stage enum value, e.g. 'implementation' */
  stage:                 string;
  /** 1, 2, or 3 — which cascade level was active when user skipped */
  levelReached:          number;
  skippedAtPromptCount:  number;
  skippedAt:             number;
}

export interface InsertSkippedSessionInput {
  projectRoot:           string;
  sessionId:             string;
  flagType:              string;
  stage:                 string;
  levelReached:          number;
  skippedAtPromptCount:  number;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * Record a skipped decision session item.
 * Called when the user selects "Skip for now" or presses Ctrl+C / Escape.
 */
export function insertSkippedSession(
  store: Store,
  data:  InsertSkippedSessionInput,
): void {
  store.db.run(
    `INSERT INTO skipped_sessions
       (project_root, session_id, flag_type, stage, level_reached, skipped_at_prompt_count, skipped_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.projectRoot,
      data.sessionId,
      data.flagType,
      data.stage,
      data.levelReached,
      data.skippedAtPromptCount,
      Date.now(),
    ],
  );
}

/**
 * Return all skipped items for a project, ordered oldest first.
 * Used by `nexpath optimize` to build the replay queue.
 */
export function getSkippedSessions(
  store:       Store,
  projectRoot: string,
): SkippedSessionRecord[] {
  const result = store.db.exec(
    `SELECT id, project_root, session_id, flag_type, stage,
            level_reached, skipped_at_prompt_count, skipped_at
     FROM skipped_sessions
     WHERE project_root = ?
     ORDER BY skipped_at ASC`,
    [projectRoot],
  );
  if (!result[0]) return [];
  return result[0].values.map((row) => ({
    id:                   row[0] as number,
    projectRoot:          row[1] as string,
    sessionId:            row[2] as string,
    flagType:             row[3] as string,
    stage:                row[4] as string,
    levelReached:         row[5] as number,
    skippedAtPromptCount: row[6] as number,
    skippedAt:            row[7] as number,
  }));
}

/**
 * Return the number of skipped items for a project.
 * Used by `nexpath status` to show queue depth.
 */
export function getSkippedSessionCount(
  store:       Store,
  projectRoot: string,
): number {
  const result = store.db.exec(
    'SELECT COUNT(*) FROM skipped_sessions WHERE project_root = ?',
    [projectRoot],
  );
  return (result[0]?.values[0]?.[0] as number) ?? 0;
}

/**
 * Remove a skipped item by id.
 * Called by `nexpath optimize` after the user addresses the item.
 */
export function deleteSkippedSession(store: Store, id: number): void {
  store.db.run('DELETE FROM skipped_sessions WHERE id = ?', [id]);
}

/**
 * Remove all skipped items for a project.
 * Used by `nexpath store delete` / `nexpath store prune`.
 */
export function deleteAllSkippedSessions(store: Store, projectRoot: string): void {
  store.db.run('DELETE FROM skipped_sessions WHERE project_root = ?', [projectRoot]);
}
