/**
 * Tool lifecycle fixes (2026-11-04, found by semi-e2e TC-E2E-25/28):
 *  - codebase-memory-mcp's graph UI is confirmed OFF before any session, without blocking.
 *  - stopFeature1Worker stops a worker that is too busy to answer, never an unrelated process,
 *    and waits until it has exited.
 * Fake programs only; nothing real is started or stopped.
 */
import { describe, it, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureUiDisabled } from '../sources/codebase-memory-driver.js';
import { stopFeature1Worker } from '../worker/tools-status.js';
import { workerPaths } from '../worker/protocol.js';

const temp = () => mkdtempSync(join(tmpdir(), 'nexpath-life-'));
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const exited = (child: ChildProcess) => new Promise<void>((r) => (child.exitCode !== null || child.signalCode !== null ? r() : child.once('exit', () => r())));

describe('codebase-memory-mcp graph UI is confirmed off', () => {
  /** A fake codebase-memory-mcp: logs its arguments; `config get ui_enabled` prints `answer`. */
  const fakeBin = (dir: string, answer: string) => {
    const bin = join(dir, 'fake-cbm.js');
    writeFileSync(bin, `require('fs').appendFileSync(${JSON.stringify(join(dir, 'calls.log'))}, process.argv.slice(2).join(' ') + '\\n');
if (process.argv[2] === 'config' && process.argv[3] === 'get') console.log(${JSON.stringify(answer)});`);
    return bin;
  };

  it('switches it off, reads back false, then writes the marker (no blocking call)', async () => {
    const dir = temp();
    try {
      const cache = join(dir, 'cache');
      const ok = await ensureUiDisabled(process.execPath, fakeBin(dir, 'false'), cache, { ...process.env } as Record<string, string>);
      expect(ok).toBe(true);
      expect(readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n')).toEqual(['config set ui_enabled false', 'config get ui_enabled']);
      expect(existsSync(join(cache, '.nexpath-ui-off'))).toBe(true);
      // second start: marker present, nothing run
      expect(await ensureUiDisabled(process.execPath, fakeBin(dir, 'false'), cache, {})).toBe(true);
      expect(readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n')).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('UI still on (or the tool fails) → false, no marker, so no session is started', async () => {
    const dir = temp();
    try {
      const cache = join(dir, 'cache');
      expect(await ensureUiDisabled(process.execPath, fakeBin(dir, 'true'), cache, {})).toBe(false);
      expect(existsSync(join(cache, '.nexpath-ui-off'))).toBe(false);
      expect(await ensureUiDisabled(process.execPath, join(dir, 'missing.js'), cache, {})).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('every session starts with --ui=false, and nothing blocks (source check)', () => {
    const src = readFileSync(new URL('../sources/codebase-memory-driver.ts', import.meta.url), 'utf8');
    expect(src).toContain("args: [bin, '--ui=false']");
    expect(src).not.toContain('spawnSync');
  });
});

describe('stopFeature1Worker', () => {
  /** A fake worker (named worker-main.js) that never answers a ping. */
  const fakeWorker = (dir: string, ignoreTerm = false) => {
    const script = join(dir, 'worker-main.js');
    writeFileSync(script, `${ignoreTerm ? "process.on('SIGTERM', () => {});" : ''} setInterval(() => {}, 1000);`);
    return spawn(process.execPath, [script], { stdio: 'ignore' });
  };
  const writePid = (home: string, pid: number) => {
    const p = workerPaths(home);
    mkdirSync(p.dir, { recursive: true });
    writeFileSync(p.pidFile, String(pid));
  };

  it('no worker, no pid file → false', async () => {
    const home = temp();
    try {
      expect(await stopFeature1Worker(home)).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('a busy worker (no ping answer) is stopped through its pid file, and waited for', async () => {
    const home = temp();
    const worker = fakeWorker(home);
    try {
      await new Promise((r) => setTimeout(r, 300));
      writePid(home, worker.pid!);
      expect(await stopFeature1Worker(home)).toBe(true);
      expect(alive(worker.pid!)).toBe(false); // already gone when it returns
    } finally {
      worker.kill('SIGKILL');
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('a worker that ignores SIGTERM is killed after the wait', async () => {
    const home = temp();
    const worker = fakeWorker(home, true);
    try {
      await new Promise((r) => setTimeout(r, 300));
      writePid(home, worker.pid!);
      expect(await stopFeature1Worker(home, { waitMs: 800 })).toBe(true);
      await exited(worker);
      expect(worker.signalCode).toBe('SIGKILL');
    } finally {
      worker.kill('SIGKILL');
      rmSync(home, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform !== 'win32')('a stale pid file pointing at another program never stops it', async () => {
    const home = temp();
    const other = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); // not worker-main.js
    try {
      await new Promise((r) => setTimeout(r, 300));
      writePid(home, other.pid!);
      expect(await stopFeature1Worker(home)).toBe(false);
      expect(alive(other.pid!)).toBe(true);
    } finally {
      other.kill('SIGKILL');
      rmSync(home, { recursive: true, force: true });
    }
  });
});
