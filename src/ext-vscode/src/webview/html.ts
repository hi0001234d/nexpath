/**
 * Decision-session HTML template (M7 of M2 Branch 3).
 *
 * Pure function — given a {@link DecisionSessionPayload} (or null for the
 * empty/watching state), returns a fully self-contained HTML string suitable
 * for `webviewView.webview.html = …`. No side effects, no filesystem reads.
 *
 * Security:
 *   - Content-Security-Policy with `default-src 'none'` + nonce-scoped scripts.
 *   - `'unsafe-inline'` for styles is acceptable here (no externally-sourced
 *     style URIs); M5 hardening can move styles to an external CSS file if
 *     stricter CSP is wanted.
 *   - All user-controlled strings (`advisory`, option `label` and `id`) are
 *     HTML-escaped before insertion.
 *
 * Theming:
 *   - Uses `--vscode-*` CSS variables so the UI matches the host's theme
 *     automatically (Cursor / Windsurf inherit VS Code's theme system).
 */

import type { DecisionSessionPayload } from '../ipc.js';

export interface RenderOptions {
  /** Pass `webview.cspSource` so the CSP allows the webview's local resources. */
  cspSource: string;
  /**
   * Nonce for the inline `<script>` block. Tests pass a fixed value for
   * deterministic output; production omits this and a fresh random nonce
   * is generated each render.
   */
  nonce?: string;
}

/**
 * Render the decision-session HTML.
 *   - `payload === null` → empty/watching state ("Nexpath is active…").
 *   - `payload` populated → advisory + numbered option list + dismiss button.
 */
export function renderDecisionSessionHtml(
  payload: DecisionSessionPayload | null,
  opts: RenderOptions,
): string {
  const nonce = opts.nonce ?? generateNonce();
  return payload === null
    ? renderEmptyState(opts.cspSource)
    : renderPayload(payload, nonce, opts.cspSource);
}

// ── Internals ────────────────────────────────────────────────────────────────

const NONCE_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateNonce(): string {
  let n = '';
  for (let i = 0; i < 32; i++) {
    n += NONCE_CHARS[Math.floor(Math.random() * NONCE_CHARS.length)];
  }
  return n;
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c] ?? c);
}

function renderEmptyState(cspSource: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data:;">
<title>Nexpath</title>
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 1em; margin: 0; }
  .empty { color: var(--vscode-descriptionForeground); font-size: 0.9em; line-height: 1.5; }
</style>
</head>
<body>
<p class="empty">Nexpath is active and watching for AI chat prompts.</p>
<p class="empty">Decision sessions will appear in this panel automatically when guidance is generated for a prompt.</p>
</body>
</html>`;
}

function renderPayload(
  payload: DecisionSessionPayload,
  nonce: string,
  cspSource: string,
): string {
  const optionsHtml = payload.options
    .map((opt, i) => {
      const idEsc = escapeHtml(opt.id);
      const labelEsc = escapeHtml(opt.label);
      return `<li>
  <button class="option" data-option-id="${idEsc}" data-option-label="${labelEsc}" aria-label="Use option ${i + 1}: ${labelEsc}">
    <span class="num">${i + 1}.</span>
    <span class="label">${labelEsc}</span>
  </button>
</li>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data:; script-src 'nonce-${nonce}';">
<title>Nexpath Advisory</title>
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0.9em; margin: 0; line-height: 1.4; }
  .advisory { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-editorWidget-border); padding: 0.8em; border-radius: 4px; margin-bottom: 1em; font-size: 0.93em; white-space: pre-wrap; }
  .options-header { font-size: 0.78em; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.5em; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { margin-bottom: 0.45em; }
  button.option { display: flex; align-items: flex-start; gap: 0.55em; width: 100%; text-align: left; padding: 0.65em 0.8em; border-radius: 4px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-border, transparent); cursor: pointer; font-family: inherit; font-size: 0.93em; line-height: 1.4; }
  button.option:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button.option:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: -2px; }
  .num { color: var(--vscode-descriptionForeground); flex: 0 0 auto; }
  .label { flex: 1 1 auto; word-break: break-word; }
  .dismiss { margin-top: 0.9em; font-size: 0.83em; color: var(--vscode-descriptionForeground); cursor: pointer; background: none; border: none; padding: 0.3em 0; font-family: inherit; }
  .dismiss:hover { color: var(--vscode-foreground); text-decoration: underline; }
  .dismiss:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
</style>
</head>
<body>
<div class="advisory">${escapeHtml(payload.advisory)}</div>
<div class="options-header">Suggested alternatives</div>
<ul id="options">
${optionsHtml}
</ul>
<button class="dismiss" id="dismiss">Dismiss</button>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  document.querySelectorAll('button.option').forEach((btn) => {
    btn.addEventListener('click', () => {
      vscode.postMessage({
        type: 'select',
        optionId: btn.dataset.optionId,
        optionLabel: btn.dataset.optionLabel,
      });
    });
  });
  document.getElementById('dismiss').addEventListener('click', () => {
    vscode.postMessage({ type: 'dismiss' });
  });
</script>
</body>
</html>`;
}
