import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  OrdinalAxis,
  UserNature,
  UserMood,
  SessionDepth,
  UserProfile,
} from './types.js';

// ── OrdinalAxis ────────────────────────────────────────────────────────────────

describe('OrdinalAxis', () => {
  it('accepts all four valid values', () => {
    const values: OrdinalAxis[] = ['low', 'medium', 'high', 'very_high'];
    expectTypeOf(values).toMatchTypeOf<OrdinalAxis[]>();
  });

  it('rejects values outside the four valid members at the type level', () => {
    // @ts-expect-error — 'ultra' is not a valid OrdinalAxis
    const bad: OrdinalAxis = 'ultra';
    void bad;
  });
});

// ── UserProfile shape ──────────────────────────────────────────────────────────

describe('UserProfile', () => {
  it('accepts a fully-specified profile with ordinal fields', () => {
    const profile: UserProfile = {
      nature:             'hardcore_pro',
      precisionScore:     9.0,
      playfulnessScore:   2.0,
      precisionOrdinal:   'very_high',
      playfulnessOrdinal: 'low',
      mood:               'focused',
      depth:              'high',
      depthScore:         3.0,
      computedAt:         42,
    };
    expectTypeOf(profile).toMatchTypeOf<UserProfile>();
  });

  it('precisionOrdinal is typed as OrdinalAxis', () => {
    expectTypeOf<UserProfile['precisionOrdinal']>().toMatchTypeOf<OrdinalAxis>();
  });

  it('playfulnessOrdinal is typed as OrdinalAxis', () => {
    expectTypeOf<UserProfile['playfulnessOrdinal']>().toMatchTypeOf<OrdinalAxis>();
  });

  it('nature is typed as UserNature', () => {
    expectTypeOf<UserProfile['nature']>().toMatchTypeOf<UserNature>();
  });

  it('mood is typed as UserMood', () => {
    expectTypeOf<UserProfile['mood']>().toMatchTypeOf<UserMood>();
  });

  it('depth is typed as SessionDepth', () => {
    expectTypeOf<UserProfile['depth']>().toMatchTypeOf<SessionDepth>();
  });

  it('precisionScore and playfulnessScore are numbers', () => {
    expectTypeOf<UserProfile['precisionScore']>().toBeNumber();
    expectTypeOf<UserProfile['playfulnessScore']>().toBeNumber();
  });

  it('depthScore is a number', () => {
    expectTypeOf<UserProfile['depthScore']>().toBeNumber();
  });

  it('computedAt is a number', () => {
    expectTypeOf<UserProfile['computedAt']>().toBeNumber();
  });

  it('rejects a profile missing precisionOrdinal at the type level', () => {
    // @ts-expect-error — precisionOrdinal is required
    const incomplete: UserProfile = {
      nature:             'beginner',
      precisionScore:     2.0,
      playfulnessScore:   2.0,
      playfulnessOrdinal: 'low',
      mood:               'casual',
      depth:              'low',
      depthScore:         0.1,
      computedAt:         1,
    };
    void incomplete;
  });

  it('rejects a profile missing playfulnessOrdinal at the type level', () => {
    // @ts-expect-error — playfulnessOrdinal is required
    const incomplete: UserProfile = {
      nature:           'beginner',
      precisionScore:   2.0,
      playfulnessScore: 2.0,
      precisionOrdinal: 'low',
      mood:             'casual',
      depth:            'low',
      depthScore:       0.1,
      computedAt:       1,
    };
    void incomplete;
  });
});

// ── OrdinalAxis ordering contract ─────────────────────────────────────────────

describe('OrdinalAxis ordering', () => {
  it('all four ordinal values are present and distinct', () => {
    const ordinals: OrdinalAxis[] = ['low', 'medium', 'high', 'very_high'];
    const unique = new Set(ordinals);
    expect(unique.size).toBe(4);
  });
});
