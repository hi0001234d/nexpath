import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Cross-file invariant: when `package.json#type === "module"`, Node treats
 * every `.js` file in the package as an ES module. esbuild bundles the
 * extension entry as CommonJS (VS Code's extension host loads it via
 * `require()`), so the output filename MUST be `.cjs` — `.cjs` always
 * triggers Node's CJS loader regardless of the package's type field.
 *
 * If `main` is a `.js` file under `type: module`, activation throws
 * `ERR_REQUIRE_ESM` silently — no toast, no error popup, the user just
 * sees the extension fail to surface (no activity-bar icon, no consent
 * prompt). This is exactly the failure mode the test guards against.
 *
 * This test exists because the invariant spans three files
 * (`package.json#type`, `package.json#main`, `esbuild.config.mjs#outfile`)
 * and silent activation failures are the kind of bug end-users notice
 * before tests do.
 *
 * If you intentionally switch the bundle to ESM (`format: 'esm'` in esbuild
 * + `main: './out/extension.js'`), update this test to match.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const subPkgRoot = resolve(__dirname, '..');

function readPkg(): {
  type?: string;
  main?: string;
} {
  return JSON.parse(readFileSync(resolve(subPkgRoot, 'package.json'), 'utf8'));
}

function readEsbuildOutfile(): string {
  const src = readFileSync(resolve(subPkgRoot, 'esbuild.config.mjs'), 'utf8');
  const match = src.match(/outfile:\s*['"]([^'"]+)['"]/);
  if (!match) {
    throw new Error(
      'esbuild.config.mjs does not declare an `outfile:` string literal',
    );
  }
  return match[1]!;
}

describe('package.json main vs type field (extension-host ESM/CJS safety)', () => {
  it('main file extension is .cjs when type is "module"', () => {
    const pkg = readPkg();
    if (pkg.type === 'module') {
      expect(
        pkg.main,
        `package.json type is "module" but main is "${pkg.main}" — Node will treat it as ESM and Cursor's require() will throw ERR_REQUIRE_ESM. Rename the esbuild outfile to .cjs (or switch the bundle to format: 'esm').`,
      ).toMatch(/\.cjs$/);
    } else {
      // No type field or type:commonjs → .js / .cjs / .mjs all fine.
      expect(pkg.main).toMatch(/\.(c?js|mjs)$/);
    }
  });

  it('package.json main matches the esbuild outfile path', () => {
    const pkg = readPkg();
    const outfile = readEsbuildOutfile();
    expect(
      pkg.main,
      `package.json#main must reference the esbuild-produced bundle — file mismatch will leave the extension dir without a loadable entry point.`,
    ).toBeDefined();
    const mainNormalised = String(pkg.main).replace(/^\.\//, '');
    expect(mainNormalised).toBe(outfile);
  });
});
