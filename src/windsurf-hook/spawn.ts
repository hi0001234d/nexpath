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
 * M2 branch stays decoupled. Children are spawned **detached + unref'd** so they
 * outlive this short-lived shim process (a hook must return fast; `stop` then runs
 * its popup independently). Binary resolution: opts.binaryPath → $NEXPATH_BIN → 'nexpath'.
 */
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

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

function resolveBin(deps: SpawnDeps): string {
  return deps.binaryPath ?? process.env.NEXPATH_BIN ?? 'nexpath';
}

function baseOpts(deps: SpawnDeps): SpawnOptions {
  // stdin piped (we write the payload); stdout/stderr ignored (fire-and-forget);
  // detached so the child survives this process exiting.
  return { cwd: deps.cwd, stdio: ['pipe', 'ignore', 'ignore'], env: process.env, detached: true };
}

/** Spawn `nexpath auto --project <cwd>` with the captured prompt on stdin. */
export function spawnAuto(prompt: string, deps: SpawnDeps): ChildProcess | null {
  const spawnFn = deps.spawnFn ?? spawn;
  try {
    const auto = spawnFn(resolveBin(deps), ['auto', '--project', deps.cwd], baseOpts(deps));
    auto.on?.('error', (e: Error) => deps.onTrace?.('spawn-error', { error: `auto: ${String(e)}` }));
    auto.stdin?.write(JSON.stringify({ prompt }));
    auto.stdin?.end();
    auto.unref?.();
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
  try {
    const stop = spawnFn(resolveBin(deps), ['stop'], baseOpts(deps));
    stop.on?.('error', (e: Error) => deps.onTrace?.('spawn-error', { error: `stop: ${String(e)}` }));
    stop.stdin?.write(JSON.stringify({ cwd: deps.cwd, hook_event_name: 'Stop', stop_hook_active: false }));
    stop.stdin?.end();
    stop.unref?.();
    deps.onTrace?.('stop-spawned', { pid: stop.pid });
    return stop;
  } catch (e) {
    deps.onTrace?.('spawn-error', { error: `stop: ${String(e)}` });
    return null;
  }
}
