import * as vscode from 'vscode';
import { renderPromptEnhancementHtml } from './pe-html.js';
import type { PromptEnhancementExtensionPayloadV1 } from '../pe-payload.js';

/**
 * NexpathPromptEnhancementViewProvider (P5, PEH-2 / PEH-DEP-01).
 *
 * Sibling of `NexpathDecisionSessionViewProvider` (`view-provider.ts`), same
 * lifecycle shape, backing a SEPARATE activity-bar view so the PE surface
 * never shares state or markup with the DS surface.
 *
 * P5 scope is rendering only: `publishPayload`/`clearPayload` update the
 * webview HTML via `pe-html.ts`. Message HANDLING is intentionally an
 * injectable no-op by default here — P6 ("PE webview event routing") wires
 * the real typed event routing. This mirrors how P3's `pe-store-reader.ts`
 * shipped with no consumer until P4, and P4's `injectPeResult` shipped with
 * no real target until this phase — each piece lands functional on its own,
 * wired together as its consumer arrives.
 */

export const PE_VIEW_ID = 'nexpath.promptEnhancement';

interface PeWebviewMessage {
  type?: unknown;
  [key: string]: unknown;
}

/** Default message handler: does nothing. Real routing arrives in P6. */
async function noopOnMessage(_msg: PeWebviewMessage): Promise<void> {
  // intentionally inert — see class doc
}

export class NexpathPromptEnhancementViewProvider
  implements vscode.WebviewViewProvider
{
  private view: vscode.WebviewView | undefined;
  private currentPayload: PromptEnhancementExtensionPayloadV1 | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    /** Injected for tests and for P6 to supply real event routing. */
    private readonly onMessage: (
      msg: PeWebviewMessage,
    ) => Promise<void> | void = noopOnMessage,
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

    webviewView.webview.html = renderPromptEnhancementHtml(this.currentPayload, {
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
   * Publish a new pending-PE payload. If the view is currently resolved,
   * update its HTML and auto-reveal it. If not yet resolved, just store the
   * payload — it renders when `resolveWebviewView` next fires.
   */
  publishPayload(payload: PromptEnhancementExtensionPayloadV1): void {
    this.currentPayload = payload;
    if (!this.view) return;
    this.view.webview.html = renderPromptEnhancementHtml(payload, {
      cspSource: this.view.webview.cspSource,
    });
    this.view.show(true);
  }

  /** Clear the displayed payload and reset the webview to its no-popup state. */
  clearPayload(): void {
    this.currentPayload = null;
    if (!this.view) return;
    this.view.webview.html = renderPromptEnhancementHtml(null, {
      cspSource: this.view.webview.cspSource,
    });
  }

  /**
   * Visible to tests. Malformed messages (not an object, missing a string
   * `type`) are dropped silently — the webview only ever sends its own typed
   * messages, so this is defensive, not a routing decision. `onMessage`
   * errors are caught here (not propagated) for the same reason
   * `view-provider.ts` catches `onSelect` errors: the caller chain
   * (`onDidReceiveMessage` → `void handleMessage()`) has no `await`, so an
   * unhandled rejection would crash the extension host.
   */
  async handleMessage(raw: unknown): Promise<void> {
    if (!raw || typeof raw !== 'object') return;
    const msg = raw as PeWebviewMessage;
    if (typeof msg.type !== 'string') return;
    try {
      await this.onMessage(msg);
    } catch (err) {
      console.error('[nexpath] PE onMessage failed:', err);
    }
  }

  /** Visible to tests — current payload (null = no-popup state). */
  getCurrentPayload(): PromptEnhancementExtensionPayloadV1 | null {
    return this.currentPayload;
  }
}
