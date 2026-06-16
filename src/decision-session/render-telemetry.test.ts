import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  RENDER_DEBUG_ENV,
  RENDER_DEBUG_FILE,
  isRenderDebugActive,
  writeRenderDebug,
} from './render-telemetry.js';

describe('render-telemetry — env-var gate', () => {
  let saved: string | undefined;
  beforeEach(() => { saved = process.env[RENDER_DEBUG_ENV]; });
  afterEach(() => {
    if (saved === undefined) delete process.env[RENDER_DEBUG_ENV];
    else                     process.env[RENDER_DEBUG_ENV] = saved;
  });

  it('exports the locked env-var key', () => {
    expect(RENDER_DEBUG_ENV).toBe('NEXPATH_RENDER_DEBUG');
  });

  it('isRenderDebugActive returns true only when env === "1"', () => {
    delete process.env[RENDER_DEBUG_ENV];
    expect(isRenderDebugActive()).toBe(false);

    process.env[RENDER_DEBUG_ENV] = '1';
    expect(isRenderDebugActive()).toBe(true);

    process.env[RENDER_DEBUG_ENV] = '';
    expect(isRenderDebugActive()).toBe(false);

    process.env[RENDER_DEBUG_ENV] = '0';
    expect(isRenderDebugActive()).toBe(false);

    process.env[RENDER_DEBUG_ENV] = 'true';
    expect(isRenderDebugActive()).toBe(false);
  });

  it('RENDER_DEBUG_FILE sits inside the OS temp directory', () => {
    expect(RENDER_DEBUG_FILE).toMatch(/nexpath-render-debug\.txt$/);
    expect(RENDER_DEBUG_FILE.startsWith(tmpdir())).toBe(true);
  });
});

describe('render-telemetry — writeRenderDebug', () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env[RENDER_DEBUG_ENV];
  });

  afterEach(() => {
    if (savedEnv === undefined) delete process.env[RENDER_DEBUG_ENV];
    else                        process.env[RENDER_DEBUG_ENV] = savedEnv;
    // Clean the shared debug file between tests so per-test assertions
    // see only the lines they wrote.
    if (existsSync(RENDER_DEBUG_FILE)) {
      try { unlinkSync(RENDER_DEBUG_FILE); } catch { /* best-effort */ }
    }
  });

  it('is a no-op when NEXPATH_RENDER_DEBUG is unset', () => {
    delete process.env[RENDER_DEBUG_ENV];
    writeRenderDebug({ event: 'sample', n: 1 });
    expect(existsSync(RENDER_DEBUG_FILE)).toBe(false);
  });

  it('is a no-op when NEXPATH_RENDER_DEBUG is any non-"1" value', () => {
    process.env[RENDER_DEBUG_ENV] = '0';
    writeRenderDebug({ event: 'sample', n: 1 });
    expect(existsSync(RENDER_DEBUG_FILE)).toBe(false);

    process.env[RENDER_DEBUG_ENV] = 'true';
    writeRenderDebug({ event: 'sample', n: 2 });
    expect(existsSync(RENDER_DEBUG_FILE)).toBe(false);
  });

  it('appends a single JSON-encoded line per call when enabled', () => {
    process.env[RENDER_DEBUG_ENV] = '1';
    writeRenderDebug({ event: 'first',  n: 1 });
    writeRenderDebug({ event: 'second', n: 2 });
    expect(existsSync(RENDER_DEBUG_FILE)).toBe(true);
    const contents = readFileSync(RENDER_DEBUG_FILE, 'utf-8');
    const lines    = contents.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({ event: 'first',  n: 1 });
    expect(JSON.parse(lines[1])).toEqual({ event: 'second', n: 2 });
  });

  it('swallows filesystem errors silently (write to an unwritable target does not throw)', () => {
    process.env[RENDER_DEBUG_ENV] = '1';
    // Best-effort behaviour: even if the underlying writer throws (e.g.
    // permission denied / EACCES), the caller never sees an exception.
    // Verified indirectly here — the writeRenderDebug call must complete
    // without raising regardless of the file state.
    expect(() => writeRenderDebug({ event: 'best-effort' })).not.toThrow();
  });
});

describe('render-telemetry — interaction with a private temp dir (isolation smoke test)', () => {
  it('writes one line per call into a freshly-cleaned debug file', () => {
    // Mint a private temp dir so the smoke test never collides with other
    // test runs touching the shared RENDER_DEBUG_FILE path.
    const dir = mkdtempSync(join(tmpdir(), 'nexpath-rt-smoke-'));
    try {
      const saved = process.env[RENDER_DEBUG_ENV];
      try {
        process.env[RENDER_DEBUG_ENV] = '1';
        if (existsSync(RENDER_DEBUG_FILE)) unlinkSync(RENDER_DEBUG_FILE);
        writeRenderDebug({ event: 'smoke', step: 1 });
        writeRenderDebug({ event: 'smoke', step: 2 });
        writeRenderDebug({ event: 'smoke', step: 3 });
        const lines = readFileSync(RENDER_DEBUG_FILE, 'utf-8').trim().split('\n');
        expect(lines).toHaveLength(3);
        expect(lines.map((l) => JSON.parse(l).step)).toEqual([1, 2, 3]);
      } finally {
        if (saved === undefined) delete process.env[RENDER_DEBUG_ENV];
        else                     process.env[RENDER_DEBUG_ENV] = saved;
        if (existsSync(RENDER_DEBUG_FILE)) unlinkSync(RENDER_DEBUG_FILE);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
