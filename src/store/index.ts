export { openStore, closeStore, saveStore, DEFAULT_DB_PATH, getSql, type Store } from './db.js';
export {
  insertPrompt,
  deleteProjectPrompts,
  deleteAllPrompts,
  pruneOlderThan,
  getPromptStats,
  type InsertParams,
  type PromptStats,
} from './prompts.js';
export { getConfig, setConfig, getAllConfig, isConfigSet, DEFAULT_CONFIG } from './config.js';
export { redactSecrets } from './redact.js';
export { upsertProject, getProject, listProjects, type ProjectRecord, type UpsertProjectParams } from './projects.js';
export {
  insertSkippedSession,
  getSkippedSessions,
  getSkippedSessionCount,
  deleteSkippedSession,
  deleteAllSkippedSessions,
  type SkippedSessionRecord,
  type InsertSkippedSessionInput,
} from './skipped-sessions.js';
