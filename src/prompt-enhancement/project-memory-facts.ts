/**
 * Feature 1 (context engineering) → Prompt Enhancement writer.
 *
 * Feature 1 remembers what was decided in a project (locked decisions, rules, past
 * errors) and picks the memory relevant to the current prompt. That memory reaches
 * Nexpath's writer AI as ordinary guidance facts, so the writer words it into the
 * enhanced prompt alongside Nexpath's own guidance. Nothing is pasted in afterwards.
 *
 * Owner decisions (2026-10-31):
 *  - Memory never opens a popup by itself: it only enriches a popup Nexpath already
 *    decided to show (`support_only_not_triggering`, Source B lane).
 *  - Locked decisions are stated firmly; everything else is phrased as a possibility.
 *  - Feature 1 already applied its own budget (max 10 lines), so these facts do not
 *    compete for Nexpath's Source B grounding slots (see source-mix.ts).
 *
 * The ref carries the routing metadata; the fact's TEXT travels as typed evidence in
 * `groundingEvidenceByRef`, like every other producer.
 */

import type { PromptEnhancementGuidanceFact } from './templates/section-plan.js';

export const PROMPT_ENHANCEMENT_PROJECT_MEMORY_REF_PREFIX_V1 = 'project_memory:';

/** Feature 1's section ids, as returned with its selected facts. */
export type ProjectMemorySectionIdV1 = 'context_and_constraints' | 'risk_safety_confirmation' | 'project_facts';

export interface ProjectMemoryRefPartsV1 {
  sectionId: string;
  locked: boolean;
  kind: string;
  id: number;
}

/** `project_memory:<sectionId>:<locked|open>:<kind>:<id>` — ids only, never the fact's text. */
export function buildProjectMemoryRefV1(parts: ProjectMemoryRefPartsV1): string {
  return `${PROMPT_ENHANCEMENT_PROJECT_MEMORY_REF_PREFIX_V1}${parts.sectionId}:${parts.locked ? 'locked' : 'open'}:${parts.kind}:${parts.id}`;
}

export function parseProjectMemoryRefV1(ref: string): ProjectMemoryRefPartsV1 | undefined {
  if (!ref.startsWith(PROMPT_ENHANCEMENT_PROJECT_MEMORY_REF_PREFIX_V1)) return undefined;
  const [sectionId, lockState, kind, id] = ref.slice(PROMPT_ENHANCEMENT_PROJECT_MEMORY_REF_PREFIX_V1.length).split(':');
  if (!sectionId || (lockState !== 'locked' && lockState !== 'open') || !kind || !/^\d+$/.test(id ?? '')) return undefined;
  return { sectionId, locked: lockState === 'locked', kind, id: Number(id) };
}

export function isPromptEnhancementProjectMemoryFactV1(fact: Pick<PromptEnhancementGuidanceFact, 'sourceIds'>): boolean {
  return fact.sourceIds.some((id) => id.startsWith(PROMPT_ENHANCEMENT_PROJECT_MEMORY_REF_PREFIX_V1));
}

/** Short label for the evidence key; the value is the remembered text itself. */
export function projectMemoryEvidenceKeyV1(kind: string, locked: boolean): string {
  if (kind === 'failure') return 'past error';
  if (kind === 'pattern_alert') return 'open item';
  if (kind === 'intent') return 'stated goal';
  return locked ? 'locked decision' : 'project note';
}

/**
 * Builds the guidance fact for one `project_memory:` ref. Returns undefined when the
 * ref is malformed or carries no text (an empty fact would make a section look
 * grounded while saying nothing).
 */
export function buildProjectMemoryGuidanceFactV1(
  ref: string,
  factId: string,
  resolved: { key: string; value: string; runtimePath?: PromptEnhancementGuidanceFact['sourceRuntimePath']; anchorScope?: PromptEnhancementGuidanceFact['sourceAnchorScope'] } | undefined,
): PromptEnhancementGuidanceFact | undefined {
  const parts = parseProjectMemoryRefV1(ref);
  if (!parts || !resolved || resolved.value.trim() === '') return undefined;

  // Where it lands. Past errors are evidence about the problem; decisions and rules
  // are constraints; anything else is a fact about the project. The routing map in
  // section-plan.ts stays the one authority, so no targetSectionKind override.
  const isError = parts.kind === 'failure' || parts.kind === 'pattern_alert';
  const isConstraint = !isError && parts.sectionId === 'context_and_constraints';
  const firm = parts.locked && !isError;

  return {
    factId,
    // Memory of what the developer and agent said, so the prompt-derived type; its
    // origin is stored memory, which keeps it out of the current-prompt clamp.
    sourceType: 'prompt_derived_fact',
    sourceIds: [ref],
    sourceEligibilityState: 'support_only_not_triggering',
    guidanceKind: isError ? 'debug_evidence' : 'project_grounding',
    suggestedActionKind: isError ? 'capture_reproduction' : isConstraint ? 'no_action_render_context_only' : 'ground_in_project_fact',
    targetFamily: 'family_agnostic',
    targetSectionKind: '',
    sourceEvidenceState: firm ? 'strong' : 'partial',
    sourceOriginScope: 'stored_memory',
    claimVerbPolicy: firm ? 'may_state_as_project_capability' : 'must_phrase_as_possibility',
    factRole: 'project_grounding_support',
    priority: firm ? 'high' : 'normal',
    renderPolicy: 'render_as_section',
    riskLevel: 'none',
    safetyHooks: [],
    // Quotes the project's own conversation: local content, never public copy.
    privacyClass: 'local_private',
    sanitizationState: 'prompt_derived_sanitized',
    evidence: { key: resolved.key, value: resolved.value },
    sourceRuntimePath: resolved.runtimePath,
    sourceAnchorScope: resolved.anchorScope,
    confidenceBand: firm ? 'high' : 'medium',
    recencyBand: 'recent_project',
    publicCopySafe: false,
  };
}

/**
 * A locked decision from Feature 1 memory. Its section is never pruned (owner decision
 * 2026-10-31): a decision the developer locked must not silently vanish from the prompt.
 */
export function isLockedProjectMemoryFactV1(fact: Pick<PromptEnhancementGuidanceFact, 'sourceIds'>): boolean {
  return fact.sourceIds.some((id) => parseProjectMemoryRefV1(id)?.locked === true);
}
