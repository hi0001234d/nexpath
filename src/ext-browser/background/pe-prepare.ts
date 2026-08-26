/**
 * Browser-side PE preparation — the service worker's mirror of
 * `cli/commands/auto.ts`'s typed PE seam (`buildPromptEnhancementRequestForAuto`
 * + `preparePromptEnhancementForAuto`), adapted to what the extension honestly
 * has:
 *
 *  - `hostSurface: 'extension_bridge'` (the contract's extension host value);
 *  - the source-reality snapshot comes from the ENGINE'S OWN store-less path
 *    (`getSourceRealityAdaptersSnapshot` with no `store`), which resolves
 *    content-template records from the SHIPPED in-code set — real records, no
 *    sql.js — with the store facts overridden to declare every PE table
 *    MISSING (the browser's data layer is storage.local/IDB, not the CLI DB);
 *  - grounding lanes the browser has no producer for cross EMPTY — the engine
 *    treats empty lanes as "no grounding available" by design;
 *  - the boundary wrapper reduces ANY failure (invalid request, invalid
 *    result, facade throw) to a safe no-popup fallback — PE can never break
 *    the submit pipeline (fail-open rule).
 *
 * The prepared result is parked in the pending-PE store WITHOUT showing
 * anything (owner decision B-i); the response-stop handler renders it. A
 * `no_popup` display decision is never stored (the CLI's "blink" defense —
 * auto.ts Phase 4).
 */

import { selectionRegister } from '../../decision-session/selection-registry.js';
import type {
  PromptEnhancementDisposition,
  PromptEnhancementPrepareRequestV1,
  PromptEnhancementPrepareResultV1,
  PromptEnhancementSourceRefV1,
} from '../../prompt-enhancement/contracts.js';
import type { LogPort } from '../../core/ports/log.port.js';
import type { UserProfile } from '../../core/classifier/types.js';
import type { Stage } from '../../core/classifier/types.js';
import {
  PROMPT_ENHANCEMENT_CONTRACT_VERSION,
  buildPromptEnhancementCostVisibilityMetadataV1,
  emitPromptEnhancementCostObservabilityV1,
  getSourceRealityAdaptersSnapshot,
  preparePromptEnhancement,
  promptEnhancementAbsenceSignalKeyV1,
  promptEnhancementStageSignalKeyV1,
  refreshEngineKeyEnv,
  validatePromptEnhancementPrepareRequestV1,
  validatePromptEnhancementPrepareResultV1,
} from './pe-engine.js';
import type { upsertPendingPe } from '../adapters/pe-pending-store.js';

/**
 * The pending-store writer is INJECTED (type-only import above) so this module
 * stays pure engine-side logic: the polyfill-backed adapter would refuse to
 * load outside a real extension context, and the request builder + boundary
 * must stay runnable under Node (tests, validator harness).
 */
export type PendingPeUpserter = typeof upsertPendingPe;

/** Everything the SW pipeline knows at the moment a PE should be prepared. */
export interface BrowserPeContext {
  projectRoot: string;
  promptText: string;
  sessionId: string;
  /** Session promptCount AFTER this prompt was processed (CLI parity: index = count - 1). */
  promptCount: number;
  currentStage: Stage;
  prevStage: Stage | undefined;
  triggerKind: 'stage_transition' | 'absence';
  /** 'stage_transition' or `absence:<signal>` — the EFFECTIVE fired source. */
  effectiveFlagType: string;
  firedKey: string;
  /** The local classification confidence for this prompt (drives the trigger ref's confidence band). */
  triggerConfidence: number;
  /**
   * 'fire_recommended' on the real fire path (the browser's Stage-2 verdict was
   * fire:true); 'not_applicable' on the sequence-shaped fallback path, where no
   * fire decision backs the prepare (the browser has no intent classifier — the
   * optional classifier* provenance fields are omitted entirely).
   */
  classifierState: 'fire_recommended' | 'not_applicable';
  profile: UserProfile | null;
  configuredRole: string | null;
  detectedLanguage: string | undefined;
  streamBOutputs: readonly string[];
  triggerEligibility:
    | 'fresh_trigger_eligible'
    | 'dismissed_or_user_skipped'
    | 'support_only_not_triggering'
    | 'blocked_by_dedup'
    | 'blocked_by_frequency'
    | 'blocked_by_post_advisory_cooldown'
    | 'blocked_by_session_cap'
    | 'too_weak_no_popup';
  /** `prompt:<index>` refs for the session's recent prompt metadata. */
  recentPromptRefs: readonly string[];
}

/** Mirror of auto.ts's `buildPromptEnhancementRequestForAuto`, browser inputs. */
export function buildBrowserPeRequest(ctx: BrowserPeContext): PromptEnhancementPrepareRequestV1 {
  const promptIndex = ctx.promptCount - 1;
  const register = selectionRegister(ctx.profile?.nature);
  // The engine's own store-less snapshot: shipped content-template records, the
  // static prompt-start/stop facts, and store facts we then override honestly.
  const source = getSourceRealityAdaptersSnapshot({
    flagType: ctx.effectiveFlagType,
    stage: ctx.currentStage,
    projectRoot: ctx.projectRoot,
    register,
    role: ctx.configuredRole ?? undefined,
    level: 1,
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
    sourceRefId: `trigger:${ctx.effectiveFlagType}`,
    sourceKind: 'stage_or_absence_signal',
    sourceId: ctx.effectiveFlagType,
    sourceAuthorization: 'source_fact_only',
    evidenceStatus: 'present',
    freshness: 'current',
    confidence: ctx.triggerConfidence >= 0.8 ? 'high' : ctx.triggerConfidence >= 0.5 ? 'medium' : 'low',
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
  const absenceSignal = ctx.triggerKind === 'absence'
    ? ctx.effectiveFlagType.replace(/^absence:/, '')
    : undefined;

  return {
    schemaVersion: PROMPT_ENHANCEMENT_CONTRACT_VERSION,
    requestId: `pe:ext:${ctx.sessionId}:${promptIndex}:${ctx.effectiveFlagType}`,
    projectRoot: ctx.projectRoot,
    hostSurface: 'extension_bridge',
    sourcePrompt: {
      text: ctx.promptText,
      origin: 'user',
      capturedAt: Date.now(),
      promptIndex,
      generatedOriginPolicy: 'ordinary_source_a',
    },
    reviewMomentContext: {
      reviewMoment: 'UserPromptSubmit_preparation',
      // The browser has no agent permission-mode signal (the hosts are web apps).
      currentAgentMode: 'unknown',
      projectId: ctx.projectRoot,
      sessionId: ctx.sessionId,
      detectedLanguage: ctx.detectedLanguage ?? 'unknown',
      stageCandidate: ctx.currentStage,
      promptCount: ctx.promptCount,
      recentPromptMetadataRefs: ctx.recentPromptRefs,
      triggerProvenance: {
        currentStage: ctx.currentStage,
        prevStage: ctx.prevStage,
        triggerKind: ctx.triggerKind,
        firedKey: ctx.firedKey,
        effectiveFiredSource: ctx.effectiveFlagType,
        selectedQualifyingAbsence: absenceSignal,
        absenceGateReason: absenceSignal ? 'qualifying_absence_signal' : undefined,
        classifierState: ctx.classifierState,
        degradedNoActionState: 'none',
        // classifierPrimaryIntent / intent confidence / capability + project-fact
        // candidates are OMITTED (optional): the browser pipeline has no intent
        // classifier — the router's keyword/deterministic cascade decides alone.
        promptStartBoundary: source.promptStartStop.hookBoundary,
        deliveryBoundary: source.promptStartStop.deliveryBoundary,
        promptStartCanReplaceSameTurn: source.promptStartStop.runAutoCanHoldOrReplaceSubmittedPrompt,
        promptId: sourceId,
        sessionId: ctx.sessionId,
        promptIndex,
      },
    },
    sourceSignals: {
      sourceAOriginalPromptRef: originalPromptRef,
      sourceRefs: [originalPromptRef, triggerRef, ...(contentRef ? [contentRef] : [])],
      triggerSignalEligibilityState: ctx.triggerEligibility,
      normalizedStageAbsenceSignalRefs: absenceSignal ? [absenceSignal] : [],
      contentTemplateRecordFactRefs: content.resolvedRecordIdentity ? [content.resolvedRecordIdentity] : [],
      popupQuestionSourceRefs: content.resolvedRecordIdentity ? [`${content.resolvedRecordIdentity}:question`] : [],
      whyHelpSourceRefs: content.resolvedRecordIdentity ? [`${content.resolvedRecordIdentity}:why-help`] : [],
      profileRoleModeRefs: ctx.configuredRole ? [`role:${ctx.configuredRole}`] : [],
      // Grounding lanes with no browser producer yet cross EMPTY (engine-supported
      // absence): RIGHT&GOOD / work-style / env facts / prompt-mined facts /
      // missing-signal memory / scoped feedback all live in CLI-side stores.
      rightGoodWorkStyleEnvRuntimeRefs: [],
      missingMemoryCandidateRefs: [],
      sourceLabels: [
        { sourceRefId: originalPromptRef.sourceRefId, label: 'original_prompt', evidenceStatus: 'present' },
        { sourceRefId: triggerRef.sourceRefId, label: 'stage_absence_signal', evidenceStatus: 'present' },
        ...(contentRef
          ? [{ sourceRefId: contentRef.sourceRefId, label: 'content_template_fact' as const, evidenceStatus: 'present' as const }]
          : []),
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
        // HONEST OVERRIDE: the store-less snapshot presumes the CLI tables exist;
        // the browser has NONE of them. Declaring the engine's own PE-owned table
        // list as missing keeps every downstream "is this table available" branch
        // truthful without duplicating the list here.
        missingPromptEnhancementTables: source.store.promptEnhancementOwnedTables,
        cleanupGaps: source.store.cleanupGaps,
      },
      historicalBootstrap: source.historicalBootstrap,
      launchBoundary: source.launchBoundary,
      permissionMode: 'unknown',
      transcriptPathState: 'not_authority',
      streamBOutputs: ctx.streamBOutputs,
      paramEventChannels: [],
      servedVariantIdentityRefs: [],
      deliveryGateRefs: [],
      sourceOnlyHardFactRefs: [],
      groundingTierByRef: {},
      groundingPolarityByRef: {},
      groundingEvidenceByRef: {},
    },
    userPreferenceContext: {
      levelState: 'default',
      scopedFeedbackEvidenceRefs: [],
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

/** Canonical memory keys for the trigger — mirrors auto.ts's groundingSignalKeys. */
export function browserPeGroundingSignalKeys(ctx: BrowserPeContext): readonly string[] {
  const absenceSignal = ctx.triggerKind === 'absence'
    ? ctx.effectiveFlagType.replace(/^absence:/, '')
    : undefined;
  return [
    ...(ctx.triggerKind === 'stage_transition'
      ? [promptEnhancementStageSignalKeyV1(ctx.prevStage, ctx.currentStage)]
      : []),
    ...(absenceSignal ? [promptEnhancementAbsenceSignalKeyV1(absenceSignal)] : []),
  ];
}

export type BrowserPePreparation =
  | { disposition: PromptEnhancementDisposition; result: PromptEnhancementPrepareResultV1; safeFallback: false }
  | {
      disposition: 'no_popup_not_applicable';
      result?: undefined;
      safeFallback: true;
      reasonCode: 'invalid_request' | 'invalid_result' | 'facade_error';
      validationReasonCodes?: readonly string[];
    };

/**
 * Boundary wrapper — the SW's mirror of `preparePromptEnhancementForAuto`
 * (auto.ts): validate the request, run the facade, validate the result, and
 * reduce every failure to a safe no-popup fallback. Never throws.
 */
export async function prepareBrowserPe(request: PromptEnhancementPrepareRequestV1): Promise<BrowserPePreparation> {
  const requestValidation = validatePromptEnhancementPrepareRequestV1(request);
  if (!requestValidation.ok) {
    return {
      disposition: 'no_popup_not_applicable',
      safeFallback: true,
      reasonCode: 'invalid_request',
      validationReasonCodes: requestValidation.reasonCodes,
    };
  }
  try {
    const result = await preparePromptEnhancement(request);
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
    return { disposition: 'no_popup_not_applicable', safeFallback: true, reasonCode: 'facade_error' };
  }
}

/**
 * Prepare + park a pending PE for the project. Runs the engine with the user's
 * key in the env slot (LLM route/compose through the fetch-backed stub client;
 * keyless prepares take the engine's own deterministic path), then persists —
 * UNLESS the display decision is no_popup, which is never stored (blink
 * defense). Every path logs a `pe_prepare_boundary` line; a stored row logs
 * `pe_pending_stored`. Fail-open by construction: any internal failure leaves
 * the pipeline exactly as it was.
 */
export async function prepareAndStoreBrowserPe(
  log: LogPort,
  apiKey: string | null,
  ctx: BrowserPeContext,
  upsertPendingPe: PendingPeUpserter,
): Promise<BrowserPePreparation> {
  refreshEngineKeyEnv(apiKey);
  const request = buildBrowserPeRequest(ctx);
  const preparation = await prepareBrowserPe(request);
  log.debug('pe_prepare_boundary', {
    disposition: preparation.disposition,
    safeFallback: preparation.safeFallback,
    reasonCode: 'reasonCode' in preparation ? preparation.reasonCode : undefined,
    validationReasonCodes:
      'validationReasonCodes' in preparation && preparation.validationReasonCodes
        ? preparation.validationReasonCodes.slice(0, 10)
        : undefined,
    eligibility: ctx.triggerEligibility,
  });
  if (preparation.safeFallback || !preparation.result) return preparation;
  emitPromptEnhancementCostObservabilityV1(preparation.result, 'prepare', log as never);
  const displayDecisionIsNoPopup = preparation.result.disposition === 'no_popup_not_applicable'
    || preparation.result.uiView.body.sendPolicy === 'no_popup';
  if (displayDecisionIsNoPopup) {
    log.debug('pe_prepare_skipped_no_popup', { disposition: preparation.result.disposition });
    return preparation;
  }
  try {
    await upsertPendingPe(ctx.projectRoot, {
      sessionId: ctx.sessionId,
      promptCount: ctx.promptCount,
      request,
      result: preparation.result,
    });
    log.debug('pe_pending_stored', {
      projectRoot: ctx.projectRoot,
      promptCount: ctx.promptCount,
      disposition: preparation.disposition,
      handoffPresent: Boolean(preparation.result.uiView.handoffAndSequenceSummary),
    });
  } catch (err) {
    // Storage failure must never break the submit pipeline (fail-open).
    log.debug('pe_pending_store_failed', { error: String(err) });
  }
  return preparation;
}
