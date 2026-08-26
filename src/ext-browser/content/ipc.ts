import type { AdvisoryPayload, PanelEvent } from '../../core/ports/ui.port.js';
import type { PePanelViewV1 } from '../ui/pe-contract.js';
import { isPePanelCommandV1, type PePanelCommandV1 } from '../ui/pe-contract.js';

/**
 * IPC message envelope types for all message channels:
 *   MAIN-world injector → content script (window.postMessage)
 *   content script → service worker (chrome.runtime.sendMessage)
 *   service worker → content script (chrome.tabs.sendMessage)
 *   content script → panel adapter (local function call)
 */

// ── Injector → Content ────────────────────────────────────────────────────────

export interface PromptCapturedMsg {
  type: 'nexpath:prompt-captured';
  promptText: string;
  agent: string;
}

export interface ResponseStoppedMsg {
  type: 'nexpath:response-stopped';
  agent: string;
}

/**
 * Posted by inject/main-world.ts when a fetch-interception rule extracts a prompt
 * (B4: Bolt's POST /api/chat/v2). Deliberately a DISTINCT type from
 * PromptCapturedMsg: main-world-injector.ts must NOT forward it to the SW directly —
 * only the agent capture kit listens for it and routes the text through its
 * emitIfNewText funnel, so the fetch channel can never double-emit a prompt the
 * composer/observer channels also saw.
 */
export interface FetchPromptMsg {
  type: 'nexpath:fetch-prompt';
  promptText: string;
  agent: string;
}

export type InjectorToContentMsg = PromptCapturedMsg | ResponseStoppedMsg;

// ── Content → Service Worker ──────────────────────────────────────────────────

export interface PromptSubmitMsg {
  type: 'nexpath:prompt-submit';
  promptText: string;
  projectRoot: string;
  agent: string;
  tabId: number;
}

export interface ResponseStopMsg {
  type: 'nexpath:response-stop';
  projectRoot: string;
  agent: string;
  tabId: number;
}

/**
 * CLI-parity panel footer shortcuts (CLI Ctrl+X / Ctrl+T). Fire-and-forget content
 * → SW; NOT part of the showAdvisory round-trip (that would prematurely resolve it).
 *   - 'disable-project' → SW writes `advisory_frequency:<projectRoot>=off`.
 *   - 'open-settings'   → SW opens the extension options page.
 *   - 'set-frequency'   → SW writes `advisory_frequency:<projectRoot>=<value>`
 *                         (the CLI Ctrl+T chooser's per-project write, TtySelectFn
 *                         runFrequencySubMenu).
 *   - 'set-role'        → SW writes `role:<projectRoot>=<value>` (runRoleSubMenu).
 */
export interface AdvisoryFooterIntentMsg {
  type: 'nexpath:advisory-footer-intent';
  intent: 'disable-project' | 'open-settings' | 'set-frequency' | 'set-role';
  projectRoot: string;
  /** Present only for set-frequency / set-role. */
  value?: string;
}

/**
 * One-way select-notification: the panel's "Send to your agent now" is about to
 * inject + auto-submit `text` into the composer. The SW records it as the last
 * seen prompt so the capture pipeline dedups the auto-submitted echo — the
 * browser equivalent of the CLI marking injected prompts to skip re-processing.
 */
export interface PromptInjectedMsg {
  type: 'nexpath:prompt-injected';
  projectRoot: string;
  text: string;
}

/**
 * One-way terminal-event report (select / skip / dismiss). The showAdvisory
 * round-trip dies with the SW instance that opened it (MV3 teardown while the
 * popup waits, observed live 2026-07-10) — this fire-and-forget message reaches
 * whatever SW instance is alive, so the advisory_dismissed record survives.
 */
export interface AdvisoryTerminalMsg {
  type: 'nexpath:advisory-terminal';
  eventType: 'select' | 'skip' | 'dismiss';
  advisoryId: string;
}

/**
 * PE panel command (content → SW, short-lived request): one user action from
 * the prompt-enhancement panel, echoing the viewSeq of the render it was
 * issued against — the SW's popup loop drops any command whose seq no longer
 * matches the live view (stale-result discipline).
 */
export interface PeCommandMsg {
  type: 'nexpath:pe-command';
  projectRoot: string;
  viewSeq: number;
  command: PePanelCommandV1;
}

/**
 * One-way terminal-outcome notice for the PE popup (use-enhanced / use-original
 * / close). Same rationale as AdvisoryTerminalMsg: the popup loop's in-SW await
 * dies with an MV3 teardown; this reaches whichever SW instance is alive so the
 * pending-PE row is always consumed and the outcome always lands in the ring.
 */
export interface PeTerminalNoticeMsg {
  type: 'nexpath:pe-terminal-notice';
  projectRoot: string;
  outcome: 'use_current' | 'use_original' | 'close';
}

/**
 * Heartbeat while the PE panel is open (content → SW, ~20s cadence). Any
 * runtime message resets MV3's service-worker idle timer, keeping the popup
 * loop's SW instance alive while the user reads/edits — the documented MV3
 * keepalive pattern. The SW handler is a no-op ack.
 */
export interface PeKeepaliveMsg {
  type: 'nexpath:pe-keepalive';
  projectRoot: string;
}

/**
 * HB1 read-back (A7/A9): what the MAIN world actually believes about the
 * submit-flow switch, forwarded so it lands in the ring buffer. Diagnostic only
 * — nothing branches on it, and the SW handler is a log + ack.
 */
export interface SubmitFlowStateMsg {
  type: 'nexpath:submit-flow-state';
  site: string;
  armed: boolean;
  source: string;
  seq: number;
}

/**
 * One ring event from the page's gated submit path (`submit_hold_started`,
 * `…_released_allow`, `…_echo_skip`, `…_expired`, …). Diagnostic only: the SW
 * logs it into the durable buffer and acks. Nothing branches on it.
 */
export interface SubmitFlowEventMsg {
  type: 'nexpath:submit-flow-event';
  site: string;
  event: string;
  data: Record<string, unknown>;
}

/**
 * The page is holding a submission and needs a verdict. Round-trip: the content
 * script relays it and posts the answer straight back to the page, so the
 * outcome never depends on this service-worker instance surviving.
 */
export interface SubmitDecisionRequestMsg {
  type: 'nexpath:submit-decision-request';
  site: string;
  projectRoot: string;
  requestId: string;
  prompt: string;
  submitId: string;
}

export type ContentToSwMsg =
  | PromptSubmitMsg
  | ResponseStopMsg
  | AdvisoryFooterIntentMsg
  | PromptInjectedMsg
  | AdvisoryTerminalMsg
  | PeCommandMsg
  | PeTerminalNoticeMsg
  | PeKeepaliveMsg
  | SubmitFlowStateMsg
  | SubmitFlowEventMsg
  | SubmitDecisionRequestMsg;

// ── Service Worker → Content ──────────────────────────────────────────────────

export interface ShowAdvisoryMsg {
  type: 'nexpath:show-advisory';
  payload: AdvisoryPayload;
}

/** Render (or re-render) the PE panel with this view. Content acks after mount. */
export interface ShowPeMsg {
  type: 'nexpath:show-pe';
  projectRoot: string;
  payload: PePanelViewV1;
}

/**
 * A popup IS coming for a held submit — show the "held" notice.
 *
 * Sent only after the worker has confirmed a pending enhancement exists and the
 * cooldown has passed, so the notice never promises a popup that will not appear.
 */
export interface PePreparingMsg {
  type: 'nexpath:pe-preparing';
  projectRoot: string;
}

/** Hide the PE panel (loop ended without an inject). */
export interface PeCloseMsg {
  type: 'nexpath:pe-close';
  projectRoot: string;
}

/** Inject + auto-submit the accepted enhanced body via the existing inject kit. */
export interface PeInjectMsg {
  type: 'nexpath:pe-inject';
  projectRoot: string;
  text: string;
}

export type SwToContentMsg = ShowAdvisoryMsg | ShowPeMsg | PeCloseMsg | PeInjectMsg | PePreparingMsg;

// ── Content → Service Worker (panel event) ────────────────────────────────────

export interface PanelEventMsg {
  type: 'nexpath:panel-event';
  event: PanelEvent;
}

// ── Union type for all chrome.runtime messages ────────────────────────────────

export type ExtensionMsg =
  | PromptSubmitMsg
  | ResponseStopMsg
  | ShowAdvisoryMsg
  | PanelEventMsg
  | AdvisoryFooterIntentMsg
  | PromptInjectedMsg
  | AdvisoryTerminalMsg
  | PeCommandMsg
  | PeTerminalNoticeMsg
  | PeKeepaliveMsg
  | SubmitFlowStateMsg
  | SubmitFlowEventMsg
  | SubmitDecisionRequestMsg
  | ShowPeMsg
  | PeCloseMsg
  | PeInjectMsg;

// ── Type guards ───────────────────────────────────────────────────────────────

export function isPromptSubmitMsg(msg: unknown): msg is PromptSubmitMsg {
  return typeof msg === 'object' && msg !== null &&
    (msg as Record<string, unknown>)['type'] === 'nexpath:prompt-submit';
}

export function isResponseStopMsg(msg: unknown): msg is ResponseStopMsg {
  return typeof msg === 'object' && msg !== null &&
    (msg as Record<string, unknown>)['type'] === 'nexpath:response-stop';
}

export function isShowAdvisoryMsg(msg: unknown): msg is ShowAdvisoryMsg {
  return typeof msg === 'object' && msg !== null &&
    (msg as Record<string, unknown>)['type'] === 'nexpath:show-advisory';
}

export function isPanelEventMsg(msg: unknown): msg is PanelEventMsg {
  return typeof msg === 'object' && msg !== null &&
    (msg as Record<string, unknown>)['type'] === 'nexpath:panel-event';
}

export function isPromptCapturedMsg(msg: unknown): msg is PromptCapturedMsg {
  return typeof msg === 'object' && msg !== null &&
    (msg as Record<string, unknown>)['type'] === 'nexpath:prompt-captured';
}

export function isResponseStoppedMsg(msg: unknown): msg is ResponseStoppedMsg {
  return typeof msg === 'object' && msg !== null &&
    (msg as Record<string, unknown>)['type'] === 'nexpath:response-stopped';
}

export function isFetchPromptMsg(msg: unknown): msg is FetchPromptMsg {
  return typeof msg === 'object' && msg !== null &&
    (msg as Record<string, unknown>)['type'] === 'nexpath:fetch-prompt';
}

export function isAdvisoryFooterIntentMsg(msg: unknown): msg is AdvisoryFooterIntentMsg {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m['type'] === 'nexpath:advisory-footer-intent' &&
    (m['intent'] === 'disable-project' || m['intent'] === 'open-settings' ||
     m['intent'] === 'set-frequency' || m['intent'] === 'set-role') &&
    typeof m['projectRoot'] === 'string' &&
    (m['value'] === undefined || typeof m['value'] === 'string');
}

export function isPromptInjectedMsg(msg: unknown): msg is PromptInjectedMsg {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m['type'] === 'nexpath:prompt-injected' &&
    typeof m['projectRoot'] === 'string' && typeof m['text'] === 'string';
}

export function isAdvisoryTerminalMsg(msg: unknown): msg is AdvisoryTerminalMsg {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m['type'] === 'nexpath:advisory-terminal' &&
    (m['eventType'] === 'select' || m['eventType'] === 'skip' || m['eventType'] === 'dismiss') &&
    typeof m['advisoryId'] === 'string';
}

export function isSubmitFlowStateMsg(msg: unknown): msg is SubmitFlowStateMsg {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m['type'] === 'nexpath:submit-flow-state' &&
    typeof m['site'] === 'string' && typeof m['armed'] === 'boolean' &&
    typeof m['source'] === 'string' && typeof m['seq'] === 'number';
}

export function isSubmitDecisionRequestMsg(msg: unknown): msg is SubmitDecisionRequestMsg {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m['type'] === 'nexpath:submit-decision-request' &&
    typeof m['site'] === 'string' && typeof m['projectRoot'] === 'string' &&
    typeof m['requestId'] === 'string' && typeof m['prompt'] === 'string' &&
    typeof m['submitId'] === 'string';
}

export function isSubmitFlowEventMsg(msg: unknown): msg is SubmitFlowEventMsg {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m['type'] === 'nexpath:submit-flow-event' &&
    typeof m['site'] === 'string' && typeof m['event'] === 'string' &&
    typeof m['data'] === 'object' && m['data'] !== null;
}

export function isShowPeMsg(msg: unknown): msg is ShowPeMsg {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m['type'] === 'nexpath:show-pe' &&
    typeof m['projectRoot'] === 'string' &&
    typeof m['payload'] === 'object' && m['payload'] !== null;
}

export function isPePreparingMsg(msg: unknown): msg is PePreparingMsg {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m['type'] === 'nexpath:pe-preparing' && typeof m['projectRoot'] === 'string';
}

export function isPeCloseMsg(msg: unknown): msg is PeCloseMsg {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m['type'] === 'nexpath:pe-close' && typeof m['projectRoot'] === 'string';
}

export function isPeInjectMsg(msg: unknown): msg is PeInjectMsg {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m['type'] === 'nexpath:pe-inject' &&
    typeof m['projectRoot'] === 'string' && typeof m['text'] === 'string';
}

export function isPeCommandMsg(msg: unknown): msg is PeCommandMsg {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m['type'] === 'nexpath:pe-command' &&
    typeof m['projectRoot'] === 'string' &&
    typeof m['viewSeq'] === 'number' &&
    isPePanelCommandV1(m['command']);
}

export function isPeTerminalNoticeMsg(msg: unknown): msg is PeTerminalNoticeMsg {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m['type'] === 'nexpath:pe-terminal-notice' &&
    typeof m['projectRoot'] === 'string' &&
    (m['outcome'] === 'use_current' || m['outcome'] === 'use_original' || m['outcome'] === 'close');
}

export function isPeKeepaliveMsg(msg: unknown): msg is PeKeepaliveMsg {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m['type'] === 'nexpath:pe-keepalive' && typeof m['projectRoot'] === 'string';
}
