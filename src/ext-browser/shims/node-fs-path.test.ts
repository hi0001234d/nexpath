import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from './node-fs.js';
import { join } from './node-path.js';

describe('node-fs shim — absent-filesystem semantics', () => {
  it('existsSync is always false (routes the engine through its absent-path branches)', () => {
    expect(existsSync('/any/path')).toBe(false);
    expect(existsSync(join('https://bolt.new/~/sb1-abc', 'package.json'))).toBe(false);
  });

  it('readFileSync throws an ENOENT-shaped error (matches what engine readers catch)', () => {
    try {
      readFileSync('/proj/tsconfig.json', 'utf8');
      expect.unreachable('readFileSync must throw');
    } catch (err) {
      expect((err as Error & { code?: string }).code).toBe('ENOENT');
      expect(String(err)).toContain('tsconfig.json');
    }
  });
});

describe('node-path shim — join', () => {
  it('joins segments POSIX-style and collapses duplicate separators', () => {
    expect(join('/home/u/proj', 'src/prompt-enhancement')).toBe('/home/u/proj/src/prompt-enhancement');
    expect(join('/home/u/proj/', '/tsconfig.json')).toBe('/home/u/proj/tsconfig.json');
  });

  it('drops empty segments and returns "." for no input (node parity for the used surface)', () => {
    expect(join('', 'a', '', 'b')).toBe('a/b');
    expect(join()).toBe('.');
  });

  it('handles the URL-derived project roots the browser actually passes', () => {
    // A https origin root keeps its protocol intact apart from separator collapse —
    // the result only ever feeds the absent-answer fs shim, never a real filesystem.
    expect(join('https://replit.com/@user/proj'.replace('https://', ''), '.gitignore'))
      .toBe('replit.com/@user/proj/.gitignore');
  });
});
