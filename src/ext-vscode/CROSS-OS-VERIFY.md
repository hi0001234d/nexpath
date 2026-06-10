# Cross-OS Verification — M2 Branch 6

> Per dev plan §3.0 Branch 6 acceptance:
> *"Published `.vsix` installs cleanly on Cursor + Windsurf on macOS and Windows; end-to-end works on both."*
>
> This is a **manual** test the engineer runs on each target OS. Linux is implicitly the primary OS (covered by B5's smoke test on the dev machine). This doc adds macOS + Windows.

---

## Prerequisites

| Item | Where |
|---|---|
| Built `.vsix` for the target OS | Either downloaded from a CI artefact run (`.github/workflows/publish-extension.yml`) or built on the target OS via `npm run package` |
| Cursor installed on the target OS | <https://cursor.com/downloads> |
| Windsurf installed on the target OS | <https://codeium.com/windsurf> |
| `OPENAI_API_KEY` available | Either as env var or in a `.env` in the test workspace |
| `nexpath` CLI installed and on PATH | `npm install -g <repo>/nexpath` from a clone, or whichever distribution channel applies |

---

## The verification matrix

Run the procedure below for **every cell** in this matrix:

| OS | Host |
|---|---|
| macOS (Intel) | Cursor |
| macOS (Intel) | Windsurf |
| macOS (Apple Silicon) | Cursor |
| macOS (Apple Silicon) | Windsurf |
| Windows 11 x64 | Cursor |
| Windows 11 x64 | Windsurf |

(Linux x64 is covered by the primary smoke test in `SMOKE-TEST.md`. Linux arm64 / Windows 11 arm64 are nice-to-haves; flag if either's `.vsix` install or activation fails.)

---

## Per-OS verification procedure

### Step 0 — Capture the environment

Run this first and paste the output into the verification table at the bottom.

```bash
# macOS / Linux
echo "OS:       $(uname -s) $(uname -r) $(uname -m)"
echo "Cursor:   $(cursor --version 2>/dev/null | head -n1)"
echo "Windsurf: $(windsurf --version 2>/dev/null | head -n1)"
echo "Node:     $(node -v)"
```

```powershell
# Windows PowerShell
echo "OS:       $((Get-CimInstance Win32_OperatingSystem).Caption) $((Get-CimInstance Win32_OperatingSystem).Version) $($env:PROCESSOR_ARCHITECTURE)"
echo "Cursor:   $(cursor --version | Select-Object -First 1)"
echo "Windsurf: $(windsurf --version | Select-Object -First 1)"
echo "Node:     $(node -v)"
```

### Step 1 — Install the .vsix

```bash
# Identify the right .vsix for THIS host:
#   macOS Intel       → nexpath-vscode-darwin-x64-<version>.vsix
#   macOS Apple Si    → nexpath-vscode-darwin-arm64-<version>.vsix
#   Windows x64       → nexpath-vscode-win32-x64-<version>.vsix
#   Linux x64         → nexpath-vscode-linux-x64-<version>.vsix
#   Linux ARM         → nexpath-vscode-linux-arm64-<version>.vsix

# Install into Cursor
cursor --install-extension ./nexpath-vscode-<target>-<version>.vsix
# OR via the IDE: Ctrl+Shift+P → "Extensions: Install from VSIX..." → pick the file

# Install into Windsurf (different CLI command on some versions)
windsurf --install-extension ./nexpath-vscode-<target>-<version>.vsix

# Restart both hosts so onStartupFinished fires.
```

### Step 2 — Verify activation

In each host (Cursor + Windsurf), open Developer Tools (`Help → Toggle Developer Tools`) and look for:

```
[nexpath] extension activated
[nexpath] watcher started on N state.vscdb file(s) for host=<cursor|windsurf>
```

If the second line shows `host=vscode-generic`, the host-detector didn't recognise the appName — file an issue with `vscode.env.appName`'s exact value.

### Step 3 — OS-specific gotchas

| OS | Gotcha | What to do |
|---|---|---|
| **macOS** | First-launch Full Disk Access prompt | The onboarding fires a second toast on macOS pointing to System Settings → Privacy & Security → Full Disk Access. Click "Open System Settings" and grant access to Cursor / Windsurf. Until granted, the watcher can't read `~/Library/Application Support/<host>/User/workspaceStorage/*/state.vscdb`. |
| **macOS** | Gatekeeper blocks the .vsix's native binding | If `better-sqlite3.node` was downloaded from npm registry (signed), no issue. If you built locally without signing, run `xattr -d com.apple.quarantine node_modules/better-sqlite3/build/Release/better_sqlite3.node` after install. |
| **Windows** | SmartScreen / antivirus quarantines the .node binding | If the extension activates but the watcher logs "module not found: better-sqlite3", check Defender / your AV's quarantine folder. Allow the .node file. |
| **Windows** | Long path issue under `%APPDATA%\Cursor\User\workspaceStorage\<hash>\state.vscdb` | Windows path length caps at 260 chars by default. Modern Windows 10/11 supports long paths if the registry key is set. If `enumerateStateVscdbPaths` returns `[]` but the paths exist, this is likely the cause. |
| **All** | Workspace not opened | Each host stores chat history per workspace. If the user hasn't opened a folder yet, no state.vscdb exists. The extension logs `no workspace state.vscdb found` — open at least one folder and reload the window. |

### Step 4 — Run the SMOKE-TEST flow

Follow the same procedure documented in `SMOKE-TEST.md` steps 4-6, then paste the verification table from that doc back as evidence.

### Step 5 — Cleanup between matrix cells

To start fresh for the next host on the same OS:

```bash
cursor --uninstall-extension emptyops.nexpath-vscode
windsurf --uninstall-extension emptyops.nexpath-vscode
# Optional: clear globalState so the consent toast re-prompts
rm -rf ~/.config/Cursor/User/globalStorage/emptyops.nexpath-vscode/
# (or the equivalent path on macOS / Windows)
```

---

## Final verification table

After running the procedure on each cell, fill in the table and attach as B6 acceptance evidence in the PR description.

| OS / Arch | Host | Step 1 Install | Step 2 Activate | Step 3 OS gotchas resolved | Step 4 Smoke test passed | Notes |
|---|---|---|---|---|---|---|
| macOS Intel | Cursor | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ (list any) | ✅ / ❌ | |
| macOS Intel | Windsurf | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | |
| macOS Apple Silicon | Cursor | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | |
| macOS Apple Silicon | Windsurf | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | |
| Windows 11 x64 | Cursor | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | |
| Windows 11 x64 | Windsurf | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | |

**M2 Branch 6 is complete when every cell in the matrix shows ✅ for Steps 1, 2, and 4.** Step 3 entries should list any OS-specific gotcha you encountered (even if you resolved it) so future engineers don't have to rediscover.

---

## When something doesn't work

| Symptom | Likely cause | Fix |
|---|---|---|
| `.vsix` install fails immediately with "incompatible with current platform" | Wrong .vsix for the OS — VS Code's marketplace ID-binding rejects platform-mismatched packages | Re-download the right one (see Step 1's target table). |
| `.vsix` installs but activation crashes | better-sqlite3 native binding mismatch (e.g. arm64 binary on x64 host) | Reinstall the right .vsix; check `node_modules/better-sqlite3/build/Release/better_sqlite3.node` inside the unzipped .vsix matches the host arch. |
| Activation log shows `host=vscode-generic` instead of `cursor` / `windsurf` | `vscode.env.appName` returned something the host-detector doesn't recognise (e.g. a new fork) | File an issue with the exact appName value; the host-detector pattern can be extended. |
| Watcher starts but never fires events | Either no state.vscdb under workspaceStorage (open a folder), OR the host writes to a non-VS-Code-style location (file an issue + share a `dump-cursor-state.ts` output) | See `SMOKE-TEST.md` troubleshooting. |
| Webview never reveals after a prompt | `nexpath stop` returned null — Layer C decided no advisory needed for that prompt, OR `OPENAI_API_KEY` not set | Try a prompt known to trigger an advisory (something with `delete`, `force`, etc.). Check the prompt-store DB. |
