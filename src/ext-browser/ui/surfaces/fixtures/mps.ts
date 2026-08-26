// ============================================================================
// Static content for the two multi-prompt-sequence surfaces.
// ----------------------------------------------------------------------------
// Sub-phases D4.1 and D4.2. Both share a header label and most of their rows;
// what differs is what surrounds them, and that is where the CLI's own choices
// show through:
//
//   MPS-1 closes with a dim, non-interactive `Sequence plan` block — the shape
//         of the work ahead, shown but not offered. Its Escape "leaves the
//         editor", so its footer says `Esc actions`.
//   MPS-2 opens with a progress line, repeats the user's original request
//         verbatim under `Your original:`, and adds an escape hatch that parks
//         the sequence rather than ending it. Its Escape CANCELS the remaining
//         sequence, and its footer says so.
//
// Both indent hints to column six where PE uses four — the CLI does, and the
// difference is why `hintIndent` exists.
//
// A3.6 — WHERE `· the whole prompt is included` WENT. Nowhere, and that is the
// answer rather than an omission. In the CLI that suffix rides on the
// `↓ N more lines below` marker and appears ONLY when the field is windowed and
// lines are hidden — it exists to promise that what you cannot see is still
// being sent. D-2 replaced the windowed field with a textarea that holds the
// whole text inside a band that scrolls, so the condition it reassures about no
// longer arises. Printing it unconditionally would say something the CLI never
// says, and the parity test would catch that.
// ============================================================================

import type { SurfaceModel } from '../surface-model.js';
import { DETAILS_HINT, EDIT_KEYS_HINT } from './pe.js';

/** `PROMPT_ENHANCEMENT_MPS_CLI_FOOTER_V1`, `cli-mps-popup.ts:23`. */
export const MPS_FIRST_FOOTER = 'Enter send · Esc actions';

/**
 * `PROMPT_ENHANCEMENT_MPS_CLI_CONTINUATION_FOOTER_V1`, `cli-mps-popup.ts:27`.
 * Different on purpose: on the continuation surface Escape cancels the whole
 * remaining sequence, and the footer is where a user finds that out.
 */
export const MPS_CONTINUATION_FOOTER = 'Enter send · Esc cancels sequence';

export const MPS_CANCEL_LABEL = 'Cancel (remaining multi-prompt sequence)';
export const MPS_INTERRUPTION_LABEL = 'I need to do something else first';
export const MPS_INTERRUPTION_HELPER =
  'Write directly in the coding agent. This same sequence prompt returns after the response.';

const ORIGINAL_PROMPT = 'Build the payment webhook end to end.';

export const MPS_FIRST_FIXTURE: SurfaceModel = {
  id: 'mps_first',
  label: 'Multi-prompt sequence',
  fieldIndent: 4,
  hintIndent: 6,
  rows: [
    {
      kind: 'field',
      label: 'Use enhanced sequence prompt',
      text: [
        'Step 1 — write the failing test for the payment webhook.',
        '',
        'Scope: test file only, no handler code yet.',
        'Acceptance: the test fails for the right reason and the output is pasted back.',
      ].join('\n'),
      // No "Enter sends this prompt" here: MPS says it in the footer instead.
      hints: { whenFocused: [EDIT_KEYS_HINT] },
    },
    {
      kind: 'field',
      label: 'Additional details',
      text: 'Focus on the checkout module.',
      hints: { always: [DETAILS_HINT], whenFocused: [EDIT_KEYS_HINT] },
      blankBefore: true,
    },
    // The refinement rows, per the MPS-1 blueprint's "PE parity" rule.
    //
    // Cancel KEEPS its own blank, where PE's `Use original prompt` has none —
    // the two surfaces genuinely differ here. MPS-1 puts a blank after its
    // details group and PE does not, so the refinement block sits between two
    // blanks on MPS-1 and opens one on PE. Encoded per surface rather than
    // derived, because deriving it got MPS-1 wrong: stripping the rows for the
    // parity comparison left Cancel without the blank the CLI prints.
    { kind: 'action', label: 'Shorter', blankBefore: true },
    { kind: 'action', label: 'More thorough' },
    { kind: 'action', label: 'More project-grounded' },
    { kind: 'action', label: MPS_CANCEL_LABEL, act: 'cancel-sequence', tone: 'cancel', blankBefore: true },
    // The plan is shown, never offered — dim and unreachable, so a user can see
    // the shape of the work without being able to act on a step that is not next.
    { kind: 'note', text: 'Sequence plan', indent: 2, blankBefore: true },
    { kind: 'note', text: 'Total: 3', indent: 2 },
    { kind: 'note', text: 'Types: implement, verify, document', indent: 2 },
  ],
  footer: MPS_FIRST_FOOTER,
};

export const MPS_CONTINUATION_FIXTURE: SurfaceModel = {
  id: 'mps_continuation',
  label: 'Multi-prompt sequence',
  progress: 'Sequence 1 of 4',
  fieldIndent: 4,
  hintIndent: 6,
  rows: [
    {
      kind: 'field',
      label: 'Use enhanced sequence prompt',
      text: [
        'Step 2 — implement the handler so the failing test passes.',
        '',
        'Acceptance: signature verified, idempotent on retry.',
        'Verification: paste the test output.',
      ].join('\n'),
      hints: { whenFocused: [EDIT_KEYS_HINT] },
    },
    // Verbatim, and non-interactive: several steps in, the user needs to see
    // what they actually asked for without being able to edit it here.
    { kind: 'note', text: 'Your original:', indent: 2, blankBefore: true },
    { kind: 'note', text: ORIGINAL_PROMPT, indent: 4, tone: 'plain' },
    {
      kind: 'field',
      label: 'Additional details',
      text: 'Keep scope to the payments module.',
      hints: { always: [DETAILS_HINT], whenFocused: [EDIT_KEYS_HINT] },
      blankBefore: true,
    },
    {
      kind: 'action',
      label: MPS_INTERRUPTION_LABEL,
      act: 'interruption',
      helper: MPS_INTERRUPTION_HELPER,
      blankBefore: true,
    },
    { kind: 'action', label: MPS_CANCEL_LABEL, act: 'cancel-sequence', tone: 'cancel', blankBefore: true },
  ],
  footer: MPS_CONTINUATION_FOOTER,
};
