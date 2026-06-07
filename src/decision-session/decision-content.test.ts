import { describe, expect, it } from 'vitest';
import type { DecisionContent, OptionEntry } from './options.js';
import type { UniversalWhyHelpVariants } from './why-help.js';

// Type-shape acceptance tests for the DecisionContent interface extension —
// verifies that the new optional fields (whyHelp, descBaseEnabled) compile
// alongside the locked OptionEntry array shape for L1 / L2 / L3.

describe('DecisionContent — shape acceptance', () => {
  it('accepts a minimal content object with only the required fields', () => {
    const c: DecisionContent = {
      question:      'q',
      pinchFallback: 'pf',
      L1: [{ option: 'L1-a', descBase: '' }],
      L2: [{ option: 'L2-a', descBase: '' }],
      L3: [{ option: 'L3-a', descBase: '' }],
    };
    expect(c.whyHelp).toBeUndefined();
    expect(c.descBaseEnabled).toBeUndefined();
  });

  it('accepts a populated whyHelp triplet (universal register structure)', () => {
    const wh: UniversalWhyHelpVariants = { formal: 'F', casual: 'C', beginner: 'B' };
    const c: DecisionContent = {
      question:      'q',
      pinchFallback: 'pf',
      L1: [{ option: 'L1-a', descBase: '' }],
      L2: [{ option: 'L2-a', descBase: '' }],
      L3: [{ option: 'L3-a', descBase: '' }],
      whyHelp:       wh,
    };
    expect(c.whyHelp?.formal).toBe('F');
    expect(c.whyHelp?.casual).toBe('C');
    expect(c.whyHelp?.beginner).toBe('B');
  });

  it('accepts descBaseEnabled set to true', () => {
    const c: DecisionContent = {
      question:      'q',
      pinchFallback: 'pf',
      L1: [{ option: 'L1-a', descBase: '' }],
      L2: [{ option: 'L2-a', descBase: '' }],
      L3: [{ option: 'L3-a', descBase: '' }],
      descBaseEnabled: true,
    };
    expect(c.descBaseEnabled).toBe(true);
  });

  it('accepts descBaseEnabled set to false (per-set opt-out)', () => {
    const c: DecisionContent = {
      question:      'q',
      pinchFallback: 'pf',
      L1: [{ option: 'L1-a', descBase: '' }],
      L2: [{ option: 'L2-a', descBase: '' }],
      L3: [{ option: 'L3-a', descBase: '' }],
      descBaseEnabled: false,
    };
    expect(c.descBaseEnabled).toBe(false);
  });

  it('accepts OptionEntry with non-empty descBase content (forward-compat with Phase 2 port)', () => {
    const entry: OptionEntry = {
      option:   'pre-filled prompt text',
      descBase: '{R4_OPEN}{R5_INJECT: ~1 line — "example reason."}gap-framing sentence.\ndirection-body sentence.{R4_CLOSE}',
    };
    const c: DecisionContent = {
      question:      'q',
      pinchFallback: 'pf',
      L1: [entry],
      L2: [{ option: 'L2-a', descBase: '' }],
      L3: [{ option: 'L3-a', descBase: '' }],
    };
    expect(c.L1[0].option).toBe('pre-filled prompt text');
    expect(c.L1[0].descBase).toContain('{R4_OPEN}');
    expect(c.L1[0].descBase).toContain('{R5_INJECT');
    expect(c.L1[0].descBase).toContain('{R4_CLOSE}');
  });

  it('accepts a fully populated DecisionContent (all optional fields present)', () => {
    const c: DecisionContent = {
      question:      'q',
      pinchFallback: 'pf',
      L1: [{ option: 'L1-a', descBase: '' }, { option: 'L1-b', descBase: '' }],
      L2: [{ option: 'L2-a', descBase: '' }],
      L3: [{ option: 'L3-a', descBase: '' }],
      whyHelp:         { formal: 'F', casual: 'C', beginner: 'B' },
      descBaseEnabled: true,
    };
    expect(c.L1).toHaveLength(2);
    expect(c.whyHelp?.formal).toBe('F');
    expect(c.descBaseEnabled).toBe(true);
  });
});
