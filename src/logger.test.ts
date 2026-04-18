import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual };
});
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Helpers ───────────────────────────────────────────────────────────────────

const tmpLog = join(tmpdir(), `nexpath-test-${process.pid}.log`);

function cleanLog(): void {
  if (existsSync(tmpLog)) unlinkSync(tmpLog);
}

// Re-import logger with patched LOG_PATH for each test
async function makeLogger(level = 'debug') {
  vi.resetModules();
  process.env.NEXPATH_LOG_LEVEL = level;
  const mod = await import('./logger.js');
  // Patch LOG_PATH via the module's exported path — we'll spy on appendFileSync instead
  return mod;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('logger', () => {
  beforeEach(() => {
    cleanLog();
    vi.resetModules();
    delete process.env.NEXPATH_LOG_LEVEL;
  });

  afterEach(() => {
    cleanLog();
    vi.restoreAllMocks();
    delete process.env.NEXPATH_LOG_LEVEL;
  });

  it('resolves log level from NEXPATH_LOG_LEVEL env var', async () => {
    process.env.NEXPATH_LOG_LEVEL = 'warn';
    const { initLogger, log, LOG_PATH } = await import('./logger.js');
    const appendSpy = vi.spyOn(await import('node:fs'), 'appendFileSync').mockImplementation(() => {});
    vi.spyOn(await import('node:fs'), 'existsSync').mockReturnValue(false);
    vi.spyOn(await import('node:fs'), 'mkdirSync').mockImplementation(() => undefined as never);

    initLogger('test');
    log('debug', 'should_be_suppressed');
    log('warn', 'should_appear');

    const calls = appendSpy.mock.calls.filter((c) => c[0] === LOG_PATH);
    expect(calls.some((c) => String(c[1]).includes('should_appear'))).toBe(true);
    expect(calls.some((c) => String(c[1]).includes('should_be_suppressed'))).toBe(false);
  });

  it('initLogger overrides env var level', async () => {
    process.env.NEXPATH_LOG_LEVEL = 'error';
    const { initLogger, log, LOG_PATH } = await import('./logger.js');
    const appendSpy = vi.spyOn(await import('node:fs'), 'appendFileSync').mockImplementation(() => {});
    vi.spyOn(await import('node:fs'), 'existsSync').mockReturnValue(false);
    vi.spyOn(await import('node:fs'), 'mkdirSync').mockImplementation(() => undefined as never);

    initLogger('test', 'info');
    log('info', 'visible');
    log('debug', 'hidden');

    const calls = appendSpy.mock.calls.filter((c) => c[0] === LOG_PATH);
    expect(calls.some((c) => String(c[1]).includes('visible'))).toBe(true);
    expect(calls.some((c) => String(c[1]).includes('hidden'))).toBe(false);
  });

  it('log line format includes timestamp, level, command, event', async () => {
    const { initLogger, log, LOG_PATH } = await import('./logger.js');
    let written = '';
    vi.spyOn(await import('node:fs'), 'appendFileSync').mockImplementation((_p, data) => {
      if (_p === LOG_PATH) written += String(data);
    });
    vi.spyOn(await import('node:fs'), 'existsSync').mockReturnValue(false);
    vi.spyOn(await import('node:fs'), 'mkdirSync').mockImplementation(() => undefined as never);

    initLogger('auto', 'info');
    log('info', 'pipeline_done', { outcome: 'no_action' });

    expect(written).toMatch(/\[\d{4}-\d{2}-\d{2}T/);   // ISO timestamp
    expect(written).toContain('[INFO ]');
    expect(written).toContain('[auto]');
    expect(written).toContain('pipeline_done');
    expect(written).toContain('"outcome":"no_action"');
  });

  it('log never throws even if appendFileSync throws', async () => {
    const { initLogger, log } = await import('./logger.js');
    vi.spyOn(await import('node:fs'), 'appendFileSync').mockImplementation(() => { throw new Error('disk full'); });
    vi.spyOn(await import('node:fs'), 'existsSync').mockReturnValue(false);
    vi.spyOn(await import('node:fs'), 'mkdirSync').mockImplementation(() => undefined as never);

    initLogger('auto', 'info');
    expect(() => log('error', 'boom')).not.toThrow();
  });

  it('logger.error, warn, info, debug are all callable', async () => {
    const { logger, initLogger } = await import('./logger.js');
    vi.spyOn(await import('node:fs'), 'appendFileSync').mockImplementation(() => {});
    vi.spyOn(await import('node:fs'), 'existsSync').mockReturnValue(false);
    vi.spyOn(await import('node:fs'), 'mkdirSync').mockImplementation(() => undefined as never);

    initLogger('test', 'debug');
    expect(() => logger.error('e')).not.toThrow();
    expect(() => logger.warn('w')).not.toThrow();
    expect(() => logger.info('i')).not.toThrow();
    expect(() => logger.debug('d')).not.toThrow();
  });

  it('LOG_PATH is exported as a string containing nexpath.log', async () => {
    const { LOG_PATH } = await import('./logger.js');
    expect(typeof LOG_PATH).toBe('string');
    expect(LOG_PATH).toContain('nexpath.log');
  });
});
