import { describe, expect, it } from 'vitest';
import { composeWhyHelpBlock, resolveWhyHelpContent } from './why-help-compose.js';
import { WHY_HELP_PER_CLASS, type WhyHelpEntry } from './why-help.js';
import { R4_USER_OPEN, R4_USER_CLOSE } from './r4-bookends.js';

describe('why-help-compose — resolveWhyHelpContent (discriminated-union routing)', () => {
  it('returns the per-register content for universal-triplet entries (classes 1-6)', () => {
    const entry = WHY_HELP_PER_CLASS.class1_stage_transition;
    expect(resolveWhyHelpContent(entry, 'formal')).toBe((entry.content as { formal: string }).formal);
    expect(resolveWhyHelpContent(entry, 'casual')).toBe((entry.content as { casual: string }).casual);
    expect(resolveWhyHelpContent(entry, 'beginner')).toBe((entry.content as { beginner: string }).beginner);
  });

  it('routes class7-vibe-coder by register (casual + beginner only)', () => {
    const entry = WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder;
    expect(resolveWhyHelpContent(entry, 'casual')).toBe((entry.content as { casual: string }).casual);
    expect(resolveWhyHelpContent(entry, 'beginner')).toBe((entry.content as { beginner: string }).beginner);
    expect(resolveWhyHelpContent(entry, 'formal')).toBeNull();
  });

  it('routes class8-role-cluster by role × register', () => {
    const entry = WHY_HELP_PER_CLASS.class8_role_cluster;
    expect(resolveWhyHelpContent(entry, 'casual',   'founder')).toBe((entry.content as { founder_casual: string }).founder_casual);
    expect(resolveWhyHelpContent(entry, 'casual',   'indie_hacker')).toBe((entry.content as { indie_hacker_casual: string }).indie_hacker_casual);
    expect(resolveWhyHelpContent(entry, 'formal',   'pm')).toBe((entry.content as { pm_formal: string }).pm_formal);
    // No role match → null (degrades gracefully)
    expect(resolveWhyHelpContent(entry, 'casual',   null)).toBeNull();
    expect(resolveWhyHelpContent(entry, 'casual',   undefined)).toBeNull();
  });

  it('routes class9-formal-only — formal returns content, others return null', () => {
    const entry = WHY_HELP_PER_CLASS.class9_academic_hardcore_pro;
    expect(resolveWhyHelpContent(entry, 'formal')).toBe((entry.content as { formal: string }).formal);
    expect(resolveWhyHelpContent(entry, 'casual')).toBeNull();
    expect(resolveWhyHelpContent(entry, 'beginner')).toBeNull();
  });
});

describe('why-help-compose — composeWhyHelpBlock', () => {
  const entry = WHY_HELP_PER_CLASS.class1_stage_transition;

  it('returns null when entry is undefined or null (§11.2 graceful-fail)', () => {
    expect(composeWhyHelpBlock(undefined, 'formal', undefined)).toBeNull();
    expect(composeWhyHelpBlock(null,      'formal', undefined)).toBeNull();
  });

  it('returns null when the register is not represented in the entry (e.g. class7 + formal)', () => {
    const c7 = WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder;
    expect(composeWhyHelpBlock(c7, 'formal', undefined)).toBeNull();
  });

  it('composes R4_USER_OPEN + content + R4_USER_CLOSE[register] when content is resolvable + no mood', () => {
    const out = composeWhyHelpBlock(entry, 'formal', undefined);
    expect(out).not.toBeNull();
    const lines = (out as string).split('\n');
    expect(lines[0]).toBe(R4_USER_OPEN);
    expect(lines[1]).toBe((entry.content as { formal: string }).formal);
    expect(lines[2]).toBe(R4_USER_CLOSE.formal);
  });

  it('inserts the R6-Sub2 mood-conditional sentence before the close bookend when mood is frustrated', () => {
    const out = composeWhyHelpBlock(entry, 'casual', 'frustrated');
    expect(out).not.toBeNull();
    const lines = (out as string).split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(R4_USER_OPEN);
    expect(lines[1]).toBe((entry.content as { casual: string }).casual);
    // Line 2 is the mood sentence — check it's non-empty and not the close.
    expect(lines[2].length).toBeGreaterThan(0);
    expect(lines[2]).not.toBe(R4_USER_CLOSE.casual);
    expect(lines[3]).toBe(R4_USER_CLOSE.casual);
  });

  it('inserts a mood sentence for rushed mood + skips for neutral/positive moods', () => {
    const withRushed   = composeWhyHelpBlock(entry, 'casual', 'rushed');
    const withFocused  = composeWhyHelpBlock(entry, 'casual', 'focused');
    expect((withRushed   as string).split('\n')).toHaveLength(4);   // open + content + mood + close
    expect((withFocused  as string).split('\n')).toHaveLength(3);   // open + content + close (no mood)
  });

  it('routes class8-role-cluster via the role parameter', () => {
    const c8 = WHY_HELP_PER_CLASS.class8_role_cluster;
    const founderOut = composeWhyHelpBlock(c8, 'casual', undefined, 'founder');
    expect(founderOut).not.toBeNull();
    const lines = (founderOut as string).split('\n');
    expect(lines[1]).toBe((c8.content as { founder_casual: string }).founder_casual);
  });

  it('uses the register-specific R4 close — formal / casual / beginner each differ', () => {
    const formal   = composeWhyHelpBlock(entry, 'formal',   undefined);
    const casual   = composeWhyHelpBlock(entry, 'casual',   undefined);
    const beginner = composeWhyHelpBlock(entry, 'beginner', undefined);
    expect((formal   as string).endsWith(R4_USER_CLOSE.formal)).toBe(true);
    expect((casual   as string).endsWith(R4_USER_CLOSE.casual)).toBe(true);
    expect((beginner as string).endsWith(R4_USER_CLOSE.beginner)).toBe(true);
  });
});
