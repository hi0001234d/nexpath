import { describe, it, expect } from 'vitest';
import {
  routePeWebviewMessage,
  describePeEventSafely,
  UNMAPPED_HANDOFF_CONCEPTS,
  type PeEventV1,
} from './pe-events.js';

const ctx = { currentBodyId: 'body-1', bodyRevision: 3, now: 1700000000000 };

describe('routePeWebviewMessage — malformed input', () => {
  it('returns null for non-object input', () => {
    expect(routePeWebviewMessage(null, ctx)).toBeNull();
    expect(routePeWebviewMessage(undefined, ctx)).toBeNull();
    expect(routePeWebviewMessage('a string', ctx)).toBeNull();
    expect(routePeWebviewMessage(42, ctx)).toBeNull();
  });

  it('returns null for an unknown message type', () => {
    expect(routePeWebviewMessage({ type: 'bogus_type' }, ctx)).toBeNull();
  });

  it('returns null when type is missing entirely', () => {
    expect(routePeWebviewMessage({ bodyId: 'body-1' }, ctx)).toBeNull();
  });
});

describe('routePeWebviewMessage — pe_deliver_current_body', () => {
  it('routes to deliver_current_body carrying the edited body text', () => {
    const out = routePeWebviewMessage(
      { type: 'pe_deliver_current_body', bodyId: 'body-1', bodyRevision: 3, bodyText: 'edited body' },
      ctx,
    );
    expect(out).toEqual({
      eventType: 'deliver_current_body',
      actionId: null,
      currentBodyId: 'body-1',
      bodyRevision: 3,
      editedBodyText: 'edited body',
      hasDirtyAdditionalDetails: false,
      staleOrMismatched: false,
      timestampMs: 1700000000000,
    });
  });

  it('returns null when bodyText is missing (proves it never falls back to text-inference)', () => {
    expect(routePeWebviewMessage({ type: 'pe_deliver_current_body', bodyId: 'body-1', bodyRevision: 3 }, ctx)).toBeNull();
  });

  it('returns null when bodyText is present but not a string (proves a real typeof check, not just truthiness)', () => {
    expect(routePeWebviewMessage({ type: 'pe_deliver_current_body', bodyId: 'body-1', bodyRevision: 3, bodyText: 12345 }, ctx)).toBeNull();
  });

  it('carries hasDirtyAdditionalDetails: true through when the message says so (P7 gate signal)', () => {
    const out = routePeWebviewMessage(
      { type: 'pe_deliver_current_body', bodyId: 'body-1', bodyRevision: 3, bodyText: 'x', hasDirtyAdditionalDetails: true },
      ctx,
    );
    expect(out?.hasDirtyAdditionalDetails).toBe(true);
  });

  it('defaults hasDirtyAdditionalDetails to false when omitted or not exactly true (defensive === true check)', () => {
    expect(routePeWebviewMessage({ type: 'pe_deliver_current_body', bodyId: 'body-1', bodyRevision: 3, bodyText: 'x' }, ctx)?.hasDirtyAdditionalDetails).toBe(false);
    expect(routePeWebviewMessage({ type: 'pe_deliver_current_body', bodyId: 'body-1', bodyRevision: 3, bodyText: 'x', hasDirtyAdditionalDetails: 'true' }, ctx)?.hasDirtyAdditionalDetails).toBe(false);
    expect(routePeWebviewMessage({ type: 'pe_deliver_current_body', bodyId: 'body-1', bodyRevision: 3, bodyText: 'x', hasDirtyAdditionalDetails: 1 }, ctx)?.hasDirtyAdditionalDetails).toBe(false);
  });

  it('flags staleOrMismatched when the message bodyId disagrees with the context', () => {
    const out = routePeWebviewMessage(
      { type: 'pe_deliver_current_body', bodyId: 'stale-body', bodyRevision: 3, bodyText: 'x' },
      ctx,
    );
    expect(out?.staleOrMismatched).toBe(true);
    // the returned event still carries the CONTEXT's current id, never the stale message's
    expect(out?.currentBodyId).toBe('body-1');
  });

  it('flags staleOrMismatched when the message bodyRevision disagrees with the context', () => {
    const out = routePeWebviewMessage(
      { type: 'pe_deliver_current_body', bodyId: 'body-1', bodyRevision: 1, bodyText: 'x' },
      ctx,
    );
    expect(out?.staleOrMismatched).toBe(true);
  });

  it('does not flag staleOrMismatched when the message omits bodyId/bodyRevision entirely (distinct from present-but-different)', () => {
    const out = routePeWebviewMessage({ type: 'pe_deliver_current_body', bodyText: 'x' }, ctx);
    expect(out?.staleOrMismatched).toBe(false);
  });
});

describe('routePeWebviewMessage — pe_directional_action', () => {
  it('routes shorter/more_thorough/more_project_grounded to their own event types', () => {
    expect(routePeWebviewMessage({ type: 'pe_directional_action', actionType: 'shorter', actionId: 'a1', bodyId: 'body-1', bodyRevision: 3 }, ctx)?.eventType).toBe('request_shorter');
    expect(routePeWebviewMessage({ type: 'pe_directional_action', actionType: 'more_thorough', actionId: 'a2', bodyId: 'body-1', bodyRevision: 3 }, ctx)?.eventType).toBe('request_more_thorough');
    expect(routePeWebviewMessage({ type: 'pe_directional_action', actionType: 'more_project_grounded', actionId: 'a3', bodyId: 'body-1', bodyRevision: 3 }, ctx)?.eventType).toBe('request_more_project_grounded');
  });

  it('returns null for an unrecognised actionType', () => {
    expect(routePeWebviewMessage({ type: 'pe_directional_action', actionType: 'bogus', actionId: 'a1' }, ctx)).toBeNull();
  });

  it('carries the actionId through', () => {
    const out = routePeWebviewMessage({ type: 'pe_directional_action', actionType: 'shorter', actionId: 'a-shorter', bodyId: 'body-1', bodyRevision: 3 }, ctx);
    expect(out?.actionId).toBe('a-shorter');
  });

  it('actionId is null when absent or empty', () => {
    expect(routePeWebviewMessage({ type: 'pe_directional_action', actionType: 'shorter' }, ctx)?.actionId).toBeNull();
    expect(routePeWebviewMessage({ type: 'pe_directional_action', actionType: 'shorter', actionId: '' }, ctx)?.actionId).toBeNull();
  });

  it('flags staleOrMismatched from bodyId/bodyRevision like deliver_current_body does', () => {
    const out = routePeWebviewMessage({ type: 'pe_directional_action', actionType: 'shorter', bodyId: 'body-1', bodyRevision: 99 }, ctx);
    expect(out?.staleOrMismatched).toBe(true);
  });

  it('carries hasDirtyBodyEdit: true through when the message says so (P9 action-loop signal)', () => {
    const out = routePeWebviewMessage(
      { type: 'pe_directional_action', actionType: 'shorter', bodyId: 'body-1', bodyRevision: 3, hasDirtyBodyEdit: true },
      ctx,
    );
    expect(out?.hasDirtyBodyEdit).toBe(true);
  });

  it('defaults hasDirtyBodyEdit to false when omitted or not exactly true (defensive === true check)', () => {
    expect(routePeWebviewMessage({ type: 'pe_directional_action', actionType: 'shorter', bodyId: 'body-1', bodyRevision: 3 }, ctx)?.hasDirtyBodyEdit).toBe(false);
    expect(routePeWebviewMessage({ type: 'pe_directional_action', actionType: 'shorter', bodyId: 'body-1', bodyRevision: 3, hasDirtyBodyEdit: 'true' }, ctx)?.hasDirtyBodyEdit).toBe(false);
    expect(routePeWebviewMessage({ type: 'pe_directional_action', actionType: 'shorter', bodyId: 'body-1', bodyRevision: 3, hasDirtyBodyEdit: 1 }, ctx)?.hasDirtyBodyEdit).toBe(false);
  });
});

describe('routePeWebviewMessage — pe_close', () => {
  it('routes to close_no_send, never stale-checked (no body edit implied)', () => {
    const out = routePeWebviewMessage({ type: 'pe_close', actionId: 'a-close' }, ctx);
    expect(out).toEqual({
      eventType: 'close_no_send',
      actionId: 'a-close',
      currentBodyId: 'body-1',
      bodyRevision: 3,
      staleOrMismatched: false,
      timestampMs: 1700000000000,
    });
  });

  it('actionId is null when absent or empty (payload.closeActionId was null)', () => {
    expect(routePeWebviewMessage({ type: 'pe_close' }, ctx)?.actionId).toBeNull();
    expect(routePeWebviewMessage({ type: 'pe_close', actionId: '' }, ctx)?.actionId).toBeNull();
  });
});

describe('routePeWebviewMessage — pe_submit_additional_details', () => {
  it('routes to submit_additional_details carrying the details text', () => {
    const out = routePeWebviewMessage(
      { type: 'pe_submit_additional_details', bodyId: 'body-1', bodyRevision: 3, additionalDetailsText: 'extra context' },
      ctx,
    );
    expect(out).toEqual({
      eventType: 'submit_additional_details',
      actionId: null,
      currentBodyId: 'body-1',
      bodyRevision: 3,
      additionalDetailsText: 'extra context',
      staleOrMismatched: false,
      timestampMs: 1700000000000,
    });
  });

  it('returns null when additionalDetailsText is missing', () => {
    expect(routePeWebviewMessage({ type: 'pe_submit_additional_details', bodyId: 'body-1', bodyRevision: 3 }, ctx)).toBeNull();
  });

  it('returns null when additionalDetailsText is present but not a string (proves a real typeof check, not just truthiness)', () => {
    expect(routePeWebviewMessage({ type: 'pe_submit_additional_details', bodyId: 'body-1', bodyRevision: 3, additionalDetailsText: 12345 }, ctx)).toBeNull();
  });

  it('flags staleOrMismatched consistently with the other message types', () => {
    const out = routePeWebviewMessage(
      { type: 'pe_submit_additional_details', bodyId: 'wrong-body', bodyRevision: 3, additionalDetailsText: 'x' },
      ctx,
    );
    expect(out?.staleOrMismatched).toBe(true);
  });

  it('carries editedBodyText from the message\'s bodyText field (P9: the current visible edited body)', () => {
    const out = routePeWebviewMessage(
      { type: 'pe_submit_additional_details', bodyId: 'body-1', bodyRevision: 3, additionalDetailsText: 'extra context', bodyText: 'the visible edited body' },
      ctx,
    );
    expect(out?.editedBodyText).toBe('the visible edited body');
  });

  it('editedBodyText is undefined when bodyText is absent or not a string (defensive, does not reject the whole event)', () => {
    expect(routePeWebviewMessage(
      { type: 'pe_submit_additional_details', bodyId: 'body-1', bodyRevision: 3, additionalDetailsText: 'x' },
      ctx,
    )?.editedBodyText).toBeUndefined();
    const wrongType = routePeWebviewMessage(
      { type: 'pe_submit_additional_details', bodyId: 'body-1', bodyRevision: 3, additionalDetailsText: 'x', bodyText: 12345 },
      ctx,
    );
    expect(wrongType?.editedBodyText).toBeUndefined();
    expect(wrongType?.additionalDetailsText).toBe('x'); // the rest of the event still routes normally
  });
});

describe('routePeWebviewMessage — uses the real clock when ctx.now is omitted', () => {
  it('produces a timestampMs close to Date.now()', () => {
    const before = Date.now();
    const out = routePeWebviewMessage({ type: 'pe_close' }, { currentBodyId: 'b', bodyRevision: 1 });
    const after = Date.now();
    expect(out?.timestampMs).toBeGreaterThanOrEqual(before);
    expect(out?.timestampMs).toBeLessThanOrEqual(after);
  });
});

describe('UNMAPPED_HANDOFF_CONCEPTS', () => {
  it('publishes all 5 concepts the core has no event member for (nothing silently dropped)', () => {
    expect(UNMAPPED_HANDOFF_CONCEPTS).toEqual([
      'section_removed_by_edit',
      'all_source_signal_guidance_removed',
      'sequence_feedback_disposition',
      'manual_copy_needed',
      'fallback_used',
    ]);
  });
});

describe('describePeEventSafely — raw-text leak test (PEH-9 extended to PE events)', () => {
  const MARKER = 'ZZQX_PE_EVENT_LEAK_MARKER_9182';

  it('never includes the raw editedBodyText content, only its presence', () => {
    const event: PeEventV1 = {
      eventType: 'deliver_current_body',
      actionId: null,
      currentBodyId: 'body-1',
      bodyRevision: 3,
      editedBodyText: MARKER,
      staleOrMismatched: false,
      timestampMs: 1700000000000,
    };
    const safe = describePeEventSafely(event);
    expect(JSON.stringify(safe)).not.toContain(MARKER);
    expect(safe.hasEditedBody).toBe(true);
  });

  it('never includes the raw additionalDetailsText content, only its presence', () => {
    const event: PeEventV1 = {
      eventType: 'submit_additional_details',
      actionId: null,
      currentBodyId: 'body-1',
      bodyRevision: 3,
      additionalDetailsText: MARKER,
      staleOrMismatched: false,
      timestampMs: 1700000000000,
    };
    const safe = describePeEventSafely(event);
    expect(JSON.stringify(safe)).not.toContain(MARKER);
    expect(safe.hasAdditionalDetails).toBe(true);
  });

  it('never includes the raw feedbackCategory content, only its presence', () => {
    const event: PeEventV1 = {
      eventType: 'explicit_feedback',
      actionId: null,
      currentBodyId: 'body-1',
      bodyRevision: 3,
      feedbackCategory: MARKER,
      staleOrMismatched: false,
      timestampMs: 1700000000000,
    };
    const safe = describePeEventSafely(event);
    expect(JSON.stringify(safe)).not.toContain(MARKER);
    expect(safe.hasFeedbackCategory).toBe(true);
  });

  it('reports false for all three text-presence flags when none are set', () => {
    const event: PeEventV1 = {
      eventType: 'close_no_send',
      actionId: 'a-close',
      currentBodyId: 'body-1',
      bodyRevision: 3,
      staleOrMismatched: false,
      timestampMs: 1700000000000,
    };
    const safe = describePeEventSafely(event);
    expect(safe.hasEditedBody).toBe(false);
    expect(safe.hasAdditionalDetails).toBe(false);
    expect(safe.hasFeedbackCategory).toBe(false);
  });

  it('treats an empty-string text field as absent, not present', () => {
    const event: PeEventV1 = {
      eventType: 'deliver_current_body',
      actionId: null,
      currentBodyId: 'body-1',
      bodyRevision: 3,
      editedBodyText: '',
      staleOrMismatched: false,
      timestampMs: 1700000000000,
    };
    expect(describePeEventSafely(event).hasEditedBody).toBe(false);
  });

  it('carries only ids/enums/counts/booleans through — no unexpected extra keys', () => {
    const event: PeEventV1 = {
      eventType: 'deliver_current_body',
      actionId: 'a1',
      currentBodyId: 'body-1',
      bodyRevision: 3,
      editedBodyText: MARKER,
      staleOrMismatched: true,
      timestampMs: 1700000000000,
    };
    const safe = describePeEventSafely(event);
    expect(Object.keys(safe).sort()).toEqual([
      'actionId',
      'bodyRevision',
      'currentBodyId',
      'eventType',
      'hasAdditionalDetails',
      'hasEditedBody',
      'hasFeedbackCategory',
      'staleOrMismatched',
      'timestampMs',
    ]);
  });
});
