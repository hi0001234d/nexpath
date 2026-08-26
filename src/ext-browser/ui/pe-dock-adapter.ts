/**
 * The bridge between the popup engine flow and the UI developer's dock (PR #1)
 * — the "producer" their typed model was designed for. It implements the same
 * controller contract my pe-panel exposed (PePanelControllerV1), so the
 * content-script wiring (pe-inject.ts) and everything SW-side stay byte-
 * identical; only the RENDERER changed.
 *
 *   my PePanelViewV1 / PeSequenceOfferViewV1  ──producers──▶  their SurfaceModel
 *   their SurfaceEvents / activation hook     ──mapping───▶  my PePanelCommandV1
 *
 * Flow decisions carried in (owner-approved 2026-08-25):
 *  - PEF-backed-by-signals: Use-original on the PE surface and Cancel on the
 *    MPS offer open the PEF feedback surface first; a category click records
 *    the content-free pe_feedback_suggested signal, then the remembered
 *    terminal command completes the flow; Esc on PEF skips straight to the
 *    terminal. Esc on the PE surface itself closes IMMEDIATELY with no PEF —
 *    the CLI's shipped rule ("Feedback opens ONLY when the user chooses Use
 *    original prompt", cli-submit-popup.ts:1469-1471; its §8.3 comment is
 *    stale). PEF renders the CLI's full three rows — the two categories AND
 *    the free-text "Other" (PE-BR-11 closed 2026-08-25: typed feedback
 *    persists via the browser feedback store, host-side).
 *  - Details-apply is the CLI's LOCAL merge (their controller does it); the
 *    merged body reaches the engine as its own edit_body command, so the
 *    engine's editedBodyText tracks what the user sees.
 *  - The dock's ✕ (window furniture) maps to plain close on every surface —
 *    window dismissal is not the CLI's Esc and skips PEF.
 *  - The activation hook returns 'refuse' after emitting, which suppresses the
 *    fixture era's "static build" notices; the engine's re-render is the echo.
 */

import {
  PE_FEEDBACK_OTHER_MAX_CHARS,
  type PePanelAnyViewV1,
  type PePanelCommandV1,
  type PePanelControllerV1,
  type PePanelEventV1,
  type PeSequenceOfferViewV1,
  type PePanelViewV1,
} from './pe-contract.js';
import type { SurfaceModel, SurfaceRow } from './surfaces/surface-model.js';
import { mountNexpathDock, type NexpathDockController } from './surfaces/dock.js';
import { installChromeStyles } from './surfaces/chrome.js';
import {
  createSurfaceController,
  type SurfaceController,
  type SurfaceEvent,
} from './surfaces/surface-controller.js';
import { fieldScroller } from './surfaces/surface-view.js';
import { BODY_HINT, DETAILS_HINT, EDIT_KEYS_HINT, PE_FOOTER } from './surfaces/fixtures/pe.js';
import { PEF_FOOTER } from './surfaces/fixtures/pef.js';
import { MPS_FIRST_FOOTER } from './surfaces/fixtures/mps.js';

const PEF_CATEGORY_BY_LABEL: Record<string, 'not_relevant_enough' | 'too_much_or_too_long'> = {
  'Not relevant enough': 'not_relevant_enough',
  'Too much or too long': 'too_much_or_too_long',
};

/** The terminal that completes the flow once the PEF surface resolves. */
type PendingTerminal = { type: 'close' } | { type: 'use_original' } | { type: 'mps_cancel' };

// ── producers: my views → their models ─────────────────────────────────────────

/** The CLI's refinement-return label (`cli-submit-popup.ts:541`). */
const CLI_GO_BACK_LABEL = '← Go back';

/** Shown under a locked (compose-failed) body — see the bodyRow comment. */
const LOCKED_BODY_HINT =
  'Read-only — enhanced wording unavailable · Enter sends this prompt as shown';

export function peSurfaceModel(view: PePanelViewV1): SurfaceModel {
  // The engine's editability verdict is SEND-PATH semantics, not styling: a
  // read-only fallback body (`editabilityState: 'read_only_fallback'`) rejects
  // every edit_body, and the host's translate() rightly never synthesizes one
  // for an uneditable body. Rendering such a body editable let the user type
  // text the send silently discarded (live on Replit + Lovable, 2026-08-25).
  // The CLI locks its WHOLE editor in this state — body and details together
  // (`cli-submit-popup.ts:969`) — and marks the heading row "(unavailable)".
  const locked = !view.bodyEditable;
  const bodyRow: SurfaceRow = {
    kind: 'field',
    label: view.editorHeading,
    text: view.bodyText,
    hints: locked
      // A locked body is the engine's compose-FAILURE state (the deterministic
      // template stands in for wording it could not generate). The CLI shows no
      // explanation for it, and a tester reading a popup that silently refuses
      // every keystroke concluded the whole feature was broken (2026-08-25).
      // ONE always-visible line, in the CLI's own hint tone, is the smallest
      // honest fix: it says why typing does nothing and what Enter will do.
      // Owner-approved divergence, deliberately additive — no behaviour changes.
      ? { always: [LOCKED_BODY_HINT] }
      : { whenFocused: [`${EDIT_KEYS_HINT} · ${BODY_HINT}`] },
    ...(locked ? { readOnly: true, unavailable: true } : {}),
  };

  // Refinement view (after a directional): the CLI shows ONLY the editable body
  // and the final "← Go back" — no details, no directionals, no Use original
  // (`cli-submit-popup.ts:614-628`, owner request).
  if (view.refinement) {
    return finishPeModel(view, [
      bodyRow,
      { kind: 'action', label: CLI_GO_BACK_LABEL, blankBefore: true },
    ]);
  }

  // Row availability, CLI-style: unavailable rows RENDER with the marker, never
  // hide (`cli-submit-popup.ts:630-639` builds the details row unconditionally;
  // :672 the use-original row; :777 the marker). Older SW views omit the
  // availability fields — fall back to the control-presence flag they do carry.
  const detailsAvailable = view.detailsAvailable ?? view.hasAdditionalDetails;
  const originalAvailable = view.originalAvailable ?? true;
  const rows: SurfaceRow[] = [
    bodyRow,
    {
      kind: 'field',
      label: 'Additional details',
      text: view.additionalDetailsText,
      hints: { always: [DETAILS_HINT], whenFocused: [EDIT_KEYS_HINT] },
      blankBefore: true,
      maxLines: 5, // the CLI windows the details field at 5 rows (:1335)
      ...(locked || !detailsAvailable ? { readOnly: true } : {}),
      ...(!detailsAvailable ? { unavailable: true } : {}),
    },
  ];
  // DIRECTIONAL ROWS (Shorter / More thorough / More project-grounded) ARE NOT
  // RENDERED — owner ruling 2026-08-25, matching the shipped CLI exactly. The
  // CLI's own row loop is commented out verbatim at `cli-submit-popup.ts:641-662`
  // ("HIDDEN from the PE popup UI, owner decision 2026-08-19"), so a real CLI
  // popup shows only: the body, Additional details, Use original prompt.
  // Rendering them here was worse than cosmetic: the engine can silently refuse
  // an action whose availability is not 'available' (the CLI's F3 silent-keep
  // discipline), so a user clicked a row that looked live and NOTHING happened —
  // a direct contributor to the tester's "nothing works" report.
  // The activation hook below still understands directionals, so re-enabling is
  // one row-builder away; the engine side was never touched.

  // No blank line before Use original — the CLI's blank-line rule covers only
  // the details block, the first directional, and Go back (:769-775).
  rows.push({
    kind: 'action',
    label: 'Use original prompt',
    act: 'use-original',
    ...(originalAvailable ? {} : { unavailable: true }),
  });
  return finishPeModel(view, rows);
}

function finishPeModel(view: PePanelViewV1, rows: SurfaceRow[]): SurfaceModel {
  const model: SurfaceModel = {
    id: 'prompt_enhancement',
    label: 'Prompt enhancement',
    rows,
    footer: PE_FOOTER,
  };
  if (view.pinchLabel) model.pinch = view.pinchLabel;
  if (view.whyHelp) model.whyHelp = view.whyHelp;
  if (view.trustCues.length > 0) model.trustCues = view.trustCues;
  if (view.providerFailureNotice) model.providerFailure = view.providerFailureNotice;
  return model;
}

export function mpsSurfaceModel(view: PeSequenceOfferViewV1): SurfaceModel {
  const rows: SurfaceRow[] = [
    {
      kind: 'field',
      label: view.heading,
      text: view.bodyText,
      hints: { whenFocused: [`${EDIT_KEYS_HINT} · ${BODY_HINT}`] },
    },
  ];
  if (view.remainingTaskCount > 0) {
    rows.push({ kind: 'note', text: 'Sequence plan', indent: 2, tone: 'plain', blankBefore: true });
    for (const line of view.taskSummaryLines) {
      rows.push({ kind: 'note', text: line, indent: 4, tone: 'dim' });
    }
  }
  rows.push({
    kind: 'action',
    label: view.cancelLabel,
    act: 'cancel-sequence',
    tone: 'cancel',
    blankBefore: true,
  });

  const model: SurfaceModel = {
    id: 'mps_first',
    label: 'Multi-prompt sequence',
    rows,
    footer: MPS_FIRST_FOOTER,
  };
  if (view.pinchLabel) model.pinch = view.pinchLabel;
  if (view.whyHelp) model.whyHelp = view.whyHelp;
  if (view.providerFailureNotice) model.providerFailure = view.providerFailureNotice;
  return model;
}

/**
 * PEF — the CLI's three rows exactly (`cli-submit-popup.ts:1112`): the two
 * suggested categories plus the free-text "Other" (inline editable field,
 * placeholder "(type your feedback)" :1202, edit-keys hint when focused
 * :1205). PE-BR-11 closed 2026-08-25 — typed feedback persists via the
 * browser feedback store.
 */
export function pefSurfaceModel(): SurfaceModel {
  return {
    id: 'prompt_enhancement_feedback',
    label: 'Prompt enhancement feedback',
    fieldIndent: 6,
    hintIndent: 6,
    rows: [
      { kind: 'action', label: 'Not relevant enough' },
      { kind: 'action', label: 'Too much or too long' },
      {
        kind: 'field',
        label: 'Other',
        text: '',
        placeholder: '(type your feedback)',
        hints: { whenFocused: [EDIT_KEYS_HINT] },
      },
    ],
    footer: PEF_FOOTER,
  };
}

// ── the adapter ────────────────────────────────────────────────────────────────

export interface PeDockAdapterOptions {
  onEvent: (event: PePanelEventV1) => void;
  /**
   * The user has REACHED a terminal decision, before the feedback step runs.
   *
   * "Use original prompt" parks its command and shows the feedback surface
   * first, so the command itself arrives only once feedback is given or skipped.
   * On the submit path that means the user's prompt stays HELD for the whole of
   * a satisfaction survey — and, with no hold ceiling, is stranded forever if
   * the survey is simply abandoned. This fires the moment the decision is made,
   * so the held prompt can be released immediately while feedback continues.
   */
  onTerminalIntent?: (outcome: 'use_original') => void;
  /** Document override for tests. */
  doc?: Document;
}

export function mountNexpathPeDock(opts: PeDockAdapterOptions): PePanelControllerV1 {
  let dock: NexpathDockController | null = null;
  let surfaces: SurfaceController | null = null;
  let view: PePanelAnyViewV1 | null = null;
  let busy = false;
  let busyOverlay: HTMLDivElement | null = null;
  let pendingTerminal: PendingTerminal | null = null;
  // True only while the feedback surface is up after a terminal choice.
  let collectingFeedback = false;
  /** One-shot: the NEXT show() is the engine's echo of a details apply — the
   * rebuild parks the view at the top, but the CLI's apply behaviour is "the
   * view scrolls to where the details landed" (cli-submit-popup.ts:1037), so
   * that one rebuild must follow the caret (parked at the body's end). */
  let followCaretOnNextShow = false;

  const doc = opts.doc ?? document;

  const emitCommand = (command: PePanelCommandV1): void => {
    if (!view || busy) return;
    opts.onEvent({ type: 'command', viewSeq: view.viewSeq, command });
  };

  /** Complete a PEF resolution: fire the remembered terminal (if any). */
  const completePending = (): void => {
    const terminal = pendingTerminal;
    pendingTerminal = null;
    collectingFeedback = false;
    if (terminal) emitCommand(terminal);
  };

  const directionalByLabel = (label: string): PePanelViewV1['directional'][number] | undefined =>
    view && !('kind' in view) ? view.directional.find((d) => d.label === label) : undefined;

  /** Their activation hook — my commands come out of here, their notices never fire. */
  const resolveActivation = (
    model: SurfaceModel,
    row: SurfaceRow,
    bodyText: string,
  ): { model: SurfaceModel } | 'refuse' | null => {
    if (row.kind === 'note') return 'refuse';

    if (model.id === 'prompt_enhancement_feedback') {
      if (row.kind === 'action') {
        const category = PEF_CATEGORY_BY_LABEL[row.label];
        if (category) emitCommand({ type: 'feedback_suggested', category });
        completePending();
        return 'refuse';
      }
      if (row.kind === 'field') {
        // The Other row: Enter submits non-empty bounded text; empty or over
        // the CLI's 5,000-char cap is the CLI's silent `pending`
        // (cli-submit-popup.ts:1164-1166). The Other text arrives as this
        // surface's first (only) field — the hook's bodyText parameter.
        const text = bodyText.trim();
        if (text.length === 0 || text.length > PE_FEEDBACK_OTHER_MAX_CHARS) return 'refuse';
        emitCommand({ type: 'feedback_other', text });
        completePending();
        return 'refuse';
      }
      return 'refuse';
    }

    if (row.kind === 'field') {
      // Only the BODY field's Enter is ours (send); the details field falls
      // through to the controller's CLI-parity local merge.
      const isBody = model.rows.find((r) => r.kind === 'field') === row;
      if (!isBody) return null;
      if (bodyText.trim().length === 0) return 'refuse'; // BF-1 silent guard
      emitCommand(model.id === 'mps_first'
        ? { type: 'mps_send', bodyText }
        : { type: 'use_current', bodyText });
      return 'refuse';
    }

    // Action rows.
    if (row.act === 'use-original') {
      pendingTerminal = { type: 'use_original' };
      collectingFeedback = true;
      // Announce the decision NOW. The command still follows the CLI's
      // feedback-first ordering; this only stops a held prompt from waiting on
      // the survey.
      try { opts.onTerminalIntent?.('use_original'); } catch { /* notice only */ }
      return { model: pefSurfaceModel() };
    }
    if (row.act === 'cancel-sequence') {
      pendingTerminal = { type: 'mps_cancel' };
      collectingFeedback = true;
      return { model: pefSurfaceModel() };
    }
    if (row.label === CLI_GO_BACK_LABEL) {
      emitCommand({ type: 'go_back' });
      return 'refuse';
    }
    const directional = directionalByLabel(row.label);
    if (directional) {
      if (directional.availability !== 'available') return 'refuse'; // CLI silent guard
      emitCommand({ type: directional.actionType, bodyText });
      return 'refuse';
    }
    return 'refuse'; // unknown rows never fall to the fixture-era notice
  };

  const onSurfaceEvent = (event: SurfaceEvent): void => {
    switch (event.type) {
      case 'apply-details':
        // The controller already merged locally (CLI parity); tell the engine
        // so its editedBodyText tracks what the user now sees. The engine's
        // re-render echo rebuilds this surface — keep the CLI's scrolled-to-
        // the-merge position across that rebuild.
        followCaretOnNextShow = true;
        emitCommand({ type: 'edit_body', bodyText: event.mergedBody });
        return;
      case 'cancelled':
        // Esc on the PE surface = the CLI's immediate close: "Feedback opens
        // ONLY when the user chooses Use original prompt … Close / Esc / crash
        // send nothing and show no feedback" (cli-submit-popup.ts:1469-1471 —
        // the shipped code; the §8.3 'every cancel' comment there is stale).
        emitCommand({ type: 'close' });
        return;
      case 'declined':
        // Esc on the MPS offer with no editor focused.
        emitCommand({ type: 'mps_decline' });
        return;
      case 'feedback-skipped':
        completePending();
        return;
      default:
        return; // send/use-original/cancel-sequence/feedback are hook-intercepted
    }
  };

  const ensureDock = (): NexpathDockController => {
    if (dock) return dock;
    // Stale-dock sweep: an extension reload leaves the previous content-script
    // generation's MAIN-world module alive on SPA pages, and its window-event
    // listeners still mount THEIR dock on the next show — two identical docks
    // stack and the user types into whichever paints on top while only ours
    // talks to a live service worker. Any host from another generation dies
    // here, before ours mounts (its orphaned controller then toggles a
    // detached element — harmless).
    for (const stale of doc.querySelectorAll('#nexpath-dock-host')) stale.remove();
    dock = mountNexpathDock({
      doc,
      onEvent: () => {
        // The dock's ✕ — window furniture, not the CLI's Esc: plain close.
        //
        // This MUST bypass the busy guard. `emitCommand` silently drops while
        // busy, but the hide below is unconditional — so clicking ✕ on a busy
        // popup made the panel vanish while the service worker was never told,
        // leaving its popup loop waiting forever on a command that could never
        // arrive. That wedged the project's mailbox and every later stop was
        // refused with `popup_already_open`: NO popup ever again for that
        // project until the worker restarted (which it does not while the user
        // keeps chatting, or while DevTools is attached). One click, popups
        // dead. The window's close control must always be answerable.
        if (view) {
          opts.onEvent({
            type: 'command',
            viewSeq: view.viewSeq,
            command: 'kind' in view ? { type: 'mps_decline' } : { type: 'close' },
          });
        }
        dock?.hide();
      },
    });
    // The CLI frame's stylesheet lives in chrome.ts and must be installed into
    // the dock's shadow root ONCE, exactly as the harness does — without it the
    // surfaces render as unstyled transparent text over the agent page
    // (live-caught on Bolt, 2026-08-25).
    installChromeStyles(dock.mountEl.getRootNode() as ShadowRoot);
    return dock;
  };

  const setBusyOverlay = (on: boolean): void => {
    const host = surfaces?.element.parentElement ?? null;
    if (!host) return;
    if (on) {
      if (busyOverlay) return;
      busyOverlay = doc.createElement('div');
      busyOverlay.className = 'np-busy-overlay';
      busyOverlay.style.cssText =
        'position:absolute;inset:0;background:rgba(20,3,15,.45);cursor:progress;z-index:10;';
      host.style.position = 'relative';
      host.appendChild(busyOverlay);
    } else {
      busyOverlay?.remove();
      busyOverlay = null;
    }
  };

  return {
    show(v: PePanelAnyViewV1): void {
      busy = false;
      view = v;
      pendingTerminal = null;
      collectingFeedback = false;
      const d = ensureDock();
      // The CLI PRESERVES its interaction state across re-renders unless the
      // body itself changed (cli-submit-popup.ts:1444-1453 — same
      // bodyRevision keeps focus, caret, scroll, and the typed details
      // draft). This host rebuilds the controller per render, so when the
      // incoming PE view carries the SAME body the panel already shows (a
      // notice echo, never a content change), capture that state and restore
      // it after the rebuild.
      const prevFields = surfaces
        ? ([...surfaces.element.querySelectorAll('textarea')] as HTMLTextAreaElement[])
        : [];
      const samePeBody = !('kind' in v)
        && prevFields[0] !== undefined
        && prevFields[0].value === v.bodyText;
      const preserved = samePeBody
        ? {
            focusIndex: surfaces!.getFocusIndex(),
            bodyScrollTop: prevFields[0]!.scrollTop,
            bodyCaret: prevFields[0]!.selectionStart ?? v.bodyText.length,
            detailsDraft: v.additionalDetailsText === '' ? prevFields[1]?.value ?? '' : '',
          }
        : null;
      // The dock must be VISIBLE before the surface renders: the controller's
      // render() focuses the active field, and focus() inside a display:none
      // subtree is a silent no-op — the popup then opens with the keyboard
      // still in the agent page and every arrow key dead until the user
      // clicks it (live on Replit + Lovable, 2026-08-25). Everything below
      // runs in the same task, so no intermediate frame ever paints.
      d.show();
      surfaces?.destroy();
      const isOffer = 'kind' in v;
      const registry = isOffer
        ? { mps_first: mpsSurfaceModel(v), prompt_enhancement_feedback: pefSurfaceModel() }
        : { prompt_enhancement: peSurfaceModel(v), prompt_enhancement_feedback: pefSurfaceModel() };
      surfaces = createSurfaceController(d.mountEl, {
        registry,
        initial: isOffer ? 'mps_first' : 'prompt_enhancement',
        doc,
        onEvent: onSurfaceEvent,
        resolveActivation,
        ...(preserved ? { initialFocusIndex: preserved.focusIndex } : {}),
      });
      setBusyOverlay(false);
      if (preserved) {
        const rebuilt = [...surfaces.element.querySelectorAll('textarea')] as HTMLTextAreaElement[];
        const body = rebuilt[0];
        if (body) {
          body.setSelectionRange(preserved.bodyCaret, preserved.bodyCaret);
          body.scrollTop = preserved.bodyScrollTop;
        }
        const details = rebuilt[1];
        if (details && preserved.detailsDraft && details.value === '') {
          details.value = preserved.detailsDraft;
          details.dispatchEvent(new Event('input', { bubbles: true })); // re-grow + markers
        }
      }
      if (followCaretOnNextShow) {
        followCaretOnNextShow = false;
        const bodyField = surfaces.element.querySelector('textarea');
        if (bodyField) fieldScroller.follow(bodyField);
      }
    },
    setBusy(b: boolean): void {
      busy = b;
      setBusyOverlay(b);
    },
    hide(): void {
      dock?.hide();
    },
    destroy(): void {
      surfaces?.destroy();
      surfaces = null;
      dock?.destroy();
      dock = null;
      view = null;
    },
    isOpen: () => dock?.isVisible() ?? false,
    isCollectingFeedback: () => collectingFeedback,
  };
}
