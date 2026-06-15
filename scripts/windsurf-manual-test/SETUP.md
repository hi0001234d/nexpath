# Nexpath — Windsurf Manual Test Bundle (S01 / S07 / S09)

Guided, interactive manual tests for **Nexpath running inside Windsurf — or its
rebrand "Devin" / "Devin Next"** (Cascade). Each script walks you prompt-by-prompt
through a scenario, auto-checks the `~/.nexpath/prompt-store.db` after every prompt,
and tells you whether an advisory fired vs. stayed silent as expected.

> **This bundle now lives IN the repo** at `scripts/windsurf-manual-test/`, so a
> `git clone`/`git pull` of the `v0.1.3/m2/windsurf-cascade-hook` branch carries it to
> every device — no separate copy. The scripts self-locate the repo (walk up the tree),
> auto-detect the **Windsurf OR Devin / Devin Next** launcher + extension dir on every OS
> (macOS/Linux/Windows), and the capture hook is the same `~/.codeium/windsurf/hooks.json`
> on all of them. **After the hook is written you must FULLY quit + relaunch the IDE**
> (all windows + tray) so its language server reloads the hook — a window reload is not
> enough. Run from the repo: `bash scripts/windsurf-manual-test/run-s01-windsurf.sh`.

You run them with **your own OpenAI API key** — the scripts ask for it once and
remember it.

| Script | Scenario | Persona | Coverage |
|--------|----------|---------|----------|
| `run-s01-windsurf.sh` | S01 — ClearBill | Marcus, pure vibe coder | all 35 prompts (~3 fires) |
| `run-s07-windsurf.sh` | S07 — FleetOps | Carlos, senior backend | all 48 prompts (~3 fires) |
| `run-s09-windsurf.sh` | S09 — TrendPulse | Aisha, vibe coder | all 340 prompts (~32 fires) |

Each `-windsurf.sh` walks the **full scenario** prompt sequence (sourced from the
`sim-*.sh` scenario files) — every prompt, in order, with its expected fire/silent
pattern — pasted into Windsurf's **Cascade** chat. **Note:** S09 is 340 prompts in
one sitting; plan for a long session.

Keep `_windsurf-test-lib.sh` in the same folder as the run scripts — they source it.

---

## How Windsurf works (same end result as Cursor / CLI, different wiring)

Windsurf splits capture and delivery across **two** mechanisms — this is the main
difference from the Cursor bundle (where the extension does both):

- **Capture = Cascade hook**, NOT the extension watcher. Windsurf encrypts Cascade
  conversations at rest, so a file-watcher can't read prompts. Instead the script
  writes `~/.codeium/windsurf/hooks.json` with two native Cascade hooks:
  - `pre_user_prompt`  → `nexpath auto`  (captures every prompt)
  - `post_cascade_response` → `nexpath stop` (opens the advisory popup)

  The hook entries embed the **absolute** `node "<repo>/dist/cli/index.js"` command
  (written by the real `writeWindsurfHooks`, identical to `nexpath install`), so the
  built CLI — not a PATH lookup — is what fires.
- **Delivery = terminal popup (PRIMARY), like Cursor / CLI.** On an advisory-firing
  prompt the **"Nexpath — Action Required"** terminal popup opens → pick an option →
  choose **"Send now"** → the **extension** injects it into Cascade's input. The
  read-only hook can't carry the selection back itself, so the extension bridges it
  via the store. (This is why the extension is still needed even though capture is a
  hook.)
- **In-editor surface is the FALLBACK only** — the **"💡 Nexpath advisory"** status
  bar appears *only when the popup failed to open / was dismissed*. While the popup
  works it stays hidden.

---

## Prerequisites

- **Windsurf** installed (the `windsurf` CLI on PATH is ideal; the script also finds
  the app / AppImage / `Windsurf.exe`).
- **Node ≥ 18** and a **C/C++ build toolchain** (`python3` + `make` + a C++ compiler).
  Step 3 below (`npm run package`) rebuilds the **better-sqlite3** native module for
  Windsurf's Electron ABI — the most common bare-machine failure point.
  - Debian/Ubuntu: `sudo apt install build-essential python3`
  - macOS: `xcode-select --install`
- **`node` must also be on PATH inside Windsurf's hook environment** — the Cascade
  hook spawns `node "<cli>"`, so if the language server can't see `node`, capture is
  silently 0. (Usually fine when Windsurf is launched from a normal shell.)
- **Your own `OPENAI_API_KEY`** — get one at https://platform.openai.com/api-keys.
  Layer C needs it to generate advisories; without it, prompts are captured but
  **no advisory fires**. (The scripts prompt you for this automatically.)

---

## Setup (one time)

### 1. Clone the branch — `windsurf-cascade-hook` (NOT the cursor branch)

```bash
git clone -b v0.1.3/m2/windsurf-cascade-hook https://github.com/Vedansi18/nexpath.git
cd nexpath
```

> **Why this branch:** Windsurf needs **both** `src/windsurf-hook/` (the Cascade-hook
> capture) **and** `src/ext-vscode/` (delivery). Only `windsurf-cascade-hook` has
> both. The Cursor branch (`publish-and-cross-os-verify`) is missing `windsurf-hook`,
> so capture won't build there.
>
> The scripts expect this clone at `~/nexpath`. If you put it elsewhere, point the
> scripts at it with `export NEXPATH_REPO=/path/to/your/nexpath` before running.

### 2. Build the nexpath CLI — REQUIRED

The Cascade hook spawns `node "<repo>/dist/cli/index.js"`; without a built CLI,
capture produces nothing.

```bash
npm install
npm run build          # → dist/cli/index.js  (and dist/windsurf-hook/install.js)
```

`npm link` is **optional** for Windsurf (the hook uses the absolute CLI path, not a
PATH lookup), but it's handy for the pre-flight `nexpath --version` check below:

```bash
npm link               # exposes `nexpath` on PATH
which nexpath          # sanity check — should print a path
```

If `npm link` isn't available (no writable global npm prefix):

```bash
export NEXPATH_BIN="$PWD/dist/cli/index.js"
```

### 3. Build + package the extension `.vsix` (delivery surface)

```bash
cd src/ext-vscode
npm install            # deps, including the better-sqlite3 native module
npm run build          # bundle src/extension.ts → out/extension.cjs
npm run package        # ABI-aware package → nexpath-vscode-0.1.3.vsix
```

- Use **`npm run package`**, NOT plain `vsce package`. It rebuilds better-sqlite3
  against Windsurf's Electron ABI (via `@electron/rebuild`). A plain `vsce package`
  ships a Node-ABI binary that won't load in Windsurf's Electron runtime, so the
  extension fails to activate. (`@vscode/vsce` + `@electron/rebuild` are
  devDependencies — no global installs needed.)

### 4. Install that local `.vsix` into Windsurf

Either way works:

- **CLI:** `windsurf --install-extension ./nexpath-vscode-0.1.3.vsix`
  (use the actual emitted filename/path)
- **UI:** Windsurf → `Ctrl+Shift+P` → "Extensions: Install from VSIX…" → pick the `.vsix`

After installing, confirm the extension dir exists, e.g.
`~/.windsurf/extensions/emptyops.nexpath-vscode-0.1.3`. If your version differs, the
script auto-detects it; you don't need to set anything.

### 5. The Cascade hook is written for you by the script

You do **not** hand-write `hooks.json`. Each run script's **Step 2** writes
`~/.codeium/windsurf/hooks.json` automatically (via the real `writeWindsurfHooks`).
**After it's written you must RESTART Windsurf once** so the language server reloads
`hooks.json` — capture won't fire until you do.

---

## Pre-flight — verify these before testing or you will get NO popup

These cover every failure that has actually broken testing so far. Run them
**before** starting a scenario.

**1. `nexpath` (the built CLI) must run:**

```bash
node "$NEXPATH_REPO/dist/cli/index.js" --version    # or: nexpath --version  (if you ran npm link)
```

- Prints a version → good.
- **`Permission denied`** on the `nexpath` PATH shim → the CLI lost its execute bit.
  Fix: `chmod +x "$(readlink -f "$(which nexpath)")"`. (The hook path uses `node <file>`
  so it's immune; this only affects the PATH shim.)

**2. Your OpenAI key must be valid:**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

Must print **`200`**. A `401` → prompts are captured but **no advisory ever fires**.

**3. The Cascade hook must be loaded.** After Step 2 writes it and you restart
Windsurf:

```bash
cat ~/.codeium/windsurf/hooks.json     # must contain a nexpath `pre_user_prompt` entry
```

If prompt #1 captures 0, the language server didn't reload it — restart Windsurf
again, and confirm `node` is on PATH in the environment Windsurf was launched from.

**4. You need a graphical session + a supported terminal (Linux).** The advisory
opens as a **separate gnome-terminal popup window** titled *"Nexpath — Action
Required"* — NOT in Windsurf's sidebar. `echo $DISPLAY` (or `$WAYLAND_DISPLAY`) must
be non-empty, and one of **gnome-terminal / konsole / xfce4-terminal / xterm** must
be installed. (macOS uses Terminal.app via `osascript` — see Cross-OS.)

---

## Running the tests

```bash
cd "Windsurf Manual Shellscripts"
chmod +x *.sh            # first time only

bash run-s01-windsurf.sh   # or run-s07-windsurf.sh / run-s09-windsurf.sh
```

Each script, in order:
1. Makes a throwaway project under `/tmp/nexpath-test-S0*-windsurf-*`.
2. Builds the CLI if needed and **writes the Cascade hook**.
3. Verifies the installed extension matches your local build (md5).
4. Runs `nexpath init` and **asks for your OpenAI API key** (hidden input). It
   validates the `sk-…` format, saves it to `~/.nexpath-tester.key` (readable only by
   you), and reuses it later. If `OPENAI_API_KEY` is already exported, it uses that.
   It also writes the key to the project's `.env` so the hook's `nexpath auto` picks
   it up.
5. **Auto-opens Windsurf** on the project. **Restart Windsurf once** so the hook
   loads, click **Allow** on the Nexpath consent toast, then open the **Cascade**
   panel.
6. Walks you through each prompt: paste into Cascade → Enter → wait for the full
   reply → type `okay` to advance.

- **When an advisory fires** the gnome-terminal popup (*"Nexpath — Action Required"*)
  opens → pick an option → **"Send now"** → the extension injects it into Cascade.
  (If the popup didn't open, the **"💡 Nexpath advisory"** status-bar fallback shows.)
- **Close all other Windsurf windows first** — extra windows can double-count.

To force a new key on the next run: `rm ~/.nexpath-tester.key`.

### Where is the nexpath clone? (`Could not find your local nexpath clone`)

The script auto-detects the clone in this order:

1. `$NEXPATH_REPO` (if you exported it)
2. a `nexpath` folder right next to the script — `<script-dir>/nexpath`
3. `~/nexpath`
4. `./nexpath` (your current directory)
5. `$NEXPATH_BIN`
6. the `nexpath` command (created by `npm link`)

**Easiest fix:** put your clone next to the script, or point at it explicitly:

```bash
export NEXPATH_REPO=/full/path/to/your/nexpath
bash run-s01-windsurf.sh
```

### What "pass" means

- **Capture is deterministic** → captured count should equal the prompt count
  (35 / 48 / 340).
- **Advisory fire count drifts ±1–3** run-to-run (Stage-2 `gpt-4o-mini`
  non-determinism over a byte-identical Layer C) — treat ~3 (S01/S07) / ~32 (S09) as
  expected, **not** an exact gate.
- **Delivery check** (first advisory): the popup opens → "Send now" → the selected
  text reaches Cascade's input (or the status-bar fallback appears).

### Still no popup? Collect these

1. **Windsurf → View → Output → "Nexpath"** panel. It should show *extension
   activated* + *windsurf advisory poller started*. If absent, the extension isn't
   installed/active → delivery can't happen (Setup steps 3–4).
2. `grep -E 'stage2_error|401' ~/.nexpath/nexpath.log` → a `401` means a bad key
   (Pre-flight #2).
3. **`nexpath status`** — the authoritative, cross-OS capture check. It reads the
   real store through nexpath's own engine, so it works the same in Git Bash /
   Terminal / any shell on every OS. Look at **Prompt store → Total prompts** and
   **Hook activity**:
   - prompts > 0 / invocations climbing → capture **works**. If the harness still
     printed `Captured: 0`, that was a *reader* issue, not a capture failure — pull
     the latest bundle (the harness now reads via nexpath's own sql.js engine).
   - 0 after prompt #1 = the **hook** isn't firing (Pre-flight #3: restart the IDE,
     confirm `node` on PATH, confirm `hooks.json`).

   (`sqlite3 ~/.nexpath/prompt-store.db "SELECT prompt_text FROM prompts ORDER BY id DESC LIMIT 5;"`
   also works on macOS/Linux, but `sqlite3` usually isn't on PATH in Git Bash on
   Windows — use `nexpath status` there.)

### Advisory fires but NO popup window (`stop_skipped` / DBus, Linux)

Symptom: `~/.nexpath/nexpath.log` shows the advisory **did** fire
(`pipeline_outcome … "outcome":"pending"`) immediately followed by `[stop]
stop_skipped`, no popup window, and `/tmp/nexpath-render-debug.txt` is missing —
even though gnome-terminal is installed and `$DISPLAY` is set.

Cause: the popup uses **gnome-terminal**, a **DBus** client. When **Windsurf was
launched without `DBUS_SESSION_BUS_ADDRESS`** (a desktop launcher, remote/VNC/`xrdp`
session, `DISPLAY=:1`, or an already-running instance from another session), the
hook-spawned `nexpath stop` has no session bus and gnome-terminal silently fails.

Confirm it:
```bash
tr '\0' '\n' < /proc/$(pgrep -fi windsurf | head -1)/environ | grep DBUS_SESSION \
  || echo "Windsurf has NO DBUS_SESSION_BUS_ADDRESS  ← this is the cause"
echo "shell bus: $DBUS_SESSION_BUS_ADDRESS"   # your shell DOES have it
```

Fix: fully quit Windsurf and **relaunch it from a terminal that has the bus**:
```bash
pkill -fi windsurf ; sleep 2 ; pgrep -fi windsurf    # must print nothing
windsurf /tmp/nexpath-test-S01-windsurf-…            # launch from a shell where $DBUS_SESSION_BUS_ADDRESS is non-empty
```

---

## Known caveat — direct inject vs clipboard (F3)

Windsurf's chat-input command id isn't verified yet, so the selected option currently
falls back to **clipboard** (you paste it) instead of inserting directly. To make it
direct: in Windsurf `Help → Toggle Developer Tools → Console`, run

```js
(await vscode.commands.getCommands(true)).filter(x => /cascade|codeium|chat|aichat/i.test(x))
```

and send the list back — it gets wired so inject lands automatically.

---

## Cross-OS

- **Windows:** run the scripts inside **Git Bash**. `~/.codeium/windsurf/hooks.json`
  and the `node "<cli>"` hook command are the same everywhere.
- **Capture verification is engine-native, not `sqlite3`.** The harness reads the
  prompt store through nexpath's own **sql.js** (pure JS/WASM) with `os.homedir()`,
  so it needs no `sqlite3`/`better-sqlite3` binary and is immune to two things that
  previously made Windows falsely report 0 captures: native-addon ABI mismatches, and
  the Git Bash `/c/...` vs native `C:\...` path difference (Node reads `/c/...` as
  `C:\c\...`). It is also the exact engine `nexpath auto` writes with, so a read can
  never disagree with a write. `nexpath status` is the authoritative manual check on
  every OS.
- **macOS:** the popup is `osascript` → Terminal.app, so the first fire triggers the
  **"Windsurf wants to control Terminal"** Automation prompt — click OK (System
  Settings → Privacy & Security → Automation). If you deny it, the status-bar fallback
  covers you.
- The scripts use `node` for timestamps/hashes, so GNU coreutils isn't required on
  macOS/Windows.

---

## Uninstallation

When you're done testing, remove everything the setup created.

### 1. Remove the Cascade hook

```bash
# preferred — also clears agent registrations + the stored key from the OS keychain:
nexpath uninstall

# or remove the hook entry manually:
rm -f ~/.codeium/windsurf/hooks.json        # only if it contains nothing but nexpath
```

### 2. Remove the Windsurf extension

```bash
# CLI (preferred):
windsurf --uninstall-extension emptyops.nexpath-vscode

# or remove the folder directly:
rm -rf ~/.windsurf/extensions/emptyops.nexpath-vscode-*
```

Reload Windsurf (`Ctrl+Shift+P` → "Developer: Reload Window") afterwards.

### 3. Unlink the nexpath CLI (if you ran `npm link`)

```bash
cd ~/nexpath && npm unlink        # or, from anywhere: npm unlink -g nexpath
which nexpath                      # should now print nothing
unset NEXPATH_BIN                  # if you used the NEXPATH_BIN fallback
```

### 4. Remove Nexpath's local data

```bash
rm -rf ~/.nexpath                  # prompt-store.db, config.json, telemetry, logs
```

### 5. Remove the tester key + throwaway projects

```bash
rm -f  ~/.nexpath-tester.key            # the key this bundle saved
rm -rf /tmp/nexpath-test-S0*-windsurf-* # throwaway test projects
```

### 6. Remove the clone (optional)

```bash
rm -rf ~/nexpath
```

---

## Notes

- The saved key lives at `~/.nexpath-tester.key`, **outside** this folder — so the
  folder is safe to zip and pass on without leaking credentials.
- The key is validated by format only (no test API call), so setup costs nothing.
  Charges occur only while a scenario runs (each fires real Stage-2 LLM calls).
- Capture (the hook) and the popup (`nexpath stop`) are both spawned by the **Cascade
  hook**; the **extension** only injects the chosen option back into Cascade. That
  split is the one thing to remember when something doesn't work: no capture → hook
  problem; capture but no inject → extension problem.
- Each script leaves its project under `/tmp` for inspection; delete with the command
  in Uninstall step 5.
```
