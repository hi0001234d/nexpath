/**
 * PE action request/response loop (P9, PEH-6).
 *
 * SCOPE, decided against the actual handoff text, not inferred from the dev
 * plan's own "Design" section: PEH-6 (the authoritative extension-handoff
 * item this phase implements) describes required BEHAVIOUR — loading state,
 * previous-body survival, canonical ids, the dirty-draft-discarded +
 * locked-while-pending state pair, apply_details' distinctness, surfacing
 * timeout/fallback — with no mention of a specific transport. The dev plan's
 * own "Design" section additionally proposes a stdio JSON-line transport
 * (R3, `--interaction stdio`) for eventually wiring this to a real spawned
 * CLI process — that flag does not exist yet (`G-R3`, OPEN, on the CLI-side
 * owners), so nothing can be tested against a real process today. This module
 * is therefore the REQUEST/RESPONSE STATE MACHINE only — the part the
 * handoff actually specifies and the part genuinely testable in isolation,
 * with a fake/injected response standing in for whatever transport
 * eventually exists (mirroring how `cli-submit-popup.test.ts` already tests
 * the CLI's own loop with fakes). Wiring a real transport is deferred until
 * G-R3 resolves — this module's typed interface is what that transport
 * would eventually plug into.
 *
 * ARCHITECTURAL NOTE — same `G-ROOTDIR` constraint found repeatedly this
 * milestone. `cli-submit-popup.ts` (`src/prompt-enhancement/**`) defines the
 * real `PromptEnhancementCliPopupCommandV1`/`PromptEnhancementCliPopupInteractionV1`
 * this loop is conceptually the extension-side counterpart to; it cannot be
 * imported. Read in full before designing this module. `actionRequestLockState`'s
 * value `'locked_action_loading'` is not invented — it is a real value of
 * `popup-session.ts`'s `PromptEnhancementPopupSessionV1.preSendBoundaryState.editabilityState`
 * (that field itself is not reused directly — PEH-6's own handoff text
 * names the field `actionRequestLockState`, not `editabilityState`, so this
 * mirrors the handoff's field name with the real contract's value).
 * `dirtyDraftDisposition`/`discarded_for_canonical_action` have no direct
 * real-contract equivalent (checked: `contracts.ts`'s closest analog is
 * `userDirtyState: 'clean' | 'dirty_user_edited' | 'unknown'`, a different
 * shape) — these are genuinely new, extension-originated signals the
 * handoff asks for, same as P7's `hasDirtyAdditionalDetails` was.
 */

export type PeActionRequestType =
  | 'shorter'
  | 'more_thorough'
  | 'more_project_grounded'
  | 'apply_details';

export interface PeActionRequestV1 {
  requestId: string;
  actionType: PeActionRequestType;
  /** Canonical ids only — directional requests never carry dirty textarea text. */
  currentBodyId: string;
  bodyRevision: number;
  /** PEH-6: transmitted explicitly on every request, never inferred by the response side. */
  dirtyDraftDisposition: 'discarded_for_canonical_action' | 'not_applicable';
  /** PEH-6: transmitted explicitly on every request. Only value this loop ever produces. */
  actionRequestLockState: 'locked_action_loading';
  /** `apply_details` only — the ONLY request type carrying visible edited body + details. */
  editedBodyText?: string;
  additionalDetailsText?: string;
}

export type PeActionResponseOutcome =
  | 'accepted_result'
  | 'rejected'
  | 'timeout'
  | 'over_budget'
  | 'fallback';

export interface PeActionResponseV1 {
  requestId: string;
  outcome: PeActionResponseOutcome;
  /** Present and required only when `outcome === 'accepted_result'`. */
  currentBodyId?: string;
  bodyRevision?: number;
  bodyText?: string;
}

export interface PeValidBody {
  currentBodyId: string;
  bodyRevision: number;
  bodyText: string;
}

export interface PeActionLoopState {
  lockState: 'idle' | 'locked_action_loading';
  inFlightRequestId: string | null;
  /** Survives every failed/timed-out/stale response untouched — never cleared speculatively. */
  lastValidBody: PeValidBody;
}

/** Fresh loop state, seeded with whatever body is currently displayed. */
export function createPeActionLoopState(initial: PeValidBody): PeActionLoopState {
  return { lockState: 'idle', inFlightRequestId: null, lastValidBody: initial };
}

export interface PeBuildActionRequestInput {
  requestId: string;
  actionType: PeActionRequestType;
  loopState: PeActionLoopState;
  /** From `pe-events.ts`'s `hasDirtyBodyEdit` (directional) — ignored for `apply_details`. */
  hasDirtyBodyEdit: boolean;
  /** Required, non-blank, for `apply_details` only. */
  editedBodyText?: string;
  additionalDetailsText?: string;
}

export type PeBuildActionRequestResult =
  | { ok: true; request: PeActionRequestV1; nextState: PeActionLoopState }
  | { ok: false; reasonCodes: readonly string[] };

/**
 * Build a typed action request, or reject it. PEH-6 / acceptance:
 * "a duplicate send intent is rejected" — refuses to build a second request
 * while one is already in flight, rather than silently overlapping them.
 */
export function buildPeActionRequest(input: PeBuildActionRequestInput): PeBuildActionRequestResult {
  if (input.loopState.lockState === 'locked_action_loading') {
    return { ok: false, reasonCodes: ['duplicate_send_intent_rejected_action_in_flight'] };
  }
  if (input.actionType === 'apply_details') {
    if (typeof input.editedBodyText !== 'string' || input.editedBodyText.trim().length === 0) {
      return { ok: false, reasonCodes: ['apply_details_requires_edited_body_text'] };
    }
    if (typeof input.additionalDetailsText !== 'string' || input.additionalDetailsText.trim().length === 0) {
      return { ok: false, reasonCodes: ['apply_details_requires_additional_details_text'] };
    }
  }

  const request: PeActionRequestV1 = {
    requestId: input.requestId,
    actionType: input.actionType,
    currentBodyId: input.loopState.lastValidBody.currentBodyId,
    bodyRevision: input.loopState.lastValidBody.bodyRevision,
    dirtyDraftDisposition: input.hasDirtyBodyEdit ? 'discarded_for_canonical_action' : 'not_applicable',
    actionRequestLockState: 'locked_action_loading',
    ...(input.actionType === 'apply_details'
      ? { editedBodyText: input.editedBodyText, additionalDetailsText: input.additionalDetailsText }
      : {}),
  };

  return {
    ok: true,
    request,
    nextState: {
      ...input.loopState,
      lockState: 'locked_action_loading',
      inFlightRequestId: input.requestId,
    },
  };
}

export interface PeApplyActionResponseResult {
  nextState: PeActionLoopState;
  accepted: boolean;
  reasonCodes: readonly string[];
}

/**
 * Apply an incoming response to the loop state. A response whose `requestId`
 * doesn't match the current in-flight request — stale (superseded by a
 * newer request) or a duplicate of an already-settled one — is ignored
 * entirely: `lastValidBody` and `lockState` are left exactly as they were,
 * TRACEABILITY: PEH-DEP-04 (stale never replaces). Recorded as
 * "unconfirmed, needs verification" in the H8 audit; verified 2026-08-11 —
 * implemented here and pinned by `pe-action-loop.test.ts`.
 *
 * satisfying "a stale/superseded result is ignored and never overwrites a
 * newer body." Any non-`accepted_result` outcome (including a
 * structurally-malformed "acceptance") unlocks the loop but leaves
 * `lastValidBody` untouched, satisfying "the previous valid body survives a
 * failed or timed-out action."
 */
export function applyPeActionResponse(
  loopState: PeActionLoopState,
  response: PeActionResponseV1,
): PeApplyActionResponseResult {
  if (response.requestId !== loopState.inFlightRequestId) {
    return {
      nextState: loopState,
      accepted: false,
      reasonCodes: ['stale_or_superseded_response_ignored'],
    };
  }

  const unlocked: PeActionLoopState = { ...loopState, lockState: 'idle', inFlightRequestId: null };

  if (response.outcome !== 'accepted_result') {
    return { nextState: unlocked, accepted: false, reasonCodes: [response.outcome] };
  }
  if (
    typeof response.currentBodyId !== 'string' || response.currentBodyId.length === 0 ||
    typeof response.bodyRevision !== 'number' ||
    typeof response.bodyText !== 'string'
  ) {
    return { nextState: unlocked, accepted: false, reasonCodes: ['malformed_accepted_result_rejected'] };
  }

  return {
    nextState: {
      ...unlocked,
      lastValidBody: {
        currentBodyId: response.currentBodyId,
        bodyRevision: response.bodyRevision,
        bodyText: response.bodyText,
      },
    },
    accepted: true,
    reasonCodes: ['accepted_result_applied'],
  };
}
