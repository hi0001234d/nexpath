import * as vscode from 'vscode';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkPrereqs } from './prereq.js';
import { stageCli, type StageResult } from './cli-stage.js';
import { SETUP_SENTINEL_FILENAME } from './setup-runner-source.js';
import { runSetupInTerminal } from './terminal-runner.js';
import {
  runSetupFlow,
  buildSetupCommand,
  type SetupFlowDeps,
  type SetupState,
} from './setup-flow.js';

/**
 * Thin VS Code glue for the CLI auto-installer.
 *
 * All of the real decision logic lives in the (unit-tested) modules in this
 * folder; this file only constructs the live dependencies (vscode terminal /
 * notifications / globalState, node fs / os) and provides the two entry points
 * `extension.ts` calls. It is intentionally additive — when the CLI is already
 * set up it only points IPC at the staged binary (`NEXPATH_BIN`) and returns,
 * so the existing watcher/poller/inject behaviour is unchanged.
 */

/** globalState key holding `{ done, version }`. */
const SETUP_STATE_KEY = 'nexpath.cliSetup';
/** Directory inside the .vsix the CLI is bundled into at package time. */
const BUNDLED_CLI_DIRNAME = 'nexpath-cli';

export const RUN_SETUP_COMMAND = 'nexpath.runSetup';

type Logger = (line: string) => void;

function nexpathHome(): string {
  return join(homedir(), '.nexpath');
}

function bundledCliDir(context: vscode.ExtensionContext): string | null {
  const base = context.extensionPath;
  if (typeof base !== 'string' || base.length === 0) return null;
  const dir = join(base, BUNDLED_CLI_DIRNAME);
  return existsSync(dir) ? dir : null;
}

function buildDeps(context: vscode.ExtensionContext, log: Logger): SetupFlowDeps {
  const home = nexpathHome();
  const sentinelPath = join(home, SETUP_SENTINEL_FILENAME);
  return {
    nexpathHome: home,
    bundledCliDir: bundledCliDir(context),
    checkPrereqs: () => checkPrereqs(),
    stageCli: (bundle, h) => stageCli(bundle, h),
    writeFile: (p, data) => {
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, data, 'utf8');
    },
    buildCommand: buildSetupCommand,
    runInTerminal: (command) =>
      runSetupInTerminal(command, {
        createTerminal: () =>
          vscode.window.createTerminal({ name: 'Nexpath Setup' }),
        readSentinel: () =>
          existsSync(sentinelPath) ? readFileSync(sentinelPath, 'utf8').trim() : null,
        clearSentinel: () => {
          try {
            rmSync(sentinelPath, { force: true });
          } catch {
            /* best-effort */
          }
        },
        now: () => Date.now(),
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        log,
      }),
    showError: (m) => void vscode.window.showErrorMessage(m),
    showInfo: (m) => void vscode.window.showInformationMessage(m),
    applyNexpathBin: (shim) => {
      process.env.NEXPATH_BIN = shim;
      log(`[nexpath] NEXPATH_BIN → ${shim}`);
    },
    getState: () =>
      context.globalState.get<SetupState>(SETUP_STATE_KEY) ?? { done: false, version: null },
    setState: (s) => Promise.resolve(context.globalState.update(SETUP_STATE_KEY, s)),
    log,
  };
}

/**
 * Stage the bundled CLI (if any) WITHOUT running the interactive installer, and
 * point IPC at it. Lets a machine that was already set up keep working on every
 * activation (the env var doesn't persist across sessions). Returns the stage
 * result so the caller can decide whether to offer (re)setup.
 */
function reconcile(deps: SetupFlowDeps): StageResult {
  if (!checkPrereqs().ready) {
    return { status: 'no-bundle', stagedDir: null, cliEntry: null, shimPath: null, version: null };
  }
  const staged = deps.stageCli(deps.bundledCliDir, deps.nexpathHome);
  if (staged.shimPath) deps.applyNexpathBin(staged.shimPath);
  return staged;
}

/**
 * Activation hook. Reconciles the staged CLI, then — only when setup is missing
 * or out of date — offers a one-click setup via a non-blocking notification.
 * Never auto-opens a terminal without consent. No-ops silently when the build
 * has no bundled CLI (dev) or prereqs are missing (the command surfaces guidance).
 */
export async function offerSetupIfNeeded(
  context: vscode.ExtensionContext,
  log: Logger,
): Promise<void> {
  const deps = buildDeps(context, log);
  const staged = reconcile(deps);

  // Nothing we can act on automatically — stay quiet on startup.
  if (staged.status === 'no-bundle' || staged.status === 'error') {
    log(`[nexpath] CLI auto-setup not offered (stage: ${staged.status})`);
    return;
  }

  const state = deps.getState();
  const upToDate = state.done && state.version === staged.version && staged.status === 'already-current';
  if (upToDate) {
    log(`[nexpath] CLI already set up (v${staged.version})`);
    return;
  }

  const isUpdate = state.done && state.version !== staged.version;
  const message = isUpdate
    ? `Nexpath CLI update available (v${staged.version}). Re-run setup to refresh Claude Code / Cursor / Windsurf?`
    : 'Set up the Nexpath CLI now? This wires Claude Code, Cursor, and Windsurf (you can answer the prompts in the terminal).';
  const choice = await vscode.window.showInformationMessage(message, 'Set up', 'Later');
  if (choice === 'Set up') {
    await runSetupFlow(deps, { force: isUpdate });
  } else {
    log('[nexpath] user deferred CLI setup');
  }
}

/**
 * Command handler for "Nexpath: Set up CLI" — always (re)runs the flow.
 */
export async function runSetupCommand(
  context: vscode.ExtensionContext,
  log: Logger,
): Promise<void> {
  const deps = buildDeps(context, log);
  await runSetupFlow(deps, { force: true });
}
