/**
 * Browser build stub for the `openai` package (wired by the
 * `nexpath-node-shims` esbuild plugin; never imported directly by application
 * code; the CLI always gets the real SDK).
 *
 * Why it exists: six prompt-enhancement engine modules value-import the SDK and
 * fall back to `new OpenAI()` when no client is injected (llm-composer.ts:407,
 * llm-route-decision.ts:127, sequence-planner.ts:958, sequence-batch-composer
 * .ts:689, sequence-summary-wording.ts:268, provider-api-availability.ts:35).
 * Bundling the real SDK into the service worker is both heavy and non-functional
 * (the Node SDK refuses browser-like environments). This stub keeps the engine's
 * fallback paths WORKING with full LLM parity instead of silently degrading to
 * deterministic composition:
 *
 *  - `new OpenAI()` resolves the key from the engine-visible env slot
 *    (`process.env.OPENAI_API_KEY`, kept fresh by pe-engine's
 *    `refreshEngineKeyEnv`) and returns the fetch-backed SDK-shaped client via
 *    the shipped `llmToOpenAIClient` shim — the exact `.chat.completions.create`
 *    surface every engine call site uses.
 *  - With no key it THROWS AT CONSTRUCTION, byte-for-byte the real SDK's
 *    behaviour, so the engine's own "no client and no key → deterministic
 *    fallback" branches run unchanged.
 *
 * Only the surface the engine actually uses is provided (verified by grep:
 * default-import + zero-arg construction, no statics). Anything else fails
 * loudly so a new SDK dependency is handled deliberately.
 */

import { FetchLLMAdapter } from '../adapters/llm-fetch.js';
import { llmToOpenAIClient } from '../../core/decision/llm-openai-shim.js';

type EnvHolder = { process?: { env?: Record<string, string | undefined> } };

class BrowserOpenAIStub {
  constructor(opts?: { apiKey?: string }) {
    const key = opts?.apiKey ?? (globalThis as EnvHolder).process?.env?.['OPENAI_API_KEY'];
    if (typeof key !== 'string' || key.length === 0) {
      // Matches the real SDK's construct-time failure so engine catch/fallback
      // paths behave identically in the browser.
      throw new Error(
        'The OPENAI_API_KEY environment variable is missing or empty (nexpath browser openai stub).',
      );
    }
    return llmToOpenAIClient(new FetchLLMAdapter(key)) as unknown as BrowserOpenAIStub;
  }
}

export default BrowserOpenAIStub;
