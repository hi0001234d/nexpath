# Manual Smoke Test — M2 Branch 5

> **Purpose:** verify the full Branch 1 → 4 wiring works against a real Cursor (or Windsurf) install. This is the acceptance gate for Milestone M2 Branch 5 per dev plan §3.0:
>
> *"End-to-end on dev machine: type real prompt in Cursor → real round-trip → decision UI appears."*

The unit tests verify each component in isolation. This document walks through verifying they work **together** in a live host.

---

## Prerequisites

| Item | Version / state |
|---|---|
| Node.js | ≥ 18 |
| Cursor or Windsurf | Installed and launchable (config dir present under `~/.config/Cursor` on Linux, etc.) |
| `nexpath` repo | Working tree on `v0.1.3/m2/smoke-test` (or any later stacked branch) |
| OpenAI API key | Set in `OPENAI_API_KEY` env var — required by Layer C for advisory generation |
| `vsce` CLI (optional) | For packaging the extension as a `.vsix` (`npm install -g @vscode/vsce`) |

---

## Step 1 — Build the extension bundle + sub-package deps

```bash
cd ~/Documents/Vedanshi/NexPathMain/reviewduel/nexpath/src/ext-vscode
npm install
npm run build
```

**Expected output:**
- `node_modules/` populated (includes `better-sqlite3` with prebuilt platform binary)
- `out/extension.js` produced (~15 KB)
- No tsc errors

---

## Step 2 — Install nexpath CLI hook (Claude Code path, already verified) + register the extension's host

```bash
cd ~/Documents/Vedanshi/NexPathMain/reviewduel/nexpath
npm run build
node dist/cli/index.js install --yes
```

**Expected output includes:**
```
Detected: Claude Code
✓ Claude Code  — advisory hook written to <HOME>/.claude/settings.json
✓ Cursor       — install the Nexpath extension to activate guidance:
    Open VSX:            https://open-vsx.org/extension/nexpath/nexpath-vscode
    VS Code Marketplace: https://marketplace.visualstudio.com/items?itemName=nexpath.nexpath-vscode
    Or via CLI:          cursor --install-extension nexpath.nexpath-vscode
```

(If Windsurf is also installed, a Windsurf block appears too.)

---

## Step 3 — Install the extension into Cursor

Two paths.

### Path A — Extension Development Host (fastest for iteration)

```bash
cd ~/Documents/Vedanshi/NexPathMain/reviewduel/nexpath/src/ext-vscode
code .                        # or `cursor .`
# Then press F5 — opens a new VS Code/Cursor window with the extension loaded.
```

### Path B — Packaged `.vsix` install (closer to real distribution)

```bash
cd ~/Documents/Vedanshi/NexPathMain/reviewduel/nexpath/src/ext-vscode
vsce package
# Produces nexpath-vscode-0.1.3.vsix in this directory.

cursor --install-extension nexpath-vscode-0.1.3.vsix
# Or in Cursor: Ctrl+Shift+P → "Extensions: Install from VSIX..." → pick the .vsix
```

Restart Cursor so the extension's `onStartupFinished` activation event fires.

---

## Step 4 — Verify activation + onboarding

After Cursor restarts:

1. **Open the developer console** (`Help → Toggle Developer Tools`).
2. **Look for the activation log:**
   ```
   [nexpath] extension activated
   ```
3. **First-launch toast** should appear:
   > Allow Nexpath to read your AI chat history for prompt-level guidance? Data stays on your machine.
   > [Allow] [Not now]

   Click **Allow**. (If you click "Not now", the watcher won't start — re-running activation requires clearing `globalState` or reopening with a fresh user profile.)

4. **Activity bar** should show the Nexpath icon (the Y-fork). Click it. The sidebar panel should open with:
   > Nexpath is active and watching for AI chat prompts.

5. **Console should log** (one line — copy it for the verification table at the bottom):
   ```
   [nexpath] watcher started on N state.vscdb file(s) for host=cursor
   ```

   If you see `[nexpath] consent not granted — watcher not started`, repeat step 3 of this document but click **Allow**.

   If you see `[nexpath] no workspace state.vscdb found under …`, open at least one workspace folder in Cursor (e.g., this nexpath repo itself) and reload the extension (`Ctrl+Shift+P` → "Developer: Reload Window").

---

## Step 5 — Trigger the round-trip

> ### ⚠️ Use Ask mode (`Ctrl+L`) ONLY for these tests, NOT Agent/Composer mode
>
> Cursor's Agent / Composer mode can EXECUTE system commands. If you type a destructive prompt in those modes and Nexpath's advisory pipeline isn't fully wired up yet, Cursor's Agent may actually perform the destructive action before you see the warning. **Always test from Ask mode** — it's read-only and answers questions but doesn't execute commands.
>
> Equally important: every "hazard test" prompt below is written as an **information-retrieval question** that contains hazard keywords (so Layer C's classifier flags it) but does NOTHING harmful even if executed.

In the Cursor window with the extension loaded:

1. Open the AI chat: press **`Ctrl+L`** (Ask mode). Verify the chat panel shows the "Ask" label — NOT "Composer" or "Agent".
2. Type one of these safe hazard-trigger prompts:
   > `explain why "rm -rf ~/Downloads/*" is dangerous`
   
   Or:
   > `what are the risks of "git push --force" to main`
   
   Or:
   > `what does "DROP TABLE users" do and how do databases prevent accidents`
3. Press Enter, wait for Cursor's normal response to finish.

**Expected behaviour:**

- Within ~250 ms of Cursor writing your prompt to `state.vscdb`, the watcher fires.
- `nexpath auto` is spawned with the prompt + a session ID like `<workspace-path>|tab:<tab-id>`.
- `nexpath stop` is spawned immediately after; Layer C produces a `DecisionSessionPayload`.
- The Nexpath activity-bar panel **auto-reveals** with:
  - Your advisory text in a styled box.
  - A numbered list of "Suggested alternatives" — click one OR press the matching number key (`1`–`9`).
  - A "Dismiss" link (or press `Esc` / `Ctrl+X`).

**On click:** `handleOptionSelection` runs. Since the candidate Cursor command IDs in `chat-input-injector.ts` are unverified, you should expect the **clipboard fallback** path:

> Nexpath: pasted to clipboard — paste into the chat input to use it.

Paste into Cursor's chat input and re-send — that's the manual workaround until Step 6 verifies the direct-injection IDs.

---

## Step 6 — Verify (or correct) the chat-input command IDs

The `chat-input-injector.ts` file ships with a list of HEURISTIC GUESSES for Cursor / Windsurf chat-input commands. Until B5 verifies them, the injection always falls through to the clipboard. To find the real command IDs:

1. In the running Cursor / Windsurf, open the developer console (`Help → Toggle Developer Tools`).
2. In the console, run:
   ```js
   await vscode.commands.getCommands(true)
   // Filter for chat-related candidates:
   //   .filter(c => /chat|aichat|compose|cursor.*input|prompt/i.test(c))
   ```

   **Note:** the `vscode` global is only available inside extension code, not in the dev tools' window. Use the extension's debug console (`Ctrl+Shift+Y` in the extension-host launch) or add a temporary `console.log` in `extension.ts.activate()`:
   ```ts
   const allCommands = await vscode.commands.getCommands(true);
   console.log(allCommands.filter(c => /chat|compose|aichat/i.test(c)));
   ```
3. Identify the command(s) that write text to the chat input. Common candidates to investigate first:
   - `composer.newChat`
   - `aichat.insertWithSelection`
   - `cursor.composer.focus`
   - `cursor.aichat.insertSelection`
   - Anything matching `*ChatInput*` or `*PromptInput*`
4. Test one in the dev console:
   ```js
   await vscode.commands.executeCommand('<command-id>', 'test text')
   ```
   If the text lands in the chat input → that's the right command.
5. **Update** `src/ext-vscode/src/chat-input-injector.ts`'s `CURSOR_CANDIDATE_COMMANDS` / `WINDSURF_CANDIDATE_COMMANDS` list — put the verified IDs at the top of the array.
6. Re-build the extension (`npm run build`), reload Cursor, re-test step 5.

When this works, clicking an option in the webview should write the option text **directly into Cursor's chat input** instead of just the clipboard. That's the final acceptance gate for B5.

---

## Step 7 — Verification table (fill in + share)

After completing steps 1-5, paste the following table back with your observed values. This is the B5 acceptance evidence.

| Step | Observation |
|---|---|
| 4.2 | `[nexpath] extension activated` log line: <kbd>YES / NO</kbd> |
| 4.3 | Consent toast appeared and Allow was clicked: <kbd>YES / NO</kbd> |
| 4.4 | Nexpath icon visible in activity bar: <kbd>YES / NO</kbd> |
| 4.5 | Watcher start log line + which host: <kbd>paste here</kbd> |
| 5 (auto fired) | `nexpath auto` invoked (check Cursor's process tree or strace `node`): <kbd>YES / NO</kbd> |
| 5 (stop fired) | `nexpath stop` invoked: <kbd>YES / NO</kbd> |
| 5 (panel revealed) | Decision-session UI auto-revealed in activity bar panel: <kbd>YES / NO</kbd> |
| 5 (advisory rendered) | Advisory text + numbered options visible: <kbd>YES / NO</kbd> |
| 5 (click option) | Click on an option triggers the clipboard fallback toast: <kbd>YES / NO</kbd> |
| 6 (command IDs) | Discovered command IDs for direct chat-input injection: <kbd>list here</kbd> |
| 6 (direct inject works) | After updating the candidate list, click writes directly to chat input: <kbd>YES / NO</kbd> |

If any **NO** appears, log it as an issue with reproduction steps. **Step 6's direct-inject result is the final B5 gate** — when it's YES, M2 Branch 5 is done.

---

## Troubleshooting

| Symptom | Likely cause + fix |
|---|---|
| `[nexpath] consent not granted` | Click "Allow" on the first-launch toast. If the toast doesn't reappear, the user explicitly denied — clear globalState via `Ctrl+Shift+P` → `Developer: Reload Window With Extensions Disabled`, then re-open. |
| `[nexpath] no workspace state.vscdb found` | Open at least one folder in Cursor (`File → Open Folder`) and reload the window. |
| Watcher fires but nothing is rendered | `nexpath stop` returned `null` — Layer C decided no advisory is needed for this prompt. Try a prompt that's known to trigger an advisory (something with `delete`, `force`, etc.). Or, if there's no `.env` with `OPENAI_API_KEY` in the workspace, Stage 2 may silently no-op. |
| `Error: Cannot find module 'better-sqlite3'` | Run `npm install` inside `src/ext-vscode/`. If the prebuilt binary fails on your platform, `npm install --build-from-source` (needs `node-gyp`). |
| Schema-unknown toast appears | Cursor schema isn't recognised by any of the extractors. Capture a dump via `npx tsx scripts/dump-cursor-state.ts --name cursor-debug --redact` and share — see dev plan §2.5. |
| Extension activates but webview never reveals | Check the developer console for errors. Specifically: spawn-failures (nexpath CLI not on PATH), or `viewProvider undefined`. |
| `nexpath auto` runs but no advisory appears later | `OPENAI_API_KEY` not set in the workspace `.env`, or the prompt didn't trigger Stage 2. Check `~/.nexpath/prompt-store.db` for the captured prompt: `sqlite3 ~/.nexpath/prompt-store.db "SELECT prompt_text FROM prompts ORDER BY id DESC LIMIT 3;"` |

---

## What this test does NOT cover

- **Cross-OS behaviour:** macOS + Windows verification is **Branch 6** scope. B5 is "primary OS only" per the dev plan.
- **Multi-workspace concurrency:** opening two Cursor windows on different workspaces simultaneously. The session-id composer prefixes with workspace path, so they should be independent, but B5 doesn't formally test this.
- **Pre-prompt blocking:** the current capture is post-send (Cursor has already submitted the prompt by the time the watcher sees it). Pre-send blocking is a deferred open question in architecture doc §11 / dev plan §7.
