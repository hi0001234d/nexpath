import { describe, it, expect } from 'vitest';
import {
  computeWorkStyleProfile,
  loadWorkStyleProfile,
  shouldRecomputeWorkStyle,
  DECISION_RHYTHM_SCALE,
  EXPLANATION_DEPTH_SCALE,
  ABSTRACTION_LEVEL_SCALE,
  WORK_STYLE_PARAM_AXES,
  WORK_STYLE_RECOMPUTE_INTERVAL,
  WORK_STYLE_MIN_OBSERVATIONS,
} from './work-style-traits.js';
import type { ParamEvent } from '../telemetry/param-events.js';
import { appendParamEvents } from '../telemetry/param-events.js';
import type { Stage } from './types.js';
import { NATURE_DEPTH_RECOMPUTE_INTERVAL } from './UserProfileClassifier.js';
import { openStore, closeStore } from '../store/db.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let seq = 0;
function ev(over: Partial<ParamEvent> = {}): ParamEvent {
  return {
    schemaVersion: 1,
    ts: 1000 + seq++,
    projectRoot: '/p',
    sessionId: 's1',
    promptIndex: 0,
    signalKey: 'x',
    channel: 'keyword',
    stage: 'implementation',
    stageConfidence: 0.9,
    source: 'live',
    ...over,
  };
}

let pidx = 0;
/** n events of a signal key spread across the given sessions (rhythm counts raw events). */
function rhythm(signalKey: string, sessions: string[]): ParamEvent[] {
  return sessions.map((s) => ev({ signalKey, sessionId: s, promptIndex: pidx++, stage: null }));
}
/** distinct-prompt events at a stage spread across sessions (globally-unique promptIndex). */
function stagePrompts(stage: Stage, sessions: string[]): ParamEvent[] {
  return sessions.map((s) => ev({ signalKey: 'x', sessionId: s, promptIndex: pidx++, stage }));
}

describe('work-style-traits — value spectra (closed ordinal, balanced midpoint)', () => {
  it('each scale is a 3-pole spectrum with balanced at the midpoint', () => {
    expect(DECISION_RHYTHM_SCALE).toEqual(['decisive', 'balanced', 'deliberative']);
    expect(EXPLANATION_DEPTH_SCALE).toEqual(['terse', 'balanced', 'teaching']);
    expect(ABSTRACTION_LEVEL_SCALE).toEqual(['code_first', 'balanced', 'architecture_first']);
    for (const s of [DECISION_RHYTHM_SCALE, EXPLANATION_DEPTH_SCALE, ABSTRACTION_LEVEL_SCALE]) {
      expect(s[1]).toBe('balanced');
    }
  });

  it('every trait axis carries the closed-ordinal representation tag', () => {
    expect(Object.values(WORK_STYLE_PARAM_AXES).every((t) => t === 'closed-ordinal')).toBe(true);
    expect(Object.keys(WORK_STYLE_PARAM_AXES).sort()).toEqual([
      'abstraction_level_orientation', 'decision_making_rhythm', 'explanation_learning_depth',
    ]);
  });
});

describe('work-style-traits — decision rhythm', () => {
  it('reads decisive when act-then-restart dominates (and marks the trait stable)', () => {
    const events = [
      ...rhythm('restart_impulse_check', ['s1', 's2', 's1', 's2']),
      ...rhythm('alternatives_seeking', ['s1']),
    ];
    const t = computeWorkStyleProfile(events).decisionRhythm;
    expect(t.value).toBe('decisive');
    expect(t.stable).toBe(true);
    expect(t.observations).toBe(5);
    expect(t.sessions).toBe(2);
  });

  it('treats the neutral-band edges inclusively (0.4 → decisive, 0.6 → deliberative)', () => {
    // ratio = deliberative / total. 2/5 = 0.4 (edge low) → decisive.
    const lowEdge = [
      ...rhythm('alternatives_seeking', ['s1', 's2']),
      ...rhythm('restart_impulse_check', ['s1', 's2', 's1']),
    ];
    expect(computeWorkStyleProfile(lowEdge).decisionRhythm.value).toBe('decisive');
    // 3/5 = 0.6 (edge high) → deliberative.
    const highEdge = [
      ...rhythm('alternatives_seeking', ['s1', 's2', 's1']),
      ...rhythm('restart_impulse_check', ['s1', 's2']),
    ];
    expect(computeWorkStyleProfile(highEdge).decisionRhythm.value).toBe('deliberative');
  });

  it('is set exactly at the cold-start floor (4 observations across 2 sessions)', () => {
    const events = [
      ...rhythm('alternatives_seeking', ['s1', 's2']),
      ...rhythm('restart_impulse_check', ['s1', 's2']),
    ];
    const t = computeWorkStyleProfile(events).decisionRhythm;
    expect(t.observations).toBe(4);
    expect(t.stable).toBe(true);
    expect(t.value).toBe('balanced');
  });

  it('reads deliberative when option-weighing dominates', () => {
    const events = [
      ...rhythm('alternatives_seeking', ['s1', 's2', 's1', 's2']),
      ...rhythm('restart_impulse_check', ['s1']),
    ];
    expect(computeWorkStyleProfile(events).decisionRhythm.value).toBe('deliberative');
  });

  it('reads balanced on an even split', () => {
    const events = [
      ...rhythm('alternatives_seeking', ['s1', 's2', 's1']),
      ...rhythm('restart_impulse_check', ['s1', 's2', 's1']),
    ];
    expect(computeWorkStyleProfile(events).decisionRhythm.value).toBe('balanced');
  });

  it('stays UNSET below the cold-start observation floor', () => {
    const events = rhythm('alternatives_seeking', ['s1', 's2']); // 2 < WORK_STYLE_MIN_OBSERVATIONS
    expect(events.length).toBeLessThan(WORK_STYLE_MIN_OBSERVATIONS);
    const t = computeWorkStyleProfile(events).decisionRhythm;
    expect(t.value).toBeNull();
    expect(t.stable).toBe(false);
  });

  it('stays UNSET when all evidence is in a single session', () => {
    const events = rhythm('alternatives_seeking', ['s1', 's1', 's1', 's1']);
    expect(computeWorkStyleProfile(events).decisionRhythm.value).toBeNull();
  });
});

describe('work-style-traits — abstraction level', () => {
  it('reads architecture_first when design-stage prompts dominate', () => {
    const events = [
      ...stagePrompts('architecture', ['s1', 's2']),
      ...stagePrompts('prd', ['s1', 's2']),
      ...stagePrompts('implementation', ['s1']),
    ];
    expect(computeWorkStyleProfile(events).abstractionLevel.value).toBe('architecture_first');
  });

  it('reads code_first when implementation prompts dominate', () => {
    const events = [
      ...stagePrompts('implementation', ['s1', 's2', 's1', 's2']),
      ...stagePrompts('architecture', ['s1']),
    ];
    expect(computeWorkStyleProfile(events).abstractionLevel.value).toBe('code_first');
  });

  it('reads balanced on an even design/code split', () => {
    const events = [
      ...stagePrompts('architecture', ['s1', 's2', 's1']),
      ...stagePrompts('implementation', ['s2', 's1', 's2']),
    ];
    expect(computeWorkStyleProfile(events).abstractionLevel.value).toBe('balanced');
  });

  it('ignores stages outside the design/code clusters and honours cold-start', () => {
    const events = [
      ...stagePrompts('review_testing', ['s1', 's2', 's1', 's2']), // neither cluster
      ...stagePrompts('architecture', ['s1']),
    ];
    const t = computeWorkStyleProfile(events).abstractionLevel;
    expect(t.observations).toBe(1); // only the architecture prompt counted
    expect(t.value).toBeNull();
  });
});

describe('work-style-traits — explanation depth (dormant)', () => {
  it('always reports UNSET + dormant until its source channel exists', () => {
    const events = [...stagePrompts('architecture', ['s1', 's2', 's1', 's2'])];
    const t = computeWorkStyleProfile(events).explanationDepth;
    expect(t.value).toBeNull();
    expect(t.dormant).toBe(true);
  });
});

describe('work-style-traits — neutral contract', () => {
  it('a trait exposes only descriptor metadata — no signed/advisory state to route on', () => {
    const t = computeWorkStyleProfile(rhythm('alternatives_seeking', ['s1', 's2', 's1', 's2'])).decisionRhythm;
    expect(Object.keys(t).sort()).toEqual(['dormant', 'observations', 'sessions', 'stable', 'value']);
  });

  it('balanced (a real midpoint) is distinct from UNSET (null)', () => {
    const balanced = computeWorkStyleProfile([
      ...rhythm('alternatives_seeking', ['s1', 's2']),
      ...rhythm('restart_impulse_check', ['s1', 's2']),
    ]).decisionRhythm;
    expect(balanced.value).toBe('balanced');
    const unset = computeWorkStyleProfile([]).decisionRhythm;
    expect(unset.value).toBeNull();
  });
});

describe('work-style-traits — recompute cadence (trait stickier than mood)', () => {
  it('the recompute interval is a multiple of the mood/profile cadence', () => {
    expect(WORK_STYLE_RECOMPUTE_INTERVAL % NATURE_DEPTH_RECOMPUTE_INTERVAL).toBe(0);
    expect(WORK_STYLE_RECOMPUTE_INTERVAL).toBeGreaterThan(NATURE_DEPTH_RECOMPUTE_INTERVAL);
  });

  it('recomputes only once the interval has elapsed', () => {
    expect(shouldRecomputeWorkStyle(0, WORK_STYLE_RECOMPUTE_INTERVAL - 1)).toBe(false);
    expect(shouldRecomputeWorkStyle(0, WORK_STYLE_RECOMPUTE_INTERVAL)).toBe(true);
  });
});

describe('work-style-traits — rolling window + store-backed load', () => {
  it('windowCount keeps only the most recent events', () => {
    // 4 deliberative (older) then 4 decisive (newer); window to the last 4 → decisive.
    const events = [
      ...rhythm('alternatives_seeking', ['s1', 's2', 's1', 's2']),
      ...rhythm('restart_impulse_check', ['s1', 's2', 's1', 's2']),
    ];
    expect(computeWorkStyleProfile(events, { windowCount: 4 }).decisionRhythm.value).toBe('decisive');
  });

  it('windowDays drops events older than the cutoff', () => {
    const NOW = 10_000_000_000;
    const DAY = 24 * 60 * 60 * 1000;
    const old = ['s1', 's2', 's1', 's2'].map((s, i) =>
      ev({ signalKey: 'alternatives_seeking', sessionId: s, promptIndex: pidx++, stage: null, ts: NOW - 5 * DAY - i }));
    const recent = ['s1', 's2', 's1', 's2'].map((s, i) =>
      ev({ signalKey: 'restart_impulse_check', sessionId: s, promptIndex: pidx++, stage: null, ts: NOW - i }));
    // Without a window, the 4+4 even split → balanced; windowing to 1 day drops the old → decisive.
    expect(computeWorkStyleProfile([...old, ...recent]).decisionRhythm.value).toBe('balanced');
    expect(computeWorkStyleProfile([...old, ...recent], { now: NOW, windowDays: 1 }).decisionRhythm.value).toBe('decisive');
  });

  it('an in-memory store yields an all-UNSET profile (no events on disk)', async () => {
    const store = await openStore(':memory:');
    try {
      const p = loadWorkStyleProfile(store, '/p');
      expect(p.decisionRhythm.value).toBeNull();
      expect(p.abstractionLevel.value).toBeNull();
      expect(p.explanationDepth.dormant).toBe(true);
    } finally {
      closeStore(store);
    }
  });

  it('reads persisted events from a real store and filters by project', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nx-ws-'));
    const store = await openStore(join(dir, 's.db'));
    const base = { channel: 'keyword' as const, stage: null, stageConfidence: null, source: 'live' as const };
    try {
      appendParamEvents(store, [
        // project /p — act-then-restart dominates → decisive
        { ...base, projectRoot: '/p', sessionId: 's1', promptIndex: 0, signalKey: 'restart_impulse_check' },
        { ...base, projectRoot: '/p', sessionId: 's2', promptIndex: 1, signalKey: 'restart_impulse_check' },
        { ...base, projectRoot: '/p', sessionId: 's1', promptIndex: 2, signalKey: 'restart_impulse_check' },
        { ...base, projectRoot: '/p', sessionId: 's2', promptIndex: 3, signalKey: 'restart_impulse_check' },
        { ...base, projectRoot: '/p', sessionId: 's1', promptIndex: 4, signalKey: 'alternatives_seeking' },
        // project /other — option-weighing dominates → deliberative (must NOT leak into /p)
        { ...base, projectRoot: '/other', sessionId: 'o1', promptIndex: 0, signalKey: 'alternatives_seeking' },
        { ...base, projectRoot: '/other', sessionId: 'o2', promptIndex: 1, signalKey: 'alternatives_seeking' },
        { ...base, projectRoot: '/other', sessionId: 'o1', promptIndex: 2, signalKey: 'alternatives_seeking' },
        { ...base, projectRoot: '/other', sessionId: 'o2', promptIndex: 3, signalKey: 'alternatives_seeking' },
      ]);
      expect(loadWorkStyleProfile(store, '/p').decisionRhythm.value).toBe('decisive');
      expect(loadWorkStyleProfile(store, '/other').decisionRhythm.value).toBe('deliberative');
    } finally {
      closeStore(store);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
