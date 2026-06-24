import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';
import { stageCli, buildShim, CLI_ENTRY_REL, type StageDeps } from './cli-stage.js';

/** In-memory fs harness for the injected deps. */
function harness(seed: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(seed));
  const dirs = new Set<string>();
  const copied: Array<[string, string]> = [];
  const deps: StageDeps = {
    exists: (p) => files.has(p) || dirs.has(p),
    mkdirp: (p) => void dirs.add(p),
    copyDir: (s, d) => {
      copied.push([s, d]);
      dirs.add(d);
      // simulate the copied package.json now existing at the destination
      files.set(join(d, 'package.json'), files.get(join(s, 'package.json')) ?? '{}');
    },
    readFile: (p) => {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT ${p}`);
      return v;
    },
    writeFile: (p, data) => void files.set(p, data),
    chmod: vi.fn(),
    platform: 'linux',
  };
  return { files, dirs, copied, deps };
}

const HOME = '/home/u/.nexpath';
const BUNDLE = '/ext/nexpath-cli';

describe('stageCli', () => {
  it('returns no-bundle when bundledCliDir is null', () => {
    const { deps } = harness();
    expect(stageCli(null, HOME, deps).status).toBe('no-bundle');
  });

  it('returns no-bundle when the bundle dir does not exist', () => {
    const { deps } = harness();
    expect(stageCli(BUNDLE, HOME, deps).status).toBe('no-bundle');
  });

  it('errors when the bundled package.json has no version', () => {
    const { deps } = harness({ [BUNDLE]: '', [join(BUNDLE, 'package.json')]: '{}' });
    const r = stageCli(BUNDLE, HOME, deps);
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/no version/);
  });

  it('stages a fresh copy + writes the shim + computes the entry path', () => {
    const { deps, copied, files } = harness({
      [BUNDLE]: '',
      [join(BUNDLE, 'package.json')]: JSON.stringify({ version: '0.1.3' }),
    });
    const r = stageCli(BUNDLE, HOME, deps);
    expect(r.status).toBe('staged');
    expect(r.version).toBe('0.1.3');
    expect(r.stagedDir).toBe(join(HOME, 'cli', '0.1.3'));
    expect(r.cliEntry).toBe(join(HOME, 'cli', '0.1.3', CLI_ENTRY_REL));
    expect(r.shimPath).toBe(join(HOME, 'bin', 'nexpath'));
    expect(copied).toEqual([[BUNDLE, join(HOME, 'cli', '0.1.3')]]);
    // shim written + executable
    expect(files.get(join(HOME, 'bin', 'nexpath'))).toContain('exec node');
  });

  it('reuses an already-current copy (no re-copy) but refreshes the shim', () => {
    const staged = join(HOME, 'cli', '0.1.3');
    const { deps, copied } = harness({
      [BUNDLE]: '',
      [join(BUNDLE, 'package.json')]: JSON.stringify({ version: '0.1.3' }),
      [join(staged, 'package.json')]: JSON.stringify({ version: '0.1.3' }),
    });
    const r = stageCli(BUNDLE, HOME, deps);
    expect(r.status).toBe('already-current');
    expect(copied).toEqual([]); // did NOT copy again
    expect(r.cliEntry).toBe(join(staged, CLI_ENTRY_REL));
  });

  it('a new bundled version stages a new versioned dir', () => {
    const { deps } = harness({
      [BUNDLE]: '',
      [join(BUNDLE, 'package.json')]: JSON.stringify({ version: '0.1.4' }),
      [join(HOME, 'cli', '0.1.3', 'package.json')]: '{"version":"0.1.3"}',
    });
    const r = stageCli(BUNDLE, HOME, deps);
    expect(r.status).toBe('staged');
    expect(r.stagedDir).toBe(join(HOME, 'cli', '0.1.4'));
  });
});

describe('buildShim', () => {
  it('posix shim execs node against the staged entry', () => {
    const s = buildShim('/home/u/.nexpath/cli/0.1.3/dist/cli/index.js', 'linux');
    expect(s.name).toBe('nexpath');
    expect(s.body).toContain('#!/bin/sh');
    expect(s.body).toContain('exec node "/home/u/.nexpath/cli/0.1.3/dist/cli/index.js" "$@"');
  });

  it('windows shim is a .cmd that forwards args', () => {
    const s = buildShim('C:\\Users\\u\\.nexpath\\cli\\0.1.3\\dist\\cli\\index.js', 'win32');
    expect(s.name).toBe('nexpath.cmd');
    expect(s.body).toContain('node "C:\\Users\\u\\.nexpath\\cli\\0.1.3\\dist\\cli\\index.js" %*');
  });
});
