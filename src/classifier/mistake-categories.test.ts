import { describe, it, expect } from 'vitest';
import {
  MISTAKE_CATEGORIES,
  routingToPolarity,
  findRoutingInvariantViolations,
  type MistakeCategory,
} from './mistake-categories.js';
import { resolveEngine } from '../decision-session/engine-registry.js';
import { absenceSignalEngine } from '../decision-session/absence-signal-engine.js';

function byName(name: string): MistakeCategory {
  const c = MISTAKE_CATEGORIES.find((x) => x.name === name);
  if (!c) throw new Error(`missing seed category: ${name}`);
  return c;
}

describe('mistake-categories — routing tag → polarity / engine', () => {
  it('maps routing tags to engine polarities', () => {
    expect(routingToPolarity('absence')).toBe('corrective');
    expect(routingToPolarity('governance')).toBe('governance');
    expect(routingToPolarity('meta')).toBe('meta');
  });

  it('absence categories route to the AbsenceSignalEngine; governance/meta route to neither', () => {
    expect(resolveEngine(routingToPolarity('absence'))).toBe(absenceSignalEngine);
    expect(resolveEngine(routingToPolarity('governance'))).toBeNull();
    expect(resolveEngine(routingToPolarity('meta'))).toBeNull();
  });
});

describe('mistake-categories — routing invariant (mapToAbsenceSignal iff absence)', () => {
  it('the seeded registry satisfies the invariant', () => {
    expect(findRoutingInvariantViolations(MISTAKE_CATEGORIES)).toEqual([]);
  });

  it('flags an absence entry missing mapToAbsenceSignal', () => {
    const bad: MistakeCategory = { name: 'bad_absence', routing: 'absence', detect: () => 0 };
    expect(findRoutingInvariantViolations([bad])).toEqual(['bad_absence']);
  });

  it('flags a non-absence entry that carries mapToAbsenceSignal', () => {
    const bad: MistakeCategory = { name: 'bad_meta', routing: 'meta', mapToAbsenceSignal: 'ABSENCE_X', detect: () => 0 };
    expect(findRoutingInvariantViolations([bad])).toEqual(['bad_meta']);
  });
});

describe('mistake-categories — seeded straddle entries (one per routing tag)', () => {
  it('mode mismatch is absence-routed with a mapToAbsenceSignal', () => {
    const c = byName('coding_agent_mode_mismatch');
    expect(c.routing).toBe('absence');
    expect(c.mapToAbsenceSignal).toBe('ABSENCE_AGENT_MODE_MISMATCH');
  });

  it('prompt versioning gap is governance-routed with no mapToAbsenceSignal', () => {
    const c = byName('prompt_versioning_gap');
    expect(c.routing).toBe('governance');
    expect(c.mapToAbsenceSignal).toBeUndefined();
  });

  it('dismissal-streak is meta-routed and fires on an 8+ acceptance streak', () => {
    const c = byName('advisory_fatigue_dismissal_streak');
    expect(c.routing).toBe('meta');
    expect(c.detect([], { consecutiveAcceptanceStreak: 8 })).toBe(1);
    expect(c.detect([], { consecutiveAcceptanceStreak: 3 })).toBe(0);
    expect(c.detect([], {})).toBe(0);
  });

  it('the two seeds whose detectors await their channel report 0 (Phase-1 placeholder)', () => {
    // mode-mismatch needs the captured agent-mode channel; versioning-gap needs its
    // governance handler — until those land their detectors assert nothing.
    expect(byName('coding_agent_mode_mismatch').detect([], {})).toBe(0);
    expect(byName('coding_agent_mode_mismatch').detect([], { currentAgentMode: 'execute' })).toBe(0);
    expect(byName('prompt_versioning_gap').detect([], {})).toBe(0);
  });
});

describe('mistake-categories — add-a-category (append one entry)', () => {
  it('a new entry routes via its tag with no detector/router change', () => {
    const extra: MistakeCategory = {
      name: 'copy_paste_sprawl',
      routing: 'absence',
      mapToAbsenceSignal: 'ABSENCE_COPY_PASTE_SPRAWL',
      detect: () => 0,
    };
    const registry = [...MISTAKE_CATEGORIES, extra];
    expect(findRoutingInvariantViolations(registry)).toEqual([]);
    expect(resolveEngine(routingToPolarity(extra.routing))).toBe(absenceSignalEngine);
  });
});
