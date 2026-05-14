import type {
  ChatHistoryEvent,
  ChatHistoryExtractor,
  ItemTableRow,
} from '../chat-history-types.js';

/**
 * Cursor v2025-Q1 — the Composer-launch era (Cursor versions ~0.45–0.49).
 *
 * Community-documented key: `composerData.composerData` — a single JSON
 * object with `allComposers: Record<composerId, ComposerConversation>` where
 * each conversation has a `conversation: ComposerMessage[]` field. Messages
 * carry a `type` (1 = user, 2 = assistant) or a `role` ('user' / 'assistant')
 * depending on minor version.
 *
 * TODO(M2/B2): verify against a real Cursor v2025-Q1 `state.vscdb` dump
 * before Branch 6 ships. Field names may need adjustment after fixture
 * capture via `scripts/dump-cursor-state.ts`.
 */

const COMPOSER_KEY = 'composerData.composerData';

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
