import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, statSync, accessSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function expectFileLockedToOwner(path: string): void {
  expect(existsSync(path)).toBe(true);
  if (process.platform === 'win32') {
    expect(() => accessSync(path, constants.R_OK | constants.W_OK)).not.toThrow();
  } else {
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  }
}

vi.mock('cross-keychain', () => ({
  getPassword:    vi.fn(),
  setPassword:    vi.fn(),
  deletePassword: vi.fn(),
}));

import {
  storeNexpathToken,
  readNexpathToken,
  removeNexpathToken,
  isValidNexpathToken,
  resolveApiBaseUrl,
  DEFAULT_API_BASE_URL,
  KEYCHAIN_SERVICE,
  KEYCHAIN_ACCOUNT,
  TOKEN_PREFIX,
  TOKEN_MIN_LENGTH,
} from './NexpathTokenStore.js';
import { API_KEY_REGEX, isValidApiKey } from './ApiKeyResolver.js';
import * as keychain from 'cross-keychain';

const VALID_TOKEN   = 'npk_' + 'a'.repeat(40);
const INVALID_TOKEN  = 'sk-not-a-nexpath-token-at-all-0000000000';

let tmpDir:       string;
let fallbackPath: string;
let savedEnv:     string | undefined;

beforeEach(() => {
  tmpDir       = mkdtempSync(join(tmpdir(), 'nexpath-token-store-'));
  fallbackPath = join(tmpDir, 'config.json');
  savedEnv     = process.env.NEXPATH_API_BASE_URL;
  delete process.env.NEXPATH_API_BASE_URL;
  vi.mocked(keychain.getPassword).mockReset();
  vi.mocked(keychain.setPassword).mockReset();
  vi.mocked(keychain.deletePassword).mockReset();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  if (savedEnv === undefined) delete process.env.NEXPATH_API_BASE_URL;
  else                        process.env.NEXPATH_API_BASE_URL = savedEnv;
});

// ── Validation — never the OpenAI-key shape (RISK-2) ─────────────────────────────

// ── Constants — mirrors ApiKeyResolver.test.ts's own "the value is what I claim
// it is" assertion, which existed for KEYCHAIN_SERVICE but had no equivalent
// here for KEYCHAIN_ACCOUNT: every other test only observes it indirectly, as
// an argument a mock was called with, never as a value in its own right. ────

describe('constants', () => {
  it('KEYCHAIN_ACCOUNT is "nexpath_token" — distinct from ApiKeyResolver\'s "openai_api_key"', () => {
    expect(KEYCHAIN_ACCOUNT).toBe('nexpath_token');
  });

  it('KEYCHAIN_SERVICE matches ApiKeyResolver\'s, so both plumb through the same keychain entry', () => {
    expect(KEYCHAIN_SERVICE).toBe('nexpath');
  });
});

// ── FP-4.1's own closure condition, taken literally ─────────────────────────────
// "a stored token ... is never matched against the OpenAI-key regex." Every
// other test proves the token round-trips through its own path; none of them
// prove the cross-cutting claim this closure condition actually makes — that
// the two validators genuinely never overlap, in either direction (RISK-2).

describe('the two credential formats never validate against each other (RISK-2)', () => {
  it('a valid Nexpath token fails the OpenAI-key regex directly', () => {
    const token = TOKEN_PREFIX + 'a'.repeat(TOKEN_MIN_LENGTH - TOKEN_PREFIX.length);
    expect(isValidNexpathToken(token)).toBe(true);
    expect(API_KEY_REGEX.test(token)).toBe(false);
    expect(isValidApiKey(token)).toBe(false);
  });

  it('a valid OpenAI key fails isValidNexpathToken', () => {
    const key = 'sk-abcdefghij1234567890ABCDEFGHIJ';
    expect(isValidApiKey(key)).toBe(true);
    expect(isValidNexpathToken(key)).toBe(false);
  });
});

describe('isValidNexpathToken', () => {
  it('accepts npk_ + 40 chars', () => {
    expect(isValidNexpathToken(VALID_TOKEN)).toBe(true);
  });

  it('rejects an sk- shaped key — the two formats must never be interchangeable', () => {
    expect(isValidNexpathToken(INVALID_TOKEN)).toBe(false);
    expect(isValidNexpathToken('sk-abcdefghij1234567890ABCDEFGHIJ')).toBe(false);
  });

  it('rejects too-short values', () => {
    expect(isValidNexpathToken('npk_short')).toBe(false);
  });

  it('the length boundary is exactly TOKEN_MIN_LENGTH, pinned rather than approximate', () => {
    // 'npk_short' above is nowhere near the real boundary — a change to
    // TOKEN_MIN_LENGTH from 40 down to, say, 10 would still pass it, and
    // nothing else here checks the actual configured cutoff.
    const oneUnder = TOKEN_PREFIX + 'a'.repeat(TOKEN_MIN_LENGTH - TOKEN_PREFIX.length - 1);
    const exact    = TOKEN_PREFIX + 'a'.repeat(TOKEN_MIN_LENGTH - TOKEN_PREFIX.length);
    expect(oneUnder.length).toBe(TOKEN_MIN_LENGTH - 1);
    expect(exact.length).toBe(TOKEN_MIN_LENGTH);
    expect(isValidNexpathToken(oneUnder)).toBe(false);
    expect(isValidNexpathToken(exact)).toBe(true);
  });

  it('rejects an unprefixed value even if long enough', () => {
    expect(isValidNexpathToken('a'.repeat(40))).toBe(false);
  });

  it('rejects whitespace', () => {
    expect(isValidNexpathToken('npk_' + 'a'.repeat(20) + ' ' + 'a'.repeat(19))).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidNexpathToken('')).toBe(false);
  });
});

// ── Round trip: store / read / remove ───────────────────────────────────────────

describe('storeNexpathToken / readNexpathToken / removeNexpathToken', () => {
  it('a stored token round-trips (keychain path)', async () => {
    vi.mocked(keychain.setPassword).mockResolvedValue(undefined);
    vi.mocked(keychain.getPassword).mockResolvedValue(VALID_TOKEN);

    const result = await storeNexpathToken(VALID_TOKEN, { fallbackPath });
    expect(result.source).toBe('keychain');
    expect(keychain.setPassword).toHaveBeenCalledWith(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, VALID_TOKEN);

    const read = await readNexpathToken({ fallbackPath });
    expect(read).toBe(VALID_TOKEN);
  });

  it('falls back to the 0600 file when the keychain is unavailable, and survives a restart', async () => {
    vi.mocked(keychain.setPassword).mockRejectedValue(new Error('no keychain on this host'));
    vi.mocked(keychain.getPassword).mockRejectedValue(new Error('no keychain on this host'));

    const result = await storeNexpathToken(VALID_TOKEN, { fallbackPath });
    expect(result.source).toBe('file');
    expectFileLockedToOwner(fallbackPath);

    // "survives a process restart": read again with fresh mocks, same file.
    const read = await readNexpathToken({ fallbackPath });
    expect(read).toBe(VALID_TOKEN);
  });

  it('rejects an invalid token before ever touching storage', async () => {
    await expect(storeNexpathToken(INVALID_TOKEN, { fallbackPath })).rejects.toThrow(/Invalid Nexpath token/);
    expect(keychain.setPassword).not.toHaveBeenCalled();
    expect(existsSync(fallbackPath)).toBe(false);
  });

  it('reading with nothing stored anywhere returns null', async () => {
    vi.mocked(keychain.getPassword).mockRejectedValue(new Error('not found'));
    expect(await readNexpathToken({ fallbackPath })).toBeNull();
  });

  it('a keychain hit that is not a valid token is ignored, falling through to the file', async () => {
    // The keychain resolving is not, by itself, proof of a usable token — it
    // could hold something else entirely (a stale value, a different app's
    // reuse of the same account name). `token && isValidNexpathToken(token)`
    // has two clauses; every other test here only exercises `token` being
    // absent, never `token` being present but shaped wrong.
    vi.mocked(keychain.getPassword).mockResolvedValue('not-a-nexpath-token-at-all');
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(fallbackPath, JSON.stringify({ nexpath_token: VALID_TOKEN }), 'utf8');

    expect(await readNexpathToken({ fallbackPath })).toBe(VALID_TOKEN);
  });

  it('removing clears both the keychain and the file', async () => {
    vi.mocked(keychain.setPassword).mockRejectedValue(new Error('no keychain'));
    await storeNexpathToken(VALID_TOKEN, { fallbackPath });
    expectFileLockedToOwner(fallbackPath);

    vi.mocked(keychain.deletePassword).mockResolvedValue(undefined);
    await removeNexpathToken({ fallbackPath });

    vi.mocked(keychain.getPassword).mockRejectedValue(new Error('gone'));
    expect(await readNexpathToken({ fallbackPath })).toBeNull();
  });

  it('removing when nothing was stored does not throw', async () => {
    vi.mocked(keychain.deletePassword).mockRejectedValue(new Error('nothing to delete'));
    await expect(removeNexpathToken({ fallbackPath })).resolves.not.toThrow();
  });

  it('removing leaves a file untouched when it exists but never held a token', async () => {
    // Distinct from "no file at all": the file is present, JSON-parseable, and
    // simply has no `nexpath_token` key — e.g. an OpenAI-key-only file. The
    // `if ('nexpath_token' in parsed)` branch has otherwise only been exercised
    // by tests where the key IS present.
    vi.mocked(keychain.deletePassword).mockRejectedValue(new Error('nothing to delete'));
    const { mkdirSync, writeFileSync, readFileSync } = await import('node:fs');
    mkdirSync(tmpDir, { recursive: true });
    const original = JSON.stringify({ openai_api_key: 'sk-untouched-000000000000000000' });
    writeFileSync(fallbackPath, original, 'utf8');

    await removeNexpathToken({ fallbackPath });

    expect(readFileSync(fallbackPath, 'utf8')).toBe(original);
  });

  it('a corrupt fallback file is not fatal to a fresh store — it is replaced, not appended to blindly', async () => {
    vi.mocked(keychain.setPassword).mockRejectedValue(new Error('no keychain'));
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(join(tmpDir), { recursive: true });
    writeFileSync(fallbackPath, 'not valid json at all', 'utf8');

    await expect(storeNexpathToken(VALID_TOKEN, { fallbackPath })).resolves.toEqual({ source: 'file' });
  });
});

// ── The two keys must coexist in the same fallback file without colliding ────────

describe('coexistence with an OpenAI key in the same fallback file', () => {
  it('storing a Nexpath token does not erase an existing openai_api_key entry', async () => {
    vi.mocked(keychain.setPassword).mockRejectedValue(new Error('no keychain'));
    const { mkdirSync, writeFileSync, readFileSync } = await import('node:fs');
    mkdirSync(join(tmpDir), { recursive: true });
    writeFileSync(fallbackPath, JSON.stringify({ openai_api_key: 'sk-existing-key-000000000000000' }), 'utf8');

    await storeNexpathToken(VALID_TOKEN, { fallbackPath });

    const onDisk = JSON.parse(readFileSync(fallbackPath, 'utf8'));
    expect(onDisk.openai_api_key).toBe('sk-existing-key-000000000000000');
    expect(onDisk.nexpath_token).toBe(VALID_TOKEN);
  });

  it('removing the Nexpath token leaves an existing openai_api_key entry untouched', async () => {
    vi.mocked(keychain.setPassword).mockRejectedValue(new Error('no keychain'));
    vi.mocked(keychain.deletePassword).mockResolvedValue(undefined);
    const { mkdirSync, writeFileSync, readFileSync } = await import('node:fs');
    mkdirSync(join(tmpDir), { recursive: true });
    writeFileSync(
      fallbackPath,
      JSON.stringify({ openai_api_key: 'sk-existing-key-000000000000000', nexpath_token: VALID_TOKEN }),
      'utf8',
    );

    await removeNexpathToken({ fallbackPath });

    const onDisk = JSON.parse(readFileSync(fallbackPath, 'utf8'));
    expect(onDisk.openai_api_key).toBe('sk-existing-key-000000000000000');
    expect(onDisk.nexpath_token).toBeUndefined();
  });
});

// ── The API base (DEP-FP-04 does not exist yet) ─────────────────────────────────

describe('resolveApiBaseUrl', () => {
  it('defaults to the local-development address matching the server\'s own default', () => {
    expect(resolveApiBaseUrl()).toBe(DEFAULT_API_BASE_URL);
    expect(DEFAULT_API_BASE_URL).toBe('http://localhost:8000/v1');
  });

  it('is overridden by NEXPATH_API_BASE_URL — this is where the real domain lands, one line, at DEP-FP-04', () => {
    process.env.NEXPATH_API_BASE_URL = 'https://api.example-configured.test/v1';
    expect(resolveApiBaseUrl()).toBe('https://api.example-configured.test/v1');
  });

  it('an empty override is treated as unset rather than as a blank base URL', () => {
    process.env.NEXPATH_API_BASE_URL = '   ';
    expect(resolveApiBaseUrl()).toBe(DEFAULT_API_BASE_URL);
  });
});
