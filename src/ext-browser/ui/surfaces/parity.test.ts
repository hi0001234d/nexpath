// @vitest-environment jsdom
//
// Sub-phase D4.5 — parity for all four surfaces, in one place.
//
// The reference is never a captured string. Each case calls the CLI's own
// renderer and compares line for line, so a change on either side shows up here
// rather than drifting quietly. D-2 chose fluid CSS, which forced the DOM to be
// authored separately from the CLI's ASCII; this is what keeps the two honest.
//
// Test-only. C-5 forbids modifying other modules and wiring them into the
// extension; reading a reference in a test is neither, and none of it ships.

import { describe, it, expect } from 'vitest';
import { renderSurface } from './surface-view.js';
import { PE_FIXTURE, EDIT_KEYS_HINT } from './fixtures/pe.js';
import { MPS_FIRST_FIXTURE, MPS_CONTINUATION_FIXTURE } from './fixtures/mps.js';
import { PEF_FIXTURE } from './fixtures/pef.js';
import type { SurfaceModel } from './surface-model.js';
import { withoutDirectionalRows } from './refinement.js';

import { renderPromptEnhancementPopupFrameV1, buildPromptEnhancementCliFeedbackStateV1, renderPromptEnhancementCliFeedbackFrameV1 } from '../../../prompt-enhancement/cli-submit-popup.js';
import { renderPromptEnhancementMpsFirstPopupFrameV1, renderPromptEnhancementMpsContinuationFrameV1 } from '../../../prompt-enhancement/cli-mps-popup.js';

// ── extraction ───────────────────────────────────────────────────────────────

/**
 * Cells are joined with a space. A bullet row is two flex cells and the gap
 * between them is the bullet column's width, not a character — reading
 * `textContent` off the row would yield "●Use enhanced prompt" and compare a
 * layout detail rather than what a user reads.
 */
function rowText(row: Element): string {
  return [...row.children].map((cell) => cell.textContent ?? '').join(' ').trimEnd();
}

/**
 * The visible lines of a rendered surface. A textarea's content is its `value`,
 * and a multi-line value is several CLI lines, so it is split. An empty field
 * showing a placeholder contributes the placeholder, which is what the CLI
 * prints there.
 */
function domLines(frame: HTMLElement): string[] {
  const out: string[] = [];
  for (const row of frame.querySelectorAll('.np-row')) {
    // A hidden scroll marker is not a line on screen. It is in the DOM so it
    // can appear the moment the field windows, and `display: none` is what the
    // reader actually sees — jsdom computes no layout, so the class is the
    // only honest signal here.
    if (row.classList.contains('np-marker-hidden')) continue;
    const field = row.querySelector('textarea');
    if (field) {
      const shown = field.value || field.placeholder;
      for (const line of shown.split('\n')) out.push(line.trimEnd());
      continue;
    }
    out.push(rowText(row));
  }
  return out;
}

/**
 * The visible lines of a CLI frame, with the parts CSS provides removed: the
 * rail is a border here and the indent columns are padding. Both are verified
 * in `chrome.test.ts`; this comparison is about the CONTENT.
 */
function cliLines(frame: string): string[] {
  return frame.split('\n').map((line) => line.replace(/^│ ?/, '').trim());
}

/**
 * Our frame, made comparable to the CLI's. TWO reconciliations, both of them
 * decisions rather than drift, and both kept in this one place so that every
 * other line still has to match the CLI exactly.
 *
 * 1. THE REFINEMENT ROWS ARE STRIPPED. They are part of the surfaces — the
 *    browser wires the recompose path, so C-4 puts them on screen — but today's
 *    CLI renders none of them: its row loop is commented out verbatim at
 *    `cli-submit-popup.ts:641-664` (owner, 2026-08-19: do not show dead
 *    buttons).
 *
 * 2. THE EDIT-KEYS HINT IS NORMALISED. The browser advertises the Alt+Shift
 *    chords (the advisory panel's Ctrl+T→Alt+Shift+T precedent — a strayed-focus
 *    Ctrl+J is Chrome's own Downloads shortcut), while the CLI keeps its
 *    Ctrl/Cmd spelling. Exactly that hint string is normalised and nothing else,
 *    so any OTHER hint drift still fails this suite.
 */
const CLI_EDIT_KEYS_HINT =
  typeof process !== 'undefined' && process.platform === 'darwin'
    ? 'Cmd+J new line · Cmd+↑/↓ move line'
    : 'Ctrl+J new line · Ctrl+↑/↓ move line';

function ours(model: SurfaceModel, focusIndex: number): string[] {
  return domLines(renderSurface(document, withoutDirectionalRows(model), { focusIndex }))
    .map((l) => l.trim())
    .map((l) => l.split(EDIT_KEYS_HINT).join(CLI_EDIT_KEYS_HINT));
}

// ── CLI models mirroring each fixture ────────────────────────────────────────

function fieldText(model: SurfaceModel, index: number): string {
  const row = model.rows[index];
  return row && row.kind === 'field' ? row.text : '';
}

function peCli(focusIndex: number): string[] {
  const model = {
    title: 'Nexpath · Prompt enhancement',
    editorHeading: PE_FIXTURE.rows[0]!.kind !== 'note' ? PE_FIXTURE.rows[0]!.label : '',
    identity: { enhancementId: 'e1', currentBodyId: 'b1', bodyRevision: 1, validationDecisionId: 'v1' },
    body: { editable: true },
    pinchLabel: { text: PE_FIXTURE.pinch!, derivedFrom: 'family' },
    whyHelp: { text: PE_FIXTURE.whyHelp!, reasonKind: 'risk_or_rollback' },
    publicCopy: { trustCues: PE_FIXTURE.trustCues!.map((t) => ({ publicSafeText: t })), diagnostics: [] },
    controls: {
      additionalDetails: { availability: 'available' }, directional: [],
      feedback: { availability: 'available' }, original: { availability: 'available' },
      currentBody: { availability: 'available' }, close: { availability: 'available' },
    },
  };
  return cliLines(renderPromptEnhancementPopupFrameV1(
    { model, editedBodyText: fieldText(PE_FIXTURE, 0), additionalDetailsText: fieldText(PE_FIXTURE, 1) } as never,
    { focusIndex, helpExpanded: false } as never,
  ));
}

function mpsFirstCli(focusIndex: number): string[] {
  const model = {
    surface: 'prompt_enhancement_mps_first_popup',
    title: 'Nexpath · Multi-prompt sequence',
    heading: 'Use enhanced sequence prompt',
    layout: [],
    identity: { requestId: 'r', projectRoot: '/p', handoffDecisionId: 'h', currentBodyId: 'b', bodyRevision: 1, itemLineageRefs: [] },
    body: { text: fieldText(MPS_FIRST_FIXTURE, 0), editable: true, originalPromptText: '', originalPromptPreservation: 'visible_verbatim' },
    additionalDetails: { visible: true, text: fieldText(MPS_FIRST_FIXTURE, 1), revision: 1 },
    actions: {
      submitCurrentBody: 'typed_current_body_plus_details',
      cancelRemainingSequence: { label: 'Cancel (remaining multi-prompt sequence)', state: 'available', disposition: 'blocked_no_send' },
      originalPrompt: 'not_rendered',
    },
    sequencePlan: { remainingTaskCount: 3, taskRoleLabels: ['implement', 'verify', 'document'], taskSummaryLines: [] },
    keyboard: {}, authority: {},
  };
  return cliLines(renderPromptEnhancementMpsFirstPopupFrameV1(model as never, { focusIndex } as never));
}

function mpsContinuationCli(focusIndex: number): string[] {
  const model = {
    surface: 'prompt_enhancement_mps_continuation_popup',
    title: 'Nexpath · Multi-prompt sequence',
    heading: 'Use enhanced sequence prompt',
    layout: [],
    progress: { done: 1, total: 4 },
    itemKind: 'task',
    identity: { requestId: 'r', sequenceId: 's', sequenceItemId: 'i', currentItemRevision: 2, bodyRevision: 1, detailsRevision: 1 },
    body: { text: fieldText(MPS_CONTINUATION_FIXTURE, 0), editable: true, originalPromptText: 'Build the payment webhook end to end.' },
    additionalDetails: { visible: true, text: fieldText(MPS_CONTINUATION_FIXTURE, 3), revision: 1 },
    actions: {
      submitCurrentBody: 'typed_current_body_plus_details',
      customInterruption: {
        label: 'I need to do something else first',
        helper: 'Write directly in the coding agent. This same sequence prompt returns after the response.',
      },
      cancelRemainingSequence: { label: 'Cancel (remaining multi-prompt sequence)', state: 'available', disposition: 'blocked_no_send' },
      originalPrompt: 'not_rendered',
    },
    keyboard: {}, authority: {},
  };
  return cliLines(renderPromptEnhancementMpsContinuationFrameV1(model as never, { focusIndex } as never));
}

function pefCli(focusIndex: number): string[] {
  const state = buildPromptEnhancementCliFeedbackStateV1({ fieldWidth: 72, viewportRows: 6 });
  return cliLines(renderPromptEnhancementCliFeedbackFrameV1({ ...state, focusIndex } as never, {}));
}

// ── the cases ────────────────────────────────────────────────────────────────

// `cliClamps` records whether the CLI's own RENDERER guards an out-of-range
// focus. PE and MPS do. PEF does not — its reducer clamps instead
// (`cli-submit-popup.ts:1144`), so its renderer never sees a bad index and has
// no reason to guard. We clamp in all four renderers anyway: it is consistent,
// it is defence in depth for the index D6 will drive, and it can only differ
// from PEF on an input that cannot occur.
const CASES: ReadonlyArray<readonly [string, SurfaceModel, (f: number) => string[], number, boolean]> = [
  ['PE', PE_FIXTURE, peCli, 3, true],
  ['MPS-1', MPS_FIRST_FIXTURE, mpsFirstCli, 3, true],
  ['MPS-2', MPS_CONTINUATION_FIXTURE, mpsContinuationCli, 4, true],
  ['PEF', PEF_FIXTURE, pefCli, 3, false],
];

describe.each(CASES)('%s — parity with the CLI', (label, fixture, cli, rowCount, cliClamps) => {
  it.each(Array.from({ length: rowCount }, (_, i) => i))('matches line for line, focus on row %i', (focusIndex) => {
    expect(ours(fixture, focusIndex)).toEqual(cli(focusIndex));
  });

  it('is comparing something real', () => {
    const lines = cli(0);

    expect(lines.length, `${label} frame looks empty`).toBeGreaterThan(4);
    expect(lines.some((l) => l.includes('NEXPATH CLI')), `${label} has no header`).toBe(true);
  });

  it('changes when focus does, so the comparison has teeth', () => {
    expect(ours(fixture, 0)).not.toEqual(ours(fixture, 1));
  });

  it('clamps an out-of-range focus', () => {
    // Where the CLI's renderer clamps too, the frames must still agree. Where it
    // does not, only our own settling is asserted — matching an unguarded
    // renderer would mean rendering a frame with nothing focused at all.
    expect(ours(fixture, -5)).toEqual(ours(fixture, 0));
    expect(ours(fixture, 99)).toEqual(ours(fixture, rowCount - 1));
    expect(ours(fixture, 1.7)).toEqual(ours(fixture, 1));   // truncated, not rounded

    if (cliClamps) {
      expect(ours(fixture, -5)).toEqual(cli(-5));
      expect(ours(fixture, 99)).toEqual(cli(99));
    }
  });
});
