import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/ApiKeyResolver.js', () => ({
  storeApiKey:    vi.fn(),
  removeApiKey:   vi.fn(),
  getKeySource:   vi.fn(),
  isValidApiKey:  (key: string) => /^sk-[A-Za-z0-9_-]{20,}$/.test(key),
}));

import {
  configSetApiKeyAction,
  configRotateApiKeyAction,
  configShowKeySourceAction,
  configRemoveApiKeyAction,
} from './config.js';
import * as resolver from '../../config/ApiKeyResolver.js';

function captureOutput(): { lines: string[]; print: (line: string) => void } {
  const lines: string[] = [];
  return { lines, print: (l) => lines.push(l) };
}

const VALID_KEY = 'sk-abcdefghij1234567890abcdefghij';

beforeEach(() => {
  vi.mocked(resolver.storeApiKey).mockReset().mockResolvedValue({ source: 'keychain' });
  vi.mocked(resolver.removeApiKey).mockReset().mockResolvedValue(undefined);
  vi.mocked(resolver.getKeySource).mockReset().mockResolvedValue('none');
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
});

// ── configSetApiKeyAction ────────────────────────────────────────────────────

describe('configSetApiKeyAction', () => {
  it('prompts, validates the key, calls storeApiKey, and prints the storage source', async () => {
    const { lines, print } = captureOutput();
    await configSetApiKeyAction({
      output:     print,
      passwordFn: async () => VALID_KEY,
    });
    expect(resolver.storeApiKey).toHaveBeenCalledWith(VALID_KEY);
    expect(lines.join('\n')).toContain('API key stored in keychain');
  });

  it('reports file fallback when storeApiKey returns source="file"', async () => {
    vi.mocked(resolver.storeApiKey).mockResolvedValueOnce({ source: 'file' });
    const { lines, print } = captureOutput();
    await configSetApiKeyAction({
      output:     print,
      passwordFn: async () => VALID_KEY,
    });
    expect(lines.join('\n')).toContain('API key stored in file');
  });

  it('prints "Cancelled" and skips storeApiKey when user cancels the prompt', async () => {
    const { lines, print } = captureOutput();
    await configSetApiKeyAction({
      output:     print,
      passwordFn: async () => null,
    });
    expect(resolver.storeApiKey).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('Cancelled');
  });
});

// ── configRotateApiKeyAction ─────────────────────────────────────────────────

describe('configRotateApiKeyAction', () => {
  it('errors with exit code 1 when no existing key is stored', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('none');
    const { lines, print } = captureOutput();
    await configRotateApiKeyAction({
      output:     print,
      passwordFn: async () => VALID_KEY,
    });
    expect(process.exitCode).toBe(1);
    expect(resolver.storeApiKey).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('No existing API key to rotate');
  });

  it('rotates when an existing key is present and reports the previous source', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    const { lines, print } = captureOutput();
    await configRotateApiKeyAction({
      output:     print,
      confirmFn:  async () => true,
      passwordFn: async () => VALID_KEY,
    });
    expect(resolver.storeApiKey).toHaveBeenCalledWith(VALID_KEY);
    const text = lines.join('\n');
    expect(text).toContain('rotated');
    expect(text).toContain('was in keychain');
  });

  it('cancelled password prompt retains the existing key (no storeApiKey call)', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    const { lines, print } = captureOutput();
    await configRotateApiKeyAction({
      output:     print,
      confirmFn:  async () => true,
      passwordFn: async () => null,
    });
    expect(resolver.storeApiKey).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('existing API key retained');
  });

  it('declined overwrite confirmation skips the password prompt and storeApiKey', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    const passwordFn = vi.fn<() => Promise<string | null>>().mockResolvedValue(VALID_KEY);
    const { lines, print } = captureOutput();
    await configRotateApiKeyAction({
      output:     print,
      confirmFn:  async () => false,
      passwordFn,
    });
    expect(passwordFn).not.toHaveBeenCalled();
    expect(resolver.storeApiKey).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('existing API key retained');
  });

  it('prints which layer holds the existing key before asking for confirmation', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('file');
    const { lines, print } = captureOutput();
    await configRotateApiKeyAction({
      output:     print,
      confirmFn:  async () => false,
      passwordFn: async () => null,
    });
    expect(lines.join('\n')).toContain('Existing API key is stored in file');
  });
});

// ── configShowKeySourceAction ────────────────────────────────────────────────

describe('configShowKeySourceAction', () => {
  it.each(['env', 'dotenv', 'keychain', 'file', 'none'] as const)(
    'prints the source returned by getKeySource: %s',
    async (source) => {
      vi.mocked(resolver.getKeySource).mockResolvedValueOnce(source);
      const { lines, print } = captureOutput();
      await configShowKeySourceAction({ output: print });
      expect(lines.join('\n')).toContain(`API key source: ${source}`);
    },
  );

  it('uses projectRoot from opts when supplied', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    const { print } = captureOutput();
    await configShowKeySourceAction({ output: print, projectRoot: '/explicit/project' });
    expect(resolver.getKeySource).toHaveBeenCalledWith('/explicit/project');
  });
});

// ── configRemoveApiKeyAction ─────────────────────────────────────────────────

describe('configRemoveApiKeyAction', () => {
  it('calls removeApiKey and reports the previous source', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    const { lines, print } = captureOutput();
    await configRemoveApiKeyAction({ output: print });
    expect(resolver.removeApiKey).toHaveBeenCalledTimes(1);
    expect(lines.join('\n')).toContain('API key removed (was in keychain)');
  });

  it('reports "No API key was stored" when getKeySource returns "none"', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('none');
    const { lines, print } = captureOutput();
    await configRemoveApiKeyAction({ output: print });
    expect(lines.join('\n')).toContain('No API key was stored');
  });

  it('removeApiKey is called regardless of getKeySource result (defensive cleanup)', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('none');
    const { print } = captureOutput();
    await configRemoveApiKeyAction({ output: print });
    expect(resolver.removeApiKey).toHaveBeenCalledTimes(1);
  });
});
