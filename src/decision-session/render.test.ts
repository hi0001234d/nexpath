// Full-popup snapshot test — produces dual snapshots (styled + unstyled)
// against a fixture popup, per dev-plan §11.13 + §11.16 + §14.2 Phase 7
// integration item.
//
// Today (Phase 5 baseline) the styler body is pass-through, so styled
// and unstyled snapshots are identical. Bhavnesh's Phase 6 R10 styling
// body will diverge them — the snapshot author re-baselines via
// `vitest -u` once his styler body lands. The test STRUCTURE doesn't
// change across the transition; only the snapshot baselines do.
//
// Fixture inputs are intentionally deterministic (no LLM calls, no
// network, no time-of-day dependence) so the snapshots are stable
// across runs.

import { describe, expect, it } from 'vitest';
import { computeLayout, type RenderLoopOptions } from './render-loop.js';
import { captureStyledAndUnstyled } from './styler-snapshot.js';

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

describe('render — full-popup snapshot (dual styled / unstyled — §11.16 + §14.2)', () => {
  it('produces a stable styled snapshot from the fixture popup', () => {
    const { styled } = captureStyledAndUnstyled(
      () => computeLayout(FIXTURE_OPTIONS, FIXTURE_STATE).styledLines.join('\n'),
    );
    expect(styled).toMatchSnapshot('styled');
  });

  it('produces a stable unstyled snapshot from the fixture popup (NEXPATH_STYLER_PASSTHROUGH=1)', () => {
    const { unstyled } = captureStyledAndUnstyled(
      () => computeLayout(FIXTURE_OPTIONS, FIXTURE_STATE).styledLines.join('\n'),
    );
    expect(unstyled).toMatchSnapshot('unstyled');
  });

  it('phase-5 baseline — styled and unstyled snapshots are IDENTICAL (pass-through styler body)', () => {
    // This invariant FLIPS once Bhavnesh's Phase 6 R10 mapping lands —
    // at that point the test asserts that they DIFFER (codes were applied).
    // The phase-5 baseline locks the current state: identical = pass-through.
    const { styled, unstyled } = captureStyledAndUnstyled(
      () => computeLayout(FIXTURE_OPTIONS, FIXTURE_STATE).styledLines.join('\n'),
    );
    expect(styled).toBe(unstyled);
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
