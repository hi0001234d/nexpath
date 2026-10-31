/**
 * One LLM client for one host call, without touching process.env.
 *
 * The desktop app runs Nexpath inside its own Electron main process, so it cannot
 * point Nexpath at its credential through OPENAI_API_KEY / OPENAI_BASE_URL: those
 * are shared, racy state across concurrent calls, and a user's own key must never
 * be used there (server rule 2026-10-29). Instead the host runs a call inside
 * `runWithNexpathLlmClient(client, fn)`. Every Nexpath site that would build a
 * client from the environment asks `newNexpathOpenAIClient()` first, and every
 * "is there a credential" check asks `hasUsableNexpathLlmCredential()`.
 *
 * AsyncLocalStorage scopes the client to that call's async work only, so two
 * desktop calls in flight at once each see their own client, and code outside
 * any scope (the CLI hooks) behaves exactly as before.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import OpenAI from 'openai';
import { isUsableLlmCredential } from './credential-shape.js';

const scope = new AsyncLocalStorage<{ client: OpenAI }>();

/** Runs `fn` with `client` as the only LLM client Nexpath may use. */
export function runWithNexpathLlmClient<T>(client: OpenAI, fn: () => Promise<T>): Promise<T> {
  return scope.run({ client }, fn);
}

/** The host-provided client for the current call, if any. */
export function scopedNexpathLlmClient(): OpenAI | undefined {
  return scope.getStore()?.client;
}

/**
 * The client a Nexpath call site should use when no client was injected: the
 * host's scoped client, else a client from the environment (CLI behaviour).
 * Inside a scope the options are ignored — the host's client is complete.
 */
export function newNexpathOpenAIClient(options?: ConstructorParameters<typeof OpenAI>[0]): OpenAI {
  return scopedNexpathLlmClient() ?? new OpenAI(options);
}

/**
 * Whether an LLM call can be made. Inside a host scope only the scoped client
 * counts and the environment is never read.
 */
export function hasUsableNexpathLlmCredential(env: NodeJS.ProcessEnv = process.env): boolean {
  if (scopedNexpathLlmClient()) return true;
  return isUsableLlmCredential(env['OPENAI_API_KEY'] ?? '');
}

export interface DesktopLlmClientOptions {
  /** The desktop's npd_ device token. */
  deviceToken: string;
  /** The device id the token was issued to (sent as X-Device-Id). */
  deviceId: string;
  /** The app's server, e.g. https://parseos.tech; calls go to <base>/v1/chat/completions. */
  apiBaseUrl: string;
  /** Aborting it cancels every in-flight call made through the client. */
  signal?: AbortSignal;
}

/**
 * The desktop's LLM client: Bearer <npd_> + X-Device-Id against <base>/v1, built
 * only from the given values (no environment reads), with every request tied to
 * `signal` so a time-out or cancel stops the calls instead of paying for them.
 */
export function createDesktopNexpathLlmClient(options: DesktopLlmClientOptions): OpenAI {
  const outer = options.signal;
  const fetchWithCancel: typeof fetch = (input, init) => {
    if (!outer) return fetch(input, init);
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (outer.aborted) abort();
    else outer.addEventListener('abort', abort, { once: true });
    init?.signal?.addEventListener('abort', abort, { once: true });
    if (init?.signal?.aborted) abort();
    return fetch(input, { ...init, signal: controller.signal }).finally(() => outer.removeEventListener('abort', abort));
  };

  return new OpenAI({
    apiKey: options.deviceToken,
    baseURL: `${options.apiBaseUrl.replace(/\/+$/, '')}/v1`,
    organization: null,
    project: null,
    defaultHeaders: { 'X-Device-Id': options.deviceId },
    // Nexpath's call sites own their retry policy; the SDK must not multiply it.
    maxRetries: 0,
    fetch: fetchWithCancel,
  });
}
