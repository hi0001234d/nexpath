import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Guards the shipped permission surface. The store review (Chrome Web Store + AMO)
// rejects/penalises permissions the extension does not actually use, so the set is
// pinned here: injection is entirely declarative (manifest `content_scripts` +
// `web_accessible_resources`), which needs NO `scripting` permission; messaging and
// the "reload open agent tabs on install" flow use `tabs`; settings/state use
// `storage`. Anything added here must come with a real API use + a reviewer
// justification — this test fails loudly if `scripting` (or any other unused
// permission) is re-introduced.
const load = (target: 'chrome' | 'firefox') =>
  JSON.parse(readFileSync(new URL(`./manifest.${target}.json`, import.meta.url), 'utf8'));

const EXPECTED_PERMISSIONS = ['storage', 'tabs'];
const EXPECTED_HOSTS = [
  'https://*.replit.com/*',
  'https://bolt.new/*',
  'https://*.stackblitz.com/*',
  'https://lovable.dev/*',
];

describe('ext-browser manifests — permission surface', () => {
  for (const target of ['chrome', 'firefox'] as const) {
    describe(`manifest.${target}.json`, () => {
      const manifest = load(target);

      it('requests exactly the permissions it uses (no unused perms)', () => {
        expect(manifest.permissions).toEqual(EXPECTED_PERMISSIONS);
      });

      it('does NOT declare the unused `scripting` permission', () => {
        expect(manifest.permissions).not.toContain('scripting');
      });

      it('scopes host_permissions to the supported agents only', () => {
        expect(manifest.host_permissions).toEqual(EXPECTED_HOSTS);
      });

      it('is MV3 and version-locked', () => {
        expect(manifest.manifest_version).toBe(3);
        expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
      });

      it('has a store-summary description within the Chrome 132-char limit', () => {
        // Chrome derives the store SUMMARY from the manifest `description` (not editable in the
        // dashboard) and caps it at 132 chars — over-length silently truncates on the listing.
        expect(manifest.description.length).toBeGreaterThan(0);
        expect(manifest.description.length).toBeLessThanOrEqual(132);
      });
    });
  }

  it('chrome and firefox agree on permissions, hosts and version', () => {
    const chrome = load('chrome');
    const firefox = load('firefox');
    expect(firefox.permissions).toEqual(chrome.permissions);
    expect(firefox.host_permissions).toEqual(chrome.host_permissions);
    expect(firefox.version).toEqual(chrome.version);
    expect(firefox.description).toEqual(chrome.description);
  });

  // Both stores reject a re-upload of a version they already hold, and reviewers read the
  // changelog against the version they are reviewing. A bumped manifest with a changelog
  // still headed by the previous release is the exact drift that costs a submission round.
  it('the changelog is headed by the version the manifests ship', () => {
    const version = load('chrome').version as string;
    const changelog = readFileSync(new URL('./CHANGELOG.md', import.meta.url), 'utf8');
    const firstHeading = /^## (.+)$/m.exec(changelog);
    expect(firstHeading?.[1]).toBe(version);
  });

  // Store version ordering is per-component NUMERIC, not decimal: 0.1.51 is [0,1,51], which
  // outranks [0,1,6]. Whatever ordering the team picks, a released version can never be
  // re-used or gone backwards from — so the released set is pinned here and a bump must be
  // strictly ahead of every one of them.
  it('ships a version strictly ahead of everything already submitted to a store', () => {
    const RELEASED = ['0.1.5'];
    const parse = (v: string) => v.split('.').map(Number);
    const isAhead = (a: number[], b: number[]) => {
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] ?? 0, y = b[i] ?? 0;
        if (x !== y) return x > y;
      }
      return false;   // equal is NOT ahead — both stores refuse a re-upload
    };
    const current = parse(load('chrome').version as string);
    for (const released of RELEASED) {
      expect(isAhead(current, parse(released)),
        `manifest version must be strictly ahead of the released ${released}`).toBe(true);
    }
  });
});
