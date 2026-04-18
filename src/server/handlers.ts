/**
 * Tool handler logic — extracted from index.ts so it can be tested without
 * starting the stdio transport.
 */

import { insertPrompt, getConfig, setConfig, isConfigSet, type Store } from '../store/index.js';

export type CapturePromptParams = {
  prompt: string;
  project_id?: string;
  agent?: string;
};

export type CaptureResult =
  | { status: 'captured' }
  | { status: 'disabled' }
  | { status: 'first_run_enabled' };

export const FIRST_RUN_BANNER =
  'Nexpath will store your coding prompts locally at ~/.nexpath/prompt-store.db\n' +
  'to calibrate language and vocabulary for better artifact quality.\n' +
  '\n' +
  '  \u2022 Data stays on your machine \u2014 nothing is sent externally\n' +
  '  \u2022 Stored: prompt text, timestamp, agent name, project path\n' +
  '  \u2022 Max: 500 prompts per project, 100 MB total\n' +
  '  \u2022 Disable anytime: nexpath store disable\n' +
  '  \u2022 Delete anytime:  nexpath store delete\n';

/**
 * Handle a capture_prompt tool call.
 *
 * - First run (prompt_capture_enabled not in config): opts in by default,
 *   writes disclosure banner to stderr, captures the prompt.
 * - Disabled (prompt_capture_enabled = 'false'): skips capture.
 * - Enabled (prompt_capture_enabled = 'true'): captures normally.
 */
export function handleCapturePrompt(store: Store, params: CapturePromptParams): CaptureResult {
  // First run: key has never been explicitly written to the config table
  if (!isConfigSet(store.db, 'prompt_capture_enabled')) {
    setConfig(store, 'prompt_capture_enabled', 'true');
    process.stderr.write(`[nexpath-serve] first run — prompt capture enabled\n${FIRST_RUN_BANNER}`);
    insertPrompt(store, {
      projectRoot: params.project_id ?? 'unknown',
      promptText: params.prompt,
      agent: params.agent,
    });
    return { status: 'first_run_enabled' };
  }

  if (getConfig(store.db, 'prompt_capture_enabled') === 'false') {
    return { status: 'disabled' };
  }

  insertPrompt(store, {
    projectRoot: params.project_id ?? 'unknown',
    promptText: params.prompt,
    agent: params.agent,
  });
  return { status: 'captured' };
}
