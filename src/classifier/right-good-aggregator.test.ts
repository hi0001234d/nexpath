import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  computeRightGoodProfile,
  loadRightGoodProfile,
  getRightGoodState,
  CHANNEL_CONFIDENCE,
  HIGH_THRESHOLD,
  type RightGoodOptions,
} from './right-good-aggregator.js';
import { openStore, closeStore } from '../store/db.js';
import { appendParamEvents } from '../telemetry/param-events.js';
import type { ParamEvent, ParamEventChannel } from '../telemetry/param-events.js';
import type { SignalDefinition, Stage } from './types.js';

const NOW = 1_700_000_000_000;

function ev(p: Partial<ParamEvent>): ParamEvent {
  return {
    schemaVersion: 1,
    ts: NOW,
    projectRoot: '/p',
    sessionId: 's1',
    promptIndex: 0,
    signalKey: 'K',
    channel: 'keyword',
    stage: 'implementation',
    stageConfidence: null,
    source: 'live',
    ...p,
  };
}

// Inject a deterministic lookup: every key expects 'implementation' (+ optional tags).
function lookup(extra: Partial<SignalDefinition> = {}): RightGoodOptions['signalLookup'] {
  return (key: string): SignalDefinition => ({
    key,
    description: key,
    expectedStages: ['implementation'],
    detectionKeywords: [],
    absenceThreshold: 15,
    ...extra,
  });
}

/** N live "opportunity" prompts in `stage` (filler events), at promptIndex 0..N-1. */
function opportunities(n: number, stage: Stage = 'implementation', session = 's1'): ParamEvent[] {
  return Array.from({ length: n }, (_, i) =>
    ev({ signalKey: 'filler', stage, sessionId: session, promptIndex: i }),
  );
}

describe('right-good-aggregator — opportunity-normalized score', () => {
  it('score = presence_live / max(opportunities, floor)', () => {
    const events = [
      ...opportunities(6), // 6 implementation prompts → opportunities = 6
      ev({ promptIndex: 0 }),
      ev({ promptIndex: 1 }),
      ev({ promptIndex: 2 }), // 3 keyword K hits → presence_live = 3
    ];
    const p = computeRightGoodProfile(events, { signalLookup: lookup() });
    expect(p.K.score).toBeCloseTo(3 / 6, 5);
  });

  it('vibe events count 0.5; historical folds in at 0.5', () => {
    const events = [
      ...opportunities(6),
      ev({ promptIndex: 0 }),                       // keyword 1.0
      ev({ promptIndex: 1, channel: 'vibe' }),      // vibe 0.5
      ev({ source: 'historical_import', stage: null, sessionId: 'historical-import' }), // hist ×0.5
      ev({ source: 'historical_import', stage: null, sessionId: 'historical-import' }),
    ];
    const p = computeRightGoodProfile(events, { signalLookup: lookup() });
    // presence_live = 1.0 + 0.5 = 1.5; presence_hist = 2 → numerator 1.5 + 0.5*2 = 2.5; /6
    expect(p.K.score).toBeCloseTo(2.5 / 6, 5);
  });

  it('opportunity floor prevents a tiny denominator from spiking the score', () => {
    const events = [
      ...opportunities(1), // 1 opportunity, but floor is 3
      ev({ promptIndex: 0 }),
    ];
    const p = computeRightGoodProfile(events, { signalLookup: lookup() });
    expect(p.K.score).toBeCloseTo(1 / 3, 5);
  });
});

describe('right-good-aggregator — stability gate (≥2 sessions AND ≥K occurrences)', () => {
  it('high score but only ONE session → NEUTRAL (not yet a strength)', () => {
    const events = [
      ...opportunities(3),
      ev({ promptIndex: 0 }), ev({ promptIndex: 1 }), ev({ promptIndex: 2 }),
    ];
    const p = computeRightGoodProfile(events, { signalLookup: lookup() });
    expect(p.K.score).toBeGreaterThanOrEqual(HIGH_THRESHOLD);
    expect(p.K.stability.stable).toBe(false);
    expect(p.K.state).toBe('neutral');
  });

  it('≥2 sessions AND ≥3 occurrences AND high score → RIGHT_GOOD', () => {
    const events = [
      ...opportunities(2, 'implementation', 's1'),
      ...opportunities(2, 'implementation', 's2'),
      ev({ sessionId: 's1', promptIndex: 0 }),
      ev({ sessionId: 's1', promptIndex: 1 }),
      ev({ sessionId: 's2', promptIndex: 0 }),
    ];
    const p = computeRightGoodProfile(events, { signalLookup: lookup() });
    expect(p.K.stability.sessions).toBe(2);
    expect(p.K.stability.occurrences).toBe(3);
    expect(p.K.stability.stable).toBe(true);
    expect(p.K.state).toBe('right_good');
  });
});

describe('right-good-aggregator — signed emission', () => {
  it('−1 MISTAKE when an active absence flag exists — and absence ALWAYS wins over a high score', () => {
    const events = [
      ...opportunities(2, 'implementation', 's1'),
      ...opportunities(2, 'implementation', 's2'),
      ev({ sessionId: 's1', promptIndex: 0 }),
      ev({ sessionId: 's1', promptIndex: 1 }),
      ev({ sessionId: 's2', promptIndex: 0 }),
    ];
    const p = computeRightGoodProfile(events, {
      signalLookup: lookup(),
      activeAbsenceKeys: new Set(['K']),
    });
    expect(p.K.state).toBe('mistake'); // would be right_good without the flag
  });

  it('an active-absence key with no + events still emits −1', () => {
    const p = computeRightGoodProfile([], { activeAbsenceKeys: new Set(['Z']) });
    expect(p.Z.state).toBe('mistake');
    expect(p.Z.score).toBe(0);
  });

  it('low score → NEUTRAL', () => {
    const events = [...opportunities(10), ev({ promptIndex: 0 })]; // 1/10
    const p = computeRightGoodProfile(events, { signalLookup: lookup() });
    expect(p.K.state).toBe('neutral');
  });
});

describe('right-good-aggregator — +side is ungated (nature/role ignored)', () => {
  it('a hardcore_pro/founder-tagged habit still earns the + side', () => {
    const events = [
      ...opportunities(2, 'implementation', 's1'),
      ...opportunities(2, 'implementation', 's2'),
      ev({ sessionId: 's1', promptIndex: 0 }),
      ev({ sessionId: 's1', promptIndex: 1 }),
      ev({ sessionId: 's2', promptIndex: 0 }),
    ];
    const p = computeRightGoodProfile(events, {
      signalLookup: lookup({ nature: 'hardcore_pro', role: 'founder' }),
    });
    // No profile/role is consulted — the tag does not suppress the + side.
    expect(p.K.state).toBe('right_good');
  });
});

describe('right-good-aggregator — robustness', () => {
  it('empty history → empty profile, no throw; absent key reads NEUTRAL', () => {
    const p = computeRightGoodProfile([]);
    expect(p).toEqual({});
    expect(getRightGoodState(p, 'anything')).toBe('neutral');
  });

  it('survives prompt/event pruning — high promptIndex events still count (no prompts-table dependency)', () => {
    const events = [
      ...Array.from({ length: 4 }, (_, i) =>
        ev({ signalKey: 'filler', promptIndex: 900 + i }),
      ),
      ev({ promptIndex: 900 }), ev({ promptIndex: 901 }),
    ];
    const p = computeRightGoodProfile(events, { signalLookup: lookup() });
    expect(p.K.score).toBeCloseTo(2 / 4, 5);
  });

  it('stage-noise tolerance: a prompt mislabeled out of the expected stage neither helps nor hurts', () => {
    const events = [
      ...opportunities(5, 'implementation'),       // 5 implementation opportunities (prompts 0..4)
      ev({ promptIndex: 0 }), ev({ promptIndex: 1 }), ev({ promptIndex: 2 }), // 3 K hits
      // A whole prompt (index 5) transiently mislabeled to 'release': both its
      // filler and its K hit carry that stage, so it is neither an opportunity
      // nor a presence for K — it averages out instead of distorting the score.
      ev({ signalKey: 'filler', promptIndex: 5, stage: 'release' }),
      ev({ promptIndex: 5, stage: 'release' }),
    ];
    const p = computeRightGoodProfile(events, { signalLookup: lookup() });
    expect(p.K.score).toBeCloseTo(3 / 5, 5);
  });
});

describe('right-good-aggregator — channel-confidence ordering (shared with §5.2)', () => {
  it('enforces the 3-tier verifiability ladder: vibe < keyword < stream_b/stage2 < transcript', () => {
    const c = CHANNEL_CONFIDENCE;
    expect(c.vibe).toBeLessThan(c.keyword);          // weakest claim < plain claim
    expect(c.keyword).toBeLessThan(c.stream_b);      // claim < LLM-assessed
    expect(c.stream_b).toBe(c.stage2);               // both LLM-assessed
    expect(c.stream_b).toBeLessThan(c.transcript);   // LLM-assessed < verified
  });

  it('a transcript hit contributes more presence than a keyword hit', () => {
    const mk = (channel: ParamEventChannel): number => {
      const p = computeRightGoodProfile(
        [...opportunities(3), ev({ promptIndex: 0, channel })],
        { signalLookup: lookup() },
      );
      return p.K.score;
    };
    expect(mk('transcript')).toBeGreaterThan(mk('keyword'));
    expect(mk('keyword')).toBeGreaterThan(mk('vibe'));
  });
});

describe('right-good-aggregator — rolling window', () => {
  it('windowDays drops events older than the cutoff', () => {
    const recent = [
      ...opportunities(3),
      ev({ promptIndex: 0 }), ev({ promptIndex: 1 }),
    ];
    const old = ev({ promptIndex: 2, ts: NOW - 40 * 24 * 60 * 60 * 1000 });
    const p = computeRightGoodProfile([...recent, old], {
      signalLookup: lookup(),
      now: NOW,
      windowDays: 30,
    });
    expect(p.K.score).toBeCloseTo(2 / 3, 5); // the 40-day-old hit dropped
  });

  it('windowCount keeps only the most recent N events', () => {
    // 5 opportunity prompts + 5 K hits, but window keeps the most recent 4 events.
    const events = [
      ...opportunities(5).map((e, i) => ({ ...e, ts: NOW + i })),
      ...Array.from({ length: 5 }, (_, i) => ev({ promptIndex: i, ts: NOW + 100 + i })),
    ];
    const p = computeRightGoodProfile(events, { signalLookup: lookup(), windowCount: 4 });
    // The 4 most recent events are all K hits (highest ts); only 1 filler survives
    // as an opportunity → opportunities falls back to the floor (3).
    expect(p.K.stability.occurrences).toBe(4);
  });
});

describe('right-good-aggregator — store integration + helpers', () => {
  it('getRightGoodState returns a present key\'s state (not just the neutral default)', () => {
    const events = [
      ...opportunities(2, 'implementation', 's1'),
      ...opportunities(2, 'implementation', 's2'),
      ev({ sessionId: 's1', promptIndex: 0 }),
      ev({ sessionId: 's1', promptIndex: 1 }),
      ev({ sessionId: 's2', promptIndex: 0 }),
    ];
    const p = computeRightGoodProfile(events, { signalLookup: lookup() });
    expect(getRightGoodState(p, 'K')).toBe('right_good');
    expect(getRightGoodState(p, 'absent')).toBe('neutral');
  });

  it('historical vibe events compound source×channel weight (0.5 × 0.5)', () => {
    const events = [
      ...opportunities(6),
      ev({ source: 'historical_import', stage: null, channel: 'vibe', sessionId: 'historical-import' }),
      ev({ source: 'historical_import', stage: null, channel: 'vibe', sessionId: 'historical-import' }),
    ];
    const p = computeRightGoodProfile(events, { signalLookup: lookup() });
    // presence_hist = 0.5 (vibe) × 2 = 1.0; numerator = 0 + HIST_WEIGHT(0.5)*1.0 = 0.5; /6
    expect(p.K.score).toBeCloseTo(0.5 / 6, 5);
  });

  it('loadRightGoodProfile reads the persisted param-event log (real reader, real signal key)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nx-rg-'));
    const store = await openStore(join(dir, 's.db'));
    const base = { projectRoot: '/p', channel: 'keyword' as const, stage: 'implementation' as const, stageConfidence: null, source: 'live' as const };
    // 'cross_confirming' is a real SIGNAL_DEFINITIONS key expecting 'implementation'.
    appendParamEvents(store, [
      { ...base, sessionId: 's1', promptIndex: 0, signalKey: 'problem_correction' }, // opportunity filler
      { ...base, sessionId: 's1', promptIndex: 1, signalKey: 'problem_correction' },
      { ...base, sessionId: 's1', promptIndex: 0, signalKey: 'cross_confirming' },
      { ...base, sessionId: 's1', promptIndex: 1, signalKey: 'cross_confirming' },
      { ...base, sessionId: 's2', promptIndex: 0, signalKey: 'cross_confirming' },
    ]);
    const p = loadRightGoodProfile(store, '/p');
    expect(p.cross_confirming.stability.occurrences).toBe(3);
    expect(p.cross_confirming.stability.sessions).toBe(2);
    expect(p.cross_confirming.score).toBeCloseTo(1.0, 5); // 3 hits / max(3 opportunities, floor)
    expect(p.cross_confirming.state).toBe('right_good');
    closeStore(store);
    rmSync(dir, { recursive: true, force: true });
  });
});
