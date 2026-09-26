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

**Privacy policy URL (required by both stores):** the policy lives at `docs/privacy.html` in this
repo and is served by GitHub Pages — keep that page current with the shipped behaviour (it is part
of every release that changes what data goes where).

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
      Version components compare **numerically** per store: never ship a version below one already
      published (`manifest.test.ts` pins the released list — append each version there once it ships).
- [ ] **Update `src/ext-browser/CHANGELOG.md`** with the user-facing changes — its top heading must
      be the shipping version (test-enforced).
- [ ] **Update `docs/privacy.html`** if the release changes what data goes where.
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
Requirements: Node.js 22       (the toolchain that builds the uploaded package)
Build:        npm ci && npm run build:ext
Output:       dist/ext-firefox   (the uploaded zip's contents)
```

State the **exact** Node version that produced your upload in the reviewer notes — AMO rebuilds
and byte-diffs, so the stated toolchain must be the real one, not the aspirational one.

The committed source at the tagged release reproduces the uploaded package exactly. AMO reviewers
rebuild from these steps and byte-diff the result against the upload — use `npm ci` (exact lockfile),
not `npm install`, and match the Node version above.

⚠️ **One line will differ if the reviewer builds from a source archive rather than a git checkout.**
`build-ext.mjs` stamps the commit and branch it built from into `service-worker.js`
(`var BUILD_ID = "<short-sha>@<branch>:<target>"`), and outside a git checkout that stamp falls back to
`"unknown:<target>"`. Everything else is byte-identical — measured for 0.1.57 by diffing a clone build
against an archive build: `service-worker.js` differed by that single line and no other file differed at
all. Say this in the reviewer notes, or point reviewers at the tagged commit so they build with `.git`
present and the diff is empty.

The Firefox manifest sets `strict_min_version` **112** and declares Mozilla's built-in
data-consent keys as:

```json
"data_collection_permissions": {
  "required": ["websiteContent"],
  "optional": ["technicalAndInteraction"]
}
```

Keep these in sync with the store data disclosures and with `docs/privacy.html` — a store
declaration narrower than what the code does is the class of mistake that gets an extension
removed. Four tests in `manifest.test.ts` pin this shape.

**`websiteContent` is required** because the prompt the user submits is sent to the LLM route to
generate the suggestion. That is the extension's whole purpose, so it is not optional.

**`technicalAndInteraction` is optional, not required** — it covers the rating send (installation
ID, 1–4 rating, timestamps). Mozilla does not permit this key in the `required` list, so declaring
it there is a submission risk rather than a stylistic choice. As an optional data permission
Firefox shows it at install as a checkbox that is **ticked by default**, so the rating feature
keeps working with no code change.

**`authenticationInfo` is deliberately NOT declared.** No credential is collected from the user or
transmitted to a party that did not issue it: a user-supplied OpenAI API key is stored in extension
storage and sent only to `api.openai.com` as that request's own `Authorization` header, and a
Nexpath token is issued by our own service and sent only back to that service to authenticate the
user's own request. Neither is stored or transmitted anywhere else. The same wording goes in the
reviewer-note field on both stores.

> Note on the older `required`-only declaration: earlier releases declared all three keys as
> required, on the reasoning that the extension's own Settings toggle — not a browser-level one —
> governs the rating send, and that `strict_min_version` 112 predates the Firefox versions (140+)
> that implement the `browser.permissions` data-collection API. That reasoning is superseded: the
> key is not permitted in `required` at all, which settles it regardless of the support range.

⚠️ Verify the spelling against AMO at submission — an unrecognised category value is rejected there,
not at build time.

---

## Publishing — automated (currently DEFERRED, do not use)

Workflow: `.github/workflows/publish-ext-browser.yml`. Its build job cannot currently produce a
release (its test step needs content a plain CI checkout does not have), so **publishing is manual**
until the workflow is repaired. Consequences, both deliberate:

- **Do NOT push `ext-v*` tags** — a pushed tag triggers the broken workflow. Create release tags
  locally only (or skip tagging) until the workflow is fixed.
- CI store credentials are unset by design; nothing publishes from CI.

---

## Publishing — manual (the current procedure)

1. `npm run package:ext` → the two zips in `dist/store-packages/`.
2. **Chrome Web Store:** Developer Dashboard → *Add new item* (first time) or the existing item →
   upload the chrome zip → fill Store listing + **Privacy practices** (permission justifications, data
   disclosure, privacy-policy URL) → set visibility → **Submit for review**.
3. **Firefox AMO:** for an add-on that is already listed, open it in *Manage My Submissions* and use
   **Upload New Version** — do **not** use *Submit a New Add-on*, which creates a second, separate
   add-on, and never change `browser_specific_settings.gecko.id` on an existing one (the listing is
   keyed to it). Only a genuinely first submission uses *Submit a New Add-on* → **Listed** (public)
   or **Unlisted** (self-distributed signed `.xpi`). Either way: upload the firefox zip → provide the
   source + build steps above → submit.
4. **(optional) Edge Add-ons:** upload the **chrome** zip to the Edge Partner Center.

**The extension is already live Public/Listed on both stores** — releases are *Upload new package /
Upload New Version* on the existing items, keeping current visibility. (Historical note: the first
release went out Unlisted for the tester round, then flipped Public.)

---

## Store listing

- **Name:** Nexpath · **Category:** Developer Tools.
- **Summary:** derived from the manifest `description` on Chrome (not editable in the dashboard,
  capped at 132 chars, test-enforced); AMO has its own summary field.
- **Permission justifications** (both stores ask): `storage` (save the key or Nexpath token +
  settings locally), `tabs` (show the popup on the right tab), host access limited to the supported
  agent sites — **Replit, Lovable, Bolt.new** (the exact host list lives in the manifests'
  `host_permissions`; user-facing copy names only these three platforms, in this order) — plus the
  Nexpath service origin (`parseos.tech`), contacted **only** in token mode. (Injection is
  declarative — `content_scripts` + `web_accessible_resources` — so no `scripting` permission is
  requested.)
- **The rating POST needs no host permission**, and none is requested. `host_permissions` exists to
  bypass CORS, and `us.i.posthog.com/capture/` sends CORS headers for a `chrome-extension://` origin
  (verified by OPTIONS preflight), so an ordinary request from the worker succeeds. The install
  dialog therefore still reads **4 domains**. If a reviewer asks why an analytics host appears in the
  source but not in the permissions, that is the answer.
- **The complete event list** (reviewers do ask for it by name). Sixteen, and no others. Every one
  carries the same four fields — a random installation ID, `$lib`, `$lib_version`, `surface:"browser"` —
  plus the one timestamp named beside it. **No event has a field that can hold text.**

  | Event | When | Extra field |
  |---|---|---|
  | `nexpath_installed` | once, on the first send after install | `installed_at` |
  | `feedback_submitted` | the user answers the rating prompt | `rating`, `feedback_at` |
  | `feedback_rating_bad` / `_fine` / `_good` / `_excellent` | the same answer under its own name | `rating`, `feedback_at` |
  | `feedback_dismissed` | the prompt was shown and closed unanswered | `dismissed_at` |
  | `pe_use_current`, `pe_use_original`, `pe_apply_details`, `pe_close` | a prompt-enhancement popup button | `action_ts` |
  | `mps_send`, `mps_cancel`, `mps_decline`, `mps_interruption`, `mps_apply_details` | a sequence-offer button | `action_ts` |

  The nine `pe_*` / `mps_*` events are BUFFERED locally as they happen and leave only when the user
  answers a rating; `feedback_dismissed` is the one event that goes out without that answer, and it
  releases nothing that was buffered. Keep this table in step with `adapters/telemetry-send.ts` — a
  test in `options.test.ts` fails if an event name here is not in the code, or the reverse.

- **Data disclosure** — what leaves the machine, and only when the user answers the rating prompt:
  a random installation ID, a 1–4 rating, and content-free action names + timestamps. Dismissing the
  prompt sends ONE line — the installation ID and a timestamp — and releases none of the buffered
  action names. **Never** prompt text, option text, URLs or project paths.
- ⚠️ **There is NO per-user opt-out, and a reviewer may ask.** The rating prompt is shown to every
  installation (owner decision 2026-09-01); the options page carries no toggle for it and the
  extension reads no setting that would disable it. This matches the CLI, whose feedback send is
  deliberately independent of `telemetry.enabled` because the click is the consent. What limits the
  data is its shape, not a switch: nothing is sent unless the user answers or dismisses the prompt,
  and no field in any envelope can hold text. Keep this and the event table identical to the
  *Privacy* section of `src/ext-browser/README.md`, which is what the privacy-policy URL points at.
- **Privacy policy URL** (`docs/privacy.html` via GitHub Pages), **screenshots** (exactly 1280×800),
  **128×128 icon** (`icons/icon128.png`).

---

## Post-publish verification

1. Listings live — confirm the new version appears (Chrome item URL; AMO addon page).
2. Install from the store into a clean profile; confirm the options page + a popup fire.
3. Append the shipped version to the released list in `manifest.test.ts` (next commit).
4. **Tag locally only** (`git tag -a "ext-v<version>"`) — do not push tags while the publish
   workflow is deferred (see above).

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
