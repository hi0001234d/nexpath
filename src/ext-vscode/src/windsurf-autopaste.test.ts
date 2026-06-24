import { describe, it, expect, vi } from 'vitest';
import { pasteKeystroke, raiseWindsurfWindow, raiseAppWindow } from './windsurf-autopaste.js';

const deps = (over = {}) => {
  const calls: Array<[string, string[]]> = [];
  return {
    calls,
    run: (cmd: string, args: string[]) => { calls.push([cmd, args]); return true; },
    hasCommand: () => true,
    env: { DISPLAY: ':0' } as NodeJS.ProcessEnv,
    ...over,
  };
};

describe('pasteKeystroke', () => {
  it('Linux/X11 with xdotool → ctrl+v via xdotool', () => {
    const d = deps({ platform: 'linux' as NodeJS.Platform });
    expect(pasteKeystroke(d)).toBe(true);
    expect(d.calls[0]).toEqual(['xdotool', ['key', '--clearmodifiers', 'ctrl+v']]);
  });

  it('Linux without DISPLAY/WAYLAND → false (no blind paste)', () => {
    const d = deps({ platform: 'linux' as NodeJS.Platform, env: {} as NodeJS.ProcessEnv });
    expect(pasteKeystroke(d)).toBe(false);
    expect(d.calls).toHaveLength(0);
  });

  it('Linux with no keystroke tool → false', () => {
    const d = deps({ platform: 'linux' as NodeJS.Platform, hasCommand: () => false });
    expect(pasteKeystroke(d)).toBe(false);
  });

  it('macOS → osascript Cmd+V', () => {
    const d = deps({ platform: 'darwin' as NodeJS.Platform });
    expect(pasteKeystroke(d)).toBe(true);
    expect(d.calls[0][0]).toBe('osascript');
    expect(d.calls[0][1].join(' ')).toContain('keystroke "v" using command down');
  });

  it('Windows → powershell SendKeys ^v', () => {
    const d = deps({ platform: 'win32' as NodeJS.Platform });
    expect(pasteKeystroke(d)).toBe(true);
    expect(d.calls[0][0]).toBe('powershell');
    expect(d.calls[0][1].join(' ')).toContain('SendKeys("^v")');
  });

  it('prefers xdotool, then wtype, then ydotool', () => {
    const onlyWtype = deps({
      platform: 'linux' as NodeJS.Platform,
      hasCommand: (c: string) => c === 'wtype',
    });
    expect(pasteKeystroke(onlyWtype)).toBe(true);
    expect(onlyWtype.calls[0][0]).toBe('wtype');
  });
});

describe('raiseWindsurfWindow', () => {
  it('Linux with wmctrl → activates the windsurf window', () => {
    const d = deps({ platform: 'linux' as NodeJS.Platform });
    expect(raiseWindsurfWindow(d)).toBe(true);
    expect(d.calls[0]).toEqual(['wmctrl', ['-x', '-a', 'windsurf']]);
  });

  it('non-Linux → no-op false', () => {
    expect(raiseWindsurfWindow(deps({ platform: 'darwin' as NodeJS.Platform }))).toBe(false);
    expect(raiseWindsurfWindow(deps({ platform: 'win32' as NodeJS.Platform }))).toBe(false);
  });

  it('Linux without a display → false', () => {
    const d = deps({ platform: 'linux' as NodeJS.Platform, env: {} as NodeJS.ProcessEnv });
    expect(raiseWindsurfWindow(d)).toBe(false);
  });
});

describe('raiseAppWindow (generalised — used for Cursor inject)', () => {
  it('Linux with wmctrl → activates the given app class (cursor)', () => {
    const d = deps({ platform: 'linux' as NodeJS.Platform });
    expect(raiseAppWindow('cursor', d)).toBe(true);
    expect(d.calls[0]).toEqual(['wmctrl', ['-x', '-a', 'cursor']]);
  });

  it('falls back to xdotool --class when wmctrl is absent', () => {
    const d = deps({
      platform: 'linux' as NodeJS.Platform,
      hasCommand: (c: string) => c === 'xdotool',
    });
    expect(raiseAppWindow('cursor', d)).toBe(true);
    expect(d.calls[0]).toEqual(['xdotool', ['search', '--class', 'cursor', 'windowactivate', '--sync']]);
  });

  it('non-Linux → no-op false', () => {
    expect(raiseAppWindow('cursor', deps({ platform: 'darwin' as NodeJS.Platform }))).toBe(false);
  });
});
