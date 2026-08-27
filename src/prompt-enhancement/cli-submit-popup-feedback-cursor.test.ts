import { describe, expect, it } from 'vitest';
import {
  buildPromptEnhancementCliFeedbackStateV1,
  reducePromptEnhancementCliFeedbackV1,
  renderPromptEnhancementCliFeedbackFrameV1,
  decodePromptEnhancementCliKeyV1,
} from './cli-submit-popup.js';

// The PEF feedback popup's "Other" free-text field used to render without a visible cursor: the loop
// never placed the hardware cursor and the frame renderer had no caret support. The fix records the
// caret's SCREEN position into `caretOut` (window-relative, wrapped exactly like the main popup body),
// so the raw-TTY shell can place the cursor. These tests pin that recording.
describe('PEF feedback popup — Other field cursor (caretOut)', () => {
  const DOWN = '[B';
  const step = (state: ReturnType<typeof buildPromptEnhancementCliFeedbackStateV1>, raw: string) =>
    reducePromptEnhancementCliFeedbackV1(state, decodePromptEnhancementCliKeyV1(raw)).state;

  const focusOther = (): ReturnType<typeof buildPromptEnhancementCliFeedbackStateV1> => {
    let fb = buildPromptEnhancementCliFeedbackStateV1({ fieldWidth: 40, viewportRows: 5 });
    fb = step(fb, DOWN); // -> "Too much or too long"
    fb = step(fb, DOWN); // -> "Other"
    expect(fb.focusIndex).toBe(2);
    return fb;
  };

  it('records caretOut one column past the typed text on the Other line', () => {
    let fb = focusOther();
    for (const ch of 'hello') fb = step(fb, ch);
    expect(fb.editor.buffers.additional_details.text).toBe('hello');
    const caretOut = { row: -1, col: -1 };
    renderPromptEnhancementCliFeedbackFrameV1(fb, { caretOut });
    // Frame lines: header, rule, blank, 2 reason rows, "Other" row -> the Other TEXT is line 7 (1-based).
    // Indent is 6 spaces (col 0 -> screen col 7), so after "hello" (5 chars) the caret sits at col 12.
    expect(caretOut.row).toBe(7);
    expect(caretOut.col).toBe(12);
  });

  it('records caretOut at the field start when Other is focused but empty (cursor over the placeholder)', () => {
    const fb = focusOther();
    expect(fb.editor.buffers.additional_details.text).toBe('');
    const caretOut = { row: -1, col: -1 };
    renderPromptEnhancementCliFeedbackFrameV1(fb, { caretOut });
    expect(caretOut.row).toBe(7);
    expect(caretOut.col).toBe(7);
  });

  it('leaves caretOut unset when a non-editable reason row is focused', () => {
    const fb = buildPromptEnhancementCliFeedbackStateV1({ fieldWidth: 40, viewportRows: 5 });
    expect(fb.focusIndex).toBe(0); // "Not relevant enough"
    const caretOut = { row: -1, col: -1 };
    renderPromptEnhancementCliFeedbackFrameV1(fb, { caretOut });
    expect(caretOut).toEqual({ row: -1, col: -1 });
  });

  it('places caretOut on the correct WRAPPED line for a long Other comment (the Option A path)', () => {
    // Narrow field forces wrapping — the whole reason the Other field wraps+windows like the main body.
    let fb = buildPromptEnhancementCliFeedbackStateV1({ fieldWidth: 20, viewportRows: 5 });
    fb = step(fb, DOWN);
    fb = step(fb, DOWN);
    expect(fb.focusIndex).toBe(2);
    for (const ch of 'abcdefghijklmnopqrstuvwxyz0123456789') fb = step(fb, ch); // 36 chars -> wraps at 20
    const caretOut = { row: -1, col: -1 };
    renderPromptEnhancementCliFeedbackFrameV1(fb, { caretOut });
    // Wraps to two lines (first 20 chars on line 7, remaining 16 on line 8). The caret sits one past the
    // last char on the SECOND wrapped line: indent 6 -> col 7, + 16 chars = col 23.
    expect(caretOut.row).toBe(8);
    expect(caretOut.col).toBe(23);
  });
});
