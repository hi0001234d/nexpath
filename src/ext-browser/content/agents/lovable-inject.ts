import { injectViaSimulatedPaste } from './inject-kit.js';

/**
 * Lovable inject-back — B5. Thin agent config over the shared inject kit.
 *
 * Separate, side-effect-free module (not part of lovable.ts) for the same reason
 * as replit-inject.ts/bolt-inject.ts: content/inject.ts imports inject-back, and
 * importing from the auto-bootstrapping capture entry would duplicate its
 * observers into inject.js's bundle (the B3 duplicate-bundling bug).
 *
 * Lovable's prompt input is a TipTap/ProseMirror contenteditable. It historically
 * carried aria-label "Chat input" (internal recon); Lovable
 * later relabelled it "Ask Lovable to create …" (confirmed live 2026-07-23), which
 * silently broke the aria-label-pinned selector → "Send to your agent" fell back to
 * clipboard-copy instead of pasting + auto-submitting.
 *
 * The selector is now a PRIORITISED FALLBACK LIST (resolved by resolveComposer in
 * inject-kit.ts): the original exact label FIRST (still authoritative if Lovable
 * reverts), then the current label prefix, then the label-independent structural
 * class as a last resort. Nothing is removed — each entry only adds resilience.
 */

const INPUT_SELECTORS = [
  '.tiptap.ProseMirror[aria-label="Chat input"]',   // original label — kept, still preferred
  '.tiptap.ProseMirror[aria-label^="Ask Lovable"]', // current label (live 2026-07-23)
  '.tiptap.ProseMirror',                            // structural fallback (label-independent)
];

// Lovable's real send control — the Enter-didn't-submit fallback clicks it.
const SUBMIT_BUTTON_SELECTOR = 'button[aria-label="Send message"]';

export async function injectPromptText(text: string): Promise<void> {
  await injectViaSimulatedPaste(INPUT_SELECTORS, text, SUBMIT_BUTTON_SELECTOR);
}
