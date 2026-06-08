import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, statSync, existsSync, accessSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// NTFS does not enforce POSIX permission bits. On Windows, assert the file
// exists and is owner-accessible (R_OK | W_OK) instead of inspecting the mode.
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
  resolveOpenAIKey,
  storeApiKey,
  removeApiKey,
  getKeySource,
  isValidApiKey,
  KEYCHAIN_SERVICE,
  KEYCHAIN_ACCOUNT,
  API_KEY_REGEX,
} from './ApiKeyResolver.js';
import * as keychain from 'cross-keychain';

const VALID_KEY  = 'sk-abcdefghij1234567890ABCDEFGHIJ';
const VALID_KEY2 = 'sk-zyxwvutsrq0987654321ABCDEFGHIJ';
const INVALID_KEY = 'not-a-valid-key';

let tmpDir:        string;
let fallbackPath:  string;
let projectRoot:   string;
let savedEnvKey:   string | undefined;

beforeEach(() => {
  tmpDir        = mkdtempSync(join(tmpdir(), 'nexpath-resolver-'));
  fallbackPath  = join(tmpDir, 'config.json');
  projectRoot   = join(tmpDir, 'project');
  savedEnvKey   = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  vi.mocked(keychain.getPassword).mockReset();
  vi.mocked(keychain.setPassword).mockReset();
  vi.mocked(keychain.deletePassword).mockReset();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  if (savedEnvKey === undefined) delete process.env.OPENAI_API_KEY;
  else                            process.env.OPENAI_API_KEY = savedEnvKey;
});

// ── Validation ───────────────────────────────────────────────────────────────

describe('isValidApiKey', () => {
  it('accepts a standard sk- prefixed key with 20+ chars', () => {
    expect(isValidApiKey(VALID_KEY)).toBe(true);
  });

  it('accepts keys with hyphens (e.g. sk-proj-...)', () => {
    expect(isValidApiKey('sk-proj-abc123XYZ_underscore-hyphen')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidApiKey('')).toBe(false);
  });

  it('rejects unprefixed keys', () => {
    expect(isValidApiKey('abcdefghij1234567890')).toBe(false);
  });

  it('rejects too-short keys', () => {
    expect(isValidApiKey('sk-short')).toBe(false);
  });

  it('rejects keys with disallowed characters', () => {
    expect(isValidApiKey('sk-abc def ghi 12345678901234')).toBe(false);
  });
});

// ── Resolution order ─────────────────────────────────────────────────────────

describe('resolveOpenAIKey — layer 1: env var', () => {
  it('returns the env key when OPENAI_API_KEY is set and valid', async () => {
    process.env.OPENAI_API_KEY = VALID_KEY;
    const result = await resolveOpenAIKey(projectRoot, { fallbackPath });
    expect(result).toBe(VALID_KEY);
  });

  it('ignores an invalid env key and falls through to lower layers', async () => {
    process.env.OPENAI_API_KEY = INVALID_KEY;
    vi.mocked(keychain.getPassword).mockResolvedValue(VALID_KEY);
    const result = await resolveOpenAIKey(projectRoot, { fallbackPath });
    expect(result).toBe(VALID_KEY);
  });
});

describe('resolveOpenAIKey — layer 2: project .env', () => {
  it('resolves from project .env when env var is unset', async () => {
    require('node:fs').mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(projectRoot, '.env'), `OPENAI_API_KEY=${VALID_KEY}\n`, 'utf8');
    const result = await resolveOpenAIKey(projectRoot, { fallbackPath });
    expect(result).toBe(VALID_KEY);
    expect(process.env.OPENAI_API_KEY).toBe(VALID_KEY);
  });

  it('ignores an invalid key in .env and falls through', async () => {
    require('node:fs').mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(projectRoot, '.env'), `OPENAI_API_KEY=${INVALID_KEY}\n`, 'utf8');
    vi.mocked(keychain.getPassword).mockResolvedValue(VALID_KEY);
    const result = await resolveOpenAIKey(projectRoot, { fallbackPath });
    expect(result).toBe(VALID_KEY);
  });

  it('does NOT promote a dotenv value into process.env unless the resolver chooses it', async () => {
    require('node:fs').mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(projectRoot, '.env'), `OPENAI_API_KEY=${VALID_KEY}\n`, 'utf8');
    // process.env.OPENAI_API_KEY is undefined at start
    await resolveOpenAIKey(projectRoot, { fallbackPath });
    expect(process.env.OPENAI_API_KEY).toBe(VALID_KEY);
  });
});

describe('resolveOpenAIKey — layer 3: keychain', () => {
  it('resolves from keychain when env + .env are unset', async () => {
    vi.mocked(keychain.getPassword).mockResolvedValue(VALID_KEY);
    const result = await resolveOpenAIKey(projectRoot, { fallbackPath });
    expect(result).toBe(VALID_KEY);
    expect(keychain.getPassword).toHaveBeenCalledWith(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
  });

  it('falls through when keychain throws (headless Linux scenario)', async () => {
    vi.mocked(keychain.getPassword).mockRejectedValue(new Error('NoKeyringError'));
    writeFileSync(fallbackPath, JSON.stringify({ openai_api_key: VALID_KEY }), { mode: 0o600 });
    const result = await resolveOpenAIKey(projectRoot, { fallbackPath });
    expect(result).toBe(VALID_KEY);
  });

  it('falls through when keychain returns an invalid key', async () => {
    vi.mocked(keychain.getPassword).mockResolvedValue(INVALID_KEY);
    writeFileSync(fallbackPath, JSON.stringify({ openai_api_key: VALID_KEY }), { mode: 0o600 });
    const result = await resolveOpenAIKey(projectRoot, { fallbackPath });
    expect(result).toBe(VALID_KEY);
  });

  it('promotes the keychain key into process.env.OPENAI_API_KEY', async () => {
    vi.mocked(keychain.getPassword).mockResolvedValue(VALID_KEY);
    expect(process.env.OPENAI_API_KEY).toBeUndefined();
    await resolveOpenAIKey(projectRoot, { fallbackPath });
    expect(process.env.OPENAI_API_KEY).toBe(VALID_KEY);
  });
});

describe('resolveOpenAIKey — layer 4: fallback file', () => {
  it('resolves from the fallback file when keychain returns null', async () => {
    vi.mocked(keychain.getPassword).mockResolvedValue(null);
    writeFileSync(fallbackPath, JSON.stringify({ openai_api_key: VALID_KEY }), { mode: 0o600 });
    const result = await resolveOpenAIKey(projectRoot, { fallbackPath });
    expect(result).toBe(VALID_KEY);
  });

  it('returns null when no source has a key', async () => {
    vi.mocked(keychain.getPassword).mockResolvedValue(null);
    const result = await resolveOpenAIKey(projectRoot, { fallbackPath });
    expect(result).toBeNull();
  });

  it('ignores a corrupt fallback file and returns null', async () => {
    vi.mocked(keychain.getPassword).mockResolvedValue(null);
    writeFileSync(fallbackPath, 'not-json{', 'utf8');
    const result = await resolveOpenAIKey(projectRoot, { fallbackPath });
    expect(result).toBeNull();
  });

  it('promotes the fallback-file key into process.env.OPENAI_API_KEY', async () => {
    vi.mocked(keychain.getPassword).mockResolvedValue(null);
    writeFileSync(fallbackPath, JSON.stringify({ openai_api_key: VALID_KEY }), { mode: 0o600 });
    expect(process.env.OPENAI_API_KEY).toBeUndefined();
    await resolveOpenAIKey(projectRoot, { fallbackPath });
    expect(process.env.OPENAI_API_KEY).toBe(VALID_KEY);
  });

  it('reads openai_api_key from a fallback file that also contains unrelated extra fields', async () => {
    vi.mocked(keychain.getPassword).mockResolvedValue(null);
    writeFileSync(fallbackPath, JSON.stringify({
      openai_api_key: VALID_KEY,
      something_else: 'ignored',
      nested: { also: 'ignored' },
    }), { mode: 0o600 });
    const result = await resolveOpenAIKey(projectRoot, { fallbackPath });
    expect(result).toBe(VALID_KEY);
  });
});

// ── storeApiKey ──────────────────────────────────────────────────────────────

describe('storeApiKey', () => {
  it('writes to keychain when keychain is available', async () => {
    vi.mocked(keychain.setPassword).mockResolvedValue(undefined);
    const result = await storeApiKey(VALID_KEY, { fallbackPath });
    expect(result.source).toBe('keychain');
    expect(keychain.setPassword).toHaveBeenCalledWith(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, VALID_KEY);
    expect(existsSync(fallbackPath)).toBe(false);
  });

  it('falls back to the 0600 file when keychain throws', async () => {
    vi.mocked(keychain.setPassword).mockRejectedValue(new Error('NoKeyringError'));
    const result = await storeApiKey(VALID_KEY, { fallbackPath });
    expect(result.source).toBe('file');
    expect(existsSync(fallbackPath)).toBe(true);
    const parsed = JSON.parse(require('node:fs').readFileSync(fallbackPath, 'utf8'));
    expect(parsed.openai_api_key).toBe(VALID_KEY);
  });

  it('the fallback file is created with 0600 permissions (owner read/write only)', async () => {
    vi.mocked(keychain.setPassword).mockRejectedValue(new Error('NoKeyringError'));
    await storeApiKey(VALID_KEY, { fallbackPath });
    expectFileLockedToOwner(fallbackPath);
  });

  it('overwriting an existing fallback file preserves 0600 mode', async () => {
    writeFileSync(fallbackPath, JSON.stringify({ openai_api_key: VALID_KEY }), { mode: 0o644 });
    vi.mocked(keychain.setPassword).mockRejectedValue(new Error('NoKeyringError'));
    await storeApiKey(VALID_KEY2, { fallbackPath });
    expectFileLockedToOwner(fallbackPath);
  });

  it('throws on invalid key format', async () => {
    await expect(storeApiKey('bad-key', { fallbackPath })).rejects.toThrow(/Invalid OpenAI API key/);
    expect(keychain.setPassword).not.toHaveBeenCalled();
  });

  it('creates the parent directory before writing the fallback file', async () => {
    const nestedFallback = join(tmpDir, 'deep', 'nested', 'config.json');
    vi.mocked(keychain.setPassword).mockRejectedValue(new Error('NoKeyringError'));
    await storeApiKey(VALID_KEY, { fallbackPath: nestedFallback });
    expect(existsSync(nestedFallback)).toBe(true);
  });
});

// ── removeApiKey ─────────────────────────────────────────────────────────────

describe('removeApiKey', () => {
  it('removes from both keychain and fallback file', async () => {
    writeFileSync(fallbackPath, JSON.stringify({ openai_api_key: VALID_KEY }), { mode: 0o600 });
    vi.mocked(keychain.deletePassword).mockResolvedValue(undefined);
    await removeApiKey({ fallbackPath });
    expect(keychain.deletePassword).toHaveBeenCalledWith(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    expect(existsSync(fallbackPath)).toBe(false);
  });

  it('silently succeeds when keychain delete throws', async () => {
    writeFileSync(fallbackPath, JSON.stringify({ openai_api_key: VALID_KEY }), { mode: 0o600 });
    vi.mocked(keychain.deletePassword).mockRejectedValue(new Error('NoKeyringError'));
    await expect(removeApiKey({ fallbackPath })).resolves.toBeUndefined();
    expect(existsSync(fallbackPath)).toBe(false);
  });

  it('silently succeeds when fallback file does not exist', async () => {
    vi.mocked(keychain.deletePassword).mockResolvedValue(undefined);
    await expect(removeApiKey({ fallbackPath })).resolves.toBeUndefined();
  });
});

// ── getKeySource ─────────────────────────────────────────────────────────────

describe('getKeySource', () => {
  it('returns "env" when env var is set', async () => {
    process.env.OPENAI_API_KEY = VALID_KEY;
    expect(await getKeySource(projectRoot, { fallbackPath })).toBe('env');
  });

  it('returns "dotenv" when only project .env has a key', async () => {
    require('node:fs').mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(projectRoot, '.env'), `OPENAI_API_KEY=${VALID_KEY}\n`, 'utf8');
    expect(await getKeySource(projectRoot, { fallbackPath })).toBe('dotenv');
  });

  it('returns "keychain" when only keychain has a key', async () => {
    vi.mocked(keychain.getPassword).mockResolvedValue(VALID_KEY);
    expect(await getKeySource(projectRoot, { fallbackPath })).toBe('keychain');
  });

  it('returns "file" when only the fallback file has a key', async () => {
    vi.mocked(keychain.getPassword).mockResolvedValue(null);
    writeFileSync(fallbackPath, JSON.stringify({ openai_api_key: VALID_KEY }), { mode: 0o600 });
    expect(await getKeySource(projectRoot, { fallbackPath })).toBe('file');
  });

  it('returns "none" when no source has a key', async () => {
    vi.mocked(keychain.getPassword).mockResolvedValue(null);
    expect(await getKeySource(projectRoot, { fallbackPath })).toBe('none');
  });

  it('ignores an invalid value in project .env and falls through to lower layers', async () => {
    require('node:fs').mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(projectRoot, '.env'), `OPENAI_API_KEY=${INVALID_KEY}\n`, 'utf8');
    vi.mocked(keychain.getPassword).mockResolvedValue(VALID_KEY);
    expect(await getKeySource(projectRoot, { fallbackPath })).toBe('keychain');
  });
});

// ── Constants ────────────────────────────────────────────────────────────────

describe('exported constants', () => {
  it('KEYCHAIN_SERVICE is "nexpath"', () => {
    expect(KEYCHAIN_SERVICE).toBe('nexpath');
  });

  it('KEYCHAIN_ACCOUNT is "openai_api_key"', () => {
    expect(KEYCHAIN_ACCOUNT).toBe('openai_api_key');
  });

  it('API_KEY_REGEX accepts sk- with 20+ chars', () => {
    expect(API_KEY_REGEX.test('sk-' + 'a'.repeat(20))).toBe(true);
    expect(API_KEY_REGEX.test('sk-' + 'a'.repeat(19))).toBe(false);
  });
});
