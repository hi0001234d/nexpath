import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_TARGETS,
  buildVsixFilename,
  parsePackagerArgs,
} from './package-per-platform-helpers.js';

describe('SUPPORTED_TARGETS', () => {
  it('lists exactly the five platforms better-sqlite3 ships prebuilds for', () => {
    expect([...SUPPORTED_TARGETS]).toEqual([
      'linux-x64',
      'linux-arm64',
      'darwin-x64',
      'darwin-arm64',
      'win32-x64',
    ]);
  });
});

describe('buildVsixFilename', () => {
  it('joins name + target + version with hyphens and .vsix suffix', () => {
    expect(buildVsixFilename('nexpath-vscode', 'darwin-arm64', '0.1.3')).toBe(
      'nexpath-vscode-darwin-arm64-0.1.3.vsix',
    );
  });

  it('preserves the version string verbatim (does not add a "v" prefix)', () => {
    expect(buildVsixFilename('foo', 'linux-x64', '1.0.0')).toBe(
      'foo-linux-x64-1.0.0.vsix',
    );
    expect(buildVsixFilename('foo', 'linux-x64', '1.0.0-alpha.1')).toBe(
      'foo-linux-x64-1.0.0-alpha.1.vsix',
    );
  });
});

describe('parsePackagerArgs', () => {
  it('returns all supported targets + ./dist-vsix as the default', () => {
    const r = parsePackagerArgs([]);
    expect([...r.targets]).toEqual([...SUPPORTED_TARGETS]);
    expect(r.outDir).toBe('./dist-vsix');
  });

  it('parses --targets a,b,c and dedupes whitespace', () => {
    const r = parsePackagerArgs(['--targets', 'darwin-arm64, linux-x64 , win32-x64']);
    expect([...r.targets]).toEqual(['darwin-arm64', 'linux-x64', 'win32-x64']);
  });

  it('parses --out and uses it verbatim', () => {
    const r = parsePackagerArgs(['--out', '/tmp/my-vsix']);
    expect(r.outDir).toBe('/tmp/my-vsix');
  });

  it('combines --targets and --out in either order', () => {
    const r1 = parsePackagerArgs(['--out', '/x', '--targets', 'linux-x64']);
    const r2 = parsePackagerArgs(['--targets', 'linux-x64', '--out', '/x']);
    expect(r1.outDir).toBe('/x');
    expect([...r1.targets]).toEqual(['linux-x64']);
    expect(r2).toEqual(r1);
  });

  it('rejects an unknown target', () => {
    expect(() => parsePackagerArgs(['--targets', 'linux-x64,sunos-x64'])).toThrow(
      /Unknown target: sunos-x64/,
    );
  });

  it('rejects --targets with no value', () => {
    expect(() => parsePackagerArgs(['--targets'])).toThrow(/--targets requires a value/);
  });

  it('rejects --out with no value', () => {
    expect(() => parsePackagerArgs(['--out'])).toThrow(/--out requires a value/);
  });

  it('rejects an unknown argument', () => {
    expect(() => parsePackagerArgs(['--bogus'])).toThrow(/Unknown argument: --bogus/);
  });

  it('lists supported targets in the error message when given an unknown one', () => {
    expect(() => parsePackagerArgs(['--targets', 'beos-x86'])).toThrow(/linux-x64/);
  });
});
