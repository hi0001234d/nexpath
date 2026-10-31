/**
 * The provider-API availability check the runtime gate reads for evidence flag 10.
 *
 * `providerApiAvailabilityProven` (`provider_api_availability_pending`) attests one thing: an LLM call
 * can actually be made — the provider client resolves its key and constructs. Unlike the owner
 * approvals and the host-hold contract, this is inherently RUNTIME evidence: it is true only when the
 * key is present at call time, so the launcher derives it by calling this check, never by asserting a
 * static flag. The value tracks the environment, not a sign-off.
 *
 * The signal is exactly the one the batch composer already reads: constructing the client throws when
 * the key is missing, which the batch reports as `no_key`. This mirrors that construction so the gate
 * and the batch agree on when the provider is available, and takes an injectable constructor so the
 * check is testable without a real key.
 */
import { newNexpathOpenAIClient } from '../config/llm-client-scope.js';
import OpenAI from 'openai';
import { nexpathClientHeaders } from '../config/nexpath-client-headers.js';

export type PromptEnhancementProviderApiAvailabilityReasonV1 =
  | 'provider_api_available'
  | 'provider_api_key_missing';

export interface PromptEnhancementProviderApiAvailabilityV1 {
  /** True only when the client constructed — the same condition under which the batch avoids `no_key`. */
  providerApiAvailable: boolean;
  reasonCode: PromptEnhancementProviderApiAvailabilityReasonV1;
}

/**
 * Derive provider availability by constructing the client, exactly as the batch does before a call.
 *
 * `constructClient` defaults to `new OpenAI()` — the real provider — and is injectable so a test can
 * drive both outcomes without depending on an ambient key. Construction is attempted at call time, so
 * importing this module has no provider side effect.
 */
export function checkPromptEnhancementProviderApiAvailabilityV1(
  // Token attribution (`X-Nexpath-Client` / `X-Nexpath-Surface`) rides on every provider client this
  // package builds. Carried here for ONE reason: this construction exists to mirror the batch
  // composer's, and a mirror that differs is not one — if the two constructions ever diverge, this
  // check stops answering the question it claims to answer.
  //
  // ⚠️ It buys nothing at runtime, and that is expected. Nothing is sent from here: the client is
  // constructed to see whether construction throws, and is then dropped without a request. The
  // headers matter on the sites that actually call.
  constructClient: () => unknown = () => newNexpathOpenAIClient({ defaultHeaders: nexpathClientHeaders() }),
): PromptEnhancementProviderApiAvailabilityV1 {
  try {
    constructClient();
    return { providerApiAvailable: true, reasonCode: 'provider_api_available' };
  } catch {
    return { providerApiAvailable: false, reasonCode: 'provider_api_key_missing' };
  }
}
