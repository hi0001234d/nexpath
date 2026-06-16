# _windsurf-test-lib.sh — shared cross-OS machinery for the Windsurf manual tests.
#
# Sourced by run-s01-windsurf.sh / run-s07-windsurf.sh / run-s09-windsurf.sh.
# Mirrors _cursor-test-lib.sh, but for the Windsurf path, where two things differ:
#
#   CAPTURE  — Windsurf encrypts Cascade at rest, so prompts are captured by the
#              native Cascade HOOK (~/.codeium/windsurf/hooks.json → `nexpath auto`),
#              NOT by the extension watcher. This script writes that hook.
#   DELIVERY — terminal popup is PRIMARY (like Cursor/CLI): post_cascade_response
#              → `nexpath stop` opens the "Nexpath — Action Required" popup; pick →
#              "Send now" → the extension injects it into Cascade (the read-only
#              hook can't carry the selection back, so the extension bridges it via
#              the store). The "💡 Nexpath advisory" status-bar surface is the
#              FALLBACK only — it appears when the popup failed/was dismissed.
#
# Fire counting uses the append-only telemetry log (pipeline_advisory_pending) so
# multi-fire scenarios count correctly (the pending_advisories table keeps only the
# latest row per project and would undercount).
#
# Works on Linux, macOS, Windows (Git Bash / MSYS2). GNU-isms are replaced with
# `node` one-liners so coreutils isn't required on macOS/Windows.
#
# A scenario file sets these BEFORE calling windsurf_test_setup:
#   SCENARIO_ID / SCENARIO_TITLE / SCENARIO_PERSONA
#   INIT_NAME / INIT_TYPE / INIT_LANG / INIT_DESC   (nexpath init suggestions)
#   TOTAL_PROMPTS / EXPECTED_ADVISORIES
# Then: windsurf_test_setup; run_prompt ... (×N); windsurf_test_finish

# ─── OS detection + portable primitives (shared with the cursor lib) ─────────
detect_os() {
  case "$(uname -s 2>/dev/null)" in
    Linux*)              OS=linux   ;;
    Darwin*)             OS=macos   ;;
    CYGWIN*|MINGW*|MSYS*) OS=windows ;;
    *)                   OS=linux   ;;
  esac
  export OS
}
require_node() {
  if command -v node >/dev/null 2>&1; then NODE_BIN=node; return 0; fi
  echo "  ✗ 'node' not found on PATH. Install Node ≥18 and re-run." >&2; exit 1
}
now_ms() { "$NODE_BIN" -e 'process.stdout.write(String(Date.now()))'; }
file_mtime_s() { "$NODE_BIN" -e 'try{process.stdout.write(String(Math.floor(require("fs").statSync(process.argv[1]).mtimeMs/1000)))}catch(e){process.stdout.write("0")}' "$1"; }

# Windsurf was rebranded "Devin" / "Devin Next" (Cognition). The capture hook,
# delivery extension and launcher all need to match BOTH the old "Windsurf" names
# and the new "Devin"/"Devin Next" names, on every OS. These helpers centralise that.

# Candidate IDE extension dirs (VS Code forks store at ~/<dataFolderName>/extensions).
ide_extension_globs() {
  printf '%s\n' \
    "$HOME/.windsurf/extensions" \
    "$HOME/.windsurf-next/extensions" \
    "$HOME/.devin/extensions" \
    "$HOME/.devin-next/extensions" \
    "$HOME/.codeium/windsurf/extensions"
}

# Running Windsurf/Devin IDE processes (best-effort; always exits 0).
windsurf_proc_count() {
  local n=0
  if command -v pgrep >/dev/null 2>&1; then
    n=$(pgrep -fi 'windsurf\|devin' 2>/dev/null | wc -l | tr -d ' ' || true)
  elif command -v tasklist >/dev/null 2>&1; then
    n=$(tasklist 2>/dev/null | grep -icE 'windsurf|devin' || true)
  fi
  printf '%s' "${n:-0}"
}

# The IDE's workspaceStorage dir for this OS — first existing of Windsurf/Devin/Devin Next.
windsurf_storage_dir() {
  local base names n
  case "$OS" in
    macos)   base="$HOME/Library/Application Support" ;;
    windows) base="${APPDATA:-$HOME/AppData/Roaming}" ;;
    *)       base="$HOME/.config" ;;
  esac
  for n in "Windsurf" "Devin" "Devin Next"; do
    [[ -d "$base/$n/User/workspaceStorage" ]] && { printf '%s' "$base/$n/User/workspaceStorage"; return; }
  done
  printf '%s' "$base/Windsurf/User/workspaceStorage"   # default (may not exist; capture is hook-based)
}

# Resolve a command that opens a folder in the IDE (Windsurf OR Devin / Devin Next).
# Sets WINDSURF_LAUNCH (array).
resolve_windsurf_launcher() {
  WINDSURF_LAUNCH=()
  local cli
  for cli in windsurf devin; do
    command -v "$cli" >/dev/null 2>&1 && { WINDSURF_LAUNCH=("$cli"); return 0; }
  done
  case "$OS" in
    linux)
      local c
      for c in "$HOME/Applications/windsurf.AppImage" /usr/share/windsurf/windsurf /opt/windsurf/windsurf /usr/bin/windsurf \
               "$HOME/Applications/devin.AppImage" /usr/share/devin/devin /opt/devin/devin /usr/bin/devin; do
        [[ -x "$c" ]] && { case "$c" in *.AppImage) WINDSURF_LAUNCH=("$c" --no-sandbox);; *) WINDSURF_LAUNCH=("$c");; esac; return 0; }
      done
      local g; g=$(ls "$HOME"/Applications/[WwDd][ie][nv]*.AppImage 2>/dev/null | head -1 || true)
      [[ -n "$g" && -x "$g" ]] && { WINDSURF_LAUNCH=("$g" --no-sandbox); return 0; } ;;
    macos)
      local app
      for app in "Windsurf" "Devin" "Devin Next"; do
        [[ -d "/Applications/$app.app" ]]       && { WINDSURF_LAUNCH=(open -a "$app");                      return 0; }
        [[ -d "$HOME/Applications/$app.app" ]]  && { WINDSURF_LAUNCH=(open -a "$HOME/Applications/$app.app"); return 0; }
      done ;;
    windows)
      local prog="${LOCALAPPDATA:-$HOME/AppData/Local}/Programs" c
      for c in "$prog/Windsurf/Windsurf.exe" "$prog/windsurf/Windsurf.exe" \
               "$prog/Devin/Devin.exe" "$prog/Devin Next/Devin Next.exe" "$prog/Devin Next/Devin.exe"; do
        [[ -f "$c" ]] && { WINDSURF_LAUNCH=("$c"); return 0; }
      done ;;
  esac
  return 1
}
open_windsurf() {
  local folder="$1"
  if ! resolve_windsurf_launcher; then return 1; fi
  echo "  ▸ launching: ${WINDSURF_LAUNCH[*]} \"$folder\""
  if [[ "$OS" == "macos" && "${WINDSURF_LAUNCH[0]}" == "open" ]]; then
    "${WINDSURF_LAUNCH[@]}" "$folder" >/dev/null 2>&1 || return 1
  else
    nohup "${WINDSURF_LAUNCH[@]}" "$folder" >/dev/null 2>&1 &
    disown 2>/dev/null || true
  fi
  return 0
}

# ─── DB + telemetry access ───────────────────────────────────────────────────
# Read a single scalar from nexpath's prompt store using nexpath's OWN engine —
# sql.js (pure JS/WASM) + os.homedir(). Identical on Linux / macOS / Windows:
#   • No native better-sqlite3 / sqlite3.exe → no ABI rebuild, no "module built
#     against a different Node version" failures.
#   • os.homedir() resolves the real store path natively on every OS, so there is
#     no MINGW '/c/...' vs native 'C:\...' mismatch (which silently returned 0 and
#     made Windows look like capture had failed when it was just unreadable).
# Only NEXPATH_REPO (where sql.js lives) must be in native form for Node on Windows
# → cygpath. This is the same engine `nexpath auto` writes with, so reads can never
# disagree with writes. A partial read mid-write throws → caught → "0"; the
# wait_for_captures poll absorbs that transient.
db_scalar() {
  local sql="$1" repo="$NEXPATH_REPO"
  if [[ "$OS" == "windows" ]] && command -v cygpath >/dev/null 2>&1; then
    repo="$(cygpath -m "$NEXPATH_REPO")"   # 'C:/...' forward slashes: native to Win32 Node, MSYS2-safe argv
  fi
  "$NODE_BIN" --input-type=module -e '
    import { readFileSync, existsSync } from "node:fs";
    import { homedir } from "node:os";
    import { join } from "node:path";
    import { pathToFileURL } from "node:url";
    const [repo, sql] = process.argv.slice(1);
    const dbPath = join(homedir(), ".nexpath", "prompt-store.db");
    if (!existsSync(dbPath)) { process.stdout.write("0"); process.exit(0); }
    const sqlDir = join(repo, "node_modules", "sql.js", "dist");
    const initSqlJs = (await import(pathToFileURL(join(sqlDir, "sql-wasm.js")).href)).default;
    const SQL = await initSqlJs({ locateFile: (f) => join(sqlDir, f) });
    const db = new SQL.Database(readFileSync(dbPath));
    let out = "0";
    try { const r = db.exec(sql); out = String(r[0]?.values?.[0]?.[0] ?? 0); } catch {}
    db.close(); process.stdout.write(out);
  ' "$repo" "$sql" 2>/dev/null || echo "0"
}

# Accurate advisory-fire count for THIS project — append-only telemetry events.
# (pending_advisories keeps only the latest row per project, so a row count
# undercounts multi-fire runs; the telemetry line is written once per fire.)
tel_fires_since_start() {
  local tel="${HOME}/.nexpath/telemetry.jsonl" n=0
  # Match by the unique workspace basename (canonical project_root in telemetry may
  # differ from WORK_DIR — see WORK_BASENAME note).
  [[ -f "$tel" ]] && n=$(grep -F "${WORK_BASENAME}" "$tel" 2>/dev/null | grep -c 'pipeline_advisory_pending' || true)
  printf '%s' "${n:-0}"
}

# ─── API key + repo resolution (shared) ──────────────────────────────────────
NEXPATH_TESTER_KEY_FILE="${NEXPATH_TESTER_KEY_FILE:-$HOME/.nexpath-tester.key}"
_valid_openai_key() { [[ "$1" == sk-* && ${#1} -ge 20 ]]; }
ensure_openai_key() {
  if [[ -n "${OPENAI_API_KEY:-}" ]] && _valid_openai_key "$OPENAI_API_KEY"; then
    echo "  ✓ Using OPENAI_API_KEY from your shell environment."; export OPENAI_API_KEY; return 0
  fi
  if [[ -f "$NEXPATH_TESTER_KEY_FILE" ]] && _valid_openai_key "$(cat "$NEXPATH_TESTER_KEY_FILE" 2>/dev/null)"; then
    OPENAI_API_KEY="$(cat "$NEXPATH_TESTER_KEY_FILE")"; export OPENAI_API_KEY
    echo "  ✓ Using the API key you saved earlier ($NEXPATH_TESTER_KEY_FILE)."; return 0
  fi
  echo "  Enter YOUR OWN OpenAI API key (stored only on this machine at"
  echo "  $NEXPATH_TESTER_KEY_FILE). Get one at https://platform.openai.com/api-keys"; echo ""
  local entered
  while true; do
    read -rsp "  OpenAI API key (starts with sk-): " entered; echo ""
    if _valid_openai_key "$entered"; then
      OPENAI_API_KEY="$entered"; export OPENAI_API_KEY
      printf '%s' "$entered" > "$NEXPATH_TESTER_KEY_FILE"; chmod 600 "$NEXPATH_TESTER_KEY_FILE" 2>/dev/null || true
      echo "  ✓ Key saved — you won't be asked again on this machine."; return 0
    fi
    echo "  ✗ Doesn't look valid (expected 'sk-…'). Try again, or Ctrl-C to quit."
  done
}
_repo_root_from_cli() { local c="$1"; [[ -n "$c" && "$c" == */dist/cli/index.js ]] && printf '%s' "${c%/dist/cli/index.js}"; }
# Walk up from a dir to the nexpath repo root (identified by package.json +
# the windsurf-hook source/build). Lets the bundle live INSIDE the repo
# (e.g. <repo>/scripts/windsurf-manual-test/) and still self-locate on any device.
_repo_root_walkup() {
  local p="$1"
  while [[ -n "$p" && "$p" != "/" && "$p" != "." ]]; do
    [[ -f "$p/package.json" && ( -d "$p/src/windsurf-hook" || -f "$p/dist/cli/index.js" ) ]] && { printf '%s' "$p"; return 0; }
    p="$(dirname "$p")"
  done
  return 1
}
resolve_nexpath_repo() {
  local d=""
  if   [[ -n "${NEXPATH_REPO:-}" && -d "$NEXPATH_REPO" ]]; then :
  elif d="$(_repo_root_walkup "$SCRIPT_DIR")"; [[ -n "$d" ]]; then NEXPATH_REPO="$d"
  elif [[ -d "$SCRIPT_DIR/nexpath" && -f "$SCRIPT_DIR/nexpath/package.json" ]]; then NEXPATH_REPO="$SCRIPT_DIR/nexpath"
  elif [[ -d "$HOME/nexpath"       && -f "$HOME/nexpath/package.json" ]];       then NEXPATH_REPO="$HOME/nexpath"
  elif [[ -d "$PWD/nexpath"        && -f "$PWD/nexpath/package.json" ]];        then NEXPATH_REPO="$PWD/nexpath"
  else
    [[ -n "${NEXPATH_BIN:-}" ]] && d="$(_repo_root_from_cli "$NEXPATH_BIN")"
    if [[ -z "$d" ]] && command -v nexpath >/dev/null 2>&1; then
      local link; link="$( { readlink -f "$(command -v nexpath)" 2>/dev/null || "$NODE_BIN" -e 'process.stdout.write(require("fs").realpathSync(process.argv[1]))' "$(command -v nexpath)" 2>/dev/null; } || true)"
      d="$(_repo_root_from_cli "$link")"
    fi
    [[ -n "$d" && -d "$d" ]] && NEXPATH_REPO="$d"
  fi
  if [[ -z "${NEXPATH_REPO:-}" || ! -d "$NEXPATH_REPO" ]]; then
    echo "" >&2; echo "  ✗ Could not find your local nexpath clone." >&2
    echo "    Set it explicitly:  export NEXPATH_REPO=/full/path/to/your/nexpath" >&2; exit 1
  fi
  export NEXPATH_REPO
  echo "  ✓ Using nexpath repo: $NEXPATH_REPO"
}

# Write ~/.codeium/windsurf/hooks.json (pre_user_prompt → this build's CLI),
# using the real writeWindsurfHooks so it matches exactly what `nexpath install`
# does. Prints the hooks path. Cross-OS (pathToFileURL for the dynamic import).
ensure_windsurf_hook() {
  # CRITICAL (Windows): the harness runs under Git Bash but spawns a WIN32 Node.
  # Win32 Node's path.resolve/join read a MINGW '/c/...' path as 'C:\c\...' (current
  # drive + a literal 'c'), so writeWindsurfHooks would bake a BROKEN absolute CLI
  # path into hooks.json — e.g. node "C:\c\Users\...\dist\cli\index.js" — and the
  # Cascade hook then fires but ENOENTs → capture 0 (the exact Windows symptom).
  # Hand WIN32 Node native paths (cygpath -m → 'C:/Users/...' with forward slashes,
  # so MSYS2 doesn't re-mangle the argv) and resolve() yields the real CLI path.
  # The real `nexpath install` is unaffected — it uses native process.argv[1].
  # Windows/Devin Next ONLY: live testing proved Devin Next does NOT execute the
  # user-level ~/.codeium/windsurf/hooks.json (0 hook invocations during a full walk,
  # while the file is present at the documented path and the CLI captures fine when
  # invoked directly). Per the Cascade Hooks spec, hooks also load + merge from the
  # WORKSPACE-level .windsurf/hooks.json — which is tied to the exact folder Devin has
  # open and is branding-independent. So on Windows we ALSO write <workspace>/.windsurf/
  # hooks.json. NOT done on macOS/Linux (user-level already fires there; a second hook
  # file would double-fire pre_user_prompt → double capture).
  local repo="$NEXPATH_REPO" home="$HOME" ws="$WORK_DIR" alsoWs="0"
  if [[ "$OS" == "windows" ]] && command -v cygpath >/dev/null 2>&1; then
    repo="$(cygpath -m "$NEXPATH_REPO")"
    home="$(cygpath -m "$HOME")"
    ws="$(cygpath -m "$WORK_DIR")"
    alsoWs="1"
  fi
  "$NODE_BIN" --input-type=module -e '
    const [repo, home, ws, alsoWs] = process.argv.slice(1);
    const { pathToFileURL } = await import("node:url");
    const { join } = await import("node:path");
    const mod = await import(pathToFileURL(repo + "/dist/windsurf-hook/install.js").href);
    const cli = repo + "/dist/cli/index.js";
    const userPath = mod.getWindsurfHooksPath(home);
    mod.writeWindsurfHooks(userPath, cli);
    let out = userPath;
    if (alsoWs === "1") {
      const wsPath = join(ws, ".windsurf", "hooks.json");
      mod.writeWindsurfHooks(wsPath, cli);
      out += "  +  " + wsPath;
    }
    process.stdout.write(out);
  ' "$repo" "$home" "$ws" "$alsoWs"
}

# ─── UI helpers ──────────────────────────────────────────────────────────────
wait_ok() {
  local label="${1:-next step}"
  printf "\n  >>> Ready to proceed? Type 'okay' and press Enter (%s): " "$label"
  while true; do read -r INPUT; [[ "$INPUT" == "okay" ]] && break; printf "  >>> Please type 'okay' to continue: "; done
  echo ""
}
header() { echo ""; echo "══════════════════════════════════════════════════════════"; echo "  $1"; echo "══════════════════════════════════════════════════════════"; }

prompt_box() {
  local idx="$1" text="$2" fire="$3" trigger="$4" level="$5" note="$6"
  echo ""
  echo "  ┌─────────────────────────────────────────────────────"
  echo "  │  PROMPT #${idx}"
  echo "  │"
  echo "  │  Paste into Windsurf's Cascade chat → Enter:"
  echo "  │"
  echo "  │  ${text}"
  echo "  │"
  if [[ "$fire" == "YES" ]]; then
    echo "  │  ⚡ EXPECTED: the 'Nexpath — Action Required' terminal popup opens."
    echo "  │     Pick an option → 'Send now' → it injects into Cascade."
    echo "  │     (If the popup fails, the '💡 Nexpath advisory' status bar shows instead.)"
    echo "  │     Trigger : ${trigger}"
    echo "  │     Level   : ${level}"
  else
    echo "  │  ○ EXPECTED: no advisory (Nexpath stays quiet)"
  fi
  [[ -n "$note" ]] && { echo "  │"; echo "  │  Note: ${note}"; }
  echo "  └─────────────────────────────────────────────────────"
}

# ─── verification (capture from prompts table, fires from telemetry) ─────────
# Match by the unique workspace folder NAME (suffix), not the exact path — the IDE
# records a canonical project_root (macOS /tmp→/private/tmp, Windows drive-case) that
# differs from WORK_DIR. The timestamped basename is globally unique, so this is exact
# enough without needing the captured_at window.
captures_since_start() { db_scalar "SELECT count(*) FROM prompts WHERE project_root LIKE '%${WORK_BASENAME}';"; }

# Poll captures_since_start until it reaches >= want, or CAPTURE_WAIT_SECS elapses.
# The Cascade hook → `nexpath auto` write lags a few seconds behind the agent reply
# (LS hook scheduling + node cold start on the first prompt; `auto` also runs its LLM
# pipeline), and a read that races `auto`'s sql.js writeFileSync can momentarily see
# the pre-write file. Polling absorbs both so a captured prompt is never reported as 0.
# If the hook truly never fires, this just waits the timeout and returns the real (low)
# count — the shortfall still surfaces in verify_prompt / the prompt-1 warning.
CAPTURE_WAIT_SECS="${CAPTURE_WAIT_SECS:-15}"
wait_for_captures() {
  local want="$1" c i
  for ((i = 0; i < CAPTURE_WAIT_SECS; i++)); do
    c=$(captures_since_start)
    [[ "${c:-0}" -ge "$want" ]] && { printf '%s' "$c"; return 0; }
    sleep 1
  done
  captures_since_start
}

verify_prompt() {
  local idx="$1" expected="$2" prior="$3"
  local captures fires delta
  # Cumulative captures should reach idx by now; poll to absorb hook/auto write lag.
  captures=$(wait_for_captures "$idx"); fires=$(tel_fires_since_start)
  delta=$((fires - prior))
  echo ""
  echo "  ──── Verification for prompt ${idx} ────"
  echo "    Captured (this run) : ${captures}"
  echo "    Advisory fires      : ${fires}"
  echo "    New fire here        : ${delta}"
  if [[ "$expected" == "YES" && "$delta" -ge 1 ]]; then echo "    ✓ MATCH: advisory fired as expected"; return 0
  elif [[ "$expected" == "NO" && "$delta" -eq 0 ]]; then echo "    ✓ MATCH: stayed silent as expected"; return 0
  else echo "    ✗ MISMATCH: expected=${expected}, observed Δ=${delta}"; return 1; fi
}

R25_DONE=0
r25_verify() {
  [[ "$R25_DONE" -ne 0 ]] && return
  echo ""
  echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ⚡ First advisory — verify the popup (primary) + selection path"
  echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  PRIMARY — terminal popup, like Cursor/CLI:"
  echo "   1. The 'Nexpath — Action Required' terminal popup opens."
  echo "   2. Pick a numbered option → choose 'Send now'."
  echo "   3. The extension injects the chosen prompt into Cascade's input"
  echo "      (or, until the chat-input command id is verified, a clipboard toast)."
  echo "  FALLBACK — only if the popup DIDN'T open:"
  echo "   • A '💡 Nexpath advisory' status-bar item appears → click → sidebar → pick."
  echo ""
  wait_ok "Saw the terminal popup (or the status-bar fallback) → selection reached Cascade"
  R25_DONE=1
  echo "  ✓ Delivery + selection verified"
}

# ─── prompt runner ───────────────────────────────────────────────────────────
PRIOR_ADV=0
FAIL_COUNT=0
run_prompt() {
  local idx="$1" text="$2" fire="$3" trig="$4" lvl="$5" note="$6"
  [[ "$fire" == "YES" ]] && { echo ""; echo "  ━━━ ⚡ PROMPT $idx — ADVISORY SHOULD FIRE ━━━"; }
  prompt_box "$idx" "$text" "$fire" "$trig" "$lvl" "$note"
  wait_ok "Prompt $idx sent in Cascade and the reply finished"
  verify_prompt "$idx" "$fire" "$PRIOR_ADV" || FAIL_COUNT=$((FAIL_COUNT + 1))
  PRIOR_ADV=$(tel_fires_since_start)
  if [[ "$fire" == "YES" && "$R25_DONE" -eq 0 && "$PRIOR_ADV" -ge 1 ]]; then r25_verify; fi
  if [[ "$idx" == "1" ]]; then
    local cap; cap=$(wait_for_captures 1)
    if [[ "$cap" -eq 0 ]]; then
      echo ""
      echo "  ✗ WARNING: 0 prompts captured after prompt 1 — the Cascade hook isn't firing."
      echo "    • Confirm ~/.codeium/windsurf/hooks.json has the nexpath pre_user_prompt entry."
      echo "    • RESTART Windsurf so the language server reloads hooks.json, then re-send."
      echo "    • Confirm 'node' is on PATH inside Windsurf's hook environment."
      wait_ok "Acknowledged (continue anyway)"
    fi
  fi
}

# ─── setup ────────────────────────────────────────────────────────────────────
windsurf_test_setup() {
  detect_os; require_node
  TIMESTAMP=$(now_ms)
  local tmp="${TMPDIR:-/tmp}"; tmp="${tmp%/}"
  WORK_DIR="${tmp}/nexpath-test-${SCENARIO_ID}-windsurf-${TIMESTAMP}"
  # The unique workspace folder name — used to match captured rows / telemetry by
  # SUFFIX rather than the full path, so we don't miss rows when the IDE records a
  # CANONICAL project_root that differs from WORK_DIR (macOS /tmp → /private/tmp;
  # Windows drive-letter case; any symlinked temp dir). The timestamp makes it unique.
  WORK_BASENAME="nexpath-test-${SCENARIO_ID}-windsurf-${TIMESTAMP}"
  SESSION_START_MS=$(now_ms)
  export WORK_DIR WORK_BASENAME SESSION_START_MS

  resolve_nexpath_repo
  PROMPT_STORE_DB="${HOME}/.nexpath/prompt-store.db"

  header "Nexpath Behaviour Test — ${SCENARIO_TITLE} (Windsurf)"
  echo "  OS       : ${OS}"
  echo "  Persona  : ${SCENARIO_PERSONA}"
  echo "  Capture  : Cascade hook (pre_user_prompt → nexpath auto)"
  echo "  Delivery : terminal popup (primary, like Cursor/CLI) → 'Send now' → inject;"
  echo "             '💡 Nexpath advisory' status-bar fallback only if the popup fails"
  echo "  Layer C  : sub-7 (byte-identical) — fire/silent pattern matches the CLI sim"

  # STEP 1 — folder
  header "STEP 1 — Setting up test project folder"
  mkdir -p "$WORK_DIR"; cd "$WORK_DIR"
  echo "  ✓ mkdir ${WORK_DIR}"
  git init -q 2>/dev/null && echo "  ✓ git init" || echo "  ⚠ git not available (non-fatal)"
  npm init -y > /dev/null 2>&1 && echo "  ✓ npm init -y" || echo "  ⚠ npm init skipped"
  echo "# nexpath-test-${SCENARIO_ID}-windsurf" > README.md
  echo "  ✓ Project folder ready at: ${WORK_DIR}"

  # STEP 2 — build CLI + write the Cascade capture hook
  header "STEP 2 — Installing the Cascade capture hook"
  if [[ ! -f "${NEXPATH_REPO}/dist/cli/index.js" ]]; then
    echo "  Building nexpath CLI..."; ( cd "$NEXPATH_REPO" && npm install && npm run build ) 2>&1 | tail -3
  fi
  local hooksPath; hooksPath=$(ensure_windsurf_hook) && \
    echo "  ✓ Cascade hook written to ${hooksPath}" || { echo "  ✗ failed to write Cascade hook"; exit 1; }
  echo "  (capture fires on every Cascade prompt; restart Windsurf so the LS loads it)"

  # STEP 3 — verify the extension (for delivery). Probe every IDE extension dir
  # (Windsurf + the Devin / "Devin Next" rebrand), any OS.
  header "STEP 3 — Verifying the Nexpath extension (delivery surface)"
  local extdir="" d
  while IFS= read -r d; do
    extdir=$(ls -d "$d"/emptyops.nexpath-vscode-* 2>/dev/null | head -1 || true)
    [[ -n "$extdir" ]] && break
  done < <(ide_extension_globs)
  if [[ -n "$extdir" ]]; then
    echo "  ✓ Extension present: ${extdir##*/}  (${extdir%/extensions/*}/extensions)"
    if [[ -f "${NEXPATH_REPO}/src/ext-vscode/out/extension.cjs" && -f "${extdir}/out/extension.cjs" ]]; then
      local a b; a=$("$NODE_BIN" -e 'const c=require("crypto"),f=require("fs");process.stdout.write(c.createHash("md5").update(f.readFileSync(process.argv[1])).digest("hex"))' "${extdir}/out/extension.cjs"); \
                  b=$("$NODE_BIN" -e 'const c=require("crypto"),f=require("fs");process.stdout.write(c.createHash("md5").update(f.readFileSync(process.argv[1])).digest("hex"))' "${NEXPATH_REPO}/src/ext-vscode/out/extension.cjs")
      [[ "$a" == "$b" ]] && echo "  ✓ Installed bundle matches local build (md5 ${a:0:8}…)" \
                         || { echo "  ⚠ Installed bundle DIFFERS — rebuild + repackage + reinstall the VSIX."; wait_ok "Bundle mismatch acknowledged"; }
    fi
  else
    echo "  ⚠ Nexpath extension not found in any IDE extensions dir (.windsurf/.devin/.devin-next)."
    echo "    Capture (hook) will still work, but advisory DELIVERY needs the extension."
    echo "    Build + install it:  cd \"${NEXPATH_REPO}/src/ext-vscode\" && npm install && npm run build && npm run package"
    echo "    then:  <windsurf|devin> --install-extension <the .vsix>   (or VSIX UI)"
    wait_ok "Extension install acknowledged (delivery checks may not appear without it)"
  fi

  # STEP 4 — nexpath init + API key
  header "STEP 4 — nexpath init + YOUR OpenAI API key (REQUIRED)"
  echo "  Fill the questionnaire:"
  echo "    Project name → ${INIT_NAME}  /  Type → ${INIT_TYPE}  /  Language → ${INIT_LANG}"
  echo "    Description  → ${INIT_DESC}"; echo ""
  node "${NEXPATH_REPO}/dist/cli/index.js" init --project "${WORK_DIR}"
  ensure_openai_key
  echo "OPENAI_API_KEY=${OPENAI_API_KEY}" > "${WORK_DIR}/.env"
  echo "  ✓ Wrote ${WORK_DIR}/.env so the hook's nexpath auto picks up the key"

  # STEP 5 — open Windsurf
  header "STEP 5 — Opening the IDE (Windsurf / Devin) at the test workspace"
  if open_windsurf "$WORK_DIR"; then
    echo "  ✓ Open command issued (${WINDSURF_LAUNCH[*]}). Giving it a few seconds to start…"; sleep 6
  else
    echo "  ⚠ Could not auto-detect a Windsurf/Devin launcher on this OS."
    echo "    Open it yourself:  <windsurf|devin> \"${WORK_DIR}\"   (or File → Open Folder in the app)"
  fi
  echo ""
  echo "  After the IDE opens (open the TEST FOLDER so the poller binds to it, not '/'):"
  echo "  1. FULLY restart the IDE once (quit all windows + tray; the language server"
  echo "     must reload ~/.codeium/windsurf/hooks.json — a window reload is NOT enough)."
  echo "  2. Click 'Allow' on the Nexpath consent toast (first launch)."
  echo "  3. View → Output → 'Nexpath' should show: extension activated + windsurf"
  echo "     advisory poller started."
  echo "  4. Open the Cascade chat panel — you'll paste each prompt there."
  echo ""
  wait_ok "Windsurf is open on the test workspace, consent allowed, Cascade panel ready"

  header "STEP 6 — Walk all ${TOTAL_PROMPTS} ${SCENARIO_ID} prompts (paste each into Cascade)"
  echo "  For each: copy → Cascade input → paste → Enter; wait for the full reply,"
  echo "  then type 'okay'. The script verifies capture (store) + fires (telemetry)."
  PRIOR_ADV=0; FAIL_COUNT=0
}

# ─── final evaluation ─────────────────────────────────────────────────────────
windsurf_test_finish() {
  header "STEP 7 — Evaluation"
  local fc ff; fc=$(captures_since_start); ff=$(tel_fires_since_start)
  echo "  Project                : ${WORK_DIR}"
  echo "  Total prompts captured : ${fc} (expected: ${TOTAL_PROMPTS})"
  echo "  Total advisory fires   : ${ff} (expected ~${EXPECTED_ADVISORIES}; ±1–3 is normal — Stage-2 LLM)"
  echo "  Per-prompt mismatches  : ${FAIL_COUNT} / ${TOTAL_PROMPTS}"
  echo "  Delivery/select check  : $([[ $R25_DONE -eq 1 ]] && echo YES || echo NO)"
  echo ""
  echo "  PASS guide: captured == ${TOTAL_PROMPTS} (capture is deterministic) AND the"
  echo "  delivery/select path verified. Exact fire count drifts ±1–3 (Stage-2 LLM),"
  echo "  so treat fires≈${EXPECTED_ADVISORIES} as expected, not an exact gate."
  if [[ "$fc" -eq "$TOTAL_PROMPTS" && "$R25_DONE" -eq 1 ]]; then
    echo "  ✓ CAPTURE + DELIVERY verified — ${SCENARIO_ID} on Windsurf (${OS}). Fires=${ff}."
  else
    echo "  ⚠ Review: capture should be ${TOTAL_PROMPTS}; delivery must be verified once."
    echo "    sqlite3 ${PROMPT_STORE_DB} \"SELECT prompt_text FROM prompts WHERE project_root LIKE '%${WORK_BASENAME}';\""
  fi
  echo ""
  echo "  Cleanup when done: rm -rf ${WORK_DIR}"
  header "${SCENARIO_ID}-windsurf (${TOTAL_PROMPTS} prompts) complete"
}
