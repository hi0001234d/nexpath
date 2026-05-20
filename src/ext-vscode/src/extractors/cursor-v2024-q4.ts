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
 * older entries lack any tab/session identifier.
 *
 * **`rawSessionId` is a content-stable constant (`ask-mode`), NOT the
 * entry's array index.** Live-tested on Cursor 3.4.20 during M2 R3 manual
 * testing (2026-05-20): the `aiService.prompts` array is a rolling FIFO
 * (capacity ~10). When a new prompt is submitted, the oldest is dropped
 * and ALL subsequent prompts shift left by one. Using the positional
 * index as the session id meant the dedup signature
 * (`sourcePath|rawSessionId|prompt`) changed for every existing prompt
 * after each FIFO shift, causing every Cursor restart to re-emit the
 * entire backlog. Switching to a stable session id makes the signature
 * content-driven (sourcePath + prompt text), so a shifted array is
 * correctly recognised as containing the same prompts.
 *
 * Trade-off: if a user submits the *exact same text* twice within the
 * FIFO window, only the first emit fires. Layer C's session state will
 * undercount by that one prompt. Acceptable because (a) byte-identical
 * re-submission is rare in practice, (b) Layer C tolerates undercount
 * gracefully (advisory gating still functions), and (c) it's strictly
 * better than the FIFO-shift flood it replaces.
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
    for (const entry of entries) {
      if (!entry || typeof entry.text !== 'string' || entry.text.length === 0) {
        continue;
      }
      events.push({
        prompt: entry.text,
        rawSessionId: 'ask-mode',
        capturedAt: new Date(),
        sourcePath,
        extractorId: 'cursor-v2024-q4',
      });
    }
    return events;
  },
};
