export { openStore, closeStore, saveStore, DEFAULT_DB_PATH, getSql, type Store } from './db.js';
export {
  insertPrompt,
  getRecentPrompts,
  deleteProjectPrompts,
  deleteAllPrompts,
  pruneOlderThan,
  getPromptStats,
  type InsertParams,
  type PromptStats,
  type RecentPrompt,
} from './prompts.js';
export { getConfig, setConfig, getAllConfig, isConfigSet, deleteConfig, DEFAULT_CONFIG } from './config.js';
export { redactSecrets } from './redact.js';
export { upsertProject, getProject, listProjects, setDetectedLanguage, type ProjectRecord, type UpsertProjectParams } from './projects.js';
export {
  insertSkippedSession,
  getSkippedSessions,
  getSkippedSessionCount,
  deleteSkippedSession,
  deleteAllSkippedSessions,
  deleteAllSkippedSessionsGlobal,
  pruneSkippedSessions,
  type SkippedSessionRecord,
  type InsertSkippedSessionInput,
} from './skipped-sessions.js';
export {
  upsertPendingAdvisory,
  getPendingAdvisory,
  markAdvisoryShown,
  type PendingAdvisory,
  type UpsertPendingAdvisoryInput,
} from './pending-advisories.js';
