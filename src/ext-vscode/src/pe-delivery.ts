/**
 * PE typed delivery: payload validation, host-capability evaluation, and
 * visible-surface ACK (P8, PEH-4 / PEH-12).
 *
 * ARCHITECTURAL NOTE — same `G-ROOTDIR` constraint found for P5/P6/P7. The
 * real `validatePromptEnhancementExtensionDeliveryPayload` and
 * `evaluatePromptEnhancementHostCapability` live in
 * `src/prompt-enhancement/delivery.ts`; the real `PromptEnhancementDeliveryOutcomeKind`-
 * adjacent ACK type (`PromptEnhancementVisibleSurfaceAckState`) lives in
 * `src/prompt-enhancement/popup-session.ts`. Neither can be imported —
 * verified empirically, same `tsc` `TS6059` wall via the frozen Layer C
 * chain. `preparePromptEnhancementStopBridgeDelivery` and
 * `resolvePromptEnhancementPromptSubmitOrigin` (both in `delivery.ts`) are
 * NOT mirrored at all here — both require a `Store` handle, which is a
 * CLI-only, frozen-Layer-C concept this extension never holds (the
 * architectural rule is CLI subprocess/SQLite-read only, never a direct
 * Store import); building the CLI-side typed payload from `stop.ts` is
 * explicitly "not ours — coordinate" per the dev plan.
 *
 * `validatePeExtensionDeliveryPayload` mirrors the real validator's checks
 * field-for-field (same legacy-key list, same raw-transport-key list, same
 * required-string-key list, same structural checks) — this is the
 * validation boundary for whatever typed payload eventually arrives from the
 * CLI side over the existing IPC channel.
 *
 * `evaluatePeHostCapability` mirrors the real switch's 9 cases by name and
 * by outcome, all claim flags hard-coded `false` per the real contract.
 *
 * `PeVisibleSurfaceAckState` mirrors the real 7-member
 * `PromptEnhancementVisibleSurfaceAckState` by name. `resolvePeVisibleSurfaceAckState`
 * is this extension's own decision function — the real type has no
 * corresponding "resolve from these inputs" function to mirror, so this is
 * built from the real state names' own definitions (PEH-12: emit ACK from
 * REAL render/insert outcomes, never from DS `status='shown'`).
 */

export interface PeDeliveryPayloadValidation {
  ok: boolean;
  reasonCodes: readonly string[];
}

const LEGACY_DECISION_SESSION_KEYS = [
  'advisory', 'options', 'selectedPrompt', 'selected_prompt', 'promptOptions', 'lastInjectedPrompt',
] as const;

const RAW_TRANSPORT_KEYS = [
  'rawStdout', 'rawStderr', 'stderr', 'stdout', 'rawError', 'errorStack', 'clipboardText', 'optionLabel',
] as const;

const REQUIRED_STRING_KEYS = [
  'payloadKind', 'deliveryAttemptId', 'enhancementId', 'bodyId', 'generatedOriginId',
  'actionId', 'sendPolicy', 'fallbackState', 'hostCapabilityState', 'extensionPayloadState', 'bodyTextPolicy',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidOriginLineage(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.actionId !== 'string' || value.actionId.length === 0) return false;
  if (
    value.additionalDetailsActionId !== undefined &&
    (typeof value.additionalDetailsActionId !== 'string' || value.additionalDetailsActionId.length === 0)
  ) return false;
  if (value.sequenceId !== undefined && (typeof value.sequenceId !== 'string' || value.sequenceId.length === 0)) return false;
  if (value.sequenceItemId !== undefined && (typeof value.sequenceItemId !== 'string' || value.sequenceItemId.length === 0)) return false;
  return value.sequenceRuntimeState === 'not_sequence' ||
    value.sequenceRuntimeState === 'metadata_only_no_runtime' ||
    value.sequenceRuntimeState === 'future_runtime_gated';
}

/**
 * Validate an incoming typed extension delivery payload. Rejects legacy DS
 * keys and raw-transport keys BEFORE checking anything else — matching the
 * real validator's own ordering — so a payload carrying either never even
 * reaches the required-field checks.
 */
export function validatePeExtensionDeliveryPayload(payload: unknown): PeDeliveryPayloadValidation {
  if (!isRecord(payload)) return { ok: false, reasonCodes: ['payload_not_object'] };

  const presentLegacyKeys = LEGACY_DECISION_SESSION_KEYS.filter((key) => key in payload);
  if (presentLegacyKeys.length > 0) {
    return {
      ok: false,
      reasonCodes: ['legacy_decision_session_payload_rejected', ...presentLegacyKeys.map((key) => `legacy_key:${key}`)],
    };
  }

  const presentRawKeys = RAW_TRANSPORT_KEYS.filter((key) => key in payload);
  if (presentRawKeys.length > 0) {
    return {
      ok: false,
      reasonCodes: ['raw_transport_payload_rejected', ...presentRawKeys.map((key) => `raw_key:${key}`)],
    };
  }

  const missing = REQUIRED_STRING_KEYS.filter(
    (key) => typeof payload[key] !== 'string' || (payload[key] as string).length === 0,
  );
  const invalid =
    payload.schemaVersion !== 1 ||
    payload.payloadKind !== 'prompt_enhancement_editable_body_delivery' ||
    !Number.isInteger(payload.bodyRevision) ||
    payload.extensionPayloadState !== 'typed_payload_required' ||
    payload.bodyTextPolicy !== 'transport_body_text_only_not_authority' ||
    payload.rawTransportIsSemanticAuthority !== false ||
    !Array.isArray(payload.sourceUseIds) ||
    payload.sourceUseIds.length === 0 ||
    !isValidOriginLineage(payload.originLineage);

  if (missing.length > 0 || invalid) {
    return { ok: false, reasonCodes: ['typed_extension_payload_invalid', ...missing.map((key) => `missing:${key}`)] };
  }
  return { ok: true, reasonCodes: ['typed_extension_payload_valid', 'raw_transport_not_authority'] };
}

export type PeHostCapabilityEvidenceState =
  | 'claude_cli_stop_bridge_supported'
  | 'extension_typed_payload_supported'
  | 'host_unsupported'
  | 'host_unknown'
  | 'direct_insert_success_text_only'
  | 'direct_insert_failure'
  | 'foreground_unavailable'
  | 'stale_capability_data'
  | 'clipboard_manual_copy_source_precedent_only';

export interface PeHostCapabilityEvaluation {
  evidenceState: PeHostCapabilityEvidenceState;
  deliveryChannel: 'cli_stop_bridge' | 'extension_bridge' | 'manual_fallback';
  hostCapabilityState: 'stop_bridge_only' | 'unsupported';
  extensionPayloadState: 'not_applicable' | 'typed_payload_required' | 'fallback_without_authority';
  fallbackRequired: boolean;
  canUseAsSemanticAuthority: false;
  canClaimUserConsent: false;
  canClaimExecution: false;
  canClaimCompletion: false;
  canClaimSequenceAdvancement: false;
  reasonCodes: readonly string[];
}

function evaluation(
  evidenceState: PeHostCapabilityEvidenceState,
  deliveryChannel: PeHostCapabilityEvaluation['deliveryChannel'],
  hostCapabilityState: PeHostCapabilityEvaluation['hostCapabilityState'],
  extensionPayloadState: PeHostCapabilityEvaluation['extensionPayloadState'],
  fallbackRequired: boolean,
  reasonCodes: readonly string[],
): PeHostCapabilityEvaluation {
  return {
    evidenceState, deliveryChannel, hostCapabilityState, extensionPayloadState, fallbackRequired,
    canUseAsSemanticAuthority: false,
    canClaimUserConsent: false,
    canClaimExecution: false,
    canClaimCompletion: false,
    canClaimSequenceAdvancement: false,
    reasonCodes,
  };
}

/** Mirrors the real `evaluatePromptEnhancementHostCapability`'s 9-case switch by name and outcome. */
export function evaluatePeHostCapability(evidenceState: PeHostCapabilityEvidenceState): PeHostCapabilityEvaluation {
  switch (evidenceState) {
    case 'claude_cli_stop_bridge_supported':
      return evaluation(evidenceState, 'cli_stop_bridge', 'stop_bridge_only', 'not_applicable', false, [
        'stop_bridge_supported', 'raw_stop_reason_text_only',
      ]);
    case 'extension_typed_payload_supported':
      return evaluation(evidenceState, 'extension_bridge', 'stop_bridge_only', 'typed_payload_required', false, [
        'typed_extension_payload_supported', 'host_evidence_not_semantic_authority',
      ]);
    case 'host_unsupported':
      return evaluation(evidenceState, 'manual_fallback', 'unsupported', 'fallback_without_authority', true, [
        'host_capability_unsupported', 'fallback_without_authority',
      ]);
    case 'host_unknown':
      return evaluation(evidenceState, 'manual_fallback', 'unsupported', 'fallback_without_authority', true, [
        'host_capability_unknown', 'fallback_without_authority',
      ]);
    case 'direct_insert_success_text_only':
      return evaluation(evidenceState, 'extension_bridge', 'stop_bridge_only', 'typed_payload_required', false, [
        'direct_insert_success_text_only', 'insertion_success_not_execution_proof',
      ]);
    case 'direct_insert_failure':
      return evaluation(evidenceState, 'manual_fallback', 'unsupported', 'fallback_without_authority', true, [
        'direct_insert_failed', 'fallback_without_authority',
      ]);
    case 'foreground_unavailable':
      return evaluation(evidenceState, 'manual_fallback', 'unsupported', 'fallback_without_authority', true, [
        'foreground_unavailable', 'foreground_not_visible_acknowledgement',
      ]);
    case 'stale_capability_data':
      return evaluation(evidenceState, 'manual_fallback', 'unsupported', 'fallback_without_authority', true, [
        'stale_capability_data', 'fallback_without_authority',
      ]);
    case 'clipboard_manual_copy_source_precedent_only':
      return evaluation(evidenceState, 'manual_fallback', 'unsupported', 'fallback_without_authority', true, [
        'clipboard_manual_copy_source_precedent_only', 'clipboard_text_not_authority',
      ]);
  }
}

/**
 * Subset of the real 7-member `PromptEnhancementVisibleSurfaceAckState`
 * (`popup-session.ts`) reachable from this extension's own render outcomes.
 */
export type PeVisibleSurfaceAckState =
  | 'render_requested'
  | 'pe_body_visible'
  | 'fallback_visible'
  | 'render_failure'
  | 'not_counted_as_shown';

export interface PeRenderOutcome {
  /** The payload that was (attempted to be) rendered, or `null` for no-popup. */
  renderState: 'ready' | 'loading' | 'fallback' | 'blocked' | 'no_popup' | null;
  /** True when `renderPromptEnhancementHtml` threw or the webview failed to resolve. */
  renderThrew: boolean;
}

/**
 * Resolve the visible-surface ACK from a REAL render outcome — never from DS
 * `status='shown'`/`stop_advisory_shown`/`decision_session_count` (PEH-12's
 * explicit prohibition; this function's signature has no such field to read).
 * Called on both success and failure so an ACK is always emitted either way.
 */
export function resolvePeVisibleSurfaceAckState(outcome: PeRenderOutcome): PeVisibleSurfaceAckState {
  if (outcome.renderThrew) return 'render_failure';
  switch (outcome.renderState) {
    case 'ready': return 'pe_body_visible';
    case 'fallback': return 'fallback_visible';
    case 'loading': return 'render_requested';
    case 'blocked':
    case 'no_popup':
    case null:
      return 'not_counted_as_shown';
  }
}

/**
 * No-clipboard rule (owner-resolved): on insert failure, emit a typed failed outcome —
 * NEVER fall back to the clipboard for a PE body. This is a deliberate,
 * narrower sibling of `prompt-injection.ts`'s `handleOptionSelection`, which
 * DOES fall back to the clipboard for DS options; that function is untouched
 * and still used for the DS path. `injectFn`'s type matches
 * `prompt-injection.ts`'s `OptionInjector` exactly (not imported — this
 * module has no other reason to depend on that file, and the shape is a
 * one-line `(text: string) => Promise<boolean>`).
 */
export type PeInsertOutcome = 'inserted' | 'insert_failed_no_clipboard_fallback';

export async function injectPeBody(
  text: string,
  injectFn: (text: string) => Promise<boolean>,
): Promise<PeInsertOutcome> {
  try {
    const injected = await injectFn(text);
    return injected ? 'inserted' : 'insert_failed_no_clipboard_fallback';
  } catch {
    return 'insert_failed_no_clipboard_fallback';
  }
}

/** Which transport actually carried (or last attempted) the PE body. */
export type PeDeliveryStage = 'typed' | 'cursor_paste_fallback' | 'clipboard_only';

export interface PeFallbackDeliveryResult {
  /** The TYPED path's outcome, unchanged — never rewritten by a fallback success. */
  outcome: PeInsertOutcome;
  stage: PeDeliveryStage;
  /** True only when the body verifiably landed in the chat input. */
  delivered: boolean;
}

/**
 * FIX-2 (2026-08-11, owner-approved): PE delivery with the G-A5 failed-inject
 * fallback.
 *
 * P8's D-1 rule made `injectPeBody` clipboard-free — correct as the PRIMARY
 * path. The live Cursor E2E then hit the case D-1 left with no transport at
 * all: a build registering NO direct chat-insert command (activation log
 * `cursor inject-command present: NONE`), where the typed path can only fail
 * and the enhanced body was lost. The owner's G-A5 ruling already covers this
 * exact case: clipboard is allowed "only ... when inject back ... is fail".
 *
 * Ladder: typed clipboard-free insert → (fail) → the SHIPPED DS paste ladder
 * (`cursorInject`: clipboard → raise → focus loop → paste into the EXISTING
 * chat) → (fail) → the text is already on the clipboard from that ladder's own
 * first step, so tell the user to paste (`onClipboardOnly`).
 *
 * Contract notes:
 * - `pasteFallback` absent ⇒ byte-identical to the pre-FIX-2 behaviour (typed
 *   only). Wire it ONLY where G-A5's branch applies (host === 'cursor').
 * - `onClipboardOnly` fires ONLY when `pasteFallback` returned false normally —
 *   `cursorInject` awaits its clipboard write FIRST, so a normal false return
 *   guarantees the text is on the clipboard. A THROWN fallback makes no such
 *   guarantee, so it must never claim "copied" (logged instead, no toast).
 * - `outcome` always reports the typed path truthfully; callers needing "did
 *   it land" use `delivered`.
 */
export async function injectPeBodyWithFallback(
  text: string,
  typedInjectFn: (text: string) => Promise<boolean>,
  deps: {
    pasteFallback?: (text: string) => Promise<boolean>;
    onClipboardOnly?: () => void;
    log?: (line: string) => void;
  } = {},
): Promise<PeFallbackDeliveryResult> {
  const outcome = await injectPeBody(text, typedInjectFn);
  if (outcome === 'inserted') {
    return { outcome, stage: 'typed', delivered: true };
  }
  if (!deps.pasteFallback) {
    return { outcome, stage: 'typed', delivered: false };
  }
  let pasted = false;
  let fallbackThrew = false;
  try {
    pasted = await deps.pasteFallback(text);
  } catch {
    fallbackThrew = true;
  }
  if (pasted) {
    return { outcome, stage: 'cursor_paste_fallback', delivered: true };
  }
  if (fallbackThrew) {
    deps.log?.('[nexpath] PE paste fallback threw — clipboard state unknown, no copied-toast shown');
    return { outcome, stage: 'typed', delivered: false };
  }
  deps.onClipboardOnly?.();
  return { outcome, stage: 'clipboard_only', delivered: false };
}
