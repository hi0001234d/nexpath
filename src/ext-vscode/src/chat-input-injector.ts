import * as vscode from 'vscode';
import type { Host } from './host-detector.js';

/**
 * Chat-input injector (fills the B4 contract from
 * `project_b4_prompt_injection_contract` memory).
 *
 * Per-host candidate `vscode.commands.*` IDs that MIGHT write text to the
 * AI chat input. These are heuristic guesses based on community
 * documentation / reverse-engineering — none are official APIs. The
 * function tries each in order; the first one that doesn't throw + accepts
 * the text argument is treated as success.
 *
 * **None of these IDs are verified yet against a real running Cursor /
 * Windsurf.** Branch 5 (smoke-test) is where the engineer hand-verifies
 * the actual command IDs and prunes / re-orders this list based on
 * observed reality. The `dryRun` injection from B5 should also try
 * `vscode.commands.getCommands(true)` against a live Cursor and log the
 * filtered candidate set.
 *
 * Until B5 verifies, this function's net effect on Cursor 3.4.20 will
 * almost certainly be "all candidates fail, return false, clipboard
 * fallback takes over". That's safe — `handleOptionSelection` falls
 * through cleanly to the clipboard path documented in dev plan §2.4.
 */

const CURSOR_CANDIDATE_COMMANDS: ReadonlyArray<string> = [
  // These are educated guesses. Verify against a live Cursor by running
  // `vscode.commands.getCommands(true)` from a development host and filtering.
  'cursor.aichat.insertWithSelection',
  'composer.newChat',
  'cursor.composer.focus',
  'aichat.insertSelection',
  'workbench.action.chat.open',
];

const WINDSURF_CANDIDATE_COMMANDS: ReadonlyArray<string> = [
  // Same caveat — verify in B5 against a real Windsurf.
  'windsurf.cascade.newConversation',
  'cascade.openChat',
  'codeium.openCascade',
];

/** Re-export for tests that want to assert against the list. */
export const CANDIDATE_COMMANDS = {
  cursor: CURSOR_CANDIDATE_COMMANDS,
  windsurf: WINDSURF_CANDIDATE_COMMANDS,
};

export interface ChatInputInjectorDeps {
  /** Inject the host-resolver. Tests pass a fixed host. */
  host?: Host;
  /** Inject the command executor. Tests provide a mock. */
  executeCommand?: (id: string, ...args: unknown[]) => Thenable<unknown>;
  /** Inject the command lister. Tests provide a mock. */
  getCommands?: (filterInternal?: boolean) => Thenable<string[]>;
}

/**
 * Try to inject `text` into the host's AI chat input. Returns `true` if a
 * candidate command executed without throwing. Returns `false` (so
 * `handleOptionSelection` falls back to clipboard) if no candidate
 * succeeded — including when the host is plain VS Code (no AI chat input
 * to inject into).
 */
export async function chatInputInject(
  text: string,
  deps: ChatInputInjectorDeps = {},
): Promise<boolean> {
  const host = deps.host ?? 'vscode-generic';
  if (host === 'vscode-generic') return false;

  const exec =
    deps.executeCommand ??
    ((id: string, ...args: unknown[]) =>
      vscode.commands.executeCommand(id, ...args));
  const list =
    deps.getCommands ??
    ((filter?: boolean) => vscode.commands.getCommands(filter));

  const candidates =
    host === 'cursor' ? CURSOR_CANDIDATE_COMMANDS : WINDSURF_CANDIDATE_COMMANDS;

  // Only try commands that actually exist on the current host — avoids
  // wasted "no such command" rejections in the developer console.
  let available: Set<string>;
  try {
    available = new Set(await list(true));
  } catch {
    return false;
  }

  for (const id of candidates) {
    if (!available.has(id)) continue;
    try {
      await exec(id, text);
      return true;
    } catch {
      // try next
    }
  }
  return false;
}
