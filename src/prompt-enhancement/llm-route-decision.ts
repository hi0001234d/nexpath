import { newNexpathOpenAIClient } from '../config/llm-client-scope.js';
import OpenAI from 'openai';
import { nexpathClientHeaders } from '../config/nexpath-client-headers.js';
import {
  PROMPT_ENHANCEMENT_FAMILIES,
  PROMPT_ENHANCEMENT_PRIMARY_INTENTS,
  PROMPT_ENHANCEMENT_CAPABILITIES,
  type PromptEnhancementFamilyId,
  type PromptEnhancementPrimaryIntent,
  type PromptEnhancementCapabilityId,
} from './routing-taxonomy.js';
import {
  PROMPT_ENHANCEMENT_COST_MODEL_V1,
  PROMPT_ENHANCEMENT_COST_OUTPUT_TOKEN_CAP_V1,
  PROMPT_ENHANCEMENT_COST_TIMEOUT_MS_V1,
  PROMPT_ENHANCEMENT_COST_VALIDATION_RETRY_COUNT_V1,
} from './cost-observability.js';
import type { PromptEnhancementComposerClientV1 } from './llm-composer.js';

/**
 * E6 — bounded LLM route-decision call (phase 6.1).
 *
 * For NL-heavy / ambiguous prompts the deterministic keyword router would skip, this
 * asks gpt-4o-mini to decide the real route fields (familyId, primaryIntent,
 * capabilities, ambiguityState) from the enum sets. Mirrors the E4 composer pattern:
 * injectable client (default `new OpenAI()`), shared cost caps, strict-JSON parse,
 * retry on malformed/invalid, and `undefined` on ANY failure (no key, provider down,
 * timeout, out-of-enum) so the caller keeps the deterministic route. Never throws.
 *
 * Separate call (not combined with the E4 composer): the pipeline is route -> plan ->
 * compose, so the route must be decided before planning; a single combined call is a
 * future optimization (locked decision: "combined if feasible, else separate").
 */
export type PromptEnhancementRouteAmbiguityStateV1 =
  | 'clear'
  | 'ambiguous_surface_prompt'
  | 'missing_target'
  | 'conflicting_evidence'
  | 'weak_high_risk'
  | 'skip_no_useful_guidance';

const AMBIGUITY_STATES: readonly PromptEnhancementRouteAmbiguityStateV1[] = [
  'clear',
  'ambiguous_surface_prompt',
  'missing_target',
  'conflicting_evidence',
  'weak_high_risk',
  'skip_no_useful_guidance',
];

export interface PromptEnhancementLlmRouteDecisionV1 {
  familyId: PromptEnhancementFamilyId;
  primaryIntent: PromptEnhancementPrimaryIntent;
  capabilities: readonly PromptEnhancementCapabilityId[];
  ambiguityState: PromptEnhancementRouteAmbiguityStateV1;
}

export interface PromptEnhancementRouteDecisionLlmInputV1 {
  promptText: string;
  deterministicFamilyId: PromptEnhancementFamilyId;
  deterministicPrimaryIntent: PromptEnhancementPrimaryIntent;
}

const FAMILY_SET = new Set<string>(PROMPT_ENHANCEMENT_FAMILIES);
const INTENT_SET = new Set<string>(PROMPT_ENHANCEMENT_PRIMARY_INTENTS);
const CAPABILITY_SET = new Set<string>(PROMPT_ENHANCEMENT_CAPABILITIES);
const AMBIGUITY_SET = new Set<string>(AMBIGUITY_STATES);

function systemPrompt(): string {
  return [
    "You are Nexpath's prompt-enhancement router. Decide the route for the user's prompt.",
    'Choose EXACTLY one familyId, one primaryIntent, zero or more capabilities, and one ambiguityState,',
    'each strictly from the allowed lists. Do not invent values. Use "skip_no_useful_guidance" only when the',
    'prompt truly has no actionable target.',
    '',
    `Allowed familyId: ${JSON.stringify(PROMPT_ENHANCEMENT_FAMILIES)}`,
    `Allowed primaryIntent: ${JSON.stringify(PROMPT_ENHANCEMENT_PRIMARY_INTENTS)}`,
    `Allowed capabilities: ${JSON.stringify(PROMPT_ENHANCEMENT_CAPABILITIES)}`,
    `Allowed ambiguityState: ${JSON.stringify(AMBIGUITY_STATES)}`,
    '',
    'Reply with STRICT JSON only:',
    '{"familyId":"...","primaryIntent":"...","capabilities":["..."],"ambiguityState":"..."}',
  ].join('\n');
}

function userPrompt(input: PromptEnhancementRouteDecisionLlmInputV1): string {
  return [
    `User prompt:\n${input.promptText}`,
    '',
    `Deterministic first-pass guess (may be wrong): familyId=${input.deterministicFamilyId}, primaryIntent=${input.deterministicPrimaryIntent}.`,
  ].join('\n');
}

function parseRouteDecision(raw: string): PromptEnhancementLlmRouteDecisionV1 | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object') return undefined;
  const obj = parsed as Record<string, unknown>;

  const familyId = obj['familyId'];
  const primaryIntent = obj['primaryIntent'];
  const ambiguityState = obj['ambiguityState'];
  const capabilitiesRaw = Array.isArray(obj['capabilities']) ? obj['capabilities'] : [];

  if (typeof familyId !== 'string' || !FAMILY_SET.has(familyId)) return undefined;
  if (typeof primaryIntent !== 'string' || !INTENT_SET.has(primaryIntent)) return undefined;
  if (typeof ambiguityState !== 'string' || !AMBIGUITY_SET.has(ambiguityState)) return undefined;
  const capabilities = capabilitiesRaw.filter((c): c is string => typeof c === 'string' && CAPABILITY_SET.has(c));
  if (capabilities.length !== capabilitiesRaw.length) return undefined; // any out-of-enum capability rejects

  return {
    familyId: familyId as PromptEnhancementFamilyId,
    primaryIntent: primaryIntent as PromptEnhancementPrimaryIntent,
    capabilities: capabilities as PromptEnhancementCapabilityId[],
    ambiguityState: ambiguityState as PromptEnhancementRouteAmbiguityStateV1,
  };
}

export async function decidePromptEnhancementRouteViaLlmV1(
  input: PromptEnhancementRouteDecisionLlmInputV1,
  client?: PromptEnhancementComposerClientV1,
): Promise<PromptEnhancementLlmRouteDecisionV1 | undefined> {
  let openai: PromptEnhancementComposerClientV1;
  try {
    // Token attribution rides on the client, never on the call: `defaultHeaders` is applied by the
    // SDK to every request this client makes. `undefined` — which is what an own-key user gets — is
    // the same as passing nothing, so their requests are unchanged by this.
    openai = client ?? (newNexpathOpenAIClient({ defaultHeaders: nexpathClientHeaders() }) as unknown as PromptEnhancementComposerClientV1);
  } catch {
    return undefined;
  }

  const system = systemPrompt();
  const user = userPrompt(input);
  // Malformed / out-of-enum replies retry up to the locked count; a thrown error
  // (no key / provider down / timeout) is not retried (fast deterministic fallback).
  for (let attempt = 0; attempt <= PROMPT_ENHANCEMENT_COST_VALIDATION_RETRY_COUNT_V1; attempt++) {
    let raw: string | null | undefined;
    try {
      const response = await openai.chat.completions.create(
        {
          model: PROMPT_ENHANCEMENT_COST_MODEL_V1,
          max_tokens: PROMPT_ENHANCEMENT_COST_OUTPUT_TOKEN_CAP_V1,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_object' },
        },
        // maxRetries: 0 — the SDK's default internal retries would multiply the bounded
        // timeout into a long stall; failure here falls back to the deterministic route.
        { timeout: PROMPT_ENHANCEMENT_COST_TIMEOUT_MS_V1, maxRetries: 0 },
      );
      raw = response.choices?.[0]?.message?.content;
    } catch {
      return undefined;
    }
    const parsed = raw ? parseRouteDecision(raw) : undefined;
    if (parsed) return parsed;
  }
  return undefined;
}
