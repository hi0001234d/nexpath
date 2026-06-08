import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import {
  computeLayout,
  D1_TRUNCATED_LINE_CAP,
  D2_TRUNCATION_MARKER,
  D4_PADDING_ROW_COUNT,
  D5_EXPANDED_LINE_CAP,
  SHORTCUT_HINT_COLLAPSE,
  SHORTCUT_HINT_EXPAND,
  SUB_LINE_CONTINUATION_INDENT,
  SUB_LINE_PREFIX,
  normaliseKeypress,
  renderDescBaseSubLines,
  renderLoop,
  wrapAndCap,
  wrapLine,
  type KeyEvent,
  type LayoutState,
  type RenderLoopOptions,
  type SelectableItem,
} from './render-loop.js';
import { ALL_LINE_KINDS } from './styler.js';

async function* eventsOf(...names: KeyEvent['name'][]): AsyncIterable<KeyEvent> {
  for (const name of names) yield { name };
}

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

  it('option-label and its desc-base sub-line are emitted as DISTINCT elements (focused option also gets a shortcut-hint per §11.2)', () => {
    // Focus the SECOND option so the first (unfocused) option emits exactly
    // label + desc-base (2 elements). The focused option emits label + desc-base + shortcut-hint (3 elements).
    const r           = computeLayout(makeOpts(), { ...FRESH_STATE, focusedIndex: 1 });
    const unfocused   = r.optionLineRanges.find((rg) => rg.itemIndex === 0)!;
    const focused     = r.optionLineRanges.find((rg) => rg.itemIndex === 1)!;
    const unfocSlice  = r.emissions.slice(unfocused.startIdx, unfocused.endIdx);
    const focSlice    = r.emissions.slice(focused.startIdx,   focused.endIdx);

    expect(unfocSlice).toHaveLength(2);
    expect(unfocSlice[0].kind).toBe('option-label');
    expect(unfocSlice[1].kind).toBe('desc-base-truncated');

    expect(focSlice).toHaveLength(3);
    expect(focSlice[0].kind).toBe('option-label');
    expect(focSlice[1].kind).toBe('desc-base-truncated');
    expect(focSlice[2].kind).toBe('shortcut-hint');
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

describe('render-loop — auto-scroll viewport (§11.7 step 5 + §11.9 step 5)', () => {
  function makeManyOpts(n: number, descBaseLines = 1): RenderLoopOptions {
    const desc = Array.from({ length: descBaseLines }, (_, i) => `l${i + 1}`).join('\n');
    return {
      pinchLabel: 'P', question: 'Q',
      options: Array.from({ length: n }, (_, i) => ({ value: `opt-${i}`, label: `O${i}`, descBase: desc })),
      rows: 14, cols: 80,  // tight terminal — forces scroll
    };
  }

  it('appliedScrollOffset === 0 when the focused option already fits inside the viewport', () => {
    const r = computeLayout(makeManyOpts(3), { ...FRESH_STATE, focusedIndex: 0 });
    expect(r.viewport.appliedScrollOffset).toBe(0);
  });

  it('auto-scrolls DOWN so the focused option\'s end fits inside the viewport', () => {
    const opts = makeManyOpts(10);
    // rows=14, no whyHelp → fixed = pinch+question+padding = 3; avail = 14-3-2 = 9
    // Each unfocused option = 2 emissions (label + 1-line desc); focused = 3 (label + desc + hint)
    // Focusing index 8 puts the focused option's end deep into the option list → must scroll.
    const r = computeLayout(opts, { focusedIndex: 8, expandedOptions: new Set(), scrollOffset: 0 });
    expect(r.viewport.appliedScrollOffset).toBeGreaterThan(0);
    // The focused option's emissions appear in visibleStyledLines.
    const focusedLabel = `O8`;
    const visibleText  = r.viewport.visibleStyledLines.join('\n');
    expect(visibleText).toContain(focusedLabel);
  });

  it('auto-scrolls UP when focus moves above the current scroll window', () => {
    const opts = makeManyOpts(10);
    // Start with a high scrollOffset, then focus index 0 — must scroll back up.
    const r = computeLayout(opts, { focusedIndex: 0, expandedOptions: new Set(), scrollOffset: 12 });
    expect(r.viewport.appliedScrollOffset).toBeLessThanOrEqual(0 + r.optionLineRanges[0].endIdx);
    // Option 0 must be visible.
    const visibleText = r.viewport.visibleStyledLines.join('\n');
    expect(visibleText).toContain('O0');
  });

  it('does not scroll past the end of the option list', () => {
    const opts = makeManyOpts(3);
    const r    = computeLayout(opts, { focusedIndex: 0, expandedOptions: new Set(), scrollOffset: 9999 });
    // With only 3 options, scrolling past the end clamps to 0 (or to max scroll which is 0 here).
    expect(r.viewport.appliedScrollOffset).toBe(0);
  });

  it('expanding the focused option triggers a scroll that keeps the expanded body visible', () => {
    const opts = makeManyOpts(5, 8);  // each desc-base is 8 lines → 8 lines in expanded state
    // Focus middle option in expanded state — its 8-line body plus label + hint = 10 rows.
    const r = computeLayout(opts, { focusedIndex: 2, expandedOptions: new Set([2]), scrollOffset: 0 });
    const visibleText = r.viewport.visibleStyledLines.join('\n');
    expect(visibleText).toContain('O2');
  });

  it('headers always appear in visibleStyledLines regardless of scrollOffset', () => {
    const opts = makeManyOpts(20);
    const r    = computeLayout(opts, { focusedIndex: 15, expandedOptions: new Set(), scrollOffset: 0 });
    // The pinch + question + D4 padding rows must be in the visible output.
    expect(r.viewport.visibleStyledLines[0]).toBe('P');  // pinch label
    expect(r.viewport.visibleStyledLines[1]).toBe('Q');  // question
  });

  it('reports the totalOptionRows for the interactive shell\'s scroll decisions', () => {
    const opts = makeManyOpts(3);  // 3 options × 2 emissions each = 6 (focused option = 3, others = 2)
    const r    = computeLayout(opts, { ...FRESH_STATE });
    expect(r.viewport.totalOptionRows).toBeGreaterThan(0);
    // 1 focused (3 rows) + 2 unfocused (2 rows each) = 3 + 4 = 7 option rows
    expect(r.viewport.totalOptionRows).toBe(7);
  });

  it('visibleStyledLines length === fixedLines + min(avail, totalOptionRows - appliedScrollOffset)', () => {
    const opts = makeManyOpts(10);
    const r    = computeLayout(opts, { focusedIndex: 5, expandedOptions: new Set(), scrollOffset: 0 });
    const expectedVisible = r.budget.fixedLines + Math.min(r.budget.avail, r.viewport.totalOptionRows - r.viewport.appliedScrollOffset);
    expect(r.viewport.visibleStyledLines.length).toBe(expectedVisible);
  });
});

describe('render-loop — budget computation (§11.4 / §11.8 / §11.12)', () => {
  it('fixedLines counts all header / why-help / D4-padding emissions (optionIndex === null)', () => {
    const r = computeLayout(makeOpts({ whyHelpBlock: 'w1\nw2\nw3' }), FRESH_STATE);
    // pinch (1) + question (1) + whyHelp (3) + D4 padding (1) = 6
    expect(r.budget.fixedLines).toBe(6);
  });

  it('fixedLines includes the subtitle row when present', () => {
    const r = computeLayout(makeOpts({ subtitle: 'lighter' }), FRESH_STATE);
    // pinch (1) + subtitle (1) + question (1) + D4 padding (1) = 4 (no whyHelp here)
    expect(r.budget.fixedLines).toBe(4);
  });

  it('avail = rows - fixedLines - 2, clamped to 0 for tiny terminals', () => {
    const big = computeLayout(makeOpts(), { ...FRESH_STATE });
    expect(big.budget.avail).toBe(big.budget.avail);
    expect(big.budget.avail).toBe(big.budget.avail >= 0 ? big.budget.avail : 0);
    // Force a very tiny terminal — avail must be 0, not negative.
    const tiny = computeLayout(makeOpts({ rows: 1 }), FRESH_STATE);
    expect(tiny.budget.avail).toBe(0);
  });

  it('fittedItems counts options whose total emission cost fits within avail', () => {
    // Each option costs 2 lines (label + 1-line truncated desc-base), the
    // focused option costs 3 (label + desc-base + shortcut-hint).
    // 2 options total → 3 + 2 = 5 emissions of cost. With rows=40 (avail = 40-3-2=35) all fit.
    const r = computeLayout(makeOpts(), FRESH_STATE);
    expect(r.budget.fittedItems).toBe(2);
  });

  it('maxItems is the larger of fittedItems and opts.maxItemsFloor (default 5)', () => {
    // 2 options, large terminal → fittedItems = 2; floor = 5 → maxItems = 5.
    const r = computeLayout(makeOpts(), FRESH_STATE);
    expect(r.budget.maxItems).toBe(5);
    expect(r.budget.fittedItems).toBeLessThan(r.budget.maxItems);
  });

  it('maxItems honours a caller-supplied maxItemsFloor', () => {
    const r = computeLayout(makeOpts({ maxItemsFloor: 2 }), FRESH_STATE);
    expect(r.budget.maxItems).toBe(2);  // fittedItems = 2, floor = 2 → maxItems = 2
  });

  it('a short terminal clips fittedItems to fewer than the total option count', () => {
    // rows=10, no whyHelp → fixedLines = pinch(1)+question(1)+padding(1) = 3
    // avail = 10 - 3 - 2 = 5. focused option cost = 3, second option cost = 2 → fits 2.
    const r = computeLayout(makeOpts({ rows: 10 }), FRESH_STATE);
    expect(r.budget.avail).toBe(5);
    expect(r.budget.fittedItems).toBe(2);
  });

  it('an EXPANDED option consumes more rows in the budget (D5 8-line cap → 9-line block)', () => {
    const eight  = Array.from({ length: 8 }, (_, i) => `l${i + 1}`).join('\n');
    const tightOpts: RenderLoopOptions = {
      pinchLabel: 'P', question: 'Q',
      options: [
        { value: 'a', label: 'A', descBase: eight },
        { value: 'b', label: 'B', descBase: 'b' },
      ],
      rows: 14, cols: 80,
    };
    // fixedLines = 3 (pinch+question+padding); avail = 14-3-2 = 9.
    // Focused option's emissions = label(1) + 8 expanded desc-base lines + shortcut-hint(1) = 10
    // 10 > avail (9) → focused option DOES NOT FIT in expanded state.
    const expanded = computeLayout(tightOpts, { focusedIndex: 0, expandedOptions: new Set([0]), scrollOffset: 0 });
    expect(expanded.budget.fittedItems).toBeLessThan(2);
    // Truncated state — focused option fits comfortably.
    const truncated = computeLayout(tightOpts, FRESH_STATE);
    expect(truncated.budget.fittedItems).toBe(2);
  });
});

describe('render-loop — shortcut-hint emission (§11.2 Gap 4 fix)', () => {
  it('emits exactly one shortcut-hint element under the focused option when it has a desc-base', () => {
    const r = computeLayout(makeOpts(), { ...FRESH_STATE, focusedIndex: 0 });
    const hints = r.emissions.filter((e) => e.kind === 'shortcut-hint');
    expect(hints).toHaveLength(1);
    expect(hints[0].optionIndex).toBe(0);
  });

  it('shortcut-hint reads "press Space to expand" when the focused option is truncated', () => {
    const r = computeLayout(makeOpts(), { ...FRESH_STATE, focusedIndex: 0 });
    const hint = r.emissions.find((e) => e.kind === 'shortcut-hint')!;
    expect(hint.text).toBe(SHORTCUT_HINT_EXPAND);
  });

  it('shortcut-hint reads "press Space to collapse" when the focused option is expanded', () => {
    const r = computeLayout(makeOpts(), { focusedIndex: 0, expandedOptions: new Set([0]), scrollOffset: 0 });
    const hint = r.emissions.find((e) => e.kind === 'shortcut-hint')!;
    expect(hint.text).toBe(SHORTCUT_HINT_COLLAPSE);
  });

  it('the shortcut-hint moves with focus — emitted under whichever option is focusedIndex', () => {
    const r0 = computeLayout(makeOpts(), { ...FRESH_STATE, focusedIndex: 0 });
    const r1 = computeLayout(makeOpts(), { ...FRESH_STATE, focusedIndex: 1 });
    expect(r0.emissions.find((e) => e.kind === 'shortcut-hint')!.optionIndex).toBe(0);
    expect(r1.emissions.find((e) => e.kind === 'shortcut-hint')!.optionIndex).toBe(1);
  });

  it('no shortcut-hint is emitted under meta items (SKIP_NOW / SHOW_SIMPLER / HELP_LABEL)', () => {
    const r = computeLayout(makeOpts({
      options: [
        { value: 'content', label: 'real',   descBase: 'desc' },
        { value: 'meta',    label: 'Skip',   isMeta: true },
      ],
    }), { ...FRESH_STATE, focusedIndex: 1 });
    const hints = r.emissions.filter((e) => e.kind === 'shortcut-hint');
    expect(hints).toHaveLength(0);
  });

  it('no shortcut-hint is emitted under separator items', () => {
    const r = computeLayout(makeOpts({
      options: [
        { value: 'content', label: 'real', descBase: 'desc' },
        { value: 'sep',     label: '',     isSeparator: true },
      ],
    }), { ...FRESH_STATE, focusedIndex: 1 });
    expect(r.emissions.filter((e) => e.kind === 'shortcut-hint')).toHaveLength(0);
  });

  it('no shortcut-hint is emitted when the focused option has no descBase content', () => {
    const r = computeLayout(makeOpts({
      options: [{ value: 'plain', label: 'no desc here' }],
    }), { ...FRESH_STATE, focusedIndex: 0 });
    expect(r.emissions.filter((e) => e.kind === 'shortcut-hint')).toHaveLength(0);
  });

  it('the shortcut-hint emission comes AFTER the focused option\'s desc-base sub-line block', () => {
    const r       = computeLayout(makeOpts(), { ...FRESH_STATE, focusedIndex: 0 });
    const hintIdx = r.emissions.findIndex((e) => e.kind === 'shortcut-hint');
    const descIdx = r.emissions.findIndex((e) => e.kind === 'desc-base-truncated' && e.optionIndex === 0);
    expect(descIdx).toBeGreaterThan(-1);
    expect(hintIdx).toBeGreaterThan(descIdx);
  });
});

describe('render-loop — renderLoop interactive shell', () => {
  function makeLayout(over: Partial<RenderLoopOptions> = {}): RenderLoopOptions {
    return {
      pinchLabel: 'P', question: 'Q',
      options: [
        { value: 'opt-a', label: 'A', descBase: 'a desc' },
        { value: 'opt-b', label: 'B', descBase: 'b desc' },
        { value: 'opt-c', label: 'C', descBase: 'c desc' },
      ],
      rows: 40, cols: 80,
      ...over,
    };
  }

  it('returns the focused option when Enter is pressed (default focus = first option)', async () => {
    const out = new PassThrough();
    const result = await renderLoop({
      layout:    makeLayout(),
      out,
      keyEvents: eventsOf('enter'),
    });
    expect(result).not.toBeNull();
    expect(result!.value).toBe('opt-a');
  });

  it('arrow-down moves focus to the next option', async () => {
    const out = new PassThrough();
    const result = await renderLoop({
      layout:    makeLayout(),
      out,
      keyEvents: eventsOf('arrow-down', 'enter'),
    });
    expect(result!.value).toBe('opt-b');
  });

  it('arrow-up wraps backwards from the first option to the last', async () => {
    const out = new PassThrough();
    const result = await renderLoop({
      layout:    makeLayout(),
      out,
      keyEvents: eventsOf('arrow-up', 'enter'),
    });
    expect(result!.value).toBe('opt-c');
  });

  it('arrow-down skips isSeparator items', async () => {
    const out = new PassThrough();
    const result = await renderLoop({
      layout: makeLayout({
        options: [
          { value: 'a',   label: 'A', descBase: 'a' },
          { value: 'sep', label: '',  isSeparator: true },
          { value: 'b',   label: 'B', descBase: 'b' },
        ],
      }),
      out,
      keyEvents: eventsOf('arrow-down', 'enter'),
    });
    // From index 0 (A), arrow-down skips index 1 (separator) and lands on index 2 (B).
    expect(result!.value).toBe('b');
  });

  it('returns null on Escape', async () => {
    const out = new PassThrough();
    const result = await renderLoop({
      layout:    makeLayout(),
      out,
      keyEvents: eventsOf('escape'),
    });
    expect(result).toBeNull();
  });

  it('returns null on Ctrl+C', async () => {
    const out = new PassThrough();
    const result = await renderLoop({
      layout:    makeLayout(),
      out,
      keyEvents: eventsOf('ctrl-c'),
    });
    expect(result).toBeNull();
  });

  it('Space key dispatches to the onSpace hook (default is no-op identity)', async () => {
    const out = new PassThrough();
    const result = await renderLoop({
      layout:    makeLayout(),
      out,
      keyEvents: eventsOf('space', 'enter'),
    });
    // Default onSpace is no-op — Space did nothing, Enter selected the focused option.
    expect(result!.value).toBe('opt-a');
  });

  it('custom onSpace hook can toggle expandedOptions (the Bhavnesh Phase 6 wiring point)', async () => {
    const out      = new PassThrough();
    const calls: Array<{ focusedItemValue: string | undefined }> = [];
    const onSpace  = (state: LayoutState, focusedItem: SelectableItem | undefined): LayoutState => {
      calls.push({ focusedItemValue: focusedItem?.value });
      const next = new Set(state.expandedOptions);
      if (next.has(state.focusedIndex)) next.delete(state.focusedIndex);
      else                              next.add(state.focusedIndex);
      return { ...state, expandedOptions: next };
    };
    const result = await renderLoop({
      layout:    makeLayout(),
      out,
      keyEvents: eventsOf('space', 'enter'),
      onSpace,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].focusedItemValue).toBe('opt-a');
    expect(result!.value).toBe('opt-a');
  });

  it('iterator exhaustion without a terminal event resolves to null (defensive cancel)', async () => {
    const out = new PassThrough();
    const result = await renderLoop({
      layout:    makeLayout(),
      out,
      keyEvents: eventsOf('arrow-down'),  // no terminal event — iterator ends
    });
    expect(result).toBeNull();
  });

  it('writes the initial frame to `out` before the first keypress', async () => {
    const out    = new PassThrough();
    const chunks: Buffer[] = [];
    out.on('data', (c: Buffer) => chunks.push(c));
    await renderLoop({
      layout:    makeLayout({ pinchLabel: 'PINCH_LABEL_MARKER', question: 'Q' }),
      out,
      keyEvents: eventsOf('enter'),
    });
    const seen = Buffer.concat(chunks).toString('utf8');
    expect(seen).toContain('PINCH_LABEL_MARKER');
  });
});

describe('render-loop — normaliseKeypress (readline event → KeyEvent)', () => {
  it('maps arrow-up / arrow-down', () => {
    expect(normaliseKeypress(undefined, { name: 'up'   }).name).toBe('arrow-up');
    expect(normaliseKeypress(undefined, { name: 'down' }).name).toBe('arrow-down');
  });

  it('maps enter / escape / ctrl-c / space / tab', () => {
    expect(normaliseKeypress(undefined, { name: 'return' }).name).toBe('enter');
    expect(normaliseKeypress(undefined, { name: 'escape' }).name).toBe('escape');
    expect(normaliseKeypress(undefined, { ctrl: true, name: 'c' }).name).toBe('ctrl-c');
    expect(normaliseKeypress(undefined, { name: 'space'  }).name).toBe('space');
    expect(normaliseKeypress(undefined, { name: 'tab'    }).name).toBe('tab');
    // Sequence-based dispatch
    expect(normaliseKeypress(' ',    undefined).name).toBe('space');
    expect(normaliseKeypress('\r',   undefined).name).toBe('enter');
    expect(normaliseKeypress('\x1b', undefined).name).toBe('escape');
    expect(normaliseKeypress('\t',   undefined).name).toBe('tab');
  });

  it('falls back to "other" for unrecognised keys', () => {
    expect(normaliseKeypress('x', { name: 'x' }).name).toBe('other');
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
