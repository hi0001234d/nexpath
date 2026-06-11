import type {
  ChatHistoryEvent,
  ChatHistoryExtractor,
  ItemTableRow,
} from '../chat-history-types.js';

/**
 * Cursor Composer / Agent mode — `cursorDiskKV.bubbleId:<composerId>:<bubbleId>`
 * (Cursor 3.4.20+, observed live 2026-05-25).
 *
 * Storage location: `~/.config/Cursor/User/globalStorage/state.vscdb`
 * (NOT workspaceStorage). One shared file across every workspace the
 * user opens in Cursor — Composer/Agent conversations are workspace-
 * agnostic.
 *
 * Row shape:
 *   key   = `bubbleId:<composerId>:<bubbleId>` (the reader prefixes this
 *           with `cursorDiskKV/` so it's distinguishable from any
 *           `ItemTable` rows that might happen to share a key prefix)
 *   value = JSON object with shape:
 *     {
 *       "_v":         3,
 *       "type":       1 | 2,        // 1 = user, 2 = assistant
 *       "bubbleId":   "<uuid>",
 *       "text":       "<the prompt text>",
 *       "richText":   "<lexical JSON>",
 *       "createdAt":  "2026-05-23T09:58:55.791Z",
 *       …many other fields (codebaseContextChunks, attachedFiles, lints, etc.)
 *     }
 *
 * Only user-type bubbles (type=1) produce ChatHistoryEvents; assistant
 * replies (type=2) are skipped. The user prompt text lives at `.text`
 * (plain string) — `.richText` is the same content in Cursor's Lexical
 * editor format and is intentionally ignored.
 *
 * **`rawSessionId` = the composerId.** A composer is one Agent
 * conversation; each conversation has its own id and contains multiple
 * bubbles. Using composerId per-conversation means two distinct
 * conversations in the same workspace don't dedup against each other,
 * while the same bubble re-read across fs.watch fires within ONE
 * conversation will dedup correctly (signature = sourcePath +
 * composerId + prompt text). The bubbleId is NOT used in the signature
 * because the prompt text is already content-addressed; including the
 * bubbleId would cause a re-fire if Cursor ever rewrites the value
 * (which it does — e.g., when `tokenCount` is updated post-response).
 *
 * **Why this extractor was added (M2 closeout 2026-05-25):** the user's
 * manual S01 test run captured 0 prompts despite typing 15 prompts in
 * Cursor. Investigation traced the prompts to `cursorDiskKV` in
 * globalStorage (not the workspaceStorage paths the watcher was
 * monitoring). The Composer/Agent panel is Cursor's default modern UX;
 * without this extractor the extension is effectively blind to the
 * majority of real-world prompts. Closes the F2 gap in dev plan §2.10.
 */

const KEY_PREFIX = 'cursorDiskKV/bubbleId:';

interface ComposerBubbleValue {
  /** Schema version. Currently 3 in Cursor 3.4.20. */
  _v?: number;
  /** 1 = user bubble (a prompt), 2 = assistant bubble (a response). */
  type?: number;
  /** UUID of the bubble itself. Same as the second UUID in the key. */
  bubbleId?: string;
  /** The user prompt text. Empty / missing for assistant bubbles. */
  text?: string;
  /** ISO timestamp; not used for capture but useful for future telemetry. */
  createdAt?: string;
}

/**
 * Extract the composerId from a key of the form
 * `cursorDiskKV/bubbleId:<composerId>:<bubbleId>`. Returns null when the
 * key doesn't match the expected shape (defensive — we never reach
 * `decodeRow` without `ownsKey` having returned true, but a key that
 * `startsWith` the prefix could still be missing the second colon).
 */
function parseComposerId(key: string): string | null {
  const rest = key.slice(KEY_PREFIX.length);
  const colonIdx = rest.indexOf(':');
  if (colonIdx <= 0) return null;
  return rest.slice(0, colonIdx);
}

export const cursorComposerBubble: ChatHistoryExtractor = {
  id: 'cursor-composer-bubble',
  label: 'Cursor Composer / Agent mode (cursorDiskKV bubbles)',
  fingerprintKeys: [KEY_PREFIX] as const,

  ownsKey(key: string): boolean {
    return key.startsWith(KEY_PREFIX);
  },

  decodeRow(row: ItemTableRow, sourcePath: string): ChatHistoryEvent[] {
    if (!row.key.startsWith(KEY_PREFIX)) return [];

    const composerId = parseComposerId(row.key);
    if (composerId === null) return [];

    let parsed: ComposerBubbleValue;
    try {
      parsed = JSON.parse(row.value) as ComposerBubbleValue;
    } catch {
      return [];
    }

    // Only user-type bubbles produce capture events. type=2 is the
    // assistant; type=undefined / other values are skipped defensively.
    if (parsed.type !== 1) return [];

    const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
    if (text.length === 0) return [];

    return [
      {
        prompt: text,
        rawSessionId: composerId,
        capturedAt: new Date(),
        sourcePath,
        extractorId: 'cursor-composer-bubble',
      },
    ];
  },
};
