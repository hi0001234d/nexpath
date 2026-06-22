import * as vscode from 'vscode';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkPrereqs, cliRuns } from './prereq.js';
import { stageCli } from './cli-stage.js';
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
        createTerminal: () => {
          // Drive the bundled CLI to (a) skip the redundant "install the
          // extension" marketplace deep-links — we ARE the extension — and
          // (b) register ONLY the IDE the user is in. Both are no-ops in the CLI
          // when the env is unset, so manual `nexpath install` is unaffected.
          const setupEnv: Record<string, string> = { NEXPATH_EXT_SETUP: '1' };
          const agent = process.env.NEXPATH_AGENT;
          if (agent === 'cursor' || agent === 'windsurf') setupEnv.NEXPATH_ONLY_AGENT = agent;
          return vscode.window.createTerminal({ name: 'Nexpath Setup', env: setupEnv });
        },
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
    // The staged CLI "runs" only if `node <entry> --version` exits 0 — which
    // requires its deps to be installed. Used to refuse a dep-less copy.
    verifyStagedCli: (cliEntry) => cliRuns('node', [cliEntry, '--version']),
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
/**
 * Activation hook. Strictly additive — it must never override or break a
 * `nexpath` that already works:
 *
 *   Direction 1: if a working `nexpath` already resolves on PATH (a global
 *     install, or a prior manual setup), do NOTHING — don't stage, don't set
 *     NEXPATH_BIN, don't offer. The extension then behaves exactly as it did
 *     before this feature, so machines already running Claude/Cursor/Windsurf
 *     are completely untouched.
 *   Direction 2/3/4: only when there's no working CLI do we consider the staged
 *     one — and we point IPC at it (and treat it as "already set up") ONLY if it
 *     actually runs (deps installed). A dep-less copy is never made active.
 *
 * Never auto-opens a terminal without consent.
 */
export async function offerSetupIfNeeded(
  context: vscode.ExtensionContext,
  log: Logger,
): Promise<void> {
  const deps = buildDeps(context, log);

  // ── Direction 1 — a working CLI already resolves on PATH → no-op. ──────────
  if (cliRuns('nexpath')) {
    log('[nexpath] existing working nexpath on PATH — auto-setup is a no-op (NEXPATH_BIN untouched)');
    return;
  }

  // No working CLI on PATH. We can only help if node/npm + a bundled CLI exist.
  if (!checkPrereqs().ready) {
    log('[nexpath] no working nexpath on PATH and node/npm missing — auto-setup not offered');
    return;
  }
  const staged = deps.stageCli(deps.bundledCliDir, deps.nexpathHome);
  if (staged.status === 'no-bundle' || staged.status === 'error') {
    log(`[nexpath] CLI auto-setup not offered (stage: ${staged.status})`);
    return;
  }

  // ── Direction 2/3/4 — the staged CLI counts only if it actually runs. ──────
  const verified = staged.cliEntry ? deps.verifyStagedCli(staged.cliEntry) : false;
  if (verified && staged.shimPath) deps.applyNexpathBin(staged.shimPath);

  const state = deps.getState();
  const upToDate =
    state.done && state.version === staged.version && staged.status === 'already-current' && verified;
  if (upToDate) {
    log(`[nexpath] CLI already set up + verified (v${staged.version})`);
    return;
  }

  const isUpdate = state.done && state.version !== staged.version;
  const agentLabel =
    process.env.NEXPATH_AGENT === 'cursor' ? 'Cursor'
    : process.env.NEXPATH_AGENT === 'windsurf' ? 'Windsurf'
    : 'this editor';
  const message = isUpdate
    ? `Nexpath update available (v${staged.version}). Re-run setup for ${agentLabel}?`
    : `Set up Nexpath for ${agentLabel} now? (you can answer the prompts in the terminal).`;
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
