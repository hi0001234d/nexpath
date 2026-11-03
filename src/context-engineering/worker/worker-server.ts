/**
 * Feature 1 — v1(a) worker server: one long-lived process per user (D4 / D10).
 *
 * Holds the tool drivers once (MemOS, OpenClaw, codebase-memory-mcp) so a prompt only pays a
 * local round trip. Background jobs (saving a turn, indexing, summaries) run one at a time
 * and wait while a prompt's search is in flight, so they never slow down what the user is
 * waiting for. After `idleMs` without requests it closes the drivers and stops.
 */

import { createServer, createConnection, type Server, type Socket } from 'node:net';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SourceDriver } from '../sources/source-driver.js';
import { lineReader, type WorkerRequest, type WorkerResponse, type WorkerSearchResult, type WorkerStatus, type WorkerTurn } from './protocol.js';

export const DEFAULT_WORKER_IDLE_MS = 30 * 60 * 1000;

export interface WorkerServerOptions {
  socketPath: string;
  drivers: readonly (SourceDriver & { close?: () => Promise<void> })[];
  idleMs?: number;
  /** Called for each captured turn, as a background job (MemOS save, OpenClaw export…). */
  onCapture?: (turn: WorkerTurn) => Promise<void>;
  /** Called once the worker has shut down after being idle. */
  onIdle?: () => void;
}

export class WorkerAlreadyRunningError extends Error {
  constructor() {
    super('nexpath worker already running');
  }
}

export interface WorkerServer {
  listen(): Promise<void>;
  close(): Promise<void>;
  /** Queue a background job (one at a time, waits while a prompt is being answered). */
  schedule(job: () => Promise<void>): void;
  /** For tests: background jobs still waiting or running. */
  pendingJobs(): number;
}

export function createWorkerServer(options: WorkerServerOptions): WorkerServer {
  const idleMs = options.idleMs ?? DEFAULT_WORKER_IDLE_MS;
  let server: Server | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let activeSearches = 0;
  const jobs: (() => Promise<void>)[] = [];
  let jobRunning = false;
  const searchesDone: (() => void)[] = [];

  const touch = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      void close().then(() => options.onIdle?.());
    }, idleMs);
    idleTimer.unref?.();
  };

  const waitForSearches = () =>
    activeSearches === 0 ? Promise.resolve() : new Promise<void>((resolve) => searchesDone.push(resolve));

  const runJobs = async () => {
    if (jobRunning) return;
    jobRunning = true;
    try {
      while (jobs.length > 0 && !closed) {
        await waitForSearches(); // a prompt is waiting: background work steps aside
        const job = jobs.shift()!;
        await job().catch(() => {});
      }
    } finally {
      jobRunning = false;
    }
  };

  const handle = async (req: WorkerRequest): Promise<unknown> => {
    switch (req.type) {
      case 'ping':
        return { pid: process.pid };
      case 'status': {
        const sources = await Promise.all(
          options.drivers.map(async (d) => ({ name: d.name, available: await d.available().catch(() => false) }))
        );
        return { pid: process.pid, sources } satisfies WorkerStatus;
      }
      case 'search': {
        const driver = options.drivers.find((d) => d.name === req.source);
        if (!driver || !(await driver.available().catch(() => false))) return { available: false } satisfies WorkerSearchResult;
        activeSearches++;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.max(0, req.deadlineAt - Date.now()));
        try {
          const candidates = await driver.search(req.query, req.deadlineAt, controller.signal);
          return { available: true, candidates } satisfies WorkerSearchResult;
        } finally {
          clearTimeout(timer);
          activeSearches--;
          if (activeSearches === 0) searchesDone.splice(0).forEach((resolve) => resolve());
        }
      }
      case 'capture': {
        const onCapture = options.onCapture;
        if (onCapture) {
          jobs.push(() => onCapture(req.turn));
          void runJobs();
        }
        return { queued: Boolean(onCapture) };
      }
      default:
        throw new Error('unknown request');
    }
  };

  const onConnection = (socket: Socket) => {
    touch();
    socket.on(
      'data',
      lineReader((value) => {
        const req = value as WorkerRequest;
        touch();
        void handle(req).then(
          (result) => write(socket, { id: req.id, ok: true, result }),
          (err) => write(socket, { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) })
        );
      })
    );
    socket.on('error', () => {});
  };

  const listen = async () => {
    if (process.platform !== 'win32') mkdirSync(dirname(options.socketPath), { recursive: true, mode: 0o700 });
    try {
      await listenOn(options.socketPath, onConnection).then((s) => (server = s));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err;
      if (await isAlive(options.socketPath)) throw new WorkerAlreadyRunningError();
      // A crashed worker left its socket file behind: take it over.
      if (process.platform !== 'win32' && existsSync(options.socketPath)) unlinkSync(options.socketPath);
      server = await listenOn(options.socketPath, onConnection);
    }
    touch();
  };

  const close = async () => {
    if (closed) return;
    closed = true;
    if (idleTimer) clearTimeout(idleTimer);
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    await Promise.all(options.drivers.map((d) => d.close?.().catch(() => {})));
    if (process.platform !== 'win32' && existsSync(options.socketPath)) {
      try {
        unlinkSync(options.socketPath);
      } catch {
        /* already gone */
      }
    }
  };

  const schedule = (job: () => Promise<void>) => {
    if (closed) return;
    jobs.push(job);
    void runJobs();
  };

  return { listen, close, schedule, pendingJobs: () => jobs.length + (jobRunning ? 1 : 0) };
}

function write(socket: Socket, response: WorkerResponse): void {
  if (!socket.destroyed) socket.write(`${JSON.stringify(response)}\n`);
}

function listenOn(path: string, onConnection: (s: Socket) => void): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer(onConnection);
    // Owner-only socket file: no other user on the machine can talk to the worker.
    const previousUmask = process.platform === 'win32' ? undefined : process.umask(0o077);
    const restore = () => {
      if (previousUmask !== undefined) process.umask(previousUmask);
    };
    server.once('error', (err) => {
      restore();
      reject(err);
    });
    server.listen(path, () => {
      restore();
      server.removeAllListeners('error');
      resolve(server);
    });
  });
}

function isAlive(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection(path);
    const done = (alive: boolean) => {
      socket.destroy();
      resolve(alive);
    };
    socket.setTimeout(500, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}
