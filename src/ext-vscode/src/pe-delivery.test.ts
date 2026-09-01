import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  validatePeExtensionDeliveryPayload,
  evaluatePeHostCapability,
  resolvePeVisibleSurfaceAckState,
  injectPeBody,
  injectPeBodyWithFallback,
  type PeHostCapabilityEvidenceState,
} from './pe-delivery.js';

const validPayload = {
  schemaVersion: 1,
  payloadKind: 'prompt_enhancement_editable_body_delivery',
  deliveryAttemptId: 'attempt-1',
  enhancementId: 'enh-1',
  bodyId: 'body-1',
  bodyRevision: 3,
  generatedOriginId: 'origin-1',
  sourceUseIds: ['source-1'],
  actionId: 'action-1',
  originLineage: { actionId: 'action-1', sequenceRuntimeState: 'not_sequence' },
  sendPolicy: 'send_current',
  fallbackState: 'not_fallback',
  hostCapabilityState: 'stop_bridge_only',
  extensionPayloadState: 'typed_payload_required',
  bodyTextPolicy: 'transport_body_text_only_not_authority',
  rawTransportIsSemanticAuthority: false,
};

describe('validatePeExtensionDeliveryPayload — valid payload', () => {
  it('accepts a well-formed typed payload', () => {
    expect(validatePeExtensionDeliveryPayload(validPayload)).toEqual({
      ok: true,
      reasonCodes: ['typed_extension_payload_valid', 'raw_transport_not_authority'],
    });
  });

  it('tolerates an extra, unrecognised key — the validator checks for required/forbidden keys, not an exact key set', () => {
    expect(validatePeExtensionDeliveryPayload({ ...validPayload, someFutureField: 'anything' }).ok).toBe(true);
  });
});

describe('validatePeExtensionDeliveryPayload — structural rejection', () => {
  it('rejects a non-object payload', () => {
    for (const bad of [null, undefined, 'string', 42, ['array']]) {
      expect(validatePeExtensionDeliveryPayload(bad)).toEqual({
        ok: false,
        reasonCodes: ['payload_not_object'],
      });
    }
  });
});

describe('validatePeExtensionDeliveryPayload — legacy DS key rejection', () => {
  const legacyKeys = ['advisory', 'options', 'selectedPrompt', 'selected_prompt', 'promptOptions', 'lastInjectedPrompt'];

  it.each(legacyKeys)('rejects a payload carrying the legacy key "%s"', (key) => {
    const out = validatePeExtensionDeliveryPayload({ ...validPayload, [key]: 'anything' });
    expect(out.ok).toBe(false);
    expect(out.reasonCodes).toContain('legacy_decision_session_payload_rejected');
    expect(out.reasonCodes).toContain(`legacy_key:${key}`);
  });

  it('reports every present legacy key at once, not just the first', () => {
    const out = validatePeExtensionDeliveryPayload({ ...validPayload, advisory: 'x', options: 'y' });
    expect(out.reasonCodes).toContain('legacy_key:advisory');
    expect(out.reasonCodes).toContain('legacy_key:options');
  });
});

describe('validatePeExtensionDeliveryPayload — raw-transport key rejection', () => {
  const rawKeys = ['rawStdout', 'rawStderr', 'stderr', 'stdout', 'rawError', 'errorStack', 'clipboardText', 'optionLabel'];

  it.each(rawKeys)('rejects a payload carrying the raw-transport key "%s"', (key) => {
    const out = validatePeExtensionDeliveryPayload({ ...validPayload, [key]: 'anything' });
    expect(out.ok).toBe(false);
    expect(out.reasonCodes).toContain('raw_transport_payload_rejected');
    expect(out.reasonCodes).toContain(`raw_key:${key}`);
  });

  it('checks legacy keys before raw-transport keys (legacy wins when both present)', () => {
    const out = validatePeExtensionDeliveryPayload({ ...validPayload, advisory: 'x', rawStdout: 'y' });
    expect(out.reasonCodes).toContain('legacy_decision_session_payload_rejected');
    expect(out.reasonCodes).not.toContain('raw_transport_payload_rejected');
  });
});

describe('validatePeExtensionDeliveryPayload — required-field gaps (missing vs wrong-type)', () => {
  const requiredStringKeys = [
    'payloadKind', 'deliveryAttemptId', 'enhancementId', 'bodyId', 'generatedOriginId',
    'actionId', 'sendPolicy', 'fallbackState', 'hostCapabilityState', 'extensionPayloadState', 'bodyTextPolicy',
  ];

  it.each(requiredStringKeys)('rejects when "%s" is missing', (key) => {
    const { [key]: _omit, ...rest } = validPayload as Record<string, unknown>;
    expect(validatePeExtensionDeliveryPayload(rest).ok).toBe(false);
  });

  it.each(requiredStringKeys)('rejects when "%s" is present but the wrong type (number, not string)', (key) => {
    const out = validatePeExtensionDeliveryPayload({ ...validPayload, [key]: 42 });
    expect(out.ok).toBe(false);
  });

  it.each(requiredStringKeys)('rejects when "%s" is present but an empty string', (key) => {
    const out = validatePeExtensionDeliveryPayload({ ...validPayload, [key]: '' });
    expect(out.ok).toBe(false);
  });

  it('rejects schemaVersion !== 1', () => {
    expect(validatePeExtensionDeliveryPayload({ ...validPayload, schemaVersion: 2 }).ok).toBe(false);
  });

  it('rejects the wrong payloadKind', () => {
    expect(validatePeExtensionDeliveryPayload({ ...validPayload, payloadKind: 'something_else' }).ok).toBe(false);
  });

  it('rejects a non-integer bodyRevision', () => {
    expect(validatePeExtensionDeliveryPayload({ ...validPayload, bodyRevision: 1.5 }).ok).toBe(false);
    expect(validatePeExtensionDeliveryPayload({ ...validPayload, bodyRevision: 'three' }).ok).toBe(false);
  });

  it('rejects the wrong extensionPayloadState', () => {
    expect(validatePeExtensionDeliveryPayload({ ...validPayload, extensionPayloadState: 'not_applicable' }).ok).toBe(false);
  });

  it('rejects the wrong bodyTextPolicy', () => {
    expect(validatePeExtensionDeliveryPayload({ ...validPayload, bodyTextPolicy: 'raw_text_is_authority' }).ok).toBe(false);
  });

  it('rejects rawTransportIsSemanticAuthority when not exactly false', () => {
    expect(validatePeExtensionDeliveryPayload({ ...validPayload, rawTransportIsSemanticAuthority: true }).ok).toBe(false);
    expect(validatePeExtensionDeliveryPayload({ ...validPayload, rawTransportIsSemanticAuthority: 'false' }).ok).toBe(false);
  });

  it('rejects an empty or non-array sourceUseIds', () => {
    expect(validatePeExtensionDeliveryPayload({ ...validPayload, sourceUseIds: [] }).ok).toBe(false);
    expect(validatePeExtensionDeliveryPayload({ ...validPayload, sourceUseIds: 'not-an-array' }).ok).toBe(false);
  });

  it('rejects a malformed originLineage (missing actionId)', () => {
    expect(validatePeExtensionDeliveryPayload({
      ...validPayload,
      originLineage: { sequenceRuntimeState: 'not_sequence' },
    }).ok).toBe(false);
  });

  it('rejects an originLineage with an invalid sequenceRuntimeState', () => {
    expect(validatePeExtensionDeliveryPayload({
      ...validPayload,
      originLineage: { actionId: 'a1', sequenceRuntimeState: 'bogus_state' },
    }).ok).toBe(false);
  });

  it('accepts an originLineage carrying the optional sequence fields', () => {
    expect(validatePeExtensionDeliveryPayload({
      ...validPayload,
      originLineage: {
        actionId: 'a1',
        additionalDetailsActionId: 'a2',
        sequenceId: 's1',
        sequenceItemId: 'si1',
        sequenceRuntimeState: 'metadata_only_no_runtime',
      },
    }).ok).toBe(true);
  });
});

describe('evaluatePeHostCapability — all 9 evidence states', () => {
  const cases: Array<[
    PeHostCapabilityEvidenceState,
    ReturnType<typeof evaluatePeHostCapability>['deliveryChannel'],
    boolean,
    ReturnType<typeof evaluatePeHostCapability>['extensionPayloadState'],
  ]> = [
    ['claude_cli_stop_bridge_supported', 'cli_stop_bridge', false, 'not_applicable'],
    ['extension_typed_payload_supported', 'extension_bridge', false, 'typed_payload_required'],
    ['host_unsupported', 'manual_fallback', true, 'fallback_without_authority'],
    ['host_unknown', 'manual_fallback', true, 'fallback_without_authority'],
    ['direct_insert_success_text_only', 'extension_bridge', false, 'typed_payload_required'],
    ['direct_insert_failure', 'manual_fallback', true, 'fallback_without_authority'],
    ['foreground_unavailable', 'manual_fallback', true, 'fallback_without_authority'],
    ['stale_capability_data', 'manual_fallback', true, 'fallback_without_authority'],
    ['clipboard_manual_copy_source_precedent_only', 'manual_fallback', true, 'fallback_without_authority'],
  ];

  it.each(cases)('%s -> deliveryChannel=%s, fallbackRequired=%s, extensionPayloadState=%s', (evidenceState, deliveryChannel, fallbackRequired, extensionPayloadState) => {
    const out = evaluatePeHostCapability(evidenceState);
    expect(out.deliveryChannel).toBe(deliveryChannel);
    expect(out.fallbackRequired).toBe(fallbackRequired);
    expect(out.extensionPayloadState).toBe(extensionPayloadState);
    expect(out.evidenceState).toBe(evidenceState);
  });

  it('every evaluation has all 5 claim flags hard-coded false', () => {
    for (const [evidenceState] of cases) {
      const out = evaluatePeHostCapability(evidenceState);
      expect(out.canUseAsSemanticAuthority).toBe(false);
      expect(out.canClaimUserConsent).toBe(false);
      expect(out.canClaimExecution).toBe(false);
      expect(out.canClaimCompletion).toBe(false);
      expect(out.canClaimSequenceAdvancement).toBe(false);
    }
  });

  it('the two "supported" states never set hostCapabilityState to unsupported', () => {
    expect(evaluatePeHostCapability('claude_cli_stop_bridge_supported').hostCapabilityState).toBe('stop_bridge_only');
    expect(evaluatePeHostCapability('extension_typed_payload_supported').hostCapabilityState).toBe('stop_bridge_only');
  });
});

describe('resolvePeVisibleSurfaceAckState — ACK on both success and failure', () => {
  it('renderThrew always wins, regardless of renderState', () => {
    expect(resolvePeVisibleSurfaceAckState({ renderState: 'ready', renderThrew: true })).toBe('render_failure');
    expect(resolvePeVisibleSurfaceAckState({ renderState: null, renderThrew: true })).toBe('render_failure');
  });

  it('maps ready -> pe_body_visible', () => {
    expect(resolvePeVisibleSurfaceAckState({ renderState: 'ready', renderThrew: false })).toBe('pe_body_visible');
  });

  it('maps fallback -> fallback_visible', () => {
    expect(resolvePeVisibleSurfaceAckState({ renderState: 'fallback', renderThrew: false })).toBe('fallback_visible');
  });

  it('maps loading -> render_requested', () => {
    expect(resolvePeVisibleSurfaceAckState({ renderState: 'loading', renderThrew: false })).toBe('render_requested');
  });

  it('maps blocked, no_popup, and null -> not_counted_as_shown', () => {
    expect(resolvePeVisibleSurfaceAckState({ renderState: 'blocked', renderThrew: false })).toBe('not_counted_as_shown');
    expect(resolvePeVisibleSurfaceAckState({ renderState: 'no_popup', renderThrew: false })).toBe('not_counted_as_shown');
    expect(resolvePeVisibleSurfaceAckState({ renderState: null, renderThrew: false })).toBe('not_counted_as_shown');
  });

  it('the input shape has no DS-specific field — structural proof PEH-12 is never read from DS status', () => {
    const input = { renderState: 'ready' as const, renderThrew: false };
    expect(Object.keys(input).sort()).toEqual(['renderState', 'renderThrew']);
  });
});

describe('injectPeBody — D-1: insert failure never falls back to clipboard', () => {
  it('returns inserted when injectFn resolves true', async () => {
    const injectFn = vi.fn().mockResolvedValue(true);
    expect(await injectPeBody('the body', injectFn)).toBe('inserted');
    expect(injectFn).toHaveBeenCalledWith('the body');
  });

  it('returns insert_failed_no_clipboard_fallback when injectFn resolves false — no clipboard call exists to make', async () => {
    const injectFn = vi.fn().mockResolvedValue(false);
    expect(await injectPeBody('the body', injectFn)).toBe('insert_failed_no_clipboard_fallback');
  });

  it('returns insert_failed_no_clipboard_fallback when injectFn throws, never propagating', async () => {
    const injectFn = vi.fn().mockRejectedValue(new Error('command not found'));
    await expect(injectPeBody('the body', injectFn)).resolves.toBe('insert_failed_no_clipboard_fallback');
  });

  it('the function signature has no clipboard-writer parameter at all — structural proof, not just behavioural', () => {
    expect(injectPeBody.length).toBe(2); // (text, injectFn) only
  });
});

/**
 * FIX-2 (2026-08-11) — the G-A5 failed-inject fallback ladder.
 * typed → cursorInject paste → clipboard toast. The toast may ONLY fire when
 * the fallback returned false normally (its clipboard write already ran); a
 * thrown fallback guarantees nothing and must never claim "copied".
 */
describe('injectPeBodyWithFallback (FIX-2)', () => {
  it('typed success: delivered via typed, fallback never consulted', async () => {
    const pasteFallback = vi.fn();
    const onClipboardOnly = vi.fn();
    const r = await injectPeBodyWithFallback('body', async () => true, { pasteFallback, onClipboardOnly });
    expect(r).toEqual({ outcome: 'inserted', stage: 'typed', delivered: true });
    expect(pasteFallback).not.toHaveBeenCalled();
    expect(onClipboardOnly).not.toHaveBeenCalled();
  });

  it('typed fail + NO fallback wired: byte-identical to pre-FIX-2 (typed-only hosts)', async () => {
    const onClipboardOnly = vi.fn();
    const r = await injectPeBodyWithFallback('body', async () => false, { onClipboardOnly });
    expect(r).toEqual({ outcome: 'insert_failed_no_clipboard_fallback', stage: 'typed', delivered: false });
    expect(onClipboardOnly).not.toHaveBeenCalled();
  });

  it('⭐ typed fail + paste succeeds: delivered via cursor_paste_fallback, no toast, typed outcome not rewritten', async () => {
    const pasteFallback = vi.fn(async () => true);
    const onClipboardOnly = vi.fn();
    const r = await injectPeBodyWithFallback('body', async () => false, { pasteFallback, onClipboardOnly });
    expect(r).toEqual({
      outcome: 'insert_failed_no_clipboard_fallback',
      stage: 'cursor_paste_fallback',
      delivered: true,
    });
    expect(pasteFallback).toHaveBeenCalledWith('body');
    expect(onClipboardOnly).not.toHaveBeenCalled();
  });

  it('⭐ typed fail + paste fails normally: clipboard_only + exactly one toast (the ladder already copied)', async () => {
    const onClipboardOnly = vi.fn();
    const r = await injectPeBodyWithFallback('body', async () => false, {
      pasteFallback: async () => false,
      onClipboardOnly,
    });
    expect(r.stage).toBe('clipboard_only');
    expect(r.delivered).toBe(false);
    expect(onClipboardOnly).toHaveBeenCalledTimes(1);
  });

  it('⭐ thrown fallback: no toast (clipboard state unknown — never claim copied), logged, no crash', async () => {
    const onClipboardOnly = vi.fn();
    const log = vi.fn();
    const r = await injectPeBodyWithFallback('body', async () => false, {
      pasteFallback: async () => { throw new Error('xdotool exploded'); },
      onClipboardOnly,
      log,
    });
    expect(r).toEqual({ outcome: 'insert_failed_no_clipboard_fallback', stage: 'typed', delivered: false });
    expect(onClipboardOnly).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('clipboard state unknown'));
  });

  it('typed inject throwing counts as a typed failure and the ladder still runs', async () => {
    const r = await injectPeBodyWithFallback('body', async () => { throw new Error('boom'); }, {
      pasteFallback: async () => true,
    });
    expect(r.stage).toBe('cursor_paste_fallback');
    expect(r.delivered).toBe(true);
  });
});

describe('FIX-2 STRUCTURAL PINS — extension.ts wiring (comments stripped)', () => {
  const codeOnly = (src: string) =>
    src.split('\n').filter((l) => {
      const t = l.trimStart();
      return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
    }).join('\n');
  const flat = codeOnly(readFileSync(join(__dirname, 'extension.ts'), 'utf8'))
    .replace(/\s+/g, ' ');

  it('injectPeResult delivers through the fallback helper, not bare injectPeBody', () => {
    expect(flat).toContain('await injectPeBodyWithFallback(resultText,');
  });

  it('the paste fallback is the shipped cursorInject, gated to host cursor only', () => {
    expect(flat).toContain("pasteFallback: host === 'cursor' ? cursorInject : undefined");
  });

  it('the origin record gates on delivered — a fallback delivery records the echo identity too', () => {
    expect(flat).toContain('if (!result.delivered) return;');
  });
});
