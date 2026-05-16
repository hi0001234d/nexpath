import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { CONSENT_KEY, showOnboardingIfNeeded } from './onboarding.js';
import {
  NexpathDecisionSessionViewProvider,
  VIEW_ID,
} from './webview/view-provider.js';
import { handleOptionSelection } from './webview/prompt-injection.js';
import {
  detectHost,
  windsurfCodeiumDir,
  workspaceStorageDir,
} from './host-detector.js';
import { chatInputInject } from './chat-input-injector.js';
import { enumerateStateVscdbPaths } from './path-enumerator.js';
import {
  createChatHistoryWatcher,
  type ChatHistoryWatcher,
} from './chat-history-watcher.js';
import { createChatEventHandler } from './chat-pipeline.js';
import { spawnAuto, spawnStop } from './ipc.js';
import type { WatchTarget } from './chat-history-types.js';

/**
 * Module-level state held across activate / deactivate so the watcher's
 * resources can be cleaned up properly. View-provider lookup is exposed
 * via `getViewProvider()` so other modules can publish payloads even
 * outside the natural watcher → pipeline → view-provider chain.
 */
let viewProvider: NexpathDecisionSessionViewProvider | undefined;
let watcher: ChatHistoryWatcher | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('[nexpath] extension activated');

  // 1. Detect host (Cursor / Windsurf / vscode-generic). Stable for the
  //    lifetime of this extension instance.
  const host = detectHost();

  // 2. Construct + register the view provider with the B4 injectFn-aware
  //    onSelect. injectFn falls through to clipboard when the host has no
  //    matching command (the safe default; see chat-input-injector.ts).
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

  // 3. Show onboarding (consent prompt + macOS FDA guidance). May await
  //    the user's click; safe — the activate flow is allowed to block.
  try {
    await showOnboardingIfNeeded(context);
  } catch (err) {
    console.error('[nexpath] onboarding failed:', err);
  }

  // 4. Watcher start-up — gated on consent + host being recognised. If the
  //    user denied, the value is `false` (NOT undefined) → watcher does
  //    not start. If the host is vscode-generic, there's no AI chat to
  //    watch.
  const consent = context.globalState.get<boolean>(CONSENT_KEY);
  if (consent !== true) {
    console.log('[nexpath] consent not granted — watcher not started');
    return;
  }
  if (host === 'vscode-generic') {
    console.log('[nexpath] host is plain VS Code — no chat to watch');
    return;
  }

  const wsStorage = workspaceStorageDir({ host });
  const dbPaths = enumerateStateVscdbPaths(wsStorage);

  // Per dev plan §2.3 acceptance #2, Windsurf's chat data may also live at
  // `~/.codeium/windsurf/` (legacy Codeium Cascade store) in addition to
  // `state.vscdb`. Watch both when host=windsurf; skip silently if the
  // cascade dir doesn't exist (fs.watch on a missing path would throw).
  // Existence is captured at activate time — same activate-time-only
  // limitation that path-enumerator.ts documents for workspaceStorage.
  const codeiumDir =
    host === 'windsurf' ? windsurfCodeiumDir() : null;
  const codeiumExists = codeiumDir !== null && existsSync(codeiumDir);

  if (dbPaths.length === 0 && !codeiumExists) {
    console.log(
      `[nexpath] no workspace state.vscdb found under ${wsStorage} — watcher not started. ` +
        'Open at least one workspace in the host and reload the extension to retry.',
    );
    return;
  }

  const targets: WatchTarget[] = dbPaths.map((path) => ({
    path,
    kind: 'cursor-sqlite',
  }));
  if (codeiumExists) {
    targets.push({ path: codeiumDir!, kind: 'windsurf-dir' });
  }

  // 5. Build the pipeline handler (auto → stop → publish) with real
  //    dependencies (ipc.spawnAuto / ipc.spawnStop / viewProvider.publishPayload).
  //    Session id is workspace-prefixed so concurrent workspaces don't
  //    collide on the same chat tab id.
  // Workspace folder fsPath drives:
  //   - the spawn-time `cwd` for nexpath auto/stop (so Layer C resolves
  //     project root / .env / hook-stats correctly)
  //   - the session-id prefix so concurrent workspaces don't collide on
  //     the same chat-tab id
  // When VS Code is opened without a folder, fall back to the extension's
  // own cwd — Layer C will use its DEFAULT_DB_PATH and skip project-specific
  // .env loading.
  const workspaceCwd =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  const handleChatEvent = createChatEventHandler({
    spawnAuto: (prompt, sid) => spawnAuto(prompt, sid, { cwd: workspaceCwd }),
    spawnStop: (sid) => spawnStop(sid, { cwd: workspaceCwd }),
    publishPayload: (payload) => viewProvider?.publishPayload(payload),
    composeSessionId: (event) => `${workspaceCwd}|${event.rawSessionId}`,
  });

  watcher = createChatHistoryWatcher({
    targets,
    onEvent: (event) => {
      // The watcher's onEvent is sync-fire-and-forget; the handler returns
      // a Promise we deliberately don't await.
      void handleChatEvent(event);
    },
    onError: (err) => console.error('[nexpath] watcher error:', err),
    onSchemaUnknown: ({ path, observedSampleKeys }) => {
      void vscode.window.showInformationMessage(
        `Nexpath: ${path} schema is not recognised. The chat-history extractors may need updating. ` +
          `Observed keys: ${observedSampleKeys.slice(0, 3).join(', ')}…`,
      );
    },
  });

  watcher.start();
  context.subscriptions.push({ dispose: () => watcher?.stop() });
  const cascadeNote = codeiumExists ? ' + 1 windsurf-dir' : '';
  console.log(
    `[nexpath] watcher started on ${dbPaths.length} state.vscdb file(s)${cascadeNote} for host=${host}`,
  );
}

export function deactivate(): void {
  console.log('[nexpath] extension deactivated');
  watcher?.stop();
  watcher = undefined;
  viewProvider = undefined;
}

/** Lookup for other extension modules that want to publish payloads. */
export function getViewProvider(): NexpathDecisionSessionViewProvider | undefined {
  return viewProvider;
}
