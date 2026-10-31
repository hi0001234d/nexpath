import { isPromptEnhancementProjectMemoryFactV1 } from './project-memory-facts.js';
import type { PromptEnhancementPrepareRequestV1 } from './contracts.js';
import { redactSecrets } from '../store/redact.js';
import type {
  PromptEnhancementGuidanceFact,
  PromptEnhancementGuidanceSourceType,
  PromptEnhancementSourceOriginScope,
  PromptEnhancementClaimVerbPolicy,
  PromptEnhancementFactRole,
  PromptEnhancementSourceAnchorScope,
  PromptEnhancementSourceLaneV1,
  PromptEnhancementConfidenceBandV1,
  PromptEnhancementRecencyBandV1,
} from './templates/section-plan.js';
import {
  isPromptEnhancementPopupEligibleFactV1,
  type PromptEnhancementSelectionStateV1,
  isPromptEnhancementSourceCriticalFactV1,
  PROMPT_ENHANCEMENT_KNOWN_SOURCE_TYPES_V1,
} from './templates/section-plan.js';

/**
 * transform-rule-2 split 1 — dual-lane source mixer (E2 / phase 2.2).
 *
 * Takes the ranked guidance facts from {@link buildPromptEnhancementGuidanceFactsV1}
 * (phase 2.1) and applies the locked transform-rule-2 source-mixing model deterministically
 * before any composer wording:
 *
 *  - Source A (missing-practice / required-survivor lane): stage/absence, memory,
 *    content-template. Exactly one `selected_required` survivor anchors a shown popup.
 *  - Source B (grounding lane): hard facts, RIGHT/GOOD, work-style. Selected only
 *    after the Source A survivor is known; it grounds, it never chooses the objective.
 *
 * Caps (split-1 defaults, transform-rule-2): requiredSourceAFacts = 1; supportingSourceAFacts
 * 0-1 (up to 2 for More thorough / high-risk); sourceBFacts 0-2 (up to 3 for More
 * project-grounded / More thorough); total rendered <= 5. Facts over cap become
 * `deferred_to_handoff` / `selected_source_label_only` / `suppressed_by_payload_cap`
 * with a reason code — never hidden generated prose, and a high-risk / source-critical
 * Source A fact is never downgraded to invisible metadata to satisfy the 5-cap.
 *
 * The DR2-G1 no-filler skip is expressed here as {@link showPopup}=false with a
 * `no_useful_source_a_skip` / `source_b_only_no_popup` profile; phase 2.3 turns that
 * into the actual `skip_no_popup` disposition. Selection is deterministic — no LLM.
 */
/**
 * The eight LOCKED mix profiles (the source rule split-1, L5002-5011), declared as a VALUE
 * so a fixture can compare the shipped set against the locked table at runtime —
 * the type is derived from it, so the two cannot drift apart. As a type alone the
 * union was unverifiable from a test: test files are not typechecked, so a ninth
 * profile could be added, or one removed, with every "no more, no fewer" assertion
 * still green. Same idiom as the risk-kind lists in `safety-sendability.ts`.
 */
export const PROMPT_ENHANCEMENT_LOCKED_MIX_PROFILES_V1 = [
  'no_useful_source_a_skip',
  'source_a_only',
  'source_a_with_light_grounding',
  'balanced_dual_source',
  'source_a_heavy_high_risk',
  'source_b_only_no_popup',
  'over_token_or_source_cap_compressed',
  'source_invalid_fallback',
] as const;

export type PromptEnhancementSourceMixProfile = typeof PROMPT_ENHANCEMENT_LOCKED_MIX_PROFILES_V1[number];

// MODULE-PRIVATE on purpose. This is the selection GROUPING, not lane semantics —
// the locked three-value lane lives on the fact. Exporting a two-value lane type
// from a phase whose point is three lanes invites the collapse straight back in.
type PromptEnhancementSourceMixLane = 'source_a' | 'source_b';

export type PromptEnhancementSourceMixSelectionRole =
  | 'selected_required'
  | 'selected_supporting'
  | 'deferred_to_handoff'
  | 'selected_source_label_only'
  | 'suppressed_by_payload_cap';

export interface PromptEnhancementSourceMixFact {
  fact: PromptEnhancementGuidanceFact;
  /**
   * ⛔ No `lane` field here. It used to carry a SECOND, two-value lane beside
   * the fact's own three-value `sourceLane` — the very collapse A5 undoes,
   * re-exposed on the result. The done-when is that no stand-in for lane
   * semantics remains, so consumers read `entry.fact.sourceLane`. The two-bucket
   * split still exists inside this module as a SELECTION grouping, derived from
   * the fact's lane rather than defining one.
   */
  selectionRole: PromptEnhancementSourceMixSelectionRole;
  selectionReasonCode: string;
}

export interface PromptEnhancementSourceMixResult {
  profile: PromptEnhancementSourceMixProfile;
  showPopup: boolean;
  requiredSurvivor: PromptEnhancementGuidanceFact | null;
  renderedFacts: readonly PromptEnhancementGuidanceFact[];
  classifiedFacts: readonly PromptEnhancementSourceMixFact[];
}

const SOURCE_A_TYPES: ReadonlySet<PromptEnhancementGuidanceSourceType> = new Set([
  'stage_transition',
  'absence_signal',
  'content_template_record',
  'content_template_runtime_fact',
  'persistent_missing_signal_memory',
]);

const TOTAL_FACT_CAP = 5;

/**
 * The label-only exclusions that were about GROUNDING and were mis-implemented as invisibility.
 *
 * 🔒 Owner ruling, 2026-08-20. Each of these reasons means "this must not count as independent
 * grounding" — the lane's own comment says such facts *"stay VISIBLE as source labels"*, and the
 * visibility half was never built. `source_critical_over_cap_kept_visible` is the sharpest case: it
 * exists so a safety fact is *"never downgraded to invisible metadata"*, and it was doing exactly
 * that.
 *
 * ⛔ Deliberately NOT listed: `stale_or_unknown_not_grounding`. A stale or unknown probe value that
 * states itself is worse than silence, and its exclusion is a separate locked decision with its own
 * fixture. Widening this set to it would be re-deciding a rule nobody asked about.
 */
const LABEL_ONLY_REASONS_THAT_RENDER_V1: ReadonlySet<string> = new Set([
  'negative_capability_safety_not_grounding',
  'prompt_derived_not_independent_grounding',
  'source_critical_over_cap_kept_visible',
]);

const RENDERABLE_PRIORITIES: ReadonlySet<PromptEnhancementGuidanceFact['priority']> = new Set([
  'required_survivor',
  'high',
  'normal',
  'low',
]);

/**
 * A5 (L4965): the fact's own lane, from the three LOCKED values.
 *
 * Before A5 the only lane notion was the two-value mixer local below, which
 * collapsed the NEUTRAL lane into grounding: a fact known only from the user's
 * own prompt was labelled `source_b` — the same label an independently
 * corroborated project fact carries. The wording clamp already stopped it
 * CLAIMING project knowledge, but nothing recorded that it was a different kind
 * of thing. This makes the distinction explicit and un-collapsible.
 */
export function promptEnhancementSourceLaneForV1(
  fact: PromptEnhancementGuidanceFact,
): PromptEnhancementSourceLaneV1 {
  if (SOURCE_A_TYPES.has(fact.sourceType)) return 'source_a_missing_practice';
  // The user's own prompt is neither a missing practice nor independent
  // grounding — it is the original, and it is the third locked lane.
  if (fact.sourceType === 'prompt_derived_fact') return 'source_neutral_original';
  if (fact.sourceOriginScope === 'current_prompt' || fact.sourceOriginScope === 'original_point_inventory') {
    return 'source_neutral_original';
  }
  return 'source_b_grounding';
}

/** A5 (L4976): the band, from the fact's own typed evidence state. */
export function promptEnhancementConfidenceBandForV1(
  fact: PromptEnhancementGuidanceFact,
): PromptEnhancementConfidenceBandV1 {
  switch (fact.sourceEvidenceState) {
    case 'strong': return 'high';
    case 'partial': return 'medium';
    case 'weak_low_risk':
    case 'weak_source_critical':
    case 'conflicting': return 'low';
    default: return 'unknown';
  }
}

/**
 * A5 (L4977): 🔴 *"stale/historical cannot be hidden"*. Derived from the fact's
 * origin scope, which already records WHERE the knowledge came from — so a
 * months-old memory can no longer look identical to current-prompt evidence.
 */
export function promptEnhancementRecencyBandForV1(
  fact: PromptEnhancementGuidanceFact,
): PromptEnhancementRecencyBandV1 {
  switch (fact.sourceOriginScope ?? DEFAULT_ORIGIN_BY_SOURCE_TYPE[fact.sourceType]) {
    case 'current_prompt':
    case 'original_point_inventory': return 'current_prompt';
    case 'recent_prompt_history':
    case 'transcript_corroboration': return 'current_session';
    case 'local_probe':
    case 'content_template_runtime':
    case 'content_template_registry': return 'recent_project';
    case 'stored_memory':
    case 'longitudinal_param_events': return 'historical';
    default: return 'unknown';
  }
}

function laneFor(fact: PromptEnhancementGuidanceFact): PromptEnhancementSourceMixLane {
  // READS the fact's lane — it does not re-derive one. The done-when is that no
  // local stands in for lane semantics the lock puts ON the fact, so once the
  // field exists it must be the authority; deriving here again would leave the
  // field decorative. The fallback covers only un-normalized fixture facts.
  const lane = fact.sourceLane ?? promptEnhancementSourceLaneForV1(fact);
  // The internal two-bucket split the selection logic has always used. Source
  // NEUTRAL rides the B bucket for SELECTION exactly as it did before A5 (it is
  // clamped to label-only and never consumes a grounding slot), so behaviour is
  // unchanged — but the fact now carries the honest three-value lane.
  return lane === 'source_a_missing_practice' ? 'source_a' : 'source_b';
}

// ── Tier-1 evidence-field normalization ──────────────────────────────────────
// Every fact entering the mix carries sourceOriginScope / claimVerbPolicy /
// factRole. Producers set them; legacy or fixture facts get deterministic
// defaults here, and the prompt-derived clamp below enforces the lane boundary:
// a fact known only from prompt text may never claim practice or project
// capability uncorroborated — its policy is clamped to possibility wording.

const DEFAULT_ORIGIN_BY_SOURCE_TYPE: Record<PromptEnhancementGuidanceSourceType, PromptEnhancementSourceOriginScope> = {
  stage_transition: 'current_prompt',
  absence_signal: 'current_prompt',
  content_template_record: 'content_template_registry',
  content_template_runtime_fact: 'content_template_runtime',
  persistent_missing_signal_memory: 'stored_memory',
  hard_fact: 'local_probe',
  right_good_pattern: 'longitudinal_param_events',
  work_style_fact: 'longitudinal_param_events',
  prompt_derived_fact: 'current_prompt',
};

const DEFAULT_POLICY_BY_SOURCE_TYPE: Record<PromptEnhancementGuidanceSourceType, PromptEnhancementClaimVerbPolicy> = {
  stage_transition: 'must_phrase_as_source_signal',
  absence_signal: 'must_phrase_as_source_signal',
  content_template_record: 'must_phrase_as_source_signal',
  content_template_runtime_fact: 'must_phrase_as_source_signal',
  persistent_missing_signal_memory: 'must_phrase_as_source_signal',
  hard_fact: 'must_phrase_as_possibility',
  right_good_pattern: 'must_phrase_as_possibility',
  work_style_fact: 'source_label_only',
  prompt_derived_fact: 'must_phrase_as_possibility',
};

const DEFAULT_ANCHOR_BY_SOURCE_TYPE: Record<PromptEnhancementGuidanceSourceType, PromptEnhancementSourceAnchorScope> = {
  stage_transition: 'current_prompt_scope',
  absence_signal: 'current_prompt_scope',
  content_template_record: 'content_template_scope',
  content_template_runtime_fact: 'content_template_scope',
  persistent_missing_signal_memory: 'longitudinal_user_behavior',
  // An env fact without a boundary-stamped anchor is UNANCHORED — its certainty
  // is suppressed below, per the anchor rule.
  hard_fact: 'unknown_anchor',
  right_good_pattern: 'longitudinal_user_behavior',
  work_style_fact: 'longitudinal_user_behavior',
  prompt_derived_fact: 'current_prompt_scope',
};

function defaultFactRole(fact: PromptEnhancementGuidanceFact): PromptEnhancementFactRole {
  if (laneFor(fact) === 'source_a') {
    return fact.priority === 'required_survivor' ? 'required_source_signal_survivor' : 'supporting_missing_practice';
  }
  switch (fact.sourceType) {
    case 'right_good_pattern': return 'positive_practice_preservation';
    case 'work_style_fact':    return 'neutral_style_support';
    default:                   return 'project_grounding_support';
  }
}

/** Policies stronger than possibility wording — illegal for prompt-only knowledge. */
const PROJECT_KNOWLEDGE_POLICIES: ReadonlySet<PromptEnhancementClaimVerbPolicy> = new Set([
  'may_state_as_user_practice',
  'may_state_as_project_capability',
  'must_have_behaviour_verified_practice',
]);

export function normalizePromptEnhancementTier1FieldsV1(
  fact: PromptEnhancementGuidanceFact,
): PromptEnhancementGuidanceFact {
  const sourceOriginScope = fact.sourceOriginScope ?? DEFAULT_ORIGIN_BY_SOURCE_TYPE[fact.sourceType];
  let claimVerbPolicy = fact.claimVerbPolicy ?? DEFAULT_POLICY_BY_SOURCE_TYPE[fact.sourceType];
  // Prompt-derived lane boundary: knowledge from prompt text alone must never be
  // phrased as project knowledge — clamp to possibility wording, whatever was asked.
  const promptOnly = sourceOriginScope === 'current_prompt' || sourceOriginScope === 'recent_prompt_history';
  if (promptOnly && PROJECT_KNOWLEDGE_POLICIES.has(claimVerbPolicy)) {
    claimVerbPolicy = 'must_phrase_as_possibility';
  }
  // Served rows are provenance only — never practice proof, never instruction prose.
  const served = sourceOriginScope === 'served_variant_identity';
  if (served) claimVerbPolicy = 'source_label_only';
  const sourceAnchorScope = fact.sourceAnchorScope ?? DEFAULT_ANCHOR_BY_SOURCE_TYPE[fact.sourceType];
  // Anchor rules: a MACHINE fact never makes a project or practice claim, and an
  // UNANCHORED env fact has its certainty suppressed — uncertainty phrasing only.
  // Deliberately NO project_root+practice clamp here: practice wording on an env
  // fact exists only via behaviour-corroborated tier-P promotion (the registry's
  // policy assignment), and this seam cannot distinguish a promoted fact from a
  // smuggled one — a clamp would undo legitimate tier-P wording. Do not add one.
  if (sourceAnchorScope === 'machine_environment' && PROJECT_KNOWLEDGE_POLICIES.has(claimVerbPolicy)) {
    claimVerbPolicy = 'must_phrase_as_possibility';
  }
  if (fact.sourceType === 'hard_fact' && sourceAnchorScope === 'unknown_anchor' && PROJECT_KNOWLEDGE_POLICIES.has(claimVerbPolicy)) {
    claimVerbPolicy = 'must_phrase_as_possibility';
  }
  const withTier1 = {
    ...fact,
    sourceOriginScope,
    claimVerbPolicy,
    sourceAnchorScope,
    factRole: fact.factRole ?? (served ? 'served_variant_provenance_only' : defaultFactRole(fact)),
  };
  // A5 tier-2/3: normalized here for the same reason the tier-1 trio is — no
  // fact reaches selection without them, and producers may still set them.
  return {
    ...withTier1,
    // Producers may set the lane, but prompt-only knowledge can never be
    // RELABELLED into a lane it cannot occupy — the same boundary the claim
    // clamp above enforces for wording, applied to the lane itself.
    sourceLane: promptEnhancementSourceLaneForV1(withTier1) === 'source_neutral_original'
      ? 'source_neutral_original'
      : fact.sourceLane ?? promptEnhancementSourceLaneForV1(withTier1),
    confidenceBand: fact.confidenceBand ?? promptEnhancementConfidenceBandForV1(withTier1),
    recencyBand: fact.recencyBand ?? promptEnhancementRecencyBandForV1(withTier1),
  };
}

/** High-risk / source-critical facts must never be downgraded to invisible metadata. */
// One definition, shared with the mixer/gate and F3's never-faded guard.
const isSourceCritical = isPromptEnhancementSourceCriticalFactV1;

/** Invalid/unsafe facts (missing source ids, unrenderable) are rejected before mixing. */
function isValidFact(fact: PromptEnhancementGuidanceFact): boolean {
  return (
    // L4966: an UNKNOWN source kind FAILS. Without this an unrecognised fact was
    // accepted and rendered as `source_b_grounding` — foreign provenance
    // presenting as project grounding. It rides the existing invalid-source
    // rejection rather than a new gate, so the locked downgrade path is unchanged.
    PROMPT_ENHANCEMENT_KNOWN_SOURCE_TYPES_V1.has(fact.sourceType) &&
    fact.sourceIds.length > 0 &&
    fact.privacyClass !== 'do_not_render' &&
    fact.sanitizationState !== 'unsafe_to_render' &&
    // Ids must be stable keys or redacted fingerprints, NEVER a raw sensitive
    // literal — a secret-shaped id invalidates the fact, which rides the existing
    // invalid-source rejection (rerun/skip with reason), the locked downgrade path.
    fact.sourceIds.every((id) => redactSecrets(id) === id)
  );
}

function capsForLevel(
  levelState: PromptEnhancementPrepareRequestV1['userPreferenceContext']['levelState'],
): { supportingSourceA: number; sourceB: number } {
  switch (levelState) {
    case 'more_thorough':
      return { supportingSourceA: 2, sourceB: 3 };
    case 'more_project_grounded':
      return { supportingSourceA: 1, sourceB: 3 };
    default:
      return { supportingSourceA: 1, sourceB: 2 };
  }
}

/**
 * A6 / L4979 — the payload weight estimate.
 *
 * "Estimated RELATIVE token/input/source payload weight" for cap accounting and call-visibility token
 * visibility. Deliberately a coarse local estimate from what the fact actually carries (its
 * evidence text and source ids), not a tokenizer call: the locks call it an ESTIMATE used for caps
 * and visibility, and ⛔ it must never become product-cost control (L4979's gate, prohibition 9).
 */
export function estimatePromptEnhancementPayloadWeightV1(
  fact: PromptEnhancementGuidanceFact,
): number {
  const evidenceChars = (fact.evidence?.key.length ?? 0) + (fact.evidence?.value.length ?? 0);
  const sourceIdChars = fact.sourceIds.reduce((sum, id) => sum + id.length, 0);
  // ~4 chars per token is the standard coarse approximation; the number is relative, so the
  // constant only has to be consistent across facts.
  return Math.ceil((evidenceChars + sourceIdChars) / 4);
}

/**
 * A6 (L4981-4982 · L4964 · L4979): PROMOTE the mixer's decision onto each fact.
 *
 * The done-when is that nothing lives only as a mixer local — a consumer holding a fact must see
 * why it was selected, suppressed, deferred or invalidated without re-deriving it from the result
 * envelope. `sourceMixFactId` and `payloadWeight` ride the same pass, because this is the one place
 * that sees every fact exactly once.
 *
 * ⚠️ Called before EVERY return, not just the final one. A6 first promoted only on the success
 * path, so every skip — no Source-A survivor, Source-B-only, invalid-source fallback — returned
 * classified facts carrying none of the tier-4 fields. That is precisely where observability is
 * wanted: a skipped popup is the case someone needs explained.
 */
function promotePromptEnhancementMixDecisionV1(
  classified: readonly PromptEnhancementSourceMixFact[],
  mixRunId: string,
): void {
  for (const entry of classified) {
    const promoted = entry.fact as { -readonly [K in keyof PromptEnhancementGuidanceFact]: PromptEnhancementGuidanceFact[K] };
    promoted.selectionState = entry.selectionRole as PromptEnhancementSelectionStateV1;
    promoted.selectionReasonCodes = [entry.selectionReasonCode];
    promoted.sourceMixFactId = `${mixRunId}:${entry.fact.factId}`;
    promoted.payloadWeight = estimatePromptEnhancementPayloadWeightV1(entry.fact);
  }
}

export function applyPromptEnhancementSourceMixV1(
  rawFacts: readonly PromptEnhancementGuidanceFact[],
  levelState: PromptEnhancementPrepareRequestV1['userPreferenceContext']['levelState'] = 'default',
): PromptEnhancementSourceMixResult {
  // Tier-1 fields are REQUIRED at this seam: normalize every entering fact so none
  // is classified without origin scope, claim policy, and role.
  const facts = rawFacts.map(normalizePromptEnhancementTier1FieldsV1);
  // L4964: *"stable popup-session id … local contract, validation, source-use, and feedback
  // identity only"*. ⛔ Never rendered.
  //
  // ⚠️ The identity must depend on the FACT, never on which OTHER facts happen to be in the
  // same mix. A first version keyed it on the whole fact list, so the same fact was
  // `mix:1:a:a` alone and `mix:2:a|b:a` once a sibling appeared — MEASURED at verification
  // round 3. Since the fact set varies turn to turn inside one session, feedback recorded
  // against one form would not match the same fact later, which is precisely the identity
  // this field exists to provide.
  const mixRunId = 'mix';
  const caps = capsForLevel(levelState);
  const classified: PromptEnhancementSourceMixFact[] = [];

  const rejectedSourceA = facts.some((fact) => !isValidFact(fact) && laneFor(fact) === 'source_a');

  // Only render-eligible priorities are mix candidates; suppressed / handoff-only /
  // deferred facts (e.g. a conflict-suppressed positive fact) carry provenance but
  // are not selected into the shown body.
  const renderableFacts = facts.filter((fact) => isValidFact(fact) && RENDERABLE_PRIORITIES.has(fact.priority));

  // F4 / L4971: eligibility is ROUTING AUTHORITY. A fact blocked upstream — by frequency, dedup,
  // cooldown, session cap, dismissal, weakness or invalidity — may still travel as metadata, but it
  // must never be the survivor a popup opens on. The gating itself is NOT re-done here (prohibition
  // 19): the value was decided by the pipeline at the boundary and is only read.
  const sourceAEligible = renderableFacts.filter(
    (fact) => laneFor(fact) === 'source_a' && isPromptEnhancementPopupEligibleFactV1(fact.sourceEligibilityState),
  );
  const sourceAIneligible = renderableFacts.filter(
    (fact) => laneFor(fact) === 'source_a' && !isPromptEnhancementPopupEligibleFactV1(fact.sourceEligibilityState),
  );
  const sourceA = sourceAEligible;
  const sourceB = renderableFacts.filter((fact) => laneFor(fact) === 'source_b');

  // No valid Source A survivor -> DR2-G1: skip, never build filler from Source B.
  if (sourceA.length === 0) {
    // Nothing anchors, so the ineligible facts have no supporting pool to join. Record WHY each
    // was refused rather than letting it disappear: §42.2's complaint was that the gating was
    // invisible, and an unexplained skip repeats that defect from the other side.
    for (const fact of sourceAIneligible) {
      classified.push({
        fact,
        selectionRole: 'suppressed_by_payload_cap',
        selectionReasonCode: 'ineligible_source_a_not_triggering',
      });
    }
    for (const fact of sourceB) {
      classified.push({
        fact,
        selectionRole: 'suppressed_by_payload_cap',
        selectionReasonCode: 'no_source_a_survivor_no_source_b_filler',
      });
    }
    // Same promotion on the SKIP path: a fact that never rendered still carries why.
    promotePromptEnhancementMixDecisionV1(classified, mixRunId);

    // A Source A candidate rejected for invalidity, with none valid remaining, is the
    // fallback path (not a plain "no signal" skip).
    const skipProfile: PromptEnhancementSourceMixProfile = rejectedSourceA
      ? 'source_invalid_fallback'
      : sourceB.length > 0
        ? 'source_b_only_no_popup'
        : 'no_useful_source_a_skip';
    return {
      profile: skipProfile,
      showPopup: false,
      requiredSurvivor: null,
      renderedFacts: [],
      classifiedFacts: classified,
    };
  }

  // Source A is ranked required-survivor-first (phase 2.1). Anchor with exactly one.
  //
  // F4 / L4991, corrected at verification round 3: eligibility governs ANCHORING, not existence.
  // The lock says a blocked fact must not open a popup and that support_only material "may
  // label/support only AFTER another eligible Source A survivor exists" — so once one does, the
  // ineligible facts join the supporting pool behind it. Excluding them outright also collided
  // with prohibition 17: a SOURCE-CRITICAL fact that upstream had blocked would have been
  // downgraded to invisible metadata, which this module's own rule forbids ("high-risk /
  // source-critical facts must never be downgraded to invisible metadata") — it would never have
  // reached the `selected_source_label_only` carve-out below.
  const [requiredSurvivor, ...eligibleRemaining] = sourceA;
  const remainingSourceA = [
    ...eligibleRemaining,
    // Order is deliberately plain: the source-critical carve-out below keeps such a fact
    // VISIBLE as selected_source_label_only wherever it lands, so a priority sort here
    // would be untestable decoration — a mutation removing it killed nothing.
    ...sourceAIneligible,
  ];
  classified.push({
    fact: requiredSurvivor,
    selectionRole: 'selected_required',
    selectionReasonCode: 'required_source_signal_survivor',
  });
  let renderedCount = 1;

  // Supporting Source A up to the level cap and the hard total cap. Overflow stays
  // visible (source-critical -> label_only, else deferred to handoff).
  let supportingSourceASelected = 0;
  for (const fact of remainingSourceA) {
    const underLevelCap = supportingSourceASelected < caps.supportingSourceA;
    const underTotalCap = renderedCount < TOTAL_FACT_CAP;
    if (underLevelCap && underTotalCap) {
      classified.push({
        fact,
        selectionRole: 'selected_supporting',
        selectionReasonCode: 'supporting_source_a_within_cap',
      });
      supportingSourceASelected += 1;
      renderedCount += 1;
    } else if (isSourceCritical(fact)) {
      classified.push({
        fact,
        selectionRole: 'selected_source_label_only',
        selectionReasonCode: 'source_critical_over_cap_kept_visible',
      });
    } else {
      classified.push({
        fact,
        selectionRole: 'deferred_to_handoff',
        selectionReasonCode: 'supporting_source_a_over_cap',
      });
    }
  }

  // Source B grounding, only after the Source A survivor is fixed. Two lane
  // boundaries hold here: a FALSE capability is safety material and never counts
  // as grounding, and prompt-only knowledge never satisfies a Source B cap —
  // both stay visible as source labels, never as independent grounding.
  let sourceBSelected = 0;
  for (const fact of sourceB) {
    // Feature 1 project memory arrives already budgeted (max 10 lines, relevance-gated,
    // once per session), so it rides beside Nexpath's grounding instead of taking its
    // slots. It is support-only, so it still can never open a popup by itself.
    if (isPromptEnhancementProjectMemoryFactV1(fact)) {
      classified.push({
        fact,
        selectionRole: 'selected_supporting',
        selectionReasonCode: 'project_memory_within_feature1_budget',
      });
      continue;
    }
    if (fact.factRole === 'safety_confirmation_support') {
      classified.push({
        fact,
        selectionRole: 'selected_source_label_only',
        selectionReasonCode: 'negative_capability_safety_not_grounding',
      });
      continue;
    }
    if (fact.sourceOriginScope === 'current_prompt' || fact.sourceOriginScope === 'recent_prompt_history') {
      classified.push({
        fact,
        selectionRole: 'selected_source_label_only',
        selectionReasonCode: 'prompt_derived_not_independent_grounding',
      });
      continue;
    }
    // False OR UNKNOWN capability facts must not satisfy grounding caps — an
    // unknown probe value stays visible as a label, never as a grounding claim.
    if (fact.sourceEvidenceState === 'stale_or_unknown') {
      classified.push({
        fact,
        selectionRole: 'selected_source_label_only',
        selectionReasonCode: 'stale_or_unknown_not_grounding',
      });
      continue;
    }
    const underLevelCap = sourceBSelected < caps.sourceB;
    const underTotalCap = renderedCount < TOTAL_FACT_CAP;
    if (underLevelCap && underTotalCap) {
      classified.push({
        fact,
        selectionRole: 'selected_supporting',
        selectionReasonCode: 'source_b_grounding_within_cap',
      });
      sourceBSelected += 1;
      renderedCount += 1;
    } else {
      classified.push({
        fact,
        selectionRole: 'suppressed_by_payload_cap',
        selectionReasonCode: 'source_b_over_payload_cap',
      });
    }
  }

  promotePromptEnhancementMixDecisionV1(classified, mixRunId);


  // ── The label-only lane RENDERS. Owner ruling, 2026-08-20. ──────────────────────────────────
  //
  // 🔴 **`selected_source_label_only` rendered NOWHERE, and that was never the intent.** The lane's
  // own comment above says these facts *"stay VISIBLE as source labels, never as independent
  // grounding"* — two clauses, and only the second was implemented. Measured: the role appears in
  // exactly one other place in the entire production tree, a type union. Nothing consumed it.
  //
  // ⛔ **That silently broke a safety promise this module states in its own words** — *"a
  // SOURCE-CRITICAL fact that upstream had blocked would have been downgraded to invisible
  // metadata, which this module's own rule forbids"*. The Source A branch carves such facts out to
  // this very role BELIEVING it keeps them visible. It did not.
  //
  // 🔑 And it is what starved every prompt-history section: a safeguard built from recent prompts
  // hits two label-only rules at once, so no producer could ever have reached a body — the routing
  // gap was only half the story.
  //
  // ⚠️ **Rendering these is safe because the two guards that matter travel ON THE FACT and are
  // already correct**, which is why no new clamp is added here:
  //   - CONTENT: a `requires_confirmation` / `sensitive_suppress` / `sensitive_ref_only` fact had
  //     its evidence stripped at the producer's exit by `evidenceForGuidanceFact`. It crosses with
  //     nothing to render, whatever is selected here.
  //   - WORDING: `claimVerbPolicy` is each fact's own ceiling, and the sensitive producers already
  //     set `source_label_only`, which the renderer treats as reference-only — states THAT a source
  //     exists, never its content.
  // ⛔ Re-clamping every label-only fact to `source_label_only` HERE was considered and rejected:
  // it would make a safeguard reference-only, and a safeguard whose text cannot render is the exact
  // failure this fix exists to end.
  //
  // 🔒 Still never grounding: these facts `continue` before the Source B cap above, so the grounding
  // slots are untouched. The bound below is a PAYLOAD backstop, and source-critical material is
  // exempt from it — the same carve-out the Source A path already makes, for the same reason
  // (prohibition 17: safety is never faded for length).
  // 🔴 **Scoped by REASON, not applied to the whole role — and that was corrected by two existing
  // fixtures, not by reasoning.** A first version rendered every label-only fact and broke two
  // deliberate locks: a `stale_or_unknown` probe value must stay out (an unreliable value stating
  // itself is worse than silence), and a `metadata_only` fact must stay out because its own render
  // policy says so. Neither is the defect that was ruled on, so neither moves here.
  let labelOnlyBudget = Math.max(0, TOTAL_FACT_CAP - renderedCount);
  const labelOnlyRenderedIds = new Set<string>();
  for (const entry of classified) {
    if (entry.selectionRole !== 'selected_source_label_only') continue;
    if (!LABEL_ONLY_REASONS_THAT_RENDER_V1.has(entry.selectionReasonCode)) continue;
    // The fact's OWN policy still decides whether it is section material at all.
    if (entry.fact.renderPolicy !== 'render_as_section') continue;
    if (isSourceCritical(entry.fact)) { labelOnlyRenderedIds.add(entry.fact.factId); continue; }
    if (labelOnlyBudget > 0) {
      labelOnlyRenderedIds.add(entry.fact.factId);
      labelOnlyBudget -= 1;
    }
  }

  const renderedFacts = classified
    .filter((entry) => (
      entry.selectionRole === 'selected_required'
      || entry.selectionRole === 'selected_supporting'
      || (entry.selectionRole === 'selected_source_label_only' && labelOnlyRenderedIds.has(entry.fact.factId))
    ))
    .map((entry) => entry.fact);

  return {
    profile: determineProfile({
      requiredSurvivor,
      supportingSourceASelected,
      sourceBSelected,
      overCap: classified.some(
        (entry) =>
          entry.selectionRole === 'deferred_to_handoff' ||
          entry.selectionRole === 'suppressed_by_payload_cap' ||
          entry.selectionRole === 'selected_source_label_only',
      ),
    }),
    showPopup: true,
    requiredSurvivor,
    renderedFacts,
    classifiedFacts: classified,
  };
}

function determineProfile(input: {
  requiredSurvivor: PromptEnhancementGuidanceFact;
  supportingSourceASelected: number;
  sourceBSelected: number;
  overCap: boolean;
}): PromptEnhancementSourceMixProfile {
  if (isSourceCritical(input.requiredSurvivor)) return 'source_a_heavy_high_risk';
  if (input.overCap) return 'over_token_or_source_cap_compressed';
  // "No useful Source B fact" is the source_a_only hallmark (transform-rule-2), regardless of
  // how many supporting Source A facts were selected.
  if (input.sourceBSelected === 0) return 'source_a_only';
  if (input.sourceBSelected === 1 && input.supportingSourceASelected === 0) return 'source_a_with_light_grounding';
  return 'balanced_dual_source';
}
