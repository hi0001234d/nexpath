import { describe, expect, it } from 'vitest';
import { ALL_LINE_KINDS, styler, type LineKind } from './styler.js';

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

  it('styler() returns the input line unchanged for every LineKind', () => {
    const sample = 'sample line content';
    for (const kind of ALL_LINE_KINDS) {
      expect(styler(sample, kind)).toBe(sample);
    }
  });

  it('styler() preserves an empty input string', () => {
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
});
