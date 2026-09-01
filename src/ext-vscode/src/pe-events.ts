/**
 * PE event routing (P6).
 *
 * Maps the raw webview messages `pe-html.ts`'s embedded script emits into a
 * typed, stable event record — routed from the message's own `type`/
 * `actionType` fields only, never inferred from body text.
 *
 * ARCHITECTURAL NOTE — same constraint P5 found and documented (Gate
 * Register `G-ROOTDIR`): `src/ext-vscode` cannot import anything
 * from `src/prompt-enhancement/**` — verified empirically, any import
 * (type-only or not) fails `tsc` with `TS6059` by transitively reaching the
 * frozen Layer C modules. `PeEventType` below is therefore a LOCAL
 * declaration mirroring `popup-session.ts`'s `PromptEnhancementPopupEventType`
 * member-for-member by name — not an import — for the same reason
 * `pe-payload.ts`'s fields mirror `contracts.ts`'s names without importing
 * them.
 *
 * Scope: the engine handoff lists 20 event categories; the real core
 * type has only 10. This module routes onto those 10 (build against the
 * implemented set, per the dev plan's own instruction while the wider list
 * is unratified). The 5 handoff concepts with no member at all are NOT silently
 * dropped — see {@link UNMAPPED_HANDOFF_CONCEPTS}, published per this
 * phase's acceptance criterion.
 *
 * SEPARATE, more basic limitation worth stating plainly: of the 10 real
 * categories, `pe-html.ts`'s current UI only has controls for 6
 * (`deliver_current_body`, the three directional actions,
 * `submit_additional_details`, `close_no_send`). `use_original`, `edit_body`,
 * `skip_or_reject`, and `explicit_feedback` have no button/control in the
 * rendered HTML at all yet — that is the UI owner's wording to add
 * (per the handoff: "final labels/layout remain UI-owned"), not something
 * this phase invents ahead of the product. {@link routePeWebviewMessage} can
 * therefore only ever produce 6 of the 10 event types until those controls
 * exist; the other 4 remain declared in {@link PeEventType} so the target
 * vocabulary is complete and visible, not hidden.
 */

/** Published per this phase's acceptance criterion — nothing silently dropped. */
export const UNMAPPED_HANDOFF_CONCEPTS = [
  'section_removed_by_edit',
  'all_source_signal_guidance_removed',
  'sequence_feedback_disposition',
  'manual_copy_needed',
  'fallback_used',
] as const;

export type PeEventType =
  | 'deliver_current_body'
  | 'use_original'
  | 'edit_body'
  | 'skip_or_reject'
  | 'request_shorter'
  | 'request_more_thorough'
  | 'request_more_project_grounded'
  | 'submit_additional_details'
  | 'explicit_feedback'
  | 'close_no_send';

export interface PeEventV1 {
  eventType:     PeEventType;
  actionId:      string | null;
  currentBodyId: string;
  bodyRevision:  number;
  editedBodyText?: string;
  additionalDetailsText?: string;
  feedbackCategory?: string;
  /**
   * Only meaningful on `deliver_current_body`: true when the additional-details
   * field had unsubmitted text at the moment the user clicked deliver (P7,
   * the handoff's `dirty_additional_details_requires_apply_or_clear` gate).
   * Computed client-side in `pe-html.ts` — this extension has no other way
   * to observe the field's live dirtiness.
   */
  hasDirtyAdditionalDetails?: boolean;
  /**
   * Only meaningful on the 3 directional event types: true when the body
   * textarea had unsaved manual edits at the moment the user clicked a
   * directional action (P9, the handoff's `dirtyDraftDisposition` requirement —
   * the edit itself is never carried here, only its presence as a boolean;
   * directional requests always use canonical ids, never dirty text).
   * Computed client-side in `pe-html.ts`, same reasoning as
   * `hasDirtyAdditionalDetails` above.
   */
  hasDirtyBodyEdit?: boolean;
  /** True when the message's own bodyId/bodyRevision disagree with the routing context's. Routed, not rejected — P7 gates delivery on this. */
  staleOrMismatched: boolean;
  timestampMs: number;
}

export interface PeEventRoutingContext {
  /** The extension's own record of what body is currently displayed (the last published payload). */
  currentBodyId: string;
  bodyRevision:  number;
  /** Injectable for tests; production omits it and gets the real clock. */
  now?: number;
}

interface RawPeMessage {
  type?: unknown;
  [key: string]: unknown;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function directionalEventTypeFor(actionType: unknown): PeEventType | null {
  if (actionType === 'shorter') return 'request_shorter';
  if (actionType === 'more_thorough') return 'request_more_thorough';
  if (actionType === 'more_project_grounded') return 'request_more_project_grounded';
  return null;
}

/**
 * Route a raw webview message into a typed {@link PeEventV1}, or `null` when
 * the message isn't one of the shapes `pe-html.ts`'s script actually emits.
 * `eventType` and `staleOrMismatched` are decided purely from the message's
 * own typed fields — `editedBodyText`/`additionalDetailsText` are carried
 * for delivery only and never inspected to decide routing.
 */
export function routePeWebviewMessage(
  raw: unknown,
  ctx: PeEventRoutingContext,
): PeEventV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const msg = raw as RawPeMessage;
  const timestampMs = ctx.now ?? Date.now();

  const staleAgainst = (bodyId: unknown, bodyRevision: unknown): boolean => {
    if (bodyId !== undefined && bodyId !== ctx.currentBodyId) return true;
    if (bodyRevision !== undefined && bodyRevision !== ctx.bodyRevision) return true;
    return false;
  };

  switch (msg.type) {
    case 'pe_deliver_current_body': {
      if (typeof msg.bodyText !== 'string') return null;
      return {
        eventType: 'deliver_current_body',
        actionId: null,
        currentBodyId: ctx.currentBodyId,
        bodyRevision: ctx.bodyRevision,
        editedBodyText: msg.bodyText,
        hasDirtyAdditionalDetails: msg.hasDirtyAdditionalDetails === true,
        staleOrMismatched: staleAgainst(msg.bodyId, msg.bodyRevision),
        timestampMs,
      };
    }
    case 'pe_close': {
      return {
        eventType: 'close_no_send',
        actionId: isNonEmptyString(msg.actionId) ? msg.actionId : null,
        currentBodyId: ctx.currentBodyId,
        bodyRevision: ctx.bodyRevision,
        staleOrMismatched: false,
        timestampMs,
      };
    }
    case 'pe_directional_action': {
      const eventType = directionalEventTypeFor(msg.actionType);
      if (!eventType) return null;
      return {
        eventType,
        actionId: isNonEmptyString(msg.actionId) ? msg.actionId : null,
        currentBodyId: ctx.currentBodyId,
        bodyRevision: ctx.bodyRevision,
        hasDirtyBodyEdit: msg.hasDirtyBodyEdit === true,
        staleOrMismatched: staleAgainst(msg.bodyId, msg.bodyRevision),
        timestampMs,
      };
    }
    case 'pe_submit_additional_details': {
      if (typeof msg.additionalDetailsText !== 'string') return null;
      return {
        eventType: 'submit_additional_details',
        actionId: null,
        currentBodyId: ctx.currentBodyId,
        bodyRevision: ctx.bodyRevision,
        additionalDetailsText: msg.additionalDetailsText,
        // P9 (per the handoff): Apply carries the current visible edited body
        // alongside the details — the only event type that does. Optional/
        // defensive (never rejects the whole event over it) matching this
        // module's established tolerance for malformed optional fields.
        editedBodyText: typeof msg.bodyText === 'string' ? msg.bodyText : undefined,
        staleOrMismatched: staleAgainst(msg.bodyId, msg.bodyRevision),
        timestampMs,
      };
    }
    default:
      return null;
  }
}

/**
 * Redacted, loggable summary of a {@link PeEventV1} — extends the P1
 * invariant (Stop `reason`/delivery body is delivery-only, never logged) to
 * PE events. Never includes `editedBodyText`/`additionalDetailsText`/
 * `feedbackCategory` content, only their presence as booleans, plus
 * ids/enums/counts. This is what any future logging/telemetry call site
 * (P8, P11) must consume — never the raw {@link PeEventV1} itself.
 */
export interface SafePeEventRecord {
  eventType:     PeEventType;
  actionId:      string | null;
  currentBodyId: string;
  bodyRevision:  number;
  hasEditedBody: boolean;
  hasAdditionalDetails: boolean;
  hasFeedbackCategory:  boolean;
  staleOrMismatched: boolean;
  timestampMs: number;
}

export function describePeEventSafely(event: PeEventV1): SafePeEventRecord {
  return {
    eventType: event.eventType,
    actionId: event.actionId,
    currentBodyId: event.currentBodyId,
    bodyRevision: event.bodyRevision,
    hasEditedBody: typeof event.editedBodyText === 'string' && event.editedBodyText.length > 0,
    hasAdditionalDetails: typeof event.additionalDetailsText === 'string' && event.additionalDetailsText.length > 0,
    hasFeedbackCategory: typeof event.feedbackCategory === 'string' && event.feedbackCategory.length > 0,
    staleOrMismatched: event.staleOrMismatched,
    timestampMs: event.timestampMs,
  };
}
