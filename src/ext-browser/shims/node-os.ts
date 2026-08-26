/**
 * Browser build shim for `node:os` — only `homedir`, used by first-party path
 * builders (telemetry/paths.ts, store defaults) that the prompt-enhancement
 * engine's import graph reaches. The returned marker path only ever feeds the
 * absent-answer node-fs shim, so every read through it resolves as "file not
 * present" via the engine's own defensive branches.
 *
 * Wired in by the `nexpath-node-shims` esbuild plugin (scripts/build-ext.mjs);
 * never imported directly by application code. Other node:os APIs are
 * deliberately absent so a new dependency fails the build loudly.
 */

export function homedir(): string {
  return '/nexpath-browser-home';
}
