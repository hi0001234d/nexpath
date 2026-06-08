import { describe, expect, it } from 'vitest';
import {
  R4_CA_OPEN,
  R4_CA_CLOSE,
  R4_USER_OPEN,
  R4_USER_CLOSE,
  substituteCAFacingBookend,
  type R4UserRegister,
} from './r4-bookends.js';

describe('r4-bookends — locked CA-facing constants', () => {
  it('R4_CA_OPEN matches the locked wording', () => {
    expect(R4_CA_OPEN).toBe("(I'm flagging this because:)");
  });

  it('R4_CA_CLOSE is the locked empty string', () => {
    expect(R4_CA_CLOSE).toBe('');
  });
});

describe('r4-bookends — locked user-facing constants', () => {
  it('R4_USER_OPEN is the common locked open string', () => {
    expect(R4_USER_OPEN).toBe("You're seeing this because");
  });

  it('R4_USER_CLOSE.formal matches the locked formal close', () => {
    expect(R4_USER_CLOSE.formal).toBe('— review the options below to determine the next step.');
  });

  it('R4_USER_CLOSE.casual matches the locked casual close', () => {
    expect(R4_USER_CLOSE.casual).toBe('— pick from the options below to keep moving.');
  });

  it('R4_USER_CLOSE.beginner matches the locked beginner close', () => {
    expect(R4_USER_CLOSE.beginner).toBe("— let's pick one below.");
  });

  it('R4_USER_CLOSE has exactly the 3 register keys', () => {
    expect(Object.keys(R4_USER_CLOSE).sort()).toEqual(['beginner', 'casual', 'formal']);
  });

  it('R4UserRegister type-level: every key is valid', () => {
    const keys: R4UserRegister[] = ['formal', 'casual', 'beginner'];
    for (const k of keys) {
      expect(R4_USER_CLOSE[k]).toBeTruthy();
    }
  });
});

describe('r4-bookends — substituteCAFacingBookend()', () => {
  it('replaces a single {R4_OPEN} occurrence', () => {
    expect(substituteCAFacingBookend('{R4_OPEN} payload')).toBe(`${R4_CA_OPEN} payload`);
  });

  it('replaces a single {R4_CLOSE} occurrence (with the empty-string close)', () => {
    expect(substituteCAFacingBookend('payload {R4_CLOSE}')).toBe('payload ');
  });

  it('replaces both {R4_OPEN} and {R4_CLOSE} in a full desc-base shape', () => {
    const tpl = '{R4_OPEN}\ngap line\ndirection line\n{R4_CLOSE}';
    const out = substituteCAFacingBookend(tpl);
    expect(out).toBe(`${R4_CA_OPEN}\ngap line\ndirection line\n`);
  });

  it('replaces every occurrence (replaceAll semantics, not just the first)', () => {
    const tpl = '{R4_OPEN} a {R4_OPEN} b {R4_OPEN}';
    expect(substituteCAFacingBookend(tpl)).toBe(`${R4_CA_OPEN} a ${R4_CA_OPEN} b ${R4_CA_OPEN}`);
  });

  it('returns the input unchanged when no placeholders are present', () => {
    expect(substituteCAFacingBookend('no placeholders here')).toBe('no placeholders here');
  });

  it('preserves desc-base internal substitution placeholders (e.g., {R5_INJECT})', () => {
    const tpl = '{R4_OPEN}\n{R5_INJECT: ~1 line — "example"}\nbody\n{R4_CLOSE}';
    const out = substituteCAFacingBookend(tpl);
    expect(out).toContain('{R5_INJECT: ~1 line — "example"}');
    expect(out).toContain(R4_CA_OPEN);
    expect(out).not.toContain('{R4_OPEN}');
    expect(out).not.toContain('{R4_CLOSE}');
  });
});
