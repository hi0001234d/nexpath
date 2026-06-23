import { describe, it, expect } from 'vitest';
import {
  computeMaturityScore,
  scoreToLevel,
  medianSeedLevel,
  applyGraduation,
  updateProjectMaturity,
  isActiveSignal,
  COLD_START_LEVEL,
  GRADUATION_STABILITY,
  HYSTERESIS_THRESHOLD,
  type GraduationState,
  type MaturityLevel,
} from './maturity-level.js';
import type { RightGoodProfile, RightGoodSignal } from './right-good-aggregator.js';
import type { SignalDefinition } from './types.js';
import { openStore, type Store } from '../store/db.js';
import { upsertUserDepthLevel, getUserDepthLevel } from '../store/user-depth-level.js';
import { SCHEMA_VERSION } from '../store/schema.js';

const NOW = 1_700_000_000_000;

function def(key: string, extra: Partial<SignalDefinition> = {}): SignalDefinition {
  return { key, description: key, expectedStages: ['implementation'], detectionKeywords: [], absenceThreshold: 15, ...extra };
}
function rg(score: number, occurrences = score > 0 ? 5 : 0): RightGoodSignal {
  return { score, state: 'neutral', stability: { sessions: 2, occurrences, stable: occurrences > 0 }, lastUpdated: NOW };
}
function profileOf(entries: Record<string, RightGoodSignal>): RightGoodProfile {
  return entries;
}

// ── Active-set selection + score ──────────────────────────────────────────────

describe('maturity-level — active-set selection', () => {
  const meta = { nature: 'casual' as const, role: 'indie_hacker' as const, projectType: 'cli' };

  it('includes universal signals; excludes nature/role/domain mismatches and anti-patterns', () => {
    expect(isActiveSignal(def('A'), meta)).toBe(true); // universal
    expect(isActiveSignal(def('C', { nature: 'hardcore_pro' }), meta)).toBe(false); // nature mismatch
    expect(isActiveSignal(def('D', { role: 'founder' }), meta)).toBe(false); // role mismatch
    expect(isActiveSignal(def('E', { relevantProjectTypes: ['web'] }), meta)).toBe(false); // domain mismatch
    expect(isActiveSignal(def('decision_fatigue_pattern'), meta)).toBe(false); // (−) anti-pattern
  });

  it('score = average over the ACTIVE set; irrelevant signals are EXCLUDED not 0; an active 0 counts', () => {
    const defs = [
      def('A'),                                   // active, 0.6
      def('B'),                                   // active, 0.4
      def('Z'),                                   // active, no events → 0 (counts, drags avg)
      def('X', { relevantProjectTypes: ['web'] }), // out-of-domain → EXCLUDED (even at 1.0)
    ];
    const profile = profileOf({ A: rg(0.6), B: rg(0.4), X: rg(1.0) });
    const out = computeMaturityScore(profile, meta, { signalDefs: defs });
    expect(out.activeCount).toBe(3);           // A, B, Z — not X
    expect(out.score).toBeCloseTo((0.6 + 0.4 + 0) / 3, 5);
  });

  it('hasData is false when no active signal has occurrences (cold-start signal)', () => {
    const defs = [def('A'), def('B')];
    expect(computeMaturityScore(profileOf({}), meta, { signalDefs: defs }).hasData).toBe(false);
    expect(computeMaturityScore(profileOf({ A: rg(0.5) }), meta, { signalDefs: defs }).hasData).toBe(true);
  });
});

// ── Bands ──────────────────────────────────────────────────────────────────────

describe('maturity-level — score→level (equal-fifth placeholder bands)', () => {
  it('maps each fifth to a level and clamps out-of-range', () => {
    expect(scoreToLevel(0)).toBe(1);
    expect(scoreToLevel(0.19)).toBe(1);
    expect(scoreToLevel(0.2)).toBe(2);
    expect(scoreToLevel(0.4)).toBe(3);
    expect(scoreToLevel(0.6)).toBe(4);
    expect(scoreToLevel(0.8)).toBe(5);
    expect(scoreToLevel(1)).toBe(5);
    expect(scoreToLevel(2)).toBe(5); // clamp
    expect(scoreToLevel(-1)).toBe(1); // clamp
  });
});

// ── Seed ────────────────────────────────────────────────────────────────────────

describe('maturity-level — cross-project median seed', () => {
  it('empty → cold-start L2; else the median of existing levels', () => {
    expect(medianSeedLevel([])).toBe(COLD_START_LEVEL);
    expect(COLD_START_LEVEL).toBe(2);
    expect(medianSeedLevel([3])).toBe(3);
    expect(medianSeedLevel([2, 4, 4])).toBe(4);
    expect(medianSeedLevel([1, 2, 4])).toBe(2);
    expect(medianSeedLevel([2, 4])).toBe(3); // even count → rounded average
  });
});

// ── Graduation state machine ─────────────────────────────────────────────────

describe('maturity-level — graduation (+1 only) and hysteresis (−1)', () => {
  const base = (lvl: MaturityLevel): GraduationState => ({
    currentLevel: lvl, stabilityCounter: 0, hysteresisCounter: 0, lastGraduationAt: null,
  });

  it('graduates +1 only after GRADUATION_STABILITY above-level detections', () => {
    let s = base(2);
    for (let i = 0; i < GRADUATION_STABILITY - 1; i++) s = applyGraduation(s, 4, NOW);
    expect(s.currentLevel).toBe(2); // not yet
    expect(s.stabilityCounter).toBe(GRADUATION_STABILITY - 1);
    s = applyGraduation(s, 4, NOW);
    expect(s.currentLevel).toBe(3); // +1 only, not jump to 4
    expect(s.stabilityCounter).toBe(0);
    expect(s.lastGraduationAt).toBe(NOW);
  });

  it('down-graduates −1 only after HYSTERESIS_THRESHOLD below-level detections (stickier)', () => {
    let s = base(4);
    for (let i = 0; i < HYSTERESIS_THRESHOLD - 1; i++) s = applyGraduation(s, 1, NOW);
    expect(s.currentLevel).toBe(4); // not yet
    s = applyGraduation(s, 1, NOW);
    expect(s.currentLevel).toBe(3); // −1 only
    expect(s.hysteresisCounter).toBe(0);
  });

  it('a detection AT the current level resets both counters', () => {
    let s: GraduationState = { currentLevel: 3, stabilityCounter: 2, hysteresisCounter: 1, lastGraduationAt: null };
    s = applyGraduation(s, 3, NOW);
    expect(s).toMatchObject({ currentLevel: 3, stabilityCounter: 0, hysteresisCounter: 0 });
  });
});

// ── Orthogonality ────────────────────────────────────────────────────────────

describe('maturity-level — orthogonal to SessionDepth', () => {
  it('the maturity level is a 1–5 number, not a low/medium/high string', () => {
    const lvl = scoreToLevel(0.5);
    expect(typeof lvl).toBe('number');
    expect(['low', 'medium', 'high']).not.toContain(lvl as unknown as string);
  });
});

// ── Store-backed orchestration ───────────────────────────────────────────────

describe('maturity-level — updateProjectMaturity (store-backed)', () => {
  const meta = {};
  async function mem(): Promise<Store> { return openStore(':memory:'); }

  it('cold-start: first-ever project with no data seeds at L2 and holds', async () => {
    const store = await mem();
    const out = updateProjectMaturity(store, '/new', {}, meta, NOW, { signalDefs: [def('A')] });
    expect(out.currentLevel).toBe(2);
    store.db.close();
  });

  it('cross-project seed: a new project inherits the median of existing rows', async () => {
    const store = await mem();
    for (const [p, l] of [['/a', 4], ['/b', 4], ['/c', 2]] as const) {
      upsertUserDepthLevel(store, { projectRoot: p, currentLevel: l, stabilityCounter: 0, hysteresisCounter: 0, lastGraduationAt: null, schemaVersion: SCHEMA_VERSION, updatedAt: NOW });
    }
    const out = updateProjectMaturity(store, '/new', {}, meta, NOW, { signalDefs: [def('A')] });
    expect(out.currentLevel).toBe(4); // median(4,4,2)
    store.db.close();
  });

  it('graduates a project +1 after enough high-score observations (persisted across calls)', async () => {
    const store = await mem();
    const defs = [def('A')];
    const profile = profileOf({ A: rg(1.0) }); // s_core 1.0 → detected L5
    let out = getUserDepthLevel(store, '/p');
    for (let i = 0; i < GRADUATION_STABILITY; i++) {
      out = updateProjectMaturity(store, '/p', profile, meta, NOW, { signalDefs: defs });
    }
    expect(out?.currentLevel).toBe(3); // seeded L2 → +1
    store.db.close();
  });

  it('holds the level (no graduation) when the profile has no data — survives empty sessions', async () => {
    const store = await mem();
    upsertUserDepthLevel(store, { projectRoot: '/p', currentLevel: 4, stabilityCounter: 0, hysteresisCounter: 0, lastGraduationAt: null, schemaVersion: SCHEMA_VERSION, updatedAt: NOW });
    const out = updateProjectMaturity(store, '/p', {}, meta, NOW + 1, { signalDefs: [def('A')] });
    expect(out.currentLevel).toBe(4); // unchanged
    store.db.close();
  });
});
