import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Path enumeration for the extension's watcher start-up (M2 Branch 5).
 *
 * Cursor / Windsurf store per-workspace state at:
 *
 *   <host-config-dir>/User/workspaceStorage/<workspace-id>/state.vscdb
 *
 * The workspace-id is a hash derived by the host at workspace-open time.
 * Multiple workspaces produce multiple sibling dirs under
 * `workspaceStorage/`. This module walks that tree and returns the
 * concrete `state.vscdb` paths the watcher should monitor.
 *
 * Additionally, Cursor stores Composer / Agent mode conversations in
 *
 *   <host-config-dir>/User/globalStorage/state.vscdb
 *
 * under the `cursorDiskKV` table with `composerData:<uuid>` +
 * `bubbleId:<composerId>:<bubbleId>` rows. This is a SINGLE shared file
 * across all workspaces — unlike workspaceStorage, there's no
 * per-workspace partition. `globalStorageStateVscdbPath` returns that
 * path (or null if missing). Discovered during M2 closeout — Composer/
 * Agent mode is Cursor's default modern UX and the original v0.1.3
 * enumeration (workspaceStorage only) silently dropped every prompt
 * submitted through it.
 *
 * Enumeration runs at extension activation time (not at install time)
 * — by then any workspaces the user has opened are present on disk.
 * New workspaces opened after activation aren't picked up until the
 * next activation; that's an acceptable limitation for B5 smoke-test
 * scope and is documented in the smoke-test README.
 */

export interface EnumerateInputs {
  /** Injection points for tests. Production uses node:fs defaults. */
  fs?: {
    existsSync: (p: string) => boolean;
    readdirSync: (p: string) => string[];
    statSync: (p: string) => { isDirectory(): boolean };
  };
}

const defaultFs = {
  existsSync,
  readdirSync,
  statSync: (p: string) => statSync(p),
};

/**
 * Walk `<workspaceStorageDir>/<workspace-id>/state.vscdb` and return the
 * `state.vscdb` paths that exist. Returns `[]` when the workspaceStorage
 * directory is missing (host probably isn't installed) or empty (user
 * hasn't opened any workspaces yet).
 */
export function enumerateStateVscdbPaths(
  workspaceStorageDir: string | null,
  inputs: EnumerateInputs = {},
): string[] {
  if (workspaceStorageDir === null) return [];
  const fs = inputs.fs ?? defaultFs;
  if (!fs.existsSync(workspaceStorageDir)) return [];

  const out: string[] = [];
  let entries: string[];
  try {
    entries = fs.readdirSync(workspaceStorageDir);
  } catch {
    return [];
  }

  for (const entry of entries) {
    const subDir = join(workspaceStorageDir, entry);
    try {
      if (!fs.statSync(subDir).isDirectory()) continue;
    } catch {
      continue;
    }
    const dbPath = join(subDir, 'state.vscdb');
    if (fs.existsSync(dbPath)) out.push(dbPath);
  }
  return out;
}

/**
 * Return the host's globalStorage `state.vscdb` path (or null if missing).
 *
 * `workspaceStorageDir` is the sibling tree (`User/workspaceStorage/`); the
 * globalStorage file sits at `User/globalStorage/state.vscdb` — same parent
 * dir, different leaf name. Caller passes the workspaceStorage path so this
 * function works without re-deriving the host-config tree.
 *
 * Returns `null` when the file doesn't exist — host is not installed, or
 * the user has never opened any chat (rare on Cursor; the file is created
 * on first launch).
 */
export function globalStorageStateVscdbPath(
  workspaceStorageDir: string | null,
  inputs: EnumerateInputs = {},
): string | null {
  if (workspaceStorageDir === null) return null;
  const fs = inputs.fs ?? defaultFs;
  // workspaceStorageDir is .../User/workspaceStorage; sibling is .../User/globalStorage
  const userDir = dirname(workspaceStorageDir);
  const globalDbPath = join(userDir, 'globalStorage', 'state.vscdb');
  return fs.existsSync(globalDbPath) ? globalDbPath : null;
}
