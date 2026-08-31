import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/NexpathTokenStore.js', () => ({
  storeNexpathToken:   vi.fn(),
  removeNexpathToken:  vi.fn(),
  readNexpathToken:    vi.fn(),
  isValidNexpathToken: (v: string) => typeof v === 'string' && v.startsWith('npk_') && v.length >= 40,
  resolveApiBaseUrl:   vi.fn(() => 'http://localhost:8000/v1'),
}));

import { configSetTokenAction, configRemoveTokenAction, modeBDisclosureLine } from './token.js';
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
  it('happy path: prompts, stores the token, prints the source and the disclosure exactly once', async () => {
    const { lines, print } = captureOutput();
    await configSetTokenAction({ output: print, passwordFn: async () => VALID_TOKEN });

    expect(tokenStore.storeNexpathToken).toHaveBeenCalledWith(VALID_TOKEN);
    expect(lines.join('\n')).toContain('Nexpath token stored in keychain');

    const disclosureOccurrences = lines.filter((l) => l.includes('prompt context will be sent')).length;
    expect(disclosureOccurrences).toBe(1);
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

  it('⛔ D-6: never claims "nothing leaves your machine" — it would be untrue in Mode B', async () => {
    const { lines, print } = captureOutput();
    await configSetTokenAction({ output: print, passwordFn: async () => VALID_TOKEN });
    const text = lines.join('\n').toLowerCase();
    expect(text).not.toContain('nothing leaves your machine');
  });

  it('the disclosure names the actually-configured host, not a hardcoded string', async () => {
    vi.mocked(tokenStore.resolveApiBaseUrl).mockReturnValueOnce('https://configured-for-this-test.example/v1');
    const { lines, print } = captureOutput();
    await configSetTokenAction({ output: print, passwordFn: async () => VALID_TOKEN });
    expect(lines.join('\n')).toContain('https://configured-for-this-test.example/v1');
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

// ── modeBDisclosureLine ────────────────────────────────────────────────────────

describe('modeBDisclosureLine', () => {
  it('states plainly that prompt context leaves the machine, and that no prompt text is stored', () => {
    const line = modeBDisclosureLine().toLowerCase();
    expect(line).toContain('prompt context will be sent');
    expect(line).toContain('stores no prompt text');
  });
});
