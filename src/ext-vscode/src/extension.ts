import * as vscode from 'vscode';
import { showOnboardingIfNeeded } from './onboarding.js';
import {
  NexpathDecisionSessionViewProvider,
  VIEW_ID,
} from './webview/view-provider.js';

/**
 * Provider instance held at module scope so other modules in the extension
 * (e.g. the chat-history watcher wiring in Branch 4) can reach it via
 * `getViewProvider()` to publish decision-session payloads.
 */
let viewProvider: NexpathDecisionSessionViewProvider | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('[nexpath] extension activated');

  viewProvider = new NexpathDecisionSessionViewProvider(context.extensionUri);
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
