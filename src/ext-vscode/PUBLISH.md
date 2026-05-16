# Publishing the Nexpath VS Code Extension

> Engineer's step-by-step procedure for publishing the extension to **Open VSX** (Cursor / Windsurf default registry) and **VS Code Marketplace**. Run this each time you bump the version.

---

## One-time setup (per developer / per machine)

### 1. Marketplace publisher accounts

The extension publishes under the publisher id `nexpath` (matches `package.json#publisher`). You need credentials for both registries:

| Registry | Account | Token |
|---|---|---|
| **VS Code Marketplace** | Azure DevOps org with the `nexpath` publisher | Personal Access Token (PAT) with `Marketplace: Manage` scope. [Docs](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token). |
| **Open VSX** | <https://open-vsx.org> account in the `nexpath` namespace | Access token from the user's profile page. [Docs](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions). |

### 2. Export the tokens

```bash
export VSCE_PAT="<your-vsce-pat>"
export OVSX_PAT="<your-ovsx-pat>"
```

**Do NOT commit these.** For CI publishing, set them as GitHub Actions repository secrets (see `.github/workflows/publish-extension.yml`).

### 3. Install the publishing tools

`@vscode/vsce` and `ovsx` are already devDependencies. Run `npm install` in `src/ext-vscode/` to get them.

---

## Version-bump checklist

Before each publish:

- [ ] **Bump the version** in `src/ext-vscode/package.json` following semver.
- [ ] **Update the `nexpath` repo's CHANGELOG** (in `src/ext-vscode/CHANGELOG.md` — create if missing) with the user-facing changes since the last release.
- [ ] **Tag the matching `nexpath` repo commit** with `vsix-v<version>` after the publish succeeds.
- [ ] **Verify the README.md is up-to-date** — it's shown verbatim on both marketplaces.
- [ ] **Run the full local suite** to make sure tests pass:
  ```bash
  cd src/ext-vscode/
  npm test
  npm run typecheck
  ```

---

## Publishing — local path (single platform)

Useful for quick iteration, hot-fix releases, or testing the package locally before committing to a full multi-platform publish.

```bash
cd src/ext-vscode/
npm install

# 1. Build the extension bundle
npm run build

# 2. Package for the CURRENT host's platform.
#    Produces ./nexpath-vscode-<target>-<version>.vsix where <target> is
#    auto-detected from process.platform + process.arch.
npm run package

# 3. Install locally to verify
cursor --install-extension nexpath-vscode-<target>-<version>.vsix
# Restart Cursor. Run the SMOKE-TEST.md procedure to confirm it works.

# 4. Publish (only when local install + smoke test pass)
npm run publish:vsce      # → VS Code Marketplace
npm run publish:ovsx      # → Open VSX
```

Each `publish:*` reads its respective `*_PAT` env var.

---

## Publishing — multi-platform path (CI-equivalent)

For an actual release, every supported platform needs its own `.vsix` because `better-sqlite3` is a native module. Five targets:

| Target | OS / arch |
|---|---|
| `linux-x64` | Linux x86_64 (most servers + dev boxes) |
| `linux-arm64` | Linux aarch64 (ARM servers, M1 Linux VMs) |
| `darwin-x64` | macOS Intel |
| `darwin-arm64` | macOS Apple Silicon |
| `win32-x64` | Windows x86_64 |

### The packaging step has to run on the matching OS

`better-sqlite3` ships per-platform prebuilds. When you run `npm install` on a macOS-arm64 box, only the `darwin-arm64` binary lands in `node_modules/`. To produce a `.vsix` for Windows, you need to install + package on a Windows machine (or set up cross-compilation, which is fiddly).

**Recommended path:** use the CI workflow at [.github/workflows/publish-extension.yml](../../.github/workflows/publish-extension.yml). It runs a matrix on `macos-latest` / `ubuntu-latest` / `windows-latest` runners — each produces the right `.vsix` automatically.

**Manual path (if you have access to each OS):**

```bash
cd src/ext-vscode/

# On each target OS:
rm -rf node_modules dist-vsix
npm install                                      # pulls the right better-sqlite3 prebuild
npm run package:all-platforms -- --targets <id>  # packages just one target
# → dist-vsix/nexpath-vscode-<id>-<version>.vsix

# Move the resulting .vsix off the machine to a single publishing host.

# Then on the publishing host, with all platform .vsix files in ./dist-vsix/:
for f in dist-vsix/nexpath-vscode-*-${VERSION}.vsix ; do
  npx vsce publish --packagePath "$f"
  npx ovsx publish "$f"
done
```

---

## Post-publish verification

After publish succeeds:

1. **Marketplace listings live** — visit the URLs and confirm the version appears:
   - <https://marketplace.visualstudio.com/items?itemName=nexpath.nexpath-vscode>
   - <https://open-vsx.org/extension/nexpath/nexpath-vscode>
2. **Install from each marketplace** (using a fresh Cursor profile, e.g. `cursor --user-data-dir /tmp/fresh-profile`) and confirm:
   - Extension shows up in the Extensions panel.
   - Activity bar icon appears after activation.
   - First-launch consent toast fires.
3. **Run the full smoke test** per `SMOKE-TEST.md` against the marketplace-installed version (not the local `.vsix`).
4. **Tag the release** in the `nexpath` repo:
   ```bash
   git tag -a "vsix-v$VERSION" -m "Nexpath VS Code extension v$VERSION"
   git push --tags
   ```

---

## Rollback

If a published version turns out to be broken:

1. **Open VSX:** there's no "unpublish" endpoint — bump the patch version and publish a fix. The previous version stays listed but new installs get the fix.
2. **VS Code Marketplace:** same — bump + republish. Use `vsce unpublish nexpath.nexpath-vscode@<version>` only as a last resort (causes marketplace to flag the publisher).

For both: keep `package.json#version` always strictly ahead of the latest published version.

---

## Marketplace review queues

| Registry | Typical SLA |
|---|---|
| Open VSX | Minutes (no human review) |
| VS Code Marketplace | Usually minutes; can spike to hours on first-publish or after extension flag |

If you tag a release before all marketplaces show the new version, the tag is fine — just note in the release notes that "marketplace ingestion may lag by N hours."
