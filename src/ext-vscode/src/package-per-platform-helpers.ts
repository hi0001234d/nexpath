/**
 * Pure helpers for the per-platform packager script (M14 of M2 Branch 6).
 *
 * Lives in `src/` (not `scripts/`) so the sub-package's main `tsconfig.json`
 * typechecks them and so vitest's auto-discovery picks up the co-located
 * test file. The runnable script at `scripts/package-per-platform.mjs`
 * imports these via the compiled `out/` path or directly via tsx at dev
 * time.
 *
 * Nothing in this file is referenced by `src/extension.ts`, so esbuild
 * does not pull it into the production extension bundle.
 */

/**
 * VS Code's platform-specific extension targets that `vsce package
 * --target <id>` accepts. These match the platforms `better-sqlite3`
 * ships prebuilds for — anything outside this list would mean the
 * extension activates but the watcher's first read crashes when
 * `better-sqlite3` can't load its native binding.
 *
 * Source for the target IDs: VS Code Extension API "Platform-specific
 * Extensions" reference. Source for the better-sqlite3 prebuild list:
 * its npm package's prebuilds directory at install time.
 */
export const SUPPORTED_TARGETS = [
  'linux-x64',
  'linux-arm64',
  'darwin-x64',
  'darwin-arm64',
  'win32-x64',
] as const;

export type SupportedTarget = (typeof SUPPORTED_TARGETS)[number];

/**
 * Given a manifest name (e.g. `"nexpath-vscode"`), target id (e.g.
 * `"darwin-arm64"`), and version (e.g. `"0.1.3"`), produce the .vsix
 * file name that VS Code's marketplace and Open VSX expect for
 * platform-specific extensions:
 *
 *   `<name>-<target>-<version>.vsix`
 *
 * vsce uses this naming convention by default — replicating it here so
 * the CI artefact paths are predictable from outside the build script.
 */
export function buildVsixFilename(
  pkgName: string,
  target: SupportedTarget,
  version: string,
): string {
  return `${pkgName}-${target}-${version}.vsix`;
}

export interface PackagerArgs {
  targets: readonly SupportedTarget[];
  outDir: string;
}

/**
 * Parse the packager script's CLI arguments. Pure function — exposed
 * separately from the runnable script so the test suite can verify the
 * parser without executing `vsce package`.
 *
 * Recognised flags:
 *   --targets a,b,c     One or more target IDs (defaults to all 5)
 *   --out <dir>         Output directory (defaults to './dist-vsix')
 *
 * Throws on unknown flag, missing value, or unknown target.
 */
export function parsePackagerArgs(argv: readonly string[]): PackagerArgs {
  const args: { targets?: readonly SupportedTarget[]; outDir?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--targets') {
      const v = argv[++i];
      if (v === undefined) throw new Error('--targets requires a value');
      const list = v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const t of list) {
        if (!(SUPPORTED_TARGETS as readonly string[]).includes(t)) {
          throw new Error(
            `Unknown target: ${t}. Supported: ${SUPPORTED_TARGETS.join(', ')}`,
          );
        }
      }
      args.targets = list as readonly SupportedTarget[];
    } else if (a === '--out') {
      const v = argv[++i];
      if (v === undefined) throw new Error('--out requires a value');
      args.outDir = v;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return {
    targets: args.targets ?? SUPPORTED_TARGETS,
    outDir: args.outDir ?? './dist-vsix',
  };
}
