import { injectViaSimulatedPaste } from './inject-kit.js';

/**
 * Replit inject-back — B3. Thin agent config over the shared inject kit.
 *
 * Deliberately a SEPARATE module from replit.ts, with zero top-level side effects.
 * replit.ts auto-runs bootstrap() on import (it IS the content script entry point for
 * Replit, loaded once via the manifest). content/inject.ts also needs injectPromptText,
 * but must NOT import it from replit.ts directly — esbuild's bundler (bundle: true)
 * inlines a module's entire top-level code, side effects included, into every entry
 * point that imports from it. Since inject.js and replit.js both load as separate
 * <script> tags on the same page, importing from replit.ts into inject.ts would silently
 * duplicate bootstrap()'s auto-run — two independent MutationObserver instances watching
 * the same DOM, doubling every capture. Confirmed directly: the built dist/ext-chrome/
 * content/inject.js contained a full second copy of the capture machinery before this
 * file existed.
 *
 * Replit's prompt input is CodeMirror 6 (confirmed via DOM inspection — see
 * internal recon), not a plain <textarea> — hence the
 * simulated-paste mechanism (see inject-kit.ts for why native-setter/textContent
 * writes don't work on editors with an internal model).
 */

const INPUT_SELECTOR = '.cm-content[contenteditable="true"]';

// Replit's real send control — the Enter-didn't-submit fallback clicks it.
const SUBMIT_BUTTON_SELECTOR = '[data-cy="ai-prompt-submit"]';

export async function injectPromptText(text: string): Promise<boolean> {
  // Replit's composer has a PASTE SIZE LIMIT. Measured live on a real project
  // 2026-08-26: 1,500 characters landed in full; 2,200 and 4,000 landed NOTHING,
  // silently. Real enhanced prompts are 2.1-2.5k, so every one was discarded —
  // and with a trusted clipboard paste the same size becomes a file attachment
  // instead (the `Pasted-…` chips the tester photographed).
  //
  // 800 is comfortably under the observed cliff and was the size verified live
  // to accumulate exactly (800 → 1,600 → 2,400). `execCommand('insertText')` is
  // NOT an alternative here: it was measured returning false and inserting
  // nothing on this CodeMirror 6 composer, even with the document focused.
  return await injectViaSimulatedPaste(INPUT_SELECTOR, text, SUBMIT_BUTTON_SELECTOR, {
    pasteChunkChars: 800,
    // Replit's composer is CodeMirror 6, which renders each line of a multi-line
    // prompt as its own `.cm-line`. `textContent` runs those together with no
    // separator, so the landing check could never recognise an enhanced prompt
    // that HAD arrived. Same defect, same fix, as Bolt's ProseMirror — and it is
    // the same one replit.ts's own `readComposerText` already works around on
    // the capture side. See landing-check.ts.
    useRenderedLandingText: true,
    // Deliver through CodeMirror 6's own `EditorView` transaction in the page
    // world. Measured live on a real Repl (2026-08-27) — 55 / 2,500 / 8,000
    // characters each landed with the document matching exactly, in 2-6 ms, with
    // no paste event, no clipboard, and no size rule.
    //
    // This is what lets a full enhanced prompt reach the bridge at all: the
    // bridge is normally skipped for a size-limited composer, and a real
    // enhanced prompt is always over `pasteChunkChars`, so the skip fired every
    // single time. The transaction has no size limit, so the skip no longer
    // applies to it.
    //
    // `pasteChunkChars` above stays exactly as it is — it is now the FALLBACK,
    // for a page with no editor view or a transaction that did not take, and
    // that fallback is the path already proven live on this composer.
    useEditorApiInsert: true,
    // ⛔ `useDirectInsertFirst` is deliberately NOT set here, unlike Bolt.
    //
    // It would make CodeMirror 6 receive a select-all + `execCommand('insertText')`
    // on a path where it has only ever received a paste — and the one measurement
    // we have of CM6 refusing that command was taken from the isolated world, not
    // from this page-world sequence, and was never verified live. "Returns false
    // and inserts nothing" is almost certainly harmless, but "almost certainly" is
    // not a basis for putting a new first touch on the user's composer.
    //
    // It also buys little here: the flag only reaches the bridge for a prompt
    // SHORT enough to skip chunking, and a real enhanced prompt (2.1-2.5k) is
    // always chunked, so it bypasses the bridge entirely. Replit's own route —
    // including whether the bridge can carry a chunked body at all — is decided in
    // its own phase, against a live composer. Until then Replit keeps today's
    // shipped bridge order exactly, and still gets the landing-check fix above.
  });
}
