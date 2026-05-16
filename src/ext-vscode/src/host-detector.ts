import * as vscode from 'vscode';
import { homedir, platform as osPlatform } from 'node:os';
import { join } from 'node:path';

/**
 * Host detection (B4 wiring).
 *
 * The same VS Code extension ships to Cursor, Windsurf, and plain VS Code
 * via Open VSX. At runtime the extension needs to know which host it's
 * inside so it can look up the correct `state.vscdb` paths (and, in
 * Branch 4 of the prompt-injection work, which `vscode.commands.*` id to
 * try for chat-input injection).
 *
 * VS Code's `vscode.env.appName` reports a host-specific string. Empirical
 * values across host versions:
 *   - Plain VS Code:  "Visual Studio Code" / "Code"
 *   - Cursor:         "Cursor"
 *   - Windsurf:       "Windsurf"
 *
 * We treat anything we don't recognise as a generic VS Code host (no
 * special chat-history handling).
 */

export type Host = 'cursor' | 'windsurf' | 'vscode-generic';

/** Pure mapping from `appName` to a recognised host id. */
export function classifyHost(appName: string): Host {
  const normalised = appName.toLowerCase();
  if (normalised.includes('cursor')) return 'cursor';
  if (normalised.includes('windsurf')) return 'windsurf';
  return 'vscode-generic';
}

/**
 * Read the current host from the live `vscode.env.appName`. Injectable for
 * tests via `deps.appName`.
 */
export function detectHost(deps: { appName?: string } = {}): Host {
  return classifyHost(deps.appName ?? vscode.env.appName);
}

/**
 * Per-host base directories where `state.vscdb` is expected to live.
 *
 * Mirrors the CLI-side adapter logic in `src/agents/adapters/cursor.ts`
 * and `src/agents/adapters/windsurf.ts` — the same OS rules apply, but
 * the extension can resolve them itself without going through the
 * adapter (extension and CLI are different processes).
 */
export interface HostStorageInputs {
  host?: Host;
  home?: string;
  platform?: NodeJS.Platform;
  appdata?: string;
}

export function chatHistoryBaseDir(inputs: HostStorageInputs = {}): string | null {
  const host = inputs.host ?? detectHost();
  const home = inputs.home ?? homedir();
  const platform = inputs.platform ?? osPlatform();

  if (host === 'cursor') {
    return hostConfigDir('Cursor', home, platform, inputs.appdata);
  }
  if (host === 'windsurf') {
    return hostConfigDir('Windsurf', home, platform, inputs.appdata);
  }
  // Plain VS Code host: no chat-history watching (no AI chat panel to read).
  return null;
}

function hostConfigDir(
  hostName: string,
  home: string,
  platform: NodeJS.Platform,
  appdata?: string,
): string {
  switch (platform) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', hostName);
    case 'win32':
      return join(
        appdata ?? process.env.APPDATA ?? join(home, 'AppData', 'Roaming'),
        hostName,
      );
    default:
      return join(home, '.config', hostName);
  }
}

/** Returns the `User/workspaceStorage` directory (parent of per-workspace state.vscdb files). */
export function workspaceStorageDir(inputs: HostStorageInputs = {}): string | null {
  const base = chatHistoryBaseDir(inputs);
  return base === null ? null : join(base, 'User', 'workspaceStorage');
}
