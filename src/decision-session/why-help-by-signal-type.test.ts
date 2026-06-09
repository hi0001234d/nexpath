import { describe, expect, it } from 'vitest';
import { WHY_HELP_PER_CLASS } from './why-help.js';
import {
  WHY_HELP_BY_SIGNAL_TYPE,
  getWhyHelpForSignalType,
} from './why-help-by-signal-type.js';

describe('why-help-by-signal-type — shape + coverage', () => {
  it('contains exactly 136 entries across all 9 signal classes', () => {
    expect(Object.keys(WHY_HELP_BY_SIGNAL_TYPE).length).toBe(136);
  });

  it('every entry resolves to one of the 9 WHY_HELP_PER_CLASS entries', () => {
    const validEntries = new Set(Object.values(WHY_HELP_PER_CLASS));
    for (const [signalType, entry] of Object.entries(WHY_HELP_BY_SIGNAL_TYPE)) {
      expect(validEntries.has(entry), `signalType ${signalType} maps to a value not in WHY_HELP_PER_CLASS`).toBe(true);
    }
  });

  it('per-class signalType counts match the canonical split (7/21/11/8/8/14/20/35/12)', () => {
    const expectedCounts: Record<string, number> = {
      class1_stage_transition:            7,
      class2_verification_quality:        21,
      class3_spec_architecture:           11,
      class4_release_observability_infra: 8,
      class5_session_quality:             8,
      class6_planning_idea_task:          14,
      class7_cool_geek_vibe_coder:        20,
      class8_role_cluster:                35,
      class9_academic_hardcore_pro:       12,
    };

    const actualCounts: Record<string, number> = {};
    for (const [classKey, entry] of Object.entries(WHY_HELP_PER_CLASS)) {
      actualCounts[classKey] = 0;
      for (const mappedEntry of Object.values(WHY_HELP_BY_SIGNAL_TYPE)) {
        if (mappedEntry === entry) actualCounts[classKey]++;
      }
    }

    expect(actualCounts).toEqual(expectedCounts);
  });
});

describe('getWhyHelpForSignalType — resolver', () => {
  it('returns the class-1 entry for stage-transition signalTypes', () => {
    expect(getWhyHelpForSignalType('IDEA_TO_PRD')).toBe(WHY_HELP_PER_CLASS.class1_stage_transition);
    expect(getWhyHelpForSignalType('TASK_REVIEW')).toBe(WHY_HELP_PER_CLASS.class1_stage_transition);
    expect(getWhyHelpForSignalType('RELEASE_TO_FEEDBACK')).toBe(WHY_HELP_PER_CLASS.class1_stage_transition);
  });

  it('returns the class-2 entry for verification / quality signalTypes (base + routed)', () => {
    expect(getWhyHelpForSignalType('ABSENCE_TEST_CREATION')).toBe(WHY_HELP_PER_CLASS.class2_verification_quality);
    expect(getWhyHelpForSignalType('ABSENCE_REFACTORING')).toBe(WHY_HELP_PER_CLASS.class2_verification_quality);
    expect(getWhyHelpForSignalType('ABSENCE_PERFORMANCE_AWARENESS')).toBe(WHY_HELP_PER_CLASS.class2_verification_quality);
  });

  it('returns the class-3 entry for spec / architecture signalTypes', () => {
    expect(getWhyHelpForSignalType('ABSENCE_SPEC_ACCEPTANCE')).toBe(WHY_HELP_PER_CLASS.class3_spec_architecture);
    expect(getWhyHelpForSignalType('ABSENCE_ALTERNATIVES')).toBe(WHY_HELP_PER_CLASS.class3_spec_architecture);
  });

  it('returns the class-4 entry for release / observability / infra signalTypes', () => {
    expect(getWhyHelpForSignalType('ABSENCE_OBSERVABILITY')).toBe(WHY_HELP_PER_CLASS.class4_release_observability_infra);
    expect(getWhyHelpForSignalType('ABSENCE_DEPENDENCY_AUDIT_GAP')).toBe(WHY_HELP_PER_CLASS.class4_release_observability_infra);
  });

  it('returns the class-5 entry for session-quality signalTypes', () => {
    expect(getWhyHelpForSignalType('ABSENCE_CONTEXT_LOSS')).toBe(WHY_HELP_PER_CLASS.class5_session_quality);
    expect(getWhyHelpForSignalType('ABSENCE_COMPREHENSION')).toBe(WHY_HELP_PER_CLASS.class5_session_quality);
    expect(getWhyHelpForSignalType('ABSENCE_NO_PUSHBACK')).toBe(WHY_HELP_PER_CLASS.class5_session_quality);
  });

  it('returns the class-6 entry for planning / idea / task signalTypes', () => {
    expect(getWhyHelpForSignalType('ABSENCE_TASK_DEFINITION_OF_DONE')).toBe(WHY_HELP_PER_CLASS.class6_planning_idea_task);
    expect(getWhyHelpForSignalType('ABSENCE_PHASE_TRANSITION')).toBe(WHY_HELP_PER_CLASS.class6_planning_idea_task);
  });

  it('returns the class-7 entry for cool_geek vibe-coder signalTypes', () => {
    expect(getWhyHelpForSignalType('ABSENCE_FEATURE_COMPLETION_CHECK')).toBe(WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder);
    expect(getWhyHelpForSignalType('ABSENCE_MVP_SCOPE_DISCIPLINE')).toBe(WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder);
  });

  it('returns the class-8 entry for role-cluster signalTypes', () => {
    expect(getWhyHelpForSignalType('ABSENCE_USER_VALUE_CHECK')).toBe(WHY_HELP_PER_CLASS.class8_role_cluster);
    expect(getWhyHelpForSignalType('ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK')).toBe(WHY_HELP_PER_CLASS.class8_role_cluster);
  });

  it('returns the class-9 entry for academic / hardcore_pro signalTypes', () => {
    expect(getWhyHelpForSignalType('ABSENCE_FAILURE_MODE_ANALYSIS')).toBe(WHY_HELP_PER_CLASS.class9_academic_hardcore_pro);
    expect(getWhyHelpForSignalType('ABSENCE_SECURITY_THREAT_MODELING')).toBe(WHY_HELP_PER_CLASS.class9_academic_hardcore_pro);
  });

  it('returns null for unknown signalTypes (graceful-fail)', () => {
    expect(getWhyHelpForSignalType('NOT_A_REAL_SIGNAL')).toBeNull();
    expect(getWhyHelpForSignalType('')).toBeNull();
  });
});
