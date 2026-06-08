import { describe, expect, it } from 'vitest';
import { R5_D_FALLBACKS, getR5DFallback, type RegisterPartial } from './r5-fallbacks.js';

// ──────────────────────────────────────────────────────────────────────────
// Inventory invariants
// ──────────────────────────────────────────────────────────────────────────

describe('r5-fallbacks — content inventory', () => {
  it('total signal_type count is 136 (matches authored unique count)', () => {
    const count = Object.keys(R5_D_FALLBACKS).length;
    expect(count).toBe(136);
  });

  it('total string count across all (signal_type, register) pairs is 240', () => {
    let count = 0;
    for (const entry of Object.values(R5_D_FALLBACKS) as RegisterPartial[]) {
      if (entry.formal)   count++;
      if (entry.casual)   count++;
      if (entry.beginner) count++;
    }
    expect(count).toBe(240);
  });

  it('every entry has at least one register variant populated', () => {
    for (const [key, entry] of Object.entries(R5_D_FALLBACKS)) {
      const populated = [entry.formal, entry.casual, entry.beginner].filter(Boolean).length;
      expect(populated, `${key} has zero register variants`).toBeGreaterThan(0);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Length-budget invariant — F4 handler caps each substitution at 120 chars
// ──────────────────────────────────────────────────────────────────────────

describe('r5-fallbacks — length budget', () => {
  it('every authored string is ≤ 120 characters (F4 length cap)', () => {
    for (const [signalType, entry] of Object.entries(R5_D_FALLBACKS)) {
      for (const reg of ['formal', 'casual', 'beginner'] as const) {
        const s = entry[reg];
        if (s !== undefined) {
          expect(s.length, `${signalType}.${reg} length ${s.length} > 120`).toBeLessThanOrEqual(120);
        }
      }
    }
  });

  it('no authored string is empty or whitespace-only', () => {
    for (const [signalType, entry] of Object.entries(R5_D_FALLBACKS)) {
      for (const reg of ['formal', 'casual', 'beginner'] as const) {
        const s = entry[reg];
        if (s !== undefined) {
          expect(s.trim().length, `${signalType}.${reg} is empty`).toBeGreaterThan(0);
        }
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// L1 voice-rule invariant — full literal banned-phrase list
// ──────────────────────────────────────────────────────────────────────────

describe('r5-fallbacks — L1 voice-rule invariant (12 literal banned phrases)', () => {
  const BANNED = [
    'the AI', 'Ask the AI', 'Have the AI', 'Get the AI', 'Instruct the AI',
    'Claude', 'the assistant',
    'its answer', 'its output',
    'this option', 'the action below', 'the prompt above',
  ];

  for (const phrase of BANNED) {
    it(`no string contains "${phrase}"`, () => {
      const violations: string[] = [];
      for (const [signalType, entry] of Object.entries(R5_D_FALLBACKS)) {
        for (const reg of ['formal', 'casual', 'beginner'] as const) {
          const s = entry[reg];
          if (s !== undefined && s.toLowerCase().includes(phrase.toLowerCase())) {
            violations.push(`${signalType}.${reg}: ${s}`);
          }
        }
      }
      expect(violations).toEqual([]);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Lookup function — graceful fallback on missing pairs
// ──────────────────────────────────────────────────────────────────────────

describe('r5-fallbacks — getR5DFallback resolver', () => {
  it('returns the string for an authored (signal_type, register) pair', () => {
    // Pick the first signal_type that has a formal variant.
    const firstWithFormal = Object.entries(R5_D_FALLBACKS).find(([, e]) => e.formal);
    expect(firstWithFormal, 'no signal_type has a formal variant').toBeDefined();
    if (firstWithFormal) {
      const [key, entry] = firstWithFormal;
      expect(getR5DFallback(key, 'formal')).toBe(entry.formal);
    }
  });

  it('returns undefined for an unknown signal_type', () => {
    expect(getR5DFallback('NEVER_AUTHORED_SIGNAL_TYPE_XYZ', 'casual')).toBeUndefined();
  });

  it('returns undefined when the signal_type exists but the register is not authored', () => {
    // Find a signal_type that has formal but NOT beginner (some classes have partial coverage).
    const formalOnly = Object.entries(R5_D_FALLBACKS).find(
      ([, e]) => e.formal && !e.beginner,
    );
    if (formalOnly) {
      const [key] = formalOnly;
      expect(getR5DFallback(key, 'beginner')).toBeUndefined();
    }
  });
});
