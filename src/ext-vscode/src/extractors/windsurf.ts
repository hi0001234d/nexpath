import type {
  ChatHistoryEvent,
  ChatHistoryExtractor,
  ItemTableRow,
} from '../chat-history-types.js';

/**
 * Windsurf (Codeium Cascade).
 *
 * Storage layout differs from Cursor — Windsurf does NOT use VS Code's
 * `ItemTable` SQLite database for chat history. It stores conversation data
 * under `~/.codeium/windsurf/` as JSON files, one (or more) per session.
 * The watcher dispatches Windsurf paths to this extractor by storage kind
 * (`windsurf-dir`), routing through `decodeWindsurfJsonFile` (NOT
 * `decodeRow` — that's only for the unlikely ItemTable-migration case).
 *
 * `decodeRow` remains in place as a fingerprint stub so future Windsurf
 * versions that migrate to a VS Code-style ItemTable (`cascade.*` keys)
 * still match cleanly; it returns no events today because no such
 * migration is known.
 *
 * The JSON-file decoder is the load-bearing path. It currently returns no
 * events because Windsurf's per-session JSON schema has not been verified
 * against a live install — see TODO below for the engineer-driven step
 * that closes the loop.
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
 * TODO(M2/Drift-A engineer step): replace the default no-op body once a
 * real Windsurf install is inspected and the per-session JSON schema is
 * identified. The FS plumbing around this function (directory enumeration,
 * file reading, JSON parsing, dedup, watcher dispatch) is already in
 * place — only the schema-specific field extraction is missing.
 *
 * Inspection path:
 *   1. Install Windsurf, open it, type a prompt in Cascade chat.
 *   2. List files under `~/.codeium/windsurf/`.
 *   3. Identify the user-prompt field path inside one file.
 *   4. Replace the body below — return one `ChatHistoryEvent` per new
 *      user prompt, with a stable `rawSessionId` derived from the file's
 *      session id (NOT the file path — same session may be split across
 *      multiple files).
 */
export function decodeWindsurfJsonFile(
  _parsed: unknown,
  _sourcePath: string,
): ChatHistoryEvent[] {
  return [];
}
