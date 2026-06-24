/**
 * Single-dispatch param-keyed selection registry for decision-session content.
 *
 * Re-expresses the hand-coded selection cascade in `options.ts` (`selectAbsenceMap`
 * / `selectRoleAbsenceMap` / `isVibe` / `selectNonBeginnerVariant` +
 * `resolveDecisionContent`) as ONE map per axis chained by a single dispatch —
 * every case explicit, no scattered boolean-flag branches. Multi-axis resolution
 * is chained single-axis lookups, not tuple-widened keys.
 *
 * It resolves the SAME `DecisionContent` as `resolveDecisionContent` (kept in
 * lock-step with it) and reuses the existing content maps verbatim — no new
 * content. Not yet wired into the live render path.
 *
 * Register note: this derives the register LOCALLY rather than via
 * `register.ts::profileToRegister`, because the two disagree on `cool_geek`:
 * `profileToRegister` maps `cool_geek → beginner`, but the content cascade treats
 * only `nature === 'beginner'` as beginner/vibe (so `cool_geek → casual`). Matching
 * the existing content output is the binding requirement here; the divergence is a
 * known inconsistency to reconcile later.
 */

import type { Stage, UserProfile } from '../classifier/types.js';
import type { FlagType } from '../classifier/Stage2Trigger.js';
import type { DecisionContent } from './options.js';
import {
  ABSENCE_CONTENT,
  ABSENCE_CONTENT_CASUAL,
  ABSENCE_CONTENT_FOUNDER,
  ABSENCE_CONTENT_INDIE_HACKER,
  ABSENCE_CONTENT_PM,
  ABSENCE_CONTENT_PRO_GEEK_SOUL,
  TRANSITION_CONTENT,
  TASK_REVIEW,
  TASK_REVIEW_CASUAL,
  resolveSkippedTransitionContent,
} from './options.js';
import {
  ABSENCE_CONTENT_BEGINNER,
  TRANSITION_CONTENT_BEGINNER,
  TASK_REVIEW_BEGINNER,
} from './options-beginner.js';

/** The three register variants the content surface supports. */
export type SelectionRegister = 'beginner' | 'formal' | 'casual';

type AbsenceMap = Partial<Record<string, DecisionContent>>;
type TransitionMap = Partial<Record<Stage, DecisionContent>>;
type Role = NonNullable<UserProfile['role']>;

/**
 * Register axis — single dispatch over nature (one switch, every case explicit).
 * Matches the cascade's gate exactly: only `beginner` is beginner/vibe;
 * `hardcore_pro` is formal; everything else (`cool_geek`, `pro_geek_soul`,
 * null/undefined) is casual. NOT `profileToRegister` (see file header).
 */
export function selectionRegister(nature: UserProfile['nature'] | null | undefined): SelectionRegister {
  switch (nature) {
    case 'beginner':     return 'beginner';
    case 'hardcore_pro': return 'formal';
    default:             return 'casual';
  }
}

// ── One map per axis ───────────────────────────────────────────────────────────

/** signalKey → absence content, keyed by register. */
const ABSENCE_BY_REGISTER: Record<SelectionRegister, AbsenceMap> = {
  beginner: ABSENCE_CONTENT_BEGINNER,
  formal:   ABSENCE_CONTENT,
  casual:   ABSENCE_CONTENT_CASUAL,
};

/** stage → transition content, keyed by register (formal + casual share the map). */
const TRANSITION_BY_REGISTER: Record<SelectionRegister, TransitionMap> = {
  beginner: TRANSITION_CONTENT_BEGINNER,
  formal:   TRANSITION_CONTENT,
  casual:   TRANSITION_CONTENT,
};

/** Within-stage / fallback content, keyed by register. */
const TASK_REVIEW_BY_REGISTER: Record<SelectionRegister, DecisionContent> = {
  beginner: TASK_REVIEW_BEGINNER,
  formal:   TASK_REVIEW,
  casual:   TASK_REVIEW_CASUAL,
};

/** signalKey → absence content, keyed by role (roles without an override are absent). */
const ABSENCE_BY_ROLE: Partial<Record<Role, AbsenceMap>> = {
  founder:      ABSENCE_CONTENT_FOUNDER,
  indie_hacker: ABSENCE_CONTENT_INDIE_HACKER,
  pm:           ABSENCE_CONTENT_PM,
};

// ── Single-dispatch resolution ─────────────────────────────────────────────────

/**
 * Resolve the `DecisionContent` for a fire, by chaining single-axis lookups.
 * Behaviourally identical to `resolveDecisionContent`.
 *
 * Order (highest precedence first):
 *   1. absence fire → role override → pro_geek_soul override → register absence map
 *   2. stage-transition skip → nearest intermediate transition content
 *   3. direct transition content for the current stage
 *   4. register fallback (within-stage / ultimate)
 */
export function resolveSelection(
  currentStage: Stage,
  flagType:     FlagType,
  profile?:     UserProfile | null,
  prevStage?:   Stage,
): DecisionContent {
  const register      = selectionRegister(profile?.nature);
  const absenceMap    = ABSENCE_BY_REGISTER[register];
  const transitionMap = TRANSITION_BY_REGISTER[register];
  // Role overrides never apply to the beginner register (the cascade's isVibe gate).
  const roleMap       = register === 'beginner' ? undefined
    : profile?.role ? ABSENCE_BY_ROLE[profile.role] : undefined;

  if (flagType.startsWith('absence:')) {
    const signalKey = flagType.slice('absence:'.length);
    const roleHit = roleMap?.[signalKey];
    if (roleHit) return roleHit;
    if (profile?.nature === 'pro_geek_soul') {
      const pgOverride = ABSENCE_CONTENT_PRO_GEEK_SOUL[signalKey];
      if (pgOverride) return pgOverride;
    }
    const override = absenceMap[signalKey];
    if (override) return override;
  }

  if (flagType === 'stage_transition' && prevStage) {
    const skipped = resolveSkippedTransitionContent(transitionMap, prevStage, currentStage);
    if (skipped) return skipped;
  }

  const direct = transitionMap[currentStage];
  if (direct) return direct;

  return TASK_REVIEW_BY_REGISTER[register];
}
