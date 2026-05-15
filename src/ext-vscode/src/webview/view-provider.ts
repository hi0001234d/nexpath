import * as vscode from 'vscode';
import { renderDecisionSessionHtml } from './html.js';
import { handleOptionSelection } from './prompt-injection.js';
import type { DecisionSessionPayload } from '../ipc.js';

/**
 * NexpathDecisionSessionViewProvider — M6 of M2 Branch 3.
 *
 * Backs the `nexpath.status` activity-bar view (declared in package.json with
 * `type: "webview"`). Renders the decision-session UI inside a VS Code
 * WebviewView and auto-reveals the view whenever a new advisory payload is
 * published — matching the "user installs once, never invokes manually"
 * UX requirement from architecture rev 2 §4 / discussion log §2 Correction 9.
 *
 * Lifecycle:
 *   1. `activate()` (in `extension.ts`) constructs an instance and registers it
 *      via `vscode.window.registerWebviewViewProvider(VIEW_ID, instance)`.
 *   2. The first time the user clicks the activity-bar icon (or the view is
 *      auto-revealed), VS Code calls `resolveWebviewView()` — we configure
 *      `enableScripts`, set the initial HTML, and wire `onDidReceiveMessage`.
 *   3. When Branch 4 wires the watcher in, on each `nexpath stop` result the
 *      adapter calls `publishPayload(payload)`. The provider stores the
 *      payload (so it survives the view being hidden + re-shown) and, if the
 *      view is currently resolved, updates the HTML and calls
 *      `webviewView.show(true)` for the auto-reveal.
 *   4. The webview's message-passing surface is two events:
 *        - `{ type: 'select', optionId, optionLabel }` → forward `optionLabel`
 *          to `handleOptionSelection()` (clipboard + toast).
 *        - `{ type: 'dismiss' }` → clear the displayed payload.
 */

export const VIEW_ID = 'nexpath.status';

interface WebviewMessage {
  type?: unknown;
  optionId?: unknown;
  optionLabel?: unknown;
}

export class NexpathDecisionSessionViewProvider
  implements vscode.WebviewViewProvider
{
  private view: vscode.WebviewView | undefined;
  private currentPayload: DecisionSessionPayload | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    /** Inject the option-selection handler for tests. */
    private readonly onSelect: (
      text: string,
    ) => Promise<void> = handleOptionSelection,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = renderDecisionSessionHtml(this.currentPayload, {
      cspSource: webviewView.webview.cspSource,
    });

    webviewView.webview.onDidReceiveMessage((raw: unknown) => {
      void this.handleMessage(raw);
    });

    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
  }

  /**
   * Publish a new payload to the webview. If the view is currently resolved,
   * update its HTML and auto-reveal it. If not yet resolved, just store the
   * payload — it'll be rendered when `resolveWebviewView` next fires.
   */
  publishPayload(payload: DecisionSessionPayload): void {
    this.currentPayload = payload;
    if (!this.view) return;
    this.view.webview.html = renderDecisionSessionHtml(payload, {
      cspSource: this.view.webview.cspSource,
    });
    this.view.show(true);
  }

  /**
   * Clear the displayed payload (e.g. after the user dismisses) and reset the
   * webview to its empty/watching state.
   */
  clearPayload(): void {
    this.currentPayload = null;
    if (!this.view) return;
    this.view.webview.html = renderDecisionSessionHtml(null, {
      cspSource: this.view.webview.cspSource,
    });
  }

  /**
   * Visible to tests so the message-routing logic can be exercised directly.
   *
   * `onSelect` errors are caught + logged here rather than propagated, because
   * the caller chain (`webview.onDidReceiveMessage` → `void handleMessage()`)
   * has no `await` to catch them — an unhandled rejection would crash the
   * extension host. Real failures (e.g. a B4 `injectFn` throwing because the
   * Cursor command went away) should surface via the user-facing toast in
   * `handleOptionSelection` itself; the catch here is a last-resort guard.
   */
  async handleMessage(raw: unknown): Promise<void> {
    if (!raw || typeof raw !== 'object') return;
    const msg = raw as WebviewMessage;
    if (msg.type === 'select') {
      if (typeof msg.optionLabel === 'string') {
        try {
          await this.onSelect(msg.optionLabel);
        } catch (err) {
          console.error('[nexpath] onSelect failed:', err);
        }
      }
      return;
    }
    if (msg.type === 'dismiss') {
      this.clearPayload();
      return;
    }
  }

  /** Visible to tests — current payload (null = empty state). */
  getCurrentPayload(): DecisionSessionPayload | null {
    return this.currentPayload;
  }
}
