import { describe, expect, it } from 'vitest';
import {
  ALL_FAILURE_MODES,
  FailureMode,
  type FailureModeHandlerResult,
} from './failure-modes.js';

describe('failure-modes', () => {
  it('FailureMode enum contains exactly 7 entries (F1-F7)', () => {
    const values = Object.values(FailureMode);
    expect(values).toHaveLength(7);
    expect(values).toEqual([
      'F1_EARLY_SESSION',
      'F2_PII_MASK',
      'F3_CONTRADICTION',
      'F4_LENGTH_OVERFLOW',
      'F5_REPEATED_PROMPTS',
      'F6_CROSS_PROJECT',
      'F7_L2_CARRYOVER',
    ]);
  });

  it('ALL_FAILURE_MODES iteration matches enum membership', () => {
    expect(ALL_FAILURE_MODES).toHaveLength(7);
    const enumValues = Object.values(FailureMode);
    expect([...ALL_FAILURE_MODES]).toEqual(enumValues);
  });

  it('FailureModeHandlerResult shape — triggered + useFallback required, note optional', () => {
    const minimal: FailureModeHandlerResult = { triggered: false, useFallback: false };
    const annotated: FailureModeHandlerResult = {
      triggered:   true,
      useFallback: true,
      note:        'F1 — fewer than 2 qualifying prompts',
    };
    expect(minimal.triggered).toBe(false);
    expect(minimal.useFallback).toBe(false);
    expect(minimal.note).toBeUndefined();
    expect(annotated.note).toContain('F1');
  });
});
