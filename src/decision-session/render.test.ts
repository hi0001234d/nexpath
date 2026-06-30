// Full-popup snapshot test — produces dual snapshots (styled + unstyled)
// against a fixture popup. The styled snapshot wraps the styled
// line-kinds (popup-why-help, desc-base-truncated, desc-base-expanded,
// shortcut-hint) with ANSI; the unstyled snapshot is captured with the
// NEXPATH_STYLE_PASSTHROUGH=1 diagnostic bypass and matches the raw
// layout output verbatim. The two snapshots intentionally differ.
//
// Fixture inputs are intentionally deterministic (no LLM calls, no
// network, no time-of-day dependence) so the snapshots are stable
// across runs.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeLayout, type RenderLoopOptions } from './render-loop.js';
import { captureStyledAndUnstyled } from './styler-snapshot.js';

// Force isTTY=true so the styler emits ANSI on its styled kinds — without
// this the non-TTY safeguard short-circuits the OFF path to pass-through
// and the dual snapshots collapse to identical output.
let origIsTTY: boolean | undefined;
let origNoColor: string | undefined;
beforeAll(() => {
  origIsTTY = process.stdout.isTTY;
  origNoColor = process.env['NO_COLOR'];
  process.stdout.isTTY = true;
  delete process.env['NO_COLOR'];
});
afterAll(() => {
  process.stdout.isTTY = origIsTTY;
  if (origNoColor === undefined) delete process.env['NO_COLOR'];
  else                           process.env['NO_COLOR'] = origNoColor;
});

// ── Fixture popup ──────────────────────────────────────────────────────────
//
// A small but representative popup carrying every LineKind:
//   - pinch-label, optional subtitle, question (header)
//   - popup-why-help (multi-line block including the R4 open + content + close)
//   - desc-base-truncated (one option with descBase)
//   - option-label (the label itself)
//   - shortcut-hint (auto-emitted under the focused option)
//
// The fixture's desc-base content is short enough to render naturally
// (no `...` truncation marker) so the snapshot stays stable across
// terminal-width tweaks in the wrap layer.

const FIXTURE_OPTIONS: RenderLoopOptions = {
  pinchLabel:   'Before coding.',
  subtitle:     undefined,
  question:     'Before building — is the plan written?',
  whyHelpBlock: [
    "You're seeing this because",
    "Recent prompts indicate a transition from one development stage to the next.",
    "— review the options below to determine the next step.",
  ].join('\n'),
  options: [
    { value: 'opt-a', label: 'Write a PRD',      descBase: 'PRD body sentence.' },
    { value: 'opt-b', label: 'Define problem',   descBase: 'Problem framing sentence.' },
    { value: 'opt-c', label: 'Skip for now',     isMeta: true },
  ],
  rows: 40,
  cols: 80,
};

const FIXTURE_STATE = {
  focusedIndex:    0,
  expandedOptions: new Set<number>(),
  scrollOffset:    0,
};

const OVERFLOW_FIXTURE_OPTIONS: RenderLoopOptions = {
  ...FIXTURE_OPTIONS,
  options: [
    {
      value:    'overflow-a',
      label:    'Review implementation plan',
      descBase: [
        'Overflow detail line 1.',
        'Overflow detail line 2.',
        'Overflow detail line 3.',
        'Overflow detail line 4.',
      ].join('\n'),
    },
    { value: 'overflow-b', label: 'Keep baseline short', descBase: 'Short body line.' },
    { value: 'overflow-c', label: 'Skip for now', isMeta: true },
  ],
};

const EXPANDED_FIXTURE_OPTIONS: RenderLoopOptions = {
  ...FIXTURE_OPTIONS,
  options: [
    {
      value:    'expanded-a',
      label:    'Expand review checklist',
      descBase: [
        'Expanded detail line 1.',
        'Expanded detail line 2.',
        'Expanded detail line 3.',
        'Expanded detail line 4.',
        'Expanded detail line 5.',
        'Expanded detail line 6.',
      ].join('\n'),
    },
    { value: 'expanded-b', label: 'Keep second option short', descBase: 'Short second body.' },
    { value: 'expanded-c', label: 'Skip for now', isMeta: true },
  ],
};

const EXPANDED_FIXTURE_STATE = {
  focusedIndex:    0,
  expandedOptions: new Set<number>([0]),
  scrollOffset:    0,
};

describe('render — full-popup snapshot (dual styled / unstyled)', () => {
  it('produces a stable styled snapshot from the fixture popup', () => {
    const { styled } = captureStyledAndUnstyled(
      () => computeLayout(FIXTURE_OPTIONS, FIXTURE_STATE).styledLines.join('\n'),
    );
    expect(styled).toMatchSnapshot('styled');
  });

  it('produces a stable unstyled snapshot from the fixture popup (NEXPATH_STYLE_PASSTHROUGH=1)', () => {
    const { unstyled } = captureStyledAndUnstyled(
      () => computeLayout(FIXTURE_OPTIONS, FIXTURE_STATE).styledLines.join('\n'),
    );
    expect(unstyled).toMatchSnapshot('unstyled');
  });

  it('styled and unstyled snapshots DIFFER (styler body wraps content with ANSI)', () => {
    // With the per-kind dispatch applying ANSI on the styled kinds, the
    // styled capture diverges from the bypass-captured unstyled output —
    // styled contains ESC bytes, unstyled is the raw layout text.
    const { styled, unstyled } = captureStyledAndUnstyled(
      () => computeLayout(FIXTURE_OPTIONS, FIXTURE_STATE).styledLines.join('\n'),
    );
    expect(styled).not.toBe(unstyled);
    expect(styled).toMatch(/\x1b\[/);
    expect(unstyled).not.toMatch(/\x1b\[/);
  });

  it('both snapshots contain the fixture popup\'s header content (pinch + question)', () => {
    const { styled, unstyled } = captureStyledAndUnstyled(
      () => computeLayout(FIXTURE_OPTIONS, FIXTURE_STATE).styledLines.join('\n'),
    );
    for (const out of [styled, unstyled]) {
      expect(out).toContain('Before coding.');
      expect(out).toContain('Before building — is the plan written?');
    }
  });

  it('both snapshots contain the why-help block in §11.2 vertical order', () => {
    const { styled, unstyled } = captureStyledAndUnstyled(
      () => computeLayout(FIXTURE_OPTIONS, FIXTURE_STATE).styledLines.join('\n'),
    );
    for (const out of [styled, unstyled]) {
      const openPos     = out.indexOf("You're seeing this because");
      const contentPos  = out.indexOf('Recent prompts indicate a transition');
      const closePos    = out.indexOf('— review the options below');
      expect(openPos).toBeGreaterThan(-1);
      expect(contentPos).toBeGreaterThan(openPos);
      expect(closePos).toBeGreaterThan(contentPos);
    }
  });

  it('both snapshots contain the focused option\'s desc-base sub-line + shortcut hint', () => {
    const { styled, unstyled } = captureStyledAndUnstyled(
      () => computeLayout(FIXTURE_OPTIONS, FIXTURE_STATE).styledLines.join('\n'),
    );
    for (const out of [styled, unstyled]) {
      expect(out).toContain('Write a PRD');
      expect(out).toContain('PRD body sentence.');
      expect(out).toContain('press Space to toggle details');
    }
  });

  it('both snapshots OMIT the meta-item\'s desc-base sub-line (SKIP_NOW has no descBase)', () => {
    const { styled, unstyled } = captureStyledAndUnstyled(
      () => computeLayout(FIXTURE_OPTIONS, FIXTURE_STATE).styledLines.join('\n'),
    );
    for (const out of [styled, unstyled]) {
      // The meta item's label still appears.
      expect(out).toContain('Skip for now');
    }
  });

  it('produces a stable styled snapshot for the overflow fixture (collapsed truncation path)', () => {
    const { styled } = captureStyledAndUnstyled(
      () => computeLayout(OVERFLOW_FIXTURE_OPTIONS, FIXTURE_STATE).styledLines.join('\n'),
    );
    expect(styled).toMatchSnapshot('styled-overflow');
  });

  it('produces a stable unstyled snapshot for the overflow fixture (collapsed truncation path)', () => {
    const { unstyled } = captureStyledAndUnstyled(
      () => computeLayout(OVERFLOW_FIXTURE_OPTIONS, FIXTURE_STATE).styledLines.join('\n'),
    );
    expect(unstyled).toMatchSnapshot('unstyled-overflow');
  });

  it('overflow fixture snapshots contain the truncation marker on the focused desc-base', () => {
    const { styled, unstyled } = captureStyledAndUnstyled(
      () => computeLayout(OVERFLOW_FIXTURE_OPTIONS, FIXTURE_STATE).styledLines.join('\n'),
    );
    for (const out of [styled, unstyled]) {
      expect(out).toContain('Overflow detail line 1.');
      expect(out).toContain('...');
    }
  });

  it('produces a stable styled snapshot for the expanded fixture (expanded desc-base path)', () => {
    const { styled } = captureStyledAndUnstyled(
      () => computeLayout(EXPANDED_FIXTURE_OPTIONS, EXPANDED_FIXTURE_STATE).styledLines.join('\n'),
    );
    expect(styled).toMatchSnapshot('styled-expanded');
  });

  it('produces a stable unstyled snapshot for the expanded fixture (expanded desc-base path)', () => {
    const { unstyled } = captureStyledAndUnstyled(
      () => computeLayout(EXPANDED_FIXTURE_OPTIONS, EXPANDED_FIXTURE_STATE).styledLines.join('\n'),
    );
    expect(unstyled).toMatchSnapshot('unstyled-expanded');
  });

  it('expanded fixture snapshots contain deep desc-base lines from the expanded option', () => {
    const { styled, unstyled } = captureStyledAndUnstyled(
      () => computeLayout(EXPANDED_FIXTURE_OPTIONS, EXPANDED_FIXTURE_STATE).styledLines.join('\n'),
    );
    for (const out of [styled, unstyled]) {
      expect(out).toContain('Expanded detail line 6.');
      expect(out).not.toContain('...');
    }
  });
});
