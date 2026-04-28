import { saveStore, type Store } from './db.js';

export type ProjectRecord = {
  id:                   number;
  projectRoot:          string;
  name:                 string;
  projectType:          string | null;
  language:             string | null;
  description:          string | null;
  detectedLanguage:     string | null;
  decisionSessionCount: number;
  createdAt:            number;
};

export type UpsertProjectParams = {
  projectRoot: string;
  name: string;
  projectType?: string;
  language?: string;
  description?: string;
};

/**
 * Insert a new project record or update the existing one for this project_root.
 * All fields except project_root and name are optional.
 */
export function upsertProject(store: Store, params: UpsertProjectParams): void {
  store.db.run(
    `INSERT INTO projects (project_root, name, project_type, language, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_root) DO UPDATE SET
       name         = excluded.name,
       project_type = excluded.project_type,
       language     = excluded.language,
       description  = excluded.description`,
    [
      params.projectRoot,
      params.name,
      params.projectType ?? null,
      params.language    ?? null,
      params.description ?? null,
      Date.now(),
    ],
  );
  saveStore(store);
}

/** Returns the project record for this root, or null if not found. */
export function getProject(store: Store, projectRoot: string): ProjectRecord | null {
  const res = store.db.exec(
    'SELECT id, project_root, name, project_type, language, description, detected_language, decision_session_count, created_at FROM projects WHERE project_root = ?',
    [projectRoot],
  );
  const row = res[0]?.values[0];
  if (!row) return null;
  return {
    id:                   row[0] as number,
    projectRoot:          row[1] as string,
    name:                 row[2] as string,
    projectType:          row[3] as string | null,
    language:             row[4] as string | null,
    description:          row[5] as string | null,
    detectedLanguage:     row[6] as string | null,
    decisionSessionCount: row[7] as number,
    createdAt:            row[8] as number,
  };
}

/** Returns all project records ordered by creation time (oldest first). */
export function listProjects(store: Store): ProjectRecord[] {
  const res = store.db.exec(
    'SELECT id, project_root, name, project_type, language, description, detected_language, decision_session_count, created_at FROM projects ORDER BY created_at ASC',
  );
  return (res[0]?.values ?? []).map((row) => ({
    id:                   row[0] as number,
    projectRoot:          row[1] as string,
    name:                 row[2] as string,
    projectType:          row[3] as string | null,
    language:             row[4] as string | null,
    description:          row[5] as string | null,
    detectedLanguage:     row[6] as string | null,
    decisionSessionCount: row[7] as number,
    createdAt:            row[8] as number,
  }));
}

/** Increment decision_session_count by 1 for an existing project. No-op if project not yet registered. */
export function incrementDecisionSessionCount(store: Store, projectRoot: string): void {
  store.db.run(
    'UPDATE projects SET decision_session_count = decision_session_count + 1 WHERE project_root = ?',
    [projectRoot],
  );
  saveStore(store);
}

/** Update detected_language for an existing project. No-op if project not yet registered. */
export function setDetectedLanguage(
  store: Store,
  projectRoot: string,
  lang: string | undefined,
): void {
  store.db.run(
    'UPDATE projects SET detected_language = ? WHERE project_root = ?',
    [lang ?? null, projectRoot],
  );
  saveStore(store);
}
