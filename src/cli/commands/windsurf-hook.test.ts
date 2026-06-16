import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Command } from 'commander';
import { awaitChild, handleWindsurfHookCli, registerWindsurfHookCommand } from './windsurf-hook.js';

describe('handleWindsurfHookCli', () => {
  it('reads stdin and dispatches (event, raw, {cwd}) to the handler', async () => {
    const run = vi.fn().mockReturnValue({ action: 'auto' });
    const readStdin = vi.fn().mockResolvedValue('{"tool_info":{"user_prompt":"hi"}}');

    const r = await handleWindsurfHookCli(
      'pre_user_prompt',
      { project: '/explicit' },
      { run, readStdin },
    );

    expect(readStdin).toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith('pre_user_prompt', '{"tool_info":{"user_prompt":"hi"}}', { cwd: '/explicit' });
    expect(r).toEqual({ action: 'auto' });
  });

  it('falls back to deps.cwd when --project is absent', async () => {
    const run = vi.fn().mockReturnValue({ action: 'stop' });
    await handleWindsurfHookCli('post_cascade_response', {}, {
      run,
      readStdin: () => Promise.resolve(''),
      cwd: '/fallback',
    });
    expect(run).toHaveBeenCalledWith('post_cascade_response', '', { cwd: '/fallback' });
  });
});

describe('awaitChild', () => {
  it('resolves immediately when there is no child', async () => {
    await expect(awaitChild(null)).resolves.toBeUndefined();
    await expect(awaitChild(undefined)).resolves.toBeUndefined();
  });

  it('resolves when the child exits', async () => {
    const child = new EventEmitter() as unknown as import('node:child_process').ChildProcess;
    const p = awaitChild(child, 5000);
    (child as unknown as EventEmitter).emit('exit', 0);
    await expect(p).resolves.toBeUndefined();
  });

  it('resolves when the child errors (never rejects)', async () => {
    const child = new EventEmitter() as unknown as import('node:child_process').ChildProcess;
    const p = awaitChild(child, 5000);
    (child as unknown as EventEmitter).emit('error', new Error('spawn fail'));
    await expect(p).resolves.toBeUndefined();
  });

  it('resolves via the timeout fallback if the child never exits', async () => {
    const child = new EventEmitter() as unknown as import('node:child_process').ChildProcess;
    await expect(awaitChild(child, 1)).resolves.toBeUndefined();
  });
});

describe('registerWindsurfHookCommand', () => {
  it('registers a `windsurf-hook` command taking an <event> arg and --project', () => {
    const program = new Command();
    registerWindsurfHookCommand(program);
    const cmd = program.commands.find((c) => c.name() === 'windsurf-hook');
    expect(cmd).toBeDefined();
    // <event> positional is required
    expect(cmd!.registeredArguments.map((a) => a.name())).toContain('event');
    // --project option present
    expect(cmd!.options.some((o) => o.long === '--project')).toBe(true);
  });
});
