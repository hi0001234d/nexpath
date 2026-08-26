// ============================================================================
// Typed model for a CLI-parity surface.
// ----------------------------------------------------------------------------
// Sub-phase D3.1. Types only — no DOM, no rendering, no imports. What a surface
// IS, separate from how it is drawn.
//
// WHY TYPED AT ALL, when the content is static (D-5). Because it will not stay
// static. A literal-DOM build would have to be rewritten the day live data
// arrives; a typed model means the fixture is swapped for a producer and nothing
// else moves. The cost now is this file.
//
// The shape follows the CLI's own line grammar rather than any one surface, so
// MPS-1, MPS-2 and PEF (D4) describe themselves with the same vocabulary.
// ============================================================================

/** Which surface a model describes. Drives nothing here; it is for callers. */
export type SurfaceId =
  | 'prompt_enhancement'
  | 'mps_first'
  | 'mps_continuation'
  | 'prompt_enhancement_feedback';

/**
 * The hint lines under an editable field.
 *
 * Order is `always` then `whenFocused`, which is exactly what the CLI emits and
 * why two lists are needed rather than one. The body row shows its hint only
 * while focused; the details row shows "Enter applies these details" at all
 * times and adds the edit-keys line beneath it when focused
 * (`cli-submit-popup.ts:800-818`).
 */
export interface FieldHints {
  /** Shown whether or not the row has focus. */
  always?: readonly string[];
  /** Appended below `always`, only while the row has focus. */
  whenFocused?: readonly string[];
}

/**
 * One row of a surface.
 *
 * Every row is a radio option in the CLI — filled bullet when focused, hollow
 * otherwise — and an editable row additionally renders its field beneath the
 * label. That is the whole distinction, so it is the whole union.
 */
export type SurfaceRow =
  | {
      kind: 'field';
      label: string;
      /** Current text of the field. Static today; a producer fills it later. */
      text: string;
      /** Shown in place of empty text — PEF's `(type your feedback)`. */
      placeholder?: string;
      hints?: FieldHints;
      /** The CLI opens some blocks with a blank line; the model says which. */
      blankBefore?: boolean;
      /**
       * The CLI's locked editor (`editabilityState !== 'editable'` — e.g. a
       * read-only fallback body): the field renders but typing is impossible.
       * Live 2026-08-25: rendering a locked body as editable let the user type
       * text the engine then correctly discarded on send — the field must
       * never promise an edit the send path will not honour.
       */
      readOnly?: boolean;
      /** The CLI's "  (unavailable)" row marker (`cli-submit-popup.ts:777`). */
      unavailable?: boolean;
      /**
       * Fixed window for this field in lines — the CLI caps the PE details
       * field at 5 rows (`cli-submit-popup.ts:1335`). Fields WITHOUT it size
       * adaptively to the remaining band, the CLI's fill-the-window rule
       * (:1354-1365).
       */
      maxLines?: number;
    }
  | {
      kind: 'action';
      label: string;
      /**
       * What activating this row means (D6). Encoded in the model rather than
       * matched on labels in the controller, so a reworded label cannot silently
       * unhook a behaviour. Rows without one fall through to the controller's
       * generic activate event — or to its pluggable transitions hook.
       */
      act?: 'use-original' | 'cancel-sequence' | 'interruption';
      /** MPS's Cancel row carries the CLI's paleYellow. */
      tone?: 'plain' | 'cancel';
      /** A line under the label, like MPS-2's interruption helper. */
      helper?: string;
      blankBefore?: boolean;
      /** The CLI's "  (unavailable)" row marker (`cli-submit-popup.ts:777`). */
      unavailable?: boolean;
    }
  | {
      /**
       * A line the user cannot act on: MPS-1's `Sequence plan` block, MPS-2's
       * `Your original:` and the prompt beneath it. No bullet, no focus — the
       * CLI prints these as plain indented text and never counts them as rows.
       */
      kind: 'note';
      text: string;
      /** Column the CLI indents it to. */
      indent?: 2 | 4;
      tone?: 'dim' | 'plain';
      blankBefore?: boolean;
    };

/**
 * A whole surface, in the order the CLI renders it: header, pinch label, trust
 * cues, why-help, an optional provider-failure notice, the rows, then the footer.
 *
 * Optional fields are optional in the CLI too — it omits the pinch label when a
 * surface has none, and emits the provider-failure notice only on a real
 * provider failure, never on a no-key or invalid-output run.
 */
export interface SurfaceModel {
  id: SurfaceId;
  /** Header suffix: the frame reads `◆ NEXPATH CLI · <label>`. */
  label: string;
  pinch?: string;
  trustCues?: readonly string[];
  /** Multi-line. Rendered one row per line, as the CLI does. */
  whyHelp?: string;
  /** Present only on a real provider failure. Rendered in the caution tone. */
  providerFailure?: string;
  /** MPS-2's `Sequence 1 of 4`, dim, on its own line under the header block. */
  progress?: string;
  /**
   * Columns a field's content and its hints indent to.
   *
   * Not one number, because the CLI does not use one: PE indents both by four,
   * MPS keeps content at four but pushes hints to six, and PEF puts both at six.
   * Per-surface rather than per-row, because within a surface they never differ.
   */
  fieldIndent?: 4 | 6;
  hintIndent?: 4 | 6;
  rows: readonly SurfaceRow[];
  footer: string;
}

/** Which row currently has focus. Not part of the model — it changes, the model does not. */
export interface SurfaceState {
  focusIndex: number;
  /**
   * A transient line above the footer — the CLI's publicNotice slot. State, not
   * model: it describes what just happened, not what the surface is.
   */
  notice?: string;
}
