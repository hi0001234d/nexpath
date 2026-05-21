import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
