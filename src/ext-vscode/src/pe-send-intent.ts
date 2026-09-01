/**
 * PE send-intent gating (P7, PEH-7).
 *
 * Gates delivery on the 4 rejection reasons this phase's own acceptance
 * criteria name — `current_body_not_sendable`, `current_body_not_editable`,
 * `dirty_additional_details_requires_apply_or_clear`,
 * `stale_or_mismatched_send_identity` — computed from typed state only,
 * never from HTML escaping, clipboard success, or insertion success (none
 * of those are even inputs to this function).
 *
 * ARCHITECTURAL NOTE — same `G-ROOTDIR` constraint already found for P5/P6.
 * The real gate lives in `src/prompt-enhancement/send-intent.ts`
 * (`buildPromptEnhancementSendIntentV1`); it cannot be imported — verified
 * empirically, the same `tsc` `TS6059` wall via `popup-session.ts`. Read in
 * full to mirror its behaviour faithfully rather than guess:
 * `current_body_not_sendable` checks `session.sendabilityState !==
 * 'send_current'`, `current_body_not_editable` checks
 * `session.preSendBoundaryState.editabilityState !== 'editable'`,
 * `dirty_additional_details_requires_apply_or_clear` checks
 * `session.additionalDetailsState === 'dirty_unsubmitted'`, and
 * `stale_or_mismatched_send_identity` checks the event's bodyId/bodyRevision
 * against the session's.
 *
 * This module mirrors ONLY those four, using the typed state this extension
 * actually holds: `pe-payload.ts`'s `sendPolicy`/`renderState` (this
 * extension's own analogs of `sendabilityState`/`editabilityState`, already
 * built the same way for the same reason) and `pe-events.ts`'s
 * `staleOrMismatched`. It deliberately does NOT replicate the real
 * `send-intent.ts`'s other reasons (`duplicate_send_intent`,
 * `not_real_user_initiated`, `invalid_send_intent_timestamp`,
 * `missing_send_action_id`, `blockedLifecycleStates`, full
 * `validationDecisionId` identity matching) — those need session/identity
 * data this extension does not have yet (no action loop exists until P9),
 * and P7's own acceptance criteria don't name them. Inventing them now would
 * be guessing at content/identity semantics this milestone doesn't own,
 * not gating on typed state actually held.
 *
 * `dirty_additional_details_requires_apply_or_clear` needed a new signal
 * this extension didn't have before: whether the additional-details field
 * has unsubmitted text at the moment "deliver" is clicked. The real
 * `additionalDetailsState` enum lives entirely server-side and this
 * extension cannot read it (no action loop yet) — so `pe-html.ts`'s script
 * and `pe-events.ts`'s routing were extended to carry a client-computed
 * `hasDirtyAdditionalDetails` boolean alongside `deliver_current_body`,
 * capturing only the one state value (`dirty_unsubmitted`) this phase's
 * single named reason actually needs — not the richer real enum's other
 * values (`submitted_merging`, `merged_preview_ready`, etc.), which belong
 * to P9's action loop.
 */

import type { PePromptSendPolicy, PeRenderState } from './pe-payload.js';

export type PeSendIntentRejectionReason =
  | 'current_body_not_sendable'
  | 'current_body_not_editable'
  | 'dirty_additional_details_requires_apply_or_clear'
  | 'stale_or_mismatched_send_identity';

export type PeSendIntentResult =
  | { state: 'intent_ready' }
  | { state: 'no_intent'; reasonCodes: readonly PeSendIntentRejectionReason[] };

export interface PeSendIntentInput {
  sendPolicy: PePromptSendPolicy;
  renderState: PeRenderState;
  staleOrMismatched: boolean;
  hasDirtyAdditionalDetails: boolean;
}

/**
 * Resolve whether a `deliver_current_body` event may proceed to delivery.
 * Pure function of typed state — no HTML/clipboard/insertion input exists on
 * this signature, so none of those can ever influence the result.
 */
export function resolvePeSendIntent(input: PeSendIntentInput): PeSendIntentResult {
  const reasons: PeSendIntentRejectionReason[] = [];
  if (input.sendPolicy !== 'send_current') reasons.push('current_body_not_sendable');
  if (input.renderState !== 'ready') reasons.push('current_body_not_editable');
  if (input.hasDirtyAdditionalDetails) reasons.push('dirty_additional_details_requires_apply_or_clear');
  if (input.staleOrMismatched) reasons.push('stale_or_mismatched_send_identity');

  if (reasons.length > 0) return { state: 'no_intent', reasonCodes: reasons };
  return { state: 'intent_ready' };
}
