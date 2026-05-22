import type { PromptRecord } from '../classifier/types.js';

/**
 * Wire-format shape of a single recent-prompt entry inside a telemetry payload.
 * Deliberately omits `text` — raw prompt content stays in `prompts` table only.
 */
export interface RecentPromptMetadata {
  index:           number;
  classifiedStage: string | null;
  confidence:      number | null;
  capturedAt:      number;
}

/**
 * Returns up to the last 5 prompts from a session's promptHistory, projected
 * to a PII-safe metadata shape. Used by `pipeline_advisory_pending` and
 * `decision_session_started` events to give server-side aggregation enough
 * context without exposing prompt text.
 */
export function recentPromptMetadata(history: PromptRecord[]): RecentPromptMetadata[] {
  return history.slice(-5).map((p) => ({
    index:           p.index,
    classifiedStage: p.classifiedStage ?? null,
    confidence:      p.confidence ?? null,
    capturedAt:      p.capturedAt,
    // text: INTENTIONALLY EXCLUDED — PII stays local in prompts table.
  }));
}
