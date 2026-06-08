import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_LINE_KINDS, isStylerPassthroughActive, STYLER_PASSTHROUGH_ENV, styler, type LineKind } from './styler.js';

describe('styler — line-kind contract + pass-through function', () => {
  it('ALL_LINE_KINDS contains exactly the 7 locked kinds', () => {
    expect(ALL_LINE_KINDS).toHaveLength(7);
    expect(ALL_LINE_KINDS).toEqual([
      'popup-why-help',
      'desc-base-truncated',
      'desc-base-expanded',
      'shortcut-hint',
      'option-label',
      'pinch-label',
      'question',
    ]);
  });

  it('ALL_LINE_KINDS has no duplicate entries', () => {
    const unique = new Set(ALL_LINE_KINDS);
    expect(unique.size).toBe(ALL_LINE_KINDS.length);
  });

  it('each kind is assignable to LineKind (type-level check via assignment)', () => {
    for (const kind of ALL_LINE_KINDS) {
      const k: LineKind = kind;
      expect(typeof k).toBe('string');
    }
  });

  // ── styler() function — initial pass-through body ──────────────────────────
  // One test per LineKind per dev-plan §11.13 test-surface spec: a regression
  // in a single kind reports as one targeted failure instead of collapsing
  // into a loop iteration that loses the failing-kind context.

  it('styler() preserves input for kind=popup-why-help', () => {
    const sample = 'sample line content';
    expect(styler(sample, 'popup-why-help')).toBe(sample);
  });

  it('styler() preserves input for kind=desc-base-truncated', () => {
    const sample = 'sample line content';
    expect(styler(sample, 'desc-base-truncated')).toBe(sample);
  });

  it('styler() preserves input for kind=desc-base-expanded', () => {
    const sample = 'sample line content';
    expect(styler(sample, 'desc-base-expanded')).toBe(sample);
  });

  it('styler() preserves input for kind=shortcut-hint', () => {
    const sample = 'sample line content';
    expect(styler(sample, 'shortcut-hint')).toBe(sample);
  });

  it('styler() preserves input for kind=option-label', () => {
    const sample = 'sample line content';
    expect(styler(sample, 'option-label')).toBe(sample);
  });

  it('styler() preserves input for kind=pinch-label', () => {
    const sample = 'sample line content';
    expect(styler(sample, 'pinch-label')).toBe(sample);
  });

  it('styler() preserves input for kind=question', () => {
    const sample = 'sample line content';
    expect(styler(sample, 'question')).toBe(sample);
  });

  it('styler() covers EVERY LineKind value declared in ALL_LINE_KINDS (exhaustiveness sentinel)', () => {
    // Forward-looking guard: if a future change adds an 8th kind without
    // adding the corresponding per-kind test above, this exhaustiveness
    // check flags the gap so the per-kind coverage stays in lockstep.
    const covered: LineKind[] = [
      'popup-why-help', 'desc-base-truncated', 'desc-base-expanded',
      'shortcut-hint', 'option-label', 'pinch-label', 'question',
    ];
    for (const kind of ALL_LINE_KINDS) {
      expect(covered).toContain(kind);
    }
    expect(covered.length).toBe(ALL_LINE_KINDS.length);
  });

  it('styler() preserves an empty input string for every LineKind', () => {
    // Empty-input regression is a single-kind concern in practice (any one
    // case-body that silently injects content on `''` would surface here);
    // keeping this as a loop is intentional — the focus is the empty-string
    // contract across all kinds, not per-kind body behaviour.
    for (const kind of ALL_LINE_KINDS) {
      expect(styler('', kind)).toBe('');
    }
  });

  it('styler() preserves multi-line input verbatim', () => {
    const multiline = 'line one\nline two\nline three';
    expect(styler(multiline, 'option-label')).toBe(multiline);
  });

  it('styler() preserves input containing ANSI escape sequences (pass-through promise)', () => {
    const ansi = '\x1b[31mred\x1b[0m';
    expect(styler(ansi, 'question')).toBe(ansi);
  });

  it('styler() returns the line unchanged for an unrecognised kind (graceful-fallback contract)', () => {
    // Forward-looking invariant: if a new LineKind is added in the future
    // and the dispatch table is not yet updated, the styler must still
    // return the input unchanged rather than throw or strip content. The
    // pass-through body satisfies this trivially today; this test pins
    // the contract so the future per-kind dispatch keeps the default
    // branch intact.
    const unknownKind = 'future-kind-not-yet-locked' as unknown as LineKind;
    const sample = 'unchanged content';
    expect(styler(sample, unknownKind)).toBe(sample);
  });
});

describe('styler — NEXPATH_STYLER_PASSTHROUGH diagnostic bypass', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[STYLER_PASSTHROUGH_ENV];
  });

  afterEach(() => {
    if (saved === undefined) delete process.env[STYLER_PASSTHROUGH_ENV];
    else                     process.env[STYLER_PASSTHROUGH_ENV] = saved;
  });

  it('exports STYLER_PASSTHROUGH_ENV as the dev-plan-locked env-var key', () => {
    expect(STYLER_PASSTHROUGH_ENV).toBe('NEXPATH_STYLER_PASSTHROUGH');
  });

  it('isStylerPassthroughActive() returns true when env-var === "1"', () => {
    process.env[STYLER_PASSTHROUGH_ENV] = '1';
    expect(isStylerPassthroughActive()).toBe(true);
  });

  it('isStylerPassthroughActive() returns false for unset / empty / non-"1" values', () => {
    delete process.env[STYLER_PASSTHROUGH_ENV];
    expect(isStylerPassthroughActive()).toBe(false);
    process.env[STYLER_PASSTHROUGH_ENV] = '';
    expect(isStylerPassthroughActive()).toBe(false);
    process.env[STYLER_PASSTHROUGH_ENV] = '0';
    expect(isStylerPassthroughActive()).toBe(false);
    process.env[STYLER_PASSTHROUGH_ENV] = 'true';
    expect(isStylerPassthroughActive()).toBe(false);
  });

  it('styler() returns input unchanged for every LineKind when bypass is active', () => {
    process.env[STYLER_PASSTHROUGH_ENV] = '1';
    const sample = 'sample bypass content';
    for (const kind of ALL_LINE_KINDS) {
      expect(styler(sample, kind)).toBe(sample);
    }
  });

  it('styler() bypass survives multi-line + ANSI inputs (defensive contract)', () => {
    process.env[STYLER_PASSTHROUGH_ENV] = '1';
    const multiline = 'one\ntwo\nthree';
    const ansi      = '\x1b[31mred\x1b[0m';
    expect(styler(multiline, 'option-label')).toBe(multiline);
    expect(styler(ansi,      'question')).toBe(ansi);
  });

  it('unset env-var falls through to the normal styler dispatch body', () => {
    delete process.env[STYLER_PASSTHROUGH_ENV];
    const sample = 'normal path';
    // With the current pass-through body, both branches produce the same
    // output; this test pins the structural contract that the unset path
    // exercises the normal dispatch (verified once the body grows per-kind
    // ANSI mapping by Bhavnesh — at that point this test asserts that the
    // styler emits styled output when bypass is OFF).
    expect(styler(sample, 'question')).toBe(sample);
  });
});
