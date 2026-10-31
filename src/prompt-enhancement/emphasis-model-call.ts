import { newNexpathOpenAIClient } from '../config/llm-client-scope.js';
import OpenAI from 'openai';
import { redactSecrets } from '../store/redact.js';
import { SECRET_IN_TEXT } from '../classifier/mistake-categories.js';
import { maskInsertedText, NEVER_MARKED_SECTION_KINDS, TERM_ONLY_SECTION_KINDS } from './emphasis-classes.js';
import { applyPromptEnhancementEmphasisCapV1, namedActionIn } from './emphasis-locate.js';
import type { PromptEnhancementEmphasisPhraseV1 } from '../store/pending-prompt-enhancements.js';

/**
 * The optional model pass over a body that is already on screen.
 *
 * The popup never waits for this. It draws the full content with the rule-based marks at once,
 * this call is started beside it and never awaited, and whatever has settled is painted in when it
 * settles. Every way it can fail — no client, provider error, timeout, the popup closing, an
 * unparseable reply, a reply whose every phrase is discarded — comes out the same: the frame that
 * was already there, unchanged.
 *
 * ⛔ **There is no `new OpenAI()` fallback here, and that is deliberate.** The module this one is
 * shaped after has one, guarded by the reasoning "no key means it throws, so it is inert". That
 * holds on a terminal and does not hold everywhere this code runs: the browser service worker runs
 * the same engine with a key already published into its environment and a fetch shim that keeps
 * `new OpenAI()` working. Unguarded, every popup there would spend a billed call whose phrases
 * nothing can draw — that surface has no field for them. So a caller that passes neither a client
 * nor the explicit flag gets no call at all, and the test for that asserts the call is never
 * entered rather than that it failed.
 *
 * ⛔ **It never touches the store, and never changes the body.** What it returns is runtime-only,
 * marked as the model's, added to the rule-based list and never displacing one of them.
 */

export const PROMPT_ENHANCEMENT_EMPHASIS_MODEL_V1 = 'gpt-4o-mini';
export const PROMPT_ENHANCEMENT_EMPHASIS_TIMEOUT_MS_V1 = 8_000;
export const PROMPT_ENHANCEMENT_EMPHASIS_MAX_OUTPUT_TOKENS_V1 = 200;

/** The single question, as the contract fixes it. */
export const PROMPT_ENHANCEMENT_EMPHASIS_SYSTEM_PROMPT_V1 = [
  'You are given the body of a prompt a developer is about to send to a coding agent.',
  'List the phrases in it that INSTRUCT the agent to do something — to write or to read.',
  'Leave out any phrase that names a tool, service or process the developer never mentioned.',
  'Return only phrases that appear VERBATIM in the body, copied exactly, with no words added,',
  'removed or reordered. A phrase that is not an exact substring of the body is useless.',
  'Prefer short phrases: the verb and what it acts on, not a whole sentence.',
  'Reply STRICT JSON only, an object with one key:',
  '{"phrases": ["<verbatim phrase>", "..."]}',
  'Return {"phrases": []} when nothing in the body instructs the agent.',
].join('\n');

/**
 * This pass's OWN event name.
 *
 * ⛔ Never the stage classifier's. That event is what `nexpath status` reports as a provider
 * failure, and a timeout here — which costs nothing but a few unbolded words — would read there as
 * the classifier having failed, which is a different and much worse thing. The two must stay
 * distinguishable in a log, so they carry different names.
 */
export const PROMPT_ENHANCEMENT_EMPHASIS_CALL_EVENT_V1 = 'prompt_enhancement_emphasis_call';

/**
 * 🔒 **Whether this pass runs in production at all. It does not — owner's decision, 2026-09-22,
 * taken on measured numbers rather than on preference.**
 *
 * Measured against a hand-labelled set of real popups, one pass per popup:
 *
 * | | lines it should mark | wrong landings | precision |
 * |---|---|---|---|
 * | rule-based marks alone | 23 % | **0** | **1.000** |
 * | with this pass merged in | ~70 % | **18 to 28** | ~0.68 |
 *
 * So it does raise coverage — roughly threefold — and it does so by marking lines the standard
 * rejects, about one in three of what it adds. **Wrong emphasis is worse than absent emphasis**:
 * a mark is an instruction to read this, and putting one on a sentence that should not have been
 * written at all points the reader straight at the defect. The bar for wrong landings is zero and
 * the deterministic marks meet it exactly.
 *
 * ⛔ **Nothing about this pass is deleted.** It is built, tested and measurable, and the day its
 * accuracy earns the bar this constant is the single line that turns it on — which is why it is
 * one constant and not a flag repeated at each call site, where the two could drift apart.
 *
 * ⚠️ This is not a user-facing switch. That question was settled separately and none was built;
 * this is a build-time decision about which tier ships.
 */
export const PROMPT_ENHANCEMENT_EMPHASIS_TIER_SHIPS_V1 = false;

/**
 * The outcome states, kept apart so a debug run can tell "never started" from "started and gave
 * nothing" — they call for opposite responses, and an absent value that cannot distinguish them
 * answers neither.
 */
export type PromptEnhancementEmphasisModelOutcomeV1 =
  | 'gated_out_no_client'
  | 'settled'
  | 'unusable_reply'
  | 'pending_or_failed';

/** The zero-wait handle: read what has settled, abort what has not. */
export interface PromptEnhancementEmphasisModelHandleV1 {
  /** Synchronous. Empty until — and unless — a usable reply settled. */
  read(): readonly PromptEnhancementEmphasisPhraseV1[];
  /** Tear down a still-pending request. Idempotent, and a no-op once settled or never started. */
  abort(): void;
  /** Synchronous outcome at the moment of the call, for the observability record. */
  outcome(): PromptEnhancementEmphasisModelOutcomeV1;
  /** Called once with the phrases when they settle, so the caller can repaint. Never throws out. */
  onSettled(listener: () => void): void;
}

/** Minimal client surface, injectable for tests — the shape of the SDK call this makes. */
export interface PromptEnhancementEmphasisModelClientV1 {
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

/** One composed section, as this call needs to see it. */
export interface PromptEnhancementEmphasisModelSectionV1 {
  sectionKind: string;
  bodyText: string;
}

export interface PromptEnhancementEmphasisModelInputV1 {
  originalPromptText: string;
  sections: readonly PromptEnhancementEmphasisModelSectionV1[];
  /** The resolved name inside the confirmation sentence, when one was inserted. */
  sensitiveActionName?: string;
  /** Inject to drive the call in a test, or to supply a client the caller already holds. */
  client?: PromptEnhancementEmphasisModelClientV1;
  /**
   * The explicit opt-in for a caller that wants the real client constructed here. Without a client
   * AND without this, nothing is started — see the note at the top about why the absence of a key
   * is not a safe enough guard on its own.
   */
  enabled?: boolean;
  /**
   * Where this pass reports what happened to it — called exactly once, with its own event name,
   * for every outcome including the ones where nothing was started. Optional and best effort: a
   * sink that throws is swallowed, because an observability failure must never reach the popup.
   */
  onOutcome?: (event: {
    event: typeof PROMPT_ENHANCEMENT_EMPHASIS_CALL_EVENT_V1;
    outcome: PromptEnhancementEmphasisModelOutcomeV1;
    phraseCount: number;
  }) => void;
}

const report = (
  input: Pick<PromptEnhancementEmphasisModelInputV1, 'onOutcome'>,
  outcome: PromptEnhancementEmphasisModelOutcomeV1,
  phraseCount: number,
): void => {
  try {
    input.onOutcome?.({ event: PROMPT_ENHANCEMENT_EMPHASIS_CALL_EVENT_V1, outcome, phraseCount });
  } catch {
    // Observability is never allowed to reach the popup.
  }
};

const inertHandle = (
  outcome: PromptEnhancementEmphasisModelOutcomeV1,
): PromptEnhancementEmphasisModelHandleV1 => ({
  read: () => [],
  abort: () => {},
  outcome: () => outcome,
  onSettled: () => {},
});

/**
 * What the model is shown: the sections that may carry a mark at all, with the sentences the
 * pipeline wrote itself blanked out, and secrets replaced by a same-length marker.
 *
 * The developer's own restated prompt is left out because nothing there is ever marked, and the
 * inserted sentences are blanked because they already have their own marks — a phrase the model
 * cannot see is a phrase it cannot propose.
 */
export function buildPromptEnhancementEmphasisMarkableBodyV1(
  input: Pick<PromptEnhancementEmphasisModelInputV1, 'sections' | 'sensitiveActionName'>,
): string {
  // ⚠️ DERIVED when the caller does not supply it. The mask finds the confirmation sentence by
  // looking for `before you do this <naming>`, so without the naming it finds nothing and the
  // model is shown the pipeline's own safety wording — the one thing this body exists to hide.
  // No caller supplied it, so the sentence was reaching the model and phrases lifted from it came
  // back and were drawn. The floor's pass already reads the name out of the body; this reads it
  // with the same function rather than a second copy of the rule.
  const named = input.sensitiveActionName ?? namedActionIn(input.sections);
  return input.sections
    // ⛔ A TERM-ONLY section is withheld too. The model tier proposes INSTRUCTIONS, and the whole point
    // of that state is that an instruction marked there is nexpath telling itself what to do — so the
    // section it may not produce one for is a section it may not read either. Its keyword is a term the
    // floor already has from data, and the model is not asked about terms.
    .filter((section) => !NEVER_MARKED_SECTION_KINDS.has(section.sectionKind)
      && !TERM_ONLY_SECTION_KINDS.has(section.sectionKind))
    .map((section) => maskInsertedText(section.bodyText, named))
    .join('\n');
}

/** The same body as it is sent: secrets replaced by a marker of the same length. */
export function buildPromptEnhancementEmphasisModelBodyV1(
  input: Pick<PromptEnhancementEmphasisModelInputV1, 'sections' | 'sensitiveActionName'>,
): string {
  return redactSecrets(buildPromptEnhancementEmphasisMarkableBodyV1(input));
}

/** Anything off the exact shape reads as nothing — the same discipline the other parsers use. */
function parseReply(raw: string): readonly string[] | undefined {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return undefined;
  }
  const phrases = (parsed as Record<string, unknown>)?.phrases;
  if (!Array.isArray(phrases)) return undefined;
  return phrases.filter((phrase): phrase is string => typeof phrase === 'string');
}

/**
 * The output rules, in full. A phrase survives only if every one of them holds.
 *
 * ⚠️ Checked against the body as the developer will read it, not against what the model was shown:
 * a mark is drawn by finding the phrase in the live text, so a phrase that is not in that text
 * could never be drawn and must not be counted as a suggestion either.
 */
export function keepPromptEnhancementEmphasisModelPhrasesV1(input: {
  phrases: readonly string[];
  /** The body as it is drawn — every section, unmasked. */
  drawnBodyText: string;
  /** The same body with the pipeline's own sentences blanked, so those spans can be recognised. */
  markableBodyText: string;
}): readonly string[] {
  const drawn = input.drawnBodyText.toLowerCase();
  const markable = input.markableBodyText.toLowerCase();
  const kept: string[] = [];
  for (const raw of input.phrases) {
    const phrase = raw.trim();
    if (phrase.length === 0) continue;
    // Verbatim, or it cannot be found on screen and cannot be attributed.
    if (!drawn.includes(phrase.toLowerCase())) continue;
    // Inside a sentence the pipeline wrote itself: those spans have their own marks.
    if (!markable.includes(phrase.toLowerCase())) continue;
    // A marker means the redactor replaced a secret there; a secret shape means it missed one.
    // ⚠️ Matched WITHOUT the closing bracket on purpose. The redactor pads its marker to the
    // length of what it replaced and pushes the bracket to the end, so a real one reads
    // `sk-[REDACTED..............]` and a check for the literal `[REDACTED]` would miss every
    // secret long enough to need padding — which is all of them.
    if (phrase.includes('[REDACTED') || phrase.includes('[PEM-REDACTED')) continue;
    if (SECRET_IN_TEXT.test(phrase)) continue;
    if (kept.some((already) => already.toLowerCase() === phrase.toLowerCase())) continue;
    kept.push(phrase);
  }
  return kept;
}

/**
 * The rule-based marks with the model's added after them, under the one cap they share.
 *
 * ⛔ **Additive only, and that has to mean the floor is not re-judged.** The rule-based list has
 * already been through this cap, with its own attribution of each phrase to a section. Running it
 * through again here — against an attribution re-derived by searching the text — could drop one of
 * its phrases, which would be the model displacing the floor by arriving. So the floor is kept
 * whole, and the cap is spent only on what the model adds, against the budget the floor leaves.
 */
export function mergePromptEnhancementEmphasisPhrasesV1(input: {
  floor: readonly PromptEnhancementEmphasisPhraseV1[];
  model: readonly string[];
  /** The composed sections in body order, to attribute each phrase to one for the per-section cap. */
  sections: readonly PromptEnhancementEmphasisModelSectionV1[];
}): readonly PromptEnhancementEmphasisPhraseV1[] {
  const sectionOf = (text: string): number => {
    const at = input.sections.findIndex((section) => section.bodyText.toLowerCase().includes(text.toLowerCase()));
    return at < 0 ? input.sections.length : at;
  };
  // What the floor already spent, so the model competes for the remainder and nothing else.
  //
  // ⚠️ **The floor's own attribution is used when it has one.** Re-deriving it by searching the body
  // finds the FIRST section containing those words, which is not necessarily the section the cap
  // charged — the same mistake the surfaces were making until the section began travelling with the
  // phrase (2026-09-29). With two sections holding the same words, a re-derived attribution puts both
  // of the floor's marks in the first of them and then reports that section as full, so the model is
  // refused a slot the floor never actually spent there.
  //
  // Falls back to the search for a phrase that carries no section: an older stored row, or a caller
  // that built the list itself.
  const spent = input.floor.map((phrase) => ({
    phrase,
    sectionIndex: phrase.sectionIndex ?? sectionOf(phrase.text),
  }));
  const offered = input.model
    .filter((text) => !input.floor.some((phrase) => phrase.text.toLowerCase() === text.toLowerCase()))
    .map((text) => ({
      phrase: { text, emphasisClass: 1 as const, source: 'model' as const },
      sectionIndex: sectionOf(text),
    }));
  const capped = applyPromptEnhancementEmphasisCapV1([...spent, ...offered]);
  const added = capped.filter((entry) => entry.phrase.source === 'model');
  return [...input.floor, ...added.map((entry) => entry.phrase)];
}

/**
 * Start the call, or hand back the inert handle. Never throws, never leaves an unhandled
 * rejection, never asks the caller to await anything.
 */
export function startPromptEnhancementEmphasisModelCallV1(
  input: PromptEnhancementEmphasisModelInputV1,
): PromptEnhancementEmphasisModelHandleV1 {
  let client: PromptEnhancementEmphasisModelClientV1;
  if (input.client) {
    client = input.client;
  } else if (input.enabled === true) {
    try {
      client = newNexpathOpenAIClient() as unknown as PromptEnhancementEmphasisModelClientV1;
    } catch {
      return inertHandle('gated_out_no_client');
    }
  } else {
    // No client and no opt-in: nothing is started, and nothing is constructed either.
    report(input, 'gated_out_no_client', 0);
    return inertHandle('gated_out_no_client');
  }

  // Built through the exported helper rather than repeated here — two copies of "what may the
  // model see" is one copy too many, and a mutation that changed only one of them survived.
  const markableBodyText = buildPromptEnhancementEmphasisMarkableBodyV1(input);
  const drawnBodyText = input.sections.map((section) => section.bodyText).join('\n');

  const controller = new AbortController();
  let settled: readonly PromptEnhancementEmphasisPhraseV1[] = [];
  let outcome: PromptEnhancementEmphasisModelOutcomeV1 = 'pending_or_failed';
  let listener: (() => void) | undefined;
  let done = false;

  const notify = (): void => {
    try {
      listener?.();
    } catch {
      // A repaint that throws must never reach this module's caller.
    }
  };
  // ⚠️ Settling and listening race, and the call can win. A reply that arrives before the popup
  // has drawn its first frame would otherwise be silently kept: `onSettled` below fires straight
  // away in that case, rather than waiting for a settle that has already happened.
  const finish = (): void => {
    if (done) return;
    done = true;
    report(input, outcome, settled.length);
    notify();
  };

  // ⚠️ The create call itself is wrapped, not only its promise. A client that throws
  // SYNCHRONOUSLY — a broken shim, a mis-shaped injection — would otherwise escape past every
  // `.catch` below and out into the popup, which is the one thing this module promises cannot
  // happen. Found by asking the module to survive exactly that.
  let pending: Promise<{ choices: { message?: { content?: string | null } }[] }>;
  try {
    pending = client.chat.completions.create(
      {
        model: PROMPT_ENHANCEMENT_EMPHASIS_MODEL_V1,
        max_tokens: PROMPT_ENHANCEMENT_EMPHASIS_MAX_OUTPUT_TOKENS_V1,
        messages: [
          { role: 'system', content: PROMPT_ENHANCEMENT_EMPHASIS_SYSTEM_PROMPT_V1 },
          {
            role: 'user',
            content: `The developer's prompt:\n${redactSecrets(input.originalPromptText)}\n\nThe body:\n${redactSecrets(markableBodyText)}`,
          },
        ],
      },
      { timeout: PROMPT_ENHANCEMENT_EMPHASIS_TIMEOUT_MS_V1, maxRetries: 0, signal: controller.signal },
    );
  } catch {
    report(input, 'pending_or_failed', 0);
    return inertHandle('pending_or_failed');
  }

  pending
    .then((completion) => {
      const parsed = parseReply(completion.choices[0]?.message?.content ?? '');
      if (parsed === undefined) {
        outcome = 'unusable_reply';
        finish();
        return;
      }
      const kept = keepPromptEnhancementEmphasisModelPhrasesV1({
        phrases: parsed,
        drawnBodyText,
        markableBodyText,
      });
      settled = kept.map((text) => ({ text, emphasisClass: 1 as const, source: 'model' as const }));
      outcome = kept.length > 0 ? 'settled' : 'unusable_reply';
      finish();
    })
    .catch(() => {
      // Timeout, abort, provider error — indistinguishable on purpose: the frame does not change.
      settled = [];
      outcome = 'pending_or_failed';
      finish();
    });

  return {
    read: () => settled,
    outcome: () => outcome,
    onSettled: (next) => { listener = next; if (done) notify(); },
    abort: () => {
      try {
        controller.abort();
      } catch {
        // An abort can never be allowed to throw into the popup.
      }
    },
  };
}
