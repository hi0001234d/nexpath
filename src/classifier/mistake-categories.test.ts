import { describe, it, expect } from 'vitest';
import {
  MISTAKE_CATEGORIES,
  routingToPolarity,
  findRoutingInvariantViolations,
  liveDetectors,
  type MistakeCategory,
} from './mistake-categories.js';
import type { PromptRecord } from './types.js';
import { SIGNAL_DEFINITIONS } from './signals.js';
import { resolveEngine } from '../decision-session/engine-registry.js';
import { absenceSignalEngine } from '../decision-session/absence-signal-engine.js';

function byName(name: string): MistakeCategory {
  const c = MISTAKE_CATEGORIES.find((x) => x.name === name);
  if (!c) throw new Error(`missing category: ${name}`);
  return c;
}
/** Minimal prompt record for detector tests (detectors read only .text + array length). */
function p(text: string): PromptRecord {
  return { text } as unknown as PromptRecord;
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

describe('mistake-categories — full population (37 params + 1 meta)', () => {
  it('holds 38 entries: 36 absence + 1 governance + 1 meta', () => {
    expect(MISTAKE_CATEGORIES.length).toBe(38);
    const byRouting = (r: string) => MISTAKE_CATEGORIES.filter((c) => c.routing === r).length;
    expect(byRouting('absence')).toBe(36);
    expect(byRouting('governance')).toBe(1);
    expect(byRouting('meta')).toBe(1);
  });

  it('every entry has a valid severity and (if any) a valid requiresChannel', () => {
    for (const c of MISTAKE_CATEGORIES) {
      expect(['high', 'medium', 'low']).toContain(c.severity);
      if (c.requiresChannel !== undefined) expect(['X', 'M', 'c']).toContain(c.requiresChannel);
    }
  });

  it('the whole registry satisfies the routing invariant (mapToAbsenceSignal iff absence)', () => {
    expect(findRoutingInvariantViolations(MISTAKE_CATEGORIES)).toEqual([]);
  });

  it('category names are unique', () => {
    const names = MISTAKE_CATEGORIES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every channel-gated detector (requiresChannel set) is dark — returns 0 regardless of input', () => {
    const richHistory = Array.from({ length: 60 }, () => p('still broken, same error again, fix it'));
    const richCtx = { consecutiveAcceptanceStreak: 99, consecutiveFrustratedPrompts: 99, hasVersionControl: false, hasBackups: false, hasSeparateEnvs: false, hasSecurityScanner: false, currentAgentMode: 'execute' };
    for (const c of MISTAKE_CATEGORIES) {
      if (c.requiresChannel !== undefined) expect(c.detect(richHistory, richCtx)).toBe(0);
    }
  });
});

describe('mistake-categories — routing invariant violations', () => {
  it('flags an absence entry missing mapToAbsenceSignal', () => {
    const bad: MistakeCategory = { name: 'bad_absence', routing: 'absence', severity: 'low', detect: () => 0 };
    expect(findRoutingInvariantViolations([bad])).toEqual(['bad_absence']);
  });

  it('flags a non-absence entry that carries mapToAbsenceSignal', () => {
    const bad: MistakeCategory = { name: 'bad_meta', routing: 'meta', severity: 'low', mapToAbsenceSignal: 'ABSENCE_X', detect: () => 0 };
    expect(findRoutingInvariantViolations([bad])).toEqual(['bad_meta']);
  });
});

describe('mistake-categories — live detectors (channels a / b / Y available now)', () => {
  it('secret_in_prompt fires when a secret-shaped token is pasted into a prompt', () => {
    const c = byName('secret_in_prompt');
    expect(c.detect([p('use this key sk-abcdefghijklmnop12345')], {})).toBe(1);
    expect(c.detect([p('api_key = ABCDEFGH12345678')], {})).toBe(1);
    expect(c.detect([p('please add a login form')], {})).toBe(0);
    expect(c.requiresChannel).toBeUndefined();
  });

  it('ai_overtrust_accept_without_read fires on a long accept-without-review streak', () => {
    const c = byName('ai_overtrust_accept_without_read');
    expect(c.detect([], { consecutiveAcceptanceStreak: 5 })).toBe(1);
    expect(c.detect([], { consecutiveAcceptanceStreak: 2 })).toBe(0);
    expect(c.detect([], {})).toBe(0);
  });

  it('mega_prompt_overload fires on a single oversized prompt', () => {
    const c = byName('mega_prompt_overload');
    expect(c.detect([p('x'.repeat(2100))], {})).toBe(1);
    expect(c.detect([p('short prompt')], {})).toBe(0);
  });

  it('context_window_overflow fires on a very long session', () => {
    const c = byName('context_window_overflow');
    expect(c.detect(Array.from({ length: 41 }, () => p('go on')), {})).toBe(1);
    expect(c.detect(Array.from({ length: 10 }, () => p('go on')), {})).toBe(0);
  });

  it('ai_fix_doom_loop fires on a run of consecutive error/fix prompts', () => {
    const c = byName('ai_fix_doom_loop');
    expect(c.detect(Array.from({ length: 4 }, () => p('still broken, same error again')), {})).toBe(1);
    expect(c.detect([p('add a feature'), p('still broken')], {})).toBe(0);
  });

  it('frustration_spiral fires on persisting frustration', () => {
    const c = byName('frustration_spiral');
    expect(c.detect([], { consecutiveFrustratedPrompts: 3 })).toBe(1);
    expect(c.detect([], { consecutiveFrustratedPrompts: 1 })).toBe(0);
    expect(c.detect([], {})).toBe(0);
  });

  it('the AR-10 dev-env (Channel Y) detectors fire on a false probe, stay dark on unknown', () => {
    expect(byName('no_version_control').detect([], { hasVersionControl: false })).toBe(1);
    expect(byName('no_version_control').detect([], { hasVersionControl: true })).toBe(0);
    expect(byName('no_version_control').detect([], {})).toBe(0);
    expect(byName('no_backup_safety').detect([], { hasBackups: false })).toBe(1);
    expect(byName('no_backup_safety').detect([], { hasBackups: true })).toBe(0);
    expect(byName('no_separate_envs').detect([], { hasSeparateEnvs: false })).toBe(1);
    expect(byName('no_separate_envs').detect([], { hasSeparateEnvs: true })).toBe(0);
    expect(byName('no_automated_security_scanning').detect([], { hasSecurityScanner: false })).toBe(1);
    expect(byName('no_automated_security_scanning').detect([], { hasSecurityScanner: true })).toBe(0);
    for (const n of ['no_version_control', 'no_backup_safety', 'no_separate_envs', 'no_automated_security_scanning']) {
      expect(byName(n).requiresChannel).toBeUndefined();
    }
  });

  it('liveDetectors excludes every channel-gated entry', () => {
    expect(liveDetectors(MISTAKE_CATEGORIES).every((c) => c.requiresChannel === undefined)).toBe(true);
    expect(liveDetectors(MISTAKE_CATEGORIES).length).toBeLessThan(MISTAKE_CATEGORIES.length);
  });
});

describe('mistake-categories — coverage-map (each absence category → existing-or-new ABSENCE_*)', () => {
  // The ABSENCE_* signalType ↔ classifier signalKey convention is `ABSENCE_<UPPER(key)>`.
  const existingKeys = new Set(SIGNAL_DEFINITIONS.map((s) => s.key));
  const absence = MISTAKE_CATEGORIES.filter((c) => c.routing === 'absence');
  const keyOf = (signal: string) => signal.replace(/^ABSENCE_/, '').toLowerCase();

  it('every absence category names a well-formed ABSENCE_* signal', () => {
    for (const c of absence) expect(c.mapToAbsenceSignal).toMatch(/^ABSENCE_[A-Z0-9_]+$/);
  });

  it('the map partitions cleanly into reused-existing and genuinely-new (none unmapped)', () => {
    const existing = absence.filter((c) => existingKeys.has(keyOf(c.mapToAbsenceSignal!)));
    const fresh = absence.filter((c) => !existingKeys.has(keyOf(c.mapToAbsenceSignal!)));
    expect(existing.length + fresh.length).toBe(absence.length); // 36, no orphans
    // The reused-existing signals must resolve to a real SignalDefinition today.
    for (const c of existing) expect(existingKeys.has(keyOf(c.mapToAbsenceSignal!))).toBe(true);
    // The genuinely-new ones are the §3.F population's deferred SIGNAL_DEFINITIONS (live-activation = §6.1 item 10).
    expect(fresh.length).toBeGreaterThan(0);
  });

  it('the categories mapped onto existing signals resolve to those exact keys', () => {
    const reused: Record<string, string> = {
      ai_overtrust_accept_without_read: 'output_verification',
      eval_skip: 'test_creation',
      coverage_illusion: 'test_depth_check',
      ai_fix_doom_loop: 'restart_impulse_check',
      prompt_drift_inconsistency: 'architecture_conflict',
      mega_prompt_overload: 'single_responsibility_prompting',
      context_window_overflow: 'context_loss',
      skip_planning_no_plan_mode: 'feature_scope_before_build',
    };
    for (const [cat, key] of Object.entries(reused)) {
      expect(existingKeys.has(key)).toBe(true); // the existing signal really exists
      expect(byName(cat).mapToAbsenceSignal).toBe(`ABSENCE_${key.toUpperCase()}`);
    }
  });
});

describe('mistake-categories — seeded straddle entries (one per routing tag)', () => {
  it('mode mismatch is absence-routed, channel-M-gated, with a mapToAbsenceSignal', () => {
    const c = byName('coding_agent_mode_mismatch');
    expect(c.routing).toBe('absence');
    expect(c.mapToAbsenceSignal).toBe('ABSENCE_AGENT_MODE_MISMATCH');
    expect(c.requiresChannel).toBe('M');
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
  });
});

describe('mistake-categories — add-a-category (append one entry)', () => {
  it('a new entry routes via its tag with no detector/router change', () => {
    const extra: MistakeCategory = {
      name: 'a_brand_new_category', routing: 'absence', severity: 'low',
      mapToAbsenceSignal: 'ABSENCE_A_BRAND_NEW_CATEGORY', detect: () => 0,
    };
    const registry = [...MISTAKE_CATEGORIES, extra];
    expect(findRoutingInvariantViolations(registry)).toEqual([]);
    expect(resolveEngine(routingToPolarity(extra.routing))).toBe(absenceSignalEngine);
  });
});
