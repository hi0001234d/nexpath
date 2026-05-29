import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  enumerateStateVscdbPaths,
  globalStorageStateVscdbPath,
} from './path-enumerator.js';

describe('enumerateStateVscdbPaths', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'nexpath-enum-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns [] when the workspaceStorage dir is null (no host)', () => {
    expect(enumerateStateVscdbPaths(null)).toEqual([]);
  });

  it('returns [] when the workspaceStorage dir does not exist', () => {
    expect(enumerateStateVscdbPaths(join(tmp, 'missing'))).toEqual([]);
  });

  it('returns [] when the workspaceStorage dir is empty', () => {
    mkdirSync(join(tmp, 'workspaceStorage'), { recursive: true });
    expect(enumerateStateVscdbPaths(join(tmp, 'workspaceStorage'))).toEqual([]);
  });

  it('finds one state.vscdb under a single workspace subdir', () => {
    const ws = join(tmp, 'workspaceStorage', '1778826246907');
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, 'state.vscdb'), '');
    const out = enumerateStateVscdbPaths(join(tmp, 'workspaceStorage'));
    expect(out).toHaveLength(1);
    expect(out[0]!.endsWith('state.vscdb')).toBe(true);
    expect(out[0]).toContain('1778826246907');
  });

  it('finds state.vscdb across multiple workspace subdirs', () => {
    for (const id of ['ws-a', 'ws-b', 'ws-c']) {
      const ws = join(tmp, 'workspaceStorage', id);
      mkdirSync(ws, { recursive: true });
      writeFileSync(join(ws, 'state.vscdb'), '');
    }
    const out = enumerateStateVscdbPaths(join(tmp, 'workspaceStorage'));
    expect(out).toHaveLength(3);
    expect(out.every((p) => p.endsWith('state.vscdb'))).toBe(true);
  });

  it('skips workspace subdirs that do not contain state.vscdb', () => {
    const wsWith = join(tmp, 'workspaceStorage', 'has-db');
    const wsWithout = join(tmp, 'workspaceStorage', 'no-db');
    mkdirSync(wsWith, { recursive: true });
    writeFileSync(join(wsWith, 'state.vscdb'), '');
    mkdirSync(wsWithout, { recursive: true });
    // wsWithout has no state.vscdb file
    const out = enumerateStateVscdbPaths(join(tmp, 'workspaceStorage'));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('has-db');
  });

  it('skips top-level files (non-directories) under workspaceStorage', () => {
    const wsDir = join(tmp, 'workspaceStorage');
    mkdirSync(wsDir, { recursive: true });
    writeFileSync(join(wsDir, 'some-stray-file'), 'not a dir');
    // Add one real workspace too
    const ws = join(wsDir, 'real-ws');
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, 'state.vscdb'), '');
    const out = enumerateStateVscdbPaths(wsDir);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('real-ws');
  });

  it('uses injected fs helpers when provided', () => {
    const fakeFs = {
      existsSync: (p: string) =>
        p === '/fake/ws' || p === '/fake/ws/wsA/state.vscdb',
      readdirSync: () => ['wsA'],
      statSync: () => ({ isDirectory: () => true }),
    };
    const out = enumerateStateVscdbPaths('/fake/ws', { fs: fakeFs });
    expect(out).toEqual(['/fake/ws/wsA/state.vscdb']);
  });
});

describe('globalStorageStateVscdbPath', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'nexpath-global-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns null when workspaceStorageDir is null', () => {
    expect(globalStorageStateVscdbPath(null)).toBeNull();
  });

  it('returns the sibling globalStorage/state.vscdb path when present', () => {
    const userDir = join(tmp, 'User');
    mkdirSync(join(userDir, 'workspaceStorage'), { recursive: true });
    mkdirSync(join(userDir, 'globalStorage'), { recursive: true });
    writeFileSync(join(userDir, 'globalStorage', 'state.vscdb'), '');
    const wsDir = join(userDir, 'workspaceStorage');
    const out = globalStorageStateVscdbPath(wsDir);
    expect(out).toBe(join(userDir, 'globalStorage', 'state.vscdb'));
  });

  it('returns null when globalStorage exists but state.vscdb is missing', () => {
    const userDir = join(tmp, 'User');
    mkdirSync(join(userDir, 'workspaceStorage'), { recursive: true });
    mkdirSync(join(userDir, 'globalStorage'), { recursive: true });
    // No state.vscdb written
    expect(
      globalStorageStateVscdbPath(join(userDir, 'workspaceStorage')),
    ).toBeNull();
  });

  it('returns null when globalStorage directory does not exist at all', () => {
    const userDir = join(tmp, 'User');
    mkdirSync(join(userDir, 'workspaceStorage'), { recursive: true });
    expect(
      globalStorageStateVscdbPath(join(userDir, 'workspaceStorage')),
    ).toBeNull();
  });

  it('uses injected fs helpers', () => {
    const fakeFs = {
      existsSync: (p: string) => p.endsWith('/globalStorage/state.vscdb'),
      readdirSync: () => [],
      statSync: () => ({ isDirectory: () => true }),
    };
    expect(
      globalStorageStateVscdbPath('/fake/User/workspaceStorage', {
        fs: fakeFs,
      }),
    ).toBe('/fake/User/globalStorage/state.vscdb');
  });
});
