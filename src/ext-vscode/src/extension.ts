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
import { chatInputInject, CANDIDATE_COMMANDS } from './chat-input-injector.js';
import {
  enumerateStateVscdbPaths,
  globalStorageStateVscdbPath,
} from './path-enumerator.js';
import {
  createChatHistoryWatcher,
  type ChatHistoryWatcher,
} from './chat-history-watcher.js';
import { createChatEventHandler } from './chat-pipeline.js';
import { spawnAuto, spawnStop } from './ipc.js';
import { resolveWorkspaceFromDbPath, canonicalizeCwd } from './resolve-db-workspace.js';
import { createAdvisoryFallback, type AdvisoryFallback } from './advisory-fallback.js';
import { createAdvisoryPoller, type AdvisoryPoller } from './advisory-poller.js';
import { readLatestAdvisoryMeta, readInjectedPrompt } from './advisory-store-reader.js';
import { raiseWindsurfWindow, pasteKeystroke } from './windsurf-autopaste.js';
import {
  injectViaCascadeAction,
  SEND_CHAT_ACTION_COMMAND,
  SEND_CHAT_ACTION_COMMAND_CANDIDATES,
  OPEN_CHAT_PANEL_JSON,
} from './windsurf-cascade-action.js';
import type { ChatHistoryEvent, WatchTarget } from './chat-history-types.js';
import {
  offerSetupIfNeeded,
  runSetupCommand,
  RUN_SETUP_COMMAND,
} from './installer/vscode-glue.js';

/** globalState key gating the one-time "use the status bar fallback" hint. */
const FALLBACK_HINT_KEY = 'nexpath.fallbackHintShown';

/**
 * Module-level state held across activate / deactivate so the watcher's
 * resources can be cleaned up properly. View-provider lookup is exposed
 * via `getViewProvider()` so other modules can publish payloads even
 * outside the natural watcher → pipeline → view-provider chain.
 */
let viewProvider: NexpathDecisionSessionViewProvider | undefined;
let watcher: ChatHistoryWatcher | undefined;
let advisoryPoller: AdvisoryPoller | undefined;
let logChannel: vscode.OutputChannel | undefined;

/**
 * Dedicated VS Code OutputChannel for nexpath messages — visible to
 * engineers and end-users at `View → Output → Nexpath`. Replaces the
 * plain console.log path which Cursor / VS Code only surface in the
 * Developer Tools Console (hard to discover, easy to miss). All key
 * lifecycle + watcher events log through this channel; console.log is
 * kept as a secondary destination so the existing extension.test.ts
 * console-spy assertions still pass.
 */
function log(line: string): void {
  console.log(line);
  logChannel?.appendLine(`[${new Date().toISOString()}] ${line}`);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logChannel = vscode.window.createOutputChannel('Nexpath');
  context.subscriptions.push(logChannel);
  log('[nexpath] extension activated');

  // Expose the extension root so the chat-history watcher can load the
  // better-sqlite3 binary matching THIS host's Electron ABI from prebuilds/<abi>/
  // (scalable across Cursor / VS Code Electron versions).
  process.env.NEXPATH_EXT_ROOT = context.extensionPath;

  // 1. Detect host (Cursor / Windsurf / vscode-generic). Stable for the
  //    lifetime of this extension instance. Log the raw identity too — the
  //    Windsurf→Devin rebrand changed appName/uriScheme, so this line is the
  //    first thing to check when a host shows up as vscode-generic unexpectedly.
  const host = detectHost();
  log(`[nexpath] host=${host} (appName=${JSON.stringify(vscode.env.appName)}, uriScheme=${JSON.stringify(vscode.env.uriScheme)})`);

  // 1a. Tell Layer C's popup which agent it's sending to, so its "Send to …"
  //     label names this surface (Cursor / Windsurf) instead of defaulting to
  //     "Claude". Every `nexpath auto`/`stop` we spawn inherits process.env, so
  //     setting it here is enough for the Cursor/extension-driven popup path.
  if (host === 'cursor' || host === 'windsurf') {
    process.env.NEXPATH_AGENT = host;
  }

  // 1b. CLI auto-installer (additive). The extension drives the nexpath CLI via
  //     IPC; if the user installed only this extension (no manual CLI), nothing
  //     would work. Register the manual "Set up CLI" command, and — deferred so
  //     activation never blocks — reconcile the bundled CLI (pointing IPC at the
  //     staged binary via NEXPATH_BIN) and offer one-click setup when it's
  //     missing/outdated. Independent of the chat-watch consent below: it runs
  //     regardless, and `nexpath install` has its own telemetry consent step.
  //     Entirely best-effort — any failure leaves prior behaviour untouched.
  context.subscriptions.push(
    vscode.commands.registerCommand(RUN_SETUP_COMMAND, () =>
      runSetupCommand(context, log),
    ),
  );
  setTimeout(() => {
    void offerSetupIfNeeded(context, log).catch((err) =>
      log(`[nexpath] CLI setup offer failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  }, 0);

  // 2. Construct + register the view provider with the B4 injectFn-aware
  //    onSelect. injectFn falls through to clipboard when the host has no
  //    matching command (the safe default; see chat-input-injector.ts).
  //    The same path injects a terminal-popup selection and a webview-fallback
  //    selection, so define it once and reuse.
  // Windsurf has NO extension-callable command to insert text into Cascade's
  // input (`windsurf.sendTextToChat` is an unregistered ID; the real path is an
  // internal `addCascadeInput` webview protobuf). So on Windsurf we do what a user
  // would: copy → focus Cascade → simulate the paste shortcut. Returns true when
  // the keystroke was dispatched (suppresses the clipboard toast); false leaves the
  // clipboard + toast fallback in place.
  const windsurfInject = async (text: string): Promise<boolean> => {
    // PRIMARY — direct insert via Windsurf's real `sendChatActionMessage` command:
    // focus the Cascade panel (`openChatPanel`) then add the text to its input
    // (`addCascadeInput`). No clipboard, no keystroke, no window/focus race, and it
    // targets the EXISTING conversation (not a new chat). Command + protobuf shape
    // are verified against the Windsurf 2.3.x workbench bundle. See
    // windsurf-cascade-action.ts.
    const direct = await injectViaCascadeAction(text, {
      executeCommand: (id, ...args) => vscode.commands.executeCommand(id, ...args),
      getCommands: (filter) => vscode.commands.getCommands(filter),
    });
    if (direct) {
      log('[nexpath] windsurf inject → inserted into Cascade via sendChatActionMessage(addCascadeInput)');
      return true;
    }

    // FALLBACK — older builds without `sendChatActionMessage`: clipboard + focus
    // the panel (same `openChatPanel` action when present) + simulate paste.
    await vscode.env.clipboard.writeText(text); // for the paste AND as the last-ditch fallback
    raiseWindsurfWindow();
    await new Promise((r) => setTimeout(r, 150));
    let focused = false;
    try {
      await vscode.commands.executeCommand(SEND_CHAT_ACTION_COMMAND, OPEN_CHAT_PANEL_JSON);
      focused = true;
    } catch { /* command absent on this build — paste into whatever has focus */ }
    await new Promise((r) => setTimeout(r, focused ? 400 : 250));
    const ok = pasteKeystroke();
    log(`[nexpath] windsurf inject (fallback) → ${ok ? `auto-pasted into Cascade (${focused ? 'openChatPanel → ' : ''}Ctrl+V)` : 'no keystroke tool; left on clipboard'}`);
    return ok;
  };
  const injectIntoChat = (text: string): Promise<void> =>
    handleOptionSelection(text, {
      injectFn: host === 'windsurf' ? windsurfInject : (t) => chatInputInject(t, { host }),
    });

  // Diagnostic (Cursor): which insert command does THIS Cursor expose? We never
  // call `composer.newChat` (it opens a NEW chat) — the advisory must land in the
  // existing chat. Log the candidates present + all chat-related commands so the
  // real "insert into existing chat input" command can be confirmed from Output
  // without console eval, then wired as a verified candidate.
  if (host === 'cursor') {
    void vscode.commands.getCommands(true).then((cmds) => {
      const present = CANDIDATE_COMMANDS.cursor.filter((c) => cmds.includes(c));
      const chatish = cmds.filter((c) => /aichat|composer|aipopup|chat/i.test(c));
      log(`[nexpath] cursor inject-command present: ${present.join(', ') || 'NONE (will use clipboard fallback → paste into existing chat)'}`);
      log(`[nexpath] cursor chat-related commands (${chatish.length}): ${chatish.slice(0, 60).join(', ')}`);
    }, () => { /* getCommands unavailable — ignore */ });
  }

  // One-click self-test (Command Palette → "Nexpath: Test Cascade Inject"): runs
  // the exact inject path with a probe so the inject can be verified in isolation
  // from the popup/poller chain. Watch Cascade's input + Output → Nexpath.
  context.subscriptions.push(
    vscode.commands.registerCommand('nexpath.testCascadeInject', async () => {
      const probe = 'NEXPATH SELF-TEST — if you see this in Cascade, inject works.';
      log('[nexpath] testCascadeInject: running inject self-test…');
      await injectIntoChat(probe);
      void vscode.window.showInformationMessage(
        'Nexpath: ran the Cascade inject self-test. Did the probe text appear in Cascade? See Output → Nexpath.',
      );
    }),
  );
  viewProvider = new NexpathDecisionSessionViewProvider(
    context.extensionUri,
    injectIntoChat,
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, viewProvider),
  );

  // 2b. In-editor advisory fallback. Layer C's terminal popup is the primary
  //     advisory surface, but it is environment-fragile (needs a GUI terminal +
  //     $DISPLAY + session bus on Linux, and can land behind the editor). When a
  //     prompt cycle produces an advisory the popup didn't deliver, this lights a
  //     status-bar item that reveals the advisory in the webview — a surface that
  //     works on every OS with no terminal. It reads Layer C's store read-only;
  //     no Layer C code changes.
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.command = 'nexpath.showAdvisory';
  context.subscriptions.push(statusBarItem);

  const advisoryFallback: AdvisoryFallback = createAdvisoryFallback({
    publishPayload: (payload) => viewProvider?.publishPayload(payload),
    statusBar: {
      show: (text, tooltip) => {
        statusBarItem.text = text;
        statusBarItem.tooltip = tooltip;
        statusBarItem.show();
      },
      hide: () => statusBarItem.hide(),
    },
    showInfoOnce: (message) => {
      if (context.globalState.get<boolean>(FALLBACK_HINT_KEY) === true) return;
      void context.globalState.update(FALLBACK_HINT_KEY, true);
      void vscode.window.showInformationMessage(message);
    },
  });
  context.subscriptions.push(
    vscode.commands.registerCommand('nexpath.showAdvisory', () =>
      advisoryFallback.showAdvisory(),
    ),
  );

  // 3. On hosts that route non-modal info messages to the silent
  //    notification stack (Cursor, Windsurf) instead of surfacing them as
  //    transient bottom-right toasts (VS Code's default), pre-open the
  //    notification panel so the consent toast in `showOnboardingIfNeeded`
  //    is immediately visible. Best-effort — failures are silent because
  //    the command id is host-dependent and the toast still lands in the
  //    panel either way.
  if (host !== 'vscode-generic') {
    try {
      await vscode.commands.executeCommand('notifications.showList');
    } catch {
      // ignored — discoverability hint, not load-bearing
    }
  }

  // 4. Show onboarding (consent prompt + macOS FDA guidance). May await
  //    the user's click; safe — the activate flow is allowed to block.
  try {
    await showOnboardingIfNeeded(context);
  } catch (err) {
    log(`[nexpath] onboarding failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    console.error('[nexpath] onboarding failed:', err);
  }

  // 5. Watcher start-up — gated on consent + host being recognised. If the
  //    user denied, the value is `false` (NOT undefined) → watcher does
  //    not start. If the host is vscode-generic, there's no AI chat to
  //    watch.
  const consent = context.globalState.get<boolean>(CONSENT_KEY);
  log(`[nexpath] consent state: ${JSON.stringify(consent)}, host: ${host}`);
  if (consent !== true) {
    log('[nexpath] consent not granted — watcher not started');
    return;
  }
  if (host === 'vscode-generic') {
    log('[nexpath] host is plain VS Code — no chat to watch');
    return;
  }

  // 5b. Windsurf delivery bridge. Windsurf encrypts Cascade at rest, so the
  //     extension can't capture prompts here — capture comes from the native
  //     Cascade hooks (`nexpath auto`, a separate process) which park advisories
  //     in the store. Poll the store and hand fresh advisories to the same
  //     in-editor fallback the watcher uses on Cursor (status bar → webview →
  //     chat-input inject). This is what gives Windsurf the Cursor-style
  //     auto-inject the read-only hooks can't. Started before the watcher setup
  //     so it runs even when no state.vscdb exists to watch.
  if (host === 'windsurf') {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const roots = Array.from(new Set([canonicalizeCwd(ws), ws]));
    advisoryPoller = createAdvisoryPoller({
      projectRoots: roots,
      // Option-independent detection: the popup bridge must fire even though the
      // advisory row has no generated options (option auto→stop move). The
      // in-editor fallback (advisory-fallback.ts) keeps its own options-aware
      // readLatestAdvisory for DISPLAY — unchanged.
      readAdvisory: (root) => readLatestAdvisoryMeta(root),
      readInjected: (root) => readInjectedPrompt(root),
      // Popup selection → inject into Cascade + clear the fallback.
      onSelection: async (prompt) => {
        advisoryFallback.clear();
        log('[nexpath] windsurf: bridging popup selection → Cascade via sendChatActionMessage(addCascadeInput)');
        await injectIntoChat(prompt);
      },
      // Popup ran but no selection → surface the in-editor fallback.
      onArm: (root) => advisoryFallback.armIfPending(root),
    });
    advisoryPoller.start();
    log('[nexpath] windsurf inject = direct sendChatActionMessage(openChatPanel→addCascadeInput); clipboard+keystroke is the fallback. Run "Nexpath: Test Cascade Inject" to verify.');
    context.subscriptions.push({ dispose: () => advisoryPoller?.stop() });
    log(`[nexpath] windsurf advisory poller started for roots: ${roots.join(' | ')}`);
    // Diagnostic: which inject command does THIS host expose? The Devin rebrand
    // can re-namespace `windsurf.* → devin.*`; log what's present so direct
    // insert (vs the clipboard fallback) can be confirmed without console eval.
    void vscode.commands.getCommands(true).then((cmds) => {
      const present = SEND_CHAT_ACTION_COMMAND_CANDIDATES.filter((c) => cmds.includes(c));
      const chatish = cmds.filter((c) => /sendchataction|cascade|chat|devin|windsurf|codeium/i.test(c));
      log(`[nexpath] windsurf inject-command present: ${present.join(', ') || 'NONE (will use clipboard fallback)'}`);
      log(`[nexpath] windsurf chat-related commands (${chatish.length}): ${chatish.slice(0, 50).join(', ')}`);
    }, () => { /* getCommands unavailable — ignore */ });
  }

  const wsStorage = workspaceStorageDir({ host });
  const allDbPaths = enumerateStateVscdbPaths(wsStorage);

  // Multi-workspace correctness (R4.3 fix):
  // Cursor / Windsurf keep ONE workspaceStorage/<hash>/state.vscdb per open
  // workspace, but every running extension instance can see all of them.
  // If every instance watched every db, two open windows would each capture
  // every prompt — producing duplicate rows in prompt-store.db with one
  // row mis-attributed to the wrong window's cwd.
  //
  // The defensive choice: filter to dbs whose sibling workspace.json#folder
  // matches THIS instance's workspaceCwd. Each db ends up watched by
  // exactly one instance, so prompts land in prompt-store.db exactly once
  // with the correct project_root.
  //
  // Fallback ladder:
  //   - No workspace folder open (window-without-folder): can't filter →
  //     keep current "watch all" behaviour so the user still gets capture.
  //   - workspace.json missing / multi-root (.code-workspace with
  //     `configuration` not `folder`) / unparseable: keep that db in the
  //     watch list, and rely on per-event cwd resolution below to attribute
  //     correctly.
  const ownWorkspaceCwd =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  const dbPaths =
    ownWorkspaceCwd === null
      ? allDbPaths
      : allDbPaths.filter((p) => {
          const folder = resolveWorkspaceFromDbPath(p);
          // null → workspace.json missing/unparseable → keep as defensive
          // catch-all (per-event resolution will sort attribution).
          return folder === null || folder === ownWorkspaceCwd;
        });
  if (ownWorkspaceCwd !== null && dbPaths.length < allDbPaths.length) {
    log(
      `[nexpath] filtered ${allDbPaths.length - dbPaths.length} cross-workspace db(s); ` +
        `watching ${dbPaths.length} for own workspace ${ownWorkspaceCwd}`,
    );
  }

  // Per dev plan §2.3 acceptance #2, Windsurf's chat data may also live at
  // `~/.codeium/windsurf/` (legacy Codeium Cascade store) in addition to
  // `state.vscdb`. Watch both when host=windsurf; skip silently if the
  // cascade dir doesn't exist (fs.watch on a missing path would throw).
  // Existence is captured at activate time — same activate-time-only
  // limitation that path-enumerator.ts documents for workspaceStorage.
  const codeiumDir =
    host === 'windsurf' ? windsurfCodeiumDir() : null;
  const codeiumExists = codeiumDir !== null && existsSync(codeiumDir);

  // Cursor's modern Composer / Agent mode stores conversations in
  // `globalStorage/state.vscdb` (shared file across all workspaces) under
  // the `cursorDiskKV` table — NOT in `workspaceStorage`. Add it as a
  // target unconditionally on Cursor hosts so Agent / Composer prompts
  // actually reach the pipeline. Multi-window caveat: two open Cursor
  // windows will both watch this file and both emit each new bubble (no
  // cross-instance dedup), so each event reaches Layer C twice with each
  // window's respective `workspaceCwd`. Documented as a known v0.1.3
  // limitation (single-window is the common case).
  const globalDbPath =
    host === 'cursor' ? globalStorageStateVscdbPath(wsStorage) : null;
  log(
    `[nexpath] enumerated ${dbPaths.length} state.vscdb file(s) under ${wsStorage}; ` +
      `globalStorageDb=${globalDbPath === null ? 'absent' : 'present'}; ` +
      `codeiumExists=${codeiumExists}`,
  );
  if (dbPaths.length === 0 && globalDbPath === null && !codeiumExists) {
    log(
      `[nexpath] no workspace state.vscdb, no global state.vscdb, and no codeium dir found — watcher not started. ` +
        'Open at least one workspace in the host and reload the extension to retry.',
    );
    return;
  }

  const targets: WatchTarget[] = dbPaths.map((path) => ({
    path,
    kind: 'cursor-sqlite',
  }));
  if (globalDbPath !== null) {
    targets.push({ path: globalDbPath, kind: 'cursor-sqlite' });
  }
  if (codeiumExists) {
    targets.push({ path: codeiumDir!, kind: 'windsurf-dir' });
  }

  // 6. Build the pipeline handler (auto → stop → publish) with real
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
  // Per-event cwd resolution (defense-in-depth alongside the enumeration
  // filter above). For every captured prompt, derive cwd from the db that
  // fired the event — NOT the extension instance's workspaceCwd. Falls
  // back to instance cwd when workspace.json is missing / multi-root.
  // Canonicalize so the cwd we hand `auto` and `stop` matches the project_root
  // `auto` records (= its process.cwd(), which the OS canonicalizes). Without
  // this, on macOS the throwaway workspace under `/tmp` (a symlink to
  // `/private/tmp`) makes `auto` write project_root=/private/tmp/… while `stop`
  // looks up /tmp/… → no match → `stop_no_pending` → the popup never opens.
  const cwdForEvent = (event: ChatHistoryEvent): string =>
    canonicalizeCwd(resolveWorkspaceFromDbPath(event.sourcePath) ?? workspaceCwd);
  const handleChatEvent = createChatEventHandler({
    spawnAuto: (prompt, sid, event) =>
      spawnAuto(prompt, sid, { cwd: cwdForEvent(event) }),
    spawnStop: (sid, event) => spawnStop(sid, { cwd: cwdForEvent(event) }),
    // The user picked an option in the terminal popup → inject it into the chat
    // input and clear any waiting fallback (they've handled this advisory).
    injectSelection: async (selectedPrompt) => {
      advisoryFallback.clear();
      await injectIntoChat(selectedPrompt);
    },
    // After capture, before the popup: arm the in-editor fallback if `auto`
    // parked an advisory, so it's available even if the popup blocks (macOS
    // Automation dialog) or can't open.
    onAfterCapture: (event) =>
      advisoryFallback.armIfPending(cwdForEvent(event)),
    composeSessionId: (event) => `${cwdForEvent(event)}|${event.rawSessionId}`,
    // Wire IPC failures (e.g. nexpath binary not on PATH → ENOENT) into
    // the Nexpath OutputChannel so they surface to the user. Default logger
    // only writes to console.error which is invisible outside Developer
    // Tools. Both destinations are kept so existing test assertions on
    // console.error continue to pass.
    logger: {
      error: (msg: string, err: unknown) => {
        const detail = err instanceof Error ? err.message : String(err);
        log(`${msg} ${detail}`);
        console.error(msg, err);
      },
    },
  });

  watcher = createChatHistoryWatcher({
    targets,
    // Polling backstop: fs.watch alone is unreliable on Windows for the SQLite
    // WAL recreate pattern (fires once then goes silent → only the first prompts
    // captured). Re-read every 2s; dedup makes it safe (no re-emit of seen
    // prompts). Low latency still comes from fs.watch when it does fire.
    pollMs: 2000,
    onEvent: (event) => {
      log(`[nexpath] watcher event: prompt="${event.prompt.slice(0, 80)}" raw_session_id=${event.rawSessionId} extractor=${event.extractorId}`);
      // The watcher's onEvent is sync-fire-and-forget; the handler returns
      // a Promise we deliberately don't await.
      void handleChatEvent(event);
    },
    onError: (err) => {
      log(`[nexpath] watcher error: ${err.message}`);
      console.error('[nexpath] watcher error:', err);
    },
    onSchemaUnknown: ({ path, observedSampleKeys }) => {
      log(`[nexpath] schema unknown for ${path}; sample keys: ${observedSampleKeys.slice(0, 3).join(', ')}`);
      void vscode.window.showInformationMessage(
        `Nexpath: ${path} schema is not recognised. The chat-history extractors may need updating. ` +
          `Observed keys: ${observedSampleKeys.slice(0, 3).join(', ')}…`,
      );
    },
  });

  watcher.start();
  context.subscriptions.push({ dispose: () => watcher?.stop() });
  const cascadeNote = codeiumExists ? ' + 1 windsurf-dir' : '';
  log(
    `[nexpath] watcher started on ${dbPaths.length} state.vscdb file(s)${cascadeNote} for host=${host}`,
  );
}

export function deactivate(): void {
  log('[nexpath] extension deactivated');
  watcher?.stop();
  watcher = undefined;
  advisoryPoller?.stop();
  advisoryPoller = undefined;
  viewProvider = undefined;
  logChannel = undefined;
}

/** Lookup for other extension modules that want to publish payloads. */
export function getViewProvider(): NexpathDecisionSessionViewProvider | undefined {
  return viewProvider;
}
