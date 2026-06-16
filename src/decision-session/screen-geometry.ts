// Per-OS screen detection + popup geometry computation for the
// decision-session popup window.
//
// Detection chain (in order of precedence):
//   1. NEXPATH_SCREEN_WIDTH + NEXPATH_SCREEN_HEIGHT env vars
//      (universal override — useful for headless / unusual setups).
//   2. OS-specific primary detection:
//        Windows  → PowerShell + System.Windows.Forms.Screen
//        macOS    → osascript + Finder window-of-desktop bounds
//        Linux    → xdpyinfo / xrandr / wlr-randr
//   3. OS-specific fallback detection (where applicable):
//        Windows  → wmic desktopmonitor
//   4. null — caller passes no geometry and the popup opens at the
//      terminal-emulator's default size.
//
// Detection failures NEVER throw — every shell-out is wrapped in a
// try/catch that resolves to null so the popup-open path stays
// fault-tolerant.

import { spawnSync } from 'node:child_process';

// ── Public types ────────────────────────────────────────────────────────────

/** Detected screen pixel dimensions. Both > 0 when present. */
export interface ScreenSize {
  widthPx:  number;
  heightPx: number;
}

/**
 * Computed popup window geometry. Includes both pixel dimensions (for
 * emulators that accept pixels — kitty, foot, macOS Terminal, Windows
 * Terminal via wt --pos) AND cell dimensions (for emulators that
 * accept only cells — xterm, gnome-terminal, alacritty, xfce4-terminal,
 * Windows mode CON fallback).
 */
export interface PopupGeometry {
  /** Popup width in pixels (= ROUND(screen.widthPx × POPUP_SIZE_RATIO)). */
  widthPx:  number;
  /** Popup height in pixels (= ROUND(screen.heightPx × POPUP_SIZE_RATIO)). */
  heightPx: number;
  /** Centered X origin in pixels. */
  xPx:      number;
  /** Centered Y origin in pixels. */
  yPx:      number;
  /** Cell-width equivalent of widthPx using the active cell-width default. */
  cols:     number;
  /** Cell-height equivalent of heightPx using the active cell-height default. */
  rows:     number;
}

// ── Constants ───────────────────────────────────────────────────────────────

/** Default cell width in pixels for a conservative monospace font. */
export const DEFAULT_CELL_WIDTH_PX  = 10;

/** Default cell height in pixels for a conservative monospace font. */
export const DEFAULT_CELL_HEIGHT_PX = 20;

/** Fraction of each screen axis the popup should occupy. */
export const POPUP_SIZE_RATIO = 0.7;

/** Hardcoded last-resort screen size for cases where every detection path fails but a popup is still attempted. */
export const FALLBACK_SCREEN_SIZE: ScreenSize = { widthPx: 1920, heightPx: 1080 };

// ── Env-var keys ────────────────────────────────────────────────────────────

/** Screen width override (pixels). Bypasses OS detection when both width + height are set. */
export const ENV_SCREEN_WIDTH  = 'NEXPATH_SCREEN_WIDTH';

/** Screen height override (pixels). Bypasses OS detection when both width + height are set. */
export const ENV_SCREEN_HEIGHT = 'NEXPATH_SCREEN_HEIGHT';

/** Cell-width override (pixels) for cells-only emulators. */
export const ENV_CELL_WIDTH    = 'NEXPATH_CELL_WIDTH_PX';

/** Cell-height override (pixels) for cells-only emulators. */
export const ENV_CELL_HEIGHT   = 'NEXPATH_CELL_HEIGHT_PX';

// ── Helpers ─────────────────────────────────────────────────────────────────

function parsePositiveInt(s: string | undefined): number | null {
  if (s === undefined || s === '') return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function getCellWidth(): number {
  return parsePositiveInt(process.env[ENV_CELL_WIDTH]) ?? DEFAULT_CELL_WIDTH_PX;
}

function getCellHeight(): number {
  return parsePositiveInt(process.env[ENV_CELL_HEIGHT]) ?? DEFAULT_CELL_HEIGHT_PX;
}

/**
 * Parse a `WIDTHxHEIGHT` pattern from arbitrary text (xdpyinfo, xrandr,
 * wlr-randr output). Returns null when no match or either value is <= 0.
 *
 * Matches the first `<int>x<int>` occurrence — caller must pass text that
 * already isolates the line of interest if multiple resolutions appear.
 *
 * Exported for unit testability.
 */
export function parseDimensionsPattern(text: string): ScreenSize | null {
  const m = text.match(/(\d+)\s*x\s*(\d+)/);
  if (!m) return null;
  const widthPx  = parseInt(m[1], 10);
  const heightPx = parseInt(m[2], 10);
  if (!Number.isFinite(widthPx)  || widthPx  <= 0) return null;
  if (!Number.isFinite(heightPx) || heightPx <= 0) return null;
  return { widthPx, heightPx };
}

/**
 * Parse PowerShell `Write-Output $b.Width; Write-Output $b.Height` two-
 * line output into a ScreenSize. Returns null on malformed / empty input.
 *
 * Exported for unit testability.
 */
export function parsePowerShellOutput(stdout: string): ScreenSize | null {
  const lines = stdout.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const widthPx  = parsePositiveInt(lines[0]);
  const heightPx = parsePositiveInt(lines[1]);
  if (widthPx === null || heightPx === null) return null;
  return { widthPx, heightPx };
}

/**
 * Parse `wmic desktopmonitor get screenwidth,screenheight /format:list`
 * output into a ScreenSize. Looks for `ScreenWidth=N` and
 * `ScreenHeight=N` lines anywhere in the input.
 *
 * Exported for unit testability.
 */
export function parseWmicOutput(stdout: string): ScreenSize | null {
  const wm = stdout.match(/ScreenWidth=(\d+)/);
  const hm = stdout.match(/ScreenHeight=(\d+)/);
  if (!wm || !hm) return null;
  const widthPx  = parsePositiveInt(wm[1]);
  const heightPx = parsePositiveInt(hm[1]);
  if (widthPx === null || heightPx === null) return null;
  return { widthPx, heightPx };
}

/**
 * Parse `osascript` AppleScript output of the form "W,H" into a
 * ScreenSize. Returns null on malformed input.
 *
 * Exported for unit testability.
 */
export function parseMacOsascriptOutput(stdout: string): ScreenSize | null {
  const parts = stdout.trim().split(',');
  if (parts.length < 2) return null;
  const widthPx  = parsePositiveInt(parts[0]);
  const heightPx = parsePositiveInt(parts[1]);
  if (widthPx === null || heightPx === null) return null;
  return { widthPx, heightPx };
}

/**
 * Parse `xdpyinfo` output (looks for the "dimensions: WxH pixels" line).
 * Returns null when the line is not present.
 *
 * Exported for unit testability.
 */
export function parseXdpyinfoOutput(stdout: string): ScreenSize | null {
  const m = stdout.match(/dimensions:\s+(\d+)x(\d+)\s+pixels/);
  if (!m) return null;
  const widthPx  = parsePositiveInt(m[1]);
  const heightPx = parsePositiveInt(m[2]);
  if (widthPx === null || heightPx === null) return null;
  return { widthPx, heightPx };
}

/**
 * Parse `xrandr` output (looks for the FIRST `connected primary WxH+X+Y`
 * line, falling back to `connected WxH+X+Y` when no primary marker is
 * present). Returns null when no connected output is found.
 *
 * Exported for unit testability.
 */
export function parseXrandrOutput(stdout: string): ScreenSize | null {
  const m = stdout.match(/connected\s+(?:primary\s+)?(\d+)x(\d+)\+/);
  if (!m) return null;
  const widthPx  = parsePositiveInt(m[1]);
  const heightPx = parsePositiveInt(m[2]);
  if (widthPx === null || heightPx === null) return null;
  return { widthPx, heightPx };
}

/**
 * Read the universal env-var screen-size override. Returns the parsed
 * `ScreenSize` when BOTH NEXPATH_SCREEN_WIDTH and NEXPATH_SCREEN_HEIGHT
 * are present and positive integers; otherwise null.
 *
 * Exported for unit testability.
 */
export function getEnvScreenOverride(): ScreenSize | null {
  const widthPx  = parsePositiveInt(process.env[ENV_SCREEN_WIDTH]);
  const heightPx = parsePositiveInt(process.env[ENV_SCREEN_HEIGHT]);
  if (widthPx === null || heightPx === null) return null;
  return { widthPx, heightPx };
}

// ── Per-OS detection ────────────────────────────────────────────────────────

function detectScreenWindows(): ScreenSize | null {
  // Primary path: PowerShell + System.Windows.Forms.Screen.
  try {
    const r = spawnSync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Add-Type -AssemblyName System.Windows.Forms; ' +
      '$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; ' +
      'Write-Output $b.Width; Write-Output $b.Height',
    ], { encoding: 'utf8', timeout: 5000 });
    if (r.status === 0 && r.stdout) {
      const parsed = parsePowerShellOutput(r.stdout);
      if (parsed) return parsed;
    }
  } catch { /* fall through */ }

  // Fallback: wmic desktopmonitor (deprecated post Win11 24H2 but still common).
  try {
    const r = spawnSync('wmic', [
      'desktopmonitor', 'get', 'screenwidth,screenheight', '/format:list',
    ], { encoding: 'utf8', timeout: 5000 });
    if (r.status === 0 && r.stdout) {
      const parsed = parseWmicOutput(r.stdout);
      if (parsed) return parsed;
    }
  } catch { /* fall through */ }

  return null;
}

function detectScreenMac(): ScreenSize | null {
  try {
    const script =
      'tell application "Finder" to set b to bounds of window of desktop\n' +
      'return ((item 3 of b) as string) & "," & ((item 4 of b) as string)';
    const r = spawnSync('osascript', ['-e', script], { encoding: 'utf8', timeout: 5000 });
    if (r.status === 0 && r.stdout) {
      const parsed = parseMacOsascriptOutput(r.stdout);
      if (parsed) return parsed;
    }
  } catch { /* fall through */ }

  return null;
}

function detectScreenLinux(): ScreenSize | null {
  // No display server → no detection possible.
  if (!process.env['DISPLAY'] && !process.env['WAYLAND_DISPLAY']) return null;

  // xdpyinfo (X11 / XWayland).
  try {
    const r = spawnSync('xdpyinfo', [], { encoding: 'utf8', timeout: 5000 });
    if (r.status === 0 && r.stdout) {
      const parsed = parseXdpyinfoOutput(r.stdout);
      if (parsed) return parsed;
    }
  } catch { /* fall through */ }

  // xrandr (X11 / XWayland).
  try {
    const r = spawnSync('xrandr', [], { encoding: 'utf8', timeout: 5000 });
    if (r.status === 0 && r.stdout) {
      const parsed = parseXrandrOutput(r.stdout);
      if (parsed) return parsed;
    }
  } catch { /* fall through */ }

  // wlr-randr (Wayland on wlroots-based compositors: Sway, Hyprland, etc.).
  try {
    const r = spawnSync('wlr-randr', [], { encoding: 'utf8', timeout: 5000 });
    if (r.status === 0 && r.stdout) {
      const parsed = parseDimensionsPattern(r.stdout);
      if (parsed) return parsed;
    }
  } catch { /* fall through */ }

  return null;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Detect the primary screen's pixel resolution. Returns null when every
 * detection path fails so the caller can fall back to the terminal-
 * emulator's default popup size.
 *
 * Async signature gives room for future native-API backends; the current
 * implementation resolves synchronously via spawnSync wrapped in
 * Promise.resolve.
 */
export async function detectScreenResolution(): Promise<ScreenSize | null> {
  const env = getEnvScreenOverride();
  if (env) return env;

  switch (process.platform) {
    case 'win32':  return detectScreenWindows();
    case 'darwin': return detectScreenMac();
    case 'linux':  return detectScreenLinux();
    default:       return null;
  }
}

/**
 * Pure: compute a 70% × 70% popup geometry centered on the given screen.
 * Returns both pixel and cell dimensions so each spawn path can pick
 * whichever its emulator accepts. Cell math uses
 * NEXPATH_CELL_WIDTH_PX / NEXPATH_CELL_HEIGHT_PX env-var overrides
 * when set; otherwise the conservative defaults.
 *
 * Edge cases:
 *   - `cols` and `rows` are clamped to a minimum of 1 so divide-by-zero
 *     or zero-cell-size inputs cannot produce a 0-cell popup.
 *   - `xPx` and `yPx` use Math.round; a 1-pixel asymmetry is acceptable
 *     visual centering.
 */
export function computePopupGeometry(screen: ScreenSize): PopupGeometry {
  const widthPx  = Math.round(screen.widthPx  * POPUP_SIZE_RATIO);
  const heightPx = Math.round(screen.heightPx * POPUP_SIZE_RATIO);
  const xPx      = Math.round((screen.widthPx  - widthPx)  / 2);
  const yPx      = Math.round((screen.heightPx - heightPx) / 2);

  const cellW = getCellWidth();
  const cellH = getCellHeight();
  const cols  = Math.max(1, Math.floor(widthPx  / cellW));
  const rows  = Math.max(1, Math.floor(heightPx / cellH));

  return { widthPx, heightPx, xPx, yPx, cols, rows };
}
