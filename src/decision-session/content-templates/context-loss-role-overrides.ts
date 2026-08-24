// Role-tailored context_loss content as content-template `roleOverrides` (B11).
//
// context_loss is the one genuinely role-varied signal: founder / indie_hacker speak a
// casual voice, pm a formal one, and each applies its own lens to the same practice —
// reconstruct the session's decisions / constraints / assumptions. The engine serves
// these by role (role → register → base). They carry the base record's 5-maturity ladder
// (col-1 one-line recap → col-5 written note), re-voiced per role, keeping the "decision"
// keyword. No sensitive action → no confirm-seek. The founder/indie framing (product
// direction / ship momentum) and the PM framing (decision record / requirements
// traceability) mirror the frozen `context-loss-role-variants.ts` voices they supersede.

import type { LevelForm, RoleOverride } from '../content-template-schema.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}

/** FOUNDER — casual, product-direction lens. */
export const CONTEXT_LOSS_FOUNDER_OVERRIDE: RoleOverride = {
  levelForms: {
    1: form(
      "Note the one decision and direction-constraint from this session in a line before we continue — what we decided and what it now commits the product to.",
      "One line is enough — just the decision that most shapes the product's direction, so we don't lose it as we move on.",
    ),
    2: form(
      "Summarize the decisions we made this session and the constraints they set on the direction — the main ones and what still depends on them, as a quick re-anchor.",
      "Pull out the decisions that still constrain where the product goes, and note what depends on each — so the direction stays anchored.",
    ),
    3: form(
      "Reconstruct the decisions, constraints, and direction-assumptions for this session: list every decision we committed to, what each locks the product into, and the assumptions about the users and the outcome we haven't pressure-tested — make them explicit before we drift from the direction.",
      "Surface the decisions and the assumptions under them we never actually tested — an untested assumption is where the product quietly drifts off-direction.",
    ),
    4: form(
      "Reconstruct the full direction state — the decisions committed, the constraints they lock in, and the outcome assumptions still unchecked, from the goal to the current work — so nothing silently steers the product off-course.",
      "Cover the whole thread from the goal to now, not just the recent calls — one buried decision is enough to steer the product off-course.",
    ),
    5: form(
      "Write a direction note: the decisions made, the constraints they commit the product to, the outcome assumptions still open, and the next two or three moves — kept as the re-anchor so the product doesn't drift.",
      "Keep it as a note we can reopen — the decisions, what they commit us to, and the next moves — so the direction survives past this session.",
    ),
  },
};

/** INDIE_HACKER — casual, ship-momentum lens. */
export const CONTEXT_LOSS_INDIE_HACKER_OVERRIDE: RoleOverride = {
  levelForms: {
    1: form(
      "Note the one decision and constraint from this session in a line before we push further — what we decided and what the next thing to ship depends on.",
      "Just capture the decision the next ship leans on — quick, so momentum doesn't bury it.",
    ),
    2: form(
      "Summarize the decisions we made this session and the constraints they set — the main ones and what still depends on them, so we're not shipping on forgotten context.",
      "Pull the decisions the next release rests on, and what each depends on — shipping on forgotten context is how things break.",
    ),
    3: form(
      "Reconstruct the decisions, constraints, and assumptions for this session: list every decision we committed to while moving fast, what each locks us into, and the assumptions we've been shipping on without checking — make them explicit before we ship ourselves into a corner.",
      "Name the decisions and the assumptions we've been moving fast on but never checked — that's what ships you into a corner.",
    ),
    4: form(
      "Reconstruct the full session state — the decisions committed, the constraints they lock in, and the assumptions still unverified, from the goal to what's shipping now — so nothing silently breaks the next release.",
      "Walk the whole thread from the goal to what's shipping now — one unverified decision is enough to break the next release.",
    ),
    5: form(
      "Write a session-state note: the decisions made, the constraints they set, the assumptions still open, and the next two or three things to ship — kept as the re-anchor so momentum doesn't outrun the context.",
      "Drop it in a note we can come back to — the decisions, their constraints, and the next things to ship — so momentum doesn't outrun the context.",
    ),
  },
};

/** PM — formal, requirements / traceability lens. */
export const CONTEXT_LOSS_PM_OVERRIDE: RoleOverride = {
  levelForms: {
    1: form(
      "Record the single most significant decision and constraint from this session in one line before proceeding — the decision taken and what the next step depends on.",
      "One line is sufficient here — the governing decision and what now depends on it — so the requirements stay anchored before proceeding.",
    ),
    2: form(
      "Summarize the decisions taken this session and the constraints they impose — the significant ones and what still depends on them — as a brief re-anchor for the requirements.",
      "Identify the decisions that impose real constraints on the requirements, and note their dependencies — a brief but traceable re-anchor.",
    ),
    3: form(
      "Reconstruct the decision record for this session: every decision taken, the constraints each imposes, and the assumptions it rests on — so the requirements and their rationale are explicit and traceable before work continues.",
      "Make each decision, its constraint, and its underlying assumption explicit — undocumented rationale is where requirements traceability breaks down.",
    ),
    4: form(
      "Reconstruct the full decision-thread — every decision taken, the constraints it imposes, and the assumptions requiring validation, from the objective to the current work — so no unstated decision distorts the next phase.",
      "Trace the full thread from the objective to the current work — a single unstated decision can distort the next phase's requirements.",
    ),
    5: form(
      "Write a decision-record note: the decisions taken, the constraints they impose, the assumptions requiring validation, and the next two or three steps — retained as the traceable anchor for the requirements.",
      "Keep this as the traceable anchor — every decision with its constraint, open assumption, and next step — so later work can trace back to why each choice was made.",
    ),
  },
};
