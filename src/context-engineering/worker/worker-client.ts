/**
 * Feature 1 — v1(a) worker client, used by the CLI hooks.
 *
 * Each tool is a proxy driver that asks the worker over the local pipe. If the worker is not
 * running, the first prompt starts it in the background and gets V1 (the proxies report
 * "unavailable"); later prompts get the tools. Nothing here ever blocks a prompt for long.
 */

import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { SourceCandidate, SourceDriver, SourceName, SourceQuery } from '../sources/source-driver.js';
import {
  defaultNexpathHome,
  lineReader,
  toWireQuery,
  workerPaths,
  type WorkerPaths,
  type WorkerRequest,
  type WorkerResponse,
  type WorkerSearchResult,
  type WorkerStatus,
  type WorkerTurn,
} from './protocol.js';

/** Config switch for the v1(a) tools in the CLI ("on" to enable). Off until `nexpath install` sets it. */
export const FEATURE1_TOOLS_CONFIG_KEY = 'feature1_tools';

/** Time a hook waits for the worker to answer "are you there". */
const STATUS_TIMEOUT_MS = 250;
/** Reuse one status answer for the three proxies of the same prompt. */
const STATUS_CACHE_MS = 1000;
/** Do not start a second worker while one is still starting. */
const START_GUARD_MS = 15_000;
const CAPTURE_TIMEOUT_MS = 300;

let nextId = 1;

/** `Omit` that keeps each request kind's own fields (plain Omit flattens the union). */
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

/** One request over the pipe; rejects on timeout or when the worker is not there. */
export function requestWorker<T>(socketPath: string, request: WithoutId<WorkerRequest>, timeoutMs: number): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    const socket = createConnection(socketPath);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('worker timeout'));
    }, Math.max(1, timeoutMs));
    const finish = (fn: () => void) => {
      clearTimeout(timer);
      socket.destroy();
      fn();
    };
    socket.once('error', (err) => finish(() => reject(err)));
    socket.on(
      'data',
      lineReader((value) => {
        const response = value as WorkerResponse;
        if (response.id !== id) return;
        finish(() => (response.ok ? resolve(response.result as T) : reject(new Error(response.error))));
      })
    );
    socket.once('connect', () => socket.write(`${JSON.stringify({ ...request, id })}\n`));
  });
}

export interface WorkerLinkOptions {
  nexpathHome?: string;
  /** Starts the worker in the background (default: spawn worker-main detached). */
  start?: (paths: WorkerPaths) => void;
}

/** Shared by the proxies of one hook process. */
export class WorkerLink {
  readonly paths: WorkerPaths;
  private cached: { at: number; status: WorkerStatus | undefined } | undefined;
  private readonly start: (paths: WorkerPaths) => void;

  constructor(options: WorkerLinkOptions = {}) {
    this.paths = workerPaths(options.nexpathHome ?? defaultNexpathHome());
    this.start = options.start ?? startWorkerDetached;
  }

  async status(): Promise<WorkerStatus | undefined> {
    if (this.cached && Date.now() - this.cached.at < STATUS_CACHE_MS) return this.cached.status;
    let status: WorkerStatus | undefined;
    try {
      status = await requestWorker<WorkerStatus>(this.paths.socket, { type: 'status' }, STATUS_TIMEOUT_MS);
    } catch {
      status = undefined;
      this.ensureStarted();
    }
    this.cached = { at: Date.now(), status };
    return status;
  }

  async search(source: SourceName, query: SourceQuery, deadlineAt: number): Promise<SourceCandidate[]> {
    const result = await requestWorker<WorkerSearchResult>(
      this.paths.socket,
      { type: 'search', source, query: toWireQuery(query), deadlineAt },
      Math.max(1, deadlineAt - Date.now())
    );
    if (!result.available) throw new Error(`${source} not available in the worker`);
    return result.candidates;
  }

  /** Hand a finished turn to the worker; never waits long, never throws. */
  async capture(turn: WorkerTurn): Promise<boolean> {
    try {
      await requestWorker(this.paths.socket, { type: 'capture', turn }, CAPTURE_TIMEOUT_MS);
      return true;
    } catch {
      this.ensureStarted();
      return false;
    }
  }

  private ensureStarted(): void {
    try {
      if (existsSync(this.paths.startMarker) && Date.now() - statSync(this.paths.startMarker).mtimeMs < START_GUARD_MS) return;
      mkdirSync(this.paths.dir, { recursive: true, mode: 0o700 });
      writeFileSync(this.paths.startMarker, String(Date.now()));
      this.start(this.paths);
    } catch {
      /* fail-open: this prompt simply runs on V1 */
    }
  }
}

/** A tool as seen from a hook: answers come from the worker. */
export class WorkerSourceDriver implements SourceDriver {
  constructor(
    readonly name: SourceName,
    private readonly link: WorkerLink
  ) {}

  async available(): Promise<boolean> {
    const status = await this.link.status();
    return Boolean(status?.sources.some((s) => s.name === this.name && s.available));
  }

  search(query: SourceQuery, deadlineAt: number): Promise<SourceCandidate[]> {
    return this.link.search(this.name, query, deadlineAt);
  }
}

export function cliWorkerSources(options: WorkerLinkOptions = {}): { link: WorkerLink; drivers: SourceDriver[] } {
  const link = new WorkerLink(options);
  const names: SourceName[] = ['memos', 'openclaw', 'codebase', 'meaning'];
  return { link, drivers: names.map((name) => new WorkerSourceDriver(name, link)) };
}

/** Default start: `node <dist>/context-engineering/worker/worker-main.js`, detached, low priority. */
export function startWorkerDetached(paths: WorkerPaths): void {
  const entry = join(dirname(fileURLToPath(import.meta.url)), 'worker-main.js');
  if (!existsSync(entry)) return;
  const child = spawn(process.execPath, [entry], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, NEXPATH_WORKER_DIR: paths.dir },
  });
  child.unref();
}
