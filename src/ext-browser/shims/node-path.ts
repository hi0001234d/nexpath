/**
 * Browser build shim for `node:path` — only `join`, the single function the
 * prompt-enhancement engine's probe path uses (source-reality.ts builds
 * `<projectRoot>/<file>` lookups that the node-fs shim then answers as
 * absent). POSIX-style joining is correct here: browser project roots are
 * URL-derived strings, and the joined paths only ever feed the absent-answer
 * fs shim — they are never handed to a real filesystem.
 *
 * Wired in by the `nexpath-node-shims` esbuild plugin (scripts/build-ext.mjs);
 * never imported directly by application code. Other node:path APIs are
 * deliberately absent so a new engine dependency fails the build loudly.
 */

export function join(...parts: string[]): string {
  const filtered = parts.filter((p) => typeof p === 'string' && p.length > 0);
  if (filtered.length === 0) return '.';
  const joined = filtered.join('/');
  // Collapse duplicate separators without touching a protocol-like '//' prefix
  // (roots here are plain paths or origins; a lone leading '//' never occurs).
  return joined.replace(/\/{2,}/g, '/');
}

/** POSIX dirname for the shim-built paths above (telemetry/param-events uses it
 * on a path that only ever feeds the absent-answer fs shim). */
export function dirname(p: string): string {
  const trimmed = p.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  if (idx < 0) return '.';
  if (idx === 0) return '/';
  return trimmed.slice(0, idx);
}
