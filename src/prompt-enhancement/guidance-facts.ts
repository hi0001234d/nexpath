import type { PromptEnhancementPrepareRequestV1 } from './contracts.js';
import { ENV_FACT_CORROBORATOR } from '../env/env-tier-promotion.js';
import { redactSecrets } from '../store/redact.js';
import {
  projectFactCategoryForRefV1,
  projectFactRefIsApplicableV1,
  isPromptEnhancementProjectFactCategoryV1,
  type PromptEnhancementProjectFactCategoryV1,
} from './project-fact-applicability.js';
import type {
  PromptEnhancementGuidanceFact,
  PromptEnhancementGuidancePriority,
  PromptEnhancementClaimVerbPolicy,
  PromptEnhancementSourceEligibilityStateV1,
} from './templates/section-plan.js';
import { isPromptEnhancementSourceCriticalFactV1 } from './templates/section-plan.js';

/**
 * transform-rule-1 split 1 — guidance-fact builder (E2 / phase 2.1).
 *
 * Normalizes the request's already-collected source signals (E1 feeds) into typed
 * {@link PromptEnhancementGuidanceFact} records. This is the deterministic seam that
 * transform-rule-1 requires *before* {@link planPromptEnhancementSections} and *before* any
 * composer wording — no LLM, no direct copy of content-template option/whyDesc text.
 *
 * Scope of 2.1: construct + dedupe + rank the raw fact set with transform-rule-1-correct
 * required fields (sourceType / guidanceKind / priority / renderPolicy / risk /
 * privacy / sanitization). The transform-rule-2 dual-lane source-mix caps (2.2) and the
 * DR2-G1 gate (2.3) are applied on top of this list in their own sub-phases; the
 * `planPromptEnhancementSections` wiring is 2.5. Per-signal `suggestedActionKind`
 * refinement (absence -> verification vs reproduction, etc.) is eval-rule-3 / R1 data;
 * v1 defaults it safely to `no_action_render_context_only` where unknown.
 */
/**
 * Canonical missing-signal memory keys. The builder (write side) and the auto.ts
 * memory query (read side) MUST agree on these, or memory never suppresses a repeat
 * signal. Kept token-safe (no '>' etc.) because they become persisted memory keys.
 */
import { stampPromptEnhancementFatigueKeysV1 } from './guidance-fatigue.js';
import { PROMPT_ENHANCEMENT_PROJECT_MEMORY_REF_PREFIX_V1, buildProjectMemoryGuidanceFactV1 } from './project-memory-facts.js';

export function promptEnhancementStageSignalKeyV1(prevStage: string | undefined, currentStage: string): string {
  return `stage:${prevStage ?? 'unknown'}-to-${currentStage}`;
}

export function promptEnhancementAbsenceSignalKeyV1(absenceKey: string): string {
  return `absence:${absenceKey}`;
}

/**
 * The REGISTRY's claim-wording rule, computed from the corroboration tier that
 * crossed the boundary: practice wording only for behaviour-corroborated tier P,
 * capability wording for present-but-uncorroborated capabilities, possibility
 * wording otherwise. Deterministic — never model-assigned.
 */
export function claimVerbPolicyForCorroborationTier(
  tier: 'promoted_practice_P' | 'capability' | 'uncorroborated',
): PromptEnhancementClaimVerbPolicy {
  switch (tier) {
    case 'promoted_practice_P': return 'may_state_as_user_practice';
    case 'capability':          return 'may_state_as_project_capability';
    case 'uncorroborated':      return 'must_phrase_as_possibility';
  }
}

/**
 * The per-fact content gates, applied AT resolution: unrenderable or
 * reference-only facts never cross with content — the gate travels with the
 * fact, so eager delivery weakens nothing.
 */
export function evidenceForGuidanceFact(
  privacyClass: PromptEnhancementGuidanceFact['privacyClass'],
  sanitizationState: PromptEnhancementGuidanceFact['sanitizationState'],
  resolved: { readonly key: string; readonly value: string } | undefined,
): { readonly key: string; readonly value: string } | undefined {
  if (!resolved) return undefined;
  if (privacyClass === 'do_not_render' || privacyClass === 'sensitive_ref_only') return undefined;
  // The locked sensitivity treatments: suppressed and confirmation-routed facts
  // never cross with content (the SIGNAL crosses, the literal does not);
  // sensitive_generalize content crosses for generalized wording downstream.
  if (privacyClass === 'sensitive_suppress' || privacyClass === 'requires_confirmation') return undefined;
  if (sanitizationState === 'unsafe_to_render' || sanitizationState === 'sensitive_ref_only') return undefined;
  // Defensive redaction on every crossing value: a secret-shaped literal never
  // crosses raw — the fingerprint crosses instead. Idempotent on clean values.
  return { key: resolved.key, value: redactSecrets(resolved.value) };
}

/**
 * One absence-signal fact, however the signal reached us — as the FIRED trigger
 * or as a normalized signal ref. Both paths build it here because the sensitive
 * treatment must not depend on which door the signal came through: a
 * `secret_in_prompt`-class record separates SIGNAL from LITERAL, routes through
 * confirmation, and carries its safety hook, and the fired trigger is the most
 * likely way such a signal arrives (it is what opens the popup).
 */
/**
 * The sensitive-source test, in ONE place. A `secret_in_prompt`-class signal can
 * reach the boundary through more than one producer — as the fired trigger, as a
 * normalized signal ref, and as a recurring-mistake ref (an active absence marks
 * its key `mistake`, and this signal is an absence) — and the locked treatment
 * must not depend on which one emitted it.
 */
export function isSensitiveSignalRefV1(ref: string): boolean {
  // ⚠️ CASE-NORMALISED at §17.13. Content-template registry ids are SHOUTED
  // (`ABSENCE_SECRET_IN_PROMPT`), so the lowercase test missed them — and it only started
  // mattering when that producer began stating its signal's identity. A predicate that is
  // the single sensitive-source test must match every shape the ref actually takes.
  return ref.toLowerCase().includes('secret_in_prompt');
}

/**
 * F4 (L4971): the eligibility a TRIGGER-derived fact inherits.
 *
 * The value is decided upstream and carried on the request; PE only reads it, never substitutes
 * one. ⚠️ An absent value stays ABSENT — a first draft defaulted it to `support_only_not_triggering`,
 * which is a BLOCKING state, so every caller that sent no decision silently lost its survivor and
 * `guidance-outcome` began returning a null primary signal key. Caught by the full suite. Absence
 * means "no boundary decision reached us", and the mix seam already treats that as pre-F4
 * behaviour rather than as a block.
 */
/**
 * The project-fact applicability gate (Hiren's ruling — the model judges, the registry decides).
 *
 * ⚠️ Applied as SUPPRESSION, not as a skipped producer. The fact is still built and still carries
 * its evidence, and the drop is recorded on it with the locked `suppressed_by_relevance` state —
 * because a fact that was never built cannot say WHY it is absent, and every other drop in this
 * system is answerable. `suppressed` + `suppress_with_reason` are what the renderer and the section
 * planner already read, so nothing downstream needs to learn a new rule.
 *
 * ⛔ Facts outside the project-fact vocabulary are untouched: this gate answers one question, and
 * silently re-deciding work-style or absence signals would be a second gate wearing this one's name.
 */
function applyProjectFactApplicabilityV1(
  fact: PromptEnhancementGuidanceFact,
  observed: readonly PromptEnhancementProjectFactCategoryV1[] | undefined,
): PromptEnhancementGuidanceFact {
  const ref = fact.sourceIds[0];
  if (ref === undefined) return fact;
  if (projectFactCategoryForRefV1(ref) === undefined) return fact;
  // 🔒 PROHIBITION 17 — safety is never faded, and relevance is not an exception. A FALSE
  // capability ("this project has no backups") is safety material, not grounding: it carries
  // `safety_or_confirmation` and a safety hook, and the moment it matters most is a destructive
  // prompt that never mentioned backups — exactly the prompt an applicability judgement would call
  // irrelevant. Uses the CANONICAL predicate the fatigue guard and the mixer use, so the three
  // cannot drift apart.
  if (isPromptEnhancementSourceCriticalFactV1(fact)) return fact;
  if (fact.safetyHooks !== undefined && fact.safetyHooks.length > 0) return fact;
  if (projectFactRefIsApplicableV1(ref, observed)) return fact;
  return {
    ...fact,
    priority: 'suppressed',
    renderPolicy: 'suppress_with_reason',
    selectionState: 'suppressed_by_relevance',
    selectionReasonCodes: [
      ...(fact.selectionReasonCodes ?? []),
      'project_fact_not_applicable_to_prompt',
    ],
  };
}

function triggerEligibilityV1(
  request: PromptEnhancementPrepareRequestV1,
): PromptEnhancementSourceEligibilityStateV1 | undefined {
  return request.sourceSignals.triggerSignalEligibilityState;
}

/**
 * The IDENTITY a source-signal fact states about itself — §17.13.
 *
 * ⛔ The bug this closes: the slot rendered, and never named the signal that fired. Four of its five
 * producers attached no `evidence`, and the renderer's rule is *"no resolved value means no line"* —
 * so the deterministic sentence the claim ladder is built for could not fire, and the composer was
 * handed an opaque fact id. The model then wrote about the CATEGORY ("missing practices in my
 * project") because the category was all it had.
 *
 * 🔑 What crosses is the signal's own identity — `test_creation`, `idea → implementation` — which
 * NEXPATH generated. No user-authored text enters this payload, which is why the redaction coverage
 * question does not gate it (Hiren, 2026-08-19). Values are the wording he approved.
 *
 * 🔒 Sensitive signals are protected TWICE, and neither guard is new: a `secret_in_prompt`-class
 * absence ships `privacyClass: 'requires_confirmation'`, which makes `evidenceForGuidanceFact`
 * return undefined, AND `claimVerbPolicy: 'source_label_only'`, which the renderer treats as
 * reference-only and prints without the key. The identity of a sensitive signal still never
 * reaches a body.
 */
function sourceSignalEvidenceV1(
  kind: 'absence' | 'stage' | 'memory' | 'content_template',
  sourceId: string,
): { readonly key: string; readonly value: string } {
  switch (kind) {
    case 'stage': {
      // `stage:idea-to-implementation` — the transition IS the value, so the key names the axis.
      const [from, to] = sourceId.replace(/^stage:/, '').split('-to-');
      // A degenerate key (`stage:idea-to-idea`) is not a transition; an arrow pointing at
      // itself reads as a bug to whoever sees it in a body.
      return {
        key: 'stage',
        value: to === undefined || to === from ? from ?? 'unknown' : `${from} → ${to}`,
      };
    }
    case 'absence':
      return { key: sourceId.replace(/^absence:/, ''), value: 'not observed in this prompt' };
    case 'memory':
      // ⚠️ Just 'a repeated gap' — the ANCHOR appends 'in your recent work'. Carrying it in the
      // value too rendered it twice: "...as a repeated gap in your recent work in your recent
      // work." The approved sentence is unchanged; it is assembled from both halves.
      return { key: sourceId.replace(/^memory:/, ''), value: 'a repeated gap' };
    case 'content_template':
      // Registry ids are shouted (`ABSENCE_TEST_CREATION`); the renderer spaces the key, so the
      // only work here is getting it back to the signal name it was built from.
      return {
        key: sourceId.toLowerCase().replace(/^absence_/, ''),
        value: 'an established guidance precedent',
      };
  }
}

function absenceSignalFactV1(
  factId: string,
  sourceId: string,
  eligibility: PromptEnhancementSourceEligibilityStateV1 | undefined,
): PromptEnhancementGuidanceFact {
  const isSensitiveSource = isSensitiveSignalRefV1(sourceId);
  return {
    factId,
    sourceType: 'absence_signal',
    sourceIds: [sourceId],
    ...(eligibility === undefined ? {} : { sourceEligibilityState: eligibility }),
    guidanceKind: isSensitiveSource ? 'safety_or_confirmation' : 'missing_practice',
    suggestedActionKind: 'no_action_render_context_only',
    targetFamily: 'family_agnostic',
    targetSectionKind: 'source_signal_guidance',
    sourceEvidenceState: 'strong',
    sourceOriginScope: 'current_prompt',
    claimVerbPolicy: isSensitiveSource ? 'source_label_only' : 'must_phrase_as_source_signal',
    factRole: isSensitiveSource ? 'safety_confirmation_support' : 'required_source_signal_survivor',
    priority: 'required_survivor',
    renderPolicy: 'render_as_section',
    riskLevel: isSensitiveSource ? 'sensitive_authority_risky' : 'low',
    safetyHooks: isSensitiveSource ? ['safety_sensitive_source'] : [],
    privacyClass: isSensitiveSource ? 'requires_confirmation' : 'public_safe',
    sanitizationState: 'not_applicable',
    requiredBecause: 'source_signal_guidance_shown_in_popup',
    // A fact that carries content states where the content came from — §17.7's lesson, applied at
    // the producer rather than left to a downstream default.
    sourceRuntimePath: 'local_read_model',
    sourceAnchorScope: 'current_prompt_scope',
    // §17.13: the signal NAMES itself. A sensitive source resolves to undefined here (its privacy
    // class blocks content at the shared gate) and falls to the reference-only line — unchanged.
    evidence: evidenceForGuidanceFact(
      isSensitiveSource ? 'requires_confirmation' : 'public_safe',
      'not_applicable',
      sourceSignalEvidenceV1('absence', sourceId),
    ),
    publicCopySafe: true,
  };
}

export function buildPromptEnhancementGuidanceFactsV1(
  request: PromptEnhancementPrepareRequestV1,
): readonly PromptEnhancementGuidanceFact[] {
  const signals = request.sourceSignals;
  const facts: PromptEnhancementGuidanceFact[] = [];
  let seq = 0;
  const nextId = (kind: string): string => `pe-fact-${kind}-${seq++}`;

  // Source A — the current review-moment trigger. This is the live stage/absence
  // Source-A candidate (analysis L5567): even when nothing is persisted in the
  // signal refs yet, a fresh stage transition or absence anchors the popup.
  const trigger = request.reviewMomentContext.triggerProvenance;
  if (trigger.triggerKind === 'stage_transition') {
    facts.push({
      factId: nextId('stage'),
      sourceType: 'stage_transition',
      sourceIds: [promptEnhancementStageSignalKeyV1(trigger.prevStage, trigger.currentStage)],
      // F4 done-when: the trigger signal inherits the boundary's decision; an unstamped caller keeps an active signal
      sourceEligibilityState: triggerEligibilityV1(request) ?? 'active_signal_eligible',
      guidanceKind: 'stage_transition_discipline',
      suggestedActionKind: 'no_action_render_context_only',
      targetFamily: 'family_agnostic',
      targetSectionKind: 'source_signal_guidance',
      sourceEvidenceState: 'strong',
      sourceOriginScope: 'current_prompt',
      claimVerbPolicy: 'must_phrase_as_source_signal',
      factRole: 'supporting_missing_practice',
      priority: 'high',
      renderPolicy: 'render_as_section',
      riskLevel: 'low',
      safetyHooks: [],
      privacyClass: 'public_safe',
      sanitizationState: 'not_applicable',
      sourceRuntimePath: 'local_read_model',
      sourceAnchorScope: 'current_prompt_scope',
      // §17.13: state WHICH transition, not that a transition happened.
      evidence: evidenceForGuidanceFact('public_safe', 'not_applicable', sourceSignalEvidenceV1(
        'stage',
        promptEnhancementStageSignalKeyV1(trigger.prevStage, trigger.currentStage),
      )),
      publicCopySafe: true,
    });
  } else if (trigger.triggerKind === 'absence') {
    facts.push(absenceSignalFactV1(
      nextId('signal'),
      promptEnhancementAbsenceSignalKeyV1(trigger.selectedQualifyingAbsence ?? trigger.firedKey ?? trigger.currentStage),
      triggerEligibilityV1(request),
    ));
  }

  // Source A — required survivors. Stage/absence signals shown in the popup are
  // transform-rule-4/5/9 floors ("source/signal guidance in a shown popup"): must survive.
  for (const ref of signals.normalizedStageAbsenceSignalRefs) {
    // ⚠️ CANONICALISED at §17.13. The SAME signal arrives twice under two spellings — the fired
    // trigger builds `absence:test_creation`, this lane carries the bare `test_creation`
    // (`auto.ts` strips the prefix) — and `dedupeGuidanceFacts` keys on the source ids, so two
    // facts survived for one signal. That was invisible while neither stated anything; the moment
    // both state an identity it is the same sentence printed twice in the body.
    const canonical = ref.includes(':') ? ref : promptEnhancementAbsenceSignalKeyV1(ref);
    facts.push(absenceSignalFactV1(nextId('signal'), canonical, triggerEligibilityV1(request)));
  }

  // Source A — content-template records are source *evidence / precedent only*
  // (no direct copy of option/whyDesc); render as a supporting clause, not a body.
  for (const ref of signals.contentTemplateRecordFactRefs) {
    // 🚨 §17.13: this producer had NO sensitive path, because before it stated an identity it had
    // nothing to leak. Giving it one made "precedent exists for <signal>" nameable — and MEASURED,
    // it named `secret in prompt`. Precedent for a secret-shaped signal is still a statement about
    // that signal, so it takes the same treatment the absence lane has always had.
    const ctplIsSensitive = isSensitiveSignalRefV1(ref);
    facts.push({
      factId: nextId('ctpl'),
      sourceType: 'content_template_record',
      sourceIds: [ref],
      guidanceKind: ctplIsSensitive ? 'safety_or_confirmation' : 'source_signal_guidance',
      // F4 done-when: precedent/evidence only — L4991 permits labelling only behind an eligible survivor
      sourceEligibilityState: 'support_only_not_triggering',
      suggestedActionKind: 'no_action_render_context_only',
      targetFamily: 'family_agnostic',
      targetSectionKind: 'source_signal_guidance',
      sourceEvidenceState: 'partial',
      sourceOriginScope: 'content_template_registry',
      claimVerbPolicy: ctplIsSensitive ? 'source_label_only' : 'must_phrase_as_source_signal',
      factRole: 'supporting_missing_practice',
      priority: 'normal',
      renderPolicy: 'render_as_inline_clause',
      riskLevel: ctplIsSensitive ? 'sensitive_authority_risky' : 'none',
      safetyHooks: ctplIsSensitive ? ['safety_sensitive_source'] : [],
      privacyClass: ctplIsSensitive ? 'requires_confirmation' : 'local_private',
      sanitizationState: 'not_applicable',
      mergePolicy: 'merge_as_supporting_clause',
      wordingHintPolicy: 'use_template_topic_anchor',
      sourceRuntimePath: 'local_read_model',
      sourceAnchorScope: 'content_template_scope',
      // §17.13: precedent EXISTS for a named signal — still evidence-only, now identifiable.
      evidence: evidenceForGuidanceFact(
        ctplIsSensitive ? 'requires_confirmation' : 'local_private',
        'not_applicable',
        sourceSignalEvidenceV1('content_template', ref),
      ),
      publicCopySafe: true,
    });
  }

  // Source A — persistent missing-signal memory (populated by E3). Shape is ready
  // now per transform-rule-1: frequency/recency/confidence/fatigue must fit the same record.
  for (const ref of signals.missingMemoryCandidateRefs) {
    // 🚨 Same treatment as the absence and content-template lanes, and for the same reason: a
    // memory candidate is keyed by SIGNAL, so `memory:secret_in_prompt` is as nameable as any
    // other. Measured leaking after the §17.13 fix — the sensitive path had been applied to two
    // producers and this one was still stating the key.
    const memoryIsSensitive = isSensitiveSignalRefV1(ref);
    facts.push({
      factId: nextId('mem'),
      sourceType: 'persistent_missing_signal_memory',
      sourceIds: [ref],
      guidanceKind: memoryIsSensitive ? 'safety_or_confirmation' : 'missing_practice',
      // F4 done-when: the source rule memory: the candidate list is already gated upstream (E3)
      sourceEligibilityState: 'memory_eligible',
      suggestedActionKind: 'no_action_render_context_only',
      targetFamily: 'family_agnostic',
      targetSectionKind: 'source_signal_guidance',
      sourceEvidenceState: 'partial',
      sourceOriginScope: 'stored_memory',
      claimVerbPolicy: memoryIsSensitive ? 'source_label_only' : 'must_phrase_as_source_signal',
      factRole: memoryIsSensitive ? 'safety_confirmation_support' : 'supporting_missing_practice',
      priority: 'normal',
      renderPolicy: 'render_as_section',
      riskLevel: memoryIsSensitive ? 'sensitive_authority_risky' : 'low',
      safetyHooks: memoryIsSensitive ? ['safety_sensitive_source'] : [],
      sourceRuntimePath: 'local_store',
      sourceAnchorScope: 'longitudinal_user_behavior',
      // §17.13: name the recurring gap the memory is about.
      evidence: evidenceForGuidanceFact(
        memoryIsSensitive ? 'requires_confirmation' : 'local_private',
        'identity_only_event',
        sourceSignalEvidenceV1('memory', ref),
      ),
      privacyClass: memoryIsSensitive ? 'requires_confirmation' : 'local_private',
      sanitizationState: 'identity_only_event',
      publicCopySafe: true,
    });
  }

  // Source B — hard facts (env-derived project grounding). Bounded grounding, not
  // a required survivor; transform-rule-2 (2.2) owns final relevance/priority mixing.
  // Claim wording comes from the corroboration tier that crossed the boundary, and
  // POLARITY routes the role: a FALSE capability is safety material, never grounding;
  // an unknown probe stays stale_or_unknown — never a confident negative.
  for (const ref of signals.sourceOnlyHardFactRefs) {
    const tier = signals.groundingTierByRef?.[ref] ?? 'uncorroborated';
    const polarity = signals.groundingPolarityByRef?.[ref] ?? 'present';
    const isFalseCapability = polarity === 'false_capability';
    const isUnknown = polarity === 'unknown';
    const resolved = signals.groundingEvidenceByRef?.[ref];
    facts.push({
      factId: nextId('hard'),
      sourceType: 'hard_fact',
      sourceIds: [ref],
      guidanceKind: 'project_grounding',
      // F4 done-when: project grounding is Source B — support, never the reason a popup opens
      sourceEligibilityState: 'support_only_not_triggering',
      suggestedActionKind: 'ground_in_project_fact',
      targetFamily: 'family_agnostic',
      targetSectionKind: '',
      sourceEvidenceState: isUnknown ? 'stale_or_unknown' : 'strong',
      sourceOriginScope: 'local_probe',
      claimVerbPolicy: isFalseCapability
        ? 'source_label_only'
        : isUnknown
          ? 'must_phrase_as_possibility'
          : claimVerbPolicyForCorroborationTier(tier),
      factRole: isFalseCapability ? 'safety_confirmation_support' : 'project_grounding_support',
      priority: 'normal',
      renderPolicy: isFalseCapability ? 'metadata_only' : 'render_as_section',
      riskLevel: 'none',
      safetyHooks: isFalseCapability ? ['safety_negative_capability'] : [],
      privacyClass: 'local_private',
      sanitizationState: 'not_applicable',
      evidence: evidenceForGuidanceFact('local_private', 'not_applicable', resolved),
      sourceRuntimePath: resolved?.runtimePath,
      sourceAnchorScope: resolved?.anchorScope,
      publicCopySafe: true,
    });
  }

  // RIGHT&GOOD / work-style / env-runtime profile signals.
  for (const ref of signals.rightGoodWorkStyleEnvRuntimeRefs) {
    if (ref.startsWith(PROMPT_ENHANCEMENT_PROJECT_MEMORY_REF_PREFIX_V1)) {
      // Feature 1 project memory (earlier decisions, rules, past errors) for the writer.
      // See project-memory-facts.ts for the lane, claim and routing rules.
      const memoryFact = buildProjectMemoryGuidanceFactV1(ref, nextId('project-memory'), signals.groundingEvidenceByRef?.[ref]);
      if (memoryFact) facts.push(memoryFact);
      continue;
    }
    if (ref.startsWith('mistake:')) {
      // A recurring mistake is a negative-capability signal: a missing practice, so
      // it belongs in Source A (fix-plan §4b), NOT the positive Source-B pattern lane.
      const mistakeResolved = signals.groundingEvidenceByRef?.[ref];
      // A recurring mistake CAN be the sensitive signal: an active absence marks
      // its key `mistake`, and `secret_in_prompt` is an absence. This ref reaches
      // PE even when a different absence fired the popup, so it carries no
      // protected sibling — the treatment has to be applied here too.
      const mistakeIsSensitive = isSensitiveSignalRefV1(ref);
      const mistakePrivacy = mistakeIsSensitive ? 'requires_confirmation' as const : 'local_private' as const;
      facts.push({
        factId: nextId('mistake'),
        sourceType: 'absence_signal',
        sourceIds: [ref],
        // F4 done-when: a detected recurring mistake is an ACTIVE signal, not the fired
        // trigger — eligible in its own right, which is the behaviour it already had.
        sourceEligibilityState: 'active_signal_eligible',
        guidanceKind: mistakeIsSensitive ? 'safety_or_confirmation' : 'missing_practice',
        suggestedActionKind: 'no_action_render_context_only',
        targetFamily: 'family_agnostic',
        targetSectionKind: 'source_signal_guidance',
        sourceEvidenceState: 'partial',
        sourceOriginScope: 'longitudinal_param_events',
        claimVerbPolicy: mistakeIsSensitive ? 'source_label_only' : 'must_phrase_as_source_signal',
        factRole: mistakeIsSensitive ? 'safety_confirmation_support' : 'supporting_missing_practice',
        priority: 'normal',
        renderPolicy: 'render_as_section',
        riskLevel: mistakeIsSensitive ? 'sensitive_authority_risky' : 'low',
        safetyHooks: mistakeIsSensitive ? ['safety_sensitive_source'] : [],
        privacyClass: mistakePrivacy,
        sanitizationState: 'identity_only_event',
        evidence: evidenceForGuidanceFact(mistakePrivacy, 'identity_only_event', mistakeResolved),
        sourceRuntimePath: mistakeResolved?.runtimePath,
        sourceAnchorScope: mistakeResolved?.anchorScope,
        publicCopySafe: true,
      });
      continue;
    }
    // Positive RIGHT&GOOD and work-style signals are weak Source-B tie-breakers only
    // (transform-rule-1): they adapt register/emphasis, never override instructions/safety/
    // routing. Render as metadata, not their own section.
    // ── A3 step 7: prompt-derived params get their OWN treatment ──────────────────────────────
    // Without this they fall into the work-style branch below and inherit `metadata_only`, which
    // the renderer rejects — so the value crosses, becomes a fact, and dies one hop short of the
    // body. Step 7 specifies the opposite: cross "under A2's L4990 lane rules (never toward Source
    // B caps uncorroborated; possibility phrasing)". Possibility phrasing is a RENDERED claim.
    //
    // ⛔ Uncorroborated by construction — mined from the user's own prompts, never behaviour-
    // verified — so the ladder caps it at possibility wording and it can never reach practice.
    // ── §17.11 (owner-ruled: WIRE IT) — a MOVEMENT, not a state ───────────────────────────────
    //
    // Planned into `project_grounding_facts` with the other project facts (the owner's call: one
    // more line in the section that exists, not a section of its own). What separates it is the
    // claim ceiling: `must_phrase_as_recent_change` is the only rung that words a movement, and
    // it sits below the project-knowledge rungs because a movement is one local probe pair —
    // never behaviour-corroborated, so it can never be promoted into practice wording.
    if (ref.startsWith('env_change:')) {
      const changeResolved = signals.groundingEvidenceByRef?.[ref];
      facts.push({
        factId: nextId('envchg'),
        sourceType: 'hard_fact',
        sourceIds: [ref],
        guidanceKind: 'project_grounding',
        // Source B support: a movement is context for the reply, never the reason a popup opens.
        sourceEligibilityState: 'support_only_not_triggering',
        suggestedActionKind: 'ground_in_project_fact',
        targetFamily: 'family_agnostic',
        targetSectionKind: '',
        sourceEvidenceState: 'partial',
        sourceOriginScope: 'local_probe_trajectory',
        claimVerbPolicy: 'must_phrase_as_recent_change',
        factRole: 'project_grounding_support',
        priority: 'low',
        renderPolicy: 'render_as_section',
        riskLevel: 'none',
        safetyHooks: [],
        privacyClass: 'local_private',
        sanitizationState: 'not_applicable',
        evidence: evidenceForGuidanceFact('local_private', 'not_applicable', changeResolved),
        sourceRuntimePath: changeResolved?.runtimePath,
        sourceAnchorScope: changeResolved?.anchorScope,
        confidenceBand: 'low',
        recencyBand: 'recent_project',
        publicCopySafe: true,
      });
      continue;
    }

    if (ref.startsWith('history_acceptance:') || ref.startsWith('history_verification:')) {
      // The two starved sections, fed at last. What finished looks like, and how the change gets
      // proven, were the highest-volume sections in shipped bodies and neither had ever received a
      // fact — so both were written from plausibility, which reads as grounding without being it.
      //
      // What crosses here is the DEVELOPER'S OWN SENTENCE from a recent prompt, quoted. That is
      // what makes it worth carrying: the composer cannot see their history, and a sentence they
      // wrote themselves cannot be a plausible generality. Where they never said, the detector
      // returns nothing and NO fact is built — an empty fact would make a section look grounded
      // while saying less than the honest silence it replaces.
      //
      // ⛔ The routing map is the one authority for where these land (`add_acceptance_criteria` →
      // what-done-looks-like, `add_verification` → how-to-verify), so no `targetSectionKind`.
      const isAcceptance = ref.startsWith('history_acceptance:');
      const statedResolved = signals.groundingEvidenceByRef?.[ref];
      // No resolved value means nothing was actually stated — produce nothing rather than a shell.
      if (!statedResolved || statedResolved.value.trim() === '') continue;
      facts.push({
        factId: nextId(isAcceptance ? 'history-acceptance' : 'history-verification'),
        sourceType: 'prompt_derived_fact',
        sourceIds: [ref],
        // Support only, like every prompt-derived lane: material the developer mentioned enriches a
        // popup that fired for its own reasons; it must never summon one by itself.
        sourceEligibilityState: 'support_only_not_triggering',
        guidanceKind: isAcceptance ? 'requirement_source_state' : 'review_verification',
        suggestedActionKind: isAcceptance ? 'add_acceptance_criteria' : 'add_verification',
        targetFamily: 'family_agnostic',
        targetSectionKind: '',
        sourceEvidenceState: 'partial',
        sourceOriginScope: 'recent_prompt_history',
        // They SAID it; they did not necessarily do it. Possibility strength is the honest ceiling,
        // and it is what keeps a quoted wish from being restated as an established practice.
        claimVerbPolicy: 'must_phrase_as_possibility',
        factRole: isAcceptance ? 'project_grounding_support' : 'supporting_missing_practice',
        priority: 'low',
        renderPolicy: 'render_as_section',
        riskLevel: 'none',
        safetyHooks: [],
        // The value quotes the developer's own prompt text, so it is theirs and stays local.
        privacyClass: 'local_private',
        sanitizationState: 'prompt_derived_sanitized',
        evidence: { key: statedResolved.key, value: statedResolved.value },
        sourceRuntimePath: statedResolved.runtimePath,
        sourceAnchorScope: statedResolved.anchorScope,
        confidenceBand: 'low',
        // They wrote it in this session's recent prompts. "A recent project check" would credit a
        // probe that never ran, and a fact that misstates where it came from is worse than none.
        recencyBand: 'current_session',
        publicCopySafe: false,
      });
      continue;
    }

    if (ref.startsWith('history_sensitive_action:')) {
      // 🔒 Owner-ruled (2026-08-20). A sensitive action the developer raised in recent prompts asks
      // the agent to confirm before acting. This is the FIRST producer for
      // `risk_safety_or_confirmation` — the section was plannable but nothing had ever fed it.
      //
      // ⛔ `confirm_risk` is what routes it there, and the routing map is the one authority for
      // that (prohibition 15). No `targetSectionKind` override.
      //
      // ⚠️ `public_safe`, and that is exact rather than lax: the value is the shipped safeguard
      // sentence with a GENERIC naming, and the key is a category slug. Nothing developer-written
      // reaches this fact — the signal module drops the matched text before it crosses. A
      // `requires_confirmation` class here would block the content at the shared evidence gate and
      // leave the section with nothing to say, which is the opposite of what a safeguard is for.
      const signalResolved = signals.groundingEvidenceByRef?.[ref];
      facts.push({
        factId: nextId('history-safety'),
        sourceType: 'prompt_derived_fact',
        sourceIds: [ref],
        // Support only: a safeguard rides a popup that something else opened. It must never be the
        // reason one appears, or a stray `-f` in a prompt would summon a popup by itself.
        sourceEligibilityState: 'support_only_not_triggering',
        guidanceKind: 'safety_or_confirmation',
        suggestedActionKind: 'confirm_risk',
        targetFamily: 'family_agnostic',
        targetSectionKind: '',
        sourceEvidenceState: 'partial',
        sourceOriginScope: 'recent_prompt_history',
        // The detector reports that a category was MENTIONED, never that the developer does it as a
        // practice. Possibility strength is the honest ceiling.
        claimVerbPolicy: 'must_phrase_as_possibility',
        factRole: 'safety_confirmation_support',
        priority: 'normal',
        renderPolicy: 'render_as_section',
        riskLevel: 'sensitive_authority_risky',
        // 🔒 The hook is what makes the section SAFETY material, which the pruner reads to keep it
        // out of the cap (§15.1: safety sections cannot be pruned, ever).
        safetyHooks: ['safety_sensitive_source'],
        privacyClass: 'public_safe',
        sanitizationState: 'not_applicable',
        evidence: evidenceForGuidanceFact('public_safe', 'not_applicable', signalResolved),
        sourceRuntimePath: signalResolved?.runtimePath,
        sourceAnchorScope: signalResolved?.anchorScope,
        confidenceBand: 'low',
        recencyBand: 'recent_project',
        publicCopySafe: true,
      });
      continue;
    }

    if (ref.startsWith('prompt_fact:')) {
      const minedResolved = signals.groundingEvidenceByRef?.[ref];
      facts.push({
        factId: nextId('mined'),
        // 🔴 **Was `hard_fact`, corrected on the owner's ruling (2026-08-20).** That label filed a
        // fact the developer merely SAID in the same drawer as one the env probe independently
        // VERIFIED — and `source-mix.ts` already names that exact collapse as a defect it fixed
        // once: *"a fact known only from the user's own prompt was labelled `source_b` — the same
        // label an independently corroborated project fact carries."* The third lane exists for
        // this material; this producer had simply never been moved into it.
        //
        // 🔑 The owner's reason, which is the stronger one: prompts carry far more than a file tree
        // reveals, and they are re-read every 25 prompts, so this lane tracks change while the probe
        // reports state. Two different kinds of knowing, and they must not share a label.
        //
        // ⚠️ Behaviour that does NOT change, verified before the edit: selection bucket (both lanes
        // collapse to `source_b` in `laneFor`, so this can still never open a popup on its own),
        // `support_only_not_triggering` below, and claim strength (already pinned to possibility).
        // What DOES change is fatigue: `guidance-fatigue.ts` counts this as recent-prompt material
        // now, which is what it is.
        sourceType: 'prompt_derived_fact',
        sourceIds: [ref],
        guidanceKind: 'project_grounding',
        // Source B support: prompt-mined material never opens a popup on its own.
        sourceEligibilityState: 'support_only_not_triggering',
        suggestedActionKind: 'ground_in_project_fact',
        targetFamily: 'family_agnostic',
        targetSectionKind: '',
        sourceEvidenceState: 'partial',
        sourceOriginScope: 'recent_prompt_history',
        claimVerbPolicy: 'must_phrase_as_possibility',
        factRole: 'project_grounding_support',
        priority: 'low',
        renderPolicy: 'render_as_section',
        riskLevel: 'none',
        safetyHooks: [],
        privacyClass: 'local_private',
        sanitizationState: 'prompt_derived_sanitized',
        evidence: minedResolved ? { key: minedResolved.key, value: minedResolved.value } : undefined,
        sourceRuntimePath: minedResolved?.runtimePath,
        sourceAnchorScope: minedResolved?.anchorScope,
        confidenceBand: 'low',
        recencyBand: 'recent_project',
        // Mined from the user's own prompts: local content, never safe to reproduce in
        // public-facing copy even after sanitisation.
        publicCopySafe: false,
      });
      continue;
    }

    const isWorkStyle = ref.startsWith('work_style:');
    // RIGHT&GOOD claim strength follows the boundary's corroboration tier: practice
    // wording only when behaviour-verified; work-style stays style metadata.
    const profileTier = signals.groundingTierByRef?.[ref] ?? 'uncorroborated';
    const profileResolved = signals.groundingEvidenceByRef?.[ref];
    facts.push({
      factId: nextId('profile'),
      sourceType: isWorkStyle ? 'work_style_fact' : 'right_good_pattern',
      sourceIds: [ref],
      guidanceKind: 'positive_practice_preservation',
      suggestedActionKind: isWorkStyle ? 'no_action_render_context_only' : 'preserve_behavior',
      targetFamily: 'family_agnostic',
      targetSectionKind: '',
      sourceEvidenceState: 'partial',
      sourceOriginScope: 'longitudinal_param_events',
      claimVerbPolicy: isWorkStyle
        ? 'source_label_only'
        : profileTier === 'promoted_practice_P'
          ? 'may_state_as_user_practice'
          : 'must_phrase_as_possibility',
      factRole: isWorkStyle ? 'neutral_style_support' : 'positive_practice_preservation',
      priority: 'low',
      renderPolicy: 'metadata_only',
      riskLevel: 'none',
      safetyHooks: [],
      privacyClass: 'local_private',
      sanitizationState: 'identity_only_event',
      evidence: evidenceForGuidanceFact('local_private', 'identity_only_event', profileResolved),
      sourceRuntimePath: profileResolved?.runtimePath,
      sourceAnchorScope: profileResolved?.anchorScope,
      registerRoleSource: 'profile_register',
      publicCopySafe: true,
    });
  }

  // The applicability gate runs at the SAME single exit, and for the same reason F3 chose it: a
  // rule applied per construction site is a rule that will one day be missed at one of them.
  // ⚠️ Before dedupe/rank, so a suppressed fact is ranked as suppressed rather than competing for
  // a slot it can no longer render into.
  const observedCategories = request.reviewMomentContext.triggerProvenance
    .classifierProjectFactCandidates?.filter(isPromptEnhancementProjectFactCategoryV1);
  const gated = facts.map((fact) => applyProjectFactApplicabilityV1(fact, observedCategories));

  // F3: stamp the fatigue key at the producer's ONE exit, after dedupe/rank, so
  // no construction site can ship keyless and a safety fact never gets a key.
  return stampPromptEnhancementFatigueKeysV1(
    rankGuidanceFacts(dedupeGuidanceFacts(pairNegativeCapabilitiesWithLiveDetectors(gated))),
    request.reviewMomentContext.projectId,
  );
}

/**
 * A live-detector-confirmed FALSE capability becomes Source A material: when an
 * absence fact fired for one of the env key's corroborating signals, that absence
 * fact gains the env ref as a second source id plus the the sensitive-source rule hook — the safety
 * routing carries BOTH the detector's signal and the environment evidence. The
 * false-capability fact itself stays label-only metadata; without a live detector
 * it never becomes a Source A candidate on its own.
 */
function pairNegativeCapabilitiesWithLiveDetectors(
  facts: readonly PromptEnhancementGuidanceFact[],
): readonly PromptEnhancementGuidanceFact[] {
  const falseCapabilities = facts.filter(
    (fact) => fact.sourceType === 'hard_fact' && fact.factRole === 'safety_confirmation_support',
  );
  if (falseCapabilities.length === 0) return facts;

  return facts.map((fact) => {
    if (fact.sourceType !== 'absence_signal') return fact;
    const pairedEnvRefs: string[] = [];
    for (const falseCap of falseCapabilities) {
      const envKey = falseCap.sourceIds[0]?.replace(/^hard_fact:/, '') ?? '';
      const corroborators = ENV_FACT_CORROBORATOR[envKey] ?? [];
      if (corroborators.some((signal) => fact.sourceIds.some((id) => id.includes(signal)))) {
        pairedEnvRefs.push(...falseCap.sourceIds);
      }
    }
    if (pairedEnvRefs.length === 0) return fact;
    return {
      ...fact,
      sourceIds: [...fact.sourceIds, ...pairedEnvRefs],
      safetyHooks: fact.safetyHooks.includes('safety_negative_capability')
        ? fact.safetyHooks
        : [...fact.safetyHooks, 'safety_negative_capability'],
    };
  });
}

const GUIDANCE_PRIORITY_RANK: Record<PromptEnhancementGuidancePriority, number> = {
  required_survivor: 0,
  high: 1,
  normal: 2,
  low: 3,
  handoff_only: 4,
  deferred_to_ds: 5,
  suppressed: 6,
};

/** Drop duplicate facts that share source type + source id (same evidence twice). */
function dedupeGuidanceFacts(
  facts: readonly PromptEnhancementGuidanceFact[],
): readonly PromptEnhancementGuidanceFact[] {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.sourceType}:${fact.sourceIds.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Stable rank: required survivors first, then high/normal/low. Preserves input order within a tier. */
function rankGuidanceFacts(
  facts: readonly PromptEnhancementGuidanceFact[],
): readonly PromptEnhancementGuidanceFact[] {
  return facts
    .map((fact, index) => ({ fact, index }))
    .sort((a, b) => {
      const byPriority = GUIDANCE_PRIORITY_RANK[a.fact.priority] - GUIDANCE_PRIORITY_RANK[b.fact.priority];
      return byPriority !== 0 ? byPriority : a.index - b.index;
    })
    .map((entry) => entry.fact);
}
