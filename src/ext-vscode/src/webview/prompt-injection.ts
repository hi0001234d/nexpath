import * as vscode from 'vscode';

/**
 * Round-trip prompt injection (M8 of M2 Branch 3).
 *
 * When the user clicks an option in the decision-session webview, the
 * selected option's text needs to land back in the host's (Cursor's /
 * Windsurf's) AI chat input — so they can hit Enter and re-submit the
 * refined prompt.
 *
 * # Architecture (B3 sets up; B4 fills in)
 *
 * `handleOptionSelection` has TWO paths, in priority order:
 *
 *   1. **Primary — direct injection** via `deps.injectFn`. This is supplied
 *      by the per-agent adapter (B4), which knows which `vscode.commands`
 *      command writes text to that agent's chat input (Cursor / Windsurf
 *      each have their own command id). If `injectFn(text)` returns
 *      `true`, the text is in the chat input and we're done.
 *
 *   2. **Fallback — clipboard + toast.** If `injectFn` is absent (B3
 *      default) or returns `false`, we write the text to the system
 *      clipboard and show an info toast directing the user to paste it.
 *
 * # Why B3 doesn't supply an injectFn
 *
 * VS Code's standard text-editing API operates on editor documents, not
 * the host's chat input panel — so there is no agent-agnostic primary
 * path. The per-agent command id has to be discovered against each agent
 * (and tracked across agent versions). That research and wiring is
 * Branch 4's scope; B3 sets up the contract so B4 only has to plug in
 * the `injectFn`. Documented as a load-bearing contract in the project
 * memory `project_b4_prompt_injection_contract.md`.
 *
 * Documented as a known fallback in dev plan §2.4 (Risks → "Round-trip
 * prompt injection").
 */

/**
 * A function that attempts to write the option text directly into the
 * agent's chat input. Returns `true` on success (clipboard fallback is
 * skipped) or `false` if the agent-specific command is unavailable / errored.
 *
 * Implemented per-agent in Branch 4 (cursor-windsurf-adapters).
 */
export type OptionInjector = (text: string) => Promise<boolean>;

export interface PromptInjectionDeps {
  /**
   * Adapter-supplied direct-injection function (the primary path).
   * Absent in B3 — Branch 4 fills it in per-agent.
   */
  injectFn?: OptionInjector;
  /** Override the clipboard writer (tests). */
  clipboardWrite?: (text: string) => Promise<void>;
  /** Override the info-toast call (tests). */
  showInfo?: (message: string) => Promise<string | undefined>;
}

const FALLBACK_MESSAGE =
  'Nexpath: pasted to clipboard — paste into the chat input to use it.';

/**
 * Hand the selected option's text to the agent: try direct injection
 * first, fall back to clipboard + toast. Never throws — failures surface
 * to the user as toasts.
 */
export async function handleOptionSelection(
  text: string,
  deps: PromptInjectionDeps = {},
): Promise<void> {
  // ── 1. Primary: adapter-supplied direct injection ───────────────────────
  if (deps.injectFn) {
    try {
      const injected = await deps.injectFn(text);
      if (injected) return;
      // If injectFn returned false, fall through to clipboard.
    } catch {
      // injectFn threw — fall through to clipboard.
    }
  }

  // ── 2. Fallback: clipboard + info toast ─────────────────────────────────
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
