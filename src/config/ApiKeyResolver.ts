import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { config as loadDotenv } from 'dotenv';
import { getPassword, setPassword, deletePassword } from 'cross-keychain';
import { readNexpathToken, resolveApiBaseUrl } from './NexpathTokenStore.js';

export const KEYCHAIN_SERVICE = 'nexpath';
export const KEYCHAIN_ACCOUNT = 'openai_api_key';
export const FALLBACK_PATH    = join(homedir(), '.nexpath', 'config.json');
export const API_KEY_REGEX    = /^sk-[A-Za-z0-9_-]{20,}$/;

// The fifth and last resolution layer. `nexpath_token` means Mode B — no
// OpenAI key anywhere, a Nexpath token stored instead. This is the single
// place both env vars get set, so nothing that calls `resolveOpenAIKey` or
// `getKeySource` — the only two entry points that reach an LLM call — needs
// to change.
export type KeySource = 'env' | 'dotenv' | 'keychain' | 'file' | 'nexpath_token' | 'none';

export interface ResolveOptions {
  fallbackPath?: string;
}

export function isValidApiKey(key: string): boolean {
  return API_KEY_REGEX.test(key);
}

export async function resolveOpenAIKey(projectRoot: string, opts: ResolveOptions = {}): Promise<string | null> {
  const fallbackPath = opts.fallbackPath ?? FALLBACK_PATH;

  const envKey = tryEnv();
  if (envKey) return envKey;

  const dotenvKey = tryProjectDotenv(projectRoot);
  if (dotenvKey) {
    process.env.OPENAI_API_KEY = dotenvKey;
    return dotenvKey;
  }

  const keychainKey = await tryKeychain();
  if (keychainKey) {
    process.env.OPENAI_API_KEY = keychainKey;
    return keychainKey;
  }

  const fileKey = await tryFallbackFile(fallbackPath);
  if (fileKey) {
    process.env.OPENAI_API_KEY = fileKey;
    return fileKey;
  }

  // The fifth and last layer: only reached when none of the 4 above found an
  // OpenAI key. The own-key-always-wins guarantee is structural here, not a
  // separate check — every earlier layer already returned before this runs.
  // No key + a stored token means the token takes over instead.
  // ⚠️ fallbackPath must be forwarded — without it this silently reads the
  // real home-directory file regardless of what the caller passed in, which
  // would only ever surface as a bug in an isolated test or a custom-path
  // caller, never in ordinary use where the two defaults happen to coincide.
  const token = await readNexpathToken({ fallbackPath });
  if (token) {
    process.env.OPENAI_API_KEY = token;
    // Never clobber a base URL the user configured themselves — e.g. pointed
    // at their own proxy for testing. This only sets it when it is genuinely
    // unset.
    if (!process.env.OPENAI_BASE_URL) {
      process.env.OPENAI_BASE_URL = resolveApiBaseUrl();
    }
    return token;
  }

  return null;
}

export async function getKeySource(projectRoot: string, opts: ResolveOptions = {}): Promise<KeySource> {
  const fallbackPath = opts.fallbackPath ?? FALLBACK_PATH;

  if (tryEnv())                            return 'env';
  if (tryProjectDotenv(projectRoot))       return 'dotenv';
  if (await tryKeychain())                 return 'keychain';
  if (await tryFallbackFile(fallbackPath)) return 'file';
  if (await readNexpathToken({ fallbackPath })) return 'nexpath_token';
  return 'none';
}

export async function storeApiKey(key: string, opts: ResolveOptions = {}): Promise<{ source: 'keychain' | 'file' }> {
  if (!isValidApiKey(key)) {
    throw new Error('Invalid OpenAI API key format (expected /^sk-[A-Za-z0-9_-]{20,}$/)');
  }
  const fallbackPath = opts.fallbackPath ?? FALLBACK_PATH;

  try {
    await setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, key);
    return { source: 'keychain' };
  } catch {
    await writeFallbackFile(fallbackPath, key);
    return { source: 'file' };
  }
}

export async function removeApiKey(opts: ResolveOptions = {}): Promise<void> {
  const fallbackPath = opts.fallbackPath ?? FALLBACK_PATH;

  try { await deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT); } catch { /* silent */ }
  try { await fs.unlink(fallbackPath); } catch { /* silent */ }
}

function tryEnv(): string | null {
  const key = process.env.OPENAI_API_KEY;
  if (key && isValidApiKey(key)) return key;
  return null;
}

function tryProjectDotenv(projectRoot: string): string | null {
  try {
    const envPath = join(projectRoot, '.env');
    const result  = loadDotenv({ path: envPath, processEnv: {}, quiet: true });
    if (result.error) return null;
    const key = result.parsed?.OPENAI_API_KEY;
    if (key && isValidApiKey(key)) return key;
    return null;
  } catch {
    return null;
  }
}

async function tryKeychain(): Promise<string | null> {
  try {
    const key = await getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    if (key && isValidApiKey(key)) return key;
    return null;
  } catch {
    return null;
  }
}

async function tryFallbackFile(fallbackPath: string): Promise<string | null> {
  try {
    const raw    = await fs.readFile(fallbackPath, 'utf8');
    const parsed = JSON.parse(raw) as { openai_api_key?: string };
    const key    = parsed.openai_api_key;
    if (key && isValidApiKey(key)) return key;
    return null;
  } catch {
    return null;
  }
}

async function writeFallbackFile(fallbackPath: string, key: string): Promise<void> {
  await fs.mkdir(dirname(fallbackPath), { recursive: true });
  const payload = JSON.stringify({ openai_api_key: key }, null, 2);
  await fs.writeFile(fallbackPath, payload, { mode: 0o600 });
  await fs.chmod(fallbackPath, 0o600);
}
