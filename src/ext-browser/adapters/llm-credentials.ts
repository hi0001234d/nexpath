/**
 * Browser-side LLM credential resolution — the extension's mirror of the CLI's
 * key-resolution seam (`src/config/ApiKeyResolver.ts`, layer 5).
 *
 * ── THE CONTRACT (identical to the CLI's, restated for this surface) ─────────
 *  1. The user's own OpenAI key ALWAYS wins. When `openai_api_key` is set,
 *     resolution stops there and the base URL is left untouched — behaviour is
 *     byte-identical to every build before this module existed.
 *  2. Only when NO OpenAI key is stored does a stored Nexpath token take over:
 *     the token becomes the bearer credential and the chat URL switches to the
 *     configured Nexpath service. The service speaks the OpenAI API shape, so
 *     nothing downstream changes.
 *  3. Neither → 'none', and every existing "no key → skip the LLM" gate in the
 *     service worker behaves exactly as it always has.
 *
 * ── WHY A FAKE-ENV BRIDGE ────────────────────────────────────────────────────
 * The engine's browser port already carries runtime credentials through a
 * polyfilled `process.env` (`pe-engine.ts`'s `refreshEngineKeyEnv`, read by the
 * openai-sdk shim) because the key is runtime-dynamic and cannot be baked in at
 * build time. The base URL rides the same bridge: `applyLLMCredentialEnv` sets
 * `OPENAI_BASE_URL` next to `OPENAI_API_KEY`, `FetchLLMAdapter` honours it, and
 * none of the adapter's construction sites need to change — the exact design
 * the CLI resolver ships (`resolveOpenAIKey` sets both env vars, `new OpenAI()`
 * reads them).
 *
 * ⛔ This module must never import Node-only code (keychain, fs) — it runs in
 * the MV3 service worker. The token format check mirrors
 * `NexpathTokenStore.isValidNexpathToken` by contract; the regexes must not
 * drift (a test pins the accepted shape).
 */

import type { KeyStorePort } from '../../core/ports/keystore.port.js';

/** `browser.storage.local` keys — set on the options page, read here. */
export const NEXPATH_TOKEN_KEY = 'nexpath_token';
export const NEXPATH_BASE_URL_KEY = 'nexpath_api_base_url';

/**
 * The Nexpath service the token authenticates against. This is the public
 * production origin (it is already printed in this extension's manifests and
 * on the service's own website — not a secret), so a user who pastes a token
 * needs to configure nothing else. Developers and self-hosters can override it
 * via the Advanced field on the options page (stored under
 * `NEXPATH_BASE_URL_KEY`).
 */
export const DEFAULT_API_BASE_URL = 'https://parseos.tech/v1';

/** Mirror of `isValidNexpathToken` — `npk_` + at least 20 url-safe chars. */
const NEXPATH_TOKEN_REGEX = /^npk_[A-Za-z0-9_-]{20,}$/;

export function isValidNexpathTokenShape(value: string): boolean {
  return NEXPATH_TOKEN_REGEX.test(value);
}

export type LLMCredentialSource = 'openai' | 'nexpath_token' | 'none';

export interface LLMCredentials {
  /** The bearer credential to use, or null when neither is configured. */
  apiKey: string | null;
  source: LLMCredentialSource;
  /** The service base URL — non-null ONLY in `nexpath_token` mode. */
  baseUrl: string | null;
}

/**
 * Resolve the effective LLM credential. Own key wins; a malformed stored token
 * is ignored rather than sent (sending a non-`npk_` string to the service
 * would just 401 — refusing here keeps the "no credential" gates honest).
 */
export async function resolveLLMCredentials(keyStore: KeyStorePort): Promise<LLMCredentials> {
  const openaiKey = await keyStore.getKey('openai_api_key');
  if (typeof openaiKey === 'string' && openaiKey.length > 0) {
    return { apiKey: openaiKey, source: 'openai', baseUrl: null };
  }

  const token = await keyStore.getKey(NEXPATH_TOKEN_KEY);
  if (typeof token === 'string' && isValidNexpathTokenShape(token.trim())) {
    const storedBase = await keyStore.getKey(NEXPATH_BASE_URL_KEY);
    const baseUrl = (typeof storedBase === 'string' && storedBase.trim().length > 0)
      ? storedBase.trim().replace(/\/+$/, '')
      : DEFAULT_API_BASE_URL;
    return { apiKey: token.trim(), source: 'nexpath_token', baseUrl };
  }

  return { apiKey: null, source: 'none', baseUrl: null };
}

type EnvHolder = { process?: { env?: Record<string, string | undefined> } };

/**
 * Publish the resolved credential into the polyfilled `process.env`, exactly
 * as the CLI resolver publishes into the real one: key always, base URL only
 * in token mode (and REMOVED otherwise, so switching back to an own key can
 * never leave calls pointed at the service).
 */
export function applyLLMCredentialEnv(creds: LLMCredentials): void {
  const holder = globalThis as EnvHolder;
  holder.process ??= {};
  holder.process.env ??= {};
  const env = holder.process.env;

  if (creds.apiKey) env['OPENAI_API_KEY'] = creds.apiKey;
  else delete env['OPENAI_API_KEY'];

  if (creds.source === 'nexpath_token' && creds.baseUrl) {
    env['OPENAI_BASE_URL'] = creds.baseUrl;
  } else {
    delete env['OPENAI_BASE_URL'];
  }
}
