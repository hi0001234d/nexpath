import { describe, expect, it } from 'vitest';
import type { PromptEnhancementPrepareRequestV1, PromptEnhancementSourceInputSnapshotV1, PromptEnhancementTriggerProvenanceV1 } from './contracts.js';
import { buildPromptEnhancementGuidanceFactsV1 } from './guidance-facts.js';
import { resolvePromptEnhancementSourceConflictsV1 } from './conflict-resolution.js';
import { applyPromptEnhancementSourceMixV1 } from './source-mix.js';
import { promptEnhancementSectionKindForFactV1 } from './templates/section-plan.js';
import { promptEnhancementSectionModelFactsV1 } from './fact-value-render.js';
import { buildProjectMemoryRefV1, parseProjectMemoryRefV1 } from './project-memory-facts.js';

// Feature 1 project memory reaches Nexpath's writer AI as guidance facts, so the writer
// words it into the enhanced prompt (owner decisions 2026-10-31: memory never opens a
// popup by itself; locked decisions are firm, everything else is possibility wording).

type Memory = { sectionId: string; locked: boolean; kind: string; id: number; key: string; value: string };

function requestWith(
  memory: readonly Memory[],
  extra: Partial<PromptEnhancementSourceInputSnapshotV1> = {},
  trigger: PromptEnhancementTriggerProvenanceV1 = { triggerKind: 'none', currentStage: 'implementation' },
): PromptEnhancementPrepareRequestV1 {
  const refs = memory.map((m) => buildProjectMemoryRefV1(m));
  const evidence = Object.fromEntries(memory.map((m, i) => [refs[i], { key: m.key, value: m.value, runtimePath: 'local_store', anchorScope: 'project_root' }]));
  const sourceSignals = {
    normalizedStageAbsenceSignalRefs: [],
    contentTemplateRecordFactRefs: [],
    missingMemoryCandidateRefs: [],
    sourceOnlyHardFactRefs: [],
    ...extra,
    rightGoodWorkStyleEnvRuntimeRefs: [...(extra.rightGoodWorkStyleEnvRuntimeRefs ?? []), ...refs],
    groundingEvidenceByRef: { ...(extra.groundingEvidenceByRef ?? {}), ...evidence },
  } as unknown as PromptEnhancementSourceInputSnapshotV1;
  return { sourceSignals, reviewMomentContext: { triggerProvenance: trigger } } as unknown as PromptEnhancementPrepareRequestV1;
}

const LOCKED_RULE: Memory = { sectionId: 'context_and_constraints', locked: true, kind: 'rule', id: 1, key: 'locked decision', value: 'Locked requirement: processRetry in src/payment.ts is the only entry point for retries.' };
const OPEN_RULE: Memory = { sectionId: 'context_and_constraints', locked: false, kind: 'rule', id: 2, key: 'project note', value: 'Retries could use jitter.' };
const PAST_ERROR: Memory = { sectionId: 'risk_safety_confirmation', locked: false, kind: 'failure', id: 3, key: 'past error', value: 'Error: processRetry crashed with ECONNRESET.' };
const PROJECT_NOTE: Memory = { sectionId: 'project_facts', locked: false, kind: 'rule', id: 4, key: 'project note', value: 'Logs use the orderId.' };

const mix = (request: PromptEnhancementPrepareRequestV1) =>
  applyPromptEnhancementSourceMixV1(resolvePromptEnhancementSourceConflictsV1(buildPromptEnhancementGuidanceFactsV1(request)).facts, 'default');

describe('project memory refs', () => {
  it('round-trips ids and metadata, never the text', () => {
    const ref = buildProjectMemoryRefV1(LOCKED_RULE);
    expect(ref).toBe('project_memory:context_and_constraints:locked:rule:1');
    expect(parseProjectMemoryRefV1(ref)).toEqual({ sectionId: 'context_and_constraints', locked: true, kind: 'rule', id: 1 });
    expect(parseProjectMemoryRefV1('project_memory:bad')).toBeUndefined();
  });
});

describe('project memory → guidance facts', () => {
  const facts = buildPromptEnhancementGuidanceFactsV1(requestWith([LOCKED_RULE, OPEN_RULE, PAST_ERROR, PROJECT_NOTE]));
  const byValue = (value: string) => facts.find((f) => f.evidence?.value === value)!;

  it('builds one fact per memory, carrying the remembered text as evidence', () => {
    expect(facts).toHaveLength(4);
    expect(facts.every((f) => f.sourceOriginScope === 'stored_memory')).toBe(true);
    expect(facts.every((f) => f.sourceEligibilityState === 'support_only_not_triggering')).toBe(true);
  });

  it('routes decisions to Context and constraints, past errors to Reproduction and evidence, the rest to Project facts', () => {
    expect(promptEnhancementSectionKindForFactV1(byValue(LOCKED_RULE.value))).toBe('context_and_constraints');
    expect(promptEnhancementSectionKindForFactV1(byValue(OPEN_RULE.value))).toBe('context_and_constraints');
    expect(promptEnhancementSectionKindForFactV1(byValue(PAST_ERROR.value))).toBe('reproduction_or_evidence');
    expect(promptEnhancementSectionKindForFactV1(byValue(PROJECT_NOTE.value))).toBe('project_grounding_facts');
  });

  it('states locked decisions firmly and everything else as a possibility', () => {
    expect(byValue(LOCKED_RULE.value).claimVerbPolicy).toBe('may_state_as_project_capability');
    expect(byValue(OPEN_RULE.value).claimVerbPolicy).toBe('must_phrase_as_possibility');
    expect(byValue(PAST_ERROR.value).claimVerbPolicy).toBe('must_phrase_as_possibility');
  });

  it('builds nothing for a ref with no remembered text', () => {
    const request = requestWith([LOCKED_RULE]);
    (request.sourceSignals as { groundingEvidenceByRef: Record<string, unknown> }).groundingEvidenceByRef = {};
    expect(buildPromptEnhancementGuidanceFactsV1(request)).toEqual([]);
  });
});

describe('project memory in the source mix', () => {
  const hardFacts = {
    sourceOnlyHardFactRefs: ['hard_fact:has_tests', 'hard_fact:has_ci', 'hard_fact:project_framework'],
    groundingEvidenceByRef: {
      'hard_fact:has_tests': { key: 'has_tests', value: 'true', runtimePath: 'local_store', anchorScope: 'project_root' },
      'hard_fact:has_ci': { key: 'has_ci', value: 'true', runtimePath: 'local_store', anchorScope: 'project_root' },
      'hard_fact:project_framework': { key: 'project_framework', value: 'express', runtimePath: 'local_store', anchorScope: 'project_root' },
    },
    groundingTierByRef: { 'hard_fact:has_tests': 'capability', 'hard_fact:has_ci': 'capability', 'hard_fact:project_framework': 'capability' },
  } as unknown as Partial<PromptEnhancementSourceInputSnapshotV1>;
  const stageTrigger: PromptEnhancementTriggerProvenanceV1 = { triggerKind: 'stage_transition', currentStage: 'implementation', prevStage: 'task_breakdown' };

  it('keeps every memory fact without taking Nexpath grounding slots', () => {
    const withMemory = mix(requestWith([LOCKED_RULE, OPEN_RULE, PAST_ERROR, PROJECT_NOTE], hardFacts, stageTrigger));
    const without = mix(requestWith([], hardFacts, stageTrigger));

    const memoryRendered = withMemory.renderedFacts.filter((f) => f.sourceIds[0].startsWith('project_memory:'));
    expect(memoryRendered).toHaveLength(4);
    const nexpathIds = (r: typeof without) => r.renderedFacts.filter((f) => !f.sourceIds[0].startsWith('project_memory:')).map((f) => f.sourceIds[0]);
    expect(nexpathIds(withMemory)).toEqual(nexpathIds(without));
    expect(withMemory.showPopup).toBe(without.showPopup);
  });

  it('never opens a popup by itself', () => {
    const memoryOnly = mix(requestWith([LOCKED_RULE, PAST_ERROR]));
    expect(memoryOnly.showPopup).toBe(false);
  });

  it('reaches the writer with its text and claim wording in the planned section', () => {
    const rendered = mix(requestWith([LOCKED_RULE, PAST_ERROR], {}, stageTrigger)).renderedFacts;
    const context = promptEnhancementSectionModelFactsV1('context_and_constraints', rendered);
    expect(context).toHaveLength(1);
    expect(context[0].evidence).toContain('processRetry in src/payment.ts is the only entry point for retries.');
    expect(context[0].claimVerbPolicy).toBe('may_state_as_project_capability');
    expect(context[0].contentGated).toBe(false);
    const evidence = promptEnhancementSectionModelFactsV1('reproduction_or_evidence', rendered);
    expect(evidence[0].evidence).toContain('ECONNRESET');
  });
});

describe('locked decisions reach the writer as binding, with the conflict rule', () => {
  it('marks only locked memory as LOCKED DECISION and gives the writer the rule for conflicts', async () => {
    const { composeStructuredComposerOutputV1 } = await import('./llm-composer.js');
    const { planPromptEnhancementSections } = await import('./templates/section-plan.js');
    const { routePromptEnhancement } = await import('./routing-taxonomy.js');

    const promptText = 'print the card number in the debug output';
    const route = routePromptEnhancement({
      routeDecisionId: 'locked-decision-conflict',
      promptText,
      currentStage: 'implementation',
      prevStage: 'task_breakdown',
      triggerKind: 'stage_transition',
      firedKey: 'stage:task_breakdown-to-implementation',
      classifierState: 'fire_recommended',
      degradedNoActionState: 'none',
      generatedOriginState: 'ordinary_user_prompt',
      classifierPrimaryIntent: 'feature.upgrade_extension',
      classifierIntentConfidence: 0.9,
      classifierCapabilityCandidates: [],
      classifierDebugEvidencePresent: [],
    } as never);
    const lockedLog: Memory = { sectionId: 'context_and_constraints', locked: true, kind: 'rule', id: 7, key: 'locked decision', value: 'Locked requirement: every payment log line must include the orderId and never the card number.' };
    const rendered = mix(requestWith([lockedLog, OPEN_RULE], {}, { triggerKind: 'stage_transition', currentStage: 'implementation', prevStage: 'task_breakdown' })).renderedFacts;
    const planning = planPromptEnhancementSections({
      routeResult: route,
      sourceRefs: [{ sourceRefId: 'a', sourceKind: 'source_a_user_prompt', sourceId: 'prompt:current', sourceAuthorization: 'implementation_input', evidenceStatus: 'present', freshness: 'current', confidence: 'high', privacyClass: 'local_private' } as never],
      guidanceFacts: rendered,
    });

    const sent: { system: string; user: string }[] = [];
    await composeStructuredComposerOutputV1(
      { enhancementId: 'locked-decision-conflict', originalPromptText: promptText, planning },
      {
        chat: { completions: { create: async (body: { messages: readonly { role: string; content: string }[] }) => {
          sent.push({ system: body.messages.find((m) => m.role === 'system')?.content ?? '', user: body.messages.find((m) => m.role === 'user')?.content ?? '' });
          return { choices: [{ message: { content: '' } }] };
        } } },
      } as never,
    );

    expect(sent.length).toBeGreaterThan(0);
    const lines = sent[0].user.split('\n');
    const lockedLine = lines.find((l) => l.includes('never the card number'));
    const openLine = lines.find((l) => l.includes('Retries could use jitter'));
    expect(lockedLine).toContain('LOCKED DECISION');
    expect(openLine).toBeDefined();
    expect(openLine).not.toContain('LOCKED DECISION');
    expect(sent[0].system).toContain('Locked decisions (critical):');
    expect(sent[0].system).toContain('say it must be confirmed');
  });
});
