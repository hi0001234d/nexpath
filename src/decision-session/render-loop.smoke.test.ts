// Render-loop smoke matrix — exercises computeLayout across the full
// Cartesian product of terminal-size, desc-base length, and focused-option
// position dimensions. The matrix is the structural cousin of the
// per-feature unit tests in render-loop.test.ts: where the unit tests
// pin specific behaviours of individual code paths, the smoke matrix
// catches regressions where the interaction between cap + auto-scroll
// + viewport budget produces an off-by-one in an otherwise-uncovered
// combination.
//
// Matrix dimensions (4 × 6 × 3 = 72 scenarios):
//   - terminal rows         : 12 / 20 / 40 / 80
//   - desc-base line count  : 1  / 2  / 4  / 8  / 10 / 15
//   - focused-option index  : top / middle / bottom of a 5-option list
//
// Per-scenario the smoke checks four invariants:
//   - the layout produced a non-empty per-option range for the focused option
//   - the desc-base kind reflects the expand-or-refuse decision deterministically
//   - the truncation marker is present iff the desc-base overflows the
//     effective cap
//   - the focused option remains inside the viewport's auto-scrolled window

import { describe, expect, it } from 'vitest';
import {
  D1_TRUNCATED_LINE_CAP,
  D2_TRUNCATION_MARKER,
  D4_PADDING_ROW_COUNT,
  D5_EXPANDED_LINE_CAP,
  D5_MIN_EFFECTIVE_CAP,
  computeLayout,
  effectiveExpandedCap,
  type LayoutState,
  type RenderLoopOptions,
} from './render-loop.js';

const TERMINAL_ROWS    = [12, 20, 40, 80] as const;
const DESC_LINE_COUNTS = [1, 2, 4, 8, 10, 15] as const;
const FOCUS_POSITIONS  = ['top', 'middle', 'bottom'] as const;
const OPTION_COUNT     = 5;
const COLS             = 80;

type FocusPosition = (typeof FOCUS_POSITIONS)[number];

function focusIndexFor(position: FocusPosition): number {
  if (position === 'top')    return 0;
  if (position === 'bottom') return OPTION_COUNT - 1;
  return Math.floor(OPTION_COUNT / 2);
}

function makeDescBase(lines: number): string {
  // Short per-line content keeps the wrap layer from inflating the line
  // count beyond the input — the matrix asserts against the input line
  // count directly, so the wrap layer must not silently rewrap.
  return Array.from({ length: lines }, (_, i) => `desc-${i + 1}`).join('\n');
}

function makeOpts(rows: number, focusedDescLines: number, focusedIdx: number): RenderLoopOptions {
  return {
    pinchLabel: 'P',
    question:   'Q',
    rows,
    cols:       COLS,
    options: Array.from({ length: OPTION_COUNT }, (_, i) => ({
      value:    `opt-${i}`,
      label:    `Option ${i}`,
      descBase: i === focusedIdx ? makeDescBase(focusedDescLines) : 'short desc',
    })),
  };
}

const MATRIX = TERMINAL_ROWS.flatMap((rows) =>
  DESC_LINE_COUNTS.flatMap((descLines) =>
    FOCUS_POSITIONS.map((position) => ({ rows, descLines, position })),
  ),
);

describe('render-loop smoke matrix (4 rows × 6 desc-lengths × 3 positions = 72 scenarios)', () => {
  describe.each(MATRIX)(
    'rows=$rows / descLines=$descLines / focus=$position',
    ({ rows, descLines, position }) => {
      const focusedIdx = focusIndexFor(position);
      const opts       = makeOpts(rows, descLines, focusedIdx);
      const state: LayoutState = {
        focusedIndex:    focusedIdx,
        expandedOptions: new Set([focusedIdx]),
        scrollOffset:    0,
      };
      const r = computeLayout(opts, state);

      // Pre-compute the expected expand-vs-refuse decision so each assertion
      // can reason about both branches in one place.
      const preFixedLines      = 2 + D4_PADDING_ROW_COUNT;  // pinch + question + padding
      const preAvail           = Math.max(0, rows - preFixedLines - 2);
      const preExpandedCap     = effectiveExpandedCap(preAvail);
      const expansionAllowed   = preExpandedCap >= D5_MIN_EFFECTIVE_CAP;
      const expectedCap        = expansionAllowed ? preExpandedCap : D1_TRUNCATED_LINE_CAP;
      const expectedKind       = expansionAllowed ? 'desc-base-expanded' : 'desc-base-truncated';
      const expectedDescCount  = Math.min(descLines, expectedCap);
      const expectedHasMarker  = descLines > expectedCap;

      it('produces a non-empty per-option range for the focused option', () => {
        const focusedRange = r.optionLineRanges.find((rg) => rg.itemIndex === focusedIdx);
        expect(focusedRange).toBeDefined();
        expect(focusedRange!.endIdx - focusedRange!.startIdx).toBeGreaterThan(0);
      });

      it(`desc-base emissions for the focused option are kind=${expectedKind} and count=${expectedDescCount}`, () => {
        const focusedRange = r.optionLineRanges.find((rg) => rg.itemIndex === focusedIdx)!;
        const focusedEmissions = r.emissions.slice(focusedRange.startIdx, focusedRange.endIdx);
        const descBaseLines    = focusedEmissions.filter(
          (e) => e.kind === 'desc-base-expanded' || e.kind === 'desc-base-truncated',
        );
        expect(descBaseLines.length).toBe(expectedDescCount);
        expect(descBaseLines.every((e) => e.kind === expectedKind)).toBe(true);
      });

      it(`truncation marker is ${expectedHasMarker ? 'present on the last desc line' : 'absent'}`, () => {
        const focusedRange = r.optionLineRanges.find((rg) => rg.itemIndex === focusedIdx)!;
        const focusedEmissions = r.emissions.slice(focusedRange.startIdx, focusedRange.endIdx);
        const descBaseLines    = focusedEmissions.filter(
          (e) => e.kind === 'desc-base-expanded' || e.kind === 'desc-base-truncated',
        );
        if (descBaseLines.length === 0) return;  // no desc lines to check
        const lastDescText = descBaseLines[descBaseLines.length - 1].text;
        if (expectedHasMarker) {
          expect(lastDescText).toContain(D2_TRUNCATION_MARKER);
        } else {
          expect(lastDescText).not.toContain(D2_TRUNCATION_MARKER);
        }
      });

      it('focused option stays inside the viewport after auto-scroll', () => {
        const focusedRange = r.optionLineRanges.find((rg) => rg.itemIndex === focusedIdx)!;
        // Locate the option region's offset inside the styledLines array.
        const optionRegionStart = r.emissions.findIndex((e) => e.optionIndex !== null);
        const focusedStartOR    = focusedRange.startIdx - optionRegionStart;
        const focusedEndOR      = focusedRange.endIdx   - optionRegionStart;
        // The auto-scrolled viewport keeps the focused range bounded by
        // [appliedScrollOffset, appliedScrollOffset + avail).
        const scrollStart = r.viewport.appliedScrollOffset;
        const scrollEnd   = r.viewport.appliedScrollOffset + r.budget.avail;
        expect(focusedStartOR).toBeGreaterThanOrEqual(scrollStart);
        expect(focusedEndOR).toBeLessThanOrEqual(scrollEnd);
      });
    },
  );
});

describe('render-loop smoke matrix — sanity bounds (matrix wiring + caps)', () => {
  it('produces exactly 72 scenarios when expanded across all dimensions', () => {
    expect(MATRIX).toHaveLength(TERMINAL_ROWS.length * DESC_LINE_COUNTS.length * FOCUS_POSITIONS.length);
    expect(MATRIX).toHaveLength(72);
  });

  it('D5_EXPANDED_LINE_CAP is 8 (the value the matrix was sized against)', () => {
    expect(D5_EXPANDED_LINE_CAP).toBe(8);
  });

  it('focus-position helper maps deterministically to fixture indices', () => {
    expect(focusIndexFor('top')).toBe(0);
    expect(focusIndexFor('middle')).toBe(2);
    expect(focusIndexFor('bottom')).toBe(OPTION_COUNT - 1);
  });
});
