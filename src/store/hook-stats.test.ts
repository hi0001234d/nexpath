import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function freshModule() {
  vi.resetModules();
  return import('./hook-stats.js');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('readHookStats', () => {
  beforeEach(() => vi.resetModules());

  it('returns empty object when file does not exist', async () => {
    const fs = await import('node:fs');
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const { readHookStats } = await freshModule();
    expect(readHookStats()).toEqual({});
  });

  it('returns empty object when file is malformed JSON', async () => {
    const fs = await import('node:fs');
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('not-json' as never);
    const { readHookStats } = await freshModule();
    expect(readHookStats()).toEqual({});
  });

  it('returns parsed stats when file is valid', async () => {
    const fs = await import('node:fs');
    const data = { '/my/project': { projectRoot: '/my/project', lastRunAt: '2026-04-19T00:00:00Z', invocationCount: 3, lastOutcome: 'no_action' } };
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(data) as never);
    const { readHookStats } = await freshModule();
    expect(readHookStats()).toEqual(data);
  });
});

describe('writeHookStats', () => {
  beforeEach(() => vi.resetModules());

  it('creates entry for new project root', async () => {
    const fs = await import('node:fs');
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);
    let written = '';
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{}' as never);
    vi.spyOn(fs, 'writeFileSync').mockImplementation((_p, data) => { written = String(data); });

    const { writeHookStats } = await freshModule();
    writeHookStats('/my/project', 'no_action');

    const parsed = JSON.parse(written);
    expect(parsed['/my/project'].projectRoot).toBe('/my/project');
    expect(parsed['/my/project'].invocationCount).toBe(1);
    expect(parsed['/my/project'].lastOutcome).toBe('no_action');
    expect(parsed['/my/project'].lastRunAt).toBeTruthy();
  });

  it('increments invocationCount for existing project', async () => {
    const fs = await import('node:fs');
    const existing = { '/p': { projectRoot: '/p', lastRunAt: '2026-04-19T00:00:00Z', invocationCount: 5, lastOutcome: 'skipped' } };
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(existing) as never);
    let written = '';
    vi.spyOn(fs, 'writeFileSync').mockImplementation((_p, data) => { written = String(data); });

    const { writeHookStats } = await freshModule();
    writeHookStats('/p', 'selected');

    const parsed = JSON.parse(written);
    expect(parsed['/p'].invocationCount).toBe(6);
    expect(parsed['/p'].lastOutcome).toBe('selected');
  });

  it('never throws on writeFileSync failure', async () => {
    const fs = await import('node:fs');
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{}' as never);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('disk full'); });

    const { writeHookStats } = await freshModule();
    expect(() => writeHookStats('/p', 'no_action')).not.toThrow();
  });
});
