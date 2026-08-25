import * as vscode from 'vscode';

/** Injected by esbuild at build time (RC24). `unknown` when built outside git. */
declare const __NEXPATH_BUILD__: string;
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { toSafeErrorRecord } from './diagnostics.js';
import { CONSENT_KEY, showOnboardingIfNeeded } from './onboarding.js';
import {
  NexpathDecisionSessionViewProvider,
  VIEW_ID,
} from './webview/view-provider.js';
import {
  NexpathPromptEnhancementViewProvider,
  PE_VIEW_ID,
} from './webview/pe-view-provider.js';
import { routePeWebviewMessage, describePeEventSafely } from './pe-events.js';
import { resolvePeSendIntent } from './pe-send-intent.js';
import { readPendingPromptEnhancement, readLatestPromptEnhancementMeta } from './pe-store-reader.js';
import { isPePopupHostLikelyAvailable } from './pe-popup-host-probe.js';
import { parsePromptEnhancementExtensionPayloadV1 } from './pe-payload.js';
import { isPeOriginTurn } from './pe-origin.js';
import { createInjectedRecordStore } from './injected-record.js';
import { injectPeBody, injectPeBodyWithFallback, resolvePeVisibleSurfaceAckState } from './pe-delivery.js';
import { createPePoller, type PePoller } from './pe-poller.js';
import { createSubmitHookPoller, type SubmitHookPoller } from './submit-hook-poller.js';
import { createSubmitClipboardDelivery, submitKeystroke, lastDarwinSubmitError, isDarwinAccessibilityDenial, scheduleWindsurfQueueFlush, warmWin32KeystrokePath } from './submit-clipboard-delivery.js';
import {
  isWindsurfSubmitAdvisoryEnabled,
  isCursorSubmitAdvisoryEnabled,
  explainSubmitFlowGate,
  writeSessionEnvSnapshot,
  readPendingSubmitDecisionMirror,
  readPendingSubmitDecision,
  peekPendingSubmitDecision,
} from './submit-advisory-runtime.js';
import { isSubmitFlowReplacementWithinGrace } from './submit-replacement-guard.js';
import { deliverSubmitReplacement } from './submit-delivery-strategy.js';
import { createSubmitAdvisoryForHost } from './submit-advisory-wiring.js';
import {
  buildPeActionRequest,
  createPeActionLoopState,
  type PeActionRequestType,
} from './pe-action-loop.js';
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
import { raiseWindsurfWindow, raiseAppWindow, pasteKeystroke } from './windsurf-autopaste.js';
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
let peViewProvider: NexpathPromptEnhancementViewProvider | undefined;
let watcher: ChatHistoryWatcher | undefined;
let advisoryPoller: AdvisoryPoller | undefined;
let pePoller: PePoller | undefined;
let logChannel: vscode.OutputChannel | undefined;
// P11 cross-confirm fix (Late-ACK ordering gap): chat-history-watcher.ts fires
// its onEvent callback without awaiting the previous handler (fire-and-forget),
// so two checkPeOrigin calls for two different turns can be in flight at once.
// Without this, a slower-resolving OLDER turn's read could publish AFTER an
// already-published NEWER turn's read, silently replacing the visible body
// with a stale one. Tracks the highest `createdAt` ever published — same
// dedup idiom pe-poller.ts already uses, never trusts row `status`.
/**
 * Cursor chat-focus commands, in the order they are attempted. **The first
 * REGISTERED command wins** (see the loop in `cursorInject`), so this order is
 * functional, not cosmetic — H1 established that submit-after-inject only
 * succeeds when the composer was genuinely focused first.
 *
 * **ORDER IS DELIBERATELY UNCHANGED — backward compatibility (2026-08-10).**
 * H1b briefly reordered this list to put `composer.focusComposer` first, on live
 * evidence that it is the precise composer focus (bundle x4, VERIFIED working)
 * while `aichat.focusChat`/`aichat.gotochat` have ZERO occurrences on Cursor
 * 3.4.20. **That reorder was reverted**, because this constant is consumed by
 * `cursorInject` on the EXISTING, SHIPPING, UN-GATED advisory path
 * (`injectIntoChat`) — not by anything new. The hook milestone's own rule (dev
 * plan §2.1) is that *every* behavioural change sits behind the
 * `NEXPATH_*_PROMPTSUBMIT_ADVISORY` switch, default off; that switch does not
 * exist yet (H2 builds it), so there was nothing to gate the change behind.
 *
 * Why reverting costs nothing: the reorder's benefit only applies to the NEW
 * submit-time flow, which does not exist yet. On Cursor 3.4.20 both orders
 * resolve to the same effective command anyway, because the loop skips
 * unregistered ids — but on a build where `aichat.focusChat` IS registered the
 * two orders genuinely differ, so shipping it un-gated would have been a real,
 * unrequested change to today's behaviour for those users.
 *
 * **H6 must apply the evidence-backed order (`composer.focusComposer` first)
 * behind the switch**, so the new flow gets the better focus while the old flow
 * stays byte-identical. See the H1b results table in the dev plan.
 *
 * Exported ONLY so the order can be pinned by a test (additive testability, the
 * same approach P2 used for the Windsurf hook's untestable popup-raise gate).
 * Nothing outside tests should import this.
 */
export const CURSOR_CHAT_FOCUS_COMMANDS_V1: readonly string[] = [
  'aichat.focusChat',
  'composer.focusComposer',
  'aichat.gotochat',
  'workbench.action.focusAuxiliaryBar',
];

let submitPoller: SubmitHookPoller | undefined;
let peLastPublishedCreatedAt = -Infinity;
/** PE-scoped typed-origin echo guard (P8). Fresh per activation, matching `watcher`. */
let peInjectedRecordStore: ReturnType<typeof createInjectedRecordStore> | undefined;

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

/**
 * Short, non-reversible stand-in for an identifier that must not be logged raw.
 *
 * Session ids are host-generated and can appear in chat storage alongside the
 * user's content, so they are correlatable but not ours to publish. Hashing
 * keeps log lines joinable across the Output channel, the dev console and
 * `~/.nexpath/nexpath.log` without writing the identifier itself.
 */
function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}


/**
 * Build the submit-time advisory poller for one host (H6).
 *
 * Everything host-specific is resolved here and nowhere else: which records to
 * accept (cross-host delivery would inject into the wrong editor), which window
 * to raise for the clipboard fallback, and which host id `chatInputInject`
 * targets. Returns `null` when the switch is off, having built nothing at all —
 * unreachable by control flow, not merely inert (`R12`).
 *
 * Used by the Cursor branch. The Windsurf branch keeps its original inline
 * construction deliberately: rewriting a shipping path to share this helper
 * would be a refactor of working code without the live E2E to catch a
 * regression. When the E2E lands, Windsurf can adopt this and the duplication
 * goes away.
 */
function buildSubmitAdvisory(
  host: 'windsurf' | 'cursor',
  enabled: boolean,
  roots: string[],
  log: (m: string) => void,
  /**
   * The host's OWN injector — mirrors the shipping flow's `injectFn` shape
   * (`injectIntoChat`, `:346`), which picks `windsurfInject` / `cursorInject` /
   * `chatInputInject` per host and lets each own its internal strategy.
   *
   * This matters for Cursor: `cursorInject` does clipboard → raise → focus loop
   * → settle → paste. H1 proved the FOCUS step is load-bearing (Enter only
   * submits after focus). `chatInputInject` skips all of it, so wiring that here
   * would have failed on real Cursor for the exact reason already recorded in
   * this milestone.
   */
  injectDirect: (text: string) => Promise<boolean>,
): SubmitHookPoller | null {
  if (!enabled) return null;
  const delivery = createSubmitClipboardDelivery({
    writeClipboard: (text) => Promise.resolve(vscode.env.clipboard.writeText(text)),
    // Reuse the shipped raiser — Linux/X11 only by design; elsewhere it returns
    // false and the paste still proceeds.
    focus: async () => raiseAppWindow([vscode.env.appName.toLowerCase(), host === 'windsurf' ? 'devin' : 'cursor', host]),
    pasteKeystroke: () => pasteKeystroke({ win32Titles: [vscode.env.appName, host === 'cursor' ? 'Cursor' : 'Devin', 'Windsurf'] }),
    // RC11: Enter only when THIS editor is focused (one raise retry inside).
    submitKeystroke: () => submitKeystroke({ host, focusEditor: () => void raiseAppWindow([vscode.env.appName.toLowerCase(), host === 'windsurf' ? 'devin' : 'cursor', host]), appName: vscode.env.appName, submitLog: log }),
    log,
  });
  return createSubmitAdvisoryForHost({
    host,
    enabled,
    projectRoots: roots,
    createPoller: (o) => createSubmitHookPoller(o as never),
    // RC22: local file first (unchanged), then the cwd-independent user-level
    // mirror — same rule as the Windsurf branch, so Cursor gets the identical
    // Windows-proof handoff.
    readPendingDecision: async (root, expectedHost) =>
      (await readPendingSubmitDecision(root, { expectedHost }))
      ?? (await readPendingSubmitDecisionMirror(roots, { expectedHost })),
    // PRIMARY: the host's own injector, exactly as the shipping flow selects it.
    injectDirect,
    fallbackClipboard: (t) => delivery.inject(t),
    submit: () => delivery.submit(),
    notify: (m) => void vscode.window.showWarningMessage(m),
    log,
    deliver: (text, d) => deliverSubmitReplacement(text, d as never) as never,
    onTiming: (t) => log(`[nexpath] submit handoff: ${JSON.stringify(t)}`),
  });
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logChannel = vscode.window.createOutputChannel('Nexpath');
  context.subscriptions.push(logChannel);
  log('[nexpath] extension activated');
  // RC24: say WHICH build this is. A tester spent three rounds reporting
  // "Windows is broken" from a bundle built off `main` on a local branch that
  // merely carried our branch's NAME — nothing in the product could contradict
  // the prompt string. Now the first two log lines identify the build.
  log(`[nexpath] build: ${typeof __NEXPATH_BUILD__ === 'string' ? __NEXPATH_BUILD__ : 'unknown'}`);
  // RC65: warm the win32 PowerShell/Add-Type keystroke path once per session —
  // the first real paste/Enter otherwise pays the ~8 s cold compile (RC52's
  // measurement; the padal Cursor round's 31.7 s inject stage sat on top of
  // it). Fire-and-forget, self-gated to win32, all failures swallowed.
  warmWin32KeystrokePath(log);

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

  // RC35: persist the GUI session env for the CLI popup host — Windsurf strips
  // it from hook spawns (measured 2026-08-21); the decider fills only MISSING
  // vars back from this snapshot. Linux-only, best-effort; failure changes nothing.
  writeSessionEnvSnapshot();

  // 1a. Tell Layer C's popup which agent it's sending to, so its "Send to …"
  //     label names this surface (Cursor / Windsurf) instead of defaulting to
  //     "Claude". Every `nexpath auto`/`stop` we spawn inherits process.env, so
  //     setting it here is enough for the Cursor/extension-driven popup path.
  if (host === 'cursor' || host === 'windsurf') {
    process.env.NEXPATH_AGENT = host;
  }

  // ── RC15 (macOS tester run, 2026-08-14): fresh-install ordering ───────────
  // On a clean machine the extension activates BEFORE `nexpath install` writes
  // `~/.nexpath/submit-flow.json`. The switch used to be read ONCE at
  // activation, so the submit poller was never built: the hook (which reads the
  // flag per invocation) blocked prompts and wrote decisions that NOBODY
  // delivered, and the un-suppressed old advisory surface popped alongside the
  // submit popups. Each host branch stores its idempotent armer here; setup
  // completion and a bounded re-check retry it until it arms. Declared BEFORE
  // the setup-command registration below so those callbacks never hit a TDZ.
  let armSubmitFlowLate: ((reason: string) => boolean) | null = null;
  // Activation-scoped (NOT the module-level poller var, which survives across
  // activations in tests): true once THIS activation armed its submit flow.
  let submitFlowArmed = false;
  // Live view of "the submit surface owns advisories" for the watcher flags —
  // flipped by the armer, read per event via getters at the watcher wiring.
  const submitSurface = { active: false };
  // RC16: one-time darwin auto-send permission hint (per activation).
  let darwinSubmitHintShown = false;
  let win32SubmitHintShown = false;
  // RC19 (Windows tester, 2026-08-17): a disarmed submit flow used to log
  // NOTHING — the ENABLED line was simply absent, so diagnosing meant
  // guessing. Say WHY, once per distinct reason (the RC15 re-check ticks
  // every 20 s; only a CHANGE is worth a line).
  let lastGateReason: string | null = null;
  const logGateOnce = (h: 'cursor' | 'windsurf', reason: string): void => {
    if (reason === lastGateReason) return;
    lastGateReason = reason;
    log(`[nexpath] submit-time advisory NOT armed (${h}): ${reason}`);
  };

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
      // RC15: setup writes ~/.nexpath/submit-flow.json — arm the submit flow
      // the moment it completes instead of waiting for an editor restart.
      runSetupCommand(context, log).then((r) => { armSubmitFlowLate?.('post-setup-command'); return r; }),
    ),
  );
  setTimeout(() => {
    void offerSetupIfNeeded(context, log)
      .then(() => { armSubmitFlowLate?.('post-setup-offer'); })
      .catch((err) =>
        log(`[nexpath] CLI setup offer failed: ${err instanceof Error ? err.message : String(err)}`),
      );
  }, 0);
  // RC15: bounded re-check — covers `nexpath install` run manually in a
  // terminal while the editor is open (no restart discipline required). Cheap:
  // one flag-file read per tick; stops as soon as the flow arms or after 10 min.
  const armRetry = setInterval(() => {
    if (armSubmitFlowLate?.('late-flag-detected')) clearInterval(armRetry);
  }, 20_000);
  const armRetryCap = setTimeout(() => clearInterval(armRetry), 600_000);
  context.subscriptions.push({ dispose: () => { clearInterval(armRetry); clearTimeout(armRetryCap); } });

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
    const ok = pasteKeystroke({ win32Titles: [vscode.env.appName, 'Devin', 'Windsurf'] });
    log(`[nexpath] windsurf inject (fallback) → ${ok ? `auto-pasted into Cascade (${focused ? 'openChatPanel → ' : ''}Ctrl+V)` : 'no keystroke tool; left on clipboard'}`);
    return ok;
  };
  // Cursor inject — land the advisory in the user's EXISTING chat (like Windsurf/
  // CLI), never a new Agent/Composer tab. Cursor exposes no extension-callable
  // "insert into the current chat input" command (composer.newChat opens a NEW
  // chat), so we mirror Windsurf's reliable path: copy → focus the existing chat
  // input → simulate the paste shortcut. Only focus commands that ACTUALLY exist
  // are run (so nothing ever opens a new chat); workbench.action.focusAuxiliaryBar
  // is a built-in present on every Cursor and focuses the chat (right side bar).
  // Order matters: the first REGISTERED command wins, and H1's spike proved that
  // submit-after-inject only succeeds when the composer was genuinely focused
  // first. Reordered 2026-08-10 (H1b) from live evidence against Cursor 3.4.20:
  //   composer.focusComposer            — present in the bundle (x4) and VERIFIED
  //                                        working live; focuses the composer itself.
  //   workbench.action.focusAuxiliaryBar — VS Code built-in; focuses the sidebar
  //                                        generically. Works, but less precise.
  //   aichat.focusChat / aichat.gotochat — ZERO occurrences in Cursor's shipped
  //                                        bundle; kept only as harmless forward/
  //                                        back-compat probes for other builds, and
  //                                        skipped at runtime by the registered-check
  //                                        below. See chat-input-injector-mechanism-truth.test.ts.
  const CURSOR_CHAT_FOCUS_COMMANDS = CURSOR_CHAT_FOCUS_COMMANDS_V1;
  const cursorInject = async (text: string): Promise<boolean> => {
    // RC65: per-stage timing. The padal round's 31.7 s inject was one opaque
    // gap between `extension_observed` and `inject_dispatched` — no way to
    // split a cold PowerShell compile from a busy Cursor absorbing the focus
    // command. Now every slow round names its stage in one line.
    const t0 = Date.now();
    await vscode.env.clipboard.writeText(text);
    const tClip = Date.now();
    raiseAppWindow('cursor');
    await new Promise((r) => setTimeout(r, 150));
    let focused = false;
    let focusedVia = '';
    let available: Set<string>;
    try {
      available = new Set(await vscode.commands.getCommands(true));
    } catch {
      available = new Set();
    }
    for (const cmd of CURSOR_CHAT_FOCUS_COMMANDS) {
      if (!available.has(cmd)) continue;
      try {
        await vscode.commands.executeCommand(cmd);
        focused = true;
        focusedVia = cmd;
        break;
      } catch { /* try next focus command */ }
    }
    const tFocus = Date.now();
    await new Promise((r) => setTimeout(r, focused ? 400 : 250));
    const tSettle = Date.now();
    const ok = pasteKeystroke({ win32Titles: [vscode.env.appName, 'Cursor'] });
    const tPaste = Date.now();
    log(`[nexpath] cursor inject → ${ok ? `auto-pasted into existing chat (${focused ? focusedVia + ' → ' : ''}Ctrl+V)` : 'no keystroke tool found; left on clipboard'}`);
    log(`[nexpath] cursor inject timing: clipboard=${tClip - t0}ms focus=${tFocus - tClip}ms(${focusedVia || 'none'}) settle=${tSettle - tFocus}ms paste=${tPaste - tSettle}ms total=${tPaste - t0}ms`);
    return ok;
  };

  const injectIntoChat = (text: string): Promise<void> =>
    handleOptionSelection(text, {
      injectFn:
        host === 'windsurf' ? windsurfInject
        : host === 'cursor' ? cursorInject
        : (t) => chatInputInject(t, { host }),
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

  // P5 (VED-PE-2): PE gets its own view, never sharing state or markup with
  // the DS view above.
  // P6 (VED-PE-3): route raw webview messages into typed PE events
  // (pe-events.ts) and log only their safe, redacted summary — extends the
  // P1 invariant (delivery body / feedback text is delivery-only, never
  // logged) to PE events. Routing needs the currently-published body
  // id/revision as context; if nothing has been published yet there is
  // nothing to route against. Validation gating (P7) and typed delivery
  // (P8) don't exist yet, so a routed event is logged, not yet acted upon.
  peViewProvider = new NexpathPromptEnhancementViewProvider(
    context.extensionUri,
    (raw) => {
      const current = peViewProvider?.getCurrentPayload();
      if (!current) return;
      const event = routePeWebviewMessage(raw, {
        currentBodyId: current.currentBodyId,
        bodyRevision: current.bodyRevision,
      });
      if (!event) return;
      log(`[nexpath] PE event: ${JSON.stringify(describePeEventSafely(event))}`);
      // P7 (VED-PE-7): gate the one event type that actually attempts
      // delivery today. No real insertion exists yet (P8/P9) — logging the
      // gate decision here proves "delivery unreachable unless intent_ready"
      // is true in this codebase now, not just in pe-send-intent.ts's own
      // unit tests, and gives a future delivery call site somewhere correct
      // to plug into.
      if (event.eventType === 'deliver_current_body') {
        const intent = resolvePeSendIntent({
          sendPolicy: current.sendPolicy,
          renderState: current.renderState,
          staleOrMismatched: event.staleOrMismatched,
          hasDirtyAdditionalDetails: event.hasDirtyAdditionalDetails === true,
        });
        log(`[nexpath] PE send intent: ${JSON.stringify(intent)}`);
      }
      // P9 (VED-PE-6): build the typed action request for the 4 round-trip
      // action types and log it (redacted — never the raw edited body/details
      // text). No real response transport exists yet (R3, `G-R3` OPEN) — a
      // FRESH loop state is seeded from the currently published payload on
      // every call rather than persisted across calls, deliberately: since
      // nothing can ever unlock a persisted `locked_action_loading` state
      // without a real response, persisting it here would strand the loop
      // permanently locked after the very first click. This proves the
      // request-builder is reachable and exercised now, and gives whatever
      // real transport eventually lands (R3) the exact typed request shape
      // to send.
      const actionRequestType: PeActionRequestType | null =
        event.eventType === 'request_shorter' ? 'shorter'
        : event.eventType === 'request_more_thorough' ? 'more_thorough'
        : event.eventType === 'request_more_project_grounded' ? 'more_project_grounded'
        : event.eventType === 'submit_additional_details' ? 'apply_details'
        : null;
      if (actionRequestType) {
        const built = buildPeActionRequest({
          requestId: `${current.currentBodyId}:${current.bodyRevision}:${event.timestampMs}`,
          actionType: actionRequestType,
          loopState: createPeActionLoopState({
            currentBodyId: current.currentBodyId,
            bodyRevision: current.bodyRevision,
            bodyText: current.currentBodyText,
          }),
          hasDirtyBodyEdit: event.hasDirtyBodyEdit === true,
          editedBodyText: actionRequestType === 'apply_details' ? event.editedBodyText : undefined,
          additionalDetailsText: actionRequestType === 'apply_details' ? event.additionalDetailsText : undefined,
        });
        log(`[nexpath] PE action request: ${JSON.stringify(
          built.ok
            ? { ok: true, actionType: built.request.actionType, dirtyDraftDisposition: built.request.dirtyDraftDisposition }
            : built,
        )}`);
      }
    },
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PE_VIEW_ID, peViewProvider),
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
    // Was logging `err.stack` into ~/.nexpath/nexpath.log and the raw error to
    // the dev console — both can carry payload through an attached `cause`.
    const record = toSafeErrorRecord(err);
    log(`[nexpath] onboarding failed: ${record.message}`);
    console.error('[nexpath] onboarding failed:', record);
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
    // H8 / G-ARBITRATION Finding 1 (Windsurf double-injection). Constructed ONLY
    // when the submit switch is on — null otherwise, so the shipped DS bridge
    // below is byte-identical in behaviour with the switch off (R12). Reuses the
    // injected-record store (same non-consuming window-based echo idiom P8 uses).
    // `let` + closure-visible: RC15's late armer creates it when the flag file
    // appears after activation (every consumer reads the binding per call).
    let submitDeliveredStore = isWindsurfSubmitAdvisoryEnabled(process.env)
      ? createInjectedRecordStore()
      : null;

    // Owner ruling 2026-08-11: Windsurf must behave like the CLI — popup-first.
    // Probed ONCE at activation (each probe spawns `which` per terminal); the
    // popup host's availability doesn't change mid-session in practice.
    const pePopupHostAvailable = isPePopupHostLikelyAvailable();
    log(
      pePopupHostAvailable
        ? '[nexpath] windsurf PE surface: popup host available — popup-first (CLI-identical); PE poller inert, "Use enhanced" bridges via the advisory poller'
        : '[nexpath] windsurf PE surface: no popup host — PE poller direct-insert active (P10 fallback)',
    );
    advisoryPoller = createAdvisoryPoller({
      projectRoots: roots,
      // Option-independent detection: the popup bridge must fire even though the
      // advisory row has no generated options (option auto→stop move). The
      // in-editor fallback (advisory-fallback.ts) keeps its own options-aware
      // readLatestAdvisory for DISPLAY — unchanged.
      readAdvisory: (root) => readLatestAdvisoryMeta(root),
      // PE-only turns store no advisory row; this lets the "Use enhanced"
      // selection bridge fire on them (selection gate only — never arms the
      // fallback; see AdvisoryPollerDeps.readPeEventMeta).
      readPeEventMeta: (root) => readLatestPromptEnhancementMeta(root),
      readInjected: (root) => readInjectedPrompt(root),
      // Popup selection → inject into Cascade + clear the fallback.
      onSelection: async (prompt) => {
        // H8 Finding 1: with the submit switch on, `lastInjectedPrompt` also
        // carries the submit flow's replacement (the VED-PE-10 echo-guard write).
        // The submit poller delivers that one itself — bridging it here too
        // would inject it TWICE. A genuine popup selection matches neither
        // check and flows through unchanged; switch off ⇒ store is null and
        // this branch does not exist.
        if (submitDeliveredStore) {
          // Local const so TS keeps the non-null narrowing inside the callback
          // now that the store is a `let` (RC15 late-arm creates it lazily).
          const sds = submitDeliveredStore;
          // RC28 (Windows/Devin tester, 2026-08-20): this was the single-shot
          // `isSubmitFlowReplacement`, which can only see a decision that has
          // ALREADY been written — and the bridge reliably beats it to disk on
          // Windows (measured: bridge 44 ms BEFORE the decision id was minted,
          // ~2.0 s before the block). The grace form re-asks until the decision
          // lands, exiting early the moment it does. It only DEFERS a genuine
          // popup selection — `stop` still reaches feedback/PE under the switch,
          // so those must keep bridging. See the guard module's header.
          const isReplacement = await isSubmitFlowReplacementWithinGrace(prompt, {
            roots,
            isRecentSubmitDelivery: (root, text) => sds.isRecentEcho(root, text),
            peekPendingDecision: (root) => peekPendingSubmitDecision(root, { expectedHost: 'windsurf' }),
          });
          if (isReplacement) {
            advisoryFallback.clear();
            log('[nexpath] windsurf: skipped DS bridge for a submit-flow replacement (delivered by the submit poller)');
            return;
          }
        }
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

    // P10 (analysis §4d): the extension is not in the Windsurf hook chain
    // for PE either — same root cause as the DS bridge above. Keyed on the
    // PE table only (readPendingPromptEnhancement, never advisory-store-reader.js).
    // Delivery is the verified clipboard-free chatInputInject-style path
    // (injectPeBody wrapping injectViaCascadeAction, D-1) — never the
    // clipboard-touching windsurfInject/cursorInject, same reasoning P8
    // already established. Also publishes to the PE webview so the same
    // renderer shows what was delivered if the panel happens to be open.
    //
    // GATED on the popup-host probe (owner ruling 2026-08-11): P10's premise
    // was "no popup possible on Windsurf" — live E2E disproved it (stop's
    // spawned-terminal PE popup opened fine). When a popup CAN open it is the
    // sole decision surface (CLI-identical, no pre-insert); this poller
    // delivers only where P10's premise actually holds (headless/no-terminal
    // hosts, where the pending row would otherwise rot unseen).
    pePoller = createPePoller({
      projectRoots: roots,
      readPendingPe: (root) =>
        pePopupHostAvailable ? Promise.resolve(null) : readPendingPromptEnhancement(root),
      onDeliver: (text) => injectPeBody(text, (t) => injectViaCascadeAction(t, {
        executeCommand: (id, ...args) => vscode.commands.executeCommand(id, ...args),
        getCommands: (filter) => vscode.commands.getCommands(filter),
      })),
      onPublish: (payload) => { if (payload) peViewProvider?.publishPayload(payload); },
      onOutcome: (outcome) => log(`[nexpath] windsurf PE poller insert outcome: ${outcome}`),
    });
    pePoller.start();
    context.subscriptions.push({ dispose: () => pePoller?.stop() });
    log(`[nexpath] windsurf PE poller started for roots: ${roots.join(' | ')}`);

    // ── Submit-time advisory delivery (hook milestone H3) ────────────────────
    // OFF BY DEFAULT. Everything below runs only when
    // NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY === '1'. With the switch unset — the
    // shipped default — this block is skipped entirely and the two pollers above
    // behave exactly as they always have. That is `R12`: the old flow must stay
    // byte-identical, and the guard is the FIRST thing evaluated, before anything
    // is constructed.
    //
    // Why a second poller rather than extending the PE one: they read different
    // tables and have different staleness rules, and extending a shipping poller
    // would put new behaviour on the old path. This is additive by construction.
    // RC15: construction wrapped in an idempotent armer so it can run at
    // activation OR later, once setup has written the flag file. `return false`
    // = not armed yet (retry later); `true` = armed (now or previously).
    const armWindsurfSubmitFlow = (reason: string): boolean => {
      if (submitFlowArmed) return true;
      if (!isWindsurfSubmitAdvisoryEnabled(process.env)) {
        logGateOnce('windsurf', explainSubmitFlowGate('windsurf', process.env).reason);
        return false;
      }
      submitFlowArmed = true;
      submitSurface.active = true;
      if (!submitDeliveredStore) submitDeliveredStore = createInjectedRecordStore();
      const delivery = createSubmitClipboardDelivery({
        // `vscode.env.clipboard` is the same API `cursorInject` already uses.
        writeClipboard: (text) => Promise.resolve(vscode.env.clipboard.writeText(text)),
        // Reuse the shipped raiser — Linux/X11 only by design; on other OSes it
        // returns false and the paste still proceeds (see the module's notes).
        focus: async () => raiseAppWindow([vscode.env.appName.toLowerCase(), 'devin', 'windsurf']),
        pasteKeystroke: () => pasteKeystroke({ win32Titles: [vscode.env.appName, 'Devin', 'Windsurf'] }),
        // RC11: Enter only when Windsurf itself is focused — a blind Enter
        // pressed the Welcome view's "Start session" and closed the chat.
        submitKeystroke: () => submitKeystroke({ host: 'windsurf', focusEditor: () => void raiseAppWindow([vscode.env.appName.toLowerCase(), 'devin', 'windsurf']), appName: vscode.env.appName, submitLog: log }),
        log: (m) => log(m),
      });

      // Set by onInject; gates auto-submit to the injected path only.
      let lastDeliveryLanded = false;
      submitPoller = createSubmitHookPoller({
        projectRoots: roots,
        // This poller lives inside the `host === 'windsurf'` branch, so the
        // expected host is windsurf by construction. H6's Cursor equivalent
        // needs its own construction site — see the note at the branch head.
        // RC22: the project-local file stays PRIMARY (unchanged behaviour where
        // it already works). The user-level mirror is consulted only when it
        // yields nothing — that is the Windows case, where the hook's cwd is not
        // the folder the editor has open, so the primary record is written
        // somewhere no poller looks.
        readPendingDecision: async (root) =>
          (await readPendingSubmitDecision(root, { expectedHost: 'windsurf' }))
          ?? (await readPendingSubmitDecisionMirror(roots, { expectedHost: 'windsurf' })),
        // PRIMARY: `windsurfInject` — the SAME injector the shipping old flow
        // uses (injectViaCascadeAction → openChatPanel + addCascadeInput, the
        // verified protobuf path). RC13 (live, 2026-08-13 18:44): this line
        // previously called `chatInputInject`, whose windsurf candidates are
        // dead — `windsurf.sendTextToChat` has no handler and
        // `windsurf.sendTerminalToChat` ACCEPTS the call while inserting
        // nothing — so delivery logged "injected directly" while the composer
        // stayed empty (false positive), and auto-submit armed on an empty
        // composer. The file's own header (`:277`) already said Windsurf has no
        // extension-callable text-insert command; the submit path must use the
        // host's own injector exactly like Cursor's branch uses `cursorInject`.
        onInject: async (text) => {
          // RC14b (owner, 2026-08-14): NO notification toast here — the owner
          // explicitly rejected it. The professional explanation lives in the
          // block card itself: the hook writes WINDSURF_BLOCK_CARD_MESSAGE to
          // stderr before exit(2), which Cascade renders in place of its
          // "Action blocked by hook" default (RC14).
          // RC11.5: record FIRST — the DS bridge polls every 2s and injected a
          // duplicate 63ms after our dispatch because the record landed after
          // the outcome. Recording an attempt that then fails is harmless (the
          // bridge skipping a failed delivery's text is the safe direction).
          if (submitDeliveredStore) {
            for (const root of roots) submitDeliveredStore.record(root, text);
          }
          const res = await deliverSubmitReplacement(text, {
            injectDirect: (t) => windsurfInject(t),
            // `verifyLanded` is DELIBERATELY NOT SUPPLIED (owner: option B).
            // `windsurfInject` returns true when the cascade-action command
            // resolved, so "accepted" is not "landed" — but no VS Code API exposes a
            // vendor chat composer's text, so a real content check is not
            // implementable from here. Whether ANY observable signal exists is an
            // empirical question for H3's live E2E, alongside the getCommands(true)
            // sweep. Wiring a check that cannot actually check would be worse than
            // leaving the seam open and documented.
            fallbackClipboard: (t) => delivery.inject(t),
            notify: (m) => void vscode.window.showWarningMessage(m),
            log: (m) => log(m),
          });
          lastDeliveryLanded = res.landed;
          // H8 Finding 1's post-outcome record moved ABOVE the dispatch
          // (RC11.5) — recording here again was a harmless duplicate, removed.
          return res.outcome !== 'failed';
        },
        // Auto-submit ONLY after a real injection. After a clipboard fallback the
        // user has not pasted yet, so pressing Enter would submit an empty or
        // stale composer.
        onSubmit: async () => (lastDeliveryLanded ? delivery.submit() : false),
        // Timing goes to the Output channel only — H3's measured-latency
        // requirement. Never carries the replacement text.
        onTiming: (t) => log(
          `[nexpath] submit handoff: ${t.stage} +${t.sinceDecisionMs}ms (${t.decisionId})`,
        ),
        onOutcome: (outcome) => {
          log(`[nexpath] submit delivery outcome: ${outcome}`);
          // RC61: a busy/reconnecting Devin session parks a delivered submit as
          // "1 queued message" that only a further Enter sends — tap once.
          if (outcome === 'delivered' && host === 'windsurf') {
            scheduleWindsurfQueueFlush(
              () => submitKeystroke({ host, focusEditor: () => void raiseAppWindow([vscode.env.appName.toLowerCase(), 'devin', 'windsurf']), appName: vscode.env.appName, submitLog: log }),
              log,
            );
          }
          // RC16 (macOS tester, 2026-08-15): on darwin the auto-send keystroke
          // needs the Accessibility permission for the HOST APP. Without it the
          // refined text sits in the composer with zero guidance. One-time,
          // actionable, and honest about the manual fallback.
          // RC47 (Windows tester, 2026-08-22): a failed win32 AppActivate left
          // the refined text stranded in the composer with ZERO guidance — the
          // tester watched "auto send nathi thayu". One-time, same contract as
          // the darwin hint below: honest about the manual fallback.
          if (outcome === 'submit_failed' && process.platform === 'win32' && !win32SubmitHintShown) {
            win32SubmitHintShown = true;
            void vscode.window.showWarningMessage(
              'Nexpath: your refined prompt is in the chat input — press Enter to send it. (Auto-send could not focus the editor window this time.)',
            );
          }
          if (outcome === 'submit_failed' && process.platform === 'darwin' && !darwinSubmitHintShown) {
            darwinSubmitHintShown = true;
            const why = lastDarwinSubmitError ? ` (${lastDarwinSubmitError})` : '';
            log(`[nexpath] darwin submit keystroke failed${why}`);
            void vscode.window.showWarningMessage(
              isDarwinAccessibilityDenial(lastDarwinSubmitError)
                ? 'Nexpath: your refined prompt is in the chat — press Enter to send it. To enable auto-send, grant Accessibility to this editor: System Settings → Privacy & Security → Accessibility.'
                : 'Nexpath: your refined prompt is in the chat — press Enter to send it. Auto-send could not simulate the keystroke on this Mac (check System Settings → Privacy & Security → Accessibility).',
            );
          }
        },
      });
      submitPoller.start();
      context.subscriptions.push({ dispose: () => submitPoller?.stop() });
      log(`[nexpath] submit-time advisory ENABLED (windsurf, ${reason})`);
      return true;
    };
    armWindsurfSubmitFlow('activation');
    armSubmitFlowLate = armWindsurfSubmitFlow;
  }

  // ── H6: Cursor submit-time advisory ────────────────────────────────────────
  // A SEPARATE block from the Windsurf one above, placed after it so the
  // shipping path is not edited at all (`R12`). `roots` is derived identically;
  // it stays scoped inside each host block rather than being hoisted, again to
  // leave the Windsurf branch untouched.
  //
  // Before this, the submit poller only ever existed inside the windsurf branch,
  // so a `cursor` decision written by the hook was read by nobody.
  //
  // The `state.vscdb` DB-watcher is NOT replaced: per the dev plan it is a
  // separate mechanism and keeps classifying exactly as it does today. This
  // poller only reads the submit-decision file the hook writes.
  if (host === 'cursor') {
    const cws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const croots = Array.from(new Set([canonicalizeCwd(cws), cws]));
    // `cursorInject` — NOT `chatInputInject`. It already performs clipboard →
    // raise → focus → paste internally, so the outer clipboard fallback fires
    // only if it returns false, rather than duplicating work it already did.
    // RC15: same idempotent-armer shape as the Windsurf branch — Cursor had the
    // identical fresh-install ordering bug (flag file written after activation).
    const armCursorSubmitFlow = (reason: string): boolean => {
      if (submitFlowArmed) return true;
      if (!isCursorSubmitAdvisoryEnabled(process.env)) {
        logGateOnce('cursor', explainSubmitFlowGate('cursor', process.env).reason);
        return false;
      }
      submitFlowArmed = true;
      submitSurface.active = true;
      submitPoller = buildSubmitAdvisory('cursor', true, croots, log, cursorInject) ?? undefined;
      if (!submitPoller) return false;
      submitPoller.start();
      context.subscriptions.push({ dispose: () => submitPoller?.stop() });
      log(`[nexpath] submit-time advisory ENABLED (cursor, ${reason})`);
      return true;
    };
    armCursorSubmitFlow('activation');
    armSubmitFlowLate = armCursorSubmitFlow;
  }


  // FIX-3 (2026-08-11): enumeration + filtering extracted into a function so it
  // can re-run when a workspace folder appears AFTER activation. Live failure
  // this addresses: activation on a welcome/empty window enumerated 27-28 dbs
  // with ownWorkspaceCwd null — the R4.3 filter could not engage, so the
  // watcher copy-polled every workspace db on the machine, and a db created
  // for a workspace opened later was never picked up.
  const buildWatchTargets = (): {
    targets: WatchTarget[];
    dbCount: number;
    cascadeNote: string;
  } | null => {
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
    return null;
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
  return {
    targets,
    dbCount: dbPaths.length,
    cascadeNote: codeiumExists ? ' + 1 windsurf-dir' : '',
  };
  };

  const built = buildWatchTargets();
  if (built === null) return;

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
  // P8 (VED-PE-10 completion): fresh per activation, matching `watcher`.
  peInjectedRecordStore = createInjectedRecordStore();
  // OWNER RULING 2026-08-12: is a submit-time advisory switch ON for THIS host?
  // When true, the submit-time hook owns the advisory surface and the old
  // in-editor fallback must not arm (see onAfterCapture).
  // RC15: read LIVE via `submitSurface.active` (set by the armer) instead of a
  // once-at-activation const — on a fresh machine the flag file appears after
  // activation and the old surface must switch off the moment the flow arms.
  // `createChatEventHandler` reads these per event, so getters keep them live.
  const handleChatEvent = createChatEventHandler({
    // OWNER RULING 2026-08-12: switch ON ⇒ old DS-advisory surface OFF, PE kept.
    // The handler skips the stop/advisory path for NON-PE turns only.
    get suppressDsAdvisory() { return submitSurface.active; },
    // RC6 (2026-08-13): switch ON ⇒ the hook already ran `auto` for this prompt
    // inside its hold; the watcher's duplicate auto raced it on the sql.js
    // store (last-writer-wins) and made the submit popup nondeterministic.
    get suppressWatcherAuto() { return submitSurface.active; },
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
    //
    // OWNER RULING 2026-08-12 (Cursor half): with the submit switch ON, the
    // submit-time hook OWNS the advisory surface — the old in-editor fallback
    // must NOT arm, or the user would get both. Cursor has no post-response
    // hook to consume the row (unlike Windsurf's suppression leg), so the
    // enforcement point is here, where the DB-watcher would otherwise arm it.
    // Switch OFF ⇒ arms exactly as before (byte-identical old behaviour).
    onAfterCapture: (event) => {
      if (submitSurface.active) return;
      advisoryFallback.armIfPending(cwdForEvent(event));
    },
    composeSessionId: (event) => `${cwdForEvent(event)}|${event.rawSessionId}`,
    // P8 (VED-PE-10 completion): typed store evidence decides DS vs PE origin
    // (pe-origin.ts, P4) — never Stop's returned text. When this turn IS
    // PE-origin, also fetch+parse the pending row (pe-store-reader.ts/P3,
    // pe-payload.ts/P5) and publish it to the PE webview for the first time —
    // this is the store-to-webview data path P5's own status text flagged as
    // "not yet wired... P6/P8's job". Emits a visible-surface ACK (VED-PE-12)
    // from the REAL render outcome on both success and failure — never from
    // DS `status='shown'` (that field is never read on this path at all).
    checkPeOrigin: async (event) => {
      const projectRoot = cwdForEvent(event);
      const isPe = await isPeOriginTurn(projectRoot);
      if (!isPe) return false;
      let parsed: ReturnType<typeof parsePromptEnhancementExtensionPayloadV1> = null;
      let renderThrew = false;
      try {
        const pending = await readPendingPromptEnhancement(projectRoot);
        if (pending) {
          parsed = parsePromptEnhancementExtensionPayloadV1(pending.resultJson);
          if (parsed) {
            if (pending.createdAt >= peLastPublishedCreatedAt) {
              peLastPublishedCreatedAt = pending.createdAt;
              peViewProvider?.publishPayload(parsed);
            } else {
              log(`[nexpath] PE publish suppressed: a newer turn's payload is already visible (createdAt ${pending.createdAt} < ${peLastPublishedCreatedAt})`);
            }
          }
        }
      } catch {
        renderThrew = true;
      }
      const ack = resolvePeVisibleSurfaceAckState({ renderState: parsed?.renderState ?? null, renderThrew });
      log(`[nexpath] PE visible-surface ACK: ${ack}`);
      return true;
    },
    // P8 (D-1): a PE result is injected via the clipboard-free chatInputInject
    // FIRST — the primary path never touches the clipboard.
    //
    // CORRECTED 2026-08-11 (FIX-2, owner-approved) — this comment used to say
    // "never DS's cursorInject" with no fallback at all. Live Cursor E2E hit
    // the case that leaves: a build with NO registered chat-insert command
    // (`cursor inject-command present: NONE`), where the typed path can only
    // fail and the enhanced body was LOST (`insert_failed_no_clipboard_fallback`,
    // 2026-08-11 12:17:14). G-A5's own ruling allows clipboard exactly here —
    // "only ... when inject back ... is fail" — so on a failed typed insert on
    // Cursor we now fall back to the SHIPPED DS ladder (cursorInject: clipboard
    // → raise → focus loop → paste into the EXISTING chat), and if even that
    // fails the ladder's first step already copied the text, so we toast. Other
    // hosts keep the typed-only behaviour (no pasteFallback wired).
    //
    // On delivery, records the delivered body's typed identity (currentBodyId/
    // bodyRevision) so the NEXT turn's isPeEcho can recognise a genuine typed
    // echo, not just a text match — see injected-record.ts's
    // resolveOriginGuardState.
    injectPeResult: async (resultText, event) => {
      const projectRoot = cwdForEvent(event);
      const result = await injectPeBodyWithFallback(resultText, (t) => chatInputInject(t, { host }), {
        pasteFallback: host === 'cursor' ? cursorInject : undefined,
        onClipboardOnly: () => {
          void vscode.window.showInformationMessage(
            'Nexpath: enhanced prompt copied — press Ctrl+V in the chat input to paste it.',
          );
        },
        log,
      });
      log(`[nexpath] PE insert outcome: ${result.outcome} (stage=${result.stage} delivered=${result.delivered})`);
      if (!result.delivered) return;
      try {
        const pending = await readPendingPromptEnhancement(projectRoot);
        const parsed = pending ? parsePromptEnhancementExtensionPayloadV1(pending.resultJson) : null;
        if (parsed) {
          peInjectedRecordStore?.record(projectRoot, resultText, undefined, {
            currentBodyId: parsed.currentBodyId,
            bodyRevision: parsed.bodyRevision,
          });
        }
      } catch { /* best-effort — a missed origin record just means the next echo isn't caught */ }
    },
    // P8 (VED-PE-10 completion): typed-origin-corroborated, not text-similarity
    // alone — see injected-record.ts's resolveOriginGuardState doc comment.
    isPeEcho: (event) =>
      peInjectedRecordStore?.resolveOriginGuardState(cwdForEvent(event), event.prompt) ===
      'next_submit_processed_as_delivery_echo',
    // Wire IPC failures (e.g. nexpath binary not on PATH → ENOENT) into
    // the Nexpath OutputChannel so they surface to the user. Default logger
    // only writes to console.error which is invisible outside Developer
    // Tools. Both destinations are kept so existing test assertions on
    // console.error continue to pass.
    logger: {
      error: (msg: string, err: unknown) => {
        // Never pass the raw Error: its stack, attached properties and nested
        // `cause` chain can carry the delivered prompt body or the user's text.
        const record = toSafeErrorRecord(err);
        log(`${msg} ${record.message}`);
        console.error(msg, record);
      },
    },
  });

  const startWatcher = (b: { targets: WatchTarget[]; dbCount: number; cascadeNote: string }): void => {
  watcher = createChatHistoryWatcher({
    targets: b.targets,
    // Polling backstop: fs.watch alone is unreliable on Windows for the SQLite
    // WAL recreate pattern (fires once then goes silent → only the first prompts
    // captured). Re-read every 2s; dedup makes it safe (no re-emit of seen
    // prompts). Low latency still comes from fs.watch when it does fire.
    pollMs: 2000,
    onEvent: (event) => {
      // The prompt text itself is never logged — this line used to write the
      // first 80 chars of the user's prompt to the Output channel, the dev
      // console and ~/.nexpath/nexpath.log. Only non-reversible identifiers and
      // a length remain, which is enough to correlate an event across the three
      // sinks without putting the prompt on disk.
      log(
        `[nexpath] watcher event: prompt_len=${event.prompt.length} ` +
          `session=${fingerprint(event.rawSessionId)} extractor=${event.extractorId}`,
      );
      // The watcher's onEvent is sync-fire-and-forget; the handler returns
      // a Promise we deliberately don't await.
      void handleChatEvent(event);
    },
    onError: (err) => {
      const record = toSafeErrorRecord(err);
      log(`[nexpath] watcher error: ${record.message}`);
      console.error('[nexpath] watcher error:', record);
    },
    // RC53: routine notices (a transient workspace db vanished and its watcher
    // closed itself) — informational, never the "watcher error:" prefix.
    onInfo: (message) => log(`[nexpath] ${message}`),
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
  log(
    `[nexpath] watcher started on ${b.dbCount} state.vscdb file(s)${b.cascadeNote} for host=${host}`,
  );
  };
  startWatcher(built);

  // FIX-3 (2026-08-11): when a folder becomes available in a window that
  // activated folder-less (welcome screen — the live case), re-enumerate so the
  // R4.3 own-workspace filter engages and any db created for the new workspace
  // joins the watch set. Folder REMOVAL keeps the current set (capture keeps
  // working; next folder-open re-filters). The chat handler is deliberately NOT
  // recreated — per-session pipeline state survives the re-enumeration, and its
  // per-event cwd resolution already attributes events correctly.
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
      if (cwd === null) return;
      log(`[nexpath] workspace folder now available (${cwd}) — re-enumerating dbs with the own-workspace filter`);
      const rebuilt = buildWatchTargets();
      if (rebuilt === null) return;
      watcher?.stop();
      watcher = undefined;
      startWatcher(rebuilt);
    }),
  );
}

export function deactivate(): void {
  log('[nexpath] extension deactivated');
  watcher?.stop();
  watcher = undefined;
  advisoryPoller?.stop();
  advisoryPoller = undefined;
  pePoller?.stop();
  pePoller = undefined;
  viewProvider = undefined;
  peViewProvider = undefined;
  peInjectedRecordStore = undefined;
  peLastPublishedCreatedAt = -Infinity;
  logChannel = undefined;
}

/** Lookup for other extension modules that want to publish payloads. */
export function getViewProvider(): NexpathDecisionSessionViewProvider | undefined {
  return viewProvider;
}

/** Lookup for other extension modules that want to publish PE payloads. */
export function getPeViewProvider(): NexpathPromptEnhancementViewProvider | undefined {
  return peViewProvider;
}
