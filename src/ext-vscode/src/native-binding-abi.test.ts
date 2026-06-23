import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Cross-file invariant: the target Electron version + its ABI number
 * (NODE_MODULE_VERSION) declared in `package.json#nexpathTargets` must
 * agree with each other, and the orchestrator script + CI workflow must
 * both reference the package.json value (not hardcode their own version).
 *
 * Why this matters: native modules like `better-sqlite3` ship a `.node`
 * binary that's compiled against a specific Node ABI. Cursor's Extension
 * Host runs inside Electron, which has its OWN ABI number distinct from
 * the underlying Node — Electron 39 reports NODE_MODULE_VERSION 140 even
 * though it's built on Node 22 (ABI 127). If the .vsix ships a binary
 * compiled for the wrong ABI, activation fails with the "compiled against
 * a different Node.js version" error and the watcher crashes silently
 * (no decision-session UI, no chat capture).
 *
 * The orchestrator at scripts/package-with-electron-abi.mjs reads the
 * Electron version from `nexpathTargets.electron` and runs
 * `electron-rebuild --version <that>` before `vsce package`. The CI
 * workflow at .github/workflows/publish-extension.yml uses that same
 * orchestrator. This test ensures all three references stay coherent.
 *
 * If Cursor/VS Code upgrades Electron in the future, bump
 * `nexpathTargets.electron` AND `nexpathTargets.electronAbi` together
 * (per https://github.com/electron/electron/blob/main/docs/tutorial/electron-versioning.md
 * or `node-abi` package's mapping). The CI matrix doesn't need changes.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const subPkgRoot = resolve(__dirname, '..');
const repoRoot = resolve(subPkgRoot, '..', '..');

function readPkg() {
  return JSON.parse(readFileSync(resolve(subPkgRoot, 'package.json'), 'utf8'));
}

describe('native-binding ABI cross-file invariant (Electron version pinning)', () => {
  it('package.json#nexpathTargets declares electron + electronAbi', () => {
    const pkg = readPkg();
    expect(pkg.nexpathTargets, 'package.json must declare nexpathTargets').toBeDefined();
    expect(pkg.nexpathTargets.electron).toMatch(/^\d+\.\d+\.\d+/);
    expect(typeof pkg.nexpathTargets.electronAbi).toBe('number');
    expect(pkg.nexpathTargets.electronAbi).toBeGreaterThan(0);
  });

  it('electronVersions is a non-empty semver list that INCLUDES the primary electron', () => {
    // The packager builds a better-sqlite3 prebuild per electronVersions entry into
    // prebuilds/<ABI>/ and the watcher loads the one matching the host. The primary
    // (nexpathTargets.electron) must be in the set so build/Release stays consistent.
    const pkg = readPkg();
    const list = pkg.nexpathTargets.electronVersions;
    expect(Array.isArray(list), 'nexpathTargets.electronVersions must be an array').toBe(true);
    expect(list.length, 'electronVersions must not be empty').toBeGreaterThan(0);
    for (const v of list) expect(v, `electronVersions entry ${v} must be semver`).toMatch(/^\d+\.\d+\.\d+/);
    expect(list, 'electronVersions must include the primary nexpathTargets.electron').toContain(
      pkg.nexpathTargets.electron,
    );
  });

  it('rebuild:electron script references the package.json electron version', () => {
    const pkg = readPkg();
    const rebuildCmd = pkg.scripts?.['rebuild:electron'];
    expect(
      rebuildCmd,
      'package.json#scripts.rebuild:electron must exist (read by the wrapper script)',
    ).toBeDefined();
    // npm exposes package.json#nexpathTargets.electron as $npm_package_nexpathTargets_electron
    expect(rebuildCmd).toContain('$npm_package_nexpathTargets_electron');
  });

  it('package script delegates to scripts/package-with-electron-abi.mjs (not bare vsce)', () => {
    const pkg = readPkg();
    expect(
      pkg.scripts?.package,
      'package.json#scripts.package must use the electron-abi wrapper, not bare vsce — otherwise the .vsix ships a Node-ABI binding and Cursor fails to activate.',
    ).toMatch(/package-with-electron-abi\.mjs/);
  });

  it('orchestrator script reads nexpathTargets.electron from package.json', () => {
    const orchestratorSrc = readFileSync(
      resolve(subPkgRoot, 'scripts', 'package-with-electron-abi.mjs'),
      'utf8',
    );
    expect(
      orchestratorSrc,
      'orchestrator must read the target Electron from package.json (not hardcode it) so this test locks the single source of truth',
    ).toMatch(/nexpathTargets[^a-z]+electron/);
  });

  it('CI publish workflow uses the electron-abi wrapper (not bare vsce)', () => {
    const workflowPath = resolve(
      repoRoot,
      '.github',
      'workflows',
      'publish-extension.yml',
    );
    const workflowSrc = readFileSync(workflowPath, 'utf8');
    // Every `vsce package` invocation in the workflow must go through the
    // wrapper. We grep for `npx vsce package` directly (which would be the
    // bypass) and assert it's NOT there.
    const bareVscePackage = /npx\s+vsce\s+package/.test(workflowSrc);
    const wrapperInWorkflow = /package-with-electron-abi\.mjs/.test(workflowSrc);
    expect(
      bareVscePackage,
      'CI must not call `npx vsce package` directly — it would ship a Node-ABI binary. Use scripts/package-with-electron-abi.mjs.',
    ).toBe(false);
    expect(wrapperInWorkflow).toBe(true);
  });

  it('electronAbi value matches @electron/rebuild + node-abi conventions', () => {
    const pkg = readPkg();
    const electronMajor = parseInt(pkg.nexpathTargets.electron.split('.')[0]!, 10);
    const abi = pkg.nexpathTargets.electronAbi;
    // Sanity: Electron major X corresponds to ABI roughly X+~100. We don't
    // pin this to a specific formula because Electron's ABI numbering has
    // historical jumps; we just bound it to a plausible range so a typo
    // like `electronAbi: 12` (instead of `120`) is caught.
    expect(
      abi,
      `electronAbi ${abi} looks unrealistic for Electron ${electronMajor}. Cross-check via node-abi.getAbi('${electronMajor}.0.0', 'electron').`,
    ).toBeGreaterThan(electronMajor + 95);
    expect(abi).toBeLessThan(electronMajor + 110);
  });
});
