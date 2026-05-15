import * as vscode from 'vscode';
import { showOnboardingIfNeeded } from './onboarding.js';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('[nexpath] extension activated');
  try {
    await showOnboardingIfNeeded(context);
  } catch (err) {
    console.error('[nexpath] onboarding failed:', err);
  }
}

export function deactivate(): void {
  console.log('[nexpath] extension deactivated');
}
