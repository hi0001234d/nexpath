import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { cursorAdapter } from './cursor.js';
import { windsurfAdapter } from './windsurf.js';

/**
 * Cross-file invariant: the marketplace ID printed by cursor + windsurf
 * adapters during install() must match `<publisher>.<name>` from the
 * VS Code sub-package's `package.json`. If they drift (because one file
 * is updated without the other), vsce/ovsx still publishes under the
 * package.json values, but our installer prints the wrong install URL —
 * so users land on a 404 page instead of the real extension.
 *
 * This file exists separately from cursor.test.ts / windsurf.test.ts
 * because the invariant is about the boundary between three files, not
 * about either adapter's behaviour in isolation.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const subPackageManifestPath = resolve(
  __dirname,
  '..',
  '..',
  'ext-vscode',
  'package.json',
);

function readSubPackageManifestId(): string {
  const raw = readFileSync(subPackageManifestPath, 'utf8');
  const pkg = JSON.parse(raw) as { publisher?: unknown; name?: unknown };
  if (typeof pkg.publisher !== 'string' || typeof pkg.name !== 'string') {
    throw new Error(
      `src/ext-vscode/package.json is missing publisher or name (got publisher=${String(
        pkg.publisher,
      )}, name=${String(pkg.name)})`,
    );
  }
  return `${pkg.publisher}.${pkg.name}`;
}

describe('marketplace-id cross-file invariant', () => {
  it('cursorAdapter.marketplace agrees with src/ext-vscode/package.json', () => {
    const expected = readSubPackageManifestId();
    expect(cursorAdapter.marketplace.openVsx).toBe(expected);
    expect(cursorAdapter.marketplace.vsCode).toBe(expected);
  });

  it('windsurfAdapter.marketplace agrees with src/ext-vscode/package.json', () => {
    const expected = readSubPackageManifestId();
    expect(windsurfAdapter.marketplace.openVsx).toBe(expected);
    expect(windsurfAdapter.marketplace.vsCode).toBe(expected);
  });

  it('cursor + windsurf both reference the same marketplace ID', () => {
    expect(cursorAdapter.marketplace.openVsx).toBe(
      windsurfAdapter.marketplace.openVsx,
    );
    expect(cursorAdapter.marketplace.vsCode).toBe(
      windsurfAdapter.marketplace.vsCode,
    );
  });
});
