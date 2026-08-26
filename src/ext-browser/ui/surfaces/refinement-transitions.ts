// ============================================================================
// D5 ∘ D6 — directional rows and Go back, as a controller hook.
// ----------------------------------------------------------------------------
// The controller knows nothing about refinement; it exposes `resolveActivation`,
// and this module is what plugs into it.
//
// That shape was originally forced by C-4 — D5 had to stay uncommitted while
// D6-D8 landed, so the controller could not name it. The hold is over, but the
// decoupling earned its keep and stays: the controller's contract is
// "something decides what activating a row means", and refinement is one
// answer to that, not a branch inside it.
//
// The behaviour is the CLI runner's (`cli-submit-popup.ts:263-289, 435-440`):
//
//   directional   commit the CURRENT edited body first (the CLI's commitBody),
//                 save { model, body } once — only outside a refinement — then
//                 open the refinement view with the pre-authored recomposed
//                 text. A blank body refuses, silently (bug B).
//   ← Go back     restore BOTH halves: the saved model AND the user's edited
//                 body. Restoring the model alone would discard what they had
//                 typed before picking Shorter.
//
// A second directional is unreachable by construction — the refinement view
// renders no directional rows — and `saved` is per-surface, so PE's refinement
// cannot restore MPS-1's state.
// ============================================================================

import type { SurfaceId, SurfaceModel, SurfaceRow } from './surface-model.js';
import type { ResolveActivation } from './surface-controller.js';
import { DIRECTIONAL_LABELS, GO_BACK_LABEL, buildRefinementModel, withBodyText } from './refinement.js';

/** The pre-authored recomposed body per surface — the static stand-in for the
 * CLI's instant deterministic recompose (Option B; never an LLM call). */
export type RefinedTexts = Partial<Record<SurfaceId, string>>;

export function createRefinementTransitions(refined: RefinedTexts): ResolveActivation {
  /** One save slot per surface: { the main model, the body as the user left it }. */
  const saved = new Map<SurfaceId, { model: SurfaceModel; body: string }>();

  return (model: SurfaceModel, row: SurfaceRow, bodyText: string) => {
    if (row.kind !== 'action') return null;

    if ((DIRECTIONAL_LABELS as readonly string[]).includes(row.label)) {
      // The CLI refuses to refine a blank body (bug B) — silently.
      if (bodyText.trim().length === 0) return 'refuse';
      // savedMain is captured only on the FIRST directional action.
      if (!saved.has(model.id)) saved.set(model.id, { model, body: bodyText });
      const recomposed = refined[model.id];
      if (!recomposed) return 'refuse';
      return { model: buildRefinementModel(withBodyText(model, bodyText), recomposed), focusIndex: 0 };
    }

    if (row.label === GO_BACK_LABEL) {
      const main = saved.get(model.id);
      if (!main) return null;                 // not in a refinement of ours
      saved.delete(model.id);
      return { model: withBodyText(main.model, main.body), focusIndex: 0 };
    }

    return null;
  };
}
