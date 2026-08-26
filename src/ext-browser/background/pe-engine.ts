/**
 * The service worker's single seam onto the prompt-enhancement engine
 * (`src/prompt-enhancement/**` — Hiren/Bhavnesh's layer, never edited by the
 * browser milestone). Everything the browser needs from the engine flows
 * through this module so the coupling stays auditable in one place:
 *
 *  - the prepare/action facade entries + their request/result validators;
 *  - `buildEngineLlmClient` — the engine's SDK-shaped client backed by the
 *    browser's FetchLLMAdapter via the shipped `llmToOpenAIClient` shim (the
 *    OpenAI SDK itself is never constructed or bundled);
 *  - the process-env bootstrap + `refreshEngineKeyEnv` — the facade decides
 *    LLM-route eligibility by reading `process.env.OPENAI_API_KEY`
 *    (facade.ts, two read sites). MV3 workers have no `process`, so a minimal
 *    `{ env: {} }` is installed at import time and the stored key is copied in
 *    before every prepare/action call. Build-level workaround by design — the
 *    typed key seam on the facade is an open ask to the engine owners (R-1);
 *    no engine file is modified.
 *
 * node:fs / node:path / node:crypto reached through the engine's import graph
 * are satisfied by the browser shims in `src/ext-browser/shims/` (wired by the
 * `nexpath-node-shims` esbuild plugin) with absent-filesystem semantics, so
 * the engine's own defensive absent-path branches run — no behaviour invented.
 */

import type OpenAI from 'openai';
import { FetchLLMAdapter } from '../adapters/llm-fetch.js';
import { llmToOpenAIClient } from '../../core/decision/llm-openai-shim.js';

export {
  preparePromptEnhancement,
  preparePromptEnhancementWithSequenceV1,
  applyPromptEnhancementAction,
} from '../../prompt-enhancement/facade.js';
export {
  validatePromptEnhancementPrepareRequestV1,
  validatePromptEnhancementPrepareResultV1,
  PROMPT_ENHANCEMENT_CONTRACT_VERSION,
} from '../../prompt-enhancement/contracts.js';
export { isPromptEnhancementSequenceShapedTextV1 } from '../../prompt-enhancement/routing-taxonomy.js';
export { emitPromptEnhancementCostObservabilityV1 } from '../../prompt-enhancement/cost-measurement.js';
// The CLI PEF's feedback state machine — pure builders the popup host uses to
// turn a panel feedback command into the engine's own submitted event shape
// before persisting it (cli-submit-popup.ts:341-368 uses the same functions).
export {
  buildPromptEnhancementFeedbackAdapterStateV1,
  openPromptEnhancementFeedbackV1,
  editPromptEnhancementOtherFeedbackV1,
  submitPromptEnhancementSuggestedFeedbackV1,
  submitPromptEnhancementOtherFeedbackV1,
} from '../../prompt-enhancement/feedback-adapter.js';
export { getSourceRealityAdaptersSnapshot } from '../../prompt-enhancement/source-reality.js';
export {
  promptEnhancementAbsenceSignalKeyV1,
  promptEnhancementStageSignalKeyV1,
} from '../../prompt-enhancement/guidance-facts.js';
export { buildPromptEnhancementCostVisibilityMetadataV1 } from '../../prompt-enhancement/cost-observability.js';
// The engine's OWN popup state machine (PB4): the browser injects an
// `interaction` that bridges views/commands to the content-script panel, so
// every popup behaviour (F2 smooth send, refinement go-back stack, F3 silent
// action failures, sendability validation) is the CLI's code, not a rewrite.
export {
  runPromptEnhancementCliSubmitPopupV1,
  type PromptEnhancementCliPopupCommandV1,
  type PromptEnhancementCliPopupInteractionV1,
  type PromptEnhancementCliPopupResultV1,
  type PromptEnhancementCliPopupViewV1,
} from '../../prompt-enhancement/cli-submit-popup.js';
// MPS-1 sequence offer (PB6) — the engine's OWN intake gate, evidence builder
// and first-popup model; the browser renders the model and reports an outcome.
// No sequence runtime authority is created browser-side (continuations stay
// engine-gated and deferred).
export { evaluatePromptEnhancementMpsIntakeDecisionV1 } from '../../prompt-enhancement/intake-decision.js';
export { buildPromptEnhancementCliMpsIntakeEvidenceV1 } from '../../prompt-enhancement/cli-mps-intake-evidence.js';
export {
  buildPromptEnhancementMpsFirstPopupV1,
  type PromptEnhancementMpsFirstPopupModelV1,
} from '../../prompt-enhancement/first-popup.js';
export { promptEnhancementMpsActionSignalKindV1 } from '../../prompt-enhancement/cli-mps-run.js';

/** Bundle liveness marker — imported by the service worker's boot log so the
 * engine chain is provably part of the shipped bundle from PB1 onward. */
export const PE_ENGINE_READY = true as const;

type EnvHolder = { process?: { env?: Record<string, string | undefined> } };

// Install the minimal process shim once, at import time, WITHOUT clobbering a
// real `process` (vitest runs this module under Node, where process exists).
const holder = globalThis as EnvHolder;
if (holder.process === undefined) holder.process = { env: {} };
else if (holder.process.env === undefined) holder.process.env = {};

/**
 * Copy the user's stored OpenAI key into the engine-visible env slot (or clear
 * it). MUST be called before every facade prepare/action invocation — the key
 * is runtime-dynamic (set on the options page), so it can never be baked in at
 * build time.
 */
export function refreshEngineKeyEnv(apiKey: string | null | undefined): void {
  const env = (globalThis as EnvHolder).process!.env!;
  if (typeof apiKey === 'string' && apiKey.length > 0) env['OPENAI_API_KEY'] = apiKey;
  else delete env['OPENAI_API_KEY'];
}

/**
 * The engine's injectable SDK-shaped client, backed by the browser's fetch
 * adapter. Passing this into the facade's sequence deps / composer paths keeps
 * the real OpenAI SDK out of the bundle (verified by the build's grep gate).
 */
export function buildEngineLlmClient(apiKey: string): OpenAI {
  return llmToOpenAIClient(new FetchLLMAdapter(apiKey));
}
