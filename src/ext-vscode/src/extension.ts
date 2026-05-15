import * as vscode from 'vscode';
import { showOnboardingIfNeeded } from './onboarding.js';
import {
  NexpathDecisionSessionViewProvider,
  VIEW_ID,
} from './webview/view-provider.js';
import { handleOptionSelection } from './webview/prompt-injection.js';
import { detectHost } from './host-detector.js';
import { chatInputInject } from './chat-input-injector.js';

/**
 * Provider instance held at module scope so other modules in the extension
 * (the chat-history watcher wiring, to be added in a B5 follow-up) can
 * reach it via `getViewProvider()` to publish decision-session payloads.
 */
let viewProvider: NexpathDecisionSessionViewProvider | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('[nexpath] extension activated');

  // Resolve host (Cursor / Windsurf / generic VS Code) once at activation
  // — the value is stable for the lifetime of this extension instance.
  const host = detectHost();

  // Wire the view provider's onSelect with the B4 injectFn contract:
  //   1. Primary: try host-specific chat-input commands via vscode.commands.
  //   2. Fallback: clipboard + toast (handled by handleOptionSelection).
  const onSelect = (text: string): Promise<void> =>
    handleOptionSelection(text, {
      injectFn: (t) => chatInputInject(t, { host }),
    });

  viewProvider = new NexpathDecisionSessionViewProvider(
    context.extensionUri,
    onSelect,
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, viewProvider),
  );

  try {
    await showOnboardingIfNeeded(context);
  } catch (err) {
    console.error('[nexpath] onboarding failed:', err);
  }
}

export function deactivate(): void {
  console.log('[nexpath] extension deactivated');
  viewProvider = undefined;
}

/** Lookup for other extension modules that want to publish payloads. */
export function getViewProvider(): NexpathDecisionSessionViewProvider | undefined {
  return viewProvider;
}
