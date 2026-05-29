import type {
  ChatHistoryEvent,
  ChatHistoryExtractor,
  ItemTableRow,
} from '../chat-history-types.js';

/**
 * Cursor v2025-Q2+ — community-documented per-tab chat history layout.
 *
 * **Real-machine status (2026-05-15, Cursor 3.4.20):** the prefix
 * `cursorAIChatService.chatHistory.` was **NOT** observed in a real
 * Cursor 3.4.20 workspace DB. This extractor's fingerprint will only
 * match if a Cursor version that does use this key prefix is encountered.
 *
 * **What we DID see on Cursor 3.4.20** (per
 * `scripts/dump-cursor-state.ts` inspection):
 *   - `aiService.prompts` / `aiService.generations` — covered by the
 *     `cursor-v2024-q4` extractor.
 *   - `composer.composerData` — metadata only; covered by
 *     `cursor-v2025-q1`.
 *   - No `cursorAIChatService.*` keys at all.
 * The Composer-mode message storage location for Cursor 3.4.20 is still
 * unknown — likely in `cursorDiskKV` once chats happen, or in a separate
 * file. The dump script captures both tables and all chat-prefix keys, so
 * a follow-up commit will refine extractors once a chat-bearing snapshot
 * arrives.
 *
 * TODO(M2/B2): either (a) confirm the `cursorAIChatService.chatHistory.`
 * prefix in some older Cursor version (and keep this extractor as
 * version-pinned), or (b) replace it with a `cursor-v3-x` extractor
 * matching Cursor 3.4.20's actual message storage once it's been
 * snapshotted.
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
