/**
 * Longitudinal work-style trait reader.
 *
 * Reads the param-event log (never raw prompt text) and produces a
 * `WorkStyleProfile` — stable, personal work-style traits inferred from how the
 * user has behaved across their whole prompt history. Zero LLM, zero network; a
 * pure running aggregate over the event stream, so it survives the prompts
 * 500-FIFO and any param-event pruning (it reads only events).
 *
 * The traits are NEUTRAL descriptors, not good/bad judgements. They exist to tune
 * the TONE and FRAMING of advisory content (e.g. a fast-deciding user reads as
 * "you move quickly"; an architecture-leaning user gets advice framed at the
 * design level) — they NEVER fire a signed "right" or "mistake" advisory. A
 * personality is not a defect, so this module emits no state a firing layer could
 * route on; the consumer only reads a descriptor.
 *
 * Each trait is a closed ordinal spectrum with a `balanced` midpoint:
 *  - decision rhythm:    decisive ↔ balanced ↔ deliberative
 *  - explanation depth:  terse ↔ balanced ↔ teaching
 *  - abstraction level:  code_first ↔ balanced ↔ architecture_first
 *
 * `balanced` is a real midpoint value (mixed evidence). It is DISTINCT from UNSET
 * (`null`), which means "not enough evidence to claim anything" — a trait is never
 * defaulted to a pole; below the cold-start gate it stays UNSET and the consumer
 * falls back to register/nature. Aggregating over the full longitudinal log (not
 * a short recent window) keeps a trait materially stickier than the session mood,
 * so a transient mood never flips it.
 *
 * Detection basis per trait (v1 heuristics; tunable once telemetry exists):
 *  - decision rhythm:   ratio of option-weighing events (lean deliberative) to
 *                       act-then-restart events (lean decisive). Decision latency
 *                       is a noted future refinement, not yet folded in.
 *  - abstraction level: share of prompts spent in design/architecture stages vs
 *                       the implementation stage. A keyword-based secondary input
 *                       is a noted future refinement, not yet folded in.
 *
 * Event source: decision rhythm counts BOTH live and historical-import events (a
 * trait reads over the full behavioural history). Abstraction level is LIVE-ONLY —
 * it needs per-prompt stage attribution, which historical-import rows (stage-less)
 * don't carry — so those rows are skipped there.
 *  - explanation depth: DORMANT — it needs a transcript-channel signal (how the
 *                       user reacts to long vs terse output) that is not yet
 *                       captured, so it always reports UNSET for now. The axis is
 *                       wired so it activates when that channel lands, with no
 *                       caller change.
 */

import type { ParamEvent } from '../telemetry/param-events.js';
import { readParamEvents } from '../telemetry/param-events.js';
import type { Store } from '../store/db.js';
import type { Stage } from './types.js';
import { NATURE_DEPTH_RECOMPUTE_INTERVAL } from './UserProfileClassifier.js';
import type { ParamAxisTag } from '../decision-session/content-template-schema.js';

// ── Trait value spectra (closed ordinal, `balanced` midpoint) ──────────────────

export type DecisionRhythm = 'decisive' | 'balanced' | 'deliberative';
export type ExplanationDepth = 'terse' | 'balanced' | 'teaching';
export type AbstractionLevel = 'code_first' | 'balanced' | 'architecture_first';

/** Ordered low→high — the midpoint is always index 1. */
export const DECISION_RHYTHM_SCALE: readonly DecisionRhythm[] = ['decisive', 'balanced', 'deliberative'];
export const EXPLANATION_DEPTH_SCALE: readonly ExplanationDepth[] = ['terse', 'balanced', 'teaching'];
export const ABSTRACTION_LEVEL_SCALE: readonly AbstractionLevel[] = ['code_first', 'balanced', 'architecture_first'];

/** Each trait is represented as a closed-ordinal axis (shared param-axis tag set). */
export const WORK_STYLE_PARAM_AXES: Readonly<Record<string, ParamAxisTag>> = {
  decision_making_rhythm: 'closed-ordinal',
  explanation_learning_depth: 'closed-ordinal',
  abstraction_level_orientation: 'closed-ordinal',
};

/** One resolved trait. `value: null` = UNSET (insufficient evidence; never a default pole). */
export interface WorkStyleTrait<T> {
  value: T | null;
  /** Passed the cold-start + multi-session stability gate. */
  stable: boolean;
  /** Contributing observations (events for rhythm; distinct prompts for abstraction). */
  observations: number;
  /** Distinct sessions the evidence spanned. */
  sessions: number;
  /** True while the trait cannot yet be detected (its source channel is absent). */
  dormant: boolean;
}

export interface WorkStyleProfile {
  decisionRhythm: WorkStyleTrait<DecisionRhythm>;
  explanationDepth: WorkStyleTrait<ExplanationDepth>;
  abstractionLevel: WorkStyleTrait<AbstractionLevel>;
}

// ── Tunable constants (v1 defaults; recalibrated once telemetry exists) ─────────

/** Cold-start floor: a trait stays UNSET below this many contributing observations. */
export const WORK_STYLE_MIN_OBSERVATIONS = 4;
/** A trait must span at least this many distinct sessions to be claimed (anti session-fluke). */
export const WORK_STYLE_MIN_SESSIONS = 2;
/** Neutral band around the 0.5 split — a ratio inside [low, high] reads as `balanced`. */
export const WORK_STYLE_NEUTRAL_BAND_LOW = 0.4;
export const WORK_STYLE_NEUTRAL_BAND_HIGH = 0.6;
/**
 * Recompute cadence (prompts). A multiple of the profile/mood recompute interval
 * so a transient mood swing can never flip a stable trait.
 */
export const WORK_STYLE_RECOMPUTE_INTERVAL = NATURE_DEPTH_RECOMPUTE_INTERVAL * 4;

/** Signal keys whose presence weighs toward each decision-rhythm pole. */
const DELIBERATIVE_SIGNAL = 'alternatives_seeking'; // weighs options before committing
const DECISIVE_SIGNAL = 'restart_impulse_check';    // acts fast, course-corrects later

/** Stages that read as design/architecture thinking vs hands-on coding. */
const DESIGN_STAGES: ReadonlySet<Stage> = new Set<Stage>(['idea', 'prd', 'architecture', 'task_breakdown']);
const CODE_STAGE: Stage = 'implementation';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface WorkStyleOptions {
  /** Reference time for the rolling window (defaults to Date.now()). */
  now?: number;
  /** Rolling window: only events within this many days (undefined = all time). */
  windowDays?: number;
  /** Rolling window: only the most recent N events (undefined = all). */
  windowCount?: number;
}

function promptKey(sessionId: string, promptIndex: number): string {
  return `${sessionId} ${promptIndex}`;
}

/** Apply the optional rolling window (days, then most-recent-N) by ts. */
function applyWindow(events: ParamEvent[], opts: WorkStyleOptions): ParamEvent[] {
  let out = events;
  if (opts.windowDays !== undefined) {
    const now = opts.now ?? Date.now();
    const cutoff = now - opts.windowDays * DAY_MS;
    out = out.filter((e) => e.ts >= cutoff);
  }
  if (opts.windowCount !== undefined && out.length > opts.windowCount) {
    out = [...out].sort((a, b) => a.ts - b.ts).slice(-opts.windowCount);
  }
  return out;
}

/** Map a 0–1 lean ratio onto a low/mid/high spectrum via the neutral band. */
function poleFromRatio<T>(ratio: number, scale: readonly T[]): T {
  if (ratio <= WORK_STYLE_NEUTRAL_BAND_LOW) return scale[0];
  if (ratio >= WORK_STYLE_NEUTRAL_BAND_HIGH) return scale[2];
  return scale[1];
}

/** A trait that cannot be claimed yet (cold-start or dormant). */
function unsetTrait<T>(observations: number, sessions: number, dormant: boolean): WorkStyleTrait<T> {
  return { value: null, stable: false, observations, sessions, dormant };
}

function resolveDecisionRhythm(events: ParamEvent[]): WorkStyleTrait<DecisionRhythm> {
  let deliberative = 0;
  let decisive = 0;
  const sessions = new Set<string>();
  for (const e of events) {
    if (e.signalKey === DELIBERATIVE_SIGNAL) deliberative++;
    else if (e.signalKey === DECISIVE_SIGNAL) decisive++;
    else continue;
    sessions.add(e.sessionId);
  }
  const observations = deliberative + decisive;
  if (observations < WORK_STYLE_MIN_OBSERVATIONS || sessions.size < WORK_STYLE_MIN_SESSIONS) {
    return unsetTrait(observations, sessions.size, false);
  }
  const ratio = deliberative / observations;
  return { value: poleFromRatio(ratio, DECISION_RHYTHM_SCALE), stable: true, observations, sessions: sessions.size, dormant: false };
}

function resolveAbstractionLevel(events: ParamEvent[]): WorkStyleTrait<AbstractionLevel> {
  // Distinct live prompts per stage cluster — abstraction is about WHERE prompts land.
  const designPrompts = new Set<string>();
  const codePrompts = new Set<string>();
  const sessions = new Set<string>();
  for (const e of events) {
    if (e.source !== 'live' || e.stage === null) continue;
    const pk = promptKey(e.sessionId, e.promptIndex);
    if (DESIGN_STAGES.has(e.stage)) { designPrompts.add(pk); sessions.add(e.sessionId); }
    else if (e.stage === CODE_STAGE) { codePrompts.add(pk); sessions.add(e.sessionId); }
  }
  const observations = designPrompts.size + codePrompts.size;
  if (observations < WORK_STYLE_MIN_OBSERVATIONS || sessions.size < WORK_STYLE_MIN_SESSIONS) {
    return unsetTrait(observations, sessions.size, false);
  }
  const ratio = designPrompts.size / observations;
  return { value: poleFromRatio(ratio, ABSTRACTION_LEVEL_SCALE), stable: true, observations, sessions: sessions.size, dormant: false };
}

/**
 * Explanation depth is DORMANT: its evidence (how the user reacts to long vs terse
 * output) needs a transcript-channel signal that isn't captured yet, so it always
 * reports UNSET. Wired now so it activates with no caller change when that lands.
 */
function resolveExplanationDepth(): WorkStyleTrait<ExplanationDepth> {
  return unsetTrait(0, 0, true);
}

/** Compute the work-style profile from a list of param-events. Pure — no I/O. */
export function computeWorkStyleProfile(events: ParamEvent[], opts: WorkStyleOptions = {}): WorkStyleProfile {
  const windowed = applyWindow(events, opts);
  return {
    decisionRhythm: resolveDecisionRhythm(windowed),
    explanationDepth: resolveExplanationDepth(),
    abstractionLevel: resolveAbstractionLevel(windowed),
  };
}

/** True once enough prompts have elapsed since the last computation to recompute. */
export function shouldRecomputeWorkStyle(lastComputedAt: number, currentPromptCount: number): boolean {
  return currentPromptCount - lastComputedAt >= WORK_STYLE_RECOMPUTE_INTERVAL;
}

/**
 * Store-backed convenience: read this project's param-events and compute the
 * profile. Consumers use this; tests exercise computeWorkStyleProfile directly.
 */
export function loadWorkStyleProfile(store: Store, projectRoot: string, opts: WorkStyleOptions = {}): WorkStyleProfile {
  return computeWorkStyleProfile(readParamEvents(store, projectRoot), opts);
}
