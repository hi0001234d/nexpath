/**
 * Layer-C CLI spawn primitives for the Windsurf Cascade-hook adapter.
 *
 * Drives the EXISTING nexpath CLI contract — **Layer C is never modified**:
 *   - `nexpath auto --project <cwd>`  + stdin `{ prompt }`
 *   - `nexpath stop`                  + stdin `{ cwd, hook_event_name:'Stop', stop_hook_active:false }`
 *
 * `auto` persists the pending advisory keyed by project root; `stop` looks that
 * advisory up for `cwd` and renders Layer C's native popup (`createTtySelectFn`).
 * In the Windsurf flow these are two SEPARATE hook firings (`pre_user_prompt` →
 * auto, `post_cascade_response` → stop), so sequencing is inherent — no chaining.
 *
 * Self-contained on purpose (no dependency on the parked ACP `bridge.ts`) so this
 * M2 branch stays decoupled. Children are spawned NOT detached: the caller (the
 * windsurf-hook CLI action) **awaits the child's exit** before returning, so the
 * prompt is fully written + `auto` has persisted the advisory before the hook
 * returns — mirroring how Claude Code runs `auto`/`stop` synchronously in its
 * hooks. (An earlier detached + process.exit(0) design raced the stdin write and
 * dropped the prompt.)
 *
 * Invocation (opts.binaryPath → $NEXPATH_BIN → **`node <this CLI script>`**): by
 * default we re-invoke the SAME node + cli script this process is running
 * (`process.execPath` + `resolve(process.argv[1])`), NOT a bare `nexpath` on PATH.
 * A bare PATH name fails with ENOENT under a sanitized hook env (Windsurf strips
 * PATH for hook subprocesses) — the same reason Claude Code's hook command uses
 * `node "<cliPath>"`.
 */
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { resolve } from 'node:path';

export type TraceEvent = 'auto-spawned' | 'stop-spawned' | 'spawn-error';

export interface SpawnDeps {
  /** Project root — `nexpath auto`/`stop` cwd + `--project` value (keys the store). */
  cwd: string;
  /** Override the resolved nexpath binary (test/dev). */
  binaryPath?: string;
  /** Inject spawn for tests; defaults to node:child_process spawn. */
  spawnFn?: typeof spawn;
  /** Optional trace hook so tests can assert traffic. */
  onTrace?: (event: TraceEvent, detail: { pid?: number; error?: string }) => void;
}

/**
 * How to invoke the nexpath CLI: a command + a fixed argv prefix.
 * - opts.binaryPath / $NEXPATH_BIN → that runnable binary, no prefix.
 * - default → `process.execPath` (absolute node) + `resolve(process.argv[1])`
 *   (absolute path to THIS cli script) — robust under a sanitized hook PATH.
 */
function nexpathCmd(deps: SpawnDeps): { cmd: string; prefix: string[] } {
  if (deps.binaryPath) return { cmd: deps.binaryPath, prefix: [] };
  if (process.env.NEXPATH_BIN) return { cmd: process.env.NEXPATH_BIN, prefix: [] };
  return { cmd: process.execPath, prefix: [resolve(process.argv[1])] };
}

function baseOpts(deps: SpawnDeps): SpawnOptions {
  // stdin piped (we write the payload); stdout/stderr ignored. NOT detached — the
  // caller awaits exit (see awaitChild in the CLI action), so the child must stay
  // tied to this process while it runs.
  return { cwd: deps.cwd, stdio: ['pipe', 'ignore', 'ignore'], env: process.env };
}

/** Spawn `nexpath auto --project <cwd>` with the captured prompt on stdin. */
export function spawnAuto(prompt: string, deps: SpawnDeps): ChildProcess | null {
  const spawnFn = deps.spawnFn ?? spawn;
  const { cmd, prefix } = nexpathCmd(deps);
  try {
    const auto = spawnFn(cmd, [...prefix, 'auto', '--project', deps.cwd], baseOpts(deps));
    auto.on?.('error', (e: Error) => deps.onTrace?.('spawn-error', { error: `auto: ${String(e)}` }));
    auto.stdin?.write(JSON.stringify({ prompt }));
    auto.stdin?.end();
    deps.onTrace?.('auto-spawned', { pid: auto.pid });
    return auto;
  } catch (e) {
    deps.onTrace?.('spawn-error', { error: `auto: ${String(e)}` });
    return null;
  }
}

/** Spawn `nexpath stop` for the project at deps.cwd → Layer C renders the popup. */
export function spawnStop(deps: SpawnDeps): ChildProcess | null {
  const spawnFn = deps.spawnFn ?? spawn;
  const { cmd, prefix } = nexpathCmd(deps);
  try {
    const stop = spawnFn(cmd, [...prefix, 'stop'], baseOpts(deps));
    stop.on?.('error', (e: Error) => deps.onTrace?.('spawn-error', { error: `stop: ${String(e)}` }));
    stop.stdin?.write(JSON.stringify({ cwd: deps.cwd, hook_event_name: 'Stop', stop_hook_active: false }));
    stop.stdin?.end();
    deps.onTrace?.('stop-spawned', { pid: stop.pid });
    return stop;
  } catch (e) {
    deps.onTrace?.('spawn-error', { error: `stop: ${String(e)}` });
    return null;
  }
}
