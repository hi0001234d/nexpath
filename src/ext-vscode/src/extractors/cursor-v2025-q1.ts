import type {
  ChatHistoryEvent,
  ChatHistoryExtractor,
  ItemTableRow,
} from '../chat-history-types.js';

/**
 * Cursor v2025-Q1 (Composer era).
 *
 * **Real-machine update (2026-05-15, Cursor 3.4.20):** The fingerprint key
 * is `composer.composerData` (NOT `composerData.composerData` as the
 * original community docs suggested). Confirmed via
 * `scripts/dump-cursor-state.ts` against a live Cursor 3.4.20 workspace DB.
 *
 * **Open finding:** the value at `composer.composerData` is *metadata only*
 * on Cursor 3.4.20:
 *   `{ selectedComposerIds: string[], lastFocusedComposerIds: string[],
 *      hasMigratedComposerData: boolean, hasMigratedMultipleComposers: boolean }`
 * — it does **not** contain conversation messages. Where modern Composer
 * messages are actually stored is **TBD** (the workspace's `cursorDiskKV`
 * table was empty on a chat-less DB; messages may land there once a real
 * chat occurs, or in a separate file outside SQLite).
 *
 * The `allComposers / conversation` shape this extractor parses for is
 * believed to be correct for an OLDER Composer-era format (~0.45–0.49). On
 * a Cursor 3.4.20 DB this extractor will fingerprint-match the key but
 * `decodeRow` will return [] because the expected `allComposers` field is
 * absent. That's safe — fingerprint matches the modern key, decode falls
 * through cleanly, and a follow-up fixture-driven update can refine the
 * decode logic once we have a snapshot of a workspace DB with real chats.
 *
 * TODO(M2/B2): re-run `dump-cursor-state.ts` after submitting a real
 * Composer-mode prompt in Cursor and inspect which row(s) the message
 * landed in. Update this extractor (or add a sibling) accordingly before
 * Branch 6 ships.
 */

const COMPOSER_KEY = 'composer.composerData';

interface ComposerConversation {
  /** Composer / tab identifier — used as `rawSessionId`. */
  composerId?: string;
  conversation?: ComposerMessage[];
}

interface ComposerMessage {
  /** Numeric form: 1 = user, 2 = assistant. */
  type?: number | string;
  /** String form: 'user' / 'assistant'. */
  role?: string;
  /** Either `text` or `content` depending on minor version. */
  text?: string;
  content?: string;
}

interface ComposerData {
  allComposers?: Record<string, ComposerConversation>;
}

function isUserMessage(msg: ComposerMessage): boolean {
  return (
    msg.role === 'user' ||
    msg.type === 'user' ||
    msg.type === 1
  );
}

function extractText(msg: ComposerMessage): string | undefined {
  if (typeof msg.text === 'string' && msg.text.length > 0) return msg.text;
  if (typeof msg.content === 'string' && msg.content.length > 0) return msg.content;
  return undefined;
}

export const cursorV2025Q1: ChatHistoryExtractor = {
  id: 'cursor-v2025-q1',
  label: 'Cursor v2025-Q1 (Composer)',
  fingerprintKeys: [COMPOSER_KEY] as const,

  ownsKey(key: string): boolean {
    return key === COMPOSER_KEY;
  },

  decodeRow(row: ItemTableRow, sourcePath: string): ChatHistoryEvent[] {
    if (row.key !== COMPOSER_KEY) return [];
    let parsed: ComposerData;
    try {
      parsed = JSON.parse(row.value) as ComposerData;
    } catch {
      return [];
    }
    if (!parsed || typeof parsed !== 'object') return [];

    const events: ChatHistoryEvent[] = [];
    const composers = parsed.allComposers ?? {};
    for (const conv of Object.values(composers)) {
      if (!conv || !Array.isArray(conv.conversation)) continue;
      const composerId = conv.composerId ?? 'unknown';
      for (const msg of conv.conversation) {
        if (!isUserMessage(msg)) continue;
        const text = extractText(msg);
        if (!text) continue;
        events.push({
          prompt: text,
          rawSessionId: `composer:${composerId}`,
          capturedAt: new Date(),
          sourcePath,
          extractorId: 'cursor-v2025-q1',
        });
      }
    }
    return events;
  },
};
