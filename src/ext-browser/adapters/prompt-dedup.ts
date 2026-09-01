/**
 * Whitespace-insensitive prompt identity for duplicate collapse.
 *
 * The same submission is read through DIFFERENT serializations by the capture
 * channels: the composer's innerText (rich-editor line breaks), the site's
 * request body (raw newlines), and the injected-replacement marker (the panel's
 * own text). PROVEN LIVE (Bolt, 2026-08-29, F1): one "Use enhanced" send
 * produced two pipeline runs 1312 vs 1320 input tokens apart — same words,
 * different whitespace — so the kit's `lastEmittedText` guard and the worker's
 * cross-page slot (both exact `===` at the time) let the echo through and the
 * turn was billed twice.
 *
 * Whitespace runs are the only thing those serializations disagree on, so that
 * is the only thing folded away: any non-whitespace difference still counts as
 * a different prompt.
 */
export function normalizePromptForDedup(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
