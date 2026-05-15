import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import {
  spawnAuto,
  spawnStop,
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
});
