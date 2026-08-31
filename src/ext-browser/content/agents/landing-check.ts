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
 * Read a composer's text the way a landing check has to see it.
 *
 * ── WHY `innerText` AND NOT `textContent` ────────────────────────────────────
 * Every composer this kit targets renders a multi-line prompt as separate BLOCK
 * elements — one `<p>` per line on TipTap/ProseMirror (Bolt, Lovable), one
 * `.cm-line` per line on CodeMirror 6 (Replit). `textContent` concatenates those
 * blocks with NO separator at all, while the text being looked for has its
 * newlines normalised to spaces. The two can never match:
 *
 *   inserted     "Scope:\n- Export one invoice"
 *   textContent  "Scope:- Export one invoice"     ← nothing between the blocks
 *   needle       "Scope: - Export one invoice"    ← the newline became a space
 *
 * Measured live on Bolt's real composer (2026-08-27) at 300 / 2,500 / 8,000 /
 * 20,000 and 50,000 characters: `textContent` failed at EVERY size while the
 * text sat perfectly in the composer, and `innerText` matched at every size.
 * This is NOT a timing problem, and no landing budget can make it pass — which
 * is what the budget being raised from 900 ms to 6 s was trying to fix.
 *
 * The capture half of this codebase already knew: `readComposerText` in bolt.ts,
 * lovable.ts and replit.ts joins `<p>` / `.cm-line` with '\n' and says exactly
 * this in its comment ("textContent alone would drop the line breaks of a
 * multi-line prompt"). The inject half never got the same treatment.
 *
 * ── WHY THE FALLBACK ─────────────────────────────────────────────────────────
 * `innerText` is layout-dependent: it is '' for an element that is not rendered.
 * Falling back to `textContent` keeps a hidden-composer read honest instead of
 * reporting an empty box — and it is also what keeps this working under jsdom,
 * which does not implement `innerText` at all.
 */
export function readLandingText(element: {
  innerText?: string;
  textContent?: string | null;
}): string {
  const rendered = typeof element.innerText === 'string' ? element.innerText : '';
  return rendered.trim().length > 0 ? rendered : (element.textContent ?? '');
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
