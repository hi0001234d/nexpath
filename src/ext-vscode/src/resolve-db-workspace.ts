import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
