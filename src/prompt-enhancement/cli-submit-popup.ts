import { openSync } from 'node:fs';
import * as readline from 'node:readline';
import { ReadStream, WriteStream } from 'node:tty';
import type {
  PromptEnhancementActionEntryV1,
  PromptEnhancementPrepareRequestV1,
  PromptEnhancementPrepareResultV1,
} from './contracts.js';
import { applyPromptEnhancementAction } from './facade.js';
import {
  buildPromptEnhancementActionAdapterStateV1,
  executePromptEnhancementActionV1,
} from './action-adapter.js';
import {
  buildPromptEnhancementFeedbackAdapterStateV1,
  editPromptEnhancementOtherFeedbackV1,
  openPromptEnhancementFeedbackV1,
  resolvePromptEnhancementFeedbackAcknowledgementV1,
  submitPromptEnhancementOtherFeedbackV1,
  submitPromptEnhancementSuggestedFeedbackV1,
  type PromptEnhancementFeedbackAcknowledgementV1,
} from './feedback-adapter.js';
import type { PromptEnhancementPopupEventV1 } from './popup-session.js';
import {
  buildPromptEnhancementPopupRenderModelV1,
  type PromptEnhancementPopupRenderModelV1,
} from './popup-render-model.js';
import {
  buildPromptEnhancementSendIntentAdapterStateV1,
  buildPromptEnhancementSendIntentV1,
} from './send-intent.js';
import { PROMPT_ENHANCEMENT_MAX_SENDABLE_BODY_CHARS } from './safety-sendability.js';
import {
  buildPromptEnhancementMultilineEditorStateV1,
  buildPromptEnhancementVisualLineMapV1,
  decodePromptEnhancementEditorInputV1,
  promptEnhancementCursorVisualPositionV1,
  promptEnhancementKeepFieldCursorVisibleV1,
  reducePromptEnhancementMultilineEditorV1,
  resizePromptEnhancementMultilineEditorV1,
  type PromptEnhancementEditorBufferV1,
  type PromptEnhancementEditorFieldV1,
  type PromptEnhancementMultilineEditorStateV1,
} from './multiline-editor.js';
import type { PromptActionSignalKind } from '../store/feedback-signals.js';

export type PromptEnhancementCliPopupCommandV1 =
  | { type: 'use_current' }
  | { type: 'use_original' }
  | { type: 'edit_body'; text: string }
  | { type: 'apply_details'; text: string }
  | { type: 'shorter' }
  | { type: 'more_thorough' }
  | { type: 'more_project_grounded' }
  | { type: 'feedback_suggested'; category: 'not_relevant_enough' | 'too_much_or_too_long' }
  | { type: 'feedback_other'; text: string }
  | { type: 'go_back' }
  | { type: 'close' };

/**
 * NF Plan B (B-2): content-free action telemetry — maps a popup command to its per-action signal kind.
 * `edit_body` and `feedback_*` are intentionally excluded (edit noise / a separate feedback path).
 */
const PE_ACTION_SIGNAL_KIND_BY_COMMAND: Partial<Record<PromptEnhancementCliPopupCommandV1['type'], PromptActionSignalKind>> = {
  use_current:           'pe_use_current',
  use_original:          'pe_use_original',
  shorter:               'pe_shorter',
  more_thorough:         'pe_more_thorough',
  more_project_grounded: 'pe_more_project_grounded',
  apply_details:         'pe_apply_details',
  go_back:               'pe_back',
  close:                 'pe_close',
};

export type PromptEnhancementCliFeedbackSinkV1 = (event: PromptEnhancementPopupEventV1) => PromptEnhancementFeedbackAcknowledgementV1 | Promise<PromptEnhancementFeedbackAcknowledgementV1>;

export interface PromptEnhancementCliPopupViewV1 {
  model: PromptEnhancementPopupRenderModelV1;
  editedBodyText: string;
  additionalDetailsText: string;
  publicNotice?: string;
  /** True when the current result is a directional refinement (adds the Go back row). */
  refinement?: boolean;
}

export interface PromptEnhancementCliPopupInteractionV1 {
  next(view: PromptEnhancementCliPopupViewV1): Promise<PromptEnhancementCliPopupCommandV1>;
  close(): void;
}

export type PromptEnhancementCliPopupResultV1 =
  | { state: 'not_shown'; reasonCodes: readonly string[] }
  | { state: 'selected_current'; bodyText: string }
  | { state: 'selected_original' }
  | { state: 'closed_no_send' };

/**
 * Runtime guard for a popup result returning across the PE child-process
 * boundary. Only the enum shapes accepted by the existing hook mapper pass;
 * selected body text is capped by the established PE sendability limit.
 */
export function validatePromptEnhancementCliPopupResultV1(
  value: unknown,
): value is PromptEnhancementCliPopupResultV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (result.state === 'selected_current') {
    return typeof result.bodyText === 'string'
      && result.bodyText.length > 0
      && result.bodyText.length <= PROMPT_ENHANCEMENT_MAX_SENDABLE_BODY_CHARS;
  }
  if (result.state === 'selected_original' || result.state === 'closed_no_send') return true;
  return result.state === 'not_shown'
    && Array.isArray(result.reasonCodes)
    && result.reasonCodes.every((reasonCode) => typeof reasonCode === 'string');
}

export interface ClaudeUserPromptSubmitHookOutputV1 {
  decision?: 'block';
  reason?: string;
  suppressOriginalPrompt?: true;
  hookSpecificOutput?: {
    hookEventName: 'UserPromptSubmit';
    additionalContext: string;
  };
}

// Owner ruling 2026-08-07: the popup shows NO action-failure line ("That adjustment could not be
// applied…" removed). A failed action keeps the previous prompt on screen silently — the smooth
// path — and the typed reason codes go to the host's diagnostics sink (logged, never rendered).

const PUBLIC_FEEDBACK_ACCEPTED = 'Feedback saved. Your prompt is unchanged.';
const PUBLIC_FEEDBACK_REJECTED = 'Feedback was not saved. Your prompt is unchanged.';
const PUBLIC_FEEDBACK_UNAVAILABLE = 'Feedback is unavailable right now. Your prompt is unchanged.';
const PUBLIC_FEEDBACK_INVALID = 'Enter 1 to 5000 feedback characters before submitting Other. Your prompt is unchanged.';
export const PROMPT_ENHANCEMENT_CLI_CUSTOM_FEEDBACK_MAX_CHARS_V1 = 5_000;

function publicText(value: string): string {
  return value
    .replace(/\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function actionFor(
  model: PromptEnhancementPopupRenderModelV1,
  actionType: PromptEnhancementActionEntryV1['actionType'],
): PromptEnhancementActionEntryV1 | undefined {
  if (model.controls.currentBody.actionType === actionType) return model.controls.currentBody;
  if (model.controls.original.actionType === actionType) return model.controls.original;
  if (model.controls.close.actionType === actionType) return model.controls.close;
  if (model.controls.additionalDetails?.actionType === actionType) return model.controls.additionalDetails;
  return model.controls.directional.find((entry) => entry.action.actionType === actionType)?.action;
}

function selectedCurrent(
  model: PromptEnhancementPopupRenderModelV1,
  editedBodyText: string,
): PromptEnhancementCliPopupResultV1 | undefined {
  const action = model.controls.currentBody;
  const intent = buildPromptEnhancementSendIntentV1({
    adapterState: buildPromptEnhancementSendIntentAdapterStateV1(),
    event: {
      session: model.session,
      eventType: 'deliver_current_body',
      actionId: action.actionId,
      currentBodyId: model.session.currentBodyId,
      bodyRevision: model.session.bodyRevision,
      editedBodyText,
      timestampMs: Date.now(),
      realUserInitiated: true,
    },
    editedBodyText,
  });
  if (intent.state !== 'intent_ready' || intent.intent.intentType !== 'send_current') return undefined;
  return { state: 'selected_current', bodyText: intent.intent.editedBodyText! };
}

function selectedOriginal(
  model: PromptEnhancementPopupRenderModelV1,
  result: PromptEnhancementPrepareResultV1,
): PromptEnhancementCliPopupResultV1 | undefined {
  const action = model.controls.original;
  const intent = buildPromptEnhancementSendIntentV1({
    adapterState: buildPromptEnhancementSendIntentAdapterStateV1(),
    event: {
      session: model.session,
      eventType: 'use_original',
      actionId: action.actionId,
      currentBodyId: model.session.currentBodyId,
      bodyRevision: model.session.bodyRevision,
      timestampMs: Date.now(),
      realUserInitiated: true,
    },
    originalPromptText: result.currentBody.originalPromptText,
  });
  return intent.state === 'intent_ready' && intent.intent.intentType === 'send_original'
    ? { state: 'selected_original' }
    : undefined;
}

/**
 * Claude CLI live consumer for the already-validated PE result. It owns only
 * terminal presentation and typed user intent. Semantic actions stay behind
 * the existing content-owner facade and no prompt is auto-selected.
 */
export async function runPromptEnhancementCliSubmitPopupV1(input: {
  request: PromptEnhancementPrepareRequestV1;
  result: PromptEnhancementPrepareResultV1;
  interaction?: PromptEnhancementCliPopupInteractionV1 | null;
  feedbackSink?: PromptEnhancementCliFeedbackSinkV1;
  // E9: measured per E8 directional/apply-details action call (observability-only). The loop
  // stays free of the cost module — it hands the produced result to the caller's sink.
  costObservabilitySink?: (result: PromptEnhancementPrepareResultV1) => void;
  /**
   * F3 (owner ruling 2026-08-07): action failures render NOTHING in the popup (previous prompt
   * kept silently); the typed reason codes go here so the host can log them — the only way a
   * live failure stays diagnosable. Codes only, never body text.
   */
  actionDiagnosticsSink?: (event: { actionType: string; state: string; reasonCodes: readonly string[] }) => void;
  /**
   * NF Plan B (B-2): content-free per-action telemetry. Called with the action kind + timestamp the moment
   * the user issues a captured popup action (shorter / more_thorough / more_project_grounded / apply_details
   * / use_current / use_original / go_back / close). Never carries body/option text. Observation-only —
   * does not affect the popup flow.
   */
  actionSignalSink?: (kind: PromptActionSignalKind, occurredAt: number) => void;
  onFirstRender?: () => void;
}): Promise<PromptEnhancementCliPopupResultV1> {
  let currentResult = input.result;
  let rendered = buildPromptEnhancementPopupRenderModelV1({
    result: currentResult,
    timestampMs: Date.now(),
    deliverySurface: currentResult.delivery.deliveryChannel,
  });
  if (rendered.state === 'no_popup') return { state: 'not_shown', reasonCodes: rendered.reasonCodes };

  const interaction = input.interaction === undefined
    ? createPromptEnhancementCliPopupInteractionV1(input.onFirstRender)
    : input.interaction;
  if (!interaction) return { state: 'not_shown', reasonCodes: ['no_tty'] };

  let model = rendered.model;
  let editedBodyText = model.body.text;
  let additionalDetailsText = '';
  let publicNotice: string | undefined;
  // Refinement (directional-action) tracking so "Go back" can restore the main state.
  let inRefinement = false;
  let savedMain: { result: PromptEnhancementPrepareResultV1; body: string } | null = null;
  // F1b: every engine action re-routes with the decision ITS result was prepared with, so a
  // prompt that routed only via the prepare-only LLM rescue keeps its route across actions.
  const routeCarryoverFor = (result: PromptEnhancementPrepareResultV1): { familyId: string; primaryIntent: string } => ({
    familyId: result.routeDecision.familyId,
    primaryIntent: result.routeDecision.primaryIntent,
  });
  // Silent-keep discipline (owner ruling 2026-08-07): a failed action changes NOTHING on screen;
  // the reason codes are reported to the host's log sink only. Best-effort — never throws.
  const reportActionFailure = (actionType: string, state: string, reasonCodes: readonly string[] = []): void => {
    try { input.actionDiagnosticsSink?.({ actionType, state, reasonCodes }); } catch { /* diagnostics only */ }
  };

  try {
    for (;;) {
      const command = await interaction.next({ model, editedBodyText, additionalDetailsText, publicNotice, refinement: inRefinement });
      publicNotice = undefined;

      // NF Plan B (B-2): record the user's action (content-free kind + timestamp) at the moment it is
      // issued — one event per mapped action, regardless of outcome. Observation-only; the send happens
      // later on the feedback-consent flush.
      const actionSignalKind = PE_ACTION_SIGNAL_KIND_BY_COMMAND[command.type];
      if (actionSignalKind) input.actionSignalSink?.(actionSignalKind, Date.now());

      if (command.type === 'close') return { state: 'closed_no_send' };
      if (command.type === 'go_back') {
        if (savedMain) {
          const back = buildPromptEnhancementPopupRenderModelV1({
            result: savedMain.result,
            timestampMs: Date.now(),
            deliverySurface: savedMain.result.delivery.deliveryChannel,
          });
          if (back.state === 'render_model_ready') {
            currentResult = savedMain.result;
            model = back.model;
            editedBodyText = savedMain.body;
            additionalDetailsText = '';
            inRefinement = false;
            savedMain = null;
          }
        }
        continue;
      }
      if (command.type === 'edit_body') {
        if (model.body.editable && command.text.trim().length > 0) editedBodyText = command.text;
        else reportActionFailure('edit_body', 'rejected_empty_or_uneditable');
        continue;
      }
      if (command.type === 'use_current') {
        // F2 (owner ruling 2026-08-07 — smooth send): an UNEDITED body was already validated
        // sendable when this popup rendered — Enter sends exactly that body directly, with no
        // engine round-trip that could fail. An EDITED body keeps the full validation path
        // below (the edit-stage safety rules stay authoritative for user changes).
        if (editedBodyText === model.body.text) {
          const direct = selectedCurrent(model, editedBodyText);
          if (direct) return direct;
        }
        const execution = await executePromptEnhancementActionV1({
          adapterState: buildPromptEnhancementActionAdapterStateV1(model.session),
          baseRequest: input.request,
          action: model.controls.currentBody,
          editedBodyText,
          timestampMs: Date.now(),
          routeCarryover: routeCarryoverFor(currentResult),
          facade: applyPromptEnhancementAction,
        });
        if (execution.state !== 'accepted_result') {
          reportActionFailure('use_current_body', execution.state, 'reasonCodes' in execution ? execution.reasonCodes : []);
          continue;
        }
        const accepted = buildPromptEnhancementPopupRenderModelV1({
          result: execution.result,
          timestampMs: Date.now(),
          deliverySurface: execution.result.delivery.deliveryChannel,
        });
        if (accepted.state === 'render_model_ready') {
          const selected = selectedCurrent(accepted.model, accepted.model.body.text);
          if (selected) return selected;
        }
        reportActionFailure(
          'use_current_body',
          'action_result_not_renderable',
          accepted.state === 'render_model_ready' ? ['send_intent_not_ready'] : accepted.reasonCodes,
        );
        continue;
      }
      if (command.type === 'use_original') {
        const selected = selectedOriginal(model, currentResult);
        if (selected) return selected;
        reportActionFailure('use_original', 'original_intent_not_ready');
        continue;
      }

      if (command.type === 'feedback_suggested' || command.type === 'feedback_other') {
        let feedbackState = openPromptEnhancementFeedbackV1(
          buildPromptEnhancementFeedbackAdapterStateV1(model.session),
        );
        if (feedbackState.status !== 'open') {
          publicNotice = PUBLIC_FEEDBACK_UNAVAILABLE;
          continue;
        }

        const submitted = command.type === 'feedback_suggested'
          ? submitPromptEnhancementSuggestedFeedbackV1(
              feedbackState,
              command.category,
              Date.now(),
              model.session.currentBodyId,
              model.session.bodyRevision,
            )
          : (() => {
              const text = command.text.trim();
              if (text.length === 0 || text.length > PROMPT_ENHANCEMENT_CLI_CUSTOM_FEEDBACK_MAX_CHARS_V1) return undefined;
              feedbackState = editPromptEnhancementOtherFeedbackV1(feedbackState, text);
              return submitPromptEnhancementOtherFeedbackV1(
                feedbackState,
                Date.now(),
                model.session.currentBodyId,
                model.session.bodyRevision,
              );
            })();

        if (!submitted || submitted.state !== 'event_ready') {
          publicNotice = PUBLIC_FEEDBACK_INVALID;
          continue;
        }
        if (!input.feedbackSink) {
          publicNotice = PUBLIC_FEEDBACK_UNAVAILABLE;
          continue;
        }

        let acknowledgement: PromptEnhancementFeedbackAcknowledgementV1;
        try {
          acknowledgement = await input.feedbackSink(submitted.event);
        } catch {
          acknowledgement = {
            stableEventIdentity: submitted.adapterState.inFlightEventIdentity!,
            status: 'unavailable',
            publicSafeText: PUBLIC_FEEDBACK_UNAVAILABLE,
          };
        }
        const resolved = resolvePromptEnhancementFeedbackAcknowledgementV1(
          submitted.adapterState,
          acknowledgement,
        );
        publicNotice = resolved.acknowledgementText ?? publicFeedbackText(acknowledgement.status);
        continue;
      }

      const actionType = command.type === 'apply_details' ? 'apply_details' : command.type;
      const action = actionFor(model, actionType);
      if (!action || action.availability !== 'available') {
        reportActionFailure(actionType, 'action_unavailable');
        continue;
      }
      const details = command.type === 'apply_details' ? command.text : additionalDetailsText;
      // Owner decision (2026-08-06): the recompose here is DETERMINISTIC-instant (the facade
      // never calls the LLM for popup actions), so no busy/wait state is needed or shown.
      const execution = await executePromptEnhancementActionV1({
        adapterState: buildPromptEnhancementActionAdapterStateV1(model.session),
        baseRequest: input.request,
        action,
        editedBodyText,
        ...(details.length > 0 ? { additionalDetailsText: details } : {}),
        timestampMs: Date.now(),
        routeCarryover: routeCarryoverFor(currentResult),
        facade: applyPromptEnhancementAction,
      });
      if (execution.state !== 'accepted_result') {
        reportActionFailure(actionType, execution.state, 'reasonCodes' in execution ? execution.reasonCodes : []);
        continue;
      }

      // Render the action result BEFORE committing any state: a non-renderable result keeps the
      // previous popup exactly as it was (owner ruling 2026-08-07 — the popup used to CLOSE
      // silently here, losing the user's approved prompt; now nothing on screen changes and the
      // reason codes go to the diagnostics sink).
      const renderedAction = buildPromptEnhancementPopupRenderModelV1({
        result: execution.result,
        timestampMs: Date.now(),
        deliverySurface: execution.result.delivery.deliveryChannel,
      });
      if (renderedAction.state === 'no_popup') {
        reportActionFailure(actionType, 'action_result_not_renderable', renderedAction.reasonCodes);
        continue;
      }

      // A directional action opens a refinement view; save the main state once so
      // "Go back" can restore it (details Apply is not a refinement).
      const isDirectional = command.type === 'shorter' || command.type === 'more_thorough' || command.type === 'more_project_grounded';
      if (isDirectional && !inRefinement) {
        savedMain = { result: currentResult, body: editedBodyText };
        inRefinement = true;
      }

      currentResult = execution.result;
      // E9 (P12-G1): this directional/apply-details action is a real E8 LLM call — measure it
      // at the popup_action surface so repeated recompositions are counted, not silently free.
      // Observability is best-effort: a telemetry failure must NEVER abort the popup (the outer
      // catch returns not_shown), so swallow any sink error — same discipline as feedbackSink.
      try { input.costObservabilitySink?.(execution.result); } catch { /* observability only */ }
      rendered = renderedAction;
      model = renderedAction.model;
      editedBodyText = model.body.text;
      additionalDetailsText = '';
      // Show only a meaningful notice after a refinement — the generic "Prepared prompt-enhancement
      // body is available." diagnostic (category 'generated') is redundant with the header cues and
      // must not appear under the options (owner request); keep real notices like the 5,000-word cap.
      publicNotice = currentResult.uiView.diagnostics
        .filter((diagnostic) => diagnostic.category !== 'generated')
        .at(-1)?.publicSafeText;
    }
  } catch {
    return { state: 'not_shown', reasonCodes: ['renderer_failure'] };
  } finally {
    interaction.close();
  }
}

function publicFeedbackText(status: PromptEnhancementFeedbackAcknowledgementV1['status']): string {
  if (status === 'accepted') return PUBLIC_FEEDBACK_ACCEPTED;
  if (status === 'rejected') return PUBLIC_FEEDBACK_REJECTED;
  return PUBLIC_FEEDBACK_UNAVAILABLE;
}


/** Map explicit popup intent to the fields supported by Claude Code UserPromptSubmit hooks. */
export function buildClaudeUserPromptSubmitHookOutputV1(
  result: PromptEnhancementCliPopupResultV1,
): ClaudeUserPromptSubmitHookOutputV1 | undefined {
  if (result.state === 'selected_original' || result.state === 'not_shown') return undefined;
  if (result.state === 'closed_no_send') {
    return {
      decision: 'block',
      reason: 'Prompt enhancement was closed. Nothing was sent.',
      suppressOriginalPrompt: true,
    };
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: [
        'The user explicitly selected this validated Nexpath enhanced prompt.',
        'Treat it as the operative task context; it preserves the original request and adds preparation guidance.',
        '',
        result.bodyText,
      ].join('\n'),
    },
  };
}

// ---------------------------------------------------------------------------
// UI-1 — redrawable PE frame renderer (section 3.1 / 3.1a).
//
// Pure and testable: it maps the typed render model plus a display state to
// frame text. It renders only typed state — no numeric menu, no `.done`
// terminator, no Decision Session controls — and never manufactures
// pinch/question/why-help rows. The live keyboard/focus loop that drives this
// renderer is UI-2 (interaction wiring); this phase delivers the renderer only.
// ---------------------------------------------------------------------------

export const PROMPT_ENHANCEMENT_CLI_FOOTER_V1 = '↑↓ move · Esc cancel' as const;
// Light-gray action hints shown under each editable heading (placeholder copy pending the screenshot).
const PROMPT_ENHANCEMENT_CLI_BODY_HINT_V1 = 'Enter sends this prompt' as const;
const PROMPT_ENHANCEMENT_CLI_DETAILS_HINT_V1 = 'Enter applies these details · unapplied details are not sent' as const;
/** Editing keys shown under a focused editable field (owner request). */
// macOS shows the Mac key names (owner request 2026-08-07); other platforms are untouched.
const PROMPT_ENHANCEMENT_CLI_EDIT_KEYS_HINT_V1 = process.platform === 'darwin'
  ? 'Cmd+J new line · Cmd+↑/↓ move line'
  : 'Ctrl+J new line · Ctrl+↑/↓ move line';

/** Left indent applied to every wrapped line of editable content (body / details). */
export const PROMPT_ENHANCEMENT_CLI_CONTENT_INDENT_V1 = 6 as const;

/**
 * Terminal viewport sizing for the popup. Editable content is wrapped to `fieldWidth` and then
 * rendered with a {@link PROMPT_ENHANCEMENT_CLI_CONTENT_INDENT_V1}-space indent, so `fieldWidth`
 * MUST leave room for that indent (+ a 2-column margin). Otherwise a wrapped line overflows the
 * terminal, the terminal re-wraps it (splitting words mid-line AND doubling the body's height),
 * and the whole frame grows past the window and scrolls — which loses/repeats the title and puts
 * the on-screen caret off the row it was computed for. `viewportRows` reserves space for the fixed
 * chrome (header, hints, option rows, footer).
 */
export function promptEnhancementCliViewportV1(columns: number, rows: number): { fieldWidth: number; viewportRows: number } {
  const cols = Number.isFinite(columns) && columns > 0 ? Math.trunc(columns) : 80;
  const rowCount = Number.isFinite(rows) && rows > 0 ? Math.trunc(rows) : 24;
  return {
    fieldWidth: Math.max(24, cols - PROMPT_ENHANCEMENT_CLI_CONTENT_INDENT_V1 - 2),
    viewportRows: Math.max(4, rowCount - 26),
  };
}
const PROMPT_ENHANCEMENT_CLI_ADDITIONAL_DETAILS_LABEL_V1 = 'Additional details' as const;
const PROMPT_ENHANCEMENT_CLI_USE_ORIGINAL_LABEL_V1 = 'Use original prompt' as const;
const PROMPT_ENHANCEMENT_CLI_GO_BACK_LABEL_V1 = '← Go back' as const;

export type PromptEnhancementCliRowKindV1 =
  | 'editor_heading'
  | 'additional_details'
  | 'directional'
  | 'use_original'
  | 'go_back';

export interface PromptEnhancementCliRowHelpV1 {
  short: string;
  full: string;
}

export interface PromptEnhancementCliActionRowV1 {
  rowKey: string;
  kind: PromptEnhancementCliRowKindV1;
  label: string;
  available: boolean;
  help?: PromptEnhancementCliRowHelpV1;
}

/** Locked stage-1-2a Space-help copy (short label / Space-expanded full), keyed by row. */
const PROMPT_ENHANCEMENT_CLI_ROW_HELP_V1: Readonly<Record<string, PromptEnhancementCliRowHelpV1>> = {
  editor_heading: {
    short: 'Edit current prompt',
    full: 'Open this inline editor to change the enhanced body. While active, Ctrl+J adds a line and Ctrl+Up/Ctrl+Down move text lines. Plain Enter emits the typed current-body intent only when the typed Additional Details state is not dirty-unsubmitted.',
  },
  additional_details: {
    short: 'Add extra requirement',
    full: 'Add new optional notes, requirements, or context in this separate multiline draft. It does not send by itself. A dirty draft must first use the typed Apply/recomposition path; it is never silently carried into a direct send.',
  },
  shorter: {
    short: 'Make it concise',
    full: 'Request a typed concise refinement of the same current body and details; this does not send a prompt.',
  },
  more_thorough: {
    short: 'Add implementation detail',
    full: 'Request a typed refinement with clearer implementation, verification, and edge-case detail; this does not send a prompt.',
  },
  more_project_grounded: {
    short: 'Add project context',
    full: 'Request a typed refinement grounded in approved project context; this does not send a prompt.',
  },
  use_original: {
    short: 'Send original prompt',
    full: 'Your original unchanged prompt will be used; the enhanced body is not selected.',
  },
  go_back: {
    short: 'Return to main prompt',
    full: 'Restore the exact saved main popup state immediately, without sending or requesting new generation.',
  },
};

/**
 * The ordered, navigable action rows for the PE frame, in the locked stage-1-2a
 * focus order: editor heading, Additional details, directional actions,
 * Feedback (only when typed available), Use original prompt last, and — in a
 * refinement view — a final dim Go back. Availability comes from typed state
 * only; labels are the locked section 3.1 display strings.
 */
export function buildPromptEnhancementCliActionRowsV1(
  model: PromptEnhancementPopupRenderModelV1,
  options: { refinement?: boolean } = {},
): readonly PromptEnhancementCliActionRowV1[] {
  const editorHeadingRow: PromptEnhancementCliActionRowV1 = {
    rowKey: 'editor_heading',
    kind: 'editor_heading',
    label: model.editorHeading,
    available: model.body.editable,
    help: PROMPT_ENHANCEMENT_CLI_ROW_HELP_V1.editor_heading,
  };

  // Refinement view (after Shorter / More thorough / More project-grounded): show ONLY the editable
  // body and the final Go back (owner request). No Additional details, directional rows, or Use
  // original — Enter on the body sends the refined prompt; Go back restores the main popup.
  if (options.refinement) {
    return [
      editorHeadingRow,
      {
        // Owner request: no description under Go back — the label is self-explanatory.
        rowKey: 'go_back',
        kind: 'go_back',
        label: PROMPT_ENHANCEMENT_CLI_GO_BACK_LABEL_V1,
        available: true,
      },
    ];
  }

  const rows: PromptEnhancementCliActionRowV1[] = [
    editorHeadingRow,
    {
      rowKey: 'additional_details',
      kind: 'additional_details',
      label: PROMPT_ENHANCEMENT_CLI_ADDITIONAL_DETAILS_LABEL_V1,
      available: model.controls.additionalDetails?.availability === 'available',
      help: PROMPT_ENHANCEMENT_CLI_ROW_HELP_V1.additional_details,
    },
  ];

  // Directional refinements (Shorter / More thorough / More project-grounded) are HIDDEN from the PE
  // popup UI (owner decision 2026-08-19): the row-building loop below is COMMENTED OUT (kept verbatim,
  // NOT deleted) so the rows never render — the user never sees them and the recompose path can never
  // be triggered. To restore, simply un-comment the loop; the action/engine code is untouched. See the
  // submodule doc `…mps-1-directional-actions-pe-parity-plan-and-pending-2026-08-19.md`.
  // for (const entry of model.controls.directional) {
  //   rows.push({
  //     rowKey: entry.action.actionType,
  //     kind: 'directional',
  //     // Owner request: the directional refinements (Shorter / More thorough / More project-grounded)
  //     // never show the "(unavailable)" marker. Their `uiAvailabilityState` is always downgraded to
  //     // `requires_llm_budget` (they are LLM re-wordings), which read as "(unavailable)" even in a
  //     // working popup and confused users. Availability will be governed separately; here the row is
  //     // always shown without the marker. Execution stays gated by the RAW action availability in the
  //     // runner (a genuinely-unavailable action still no-ops silently, never a bad call).
  //     label: entry.action.label,
  //     available: true,
  //     // No focused-row description for the directional actions (owner request):
  //     // the labels (Shorter / More thorough / More project-grounded) are
  //     // self-explanatory. Use original prompt keeps its help below.
  //   });
  // }

  // Feedback is no longer a row in the action list (§8.3): it opens on cancel
  // (Use original prompt or Esc), wired in UI-3.

  rows.push({
    // Owner request: no description under Use original prompt — the label is self-explanatory.
    rowKey: 'use_original',
    kind: 'use_original',
    label: PROMPT_ENHANCEMENT_CLI_USE_ORIGINAL_LABEL_V1,
    available: model.controls.original.availability === 'available',
  });

  return rows;
}

export interface PromptEnhancementCliFrameStateV1 {
  focusIndex: number;
  helpExpanded: boolean;
  refinement?: boolean;
  /** Apply the old-popup radio colours (cyan rail, green/gray bullets, dim labels). Off for tests. */
  colorize?: boolean;
  /**
   * Caret within the focused editable field (window-relative visual row/column). When supplied
   * with `caretOut`, the renderer records the caret's 1-based SCREEN row/column into `caretOut` at
   * the exact line it builds the field's content — so the raw-TTY shell places the hardware cursor
   * without re-deriving the layout (which drifts whenever the frame changes).
   */
  caret?: { field: PromptEnhancementEditorFieldV1; visualRow: number; visualColumn: number };
  /** Mutable sink the renderer fills with the caret's 1-based screen position (see `caret`). */
  caretOut?: { row: number; col: number };
}

/** ANSI styles for the live popup's old-popup radio look (§8.1). */
const PROMPT_ENHANCEMENT_CLI_SGR_V1 = (() => {
  const e = String.fromCharCode(27);
  return {
    cyan: `${e}[36m`,
    green: `${e}[32m`,
    gray: `${e}[90m`,
    // Shortcut/action hints use bright ("light") yellow — a distinct, universally-supported
    // 16-colour that stays readable on every terminal (owner request 2026-08-07: keep it
    // properly visible on all OSes, unlike the faint attribute).
    lightYellow: `${e}[93m`,
    // Caution tone (normal yellow) — the provider-failure notice.
    yellow: `${e}[33m`,
    dim: `${e}[2m`,
    bold: `${e}[1m`,
    reset: `${e}[0m`,
  };
})();

/**
 * Render the single redrawable PE frame from typed state. The focused row is
 * marked and shows its short help, or the full stage-1-2a help when Space-expanded.
 * Editor-heading and Additional-details rows show their field body beneath them.
 */
export function renderPromptEnhancementPopupFrameV1(
  view: PromptEnhancementCliPopupViewV1,
  frameState: PromptEnhancementCliFrameStateV1,
): string {
  const model = view.model;
  const rows = buildPromptEnhancementCliActionRowsV1(model, { refinement: frameState.refinement });
  const focusIndex = rows.length === 0
    ? -1
    : Math.max(0, Math.min(rows.length - 1, Math.trunc(frameState.focusIndex)));
  const c = frameState.colorize ? PROMPT_ENHANCEMENT_CLI_SGR_V1 : null;
  // Branded header on a single line (owner request): "◆ NEXPATH CLI · Prompt
  // enhancement", then a light rule the same width and a blank line so the pinch +
  // cues read cleanly. model.title stays the identity; only the header is styled.
  const surfaceLabel = publicText(model.title).replace(/^Nexpath\s*·\s*/i, '');
  const header = `◆ NEXPATH CLI · ${surfaceLabel}`;
  const lines: string[] = [];
  lines.push(c ? `${c.cyan}${c.bold}${header}${c.reset}` : header);
  lines.push(c ? `${c.dim}${'─'.repeat(header.length)}${c.reset}` : '─'.repeat(header.length));
  lines.push('');

  // UI-9 header: pinch label (funny, when supplied), then trust cues, then the
  // why-help — which the typed model supplies ONLY when a real reason exists.
  if (model.pinchLabel) {
    const pinch = publicText(model.pinchLabel.text);
    lines.push(c ? `${c.bold}${pinch}${c.reset}` : pinch);
  }
  for (const cue of model.publicCopy.trustCues) lines.push(publicText(cue.publicSafeText));
  if (model.whyHelp) {
    const why = publicText(model.whyHelp.text);
    lines.push(c ? `${c.gray}${why}${c.reset}` : why);
  }
  // TI-2 UI half (2026-08-07, locked disposition): on a REAL provider failure the user must be
  // SHOWN it happened. One persistent public-safe line, yellow caution tone, every repaint —
  // display only (no control/behaviour keys on it). Absent on every non-failure run, so normal
  // frames stay byte-identical.
  if (model.providerFailureNotice) {
    const notice = publicText(model.providerFailureNotice);
    lines.push(c ? `${c.yellow}${notice}${c.reset}` : notice);
  }
  lines.push('');

  // Record the caret's real screen position as the field content is built (see caretOut).
  const recordCaret = (field: PromptEnhancementEditorFieldV1): void => {
    if (frameState.caret?.field === field && frameState.caretOut) {
      frameState.caretOut.row = lines.length + 1 + Math.max(0, frameState.caret.visualRow); // 1-based first content line + caret row
      frameState.caretOut.col = 7 + Math.max(0, frameState.caret.visualColumn); // col 7 = after the rail (2) + 4-space indent
    }
  };

  rows.forEach((row, index) => {
    // Owner request: a blank line before Additional details, before the first directional
    // (Shorter), and before the final Go back so the sections read as separate blocks.
    if (row.kind === 'additional_details'
      || (row.kind === 'directional' && rows[index - 1]?.kind !== 'directional')
      || row.kind === 'go_back') {
      lines.push('');
    }
    const focused = index === focusIndex;
    const disabled = row.available ? '' : '  (unavailable)';
    // Every row is an old-popup radio option: filled/green bullet when focused, hollow/gray
    // otherwise, with a dim non-focused label (§8.1). The cyan left rail is applied to every
    // line as a single continuous border in the post-pass below (not per-row here).
    if (c) {
      const bullet = focused ? `${c.green}●${c.reset}` : `${c.gray}○${c.reset}`;
      const label = focused ? `${c.bold}${publicText(row.label)}${c.reset}` : `${c.dim}${publicText(row.label)}${c.reset}`;
      lines.push(`${bullet} ${label}${disabled}`);
    } else {
      lines.push(`${focused ? '●' : '○'} ${publicText(row.label)}${disabled}`);
    }
    // The editor heading and Additional details are radio rows that are also
    // editable: their field body renders beneath the row.
    // Light-gray action hint shown under an editable heading (§ UI-8 / owner request).
    // Content is indented 4 spaces; with the 2-char rail added in the post-pass the text lands at
    // screen column 7 (matching the caret column formula in recordCaret).
    // Shortcut/action hints (Ctrl+J · Enter sends · Enter applies) — LIGHT YELLOW (owner request
    // 2026-08-07): a distinct, clearly-visible colour on every OS.
    const hint = (text: string) => (c ? `    ${c.lightYellow}${text}${c.reset}` : `    ${text}`);
    // A field content line: real prompt text renders plain; a scroll indicator ("↑/↓ N more
    // lines …") renders in plain gray — the "normal" dim (owner request 2026-08-07: the light
    // yellow hints already provide the distinction, so the marker needs no extra darkening).
    const contentLine = (line: string) =>
      c && isPromptEnhancementScrollMarkerLineV1(line) ? `    ${c.gray}${line}${c.reset}` : `    ${line}`;
    const editable = row.kind === 'editor_heading' || row.kind === 'additional_details';
    if (row.kind === 'editor_heading') {
      recordCaret('enhanced_body');
      for (const bodyLine of publicText(view.editedBodyText).split('\n')) lines.push(contentLine(bodyLine));
      // Body block: the "Enter sends this prompt" hint shows ONLY when this row (Use enhanced prompt) is
      // focused — otherwise it is misleading, because Enter acts on whichever row IS focused, not on the
      // enhanced body (owner 2026-08-19). When focused, the edit-keys and the send hint share ONE line.
      if (focused) lines.push(hint(`${PROMPT_ENHANCEMENT_CLI_EDIT_KEYS_HINT_V1} · ${PROMPT_ENHANCEMENT_CLI_BODY_HINT_V1}`));
    } else if (row.kind === 'additional_details') {
      // UI-8: no "Apply" button — pressing Enter on this row applies the details.
      // An empty field renders blank (§8.5). Sending the body ignores unapplied details.
      // Details block order stays as-is (owner: "additional details is fine"): content ->
      // "Enter applies these details …" -> Ctrl+J edit-keys (when focused).
      recordCaret('additional_details');
      const details = view.additionalDetailsText ? publicText(view.additionalDetailsText) : '';
      for (const detailLine of details.split('\n')) lines.push(contentLine(detailLine));
      lines.push(hint(PROMPT_ENHANCEMENT_CLI_DETAILS_HINT_V1));
      if (focused) lines.push(hint(PROMPT_ENHANCEMENT_CLI_EDIT_KEYS_HINT_V1));
    }

    // Non-editable rows (directionals) keep their focused help; the editable rows dropped their
    // sub-label help earlier (owner request 2026-08-07) so the body shows more lines.
    if (focused && row.help && !editable) {
      lines.push(`    ${publicText(frameState.helpExpanded ? row.help.full : row.help.short)}`);
    }
  });

  lines.push('');
  if (view.publicNotice) {
    lines.push(publicText(view.publicNotice));
    lines.push('');
  }
  lines.push(c ? `${c.dim}${PROMPT_ENHANCEMENT_CLI_FOOTER_V1}${c.reset}` : PROMPT_ENHANCEMENT_CLI_FOOTER_V1);

  // Continuous cyan left rail (owner request): draw the rail on EVERY line so the left edge is one
  // unbroken vertical border, not the per-row segments it used to be. A blank line becomes the rail
  // alone; every other line gets "│ " + its content (rail 2 chars keeps content text at column 7).
  const rail = c ? `${c.cyan}│${c.reset}` : '│';
  return lines.map((line) => (line.length === 0 ? rail : `${rail} ${line}`)).join('\n');
}

/**
 * Window an editable buffer to its visible viewport for display. A long enhanced
 * body would otherwise print in full and make the frame taller than the
 * terminal, so the live popup's redraw (clear-screen + home) can't hold it in
 * place and it visually repeats on every keypress. This returns only the visible
 * wrapped lines (from the buffer's own scroll position, cursor kept in view),
 * with a compact "↑ N more / ↓ N more" hint when content is clipped. Display
 * only — the full text stays in the editor state for editing, apply, and send.
 */
export function windowPromptEnhancementFieldForDisplayV1(
  buffer: PromptEnhancementEditorBufferV1,
  width: number,
  rows: number,
): string {
  return windowPromptEnhancementFieldForDisplayWithStartV1(buffer, width, rows).text;
}

/**
 * Same windowing as windowPromptEnhancementFieldForDisplayV1, but also returns the `start` —
 * the first visual row actually shown (0 when the whole field fits; the clamped scroll otherwise).
 * The raw-TTY caret placement uses THIS start (not the raw buffer.scrollVisualRow) so the hardware
 * cursor's window-relative row is derived from the exact window the display rendered — display and
 * caret can never disagree even if a buffer's scroll is momentarily past the clamp.
 */
export function windowPromptEnhancementFieldForDisplayWithStartV1(
  buffer: PromptEnhancementEditorBufferV1,
  width: number,
  rows: number,
): { text: string; start: number } {
  const visual = buildPromptEnhancementVisualLineMapV1(buffer.text, Math.max(1, Math.trunc(width)));
  const viewport = Math.max(1, Math.trunc(rows));
  if (visual.length <= viewport) return { text: visual.map((line) => line.text).join('\n'), start: 0 };
  const maxStart = visual.length - viewport;
  const start = Math.max(0, Math.min(Math.trunc(buffer.scrollVisualRow), maxStart));
  const hiddenAbove = start;
  const hiddenBelow = visual.length - (start + viewport);
  const shown = visual.slice(start, start + viewport).map((line) => line.text);
  if (hiddenAbove > 0) shown[0] = `↑ ${hiddenAbove} more lines above`;
  if (hiddenBelow > 0) shown[shown.length - 1] = `↓ ${hiddenBelow} more lines below · the whole prompt is included`;
  return { text: shown.join('\n'), start };
}

/**
 * True when a windowed field line is a scroll indicator ("↑ N more lines above" / "↓ N more lines
 * below …") produced by windowPromptEnhancementFieldForDisplayV1 — NOT real prompt text. The PE,
 * MPS, and PEF renderers dim these lines (owner request 2026-08-07) so they read as a hint, like
 * the Ctrl+J line, not as part of the body.
 */
export function isPromptEnhancementScrollMarkerLineV1(line: string): boolean {
  return /^↑ \d+ more lines above$/.test(line) || /^↓ \d+ more lines below\b/.test(line);
}

// ---------------------------------------------------------------------------
// UI-2 — live interaction: radio navigation + type-directly editing.
//
// A pure reducer maps a decoded key to the next interaction state plus the
// commands to emit to the outer popup loop. The raw-TTY shell below is the thin
// adapter: it decodes keypresses, feeds them here, renders via
// renderPromptEnhancementPopupFrameV1, and drains the emitted commands.
// ---------------------------------------------------------------------------

export type PromptEnhancementCliKeyV1 =
  | { kind: 'up' }
  | { kind: 'down' }
  | { kind: 'enter' }
  | { kind: 'escape' }
  | { kind: 'space' }
  | { kind: 'editor'; raw: string };

/** Classify a raw key: navigation / activate / cancel / help, else an editor key. */
export function decodePromptEnhancementCliKeyV1(raw: string): PromptEnhancementCliKeyV1 {
  if (raw === '\u001b[A') return { kind: 'up' };
  if (raw === '\u001b[B') return { kind: 'down' };
  if (raw === '\r') return { kind: 'enter' };
  if (raw === '\u001b') return { kind: 'escape' };
  if (raw === ' ') return { kind: 'space' };
  return { kind: 'editor', raw };
}

export interface PromptEnhancementCliInteractionStateV1 {
  focusIndex: number;
  helpExpanded: boolean;
  editor: PromptEnhancementMultilineEditorStateV1;
}

function editableFieldForRow(row: PromptEnhancementCliActionRowV1 | undefined): PromptEnhancementEditorFieldV1 | null {
  if (row?.kind === 'editor_heading') return 'enhanced_body';
  if (row?.kind === 'additional_details') return 'additional_details';
  return null;
}

function withEditorFocus(
  editor: PromptEnhancementMultilineEditorStateV1,
  field: PromptEnhancementEditorFieldV1 | null,
): PromptEnhancementMultilineEditorStateV1 {
  return {
    ...editor,
    focusedField: field,
    buffers: {
      enhanced_body: { ...editor.buffers.enhanced_body, focused: field === 'enhanced_body' },
      additional_details: { ...editor.buffers.additional_details, focused: field === 'additional_details' },
    },
  };
}

/** Build the initial interaction state for a rendered model, focus on the first row. */
export function buildPromptEnhancementCliInteractionStateV1(input: {
  model: PromptEnhancementPopupRenderModelV1;
  editedBodyText: string;
  additionalDetailsText: string;
  fieldWidth: number;
  viewportRows: number;
  refinement?: boolean;
}): PromptEnhancementCliInteractionStateV1 {
  const rows = buildPromptEnhancementCliActionRowsV1(input.model, { refinement: input.refinement });
  const editor = buildPromptEnhancementMultilineEditorStateV1({
    identity: {
      enhancementId: input.model.identity.enhancementId,
      currentBodyId: input.model.identity.currentBodyId,
      bodyRevision: input.model.identity.bodyRevision,
      validationDecisionId: input.model.identity.validationDecisionId,
    },
    enhancedBodyText: input.editedBodyText,
    additionalDetailsText: input.additionalDetailsText,
    fieldWidth: input.fieldWidth,
    viewportRows: input.viewportRows,
    focusedField: editableFieldForRow(rows[0]),
    editable: input.model.body.editable,
  });
  // The enhanced body opens with the cursor at end-of-text (so typing appends) and the window
  // at the top (scrollVisualRow 0). On open the cursor is therefore off the top window and the
  // renderer HIDES it (never strands it at the screen bottom); it appears in view as soon as the
  // user scrolls or edits. See render()'s caret guard.
  return { focusIndex: 0, helpExpanded: false, editor };
}

/**
 * Reduce one decoded key against the interaction state. Arrows move the radio
 * focus; on an editable row, editor keys (and Space) type directly into that
 * field; Enter is per-row: send (enhanced body), apply (details), the directional
 * action, or cancel (Use original / Go back); Esc cancels. A dirty body is
 * committed via a leading `edit_body` before an action.
 */
export function reducePromptEnhancementCliInteractionV1(
  state: PromptEnhancementCliInteractionStateV1,
  rows: readonly PromptEnhancementCliActionRowV1[],
  key: PromptEnhancementCliKeyV1,
): { state: PromptEnhancementCliInteractionStateV1; commands: readonly PromptEnhancementCliPopupCommandV1[] } {
  const focusedRow = rows[state.focusIndex];
  const field = editableFieldForRow(focusedRow);

  if (key.kind === 'up' || key.kind === 'down') {
    const nextIndex = key.kind === 'up'
      ? Math.max(0, state.focusIndex - 1)
      : Math.min(rows.length - 1, state.focusIndex + 1);
    return {
      state: {
        ...state,
        focusIndex: nextIndex,
        helpExpanded: false,
        editor: withEditorFocus(state.editor, editableFieldForRow(rows[nextIndex])),
      },
      commands: [],
    };
  }

  if (key.kind === 'escape') return { state, commands: [{ type: 'close' }] };

  if (key.kind === 'space') {
    if (field) {
      const step = reducePromptEnhancementMultilineEditorV1(withEditorFocus(state.editor, field), { type: 'insert_text', text: ' ' });
      return { state: { ...state, editor: step.state }, commands: [] };
    }
    return { state: { ...state, helpExpanded: !state.helpExpanded }, commands: [] };
  }

  if (key.kind === 'enter') {
    const bodyBuffer = state.editor.buffers.enhanced_body;
    const detailsText = state.editor.buffers.additional_details.text;
    const bodyBlank = bodyBuffer.text.trim().length === 0;
    const commitBody: readonly PromptEnhancementCliPopupCommandV1[] = bodyBuffer.dirty
      ? [{ type: 'edit_body', text: bodyBuffer.text }]
      : [];
    switch (focusedRow?.kind) {
      case 'editor_heading':
        // Never send an empty/whitespace body; stay in the editor (BF-1).
        if (bodyBlank) return { state, commands: [] };
        return { state, commands: [...commitBody, { type: 'use_current' }] };
      case 'additional_details': {
        // A blank body or empty details draft cannot drive an apply (BF-1 / bug B).
        if (bodyBlank || detailsText.trim().length === 0) return { state, commands: [] };
        // Owner request 2026-08-07 (MPS parity): Enter APPLIES the typed details INTO the
        // enhanced body locally — merged verbatim under 'Additional details to incorporate:',
        // the details field clears, and focus returns to the editor heading so the next Enter
        // sends the merged prompt. Instant and deterministic — no engine recompose (the
        // apply_details action seam stays available to other surfaces). The rebuilt body parks
        // its cursor at the end, so the view scrolls to where the details landed.
        // Repeated applies extend the ONE details block (live iMac report 2026-08-07: a second
        // apply used to add a second 'Additional details to incorporate:' heading).
        const detailsHeading = 'Additional details to incorporate:';
        const mergedBody = bodyBuffer.text.includes(detailsHeading)
          ? `${bodyBuffer.text}\n${detailsText.trim()}`
          : `${bodyBuffer.text}\n\n${detailsHeading}\n${detailsText.trim()}`;
        const editorRowIndex = rows.findIndex((row) => row.kind === 'editor_heading');
        const mergedEditor = buildPromptEnhancementMultilineEditorStateV1({
          identity: state.editor.identity,
          enhancedBodyText: mergedBody,
          additionalDetailsText: '',
          fieldWidth: state.editor.fieldWidth,
          viewportRows: state.editor.viewportRows,
          focusedField: 'enhanced_body',
        });
        return {
          state: {
            ...state,
            focusIndex: editorRowIndex >= 0 ? editorRowIndex : state.focusIndex,
            helpExpanded: false,
            editor: mergedEditor,
          },
          commands: [{ type: 'edit_body', text: mergedBody }],
        };
      }
      case 'directional': {
        // A blank body cannot be refined; never run a directional on the stale body (bug B).
        if (bodyBlank) return { state, commands: [] };
        const action = focusedRow.rowKey;
        if (action === 'shorter' || action === 'more_thorough' || action === 'more_project_grounded') {
          return { state, commands: [...commitBody, { type: action }] };
        }
        return { state, commands: [] };
      }
      case 'use_original':
        return { state, commands: [{ type: 'use_original' }] };
      case 'go_back':
        // Refinement "Go back" — the outer loop restores the saved main state.
        return { state, commands: [{ type: 'go_back' }] };
      default:
        return { state, commands: [] };
    }
  }

  // Editor key — only when the focused row is editable.
  if (field) {
    const command = decodePromptEnhancementEditorInputV1(key.raw, field);
    const step = reducePromptEnhancementMultilineEditorV1(withEditorFocus(state.editor, field), command);
    return { state: { ...state, editor: step.state }, commands: [] };
  }
  return { state, commands: [] };
}

// ---------------------------------------------------------------------------
// UI-3 — feedback-on-cancel sub-flow (§8.3, §8.4).
//
// Opens on every cancel (Use original prompt or Esc). Three radio rows; "Other"
// is an inline editable field (type-directly, Ctrl+J newline). Esc skips with no
// feedback. Pure reducer + renderer; the shell runs it before completing the
// cancel, then records the feedback and finishes the cancel.
// ---------------------------------------------------------------------------

export type PromptEnhancementCliFeedbackResultV1 =
  | { kind: 'pending' }
  | { kind: 'dismiss' }
  | { kind: 'suggested'; category: 'not_relevant_enough' | 'too_much_or_too_long' }
  | { kind: 'other'; text: string };

export interface PromptEnhancementCliFeedbackStateV1 {
  focusIndex: number;
  editor: PromptEnhancementMultilineEditorStateV1;
}

const PROMPT_ENHANCEMENT_CLI_FEEDBACK_ROWS_V1 = ['Not relevant enough', 'Too much or too long', 'Other'] as const;
const PROMPT_ENHANCEMENT_CLI_FEEDBACK_FOOTER_V1 = 'Enter submit · Esc skip' as const;

/** Other feedback uses the editor's additional_details field; focus starts on the first reason. */
function feedbackEditorFieldForFocus(focusIndex: number): PromptEnhancementEditorFieldV1 | null {
  return focusIndex === 2 ? 'additional_details' : null;
}

export function buildPromptEnhancementCliFeedbackStateV1(input: { fieldWidth: number; viewportRows: number }): PromptEnhancementCliFeedbackStateV1 {
  const editor = buildPromptEnhancementMultilineEditorStateV1({
    identity: { enhancementId: 'feedback', currentBodyId: 'feedback', bodyRevision: 0, validationDecisionId: 'feedback' },
    enhancedBodyText: '',
    additionalDetailsText: '',
    fieldWidth: input.fieldWidth,
    viewportRows: input.viewportRows,
    focusedField: null,
  });
  return { focusIndex: 0, editor };
}

/**
 * Reduce one key against the feedback popup. Arrows move the radio focus; the
 * Other row types directly; Enter submits (a reason, or non-empty bounded Other);
 * Esc skips. Raw Other text stays transient in this state.
 */
export function reducePromptEnhancementCliFeedbackV1(
  state: PromptEnhancementCliFeedbackStateV1,
  key: PromptEnhancementCliKeyV1,
): { state: PromptEnhancementCliFeedbackStateV1; result: PromptEnhancementCliFeedbackResultV1 } {
  const onOther = state.focusIndex === 2;

  if (key.kind === 'up' || key.kind === 'down') {
    const nextIndex = key.kind === 'up' ? Math.max(0, state.focusIndex - 1) : Math.min(2, state.focusIndex + 1);
    return {
      state: { focusIndex: nextIndex, editor: withEditorFocus(state.editor, feedbackEditorFieldForFocus(nextIndex)) },
      result: { kind: 'pending' },
    };
  }

  if (key.kind === 'escape') return { state, result: { kind: 'dismiss' } };

  if (key.kind === 'space') {
    if (onOther) {
      const step = reducePromptEnhancementMultilineEditorV1(withEditorFocus(state.editor, 'additional_details'), { type: 'insert_text', text: ' ' });
      return { state: { ...state, editor: step.state }, result: { kind: 'pending' } };
    }
    return { state, result: { kind: 'pending' } };
  }

  if (key.kind === 'enter') {
    if (state.focusIndex === 0) return { state, result: { kind: 'suggested', category: 'not_relevant_enough' } };
    if (state.focusIndex === 1) return { state, result: { kind: 'suggested', category: 'too_much_or_too_long' } };
    const text = state.editor.buffers.additional_details.text.trim();
    if (text.length === 0 || text.length > PROMPT_ENHANCEMENT_CLI_CUSTOM_FEEDBACK_MAX_CHARS_V1) return { state, result: { kind: 'pending' } };
    return { state, result: { kind: 'other', text } };
  }

  if (onOther) {
    const command = decodePromptEnhancementEditorInputV1(key.raw, 'additional_details');
    const step = reducePromptEnhancementMultilineEditorV1(withEditorFocus(state.editor, 'additional_details'), command);
    return { state: { ...state, editor: step.state }, result: { kind: 'pending' } };
  }
  return { state, result: { kind: 'pending' } };
}

/** Render the feedback popup: three radio rows, the Other editable field, and the footer. */
export function renderPromptEnhancementCliFeedbackFrameV1(
  state: PromptEnhancementCliFeedbackStateV1,
  // caretOut: when the editable "Other" row is focused, the renderer records the caret's 1-based SCREEN
  // row/column here (same contract as the main popup frame's caretOut) so the raw-TTY shell can place
  // the hardware cursor. Left at its incoming value when the field is unfocused/empty/off-window.
  options: { colorize?: boolean; caretOut?: { row: number; col: number } } = {},
): string {
  const c = options.colorize ? PROMPT_ENHANCEMENT_CLI_SGR_V1 : null;
  // Branded header identical to the PE popup (owner request): "◆ NEXPATH CLI ·
  // Prompt enhancement feedback", cyan+bold, then a dim rule the same width.
  const header = '◆ NEXPATH CLI · Prompt enhancement feedback';
  const lines: string[] = [
    c ? `${c.cyan}${c.bold}${header}${c.reset}` : header,
    c ? `${c.dim}${'─'.repeat(header.length)}${c.reset}` : '─'.repeat(header.length),
    '',
  ];
  PROMPT_ENHANCEMENT_CLI_FEEDBACK_ROWS_V1.forEach((label, index) => {
    const focused = index === state.focusIndex;
    if (c) {
      const bullet = focused ? `${c.green}●${c.reset}` : `${c.gray}○${c.reset}`;
      const styledLabel = focused ? `${c.bold}${label}${c.reset}` : `${c.dim}${label}${c.reset}`;
      lines.push(`${c.cyan}│${c.reset} ${bullet} ${styledLabel}`);
    } else {
      lines.push(`  ${focused ? '●' : '○'} ${label}`);
    }
    if (index === 2) {
      // Wrap + window the Other field exactly like the main popup's body/details field, so a long comment
      // scrolls in place and the caret maps 1:1 to a rendered row (the caretOut recording below relies on
      // the display being the SAME windowed text the caret position is measured against).
      const otherRows = Math.min(Math.max(1, state.editor.viewportRows), 5);
      const rawBuffer = state.editor.buffers.additional_details;
      const buffer = focused
        ? promptEnhancementKeepFieldCursorVisibleV1(rawBuffer, state.editor.fieldWidth, otherRows)
        : rawBuffer;
      const window = buffer.text
        ? windowPromptEnhancementFieldForDisplayWithStartV1(buffer, state.editor.fieldWidth, otherRows)
        : { text: '', start: 0 };
      const shown = buffer.text ? publicText(window.text) : '(type your feedback)';
      // Record the caret's real screen position (window-relative), mirroring the main popup's recordCaret:
      // the field's first content line is the NEXT line pushed; the 6-space indent puts column 0 at col 7.
      // Not guarded on non-empty text: like the main popup, a freshly-focused EMPTY Other field shows the
      // caret at the start (over the '(type your feedback)' placeholder) so the user sees they can type.
      if (focused && options.caretOut) {
        const pos = promptEnhancementCursorVisualPositionV1(buffer, state.editor.fieldWidth);
        const visualRow = pos.row - window.start;
        if (visualRow >= 0 && visualRow < shown.split('\n').length) {
          options.caretOut.row = lines.length + 1 + visualRow;
          options.caretOut.col = 7 + pos.column;
        }
      }
      for (const line of shown.split('\n')) lines.push(`      ${line}`);
      // Editing keys under the editable Other field — light yellow, same shortcut tier as PE/MPS.
      if (focused) lines.push(c ? `      ${c.lightYellow}${PROMPT_ENHANCEMENT_CLI_EDIT_KEYS_HINT_V1}${c.reset}` : `      ${PROMPT_ENHANCEMENT_CLI_EDIT_KEYS_HINT_V1}`);
    }
  });
  lines.push('', c ? `${c.dim}${PROMPT_ENHANCEMENT_CLI_FEEDBACK_FOOTER_V1}${c.reset}` : PROMPT_ENHANCEMENT_CLI_FEEDBACK_FOOTER_V1);
  return lines.join('\n');
}

/**
 * Live raw-TTY shell (UI-2). Renders the radio frame and drives it with the
 * pure interaction reducer: arrows move focus, editable rows type directly,
 * Enter is per-row, Esc/Ctrl+C cancel. Multi-command results (a dirty-body
 * `edit_body` before an action) are drained across successive next() calls.
 */
/**
 * Open the interactive console for the raw-TTY popup, cross-platform. The Stop hook's own
 * stdin/stdout are piped, so the popup attaches directly to the controlling terminal:
 *   - Linux + macOS: `/dev/tty` — one fd, read+write.
 *   - Windows: the console device — `CONIN$` for input, `CONOUT$` for output (there is no
 *     `/dev/tty` on Windows). The two streams own separate fds; teardown destroys both.
 * Returns null when no console is reachable (e.g. a headless session); the caller then reports the
 * popup as not shown, and (per the Stop-hook wiring) the pending record is left for a later Stop.
 */
export function openPromptEnhancementInteractiveConsoleV1(): { input: ReadStream; output: WriteStream; owned: boolean } | null {
  // In a spawned popup WINDOW (Windows cmd / macOS Terminal.app / Linux gnome-terminal) the process's
  // OWN stdin/stdout ARE the interactive console — use them directly, exactly like the advisory popup.
  // This is the reliable path on every OS and is what makes the spawned window actually render and
  // accept keystrokes (re-opening the console device instead can render to a non-interactive handle,
  // so the window flashes and closes). `owned: false` → teardown must NOT destroy the process stdio.
  if (process.stdin.isTTY && process.stdout.isTTY) {
    return { input: process.stdin as ReadStream, output: process.stdout as WriteStream, owned: false };
  }
  // In-process Stop-hook fallback: stdin is piped (not a TTY), so attach to the console device.
  try {
    if (process.platform === 'win32') {
      return {
        input: new ReadStream(openSync('\\\\.\\CONIN$', 'r')),
        output: new WriteStream(openSync('\\\\.\\CONOUT$', 'w')),
        owned: true,
      };
    }
    const fd = openSync('/dev/tty', 'r+');
    return { input: new ReadStream(fd), output: new WriteStream(fd), owned: true };
  } catch {
    return null;
  }
}

function createPromptEnhancementCliPopupInteractionV1(onFirstRender?: () => void): PromptEnhancementCliPopupInteractionV1 | null {
  const consoleStreams = openPromptEnhancementInteractiveConsoleV1();
  if (!consoleStreams) return null;
  const { input, output, owned } = consoleStreams;

  const ESC = String.fromCharCode(27);
  // In-place redraw: home the cursor, write the frame, then clear anything below
  // it. No screen-scroll and no trailing newline, so repeated redraws (e.g. on
  // ↑/↓) never accumulate stale copies in the scrollback. FULL_RESET clears the
  // spawned terminal's startup output + scrollback once, on first paint.
  const HOME = `${ESC}[H`;
  const CLEAR_EOL = `${ESC}[K`;
  const CLEAR_BELOW = `${ESC}[0J`;
  const FULL_RESET = `${ESC}[2J${ESC}[3J${ESC}[H`;
  const HIDE_CURSOR = `${ESC}[?25l`;
  const SHOW_CURSOR = `${ESC}[?25h`;
  // Erase each line to end-of-line (CLEAR_EOL) so a shorter new line never leaves
  // the tail of the previous longer line behind, then clear everything below the
  // frame (CLEAR_BELOW). Without the per-line erase, redraws overlap/duplicate.
  const paint = (content: string): void => {
    // Hard cap the frame to the window height so it can NEVER overflow and scroll
    // (which is what made the title repeat). Leave the bottom row free so the last
    // line's write never triggers a scroll.
    const maxLines = Math.max(1, (output.rows ?? 24) - 1);
    const cleared = content.split('\n').slice(0, maxLines).map((line) => `${line}${CLEAR_EOL}`).join('\n');
    output.write(`${HOME}${cleared}${CLEAR_BELOW}`);
  };
  const CTRL_C = String.fromCharCode(3);

  readline.emitKeypressEvents(input);
  if (input.isTTY) input.setRawMode?.(true);
  input.resume();
  output.write(`${FULL_RESET}${HIDE_CURSOR}`);

  let closed = false;
  let firstRenderAcknowledged = false;
  let state: PromptEnhancementCliInteractionStateV1 | null = null;
  let lastBodyRevision: number | null = null;
  const queue: PromptEnhancementCliPopupCommandV1[] = [];

  // The popup WINDOW is sized to ~70% × 70% of the screen by the host (terminal
  // geometry), so here the content simply fills that window: use most of the
  // width, and give the enhanced body the height that remains after the chrome.
  // Kept bounded so the frame always fits and redraws in place (no repeat).
  const fieldWidth = () => promptEnhancementCliViewportV1(output.columns ?? 80, output.rows ?? 24).fieldWidth;
  const viewportRows = () => promptEnhancementCliViewportV1(output.columns ?? 80, output.rows ?? 24).viewportRows;

  // Persistent listeners with a key buffer so no keystroke is dropped between reads.
  const keyBuffer: string[] = [];
  let pending: { resolve: (key: string) => void; reject: (error: Error) => void } | null = null;
  let lastView: PromptEnhancementCliPopupViewV1 | null = null;
  const onKeypress = (str: string | undefined, key: readline.Key | undefined): void => {
    const sequence = key?.sequence ?? str ?? '';
    if (pending) { const { resolve } = pending; pending = null; resolve(sequence); }
    else keyBuffer.push(sequence);
  };
  const onError = (error: Error): void => {
    if (pending) { const { reject } = pending; pending = null; reject(error); }
  };
  // Live resize repaints whichever frame is active — main popup or feedback popup
  // (GAP-2). `repaint` is re-pointed by runFeedback so a resize never paints the
  // main popup over the feedback popup.
  let repaint: () => void = () => {};
  const paintMain = (): void => {
    if (!state || !lastView) return;
    state = { ...state, editor: resizePromptEnhancementMultilineEditorV1(state.editor, fieldWidth(), viewportRows()) };
    render(lastView, state);
  };
  repaint = paintMain;
  const onResize = (): void => { if (!closed) repaint(); };
  input.on('keypress', onKeypress);
  input.on('error', onError);
  output.on('resize', onResize);

  const readKey = (): Promise<string> => new Promise((resolve, reject) => {
    if (closed) { reject(new Error('popup closed')); return; }
    if (keyBuffer.length > 0) { resolve(keyBuffer.shift()!); return; }
    pending = { resolve, reject };
  });

  const render = (view: PromptEnhancementCliPopupViewV1, current: PromptEnhancementCliInteractionStateV1): void => {
    lastView = view;
    const editorWidth = current.editor.fieldWidth;
    const detailsRows = Math.min(current.editor.viewportRows, 5);
    // Which editable row (if any) has focus — computed first so we can sync that field's
    // scroll to its cursor BEFORE the field is windowed and the caret placed.
    const rows = buildPromptEnhancementCliActionRowsV1(view.model, { refinement: view.refinement });
    const focusedRow = rows[current.focusIndex];
    const focusedField: PromptEnhancementEditorFieldV1 | null =
      focusedRow?.kind === 'editor_heading' ? 'enhanced_body'
        : focusedRow?.kind === 'additional_details' ? 'additional_details'
          : null;
    // The details field's display is capped at 5 rows (< the body viewport), so sync it here to
    // that cap when focused, or its caret could fall outside the shown lines. Details is windowed
    // FIRST because it feeds the chrome measurement that sizes the body.
    const detailsBuffer = focusedField === 'additional_details'
      ? promptEnhancementKeepFieldCursorVisibleV1(current.editor.buffers.additional_details, editorWidth, detailsRows)
      : current.editor.buffers.additional_details;
    const detailsWindow = detailsBuffer.text
      ? windowPromptEnhancementFieldForDisplayWithStartV1(detailsBuffer, editorWidth, detailsRows)
      : { text: '', start: 0 };
    const detailsDisplay = detailsWindow.text;
    // Fill the window (owner request 2026-08-07 — the body was small with dead space below the
    // footer): MEASURE the exact non-body chrome by rendering a 1-line-body probe with the same
    // focus/refinement/details, then give the body every remaining row (rows-1 for the no-scroll
    // cap). This adapts to the variable header (pinch + trust cues + why-help), the directional
    // rows, and the current details block — no hardcoded chrome constant — so the frame always
    // fills to the window bottom and never overflows/scrolls. The reducer's own viewportRows is
    // resized to match, so cursor-keeping and the display agree.
    const probeChrome = renderPromptEnhancementPopupFrameV1(
      { model: view.model, editedBodyText: 'x', additionalDetailsText: detailsDisplay, publicNotice: view.publicNotice },
      { focusIndex: current.focusIndex, helpExpanded: current.helpExpanded, refinement: view.refinement, colorize: false },
    ).split('\n').length - 1;
    const measuredBodyRows = Math.max(4, (output.rows ?? 24) - 1 - probeChrome);
    if (current === state) {
      state = { ...current, editor: resizePromptEnhancementMultilineEditorV1(current.editor, editorWidth, measuredBodyRows) };
      current = state;
    }
    // Display only the visible viewport of each editable field so the frame fits the terminal
    // and redraws in place. The full text stays in current.editor for editing/apply/send.
    const bodyBuffer = current.editor.buffers.enhanced_body;
    const bodyWindow = windowPromptEnhancementFieldForDisplayWithStartV1(bodyBuffer, editorWidth, measuredBodyRows);
    const bodyDisplay = bodyWindow.text;
    // Caret row is window-relative, derived from the SAME window the display used (its `start`),
    // not the raw buffer scroll. If it still falls outside the shown lines, leave the caret unset
    // so the cursor is hidden rather than placed on a wrong row.
    let caret: PromptEnhancementCliFrameStateV1['caret'];
    if (focusedField) {
      const buffer = focusedField === 'enhanced_body' ? bodyBuffer : detailsBuffer;
      const shownLines = (focusedField === 'enhanced_body' ? bodyDisplay : detailsDisplay).split('\n').length;
      const start = focusedField === 'enhanced_body' ? bodyWindow.start : detailsWindow.start;
      const pos = promptEnhancementCursorVisualPositionV1(buffer, editorWidth);
      const visualRow = pos.row - start;
      if (visualRow >= 0 && visualRow < shownLines) {
        caret = { field: focusedField, visualRow, visualColumn: pos.column };
      }
    }
    const caretOut = { row: -1, col: -1 };
    const frame = renderPromptEnhancementPopupFrameV1(
      { model: view.model, editedBodyText: bodyDisplay, additionalDetailsText: detailsDisplay, publicNotice: view.publicNotice },
      { focusIndex: current.focusIndex, helpExpanded: current.helpExpanded, refinement: view.refinement, colorize: true, caret, caretOut },
    );
    paint(frame);

    // Cursor: shown only where the renderer recorded a real caret inside the focused field's
    // rendered block (caretOut > 0) AND that row is on-screen. Never clamp to the screen bottom
    // — an off-window caret leaves the cursor hidden, not stranded on a footer row.
    if (focusedField && caret && caretOut.row > 0 && caretOut.row <= Math.max(1, (output.rows ?? 24) - 1)) {
      output.write(`${ESC}[${caretOut.row};${caretOut.col}H${SHOW_CURSOR}`);
    } else {
      output.write(HIDE_CURSOR);
    }
  };

  // Feedback-on-cancel (§8.3/§8.4): render the 3-row feedback popup and collect a
  // reason or Other; Esc skips. Returns the feedback command(s) to record, or none.
  const runFeedback = async (): Promise<readonly PromptEnhancementCliPopupCommandV1[]> => {
    let fb = buildPromptEnhancementCliFeedbackStateV1({ fieldWidth: fieldWidth(), viewportRows: viewportRows() });
    const paintFeedback = (): void => {
      fb = { ...fb, editor: resizePromptEnhancementMultilineEditorV1(fb.editor, fieldWidth(), viewportRows()) };
      const caretOut = { row: -1, col: -1 };
      paint(renderPromptEnhancementCliFeedbackFrameV1(fb, { colorize: true, caretOut }));
      // Place + show the hardware cursor only when the editable Other row (index 2) is focused and the
      // caret landed on-screen — mirrors the main render's placement (never clamp to the screen bottom).
      if (fb.focusIndex === 2 && caretOut.row > 0 && caretOut.row <= Math.max(1, (output.rows ?? 24) - 1)) {
        output.write(`${ESC}[${caretOut.row};${caretOut.col}H${SHOW_CURSOR}`);
      } else {
        output.write(HIDE_CURSOR);
      }
    };
    repaint = paintFeedback;
    try {
      paintFeedback();
      for (;;) {
        const raw = await readKey();
        if (raw === CTRL_C) return [];
        const stepped = reducePromptEnhancementCliFeedbackV1(fb, decodePromptEnhancementCliKeyV1(raw));
        fb = stepped.state;
        const result = stepped.result;
        if (result.kind === 'dismiss') return [];
        if (result.kind === 'suggested' || result.kind === 'other') {
          const command: PromptEnhancementCliPopupCommandV1 = result.kind === 'suggested'
            ? { type: 'feedback_suggested', category: result.category }
            : { type: 'feedback_other', text: result.text };
          // Owner request: no "Feedback noted. Press any key" step — completing the feedback choice
          // sends it and finishes the cancel directly.
          return [command];
        }
        paintFeedback();
      }
    } finally {
      repaint = paintMain;
    }
  };

  return {
    async next(view) {
      if (queue.length > 0) return queue.shift()!;

      // (Re)build editor/focus state on first show or whenever the typed body revision changes.
      if (!state || lastBodyRevision !== view.model.identity.bodyRevision) {
        state = buildPromptEnhancementCliInteractionStateV1({
          model: view.model,
          editedBodyText: view.editedBodyText,
          additionalDetailsText: view.additionalDetailsText,
          fieldWidth: fieldWidth(),
          viewportRows: viewportRows(),
        });
        lastBodyRevision = view.model.identity.bodyRevision;
      }

      const rows = buildPromptEnhancementCliActionRowsV1(view.model, { refinement: view.refinement });
      render(view, state);
      if (!firstRenderAcknowledged) {
        onFirstRender?.();
        firstRenderAcknowledged = true;
      }

      for (;;) {
        const raw = await readKey();
        if (raw === CTRL_C) return { type: 'close' };
        const stepped = reducePromptEnhancementCliInteractionV1(state, rows, decodePromptEnhancementCliKeyV1(raw));
        state = stepped.state;
        if (stepped.commands.length > 0) {
          const only = stepped.commands.length === 1 ? stepped.commands[0] : undefined;
          // Feedback opens ONLY when the user chooses Use original prompt (owner
          // decision). Close / Esc / crash send nothing and show no feedback.
          if (only && only.type === 'use_original') {
            queue.push(...(await runFeedback()), only);
          } else {
            queue.push(...stepped.commands);
          }
          return queue.shift()!;
        }
        render(view, state);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      // Restore the terminal cursor we hid while the popup was open.
      try { output.write(SHOW_CURSOR); } catch { /* fd may already be closed */ }
      // Settle any parked reader so it never hangs (BF-2).
      if (pending) { const { reject } = pending; pending = null; reject(new Error('popup closed')); }
      input.off('keypress', onKeypress);
      input.off('error', onError);
      output.off('resize', onResize);
      if (input.isTTY) input.setRawMode?.(false);
      input.pause();
      // Only destroy fds we opened ourselves (the console device). When we reused the process's own
      // stdin/stdout (spawned window), leave them intact — destroying process stdio can crash the
      // child before it writes its result.
      if (owned) {
        try { input.destroy(); } catch { /* already closed */ }
        try { output.destroy(); } catch { /* shares the fd; may already be closed (BF-3) */ }
      }
    },
  };
}
