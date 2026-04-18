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
export { getConfig, setConfig, getAllConfig, DEFAULT_CONFIG } from './config.js';
export { redactSecrets } from './redact.js';
