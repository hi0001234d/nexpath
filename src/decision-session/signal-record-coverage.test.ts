import { describe, it, expect } from 'vitest';
import { SIGNAL_DEFINITIONS } from '../classifier/signals.js';
import { recordSignalTypeForFlag, hasShippedRecord } from './content-template-source.js';
import { MIGRATED_SIGNALS } from './selection-registry.js';

// Forward-direction coverage gate: every fireable absence signal must resolve to a shipped, migrated
// record. When recordSignalTypeForFlag() produces a name with no shipped record, resolveContentSource()
// returns 'static' → the stop hook serves no options → an advisory with nothing to pick. The existing
// content-template-tooling checks only the reverse (record → record), so a signal-key → record naming
// drift slips through; this test closes that gap.

describe('signal → content-template record coverage', () => {
  it('every fireable absence signal resolves to a shipped, migrated record', () => {
    const unresolved: string[] = [];
    for (const s of SIGNAL_DEFINITIONS) {
      const rec = recordSignalTypeForFlag(`absence:${s.key}`);
      if (!rec || !hasShippedRecord(rec) || !MIGRATED_SIGNALS.has(rec)) {
        unresolved.push(`${s.key} -> ${rec ?? '(undefined)'}`);
      }
    }
    expect(SIGNAL_DEFINITIONS.length).toBeGreaterThan(100); // sanity: the fireable set is non-trivial
    expect(
      unresolved,
      `signals with no servable record (=> advisory with no options):\n${unresolved.join('\n')}`,
    ).toEqual([]);
  });

  // Lock the target for each key whose `ABSENCE_<UPPER(key)>` name drifted from the record that ships
  // its content. These are exactly the keys carried by SIGNAL_RECORD_ALIASES; drop or mis-target one
  // and this fails (as does the coverage test above).
  const DRIFTED_TARGETS: Readonly<Record<string, string>> = {
    alternatives_seeking:           'ABSENCE_ALTERNATIVES',
    architecture_conflict:          'ABSENCE_ARCH_CONFLICT',
    dependency_management:          'ABSENCE_DEPENDENCY_MGMT',
    refactoring_review:             'ABSENCE_REFACTORING',
    no_agent_pushback:              'ABSENCE_NO_PUSHBACK',
    prompt_context_richness:        'ABSENCE_PROMPT_CONTEXT',
    spec_acceptance_check:          'ABSENCE_SPEC_ACCEPTANCE',
    behaviour_testing:              'BEHAVIOUR_TESTING',
    environment_and_secrets:        'ABSENCE_ENV_AND_SECRETS',
    feature_scope_before_build:     'ABSENCE_FEATURE_SCOPE',
    requirement_clarity_before_ask: 'ABSENCE_REQUIREMENT_CLARITY',
    debugging_observation_gap:      'ABSENCE_DEBUGGING_OBSERVATION',
  };

  it('each drifted signal key resolves to its intended shipped record', () => {
    for (const [key, rec] of Object.entries(DRIFTED_TARGETS)) {
      expect(recordSignalTypeForFlag(`absence:${key}`), key).toBe(rec);
      expect(hasShippedRecord(rec), rec).toBe(true);
    }
  });

  it('a non-drifted key still uses the ABSENCE_<UPPER(key)> convention', () => {
    expect(recordSignalTypeForFlag('absence:idea_scoping')).toBe('ABSENCE_IDEA_SCOPING');
  });

  it('a non-absence flagType has no content-template record', () => {
    expect(recordSignalTypeForFlag('stage_transition')).toBeUndefined();
  });
});
