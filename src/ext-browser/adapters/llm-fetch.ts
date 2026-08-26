import type { LLMPort, LLMChatParams } from '../../core/ports/llm.port.js';

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

export class FetchLLMAdapter implements LLMPort {
  constructor(private readonly apiKey: string) {}

  async chat(params: LLMChatParams): Promise<string> {
    const body: Record<string, unknown> = {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature,
    };
    if (params.max_tokens !== undefined) body['max_tokens'] = params.max_tokens;
    if (params.response_format !== undefined) body['response_format'] = params.response_format;

    let signal: AbortSignal | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (params.timeoutMs !== undefined) {
      const controller = new AbortController();
      signal = controller.signal;
      timer = setTimeout(() => controller.abort(), params.timeoutMs);
    }

    let resp: Response;
    try {
      resp = await fetch(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      // The engine classifies composer failures by the error's wording
      // (`llm-composer.ts:116-120`: name or message matching timeout/timed out
      // → 'timeout', anything else → 'provider_error'). An aborted fetch
      // throws AbortError/"The operation was aborted", which matches NEITHER —
      // so a browser-side timeout would masquerade as a provider outage. The
      // real OpenAI SDK throws "Request timed out"; present the same.
      if (signal?.aborted) {
        throw new Error(`OpenAI fetch timed out after ${params.timeoutMs}ms`);
      }
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      throw new Error(`OpenAI fetch error ${resp.status}: ${text}`);
    }

    const json = await resp.json() as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content ?? '';
  }
}
