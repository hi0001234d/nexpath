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
  // Nexpath-token mode (llm-credentials.ts): the service worker fetches the
  // configured Nexpath service directly, and unlike api.openai.com the service
  // sends no CORS headers — host permission is what authorises the call.
  // ONLY the production origin ships. localhost was dropped for 0.1.53: the
  // Advanced service-URL field it existed for no longer exists, and a shipped
  // localhost permission is reviewer bait; developers add it to their own
  // unpacked build when they need a local instance.
  'https://parseos.tech/*',
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

  // A version number written into shipped markup goes stale the moment the manifest
  // moves on. It did: the options footer read "nexpath v0.1.5" while the manifests had
  // already advanced, so the settings page told users the wrong version and the store
  // screenshot of that page showed it. Since 2026-09-01 the page shows no version at
  // all (product decision): the footer is only the "Nexpath web" link, so a stale
  // hard-coded version can never reappear by construction.
  it('no shipped page hard-codes or displays a version number', () => {
    const html = readFileSync(new URL('./options/options.html', import.meta.url), 'utf8');
    expect(html).not.toMatch(/v\d+\.\d+\.\d+/);
    expect(html).not.toContain('ext-version');
  });

  // User-facing platform copy rules (product decision, re-affirmed 2026-09-01):
  // only the three supported platforms are ever named where a user reads, in the
  // canonical order Replit → Lovable → Bolt. "StackBlitz" stays a functional host
  // in the manifests' technical arrays but must never surface in user-facing text.
  // Both rules were previously enforced only by review and each regressed once.
  const USER_FACING_DOCS = [
    './options/options.html',
    './README.md',
    './PUBLISH.md',
    './CHANGELOG.md',
    '../../docs/privacy.html',
  ];

  it('user-facing text never names StackBlitz', () => {
    for (const doc of USER_FACING_DOCS) {
      const text = readFileSync(new URL(doc, import.meta.url), 'utf8');
      expect(text.toLowerCase(), `${doc} names StackBlitz`).not.toContain('stackblitz');
    }
  });

  it('platforms appear in the canonical order Replit, Lovable, Bolt', () => {
    // CHANGELOG is excluded: its entries are shipped prose, mentioning platforms
    // per-fix, not as a lineup — retro-editing history would be worse.
    const lineupDocs = ['./options/options.html', './README.md', './PUBLISH.md', '../../docs/privacy.html'];
    const sources = lineupDocs.map((doc) => [doc, readFileSync(new URL(doc, import.meta.url), 'utf8')] as const);
    sources.push(['manifest description', load('chrome').description as string]);
    for (const [label, text] of sources) {
      const lower = text.toLowerCase();
      const at = (name: string) => lower.indexOf(name);
      expect(at('replit'), `${label} lacks Replit`).toBeGreaterThan(-1);
      expect(at('lovable'), `${label}: Lovable must follow Replit`).toBeGreaterThan(at('replit'));
      expect(at('bolt'), `${label}: Bolt must follow Lovable`).toBeGreaterThan(at('lovable'));
    }
  });

  // Store version ordering is per-component NUMERIC, not decimal: 0.1.51 is [0,1,51], which
  // outranks [0,1,6]. Shipping 0.1.51 therefore made 0.1.6 through 0.1.50 permanently
  // unreleasable — they would be downgrades, which both stores reject forever.
  //
  // What this guards is going BACKWARDS, which is irreversible. It deliberately allows the
  // manifest to EQUAL the latest released version: that is the resting state between releases,
  // and a test that runs continuously cannot tell "resting" from "about to re-upload". A genuine
  // same-version re-upload is caught by the store at submit time, immediately and harmlessly.
  it('never ships a version below one already submitted to a store', () => {
    // Append at release time. A version that shipped can never be re-used or gone below,
    // so this list only grows.
    const RELEASED = ['0.1.5', '0.1.51', '0.1.52'];
    const parse = (v: string) => v.split('.').map(Number);
    const isBelow = (a: number[], b: number[]) => {
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] ?? 0, y = b[i] ?? 0;
        if (x !== y) return x < y;
      }
      return false;   // equal is not below
    };
    const current = parse(load('chrome').version as string);
    for (const released of RELEASED) {
      expect(isBelow(current, parse(released)),
        `manifest version is BELOW the released ${released} — both stores reject downgrades permanently`,
      ).toBe(false);
    }
  });
});
