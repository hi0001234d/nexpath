import { redactSecrets } from '../store/redact.js';
import { isLockedProjectMemoryFactV1 } from './project-memory-facts.js';
import { promptEnhancementConfidenceBandForV1 } from './source-mix.js';
import {
  isPromptEnhancementRenderableRuntimePathV1,
  promptEnhancementGuidanceFactRefIdV1,
  promptEnhancementSectionKindForFactV1,
  type PromptEnhancementGuidanceFact,
} from './templates/section-plan.js';

/**
 * GR-1 (dev-plan §13.2 / §30.3 step 3) — the DETERMINISTIC FACT-RENDERING PATH,
 * the core of defect G4.
 *
 * 🔴 The measured defect: the deterministic renderer had no mechanism to place a
 * fact VALUE in a body. Every `line(...)` is a standing instruction, the
 * fall-through says *"Cover <heading>…"*, and `projectGroundingLine` says *"Use
 * the typed project/source metadata…"* — all three tell the reader to USE
 * grounding and none contains any. A no-key body therefore instructed about
 * facts it was holding.
 *
 * 🔴 The Phase-4 revert lesson, obeyed: a previous attempt widened the
 * projection with "no text field added" and collapsed to ONE CONSTANT LINE,
 * because every production fact carries `no_action_render_context_only`.
 * *"The missing step is RESOLUTION, not projection."* This renders group A's
 * resolved `evidence` payload — a fact with no resolved value produces NO line
 * here, and the section keeps its existing instruction. Nothing is invented to
 * fill a gap.
 *
 * The typed rules bind this path exactly as they bind the model (§41.3 / §44.1):
 * claim policy chooses the verb, anchor scope chooses the place, and the recency
 * band cannot be hidden. Deterministic — no LLM.
 */

/**
 * §32.2 step 3 says "BOUND and filter it". The filter half rides the gates below;
 * this is the bound. One oversized record would otherwise travel in full on every
 * composer call — measured, a 5,000-character value reached the model intact.
 *
 * 🔒 Sized as a TAIL bound, not a behaviour change: the measured typical evidence
 * line is ~148 characters, so this sits roughly seven times above ordinary traffic
 * and truncates nothing in normal use. Truncation is MARKED, never silent — a model
 * told a fact is complete when it is not would ground in a half-sentence.
 */
export const PROMPT_ENHANCEMENT_MODEL_EVIDENCE_MAX_CHARS_V1 = 1_000;

/**
 * The delimited, bounded value. The truncation mark sits OUTSIDE the quotes on
 * purpose: inside, it reads as part of the value the model is grounding in, and a
 * value could counterfeit it to look complete.
 */
function quotedBoundedEvidenceV1(text: string): string {
  if (text.length <= PROMPT_ENHANCEMENT_MODEL_EVIDENCE_MAX_CHARS_V1) return `"${text}"`;
  return `"${text.slice(0, PROMPT_ENHANCEMENT_MODEL_EVIDENCE_MAX_CHARS_V1)}" [truncated_evidence_read_the_source]`;
}

/**
 * 🔒 A fact VALUE is data. Before this phase only IDS travelled to the model, so a
 * value could not shape the prompt; now it can, and the payload block is a
 * line-and-pipe structure that a value was able to WRITE INTO.
 *
 * MEASURED, both forms:
 * - a newline inside a value forged a SECOND `resolvedSourceFacts` entry the planner
 *   never authorised — attacker-chosen id, origin, claim ceiling and content
 *   (`deploy_command = kubectl delete ns prod`);
 * - a `|` inside a value forged FIELDS on its own line: a possibility-clamped
 *   `recent_prompt_history` fact re-stated itself as
 *   `claim: may_state_as_project_capability | origin: local_probe`, which is exactly
 *   the §41.3 illegality this phase exists to prevent.
 *
 * So the value is flattened to one line and DELIMITED with quotes: a pipe inside
 * quotes is visibly part of the value rather than a new field, and no value can
 * open a line. Content is preserved — pipes are common in real commands — with only
 * embedded quotes normalized so the delimiter itself cannot be closed early.
 *
 * ⚠️ This closes STRUCTURAL forgery. It does not make an instruction-shaped value
 * harmless prose; that is a wording-policy question, recorded for its owner.
 */
function payloadFieldSafeV1(text: string): string {
  return text.replace(/\s+/g, ' ').replaceAll('"', "'").trim();
}

/** Per-fact gates (§35 / §43.1). A gated fact never reaches wording at all. */
function isRenderableValueFactV1(fact: PromptEnhancementGuidanceFact): boolean {
  // A6 / L4970: *"unknown/hidden runtime path must never drive rendered guidance"*. This is the
  // seam where a fact's VALUE becomes body text, so the gate belongs here rather than as a
  // predicate nobody calls — which is exactly what A6 shipped until verification round 1.
  // ⚠️ ABSENT is not unknown: a producer that never stamped the path has not declared a hidden
  // one, and treating the two alike would silence every unstamped producer.
  if (!isPromptEnhancementRenderableRuntimePathV1(fact.sourceRuntimePath)) return false;
  if (fact.privacyClass === 'do_not_render' || fact.sanitizationState === 'unsafe_to_render') return false;
  if (fact.claimVerbPolicy === 'do_not_render') return false;
  if (fact.renderPolicy === 'suppress_with_reason' || fact.renderPolicy === 'metadata_only') return false;
  if (fact.priority === 'suppressed') return false;
  return true;
}

/**
 * Reference-only facts state THAT a source exists, never its content
 * (`sensitive_ref_only`, `source_label_only`, and the served-provenance role).
 */
function isReferenceOnlyV1(fact: PromptEnhancementGuidanceFact): boolean {
  return (
    fact.privacyClass === 'sensitive_ref_only' ||
    fact.privacyClass === 'sensitive_suppress' ||
    fact.claimVerbPolicy === 'source_label_only' ||
    fact.factRole === 'served_variant_provenance_only'
  );
}

/** Where the knowledge is anchored — A4: a machine fact is never project architecture. */
function anchorPhraseV1(fact: PromptEnhancementGuidanceFact): string {
  switch (fact.sourceAnchorScope) {
    case 'machine_environment': return ' on this machine';
    case 'project_root': return ' in this project';
    case 'session_behavior': return ' in this session';
    case 'longitudinal_user_behavior': return ' in your recent work';
    case 'content_template_scope': return ' for this signal';
    default: return '';
  }
}

/**
 * L4977 honesty: stale/historical CANNOT be hidden. A months-old recollection
 * says so in the body rather than reading like something observed just now.
 */
function recencyPhraseV1(fact: PromptEnhancementGuidanceFact): string {
  switch (fact.recencyBand) {
    case 'historical': return ' (from earlier project history, not re-checked now)';
    case 'recent_project': return ' (from a recent project check)';
    case 'current_session': return ' (seen earlier this session)';
    case 'unknown': return ' (recency unknown)';
    default: return '';
  }
}

/**
 * The claim verb, from `claimVerbPolicy` — the same ceiling the composer prompt
 * puts on the model. A possibility-clamped fact may never be stated flatly.
 */
function claimSentenceV1(fact: PromptEnhancementGuidanceFact, key: string, value: string): string {
  const where = anchorPhraseV1(fact);
  const when = recencyPhraseV1(fact);
  switch (fact.claimVerbPolicy) {
    case 'may_state_as_user_practice':
      return `Your established practice${where}: ${key} is ${value}${when}.`;
    case 'may_state_as_project_capability':
      return `Known project fact${where}: ${key} is ${value}${when}.`;
    case 'must_have_behaviour_verified_practice':
      return `Behaviour-verified practice${where}: ${key} is ${value}${when}.`;
    case 'must_phrase_as_possibility':
      return `${key} appears to be ${value}${where}${when} — confirm before relying on it.`;
    case 'must_phrase_as_source_signal':
      return `The current source signal reports ${key} as ${value}${where}${when}.`;
    case 'must_phrase_as_recent_change':
      // The movement phrase IS the value ("was acquired", "changed to 22"), so it reads as a
      // verb clause rather than a state. ⚠️ No `when` here: "since the last session" already
      // states the recency, and a second recency phrase would date the same claim twice.
      return `The current source signal reports ${key} ${value}${where} since the last session.`;
    default:
      // Unknown or unset policy: the weakest wording, never a flat claim.
      return `${key} appears to be ${value}${where}${when} — confirm before relying on it.`;
  }
}

/**
 * The lines a section states from its own facts. Empty when nothing applies —
 * the caller then keeps the section's existing instruction, so a section with no
 * resolved fact is untouched by GR-1.
 */
export function promptEnhancementFactValueLinesV1(
  sectionKind: string,
  facts: readonly PromptEnhancementGuidanceFact[],
): readonly string[] {
  const lines: string[] = [];
  for (const fact of facts) {
    // §17.7: ask the PLANNER's resolution, never the raw field. A content-carrying fact ships
    // `targetSectionKind` empty and is placed by its action, so reading the field raw drops it from
    // the very section it was planned into. All THREE readers here must agree — the grounded-values
    // allow-list included, or it would permit a value the body never contained.
    if (promptEnhancementSectionKindForFactV1(fact) !== sectionKind) continue;
    if (!isRenderableValueFactV1(fact)) continue;
    if (isReferenceOnlyV1(fact)) {
      // States THAT the source exists; never its content.
      lines.push(`A ${fact.sourceType.replaceAll('_', ' ')} source applies here; its content is withheld and must not be guessed.`);
      continue;
    }
    const evidence = fact.evidence;
    // ⛔ RESOLUTION, not projection: no resolved value means no line. The section
    // keeps its standing instruction rather than gaining an empty claim.
    if (!evidence || evidence.value.trim().length === 0) continue;
    // Defence in depth, matching the producer. `evidenceForGuidanceFact` already
    // redacts on the way in, so a production value arrives clean — but this is
    // the LAST hop before body text, and it renders whatever fact it is handed.
    // Without it a credential-shaped value reaches the body, the safety
    // validator's secret-literal patterns reject the whole body, and the user
    // loses the popup entirely rather than seeing a masked value.
    lines.push(claimSentenceV1(fact, evidence.key.replaceAll('_', ' '), redactSecrets(evidence.value.trim())));
  }
  return lines;
}

/**
 * The resolved VALUES a section legitimately states — the allow-list companion to
 * the lines above. Same gates: a withheld or reference-only fact contributes no
 * value, so nothing gated can be smuggled into the invention allow-list.
 */
export function promptEnhancementGroundedValuesV1(
  sectionKind: string,
  facts: readonly PromptEnhancementGuidanceFact[],
): readonly string[] {
  const values: string[] = [];
  for (const fact of facts) {
    // §17.7: ask the PLANNER's resolution, never the raw field. A content-carrying fact ships
    // `targetSectionKind` empty and is placed by its action, so reading the field raw drops it from
    // the very section it was planned into. All THREE readers here must agree — the grounded-values
    // allow-list included, or it would permit a value the body never contained.
    if (promptEnhancementSectionKindForFactV1(fact) !== sectionKind) continue;
    if (!isRenderableValueFactV1(fact) || isReferenceOnlyV1(fact)) continue;
    // Must match what the renderer states, or the allow-list would permit a raw
    // value the body never contained and miss the masked one it does.
    const value = fact.evidence?.value.trim();
    if (value) values.push(redactSecrets(value));
  }
  return values;
}

/**
 * GR-2 step 1: the RESOLVED facts a section may cite, for the MODEL's prompt.
 *
 * Same gates as the body renderer, deliberately: a fact that may not be rendered
 * may not be shown to the model either — the prompt is an outbound surface, so a
 * withheld value must not travel there under the excuse that "the model decides".
 * Reference-only facts are included WITHOUT their value, so the model knows a
 * source exists and can cite it without seeing content it may not use.
 */
export function promptEnhancementSectionModelFactsV1(
  sectionKind: string,
  facts: readonly PromptEnhancementGuidanceFact[],
): readonly {
  readonly factId: string;
  readonly guidanceKind: string;
  readonly confidenceBand: string;
  readonly originScope: string;
  readonly claimVerbPolicy: string;
  readonly evidence: string | undefined;
  /**
   * TRUE when content exists and policy withholds it; FALSE when nothing resolved.
   *
   * ⚠️ Both reach the composer as an absent evidence string, and telling the model they are
   * the same thing is a lie in one direction: 'WITHHELD' asserts there IS something it may
   * not see, so a fact that simply had no value made the model write around an imagined
   * secret. That is measurable in the sim bodies (§17.13).
   */
  readonly contentGated: boolean;
  /** A decision the developer locked (Feature 1 memory): binding, and conflicts must be flagged. */
  readonly lockedDecision: boolean;
}[] {
  const out: {
    factId: string; guidanceKind: string; confidenceBand: string;
    originScope: string; claimVerbPolicy: string; evidence: string | undefined;
    contentGated: boolean; lockedDecision: boolean;
  }[] = [];
  for (const fact of facts) {
    // §17.7: ask the PLANNER's resolution, never the raw field. A content-carrying fact ships
    // `targetSectionKind` empty and is placed by its action, so reading the field raw drops it from
    // the very section it was planned into. All THREE readers here must agree — the grounded-values
    // allow-list included, or it would permit a value the body never contained.
    if (promptEnhancementSectionKindForFactV1(fact) !== sectionKind) continue;
    // A gated fact is WITHHELD here, never OMITTED. The planner's citable list keys
    // on `renderPolicy` alone, so a fact gated by privacy, sanitization, claim policy
    // or priority still reaches the model as an ALLOWED id — and with no entry beside
    // it, the model could cite a fact it has never seen and write a sentence that
    // wears the citation without being sourced by it. Withholding says plainly that
    // the content exists and may not be stated; no gated value travels either way.
    const referenceOnly = !isRenderableValueFactV1(fact) || isReferenceOnlyV1(fact);
    const value = fact.evidence?.value.trim();
    out.push({
      // §32.3's payload reads `id: guidance_fact:fact-debug-repro` — the CITABLE
      // id, not the bare one. Showing a different string beside the evidence than
      // the one the citation contract accepts is an invitation to cite the wrong
      // one, and that costs the entire reply.
      factId: promptEnhancementGuidanceFactRefIdV1(fact.factId),
      // §32.3's payload names the fact's PURPOSE here (`debug_evidence`,
      // `project_grounding`) — which is what changes how a sentence should be
      // worded, `safety_or_confirmation` most of all. Provenance is not lost: the
      // origin scope below says where the knowledge came from, more precisely than
      // the producer taxonomy did.
      guidanceKind: fact.guidanceKind,
      // Derived rather than 'unknown': the band is a lossless re-encoding of the
      // evidence state (strong→high …), so a fact that reached here without passing
      // the mixer would otherwise be reported as confidence we do not have — a claim
      // about our own knowledge, and a false one. No production path hits this (the
      // facade and the outcome builder both mix first); defence in depth.
      confidenceBand: fact.confidenceBand ?? promptEnhancementConfidenceBandForV1(fact),
      originScope: fact.sourceOriginScope ?? 'unknown',
      claimVerbPolicy: fact.claimVerbPolicy ?? 'must_phrase_as_possibility',
      // Reference-only IS the gated case: sensitive treatments and `source_label_only` say the
      // content exists and may not be stated. Anything else with no value simply has none.
      contentGated: referenceOnly,
      lockedDecision: isLockedProjectMemoryFactV1(fact),
      evidence: referenceOnly || !value
        ? undefined
        // Order matters: redact the secret, flatten the structure, bound the length,
        // and only then quote — so the closing quote and the truncation mark cannot
        // themselves be cut off, and a bounded value still reads as one field.
        : `${payloadFieldSafeV1(fact.evidence!.key)} = ${quotedBoundedEvidenceV1(payloadFieldSafeV1(redactSecrets(value)))}`,
    });
  }
  return out;
}
