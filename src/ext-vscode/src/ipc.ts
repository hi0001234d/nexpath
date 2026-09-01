import { spawn } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import { bringPopupToFront } from './popup-foreground.js';
import { shellSafeSpawnTokens } from './shell-quote.js';
import { readInjectedPrompt } from './advisory-store-reader.js';

/**
 * IPC layer between the VS Code extension (Layer B) and the existing nexpath
 * CLI pipeline (Layer C). The extension never imports from Layer C directly;
 * instead it spawns `nexpath auto` and `nexpath stop` as subprocesses and
 * communicates via stdin/stdout JSON envelopes.
 *
 * Defines the spawn + parse contract and the error taxonomy. The chat-history
 * watcher and webview payload renderer call into this module; the Cursor /
 * Windsurf adapters supply concrete binary-path resolution. Fully built and
 * hard-frozen by the dev plan — `ipc.test.ts` locks `spawnStop`'s contract
 * including Windows crash recovery; any change here is a regression risk.
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

/**
 * The result of `nexpath stop` when the user picked an option in Layer C's
 * terminal popup. Layer C emits `{ decision: 'block', reason: <option text> }`
 * to stdout on selection (see `src/cli/commands/stop.ts`); `reason` is the
 * pre-filled prompt the user chose. The extension injects it into the host's
 * chat input. (The legacy `DecisionSessionPayload` shape was never what Layer C
 * emits here — see `spawnStop`.)
 */
export interface StopSelection {
  /** The prompt text the user selected in the terminal popup. */
  selectedPrompt: string;
}

/** Cap accumulated child stderr so a runaway process can't balloon extension memory. */
const MAX_STDERR_BYTES = 64 * 1024;

function appendCapped(buffer: string, chunk: string): string {
  if (buffer.length >= MAX_STDERR_BYTES) return buffer;
  return (buffer + chunk).slice(0, MAX_STDERR_BYTES);
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
  /**
   * Recover the user's terminal-popup selection from the store when `nexpath
   * stop` exits non-zero without usable stdout. This happens on Windows, where
   * Layer C's `process.exit(0)` after a selection trips a libuv assertion (the
   * process dies with a non-zero code and the stdout payload can be lost) — but
   * Layer C has already persisted the chosen prompt to
   * `session_states.lastInjectedPrompt`. Defaults to reading that value.
   * Injected in tests.
   */
  recoverSelection?: (cwd: string) => Promise<string | null>;
}

export class NexpathBinaryNotFoundError extends Error {
  constructor(public attemptedPath: string, public override cause?: Error) {
    super(`nexpath binary not found or not executable at: ${attemptedPath}`);
    this.name = 'NexpathBinaryNotFoundError';
  }
}

/** How the JSON parser failed. Fixed classifications — never payload text. */
export type MalformedPayloadParseErrorKind =
  | 'unexpected_token'
  | 'unexpected_end'
  | 'unknown';

/**
 * Redacted description of an unparseable `nexpath stop` payload.
 *
 * The stop stdout is `{decision:'block', reason:<body>}`. On the prompt-
 * enhancement path that `reason` IS the generated body; on the advisory path it
 * is the user's selected prompt. Both are **delivery-only**: they may travel
 * through this channel to be delivered, but must never be copied into a log,
 * telemetry event, or error payload. So this records the *shape* of the failure
 * and not one byte of the content.
 */
export interface MalformedPayloadShape {
  /** Payload size in UTF-8 bytes (not characters). */
  byteLength: number;
  parseErrorKind: MalformedPayloadParseErrorKind;
  /** Byte offset the parser reported, when it reported one. */
  byteOffset?: number;
}

/**
 * Classify a parse failure without retaining any payload content.
 *
 * The `SyntaxError` message itself is NOT safe to keep: V8 embeds an excerpt of
 * the offending input in it (`Unexpected token 'o', "…" is not valid JSON`).
 * Only the fixed prefix is matched, and only the numeric position is extracted.
 */
export function describeMalformedPayload(
  rawStdout: string,
  err: unknown,
): MalformedPayloadShape {
  const message = err instanceof Error ? err.message : '';

  let parseErrorKind: MalformedPayloadParseErrorKind = 'unknown';
  if (/^Unexpected end of/.test(message)) parseErrorKind = 'unexpected_end';
  else if (/^(Unexpected token|Expected)/.test(message)) parseErrorKind = 'unexpected_token';

  const positionMatch = /at position (\d+)/.exec(message);

  return {
    byteLength: Buffer.byteLength(rawStdout, 'utf8'),
    parseErrorKind,
    ...(positionMatch ? { byteOffset: Number(positionMatch[1]) } : {}),
  };
}

export class NexpathMalformedPayloadError extends Error {
  /**
   * The redacted failure shape. This class deliberately does NOT keep the raw
   * stdout or the underlying `SyntaxError` as `cause` — either would carry the
   * delivered body into anything that logs or serializes this error.
   */
  readonly shape: MalformedPayloadShape;

  constructor(shape: MalformedPayloadShape) {
    const at = shape.byteOffset === undefined ? '' : ` at byte ${shape.byteOffset}`;
    super(
      `nexpath stop output is not valid JSON ` +
        `(${shape.byteLength} bytes, ${shape.parseErrorKind}${at})`,
    );
    this.name = 'NexpathMalformedPayloadError';
    this.shape = shape;
  }
}

/**
 * Redacted description of a child `nexpath` process that exited non-zero.
 *
 * The child's stderr is NOT safe to quote. `NEXPATH_DEBUG=1` routes verbose
 * pipeline logging there, and Layer C writes prompt-related lines of its own
 * (`stop.ts` "Prompt sent to …"). Embedding it put up to the 64 KB cap of that
 * output into an Error message, which the extension then logged. Same rule as
 * the malformed-payload path: record the shape, never the content.
 */
export interface ChildFailureShape {
  /** Process exit code, or null when the child was killed by a signal. */
  exitCode: number | null;
  /** stderr size in UTF-8 bytes, capped as accumulated. Text never retained. */
  stderrByteLength: number;
}

export function describeChildFailure(
  exitCode: number | null,
  stderr: string,
): ChildFailureShape {
  return { exitCode, stderrByteLength: Buffer.byteLength(stderr, 'utf8') };
}

/**
 * A spawned `nexpath` command exited non-zero.
 *
 * Deliberately carries no stderr text — only the exit code and how many bytes
 * were produced, which is enough to tell "failed silently" from "failed loudly"
 * without publishing what was said.
 */
export class NexpathChildExitError extends Error {
  readonly shape: ChildFailureShape;

  constructor(command: 'auto' | 'stop', shape: ChildFailureShape) {
    super(
      `nexpath ${command} exited with code ${shape.exitCode} ` +
        `(stderr ${shape.stderrByteLength} bytes, not captured)`,
    );
    this.name = 'NexpathChildExitError';
    this.shape = shape;
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
  // unaffected (shell stays false).
  //
  // RC66: the old note here — "args are simple, so shell concatenation is
  // safe" — was FALSE the moment a Windows username contains a space: both the
  // NEXPATH_BIN shim path and the `--db <~/.nexpath path>` arg live under the
  // user's home ("C:\Users\SALVI GAURAV\.nexpath\..."), and the shell splits
  // them unquoted. The spawn call sites now pass their tokens through
  // `shellSafeSpawnTokens` (spaced tokens quoted on win32 only; every
  // space-free spawn stays byte-identical).
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
  // RC66: quote spaced tokens for the win32 shell spawn (see buildSpawnOptions).
  const safe = shellSafeSpawnTokens(bin, args);
  const child = spawner(safe.bin, safe.args, buildSpawnOptions(opts));

  return new Promise<void>((resolve, reject) => {
    let stderr = '';
    let errored = false;

    child.on('error', (err: Error) => {
      errored = true;
      reject(new NexpathBinaryNotFoundError(bin, err));
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = appendCapped(stderr, chunk.toString());
    });
    child.on('close', (code: number | null) => {
      if (errored) return;
      if (code === 0) {
        resolve();
        return;
      }
      reject(new NexpathChildExitError('auto', describeChildFailure(code, stderr)));
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
 * `nexpath stop` opens Layer C's terminal popup and blocks until the user acts.
 * It writes `{ decision: 'block', reason: <selected option text> }` to stdout
 * ONLY when the user selects an option there; on dismiss / no-advisory / no-TTY
 * it writes nothing. So:
 *   - empty stdout                        → resolve(null)   (no selection to act on)
 *   - `{ decision:'block', reason:string }`→ resolve({ selectedPrompt: reason })
 *   - any other JSON shape                → resolve(null)   (nothing actionable)
 *   - non-JSON                            → reject(NexpathMalformedPayloadError)
 * Rejects on spawn failure or non-zero exit.
 */
export function spawnStop(
  sessionId: string,
  opts: IpcOptions = {},
): Promise<StopSelection | null> {
  const bin = resolveBinaryPath(opts);
  const args = buildArgs('stop', opts.dbPath);
  const spawner = opts.spawnFn ?? spawn;
  // RC66: quote spaced tokens for the win32 shell spawn (see buildSpawnOptions).
  const safe = shellSafeSpawnTokens(bin, args);
  const child = spawner(safe.bin, safe.args, buildSpawnOptions(opts));

  // Layer C's `nexpath stop` opens the advisory popup as a separate OS window.
  // macOS/Windows foreground it at launch; Linux/gnome-terminal can't, so under
  // GNOME focus-stealing prevention it opens behind Cursor. Bring it to the front
  // ourselves (Linux-only, graceful no-op otherwise). Only in the real spawn path
  // — tests inject `spawnFn` and don't want us shelling out to wmctrl.
  if (!opts.spawnFn) bringPopupToFront();

  const recover = opts.recoverSelection ?? ((cwd: string) => readInjectedPrompt(cwd));

  return new Promise<StopSelection | null>((resolve, reject) => {
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
      stderr = appendCapped(stderr, chunk.toString());
    });
    child.on('close', (code: number | null) => {
      if (errored) return;
      void (async () => {
        const trimmed = stdout.trim();

        // 1. A selection on stdout — accept it REGARDLESS of exit code. Covers the
        //    normal Linux/macOS path (exit 0) and a Windows crash where the stdout
        //    payload still made it out before the process died.
        if (trimmed.length > 0) {
          try {
            const p = JSON.parse(trimmed) as { decision?: unknown; reason?: unknown };
            if (p && p.decision === 'block' && typeof p.reason === 'string' && p.reason.length > 0) {
              resolve({ selectedPrompt: p.reason });
              return;
            }
            // Valid JSON but not the selection shape — nothing to inject (clean exit).
            if (code === 0) { resolve(null); return; }
          } catch (err) {
            // Non-JSON on a CLEAN exit is a genuine contract violation.
            if (code === 0) {
              reject(new NexpathMalformedPayloadError(describeMalformedPayload(trimmed, err)));
              return;
            }
            // Non-JSON on a NON-zero exit is a truncated payload from a crash —
            // fall through to store recovery below.
          }
        } else if (code === 0) {
          // Clean exit, empty stdout → dismissed / no advisory / no TTY.
          resolve(null);
          return;
        }

        // 2. Non-zero exit and no usable stdout (Windows libuv crash on stop's
        //    forced process.exit AFTER a selection). Layer C persisted the chosen
        //    prompt before the crash — recover it so the injection still happens.
        try {
          const recovered = await recover(opts.cwd ?? process.cwd());
          if (recovered) { resolve({ selectedPrompt: recovered }); return; }
        } catch {
          // recovery best-effort — fall through to the failure below
        }

        // 3. Genuine failure with nothing to recover.
        reject(new NexpathChildExitError('stop', describeChildFailure(code, stderr)));
      })();
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
