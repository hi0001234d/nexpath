import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Canonicalize a workspace path so it matches what `nexpath auto` records as
 * `project_root`. `auto` writes `project_root = process.cwd()` of its spawned
 * process, which the OS canonicalizes — it resolves symlinks (macOS `/tmp` is a
 * symlink to `/private/tmp`) and normalizes Windows drive-letter case. If the
 * extension hands `stop` a NON-canonical path, `stop`'s exact-match
 * `WHERE project_root = ?` misses the row `auto` wrote → `stop_no_pending` → the
 * advisory popup never opens (root cause of "advisory fires but no popup" on
 * macOS, where the throwaway workspace lives under `/tmp`). Canonicalizing the
 * cwd we pass to BOTH `auto` and `stop` guarantees they agree. Falls back to the
 * input string if realpath fails (e.g. the path isn't on disk yet).
 */
export function canonicalizeCwd(p: string): string {
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
 * Resolve the actual workspace folder fsPath for a given `state.vscdb` file
 * by reading the sibling `workspace.json` that VS Code / Cursor / Windsurf
 * writes next to every workspaceStorage db.
 *
 * Layout the hosts use:
 *   <workspaceStorageDir>/<hash>/state.vscdb
 *   <workspaceStorageDir>/<hash>/workspace.json   ← {"folder":"file:///..."}
 *
 * Returns `null` when:
 *   - workspace.json is missing (e.g. the empty-window state.vscdb that
 *     hosts keep for "open without folder" sessions)
 *   - workspace.json contains a `configuration` field instead of `folder`
 *     (multi-root `.code-workspace`) — these are uncommon for Cursor but
 *     legal in VS Code. Callers fall back to instance workspaceCwd in
 *     that case.
 *   - the file is unreadable / malformed / the folder URI is not a
 *     `file://` URI
 *
 * Results are cached by directory so repeated lookups on the watcher hot
 * path don't hammer the disk.
 */

interface FsLike {
  readFileSync: (p: string, enc: 'utf8') => string;
}

const defaultFs: FsLike = {
  readFileSync: (p, enc) => readFileSync(p, enc),
};

const cache = new Map<string, string | null>();

export function resolveWorkspaceFromDbPath(
  dbPath: string,
  inputs: { fs?: FsLike } = {},
): string | null {
  const dir = dirname(dbPath);
  if (cache.has(dir)) return cache.get(dir)!;

  const result = readWorkspaceFolder(dir, inputs.fs ?? defaultFs);
  cache.set(dir, result);
  return result;
}

/** Test hook: clear the in-memory cache. Not exported in production paths. */
export function _resetResolveDbWorkspaceCache(): void {
  cache.clear();
}

function readWorkspaceFolder(dir: string, fs: FsLike): string | null {
  let raw: string;
  try {
    raw = fs.readFileSync(join(dir, 'workspace.json'), 'utf8');
  } catch {
    return null;
  }
  let parsed: { folder?: unknown; configuration?: unknown };
  try {
    parsed = JSON.parse(raw) as { folder?: unknown; configuration?: unknown };
  } catch {
    return null;
  }
  if (typeof parsed.folder !== 'string') return null;
  if (!parsed.folder.startsWith('file://')) return null;
  try {
    return fileURLToPath(parsed.folder);
  } catch {
    return null;
  }
}
