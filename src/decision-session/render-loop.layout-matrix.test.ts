import { describe, expect, it } from 'vitest';
import {
  D1_TRUNCATED_LINE_CAP,
  D2_TRUNCATION_MARKER,
  computeLayout,
  effectiveExpandedCap,
  type LayoutState,
  type RenderLoopOptions,
} from './render-loop.js';

const TERMINAL_ROWS = [12, 20, 40, 80] as const;
const DESC_LINE_COUNTS = [1, 2, 4, 8, 10, 15] as const;
const FOCUS_POSITIONS = ['top', 'middle', 'bottom'] as const;
const MIXED_ROWS = [12, 20, 40] as const;
const MIXED_DESC_LINE_COUNTS = [4, 10, 15] as const;
const OPTION_COUNT = 5;
const COLS = 80;

type FocusPosition = (typeof FOCUS_POSITIONS)[number];

function focusIndexFor(position: FocusPosition): number {
  if (position === 'top') return 0;
  if (position === 'bottom') return OPTION_COUNT - 1;
  return Math.floor(OPTION_COUNT / 2);
}

function makeDescBase(prefix: string, lines: number): string {
  return Array.from({ length: lines }, (_, i) => `${prefix}-${i + 1}`).join('\n');
}

function makeCollapsedOpts(rows: number, focusedDescLines: number, focusedIdx: number): RenderLoopOptions {
  return {
    pinchLabel: 'P',
    question: 'Q',
    rows,
    cols: COLS,
    options: Array.from({ length: OPTION_COUNT }, (_, i) => ({
      value: `opt-${i}`,
      label: `Option ${i}`,
      descBase: i === focusedIdx ? makeDescBase(`focused-${i}`, focusedDescLines) : 'short desc',
    })),
  };
}

function makeMixedOpts(rows: number, descLines: number, focusedIdx: number): RenderLoopOptions {
  return {
    pinchLabel: 'P',
    question: 'Q',
    rows,
    cols: COLS,
    options: Array.from({ length: OPTION_COUNT }, (_, i) => ({
      value: `opt-${i}`,
      label: `Option ${i}`,
      descBase: makeDescBase(`option-${i}`, descLines),
    })),
  };
}

function descEmissions(layout: ReturnType<typeof computeLayout>, itemIndex: number) {
  return layout.emissions.filter(
    (emission) =>
      emission.optionIndex === itemIndex &&
      (emission.kind === 'desc-base-expanded' || emission.kind === 'desc-base-truncated'),
  );
}

function expectFocusedVisible(layout: ReturnType<typeof computeLayout>, itemIndex: number) {
  const focusedRange = layout.optionLineRanges.find((range) => range.itemIndex === itemIndex);
  expect(focusedRange).toBeDefined();

  const optionRegionStart = layout.emissions.findIndex((emission) => emission.optionIndex !== null);
  const focusedStart = focusedRange!.startIdx - optionRegionStart;
  const focusedEnd = focusedRange!.endIdx - optionRegionStart;
  const scrollStart = layout.viewport.appliedScrollOffset;
  const scrollEnd = layout.viewport.appliedScrollOffset + layout.budget.avail;

  expect(focusedStart).toBeGreaterThanOrEqual(scrollStart);
  expect(focusedEnd).toBeLessThanOrEqual(scrollEnd);
}

const COLLAPSED_MATRIX = TERMINAL_ROWS.flatMap((rows) =>
  DESC_LINE_COUNTS.flatMap((descLines) =>
    FOCUS_POSITIONS.map((position) => ({ rows, descLines, position })),
  ),
);

const MIXED_MATRIX = MIXED_ROWS.flatMap((rows) =>
  MIXED_DESC_LINE_COUNTS.flatMap((descLines) =>
    FOCUS_POSITIONS.map((position) => ({ rows, descLines, position })),
  ),
);

describe('render-loop layout matrix — collapsed focused option (Phase 3 complement)', () => {
  describe.each(COLLAPSED_MATRIX)(
    'rows=$rows / descLines=$descLines / focus=$position',
    ({ rows, descLines, position }) => {
      const focusedIdx = focusIndexFor(position);
      const layout = computeLayout(
        makeCollapsedOpts(rows, descLines, focusedIdx),
        {
          focusedIndex: focusedIdx,
          expandedOptions: new Set<number>(),
          scrollOffset: 0,
        } satisfies LayoutState,
      );
      const expectedDescCount = Math.min(descLines, D1_TRUNCATED_LINE_CAP);
      const expectedHasMarker = descLines > D1_TRUNCATED_LINE_CAP;

      it(`keeps the focused desc-base on the focused kind while truncating to count=${expectedDescCount}`, () => {
        const focusedDesc = descEmissions(layout, focusedIdx);
        expect(focusedDesc).toHaveLength(expectedDescCount);
        expect(focusedDesc.every((emission) => emission.kind === 'desc-base-expanded')).toBe(true);
      });

      it(`truncation marker is ${expectedHasMarker ? 'present' : 'absent'} in the collapsed state`, () => {
        const focusedDesc = descEmissions(layout, focusedIdx);
        if (focusedDesc.length === 0) return;
        const lastLine = focusedDesc[focusedDesc.length - 1]!.text;
        if (expectedHasMarker) {
          expect(lastLine).toContain(D2_TRUNCATION_MARKER);
        } else {
          expect(lastLine).not.toContain(D2_TRUNCATION_MARKER);
        }
      });

      it('keeps the focused option inside the viewport', () => {
        expectFocusedVisible(layout, focusedIdx);
      });
    },
  );
});

describe('render-loop layout matrix — mixed expanded/non-expanded options', () => {
  describe.each(MIXED_MATRIX)(
    'rows=$rows / descLines=$descLines / focus=$position',
    ({ rows, descLines, position }) => {
      const focusedIdx = focusIndexFor(position);
      const layout = computeLayout(
        makeMixedOpts(rows, descLines, focusedIdx),
        {
          focusedIndex: focusedIdx,
          expandedOptions: new Set<number>([0, 1, 2, 3, 4]),
          scrollOffset: 0,
        } satisfies LayoutState,
      );
      const expandedCap = effectiveExpandedCap(Math.max(0, rows - 3 - 2));
      const focusedExpectedCount = Math.min(descLines, expandedCap);
      const siblingExpectedCount = Math.min(descLines, expandedCap);

      it('keeps the focused option on the bright tier while non-focused siblings stay on the truncated tier', () => {
        const focusedDesc = descEmissions(layout, focusedIdx);
        expect(focusedDesc).toHaveLength(focusedExpectedCount);
        expect(focusedDesc.every((emission) => emission.kind === 'desc-base-expanded')).toBe(true);

        for (let i = 0; i < OPTION_COUNT; i++) {
          if (i === focusedIdx) continue;
          const siblingDesc = descEmissions(layout, i);
          expect(siblingDesc).toHaveLength(siblingExpectedCount);
          expect(siblingDesc.every((emission) => emission.kind === 'desc-base-truncated')).toBe(true);
        }
      });

      it('preserves the focused option inside the viewport while siblings stay truncated', () => {
        expectFocusedVisible(layout, focusedIdx);
        const visibleText = layout.viewport.visibleStyledLines.join('\n');
        expect(visibleText).toContain(`Option ${focusedIdx}`);
        expect(visibleText).toContain(`option-${focusedIdx}-1`);
      });
    },
  );

  it('adds 27 complementary mixed-state scenarios on top of the locked smoke matrix', () => {
    expect(MIXED_MATRIX).toHaveLength(MIXED_ROWS.length * MIXED_DESC_LINE_COUNTS.length * FOCUS_POSITIONS.length);
    expect(MIXED_MATRIX).toHaveLength(27);
  });
});
