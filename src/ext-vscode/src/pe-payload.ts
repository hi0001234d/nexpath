/**
 * Versioned extension-side transport envelope for a pending Prompt Enhancement
 * (P5, PEH-1). Parses the raw `PromptEnhancementPrepareResultV1` JSON — P3's
 * `pe-store-reader.ts` `resultJson` field — into a minimal, defensively-typed
 * shape this renderer needs. Never imports anything from `src/prompt-enhancement/**`.
 *
 * ARCHITECTURAL NOTE — why this doesn't call the real builder function.
 * The dev plan's original P5 design said to wrap the typed session built by
 * `buildPromptEnhancementPopupSessionV1()` (`src/prompt-enhancement/popup-session.ts`)
 * without re-declaring its fields. That is not buildable: `src/ext-vscode` is
 * its own npm package with `tsconfig.json` `rootDir: "./src"`. Verified
 * empirically — adding a throwaway TYPE-ONLY import of `popup-session.ts` and
 * running `tsc --noEmit` fails with TS6059 on `src/classifier/*`, `src/store/*`
 * (the frozen Layer C modules `popup-session.ts` transitively imports), because
 * TypeScript pulls the whole transitive graph into the program for type
 * resolution regardless of `import type` vs a value import. There is no way to
 * import from `src/prompt-enhancement/**` here, typed or not.
 *
 * So this module follows the same pattern `pe-store-reader.ts` and the
 * pre-existing `advisory-store-reader.ts` already use: a local, minimal,
 * defensively-typed interface mirroring only the JSON fields actually needed,
 * hand-parsed with `typeof`/allowed-value checks, field names matching the
 * real contract exactly (never renamed or invented) so the mapping stays
 * legible against `src/prompt-enhancement/contracts.ts`.
 *
 * Never throws — a malformed/unexpected shape returns `null` rather than
 * breaking rendering.
 */

export const PE_EXTENSION_PAYLOAD_TRANSPORT_VERSION = 1;

export type PeDirectionalActionType = 'shorter' | 'more_thorough' | 'more_project_grounded';

const DIRECTIONAL_ACTION_TYPES: readonly string[] = [
  'shorter',
  'more_thorough',
  'more_project_grounded',
];

export interface PeDirectionalAction {
  actionType: PeDirectionalActionType;
  actionId:   string;
  label:      string;
  available:  boolean;
}

/**
 * Typed render bucket for the webview — PEH-2 requires fallback/no-popup/
 * error/loading states to come from typed state, never string matching.
 */
export type PeRenderState = 'ready' | 'loading' | 'fallback' | 'blocked' | 'no_popup';

export type PePromptSendPolicy = 'send_current' | 'send_original' | 'no_send' | 'original_only' | 'no_popup';

const SEND_POLICIES: ReadonlySet<string> = new Set([
  'send_current', 'send_original', 'no_send', 'original_only', 'no_popup',
]);

/** The extension's own minimal, versioned view of a pending PE — not the full core session. */
export interface PromptEnhancementExtensionPayloadV1 {
  transportVersion:  1;
  enhancementId:     string;
  validationDecisionId: string;
  currentBodyId:     string;
  bodyRevision:      number;
  /** '' when sendPolicy is 'no_send'/'no_popup' — self-scrub, mirrors the core's own D2 rule. */
  currentBodyText:   string;
  sendPolicy:        PePromptSendPolicy;
  renderState:       PeRenderState;
  additionalDetailsAvailable: boolean;
  directionalActions: readonly PeDirectionalAction[];
  closeActionId:     string | null;
}

function isBlockedSendPolicy(sendPolicy: string): boolean {
  return sendPolicy === 'no_send' || sendPolicy === 'no_popup';
}

function renderStateFor(
  sendPolicy: string,
  fallbackMode: unknown,
  actionLoadingState: unknown,
): PeRenderState {
  if (sendPolicy === 'no_popup') return 'no_popup';
  if (sendPolicy === 'no_send') return 'blocked';
  if (actionLoadingState === 'loading_action') return 'loading';
  if (typeof fallbackMode === 'string' && fallbackMode !== 'none' && fallbackMode !== 'previous_sendable_body') {
    return 'fallback';
  }
  return 'ready';
}

/**
 * Parse a raw `PromptEnhancementPrepareResultV1` JSON string (as stored in
 * `pending_prompt_enhancements.result_json`) into the extension's payload
 * envelope. Returns `null` on any malformed/unexpected shape. Never throws.
 */
export function parsePromptEnhancementExtensionPayloadV1(
  resultJson: string,
): PromptEnhancementExtensionPayloadV1 | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(resultJson);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const result = parsed as Record<string, unknown>;

  const enhancementId = result.enhancementId;
  const validationDecisionId = result.validationDecisionId;
  if (typeof enhancementId !== 'string' || enhancementId.length === 0) return null;
  if (typeof validationDecisionId !== 'string' || validationDecisionId.length === 0) return null;

  const uiView = result.uiView;
  if (!uiView || typeof uiView !== 'object') return null;
  const view = uiView as Record<string, unknown>;

  const body = view.body;
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  const sendPolicy = b.sendPolicy;
  if (typeof sendPolicy !== 'string' || !SEND_POLICIES.has(sendPolicy)) return null;

  const currentBodyId = b.currentBodyId;
  if (typeof currentBodyId !== 'string' || currentBodyId.length === 0) return null;

  const bodyRevision = b.bodyRevision;
  if (typeof bodyRevision !== 'number') return null;

  const rawText = b.text;
  const text = typeof rawText === 'string' ? rawText : '';

  const actionsRaw = Array.isArray(view.actions) ? view.actions : [];
  const directionalActions: PeDirectionalAction[] = [];
  let additionalDetailsAvailable = false;
  let closeActionId: string | null = null;

  for (const entry of actionsRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const a = entry as Record<string, unknown>;
    const actionType = a.actionType;
    const actionId = a.actionId;
    const label = a.label;
    const availability = a.availability;
    if (typeof actionType !== 'string' || typeof actionId !== 'string' || typeof label !== 'string') continue;

    if (actionType === 'close') {
      closeActionId = actionId;
      continue;
    }
    if (actionType === 'apply_details') {
      additionalDetailsAvailable = availability === 'available';
      continue;
    }
    if (DIRECTIONAL_ACTION_TYPES.includes(actionType)) {
      directionalActions.push({
        actionType: actionType as PeDirectionalActionType,
        actionId,
        label,
        available: availability === 'available',
      });
    }
  }

  return {
    transportVersion: PE_EXTENSION_PAYLOAD_TRANSPORT_VERSION,
    enhancementId,
    validationDecisionId,
    currentBodyId,
    bodyRevision,
    currentBodyText: isBlockedSendPolicy(sendPolicy) ? '' : text,
    sendPolicy: sendPolicy as PePromptSendPolicy,
    renderState: renderStateFor(sendPolicy, b.fallbackMode, b.actionLoadingState),
    additionalDetailsAvailable,
    directionalActions,
    closeActionId,
  };
}
