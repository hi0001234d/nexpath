/**
 * Inject kit — agent-agnostic inject-back machinery shared by every browser-agent
 * content script (Replit today; Bolt/Lovable next). ZERO top-level side effects,
 * same contract as capture-kit.ts: safe to import from any entry point.
 *
 * `injectViaSimulatedPaste` covers contenteditable rich/code editors (CodeMirror,
 * ProseMirror, etc.): a "native setter" write only applies to real form elements,
 * while these editors keep an internal model separate from the DOM — directly
 * setting textContent shows text visually but leaves that model out of sync, likely
 * producing broken or reverted text on the next keystroke or re-render. Editors
 * already handle real paste events correctly, so a synthetic paste goes through
 * their own update path. Self-verified after dispatch: if the text didn't land
 * (Firefox drops a synthetic ClipboardEvent's clipboardData) it retries through
 * execCommand('insertText') — trusted input events these editors also honor — and
 * only then falls back to clipboard-copy + an on-page toast, same fallback contract
 * as a missing input. If a future agent's input turns out to be
 * a plain <textarea>, add a native-setter variant here rather than in the agent
 * file — the toast/clipboard fallback below is reusable for it as-is.
 */

import { hasTextLanded, readLandingText } from './landing-check.js';

export function showToast(message: string): void {
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    .toast {
      position: fixed; bottom: 24px; left: 24px; z-index: 2147483647;
      background: #1e1e2e; color: #cdd6f4; border: 1px solid #45475a;
      border-radius: 8px; padding: 10px 14px; font: 13px system-ui, sans-serif;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4); max-width: 320px;
    }
  `;
  shadow.appendChild(style);
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  shadow.appendChild(toast);
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 4000);
}

/**
 * A notice that STAYS until it is dismissed — for telling the user their prompt
 * is held while the enhancement is prepared.
 *
 * Separate from `showToast` on purpose. A toast auto-dismisses after 4 s, which
 * is wrong here twice over: the wait can be much longer than that, and the
 * notice must disappear the moment the popup appears rather than on a timer.
 * Only one is ever on screen; showing a second replaces the first.
 */
let stickyNoticeHost: HTMLElement | null = null;

export function showStickyNotice(message: string): void {
  dismissStickyNotice();
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    .notice {
      position: fixed; bottom: 24px; left: 24px; z-index: 2147483647;
      background: #1e1e2e; color: #cdd6f4; border: 1px solid #45475a;
      border-radius: 8px; padding: 10px 14px; font: 13px system-ui, sans-serif;
      max-width: 340px; box-shadow: 0 4px 16px rgba(0,0,0,.35);
    }
  `;
  const notice = document.createElement('div');
  notice.className = 'notice';
  notice.textContent = message;
  shadow.append(style, notice);
  document.body.appendChild(host);
  stickyNoticeHost = host;
}

export function dismissStickyNotice(): void {
  try { stickyNoticeHost?.remove(); } catch { /* already gone */ }
  stickyNoticeHost = null;
}

/**
 * Copy the text to the clipboard and toast the user to paste it manually. Used
 * internally as the paste-injection fallback, and exported for callers with no
 * agent-specific injector at all (e.g. inject.ts on a host whose inject-back
 * hasn't been built yet) — degraded-but-honest beats silently doing nothing.
 */
export async function clipboardFallback(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard — paste it into the chat input.');
  } catch {
    showToast('Could not copy automatically — please copy the option text manually.');
  }
}

/**
 * Best-effort "send directly to your agent" (CLI parity — the CLI's "Send to your
 * agent now"). After the paste lands, press Enter so the agent acts on the injected
 * prompt without the user having to hit send. Bolt and Lovable both submit on Enter.
 * Purely additive + safe: if an agent uses a different submit key or ignores
 * synthetic keys, nothing breaks — the text still sits in the composer for the user
 * to send manually, exactly as before this change.
 */
function dispatchSubmit(input: HTMLElement): void {
  const init: KeyboardEventInit = {
    key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
    bubbles: true, cancelable: true, composed: true,
  } as KeyboardEventInit;
  input.focus();
  input.dispatchEvent(new KeyboardEvent('keydown', init));
  input.dispatchEvent(new KeyboardEvent('keyup', init));
}

function focusAndSelectAll(input: HTMLElement): void {
  input.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(input);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function firePaste(input: HTMLElement, text: string): void {
  const dataTransfer = new DataTransfer();
  dataTransfer.setData('text/plain', text);
  input.dispatchEvent(new ClipboardEvent('paste', {
    clipboardData: dataTransfer,
    bubbles: true,
    cancelable: true,
  }));
}

/** Put the caret at the very end of the editor, selecting nothing. */
function collapseCaretToEnd(input: HTMLElement): void {
  input.focus();
  const range = document.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function dispatchSimulatedPaste(input: HTMLElement, text: string, chunkChars?: number): void {
  // MEASURED ON LIVE REPLIT (2026-08-26): its composer silently DROPS a paste
  // above roughly 1.5-2k characters — 1,500 chars landed in full, 2,200 and
  // 4,000 produced nothing at all, with no error and no visible change. Real
  // enhanced prompts run ~2.1-2.5k, so every one of them was being discarded.
  // (With a TRUSTED clipboard paste the same size becomes a file attachment
  // instead, which is what the tester photographed: two `Pasted-…` chips.)
  //
  // Splitting the insertion into sub-limit pieces sidesteps it entirely, and was
  // verified on that live composer: 800 → 1,600 → 2,400 characters accumulated
  // exactly, with every chunk's marker present. The first piece REPLACES the
  // composer (the user's original must go), each later one appends at the caret.
  if (chunkChars !== undefined && chunkChars > 0 && text.length > chunkChars) {
    focusAndSelectAll(input);
    firePaste(input, text.slice(0, chunkChars));
    for (let i = chunkChars; i < text.length; i += chunkChars) {
      collapseCaretToEnd(input);
      firePaste(input, text.slice(i, i + chunkChars));
    }
    return;
  }
  focusAndSelectAll(input);
  firePaste(input, text);
}

/**
 * Firefox fallback. Firefox drops a script-constructed ClipboardEvent's
 * clipboardData (security), so the simulated paste above is a silent no-op there and
 * the text never enters the editor. execCommand('insertText') emits the *trusted*
 * beforeinput/input events that ProseMirror (Bolt/Lovable) and CodeMirror (Replit)
 * both honor, and it works in Firefox. This runs ONLY after the paste failed to land,
 * so Chrome — where the paste lands on the first check — never reaches it and its
 * behavior is unchanged. execCommand is deprecated but still universally supported;
 * guarded so a throwing/absent impl routes to the clipboard fallback rather than
 * breaking injection.
 */
function insertViaExecCommand(input: HTMLElement, text: string): void {
  focusAndSelectAll(input);
  try {
    document.execCommand('insertText', false, text);
  } catch {
    /* deprecated API — the landed-check below routes to the clipboard fallback */
  }
}

function hasLanded(input: HTMLElement, text: string, useRendered: boolean): boolean {
  // Whole-text containment, not a 20-char prefix — see landing-check.ts for the
  // two false "successes" the prefix test produced (empty text, shared prefix),
  // both of which ended in auto-submitting the wrong thing.
  //
  // `useRendered` picks WHICH read of the composer that containment is asked
  // about: the rendered text, or the raw `textContent` this kit has always used.
  // See `InjectOptions.useRenderedLandingText` for why that is a per-agent
  // choice rather than a straight replacement.
  return hasTextLanded(useRendered ? readLandingText(input) : (input.textContent ?? ''), text);
}

/**
 * Resolve the agent's composer from ONE selector or a PRIORITISED LIST. Purely
 * additive over the original single-`querySelector` lookup and can never do worse:
 *   • a bare string behaves exactly as before;
 *   • a list is tried in order — the FIRST selector that matches wins, so the
 *     original/most-specific selector stays authoritative and every later entry is
 *     only a fallback for when a site renames its composer (e.g. Lovable relabelled
 *     its input's aria-label "Chat input" → "Ask Lovable…", which silently routed
 *     "Send to your agent" to the clipboard fallback);
 *   • when a selector matches several nodes, the first RENDERED one is preferred
 *     (getClientRects covers position:fixed, which offsetParent misses), hardening
 *     every agent against duplicate/off-screen editors.
 * If nothing is rendered it still returns the first raw match — so the existing
 * clipboard-fallback contract (null → clipboard) is unchanged.
 */
function resolveComposer(selectors: string | string[]): HTMLElement | null {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  let firstMatch: HTMLElement | null = null;
  for (const selector of list) {
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      firstMatch ??= el;
      if (el.getClientRects().length > 0) return el;
    }
  }
  return firstMatch;
}

/**
 * How long to wait for an insertion to become visible, scaled to the body.
 *
 * A flat 900 ms was still too short: live on Bolt AND Replit (2026-08-26)
 * 2,179- and 2,465-character enhanced prompts fell to the clipboard even though
 * the text WAS in the composer moments later — the editor simply had not
 * finished reconciling. Falling back then is the worst of both worlds: the user
 * sees a "copy it yourself" toast for text that already arrived.
 *
 * Rich editors reconcile roughly in proportion to content, so the budget does
 * too — with a floor that keeps one-line options snappy and a ceiling so a
 * pathological editor cannot stall the flow.
 */
export function landingBudgetFor(text: string): number {
  const perKb = Math.ceil(text.length / 500) * 1_000;
  return Math.min(6_000, Math.max(1_200, perKb));
}

/**
 * Wait until the text is visible in the editor, or the budget runs out. Rich
 * editors (TipTap/ProseMirror on Bolt and Lovable) process a paste through
 * their own async model — a fixed 50ms check missed slow frames on a busy
 * page for a multi-KB body. Polling keeps fast editors fast and only slow ones
 * wait.
 */
async function waitForLanding(
  input: HTMLElement,
  text: string,
  budgetMs: number,
  useRendered: boolean,
): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    if (hasLanded(input, text, useRendered)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
}

/** Diagnosability: an inject that degrades must say WHY — the clipboard toast
 * alone made the live failure undebuggable (2026-08-25). Page console only;
 * never carries the text. */
function logInjectOutcome(outcome: string, detail = ''): void {
  console.log(`[nexpath] inject-back: ${outcome}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Ask the MAIN-world script to perform the insertion inside the page's own
 * world (see main-world.ts's inject bridge): a ClipboardEvent constructed in
 * THIS isolated world crosses to the page with clipboardData rich editors
 * cannot read, so TipTap/ProseMirror never accepted the content-script paste
 * (live-diagnosed on Bolt 2026-08-25). Resolves true only on a typed 'landed'
 * reply; a missing bridge (stale page generation) times out to false and the
 * caller's own fallback chain takes over — this path can only improve delivery.
 */
function requestMainWorldInject(
  selector: string,
  text: string,
  useRendered: boolean,
  directInsertFirst: boolean,
  editorApiInsert: boolean,
  bodyExceedsPasteLimit: boolean,
): Promise<boolean> {
  return new Promise((resolve) => {
    const requestId = `nx-inject-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      window.removeEventListener('message', onReply);
      resolve(false);
    }, 1_500);
    const onReply = (ev: MessageEvent): void => {
      if (ev.source !== window) return;
      const msg = ev.data as { type?: unknown; requestId?: unknown; landed?: unknown } | null;
      if (!msg || msg.type !== 'nexpath:inject-result' || msg.requestId !== requestId) return;
      clearTimeout(timer);
      window.removeEventListener('message', onReply);
      resolve(msg.landed === true);
    };
    window.addEventListener('message', onReply);
    window.postMessage(
      {
        type: 'nexpath:inject-request',
        requestId,
        selector,
        text,
        // Both are read as `=== true` on the page side, so an older bridge that
        // does not know these fields simply ignores them and behaves as it
        // always has — the shape a page still running the previous extension
        // generation presents during an update.
        useRenderedLandingText: useRendered,
        useDirectInsertFirst: directInsertFirst,
        useEditorApiInsert: editorApiInsert,
        bodyExceedsPasteLimit,
      },
      window.location.origin,
    );
  });
}

/** How long the synthetic Enter gets to clear the composer before the button
 * fallback fires. Agents clear their composer immediately on a real send. */
const SUBMIT_SETTLE_MS = 800;
/**
 * How often the settle is re-read.
 *
 * The settle used to be a flat `await sleep(SUBMIT_SETTLE_MS)` — paid IN FULL on
 * every delivery, including the overwhelmingly common case where the site
 * cleared its composer within a frame or two of the Enter. With the insertion
 * itself now measured in single-digit milliseconds, that one sleep was the
 * largest remaining cost on the whole path.
 *
 * Polling changes only WHEN the answer is read, never what the answer is: the
 * ceiling above is untouched, so a composer that still holds the text at
 * `SUBMIT_SETTLE_MS` reaches the button fallback exactly as before.
 */
const SUBMIT_SETTLE_POLL_MS = 50;
/**
 * How many consecutive "the composer is clear" reads end the settle.
 *
 * Two, not one — and this is the reason polling is SAFER here than the single
 * read it replaces, rather than merely faster. A rich editor can momentarily
 * report empty mid-reconcile, and CodeMirror 6 renders only its viewport, so an
 * isolated read can say "cleared" about a composer that still holds the prompt.
 * Acting on that skips the button fallback and the prompt is never sent.
 *
 * The flat sleep sampled exactly ONCE, at the ceiling, and was equally exposed
 * to a bad sample — with no second look. Requiring two in a row is strictly more
 * evidence than the shipped behaviour asked for, at a cost of one poll interval.
 */
const SUBMIT_SETTLE_CLEAR_READS = 2;

/**
 * Auto-submit the landed prompt. Synthetic Enter first (Chrome-proven on all
 * three agents), then — when the composer STILL holds the text after a settle
 * — click the agent's real submit button. Firefox/Bolt live 2026-08-25: the
 * paste landed but the synthetic Enter never triggered Bolt's send, so the
 * text just sat in the composer. A synthetic button .click() runs the
 * framework's own submit handler and is not trust-gated the way editor
 * keyboard shortcuts can be.
 */
async function submitInjectedPrompt(
  input: HTMLElement,
  text: string,
  submitButtonSelector: string | undefined,
  useRendered: boolean,
): Promise<void> {
  dispatchSubmit(input);
  if (!submitButtonSelector) return;
  // Wait for the composer to clear, up to — never simply FOR — the settle.
  const deadline = Date.now() + SUBMIT_SETTLE_MS;
  let clearReads = 0;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, SUBMIT_SETTLE_POLL_MS));
    if (hasLanded(input, text, useRendered)) {
      clearReads = 0;                                  // still there — start over
    } else if (++clearReads >= SUBMIT_SETTLE_CLEAR_READS) {
      return;                                          // gone, twice — the Enter submit worked
    }
    if (Date.now() >= deadline) {
      // The ceiling, where the flat sleep took its ONE reading and returned if
      // the composer was clear. Decide the same way on the reading just taken.
      //
      // Without this, a site that clears inside the last poll window produces a
      // single clear read, which the two-read rule refuses — and the button
      // fallback then fires on a prompt that has ALREADY been sent. The extra
      // evidence is there to end the settle EARLY; at the ceiling the shipped
      // rule stands.
      if (clearReads > 0) return;
      break;
    }
  }
  const button = document.querySelector<HTMLButtonElement>(submitButtonSelector);
  if (button && !button.disabled) {
    logInjectOutcome('auto-submit via button click', 'synthetic Enter did not submit');
    button.click();
  } else {
    logInjectOutcome('auto-submit uncertain', `text still in composer and no clickable ${submitButtonSelector}`);
  }
}

export interface InjectOptions {
  /**
   * Deliver the text in pieces of at most this many characters.
   *
   * For a composer with a paste-size limit. Replit is one: measured live on a
   * real project, 1,500 characters landed in full while 2,200 and 4,000 landed
   * NOTHING — silently, no error, no visible change — and real enhanced prompts
   * are 2.1-2.5k, so every one was discarded. A trusted clipboard paste of the
   * same size becomes a file attachment instead (the tester's `Pasted-…` chips).
   *
   * Chunking was verified on that same live composer: 800 → 1,600 → 2,400
   * characters accumulated exactly. Leave unset for composers with no such limit
   * (Bolt and Lovable accept a whole 2.5k body in one paste), so their proven
   * single-paste path is untouched.
   */
  pasteChunkChars?: number;

  /**
   * Check whether an insertion landed against the composer's RENDERED text
   * (`readLandingText` → `innerText`) instead of its raw `textContent`.
   *
   * ── WHAT THIS FIXES ────────────────────────────────────────────────────────
   * `textContent` runs a multi-line prompt's block elements together with no
   * separator, so the landing check could never pass for one — at ANY prompt
   * length (measured live on Bolt at 300 … 50,000 characters, 2026-08-27). The
   * full reasoning, and the live numbers, are in landing-check.ts.
   *
   * The cost of that miss was not cosmetic: the check failing burned the whole
   * landing budget, then burned it again on the execCommand retry, degraded to
   * the clipboard fallback, and the gate then spent its own send-verification
   * window looking for text it had been told was never delivered — ending with
   * the user's ORIGINAL prompt being sent and the enhanced one discarded.
   *
   * ── WHY IT IS OPT-IN AND NOT SIMPLY THE NEW BEHAVIOUR ──────────────────────
   * It is a correctness fix and it applies equally to all three agents. It is
   * gated only because Lovable's delivery must not change in this milestone
   * (owner instruction, 2026-08-27) and Lovable reaches this kit through the
   * response-stop inject path. Bolt and Replit opt in here; Lovable is left
   * BYTE-IDENTICAL and can be migrated as its own change once the other two are
   * proven live. Absent ⇒ exactly today's behaviour, for every caller.
   */
  useRenderedLandingText?: boolean;

  /**
   * In the PAGE-WORLD bridge, try `execCommand('insertText')` BEFORE the paste
   * event rather than after it.
   *
   * ── WHAT THIS FIXES ────────────────────────────────────────────────────────
   * Both routes deliver the same text; only one of them dispatches a `paste`
   * event at the site. On Chrome a site whose paste handler cannot read the
   * event's clipboardData falls back to `navigator.clipboard.read()`, and Chrome
   * asks the user "<site> wants to — See text and images copied to the
   * clipboard". That bubble takes focus off the page, which is why delivery
   * appeared to resume only once the user answered it. Firefox never shows the
   * prompt because a script-constructed ClipboardEvent's clipboardData is
   * dropped there, so the site's paste handler never runs and the insertion
   * happens through execCommand — the route this flag selects on purpose.
   *
   * Measured on Bolt's real composer in Chrome (2026-08-27): the page-world
   * insertText landed a 2,400-character multi-line prompt exactly, in 2 ms, with
   * zero clipboard calls and no paste handler fired. Both routes are still
   * attempted, so an editor that ignores the command (measured: Replit's
   * CodeMirror 6) simply falls through to the paste, exactly as today.
   *
   * ── WHY IT IS SEPARATE FROM `useRenderedLandingText` ───────────────────────
   * They are independent concerns — that flag picks the READ, this one picks the
   * INSERTION ORDER — and keeping them apart keeps the rollback granular: this
   * can be turned off without giving up the landing-check fix.
   *
   * Opt-in per agent for the same reason as the flag above: Lovable's delivery
   * must not change in this milestone. Absent ⇒ the shipped paste-first order.
   */
  useDirectInsertFirst?: boolean;

  /**
   * In the PAGE-WORLD bridge, deliver through the composer's OWN editor instance
   * (a CodeMirror 6 `EditorView` transaction) instead of an event.
   *
   * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
   * Neither other route serves Replit. Its CodeMirror 6 composer refuses
   * `execCommand('insertText')` — measured live on a real Repl (2026-08-27:
   * returns false, inserts nothing), which is why `useDirectInsertFirst` is not
   * set there. And its paste path has a size limit, which is what forced
   * `pasteChunkChars` — a character-count rule the delivery should not need.
   *
   * A transaction has neither problem. Measured on that same live composer:
   * 55 / 2,500 / 8,000 characters all landed with the document matching exactly,
   * in 2-6 ms, with no paste event, no clipboard, and no size rule.
   *
   * ── WHAT IT CHANGES ON THIS SIDE ───────────────────────────────────────────
   * The bridge is normally skipped for a size-limited composer, because the
   * bridge pastes in one piece. This route does not paste at all, so that skip
   * no longer applies to it — see the bridge loop below. Everything else is
   * unchanged: if the page has no editor view, or the transaction does not take,
   * the bridge answers false and the existing chunked chain runs exactly as it
   * does today.
   *
   * Opt-in per agent, like the flags above. Absent ⇒ the bridge never looks for
   * an editor view, and a size-limited composer keeps skipping the bridge.
   */
  useEditorApiInsert?: boolean;
}

export async function injectViaSimulatedPaste(
  inputSelector: string | string[],
  text: string,
  submitButtonSelector?: string,
  options: InjectOptions = {},
): Promise<boolean> {
  // Blank text can never be a legitimate injection, and letting it through was
  // actively destructive: the paste path select-alls first, so an empty insert
  // WIPES whatever the user had in the composer, and the old landing check
  // reported success (`''.includes('')`), so the kit went on to press Enter and
  // click the site's send button. Refuse it at the door and say so.
  if (text.trim().length === 0) {
    logInjectOutcome('refused', 'empty inject text — composer left untouched');
    return false;
  }
  const input = resolveComposer(inputSelector);
  if (!input) {
    logInjectOutcome('clipboard fallback', `no composer matched ${JSON.stringify(inputSelector)}`);
    await clipboardFallback(text);
    return false;
  }

  // Resolved ONCE for this delivery and threaded through every landing read, so
  // one insertion can never be judged by two different rules. Absent ⇒ false ⇒
  // the raw-`textContent` read this kit has always used (see InjectOptions).
  const useRendered = options.useRenderedLandingText === true;
  const directInsertFirst = options.useDirectInsertFirst === true;
  const editorApiInsert = options.useEditorApiInsert === true;

  // Preferred path: the page-world bridge (first-class events for rich editors).
  // SKIPPED for a size-limited composer, because the bridge PASTES in one piece,
  // which is exactly what that composer drops.
  //
  // That reasoning is about the paste, so it stops applying when the caller has
  // asked for the editor-API route, which does not paste at all: it replaces the
  // document in one transaction, at any length (see useEditorApiInsert). Without
  // this, the one site that needs that route would never reach it — a real
  // enhanced prompt is always over the chunk limit, so the skip fired every time.
  //
  // Nothing is risked by trying: a page with no editor view answers false and the
  // chunked chain below runs exactly as it does today.
  const selectorList = Array.isArray(inputSelector) ? inputSelector : [inputSelector];
  const chunked = options.pasteChunkChars !== undefined && text.length > options.pasteChunkChars;
  const skipBridge = chunked && !editorApiInsert;
  for (const selector of skipBridge ? [] : selectorList) {
    if (await requestMainWorldInject(selector, text, useRendered, directInsertFirst, editorApiInsert, chunked)) {
      logInjectOutcome('landed via main-world bridge');
      await submitInjectedPrompt(input, text, submitButtonSelector, useRendered);
      return true;
    }
    if (document.querySelector(selector)) break; // selector matches; bridge tried and failed — don't retry others
  }

  const landingBudget = landingBudgetFor(text);
  dispatchSimulatedPaste(input, text, options.pasteChunkChars);
  if (await waitForLanding(input, text, landingBudget, useRendered)) {
    logInjectOutcome('landed via simulated paste');
    await submitInjectedPrompt(input, text, submitButtonSelector, useRendered);
    return true;
  }

  // Firefox: the synthetic paste is inert (see insertViaExecCommand). Retry the
  // insertion through the trusted execCommand path, then re-check. Also the
  // second chance for a rich editor that dropped the synthetic paste entirely.
  // MEASURED: `execCommand('insertText')` returns false and inserts nothing on
  // Replit's CodeMirror 6, even with the document focused — CM6 does not
  // implement the deprecated command. It is kept for the editors where it does
  // work (it is the Firefox path for plain textareas), but it is not a fallback
  // a size-limited composer can rely on.
  insertViaExecCommand(input, text);
  if (await waitForLanding(input, text, landingBudget, useRendered)) {
    logInjectOutcome('landed via execCommand');
    await submitInjectedPrompt(input, text, submitButtonSelector, useRendered);
    return true;
  }

  // LAST CHANCE before degrading. An earlier attempt may have been accepted
  // after its own budget elapsed — live, that is exactly what happened, and
  // telling the user to paste text that is already in the box is worse than
  // saying nothing. Re-read once more before giving up.
  if (hasLanded(input, text, useRendered)) {
    logInjectOutcome('landed late — submitting rather than degrading');
    await submitInjectedPrompt(input, text, submitButtonSelector, useRendered);
    return true;
  }

  logInjectOutcome('clipboard fallback', `paste did not land in <${input.tagName.toLowerCase()} class="${(input.className || '').toString().slice(0, 60)}">`);
  await clipboardFallback(text);
  return false;
}
