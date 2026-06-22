/**
 * `nexpath windsurf-hook <event>` — the shim invoked by Windsurf's Cascade hooks
 * (configured in ~/.codeium/windsurf/hooks.json by `nexpath install`).
 *
 * Reads the hook JSON on stdin, remaps it to the nexpath Layer-C CLI contract, and
 * fires `nexpath auto` / `nexpath stop`. `<event>` ∈ { pre_user_prompt,
 * post_cascade_response }. `--project <dir>` overrides the project root (defaults
 * to process.cwd(), which Windsurf sets to the active workspace folder).
 *
 * Always exits 0 — a hook must never block or break Cascade.
 */
import type { Command } from 'commander';
import type { ChildProcess } from 'node:child_process';
import { runWindsurfHook, type RunResult } from '../../windsurf-hook/handler.js';

/**
 * Resolve once the spawned `auto`/`stop` child exits (so the hook has finished its
 * work — `auto` has persisted the advisory, `stop` has shown the popup + got the
 * selection — before we return). Resolves immediately if there is no child, and
 * is bounded by `timeoutMs` so a hook can never hang forever.
 */
export function awaitChild(child: ChildProcess | null | undefined, timeoutMs = 600_000): Promise<void> {
  if (!child) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => { if (!done) { done = true; resolve(); } };
    const timer = setTimeout(finish, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    child.on('exit', finish);
    child.on('close', finish);
    child.on('error', finish);
  });
}

/** Read all of stdin (returns '' immediately when attached to a TTY / no pipe). */
export function defaultReadStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

export interface WindsurfHookCliDeps {
  readStdin?: () => Promise<string>;
  run?: typeof runWindsurfHook;
  cwd?: string;
}

/**
 * Testable core: read stdin, resolve the project root, dispatch to the handler.
 * Kept free of `process.exit` so unit tests can call it directly.
 */
export async function handleWindsurfHookCli(
  event: string,
  opts: { project?: string },
  deps: WindsurfHookCliDeps = {},
): Promise<RunResult> {
  const readStdin = deps.readStdin ?? defaultReadStdin;
  const run = deps.run ?? runWindsurfHook;
  const cwd = opts.project ?? deps.cwd ?? process.cwd();
  const raw = await readStdin();
  return run(event, raw, { cwd });
}

export function registerWindsurfHookCommand(program: Command): void {
  program
    .command('windsurf-hook <event>')
    .description('Internal: bridge a Windsurf Cascade hook to nexpath auto/stop (configured by `nexpath install`).')
    .option('-p, --project <dir>', 'Project root (defaults to the current working directory)')
    .action(async (event: string, opts: { project?: string }) => {
      try {
        // Name this surface for Layer C's popup "Send to …" label. The spawned
        // `nexpath stop` child inherits process.env (see windsurf-hook/spawn.ts
        // baseOpts), so setting it here makes the Windsurf popup say "Windsurf".
        process.env.NEXPATH_AGENT = 'windsurf';
        const result = await handleWindsurfHookCli(event, opts);
        // Await the Layer-C child so the prompt is fully written + auto has
        // persisted the advisory (and stop has rendered the popup) before we exit.
        await awaitChild(result.child);
      } catch {
        // Never break Cascade — swallow any error and exit cleanly.
      }
      process.exit(0);
    });
}
