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
import { runWindsurfHook, type RunResult } from '../../windsurf-hook/handler.js';

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
        await handleWindsurfHookCli(event, opts);
      } catch {
        // Never break Cascade — swallow any error and exit cleanly.
      }
      process.exit(0);
    });
}
