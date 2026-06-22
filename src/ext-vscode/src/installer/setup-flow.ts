import { join } from 'node:path';
import { missingPrereqMessage, type PrereqStatus } from './prereq.js';
import { type StageResult } from './cli-stage.js';
import {
  buildSetupRunnerSource,
  SETUP_RUNNER_FILENAME,
  SETUP_SENTINEL_FILENAME,
} from './setup-runner-source.js';
import { type RunResult } from './terminal-runner.js';

/**
 * Orchestrates the one-time (and update-triggered) CLI setup, fully via injected
 * dependencies so the decision logic is unit-testable with no VS Code, no
 * terminal, and no real filesystem. `extension.ts` constructs the real deps.
 *
 * Order: prereqs → stage the bundled CLI → (point IPC at it) → if not already
 * done for this version, write the runner + drive it in a terminal → on success
 * persist state. Everything is additive: nothing here mutates Layer C or the
 * existing watcher/poller/inject paths. If anything is missing or fails, the
 * extension keeps working exactly as before (the user can retry via the command).
 */

export type SetupOutcome =
  | 'already-done'
  | 'done'
  | 'blocked'
  | 'no-bundle'
  | 'failed';

export interface SetupState {
  done: boolean;
  version: string | null;
}

export interface SetupFlowDeps {
  nexpathHome: string;
  /** Absolute path to the CLI bundled in the .vsix, or null for unbundled (dev) builds. */
  bundledCliDir: string | null;
  checkPrereqs: () => PrereqStatus;
  stageCli: (bundledCliDir: string | null, home: string) => StageResult;
  writeFile: (path: string, data: string) => void;
  buildCommand: (runnerPath: string, stagedDir: string, sentinelPath: string, cliEntry: string) => string;
  runInTerminal: (command: string) => Promise<RunResult>;
  showError: (msg: string) => void;
  showInfo: (msg: string) => void;
  /** Point the extension's IPC at the staged CLI (e.g. set process.env.NEXPATH_BIN). */
  applyNexpathBin: (shimPath: string) => void;
  /**
   * True only if the staged CLI actually RUNS (its deps are installed). Used to
   * refuse pointing IPC at, or trusting the `done` flag over, a dep-less copy.
   */
  verifyStagedCli: (cliEntry: string) => boolean;
  getState: () => SetupState;
  setState: (s: SetupState) => Promise<void>;
  log?: (line: string) => void;
}

export interface SetupFlowOptions {
  /** Re-run even when state says it's already done (the manual command path). */
  force?: boolean;
}

export async function runSetupFlow(
  deps: SetupFlowDeps,
  opts: SetupFlowOptions = {},
): Promise<SetupOutcome> {
  const prereq = deps.checkPrereqs();
  if (!prereq.ready) {
    deps.showError(missingPrereqMessage(prereq) ?? 'Nexpath setup prerequisites are missing.');
    return 'blocked';
  }

  const staged = deps.stageCli(deps.bundledCliDir, deps.nexpathHome);
  if (staged.status === 'no-bundle') {
    deps.showError(
      'Nexpath: the CLI was not bundled in this build, so automatic setup is unavailable. ' +
        'Install the nexpath CLI manually (see the extension README).',
    );
    return 'no-bundle';
  }
  if (staged.status === 'error' || !staged.stagedDir || !staged.cliEntry) {
    deps.showError(`Nexpath: could not prepare the CLI (${staged.error ?? 'unknown error'}).`);
    return 'failed';
  }

  // Direction 2/3: only point IPC at the staged CLI once it actually RUNS (its
  // npm install has completed). A freshly-copied, dep-less copy must never
  // become the active binary — that is what hijacked the working global CLI.
  if (staged.shimPath && deps.verifyStagedCli(staged.cliEntry)) {
    deps.applyNexpathBin(staged.shimPath);
  }

  const state = deps.getState();
  // Direction 4: don't trust the `done` flag over a broken copy — "already set
  // up" also requires the staged CLI to verify (deps installed).
  const upToDate =
    state.done &&
    state.version === staged.version &&
    staged.status === 'already-current' &&
    deps.verifyStagedCli(staged.cliEntry);
  if (upToDate && !opts.force) {
    deps.log?.(`[nexpath] setup already complete + verified for CLI ${staged.version}`);
    return 'already-done';
  }

  const runnerPath = join(deps.nexpathHome, SETUP_RUNNER_FILENAME);
  const sentinelPath = join(deps.nexpathHome, SETUP_SENTINEL_FILENAME);
  try {
    deps.writeFile(runnerPath, buildSetupRunnerSource());
  } catch (err) {
    deps.showError(`Nexpath: could not write the setup runner (${(err as Error).message}).`);
    return 'failed';
  }

  const command = deps.buildCommand(runnerPath, staged.stagedDir, sentinelPath, staged.cliEntry);
  const result = await deps.runInTerminal(command);

  // Mark done + point IPC at the staged CLI ONLY when the runner finished AND
  // the CLI verifies (deps actually installed). This closes the gap where the
  // runner could report OK but leave a CLI that can't start.
  if (result.ok && deps.verifyStagedCli(staged.cliEntry)) {
    await deps.setState({ done: true, version: staged.version });
    if (staged.shimPath) deps.applyNexpathBin(staged.shimPath);
    const agentLabel =
      process.env.NEXPATH_AGENT === 'cursor' ? 'Cursor'
      : process.env.NEXPATH_AGENT === 'windsurf' ? 'Windsurf'
      : 'this editor';
    deps.showInfo(
      `Nexpath is set up for ${agentLabel}. ` +
        'Reload the window or restart your agent to activate guidance.',
    );
    return 'done';
  }
  if (result.ok) {
    deps.showError(
      'Nexpath: setup ran but the CLI could not start (dependencies incomplete). ' +
        'Retry from the Command Palette: "Nexpath: Set up CLI".',
    );
    return 'failed';
  }

  const why = result.timedOut ? 'setup did not finish in time' : `setup failed (${result.detail})`;
  deps.showError(
    `Nexpath: ${why}. Retry from the Command Palette: "Nexpath: Set up CLI".`,
  );
  return 'failed';
}

/** Default terminal command: `node "<runner>" "<staged>" "<sentinel>" "<cliEntry>"`. */
export function buildSetupCommand(
  runnerPath: string,
  stagedDir: string,
  sentinelPath: string,
  cliEntry: string,
): string {
  const q = (s: string) => `"${s}"`;
  return ['node', q(runnerPath), q(stagedDir), q(sentinelPath), q(cliEntry)].join(' ');
}
