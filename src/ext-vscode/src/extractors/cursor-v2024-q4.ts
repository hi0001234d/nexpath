import type {
  ChatHistoryEvent,
  ChatHistoryExtractor,
  ItemTableRow,
} from '../chat-history-types.js';

/**
 * Cursor v2024-Q4 (approx. Cursor versions ~0.30–0.40, pre-Composer release).
 *
 * Community-documented key: `aiService.prompts` — a single JSON array of all
 * prompts globally (not per-tab). Each entry has at minimum a `text` field;
 * older entries lack any tab/session identifier, so we fall back to the
 * entry's index in the array as `rawSessionId`.
 *
 * TODO(M2/B2): verify against a real Cursor v2024-Q4 `state.vscdb` dump
 * before Branch 6 ships. Schema details below reflect community
 * reverse-engineering and may need adjustment. Run
 * `scripts/dump-cursor-state.ts` on a machine with this Cursor version
 * installed to capture a verified fixture, then update the field names
 * here if they diverge.
 */

const PROMPTS_KEY = 'aiService.prompts';

interface CursorV2024Q4PromptEntry {
  /** The prompt text the user submitted. */
  text?: string;
  /** Optional command-type enum (refactor, edit, ask, etc.). Not used for capture. */
  commandType?: number;
  /** Optional timestamp; not currently used. */
  timestamp?: number;
}

export const cursorV2024Q4: ChatHistoryExtractor = {
  id: 'cursor-v2024-q4',
  label: 'Cursor v2024-Q4 (pre-Composer)',
  fingerprintKeys: [PROMPTS_KEY] as const,

  ownsKey(key: string): boolean {
    return key === PROMPTS_KEY;
  },

  decodeRow(row: ItemTableRow, sourcePath: string): ChatHistoryEvent[] {
    if (row.key !== PROMPTS_KEY) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.value);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];

    const events: ChatHistoryEvent[] = [];
    const entries = parsed as CursorV2024Q4PromptEntry[];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry || typeof entry.text !== 'string' || entry.text.length === 0) {
        continue;
      }
      events.push({
        prompt: entry.text,
        rawSessionId: `prompts-index:${i}`,
        capturedAt: new Date(),
        sourcePath,
        extractorId: 'cursor-v2024-q4',
      });
    }
    return events;
  },
};
