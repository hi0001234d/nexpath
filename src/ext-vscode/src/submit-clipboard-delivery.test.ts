/**
 * H3 Q3 — the clipboard fallback, built FIRST per the owner's `G-POLICY` ruling
 * because it carries no reverse-engineering exposure.
 *
 * Two things these tests exist to pin, both from H1's empirical findings:
 *   1. inject and submit are SEPARATE steps (neither platform auto-submits);
 *   2. focus is an explicit precondition of submit, not an incidental detail.
 * Plus the cross-OS matrix required by §2.4b from the first commit — macOS,
 * Windows, Linux/X11 and Linux/Wayland, none of which can be tested on real
 * hardware here (`G-HARDWARE`), so the command each OS would run is pinned instead.
 */
import { describe, it, expect, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  createSubmitClipboardDelivery,
  submitKeystroke,
  focusedWindowIsNexpathPopup,
  focusedWindowIsEditor,
  type SubmitClipboardDeliveryDeps,
  isDarwinAccessibilityDenial,
  buildWin32KeystrokeScript,
  WIN32_KEYSTROKE_TIMEOUT_MS,
  scheduleWindsurfQueueFlush,
  warmWin32KeystrokePath,
  WIN32_USER32_ADDTYPE,
} from './submit-clipboard-delivery.js';

function deliveryHarness(over: Partial<SubmitClipboardDeliveryDeps> = {}) {
  const deps: SubmitClipboardDeliveryDeps = {
    writeClipboard: vi.fn().mockResolvedValue(undefined),
    focus: vi.fn().mockResolvedValue(true),
    pasteKeystroke: vi.fn().mockReturnValue(true),
    submitKeystroke: vi.fn().mockReturnValue(true),
    ...over,
  };
  return { deps, d: createSubmitClipboardDelivery(deps) };
}

describe('inject — clipboard → focus → paste, in that order', () => {
  it('performs all three steps and reports success', async () => {
    const h = deliveryHarness();
    await expect(h.d.inject('picked option')).resolves.toBe(true);
    expect(h.deps.writeClipboard).toHaveBeenCalledWith('picked option');
    expect(h.deps.focus).toHaveBeenCalled();
    expect(h.deps.pasteKeystroke).toHaveBeenCalled();
  });

  it('focuses BEFORE pasting — H1 proved delivery depends on focus state', async () => {
    const order: string[] = [];
    const h = deliveryHarness({
      focus: vi.fn().mockImplementation(async () => { order.push('focus'); return true; }),
      pasteKeystroke: vi.fn().mockImplementation(() => { order.push('paste'); return true; }),
    });
    await h.d.inject('x');
    expect(order).toEqual(['focus', 'paste']);
  });

  it('refuses an empty replacement — pasting "" would clear the composer and lose the turn', async () => {
    const h = deliveryHarness();
    await expect(h.d.inject('')).resolves.toBe(false);
    expect(h.deps.writeClipboard).not.toHaveBeenCalled();
    expect(h.deps.pasteKeystroke).not.toHaveBeenCalled();
  });

  it('does not paste when the clipboard write fails — never paste stale content', async () => {
    const h = deliveryHarness({ writeClipboard: vi.fn().mockRejectedValue(new Error('no clipboard')) });
    await expect(h.d.inject('x')).resolves.toBe(false);
    expect(h.deps.pasteKeystroke).not.toHaveBeenCalled();
  });

  it('still attempts the paste when focus is unconfirmed — the composer may already hold focus', async () => {
    const h = deliveryHarness({ focus: vi.fn().mockResolvedValue(false) });
    await expect(h.d.inject('x')).resolves.toBe(true);
    expect(h.deps.pasteKeystroke).toHaveBeenCalled();
  });

  it('treats a throwing focus as unconfirmed rather than fatal', async () => {
    const h = deliveryHarness({ focus: vi.fn().mockRejectedValue(new Error('no wm')) });
    await expect(h.d.inject('x')).resolves.toBe(true);
  });

  it('reports false — never throws — when the paste keystroke throws', async () => {
    const h = deliveryHarness({ pasteKeystroke: vi.fn(() => { throw new Error('no xdotool'); }) });
    await expect(h.d.inject('x')).resolves.toBe(false);
  });

  it('never logs the replacement text (BUG-VEDANSI-AR9-G1)', async () => {
    const lines: string[] = [];
    const h = deliveryHarness({ log: (m) => lines.push(m) });
    await h.d.inject('ZZQX_LEAK_MARKER_7741');
    expect(lines.join('\n')).not.toContain('ZZQX_LEAK_MARKER_7741');
    expect(lines.length).toBeGreaterThan(0);
  });
});

describe('submit — a genuinely separate step', () => {
  it('sends the submit keystroke and reports success', async () => {
    const h = deliveryHarness();
    await expect(h.d.submit()).resolves.toBe(true);
    expect(h.deps.submitKeystroke).toHaveBeenCalled();
  });

  it('reports false when the keystroke tool is unavailable', async () => {
    const h = deliveryHarness({ submitKeystroke: vi.fn().mockReturnValue(false) });
    await expect(h.d.submit()).resolves.toBe(false);
  });

  it('reports false — never throws — when the keystroke throws', async () => {
    const h = deliveryHarness({ submitKeystroke: vi.fn(() => { throw new Error('boom'); }) });
    await expect(h.d.submit()).resolves.toBe(false);
  });

  it('inject does not submit, and submit does not inject', async () => {
    const h = deliveryHarness();
    await h.d.inject('x');
    expect(h.deps.submitKeystroke).not.toHaveBeenCalled();
    await h.d.submit();
    expect(h.deps.pasteKeystroke).toHaveBeenCalledTimes(1);
  });
});

describe('submitKeystroke — cross-OS matrix (§2.4b), pinned per platform', () => {
  it('macOS uses osascript key code 36 (Return)', () => {
    const run = vi.fn().mockReturnValue(true);
    expect(submitKeystroke({ isPopupFocused: () => false, platform: 'darwin', run })).toBe(true);
    expect(run).toHaveBeenCalledWith('osascript', [
      '-e', 'tell application "System Events" to key code 36',
    ]);
  });

  it('Windows uses PowerShell SendKeys {ENTER}', () => {
    const run = vi.fn().mockReturnValue(true);
    expect(submitKeystroke({ isPopupFocused: () => false, platform: 'win32', run })).toBe(true);
    expect(run.mock.calls[0][0]).toBe('powershell');
    expect(String(run.mock.calls[0][1])).toContain('{ENTER}');
  });

  // ── RC28 (Windows/Devin tester, 2026-08-20) ────────────────────────────
  // SendKeys has no target — it types into whatever is FOREGROUND. The RC11
  // whitelist that guarantees editor focus on Linux is a no-op off Linux
  // (`focusedWindowIsEditor` returns true), and `raiseAppWindow` is X11-only,
  // so nothing had ever focused the editor: the tester's log recorded
  // `submit dispatched` on both turns while nothing was submitted.
  it('⭐ RC28 — Windows ACTIVATES the editor window before pressing Enter', () => {
    const run = vi.fn().mockReturnValue(true);
    expect(submitKeystroke({ isPopupFocused: () => false, platform: 'win32', host: 'windsurf', run })).toBe(true);
    const script = String(run.mock.calls[0][1]);
    expect(script).toContain('AppActivate');
    // Activation must come BEFORE the keystroke, or it targets the old window.
    expect(script.indexOf('AppActivate')).toBeLessThan(script.indexOf('SendKeys'));
  });

  it('⭐ RC28 — the Devin rebrand is covered (the tester\'s app reports appName="Devin")', () => {
    const run = vi.fn().mockReturnValue(true);
    submitKeystroke({ isPopupFocused: () => false, platform: 'win32', host: 'windsurf', run });
    const script = String(run.mock.calls[0][1]);
    expect(script).toContain("'Devin'");
    expect(script).toContain("'Windsurf'");
  });

  it('RC28 — the cursor host activates Cursor, not Windsurf/Devin', () => {
    const run = vi.fn().mockReturnValue(true);
    submitKeystroke({ isPopupFocused: () => false, platform: 'win32', host: 'cursor', run });
    const script = String(run.mock.calls[0][1]);
    expect(script).toContain("'Cursor'");
    expect(script).not.toContain("'Devin'");
  });

  it('RC28 — a failed activation reports submit_failed instead of a blind Enter', () => {
    // The script exits 1 when no title activates; defaultRun maps non-zero to
    // false, so the caller logs `submit failed` rather than "dispatched".
    const run = vi.fn().mockReturnValue(false);
    expect(submitKeystroke({ isPopupFocused: () => false, platform: 'win32', host: 'windsurf', run })).toBe(false);
    expect(String(run.mock.calls[0][1])).toContain('exit 1');
  });

  it('RC28 did NOT change the darwin or linux branches (no AppActivate there)', () => {
    // `isEditorFocused` is stubbed so the RC11 whitelist (which would otherwise
    // shell out to the real xdotool) cannot short-circuit before `run`.
    const mac = vi.fn().mockReturnValue(true);
    submitKeystroke({ isPopupFocused: () => false, platform: 'darwin', host: 'windsurf',
      isEditorFocused: () => true, run: mac });
    expect(String(mac.mock.calls[0][1])).not.toContain('AppActivate');
    const lin = vi.fn().mockReturnValue(true);
    submitKeystroke({ isPopupFocused: () => false, platform: 'linux', host: 'windsurf',
      isEditorFocused: () => true,
      env: { DISPLAY: ':1' }, hasCommand: (c: string) => c === 'xdotool', run: lin });
    expect(String(lin.mock.calls[0][1])).not.toContain('AppActivate');
  });

  it('Linux/X11 prefers xdotool', () => {
    const run = vi.fn().mockReturnValue(true);
    const ok = submitKeystroke({ isPopupFocused: () => false, platform: 'linux', env: { DISPLAY: ':1' }, hasCommand: (c) => c === 'xdotool', run,
    });
    expect(ok).toBe(true);
    expect(run).toHaveBeenCalledWith('xdotool', ['key', '--clearmodifiers', 'Return']);
  });

  it('Linux/Wayland falls back to wtype when xdotool is absent', () => {
    const run = vi.fn().mockReturnValue(true);
    submitKeystroke({ isPopupFocused: () => false, platform: 'linux', env: { WAYLAND_DISPLAY: 'wayland-0' },
      hasCommand: (c) => c === 'wtype', run,
    });
    expect(run).toHaveBeenCalledWith('wtype', ['-k', 'Return']);
  });

  it('Linux falls back to ydotool as the last option', () => {
    const run = vi.fn().mockReturnValue(true);
    submitKeystroke({ isPopupFocused: () => false, platform: 'linux', env: { DISPLAY: ':1' },
      hasCommand: (c) => c === 'ydotool', run,
    });
    expect(run.mock.calls[0][0]).toBe('ydotool');
  });

  it('returns false on Linux with NO display — nothing to type into', () => {
    const run = vi.fn();
    expect(submitKeystroke({ isPopupFocused: () => false, platform: 'linux', env: {}, hasCommand: () => true, run })).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('returns false on Linux when no keystroke tool is installed', () => {
    expect(submitKeystroke({ isPopupFocused: () => false, platform: 'linux', env: { DISPLAY: ':1' }, hasCommand: () => false, run: vi.fn(),
    })).toBe(false);
  });

  it('never throws when the runner throws', () => {
    expect(submitKeystroke({ isPopupFocused: () => false, platform: 'darwin', run: () => { throw new Error('spawn failed'); },
    })).toBe(false);
  });

  // ── The production default path ────────────────────────────────────────────
  // Every test above injects `hasCommand`/`run`, which left the REAL defaults
  // uncovered — and they were wrong: both defaulted to `() => false`, making
  // `submitKeystroke()` a guaranteed no-op in production while the whole suite
  // stayed green. Same "works in tests, silently dead in production" class this
  // milestone already had to disprove for H2's env passthrough. These tests pin
  // the defaults so the regression cannot return.
  it('uses REAL default detection when hasCommand/run are not injected', () => {
    // On this Linux box with a display, `which xdotool` genuinely resolves. The
    // point is not the return value but that the defaults actually execute
    // instead of short-circuiting to false.
    const calls: string[] = [];
    // RC48-era fix (Bhavnesh §8.4): this case exercises the REAL default
    // detector, which shells out to `which` — on a host with no keystroke tool
    // installed (Windows/macOS checkouts, minimal CI) no tool can match and the
    // assertion is about the HOST, not the code. Skip honestly there.
    const anyTool = ['xdotool', 'wtype', 'ydotool'].some((t) => {
      try { return spawnSync('which', [t], { stdio: 'ignore', timeout: 2000 }).status === 0; } catch { return false; }
    });
    if (!anyTool) return; // host has no tool — nothing real to probe
    const result = submitKeystroke({ isPopupFocused: () => false, platform: 'linux',
      env: { DISPLAY: ':1' },
      // hasCommand intentionally NOT injected — exercise the real default.
      run: (cmd) => { calls.push(cmd); return true; },
    });
    // If the default detector were `() => false`, no tool would ever match and
    // `run` would never be called, so this array would be empty.
    expect(calls.length).toBeGreaterThan(0);
    expect(result).toBe(true);
  });

  it('the default runner is a real spawner, not a false-returning stub', () => {
    // Detect a command that certainly does not exist: the default detector must
    // return false for it (proving it really probes), and no tool then matches.
    const ok = submitKeystroke({ isPopupFocused: () => false, platform: 'linux',
      env: { DISPLAY: ':1' },
      hasCommand: (c) => c === 'definitely-not-a-real-binary-xyz',
      // run intentionally NOT injected — the real default would be reached only
      // if a tool matched; none does, so this must be false without throwing.
    });
    expect(ok).toBe(false);
  });
});

/**
 * ⚠ RC10 — phantom-Enter guard (live root cause, captured in hex 2026-08-13):
 * two synthetic \r bytes landed in a foregrounded Nexpath popup ~one poller
 * tick after it opened, auto-"selecting" it. The submit Enter must never fire
 * while one of our own popups holds focus.
 */
describe('⭐ RC10 — submit Enter never fires into a Nexpath popup', () => {
  it('refuses to send when a popup is focused (no tool is even invoked)', () => {
    const run = vi.fn(() => true);
    const ok = submitKeystroke({
      isPopupFocused: () => true,
      platform: 'linux',
      env: { DISPLAY: ':1' },
      hasCommand: () => true,
      run,
    });
    expect(ok).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('sends normally when the editor is focused', () => {
    const run = vi.fn(() => true);
    const ok = submitKeystroke({
      isPopupFocused: () => false,
      platform: 'linux',
      env: { DISPLAY: ':1' },
      hasCommand: (c: string) => c === 'xdotool',
      run,
    });
    expect(ok).toBe(true);
    expect(run).toHaveBeenCalledWith('xdotool', ['key', '--clearmodifiers', 'Return']);
  });

  it('focusedWindowIsNexpathPopup matches our titles and only ours', () => {
    const probe = (title: string | null) => focusedWindowIsNexpathPopup({
      platform: 'linux', env: { DISPLAY: ':1' },
      hasCommand: () => true, runCapture: () => title,
    });
    expect(probe('Nexpath — Action Required')).toBe(true);
    expect(probe('emptyops Nexpath · Prompt enhancement')).toBe(true);
    expect(probe('Nexpath — Feedback')).toBe(true);
    expect(probe('nexpath - Windsurf')).toBe(false);   // the EDITOR, not a popup
    expect(probe('some terminal')).toBe(false);
    expect(probe(null)).toBe(false);                    // unreadable ⇒ safe
  });

  it('non-Linux platforms skip the check entirely (no popups foregrounded there)', () => {
    expect(focusedWindowIsNexpathPopup({ platform: 'darwin' })).toBe(false);
    expect(focusedWindowIsNexpathPopup({ platform: 'win32' })).toBe(false);
  });
});

/**
 * ⚠ RC11 (live, 2026-08-13): with the no-focus raise, a blind global Enter
 * pressed Windsurf's WELCOME "Start session" button and CLOSED the user's
 * chat. Whitelist: when a host is named, Enter fires only when that editor's
 * window is focused (with one focusEditor retry).
 */
describe('⭐ RC11 — submit Enter fires only when the EDITOR is focused', () => {
  const base = { platform: 'linux' as const, env: { DISPLAY: ':1' }, hasCommand: () => true, isPopupFocused: () => false };

  it('editor focused ⇒ sends', () => {
    const run = vi.fn(() => true);
    const ok = submitKeystroke({ ...base, run, host: 'windsurf', isEditorFocused: () => true });
    expect(ok).toBe(true);
    expect(run).toHaveBeenCalled();
  });

  it('editor NOT focused ⇒ one focusEditor retry, then sends if focused', () => {
    const run = vi.fn(() => true);
    const focusEditor = vi.fn();
    let focused = false;
    const ok = submitKeystroke({
      ...base, run, host: 'windsurf', focusEditor: () => { focusEditor(); focused = true; },
      isEditorFocused: () => focused,
    });
    expect(focusEditor).toHaveBeenCalledTimes(1);
    expect(ok).toBe(true);
  });

  it('editor stays unfocused ⇒ NO Enter at all (never press a blind Enter)', () => {
    const run = vi.fn(() => true);
    const ok = submitKeystroke({ ...base, run, host: 'cursor', focusEditor: () => {}, isEditorFocused: () => false });
    expect(ok).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('no host named ⇒ pre-RC11 behaviour (other callers unaffected)', () => {
    const run = vi.fn(() => true);
    const ok = submitKeystroke({ ...base, run, hasCommand: (c: string) => c === 'xdotool' });
    expect(ok).toBe(true);
  });

  it('focusedWindowIsEditor: editor titles pass, popups and strangers fail', () => {
    const probe = (host: 'windsurf' | 'cursor', title: string | null) => focusedWindowIsEditor(host, {
      platform: 'linux', env: { DISPLAY: ':1' }, hasCommand: () => true, runCapture: () => title,
    });
    expect(probe('windsurf', 'nexpath - Windsurf')).toBe(true);
    expect(probe('cursor', 'nexpath - Cursor')).toBe(true);
    expect(probe('windsurf', 'Nexpath — Action Required')).toBe(false); // our popup
    expect(probe('windsurf', 'Mozilla Firefox')).toBe(false);
    expect(probe('windsurf', null)).toBe(false);                        // unreadable ⇒ no blind Enter
    expect(probe('cursor', 'nexpath - Windsurf')).toBe(false);          // wrong editor
  });
});

/**
 * RC16 (macOS tester, 2026-08-15): the darwin auto-send keystroke needs the
 * Accessibility permission; without it osascript fails and the outcome was a
 * bare `submit_failed` with no guidance. Pin the denial matcher so the
 * extension can route the actionable hint.
 */
describe('⭐ RC16 — darwin Accessibility denial detection', () => {
  it('recognises the classic osascript assistive-access errors', () => {
    expect(isDarwinAccessibilityDenial('osascript is not allowed assistive access. (-25211)')).toBe(true);
    expect(isDarwinAccessibilityDenial('execution error: System Events got an error: osascript is not allowed to send keystrokes. (1002)')).toBe(true);
  });
  it('does not flag unrelated failures or null', () => {
    expect(isDarwinAccessibilityDenial('osascript exited 1')).toBe(false);
    expect(isDarwinAccessibilityDenial(null)).toBe(false);
  });
});

/**
 * ⭐ RC47 — win32 submit hardening (Windows tester 2026-08-22: AppActivate
 * failed for both 'Devin' and 'Windsurf' while the window was open, Enter never
 * fired, the refined text stranded silently).
 */
describe('⭐ RC47 — win32 AppActivate candidates + retry', () => {
  const runSpy = () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    return { calls, run: (cmd: string, args: string[]) => { calls.push({ cmd, args }); return true; } };
  };

  it('⭐ the live appName leads the candidate list (rebrand coverage)', () => {
    const { calls, run } = runSpy();
    submitKeystroke({
      platform: 'win32', host: 'windsurf', appName: 'Devin Next', run,
      isPopupFocused: () => false, isEditorFocused: () => true,
    });
    const ps = calls[0]!.args.join(' ');
    expect(ps.indexOf("'Devin Next'")).toBeGreaterThan(-1);
    expect(ps.indexOf("'Devin Next'")).toBeLessThan(ps.indexOf("'Devin'"));
    expect(ps).toContain("'Windsurf'");
  });

  it('two activation rounds with a pause (foreground-lock release window)', () => {
    const { calls, run } = runSpy();
    submitKeystroke({
      platform: 'win32', host: 'cursor', appName: 'Cursor', run,
      isPopupFocused: () => false, isEditorFocused: () => true,
    });
    const ps = calls[0]!.args.join(' ');
    expect(ps).toContain('foreach($r in 1..2)');
    expect(ps).toContain('Start-Sleep -Milliseconds 400');
  });

  it('duplicate appName==host title is deduped', () => {
    const { calls, run } = runSpy();
    submitKeystroke({
      platform: 'win32', host: 'cursor', appName: 'Cursor', run,
      isPopupFocused: () => false, isEditorFocused: () => true,
    });
    const ps = calls[0]!.args.join(' ');
    // The builder embeds the candidate list twice (foreground check + activate
    // rounds) — a deduped single candidate appears exactly 2×; a duplicated
    // candidate would appear 4×.
    expect(ps.match(/'Cursor'/g)?.length).toBe(2);
  });
});

/**
 * ⭐ RC49 — foreground-first win32 keystrokes. The Devin tester's RC47 toast
 * proved AppActivate can fail while the editor IS foreground (Windows'
 * foreground lock refuses background callers). When the target is already
 * focused, no activation is needed — send directly.
 */
describe('⭐ RC49 — buildWin32KeystrokeScript', () => {
  it('⭐ checks the FOREGROUND title before any AppActivate', () => {
    const ps = buildWin32KeystrokeScript(['Devin Next', 'Devin'], '{ENTER}');
    expect(ps.indexOf('GetForegroundWindow')).toBeLessThan(ps.indexOf('AppActivate'));
    expect(ps).toContain('$fg.EndsWith($t)');
  });
  it('delimiter-safe matching (RC60 flip): mid-title app names match, bare substrings do not', () => {
    // FLIPPED 2026-08-24 (RC60): the original pin asserted suffix-ONLY ("not
    // substring") — which refused a real Devin foreground window titled
    // "<folder> - Devin - <session>". The browser-tab hazard is still guarded:
    // matching requires the delimited segment " - <name> - ", a start
    // "<name> - ", an exact match, or the original suffix — never a bare
    // substring anywhere in the title.
    const ps = buildWin32KeystrokeScript(['Devin'], '{ENTER}');
    expect(ps).toContain("$fg.EndsWith($t)");
    expect(ps).toContain("$fg.StartsWith($t + ' - ')");
    expect(ps).toContain("$fg.Contains(' - ' + $t + ' - ')");
  });
  it('keeps the retry rounds and the FOREGROUND diagnostic', () => {
    const ps = buildWin32KeystrokeScript(['Devin'], '{ENTER}');
    expect(ps).toContain('foreach($r in 1..2)');
    expect(ps).toContain('Write-Output ("FOREGROUND=" + $fg)');
  });
  it('quotes are PowerShell-escaped', () => {
    expect(buildWin32KeystrokeScript(["O'Brien's Editor"], '^v')).toContain("'O''Brien''s Editor'");
  });
});

/** ⭐ RC52 — the cold-start ceiling (Windows tester 2026-08-24: first submit killed at 8 s mid Add-Type; warm run 0.8 s delivered). */
describe('⭐ RC52 — win32 keystroke timeout', () => {
  it('the shared ceiling covers a cold Add-Type compile (>8 s measured)', () => {
    expect(WIN32_KEYSTROKE_TIMEOUT_MS).toBeGreaterThanOrEqual(20_000);
  });
});

/**
 * ⭐ RC59 — the Linux Devin-branding gate (staging tester 2026-08-24): the
 * single 'windsurf' needle refused Enter on every Devin-branded Linux install
 * (title "… - Devin"). The RC47 class, ported to the Linux gate at last:
 * live appName leads, static brand names cover unthreaded callers.
 */
describe('⭐ RC59 — focusedWindowIsEditor brand needles', () => {
  const deps = (title: string, appName?: string) => ({
    platform: 'linux' as const, env: { DISPLAY: ':0' },
    hasCommand: () => true, runCapture: () => title, appName,
  });

  it('⭐ the tester\'s exact failing title now passes for host windsurf', () => {
    expect(focusedWindowIsEditor('windsurf', deps('nexpath testing - Devin'))).toBe(true);
  });

  it('Windsurf-branded titles keep passing (owner-machine regression pin)', () => {
    expect(focusedWindowIsEditor('windsurf', deps('nexpath - Windsurf'))).toBe(true);
  });

  it('live appName leads — a future rebrand matches without a code change', () => {
    expect(focusedWindowIsEditor('windsurf', deps('proj - Cascade IDE', 'Cascade IDE'))).toBe(true);
  });

  it('unrelated windows still refuse (the RC11 hazard stays guarded)', () => {
    expect(focusedWindowIsEditor('windsurf', deps('bank statement - Chrome'))).toBe(false);
  });

  it('cursor host is unaffected by the windsurf needles', () => {
    expect(focusedWindowIsEditor('cursor', deps('proj - Devin'))).toBe(false);
    expect(focusedWindowIsEditor('cursor', deps('proj - Cursor'))).toBe(true);
  });

  it('⭐ the linux submit failure now NAMES its gate via submitLog', () => {
    const logs: string[] = [];
    submitKeystroke({
      platform: 'linux', host: 'windsurf', appName: 'Devin',
      env: { DISPLAY: ':0' },
      isPopupFocused: () => false,
      isEditorFocused: () => false, focusEditor: () => {},
      submitLog: (m) => logs.push(m),
    });
    expect(logs.join(' ')).toContain('editor not focused after raise');
    expect(logs.join(' ')).toContain('appName=Devin');
  });
});

/**
 * ⭐ RC61 — the Devin queue-flush tap: a busy/reconnecting session parks a
 * delivered submit as "1 queued message" that only a further Enter sends
 * (the composer's own placeholder says so). One guarded tap, no-op when
 * nothing queued.
 */
describe('⭐ RC61 — scheduleWindsurfQueueFlush', () => {
  it('⭐ fires the submit fn exactly once after the delay, through the caller\'s guards', () => {
    let fired = 0; const logs: string[] = [];
    let scheduled: (() => void) | null = null; let delay = 0;
    scheduleWindsurfQueueFlush(
      () => { fired += 1; return true; },
      (l) => logs.push(l),
      2_500,
      (fn, ms) => { scheduled = fn as () => void; delay = ms; return 0; },
    );
    expect(fired).toBe(0);          // nothing before the delay
    expect(delay).toBe(2_500);
    scheduled!();
    expect(fired).toBe(1);
    expect(logs.join(' ')).toContain('submit-queue-flush: tapped');
  });

  it('guards refusing ⇒ logged as skipped, never retried', () => {
    const logs: string[] = [];
    let scheduled: (() => void) | null = null;
    scheduleWindsurfQueueFlush(() => false, (l) => logs.push(l), 1, (fn) => { scheduled = fn as () => void; return 0; });
    scheduled!();
    expect(logs.join(' ')).toContain('skipped (guards refused)');
  });

  it('a throwing submit fn is swallowed (the flush is best-effort)', () => {
    const logs: string[] = [];
    let scheduled: (() => void) | null = null;
    scheduleWindsurfQueueFlush(() => { throw new Error('boom'); }, (l) => logs.push(l), 1, (fn) => { scheduled = fn as () => void; return 0; });
    expect(() => scheduled!()).not.toThrow();
    expect(logs.join(' ')).toContain('threw (ignored)');
  });
});

/**
 * ⭐ RC65 — the activation pre-warm (Windows/Cursor marketplace tester,
 * 2026-08-25: the inject stage sat 31.7 s on the session's FIRST keystroke —
 * RC52's cold Add-Type compile plus a busy Cursor). One throwaway compile at
 * activation warms the machine caches; correctness rests on the warmup
 * compiling the BYTE-IDENTICAL source the real scripts use.
 */
describe('⭐ RC65 — warmWin32KeystrokePath', () => {
  function fakeChild() {
    const handlers = new Map<string, (a?: unknown) => void>();
    return {
      handlers,
      on: (ev: 'exit' | 'error', fn: (a?: unknown) => void) => { handlers.set(ev, fn); },
      unref: vi.fn(),
      kill: vi.fn(),
    };
  }

  it('⭐ the real keystroke scripts START with the warmed Add-Type source (byte-identity)', () => {
    expect(buildWin32KeystrokeScript(['Cursor'], '^v').startsWith(WIN32_USER32_ADDTYPE)).toBe(true);
    expect(buildWin32KeystrokeScript(['Devin'], '{ENTER}').startsWith(WIN32_USER32_ADDTYPE)).toBe(true);
  });

  it('⭐ win32: spawns ONE powershell that compiles the helper and sends NO keys', () => {
    const child = fakeChild();
    const spawns: Array<{ cmd: string; args: string[] }> = [];
    const ok = warmWin32KeystrokePath(() => {}, {
      platform: 'win32',
      spawnFn: (cmd, args) => { spawns.push({ cmd, args }); return child; },
    });
    expect(ok).toBe(true);
    expect(spawns).toHaveLength(1);
    expect(spawns[0]!.cmd).toBe('powershell');
    const script = spawns[0]!.args.join(' ');
    expect(script).toContain(WIN32_USER32_ADDTYPE);
    expect(script).toContain('exit 0');
    expect(script).not.toContain('SendKeys');
    expect(script).not.toContain('AppActivate');
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it('non-win32: a no-op — nothing spawns', () => {
    const spawnFn = vi.fn();
    expect(warmWin32KeystrokePath(() => {}, { platform: 'linux', spawnFn })).toBe(false);
    expect(warmWin32KeystrokePath(() => {}, { platform: 'darwin', spawnFn })).toBe(false);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('logs the warm duration on exit', () => {
    const child = fakeChild();
    const logs: string[] = [];
    let t = 1_000;
    warmWin32KeystrokePath((l) => logs.push(l), {
      platform: 'win32', now: () => t, spawnFn: () => child,
    });
    t = 8_025;
    child.handlers.get('exit')!(0);
    expect(logs.join(' ')).toContain('pre-warm: compiler warmed in 7025 ms (exit 0)');
  });

  it('spawn error is logged and swallowed (worst case = today\'s cold first keystroke)', () => {
    const child = fakeChild();
    const logs: string[] = [];
    warmWin32KeystrokePath((l) => logs.push(l), { platform: 'win32', spawnFn: () => child });
    child.handlers.get('error')!(new Error('powershell missing'));
    expect(logs.join(' ')).toContain('pre-warm: spawn failed');
  });

  it('a throwing spawn never breaks activation', () => {
    expect(warmWin32KeystrokePath(() => {}, {
      platform: 'win32', spawnFn: () => { throw new Error('EPERM'); },
    })).toBe(false);
  });
});
