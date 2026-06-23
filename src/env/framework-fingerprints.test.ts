import { describe, it, expect } from 'vitest';
import { resolveFramework, FRAMEWORK_FINGERPRINTS } from './framework-fingerprints.js';

describe('framework-fingerprints — resolveFramework', () => {
  it('resolves a known marker to its canonical name', () => {
    expect(resolveFramework(['react'])).toBe('react');
    expect(resolveFramework(['vue'])).toBe('vue');
    expect(resolveFramework(['express'])).toBe('express');
  });

  it('normalizes aliases (next → nextjs, @angular/core → angular)', () => {
    expect(resolveFramework(['next', 'react'])).toBe('nextjs');
    expect(resolveFramework(['@angular/core'])).toBe('angular');
    expect(resolveFramework(['@sveltejs/kit', 'svelte'])).toBe('sveltekit');
  });

  it('prefers the more-specific meta-framework over its base library', () => {
    // A Next.js app also depends on react; the allowlist order picks Next.js.
    expect(resolveFramework(['react', 'next'])).toBe('nextjs');
    expect(resolveFramework(['vue', 'nuxt'])).toBe('nuxtjs');
  });

  it('returns null (UNKNOWN — never a guess) when no marker is present', () => {
    expect(resolveFramework([])).toBeNull();
    expect(resolveFramework(['lodash', 'chalk', 'some-random-lib'])).toBeNull();
  });

  it('every fingerprint entry is well-formed (declarative allowlist shape)', () => {
    for (const fp of FRAMEWORK_FINGERPRINTS) {
      expect(typeof fp.dependency).toBe('string');
      expect(fp.dependency.length).toBeGreaterThan(0);
      expect(typeof fp.framework).toBe('string');
      expect(fp.framework.length).toBeGreaterThan(0);
    }
  });
});
