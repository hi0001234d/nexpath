/**
 * I2 — the deterministic pruner, under the LOCKED drop-criteria (§15.1).
 *
 * 🔒 The criteria are Hiren's, given 2026-08-16, and are not re-derived here:
 *   **(a)** evidence first, then relevance — an EMPTY section drops BEFORE ranking; the model's
 *           ordering ranks the remainder; the REGISTRY drops below-bar.
 *   **(b)** soft cap — the locked floor plus at most 2–3 extras.
 *   **(c)** slots follow their section, but no-invention state, send-policy and confirmation
 *           linkage stay on the body invisibly for the checks.
 *
 * 🔴 **What "empty" means was CORRECTED on 2026-08-20, by measuring a real body.** It used to mean
 * "no content-carrying fact", and stage (a) ran BEFORE the composer — so a section was judged on
 * facts it was never going to have, at a moment when the wording that would have filled it did not
 * exist yet. Only two section kinds have fact producers at all (`project_grounding_facts` and
 * `source_signal_guidance`); the other nine sockets in `SECTION_KIND_BY_ACTION` are wired and
 * unplugged. So "factless" did not mean "nothing to say" — it meant "not one of the two kinds
 * anything produces facts for".
 *
 * 🔑 Measured on the sim, same scenario, before and after this pruner first landed: a six-section
 * body carrying Approach, Acceptance and Verification — all three written from the developer's own
 * prompt, all three factless — became a three-section body. `context_and_constraints`, factless in
 * exactly the same way, survived only because the floor's "first required guidance" happened to
 * reach it first. Three good sections died and a fourth lived, on ordering luck.
 *
 * 🔒 Empty now means **no content-carrying fact AND no surviving composer draft**. A section the
 * model actually wrote has something to say, whether or not the registry had a fact for it.
 *
 * ⚠️ The evidence-before-relevance ORDER is untouched, which is what the criterion locks: whatever
 * is empty still drops before anything is ranked, and the ordering still cannot rescue it.
 *
 * ⛔ **The registry decides; the model only ordered** (prohibition 4). I1's observation is an input
 * to stage (b) and to nothing else: it cannot promote an empty section past stage (a), and it
 * cannot touch the floor at all. An empty or absent ordering is not "rank everything last" — it
 * means no relevance signal, and the cap then falls back to the planner's own order.
 *
 * 🔒 **The floor is UNTOUCHABLE** (prohibition 18, §15.1): the verbatim original, one required
 * guidance section, and safety when risky. Safety sections cannot be pruned, ever — §15.1's bound,
 * and §42.3's fatigue guard says the same thing about the same material.
 */

import { isLockedProjectMemoryFactV1 } from './project-memory-facts.js';
import type { PromptEnhancementGuidanceFact } from './templates/section-plan.js';
import { PROMPT_ENHANCEMENT_UNCONDITIONAL_SAFETY_FLAGS_V1 } from './templates/section-plan.js';
import type { PromptEnhancementSectionPlanItemV1 } from './contracts.js';

/**
 * The obligations that SURVIVE their section's removal (criterion (c)).
 *
 * ⚠️ These are the classes that exist for a CHECK rather than for the reader: the no-invention
 * state, the send policy, the confirmation linkage and the safety hooks. A visible slot is the
 * section's own; these are the body's, and a body that quietly stopped carrying them because a
 * section was pruned would be a safety regression dressed as a length saving.
 */
const OBLIGATIONS_SURVIVING_THEIR_SECTION_V1: readonly string[] = [
  'no_invention_state',
  'send_policy_metadata',
  'safety_hook_linkage',
  'confirmation_clarification',
];

/**
 * The ONE section that must always reach the reader.
 *
 * 🔒 **Owner ruling, 2026-08-20, which supersedes the old ">3 sections" release constraint:**
 * *"we are up and open to show enhanced prompt even with one section. but yeah one section is
 * mandatory. and that mandatory section is Source Signal Guidance… so yeah that one is mandatory
 * and should always come. so the enhanced prompt can come with only one section as well. this is
 * the new final rule."*
 *
 * ⛔ So it is FLOOR here: exempt from stage (a) — it survives even with no content-carrying fact —
 * and exempt from stage (b)'s cap. It is the section the whole absence/stage/mistake signal chain
 * exists to deliver, and a body without it has dropped the thing nexpath had to say.
 *
 * ⚠️ Distinct from §17.13's retry-then-discard, which removes this section when the COMPOSER twice
 * fails to name the signal. That is a defective draft being withheld; this is the section never
 * being pruned for length or for lacking a fact. The two do not overlap and neither weakens the other.
 */
export const PROMPT_ENHANCEMENT_MANDATORY_SECTION_KIND_V1 = 'source_signal_guidance';

/**
 * Criterion (b)'s cap: the floor, plus at most this many extras.
 *
 * 🔒 **LOWERED FROM 3 TO 2 — Hiren's ruling, 2026-08-20, superseding criterion (b)'s "2-3 extras".**
 * His words: *"too many sections are still considered as too much noise… so prefer bringing it down
 * to 4 on average. so the extra allowed which are 2-3 would become only 1-2."*
 *
 * 🔑 **Why the cap is the whole lever.** Measured on the frozen labelled set, every shown body had
 * at least 3 extras available, so bodies land on the cap rather than under it: the average body is
 * floor + cap, and floor measured ~3.25. That makes this constant, not the pruner's ranking, the
 * thing that decides body length.
 *
 * ⚠️ **Stated when the ruling was made, and chosen anyway:** cap 2 gives ~5.25 sections on average
 * rather than the ~4 named as the target; cap 1 would have given ~4.25. The owner took 2 with that
 * in front of him — recorded here so the gap between the target and the constant is not mistaken
 * later for an oversight.
 *
 * ⛔ An ALTERNATING cap (1, then 2, then 1…) was proposed and rejected: it makes the same prompt
 * produce different bodies depending on when it fired, and a directional action re-enters `prepare`,
 * so a section could appear inside a popup the user was already reading. §15.3 step 1 requires this
 * registry to prune DETERMINISTICALLY.
 */
export const PROMPT_ENHANCEMENT_PRUNE_EXTRA_CAP_V1 = 2;

export interface PromptEnhancementPruneResultV1 {
  /** The sections that survive, in their planned order. */
  readonly sectionPlans: readonly PromptEnhancementSectionPlanItemV1[];
  /** Dropped section ids, for the record and for the log. */
  readonly droppedSectionIds: readonly string[];
  /** Criterion (c): obligations inherited from dropped sections, kept on the body. */
  readonly inheritedSlotObligations: readonly string[];
  /** Criterion 5: the facts whose sections went, reason-coded rather than silently gone. */
  readonly facts: readonly PromptEnhancementGuidanceFact[];
  /**
   * How many surviving sections were FLOOR — i.e. exempt from the cap.
   *
   * 🔴 Added at phase 37 (I3), because step 4 asks whether a body exceeded floor + 3 and that
   * question was UNANSWERABLE on a live run. The pruner computed the floor and reported only what it
   * dropped, so a measured 8-section body could not be split into floor and extras: a legitimate
   * floor of 5 with 3 extras and a genuine cap breach of 4 floor + 4 extras look identical from
   * outside. §15.3c's L5010 floor-growth makes that distinction real, not theoretical.
   */
  readonly floorSectionCount: number;
}

/** A fact carries content when it has a renderable value — group A's own test, not a kind list. */
function factHasContentV1(fact: PromptEnhancementGuidanceFact): boolean {
  return (fact.evidence?.value ?? '').trim().length > 0;
}

/**
 * Safety material, which can never be pruned (§15.1: *"safety sections cannot be pruned, ever"*).
 *
 * ⚠️ Read from the section's OWN typed flags, never from a list of kind names — a name list would be
 * a second map of the same meaning and would drift the first time a kind is renamed.
 */
function isSafetySectionV1(section: PromptEnhancementSectionPlanItemV1): boolean {
  // 🔴 Corrected during implementation, by MEASURING a real body: `safetyFlags.length > 0` is true
  // of EVERY section, because `source_honesty` and `no_authority_escalation` are unconditional. With
  // that test the floor swallowed 7 of 7 sections and the pruner did nothing at all — while its own
  // unit tests passed, because fixtures only set the flags that mean something.
  //
  // 🔑 What marks a section as safety MATERIAL is a flag beyond that unconditional pair — a
  // confirmation requirement, a risk/rollback overlay, a fact-supplied hook — or a sensitivity flag,
  // which is only ever produced by a high-risk fact.
  return section.safetyFlags.some((flag) => !PROMPT_ENHANCEMENT_UNCONDITIONAL_SAFETY_FLAGS_V1.includes(flag))
    || section.sensitivityFlags.length > 0;
}

/**
 * The floor, EXACTLY as the criterion words it: *"verbatim original + ONE required guidance +
 * safety when risky"*.
 *
 * 🔴 **Corrected during implementation, by measuring rather than reasoning.** The first version
 * treated EVERY `isRequired` section as floor. On a real composed body that was five of seven
 * sections, so the cap had nothing left to bite on and the pruner was inert while its own unit
 * tests passed — they passed because the fixtures marked only ONE section required, which is the
 * criterion's shape and not the planner's.
 *
 * 🔑 The criterion says ONE. Templates mark several sections required, and the rest of them are
 * EXTRAS competing under (a) and (b) like anything else — which is exactly what §47.3's worked
 * example shows when acceptance, a required-shaped section, drops at stage (b).
 *
 * ⚠️ L5010 still binds what happens next: a required Source-A survivor is never *silently* lost —
 * the drop is reason-coded on its facts by the caller, which is criterion 5's job.
 */
function selectFloorV1(
  sectionPlans: readonly PromptEnhancementSectionPlanItemV1[],
  carriesRequiredSurvivor: (section: PromptEnhancementSectionPlanItemV1) => boolean,
): ReadonlySet<string> {
  const floor = new Set<string>();
  let requiredGuidanceTaken = false;
  for (const section of sectionPlans) {
    if (
      section.sectionKind === 'original_request_or_goal'
      || section.sectionKind === PROMPT_ENHANCEMENT_MANDATORY_SECTION_KIND_V1
      || isSafetySectionV1(section)
      // 🔒 L5010, and it is a BOUND of its own rather than part of the floor's three names:
      // *"Required Source A survivor + its metadata cannot be pruned silently — compress or move to
      // why-help, NEVER DROP."* Required-survivor material is not an "extra" competing for the cap;
      // it is the Source-A material the popup exists to carry.
      //
      // 🔴 Found in verification round 1 by MEASURING: a section carrying a `required_survivor` fact
      // outside the mandatory kind was dropped at stage (b). Its fact was reason-coded, so the loss
      // was not SILENT — but L5010 says never drop, not merely never drop quietly. Keeping it is the
      // honest reading; "compress or move to why-help" is the alternative and would be a larger
      // change that this criterion does not require in order to be satisfied.
      || carriesRequiredSurvivor(section)
    ) {
      floor.add(section.sectionId);
      continue;
    }
    // The FIRST required guidance section, in planned order, and only the first.
    if (section.isRequired && !requiredGuidanceTaken) {
      floor.add(section.sectionId);
      requiredGuidanceTaken = true;
    }
  }
  return floor;
}

/**
 * Prune under the locked criteria. Pure: it decides, and the caller applies.
 *
 * ⚠️ Order is load-bearing and is the criteria's own: evidence, THEN relevance. A section with no
 * content-carrying fact is gone before the ordering is consulted, so a model that ranked it first
 * cannot save it — which is the whole point of stage (a) preceding stage (b).
 */
export function prunePromptEnhancementSectionsV1(input: {
  readonly sectionPlans: readonly PromptEnhancementSectionPlanItemV1[];
  readonly facts: readonly PromptEnhancementGuidanceFact[];
  /** I1's ordering, most-useful-first. Empty or absent = no relevance signal. */
  readonly relevanceOrder?: readonly string[];
  /**
   * The sections the composer actually wrote, after the renderer's own draft validation.
   *
   * 🔒 The second half of stage (a)'s question (owner ruling, 2026-08-20). Absent or empty is the
   * NO-COMPOSER path — no key, a refused reply, every test that runs without a key — and there
   * stage (a) is facts-only exactly as it always was, so a keyless body never sprouts an empty
   * header.
   */
  readonly draftedSectionIds?: ReadonlySet<string>;
}): PromptEnhancementPruneResultV1 {
  const { sectionPlans, facts } = input;
  const relevanceOrder = input.relevanceOrder ?? [];

  const factsById = new Map(facts.map((fact) => [fact.factId, fact]));
  const contentFactIdsFor = (section: PromptEnhancementSectionPlanItemV1): readonly string[] =>
    section.structuredContentPartRefs
      .map((ref: string) => ref.replace(/^guidance_fact:/, ''))
      .filter((factId: string) => {
        const fact = factsById.get(factId);
        return fact !== undefined && factHasContentV1(fact);
      });

  // ── Stage (a): evidence first. An EMPTY section drops BEFORE anything is ranked. ────────────
  //
  // 🔒 "Empty" = no content-carrying fact AND no surviving composer draft. A section the model
  // actually wrote is not empty just because the registry had no fact producer for its kind — and
  // for nine of the eleven kinds, no producer exists at all.
  const drafted = input.draftedSectionIds ?? new Set<string>();
  // A required Source-A survivor, or a locked Feature 1 decision (owner decision 2026-10-31:
  // a decision the developer locked must not silently vanish), puts its section in the floor.
  const carriesRequiredSurvivor = (section: PromptEnhancementSectionPlanItemV1): boolean =>
    section.structuredContentPartRefs
      .map((ref: string) => ref.replace(/^guidance_fact:/, ''))
      .some((factId: string) => {
        const fact = factsById.get(factId);
        return fact?.priority === 'required_survivor' || (fact !== undefined && isLockedProjectMemoryFactV1(fact));
      });
  const floorIds = selectFloorV1(sectionPlans, carriesRequiredSurvivor);
  const floor: PromptEnhancementSectionPlanItemV1[] = [];
  const evidenced: PromptEnhancementSectionPlanItemV1[] = [];
  const dropped: PromptEnhancementSectionPlanItemV1[] = [];
  for (const section of sectionPlans) {
    if (floorIds.has(section.sectionId)) { floor.push(section); continue; }
    if (contentFactIdsFor(section).length === 0 && !drafted.has(section.sectionId)) { dropped.push(section); continue; }
    evidenced.push(section);
  }

  // ── Stage (b): the soft cap, ordered by the model's observation where it has one. ───────────
  // ⚠️ Sections the ordering never mentions keep their planned position AFTER the ranked ones,
  // rather than being treated as lowest-ranked: an absent entry is missing information, not a
  // judgement, and inventing a judgement from silence is what prohibition 4 forbids.
  const rank = (section: PromptEnhancementSectionPlanItemV1): number => {
    const at = relevanceOrder.indexOf(section.sectionKind);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  const ranked = [...evidenced]
    .map((section, planned) => ({ section, planned, rank: rank(section) }))
    .sort((a, b) => (a.rank - b.rank) || (a.planned - b.planned))
    .map((entry) => entry.section);

  const kept = ranked.slice(0, PROMPT_ENHANCEMENT_PRUNE_EXTRA_CAP_V1);
  dropped.push(...ranked.slice(PROMPT_ENHANCEMENT_PRUNE_EXTRA_CAP_V1));

  // Survivors render in the PLANNED order, not the ranked one: relevance decides what stays, not
  // what the body reads like. Reordering a body under the reader is a separate change nobody asked
  // for, and §15.1 bounds this to pruning inside the single editable body.
  const keptIds = new Set([...floor, ...kept].map((section) => section.sectionId));
  const survivors = sectionPlans.filter((section) => keptIds.has(section.sectionId));

  // ── Criterion (c): the visible slots go with the section; these stay on the body. ───────────
  const inherited = new Set<string>();
  for (const section of dropped) {
    for (const obligation of section.slotObligations) {
      if (OBLIGATIONS_SURVIVING_THEIR_SECTION_V1.includes(obligation)) inherited.add(obligation);
    }
  }

  // ── Criterion 5: reason-code the facts whose section went. Never a silent loss. ─────────────
  const droppedFactIds = new Set(dropped.flatMap((section) => contentFactIdsFor(section)));
  const reasonCoded = facts.map((fact) => (
    droppedFactIds.has(fact.factId)
      ? {
        ...fact,
        selectionState: 'suppressed_by_relevance' as const,
        selectionReasonCodes: [...(fact.selectionReasonCodes ?? []), 'section_pruned_by_relevance'],
      }
      : fact
  ));

  return {
    sectionPlans: survivors,
    droppedSectionIds: dropped.map((section) => section.sectionId),
    inheritedSlotObligations: [...inherited],
    facts: reasonCoded,
    // Counted from the SURVIVORS, not from `floor` — a floor section is by definition never dropped,
    // so the two agree, and counting the rendered set is what a reader of the log is comparing against.
    floorSectionCount: survivors.filter((section) => floorIds.has(section.sectionId)).length,
  };
}
