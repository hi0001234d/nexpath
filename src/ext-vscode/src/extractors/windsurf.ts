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
 * (`windsurf-dir`), so `decodeRow` is normally not invoked for Windsurf.
 *
 * **Placeholder**: this stub returns no events. The fingerprint match
 * (`cascade.*` keys) only triggers if Windsurf migrates to a VS Code-style
 * ItemTable in a future version — currently no such migration is known.
 * The real Windsurf JSON-file decoder lives in Branch 4
 * (`cursor-windsurf-adapters`) alongside `windsurfAdapter.chatHistoryPaths`.
 *
 * TODO(M2/B2): replace this stub with the real Windsurf decoder once
 * `scripts/dump-cursor-state.ts` has been adapted for Windsurf and we have
 * a verified fixture.
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
