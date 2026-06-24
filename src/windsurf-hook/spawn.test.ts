import { describe, it, expect, vi } from 'vitest';
import { resolve } from 'node:path';
import { spawnAuto, spawnStop, type SpawnDeps } from './spawn.js';

/** Build a fake ChildProcess that records stdin writes + on() registrations. */
function fakeChild() {
  const writes: string[] = [];
  return {
    pid: 4242,
    writes,
    on: vi.fn(),
    unref: vi.fn(),
    stdin: {
      write: (s: string) => { writes.push(s); return true; },
      end: vi.fn(),
    },
  };
}

function makeSpawn() {
  const calls: Array<{ bin: string; args: string[]; opts: unknown; child: ReturnType<typeof fakeChild> }> = [];
  const child = fakeChild();
  const spawnFn = vi.fn((bin: string, args: string[], opts: unknown) => {
    calls.push({ bin, args, opts, child });
    return child as never;
  });
  return { spawnFn, calls, child };
}

describe('spawnAuto', () => {
  it('spawns `auto --project <cwd>` and writes {prompt} to stdin', () => {
    const { spawnFn, calls, child } = makeSpawn();
    const deps: SpawnDeps = { cwd: '/proj', binaryPath: '/bin/nexpath', spawnFn: spawnFn as never };

    spawnAuto('hello world', deps);

    expect(calls).toHaveLength(1);
    expect(calls[0].bin).toBe('/bin/nexpath');
    expect(calls[0].args).toEqual(['auto', '--project', '/proj']);
    expect(JSON.parse(child.writes[0])).toEqual({ prompt: 'hello world' });
  });

  it('spawns NOT detached, stdin piped, stdout/stderr ignored (caller awaits exit)', () => {
    const { spawnFn, calls } = makeSpawn();
    spawnAuto('x', { cwd: '/p', spawnFn: spawnFn as never });
    expect(calls[0].opts).toMatchObject({ cwd: '/p', stdio: ['pipe', 'ignore', 'ignore'] });
    expect((calls[0].opts as { detached?: boolean }).detached).toBeUndefined();
  });

  it('traces auto-spawned with the pid', () => {
    const { spawnFn } = makeSpawn();
    const onTrace = vi.fn();
    spawnAuto('x', { cwd: '/p', spawnFn: spawnFn as never, onTrace });
    expect(onTrace).toHaveBeenCalledWith('auto-spawned', { pid: 4242 });
  });

  it('returns null + traces spawn-error when spawn throws (never throws up)', () => {
    const onTrace = vi.fn();
    const spawnFn = vi.fn(() => { throw new Error('ENOENT'); });
    const r = spawnAuto('x', { cwd: '/p', spawnFn: spawnFn as never, onTrace });
    expect(r).toBeNull();
    expect(onTrace).toHaveBeenCalledWith('spawn-error', { error: expect.stringContaining('auto:') });
  });
});

describe('spawnStop', () => {
  it('spawns `stop` and writes the Stop hook payload to stdin', () => {
    const { spawnFn, calls, child } = makeSpawn();
    spawnStop({ cwd: '/proj', binaryPath: 'nexpath', spawnFn: spawnFn as never });

    expect(calls[0].args).toEqual(['stop']);
    expect(JSON.parse(child.writes[0])).toEqual({
      cwd: '/proj',
      hook_event_name: 'Stop',
      stop_hook_active: false,
    });
  });

  it('returns null + traces spawn-error when spawn throws', () => {
    const onTrace = vi.fn();
    const spawnFn = vi.fn(() => { throw new Error('boom'); });
    const r = spawnStop({ cwd: '/p', spawnFn: spawnFn as never, onTrace });
    expect(r).toBeNull();
    expect(onTrace).toHaveBeenCalledWith('spawn-error', { error: expect.stringContaining('stop:') });
  });
});

describe('command resolution', () => {
  it('uses binaryPath verbatim (no argv prefix) when given', () => {
    const a = makeSpawn();
    spawnStop({ cwd: '/p', binaryPath: '/explicit', spawnFn: a.spawnFn as never });
    expect(a.calls[0].bin).toBe('/explicit');
    expect(a.calls[0].args).toEqual(['stop']);
  });

  it('uses $NEXPATH_BIN verbatim when set', () => {
    const b = makeSpawn();
    const prev = process.env.NEXPATH_BIN;
    process.env.NEXPATH_BIN = '/from-env';
    spawnStop({ cwd: '/p', spawnFn: b.spawnFn as never });
    expect(b.calls[0].bin).toBe('/from-env');
    expect(b.calls[0].args).toEqual(['stop']);
    if (prev === undefined) delete process.env.NEXPATH_BIN; else process.env.NEXPATH_BIN = prev;
  });

  it('defaults to absolute node + this CLI script (robust under sanitized PATH), NOT bare "nexpath"', () => {
    const prev = process.env.NEXPATH_BIN;
    delete process.env.NEXPATH_BIN;
    const c = makeSpawn();
    spawnStop({ cwd: '/p', spawnFn: c.spawnFn as never });
    expect(c.calls[0].bin).toBe(process.execPath);                 // absolute node
    expect(c.calls[0].args[0]).toBe(resolve(process.argv[1])); // this cli script
    expect(c.calls[0].args.slice(1)).toEqual(['stop']);
    if (prev !== undefined) process.env.NEXPATH_BIN = prev;
  });
});
