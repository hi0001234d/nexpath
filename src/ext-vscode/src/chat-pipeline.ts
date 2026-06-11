import type { ChatHistoryEvent } from './chat-history-types.js';
import type { StopSelection } from './ipc.js';

/**
 * Chat pipeline orchestrator (M13 of M2 Branch 5).
 *
 * Glues the chat-history watcher to the existing nexpath pipeline (`auto`
 * + `stop`). For each user prompt the watcher captures, this handler:
 *
 *   1. Calls `nexpath auto <prompt> <session-id>` via ipc — forwards the
 *      prompt to the existing capture/classify/advisory stages
 *      (Layer C, untouched).
 *   2. Calls `onAfterCapture` — the caller checks the store and arms the
 *      in-editor advisory fallback if `auto` just parked one. This runs BEFORE
 *      the (possibly blocking) terminal popup so the user always has a path to
 *      the advisory even when the popup can't open — e.g. on macOS the popup is
 *      `osascript` → Terminal.app, which BLOCKS on the Automation-permission
 *      dialog and may never return.
 *   3. Calls `nexpath stop <session-id>` via ipc — Layer C opens its terminal
 *      popup and blocks until the user acts.
 *   4. If the user SELECTED an option in the popup, `stop` returns a
 *      `StopSelection`; the handler injects that prompt into the host's chat
 *      input (`injectSelection`) and the wiring clears the now-redundant
 *      fallback. No selection (dismissed / no-advisory / popup couldn't open) →
 *      the armed fallback stays as the escape hatch.
 *
 * **Timing simplification for B5 smoke test:** `auto` and `stop` are
 * called back-to-back. In production we'd want `stop` to fire after the
 * agent's response completes (so the advisory has the latest context),
 * but our chat-history watcher only emits user-prompt events — we don't
 * yet detect "agent response done". This is acceptable for B5 because:
 *   - The legacy Claude Code hook flow also fires `auto` then `stop`
 *     and works fine.
 *   - Layer C's classifier doesn't require the assistant response to
 *     be present — it advises based on the user prompt alone.
 *   - A future M5 hardening pass can add "response done" detection via
 *     state.vscdb assistant-message extractors.
 *
 * **Resilience:** the handler catches everything. A failed spawn /
 * malformed payload / view-provider error never propagates to the
 * watcher (the watcher uses `void this.handleMessage(raw)` patterns
 * where unhandled rejections would crash the extension host).
 */

export interface ChatPipelineDeps {
  /**
   * Inject `ipc.spawnAuto`. Tests pass a mock.
   *
   * The third argument carries the originating `ChatHistoryEvent` so the
   * caller can derive a per-event `cwd` from `event.sourcePath` — necessary
   * for multi-workspace correctness, since one extension instance may watch
   * `state.vscdb` files belonging to other workspaces and must attribute
   * each prompt to its true project root, not to its own `workspaceCwd`.
   */
  spawnAuto: (
    prompt: string,
    sessionId: string,
    event: ChatHistoryEvent,
  ) => Promise<void>;
  /** Inject `ipc.spawnStop`. Tests pass a mock. */
  spawnStop: (
    sessionId: string,
    event: ChatHistoryEvent,
  ) => Promise<StopSelection | null>;
  /**
   * Inject the selected prompt back into the host's chat input. Called only
   * when the user picked an option in Layer C's terminal popup.
   */
  injectSelection: (selectedPrompt: string, event: ChatHistoryEvent) => Promise<void> | void;
  /**
   * Optional: called right after `auto` succeeds, BEFORE the terminal popup.
   * The caller checks the store and arms the in-editor advisory fallback if an
   * advisory was just parked — so it's available even if the popup blocks (the
   * macOS Automation-dialog case) or can't open at all.
   */
  onAfterCapture?: (event: ChatHistoryEvent) => Promise<void> | void;
  /**
   * Optional session-id composer. Production passes a function that prefixes
   * the host workspace id; tests omit this and just use `event.rawSessionId`.
   */
  composeSessionId?: (event: ChatHistoryEvent) => string;
  /** Optional logger override (tests). */
  logger?: { error: (msg: string, err: unknown) => void };
}

const defaultLogger = {
  error: (msg: string, err: unknown) => console.error(msg, err),
};

/**
 * Build the handler the watcher calls for every captured prompt.
 *
 * The returned function takes a `ChatHistoryEvent` and runs the auto →
 * stop → publish pipeline. It never throws.
 */
export function createChatEventHandler(
  deps: ChatPipelineDeps,
): (event: ChatHistoryEvent) => Promise<void> {
  const composeSessionId =
    deps.composeSessionId ?? ((e: ChatHistoryEvent) => e.rawSessionId);
  const logger = deps.logger ?? defaultLogger;

  return async (event: ChatHistoryEvent): Promise<void> => {
    const sessionId = composeSessionId(event);
    try {
      await deps.spawnAuto(event.prompt, sessionId, event);
    } catch (err) {
      logger.error('[nexpath] spawnAuto failed:', err);
      return;
    }
    // Arm the in-editor fallback BEFORE the popup. `stop` can block indefinitely
    // on macOS (osascript waiting on the Automation-permission dialog), so the
    // fallback must not depend on `stop` returning.
    if (deps.onAfterCapture) {
      try {
        await deps.onAfterCapture(event);
      } catch (err) {
        logger.error('[nexpath] onAfterCapture failed:', err);
      }
    }
    let selection: StopSelection | null;
    try {
      selection = await deps.spawnStop(sessionId, event);
    } catch (err) {
      // The popup couldn't deliver a selection — the fallback armed above stands.
      logger.error('[nexpath] spawnStop failed:', err);
      return;
    }
    if (selection === null) return; // dismissed / no advisory / no TTY — fallback stands
    try {
      await deps.injectSelection(selection.selectedPrompt, event);
    } catch (err) {
      logger.error('[nexpath] injectSelection failed:', err);
    }
  };
}
