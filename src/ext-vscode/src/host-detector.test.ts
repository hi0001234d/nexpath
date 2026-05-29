import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  env: { appName: 'Visual Studio Code' },
}));

import {
  classifyHost,
  detectHost,
  chatHistoryBaseDir,
  workspaceStorageDir,
  windsurfCodeiumDir,
} from './host-detector.js';

describe('classifyHost', () => {
  it('maps "Cursor" → cursor', () => {
    expect(classifyHost('Cursor')).toBe('cursor');
    expect(classifyHost('Cursor 3.4.20')).toBe('cursor');
  });

  it('maps "Windsurf" → windsurf', () => {
    expect(classifyHost('Windsurf')).toBe('windsurf');
    expect(classifyHost('Windsurf 1.0')).toBe('windsurf');
  });

  it('maps Visual Studio Code / Code / unknown → vscode-generic', () => {
    expect(classifyHost('Visual Studio Code')).toBe('vscode-generic');
    expect(classifyHost('Code')).toBe('vscode-generic');
    expect(classifyHost('Code - Insiders')).toBe('vscode-generic');
    expect(classifyHost('Something Else')).toBe('vscode-generic');
    expect(classifyHost('')).toBe('vscode-generic');
  });

  it('is case-insensitive', () => {
    expect(classifyHost('CURSOR')).toBe('cursor');
    expect(classifyHost('cursor')).toBe('cursor');
    expect(classifyHost('WINDSURF')).toBe('windsurf');
  });
});

describe('detectHost', () => {
  it('reads from injected appName when provided', () => {
    expect(detectHost({ appName: 'Cursor' })).toBe('cursor');
    expect(detectHost({ appName: 'Windsurf' })).toBe('windsurf');
    expect(detectHost({ appName: 'Visual Studio Code' })).toBe('vscode-generic');
  });

  it('falls back to vscode.env.appName when no override (mocked: VS Code)', () => {
    expect(detectHost()).toBe('vscode-generic');
  });
});

describe('chatHistoryBaseDir', () => {
  it('returns null for vscode-generic (no chat-history watching)', () => {
    expect(
      chatHistoryBaseDir({ host: 'vscode-generic', home: '/home/u', platform: 'linux' }),
    ).toBeNull();
  });

  it('cursor on linux → ~/.config/Cursor', () => {
    expect(
      chatHistoryBaseDir({ host: 'cursor', home: '/home/u', platform: 'linux' }),
    ).toBe('/home/u/.config/Cursor');
  });

  it('cursor on darwin → Library/Application Support', () => {
    expect(
      chatHistoryBaseDir({ host: 'cursor', home: '/Users/u', platform: 'darwin' }),
    ).toBe('/Users/u/Library/Application Support/Cursor');
  });

  it('cursor on win32 with APPDATA → uses it', () => {
    expect(
      chatHistoryBaseDir({
        host: 'cursor',
        home: 'C:\\Users\\u',
        platform: 'win32',
        appdata: 'C:\\Users\\u\\AppData\\Roaming',
      }),
    ).toBe('C:\\Users\\u\\AppData\\Roaming/Cursor');
  });

  it('windsurf paths mirror cursor paths', () => {
    expect(
      chatHistoryBaseDir({ host: 'windsurf', home: '/home/u', platform: 'linux' }),
    ).toBe('/home/u/.config/Windsurf');
    expect(
      chatHistoryBaseDir({ host: 'windsurf', home: '/Users/u', platform: 'darwin' }),
    ).toBe('/Users/u/Library/Application Support/Windsurf');
  });
});

describe('workspaceStorageDir', () => {
  it('appends User/workspaceStorage to the host base dir', () => {
    expect(
      workspaceStorageDir({ host: 'cursor', home: '/home/u', platform: 'linux' }),
    ).toBe('/home/u/.config/Cursor/User/workspaceStorage');
  });

  it('returns null for vscode-generic (passes the base null through)', () => {
    expect(workspaceStorageDir({ host: 'vscode-generic' })).toBeNull();
  });
});

describe('windsurfCodeiumDir', () => {
  it('joins ~/.codeium/windsurf for an explicit home', () => {
    expect(windsurfCodeiumDir('/home/u')).toBe('/home/u/.codeium/windsurf');
  });

  it('matches the windsurfAdapter codeiumCascadeDir convention (cross-file invariant)', () => {
    // The CLI-side adapter at src/agents/adapters/windsurf.ts uses
    // join(home, '.codeium', 'windsurf'). Locking the same shape here so
    // a future rename on either side stays obvious.
    expect(windsurfCodeiumDir('/Users/u')).toBe('/Users/u/.codeium/windsurf');
    expect(windsurfCodeiumDir('C:\\Users\\u')).toBe('C:\\Users\\u/.codeium/windsurf');
  });

  it('defaults to os.homedir() when no argument provided', () => {
    // Don't pin a literal value (runner-dependent); just assert structure.
    const result = windsurfCodeiumDir();
    expect(result.endsWith('/.codeium/windsurf')).toBe(true);
  });
});
