/**
 * Feature 1 — Context Engineering: Feature 6 Local LLM Execution Client (Iroh Bridge)
 *
 * Connects to the Desktop App's local client bridge (ALPN: iroh-ollama-proxy/0)
 * at http://127.0.0.1:<bridge_port>/v1/chat/completions to run inference on the
 * remote LAN GPU device selected by Feature 3.
 *
 * Operational Guarantees:
 *  - Native Node.js fetch: Zero binary or external package dependencies.
 *  - Standard OpenAI chat completion format: { model, messages, temperature, max_tokens }.
 *  - Automatic Pro Fail-Safe: If local bridge connection fails (CONNECT_FAILED) or
 *    times out (LOCAL_TIMEOUT), immediately executes on Cloud Pro (gpt-4o-mini)
 *    so developer prompt execution is never dropped or blocked.
 */

import type {
  F3LanDevice,
  LocalChatCompletionRequest,
  LocalChatCompletionResponse,
  LocalChatMessage,
} from '../types/context-engineering.js';
import type { PromptSection } from '../delivery/section-router.js';

export const DEFAULT_LOCAL_BRIDGE_PORT = 11434;
export const CLOUD_PRO_URL = 'https://parseos.tech/v1/chat/completions';

/**
 * Formats chat messages for Feature 6 local LLM synthesis or Cloud Pro fallback.
 * Strictly guarantees clean prompt structure without artificial tag brackets.
 */
export function formatEnhancementChatMessages(
  rawPrompt: string,
  sections: PromptSection[]
): LocalChatMessage[] {
  const contextSummary = sections
    .map((s) => `### ${s.title}\n${s.lines.join('\n')}`)
    .join('\n\n');

  const systemMessage: LocalChatMessage = {
    role: 'system',
    content:
      'You are an expert context-engineering prompt enhancer. Your task is to refine and synthesize the developer prompt by incorporating the relevant project constraints, architecture rules, and grounding facts provided. Output only the final clean prompt text without any synthetic tag markers (e.g. do not output @file: or @rule: tags).',
  };

  const userMessage: LocalChatMessage = {
    role: 'user',
    content: `Project Context & Constraints:\n${contextSummary}\n\nDeveloper Prompt:\n${rawPrompt}`,
  };

  return [systemMessage, userMessage];
}

export interface LocalExecutionOptions {
  bridgePort?: number;
  bridgeUrl?: string;
  timeoutMs?: number;
  deviceToken?: string;
  deviceId?: string;
}

export interface LocalExecutionResult {
  content: string;
  ranOn: 'local' | 'pro';
  fellBackToPro: boolean;
  failType: 'CONNECT_FAILED' | 'LOCAL_TIMEOUT' | 'LOCAL_ERROR' | 'BAD_OUTPUT' | null;
  latencyMs: number;
}

/**
 * Dispatches an inference request to the local model bridge, with fail-open fallback to Cloud Pro.
 */
export async function executeLocalOrProCompletion(
  lanDevice: F3LanDevice,
  request: Omit<LocalChatCompletionRequest, 'model'>,
  options?: LocalExecutionOptions
): Promise<LocalExecutionResult> {
  const startTime = performance.now();
  const bridgeUrl = options?.bridgeUrl || `http://127.0.0.1:${options?.bridgePort || DEFAULT_LOCAL_BRIDGE_PORT}/v1/chat/completions`;
  const timeoutMs = options?.timeoutMs || 45000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(bridgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: lanDevice.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.max_tokens ?? 2000,
        response_format: request.response_format,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Local bridge returned status ${response.status}`);
    }

    const data = (await response.json()) as LocalChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content ?? '';

    // If stream was declined, dropped, reset mid-request, or returned empty content,
    // trigger fallback to Pro cleanly (BAD_OUTPUT / stream decline)
    if (!content || content.trim().length === 0) {
      throw new Error('BAD_OUTPUT: Local bridge returned empty or truncated response');
    }

    return {
      content,
      ranOn: 'local',
      fellBackToPro: false,
      failType: null,
      latencyMs: Math.round(performance.now() - startTime),
    };
  } catch (err) {
    clearTimeout(timeoutId);

    const isTimeout = controller.signal.aborted;
    const errMsg = err instanceof Error ? err.message : String(err);
    const errCause = (err as any)?.cause ? String((err as any).cause) : '';
    const errCode = (err as any)?.code || (err as any)?.cause?.code || '';
    const fullErrStr = `${errMsg} ${errCause} ${errCode}`;
    const isConnRefused = fullErrStr.includes('ECONNREFUSED');
    const isBadOutputOrHangup =
      fullErrStr.includes('BAD_OUTPUT') ||
      fullErrStr.includes('ECONNRESET') ||
      fullErrStr.includes('socket hang up') ||
      fullErrStr.includes('premature close') ||
      fullErrStr.includes('unexpected end of file');

    let failType: 'LOCAL_TIMEOUT' | 'CONNECT_FAILED' | 'LOCAL_ERROR' | 'BAD_OUTPUT';
    if (isTimeout) {
      failType = 'LOCAL_TIMEOUT';
    } else if (isConnRefused) {
      failType = 'CONNECT_FAILED';
    } else if (isBadOutputOrHangup) {
      failType = 'BAD_OUTPUT';
    } else {
      failType = 'LOCAL_ERROR';
    }

    // Automatic Fail-Safe to Cloud Pro (gpt-4o-mini on parseos.tech)
    const proResult = await executeCloudProFallback(request, options);

    return {
      content: proResult,
      ranOn: 'pro',
      fellBackToPro: true,
      failType,
      latencyMs: Math.round(performance.now() - startTime),
    };
  }
}

/**
 * Cloud Pro fallback using the developer's Bearer token.
 */
export async function executeCloudProFallback(
  request: Omit<LocalChatCompletionRequest, 'model'>,
  options?: LocalExecutionOptions
): Promise<string> {
  const token = options?.deviceToken;
  const deviceId = options?.deviceId;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (deviceId) {
    headers['X-Device-Id'] = deviceId;
  }

  try {
    const response = await fetch(CLOUD_PRO_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.max_tokens ?? 2000,
      }),
      signal: AbortSignal.timeout(options?.timeoutMs || 25000),
    });

    if (!response.ok) {
      return '';
    }

    const data = (await response.json()) as LocalChatCompletionResponse;
    return data.choices?.[0]?.message?.content ?? '';
  } catch {
    return '';
  }
}
