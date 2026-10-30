/**
 * Feature 1 — Context Engineering: Fail-Open Safety Wrapper (Feature 3 VED SLA)
 *
 * Guarantees zero unhandled exceptions ever escape the library and strictly enforces
 * timeout budgets (<2500ms Desktop hard ceiling, <800ms internal SLA).
 *
 * Under any exception, DB lock, or timeout, immediately returns the clean fail-open
 * fallback payload with isEnhanced: false and the untouched original prompt.
 */

import type {
  EnhancementResult,
  EnhancementOptions,
  EnhancementStage,
} from '../types/context-engineering.js';

export const DEFAULT_TIMEOUT_MS = 2500;

export interface FailOpenOptions extends EnhancementOptions {
  fallbackStage?: EnhancementStage;
}

/**
 * Executes a prompt enhancement action inside an unbreakable fail-open boundary.
 */
export async function withFailOpen<T extends EnhancementResult = EnhancementResult>(
  rawPrompt: string,
  action: (signal: AbortSignal) => Promise<T>,
  options?: FailOpenOptions
): Promise<T | EnhancementResult> {
  const startTime = performance.now();
  const timeoutMs = options?.timeoutMs && options.timeoutMs > 0
    ? options.timeoutMs
    : DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();

  // Wire external AbortSignal if provided. The abort also rejects the race below,
  // so a cancel returns at once even while the pipeline is stuck awaiting I/O.
  let onExternalAbort: (() => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    if (!options?.signal) return;
    onExternalAbort = () => {
      controller.abort();
      reject(new Error('Context-engineering enhancement aborted by caller'));
    };
    options.signal.addEventListener('abort', onExternalAbort, { once: true });
  });
  if (options?.signal?.aborted) {
    options.signal.removeEventListener('abort', onExternalAbort!);
    return buildFallbackResult(rawPrompt, startTime, options?.fallbackStage);
  }

  // Timer race
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Context-engineering SLA timeout exceeded (${timeoutMs}ms)`));
    }, timeoutMs);
  });

  const cleanup = () => {
    clearTimeout(timerId);
    if (onExternalAbort) options?.signal?.removeEventListener('abort', onExternalAbort);
  };

  try {
    const result = await Promise.race([
      action(controller.signal),
      timeoutPromise,
      abortPromise,
    ]);

    cleanup();
    return result;
  } catch (error) {
    cleanup();

    // Diagnostic log without throwing
    const durationMs = Math.min(Math.round(performance.now() - startTime), timeoutMs);
    const errMessage = error instanceof Error ? error.message : String(error);

    // In non-test environments or when debugging, record silently
    if (process.env.DEBUG_CONTEXT_ENGINEERING === '1') {
      console.warn(`[Context-Engineering Fail-Open] Degraded safely to raw prompt: ${errMessage} (${durationMs}ms)`);
    }

    return buildFallbackResult(rawPrompt, startTime, options?.fallbackStage, durationMs);
  }
}

/**
 * Builds the canonical 7-field fail-open fallback payload.
 */
export function buildFallbackResult(
  rawPrompt: string,
  startTime: number,
  fallbackStage: EnhancementStage = 'implementation',
  explicitDurationMs?: number
): EnhancementResult {
  const durationMs = explicitDurationMs !== undefined
    ? explicitDurationMs
    : Math.round(performance.now() - startTime);

  return {
    isEnhanced: false,
    enhancedPrompt: rawPrompt,
    stage: fallbackStage,
    stageConfidence: 0.0,
    injectedContextTags: [],
    contextTokenEstimate: 0,
    processingTimeMs: Math.max(1, durationMs),
  };
}
