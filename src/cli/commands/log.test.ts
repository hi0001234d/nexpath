import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logAction } from './log.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual };
});

vi.mock('../../logger.js', () => ({
  LOG_PATH: '/fake/.nexpath/nexpath.log',
}));

describe('logAction', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('prints message when log file does not exist', async () => {
    const fs = await import('node:fs');
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logAction();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('No log file yet'));
  });

  it('prints last 50 lines by default', async () => {
    const fs = await import('node:fs');
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const lines = Array.from({ length: 100 }, (_, i) => `[2026] [INFO ] [auto] event_${i}`).join('\n');
    vi.spyOn(fs, 'readFileSync').mockReturnValue(lines as never);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logAction();
    const output: string = spy.mock.calls[0][0] as string;
    const printed = output.split('\n');
    expect(printed).toHaveLength(50);
    expect(printed[0]).toContain('event_50');
  });

  it('respects --tail option', async () => {
    const fs = await import('node:fs');
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const lines = Array.from({ length: 20 }, (_, i) => `line_${i}`).join('\n');
    vi.spyOn(fs, 'readFileSync').mockReturnValue(lines as never);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logAction({ tail: 5 });
    const output: string = spy.mock.calls[0][0] as string;
    expect(output.split('\n')).toHaveLength(5);
  });

  it('filters by level when --level is given', async () => {
    const fs = await import('node:fs');
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const lines = [
      '[2026] [INFO ] [auto] event_a',
      '[2026] [DEBUG] [auto] event_b',
      '[2026] [INFO ] [auto] event_c',
    ].join('\n');
    vi.spyOn(fs, 'readFileSync').mockReturnValue(lines as never);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logAction({ level: 'debug' });
    const output: string = spy.mock.calls[0][0] as string;
    expect(output).toContain('event_b');
    expect(output).not.toContain('event_a');
  });

  it('prints no entries message when filter matches nothing', async () => {
    const fs = await import('node:fs');
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('[2026] [INFO ] [auto] event' as never);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logAction({ level: 'error' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('No log entries match'));
  });
});
