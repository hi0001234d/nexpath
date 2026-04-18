import OpenAI from 'openai';
import type { SessionState, Stage, AbsenceFlag } from './types.js';
import { SIGNAL_MAP } from './signals.js';

/**
 * Stage 2 LLM cross-confirmation (per intent-classification-research.md Part 3).
 *
 * Fires only when Stage 1 raises a flag:
 *   - Stage transition detected
 *   - Absence flag raised (signal never seen in confirmed stage)
 *   - Classifier confidence < 0.50 AND an active absence flag exists
 *
 * Makes a single gpt-4o-mini call with a < 600-token prompt containing:
 *   - Session context (detected stage, confidence, flag type)
 *   - Last 10 developer prompts
 *   - Stage options + relevant signal list
 *
 * Returns the LLM's JSON decision, including `fire_decision_session`.
 */

// ── Constants ──────────────────────────────────────────────────────────────────

export const STAGE2_MODEL              = 'gpt-4o-mini';
export const STAGE2_CONTEXT_WINDOW     = 10;   // prompts to include in LLM context
export const STAGE2_MAX_OUTPUT_TOKENS  = 256;
/** LLM confidence below this threshold → override fire_decision_session to false. */
export const STAGE2_LLM_MIN_CONFIDENCE = 0.60;
/** Stage 1 confidence below this threshold → low-confidence condition for Stage 2. */
export const STAGE2_S1_LOW_CONFIDENCE  = 0.50;

// ── Stage label maps ───────────────────────────────────────────────────────────

/** Human-readable labels sent in the LLM prompt. */
export const STAGE_LABEL: Record<Stage, string> = {
  idea:           'Idea',
  prd:            'PRD/Spec',
  architecture:   'Architecture',
  task_breakdown: 'Task Breakdown',
  implementation: 'Implementation',
  review_testing: 'Review/Testing',
  release:        'Release',
  feedback_loop:  'Feedback Loop',
};

/** Reverse map: LLM label → Stage enum value. */
export const STAGE_FROM_LABEL: Record<string, Stage> = Object.fromEntries(
  Object.entries(STAGE_LABEL).map(([k, v]) => [v, k as Stage]),
);

const STAGE_OPTIONS = Object.values(STAGE_LABEL).join(' | ');

// ── Types ──────────────────────────────────────────────────────────────────────

/** What triggered this Stage 2 call. */
export type FlagType = 'stage_transition' | `absence:${string}`;

export interface Stage2Input {
  state:          SessionState;
  detectedStage:  Stage;
  confidence:     number;
  flagType:       FlagType;
}

export interface Stage2Output {
  stage:                Stage;
  stage_confidence:     number;
  signals_present:      string[];
  signals_absent:       string[];
  fire_decision_session: boolean;
  reason:               string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build the signal checklist for the LLM prompt.
 * Only signals expected in the detected stage are included.
 */
export function buildSignalList(stage: Stage): string {
  const lines: string[] = [];
  for (const sig of SIGNAL_MAP.values()) {
    if (sig.expectedStages.includes(stage)) {
      lines.push(`${sig.key}: ${sig.description}`);
    }
  }
  return lines.join('\n');
}

/**
 * Build the complete LLM confirmation prompt per research spec.
 * Context window: last STAGE2_CONTEXT_WINDOW prompts (oldest first).
 */
export function buildStage2Prompt(input: Stage2Input): string {
  const { state, detectedStage, confidence, flagType } = input;
  const stageLabel = STAGE_LABEL[detectedStage];

  const recentPrompts = state.promptHistory.slice(-STAGE2_CONTEXT_WINDOW);
  const promptLines = recentPrompts
    .map((p, i) => `[${i + 1}] ${p.text}`)
    .join('\n');
  const signalList = buildSignalList(detectedStage);

  return `You are analysing developer prompts captured from an AI coding agent session to determine the developer's current stage and whether key development practices are being followed.

Current session context:
- Stage detected by classifier: ${stageLabel}
- Classifier confidence: ${confidence.toFixed(2)}
- Flag raised: ${flagType}

Last ${recentPrompts.length} developer prompts (oldest first):
${promptLines}

Stage options: ${STAGE_OPTIONS}

Signals to check (answer only for signals relevant to the detected stage):
${signalList}

Return JSON only — no explanation, no markdown:
{
  "stage": "<stage from options above>",
  "stage_confidence": <0.0-1.0>,
  "signals_present": ["<signal_key>"],
  "signals_absent": ["<signal_key>"],
  "fire_decision_session": <true|false>,
  "reason": "<one sentence max>"
}`;
}

// ── Stage 2 trigger decision ───────────────────────────────────────────────────

/**
 * Determine whether Stage 2 should fire based on session state and new flags.
 *
 * Returns a FlagType string if Stage 2 should fire, null otherwise.
 *
 * Conditions (from research table):
 *   1. Stage transition detected → 'stage_transition'
 *   2. New absence flag raised   → 'absence:<signalKey>'
 *   3. S1 confidence < 0.50 AND an active absence flag exists → 'absence:<signalKey>'
 */
export function shouldFireStage2(
  state:           SessionState,
  prevStage:       Stage | undefined,
  newAbsenceFlags: AbsenceFlag[],
): FlagType | null {
  // Condition 1 — stage transition
  if (prevStage !== undefined && prevStage !== state.currentStage) {
    return 'stage_transition';
  }

  // Condition 2 — fresh absence flag
  if (newAbsenceFlags.length > 0) {
    return `absence:${newAbsenceFlags[0].signalKey}`;
  }

  // Condition 3 — low-confidence classification AND an active (non-cooldown) absence flag
  if (state.stageConfidence < STAGE2_S1_LOW_CONFIDENCE) {
    const active = state.absenceFlags.find(
      (f) => f.dismissedAtIndex === undefined && state.promptCount < f.cooldownUntil,
    );
    if (active) return `absence:${active.signalKey}`;
  }

  return null;
}

// ── Response parsing ───────────────────────────────────────────────────────────

/**
 * Parse the raw LLM response string into a typed Stage2Output.
 *
 * - Strips markdown fencing (```json ... ```) if present.
 * - Maps human-readable stage labels back to Stage enum values.
 * - Overrides fire_decision_session to false when stage_confidence < STAGE2_LLM_MIN_CONFIDENCE.
 * - Throws descriptive errors on invalid or incomplete JSON.
 */
export function parseStage2Response(raw: string): Stage2Output {
  // Strip optional markdown fencing
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new Error(`Stage 2: invalid JSON response: ${raw.slice(0, 120)}`);
  }

  const p = parsed as Record<string, unknown>;

  if (typeof p.stage !== 'string')
    throw new Error('Stage 2: missing or non-string "stage" field');
  if (typeof p.stage_confidence !== 'number')
    throw new Error('Stage 2: missing or non-number "stage_confidence" field');
  if (!Array.isArray(p.signals_present))
    throw new Error('Stage 2: missing or non-array "signals_present" field');
  if (!Array.isArray(p.signals_absent))
    throw new Error('Stage 2: missing or non-array "signals_absent" field');
  if (typeof p.fire_decision_session !== 'boolean')
    throw new Error('Stage 2: missing or non-boolean "fire_decision_session" field');
  if (typeof p.reason !== 'string')
    throw new Error('Stage 2: missing or non-string "reason" field');

  const stage = STAGE_FROM_LABEL[p.stage as string];
  if (!stage) throw new Error(`Stage 2: unknown stage label "${p.stage}"`);

  // Post-processing: low LLM confidence → don't bother user
  const fireDecisionSession =
    (p.fire_decision_session as boolean) &&
    (p.stage_confidence as number) >= STAGE2_LLM_MIN_CONFIDENCE;

  return {
    stage,
    stage_confidence:      p.stage_confidence as number,
    signals_present:       p.signals_present as string[],
    signals_absent:        p.signals_absent as string[],
    fire_decision_session: fireDecisionSession,
    reason:                p.reason as string,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Run the Stage 2 LLM cross-confirmation call.
 *
 * @param input   Session context + flag that triggered Stage 2
 * @param client  Optional OpenAI client (inject for testing; defaults to new OpenAI())
 * @returns Parsed Stage2Output — caller reads `fire_decision_session`
 * @throws  On API failure or unparseable response
 */
export async function runStage2(
  input:   Stage2Input,
  client?: OpenAI,
): Promise<Stage2Output> {
  const openai = client ?? new OpenAI();
  const prompt = buildStage2Prompt(input);

  const response = await openai.chat.completions.create({
    model:       STAGE2_MODEL,
    messages:    [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens:  STAGE2_MAX_OUTPUT_TOKENS,
  });

  const raw = response.choices[0]?.message?.content ?? '';
  return parseStage2Response(raw);
}
