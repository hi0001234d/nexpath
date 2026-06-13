/**
 * Bring the Layer-C advisory popup window to the foreground — Linux only.
 *
 * The decision-session popup is a SEPARATE OS window opened by `nexpath stop`
 * (Layer C, untouched). macOS and Windows already foreground it at launch:
 *   - macOS:   `osascript … tell application "Terminal" activate`
 *   - Windows: `cmd /c start …`  (ShellExecuteEx → SW_SHOWNORMAL)
 * Linux's `gnome-terminal` (and the other emulators) have NO equivalent "raise"
 * flag, so under GNOME's focus-stealing prevention the window opens BEHIND the
 * focused editor (Cursor) — testers "hardly see" or miss the popup. There is no
 * flag-only fix for a separate window; the standard mechanism is a WM activation
 * call. This module supplies that, extension-side (Layer B) — no Layer C change.
 *
 * It polls because the window appears ~1s after `nexpath stop` is spawned, and
 * is a graceful no-op when: not Linux, no display, or neither wmctrl nor xdotool
 * is installed (falls back to the prior behaviour — nothing breaks).
 */
import { spawnSync } from 'node:child_process';

/** Must match the title Layer C's TtySelectFn gives the popup window. */
export const POPUP_WINDOW_TITLE = 'Nexpath — Action Required';

export interface ForegroundDeps {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  /** Injected runner for tests; returns true if the command "succeeded". */
  hasCommand?: (cmd: string) => boolean;
  activate?: (tool: 'wmctrl' | 'xdotool') => boolean;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
  /** Poll cadence / cap (defaults: every 500ms, up to ~6s). */
  intervalMs?: number;
  maxTries?: number;
}

function defaultHasCommand(cmd: string): boolean {
  try {
    return spawnSync('which', [cmd], { stdio: 'ignore', timeout: 2000 }).status === 0;
  } catch {
    return false;
  }
}

/** Try once to raise the window. Returns true when the activation reports success. */
function defaultActivate(tool: 'wmctrl' | 'xdotool'): boolean {
  try {
    if (tool === 'wmctrl') {
      // `-a` matches a window by title substring and activates it.
      return spawnSync('wmctrl', ['-a', POPUP_WINDOW_TITLE], { stdio: 'ignore', timeout: 2000 }).status === 0;
    }
    const found = spawnSync('xdotool', ['search', '--name', POPUP_WINDOW_TITLE], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000,
    });
    const id = (found.stdout ?? '').trim().split('\n').filter(Boolean)[0];
    if (!id) return false;
    return spawnSync('xdotool', ['windowactivate', id], { stdio: 'ignore', timeout: 2000 }).status === 0;
  } catch {
    return false;
  }
}

/**
 * Fire-and-forget: repeatedly try to bring the popup window to the front until it
 * succeeds or the attempt budget runs out. Safe to call right after spawning
 * `nexpath stop`; never throws.
 */
export function bringPopupToFront(deps: ForegroundDeps = {}): void {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  // macOS/Windows already foreground their popup; only Linux needs help.
  if (platform !== 'linux') return;
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return;

  const hasCommand = deps.hasCommand ?? defaultHasCommand;
  const activate = deps.activate ?? defaultActivate;
  const tool: 'wmctrl' | 'xdotool' | null =
    hasCommand('wmctrl') ? 'wmctrl' : hasCommand('xdotool') ? 'xdotool' : null;
  if (!tool) return; // graceful no-op — prior behaviour, nothing breaks

  const _setInterval = deps.setInterval ?? setInterval;
  const _clearInterval = deps.clearInterval ?? clearInterval;
  const intervalMs = deps.intervalMs ?? 500;
  const maxTries = deps.maxTries ?? 12; // ~6s

  let tries = 0;
  // `let` + undefined-guard so the tick never references the handle before it's
  // assigned (robust even if a timer impl fired the callback synchronously).
  let timer: ReturnType<typeof _setInterval> | undefined;
  const stop = (): void => { if (timer !== undefined) _clearInterval(timer); };
  timer = _setInterval(() => {
    tries += 1;
    const ok = activate(tool);
    if (ok || tries >= maxTries) stop();
  }, intervalMs);
  // Don't keep the extension host event loop alive for this.
  if (typeof (timer as { unref?: () => void }).unref === 'function') {
    (timer as { unref: () => void }).unref();
  }
}
