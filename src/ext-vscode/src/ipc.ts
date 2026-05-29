import { spawn } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';

/**
 * IPC layer between the VS Code extension (Layer B) and the existing nexpath
 * CLI pipeline (Layer C). The extension never imports from Layer C directly;
 * instead it spawns `nexpath auto` and `nexpath stop` as subprocesses and
 * communicates via stdin/stdout JSON envelopes.
 *
 * This module is a Branch 1 STUB — it defines the spawn + parse contract and
 * the error taxonomy. The actual chat-history watcher (Branch 2) and webview
 * payload renderer (Branch 3) call into this module; the Cursor / Windsurf
 * adapters (Branch 4) supply concrete binary-path resolution.
 *
 * Binary path resolution order (highest priority first):
 *   1. `opts.binaryPath` — explicit override (test fixtures, dev setups)
 *   2. `process.env.NEXPATH_BIN` — for users who install via a non-standard PATH
 *   3. `'nexpath'` — fall back to PATH lookup
 */

export interface DecisionSessionPayload {
  /** Advisory text to show in the webview / notification. */
  advisory: string;
  /** Selectable options the user may pick. */
  options: Array<{ id: string; label: string }>;
}

export interface IpcOptions {
  binaryPath?: string;
  dbPath?: string;
  spawnFn?: typeof spawn;
}

export class NexpathBinaryNotFoundError extends Error {
  constructor(public attemptedPath: string, public override cause?: Error) {
    super(`nexpath binary not found or not executable at: ${attemptedPath}`);
    this.name = 'NexpathBinaryNotFoundError';
  }
}

export class NexpathMalformedPayloadError extends Error {
  constructor(public rawStdout: string, public override cause?: Error) {
    super(
      `nexpath stop output is not valid JSON. First 200 chars: ${rawStdout.slice(0, 200)}`,
    );
    this.name = 'NexpathMalformedPayloadError';
  }
}

function resolveBinaryPath(opts: IpcOptions): string {
  return opts.binaryPath ?? process.env.NEXPATH_BIN ?? 'nexpath';
}

function buildArgs(
  command: 'auto' | 'stop',
  dbPath: string | undefined,
): string[] {
  const args: string[] = [command];
  if (dbPath) args.push('--db', dbPath);
  return args;
}

const spawnOptions: SpawnOptions = { stdio: ['pipe', 'pipe', 'pipe'] };

/**
 * Spawn `nexpath auto` and forward the prompt + session id via stdin.
 * Resolves on a clean exit; rejects on spawn failure or non-zero exit.
 */
export function spawnAuto(
  prompt: string,
  sessionId: string,
  opts: IpcOptions = {},
): Promise<void> {
  const bin = resolveBinaryPath(opts);
  const args = buildArgs('auto', opts.dbPath);
  const spawner = opts.spawnFn ?? spawn;
  const child = spawner(bin, args, spawnOptions);

  return new Promise<void>((resolve, reject) => {
    let stderr = '';
    let errored = false;

    child.on('error', (err: Error) => {
      errored = true;
      reject(new NexpathBinaryNotFoundError(bin, err));
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('close', (code: number | null) => {
      if (errored) return;
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `nexpath auto exited with code ${code}. stderr: ${stderr.trim()}`,
        ),
      );
    });

    child.stdin?.end(
      JSON.stringify({ prompt, session_id: sessionId }) + '\n',
    );
  });
}

/**
 * Spawn `nexpath stop` and parse the decision-session payload from stdout.
 * Resolves with `null` when stdout is empty (no advisory generated).
 * Resolves with the parsed payload otherwise.
 * Rejects on spawn failure, non-zero exit, or malformed JSON.
 */
export function spawnStop(
  sessionId: string,
  opts: IpcOptions = {},
): Promise<DecisionSessionPayload | null> {
  const bin = resolveBinaryPath(opts);
  const args = buildArgs('stop', opts.dbPath);
  const spawner = opts.spawnFn ?? spawn;
  const child = spawner(bin, args, spawnOptions);

  return new Promise<DecisionSessionPayload | null>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let errored = false;

    child.on('error', (err: Error) => {
      errored = true;
      reject(new NexpathBinaryNotFoundError(bin, err));
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('close', (code: number | null) => {
      if (errored) return;
      if (code !== 0) {
        reject(
          new Error(
            `nexpath stop exited with code ${code}. stderr: ${stderr.trim()}`,
          ),
        );
        return;
      }
      const trimmed = stdout.trim();
      if (trimmed.length === 0) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(trimmed) as DecisionSessionPayload);
      } catch (err) {
        reject(new NexpathMalformedPayloadError(trimmed, err as Error));
      }
    });

    child.stdin?.end(JSON.stringify({ session_id: sessionId }) + '\n');
  });
}
