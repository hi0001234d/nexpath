/**
 * CRUD for the `user_depth_level` table — the per-project workflow-maturity
 * graduation STATE. The table itself is created in schema.ts; this module owns
 * its reads/writes. The row is a RUNNING AGGREGATE so the maturity level
 * survives the prompts 500-FIFO and param-event pruning. The maturity
 * computation + graduation logic live in classifier/maturity-level.ts.
 */

import { saveStore, type Store } from './db.js';
import { SCHEMA_VERSION } from './schema.js';

export interface UserDepthRow {
  projectRoot: string;
  /** Current maturity band 1–5. */
  currentLevel: number;
  /** Consecutive above-level detections accumulated toward a +1 graduation. */
  stabilityCounter: number;
  /** Epoch ms of the last +1 graduation, or null if never graduated. */
  lastGraduationAt: number | null;
  /** Consecutive below-level detections accumulated toward a −1 down-graduation. */
  hysteresisCounter: number;
  schemaVersion: number;
  updatedAt: number;
}

function mapRow(row: (string | number | null | Uint8Array)[]): UserDepthRow {
  return {
    projectRoot:       row[0] as string,
    currentLevel:      row[1] as number,
    stabilityCounter:  row[2] as number,
    lastGraduationAt:  row[3] as number | null,
    hysteresisCounter: row[4] as number,
    schemaVersion:     row[5] as number,
    updatedAt:         row[6] as number,
  };
}

const SELECT_COLS =
  'project_root, current_level, stability_counter, last_graduation_at, hysteresis_counter, schema_version, updated_at';

/** Read the maturity row for a project, or null if none exists yet. */
export function getUserDepthLevel(store: Store, projectRoot: string): UserDepthRow | null {
  const res = store.db.exec(
    `SELECT ${SELECT_COLS} FROM user_depth_level WHERE project_root = ?`,
    [projectRoot],
  );
  const row = res[0]?.values[0];
  return row ? mapRow(row) : null;
}

/** All maturity rows (used for the cross-project median seed). */
export function listUserDepthLevels(store: Store): UserDepthRow[] {
  const res = store.db.exec(`SELECT ${SELECT_COLS} FROM user_depth_level ORDER BY project_root ASC`);
  return (res[0]?.values ?? []).map(mapRow);
}

/** Insert or update the maturity row for a project. schema_version is stamped here. */
export function upsertUserDepthLevel(
  store: Store,
  row: Omit<UserDepthRow, 'schemaVersion'> & { schemaVersion?: number },
): void {
  store.db.run(
    `INSERT INTO user_depth_level
       (project_root, current_level, stability_counter, last_graduation_at,
        hysteresis_counter, schema_version, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_root) DO UPDATE SET
       current_level      = excluded.current_level,
       stability_counter  = excluded.stability_counter,
       last_graduation_at = excluded.last_graduation_at,
       hysteresis_counter = excluded.hysteresis_counter,
       schema_version     = excluded.schema_version,
       updated_at         = excluded.updated_at`,
    [
      row.projectRoot,
      row.currentLevel,
      row.stabilityCounter,
      row.lastGraduationAt,
      row.hysteresisCounter,
      row.schemaVersion ?? SCHEMA_VERSION,
      row.updatedAt,
    ],
  );
  saveStore(store);
}
