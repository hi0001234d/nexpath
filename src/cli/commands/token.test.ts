import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/NexpathTokenStore.js', () => ({
  storeNexpathToken:   vi.fn(),
  removeNexpathToken:  vi.fn(),
  readNexpathToken:    vi.fn(),
  isValidNexpathToken: (v: string) => typeof v === 'string' && v.startsWith('npk_') && v.length >= 40,
  resolveApiBaseUrl:   vi.fn(() => 'http://localhost:8000/v1'),
}));

import { configSetTokenAction, configRemoveTokenAction } from './token.js';
import * as tokenStore from '../../config/NexpathTokenStore.js';

function captureOutput(): { lines: string[]; print: (line: string) => void } {
  const lines: string[] = [];
  return { lines, print: (l) => lines.push(l) };
}

const VALID_TOKEN   = 'npk_' + 'a'.repeat(40);
const INVALID_TOKEN = 'sk-not-a-token';

beforeEach(() => {
  vi.mocked(tokenStore.storeNexpathToken).mockReset().mockResolvedValue({ source: 'keychain' });
  vi.mocked(tokenStore.removeNexpathToken).mockReset().mockResolvedValue(undefined);
  vi.mocked(tokenStore.readNexpathToken).mockReset().mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── configSetTokenAction (FP-4.3: happy path, cancel, malformed) ────────────────

describe('configSetTokenAction', () => {
  it('happy path: prompts, stores the token, prints the source — and no disclosure (2026-09-01 decision)', async () => {
    const { lines, print } = captureOutput();
    await configSetTokenAction({ output: print, passwordFn: async () => VALID_TOKEN });

    expect(tokenStore.storeNexpathToken).toHaveBeenCalledWith(VALID_TOKEN);
    expect(lines.join('\n')).toContain('Nexpath token stored in keychain');
    expect(lines.filter((l) => l.includes('prompt context will be sent')).length).toBe(0);
  });

  it('reports file fallback when storeNexpathToken returns source="file"', async () => {
    vi.mocked(tokenStore.storeNexpathToken).mockResolvedValueOnce({ source: 'file' });
    const { lines, print } = captureOutput();
    await configSetTokenAction({ output: print, passwordFn: async () => VALID_TOKEN });
    expect(lines.join('\n')).toContain('Nexpath token stored in file');
  });

  it('cancel: a null from passwordFn stores nothing', async () => {
    const { lines, print } = captureOutput();
    await configSetTokenAction({ output: print, passwordFn: async () => null });

    expect(tokenStore.storeNexpathToken).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('Cancelled');
  });

  it('an empty string from passwordFn is treated as a cancel', async () => {
    const { lines, print } = captureOutput();
    await configSetTokenAction({ output: print, passwordFn: async () => '' });
    expect(tokenStore.storeNexpathToken).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('Cancelled');
  });

  it('a malformed token propagates the store\'s rejection rather than being silently accepted', async () => {
    vi.mocked(tokenStore.storeNexpathToken).mockRejectedValueOnce(new Error('Invalid Nexpath token format'));
    await expect(
      configSetTokenAction({ output: () => {}, passwordFn: async () => INVALID_TOKEN }),
    ).rejects.toThrow(/Invalid Nexpath token/);
  });

  it('⛔ honesty guard: never claims "nothing leaves your machine" — untrue in token mode', async () => {
    const { lines, print } = captureOutput();
    await configSetTokenAction({ output: print, passwordFn: async () => VALID_TOKEN });
    const text = lines.join('\n').toLowerCase();
    expect(text).not.toContain('nothing leaves your machine');
  });

  it('set-token output never names the service host (the disclosure line is gone, 2026-09-01)', async () => {
    vi.mocked(tokenStore.resolveApiBaseUrl).mockReturnValue('https://configured-for-this-test.example/v1');
    const { lines, print } = captureOutput();
    await configSetTokenAction({ output: print, passwordFn: async () => VALID_TOKEN });
    expect(lines.join('\n')).not.toContain('configured-for-this-test.example');
  });
});

// ── configRemoveTokenAction ──────────────────────────────────────────────────────

describe('configRemoveTokenAction', () => {
  it('reports removal when a token was actually present', async () => {
    vi.mocked(tokenStore.readNexpathToken).mockResolvedValueOnce(VALID_TOKEN);
    const { lines, print } = captureOutput();
    await configRemoveTokenAction({ output: print });

    expect(tokenStore.removeNexpathToken).toHaveBeenCalled();
    expect(lines.join('\n')).toContain('Nexpath token removed');
  });

  it('reports nothing-stored when there was no token, even if an OpenAI key exists elsewhere', async () => {
    vi.mocked(tokenStore.readNexpathToken).mockResolvedValueOnce(null);
    const { lines, print } = captureOutput();
    await configRemoveTokenAction({ output: print });
    expect(lines.join('\n')).toContain('No Nexpath token was stored');
  });
});

// ── no user-facing disclosure (2026-09-01) ───────────────────────────────────

describe('set-token output carries no privacy/disclosure statements', () => {
  it('prints only the stored-confirmation — no data-flow or storage sentences (product decision 2026-09-01)', async () => {
    const lines: string[] = [];
    await configSetTokenAction({
      output: (l) => { lines.push(l); },
      passwordFn: async () => 'npk_0123456789abcdefghij',
    });
    const all = lines.join(' ').toLowerCase();
    expect(all).toContain('nexpath token stored');
    expect(all).not.toContain('prompt context');
    expect(all).not.toContain('stores no prompt');
    expect(all).not.toContain('sent to');
  });
});
