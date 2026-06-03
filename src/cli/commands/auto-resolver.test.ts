import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';

vi.mock('../../config/ApiKeyResolver.js', () => ({
  resolveOpenAIKey: vi.fn().mockResolvedValue(null),
  getKeySource:     vi.fn().mockResolvedValue('none'),
}));

vi.mock('../../telemetry/index.js', () => ({
  writeTelemetry: vi.fn(),
  TELEMETRY_PATH: '/mock/telemetry.jsonl',
}));

import * as resolver from '../../config/ApiKeyResolver.js';

let savedEnvKey: string | undefined;

beforeEach(() => {
  savedEnvKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  vi.mocked(resolver.resolveOpenAIKey).mockClear();
  vi.mocked(resolver.getKeySource).mockClear();
});

afterEach(() => {
  if (savedEnvKey === undefined) delete process.env.OPENAI_API_KEY;
  else                            process.env.OPENAI_API_KEY = savedEnvKey;
  vi.restoreAllMocks();
});

async function runAutoCommand(args: string[]): Promise<void> {
  const { Command } = await import('commander');
  const { registerAutoCommand } = await import('./auto.js');
  const program = new Command();
  program.exitOverride();
  registerAutoCommand(program);

  const originalStdin = process.stdin;
  const stream = new PassThrough();
  (stream as unknown as Record<string, unknown>).isTTY = true;
  Object.defineProperty(process, 'stdin', { value: stream, writable: true, configurable: true });

  try {
    await program.parseAsync(['node', 'nexpath', 'auto', ...args]);
  } catch {
    /* exitOverride may throw — fine */
  } finally {
    Object.defineProperty(process, 'stdin', { value: originalStdin, writable: true, configurable: true });
  }
}

describe('auto.ts → ApiKeyResolver wiring', () => {
  it('calls resolveOpenAIKey with the supplied --project path', async () => {
    await runAutoCommand(['--project', '/explicit/project', '--db', ':memory:', 'ok']);
    expect(resolver.resolveOpenAIKey).toHaveBeenCalledTimes(1);
    expect(resolver.resolveOpenAIKey).toHaveBeenCalledWith('/explicit/project');
  });

  it('calls getKeySource with the same --project path (for the env_load debug log)', async () => {
    await runAutoCommand(['--project', '/explicit/project', '--db', ':memory:', 'ok']);
    expect(resolver.getKeySource).toHaveBeenCalledWith('/explicit/project');
  });

  it('defaults the project to process.cwd() when --project is not supplied', async () => {
    await runAutoCommand(['--db', ':memory:', 'ok']);
    expect(resolver.resolveOpenAIKey).toHaveBeenCalledWith(process.cwd());
  });

  it('auto continues without crashing when the resolver returns null (no key source found)', async () => {
    vi.mocked(resolver.resolveOpenAIKey).mockResolvedValueOnce(null);
    await expect(runAutoCommand(['--db', ':memory:', 'ok'])).resolves.toBeUndefined();
  });

  it('auto continues when resolveOpenAIKey resolves with a valid key', async () => {
    vi.mocked(resolver.resolveOpenAIKey).mockResolvedValueOnce('sk-abcdefghij1234567890abcdefghij');
    await expect(runAutoCommand(['--db', ':memory:', 'ok'])).resolves.toBeUndefined();
    expect(resolver.resolveOpenAIKey).toHaveBeenCalledTimes(1);
  });

  it('logs a warn line "openai_api_key_missing" when no source produces a key', async () => {
    vi.mocked(resolver.resolveOpenAIKey).mockResolvedValueOnce(null);
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('none');

    const logger = await import('../../logger.js');
    const warnSpy = vi.spyOn(logger.logger, 'warn');

    await runAutoCommand(['--db', ':memory:', 'ok']);

    const warnEvents = warnSpy.mock.calls.map(c => c[0]);
    expect(warnEvents).toContain('openai_api_key_missing');
  });

  it('does NOT log "openai_api_key_missing" when the resolver promotes a valid key', async () => {
    vi.mocked(resolver.resolveOpenAIKey).mockImplementationOnce(async () => {
      process.env.OPENAI_API_KEY = 'sk-abcdefghij1234567890abcdefghij';
      return process.env.OPENAI_API_KEY;
    });
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('env');

    const logger = await import('../../logger.js');
    const warnSpy = vi.spyOn(logger.logger, 'warn');

    await runAutoCommand(['--db', ':memory:', 'ok']);

    const warnEvents = warnSpy.mock.calls.map(c => c[0]);
    expect(warnEvents).not.toContain('openai_api_key_missing');
  });

  it('env_load debug line carries the plan-mandated fields: cwd, project, keySource, keyFound', async () => {
    vi.mocked(resolver.resolveOpenAIKey).mockResolvedValueOnce(null);
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');

    const logger = await import('../../logger.js');
    const debugSpy = vi.spyOn(logger.logger, 'debug');

    await runAutoCommand(['--project', '/explicit/project', '--db', ':memory:', 'ok']);

    const envLoadCall = debugSpy.mock.calls.find(c => c[0] === 'env_load');
    expect(envLoadCall).toBeDefined();
    const payload = envLoadCall![1] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['cwd', 'keyFound', 'keySource', 'project']);
    expect(payload.project).toBe('/explicit/project');
    expect(payload.keySource).toBe('keychain');
    expect(typeof payload.cwd).toBe('string');
    expect(typeof payload.keyFound).toBe('boolean');
  });

  it('keyFound reflects process.env.OPENAI_API_KEY presence after the resolver runs', async () => {
    vi.mocked(resolver.resolveOpenAIKey).mockImplementationOnce(async () => {
      process.env.OPENAI_API_KEY = 'sk-abcdefghij1234567890abcdefghij';
      return process.env.OPENAI_API_KEY;
    });
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('env');

    const logger = await import('../../logger.js');
    const debugSpy = vi.spyOn(logger.logger, 'debug');

    await runAutoCommand(['--db', ':memory:', 'ok']);

    const envLoadCall = debugSpy.mock.calls.find(c => c[0] === 'env_load');
    expect(envLoadCall).toBeDefined();
    const payload = envLoadCall![1] as Record<string, unknown>;
    expect(payload.keyFound).toBe(true);
    expect(payload.keySource).toBe('env');
  });

  it('env_load debug payload no longer carries the removed envPath / envExists fields (regression guard)', async () => {
    vi.mocked(resolver.resolveOpenAIKey).mockResolvedValueOnce(null);
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('none');

    const logger = await import('../../logger.js');
    const debugSpy = vi.spyOn(logger.logger, 'debug');

    await runAutoCommand(['--db', ':memory:', 'ok']);

    const envLoadCall = debugSpy.mock.calls.find(c => c[0] === 'env_load');
    expect(envLoadCall).toBeDefined();
    const payload = envLoadCall![1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('envPath');
    expect(payload).not.toHaveProperty('envExists');
  });

  it('warn line "openai_api_key_missing" carries project + actionable hint', async () => {
    vi.mocked(resolver.resolveOpenAIKey).mockResolvedValueOnce(null);
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('none');

    const logger = await import('../../logger.js');
    const warnSpy = vi.spyOn(logger.logger, 'warn');

    await runAutoCommand(['--project', '/explicit/project', '--db', ':memory:', 'ok']);

    const warnCall = warnSpy.mock.calls.find(c => c[0] === 'openai_api_key_missing');
    expect(warnCall).toBeDefined();
    const payload = warnCall![1] as Record<string, unknown>;
    expect(payload.project).toBe('/explicit/project');
    expect(typeof payload.actionable).toBe('string');
    expect((payload.actionable as string).length).toBeGreaterThan(0);
  });

  it('resolver is awaited before logger initialisation downstream', async () => {
    let resolveResolver!: (v: string | null) => void;
    vi.mocked(resolver.resolveOpenAIKey).mockReturnValueOnce(
      new Promise<string | null>(r => { resolveResolver = r; }),
    );
    const runPromise = runAutoCommand(['--db', ':memory:', 'ok']);
    await new Promise(r => setTimeout(r, 50));
    expect(resolver.getKeySource).not.toHaveBeenCalled();
    resolveResolver(null);
    await runPromise;
    expect(resolver.getKeySource).toHaveBeenCalled();
  });
});
