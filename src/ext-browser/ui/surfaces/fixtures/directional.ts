// ============================================================================
// D5 static content — the refinement views.
// ----------------------------------------------------------------------------
// The refinement ROWS are not here: they are part of the surfaces themselves,
// in `pe.ts` and `mps.ts`. Keeping them in a separate "+ directional" fixture
// made them read as an optional variant of the surface, which they are not.
//
// What remains is the view a refinement OPENS, and the pre-authored recomposed
// bodies it shows. Those are static stand-ins: the real behaviour is an instant
// deterministic recompose with no LLM call (Option B, owner 2026-08-19), and
// each text below is what a "Shorter" pass over its base body would produce —
// same task, same guarantees, fewer words.
// ============================================================================

import type { SurfaceModel } from '../surface-model.js';
import { buildRefinementModel } from '../refinement.js';
import { PE_FIXTURE } from './pe.js';
import { MPS_FIRST_FIXTURE } from './mps.js';

/** The base PE body, recomposed shorter — same guarantees, fewer words. */
export const PE_REFINED_TEXT =
  'Add a Stripe webhook handler for payment_intent.succeeded — signature verified, idempotent on retry, tested, output pasted back.';

/** The base MPS-1 step, recomposed shorter. */
export const MPS_REFINED_TEXT =
  'Step 1 — one failing test for the payment webhook; paste its output back.';

/** PE after picking a refinement: recomposed body + ← Go back. */
export const PE_REFINEMENT_FIXTURE: SurfaceModel =
  buildRefinementModel(PE_FIXTURE, PE_REFINED_TEXT);

/** MPS-1 after picking one: recomposed body + ← Go back, Sequence plan still visible. */
export const MPS_FIRST_REFINEMENT_FIXTURE: SurfaceModel =
  buildRefinementModel(MPS_FIRST_FIXTURE, MPS_REFINED_TEXT);
