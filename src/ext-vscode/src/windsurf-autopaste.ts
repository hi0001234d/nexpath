/**
 * Windsurf auto-paste — put the advisory selection straight into Cascade's input.
 *
 * Why keystroke simulation instead of a command: Windsurf's Cascade input has NO
 * extension-callable insert command. `windsurf.sendTextToChat` is only a defined
 * ID (no registered handler → `executeCommand` throws); the real insert is the
 * internal `addCascadeInput` webview protobuf message, which the extension can't
 * construct. So we do what a human would: copy to clipboard, focus the Cascade
 * input, and simulate the paste shortcut. Reuses the OS-automation approach
 * already used by `popup-foreground.ts` (xdotool/wmctrl).
 *
 * Fully dependency-injected; the real spawns are `spawnSync` (no shell).
 */
import { spawnSync } from 'node:child_process';

export interface AutoPasteDeps {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  /** True if `cmd` is on PATH (test seam). */
  hasCommand?: (cmd: string) => boolean;
  /** Run `cmd args`; return true on exit 0 (test seam). */
  run?: (cmd: string, args: string[]) => boolean;
}

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
 * Best-effort: raise the window of the given app class so the paste lands in it
 * (Linux/X11). No-op (returns false) elsewhere or when no tool is present.
 * `appClass` is matched against the X11 window class (e.g. 'windsurf', 'cursor').
 */
export function raiseAppWindow(appClass: string, deps: AutoPasteDeps = {}): boolean {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  if (platform !== 'linux') return false;
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return false;
  const has = deps.hasCommand ?? defaultHasCommand;
  const run = deps.run ?? defaultRun;
  if (has('wmctrl')) return run('wmctrl', ['-x', '-a', appClass]);
  if (has('xdotool')) return run('xdotool', ['search', '--class', appClass, 'windowactivate', '--sync']);
  return false;
}

/** Back-compat wrapper: raise the Windsurf window. */
export function raiseWindsurfWindow(deps: AutoPasteDeps = {}): boolean {
  return raiseAppWindow('windsurf', deps);
}

/**
 * Simulate the paste shortcut into the currently-focused input. Returns true if a
 * keystroke tool was found and dispatched the paste; false otherwise (caller then
 * keeps the clipboard + toast fallback).
 */
export function pasteKeystroke(deps: AutoPasteDeps = {}): boolean {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const has = deps.hasCommand ?? defaultHasCommand;
  const run = deps.run ?? defaultRun;

  if (platform === 'darwin') {
    return run('osascript', [
      '-e',
      'tell application "System Events" to keystroke "v" using command down',
    ]);
  }
  if (platform === 'win32') {
    return run('powershell', [
      '-NoProfile', '-Command',
      '$w=New-Object -ComObject WScript.Shell;$w.SendKeys("^v")',
    ]);
  }
  // Linux (X11 / Wayland-with-tool)
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return false;
  if (has('xdotool')) return run('xdotool', ['key', '--clearmodifiers', 'ctrl+v']);
  if (has('wtype')) return run('wtype', ['-M', 'ctrl', 'v', '-m', 'ctrl']);
  if (has('ydotool')) return run('ydotool', ['key', '29:1', '47:1', '47:0', '29:0']); // ctrl+v
  return false;
}
