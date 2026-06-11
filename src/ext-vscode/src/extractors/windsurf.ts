import type {
  ChatHistoryEvent,
  ChatHistoryExtractor,
  ItemTableRow,
} from '../chat-history-types.js';

/**
 * Windsurf (Codeium Cascade).
 *
 * FINDING (2026-05-28, live Windsurf 2.0 / SWE-1.6 install on Linux):
 * Cascade prompt capture via file-watching is INFEASIBLE, and Windsurf is
 * therefore OUT OF SCOPE for v1 capture. Evidence from a live "what is 2 + 2"
 * conversation:
 *   - Conversation CONTENT (the user's prompt + the reply) is written to
 *     `~/.codeium/windsurf/cascade/<sessionId>.pb`, ENCRYPTED at rest:
 *     Shannon entropy 8.00 bits/byte, not gzip/zlib/deflate, no recoverable
 *     strings, prompt text absent in plaintext or base64.
 *   - The only plaintext is session METADATA in the host's
 *     `globalStorage/state.vscdb` under `windsurf.acp.metadataCache`
 *     (`sessionId`, an LLM-generated `title`, `cwd`, timestamps, `status`)
 *     — NOT the raw prompt. A title is an LLM summary, one per session, with
 *     no per-prompt granularity; useless as Layer C input.
 *   - `state.vscdb` (workspaceStorage) holds zero chat content;
 *     `chat.ChatSessionStore.index` is empty.
 *
 * There is no readable prompt on disk for any decoder to consume. The
 * `windsurf-dir` watch + the no-op decoders below are kept inert (host
 * detection + watch wiring stay so a future non-encrypted path could slot in)
 * but they will never emit on Windsurf 2.0. Re-capturing Windsurf would need a
 * non-file-watching route (Codeium MCP/command/API, or decrypting the `.pb`
 * store — high effort, brittle, ToS-sensitive). See architecture doc §5.3.
 *
 * `decodeRow` is a fingerprint stub for the (unobserved) case where a future
 * Windsurf migrates chat to a VS Code-style ItemTable with `cascade.*` keys.
 */

const CASCADE_KEY_PREFIX = 'cascade.';

export const windsurf: ChatHistoryExtractor = {
  id: 'windsurf',
  label: 'Windsurf (Cascade)',
  fingerprintKeys: [CASCADE_KEY_PREFIX] as const,

  ownsKey(key: string): boolean {
    return key.startsWith(CASCADE_KEY_PREFIX);
  },

  decodeRow(_row: ItemTableRow, _sourcePath: string): ChatHistoryEvent[] {
    return [];
  },
};

/**
 * Decode a single parsed Windsurf JSON file into zero or more chat events.
 *
 * Contract:
 *   - `parsed` is whatever `JSON.parse(fileContents)` returned. Callers
 *     handle malformed files BEFORE calling this — the function may assume
 *     a parseable value (still `unknown` because the shape is host-defined).
 *   - `sourcePath` is the absolute path to the .json file (forwarded into
 *     the `ChatHistoryEvent.sourcePath` field so dedup + diagnostics stay
 *     stable across re-reads of the same file).
 *   - Returns events with `extractorId === 'windsurf'`. `capturedAt` is
 *     left as `new Date(0)` here; the watcher overwrites it via its
 *     injected clock so test ordering stays deterministic.
 *
 * RESOLVED — do NOT try to implement this. The 2026-05-28 live inspection
 * (see the module docstring above) showed Cascade conversations are stored
 * encrypted (`~/.codeium/windsurf/cascade/<sessionId>.pb`, entropy 8.00) and
 * the scanner's premise (plaintext top-level `*.json`) is wrong. No plaintext
 * prompt exists on disk, so this stays a no-op and Windsurf capture is out of
 * v1 scope. Kept only so the `windsurf-dir` watch dispatch has a target.
 */
export function decodeWindsurfJsonFile(
  _parsed: unknown,
  _sourcePath: string,
): ChatHistoryEvent[] {
  return [];
}
