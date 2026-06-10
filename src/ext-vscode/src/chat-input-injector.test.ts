import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
    getCommands: vi.fn(),
  },
}));

import {
  chatInputInject,
  CANDIDATE_COMMANDS,
} from './chat-input-injector.js';

describe('chatInputInject', () => {
  it('returns false immediately for vscode-generic (no AI chat input)', async () => {
    const exec = vi.fn();
    const list = vi.fn();
    const result = await chatInputInject('hello', {
      host: 'vscode-generic',
      executeCommand: exec,
      getCommands: list,
    });
    expect(result).toBe(false);
    expect(exec).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('tries Cursor candidates when host = cursor', async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    const list = vi
      .fn()
      .mockResolvedValue([CANDIDATE_COMMANDS.cursor[0]]); // first candidate available
    const result = await chatInputInject('hello', {
      host: 'cursor',
      executeCommand: exec,
      getCommands: list,
    });
    expect(result).toBe(true);
    expect(list).toHaveBeenCalledWith(true);
    expect(exec).toHaveBeenCalledWith(CANDIDATE_COMMANDS.cursor[0], 'hello');
  });

  it('tries each cursor candidate in order until one succeeds', async () => {
    const exec = vi.fn();
    // First two candidates throw, third succeeds
    exec
      .mockRejectedValueOnce(new Error('first fail'))
      .mockRejectedValueOnce(new Error('second fail'))
      .mockResolvedValueOnce(undefined);
    const list = vi.fn().mockResolvedValue([...CANDIDATE_COMMANDS.cursor]);
    const result = await chatInputInject('hi', {
      host: 'cursor',
      executeCommand: exec,
      getCommands: list,
    });
    expect(result).toBe(true);
    expect(exec).toHaveBeenCalledTimes(3);
    expect(exec).toHaveBeenLastCalledWith(CANDIDATE_COMMANDS.cursor[2], 'hi');
  });

  it('skips candidates that are not in vscode.commands list', async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    // Only the third candidate is available
    const list = vi.fn().mockResolvedValue([CANDIDATE_COMMANDS.cursor[2]]);
    const result = await chatInputInject('hi', {
      host: 'cursor',
      executeCommand: exec,
      getCommands: list,
    });
    expect(result).toBe(true);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith(CANDIDATE_COMMANDS.cursor[2], 'hi');
  });

  it('returns false when no cursor candidate is available', async () => {
    const exec = vi.fn();
    const list = vi.fn().mockResolvedValue(['unrelated.command']);
    const result = await chatInputInject('hi', {
      host: 'cursor',
      executeCommand: exec,
      getCommands: list,
    });
    expect(result).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });

  it('returns false when all available cursor candidates throw', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('always fails'));
    const list = vi.fn().mockResolvedValue([...CANDIDATE_COMMANDS.cursor]);
    const result = await chatInputInject('hi', {
      host: 'cursor',
      executeCommand: exec,
      getCommands: list,
    });
    expect(result).toBe(false);
    expect(exec).toHaveBeenCalledTimes(CANDIDATE_COMMANDS.cursor.length);
  });

  it('returns false when getCommands itself throws', async () => {
    const exec = vi.fn();
    const list = vi.fn().mockRejectedValue(new Error('command list broken'));
    const result = await chatInputInject('hi', {
      host: 'cursor',
      executeCommand: exec,
      getCommands: list,
    });
    expect(result).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });

  it('tries Windsurf candidates when host = windsurf', async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    const list = vi.fn().mockResolvedValue([CANDIDATE_COMMANDS.windsurf[0]]);
    const result = await chatInputInject('hi', {
      host: 'windsurf',
      executeCommand: exec,
      getCommands: list,
    });
    expect(result).toBe(true);
    expect(exec).toHaveBeenCalledWith(CANDIDATE_COMMANDS.windsurf[0], 'hi');
  });
});

describe('CANDIDATE_COMMANDS', () => {
  it('exposes both cursor and windsurf candidate arrays', () => {
    expect(Array.isArray(CANDIDATE_COMMANDS.cursor)).toBe(true);
    expect(Array.isArray(CANDIDATE_COMMANDS.windsurf)).toBe(true);
    expect(CANDIDATE_COMMANDS.cursor.length).toBeGreaterThan(0);
    expect(CANDIDATE_COMMANDS.windsurf.length).toBeGreaterThan(0);
  });
});
