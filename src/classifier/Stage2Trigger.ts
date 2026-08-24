import type { SessionState, Stage, AbsenceFlag } from './types.js';
import { SIGNAL_MAP } from './signals.js';

/**
 * Advisory-fire trigger + shared stage helpers.
 *
 * `shouldFireStage2` is the DETERMINISTIC trigger deciding whether an advisory
 * decision should be considered for this prompt — a stage transition, a fresh
 * absence flag, or a low-confidence classification with an active absence flag. The
 * single-LLM stage classifier then cross-confirms whether to actually fire.
 *
 * The stage-label maps + `buildSignalList` are shared stage utilities consumed by
 * the stage classifier when it composes its prompt.
 */

// ── Constants ──────────────────────────────────────────────────────────────────

/** The model used by the stage classifier. */
export const STAGE2_MODEL              = 'gpt-4o-mini';
/** Prompts of recent context to include in the classifier prompt. */
export const STAGE2_CONTEXT_WINDOW     = 10;
/** Max output tokens for the classifier call. */
export const STAGE2_MAX_OUTPUT_TOKENS  = 256;
/** Classifier confidence below this → do not fire a decision session. */
export const STAGE2_LLM_MIN_CONFIDENCE = 0.49;
/** Stage-1 confidence below this → the low-confidence condition for the fire trigger. */
export const STAGE2_S1_LOW_CONFIDENCE  = 0.50;

// ── Stage label maps ───────────────────────────────────────────────────────────

/** Human-readable labels sent in the classifier prompt. */
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

// ── Types ──────────────────────────────────────────────────────────────────────

/** What triggered a fire consideration. */
export type FlagType = 'stage_transition' | `absence:${string}`;

/** Return value of `shouldFireStage2` — a discriminated union. */
export type Stage2TriggerResult =
  | null
  | { kind: 'stage_transition' }
  | { kind: 'absence'; qualifyingFlags: AbsenceFlag[] };

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build the signal checklist for the classifier prompt.
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
 * The all-stages signal checklist (deduped union across every stage), computed once at
 * module load. The stage classifier sends this instead of a single stage's list so the
 * model can see the signals of whichever stage it determines — scoping the checklist to
 * the session's prior stage starved it of any evidence for a forward transition.
 */
const FULL_SIGNAL_LIST: string = [...new Set(
  (Object.keys(STAGE_LABEL) as Stage[]).flatMap((stage) => buildSignalList(stage).split('\n')).filter(Boolean),
)].join('\n');

/** The precomputed all-stages signal checklist for the classifier prompt. */
export function buildFullSignalList(): string {
  return FULL_SIGNAL_LIST;
}

// ── Fire-trigger decision ────────────────────────────────────────────────────

/**
 * Determine whether an advisory decision should be considered, based on session
 * state and new flags. Returns a Stage2TriggerResult — or null if nothing should fire.
 *
 * Conditions (from the research table):
 *   1. Stage transition detected          → { kind: 'stage_transition' }
 *   2. New absence flags raised           → { kind: 'absence', qualifyingFlags: newAbsenceFlags }
 *   3. S1 confidence < 0.50 AND at least one active (non-dismissed, non-cooldown) absence flag
 *                                         → { kind: 'absence', qualifyingFlags: activeFlags }
 */
export function shouldFireStage2(
  state:            SessionState,
  prevStage:        Stage | undefined,
  newAbsenceFlags:  AbsenceFlag[],
  s1LowConfidence = STAGE2_S1_LOW_CONFIDENCE,
): Stage2TriggerResult {
  // Condition 1 — stage transition
  if (prevStage !== undefined && prevStage !== state.currentStage) {
    return { kind: 'stage_transition' };
  }

  // Condition 2 — fresh absence flags (all qualify)
  if (newAbsenceFlags.length > 0) {
    return { kind: 'absence', qualifyingFlags: newAbsenceFlags };
  }

  // Condition 3 — low-confidence classification AND active (non-dismissed, non-cooldown) absence flags
  if (state.stageConfidence < s1LowConfidence) {
    const activeFlags = state.absenceFlags.filter(
      (f) => f.dismissedAtIndex === undefined && state.promptCount < f.cooldownUntil,
    );
    if (activeFlags.length > 0) return { kind: 'absence', qualifyingFlags: activeFlags };
  }

  return null;
}
