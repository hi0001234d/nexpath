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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const subPkgRoot = resolve(__dirname, '..');

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
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: subPkgRoot, ...opts });
  return r.status ?? 1;
}

const electronVersion = readTargetElectron();
const extraArgs = process.argv.slice(2);

console.log(`Packaging nexpath-vscode with better-sqlite3 rebuilt against Electron ${electronVersion}`);
console.log('');

// `--force` is required. Without it, @electron/rebuild detects "already
// built for this Electron version" via a marker it left from a prior run,
// AND skips rebuilding — even when the binary currently on disk is the
// Node-ABI prebuilt restored by the prior orchestrator run's cleanup step.
// Net effect of skipping the rebuild + then npm rebuild restoring Node-ABI:
// the .vsix ships the Node-ABI binary, Cursor fails to activate with the
// NODE_MODULE_VERSION mismatch error. This is exactly the bug that the
// "Round 1 install" surfaced.
const rebuildElectronCode = run(
  `Rebuild better-sqlite3 → Electron ${electronVersion} (ABI for Cursor)`,
  'npx',
  ['electron-rebuild', '--version', electronVersion, '--force', '--only', 'better-sqlite3', '--module-dir', '.'],
);
if (rebuildElectronCode !== 0) {
  console.error(`✗ electron-rebuild failed with exit ${rebuildElectronCode} — aborting before vsce package.`);
  // Best-effort restore so the dev tree isn't left half-built.
  run('Cleanup: restore Node-ABI binary', 'npm', ['rebuild', 'better-sqlite3']);
  process.exit(rebuildElectronCode);
}

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
