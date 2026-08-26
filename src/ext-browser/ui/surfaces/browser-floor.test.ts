// @vitest-environment node
//
// D8.3 / D8.4 — the C-3 floor, enforced instead of asserted in prose.
//
// `chrome.ts` has always CLAIMED the floor in a comment ("no :has(), no @layer,
// … the Firefox floor is 112"). A comment cannot fail. This is the same claim as
// a test, over the whole layer rather than one string, because the cost of
// breaking it is invisible locally: every one of these features degrades
// SILENTLY on an older engine — an unsupported selector is skipped, an
// unsupported property is dropped — so the surface renders subtly wrong for a
// user we never hear from.
//
// The floors themselves:
//   Firefox 112.0  `manifest.firefox.json` strict_min_version.
//   Chrome 88      implied by Manifest V3, which is the real gate. Nothing in
//                  this layer needs more than Chrome 86, so no
//                  `minimum_chrome_version` key is warranted — and C-5 forbids
//                  editing the manifest to add one anyway. Recorded, not changed.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const LAYER = resolve(process.cwd(), 'src/ext-browser/ui/surfaces');

/**
 * Comments are stripped before scanning. The layer's prose NAMES these features
 * — chrome.ts's own C-3 note lists `:has()` and `@layer` precisely because they
 * are banned — so scanning raw text would flag the documentation that exists to
 * prevent the bug. (The same false positive the unstyled-class guard hit with
 * `.np-hidden`.)
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

function layerSources(): Array<readonly [string, string]> {
  const out: Array<readonly [string, string]> = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) { walk(path, `${prefix}${entry.name}/`); continue; }
      if (!/\.(ts|html)$/.test(entry.name) || entry.name.endsWith('.test.ts')) continue;
      out.push([`${prefix}${entry.name}`, codeOnly(readFileSync(path, 'utf8'))] as const);
    }
  };
  walk(LAYER, '');
  return out;
}

/** Feature → the Firefox version that shipped it. All are above the 112 floor. */
const ABOVE_FIREFOX_FLOOR: Record<string, number> = {
  ':has(': 121,
  'color-mix(': 113,
  'text-wrap:': 121,
  'field-sizing': 999,       // never shipped in Firefox
  'anchor-name': 999,        // never shipped in Firefox
  '.toSorted(': 115,
  '.toReversed(': 115,
  '.checkVisibility(': 125,
  'popover': 125,
  '@starting-style': 129,
};

describe('C-3 — the Firefox 112 floor, over the whole layer', () => {
  it('scans a layer that actually has files in it', () => {
    // Without this, a broken walk would make every assertion below vacuous.
    const names = layerSources().map(([n]) => n);

    expect(names.length).toBeGreaterThan(8);
    expect(names).toContain('chrome.ts');
    expect(names).toContain('dock.ts');
    expect(names).toContain('surface-controller.ts');
  });

  it.each(Object.entries(ABOVE_FIREFOX_FLOOR))(
    'uses no %s (Firefox %i, above the 112 floor)',
    (feature, version) => {
      const offenders = layerSources()
        .filter(([, code]) => code.includes(feature))
        .map(([name]) => name);

      expect(offenders, `${feature} needs Firefox ${version}; the floor is 112`).toEqual([]);
    },
  );

  it('keeps BOTH scrollbar spellings, so neither engine is left bare', () => {
    // Not redundancy: `scrollbar-width`/`scrollbar-color` is the Firefox
    // spelling (FF 64) and `::-webkit-scrollbar` the Chrome one (Chrome only
    // gained the standard properties in 121, well above our floor). Each engine
    // reads its own and ignores the other, exactly as `panel.js:70-74` does.
    const chrome = readFileSync(resolve(LAYER, 'chrome.ts'), 'utf8');

    expect(chrome).toMatch(/scrollbar-width/);
    expect(chrome).toMatch(/scrollbar-color/);
    expect(chrome).toMatch(/::-webkit-scrollbar/);
  });

  it('the Firefox floor this test enforces is the one the manifest declares', () => {
    // If someone raises strict_min_version, this test's ban list is too strict
    // and should be relaxed deliberately rather than silently drifting.
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src/ext-browser/manifest.firefox.json'), 'utf8'),
    ) as { browser_specific_settings?: { gecko?: { strict_min_version?: string } } };

    expect(manifest.browser_specific_settings?.gecko?.strict_min_version).toBe('112.0');
  });
});

describe('C-5 successor — the layer is wired through exactly ONE seam', () => {
  it('pe-dock-adapter.ts is the only module outside the layer that imports from it', () => {
    // C-5 originally kept the layer OUT of the shipped bundle ("nothing is
    // wired yet"). The integration step (2026-08-25, owner-directed) is what
    // lifted that constraint: the dock now renders the live PE/MPS/PEF flow.
    // The guard's SPIRIT survives as single-seam discipline — every import of
    // the layer goes through the pe-dock-adapter bridge, so the coupling stays
    // auditable in one file and a second entry point still fails this test.
    const offenders: string[] = [];
    const walk = (dir: string, rel: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'surfaces') continue;
        const path = resolve(dir, entry.name);
        if (entry.isDirectory()) { walk(path, `${rel}${entry.name}/`); continue; }
        if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
        const src = readFileSync(path, 'utf8');
        if (/from '[^']*surfaces\/|require\([^)]*surfaces\//.test(src)) offenders.push(rel + entry.name);
      }
    };
    walk(resolve(process.cwd(), 'src/ext-browser'), '');

    expect(offenders).toEqual(['ui/pe-dock-adapter.ts']);
  });
});
