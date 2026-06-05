import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import {
  spawnAuto,
  spawnStop,
  resolveSpawnEnv,
  NexpathBinaryNotFoundError,
  NexpathMalformedPayloadError,
} from './ipc.js';

interface FakeChildOptions {
  stdoutChunks?: string[];
  stderrChunks?: string[];
  exitCode?: number;
  errorBeforeClose?: Error;
}

function makeFakeChild(opts: FakeChildOptions = {}) {
  const child = new EventEmitter() as EventEmitter & {
    stdin: Writable;
    stdout: Readable;
    stderr: Readable;
  };
  child.stdin = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  child.stdout = new Readable({ read() {} });
  child.stderr = new Readable({ read() {} });

  // `emit('data', ...)` synchronously invokes any registered listeners on the
  // stream, which is what we need so the consumer's data handler has accumulated
  // its buffer before we emit 'close'. `push()` buffers asynchronously and
  // would deliver the data after 'close' fires.
  queueMicrotask(() => {
    if (opts.errorBeforeClose) {
      child.emit('error', opts.errorBeforeClose);
      return;
    }
    for (const c of opts.stdoutChunks ?? []) child.stdout.emit('data', Buffer.from(c));
    for (const c of opts.stderrChunks ?? []) child.stderr.emit('data', Buffer.from(c));
    child.emit('close', opts.exitCode ?? 0);
  });

  return child;
}

describe('spawnAuto', () => {
  it('resolves when the process exits with code 0', async () => {
    const spawnFn = vi.fn(() => makeFakeChild({ exitCode: 0 }));
    await expect(
      spawnAuto('hi', 'sess-1', { spawnFn: spawnFn as never }),
    ).resolves.toBeUndefined();
    expect(spawnFn).toHaveBeenCalledWith(
      'nexpath',
      ['auto'],
      expect.any(Object),
    );
  });

  it('includes --db argument when dbPath is provided', async () => {
    const spawnFn = vi.fn(() => makeFakeChild({ exitCode: 0 }));
    await spawnAuto('p', 's', { spawnFn: spawnFn as never, dbPath: '/tmp/x.db' });
    expect(spawnFn).toHaveBeenCalledWith(
      'nexpath',
      ['auto', '--db', '/tmp/x.db'],
      expect.any(Object),
    );
  });

  it('uses binaryPath override over default "nexpath"', async () => {
    const spawnFn = vi.fn(() => makeFakeChild({ exitCode: 0 }));
    await spawnAuto('p', 's', {
      spawnFn: spawnFn as never,
      binaryPath: '/usr/local/bin/nexpath',
    });
    expect(spawnFn).toHaveBeenCalledWith(
      '/usr/local/bin/nexpath',
      ['auto'],
      expect.any(Object),
    );
  });

  it('passes opts.cwd as the spawned process cwd (so Layer C resolves --project correctly)', async () => {
    const spawnFn = vi.fn(() => makeFakeChild({ exitCode: 0 }));
    await spawnAuto('p', 's', {
      spawnFn: spawnFn as never,
      cwd: '/some/workspace/path',
    });
    const opts = spawnFn.mock.calls[0]![2] as { cwd?: string };
    expect(opts.cwd).toBe('/some/workspace/path');
  });

  it('defaults the spawned process cwd to process.cwd() when opts.cwd is omitted', async () => {
    const spawnFn = vi.fn(() => makeFakeChild({ exitCode: 0 }));
    await spawnAuto('p', 's', { spawnFn: spawnFn as never });
    const opts = spawnFn.mock.calls[0]![2] as { cwd?: string };
    expect(opts.cwd).toBe(process.cwd());
  });

  it('rejects with NexpathBinaryNotFoundError when the child emits error', async () => {
    const enoent = Object.assign(new Error('spawn nexpath ENOENT'), {
      code: 'ENOENT',
    });
    const spawnFn = vi.fn(() => makeFakeChild({ errorBeforeClose: enoent }));
    await expect(
      spawnAuto('p', 's', { spawnFn: spawnFn as never }),
    ).rejects.toBeInstanceOf(NexpathBinaryNotFoundError);
  });

  it('rejects with a clear message when the process exits non-zero', async () => {
    const spawnFn = vi.fn(() =>
      makeFakeChild({ exitCode: 1, stderrChunks: ['bad stuff\n'] }),
    );
    await expect(
      spawnAuto('p', 's', { spawnFn: spawnFn as never }),
    ).rejects.toThrow(/exited with code 1/);
  });
});

describe('spawnStop', () => {
  it('parses a valid JSON payload from stdout', async () => {
    const payload = {
      advisory: 'be careful',
      options: [{ id: 'a', label: 'Continue' }],
    };
    const spawnFn = vi.fn(() =>
      makeFakeChild({
        stdoutChunks: [JSON.stringify(payload)],
        exitCode: 0,
      }),
    );
    const result = await spawnStop('s', { spawnFn: spawnFn as never });
    expect(result).toEqual(payload);
  });

  it('resolves null when stdout is empty (no advisory generated)', async () => {
    const spawnFn = vi.fn(() => makeFakeChild({ stdoutChunks: [], exitCode: 0 }));
    const result = await spawnStop('s', { spawnFn: spawnFn as never });
    expect(result).toBeNull();
  });

  it('resolves null when stdout is only whitespace', async () => {
    const spawnFn = vi.fn(() =>
      makeFakeChild({ stdoutChunks: ['  \n  \t  '], exitCode: 0 }),
    );
    const result = await spawnStop('s', { spawnFn: spawnFn as never });
    expect(result).toBeNull();
  });

  it('rejects with NexpathMalformedPayloadError when stdout is non-empty but not JSON', async () => {
    const spawnFn = vi.fn(() =>
      makeFakeChild({ stdoutChunks: ['not json {{'], exitCode: 0 }),
    );
    await expect(
      spawnStop('s', { spawnFn: spawnFn as never }),
    ).rejects.toBeInstanceOf(NexpathMalformedPayloadError);
  });

  it('rejects when nexpath stop exits non-zero', async () => {
    const spawnFn = vi.fn(() =>
      makeFakeChild({ exitCode: 2, stderrChunks: ['boom\n'] }),
    );
    await expect(
      spawnStop('s', { spawnFn: spawnFn as never }),
    ).rejects.toThrow(/exited with code 2/);
  });

  it('rejects with NexpathBinaryNotFoundError when spawn emits error', async () => {
    const spawnFn = vi.fn(() =>
      makeFakeChild({ errorBeforeClose: new Error('nope') }),
    );
    await expect(
      spawnStop('s', { spawnFn: spawnFn as never }),
    ).rejects.toBeInstanceOf(NexpathBinaryNotFoundError);
  });

  // ── Stdin payload contract — must match Layer C's StopPayload shape ──────────
  // `src/cli/commands/stop.ts` lines 37-43 declare StopPayload requires
  // `cwd`, `hook_event_name`, and `stop_hook_active` in addition to the
  // optional `session_id`. We must send the full shape so Layer C's
  // `runStop` works correctly.

  it('writes the full StopPayload shape to stdin (session_id + cwd + hook_event_name + stop_hook_active)', async () => {
    let captured = '';
    const spawnFn = vi.fn(() => {
      const c = makeFakeChild({ stdoutChunks: [''], exitCode: 0 });
      const origEnd = c.stdin.end.bind(c.stdin);
      c.stdin.end = ((chunk: unknown, ...args: unknown[]) => {
        if (chunk !== undefined) captured = String(chunk);
        return origEnd(chunk as never, ...(args as never[]));
      }) as typeof c.stdin.end;
      return c;
    });
    await spawnStop('sess-X', {
      spawnFn: spawnFn as never,
      cwd: '/workspace/abc',
    });
    const parsed = JSON.parse(captured.trim());
    expect(parsed).toEqual({
      session_id:       'sess-X',
      cwd:              '/workspace/abc',
      hook_event_name:  'Stop',
      stop_hook_active: false,
    });
  });

  it('defaults the stdin cwd to process.cwd() when opts.cwd is omitted', async () => {
    let captured = '';
    const spawnFn = vi.fn(() => {
      const c = makeFakeChild({ stdoutChunks: [''], exitCode: 0 });
      const origEnd = c.stdin.end.bind(c.stdin);
      c.stdin.end = ((chunk: unknown, ...args: unknown[]) => {
        if (chunk !== undefined) captured = String(chunk);
        return origEnd(chunk as never, ...(args as never[]));
      }) as typeof c.stdin.end;
      return c;
    });
    await spawnStop('sess-Y', { spawnFn: spawnFn as never });
    const parsed = JSON.parse(captured.trim());
    expect(parsed.cwd).toBe(process.cwd());
    expect(parsed.hook_event_name).toBe('Stop');
    expect(parsed.stop_hook_active).toBe(false);
  });

  it('passes opts.cwd as the spawned process cwd', async () => {
    const spawnFn = vi.fn(() =>
      makeFakeChild({ stdoutChunks: [''], exitCode: 0 }),
    );
    await spawnStop('s', { spawnFn: spawnFn as never, cwd: '/spawn/cwd' });
    const opts = spawnFn.mock.calls[0]![2] as { cwd?: string };
    expect(opts.cwd).toBe('/spawn/cwd');
  });
});

describe('resolveSpawnEnv — DBus session bus restoration', () => {
  it('injects the standard per-user bus when DBUS_SESSION_BUS_ADDRESS is absent and the socket exists', () => {
    const env = resolveSpawnEnv({
      env: { PATH: '/usr/bin' },
      getuid: () => 1000,
      existsSync: (p) => p === '/run/user/1000/bus',
    });
    expect(env.DBUS_SESSION_BUS_ADDRESS).toBe('unix:path=/run/user/1000/bus');
    expect(env.PATH).toBe('/usr/bin'); // existing vars preserved
  });

  it('never overrides an address that is already set', () => {
    const env = resolveSpawnEnv({
      env: { DBUS_SESSION_BUS_ADDRESS: 'unix:path=/already/here' },
      getuid: () => 1000,
      existsSync: () => true,
    });
    expect(env.DBUS_SESSION_BUS_ADDRESS).toBe('unix:path=/already/here');
  });

  it('leaves env unchanged when the bus socket does not exist', () => {
    const env = resolveSpawnEnv({
      env: { PATH: '/usr/bin' },
      getuid: () => 1000,
      existsSync: () => false,
    });
    expect(env.DBUS_SESSION_BUS_ADDRESS).toBeUndefined();
  });
});
