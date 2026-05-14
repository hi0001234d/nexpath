import * as vscode from 'vscode';

/**
 * First-launch onboarding for Nexpath inside Cursor / Windsurf.
 *
 * Two responsibilities:
 *   1. Ask the user for consent to monitor their chat history (persisted to
 *      `globalState` so we only ask once).
 *   2. On macOS, also surface a one-time guidance message about Full Disk
 *      Access — Cursor's chat-history database lives under
 *      `~/Library/Application Support/Cursor/` which requires FDA on macOS.
 *      The notice persists so it is not re-shown on subsequent launches.
 */

const CONSENT_KEY = 'nexpath.consentGranted';
const FDA_NOTICE_KEY = 'nexpath.fdaNoticeShown';

const FDA_URI =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';

export async function showOnboardingIfNeeded(
  context: vscode.ExtensionContext,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  if (context.globalState.get<boolean>(CONSENT_KEY) === undefined) {
    await runFirstLaunchConsent(context);
  }

  if (platform === 'darwin' && !context.globalState.get<boolean>(FDA_NOTICE_KEY)) {
    await showMacOSFullDiskAccessGuidance(context);
  }
}

async function runFirstLaunchConsent(
  context: vscode.ExtensionContext,
): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    'Allow Nexpath to read your AI chat history for prompt-level guidance? ' +
      'Data stays on your machine.',
    { modal: false },
    'Allow',
    'Not now',
  );
  const granted = choice === 'Allow';
  await context.globalState.update(CONSENT_KEY, granted);
}

async function showMacOSFullDiskAccessGuidance(
  context: vscode.ExtensionContext,
): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    'On macOS, Cursor needs Full Disk Access to allow Nexpath to read your ' +
      "chat history. Open System Settings → Privacy & Security → " +
      'Full Disk Access and enable Cursor.',
    'Open System Settings',
    'Later',
  );
  if (choice === 'Open System Settings') {
    await vscode.env.openExternal(vscode.Uri.parse(FDA_URI));
  }
  await context.globalState.update(FDA_NOTICE_KEY, true);
}
