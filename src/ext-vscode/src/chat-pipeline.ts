import type { ChatHistoryEvent } from './chat-history-types.js';
import type { DecisionSessionPayload } from './ipc.js';

/**
 * Chat pipeline orchestrator (M13 of M2 Branch 5).
 *
 * Glues the chat-history watcher to the existing nexpath pipeline (`auto`
 * + `stop`) and to the view provider. For each user prompt the watcher
 * captures, this handler:
 *
 *   1. Calls `nexpath auto <prompt> <session-id>` via ipc — forwards the
 *      prompt to the existing capture/classify/advisory stages
 *      (Layer C, untouched).
 *   2. Immediately calls `nexpath stop <session-id>` via ipc — reads the
 *      pending advisory and produces a `DecisionSessionPayload | null`.
 *   3. If the payload is non-null, publishes it to the view provider,
 *      which auto-reveals the webview with the advisory + options.
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
  /** Inject `ipc.spawnAuto`. Tests pass a mock. */
  spawnAuto: (prompt: string, sessionId: string) => Promise<void>;
  /** Inject `ipc.spawnStop`. Tests pass a mock. */
  spawnStop: (sessionId: string) => Promise<DecisionSessionPayload | null>;
  /** Inject the view-provider's `publishPayload`. Tests pass a mock. */
  publishPayload: (payload: DecisionSessionPayload) => void;
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
      await deps.spawnAuto(event.prompt, sessionId);
    } catch (err) {
      logger.error('[nexpath] spawnAuto failed:', err);
      return;
    }
    let payload: DecisionSessionPayload | null;
    try {
      payload = await deps.spawnStop(sessionId);
    } catch (err) {
      logger.error('[nexpath] spawnStop failed:', err);
      return;
    }
    if (payload === null) return;
    try {
      deps.publishPayload(payload);
    } catch (err) {
      logger.error('[nexpath] publishPayload failed:', err);
    }
  };
}
