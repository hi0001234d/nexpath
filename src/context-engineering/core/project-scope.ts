/**
 * Feature 1 — Context Engineering: Project Scope & Workspace Canonicalization
 *
 * Implements deterministic workspace canonicalization matching Nexpath's
 * established pattern in `src/ext-vscode/src/resolve-db-workspace.ts`.
 * Resolves symlinks (e.g. macOS `/tmp` -> `/private/tmp`), Windows drive casing,
 * and generates deterministic project identifier hashes.
 */

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Canonicalizes a workspace path using OS-native realpath with fallback.
 * Guarantees that CLI and IDE hooks (Windsurf, Cursor, VS Code) agree on the
 * exact string stored in `project_root`.
 */
export function canonicalizeWorkspacePath(rawPath?: string): string {
  const p = resolve(rawPath || process.cwd());
  try {
    return realpathSync.native(p);
  } catch {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  }
}

/**
 * Normalizes project root directory into a canonical project ID.
 * Alias for canonicalizeWorkspacePath.
 */
export const normalizeProjectId = canonicalizeWorkspacePath;

/**
 * Computes a deterministic 16-character SHA-256 hash of a canonical project path.
 * Used for namespacing on-disk local caches (e.g. `~/.nexpath/memos/<project_hash>/`).
 */
export function hashProjectPath(canonicalPath: string): string {
  return createHash('sha256').update(canonicalPath).digest('hex').slice(0, 16);
}

/**
 * Validates that an active file belongs to the current workspace root.
 * Returns relative path if inside workspace, or undefined if outside.
 */
export function resolveWorkspaceRelativePath(
  canonicalWorkspace: string,
  filePath?: string
): string | undefined {
  if (!filePath) return undefined;
  const canonicalFile = canonicalizeWorkspacePath(filePath);
  if (canonicalFile.startsWith(canonicalWorkspace)) {
    const rel = canonicalFile.slice(canonicalWorkspace.length).replace(/^[/\\]+/, '');
    return rel || undefined;
  }
  return undefined;
}
