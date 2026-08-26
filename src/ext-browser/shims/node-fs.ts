/**
 * Browser build shim for `node:fs` — absent-filesystem semantics for the
 * prompt-enhancement engine's project probes (source-reality.ts reads
 * tsconfig/package.json/.gitignore etc. via `existsSync` + `readFileSync`).
 *
 * The browser has no project filesystem, so the shim answers the way a missing
 * file answers on the CLI: `existsSync` → false, `readFileSync` → throws an
 * ENOENT-shaped error. That routes execution through the ENGINE'S OWN
 * defensive absent-path branches (every read there is wrapped) — no behaviour
 * is invented on the engine side.
 *
 * Wired in by the `nexpath-node-shims` esbuild plugin (scripts/build-ext.mjs);
 * never imported directly by application code. Any OTHER node:fs API a future
 * engine change uses is deliberately absent so the bundle fails loudly and the
 * shim is extended on purpose.
 */

export function existsSync(_path: string): boolean {
  return false;
}

function enoent(op: string, path: string): never {
  const err = new Error(`ENOENT: no such file or directory, ${op} '${String(path)}' (nexpath browser shim)`) as Error & { code: string };
  err.code = 'ENOENT';
  throw err;
}

export function readFileSync(path: string, _options?: unknown): never {
  enoent('open', path);
}

/** Absent-file semantics: stat of a file that does not exist throws ENOENT. */
export function statSync(path: string): never {
  enoent('stat', path);
}

// The WRITE surface below is bundled only because telemetry/param-events.ts
// (whose read-side path builder the engine imports) lives in one module with
// its writers. Nothing in the browser bundle is allowed to write CLI-side
// telemetry files — a call here is a wiring bug that must surface immediately.
function refuseWrite(fn: string): never {
  throw new Error(`nexpath node-fs browser shim: ${fn}() is not available — the extension has no CLI filesystem (its telemetry is the storage.local ring buffer)`);
}

export function appendFileSync(_path: string, _data: unknown, _options?: unknown): never { refuseWrite('appendFileSync'); }
export function mkdirSync(_path: string, _options?: unknown): never { refuseWrite('mkdirSync'); }
export function renameSync(_oldPath: string, _newPath: string): never { refuseWrite('renameSync'); }

/** Bundled via the engine's CLI popup module (its TTY fallback opens /dev/tty);
 * the browser always injects its own interaction, so a call here is a bug. */
export function openSync(path: string, _flags?: unknown, _mode?: unknown): never {
  enoent('open', path);
}
