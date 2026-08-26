/**
 * "Did the text I inserted actually land in the composer?" — shared by the
 * isolated-world inject kit and the MAIN-world inject bridge so the two halves
 * can never disagree about what success means.
 *
 * WHY THIS EXISTS. The original check was
 *   `composer.textContent.includes(text.slice(0, 20))`
 * which asks a different question: "does the composer contain the first twenty
 * characters of what I am inserting". Two ways that lies, both reachable:
 *
 *   1. EMPTY TEXT. `''.includes('')` is `true`, so an empty insertion "landed"
 *      — and the caller then pressed Enter and clicked the site's send button.
 *      Combined with the select-all that precedes a paste, that wipes the
 *      composer and submits nothing, or submits whatever the editor kept.
 *   2. SHARED PREFIX. An enhanced prompt is a rewrite of the user's own words,
 *      so the first twenty characters routinely already sit in the composer.
 *      The chain then declared success, skipped the execCommand and clipboard
 *      fallbacks, and auto-submitted the text that was ALREADY there — the
 *      user's un-enhanced prompt — while logging that everything worked.
 *
 * The honest question is whether the WHOLE text is present. Whitespace is
 * normalised on both sides because rich editors (TipTap/ProseMirror, CodeMirror)
 * legitimately re-flow newlines and indentation when they accept a paste; they
 * do not drop or reorder the words.
 */

/** Collapse every run of whitespace to one space, then trim. */
export function normalizeForLanding(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * True only when `text` is non-blank AND the whole of it (whitespace-normalised)
 * is present in `container`. A blank `text` is never "landed" — refusing it here
 * is what stops an empty injection from reaching the auto-submit.
 */
export function hasTextLanded(containerText: string, text: string): boolean {
  const needle = normalizeForLanding(text);
  if (needle.length === 0) return false;
  return normalizeForLanding(containerText).includes(needle);
}
