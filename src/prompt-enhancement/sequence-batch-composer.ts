import { newNexpathOpenAIClient } from '../config/llm-client-scope.js';
import OpenAI from 'openai';
import {
  PROMPT_ENHANCEMENT_COST_MODEL_V1,
  PROMPT_ENHANCEMENT_SEQUENCE_BATCH_TIMEOUT_MS_V1,
  PROMPT_ENHANCEMENT_COST_VALIDATION_RETRY_COUNT_V1,
  PROMPT_ENHANCEMENT_SEQUENCE_BATCH_OUTPUT_TOKEN_CAP_V1,
  PROMPT_ENHANCEMENT_SEQUENCE_BATCH_OUTPUT_TOKEN_HARD_CAP_V1,
} from './cost-observability.js';

/** The two caps are the shipping ones; re-exported so a reader of this module reaches the same. */
export {
  PROMPT_ENHANCEMENT_SEQUENCE_BATCH_OUTPUT_TOKEN_CAP_V1,
  PROMPT_ENHANCEMENT_SEQUENCE_BATCH_OUTPUT_TOKEN_HARD_CAP_V1,
} from './cost-observability.js';
import {
  PROMPT_ENHANCEMENT_SEQUENCE_CONFIRMATION_CLAUSES_V1,
  buildPromptEnhancementSequenceBatchSystemPromptV1,
} from './sequence-batch-composer-prompt.js';
import type {
  PromptEnhancementCallVisibilityMode,
  PromptEnhancementSafetySummaryV1,
  PromptEnhancementValidationGraphV1,
} from './contracts.js';
import {
  buildPromptEnhancementSequenceItemValidationGraphV1,
  type PromptEnhancementSequenceItemSafetyInputV1,
} from './sequence-enforcement.js';
import {
  isPromptEnhancementSequenceOffsetRangeV1,
  promptEnhancementSequenceTextHasClauseV1,
  promptEnhancementSequenceTextHasTokenV1,
  promptEnhancementSequenceTextReproducesV1,
  type PromptEnhancementSequenceItemKindV1,
  type PromptEnhancementSequenceItemV1,
  type PromptEnhancementSequenceOffsetRangeV1,
} from './sequence-payload.js';
import type { PromptEnhancementSequencePlannerClientV1 } from './sequence-planner.js';
import type { PromptEnhancementSequenceFailureDispositionV1 } from './sequence-planner-failure.js';

/**
 * The up-front batch composer.
 *
 * ONE call over the WHOLE remaining list, not one call per item and not a loop. That is the whole
 * point of composing up front rather than at each Stop: a prompt written without knowing what
 * follows it cannot avoid repeating it, and the seventh prompt is written by something that has
 * already seen the second.
 *
 * It runs in the background while the first popup is open, so the popup never waits on it. Item 1
 * is not part of the batch — it is composed by the ordinary composer before this runs, and arrives
 * here as CONTEXT: what has already been said, so nothing repeats or contradicts it. It is never
 * source material. A later item cut out of the first body inherits the shaping of a body that was
 * written to carry the whole request in one prompt, which is the opposite of a prompt that stands
 * on its own.
 *
 * Nothing here reads or writes storage. The plan is in memory and the wording joins it there; the
 * first write happens when the user sends.
 */

/** What one item needs before it can be worded, resolved from the plan and the local original. */
export interface PromptEnhancementSequenceBatchItemV1 {
  dependencyOrder: number;
  /**
   * This item's identity, as the rest of the system spells it.
   *
   * Carried, never derived here. It is the only handle a stored failure has back to the item it
   * belongs to, and every other site — the continuation event, the popup identity, the delivery
   * record, the packager — receives it from the runtime rather than composing one. A second format
   * minted here would name the same item in a way nothing else produces or looks up, so the one
   * place a per-item verdict could be traced would be the one place it could not.
   */
  sequenceItemId: string;
  itemKind: PromptEnhancementSequenceItemKindV1;
  /**
   * The user's own words for this item, resolved from its offsets against the LOCAL original.
   *
   * Resolved, never re-derived: the boundary is the planner's decision and recomputing one from the
   * text is a different boundary that happens to look like it. Null on the kinds that carry none.
   */
  sliceText: string | null;
  roleLabel: string | null;
  complexity: string | null;
  /** Why this item is complex, or why THIS confirmation applies — the composer writes from it. */
  complexityReason: string | null;
  authorityMode: string | null;
  requiresConfirmationFloor: boolean;
  /**
   * For the closing recap only: the slices of every task it covers, in order.
   *
   * Read off the earlier task entries rather than stored a second time — the recap's own slice ref
   * is null by design, and storing the same spans twice creates two places they can disagree.
   */
  coveredSliceTexts: readonly string[];
}

export interface PromptEnhancementSequenceBatchInputV1 {
  /**
   * Which plan this batch is for.
   *
   * A re-plan while the batch is running is the ordinary case, not a race: the batch starts when
   * the first popup appears and the buttons that re-plan are on that same popup. What is in flight
   * then is wording for a list that no longer exists, and applying it produces a prompt for work the
   * plan no longer contains — which satisfies every stored invariant while describing the wrong
   * task, so nothing downstream would catch it.
   */
  planGenerationId: string;
  /** Items 2…N, in order. Item 0 is not among them. */
  items: readonly PromptEnhancementSequenceBatchItemV1[];
  /** Item 1's finished body. Context only: what has already been said. */
  firstBodyText: string;
  /** The user's whole-prompt instructions, resolved. They reach every item, in two different ways. */
  promptDirectives: readonly string[];
  /** The request as the user typed it, for the authority check to compare wording against. */
  localOriginalText: string;
  /**
   * The accepted sequence's own safety summary, as the posture each item's verdict starts from.
   *
   * Two of its fields describe the SEQUENCE rather than any one prompt — its source honesty and its
   * privacy state — and P2 changes neither: it adds no sources, and the redaction boundary is
   * settled before it runs. Those are carried through.
   *
   * Whether a required floor is present is decided per item here. ⛔ The validation status and the
   * authority escalation state are DROPPED rather than carried: they are the authority check's
   * answer, and it has not run yet at that point. The graph builder writes them from its own
   * findings.
   */
  baseSafetySummary: PromptEnhancementSafetySummaryV1;
  /** How this run reached the provider, recorded on every item's verdict. */
  providerRuntimeState: PromptEnhancementCallVisibilityMode;
  optionalCallAvailabilityState: PromptEnhancementValidationGraphV1['optionalCallAvailabilityState'];
  /** When the work this call is part of must be finished, as epoch milliseconds. */
  deadlineAtMs?: number;
  /** How the deadline is read. Present so the check is testable without waiting. */
  nowMs?: () => number;
}

export type PromptEnhancementSequenceBatchFailureReasonV1 =
  | 'no_key'
  | 'provider_error'
  | 'timeout'
  | 'invalid_output'
  | 'batch_deadline_exceeded'
  | 'item_missing_wording'
  | 'item_not_in_plan'
  | 'first_item_must_not_be_worded'
  | 'slice_missing_from_wording'
  | 'covered_slice_missing_from_recap'
  | 'confirmation_carries_original_text'
  | 'confirmation_format_wrong_for_kind'
  | 'confirmation_missing_answer_alone_demand'
  | 'confirmation_reproduces_directive_text'
  | 'safety_clause_missing'
  | 'safety_clause_not_found_in_wording'
  | 'safety_clause_present_without_floor'
  | 'wording_exceeds_item_authority';

/**
 * What one composed item carries out of the batch, beside its text.
 *
 * The verdict is produced HERE, with the wording, and stored beside it — never re-derived at each
 * continuation. A second run over frozen text can only agree with itself or contradict itself, and
 * the contradiction arrives with the user already holding a body the engine accepted.
 */
export interface PromptEnhancementSequenceComposedItemV1 {
  wording: string;
  /** The per-item validation verdict the packager reports and is forbidden to invent. */
  validationGraph: PromptEnhancementValidationGraphV1;
  /** Where the floor sits inside `wording`. Null on every item that needed none. */
  safetyClauseRef: PromptEnhancementSequenceOffsetRangeV1 | null;
}

export type PromptEnhancementSequenceBatchResultV1 =
  | {
    ok: true;
    planGenerationId: string;
    wording: ReadonlyMap<number, string>;
    /** Keyed by `dependencyOrder`, one entry per item the batch was asked to write. */
    composed: ReadonlyMap<number, PromptEnhancementSequenceComposedItemV1>;
  }
  | { ok: false; reason: PromptEnhancementSequenceBatchFailureReasonV1 };

/** One item as the model returned it, before anything has been checked. */
interface BatchReplyEntryV1 {
  wording: string;
  safetyClause: string | null;
}

type BatchAttemptV1 =
  | { ok: true; composed: ReadonlyMap<number, PromptEnhancementSequenceComposedItemV1> }
  | { ok: false; reason: PromptEnhancementSequenceBatchFailureReasonV1; dependencyOrder?: number };

const CONFIRMATION_KINDS: readonly PromptEnhancementSequenceItemKindV1[] = [
  'double_confirmation',
  'cross_confirmation',
  'binary_confirmation',
];

/** The format is a total function of the kind: the composer never picks it and never mixes two. */
const FORMAT_TOKENS_V1: Readonly<Record<string, readonly [string, string]>> = {
  double_confirmation: ['PASS', 'FAIL'],
  cross_confirmation: ['PASS', 'FAIL'],
  binary_confirmation: ['YES', 'NO'],
};

function isConfirmation(kind: PromptEnhancementSequenceItemKindV1): boolean {
  return CONFIRMATION_KINDS.includes(kind);
}

/**
 * The part of the item's safety posture THIS function is in a position to know.
 *
 * One field is decided here and two are carried. ⛔ The validation status and the authority
 * escalation state are deliberately absent: they are the authority check's answer, and this runs
 * before it. Asserting them here would put a summary saying `valid` inside a graph whose failures
 * say otherwise — and the type will not let it, which is the point of the type.
 *
 * Nothing is claimed that was not established: a floor is reported present only when its sentence
 * was found in the wording this call is validating.
 */
function composedItemSafetyInput(
  base: PromptEnhancementSafetySummaryV1,
  requiresFloor: boolean,
  floorPresent: boolean,
): PromptEnhancementSequenceItemSafetyInputV1 {
  const { validationStatus: _status, authorityEscalationState: _escalation, ...carried } = base;
  return {
    ...carried,
    sensitiveActionState: requiresFloor
      ? (floorPresent ? 'confirmation_required_present' : 'confirmation_required_missing')
      : 'none',
    noForegroundSafer: true,
    noAutomaticSend: true,
  };
}

/**
 * Every rule about the batch's output that can be decided by looking rather than judging.
 *
 * What is NOT here, and deliberately: whether a later item is light enough, whether a question is
 * phrased negatively, whether it asks two things at once, whether the tone is firm rather than
 * rude, and whether a confirmation's certainty bar and anti-assumption instruction are present.
 * Those are judgements or requirements on meaning, they are instructed in the prompt, and a
 * deterministic approximation of them would be worse than none — it would reject correct wording
 * that happens to be phrased differently, and spend the repair bound doing it.
 *
 * On success every item leaves here with its wording, its verdict, and the position of its floor.
 * The verdict is written once, with the text it describes; nothing downstream produces one.
 */
function checkBatchOutput(
  input: PromptEnhancementSequenceBatchInputV1,
  reply: ReadonlyMap<number, BatchReplyEntryV1>,
): BatchAttemptV1 {
  const planned = new Map(input.items.map((item) => [item.dependencyOrder, item]));
  const composed = new Map<number, PromptEnhancementSequenceComposedItemV1>();

  for (const order of reply.keys()) {
    // Item 0 is already written and is not the batch's to write. Wording for it is a second first
    // body, composed after the popup already had one.
    if (order === 0) return { ok: false, reason: 'first_item_must_not_be_worded', dependencyOrder: 0 };
    if (!planned.has(order)) return { ok: false, reason: 'item_not_in_plan', dependencyOrder: order };
  }

  for (const item of input.items) {
    const entry = reply.get(item.dependencyOrder);
    const text = entry?.wording;
    if (text === undefined || text.trim().length === 0) {
      return { ok: false, reason: 'item_missing_wording', dependencyOrder: item.dependencyOrder };
    }

    // A task carries its own slice exactly as the user typed it. Exact containment, not a
    // similarity score: the rule is that the characters are there, unchanged.
    if (item.sliceText !== null && !isConfirmation(item.itemKind)) {
      if (!text.includes(item.sliceText)) {
        return { ok: false, reason: 'slice_missing_from_wording', dependencyOrder: item.dependencyOrder };
      }
    }

    if (item.itemKind === 'wrap_up') {
      for (const covered of item.coveredSliceTexts) {
        if (!text.includes(covered)) {
          return {
            ok: false,
            reason: 'covered_slice_missing_from_recap',
            dependencyOrder: item.dependencyOrder,
          };
        }
      }
    }

    if (isConfirmation(item.itemKind)) {
      // A confirmation carries no original wording at all. Strictly — so any task's slice appearing
      // in one is the failure, not only its own, which it does not have.
      //
      // Reproduction, not containment. A slice is often a single word, and a question about that
      // work cannot avoid naming it: rejecting "did the deploy finish" because the slice was
      // "deploy" refuses the only sentence the rule leaves available.
      for (const other of input.items) {
        if (other.sliceText !== null
          && promptEnhancementSequenceTextReproducesV1(text, other.sliceText)) {
          return {
            ok: false,
            reason: 'confirmation_carries_original_text',
            dependencyOrder: item.dependencyOrder,
          };
        }
      }
      // On a confirmation a directive constrains what may be asked; it is never reproduced as text.
      for (const directive of input.promptDirectives) {
        if (promptEnhancementSequenceTextReproducesV1(text, directive)) {
          return {
            ok: false,
            reason: 'confirmation_reproduces_directive_text',
            dependencyOrder: item.dependencyOrder,
          };
        }
      }
      const tokens = FORMAT_TOKENS_V1[item.itemKind];
      const otherTokens = tokens?.[0] === 'YES' ? ['PASS', 'FAIL'] : ['YES', 'NO'];
      // Whole tokens, never substrings: "DO NOT make any assumptions" contains NO, and rejecting a
      // confirmation for carrying the clause it is malformed without is the wrong failure twice.
      if (tokens === undefined
        || !tokens.every((token) => promptEnhancementSequenceTextHasTokenV1(text, token))
        // Mixing two formats in one item leaves the agent choosing which to answer in.
        || otherTokens.some((token) => promptEnhancementSequenceTextHasTokenV1(text, token))) {
        return {
          ok: false,
          reason: 'confirmation_format_wrong_for_kind',
          dependencyOrder: item.dependencyOrder,
        };
      }
      // ⛔ The certainty bar and the anti-assumption instruction are NOT checked here, and their
      // absence from this function is the rule rather than an omission. Both are requirements on
      // MEANING — a certainty bar can be worded many ways — so a check that looks for the sentence
      // we happened to dictate rejects a correct paraphrase, and the item is then repaired until
      // the bound runs out and the whole sequence falls back to a single prompt. For output that
      // was right. Their presence is the composer's own to confirm, and the prompt asks it to.
      //
      // What survives here is the part that is not a matter of wording: the answer-alone DEMAND is
      // a clause in the QUESTION, never a fact about the reply — Nexpath does not read agent
      // replies — and the token set is fixed by the item's kind with exactly two possibilities.
      if (!promptEnhancementSequenceTextHasClauseV1(
        text,
        PROMPT_ENHANCEMENT_SEQUENCE_CONFIRMATION_CLAUSES_V1.answerAlone.anchor,
      )) {
        return {
          ok: false,
          reason: 'confirmation_missing_answer_alone_demand',
          dependencyOrder: item.dependencyOrder,
        };
      }
    }

    // The floor's position, found rather than computed by the model: it returns the sentence it
    // wrote and we locate that exact run of characters. Asking a model for offsets into its own
    // output asks it to count, which it cannot reliably do; asking it to repeat a sentence it just
    // wrote is the thing models are good at, and an exact search over the answer is decidable.
    //
    // Not searched for by meaning. Nothing here decides what a safety sentence looks like — the
    // composer says which one it is, and this only asks whether that claim holds against the text.
    let safetyClauseRef: PromptEnhancementSequenceOffsetRangeV1 | null = null;
    if (item.requiresConfirmationFloor) {
      const clause = entry?.safetyClause ?? null;
      if (clause === null || clause.trim().length === 0) {
        return { ok: false, reason: 'safety_clause_missing', dependencyOrder: item.dependencyOrder };
      }
      const start = text.indexOf(clause);
      if (start < 0) {
        return {
          ok: false,
          reason: 'safety_clause_not_found_in_wording',
          dependencyOrder: item.dependencyOrder,
        };
      }
      safetyClauseRef = { start, end: start + clause.length };
    } else if (entry?.safetyClause != null && entry.safetyClause.trim().length > 0) {
      // A clause on an item that needed no floor means the composer marked the wrong item, and a
      // position recorded against the wrong item is worse than none: the edit check would then
      // guard a sentence on an item that never needed guarding while the real one goes unwatched.
      return {
        ok: false,
        reason: 'safety_clause_present_without_floor',
        dependencyOrder: item.dependencyOrder,
      };
    }

    // The per-item authority check, from the machinery that already ships rather than a second copy
    // of it. The single-prompt validator never sees this wording: a sequence item is a generated
    // body, and without this check a plan-or-review slice could be worded as an instruction to
    // carry the work out with nothing in the system noticing.
    //
    // Asked ONCE, through the builder that also produces the stored verdict. Asking it here and
    // again there would be two sites answering one question, free to diverge while both look right.
    const validationGraph = buildPromptEnhancementSequenceItemValidationGraphV1({
      sliceText: item.sliceText,
      generatedWording: text,
      sequenceItemId: item.sequenceItemId,
      safetyState: composedItemSafetyInput(
        input.baseSafetySummary,
        item.requiresConfirmationFloor,
        safetyClauseRef !== null,
      ),
      providerRuntimeState: input.providerRuntimeState,
      optionalCallAvailabilityState: input.optionalCallAvailabilityState,
    });
    if (validationGraph.failures.length > 0) {
      return { ok: false, reason: 'wording_exceeds_item_authority', dependencyOrder: item.dependencyOrder };
    }

    composed.set(item.dependencyOrder, { wording: text, validationGraph, safetyClauseRef });
  }

  return { ok: true, composed };
}

/**
 * PROPER FIX — the deterministic body-producer fallback.
 *
 * When the model batch cannot word items 2…N to spec (any reason above), rejecting it empties
 * `items_json` and the second popup is lost. Instead, word every item WITHOUT the model, from the parts
 * the plan already fixed: a task carries its OWN SLICE verbatim — so it reproduces its slice and cannot
 * exceed its own authority, because it IS its authority; a confirmation carries the fixed format its
 * kind demands (the two tokens and the answer-alone clause); the recap carries the slices it covers. The
 * per-item verdict is the SAME graph the model path builds, from the same builder and the same safety
 * input, so a fallback body is validated exactly as a model one and a floor keeps its located clause.
 *
 * Returns null — never a partial map — if any item fails that shared check, so the caller keeps the
 * model's own failure rather than storing a half-worded sequence. A task with an empty slice is the one
 * case it cannot word, and it says so the same way.
 */
export function buildPromptEnhancementSequenceDeterministicComposedV1(
  items: readonly PromptEnhancementSequenceBatchItemV1[],
  context: {
    baseSafetySummary: PromptEnhancementSafetySummaryV1;
    providerRuntimeState: PromptEnhancementCallVisibilityMode;
    optionalCallAvailabilityState: PromptEnhancementValidationGraphV1['optionalCallAvailabilityState'];
  },
): ReadonlyMap<number, PromptEnhancementSequenceComposedItemV1> | null {
  const answerAlone = PROMPT_ENHANCEMENT_SEQUENCE_CONFIRMATION_CLAUSES_V1.answerAlone.sentence;
  // A fixed caution, not a new instruction: it demands confirmation, it does not enlarge the task, so
  // it cannot escalate the slice's authority. Located in the wording so a floor item carries its ref.
  const safetyClause = 'Confirm this operation is intended and safe before carrying it out.';
  const composed = new Map<number, PromptEnhancementSequenceComposedItemV1>();
  for (const item of items) {
    let wording: string;
    let safetyClauseRef: PromptEnhancementSequenceOffsetRangeV1 | null = null;
    if (isConfirmation(item.itemKind)) {
      const [first, second] = FORMAT_TOKENS_V1[item.itemKind] ?? ['YES', 'NO'];
      wording = `Before this step continues, confirm it should proceed. `
        + `Reply ${first} or ${second} only. ${answerAlone}`;
    } else if (item.itemKind === 'wrap_up') {
      const covered = item.coveredSliceTexts.join(' ');
      wording = covered.trim().length > 0
        ? `To recap, this sequence covers: ${covered}`
        : 'To recap, this sequence is now complete.';
    } else {
      // A task: the user's own words for this step, verbatim — it reproduces its slice by being it.
      wording = item.sliceText ?? '';
      if (wording.trim().length === 0) return null;
      if (item.requiresConfirmationFloor) {
        wording = `${wording} ${safetyClause}`;
        const start = wording.indexOf(safetyClause);
        safetyClauseRef = { start, end: start + safetyClause.length };
      }
    }
    const validationGraph = buildPromptEnhancementSequenceItemValidationGraphV1({
      sliceText: item.sliceText,
      generatedWording: wording,
      sequenceItemId: item.sequenceItemId,
      safetyState: composedItemSafetyInput(
        context.baseSafetySummary,
        item.requiresConfirmationFloor,
        safetyClauseRef !== null,
      ),
      providerRuntimeState: context.providerRuntimeState,
      optionalCallAvailabilityState: context.optionalCallAvailabilityState,
    });
    // The same gate the model path applies: a body that would exceed its slice's authority is not
    // stored. The fallback is built not to, but the check is shared rather than trusted.
    if (validationGraph.failures.length > 0) return null;
    composed.set(item.dependencyOrder, { wording, validationGraph, safetyClauseRef });
  }
  return composed;
}

/** Resolve an item's slice from the local original. Resolving only — never recomputing a boundary. */
export function promptEnhancementSequenceSliceTextV1(
  ref: PromptEnhancementSequenceOffsetRangeV1 | null,
  localOriginalText: string,
): string | null {
  if (!isPromptEnhancementSequenceOffsetRangeV1(ref, localOriginalText.length)) return null;
  return localOriginalText.slice(ref.start, ref.end);
}

/**
 * The batch's input, built from a plan and the local original.
 *
 * The recap's covered slices are read off the earlier task entries here, which is why the recap
 * needs no slice field of its own.
 */
export function buildPromptEnhancementSequenceBatchItemsV1(
  items: readonly PromptEnhancementSequenceItemV1[],
  localOriginalText: string,
  /**
   * How the caller names item N — the same id it will hand the packager for that item.
   *
   * A function rather than a lookup table, so there is no absent-entry case to invent a fallback
   * for: an empty or made-up id would satisfy every type here and produce a verdict pointing at
   * nothing. The stored item carries no id of its own, and at composition time no row exists to
   * read one from, so the caller is the only thing that can answer.
   */
  sequenceItemIdFor: (dependencyOrder: number) => string,
): readonly PromptEnhancementSequenceBatchItemV1[] {
  /**
   * The covered slices, with any span already inside another one dropped.
   *
   * The first item's slice IS the whole original by definition, so an unfiltered list asks the
   * recap to reproduce the whole request and then each piece of it again — the same words two and
   * three times over, in the one item whose purpose is that the user reads it. Dropping a span
   * contained in another loses nothing: every character is still there, once.
   */
  const coveringSlices = (slices: readonly string[]): readonly string[] =>
    slices.filter((slice, index) =>
      !slices.some((other, otherIndex) =>
        otherIndex !== index && other.includes(slice) && (other.length > slice.length || otherIndex < index)));

  const taskSlices: string[] = [];
  const batch: PromptEnhancementSequenceBatchItemV1[] = [];
  for (const item of items) {
    const sliceText = promptEnhancementSequenceSliceTextV1(item.originalSliceRef, localOriginalText);
    if (sliceText !== null) taskSlices.push(sliceText);
    // Item 0 is the first body. It is context for the batch and is not written by it.
    if (item.dependencyOrder === 0) continue;
    batch.push({
      dependencyOrder: item.dependencyOrder,
      sequenceItemId: sequenceItemIdFor(item.dependencyOrder),
      itemKind: item.itemKind,
      sliceText,
      roleLabel: item.roleLabel,
      complexity: item.complexity,
      complexityReason: item.complexityReason,
      authorityMode: item.authorityMode,
      requiresConfirmationFloor: item.requiresConfirmationFloor,
      // Every task slice up to this point, which for a recap at the end is all of them.
      coveredSliceTexts: item.itemKind === 'wrap_up' ? coveringSlices(taskSlices) : [],
    });
  }
  return batch;
}

/** The list as the composer is given it: parts and no prose about them. */
function buildBatchUserMessageV1(input: PromptEnhancementSequenceBatchInputV1): string {
  const lines: string[] = [
    'THE FIRST PROMPT, ALREADY WRITTEN. Context only — do not cut later prompts out of it:',
    input.firstBodyText,
    '',
  ];
  if (input.promptDirectives.length > 0) {
    lines.push("THE USER'S WHOLE-PROMPT INSTRUCTIONS. They apply to every item below:");
    for (const directive of input.promptDirectives) lines.push(`  - ${directive}`);
    lines.push('');
  }
  lines.push('THE ITEMS TO WRITE:');
  for (const item of input.items) {
    lines.push(`  [${item.dependencyOrder}] kind: ${item.itemKind}`);
    if (item.roleLabel !== null) lines.push(`      role: ${item.roleLabel}`);
    if (item.complexity !== null) lines.push(`      complexity: ${item.complexity}`);
    if (item.complexityReason !== null) lines.push(`      why: ${item.complexityReason}`);
    if (item.authorityMode !== null) lines.push(`      authority: ${item.authorityMode}`);
    if (item.requiresConfirmationFloor) {
      lines.push('      this item needs a confirmation floor inside its own prompt');
    }
    if (item.sliceText !== null) lines.push(`      slice, verbatim: ${item.sliceText}`);
    for (const covered of item.coveredSliceTexts) {
      lines.push(`      covers, verbatim: ${covered}`);
    }
  }
  return lines.join('\n');
}

function parseBatchReply(raw: string): ReadonlyMap<number, BatchReplyEntryV1> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const items = (parsed as Record<string, unknown>)['items'];
  if (!Array.isArray(items)) return null;
  const entries = new Map<number, BatchReplyEntryV1>();
  for (const entry of items) {
    if (typeof entry !== 'object' || entry === null) return null;
    const item = entry as Record<string, unknown>;
    if (typeof item['dependencyOrder'] !== 'number' || typeof item['wording'] !== 'string') return null;
    // Absent is the ordinary case — most items need no floor. A present-but-not-a-string value is
    // malformed output rather than an absent clause, and reading it as absent would turn a broken
    // reply into a silently floorless item.
    const clause = item['safetyClause'];
    if (clause !== undefined && clause !== null && typeof clause !== 'string') return null;
    entries.set(item['dependencyOrder'], {
      wording: item['wording'],
      safetyClause: typeof clause === 'string' ? clause : null,
    });
  }
  return entries;
}

function batchErrorReason(error: unknown): 'timeout' | 'provider_error' {
  const name = (error as { name?: unknown } | null)?.name;
  if (typeof name === 'string' && /timeout/i.test(name)) return 'timeout';
  return /timed?\s?out/i.test(String(error)) ? 'timeout' : 'provider_error';
}

function isProviderFailure(reason: PromptEnhancementSequenceBatchFailureReasonV1): boolean {
  return reason === 'provider_error' || reason === 'timeout' || reason === 'no_key';
}

function hasRoomForAnotherCall(input: PromptEnhancementSequenceBatchInputV1): boolean {
  if (input.deadlineAtMs === undefined) return true;
  return (input.nowMs ?? Date.now)() + PROMPT_ENHANCEMENT_SEQUENCE_BATCH_TIMEOUT_MS_V1 <= input.deadlineAtMs;
}

/** What a rejected batch is told, so the next attempt corrects one item rather than starting over. */
export function buildPromptEnhancementSequenceBatchRepairInstructionV1(
  reason: string,
  dependencyOrder: number | undefined,
): string {
  const where = dependencyOrder === undefined
    ? 'The reply as a whole was rejected.'
    : `Item ${dependencyOrder} was rejected.`;
  return [
    'YOUR PREVIOUS REPLY WAS NOT ACCEPTED.',
    '',
    `${where} The check that rejected it: ${reason}.`,
    '',
    'Return every item again with that one corrected, and the others exactly as you wrote them.',
  ].join('\n');
}

async function attemptBatch(
  openai: PromptEnhancementSequencePlannerClientV1,
  input: PromptEnhancementSequenceBatchInputV1,
  repairInstruction: string | undefined,
  maxTokens: number,
): Promise<BatchAttemptV1> {
  let raw: string | null | undefined;
  try {
    const response = await openai.chat.completions.create(
      {
        model: PROMPT_ENHANCEMENT_COST_MODEL_V1,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: buildPromptEnhancementSequenceBatchSystemPromptV1() },
          { role: 'user', content: buildBatchUserMessageV1(input) },
          ...(repairInstruction === undefined
            ? []
            : [{ role: 'user' as const, content: repairInstruction }]),
        ],
        response_format: { type: 'json_object' },
      },
      { timeout: PROMPT_ENHANCEMENT_SEQUENCE_BATCH_TIMEOUT_MS_V1, maxRetries: 0 },
    );
    raw = response.choices?.[0]?.message?.content;
  } catch (error) {
    return { ok: false, reason: batchErrorReason(error) };
  }

  if (typeof raw !== 'string' || raw.trim().length === 0) return { ok: false, reason: 'invalid_output' };
  const reply = parseBatchReply(raw);
  // A batch cut off mid-JSON is invalid rather than degraded: an item whose wording ran out of
  // tokens is a broken sequence, not a shorter one.
  if (reply === null) return { ok: false, reason: 'invalid_output' };
  return checkBatchOutput(input, reply);
}

/**
 * Run the batch.
 *
 * One call for the whole remaining list, then up to three repairs of a reply that came back wrong.
 * A provider failure is not repaired — nothing arrived to correct. Repair happens before the user
 * has accepted anything; once a sequence is active an item is never regenerated at all.
 */
export async function runPromptEnhancementSequenceBatchV1(
  input: PromptEnhancementSequenceBatchInputV1,
  client?: PromptEnhancementSequencePlannerClientV1,
  maxTokens = PROMPT_ENHANCEMENT_SEQUENCE_BATCH_OUTPUT_TOKEN_CAP_V1,
): Promise<PromptEnhancementSequenceBatchResultV1> {
  let openai: PromptEnhancementSequencePlannerClientV1;
  try {
    openai = client ?? (newNexpathOpenAIClient() as unknown as PromptEnhancementSequencePlannerClientV1);
  } catch {
    return { ok: false, reason: 'no_key' };
  }

  if (!hasRoomForAnotherCall(input)) return { ok: false, reason: 'batch_deadline_exceeded' };

  let repairInstruction: string | undefined;
  for (let repair = 0; ; repair += 1) {
    const attempt = await attemptBatch(
      openai,
      input,
      repairInstruction,
      // A repair asks at the hard cap: one reason a batch comes back unusable is that it did not
      // fit, and every remaining prompt in one reply is the largest thing this feature produces.
      repair === 0 ? maxTokens : PROMPT_ENHANCEMENT_SEQUENCE_BATCH_OUTPUT_TOKEN_HARD_CAP_V1,
    );
    if (attempt.ok) {
      return {
        ok: true,
        planGenerationId: input.planGenerationId,
        // The text on its own, for callers that only ever wanted that; the verdicts and floor
        // positions travel beside it rather than instead of it.
        wording: new Map([...attempt.composed].map(([order, item]) => [order, item.wording])),
        composed: attempt.composed,
      };
    }
    if (isProviderFailure(attempt.reason)) return { ok: false, reason: attempt.reason };
    if (repair >= PROMPT_ENHANCEMENT_COST_VALIDATION_RETRY_COUNT_V1 || !hasRoomForAnotherCall(input)) {
      return { ok: false, reason: attempt.reason };
    }
    repairInstruction = buildPromptEnhancementSequenceBatchRepairInstructionV1(
      attempt.reason,
      attempt.dependencyOrder,
    );
  }
}

/**
 * What a failed batch leaves the user with.
 *
 * Two answers, and the difference is whether anything actually went wrong. A call that could not be
 * made or did not come back is a fault the waiting user should be told about. A reply that arrived
 * and did not hold up — including after its repairs were spent — costs the sequence and nothing
 * else: the ordinary single-prompt path is untouched and the user still gets their prompt.
 *
 * Enumerated with no default arm, so a reason added later stops compiling here rather than falling
 * into whichever branch happens to be last.
 */
export function promptEnhancementSequenceBatchDispositionV1(
  reason: PromptEnhancementSequenceBatchFailureReasonV1,
): PromptEnhancementSequenceFailureDispositionV1 {
  switch (reason) {
    case 'no_key':
    case 'provider_error':
    case 'timeout':
      return 'error_popup_no_generated_content';

    case 'invalid_output':
    case 'batch_deadline_exceeded':
    case 'item_missing_wording':
    case 'item_not_in_plan':
    case 'first_item_must_not_be_worded':
    case 'slice_missing_from_wording':
    case 'covered_slice_missing_from_recap':
    case 'confirmation_carries_original_text':
    case 'confirmation_format_wrong_for_kind':
    case 'confirmation_missing_answer_alone_demand':
    case 'confirmation_reproduces_directive_text':
    case 'safety_clause_missing':
    case 'safety_clause_not_found_in_wording':
    case 'safety_clause_present_without_floor':
    case 'wording_exceeds_item_authority':
      return 'no_sequence_single_prompt';
  }
}

/** How the popup that the batch is running behind was left. */
export type PromptEnhancementSequenceBatchExitV1 =
  | 'user_sends'
  | 'popup_closed'
  | 'escape'
  | 'use_original';

export type PromptEnhancementSequenceBatchExitActionV1 =
  /** Hold the hook open until the batch returns. Anything not awaited is killed at the force-exit. */
  | 'await_batch_before_exit'
  /** Let it go. Nothing will be stored, so there is no result to protect. */
  | 'discard_batch';

/**
 * What to do with a running batch when the popup is left.
 *
 * Both halves are load-bearing and each is the wrong answer for the other's case.
 *
 * On SEND the wording is about to be persisted, and the exit path force-exits the process after the
 * write — so a batch that is not awaited is killed silently and the sequence is stored with items
 * that have no text. The surrounding code on that very path already does the wrong thing by habit:
 * a fire-and-forget call sits immediately above the exit.
 *
 * On a close the plan and the wording are both dropped and only a disposition stub is written, so
 * there is nothing to wait for. Awaiting anyway turns pressing Escape at second three into a
 * twenty-second hang on a cancel — the user's clearest possible statement that they want out.
 *
 * Enumerated with no default arm, so a new exit has to be decided rather than inherited.
 */
export function promptEnhancementSequenceBatchExitActionV1(
  exit: PromptEnhancementSequenceBatchExitV1,
): PromptEnhancementSequenceBatchExitActionV1 {
  switch (exit) {
    case 'user_sends':
      return 'await_batch_before_exit';
    case 'popup_closed':
    case 'escape':
    case 'use_original':
      return 'discard_batch';
  }
}

/**
 * May this batch result be applied to the plan in hand?
 *
 * Only when it was composed for that plan. A re-plan while the batch runs is the ordinary case, and
 * the result then in flight is wording for a list that no longer exists — applied, it produces a
 * prompt for work the plan no longer contains, which passes every stored invariant while describing
 * the wrong task.
 */
export function promptEnhancementSequenceBatchIsCurrentV1(
  result: PromptEnhancementSequenceBatchResultV1,
  currentPlanGenerationId: string,
): boolean {
  return result.ok && result.planGenerationId === currentPlanGenerationId;
}
