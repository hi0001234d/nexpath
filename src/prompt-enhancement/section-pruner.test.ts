import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../store/db.js';
import { upsertProject, setProjectEnvFacts } from '../store/index.js';
import { probeProject } from '../env/env-probe.js';
import { SessionStateManager } from '../classifier/SessionStateManager.js';
import { buildPromptEnhancementRequestForAuto } from '../cli/commands/auto.js';
import { preparePromptEnhancement } from './facade.js';
import {
  prunePromptEnhancementSectionsV1,
  PROMPT_ENHANCEMENT_PRUNE_EXTRA_CAP_V1,
} from './section-pruner.js';
import { routePromptEnhancement } from './routing-taxonomy.js';
import { getPromptStartStopSourceSnapshot } from './source-reality.js';
import {
  planPromptEnhancementSections,
  PROMPT_ENHANCEMENT_UNCONDITIONAL_SAFETY_FLAGS_V1,
} from './templates/section-plan.js';
import type { PromptEnhancementGuidanceFact } from './templates/section-plan.js';
import type { PromptEnhancementSectionPlanItemV1 } from './contracts.js';

/**
 * I2 (§15.3) — the deterministic pruner under the LOCKED criteria (a)/(b)/(c).
 *
 * ⚠️ Every case here is built from the criteria, not from the implementation: stage (a) beats a
 * top-ranked section, the floor beats both stages, and the cap counts EXTRAS rather than sections.
 * Those three are what someone re-reading §15.1 would check, so they are what is asserted.
 */

function fact(factId: string, value = 'a real value', priority = 'normal'): PromptEnhancementGuidanceFact {
  return {
    factId, sourceType: 'hard_fact', sourceIds: [`hard_fact:${factId}`],
    guidanceKind: 'project_grounding', suggestedActionKind: 'ground_in_project_fact',
    targetFamily: 'family_agnostic', targetSectionKind: '', sourceEvidenceState: 'strong',
    priority, renderPolicy: 'render_as_section', riskLevel: 'none',
    privacyClass: 'local_private', sanitizationState: 'not_applicable', safetyHooks: [],
    ...(value === '' ? {} : { evidence: { key: factId, value } }),
  } as unknown as PromptEnhancementGuidanceFact;
}

function section(input: {
  kind: string;
  factIds?: readonly string[];
  isRequired?: boolean;
  safety?: readonly string[];
  obligations?: readonly string[];
}): PromptEnhancementSectionPlanItemV1 {
  return {
    sectionId: `sec-${input.kind}`,
    sectionKind: input.kind,
    isRequired: input.isRequired ?? false,
    safetyFlags: input.safety ?? [],
    sensitivityFlags: [],
    slotObligations: input.obligations ?? [],
    structuredContentPartRefs: (input.factIds ?? []).map((id) => `guidance_fact:${id}`),
  } as unknown as PromptEnhancementSectionPlanItemV1;
}

describe('stage (a) — evidence first, and it runs BEFORE any ranking', () => {
  it('a factless section drops even when the model ranked it FIRST', () => {
    // The whole reason (a) precedes (b): relevance cannot rescue a section with nothing to say.
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [
        section({ kind: 'original_request_or_goal' }),
        section({ kind: 'risk_safety_or_confirmation' }),           // factless, and ranked first
        section({ kind: 'verification_or_test_plan', factIds: ['f1'] }),
      ],
      facts: [fact('f1')],
      relevanceOrder: ['risk_safety_or_confirmation', 'verification_or_test_plan'],
    });
    expect(result.droppedSectionIds).toContain('sec-risk_safety_or_confirmation');
    expect(result.sectionPlans.map((s) => s.sectionKind)).toContain('verification_or_test_plan');
  });

  it('owner ruling 2026-08-20: a factless section the COMPOSER WROTE is not empty, and survives', () => {
    // 🔴 The correction. Nine of the eleven section kinds have no fact producer at all, so
    // "factless" was never a statement about whether the section had anything to say — it was a
    // statement about which two kinds the registry happens to produce facts for. A section the
    // model actually wrote has content, and stage (a) must see it.
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [
        section({ kind: 'original_request_or_goal' }),
        section({ kind: 'verification_or_test_plan' }),   // no facts, and none will ever exist
      ],
      facts: [],
      draftedSectionIds: new Set(['sec-verification_or_test_plan']),
    });
    expect(result.sectionPlans.map((s) => s.sectionKind)).toContain('verification_or_test_plan');
    expect(result.droppedSectionIds).not.toContain('sec-verification_or_test_plan');
  });

  it('the SAME section, with no draft, still drops — the draft is what changed, not the rule', () => {
    // The discriminating half. Identical input minus the draft: stage (a) behaves exactly as it
    // did before, so this pair proves the new clause carries the decision rather than some other
    // part of the pipeline having gone permissive.
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [
        section({ kind: 'original_request_or_goal' }),
        section({ kind: 'verification_or_test_plan' }),
      ],
      facts: [],
    });
    expect(result.droppedSectionIds).toContain('sec-verification_or_test_plan');
  });

  it('the NO-COMPOSER path is untouched: an empty drafted set is facts-only, as before', () => {
    // The no-key path — no key, a refused reply, and every test in this suite that runs without
    // one. A keyless body must never sprout a header nobody is going to fill.
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [
        section({ kind: 'original_request_or_goal' }),
        section({ kind: 'acceptance_or_output_expectation' }),
      ],
      facts: [],
      draftedSectionIds: new Set<string>(),
    });
    expect(result.droppedSectionIds).toContain('sec-acceptance_or_output_expectation');
  });

  it('a draft does NOT beat the cap — it survives stage (a), then competes at stage (b) like anything else', () => {
    // The ruling widened what counts as content. It did not widen the cap, and it did not let the
    // model's own output promote itself past the registry's limit (prohibition 4).
    const extras = ['verification_or_test_plan', 'acceptance_or_output_expectation', 'reproduction_or_evidence', 'behavior_preservation', 'finding_format'];
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [
        section({ kind: 'original_request_or_goal' }),
        ...extras.map((kind) => section({ kind })),
      ],
      facts: [],
      draftedSectionIds: new Set(extras.map((kind) => `sec-${kind}`)),
    });
    const survivingExtras = result.sectionPlans.filter((s) => s.sectionKind !== 'original_request_or_goal');
    expect(survivingExtras).toHaveLength(PROMPT_ENHANCEMENT_PRUNE_EXTRA_CAP_V1);
  });

  it('a section whose only fact carries an EMPTY value is factless', () => {
    // "Factless" is judged on group A's content test — a fact with no renderable value is a fact
    // that says nothing, and a section built only from those has nothing to render either.
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [
        section({ kind: 'original_request_or_goal' }),
        section({ kind: 'context_and_constraints', factIds: ['empty'] }),
      ],
      facts: [fact('empty', '')],
    });
    expect(result.droppedSectionIds).toEqual(['sec-context_and_constraints']);
  });
});

describe('the floor is UNTOUCHABLE (prohibition 18)', () => {
  it('the verbatim original, a required section and a safety section all survive — factless or not', () => {
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [
        section({ kind: 'original_request_or_goal' }),
        section({ kind: 'acceptance_or_output_expectation', isRequired: true }),
        // ⚠️ A MEANINGFUL flag, not `source_honesty`: that one and `no_authority_escalation` are
        // unconditional on every section, so using them here would assert nothing — which is how the
        // implementation's own floor test went wrong before a real body was measured.
        section({ kind: 'risk_safety_or_confirmation', safety: ['sensitive_action_confirmation'] }),
      ],
      facts: [],
      // Ranked last, or not at all — the floor does not consult the ordering.
      relevanceOrder: ['verification_or_test_plan'],
    });
    expect(result.droppedSectionIds, 'a floor section was pruned').toEqual([]);
    expect(result.sectionPlans).toHaveLength(3);
  });

  it('and the floor does not consume the extras budget', () => {
    // The cap is "floor + N extras", not "N sections". A body with a large floor still gets its
    // full allowance of evidenced extras.
    // Exactly the cap's worth of extras, derived rather than written out — the subject here is that
    // the FLOOR does not eat the allowance, not how big the allowance is.
    const extras = ['context_and_constraints', 'verification_or_test_plan', 'reproduction_or_evidence']
      .slice(0, PROMPT_ENHANCEMENT_PRUNE_EXTRA_CAP_V1);
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [
        section({ kind: 'original_request_or_goal' }),
        section({ kind: 'risk_safety_or_confirmation', safety: ['risk_or_rollback'] }),
        ...extras.map((kind, i) => section({ kind, factIds: [`f${i}`] })),
      ],
      facts: extras.map((_, i) => fact(`f${i}`)),
    });
    expect(result.droppedSectionIds).toEqual([]);
    expect(result.sectionPlans).toHaveLength(2 + PROMPT_ENHANCEMENT_PRUNE_EXTRA_CAP_V1);
  });
});

describe('stage (b) — the soft cap, ordered by the observation', () => {
  it('keeps the highest-ranked extras and drops the rest', () => {
    const kinds = ['context_and_constraints', 'verification_or_test_plan', 'reproduction_or_evidence',
      'behavior_preservation', 'point_inventory_or_decomposition'];
    // Ranked most-relevant first; the cap decides how many of these survive.
    const RANKED = ['point_inventory_or_decomposition', 'behavior_preservation', 'reproduction_or_evidence'];
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [section({ kind: 'original_request_or_goal' }),
        ...kinds.map((kind, i) => section({ kind, factIds: [`f${i}`] }))],
      facts: kinds.map((_, i) => fact(`f${i}`)),
      relevanceOrder: RANKED,
    });
    const kept = result.sectionPlans.map((s) => s.sectionKind);
    expect(kept).toHaveLength(1 + PROMPT_ENHANCEMENT_PRUNE_EXTRA_CAP_V1);
    // ⚠️ Derived from the CAP, not written out. This fixture used to list three ranked kinds and
    // assert all three survived, which quietly encoded cap=3 into a test whose subject is "the
    // highest-ranked survive" — so lowering the cap failed it for the wrong reason. The property is
    // that the survivors are the TOP of the ordering, however many the cap allows.
    for (const ranked of RANKED.slice(0, PROMPT_ENHANCEMENT_PRUNE_EXTRA_CAP_V1)) {
      expect(kept, `${ranked} was ranked inside the cap but dropped`).toContain(ranked);
    }
    for (const dropped of RANKED.slice(PROMPT_ENHANCEMENT_PRUNE_EXTRA_CAP_V1)) {
      expect(kept, `${dropped} ranked outside the cap but survived`).not.toContain(dropped);
    }
  });

  it('survivors render in the PLANNED order, not the ranked one', () => {
    // Relevance decides what stays. Re-ordering the body under the reader is a different change,
    // and §15.1 bounds this to pruning inside the single editable body.
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [
        section({ kind: 'original_request_or_goal' }),
        section({ kind: 'context_and_constraints', factIds: ['a'] }),
        section({ kind: 'verification_or_test_plan', factIds: ['b'] }),
      ],
      facts: [fact('a'), fact('b')],
      relevanceOrder: ['verification_or_test_plan', 'context_and_constraints'],
    });
    expect(result.sectionPlans.map((s) => s.sectionKind))
      .toEqual(['original_request_or_goal', 'context_and_constraints', 'verification_or_test_plan']);
  });

  it('an EMPTY ordering means no signal — planned order decides, nothing is ranked last', () => {
    // ⛔ Treating silence as "rank everything last" would be the registry inventing a judgement the
    // model never made (prohibition 4). It is also the degraded/no-key shape, which must not prune
    // differently from a keyed run that simply returned nothing.
    const kinds = ['context_and_constraints', 'verification_or_test_plan', 'reproduction_or_evidence', 'behavior_preservation'];
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [section({ kind: 'original_request_or_goal' }),
        ...kinds.map((kind, i) => section({ kind, factIds: [`f${i}`] }))],
      facts: kinds.map((_, i) => fact(`f${i}`)),
      relevanceOrder: [],
    });
    expect(result.sectionPlans.map((s) => s.sectionKind))
      .toEqual(['original_request_or_goal', ...kinds.slice(0, PROMPT_ENHANCEMENT_PRUNE_EXTRA_CAP_V1)]);
  });
});

describe('criterion (c) — slots follow their section, safety metadata does not', () => {
  it('a dropped section leaves its no-invention state and send policy on the body', () => {
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [
        section({ kind: 'original_request_or_goal' }),
        section({
          kind: 'reproduction_or_evidence',
          obligations: ['reproduction_or_evidence_request', 'no_invention_state', 'send_policy_metadata'],
        }),
      ],
      facts: [],
    });
    expect(result.droppedSectionIds).toEqual(['sec-reproduction_or_evidence']);
    expect(result.inheritedSlotObligations).toContain('no_invention_state');
    expect(result.inheritedSlotObligations).toContain('send_policy_metadata');
    // The VISIBLE slot went with the section — that is the half of (c) that prunes.
    expect(
      result.inheritedSlotObligations,
      'a visible slot survived its section — (c) keeps the checks, not the content',
    ).not.toContain('reproduction_or_evidence_request');
  });
});

describe('criterion 5 — every drop is reason-coded, never a silent loss', () => {
  it('facts from a dropped section carry the locked selection state and a reason code', () => {
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [
        section({ kind: 'original_request_or_goal' }),
        ...['context_and_constraints', 'verification_or_test_plan', 'reproduction_or_evidence', 'behavior_preservation']
          .map((kind, i) => section({ kind, factIds: [`f${i}`] })),
      ],
      facts: [fact('f0'), fact('f1'), fact('f2'), fact('f3')],
      relevanceOrder: ['context_and_constraints', 'verification_or_test_plan', 'reproduction_or_evidence'],
    });
    const dropped = result.facts.find((f) => f.factId === 'f3');
    expect(dropped?.selectionState).toBe('suppressed_by_relevance');
    expect(dropped?.selectionReasonCodes).toContain('section_pruned_by_relevance');
    // A surviving fact is untouched: the record marks what went, not everything.
    expect(result.facts.find((f) => f.factId === 'f0')?.selectionState).toBeUndefined();
  });
});

describe('§47.3 worked example — the canonical scenario, as the plan wrote it', () => {
  /**
   * 🔴 **Rewritten at the phase-36 verification pass, because the previous version did not
   * reproduce the example it was named for.** MEASURED: it asserted only that the factless rollback
   * dropped, and `acceptance` — which the plan says drops at stage (b) — SURVIVED. Its cap
   * assertion (`kept.length - 2 <= CAP`) passed trivially at 3 <= 3, so the canonical fixture for
   * the locked triple exercised stage (a) and nothing else, and neither half of criterion (c) was
   * touched.
   *
   * ⚠️ **Why one more evidenced extra than the plan's prose lists.** The plan illustrates the
   * example with 2 surviving extras; criterion (b) locks the cap as *"floor + 2-3 extras"* and the
   * shipped constant is 3. With exactly 3 evidenced extras the cap cannot bite, so the plan's own
   * stage-(b) outcome is unreachable on that input. A fourth evidenced extra makes the cap real
   * while every other element of the example stays exactly as written. The lock is unchanged — 3 is
   * inside "2-3".
   */
  it('"why is my app so slow": floor + ranked extras; rollback drops at (a), acceptance at (b), slots follow, metadata stays', () => {
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [
        section({ kind: 'original_request_or_goal' }),
        section({ kind: 'context_and_constraints', isRequired: true }),            // the required guidance
        section({ kind: 'reproduction_or_evidence', factIds: ['profiling'] }),     // evidenced + relevant
        section({ kind: 'verification_or_test_plan', factIds: ['verify'] }),       // evidenced + relevant
        section({ kind: 'behavior_preservation', factIds: ['behaviour'] }),        // evidenced + relevant
        // 🔴 Rollback, carrying the flag the REAL PLANNER ALWAYS GIVES IT. `safetyFlagsFor` adds
        // `sensitive_action_confirmation` to every section of this kind unconditionally, and that
        // flag is not in the unconditional pair — so a production rollback section is ALWAYS safety
        // and therefore ALWAYS floor. Measured on the planner, not inferred.
        section({
          kind: 'risk_safety_or_confirmation',
          safety: ['source_honesty', 'no_authority_escalation', 'sensitive_action_confirmation'],
        }),
        // The stage-(a) casualty, on a kind that CAN be factless and non-safety in production. It
        // carries the visible slot + the invisible classes, so one section proves both halves of (c).
        section({
          kind: 'handoff_or_sequence_candidate',
          obligations: ['reproduction_or_evidence_request', 'no_invention_state', 'send_policy_metadata', 'safety_hook_linkage'],
        }),
        // Acceptance: evidenced, but ranked LAST, so the cap is what removes it — stage (b).
        section({
          kind: 'acceptance_or_output_expectation',
          factIds: ['accept'],
          obligations: ['confirmation_clarification'],
        }),
      ],
      facts: [fact('profiling'), fact('verify'), fact('behaviour'), fact('accept')],
      relevanceOrder: [
        'reproduction_or_evidence', 'verification_or_test_plan', 'behavior_preservation',
        'acceptance_or_output_expectation',
      ],
    });

    const kept = result.sectionPlans.map((s) => s.sectionKind);
    // The floor, exactly as the example words it: the verbatim original + one required guidance.
    expect(kept).toContain('original_request_or_goal');
    expect(kept).toContain('context_and_constraints');
    // The evidenced, relevant extras survive.
    expect(kept).toContain('reproduction_or_evidence');
    expect(kept).toContain('verification_or_test_plan');

    // 🔴 **The plan's example says the factless rollback drops at stage (a). The shipped planner
    // cannot produce that**, and this fixture now asserts what production actually does: a
    // `risk_safety_or_confirmation` section is unconditionally flagged
    // `sensitive_action_confirmation`, which makes it safety, which makes it FLOOR — so it SURVIVES
    // while factless. That is L1879 (*"safety sections cannot be pruned, ever"*) beating the
    // example's prose, which is the correct precedence: the bound is locked, the example illustrates.
    expect(kept, 'a safety section was pruned — L1879 is the bound the example cannot override')
      .toContain('risk_safety_or_confirmation');
    // The stage-(a) drop, on a kind that can genuinely be factless and non-safety.
    expect(result.droppedSectionIds, 'the factless non-safety section survived stage (a)')
      .toContain('sec-handoff_or_sequence_candidate');
    // 🔑 The stage-(b) half the old fixture never exercised: evidenced, but ranked last, so the cap
    // removes it. This is the assertion whose absence let the canonical fixture pass while proving
    // only half the criteria.
    expect(result.droppedSectionIds, 'the lowest-ranked evidenced extra survived the cap')
      .toContain('sec-acceptance_or_output_expectation');

    // The cap counts EXTRAS, not sections. Floor here is the original, the one required guidance,
    // and the safety section — so the extras are everything else that survived.
    expect(kept.filter((k) => (
      k !== 'original_request_or_goal' && k !== 'context_and_constraints' && k !== 'risk_safety_or_confirmation'
    ))).toHaveLength(PROMPT_ENHANCEMENT_PRUNE_EXTRA_CAP_V1);

    // Criterion (c), first half — "their visible slots go with them".
    expect(
      result.inheritedSlotObligations,
      'a VISIBLE slot survived its section — (c) keeps the checks, not the content',
    ).not.toContain('reproduction_or_evidence_request');
    // Criterion (c), second half — "send-policy/no-invention metadata stays for the validators",
    // and the criterion's own title: SAFETY METADATA NEVER DROPS.
    expect(result.inheritedSlotObligations).toContain('no_invention_state');
    expect(result.inheritedSlotObligations).toContain('send_policy_metadata');
    expect(result.inheritedSlotObligations).toContain('safety_hook_linkage');
    // Carried from the stage-(b) casualty too, not only from the stage-(a) one.
    expect(
      result.inheritedSlotObligations,
      'a section dropped by the CAP took its surviving obligations with it',
    ).toContain('confirmation_clarification');
  });
});

describe('the pruner is WIRED — the done-when, measured on a composed body', () => {
  // ⛔ This exists because unwiring the pruner from the facade left all 2,064 prompt-enhancement
  // tests green. The unit cases above prove the CRITERIA; only this proves the engine uses them.
  //
  // §15.3's done-when: "a composed risky-debug body renders floor + ≤3 extras; a factless section
  // never renders". Measured before the pruner: 7 sections. After: 4.
  it('renders the floor plus at most the capped extras, and no factless section', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'prune-e2e-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', devDependencies: { vitest: '1.0.0' } }));
    const store = await openStore(join(dir, 'store.db'));
    upsertProject(store, {
      projectRoot: dir, name: 'x', projectType: 'app', language: 'ts', description: '', createdAt: Date.now(),
    });
    setProjectEnvFacts(store, dir, probeProject(dir, Date.now()).facts, Date.now());

    const request = buildPromptEnhancementRequestForAuto({
      auto: { promptText: 'add retry to the payment flow and make sure it is covered', projectRoot: dir, currentAgentMode: 'default' },
      store, session: SessionStateManager.load(store, dir), project: null,
      effectiveLanguage: 'en', configuredRole: null, effectiveFlagType: 'stage_transition',
      firedKey: 'stage_transition:idea', previousStage: 'idea', trigger: { kind: 'stage_transition' },
      stageResult: {
        classification: { stage: 'implementation', confidence: 0.9, tier: 3, allScores: {} },
        signalsPresent: [], signalsAbsent: [], fireRecommendation: true, selectedSignalKey: '',
        reason: 'i2-e2e', degraded: false,
        projectFactCandidates: ['test_runner', 'version_control', 'framework'],
        sectionRelevanceOrder: [],
      },
      streamBOutputs: [],
    } as never);

    const result = await preparePromptEnhancement(request) as never as {
      currentBody: { sections: readonly { sectionKind: string }[] };
    };
    const kinds = result.currentBody.sections.map((s) => s.sectionKind);

    expect(kinds, 'the verbatim original is floor and can never be pruned').toContain('original_request_or_goal');
    expect(
      kinds.length,
      `the body rendered ${kinds.length} sections (${kinds.join(', ')}) — the pruner is not engaged, `
      + 'or the floor is swallowing the cap again',
    ).toBeLessThanOrEqual(5);
    // Stage (a) in a composed body: these are planned and carry no content-bearing fact.
    for (const factless of ['approach_or_steps', 'acceptance_or_output_expectation']) {
      expect(kinds, `${factless} rendered with nothing to say`).not.toContain(factless);
    }
  });
});

describe('the MANDATORY section — owner ruling, 2026-08-20', () => {
  // 🔒 "one section is mandatory. and that mandatory section is Source Signal Guidance… so the
  // enhanced prompt can come with only one section as well. this is the new final rule."
  //
  // It is the section the whole absence/stage/mistake signal chain exists to deliver, so it is floor
  // twice over: stage (a) cannot drop it for having no fact, and stage (b)'s cap cannot squeeze it out.
  it('survives stage (a) with NO fact at all', () => {
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [
        section({ kind: 'original_request_or_goal' }),
        section({ kind: 'source_signal_guidance' }),        // factless
        section({ kind: 'context_and_constraints' }),       // factless too — this one goes
      ],
      facts: [],
    });
    expect(result.sectionPlans.map((s) => s.sectionKind)).toContain('source_signal_guidance');
    expect(result.droppedSectionIds).toEqual(['sec-context_and_constraints']);
  });

  it('survives stage (b) even when every extra outranks it', () => {
    const kinds = ['context_and_constraints', 'verification_or_test_plan', 'reproduction_or_evidence', 'behavior_preservation'];
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [
        section({ kind: 'original_request_or_goal' }),
        ...kinds.map((kind, i) => section({ kind, factIds: [`f${i}`] })),
        section({ kind: 'source_signal_guidance', factIds: ['sig'] }),
      ],
      facts: [...kinds.map((_, i) => fact(`f${i}`)), fact('sig')],
      relevanceOrder: kinds,   // the mandatory section is ranked LAST, by every extra
    });
    expect(
      result.sectionPlans.map((s) => s.sectionKind),
      'the cap squeezed out the one section that must always come',
    ).toContain('source_signal_guidance');
  });

  it('and a body of the original plus the mandatory section alone is valid', () => {
    // The rule's own words: a body can come with only one section. Nothing here enforces a minimum
    // count any more, because a count was never what made a body worth showing.
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [
        section({ kind: 'original_request_or_goal' }),
        section({ kind: 'source_signal_guidance' }),
        section({ kind: 'acceptance_or_output_expectation' }),
        section({ kind: 'verification_or_test_plan' }),
      ],
      facts: [],
    });
    expect(result.sectionPlans.map((s) => s.sectionKind))
      .toEqual(['original_request_or_goal', 'source_signal_guidance']);
  });
});

describe('L5010 — required Source-A survivor material is never dropped', () => {
  // 🔒 "Required Source A survivor + its metadata cannot be pruned silently — compress or move to
  // why-help, NEVER DROP." (§15.1, cited by §15.3 step 5.)
  //
  // 🔴 Round 1 measured this dropping: a section carrying a required_survivor fact, outside the
  // mandatory kind and ranked last, was cut by stage (b)'s cap. Its fact WAS reason-coded, so the
  // loss was not silent — but the bound says never drop, not never drop quietly.
  it('a section carrying a required_survivor fact survives the cap, however it is ranked', () => {
    const extras = ['verification_or_test_plan', 'reproduction_or_evidence', 'behavior_preservation'];
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [
        section({ kind: 'original_request_or_goal' }),
        section({ kind: 'context_and_constraints', factIds: ['a'], isRequired: true }),
        ...extras.map((kind, i) => section({ kind, factIds: [`f${i}`] })),
        section({ kind: 'requirement_source_state', factIds: ['survivor'] }),
      ],
      facts: [fact('a'), ...extras.map((_, i) => fact(`f${i}`)), fact('survivor', 'the survivor', 'required_survivor')],
      relevanceOrder: extras,   // every extra outranks the survivor section
    });
    expect(
      result.sectionPlans.map((s) => s.sectionKind),
      'required Source-A survivor material was pruned for length',
    ).toContain('requirement_source_state');
    expect(result.facts.find((f) => f.factId === 'survivor')?.selectionState).toBeUndefined();
  });
});

describe('I2 observability — the pruner leaves a trace on an ordinary run', () => {
  /**
   * 🔴 Added at the phase-36 verification pass. The pruner already produced its dropped-section list
   * and the facade already carried it — and NOTHING read it. The one thing this module exists to do
   * was invisible from a normal run, which is the hidden seam prohibition 10 forbids.
   *
   * 🔑 It is also phase 37 (I3)'s required after-number — *"the same distribution with the pruner
   * on"* — so the measurement now rides an ordinary boundary log instead of a bespoke probe.
   */
  it('a body that pruned sections reports how many; a body that pruned none reports nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'prune-count-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', devDependencies: { vitest: '1.0.0' } }));
    const store = await openStore(join(dir, 'store.db'));
    upsertProject(store, {
      projectRoot: dir, name: 'x', projectType: 'app', language: 'ts', description: '', createdAt: Date.now(),
    });
    setProjectEnvFacts(store, dir, probeProject(dir, Date.now()).facts, Date.now());

    const request = buildPromptEnhancementRequestForAuto({
      auto: { promptText: 'add retry to the payment flow and make sure it is covered', projectRoot: dir, currentAgentMode: 'default' },
      store, session: SessionStateManager.load(store, dir), project: null,
      effectiveLanguage: 'en', configuredRole: null, effectiveFlagType: 'stage_transition',
      firedKey: 'stage_transition:idea', previousStage: 'idea', trigger: { kind: 'stage_transition' },
      stageResult: {
        classification: { stage: 'implementation', confidence: 0.9, tier: 3, allScores: {} },
        signalsPresent: [], signalsAbsent: [], fireRecommendation: true, selectedSignalKey: '',
        reason: 'prune-count', degraded: false,
        projectFactCandidates: ['test_runner', 'version_control', 'framework'],
        sectionRelevanceOrder: [],
      },
      streamBOutputs: [],
    } as never);

    const result = await preparePromptEnhancement(request) as never as {
      prunedSectionCount?: number;
      currentBody: { sections: readonly { sectionKind: string }[] };
    };

    // This fixture runs without a key, so no drafts exist and stage (a) drops the factless
    // sections — the pruner definitely did work here.
    expect(
      result.prunedSectionCount,
      'the pruner dropped sections but reported no count — the trace is missing again',
    ).toBeGreaterThan(0);
    // Discriminating: the count is the DROPPED sections, not the surviving ones.
    expect(result.prunedSectionCount).not.toBe(result.currentBody.sections.length);
  });
});

describe('the production invariant behind the floor — measured on the PLANNER, not assumed', () => {
  /**
   * 🔴 Added at the phase-36 verification pass, after the §47.3 fixture was found asserting a state
   * the planner cannot produce. `safetyFlagsFor` adds `sensitive_action_confirmation` to EVERY
   * section of kind `risk_safety_or_confirmation`, unconditionally — and that flag is not one of the
   * two unconditional ones the pruner discounts. So such a section is always safety, always floor,
   * and can never be pruned.
   *
   * 🔑 This is why the plan's worked example — *"rollback (factless) drops at stage (a)"* — is not
   * reproducible on the shipped planner, and why L1879 (*"safety sections cannot be pruned, ever"*)
   * is the bound that wins. Asserted against the REAL planner so the fixture above can never drift
   * back to testing an impossible state without this failing too.
   */
  it('a planned risk/confirmation section always carries a MEANINGFUL safety flag', () => {
    const snapshot = getPromptStartStopSourceSnapshot();
    const route = routePromptEnhancement({
      promptText: 'Fix the failing payment test, the test failure blocks ci, and explain the verification.',
      promptOrigin: 'user', reviewMoment: 'UserPromptSubmit_preparation', sourceSnapshot: undefined,
      sourceFactRefs: ['src-a-1'], classifierState: 'fire_recommended', degradedNoActionState: 'none',
      generatedOriginState: 'ordinary_user_prompt', oldDecisionSessionPayloadPresent: false,
      promptStartBoundary: snapshot.hookBoundary, deliveryBoundary: snapshot.deliveryBoundary,
    } as never);

    // A `confirm_risk` fact is what pulls the kind into a plan — the same route the recent-history
    // safeguard lane takes.
    const riskFact = {
      factId: 'f-risk', sourceType: 'prompt_derived_fact', sourceIds: ['history_sensitive_action:deployment'],
      guidanceKind: 'safety_or_confirmation', suggestedActionKind: 'confirm_risk',
      targetFamily: 'family_agnostic', targetSectionKind: '', sourceEvidenceState: 'partial',
      priority: 'normal', renderPolicy: 'render_as_section', riskLevel: 'none',
      // 🔴 **NO safety hooks, and that is the whole point.** The first version of this test gave the
      // fact `safetyHooks: ['safety_sensitive_source']` — which `safetyFlagsFor` copies onto the
      // section — so the assertion below was satisfied by the FACT's hook and proved nothing about
      // the KIND. A mutation probe removing the unconditional kind rule left it green. With no hook
      // and no risk level, the only thing that can make this section safety is the kind rule itself.
      safetyHooks: [], privacyClass: 'public_safe',
      sanitizationState: 'not_applicable', evidence: { key: 'deployment', value: 'a safeguard line' },
    } as unknown as PromptEnhancementGuidanceFact;

    const planned = planPromptEnhancementSections({
      routeResult: route as never,
      sourceRefs: [{
        sourceRefId: 'src-a-1', sourceKind: 'source_a_user_prompt', sourceId: 'prompt:1',
        sourceAuthorization: 'source_fact_only', evidenceStatus: 'present', freshness: 'current',
        confidence: 'high', privacyClass: 'public_safe',
      }] as never,
      guidanceFacts: [riskFact],
    });

    const risk = planned.sectionPlans.find((plan) => plan.sectionKind === 'risk_safety_or_confirmation');
    // Premise guard: if planning ever stops producing the kind, this must fail loudly rather than
    // pass while asserting nothing.
    expect(risk, 'the confirm_risk fact no longer plans its section').toBeDefined();

    const meaningful = risk!.safetyFlags.filter(
      (flag) => !PROMPT_ENHANCEMENT_UNCONDITIONAL_SAFETY_FLAGS_V1.includes(flag),
    );
    expect(
      meaningful.length,
      'the kind is no longer unconditionally safety — the §47.3 fixture and the floor both depend on this',
    ).toBeGreaterThan(0);

    // And therefore the pruner treats it as floor: factless, ranked nowhere, and it still survives.
    const pruned = prunePromptEnhancementSectionsV1({
      sectionPlans: [section({ kind: 'original_request_or_goal' }), risk!],
      facts: [],
    });
    expect(pruned.sectionPlans.map((s) => s.sectionKind)).toContain('risk_safety_or_confirmation');
  });
});

describe('I3 step 4 — a body\'s floor/extras split is answerable from a run', () => {
  /**
   * 🔴 Added at phase 37. §15.4 step 4 judges whether a body exceeded floor + 3, and that question
   * was UNANSWERABLE on a live run: the pruner reported only what it dropped, so a legitimate floor
   * of 5 with 3 extras and a genuine breach of 4 floor + 4 extras produced the same section count.
   * §15.3c's L5010 floor-growth makes that distinction real rather than theoretical — a sim body
   * measured 8 sections and could not be judged either way.
   */
  it('the pruner reports how many survivors were floor, and the extras respect the cap', () => {
    const extras = ['verification_or_test_plan', 'acceptance_or_output_expectation', 'reproduction_or_evidence', 'behavior_preservation'];
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [
        section({ kind: 'original_request_or_goal' }),                                  // floor
        section({ kind: 'context_and_constraints', isRequired: true }),                 // floor
        section({ kind: 'source_signal_guidance' }),                                    // floor (mandatory)
        ...extras.map((kind) => section({ kind })),
      ],
      facts: [],
      draftedSectionIds: new Set(extras.map((kind) => `sec-${kind}`)),
    });

    expect(result.floorSectionCount).toBe(3);
    // The split the log now makes readable: survivors minus floor is the extras count, and it is
    // the cap that bounds it.
    const extrasRendered = result.sectionPlans.length - result.floorSectionCount;
    expect(extrasRendered).toBe(PROMPT_ENHANCEMENT_PRUNE_EXTRA_CAP_V1);
  });

  it('a GROWN floor is reported as floor, not silently counted against the cap', () => {
    // 🔑 The case that made this necessary. An L5010 required-survivor section joins the floor, so a
    // body legitimately renders more sections without the cap being breached. Before this field a
    // reader could not tell that apart from a cap failure.
    const extras = ['verification_or_test_plan', 'acceptance_or_output_expectation', 'reproduction_or_evidence'];
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [
        section({ kind: 'original_request_or_goal' }),
        section({ kind: 'context_and_constraints', isRequired: true }),
        section({ kind: 'source_signal_guidance' }),
        section({ kind: 'requirement_source_state', factIds: ['survivor'] }),   // L5010 → floor
        ...extras.map((kind) => section({ kind })),
      ],
      facts: [fact('survivor', 'a required survivor value', 'required_survivor')],
      draftedSectionIds: new Set(extras.map((kind) => `sec-${kind}`)),
    });

    expect(result.floorSectionCount, 'the L5010 survivor was not counted as floor').toBe(4);
    expect(result.sectionPlans.length - result.floorSectionCount).toBeLessThanOrEqual(
      PROMPT_ENHANCEMENT_PRUNE_EXTRA_CAP_V1,
    );
  });
});

describe('I3 step 3 — relevance ordering visibly follows the prompt, ASSERTED', () => {
  /**
   * 🔴 Added at the phase-37 verification pass. §15.4 step 3 says this must be *"asserted on the
   * labelled set"*, and it was only MEASURED: the I3 runner prints the numbers and fails nothing, so
   * if the registry stopped honouring the ordering tomorrow, every test would stay green and only a
   * manual re-read of a JSON file would catch it.
   *
   * 🔑 The property, stated as the step states it: given a debug-serving ordering, a debug prompt's
   * surviving extras are debug-serving rather than generic. The contrast is against NO ordering —
   * the degraded / no-observation shape, where planned order decides — because that is the only
   * honest baseline. (Comparing two orderings is what made the runner's first version report a
   * false zero; both lists ranked the same section near the top.)
   */
  const DEBUG_SERVING = ['reproduction_or_evidence', 'verification_or_test_plan', 'behavior_preservation'];

  it('a debug-serving ordering changes which extras survive, and never keeps fewer of them', () => {
    // A body with more evidenced extras than the cap allows, so the ordering has something to do.
    // The debug-serving kinds sit LAST in planned order — without an ordering they lose.
    const planned = ['point_inventory_or_decomposition', 'finding_format', 'handoff_or_sequence_candidate',
      ...DEBUG_SERVING];
    const sectionPlans = [
      section({ kind: 'original_request_or_goal' }),
      section({ kind: 'context_and_constraints', isRequired: true }),
      ...planned.map((kind, i) => section({ kind, factIds: [`f${i}`] })),
    ];
    const facts = planned.map((_unused, i) => fact(`f${i}`));
    const floorKinds = ['original_request_or_goal', 'context_and_constraints'];
    const extrasOf = (r: ReturnType<typeof prunePromptEnhancementSectionsV1>) =>
      r.sectionPlans.map((s) => s.sectionKind).filter((k) => !floorKinds.includes(k));

    const unranked = extrasOf(prunePromptEnhancementSectionsV1({ sectionPlans, facts, relevanceOrder: [] }));
    const ranked = extrasOf(prunePromptEnhancementSectionsV1({ sectionPlans, facts, relevanceOrder: DEBUG_SERVING }));

    // Premise guard: without an ordering the debug kinds are planned last and lose the cap, so the
    // test has something to prove. If planning order ever changes this fails loudly.
    const debugCount = (kinds: readonly string[]) => kinds.filter((k) => DEBUG_SERVING.includes(k)).length;
    expect(debugCount(unranked), 'the premise is gone — debug kinds already win without an ordering').toBe(0);

    // The step's own bar.
    expect(ranked, 'the ordering changed nothing — the registry is not honouring it').not.toEqual(unranked);
    expect(debugCount(ranked), 'a debug-serving ordering kept no debug-serving sections')
      .toBeGreaterThan(debugCount(unranked));
    // Every surviving extra is debug-serving: "debug-serving, not generic", as the step words it.
    expect(ranked.every((k) => DEBUG_SERVING.includes(k))).toBe(true);
  });

  it('an ordering cannot promote past the FLOOR or the CAP — it only chooses among extras', () => {
    // ⛔ Prohibition 4: the model observes, the registry decides. Ranking must not let the
    // observation win more slots than the cap allows, nor displace floor material.
    const planned = ['point_inventory_or_decomposition', ...DEBUG_SERVING];
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: [
        section({ kind: 'original_request_or_goal' }),
        section({ kind: 'context_and_constraints', isRequired: true }),
        ...planned.map((kind, i) => section({ kind, factIds: [`f${i}`] })),
      ],
      facts: planned.map((_unused, i) => fact(`f${i}`)),
      relevanceOrder: DEBUG_SERVING,
    });
    const kinds = result.sectionPlans.map((s) => s.sectionKind);
    expect(kinds).toContain('original_request_or_goal');
    expect(kinds).toContain('context_and_constraints');
    expect(kinds.filter((k) => !['original_request_or_goal', 'context_and_constraints'].includes(k)))
      .toHaveLength(PROMPT_ENHANCEMENT_PRUNE_EXTRA_CAP_V1);
  });
});

describe('Feature 1 locked decisions (owner decision 2026-10-31)', () => {
  const memoryFact = (factId: string, locked: boolean) => ({
    ...fact(factId),
    sourceType: 'prompt_derived_fact',
    sourceIds: [`project_memory:context_and_constraints:${locked ? 'locked' : 'open'}:rule:1`],
  }) as unknown as PromptEnhancementGuidanceFact;

  const plans = [
    section({ kind: 'original_request_or_goal' }),
    section({ kind: 'problem_statement', factIds: ['p1'], isRequired: true }),
    section({ kind: 'reproduction_or_evidence', factIds: ['r1'] }),
    section({ kind: 'verification_or_test_plan', factIds: ['v1'] }),
    section({ kind: 'acceptance_or_output_expectation', factIds: ['a1'] }),
    section({ kind: 'context_and_constraints', factIds: ['mem'] }),
  ];
  // The model ranks the constraints section last, below the extra-section cap.
  const relevanceOrder = ['reproduction_or_evidence', 'verification_or_test_plan', 'acceptance_or_output_expectation', 'context_and_constraints'];

  it('never prunes the section carrying a locked decision, even when ranked last', () => {
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: plans,
      facts: [fact('p1'), fact('r1'), fact('v1'), fact('a1'), memoryFact('mem', true)],
      relevanceOrder,
    });
    expect(result.sectionPlans.map((s) => s.sectionKind)).toContain('context_and_constraints');
  });

  it('still prunes it normally when the memory is not locked', () => {
    const result = prunePromptEnhancementSectionsV1({
      sectionPlans: plans,
      facts: [fact('p1'), fact('r1'), fact('v1'), fact('a1'), memoryFact('mem', false)],
      relevanceOrder,
    });
    expect(result.droppedSectionIds).toContain('sec-context_and_constraints');
  });
});
