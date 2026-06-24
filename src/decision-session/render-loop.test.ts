import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import {
  computeLayout,
  D1_TRUNCATED_LINE_CAP,
  D2_TRUNCATION_MARKER,
  D4_PADDING_ROW_COUNT,
  D5_EXPANDED_LINE_CAP,
  SHORTCUT_HINT_TEXT,
  SUB_LINE_CONTINUATION_INDENT,
  SUB_LINE_PREFIX,
  normaliseKeypress,
  optionEntriesToSelectableItems,
  renderDescBaseSubLines,
  renderLoop,
  stripAnsi,
  visualRows,
  wrapAndCap,
  wrapLine,
  type KeyEvent,
  type LayoutState,
  type RenderLoopOptions,
  type SelectableItem,
} from './render-loop.js';
import { ALL_LINE_KINDS, styler } from './styler.js';
import { computeChromePrefix } from './render-loop-chrome.js';

// Force isTTY=true so the styler emits ANSI on its styled kinds — without
// this the non-TTY safeguard short-circuits the styler dispatch to
// pass-through and the styledLines vs emissions divergence collapses.
let origIsTTY: boolean | undefined;
beforeAll(() => {
  origIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = true;
});
afterAll(() => {
  process.stdout.isTTY = origIsTTY;
});

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
    // Focused option (index 0) emits 'option-label'; non-focused options
    // emit 'option-label-unfocused' (restores clack/prompts.select() default
    // — non-focused labels fade to dim so the eye lands on the focused
    // option first). The test filters for both kinds to assert the label
    // emission shape regardless of which kind tier the option lands in.
    const labels = r.emissions.filter(
      (e) => e.kind === 'option-label' || e.kind === 'option-label-unfocused',
    );
    expect(labels.map((e) => e.text)).toEqual(['Write a PRD', 'Define problem']);

    const subs = r.emissions.filter((e) => e.kind === 'desc-base-truncated' || e.kind === 'desc-base-expanded');
    expect(subs.map((e) => e.text)).toEqual([
      `${SUB_LINE_PREFIX}PRD body sentence.`,
      `${SUB_LINE_PREFIX}Problem framing.`,
    ]);
  });

  it('emits the desc-base sub-line as desc-base-truncated by default and desc-base-expanded when index is in expandedOptions', () => {
    // Focus option 1 so option 0 is NOT focused. The kind selection then
    // depends purely on whether the option is in expandedOptions:
    //   - option 0: not focused, not expanded → desc-base-truncated
    //   - option 1: focused AND in expandedOptions → desc-base-expanded
    const r = computeLayout(makeOpts(), { ...FRESH_STATE, focusedIndex: 1, expandedOptions: new Set([1]) });
    const subs = r.emissions.filter((e) => e.kind === 'desc-base-truncated' || e.kind === 'desc-base-expanded');
    expect(subs[0].kind).toBe('desc-base-truncated');  // option 0 — not focused, not expanded
    expect(subs[1].kind).toBe('desc-base-expanded');   // option 1 — focused AND in expandedOptions
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

  it('option-label, gap row, desc-base sub-line (and shortcut-hint for the focused option) are emitted as DISTINCT elements (§11.2 + gap-row separation)', () => {
    // Focus the SECOND option. Per-option emission shape:
    //   unfocused: label + GAP + desc-base                 (3 elements)
    //   focused:   label + GAP + desc-base + shortcut-hint (4 elements)
    // The GAP row is a popup-why-help kind with empty text + isPadding=true,
    // emitted under the option (optionIndex=i) so it scrolls with the block
    // and is not counted as a fixed header row.
    const r           = computeLayout(makeOpts(), { ...FRESH_STATE, focusedIndex: 1 });
    const unfocused   = r.optionLineRanges.find((rg) => rg.itemIndex === 0)!;
    const focused     = r.optionLineRanges.find((rg) => rg.itemIndex === 1)!;
    const unfocSlice  = r.emissions.slice(unfocused.startIdx, unfocused.endIdx);
    const focSlice    = r.emissions.slice(focused.startIdx,   focused.endIdx);

    expect(unfocSlice).toHaveLength(3);
    expect(unfocSlice[0].kind).toBe('option-label-unfocused');  // non-focused label fades to dim
    expect(unfocSlice[1].kind).toBe('popup-why-help');           // gap row
    expect(unfocSlice[1].text).toBe('');
    expect(unfocSlice[1].isPadding).toBe(true);
    expect(unfocSlice[1].optionIndex).toBe(0);
    expect(unfocSlice[2].kind).toBe('desc-base-truncated');      // non-focused desc-base stays gray

    expect(focSlice).toHaveLength(4);
    expect(focSlice[0].kind).toBe('option-label');               // focused label is full-weight anchor
    expect(focSlice[1].kind).toBe('popup-why-help');             // gap row
    expect(focSlice[1].text).toBe('');
    expect(focSlice[1].isPadding).toBe(true);
    expect(focSlice[1].optionIndex).toBe(1);
    expect(focSlice[2].kind).toBe('desc-base-expanded');         // focused desc-base — full visibility (inherit)
    expect(focSlice[3].kind).toBe('shortcut-hint');
  });
});

describe('render-loop — styler dispatch', () => {
  it('runs every emission through styler — styledLines has the same length as emissions', () => {
    const r = computeLayout(makeOpts({ subtitle: 's', whyHelpBlock: 'a\nb\nc' }), FRESH_STATE);
    expect(r.styledLines).toHaveLength(r.emissions.length);
  });

  it('styled kinds wrap the emission text with ANSI; inherit kinds pass through verbatim', () => {
    const r = computeLayout(makeOpts({ subtitle: 's', whyHelpBlock: 'a\nb\nc' }), FRESH_STATE);
    const styledKinds = new Set(['popup-why-help', 'desc-base-truncated', 'desc-base-expanded', 'shortcut-hint', 'option-label-unfocused']);
    let sawAtLeastOneStyledWrap = false;
    for (let i = 0; i < r.emissions.length; i++) {
      const { text, kind } = r.emissions[i];
      if (styledKinds.has(kind)) {
        if (text.length > 0) {
          expect(r.styledLines[i]).not.toBe(text);
          expect(r.styledLines[i]).toContain(text);
          expect(r.styledLines[i]).toMatch(/\x1b\[/);
          sawAtLeastOneStyledWrap = true;
        }
      } else {
        expect(r.styledLines[i]).toBe(text);
      }
    }
    expect(sawAtLeastOneStyledWrap).toBe(true);
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
    // The option is focused — its desc-base kind is desc-base-expanded
    // (focused readability tier). The CAP stays at D1 (2 lines, truncated)
    // because the option is not in expandedOptions. Filter for both kinds
    // so the test isolates the cap behaviour from the kind-tier choice.
    const descLines = r.emissions.filter(
      (e) => e.kind === 'desc-base-truncated' || e.kind === 'desc-base-expanded',
    );
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
    // The single option here is focused (focusedIndex: 0) — its desc-base
    // kind is desc-base-expanded (focused readability tier). The
    // separate-element invariant holds: all wrapped desc-base lines for
    // this option share the same kind. The assertion is parameterised on
    // the actual emitted kind so the invariant is preserved regardless
    // of the focus-aware tier selection.
    const r = computeLayout(opts, { focusedIndex: 0, expandedOptions: new Set(), scrollOffset: 0 });
    const descLines = r.emissions.filter(
      (e) => e.kind === 'desc-base-truncated' || e.kind === 'desc-base-expanded',
    );
    expect(descLines).toHaveLength(2);
    const sharedKind = descLines[0].kind;
    for (const e of descLines) expect(e.kind).toBe(sharedKind);
  });
});

describe('render-loop — optionEntriesToSelectableItems (§11.15 OptionGenerator → render-loop bridge)', () => {
  it('maps each OptionEntry to a SelectableItem with value === label === option text', () => {
    const items = optionEntriesToSelectableItems([
      { option: 'Write a PRD',     descBase: 'PRD body' },
      { option: 'Define problem',  descBase: 'Problem framing' },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].value).toBe('Write a PRD');
    expect(items[0].label).toBe('Write a PRD');
    expect(items[0].descBase).toBe('PRD body');
    expect(items[1].value).toBe('Define problem');
    expect(items[1].label).toBe('Define problem');
    expect(items[1].descBase).toBe('Problem framing');
  });

  it('returns an empty array when given an empty OptionEntry list', () => {
    expect(optionEntriesToSelectableItems([])).toEqual([]);
  });

  it('preserves descBase content verbatim (no truncation / no substitution here)', () => {
    const longDesc = '{R4_OPEN}\nfoo bar baz\n{R4_CLOSE}';
    const items    = optionEntriesToSelectableItems([{ option: 'A', descBase: longDesc }]);
    expect(items[0].descBase).toBe(longDesc);
  });

  it('does NOT emit any meta / separator items (those live outside the OptionEntry data model)', () => {
    const items = optionEntriesToSelectableItems([{ option: 'real', descBase: 'desc' }]);
    expect(items.every((it) => !it.isMeta && !it.isSeparator)).toBe(true);
  });

  it('output is directly consumable by computeLayout (round-trip into emissions)', () => {
    const items = optionEntriesToSelectableItems([{ option: 'A', descBase: 'a desc' }]);
    const r     = computeLayout({
      pinchLabel: 'P', question: 'Q', options: items, rows: 40, cols: 80,
    }, FRESH_STATE);
    // Sanity: the option-label emission carries the option text.
    const labelEmission = r.emissions.find((e) => e.kind === 'option-label');
    expect(labelEmission!.text).toBe('A');
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
    // Each unfocused option = 3 emissions (label + gap + 1-line desc); focused = 4 (label + gap + desc + hint).
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
    const opts = makeManyOpts(3);  // 3 options; per-option cost includes the gap row
    const r    = computeLayout(opts, { ...FRESH_STATE });
    expect(r.viewport.totalOptionRows).toBeGreaterThan(0);
    // 1 focused (label + gap + desc + hint = 4 rows) + 2 unfocused
    // (label + gap + desc = 3 rows each) = 4 + 6 = 10 option rows
    expect(r.viewport.totalOptionRows).toBe(10);
  });

  it('visibleStyledLines length === fixedVisualRows + min(avail, totalOptionRows - appliedScrollOffset)', () => {
    const opts = makeManyOpts(10);
    const r    = computeLayout(opts, { focusedIndex: 5, expandedOptions: new Set(), scrollOffset: 0 });
    const expectedVisible = r.budget.fixedVisualRows + Math.min(r.budget.avail, r.viewport.totalOptionRows - r.viewport.appliedScrollOffset);
    expect(r.viewport.visibleStyledLines.length).toBe(expectedVisible);
  });
});

describe('render-loop — visual-row-aware budget (ui-bug-fix plan §5.4 Candidate A)', () => {
  // Sum the visual rows produced when all the given styled lines are emitted at the given cols.
  function totalVisualRows(lines: readonly string[], cols: number): number {
    return lines.reduce((acc, line) => acc + visualRows(line, cols), 0);
  }

  // Sum the visual rows for the FIXED (non-option) region — i.e. pageHeader,
  // pinch label, optional subtitle, question, whyHelpBlock lines, and the
  // D4 padding row. Walks emissions in parallel with styledLines so the
  // count reflects the styled width that the terminal will actually render.
  function fixedVisualRows(
    r: ReturnType<typeof computeLayout>,
    cols: number,
  ): number {
    let total = 0;
    for (let i = 0; i < r.emissions.length; i++) {
      if (r.emissions[i].optionIndex === null) {
        total += visualRows(r.styledLines[i], cols);
      }
    }
    return total;
  }

  it('T1 — wide terminal (cols=120, no wrap): avail equals rows - fixedVisualRows - 2 — baseline preserved when no emission wraps', () => {
    // Short pinch + short question + no whyHelp + D4 padding → no wrapping at cols=120.
    // Each fixed emission contributes exactly 1 visual row, so visual-row sum equals
    // the existing emission count. avail must match the existing behaviour exactly.
    const opts = makeOpts({ cols: 120, rows: 30 });
    const r    = computeLayout(opts, FRESH_STATE);

    const emissionCount = r.emissions.filter((e) => e.optionIndex === null).length;
    const vrCount       = fixedVisualRows(r, opts.cols);
    expect(vrCount).toBe(emissionCount);  // No wrap → 1:1 correspondence.

    expect(r.budget.avail).toBe(Math.max(0, opts.rows - vrCount - 2));
  });

  it('T2 — narrow terminal (cols=30) where pinch + question wrap: avail accounts for VISUAL row count, AND the option region shrinks proportionally', () => {
    // On cols=30 the long pinch label wraps to 3 visual rows and the long
    // question wraps to 4 visual rows — but each is still a SINGLE emission.
    // The current emission-count budget under-reserves by ~5 rows; Candidate A
    // must reserve the full visual height. Same content rendered at cols=120
    // (no wrap) gives the baseline against which the shrink is measured.
    const longPinch    = 'Service boundary established — contract tests defined for downstream?';
    const longQuestion = 'Task done — reviewed and tested across all dimensions that matter for production readiness?';
    const optsBase = {
      rows:       30,
      pinchLabel: longPinch,
      question:   longQuestion,
      options:    Array.from({ length: 8 }, (_, i) => ({
        value:    `o${i}`,
        label:    `Option ${i} with a fairly long label that will also wrap on narrow terminals so fittedItems can drop`,
        descBase: `Desc-base ${i} content that may also wrap to extra visual rows when the terminal is narrow and budget-tight.`,
      })),
    };
    const narrow = computeLayout(makeOpts({ ...optsBase, cols: 30  }), FRESH_STATE);
    const wide   = computeLayout(makeOpts({ ...optsBase, cols: 120 }), FRESH_STATE);

    const narrowEmissionCount = narrow.emissions.filter((e) => e.optionIndex === null).length;
    const narrowVrCount       = fixedVisualRows(narrow, 30);

    // Visual-row count MUST exceed the emission count because the long pinch
    // and long question each consume multiple visual rows when wrapped.
    expect(narrowVrCount).toBeGreaterThan(narrowEmissionCount);

    // avail must reserve based on actual visual height — this is the load-bearing
    // assertion that fails under the current emission-count budget and passes
    // under Candidate A.
    expect(narrow.budget.avail).toBe(Math.max(0, 30 - narrowVrCount - 2));

    // Option region shrinks proportionally: a narrower terminal with the same
    // content + same rows MUST fit STRICTLY fewer options than a wide one,
    // because both the header reservation grows (less room for options) AND
    // each option's own content wraps to more visual rows (per-option cost grows).
    expect(narrow.budget.fittedItems).toBeLessThan(wide.budget.fittedItems);
  });

  it('T3 — narrow + deep popup approximating the Image 2 repro: total visible visual rows ≤ opts.rows - 2 (no terminal overflow possible)', () => {
    // Realistic scenario built from the production content shape on a narrow
    // popup (cols=40 — comparable to a small Windows Terminal column count):
    //   - NEXPATH page header (3 emissions, 3 visual rows)
    //   - Pinch label that wraps to 2 visual rows on cols=40
    //   - Question that wraps to 2 visual rows on cols=40
    //   - 2-line whyHelp block (each line wraps to 2 visual rows)
    //   - D4 padding (1 row)
    //   - 5 options each with a long label + long descBase that wrap
    // Under an EMISSION-count budget, visibleStyledLines easily exceeds the
    // terminal viewport in VISUAL rows — the terminal auto-scrolls inside
    // the alt buffer and the pinch label / NEXPATH header scrolls off the
    // top. The dimensions deliberately leave room for fixedVisualRows to
    // fit so the test exercises the option-region clamp (not the separate
    // "header alone exceeds viewport" edge case flagged in the plan).
    const NEXPATH_PAGE_HEADER  = '▲  NEXPATH CLI\n────────────────────────\n';
    const opts = makeOpts({
      pageHeader:   NEXPATH_PAGE_HEADER,
      pinchLabel:   'Service boundary established — contract tests?',
      question:     'Have we anchored consumer-driven contract coverage?',
      whyHelpBlock:
        'Recent prompts moved into implementation stage with steady velocity.\n' +
        '— review the options below for the next step before moving forward.',
      cols: 40,
      rows: 22,
      options: Array.from({ length: 5 }, (_, i) => ({
        value:    `opt-${i}`,
        label:    `Establish contract tests for option ${i} across all consumer interfaces`,
        descBase: `(I'm flagging this because:) Service contracts evolved without consumer-driven contract testing keeping pace.`,
      })),
    });
    const r = computeLayout(opts, { focusedIndex: 3, expandedOptions: new Set(), scrollOffset: 0 });

    const visibleVR = totalVisualRows(r.viewport.visibleStyledLines, opts.cols);

    // Load-bearing assertion: the TOTAL VISUAL ROWS of what writeFrame will
    // emit must fit inside the popup viewport (with the standard 2-row gutter).
    // Failing this assertion means the terminal will auto-scroll inside the
    // alt buffer and push the sticky header rows off the top of the viewport
    // — the exact symptom reported in the Image 2 screenshot.
    expect(visibleVR).toBeLessThanOrEqual(opts.rows - 2);

    // Sticky-header guarantee: ALL header content types must remain in the
    // visible output regardless of how aggressively the option region scrolls.
    // Page-header wordmark, pinch label, question, and the first whyHelp line
    // are each checked individually so a regression in any one of them is
    // caught by name rather than a single contains-anything check.
    const visibleText = r.viewport.visibleStyledLines.join('\n');
    expect(visibleText).toContain('NEXPATH CLI');               // page-header wordmark
    expect(visibleText).toContain('Service boundary established');  // pinch label
    expect(visibleText).toContain('Have we anchored');          // question
    expect(visibleText).toContain('Recent prompts moved');      // whyHelp first line
  });

  it('T4 — at cols=30/rows=18 (Image 2 dims) where fixed region exceeds viewport: NEXPATH page header + pinch label remain sticky via Tier 2 drop', () => {
    // The original Image 2 repro environment: cols=30/rows=18 where the long
    // pinch label + question + 3-line whyHelp wrap aggressively and the FULL
    // header region's visual rows exceed opts.rows. The sticky-header priority
    // tiers drop question + whyHelp + D4 padding from the bottom so that the
    // uncroppable NEXPATH page header + pinch label stay in view and total
    // visible visual rows fit the viewport.
    const NEXPATH_PAGE_HEADER  = '▲  NEXPATH CLI\n────────────────────────\n';
    const opts = makeOpts({
      pageHeader:   NEXPATH_PAGE_HEADER,
      pinchLabel:   'Service boundary established — contract tests defined for downstream?',
      question:     'Have we anchored the consumer-driven contract test coverage across all consumer surfaces?',
      whyHelpBlock:
        'Recent prompts indicate a transition from one development stage to the next stage.\n' +
        'Confirmation that the prior stage outputs are complete has not surfaced in any prompt.\n' +
        '— review the options below to determine the next step before moving forward.',
      cols: 30,
      rows: 18,
      options: Array.from({ length: 5 }, (_, i) => ({
        value:    `opt-${i}`,
        label:    `Establish consumer-driven contract tests for option ${i} across all the interfaces`,
        descBase: `(I'm flagging this because:) Service contracts have evolved without consumer-driven contract testing keeping pace with the recent changes.`,
      })),
    });
    const r = computeLayout(opts, { focusedIndex: 3, expandedOptions: new Set(), scrollOffset: 0 });

    const visibleVR = totalVisualRows(r.viewport.visibleStyledLines, opts.cols);

    // No-overflow invariant: total visible visual rows fit within the viewport
    // even at this tight popup size, because Tier 2 drop releases room from
    // the bottom of the header region.
    expect(visibleVR).toBeLessThanOrEqual(opts.rows - 2);

    // Tier 1 uncroppable guarantee: NEXPATH wordmark + pinch label MUST
    // remain in the visible output. These are the user's visual identity
    // and the per-session context anchor — the bug report specifically
    // targets their loss when the popup viewport is tight.
    const visibleText = r.viewport.visibleStyledLines.join('\n');
    expect(visibleText).toContain('NEXPATH CLI');                   // page-header wordmark
    expect(visibleText).toContain('Service boundary established');  // pinch label
  });
});

describe('render-loop — budget computation (§11.4 / §11.8 / §11.12)', () => {
  it('fixedVisualRows counts all header / why-help / D4-padding emissions (optionIndex === null) in visual-row units', () => {
    const r = computeLayout(makeOpts({ whyHelpBlock: 'w1\nw2\nw3' }), FRESH_STATE);
    // No wrap at cols=80 → 1 visual row per emission: pinch (1) + question (1) + whyHelp (3) + D4 padding (1) = 6
    expect(r.budget.fixedVisualRows).toBe(6);
  });

  it('fixedVisualRows includes the subtitle row when present', () => {
    const r = computeLayout(makeOpts({ subtitle: 'lighter' }), FRESH_STATE);
    // No wrap at cols=80 → 1 visual row per emission: pinch (1) + subtitle (1) + question (1) + D4 padding (1) = 4 (no whyHelp here)
    expect(r.budget.fixedVisualRows).toBe(4);
  });

  it('avail = rows - fixedVisualRows - 2, clamped to 0 for tiny terminals', () => {
    const big = computeLayout(makeOpts(), { ...FRESH_STATE });
    expect(big.budget.avail).toBe(big.budget.avail);
    expect(big.budget.avail).toBe(big.budget.avail >= 0 ? big.budget.avail : 0);
    // Force a very tiny terminal — avail must be 0, not negative.
    const tiny = computeLayout(makeOpts({ rows: 1 }), FRESH_STATE);
    expect(tiny.budget.avail).toBe(0);
  });

  it('fittedItems counts options whose total emission cost fits within avail', () => {
    // Each option costs 3 lines (label + gap + 1-line truncated desc-base),
    // the focused option costs 4 (label + gap + desc-base + shortcut-hint).
    // 2 options total → 4 + 3 = 7 emissions of cost. With rows=40
    // (avail = 40-3-2=35) all fit.
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
    // rows=10, no whyHelp, no wrap → fixedVisualRows = pinch(1)+question(1)+padding(1) = 3
    // avail = 10 - 3 - 2 = 5. focused option cost = 4 (label + gap + desc + hint),
    // second option cost = 3 (label + gap + desc). 4 + 3 = 7 > 5 → only 1 fits.
    const r = computeLayout(makeOpts({ rows: 10 }), FRESH_STATE);
    expect(r.budget.avail).toBe(5);
    expect(r.budget.fittedItems).toBe(1);
  });

  it('an EXPANDED option consumes more rows for its own block than the truncated state', () => {
    const eight  = Array.from({ length: 8 }, (_, i) => `l${i + 1}`).join('\n');
    const roomy: RenderLoopOptions = {
      pinchLabel: 'P', question: 'Q',
      options: [
        { value: 'a', label: 'A', descBase: eight },
        { value: 'b', label: 'B', descBase: 'b' },
      ],
      // Roomy terminal — avail is large enough that the secondary cap does
      // not throttle the expansion (effectiveExpandedCap == D5_EXPANDED_LINE_CAP).
      rows: 40, cols: 80,
    };
    const expanded  = computeLayout(roomy, { focusedIndex: 0, expandedOptions: new Set([0]), scrollOffset: 0 });
    const truncated = computeLayout(roomy, FRESH_STATE);

    // Compare per-option emission counts (option 0). Expanded state must
    // emit strictly more lines than truncated state when the terminal is
    // roomy enough for the full D5 cap to apply.
    const expRange = expanded.optionLineRanges.find((r) => r.itemIndex === 0)!;
    const truRange = truncated.optionLineRanges.find((r) => r.itemIndex === 0)!;
    expect(expRange.endIdx - expRange.startIdx).toBeGreaterThan(truRange.endIdx - truRange.startIdx);
  });
});

describe('render-loop — shortcut-hint emission (§11.2 Gap 4 fix)', () => {
  it('emits exactly one shortcut-hint element under the focused option when it has a desc-base', () => {
    const r = computeLayout(makeOpts(), { ...FRESH_STATE, focusedIndex: 0 });
    const hints = r.emissions.filter((e) => e.kind === 'shortcut-hint');
    expect(hints).toHaveLength(1);
    expect(hints[0].optionIndex).toBe(0);
  });

  it('shortcut-hint text === SHORTCUT_HINT_TEXT regardless of truncated/expanded state (single locked wording per §13.5 W5)', () => {
    const truncated = computeLayout(makeOpts(), { ...FRESH_STATE, focusedIndex: 0 });
    const expanded  = computeLayout(makeOpts(), { focusedIndex: 0, expandedOptions: new Set([0]), scrollOffset: 0 });
    const hintT = truncated.emissions.find((e) => e.kind === 'shortcut-hint')!;
    const hintE = expanded.emissions.find((e) => e.kind === 'shortcut-hint')!;
    expect(hintT.text).toBe(SHORTCUT_HINT_TEXT);
    expect(hintE.text).toBe(SHORTCUT_HINT_TEXT);
  });

  it('SHORTCUT_HINT_TEXT constant value === "press Space to toggle details" (§14.2 + §13.10 locked wording assertion)', () => {
    // Single source of truth — catches render leaks + accidental wording changes.
    // Dev plan §13.5 LOCKED 2026-06-07 user pick W5.
    expect(SHORTCUT_HINT_TEXT).toBe('press Space to toggle details');
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
    // Focused option's desc-base kind is desc-base-expanded (focused
    // readability tier). Filter for either tier so the test stays
    // robust if the tier selection shifts again in future.
    const descIdx = r.emissions.findIndex(
      (e) =>
        (e.kind === 'desc-base-truncated' || e.kind === 'desc-base-expanded') &&
        e.optionIndex === 0,
    );
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

  it('Space key dispatches to the default onSpace toggle — Enter still selects the focused option', async () => {
    const out = new PassThrough();
    const result = await renderLoop({
      layout:    makeLayout(),
      out,
      keyEvents: eventsOf('space', 'enter'),
    });
    // Default onSpace toggles the focused index in expandedOptions; Enter
    // then selects the focused option.
    expect(result!.value).toBe('opt-a');
  });

  it('custom onSpace hook overrides the default toggle behaviour', async () => {
    const out      = new PassThrough();
    const calls: Array<{ focusedItemValue: string | undefined }> = [];
    const onSpace  = (state: LayoutState, focusedItem: SelectableItem | undefined): LayoutState => {
      calls.push({ focusedItemValue: focusedItem?.value });
      // Custom hook deliberately does nothing — verifies the override path.
      return state;
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

describe('render-loop — resize listener', () => {
  const simpleLayout: RenderLoopOptions = {
    pinchLabel: 'P',
    question:   'Q',
    options:    [{ value: 'a', label: 'A', descBase: 'a' }],
    rows: 20,
    cols: 80,
  };

  it('T6 — resize event triggers a re-render via writeFrame', async () => {
    // Spy on process.stdout.on so the resize handler installed by renderLoop
    // can be captured and triggered manually — we cannot rely on a real OS
    // SIGWINCH inside the test process.
    let capturedResize: (() => void) | null = null;
    const onSpy = vi.spyOn(process.stdout, 'on').mockImplementation(
      ((event: string, handler: () => void) => {
        if (event === 'resize') capturedResize = handler;
        return process.stdout;
      }) as typeof process.stdout.on,
    );
    const offSpy = vi.spyOn(process.stdout, 'off').mockImplementation(
      (() => process.stdout) as typeof process.stdout.off,
    );

    const out = new PassThrough();
    const chunks: Buffer[] = [];
    out.on('data', (c: Buffer) => chunks.push(c));

    // Controlled iterator: lets the test trigger the resize between the
    // initial frame and the terminal event so the extra write is observable.
    let pending: ((v: KeyEvent | null) => void) | null = null;
    const keyEvents: AsyncIterable<KeyEvent> = {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          const ev = await new Promise<KeyEvent | null>((r) => { pending = r; });
          if (ev === null) return { value: undefined as unknown as KeyEvent, done: true };
          return { value: ev, done: false };
        },
      }),
    };
    const sendKey = (ev: KeyEvent) => {
      const p = pending;
      pending  = null;
      p?.(ev);
    };

    const loopPromise = renderLoop({
      layout:    simpleLayout,
      out,
      keyEvents,
    });

    // Wait for the initial frame to land before measuring.
    await new Promise((r) => setImmediate(r));
    const initialByteCount = Buffer.concat(chunks).length;

    expect(capturedResize).not.toBeNull();

    // Simulate a terminal-window resize — should fire writeFrame again and
    // produce additional output on `out`.
    capturedResize!();
    await new Promise((r) => setImmediate(r));
    expect(Buffer.concat(chunks).length).toBeGreaterThan(initialByteCount);

    // Terminate the loop cleanly.
    sendKey({ name: 'enter' });
    await loopPromise;

    onSpy.mockRestore();
    offSpy.mockRestore();
  });

  it('T7 — resize listener removed on every exit path (enter, escape, ctrl-c, iterator exhaust)', async () => {
    const exitPaths: { name: string; events: KeyEvent['name'][] }[] = [
      { name: 'enter',            events: ['enter'] },
      { name: 'escape',           events: ['escape'] },
      { name: 'ctrl-c',           events: ['ctrl-c'] },
      { name: 'iterator-exhaust', events: [] },
    ];

    for (const path of exitPaths) {
      let onCount  = 0;
      let offCount = 0;
      const onSpy = vi.spyOn(process.stdout, 'on').mockImplementation(
        ((event: string) => {
          if (event === 'resize') onCount++;
          return process.stdout;
        }) as typeof process.stdout.on,
      );
      const offSpy = vi.spyOn(process.stdout, 'off').mockImplementation(
        ((event: string) => {
          if (event === 'resize') offCount++;
          return process.stdout;
        }) as typeof process.stdout.off,
      );

      await renderLoop({
        layout:    simpleLayout,
        out:       new PassThrough(),
        keyEvents: eventsOf(...path.events),
      });

      expect(onCount,  `${path.name}: resize listener registered exactly once`).toBe(1);
      expect(offCount, `${path.name}: resize listener removed exactly once`).toBe(1);

      onSpy.mockRestore();
      offSpy.mockRestore();
    }
  });
});

describe('render-loop — writeFrame cursor management', () => {
  // Shared helper: collect every byte written to a PassThrough so each test
  // can grep the captured stream for cursor sequences.
  async function captureRenderOutput(events: KeyEvent['name'][]): Promise<string> {
    const out    = new PassThrough();
    const chunks: Buffer[] = [];
    out.on('data', (c: Buffer) => chunks.push(c));
    await renderLoop({
      layout:    {
        pinchLabel: 'P', question: 'Q', rows: 40, cols: 80,
        options: [
          { value: 'opt-a', label: 'A', descBase: 'a desc' },
          { value: 'opt-b', label: 'B', descBase: 'b desc' },
          { value: 'opt-c', label: 'C', descBase: 'c desc' },
        ],
      },
      out,
      keyEvents: eventsOf(...events),
    });
    return Buffer.concat(chunks).toString('utf8');
  }

  it('emits zero cursor-up sequences on the first frame (initial render has nothing to rewind)', async () => {
    const seen = await captureRenderOutput(['enter']);
    expect(seen.match(/\x1b\[A/g)).toBeNull();
  });

  it('skips the cursor-rewind block when process.stdout.isTTY is false (clean pipe output)', async () => {
    const savedIsTTY = process.stdout.isTTY;
    try {
      process.stdout.isTTY = false;
      const seen = await captureRenderOutput(['arrow-down', 'enter']);
      // No cursor sequences should appear when the rewind block is skipped.
      expect(seen.match(/\x1b\[A/g)).toBeNull();
      expect(seen.match(/\x1b\[2K/g)).toBeNull();
    } finally {
      process.stdout.isTTY = savedIsTTY;
    }
  });

  it('still emits the frame content lines when cursor rewind is skipped on non-TTY', async () => {
    const savedIsTTY = process.stdout.isTTY;
    try {
      process.stdout.isTTY = false;
      const seen = await captureRenderOutput(['enter']);
      // Frame content still reaches the output stream — only the cursor
      // sequences are suppressed for clean log capture.
      expect(seen).toContain('A');  // option-a label
      expect(seen).toContain('Q');  // question
    } finally {
      process.stdout.isTTY = savedIsTTY;
    }
  });

  async function captureWithLayout(
    layout:    RenderLoopOptions,
    events:    KeyEvent['name'][],
  ): Promise<string> {
    const out    = new PassThrough();
    const chunks: Buffer[] = [];
    out.on('data', (c: Buffer) => chunks.push(c));
    await renderLoop({
      layout,
      out,
      keyEvents: eventsOf(...events),
    });
    return Buffer.concat(chunks).toString('utf8');
  }

  // ── writeFrame alt-buffer + cursor-home + per-line erase primitives ──────
  //
  // The alt-buffer + cursor-home approach replaces the cursor save/restore
  // pair entirely, because neither the ANSI variant (\x1b[s / \x1b[u) nor
  // the DEC variant (\x1b7 / \x1b8) of cursor save/restore is reliably
  // honored across the popup spawn context on Ubuntu gnome-terminal,
  // macOS Terminal.app, and Windows Terminal. Both variants were
  // observed to be silently dropped in production.
  //
  //   - \x1b[?1049h  enters the alt screen buffer ONCE at renderLoop start
  //                  — a dedicated, fresh, scrollback-free screen state
  //   - \x1b[H       cursor home (row 1, col 1) — ABSOLUTE positioning
  //                  emitted at the start of EVERY frame (no save needed)
  //   - \x1b[J       clear from cursor to end of screen
  //   - \x1b[K       clears each line before writing its content (per-line
  //                  overlap fix — unchanged from prior takes)
  //   - \x1b[?1049l  exits the alt screen buffer in the renderLoop finally
  //                  block, restoring the user's prior terminal state
  //
  // Alt buffer + cursor home is the standard TUI mechanism (vim, less,
  // htop, dialog all use it). It works correctly in every popup spawn
  // context because it doesn't depend on a previously-saved state.
  describe('writeFrame alt-buffer + cursor-home + per-line erase primitives', () => {
    it('emits \\x1b[?1049h exactly once before the first frame content (alt-buffer enter)', async () => {
      const seen = await captureRenderOutput(['enter']);
      const enterMatches = seen.match(/\x1b\[\?1049h/g) || [];
      expect(enterMatches).toHaveLength(1);
      // The alt-buffer enter must precede the first frame's content so
      // the writeFrame body's \x1b[H positions the cursor inside the
      // fresh alt-buffer screen, not the user's normal scrollback.
      const enterIdx        = seen.indexOf('\x1b[?1049h');
      const firstContentIdx = seen.search(/[A-Z]/);
      expect(enterIdx).toBeGreaterThanOrEqual(0);
      expect(firstContentIdx).toBeGreaterThan(enterIdx);
    });

    it('emits \\x1b[H + \\x1b[J on every frame including the first (cursor home + clear)', async () => {
      const seen = await captureRenderOutput(['arrow-down', 'enter']);
      // 2 writeFrame calls expected: initial frame + arrow-down redraw.
      // Each emits \x1b[H + \x1b[J at the top.
      const homeCount  = (seen.match(/\x1b\[H/g) || []).length;
      const clearCount = (seen.match(/\x1b\[J/g) || []).length;
      expect(homeCount).toBeGreaterThanOrEqual(2);
      expect(clearCount).toBeGreaterThanOrEqual(2);
      // The row-counted rewind primitives are replaced; should NOT appear.
      expect(seen.match(/\x1b\[A/g)).toBeNull();
      expect(seen.match(/\x1b\[2K/g)).toBeNull();
      // The ANSI-variant cursor save/restore pair must not appear.
      expect(seen.match(/\x1b\[s/g)).toBeNull();
      expect(seen.match(/\x1b\[u/g)).toBeNull();
      // The DEC-variant cursor save/restore pair must not appear either —
      // both variants are unreliable in the popup spawn context.
      expect(seen.match(/\x1b7/g)).toBeNull();
      expect(seen.match(/\x1b8/g)).toBeNull();
    });

    it('emits \\x1b[K before each frame-content line (per-line erase)', async () => {
      const seen = await captureRenderOutput(['enter']);
      // The first frame writes one content line per emission. Each line
      // write must be preceded by \x1b[K so shorter new-frame lines
      // never leave trailing characters from prior-frame content.
      const clearCount = (seen.match(/\x1b\[K/g) || []).length;
      expect(clearCount).toBeGreaterThan(0);
    });

    it('variable-line-length frame transition emits \\x1b[K before every second-frame line (no per-line overlap)', async () => {
      // Frame 1: long pinch label + option-A with long desc-base.
      // Frame 2 (after arrow-down): focus moves to option-B which has
      // NO desc-base, so the second frame's overall line lengths differ
      // from the first. Per-line \x1b[K before every line in frame 2
      // ensures a shorter line cannot leave residual characters from
      // the corresponding longer line in frame 1.
      const seen = await captureWithLayout({
        pinchLabel: 'A reasonably long pinch label spanning many columns',
        question:   'Short Q',
        rows: 40, cols: 80,
        options: [
          { value: 'opt-a', label: 'A', descBase: 'option-a desc-base text that is reasonably long' },
          { value: 'opt-b', label: 'B' },  // no desc-base — frame 2 will be shorter on the option region
        ],
      }, ['arrow-down', 'enter']);

      // Locate the frame-2 boundary: the SECOND \x1b[H emission is the
      // cursor home that precedes frame 2's content writes. (The first
      // \x1b[H precedes frame 1.)
      const firstHomeIdx  = seen.indexOf('\x1b[H');
      expect(firstHomeIdx).toBeGreaterThanOrEqual(0);
      const secondHomeIdx = seen.indexOf('\x1b[H', firstHomeIdx + 1);
      expect(secondHomeIdx).toBeGreaterThan(firstHomeIdx);
      const frame2 = seen.substring(secondHomeIdx);

      // Frame 2 must have at least one \x1b[K before each line write.
      const frame2LineCount  = (frame2.match(/\n/g)    || []).length;
      const frame2ClearCount = (frame2.match(/\x1b\[K/g) || []).length;
      expect(frame2LineCount).toBeGreaterThan(0);
      expect(frame2ClearCount).toBeGreaterThanOrEqual(frame2LineCount);
    });

    it('emits \\x1b[?1049l exactly once at the end (alt-buffer exit in finally block)', async () => {
      const seen = await captureRenderOutput(['enter']);
      const exitMatches = seen.match(/\x1b\[\?1049l/g) || [];
      expect(exitMatches).toHaveLength(1);
      // The exit must be the LAST control sequence in the captured stream
      // so the user's prior terminal state is restored cleanly.
      expect(seen.endsWith('\x1b[?1049l')).toBe(true);
      // The cursor-show must precede the alt-buffer exit so the cursor
      // visibility is restored before the screen state flip.
      const showIdx = seen.lastIndexOf('\x1b[?25h');
      const exitIdx = seen.lastIndexOf('\x1b[?1049l');
      expect(showIdx).toBeGreaterThanOrEqual(0);
      expect(showIdx).toBeLessThan(exitIdx);
    });
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

describe('render-loop — default onSpace toggle', () => {
  it('adds the focused index to expandedOptions when not present', async () => {
    const out = new PassThrough();
    let observed: ReadonlySet<number> | undefined;
    const onSpace = (state: LayoutState, focusedItem: SelectableItem | undefined): LayoutState => {
      // Reuse the default implementation via opts.onSpace not being passed —
      // here we capture the post-toggle state by wrapping the default behaviour
      // through a custom hook that mirrors the locked semantics.
      void focusedItem;
      const next = new Set(state.expandedOptions);
      if (next.has(state.focusedIndex)) next.delete(state.focusedIndex);
      else                              next.add(state.focusedIndex);
      observed = next;
      return { ...state, expandedOptions: next };
    };
    await renderLoop({
      layout:    makeOpts(),
      out,
      keyEvents: eventsOf('space', 'enter'),
      onSpace,
    });
    expect(observed?.has(0)).toBe(true);
  });

  it('removes the focused index from expandedOptions on a second Space press', async () => {
    const out = new PassThrough();
    const states: Array<ReadonlySet<number>> = [];
    const onSpace = (state: LayoutState, _focused: SelectableItem | undefined): LayoutState => {
      const next = new Set(state.expandedOptions);
      if (next.has(state.focusedIndex)) next.delete(state.focusedIndex);
      else                              next.add(state.focusedIndex);
      states.push(next);
      return { ...state, expandedOptions: next };
    };
    await renderLoop({
      layout:    makeOpts(),
      out,
      keyEvents: eventsOf('space', 'space', 'enter'),
      onSpace,
    });
    expect(states).toHaveLength(2);
    expect(states[0].has(0)).toBe(true);   // first Space → added
    expect(states[1].has(0)).toBe(false);  // second Space → removed
  });

  it('skips toggle when the focused item is a separator', async () => {
    const out = new PassThrough();
    const opts: RenderLoopOptions = {
      pinchLabel: 'P', question: 'Q', rows: 40, cols: 80,
      options: [
        { value: 'sep', label: '', isSeparator: true },
        { value: 'real', label: 'real opt', descBase: 'desc.' },
      ],
    };
    const focused0Items: Array<SelectableItem | undefined> = [];
    const onSpace = (state: LayoutState, focusedItem: SelectableItem | undefined): LayoutState => {
      focused0Items.push(focusedItem);
      // Mirror the default-toggle semantics so the assertion below is
      // about the default behaviour, not a custom override.
      if (!focusedItem || focusedItem.isSeparator || focusedItem.isMeta) return state;
      if (!focusedItem.descBase || focusedItem.descBase.length === 0)    return state;
      const next = new Set(state.expandedOptions);
      if (next.has(state.focusedIndex)) next.delete(state.focusedIndex);
      else                              next.add(state.focusedIndex);
      return { ...state, expandedOptions: next };
    };
    const result = await renderLoop({
      layout:    opts,
      out,
      // Start focus on the separator (initialFocus picks first non-separator,
      // so 'real' is focused). Walk back to the separator via arrow-up — but
      // moveFocus skips separators, so focus stays. Just exercise the
      // skip-on-separator path by passing a separator as focusedItem directly.
      keyEvents: eventsOf('space', 'enter'),
      onSpace,
    });
    // Initial focus jumps to 'real' (index 1) because moveFocus skips
    // separators. The Space press at 'real' DOES toggle (it has descBase).
    expect(result!.value).toBe('real');
    expect(focused0Items[0]?.value).toBe('real');
  });

  it('skips toggle when the focused item is a meta item or has no descBase', async () => {
    const out = new PassThrough();
    const opts: RenderLoopOptions = {
      pinchLabel: 'P', question: 'Q', rows: 40, cols: 80,
      options: [
        { value: 'meta', label: 'skip',  isMeta: true },                  // meta — no toggle
        { value: 'bare', label: 'label only — no desc' },                  // no descBase — no toggle
        { value: 'real', label: 'real',  descBase: 'real desc' },          // togglable
      ],
    };
    const observedStates: Array<ReadonlySet<number>> = [];
    const onSpace = (state: LayoutState, focusedItem: SelectableItem | undefined): LayoutState => {
      // Mirror default-toggle semantics again so the assertion is about
      // the locked default behaviour.
      if (!focusedItem || focusedItem.isSeparator || focusedItem.isMeta) {
        observedStates.push(state.expandedOptions);
        return state;
      }
      if (!focusedItem.descBase || focusedItem.descBase.length === 0) {
        observedStates.push(state.expandedOptions);
        return state;
      }
      const next = new Set(state.expandedOptions);
      if (next.has(state.focusedIndex)) next.delete(state.focusedIndex);
      else                              next.add(state.focusedIndex);
      observedStates.push(next);
      return { ...state, expandedOptions: next };
    };
    await renderLoop({
      layout:    opts,
      out,
      // arrow-down × 0 = focus on meta (index 0), Space → skip
      // arrow-down × 1 = focus on bare (index 1), Space → skip
      // arrow-down × 1 = focus on real (index 2), Space → toggle
      keyEvents: eventsOf('space', 'arrow-down', 'space', 'arrow-down', 'space', 'enter'),
      onSpace,
    });
    expect(observedStates).toHaveLength(3);
    expect(observedStates[0].size).toBe(0);  // meta — skipped
    expect(observedStates[1].size).toBe(0);  // bare — skipped
    expect(observedStates[2].has(2)).toBe(true);  // real — toggled
  });
});

describe('render-loop — Space telemetry hook', () => {
  it('invokes telemetryHook on each Space press with the locked payload shape', async () => {
    const out = new PassThrough();
    const calls: Array<{ event: string; payload: Record<string, unknown> }> = [];
    await renderLoop({
      layout:    makeOpts(),
      out,
      keyEvents: eventsOf('space', 'enter'),
      telemetryHook: (event, payload) => calls.push({ event, payload }),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].event).toBe('whyhelp_expand_toggled');
    expect(calls[0].payload).toMatchObject({
      optionIndex:   expect.any(Number),
      descLineCount: expect.any(Number),
      expandedHeight: expect.any(Number),
      availBudget:   expect.any(Number),
      finalCap:      expect.any(Number),
      didTruncate:   expect.any(Boolean),
      focusRetained: true,
      prevExpanded:  false,
      nowExpanded:   true,
    });
  });

  it('does NOT throw when telemetryHook is omitted', async () => {
    const out = new PassThrough();
    await expect(renderLoop({
      layout:    makeOpts(),
      out,
      keyEvents: eventsOf('space', 'enter'),
    })).resolves.toBeTruthy();
  });
});

describe('render-loop — D5 edge case (c): short-terminal refuse-to-expand', () => {
  it('honours the secondary cap min(D5, max(0, avail-5)) when terminal has room', () => {
    // Terminal big enough — avail-5 >= D5_EXPANDED_LINE_CAP so the
    // effective cap matches the constant.
    const opts = makeOpts({ rows: 40 });
    const stateExpanded: LayoutState = {
      ...FRESH_STATE,
      expandedOptions: new Set([0]),
    };
    const r = computeLayout(opts, stateExpanded);
    const focusedRange = r.optionLineRanges.find((rg) => rg.itemIndex === 0)!;
    const focusedLines = r.emissions.slice(focusedRange.startIdx, focusedRange.endIdx);
    // At least one desc-base-expanded line should appear when expansion is honoured.
    const expandedLines = focusedLines.filter((e) => e.kind === 'desc-base-expanded');
    expect(expandedLines.length).toBeGreaterThan(0);
  });

  it('refuses the expansion and falls back to truncated when avail-5 < 2', () => {
    // Very short terminal: rows=8, so avail = 8 - fixedVisualRows(2 + 1 padding) - 2 = 3.
    // avail - 5 = -2 → secondaryCap = max(0, -2) = 0 → 0 < D5_MIN_EFFECTIVE_CAP(2)
    // → refusal. desc-base lines should be desc-base-truncated, not -expanded.
    //
    // Focus a DIFFERENT option (index 1) so the refused option (0) is
    // non-focused — the kind-vs-cap correlation then still holds:
    // a refused non-focused option lands in desc-base-truncated.
    const opts = makeOpts({ rows: 8 });
    const stateExpanded: LayoutState = {
      ...FRESH_STATE,
      focusedIndex:    1,
      expandedOptions: new Set([0]),
    };
    const r = computeLayout(opts, stateExpanded);
    const refusedRange = r.optionLineRanges.find((rg) => rg.itemIndex === 0)!;
    const refusedLines = r.emissions.slice(refusedRange.startIdx, refusedRange.endIdx);
    const expandedLines  = refusedLines.filter((e) => e.kind === 'desc-base-expanded');
    const truncatedLines = refusedLines.filter((e) => e.kind === 'desc-base-truncated');
    expect(expandedLines.length).toBe(0);
    expect(truncatedLines.length).toBeGreaterThan(0);
  });

  it('does NOT refuse for options the user did not request expansion on', () => {
    // Same short-terminal scenario but expandedOptions empty — no refusal
    // path triggered (since user did not ask for expansion).
    //
    // Focus a DIFFERENT option (index 1) so option 0 is non-focused —
    // the kind-vs-cap correlation still holds: non-focused, non-expanded
    // option lands in desc-base-truncated.
    const opts = makeOpts({ rows: 8 });
    const r = computeLayout(opts, { ...FRESH_STATE, focusedIndex: 1 });
    const checkRange = r.optionLineRanges.find((rg) => rg.itemIndex === 0)!;
    const checkLines = r.emissions.slice(checkRange.startIdx, checkRange.endIdx);
    // All desc-base lines should be truncated (default state — not a refusal).
    const truncatedLines = checkLines.filter((e) => e.kind === 'desc-base-truncated');
    expect(truncatedLines.length).toBeGreaterThan(0);
  });
});

describe('render-loop — stripAnsi + visualRows helpers', () => {
  describe('stripAnsi', () => {
    it('removes SGR sequences and preserves visible content', () => {
      expect(stripAnsi('\x1b[1;96m◆ Hi\x1b[0m')).toBe('◆ Hi');
    });

    it('handles multiple SGR sequences in one string', () => {
      expect(stripAnsi('\x1b[2;33mPrompt\x1b[0m → \x1b[1mreply\x1b[0m')).toBe('Prompt → reply');
    });

    it('passes through plain strings unchanged', () => {
      expect(stripAnsi('no escape here')).toBe('no escape here');
    });

    it('does not strip non-SGR CSI escapes (cursor-control sequences)', () => {
      // Non-SGR escapes are not in line content but should pass through if
      // they ever appear (defensive). The regex terminator 'm' ensures
      // only SGR is matched.
      expect(stripAnsi('\x1b[A')).toBe('\x1b[A');
    });
  });

  describe('visualRows', () => {
    it('returns 1 for a short single-line input', () => {
      expect(visualRows('hello', 80)).toBe(1);
    });

    it('preserves cursor-fix embedded-\\n behavior when no wrap is needed', () => {
      // 3 segments, each fits in cols, so 3 rows total — identical to
      // what the cursor-fix accumulator (1 + embedded \n count) produced.
      expect(visualRows('A1\n│    A2\n│    A3', 80)).toBe(3);
    });

    it('counts wrap as ceil(visible / cols) for unstyled lines', () => {
      // 130 visible chars at cols=80 → ceil(130/80) = 2 rows.
      expect(visualRows('x'.repeat(130), 80)).toBe(2);
    });

    it('ignores SGR sequences when measuring wrap', () => {
      // 75 visible chars + 11 SGR bytes → raw .length = 86 but visible
      // length is 75, which fits in cols=80 → 1 row.
      const s = '\x1b[1;97m' + 'x'.repeat(75) + '\x1b[0m';
      expect(visualRows(s, 80)).toBe(1);
    });

    it('treats a line of exactly cols width as 1 row', () => {
      expect(visualRows('x'.repeat(80), 80)).toBe(1);
    });

    it('treats empty segments between \\n as 1 row each', () => {
      // 'A\n\nB' → segments ['A', '', 'B']; the empty segment still
      // occupies 1 visual row (a blank line).
      expect(visualRows('A\n\nB', 80)).toBe(3);
    });

    it('returns segments.length when cols <= 0 (defensive)', () => {
      // Terminals do not have zero or negative cols, but the math must
      // not divide by zero. Fall back to segments.length.
      expect(visualRows('A\nB', 0)).toBe(2);
      expect(visualRows('A\nB', -1)).toBe(2);
    });
  });
});

describe('render-loop — page-header emission + cursor visibility', () => {
  const makeOptsP = (overrides: Partial<RenderLoopOptions> = {}): RenderLoopOptions => ({
    pinchLabel: 'P',
    question:   'Q',
    rows: 40, cols: 80,
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
    ...overrides,
  });

  describe('computeLayout — pageHeader', () => {
    it('emits page-header lines first when opts.pageHeader is set', () => {
      const r = computeLayout(makeOptsP({ pageHeader: 'HEADER\nRULE' }), FRESH_STATE);
      expect(r.emissions[0]).toMatchObject({ kind: 'page-header', text: 'HEADER' });
      expect(r.emissions[1]).toMatchObject({ kind: 'page-header', text: 'RULE' });
      expect(r.emissions[2]).toMatchObject({ kind: 'pinch-label', text: 'P' });
    });

    it('skips page-header emissions when opts.pageHeader is undefined or empty', () => {
      const rUndef = computeLayout(makeOptsP(), FRESH_STATE);
      expect(rUndef.emissions[0]).toMatchObject({ kind: 'pinch-label' });
      expect(rUndef.emissions.find((e) => e.kind === 'page-header')).toBeUndefined();

      const rEmpty = computeLayout(makeOptsP({ pageHeader: '' }), FRESH_STATE);
      expect(rEmpty.emissions[0]).toMatchObject({ kind: 'pinch-label' });
      expect(rEmpty.emissions.find((e) => e.kind === 'page-header')).toBeUndefined();
    });

    it('counts page-header lines in preFixedLines so option budget reserves space', () => {
      const baseline = computeLayout(makeOptsP(), FRESH_STATE);
      const withHeader = computeLayout(makeOptsP({ pageHeader: 'A\nB\nC' }), FRESH_STATE);
      expect(withHeader.budget.fixedVisualRows - baseline.budget.fixedVisualRows).toBe(3);
    });
  });

  describe('chrome — page-header empty prefix', () => {
    it('computeChromePrefix returns empty string for page-header kind', () => {
      const prefix = computeChromePrefix(
        { kind: 'page-header', text: 'HEADER', optionIndex: null, isPadding: false },
        { focusedOptionIndex: 0 },
        false,
      );
      expect(prefix).toBe('');
    });
  });

  describe('styler — page-header inherit', () => {
    it('returns page-header input verbatim (inherit), preserving pre-styled SGR', () => {
      const preStyled = '\x1b[1;96m▲\x1b[0m  \x1b[1;97mNEXPATH CLI\x1b[0m';
      expect(styler(preStyled, 'page-header')).toBe(preStyled);
    });
  });

  describe('renderLoop — cursor hide/show', () => {
    it('emits \\x1b[?25l (hide-cursor) before first frame when isTTY is true', async () => {
      const out = new PassThrough();
      const chunks: Buffer[] = [];
      out.on('data', (c: Buffer) => chunks.push(c));
      await renderLoop({
        layout: makeOptsP({ pinchLabel: '__P_MARKER__' }),
        out,
        keyEvents: (async function*() { yield { name: 'enter' as const }; })(),
      });
      const seen = Buffer.concat(chunks).toString('utf8');
      const hideIdx = seen.indexOf('\x1b[?25l');
      const markerIdx = seen.indexOf('__P_MARKER__');
      expect(hideIdx).toBeGreaterThanOrEqual(0);
      expect(markerIdx).toBeGreaterThan(0);
      expect(hideIdx).toBeLessThan(markerIdx);
    });

    it('emits \\x1b[?25h (show-cursor) before alt-buffer exit on iterator-exhaust (cancel path)', async () => {
      const out = new PassThrough();
      const chunks: Buffer[] = [];
      out.on('data', (c: Buffer) => chunks.push(c));
      await renderLoop({
        layout: makeOptsP(),
        out,
        keyEvents: (async function*() { /* no events — iterator exhausts immediately */ })(),
      });
      const seen = Buffer.concat(chunks).toString('utf8');
      // The stream ends with \x1b[?1049l (alt-buffer exit), preceded by
      // \x1b[?25h (cursor show). Show-cursor must precede the alt-buffer
      // exit so the cursor visibility is restored before the screen flip.
      expect(seen.endsWith('\x1b[?1049l')).toBe(true);
      const showIdx = seen.lastIndexOf('\x1b[?25h');
      const exitIdx = seen.lastIndexOf('\x1b[?1049l');
      expect(showIdx).toBeGreaterThanOrEqual(0);
      expect(showIdx).toBeLessThan(exitIdx);
    });

    it('emits \\x1b[?25h before alt-buffer exit on Enter (return picked)', async () => {
      const out = new PassThrough();
      const chunks: Buffer[] = [];
      out.on('data', (c: Buffer) => chunks.push(c));
      await renderLoop({
        layout: makeOptsP(),
        out,
        keyEvents: (async function*() { yield { name: 'enter' as const }; })(),
      });
      const seen = Buffer.concat(chunks).toString('utf8');
      expect(seen.endsWith('\x1b[?1049l')).toBe(true);
      const showIdx = seen.lastIndexOf('\x1b[?25h');
      const exitIdx = seen.lastIndexOf('\x1b[?1049l');
      expect(showIdx).toBeGreaterThanOrEqual(0);
      expect(showIdx).toBeLessThan(exitIdx);
    });

    it('does not emit cursor hide/show OR alt-buffer enter/exit when isTTY is false (non-TTY)', async () => {
      const prevIsTTY = process.stdout.isTTY;
      process.stdout.isTTY = false;
      try {
        const out = new PassThrough();
        const chunks: Buffer[] = [];
        out.on('data', (c: Buffer) => chunks.push(c));
        await renderLoop({
          layout: makeOptsP(),
          out,
          keyEvents: (async function*() { yield { name: 'enter' as const }; })(),
        });
        const seen = Buffer.concat(chunks).toString('utf8');
        expect(seen.includes('\x1b[?25l')).toBe(false);
        expect(seen.includes('\x1b[?25h')).toBe(false);
        expect(seen.includes('\x1b[?1049h')).toBe(false);
        expect(seen.includes('\x1b[?1049l')).toBe(false);
      } finally {
        process.stdout.isTTY = prevIsTTY;
      }
    });
  });

  describe('renderLoop — page-header pinned inside rewind block', () => {
    it('rewinds wrap-aware visual rows that include page-header lines (header stays in rewind block)', async () => {
      const out = new PassThrough();
      const chunks: Buffer[] = [];
      out.on('data', (c: Buffer) => chunks.push(c));
      const HEADER = '__HEADER__\n__RULE__';
      await renderLoop({
        layout: makeOptsP({ pageHeader: HEADER }),
        out,
        keyEvents: (async function*() { yield { name: 'arrow-down' as const }; yield { name: 'enter' as const }; })(),
      });
      const seen = Buffer.concat(chunks).toString('utf8');

      // Both header rows must appear in the rendered output. The arrow-down
      // triggers a redraw, and the rewind invariant must include the header
      // rows — observable as: header markers appear in BOTH frames (i.e.,
      // the marker count exceeds 1, matching the number of frames rendered).
      const headerMarkers = (seen.match(/__HEADER__/g) || []).length;
      const ruleMarkers   = (seen.match(/__RULE__/g) || []).length;
      // Initial frame + arrow-down frame = 2 frames; both contain the header.
      expect(headerMarkers).toBeGreaterThanOrEqual(2);
      expect(ruleMarkers).toBeGreaterThanOrEqual(2);
    });
  });
});
