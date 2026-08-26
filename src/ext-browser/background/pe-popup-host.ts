/**
 * Browser PE popup host — the service worker's mirror of the CLI's
 * `prompt-enhancement-popup-host` child process, with the ENGINE'S OWN popup
 * state machine (`runPromptEnhancementCliSubmitPopupV1`) doing all the logic.
 * The browser contributes exactly one thing: an injected `interaction` whose
 * `next(view)` pushes a whitelisted view to the content-script panel and
 * resolves with the user's next command. Everything else — F2 smooth send,
 * directional refinements, the go-back stack, F3 silent action failures,
 * sendability validation — is the CLI's shipped code path.
 *
 * A2 posture (SW must not be the only holder of the decision): the panel's
 * terminal clicks are ALSO reported through a one-way notice that consumes the
 * pending row on whatever SW instance is alive, the content side keeps a
 * fail-open timeout (nothing is ever sent on a dead SW), and while the popup
 * is open the content script heartbeats so MV3 keeps this instance alive.
 * Residual risk — a refinement round-trip dying with the SW — degrades to the
 * CLI's own F3 behaviour: previous body kept, reason in the log.
 */

import type { LogPort } from '../../core/ports/log.port.js';
import type {
  PromptEnhancementPrepareRequestV1,
  PromptEnhancementPrepareResultV1,
} from '../../prompt-enhancement/contracts.js';
import type { PendingPeRecord } from '../adapters/pe-pending-store.js';
import {
  PROMPT_ENHANCEMENT_CONTRACT_VERSION,
  buildPromptEnhancementCliMpsIntakeEvidenceV1,
  buildPromptEnhancementFeedbackAdapterStateV1,
  buildPromptEnhancementMpsFirstPopupV1,
  editPromptEnhancementOtherFeedbackV1,
  emitPromptEnhancementCostObservabilityV1,
  evaluatePromptEnhancementMpsIntakeDecisionV1,
  openPromptEnhancementFeedbackV1,
  promptEnhancementMpsActionSignalKindV1,
  refreshEngineKeyEnv,
  runPromptEnhancementCliSubmitPopupV1,
  submitPromptEnhancementOtherFeedbackV1,
  submitPromptEnhancementSuggestedFeedbackV1,
  type PromptEnhancementCliPopupCommandV1,
  type PromptEnhancementCliPopupInteractionV1,
  type PromptEnhancementCliPopupResultV1,
  type PromptEnhancementCliPopupViewV1,
  type PromptEnhancementMpsFirstPopupModelV1,
} from './pe-engine.js';
import { recordPeFeedbackEvent, type PeFeedbackKeyStore } from '../adapters/pe-feedback-store.js';
import {
  PE_PANEL_SCHEMA_VERSION,
  isPePanelCommandV1,
  type PePanelCommandV1,
  type PeSequenceOfferViewV1,
  type PePanelViewV1,
} from '../ui/pe-contract.js';

// ── Command mailbox ─────────────────────────────────────────────────────────────
//
// One live popup per project root. The panel posts commands as short-lived
// runtime messages; the popup loop's interaction awaits them here. Stale-guard:
// a command is accepted only when its echoed viewSeq matches the seq of the
// LAST view pushed — anything else is a late reply from a superseded render
// and is dropped with a log line (the plan's stale-result discipline).

interface Mailbox {
  expectedSeq: number;
  waiter: ((command: PePanelCommandV1) => void) | null;
  queued: PePanelCommandV1 | null;
}

const mailboxes = new Map<string, Mailbox>();

/** True while a popup loop is live for this root (guards double-open). */
export function isPePopupOpen(projectRoot: string): boolean {
  return mailboxes.has(projectRoot);
}

/**
 * Entry point for `nexpath:pe-command` messages. Returns true when the command
 * was delivered to a live popup loop.
 */
export function deliverPePanelCommand(
  log: LogPort,
  projectRoot: string,
  viewSeq: number,
  command: unknown,
): boolean {
  const box = mailboxes.get(projectRoot);
  if (!box) {
    log.debug('pe_command_no_popup', { projectRoot });
    return false;
  }
  if (!isPePanelCommandV1(command)) {
    log.debug('pe_command_invalid', { projectRoot });
    return false;
  }
  if (viewSeq !== box.expectedSeq) {
    log.debug('pe_command_stale', { projectRoot, viewSeq, expectedSeq: box.expectedSeq });
    return false;
  }
  if (box.waiter) {
    const w = box.waiter;
    box.waiter = null;
    w(command);
  } else if (box.queued === null) {
    box.queued = command;
  } else {
    // Two commands in flight for one view — the panel disables inputs while
    // busy, so this is a double-click race; keep the first, drop the second.
    log.debug('pe_command_dropped_duplicate', { projectRoot });
    return false;
  }
  return true;
}

// ── View projection ─────────────────────────────────────────────────────────────

/** Whitelist the engine's render view down to what the panel may see. */
export function buildPePanelView(
  view: PromptEnhancementCliPopupViewV1,
  viewSeq: number,
): PePanelViewV1 {
  const model = view.model;
  const directional = model.controls.directional
    .filter((d) =>
      d.action.actionType === 'shorter'
      || d.action.actionType === 'more_thorough'
      || d.action.actionType === 'more_project_grounded')
    .map((d) => ({
      actionType: d.action.actionType as 'shorter' | 'more_thorough' | 'more_project_grounded',
      label: d.action.label,
      availability: d.uiAvailabilityState,
    }));
  const out: PePanelViewV1 = {
    schemaVersion: PE_PANEL_SCHEMA_VERSION,
    viewSeq,
    title: model.title,
    editorHeading: model.editorHeading,
    bodyText: view.editedBodyText,
    bodyEditable: model.body.editable,
    hasAdditionalDetails: model.controls.additionalDetails !== undefined,
    additionalDetailsText: view.additionalDetailsText,
    // The CLI's row-availability truth (buildPromptEnhancementCliActionRowsV1
    // :636/:672): the rows always render; unavailable ones carry the marker.
    detailsAvailable: model.controls.additionalDetails?.availability === 'available',
    originalAvailable: model.controls.original.availability === 'available',
    directional,
    refinement: view.refinement === true,
    hasFeedback: model.controls.feedback !== undefined,
    trustCues: model.publicCopy.trustCues.map((c) => c.publicSafeText),
  };
  if (model.pinchLabel) out.pinchLabel = model.pinchLabel.text;
  if (model.whyHelp) out.whyHelp = model.whyHelp.text;
  if (view.publicNotice) out.publicNotice = view.publicNotice;
  if (model.providerFailureNotice) out.providerFailureNotice = model.providerFailureNotice;
  return out;
}

// ── The interaction bridge ──────────────────────────────────────────────────────

/**
 * Translate one panel command into the engine loop's command, synthesizing an
 * `edit_body` first whenever the panel's body text drifted from the loop's —
 * the loop only learns of edits through edit_body, and the panel sends the
 * live text with every action instead of chatting on each keystroke.
 */
function translate(
  command: PePanelCommandV1,
  loopView: PromptEnhancementCliPopupViewV1,
): { first: PromptEnhancementCliPopupCommandV1; stash?: PromptEnhancementCliPopupCommandV1 } {
  // An explicit local edit (the dock's CLI-parity details merge): the engine's
  // own edit_body, nothing stashed — the loop re-renders with the new text.
  if (command.type === 'edit_body') {
    return { first: { type: 'edit_body', text: command.bodyText } };
  }
  const bodyText = 'bodyText' in command ? command.bodyText : undefined;
  const needsEdit = bodyText !== undefined
    && loopView.model.body.editable
    && bodyText.trim().length > 0
    && bodyText !== loopView.editedBodyText;
  const main: PromptEnhancementCliPopupCommandV1 =
    command.type === 'apply_details' ? { type: 'apply_details', text: command.detailsText }
    : command.type === 'use_current' ? { type: 'use_current' }
    : command.type === 'shorter' ? { type: 'shorter' }
    : command.type === 'more_thorough' ? { type: 'more_thorough' }
    : command.type === 'more_project_grounded' ? { type: 'more_project_grounded' }
    : command.type === 'use_original' ? { type: 'use_original' }
    : command.type === 'go_back' ? { type: 'go_back' }
    : { type: 'close' };
  if (needsEdit) return { first: { type: 'edit_body', text: bodyText }, stash: main };
  return { first: main };
}

// ── MPS-1 sequence offer (PB6) ─────────────────────────────────────────────────

/**
 * The browser host's `host_runtime` evidence (DEP-stage-3-02, owned by
 * host_transport). The owner ruling keeps the `extension_host` intake surface
 * fail-closed "until the host evidence lands" — this milestone is that
 * landing: the extension NOW ships a live popup transport (view push + ack,
 * command mailbox, inject path), and this packet references those exact
 * modules. Any host that cannot supply it stays fail-closed by the engine's
 * own default — the mechanism, not a bypass.
 */
function browserHostRuntimeEvidence(): {
  evidenceId: string; kind: 'host_runtime'; owner: 'host_transport';
  state: 'supplied'; contractRevision: string; sourceRefs: readonly string[];
} {
  return {
    evidenceId: 'DEP-stage-3-02',
    kind: 'host_runtime',
    owner: 'host_transport',
    state: 'supplied',
    contractRevision: `v${PROMPT_ENHANCEMENT_CONTRACT_VERSION}`,
    sourceRefs: [
      'src/ext-browser/background/pe-popup-host.ts',
      'src/ext-browser/content/pe-inject.ts',
      'src/ext-browser/content/ipc.ts',
    ],
  };
}

/** Gate + model for the MPS offer; null = engine says no offer (fail-closed). */
export function buildBrowserMpsOffer(
  log: LogPort,
  projectRoot: string,
  result: PendingPeRecord['result'],
): PromptEnhancementMpsFirstPopupModelV1 | null {
  const handoffMetadata = result.uiView.handoffAndSequenceSummary;
  if (!handoffMetadata) return null;
  const cliEvidence = buildPromptEnhancementCliMpsIntakeEvidenceV1(result);
  const gate = evaluatePromptEnhancementMpsIntakeDecisionV1({
    surface: 'extension_host',
    evidence: cliEvidence ? [...cliEvidence, browserHostRuntimeEvidence()] : undefined,
  });
  log.debug('pe_mps_intake_gate', {
    projectRoot,
    renderPermission: gate.renderPermission,
    reasonCodes: gate.reasonCodes.slice(0, 6),
  });
  if (gate.renderPermission !== 'mps_render_permitted') return null;
  const built = buildPromptEnhancementMpsFirstPopupV1({
    result,
    handoffMetadata,
    cancel: { state: 'available', disposition: 'blocked_no_send' },
  });
  if (built.state !== 'ready') {
    log.debug('pe_mps_model_not_ready', { projectRoot, reasonCodes: built.reasonCodes.slice(0, 6) });
    return null;
  }
  return built.model;
}

/** Whitelist the MPS first-popup model down to the panel's offer view. */
export function buildPeSequenceOfferView(
  model: PromptEnhancementMpsFirstPopupModelV1,
  viewSeq: number,
): PeSequenceOfferViewV1 {
  const out: PeSequenceOfferViewV1 = {
    schemaVersion: PE_PANEL_SCHEMA_VERSION,
    kind: 'sequence_offer',
    viewSeq,
    title: model.title,
    heading: model.heading,
    bodyText: model.body.text,
    remainingTaskCount: model.sequencePlan.remainingTaskCount,
    taskSummaryLines: model.sequencePlan.taskSummaryLines,
    cancelLabel: model.actions.cancelRemainingSequence.label,
  };
  if (model.pinchLabel) out.pinchLabel = model.pinchLabel.text;
  if (model.whyHelp) out.whyHelp = model.whyHelp.text;
  if (model.providerFailureNotice) out.providerFailureNotice = model.providerFailureNotice;
  return out;
}

/** Identity/counters recorded when the first sequence prompt is SENT (ids only). */
export interface BrowserMpsSentIdentity {
  requestId: string;
  handoffDecisionId: string;
  currentBodyId: string;
  bodyRevision: number;
  remainingTaskCount: number;
}

export interface BrowserPeStopOutcome {
  result: PromptEnhancementCliPopupResultV1;
  /** True ONLY when the user sent the MPS first popup (popup-host parity flag). */
  mpsFirstPopupSent: boolean;
  mpsIdentity?: BrowserMpsSentIdentity;
}

export interface BrowserPePopupDeps {
  log: LogPort;
  projectRoot: string;
  apiKey: string | null;
  record: PendingPeRecord;
  /** tabs.sendMessage bound to the popup's tab; resolves with the content ack. */
  sendToTab: (msg: unknown) => Promise<unknown>;
  /** First successful render: consume the row + mark the cooldown. */
  onFirstRendered: () => Promise<void>;
  /**
   * The resolved `prompt_enhancement.sequence.enabled` switch (CLI default
   * parity: upstream defaulted it OFF, 2026-08-24). The MPS-1 offer renders
   * only when this is exactly true; anything else gates the offer with a ring
   * event and falls straight through to the PE popup.
   */
  sequenceEnabled?: boolean;
  /** Feedback persistence (PE-BR-11 closed): submitted events land here. */
  feedbackStore?: PeFeedbackKeyStore;
  /** Injectable engine runner (tests); defaults to the real state machine. */
  runPopup?: typeof runPromptEnhancementCliSubmitPopupV1;
}

/**
 * Run the stop-side popups against the content-script panel — MPS-first, then
 * the PE loop, mirroring the CLI popup host's order: an engine-permitted
 * sequence offer renders first (send = first prompt out, sequence recorded;
 * cancel = flow ENDS, the PE popup never opens after a cancel — owner request
 * 2026-08-06); declined (Esc) or a blocked gate falls through to the regular
 * enhancement popup. `not_shown` means the first render never reached the
 * panel and the pending row was left untouched (stop.ts's not_shown = keep).
 */
export async function runBrowserPePopup(
  deps: BrowserPePopupDeps,
): Promise<BrowserPeStopOutcome> {
  const { log, projectRoot, record } = deps;
  if (mailboxes.has(projectRoot)) {
    log.debug('pe_popup_already_open', { projectRoot });
    return { result: { state: 'not_shown', reasonCodes: ['popup_already_open'] }, mpsFirstPopupSent: false };
  }
  const box: Mailbox = { expectedSeq: 0, waiter: null, queued: null };
  mailboxes.set(projectRoot, box);

  let seq = 0;
  let firstRenderOk = false;
  let renderFailed = false;
  /**
   * The engine could not compose enhanced wording, so the body is read-only.
   *
   * The CLI never surfaces this: a popup that refuses every keystroke and offers
   * nothing to change is worse than no popup — a tester who met one concluded
   * the whole feature was broken, and the owner confirmed with the CLI author
   * that it does not appear there. Suppress it and let the prompt through.
   */
  let suppressedUneditable = false;
  let stashed: PromptEnhancementCliPopupCommandV1 | null = null;

  /** Push a view to the panel; true = rendered (ack received). Handles the
   * shared first-render bookkeeping. */
  const pushView = async (payload: PePanelViewV1 | PeSequenceOfferViewV1): Promise<boolean> => {
    box.expectedSeq = payload.viewSeq;
    box.queued = null;
    try {
      await deps.sendToTab({ type: 'nexpath:show-pe', projectRoot, payload });
      if (!firstRenderOk) {
        firstRenderOk = true;
        await deps.onFirstRendered();
        log.debug('pe_popup_shown', { projectRoot, promptCount: record.promptCount });
      }
      return true;
    } catch (err) {
      renderFailed = true;
      log.debug('pe_popup_render_failed', { projectRoot, error: String(err) });
      return false;
    }
  };

  const takeFromMailbox = (): Promise<PePanelCommandV1> =>
    box.queued !== null
      ? Promise.resolve((() => { const q = box.queued as PePanelCommandV1; box.queued = null; return q; })())
      : new Promise<PePanelCommandV1>((resolve) => { box.waiter = resolve; });

  // Feedback (PE-BR-11 closed 2026-08-25): consumed HERE — non-terminal, and
  // kept OUT of the engine loop on purpose. Routing it through the loop would
  // re-render an acknowledgement view whose push clears the mailbox
  // (pushView's queued=null), destroying the terminal command the panel sends
  // right behind the feedback — a hang until the watchdog. The CLI's own
  // PEF-on-cancel path drains its terminal immediately after the feedback, so
  // the acknowledgement frame is not user-visible there either. Persistence
  // uses the ENGINE'S OWN feedback state machine (the exact builders
  // cli-submit-popup.ts:341-368 uses) against the CURRENT loop view's
  // session, so the stored event shape is the CLI's. Ring/log stays
  // content-free — kind and chars only, never the text.
  let loopView: PromptEnhancementCliPopupViewV1 | null = null;
  const persistFeedback = async (command: PePanelCommandV1): Promise<void> => {
    if (command.type !== 'feedback_suggested' && command.type !== 'feedback_other') return;
    const kind = command.type === 'feedback_suggested' ? 'pe_feedback_suggested' : 'pe_feedback_other';
    const category = command.type === 'feedback_suggested' ? command.category : 'custom_typed';
    const chars = command.type === 'feedback_other' ? command.text.length : 0;
    // The content-free signal ALWAYS logs (kind/category/chars — never text);
    // persistence is additive on top of it.
    if (!deps.feedbackStore || !loopView) {
      log.debug('pe_action_signal', { kind, category, chars, stored: false });
      return;
    }
    let state = openPromptEnhancementFeedbackV1(
      buildPromptEnhancementFeedbackAdapterStateV1(loopView.model.session),
    );
    if (state.status !== 'open') {
      log.debug('pe_action_signal', { kind, category, chars, stored: false });
      return;
    }
    const submitted = command.type === 'feedback_suggested'
      ? submitPromptEnhancementSuggestedFeedbackV1(state, command.category, Date.now())
      : (() => {
          state = editPromptEnhancementOtherFeedbackV1(state, command.text.trim());
          return submitPromptEnhancementOtherFeedbackV1(state, Date.now());
        })();
    if (submitted.state !== 'event_ready') {
      log.debug('pe_action_signal', { kind, category, chars, stored: false });
      return;
    }
    const stored = await recordPeFeedbackEvent(deps.feedbackStore, submitted.event, Date.now());
    log.debug('pe_action_signal', { kind, category, chars, stored });
  };
  const awaitPanelCommand = async (): Promise<PePanelCommandV1> => {
    for (;;) {
      const command = await takeFromMailbox();
      if (command.type === 'feedback_suggested' || command.type === 'feedback_other') {
        await persistFeedback(command);
        continue;
      }
      return command;
    }
  };

  const closePanel = (): void => {
    void deps.sendToTab({ type: 'nexpath:pe-close', projectRoot }).catch(() => { /* panel gone */ });
  };

  try {
    refreshEngineKeyEnv(deps.apiKey);

    // ── Stage 1: MPS-1 sequence offer (engine-gated; popup-host order) ─────────
    // Config gate first (CLI default parity — sequences OFF unless the hidden
    // key enables them); the engine's own intake gate runs after it.
    const handoffPresent = (record.result as PromptEnhancementPrepareResultV1).uiView.handoffAndSequenceSummary !== undefined;
    if (handoffPresent && deps.sequenceEnabled !== true) {
      log.debug('pe_mps_gated_sequence_disabled', { projectRoot });
    }
    const mpsModel = handoffPresent && deps.sequenceEnabled === true
      ? buildBrowserMpsOffer(log, projectRoot, record.result)
      : null;
    if (mpsModel) {
      seq += 1;
      const offerRendered = await pushView(buildPeSequenceOfferView(mpsModel, seq));
      if (!offerRendered) {
        return { result: { state: 'not_shown', reasonCodes: ['panel_unreachable'] }, mpsFirstPopupSent: false };
      }
      let offerOutcome: 'send' | 'declined' | 'cancelled' | null = null;
      let sentBody = '';
      while (offerOutcome === null) {
        const command = await awaitPanelCommand();
        if (command.type === 'mps_send') {
          if (command.bodyText.trim().length === 0) continue; // empty send is a no-op, panel stays up
          offerOutcome = 'send';
          sentBody = command.bodyText;
        } else if (command.type === 'mps_decline') {
          offerOutcome = 'declined';
        } else if (command.type === 'mps_cancel') {
          offerOutcome = 'cancelled';
        } else {
          log.debug('pe_mps_command_ignored', { projectRoot, type: command.type });
        }
      }
      const signalKind = promptEnhancementMpsActionSignalKindV1(
        offerOutcome === 'send' ? 'send' : offerOutcome,
      );
      if (signalKind) log.debug('pe_action_signal', { kind: signalKind });
      if (offerOutcome === 'send') {
        return {
          result: { state: 'selected_current', bodyText: sentBody },
          mpsFirstPopupSent: true,
          mpsIdentity: {
            requestId: mpsModel.identity.requestId,
            handoffDecisionId: mpsModel.identity.handoffDecisionId,
            currentBodyId: mpsModel.identity.currentBodyId,
            bodyRevision: mpsModel.identity.bodyRevision,
            remainingTaskCount: mpsModel.sequencePlan.remainingTaskCount,
          },
        };
      }
      if (offerOutcome === 'cancelled') {
        // Cancel ENDS the flow (owner request 2026-08-06) — the PE popup never
        // opens after a cancel. (The CLI's PEF feedback popup is a feedback-
        // store surface the browser doesn't have in v1 — PE-BR-11.)
        return { result: { state: 'closed_no_send' }, mpsFirstPopupSent: false };
      }
      // declined (Esc) → fall through to the regular PE popup below.
    }

    // ── Stage 2: the engine's PE popup state machine ───────────────────────────
    const interaction: PromptEnhancementCliPopupInteractionV1 = {
      next: async (view: PromptEnhancementCliPopupViewV1) => {
        loopView = view; // feedback persistence reads the live session from here
        seq += 1;
        const panelView = buildPePanelView(view, seq);
        // Checked on the FIRST render only: a body that becomes uneditable
        // mid-session is a state the user navigated into deliberately.
        if (!firstRenderOk && !panelView.bodyEditable) {
          suppressedUneditable = true;
          return { type: 'close' };
        }
        const rendered = await pushView(panelView);
        if (!rendered) return { type: 'close' };
        if (stashed) {
          const cmd = stashed;
          stashed = null;
          return cmd;
        }
        // Drop any MPS command arriving mid-PE-loop (stale/hostile) — only the
        // offer stage may consume those.
        let received = await awaitPanelCommand();
        while (received.type === 'mps_send' || received.type === 'mps_decline' || received.type === 'mps_cancel') {
          log.debug('pe_command_ignored_wrong_stage', { projectRoot, type: received.type });
          received = await awaitPanelCommand();
        }
        const { first, stash } = translate(received, view);
        if (stash) stashed = stash;
        return first;
      },
      close: closePanel,
    };

    const runPopup = deps.runPopup ?? runPromptEnhancementCliSubmitPopupV1;
    const result = await runPopup({
      request: record.request as PromptEnhancementPrepareRequestV1,
      result: record.result as PromptEnhancementPrepareResultV1,
      interaction,
      // E9/CLI parity: per-action cost observability through the SW log (which
      // is also the persisted ring buffer).
      costObservabilitySink: (r) => {
        emitPromptEnhancementCostObservabilityV1(r, 'popup_action', log as never);
      },
      // F3: action failures render nothing — codes go to the log for post-hoc
      // diagnosis (mirror of the CLI host's actionDiagnosticsSink).
      actionDiagnosticsSink: (event) => log.debug('pe_action_failed', {
        projectRoot,
        actionType: event.actionType,
        state: event.state,
        reasonCodes: event.reasonCodes.slice(0, 8),
      }),
      // NF Plan B: content-free per-action signals (kind + timestamp only).
      actionSignalSink: (kind, occurredAt) => log.debug('pe_action_signal', { kind, occurredAt }),
    });
    if (suppressedUneditable) {
      log.debug('pe_popup_suppressed_uneditable_body', { projectRoot });
      return { result: { state: 'not_shown', reasonCodes: ['body_uneditable'] }, mpsFirstPopupSent: false };
    }
    if (renderFailed && !firstRenderOk) {
      return { result: { state: 'not_shown', reasonCodes: ['panel_unreachable'] }, mpsFirstPopupSent: false };
    }
    return { result, mpsFirstPopupSent: false };
  } finally {
    closePanel();
    mailboxes.delete(projectRoot);
  }
}
