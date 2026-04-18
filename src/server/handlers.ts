/**
 * Tool handler logic — extracted from index.ts so it can be tested without
 * starting the stdio transport.
 */

import { insertPrompt, type Store } from '../store/index.js';

export type CapturePromptParams = {
  prompt: string;
  project_id?: string;
  agent?: string;
};

/**
 * Handle a capture_prompt tool call.
 * Writes the prompt to the SQLite store immediately (crash-safe by design —
 * sql.js serializes to disk on every insert).
 *
 * project_id falls back to 'unknown' if the hook did not supply one.
 */
export function handleCapturePrompt(store: Store, params: CapturePromptParams): void {
  insertPrompt(store, {
    projectRoot: params.project_id ?? 'unknown',
    promptText: params.prompt,
    agent: params.agent,
  });
}
