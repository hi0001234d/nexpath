import type {
  ChatHistoryEvent,
  ChatHistoryExtractor,
  ItemTableRow,
} from '../chat-history-types.js';

/**
 * Cursor v2025-Q2+ — current per-tab chat history layout.
 *
 * Community-documented key prefix: `cursorAIChatService.chatHistory.<tabId>`
 * — value is a JSON array of message objects. Each message has either a
 * `role` ('user' / 'assistant') or a `type` (string or legacy numeric),
 * and the prompt text lives in either `content` or `text`.
 *
 * TODO(M2/B2): verify against a real Cursor v2025-Q2+ `state.vscdb` dump
 * before Branch 6 ships. Field names may need adjustment after fixture
 * capture via `scripts/dump-cursor-state.ts`.
 */

const KEY_PREFIX = 'cursorAIChatService.chatHistory.';

interface ChatMessage {
  role?: string;
  type?: string | number;
  content?: string;
  text?: string;
}

function isUserMessage(msg: ChatMessage): boolean {
  return (
    msg.role === 'user' ||
    msg.type === 'user' ||
    msg.type === 1 /* legacy numeric */
  );
}

function extractText(msg: ChatMessage): string | undefined {
  if (typeof msg.content === 'string' && msg.content.length > 0) return msg.content;
  if (typeof msg.text === 'string' && msg.text.length > 0) return msg.text;
  return undefined;
}

export const cursorV2025Q2: ChatHistoryExtractor = {
  id: 'cursor-v2025-q2',
  label: 'Cursor v2025-Q2+ (per-tab chat history)',
  fingerprintKeys: [KEY_PREFIX] as const,

  ownsKey(key: string): boolean {
    return key.startsWith(KEY_PREFIX);
  },

  decodeRow(row: ItemTableRow, sourcePath: string): ChatHistoryEvent[] {
    if (!row.key.startsWith(KEY_PREFIX)) return [];
    const tabId = row.key.slice(KEY_PREFIX.length);

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.value);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];

    const events: ChatHistoryEvent[] = [];
    for (const msg of parsed as ChatMessage[]) {
      if (!msg || !isUserMessage(msg)) continue;
      const text = extractText(msg);
      if (!text) continue;
      events.push({
        prompt: text,
        rawSessionId: `tab:${tabId}`,
        capturedAt: new Date(),
        sourcePath,
        extractorId: 'cursor-v2025-q2',
      });
    }
    return events;
  },
};
