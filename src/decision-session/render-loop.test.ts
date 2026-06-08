import { describe, expect, it } from 'vitest';
import {
  computeLayout,
  D1_TRUNCATED_LINE_CAP,
  D2_TRUNCATION_MARKER,
  D4_PADDING_ROW_COUNT,
  D5_EXPANDED_LINE_CAP,
  SUB_LINE_CONTINUATION_INDENT,
  SUB_LINE_PREFIX,
  renderDescBaseSubLines,
  wrapAndCap,
  wrapLine,
  type LayoutState,
  type RenderLoopOptions,
  type SelectableItem,
} from './render-loop.js';
import { ALL_LINE_KINDS } from './styler.js';

const FRESH_STATE: LayoutState = {
  focusedIndex:    0,
  expandedOptions: new Set<number>(),
  scrollOffset:    0,
};

function makeOpts(over: Partial<RenderLoopOptions> = {}): RenderLoopOptions {
  return {
    pinchLabel:     'Before coding.',
    question:       'Before building — is the plan written?',
    options:        [
      { value: 'l1-0', label: 'Write a PRD',     descBase: 'PRD body sentence.' },
      { value: 'l1-1', label: 'Define problem',  descBase: 'Problem framing.' },
    ],
    rows:           40,
    cols:           80,
    ...over,
  };
}

describe('render-loop — computeLayout vertical order (dev-plan §11.2)', () => {
  it('emits pinch-label first, then question (no subtitle / no why-help case)', () => {
    const r = computeLayout(makeOpts(), FRESH_STATE);
    expect(r.emissions[0].kind).toBe('pinch-label');
    expect(r.emissions[1].kind).toBe('question');
  });

  it('inserts the subtitle as a pinch-label kind between pinch and question when present', () => {
    const r = computeLayout(makeOpts({ subtitle: 'next step' }), FRESH_STATE);
    expect(r.emissions[0].kind).toBe('pinch-label');
    expect(r.emissions[0].text).toBe('Before coding.');
    expect(r.emissions[1].kind).toBe('pinch-label');
    expect(r.emissions[1].text).toBe('next step');
    expect(r.emissions[2].kind).toBe('question');
  });

  it('emits one popup-why-help element per line of whyHelpBlock', () => {
    const r = computeLayout(makeOpts({
      whyHelpBlock: 'Open bookend\nWhy-help content line one\nWhy-help content line two\nClose bookend',
    }), FRESH_STATE);
    // pinch, question, then 4 popup-why-help lines
    expect(r.emissions[0].kind).toBe('pinch-label');
    expect(r.emissions[1].kind).toBe('question');
    expect(r.emissions[2].kind).toBe('popup-why-help');
    expect(r.emissions[2].text).toBe('Open bookend');
    expect(r.emissions[3].kind).toBe('popup-why-help');
    expect(r.emissions[3].text).toBe('Why-help content line one');
    expect(r.emissions[4].kind).toBe('popup-why-help');
    expect(r.emissions[5].kind).toBe('popup-why-help');
    expect(r.emissions[5].text).toBe('Close bookend');
  });

  it('inserts D4 padding row between why-help (or question when no why-help) and first option-label', () => {
    const r = computeLayout(makeOpts({ whyHelpBlock: 'wh1\nwh2' }), FRESH_STATE);
    // Find the first option-label emission and check the row immediately before it is padding.
    const firstLabelIdx = r.emissions.findIndex((e) => e.kind === 'option-label');
    expect(firstLabelIdx).toBeGreaterThan(0);
    const paddingIdx = firstLabelIdx - 1;
    expect(r.emissions[paddingIdx].isPadding).toBe(true);
  });

  it('inserts exactly D4_PADDING_ROW_COUNT padding rows when whyHelpBlock is omitted', () => {
    const r = computeLayout(makeOpts(), FRESH_STATE);
    const paddingCount = r.emissions.filter((e) => e.isPadding && e.optionIndex === null).length;
    expect(paddingCount).toBe(D4_PADDING_ROW_COUNT);
  });

  it('emits option-label + ↳-prefixed desc-base sub-line per option', () => {
    const r = computeLayout(makeOpts(), FRESH_STATE);
    const labels = r.emissions.filter((e) => e.kind === 'option-label');
    expect(labels.map((e) => e.text)).toEqual(['Write a PRD', 'Define problem']);

    const subs = r.emissions.filter((e) => e.kind === 'desc-base-truncated' || e.kind === 'desc-base-expanded');
    expect(subs.map((e) => e.text)).toEqual([
      `${SUB_LINE_PREFIX}PRD body sentence.`,
      `${SUB_LINE_PREFIX}Problem framing.`,
    ]);
  });

  it('emits the desc-base sub-line as desc-base-truncated by default and desc-base-expanded when index is in expandedOptions', () => {
    const r = computeLayout(makeOpts(), { ...FRESH_STATE, expandedOptions: new Set([1]) });
    const subs = r.emissions.filter((e) => e.kind === 'desc-base-truncated' || e.kind === 'desc-base-expanded');
    // option 0 → truncated; option 1 → expanded
    expect(subs[0].kind).toBe('desc-base-truncated');
    expect(subs[1].kind).toBe('desc-base-expanded');
  });

  it('skips the desc-base sub-line for meta items (SKIP_NOW / SHOW_SIMPLER / HELP_LABEL)', () => {
    const r = computeLayout(makeOpts({
      options: [
        { value: 'content',   label: 'Real option', descBase: 'with desc' },
        { value: 'skip-now',  label: 'Skip for now', isMeta: true, descBase: 'should be ignored' },
      ],
    }), FRESH_STATE);
    const subs = r.emissions.filter((e) => e.kind === 'desc-base-truncated' || e.kind === 'desc-base-expanded');
    expect(subs).toHaveLength(1);
    expect(subs[0].text).toContain('with desc');
  });

  it('emits separator items as blank option-row padding (no LineKind-specific styling)', () => {
    const r = computeLayout(makeOpts({
      options: [
        { value: 'content',   label: 'Real option', descBase: 'desc' },
        { value: 'sep',       label: '',            isSeparator: true },
        { value: 'skip-now',  label: 'Skip for now', isMeta: true },
      ],
    }), FRESH_STATE);
    const sepEmission = r.emissions.find((e) => e.optionIndex === 1 && e.isPadding);
    expect(sepEmission).toBeDefined();
    expect(sepEmission!.text).toBe('');
  });
});

describe('render-loop — LineKind separate-element invariant (dev-plan §11.11)', () => {
  it('every emitted line is a SEPARATE LineKind-tagged element (option-label and desc-base never concatenated)', () => {
    const r = computeLayout(makeOpts(), FRESH_STATE);
    for (let i = 0; i < r.emissions.length; i++) {
      const e = r.emissions[i];
      // No emission's text contains a newline — would imply layout collapsed multiple lines into one emission.
      expect(e.text.includes('\n')).toBe(false);
      // No emission's text mixes a label and its desc-base sub-line — would imply concatenation.
      if (e.kind === 'option-label') {
        expect(e.text.startsWith(SUB_LINE_PREFIX)).toBe(false);
      }
    }
  });

  it('every emission carries a LineKind from the canonical 7-kind enum', () => {
    const r = computeLayout(makeOpts({
      subtitle:     'subtitle here',
      whyHelpBlock: 'wh',
    }), FRESH_STATE);
    for (const e of r.emissions) {
      expect(ALL_LINE_KINDS).toContain(e.kind);
    }
  });

  it('option-label and its desc-base sub-line are emitted as TWO distinct elements', () => {
    const r = computeLayout(makeOpts(), FRESH_STATE);
    const range = r.optionLineRanges.find((rg) => rg.itemIndex === 0)!;
    const slice = r.emissions.slice(range.startIdx, range.endIdx);
    // 2 elements: the label + the desc-base sub-line
    expect(slice).toHaveLength(2);
    expect(slice[0].kind).toBe('option-label');
    expect(slice[1].kind).toBe('desc-base-truncated');
  });
});

describe('render-loop — styler dispatch (dev-plan §11.10 D6)', () => {
  it('runs every emission through styler — styledLines has the same length as emissions', () => {
    const r = computeLayout(makeOpts({ subtitle: 's', whyHelpBlock: 'a\nb\nc' }), FRESH_STATE);
    expect(r.styledLines).toHaveLength(r.emissions.length);
  });

  it('pass-through styler keeps text identical to emissions (Phase 1 styler body is pass-through)', () => {
    const r = computeLayout(makeOpts(), FRESH_STATE);
    for (let i = 0; i < r.emissions.length; i++) {
      expect(r.styledLines[i]).toBe(r.emissions[i].text);
    }
  });
});

describe('render-loop — wrapLine (basic word-wrap)', () => {
  it('returns the input unchanged when text fits within width', () => {
    expect(wrapLine('short text', 40)).toEqual(['short text']);
  });

  it('wraps at word boundaries when text exceeds width', () => {
    const out = wrapLine('alpha bravo charlie delta echo', 12);
    expect(out.length).toBeGreaterThan(1);
    for (const ln of out) expect(ln.length).toBeLessThanOrEqual(12);
  });

  it('hard-breaks tokens longer than the width', () => {
    const out = wrapLine('xxxxxxxxxxxxxxxxxxxx', 5);
    expect(out).toEqual(['xxxxx', 'xxxxx', 'xxxxx', 'xxxxx']);
  });

  it('returns the input unchanged when width is non-positive (defensive)', () => {
    expect(wrapLine('anything', 0)).toEqual(['anything']);
    expect(wrapLine('anything', -1)).toEqual(['anything']);
  });
});

describe('render-loop — wrapAndCap (D1 / D2 / D5 unified)', () => {
  it('returns all lines without marker when content fits within cap (dev-plan §11.6 — no marker when fits-naturally)', () => {
    const r = wrapAndCap('one line only', 40, 2, D2_TRUNCATION_MARKER);
    expect(r.didTruncate).toBe(false);
    expect(r.lines).toEqual(['one line only']);
    expect(r.lines[0].endsWith(D2_TRUNCATION_MARKER)).toBe(false);
  });

  it('truncates to cap with `...` marker on the last visible line when content overflows', () => {
    const r = wrapAndCap('line-a\nline-b\nline-c\nline-d', 40, 2, D2_TRUNCATION_MARKER);
    expect(r.didTruncate).toBe(true);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[1].endsWith(D2_TRUNCATION_MARKER)).toBe(true);
  });

  it('honours D5 8-line cap when expanded', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `l${i + 1}`).join('\n');
    const r   = wrapAndCap(ten, 40, D5_EXPANDED_LINE_CAP, D2_TRUNCATION_MARKER);
    expect(r.lines).toHaveLength(8);
    expect(r.didTruncate).toBe(true);
    expect(r.lines[7].endsWith(D2_TRUNCATION_MARKER)).toBe(true);
  });

  it('does NOT append `...` when content fits-exactly-at-cap', () => {
    const two = 'a\nb';
    const r   = wrapAndCap(two, 40, 2, D2_TRUNCATION_MARKER);
    expect(r.didTruncate).toBe(false);
    expect(r.lines).toEqual(['a', 'b']);
  });

  it('respects width when wrapping a single long source line', () => {
    const long = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet';
    const r    = wrapAndCap(long, 20, D5_EXPANDED_LINE_CAP, D2_TRUNCATION_MARKER);
    for (const ln of r.lines) {
      // Last line may contain the marker which inflates length slightly; subtract marker on overflow.
      const len = ln.length;
      expect(len).toBeLessThanOrEqual(20 + D2_TRUNCATION_MARKER.length);
    }
  });

  it('trims the last visible line so `line + marker` fits within width when truncating', () => {
    const r = wrapAndCap('aaaaaaa\nbbbbbbb\nccccccc\nddddddd', 5, 2, D2_TRUNCATION_MARKER);
    expect(r.didTruncate).toBe(true);
    expect(r.lines[1].length).toBeLessThanOrEqual(5);
    expect(r.lines[1].endsWith(D2_TRUNCATION_MARKER)).toBe(true);
  });
});

describe('render-loop — renderDescBaseSubLines (↳ prefix + cap application)', () => {
  it('emits a single ↳-prefixed line when desc-base is short (LIGHT case, dev-plan §11.5 step 3)', () => {
    const out = renderDescBaseSubLines('short', 80, D1_TRUNCATED_LINE_CAP);
    expect(out).toEqual([`${SUB_LINE_PREFIX}short`]);
  });

  it('emits 2 lines (↳ first, continuation-indent second) when source has 2 lines fitting natively', () => {
    const out = renderDescBaseSubLines('line one\nline two', 80, D1_TRUNCATED_LINE_CAP);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(`${SUB_LINE_PREFIX}line one`);
    expect(out[1]).toBe(`${SUB_LINE_CONTINUATION_INDENT}line two`);
  });

  it('caps at D1 (2 lines) with `...` marker when source has 3+ lines in truncated state', () => {
    const out = renderDescBaseSubLines('one\ntwo\nthree\nfour', 80, D1_TRUNCATED_LINE_CAP);
    expect(out).toHaveLength(2);
    expect(out[1].endsWith(D2_TRUNCATION_MARKER)).toBe(true);
  });

  it('caps at D5 (8 lines) with `...` marker when source has 9+ lines in expanded state', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `l${i + 1}`).join('\n');
    const out = renderDescBaseSubLines(ten, 80, D5_EXPANDED_LINE_CAP);
    expect(out).toHaveLength(D5_EXPANDED_LINE_CAP);
    expect(out[D5_EXPANDED_LINE_CAP - 1].endsWith(D2_TRUNCATION_MARKER)).toBe(true);
  });

  it('only the FIRST sub-line carries the ↳ prefix; continuation lines use the alignment indent', () => {
    const out = renderDescBaseSubLines('a\nb\nc', 80, D5_EXPANDED_LINE_CAP);
    expect(out[0].startsWith(SUB_LINE_PREFIX)).toBe(true);
    expect(out[1].startsWith(SUB_LINE_PREFIX)).toBe(false);
    expect(out[1].startsWith(SUB_LINE_CONTINUATION_INDENT)).toBe(true);
    expect(out[2].startsWith(SUB_LINE_CONTINUATION_INDENT)).toBe(true);
  });
});

describe('render-loop — computeLayout D1 + D2 integration', () => {
  it('emits one element per WRAPPED line for the desc-base sub-line block', () => {
    const opts: RenderLoopOptions = {
      pinchLabel: 'P',
      question:   'Q',
      options:    [
        { value: 'a', label: 'L', descBase: 'line one\nline two\nline three\nline four' },
      ],
      rows: 40,
      cols: 80,
    };
    const r = computeLayout(opts, { focusedIndex: 0, expandedOptions: new Set(), scrollOffset: 0 });
    const descLines = r.emissions.filter((e) => e.kind === 'desc-base-truncated');
    expect(descLines).toHaveLength(D1_TRUNCATED_LINE_CAP);
    expect(descLines[D1_TRUNCATED_LINE_CAP - 1].text.endsWith(D2_TRUNCATION_MARKER)).toBe(true);
  });

  it('emits more wrapped lines when the option is in the expanded set (D5 cap = 8)', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `l${i + 1}`).join('\n');
    const opts: RenderLoopOptions = {
      pinchLabel: 'P', question: 'Q',
      options: [{ value: 'a', label: 'L', descBase: ten }],
      rows: 40, cols: 80,
    };
    const r = computeLayout(opts, { focusedIndex: 0, expandedOptions: new Set([0]), scrollOffset: 0 });
    const descLines = r.emissions.filter((e) => e.kind === 'desc-base-expanded');
    expect(descLines).toHaveLength(D5_EXPANDED_LINE_CAP);
  });

  it('every wrapped desc-base line shares the same LineKind (separate elements, same kind)', () => {
    const opts: RenderLoopOptions = {
      pinchLabel: 'P', question: 'Q',
      options: [{ value: 'a', label: 'L', descBase: 'one\ntwo' }],
      rows: 40, cols: 80,
    };
    const r = computeLayout(opts, { focusedIndex: 0, expandedOptions: new Set(), scrollOffset: 0 });
    const descLines = r.emissions.filter((e) => e.kind === 'desc-base-truncated');
    expect(descLines).toHaveLength(2);
    for (const e of descLines) expect(e.kind).toBe('desc-base-truncated');
  });
});

describe('render-loop — per-option line range tracking', () => {
  it('optionLineRanges entry for each option spans the option-label + desc-base sub-line emissions', () => {
    const r = computeLayout(makeOpts(), FRESH_STATE);
    expect(r.optionLineRanges).toHaveLength(2);
    for (const range of r.optionLineRanges) {
      const slice = r.emissions.slice(range.startIdx, range.endIdx);
      expect(slice.every((e) => e.optionIndex === range.itemIndex)).toBe(true);
    }
  });
});
