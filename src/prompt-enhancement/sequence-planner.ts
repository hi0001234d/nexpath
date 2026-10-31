import { newNexpathOpenAIClient } from '../config/llm-client-scope.js';
import OpenAI from 'openai';
import type { Database } from 'sql.js';
import {
  PROMPT_ENHANCEMENT_COST_MODEL_V1,
  PROMPT_ENHANCEMENT_SEQUENCE_PLANNER_MODEL_V1,
  PROMPT_ENHANCEMENT_SEQUENCE_PLANNER_TIMEOUT_MS_V1,
  PROMPT_ENHANCEMENT_COST_VALIDATION_RETRY_COUNT_V1,
  PROMPT_ENHANCEMENT_SEQUENCE_PLANNER_OUTPUT_TOKEN_CAP_V1,
  PROMPT_ENHANCEMENT_SEQUENCE_PLANNER_OUTPUT_TOKEN_HARD_CAP_V1,
} from './cost-observability.js';
import {
  buildPromptEnhancementSequencePlannerRepairInstructionV1,
  buildPromptEnhancementSequencePlannerSystemPromptV1,
} from './sequence-planner-prompt.js';
import {
  promptEnhancementSequencePlannerMayRunForProjectV1,
  promptEnhancementSequencePolicyForOutcomeV1,
  type PromptEnhancementSequencePlannerEntryRequestV1,
  type PromptEnhancementSequencePlannerRefusalV1,
} from './sequence-planner-entry.js';
import {
  checkPromptEnhancementSequencePlannerBoundsV1,
  checkPromptEnhancementSequencePlannerGroupingV1,
  checkPromptEnhancementSequencePlannerOutcomeV1,
  type PromptEnhancementSequencePlannerCheckCodeV1,
  type PromptEnhancementSequencePlannerGroupV1,
  type PromptEnhancementSequencePlannerOutcomeReasonV1,
  type PromptEnhancementSequencePlannerOutcomeV1,
  type PromptEnhancementSequencePlannerPointV1,
  type PromptEnhancementSequencePlannerSummaryDataV1,
  type PromptEnhancementSequencePointKindV1,
} from './sequence-planner-output.js';
import {
  isPromptEnhancementSequenceOffsetRangeV1,
  promptEnhancementSequenceTaskRoleLabelsV1,
  validatePromptEnhancementSequenceItemListV1,
  type PromptEnhancementSequenceItemV1,
  type PromptEnhancementSequenceNextPromptPolicyV1,
  type PromptEnhancementSequenceOffsetRangeV1,
  type PromptEnhancementSequencePayloadReasonCodeV1,
  type PromptEnhancementSequenceRoleLabelV1,
} from './sequence-payload.js';
import { PROMPT_ENHANCEMENT_SEQUENCE_MAX_ITEM_COUNT_V1 } from './sequence-runtime.js';
import type {
  PromptEnhancementCapabilityId,
  PromptEnhancementFamilyId,
  PromptEnhancementPrimaryIntent,
  PromptEnhancementRouteConfidence,
} from './routing-taxonomy.js';
import { promptEnhancementSequenceRoleLabelForTextV1 } from './routing-taxonomy.js';
import {
  promptEnhancementAuthorityModeForTextV1,
  promptEnhancementRiskKindsForTextV1,
  type PromptEnhancementAuthorityMode,
  type PromptEnhancementSensitiveActionRiskKind,
} from './safety-sendability.js';

/**
 * The sequence planner call.
 *
 * One model call, three stages inside it — inventory the points, group them, slice the groups — and
 * it runs BEFORE the first body is composed, because whether a sequence is worth offering depends
 * on what the body would otherwise have to carry. Planning after composing would mean composing
 * twice.
 *
 * It plans and does not word: every item comes back with its parts and no text. The wording is a
 * separate call, so a planner that returned prose would either be discarded or mistaken for a
 * slice.
 *
 * Failure is typed and never thrown. A request with no key was never a call at all; a provider
 * error or a reply that does not parse is a real failure, and the caller distinguishes them
 * because "we never asked" and "we asked and it broke" are different things to report.
 */

export interface PromptEnhancementSequencePlannerClientV1 {
  chat: {
    completions: {
      create: (
        body: {
          model: string;
          max_tokens: number;
          messages: readonly { role: 'system' | 'user'; content: string }[];
          response_format?: { type: 'json_object' };
        },
        options?: { timeout?: number; maxRetries?: number },
      ) => Promise<{ choices?: readonly { message?: { content?: string | null } }[] }>;
    };
  };
}

/**
 * An item on its way to being one, before anything has been checked.
 *
 * The fields are loosely typed on purpose: a kind, a role or a verdict arriving as some other
 * string is the ordinary case this call exists to catch, and typing it as the real value up front
 * would only be asserting what has not been established. The draft becomes the real shape by
 * passing the item-list check, which is what earns the narrowing.
 */
interface PlannedItemDraftV1 {
  itemKind: string;
  originalSliceRef: PromptEnhancementSequenceOffsetRangeV1 | null;
  sourcePointRanges: readonly PromptEnhancementSequenceOffsetRangeV1[];
  roleLabel: string | null;
  dependencyOrder: number;
  complexity: string | null;
  complexityReason: string | null;
  /** Never written here. Carried so a reply that words an item is refused, not silently stripped. */
  generatedWording: string | null;
  /**
   * The three safety fields are DERIVED from the item's own slice, never asked of the model. The
   * ruling that created them was chosen on "no new classifier"; asking would be exactly that, and
   * would be a second opinion on a question the shipping machinery already answers.
   */
  actionRiskKinds: readonly PromptEnhancementSensitiveActionRiskKind[];
  authorityMode: PromptEnhancementAuthorityMode | null;
  requiresConfirmationFloor: boolean;
  decompositionGroupId: string | null;
  /** The verdict is produced when the wording is, and there is none yet. */
  itemValidationGraph: null;
}

/**
 * What the planner returns.
 *
 * The point inventory and the grouping are NOT here. Both are working state: they exist so the
 * slicing has something to be checked against, they are checked on the way through, and they die
 * with the call. What survives of the grouping is one id per item — enough to rebuild the grouping
 * the planner actually decided, which a served item alone cannot do.
 */
export interface PromptEnhancementSequencePlannerOutputV1 {
  outcome: PromptEnhancementSequencePlannerOutcomeV1;
  outcomeReason: PromptEnhancementSequencePlannerOutcomeReasonV1 | null;
  items: readonly PromptEnhancementSequenceItemV1[];
  /** Whole-prompt instructions, as offsets — one copy per sequence, applied to every item. */
  promptDirectives: readonly PromptEnhancementSequenceOffsetRangeV1[];
  originalLength: number;
  /**
   * Whether text exists ahead of the user accepting anything. Only a planned sequence has any, so
   * only a sequence moves off the default — declaring otherwise on a list with no items would claim
   * a state the row is not in.
   */
  suggestedNextPromptPolicy: PromptEnhancementSequenceNextPromptPolicyV1;
  /**
   * Counts and role labels; the line itself is worded elsewhere.
   *
   * NULL on both single-prompt outcomes. The first-popup summary belongs to a sequence and there is
   * no sequence, so there is no summary to render — and a renderer told to render what the payload
   * gives it would otherwise announce a plan of no prompts on a prompt deliberately kept as one.
   */
  summaryData: PromptEnhancementSequencePlannerSummaryDataV1 | null;
}

export type PromptEnhancementSequencePlannerFailureReasonV1 =
  | 'no_key'
  | 'provider_error'
  | 'timeout'
  | 'invalid_output'
  | 'context_does_not_index_original'
  | 'planner_deadline_exceeded'
  | PromptEnhancementSequencePlannerRefusalV1
  | PromptEnhancementSequencePlannerCheckCodeV1
  | PromptEnhancementSequencePayloadReasonCodeV1;

export type PromptEnhancementSequencePlannerResultV1 =
  | { ok: true; output: PromptEnhancementSequencePlannerOutputV1 }
  | { ok: false; reason: PromptEnhancementSequencePlannerFailureReasonV1 };

/**
 * One attempt's result. The failing item's index rides along INTERNALLY so the repair can name it;
 * it is not on the public result, where nothing needs it and it would only invite a caller to try
 * fixing the item itself.
 */
type PlannerAttemptV1 =
  | { ok: true; output: PromptEnhancementSequencePlannerOutputV1 }
  | {
      ok: false;
      reason: PromptEnhancementSequencePlannerFailureReasonV1;
      itemIndex?: number;
      // PROPER FIX — the deterministic rebuild of THIS plan, carried alongside its failure so the loop
      // can fall back to it once model repair is spent, without spending another call to get it. Present
      // only when the plan had a usable decomposition (two or more tasks) and the rebuild validated;
      // the loop ignores it unless the caller opted into the fallback.
      repair?: PromptEnhancementSequencePlannerOutputV1;
    };

/**
 * How many times a plan that came back wrong may be sent back for repair.
 *
 * The SHIPPING constant, not a second one holding the same number: one rule covers malformed output
 * and safety-validation failure across this feature, the composer already implements it from here,
 * and the cost worksheet checks each call's recorded retry count against this name. A local copy
 * would agree with it right up until the locked number moved, and then the worksheet would be
 * checking the planner against a value the planner no longer uses.
 *
 * Repairs only. A provider that failed or timed out is not retried here at all — that is a
 * different failure with a different answer, and retrying it would stack its whole wait again in
 * front of a user who is already waiting.
 */
export { PROMPT_ENHANCEMENT_COST_VALIDATION_RETRY_COUNT_V1 } from './cost-observability.js';

/** The failures that are the call's, not the plan's. Never repaired: there is nothing to repair. */
function isProviderFailure(reason: PromptEnhancementSequencePlannerFailureReasonV1): boolean {
  return reason === 'provider_error' || reason === 'timeout' || reason === 'no_key';
}

/**
 * The deterministic route, as much of it as the planner has any use for.
 *
 * FOUR fields, not the whole route result. The result also carries evidence refs and reason codes,
 * which are this system's own record of how it decided — internal, and with no business crossing to
 * a provider. What is left is what the planner can actually reason with: what kind of work this is,
 * and how sure the routing was.
 *
 * It is context, never authority. Nothing here decides whether an item exists — that needs a
 * decision about the item, and a family is a fact about the request.
 */
export interface PromptEnhancementSequencePlannerRouteV1 {
  familyId: PromptEnhancementFamilyId;
  primaryIntent: PromptEnhancementPrimaryIntent;
  capabilityOverlays: readonly PromptEnhancementCapabilityId[];
  routeConfidence: PromptEnhancementRouteConfidence;
}

/** The route, as the labelled block the planner is given, or nothing when there is no route. */
function buildPlannerUserMessageV1(
  promptContext: string,
  route: PromptEnhancementSequencePlannerRouteV1 | undefined,
): string {
  if (route === undefined) return promptContext;
  return [
    'ROUTE — what the deterministic routing made of this request. Context, not instruction:',
    `  family:       ${route.familyId}`,
    `  intent:       ${route.primaryIntent}`,
    `  capabilities: ${route.capabilityOverlays.join(', ') || 'none'}`,
    `  confidence:   ${route.routeConfidence}`,
    '',
    'THE REQUEST:',
    promptContext,
  ].join('\n');
}

export interface PromptEnhancementSequencePlannerInputV1 {
  /**
   * What the planner is allowed to SEE, and the only value that reaches the provider.
   *
   * It must be a text the returned positions index — the original with its sensitive spans redacted
   * in place, which is length-preserving and therefore addresses the same characters. A context
   * assembled some other way is refused rather than read, because offsets chosen against one text
   * and resolved against another land in range and mean something else.
   */
  promptContext: string;
  /**
   * The LOCAL original the returned positions address, and the text slices are cut from.
   *
   * NEVER sent. It exists here because the returned offsets are meaningless without the string
   * they index, and because the safety fields are read off the slice rather than off the reply —
   * which is also why a redaction marker can never travel into wording shown under a promise that
   * the user's own words appear exactly.
   */
  localOriginalText: string;
  /**
   * Whether this prompt may be planned at all. Required rather than optional: every condition on it
   * is a refusal, and an entry check that can be omitted is one that will be.
   *
   * The config gate is not on it. That value has one legitimate source and the planner reads it
   * from there itself.
   */
  entry: PromptEnhancementSequencePlannerEntryRequestV1;
  /** Where the config gate is resolved from. */
  db: Database;
  /** Scopes that resolution: a project's own setting overrules the global one. */
  projectRoot?: string;
  /** What the deterministic routing made of this request. Absent when it produced none. */
  route?: PromptEnhancementSequencePlannerRouteV1;
  /**
   * When the work this call is part of has to be finished, as epoch milliseconds.
   *
   * The repair bound counts attempts, not seconds, and four sequential calls at this call's own
   * timeout are longer than the hook that carries them is allowed to live. Past that point the
   * process is killed mid-loop: no typed refusal, no disposition, no popup — everything built to
   * make each failure answerable is skipped, because there is nothing left to answer with.
   *
   * So the deadline is a ceiling on wall-clock and never on repairs; the bound of three is
   * unchanged and is still a maximum rather than a quota to spend. Absent means no ceiling, which
   * is the behaviour without it.
   *
   * The value is the CALLER'S, because the caller is what knows which hook this is running on, and
   * this call's own timeout is deliberately not pinned to a guessed number.
   */
  deadlineAtMs?: number;
  /** How the deadline is read. Present so the check is testable without waiting for real time. */
  nowMs?: () => number;
  /**
   * PROPER FIX — enables the deterministic sequence fallback on the FINAL attempt: a plan the model
   * could not make valid is rebuilt from its own task decomposition rather than rejected, so
   * `items_json` is never empty and the second popup is never lost. Off by default, which is the exact
   * behaviour without it — the model-repair loop rejects an unfixable plan and the single-prompt path
   * takes over. The production caller (the hook, via the facade) turns it on; direct callers that want
   * the strict reject contract leave it off.
   */
  deterministicFallback?: boolean;
}

/**
 * Is there room to start another call before the deadline?
 *
 * Measured against this call's full timeout rather than its expected duration: a call that starts
 * with less time left than it is allowed to take is one that can be killed halfway, and a killed
 * call returns nothing at all.
 */
function hasRoomForAnotherCall(input: PromptEnhancementSequencePlannerInputV1): boolean {
  if (input.deadlineAtMs === undefined) return true;
  const now = (input.nowMs ?? Date.now)();
  return now + PROMPT_ENHANCEMENT_SEQUENCE_PLANNER_TIMEOUT_MS_V1 <= input.deadlineAtMs;
}

/**
 * Classify a thrown provider error. The SDK raises a named timeout error on the per-call option;
 * match the name first so an injected non-SDK client behaves the same way.
 */
function plannerErrorReason(error: unknown): 'timeout' | 'provider_error' {
  const name = (error as { name?: unknown } | null)?.name;
  if (typeof name === 'string' && /timeout/i.test(name)) return 'timeout';
  return /timed?\s?out/i.test(String(error)) ? 'timeout' : 'provider_error';
}

function asRangeList(value: unknown): readonly PromptEnhancementSequenceOffsetRangeV1[] | null {
  if (!Array.isArray(value)) return null;
  const ranges: PromptEnhancementSequenceOffsetRangeV1[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null;
    const range = entry as Record<string, unknown>;
    if (typeof range['start'] !== 'number' || typeof range['end'] !== 'number') return null;
    ranges.push({ start: range['start'], end: range['end'] });
  }
  return ranges;
}

/**
 * The point inventory, shape-only.
 *
 * Checked entry by entry rather than cast, for the same reason the items are: `json_object` mode
 * guarantees the reply is JSON, never that it holds the shape asked for, and a `null` where an
 * entry was dropped is an ordinary way for a partial generation to come back. Cast instead, it
 * reaches a check that reads a field off it and throws — past every typed refusal a caller is
 * written against.
 */
function asPointList(value: unknown): readonly PromptEnhancementSequencePlannerPointV1[] | null {
  if (!Array.isArray(value)) return null;
  const points: PromptEnhancementSequencePlannerPointV1[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null;
    const point = entry as Record<string, unknown>;
    // The id is a DISCARDED internal correlation key (points↔groups set-arithmetic); its string-vs-number
    // form is a format detail, not meaning. Stronger models emit numeric ids, so coerce number→string
    // rather than reject a coherent plan on the key's type. Not a semantic relaxation — the matching still
    // holds because points and groups are coerced identically.
    const pointId = coercePlannerId(point['pointId']);
    if (pointId === null
      || typeof point['startOffset'] !== 'number'
      || typeof point['endOffset'] !== 'number'
      // Shape only: that the kind is one of the six is meaning, and is checked with the rest of it.
      || typeof point['requiredKind'] !== 'string') {
      return null;
    }
    points.push({
      pointId,
      startOffset: point['startOffset'],
      endOffset: point['endOffset'],
      requiredKind: point['requiredKind'] as PromptEnhancementSequencePointKindV1,
    });
  }
  return points;
}

/** The grouping, shape-only. Same reasoning as the inventory above. */
function asGroupList(value: unknown): readonly PromptEnhancementSequencePlannerGroupV1[] | null {
  if (!Array.isArray(value)) return null;
  const groups: PromptEnhancementSequencePlannerGroupV1[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null;
    const group = entry as Record<string, unknown>;
    // Same id coercion as the point inventory — the id is a discarded correlation key; coerce
    // number→string so a coherent plan is not rejected on the key's form (see asPointList).
    const groupId = coercePlannerId(group['groupId']);
    if (!Array.isArray(group['pointIds'])) return null;
    const pointIds: string[] = [];
    for (const rawId of group['pointIds'] as unknown[]) {
      const coerced = coercePlannerId(rawId);
      if (coerced === null) return null;
      pointIds.push(coerced);
    }
    if (groupId === null
      // Required rather than defaulted: a group that stays in the body is a decision, and reading
      // its absence as "becomes an item" would take that decision on the planner's behalf.
      || typeof group['canRemainOneBodySection'] !== 'boolean') {
      return null;
    }
    groups.push({
      groupId,
      pointIds,
      canRemainOneBodySection: group['canRemainOneBodySection'],
    });
  }
  return groups;
}

/**
 * Coerce a planner correlation id (point/group) to a string. The ids are internal working state,
 * discarded after the set-arithmetic checks, so their string-vs-number form carries no meaning —
 * only that points and groups agree, which holds under an identical coercion on both. Returns null
 * for anything that is neither a string nor a finite number (the only forms an id can honestly take).
 */
function coercePlannerId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asRange(value: unknown): PromptEnhancementSequenceOffsetRangeV1 | null | 'invalid' {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return 'invalid';
  const range = value as Record<string, unknown>;
  if (typeof range['start'] !== 'number' || typeof range['end'] !== 'number') return 'invalid';
  return { start: range['start'], end: range['end'] };
}

/**
 * A reply as it arrives: shape-parsed only.
 *
 * Held separately from the output because the working state is on it and is not on the output, and
 * because its items are drafts — everything about their meaning is still unchecked at this point.
 */
interface ParsedPlannerReplyV1 {
  outcome: PromptEnhancementSequencePlannerOutcomeV1;
  outcomeReason: PromptEnhancementSequencePlannerOutcomeReasonV1 | null;
  points: readonly PromptEnhancementSequencePlannerPointV1[];
  groups: readonly PromptEnhancementSequencePlannerGroupV1[];
  items: readonly PlannedItemDraftV1[];
  promptDirectives: readonly PromptEnhancementSequenceOffsetRangeV1[];
  summaryId: string;
  remainingTaskCount: number;
}

/** Shape-parse a reply. Meaning is checked by the callers of the check helpers, not here. */
function parsePlannerReply(raw: string): ParsedPlannerReplyV1 | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const reply = parsed as Record<string, unknown>;

  const promptDirectives = asRangeList(reply['promptDirectives'] ?? []);
  if (promptDirectives === null) return null;
  const points = asPointList(reply['points']);
  const groups = asGroupList(reply['groups']);
  if (points === null || groups === null || !Array.isArray(reply['items'])) return null;

  const items: PlannedItemDraftV1[] = [];
  for (const entry of reply['items'] as unknown[]) {
    if (typeof entry !== 'object' || entry === null) return null;
    const item = entry as Record<string, unknown>;
    const sliceRef = asRange(item['originalSliceRef']);
    if (sliceRef === 'invalid') return null;
    const pointRanges = asRangeList(item['sourcePointRanges'] ?? []);
    if (pointRanges === null) return null;
    if (typeof item['itemKind'] !== 'string' || typeof item['dependencyOrder'] !== 'number') return null;
    items.push({
      itemKind: item['itemKind'],
      originalSliceRef: sliceRef,
      sourcePointRanges: pointRanges,
      roleLabel: typeof item['roleLabel'] === 'string' ? item['roleLabel'] : null,
      dependencyOrder: item['dependencyOrder'],
      complexity: typeof item['complexity'] === 'string' ? item['complexity'] : null,
      complexityReason: typeof item['complexityReason'] === 'string' ? item['complexityReason'] : null,
      // Carried through as it arrived, so wording the planner was told not to write is REFUSED
      // rather than dropped here: dropping it would let a plan that broke the rule look like one
      // that kept it.
      generatedWording: typeof item['generatedWording'] === 'string' ? item['generatedWording'] : null,
      // Placeholders: whatever the reply says about safety is discarded and re-derived below.
      actionRiskKinds: [],
      authorityMode: null,
      requiresConfirmationFloor: false,
      decompositionGroupId: typeof item['decompositionGroupId'] === 'string'
        ? item['decompositionGroupId']
        : null,
      itemValidationGraph: null,
    });
  }

  // No `taskRoleLabels` here. They are the set of the labels the items already carry, so they are
  // read off the list rather than asked for — asked for, they are a second answer to a question the
  // list has already answered, and free to disagree with it.
  const summary = reply['summaryData'];
  if (typeof summary !== 'object' || summary === null) return null;
  const summaryData = summary as Record<string, unknown>;
  if (typeof summaryData['summaryId'] !== 'string'
    || typeof summaryData['remainingTaskCount'] !== 'number') {
    return null;
  }

  return {
    outcome: reply['outcome'] as PromptEnhancementSequencePlannerOutcomeV1,
    outcomeReason: (reply['outcomeReason'] ?? null) as PromptEnhancementSequencePlannerOutcomeReasonV1 | null,
    points,
    groups,
    items,
    promptDirectives,
    summaryId: summaryData['summaryId'],
    remainingTaskCount: summaryData['remainingTaskCount'],
  };
}

/**
 * Read the three safety fields off the item's own slice.
 *
 * Not from the reply, and not by a second classifier: the ruling that created these fields was
 * taken on the basis that they come from machinery that already ships, so asking the model would
 * be the new classifier that ruling avoided — and a second opinion that can disagree with the one
 * the user is actually shown.
 *
 * The risk families are a SET, matching what the classifier produces and what the confirmation
 * sentence already names. An item that cannot be split can genuinely carry several, and a single
 * value would drop the rest without recording that it had.
 *
 * The floor carries the RISKY half only. Whether the work is also irreversible is judged later,
 * from the item's content, by whatever writes its wording — never from a table over these families,
 * which would be a keyword list wearing an enum.
 */
function deriveItemSafetyFields(sliceText: string | null): {
  actionRiskKinds: readonly PromptEnhancementSensitiveActionRiskKind[];
  authorityMode: PromptEnhancementAuthorityMode | null;
  requiresConfirmationFloor: boolean;
} {
  // The kinds that carry no slice carry no authority of their own to exceed, and no floor.
  if (sliceText === null) {
    return { actionRiskKinds: [], authorityMode: null, requiresConfirmationFloor: false };
  }
  const actionRiskKinds = promptEnhancementRiskKindsForTextV1(sliceText);
  return {
    actionRiskKinds,
    authorityMode: promptEnhancementAuthorityModeForTextV1(sliceText),
    requiresConfirmationFloor: actionRiskKinds.length > 0,
  };
}

/**
 * Cut the slice this item points at, or null when it points at none.
 *
 * An offset that does not address the original also yields null. The item-list check rejects such a
 * plan a moment later, so this is the answer for the moment in between — and it is the fail-closed
 * one rather than a slice of whatever happened to be at those positions.
 */
function sliceTextFor(
  ref: PromptEnhancementSequenceOffsetRangeV1 | null,
  localOriginalText: string,
): string | null {
  if (!isPromptEnhancementSequenceOffsetRangeV1(ref, localOriginalText.length)) return null;
  return localOriginalText.slice(ref.start, ref.end);
}

/**
 * PROPER FIX — the deterministic sequence repair.
 *
 * When the model's plan is structurally invalid — for ANY reason: an out-of-vocabulary role label, a
 * complexity its confirmations do not match, a missing group id, a miscounted recap, a count out of
 * bounds — rejecting it empties `items_json` and the second popup never appears. That is the whole bug.
 * Rather than reject, this rebuilds a VALID minimal sequence from the one thing the model reliably
 * produces: the task DECOMPOSITION — how many tasks, and roughly where each sits in the prompt. Every
 * field the model got wrong is DISCARDED and set to a spec-valid minimal value: each task `not_complex`
 * (which earns no confirmation — the one rule that would otherwise need a verdict guessed), a role label
 * derived from the task's own slice via the shared families matcher (null when the slice matches no
 * family), a unique group id per task, and the single mandated recap when the count calls for one. It is
 * deterministic — no model call — so it cannot fail the way the model did.
 *
 * Returns null when there are fewer than two tasks (a single-prompt request — forcing a sequence would
 * be the opposite mistake) or, defensively, when the rebuilt list still does not validate (the caller
 * then keeps the model's original failure). Tasks are capped one below the locked maximum so the
 * store's payload validator — which the list check does not mirror — accepts the row with its recap.
 */
function buildDeterministicSequenceRepairV1(
  parsedItems: readonly PlannedItemDraftV1[],
  originalLength: number,
  localOriginalText: string,
): readonly PromptEnhancementSequenceItemV1[] | null {
  if (originalLength <= 0) return null;
  const clamp = (
    range: PromptEnhancementSequenceOffsetRangeV1 | null,
  ): PromptEnhancementSequenceOffsetRangeV1 => {
    if (!range || typeof range.start !== 'number' || typeof range.end !== 'number') {
      return { start: 0, end: originalLength };
    }
    const start = Math.max(0, Math.min(Math.trunc(range.start), originalLength - 1));
    const end = Math.max(start + 1, Math.min(Math.trunc(range.end), originalLength));
    return { start, end };
  };
  const taskSources = parsedItems
    .filter((item) => item.itemKind === 'first_task' || item.itemKind === 'task')
    .slice(0, PROMPT_ENHANCEMENT_SEQUENCE_MAX_ITEM_COUNT_V1 - 1);
  if (taskSources.length < 2) return null;
  const items: PlannedItemDraftV1[] = taskSources.map((source, index) => {
    const originalSliceRef = index === 0
      ? { start: 0, end: originalLength }
      : clamp(source.originalSliceRef);
    return {
      itemKind: index === 0 ? 'first_task' : 'task',
      originalSliceRef,
      sourcePointRanges: [],
      // Phase 3a: label the rebuilt task off its OWN slice using the shared families matcher, so the
      // first popup's Types line is populated even on this deterministic-fallback path (null when the
      // slice matches no family). The wrap_up recap below stays null — a non-task recap carries none.
      roleLabel: promptEnhancementSequenceRoleLabelForTextV1(sliceTextFor(originalSliceRef, localOriginalText) ?? ''),
      dependencyOrder: index,
      complexity: 'not_complex',
      complexityReason: null,
      generatedWording: null,
      actionRiskKinds: [],
      authorityMode: null,
      requiresConfirmationFloor: false,
      decompositionGroupId: `repair-group-${index}`,
      itemValidationGraph: null,
    };
  });
  // Same count rule the store enforces: a recap is earned iff more than three items sit behind it. Its
  // dependencyOrder is its index (the last slot); it carries the all-null shape a non-task recap must.
  if (items.length > 3) {
    items.push({
      itemKind: 'wrap_up',
      originalSliceRef: null,
      sourcePointRanges: [],
      roleLabel: null,
      dependencyOrder: items.length,
      complexity: null,
      complexityReason: null,
      generatedWording: null,
      actionRiskKinds: [],
      authorityMode: null,
      requiresConfirmationFloor: false,
      decompositionGroupId: null,
      itemValidationGraph: null,
    });
  }
  const drafts = items.map((item) => ({
    ...item,
    ...deriveItemSafetyFields(sliceTextFor(item.originalSliceRef, localOriginalText)),
  }));
  const structure = validatePromptEnhancementSequenceItemListV1(drafts, {
    originalLength,
    stage: 'plan',
  });
  return structure.ok
    ? (drafts as unknown as readonly PromptEnhancementSequenceItemV1[])
    : null;
}

/**
 * One planning attempt: ask, parse, and check.
 *
 * `repairInstruction` is what a previous attempt's rejection said, sent as a further message. On the
 * first attempt there is none.
 */
async function attemptPlan(
  openai: PromptEnhancementSequencePlannerClientV1,
  input: PromptEnhancementSequencePlannerInputV1,
  repairInstruction: string | undefined,
): Promise<PlannerAttemptV1> {
  let raw: string | null | undefined;
  try {
    const response = await openai.chat.completions.create(
      {
        model: PROMPT_ENHANCEMENT_SEQUENCE_PLANNER_MODEL_V1,
        // The planner's own budget: the reasons per item are what cost the tokens and they are
        // exactly what must not be dropped to fit.
        //
        // A repair asks at the HARD cap, which is sized against the locked 30-item maximum. One
        // reason a plan comes back unusable is that it did not fit — a long sequence is a reason
        // per item plus a reason per confirmation, and that is the prose in an output otherwise
        // made of enums and integers. Repairing such a plan at the same budget truncates it in the
        // same place three more times, on the request that most needed a sequence.
        //
        // No truncation detection, because there is nothing to detect for: max_tokens is a ceiling
        // and not a spend, so a repair of a small plan is still billed as a small plan. What the
        // hard cap buys is that "cannot fit even at the hard cap" becomes a state reachable at all,
        // which is what the fail-closed outcome is defined against.
        max_tokens: repairInstruction === undefined
          ? PROMPT_ENHANCEMENT_SEQUENCE_PLANNER_OUTPUT_TOKEN_CAP_V1
          : PROMPT_ENHANCEMENT_SEQUENCE_PLANNER_OUTPUT_TOKEN_HARD_CAP_V1,
        messages: [
          { role: 'system', content: buildPromptEnhancementSequencePlannerSystemPromptV1() },
          { role: 'user', content: buildPlannerUserMessageV1(input.promptContext, input.route) },
          // The request stays first and unchanged across repairs: what failed is a correction to
          // apply to the plan, never a change to what was asked for.
          ...(repairInstruction === undefined
            ? []
            : [{ role: 'user' as const, content: repairInstruction }]),
        ],
        response_format: { type: 'json_object' },
      },
      // maxRetries: 0 — the SDK's own retries would multiply any wait in front of the user.
      { timeout: PROMPT_ENHANCEMENT_SEQUENCE_PLANNER_TIMEOUT_MS_V1, maxRetries: 0 },
    );
    raw = response.choices?.[0]?.message?.content;
  } catch (error) {
    return { ok: false, reason: plannerErrorReason(error) };
  }

  if (typeof raw !== 'string' || raw.trim().length === 0) return { ok: false, reason: 'invalid_output' };
  const parsed = parsePlannerReply(raw);
  if (!parsed) return { ok: false, reason: 'invalid_output' };

  const outcome = checkPromptEnhancementSequencePlannerOutcomeV1(parsed.outcome, parsed.outcomeReason);
  if (!outcome.ok) return { ok: false, reason: outcome.code };

  const originalLength = input.localOriginalText.length;

  // Two of the three outcomes are decisions NOT to make a sequence, and they are ordinary answers
  // rather than failures. Nothing below applies to them: there is no list to bound, no grouping
  // that has to have done anything, and no summary, since a popup with no sequence shows none.
  if (parsed.outcome !== 'sequence') {
    return {
      ok: true,
      output: {
        outcome: parsed.outcome,
        outcomeReason: parsed.outcomeReason,
        items: [],
        promptDirectives: [],
        originalLength,
        suggestedNextPromptPolicy: promptEnhancementSequencePolicyForOutcomeV1(parsed.outcome),
        summaryData: null,
      },
    };
  }

  // PROPER FIX — the deterministic fallback, prepared once from the model's task decomposition. Any
  // structural failure below (grouping, bounds, list structure, directives) returns via `failWith`,
  // which carries this rebuilt minimal plan alongside the failure so the loop can fall back to it once
  // model repair is spent — when one is available (two or more tasks). Additive: a plan that PASSES
  // every check below is built unchanged through the same `buildOutput` tail.
  const repairItems = buildDeterministicSequenceRepairV1(
    parsed.items,
    originalLength,
    input.localOriginalText,
  );
  const buildOutput = (
    items: readonly PromptEnhancementSequenceItemV1[],
    promptDirectives: readonly PromptEnhancementSequenceOffsetRangeV1[],
  ): PromptEnhancementSequencePlannerOutputV1 => ({
    outcome: parsed.outcome,
    outcomeReason: parsed.outcomeReason,
    items,
    promptDirectives,
    originalLength,
    suggestedNextPromptPolicy: promptEnhancementSequencePolicyForOutcomeV1(parsed.outcome),
    summaryData: {
      summaryId: parsed.summaryId,
      remainingTaskCount: items.length - 1,
      taskRoleLabels: promptEnhancementSequenceTaskRoleLabelsV1(items),
    },
  });
  // The deterministic rebuild travels WITH every structural failure below, so the loop can fall back
  // to it once model repair is spent — no extra call to produce it, and the plan's own defect still
  // rides along for the callers (and tests) that want the strict reject contract.
  const repairOutput = repairItems ? buildOutput(repairItems, []) : undefined;
  const failWith = (
    reason: PromptEnhancementSequencePlannerFailureReasonV1,
    itemIndex?: number,
  ): PlannerAttemptV1 => ({ ok: false, reason, itemIndex, repair: repairOutput });

  // The working state is checked here and travels no further: it is not on the output, so whoever
  // consumes the plan gets items and not the inventory they were derived from.
  const grouping = checkPromptEnhancementSequencePlannerGroupingV1(
    parsed.points,
    parsed.groups,
    parsed.items.map((item) => item.decompositionGroupId),
  );
  // Phase 2 (owner ruling 2026-08-15 — "grouping not respected is OK, but the sequence MUST generate";
  // §5.5b record-not-block): two grouping outcomes are quality, not integrity, and must not block a
  // coherent plan from producing items. `grouping_stage_did_nothing` (one group per point → more
  // prompts than ideal) and `point_in_no_group` (a working-state point that landed in no group —
  // points travel no further than this check, so nothing downstream consumes it) are RECORDED, not
  // failed. Every other grouping code is genuine malformed output (duplicate/unknown/overlapping ids,
  // a stray item→group reference) and still fails hard.
  const groupingSoftCodesV1 = new Set(['grouping_stage_did_nothing', 'point_in_no_group']);
  if (!grouping.ok && !groupingSoftCodesV1.has(grouping.code)) {
    return failWith(grouping.code);
  }

  // Phase 1 (§5.5a — normalize a MANDATED literal, not infer meaning): the first item IS the whole
  // original by spec (§22.3(C)), and the summary's remaining count IS items-after-the-first. Both are
  // dictated by the spec — "who chose the string" is us — so a model that got the boundary/count wrong
  // is CORRECTED here rather than rejected. This is verification, not the forbidden proxy, and it is
  // strictly better than shipping a truncated first prompt (`first_task_slice_not_whole_original`) or a
  // mismatched count (`summary_remaining_count_disagrees_with_items`).
  //
  // Phase 1b (§5.5a — normalize an out-of-bounds STRUCTURAL offset, not infer meaning): a model cannot
  // count characters reliably, so it emits originalSliceRef / sourcePointRanges offsets that fall OUTSIDE
  // the prompt (`offset_range_out_of_bounds` / `source_point_ranges_invalid`). An out-of-bounds offset is
  // a wrong POSITION, not wrong meaning — and the item's body is worded separately by the batch, so a
  // slice is only a rough pointer. CLAMP each offset into the valid [0, originalLength] window (dropping a
  // source-range entry that is not even a numeric range) so a coherent plan is ACCEPTED rather than
  // rejected. Nothing here infers meaning: it only forces a position back into the string it must index.
  const clampOffsetRangeV1 = (range: unknown): { start: number; end: number } | null => {
    if (originalLength <= 0 || !range || typeof range !== 'object') return null;
    const r = range as { start?: unknown; end?: unknown };
    if (typeof r.start !== 'number' || typeof r.end !== 'number') return null;
    const start = Math.max(0, Math.min(Math.trunc(r.start), originalLength - 1));
    const end = Math.max(start + 1, Math.min(Math.trunc(r.end), originalLength));
    return { start, end };
  };
  const normalizedItems = parsed.items.map((item) => {
    const originalSliceRef = item.itemKind === 'first_task'
      ? { start: 0, end: originalLength }
      : item.originalSliceRef && typeof item.originalSliceRef === 'object'
        ? (clampOffsetRangeV1(item.originalSliceRef) ?? item.originalSliceRef)
        : item.originalSliceRef;
    const sourcePointRanges = Array.isArray(item.sourcePointRanges)
      ? item.sourcePointRanges
          .map((entry) => clampOffsetRangeV1(entry))
          .filter((entry): entry is { start: number; end: number } => entry !== null)
      : item.sourcePointRanges;
    return { ...item, originalSliceRef, sourcePointRanges };
  });
  // Phase 1c (§5.5a — normalize a MANDATED structural COUNT, not infer meaning): the closing recap's
  // PRESENCE is dictated purely by the item count (§22 spec: a recap exists IFF more than three non-recap
  // items sit behind it) — never by the model's judgment. A model that miscounted — omitted the mandated
  // recap, or added one the count forbids — is CORRECTED here, exactly as an out-of-bounds offset is
  // clamped above: append the one required recap, or drop a forbidden one. This is verification of a
  // spec literal, not the forbidden proxy, and it is strictly better than rejecting a coherent plan on
  // `wrap_up_presence_does_not_match_count`. Cascade-free: a recap is the LAST item, carries no
  // confirmations and null slice/complexity/reason, so nothing before it is disturbed and no
  // task→confirmation pair is split; its wording is null at plan (the batch words it, as with every
  // item), and the store re-validates the whole list on write as a backstop. Only the two clean cases
  // are touched — append-when-last-missing, drop-when-last-present — so an already-correct plan is left
  // byte-identical, and a malformed mid-list or duplicated recap is left to fail exactly as before.
  const nonRecapCount = normalizedItems.filter((item) => item.itemKind !== 'wrap_up').length;
  const wrapUpCount = normalizedItems.length - nonRecapCount;
  const lastIsWrapUp = normalizedItems.length > 0
    && normalizedItems[normalizedItems.length - 1].itemKind === 'wrap_up';
  const recapConformedItems: PlannedItemDraftV1[] =
    nonRecapCount > 3 && wrapUpCount === 0
      ? [
          ...normalizedItems,
          {
            itemKind: 'wrap_up',
            originalSliceRef: null,
            sourcePointRanges: [],
            roleLabel: null,
            // Must equal the item's index (the store's `dependency_order_not_index` rule); the recap
            // is appended last, so its index IS the pre-append length. Every prior item keeps its own
            // 0..n-1 order untouched, so no reindex is needed.
            dependencyOrder: normalizedItems.length,
            complexity: null,
            complexityReason: null,
            generatedWording: null,
            actionRiskKinds: [],
            authorityMode: null,
            requiresConfirmationFloor: false,
            decompositionGroupId: null,
            itemValidationGraph: null,
          },
        ]
      : nonRecapCount <= 3 && wrapUpCount === 1 && lastIsWrapUp
        ? normalizedItems.slice(0, -1)
        : normalizedItems;
  const normalizedRemainingTaskCount = recapConformedItems.length - 1;

  const bounds = checkPromptEnhancementSequencePlannerBoundsV1({
    itemCount: recapConformedItems.length,
    summaryRemainingTaskCount: normalizedRemainingTaskCount,
  });
  if (!bounds.ok) return failWith(bounds.code);

  // Safety is read off the slices before the list is checked, because the list check reads those
  // fields: an item's authority has to be on it by the time the rule that an item with a slice
  // carries one is applied to it.
  const drafts = recapConformedItems.map((item) => ({
    ...item,
    ...deriveItemSafetyFields(sliceTextFor(item.originalSliceRef, input.localOriginalText)),
  }));

  // Every rule about the list itself — the six kinds, the closed role vocabulary, position, the
  // offsets, the recap, and the confirmations each verdict earns. It is the same check the store
  // applies, at the stage before wording exists, so a plan cannot pass here and fail there.
  const structure = validatePromptEnhancementSequenceItemListV1(drafts, {
    originalLength,
    stage: 'plan',
  });
  if (!structure.ok) {
    return failWith(structure.reasonCode, structure.itemIndex);
  }
  // Phase 1b (§5.5a): whole-prompt directives are the SAME kind of offset range as the item slices, and
  // the model gets them out of bounds the same way. Clamp them into the valid [0, originalLength] window
  // too — a directive that runs past the prompt must not reject the whole sequence
  // (`prompt_directives_invalid`). Same rationale as the item slices above; the check below is kept as a
  // defensive net and passes after clamping.
  const normalizedPromptDirectives = Array.isArray(parsed.promptDirectives)
    ? parsed.promptDirectives
        .map((range) => clampOffsetRangeV1(range))
        .filter((range): range is { start: number; end: number } => range !== null)
    : parsed.promptDirectives;
  if (normalizedPromptDirectives.some(
    (range) => !isPromptEnhancementSequenceOffsetRangeV1(range, originalLength),
  )) {
    return failWith('prompt_directives_invalid');
  }

  // The check above established every field, which is what the narrowing rests on. The valid model
  // plan is built through the SAME tail the fallback uses — `remainingTaskCount` is items-after-the-
  // first either way, so a passing plan's output is unchanged.
  const items = drafts as unknown as readonly PromptEnhancementSequenceItemV1[];
  return { ok: true, output: buildOutput(items, normalizedPromptDirectives) };
}

/**
 * Run the planner.
 *
 * One call, then up to three repairs of a plan that came back wrong. A provider failure is not
 * among the things repaired: nothing arrived to correct, and asking again would stack the whole
 * wait a second time in front of a user who is already waiting for it.
 *
 * Repair happens BEFORE the user accepts anything. Once a sequence is active an item is never
 * regenerated — the two rules read as contradictory only if the moment each applies to is dropped.
 */
export async function runPromptEnhancementSequencePlannerV1(
  input: PromptEnhancementSequencePlannerInputV1,
  client?: PromptEnhancementSequencePlannerClientV1,
): Promise<PromptEnhancementSequencePlannerResultV1> {
  // Before anything is spent. Every one of these is a refusal, and the config gate in particular is
  // silent by contract — an off gate produces no plan and no explanation of why.
  const entry = promptEnhancementSequencePlannerMayRunForProjectV1(
    input.db,
    input.projectRoot,
    input.entry,
  );
  if (!entry.mayRun) return { ok: false, reason: entry.refusal };

  // The positions that come back index the LOCAL original, and they are chosen by reading the
  // context. So the context has to be a text those positions mean the same thing in, and the
  // redaction that stands between the two preserves length precisely so that it is: a marker is
  // padded to the width of what it replaced, character for character.
  //
  // Equal length is the necessary condition, not a proof of alignment — two different texts can be
  // the same length. What it does catch is the case that actually breaks this: a context assembled
  // from excerpts and refs rather than redacted in place. There, position 20 of what was read is
  // not position 20 of the original, every returned offset lands in range, and the item carries a
  // verbatim slice of words nobody chose. Refusing here costs a call; not refusing costs the one
  // guarantee the offsets exist to give.
  if (input.promptContext.length !== input.localOriginalText.length) {
    return { ok: false, reason: 'context_does_not_index_original' };
  }

  let openai: PromptEnhancementSequencePlannerClientV1;
  try {
    // With no injected client and no key this throws, which is a call that never happened.
    openai = client ?? (newNexpathOpenAIClient() as unknown as PromptEnhancementSequencePlannerClientV1);
  } catch {
    return { ok: false, reason: 'no_key' };
  }

  // Nothing has run yet, so there is no better answer to give than the reason there was no room.
  if (!hasRoomForAnotherCall(input)) return { ok: false, reason: 'planner_deadline_exceeded' };

  let repairInstruction: string | undefined;
  for (let repair = 0; ; repair += 1) {
    const attempt = await attemptPlan(openai, input, repairInstruction);
    if (attempt.ok) return attempt;
    // Nothing came back to correct, so there is nothing a repair could say — and nothing to rebuild
    // from either, so the deterministic fallback cannot help a provider failure.
    if (isProviderFailure(attempt.reason)) return { ok: false, reason: attempt.reason };
    // Out of repairs, or out of time for another — the same give-up point as before, so no call this
    // loop would not have made is made now.
    if (repair >= PROMPT_ENHANCEMENT_COST_VALIDATION_RETRY_COUNT_V1
      || !hasRoomForAnotherCall(input)) {
      // PROPER FIX — the model could not produce a valid plan. When the caller opted in and this last
      // plan carried a usable decomposition, emit the deterministic rebuild rather than lose the
      // sequence to an empty `items_json`. Otherwise return the plan's own defect and leave the
      // single-prompt path alone, exactly as before.
      if (input.deterministicFallback === true && attempt.repair !== undefined) {
        return { ok: true, output: attempt.repair };
      }
      return { ok: false, reason: attempt.reason };
    }
    repairInstruction = buildPromptEnhancementSequencePlannerRepairInstructionV1(
      attempt.reason,
      attempt.itemIndex,
    );
  }
}
