import { spawn } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import { bringPopupToFront } from './popup-foreground.js';

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
  /**
   * Working directory for the spawned nexpath process. This is REQUIRED for
   * correct project-root resolution: `nexpath auto` defaults `--project` to
   * `process.cwd()`, and `nexpath stop` reads `payload.cwd` from stdin. In
   * extension use, this is the user's current workspace folder.
   *
   * If omitted, `process.cwd()` of the calling process is used.
   */
  cwd?: string;
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

/**
 * Build the child env, restoring `DBUS_SESSION_BUS_ADDRESS` when it's missing.
 *
 * Layer C's `nexpath stop` renders the decision-session popup by spawning a
 * terminal (`gnome-terminal` on Linux), which is a DBus client — it asks
 * `gnome-terminal-server` over the session bus to open the window. When Cursor
 * itself is launched without `DBUS_SESSION_BUS_ADDRESS` (desktop launchers,
 * remote / VNC / `DISPLAY=:1` sessions, or an already-running instance started
 * in a different session), the extension host — and therefore the spawned
 * `nexpath stop` — has no session bus, so gnome-terminal silently fails to open
 * and the advisory is `stop_skipped` with no popup. The fix: if the var is
 * absent, point it at the standard per-user bus socket `/run/user/<uid>/bus`
 * when that socket actually exists. Never overrides an address that's already
 * present, and no-ops on non-Linux / when the socket is missing.
 */
export interface SpawnEnvDeps {
  env?: NodeJS.ProcessEnv;
  getuid?: () => number;
  existsSync?: (path: string) => boolean;
}

export function resolveSpawnEnv(deps: SpawnEnvDeps = {}): NodeJS.ProcessEnv {
  const getuid =
    deps.getuid ?? (typeof process.getuid === 'function' ? process.getuid.bind(process) : undefined);
  const fsExists = deps.existsSync ?? existsSync;
  const env = { ...(deps.env ?? process.env) };
  if (!env.DBUS_SESSION_BUS_ADDRESS && getuid) {
    const socket = `/run/user/${getuid()}/bus`;
    if (fsExists(socket)) {
      env.DBUS_SESSION_BUS_ADDRESS = `unix:path=${socket}`;
    }
  }
  return env;
}

function buildSpawnOptions(opts: IpcOptions): SpawnOptions {
  // `cwd` is required by Layer C for correct project-root resolution:
  //   - `nexpath auto` defaults its `--project` flag to `process.cwd()` of the
  //     spawned process, then loads `.env` from there and writes hook-stats
  //     to the matching project.
  //   - `nexpath stop` reads `payload.cwd` from stdin (we pass it explicitly
  //     in `spawnStop`), but also benefits from spawning at the right cwd
  //     for consistency with auto.
  // `env` restores the session bus so Layer C's gnome-terminal popup can open
  // even when Cursor was launched without DBUS_SESSION_BUS_ADDRESS.
  //
  // `shell` on Windows: the resolved CLI is `nexpath.cmd` (npm-link/global bin)
  // or `node`-shebang script; Node's spawn refuses to execute a `.cmd` shim
  // without a shell (post CVE-2024-27980) → `spawnAuto failed` / capture never
  // runs. Spawning through cmd.exe lets Windows resolve the `.cmd`. POSIX is
  // unaffected (shell stays false). Args here are simple (`auto`/`stop` +
  // `--db <~/.nexpath path>`), so shell concatenation is safe.
  return {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd:   opts.cwd ?? process.cwd(),
    env:   resolveSpawnEnv(),
    shell: process.platform === 'win32',
  };
}

/**
 * Spawn `nexpath auto` and forward the prompt to it.
 *
 * Layer C's `nexpath auto` accepts the prompt via stdin JSON in hook mode
 * (parsed as `{ prompt: string }` — see `src/cli/commands/auto.ts:417-425`).
 * The spawned process's `cwd` controls `--project` defaulting, which in
 * turn drives `.env` loading + prompt-store writes.
 *
 * Resolves on clean exit; rejects on spawn failure or non-zero exit.
 */
export function spawnAuto(
  prompt: string,
  sessionId: string,
  opts: IpcOptions = {},
): Promise<void> {
  const bin = resolveBinaryPath(opts);
  const args = buildArgs('auto', opts.dbPath);
  const spawner = opts.spawnFn ?? spawn;
  const child = spawner(bin, args, buildSpawnOptions(opts));

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
 *
 * Layer C's `nexpath stop` expects a full Claude Code-shaped `StopPayload`
 * on stdin (parsed in `src/cli/commands/stop.ts:186-192`):
 *
 *   {
 *     session_id?:       string;
 *     cwd:               string;   // REQUIRED — project-root resolver
 *     hook_event_name:   string;   // REQUIRED — 'Stop'
 *     stop_hook_active:  boolean;  // REQUIRED — loop-guard
 *     last_assistant_message?: string;
 *   }
 *
 * We construct the full shape here so Layer C's stdin parse succeeds and
 * `runStop` reads our request correctly. `last_assistant_message` is
 * omitted (the watcher emits user-prompt events only; the assistant
 * response isn't part of our captured signal).
 *
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
  const child = spawner(bin, args, buildSpawnOptions(opts));

  // Layer C's `nexpath stop` opens the advisory popup as a separate OS window.
  // macOS/Windows foreground it at launch; Linux/gnome-terminal can't, so under
  // GNOME focus-stealing prevention it opens behind Cursor. Bring it to the front
  // ourselves (Linux-only, graceful no-op otherwise). Only in the real spawn path
  // — tests inject `spawnFn` and don't want us shelling out to wmctrl.
  if (!opts.spawnFn) bringPopupToFront();

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

    // Full StopPayload shape — Layer C requires cwd / hook_event_name /
    // stop_hook_active in addition to the optional session_id.
    child.stdin?.end(
      JSON.stringify({
        session_id:       sessionId,
        cwd:              opts.cwd ?? process.cwd(),
        hook_event_name:  'Stop',
        stop_hook_active: false,
      }) + '\n',
    );
  });
}
