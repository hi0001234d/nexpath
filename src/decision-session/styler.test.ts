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
  it('ALL_LINE_KINDS contains exactly the 9 locked kinds', () => {
    expect(ALL_LINE_KINDS).toHaveLength(9);
    expect(ALL_LINE_KINDS).toEqual([
      'popup-why-help',
      'desc-base-truncated',
      'desc-base-expanded',
      'shortcut-hint',
      'option-label',
      'option-label-unfocused',
      'pinch-label',
      'question',
      'page-header',
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
// Five kinds receive ANSI styling (popup-why-help, desc-base-truncated,
// desc-base-expanded, shortcut-hint, option-label-unfocused); three
// kinds inherit (option-label, pinch-label, question) and are returned
// unchanged. The option-label kind is now reserved for the focused
// option's label (full-weight visual anchor), while option-label-unfocused
// applies pc.dim to non-focused options so the user's eye lands on the
// focused option first.

describe('styler — per-kind styled dispatch', () => {
  it('wraps popup-why-help with dim styling', () => {
    const sample = 'sample line content';
    const out = styler(sample, 'popup-why-help');
    expect(out).not.toBe(sample);
    expect(out).toContain(sample);
    expect(out).toMatch(/\x1b\[/);
  });

  it('wraps desc-base-truncated with gray styling', () => {
    const sample = 'sample line content';
    const out = styler(sample, 'desc-base-truncated');
    expect(out).not.toBe(sample);
    expect(out).toContain(sample);
    expect(out).toMatch(/\x1b\[/);
  });

  it('wraps desc-base-expanded with 256-color light-gray styling (xterm color 252)', () => {
    // Focused desc-base sits a tier below the full-weight focused option
    // label so the two no longer collapse to one visual block, while
    // staying clearly brighter than the gray unfocused desc previews
    // below it.
    const sample = 'sample line content';
    const out = styler(sample, 'desc-base-expanded');
    expect(out).not.toBe(sample);
    expect(out).toContain(sample);
    expect(out).toMatch(/\x1b\[38;5;252m/);
    expect(out).toMatch(/\x1b\[39m/);
  });

  it('wraps shortcut-hint with dim+italic styling', () => {
    const sample = 'sample line content';
    const out = styler(sample, 'shortcut-hint');
    expect(out).not.toBe(sample);
    expect(out).toContain(sample);
    expect(out).toMatch(/\x1b\[/);
  });

  it('wraps option-label-unfocused with dim styling (non-focused option labels fade)', () => {
    const sample = 'sample line content';
    const out = styler(sample, 'option-label-unfocused');
    expect(out).not.toBe(sample);
    expect(out).toContain(sample);
    // Dim SGR sequence — `\x1b[2m` opens, `\x1b[22m` closes.
    expect(out).toMatch(/\x1b\[2m/);
    expect(out).toMatch(/\x1b\[22m/);
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

  it('throws in dev builds when the input contains an ESC byte for STYLED LineKinds (layout-leak guard)', () => {
    // Styled kinds (popup-why-help, desc-base-truncated, desc-base-expanded,
    // shortcut-hint) wrap their input in additional SGR codes. Receiving an
    // already-ANSI-wrapped input would compound the styling and mask the
    // layout leak — the guard surfaces this in dev builds.
    const preStyled = '\x1b[31mred\x1b[0m';
    // option-label-unfocused intentionally omitted — it has an
    // ANSI-tolerant special-case in styler.ts to support pre-styled
    // meta-row labels (SHOW_SIMPLER / HELP) from DecisionSession.ts.
    const styledKinds: LineKind[] = ['popup-why-help', 'desc-base-truncated', 'desc-base-expanded', 'shortcut-hint'];
    for (const kind of styledKinds) {
      expect(() => styler(preStyled, kind), `kind=${kind}`).toThrow(/styler received pre-styled input/);
    }
  });

  it('passes ESC bytes through verbatim for INHERIT LineKinds (pre-styled inputs are an intentional contract)', () => {
    // Inherit kinds (option-label, pinch-label, question) return the input
    // unchanged — they never add ANSI themselves so there is no compounding
    // risk. The contract upstream is that header values may arrive
    // pre-styled (e.g., formatPinchLabel / formatQuestion outputs wrapped
    // with bold-cyan / bold-white SGR codes). The dev-only guard MUST NOT
    // fire for these kinds or the popup would crash on first render.
    const preStyled = '\x1b[1;96mBefore coding.\x1b[0m';
    const inheritKinds: LineKind[] = ['option-label', 'pinch-label', 'question'];
    for (const kind of inheritKinds) {
      expect(() => styler(preStyled, kind), `kind=${kind}`).not.toThrow();
      expect(styler(preStyled, kind), `kind=${kind}`).toBe(preStyled);
    }
  });

  it('regression — pinch-label / question accept already-styled formatter outputs without crashing the render loop', () => {
    // Reproduces the real-world flow: parent process wraps header values
    // with formatPinchLabel / formatQuestion (which produce ANSI-wrapped
    // strings), the .mjs child reads them from the optFile, and renderLoop
    // emits them as pinch-label / question LineKinds. Before this contract
    // was clarified the styler's dev-only guard would throw on the first
    // pinch-label emission, aborting the render loop and causing the popup
    // to render once then immediately disappear ("blink and disappear").
    const styledPinch    = '\x1b[1;96mBefore coding.\x1b[0m';
    const styledQuestion = '\x1b[1;97mIs the plan written?\x1b[0m';
    const styledSubtitle = '\x1b[2;33mQuick check.\x1b[0m';  // subtitle is emitted as kind='pinch-label' per computeLayout

    expect(styler(styledPinch,    'pinch-label')).toBe(styledPinch);
    expect(styler(styledSubtitle, 'pinch-label')).toBe(styledSubtitle);
    expect(styler(styledQuestion, 'question')).toBe(styledQuestion);
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
