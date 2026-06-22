#!/usr/bin/env node
/**
 * scripts/bundle-cli.mjs
 *
 * Bundles the nexpath CLI INTO the .vsix so the extension can stage + run it
 * with zero separate install (see src/installer/). `vsce package` only includes
 * files under src/ext-vscode/, so we materialise the built CLI here as
 * `src/ext-vscode/nexpath-cli/`:
 *
 *   1. Ensure the repo-root deps are present (CI installs only the sub-package),
 *      then build the root CLI (`tsc` → dist/). Root tsconfig excludes
 *      src/ext-vscode, so this compiles only Layer C + the CLI.
 *   2. Copy dist/ → nexpath-cli/dist/.
 *   3. Write a RUNTIME package.json (deps + devDeps mirror + bin + engines) AND
 *      copy the repo-root package-lock.json alongside it — the extension runs
 *      `npm ci --omit=dev` against them on the user's machine at setup time,
 *      installing the EXACT tree the dist was built/tested against (reproducible;
 *      no caret-range drift) and fetching the correct native prebuilds. devDeps
 *      are mirrored only so package.json ⇿ package-lock.json stay in sync for
 *      `npm ci`; `--omit=dev` skips installing them.
 *
 * node_modules is intentionally NOT shipped (installed at runtime). Idempotent:
 * the target dir is reset on each run.
 */

import { execSync } from 'node:child_process';
import {
  rmSync,
  mkdirSync,
  cpSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const extDir = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // src/ext-vscode
const repoRoot = resolve(extDir, '..', '..'); // nexpath repo root
const target = join(extDir, 'nexpath-cli');

console.log(`[bundle-cli] repo root: ${repoRoot}`);

// 1. Ensure root deps (CI installs only src/ext-vscode), then build the CLI.
if (!existsSync(join(repoRoot, 'node_modules'))) {
  console.log('[bundle-cli] installing root deps...');
  const installCmd = existsSync(join(repoRoot, 'package-lock.json')) ? 'npm ci' : 'npm install';
  execSync(installCmd, { cwd: repoRoot, stdio: 'inherit' });
}
console.log('[bundle-cli] building root CLI (tsc)...');
execSync('npm run build', { cwd: repoRoot, stdio: 'inherit' });

const distSrc = join(repoRoot, 'dist');
if (!existsSync(join(distSrc, 'cli', 'index.js'))) {
  throw new Error(`[bundle-cli] expected ${join(distSrc, 'cli', 'index.js')} after build`);
}

// 2. Reset target + copy the build output.
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(distSrc, join(target, 'dist'), { recursive: true });

// 3. Runtime package.json (no scripts — only what `npm ci --omit=dev` +
//    `node dist/cli/index.js` need). devDependencies are mirrored verbatim so
//    package.json stays in sync with the bundled package-lock.json (npm ci is
//    strict about that); `--omit=dev` skips installing them at runtime.
const rootPkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const runtimePkg = {
  name: rootPkg.name,
  version: rootPkg.version,
  private: true,
  type: rootPkg.type,
  bin: rootPkg.bin,
  dependencies: rootPkg.dependencies ?? {},
  devDependencies: rootPkg.devDependencies ?? {},
  engines: rootPkg.engines,
};
writeFileSync(
  join(target, 'package.json'),
  JSON.stringify(runtimePkg, null, 2) + '\n',
  'utf8',
);

// 3b. Ship the lockfile so the staged install is `npm ci` (reproducible). Now
//     required — without it the staged install would fall back to a drifting
//     caret-range `npm install`.
const lockSrc = join(repoRoot, 'package-lock.json');
if (!existsSync(lockSrc)) {
  throw new Error(
    '[bundle-cli] package-lock.json missing at repo root — required for a ' +
    'reproducible staged install (npm ci). Run `npm install` at the repo root first.',
  );
}
cpSync(lockSrc, join(target, 'package-lock.json'));

console.log(`[bundle-cli] bundled nexpath CLI v${runtimePkg.version} (+ lockfile) → ${target}`);
