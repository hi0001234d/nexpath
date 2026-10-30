import OpenAI from 'openai';
import { readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { resolveOpenAIKey, getKeySource } from '../../config/ApiKeyResolver.js';
import type { Store } from '../../store/db.js';
import { openStore, closeStore, DEFAULT_DB_PATH } from '../../store/db.js';
import { classifyStage } from '../../classifier/stage-classifier.js';
import { startSensitiveActionMicroClearanceV1 } from '../../classifier/sensitive-action-micro-clearance.js';
import { startQueueRankMicroCallV1, estimateQueueIfStageStaysV1 } from '../../classifier/queue-rank-micro-call.js';
import { SessionStateManager } from '../../classifier/SessionStateManager.js';
import { detectAbsenceFlags, ABSENCE_MIN_PROMPTS } from '../../classifier/AbsenceDetector.js';
import { buildRuntimeContext } from '../../classifier/runtime-context.js';
import { ACTIVE_AGENT_ID } from '../../env/agent-capabilities.js';
import { recordEnvTrajectory, recentEnvChangesV1 } from '../../env/env-trajectory.js';
import { recordTranscriptCorroboration } from '../../telemetry/transcript-corroboration.js';
import { classifyStreamBPresence } from '../../classifier/StreamBPresenceClassifier.js';
import type { StreamBPresenceResult } from '../../classifier/StreamBPresenceClassifier.js';
import { shouldFireStage2 } from '../../classifier/Stage2Trigger.js';
import { generatePinchLabel } from '../../decision-session/PinchGenerator.js';
import { pinchSignalTypeForFlag } from '../../decision-session/content-template-source.js';
import { isInjectedPromptEcho } from '../../decision-session/whydesc-delivery.js';
import { selectionRegister } from '../../decision-session/selection-registry.js';
import { resolvePinchFields } from '../../decision-session/signal-pinch-fields.js';
import type { Stage } from '../../classifier/types.js';
import type { FlagType, Stage2TriggerResult } from '../../core/stage2.js';
import type { StageClassifierResult } from '../../classifier/stage-classifier.js';
import { resolveLanguage } from '../../classifier/LanguageDetector.js';
import { insertPrompt } from '../../store/prompts.js';
import { redactSecrets } from '../../store/redact.js';
import { getConfig } from '../../store/config.js';
import { buildPromptEnhancementSettingsControlV1 } from '../shared/pe-settings-control.js';
import { getProject, upsertProject } from '../../store/projects.js';
import { getRecentPrompts } from '../../store/prompts.js';
import { importHistoricalPrompts, type HistoryImportSummary } from '../../store/historical-import.js';
import { readChatHistoryConsent } from './chat-history-consent.js';
import { classifyUserProfileLLM, MIN_PROFILE_PROMPTS } from '../../core/classifier/LLMProfileClassifier.js';
import { isUsableLlmCredential } from '../../config/credential-shape.js';
import { isProfileStale } from '../../classifier/UserProfileClassifier.js';
import { OpenAILLMAdapter } from '../adapters/llm.adapter.js';
import { loggerAdapter } from '../adapters/log.adapter.js';
import { logger, initLogger } from '../../logger.js';
import { SIGNAL_MAP as RANK_SIGNAL_MAP } from '../../core/classifier/signals.js';
import { stripBom, headBytesHex } from '../../utils/strip-bom.js';
import type { LogLevel } from '../../logger.js';
import { writeHookStats } from '../../store/hook-stats.js';
import { upsertPendingAdvisory } from '../../store/pending-advisories.js';
import { upsertPendingPromptEnhancement, type PendingPromptEnhancement, type PromptEnhancementEmphasisPhraseV1 } from '../../store/pending-prompt-enhancements.js';
import { buildPromptEnhancementEmphasisPhrasesV1 } from '../../prompt-enhancement/emphasis-locate.js';
import {
  preparePromptEnhancementStopBridgeDelivery,
  type PromptEnhancementDeliveryRequestV1,
  type PromptEnhancementDeliveryResultV1,
} from '../../prompt-enhancement/delivery.js';
import { insertSkippedSession } from '../../store/skipped-sessions.js';
import {
  resolvePromptEnhancementPopupCooldownV1,
  isPromptEnhancementPopupCooldownActiveV1,
} from '../../prompt-enhancement/popup-cooldown.js';
import { recordActivity } from '../../store/feedback-cadence.js';
import { recordActionSignal } from '../../store/feedback-signals.js';
import { writeTelemetry } from '../../telemetry/index.js';
import { triggerOpportunisticSync } from '../../telemetry/OpportunisticSync.js';
import { resolveFrequencyConfig, type AdvisoryFrequencyLevel } from '../../config/GlobalConfig.js';
import { recentPromptMetadata } from '../../telemetry/recent-prompts.js';
import {
  PROMPT_ENHANCEMENT_CONTRACT_VERSION,
  validatePromptEnhancementPrepareRequestV1,
  validatePromptEnhancementPrepareResultV1,
  type PromptEnhancementPrepareFacadeV1,
  type PromptEnhancementPrepareRequestV1,
  type PromptEnhancementPrepareResultV1,
  type PromptEnhancementDisposition,
  type PromptEnhancementSourceRefV1,
} from '../../prompt-enhancement/contracts.js';
import { preparePromptEnhancementWithSequenceV1, explainPromptEnhancementSequenceSummaryAbsenceV1 } from '../../prompt-enhancement/facade.js';
import type { PromptEnhancementSequencePlannerClientV1 } from '../../prompt-enhancement/sequence-planner.js';
import type { PromptEnhancementSequenceItemV1, PromptEnhancementSequenceOffsetRangeV1 } from '../../prompt-enhancement/sequence-payload.js';
import { recordPromptEnhancementFeedbackV1 } from '../../prompt-enhancement/feedback-sink.js';
import { derivePromptEnhancementFeedbackPolicyV1 } from '../../prompt-enhancement/feedback-policy.js';
import type { PromptEnhancementPopupEventV1 } from '../../prompt-enhancement/popup-session.js';
import { buildPromptEnhancementCostVisibilityMetadataV1 } from '../../prompt-enhancement/cost-observability.js';
import { emitPromptEnhancementCostObservabilityV1 } from '../../prompt-enhancement/cost-measurement.js';
import { isPromptEnhancementSequenceShapedTextV1 } from '../../prompt-enhancement/routing-taxonomy.js';
import { getSourceRealityAdaptersSnapshot } from '../../prompt-enhancement/source-reality.js';
import { loadRightGoodProfile } from '../../classifier/right-good-aggregator.js';
import type { RightGoodProfile } from '../../classifier/right-good-aggregator.js';
import {
  promoteEnvFactsToTierP,
  corroborationTierForEnvFact,
  corroborationTierForRightGood,
  type GroundingCorroborationTier,
} from '../../env/env-tier-promotion.js';
import { computeWorkStyleProfile } from '../../classifier/work-style-traits.js';
import { readParamEvents, type ParamEvent } from '../../telemetry/param-events.js';
import { getProjectEnvFacts } from '../../store/env-facts.js';
import { cachedPromptDerivedFactsV1, refreshPromptDerivedFactsIfDueV1 } from '../../prompt-enhancement/prompt-derived-facts-refresh.js';
import {
  promptHistoryAcceptanceExpectationsV1,
  promptHistoryVerificationAsksV1,
  promptHistoryExpectationEvidenceValueV1,
  PROMPT_HISTORY_EXPECTATION_WINDOW_V1,
} from '../../prompt-enhancement/prompt-history-expectation-signals.js';
import {
  promptHistorySensitiveActionObservationV1,
  promptHistorySensitiveActionSignalsV1,
  PROMPT_HISTORY_SIGNAL_WINDOW_V1,
} from '../../prompt-enhancement/prompt-history-signals.js';
import { getPromptEnhancementFeedbackSummary, queryRelevantPromptEnhancementMemory, recordPromptEnhancementMemoryEvidence, markPromptEnhancementMemoryUsed } from '../../store/prompt-enhancement.js';
import { scorePromptEnhancementMemoryCandidates } from '../../prompt-enhancement/memory-scoring.js';
import {
  promptEnhancementStageSignalKeyV1,
  promptEnhancementAbsenceSignalKeyV1,
} from '../../prompt-enhancement/guidance-facts.js';
import type { PromptEnhancementSourceEligibilityStateV1 } from '../../prompt-enhancement/templates/section-plan.js';
import { resolvePromptEnhancementGuidanceOutcomeV1 } from '../../prompt-enhancement/guidance-outcome.js';
import {
  buildClaudeUserPromptSubmitHookOutputV1,
  runPromptEnhancementCliSubmitPopupV1,
  validatePromptEnhancementCliPopupResultV1,
  type ClaudeUserPromptSubmitHookOutputV1,
  type PromptEnhancementCliPopupResultV1,
} from '../../prompt-enhancement/cli-submit-popup.js';
import {
  resolvePromptEnhancementCliHostCapabilityV1,
  runPromptEnhancementCliPopupHostLaunchV1,
  type PromptEnhancementCliHostCapabilityV1,
  type PromptEnhancementCliPopupHostLaunchResultV1,
} from '../prompt-enhancement-host.js';
import { preparePromptEnhancementWithSections as prepareFeature1PromptEnhancement } from '../../context-engineering/index.js';

/**
 * nexpath auto — orchestration command (per decision-session-ux-research.md).
 *
 * Wires the full pipeline for between-prompt advisory checks:
 *
 *   1. Stage classifier — one gpt-4o-mini call per prompt (folds the former
 *      keyword/TF-IDF cascade + the cross-confirmation into a single classification)
 *   2. Absence flag detection
 *   3. shouldFireStage2 decision (deterministic trigger)
 *   4. Fire cross-confirmation — from the classifier's own fire assessment (no extra call)
 *   5. Pinch label generation (gpt-4o-mini, separate call)
 *   6. Decision session UI (@clack/prompts, 3-level cascade)
 *
 * Advisory frequency enforcement:
 *   - Once per stage transition event per session (firedDecisionSessions)
 *   - Never re-fires the same event in the same session
 *
 * Called between agent responses before the user types their next prompt.
 * If no action is needed, returns silently in < 50ms with no output.
 */


function resolveProjectName(projectRoot: string): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(projectRoot, 'package.json'), 'utf8'),
    ) as { name?: unknown };
    if (typeof pkg.name === 'string' && pkg.name.trim()) return pkg.name.trim();
  } catch { /* fall through */ }
  return basename(projectRoot);
}

// ── Fired-event key helpers ────────────────────────────────────────────────────

/**
 * Build the deduplication key stored in firedDecisionSessions.
 *   stage_transition → 'stage_transition:<prev>→<next>'
 *   absence          → 'absence:<signalKey>@<stage>'
 */
export function buildFiredKey(flagType: FlagType, prevStage: Stage, currentStage: Stage): string {
  if (flagType === 'stage_transition') {
    return `stage_transition:${prevStage}→${currentStage}`;
  }
  return `${flagType}@${currentStage}`;
}

/**
 * Phase 2: name the absence WINDOW a signal is currently in, by the prompt index that opened it.
 *
 * This is the occurrence the dedup key is suffixed with, so it has to mean "this stretch of the signal
 * being missing" — one value for as long as the same absence continues.
 *
 * A raise's own `raisedAtIndex` is NOT that value. The detector is meant to re-raise a signal at most
 * once per `ABSENCE_COOLDOWN_PROMPTS`, but its cooldown check reads the FIRST flag it finds for the
 * signal (`AbsenceDetector.ts:145`) while raises are appended — so once the oldest flag's window has
 * passed, every later prompt on which the signal is still missing appends another raise. Measured on
 * the phase-1 runs: `user_feedback_review` was raised at 167 and then at 197, 198, 199 … 205 — two
 * absence windows recorded as ten raises. Keyed on the raise, dedup reads eight of those as brand-new
 * occurrences and lets the same advice through eight times.
 *
 * So the raises are folded back into windows: scanning in order, a raise opens a NEW window only when
 * it falls at or after the open one's end. That is what the detector's cooldown was meant to enforce,
 * computed from the flags it already wrote — the detector itself is left alone, because changing it
 * would move advisory volume on every level and surface, far outside this phase.
 *
 * Measured over the six recorded sim sessions (392 genuine windows): keying on the raise yields 439
 * occurrences, the oldest-still-open raise yields 416, and this rule yields 409.
 *
 * Signals are matched by key only, not by stage, exactly as the detector's own cooldown check does,
 * and each flag's own `cooldownUntil` is used rather than a recomputed one. When no merged window
 * covers `promptCount` — reachable because absorbed raises outlive the window that swallowed them —
 * the oldest raise still inside its own window is used instead, so a signal that is currently flagged
 * always has an occurrence. `undefined` means the signal is not flagged at all here.
 */
export function absenceOccurrenceIndexV1(
  flags: readonly { signalKey: string; raisedAtIndex: number; cooldownUntil: number }[],
  signalKey: string,
  promptCount: number,
): number | undefined {
  const raises = flags
    .filter((f) => f.signalKey === signalKey && f.raisedAtIndex <= promptCount)
    .sort((a, b) => a.raisedAtIndex - b.raisedAtIndex);

  let windowStart: number | undefined;
  let windowEnd = Number.NEGATIVE_INFINITY;
  let absorbedButOpen: number | undefined;
  for (const flag of raises) {
    if (flag.raisedAtIndex >= windowEnd) {           // opens a window of its own
      windowStart = flag.raisedAtIndex;
      windowEnd = flag.cooldownUntil;
      if (promptCount < windowEnd) return windowStart;
    } else if (absorbedButOpen === undefined && promptCount < flag.cooldownUntil) {
      // Absorbed, but its own window outlives the one that swallowed it. Remember the window it
      // BELONGS to, not the raise: the raise is a B-11 artifact, and naming it would hand back a
      // different occurrence on each of the prompts where these tails expire one by one.
      //
      // The `undefined` guard takes the OLDEST such raise. With the detector's fixed 30-prompt width
      // it can never matter — two still-open absorbed raises from different windows cannot coexist at
      // a prompt no window covers — so no test can tell the two apart; it is kept because the type
      // permits per-flag widths and the oldest is the answer that stays right if they ever vary.
      absorbedButOpen = windowStart;
    }
  }
  return absorbedButOpen;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AutoInput {
  /** Latest prompt text to classify. */
  promptText:  string;
  /** Project root — used to look up session state. */
  projectRoot: string;
  /**
   * The coding-agent's current permission mode, when the hook payload reports it.
   * Undefined when unavailable (CLI-argument mode, or an agent/version that does not
   * send it). Threaded onto session state and read by the runtime context.
   */
  currentAgentMode?: string;
  /**
   * Path to the agent's session transcript, when the hook payload reports it.
   * Read to corroborate practice claims against the agent's actual behaviour;
   * undefined when unavailable (CLI-argument mode, or an agent that does not
   * send it) — corroboration is then skipped.
   */
  transcriptPath?: string;
}

/** Parsed shape of the UserPromptSubmit hook stdin payload. */
export interface AutoHookPayload {
  promptText?:      string;
  currentAgentMode?: string;
  transcriptPath?:  string;
}

/**
 * Optional integration seam. The request builder and semantic producer remain
 * outside runAuto; this boundary only validates the approved typed packet/result and
 * exposes a safe disposition to the application caller.
 */
export interface AutoPromptEnhancementIntegration {
  request: PromptEnhancementPrepareRequestV1;
  prepare: PromptEnhancementPrepareFacadeV1;
  onResult?: (result: AutoPromptEnhancementPreparationResult) => void | Promise<void>;
}

export type AutoPromptEnhancementConsumerDispositionV1 = 'continue' | 'handled_no_send';

export type AutoPromptEnhancementConsumerV1 = (
  preparation: AutoPromptEnhancementPreparationResult,
  request: PromptEnhancementPrepareRequestV1,
) => AutoPromptEnhancementConsumerDispositionV1 | void | Promise<AutoPromptEnhancementConsumerDispositionV1 | void>;

/**
 * Build the approved typed PE request from the values already produced by
 * runAuto. This is an adapter only: it records existing classifier/session/source
 * facts and does not create new routing, delivery, or semantic authority.
 */
/**
 * E1 / P1-G1 + AR6-G1(query) — PE grounding-evidence refs that the guidance-fact seam (E2) consumes.
 * Ref-ID convention (E2 parses these): `right_good:<key>` / `mistake:<key>` (RIGHT&GOOD non-neutral signals);
 * `work_style:<trait>` (set work-style traits — the VALUE crosses typed in `groundingEvidenceByRef`,
 * never inside the ref); `hard_fact:<key>` (source-derived project env facts);
 * `feedback:<category>:<count>` (scoped feedback); `memory:<signalKey>` (missing-signal memory candidates —
 * empty until E3 records evidence). `paramEventChannels` = the distinct detection channels present.
 * Every read is DEFENSIVE — an empty or failed read yields no refs (deterministic no-data fallback). The
 * param-event log is read ONCE and reused for work-style + channels (RIGHT&GOOD keeps its own read; its
 * `computeRightGoodProfile` is not exported). NB: env facts map to `sourceOnlyHardFactRefs`; runtime context is
 * already carried by the request's agent-mode/permission fields, so it is not duplicated here.
 * `groundingTierByRef` = typed corroboration tier per crossing env / RIGHT&GOOD ref
 * (promoted_practice_P / capability / uncorroborated) — carried beside the refs, never inside them.
 */
/**
 * A popup is worth showing only if an LLM actually worded it.
 *
 * 🔒 Owner ruling, 2026-08-19, scope (a): *"we must not show popup if its mere deterministic based
 * and not the LLM generated"* — INCLUDING when no API key is present. Without a key nexpath stays
 * silent rather than showing boilerplate.
 *
 * ⚠️ Deliberately a DISPLAY decision, beside the blink gate, not an engine one. The engine's
 * disposition means "what did preparation conclude"; suppressing there would relabel every keyless
 * preparation as not-applicable — measured: 134 fixtures, because the suite runs without a key and
 * the deterministic renderer is exactly what most of them assert. Showing is the host's call, this
 * is the host, and the row it declines to write is the same row the blink fix declines to write.
 *
 * ⛔ Only `baseline_deterministic_render` counts — the mode set when no LLM wording survived into
 * the body. `original_fallback` and `previous_body_preservation` are different outcomes with their
 * own handling and are not re-decided here.
 */
function promptEnhancementBodyHasNoLlmWordingV1(
  result: { currentBody?: { composerMode?: string } } | undefined,
): boolean {
  return result?.currentBody?.composerMode === 'baseline_deterministic_render';
}

export function buildPromptEnhancementGroundingRefsV1(store: Store, projectRoot: string, signalKeys: readonly string[]): {
  rightGoodWorkStyleEnvRuntimeRefs: readonly string[];
  paramEventChannels: readonly string[];
  sourceOnlyHardFactRefs: readonly string[];
  scopedFeedbackEvidenceRefs: readonly string[];
  missingMemoryCandidateRefs: readonly string[];
  groundingTierByRef: Readonly<Record<string, GroundingCorroborationTier>>;
  groundingPolarityByRef: Readonly<Record<string, 'present' | 'false_capability' | 'unknown'>>;
  groundingEvidenceByRef: Readonly<Record<string, { key: string; value: string; runtimePath: 'local_store' | 'local_read_model' | 'local_probe'; anchorScope: 'machine_environment' | 'project_root' | 'session_behavior' | 'longitudinal_user_behavior' | 'current_prompt_scope' | 'content_template_scope' | 'unknown_anchor' }>>;
} {
  // Corroboration tier per crossing env / RIGHT&GOOD ref — TYPED, never smuggled
  // inside the ref strings. The promotion machinery is the SAME function the
  // decision-session engine consumes (`promoteEnvFactsToTierP`), fed from the
  // store-backed facts this boundary already reads; the DS wiring is untouched.
  // Claim wording is computed FROM this tier downstream — never assigned here.
  const groundingTierByRef: Record<string, GroundingCorroborationTier> = {};
  // Polarity per env ref: a FALSE capability is safety material, never grounding —
  // the lane flips with polarity, so it must cross typed like the tier does.
  const groundingPolarityByRef: Record<string, 'present' | 'false_capability' | 'unknown'> = {};
  // Caller-side EAGER resolution: the content each ref points at, resolved from the
  // same store-backed reads below and carried as a generic key/value beside the ref
  // — never inside it, and never via a callback seam into the enhancement engine.
  const groundingEvidenceByRef: Record<string, { key: string; value: string; runtimePath: 'local_store' | 'local_read_model' | 'local_probe'; anchorScope: 'machine_environment' | 'project_root' | 'session_behavior' | 'longitudinal_user_behavior' | 'current_prompt_scope' | 'content_template_scope' | 'unknown_anchor' }> = {};
  let rightGoodProfileForPromotion: RightGoodProfile = {};
  const rightGoodWorkStyleEnvRuntimeRefs: string[] = [];
  try {
    rightGoodProfileForPromotion = loadRightGoodProfile(store, projectRoot);
    for (const [key, signal] of Object.entries(rightGoodProfileForPromotion)) {
      if (signal.state !== 'neutral') {
        rightGoodWorkStyleEnvRuntimeRefs.push(`${signal.state}:${key}`);
        groundingTierByRef[`${signal.state}:${key}`] = corroborationTierForRightGood(signal);
        groundingEvidenceByRef[`${signal.state}:${key}`] = {
          key,
          value: `${signal.state}${signal.behaviourVerified ? ':behaviour_verified' : ':claimed'}`,
          runtimePath: 'local_read_model',
          anchorScope: 'longitudinal_user_behavior',
        };
      }
    }
  } catch { /* no RIGHT&GOOD grounding available — leave empty */ }
  const paramEventChannels: string[] = [];
  // Hoisted so the movement lane below can reuse this window instead of re-reading the log: PE
  // runs on every prompt, and this file is already read twice above.
  let paramEvents: readonly ParamEvent[] = [];
  try {
    const events = readParamEvents(store, projectRoot);
    paramEvents = events;
    for (const [trait, tv] of Object.entries(computeWorkStyleProfile(events))) {
      if (tv.value !== null) {
        // The trait VALUE crosses typed beside the ref — no longer smuggled inside it.
        rightGoodWorkStyleEnvRuntimeRefs.push(`work_style:${trait}`);
        groundingEvidenceByRef[`work_style:${trait}`] = {
          key: trait,
          value: String(tv.value),
          runtimePath: 'local_read_model',
          anchorScope: 'longitudinal_user_behavior',
        };
      }
    }
    for (const channel of new Set(events.map((event) => event.channel))) paramEventChannels.push(channel);
  } catch { /* no param-event grounding available — leave empty */ }
  const sourceOnlyHardFactRefs: string[] = [];
  try {
    const stored = getProjectEnvFacts(store, projectRoot);
    if (stored) {
      const promoted = promoteEnvFactsToTierP(stored.facts, rightGoodProfileForPromotion);
      for (const [factKey, fact] of Object.entries(promoted)) {
        sourceOnlyHardFactRefs.push(`hard_fact:${factKey}`);
        groundingTierByRef[`hard_fact:${factKey}`] = corroborationTierForEnvFact(fact);
        groundingPolarityByRef[`hard_fact:${factKey}`] =
          fact.value === false ? 'false_capability' : fact.value === null ? 'unknown' : 'present';
        // Every current probe fact is project-anchored (has_* / project_framework);
        // machine-environment facts get their own anchor when such probes exist.
        groundingEvidenceByRef[`hard_fact:${factKey}`] = {
          key: factKey,
          value: String(fact.value),
          runtimePath: 'local_store',
          anchorScope: 'project_root',
        };
      }
    }

    // ── A3 step 7: prompt-derived extracted params cross as TYPED {key,value} ──────────────────
    //
    // §33.2 measured the id-only hop as broken — *"the values the engine extracted never enter PE
    // at all"* — and step 7 requires them to cross like every other producer. They were unreachable
    // because the only extractor lives in the decision-session engine, which is disabled outright
    // (`stop.ts`, MPS-7) and whose call is an LLM call.
    //
    // 🔒 Owner-approved adjustment: the extractor is reused unchanged (step 8: *"Build no new
    // extractor"*) but mined over a window and CACHED, refreshed only after a threshold of new
    // prompts. ⛔ This read is FREE — a store lookup, never a provider call. PE runs on every
    // prompt; the miner does not.
    //
    // `recent_prompt_history` is the honest origin: the window is the user's last few prompts, not
    // the current one. Under L4990's lane rules that keeps the wording at possibility strength —
    // prompt-mined evidence is uncorroborated by construction and must never reach practice claims.
    for (const mined of cachedPromptDerivedFactsV1(store, projectRoot)) {
      const ref = `prompt_fact:${mined.key}`;
      rightGoodWorkStyleEnvRuntimeRefs.push(ref);
      groundingTierByRef[ref] = 'uncorroborated';
      groundingPolarityByRef[ref] = 'present';
      groundingEvidenceByRef[ref] = {
        key: mined.key,
        value: mined.value,
        runtimePath: 'local_store',
        anchorScope: 'current_prompt_scope',
      };
    }

    // ── Recent-history sensitive actions cross as their own confirmation signal ────────────────
    //
    // 🔒 Owner-ruled (2026-08-20). The sensitive-action detector already existed and was already
    // tested, but every consumer of it lived in the option-generation engine, which is switched
    // off — so a developer could say "deploy to production" three prompts running and the enhanced
    // prompt would never ask the agent to check first.
    //
    // ⛔ **The CATEGORY crosses, never the matched words.** The detector returns the literal text
    // that satisfied the trigger; the owner reversed an include-the-literal-word preference once
    // already on leakage grounds, so the signal module drops it before this point and the ref
    // namespace carries a category name only.
    //
    // ⛔ FREE: pure string matching over prompts already in hand. No provider call.
    // Oldest-last, matching the miner's own convention so both lanes read the same stretch of
    // history in the same order.
    const recentPromptTexts = getRecentPrompts(store, projectRoot, PROMPT_HISTORY_SIGNAL_WINDOW_V1)
      .map((record) => record.text)
      .reverse();
    for (const signal of promptHistorySensitiveActionSignalsV1(recentPromptTexts)) {
      const ref = `history_sensitive_action:${signal.category}`;
      rightGoodWorkStyleEnvRuntimeRefs.push(ref);
      groundingTierByRef[ref] = 'uncorroborated';
      groundingPolarityByRef[ref] = 'present';
      groundingEvidenceByRef[ref] = {
        key: signal.category,
        // ⛔ The OBSERVATION, not the safeguard sentence. The instruction reaches the body on its
        // own channel, naming the real category; putting it here too produced a clamped, inverted
        // duplicate. See `promptHistorySensitiveActionObservationV1`.
        value: promptHistorySensitiveActionObservationV1(),
        runtimePath: 'local_store',
        anchorScope: 'current_prompt_scope',
      };
    }

    // ── §17.11 (owner-ruled: WIRE IT) — env movements cross as their own grounding claim ───────
    //
    // The trajectory probe was never inert: its change events already credit practice scores
    // through `trajectory-credit` → the RIGHT&GOOD aggregator. But a score nudge is silent — the
    // enhanced prompt could say what the project IS and never that something MOVED, which is the
    // half a user notices ("the upgrade broke because node moved under it").
    //
    // ⚠️ Crossing here rather than in the `hard_fact:` loop above is deliberate: those refs carry
    // a probe's CURRENT value and take their claim strength from the corroboration tier. A
    // movement is a different kind of knowledge and takes a different ceiling, so it gets its own
    // ref namespace and its own producer branch rather than borrowing one that means state.
    for (const change of recentEnvChangesV1(store, projectRoot, Date.now(), paramEvents)) {
      const ref = `env_change:${change.key}`;
      rightGoodWorkStyleEnvRuntimeRefs.push(ref);
      groundingTierByRef[ref] = 'uncorroborated';
      groundingPolarityByRef[ref] = 'present';
      groundingEvidenceByRef[ref] = {
        key: change.key,
        value: change.phrase,
        runtimePath: 'local_store',
        anchorScope: 'project_root',
      };
    }
  } catch { /* no source hard facts available — leave empty */ }

  // The same recent prompts, read for what the developer said DONE looks like and how the work
  // gets PROVEN. Those two sections had never received a fact and were written from plausibility in
  // every shipped body; what crosses here is the developer's own sentence, quoted, so a section can
  // say something they actually wrote instead of something that merely sounds right. Nothing said
  // means nothing produced — the detectors return empty and no ref is pushed.
  //
  // ⚠️ Its OWN try, deliberately: these loops first sat inside the env-facts block above, where an
  // unrelated store failure would have silenced them without a trace — a project with no stored env
  // facts would simply never have received either fact. One grounding source, one guard, which is
  // the convention every other block in this function already follows.
  //
  // ⛔ FREE: the same in-hand prompts, matched as strings. No provider call.
  try {
    const expectationPrompts = getRecentPrompts(store, projectRoot, PROMPT_HISTORY_EXPECTATION_WINDOW_V1)
      .map((record) => record.text)
      .reverse();
    for (const [index, expectation] of promptHistoryAcceptanceExpectationsV1(expectationPrompts).entries()) {
      const ref = `history_acceptance:${index}`;
      rightGoodWorkStyleEnvRuntimeRefs.push(ref);
      groundingTierByRef[ref] = 'uncorroborated';
      groundingPolarityByRef[ref] = 'present';
      groundingEvidenceByRef[ref] = {
        key: 'what you said done means',
        value: promptHistoryExpectationEvidenceValueV1(expectation),
        runtimePath: 'local_store',
        anchorScope: 'current_prompt_scope',
      };
    }
    for (const [index, expectation] of promptHistoryVerificationAsksV1(expectationPrompts).entries()) {
      const ref = `history_verification:${index}`;
      rightGoodWorkStyleEnvRuntimeRefs.push(ref);
      groundingTierByRef[ref] = 'uncorroborated';
      groundingPolarityByRef[ref] = 'present';
      groundingEvidenceByRef[ref] = {
        key: 'the check you asked for',
        value: promptHistoryExpectationEvidenceValueV1(expectation),
        runtimePath: 'local_store',
        anchorScope: 'current_prompt_scope',
      };
    }
  } catch { /* no readable prompt history — the sections keep saying what they say today */ }
  const scopedFeedbackEvidenceRefs: string[] = [];
  try {
    for (const category of getPromptEnhancementFeedbackSummary(store, projectRoot).categoryCounts) {
      scopedFeedbackEvidenceRefs.push(`feedback:${category.feedbackCategory}:${category.count}`);
    }
  } catch { /* no scoped feedback available — leave empty */ }
  const missingMemoryCandidateRefs: string[] = [];
  try {
    // E3/3.2c: score the queried rows so a fatigued / edited-out-twice signal does
    // not re-surface (fix-plan §4c query-time fatigue/suppression).
    const rows = queryRelevantPromptEnhancementMemory(store, projectRoot, signalKeys);
    for (const candidate of scorePromptEnhancementMemoryCandidates(rows).eligible) {
      missingMemoryCandidateRefs.push(`memory:${candidate.signalKey}`);
    }
  } catch { /* no missing-signal memory yet (until E3 records) — leave empty */ }
  return {
    rightGoodWorkStyleEnvRuntimeRefs,
    paramEventChannels,
    sourceOnlyHardFactRefs,
    scopedFeedbackEvidenceRefs,
    missingMemoryCandidateRefs,
    groundingTierByRef,
    groundingPolarityByRef,
    groundingEvidenceByRef,
  };
}

/**
 * F4 (L4991): the eligibility a CLEANLY-FIRED trigger carries.
 *
 * Reaching the fire path means frequency, dedup, cooldown, cap and the classifier recommendation
 * all passed — so the signal is `fresh_trigger_eligible` unless the user has already DISMISSED
 * this very signal, which `SessionStateManager` records as `dismissedAtIndex` on the absence flag.
 * L4991 names dismissal as a state that must not anchor a popup.
 *
 * ⚠️ Exported because a test that re-implements this decision proves nothing about production —
 * measured at verification round 6, where fixtures replicating the logic passed happily while the
 * production branch was mutated to the wrong value.
 */
export function promptEnhancementFiredTriggerEligibilityV1(
  absenceFlags: readonly { signalKey: string; dismissedAtIndex?: number }[],
  effectiveFlagType: string,
): PromptEnhancementSourceEligibilityStateV1 {
  const signalKey = effectiveFlagType.replace(/^absence:/, '');
  const dismissed = absenceFlags.some(
    (flag) => flag.signalKey === signalKey && flag.dismissedAtIndex !== undefined,
  );
  return dismissed ? 'dismissed_or_user_skipped' : 'fresh_trigger_eligible';
}

export function buildPromptEnhancementRequestForAuto(input: {
  auto: AutoInput;
  store: Store;
  session: SessionStateManager;
  project: ReturnType<typeof getProject>;
  effectiveLanguage?: string;
  configuredRole?: string | null;
  effectiveFlagType: FlagType;
  firedKey: string;
  previousStage: Stage;
  trigger: Exclude<Stage2TriggerResult, null>;
  stageResult: StageClassifierResult;
  streamBOutputs: readonly string[];
  /**
   * F4 (L4971): which eligibility the trigger signal carries INTO PE. Decided by the branch
   * the pipeline already took — frequency, dedup, cooldown, cap, or a clean fire — and only
   * read here (prohibition 19: PE never re-implements the gating). Omitted by boundary tests,
   * where the fail-closed default applies.
   */
  triggerEligibility?: PromptEnhancementSourceEligibilityStateV1;
}): PromptEnhancementPrepareRequestV1 {
  const promptIndex = input.session.current.promptCount - 1;
  const currentStage = input.session.current.currentStage;
  const register = selectionRegister(input.session.current.profile?.nature);
  const source = getSourceRealityAdaptersSnapshot({
    flagType: input.effectiveFlagType,
    stage: currentStage,
    projectRoot: input.auto.projectRoot,
    register,
    role: input.configuredRole ?? undefined,
    level: 1,
    store: input.store,
  });
  const content = source.contentTemplate;
  const sourceId = `prompt:${promptIndex}`;
  const originalPromptRef: PromptEnhancementSourceRefV1 = {
    sourceRefId: `source-a:${sourceId}`,
    sourceKind: 'source_a_user_prompt',
    sourceId,
    sourceAuthorization: 'source_fact_only',
    evidenceStatus: 'present',
    freshness: 'current',
    confidence: 'high',
    privacyClass: 'local_private',
  };
  const triggerRef: PromptEnhancementSourceRefV1 = {
    sourceRefId: `trigger:${input.effectiveFlagType}`,
    sourceKind: 'stage_or_absence_signal',
    sourceId: input.effectiveFlagType,
    sourceAuthorization: 'source_fact_only',
    evidenceStatus: 'present',
    freshness: 'current',
    confidence: input.stageResult.classification.confidence >= 0.8
      ? 'high'
      : input.stageResult.classification.confidence >= 0.5 ? 'medium' : 'low',
    privacyClass: 'public_safe',
  };
  const contentRef = content.resolvedRecordIdentity
    ? {
        sourceRefId: `content:${content.resolvedRecordIdentity}`,
        sourceKind: 'content_template_fact' as const,
        sourceId: content.resolvedRecordIdentity,
        sourceAuthorization: content.authorization,
        evidenceStatus: 'present' as const,
        freshness: 'current' as const,
        confidence: 'medium' as const,
        privacyClass: 'public_safe' as const,
      }
    : undefined;
  const sourceRefs = [originalPromptRef, triggerRef, ...(contentRef ? [contentRef] : [])];
  const triggerKind = input.trigger.kind;
  const absenceSignal = triggerKind === 'absence'
    ? input.effectiveFlagType.replace(/^absence:/, '')
    : undefined;
  const recentRefs = recentPromptMetadata(input.session.current.promptHistory)
    .map((prompt) => `prompt:${prompt.index}`);
  // Read memory under the SAME canonical keys the guidance builder writes, or a
  // repeatedly-edited-out signal would never be found and suppressed (E3/3.2c).
  const groundingSignalKeys = [
    ...(triggerKind === 'stage_transition' ? [promptEnhancementStageSignalKeyV1(input.previousStage, currentStage)] : []),
    ...(absenceSignal ? [promptEnhancementAbsenceSignalKeyV1(absenceSignal)] : []),
  ];
  const grounding = buildPromptEnhancementGroundingRefsV1(input.store, input.auto.projectRoot, groundingSignalKeys);

  return {
    schemaVersion: PROMPT_ENHANCEMENT_CONTRACT_VERSION,
    requestId: `pe:auto:${input.session.current.sessionId}:${promptIndex}:${input.effectiveFlagType}`,
    projectRoot: input.auto.projectRoot,
    hostSurface: 'cli_stop_bridge',
    sourcePrompt: {
      text: input.auto.promptText,
      origin: 'user',
      capturedAt: Date.now(),
      promptIndex,
      generatedOriginPolicy: 'ordinary_source_a',
    },
    reviewMomentContext: {
      reviewMoment: 'UserPromptSubmit_preparation',
      currentAgentMode: input.auto.currentAgentMode ?? 'unknown',
      projectId: input.project?.projectRoot ?? input.auto.projectRoot,
      sessionId: input.session.current.sessionId,
      detectedLanguage: input.effectiveLanguage ?? 'unknown',
      stageCandidate: currentStage,
      promptCount: input.session.current.promptCount,
      recentPromptMetadataRefs: recentRefs,
      triggerProvenance: {
        currentStage,
        prevStage: input.previousStage,
        triggerKind,
        firedKey: input.firedKey,
        effectiveFiredSource: input.effectiveFlagType,
        selectedQualifyingAbsence: absenceSignal,
        absenceGateReason: absenceSignal ? 'qualifying_absence_signal' : undefined,
        classifierState: input.stageResult.degraded ? 'degraded_no_fire' : 'fire_recommended',
        degradedNoActionState: input.stageResult.degraded ? 'degraded_no_fire' : 'none',
        // The intent proposal from the same classifier call ('' on the degraded
        // path — keyless prompts stay on the deterministic cascade).
        classifierPrimaryIntent: input.stageResult.primaryIntent,
        classifierIntentConfidence: input.stageResult.intentConfidence,
        // The capability observation from the same call: candidates plus the
        // debug-evidence forms present. The registry decides every attachment.
        classifierCapabilityCandidates: input.stageResult.capabilityCandidates,
        // Which stored project facts THIS prompt calls for. The registry decides what to do with
        // it; an absent channel fails closed downstream rather than sending all ten facts.
        classifierProjectFactCandidates: input.stageResult.projectFactCandidates,
        // I1: the relevance ORDERING over section kinds. Carried, not acted on — I2's registry
        // pruner is what reads it, under the locked drop-criteria.
        classifierSectionRelevanceOrder: input.stageResult.sectionRelevanceOrder,
        classifierDebugEvidencePresent: input.stageResult.debugEvidencePresent,
        // The sensitive-action clearance observation, carried ONLY when the verdict exists.
        // A degraded call has no verdict, so this stays undefined there — and undefined is
        // the fail-closed state (the confirmation line emits exactly as today).
        classifierSensitiveActionClearance: input.stageResult.sensitiveActionVerdict !== undefined
          ? {
              verdict: input.stageResult.sensitiveActionVerdict,
              reason: input.stageResult.sensitiveActionReason,
              name: input.stageResult.sensitiveActionName,
            }
          : undefined,
        promptStartBoundary: source.promptStartStop.hookBoundary,
        deliveryBoundary: source.promptStartStop.deliveryBoundary,
        promptStartCanReplaceSameTurn: source.promptStartStop.runAutoCanHoldOrReplaceSubmittedPrompt,
        promptId: sourceId,
        sessionId: input.session.current.sessionId,
        promptIndex,
      },
    },
    sourceSignals: {
      sourceAOriginalPromptRef: originalPromptRef,
      sourceRefs,
      triggerSignalEligibilityState: input.triggerEligibility,
      normalizedStageAbsenceSignalRefs: absenceSignal ? [absenceSignal] : [],
      contentTemplateRecordFactRefs: content.resolvedRecordIdentity ? [content.resolvedRecordIdentity] : [],
      popupQuestionSourceRefs: content.resolvedRecordIdentity ? [`${content.resolvedRecordIdentity}:question`] : [],
      whyHelpSourceRefs: content.resolvedRecordIdentity ? [`${content.resolvedRecordIdentity}:why-help`] : [],
      profileRoleModeRefs: input.configuredRole ? [`role:${input.configuredRole}`] : [],
      rightGoodWorkStyleEnvRuntimeRefs: grounding.rightGoodWorkStyleEnvRuntimeRefs,
      missingMemoryCandidateRefs: grounding.missingMemoryCandidateRefs,
      sourceLabels: [
        { sourceRefId: originalPromptRef.sourceRefId, label: 'original_prompt', evidenceStatus: 'present' },
        { sourceRefId: triggerRef.sourceRefId, label: 'stage_absence_signal', evidenceStatus: 'present' },
        ...(contentRef ? [{ sourceRefId: contentRef.sourceRefId, label: 'content_template_fact' as const, evidenceStatus: 'present' as const }] : []),
      ],
      contentTemplate: {
        recordSignalType: content.recordSignalType,
        contentSource: content.contentSource,
        resolvedRecordIdentity: content.resolvedRecordIdentity,
        resolvedSource: content.resolvedSource,
        sourceCascade: content.sourceCascade,
        registerOverridePath: content.registerOverridePath,
        safeguardRequired: content.safeguardRequired,
        questionServing: content.questionServing,
      },
      promptStartStop: {
        hookBoundary: source.promptStartStop.hookBoundary,
        deliveryBoundary: source.promptStartStop.deliveryBoundary,
        runAutoCanHoldOrReplaceSubmittedPrompt: source.promptStartStop.runAutoCanHoldOrReplaceSubmittedPrompt,
        sharedSignalCount: source.promptStartStop.sharedSignalCount,
        classifierDegradedNoFireReasons: source.promptStartStop.classifierDegradedNoFireReasons,
      },
      store: {
        schemaVersion: source.store.schemaVersion,
        missingPromptEnhancementTables: source.store.missingPromptEnhancementTables,
        cleanupGaps: source.store.cleanupGaps,
      },
      historicalBootstrap: source.historicalBootstrap,
      launchBoundary: source.launchBoundary,
      permissionMode: input.auto.currentAgentMode ?? 'unknown',
      transcriptPathState: input.auto.transcriptPath ? 'provided' : 'not_authority',
      streamBOutputs: input.streamBOutputs,
      paramEventChannels: grounding.paramEventChannels,
      servedVariantIdentityRefs: [],
      deliveryGateRefs: [],
      sourceOnlyHardFactRefs: grounding.sourceOnlyHardFactRefs,
      groundingTierByRef: grounding.groundingTierByRef,
      groundingPolarityByRef: grounding.groundingPolarityByRef,
      groundingEvidenceByRef: grounding.groundingEvidenceByRef,
    },
    userPreferenceContext: {
      levelState: 'default',
      scopedFeedbackEvidenceRefs: grounding.scopedFeedbackEvidenceRefs,
    },
    configSnapshot: {
      sequenceEnabledState: 'not_enabled_v1',
      validatedEffectiveConfigState: 'valid',
      arbitraryConfigRowsAreAuthority: false,
    },
    callVisibilityState: buildPromptEnhancementCostVisibilityMetadataV1('baseline_pe_composer', {
      callVisibilityMode: 'deterministic',
      plannedCallCount: 0,
      usedCallCount: 0,
    }),
    privacyAndStoragePolicy: {
      sensitivityClass: 'normal',
      localStorageEligibility: 'ids_and_categories_only',
      telemetryEligibility: 'allowlisted_counts_only',
      llmSharingEligibility: 'allowed_minimal',
      generatedBodyStoragePolicy: 'do_not_store_raw_by_default',
    },
  };
}

export type AutoPromptEnhancementPreparationResult =
  | {
      disposition: PromptEnhancementDisposition;
      result: PromptEnhancementPrepareResultV1;
      safeFallback: false;
    }
  | {
      disposition: 'no_popup_not_applicable';
      result?: undefined;
      safeFallback: true;
      reasonCode: 'invalid_request' | 'invalid_result' | 'facade_error';
      validationReasonCodes?: readonly string[];
    };

/**
 * Diagnosability (blocked-popup fix 2026-08-07): a blocked_no_send prepare previously logged
 * only its disposition — the BLOCKING failure codes were unrecoverable once the pending row was
 * overwritten. Surface the typed codes (public-safe enums, never body text) in the boundary log.
 */
function blockedFailureCodesForLog(
  preparation: AutoPromptEnhancementPreparationResult,
): readonly string[] | undefined {
  if (preparation.disposition !== 'blocked_no_send' || !preparation.result) return undefined;
  return preparation.result.validationGraph.failures
    .filter((failure) => failure.blocking)
    .map((failure) => failure.failureCode)
    .slice(0, 6);
}

/**
 * Validate the typed request/result boundary without creating PE semantics.
 * Invalid, thrown, or malformed producer output is reduced to the public-safe
 * no-popup disposition; it never mutates the submitted prompt or legacy DS state.
 */
export async function preparePromptEnhancementForAuto(
  integration: AutoPromptEnhancementIntegration,
): Promise<AutoPromptEnhancementPreparationResult> {
  const requestValidation = validatePromptEnhancementPrepareRequestV1(integration.request);
  if (!requestValidation.ok) {
    return {
      disposition: 'no_popup_not_applicable',
      safeFallback: true,
      reasonCode: 'invalid_request',
      validationReasonCodes: requestValidation.reasonCodes,
    };
  }

  try {
    const result = await integration.prepare(integration.request);
    const resultValidation = validatePromptEnhancementPrepareResultV1(result);
    if (!resultValidation.ok) {
      return {
        disposition: 'no_popup_not_applicable',
        safeFallback: true,
        reasonCode: 'invalid_result',
        validationReasonCodes: resultValidation.reasonCodes,
      };
    }
    return { disposition: result.disposition, result, safeFallback: false };
  } catch {
    return {
      disposition: 'no_popup_not_applicable',
      safeFallback: true,
      reasonCode: 'facade_error',
    };
  }
}
/**
 * Parse the JSON payload the coding-agent hook writes to stdin.
 *
 * Captures the prompt text, the reported permission mode, and the session
 * transcript path. The mode vocabulary evolves across agent versions, so an
 * unrecognised value is passed through verbatim — it is never checked against
 * a fixed list here. A missing field or malformed JSON yields an empty result
 * (the caller then treats that input as absent).
 */
export function parseAutoHookPayload(raw: string): AutoHookPayload {
  try {
    // RC48 (fix authored in Bhavnesh's 2026-08-23 bug report, applied per that
    // handoff): Windows Cursor prefixes the stdin payload with a UTF-8 BOM and
    // JSON.parse throws on it — see src/utils/strip-bom.ts for the evidence.
    const payload = JSON.parse(stripBom(raw)) as { prompt?: string; permission_mode?: string; transcript_path?: string };
    return {
      promptText:       payload.prompt?.trim(),
      currentAgentMode: typeof payload.permission_mode === 'string' ? payload.permission_mode : undefined,
      transcriptPath:
        typeof payload.transcript_path === 'string' && payload.transcript_path.length > 0
          ? payload.transcript_path
          : undefined,
    };
  } catch (err) {
    // RC48: a swallowed parse failure reads as "empty prompt" — log it.
    try {
      logger.warn('auto_hook_payload_parse_failed', {
        message: (err as Error)?.message?.slice(0, 120) ?? 'unknown',
        head_hex: headBytesHex(raw),
        raw_len: raw.length,
      });
    } catch { /* never break the hook */ }
    return {};
  }
}

export type AutoOutcome =
  | { outcome: 'no_action' }
  | { outcome: 'pending' };

const PROMPT_ENHANCEMENT_CLI_DIAGNOSTIC_REASON_CODES_V1 = new Set([
  'no_tty',
  'renderer_failure',
  'action_result_not_renderable',
  'invalid_prepare_result',
  'invalid_popup_session',
  'popup_identity_mismatch',
  'missing_required_popup_action',
  'typed_no_popup_disposition',
  'invalid_render_timestamp',
  'delivery_surface_mismatch',
  'host_launch_failed',
  'invalid_host_result',
]);

const PROMPT_ENHANCEMENT_CLI_DIAGNOSTIC_REASON_LIMIT_V1 = 8;

export interface PromptEnhancementCliSubmitConsumerDiagnosticV1 {
  [key: string]: unknown;
  state: PromptEnhancementCliPopupResultV1['state'];
  hostAdapter: 'direct_tty' | 'linux_terminal' | 'unavailable';
  hookOutput: 'block_no_send' | 'additional_context' | 'allow_original_or_not_shown';
  reasonCodes: readonly string[];
}

/**
 * Build the public-safe PE live-consumer diagnostic payload.
 *
 * The popup result can carry body text and its reason array crosses a runtime
 * boundary, so neither is logged directly. Only allowlisted enum values are
 * retained; any unknown value is collapsed to one bounded marker.
 */
export function buildPromptEnhancementCliSubmitConsumerDiagnosticV1(
  popupResult: PromptEnhancementCliPopupResultV1,
  hookOutput: ClaudeUserPromptSubmitHookOutputV1 | undefined,
  hostAdapter: PromptEnhancementCliSubmitConsumerDiagnosticV1['hostAdapter'] = 'direct_tty',
): PromptEnhancementCliSubmitConsumerDiagnosticV1 {
  const reasonCodes: string[] = [];
  if (popupResult.state === 'not_shown') {
    for (const reasonCode of popupResult.reasonCodes) {
      const safeReasonCode = PROMPT_ENHANCEMENT_CLI_DIAGNOSTIC_REASON_CODES_V1.has(reasonCode)
        ? reasonCode
        : 'unrecognized_reason_code';
      if (!reasonCodes.includes(safeReasonCode)) reasonCodes.push(safeReasonCode);
      if (reasonCodes.length === PROMPT_ENHANCEMENT_CLI_DIAGNOSTIC_REASON_LIMIT_V1) break;
    }
  }

  return {
    state: popupResult.state,
    hostAdapter,
    hookOutput: hookOutput
      ? hookOutput.decision === 'block' ? 'block_no_send' : 'additional_context'
      : 'allow_original_or_not_shown',
    reasonCodes,
  };
}

export interface PromptEnhancementCliHostConsumerDependenciesV1 {
  store: Store;
  dbPath: string;
  cliEntryPath: string;
  resolveCapability?: () => PromptEnhancementCliHostCapabilityV1;
  launchHost?: (input: {
    capability: PromptEnhancementCliHostCapabilityV1;
    request: PromptEnhancementPrepareRequestV1;
    result: PromptEnhancementPrepareResultV1;
    cliEntryPath: string;
    dbPath: string;
  }) => Promise<PromptEnhancementCliPopupHostLaunchResultV1>;
  showDirectPopup?: (input: {
    request: PromptEnhancementPrepareRequestV1;
    result: PromptEnhancementPrepareResultV1;
    feedbackSink: (event: PromptEnhancementPopupEventV1) => ReturnType<typeof recordPromptEnhancementCliFeedbackV1>;
    costObservabilitySink?: (result: PromptEnhancementPrepareResultV1) => void;
  }) => Promise<PromptEnhancementCliPopupResultV1>;
  onHookOutput?: (output: ClaudeUserPromptSubmitHookOutputV1 | undefined) => void;
}

function popupResultFromHostLaunchV1(
  result: PromptEnhancementCliPopupHostLaunchResultV1,
): PromptEnhancementCliPopupResultV1 {
  if (result.state === 'completed') {
    return validatePromptEnhancementCliPopupResultV1(result.output.result)
      ? result.output.result
      : { state: 'not_shown', reasonCodes: ['invalid_host_result'] };
  }
  return {
    state: 'not_shown',
    reasonCodes: [result.state === 'host_unavailable' ? 'no_tty' : 'host_launch_failed'],
  };
}

/**
 * Hook-only PE host selector. It preserves the existing direct-TTY popup path,
 * uses the PE1.3 private-file launcher for a supported Linux terminal, and
 * keeps unavailable/launch-failed hosts on normal original-prompt pass-through.
 */
export function createPromptEnhancementCliHostConsumerV1(
  dependencies: PromptEnhancementCliHostConsumerDependenciesV1,
): AutoPromptEnhancementConsumerV1 {
  const resolveCapability = dependencies.resolveCapability ?? resolvePromptEnhancementCliHostCapabilityV1;
  const launchHost = dependencies.launchHost ?? runPromptEnhancementCliPopupHostLaunchV1;
  const showDirectPopup = dependencies.showDirectPopup ?? runPromptEnhancementCliSubmitPopupV1;

  return async (preparation, request) => {
    if (preparation.safeFallback || !preparation.result) return;

    const capability = resolveCapability();
    let popupResult: PromptEnhancementCliPopupResultV1;
    let hostAdapter: PromptEnhancementCliSubmitConsumerDiagnosticV1['hostAdapter'];
    if (capability.state === 'unavailable') {
      hostAdapter = 'unavailable';
      popupResult = { state: 'not_shown', reasonCodes: ['no_tty'] };
    } else if (capability.method === 'direct_tty') {
      hostAdapter = 'direct_tty';
      popupResult = await showDirectPopup({
        request,
        result: preparation.result,
        feedbackSink: (event) => recordPromptEnhancementCliFeedbackV1(dependencies.store, request.projectRoot, event, request),
        // NF Plan B (B-2): content-free per-action telemetry — buffered locally, sent on the
        // feedback-consent flush (store-backed sink; in-process direct popup).
        actionSignalSink: (kind, occurredAt) => recordActionSignal(dependencies.store, request.projectRoot, kind, occurredAt),
        costObservabilitySink: (result) => emitPromptEnhancementCostObservabilityV1(result, 'popup_action', logger),
        // Ctrl+T inside the popup (owner request 2026-09-18) — this branch holds the open store.
        settingsControl: buildPromptEnhancementSettingsControlV1(dependencies.store, request.projectRoot),
      });
    } else {
      hostAdapter = 'linux_terminal';
      try {
        popupResult = popupResultFromHostLaunchV1(await launchHost({
          capability,
          request,
          result: preparation.result,
          cliEntryPath: dependencies.cliEntryPath,
          dbPath: dependencies.dbPath,
        }));
      } catch {
        popupResult = { state: 'not_shown', reasonCodes: ['host_launch_failed'] };
      }
    }

    const hookOutput = buildClaudeUserPromptSubmitHookOutputV1(popupResult);
    dependencies.onHookOutput?.(hookOutput);
    logger.debug(
      'prompt_enhancement_cli_submit_consumer',
      buildPromptEnhancementCliSubmitConsumerDiagnosticV1(popupResult, hookOutput, hostAdapter),
    );
    return popupResult.state === 'closed_no_send' ? 'handled_no_send' : 'continue';
  };
}

// ── Core orchestration ─────────────────────────────────────────────────────────

/**
 * Run the full nexpath auto pipeline.
 *
 * @param input    Prompt text + project root
 * @param store    Open SQLite store (caller manages lifecycle)
 * @param openai   Optional OpenAI client (injectable for testing)
 * @returns AutoOutcome — what the pipeline decided and did
 */
/**
 * The phrases this prepared body may show in bold.
 *
 * One derivation for both store sites: the row is written in two branches of runAuto and only
 * one runs per prepare, but they must never derive the list differently — the popup reads
 * whichever row was written, and a difference between them would be invisible until it showed
 * on screen.
 *
 * Read-only. It runs after the body is final, so it cannot change a byte of what the agent
 * receives; it only says which of those bytes the popup may draw louder.
 */
function emphasisPhrasesForPreparedBodyV1(
  result: PromptEnhancementPrepareResultV1,
  request: PromptEnhancementPrepareRequestV1,
): readonly PromptEnhancementEmphasisPhraseV1[] {
  return buildPromptEnhancementEmphasisPhrasesV1({
    originalPromptText: result.currentBody.originalPromptText,
    sections: result.currentBody.sections.map((section) => ({
      sectionKind: section.sectionKind,
      bodyText: section.bodyText,
      ...(section.groundedFactValues ? { groundedFactValues: section.groundedFactValues } : {}),
      ...(section.sourceFactIds ? { sourceFactIds: section.sourceFactIds } : {}),
      ...(section.sourceIds ? { sourceIds: section.sourceIds } : {}),
    })),
    ...(request.reviewMomentContext.detectedLanguage
      ? { detectedLanguage: request.reviewMomentContext.detectedLanguage }
      : {}),
  });
}

export async function runAuto(
  input:   AutoInput,
  store:   Store,
  openai?: OpenAI,
  promptEnhancement?: AutoPromptEnhancementIntegration,
): Promise<AutoOutcome> {
  // Desktop session isolation guard: completely bypass CLI auto hook when Desktop App is running
  if (process.env.NEXPATH_DESKTOP_SESSION === '1') {
    return { outcome: 'no_action' };
  }

  // MPS P1b-i (owner unit P1) — thread the live store handle + the (optional, key-gated) LLM client
  // into the PE facade so the full sequence planner can REPLACE the display-only describe splitter as
  // the source of truth for the compact sequence summary. The planner runs ONLY on sequence candidates
  // and only on a baseline prepare; every non-sequence prompt is byte-identical to before, and any
  // planner failure / refusal (config off, no key, provider error) / single-prompt outcome falls back
  // to the describe path. `openai` is undefined on the production hook path (the planner then constructs
  // its own client, key-gated off the resolved OPENAI_API_KEY); tests inject a stub. This keeps the
  // `PromptEnhancementPrepareFacadeV1` contract type unchanged.
  // MPS P1b-ii (step 8b) — the planner runs here (UserPromptSubmit) but its item list is consumed by
  // the background wording batch at the Stop hook, a DIFFERENT process (owner decision B-i). The
  // carrier is the pending PE row: capture the item list from the most recent prepare and store it
  // beside the row below. This is a side-channel because the closure must stay the contract-typed
  // `PromptEnhancementPrepareFacadeV1` for the generic `preparePromptEnhancementForAuto` boundary.
  // Safe: each prepare→upsert is a linear await chain (no concurrent prepares), so the value read at
  // an upsert is always the one this closure set during that upsert's own prepare. Reset every call
  // (undefined on non-sequence), so no stale list can carry across preparations.
  let capturedPlannerItems: readonly PromptEnhancementSequenceItemV1[] | undefined;
  let capturedPlannerPromptDirectives: readonly PromptEnhancementSequenceOffsetRangeV1[] | undefined;
  let cachedF1Result: import('../../context-engineering/index.js').EnhancementResultWithSections | undefined = undefined;
  const getF1Result = async (promptText: string, projectRoot: string): Promise<import('../../context-engineering/index.js').EnhancementResultWithSections | undefined> => {
    if (cachedF1Result !== undefined) return cachedF1Result;
    try {
      cachedF1Result = await prepareFeature1PromptEnhancement(promptText, {
        workspacePath: projectRoot,
        store,
      });
    } catch {
      cachedF1Result = undefined;
    }
    return cachedF1Result;
  };

  const preparePromptEnhancementForRunAuto: PromptEnhancementPrepareFacadeV1 = async (peRequest) => {
    const prepared = await preparePromptEnhancementWithSequenceV1(peRequest, {
      db: store.db,
      client: openai as unknown as PromptEnhancementSequencePlannerClientV1 | undefined,
    });
    capturedPlannerItems = prepared.plannerItems;
    capturedPlannerPromptDirectives = prepared.plannerPromptDirectives;

    // Feature 1: Context Engine integration for CLI popup
    try {
      const f1Result = await getF1Result(peRequest.sourcePrompt.text, peRequest.projectRoot);

      if (f1Result && f1Result.isEnhanced && prepared.result) {
        const rawUserPrompt = peRequest.sourcePrompt.text.trim();
        const sectionBlocks: string[] = [
          'My original request (verbatim):',
          rawUserPrompt,
        ];

        if (f1Result.sections && f1Result.sections.length > 0) {
          for (const sec of f1Result.sections) {
            if (sec.lines && sec.lines.length > 0) {
              sectionBlocks.push('');
              sectionBlocks.push(`${sec.title}:`);
              for (const line of sec.lines) {
                sectionBlocks.push(line);
              }
            }
          }
        }

        const formattedEnhancedBody = sectionBlocks.join('\n');

        prepared.result.disposition = 'show_current_body';
        prepared.result.currentBody = {
          ...prepared.result.currentBody,
          composerMode: 'baseline_llm_structured_wording',
          text: formattedEnhancedBody,
          renderedPromptBody: formattedEnhancedBody,
        };
        if (prepared.result.uiView && prepared.result.uiView.body) {
          prepared.result.uiView = {
            ...prepared.result.uiView,
            body: {
              ...prepared.result.uiView.body,
              text: formattedEnhancedBody,
              sendPolicy: 'send_current',
            },
          };
        }

        if (prepared.result.bodyPlan) {
          const orderedSectionPlans = (f1Result.sections && f1Result.sections.length > 0)
            ? f1Result.sections.map((sec, idx) => ({
                sectionPlanId: `${sec.id}:plan`,
                sectionId: sec.id,
                templateId: 'prompt_enhancement_template',
                order: idx + 1,
                sourceRefs: [],
                validationStatus: 'pass' as const,
                fallbackMode: 'allowed' as const,
                callVisibilityMode: 'llm_wording' as const,
              }))
            : [
                {
                  sectionPlanId: 'context_and_constraints:plan',
                  sectionId: 'context_and_constraints',
                  templateId: 'prompt_enhancement_template',
                  order: 1,
                  sourceRefs: [],
                  validationStatus: 'pass' as const,
                  fallbackMode: 'allowed' as const,
                  callVisibilityMode: 'llm_wording' as const,
                },
              ];

          prepared.result.bodyPlan = {
            ...prepared.result.bodyPlan,
            orderedSectionPlans: orderedSectionPlans as any,
            generatedOriginPolicy: 'attach_generated_origin_metadata',
          };
        }
      }
    } catch (f1Err) {
      logger.debug('feature1_cli_prepare_failed', { error: String(f1Err) });
    }

    return prepared.result;
  };

  // ── -1. Advisory-injected prompt guard ──────────────────────────────────────
  // When the stop hook injects an advisory option as a new Claude turn (block decision),
  // Claude Code fires UserPromptSubmit with that option text — it arrives here like any
  // real user prompt.  We must skip ALL processing: the text is synthetic and would
  // corrupt signals, stage confidence, user profile, mood, and can re-fire an advisory.
  //
  // The field is always cleared (match or no match) so a cancelled injection cannot
  // leave stale state that silently skips the next genuine user prompt.
  {
    // ⛔ `endPreviousSession: false` — this manager is a throwaway used only to read and clear
    // the injected-prompt field, and it is discarded at the end of this block. Closing the
    // ended session here would do it a SECOND time a few lines later, when the real manager
    // loads: two maturity graduation observations and two boundary records for one boundary.
    // The state this returns is unchanged by the flag; only the closing side effects are left
    // to the real load below.
    const guardMgr = SessionStateManager.load(store, input.projectRoot, Date.now(), { endPreviousSession: false });
    const injectedText = guardMgr.current.lastInjectedPrompt ?? null;
    if (injectedText !== null) {
      guardMgr.clearInjectedPrompt(store);
      // Robust echo match (not exact ===): the delivered prompt may be option + why-desc
      // (multi-line) and the agent can reformat it, so recognise it by normalized / option-prefix.
      if (isInjectedPromptEcho(injectedText, input.promptText)) {
        logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'advisory_injected' });
        return { outcome: 'no_action' };
      }
    }
  }

  // ── -0.5. Record active usage — one heartbeat per genuine user prompt,
  //          accumulated globally (feeds the feedback popup cadence). Runs after
  //          the advisory-injected guard so synthetic prompts do not count.
  recordActivity(store);

  // ── 0.0. Implicit project registration (Issue 6) ─────────────────────────────
  if (!getProject(store, input.projectRoot)) {
    const name = resolveProjectName(input.projectRoot);
    upsertProject(store, { projectRoot: input.projectRoot, name });
  }
  // Historical backfill runs OUTSIDE the registration branch: `nexpath init` also
  // registers the project, so a registration-gated call would never run for a user
  // who ran init before their first prompt, and their pre-install history would be
  // silently lost. The function self-gates on zero stored prompts (one cheap query),
  // which is also the pinned edge: any prompt stored before this point skips the
  // import entirely — it must stay ahead of the insertPrompt below.
  //
  // Best-effort, like every other side task on this path: it reads session files
  // the coding agent is actively writing and rotating, so a listed file can be gone
  // or unreadable by the time it is opened. Sitting ahead of insertPrompt, an
  // uncaught throw here would cost the user their live prompt AND fail the hook on
  // their very first prompt — losing old history is bad, losing the current one is
  // worse. Failure is logged and the pipeline continues.
  // Cursor's and Devin Local's history is read only for editors whose user allowed NexPath to
  // read their AI chat history (asked only when the import runs); the live prompt is passed so
  // it is never imported twice.
  let historyImport: HistoryImportSummary | undefined;
  try {
    historyImport = await importHistoricalPrompts(store, input.projectRoot, {
      livePrompt: input.promptText,
      otherAgentConsent: readChatHistoryConsent,
    });
  } catch (err) {
    logger.warn('historical_import_failed', {
      project: input.projectRoot,
      error: err instanceof Error ? err.message : String(err),
      actionable: 'Pre-install prompt history was not imported for this project; live capture is unaffected and continues normally.',
    });
  }

  // ── 0. Persist prompt text — runs before classifier so prompt is stored even if pipeline errors ──
  insertPrompt(store, { projectRoot: input.projectRoot, promptText: input.promptText, agent: ACTIVE_AGENT_ID });

  // ── 1. Load session state ────────────────────────────────────────────────────
  const mgr = SessionStateManager.load(store, input.projectRoot);
  // Record the coding-agent's current mode (when the hook reported it) before the
  // pipeline builds its runtime context; persisted by processPrompt below.
  mgr.setAgentMode(input.currentAgentMode);

  // Once per session (first prompt): record the dev-environment trajectory — probe the project's
  // env facts, and emit a flap-damped change event if a fact moved since the last confirmed probe
  // (e.g. version control added). Consent-gated + best-effort; never blocks the pipeline.
  // A session the import just created from Cursor or Devin Local history alone would have started
  // empty here without that history, so the probe runs as it did then, at an empty session's index.
  const seededFromOtherAgentsOnly = historyImport?.seededFromOtherAgentsOnly === true;
  if (mgr.current.promptCount === 0 || seededFromOtherAgentsOnly) {
    try {
      recordEnvTrajectory(store, input.projectRoot, {
        sessionId:       mgr.current.sessionId,
        promptIndex:     seededFromOtherAgentsOnly ? 0 : mgr.current.promptCount,
        stage:           mgr.current.currentStage,
        stageConfidence: mgr.current.stageConfidence,
      });
    } catch { /* trajectory recording is non-fatal */ }
  }
  const prevStage: Stage = mgr.current.currentStage;
  logger.debug('session_loaded', { promptCount: mgr.current.promptCount, stage: prevStage, project: input.projectRoot });
  writeTelemetry(input.projectRoot, 'prompt_received', { promptCount: mgr.current.promptCount }, store);

  // ── 1.5. Resolve frequency config and role — used throughout the pipeline ────
  const freq = (
    getConfig(store.db, `advisory_frequency:${input.projectRoot}`) ??
    getConfig(store.db, 'advisory_frequency') ??
    'optimum'
  ) as AdvisoryFrequencyLevel;
  const freqConfig = resolveFrequencyConfig(freq);

  const configuredRole = (
    getConfig(store.db, `role:${input.projectRoot}`) ??
    getConfig(store.db, 'role') ??
    null
  ) as import('../../core/classifier/types.js').UserRole | null;

  // ── 2. LLM profile classification — runs before the stage classifier so the classifier
  //       calibrates on the freshly-computed profile ──────────────────────────────
  // ⛔ THE CREDENTIAL GATE IS LOAD-BEARING — without it this line CRASHED the hook.
  //
  // `openai` is undefined on the production hook path, so `OpenAILLMAdapter` falls back to
  // `new OpenAI()` (llm.adapter.ts:14), and the SDK throws when no key resolves. That killed
  // `nexpath auto` with exit 1 in ~260 ms — on the THIRD prompt of every session, because
  // MIN_PROFILE_PROMPTS is 4 and this tests `>= MIN_PROFILE_PROMPTS - 1`. Nothing was captured and
  // the user was told nothing. Reported by Vedansi with four reproductions, 2026-09-07.
  //
  // The comment below used to claim offline paths "don't require an API key". True of the lazy
  // CONSTRUCTION, false of this branch, which reaches the call. It has been corrected.
  //
  // Reading `process.env` is correct here and is NOT env-only: `autoAction` calls
  // `resolveOpenAIKey()` (auto.ts, before `runAuto` is invoked), which promotes the winner of the
  // 4-layer chain — env → project .env → OS keychain → 0600 file — into `process.env`. A keychain
  // user is unaffected. Same predicate the composer uses at facade.ts:222 and :334, and
  // `isUsableLlmCredential` deliberately accepts a Nexpath token as well as an `sk-` key.
  //
  // `openai !== undefined` short-circuits first, and that is not a convenience for tests: an
  // INJECTED client needs no credential of its own, so gating it on the env var would disable a
  // perfectly working caller. Two existing auto.test.ts cases inject a stub and no key — they
  // caught this when the gate was credential-only, which is exactly what they are there for.
  //
  // With no usable credential the profile simply is not recomputed — the same degrade the stage
  // classifier already performs, and every consumer of `profile` already handles null.
  if (isProfileStale(mgr.current.profile, mgr.current.promptCount) &&
      mgr.current.promptHistory.length >= MIN_PROFILE_PROMPTS - 1 &&
      (openai !== undefined || isUsableLlmCredential(process.env['OPENAI_API_KEY'] ?? ''))) {
    const updatedProfile = await classifyUserProfileLLM(
      mgr.current.promptHistory as import('../../core/classifier/types.js').PromptRecord[],
      mgr.current.promptCount,
      mgr.current.profile,
      // Adapters — wired to core port interfaces. Constructed lazily here (not at runAuto entry):
      // the OpenAI SDK is only instantiated when profile classification actually runs. The branch
      // above guarantees a usable credential by the time we get here.
      new OpenAILLMAdapter(openai),
      loggerAdapter,
    );
    mgr.setProfile(updatedProfile);
    logger.debug('profile_classified', { nature: updatedProfile.nature, mood: updatedProfile.mood, depth: updatedProfile.depth });
    writeTelemetry(input.projectRoot, 'profile_computed', {
      nature:             updatedProfile.nature,
      mood:               updatedProfile.mood,
      depth:              updatedProfile.depth,
      precisionOrdinal:   updatedProfile.precisionOrdinal,
      playfulnessOrdinal: updatedProfile.playfulnessOrdinal,
      computedAt:         updatedProfile.computedAt,
    }, store);
  }

  // ── 2.7. Inject configured role into profile ────────────────────────────────
  const currentProfileForRole = mgr.current.profile;
  if (currentProfileForRole !== null) {
    mgr.setProfile({ ...currentProfileForRole, role: configuredRole });
  }

  // ── 2.8. Stream B presence classification ────────────────────────────────────
  // Start from prompt 3 — the earliest any Stream B absence threshold can fire.
  let streamBOverrides: StreamBPresenceResult | undefined;
  if (mgr.current.currentStage === 'implementation'
      && mgr.current.promptsInCurrentStage >= 3) {
    streamBOverrides = await classifyStreamBPresence(input.promptText, openai)
      .catch(() => {
        logger.debug('stream_b_presence_failed', { prompt: input.promptText.slice(0, 60) });
        return undefined; // fallback: vibeKeyword detection stands
      });
  }

  // ── 2.9. Stage classifier — one LLM call (after profile + Stream-B, so it calibrates on the
  //        fresh profile); folds the former cascade + cross-confirmation. Its stage feeds processPrompt. ──
  // The sensitive-action clearance micro-call starts FIRST and is never awaited: it is
  // deterministically gated (no risky word ⇒ inert), runs during the classifier's own wait
  // below, and is read synchronously (then aborted if still pending) right after that await —
  // added wall time is exactly zero and the hook process's lifetime is unchanged. Every
  // failure mode reads as "no clearance", which keeps today's confirmation behaviour intact.
  // Build the queue the engine will enforce if the stage stays, ready for the ranking micro-call that is
  // issued beside the classifier below. Never awaited; read at the pick; zero added wall time.
  let rankCandidateKeys: string[] = [];
  try {
    const rankProjectType = getProject(store, input.projectRoot)?.projectType ?? undefined;
    const rankRuntimeContext = buildRuntimeContext(mgr.current as import('../../classifier/types.js').SessionState);
    rankCandidateKeys = estimateQueueIfStageStaysV1(mgr.current as import('../../core/classifier/types.js').SessionState, mgr.current.profile, rankProjectType, freqConfig.signalAbsenceThresholdMultiplier, freqConfig.signalAbsenceMinFloor, rankRuntimeContext);
  } catch (e) { logger.info('queue_rank_error', { where: 'prequeue', error: String(e) }); rankCandidateKeys = []; }
  const rankRecentPrompts = [...mgr.current.promptHistory.slice(-3).map((p) => p.text), input.promptText];
  const microClearance = startSensitiveActionMicroClearanceV1(input.promptText, openai);
  const stagePromise = classifyStage(
    {
      promptText:        input.promptText,
      window:            [...mgr.current.promptHistory.map((p) => ({ text: p.text })), { text: input.promptText }],
      sessionStage:      prevStage,
      sessionConfidence: mgr.current.stageConfidence,
      profile:           mgr.current.profile,
    },
    openai,
    {
      minConfidence: freqConfig.stage2MinConfidence,
      contextWindow: freqConfig.stage2ContextWindow,
      // A refused call and a machine with no credential both degrade to the
      // local classifier and both go quiet, which made "guidance stopped
      // helping" untraceable. This records WHICH — a construction failure never
      // reaches the network and so carries no status.
      //
      // ⚠️ Reported, not interpreted: the status is written down and nothing
      // here claims to know what it means. The provider's message is redacted
      // first — this line lands in ~/.nexpath/nexpath.log, and an error string
      // is not a place a credential is guaranteed never to appear.
      onProviderError: (details) => {
        logger.warn('stage_classifier_provider_error', {
          status:  details.status,
          code:    details.code,
          type:    details.type,
          message: redactSecrets(details.message).slice(0, 300),
        });
      },
    },
  );
  // Issued AFTER the classifier's own call so runAuto's first call stays the stage classifier's, and
  // BEFORE the await below so both are in flight across it — the concurrency is unchanged either way.
  const queueRank = startQueueRankMicroCallV1(rankCandidateKeys, rankRecentPrompts, openai as any);
  logger.info('queue_rank_start', { promptCountBefore: mgr.current.promptCount, n: rankCandidateKeys.length, outcome: queueRank.outcome() });
  const stageResult = await stagePromise;
  microClearance.abort();
  const settledClearance = microClearance.read();
  // Observability for the capture/failure rate (the I1 lesson, applied here from day one):
  // an absent clearance that cannot be told apart from "never attempted" answers nothing —
  // gated-out is normal, pending_or_failed counts against the reliability bound the owner
  // approved (≤ 1-in-20), and this line is what makes that bound readable from any run.
  logger.debug('sensitive_action_clearance_outcome', { outcome: microClearance.outcome() });
  if (settledClearance !== undefined) {
    // Merged into the SAME stageResult both request-build sites pass to the one threading
    // block, so the provenance field's producer changes with zero second wiring.
    stageResult.sensitiveActionVerdict = settledClearance.verdict as 'proposed' | 'not_proposed';
    stageResult.sensitiveActionReason = settledClearance.reason;
    stageResult.sensitiveActionName = settledClearance.name;
    // Attributability (a binding condition of the clearance exception): every clearance that
    // can remove a safety line must be auditable from an ordinary debug run — verdict AND the
    // model's stated benign reading. Local debug log only, same privacy class as the prompt
    // slices logged beside it.
    logger.debug('sensitive_action_clearance', {
      verdict: settledClearance.verdict,
      reason: settledClearance.reason?.slice(0, 160),
      name: settledClearance.name?.slice(0, 60),
    });
  }
  const classification = stageResult.classification;
  logger.debug('stage_classified', { stage: classification.stage, confidence: classification.confidence, fire: stageResult.fireRecommendation, degraded: stageResult.degraded });
  writeTelemetry(input.projectRoot, 'prompt_classified', { stage: classification.stage, confidence: classification.confidence }, store);

  // ── 3. Process prompt → updates state (stage, history, counters) ─────────────
  mgr.processPrompt(store, input.promptText, classification, Date.now(),
    freqConfig.minStageChangeConfidence, streamBOverrides);
  logger.debug('after_process', { stage: mgr.current.currentStage, stageConfidence: mgr.current.stageConfidence });

  // A degraded classification is the local keyword/TF-IDF guess, produced because the
  // model was unreachable — and `processPrompt` above persists whatever stage it
  // proposes. When that guess MOVES the stage, the move outlives the outage: the
  // credential is fixed, the model returns, and the session is still sitting where a
  // keyword left it, shaping every later prompt.
  //
  // ⚠️ CHANGES NOTHING. It reports a move that already happened, from two values that
  // already exist either side of the call above. It exists because the move was
  // previously unreadable: `stage_classified` reports `degraded`, `after_process`
  // reports the resulting stage, and nothing tied the first to the second — a reader had
  // to hold both lines together and know the confidence gate to infer it.
  //
  // `warn` rather than `debug` so it is visible at the default level: the next occurrence
  // should be one grep, not a reconstruction.
  if (stageResult.degraded && prevStage !== mgr.current.currentStage) {
    logger.warn('stage_changed_by_degraded_classifier', {
      projectRoot: input.projectRoot,
      from:        prevStage,
      to:          mgr.current.currentStage,
      confidence:  classification.confidence,
    });
  }

  // Corroborate practice claims against the agent's ACTUAL behaviour: read the
  // transcript entries appended since the previous hook and credit verified
  // behaviour (a test file written, the suite run) to the prompt the agent was
  // responding to. Rides prompt-capture consent (same hook payload as the
  // permission mode); best-effort — never blocks the pipeline. The prompt just
  // processed has index promptCount - 1 (processPrompt increments the count).
  if (input.transcriptPath) {
    try {
      recordTranscriptCorroboration(store, input.projectRoot, input.transcriptPath, {
        sessionId:       mgr.current.sessionId,
        promptIndex:     mgr.current.promptCount - 1,
        stage:           mgr.current.currentStage,
        stageConfidence: mgr.current.stageConfidence,
      });
    } catch { /* corroboration is non-fatal */ }
  }

  // ── 3.5. Effective language — read from projects table (detection runs in nexpath stop) ──
  const langOverride  = getConfig(store.db, 'language_override');
  const project       = getProject(store, input.projectRoot);
  const detectedLang  = project?.detectedLanguage ?? undefined;
  const projectType   = project?.projectType ?? undefined;
  const effectiveLang = resolveLanguage(langOverride, detectedLang);
  logger.debug('language', { effectiveLang: effectiveLang ?? null });

  // ── 4. Absence detection ─────────────────────────────────────────────────────
  const newFlags = detectAbsenceFlags(
    mgr.current as import('../../core/classifier/types.js').SessionState,
    mgr.current.profile,
    projectType,
    freqConfig.signalAbsenceThresholdMultiplier,
    freqConfig.signalAbsenceMinFloor,
    buildRuntimeContext(mgr.current as import('../../classifier/types.js').SessionState),
  );
  logger.debug('absence_flags', { new: newFlags.length, total: mgr.current.absenceFlags.length });
  writeTelemetry(input.projectRoot, 'absence_flags_detected', {
    newFlagsCount:   newFlags.length,
    totalFlagsCount: mgr.current.absenceFlags.length,
    flagKeys:        newFlags.map((f) => f.signalKey),
  }, store);

  // ── 4.6. Sequence-shaped PE fallback (team-leader approved fix, 2026-08-06) ──
  // PE preparation historically ran ONLY inside the decision-trigger branch, so a multi-step
  // (MPS-eligible) prompt reached the engine only when it coincidentally landed on a trigger
  // turn — making the MPS popup effectively untestable. For SEQUENCE-SHAPED prompts only
  // (multi-intent, or a >=3-point list), prepare + store the pending PE on every no-action
  // exit below, exactly like the fired path (the popup still shows on the Stop hook). It
  // creates NO advisory, marks NO decision-session fired, and ordinary prompts keep the
  // existing trigger cadence. Frequency 'off' stays fully silent (checked before this runs).
  let sequencePeFallbackDone = false;
  // A3 step 7 — refresh the CACHED prompt-derived facts, at most once per invocation and only when
  // the threshold of new prompts has been crossed.
  //
  // ⛔ Placed on the PE-preparation path, NOT on the bare auto path. The miner is an LLM call: on
  // the auto path it would sit in front of every prompt's hook, stalling the agent on the one
  // prompt in N where it fires. Here it runs only when PE is already preparing a popup, so the
  // user is already waiting for a call — and the threshold keeps it to one mine per
  // PROMPT_FACTS_REFRESH_EVERY_N_PROMPTS prompts per project either way.
  //
  // ⚠️ Best-effort: the helper swallows its own failures, so a miner that cannot reach the
  // provider costs an empty grounding lane and nothing else.
  let promptFactsRefreshDone = false;
  const ensurePromptFactsFresh = async (): Promise<void> => {
    if (promptFactsRefreshDone) return;
    promptFactsRefreshDone = true;
    await refreshPromptDerivedFactsIfDueV1({
      store,
      projectRoot: input.projectRoot,
      currentPromptCount: mgr.current.promptCount,
      // newest-first from the store; the miner reads the tail, so hand it oldest-first.
      recentPrompts: getRecentPrompts(store, input.projectRoot, 5).map((r) => r.text).reverse(),
    });
  };
  // F4: every blocked branch names the eligibility it is blocking WITH, so the fact built on that
  // path inherits the pipeline's own decision instead of arriving unlabelled.
  const prepareSequenceShapedPeFallback = async (
    triggerEligibility: PromptEnhancementSourceEligibilityStateV1,
  ): Promise<void> => {
    // Injected boundary-test integrations keep their own single explicit path.
    if (sequencePeFallbackDone || promptEnhancement !== undefined) return;
    const isSequenceShaped = isPromptEnhancementSequenceShapedTextV1(input.promptText);
    const f1 = await getF1Result(input.promptText, input.projectRoot);
    const hasFeature1Context = f1?.isEnhanced === true;

    if (!isSequenceShaped && !hasFeature1Context) return;
    sequencePeFallbackDone = true;
    await ensurePromptFactsFresh();
    const request = buildPromptEnhancementRequestForAuto({
      auto: input,
      store,
      session: mgr,
      project,
      effectiveLanguage: effectiveLang,
      configuredRole,
      effectiveFlagType: 'stage_transition',
      firedKey: `sequence_shaped:${mgr.current.promptCount}`,
      previousStage: prevStage,
      trigger: { kind: 'stage_transition' },
      stageResult,
      // F4: the branch that called this fallback already decided WHY the advisory was
      // blocked. Dropping the value here would leave every blocked-path fact unlabelled
      // while the call sites looked correctly wired — which is exactly what happened
      // until verification round 4 traced the parameter and found it unused.
      triggerEligibility,
      streamBOutputs: [],
    });
    const preparation = await preparePromptEnhancementForAuto({ request, prepare: preparePromptEnhancementForRunAuto });
    logger.debug('prompt_enhancement_prepare_boundary', {
      disposition: preparation.disposition,
      safeFallback: preparation.safeFallback,
      reasonCode: 'reasonCode' in preparation ? preparation.reasonCode : undefined,
      validationReasonCodes: 'validationReasonCodes' in preparation && preparation.validationReasonCodes
        ? preparation.validationReasonCodes.slice(0, 10)
        : undefined,
      blockedFailureCodes: blockedFailureCodesForLog(preparation),
      // Q3 (owner): the deterministic suppression gets its OWN name in the log, so "how often does
      // a popup get withheld for having no LLM wording" is a number we can read rather than an
      // impression. `no_popup_not_applicable` alone cannot answer it — the route suppresses under
      // that same disposition for entirely different reasons.
      suppressedReason: promptEnhancementBodyHasNoLlmWordingV1(preparation.result)
        ? 'deterministic_only_no_llm_wording'
        : undefined,
      // I1 observability (prohibition 10 — no hidden runtime seams). Fixtures prove the PARSER
      // reads `section_relevance_order`; they cannot prove the MODEL emits it, and a model that
      // never does degrades SILENTLY to an empty ordering — I2 would then prune on evidence alone
      // with every test green. That is C1's own recorded failure shape. Logging the count makes
      // non-compliance readable from any ordinary run instead of needing a bespoke probe: a keyed
      // session showing 0 here on every prompt is the model ignoring the instruction.
      // ⚠️ Logged BESIDE the count because the count alone cannot be read: 0 means either the
      // model ignored the instruction or NO MODEL RAN (no key, provider failure, degrade). Those
      // need opposite responses, and without this flag the field answers neither.
      classifierDegraded: stageResult.degraded,
      relevanceOrderCount: stageResult.sectionRelevanceOrder.length,
      // I2 observability (prohibition 10). The pruner's one job is dropping sections, and until this
      // was logged that job left no trace on an ordinary run — the count existed on the result and
      // nothing read it. Also phase 37's after-number, so the measurement rides a normal log.
      prunedSectionCount: preparation.result?.prunedSectionCount,
      floorSectionCount: preparation.result?.floorSectionCount,
      sequenceShapedFallback: true,
    });
    // Phase 4 (defense-in-depth): do NOT persist an unshowable pending. A display decision of `no_popup`
    // (a `no_popup_not_applicable` disposition or a `no_popup` send policy — the shape a missing-key
    // sequence fallback produces) would be loaded at Stop, spawn a window, and be declined by the child
    // (the "blink"). The launcher's Phase 1 gate already blocks that spawn; skipping the row here removes
    // it at the source. Same condition the UI boundary uses (ui-boundary.ts). The skip stays traceable:
    // `prompt_enhancement_prepare_boundary` above logs the disposition, and no `..._stored` log follows.
    const displayDecisionIsNoPopup = preparation.result?.disposition === 'no_popup_not_applicable'
      || preparation.result?.uiView.body.sendPolicy === 'no_popup'
      // Owner ruling (a): a body with no LLM wording is boilerplate, and boilerplate does not
      // earn a popup. Same row, same gate as the blink fix above.
      || promptEnhancementBodyHasNoLlmWordingV1(preparation.result);
    if (!preparation.safeFallback && preparation.result && !displayDecisionIsNoPopup) {
      upsertPendingPromptEnhancement(store, {
        projectRoot: input.projectRoot,
        sessionId:   mgr.current.sessionId,
        promptCount: mgr.current.promptCount,
        request,
        result:      preparation.result,
        // P1b-ii: carry the planner item list + whole-prompt directive ranges (set by the closure
        // during this prepare) so the Stop-hook batch can word items 2…N. Undefined on non-sequence
        // prepares → NULL columns.
        plannerItems: capturedPlannerItems,
        plannerPromptDirectives: capturedPlannerPromptDirectives,
        // Display only: the popup may draw these louder, and the agent never sees the difference.
        emphasisPhrases: emphasisPhrasesForPreparedBodyV1(preparation.result, request),
      });
      const handoffPresent = Boolean(preparation.result.uiView.handoffAndSequenceSummary);
      logger.debug('pending_prompt_enhancement_stored', {
        projectRoot: input.projectRoot,
        sessionId:   mgr.current.sessionId,
        promptCount: mgr.current.promptCount,
        disposition: preparation.disposition,
        sequenceShapedFallback: true,
        // Diagnosability: whether this stored row can ever open the MPS popup.
        handoffPresent,
      });
      // A sequence-shaped prompt that stored WITHOUT a summary is the exact anomaly that was
      // previously untraceable — name the reason (deterministic re-explain) in the log.
      if (!handoffPresent) {
        logger.warn('sequence_summary_absent', {
          projectRoot: input.projectRoot,
          reasonCodes: explainPromptEnhancementSequenceSummaryAbsenceV1(request, preparation.result).slice(0, 8),
        });
      }
    }
    // Phase 4: cost observability is measured for EVERY non-fallback prepare — the display-decision skip
    // above only affects whether the row is STORED, never this telemetry (behaviour unchanged from before).
    if (!preparation.safeFallback && preparation.result) {
      emitPromptEnhancementCostObservabilityV1(preparation.result, 'prepare', logger);
    }
  };

  // ── 4.5. Frequency off fast-exit + minimum prompt guard ────────────────────
  if (freq === 'off') {
    writeTelemetry(input.projectRoot, 'advisory_freq_blocked', { freq }, store);
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'freq_off' });
    return { outcome: 'no_action' };
  }
  if (mgr.current.promptCount < freqConfig.minPromptsBeforeAdvisory) {
    // F4: min-prompts guard: the signal exists but cannot trigger yet
    await prepareSequenceShapedPeFallback('support_only_not_triggering');
    writeTelemetry(input.projectRoot, 'advisory_min_prompts_blocked', { promptCount: mgr.current.promptCount, minRequired: freqConfig.minPromptsBeforeAdvisory }, store);
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'min_prompts_not_reached' });
    return { outcome: 'no_action' };
  }

  // ── 5. Should Stage 2 fire? ──────────────────────────────────────────────────
  const triggerResult: Stage2TriggerResult = shouldFireStage2(
    mgr.current as import('../../core/classifier/types.js').SessionState,
    prevStage,
    newFlags,
    freqConfig.stage2S1LowConfidence,
  );
  logger.debug('should_fire', { trigger: triggerResult?.kind ?? null });

  if (!triggerResult) {
    // F4: no trigger produced this turn
    await prepareSequenceShapedPeFallback('support_only_not_triggering');
    writeTelemetry(input.projectRoot, 'pipeline_no_action', { reason: 'no_flag' }, store);
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'no_flag' });
    return { outcome: 'no_action' };
  }

  // ── 6. Deduplication — already fired this session? ──────────────────────────
  // For absence: use first qualifying flag as the pre-Stage-2 guard proxy.
  const preCheckFiredKey = triggerResult.kind === 'stage_transition'
    ? buildFiredKey('stage_transition', prevStage, mgr.current.currentStage)
    : buildFiredKey(`absence:${triggerResult.qualifyingFlags[0]!.signalKey}` as FlagType, prevStage, mgr.current.currentStage);
  // Phase 2: dedup blocks the OCCURRENCE of a signal, not the signal itself. An absence flag carries
  // the prompt index it was raised at, and the detector raises a fresh one once the practice is still
  // missing after its cooldown — that re-raise IS the "this is happening again" event, so it needs no
  // invented TTL. Suffixing the key with it means one popup per occurrence instead of one per session.
  //
  // ⚠️ The suffix lives ONLY in this key. `firedKey` below is read by the PE request, the router, the
  // guidance facts, the fatigue keys and the popup body the user reads — it stays byte-identical.
  // Stage transitions keep today's dedup on purpose: they have no flag lifecycle, and the classifier
  // oscillates between stages, which is the noise dedup was added for in the first place.
  //
  // ⚠️ The qualifying flags are passed ALONGSIDE the session's own: on the fresh-raise path they have
  // not been persisted yet (that happens at 6.8, below this gate), while the fired key built after it
  // sees them. Without them the two would name different occurrences at a window boundary — the gate
  // reading an absorbed raise that is still inside its own window, the fired key reading the new
  // window the fresh raise opens. A charge recorded under one and checked under the other blocks a
  // genuinely new occurrence. Duplicates are harmless: a repeated raise is absorbed by its own window.
  const occurrenceFlags = triggerResult.kind === 'absence'
    ? [...mgr.current.absenceFlags, ...triggerResult.qualifyingFlags]
    : mgr.current.absenceFlags;
  const dedupKey = triggerResult.kind === 'absence'
    ? `${preCheckFiredKey}#${absenceOccurrenceIndexV1(
        occurrenceFlags,
        triggerResult.qualifyingFlags[0]!.signalKey,
        mgr.current.promptCount,
      ) ?? triggerResult.qualifyingFlags[0]!.raisedAtIndex}`
    : preCheckFiredKey;
  // Phase 1: under `countBudgetOnShow` the gate asks "was this advice SHOWN to the user?" instead of
  // "did an advisory fire?" — an advisory whose popup was discarded must not block its own signal for
  // the rest of the session. `firedDecisionSessions` keeps being written below either way, so the
  // `once_per_session` level and the telemetry counters are untouched.
  const alreadyFired = freqConfig.countBudgetOnShow
    ? mgr.hasShownAdvisoryKeyV1(dedupKey)
    : mgr.hasFiredDecisionSession(dedupKey);
  logger.debug('dedup', { firedKey: preCheckFiredKey, dedupKey, alreadyFired });
  if (alreadyFired) {
    // F4: this key already fired in the session
    await prepareSequenceShapedPeFallback('blocked_by_dedup');
    writeTelemetry(input.projectRoot, 'advisory_dedup_blocked', { firedKey: preCheckFiredKey }, store);
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'already_fired', firedKey: preCheckFiredKey });
    return { outcome: 'no_action' };
  }

  // ── 6.5. Advisory frequency gate ────────────────────────────────────────────
  if (freq === 'major_only' && triggerResult.kind !== 'stage_transition') {
    // F4: major_only policy declined a non-transition
    await prepareSequenceShapedPeFallback('blocked_by_frequency');
    writeTelemetry(input.projectRoot, 'advisory_freq_blocked', { freq, flagType: triggerResult.kind }, store);
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'freq_major_only', flagType: triggerResult.kind });
    return { outcome: 'no_action' };
  }
  if (freq === 'once_per_session' && mgr.current.firedDecisionSessions.length > 0) {
    // F4: once_per_session policy already spent
    await prepareSequenceShapedPeFallback('blocked_by_frequency');
    writeTelemetry(input.projectRoot, 'advisory_freq_blocked', { freq, flagType: triggerResult.kind }, store);
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'freq_once_per_session' });
    return { outcome: 'no_action' };
  }

  // ── 6.6. Post-advisory cooldown — suppress rapid back-to-back advisories ─────
  const lastAdvisory = mgr.current.lastAdvisoryPromptIndex ?? -1;
  if (lastAdvisory >= 0 && mgr.current.promptCount - lastAdvisory < freqConfig.postAdvisoryCooldown) {
    // F4: inside the post-advisory cooldown window
    await prepareSequenceShapedPeFallback('blocked_by_post_advisory_cooldown');
    writeTelemetry(input.projectRoot, 'advisory_cooldown_blocked', {
      promptCount:       mgr.current.promptCount,
      lastAdvisoryAt:    lastAdvisory,
      cooldownRemaining: freqConfig.postAdvisoryCooldown - (mgr.current.promptCount - lastAdvisory),
    }, store);
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'post_advisory_cooldown', promptsSinceLast: mgr.current.promptCount - lastAdvisory });
    return { outcome: 'no_action' };
  }

  // ── 6.7. Session advisory cap — profile-aware ceiling ───────────────────────
  const isVibeProfile =
    mgr.current.profile?.nature === 'beginner' ||
    mgr.current.profile?.nature === 'cool_geek';
  const advisoryCap = isVibeProfile
    ? freqConfig.sessionAdvisoryCapVibe
    : freqConfig.sessionAdvisoryCapDefault;
  // Phase 1: the ceiling counts popups the user actually SAW under `countBudgetOnShow`; otherwise it
  // counts advisories that fired, popup or not. `advisoryCount` is still incremented either way, so
  // `advisoryCountInSession` telemetry keeps its historical meaning.
  const advisoryCount = freqConfig.countBudgetOnShow
    ? (mgr.current.shownPopupCount ?? 0)
    : (mgr.current.advisoryCount ?? 0);
  if (advisoryCount >= advisoryCap) {
    // F4: the session advisory cap is reached
    await prepareSequenceShapedPeFallback('blocked_by_session_cap');
    insertSkippedSession(store, {
      projectRoot:          input.projectRoot,
      sessionId:            mgr.current.sessionId,
      flagType:             'session_cap_reached',
      stage:                mgr.current.currentStage,
      levelReached:         0,
      skippedAtPromptCount: mgr.current.promptCount,
    });
    writeTelemetry(input.projectRoot, 'advisory_cap_blocked', { advisoryCount, advisoryCap }, store);
    logger.info('pipeline_outcome', {
      outcome: 'no_action',
      reason:  'session_cap_reached',
      advisoryCount,
      advisoryCap,
    });
    return { outcome: 'no_action' };
  }

  // ── 6.8. Persist newly-detected absence flags — all qualify for the fire consideration ──
  // Guard: Condition 2 only fires when newFlags is non-empty and trigger kind is absence.
  if (triggerResult.kind === 'absence' && newFlags.length > 0) {
    for (const flag of newFlags) {
      mgr.addAbsenceFlag(store, flag);
    }
  }

  // ── 7. Fire cross-confirmation — from the stage classifier's assessment (computed above) ──
  // The single classifier call already produced a per-signal assessment + a fire
  // recommendation for this prompt; combine it with the deterministic trigger. A
  // degraded classifier never recommends firing, so a model outage cleanly yields no
  // advisory (the stage still classifies locally, so session tracking continues).
  writeTelemetry(input.projectRoot, 'classifier_fire_evaluated', { flagType: triggerResult.kind, confirmed: stageResult.fireRecommendation }, store);
  if (!stageResult.fireRecommendation) {
    // F4: the classifier declined to recommend firing
    await prepareSequenceShapedPeFallback('too_weak_no_popup');
    writeTelemetry(input.projectRoot, 'pipeline_no_action', { reason: 'classifier_declined' }, store);
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'classifier_declined', confidence: stageResult.classification.confidence, degraded: stageResult.degraded });
    return { outcome: 'no_action' };
  }

  // ── 7.5. Feed the classifier's signal assessments back into signal counters ──
  mgr.applyStage2SignalUpdates(store, stageResult.signalsPresent);

  // ── 8. Compute effective flagType from the classifier's selection, then mark fired ─
  // For an absence trigger, use the classifier's selected signal when it is one of the
  // qualifying flags; else fall back to the first qualifying flag (deterministic).
  let effectiveFlagType: FlagType;
  // Phase 2: the occurrence the selected flag belongs to — undefined for a stage transition, which
  // keeps today's whole-session dedup. Held alongside the flag type so the dedup form of `firedKey`
  // can be built without re-deriving which flag the classifier picked.
  let selectedRaisedAtIndex: number | undefined;
  if (triggerResult.kind === 'stage_transition') {
    effectiveFlagType = 'stage_transition';
  } else {
    const qualifyingKeys = new Set(triggerResult.qualifyingFlags.map((f) => f.signalKey));
    // Read the ranked pick (synchronous — whatever settled beside the classifier), validate it against the
    // REAL queue, and only then let it replace today's file-order fallback. Tier 1 is untouched.
    const rankedKey = queueRank.read();
    queueRank.abort();
    const rankedUsable = rankedKey !== undefined && qualifyingKeys.has(rankedKey);
    // The tier-3 fallback is no longer file order. Order the queue by FEWEST expected stages
    // (the more specific signal), then by the SMALLEST wait number; both are existing SignalDefinition fields,
    // so no signal is ranked by hand. Ties keep file order — Array#sort is stable — so this is a strict
    // refinement of today's behaviour, never a reshuffle of equals.
    const fallbackRank = (k: string): [number, number] => {
      const s = RANK_SIGNAL_MAP.get(k) as { expectedStages?: readonly string[]; absenceThreshold?: number } | undefined;
      return [s?.expectedStages?.length ?? Number.MAX_SAFE_INTEGER, s?.absenceThreshold ?? Number.MAX_SAFE_INTEGER];
    };
    const fallbackOrdered = [...triggerResult.qualifyingFlags].sort((a, b) => {
      const ra = fallbackRank(a.signalKey); const rb = fallbackRank(b.signalKey);
      return (ra[0] - rb[0]) || (ra[1] - rb[1]);
    });
    const fallbackKey = fallbackOrdered[0]!.signalKey;
    const selectedKey = qualifyingKeys.has(stageResult.selectedSignalKey)
      ? stageResult.selectedSignalKey
      : (rankedUsable ? rankedKey : fallbackKey);
    logger.info('absence_fallback_rank', { promptCount: mgr.current.promptCount, fileOrderFirst: triggerResult.qualifyingFlags[0]!.signalKey, rubricFirst: fallbackKey, changed: triggerResult.qualifyingFlags[0]!.signalKey !== fallbackKey, queueSize: triggerResult.qualifyingFlags.length });
    logger.info('queue_rank_pick', { promptCount: mgr.current.promptCount, offered: rankCandidateKeys.length, outcome: queueRank.outcome(), ranked: rankedKey ?? null, rankedInQueue: rankedUsable, classifierInQueue: qualifyingKeys.has(stageResult.selectedSignalKey), used: selectedKey, tier: qualifyingKeys.has(stageResult.selectedSignalKey) ? 1 : (rankedUsable ? 2 : 3) });
    effectiveFlagType = `absence:${selectedKey}`;
    // Same list the gate used, for the same reason — by now 6.8 has persisted the fresh raises, so
    // the duplicates this introduces are absorbed rather than counted twice.
    selectedRaisedAtIndex = absenceOccurrenceIndexV1(occurrenceFlags, selectedKey, mgr.current.promptCount)
      ?? (triggerResult.qualifyingFlags.find((f) => f.signalKey === selectedKey)
        ?? triggerResult.qualifyingFlags[0]!).raisedAtIndex;
  }
  const firedKey = buildFiredKey(effectiveFlagType, prevStage, mgr.current.currentStage);
  // Phase 2: the dedup-list form of `firedKey`. `firedKey` itself stays byte-identical — it is read by
  // the PE request, the router, the guidance facts and the popup body — so the suffix is added only
  // here, for the list the gate above reads.
  const firedDedupKey = selectedRaisedAtIndex === undefined
    ? firedKey
    : `${firedKey}#${selectedRaisedAtIndex}`;
  // ── 8.1. typed PE preparation seam ────────────────────────────────────
  // Build and consume the approved PE packet by default. An injected integration
  // remains available for boundary tests, while the default path now exercises
  // the executable owner-spec facade without changing legacy DS or delivery authority.
  // A3 step 7: mine-and-cache before the request is built, so freshly mined values are in the
  // store when the boundary reads them. One-shot and threshold-gated; see the closure above.
  // Phase 1 (prepare-time cooldown): while the popup cooldown is active, a popup prepared now
  // cannot be displayed — the Stop hook would consume it unseen. Skipping the preparation saves
  // that composer call, and because the budget is charged on show the signal stays eligible to
  // return once the window has passed. Legacy DS bookkeeping below is untouched.
  const pePopupCooldownActive = freqConfig.countBudgetOnShow
    && isPromptEnhancementPopupCooldownActiveV1(
      mgr.current.lastPromptEnhancementPromptIndex ?? -1,
      mgr.current.promptCount,
      resolvePromptEnhancementPopupCooldownV1(store, input.projectRoot),
    );
  let preparation: AutoPromptEnhancementPreparationResult | undefined;
  if (!pePopupCooldownActive) {
    await ensurePromptFactsFresh();
    const peIntegration = promptEnhancement ?? {
      request: buildPromptEnhancementRequestForAuto({
        auto: input,
        store,
        session: mgr,
        project,
        effectiveLanguage: effectiveLang,
        configuredRole,
        effectiveFlagType,
        firedKey,
        previousStage: prevStage,
        trigger: triggerResult,
        stageResult,
        // F4: this path is reached only after frequency, dedup, cooldown, cap and the
        // classifier fire-recommendation have ALL passed — so the trigger is cleanly eligible,
        // UNLESS the user already dismissed this very signal. `dismissedAtIndex` is set on the
        // absence flag when the user acts on it, and L4991 names dismissal as a state that must
        // not anchor a popup — so the one locked value that had no producer now has one, read
        // from session state rather than inferred.
        triggerEligibility: promptEnhancementFiredTriggerEligibilityV1(mgr.current.absenceFlags, effectiveFlagType),
        streamBOutputs: streamBOverrides
          ? Object.entries(streamBOverrides)
            .filter(([, present]) => present)
            .map(([signal]) => `stream_b:${signal}`)
          : [],
      }),
      prepare: preparePromptEnhancementForRunAuto,
    };
    preparation = await preparePromptEnhancementForAuto(peIntegration);
    await peIntegration.onResult?.(preparation);
    logger.debug('prompt_enhancement_prepare_boundary', {
      disposition: preparation.disposition,
      safeFallback: preparation.safeFallback,
      reasonCode: 'reasonCode' in preparation ? preparation.reasonCode : undefined,
      // Diagnosability (2026-08-06): a bare invalid_result was undebuggable from the log — record
      // WHICH validation checks failed so a live boundary rejection names its exact cause.
      validationReasonCodes: 'validationReasonCodes' in preparation && preparation.validationReasonCodes
        ? preparation.validationReasonCodes.slice(0, 10)
        : undefined,
      blockedFailureCodes: blockedFailureCodesForLog(preparation),
      // ⚠️ BOTH of these were on the sequence-shaped boundary log and NOT here — the MAIN path, which
      // is the common one. So the deterministic-popup suppression and the I1 ordering count were
      // observable only on the rarer route, which is the same one-of-two-sites shape the persistence
      // gate had. Kept identical to the other site on purpose: two logs of the same event that report
      // different fields cannot be read together.
      suppressedReason: promptEnhancementBodyHasNoLlmWordingV1(preparation.result)
        ? 'deterministic_only_no_llm_wording'
        : undefined,
      classifierDegraded: stageResult.degraded,
      relevanceOrderCount: stageResult.sectionRelevanceOrder.length,
      // Kept identical to the sequence-shaped site above on purpose: two logs of the same event that
      // report different fields cannot be read together.
      prunedSectionCount: preparation.result?.prunedSectionCount,
      floorSectionCount: preparation.result?.floorSectionCount,
    });
    // Owner decision B-i (2026-08-04): the PE popup is deferred to the Stop hook. Do NOT show a
    // popup on UserPromptSubmit — the prompt passes through raw. When a real (non-fallback) result
    // exists, persist it so the Stop hook can show the PE popup after Claude responds.
    // Phase 4 (defense-in-depth): but NOT an unshowable one — a `no_popup` display decision
    // (`no_popup_not_applicable` disposition or `no_popup` send policy) would spawn a window at Stop that
    // the child declines (the "blink"). Phase 1's launcher gate already blocks the spawn; skipping the row
    // here removes it at the source. Same condition the UI boundary uses; the skip stays traceable via the
    // `prompt_enhancement_prepare_boundary` log above (no `..._stored` log follows).
    const displayDecisionIsNoPopup = preparation.result?.disposition === 'no_popup_not_applicable'
      || preparation.result?.uiView.body.sendPolicy === 'no_popup'
      // Owner ruling (a): a body with no LLM wording is boilerplate, and boilerplate does not
      // earn a popup. Same row, same gate as the blink fix above.
      || promptEnhancementBodyHasNoLlmWordingV1(preparation.result);
    if (!preparation.safeFallback && preparation.result && !displayDecisionIsNoPopup) {
      upsertPendingPromptEnhancement(store, {
        projectRoot: input.projectRoot,
        sessionId:   mgr.current.sessionId,
        promptCount: mgr.current.promptCount,
        request:     peIntegration.request,
        result:      preparation.result,
        // P1b-ii: carry the planner item list + whole-prompt directive ranges (set by the closure
        // during this prepare) so the Stop-hook batch can word items 2…N. Undefined on non-sequence
        // prepares → NULL columns.
        plannerItems: capturedPlannerItems,
        plannerPromptDirectives: capturedPlannerPromptDirectives,
        // Display only: the popup may draw these louder, and the agent never sees the difference.
        emphasisPhrases: emphasisPhrasesForPreparedBodyV1(preparation.result, peIntegration.request),
      });
      const handoffPresent = Boolean(preparation.result.uiView.handoffAndSequenceSummary);
      logger.debug('pending_prompt_enhancement_stored', {
        projectRoot: input.projectRoot,
        sessionId:   mgr.current.sessionId,
        promptCount: mgr.current.promptCount,
        disposition: preparation.disposition,
        // Diagnosability: whether this stored row can ever open the MPS popup.
        handoffPresent,
      });
      // A sequence-shaped prompt that stored WITHOUT a summary is the exact anomaly that was
      // previously untraceable — name the reason (deterministic re-explain) in the log.
      if (!handoffPresent && isPromptEnhancementSequenceShapedTextV1(input.promptText)) {
        logger.warn('sequence_summary_absent', {
          projectRoot: input.projectRoot,
          reasonCodes: explainPromptEnhancementSequenceSummaryAbsenceV1(peIntegration.request, preparation.result).slice(0, 8),
        });
      }
      // E9 (P12-G1/G2): measure cost off the result's REAL call-visibility (mode + planned/used
      // counts come from the composer, not the hardcoded request placeholder), and run the the provider-failure contract
      // "cost never weakens behavior" check. Observability-only — this never gates the popup. The
      // E8 popup-action calls are measured at their own surface via the popup costObservabilitySink.
      emitPromptEnhancementCostObservabilityV1(preparation.result, 'prepare', logger);
      // Phase 1: remember what this row would cost if it is ever SHOWN. Both keys travel, because the
      // dedup gate checks the first qualifying flag's key while the row carries the key of the flag
      // Stage 2 selected — charging only the second would leave the first uncharged for ever, and an
      // uncharged key never blocks. Bound to THIS row's prompt index: a row that is replaced or
      // dropped unseen must not leave its keys behind for the next popup to spend.
      //
      // Phase 2: both travel in their DEDUP form. Under `countBudgetOnShow` this list is what the gate
      // above reads, so charging the unsuffixed keys would mean the occurrence key it checks is never
      // present — and absence dedup would stop blocking altogether, which is far more than this phase
      // intends. `firedKey` on the stored row itself is untouched.
      if (freqConfig.countBudgetOnShow) {
        mgr.markPendingPopupChargeV1(store, mgr.current.promptCount, [dedupKey, firedDedupKey]);
      }
    }
  }

  // keeps legacy Decision Session bookkeeping after preparation; PE preparation
  // remains capture/classification-only and cannot gain DS authority.
  // Phase 2: the list records the occurrence, matching what the gate above checks. It still grows once
  // per fire, so `once_per_session` (which only reads its length) is unchanged.
  mgr.markDecisionSessionFired(store, firedDedupKey);

  // ── 8.5. Read user profile (computed in processPrompt, null if < 5 prompts) ──
  const userProfile = mgr.current.profile ?? undefined;

  // ── 9. Pinch label — option gen runs in stop hook after Claude responds ──────
  // Seed the pinch header (+ its failure fallback) from the register-keyed pinch-fields map — the
  // migrated question/pinchFallback layer that supersedes the static DecisionContent for every signal.
  const pinchSignalType = pinchSignalTypeForFlag(effectiveFlagType, mgr.current.currentStage);
  const pinchOverrides = pinchSignalType
    ? resolvePinchFields(pinchSignalType, selectionRegister(userProfile?.nature))
    : undefined;
  const pinchLabel = await generatePinchLabel(
    mgr.current.currentStage,
    effectiveFlagType,
    openai,
    userProfile,
    effectiveLang,
    pinchOverrides,
  );

  // ── 10. Store pending advisory — Stop hook will show UI after Claude responds
  upsertPendingAdvisory(store, {
    projectRoot: input.projectRoot,
    stage:       mgr.current.currentStage,
    flagType:    effectiveFlagType,
    pinchLabel,
    sessionId:   mgr.current.sessionId,
    promptCount: mgr.current.promptCount,
    prevStage,
  });
  logger.debug('pending_advisory_stored', {
    projectRoot: input.projectRoot,
    sessionId: mgr.current.sessionId,
    promptCount: mgr.current.promptCount,
    flagType: effectiveFlagType,
    // Phase 1: `undefined` when the popup cooldown made a preparation pointless this turn.
    peDisposition: preparation?.disposition,
  });
  writeTelemetry(input.projectRoot, 'pipeline_advisory_pending', {
    flagType:                      effectiveFlagType,
    stage:                         mgr.current.currentStage,
    pinchLabel,
    // Item H — session-scoped advisory counter (from session state).
    advisoryCountInSession:        mgr.current.advisoryCount ?? 0,
    // Item J — project-scoped decision-session counter (from projects table).
    decisionSessionCountInProject: getProject(store, input.projectRoot)?.decisionSessionCount ?? 0,
    // Item B — last-5 prompt metadata, PII-safe (no text).
    recentPrompts:                 recentPromptMetadata(mgr.current.promptHistory),
  }, store);
  mgr.markAdvisoryFired(store);

  logger.info('pipeline_outcome', { outcome: 'pending', pinchLabel });
  return { outcome: 'pending' };
}

// ── CLI entry point ────────────────────────────────────────────────────────────

/**
 * Read all data from stdin (non-TTY).  Returns '' if stdin is a TTY or empty.
 * Used in hook mode to receive the Claude Code JSON payload.
 */
export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
    process.stdin.on('error', () => resolve(''));
    // Safety timeout — stdin closes in <100ms in normal hook operation.
    // If it never closes (misbehaving environment), fail fast after 5 s.
    setTimeout(() => resolve(data.trim()), 5000);
  });
}

/**
 * Register `nexpath auto` with the given Commander program.
 *
 * Usage:
 *   nexpath auto --project /path/to/project "The latest prompt text"
 *
 * Hook mode (Claude Code UserPromptSubmit):
 *   The command reads the prompt from the JSON payload on stdin when no
 *   positional argument is provided.  The project root defaults to CWD,
 *   which Claude Code sets to the project directory for hooks.
 *
 *   When a prompt is selected in hook mode the output is a JSON object
 *   using the Claude Code `additionalContext` format so the guidance is
 *   injected into the conversation automatically.
 *
 * If skipped or no action: exits silently.
 */
export function registerAutoCommand(program: import('commander').Command): void {
  program
    .command('auto')
    .description('Run the nexpath advisory pipeline between agent responses')
    .option('-p, --project <path>', 'Project root path', process.cwd())
    .option('--db <path>', 'Database path', DEFAULT_DB_PATH)
    .argument('[prompt]', 'The latest prompt text (omit to read from stdin in hook mode)')
    .action(async (promptArg: string | undefined, opts: { project: string; db: string }) => {
      let promptText = promptArg?.trim();
      let currentAgentMode: string | undefined;
      let transcriptPath: string | undefined;

      if (!promptText) {
        // Hook mode: read JSON payload from stdin (Claude Code UserPromptSubmit)
        const raw = await readStdin();
        if (raw) {
          const parsed = parseAutoHookPayload(raw);
          promptText       = parsed.promptText;
          currentAgentMode = parsed.currentAgentMode;
          transcriptPath   = parsed.transcriptPath;
        }
      }

      if (!promptText) {
        process.stderr.write('nexpath auto: prompt text is required\n');
        process.exit(1);
      }

      // Resolve OPENAI_API_KEY through the 4-layer chain (env → project .env →
      // OS keychain → 0600 fallback file). The resolver promotes the first
      // valid hit into process.env so downstream OpenAI() constructors pick it
      // up transparently. Order shift from the prior dotenv-with-override
      // behaviour: a pre-set env var now WINS over project .env.
      await resolveOpenAIKey(opts.project);

      const store = await openStore(opts.db);
      // Initialise logger — level from config key, then NEXPATH_LOG_LEVEL env var
      const logLevel = getConfig(store.db, 'log_level') as LogLevel | undefined;
      initLogger('auto', logLevel);

      // Diagnostic: log the source layer that produced the key so a missing
      // key (now a classifier degrade to local detection) can be traced to the fallback chain.
      const keySource = await getKeySource(opts.project);
      const keyFound  = !!process.env['OPENAI_API_KEY'];
      logger.debug('env_load', {
        cwd:       process.cwd(),
        project:   opts.project,
        keySource,
        keyFound,
      });

      // Surface a single visible warn line when no source produced a key. We do
      // NOT exit here — the pipeline still runs: prompt capture and the blocking
      // gates need no key, and the stage classifier degrades to the local
      // keyword/TF-IDF classifier when the key is missing (no advisory fires).
      if (!keyFound) {
        logger.warn('openai_api_key_missing', {
          project:    opts.project,
          actionable: 'Set OPENAI_API_KEY in the shell, in the project\'s .env file, or via the OS keychain — the classifier falls back to local stage detection (no advisories) until a key is configured.',
        });
      }

      try {
        // Owner decision B-i (2026-08-04): the PE popup is deferred to the Stop hook, so the
        // UserPromptSubmit hook never shows a popup and never emits a hook output — the prompt
        // always passes through raw. runAuto prepares + persists the pending PE; the Stop hook
        // (`nexpath stop`) reads it, shows the popup, and injects the enhanced prompt as a new turn.
        const result = await runAuto(
          { promptText, projectRoot: opts.project, currentAgentMode, transcriptPath },
          store,
        );

        writeHookStats(opts.project, result.outcome);
        void triggerOpportunisticSync(store).catch(() => {});
        // No popup on UserPromptSubmit → always normal original-prompt pass-through.
      } finally {
        closeStore(store);
      }
    });
}

/**
 * Record that the popup's Source-A signals were shown (E3/3.2b, fix-plan §4b):
 * neutral candidate evidence per rendered Source-A signal so the "shown" count
 * accumulates cross-session. The signal keys come from re-running the E2 pipeline
 * on the request (Path A). Safety-critical signals are protected so they survive
 * fatigue. Best-effort — a memory-write failure must never block the popup.
 */
export function recordPromptEnhancementShownMemoryV1(
  store: Store,
  projectRoot: string,
  request: PromptEnhancementPrepareRequestV1,
  now: number = Date.now(),
): void {
  try {
    for (const signal of resolvePromptEnhancementGuidanceOutcomeV1(request).renderedSourceASignals) {
      recordPromptEnhancementMemoryEvidence(store, {
        projectRoot,
        signalKey: signal.signalKey,
        evidenceKind: 'neutral',
        currentEvidenceState: 'live_current',
        confidenceBand: 'medium',
        sourceStrength: 'moderate',
        protectionState:
          signal.riskLevel === 'high' || signal.riskLevel === 'sensitive_authority_risky'
            ? 'high_risk_protected'
            : undefined,
        status: 'candidate',
        now,
      });
    }
  } catch { /* memory record is best-effort; never block the popup */ }
}

/**
 * Mark the popup's Source-A signals as used (E3/3.2b, fix-plan §4b "markUsed on
 * use") when the enhanced body is kept/injected. Signal keys come from re-running
 * the E2 pipeline (Path A); the memory rows already exist from the show recording.
 * Best-effort — a memory-write failure must never block delivery.
 */
export function markPromptEnhancementUsedMemoryV1(
  store: Store,
  projectRoot: string,
  request: PromptEnhancementPrepareRequestV1,
  now: number = Date.now(),
): void {
  try {
    for (const signal of resolvePromptEnhancementGuidanceOutcomeV1(request).renderedSourceASignals) {
      markPromptEnhancementMemoryUsed(store, projectRoot, signal.signalKey, now);
    }
  } catch { /* memory record is best-effort; never block delivery */ }
}

/**
 * D1 (P9-G1 / resolves P9-G2): wire the live Stop injection through the typed Stop-bridge delivery
 * contract. `preparePromptEnhancementStopBridgeDelivery` records **source-use before transport** and
 * writes the **generated-origin** metadata (`learningEligible:false`, `raw_text_excluded`) — the
 * audit/lineage tables (`prompt_enhancement_source_use` / `prompt_enhancement_generated_origin`) that
 * the ad-hoc block+inject path never wrote live. The kept enhanced body is a `send_current` delivery
 * on the `cli_stop_bridge` channel; raw text is never the transport authority. Returns the typed
 * result for the caller to log (the actual injected carrier text is unchanged — 4d).
 */
export function recordPromptEnhancementStopBridgeDeliveryV1(
  store: Store,
  pending: PendingPromptEnhancement,
): PromptEnhancementDeliveryResultV1 {
  const body = pending.result.currentBody;
  const request: PromptEnhancementDeliveryRequestV1 = {
    deliveryAttemptId: `pe-delivery:${pending.result.enhancementId}:${pending.id}`,
    projectRoot: pending.projectRoot,
    enhancementId: pending.result.enhancementId,
    currentBody: body,
    actionId: `${body.currentBodyId}:send_current`,
    sendPolicy: 'send_current',
    deliveryChannel: 'cli_stop_bridge',
  };
  return preparePromptEnhancementStopBridgeDelivery(store, request);
}

export function recordPromptEnhancementCliFeedbackV1(
  store: Store,
  projectRoot: string,
  event: PromptEnhancementPopupEventV1,
  request?: PromptEnhancementPrepareRequestV1,
) {
  // With the prepare request, derive the real feedback->memory eligibility policy
  // (E3/3.2a): the memory signal key + safety come from re-running the E2 pipeline
  // (Path A). Without it, fall back to the inert placeholder (no memory learning).
  const policy = request
    ? derivePromptEnhancementFeedbackPolicyV1(event, request, projectRoot)
    : {
        projectRoot,
        feedbackScopeKey: event.currentBodyId,
        learningEligibility: 'pending_policy' as const,
        safetyImpactState: 'unknown' as const,
        memoryEvidence: false,
      };
  const acknowledgement = recordPromptEnhancementFeedbackV1({ store, event, policy });
  return {
    stableEventIdentity: acknowledgement.stableEventIdentity,
    status: acknowledgement.status,
    publicSafeText: acknowledgement.status === 'accepted'
      ? 'Feedback saved. Your prompt is unchanged.'
      : acknowledgement.status === 'rejected'
        ? 'Feedback was not saved. Your prompt is unchanged.'
        : 'Feedback is unavailable right now. Your prompt is unchanged.',
  };
}
