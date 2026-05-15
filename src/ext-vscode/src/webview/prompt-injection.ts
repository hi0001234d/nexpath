import * as vscode from 'vscode';

/**
 * Round-trip prompt injection (M8 of M2 Branch 3).
 *
 * When the user clicks an option in the decision-session webview, the
 * selected option's text needs to land back in the host's (Cursor's /
 * Windsurf's) AI chat input — so they can hit Enter and re-submit the
 * refined prompt.
 *
 * **VS Code's text-editing APIs do NOT reach the host's chat panel.** They
 * operate on editor documents (open files in the editor area). The chat
 * input is part of the host application's own UI surface, outside the
 * extension API's reach. Documented in dev plan §2.4 (Risks → "Round-trip
 * prompt injection").
 *
 * Strategy for B3 (this branch):
 *   1. Write the option text to the system clipboard via `vscode.env.clipboard`.
 *   2. Show a non-modal info toast: *"Pasted to clipboard — paste into the
 *      chat input to use it."*
 *
 * Branch 4 (`cursor-windsurf-adapters`) may discover a Cursor-specific
 * command (e.g. via `vscode.commands.getCommands(true)`) that lets us
 * write directly into the chat input, in which case this function gets
 * an additional primary path and the clipboard becomes the secondary
 * fallback. Until then, clipboard + toast is the only reliable path.
 */

export interface PromptInjectionDeps {
  /** Inject the clipboard writer for tests. */
  clipboardWrite?: (text: string) => Promise<void>;
  /** Inject the info-toast call for tests. */
  showInfo?: (message: string) => Promise<string | undefined>;
}

const FALLBACK_MESSAGE =
  'Nexpath: pasted to clipboard — paste into the chat input to use it.';

/**
 * Hand the selected option's text to the user via the clipboard + toast.
 * Resolves once both steps have been attempted; never throws — failures
 * surface to the user as a different toast.
 */
export async function handleOptionSelection(
  text: string,
  deps: PromptInjectionDeps = {},
): Promise<void> {
  const clipboardWrite =
    deps.clipboardWrite ?? ((s: string) => vscode.env.clipboard.writeText(s));
  const showInfo =
    deps.showInfo ??
    ((m: string) =>
      Promise.resolve(vscode.window.showInformationMessage(m)) as Promise<
        string | undefined
      >);

  try {
    await clipboardWrite(text);
    await showInfo(FALLBACK_MESSAGE);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await showInfo(`Nexpath: couldn't copy to clipboard (${reason}).`);
  }
}
