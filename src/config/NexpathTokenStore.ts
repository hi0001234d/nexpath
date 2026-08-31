import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { getPassword, setPassword, deletePassword } from 'cross-keychain';

// Mirrors ApiKeyResolver.ts's own plumbing exactly (same keychain service, same
// fallback file), but under a distinct account and JSON key, so an OpenAI key and
// a Nexpath token can be stored side by side without colliding.
export const KEYCHAIN_SERVICE = 'nexpath';
export const KEYCHAIN_ACCOUNT = 'nexpath_token';
export const FALLBACK_PATH    = join(homedir(), '.nexpath', 'config.json');

// ⛔ A Nexpath token must never be checked against ApiKeyResolver's
// API_KEY_REGEX (the `sk-` shape) — the two credential formats must never be
// confused with each other, in either direction. Checked here and nowhere else.
export const TOKEN_PREFIX     = 'npk_';
export const TOKEN_MIN_LENGTH = 40; // "npk_" (4) + the server's 32-byte urlsafe body

export interface TokenStoreOptions {
  fallbackPath?: string;
}

export function isValidNexpathToken(value: string): boolean {
  return typeof value === 'string'
    && value.startsWith(TOKEN_PREFIX)
    && value.length >= TOKEN_MIN_LENGTH
    && !/\s/.test(value);
}

export async function storeNexpathToken(token: string, opts: TokenStoreOptions = {}): Promise<{ source: 'keychain' | 'file' }> {
  if (!isValidNexpathToken(token)) {
    throw new Error(`Invalid Nexpath token format (expected "${TOKEN_PREFIX}" + at least ${TOKEN_MIN_LENGTH - TOKEN_PREFIX.length} characters)`);
  }
  const fallbackPath = opts.fallbackPath ?? FALLBACK_PATH;

  try {
    await setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, token);
    return { source: 'keychain' };
  } catch {
    await writeFallbackToken(fallbackPath, token);
    return { source: 'file' };
  }
}

export async function readNexpathToken(opts: TokenStoreOptions = {}): Promise<string | null> {
  const fallbackPath = opts.fallbackPath ?? FALLBACK_PATH;

  try {
    const token = await getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    if (token && isValidNexpathToken(token)) return token;
  } catch {
    /* fall through to the file */
  }

  try {
    const raw    = await fs.readFile(fallbackPath, 'utf8');
    const parsed = JSON.parse(raw) as { nexpath_token?: string };
    const token  = parsed.nexpath_token;
    if (token && isValidNexpathToken(token)) return token;
  } catch {
    /* no fallback file, or unreadable — treat as absent */
  }

  return null;
}

export async function removeNexpathToken(opts: TokenStoreOptions = {}): Promise<void> {
  const fallbackPath = opts.fallbackPath ?? FALLBACK_PATH;

  try { await deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT); } catch { /* silent, mirrors removeApiKey */ }
  try {
    // The fallback file may also hold an OpenAI key under a different JSON key
    // (ApiKeyResolver's own field), so remove only our own key rather than the
    // whole file.
    const raw = await fs.readFile(fallbackPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if ('nexpath_token' in parsed) {
      delete parsed.nexpath_token;
      await fs.writeFile(fallbackPath, JSON.stringify(parsed, null, 2), { mode: 0o600 });
    }
  } catch {
    /* no fallback file, or unreadable — nothing to remove */
  }
}

async function writeFallbackToken(fallbackPath: string, token: string): Promise<void> {
  await fs.mkdir(dirname(fallbackPath), { recursive: true });

  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await fs.readFile(fallbackPath, 'utf8')) as Record<string, unknown>;
  } catch {
    /* no existing file, or unreadable — start fresh rather than clobber silently
       something we can't parse; a corrupt file is surfaced by the write below
       replacing it with a valid one holding just our own key. */
  }

  const payload = JSON.stringify({ ...existing, nexpath_token: token }, null, 2);
  await fs.writeFile(fallbackPath, payload, { mode: 0o600 });
  await fs.chmod(fallbackPath, 0o600);
}

// ── The API base the token is redeemed against ──────────────────────────────────
//
// ⚠️ The production domain does not exist yet. Rather than invent one, this is
// an explicit, env-overridable value whose local-development default matches
// the server's own default for local runs. Setting `NEXPATH_API_BASE_URL` once
// a real domain exists is a one-line deploy change, not a client rewrite.
export const DEFAULT_API_BASE_URL = 'http://localhost:8000/v1';

export function resolveApiBaseUrl(): string {
  const configured = process.env.NEXPATH_API_BASE_URL;
  return configured && configured.trim() !== '' ? configured : DEFAULT_API_BASE_URL;
}
