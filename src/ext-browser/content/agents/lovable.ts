import { createCaptureKit } from './capture-kit.js';
import { installSubmitGate } from './install-submit-gate.js';
import { injectPromptText } from './lovable-inject.js';

/**
 * Lovable capture — B5. Thin agent config over the shared capture kit.
 *
 * Recon (internal recon) confirmed — live, via automated
 * browser session 2026-07-06 — that Lovable's prompt travels in a page-context
 * `POST https://api.lovable.dev/projects/<uuid>/chat` (flat `message` field;
 * the devplan's WebSocket guess was wrong), so the PRIMARY channel is fetch
 * interception, same as Bolt. The DOM channels below are defense-in-depth.
 * All channels funnel through the kit's single consecutive-identical collapse.
 *
 * Lovable-specific flow note: the dashboard → new-project transition is a HARD
 * navigation (unlike Bolt/Replit soft-navs), so dashboard-typed creation prompts
 * depend on the injector's sessionStorage-backed rejected-capture stash for
 * delivery — nothing in this file needs to special-case it.
 */

// Composer is TipTap/ProseMirror (same editor family as Bolt), confirmed live on
// BOTH the dashboard creation box and the in-project composer. `aria-label`
// "Chat input" is Lovable's own semantic handle — more specific than the bare
// library classes, and stable across CSS-hash deploys.
const COMPOSER_SELECTOR = '.tiptap.ProseMirror[aria-label="Chat input"]';

// Both button states confirmed live across two real generations: idle =
// aria-label "Send message" (disabled ⇔ composer empty — NOT a generation
// signal); generating = the button is REPLACED by aria-label "Stop generating"
// (element swap, Bolt-style).
const SUBMIT_BUTTON_SELECTOR = 'button[aria-label="Send message"]';
const STOP_BUTTON_SELECTOR = 'button[aria-label="Stop generating"]';

// Every chat message carries data-message-id="main:agent#<seq>#usr:<hash>" for
// USER messages (assistant = "#ast:"). Semantic attributes, confirmed IDENTICAL
// for live-typed and server-hydrated renders (checked before and after a full
// page reload) — no Replit-style dual-render-path trap.
const USER_MESSAGE_SELECTOR = '[data-message-id*="#usr"]';

const CAPTURE_TIER = 'fetch';

function extractPromptText(el: Element): string {
  // The bubble's outer textContent includes the "Today at 5:08 PM" timestamp —
  // the message body lives in an inner div.prose (confirmed
  // `div.prose[data-selectable="true"]`), so read that and only fall back to the
  // bubble text if the prose node is missing.
  const prose = el.querySelector('.prose');
  return ((prose ?? el).textContent ?? '').trim();
}

function readComposerText(input: HTMLElement): string {
  // TipTap renders one <p> per line (same behavior confirmed on Bolt); the
  // empty-state placeholder is CSS-rendered, so an empty composer reads as ''.
  const lines = Array.from(input.querySelectorAll('p'), (p) => p.textContent ?? '');
  const joined = (lines.length > 0 ? lines.join('\n') : (input.textContent ?? '')).trim();
  return joined;
}

const kit = createCaptureKit({
  agent: 'lovable',
  captureTier: CAPTURE_TIER,
  bootstrapFlag: '__nexpathLovableBootstrapped',
  userMessageSelector: USER_MESSAGE_SELECTOR,
  extractPromptText,
  stopButtonSelector: STOP_BUTTON_SELECTOR,
  composer: {
    composerSelector: COMPOSER_SELECTOR,
    submitButtonSelector: SUBMIT_BUTTON_SELECTOR,
    readComposerText,
  },
  // completionLabel deliberately OMITTED: Lovable has no "Worked for"/version-card
  // style completion text — turn completion renders an edit card whose title verb
  // varies ("Added…"/"Built…"), too fragile for a signal (recon §5). The
  // stop-button observer + the kit's poll safety net are the single stop source.
  listenForFetchPrompts: true,
  // CRITICAL (confirmed live 2026-07-06): Lovable re-renders/re-creates its chat
  // message DOM nodes throughout a generation turn, so the rendered-message
  // observer channel re-captures already-sent history messages every sweep,
  // exploding promptCount (13+ from one prompt). Lovable's genuine prompt is
  // captured exactly once by the composer channel (on Enter) AND the fetch channel
  // (POST /projects/<id>/chat), which the funnel collapses to a single emit — so
  // the observer is redundant here, not just noisy. Disable it. See CaptureKitConfig.
  observeRenderedMessages: false,
});

// Re-exported for tests, mirroring replit.ts/bolt.ts's stable agent-named surface.
export const observeUserMessages = kit.observeUserMessages;
export const observeComposerSubmit = kit.observeComposerSubmit;
export const observeStopButton = kit.observeStopButton;
export const observeFetchPrompts = kit.observeFetchPrompts;
export const bootstrap = kit.bootstrap;
export const __resetResponseStopDedupForTests = kit.resetResponseStopDedupForTests;
export const __resetPromptCaptureStateForTests = kit.resetPromptCaptureStateForTests;

// Inject-back lives in ./lovable-inject.ts (side-effect-free), NOT here — this
// file auto-runs bootstrap() at import time, and content/inject.ts must be able
// to import inject-back without esbuild inlining that auto-run into its own
// bundle (the B3 duplicate-bundling bug).

// ── Submit-time gate installation ────────────────────────────────────────────
//
// Cancels the composer submit, holds for the popup, then sends exactly ONE
// prompt: the modified one if the user accepted it, otherwise the original.
// Inert unless the switch is armed. See content/composer-submit-gate.ts for why
// this replaced the request-body rewrite — live testing showed Bolt renders its
// user bubble optimistically at submit AND abandons a chat after 30s, both of
// which cancelling at the composer avoids by construction.
installSubmitGate({
  agent: 'lovable',
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
