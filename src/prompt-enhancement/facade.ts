import {
  PROMPT_ENHANCEMENT_CONTRACT_VERSION,
  validatePromptEnhancementPrepareRequestV1,
  type PromptEnhancementActionFacadeV1,
  type PromptEnhancementActionRequestV1,
  type PromptEnhancementCurrentBodyV1,
  type PromptEnhancementDeliveryMetadataV1,
  type PromptEnhancementGeneratedOriginMetadataV1,
  type PromptEnhancementPrepareFacadeV1,
  type PromptEnhancementPrepareRequestV1,
  type PromptEnhancementPrepareResultV1,
  type PromptEnhancementPublicDiagnosticV1,
  type PromptEnhancementPublicTrustCueV1,
  type PromptEnhancementSectionFeedbackViewV1,
  type PromptEnhancementUiViewPayloadV1,
  type PromptEnhancementValidationStatus,
  type PromptEnhancementWhyHelpV1,
} from './contracts.js';
import {
  composePromptEnhancementBody,
  type PromptEnhancementComposeResult,
  type PromptEnhancementComposerRuntimeState,
  type PromptEnhancementStructuredComposerOutputV1,
} from './compose-enhancement.js';
import { composeStructuredComposerOutputV1 } from './llm-composer.js';
import { decidePromptEnhancementRouteViaLlmV1, type PromptEnhancementLlmRouteDecisionV1 } from './llm-route-decision.js';
import { isValidApiKey } from '../config/ApiKeyResolver.js';
import { resolvePromptEnhancementSequenceConfig } from '../config/PromptEnhancementConfig.js';
import { planPromptEnhancementSections } from './templates/section-plan.js';
import { routePromptEnhancement, isKnownPrimaryIntent, isKnownCapabilityId, isKnownDebugEvidenceForm, describePromptEnhancementSequencePlanV1, type PromptEnhancementCapabilityId, type PromptEnhancementRouteInput } from './routing-taxonomy.js';
import { buildPromptEnhancementGuidanceFactsV1 } from './guidance-facts.js';
import { resolvePromptEnhancementSourceConflictsV1 } from './conflict-resolution.js';
import { applyPromptEnhancementSourceMixV1 } from './source-mix.js';
import { summarisePromptEnhancementRuntimeSeamsV1 } from './cost-measurement.js';
import { applyPromptEnhancementGuidanceGateV1 } from './guidance-gate.js';
import { buildPromptEnhancementPinchLabelV1, buildPromptEnhancementWhyHelpV1 } from './pe-header-copy.js';
import { buildPromptEnhancementHandoffMetadataV1, validatePromptEnhancementHandoffMetadataV1 } from './handoff-metadata.js';
import {
  validatePromptEnhancementSafety,
  type PromptEnhancementSafetyValidationResult,
} from './safety-sendability.js';
import {
  runPromptEnhancementSequencePlannerV1,
  type PromptEnhancementSequencePlannerClientV1,
} from './sequence-planner.js';
import type { PromptEnhancementSequenceItemV1, PromptEnhancementSequenceOffsetRangeV1 } from './sequence-payload.js';
import { promptEnhancementSequenceTaskSummaryLinesV1 } from './sequence-payload.js';
import { redactSecrets } from '../store/redact.js';
import type { Database } from 'sql.js';

/**
 * The single PE content-engine entry point.
 *
 * This is intentionally a small orchestration layer. Routing, section planning,
 * composition, and safety remain independently testable modules; application
 * code must call this facade rather than reaching into those modules directly.
 */
export const preparePromptEnhancement: PromptEnhancementPrepareFacadeV1 = async (request) => {
  assertPrepareRequest(request);
  return (await prepare(request)).result;
};

/**
 * MPS P1b-ii — the sequence entry's return: the prepare result plus, when the planner ran and produced
 * a sequence, its full item list (structure only, no wording — item 1's slice is the whole prompt). The
 * background wording batch (P2) consumes `plannerItems`; a non-sequence / fallback prepare leaves it
 * undefined. The base `preparePromptEnhancement` above is UNCHANGED — it returns just the result.
 */
export interface PreparePromptEnhancementWithSequenceResultV1 {
  result: PromptEnhancementPrepareResultV1;
  plannerItems?: readonly PromptEnhancementSequenceItemV1[];
  /**
   * MPS P1b-ii — the sequence's whole-prompt instructions, as OFFSET ranges into the original (one
   * copy per sequence, applied to every item). Carried alongside `plannerItems` because the background
   * wording batch resolves them to text for items 2…N; undefined whenever `plannerItems` is.
   */
  plannerPromptDirectives?: readonly PromptEnhancementSequenceOffsetRangeV1[];
}

/**
 * MPS P1b-i — the runtime dependencies the sequence planner (owner unit P1) needs and the pure
 * `(request) → result` facade deliberately does not carry: the store handle the config kill-switch +
 * planner resolve from, and an optional injected LLM client (tests inject a stub; production leaves it
 * unset so the planner constructs its own key-gated client, mirroring the composer).
 */
export interface PreparePromptEnhancementSequenceDepsV1 {
  db: Database;
  client?: PromptEnhancementSequencePlannerClientV1;
}

/**
 * MPS P1b-i — the db-accepting facade entry that lets the full sequence planner REPLACE the
 * display-only `describePromptEnhancementSequencePlanV1` as the source of truth for the compact
 * sequence summary's item count + role labels (owner unit P1, feeding the already-optional `summary`
 * seam of `buildPromptEnhancementHandoffMetadataV1` — no contract change).
 *
 * The planner runs ONLY on the `isSequenceCandidate` branch — exactly where the describe runs today —
 * so every non-sequence prompt (and every caller that uses the contract-typed `preparePromptEnhancement`
 * above, which passes no deps) takes the byte-identical current path. On ANY planner failure / refusal /
 * single-prompt outcome the summary falls back to the describe splitter, so the user always gets their
 * enhanced prompt. The `PromptEnhancementPrepareFacadeV1` contract type is UNCHANGED.
 */
export async function preparePromptEnhancementWithSequenceV1(
  request: PromptEnhancementPrepareRequestV1,
  seqDeps: PreparePromptEnhancementSequenceDepsV1,
): Promise<PreparePromptEnhancementWithSequenceResultV1> {
  assertPrepareRequest(request);
  return prepare(request, undefined, undefined, seqDeps);
}

/** Apply a bounded directional/details action against the current body contract. */
export const applyPromptEnhancementAction: PromptEnhancementActionFacadeV1 = async (request) => {
  assertPrepareRequest(request);
  const base = (await prepare(
    request,
    request.action.actionType === 'use_original' ? undefined : request.action.actionType,
    request,
  )).result;
  if (request.action.actionType === 'use_current_body') {
    const editedBodyText = request.currentBodyBinding.editedBodyText;
    const safety = validatePromptEnhancementSafety({
      currentBody: base.currentBody,
      editedBodyText,
      actionType: 'use_current_body',
      callVisibilityMode: base.callAndVisibilityMetadata.callVisibilityMode,
    });
    return rebuildWithEditedBodySafety(request, base, editedBodyText, safety);
  }
  if (request.action.actionType !== 'use_original') return base;

  const originalSafety = validatePromptEnhancementSafety({
    currentBody: base.currentBody,
    editedBodyText: request.currentBodyBinding.editedBodyText,
    actionType: 'use_original',
    callVisibilityMode: 'fallback_no_llm',
  });
  return rebuildWithSafety(base, originalSafety, 'fallback_to_original');
};

// E6: soft deterministic-route skips an LLM route decision may rescue (the keyword
// router gave up because the prompt has no explicit intent / is weak-ambiguous).
// Hard-guard skips (degraded classifier, old/generated origin, first-trigger gate) are
// deliberately excluded.
const LLM_ROUTE_RESCUABLE_SKIP_REASONS: ReadonlySet<string> = new Set([
  'source_b_only_cannot_open_popup',
  'ambiguous_weak_evidence_skip_no_popup',
]);

async function prepare(
  request: PromptEnhancementPrepareRequestV1,
  action?: PromptEnhancementActionRequestV1['action']['actionType'],
  actionRequest?: PromptEnhancementActionRequestV1,
  seqDeps?: PreparePromptEnhancementSequenceDepsV1,
): Promise<PreparePromptEnhancementWithSequenceResultV1> {
  const enhancementId = `pe:${request.requestId}`;
  const routeInput: PromptEnhancementRouteInput = {
    routeDecisionId: `${enhancementId}:route`,
    promptText: request.sourcePrompt.text,
    currentStage: request.reviewMomentContext.triggerProvenance.currentStage,
    prevStage: request.reviewMomentContext.triggerProvenance.prevStage,
    triggerKind: request.reviewMomentContext.triggerProvenance.triggerKind,
    firedKey: request.reviewMomentContext.triggerProvenance.firedKey,
    effectiveFiredSource: request.reviewMomentContext.triggerProvenance.effectiveFiredSource,
    selectedQualifyingAbsence: request.reviewMomentContext.triggerProvenance.selectedQualifyingAbsence,
    absenceGateReason: request.reviewMomentContext.triggerProvenance.absenceGateReason,
    classifierState: request.reviewMomentContext.triggerProvenance.classifierState,
    degradedNoActionState: request.reviewMomentContext.triggerProvenance.degradedNoActionState,
    sourceSnapshot: request.sourceSignals,
    sourceFactRefs: request.sourceSignals.sourceRefs.map((source) => source.sourceRefId),
    contentTemplateFactRefs: request.sourceSignals.contentTemplateRecordFactRefs,
    recentPromptEvidenceRefs: request.reviewMomentContext.recentPromptMetadataRefs,
    memoryFeedbackRefs: request.userPreferenceContext.scopedFeedbackEvidenceRefs,
    permissionMode: request.sourceSignals.permissionMode,
    transcriptPathState: request.sourceSignals.transcriptPathState,
    streamBOutputRefs: request.sourceSignals.streamBOutputs,
    paramEventChannels: request.sourceSignals.paramEventChannels,
    runtimeEnvFactRefs: request.sourceSignals.rightGoodWorkStyleEnvRuntimeRefs,
    rightGoodWorkStyleRefs: request.sourceSignals.rightGoodWorkStyleEnvRuntimeRefs,
    stage2SelectionState: request.reviewMomentContext.triggerProvenance.triggerKind === 'absence'
      ? 'selected'
      : 'supplementary_present',
    generatedOriginState: request.sourcePrompt.origin === 'pe_generated_echo'
      ? 'pe_generated'
      : 'ordinary_user_prompt',
    oldDecisionSessionPayloadPresent: false,
    // The classifier's intent proposal, re-guarded against the typed menu (the
    // contract carries it as a string to avoid a type cycle).
    classifierPrimaryIntent: isKnownPrimaryIntent(request.reviewMomentContext.triggerProvenance.classifierPrimaryIntent)
      ? request.reviewMomentContext.triggerProvenance.classifierPrimaryIntent
      : '',
    classifierIntentConfidence: request.reviewMomentContext.triggerProvenance.classifierIntentConfidence ?? 0,
    // The capability observation, each entry re-guarded against its typed
    // vocabulary; `undefined` stays undefined so the router can tell a no-key
    // session (no observation channel) from an observed-empty one.
    classifierCapabilityCandidates: request.reviewMomentContext.triggerProvenance.classifierCapabilityCandidates?.filter(isKnownCapabilityId),
    classifierDebugEvidencePresent: request.reviewMomentContext.triggerProvenance.classifierDebugEvidencePresent?.filter(isKnownDebugEvidenceForm),
  };
  let route = routePromptEnhancement(routeInput);

  // E6: for a baseline prepare where the deterministic keyword router SOFT-skipped an
  // NL-heavy prompt it could not route (no explicit intent / weak-ambiguous), ask the
  // bounded LLM to decide the real route and re-route with it. Gated on a valid key so
  // the suite (no key) keeps the deterministic route; any LLM failure -> keep the
  // deterministic skip (the mandatory fallback). Hard-guard skips (old/generated
  // origin, degraded classifier, first-trigger gate) are NOT rescued. The LLM may
  // still legitimately decide skip_no_useful_guidance.
  if (
    action === undefined &&
    route.noPopup &&
    route.reasonCodes.some((reason) => LLM_ROUTE_RESCUABLE_SKIP_REASONS.has(reason)) &&
    isValidApiKey(process.env['OPENAI_API_KEY'] ?? '')
  ) {
    const llmRouteDecision = await decidePromptEnhancementRouteViaLlmV1({
      promptText: request.sourcePrompt.text,
      deterministicFamilyId: route.familyId,
      deterministicPrimaryIntent: route.primaryIntent,
    });
    if (llmRouteDecision) {
      route = routePromptEnhancement(routeInput, llmRouteDecision);
    }
  }

  // F1b (send-block fix 2026-08-07): an ACTION re-prepare re-routes with the SAME decision its
  // popup was prepared with (carried from result.routeDecision). Without this, a prompt that
  // routed only via the prepare-only E6 rescue above soft-skips again here and the action
  // manufactures a no-popup-shaped result — the popup's own Enter/adjustments then fail (live
  // Windows report). Deterministic re-application of an already-made decision; never an LLM call.
  if (
    actionRequest?.routeCarryover !== undefined &&
    route.noPopup &&
    route.reasonCodes.some((reason) => LLM_ROUTE_RESCUABLE_SKIP_REASONS.has(reason))
  ) {
    route = routePromptEnhancement(routeInput, {
      familyId: actionRequest.routeCarryover.familyId,
      primaryIntent: actionRequest.routeCarryover.primaryIntent,
      capabilities: [],
      ambiguityState: 'clear',
    } as PromptEnhancementLlmRouteDecisionV1);
  }

  // E2 guidance pipeline: source signals -> typed facts -> cross-lane conflict
  // resolution -> transform-rule-2 dual-lane source mix -> DR2-G1 gate. The mix's rendered
  // facts feed section planning; the gate can force skip_no_popup when there is no
  // useful Source-A survivor (never a filler body).
  const guidanceFacts = buildPromptEnhancementGuidanceFactsV1(request);
  const resolvedFacts = resolvePromptEnhancementSourceConflictsV1(guidanceFacts).facts;
  const sourceMix = applyPromptEnhancementSourceMixV1(resolvedFacts, request.userPreferenceContext.levelState);
  // The route's ladder outcome flows into the SAME gate — no parallel skip path.
  const guidanceGate = applyPromptEnhancementGuidanceGateV1(sourceMix, route.ladderResolution);
  // F1 (send-block fix 2026-08-07): an ACTION never re-decides popup existence. The popup the
  // action came from already exists — its route/no-popup decision was made at PREPARE (possibly
  // via the E6 LLM route-rescue above, which is gated to prepare only). Re-running the gate here
  // could "un-route" an approved open popup and fail its own actions/send (live Windows report:
  // Enter on an approved body -> malformed no-popup action result -> send blocked). The action
  // recompose below still runs the FULL safety validation on the recomposed body — this bypass
  // only stops an action from cancelling a popup that is already on screen.
  const noPopup = actionRequest !== undefined ? false : (route.noPopup || !guidanceGate.show);

  const planning = planPromptEnhancementSections({
    routeResult: route,
    sourceRefs: request.sourceSignals.sourceRefs,
    guidanceFacts: sourceMix.renderedFacts,
  });

  // E4: bounded LLM composer wording for a shown popup on the baseline compose (no
  // action). Runs for every shown popup that has a valid key, so the whole test suite
  // (no key) renders deterministically. Any failure -> undefined ->
  // composePromptEnhancementBody validates + falls back deterministically.
  // The route's ambiguity no longer decides this. It used to, and the effect was that
  // roughly four popups in five rendered every guidance section from a fixed string:
  // the section SET varied by intent while the section TEXT did not vary at all. The
  // upstream guidance gate has already decided the popup is worth showing and never
  // fabricates a filler one, so a second gate deciding the body is not worth writing
  // contradicted it.
  // E8: a directional action (Shorter / More-thorough / More-project-grounded /
  // Owner decision (2026-08-06): the interactive popup actions (Shorter / More-thorough /
  // More-project-grounded / Apply-details) must stay INSTANT — deterministic recompose only,
  // exactly like before. An in-popup LLM wait reads as a frozen popup, so the bounded LLM
  // wording call runs ONLY on the initial prepare (action === undefined, in the background
  // before the popup shows), never inside the popup interaction. The composer's
  // action-directive seam stays available for a future non-blocking use.
  const wantsLlmWording = action === undefined;
  let structuredComposerOutput: PromptEnhancementStructuredComposerOutputV1 | undefined;
  // TI-2 (2026-08-07): the composer now reports WHY it failed, and the facade maps that onto the
  // runtime states that already exist instead of collapsing everything to `undefined` — which made
  // a real provider timeout byte-identical to "never eligible for an LLM call" in the UI, logs,
  // and cost metadata. Downstream, the failure states already produce `callVisibilityMode
  // 'fallback_no_llm'` + a populated `providerFailureState` via `fallbackModeForRuntime`.
  //
  // `no_key` is the only reason left as `undefined`. It used to share that with
  // `no_eligible_sections`, which was right while the composer was gated off — but now that it
  // runs for every shown popup with a key, an empty plan is a failure, not a non-request.
  let composerRuntimeState: PromptEnhancementComposerRuntimeState | undefined;
  if (
    wantsLlmWording &&
    !noPopup &&
    isValidApiKey(process.env['OPENAI_API_KEY'] ?? '')
  ) {
    const composerCall = await composeStructuredComposerOutputV1({
      enhancementId,
      originalPromptText: request.sourcePrompt.text,
      planning,
      // Carried straight through from the caller, which is what knows which hook this is running
      // on. Absent here means absent there, so a caller that supplies nothing keeps today's
      // behaviour exactly.
      deadlineAtMs: request.deadlineAtMs,
    });
    if (composerCall.ok) {
      structuredComposerOutput = composerCall.output;
      composerRuntimeState = 'accepted_structured_output';
    } else if (composerCall.reason === 'timeout') {
      composerRuntimeState = 'timeout';
    } else if (composerCall.reason === 'provider_error') {
      composerRuntimeState = 'provider_unavailable';
    } else if (composerCall.reason === 'invalid_output') {
      composerRuntimeState = 'invalid_output';
    } else if (composerCall.reason === 'deadline_exceeded') {
      // The surrounding budget ran out between attempts rather than one call exceeding its own
      // limit. The composer keeps the two apart for logs and cost records; to the user they are
      // the same event, so they share a runtime state rather than earning a new one.
      composerRuntimeState = 'timeout';
    } else if (composerCall.reason === 'no_eligible_sections') {
      // A key was present, a popup was judged worth showing, and planning produced nothing to
      // word. Those cannot both be right, and the result is the thinnest body there is: the
      // user's own prompt and no guidance at all. It used to be filed as "genuinely not
      // requested", which is true only while the composer is gated off — now that it runs for
      // every shown popup with a key, silence here would be the worst output wearing the label of
      // a normal one. Naming the condition is this milestone's job; why planning returned zero is
      // a routing question and is not chased here.
      composerRuntimeState = 'validation_failed';
    }
    // 'no_key' -> undefined: the call was genuinely not made, and that is a supported state.
  }

  const composeInput = {
    enhancementId,
    originalPromptText: request.sourcePrompt.text,
    sectionPlanningResult: planning,
    action: action === 'use_original' || action === 'feedback' || action === 'close' || action === 'use_current_body'
      ? undefined
      : action,
    additionalDetailsText: actionRequest?.userPreferenceContext.additionalDetails?.text,
    editedBodyText: actionRequest?.currentBodyBinding.editedBodyText,
    acceptedAdditionalDetailsText: actionRequest?.userPreferenceContext.additionalDetails?.text,
    priorBodyId: actionRequest?.currentBodyBinding.currentBodyId,
    priorBodyRevision: actionRequest?.currentBodyBinding.bodyRevision,
    timestampMs: request.sourcePrompt.capturedAt,
  };
  let composed = composePromptEnhancementBody({
    ...composeInput,
    composerRuntimeState,
    structuredComposerOutput,
  });
  const validateComposed = (candidate: typeof composed) => validatePromptEnhancementSafety({
    currentBody: candidate.currentBody,
    actionType: noPopup ? 'use_original' : undefined,
    callVisibilityMode: candidate.callVisibilityMode,
    // ONE source of truth (TI-2, 2026-08-07): the validation graph must carry the SAME
    // optionalCallAvailabilityState the composed boundary metadata carries — the result validator
    // enforces graph === metadata === boundary ('mismatched_call_visibility_state'). The composed
    // metadata already derived it correctly for every mode, including the provider-failure states
    // ('unavailable_by_provider_api'), so read it from there instead of re-deriving here.
    optionalCallAvailabilityState: candidate.composerBoundary.inputContract.callVisibilityState.optionalCallAvailabilityState,
    // Only meaningful while the candidate still carries the composer's wording. Once the drafts are
    // dropped below, the body is the deterministic renderer's and the composer's verdict no longer
    // describes it — passing it on would block a body the model never wrote.
    composerAuthoritySelfReport: candidate.callVisibilityMode === 'llm_wording'
      ? {
        generatedMode: structuredComposerOutput?.authorityModeSelfReport,
        requestMode: structuredComposerOutput?.requestModeSelfReport,
      }
      : undefined,
  });
  let safety = validateComposed(composed);
  // TI-3.3 (2026-08-08) — observability-only capture of the deterministic substitution below. Set
  // ONLY if the recompose-drop actually replaces a blocked LLM body; records the verdict that body
  // carried BEFORE `safety` is reassigned (the emitted safetySummary describes the replacement).
  let deterministicFallbackApplied = false;
  let preSubstitutionAuthorityEscalationState: PromptEnhancementValidationStatus | undefined;
  // Blocked-popup fix part 2 (2026-08-07) — deterministic-fallback safety net. The composer's
  // confirmation-parity guard removes the confirmation-absence block, but an accepted LLM draft
  // can still hard-block the FINAL body through the other blocking families the draft filter
  // does not fully cover (unresolved [X]/<x> placeholders, voice phrases, authority escalation,
  // data-leak wording). A prepare-time block of an LLM-worded body must never reach the user as
  // the empty all-unavailable popup when a proven-valid deterministic body exists: recompose with
  // the drafts dropped — the established rejected-drafts semantics ('fallback_no_llm', the spent
  // LLM call stays counted for E9) — and keep the blocked result ONLY if even the deterministic
  // body blocks (then the content itself — e.g. user-typed details — is the cause, which is the
  // genuine D2 case the blocked popup exists for).
  if (
    structuredComposerOutput !== undefined
    && composed.callVisibilityMode === 'llm_wording'
    && (safety.sendPolicy === 'no_send' || safety.generatedSafeStatus === 'invalid_non_sendable')
  ) {
    const recomposed = composePromptEnhancementBody({
      ...composeInput,
      composerRuntimeState: 'accepted_structured_output',
      structuredComposerOutput: { ...structuredComposerOutput, sectionDrafts: [] },
    });
    const recomposedSafety = validateComposed(recomposed);
    if (recomposedSafety.sendPolicy !== 'no_send' && recomposedSafety.generatedSafeStatus !== 'invalid_non_sendable') {
      composed = {
        ...recomposed,
        diagnostics: [
          ...recomposed.diagnostics,
          { category: 'fallback_or_no_popup' as const, reasonCode: 'llm_final_body_blocked_deterministic_fallback' },
        ],
      };
      // Capture the pre-substitution verdict BEFORE `safety` is overwritten by the replacement's.
      deterministicFallbackApplied = true;
      preSubstitutionAuthorityEscalationState = safety.safetySummary.authorityEscalationState;
      safety = recomposedSafety;
    }
  }
  // MPS P1b-i (owner unit P1) — REPLACE the display-only punctuation splitter with the full LLM
  // sequence planner as the source of truth for the compact summary's item count + role labels. This
  // runs in the SAME place the describe runs (after the body is composed), for the SAME
  // `isSequenceCandidate` prompts, and ONLY when a db + client seam is threaded in (auto.ts) — a
  // baseline prepare, never an action. The planner reads the config kill-switch from the store itself
  // and refuses (config off / non-user origin / no popup) or fails (no_key / provider_error / timeout /
  // refusal) or returns a single-prompt outcome — in every one of those cases the override stays
  // undefined and buildResult falls back to the exact describe path. So a non-sequence prompt, and any
  // caller of the contract-typed `preparePromptEnhancement` (no deps), is byte-identical to today.
  //
  // Redaction: the planner is length-preserving offset-indexed, so the SAME redacted text is passed as
  // both the provider-visible `promptContext` and the local `localOriginalText` — offsets align and no
  // raw user text reaches the provider.
  let plannerSummary: { remainingTaskCount: number; taskRoleLabels: readonly string[]; taskSummaryLines: readonly string[] } | undefined;
  // MPS P1b-ii: the planner's full item list, captured only when it ran + produced a sequence — the
  // background wording batch (P2) consumes it. Undefined on the non-sequence / fallback path.
  let plannerItems: readonly PromptEnhancementSequenceItemV1[] | undefined;
  let plannerPromptDirectives: readonly PromptEnhancementSequenceOffsetRangeV1[] | undefined;
  if (seqDeps !== undefined && action === undefined && !noPopup && isSequenceCandidateForRoute(route)) {
    const redactedText = redactSecrets(request.sourcePrompt.text);
    const plannerResult = await runPromptEnhancementSequencePlannerV1(
      {
        promptContext: redactedText,
        localOriginalText: redactedText,
        entry: {
          promptOrigin: request.sourcePrompt.origin,
          guidanceGateShow: !noPopup,
        },
        db: seqDeps.db,
        projectRoot: request.projectRoot,
        route: {
          familyId: route.familyId,
          primaryIntent: route.primaryIntent,
          capabilityOverlays: route.capabilityOverlays,
          routeConfidence: route.routeConfidence,
        },
        // PROPER FIX — the production planner opts into the deterministic fallback: when the model
        // cannot produce a valid plan, the loop rebuilds one from its task decomposition rather than
        // falling through to the single-prompt path with an empty sequence. Only the sequence branch
        // below is affected; a non-sequence outcome (or fewer than two tasks) still falls through
        // exactly as today.
        deterministicFallback: true,
      },
      seqDeps.client,
    );
    if (plannerResult.ok && plannerResult.output.outcome === 'sequence' && plannerResult.output.summaryData) {
      plannerSummary = {
        remainingTaskCount: plannerResult.output.summaryData.remainingTaskCount,
        taskRoleLabels: plannerResult.output.summaryData.taskRoleLabels,
        // One display line per follow-up task, cut from the SAME redacted text the planner indexed
        // (offsets align, length-preserving) — the user's own words, no secret, no generated body.
        taskSummaryLines: promptEnhancementSequenceTaskSummaryLinesV1(plannerResult.output.items, redactedText),
      };
      plannerItems = plannerResult.output.items;
      plannerPromptDirectives = plannerResult.output.promptDirectives;
    }
    // else → fall through to the describe fallback (single-prompt path), exactly as today.
  }
  // MPS-1 display gate: the first-popup sequence summary respects the SAME `prompt_enhancement.sequence.enabled`
  // config that gates the planner + MPS-2 continuation. When deps are threaded (the auto path), read the
  // config — 'off' suppresses the summary too, so MPS-1 and MPS-2 turn off together. Contract-typed callers
  // (no deps) cannot read the config and keep the prior behaviour (summary shown for sequence candidates).
  const sequenceSummaryEnabled = seqDeps === undefined
    ? true
    : resolvePromptEnhancementSequenceConfig(seqDeps.db, request.projectRoot).sequenceEnabled === 'on';
  const result = buildResult(request, enhancementId, route, planning, composed, safety, noPopup, {
    deterministicFallbackApplied,
    preSubstitutionAuthorityEscalationState,
  }, plannerSummary, sequenceSummaryEnabled);
  return { result, plannerItems, plannerPromptDirectives };
}

/**
 * MPS (owner ruling 2026-08-06) — a result is a sequence CANDIDATE (the branch where the compact
 * summary is built and, under P1b-i, the full planner may replace the describe) iff the route says the
 * prompt is compound: multiple intent families in one prompt, OR a >= 3-point list of the same family.
 * Extracted so `prepare` (planner gate) and `buildResult` (summary source) test the SAME predicate.
 */
function isSequenceCandidateForRoute(route: ReturnType<typeof routePromptEnhancement>): boolean {
  const compoundPromptState = route.contractDecision.compoundPromptState;
  return compoundPromptState === 'multi_intent_one_prompt'
    || (compoundPromptState === 'multi_point_same_intent' && route.contractDecision.userPointCoverageRefs.length >= 3);
}

function buildResult(
  request: PromptEnhancementPrepareRequestV1,
  enhancementId: string,
  route: ReturnType<typeof routePromptEnhancement>,
  planning: ReturnType<typeof planPromptEnhancementSections>,
  composed: PromptEnhancementComposeResult,
  safety: PromptEnhancementSafetyValidationResult,
  // Effective no-popup = route.noPopup OR the DR2-G1 gate skip (no useful Source-A
  // survivor / weak evidence). Both collapse to the same not-applicable disposition.
  noPopup: boolean,
  // TI-3.3 (2026-08-08) — observability-only. Present (applied === true) only when the blocked-body
  // deterministic substitution fired; carries the pre-substitution verdict for the log/result trace.
  fallbackReport?: {
    deterministicFallbackApplied: boolean;
    preSubstitutionAuthorityEscalationState: PromptEnhancementValidationStatus | undefined;
  },
  // MPS P1b-i (owner unit P1) — when present, the full sequence planner produced this summary and it
  // REPLACES the describe splitter as the source of truth for the item count + role labels. Absent on
  // every non-sequence prompt, on any planner failure/refusal/single-outcome, and on every caller of the
  // contract-typed `preparePromptEnhancement` (no deps) — so the describe fallback path is byte-identical.
  plannerSummary?: { remainingTaskCount: number; taskRoleLabels: readonly string[]; taskSummaryLines: readonly string[] },
  // MPS-1 config gate: false suppresses the first-popup sequence summary (`handoffAndSequenceSummary`) so
  // `prompt_enhancement.sequence.enabled=off` turns MPS-1 off alongside MPS-2. Defaults true so the
  // contract-typed (no-deps) callers are byte-identical to before.
  sequenceSummaryEnabled: boolean = true,
): PromptEnhancementPrepareResultV1 {
  const currentBody: PromptEnhancementCurrentBodyV1 = {
    ...composed.currentBody,
    generatedSafeStatus: safety.generatedSafeStatus,
  };
  const disposition = dispositionFor(noPopup, currentBody, safety);
  const blockedNoSend = disposition === 'blocked_no_send';
  // D2 4a (P6-G1 / decision-rule-5): on a hard block, make the engine payload self-safe AT SOURCE. A host
  // reading the result DIRECTLY (before the typed UI layers scrub it) must not receive the offending
  // generated content from ANY field. The full-body fields fall back to the user's own original
  // prompt (the use_original fallback); the per-section text is emptied (a blocked section has no
  // safe per-section fallback). The send policy already forbids transport and the UI layers exclude
  // it too — defense-in-depth (engine + every UI layer), not one terminal scrub. Fields carrying the
  // generated body: currentBody.text / .renderedPromptBody / .sections[].bodyText and the composer
  // boundary's renderedPromptBody (audit copy) — all covered here; every other result text field is
  // deterministic UI copy or request input.
  const safeCurrentBody: PromptEnhancementCurrentBodyV1 = blockedNoSend
    ? {
        ...currentBody,
        text: currentBody.originalPromptText,
        renderedPromptBody: currentBody.originalPromptText,
        sections: currentBody.sections.map((section) => ({ ...section, bodyText: '' })),
      }
    : currentBody;
  const safeComposerBoundary = blockedNoSend
    ? { ...composed.composerBoundary, renderedPromptBody: composed.currentBody.originalPromptText }
    : composed.composerBoundary;
  const diagnostics = diagnosticsFor(enhancementId, [...composed.diagnostics, ...safety.publicDiagnostics]);
  // TI-3.2 (2026-08-08) — capture the compose-layer fallback reason CODES BEFORE diagnosticsFor
  // genericizes them for the public array (which drops reasonCode). Reporting-only; typed codes only.
  // TI-3.2 follow-up Phase 2 (2026-08-09): capture the WHOLE `fallback_or_no_popup` category, not a
  // hand-picked subset. This is the entire class of "the body was reduced/fell back" — the draft-
  // rejection cause, the substitution marker, partial-drop (Phase 1), and the action-preserved /
  // no-sections codes. Any one of these, dropped from the log, means a reduction that read as a clean run.
  // TI-3.2 follow-up Phase 3 (2026-08-09): also capture the `source_coverage` grounding code
  // `project_grounding_source_unavailable` — a `more_project_grounded` action that finds no grounding
  // source degrades silently (diagnosticsFor genericizes it too). It is a distinct diagnostic category,
  // so it needs its own clause; the category holds only this one reduction code.
  const compositionFallbackReasonCodes = composed.diagnostics
    .filter((diagnostic) =>
      diagnostic.category === 'fallback_or_no_popup'
      || (diagnostic.category === 'source_coverage'
        && diagnostic.reasonCode === 'project_grounding_source_unavailable'))
    .map((diagnostic) => diagnostic.reasonCode);
  // TI-3 audit follow-up (2026-08-09): the additional-details truncation is a `generated` input-cap
  // event (not a fallback/reduction), so it is tracked as its own flag rather than mixed into the
  // fallback reason codes above. Reporting-only.
  const additionalDetailsTruncated = composed.diagnostics.some(
    (diagnostic) => diagnostic.reasonCode === 'additional_details_truncated_public_notice',
  );
  const composerCallVisibility = composed.composerBoundary.inputContract.callVisibilityState;
  // A6: computed HERE because this is the layer that holds the mixed facts — the result
  // carries fact IDS only, so deriving it downstream would log an empty summary forever.
  const runtimeSeamSummary = summarisePromptEnhancementRuntimeSeamsV1(planning.renderedFacts);
  const callAndVisibilityMetadata = {
    runtimeSeamSummary,
    ...composerCallVisibility,
    callOwner: 'content_semantics' as const,
    callTrigger: 'prepare' as const,
    productValueDiscussionIsRuntimeLimiter: false as const,
  };
  const validationSummary = safety.safetySummary;
  const generatedOrigin = buildGeneratedOrigin(request, enhancementId, currentBody);
  const delivery = buildDelivery(request, safety, noPopup);
  const trustCues = buildTrustCues(currentBody, composed.sourceGuidanceCoverage, safety);
  // UI-9 / transform-rule-10: deterministic header copy — pinch label always (when a popup
  // shows), why-help only when a safety/risk/sensitive-action reason exists.
  const pinchLabel = noPopup
    ? undefined
    : buildPromptEnhancementPinchLabelV1({ familyId: route.familyId, capabilityOverlays: route.capabilityOverlays });
  const whyHelp = noPopup
    ? undefined
    : buildPromptEnhancementWhyHelpV1({
        capabilityOverlays: route.capabilityOverlays,
        hasSensitiveAction: safety.sensitiveActionFindings.some((finding) => finding.requiresConfirmation),
      });
  // MPS (owner ruling 2026-08-06): for a compound prompt the engine emits the typed
  // handoff/sequence summary so the CLI MPS first popup can render the sequence plan. Compound =
  // multiple intent families in one prompt, OR a genuine multi-step list of the same family
  // (>= 3 user points — "schema, cron job, email sender, and the widget"; a plain "add X and Y"
  // stays on the PE popup). Metadata only — the builder itself locks
  // `sequenceActivationPolicy: blocked_pending_…` and `receiverCanActivateRuntime: false`.
  const isSequenceCandidate = isSequenceCandidateForRoute(route);
  // Sequence-plan summary source (2026-08-07 display fix; MPS P1b-i source-of-truth swap 2026-08-14):
  // feed the compact summary REAL display data. Under P1b-i the full sequence planner (owner unit P1)
  // supplies the count + role labels via `plannerSummary` when it ran and returned a sequence; the
  // display-only punctuation splitter `describePromptEnhancementSequencePlanV1` STAYS as the labelled
  // fallback for the no-deps / no-key / provider-failure / single-outcome path (byte-identical to
  // before). The emission gate above is untouched, so WHICH prompts open MPS is unchanged.
  const sequencePlan = isSequenceCandidate && plannerSummary === undefined
    ? describePromptEnhancementSequencePlanV1(request.sourcePrompt.text)
    : undefined;
  let handoffAndSequenceSummary = !noPopup && disposition === 'show_current_body' && isSequenceCandidate && sequenceSummaryEnabled
    ? buildPromptEnhancementHandoffMetadataV1({
        handoffDecisionId: `${enhancementId}:handoff`,
        requestId: request.requestId,
        projectRoot: request.projectRoot,
        currentBody: safeCurrentBody,
        safetySummary: validationSummary,
        handoffKind: 'compact_sequence_summary_candidate',
        summary: {
          summaryId: `${enhancementId}:handoff:summary`,
          publicSafeText: 'Additional task metadata is available after the current body.',
          remainingTaskCount: plannerSummary
            ? plannerSummary.remainingTaskCount
            : Math.max(0, (sequencePlan?.pointCount ?? 1) - 1),
          taskRoleLabels: plannerSummary
            ? plannerSummary.taskRoleLabels
            : sequencePlan?.roleLabels ?? [],
          // Per-follow-up-task display lines come only from the planner's real items (their redacted
          // slices). The describe fallback has no per-item slices, so it stays empty — Remaining + Types
          // only, exactly as before.
          taskSummaryLines: plannerSummary ? plannerSummary.taskSummaryLines : [],
        },
      })
    : undefined;
  // Self-guard: emit the summary ONLY if it passes the same handoff validation the boundary
  // enforces — a summary that would make the whole result invalid must never cost the user the
  // PE popup (drop the summary, keep the result; MPS simply skips for that prompt).
  if (handoffAndSequenceSummary) {
    const handoffValidation = validatePromptEnhancementHandoffMetadataV1(
      handoffAndSequenceSummary,
      safeCurrentBody,
      validationSummary,
      { requestId: request.requestId, projectRoot: request.projectRoot },
    );
    if (!handoffValidation.ok) handoffAndSequenceSummary = undefined;
  }
  const uiView: PromptEnhancementUiViewPayloadV1 = {
    ...buildUiView(request, enhancementId, safeCurrentBody, composed, safety, trustCues, diagnostics, noPopup),
    ...(pinchLabel ? { pinchLabel } : {}),
    ...(whyHelp ? { whyHelp } : {}),
    ...(handoffAndSequenceSummary ? { handoffAndSequenceSummary } : {}),
  };

  return {
    schemaVersion: PROMPT_ENHANCEMENT_CONTRACT_VERSION,
    enhancementId,
    requestId: request.requestId,
    projectRoot: request.projectRoot,
    modelVersion: composed.callVisibilityMode === 'llm_wording' ? 'llm-wording-v1' : 'deterministic-v1',
    disposition,
    validationDecisionId: safety.validationDecisionId,
    currentBody: safeCurrentBody,
    availableActions: composed.availableActions,
    sourceGuidanceCoverage: noPopup ? 'not_applicable' : composed.sourceGuidanceCoverage,
    routingAndFeedbackDecision: {
      state: noPopup ? 'suppress' : route.fallbackMode === 'planning_first' ? 'clarify' : 'show',
      confidence: routeConfidence(route.routeConfidence),
      reasonCodes: route.reasonCodes,
      scopedPromptKindKey: route.primaryIntent,
      priorFeedbackEvidenceRefs: request.userPreferenceContext.scopedFeedbackEvidenceRefs,
      resetExpiryState: 'not_applicable',
      selectedFamilyId: route.familyId,
      selectedTagIds: route.secondaryIntentTags,
      selectedLevelState: request.userPreferenceContext.levelState,
      selectedSectionPivotIds: planning.sectionPlans.map((section) => section.sectionId),
    },
    routeDecision: route.contractDecision,
    bodyPlan: planning.bodyPlan,
    composerBoundary: safeComposerBoundary,
    validationSummary,
    safetySummary: validationSummary,
    validationGraph: safety.validationGraph,
    callAndVisibilityMetadata,
    uiView,
    generatedOrigin,
    delivery,
    ownership: {
      owners: ['content_semantics', 'ui_app'],
      sourceSnapshotVersion: PROMPT_ENHANCEMENT_CONTRACT_VERSION,
      fixtureIds: [...route.contractDecision.registryLinkedFixtureIds],
      launchBoundaryRecheckRef: 'launch_boundary_recheck_pending',
      excludesPrivatePlanningLeakage: true,
    },
    diagnostics,
    // TI-3.3 (2026-08-08) — reporting-only; emitted ONLY when the deterministic substitution fired.
    ...(fallbackReport?.deterministicFallbackApplied
      ? {
          deterministicFallbackApplied: true,
          preSubstitutionAuthorityEscalationState: fallbackReport.preSubstitutionAuthorityEscalationState,
        }
      : {}),
    // TI-3.2 (2026-08-08) — reporting-only; emitted ONLY when a compose-layer fallback produced a
    // reason code (a clean deterministic body composes as 'generated', so this stays absent).
    ...(compositionFallbackReasonCodes.length > 0 ? { compositionFallbackReasonCodes } : {}),
    // TI-3 audit follow-up (2026-08-09) — reporting-only; emitted ONLY when the input was truncated.
    ...(additionalDetailsTruncated ? { additionalDetailsTruncated: true } : {}),
  };
}

/**
 * UI-9: recompute the header why-help against a rebuilt safety result. The route
 * capability overlays are stable across body edits (they come from the original
 * prompt intent), so only the sensitive-action reason can change on an edit; the
 * pinch label stays as-is because it is keyed on the unchanged route family.
 */
function rebuildWhyHelpForSafety(
  result: PromptEnhancementPrepareResultV1,
  safety: PromptEnhancementSafetyValidationResult,
): PromptEnhancementWhyHelpV1 | undefined {
  return buildPromptEnhancementWhyHelpV1({
    capabilityOverlays: result.routeDecision.capabilityOverlays as readonly PromptEnhancementCapabilityId[],
    hasSensitiveAction: safety.sensitiveActionFindings.some((finding) => finding.requiresConfirmation),
  });
}

function rebuildWithEditedBodySafety(
  request: PromptEnhancementActionRequestV1,
  result: PromptEnhancementPrepareResultV1,
  editedBodyText: string,
  safety: PromptEnhancementSafetyValidationResult,
): PromptEnhancementPrepareResultV1 {
  const currentBody: PromptEnhancementCurrentBodyV1 = {
    ...result.currentBody,
    renderedPromptBody: editedBodyText,
    text: editedBodyText,
    generatedOriginState: 'pe_user_edited_body',
    generatedSafeStatus: safety.generatedSafeStatus,
    userDirtyState: 'dirty_user_edited',
  };
  const publicDiagnostics = diagnosticsFor(result.enhancementId, safety.publicDiagnostics);
  const { whyHelp: _priorWhyHelp, ...priorUiView } = result.uiView;
  const whyHelp = rebuildWhyHelpForSafety(result, safety);
  return {
    ...result,
    disposition: dispositionFor(false, currentBody, safety),
    validationDecisionId: safety.validationDecisionId,
    currentBody,
    validationSummary: safety.safetySummary,
    safetySummary: safety.safetySummary,
    validationGraph: safety.validationGraph,
    generatedOrigin: buildGeneratedOrigin(request, result.enhancementId, currentBody),
    delivery: buildDelivery(request, safety, false),
    uiView: {
      ...priorUiView,
      ...(whyHelp ? { whyHelp } : {}),
      body: {
        ...priorUiView.body,
        text: editedBodyText,
        generatedOriginState: 'pe_user_edited_body',
        dirtyState: 'dirty_user_edited',
        sendPolicy: safety.sendPolicy,
        fallbackMode: safety.fallbackMode,
      },
      diagnostics: [...priorUiView.diagnostics, ...publicDiagnostics],
    },
    diagnostics: [...result.diagnostics, ...publicDiagnostics],
  };
}

function rebuildWithSafety(
  result: PromptEnhancementPrepareResultV1,
  safety: PromptEnhancementSafetyValidationResult,
  disposition: PromptEnhancementPrepareResultV1['disposition'],
): PromptEnhancementPrepareResultV1 {
  const currentBody = { ...result.currentBody, generatedSafeStatus: safety.generatedSafeStatus };
  const { whyHelp: _priorWhyHelp, ...priorUiView } = result.uiView;
  const whyHelp = rebuildWhyHelpForSafety(result, safety);
  return {
    ...result,
    disposition,
    validationDecisionId: safety.validationDecisionId,
    currentBody,
    validationSummary: safety.safetySummary,
    safetySummary: safety.safetySummary,
    validationGraph: safety.validationGraph,
    delivery: { ...result.delivery, sendPolicy: safety.sendPolicy },
    uiView: {
      ...priorUiView,
      ...(whyHelp ? { whyHelp } : {}),
      body: { ...priorUiView.body, text: currentBody.text, sendPolicy: safety.sendPolicy },
    },
  };
}

function assertPrepareRequest(request: unknown): asserts request is PromptEnhancementPrepareRequestV1 {
  const validation = validatePromptEnhancementPrepareRequestV1(request);
  if (!validation.ok) throw new Error(`invalid_prompt_enhancement_request:${validation.reasonCodes.join(',')}`);
}

function dispositionFor(
  noPopup: boolean,
  body: PromptEnhancementCurrentBodyV1,
  safety: PromptEnhancementSafetyValidationResult,
): PromptEnhancementPrepareResultV1['disposition'] {
  if (noPopup) return 'no_popup_not_applicable';
  if (safety.sendPolicy === 'no_send' || safety.generatedSafeStatus === 'invalid_non_sendable') return 'blocked_no_send';
  if (safety.sendPolicy === 'send_original' || body.generatedOriginState === 'user_original') return 'fallback_to_original';
  return 'show_current_body';
}

function routeConfidence(value: ReturnType<typeof routePromptEnhancement>['routeConfidence']) {
  if (value === 'strong') return 'high' as const;
  if (value === 'partial') return 'medium' as const;
  if (value === 'missing') return 'none' as const;
  return 'low' as const;
}

function buildGeneratedOrigin(
  request: PromptEnhancementPrepareRequestV1,
  enhancementId: string,
  body: PromptEnhancementCurrentBodyV1,
): PromptEnhancementGeneratedOriginMetadataV1 {
  return {
    generatedOriginId: `${enhancementId}:origin:${body.currentBodyId}:${body.bodyRevision}`,
    generatedOriginState: body.generatedOriginState,
    enhancementId,
    bodyId: body.currentBodyId,
    bodyRevision: body.bodyRevision,
    deliveryChannel: request.hostSurface,
    sourceUseIds: body.sourceAttribution.map((source) => source.sourceRefId),
    echoRecursionGuard: {
      bodyFingerprintRef: `${body.currentBodyId}:${body.bodyRevision}`,
      sourcePromptEchoState: request.sourcePrompt.origin === 'pe_generated_echo' ? 'pe_generated_echo' : 'not_echo',
      lastInjectedPromptIsAuthority: false,
    },
    learningEligibility: {
      promptHistory: false,
      profile: false,
      stage: false,
      language: false,
      memory: false,
      telemetry: false,
      sourceUseTracking: body.sourceAttribution.length > 0,
    },
  };
}

function buildDelivery(
  request: PromptEnhancementPrepareRequestV1,
  safety: PromptEnhancementSafetyValidationResult,
  noPopup: boolean,
): PromptEnhancementDeliveryMetadataV1 {
  const stopBridge = request.hostSurface === 'cli_stop_bridge';
  return {
    deliveryChannel: request.hostSurface,
    sendPolicy: noPopup ? 'no_popup' : safety.sendPolicy,
    stopReasonCarriesTextOnly: stopBridge,
    rawTransportIsSemanticAuthority: false,
    hostCapabilityState: stopBridge ? 'stop_bridge_only' : 'unsupported',
    extensionPayloadState: request.hostSurface === 'extension_bridge' ? 'typed_payload_required' : 'not_applicable',
    hostCapabilityEvidenceRefs: request.sourceSignals.deliveryGateRefs,
    exposureAcknowledgementState: noPopup ? 'not_shown' : 'not_shown',
  };
}

function buildTrustCues(
  body: PromptEnhancementCurrentBodyV1,
  sourceGuidanceCoverage: PromptEnhancementComposeResult['sourceGuidanceCoverage'],
  safety: PromptEnhancementSafetyValidationResult,
): readonly PromptEnhancementPublicTrustCueV1[] {
  const cues: PromptEnhancementPublicTrustCueV1[] = [
    { cueId: 'original-prompt', label: 'original_prompt', publicSafeText: 'Your original request remains visible.', sourceRefIds: [], rawPrivateDataExcluded: true },
    { cueId: 'generated-origin', label: 'generated_source_state', publicSafeText: body.generatedOriginState === 'pe_generated_body' ? 'This body was prepared by Nexpath.' : 'The original request is preserved.', sourceRefIds: [], rawPrivateDataExcluded: true },
    { cueId: 'safety-state', label: 'safety_safeguard', publicSafeText: safety.safetySummary.noAutomaticSend ? 'Nexpath does not send automatically.' : 'Review the supplied send policy before continuing.', sourceRefIds: [], rawPrivateDataExcluded: true },
    { cueId: 'source-guidance', label: sourceGuidanceCoverage === 'covered' ? 'source_signal_guidance' : 'fallback_or_no_popup', publicSafeText: sourceGuidanceCoverage === 'covered' ? 'Grounded guidance is attached.' : 'No generated guidance was safely produced.', sourceRefIds: [], rawPrivateDataExcluded: true },
  ];
  return cues;
}

function diagnosticsFor(
  enhancementId: string,
  diagnostics: readonly { category: PromptEnhancementPublicDiagnosticV1['category']; reasonCode: string }[],
): readonly PromptEnhancementPublicDiagnosticV1[] {
  return diagnostics.map((diagnostic, index) => ({
    diagnosticId: `${enhancementId}:diagnostic:${index + 1}`,
    category: diagnostic.category,
    publicSafeText: diagnostic.reasonCode === 'additional_details_truncated_public_notice'
      ? 'Content beyond 5,000 words was truncated before recomposition.'
      : diagnostic.category === 'generated' ? 'Prepared prompt-enhancement body is available.' : 'Prompt-enhancement state was safely reduced.',
    rawPromptExcluded: true,
    rawGeneratedBodyExcluded: true,
    rawSourceExcerptExcluded: true,
    rawFeedbackExcluded: true,
    privateIdsExcluded: true,
    researchLabelsExcluded: true,
    rawReasonValuesExcluded: true,
  }));
}

function buildUiView(
  request: PromptEnhancementPrepareRequestV1,
  enhancementId: string,
  body: PromptEnhancementCurrentBodyV1,
  composed: PromptEnhancementComposeResult,
  safety: PromptEnhancementSafetyValidationResult,
  trustCues: readonly PromptEnhancementPublicTrustCueV1[],
  diagnostics: readonly PromptEnhancementPublicDiagnosticV1[],
  noPopup: boolean,
): PromptEnhancementUiViewPayloadV1 {
  const timestampMs = request.sourcePrompt.capturedAt ?? Date.now();
  const sectionsForFeedback: readonly PromptEnhancementSectionFeedbackViewV1[] = body.sections.map((section) => ({
    sectionId: section.sectionId,
    sectionKind: section.sectionKind,
    label: section.title,
    templateType: section.templateType,
    familyId: section.familyId,
    primaryIntent: section.primaryIntent,
    sourceKinds: [section.sourceKind],
    sourceIds: section.sourceIds,
    baselineSourceSignalSlot: section.baselineSourceSignalSlot,
    sourceEvidenceStatus: section.sourceEvidenceStatus,
    slotEvidenceStatus: section.slotEvidenceStatus,
    requirementSourceStatus: section.requirementSourceStatus,
    validationStatus: section.validationStatus,
    safetyFlags: section.safetyFlags,
    sensitivityFlags: section.sensitivityFlags,
    publicSafeExplanationCategory: section.publicExplanationCategory,
    fallbackMode: section.fallbackBehavior,
    callVisibilityMode: section.callVisibilityMode,
    spanRefs: section.spanRefs,
    preciseFeedbackAllowed: section.feedbackSensitivity === 'typed_feedback_allowed',
  }));
  return {
    viewPayloadVersion: PROMPT_ENHANCEMENT_CONTRACT_VERSION,
    enhancementId,
    body: {
      text: body.text.replace(
        ' [truncated_to_apply_details_5000_word_cap]',
        '',
      ),
      currentBodyId: body.currentBodyId,
      bodyRevision: body.bodyRevision,
      generatedOriginState: body.generatedOriginState,
      dirtyState: body.userDirtyState,
      originalPromptPreservation: body.originalPromptPreservation,
      levelState: request.userPreferenceContext.levelState,
      actionLoadingState: 'idle',
      sendPolicy: noPopup ? 'no_popup' : safety.sendPolicy,
      fallbackMode: composed.fallbackMode,
    },
    sectionsForFeedback,
    publicTrustCues: trustCues,
    actions: composed.availableActions,
    actionInputContract: {
      actionInputVersion: PROMPT_ENHANCEMENT_CONTRACT_VERSION,
      enhancementId,
      currentBodyId: body.currentBodyId,
      bodyRevision: body.bodyRevision,
      actionId: `${body.currentBodyId}:action:use_current_body`,
      hostSurface: request.hostSurface,
      deliveryChannel: request.hostSurface,
      rendererState: noPopup ? 'not_shown' : 'not_shown',
      exposureAcknowledgementState: 'not_shown',
      timestampMs,
      realUserInitiated: false,
      editedBodyTextPolicy: 'required_when_body_may_be_dirty',
      sectionSpanEditEventsPolicy: 'only_when_span_map_exact',
      additionalDetailsPolicy: 'bounded_recomposition_input_only',
    },
    diagnostics,
    hidesVisibleSectionControls: true,
    exposesPromptVariants: false,
    exposesForegroundSafer: false,
    textOnlyDeliveryIsAuthority: false,
  };
}

/**
 * Diagnosability (2026-08-06): explain why a prepared result carries NO handoff/sequence summary.
 * Pure + deterministic — reproduces the emission decision from the result itself so the runtime
 * (auto.ts) can LOG the exact failing handoff-validation checks that the self-guard, by design,
 * swallows (the public-diagnostics contract excludes raw reason values). Never throws.
 */
export function explainPromptEnhancementSequenceSummaryAbsenceV1(
  request: PromptEnhancementPrepareRequestV1,
  result: PromptEnhancementPrepareResultV1,
): readonly string[] {
  try {
    if (result.uiView.handoffAndSequenceSummary) return ['summary_present'];
    if (result.disposition !== 'show_current_body') return [`disposition:${result.disposition}`];
    const compound = result.routeDecision.compoundPromptState;
    const isCandidate = compound === 'multi_intent_one_prompt'
      || (compound === 'multi_point_same_intent' && result.routeDecision.userPointCoverageRefs.length >= 3);
    if (!isCandidate) return [`not_sequence_candidate:${compound}`];
    const handoff = buildPromptEnhancementHandoffMetadataV1({
      handoffDecisionId: `${result.enhancementId}:handoff`,
      requestId: request.requestId,
      projectRoot: request.projectRoot,
      currentBody: result.currentBody,
      safetySummary: result.validationSummary,
      handoffKind: 'compact_sequence_summary_candidate',
    });
    const validation = validatePromptEnhancementHandoffMetadataV1(
      handoff,
      result.currentBody,
      result.validationSummary,
      { requestId: request.requestId, projectRoot: request.projectRoot },
    );
    return validation.ok
      ? ['validation_ok_summary_unexpectedly_absent']
      : ['summary_dropped_by_validation', ...validation.reasonCodes.slice(0, 6)];
  } catch (error) {
    return [`explain_failed:${error instanceof Error ? error.name : 'unknown'}`];
  }
}
