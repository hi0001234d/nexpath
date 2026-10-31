import { newNexpathOpenAIClient } from '../config/llm-client-scope.js';
import OpenAI from 'openai';
import { promptEnhancementRiskKindsForTextV1 } from '../prompt-enhancement/safety-sendability.js';
import type { PromptEnhancementSensitiveActionClearanceV1 } from '../prompt-enhancement/sensitive-action-clearance.js';

/**
 * The sensitive-action clearance MICRO-CALL — the precision half of the confirmation-line
 * design, hosted on its own dedicated call.
 *
 * Why a dedicated call: the observation was first parked on the big multi-task stage
 * classifier and failed its recall floor twice (the model, buried under ~3,600 tokens of
 * other instructions, cleared risky imperatives against its own verbatim counter-example).
 * The same model with this focused single-question prompt measured 45/45 on the frozen
 * labelled set. The measurement record lives with the acceptance runner.
 *
 * Timing contract (the whole point of this module's shape):
 *   - STARTED before the stage classifier's own call and never awaited by anyone.
 *     `read()` returns synchronously whatever has settled; the caller reads it after the
 *     classifier await it already performs. Added pipeline wall time: exactly zero.
 *   - `abort()` tears down a still-pending request at the join, so the hook process's
 *     event loop drains exactly as it does today (a pending socket would otherwise keep
 *     the process alive into the next hook's window).
 *   - Deterministically gated: no risky word in the prompt (the same keyword table the
 *     confirmation layer uses) ⇒ no call is started — a verdict would be unusable anyway,
 *     because a clearance only ever suppresses a keyword candidate.
 *   - ACCEPTED TRADE, stated rather than implied: the call starts BEFORE the popup decision
 *     exists (parallelism requires pre-start), so gated calls on risky-word prompts that end
 *     with no popup are spent without being consumed. That waste is bounded by the gate
 *     (~17% of prompts) and costed in the inventory row; serializing to avoid it would put
 *     the call's full latency on the pipeline, which is the worse trade by design.
 *   - Fail-closed totality: gate-out, no key, provider error, timeout, abort-before-settle,
 *     unparseable, malformed verdict, empty reason — every one of them reads as `undefined`
 *     (no clearance), and the confirmation line then emits exactly as it does today. The
 *     popup itself NEVER depends on this call: not its existence, not its other content.
 *
 * All failures are caught inside this module — an abandoned promise can never surface an
 * unhandled rejection, and the caller never needs a try/catch.
 */

export const SENSITIVE_ACTION_MICRO_MODEL = 'gpt-4o-mini';
export const SENSITIVE_ACTION_MICRO_TIMEOUT_MS = 8_000;
export const SENSITIVE_ACTION_MICRO_MAX_OUTPUT_TOKENS = 120;

/** The focused single-question prompt — the exact text the acceptance measurement passed 45/45. */
export const SENSITIVE_ACTION_MICRO_SYSTEM_PROMPT = [
  'You judge ONE thing about a developer\'s prompt to a coding agent.',
  'Question: does the prompt ASK for a risky action to be performed, or does the risky word',
  'merely play a harmless role (a UI/styling term, a concept question, a bug description)?',
  'Risky actions: deleting/removing data, files or code; schema, migration or database changes;',
  'dependency installs or upgrades; secrets, tokens or credentials; production deploys, releases,',
  'publishing, or notifying users; force-push or history rewrites; security, auth or permission',
  'changes; cost/resource changes; repo-wide changes; agent-mode or permission changes.',
  'THE RULE: an imperative or request that names a risky action IS a proposal - however casual,',
  'and however routine it sounds. "npm install the new charting package", "publish the release',
  'and notify every customer", "rotate the api key" ALL propose their actions: answer "proposed".',
  'Do NOT judge whether the category seems dangerous in the abstract; judge ONLY whether this',
  'prompt asks for the action to be done. Routine-sounding is NOT the same as not-proposed.',
  'Reply STRICT JSON only:',
  '{"sensitive_action_verdict": "proposed" | "not_proposed",',
  ' "sensitive_action_reason": "<required with not_proposed: the benign reading of the risky word>",',
  ' "sensitive_action_name": "<only with proposed: the proposed action as a 2-5 word noun phrase, e.g. production deployment>"}',
  'A "not_proposed" without a non-empty reason is treated as unanswered.',
  'When unsure, answer "proposed" - NEVER guess "not_proposed".',
].join('\n');

/**
 * The outcome states, distinguishable so the capture/failure rate is readable from any
 * ordinary debug run (the I1 lesson: an absent value that cannot be told apart from
 * "never attempted" answers nothing — gated-out and failed need opposite responses).
 */
export type SensitiveActionMicroClearanceOutcomeV1 =
  | 'gated_out_no_risk_keyword'
  | 'gated_out_no_client'
  | 'settled'
  | 'unusable_reply'
  | 'pending_or_failed';

/** The zero-wait handle: read whatever has settled; abort anything still pending. */
export interface SensitiveActionMicroClearanceHandleV1 {
  /** Synchronous. `undefined` until (and unless) a usable verdict settled — the fail-closed value. */
  read(): PromptEnhancementSensitiveActionClearanceV1 | undefined;
  /** Tear down a still-pending request. Idempotent; a no-op once settled or gated out. */
  abort(): void;
  /** Synchronous outcome state at the moment of the call — for the audit/observability log. */
  outcome(): SensitiveActionMicroClearanceOutcomeV1;
}

function inertHandle(outcome: SensitiveActionMicroClearanceOutcomeV1): SensitiveActionMicroClearanceHandleV1 {
  return { read: () => undefined, abort: () => {}, outcome: () => outcome };
}

/** The deterministic gate: only a prompt with a keyword candidate can ever use a clearance. */
export function sensitiveActionMicroClearanceApplicableV1(promptText: string): boolean {
  return promptText.trim().length > 0 && promptEnhancementRiskKindsForTextV1(promptText).length > 0;
}

/** Minimal client surface, injectable for tests (mirrors the OpenAI SDK call we make). */
export interface SensitiveActionMicroClientV1 {
  chat: {
    completions: {
      create(
        params: {
          model: string;
          max_tokens: number;
          messages: { role: 'system' | 'user'; content: string }[];
        },
        options?: { timeout?: number; maxRetries?: number; signal?: AbortSignal },
      ): Promise<{ choices: { message?: { content?: string | null } }[] }>;
    };
  };
}

/** Parse with the same exact-literal discipline as the clearance gate: anything off ⇒ undefined. */
function parseMicroReply(raw: string): PromptEnhancementSensitiveActionClearanceV1 | undefined {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return undefined;
  }
  const p = parsed as Record<string, unknown>;
  const verdict = p.sensitive_action_verdict === 'proposed' || p.sensitive_action_verdict === 'not_proposed'
    ? p.sensitive_action_verdict
    : undefined;
  if (verdict === undefined) return undefined;
  const reason = typeof p.sensitive_action_reason === 'string' && p.sensitive_action_reason.trim().length > 0
    ? p.sensitive_action_reason
    : undefined;
  // Soft-parsed like the reason: captured for the provenance record, consumed by nothing
  // (owner ruling 2026-08-25 — see the clearance type's field doc). Junk shapes are absent.
  const name = typeof p.sensitive_action_name === 'string' && p.sensitive_action_name.trim().length > 0
    ? p.sensitive_action_name.trim()
    : undefined;
  // The reasonless-void rule is enforced again downstream by the shared gate; carrying the
  // parsed shape through keeps this parser's semantics identical to the classifier-reply
  // parser the plumbing was built against.
  return { verdict, reason, ...(name !== undefined ? { name } : {}) };
}

/**
 * Start the micro-call (or return the inert handle when gated out / no client available).
 * Never throws; never leaves an unhandled rejection; never requires the caller to await.
 */
export function startSensitiveActionMicroClearanceV1(
  promptText: string,
  client?: SensitiveActionMicroClientV1,
): SensitiveActionMicroClearanceHandleV1 {
  if (!sensitiveActionMicroClearanceApplicableV1(promptText)) return inertHandle('gated_out_no_risk_keyword');

  let resolvedClient: SensitiveActionMicroClientV1;
  try {
    // Same pattern as the stage classifier: construct on demand; no key ⇒ throws ⇒ inert.
    resolvedClient = client ?? (newNexpathOpenAIClient() as unknown as SensitiveActionMicroClientV1);
  } catch {
    return inertHandle('gated_out_no_client');
  }

  const controller = new AbortController();
  let settled: PromptEnhancementSensitiveActionClearanceV1 | undefined;
  let outcome: SensitiveActionMicroClearanceOutcomeV1 = 'pending_or_failed';

  resolvedClient.chat.completions
    .create(
      {
        model: SENSITIVE_ACTION_MICRO_MODEL,
        max_tokens: SENSITIVE_ACTION_MICRO_MAX_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: SENSITIVE_ACTION_MICRO_SYSTEM_PROMPT },
          { role: 'user', content: `The developer's prompt:\n${promptText}` },
        ],
      },
      { timeout: SENSITIVE_ACTION_MICRO_TIMEOUT_MS, maxRetries: 0, signal: controller.signal },
    )
    .then((completion) => {
      settled = parseMicroReply(completion.choices[0]?.message?.content ?? '');
      outcome = settled !== undefined ? 'settled' : 'unusable_reply';
    })
    .catch(() => {
      // Timeout, abort, provider error — all identical: no clearance, fail closed.
      settled = undefined;
      outcome = 'pending_or_failed';
    });

  return {
    read: () => settled,
    outcome: () => outcome,
    abort: () => {
      try {
        controller.abort();
      } catch {
        // An abort can never be allowed to throw into the pipeline.
      }
    },
  };
}
