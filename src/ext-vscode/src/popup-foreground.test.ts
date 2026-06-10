import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bringPopupToFront, POPUP_WINDOW_TITLE } from './popup-foreground.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Kick off bringPopupToFront with real (faked) timers + injected env/tools. */
function setup(opts: {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  tools?: string[];                 // which of wmctrl/xdotool are "installed"
  activateSucceedsOnTry?: number;   // 1-based try on which activate returns true
  maxTries?: number;
}): { calls: () => number; tool: () => string | null } {
  const tools = new Set(opts.tools ?? []);
  let activateCalls = 0;
  let usedTool: string | null = null;

  bringPopupToFront({
    platform: opts.platform ?? 'linux',
    env: opts.env ?? { DISPLAY: ':0' },
    hasCommand: (c) => tools.has(c),
    activate: (tool) => {
      usedTool = tool;
      activateCalls += 1;
      return opts.activateSucceedsOnTry ? activateCalls >= opts.activateSucceedsOnTry : false;
    },
    intervalMs: 500,
    maxTries: opts.maxTries ?? 12,
  });

  return { calls: () => activateCalls, tool: () => usedTool };
}

describe('bringPopupToFront', () => {
  it('exports the title Layer C gives the popup window', () => {
    expect(POPUP_WINDOW_TITLE).toBe('Nexpath — Action Required');
  });

  it('no-ops on macOS (already foregrounds at launch)', () => {
    const h = setup({ platform: 'darwin', tools: ['wmctrl'] });
    vi.advanceTimersByTime(10_000);
    expect(h.calls()).toBe(0);
  });

  it('no-ops on Windows (already foregrounds at launch)', () => {
    const h = setup({ platform: 'win32', tools: ['wmctrl'] });
    vi.advanceTimersByTime(10_000);
    expect(h.calls()).toBe(0);
  });

  it('no-ops on Linux with no display', () => {
    const h = setup({ env: {}, tools: ['wmctrl'] });
    vi.advanceTimersByTime(10_000);
    expect(h.calls()).toBe(0);
  });

  it('no-ops gracefully when neither wmctrl nor xdotool is installed', () => {
    const h = setup({ tools: [] });
    vi.advanceTimersByTime(10_000);
    expect(h.calls()).toBe(0);
  });

  it('uses wmctrl when present and stops as soon as activation succeeds', () => {
    const h = setup({ tools: ['wmctrl', 'xdotool'], activateSucceedsOnTry: 3 });
    vi.advanceTimersByTime(10_000);
    expect(h.tool()).toBe('wmctrl');   // wmctrl preferred over xdotool
    expect(h.calls()).toBe(3);         // stopped on success, not all 12 tries
  });

  it('falls back to xdotool when wmctrl is absent', () => {
    const h = setup({ tools: ['xdotool'], activateSucceedsOnTry: 1 });
    vi.advanceTimersByTime(10_000);
    expect(h.tool()).toBe('xdotool');
    expect(h.calls()).toBe(1);
  });

  it('gives up after maxTries when activation never succeeds', () => {
    const h = setup({ tools: ['wmctrl'], maxTries: 5 }); // never succeeds
    vi.advanceTimersByTime(10_000);
    expect(h.calls()).toBe(5);
  });

  it('honours WAYLAND_DISPLAY as a valid display', () => {
    const h = setup({ env: { WAYLAND_DISPLAY: 'wayland-0' }, tools: ['wmctrl'], activateSucceedsOnTry: 1 });
    vi.advanceTimersByTime(10_000);
    expect(h.calls()).toBe(1);
  });
});
