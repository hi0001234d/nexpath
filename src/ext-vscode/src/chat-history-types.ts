/**
 * Shared types for the chat-history capture layer (M2 Branch 2). The watcher,
 * extractors, and fingerprint logic all speak this vocabulary.
 *
 * VS Code (and its forks Cursor / Windsurf) stores extension state in a SQLite
 * database with a single `ItemTable(key TEXT, value TEXT)` table. Per-version
 * extractors decode rows from this table into normalised ChatHistoryEvents.
 */

/** A single row from VS Code/Cursor's standard ItemTable. */
export interface ItemTableRow {
  key: string;
  /** JSON-encoded string in practice; extractors are responsible for parsing. */
  value: string;
}

/**
 * One user prompt captured from the agent's chat history. Emitted by the
 * watcher; consumed by the extension layer which composes a full session_id
 * (workspaceId + rawSessionId) before forwarding to the nexpath IPC layer.
 */
export interface ChatHistoryEvent {
  /** The prompt text the user submitted. */
  prompt: string;
  /**
   * Per-row session piece (tab id, conversation id, prompts-index). The
   * extension layer combines this with `vscode.workspace.workspaceFile` /
   * workspace id to derive the full nexpath session_id.
   */
  rawSessionId: string;
  /** Capture timestamp (extension-local clock). */
  capturedAt: Date;
  /** Storage file/dir this row was read from. */
  sourcePath: string;
  /** Identifier of the extractor that decoded this row, e.g. `cursor-v2025-q2`. */
  extractorId: string;
}

/** Contract every per-version extractor implements (M3). */
export interface ChatHistoryExtractor {
  /** Stable identifier, e.g. `cursor-v2024-q4`, `windsurf`. */
  id: string;
  /** Human-readable label for diagnostics + telemetry. */
  label: string;
  /**
   * Key prefixes that uniquely fingerprint this version. The fingerprint
   * matcher treats each entry as a prefix; exact keys are prefixes of
   * themselves. The extractor with the most observed-key prefix matches
   * wins (see `pickExtractor` in `extractors/index.ts`).
   */
  fingerprintKeys: readonly string[];
  /** Whether this extractor decodes rows with the given ItemTable key. */
  ownsKey(key: string): boolean;
  /**
   * Decode a single ItemTable row into zero or more chat events.
   * Returns [] if the row contains no new user prompts (assistant messages,
   * malformed JSON, foreign rows).
   */
  decodeRow(row: ItemTableRow, sourcePath: string): ChatHistoryEvent[];
}

/** Result from `pickExtractor` (M4). */
export type FingerprintResult =
  | {
      kind: 'known';
      extractor: ChatHistoryExtractor;
      /** Observed keys that triggered the match — useful for logs. */
      matchedKeys: readonly string[];
    }
  | {
      kind: 'unknown';
      observedKeyCount: number;
      /** First few observed keys, for the "schema unknown" toast / log. */
      observedSampleKeys: readonly string[];
    };

/** Storage layout the watcher needs to handle. */
export type StorageKind = 'cursor-sqlite' | 'windsurf-dir';

/** A path the watcher is monitoring. */
export interface WatchTarget {
  /** Absolute path to a SQLite file (Cursor) or a directory (Windsurf). */
  path: string;
  kind: StorageKind;
  /**
   * Extractor for this target. For Cursor, may be left undefined — the
   * watcher fingerprints the ItemTable on first read and caches the result.
   */
  extractor?: ChatHistoryExtractor;
}
