/**
 * Prompt Enhancement HTML template (P5, PEH-2).
 *
 * Pure function — given a {@link PromptEnhancementExtensionPayloadV1} (or
 * `null` for no pending PE), returns a fully self-contained HTML string
 * suitable for `webviewView.webview.html = …`. No side effects, no filesystem
 * reads. A **new sibling module** to `html.ts` — `html.ts` itself is untouched
 * (`html.test.ts` locks its literal source text; the Decision Session and PE
 * surfaces are rendered by separate modules).
 *
 * Required behaviour (PEH-2), all satisfied here:
 *   - Exactly ONE editable current-body field — a `<textarea>`, not a
 *     read-only display, and never a 3-4 option button list.
 *   - No "Show simpler options" control anywhere.
 *   - `Shorter` / `More thorough` / `More project-grounded` render as
 *     CURRENT-BODY ACTIONS (they act on the one visible body), never as
 *     alternate prompt choices to pick between.
 *   - A lightweight additional-details field, shown only when the payload
 *     marks it available.
 *   - Fallback / no-popup / blocked / loading states are rendered purely from
 *     `payload.renderState` (typed, computed in `pe-payload.ts`) — never by
 *     matching body text.
 *
 * Security/theming: identical posture to `html.ts` — CSP with nonce-scoped
 * scripts, `--vscode-*` CSS variables, and `escapeHtml` (imported from
 * `html.ts`, not reimplemented) on every user/generated string.
 */

import { escapeHtml } from './html.js';
import type { PromptEnhancementExtensionPayloadV1 } from '../pe-payload.js';

export interface PeRenderOptions {
  /** Pass `webview.cspSource` so the CSP allows the webview's local resources. */
  cspSource: string;
  /** Nonce for the inline `<script>` block. Tests pass a fixed value. */
  nonce?: string;
}

const NONCE_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateNonce(): string {
  let n = '';
  for (let i = 0; i < 32; i++) {
    n += NONCE_CHARS[Math.floor(Math.random() * NONCE_CHARS.length)];
  }
  return n;
}

const BASE_STYLE = `
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0.9em; margin: 0; line-height: 1.4; }
  .pe-status { color: var(--vscode-descriptionForeground); font-size: 0.9em; line-height: 1.5; }
`;

function shell(cspSource: string, scriptCsp: string, title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data:;${scriptCsp}">
<title>${title}</title>
<style>${BASE_STYLE}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function renderNoPopupState(cspSource: string): string {
  return shell(
    cspSource,
    '',
    'Nexpath',
    '<p class="pe-status">No prompt enhancement is pending.</p>',
  );
}

function renderLoadingState(cspSource: string): string {
  return shell(
    cspSource,
    '',
    'Nexpath · Prompt enhancement',
    '<p class="pe-status">Working on your prompt…</p>',
  );
}

function renderBlockedState(cspSource: string): string {
  return shell(
    cspSource,
    '',
    'Nexpath · Prompt enhancement',
    '<p class="pe-status">This prompt can\'t be sent as enhanced right now.</p>',
  );
}

function renderFallbackState(cspSource: string): string {
  return shell(
    cspSource,
    '',
    'Nexpath · Prompt enhancement',
    '<p class="pe-status">Showing a fallback version of this prompt.</p>',
  );
}

function renderReadyState(
  payload: PromptEnhancementExtensionPayloadV1,
  nonce: string,
  cspSource: string,
): string {
  const bodyEsc = escapeHtml(payload.currentBodyText);
  const directionalHtml = payload.directionalActions
    .map((action) => {
      const labelEsc = escapeHtml(action.label);
      const idEsc = escapeHtml(action.actionId);
      return `<button class="pe-action" data-action-id="${idEsc}" data-action-type="${action.actionType}" ${action.available ? '' : 'disabled'}>${labelEsc}</button>`;
    })
    .join('\n');
  const detailsHtml = payload.additionalDetailsAvailable
    ? '<textarea id="pe-details" class="pe-details" placeholder="Add details (optional)" rows="2"></textarea>'
    : '';
  const closeIdEsc = payload.closeActionId ? escapeHtml(payload.closeActionId) : '';

  const style = `
  .pe-body { width: 100%; box-sizing: border-box; min-height: 6em; padding: 0.7em; border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-editorWidget-border)); font-family: inherit; font-size: 0.93em; resize: vertical; }
  .pe-actions { display: flex; gap: 0.5em; flex-wrap: wrap; margin-top: 0.7em; }
  button.pe-action { padding: 0.5em 0.8em; border-radius: 4px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-border, transparent); cursor: pointer; font-family: inherit; font-size: 0.9em; }
  button.pe-action:disabled { opacity: 0.5; cursor: default; }
  button.pe-action:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
  .pe-details { width: 100%; box-sizing: border-box; margin-top: 0.7em; padding: 0.5em; border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-editorWidget-border)); font-family: inherit; font-size: 0.88em; }
  .pe-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 0.9em; }
  button.pe-deliver { padding: 0.55em 1em; border-radius: 4px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; font-family: inherit; font-size: 0.93em; }
  button.pe-deliver:hover { background: var(--vscode-button-hoverBackground); }
  button.pe-close { font-size: 0.83em; color: var(--vscode-descriptionForeground); cursor: pointer; background: none; border: none; padding: 0.3em 0; font-family: inherit; }
  button.pe-close:hover { color: var(--vscode-foreground); text-decoration: underline; }
`;

  const body = `<style>${style}</style>
<textarea id="pe-body" class="pe-body" data-body-id="${escapeHtml(payload.currentBodyId)}" data-body-revision="${payload.bodyRevision}">${bodyEsc}</textarea>
<div class="pe-actions">
${directionalHtml}
</div>
${detailsHtml}
<div class="pe-footer">
  <button class="pe-deliver" id="pe-deliver">Use this prompt</button>
  <button class="pe-close" id="pe-close" data-action-id="${closeIdEsc}">Close</button>
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const bodyEl = document.getElementById('pe-body');
  const detailsEl = document.getElementById('pe-details');

  document.getElementById('pe-deliver').addEventListener('click', () => {
    vscode.postMessage({
      type: 'pe_deliver_current_body',
      bodyId: bodyEl.dataset.bodyId,
      bodyRevision: Number(bodyEl.dataset.bodyRevision),
      bodyText: bodyEl.value,
      // P7 (PEH-7): unsubmitted text in the details field must block
      // delivery (dirty_additional_details_requires_apply_or_clear) until
      // the user presses Enter there (submits) or clears it — this is the
      // only signal proving that, computed live at click time since the
      // extension has no other way to know the field's current dirtiness.
      hasDirtyAdditionalDetails: !!(detailsEl && detailsEl.value.trim().length > 0),
    });
  });
  document.getElementById('pe-close').addEventListener('click', (ev) => {
    vscode.postMessage({ type: 'pe_close', actionId: ev.currentTarget.dataset.actionId });
  });
  document.querySelectorAll('button.pe-action').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      vscode.postMessage({
        type: 'pe_directional_action',
        actionId: btn.dataset.actionId,
        actionType: btn.dataset.actionType,
        bodyId: bodyEl.dataset.bodyId,
        bodyRevision: Number(bodyEl.dataset.bodyRevision),
        // P9 (PEH-6): unsaved manual edits must be discarded, not silently sent
        // as if canonical, when a directional action fires — this is the only
        // signal proving the textarea diverged from its last-rendered canonical
        // text, computed live at click time (defaultValue reflects the
        // server-rendered initial body; value is whatever the user has typed).
        hasDirtyBodyEdit: bodyEl.value !== bodyEl.defaultValue,
      });
    });
  });
  if (detailsEl) {
    detailsEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        vscode.postMessage({
          type: 'pe_submit_additional_details',
          bodyId: bodyEl.dataset.bodyId,
          bodyRevision: Number(bodyEl.dataset.bodyRevision),
          additionalDetailsText: detailsEl.value,
          // P9 (PEH-6): Apply is the only path sending the current VISIBLE
          // edited body alongside the details — the user may have edited the
          // body before applying details, and that edit must not be lost.
          bodyText: bodyEl.value,
        });
      }
    });
  }
</script>`;

  return shell(cspSource, ` script-src 'nonce-${nonce}';`, 'Nexpath · Prompt enhancement', body);
}

/**
 * Render the Prompt Enhancement HTML.
 *   - `payload === null` → no-popup state.
 *   - `payload.renderState` selects loading / blocked / fallback / no_popup /
 *     ready — always from typed state, never from inspecting body text.
 */
export function renderPromptEnhancementHtml(
  payload: PromptEnhancementExtensionPayloadV1 | null,
  opts: PeRenderOptions,
): string {
  const nonce = opts.nonce ?? generateNonce();
  if (payload === null) return renderNoPopupState(opts.cspSource);
  switch (payload.renderState) {
    case 'no_popup': return renderNoPopupState(opts.cspSource);
    case 'loading':  return renderLoadingState(opts.cspSource);
    case 'blocked':  return renderBlockedState(opts.cspSource);
    case 'fallback': return renderFallbackState(opts.cspSource);
    case 'ready':    return renderReadyState(payload, nonce, opts.cspSource);
  }
}
