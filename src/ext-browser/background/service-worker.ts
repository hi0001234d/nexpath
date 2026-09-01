import browser from 'webextension-polyfill';
import { classifyPrompt } from '../../core/classifier/PromptClassifier.js';
import { classifyWithTFIDFBrowser } from '../../core/classifier/tfidf-browser.js';
// LanguageDetector is browser-safe (its only dependency is `tinyld`, which ships a
// browser build esbuild resolves automatically). Imported directly so the browser and
// the CLI share ONE detector — same tinyld model, same thresholds, guaranteed parity.
import {
  detectLanguage,
  resolveLanguage,
  LANG_WINDOW,
  LANG_DETECT_INTERVAL,
} from '../../classifier/LanguageDetector.js';
import { SessionStateManager } from '../../core/session-state.js';
import { shouldFireStage2, runStage2, type FlagType } from '../../core/stage2.js';
import { detectAbsenceFlags } from '../../core/classifier/AbsenceDetector.js';
import {
  classifyStreamBPresence,
  type StreamBPresenceResult,
} from '../../core/classifier/StreamBPresenceClassifier.js';
import { classifyUserProfileLLM, MIN_PROFILE_PROMPTS } from '../../core/classifier/LLMProfileClassifier.js';
import { isProfileStale } from '../../core/classifier/UserProfileClassifier.js';
import { generatePinchLabel } from '../../core/decision/pinch.js';
import { resolveDecisionContent } from '../../core/decision/static-content.js';
import { generateOptionList, type GeneratedOptions } from '../../core/decision/options.js';
import type { DecisionContent } from '../../core/decision/options.js';
import { composeWhyHelpBlock } from '../../decision-session/why-help-compose.js';
import { profileToRegister } from '../../decision-session/register.js';
import { IdbStorageAdapter } from '../adapters/storage-idb.js';
import { makeMemoryStoragePort } from '../adapters/memory-storage.js';
import { FetchLLMAdapter } from '../adapters/llm-fetch.js';
import { applyLLMCredentialEnv, resolveLLMCredentials } from '../adapters/llm-credentials.js';
import { normalizePromptForDedup } from '../adapters/prompt-dedup.js';
import { ChromeStorageKeyAdapter } from '../adapters/storage-chrome.js';
import { BrowserClockAdapter } from '../adapters/clock-browser.js';
import { ConsoleLogAdapter } from '../adapters/log-console.js';
import { PersistentLogAdapter } from '../adapters/log-persistent.js';
import { ContentScriptUIAdapter } from '../content/panel-adapter.js';
import {
  isPeCommandMsg,
  isPeKeepaliveMsg,
  isSubmitFlowStateMsg,
  isSubmitFlowEventMsg,
  isSubmitDecisionRequestMsg,
  isPeTerminalNoticeMsg,
  isPromptSubmitMsg,
  isResponseStopMsg,
  isAdvisoryFooterIntentMsg,
  isPromptInjectedMsg,
  isAdvisoryTerminalMsg,
} from '../content/ipc.js';
import { resolveFrequencyConfig, type AdvisoryFrequencyLevel } from '../../config/GlobalConfig.js';
import type { AdvisoryPayload } from '../../core/ports/ui.port.js';
import type { Stage, UserRole, UserProfile, PromptRecord } from '../../core/classifier/types.js';
import { PE_ENGINE_READY, isPromptEnhancementSequenceShapedTextV1 } from './pe-engine.js';
import { prepareAndStoreBrowserPe, type BrowserPeContext } from './pe-prepare.js';
import { getPendingPe, markPendingPeShown, upsertPendingPe } from '../adapters/pe-pending-store.js';
import { resolvePePopupCooldown, resolvePeSequenceEnabled } from '../adapters/pe-config.js';
import { getPendingSequence, recordPendingSequence } from '../adapters/pe-sequence-store.js';
import { deliverPePanelCommand, runBrowserPePopup } from './pe-popup-host.js';

const idb = new IdbStorageAdapter();
const keyStore = new ChromeStorageKeyAdapter();
const clock = new BrowserClockAdapter();
// Wrapped so every pipeline event also lands in the durable storage.local buffer —
// SW console history dies with each MV3 instance; the buffer is what the options
// page's "Recent activity" section (the browser's `nexpath log`) reads.
const log = new PersistentLogAdapter(new ConsoleLogAdapter('[nexpath-sw]'));

// ── Build identity (amendment A10) ────────────────────────────────────────────
// Replaced by esbuild at bundle time with "<short-hash>@<branch>:<target>"; the
// typeof guard keeps unbundled runs (vitest) safe. Logged as one of the first
// activation lines so a stale unpacked reload is immediately visible, ending the
// "which code is actually running" debugging class. PE_ENGINE_READY makes the
// prompt-enhancement engine seam (pe-engine.ts) a provable part of this bundle.
declare const __NEXPATH_BUILD_ID__: string | undefined;
const BUILD_ID = typeof __NEXPATH_BUILD_ID__ === 'string' ? __NEXPATH_BUILD_ID__ : 'dev-unbundled';
log.debug('build_identity', { build: BUILD_ID, peEngine: PE_ENGINE_READY });


// ── First-install: open options page ──────────────────────────────────────────

// Must stay in sync with the manifests' host_permissions/content-script matches.
const AGENT_TAB_URL_PATTERNS = [
  'https://*.replit.com/*',
  'https://bolt.new/*',
  'https://*.stackblitz.com/*',
  'https://lovable.dev/*',
];

browser.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    browser.runtime.openOptionsPage();
  }

  // Every install/update starts a NEW extension generation; content scripts already
  // running in open agent tabs belong to the dead one — their runtime.sendMessage
  // fails with "Extension context invalidated" and every capture is silently
  // DROPPED until the tab is manually reloaded. Testers hit this constantly
  // (confirmed live 2026-07-04 and again 2026-07-06 despite written guidance to
  // close tabs). Reloading the agent-site tabs — and only those — swaps in the
  // current generation automatically; Bolt/Replit chat state is server-side, so a
  // reload loses nothing.
  void browser.tabs.query({ url: AGENT_TAB_URL_PATTERNS }).then((tabs) => {
    let reloaded = 0;
    for (const t of tabs) {
      if (t.id !== undefined) {
        void browser.tabs.reload(t.id);
        reloaded++;
      }
    }
    if (reloaded > 0) log.debug('agent_tabs_reloaded_on_' + reason, { count: reloaded });
  }).catch((err: unknown) => {
    log.warn('agent_tab_reload_failed', { error: String(err) });
  });
});

// ── Main message listener ──────────────────────────────────────────────────────

browser.runtime.onMessage.addListener(
  // webextension-polyfill's OnMessageListenerCallback requires the 3-arg form to
  // return the literal `true` unconditionally (its type contract, not `boolean`) —
  // returning `false` here doesn't match any of OnMessageListener's 3 shapes and is
  // a genuine type error, invisible until 2026-07-02 (see tsconfig.ext-browser.json
  // header comment for why this was never caught before).
  (msg: unknown, sender, sendResponse: (r?: unknown) => void): true => {
    if (isPromptSubmitMsg(msg)) {
      log.debug('prompt_submit_received', { agent: msg.agent, projectRoot: msg.projectRoot });
      // No tabId needed at submit: the advisory is only queued now, and shown later
      // (with the response-stop event's own tabId) once the agent finishes responding.
      handlePromptSubmit(msg.promptText, msg.projectRoot, msg.agent)
        .then(() => sendResponse({ ok: true }))
        .catch((err: unknown) => {
          log.warn('prompt_submit_error', { error: String(err) });
          sendResponse({ ok: false });
        });
      return true; // keep channel open for async response
    }

    if (isResponseStopMsg(msg)) {
      // CLI-parity popup timing: the agent just finished responding → show the
      // advisory handlePromptSubmit queued for this project (if any). This is the
      // browser's Stop-hook equivalent (cli/commands/stop.ts).
      log.debug('response_stop_received', { agent: msg.agent, projectRoot: msg.projectRoot });
      const tabId = sender.tab?.id ?? msg.tabId;
      // ACK IMMEDIATELY and run the show DETACHED. handleResponseStop → showAdvisory
      // awaits the user's panel interaction (potentially minutes); if we held this
      // content→SW channel open for that, the MV3 worker idling out or the tab
      // navigating closes it → "message channel closed before a response was received"
      // (observed live in floods on Bolt, 2026-07-08). The internal tabs.sendMessage
      // inside showAdvisory is itself a pending extension call, so the worker stays
      // alive for the advisory without us pinning this fire-and-forget channel.
      sendResponse({ ok: true });
      void handleResponseStop(msg.projectRoot, tabId).catch((err: unknown) => {
        log.warn('response_stop_error', { error: String(err) });
      });
      return true;
    }

    if (isAdvisoryFooterIntentMsg(msg)) {
      // CLI-parity panel footer shortcuts — see AdvisoryFooterIntentMsg.
      log.debug('advisory_footer_intent', { intent: msg.intent, projectRoot: msg.projectRoot });
      handleAdvisoryFooterIntent(msg.intent, msg.projectRoot, msg.value)
        .then(() => sendResponse({ ok: true }))
        .catch((err: unknown) => {
          log.warn('advisory_footer_intent_error', { error: String(err) });
          sendResponse({ ok: false });
        });
      return true; // keep channel open for async response
    }

    if (isPromptInjectedMsg(msg)) {
      // "Send to your agent now" is about to auto-submit this text — record it as
      // the last seen prompt so the capture pipeline dedups the echo (the browser
      // equivalent of the CLI marking injected prompts to skip re-processing;
      // reuses the cross-page dedup slot Step 1.2 already checks).
      log.debug('prompt_injected_marked', { projectRoot: msg.projectRoot });
      keyStore.setKey(lastPromptKeyFor(msg.projectRoot), JSON.stringify({ text: msg.text, at: clock.now() }))
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }

    if (isAdvisoryTerminalMsg(msg)) {
      // Fire-and-forget terminal record — the showAdvisory round-trip's resolution
      // dies with the SW instance that opened it (MV3 teardown while the popup sat
      // open, observed live 2026-07-10); this message reaches whichever instance is
      // alive, so the advisory_dismissed record always lands in the ring buffer.
      log.debug('advisory_dismissed', { eventType: msg.eventType, advisoryId: msg.advisoryId });
      sendResponse({ ok: true });
      return true;
    }

    if (isSubmitFlowStateMsg(msg)) {
      // HB1 read-back (A7/A9): what the PAGE world believes about the submit-flow
      // switch — not what storage says. Diagnostic only; nothing branches on it.
      log.debug('submit_flow_state', {
        site: msg.site, armed: msg.armed, source: msg.source, seq: msg.seq,
      });
      sendResponse({ ok: true });
      return true;
    }

    if (isSubmitDecisionRequestMsg(msg)) {
      // The page is HOLDING the user's request while this resolves. Two rules
      // apply to everything under here:
      //   1. always answer — a missing answer costs the user their prompt until
      //      their hold budget expires;
      //   2. answer 'allow' on any failure — only a deliberate, non-empty
      //      replacement may withhold the original.
      log.debug('submit_decision_requested', {
        site: msg.site, submitId: msg.submitId, projectRoot: msg.projectRoot,
      });
      // RC43: from here until shortly after the verdict, this project's
      // response-stop signal is our own echo, not a real turn ending.
      beginHoldQuietWindow(msg.projectRoot);
      decideHeldSubmit(msg, sender.tab?.id)
        .then((decision) => {
          log.debug('submit_decision_answered', { submitId: msg.submitId, kind: decision.kind });
          endHoldQuietWindow(msg.projectRoot);
          sendResponse({ decision });
        })
        .catch((err: unknown) => {
          log.warn('submit_decision_failed', { submitId: msg.submitId, error: String(err) });
          endHoldQuietWindow(msg.projectRoot);
          sendResponse({ decision: { kind: 'allow' } });
        });
      return true; // keep the channel open for the async answer
    }

    if (isSubmitFlowEventMsg(msg)) {
      // One ring event from the page's gated submit path. The page owns the
      // hold; this is only how its branches become readable after the fact
      // (service-worker console lines die with the worker).
      log.debug(msg.event, { site: msg.site, ...msg.data });

      // An expired hold means the page has ALREADY sent the original. Any popup
      // still on screen for that submit now has no consumer, so tear it down and
      // mark the submit so a late verdict is discarded rather than acted on.
      if (msg.event === 'submit_hold_expired') {
        const submitId = typeof msg.data['submitId'] === 'string' ? msg.data['submitId'] : null;
        if (submitId !== null) markSubmitAbandoned(submitId);
        const tabId = sender.tab?.id;
        if (tabId !== undefined) {
          browser.tabs.sendMessage(tabId, { type: 'nexpath:pe-close', projectRoot: '' })
            .catch(() => { /* tab gone or no panel open */ });
        }
      }

      sendResponse({ ok: true });
      return true;
    }

    if (isPeCommandMsg(msg)) {
      // One PE panel action → the live popup loop's mailbox (pe-popup-host).
      const delivered = deliverPePanelCommand(log, msg.projectRoot, msg.viewSeq, msg.command);
      sendResponse({ ok: delivered });
      return true;
    }

    if (isPeTerminalNoticeMsg(msg)) {
      // One-way PE outcome record (advisory-terminal parity): consume the pending
      // row on whichever SW instance is alive so a teardown mid-popup can never
      // resurrect the popup on the next stop. Idempotent — the live loop's own
      // bookkeeping has usually consumed it already.
      log.debug('pe_terminal_notice', { projectRoot: msg.projectRoot, outcome: msg.outcome });
      // 'use_original' arrives BEFORE the feedback step, so a held prompt is
      // released the moment the user decides rather than when they finish
      // answering. Idempotent: no waiter ⇒ no-op.
      if (msg.outcome === 'use_original') signalEarlySubmitRelease(sender.tab?.id, msg.projectRoot);
      markPendingPeShown(msg.projectRoot)
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }

    if (isPeKeepaliveMsg(msg)) {
      // Heartbeat while the panel is open OR a submit is held — receiving any
      // runtime message resets the worker's idle timer. It also renews the
      // response-stop quiet lease: the hold has no ceiling any more, so this
      // beat is the only honest "still holding" signal we get.
      refreshHoldQuietWindow(msg.projectRoot);
      sendResponse({ ok: true });
      return true;
    }

    sendResponse(undefined);
    return true;
  },
);

// ── Prompt submission pipeline ─────────────────────────────────────────────────

// Cross-page duplicate window: Bolt's landing page captures the first prompt, then
// hard-navigates to the new project page whose generation POST /api/chat/v2 carries
// that same prompt as the newest user message — a fresh content-script instance
// captures it again. The per-page capture-kit funnel cannot span a navigation, so
// the SW (which survives it) is the only place this dedup can live. Trade-off: the
// same text submitted twice deliberately within the window also collapses — same
// accepted limitation as the kit's own lastEmittedText guard.
const CROSS_PAGE_PROMPT_DEDUP_MS = 120_000;

/** Last Stage-2 verdict (or error), persisted so it survives SW teardown. */
const LAST_STAGE2_RESULT_KEY = 'nexpath_last_stage2_result';

/**
 * HIDDEN DEVELOPER/TESTER KEY — forces the advisory pipeline past the gates that
 * legitimately suppress most prompts, so a popup can be exercised ON DEMAND.
 * Value must be exactly 'enabled'; anything else (including absent) is off, and
 * off is the shipped behaviour for every user.
 *
 * WHY THIS EXISTS. Whether a popup appears is decided by (a) a minimum prompt
 * count, (b) a trigger, (c) per-event dedup, (d) a cooldown, and finally (e) an
 * LLM verdict that is free to say "this session is fine, say nothing" — which it
 * does often and CORRECTLY. That is right for users and unusable for testing:
 * verifying a panel change meant submitting prompts until the model happened to
 * agree, and a session that never fired was indistinguishable from a broken
 * build. Both a tester and this pass burned hours on exactly that ambiguity.
 *
 * DELIBERATELY NOT BYPASSED: `advisory_frequency = off` and the major_only /
 * once_per_session modes. Those are explicit user choices, not incidental gates;
 * a test switch must not override a kill switch. Everything it does bypass logs
 * `advisory_gate_forced`, so a forced run can never be mistaken for a natural one.
 *
 * Never listed in options.html or the self-check (guard-tested) — it is set by
 * hand from the extension console and has no UI.
 */
const FORCE_ADVISORY_KEY = 'nexpath_force_advisory';

/**
 * Last PE prepare's WHITELISTED summary (PB5) — the debug channel's answer to
 * "did a prompt enhancement prepare, and what did it decide?" without reading
 * SW console lines that die with the worker. Dispositions, policies, counters
 * and reason labels only — NEVER the request, the prompt, or any body text.
 */
const LAST_PE_PREPARE_KEY = 'nexpath_last_pe_prepare';

function recordPeDisposition(
  path: 'fired_trigger' | 'sequence_fallback',
  eligibility: string,
  promptCount: number,
  prep: Awaited<ReturnType<typeof prepareAndStoreBrowserPe>>,
): Promise<void> {
  return keyStore.setKey(LAST_PE_PREPARE_KEY, JSON.stringify({
    at: clock.now(),
    path,
    eligibility,
    promptCount,
    disposition: prep.disposition,
    safeFallback: prep.safeFallback,
    reasonCode: 'reasonCode' in prep ? prep.reasonCode : null,
    sendPolicy: prep.safeFallback || !prep.result ? null : prep.result.uiView.body.sendPolicy,
    stored: !prep.safeFallback && prep.result !== undefined
      && prep.result.disposition !== 'no_popup_not_applicable'
      && prep.result.uiView.body.sendPolicy !== 'no_popup',
  })).catch(() => { /* diagnostics are best-effort — never break the pipeline */ });
}

function lastPromptKeyFor(projectRoot: string): string {
  return `nexpath_last_prompt::${projectRoot}`;
}

/**
 * Per-project advisory-frequency key — matches the CLI's Ctrl+X opt-out key format
 * (`advisory_frequency:<projectRoot>`) so the two surfaces read/write the same slot.
 */
function projectFreqKeyFor(projectRoot: string): string {
  return `advisory_frequency:${projectRoot}`;
}

/** Per-project role key — the CLI Ctrl+T role submenu's slot (`role:<projectRoot>`). */
function projectRoleKeyFor(projectRoot: string): string {
  return `role:${projectRoot}`;
}

/**
 * Pending-advisory key — the browser's equivalent of the CLI's pending-advisories
 * table. handlePromptSubmit writes the built payload here; handleResponseStop reads
 * + clears it so the popup shows only after the agent's response completes.
 */
function pendingAdvisoryKeyFor(projectRoot: string): string {
  return `nexpath_pending_advisory::${projectRoot}`;
}

/**
 * Sidecar to the pending advisory: the inputs handleResponseStop needs to run the
 * personalised option generator at SHOW time (CLI stop.ts parity — the CLI runs
 * generateOptionList in the Stop hook, not at submit). Stored separately from the
 * AdvisoryPayload (the frozen UI contract) and cleared alongside it.
 */
interface PendingOgContext {
  stage:                 Stage;
  flagType:              FlagType;
  prevStage:             Stage | null;
  promptsInCurrentStage: number;
  language:              string | null;
  profile:               UserProfile | null;
  promptHistory:         PromptRecord[];
}

function pendingAdvisoryOgKeyFor(projectRoot: string): string {
  return `nexpath_pending_advisory_og::${projectRoot}`;
}

/**
 * Build the per-level option lists for the advisory payload.
 *
 * With `gen` present (personalised), each title comes from the generated list and
 * each body from its resolved `generatedDescBases` — mirroring DecisionSession.wrapGen
 * exactly, falling back per-index to the static desc-base. With `gen` null this is the
 * pre-Option-A static mapping (title = static option text, body = static desc-base),
 * which handlePromptSubmit queues so the popup can appear the instant the response
 * stops even before personalisation runs.
 */
function buildLevels(content: DecisionContent, gen: GeneratedOptions | null): AdvisoryPayload['levels'] {
  const gd = gen?.generatedDescBases;
  const map = (
    staticEntries: DecisionContent['L1'],
    genTitles:     string[] | undefined,
    genBodies:     string[] | undefined,
    tag:           'L1' | 'L2' | 'L3',
  ): AdvisoryPayload['levels']['L1'] => {
    const lower  = tag.toLowerCase();
    const titles = genTitles ?? staticEntries.map((e) => e.option);
    return titles.map((title, i) => ({
      id:    `${lower}-${i}`,
      level: tag,
      title,
      body:  genBodies?.[i] ?? staticEntries[i]?.descBase ?? '',
    }));
  };
  return {
    L1: map(content.L1, gen?.l1, gd?.l1, 'L1'),
    L2: map(content.L2, gen?.l2, gd?.l2, 'L2'),
    L3: map(content.L3, gen?.l3, gd?.l3, 'L3'),
  };
}

/** Flat first-of-each-level view — the shipped panel indexes `options` by level. */
function optionsFromLevels(levels: AdvisoryPayload['levels']): AdvisoryPayload['options'] {
  return [
    ...(levels.L1[0] ? [levels.L1[0]] : []),
    ...(levels.L2[0] ? [levels.L2[0]] : []),
    ...(levels.L3[0] ? [levels.L3[0]] : []),
  ];
}

/**
 * Decision-in-flight marker — the fix for the fast-response race. The CLI's
 * UserPromptSubmit hook BLOCKS the agent until the decision completes, so its
 * Stop hook can never outrun it. The browser captures passively: the agent
 * responds IN PARALLEL with this pipeline's LLM calls (Stream B + Stage 2 +
 * pinch, ~3-7s), so a fast response's stop event used to find no pending
 * advisory and give up — the popup then NEVER showed (reproduced live:
 * response_stop at +2436ms, advisory_pending at +3340ms, no panel, 2026-07-10).
 * handlePromptSubmit holds this marker for the pipeline's whole run;
 * handleResponseStop, finding no pending advisory but a fresh marker, WAITS for
 * the decision to finish instead of returning.
 */
function decisionInflightKeyFor(projectRoot: string): string {
  return `nexpath_decision_inflight::${projectRoot}`;
}

const DECISION_WAIT_POLL_MS = 500;
const DECISION_WAIT_MAX_MS = 45_000;
/** Marker older than this is a crashed/torn-down pipeline — don't wait on it. */
const DECISION_INFLIGHT_STALE_MS = 60_000;
/** Longest a pending PE may wait for its stop before it is stale (see the
 * age gate in handleResponseStopPeFirst) — generous enough for the longest
 * real agent runs, far below a cross-sitting resurrection. */
const PE_PENDING_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Per-root count of pipelines currently inside the inflight marker. The marker
 * key is one value per root, so a bare set/clear pair is last-writer-wins: a
 * QUICK pipeline (e.g. a cooldown-blocked prompt) that starts after a slow one
 * used to clear the marker while the slow pipeline's PE compose was still
 * running — response-stop then saw no marker, skipped its wait, and the popup
 * missed the turn (live-caught in the adversarial fast-stop test, 2026-08-24:
 * prompt 6 exited at t=25s and erased prompt 5's marker; prompt 5 parked its
 * PE at t=39s, after the stop had already given up). In-memory is sufficient:
 * all concurrent pipelines run in one SW instance, and a torn-down instance's
 * persisted marker is already handled by the reader's staleness cutoff.
 */
const decisionInflightCounts = new Map<string, number>();

/**
 * Wait until the submit pipeline for `projectRoot` has finished parking its rows.
 *
 * Extracted so the response-stop path and the held-submit decider cannot drift:
 * both need "the pipeline queued the advisory AND parked the PE", and both must
 * wait for the MARKER rather than for a row (the PE prepare runs last, so a
 * row-based wait can read a half-finished turn). The response-stop path's
 * behaviour is pinned by its own tests; this is a pure extraction.
 */
async function waitForSubmitPipelineIdle(projectRoot: string, logKey: string): Promise<void> {
  const inflightRaw = await keyStore.getKey(decisionInflightKeyFor(projectRoot));
  if (!inflightRaw) return;
  let fresh = false;
  try {
    const inflight = JSON.parse(inflightRaw) as { at?: unknown };
    fresh = typeof inflight.at === 'number' && clock.now() - inflight.at <= DECISION_INFLIGHT_STALE_MS;
  } catch { /* malformed marker → treat as stale */ }
  if (!fresh) return;
  log.debug(logKey, { projectRoot });
  const deadline = clock.now() + DECISION_WAIT_MAX_MS;
  while (clock.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, DECISION_WAIT_POLL_MS));
    if (!await keyStore.getKey(decisionInflightKeyFor(projectRoot))) break;
  }
}

/**
 * How long a held submit waits for its own pipeline run to APPEAR.
 *
 * The capture that starts the pipeline and the decision request that waits for it
 * are two independent messages fired microseconds apart from the same event
 * handler, and the pipeline registers itself asynchronously. Without this grace
 * the decider can look before the pipeline has registered, conclude "no pending
 * enhancement", and allow — so the popup would never appear, intermittently and
 * invisibly. Correlated by prompt text rather than by a bare timer, so a pipeline
 * that already finished costs nothing.
 */
const PIPELINE_START_GRACE_MS = 3_000;
const PIPELINE_START_POLL_MS = 100;

/**
 * Wait until the submit pipeline has SEEN `prompt` for this project, then until
 * it has finished parking its rows.
 */
async function waitForPipelineOnPrompt(projectRoot: string, prompt: string): Promise<void> {
  // Bounded by POLL COUNT, not by a clock reading: a stopped or coarse clock must
  // not be able to turn this into an unbounded wait while a user's prompt is held.
  const maxPolls = Math.ceil(PIPELINE_START_GRACE_MS / PIPELINE_START_POLL_MS);
  let seen = false;
  for (let i = 0; i <= maxPolls && !seen; i++) {
    const raw = await keyStore.getKey(lastPromptKeyFor(projectRoot));
    if (raw) {
      try {
        if ((JSON.parse(raw) as { text?: unknown }).text === prompt) { seen = true; break; }
      } catch { /* malformed record — keep waiting */ }
    }
    if (i < maxPolls) await new Promise((resolve) => setTimeout(resolve, PIPELINE_START_POLL_MS));
  }
  if (!seen) {
    // The pipeline never picked this prompt up (capture dropped, or the worker
    // restarted). Nothing to wait for; the caller will find no pending row and
    // allow, which is the safe direction.
    log.debug('submit_decision_pipeline_never_started', { projectRoot });
    return;
  }
  await waitForSubmitPipelineIdle(projectRoot, 'submit_decision_waiting_for_pipeline');
}

/** The verdict shape the page's decision channel understands. */
type HeldSubmitDecision = { kind: 'allow' } | { kind: 'block'; replacement: string };

/**
 * Submits whose hold the PAGE has already given up on.
 *
 * When a hold expires, the page sends the original and stops listening — but the
 * popup this worker opened is still on screen. Leaving it there is the one thing
 * that could produce the double-submit this milestone must make impossible: the
 * user would click "use this" on a surface whose outcome has no consumer, and if
 * anything injected that text the agent would receive BOTH prompts. So an
 * expired hold is recorded here, the popup is torn down, and any verdict that
 * arrives afterwards is discarded.
 */
/**
 * RC43 — the post-hold quiet window.
 *
 * A site's "response finished" signal echoes our own actions within seconds: we
 * cancel a submit, or substitute one, and the DOM churns in ways the completion
 * observers can read as a turn ending. If `handleResponseStop` runs during that
 * churn it consumes rows that belong to a turn still being decided, and the
 * popup for that turn silently never appears.
 *
 * So while a submit is being held — and briefly after it resolves — response-stop
 * processing for that project is suppressed. This is narrow on purpose: it is
 * keyed per project, it is short, and it can only ever DELAY a stop, never
 * cancel a real one, because the pending rows survive until something consumes
 * them.
 */
const RESPONSE_STOP_QUIET_MS = 4_000;
const responseStopQuietUntil = new Map<string, number>();

function beginHoldQuietWindow(projectRoot: string): void {
  responseStopQuietUntil.set(projectRoot, clock.now() + HOLD_QUIET_REFRESH_MS);
}

/**
 * Push the quiet window forward while a hold is still open.
 *
 * The hold no longer has a ceiling (owner ruling: the popup waits for a human),
 * so a fixed window would expire underneath a user who is still reading. The
 * page heartbeats us every 10 s for exactly as long as it holds, so that
 * heartbeat is the honest "still holding" signal — and if it stops, the window
 * lapses on its own within one refresh.
 */
function refreshHoldQuietWindow(projectRoot: string): void {
  if (!responseStopQuietUntil.has(projectRoot)) return;
  responseStopQuietUntil.set(projectRoot, clock.now() + HOLD_QUIET_REFRESH_MS);
}

function endHoldQuietWindow(projectRoot: string): void {
  responseStopQuietUntil.set(projectRoot, clock.now() + RESPONSE_STOP_QUIET_MS);
}

function isResponseStopQuiet(projectRoot: string): boolean {
  const until = responseStopQuietUntil.get(projectRoot);
  if (until === undefined) return false;
  if (clock.now() >= until) { responseStopQuietUntil.delete(projectRoot); return false; }
  return true;
}

/** One quiet-window lease, renewed by each hold heartbeat (10 s cadence). */
const HOLD_QUIET_REFRESH_MS = 30_000;

const abandonedSubmits = new Set<string>();
const ABANDONED_SUBMITS_CAP = 50;

function markSubmitAbandoned(submitId: string): void {
  abandonedSubmits.add(submitId);
  // Bounded: this is a guard set, not a log.
  if (abandonedSubmits.size > ABANDONED_SUBMITS_CAP) {
    const oldest = abandonedSubmits.values().next().value;
    if (oldest !== undefined) abandonedSubmits.delete(oldest);
  }
}

/**
 * Held submits waiting to be released the moment a terminal choice is MADE.
 *
 * "Use original prompt" does not emit its command straight away — the panel
 * shows a short satisfaction step first (CLI parity: feedback precedes the
 * terminal action). On the response-stop path that costs nothing. On the submit
 * path the user's prompt is held until the command lands, and the hold has no
 * ceiling, so an abandoned survey held it forever — reported live as "the flow
 * stucked".
 *
 * The panel therefore announces the decision as soon as it is made, over the
 * teardown-proof `pe-terminal-notice` channel, and this releases the hold
 * without touching the popup: feedback carries on, the command still arrives
 * behind it, and the popup loop finishes exactly as before.
 *
 * Keyed by TAB and project root, not by project root alone. Two tabs open on the
 * same project share a root (it is the project URL), so a root-only key would
 * let a choice made in one tab release the prompt another tab is holding —
 * sending a prompt its user never acted on. The tab is the popup's real owner.
 */
const earlyReleaseWaiters = new Map<string, () => void>();

function earlyReleaseKey(tabId: number, projectRoot: string): string {
  return `${tabId}::${projectRoot}`;
}

function signalEarlySubmitRelease(tabId: number | undefined, projectRoot: string): void {
  if (tabId === undefined) return;   // no tab ⇒ no hold of ours to release
  const key = earlyReleaseKey(tabId, projectRoot);
  const release = earlyReleaseWaiters.get(key);
  if (!release) return;              // nothing held here, or already released
  earlyReleaseWaiters.delete(key);
  release();
}

/**
 * Decide a submission the page is currently HOLDING.
 *
 * Runs the SAME popup surface the response-stop path runs — the engine's own
 * state machine, rendered in the dock — but at submit time, inside the hold.
 *
 * ── THE BLOCK CONDITION ──────────────────────────────────────────────────────
 * Exactly one outcome may withhold the user's prompt: the popup produced an
 * explicit, non-empty replacement (`selected_current` with body text). Skipped,
 * dismissed, "use original", crashed, not shown, no pending row, cooldown,
 * abandoned — every one of those allows. That is the shipped rule, kept; only
 * its encoding differs (a return value here, a stdout line in the CLI).
 *
 * ── THIS PATH NEVER INJECTS ──────────────────────────────────────────────────
 * The response-stop path delivers its result by injecting text into the composer
 * and submitting it. This path MUST NOT: the replacement is delivered by
 * rewriting the request the page is already holding. Doing both would send the
 * prompt twice — the exact failure this milestone exists to prevent. There is
 * deliberately no `nexpath:pe-inject` below.
 *
 * ── SUPPRESSION ──────────────────────────────────────────────────────────────
 * A turn handled here consumes its pending rows, so the later response-stop
 * finds nothing and renders nothing. One decider per turn.
 */
async function decideHeldSubmit(
  msg: { site: string; projectRoot: string; prompt: string; submitId: string },
  tabId: number | undefined,
): Promise<HeldSubmitDecision> {
  const { projectRoot, submitId } = msg;
  if (!projectRoot || tabId === undefined) {
    log.debug('submit_decision_no_target', { submitId, projectRoot, hasTab: tabId !== undefined });
    return { kind: 'allow' };
  }

  // The prompt was emitted to the pipeline immediately before the hold began —
  // wait for that run to appear AND finish before reading its rows.
  await waitForPipelineOnPrompt(projectRoot, msg.prompt);

  const state = await idb.loadSessionState(projectRoot);
  const pe = await getPendingPe(projectRoot, state?.sessionId);
  if (!pe) {
    log.debug('submit_decision_no_pending_pe', { submitId, projectRoot });
    return { kind: 'allow' };
  }

  // Same cooldown rule the stop path applies: a suppressed show CONSUMES the
  // row, because a cooldown hit is a decision rather than a deferral.
  const cooldown = await resolvePePopupCooldown(projectRoot);
  const lastShownIndex = state?.lastPromptEnhancementPromptIndex;
  const promptCount = state?.promptCount ?? pe.promptCount;
  if (typeof lastShownIndex === 'number' && cooldown > 0 && promptCount - lastShownIndex < cooldown) {
    await markPendingPeShown(projectRoot);
    log.debug('submit_decision_cooldown', { submitId, projectRoot, promptCount, lastShownIndex, cooldown });
    return { kind: 'allow' };
  }

  // The submit surface owns this turn — consume the queued advisory so the later
  // response-stop has nothing to render (one decider per turn).
  const advKey = pendingAdvisoryKeyFor(projectRoot);
  if (await keyStore.getKey(advKey)) {
    await Promise.all([
      keyStore.setKey(advKey, ''),
      keyStore.setKey(pendingAdvisoryOgKeyFor(projectRoot), ''),
    ]);
    log.debug('submit_decision_consumed_advisory', { submitId, projectRoot });
  }

  // Only NOW is a popup actually coming: a pending enhancement exists, the
  // cooldown has passed, and the rows are consumed. Telling the user their
  // prompt is held any earlier would promise a popup that may never appear —
  // which is exactly what happened when the notice fired on every gated submit.
  browser.tabs.sendMessage(tabId, { type: 'nexpath:pe-preparing', projectRoot })
    .catch(() => { /* tab gone — the notice is advisory only */ });

  const [llmCreds, sequenceEnabled] = await Promise.all([
    resolveLLMCredentials(keyStore),
    resolvePeSequenceEnabled(projectRoot),
  ]);
  // Publish key + base URL into the engine's polyfilled env (own key wins;
  // Nexpath-token mode routes through the configured service — llm-credentials.ts).
  applyLLMCredentialEnv(llmCreds);
  const apiKey = llmCreds.apiKey;

  const popup = runBrowserPePopup({
    log,
    projectRoot,
    apiKey,
    record: pe,
    sequenceEnabled,
    feedbackStore: keyStore,
    sendToTab: (m) => browser.tabs.sendMessage(tabId, m),
    onFirstRendered: async () => {
      await markPendingPeShown(projectRoot);
      if (state) {
        state.lastPromptEnhancementPromptIndex = state.promptCount;
        await idb.saveSessionState(state);
      }
    },
  });

  // Whichever comes first: the popup's real outcome, or word that the user has
  // already chosen to keep their own prompt. The second only happens for
  // "use original" — the one terminal choice that ALLOWS and needs no body text
  // from the popup, so answering early can never change what is sent.
  const EARLY = Symbol('early-release');
  const waiterKey = earlyReleaseKey(tabId, projectRoot);
  let waiter: () => void;
  const earlyRelease = new Promise<typeof EARLY>((resolve) => {
    waiter = () => resolve(EARLY);
    earlyReleaseWaiters.set(waiterKey, waiter);
  });
  let raced: Awaited<typeof popup> | typeof EARLY;
  try {
    raced = await Promise.race([popup, earlyRelease]);
  } finally {
    // Identity-checked: if this tab somehow started a second hold, its waiter
    // now owns the slot and must not be torn out by the first one finishing.
    if (earlyReleaseWaiters.get(waiterKey) === waiter!) earlyReleaseWaiters.delete(waiterKey);
  }

  if (raced === EARLY) {
    // The popup keeps running — it still owns the feedback step and its own
    // teardown. Nothing here awaits it, so its rejection must not surface as an
    // unhandled one.
    popup.catch(() => { /* the popup logs its own failures */ });
    // Same verdict either way — an allow — but an operator reading the log
    // should see WHICH it was: a live hold released early, or a hold the page
    // had already given up on.
    if (abandonedSubmits.has(submitId)) {
      abandonedSubmits.delete(submitId);
      log.debug('submit_decision_discarded_abandoned', { submitId, state: 'early_release' });
    } else {
      log.debug('submit_decision_early_release', { submitId, projectRoot });
    }
    return { kind: 'allow' };
  }
  const outcome = raced.result;

  // The page may have given up while the user was reading. Its request has
  // already gone out, so a verdict now would be a second send.
  if (abandonedSubmits.has(submitId)) {
    abandonedSubmits.delete(submitId);
    log.debug('submit_decision_discarded_abandoned', { submitId, state: outcome.state });
    return { kind: 'allow' };
  }

  if (outcome.state === 'selected_current' && outcome.bodyText.length > 0) {
    log.debug('submit_decision_block', { submitId, projectRoot, chars: outcome.bodyText.length });
    return { kind: 'block', replacement: outcome.bodyText };
  }

  log.debug('submit_decision_allow', {
    submitId,
    state: outcome.state,
    ...(outcome.state === 'not_shown' ? { reasonCodes: outcome.reasonCodes.slice(0, 6) } : {}),
  });
  return { kind: 'allow' };
}

async function handlePromptSubmit(
  promptText: string,
  projectRoot: string,
  agent: string,
): Promise<void> {
  const markerKey = decisionInflightKeyFor(projectRoot);
  decisionInflightCounts.set(projectRoot, (decisionInflightCounts.get(projectRoot) ?? 0) + 1);
  await keyStore.setKey(markerKey, JSON.stringify({ at: clock.now() }));
  try {
    await runPromptSubmitPipeline(promptText, projectRoot, agent);
  } finally {
    const remaining = Math.max(0, (decisionInflightCounts.get(projectRoot) ?? 1) - 1);
    if (remaining === 0) {
      decisionInflightCounts.delete(projectRoot);
      await keyStore.setKey(markerKey, '');
    } else {
      decisionInflightCounts.set(projectRoot, remaining);
      // Refresh `at` so the still-running sibling keeps a fresh (non-stale)
      // marker for the full duration of its own work.
      await keyStore.setKey(markerKey, JSON.stringify({ at: clock.now() }));
    }
  }
}

async function runPromptSubmitPipeline(
  promptText: string,
  projectRoot: string,
  agent: string,
): Promise<void> {
  const now = clock.now();

  // ── Step 1: Load persisted session state + config ───────────────────────────
  const [loadedState, lang, llmCreds, freqRaw, roleRaw, lastPromptRaw, projectFreqRaw, projectRoleRaw, langOverrideRaw, forceAdvisoryRaw] = await Promise.all([
    idb.loadSessionState(projectRoot),
    idb.getProjectDetectedLanguage(projectRoot),
    resolveLLMCredentials(keyStore),
    keyStore.getKey('advisory_frequency'),
    keyStore.getKey('role'),
    keyStore.getKey(lastPromptKeyFor(projectRoot)),
    // Per-project frequency override (CLI parity: the CLI's Ctrl+X writes
    // `advisory_frequency:<projectRoot>=off`). Kept LAST so the earlier getKey call
    // order (api-key, frequency, role) is unchanged. Absent for every project the
    // user never disabled — then null, and resolution falls through to the global
    // key + default exactly as before (no behaviour change).
    keyStore.getKey(projectFreqKeyFor(projectRoot)),
    // Per-project role (CLI parity: auto.ts reads `role:<projectRoot>` first, then
    // the global `role` — the Ctrl+T role submenu writes the per-project slot).
    keyStore.getKey(projectRoleKeyFor(projectRoot)),
    // language_override (CLI auto.ts step 3.5's getConfig('language_override')).
    keyStore.getKey('language_override'),
    // Hidden test switch — see FORCE_ADVISORY_KEY. Kept last so no existing read
    // shifts position; absent for every real user, and then this is a no-op.
    keyStore.getKey(FORCE_ADVISORY_KEY),
  ]);

  // Publish the resolved credential (own OpenAI key wins; a stored Nexpath
  // token routes the adapters through the configured service via the env's
  // OPENAI_BASE_URL — llm-credentials.ts). Every `apiKey` gate below behaves
  // exactly as before: the variable is the effective bearer, null when neither
  // credential exists.
  applyLLMCredentialEnv(llmCreds);
  const apiKey = llmCreds.apiKey;

  // ── Step 1.2: Cross-page duplicate guard (see CROSS_PAGE_PROMPT_DEDUP_MS) ───
  // Whitespace-insensitive compare: the capture channels serialize the SAME
  // submission differently (composer innerText vs request body vs the
  // prompt-injected marker), and exact `===` let a "Use enhanced" echo through
  // as two billed pipeline runs (F1, live 2026-08-29 — see prompt-dedup.ts).
  if (lastPromptRaw) {
    try {
      const last = JSON.parse(lastPromptRaw) as { text?: unknown; at?: unknown };
      if (typeof last.text === 'string'
        && normalizePromptForDedup(last.text) === normalizePromptForDedup(promptText)
        && typeof last.at === 'number' && now - last.at < CROSS_PAGE_PROMPT_DEDUP_MS) {
        log.debug('prompt_submit_deduped', { projectRoot, ageMs: now - last.at });
        return;
      }
    } catch {
      // malformed record — treat as absent
    }
  }
  await keyStore.setKey(lastPromptKeyFor(projectRoot), JSON.stringify({ text: promptText, at: now }));

  // ── Step 1.5: Resolve frequency + role config — mirrors cli/commands/auto.ts's
  // step 1.5 exactly (same fallback default, same resolveFrequencyConfig call) so
  // the browser's advisory-firing gating is the same logic as the CLI's, just fed
  // from browser.storage.local instead of the sql.js config table.
  // Per-project override wins over the global setting (CLI parity); both fall back
  // to the same 'every_event' default when unset.
  const freq = (projectFreqRaw ?? freqRaw ?? 'every_event') as AdvisoryFrequencyLevel;
  const freqConfig = resolveFrequencyConfig(freq);
  // Exact-equality on purpose: a stray truthy value must not arm this.
  const forceAdvisory = forceAdvisoryRaw === 'enabled';
  if (forceAdvisory) log.debug('advisory_force_key_active', { key: FORCE_ADVISORY_KEY });
  // CLI parity (auto.ts:159): per-project role first, then global, then null.
  const configuredRole = (projectRoleRaw ?? roleRaw) as UserRole | null;

  // ── Step 2: Build sync in-memory port ───────────────────────────────────────
  const memHandle = makeMemoryStoragePort(loadedState, lang);

  // ── Step 3: Classify prompt (Tier 1 keyword → Tier 2 TF-IDF) — CLI parity ────
  // The CLI (auto.ts) runs classifyPrompt with the natural-backed classifyWithTFIDF
  // and NO embedding tier. We mirror that EXACTLY with classifyWithTFIDFBrowser —
  // the browser-safe TF-IDF whose weights are precomputed from `natural` and proven
  // byte-identical in tfidf-browser.test.ts. The former offscreen "Tier 3" was a
  // stub that returned implementation/0.0 and (being present) OVERRODE Tier 2's
  // result — so before this, any prompt that missed a keyword classified as
  // implementation/0. That is the browser's keyword-only gap, now closed. Upstream
  // deleted the embedding tier for the same reason.
  const classification = await classifyPrompt(promptText, {
    tidfClassifier: classifyWithTFIDFBrowser,
  });

  // ── Step 4: Update session state (sync) ─────────────────────────────────────
  const prevStageBeforeUpdate = SessionStateManager.load(memHandle.port, projectRoot, now).current.currentStage;

  const mgr = SessionStateManager.load(memHandle.port, projectRoot, now);
  const prevStage: Stage | undefined = mgr.current.currentStage !== classification.stage
    ? mgr.current.currentStage
    : undefined;

  // ── Step 2.5: LLM user-profile classification — mirrors auto.ts's step 2.5.
  // Populates mgr.current.profile {nature, mood, depth} so the popup CONTENT adapts
  // to the user (register/tone/beginner-option-map) exactly like the CLI — the one
  // thing the browser popup previously never did (profile was permanently null).
  //
  // STRICTLY ADDITIVE — cannot affect any already-running behaviour:
  //   • Same gate as auto.ts (isProfileStale && promptHistory.length ≥
  //     MIN_PROFILE_PROMPTS-1). For the first 3 prompts of a session the gate is
  //     CLOSED → profile stays null → byte-identical to today. Existing tests use
  //     empty/short history, so none of them enter this branch.
  //   • Runs only when an API key exists (no key = no call = null profile as before).
  //   • Time-boxed (8s Promise.race) + .catch → on any hang/failure the profile is
  //     left exactly as it was. Nothing downstream can block on it.
  //   • Only CONTENT reads profile (resolveDecisionContent/pinch/why-help). The
  //     gating fields it also feeds (session-cap vibe ceiling, absence multiplier)
  //     are the SAME CLI-parity effects auto.ts already applies once a profile
  //     forms — and only after ≥3 real prompts, never on the fast fires the tests
  //     and the day-to-day trigger exercise.
  if (apiKey
      && isProfileStale(mgr.current.profile, mgr.current.promptCount)
      && mgr.current.promptHistory.length >= MIN_PROFILE_PROMPTS - 1) {
    const classified = await Promise.race([
      classifyUserProfileLLM(
        mgr.current.promptHistory as PromptRecord[],
        mgr.current.promptCount,
        mgr.current.profile,
        new FetchLLMAdapter(apiKey),
        log,
      ),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
    ]).catch(() => null);
    if (classified) {
      mgr.setProfile(classified);
      log.debug('profile_classified', {
        nature: classified.nature, mood: classified.mood, depth: classified.depth,
      });
    }
  }

  // ── Step 3.8: Stream B presence classification — mirrors auto.ts's step 2.8
  // exactly (same gate: implementation stage + ≥3 prompts in it; same catch →
  // undefined so vibeKeyword detection stands on failure). Runs BEFORE
  // processPrompt so the presence overrides feed this prompt's signal counters,
  // which is what makes absence detection (Step 5.4) meaningful.
  let streamBOverrides: StreamBPresenceResult | undefined;
  if (apiKey
      && mgr.current.currentStage === 'implementation'
      && mgr.current.promptsInCurrentStage >= 3) {
    // Time-boxed: classifyStreamBPresence's chat call carries no timeoutMs, and an
    // un-aborted fetch can stall for minutes on a bad network — hanging the whole
    // submit pipeline (nothing after prompt_submit_received). Cap it here; on
    // timeout the vibeKeyword detection stands, same as the failure path.
    streamBOverrides = await Promise.race([
      classifyStreamBPresence(promptText, new FetchLLMAdapter(apiKey), log),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 8_000)),
    ]).catch(() => {
      log.debug('stream_b_presence_failed', {});
      return undefined;
    });
  }

  // freqConfig.minStageChangeConfidence mirrors auto.ts's step 3 exactly — same
  // gate the CLI uses to decide whether a cross-stage classification is confident
  // enough to actually move currentStage.
  mgr.processPrompt(memHandle.port, promptText, classification, now, freqConfig.minStageChangeConfidence, streamBOverrides);

  // Inject the configured role into an existing profile — mirrors auto.ts's step
  // 2.7. A no-op today: LLM profile classification isn't wired into the browser
  // skeleton yet (mgr.current.profile stays null), so this only takes effect once
  // that lands, but the wiring is correct now rather than needing revisiting then.
  const currentProfileForRole = mgr.current.profile;
  if (currentProfileForRole !== null) {
    mgr.setProfile({ ...currentProfileForRole, role: configuredRole });
  }

  // ── Step 5: PERSIST before any further awaits (SW ephemerality rule) ────────
  const stateAfterClassify = memHandle.getLatestState();
  if (stateAfterClassify) {
    await idb.saveSessionState(stateAfterClassify);
    if (stateAfterClassify.detectedLanguage) {
      await idb.saveProjectDetectedLanguage(projectRoot, stateAfterClassify.detectedLanguage);
    }
  }

  log.debug('prompt_classified', {
    stage: classification.stage,
    confidence: classification.confidence,
    tier: classification.tier,
    promptCount: mgr.current.promptCount,
  });

  // ── Step 5.4: Absence detection (Stream B) — mirrors auto.ts's step 4 exactly:
  // same pure detector over the just-updated session state, same freq-derived
  // threshold multiplier + floor. projectType is undefined in the browser (no
  // projects table) — the detector treats it as "no project-type boost", which is
  // also what the CLI passes for projects it has no type for.
  const newAbsenceFlags = detectAbsenceFlags(
    mgr.current as import('../../core/classifier/types.js').SessionState,
    mgr.current.profile,
    undefined,
    freqConfig.signalAbsenceThresholdMultiplier,
    freqConfig.signalAbsenceMinFloor,
  );
  log.debug('absence_flags', { new: newAbsenceFlags.length, total: mgr.current.absenceFlags.length });

  // ── PE context builder + sequence-shaped fallback (mirrors auto.ts's own) ─────
  // Assemble the browser PE context from what this pipeline already computed. The
  // fallback runs ON BLOCKED EXITS for multi-intent / list-shaped prompts only, so
  // the MPS surface is reachable without an advisory trigger — exactly the CLI's
  // team-lead-approved behaviour. Frequency 'off' stays fully silent (the CLI
  // exits before its fallback too), and every call is failure-shielded: PE can
  // never break the submit pipeline (fail-open rule).
  const buildPeCtx = (overrides: Pick<BrowserPeContext,
    'triggerKind' | 'effectiveFlagType' | 'firedKey' | 'classifierState' | 'triggerEligibility'
  >): BrowserPeContext => ({
    projectRoot,
    promptText,
    sessionId: mgr.current.sessionId,
    promptCount: mgr.current.promptCount,
    currentStage: mgr.current.currentStage,
    prevStage: prevStageBeforeUpdate,
    triggerConfidence: classification.confidence,
    profile: mgr.current.profile,
    configuredRole,
    detectedLanguage: resolveLanguage(langOverrideRaw ?? undefined, mgr.current.detectedLanguage),
    streamBOutputs: streamBOverrides
      ? Object.entries(streamBOverrides)
        .filter(([, present]) => present)
        .map(([signal]) => `stream_b:${signal}`)
      : [],
    recentPromptRefs: mgr.current.promptHistory.map((_, i) =>
      `prompt:${mgr.current.promptCount - mgr.current.promptHistory.length + i}`),
    ...overrides,
  });
  let sequencePeFallbackDone = false;
  const prepareSequenceShapedPeFallback = async (
    eligibility: BrowserPeContext['triggerEligibility'],
  ): Promise<void> => {
    if (sequencePeFallbackDone) return;
    try {
      if (!isPromptEnhancementSequenceShapedTextV1(promptText)) return;
      sequencePeFallbackDone = true;
      const prep = await prepareAndStoreBrowserPe(log, apiKey, buildPeCtx({
        triggerKind: 'stage_transition',
        effectiveFlagType: 'stage_transition',
        firedKey: `sequence_shaped:${mgr.current.promptCount}`,
        classifierState: 'not_applicable',
        triggerEligibility: eligibility,
      }), upsertPendingPe);
      await recordPeDisposition('sequence_fallback', eligibility, mgr.current.promptCount, prep);
    } catch (err) {
      log.debug('pe_prepare_failed', { path: 'sequence_fallback', error: String(err) });
    }
  };

  // ── Step 5.5: Frequency off fast-exit + minimum-prompt guard — mirrors auto.ts's
  // step 4.5 exactly (same order, same gate values from freqConfig). ──────────────
  if (freq === 'off') {
    log.debug('advisory_freq_blocked', { freq });
    return;
  }
  if (mgr.current.promptCount < freqConfig.minPromptsBeforeAdvisory) {
    if (!forceAdvisory) {
      log.debug('advisory_min_prompts_blocked', {
        promptCount: mgr.current.promptCount,
        minRequired: freqConfig.minPromptsBeforeAdvisory,
      });
      await prepareSequenceShapedPeFallback('support_only_not_triggering');
      return;
    }
    log.debug('advisory_gate_forced', {
      gate: 'min_prompts',
      promptCount: mgr.current.promptCount,
      minRequired: freqConfig.minPromptsBeforeAdvisory,
    });
  }

  // ── Step 6: Decide whether Stage 2 should run ───────────────────────────────
  let trigger = shouldFireStage2(
    mgr.current as import('../../core/classifier/types.js').SessionState,
    prevStage,
    newAbsenceFlags,
    freqConfig.stage2S1LowConfidence,
  );

  if (!trigger) {
    if (!forceAdvisory) {
      await prepareSequenceShapedPeFallback('support_only_not_triggering');
      return;
    }
    // Synthesise the simpler of the two trigger kinds: 'stage_transition' needs no
    // qualifying flags, so the downstream flagType/selected_signal_key handling is
    // the same path a natural stage change takes.
    log.debug('advisory_gate_forced', { gate: 'no_trigger', synthesised: 'stage_transition' });
    trigger = { kind: 'stage_transition' };
  }

  // ── Step 6.3: Dedup — already fired this exact stage_transition/absence event
  // this session? — mirrors auto.ts's step 6 (buildFiredKey + hasFiredDecisionSession).
  // Uses prevStageBeforeUpdate (captured before processPrompt ran) as the true prior
  // stage, matching the key format markDecisionSessionFired writes below at Step 10.
  const preCheckFiredKey = trigger.kind === 'stage_transition'
    ? `stage_transition:${prevStageBeforeUpdate}→${mgr.current.currentStage}`
    : `absence:${trigger.qualifyingFlags?.[0]?.signalKey ?? 'unknown'}@${mgr.current.currentStage}`;
  if (mgr.hasFiredDecisionSession(preCheckFiredKey)) {
    if (!forceAdvisory) {
      log.debug('advisory_dedup_blocked', { firedKey: preCheckFiredKey });
      await prepareSequenceShapedPeFallback('blocked_by_dedup');
      return;
    }
    // Without this, a forced run fires ONCE per session and every later attempt is
    // silently deduped — the exact "it worked, now it doesn't" confusion the switch
    // exists to remove.
    log.debug('advisory_gate_forced', { gate: 'dedup', firedKey: preCheckFiredKey });
  }

  // ── Step 6.5: Advisory frequency gate — mirrors auto.ts's step 6.5 exactly. ───
  if (freq === 'major_only' && trigger.kind !== 'stage_transition') {
    log.debug('advisory_freq_blocked', { freq, flagType: trigger.kind });
    await prepareSequenceShapedPeFallback('blocked_by_frequency');
    return;
  }
  if (freq === 'once_per_session' && mgr.current.firedDecisionSessions.length > 0) {
    log.debug('advisory_freq_blocked', { freq, flagType: trigger.kind });
    await prepareSequenceShapedPeFallback('blocked_by_frequency');
    return;
  }

  // ── Step 6.6: Post-advisory cooldown — mirrors auto.ts's step 6.6 exactly. ────
  const lastAdvisory = mgr.current.lastAdvisoryPromptIndex ?? -1;
  if (lastAdvisory >= 0 && mgr.current.promptCount - lastAdvisory < freqConfig.postAdvisoryCooldown) {
    if (!forceAdvisory) {
      log.debug('advisory_cooldown_blocked', {
        promptCount: mgr.current.promptCount,
        lastAdvisoryAt: lastAdvisory,
        cooldownRemaining: freqConfig.postAdvisoryCooldown - (mgr.current.promptCount - lastAdvisory),
      });
      await prepareSequenceShapedPeFallback('blocked_by_post_advisory_cooldown');
      return;
    }
    log.debug('advisory_gate_forced', {
      gate: 'post_advisory_cooldown',
      promptCount: mgr.current.promptCount,
      lastAdvisoryAt: lastAdvisory,
    });
  }

  // ── Step 6.7: Session advisory cap — profile-aware ceiling — mirrors auto.ts's
  // step 6.7 exactly. isVibeProfile stays false today (profile classification isn't
  // wired in the browser yet), so this always uses sessionAdvisoryCapDefault for now.
  const isVibeProfile =
    mgr.current.profile?.nature === 'beginner' ||
    mgr.current.profile?.nature === 'cool_geek';
  const advisoryCap = isVibeProfile
    ? freqConfig.sessionAdvisoryCapVibe
    : freqConfig.sessionAdvisoryCapDefault;
  const advisoryCount = mgr.current.advisoryCount ?? 0;
  if (advisoryCount >= advisoryCap) {
    log.debug('advisory_cap_blocked', { advisoryCount, advisoryCap });
    await prepareSequenceShapedPeFallback('blocked_by_session_cap');
    return;
  }

  if (!apiKey) {
    log.debug('stage2_skipped_no_key', {});
    return;
  }

  // ── Step 6.8: Persist newly-detected absence flags — mirrors auto.ts's step 6.8
  // exactly (all newly-detected flags qualify for Stage 2 consideration).
  if (trigger.kind === 'absence' && newAbsenceFlags.length > 0) {
    for (const flag of newAbsenceFlags) {
      mgr.addAbsenceFlag(memHandle.port, flag);
    }
    // Save NOW, before the Stage-2 await: the CLI's store persists each mutation
    // durably at the call, but the browser's memory port only reaches IDB via an
    // explicit save — without this, a Stage-2 error/decline dropped the flags and
    // the detector re-flagged the same signals every prompt (absence cooldown never
    // engaged; observed live on Lovable 2026-07-10, total stuck at 0).
    const stateAfterFlags = memHandle.getLatestState();
    if (stateAfterFlags) {
      await idb.saveSessionState(stateAfterFlags);
    }
  }

  // ── Step 7: Run Stage 2 LLM analysis ────────────────────────────────────────
  const llm = new FetchLLMAdapter(apiKey);
  const state = mgr.current as import('../../core/classifier/types.js').SessionState;

  log.debug('stage2_started', {
    trigger: trigger.kind,
    prevStage: prevStageBeforeUpdate,
    stage: mgr.current.currentStage,
  });

  // Stage2Input's actual shape (confirmed against core/stage2.ts, 2026-07-02 — the
  // object literal here previously omitted required fields `detectedStage`/`confidence`
  // and included nonexistent fields `prevStage`/`promptHistory`, silently invisible
  // because tsconfig.ext-browser.json was never invoked; buildStage2Prompt's
  // `confidence.toFixed(2)` crashed on the resulting undefined at runtime, confirmed
  // live). `flagType` is the bare category only ('stage_transition' | 'absence') —
  // NOT the same as core/stage2.ts's separate `FlagType` template-literal type used
  // by resolveDecisionContent/generatePinchLabel below; the specific signal is carried
  // via `qualifyingFlags` instead.
  const stage2Input = {
    state,
    detectedStage: classification.stage,
    confidence: classification.confidence,
    flagType: (trigger.kind === 'stage_transition' ? 'stage_transition' : 'absence') as 'stage_transition' | 'absence',
    qualifyingFlags: trigger.kind === 'absence' ? trigger.qualifyingFlags : undefined,
  };
  // Frequency-derived overrides — mirrors auto.ts's step 7 exactly, instead of
  // always using runStage2's hardcoded defaults regardless of the user's setting.
  const stage2Opts = { minConfidence: freqConfig.stage2MinConfidence, contextWindow: freqConfig.stage2ContextWindow };

  let stage2Out: import('../../core/stage2.js').Stage2Output | undefined;
  // Cold-start retry, timeout class ONLY. core/stage2's fixed 6s budget (unchanged
  // since the module's first commit, 32d0914 — a CLI-era assumption) can be exceeded
  // by the FIRST OpenAI call after an MV3 SW spin-up (DNS+TLS+cold pool); observed
  // live 3× (2026-07-02/10/11), always first-call-after-idle, never on the warm
  // retry. Without this, the trigger is consumed silently: the stage has already
  // moved, so the same prompt never re-fires — a lost advisory. Non-timeout errors
  // keep failing fast (no retry). The added ~6s worst case on the submit path is
  // covered by the response-stop decision-inflight waiter, so it cannot re-open
  // the fast-response race.
  for (let attempt = 0; attempt < 2 && stage2Out === undefined; attempt++) {
    try {
      stage2Out = await runStage2(stage2Input, llm, log, stage2Opts);
    } catch (err) {
      const isTimeout = String(err).includes('AbortError');
      if (attempt === 0 && isTimeout) {
        log.debug('stage2_timeout_retry', {});
        continue;
      }
      log.warn('stage2_error', { error: String(err) });
      await keyStore.setKey(LAST_STAGE2_RESULT_KEY, JSON.stringify({ at: now, error: String(err) }));
      return;
    }
  }
  if (stage2Out === undefined) return; // unreachable; satisfies narrowing

  // The LLM's verdict was previously invisible when it declined — the single most
  // important pipeline decision must always leave a log line (found via a live manual
  // test where "no panel" was indistinguishable from a crash).
  log.debug('stage2_result', {
    fire: stage2Out.fire_decision_session,
    stage: stage2Out.stage,
    confidence: stage2Out.stage_confidence,
    reason: stage2Out.reason,
  });
  // Persisted too: SW console lines die with the SW (MV3 teardown), so the log alone
  // is unreadable after the fact — the options page + the injector's debug channel
  // surface this record instead.
  await keyStore.setKey(LAST_STAGE2_RESULT_KEY, JSON.stringify({
    at: now,
    fire: stage2Out.fire_decision_session,
    stage: stage2Out.stage,
    confidence: stage2Out.stage_confidence,
    reason: stage2Out.reason,
    trigger: trigger.kind,
    prevStage: prevStageBeforeUpdate,
  }));

  if (!stage2Out.fire_decision_session && forceAdvisory) {
    // Override the VERDICT only — the stage, confidence, signal assessments and
    // reason stay exactly as the model produced them, so the popup below is built
    // from real pipeline output rather than a fabricated payload.
    log.debug('advisory_gate_forced', { gate: 'stage2_verdict', modelReason: stage2Out.reason });
    stage2Out.fire_decision_session = true;
  }

  if (!stage2Out.fire_decision_session) {
    await prepareSequenceShapedPeFallback('too_weak_no_popup');
    return;
  }

  // ── Step 7.5: Feed Stage 2 signal assessments back into signal counters —
  // mirrors auto.ts's step 7.5 (keeps future absence detection honest about
  // which practices Stage 2 saw evidence of).
  mgr.applyStage2SignalUpdates(memHandle.port, stage2Out.signals_present);

  // Persist state again after LLM call (now includes the signal updates)
  const stateAfterStage2 = memHandle.getLatestState();
  if (stateAfterStage2) {
    await idb.saveSessionState(stateAfterStage2);
  }

  // ── Step 8: Build advisory payload ──────────────────────────────────────────
  // Effective flagType — mirrors auto.ts's step 8 exactly: for absence, Stage 2
  // SELECTS the signal to surface (selected_signal_key), which may differ from the
  // first qualifying flag.
  const flagType = trigger.kind === 'stage_transition'
    ? ('stage_transition' as const)
    : (`absence:${stage2Out.selected_signal_key}` as `absence:${string}`);

  // Effective language — mirrors auto.ts's step 3.5 exactly via the shared
  // resolveLanguage (override wins IFF it is a valid language code, else the detected
  // language, else undefined = LLM default). detectedLanguage is populated by the
  // response-stop detection below, exactly like the CLI's auto reads the value that
  // `nexpath stop` detected and stored.
  const effectiveLang = resolveLanguage(
    langOverrideRaw ?? undefined,
    mgr.current.detectedLanguage,
  );

  const content = resolveDecisionContent(
    state.currentStage,
    flagType,
    state.profile ?? undefined,
    prevStage,
  );

  const pinchLabel = await generatePinchLabel(
    state.currentStage,
    flagType,
    llm,
    state.profile ?? undefined,
    effectiveLang,
  ).catch(() => content.pinchFallback);

  // CLI parity (Option A) — option personalisation happens at RESPONSE-STOP, NOT here.
  // The CLI runs generateOptionList in the Stop hook (stop.ts), never at submit. Doing
  // it here (2 extra LLM calls) would delay persisting the pending advisory below, and
  // a fast agent response could reach response-stop before the advisory is queued →
  // missed popup. So queue STATIC levels now (instant) and let handleResponseStop
  // personalise + resolve the R4/R5 markers at show time. buildLevels(content, null)
  // is the pre-Option-A static mapping (title = option, body = raw desc-base).
  const levels = buildLevels(content, null);

  // Why-help register: use the engine's own profileToRegister — with no browser
  // profile (state.profile === null) it returns 'casual', the CLI's identical
  // no-profile default (register.ts), so the block renders as the CLI would.
  const whyHelp = composeWhyHelpBlock(
    content.whyHelp,
    profileToRegister(state.profile),
    state.profile?.mood,
    configuredRole,
  );

  const payload: AdvisoryPayload = {
    schemaVersion: 1,
    advisoryId: globalThis.crypto.randomUUID(),
    pinchLabel,
    stage: state.currentStage,
    question: content.question,
    whyHelp,
    levels,
    // Flat first-of-each-level view — the shipped panel indexes this by level.
    options: optionsFromLevels(levels),
    meta: {
      agent,
      frequency: freq,
      role: configuredRole,
    },
  };

  // ── Step 9: Record advisory + decision-session fired ─────────────────────────
  // CLI parity (cli/commands/auto.ts:375,410): the DECISION happens now, at prompt
  // submit — mark both fired here (so cooldown/session-cap/once-per-session gating
  // counts this advisory immediately, exactly like the CLI's `auto` hook), even
  // though the popup itself is shown later, when the agent's response completes.
  // The absence key uses the EFFECTIVE flagType (Stage 2's selected signal),
  // matching auto.ts's buildFiredKey(effectiveFlagType, …) format `<flag>@<stage>`.
  mgr.markAdvisoryFired(memHandle.port);
  if (trigger.kind === 'stage_transition' || trigger.kind === 'absence') {
    const sessionKey = trigger.kind === 'stage_transition'
      ? `stage_transition:${prevStageBeforeUpdate}→${state.currentStage}`
      : `${flagType}@${state.currentStage}`;
    mgr.markDecisionSessionFired(memHandle.port, sessionKey);
  }

  const stateAfterMark = memHandle.getLatestState();
  if (stateAfterMark) {
    await idb.saveSessionState(stateAfterMark);
  }

  // ── Step 10: Queue the advisory — shown on response-stop, NOT now ─────────────
  // The CLI's popup appears on the Stop hook, after Claude finishes responding
  // (cli/commands/stop.ts). We mirror that: persist the built payload and let the
  // response-stop handler render it once the agent's turn completes — never before
  // or mid-generation. Overwrites any still-pending advisory (latest wins, like the
  // CLI's upsertPendingAdvisory).
  const ogContext: PendingOgContext = {
    stage:                 state.currentStage,
    flagType,
    prevStage:             prevStage ?? null,
    promptsInCurrentStage: state.promptsInCurrentStage,
    language:              effectiveLang ?? null,
    profile:               state.profile ?? null,
    promptHistory:         state.promptHistory,
  };
  await Promise.all([
    keyStore.setKey(pendingAdvisoryKeyFor(projectRoot), JSON.stringify(payload)),
    keyStore.setKey(pendingAdvisoryOgKeyFor(projectRoot), JSON.stringify(ogContext)),
  ]);
  log.debug('advisory_pending', { projectRoot, advisoryId: payload.advisoryId, stage: payload.stage });

  // ── Step 11: Prompt-enhancement prepare — fired-trigger path ──────────────────
  // Runs AFTER the pending-advisory persist above (the Option-A lesson: nothing
  // may delay that write — a fast agent response races response-stop), and still
  // inside handlePromptSubmit's inflight marker, so response-stop waits for this
  // too. Same split as the CLI: auto.ts prepares + parks at submit, stop.ts shows
  // at response-stop. Failure-shielded — PE can never break the submit pipeline.
  try {
    const peFiredKey = trigger.kind === 'stage_transition'
      ? `stage_transition:${prevStageBeforeUpdate}→${state.currentStage}`
      : `${flagType}@${state.currentStage}`;
    const peSignalKey = trigger.kind === 'absence' ? stage2Out.selected_signal_key : undefined;
    const peDismissedBefore = typeof peSignalKey === 'string' && state.absenceFlags.some(
      (f) => f.signalKey === peSignalKey && f.dismissedAtIndex !== undefined,
    );
    const peEligibility = peDismissedBefore ? 'dismissed_or_user_skipped' : 'fresh_trigger_eligible';
    const prep = await prepareAndStoreBrowserPe(log, apiKey, buildPeCtx({
      triggerKind: trigger.kind,
      effectiveFlagType: flagType,
      firedKey: peFiredKey,
      classifierState: 'fire_recommended',
      triggerEligibility: peEligibility,
    }), upsertPendingPe);
    await recordPeDisposition('fired_trigger', peEligibility, mgr.current.promptCount, prep);
  } catch (err) {
    log.debug('pe_prepare_failed', { path: 'fired_trigger', error: String(err) });
  }
}

/**
 * Advisory-surface switch. The CLI's PE branch REMOVED the decision-session
 * advisory popup outright (MPS-7) — a queued advisory is consumed silently and
 * the prompt-enhancement popup is the surface the user sees. That is this
 * extension's DEFAULT. The hidden storage.local key below, set to the exact
 * string 'enabled' (A9: exact-equality read, never truthiness), restores the
 * legacy advisory popup byte-for-byte — the escape hatch the plan requires to
 * stay reversible. Never surfaced in the options UI (hidden-key guard test).
 */
const ADVISORY_LEGACY_SURFACE_KEY = 'nexpath_advisory_legacy_surface';

/**
 * Response-stop dispatcher — CLI-parity popup timing (the browser's Stop hook).
 * Reads the switch and routes: default = PE-first (mirrors the CLI's PE
 * branch of stop.ts — feedback popups don't exist in the browser, PE popup
 * next, advisory surface removed); 'enabled' = the legacy advisory flow,
 * unchanged, with any pending PE row consumed silently so the two surfaces
 * can never stack.
 */
async function handleResponseStop(projectRoot: string, tabId: number | undefined): Promise<void> {
  // RC43: a stop arriving while this project's submit is still being decided is
  // our own echo. Dropping it here is safe — the pending rows are untouched, so
  // the real stop that follows still finds them.
  if (isResponseStopQuiet(projectRoot)) {
    log.debug('response_stop_quiet_window', { projectRoot });
    return;
  }
  let legacySurface = false;
  try {
    legacySurface = (await keyStore.getKey(ADVISORY_LEGACY_SURFACE_KEY)) === 'enabled';
  } catch { /* switch unreadable → CLI-parity default */ }
  if (!legacySurface) return handleResponseStopPeFirst(projectRoot, tabId);
  try {
    const state = await idb.loadSessionState(projectRoot);
    const pe = await getPendingPe(projectRoot, state?.sessionId);
    if (pe) {
      await markPendingPeShown(projectRoot);
      log.debug('pe_suppressed_legacy_surface', { projectRoot });
    }
  } catch { /* suppression is best-effort — the legacy advisory flow must run */ }
  return handleResponseStopLegacyAdvisory(projectRoot, tabId);
}

/**
 * PE-first response-stop (the default) — the browser mirror of the CLI PE
 * branch's Stop hook: wait out a still-running submit decision, consume any
 * queued advisory SILENTLY (MPS-7 — the advisory popup no longer exists on
 * this surface), then show the parked prompt enhancement through the engine's
 * own popup state machine. `not_shown` leaves the row pending for the next
 * stop (stop.ts:614–616); a cooldown hit consumes it with a ring event
 * (stop.ts:552–561).
 */
async function handleResponseStopPeFirst(projectRoot: string, tabId: number | undefined): Promise<void> {
  // The submit pipeline queues the advisory AND parks the PE before clearing
  // its inflight marker — wait for the MARKER here (not for a row: the PE
  // prepare runs last, so a row-based wait could read a half-finished turn).
  await waitForSubmitPipelineIdle(projectRoot, 'response_stop_waiting_for_decision');

  // MPS-7: consume the queued advisory silently — the surface is removed.
  const advKey = pendingAdvisoryKeyFor(projectRoot);
  if (await keyStore.getKey(advKey)) {
    await Promise.all([
      keyStore.setKey(advKey, ''),
      keyStore.setKey(pendingAdvisoryOgKeyFor(projectRoot), ''),
    ]);
    log.debug('advisory_removed_surface', { projectRoot });
  }

  const state = await idb.loadSessionState(projectRoot);
  const pe = await getPendingPe(projectRoot, state?.sessionId);
  if (!pe) {
    // PB6 fail-closed row behaviour: an active sequence row with no pending PE
    // would be the CLI's continuation moment — the browser has no continuation
    // runtime (deferred), so it logs and does NOTHING, exactly the CLI's
    // planner-off default. Content-free: counts only.
    try {
      const seq = await getPendingSequence(projectRoot);
      if (seq) {
        log.debug('pe_sequence_continuation_gated', {
          projectRoot,
          remainingTaskCount: seq.remainingTaskCount,
        });
      }
    } catch { /* diagnosability only — never affects the stop path */ }
    return;
  }

  // Stale-pending age gate (browser-only defect class — live Firefox/Bolt
  // 2026-08-25): the CLI's Stop fires seconds after each response, so a CLI
  // pending can never sleep across sittings — but a browser row survives page
  // closes and can resurrect at a stop HOURS later carrying a long-gone
  // prompt's body, and that stale show then burns the cooldown window,
  // suppressing the fresh popups the user actually asked for. A pending older
  // than the longest legitimate agent run is consumed silently — WITHOUT the
  // cooldown mark (only a real render starts the window, line ~1119).
  const pendingAgeMs = clock.now() - pe.createdAt;
  if (pendingAgeMs > PE_PENDING_MAX_AGE_MS) {
    await markPendingPeShown(projectRoot);
    log.debug('pe_pending_expired_stale', { projectRoot, ageMs: pendingAgeMs });
    return;
  }

  // No usable tab → leave the row pending for the next stop (advisory parity —
  // the 2026-07-10 lesson: never consume before a render is possible).
  if (!tabId) {
    log.warn('pe_stop_no_tab', {});
    return;
  }

  // Honour frequency 'off' toggled since the prepare (CLI stop-gate parity).
  const [projFreqRaw, globalFreqRaw] = await Promise.all([
    keyStore.getKey(projectFreqKeyFor(projectRoot)),
    keyStore.getKey('advisory_frequency'),
  ]);
  if ((projFreqRaw ?? globalFreqRaw ?? 'every_event') === 'off') {
    await markPendingPeShown(projectRoot);
    log.debug('pe_suppressed_freq_off', { projectRoot });
    return;
  }

  // PE popup cooldown (default 7 prompts; stop.ts:552–561): suppressed shows
  // CONSUME the row — a cooldown hit is a decision, not a deferral.
  const cooldown = await resolvePePopupCooldown(projectRoot);
  const lastShownIndex = state?.lastPromptEnhancementPromptIndex;
  const promptCount = state?.promptCount ?? pe.promptCount;
  if (typeof lastShownIndex === 'number' && cooldown > 0 && promptCount - lastShownIndex < cooldown) {
    await markPendingPeShown(projectRoot);
    log.debug('pe_popup_cooldown', { projectRoot, promptCount, lastShownIndex, cooldown });
    return;
  }

  const [llmCreds, sequenceEnabled] = await Promise.all([
    resolveLLMCredentials(keyStore),
    resolvePeSequenceEnabled(projectRoot),
  ]);
  // Own key wins; token mode routes via the service (llm-credentials.ts).
  applyLLMCredentialEnv(llmCreds);
  const apiKey = llmCreds.apiKey;
  const stopOutcome = await runBrowserPePopup({
    log,
    projectRoot,
    apiKey,
    record: pe,
    sequenceEnabled,
    feedbackStore: keyStore, // PE-BR-11 closed: PEF events persist locally
    sendToTab: (m) => browser.tabs.sendMessage(tabId, m),
    onFirstRendered: async () => {
      // First real render: consume the row + start the cooldown window — the
      // same bookkeeping SessionStateManager.markPromptEnhancementPopupShown
      // does on the manager-mediated path, applied to the loaded state here.
      await markPendingPeShown(projectRoot);
      if (state) {
        state.lastPromptEnhancementPromptIndex = state.promptCount;
        await idb.saveSessionState(state);
      }
    },
  });
  const outcome = stopOutcome.result;

  // MPS-1 (popup-host parity): the parent records the sequence row ONLY when
  // the first popup was SENT — ids and counts, never text. Continuations stay
  // deferred; nothing reads this to drive behaviour yet.
  if (stopOutcome.mpsFirstPopupSent && stopOutcome.mpsIdentity && state) {
    try {
      await recordPendingSequence(projectRoot, {
        sessionId: state.sessionId,
        createdAt: clock.now(),
        status: 'first_sent',
        ...stopOutcome.mpsIdentity,
      });
      log.debug('pe_sequence_recorded', {
        projectRoot,
        remainingTaskCount: stopOutcome.mpsIdentity.remainingTaskCount,
      });
    } catch (err) {
      log.warn('pe_sequence_record_failed', { projectRoot, error: String(err) });
    }
  }

  if (outcome.state === 'selected_current') {
    try {
      await browser.tabs.sendMessage(tabId, {
        type: 'nexpath:pe-inject', projectRoot, text: outcome.bodyText,
      });
      log.debug('pe_injected', { projectRoot, chars: outcome.bodyText.length });
    } catch (err) {
      log.warn('pe_inject_failed', { projectRoot, error: String(err) });
    }
  } else if (outcome.state === 'selected_original') {
    log.debug('pe_use_original', { projectRoot });
  } else if (outcome.state === 'closed_no_send') {
    log.debug('pe_closed_no_send', { projectRoot });
  } else {
    log.debug('pe_not_shown', { projectRoot, reasonCodes: outcome.reasonCodes.slice(0, 6) });
  }
}

/**
 * LEGACY response-stop handler (switch 'enabled') — the shipped advisory
 * flow, byte-for-byte. Shows the advisory that handlePromptSubmit queued for
 * this project, if any — so the popup lands AFTER the response, never
 * before/during it. Mirrors cli/commands/stop.ts (runStop): pull pending →
 * clear immediately (dedup on rapid re-fires) → re-check the freq gate
 * (honour a Ctrl+X pressed since queuing) → render.
 */
async function handleResponseStopLegacyAdvisory(projectRoot: string, tabId: number | undefined): Promise<void> {
  const key   = pendingAdvisoryKeyFor(projectRoot);
  const ogKey = pendingAdvisoryOgKeyFor(projectRoot);
  let [raw, ogRaw] = await Promise.all([
    keyStore.getKey(key),
    keyStore.getKey(ogKey),
  ]);
  // Own key wins; token mode routes via the service (llm-credentials.ts).
  const llmCreds = await resolveLLMCredentials(keyStore);
  applyLLMCredentialEnv(llmCreds);
  const apiKey = llmCreds.apiKey;

  if (!raw) {
    // Nothing queued YET — but the submit-path decision may still be running (see
    // decisionInflightKeyFor: a fast agent response races the pipeline's LLM calls
    // and used to lose the popup permanently). Wait for the decision to settle.
    const inflightRaw = await keyStore.getKey(decisionInflightKeyFor(projectRoot));
    if (!inflightRaw) return; // no decision running — genuinely nothing to show
    try {
      const inflight = JSON.parse(inflightRaw) as { at?: unknown };
      if (typeof inflight.at !== 'number' || clock.now() - inflight.at > DECISION_INFLIGHT_STALE_MS) {
        return; // stale marker from a torn-down pipeline — don't wait on it
      }
    } catch {
      return;
    }
    log.debug('response_stop_waiting_for_decision', { projectRoot });
    const deadline = clock.now() + DECISION_WAIT_MAX_MS;
    while (clock.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, DECISION_WAIT_POLL_MS));
      raw = await keyStore.getKey(key);
      if (raw) break;
      const stillInflight = await keyStore.getKey(decisionInflightKeyFor(projectRoot));
      if (!stillInflight) {
        // Decision finished. One last read — the pipeline queues the advisory
        // BEFORE clearing the marker, so this catches the final write.
        raw = await keyStore.getKey(key);
        break;
      }
    }
    if (!raw) return; // decision ended without queuing (gated/declined) or timed out
    ogRaw = await keyStore.getKey(ogKey); // sidecar was written alongside the payload
  }

  // No usable tab → leave the pending QUEUED for the next stop event. This check
  // must run BEFORE the clear below: the old order cleared first and returned,
  // silently DESTROYING the advisory whenever a stop event arrived without a
  // resolvable tab id (found in the 2026-07-10 commit audit — a deterministic
  // "advisory fired but no popup ever" path that left no trace but one warn line).
  if (!tabId) {
    log.warn('show_advisory_no_tab', {});
    return;
  }

  // Clear both keys before showing so a second Stop event (agents re-fire it) can't double-show.
  await Promise.all([keyStore.setKey(key, ''), keyStore.setKey(ogKey, '')]);

  // Honour opt-out / frequency=off toggled after the advisory was queued (CLI stop gate).
  const [projFreqRaw, globalFreqRaw] = await Promise.all([
    keyStore.getKey(projectFreqKeyFor(projectRoot)),
    keyStore.getKey('advisory_frequency'),
  ]);
  if ((projFreqRaw ?? globalFreqRaw ?? 'every_event') === 'off') {
    log.debug('pending_advisory_freq_off', { projectRoot });
    return;
  }

  
  let payload: AdvisoryPayload;
  try {
    payload = JSON.parse(raw) as AdvisoryPayload;
  } catch {
    log.warn('pending_advisory_parse_failed', { projectRoot });
    return;
  }

  // ── CLI parity (Option A / stop.ts): personalise the option titles + resolve the
  // R4/R5 desc markers NOW, at show time — exactly where the CLI runs generateOptionList
  // (the Stop hook). Kept off the submit path so queuing the advisory stays instant and
  // a fast response can't race past it. handleResponseStop runs detached (see the message
  // dispatcher), so these LLM calls don't block the ack. On any failure we show the static
  // levels already in the payload — degraded but never a missed popup.
  if (ogRaw && apiKey) {
    try {
      const og      = JSON.parse(ogRaw) as PendingOgContext;
      const content = resolveDecisionContent(og.stage, og.flagType, og.profile ?? undefined, og.prevStage ?? undefined);

      // ── CLI parity (stop.ts): natural-language detection over recent prompts,
      // run post-response like the CLI. Only fires once >= LANG_DETECT_INTERVAL prompts
      // exist for this project. tinyld runs locally (no API cost). The detected code is
      // persisted so later submits pick it up (auto.ts reads the stored value), and the
      // freshly-resolved language is what this advisory's options are generated in —
      // before this, detectedLanguage was NEVER set, so a non-English user's popup only
      // localised if they manually set language_override. Failure is swallowed (English
      // default) — language must never block the popup.
      let optionLanguage = og.language ?? undefined;
      try {
        const history = og.promptHistory ?? [];
        if (history.length >= LANG_DETECT_INTERVAL) {
          const priorDetected = await idb.getProjectDetectedLanguage(projectRoot);
          const detected = detectLanguage(
            history.slice(-LANG_WINDOW).map((p) => p.text),
            priorDetected ?? undefined,
          );
          if (detected && detected !== priorDetected) {
            await idb.saveProjectDetectedLanguage(projectRoot, detected);
          }
          const override = await keyStore.getKey('language_override');
          optionLanguage = resolveLanguage(override ?? undefined, detected);
          log.debug('stop_lang_detected', { detected: detected ?? null });
        }
      } catch (err) {
        log.warn('lang_detect_failed', { error: String(err) });
      }

      const gen = await generateOptionList(
        content,
        og.profile ?? undefined,
        optionLanguage,
        og.promptHistory ?? [],
        {
          flagType:              og.flagType,
          currentStage:          og.stage,
          prevStage:             og.prevStage ?? undefined,
          promptsInCurrentStage: og.promptsInCurrentStage,
        },
        new FetchLLMAdapter(apiKey),
      ).catch((err: unknown) => {
        // The reason must reach the ring buffer: a swallowed rejection here is
        // indistinguishable from a guard skip (cost a live debugging session, 2026-07-10).
        log.warn('advisory_personalize_rejected', { error: String(err) });
        return null;
      });
      if (gen) {
        payload.levels  = buildLevels(content, gen);
        payload.options = optionsFromLevels(payload.levels);
        log.debug('advisory_personalized', { advisoryId: payload.advisoryId });
      } else {
        // Engine returned null without throwing — its internal retry/validation
        // fallback. Details are on the SW console (engine logs option_gen_*).
        log.debug('advisory_personalize_null', { advisoryId: payload.advisoryId });
      }
    } catch (err) {
      log.warn('advisory_personalize_failed', { error: String(err) });
    }
  } else {
    log.debug('advisory_personalize_skipped', { hasOg: !!ogRaw, hasApiKey: !!apiKey });
  }

  const ui = new ContentScriptUIAdapter(tabId);
  try {
    log.debug('advisory_showing', { tabId, advisoryId: payload.advisoryId, stage: payload.stage });
    // The terminal outcome is RECORDED via the one-way nexpath:advisory-terminal
    // message (dispatcher above), not here — this await's resolution dies whenever
    // MV3 tears the SW down while the popup sits open (observed live 2026-07-10),
    // so logging advisory_dismissed here both missed events and would now double
    // them. The await itself stays: it keeps this SW instance alive while it can.
    await ui.showAdvisory(payload);
  } catch (err) {
    log.warn('show_advisory_error', { error: String(err) });
  }
}

/**
 * CLI-parity panel footer shortcuts (see AdvisoryFooterIntentMsg).
 *   - 'disable-project' → write `advisory_frequency:<projectRoot>=off` (the exact
 *     slot the CLI's Ctrl+X writes; handlePromptSubmit reads it with precedence).
 *   - 'open-settings'   → open the extension options page (CLI Ctrl+T equivalent).
 */
const PANEL_FREQUENCY_VALUES = new Set(['optimum', 'every_event', 'major_only']);
const PANEL_ROLE_VALUES = new Set(['founder', 'vibe_coder', 'indie_hacker', 'pm']);

async function handleAdvisoryFooterIntent(
  intent: 'disable-project' | 'open-settings' | 'set-frequency' | 'set-role',
  projectRoot: string,
  value?: string,
): Promise<void> {
  if (intent === 'disable-project') {
    await keyStore.setKey(projectFreqKeyFor(projectRoot), 'off');
    log.debug('advisory_disabled_for_project', { projectRoot });
    return;
  }
  // Ctrl+, chooser writes — GLOBAL keys, the same slots the options page reads and
  // writes, so the popup chooser and the settings page are ONE setting (user
  // decision 2026-07-10: the CLI's Ctrl+T writes per-project, but in the browser
  // that silently diverged from the visible settings page — confusing). Also clear
  // any per-project frequency override so a previously Ctrl+.-disabled or
  // project-tuned root follows the new choice instead of shadowing it.
  // Values whitelisted to the chooser's own menu entries — a compromised page can
  // post arbitrary footer intents, so never write an unvalidated string into config.
  if (intent === 'set-frequency') {
    if (!value || !PANEL_FREQUENCY_VALUES.has(value)) {
      log.warn('advisory_set_frequency_rejected', { value: value ?? null });
      return;
    }
    await Promise.all([
      keyStore.setKey('advisory_frequency', value),
      keyStore.setKey(projectFreqKeyFor(projectRoot), ''),
    ]);
    log.debug('advisory_frequency_set', { projectRoot, value });
    return;
  }
  if (intent === 'set-role') {
    if (!value || !PANEL_ROLE_VALUES.has(value)) {
      log.warn('advisory_set_role_rejected', { value: value ?? null });
      return;
    }
    await Promise.all([
      keyStore.setKey('role', value),
      keyStore.setKey(projectRoleKeyFor(projectRoot), ''),
    ]);
    log.debug('advisory_role_set', { projectRoot, value });
    return;
  }
  // open-settings
  await browser.runtime.openOptionsPage();
}
