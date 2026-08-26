// ============================================================================
// Static content for the prompt-enhancement feedback surface.
// ----------------------------------------------------------------------------
// Sub-phase D4.3. The one surface that asks the user something rather than
// telling them, and the smallest: two fixed reasons, a free-text third, and a
// footer that makes clear skipping is free.
//
// It has no pinch label, no trust cues and no why-help — so it is also the case
// that proves the header's blank line is conditional. The CLI goes straight from
// the rule to the first reason here, and a surface that always emitted the blank
// would be one line taller than the CLI on this frame alone.
//
// Both its field content and its hints sit at column six, where PE puts content
// at four.
// ============================================================================

import type { SurfaceModel } from '../surface-model.js';
import { EDIT_KEYS_HINT } from './pe.js';

/** `PROMPT_ENHANCEMENT_CLI_FEEDBACK_FOOTER_V1`, `cli-submit-popup.ts:1113`. */
export const PEF_FOOTER = 'Enter submit · Esc skip';

/** `PROMPT_ENHANCEMENT_CLI_FEEDBACK_ROWS_V1`, `cli-submit-popup.ts:1112`. */
export const PEF_REASONS = ['Not relevant enough', 'Too much or too long', 'Other'] as const;

/** Shown only while the field is empty; never sent as if the user wrote it. */
export const PEF_PLACEHOLDER = '(type your feedback)';

export const PEF_FIXTURE: SurfaceModel = {
  id: 'prompt_enhancement_feedback',
  label: 'Prompt enhancement feedback',
  fieldIndent: 6,
  hintIndent: 6,
  rows: [
    { kind: 'action', label: PEF_REASONS[0] },
    { kind: 'action', label: PEF_REASONS[1] },
    {
      kind: 'field',
      label: PEF_REASONS[2],
      text: '',
      placeholder: PEF_PLACEHOLDER,
      hints: { whenFocused: [EDIT_KEYS_HINT] },
    },
  ],
  footer: PEF_FOOTER,
};
