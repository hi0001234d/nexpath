/**
 * Runs in the MAIN world (injected via <script> tag from main-world-injector.ts).
 *
 * Responsibilities:
 *   - Patch window.fetch to detect when the agent's prompt submission endpoint
 *     is called, extract the prompt text, and emit postMessage to the content script.
 *
 * NOTE: Actual fetch-interception patterns per agent site (Replit/Bolt/Lovable)
 * are implemented in B3/B4/B5. This file establishes the MAIN-world entry point
 * and the postMessage emit helper only.
 */

import { resolveAgentFromHostname } from '../content/agents/agent-hosts.js';
import { hasTextLanded, readLandingText } from '../content/agents/landing-check.js';
import { setupSubmitFlowPage, SUBMIT_FLOW_EVENT_TYPE } from './submit-flow-page.js';
import { createSubmitGate } from './submit-gate.js';
import { createDecisionChannel } from './submit-decision-channel.js';
import { rewriteBodyForAgent, withReplacedBody, fetchGateOwnsSite } from './submit-substitution.js';

type PromptCapturedMsg = {
  type: 'nexpath:prompt-captured';
  promptText: string;
  agent: string;
};

type ResponseStoppedMsg = {
  type: 'nexpath:response-stopped';
  agent: string;
};

/** Emit a captured prompt to the ISOLATED content script world. */
export function emitPromptCaptured(promptText: string, agent: string): void {
  const msg: PromptCapturedMsg = { type: 'nexpath:prompt-captured', promptText, agent };
  // Use location.origin (not '*') so the message is only delivered to this page.
  window.postMessage(msg, window.location.origin);
}

/** Emit a response-stopped event to the ISOLATED content script world. */
export function emitResponseStopped(agent: string): void {
  const msg: ResponseStoppedMsg = { type: 'nexpath:response-stopped', agent };
  window.postMessage(msg, window.location.origin);
}

// ── Fetch-interception rules (per agent, recon-confirmed transports only) ─────
//
// B4 (Bolt) is the first real consumer: recon confirmed the prompt travels in a
// page-context `POST /api/chat/v2` whose JSON body carries the full `messages`
// history with the newest entry `{role:'user', content:'<prompt string>'}` — see
// internal recon. Replit deliberately has NO rule here (its
// chat is binary MessagePack over WS — fetch confirmed non-viable in B3 recon).
//
// The extracted prompt is posted as `nexpath:fetch-prompt` — a DISTINCT message
// type that main-world-injector.ts does NOT forward. Only the agent's capture kit
// listens for it (capture-kit.ts observeFetchPrompts) and routes the text through
// its single emitIfNewText funnel, so this channel can never double-emit a prompt
// the composer/observer channels also saw.

export interface FetchCaptureRule {
  agent: string;
  /** Substring the request URL must contain (matched only for POSTs on this agent's host). */
  urlIncludes: string;
  /**
   * Optional exact-path guard: the URL's pathname must END with this string.
   * B4's lesson made concrete — a bare substring matched Bolt's project-persist
   * endpoint and replayed historical prompts; when an agent's API has sibling
   * endpoints (Lovable: `/projects/<id>/chat` vs other `/projects/<id>/…` calls),
   * pin the pathname tail instead of widening the substring.
   */
  pathEndsWith?: string;
  /** Extract the newest user prompt from the raw request body, or null to ignore. */
  extractPrompt(bodyText: string): string | null;
}

/**
 * Extract the newest `{role:'user'}` message's string content from an AI-SDK-style
 * `{messages: [...]}` JSON body. Walks backwards so trailing non-user entries
 * (assistant placeholders, tool results) never shadow the real prompt.
 */
export function extractLastUserMessage(bodyText: string): string | null {
  try {
    const parsed = JSON.parse(bodyText) as { messages?: Array<{ role?: unknown; content?: unknown }> };
    if (!Array.isArray(parsed.messages)) return null;
    for (let i = parsed.messages.length - 1; i >= 0; i--) {
      const m = parsed.messages[i];
      if (m && m.role === 'user' && typeof m.content === 'string') {
        const text = m.content.trim();
        return text.length > 0 ? text : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract the prompt from Lovable's chat POST body. Strict shape guard (B4
 * lesson): `{"id":"umsg_…","message":"<prompt>", …}` — both conditions must hold
 * so any lookalike endpoint or non-user payload yields null instead of a capture.
 * Confirmed live 2026-07-06 (internal recon).
 */
export function extractLovableMessage(bodyText: string): string | null {
  try {
    const parsed = JSON.parse(bodyText) as { id?: unknown; message?: unknown };
    if (typeof parsed.id !== 'string' || !parsed.id.startsWith('umsg_')) return null;
    if (typeof parsed.message !== 'string') return null;
    const text = parsed.message.trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

export const FETCH_CAPTURE_RULES: FetchCaptureRule[] = [
  // '/api/chat/v2' exactly — NOT the broader '/api/chat' substring. Bolt also POSTs
  // its project-persist payload to /api/chats/<id> (matches the substring, carries
  // the full messages history); on a page load with unsaved state that persist call
  // re-captures the LAST HISTORICAL user prompt and fires a spurious advisory with
  // zero user action (observed live 2026-07-06). Only the generation endpoint
  // carries a prompt the user just submitted.
  { agent: 'bolt', urlIncludes: '/api/chat/v2', extractPrompt: extractLastUserMessage },
  // Lovable: POST https://api.lovable.dev/projects/<uuid>/chat — pathname tail
  // pinned exactly (§ pathEndsWith doc above), body shape guarded in the extractor.
  { agent: 'lovable', urlIncludes: 'api.lovable.dev/projects/', pathEndsWith: '/chat', extractPrompt: extractLovableMessage },
];

export function emitFetchPrompt(promptText: string, agent: string): void {
  window.postMessage(
    { type: 'nexpath:fetch-prompt', promptText, agent },
    window.location.origin,
  );
}

/**
 * Which capture rule (if any) this request matches — SYNCHRONOUSLY.
 *
 * Extracted so the gated path can ask "is this a submit?" without reading the
 * body, and so the ungated path's decision stays a cheap sync check. Body
 * reading (the only async part) stays where it was.
 */
export function resolveFetchRule(
  input: RequestInfo | URL,
  init?: RequestInit,
): { rule: FetchCaptureRule; agent: string } | null {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (
    init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')
  ).toUpperCase();
  if (method !== 'POST') return null;
  const agent = resolveAgentFromHostname(window.location.hostname);
  const rule = FETCH_CAPTURE_RULES.find((r) => {
    if (r.agent !== agent || !url.includes(r.urlIncludes)) return false;
    if (r.pathEndsWith !== undefined) {
      try {
        if (!new URL(url, window.location.origin).pathname.endsWith(r.pathEndsWith)) return false;
      } catch {
        return false;
      }
    }
    return true;
  });
  return rule ? { rule, agent } : null;
}

/** Read the request body as text without consuming the page's own copy. */
async function readBodyText(input: RequestInfo | URL, init?: RequestInit): Promise<string | null> {
  const direct = typeof init?.body === 'string' ? init.body : null;
  if (direct !== null) return direct;
  if (input instanceof Request) {
    try {
      return await input.clone().text();
    } catch {
      return null;
    }
  }
  return null;
}

async function maybeCaptureFetch(input: RequestInfo | URL, init?: RequestInit): Promise<void> {
  const matched = resolveFetchRule(input, init);
  if (!matched) return;
  const bodyText = await readBodyText(input, init);
  if (!bodyText) return;
  const prompt = matched.rule.extractPrompt(bodyText);
  if (prompt) emitFetchPrompt(prompt, matched.agent);
}

const _nativeFetch = window.fetch.bind(window);

/**
 * Stable id for one submission, derived from its text.
 *
 * Content-derived rather than a counter, because the claim's job is to collapse
 * DUPLICATE OBSERVATIONS of one submission (a retried request, a second
 * listener) into one decision. Trade-off, stated: deliberately submitting the
 * identical text twice in one page session also collapses — the same accepted
 * limitation the service worker's cross-page dedup already carries.
 */
function submitIdFor(prompt: string): string {
  let h = 5381;
  for (let i = 0; i < prompt.length; i++) h = ((h << 5) + h + prompt.charCodeAt(i)) | 0;
  return `s${(h >>> 0).toString(36)}:${prompt.length}`;
}

/**
 * The gated path. Reached ONLY when the switch is armed and the URL matched a
 * capture rule; everything else takes the untouched path above.
 *
 * Fail-open is absolute here: every branch, including a body that cannot be
 * read or a prompt that cannot be extracted, ends in the original request going
 * out with its original arguments.
 */
async function gatedFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  matched: { rule: FetchCaptureRule; agent: string },
): Promise<Response> {
  const send = (): Promise<Response> => _nativeFetch(input, init);
  try {
    const bodyText = await readBodyText(input, init);
    const prompt = bodyText === null ? null : matched.rule.extractPrompt(bodyText);
    if (prompt === null || bodyText === null) return send();

    // Emit exactly as the ungated path does, so the existing submit pipeline
    // (classification, PE prepare) sees this prompt identically.
    emitFetchPrompt(prompt, matched.agent);

    /**
     * Deliver the replacement as ONE request with the prompt field rewritten.
     * Throwing here is the documented way to fall back: the gate catches it and
     * sends the original, so an unrewritable body can never lose the prompt.
     */
    const sendReplacement = (replacement: string): Promise<Response> => {
      const newBody = rewriteBodyForAgent(matched.agent, bodyText, replacement);
      if (newBody === null) throw new Error('body not rewritable');
      const [nextInput, nextInit] = withReplacedBody(input, init, newBody);
      if (nextInput === input && nextInit === init) throw new Error('body shape not supported');
      return _nativeFetch(nextInput, nextInit);
    };

    return await submitGate.runGatedSubmit(
      { prompt, submitId: submitIdFor(prompt) },
      send,
      sendReplacement,
    );
  } catch {
    return send();
  }
}

window.fetch = function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  // The gate is the FIRST thing evaluated, and it is two cheap synchronous
  // checks. When the switch is disarmed — which is every user today, and every
  // user forever if the flow is reverted — the code below this point is exactly
  // what shipped before: fire-and-forget capture, then the native call with the
  // original arguments, never delayed or altered.
  // Two conditions, both cheap and synchronous: the switch is armed, AND this
  // site is one the FETCH patch owns. Sites gated at the composer instead (Bolt,
  // Lovable — see submit-substitution.ts) must fall through to the untouched
  // path here, or one submission would be decided twice.
  const matched = submitFlow.isArmed() ? resolveFetchRule(input, init) : null;
  if (matched !== null && fetchGateOwnsSite(matched.agent)) {
    return gatedFetch(input, init, matched);
  }

  // Fire-and-forget: capture must never delay, alter, or break the page's own
  // request — the native call goes out immediately regardless of what the
  // capture path does, and any capture error is swallowed after being isolated.
  void maybeCaptureFetch(input, init).catch(() => {});
  return _nativeFetch(input, init);
};

// ── Submit-flow switch + gate, page-world side ───────────────────────────────
//
// Declared AFTER the fetch patch so that installing the patch — the thing that
// must not miss an early request — is the first side effect this module has.
//
// `patchedFetch` above closes over both bindings. That is safe, not a temporal
// dead-zone bug: module top-level runs to completion synchronously, and nothing
// between the patch assignment and these lines yields, so no page code can call
// fetch before they are initialised. Do not "fix" this by hoisting them above
// the patch — that would delay the patch for no benefit.
const submitFlow = setupSubmitFlowPage();

/**
 * Ring-event sink for the gated path: page → content script → service worker,
 * where it lands in the durable event buffer. One-way and best-effort; the gate
 * already treats a failing emit as harmless.
 */
function emitSubmitFlowEvent(event: string, data?: Record<string, unknown>): void {
  try {
    window.postMessage(
      { type: SUBMIT_FLOW_EVENT_TYPE, event, data: data ?? {} },
      window.location.origin,
    );
  } catch {
    /* diagnostics only */
  }
}

/**
 * The verdict comes from the service worker, relayed by the content script and
 * delivered back page-direct. The channel never rejects and has no timeout of
 * its own — the gate's hold budget is the single ceiling, so a service worker
 * that dies mid-decision simply lets the hold expire and the original go.
 */
const decisionChannel = createDecisionChannel();

const submitGate = createSubmitGate({
  decide: (ctx) => decisionChannel.request(ctx),
  emit: emitSubmitFlowEvent,
});

// Expose helpers so per-agent modules (loaded separately) can call them.
(globalThis as Record<string, unknown>)['__nexpath_submit_flow__'] = submitFlow;
(globalThis as Record<string, unknown>)['__nexpath_emit_prompt__'] = emitPromptCaptured;
(globalThis as Record<string, unknown>)['__nexpath_emit_stopped__'] = emitResponseStopped;
(globalThis as Record<string, unknown>)['__nexpath_native_fetch__'] = _nativeFetch;

// ── MAIN-world inject bridge (2026-08-25) ────────────────────────────────────
//
// Rich editors (TipTap/ProseMirror on Bolt and Lovable) read the paste event's
// `clipboardData` — and a ClipboardEvent CONSTRUCTED IN THE ISOLATED WORLD
// crosses the world boundary with clipboardData the page cannot read, so the
// content script's simulated paste never lands there (live-diagnosed: 'paste
// did not land in <div class="tiptap ProseMirror">'; earlier successes were
// the execCommand fallback, which is focus-fragile). Performing the same
// insertion HERE — the page's own world — gives the editor a first-class
// event. The content script requests it via postMessage and receives a typed
// landed/failed reply; on 'failed' (or no reply) it keeps its own fallback
// chain, so this bridge can only ever improve delivery.
//
// Trust boundary: the request carries a CSS selector + text into the page
// world — both already visible to the page (the text is about to be typed
// into the page's own composer), so nothing new is exposed.

interface InjectRequestMsg {
  type: 'nexpath:inject-request';
  requestId: string;
  selector: string;
  text: string;
  /** See `useRendered` below. Absent ⇒ false ⇒ the shipped raw read. */
  useRenderedLandingText?: boolean;
  /** See `directInsertFirst` below. Absent ⇒ false ⇒ the shipped paste-first order. */
  useDirectInsertFirst?: boolean;
  /** See `editorApiInsert` below. Absent ⇒ false ⇒ the bridge never looks for an editor view. */
  useEditorApiInsert?: boolean;
  /**
   * True when this body is longer than the composer's paste size limit, so a
   * whole-body paste would be DROPPED. Absent ⇒ false ⇒ pasting is safe, which
   * is the case for every composer that has no such limit.
   */
  bodyExceedsPasteLimit?: boolean;
}

/**
 * The slice of CodeMirror 6's `EditorView` this file uses. Deliberately tiny —
 * the shape is structurally checked at runtime before anything is called, so a
 * future CM version that no longer matches simply fails the guard and the
 * caller's own delivery chain takes over.
 */
interface EditorViewLike {
  state: { doc: { length: number; toString(): string } };
  dispatch(spec: { changes: { from: number; to: number; insert: string } }): void;
}

/**
 * Find the composer's own editor instance, if it exposes one.
 *
 * CodeMirror 6 hangs its view off the content DOM node as a `cmView` expando.
 * That is a PAGE-WORLD property: a content script can reach the element but not
 * this field, which is exactly why this route has to live in this file.
 *
 * Every step is guarded. `cmView` may be the view itself or a wrapper carrying
 * `.view`, depending on the build, and either may be absent entirely — an
 * unrecognised shape returns null rather than throwing.
 */
function resolveEditorView(input: HTMLElement): EditorViewLike | null {
  const holder = (input as unknown as { cmView?: unknown }).cmView;
  if (!holder || typeof holder !== 'object') return null;
  const candidate = (holder as { view?: unknown }).view ?? holder;
  if (!candidate || typeof candidate !== 'object') return null;
  const view = candidate as Partial<EditorViewLike>;
  if (typeof view.dispatch !== 'function') return null;
  if (!view.state || typeof view.state.doc?.length !== 'number') return null;
  return view as EditorViewLike;
}

/**
 * Replace the composer's whole document through the editor's own API.
 *
 * ── WHY THIS ROUTE EXISTS ────────────────────────────────────────────────────
 * Neither of the other two routes serves Replit. Its CodeMirror 6 composer
 * REFUSES `execCommand('insertText')` — measured live on a real Repl
 * (2026-08-27): returns false and inserts nothing, confirming the same result
 * recorded months earlier. And its paste path carries a size limit that forces
 * the delivery to be split into sub-limit pieces, which is a character-count
 * rule the delivery is not supposed to need.
 *
 * A transaction has neither problem. Measured on that same live composer:
 *
 *     55 chars    2 ms     doc matched exactly
 *     2,500 chars 6 ms     doc matched exactly
 *     8,000 chars 3 ms     doc matched exactly
 *
 * No paste event, no clipboard, no execCommand, and no size rule — the same
 * single call regardless of how long the user's prompt is.
 *
 * ── WHY IT VERIFIES AGAINST THE DOCUMENT, NOT THE DOM ────────────────────────
 * CodeMirror 6 VIRTUALISES: it renders only the lines in view. On that live
 * composer an 8,000-character body rendered 27 of roughly 337 lines, so any
 * DOM-based landing check — `innerText` included — reports a body that size as
 * missing when it is perfectly present. The editor's own document has no
 * viewport, so asking it is both cheaper and correct at any length.
 */
function insertViaEditorApi(input: HTMLElement, text: string): boolean {
  const view = resolveEditorView(input);
  if (!view) return false;
  try {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  } catch {
    return false;
  }
  // `state` is re-read here on purpose: CodeMirror's state is immutable, so this
  // is the NEW document produced by the transaction, not the one dispatched to.
  return hasTextLanded(view.state.doc.toString(), text);
}

/** Put the caret across the whole composer, so an insertion REPLACES it. */
function selectAllIn(input: HTMLElement): void {
  input.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(input);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** The trusted-editing command path: synchronous, and never touches a clipboard. */
function insertTextIn(input: HTMLElement, text: string): void {
  selectAllIn(input);
  try { document.execCommand('insertText', false, text); } catch { /* the caller re-checks */ }
}

/** The first-class paste path: what a rich editor's own paste handler consumes. */
function firePasteIn(input: HTMLElement, text: string): void {
  selectAllIn(input);
  const dataTransfer = new DataTransfer();
  dataTransfer.setData('text/plain', text);
  input.dispatchEvent(new ClipboardEvent('paste', {
    clipboardData: dataTransfer,
    bubbles: true,
    cancelable: true,
  }));
}

/**
 * Insert `text` into the page's own composer, from the page's own world.
 *
 * ── `directInsertFirst`: WHY THE ORDER MATTERS ──────────────────────────────
 * Both mechanisms below deliver the same text. They differ in one respect that
 * is invisible from here and very visible to the user: the paste path dispatches
 * a `paste` event AT THE SITE, and the insertText path does not.
 *
 * On Chrome that difference is what raises a permission prompt. A site whose
 * paste handler receives an event it cannot read the clipboardData of falls back
 * to `navigator.clipboard.read()` to find out what was pasted, and Chrome then
 * asks the user "<site> wants to — See text and images copied to the clipboard".
 * The bubble takes focus off the page, which is why injection appeared to resume
 * only once the user answered it. Firefox never shows it, because a
 * script-constructed ClipboardEvent's clipboardData is dropped there entirely,
 * so the site's paste handler never runs and our code reaches execCommand
 * instead — the same route this flag selects, deliberately, on Chrome.
 *
 * MEASURED on Bolt's real ProseMirror composer in Chrome (2026-08-27): a
 * page-world `execCommand('insertText')` of a 2,400-character multi-line prompt
 * returned true, landed the whole text exactly (10 paragraphs, blank lines
 * preserved), took 2 ms, made ZERO clipboard calls, and never fired the site's
 * paste handler.
 *
 * ── WHY THIS STAYS SYNCHRONOUS ───────────────────────────────────────────────
 * Both mechanisms apply synchronously — the same measurement shows the composer
 * already carrying the text on the very next statement. An earlier reading of
 * these failures as "the editor has not finished reconciling" was wrong: what
 * failed was the READ (`textContent` on a multi-line prompt — see
 * landing-check.ts), not the timing. Nothing here needs to wait.
 *
 * ── FAIL-OPEN IS UNCHANGED ───────────────────────────────────────────────────
 * Whichever order is taken, both mechanisms are attempted, and a false return
 * hands the delivery back to the content script's own fallback chain exactly as
 * before. This bridge can still only improve delivery, never block it.
 */
function performMainWorldInject(
  selector: string,
  text: string,
  useRendered: boolean,
  directInsertFirst: boolean,
  editorApiInsert: boolean,
  bodyExceedsPasteLimit: boolean,
): boolean {
  // Blank text is never a real injection and both paths select-all first, so
  // honouring it would wipe the user's composer (see landing-check.ts).
  if (text.trim().length === 0) return false;
  const candidates = [...document.querySelectorAll<HTMLElement>(selector)];
  const input = candidates.find((el) => el.getClientRects().length > 0) ?? candidates[0];
  if (!input) return false;

  if (editorApiInsert) {
    if (insertViaEditorApi(input, text)) return true;
    // No editor view, or the transaction did not take.
    //
    // Whether it is safe to carry on depends entirely on ONE thing: would the
    // whole-body paste below survive this composer? The caller that asks for
    // this route is the one with a paste SIZE LIMIT, and that paste select-alls
    // first — so for an over-limit body, attempting it would leave the user's
    // own prompt deleted and nothing put in its place. Refuse, and hand the
    // delivery back to the caller's chunked chain, which is proven live there.
    if (bodyExceedsPasteLimit) return false;
    // Within the limit, the paste is exactly as safe as it was before this route
    // existed — and before it existed, this is the path that delivered. Falling
    // through keeps that, so a page that stops exposing an editor view degrades
    // to the shipped behaviour rather than to the clipboard.
  }

  // Which read decides "landed". Resolved once so the two attempts below can
  // never be judged by different rules. See landing-check.ts for why the raw
  // `textContent` read cannot recognise a multi-line prompt, and
  // InjectOptions.useRenderedLandingText for why the fix is opt-in per agent.
  const landed = (): boolean =>
    hasTextLanded(useRendered ? readLandingText(input) : (input.textContent ?? ''), text);

  if (directInsertFirst) {
    insertTextIn(input, text);
    if (landed()) return true;
    // The editor does not honour the command (measured: Replit's CodeMirror 6
    // returns false and inserts nothing). Fall through to the paste it does
    // honour — the select-all inside replaces anything partially inserted.
    firePasteIn(input, text);
    return landed();
  }

  // Shipped order, byte-identical: paste first, then the trusted-editing retry.
  // Each attempt re-selects — without it the insert lands at the caret and the
  // composer ends up holding OLD TEXT + NEW TEXT, which the landing check would
  // then pass and the caller would auto-submit.
  firePasteIn(input, text);
  if (landed()) return true;
  insertTextIn(input, text);
  return landed();
}

// Guarded like the fetch patch above: the module must load under partial
// window fakes (unit tests) — the bridge only registers where listeners exist.
if (typeof window.addEventListener === 'function') {
  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const msg = ev.data as InjectRequestMsg | null;
    if (!msg || msg.type !== 'nexpath:inject-request') return;
    if (typeof msg.requestId !== 'string' || typeof msg.selector !== 'string' || typeof msg.text !== 'string') return;
    // Both flags default OFF, so a request from an older content script — the
    // real case during an extension update, when the page still holds the
    // previous generation's script — is answered exactly as it always was.
    const useRendered = msg.useRenderedLandingText === true;
    const directInsertFirst = msg.useDirectInsertFirst === true;
    const editorApiInsert = msg.useEditorApiInsert === true;
    const bodyExceedsPasteLimit = msg.bodyExceedsPasteLimit === true;
    let landed = false;
    try {
      landed = performMainWorldInject(
        msg.selector, msg.text, useRendered, directInsertFirst, editorApiInsert,
        bodyExceedsPasteLimit,
      );
    } catch { /* landed stays false — the content script's fallback chain takes over */ }
    window.postMessage(
      { type: 'nexpath:inject-result', requestId: msg.requestId, landed },
      window.location.origin,
    );
  });
}
