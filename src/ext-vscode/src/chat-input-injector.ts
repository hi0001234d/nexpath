import * as vscode from 'vscode';
import type { Host } from './host-detector.js';

/**
 * Chat-input injector (fills the B4 contract from
 * `project_b4_prompt_injection_contract` memory).
 *
 * Each host has an ordered list of candidate `vscode.commands.*` IDs that write
 * text to the AI chat input, with the exact argument shape each expects. The
 * function lists the host's real commands (`getCommands(true)`), then executes
 * the first available candidate; the first that doesn't throw wins.
 *
 * **Windsurf is VERIFIED** against Windsurf 2.3.9 (Electron 39.6): the workbench
 * core registers `windsurf.sendTextToChat`, and a core caller invokes it as
 * `executeCommand('windsurf.sendTextToChat', text, 'annotation:<id>')` — i.e.
 * `(text, sourceLabel)`. We pass `(text, 'nexpath:advisory')` to push the chosen
 * advisory straight into Cascade (no clipboard).
 *
 * **Cursor candidates are still heuristic** — verify against a live Cursor with
 * `vscode.commands.getCommands(true)` and prune. If nothing matches, the function
 * returns `false` and `handleOptionSelection` falls back to the clipboard path.
 */

interface CommandCandidate {
  id: string;
  /** Build the argument list for `executeCommand(id, ...args)`. */
  args: (text: string) => unknown[];
}

const CURSOR_CANDIDATES: ReadonlyArray<CommandCandidate> = [
  // Educated guesses — verify against a live Cursor and prune.
  { id: 'cursor.aichat.insertWithSelection', args: (t) => [t] },
  { id: 'composer.newChat', args: (t) => [t] },
  { id: 'cursor.composer.focus', args: (t) => [t] },
  { id: 'aichat.insertSelection', args: (t) => [t] },
  { id: 'workbench.action.chat.open', args: (t) => [t] },
];

const WINDSURF_CANDIDATES: ReadonlyArray<CommandCandidate> = [
  // VERIFIED command + arg shape (Windsurf 2.3.9 workbench core).
  { id: 'windsurf.sendTextToChat', args: (t) => [t, 'nexpath:advisory'] },
  // Best-effort fallback if a future build renames the above.
  { id: 'windsurf.sendTerminalToChat', args: (t) => [t] },
];

/** Re-export the candidate command IDs for tests that assert against the list. */
export const CANDIDATE_COMMANDS = {
  cursor: CURSOR_CANDIDATES.map((c) => c.id),
  windsurf: WINDSURF_CANDIDATES.map((c) => c.id),
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
 * `handleOptionSelection` falls back to clipboard) if no candidate succeeded —
 * including when the host is plain VS Code (no AI chat input to inject into).
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

  const candidates = host === 'cursor' ? CURSOR_CANDIDATES : WINDSURF_CANDIDATES;

  // Only try commands that actually exist on the current host — avoids
  // wasted "no such command" rejections in the developer console.
  let available: Set<string>;
  try {
    available = new Set(await list(true));
  } catch {
    return false;
  }

  for (const c of candidates) {
    if (!available.has(c.id)) continue;
    try {
      await exec(c.id, ...c.args(text));
      return true;
    } catch {
      // try next
    }
  }
  return false;
}
