import { describe, it, expect } from 'vitest';
import { checkPrereqs, missingPrereqMessage, cliRuns, type RunFn } from './prereq.js';

function fakeRun(map: Record<string, { status: number | null; stdout: string }>): RunFn {
  return (cmd) => map[cmd] ?? { status: 1, stdout: '' };
}

describe('checkPrereqs', () => {
  it('reports both present + versions when node and npm succeed', () => {
    const run = fakeRun({
      node: { status: 0, stdout: 'v20.11.0\n' },
      npm: { status: 0, stdout: '10.2.4\n' },
    });
    const s = checkPrereqs(run);
    expect(s.node).toEqual({ present: true, version: 'v20.11.0' });
    expect(s.npm).toEqual({ present: true, version: '10.2.4' });
    expect(s.ready).toBe(true);
  });

  it('not ready when node is missing', () => {
    const run = fakeRun({ npm: { status: 0, stdout: '10.2.4' } });
    const s = checkPrereqs(run);
    expect(s.node.present).toBe(false);
    expect(s.ready).toBe(false);
  });

  it('not ready when npm is missing', () => {
    const run = fakeRun({ node: { status: 0, stdout: 'v20.0.0' } });
    expect(checkPrereqs(run).ready).toBe(false);
  });

  it('treats a non-zero status as absent', () => {
    const run = fakeRun({ node: { status: 127, stdout: '' }, npm: { status: 127, stdout: '' } });
    const s = checkPrereqs(run);
    expect(s.node.present).toBe(false);
    expect(s.npm.present).toBe(false);
  });

  it('survives a runner that throws (ENOENT)', () => {
    const run: RunFn = () => {
      throw new Error('spawn ENOENT');
    };
    expect(checkPrereqs(run).ready).toBe(false);
  });
});

describe('missingPrereqMessage', () => {
  it('returns null when ready', () => {
    const run = fakeRun({ node: { status: 0, stdout: 'v20' }, npm: { status: 0, stdout: '10' } });
    expect(missingPrereqMessage(checkPrereqs(run))).toBeNull();
  });

  it('names the missing tools + OS-specific guidance', () => {
    const run = fakeRun({});
    const msg = missingPrereqMessage(checkPrereqs(run), 'darwin');
    expect(msg).toContain('Node.js');
    expect(msg).toContain('npm');
    expect(msg).toContain('Homebrew');
  });

  it('gives apt guidance on linux', () => {
    const run = fakeRun({ npm: { status: 0, stdout: '10' } });
    const msg = missingPrereqMessage(checkPrereqs(run), 'linux');
    expect(msg).toContain('Node.js');
    expect(msg).not.toContain('npm and');
    expect(msg).toContain('apt');
  });
});

describe('cliRuns', () => {
  it('true when the command exits 0', () => {
    const run: RunFn = () => ({ status: 0, stdout: '0.1.3' });
    expect(cliRuns('nexpath', ['--version'], run)).toBe(true);
  });

  it('false when the command exits non-zero (e.g. missing deps)', () => {
    const run: RunFn = () => ({ status: 1, stdout: '' });
    expect(cliRuns('node', ['/staged/index.js', '--version'], run)).toBe(false);
  });

  it('false when the runner throws (ENOENT)', () => {
    const run: RunFn = () => { throw new Error('spawn ENOENT'); };
    expect(cliRuns('nexpath', ['--version'], run)).toBe(false);
  });
});
