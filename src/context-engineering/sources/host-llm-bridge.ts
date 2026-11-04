/**
 * Feature 1 — v1(a) host LLM bridge for MemOS (`llm.provider: host`).
 *
 * Every MemOS AI call (summaries, value scoring, relevance filter) goes through Nexpath's own
 * client: the user's key or Nexpath token in the CLI, the npd_ device client on the desktop.
 * MemOS only ever sees this function — never a key or token string (Ved, 2026-11-02).
 *
 * Rules (v1(a).md §9.3, O3):
 *  - throw on every failure (no credential, 402, 429, timeout, empty answer). An empty answer
 *    makes MemOS's relevance filter drop every result; a thrown error makes it keep them.
 *  - gpt-4o-mini only, max_tokens ≤ 2048 (server allowlist).
 *  - background calls take a small share of the account's 60/min (burst 10) limit, so they
 *    never use up what a real prompt needs; back off after 429, pause after 402.
 */

import type OpenAI from 'openai';

export interface HostLlmMessage {
  role: string;
  content: string;
}

/** MemOS's `HostLlmBridge` shape (core/llm/host-bridge.ts). */
export interface HostLlmBridge {
  id?: string;
  complete(input: {
    messages: HostLlmMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<{ text: string; model: string; usage?: { promptTokens?: number; completionTokens?: number }; durationMs: number }>;
}

export interface HostLlmBridgeOptions {
  /** Returns Nexpath's client for this call, or undefined when there is no usable credential. */
  getClient: () => OpenAI | undefined;
  /** Most MemOS calls per rolling minute (default 6 of the account's 60). */
  maxCallsPerMinute?: number;
  /** Pause after a 429 (default 60 s). */
  rateLimitPauseMs?: number;
  /** Pause after a 402 / no credit (default 10 min). */
  noCreditPauseMs?: number;
  /**
   * Language of what MemOS writes (turn summaries, learned rules). 'match' — the language of the
   * user's own text, never translated (user decision 2026-11-03, multilingual #7); the worker and
   * the desktop use it. 'en' (the default here): always English. Either line also stops
   * gpt-4o-mini from answering MemOS's prompts in Chinese (v1(a) real-key run).
   */
  language?: 'en' | 'match';
  now?: () => number;
}

const LANGUAGE_LINE = {
  en: 'Write every free-text value in English.',
  match: "Write every free-text value in the same language as the user's own text; never switch to another language.",
} as const;

/** Adds the language line to MemOS's system prompt (or as one, when it has none). */
export function withLanguageLine(messages: HostLlmMessage[], language: 'en' | 'match'): HostLlmMessage[] {
  const line = LANGUAGE_LINE[language];
  const at = messages.findIndex((m) => m.role === 'system');
  if (at < 0) return [{ role: 'system', content: line }, ...messages];
  return messages.map((m, i) => (i === at ? { ...m, content: `${m.content}\n\n${line}` } : m));
}

export const HOST_LLM_MODEL = 'gpt-4o-mini';
export const HOST_LLM_MAX_TOKENS = 2048;

export class HostLlmUnavailableError extends Error {}

export function createHostLlmBridge(options: HostLlmBridgeOptions): HostLlmBridge {
  const now = options.now ?? Date.now;
  const perMinute = options.maxCallsPerMinute ?? 6;
  const calls: number[] = [];
  let pausedUntil = 0;

  return {
    id: 'nexpath',
    async complete(input) {
      const t = now();
      if (t < pausedUntil) throw new HostLlmUnavailableError('nexpath bridge paused after a limit or credit error');
      while (calls.length > 0 && t - calls[0] >= 60_000) calls.shift();
      if (calls.length >= perMinute) throw new HostLlmUnavailableError('nexpath bridge: background share used up for this minute');

      const client = options.getClient();
      if (!client) throw new HostLlmUnavailableError('no Nexpath credential');
      calls.push(t);

      const controller = new AbortController();
      const onAbort = () => controller.abort();
      input.signal?.addEventListener('abort', onAbort, { once: true });
      const timer = input.timeoutMs && input.timeoutMs > 0 ? setTimeout(() => controller.abort(), input.timeoutMs) : undefined;
      try {
        const response = await client.chat.completions.create(
          {
            model: HOST_LLM_MODEL,
            messages: withLanguageLine(input.messages, options.language ?? 'en').map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
            max_tokens: Math.min(HOST_LLM_MAX_TOKENS, Math.max(1, input.maxTokens ?? 1024)),
            ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
          },
          { signal: controller.signal }
        );
        const text = response.choices?.[0]?.message?.content ?? '';
        if (!text.trim()) throw new HostLlmUnavailableError('empty answer');
        return {
          text,
          model: response.model ?? HOST_LLM_MODEL,
          usage: { promptTokens: response.usage?.prompt_tokens, completionTokens: response.usage?.completion_tokens },
          durationMs: now() - t,
        };
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 429) pausedUntil = now() + (options.rateLimitPauseMs ?? 60_000);
        if (status === 402) pausedUntil = now() + (options.noCreditPauseMs ?? 10 * 60_000);
        throw err instanceof Error ? err : new Error(String(err));
      } finally {
        if (timer) clearTimeout(timer);
        input.signal?.removeEventListener('abort', onAbort);
      }
    },
  };
}
