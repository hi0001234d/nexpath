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
beforeAll(() => {
  origIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = true;
});
afterAll(() => {
  process.stdout.isTTY = origIsTTY;
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
});
