import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALL_LINE_KINDS, isStylePassthroughActive, STYLE_PASSTHROUGH_ENV, styler, type LineKind } from './styler.js';

// Force isTTY=true at module scope so the styler safeguards do not short-
// circuit ANSI emission when tests run in a non-TTY worker (vitest workers
// typically have stdout.isTTY undefined when run from a piped CLI). The
// dedicated S-1 safeguard tests below explicitly flip isTTY to false to
// exercise the non-TTY return path.
let origIsTTY: boolean | undefined;
beforeAll(() => {
  origIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = true;
});
afterAll(() => {
  process.stdout.isTTY = origIsTTY;
});

describe('styler — line-kind contract', () => {
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
});

// ── styler() per-LineKind dispatch — one test per kind so a regression
// in a single kind reports as one targeted failure instead of collapsing
// into a loop iteration that loses the failing-kind context.
//
// Four kinds receive ANSI styling (popup-why-help, desc-base-truncated,
// desc-base-expanded, shortcut-hint); three kinds inherit (option-label,
// pinch-label, question) and are returned unchanged.

describe('styler — per-kind styled dispatch', () => {
  it('wraps popup-why-help with gray styling', () => {
    const sample = 'sample line content';
    const out = styler(sample, 'popup-why-help');
    expect(out).not.toBe(sample);
    expect(out).toContain(sample);
    expect(out).toMatch(/\x1b\[/);
  });

  it('wraps desc-base-truncated with dim+gray styling', () => {
    const sample = 'sample line content';
    const out = styler(sample, 'desc-base-truncated');
    expect(out).not.toBe(sample);
    expect(out).toContain(sample);
    expect(out).toMatch(/\x1b\[/);
  });

  it('wraps desc-base-expanded with gray styling', () => {
    const sample = 'sample line content';
    const out = styler(sample, 'desc-base-expanded');
    expect(out).not.toBe(sample);
    expect(out).toContain(sample);
    expect(out).toMatch(/\x1b\[/);
  });

  it('wraps shortcut-hint with dim+italic styling', () => {
    const sample = 'sample line content';
    const out = styler(sample, 'shortcut-hint');
    expect(out).not.toBe(sample);
    expect(out).toContain(sample);
    expect(out).toMatch(/\x1b\[/);
  });
});

describe('styler — per-kind inherit dispatch', () => {
  it('returns option-label unchanged (inherits existing option-label styling)', () => {
    const sample = 'sample line content';
    expect(styler(sample, 'option-label')).toBe(sample);
  });

  it('returns pinch-label unchanged (inherits existing pinch-label styling)', () => {
    const sample = 'sample line content';
    expect(styler(sample, 'pinch-label')).toBe(sample);
  });

  it('returns question unchanged (plain reads naturally)', () => {
    const sample = 'sample line content';
    expect(styler(sample, 'question')).toBe(sample);
  });
});

describe('styler — defensive contracts', () => {
  it('covers every LineKind in ALL_LINE_KINDS without throwing', () => {
    for (const kind of ALL_LINE_KINDS) {
      expect(() => styler('hello', kind)).not.toThrow();
    }
  });

  it('preserves multi-line input for inherit kinds (no wrap injection mid-line)', () => {
    const multiline = 'line one\nline two\nline three';
    expect(styler(multiline, 'option-label')).toBe(multiline);
  });

  it('returns input unchanged for an unrecognised kind (graceful-fallback contract)', () => {
    const unknownKind = 'future-kind-not-yet-locked' as unknown as LineKind;
    const sample = 'unchanged content';
    expect(styler(sample, unknownKind)).toBe(sample);
  });

  it('throws in dev builds when the input contains an ESC byte for any LineKind (layout-leak guard)', () => {
    // Layout's contract is to emit raw text for every line-kind, including
    // inherit kinds — the guard surfaces a leak regardless of where it
    // originates so the diagnostic is uniform.
    const preStyled = '\x1b[31mred\x1b[0m';
    for (const kind of ALL_LINE_KINDS) {
      expect(() => styler(preStyled, kind)).toThrow(/styler received pre-styled input/);
    }
  });
});

describe('styler — NEXPATH_STYLE_PASSTHROUGH diagnostic bypass', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[STYLE_PASSTHROUGH_ENV];
  });

  afterEach(() => {
    if (saved === undefined) delete process.env[STYLE_PASSTHROUGH_ENV];
    else                     process.env[STYLE_PASSTHROUGH_ENV] = saved;
  });

  it('exports STYLE_PASSTHROUGH_ENV as the locked env-var key', () => {
    expect(STYLE_PASSTHROUGH_ENV).toBe('NEXPATH_STYLE_PASSTHROUGH');
  });

  it('isStylePassthroughActive() returns true when env-var === "1"', () => {
    process.env[STYLE_PASSTHROUGH_ENV] = '1';
    expect(isStylePassthroughActive()).toBe(true);
  });

  it('isStylePassthroughActive() returns false for unset / empty / non-"1" values', () => {
    delete process.env[STYLE_PASSTHROUGH_ENV];
    expect(isStylePassthroughActive()).toBe(false);
    process.env[STYLE_PASSTHROUGH_ENV] = '';
    expect(isStylePassthroughActive()).toBe(false);
    process.env[STYLE_PASSTHROUGH_ENV] = '0';
    expect(isStylePassthroughActive()).toBe(false);
    process.env[STYLE_PASSTHROUGH_ENV] = 'true';
    expect(isStylePassthroughActive()).toBe(false);
  });

  it('styler() returns input unchanged for every LineKind when bypass is active', () => {
    process.env[STYLE_PASSTHROUGH_ENV] = '1';
    const sample = 'sample bypass content';
    for (const kind of ALL_LINE_KINDS) {
      expect(styler(sample, kind)).toBe(sample);
    }
  });

  it('styler() bypass survives multi-line + ANSI inputs (defensive contract)', () => {
    process.env[STYLE_PASSTHROUGH_ENV] = '1';
    const multiline = 'one\ntwo\nthree';
    const ansi      = '\x1b[31mred\x1b[0m';
    expect(styler(multiline, 'option-label')).toBe(multiline);
    expect(styler(ansi,      'question')).toBe(ansi);
  });

  it('unset env-var falls through to the normal styler dispatch body', () => {
    delete process.env[STYLE_PASSTHROUGH_ENV];
    const sample = 'normal path';
    // Inherit kinds still return input unchanged; styled kinds wrap with ANSI.
    expect(styler(sample, 'question')).toBe(sample);
    expect(styler(sample, 'popup-why-help')).not.toBe(sample);
  });
});

describe('styler — cross-terminal safeguards (NO_COLOR + isTTY)', () => {
  let savedNoColor: string | undefined;
  let savedIsTTY:   boolean | undefined;

  beforeEach(() => {
    savedNoColor = process.env['NO_COLOR'];
    savedIsTTY   = process.stdout.isTTY;
  });

  afterEach(() => {
    if (savedNoColor === undefined) delete process.env['NO_COLOR'];
    else                            process.env['NO_COLOR'] = savedNoColor;
    process.stdout.isTTY = savedIsTTY;
  });

  it('NO_COLOR set → styler returns input unchanged for every LineKind', () => {
    process.env['NO_COLOR'] = '1';
    process.stdout.isTTY    = true;
    const sample = 'no-color content';
    for (const kind of ALL_LINE_KINDS) {
      expect(styler(sample, kind)).toBe(sample);
    }
  });

  it('NO_COLOR set to any non-empty value triggers the safeguard', () => {
    process.env['NO_COLOR'] = 'anything';
    process.stdout.isTTY    = true;
    expect(styler('hello', 'popup-why-help')).toBe('hello');
  });

  it('stdout.isTTY=false → styler returns input unchanged for every LineKind', () => {
    delete process.env['NO_COLOR'];
    process.stdout.isTTY = false;
    const sample = 'non-tty content';
    for (const kind of ALL_LINE_KINDS) {
      expect(styler(sample, kind)).toBe(sample);
    }
  });

  it('stdout.isTTY=undefined (piped output) → styler returns input unchanged', () => {
    delete process.env['NO_COLOR'];
    process.stdout.isTTY = undefined as unknown as boolean;
    expect(styler('hello', 'popup-why-help')).toBe('hello');
  });

  it('isTTY=true AND NO_COLOR unset → styler applies styling on styled kinds', () => {
    delete process.env['NO_COLOR'];
    process.stdout.isTTY = true;
    const sample = 'styled content';
    const out = styler(sample, 'popup-why-help');
    expect(out).not.toBe(sample);
    expect(out).toContain(sample);
  });
});
