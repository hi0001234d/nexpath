import { describe, it, expect } from 'vitest';
import { STAGES, type Stage, type UserProfile, type UserNature, type UserRole } from '../classifier/types.js';
import type { FlagType } from '../classifier/Stage2Trigger.js';
import {
  resolveDecisionContent,
  ABSENCE_CONTENT,
  ABSENCE_CONTENT_CASUAL,
  ABSENCE_CONTENT_FOUNDER,
  ABSENCE_CONTENT_INDIE_HACKER,
  ABSENCE_CONTENT_PM,
  ABSENCE_CONTENT_PRO_GEEK_SOUL,
} from './options.js';
import { ABSENCE_CONTENT_BEGINNER } from './options-beginner.js';
import { TRANSITION_CONTENT } from './options.js';
import { WHY_HELP_BY_SIGNAL_TYPE } from './why-help-by-signal-type.js';
import { resolveSelection, selectionRegister } from './selection-registry.js';
import { profileToRegister } from './register.js';

const NATURES: (UserNature | undefined)[] = [undefined, 'beginner', 'cool_geek', 'hardcore_pro', 'pro_geek_soul'];
const ROLES: (UserRole | null | undefined)[] = [undefined, null, 'founder', 'indie_hacker', 'pm', 'vibe_coder'];

// The full absence-key surface across every register/role map (+ a couple of
// keys that exist in NO map, to exercise the fall-through paths).
const SIGNAL_KEYS = [
  ...new Set(
    [
      ABSENCE_CONTENT, ABSENCE_CONTENT_CASUAL, ABSENCE_CONTENT_BEGINNER,
      ABSENCE_CONTENT_FOUNDER, ABSENCE_CONTENT_INDIE_HACKER, ABSENCE_CONTENT_PM,
      ABSENCE_CONTENT_PRO_GEEK_SOUL,
    ].flatMap((m) => Object.keys(m)),
  ),
  'NONEXISTENT_SIGNAL_KEY', 'another_unmapped_key',
];

function profile(nature: UserNature | undefined, role: UserRole | null | undefined): UserProfile {
  return { nature, role } as unknown as UserProfile;
}

describe('selection-registry — cascade parity', () => {
  it('absence fires: resolveSelection === resolveDecisionContent across nature × role × stage × signalKey', () => {
    let checked = 0;
    for (const nature of NATURES) {
      for (const role of ROLES) {
        const p = profile(nature, role);
        for (const stage of STAGES) {
          for (const key of SIGNAL_KEYS) {
            const flag = `absence:${key}` as FlagType;
            expect(resolveSelection(stage, flag, p)).toBe(resolveDecisionContent(stage, flag, p));
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000); // real coverage, not a vacuous pass
  });

  it('stage transitions (incl. skips): parity across nature × role × current × prev', () => {
    for (const nature of NATURES) {
      for (const role of ROLES) {
        const p = profile(nature, role);
        for (const currentStage of STAGES) {
          for (const prevStage of [undefined, ...STAGES] as (Stage | undefined)[]) {
            expect(resolveSelection(currentStage, 'stage_transition', p, prevStage))
              .toBe(resolveDecisionContent(currentStage, 'stage_transition', p, prevStage));
          }
        }
      }
    }
  });

  it('parity for an absent profile (undefined / null)', () => {
    for (const stage of STAGES) {
      for (const key of ['ABSENCE_TEST_CREATION', 'NONEXISTENT_SIGNAL_KEY']) {
        const flag = `absence:${key}` as FlagType;
        expect(resolveSelection(stage, flag, undefined)).toBe(resolveDecisionContent(stage, flag, undefined));
        expect(resolveSelection(stage, flag, null)).toBe(resolveDecisionContent(stage, flag, null));
      }
      expect(resolveSelection(stage, 'stage_transition', undefined)).toBe(resolveDecisionContent(stage, 'stage_transition', undefined));
    }
  });
});

describe('selection-registry — single-dispatch register axis', () => {
  it('maps each nature to its register (every case explicit)', () => {
    expect(selectionRegister('beginner')).toBe('beginner');
    expect(selectionRegister('hardcore_pro')).toBe('formal');
    expect(selectionRegister('cool_geek')).toBe('casual');
    expect(selectionRegister('pro_geek_soul')).toBe('casual');
    expect(selectionRegister(undefined)).toBe('casual');
    expect(selectionRegister(null)).toBe('casual');
  });

  it('documents the known cool_geek divergence from profileToRegister', () => {
    // profileToRegister maps cool_geek → beginner; the content cascade (and thus
    // this parity-preserving registry) maps cool_geek → casual. Intentional until
    // the two are reconciled.
    expect(profileToRegister(profile('cool_geek', null))).toBe('beginner');
    expect(selectionRegister('cool_geek')).toBe('casual');
  });
});

describe('selection-registry — completeness', () => {
  it('every stage + every known signalKey resolves to a DecisionContent (no throw / undefined)', () => {
    const p = profile('hardcore_pro', 'founder');
    for (const stage of STAGES) {
      const t = resolveSelection(stage, 'stage_transition', p);
      expect(t).toBeTruthy();
      expect(typeof t.signalType).toBe('string');
      for (const key of SIGNAL_KEYS) {
        const a = resolveSelection(stage, `absence:${key}` as FlagType, p);
        expect(a).toBeTruthy();
        expect(typeof a.signalType).toBe('string');
      }
    }
  });

  it('every one of the 136 mapped signalTypes resolves AND matches the cascade', () => {
    const signalTypes = Object.keys(WHY_HELP_BY_SIGNAL_TYPE);
    expect(signalTypes.length).toBe(136);
    for (const nature of NATURES) {
      const p = profile(nature, undefined);
      for (const st of signalTypes) {
        const flag = `absence:${st}` as FlagType;
        const got = resolveSelection('implementation', flag, p);
        expect(got).toBeTruthy();
        expect(got).toBe(resolveDecisionContent('implementation', flag, p));
      }
    }
  });
});

describe('selection-registry — multi-axis chaining precedence', () => {
  it('a role override outranks the register absence map for the same signalKey', () => {
    // Prefer a key whose role entry DIFFERS from the register entry (so the
    // precedence is observable by reference); fall back to any founder key.
    const differing = Object.keys(ABSENCE_CONTENT_FOUNDER).find(
      (k) => k in ABSENCE_CONTENT_CASUAL && ABSENCE_CONTENT_FOUNDER[k] !== ABSENCE_CONTENT_CASUAL[k],
    );
    const key = differing ?? Object.keys(ABSENCE_CONTENT_FOUNDER)[0];
    expect(key).toBeTruthy();
    // cool_geek → casual register (non-beginner, so role applies), role = founder.
    const got = resolveSelection('implementation', `absence:${key}` as FlagType, profile('cool_geek', 'founder'));
    expect(got).toBe(ABSENCE_CONTENT_FOUNDER[key]); // role map consulted first
    if (differing) expect(got).not.toBe(ABSENCE_CONTENT_CASUAL[key]); // and it genuinely outranks register
  });

  it('the pro_geek_soul override outranks the register absence map (no role)', () => {
    const key = Object.keys(ABSENCE_CONTENT_PRO_GEEK_SOUL)[0];
    expect(key).toBeTruthy();
    const got = resolveSelection('implementation', `absence:${key}` as FlagType, profile('pro_geek_soul', null));
    expect(got).toBe(ABSENCE_CONTENT_PRO_GEEK_SOUL[key]);
  });
});

describe('selection-registry — stage-transition skip mechanism', () => {
  it('a skipped transition returns the nearest intermediate content (not the direct stage)', () => {
    // idea → architecture skips prd; the nearest intermediate transition is prd's.
    const p = profile('hardcore_pro', null); // formal register → TRANSITION_CONTENT
    const got = resolveSelection('architecture', 'stage_transition', p, 'idea');
    expect(got).toBe(TRANSITION_CONTENT['prd']);
    expect(got).not.toBe(TRANSITION_CONTENT['architecture']); // skip fired, not the direct stage
    expect(got).toBe(resolveDecisionContent('architecture', 'stage_transition', p, 'idea'));
  });
});
