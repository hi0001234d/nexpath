// Diagnostic file-write helper for the render pipeline.
//
// Activated by setting NEXPATH_RENDER_DEBUG=1 in the environment. When
// active, every payload passed to writeRenderDebug is appended as a
// single JSON line to a fixed file in the OS temp directory. When
// inactive, the helper is a no-op (fast path — single env-var read +
// early return).
//
// File path matches the existing nexpath debug-log convention in
// TtySelectFn (also writing to a tmpdir() file under a NEXPATH_*_DEBUG
// gate) so the two debug streams sit alongside each other.
//
// Best-effort I/O — filesystem errors (full disk, permission denied)
// are swallowed so a render-debug glitch never breaks the popup.

import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

export const RENDER_DEBUG_ENV  = 'NEXPATH_RENDER_DEBUG';
export const RENDER_DEBUG_FILE = `${tmpdir()}/nexpath-render-debug.txt`;

/** Returns true when the render-debug env-var is currently set to `'1'`. */
export function isRenderDebugActive(): boolean {
  return process.env[RENDER_DEBUG_ENV] === '1';
}

/**
 * Append one JSON-encoded payload line to the render-debug file when
 * NEXPATH_RENDER_DEBUG=1 is set. No-op otherwise. Filesystem errors
 * are silently swallowed.
 */
export function writeRenderDebug(payload: Record<string, unknown>): void {
  if (!isRenderDebugActive()) return;
  try {
    appendFileSync(RENDER_DEBUG_FILE, JSON.stringify(payload) + '\n');
  } catch {
    // Best-effort — never let a render-debug write break the popup.
  }
}
