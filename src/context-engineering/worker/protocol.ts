/**
 * Feature 1 — v1(a) worker protocol: newline-delimited JSON over a local pipe.
 *
 * Unix: a socket file under ~/.nexpath/worker/. Windows: a named pipe. Never a TCP port (D10).
 * Only plain, non-secret data crosses the pipe: no device tokens, no database handles.
 */

import { createHash } from 'node:crypto';
import { homedir, tmpdir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { DEFAULT_DB_PATH } from '../../store/db.js';
import type { SourceCandidate, SourceName, SourceQuery } from '../sources/source-driver.js';

export interface WorkerTurn {
  projectRoot: string;
  sessionId: string;
  prompt: string;
  response: string;
  ts: number;
}

export type WorkerRequest =
  | { id: number; type: 'ping' }
  | { id: number; type: 'status' }
  | { id: number; type: 'search'; source: SourceName; query: SourceQuery; deadlineAt: number }
  | { id: number; type: 'capture'; turn: WorkerTurn };

export type WorkerResponse = { id: number; ok: true; result?: unknown } | { id: number; ok: false; error: string };

export interface WorkerStatus {
  pid: number;
  sources: { name: SourceName; available: boolean }[];
}

export type WorkerSearchResult = { available: false } | { available: true; candidates: SourceCandidate[] };

export interface WorkerPaths {
  dir: string;
  socket: string;
  lock: string;
  startMarker: string;
  /** The running worker's process id, so it can be stopped even when it is too busy to answer. */
  pidFile: string;
}

/** Where the worker lives: next to Nexpath's database unless a home is given (tests). */
export function workerPaths(nexpathHome: string = dirname(DEFAULT_DB_PATH)): WorkerPaths {
  const dir = join(nexpathHome, 'worker');
  const socket =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\nexpath-worker-${createHash('sha256').update(`${userInfo().username}:${nexpathHome}`).digest('hex').slice(0, 12)}`
      : unixSocketPath(dir, nexpathHome);
  return { dir, socket, lock: join(dir, 'worker.lock'), startMarker: join(dir, 'worker.starting'), pidFile: join(dir, 'worker.pid') };
}

/** Unix socket paths are limited to ~104 bytes (macOS) / 108 (Linux). */
const MAX_UNIX_SOCKET_PATH = 100;

/**
 * `<home>/worker/worker.sock`, or — when that is too long for a Unix socket (deep home
 * folders) — a short per-user path in the temp dir. The socket file itself is created
 * owner-only by the server (umask 077).
 */
function unixSocketPath(dir: string, nexpathHome: string): string {
  const preferred = join(dir, 'worker.sock');
  if (Buffer.byteLength(preferred) <= MAX_UNIX_SOCKET_PATH) return preferred;
  const id = createHash('sha256').update(`${userInfo().uid}:${nexpathHome}`).digest('hex').slice(0, 16);
  const short = join(tmpdir(), `nexpath-${id}.sock`);
  return Buffer.byteLength(short) <= MAX_UNIX_SOCKET_PATH ? short : join('/tmp', `nexpath-${id}.sock`);
}

export function defaultNexpathHome(): string {
  return dirname(DEFAULT_DB_PATH) || join(homedir(), '.nexpath');
}

/** Only what a driver needs; strips the store, device token and device id. */
/** Our map's facts sent to the meaning source with each prompt (a few KB). */
export const MAX_WIRE_MAP_FACTS = 500;

export function toWireQuery(query: SourceQuery): SourceQuery {
  const c = query.context;
  return {
    prompt: query.prompt,
    projectRoot: query.projectRoot,
    ...(query.sessionId ? { sessionId: query.sessionId } : {}),
    ...(query.hasGaps !== undefined ? { hasGaps: query.hasGaps } : {}),
    ...(query.mapFacts ? { mapFacts: query.mapFacts.slice(0, MAX_WIRE_MAP_FACTS).map((f) => ({ id: f.id, content: f.content })) } : {}),
    ...(c
      ? {
          context: {
            workspacePath: c.workspacePath,
            ...(c.activeFilePath ? { activeFilePath: c.activeFilePath } : {}),
            ...(c.gitBranch ? { gitBranch: c.gitBranch } : {}),
            ...(c.recentModifiedFiles ? { recentModifiedFiles: c.recentModifiedFiles } : {}),
          },
        }
      : {}),
  };
}

/** Splits a byte stream into JSON lines. */
export function lineReader(onLine: (value: unknown) => void): (chunk: Buffer | string) => void {
  let buffered = '';
  return (chunk) => {
    buffered += chunk.toString();
    let nl = buffered.indexOf('\n');
    while (nl >= 0) {
      const line = buffered.slice(0, nl).trim();
      buffered = buffered.slice(nl + 1);
      if (line) {
        try {
          onLine(JSON.parse(line));
        } catch {
          /* ignore a malformed line */
        }
      }
      nl = buffered.indexOf('\n');
    }
  };
}
