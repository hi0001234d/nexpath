// ============================================================================
// D5 — directional rows and the refinement view.
// ----------------------------------------------------------------------------
// Owner instruction, 2026-08-22/23: build this fully, commit only when the owner
// says everything is final. It is a separate module for exactly that reason —
// MPS-1's directional work was built once before and then dropped by a
// `git reset` to 48aac87 ("do not show dead buttons"), and keeping D5 in its own
// files means it can be finished, reviewed and still withheld without unpicking
// D1–D4.
//
// WHAT THIS IS. Three refinement rows — Shorter / More thorough /
// More project-grounded — for PE and MPS-1, and the view that opens when one is
// picked. Not a new popup: the same surface switches to a second row set, which
// in this model-driven UI literally means a second SurfaceModel derived from the
// first. Picking a row does an instant deterministic recompose (Option B, owner
// ruling 2026-08-19 — it OVERRIDES Hiren's §31.12/Q32 Option A, and complies
// with the "instant popup" rule: no LLM call). The static build swaps in a
// pre-authored recomposed body from the fixture.
//
// WHERE THE REFERENCES COME FROM, honestly, because they are not all equal:
//   PE refinement view    LIVE. `renderPromptEnhancementPopupFrameV1` accepts
//                         `{ refinement: true }` today and returns exactly
//                         body + Go back — the parity test calls it.
//   PE directional rows   UI-OFF in the CLI: the row loop is commented out
//                         verbatim at `cli-submit-popup.ts:641-664` (owner,
//                         2026-08-19). C-4 wants them in the browser anyway. The
//                         commented block IS the spec — no description line,
//                         never an `(unavailable)` marker, a blank before the
//                         first directional only — and was verified live during
//                         analysis by rendering a temporarily un-commented copy.
//   MPS-1, both           NOTHING live: reverted. The blueprint is
//                         `…mps-1-directional-actions-pe-parity-plan-and-
//                         pending-2026-08-19.md` §2–§3, whose rule is "PE
//                         parity", and the Sequence plan block stays visible
//                         throughout because the plan is never re-planned.
//
// WHY THE FIXTURE ANCHOR (PE_FIXTURE et al) DOES NOT CARRY THESE ROWS ITSELF:
// the live-CLI parity suite renders those fixtures against today's CLI, whose
// directional loop is off — a fixture with the rows baked in would fail parity
// for a reason that is not drift. So the base fixtures stay the parity anchors,
// and `withDirectionalRows` derives the shipping variants from them.
// ============================================================================

import type { SurfaceModel, SurfaceRow } from './surface-model.js';

/**
 * The three refinement labels, in the CLI's order
 * (`popup-session.ts:378-380`: shorter, more_thorough, more_project_grounded).
 */
export const DIRECTIONAL_LABELS = ['Shorter', 'More thorough', 'More project-grounded'] as const;

/** `PROMPT_ENHANCEMENT_CLI_GO_BACK_LABEL_V1`, `cli-submit-popup.ts:541`. */
export const GO_BACK_LABEL = '← Go back';

/**
 * The same surface with its refinement rows removed.
 *
 * The rows live in the fixtures because they are part of the surface. This is
 * the one place that difference is reconciled: today's CLI renders none of them
 * — its row loop is commented out verbatim at `cli-submit-popup.ts:641-664`
 * (owner, 2026-08-19: do not show dead buttons) — so the parity suite compares
 * a stripped model against it.
 *
 * Stripping the ROW also removes the blank line above it, because that blank is
 * `Shorter`'s own `blankBefore`. Filtering rendered lines instead would have to
 * find and drop that blank separately, and get it wrong the first time.
 */
export function withoutDirectionalRows(model: SurfaceModel): SurfaceModel {
  return {
    ...model,
    rows: model.rows.filter(
      (row) => row.kind === 'note' || !(DIRECTIONAL_LABELS as readonly string[]).includes(row.label),
    ),
  };
}

/**
 * The view a directional row opens: the recomposed body, `← Go back`, and
 * nothing else the user could act on.
 *
 * Derived from the base model rather than authored, so the header block —
 * pinch, cues, why-help, progress — and the footer stay exactly what the main
 * view showed, which is what the CLI's renderer does too (its header section
 * does not consult the refinement flag). The body keeps its own hints: the CLI's
 * refinement frame still shows `Ctrl+J … · Enter sends this prompt` while the
 * body is focused.
 *
 * `note` rows survive. PE has none, so nothing changes there; for MPS-1 this is
 * the blueprint's "the Sequence plan line stays" — the plan is never re-planned,
 * and hiding it here would suggest it had been.
 */
export function buildRefinementModel(base: SurfaceModel, recomposedText: string): SurfaceModel {
  const body = base.rows.find((r) => r.kind === 'field');
  if (!body) throw new Error('buildRefinementModel: the base surface has no editable body');

  const bodyRow: SurfaceRow = { ...body, text: recomposedText };
  delete bodyRow.blankBefore;

  const rows: SurfaceRow[] = [
    bodyRow,
    // The CLI gives go_back its own blank line (`cli-submit-popup.ts:770-775`).
    { kind: 'action', label: GO_BACK_LABEL, blankBefore: true },
    ...base.rows.filter((r) => r.kind === 'note'),
  ];

  return { ...base, rows };
}

/**
 * The base model with its body text replaced — the Go-back restore.
 *
 * Two halves must come back, and this is the second: the CLI's runner saves
 * `{ result, body: editedBodyText }` and restores BOTH (`cli-submit-popup.ts:
 * 275-289, 435-440`). Restoring the model alone would discard whatever the user
 * had typed into the body before picking Shorter — the obvious bug, called out
 * in the plan. D6's controller holds the saved string; this produces the model
 * it restores into.
 */
export function withBodyText(model: SurfaceModel, text: string): SurfaceModel {
  let replaced = false;
  const rows = model.rows.map((r) => {
    if (!replaced && r.kind === 'field') {
      replaced = true;
      return { ...r, text };
    }
    return r;
  });
  if (!replaced) throw new Error('withBodyText: the surface has no editable body');
  return { ...model, rows };
}
