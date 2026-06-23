#!/usr/bin/env node
/**
 * scripts/package-with-electron-abi.mjs
 *
 * Wraps `vsce package` with the Electron-ABI dance for native modules:
 *
 *   1. Rebuild `better-sqlite3` against the target Electron version's
 *      headers — the binary inside the .vsix MUST match the host's
 *      Electron ABI (NODE_MODULE_VERSION 140 for Electron 39 / Cursor 3.4.20)
 *      or activation fails with the ABI-mismatch error users have seen.
 *
 *   2. Run `vsce package` (forwards any extra argv after `--`, e.g.
 *      `--target linux-x64 --out dist-vsix/`).
 *
 *   3. ALWAYS restore the system-Node binary via `npm rebuild better-sqlite3`,
 *      whether step 2 succeeded or failed. Without this, the next
 *      `npm test` / `npm run dump-cursor-state` invocation crashes with
 *      "NODE_MODULE_VERSION 140 requires 127" because tests run under
 *      system Node ABI, not Electron's.
 *
 * Exit code is forwarded from `vsce package` so CI build steps surface
 * packaging failures correctly. Cleanup runs in a finally-style block.
 *
 * Target Electron version is read from `package.json#nexpathTargets.electron`;
 * locked there + cross-checked by `src/native-binding-abi.test.ts`.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const subPkgRoot = resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const nodeAbi = require('node-abi');

function readTargetElectron() {
  const pkg = JSON.parse(
    readFileSync(resolve(subPkgRoot, 'package.json'), 'utf8'),
  );
  const v = pkg?.nexpathTargets?.electron;
  if (typeof v !== 'string' || !/^\d+\.\d+\.\d+/.test(v)) {
    throw new Error(
      `package.json#nexpathTargets.electron must be a semver string (got ${JSON.stringify(v)})`,
    );
  }
  return v;
}

function run(label, cmd, args, opts = {}) {
  console.log(`▸ ${label}`);
  console.log(`  $ ${cmd} ${args.join(' ')}`);
  // On Windows, `npx` / `npm` / `vsce` are `.cmd` shims. Node's spawn (esp. on
  // recent versions, post CVE-2024-27980) refuses to execute `.cmd`/`.bat`
  // without a shell, so `spawnSync('npx', …)` fails with exit 1 BEFORE the tool
  // even runs — which aborted packaging and left no .vsix (then
  // `code --install-extension` failed with ENOENT). Running through the shell
  // lets Windows resolve the `.cmd` shim. POSIX is unaffected (shell stays false).
  const useShell = process.platform === 'win32';
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: subPkgRoot, shell: useShell, ...opts });
  if (r.error) {
    // Surface the underlying spawn error (was swallowed → opaque "exit 1").
    console.error(`  ✗ spawn failed: ${r.error.message}`);
  }
  return r.status ?? 1;
}

// The SCALABLE set of Electron versions to bundle (package.json#nexpathTargets
// .electronVersions). We build better-sqlite3 once per version and stash the
// binary in prebuilds/<NODE_MODULE_VERSION>/ so the runtime can load whichever
// matches the host's process.versions.modules — works on any Cursor/VS Code in
// range, not just one pinned version. The PRIMARY (nexpathTargets.electron) is
// built LAST so node_modules/.../build/Release stays the primary ABI (back-compat).
function readElectronVersions(primary) {
  const pkg = JSON.parse(readFileSync(resolve(subPkgRoot, 'package.json'), 'utf8'));
  const list = pkg?.nexpathTargets?.electronVersions;
  const versions = Array.isArray(list) && list.length ? list.slice() : [primary];
  // de-dupe, ensure the primary is present, and put it LAST.
  const others = [...new Set(versions.filter((v) => v !== primary))];
  return [...others, primary];
}

const electronVersion = readTargetElectron();
const versionsToBuild = readElectronVersions(electronVersion);
const extraArgs = process.argv.slice(2);
const releaseBinary = resolve(subPkgRoot, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
const prebuildsDir = resolve(subPkgRoot, 'prebuilds');

console.log(`Packaging nexpath-vscode with better-sqlite3 prebuilds for Electron ${versionsToBuild.join(', ')}`);
console.log('');

// Fresh prebuilds dir each run.
rmSync(prebuildsDir, { recursive: true, force: true });

// Build one binary per Electron version → prebuilds/<abi>/better_sqlite3.node.
// `--force` is required. Without it, @electron/rebuild detects "already built"
// via a marker and SKIPS the rebuild, leaving the wrong-ABI binary on disk → the
// NODE_MODULE_VERSION mismatch error users have seen.
for (const v of versionsToBuild) {
  const abi = String(nodeAbi.getAbi(v, 'electron'));
  const rebuildCode = run(
    `Rebuild better-sqlite3 → Electron ${v} (ABI ${abi})`,
    'npx',
    ['electron-rebuild', '--version', v, '--force', '--only', 'better-sqlite3', '--module-dir', '.'],
  );
  if (rebuildCode !== 0 || !existsSync(releaseBinary)) {
    console.error(`✗ electron-rebuild failed for Electron ${v} (exit ${rebuildCode}) — aborting before vsce package.`);
    run('Cleanup: restore Node-ABI binary', 'npm', ['rebuild', 'better-sqlite3']);
    process.exit(rebuildCode || 1);
  }
  const dest = join(prebuildsDir, abi);
  mkdirSync(dest, { recursive: true });
  cpSync(releaseBinary, join(dest, 'better_sqlite3.node'));
  console.log(`  ✓ prebuilds/${abi}/better_sqlite3.node`);
}
// build/Release now holds the PRIMARY ABI (last in the loop).

let packageCode = 0;
try {
  packageCode = run(`vsce package ${extraArgs.join(' ')}`.trim(), 'npx', ['vsce', 'package', ...extraArgs]);
} finally {
  const restoreCode = run('Restore Node-ABI binary (so tests + dev work again)', 'npm', ['rebuild', 'better-sqlite3']);
  if (restoreCode !== 0) {
    console.error(
      `✗ npm rebuild better-sqlite3 failed (exit ${restoreCode}) — your local node_modules has the Electron-ABI binary still. Run "npm rebuild better-sqlite3" manually before running tests.`,
    );
  }
}

if (packageCode !== 0) {
  console.error(`✗ vsce package failed with exit ${packageCode}.`);
  process.exit(packageCode);
}

console.log('');
console.log(`✓ Packaged. The .vsix inside contains better-sqlite3 built for Electron ${electronVersion} (ABI for Cursor / Windsurf).`);
console.log('  Local node_modules/better-sqlite3 has been restored to the system-Node ABI so npm test continues to work.');
