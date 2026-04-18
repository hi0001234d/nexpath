import { saveStore, type Store } from './db.js';
import { redactSecrets } from './redact.js';
import { getConfig } from './config.js';

const DEFAULT_MAX_PER_PROJECT = 500;

export type InsertParams = {
  projectRoot: string;
  promptText: string;
  agent?: string;
};

export type PromptStats = {
  totalPrompts: number;
  dbSizeBytes: number;
  perProject: Array<{
    projectRoot: string;
    count: number;
    oldest: number; // Unix ms
    newest: number; // Unix ms
  }>;
};

/** Insert a prompt, applying secret redaction and enforcing the per-project FIFO cap. */
export function insertPrompt(store: Store, params: InsertParams): void {
  const { projectRoot, promptText, agent } = params;
  const text = redactSecrets(promptText);

  store.db.run(
    'INSERT INTO prompts (project_root, prompt_text, agent, captured_at) VALUES (?, ?, ?, ?)',
    [projectRoot, text, agent ?? null, Date.now()]
  );

  // Enforce per-project cap (default 500, user-configurable)
  const maxRaw = getConfig(store.db, 'prompt_store_max_per_project');
  const max = maxRaw !== undefined ? parseInt(maxRaw, 10) : DEFAULT_MAX_PER_PROJECT;

  if (max > 0) {
    store.db.run(
      `DELETE FROM prompts
       WHERE project_root = ?
         AND id NOT IN (
           SELECT id FROM prompts
           WHERE project_root = ?
           ORDER BY id DESC
           LIMIT ?
         )`,
      [projectRoot, projectRoot, max]
    );
  }

  saveStore(store);
}

/** Delete all prompts for a specific project. */
export function deleteProjectPrompts(store: Store, projectRoot: string): void {
  store.db.run('DELETE FROM prompts WHERE project_root = ?', [projectRoot]);
  saveStore(store);
}

/** Delete all prompts across every project and VACUUM the DB. */
export function deleteAllPrompts(store: Store): void {
  store.db.run('DELETE FROM prompts');
  store.db.run('VACUUM');
  saveStore(store);
}

/**
 * Remove prompts older than `olderThanMs` milliseconds.
 * Optionally scoped to a single project.
 * Returns the number of rows deleted.
 */
export function pruneOlderThan(store: Store, olderThanMs: number, projectRoot?: string): number {
  const cutoff = Date.now() - olderThanMs;

  if (projectRoot) {
    store.db.run(
      'DELETE FROM prompts WHERE project_root = ? AND captured_at < ?',
      [projectRoot, cutoff]
    );
  } else {
    store.db.run('DELETE FROM prompts WHERE captured_at < ?', [cutoff]);
  }

  const deleted = store.db.getRowsModified();
  saveStore(store);
  return deleted;
}

/** Aggregate statistics for the status command. */
export function getPromptStats(store: Store): PromptStats {
  const totalRes = store.db.exec('SELECT COUNT(*) FROM prompts');
  const totalPrompts = (totalRes[0]?.values[0]?.[0] as number) ?? 0;

  const perProjectRes = store.db.exec(
    `SELECT project_root, COUNT(*), MIN(captured_at), MAX(captured_at)
     FROM prompts
     GROUP BY project_root
     ORDER BY project_root`
  );

  const perProject = (perProjectRes[0]?.values ?? []).map((row) => ({
    projectRoot: row[0] as string,
    count: row[1] as number,
    oldest: row[2] as number,
    newest: row[3] as number,
  }));

  const dbSizeBytes = store.db.export().byteLength;

  return { totalPrompts, dbSizeBytes, perProject };
}
