import { newNexpathOpenAIClient } from '../../config/llm-client-scope.js';
import OpenAI from 'openai';
import type { LLMPort, LLMChatParams } from '../../core/ports/llm.port.js';

/**
 * OpenAILLMAdapter — wires LLMPort to the openai SDK.
 *
 * A single OpenAI instance is created at construction time and reused across calls.
 * The `timeoutMs` param in LLMChatParams is passed to the SDK's per-request timeout option.
 */
export class OpenAILLMAdapter implements LLMPort {
  private readonly client: OpenAI;

  constructor(client?: OpenAI) {
    this.client = client ?? newNexpathOpenAIClient();
  }

  async chat(params: LLMChatParams): Promise<string> {
    const { timeoutMs, ...rest } = params;

    const response = await this.client.chat.completions.create(
      {
        model:           rest.model,
        messages:        rest.messages,
        temperature:     rest.temperature,
        max_tokens:      rest.max_tokens,
        response_format: rest.response_format,
      },
      timeoutMs !== undefined ? { timeout: timeoutMs } : undefined,
    );

    return response.choices[0]?.message?.content ?? '';
  }
}
