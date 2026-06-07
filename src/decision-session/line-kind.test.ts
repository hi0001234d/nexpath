import { describe, expect, it } from 'vitest';
import { ALL_LINE_KINDS, type LineKind } from './line-kind.js';

describe('line-kind', () => {
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
