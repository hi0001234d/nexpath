import { newNexpathOpenAIClient } from '../config/llm-client-scope.js';
import OpenAI from 'openai';
import { promptEnhancementSectionModelFactsV1 } from './fact-value-render.js';
import type { PromptEnhancementGuidanceFact } from './templates/section-plan.js';
import type { PromptEnhancementSectionPlanningResult } from './templates/section-plan.js';
import type { PromptEnhancementStructuredComposerOutputV1 } from './compose-enhancement.js';
import {
  PROMPT_ENHANCEMENT_COST_MODEL_V1,
  PROMPT_ENHANCEMENT_COST_OUTPUT_TOKEN_CAP_V1,
  PROMPT_ENHANCEMENT_COST_TIMEOUT_MS_V1,
  PROMPT_ENHANCEMENT_COST_VALIDATION_RETRY_COUNT_V1,
} from './cost-observability.js';
import { isPromptEnhancementLanguageConsistentV1 } from './language-consistency.js';
import { promptEnhancementObligationDirectiveV1 } from './section-obligation-directives.js';
import { isPromptEnhancementNounPurposeV1 } from './noun-purpose-transposition.js';
import { textNamesKnownToolOrCredentialV1 } from './known-tool-names.js';
import { promptEnhancementSectionPurposeV1 } from './section-relevance.js';
import {
  promptEnhancementGuidanceKindWordingV1,
  promptEnhancementConfidenceWordingV1,
  promptEnhancementOriginWordingV1,
  promptEnhancementClaimWordingV1,
} from './fact-line-wording.js';
import {
  promptEnhancementExpectedSignalNamesV1,
  promptEnhancementDraftNamesItsSignalV1,
  promptEnhancementSignalNameDirectiveV1,
  PROMPT_ENHANCEMENT_SOURCE_SIGNAL_SECTION_KIND_V1,
} from './source-signal-naming.js';
import {
  isPromptEnhancementAuthorityConsistentV1,
  isPromptEnhancementAuthoritySelfReportV1,
} from './authority-consistency.js';

const STRONGER_LANGUAGE_DIRECTIVE =
  '\n\nIMPORTANT: your previous reply drifted from the original language. Write EVERY section' +
  " strictly in the original prompt's language, slang, and script (do NOT switch to English), and set" +
  ' detectedLanguageSelfReport correctly.';

const STRONGER_AUTHORITY_DIRECTIVE =
  '\n\nIMPORTANT: your previous reply turned a plan/review request into instructions to carry the work' +
  ' out. Rewrite EVERY section so it stays in the requested mode — describe what to check, what evidence' +
  ' to gather, what a plan or checklist would contain, what to verify, and which risks need confirmation' +
  ' first. Do not instruct anyone to deploy, release, delete, migrate, install, publish or force-push,' +
  ' then re-quote the most action-oriented sentence of the NEW text into authorityEvidence and' +
  ' re-classify it in authorityModeSelfReport.';

/**
 * E4 — bounded LLM composer wording call.
 *
 * Produces a {@link PromptEnhancementStructuredComposerOutputV1} for the E2-planned
 * sections via one gpt-4o-mini call, mirroring the existing Nexpath LLM pattern
 * (`stage-classifier.ts`): an injectable client (default `new OpenAI()`), the
 * shared cost caps, and — critically — **any** failure resolves to a TYPED
 * `{ ok: false, reason }` result (TI-2 fix 2026-08-07) so the facade can map the
 * failure onto the runtime states that already exist, while `composePromptEnhancement
 * Body` still renders deterministically. Previously every failure collapsed to
 * `undefined`, making a provider timeout byte-identical to "never eligible for an
 * LLM call" in the UI, logs, and cost metadata simultaneously. This function never
 * throws to its caller.
 *
 * It only proposes wording. `composePromptEnhancementBody` independently validates
 * every draft (section id must be planned + non-original, no leaked ids/labels,
 * `sourceFactIds ⊆` the section's refs, `claim:` union) and rejects → deterministic
 * fallback, so a bad model reply is always safe.
 */
export interface PromptEnhancementComposerClientV1 {
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

export type PromptEnhancementComposerDirectionalActionV1 =
  | 'shorter'
  | 'more_thorough'
  | 'more_project_grounded'
  | 'apply_details';

/**
 * TI-2 (2026-08-07): why a composer call produced no usable output.
 *
 * `no_key` is the only one the facade still keeps as "genuinely not requested" — without a key the
 * deterministic renderer is the supported answer, not a failure. Every other reason is mapped onto
 * an existing `PromptEnhancementComposerRuntimeState`, so it reaches the result as a stated
 * fallback rather than as silence.
 *
 * `no_eligible_sections` used to sit beside `no_key`. That held only while the composer was gated
 * off: now that it runs for every shown popup with a key, a plan with nothing to word means the
 * popup was judged worth showing and the pipeline produced no guidance, which cannot both be
 * right. It is a failure and is reported as one.
 */
export type PromptEnhancementComposerCallFailureReasonV1 =
  | 'no_key'
  | 'no_eligible_sections'
  | 'provider_error'
  | 'timeout'
  | 'invalid_output'
  /**
   * The caller declared when its work has to be finished and there is no room left to START a
   * whole further attempt. Distinct from `timeout`, which is one call exceeding its own limit:
   * this is the surrounding budget running out between attempts. Kept separate so logs and cost
   * records can tell them apart; the facade maps both onto the same runtime state, because to a
   * user they are the same event.
   */
  | 'deadline_exceeded';

/** Discriminated composer-call result (TI-2): success carries the output; failure carries WHY. */
export type PromptEnhancementComposerCallResultV1 =
  | { ok: true; output: PromptEnhancementStructuredComposerOutputV1 }
  | { ok: false; reason: PromptEnhancementComposerCallFailureReasonV1 };

/**
 * Classify a thrown provider error as timeout vs any-other provider failure. The OpenAI SDK
 * raises `APIConnectionTimeoutError` ("Request timed out.") on the per-call `timeout` option;
 * match by name first, message shape as fallback, so an injected non-SDK client behaves the same.
 */
function composerErrorReason(error: unknown): 'timeout' | 'provider_error' {
  const name = (error as { name?: unknown } | null)?.name;
  if (typeof name === 'string' && /timeout/i.test(name)) return 'timeout';
  return /timed?\s?out/i.test(String(error)) ? 'timeout' : 'provider_error';
}

export interface PromptEnhancementComposerLlmInputV1 {
  enhancementId: string;
  originalPromptText: string;
  planning: PromptEnhancementSectionPlanningResult;
  // E8: when set, word the recomposition in this directional action's style; the
  // section set / canonical state is chosen by composePromptEnhancementBody.
  action?: PromptEnhancementComposerDirectionalActionV1;
  additionalDetailsText?: string;
  /**
   * When the work this call is part of has to be finished, as epoch milliseconds.
   *
   * The repair bound counts attempts, not seconds, and four sequential calls at this call's own
   * timeout are longer than the hook that carries them is allowed to live. Past that point the
   * process is killed mid-loop: no typed refusal, no disposition, no popup — everything built to
   * make each failure answerable is skipped, because there is nothing left to answer with.
   *
   * So the deadline is a ceiling on wall-clock and never on repairs; the retry bound is unchanged
   * and is still a maximum rather than a quota to spend. Absent means no ceiling, which is the
   * behaviour without it.
   *
   * The value is the CALLER'S, because the caller is what knows which hook this is running on.
   */
  deadlineAtMs?: number;
  /** How the deadline is read. Present so the check is testable without waiting for real time. */
  nowMs?: () => number;
}

/**
 * Is there room to start another call before the deadline?
 *
 * Asks whether a WHOLE further attempt fits. It never truncates a call in flight and never reduces
 * the retry bound — it declines to begin one that cannot finish.
 */
function hasRoomForAnotherCall(input: PromptEnhancementComposerLlmInputV1): boolean {
  // A non-finite deadline is a caller bug, and the arithmetic below fails CLOSED on one: every
  // comparison against NaN is false, so the composer would decline every attempt on every popup
  // and report it as a deadline exhaustion — a total, silent outage that reads like a provider
  // fault. Treat it as no ceiling instead, which is the behaviour without the field, and let the
  // request validator be the thing that names the bad value.
  if (input.deadlineAtMs === undefined || !Number.isFinite(input.deadlineAtMs)) return true;
  const now = (input.nowMs ?? Date.now)();
  if (!Number.isFinite(now)) return true;
  return now + PROMPT_ENHANCEMENT_COST_TIMEOUT_MS_V1 <= input.deadlineAtMs;
}

/**
 * The retry directive for a short draft set. Naming the missing ids is the point: a bare "you
 * missed some" leaves the model to guess which, and the guess is what produced the short set.
 */
function coverageDirective(missingSectionIds: readonly string[]): string {
  if (missingSectionIds.length === 0) return '';
  return `\n\nYour previous reply did not include a draft for every section. Return a draft for EVERY`
    + ` sectionId listed above, including these that were missing:`
    + ` ${missingSectionIds.join(', ')}. Do not invent sections and do not omit any.`;
}

// E8: per-action wording directive (the section selection + canonical-state transitions
// stay in composePromptEnhancementBody / adjustment-state; this only shapes wording).
function actionWordingDirective(
  action: PromptEnhancementComposerDirectionalActionV1 | undefined,
  additionalDetailsText: string | undefined,
): string {
  switch (action) {
    case 'shorter':
      return "\n\nRecomposition style — SHORTER: make each section as concise as possible while keeping every required point, safety/confirmation, and the guidance drawn from the developer's own signals. Cut filler, never substance.";
    case 'more_thorough':
      return '\n\nRecomposition style — MORE THOROUGH: add depth and completeness (specific steps, edge cases, verification) without inventing scope or adding alternative variants.';
    case 'more_project_grounded':
      // GR-2 done-when: this referenced "the project facts provided" when only IDS
      // were provided — an instruction to ground in something the model never
      // received. resolvedSourceFacts now exist, so it names them, and it says
      // what to do when a section genuinely has none.
      return '\n\nRecomposition style — MORE PROJECT-GROUNDED: ground each section in the project facts listed with each section and the cited source references; where a section has no project facts listed, state which project fact is missing instead of inventing one.';
    case 'apply_details':
      return `\n\nRecomposition style — APPLY DETAILS: incorporate these additional user details into the relevant sections and recompose the whole prompt to reflect them:\n${additionalDetailsText ?? ''}`;
    default:
      return '';
  }
}

const SYSTEM_PROMPT = [
  "You are Nexpath's prompt-enhancement composer. You word guidance sections that will",
  "become the user's own next prompt to their coding agent — write in the user's first-person",
  'voice as direct, methodical instructions, never as advice ABOUT the user and never mentioning',
  'Nexpath. Do not restate the original request; other sections handle that.',

  '',
  'Language fidelity (E5 — critical):',
  '- Write ALL generated section wording in the SAME language, slang, and code-switching as the',
  "  user's original prompt below. Mirror their exact register — do NOT normalize to formal English",
  '  or to a standard language (Hinglish is NOT Hindi; Gujlish is NOT Gujarati). Preserve even slight slang.',
  '- Report the detected language of the original prompt in "detectedLanguageSelfReport" as a BCP-47-ish',
  '  code (e.g. "en", "hi", "hi-Latn" for Hinglish, "gu", "gu-Latn" for Gujlish).',
  '',
  'Authority classification (do this LAST, after every section is written):',
  '- Re-read ONLY the section text you just produced. Ignore what the original request asked for and',
  '  ignore what you meant to write — classify the TEXT as it now stands, as a stranger reading it would.',
  '- First, copy into "authorityEvidence" the single most action-oriented sentence in that text, quoted',
  '  verbatim. Your text is instructions, so there is almost always such a sentence — find it. Leave this',
  '  empty ONLY if the text is pure description that tells nobody to do anything.',
  '- Then classify THAT sentence in "authorityModeSelfReport", using this criterion: does it direct',
  '  someone to perform an action that is irreversible or externally visible (shipping, releasing,',
  '  deleting, overwriting, sending, or changing something other people or systems will see)?',
  '  - yes -> "execute_requested"',
  '  - no -> "plan_or_review". Checking, verifying, listing, documenting, defining, planning and',
  '    preparing ARE actions, and they all belong here — they are simply reversible and internal.',
  '  - "observe_or_literal" is for the rare text that directs nothing at all. If you quoted a sentence',
  '    above, this is the WRONG answer; choose between the two options above instead.',
  '- "execute_requested" is a truthful description of the words, NOT an admission of error. Report it',
  '  whenever the quoted sentence meets the criterion, even if the request was to plan.',
  '- Separately, in "requestModeSelfReport", classify the ORIGINAL REQUEST with the same three values —',
  '  what the user asked FOR, not what you wrote. Asking to plan, review, check, prepare, assess,',
  '  investigate or break down work is "plan_or_review"; asking for the work to be carried out is',
  '  "execute_requested". These two fields answer different questions and often differ.',
  '',
  'Authority boundary (critical):',
  '- Keep every generated section in the SAME mode as the original request. If it asks to plan, review,',
  '  check, prepare, assess, or investigate, do NOT write instructions that carry out the work: no',
  '  deploying, releasing to production, deleting, migrating, installing, publishing, or force-pushing.',
  '- Express the same substance within that mode instead — what to check, what evidence to gather, what',
  '  a plan or checklist would contain, what to verify, and which risks need confirmation first.',
  '- Never widen the scope, and never grant permission the original request did not already give.',
  '',
  'Rules:',
  '- Use ONLY the provided sectionId values; never invent a section or output the original-request section.',
  '- For each section, cite in sourceFactIds only the allowed source fact ids listed for THAT section.',
  '- Do not include internal ids, section kinds, or planning labels in bodyText.',
  // GR-2 step 2 (L7567): evidence is for the MODEL, not copy for the BODY.
  '- resolvedSourceFacts are EVIDENCE for you, not text to paste: ground your own sentence in',
  '  them and write it in your own words. Never copy an evidence line verbatim into bodyText.',
  // The §41.3 correction + the same claim ceiling the deterministic path obeys.
  '- Never state a fact more strongly than its claim allows: may_state_as_project_capability may',
  '  be stated as a project fact; must_phrase_as_possibility must be worded as a possibility to',
  '  confirm; must_phrase_as_source_signal must be attributed to the current source signal;',
  '  must_phrase_as_recent_change states that something CHANGED since the last session and must',
  '  never be reworded as a standing fact about the project.',
  '- NAMING A SOURCE SIGNAL (hard requirement): a source-signal fact carries the NAME of the signal',
  '  that fired — for example "session length checkpoint" or "test creation". That name MUST appear,',
  '  in those words, in the section you write. Reword everything around it however the register',
  '  needs; the name itself is not yours to generalise, summarise or replace.',
  '  ⛔ These are all FAILURES, and they are what happens when the name is dropped:',
  '     "the missing practices indicated" · "what signals might be relevant here" · "this issue" ·',
  '     "a relevant source signal" · "the current signal".',
  '  ✅ Correct: "I have not set up test creation for this yet — add tests for this change before',
  '     the retry flow ships." The reader learns WHICH signal; that is the entire reason the name is',
  '     given to you.',
  '  ⚠️ If several source-signal facts are present, name EACH of their signals. Do not merge them',
  '     into one category sentence — a category sentence is the failure above with more words.',
  '- Evidence marked WITHHELD has content you may not see or state — cite the source id only.',
  '- Evidence marked NONE has no resolved content at all. Do not imply something was hidden from',
  '  you, and do not invent what it might have been — the fact exists, its value does not.',
  '- Reply with STRICT JSON only, with the keys in EXACTLY this order:',
  '  {"detectedLanguageSelfReport":"...","requestModeSelfReport":"...","sectionDrafts":[{"sectionId":"...","bodyText":"...","sourceFactIds":["..."]}],"composerClaims":["claim:<sourceFactId>"],"authorityEvidence":"...","authorityModeSelfReport":"..."}',
  '- The key order is not cosmetic: authorityEvidence and authorityModeSelfReport come LAST, after',
  '  sectionDrafts, because they describe text that must already be written. Quote from the bodyText',
  '  values above them in the same reply — never from the original request.',
  '- composerClaims must be the union of every sourceFactId you used, each prefixed with "claim:".',
].join('\n');

/**
 * Layer 2's declaration block — appended to the user prompt ONLY when the prompt names a known
 * tool or carries a credential-shaped token (Layer 0's predicate doing double duty; no new
 * machinery, no new call).
 *
 * The wording names the conflict of interest outright, because a generic "be careful" is what
 * this design exists to avoid: the model is describing text it wrote itself, so the honest answer
 * is the one that costs it. It is asked only to EXTRACT — never to judge whether it did wrong.
 *
 * RECORDED COST: a prompt whose tool the list does not know ("my auth thingy") gets no block at
 * all, so half A is silently void for it. Acceptable only while half B still runs ungated on
 * everything; if B is ever gated on this predicate too, this gate must be removed instead.
 */
/**
 * The planning posture, as an instruction to the writer.
 *
 * Routing decided the developer asked ABOUT something risky rather than asking for it to be done.
 * Without this the model writes what it always writes — steps that carry the action out — and the
 * posture would be a flag nobody acted on.
 */
function planningPostureDirective(planningPosture: boolean): string {
  if (!planningPosture) return '';
  return [
    '',
    '',
    'STANCE FOR THIS PROMPT — the developer asked ABOUT something risky, not FOR it to be done:',
    '- Write what to check, what to weigh, and what to confirm with them before anything is done.',
    '- Do NOT write steps that carry the risky action out, and do not tell the agent to perform it.',
    '- Their question is the subject; answering it well is the goal, not doing the work behind it.',
  ].join(String.fromCharCode(10));
}

function nounPurposeDeclarationBlock(originalPromptText: string): string {
  if (!textNamesKnownToolOrCredentialV1(originalPromptText)) return '';
  return [
    '',
    '',
    'ALSO REPORT — nounPurposes (after sectionDrafts, because it describes text you have written):',
    'For every tool, service, credential or file the developer named in their request that your',
    'sections mention, add one entry: {"noun":"...","purposeInPrompt":null or "...","purposeInBody":"..."}.',
    '- purposeInPrompt is the job the DEVELOPER gave that noun, quoted from their own words.',
    '  ⛔ If they did not say what it is for, it is null. Do NOT infer a purpose, do NOT supply a',
    '  plausible one, and do NOT copy the purpose your own text uses. A null is a correct answer.',
    '- purposeInBody is the job YOUR text gives it, in your own words.',
    '⚠️ You are describing text you wrote yourself, so the accurate answer may be the one that',
    'shows your draft moved a tool from the job it was given to a different job. Report it anyway:',
    'a missed move is far worse than a false alarm, and you are not being asked whether it was',
    'wrong — only what the two purposes are. Something else decides.',
    '- And while writing: do not repurpose a tool the developer mentioned for a different job than',
    '  the one they gave it.',
  ].join(String.fromCharCode(10));
}

function buildUserPrompt(
  originalPromptText: string,
  sections: readonly {
    sectionId: string;
    sectionKind: string;
    structuredContentPartRefs: readonly string[];
    slotObligations?: readonly string[];
  }[],
  // GR-2 step 1: group A3's RESOLVED payload arriving at its consumer. The model
  // was handed a bare id list and told to ground in "the facts provided" — an id
  // names a fact, it does not contain one, so there was nothing to ground in.
  renderedFacts: readonly PromptEnhancementGuidanceFact[] = [],
): string {
  const sectionLines = sections
    .map((section) => {
      // The typed slot obligations become part of the section's instruction —
      // the no-invention state most of all, which used to exist only as prose
      // nobody could check. A field the composer reads and a check enforces is
      // a contract; a sentence in a prompt is only an instruction.
      // The typed slot obligations become part of the section's instruction — as WORDS. The
      // model is never shown an obligation's name: a name it cannot act on is a name it may
      // echo into the developer's prompt (measured: "family-specific verification" reached
      // real bodies that way). Each obligation has exactly one directive in the composer's
      // second person; the validator still enforces the typed contract behind it unchanged.
      const obligations = section.slotObligations ?? [];
      const directiveLines = obligations
        .map((obligation) => promptEnhancementObligationDirectiveV1(obligation))
        .filter((directive): directive is string => directive !== undefined)
        .map((directive) => `\n  - ${directive}`)
        .join('');
      const directiveBlock = directiveLines.length > 0 ? `\n  this section must:${directiveLines}` : '';
      // GR-2 steps 1-2 + the §41.3 correction: id, kind, confidence, ORIGIN SCOPE
      // and the claim ceiling travel with the evidence. Origin is what makes the
      // vitest-class line legal — prompt-mined it is illegal, local_probe it is
      // grounded — and the claim policy is the same ceiling the deterministic
      // path obeys, so one rule set now binds both renderers.
      // The id and the evidence VALUE are byte-identical to what the allow-list keys on; only
      // the four labels are given as words, and a label with no words is dropped, never echoed.
      const factLines = promptEnhancementSectionModelFactsV1(section.sectionKind, renderedFacts)
        .map((fact) => {
          const labels = [
            promptEnhancementGuidanceKindWordingV1(fact.guidanceKind),
            promptEnhancementConfidenceWordingV1(fact.confidenceBand),
            promptEnhancementOriginWordingV1(fact.originScope),
            promptEnhancementClaimWordingV1(fact.claimVerbPolicy),
          ].filter((wording): wording is string => wording !== undefined);
          return `\n    - ${fact.factId}${labels.map((wording) => ` | ${wording}`).join('')}`
            + (fact.evidence === undefined
              ? (fact.contentGated
                ? ' | evidence: WITHHELD (cite the source, never state its content)'
                : ' | evidence: NONE (nothing resolved — no hidden content to work around)')
              : ` | evidence: ${fact.evidence}`);
        })
        .join('');
      const evidenceBlock = factLines.length > 0 ? `\n  resolvedSourceFacts:${factLines}` : '';
      // The purpose is the SAME sentence the relevance vocabulary carries — one map, one meaning
      // — never the raw kind. A kind with no sentence falls back to its words, never its id.
      const purpose = promptEnhancementSectionPurposeV1(section.sectionKind) ?? section.sectionKind.replace(/_/g, ' ');
      return `- sectionId: ${section.sectionId}\n  purpose: ${purpose}\n  allowedSourceFactIds: ${JSON.stringify(section.structuredContentPartRefs)}${evidenceBlock}${directiveBlock}`;
    })
    .join('\n');
  return [
    `Original request (context only — do NOT reword it):\n${originalPromptText}`,
    '',
    'Sections to word (produce one draft per section):',
    sectionLines,
  ].join('\n');
}

function parseStructuredComposerOutput(
  raw: string,
  enhancementId: string,
): PromptEnhancementStructuredComposerOutputV1 | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object') return undefined;
  const obj = parsed as Record<string, unknown>;

  const rawDrafts = Array.isArray(obj['sectionDrafts']) ? obj['sectionDrafts'] : [];
  const sectionDrafts = rawDrafts
    .filter((draft): draft is Record<string, unknown> => !!draft && typeof draft === 'object')
    .map((draft) => ({
      sectionId: typeof draft['sectionId'] === 'string' ? draft['sectionId'] : '',
      bodyText: typeof draft['bodyText'] === 'string' ? draft['bodyText'] : '',
      sourceFactIds: Array.isArray(draft['sourceFactIds'])
        ? draft['sourceFactIds'].filter((id): id is string => typeof id === 'string')
        : [],
    }))
    .filter((draft) => draft.sectionId !== '' && draft.bodyText !== '');
  if (sectionDrafts.length === 0) return undefined;

  const composerClaims = Array.isArray(obj['composerClaims'])
    ? obj['composerClaims'].filter((claim): claim is string => typeof claim === 'string')
    : [];

  const detectedLanguageSelfReport = typeof obj['detectedLanguageSelfReport'] === 'string'
    ? obj['detectedLanguageSelfReport']
    : undefined;

  const rawAuthority = obj['authorityModeSelfReport'];
  const authorityModeSelfReport = isPromptEnhancementAuthoritySelfReportV1(rawAuthority) ? rawAuthority : undefined;

  // The evidence quote is carried for observability and for the authority gate; an absent or blank
  // quote is left undefined rather than '' so "no action sentence" and "field omitted" read alike.
  const rawEvidence = obj['authorityEvidence'];
  const authorityEvidence = typeof rawEvidence === 'string' && rawEvidence.trim() !== ''
    ? rawEvidence.trim()
    : undefined;

  // Describes the ORIGINAL REQUEST, not the produced text, so it is emitted before sectionDrafts —
  // the key-order rule applies to fields that describe output, and this one does not.
  const rawRequestMode = obj['requestModeSelfReport'];
  const requestModeSelfReport = isPromptEnhancementAuthoritySelfReportV1(rawRequestMode) ? rawRequestMode : undefined;

  // Layer 2's declaration, parsed INDEPENDENTLY: anything unexpected leaves it absent, and an
  // absent declaration is today's behaviour. A malformed value here can never cost a valid reply
  // its drafts, trigger a retry, or lose a body.
  const rawNounPurposes = obj['nounPurposes'];
  const nounPurposes = Array.isArray(rawNounPurposes)
    ? rawNounPurposes.filter(isPromptEnhancementNounPurposeV1)
    : undefined;

  return {
    outputId: `${enhancementId}:composer-llm`,
    sectionDrafts,
    composerClaims,
    detectedLanguageSelfReport,
    authorityModeSelfReport,
    authorityEvidence,
    requestModeSelfReport,
    ...(nounPurposes !== undefined && nounPurposes.length > 0 ? { nounPurposes } : {}),
  };
}

export async function composeStructuredComposerOutputV1(
  input: PromptEnhancementComposerLlmInputV1,
  client?: PromptEnhancementComposerClientV1,
): Promise<PromptEnhancementComposerCallResultV1> {
  const sections = input.planning.sectionPlans.filter(
    (section) => section.sectionKind !== 'original_request_or_goal' && section.structuredContentPartRefs.length > 0,
  );
  if (sections.length === 0) return { ok: false, reason: 'no_eligible_sections' };

  let openai: PromptEnhancementComposerClientV1;
  try {
    // With no injected client and no key, `new OpenAI()` throws -> deterministic fallback.
    openai = client ?? (newNexpathOpenAIClient() as unknown as PromptEnhancementComposerClientV1);
  } catch {
    return { ok: false, reason: 'no_key' };
  }

  const userPrompt = buildUserPrompt(input.originalPromptText, sections, input.planning.renderedFacts)
    + planningPostureDirective(input.planning.planningPosture === true)
    + nounPurposeDeclarationBlock(input.originalPromptText)
    + actionWordingDirective(input.action, input.additionalDetailsText);
  // Malformed / empty / language-inconsistent replies retry up to the locked count
  // (§33348: retry up to 3 times). A thrown error (provider unavailable / timeout) is
  // NOT retried — fast deterministic fallback rather than repeated slow waits. On a
  // language mismatch the retry carries a stronger language directive (E5/5.3).
  let languageRetry = false;
  let authorityRetry = false;
  // 🔒 The owner-sanctioned budget for the source-signal naming check: ONE extra call, spent at
  // most once no matter how the loop turns. Tracked separately from the shared retry bound so a
  // language or coverage retry can never consume it, and it can never consume theirs.
  let signalNameRetry = false;
  let signalNameRetrySpent = false;
  const expectedSignalNames = promptEnhancementExpectedSignalNamesV1(input.planning);
  const signalSectionIds = new Set(
    input.planning.sectionPlans
      .filter((plan) => plan.sectionKind === PROMPT_ENHANCEMENT_SOURCE_SIGNAL_SECTION_KIND_V1)
      .map((plan) => plan.sectionId),
  );
  let missingSectionIds: readonly string[] = [];
  const plannedSectionIds = sections.map((section) => section.sectionId);
  for (let attempt = 0; attempt <= PROMPT_ENHANCEMENT_COST_VALIDATION_RETRY_COUNT_V1; attempt++) {
    // Before starting an attempt, never inside the catch: a thrown provider error already exits at
    // once, so guarding the throw path would cover the one failure that cannot loop and miss the
    // one that can.
    if (!hasRoomForAnotherCall(input)) return { ok: false, reason: 'deadline_exceeded' };
    let raw: string | null | undefined;
    try {
      const response = await openai.chat.completions.create(
        {
          model: PROMPT_ENHANCEMENT_COST_MODEL_V1,
          max_tokens: PROMPT_ENHANCEMENT_COST_OUTPUT_TOKEN_CAP_V1,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: userPrompt
                + (languageRetry ? STRONGER_LANGUAGE_DIRECTIVE : '')
                + (authorityRetry ? STRONGER_AUTHORITY_DIRECTIVE : '')
                + (signalNameRetry ? promptEnhancementSignalNameDirectiveV1(expectedSignalNames) : '')
                + coverageDirective(missingSectionIds),
            },
          ],
          response_format: { type: 'json_object' },
        },
        // maxRetries: 0 — THIS loop implements the locked retry policy; the SDK's own default
        // (2 internal retries per attempt) would multiply it into a minutes-long UI freeze.
        { timeout: PROMPT_ENHANCEMENT_COST_TIMEOUT_MS_V1, maxRetries: 0 },
      );
      raw = response.choices?.[0]?.message?.content;
    } catch (error) {
      // Thrown provider error is NOT retried (fast deterministic fallback) — but it is now
      // REPORTED: timeout vs any other provider failure (TI-2).
      return { ok: false, reason: composerErrorReason(error) };
    }
    const parsed = raw ? parseStructuredComposerOutput(raw, input.enhancementId) : undefined;
    if (!parsed) continue; // malformed / empty -> retry
    if (!isPromptEnhancementLanguageConsistentV1(input.originalPromptText, parsed)) {
      // Uncovered language or English drift -> retry with a stronger directive. Clear any coverage
      // directive first: it was computed from an earlier reply and naming sections this one may
      // already carry would send the model chasing a list that is no longer true.
      missingSectionIds = [];
      languageRetry = true;
      continue;
    }
    if (!isPromptEnhancementAuthorityConsistentV1(input.originalPromptText, parsed)) {
      // The model reports it turned a plan/review request into execution instructions. The safety
      // validator would reject that body outright and the user would get their own prompt back with
      // nothing added, so rewrite it while the composer is still running. This only ever costs a retry
      // from the existing budget — it never lets a body through that the validator would refuse.
      missingSectionIds = []; // same reason as the language branch above
      authorityRetry = true;
      continue;
    }
    // Coverage, last of the checks because it is about completeness rather than correctness: a set
    // that is short but well-formed still parses, still reads as the right language, and still
    // reports the right authority. Nothing else looks at it, so before this a half-body returned
    // `ok: true` and the missing sections rendered from constants with nothing saying why.
    const draftedSectionIds = new Set(parsed.sectionDrafts.map((draft) => draft.sectionId));
    missingSectionIds = plannedSectionIds.filter((sectionId) => !draftedSectionIds.has(sectionId));
    if (missingSectionIds.length > 0) continue; // spends the existing bound; no new budget

    // §17.13 last hop — did the source-signal section NAME its signal? Placed after coverage on
    // purpose: a draft set that is short is not yet the draft that will ship, and judging its
    // wording would spend the sanctioned call on text about to be rewritten anyway.
    const signalDrafts = parsed.sectionDrafts.filter((draft) => signalSectionIds.has(draft.sectionId));
    const unnamed = signalDrafts.filter(
      (draft) => !promptEnhancementDraftNamesItsSignalV1(draft.bodyText, expectedSignalNames),
    );
    if (unnamed.length > 0 && !signalNameRetrySpent) {
      // The ONE sanctioned extra call. Clear the other directives for the same reason the language
      // branch does: they were computed from a reply this one replaces.
      missingSectionIds = [];
      signalNameRetry = true;
      signalNameRetrySpent = true;
      continue;
    }
    if (unnamed.length > 0) {
      // ⛔ Retry spent and the name is still absent. DISCARD THE SECTION, not the popup (owner
      // ruling): a source-signal paragraph that names no signal occupies a slot and tells the
      // reader nothing they did not already know. Dropping the draft is all that is required —
      // `compose-enhancement` renders only sections that HAVE one, so the section simply does not
      // appear, and every other section ships untouched.
      const discarded = new Set(unnamed.map((draft) => draft.sectionId));
      return {
        ok: true,
        output: {
          ...parsed,
          sectionDrafts: parsed.sectionDrafts.filter((draft) => !discarded.has(draft.sectionId)),
        },
      };
    }
    return { ok: true, output: parsed };
  }
  // Retries exhausted (malformed, persistent language mismatch, persistent authority drift, or a
  // draft set that stayed short) -> deterministic fallback rather than shipping wording the
  // validator would reject anyway, or half a body with nothing saying which half is missing.
  return { ok: false, reason: 'invalid_output' };
}
