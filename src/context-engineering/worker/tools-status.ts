/**
 * Feature 1 — v1(a) tool detection for `nexpath install` / `status`, and stopping the worker
 * for `nexpath uninstall`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolveCodebaseMemoryBin } from '../sources/codebase-memory-driver.js';
import { OPENCLAW_DEFAULT_VERSION, installedOpenClaw, isOpenClawInstalled, nodeVersionOkForOpenClaw } from '../sources/openclaw-driver.js';
import { isMeaningModelInstalled } from '../sources/meaning-driver.js';

export { nodeVersionOkForOpenClaw };
import { requestWorker } from './worker-client.js';
import { defaultNexpathHome, workerPaths } from './protocol.js';

export interface Feature1ToolsStatus {
  memos: boolean;
  /** MemOS's local embedding model, used to match prompts to our map's facts by meaning. */
  meaning: boolean;
  codebase: boolean;
  openclaw: boolean;
  /** This Node meets the installed OpenClaw's own requirement. */
  nodeOkForOpenClaw: boolean;
  /** Installed OpenClaw version and its Node requirement, when readable. */
  openclawVersion?: string;
  openclawNodeRange?: string;
}

export function feature1ToolsStatus(): Feature1ToolsStatus {
  let memos = false;
  try {
    createRequire(import.meta.url).resolve('@memtensor/memos-local-plugin/package.json');
    memos = true;
  } catch {
    memos = false;
  }
  return {
    memos,
    meaning: isMeaningModelInstalled(),
    codebase: resolveCodebaseMemoryBin() !== undefined,
    openclaw: isOpenClawInstalled(),
    nodeOkForOpenClaw: nodeVersionOkForOpenClaw(),
    openclawVersion: installedOpenClaw()?.version,
    openclawNodeRange: installedOpenClaw()?.nodeRange,
  };
}

/** One summary line for the install box, e.g. "MemOS, codebase-memory-mcp (OpenClaw not installed)". */
export function describeFeature1Tools(status: Feature1ToolsStatus): string {
  const on = [
    status.memos && 'MemOS',
    status.codebase && 'codebase-memory-mcp',
    status.openclaw && status.nodeOkForOpenClaw && 'OpenClaw',
    status.meaning && 'meaning search',
  ].filter(Boolean);
  const notes: string[] = [];
  // OpenClaw comes with Nexpath as an optional dependency; missing = npm skipped it (e.g. --omit=optional).
  if (!status.openclaw) notes.push(`OpenClaw not installed (optional dependency skipped): npm install -g openclaw@${OPENCLAW_DEFAULT_VERSION}`);
  else if (!status.nodeOkForOpenClaw) {
    notes.push(
      `OpenClaw ${status.openclawVersion ?? ''} needs Node ${status.openclawNodeRange ?? '(see its package.json)'}; ` +
        `on Node ${process.versions.node} use npm install -g openclaw@${OPENCLAW_DEFAULT_VERSION}`.replace(/ {2,}/g, ' ')
    );
  }
  const head = on.length > 0 ? on.join(', ') : 'none';
  return notes.length > 0 ? `${head} (${notes.join('; ')})` : head;
}

/** Ask a running worker to stop (uninstall). Never throws. */
export async function stopFeature1Worker(
  nexpathHome: string = defaultNexpathHome(),
  options: { waitMs?: number } = {}
): Promise<boolean> {
  const paths = workerPaths(nexpathHome);
  // The worker's pid: from a ping, or — when it is too busy to answer — from its pid file.
  let pid = await requestWorker<{ pid: number }>(paths.socket, { type: 'ping' }, 2000).then((r) => r.pid, () => undefined);
  if (pid === undefined) {
    try {
      const fromFile = Number.parseInt(readFileSync(paths.pidFile, 'utf8').trim(), 10);
      // A stale file's pid may now belong to another program: only our worker is ever stopped.
      if (Number.isInteger(fromFile) && fromFile > 0 && fromFile !== process.pid && isRunning(fromFile) && isOurWorker(fromFile)) pid = fromFile;
    } catch {
      /* no pid file: no worker */
    }
  }
  if (pid === undefined) return false;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return false;
  }
  // Wait until it has really exited (it closes its tools first), so nothing is deleted under it.
  const until = Date.now() + (options.waitMs ?? 30_000);
  while (isRunning(pid) && Date.now() < until) await new Promise((r) => setTimeout(r, 200));
  if (isRunning(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
  return true;
}

/** True only when the process is verifiably Nexpath's worker (its command line runs worker-main.js). */
function isOurWorker(pid: number): boolean {
  try {
    if (process.platform === 'linux') return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('worker-main.js');
    if (process.platform === 'darwin') {
      return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8', timeout: 3000 }).includes('worker-main.js');
    }
    if (process.platform === 'win32') {
      const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`], { encoding: 'utf8', timeout: 10_000, windowsHide: true });
      return out.includes('worker-main.js');
    }
  } catch {
    /* cannot tell: do not touch it */
  }
  return false;
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}
