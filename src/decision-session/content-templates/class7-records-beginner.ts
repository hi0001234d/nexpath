/**
 * Class-7 vibe-coder `_BEGINNER` register overrides (the 11 casual-anchored signals).
 *
 * Class 7 is single-register in the frozen content: 9 signals are already beginner-anchored
 * (their content-template col-3 IS the beginner L1[0], so they need no override), and 11 are
 * casual-anchored with NO frozen beginner variant. These 11 get a structurally-divergent
 * beginner override authored here. Because there is no frozen beginner headline to anchor on,
 * col-3 is authored fresh: it is the beginner-voice expression of the same shipped practice the
 * casual headline carries (same named practice and intent, jargon and citations dropped, plain
 * collaborative beginner voice). The other columns escalate that practice with the signal's own
 * plain keyword in every option and authored why-desc.
 *
 * F2 split mirrors the base records: six produce a written note/doc at col-5 (MVP_SCOPE,
 * IDEA_TO_SPEC, DEMO_VS_PRODUCT, USER_JOURNEY, RESTART_IMPULSE, CREATIVE_VS_CORE) and five stay
 * behavioural habits (FEATURE_COMPLETION, FINISHING_LINE, POLISH_VS_FUNCTION, SPIKE_TREATMENT,
 * DEPENDENCY_ADVENTURE). Only DEPENDENCY_ADVENTURE is intrinsically sensitive: its base record
 * carries l2SafeguardRequired + l2SafeguardLine, and the override (which only swaps levelForms)
 * inherits both, so the engine appends the confirm-seek to every served beginner column.
 */

import type { LevelForm, RegisterOverride, MaturityLevel } from '../content-template-schema.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}
function structural(levelForms: Partial<Record<MaturityLevel, LevelForm>>): RegisterOverride {
  return { divergence: 'structurally-divergent', levelForms };
}

/** FEATURE_COMPLETION_CHECK (beginner) — keyword "feature". Behavioural. */
export const FEATURE_COMPLETION_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Quick check before starting a new feature: is the last feature actually finished and working all the way through?', 'The lightest step: the last feature confirmed working before the next is started.'),
  2: form('Run the last feature end to end and confirm it really works before you start the next feature.', 'A light pass: the last feature run through and confirmed done before the next.'),
  3: form("1. Stop before starting a new feature and look at the last one you built.\n2. Tell me: is it completely finished and working from start to end, or is part of it still undone?\n3. If anything's unfinished, let's close it out first — half-done features pile up and slow everything down later.", 'The last feature hasn\'t been confirmed finished end to end before the next was started.'),
  4: form("Before the next feature, check the last one against a simple 'done' bar: the main path works, the obvious edge cases hold, and nothing is left half-wired — fix any gap first.", 'Beyond a quick look: the last feature checked against a clear done bar before the next.'),
  5: form('Make it a standing habit: no new feature starts until the last feature is finished and working end to end — so unfinished work never piles up.', 'A standing habit: each feature finished end to end before the next begins.'),
});

/** FINISHING_LINE_AWARENESS (beginner) — keyword "finish". Behavioural. */
export const FINISHING_LINE_AWARENESS_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Count what you have started but not finished, and push the closest one all the way to finished.', 'The lightest step: the nearest unfinished thing pushed to finished.'),
  2: form('List what is half-done, pick the one closest to finished, and finish it before opening anything new.', 'A light pass: the half-done work listed and the nearest one finished first.'),
  3: form("1. Count how many things you have started versus how many are actually finished and working.\n2. Share that with me — a thing that is half-finished helps no one yet; one finished thing beats three half-finished ones.\n3. Then pick the closest one and let's finish it before starting anything new.", 'Several things are half-finished and none has been pushed to finished.'),
  4: form('Set a small limit on how many things can be unfinished at once, and finish what is open down to that limit before starting anything new — so half-done work shrinks instead of spreading.', 'Beyond counting: a limit on unfinished work so open things get finished, not multiplied.'),
  5: form('Make finish-before-start a habit: keep only one or two things going at a time and finish each before opening the next — so work gets finished and shipped, not left half-built.', 'A standing habit: few things in progress and each finished before the next is started.'),
});

/** POLISH_VS_FUNCTION (beginner) — keyword "polish". Behavioural. */
export const POLISH_VS_FUNCTION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before adding more polish, check that the main thing actually works from start to finish.', 'The lightest step: the core confirmed working before any polish.'),
  2: form('Get the main feature working and confirmed first, then spend effort on polish — not before.', 'A light pass: the core confirmed working before polish effort goes in.'),
  3: form("1. Before putting more work into polish — making it look nicer or smoother — check that the core actually works end to end.\n2. Tell me: does the main thing do its job yet, or is it still not fully working?\n3. If the core isn't working, let's fix that first — polish on top of something that doesn't work is wasted effort.", 'The core hasn\'t been confirmed working before polish effort goes in.'),
  4: form("Keep the two jobs separate: get the core working and confirmed first, then do one dedicated polish pass on top — don't mix polish into a core that isn't proven yet.", 'Beyond a check: a working core first, then a dedicated polish pass, never mixed in.'),
  5: form('Make function-before-polish the habit: no polish work starts until the core works end to end — so effort never lands on something that does not run yet.', 'A standing habit: the core works end to end before any polish begins.'),
});

/** MVP_SCOPE_DISCIPLINE (beginner) — keyword "core". File at col-5. */
export const MVP_SCOPE_DISCIPLINE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before adding the next feature, ask one thing: does it test the core idea, or is it extra?', 'The lightest step: the next feature checked against the core idea before it is added.'),
  2: form('Run each new feature past one test — does it prove the core idea? Keep those, set the rest aside for now.', 'A light pass: features kept only when they serve the core idea.'),
  3: form("1. Look at the features you are planning to add.\n2. For each one, tell me: does it test whether the core idea actually works, or is it a nice-to-have on top?\n3. Keep the ones that test the core idea and set the rest aside — adding extras to an idea you haven't proven yet just slows you down.", 'The features haven\'t been checked against the core idea — extras risk piling onto an unproven idea.'),
  4: form('Go through the whole feature list and mark each one core-idea or nice-to-have, then set aside everything that is not needed to find out if the core idea works.', 'Beyond gating one: the whole list split into core-idea versus set-aside.'),
  5: form('Write a short note: the features that test the core idea, the ones set aside, and why — the cut list you build to so extras do not creep back in.', 'A durable note of the core-idea features kept and what is set aside.'),
});

/** IDEA_TO_SPEC_BRIDGE (beginner) — keyword "plan". File at col-5. */
export const IDEA_TO_SPEC_BRIDGE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before building, write one line of plan: what is this feature supposed to do?', 'The lightest step: a one-line plan of what the feature does before building.'),
  2: form('Write a quick plan before building: what it does, what it does not do, and how it fits what is already there.', 'A light pass: a quick plan of what it does, what it does not, and where it fits.'),
  3: form("1. Before we start building — let's turn the idea into a short plan.\n2. Tell me in a few sentences: what should this feature do, what should it NOT do, and how does it fit with what already exists?\n3. We'll build from that plan — having it written down keeps the building on track instead of wandering.", 'The idea hasn\'t been turned into a written plan before building.'),
  4: form("Turn the plan into something checkable: add what it must do, what it must not do, and one concrete example of an input and the result that proves it is built right.", 'Beyond a description: a plan with one concrete pass/fail example.'),
  5: form('Write the plan into a short doc: what the feature does, what it does NOT do, and how it fits — the written plan the code is then built and checked against.', 'A durable plan doc of behaviour, non-goals, and fit, as the thing the code is checked against.'),
});

/** DEMO_VS_PRODUCT (beginner) — keyword "demo". File at col-5. */
export const DEMO_VS_PRODUCT_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before building more, name it: is this a throwaway demo, or the real thing people will actually use?', 'The lightest step: the demo-versus-real standard named before more is built.'),
  2: form("Mark the demo parts plainly — fake data, happy-path-only — so demo work doesn't get mistaken for the real thing.", 'A light pass: the demo-grade parts marked so they are not taken as real.'),
  3: form("1. Before building more, tell me: is this a quick demo to show the idea, or the real thing people will depend on?\n2. They need different care — a demo can use fake data and skip the tricky cases; the real thing needs real data, error handling, and the edge cases covered.\n3. Say which this is, and mark anything that's only demo-quality so it isn't shipped as if it were real.", 'Whether this is a demo or the real thing hasn\'t been named — demo-quality parts risk being shipped as real.'),
  4: form('Go piece by piece: mark which parts are demo-grade (fake data, no edge cases) and which must be real — real data, error states, edge cases handled — before any of it counts as ready.', 'Beyond naming it: each piece marked demo-grade or must-be-real before it ships.'),
  5: form('Write a short note: which parts are still demo-grade and which must be real — real data, error and empty states, edge cases — before the demo turns into the thing people rely on.', 'A durable note separating the demo-grade parts from what must be real to ship.'),
});

/** USER_JOURNEY_CHECK (beginner) — keyword "happen". File at col-5. */
export const USER_JOURNEY_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Beyond the normal case, name one thing: what happens when there's no data to show yet?", 'The lightest step: one missing case — what happens with no data — named.'),
  2: form('Walk the main cases — first time, nothing there yet, and something went wrong — and note what happens in each that is not handled.', 'A light pass: the first-time, empty, and error cases checked for what happens.'),
  3: form("1. The normal path works — now think about what happens around it.\n2. Tell me: what happens the first time someone uses this? What happens when there's no data yet? What happens when something goes wrong?\n3. Each of those is a case the feature has to handle — point out which ones aren't handled yet.", 'What happens in the empty, error, and first-time cases hasn\'t been mapped — handling only the normal path breaks trust.'),
  4: form('Go through the whole journey case by case — first use, nothing there yet, loading, something went wrong, and success — and for each say what happens, what the user sees, and what still is not handled.', 'Beyond three cases: what happens across the full journey mapped case by case, with the gaps named.'),
  5: form('Write a short note mapping every case in the journey — first use, empty, loading, error, success — what happens in each, and the must-handle gaps left to close.', 'A durable note mapping what happens in each case and the gaps to close.'),
});

/** TECHNICAL_SPIKE_TREATMENT (beginner) — keyword "experiment". Behavioural. */
export const TECHNICAL_SPIKE_TREATMENT_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Name what this is: an experiment to learn something, or real code you mean to keep?', 'The lightest step: the work named as an experiment-to-learn or real code-to-keep.'),
  2: form("Mark the experiment code as throwaway so it doesn't quietly drift into the real project unrewritten.", 'A light pass: the experiment marked throwaway and kept out of the real code.'),
  3: form("1. Tell me: is this code an experiment to figure out how something works, or the real version you want to keep?\n2. Experiment code is for learning — it's fine for it to be rough.\n3. But don't keep it as the real thing: once it has taught you the approach, write the real version cleanly. Rough experiment code that ships becomes a problem later.", 'Experiment code hasn\'t been kept separate from real code — rough experiment code risks being kept as the real thing.'),
  4: form('Treat the experiment as a lesson, not the product: write down what it taught you, then build the real version cleanly with a test or two — instead of keeping the experiment as-is.', 'Beyond labelling it: the experiment\'s lesson captured and the real version rewritten with tests.'),
  5: form('Make it a habit: experiment code is for learning only — never keep it as the real thing; once it has shown you the way, rewrite it properly with tests.', 'A standing habit: experiment code stays for learning and the kept version is always rewritten with tests.'),
});

/** DEPENDENCY_ADVENTURE (beginner) — keyword "package". Behavioural. SENSITIVE (inherits l2SafeguardLine). */
export const DEPENDENCY_ADVENTURE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Before adding a new package, ask: what exact problem does it solve that I can't easily do without it?", 'The lightest step: the new package justified by a specific need before adding.'),
  2: form("Check the package before adding it: the exact need, whether it's looked after, and whether something you already have covers it.", 'A light pass: the package\'s need, health, and overlap checked before adding.'),
  3: form("1. Before adding a new package or library — tell me what specific problem it solves that you can't easily solve without it.\n2. Every package you add is one more thing to keep working and updated later, even though you didn't write it.\n3. If it's only 'might be handy', skip it for now — add it when there's a real need.", 'The new package\'s necessity hasn\'t been weighed — every just-in-case package becomes upkeep later.'),
  4: form('Weigh the package honestly: the exact problem it solves, the upkeep it adds, and whether a lighter option would do — and keep it only if the need clearly beats the cost.', 'Beyond a quick check: the package weighed need-versus-cost against a lighter option.'),
  5: form("Make justify-before-adding a habit: every package has to earn its place against a real need and its ongoing upkeep before it goes in — 'might be handy' isn't enough.", 'A standing habit: each package earns its place against need and upkeep before it is added.'),
});

/** RESTART_IMPULSE_CHECK (beginner) — keyword "restart". File at col-5. */
export const RESTART_IMPULSE_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before restarting from scratch, name the one thing that actually went wrong.', 'The lightest step: the one real problem named before a restart.'),
  2: form('Pause the restart: list what is actually broken and check whether a fix is smaller than a rewrite.', 'A light pass: the restart paused while the real problems are listed and weighed.'),
  3: form("1. Before you restart and throw this away — tell me what specifically went wrong, and why.\n2. Starting over usually isn't faster: all the small fixes already in this code — the bugs you quietly solved — get thrown away too.\n3. Let's find the real problem first; a fix is often much smaller than a full restart.", 'The real problem hasn\'t been diagnosed before a restart — restarting throws away the fixes already in the code.'),
  4: form('Diagnose before restarting: what exactly broke, why, and what hard-won fixes already live in this code — then decide fix-or-restart on that evidence, not on frustration.', 'Beyond naming one issue: the breakage diagnosed and the restart weighed against what it would throw away.'),
  5: form('Write a short note before any restart: what went wrong and why, the fixes already baked into this code, and the case for fixing versus starting over — so a restart is a decision, not an impulse.', 'A durable note weighing fix-versus-restart on the evidence.'),
});

/** CREATIVE_VS_CORE_RATIO (beginner) — keyword "creative". File at col-5. */
export const CREATIVE_VS_CORE_RATIO_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Quick gut-check: is more effort going into creative extras right now than into the main product?', 'The lightest step: creative-versus-core effort sensed before the next extra.'),
  2: form('Eyeball the split: roughly how much of this session went to creative extras versus the core that users need?', 'A light pass: the creative-versus-core effort split estimated for the session.'),
  3: form("1. Before the next creative or good-looking extra — look back at this session.\n2. Tell me roughly: how much went into the core thing users actually need, versus creative or decorative extras?\n3. If the extras are winning, let's swing the effort back to the core — creative touches should support the main product, not outweigh it.", 'The split between core effort and creative effort hasn\'t been looked at — creative work risks outweighing the core.'),
  4: form('Tally it honestly: count roughly how much effort went to the core product versus creative or decorative extras, and swing it back toward the core if the extras are ahead.', 'Beyond a gut-check: the creative-versus-core effort tallied and rebalanced toward the core.'),
  5: form('Write a quick note: how much effort went to the core versus creative extras this session, where it is out of balance, and the plan to rebalance — so creative work supports the core instead of taking it over.', 'A durable note of core-versus-creative effort and the rebalance plan.'),
});
