import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, symlinkSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveWorkspaceFromDbPath,
  _resetResolveDbWorkspaceCache,
  canonicalizeCwd,
} from './resolve-db-workspace.js';

describe('canonicalizeCwd', () => {
  it('resolves a symlinked path to its real path (the /tmp→/private/tmp class of mac bug)', () => {
    const real = mkdtempSync(join(realpathSync(tmpdir()), 'nexpath-canon-real-'));
    const link = real + '-link';
    try {
      symlinkSync(real, link, 'dir');
      // auto records project_root = realpath(cwd); stop must look up the same.
      expect(canonicalizeCwd(link)).toBe(realpathSync(link));
      expect(canonicalizeCwd(link)).toBe(real);
    } finally {
      try { rmSync(link); } catch { /* ignore */ }
      rmSync(real, { recursive: true, force: true });
    }
  });

  it('is idempotent on an already-canonical path', () => {
    const real = mkdtempSync(join(realpathSync(tmpdir()), 'nexpath-canon-idem-'));
    try {
      expect(canonicalizeCwd(real)).toBe(real);
    } finally {
      rmSync(real, { recursive: true, force: true });
    }
  });

  it('falls back to the input string when the path does not exist', () => {
    const missing = join(tmpdir(), 'nexpath-canon-does-not-exist-zzz');
    expect(canonicalizeCwd(missing)).toBe(missing);
  });
});

/**
 * Unit coverage for the R4.3 multi-workspace defect fix. The watcher pipeline
 * relies on this helper to map a `state.vscdb` path → the actual workspace
 * folder fsPath, so prompts captured cross-workspace land in `prompt-store.db`
 * with the correct `project_root`.
 */

const makeFs = (entries: Record<string, string | Error>) => ({
  readFileSync: (p: string, _enc: 'utf8'): string => {
    const v = entries[p];
    if (v === undefined) {
      const err = new Error('ENOENT') as Error & { code?: string };
      err.code = 'ENOENT';
      throw err;
    }
    if (v instanceof Error) throw v;
    return v;
  },
});

describe('resolveWorkspaceFromDbPath', () => {
  beforeEach(() => {
    _resetResolveDbWorkspaceCache();
  });

  it('returns the fs path for a normal Cursor workspace.json (folder URI)', () => {
    const fs = makeFs({
      '/ws-storage/abc/workspace.json': JSON.stringify({
        folder: 'file:///home/u/repos/myproj',
      }),
    });
    const got = resolveWorkspaceFromDbPath(
      '/ws-storage/abc/state.vscdb',
      { fs },
    );
    expect(got).toBe('/home/u/repos/myproj');
  });

  it('returns null when workspace.json is missing (empty-window storage entry)', () => {
    const fs = makeFs({});
    const got = resolveWorkspaceFromDbPath(
      '/ws-storage/xyz/state.vscdb',
      { fs },
    );
    expect(got).toBeNull();
  });

  it('returns null when workspace.json is unparseable JSON', () => {
    const fs = makeFs({
      '/ws-storage/abc/workspace.json': 'not-json-at-all',
    });
    const got = resolveWorkspaceFromDbPath(
      '/ws-storage/abc/state.vscdb',
      { fs },
    );
    expect(got).toBeNull();
  });

  it('returns null for multi-root .code-workspace entries (configuration, not folder)', () => {
    const fs = makeFs({
      '/ws-storage/abc/workspace.json': JSON.stringify({
        configuration: 'file:///home/u/my.code-workspace',
      }),
    });
    const got = resolveWorkspaceFromDbPath(
      '/ws-storage/abc/state.vscdb',
      { fs },
    );
    expect(got).toBeNull();
  });

  it('returns null when folder is not a file:// URI (defensive)', () => {
    const fs = makeFs({
      '/ws-storage/abc/workspace.json': JSON.stringify({
        folder: 'http://example.com/remote-fs',
      }),
    });
    const got = resolveWorkspaceFromDbPath(
      '/ws-storage/abc/state.vscdb',
      { fs },
    );
    expect(got).toBeNull();
  });

  it('caches results by directory — repeated lookups read fs only once', () => {
    let reads = 0;
    const fs = {
      readFileSync: (p: string, _enc: 'utf8'): string => {
        reads += 1;
        if (p === '/ws-storage/abc/workspace.json') {
          return JSON.stringify({ folder: 'file:///home/u/a' });
        }
        throw new Error('unexpected path: ' + p);
      },
    };
    const a = resolveWorkspaceFromDbPath('/ws-storage/abc/state.vscdb', { fs });
    const b = resolveWorkspaceFromDbPath('/ws-storage/abc/state.vscdb', { fs });
    expect(a).toBe('/home/u/a');
    expect(b).toBe('/home/u/a');
    expect(reads).toBe(1);
  });

  it('caches negative results too — missing workspace.json is not re-probed', () => {
    let reads = 0;
    const fs = {
      readFileSync: (_p: string, _enc: 'utf8'): string => {
        reads += 1;
        throw new Error('ENOENT');
      },
    };
    expect(
      resolveWorkspaceFromDbPath('/ws-storage/empty/state.vscdb', { fs }),
    ).toBeNull();
    expect(
      resolveWorkspaceFromDbPath('/ws-storage/empty/state.vscdb', { fs }),
    ).toBeNull();
    expect(reads).toBe(1);
  });
});
