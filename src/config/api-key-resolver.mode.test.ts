import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// FP-4.2 — the four-cell matrix (key only / token only / both / neither), the
// "never clobber a pre-existing OPENAI_BASE_URL" guarantee, and the SDK contract
// pin (RISK-16). This file is the proof that Mode A stays byte-identical: it
// asserts exact process.env state, not behaviour inferred from a mock.

vi.mock('cross-keychain', () => ({
  getPassword:    vi.fn(),
  setPassword:    vi.fn(),
  deletePassword: vi.fn(),
}));

import { resolveOpenAIKey, getKeySource } from './ApiKeyResolver.js';
import * as keychain from 'cross-keychain';

const VALID_OPENAI_KEY = 'sk-abcdefghij1234567890ABCDEFGHIJ';
const VALID_TOKEN      = 'npk_' + 'a'.repeat(40);

let tmpDir:      string;
let projectRoot: string;
let fallbackPath: string;
let savedEnv:    Record<string, string | undefined>;

const ENV_KEYS = ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'NEXPATH_API_BASE_URL'] as const;

beforeEach(() => {
  tmpDir       = mkdtempSync(join(tmpdir(), 'nexpath-mode-matrix-'));
  projectRoot  = join(tmpDir, 'project');
  fallbackPath = join(tmpDir, 'config.json');
  mkdirSync(projectRoot, { recursive: true });

  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }

  vi.mocked(keychain.getPassword).mockReset();
  vi.mocked(keychain.setPassword).mockReset();
  vi.mocked(keychain.deletePassword).mockReset();
  // No OpenAI key in the keychain by default in this file — every test that
  // wants one puts it in the fallback file instead, so the two credential
  // stores (openai_api_key vs nexpath_token) are exercised independently.
  vi.mocked(keychain.getPassword).mockRejectedValue(new Error('empty keychain'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else                              process.env[key] = savedEnv[key];
  }
});

function writeOpenAIKeyToFallback(): void {
  writeFileSync(fallbackPath, JSON.stringify({ openai_api_key: VALID_OPENAI_KEY }), 'utf8');
}

function writeTokenToFallback(): void {
  writeFileSync(fallbackPath, JSON.stringify({ nexpath_token: VALID_TOKEN }), 'utf8');
}

function writeBothToFallback(): void {
  writeFileSync(fallbackPath, JSON.stringify({ openai_api_key: VALID_OPENAI_KEY, nexpath_token: VALID_TOKEN }), 'utf8');
}

// ── The four-cell matrix ──────────────────────────────────────────────────────

describe('FP-4.2 mode matrix — resolveOpenAIKey (process.env side effects)', () => {
  it('key only → Mode A: OPENAI_API_KEY set, OPENAI_BASE_URL untouched', async () => {
    writeOpenAIKeyToFallback();

    const resolved = await resolveOpenAIKey(projectRoot, { fallbackPath });
    expect(resolved).toBe(VALID_OPENAI_KEY);
    expect(process.env.OPENAI_API_KEY).toBe(VALID_OPENAI_KEY);
    expect(process.env.OPENAI_BASE_URL).toBeUndefined();
  });

  it('token only → Mode B: both OPENAI_API_KEY and OPENAI_BASE_URL set', async () => {
    writeTokenToFallback();

    const resolved = await resolveOpenAIKey(projectRoot, { fallbackPath });
    expect(resolved).toBe(VALID_TOKEN);
    expect(process.env.OPENAI_API_KEY).toBe(VALID_TOKEN);
    expect(process.env.OPENAI_BASE_URL).toBe('http://localhost:8000/v1');
  });

  it('both present → L2/RISK-4: the own key wins, server not contacted, no OPENAI_BASE_URL written', async () => {
    writeBothToFallback();

    const resolved = await resolveOpenAIKey(projectRoot, { fallbackPath });
    expect(resolved).toBe(VALID_OPENAI_KEY);
    expect(process.env.OPENAI_API_KEY).toBe(VALID_OPENAI_KEY);
    expect(process.env.OPENAI_BASE_URL).toBeUndefined();
  });

  it('neither present → today\'s behaviour untouched: no env var written', async () => {
    const resolved = await resolveOpenAIKey(projectRoot, { fallbackPath });
    expect(resolved).toBeNull();
    expect(process.env.OPENAI_API_KEY).toBeUndefined();
    expect(process.env.OPENAI_BASE_URL).toBeUndefined();
  });
});

// ── The same matrix again through getKeySource, queried fresh — never chained
// after resolveOpenAIKey in the same test, because resolveOpenAIKey's own
// process.env side effect would then make every source read back as "env"
// regardless of which layer actually produced it. This mirrors how the
// existing getKeySource tests in ApiKeyResolver.test.ts are written. ────────

describe('FP-4.2 mode matrix — getKeySource (queried fresh, independently)', () => {
  it('key only → file', async () => {
    writeOpenAIKeyToFallback();
    expect(await getKeySource(projectRoot, { fallbackPath })).toBe('file');
  });

  it('token only → nexpath_token', async () => {
    writeTokenToFallback();
    expect(await getKeySource(projectRoot, { fallbackPath })).toBe('nexpath_token');
  });

  it('both present → file (the own key\'s layer, not the token)', async () => {
    writeBothToFallback();
    expect(await getKeySource(projectRoot, { fallbackPath })).toBe('file');
  });

  it('neither present → none', async () => {
    expect(await getKeySource(projectRoot, { fallbackPath })).toBe('none');
  });
});

// ── RISK-4: a user's own OPENAI_BASE_URL must never be clobbered ────────────────

describe('a pre-existing OPENAI_BASE_URL is never clobbered', () => {
  it('Mode B still sets OPENAI_API_KEY but leaves an existing OPENAI_BASE_URL exactly as the user set it', async () => {
    process.env.OPENAI_BASE_URL = 'https://user-configured-proxy.example/v1';
    writeTokenToFallback();

    await resolveOpenAIKey(projectRoot, { fallbackPath });

    expect(process.env.OPENAI_API_KEY).toBe(VALID_TOKEN);
    expect(process.env.OPENAI_BASE_URL).toBe('https://user-configured-proxy.example/v1');
  });

  it('Mode A never touches OPENAI_BASE_URL even if the user has one set', async () => {
    process.env.OPENAI_BASE_URL = 'https://user-configured-proxy.example/v1';
    writeOpenAIKeyToFallback();

    await resolveOpenAIKey(projectRoot, { fallbackPath });

    expect(process.env.OPENAI_BASE_URL).toBe('https://user-configured-proxy.example/v1');
  });
});

// ── L2: own key wins even when it arrives via a different layer than the token ──

describe('own key wins regardless of which layer supplies it', () => {
  it('env-var key beats a stored token', async () => {
    process.env.OPENAI_API_KEY = VALID_OPENAI_KEY;
    writeTokenToFallback();

    const resolved = await resolveOpenAIKey(projectRoot, { fallbackPath });
    expect(resolved).toBe(VALID_OPENAI_KEY);
    expect(process.env.OPENAI_BASE_URL).toBeUndefined();
    expect(await getKeySource(projectRoot, { fallbackPath })).toBe('env');
  });

  it('keychain key beats a stored token', async () => {
    vi.mocked(keychain.getPassword).mockReset();
    vi.mocked(keychain.getPassword).mockResolvedValue(VALID_OPENAI_KEY);
    writeTokenToFallback();

    const resolved = await resolveOpenAIKey(projectRoot, { fallbackPath });
    expect(resolved).toBe(VALID_OPENAI_KEY);
    expect(process.env.OPENAI_BASE_URL).toBeUndefined();
  });
});

// ── SDK contract pin (RISK-16) ────────────────────────────────────────────────
//
// The whole design rests on one fact about the installed `openai` package:
// `new OpenAI()` with no explicit baseURL/apiKey reads OPENAI_BASE_URL and
// OPENAI_API_KEY from the environment. If a future SDK upgrade ever drops that
// default, this test fails loudly instead of Mode B silently calling the real
// OpenAI API with a Nexpath token.

describe('SDK contract pin (RISK-16)', () => {
  it('a bare `new OpenAI()` resolves baseURL/apiKey from the environment set by Mode B', async () => {
    writeTokenToFallback();
    await resolveOpenAIKey(projectRoot, { fallbackPath });

    const { default: OpenAI } = await import('openai');
    const client = new OpenAI();

    expect(client.baseURL).toBe('http://localhost:8000/v1');
    expect(client.apiKey).toBe(VALID_TOKEN);
  });

  it('an explicit constructor argument still overrides the environment (unchanged SDK behaviour)', async () => {
    writeTokenToFallback();
    await resolveOpenAIKey(projectRoot, { fallbackPath });

    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ baseURL: 'https://explicit-override.example/v1' });

    expect(client.baseURL).toBe('https://explicit-override.example/v1');
  });
});
