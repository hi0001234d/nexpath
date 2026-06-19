import { spawnSync } from 'node:child_process';

/**
 * Prerequisite probes for the auto-installer.
 *
 * The extension can stage + run the bundled nexpath CLI, but the CLI is a Node
 * program and its agent hooks shell out to `node` — so a Node runtime (and npm,
 * to install the CLI's production deps for the user's exact platform) MUST be
 * present before setup can run. This module answers "can setup proceed?" without
 * touching VS Code APIs, so it is trivially unit-testable.
 *
 * Nothing here mutates state — it only probes. The orchestrator (setup-flow.ts)
 * decides what to do with the result.
 */

export interface ToolStatus {
  present: boolean;
  /** First line of `<tool> --version`, e.g. "v20.11.0" / "10.2.4". */
  version: string | null;
}

export interface PrereqStatus {
  node: ToolStatus;
  npm: ToolStatus;
  /** True only when BOTH node and npm are available — setup may proceed. */
  ready: boolean;
}

/** Injectable command runner so tests don't shell out. */
export type RunFn = (cmd: string, args: string[]) => { status: number | null; stdout: string };

const defaultRun: RunFn = (cmd, args) => {
  // On Windows `npm` is `npm.cmd`; Node's spawn refuses to execute a `.cmd`
  // without a shell (post CVE-2024-27980). `shell: true` lets the OS resolve
  // either the `.exe` (node) or the `.cmd` (npm) form. A short timeout keeps a
  // hung probe from blocking activation.
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 10_000,
    windowsHide: true,
  });
  return { status: r.status, stdout: (r.stdout ?? '').toString() };
};

function probe(run: RunFn, cmd: string): ToolStatus {
  try {
    const { status, stdout } = run(cmd, ['--version']);
    if (status === 0) {
      const version = stdout.trim().split('\n')[0]?.trim() || null;
      return { present: true, version };
    }
  } catch {
    // spawn threw (ENOENT etc.) → treat as absent.
  }
  return { present: false, version: null };
}

/**
 * Probe for node + npm on the current PATH. Pure aside from the injected runner.
 */
export function checkPrereqs(run: RunFn = defaultRun): PrereqStatus {
  const node = probe(run, 'node');
  const npm = probe(run, 'npm');
  return { node, npm, ready: node.present && npm.present };
}

/**
 * Human-readable, OS-specific guidance for when a prerequisite is missing.
 * Used by the orchestrator to tell the user how to unblock — we never try to
 * install Node ourselves (that would need elevation / a package manager we
 * can't assume), so we guide instead.
 */
export function missingPrereqMessage(
  status: PrereqStatus,
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (status.ready) return null;
  const missing: string[] = [];
  if (!status.node.present) missing.push('Node.js');
  if (!status.npm.present) missing.push('npm');
  const list = missing.join(' and ');
  const how =
    platform === 'darwin'
      ? 'Install it from https://nodejs.org or with Homebrew (`brew install node`), then reopen the editor.'
      : platform === 'win32'
        ? 'Install it from https://nodejs.org (the LTS installer adds both to PATH), then reopen the editor.'
        : 'Install it from https://nodejs.org or your package manager (e.g. `sudo apt install nodejs npm`), then reopen the editor.';
  return `Nexpath setup needs ${list}, which ${missing.length > 1 ? 'were' : 'was'} not found on your PATH. ${how}`;
}
