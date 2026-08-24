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
  1: form('Quick check before starting a new feature: is the last feature actually finished and working all the way through?', "Just confirm the last feature works all the way through before the next feature starts — no deeper review needed yet."),
  2: form('Run the last feature end to end and confirm it really works before you start the next feature.', "Take the last feature through its main path and confirm it's done before the next feature begins — end to end, not just the parts you remember."),
  3: form("1. Stop before starting a new feature and look at the last one you built.\n2. Tell me: is it completely finished and working from start to end, or is part of it still undone?\n3. If anything's unfinished, let's close it out first — half-done features pile up and slow everything down later.", "Say whether the last feature is finished end to end before starting a new feature — if part is undone, close it first, because half-done features pile up."),
  4: form("Before the next feature, check the last one against a simple 'done' bar: the main path works, the obvious edge cases hold, and nothing is left half-wired — fix any gap first.", "Hold the last feature to a simple done bar — main path works, obvious edge cases hold, nothing half-wired — and fix any gap before the next feature."),
  5: form('Make it a standing habit: no new feature starts until the last feature is finished and working end to end — so unfinished work never piles up.', "Keep no-new-feature-until-the-last-is-done as a standing rule, so unfinished features never pile up."),
});

/** FINISHING_LINE_AWARENESS (beginner) — keyword "finish". Behavioural. */
export const FINISHING_LINE_AWARENESS_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Count what you have started but not finished, and push the closest one all the way to finished.', "Just push the nearest half-done thing all the way to finished before anything new — one closed out, not several left open."),
  2: form('List what is half-done, pick the one closest to finished, and finish it before opening anything new.', "Pick the item closest to finished and finish it before opening anything new — the shortest path to one done thing."),
  3: form("1. Count how many things you have started versus how many are actually finished and working.\n2. Share that with me — a thing that is half-finished helps no one yet; one finished thing beats three half-finished ones.\n3. Then pick the closest one and let's finish it before starting anything new.", "Weigh how many things are started versus finished, then finish the closest before starting anything new — one finished thing beats three half-finished ones."),
  4: form('Set a small limit on how many things can be unfinished at once, and finish what is open down to that limit before starting anything new — so half-done work shrinks instead of spreading.', "Cap how many things can be unfinished at once and finish what's open down to that cap before starting more — so half-done work shrinks instead of spreading."),
  5: form('Make finish-before-start a habit: keep only one or two things going at a time and finish each before opening the next — so work gets finished and shipped, not left half-built.', "Hold finish-before-start as the habit — one or two things going at a time, each finished before the next, so work ships instead of piling up half-built."),
});

/** POLISH_VS_FUNCTION (beginner) — keyword "polish". Behavioural. */
export const POLISH_VS_FUNCTION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before adding more polish, check that the main thing actually works from start to finish.', "Just confirm the main thing works start to finish before any more polish — function first, looks after."),
  2: form('Get the main feature working and confirmed first, then spend effort on polish — not before.', "Prove the main feature works first, then spend effort on polish — polish before that is effort at risk."),
  3: form("1. Before putting more work into polish — making it look nicer or smoother — check that the core actually works end to end.\n2. Tell me: does the main thing do its job yet, or is it still not fully working?\n3. If the core isn't working, let's fix that first — polish on top of something that doesn't work is wasted effort.", "Confirm the core works end to end before more polish — polish on top of something that doesn't work yet is wasted effort."),
  4: form("Keep the two jobs separate: get the core working and confirmed first, then do one dedicated polish pass on top — don't mix polish into a core that isn't proven yet.", "Run the core and the polish as separate passes — core working and confirmed first, then one dedicated polish pass — never mixing polish into a core that isn't proven."),
  5: form('Make function-before-polish the habit: no polish work starts until the core works end to end — so effort never lands on something that does not run yet.', "Hold function-before-polish as the habit — no polish starts until the core works end to end, so effort never lands on something that doesn't run yet."),
});

/** MVP_SCOPE_DISCIPLINE (beginner) — keyword "core". File at col-5. */
export const MVP_SCOPE_DISCIPLINE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before adding the next feature, ask one thing: does it test the core idea, or is it extra?', "Just ask whether the next feature tests the core idea or is extra before adding it — one question, not a full review."),
  2: form('Run each new feature past one test — does it prove the core idea? Keep those, set the rest aside for now.', "Put each new feature to one test — does it prove the core idea? — keeping those and setting the rest aside for now."),
  3: form("1. Look at the features you are planning to add.\n2. For each one, tell me: does it test whether the core idea actually works, or is it a nice-to-have on top?\n3. Keep the ones that test the core idea and set the rest aside — adding extras to an idea you haven't proven yet just slows you down.", "For each planned feature, say whether it tests the core idea or is a nice-to-have, and set the nice-to-haves aside — extras on an unproven core just slow you down."),
  4: form('Go through the whole feature list and mark each one core-idea or nice-to-have, then set aside everything that is not needed to find out if the core idea works.', "Split the whole feature list into core-idea and nice-to-have, setting aside everything not needed to find out if the core idea works."),
  5: form('Write a short note: the features that test the core idea, the ones set aside, and why — the cut list you build to so extras do not creep back in.', "Capture a short note — the features that test the core idea, the ones set aside, and why — the cut list to build to so extras don't creep back in."),
});

/** IDEA_TO_SPEC_BRIDGE (beginner) — keyword "plan". File at col-5. */
export const IDEA_TO_SPEC_BRIDGE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before building, write one line of plan: what is this feature supposed to do?', "Just one line of plan before building — what this feature should do — a target, not the whole spec yet."),
  2: form('Write a quick plan before building: what it does, what it does not do, and how it fits what is already there.', "Sketch a quick plan before building — what it does, what it doesn't, and how it fits what's there — enough to aim by."),
  3: form("1. Before we start building — let's turn the idea into a short plan.\n2. Tell me in a few sentences: what should this feature do, what should it NOT do, and how does it fit with what already exists?\n3. We'll build from that plan — having it written down keeps the building on track instead of wandering.", "Shape the idea into a short plan before building — what it should do, what it should NOT do, and how it fits what exists — so building stays on track instead of wandering."),
  4: form("Turn the plan into something checkable: add what it must do, what it must not do, and one concrete example of an input and the result that proves it is built right.", "Make the plan checkable — what it must do, what it must not do, and one concrete input-and-result example that proves it's built right."),
  5: form('Write the plan into a short doc: what the feature does, what it does NOT do, and how it fits — the written plan the code is then built and checked against.', "Capture the plan in a short doc — what the feature does, what it does NOT do, and how it fits — the written plan the code is built and checked against."),
});

/** DEMO_VS_PRODUCT (beginner) — keyword "demo". File at col-5. */
export const DEMO_VS_PRODUCT_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before building more, name it: is this a throwaway demo, or the real thing people will actually use?', "Just settle whether this is a throwaway demo or the real thing people will use before building more — the standard everything else follows."),
  2: form("Mark the demo parts plainly — fake data, happy-path-only — so demo work doesn't get mistaken for the real thing.", "Flag the demo parts plainly — fake data, happy-path only — so demo work isn't mistaken for the real thing."),
  3: form("1. Before building more, tell me: is this a quick demo to show the idea, or the real thing people will depend on?\n2. They need different care — a demo can use fake data and skip the tricky cases; the real thing needs real data, error handling, and the edge cases covered.\n3. Say which this is, and mark anything that's only demo-quality so it isn't shipped as if it were real.", "Say whether this is a quick demo or the real thing people depend on, and mark anything demo-quality so it isn't shipped as real — the two need different care."),
  4: form('Go piece by piece: mark which parts are demo-grade (fake data, no edge cases) and which must be real — real data, error states, edge cases handled — before any of it counts as ready.', "Split it piece by piece — which parts are demo-grade (fake data, no edge cases) and which must be real (real data, error states, edge cases) — before any counts as ready."),
  5: form('Write a short note: which parts are still demo-grade and which must be real — real data, error and empty states, edge cases — before the demo turns into the thing people rely on.', "Capture a short note — which parts are demo-grade and which must be real (real data, error and empty states, edge cases) — before the demo turns into the thing people rely on."),
});

/** USER_JOURNEY_CHECK (beginner) — keyword "happen". File at col-5. */
export const USER_JOURNEY_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Beyond the normal case, name one thing: what happens when there's no data to show yet?", "Just pin one case past the normal path — what happens when there's no data yet — the empty case first."),
  2: form('Walk the main cases — first time, nothing there yet, and something went wrong — and note what happens in each that is not handled.', "Step through the main cases — first time, nothing there yet, something went wrong — and note what happens in each that isn't handled."),
  3: form("1. The normal path works — now think about what happens around it.\n2. Tell me: what happens the first time someone uses this? What happens when there's no data yet? What happens when something goes wrong?\n3. Each of those is a case the feature has to handle — point out which ones aren't handled yet.", "Work out what happens the first time, when there's no data, and when something goes wrong — each is a case the feature must handle, so flag the ones that aren't."),
  4: form('Go through the whole journey case by case — first use, nothing there yet, loading, something went wrong, and success — and for each say what happens, what the user sees, and what still is not handled.', "Map the journey case by case — first use, empty, loading, error, success — and for each, what happens, what the user sees, and what's still unhandled."),
  5: form('Write a short note mapping every case in the journey — first use, empty, loading, error, success — what happens in each, and the must-handle gaps left to close.', "Capture a short note mapping every case in the journey — first use, empty, loading, error, success — what happens in each, and the must-handle gaps left to close."),
});

/** TECHNICAL_SPIKE_TREATMENT (beginner) — keyword "experiment". Behavioural. */
export const TECHNICAL_SPIKE_TREATMENT_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Name what this is: an experiment to learn something, or real code you mean to keep?', "Just settle whether this is an experiment to learn or real code to keep before going further — the two are handled differently."),
  2: form("Mark the experiment code as throwaway so it doesn't quietly drift into the real project unrewritten.", "Label the experiment code throwaway so it doesn't quietly drift into the real project unrewritten."),
  3: form("1. Tell me: is this code an experiment to figure out how something works, or the real version you want to keep?\n2. Experiment code is for learning — it's fine for it to be rough.\n3. But don't keep it as the real thing: once it has taught you the approach, write the real version cleanly. Rough experiment code that ships becomes a problem later.", "Say whether this is an experiment to learn or the real version to keep — experiment code can be rough, but rewrite it cleanly once it's taught you the approach rather than shipping it."),
  4: form('Treat the experiment as a lesson, not the product: write down what it taught you, then build the real version cleanly with a test or two — instead of keeping the experiment as-is.', "Keep the experiment as a lesson, not the product — write down what it taught, then build the real version cleanly with a test or two instead of keeping the experiment as-is."),
  5: form('Make it a habit: experiment code is for learning only — never keep it as the real thing; once it has shown you the way, rewrite it properly with tests.', "Hold it as a habit — experiment code is for learning only, never kept as the real thing; once it's shown the way, rewrite it properly with tests."),
});

/** DEPENDENCY_ADVENTURE (beginner) — keyword "package". Behavioural. SENSITIVE (inherits l2SafeguardLine). */
export const DEPENDENCY_ADVENTURE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Before adding a new package, ask: what exact problem does it solve that I can't easily do without it?", "Just name the exact problem the new package solves that you can't easily do without it, before adding it."),
  2: form("Check the package before adding it: the exact need, whether it's looked after, and whether something you already have covers it.", "Weigh the package before adding it — the exact need, whether it's looked after, and whether something you already have covers it."),
  3: form("1. Before adding a new package or library — tell me what specific problem it solves that you can't easily solve without it.\n2. Every package you add is one more thing to keep working and updated later, even though you didn't write it.\n3. If it's only 'might be handy', skip it for now — add it when there's a real need.", "Name the specific problem the new package solves that you can't easily solve without it — every package added is one more thing to keep working later, so skip a 'might be handy' one until there's a real need."),
  4: form('Weigh the package honestly: the exact problem it solves, the upkeep it adds, and whether a lighter option would do — and keep it only if the need clearly beats the cost.', "Judge the package honestly — the exact problem it solves, the upkeep it adds, and whether a simpler option would do — and keep it only if the need clearly beats the cost."),
  5: form("Make justify-before-adding a habit: every package has to earn its place against a real need and its ongoing upkeep before it goes in — 'might be handy' isn't enough.", "Hold justify-before-adding as the habit — every package earns its place against a real need and its ongoing upkeep before it goes in; 'might be handy' isn't enough."),
});

/** RESTART_IMPULSE_CHECK (beginner) — keyword "restart". File at col-5. */
export const RESTART_IMPULSE_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before restarting from scratch, name the one thing that actually went wrong.', "Just pin the one thing that actually went wrong before any restart from scratch — the real problem, not a vague feeling."),
  2: form('Pause the restart: list what is actually broken and check whether a fix is smaller than a rewrite.', "Hold off the restart while you list what's actually broken and check whether a fix is smaller than a rewrite."),
  3: form("1. Before you restart and throw this away — tell me what specifically went wrong, and why.\n2. Starting over usually isn't faster: all the small fixes already in this code — the bugs you quietly solved — get thrown away too.\n3. Let's find the real problem first; a fix is often much smaller than a full restart.", "Say what specifically went wrong and why before any restart — starting over throws away the small fixes already in this code, and a fix is often much smaller than a rewrite."),
  4: form('Diagnose before restarting: what exactly broke, why, and what hard-won fixes already live in this code — then decide fix-or-restart on that evidence, not on frustration.', "Work out before the restart what exactly broke, why, and what hard-won fixes already live in this code — then decide fix-or-restart on that evidence, not frustration."),
  5: form('Write a short note before any restart: what went wrong and why, the fixes already baked into this code, and the case for fixing versus starting over — so a restart is a decision, not an impulse.', "Capture a short note before any restart — what went wrong and why, the fixes already baked into this code, and the case for fixing versus starting over — so a restart is a decision, not an impulse."),
});

/** CREATIVE_VS_CORE_RATIO (beginner) — keyword "creative". File at col-5. */
export const CREATIVE_VS_CORE_RATIO_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Quick gut-check: is more effort going into creative extras right now than into the main product?', "Just a rough sense of whether creative extras are outweighing the main product right now — no exact count needed yet."),
  2: form('Eyeball the split: roughly how much of this session went to creative extras versus the core that users need?', "Estimate the split by feel — roughly what share of the session went to creative extras versus the core users need — not a precise tally yet."),
  3: form("1. Before the next creative or good-looking extra — look back at this session.\n2. Tell me roughly: how much went into the core thing users actually need, versus creative or decorative extras?\n3. If the extras are winning, let's swing the effort back to the core — creative touches should support the main product, not outweigh it.", "Compare, for this session, how much went to the core users need versus creative or decorative extras — if the extras are winning, swing effort back so creative touches support the product, not outweigh it."),
  4: form('Tally it honestly: count roughly how much effort went to the core product versus creative or decorative extras, and swing it back toward the core if the extras are ahead.', "Base the tally on rough effort counts — core product versus creative or decorative extras — and swing it back toward the core if the extras are ahead."),
  5: form('Write a quick note: how much effort went to the core versus creative extras this session, where it is out of balance, and the plan to rebalance — so creative work supports the core instead of taking it over.', "Capture a quick note — core effort versus creative extras this session, where it's out of balance, and the rebalance plan — so creative work supports the core instead of taking it over."),
});
