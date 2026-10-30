import OpenAI from 'openai';
import { platform } from 'node:process';
import type { Store } from '../../store/db.js';
import { openStore, closeStore, withReleasedStoreLockV1, DEFAULT_DB_PATH } from '../../store/db.js';
import { getPendingAdvisory, markAdvisoryShown } from '../../store/pending-advisories.js';
import {
  getPendingPromptEnhancement,
  markPromptEnhancementShown,
  type PendingPromptEnhancement,
} from '../../store/pending-prompt-enhancements.js';
import { isFeedbackEligible, markFeedbackShown } from '../../store/feedback-cadence.js';
import { recordActionSignal, type PromptActionSignalKind } from '../../store/feedback-signals.js';
import { sendFeedback, sendFeedbackDismissed, sendFeedbackRatingOption } from '../../telemetry/feedback-send.js';
import { runFeedbackPopup, type FeedbackRenderFn, type FeedbackResult } from '../../decision-session/feedback-popup.js';
import { createFeedbackRenderFn } from '../../decision-session/feedback-tty.js';
import type { SelectFn } from '../../decision-session/DecisionSession.js';
import { getConfig } from '../../store/config.js';
import {
  resolvePromptEnhancementPopupCooldownV1,
  isPromptEnhancementPopupCooldownActiveV1,
} from '../../prompt-enhancement/popup-cooldown.js';
import { detectLanguage, LANG_WINDOW, LANG_DETECT_INTERVAL } from '../../classifier/LanguageDetector.js';
import { SessionStateManager } from '../../classifier/SessionStateManager.js';
import { getRecentPrompts } from '../../store/prompts.js';
import { getProject, setDetectedLanguage } from '../../store/projects.js';
import { logger, initLogger } from '../../logger.js';
import type { LogLevel } from '../../logger.js';
import { writeHookStats } from '../../store/hook-stats.js';
import { writeTelemetry } from '../../telemetry/index.js';
import { triggerOpportunisticSync } from '../../telemetry/OpportunisticSync.js';
import { flushLifecycle } from '../../telemetry/lifecycle-flush.js';
import { readStdin, recordPromptEnhancementCliFeedbackV1, recordPromptEnhancementShownMemoryV1, markPromptEnhancementUsedMemoryV1, recordPromptEnhancementStopBridgeDeliveryV1 } from './auto.js';
import {
  resolvePromptEnhancementCliHostCapabilityV1,
  runPromptEnhancementCliPopupHostLaunchV1,
  runPromptEnhancementCliMpsContinuationHostLaunchV1,
} from '../prompt-enhancement-host.js';
import {
  ingestSessionFacts as ingestFeature1SessionFacts,
  onTurnComplete as onFeature1TurnComplete,
} from '../../context-engineering/index.js';
import {
  validatePromptEnhancementCliPopupResultV1,
  runPromptEnhancementCliSubmitPopupV1,
  type PromptEnhancementCliPopupResultV1,
} from '../../prompt-enhancement/cli-submit-popup.js';
import {
  PROMPT_ENHANCEMENT_EMPHASIS_TIMEOUT_MS_V1,
  PROMPT_ENHANCEMENT_EMPHASIS_TIER_SHIPS_V1,
  startPromptEnhancementEmphasisModelCallV1,
} from '../../prompt-enhancement/emphasis-model-call.js';
import { emitPromptEnhancementCostObservabilityV1 } from '../../prompt-enhancement/cost-measurement.js';
import { evaluatePromptEnhancementMpsIntakeDecisionV1 } from '../../prompt-enhancement/intake-decision.js';
import { buildPromptEnhancementCliMpsIntakeEvidenceV1 } from '../../prompt-enhancement/cli-mps-intake-evidence.js';
import { runPromptEnhancementCliMpsFirstPopupV1, buildPromptEnhancementMpsCancelFeedbackEventV1, promptEnhancementMpsActionSignalKindV1 } from '../../prompt-enhancement/cli-mps-run.js';
import { assemblePromptEnhancementSequenceBodyProducerInputV1, startSequenceWordingBatchV1 } from '../../prompt-enhancement/sequence-body-producer-stop-input.js';
import { runPromptEnhancementSequenceBodyProducerV1 } from '../../prompt-enhancement/sequence-body-producer-runtime.js';
import { intakePromptEnhancementSequenceOnFirstSendV1 } from '../../prompt-enhancement/sequence-intake.js';
import { upsertPendingPromptSequence, getActivePendingPromptSequence, recordPromptEnhancementSequenceOfferDeclined, updatePendingPromptSequenceState, type PromptEnhancementSequenceDeclinedDispositionV1, type PendingPromptSequence } from '../../store/pending-sequences.js';
import type { PromptEnhancementSequenceRuntimeStateV1 } from '../../prompt-enhancement/sequence-runtime.js';
import { packageContinuationAtStopV1 } from '../../prompt-enhancement/continuation-stop-package.js';
import { runPromptEnhancementCliMpsContinuationPopupV1, deliverPromptEnhancementCliMpsContinuationResultV1, type PromptEnhancementCliMpsContinuationOutcomeV1 } from '../../prompt-enhancement/cli-mps-continuation-run.js';
import { buildFutureSequenceRuntimeGateEvidenceV1 } from '../../prompt-enhancement/future-sequence-runtime-gate-evidence.js';
import { evaluatePromptEnhancementFutureSequenceRuntimeGateV1 } from '../../prompt-enhancement/future-sequence-runtime-gate.js';
import { PROMPT_ENHANCEMENT_CONTRACT_VERSION, type PromptEnhancementFutureSequenceRuntimeEventV1 } from '../../prompt-enhancement/contracts.js';
import { resolveOpenAIKey, getKeySource } from '../../config/ApiKeyResolver.js';
import { buildPromptEnhancementSettingsControlV1 } from '../shared/pe-settings-control.js';

/**
 * nexpath stop — Claude Code Stop hook handler.
 *
 * Fires every time Claude finishes a response.  The handler:
 *   1. Exits immediately when stop_hook_active is true (loop guard).
 *   2. Looks up a pending advisory for the project (stored by the auto hook).
 *   3. If found: marks it shown, opens /dev/tty, renders the decision session UI.
 *   4. If the user picks "Send to your agent": writes { decision: "block", reason }
 *      so Claude Code receives the prompt as the next user turn.
 *      If the user picks "Copy to clipboard": text is already in clipboard
 *      (copied by the popup window); exits 0, Claude stops normally.
 *   5. On dismiss / skip / no advisory: exits 0 silently (Claude stops normally).
 */

// ── Helpers ────────────────────────────────────────────────────────────────────

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StopPayload {
  session_id?:             string;
  cwd:                     string;
  hook_event_name:         string;
  stop_hook_active:        boolean;
  last_assistant_message?: string;
}

export type StopOutcome =
  | { outcome: 'loop_guard' }
  | { outcome: 'no_pending' }
  | { outcome: 'no_tty' }
  | { outcome: 'blocked';       reason: string }
  | { outcome: 'clipboard_only' }
  | { outcome: 'feedback_shown' }
  | { outcome: 'prompt_enhancement_shown' }
  | { outcome: 'skipped' }
  // MPS-6: a sequence's own continuation Stop was exempted from the loop guard and routed to the
  // continuation launcher, which is fail-closed in v1 (gate blocked) — nothing rendered, the row is
  // left as-is. Distinct from `loop_guard` so a gate-blocked continuation is legible in logs/tests.
  | { outcome: 'mps_continuation_gated' }
  // MPS shell P3: the gate ALLOWED and the interactive continuation popup was rendered for the current
  // item (render + outcome). Distinct from `gated` so a rendered continuation is legible in logs/tests.
  // Delivery/persist of the outcome is P4; until then the row is left unchanged (advance not persisted).
  | { outcome: 'mps_continuation_shown' }
  // MPS-7: the old Decision-Session advisory popup is disabled outright — a pending advisory was found
  // but consumed silently and never rendered. Distinct outcome so the disabled path is legible in logs.
  | { outcome: 'advisory_disabled' };

/**
 * Outcome of showing the deferred PE popup on the Stop hook (owner decision B-i).
 * `inject` → the user chose the enhanced prompt; its text is injected as a new Claude turn.
 * `shown`  → the popup was shown but nothing is injected (original / close).
 * `not_shown` → no usable popup host (e.g. no GUI terminal); the advisory path may still run.
 */
export type PromptEnhancementStopDecision =
  | { kind: 'inject'; text: string }
  | { kind: 'shown' }
  | { kind: 'not_shown' };

/** Injectable Stop-hook PE popup launcher (production wires the real host; tests mock it). */
export type PromptEnhancementStopLaunchFn =
  (pending: PendingPromptEnhancement) => Promise<PromptEnhancementStopDecision>;

/**
 * MPS-4 (12.1): map a first-popup result to the SEQUENCE OFFER disposition to record. Only the two
 * non-accepted, non-dead states get a stub row: `selected_original` (Use original) → `rejected`,
 * `closed_no_send` (close/Escape) → `not_engaged`. `selected_current` is accepted (the intake writes the
 * full row on send) and `not_shown` is no offer — both return `undefined` (no stub). A popup that died
 * never returns a result, so its absence is the record without reaching here.
 */
export function promptEnhancementMpsOfferDispositionFromPopupV1(
  popup: PromptEnhancementCliPopupResultV1,
): PromptEnhancementSequenceDeclinedDispositionV1 | undefined {
  if (popup.state === 'selected_original') return 'rejected';
  if (popup.state === 'closed_no_send') return 'not_engaged';
  return undefined;
}

/**
 * MPS-4 (12.1): at first-popup close, record the sequence-offer disposition for a compound prompt from
 * the state the popup already returned. Writes a STUB row for the two non-accepted, non-dead states
 * (`selected_original` → rejected, `closed_no_send` → not_engaged) and NOTHING otherwise — a non-compound
 * prompt (no handoff), `selected_current` (accepted → the intake's full row on send), and `not_shown` all
 * return undefined; a popup that died throws before this is reached, so the absence IS its record.
 *
 * 12.2: the stub is written with `recordPromptEnhancementSequenceOfferDeclined` — NOT
 * `upsertPendingPromptSequence` (its validator requires itemCount>=2, so a stub silently returns false).
 * Synchronous, in-process; rides the popup host's `finally` closeStore save. `sequenceId` /
 * `enhancementId` come off the handoff + result — the same source the intake uses. Returns the
 * disposition written, or undefined when nothing was recorded.
 */
export function recordPromptEnhancementMpsSequenceOfferDispositionV1(
  store: Store,
  pending: PendingPromptEnhancement,
  popup: PromptEnhancementCliPopupResultV1,
  projectRoot: string,
): PromptEnhancementSequenceDeclinedDispositionV1 | undefined {
  const sequenceHandoff = pending.result.uiView.handoffAndSequenceSummary;
  if (!sequenceHandoff) return undefined;
  const disposition = promptEnhancementMpsOfferDispositionFromPopupV1(popup);
  if (!disposition) return undefined;
  const written = recordPromptEnhancementSequenceOfferDeclined(store, {
    projectRoot,
    sessionId:     pending.sessionId,
    sequenceId:    sequenceHandoff.handoffDecisionId,
    enhancementId: pending.result.enhancementId,
    disposition,
  });
  logger.debug('stop_mps_offer_disposition', { cwd: projectRoot, disposition, written });
  return disposition;
}

/**
 * The result of persisting a continuation cancel: the row moved to terminal cancelled (the launcher
 * then opens the PEF feedback popup), or the writer refused and the launcher runs the ordinary flow.
 */
export type PromptEnhancementSequenceContinuationCancelPersistV1 =
  | { outcome: 'cancelled' }
  | { outcome: 'fall_through' };

/**
 * MPS-2 (6.5) — §5b destructive trap. Persist a sequence-scoped continuation CANCEL by moving the ONE
 * active-read row (identified by the id the active read gave the launcher) to its terminal state via the
 * transition writer.
 *
 * ⛔ NEVER `deletePendingPromptSequencesForProject`: that wipes EVERY row for the project — including the
 *    MPS-4 declined-offer stubs, which are unrecoverable — and belongs only to `nexpath store delete
 *    --project`. A cancel is one row's status change, not a project scrub.
 * ✅ `updatePendingPromptSequenceState` touches only status / index / action (offer_disposition is left
 *    exactly as written — MPS-4 §6a), and its `WHERE id = ? AND offer_disposition = 'accepted'` clause makes
 *    it return `false` (never throw) when the row is gone or was never an accepted sequence (e.g. a declined
 *    stub). On `false` the launcher falls through to the ordinary flow rather than treating a vanished /
 *    non-accepted row as a cancel. No production caller yet — the continuation runtime is P5-gated.
 */
export function persistPromptEnhancementSequenceContinuationCancelV1(
  store: Store,
  id: number,
  nextState: PromptEnhancementSequenceRuntimeStateV1,
): PromptEnhancementSequenceContinuationCancelPersistV1 {
  return updatePendingPromptSequenceState(store, id, nextState)
    ? { outcome: 'cancelled' }
    : { outcome: 'fall_through' };
}

/**
 * Injectable feedback popup dependencies. `render` is the terminal renderer
 * (null when none is available, e.g. no TTY); `send` transmits the rating.
 */
export interface FeedbackDeps {
  render: FeedbackRenderFn | null;
  send:   (store: Store, rating: number, now?: number) => Promise<boolean>;
  /**
   * Required, not optional, and deliberately so: an optional field would let a
   * test that forgets it fall through to the REAL sender, which posts to
   * PostHog for real — the built-in api key is a shipped default, so nothing
   * would stop it.
   *
   * ⚠️ `tsconfig.json` excludes `**​/*.test.ts`, so this is NOT caught at
   * typecheck; a test that omits it fails at RUNTIME with "fbDismissed is not a
   * function". Loud, immediate, and in the test rather than on the wire — which
   * is the outcome that matters.
   */
  sendDismissed: (store: Store) => Promise<boolean>;
  /** Required for the same reason `sendDismissed` is — see above. */
  sendRatingOption: (store: Store, rating: number, now?: number) => Promise<boolean>;
}

// ── Core logic ─────────────────────────────────────────────────────────────────

/**
 * The MPS continuation launcher, extracted (Phase 4) so it can be reached from more than one Stop
 * entry point without duplicating it — behaviour-identical to the inline block it replaced. Given an
 * active sequence row it evaluates the runtime gate, packages the offered item, renders the
 * continuation popup (direct-TTY or spawned host), and delivers the outcome. EVERY path returns a
 * StopOutcome; it never falls through. Fail-closed: a blocked gate, an unpackageable row, or a
 * stale-after-wait reload all leave the row untouched and return `mps_continuation_gated`.
 */
async function launchMpsContinuationAtStopV1(
  store:          Store,
  payload:        StopPayload,
  mgr:            SessionStateManager,
  activeSequence: PendingPromptSequence,
): Promise<StopOutcome> {
  // MPS continuation launcher (moved here by MPS-6 — the continuation Stop is the stop_hook_active
  // event). FAIL-CLOSED in v1: the runtime gate always returns allowed:false and the per-item body
  // is not generated yet, so nothing renders — we look up the gate, log its outcome, and leave the
  // row as-is. When the gate lifts (P5) the interactive continuation shell renders here instead. No
  // advisory, feedback, or PE popup is reached on this event.
  //
  // MPS-11 sub-phase 1b (Phase C): the launcher now validates a REAL continuation event built from
  // the live row + payload before it consults evidence, instead of passing nothing. The event's
  // fields carry their HONEST v1 values — a Stop is not an explicit user action
  // (`explicit_user_action_absent`), the future-hold commit contract is not proven on the CLI host
  // yet (door #8 → `host_hold_commit_not_proven`), and a fired Stop is not completion proof
  // (`stop_or_response_finished_is_non_proof`). These stay diagnostics; they do not flip `allowed`.
  // Evidence is passed as an explicit empty read: no production source sets any of the eleven
  // runtime-evidence flags in v1 (owner sign-offs / register rows / host-hold proof / passed
  // fixtures do not exist as real reads yet), so the gate stays blocked by evidence ABSENCE, not by
  // passing nothing — and it will open naturally, with no change here, once a real evidence reader
  // supplies those flags. ⛔ No flag is asserted true; no handoff is fabricated (the row stores
  // ids/counts/status only — a typed handoff is a create-path concern, not this seam).
  const continuationEvent: PromptEnhancementFutureSequenceRuntimeEventV1 = {
    contractVersion: PROMPT_ENHANCEMENT_CONTRACT_VERSION,
    projectScope: payload.cwd,
    requestId: activeSequence.enhancementId,
    sequenceId: activeSequence.sequenceId,
    // Canonical per-item identity: the store keys items by (sequenceId, currentItemIndex).
    sequenceItemId: `${activeSequence.sequenceId}#${activeSequence.currentItemIndex}`,
    currentItemIndex: activeSequence.currentItemIndex,
    createdAtMs: activeSequence.createdAt,
    idempotencyKey: `${activeSequence.sequenceId}:${activeSequence.currentItemIndex}`,
    explicitUserActionState: 'absent',
    continuationActionState: 'continue_current_item',
    terminalTransitionState: 'none',
    hostCapabilityState: 'stop_bridge_only',
    stopEventState: 'stop_fired_non_proof',
    stateFreshness: 'current',
  };
  const gate = evaluatePromptEnhancementFutureSequenceRuntimeGateV1({
    schemaVersion: PROMPT_ENHANCEMENT_CONTRACT_VERSION,
    operation: 'continue_current_item',
    requestId: activeSequence.enhancementId,
    projectRoot: payload.cwd,
    event: continuationEvent,
    // 🔓 UN-GATED (owner acceptance-oracle sign-off, 2026-08-17). This is the "real un-gate" the
    // fail-closed backstop reserved for the owner: the eleventh evidence flag —
    // `focused_runtime_fixtures_pending` — is now recorded as passed by a literal `true`, not read
    // from an env var. Effect: the continuation renders for EVERY user with no command. The dev/test
    // env override (`NEXPATH_MPS_TEST_UNGATE=1`) is removed entirely — no user ever needs it, and it
    // is no longer a dependency. The other ten flags stay real (owner approvals + built runtime source
    // + host-hold proof + provider availability), so the gate still fails closed when the provider is
    // unavailable or the host cannot hold — it just no longer waits on a manual env flag.
    evidence: buildFutureSequenceRuntimeGateEvidenceV1({
      ownerAcceptanceOracleSignoffRecorded: true,
    }),
  });
  logger.debug('stop_mps_continuation_gate', {
    cwd: payload.cwd,
    sequenceId: activeSequence.sequenceId,
    currentItemIndex: activeSequence.currentItemIndex,
    itemCount: activeSequence.itemCount,
    allowed: gate.allowed,
    // Full missing-gate list + count (no silent slice) so a debugger can tell how many gates are
    // missing, not just the first few.
    missingGateCodeCount: gate.missingGateCodes.length,
    missingGateCodes: gate.missingGateCodes,
  });
  // MPS shell P3 (render + outcome). ⛔ INERT IN PRODUCTION: the gate is fail-closed in v1
  // (evidence: {} → allowed:false), so this branch never runs until the un-gate (P7). When the gate
  // lifts, package the offered item from the active row (P2 — advances/re-offers), then RUN the
  // interactive continuation popup for it. The store lock is NOT released here yet — that is Stage D
  // (P8); safe because nothing runs this branch until then. Delivery + persist of the outcome is P4;
  // until P4 the row is left unchanged (the offer's advance is not persisted), so the same item
  // re-offers next Stop — a build-order state, never reached in production.
  if (gate.allowed) {
    const runtimeState: PromptEnhancementSequenceRuntimeStateV1 = {
      sequenceId:       activeSequence.sequenceId,
      enhancementId:    activeSequence.enhancementId,
      projectRoot:      activeSequence.projectRoot,
      sessionId:        activeSequence.sessionId,
      itemCount:        activeSequence.itemCount,
      currentItemIndex: activeSequence.currentItemIndex,
      status:           activeSequence.status,
      lastActionId:     activeSequence.lastActionId,
    };
    const packaged = packageContinuationAtStopV1({
      state:                      runtimeState,
      // The per-Stop advance action id — the same deterministic idempotency key the gate event uses.
      actionId:                   `${activeSequence.sequenceId}:${activeSequence.currentItemIndex}`,
      items:                      activeSequence.payload.items,
      redactedOriginalPromptText: activeSequence.redactedOriginalPromptText,
      handoffKind:                activeSequence.handoffKind,
    });
    if (packaged.ok) {
      // Stage D (MPS-8, fixture store-lock-not-held-across-wait): RELEASE the store lock while the
      // user is deciding — the popup can be open for a long time, and another session must be able to
      // write meanwhile — then re-acquire it before writing.
      //
      // MPS Phase 3 (Option D dual-path): render on the direct TTY when the Stop hook has one,
      // otherwise SPAWN the continuation window (the Phase 2 host) — the SAME choice the first popup
      // makes. Both run lock-released; the spawned host records nothing durable and returns the
      // outcome, so delivery/persistence below is identical for both paths. A non-completed launch
      // (unavailable host, spawn/render failure) folds to `not_shown` → the item stays pending
      // (fail-closed, never a fabricated send).
      const continuationCapability = resolvePromptEnhancementCliHostCapabilityV1();
      // The direct-TTY popup runs lock-released, so any in-popup action signal it records (only
      // `mps_apply_details` fires here) is dropped on the re-acquire reload — the same reason the
      // terminal outcome is re-recorded below. BUFFER them here and re-record after re-acquire, so
      // apply-details persists (parity with the first popup, which is not lock-released and records it
      // directly). The spawned host records its own in-popup signals inside its child process.
      const continuationInPopupSignals: Array<{ kind: PromptActionSignalKind; occurredAt: number }> = [];
      const outcome: PromptEnhancementCliMpsContinuationOutcomeV1 =
        continuationCapability.state === 'available' && continuationCapability.method === 'direct_tty'
          ? await withReleasedStoreLockV1(store, () => runPromptEnhancementCliMpsContinuationPopupV1({
              result:          packaged.packaged.result,
              handoffMetadata: packaged.packaged.handoffMetadata,
              event:           packaged.packaged.event,
              progress:        packaged.packaged.progress,
              itemKind:        packaged.packaged.itemKind,
              actionSignalSink: (kind, occurredAt) => { continuationInPopupSignals.push({ kind, occurredAt }); },
            }))
          : await withReleasedStoreLockV1(store, async () => {
              const launch = await runPromptEnhancementCliMpsContinuationHostLaunchV1({
                capability: continuationCapability,
                continuation: {
                  result:          packaged.packaged.result,
                  handoffMetadata: packaged.packaged.handoffMetadata,
                  event:           packaged.packaged.event,
                  progress:        packaged.packaged.progress,
                  itemKind:        packaged.packaged.itemKind,
                },
                cliEntryPath: process.argv[1] ?? '',
                dbPath:       store.dbPath,
              });
              return launch.state === 'completed'
                ? launch.output.continuationOutcome
                // Carry the SPECIFIC launch sub-reason (`launch.reasonCode`), not just the umbrella
                // `launch_failed` state — every non-completed launch result names its point:
                // terminal_spawn_failed / terminal_exit_nonzero / terminal_renderer_not_ready / etc.
                : { state: 'not_shown', reasonCodes: [launch.reasonCode] };
            });
      logger.info('stop_mps_continuation_shown', {
        cwd: payload.cwd,
        outcome: outcome.state,
        // Diagnostic: when the outcome is `not_shown`, the reason names the exact failure point
        // (host_error / terminal_exit_nonzero / terminal_renderer_not_ready / no_tty / …), and the
        // terminal names WHICH emulator spawned it (the blink is a shared spawn issue, not MPS-only).
        reasonCodes: outcome.state === 'not_shown' ? outcome.reasonCodes : undefined,
        method: continuationCapability.state === 'available' ? continuationCapability.method : continuationCapability.state,
        terminal: continuationCapability.state === 'available' && continuationCapability.method === 'linux_terminal'
          ? continuationCapability.terminalCommand
          : undefined,
      });
      // Phase 1: a continuation item the user actually saw spends budget too — charge only, with NO
      // key and NO cooldown reset, so a sequence's own steps never throttle themselves and never add a
      // dedup key. `not_shown` (gate/spawn/render failure) is not a popup → no charge. No-op unless the
      // frequency level reads the shown-popup state (`countBudgetOnShow`).
      if (outcome.state !== 'not_shown') mgr.chargeShownContinuationPopupV1(store);
      // Telemetry parity with the first popup: the popup ran lock-released (Stage D), so its in-popup
      // action signals were dropped on the re-acquire reload. Record the TERMINAL outcome signal HERE,
      // in the re-acquired window, so it persists (content-free — kind + timestamp only; not_shown → none).
      const continuationActionKind = promptEnhancementMpsActionSignalKindV1(outcome.state);
      if (continuationActionKind) recordActionSignal(store, payload.cwd, continuationActionKind);
      // Re-record the buffered in-popup signals (mps_apply_details) too — they were dropped on the
      // reload above; recording them now, in the re-acquired window, persists them. Disjoint from the
      // terminal kind (the sink fires only for apply-details), so no double count.
      for (const s of continuationInPopupSignals) recordActionSignal(store, payload.cwd, s.kind, s.occurredAt);
      // Stage D — re_acquire_reloads_before_writing: the lock is back, but the row may have moved.
      // RELOAD before writing (a concurrent session may have advanced/cancelled it during the wait, or
      // the sequence may have died). A click on a dead/stale offer is a SILENT no-op — no recovery UI,
      // no explanation, and never a write of stale state that reverts the concurrent change.
      const reloaded = getActivePendingPromptSequence(store, payload.cwd, mgr.current.sessionId);
      if (!reloaded || reloaded.updatedAt !== activeSequence.updatedAt) {
        logger.debug('stop_mps_continuation_stale_after_wait', { cwd: payload.cwd, died: !reloaded });
        return { outcome: 'mps_continuation_gated' };
      }
      // P4 (deliver + persist). Map the popup outcome onto the state machine from the OFFERED state,
      // with a DELIVER action id distinct from the offer's advance id (a duplicate id is rejected).
      // A missing/invalid result is folded to a terminal cancel inside the wrapper (§6.4).
      const delivery = deliverPromptEnhancementCliMpsContinuationResultV1(
        packaged.offeredState,
        outcome,
        `${activeSequence.sequenceId}:${activeSequence.currentItemIndex}:deliver`,
      );
      switch (delivery.kind) {
        case 'inject':
          // 🔒 MPS-9: persist the advanced state BEFORE the block/force-exit — closeStore flushes it
          // synchronously below the caller's block return, so it must already be written here. Write to
          // the RELOADED row (Stage D).
          updatePendingPromptSequenceState(store, reloaded.id, delivery.nextState);
          // Echo-guard: record the injected item body so the next UserPromptSubmit recognises it as a
          // sequence turn and does not prepare another PE for it (mirrors the first-popup inject).
          mgr.setInjectedPrompt(store, delivery.bodyText);
          logger.info('stop_mps_continuation_injected', { cwd: payload.cwd, currentItemIndex: delivery.nextState.currentItemIndex });
          return { outcome: 'blocked', reason: delivery.bodyText };
        case 'keep':
          // Interruption / not-shown: the same item stays pending and returns next Stop.
          updatePendingPromptSequenceState(store, reloaded.id, delivery.nextState);
          return { outcome: 'mps_continuation_shown' };
        case 'cancel':
          // Escape / Cancel: terminal for THIS row only (never the project-wide delete). ⛔ The cancel
          // feedback the shell may collect is INTENTIONALLY NOT recorded (owner decision 2026-08-14:
          // accept the telemetry loss — recording it would need a request-carrier the ids/counts-only
          // continuation row deliberately does not carry, and the cancel itself is what matters). Only
          // the terminal cancel is persisted; the mps_cancel action signal above is the kept telemetry.
          persistPromptEnhancementSequenceContinuationCancelV1(store, reloaded.id, delivery.nextState);
          return { outcome: 'mps_continuation_shown' };
        case 'reject':
          // Stale / duplicate / invalid transition — leave the row untouched, ordinary flow.
          logger.debug('stop_mps_continuation_reject', { cwd: payload.cwd, reason: delivery.reasonCode });
          return { outcome: 'mps_continuation_gated' };
      }
    }
    // The row cannot be packaged (no worded items / redacted original / continuable handoff, or the
    // sequence has completed). Fail-closed: leave the row, fall through to the gated return.
    logger.debug('stop_mps_continuation_package_skip', { cwd: payload.cwd, reason: packaged.reason });
  }
  // No render, no advance, no mutation — the row is left as-is for the next Stop (fail-closed v1).
  return { outcome: 'mps_continuation_gated' };
}

/**
 * Phase 5 — resume an INTERRUPTED sequence. When the user picks "I need to do something else first",
 * the held item is left `item_pending` (never advanced, never cancelled) and must return "at the next
 * decision point". This runs on a non-`stop_hook_active` Stop that did NOT block, AFTER the user's own
 * turn (e.g. the "something else" PE popup) has resolved — so the something-else runs first, then the
 * held item comes back. ONLY `item_pending` resumes here: an `awaiting_response` sequence is mid-delivery
 * and belongs to the `stop_hook_active` launcher, so it is left untouched. Returns the launcher outcome,
 * or null to let the ordinary flow continue (fail-closed: no interrupted sequence → today's behaviour).
 */
async function maybeResumeInterruptedSequenceV1(
  store:   Store,
  payload: StopPayload,
  mgr:     SessionStateManager,
): Promise<StopOutcome | null> {
  const active = getActivePendingPromptSequence(store, payload.cwd, mgr.current.sessionId);
  if (!active || active.status !== 'item_pending') return null;
  logger.debug('stop_mps_interrupted_resume', {
    cwd: payload.cwd,
    sequenceId: active.sequenceId,
    currentItemIndex: active.currentItemIndex,
  });
  return launchMpsContinuationAtStopV1(store, payload, mgr, active);
}

/**
 * Run the Stop hook pipeline.
 *
 * @param payload   Parsed Stop hook JSON payload from Claude Code stdin
 * @param store     Open SQLite store (caller manages lifecycle)
 * @param selectFn  Optional select replacement (injected in tests)
 */
export async function runStop(
  payload:       StopPayload,
  store:         Store,
  selectFn?:     SelectFn,
  openai?:       OpenAI,
  feedbackDeps?: FeedbackDeps,
  peLaunch?:     PromptEnhancementStopLaunchFn,
): Promise<StopOutcome> {
  // Desktop session isolation guard: completely bypass CLI stop hook when Desktop App is running
  if (process.env.NEXPATH_DESKTOP_SESSION === '1') {
    return { outcome: 'no_pending' };
  }

  // Load session state up front — BEFORE the loop guard — so the MPS-6 exemption below can look up an
  // active session-scoped sequence, and so the PE popup + advisory lookups further down stay
  // session-scoped (a record queued in one session must not surface in an unrelated later one).
  const mgr = SessionStateManager.load(store, payload.cwd);

  // 1. Loop guard — Claude is continuing because of a previous Stop block; let it land.
  //    MPS-6 (2026-08-13): a sequence delivers each item by BLOCKING the Stop, which is exactly what
  //    sets `stop_hook_active` on the NEXT event — so a blanket return here would swallow the sequence's
  //    OWN continuation. When the evidence (an active session-scoped sequence — the runtime row, never
  //    inferred from timing) exists, route ONLY to the continuation launcher below: the advisory, the
  //    standalone feedback popup, and the pending-PE popup all stay closed on this event, and no other
  //    normal Stop side effect runs. Absence FAILS CLOSED — no active sequence → the loop guard behaves
  //    exactly as today. This is a routing decision, not a kill switch: feedback / language detection /
  //    lifecycle telemetry are untouched on non-sequence Stops.
  if (payload.stop_hook_active) {
    const activeSequence = getActivePendingPromptSequence(store, payload.cwd, mgr.current.sessionId);
    if (activeSequence) {
      return await launchMpsContinuationAtStopV1(store, payload, mgr, activeSequence);
    }
    logger.debug('stop_loop_guard', { cwd: payload.cwd });
    return { outcome: 'loop_guard' };
  }

  // Feature 1: Continuous learning & ingestion on turn completion
  try {
    const recent = getRecentPrompts(store, payload.cwd, 1);
    const userPrompt = recent[0]?.text || '';
    const assistantResponse = payload.last_assistant_message || '';
    if (userPrompt) {
      ingestFeature1SessionFacts(store, {
        projectRoot: payload.cwd,
        prompt: userPrompt,
        assistantResponse,
      });
      await onFeature1TurnComplete(store, {
        projectRoot: payload.cwd,
        sessionId: mgr.current.sessionId,
        prompt: userPrompt,
        response: assistantResponse,
      });
    }
  } catch (f1Err) {
    logger.debug('feature1_cli_stop_ingest_failed', { error: String(f1Err) });
  }

  // 1.3. Feedback popup — when due, show it in place of the advisory this turn.
  //      A rating is sent; either outcome resets the cadence. Skipped (without
  //      consuming the cadence) when no renderer is available.
  if (isFeedbackEligible(store)) {
    const fbRender = feedbackDeps ? feedbackDeps.render : createFeedbackRenderFn();
    // The two rating envelopes describe ONE click, so they take one timestamp
    // rather than each calling `Date.now()` — a millisecond apart is enough to
    // break anything that joins them on time, and the browser's end-to-end suite
    // caught exactly that happening under load.
    const fbSend = feedbackDeps
      ? feedbackDeps.send
      : (s: Store, r: number, n?: number) => sendFeedback(s, r, n === undefined ? {} : { now: n });
    const fbDismissed = feedbackDeps ? feedbackDeps.sendDismissed : sendFeedbackDismissed;
    const fbRatingOption = feedbackDeps
      ? feedbackDeps.sendRatingOption
      : (s: Store, r: number, n?: number) => sendFeedbackRatingOption(s, r, n === undefined ? {} : { now: n });
    if (fbRender) {
      // The popup blocks for user input; don't hold the global DB lock across it (MPS-8) — release
      // before, re-acquire + reload after, so other sessions are not blocked and their concurrent
      // writes are not clobbered. No-op for :memory:.
      const result: FeedbackResult = await withReleasedStoreLockV1(store, () =>
        runFeedbackPopup({ render: fbRender }),
      );
      if (result.outcome === 'selected') {
        // The feedback click is the consent gate: flush any buffered lifecycle
        // events (install + advisory + option-selected), then send the rating.
        // Flush regardless of telemetry.enabled — this explicit action is the consent.
        await flushLifecycle(store);
        const answeredAt = Date.now();
        await fbSend(store, result.rating, answeredAt);
        // The same answer under its own event NAME (`feedback_rating_good` and
        // its siblings), alongside `feedback_submitted` rather than instead of
        // it — replacing would rename history and break existing charts.
        //
        // AFTER the rating, not before: this is a second envelope on the SAME
        // consent, and if one of the two has to fail it should be the
        // convenience one, not the record the dashboards were built on.
        await fbRatingOption(store, result.rating, answeredAt);
      } else {
        // Shown and closed without an answer. Reported so that "asked and
        // declined" is distinguishable from "never asked" — without it the
        // rating has no denominator of its own.
        //
        // NO FLUSH HERE, and that is the whole point: releasing the buffer is
        // what the rating CLICK consents to, and this is the opposite of that
        // click. The dismissal goes out on its own, carrying an installation id
        // and a timestamp.
        await fbDismissed(store);
      }
      markFeedbackShown(store);
      logger.info('stop_feedback_shown', { cwd: payload.cwd, selected: result.outcome === 'selected' });
      return { outcome: 'feedback_shown' };
    }
  }

  // 1.4. Pending Prompt Enhancement popup (owner decision B-i, 2026-08-04) — deferred from the
  //      UserPromptSubmit hook. Shown after Claude's response, before the advisory. One-popup
  //      priority: feedback → PE → advisory. "Use enhanced" injects the enhanced prompt as a new
  //      turn (block decision); original/close inject nothing; no usable host falls through to the
  //      advisory. The launcher renders in-process on /dev/tty (like the advisory) or, with no
  //      direct TTY, spawns a GUI terminal; a fully headless session has no host and falls through.
  //      Store-lock handling lives in the launcher: the in-process popup holds the lock (matching
  //      the advisory), while the spawned path releases it so the child process can reach the DB.
  if (peLaunch) {
    const pendingPe = getPendingPromptEnhancement(store, payload.cwd, mgr.current.sessionId);
    if (pendingPe) {
      let decision: PromptEnhancementStopDecision;
      // Popup cooldown: after a PE / MPS-1 popup is shown, suppress NEW ones for
      // `prompt_enhancement.popup_cooldown` prompts (default 3). The FIRST popup always shows
      // (lastPopupIndex < 0). During cooldown, consume the pending record (so it does not linger) and
      // show nothing this turn. Continuation items (MPS-2) take a different Stop path and are NOT gated.
      const popupCooldown = resolvePromptEnhancementPopupCooldownV1(store, payload.cwd);
      const lastPopupIndex = mgr.current.lastPromptEnhancementPromptIndex ?? -1;
      if (isPromptEnhancementPopupCooldownActiveV1(lastPopupIndex, mgr.current.promptCount, popupCooldown)) {
        markPromptEnhancementShown(store, pendingPe.id);
        logger.debug('stop_pe_popup_cooldown', {
          cwd:              payload.cwd,
          promptsSinceLast: mgr.current.promptCount - lastPopupIndex,
          cooldown:         popupCooldown,
        });
        decision = { kind: 'not_shown' };
      } else {
        try {
          decision = await peLaunch(pendingPe);
        } catch (err) {
          logger.debug('stop_prompt_enhancement_error', { cwd: payload.cwd, error: String(err) });
          decision = { kind: 'not_shown' };
        }
      }
      if (decision.kind === 'inject') {
        // Consume the record only now that it was actually displayed/injected, so a host that
        // could not display it (e.g. an unsupported platform → not_shown) leaves the record
        // pending for the next Stop instead of burning it silently.
        markPromptEnhancementShown(store, pendingPe.id);
        // The PE / MPS-1 popup was shown this prompt → reset the popup cooldown.
        mgr.markPromptEnhancementPopupShown(store);
        // Phase 1: the user received it, so this is where the session budget is spent. A popup that is
        // prepared and never displayed costs nothing. No-op unless the frequency level reads the
        // shown-popup state (`countBudgetOnShow`).
        mgr.chargeShownPopupV1(store, pendingPe.promptCount, pendingPe.request.reviewMomentContext.triggerProvenance.firedKey);
        // D1 (P9-G1 / resolves P9-G2): record source-use + generated-origin BEFORE transport via
        // the typed Stop-bridge delivery contract — the audit/lineage tables the ad-hoc path never
        // wrote live. Best-effort: an audit-write failure must never lose the injection (4d).
        try {
          const delivered = recordPromptEnhancementStopBridgeDeliveryV1(store, pendingPe);
          logger.debug('stop_prompt_enhancement_delivery_recorded', {
            cwd: payload.cwd,
            outcome: delivered.outcome,
            sourceUseCount: delivered.sourceUseIds.length,
            sourceUseRecordedBeforeTransport: delivered.invariants.sourceUseRecordedBeforeTransport,
            generatedOriginId: delivered.generatedOrigin?.generatedOriginId,
          });
        } catch (err) {
          logger.debug('stop_prompt_enhancement_delivery_record_failed', { cwd: payload.cwd, error: String(err) });
        }
        // Record the injected enhanced prompt so the next UserPromptSubmit recognises it as an
        // echo and does not prepare another PE for it (mirrors the advisory injection at the
        // bottom of this function — otherwise the enhanced turn would re-trigger the PE popup).
        // NB: the typed origin guard (resolvePromptEnhancementPromptSubmitOrigin) is evidence-based
        // (generatedOriginId), which the CLI text-injection cannot carry — it becomes authoritative
        // on the EXTENSION delivery path (extension-host handoff). The CLI echo stays text-based here.
        SessionStateManager.load(store, payload.cwd).setInjectedPrompt(store, decision.text);
        logger.info('stop_prompt_enhancement_injected', { cwd: payload.cwd });
        return { outcome: 'blocked', reason: decision.text };
      }
      if (decision.kind === 'shown') {
        // Displayed (incl. dismissed / use-original) → consume so a Stop re-fire cannot re-show it.
        markPromptEnhancementShown(store, pendingPe.id);
        // The PE / MPS-1 popup was shown this prompt → reset the popup cooldown.
        mgr.markPromptEnhancementPopupShown(store);
        // Phase 1: displayed counts as received — dismiss and use-original included, since the user
        // saw the guidance either way. Same charge as the inject path above.
        mgr.chargeShownPopupV1(store, pendingPe.promptCount, pendingPe.request.reviewMomentContext.triggerProvenance.firedKey);
        logger.info('stop_prompt_enhancement_shown', { cwd: payload.cwd });
        // Phase 5: the user's "something else" popup resolved WITHOUT blocking (use-original / dismiss),
        // so their own turn is done — a sequence held from an earlier interruption resumes now.
        const resumed = await maybeResumeInterruptedSequenceV1(store, payload, mgr);
        if (resumed) return resumed;
        return { outcome: 'prompt_enhancement_shown' };
      }
      // not_shown → no usable PE host this turn; the record stays PENDING (not marked shown) so a
      // later Stop with a working host can still show it. Fall through to the advisory path below.
    }
  }

  // 1.45. MPS continuation. The normal per-item launcher runs at the loop-guard exemption at the TOP of
  //  runStop (MPS-6, 2026-08-13) because a continuation Stop is the `stop_hook_active` event. Phase 5
  //  adds a SECOND entry point HERE: an INTERRUPTED sequence (item_pending, from "do something else
  //  first") resumes on a non-stop_hook_active Stop that did NOT block — reached by the no-PE / not-shown
  //  paths (the 'shown' branch above handled its own case). Fail-closed: no item_pending → ordinary flow.
  const resumedSequence = await maybeResumeInterruptedSequenceV1(store, payload, mgr);
  if (resumedSequence) return resumedSequence;

  // 1.5. Language detection — runs post-response, invisible latency
  //      Only fires when >= LANG_DETECT_INTERVAL prompts have been captured for this project.
  const recentPrompts = getRecentPrompts(store, payload.cwd, LANG_WINDOW);
  if (recentPrompts.length >= LANG_DETECT_INTERVAL) {
    const currentDetected = getProject(store, payload.cwd)?.detectedLanguage ?? undefined;
    const detected = detectLanguage(recentPrompts.map((p) => p.text), currentDetected);
    setDetectedLanguage(store, payload.cwd, detected);
    logger.debug('stop_lang_detected', { cwd: payload.cwd, detected: detected ?? null });
    writeTelemetry(payload.cwd, 'language_detected', { detectedLanguage: detected ?? null }, store);
  }

  // 2. Session state (`mgr`) was loaded up front (before the loop guard) so the MPS-6 sequence check,
  //    the PE popup, and the advisory lookup are all session-scoped; it is reused here.

  // 3. Check for a pending advisory stored by the auto hook
  logger.debug('stop_pending_lookup', {
    cwd: payload.cwd,
    sessionId: mgr.current.sessionId,
  });
  const advisory = getPendingAdvisory(store, payload.cwd, mgr.current.sessionId);
  if (!advisory) {
    const projectPending = getPendingAdvisory(store, payload.cwd);
    logger.debug('stop_pending_miss', {
      cwd: payload.cwd,
      sessionId: mgr.current.sessionId,
      projectPending: projectPending !== null,
      pendingSessionId: projectPending?.sessionId ?? null,
    });
    logger.debug('stop_no_pending', { cwd: payload.cwd });
    writeTelemetry(payload.cwd, 'stop_no_pending', undefined, store);
    return { outcome: 'no_pending' };
  }

  // MPS-7 (Phase 7.1): the old Decision-Session advisory popup is disabled outright — it no longer
  // appears on ANY Stop (owner ruling: removal, not precedence; no arbitration with the PE / sequence
  // popups). A pending advisory is consumed silently — marked shown so it does not re-queue — and
  // NOTHING renders: no popup, no shown/fired telemetry, no announcement. The now-unreachable render
  // path (option generation + runDecisionSession + result handling) and the advisory scheduling are
  // removed in Phase 7.2.
  markAdvisoryShown(store, advisory.id);
  logger.debug('stop_advisory_disabled', { cwd: payload.cwd, advisoryId: advisory.id });
  return { outcome: 'advisory_disabled' };
}

// ── CLI entry point ────────────────────────────────────────────────────────────

export function registerStopCommand(program: import('commander').Command): void {
  program
    .command('stop')
    .description('Handle Claude Code Stop hook — show pending decision session UI if present')
    .option('--db <path>', 'Database path', DEFAULT_DB_PATH)
    .action(async (opts: { db: string }) => {
      const raw = await readStdin();
      if (!raw) process.exit(0);

      let payload: StopPayload;
      try {
        payload = JSON.parse(raw) as StopPayload;
      } catch {
        process.exit(0);
        return;
      }

      // Resolve OPENAI_API_KEY through the 4-layer chain (env → project .env →
      // OS keychain → 0600 fallback file). Matches the auto hook contract so the
      // stop hook works for every key source, not just project .env.
      await resolveOpenAIKey(payload.cwd);

      const store = await openStore(opts.db);
      const logLevel = getConfig(store.db, 'log_level') as LogLevel | undefined;
      initLogger('stop', logLevel);

      const keySource = await getKeySource(payload.cwd);
      const keyFound  = !!process.env['OPENAI_API_KEY'];
      logger.debug('env_load', { cwd: payload.cwd, keySource, keyFound });

      if (!keyFound) {
        logger.warn('openai_api_key_missing', {
          cwd:        payload.cwd,
          actionable: 'Set OPENAI_API_KEY in the shell, in the project\'s .env file, or via the OS keychain — decision option generation will fall back to static text until a key is configured.',
        });
      }

      // Owner decision B-i: the deferred PE popup is shown here on the Stop hook. Launch the
      // real spawned-terminal PE host; "Use enhanced" returns the enhanced body to inject as a
      // new turn. A GUI terminal is required — with no usable host the PE is skipped and the
      // advisory path runs instead.
      const peLaunch: PromptEnhancementStopLaunchFn = async (pending) => {
        // ── SIM OBSERVATION (sim/observability change — temp branch only) ──────────────
        //
        // The sim contract's DS option-text rule (§13.6 rule 4) observes a surface that no
        // longer exists: the DS advisory popup is disabled outright (MPS-7, above), so a sim
        // run has no option texts to read. The surface that DOES carry the advisory content
        // now is the PE popup, and its content is the ENHANCED PROMPT — so that is what the
        // sim observes instead, per the owner's ruling.
        //
        // Why it must intercept BEFORE the capability probe: on Windows the probe always
        // returns `available` and the launch SPAWNS A TERMINAL WINDOW. A 52-prompt scenario
        // would open 52 blocking windows. Under NEXPATH_SIM the content is printed and the
        // launch returns `not_shown` — the exact path already taken when no host exists, so
        // the rest of the pipeline behaves as it does in a hostless environment.
        if (process.env['NEXPATH_SIM'] === '1') {
          const body = pending.result.currentBody;
          const sections = body.sections ?? [];
          const out = process.stdout;
          // I3 (phase 37): the floor/extras split, reported where the body is actually read.
          // `sections:N` alone cannot answer §15.4 step 4 — a legitimate floor of 5 with 3 extras
          // and a genuine cap breach of 4 + 4 render the same count. The boundary log carries these
          // two fields, but the sim harness does not capture that log, so the one observation point
          // a sim run HAS was the one place the question could not be asked.
          const floorCount = pending.result.floorSectionCount;
          const prunedCount = pending.result.prunedSectionCount ?? 0;
          out.write('[SIM] PE enhanced prompt — disposition:' + pending.result.disposition
            + ' sections:' + sections.length
            + (floorCount === undefined
              ? ''
              : ' floor:' + floorCount + ' extras:' + (sections.length - floorCount) + ' pruned:' + prunedCount)
            + ' composer:' + (body.composerMode ?? 'unknown')
            + ' language:' + (body.effectiveLanguageState ?? 'unknown') + '\n');
          for (const [index, section] of sections.entries()) {
            out.write('  ' + (index + 1) + '. [' + section.sectionKind + '] ' + (section.title ?? '') + '\n');
            for (const line of (section.bodyText ?? '').split('\n')) {
              if (line.trim().length > 0) out.write('     ' + line + '\n');
            }
          }
          out.write('[SIM] PE enhanced prompt (full body follows)\n');
          out.write((body.text ?? '') + '\n');
          out.write('[SIM] PE end of enhanced prompt\n');
          // The optional pass runs here too, and prints what it suggested. A sim opens no window,
          // so this is the only place a run can see the tier live — without it the one thing a
          // long session could measure about it would never be exercised. It is started and read
          // exactly as the popup does: never awaited beyond its own cap, and every failure prints
          // nothing at all.
          if (typeof process.env['OPENAI_API_KEY'] === 'string' && process.env['OPENAI_API_KEY'].length > 0) {
            const suggestion = startPromptEnhancementEmphasisModelCallV1({
              originalPromptText: body.originalPromptText,
              sections: sections.map((section) => ({
                sectionKind: section.sectionKind,
                bodyText: section.bodyText ?? '',
              })),
              enabled: true,
            });
            await new Promise<void>((resolve) => {
              const stop = setTimeout(resolve, PROMPT_ENHANCEMENT_EMPHASIS_TIMEOUT_MS_V1);
              suggestion.onSettled(() => { clearTimeout(stop); resolve(); });
            });
            suggestion.abort();
            const suggested = suggestion.read();
            out.write('[SIM] PE emphasis suggestions: ' + suggested.length
              + ' (' + suggestion.outcome() + ')\n');
            for (const phrase of suggested) out.write('     · ' + phrase.text + '\n');
          }
          // Telemetry mirrors the stdout block so `show_pe_detail` in sim-core.sh can report
          // per cycle exactly as `show_advisory_detail` does for the DS path.
          writeTelemetry(payload.cwd, 'prompt_enhancement_sim_observed', {
            disposition: pending.result.disposition,
            sectionCount: sections.length,
            composerMode: body.composerMode ?? null,
            sectionKinds: sections.map((section) => section.sectionKind),
            bodyChars: (body.text ?? '').length,
            bodyExcerpt: (body.text ?? '').replace(/\s+/g, ' ').slice(0, 400),
          }, store);
          // CONSUME the row, exactly as a real display does (`kind: 'shown'` below marks it).
          //
          // Returning `not_shown` alone leaves the record PENDING by design — that path exists so
          // a host which could not display the popup does not burn it. Under the sim that is
          // wrong twice over: the content HAS been displayed (to the log), and an unconsumed row
          // is re-shown at every later Stop. MEASURED in the first s01 attempt: P5, P6 and P7 all
          // printed the SAME 2,294-character body for the SAME original prompt, so observations
          // did not correspond to prompts and the distinctness summary would have reported one
          // body for many prompts — the interchangeability defect, manufactured by the harness.
          return { kind: 'shown' };
        }
        const capability = resolvePromptEnhancementCliHostCapabilityV1();
        // Diagnosability (2026-08-06): record WHICH host branch the PE popup takes + whether the
        // pending row can open MPS — the two facts a missing-MPS report needs from the log.
        logger.debug('stop_pe_launch', {
          cwd: payload.cwd,
          capabilityState: capability.state,
          method: capability.state === 'available' ? capability.method : 'none',
          handoffPresent: Boolean(pending.result.uiView.handoffAndSequenceSummary),
        });
        if (capability.state === 'unavailable') return { kind: 'not_shown' };
        let popup: PromptEnhancementCliPopupResultV1;
        if (capability.method === 'direct_tty') {
          // MPS first popup (owner ruling 2026-08-06: CLI surface complete; extension surface stays
          // with host_transport). For a compound multi-intent prompt the engine emits a typed
          // handoff/sequence summary; when the CLI-scoped intake gate permits, show the MPS
          // sequence popup first — Enter injects the enhanced first prompt, Esc falls through to
          // the regular PE popup (full editing lives there). Fail-closed on any gate block.
          if (pending.result.uiView.handoffAndSequenceSummary) {
            const mpsEvidence = buildPromptEnhancementCliMpsIntakeEvidenceV1(pending.result);
            const mpsGate = evaluatePromptEnhancementMpsIntakeDecisionV1({
              surface: 'cli_stop_bridge',
              evidence: mpsEvidence ? [...mpsEvidence] : undefined,
            });
            logger.debug('stop_mps_intake_gate', {
              cwd: payload.cwd,
              renderPermission: mpsGate.renderPermission,
              reasonCodes: mpsGate.reasonCodes.slice(0, 6),
            });
            if (mpsGate.renderPermission === 'mps_render_permitted') {
              // MPS P1b-ii (8b-2c) — kick off the background wording batch for items 2…N BEFORE the
              // popup opens, so it runs while the user reads/decides and is finished by the time they
              // send (§4.13). It is AWAITED only on send (below); on close/Escape/Use-original it is
              // simply never awaited — discarded — so a cancel never waits 20-30s on wording that will
              // be thrown away (§4.13 Q19). Gated TRANSITIVELY by the planner config: plannerItems
              // exist only when the planner ran (off by default), so in production this assembles to
              // no_planner_items and nothing starts — no live LLM cost until MPS is activated. The
              // handle's .catch means a provider failure can never crash the hook before its exit write.
              const sequenceBatch = startSequenceWordingBatchV1(
                assemblePromptEnhancementSequenceBodyProducerInputV1({
                  result:                  pending.result,
                  plannerItems:            pending.plannerItems,
                  plannerPromptDirectives: pending.plannerPromptDirectives,
                }),
                (batchInput) => runPromptEnhancementSequenceBodyProducerV1(batchInput),
                (err) => logger.debug('stop_mps_batch_error', { cwd: payload.cwd, error: String(err) }),
              );
              logger.debug('stop_mps_batch', { cwd: payload.cwd, started: sequenceBatch.started });
              const mps = await runPromptEnhancementCliMpsFirstPopupV1({
                result: pending.result,
                // NF Plan B — content-free capture of the in-popup APPLY action (mps_apply_details),
                // mirroring the PE popup. The terminal outcome is captured just below.
                actionSignalSink: (kind, occurredAt) => recordActionSignal(store, payload.cwd, kind, occurredAt),
              });
              logger.info('stop_mps_first_popup', { cwd: payload.cwd, outcome: mps.state });
              // NF Plan B (B-3): content-free per-action capture of the MPS outcome (send/cancel/decline),
              // buffered locally, sent on the feedback-consent flush. Edits/not_shown map to undefined.
              const mpsActionKind = promptEnhancementMpsActionSignalKindV1(mps.state);
              if (mpsActionKind) recordActionSignal(store, payload.cwd, mpsActionKind);
              if (mps.state === 'send' && mps.bodyText.trim().length > 0) {
                // 8b-2c — the user SENT: await the wording batch so its items 2…N are ready before the
                // hook writes its block decision and exits (§4.13 Q19). Resolves to null on skip/failure
                // and never throws, so a batch problem can never lose the send. Stage D (MPS-8): release
                // the store lock across this wait (an in-flight batch is a provider call, up to 45s) so
                // another session is not blocked; the intake below writes after re-acquire.
                const batchResult = await withReleasedStoreLockV1(store, () => sequenceBatch.awaitResult());
                logger.info('stop_mps_batch_awaited', {
                  cwd:        payload.cwd,
                  producedOk: Boolean(batchResult && batchResult.ok),
                  itemCount:  batchResult && batchResult.ok ? batchResult.items.length : 0,
                });
                recordPromptEnhancementShownMemoryV1(store, payload.cwd, pending.request);
                markPromptEnhancementUsedMemoryV1(store, payload.cwd, pending.request);
                // Continuation bookkeeping (2026-08-08): the user EXPLICITLY sent the first
                // sequence prompt — record the local pending-sequence row (ids/counts only,
                // never prompt text). Fail-closed typed no-op on any invalid handoff; the row
                // authorizes nothing by itself (the runtime gate stays the popup authority),
                // and nothing reads it until the continuation launcher exists.
                const sequenceIntake = intakePromptEnhancementSequenceOnFirstSendV1({
                  result: pending.result,
                  projectRoot: payload.cwd,
                  // The pending PE row's session is the one that prepared this sequence — the
                  // continuation row binds to it (a foreign-session row is scrubbed on read).
                  sessionId: pending.sessionId,
                  // 8c: persist the batch's worded items 2…N (validated/fail-closed inside the intake);
                  // null on a skipped/failed batch → the empty list, exactly as before 8c.
                  wordedItems:      batchResult && batchResult.ok ? batchResult.items : undefined,
                  promptDirectives: pending.plannerPromptDirectives,
                });
                if (sequenceIntake.state === 'sequence_recorded') {
                  // The two additive continuation side fields (redacted original + handoffKind)
                  // are stored beside the row for a later continuation Stop; nothing reads them
                  // yet, and they are never emitted in telemetry.
                  upsertPendingPromptSequence(store, sequenceIntake.runtime, sequenceIntake.payload, {
                    redactedOriginalPromptText: sequenceIntake.redactedOriginalPromptText,
                    handoffKind:                sequenceIntake.handoffKind,
                  });
                }
                logger.debug('stop_mps_sequence_intake', {
                  cwd: payload.cwd,
                  state: sequenceIntake.state,
                  ...(sequenceIntake.state === 'sequence_recorded'
                    ? { itemCount: sequenceIntake.runtime.itemCount }
                    : { reasonCode: sequenceIntake.reasonCode }),
                });
                return { kind: 'inject', text: mps.bodyText };
              }
              if (mps.state === 'cancelled') {
                // Cancel ends the flow (owner request 2026-08-06): the MPS shell already showed
                // the PEF feedback popup — the PE popup must NOT open. Record any collected
                // feedback (best-effort) and report shown, no injection.
                if (mps.feedback) {
                  const feedbackEvent = buildPromptEnhancementMpsCancelFeedbackEventV1(pending.result, mps.feedback, Date.now());
                  if (feedbackEvent) {
                    try {
                      await recordPromptEnhancementCliFeedbackV1(store, payload.cwd, feedbackEvent, pending.request);
                    } catch { /* feedback recording is best-effort — never blocks the cancel */ }
                  }
                }
                recordPromptEnhancementShownMemoryV1(store, payload.cwd, pending.request);
                return { kind: 'shown' };
              }
              // declined (Esc) / not_shown -> fall through to the regular PE popup below.
            }
          }
          // Primary path: render the PE popup in-process on /dev/tty (the same channel the
          // advisory uses on the Stop hook). The store lock stays held for the duration, matching
          // the advisory popup; feedback is recorded through the store-backed sink.
          popup = await runPromptEnhancementCliSubmitPopupV1({
            request: pending.request,
            result: pending.result,
            emphasisPhrases: pending.emphasisPhrases,
            // This process already resolved the key above, so the optional pass COULD run here.
            // The spawned branch below does not pass it: that child resolves its own.
            // 🔒 It does not run: see PROMPT_ENHANCEMENT_EMPHASIS_TIER_SHIPS_V1, which carries the
            // measured numbers that decided it and is the one line that turns it back on.
            //
            // ⚠️ The SINK is handed over anyway, and only `enabled` is gated. The pass reports once
            // for every outcome **including the ones where it started nothing**, so the log records
            // that the tier did not run rather than saying nothing at all. `tierShips` rides along
            // because the outcome alone reads as "no client", which would send a reader hunting for
            // a key that resolved perfectly well.
            emphasisModel: {
              ...(PROMPT_ENHANCEMENT_EMPHASIS_TIER_SHIPS_V1
                && typeof process.env['OPENAI_API_KEY'] === 'string' && process.env['OPENAI_API_KEY'].length > 0
                ? { enabled: true }
                : {}),
              // Its OWN event name — a timeout here costs a few unbolded words, and must
              // never read in the log as the stage classifier's provider failure.
              onOutcome: (event: { event: string; outcome: string; phraseCount: number }) => logger.debug(event.event, {
                cwd: payload.cwd,
                outcome: event.outcome,
                phraseCount: event.phraseCount,
                tierShips: PROMPT_ENHANCEMENT_EMPHASIS_TIER_SHIPS_V1,
              }),
            },
            feedbackSink: (event) => recordPromptEnhancementCliFeedbackV1(store, payload.cwd, event, pending.request),
            // NF Plan B (B-2): content-free per-action telemetry — buffered locally, sent on the
            // feedback-consent flush (store-backed sink; in-process popup on the Stop hook).
            actionSignalSink: (kind, occurredAt) => recordActionSignal(store, payload.cwd, kind, occurredAt),
            costObservabilitySink: (result) => emitPromptEnhancementCostObservabilityV1(result, 'popup_action', logger),
            // F3 (2026-08-07): the popup keeps a failed action silent on screen — the typed
            // reason codes land here so the log stays the diagnosable source of truth.
            actionDiagnosticsSink: (event) => logger.debug('pe_action_failed', {
              cwd: payload.cwd,
              actionType: event.actionType,
              state: event.state,
              reasonCodes: event.reasonCodes.slice(0, 8),
            }),
            // Ctrl+T inside the popup (owner request 2026-09-18) — the store lock is held here for
            // the popup's whole life, so the chooser writes through this same connection.
            settingsControl: buildPromptEnhancementSettingsControlV1(store, payload.cwd),
          });
        } else {
          // No direct TTY but a GUI session exists: spawn a terminal popup. Release the DB lock across
          // the blocking child (MPS-8) so the child process (its own connection) can reach the DB, then
          // re-acquire + reload after.
          //
          // MPS Phase 1 (Option 2 — parent records): the spawned host renders the MPS first popup but
          // records NO durable sequence row. To reach parity with the direct_tty branch above, the
          // PARENT records it here. Kick off the items-2…N wording batch BEFORE the popup opens (so it
          // runs while the user reads/decides — §4.13), exactly as the direct_tty MPS block does.
          // Started only when a sequence handoff exists; discarded (never awaited) on any non-MPS-send.
          // The handle's own .catch keeps a provider failure from crashing the hook before its exit write.
          const spawnSequenceBatch = pending.result.uiView.handoffAndSequenceSummary
            ? startSequenceWordingBatchV1(
                assemblePromptEnhancementSequenceBodyProducerInputV1({
                  result:                  pending.result,
                  plannerItems:            pending.plannerItems,
                  plannerPromptDirectives: pending.plannerPromptDirectives,
                }),
                (batchInput) => runPromptEnhancementSequenceBodyProducerV1(batchInput),
                (err) => logger.debug('stop_mps_spawn_batch_error', { cwd: payload.cwd, error: String(err) }),
              )
            : undefined;
          const launch = await withReleasedStoreLockV1(store, () =>
            runPromptEnhancementCliPopupHostLaunchV1({
              capability,
              request: pending.request,
              result: pending.result,
              emphasisPhrases: pending.emphasisPhrases,
              cliEntryPath: process.argv[1] ?? '',
              dbPath: opts.db,
            }),
          );
          if (launch.state !== 'completed') {
            // Diagnosability (blink fix, Phase 1): name the exact non-completed reason so a spawned-window
            // no-show is traceable — including `payload_invalid_pre_spawn` (the pre-spawn gate rejected an
            // invalid payload, e.g. a missing OpenAI key, so NO window was opened / no blink).
            logger.debug('stop_pe_launch_not_shown', {
              cwd: payload.cwd,
              state: launch.state,
              reasonCode: launch.state === 'not_shown' || launch.state === 'launch_failed'
                || launch.state === 'host_unavailable' || launch.state === 'not_applicable'
                ? launch.reasonCode
                : undefined,
              validationReasonCodes: launch.state === 'not_shown' ? launch.validationReasonCodes.slice(0, 8) : undefined,
            });
            return { kind: 'not_shown' };
          }
          popup = launch.output.result;
          // MPS Phase 1 (Option 2): the host signals a real MPS first-popup SEND. Record the pending-
          // sequence row HERE — the lock is re-acquired and the DB reloaded from disk (withReleasedStoreLockV1),
          // so this write is durable and never clobbers the host's own writes. Mirrors the direct_tty
          // intake: await the batch with the lock RELEASED (a provider call can take up to 45s), then
          // intake + upsert. A miss (no batch, or a non-recorded intake) leaves NO row — fail-closed.
          if (launch.output.mpsFirstPopupSent && spawnSequenceBatch) {
            const batchResult = await withReleasedStoreLockV1(store, () => spawnSequenceBatch.awaitResult());
            const sequenceIntake = intakePromptEnhancementSequenceOnFirstSendV1({
              result:           pending.result,
              projectRoot:      payload.cwd,
              sessionId:        pending.sessionId,
              wordedItems:      batchResult && batchResult.ok ? batchResult.items : undefined,
              promptDirectives: pending.plannerPromptDirectives,
            });
            if (sequenceIntake.state === 'sequence_recorded') {
              upsertPendingPromptSequence(store, sequenceIntake.runtime, sequenceIntake.payload, {
                redactedOriginalPromptText: sequenceIntake.redactedOriginalPromptText,
                handoffKind:                sequenceIntake.handoffKind,
              });
            }
            logger.debug('stop_mps_spawn_sequence_intake', {
              cwd:   payload.cwd,
              state: sequenceIntake.state,
              ...(sequenceIntake.state === 'sequence_recorded'
                ? { itemCount: sequenceIntake.runtime.itemCount }
                : { reasonCode: sequenceIntake.reasonCode }),
            });
          }
        }
        // A popup that never actually rendered (e.g. no usable console) returns not_shown. Report it
        // honestly as not_shown — so the record stays pending and the advisory path runs — instead of
        // the previous false "shown" that consumed the record while nothing appeared on screen.
        if (validatePromptEnhancementCliPopupResultV1(popup) && popup.state === 'not_shown') {
          logger.debug('stop_prompt_enhancement_not_rendered', {
            cwd: payload.cwd,
            reasonCodes: 'reasonCodes' in popup ? popup.reasonCodes : undefined,
          });
          return { kind: 'not_shown' };
        }
        // The popup rendered: record that its Source-A signals were shown so the
        // missing-signal memory accumulates cross-session (E3/3.2b).
        recordPromptEnhancementShownMemoryV1(store, payload.cwd, pending.request);
        // MPS-4 (12.1): record what the user did with a compound prompt's SEQUENCE OFFER, from the
        // state the popup already returned (details on the helper).
        if (validatePromptEnhancementCliPopupResultV1(popup)) {
          recordPromptEnhancementMpsSequenceOfferDispositionV1(store, pending, popup, payload.cwd);
        }
        if (
          validatePromptEnhancementCliPopupResultV1(popup)
          && popup.state === 'selected_current'
          && typeof popup.bodyText === 'string'
          && popup.bodyText.length > 0
        ) {
          // The enhanced body was kept and injected: mark its Source-A signals used.
          markPromptEnhancementUsedMemoryV1(store, payload.cwd, pending.request);
          return { kind: 'inject', text: popup.bodyText };
        }
        return { kind: 'shown' };
      };

      try {
        const result = await runStop(payload, store, undefined, undefined, undefined, peLaunch);
        writeHookStats(payload.cwd, result.outcome);

        if (result.outcome === 'blocked') {
          process.stderr.write('\n[nexpath] Prompt sent to Claude\n');
          // sql.js (WASM) keeps the event loop alive after db.close(), so the
          // process never exits naturally. Claude Code's 60-second hook timeout
          // would kill us and discard stdout. Force-exit after the write so the
          // block decision reaches Claude Code on a clean exit.
          //
          // 🔒 MPS-9: any state needed for the delivery / pointer / cancel flow MUST be persisted
          // BEFORE this force-exit. `closeStore` → `saveStore` → `writeFileSync` is SYNCHRONOUS, so
          // every store write made during runStop is flushed to disk on the line below, before
          // process.exit(0). ⛔ NEVER launch sequence work as a fire-and-forget promise on this path
          // (cf. the `triggerOpportunisticSync` anti-pattern below) — process.exit(0) would kill an
          // un-awaited promise and silently lose the state. If sequence work must run here, `await` it
          // before this `closeStore`.
          closeStore(store);
          process.stdout.write(
            JSON.stringify({ decision: 'block', reason: result.reason }) + '\n',
          );
          process.exit(0);
        }

        if (result.outcome === 'clipboard_only') {
          if (platform === 'win32') {
            process.stderr.write('\n[nexpath] Copied to clipboard — paste and edit in Claude terminal\n');
          }
        }
        // ⚠️ MPS-9: this fire-and-forget shape is the exact anti-pattern the blocked-path guard above
        // warns against. It is fine HERE — best-effort telemetry on a NON-force-exit path (the `finally`
        // below closes the store after) — but sequence delivery/pointer/cancel state must NEVER be
        // launched this way before a force-exit.
        void triggerOpportunisticSync(store).catch(() => {});
        // All other outcomes → exit 0 (Claude stops normally)
      } finally {
        closeStore(store);
      }
    });
}
