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
 *   - Devin Desktop:  "Devin"        (Cognition rebranded Windsurf → "Devin")
 *
 * `appName` alone is fragile across rebrands (the Windsurf → Devin rename
 * broke it: appName flipped to "Devin", so detection fell through to
 * vscode-generic). So we ALSO consider `vscode.env.uriScheme` (the app's url
 * protocol — "cursor" / "windsurf" / "devin"), the more stable identity
 * signal. Anything we don't recognise is a generic VS Code host (no special
 * chat-history handling).
 */

export type Host = 'cursor' | 'windsurf' | 'vscode-generic';

/**
 * Pure mapping from identity strings to a recognised host id. Pass `appName`
 * and (optionally) the `uriScheme`; either matching is enough.
 *
 * Devin Desktop is the rebranded Windsurf — same IDE, same Cascade chat +
 * hooks — so it maps to the `windsurf` host (the delivery poller + Cascade
 * inject path are identical). `codeium` is matched too for the shared
 * Codeium heritage / any future re-rename.
 */
export function classifyHost(appName: string, uriScheme = ''): Host {
  const hay = `${appName} ${uriScheme}`.toLowerCase();
  if (hay.includes('cursor')) return 'cursor';
  if (hay.includes('windsurf') || hay.includes('devin') || hay.includes('codeium')) {
    return 'windsurf';
  }
  return 'vscode-generic';
}

/**
 * Read the current host from the live `vscode.env.appName` + `vscode.env.uriScheme`.
 * Injectable for tests via `deps.appName` / `deps.uriScheme`.
 */
export function detectHost(deps: { appName?: string; uriScheme?: string } = {}): Host {
  return classifyHost(
    deps.appName ?? vscode.env.appName,
    deps.uriScheme ?? vscode.env.uriScheme,
  );
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

/**
 * Windsurf's legacy Codeium Cascade chat-data directory: `~/.codeium/windsurf`.
 *
 * Per dev plan §2.3 acceptance #2, the watcher monitors BOTH `state.vscdb`
 * (under `workspaceStorageDir`) AND this directory for Windsurf. The
 * directory holds per-session JSON files; the watcher dispatches it as a
 * `windsurf-dir` `WatchTarget`.
 *
 * Mirrors `codeiumCascadeDir` in `src/agents/adapters/windsurf.ts`. Kept as
 * a local copy because the sub-package's tsconfig rootDir prevents importing
 * from the root `src/agents/` tree. The `marketplace-id.test.ts` pattern is
 * the model for catching cross-file drift if either side moves.
 */
export function windsurfCodeiumDir(home: string = homedir()): string {
  return join(home, '.codeium', 'windsurf');
}
