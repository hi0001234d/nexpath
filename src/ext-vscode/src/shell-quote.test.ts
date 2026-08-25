/**
 * ⭐ RC66 — spaces in Windows paths broke every `shell: true` spawn that
 * carried a path token (marketplace tester "SALVI GAURAV", 2026-08-25):
 * the staged-CLI health probe reported a HEALTHY install as "dependencies
 * missing/incomplete" forever (endless re-setup + an error toast after every
 * run), and the ipc auto/stop spawns carried the same hazard in both their
 * NEXPATH_BIN shim path and the `--db` arg. Node's DEP0190 names the exact
 * mechanism: with a shell, args are concatenated UNQUOTED.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { quoteForWindowsShell, shellSafeSpawnTokens } from './shell-quote.js';

describe('⭐ RC66 — quoteForWindowsShell', () => {
  it('⭐ a token with a space is wrapped in quotes', () => {
    expect(quoteForWindowsShell('C:\\Users\\SALVI GAURAV\\.nexpath\\cli\\0.1.4\\dist\\cli\\index.js'))
      .toBe('"C:\\Users\\SALVI GAURAV\\.nexpath\\cli\\0.1.4\\dist\\cli\\index.js"');
  });

  it('⭐ a token WITHOUT whitespace is returned UNCHANGED — space-free machines spawn byte-identical lines', () => {
    for (const t of ['node', 'npm', 'nexpath', '--version', 'auto', '--db',
      'C:\\Users\\padal\\.nexpath\\bin\\nexpath.cmd']) {
      expect(quoteForWindowsShell(t)).toBe(t);
    }
  });

  it('embedded quotes are stripped, not escaped (RC29 rule: `"` cannot appear in a Windows path)', () => {
    expect(quoteForWindowsShell('C:\\bad "dir"\\x.js')).toBe('"C:\\bad dir\\x.js"');
  });

  it('tabs count as whitespace too', () => {
    expect(quoteForWindowsShell('a\tb')).toBe('"a\tb"');
  });
});

describe('⭐ RC66 — shellSafeSpawnTokens', () => {
  const bin = 'C:\\Users\\SALVI GAURAV\\.nexpath\\bin\\nexpath.cmd';
  const args = ['auto', '--db', 'C:\\Users\\SALVI GAURAV\\.nexpath\\prompts.db'];

  it('⭐ win32: bin AND spaced args are quoted, plain args untouched', () => {
    const safe = shellSafeSpawnTokens(bin, args, 'win32');
    expect(safe.bin).toBe(`"${bin}"`);
    expect(safe.args).toEqual(['auto', '--db', '"C:\\Users\\SALVI GAURAV\\.nexpath\\prompts.db"']);
  });

  it('⭐ off win32 the tokens pass through untouched (no shell is used there)', () => {
    for (const p of ['linux', 'darwin'] as const) {
      expect(shellSafeSpawnTokens(bin, args, p)).toEqual({ bin, args });
    }
  });
});

/**
 * The mechanism itself, live: the exact spawn pattern the probe used fails on
 * a spaced path when unquoted and succeeds when quoted. `shell: true` arg
 * concatenation behaves the same on every OS, so this pin is honest off
 * Windows too (posix sh double-quotes have the same grouping semantics).
 */
describe('⭐ RC66 — live spawn proof: quoting is what fixes the spaced path', () => {
  it('⭐ unquoted spaced path fails under a shell; the quoted token succeeds', () => {
    const root = mkdtempSync(join(tmpdir(), 'rc66-'));
    const spaced = join(root, 'SALVI GAURAV', 'dist');
    mkdirSync(spaced, { recursive: true });
    const entry = join(spaced, 'index.js');
    writeFileSync(entry, 'console.log("0.1.4")');
    const broken = spawnSync('node', [entry, '--version'], { shell: true, encoding: 'utf8', timeout: 10_000 });
    const fixed = spawnSync('node', [quoteForWindowsShell(entry), '--version'], { shell: true, encoding: 'utf8', timeout: 10_000 });
    rmSync(root, { recursive: true, force: true });
    expect(broken.status).not.toBe(0); // the shipped 0.1.33 behaviour on this machine
    expect(fixed.status).toBe(0);
    expect((fixed.stdout ?? '').trim()).toBe('0.1.4');
  });
});
