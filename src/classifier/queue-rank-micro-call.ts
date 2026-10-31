import { newNexpathOpenAIClient } from '../config/llm-client-scope.js';
import OpenAI from 'openai';
import { detectAbsenceFlags } from './AbsenceDetector.js';

/**
 * The queue-rank MICRO-CALL: one focused question, hosted on its own dedicated call, started beside the
 * stage classifier and never awaited. Shape and discipline copied from sensitive-action-micro-clearance.ts.
 *
 * Why a dedicated call rather than a field on the stage classifier's own call: a constraint bolted onto a
 * 137-signal call is ignored, and shortening that call's list starves its stage judgement. This call sees
 * ONLY the allowed keys, so an out-of-queue answer is unrepresentable.
 *
 * Timing contract: started before the classifier's own call; `read()` returns synchronously whatever has settled;
 * the caller reads it at the pick, after awaits it already performs. Added pipeline wall time: zero.
 */
export const QUEUE_RANK_MICRO_MODEL = 'gpt-4o-mini';
export const QUEUE_RANK_MICRO_TIMEOUT_MS = 5_000;
export const QUEUE_RANK_MICRO_MAX_OUTPUT_TOKENS = 60;

export const QUEUE_RANK_MICRO_SYSTEM_PROMPT = [
  'You choose ONE software-engineering practice to raise with a developer, from a short allowed list.',
  'You are shown the developer\'s most recent prompts to a coding agent and the allowed practice keys.',
  'Pick the single key whose practice is MOST relevant to what the developer is doing right now.',
  'You MUST answer with one of the allowed keys exactly as written. Never invent, rename or combine keys.',
  'Reply STRICT JSON only: {"selected_signal_key": "<one allowed key>"}',
].join('\n');

export type QueueRankMicroOutcomeV1 =
  | 'gated_out_fewer_than_two'
  | 'gated_out_no_client'
  | 'settled'
  | 'unusable_reply'
  | 'pending_or_failed';

export interface QueueRankMicroHandleV1 {
  /** Synchronous. `undefined` until (and unless) a usable key settled. Always one of the offered keys. */
  read(): string | undefined;
  abort(): void;
  outcome(): QueueRankMicroOutcomeV1;
}

export interface QueueRankMicroClientV1 {
  chat: {
    completions: {
      create(
        params: { model: string; max_tokens: number; messages: { role: 'system' | 'user'; content: string }[] },
        options?: { timeout?: number; maxRetries?: number; signal?: AbortSignal },
      ): Promise<{ choices: { message?: { content?: string | null } }[] }>;
    };
  };
}

function inert(outcome: QueueRankMicroOutcomeV1): QueueRankMicroHandleV1 {
  return { read: () => undefined, abort: () => {}, outcome: () => outcome };
}

/** Exact-literal parse: the key must be one of the offered keys, byte for byte; anything else ⇒ undefined. */
export function parseQueueRankReplyV1(raw: string, offered: readonly string[]): string | undefined {
  const stripped = raw.replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\`\`\`\s*$/i, '').trim();
  let parsed: unknown;
  try { parsed = JSON.parse(stripped); } catch { return undefined; }
  const k = (parsed as Record<string, unknown>).selected_signal_key;
  return typeof k === 'string' && offered.includes(k) ? k : undefined;
}

/**
 * The candidate list offered to the ranking call, built BEFORE the stage classifier returns: the queue the engine
 * will enforce if the classifier leaves the stage where it is. The session state is therefore advanced exactly as
 * `processPrompt` will advance it for this prompt — one more prompt in the stage AND one more prompt overall.
 * Both matter: the detector's per-signal floor reads `promptsInCurrentStage`, and its cooldown gate compares
 * `promptCount` with each raised flag's `cooldownUntil`. Advancing only the first leaves the estimate one prompt
 * short on the prompt a cooldown batch expires — which is exactly when the enforced queue is at its largest.
 *
 * Pure: the state is copied, never written. The result is only ever OFFERED; the pick validates the ranked answer
 * against the enforced queue, so a candidate that does not materialise is refused and the fallback applies.
 */
export function estimateQueueIfStageStaysV1(
  state: Parameters<typeof detectAbsenceFlags>[0],
  profile: Parameters<typeof detectAbsenceFlags>[1],
  projectType: Parameters<typeof detectAbsenceFlags>[2],
  thresholdMultiplier: Parameters<typeof detectAbsenceFlags>[3],
  absenceMinFloor: Parameters<typeof detectAbsenceFlags>[4],
  runtimeContext: Parameters<typeof detectAbsenceFlags>[5],
): string[] {
  const advanced = {
    ...state,
    promptsInCurrentStage: (state.promptsInCurrentStage ?? 0) + 1,
    promptCount: (state.promptCount ?? 0) + 1,
  } as typeof state;
  return detectAbsenceFlags(advanced, profile, projectType, thresholdMultiplier, absenceMinFloor, runtimeContext)
    .map((f) => f.signalKey);
}

export function startQueueRankMicroCallV1(
  offeredKeys: readonly string[],
  recentPrompts: readonly string[],
  client?: QueueRankMicroClientV1,
): QueueRankMicroHandleV1 {
  if (offeredKeys.length < 2) return inert('gated_out_fewer_than_two');
  let resolved: QueueRankMicroClientV1;
  try { resolved = client ?? (newNexpathOpenAIClient() as unknown as QueueRankMicroClientV1); } catch { return inert('gated_out_no_client'); }

  const controller = new AbortController();
  let settled: string | undefined;
  let outcome: QueueRankMicroOutcomeV1 = 'pending_or_failed';
  const offered = [...offeredKeys];
  const user = [
    'Recent developer prompts (oldest first):',
    ...recentPrompts.map((p, i) => `[${i + 1}] ${p}`),
    '',
    'Allowed practice keys (choose exactly one):',
    offered.join(', '),
  ].join('\n');

  resolved.chat.completions
    .create(
      { model: QUEUE_RANK_MICRO_MODEL, max_tokens: QUEUE_RANK_MICRO_MAX_OUTPUT_TOKENS,
        messages: [{ role: 'system', content: QUEUE_RANK_MICRO_SYSTEM_PROMPT }, { role: 'user', content: user }] },
      { timeout: QUEUE_RANK_MICRO_TIMEOUT_MS, maxRetries: 0, signal: controller.signal },
    )
    .then((c) => { settled = parseQueueRankReplyV1(c.choices[0]?.message?.content ?? '', offered); outcome = settled !== undefined ? 'settled' : 'unusable_reply'; })
    .catch(() => { settled = undefined; outcome = 'pending_or_failed'; });

  return {
    read: () => settled,
    outcome: () => outcome,
    abort: () => { try { controller.abort(); } catch { /* never into the pipeline */ } },
  };
}
