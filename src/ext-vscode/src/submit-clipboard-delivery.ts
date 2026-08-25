import { spawn, spawnSync } from 'node:child_process';

/**
 * Clipboard-fallback delivery for the submit-time advisory (hook milestone H3, Q3).
 *
 * WHY THIS PATH FIRST (owner ruling on `G-POLICY`, 2026-08-10). Windsurf has two
 * insert mechanisms. The direct one (`addCascadeInput`) is faster but its protobuf
 * payload shape was derived by decompiling Windsurf's own bundle — a near-verbatim
 * match for their AUP's reverse-engineering prohibition (`R8`), and that policy
 * question is still unresolved. **This clipboard + keystroke path carries no such
 * exposure**, so it is built first: if the direct payload is ever ruled against,
 * the milestone still has a working delivery route rather than being stranded.
 *
 * WHY INJECT AND SUBMIT ARE SEPARATE. H1 proved empirically that **neither
 * Windsurf nor Cursor auto-submits** after an insert — the text only populates the
 * composer. Completing "the picked option becomes the sole prompt of that turn"
 * therefore needs a second, distinct step with its own failure mode. Modelling
 * them as one call would bake in a false assumption.
 *
 * WHY FOCUS IS AN EXPLICIT PRECONDITION. H1's other load-bearing finding: submit
 * success is coupled to **focus state, not platform**. A synthetic Enter submitted
 * on Windsurf after `addCascadeInput` (which focuses the panel) but not after raw
 * typing; on Cursor it failed without a focus command and succeeded with one. So
 * `focus` is a first-class injected step here, not an incidental detail.
 *
 * CROSS-OS FROM THE FIRST COMMIT (§2.4b). `submitKeystroke` branches macOS /
 * Windows / Linux exactly as the shipped `pasteKeystroke` does
 * (`windsurf-autopaste.ts:73-89`) — osascript / PowerShell SendKeys / xdotool with
 * Wayland alternates. **No submit-keystroke helper existed before this**; the
 * shipped one only sends Ctrl+V, so this is genuinely new cross-OS work, not reuse.
 *
 * BACKWARD COMPATIBILITY (`R12`). This is a NEW module with no consumers until H3
 * wires it behind `NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY`. It does not modify
 * `windsurf-autopaste.ts`, `extension.ts`, or any other shipping file.
 *
 * OWNERSHIP. Everything referenced here is Vedansi-owned
 * (`src/ext-vscode/**`). Hiren's `engine-option-generator.ts` and Bhavnesh's
 * `TtySelectFn.ts` are consumed elsewhere in H3 but never edited.
 */


/** Injected OS-automation seams. Defaults are supplied by the caller (extension.ts). */
export interface SubmitClipboardDeliveryDeps {
  /** Write the replacement text to the system clipboard. */
  writeClipboard: (text: string) => Promise<void>;
  /** Raise/focus the host editor window so keystrokes land in it. */
  focus: () => Promise<boolean>;
  /** Simulate the paste shortcut into the focused input. */
  pasteKeystroke: () => boolean;
  /** Simulate the submit key (Enter) — see `buildSubmitKeystroke` for the OS matrix. */
  submitKeystroke: () => boolean;
  /** Optional redacted logger. **Never** pass the replacement text. */
  log?: (message: string) => void;
}

export interface SubmitClipboardDelivery {
  /** Place the text in the composer. Resolves `false` on any failure — never throws. */
  inject: (text: string) => Promise<boolean>;
  /** Send the submit key. Resolves `false` on any failure — never throws. */
  submit: () => Promise<boolean>;
}


/**
 * Build the delivery pair the submit-time poller consumes.
 *
 * Fail-open (`A3`) throughout: every step swallows its own error and reports
 * `false`. A delivery problem must never propagate — the user's prompt was
 * already blocked by the hook, so a thrown error here would strand them.
 */
export function createSubmitClipboardDelivery(
  deps: SubmitClipboardDeliveryDeps,
): SubmitClipboardDelivery {
  const log = deps.log ?? (() => {});

  return {
    async inject(text: string): Promise<boolean> {
      if (typeof text !== 'string' || text.length === 0) {
        // Guard mirrors submit-decision-record's: pasting "" would clear the
        // composer and silently lose the turn.
        log('[nexpath] submit-clipboard: refused an empty replacement');
        return false;
      }
      try {
        await deps.writeClipboard(text);
      } catch {
        log('[nexpath] submit-clipboard: clipboard write failed');
        return false;
      }
      // Focus is a precondition, not a nicety — H1 proved submit depends on it.
      // A focus failure is NOT fatal on its own: the paste may still land if the
      // composer already had focus, so we continue but record it.
      let focused = false;
      try {
        focused = await deps.focus();
      } catch {
        focused = false;
      }
      if (!focused) log('[nexpath] submit-clipboard: focus not confirmed; pasting anyway');

      let pasted = false;
      try {
        pasted = deps.pasteKeystroke();
      } catch {
        pasted = false;
      }
      log(`[nexpath] submit-clipboard: inject ${pasted ? 'dispatched' : 'failed'} (focused=${focused})`);
      return pasted;
    },

    async submit(): Promise<boolean> {
      try {
        const sent = deps.submitKeystroke();
        log(`[nexpath] submit-clipboard: submit ${sent ? 'dispatched' : 'failed'}`);
        return sent;
      } catch {
        log('[nexpath] submit-clipboard: submit threw');
        return false;
      }
    },
  };
}


/** Platform + tool seams for the submit keystroke, mirroring `AutoPasteDeps`. */
export interface SubmitKeystrokeDeps {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  hasCommand?: (cmd: string) => boolean;
  run?: (cmd: string, args: string[]) => boolean;
  /** RC10 phantom-Enter guard; injectable for tests. Defaults to the real check. */
  isPopupFocused?: (deps?: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv }) => boolean;
  /**
   * RC11 whitelist: when set, Enter fires ONLY if this editor's window is
   * focused (after one focusEditor retry). Unset ⇒ pre-RC11 behaviour.
   */
  host?: 'windsurf' | 'cursor';
  isEditorFocused?: typeof focusedWindowIsEditor;
  /** One-shot editor raise used when the editor is not focused. */
  focusEditor?: () => void;
  /**
   * RC47 (win32): the LIVE `vscode.env.appName` — tried as the FIRST
   * AppActivate candidate. AppActivate matches exact/prefix/suffix, NOT
   * substring, so a rebranded title ("Devin Next", …) misses the bare product
   * names; the app's own reported name is the one string that tracks reality.
   */
  appName?: string;
  /** RC47: diagnostic sink for the win32 submit path (which titles failed, what held the foreground). */
  submitLog?: (message: string) => void;
}


/**
 * Send the submit key (Enter) to the focused input, per OS.
 *
 * Deliberately mirrors `pasteKeystroke`'s structure and tool preferences
 * (`windsurf-autopaste.ts:67-91`) so both keystrokes behave consistently and fail
 * the same way. Returns `false` — never throws — when no tool is available, which
 * the caller reports as `submit_failed` rather than treating as a crash.
 *
 * **Linux caveat, deliberately preserved from the shipped helper:** with no
 * `DISPLAY`/`WAYLAND_DISPLAY` there is nothing to type into, so this returns
 * `false` immediately rather than shelling out pointlessly.
 */
function defaultHasCommand(cmd: string): boolean {
  try {
    return spawnSync('which', [cmd], { stdio: 'ignore', timeout: 2000 }).status === 0;
  } catch {
    return false;
  }
}

function defaultRun(cmd: string, args: string[]): boolean {
  try {
    return spawnSync(cmd, args, { stdio: 'ignore', timeout: 3000 }).status === 0;
  } catch {
    return false;
  }
}

/**
 * Nexpath's own popup window titles. A synthetic keystroke must NEVER fire
 * while one of these is focused — see the guard below.
 */
export const NEXPATH_POPUP_TITLE_MARKERS = [
  'Nexpath — Action Required',
  'Nexpath · Prompt enhancement',
  'Nexpath — Feedback',
  'NEXPATH CLI',
] as const;

/**
 * ⚠ PHANTOM-ENTER GUARD (live root cause RC10, 2026-08-13 — captured in hex).
 *
 * The submit popup is deliberately raised to the foreground so the user can
 * see it. Synthetic keystrokes go to the FOCUSED window. When a delivery's
 * Enter fires while a popup holds focus, the Enter lands IN THE POPUP —
 * measured live: two bare `\r` bytes hit the popup's TTY ~1.9 s after it
 * opened (one poller tick), auto-"selecting" the first option and closing it.
 * The user experiences a popup that flashes open and closes by itself, and a
 * prompt that gets replaced without their choice — the worst possible UX.
 *
 * So: before ANY synthetic key, check the active window's title; if it is one
 * of our own popups, DO NOT send — return false (treated as not-submitted; the
 * user presses Enter in the editor themselves). Linux/X11 only, where the bug
 * bites and where the popups exist; other platforms return "safe" (no check
 * possible, no popup foregrounding there either). Fail-safe: an unreadable
 * active title reports safe, preserving pre-guard behaviour.
 */
export function focusedWindowIsNexpathPopup(deps: {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  hasCommand?: (cmd: string) => boolean;
  runCapture?: (cmd: string, args: string[]) => string | null;
} = {}): boolean {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  if (platform !== 'linux') return false;
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return false;
  const has = deps.hasCommand ?? defaultHasCommand;
  const runCapture = deps.runCapture ?? defaultRunCapture;
  try {
    if (!has('xdotool')) return false;
    const title = runCapture('xdotool', ['getactivewindow', 'getwindowname']);
    if (!title) return false;
    return NEXPATH_POPUP_TITLE_MARKERS.some((m) => title.includes(m));
  } catch {
    return false;
  }
}

/** Capture a command's stdout (trimmed), or null on any failure. */
function defaultRunCapture(cmd: string, args: string[]): string | null {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 1500 });
    if (r.status !== 0) return null;
    return (r.stdout ?? '').trim() || null;
  } catch {
    return null;
  }
}

/**
 * ⚠ RC11 (live, 2026-08-13, owner report): with the RC10 no-focus raise, a
 * blacklist ("not one of our popups") was NOT enough — the synthetic Enter
 * fired while Windsurf's WELCOME view had focus and pressed its "Start
 * session" button, CLOSING the user's agent chat. A global Enter is only ever
 * safe when the EDITOR ITSELF is the focused window — so the guard is now a
 * WHITELIST: the active window's title must contain the target editor's name
 * ('Windsurf'/'Cursor'), and our popup titles are still excluded (a Nexpath
 * popup title also contains "Nexpath", never the bare editor name — but check
 * both to be explicit). Linux/X11 where the guard is implementable; other
 * platforms keep prior behaviour (no popup foregrounding there).
 */
export function focusedWindowIsEditor(host: 'windsurf' | 'cursor', deps: {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  hasCommand?: (cmd: string) => boolean;
  runCapture?: (cmd: string, args: string[]) => string | null;
  /** RC59: the LIVE `vscode.env.appName`, matched first — rebrands ("Devin",
   *  "Devin - Next", …) title their windows by the live name, not "Windsurf". */
  appName?: string;
} = {}): boolean {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  if (platform !== 'linux') return true; // no check possible; prior behaviour
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return false;
  const has = deps.hasCommand ?? defaultHasCommand;
  const runCapture = deps.runCapture ?? defaultRunCapture;
  try {
    if (!has('xdotool')) return true; // cannot check ⇒ prior behaviour
    const title = runCapture('xdotool', ['getactivewindow', 'getwindowname']);
    if (!title) return false;
    if (NEXPATH_POPUP_TITLE_MARKERS.some((m) => title.includes(m))) return false;
    // RC59 (Linux/Devin staging tester, 2026-08-24): the single 'windsurf'
    // needle refused the Enter on every Devin-BRANDED Linux install — the
    // window title is "… - Devin", no 'windsurf' substring, so this returned
    // false, the raise (class 'windsurf') also missed, and every submit ended
    // `submit_failed` in ~60 ms. The exact class RC47 fixed on win32
    // (AppActivate candidates), never ported to this Linux gate: the one
    // untested branding cell. Live appName leads; the static brand names
    // cover machines where it is not threaded.
    const needles = host === 'windsurf' ? ['windsurf', 'devin'] : ['cursor'];
    const appNeedle = deps.appName?.trim().toLowerCase();
    if (appNeedle && !needles.includes(appNeedle)) needles.unshift(appNeedle);
    const t = title.toLowerCase();
    return needles.some((n) => t.includes(n));
  } catch {
    return false; // cannot verify ⇒ do not press Enter blind
  }
}

/**
 * RC16: the last darwin submit-keystroke failure reason (osascript stderr,
 * trimmed). `null` until a darwin submit fails. Read by the extension to show
 * the one-time Accessibility guidance; PII-free (osascript's own error text).
 */
export let lastDarwinSubmitError: string | null = null;

/** True when the recorded darwin failure looks like the missing Accessibility permission. */
export function isDarwinAccessibilityDenial(err: string | null): boolean {
  if (!err) return false;
  return /assistive access|not authorized|1002|-25211|accessibility/i.test(err);
}

/** RC52: win32 keystroke-script spawn ceiling — cold Add-Type measured >8 s; warm ~0.8 s. */
export const WIN32_KEYSTROKE_TIMEOUT_MS = 20_000;

/**
 * RC65: the user32 Add-Type prelude, extracted so the activation pre-warm
 * compiles the BYTE-IDENTICAL C# source the real keystroke scripts use (the
 * cold cost being warmed is csc/.NET/Defender machine caches keyed off this
 * compile — a different source would warm nothing).
 */
export const WIN32_USER32_ADDTYPE =
  `Add-Type '[DllImport("user32.dll")]public static extern System.IntPtr GetForegroundWindow();[DllImport("user32.dll")]public static extern int GetWindowText(System.IntPtr h,System.Text.StringBuilder s,int n);' -Name U -Namespace W;`;

/**
 * RC65 (Windows/Cursor marketplace tester, 2026-08-25): the FIRST win32
 * keystroke of a session pays the cold Add-Type cost — RC52 measured 8025 ms
 * cold vs 805 ms warm, and the padal round's inject stage sat ~31 s with a
 * busy Cursor on top of it. The cost is machine-cache-shaped (csc.exe + .NET
 * assemblies into file cache, Defender's first scan of the compiled helper),
 * so ONE throwaway compile at activation warms every later spawn: the
 * delivery-path paste (^v) and submit ({ENTER}) then run warm even on the
 * session's first real popup.
 *
 * Fire-and-forget: activation is never blocked (async spawn, unref), every
 * failure is logged and swallowed — the worst case is exactly today's cold
 * first keystroke. Self-gated to win32; a no-op everywhere else.
 */
export function warmWin32KeystrokePath(
  logFn: (line: string) => void,
  deps: {
    platform?: NodeJS.Platform;
    now?: () => number;
    spawnFn?: (cmd: string, args: string[]) => {
      on: (ev: 'exit' | 'error', fn: (a?: unknown) => void) => unknown;
      unref?: () => void;
      kill?: () => void;
    };
  } = {},
): boolean {
  const platform = deps.platform ?? process.platform;
  if (platform !== 'win32') return false;
  try {
    const now = deps.now ?? Date.now;
    const start = now();
    const spawnFn = deps.spawnFn ?? ((cmd: string, args: string[]) =>
      spawn(cmd, args, { stdio: 'ignore', windowsHide: true }));
    const child = spawnFn('powershell', ['-NoProfile', '-Command', `${WIN32_USER32_ADDTYPE}exit 0`]);
    // Hygiene only: a hung PowerShell is inert (stdio ignored, unref'd), but
    // don't leave one per activation lying around forever.
    const reap = setTimeout(() => { try { child.kill?.(); } catch { /* already gone */ } }, 30_000);
    if (typeof (reap as { unref?: () => void }).unref === 'function') (reap as unknown as { unref: () => void }).unref();
    child.on('exit', (code) => {
      clearTimeout(reap as Parameters<typeof clearTimeout>[0]);
      logFn(`[nexpath] win32 keystroke pre-warm: compiler warmed in ${now() - start} ms (exit ${String(code ?? 'null')})`);
    });
    child.on('error', () => {
      clearTimeout(reap as Parameters<typeof clearTimeout>[0]);
      logFn('[nexpath] win32 keystroke pre-warm: spawn failed — the first real keystroke will pay the cold compile');
    });
    child.unref?.();
    return true;
  } catch {
    return false; // never let warming interfere with activation
  }
}

/**
 * RC49 — the shared win32 keystroke script: FOREGROUND-FIRST, then AppActivate.
 *
 * The Devin tester's RC47 toast proved AppActivate can fail even while the
 * editor is the foreground window: Windows' foreground lock refuses
 * SetForegroundWindow from a background process tree (our PowerShell child),
 * and AppActivate returns false REGARDLESS of the target already being
 * focused. But when the target IS focused, no activation is needed at all —
 * SendKeys types into the foreground. So: read the foreground title first;
 * if it ENDS WITH one of the candidates (editor windows are titled
 * "<file> - <folder> - Devin" — suffix matching also rejects a browser tab
 * like "Cursor docs - Chrome", which ends with "Chrome"), send directly.
 * Only when the editor is NOT foreground do the AppActivate rounds run —
 * and there the lock permits it more often, because the user has interacted
 * recently. On final failure, print the foreground title and exit 1.
 */
export function buildWin32KeystrokeScript(titles: readonly string[], sendKeys: string): string {
  const psTitles = titles.map((t) => `'${t.replace(/'/g, "''")}'`).join(',');
  return (
    WIN32_USER32_ADDTYPE +
    `$w=New-Object -ComObject WScript.Shell;` +
    `$b=New-Object System.Text.StringBuilder 256;[void][W.U]::GetWindowText([W.U]::GetForegroundWindow(),$b,256);$fg=$b.ToString();` +
    `$ok=$false;` +
    // RC60 (Windows/Devin staging tester, 2026-08-24): this Devin build titles
    // windows "<folder> - Devin - <session title>" — the app name sits MID-title,
    // so suffix-only matching refused a foreground window that WAS the editor
    // (FOREGROUND=testing - Devin - set up my food delivery app…; status=1).
    // Delimiter-safe containment (" - Devin - ") accepts every editor shape
    // (suffix, prefix-with-delimiter, mid-title) while still rejecting the
    // browser-tab hazard EndsWith was built for ("Cursor docs - Chrome" has no
    // delimited " - Cursor - " segment).
    `foreach($t in @(${psTitles})){if($fg -eq $t -or $fg.EndsWith($t) -or $fg.StartsWith($t + ' - ') -or $fg.Contains(' - ' + $t + ' - ')){$ok=$true;break}};` +
    `if(-not $ok){` +
    `foreach($r in 1..2){` +
    `foreach($t in @(${psTitles})){if($w.AppActivate($t)){$ok=$true;break}};` +
    `if($ok){break};Start-Sleep -Milliseconds 400};` +
    `if($ok){Start-Sleep -Milliseconds 120}};` +
    `if(-not $ok){Write-Output ("FOREGROUND=" + $fg);exit 1};` +
    `$w.SendKeys("${sendKeys}")`
  );
}

export function submitKeystroke(deps: SubmitKeystrokeDeps = {}): boolean {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  // RC10: never let the submit Enter land in one of our own popups.
  if ((deps.isPopupFocused ?? focusedWindowIsNexpathPopup)({ platform, env })) {
    return false;
  }
  // RC11: when a target host is named, Enter fires ONLY if that editor is the
  // focused window — a blind global Enter pressed Windsurf's "Start session"
  // button and closed the user's chat.
  if (deps.host) {
    const isEditorFocused = deps.isEditorFocused ?? focusedWindowIsEditor;
    const focusDeps = { platform, env, appName: deps.appName };
    if (!isEditorFocused(deps.host, focusDeps)) {
      deps.focusEditor?.();
      if (!isEditorFocused(deps.host, focusDeps)) {
        // RC59: name the refusing gate — the linux submit_failed used to be
        // indistinguishable from a missing tool (same one-line outcome).
        deps.submitLog?.(`[nexpath] submit-linux: editor not focused after raise (host=${deps.host}, appName=${deps.appName ?? 'unset'})`);
        return false;
      }
    }
  }
  // CORRECTED 2026-08-10 — these previously defaulted to `() => false`, which made
  // `submitKeystroke()` a guaranteed no-op in production: called with no deps (the
  // real wiring), it could never detect a tool or run one, so the submit key would
  // NEVER be sent while every unit test still passed. Exactly the "works in tests,
  // silently dead in production" class this milestone already had to disprove for
  // the env-var passthrough in H2. Defaults now spawn for real, matching the
  // shipped `pasteKeystroke` (`windsurf-autopaste.ts:63-64,83-84`) verbatim.
  const has = deps.hasCommand ?? defaultHasCommand;
  const run = deps.run ?? defaultRun;

  try {
    if (platform === 'darwin') {
      // RC16 (macOS tester, 2026-08-15): a System Events keystroke requires the
      // HOST APP (Devin/Windsurf/Cursor — the extension host's parent) to hold
      // the Accessibility permission. Without it osascript exits non-zero
      // ("not allowed assistive access") and the submit silently became
      // `submit_failed` with no guidance. The DEFAULT runner captures stderr so
      // the log names the real reason and the caller can detect the permission
      // case; an injected `deps.run` (tests) keeps the plain seam.
      if (deps.run) return deps.run('osascript', ['-e', 'tell application "System Events" to key code 36']);
      const res = spawnSync('osascript', ['-e', 'tell application "System Events" to key code 36'], {
        stdio: ['ignore', 'ignore', 'pipe'], timeout: 3000, encoding: 'utf8',
      });
      if (res.status === 0) return true;
      const err = (res.stderr ?? '').trim().slice(0, 160);
      lastDarwinSubmitError = err || `osascript exited ${res.status}`;
      return false;
    }
    if (platform === 'win32') {
      // ── RC28 (Windows/Devin tester, 2026-08-20) ──────────────────────────
      // `SendKeys` types into whatever window is FOREGROUND at that instant —
      // it has no target. On Linux the RC11 whitelist above guarantees the
      // editor is focused before we get here, but `focusedWindowIsEditor`
      // returns `true` unconditionally off Linux ("no check possible"), and
      // `focusEditor` → `raiseAppWindow` is X11-only and no-ops on Windows. So
      // nothing had ever focused the editor: the tester's log shows
      // `submit dispatched` on BOTH turns while nothing was actually submitted.
      //
      // `AppActivate` is WScript.Shell's own targeting call and the standard
      // pairing for SendKeys. Activate FIRST, and only press Enter if it
      // reports success — so a failed activation now reports `submit_failed`
      // instead of firing a blind Enter into an unknown window (the RC11
      // hazard, which on Windows was previously unguarded).
      //
      // Title candidates, in order. The rebrand matters: this tester's app
      // reports `appName="Devin"`, so matching only 'Windsurf' would miss the
      // very machine this fixes. AppActivate matches a title PREFIX or
      // substring, so the bare product name is the right granularity.
      const hostTitles = deps.host === 'cursor' ? ['Cursor'] : ['Devin', 'Windsurf'];
      // RC47: the live appName leads (AppActivate + suffix matching are
      // exact/prefix/suffix — "Devin Next" misses the bare product names).
      const titles = [...new Set([deps.appName?.trim(), ...hostTitles].filter((t): t is string => !!t))];
      // RC49: foreground-first — see buildWin32KeystrokeScript.
      const ps = buildWin32KeystrokeScript(titles, '{ENTER}');
      if (deps.run) return deps.run('powershell', ['-NoProfile', '-Command', ps]);
      // RC52 (Windows tester 2026-08-24): the FIRST submit of a session took
      // 8025 ms — the old 8000 ms timeout killed PowerShell mid Add-Type
      // (cold C# compile + Defender scan on first run); the second, warm call
      // took 805 ms and delivered. 20 s covers the cold start; warm calls are
      // sub-second so the ceiling is never felt.
      const res = spawnSync('powershell', ['-NoProfile', '-Command', ps], {
        stdio: ['ignore', 'pipe', 'ignore'], timeout: WIN32_KEYSTROKE_TIMEOUT_MS, encoding: 'utf8',
      });
      if (res.status === 0) return true;
      const fg = (res.stdout ?? '').split('\n').find((l) => l.startsWith('FOREGROUND=')) ?? 'FOREGROUND=<unreadable>';
      // RC52: name HOW it failed — status null + SIGTERM is the timeout kill,
      // distinct from the script's own exit 1 (no matching window).
      deps.submitLog?.(`[nexpath] submit-win32: editor not foreground and AppActivate failed for [${titles.join(', ')}]; ${fg.trim()}; status=${res.status ?? 'null'} signal=${res.signal ?? 'none'}`);
      return false;
    }
    // Linux (X11, or Wayland with a compatible tool)
    if (!env.DISPLAY && !env.WAYLAND_DISPLAY) {
      deps.submitLog?.('[nexpath] submit-linux: no DISPLAY/WAYLAND_DISPLAY in env');
      return false;
    }
    if (has('xdotool')) return run('xdotool', ['key', '--clearmodifiers', 'Return']);
    if (has('wtype')) return run('wtype', ['-k', 'Return']);
    if (has('ydotool')) return run('ydotool', ['key', '28:1', '28:0']); // KEY_ENTER
    // RC59: the silent false here looked identical to the focus refusal.
    deps.submitLog?.('[nexpath] submit-linux: no keystroke tool found (xdotool/wtype/ydotool)');
    return false;
  } catch {
    return false;
  }
}

/**
 * RC61 (Windows/Devin staging tester, 2026-08-24): when the agent session is
 * busy or reconnecting at submit time ("Navigating.. Connecting to server"),
 * Devin ACCEPTS the submitted replacement but parks it as "1 queued message" —
 * and this build's queue does not auto-flush: the composer's own placeholder
 * reads "Enter to send queued message (⏎)". The tester had to press that
 * Enter by hand.
 *
 * This schedules exactly ONE follow-up Enter after a DELIVERED submit: if the
 * message ran normally the composer is empty and the tap is a no-op (Cascade
 * ignores Enter on an empty input); if it queued, the tap is the flush the UI
 * asks for. The tap goes through the SAME `submitKeystroke` guards — the RC10
 * popup-focus refusal, the RC11/RC59 editor-focus whitelist, the RC49/60
 * win32 foreground script — and the RC43/46 quiet windows guarantee no
 * Nexpath popup can be open this soon after a block, so the Enter cannot land
 * anywhere but the editor's composer. Windsurf/Devin only — Cursor has no
 * queue affordance and has never needed it.
 */
export const WINDSURF_QUEUE_FLUSH_DELAY_MS = 2_500;

export function scheduleWindsurfQueueFlush(
  submitFn: () => boolean,
  log: (line: string) => void,
  delayMs: number = WINDSURF_QUEUE_FLUSH_DELAY_MS,
  setTimeoutFn: (fn: () => void, ms: number) => unknown = setTimeout,
): void {
  setTimeoutFn(() => {
    try {
      const ok = submitFn();
      log(`[nexpath] submit-queue-flush: ${ok ? 'tapped' : 'skipped (guards refused)'} — no-op if nothing was queued`);
    } catch {
      log('[nexpath] submit-queue-flush: threw (ignored)');
    }
  }, delayMs);
}
