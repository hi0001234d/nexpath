/**
 * Feature 1 — v1(a) tool detection for `nexpath install` / `status`, and stopping the worker
 * for `nexpath uninstall`.
 */

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
  if (!status.openclaw) notes.push(`OpenClaw not installed: npm install -g openclaw@${OPENCLAW_DEFAULT_VERSION}`);
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
export async function stopFeature1Worker(nexpathHome: string = defaultNexpathHome()): Promise<boolean> {
  try {
    const { pid } = await requestWorker<{ pid: number }>(workerPaths(nexpathHome).socket, { type: 'ping' }, 500);
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}
