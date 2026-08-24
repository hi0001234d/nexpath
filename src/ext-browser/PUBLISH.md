# Publishing the Nexpath Browser Extension

> Engineer's step-by-step procedure for publishing the browser extension to the **Chrome Web Store**
> (Chrome / Edge) and **Firefox AMO**. Run this each time you bump the version.
>
> Separate from the VS Code publish (`.github/workflows/publish-extension.yml` + `src/ext-vscode/PUBLISH.md`).

---

## One-time setup (per developer / per machine)

### 1. Store accounts

The extension publishes under the name **Nexpath**; the legal entity for any publisher verification
is **ParseOS**.

| Store | Account | Cost |
|---|---|---|
| **Chrome Web Store** | <https://chrome.google.com/webstore/devconsole> | one-time US$5 |
| **Firefox AMO** | <https://addons.mozilla.org/developers/> | free |
| **(optional) Edge Add-ons** | <https://partner.microsoft.com/dashboard/microsoftedge> — accepts the same Chrome zip | free |

**Privacy policy URL (required by both stores):** host the README's *Privacy* section at a public URL
(e.g. GitHub Pages, or link to `README.md#privacy` on the public repo).

### 2. CI credentials (GitHub → Settings → Secrets and variables → Actions)

Set these repository secrets so the workflow can publish. **Do NOT commit secret values.**

| Store | Secrets |
|---|---|
| Chrome Web Store (OAuth) | `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN` |
| Firefox AMO (API keys → *Manage API Keys*) | `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` |

> The workflow is **loud**: publishing with *no* store configured **fails**; a missing store's
> secrets print a visible `::warning::` and skip only that store — never a silent no-op.

---

## Version-bump checklist

Before each publish:

- [ ] **Bump the version in BOTH manifests to the same value** — `src/ext-browser/manifest.chrome.json`
      and `manifest.firefox.json` (the extension's single source of truth; the root `package.json`
      version is the CLI's and is intentionally independent). `npm run package:ext` **aborts** on drift.
- [ ] **Update `src/ext-browser/CHANGELOG.md`** with the user-facing changes.
- [ ] **Verify `README.md` is current** — it's the source for the store listing.
- [ ] Confirm the **privacy policy URL** is live.
- [ ] **Green local run:**
      ```bash
      npm run typecheck:ext
      npm test
      npm run package:ext   # → dist/store-packages/nexpath-{chrome,firefox}-<version>.zip
      ```

---

## Reproducible build (for AMO source review)

Because the extension is bundled by esbuild, AMO reviewers require the source + build steps.
Provide these at submission:

```
Requirements: Node.js 20       (matches the publish workflow that builds the uploaded package)
Build:        npm ci && npm run build:ext
Output:       dist/ext-firefox   (the uploaded zip's contents)
```

The committed source at the tagged release reproduces the uploaded package exactly. AMO reviewers
rebuild from these steps and byte-diff the result against the upload — use `npm ci` (exact lockfile),
not `npm install`, and match the Node version above.

The Firefox manifest sets `strict_min_version` **112** and declares
`browser_specific_settings.gecko.data_collection_permissions.required = ["authenticationInfo",
"websiteContent"]` (Mozilla's built-in data-consent) — keep these in sync with the store data
disclosures (the API key + prompt text).

---

## Publishing — automated (recommended)

Workflow: `.github/workflows/publish-ext-browser.yml`. It always builds/tests/packages the two zips;
it **publishes** only on a tag `ext-v*` or a manual dispatch with `publish=true`.

```bash
# after the checklist is done and merged:
git tag -a "ext-v<version>" -m "Nexpath browser extension v<version>"
git push --tags
```

Or trigger manually:

```bash
gh workflow run "Publish Nexpath Browser Extension" -f publish=true
gh run watch
```

The preflight step reports exactly which stores are publishing.

---

## Publishing — manual (first time, or a dry run)

1. `npm run package:ext` → the two zips in `dist/store-packages/`.
2. **Chrome Web Store:** Developer Dashboard → *Add new item* (first time) or the existing item →
   upload the chrome zip → fill Store listing + **Privacy practices** (permission justifications, data
   disclosure, privacy-policy URL) → set visibility → **Submit for review**.
3. **Firefox AMO:** *Submit a New Add-on* → **Listed** (public) or **Unlisted** (self-distributed
   signed `.xpi`) → upload the firefox zip → provide the source + build steps above → submit.
4. **(optional) Edge Add-ons:** upload the **chrome** zip to the Edge Partner Center.

**Beta first:** publish **Chrome = Unlisted** and **Firefox = Unlisted (signed `.xpi`)** for the
tester round — gives testers a *signed* Firefox build that survives restarts. Flip to Public/Listed
once testing is done.

---

## Store listing

- **Name:** Nexpath · **Category:** Developer Tools.
- **Summary:** "Behaviour guidance for vibe coders using AI coding agents."
- **Permission justifications** (both stores ask): `storage` (save key/settings), `tabs` (show the
  popup on the right tab), host access limited to
  `*.replit.com`, `bolt.new`, `*.stackblitz.com`, `lovable.dev`. (Injection is declarative —
  `content_scripts` + `web_accessible_resources` — so no `scripting` permission is requested.)
- **Privacy policy URL**, **screenshots** (1280×800), **128×128 icon** (`icons/icon128.png`).

---

## Post-publish verification

1. Listings live — confirm the new version appears (Chrome item URL; AMO addon page or signed `.xpi`).
2. Install from the store into a clean profile; confirm the options page + a popup fire.
3. **Tag the release** if not already: `git tag -a "ext-v<version>" && git push --tags`.

---

## Rollback

If a published version is broken: **bump the patch version and re-publish a fix** (both stores).
Keep both manifest versions always strictly ahead of the latest published version. Chrome unpublish /
AMO disable are last resorts.

---

## Review queues

| Store | Typical SLA |
|---|---|
| Chrome Web Store | minutes → a few days (broad host permissions can add scrutiny) |
| Firefox AMO | minutes → a few days on first submission (source review) |

If you tag before all stores show the new version, that's fine — note in the release that store
ingestion may lag.

---

## Mistakes deliberately avoided (from the VS Code publish)

1. **Silent publish skips** — secrets are at **job level** and a **preflight** step fails on total
   misconfiguration / warns loudly per store (never a silent no-op).
2. **Version drift** — `package:ext` reads the version from the manifest and **aborts** if the two
   manifests disagree.
3. **Stale artefacts** — `package:ext` **wipes `dist/ext-*` before building**, so a leftover from an
   old build (e.g. a removed folder) can never ship.
4. **Missing accompanying files** — README, CHANGELOG, and this PUBLISH.md live in the repo next to
   the extension, not remembered ad-hoc at submit time.
