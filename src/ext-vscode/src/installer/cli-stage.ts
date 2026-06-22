import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Stage the nexpath CLI that ships INSIDE the .vsix into a stable per-user
 * location, and write a stable `nexpath` launcher shim.
 *
 * Why a stable per-user copy (not run it straight from the extension dir):
 *   - `nexpath install` writes agent hooks that embed the CLI's own path
 *     (`process.argv[1]`). The extension's install dir is *versioned* and is
 *     wiped/replaced on every extension update, which would break those hooks.
 *     Copying to `~/.nexpath/cli/<version>/` gives a path that survives updates
 *     and is only replaced when the bundled CLI version actually changes.
 *   - The shim (`~/.nexpath/bin/nexpath[.cmd]`) gives the VS Code extension's
 *     existing IPC layer a `nexpath`-shaped binary to spawn (via `NEXPATH_BIN`),
 *     without changing how IPC resolves the binary.
 *
 * Pure aside from injected fs ops, so it unit-tests without a real filesystem.
 * Layer C is untouched — this only copies files + writes a shim.
 */

export type StageStatus = 'staged' | 'already-current' | 'no-bundle' | 'error';

export interface StageResult {
  status: StageStatus;
  /** ~/.nexpath/cli/<version> once known, else null. */
  stagedDir: string | null;
  /** Absolute path to the staged CLI entry (dist/cli/index.js), else null. */
  cliEntry: string | null;
  /** ~/.nexpath/bin/nexpath[.cmd] launcher shim, else null. */
  shimPath: string | null;
  version: string | null;
  error?: string;
}

export interface StageDeps {
  exists?: (p: string) => boolean;
  mkdirp?: (p: string) => void;
  copyDir?: (src: string, dest: string) => void;
  readFile?: (p: string) => string;
  writeFile?: (p: string, data: string) => void;
  chmod?: (p: string, mode: number) => void;
  platform?: NodeJS.Platform;
}

function readVersion(dir: string, readFile: (p: string) => string): string | null {
  try {
    const pkg = JSON.parse(readFile(join(dir, 'package.json'))) as { version?: unknown };
    return typeof pkg.version === 'string' && pkg.version.length > 0 ? pkg.version : null;
  } catch {
    return null;
  }
}

/** The CLI entry, relative to a staged/bundled CLI root. */
export const CLI_ENTRY_REL = join('dist', 'cli', 'index.js');

/**
 * Build the shim source. POSIX: a tiny `sh` exec wrapper; Windows: a `.cmd`.
 * Both forward all args to `node <stagedCliEntry>`, so the extension's IPC can
 * spawn a stable `nexpath` regardless of where the staged version lives.
 */
export function buildShim(cliEntry: string, platform: NodeJS.Platform): { name: string; body: string; mode: number } {
  if (platform === 'win32') {
    return {
      name: 'nexpath.cmd',
      body: `@echo off\r\nnode "${cliEntry}" %*\r\n`,
      mode: 0o755,
    };
  }
  return {
    name: 'nexpath',
    body: `#!/bin/sh\nexec node "${cliEntry}" "$@"\n`,
    mode: 0o755,
  };
}

/**
 * Stage the bundled CLI + write the launcher shim.
 *
 * @param bundledCliDir absolute path to the CLI bundled in the .vsix
 *   (the `<extension>/nexpath-cli` dir), or null if the build did not bundle it.
 * @param nexpathHome   the user's `~/.nexpath` directory.
 */
export function stageCli(
  bundledCliDir: string | null,
  nexpathHome: string,
  deps: StageDeps = {},
): StageResult {
  const exists = deps.exists ?? existsSync;
  const mkdirp = deps.mkdirp ?? ((p) => void mkdirSync(p, { recursive: true }));
  const copyDir = deps.copyDir ?? ((s, d) => cpSync(s, d, { recursive: true }));
  const readFile = deps.readFile ?? ((p) => readFileSync(p, 'utf8'));
  const writeFile = deps.writeFile ?? ((p, data) => writeFileSync(p, data, 'utf8'));
  const chmod = deps.chmod ?? ((p, mode) => chmodSync(p, mode));
  const platform = deps.platform ?? process.platform;

  const empty: StageResult = { status: 'no-bundle', stagedDir: null, cliEntry: null, shimPath: null, version: null };

  if (!bundledCliDir || !exists(bundledCliDir)) return empty;

  const version = readVersion(bundledCliDir, readFile);
  if (!version) {
    return { ...empty, status: 'error', error: 'bundled CLI package.json has no version' };
  }

  const stagedDir = join(nexpathHome, 'cli', version);
  const cliEntry = join(stagedDir, CLI_ENTRY_REL);
  const binDir = join(nexpathHome, 'bin');
  const shim = buildShim(cliEntry, platform);
  const shimPath = join(binDir, shim.name);

  // Always (re)write the shim so it points at the current staged version even
  // when the copy itself is reused.
  const writeShim = () => {
    try {
      mkdirp(binDir);
      writeFile(shimPath, shim.body);
      chmod(shimPath, shim.mode);
    } catch {
      // Shim is a convenience for IPC binary resolution; hooks embed the real
      // path directly, so a shim write failure is non-fatal.
    }
  };

  // Already staged at this exact version → reuse the copy, refresh the shim.
  if (exists(join(stagedDir, 'package.json'))) {
    writeShim();
    return { status: 'already-current', stagedDir, cliEntry, shimPath, version };
  }

  try {
    mkdirp(join(nexpathHome, 'cli'));
    copyDir(bundledCliDir, stagedDir);
    writeShim();
    return { status: 'staged', stagedDir, cliEntry, shimPath, version };
  } catch (err) {
    return { ...empty, status: 'error', version, error: (err as Error).message };
  }
}
