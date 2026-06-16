import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CHROME_MAX_PREFIX_WIDTH,
  applyChrome,
  computeChromePrefix,
  shouldChromeColor,
  type ChromeOptions,
} from './render-loop-chrome.js';
import type { LineEmission } from './render-loop.js';

// Force isTTY=true at module scope so the chrome color gate emits ANSI
// in the dedicated color-policy tests below. Individual safeguard tests
// flip isTTY/NO_COLOR explicitly to verify the gate's negative path.
let origIsTTY: boolean | undefined;
beforeAll(() => {
  origIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = true;
});
afterAll(() => {
  process.stdout.isTTY = origIsTTY;
});

function makeEmission(over: Partial<LineEmission> & Pick<LineEmission, 'kind'>): LineEmission {
  return {
    text:        'sample',
    optionIndex: null,
    isPadding:   false,
    ...over,
  };
}

const DEFAULT_OPTIONS: ChromeOptions = { focusedOptionIndex: 0 };

describe('render-loop-chrome — module constants', () => {
  it('exports CHROME_MAX_PREFIX_WIDTH as 4 columns', () => {
    expect(CHROME_MAX_PREFIX_WIDTH).toBe(4);
  });
});

describe('render-loop-chrome — computeChromePrefix (per-LineKind rules)', () => {
  it('first pinch-label emission uses the corner glyph', () => {
    const e = makeEmission({ kind: 'pinch-label' });
    const prefix = computeChromePrefix(e, DEFAULT_OPTIONS, false);
    expect(prefix).toContain('◆');
    expect(prefix).not.toContain('│');
  });

  it('subsequent pinch-label rows use the left rail glyph (subtitle case)', () => {
    const e = makeEmission({ kind: 'pinch-label' });
    const prefix = computeChromePrefix(e, DEFAULT_OPTIONS, true);
    expect(prefix).toContain('│');
    expect(prefix).not.toContain('◆');
  });

  it('question / popup-why-help / shortcut-hint all use the left rail glyph', () => {
    for (const kind of ['question', 'popup-why-help', 'shortcut-hint'] as const) {
      const e = makeEmission({ kind });
      const prefix = computeChromePrefix(e, DEFAULT_OPTIONS, true);
      expect(prefix, `kind=${kind}`).toContain('│');
    }
  });

  it('focused option-label emits a green-bullet (●) prefix', () => {
    const e = makeEmission({ kind: 'option-label', optionIndex: 0 });
    const prefix = computeChromePrefix(e, { focusedOptionIndex: 0 }, true);
    expect(prefix).toContain('│');
    expect(prefix).toContain('●');
  });

  it('non-focused option-label emits an empty-bullet (○) prefix', () => {
    const e = makeEmission({ kind: 'option-label', optionIndex: 1 });
    const prefix = computeChromePrefix(e, { focusedOptionIndex: 0 }, true);
    expect(prefix).toContain('│');
    expect(prefix).toContain('○');
  });

  it('option-label with isPadding=true (separator row) gets the rail only, no bullet', () => {
    const e = makeEmission({ kind: 'option-label', optionIndex: 3, isPadding: true });
    const prefix = computeChromePrefix(e, { focusedOptionIndex: 3 }, true);
    expect(prefix).toContain('│');
    expect(prefix).not.toContain('●');
    expect(prefix).not.toContain('○');
  });

  it('desc-base-truncated and desc-base-expanded use the rail + 3-space indent', () => {
    for (const kind of ['desc-base-truncated', 'desc-base-expanded'] as const) {
      const e = makeEmission({ kind, optionIndex: 0 });
      const prefix = computeChromePrefix(e, DEFAULT_OPTIONS, true);
      expect(prefix, `kind=${kind}`).toContain('│');
      // 3-space indent aligns desc-base text under the option-label bullet
      // column (rail + space + bullet + space = 4 cols total).
      expect(prefix, `kind=${kind}`).toMatch(/│.{0,8}   $/);
    }
  });

  it('unknown LineKind falls back to the rail prefix (defensive)', () => {
    const e = makeEmission({ kind: 'future-kind-not-yet-locked' as unknown as LineEmission['kind'] });
    const prefix = computeChromePrefix(e, DEFAULT_OPTIONS, true);
    expect(prefix).toContain('│');
  });
});

describe('render-loop-chrome — color gate', () => {
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

  it('shouldChromeColor returns true when isTTY=true and NO_COLOR unset', () => {
    delete process.env['NO_COLOR'];
    process.stdout.isTTY = true;
    expect(shouldChromeColor()).toBe(true);
  });

  it('shouldChromeColor returns false when NO_COLOR is set', () => {
    process.env['NO_COLOR'] = '1';
    process.stdout.isTTY    = true;
    expect(shouldChromeColor()).toBe(false);
  });

  it('shouldChromeColor returns false when stdout.isTTY is false', () => {
    delete process.env['NO_COLOR'];
    process.stdout.isTTY = false;
    expect(shouldChromeColor()).toBe(false);
  });

  it('chrome glyphs always render even when color gate is off (NO_COLOR set)', () => {
    process.env['NO_COLOR'] = '1';
    process.stdout.isTTY    = true;
    const e = makeEmission({ kind: 'pinch-label' });
    const prefix = computeChromePrefix(e, DEFAULT_OPTIONS, false);
    expect(prefix).toContain('◆');
    // No SGR escapes when color gate is off — prefix is plain glyph + space.
    expect(prefix).not.toMatch(/\x1b\[/);
  });

  it('chrome glyphs always render even when color gate is off (!isTTY)', () => {
    delete process.env['NO_COLOR'];
    process.stdout.isTTY = false;
    const e = makeEmission({ kind: 'option-label', optionIndex: 0 });
    const prefix = computeChromePrefix(e, { focusedOptionIndex: 0 }, true);
    expect(prefix).toContain('│');
    expect(prefix).toContain('●');
    expect(prefix).not.toMatch(/\x1b\[/);
  });

  it('chrome emits ANSI color codes when both isTTY=true and NO_COLOR is unset', () => {
    delete process.env['NO_COLOR'];
    process.stdout.isTTY = true;
    const e = makeEmission({ kind: 'pinch-label' });
    const prefix = computeChromePrefix(e, DEFAULT_OPTIONS, false);
    expect(prefix).toMatch(/\x1b\[/);
  });
});

describe('render-loop-chrome — applyChrome (array decoration)', () => {
  it('returns an array of the same length as the input arrays', () => {
    const emissions: LineEmission[] = [
      makeEmission({ kind: 'pinch-label',  text: 'P' }),
      makeEmission({ kind: 'question',     text: 'Q' }),
      makeEmission({ kind: 'option-label', text: 'A', optionIndex: 0 }),
    ];
    const styled = emissions.map((e) => e.text);
    const out = applyChrome(styled, emissions, { focusedOptionIndex: 0 });
    expect(out).toHaveLength(emissions.length);
  });

  it('decorates the first pinch-label with the corner glyph and subsequent pinch-label rows with the rail', () => {
    const emissions: LineEmission[] = [
      makeEmission({ kind: 'pinch-label', text: 'pinch' }),
      makeEmission({ kind: 'pinch-label', text: 'subtitle' }),
      makeEmission({ kind: 'question',    text: 'question' }),
    ];
    const styled = emissions.map((e) => e.text);
    const out = applyChrome(styled, emissions, { focusedOptionIndex: 0 });
    expect(out[0]).toContain('◆');
    expect(out[0]).toContain('pinch');
    expect(out[1]).not.toContain('◆');
    expect(out[1]).toContain('│');
    expect(out[1]).toContain('subtitle');
  });

  it('preserves the styled-line content verbatim after the prefix', () => {
    const styledSample = '\x1b[36mcolored content\x1b[39m';
    const emissions: LineEmission[] = [
      makeEmission({ kind: 'popup-why-help', text: 'colored content' }),
    ];
    const out = applyChrome([styledSample], emissions, { focusedOptionIndex: 0 });
    expect(out[0].endsWith(styledSample)).toBe(true);
  });

  it('option-label decoration tracks the focused index correctly across multiple options', () => {
    const emissions: LineEmission[] = [
      makeEmission({ kind: 'option-label', text: 'A', optionIndex: 0 }),
      makeEmission({ kind: 'option-label', text: 'B', optionIndex: 1 }),
      makeEmission({ kind: 'option-label', text: 'C', optionIndex: 2 }),
    ];
    const styled = emissions.map((e) => e.text);
    const out = applyChrome(styled, emissions, { focusedOptionIndex: 1 });
    expect(out[0]).toContain('○');
    expect(out[1]).toContain('●');
    expect(out[2]).toContain('○');
  });

  it('handles an empty input array without throwing', () => {
    const out = applyChrome([], [], { focusedOptionIndex: 0 });
    expect(out).toEqual([]);
  });
});
