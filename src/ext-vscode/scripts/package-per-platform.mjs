#!/usr/bin/env node
/**
 * scripts/package-per-platform.mjs — produces one .vsix per VS Code
 * platform target so the marketplace can serve the right prebuilt
 * better-sqlite3 binary to each user.
 *
 * Background:
 *   `better-sqlite3` is a native module (.node binding). VS Code
 *   extensions can't bundle native modules across platforms in a single
 *   .vsix — the marketplace's "platform-specific extensions" feature
 *   solves this. We publish one .vsix per (os, arch) pair, each
 *   tagged via `vsce package --target <id>`, and the marketplace
 *   serves the right one based on the user's OS.
 *
 * Usage:
 *   node scripts/package-per-platform.mjs                       # all 5 targets → ./dist-vsix/
 *   node scripts/package-per-platform.mjs --targets darwin-arm64,linux-x64
 *   node scripts/package-per-platform.mjs --out /tmp/vsix
 *
 * Pre-flight (each platform's .vsix must be built ON that platform OR
 * the better-sqlite3 prebuild must be downloaded for the target):
 *   - For local dev: this script runs `vsce package --target <id>` on
 *     the current machine. The resulting .vsix includes the
 *     better-sqlite3 build that's currently in node_modules — which
 *     matches THIS machine's OS. To produce a .vsix for a different OS,
 *     run this script on that OS (or use the GitHub Actions workflow
 *     at .github/workflows/publish-extension.yml).
 *
 *   - For CI: the matrix runner naturally handles this — each OS job
 *     produces its own platform's .vsix.
 */

import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// The helpers live under src/ (so they're typechecked by the sub-package's
// tsconfig + auto-discovered by vitest). esbuild compiles them into
// out/package-per-platform-helpers.js when `npm run build` runs.
import {
  parsePackagerArgs,
  buildVsixFilename,
} from '../out/package-per-platform-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const subPackageRoot = resolve(__dirname, '..');

function readPackageJson() {
  const raw = readFileSync(join(subPackageRoot, 'package.json'), 'utf8');
  const pkg = JSON.parse(raw);
  if (typeof pkg.name !== 'string' || typeof pkg.version !== 'string') {
    throw new Error('package.json is missing name or version');
  }
  return { name: pkg.name, version: pkg.version };
}

async function main() {
  let args;
  try {
    args = parsePackagerArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error('');
    console.error('Usage:');
    console.error('  node scripts/package-per-platform.mjs [--targets a,b,c] [--out <dir>]');
    process.exit(1);
  }

  const { name, version } = readPackageJson();
  const outDir = resolve(subPackageRoot, args.outDir);
  await mkdir(outDir, { recursive: true });

  console.log(`Building ${args.targets.length} .vsix file(s) for ${name}@${version}`);
  console.log(`Output dir: ${outDir}`);
  console.log('');

  // Each per-platform package call goes through package-with-electron-abi.mjs
  // so better-sqlite3 is rebuilt against the target Electron ABI before vsce
  // package runs, and restored to the system-Node ABI afterwards. Skipping
  // that wrapper would package a Node-ABI binary inside the .vsix and Cursor
  // would fail to activate with NODE_MODULE_VERSION 127 vs 140 (see the
  // wrapper script's JSDoc for the full story).
  const wrapperScript = join(subPackageRoot, 'scripts', 'package-with-electron-abi.mjs');
  const results = [];
  for (const target of args.targets) {
    const filename = buildVsixFilename(name, target, version);
    const outPath  = join(outDir, filename);
    console.log(`▸ ${target} → ${filename}`);
    const r = spawnSync(
      'node',
      [wrapperScript, '--target', target, '--out', outPath],
      { stdio: 'inherit', cwd: subPackageRoot },
    );
    results.push({ target, ok: r.status === 0, exitCode: r.status });
    if (r.status !== 0) {
      console.error(`  ✗ vsce package (with electron rebuild) failed for ${target} (exit ${r.status})`);
    }
  }

  console.log('');
  console.log('Summary:');
  for (const { target, ok } of results) {
    console.log(`  ${ok ? '✓' : '✗'} ${target}`);
  }
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`${failed.length}/${results.length} target(s) failed.`);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
