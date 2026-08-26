import { createCaptureKit } from './capture-kit.js';
import { installSubmitGate } from './install-submit-gate.js';
import { injectPromptText } from './bolt-inject.js';

/**
 * Bolt.new capture — B4. Thin agent config over the shared capture kit.
 *
 * Recon (internal recon) confirmed — live, via automated
 * browser session 2026-07-04 — that Bolt's prompt travels in a page-context
 * `POST /api/chat/v2` (AI-SDK data stream response), so the PRIMARY channel here
 * is fetch interception (inject/main-world.ts's FETCH_CAPTURE_RULES → the kit's
 * observeFetchPrompts listener). The DOM channels below are defense-in-depth,
 * the exact inversion of Replit (where fetch/WS were non-viable and DOM is
 * primary). All channels funnel through the kit's single consecutive-identical
 * collapse, so fetch + composer + observer can never double-emit one prompt.
 */

// Bolt's chat composer is TipTap/ProseMirror (confirmed via live DOM inspection:
// div.tiptap.ProseMirror[role="textbox"], aria-label "How can Bolt help you
// today? (or /command)"). Library class names — stable across deploys, same
// reasoning as Replit's cm-content.
//
// ⚠️ Critical inversion vs Replit: on Bolt, `.cm-content` (CodeMirror) EXISTS but
// is the FILE editor, and three xterm terminal <textarea>s are also present.
// Replit's composer selector would capture file contents here — per-agent config
// is what prevents that, plus the kit's send-button anchoring guard.
const COMPOSER_SELECTOR = '.tiptap.ProseMirror';

// Both button states confirmed live 2026-07-04 by sampling during a real
// generation: idle = aria-label "Send message" (disabled ⇔ composer empty, NOT a
// generation signal — same semantics as Replit); generating = the button is
// replaced by aria-label "Stop generation". Stable aria-labels, better anchors
// than Bolt's deploy-hashed CSS-module classes.
const SUBMIT_BUTTON_SELECTOR = 'button[aria-label="Send message"]';
const STOP_BUTTON_SELECTOR = 'button[aria-label="Stop generation"]';

// User-message bubbles have NO test-id; the confirmed ancestry is
// p → div._MarkdownContent_<hash> → … → div.grid.grid-col-1.self-end (user
// messages are self-end aligned; agent replies are markdown too but not
// self-end). The `_MarkdownContent_` prefix partial-match survives the deploy
// hash suffix changing. Confirmed identical for live-typed AND hydrated messages
// (unlike Replit) — still only the TERTIARY channel here.
const USER_MESSAGE_SELECTOR = '.self-end [class*="_MarkdownContent_"]';

const CAPTURE_TIER = 'fetch';

function extractPromptText(el: Element): string {
  return (el.textContent ?? '').trim();
}

function readComposerText(input: HTMLElement): string {
  // TipTap renders one <p> per line; textContent alone would drop the line
  // breaks of a multi-line prompt. Its empty-state placeholder is CSS-rendered
  // (::before), not real text, so an empty composer correctly reads as '' —
  // no placeholder-capture guard needed (unlike Replit's CodeMirror).
  const lines = Array.from(input.querySelectorAll('p'), (p) => p.textContent ?? '');
  const joined = (lines.length > 0 ? lines.join('\n') : (input.textContent ?? '')).trim();
  return joined;
}

const kit = createCaptureKit({
  agent: 'bolt',
  captureTier: CAPTURE_TIER,
  bootstrapFlag: '__nexpathBoltBootstrapped',
  userMessageSelector: USER_MESSAGE_SELECTOR,
  extractPromptText,
  stopButtonSelector: STOP_BUTTON_SELECTOR,
  composer: {
    composerSelector: COMPOSER_SELECTOR,
    submitButtonSelector: SUBMIT_BUTTON_SELECTOR,
    readComposerText,
  },
  // A "Version N at <time>" card appears in the chat when a turn completes
  // (confirmed live for a pure Q&A turn — "Version 2 at Jul 04 3:44 PM").
  // Independent second response-stop signal, same role as Replit's "Worked for".
  completionLabel: {
    pattern: /\bVersion \d+ at\b/,
    maxTextLength: 50,
    log: '[nexpath] response-stop detected (Version card appeared)',
  },
  listenForFetchPrompts: true,
});

// Re-exported for tests, mirroring replit.ts's stable agent-named surface.
export const observeUserMessages = kit.observeUserMessages;
export const observeComposerSubmit = kit.observeComposerSubmit;
export const observeStopButton = kit.observeStopButton;
export const observeVersionLabel = kit.observeCompletionLabel;
export const observeFetchPrompts = kit.observeFetchPrompts;
export const bootstrap = kit.bootstrap;
export const __resetResponseStopDedupForTests = kit.resetResponseStopDedupForTests;
export const __resetPromptCaptureStateForTests = kit.resetPromptCaptureStateForTests;

// Inject-back lives in ./bolt-inject.ts (side-effect-free), NOT here — this file
// auto-runs bootstrap() at import time, and content/inject.ts must be able to
// import inject-back without esbuild inlining that auto-run into its own bundle
// (the exact duplicate-bundling bug B3 hit — see replit-inject.ts's header).

// ── Submit-time gate installation ────────────────────────────────────────────
//
// Cancels the composer submit, holds for the popup, then sends exactly ONE
// prompt: the modified one if the user accepted it, otherwise the original.
// Inert unless the switch is armed. See content/composer-submit-gate.ts for why
// this replaced the request-body rewrite — live testing showed Bolt renders its
// user bubble optimistically at submit AND abandons a chat after 30s, both of
// which cancelling at the composer avoids by construction.
installSubmitGate({
  agent: 'bolt',
  submitButtonSelector: SUBMIT_BUTTON_SELECTOR,
  injectPromptText,
});

// Import-time auto-bootstrap. Capture its teardown so a test that imports this module
// (which triggers the auto-run) can dispose the long-lived observers + 1.5s poll
// interval instead of leaking them past its jsdom-environment teardown. Production
// ignores it — the content script runs for the page's whole lifetime.
let autoBootstrapTeardown: (() => void) | undefined;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { autoBootstrapTeardown = bootstrap(); });
} else {
  autoBootstrapTeardown = bootstrap();
}
export const __teardownAutoBootstrapForTests = (): void => autoBootstrapTeardown?.();
