import { describe, expect, it } from 'vitest';
import type {
  UniversalWhyHelpVariants,
  NonStandardWhyHelpVariants,
  WhyHelpEntry,
  WhyHelpVariants,
} from './why-help-types.js';

describe('why-help-types', () => {
  it('UniversalWhyHelpVariants requires formal + casual + beginner', () => {
    const ok: UniversalWhyHelpVariants = {
      formal:   'F',
      casual:   'C',
      beginner: 'B',
    };
    expect(ok.formal).toBe('F');
    expect(ok.casual).toBe('C');
    expect(ok.beginner).toBe('B');
  });

  it('NonStandardWhyHelpVariants accepts any subset of the 3 registers', () => {
    const empty:        NonStandardWhyHelpVariants = {};
    const formalOnly:   NonStandardWhyHelpVariants = { formal: 'F' };
    const casualBeg:    NonStandardWhyHelpVariants = { casual: 'C', beginner: 'B' };
    const all:          NonStandardWhyHelpVariants = { formal: 'F', casual: 'C', beginner: 'B' };
    expect(empty).toEqual({});
    expect(formalOnly.formal).toBe('F');
    expect(casualBeg.casual).toBe('C');
    expect(all.formal).toBe('F');
  });

  it('WhyHelpEntry discriminated union accepts each of the 4 class structures', () => {
    const universal: WhyHelpEntry = {
      structure: 'universal-triplet',
      content: { formal: 'F', casual: 'C', beginner: 'B' },
    };
    const class7: WhyHelpEntry = {
      structure: 'class7-vibe-coder',
      content: { casual: 'C', beginner: 'B' },
    };
    const class8: WhyHelpEntry = {
      structure: 'class8-role-cluster',
      content: { founder_casual: 'fc', indie_hacker_casual: 'ihc', pm_formal: 'pmf' },
    };
    const class9: WhyHelpEntry = {
      structure: 'class9-formal-only',
      content: { formal: 'F' },
    };
    expect(universal.structure).toBe('universal-triplet');
    expect(class7.structure).toBe('class7-vibe-coder');
    expect(class8.structure).toBe('class8-role-cluster');
    expect(class9.structure).toBe('class9-formal-only');
  });

  it('WhyHelpVariants alias matches UniversalWhyHelpVariants shape', () => {
    const v: WhyHelpVariants = { formal: 'F', casual: 'C', beginner: 'B' };
    const u: UniversalWhyHelpVariants = v;
    expect(u).toEqual(v);
  });
});
