/**
 * Class-8 role-cluster `_BEGINNER` register overrides (all 35 signals).
 *
 * Class 8 is single-register in the frozen content (23 casual founder/indie + 12 formal
 * product-manager) with NO frozen beginner variant for any signal. Per USER decision
 * (option 2, full scope) every one of the 35 gets a fresh structurally-divergent beginner
 * override. Because there is no frozen beginner headline, col-3 is authored as the
 * beginner-voice EXPRESSION of the same shipped practice the casual/formal headline
 * carries — same named practice and intent, jargon/citations and team-jargon translated
 * into plain beginner language (a "stakeholder" becomes "whoever has a say", "notify the
 * team" becomes "tell the people who use this shared part", a "sprint retrospective"
 * becomes "look back at this work"), never dropped or distorted. Each column carries the
 * signal's own plain keyword.
 *
 * F2 split mirrors the base: 30 produce a written note at col-5; 5 stay behavioural
 * (product-direction check, manual-first, early-user-feedback, solo-maintainability,
 * build-in-public). Four signals are intrinsically sensitive (LAUNCH_STRATEGY,
 * BUILD_IN_PUBLIC, STAKEHOLDER_ALIGNMENT, CROSS_TEAM_IMPACT); the override inherits the
 * base record's l2SafeguardRequired + l2SafeguardLine (it only swaps levelForms), so the
 * engine appends the confirm-seek to every served beginner column. Attached via
 * registerOverrides.beginner.
 */

import type { LevelForm, RegisterOverride, MaturityLevel } from '../content-template-schema.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}
function structural(levelForms: Partial<Record<MaturityLevel, LevelForm>>): RegisterOverride {
  return { divergence: 'structurally-divergent', levelForms };
}

// ── CASUAL-anchored (23 — founder / indie) ──────────────────────────────────────

/** USER_VALUE_CHECK (beginner) — keyword "want". File. */
export const USER_VALUE_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before building this, name one real sign that someone actually wants it — a request, a complaint, something you saw them do.', "Just one real sign that someone actually wants this — a request, a complaint, something you saw them do — before building."),
  2: form('Gather the signs you have that people want this — messages, conversations, things you have watched them struggle with — and judge whether they are real.', "Weigh the signs you have that people want this — messages, conversations, things you've watched them struggle with — for whether they're real."),
  3: form("1. Before building this, ask: do I have a real sign that people actually want it?\n2. Tell me what you have — a request, a complaint, something you watched someone do — or admit it is just a hunch.\n3. The biggest waste is building something nobody asked for, so let's check there is a real want first.", "Point to a real sign that people want this — a request, a complaint, something you watched someone do — before building, since the biggest waste is building what nobody asked for."),
  4: form('Separate real signs from your own assumption: if the only thing saying people want this is your gut, go get one real piece of evidence — ask one user — before building.', "Tell real signs that people want this from your own gut — if the only sign is a hunch, get one real piece of evidence (ask one user) before building."),
  5: form('Write a short note: the signs people want this, how strong each one is, and the gap to fill — so the build rests on evidence that someone wants it, not a guess.', "Capture a short note — the signs people want this, how strong each is, and the gap to fill — so the build rests on evidence someone wants it, not a guess."),
});

/** OUTCOME_DEFINITION (beginner) — keyword "success". File. */
export const OUTCOME_DEFINITION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Before building, write one line: this is a success if [what a user does] changes.", "Just the one-line success before building — the change in what a user does that would mean it worked."),
  2: form('Say what success looks like for this — the change in what a user does, not just the thing shipped — and how you would notice it.', "Name what success looks like for this — the change in what a user does, not just the thing shipped — and how you'd notice it."),
  3: form("1. Before building, finish this sentence: \"This is a success if ___.\"\n2. Tell me the change in what a user actually does that would mean it worked — not just that you shipped it.\n3. Without that, you can't tell later whether it worked or know when it's done enough to ship.", "Finish 'This is a success if ___' with the change in what a user actually does — not that you shipped it — so you can tell later whether it worked and when it's done enough."),
  4: form('Make success something you can actually see: name the change, the rough sign that proves it happened, and the point where it is done enough to ship.', "Turn success into something visible — the change, the rough sign it happened, and the point it's done enough to ship — not just a sentence."),
  5: form('Write a short success note: the success sentence, the user change it targets, the sign that confirms it, and the ship point — what you judge ship-or-not against.', "Capture a short success note — the success sentence, the user change it targets, the sign that confirms it, and the ship point — what you judge ship-or-not against."),
});

/** FEATURE_PRIORITIZATION (beginner) — keyword "first". File. */
export const FEATURE_PRIORITIZATION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before building this, name one reason it should be built first, ahead of the next thing you could build.', "Just one reason this should be built first, ahead of the next thing you could build — before building it."),
  2: form('Compare this against one or two other things you could build, and pick what to do first by which helps users most for the same effort.', "Weigh this against one or two other things you could build, and pick what to do first by which helps users most for the same effort."),
  3: form("1. Before building this, ask: is it really the thing to do first?\n2. Tell me what else you could build with the same time, and why this one helps users more.\n3. Building whatever comes to mind first — instead of what helps most — quietly wastes your time.", "Ask whether this is really the thing to do first — what else you could build with the same time, and why this helps users more — since building whatever comes to mind first quietly wastes time."),
  4: form('Rank by evidence, not gut: score this and the main alternatives on how much each helps users versus how much work each is, and do the highest-value one first.', "Score this and the main alternatives by how much each helps users versus the work each is, and do the highest-value one first — evidence, not gut."),
  5: form('Write a short note: the things you could build ranked by how much they help and how much work they are, which you picked to do first, and why — so build order follows value.', "Capture a short note — the things you could build ranked by help and work, which you picked to do first, and why — so build order follows value."),
});

/** USER_PERSONA_CLARITY (beginner) — keyword "person". File. */
export const USER_PERSONA_CLARITY_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Name the one specific person this is for in a line — who they are and what they're trying to do.", "Just the one specific person this is for, in a line — who they are and what they're trying to do."),
  2: form('Describe the person this is for: who they are, where they use it, and the goal it helps them reach.', "Pin the person this is for — who they are, where they use it, and the goal it helps them reach."),
  3: form("1. Name the one specific person this feature is for — give them a name, even.\n2. Tell me who they are, where they'd use this, and what they're trying to get done.\n3. Make it concrete enough that you can test a choice with \"would this person get it?\" instead of \"would people in general?\".", "Pick the one specific person this is for — who they are, where they'd use it, what they want done — concrete enough to test a choice with 'would this person get it?' not 'would people in general?'"),
  4: form("Test the person against real choices: take two design decisions here and check each against this person — what they'd accept, what they'd reject — and fix the ones that only make sense for \"people in general\".", "Check two design choices here against this person — what they'd accept, what they'd reject — and fix the ones that only make sense for 'people in general'."),
  5: form("Write a short note on this person: who they are, their setting, their goal, and what they'd reject — the anchor every design choice is tested against.", "Capture a short note on this person — who they are, their setting, their goal, and what they'd reject — the anchor every design choice is tested against."),
});

/** COMPETITIVE_AWARENESS (beginner) — keyword "other". File. */
export const COMPETITIVE_AWARENESS_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before building this, check one thing: do other tools already do it, and how?', "Just one check before building this — do other tools already do it, and how?"),
  2: form('Look at the main other tools that do this: who has it, and roughly how well they do it.', "Scan the main other tools that do this — who has it, and roughly how well."),
  3: form("1. Before building this, look at whether other tools already do it.\n2. Tell me who does, and roughly how well — you might be re-solving a solved problem, maybe worse.\n3. Then tell me: what would make yours a reason for someone to switch, not just the same thing again?", "Check whether other tools already do this and how well — you might be re-solving a solved problem, maybe worse — then name what would make yours a reason to switch, not just the same thing again."),
  4: form('Study the other tools properly: how they do it, where they fall short, and the one thing that would make yours a real reason to switch — not just matching them.', "Take apart the other tools — how they do it, where they fall short, and the one thing that makes yours a real reason to switch, not just matching them."),
  5: form('Write a short note: which other tools already solve this, how, where they are weak, and your one difference — so you improve on them instead of re-doing it worse.', "Capture a short note — which other tools already solve this, how, where they're weak, and your one difference — so you improve on them instead of re-doing it worse."),
});

/** MVP_BOUNDARY_DISCIPLINE (beginner) — keyword "core". File. */
export const MVP_BOUNDARY_DISCIPLINE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before adding this, ask: does it help test the core thing you are unsure about, or is it extra?', "Just whether this addition helps test the core thing you're unsure about, or is extra — asked before adding it."),
  2: form('Test this addition against the core: keep it only if it helps answer the riskiest thing you are unsure about; otherwise set it aside.', "Put this addition against the core — keep it only if it helps answer the riskiest thing you're unsure about, else set it aside."),
  3: form("1. Name the core thing your first version is meant to find out — the riskiest unknown.\n2. Tell me: does this addition help answer that, or is it a nice extra on top?\n3. If it doesn't help answer it, let's set it aside until the core idea is proven.", "Pin the core thing your first version must find out — the riskiest unknown — and say whether this addition helps answer it or is a nice extra; if it doesn't, set it aside until the core is proven."),
  4: form('Draw the line clearly: list what the first version must prove, mark this addition as needed-now or later, and set aside everything that does not help answer the core unknown.', "Set the line clearly — list what the first version must prove, mark this addition needed-now or later, and set aside everything that doesn't help answer the core unknown."),
  5: form('Write a short note: the core thing to prove, the smallest set that tests it, and the extras set aside — the line the build holds to so it does not over-build.', "Capture a short note — the core thing to prove, the smallest set that tests it, and the extras set aside — the line the build holds to so it doesn't over-build."),
});

/** USER_ACQUISITION_CONSIDERATION (beginner) — keyword "find". File. */
export const USER_ACQUISITION_CONSIDERATION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before building this, name one way a real user would actually find it and start using it.', "Just one way a real user would actually find this and start using it — named before building."),
  2: form('Sketch how users find this: where they come from and what draws them in to try it.', "Map how users find this — where they come from and what draws them in to try it."),
  3: form("1. Before building this, ask: how will a real user actually find it?\n2. Tell me the way in — search, a link someone shares, something inside the app, a post somewhere.\n3. A feature nobody finds is worth nothing, so let's name the path to it before building.", "Name how a real user actually finds this — search, a shared link, something inside the app, a post somewhere — since a feature nobody finds is worth nothing."),
  4: form('Design the way in: pick the one route users come through and shape the build so a new user finds it — instead of hoping they will after launch.', "Build the way in — pick the one route users come through and shape it so a new user finds this, instead of hoping they will after launch."),
  5: form('Write a short note: the route users come through to find this, the hook that draws them, and how the build supports it — so the feature reaches people instead of staying hidden.', "Capture a short note — the route users come through to find this, the hook that draws them, and how the build supports it — so the feature reaches people instead of staying hidden."),
});

/** RETENTION_MECHANISM_CHECK (beginner) — keyword "return". File. */
export const RETENTION_MECHANISM_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before building this, name one reason a user would return to it after the first time.', "Just one reason a user would return to this after the first time — named before building."),
  2: form('Sketch why users return: what pulls them back, and how using it once makes the next time more likely.', "Pin why users return — what pulls them back, and how using it once makes the next time more likely."),
  3: form("1. Before building this, ask: why would someone return to it after using it once?\n2. Tell me the reason they'd come back — and how one use makes the next more likely.\n3. Something people use once and never return to brings in users but doesn't keep them.", "Name why someone returns to this after using it once — and how one use makes the next more likely — since something people use once and never return to brings users in but doesn't keep them."),
  4: form('Pick the one thing that reliably makes people return — a reminder, saved progress, a streak — design that single return loop well, and name the return rate it should move.', "Choose the one thing that reliably makes people return — a reminder, saved progress, a streak — design that single return loop well, and name the return rate it should move."),
  5: form('Write a short note: the reason users return, the repeat value, the loop that builds up, and the return rate it should move — so the feature keeps people, not just attracts them once.', "Capture a short note — the reason users return, the repeat value, the loop that builds up, and the return rate it should move — so the feature keeps people, not just attracts them once."),
});

/** FEEDBACK_LOOP_ESTABLISHMENT (beginner) — keyword "measure". File. */
export const FEEDBACK_LOOP_ESTABLISHMENT_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Before shipping, name one thing you'll measure to know whether this worked.", "Just one thing you'll measure to know whether this worked — set before shipping."),
  2: form('Decide how you will measure this after it ships — what to measure and where you will see it — before it goes out.', "Settle how you'll measure this after it ships — what to measure and where you'll see it — before it goes out."),
  3: form("1. Before shipping this, decide how you'll measure whether it actually worked.\n2. Tell me the one thing to measure and where you'd see it.\n3. Shipping with no way to measure means you spent the effort and never learn if it paid off.", "Decide the one thing to measure and where you'd see it before shipping — shipping with no way to measure means you spent the effort and never learn if it paid off."),
  4: form('Tie the measure to a decision: name what to measure, where the number shows up, and what you would do for each result — so shipping produces a lesson, not just code.', "Wire the measure to a decision — what to measure, where the number shows up, and what you'd do for each result — so shipping produces a lesson, not just code."),
  5: form('Write a short note: what this must move, how you measure it, where the number lands, and the next decision each result triggers — the loop that turns the build into a lesson.', "Capture a short note — what this must move, how you measure it, where the number lands, and the next decision each result triggers — the loop that turns the build into a lesson."),
});

/** HYPOTHESIS_BEFORE_BUILD (beginner) — keyword "guess". File. */
export const HYPOTHESIS_BEFORE_BUILD_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Before building, write your guess in one line: '[this change] will cause [this result] for [this user].'", "Just your one-line guess before building — '[this change] will cause [this result] for [this user].'"),
  2: form('State your guess: the change, the result you expect, the user it is for, and the sign you would watch for.', "Set out your guess — the change, the result you expect, the user it's for, and the sign you'd watch for."),
  3: form("1. Before building, write your guess: \"This change will cause this result for this user.\"\n2. Tell me the sign you'd watch for, and by when you'd expect to see it.\n3. If you can't fill a part of that, that gap is the thing to sort out before building.", "Write your guess — 'this change will cause this result for this user' — with the sign you'd watch for and by when; any part you can't fill is the thing to sort out before building."),
  4: form('Add the could-be-wrong part to your guess: besides the sign it worked, say the result that would prove the guess WRONG and the point where you would stop or change course — so it can actually fail, not just confirm.', "Give your guess a could-be-wrong part — besides the sign it worked, the result that would prove the guess WRONG and the point you'd stop or change course — so it can actually fail, not just confirm."),
  5: form('Write a short note: the guessed change, the result you expect, the user, the sign that proves it, the timeframe, and the result that would prove it wrong — the claim the build is judged against.', "Capture a short note — the guessed change, the result you expect, the user, the sign that proves it, the timeframe, and the result that would prove it wrong — the claim the build is judged against."),
});

/** TECHNICAL_VS_PRODUCT_TIME_BALANCE (beginner) — keyword "direction". Behavioural. */
export const TECHNICAL_VS_PRODUCT_TIME_BALANCE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Pause and do a quick direction check: is this still the right thing to build for the right user?', "Just a quick direction check — is this still the right thing to build for the right user? — before continuing."),
  2: form('Look back at recent work: was it all coding and no direction thinking? If so, answer one direction question before continuing.', "Check recent work — was it all coding and no direction thinking? — and if so, answer one direction question before continuing."),
  3: form("1. Stop coding for a minute and look at your last several prompts.\n2. Tell me: were they almost all \"build this\" with no \"is this the right thing to build?\" — that's a direction drift.\n3. If so, answer one direction question — right thing, right user, right result — before more code.", "Look at your last several prompts — were they almost all 'build this' with no 'is this the right thing to build?' — and if that's a direction drift, answer one direction question (right thing, right user, right result) before more code."),
  4: form('Set a rough direction balance and act on it: decide how much should be building versus direction-thinking, and when a long coding stretch breaks it, write the one direction decision to make before more code.', "Pick a rough direction balance — how much should be building versus direction-thinking — and when a long coding stretch breaks it, write the one direction decision to make before more code."),
  5: form('Make the direction check a habit: every long heads-down coding stretch pauses for a direction check on the thing, the user, and the result — so the build stays pointed the right way.', "Hold the direction check as a habit — every long heads-down coding stretch pauses for a direction check on the thing, the user, and the result — so the build stays pointed the right way."),
});

/** NORTH_STAR_ALIGNMENT (beginner) — keyword "goal". File. */
export const NORTH_STAR_ALIGNMENT_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before building this, link it to the one big goal in a step — how does it move that goal?', "Just this linked to the one big goal in a step — how does it move that goal? — before building."),
  2: form('Connect this to the one big goal: say how it moves the goal directly, or what it enables that does.', "Tie this to the one big goal — how it moves the goal directly, or what it enables that does."),
  3: form("1. Name the one big goal your product is really chasing.\n2. Tell me how this feature moves that goal — directly, or by enabling something else that does.\n3. If you can't connect it to the goal at all, that's a sign to drop it or set it aside.", "Pin the one big goal your product is chasing and how this feature moves it — directly, or by enabling something that does — and if it can't connect at all, that's a sign to drop or set it aside."),
  4: form('Size the link, do not just claim it: estimate how much this should move the goal and over what time, and rank it against the other things you could build by that — so a real-but-tiny link gets caught too.', "Estimate the link, don't just claim it — how much this should move the goal and over what time — and rank it against the other things you could build, so a real-but-tiny link gets caught too."),
  5: form('Write a short note: the feature, the goal it moves, the path (direct or enabling), how much it should move it, and how it ranks against alternatives — so the work stays tied to the big goal.', "Capture a short note — the feature, the goal it moves, the path (direct or enabling), how much it should move it, and how it ranks against alternatives — so the work stays tied to the big goal."),
});

/** TIME_TO_VALUE_CHECK (beginner) — keyword "simple". File. */
export const TIME_TO_VALUE_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Before building, pick the simplest thing that solves this at today's number of users.", "Just the simplest thing that solves this at today's number of users — picked before building."),
  2: form('Match the build to today\'s size: name how many users you have now and the simplest approach that handles that, leaving heavier setups for later.', "Fit the build to today's size — how many users you have now and the simplest approach that handles that, leaving heavier setups for later."),
  3: form("1. Name roughly how many users you have right now.\n2. Tell me the simplest thing that solves this at that size — a basic query, one call, a plain file.\n3. Building for huge scale you don't have yet just slows you down — keep it simple until the size actually needs more.", "Take roughly how many users you have now and the simplest thing that solves this at that size — a basic query, one call, a plain file — since building for huge scale you don't have yet just slows you down."),
  4: form('Size it against real numbers, not hoped-for ones: name today\'s user count, pick the simplest thing that works there, and note the point at which more complexity would actually be needed.', "Judge it against real numbers, not hoped-for ones — today's user count, the simplest thing that works there, and the point at which more complexity would actually be needed."),
  5: form('Write a short note: today\'s size, the simplest thing that fits it, and the point that would justify more — so complexity arrives when the size needs it, not before.', "Capture a short note — today's size, the simplest thing that fits it, and the point that would justify more — so complexity arrives when the size needs it, not before."),
});

/** SHIP_READINESS_DEFINITION (beginner) — keyword "ship". File. */
export const SHIP_READINESS_DEFINITION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before adding more, write one clear yes/no thing that must be true to ship this.', "Just one clear yes/no thing that must be true to ship this — written before adding more."),
  2: form('List the must-be-true things to ship this — each a plain yes/no you can check — before adding more on top.', "Set down the must-be-true things to ship this — each a plain, checkable yes/no — before adding more on top."),
  3: form("1. Before adding more, write down what must be true to ship this — as plain yes/no checks.\n2. Tell me each one (\"a user can sign up\", \"the main flow works start to finish\").\n3. That list is your finish line; everything past it is for after you ship.", "Write what must be true to ship this as plain yes/no checks — 'a user can sign up', 'the main flow works start to finish' — that list is your finish line; everything past it is for after you ship."),
  4: form('Turn ship-readiness into a checklist: each item a plain yes/no you can test, with anything beyond it marked clearly as after-ship — so "ready to ship" is a checklist, not a feeling.', "Make ship-readiness a checklist — each item a plain, testable yes/no, anything beyond it marked clearly as after-ship — so 'ready to ship' is a checklist, not a feeling."),
  5: form('Write a short note: the yes/no conditions that mean ready-to-ship, the things saved for after ship, and where each stands now — the finish line that ends "not ready to ship yet".', "Capture a short note — the yes/no conditions that mean ready-to-ship, the things saved for after ship, and where each stands now — the finish line that ends 'not ready to ship yet'."),
});

/** MANUAL_BEFORE_AUTOMATE (beginner) — keyword "hand". Behavioural. */
export const MANUAL_BEFORE_AUTOMATE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before automating this, do it by hand once and see what actually happens.', "Just do this by hand once and see what actually happens, before automating it."),
  2: form('Do this by hand for the first few users, noting where your idea of how it works was wrong, before you build the automation.', "Run this by hand for the first few users — noting where your idea of how it works was wrong — before you build the automation."),
  3: form("1. Before you automate this, do it by hand a few times for the first users.\n2. Tell me what actually happened versus what you expected — by-hand always surprises you.\n3. Then automate only the version you've proven by hand, not the one you imagined.", "Do this by hand a few times for the first users, compare what actually happened to what you expected — by-hand always surprises you — then automate only the version you've proven by hand."),
  4: form('Track the by-hand runs to find what is worth automating: note where each is slow or repetitive, and automate only the one step the runs show is the real bottleneck — not the whole thing on a guess.', "Watch the by-hand runs to find what's worth automating — where each is slow or repetitive — and automate only the one step the runs show is the real bottleneck, not the whole thing on a guess."),
  5: form('Make by-hand-first a habit: run every new process by hand until you understand it, and only automate the proven version — so automation never locks in a wrong guess.', "Hold by-hand-first as a habit — run every new process by hand until you understand it, and only automate the proven version — so automation never locks in a wrong guess."),
});

/** TECH_STACK_COMPLEXITY_CHECK (beginner) — keyword "alone". File. */
export const TECH_STACK_COMPLEXITY_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before adding to your tools, ask: can I look after this alone, or is it just impressive?', "Just whether you can look after this alone, or it's only impressive — asked before adding to your tools."),
  2: form('Weigh this tool choice for looking after it alone: the fixing, extending, and re-learning you will do on your own.', "Judge this tool choice for looking after it alone — the fixing, extending, and re-learning you'll do on your own."),
  3: form("1. Before adding a new tool or framework, remember you'll look after it alone.\n2. Tell me: can you fix it alone at 2am, extend it later, and understand it after months away?\n3. The right question isn't \"is this impressive?\" — it's \"is this the simplest thing I can keep running alone?\".", "Remember you'll look after a new tool alone — can you fix it alone at 2am, extend it later, understand it after months away? — the right question isn't 'is this impressive?' but 'is this the simplest thing I can keep running alone?'"),
  4: form('Compare tools on upkeep, not power: pick the simplest one you can fix alone, and only add a more complex one for a need you actually have right now.', "Weigh tools on upkeep, not power — pick the simplest one you can fix alone, and only add a more complex one for a need you actually have right now."),
  5: form('Write a short note: the tool you picked, the simpler option, the upkeep each one puts on you alone, and why your pick is one you can keep running alone — so the tools stay maintainable, not impressive.', "Capture a short note — the tool you picked, the simpler option, the upkeep each puts on you alone, and why your pick is one you can keep running alone — so the tools stay maintainable, not impressive."),
});

/** LAUNCH_STRATEGY_ABSENCE (beginner) — keyword "launch". File. SENSITIVE. */
export const LAUNCH_STRATEGY_ABSENCE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before shipping, name one place where you will announce this launch.', "Just one place where you'll announce this launch — named before shipping."),
  2: form('Sketch a small launch plan: the place to post, a draft of what you will say, and who should see it.', "Draft a small launch plan — the place to post, a draft of what you'll say, and who should see it."),
  3: form("1. Before shipping, make a small launch plan — shipping with no plan means launching to silence.\n2. Tell me one place you'll announce it, write the post before launch day, and name who in your circle should see it.\n3. That's a launch plan: one place, one written post, the people to reach.", "Make a small launch plan — one place to announce, the post written before launch day, and who in your circle should see it — since shipping with no plan means launching to silence."),
  4: form('Put the launch in order to run it: line up the places to post, write each one, list the specific people to tell on the day, and decide what you do if the first place falls flat.', "Order the launch to run it — line up the places to post, write each, list the specific people to tell on the day, and decide what you do if the first place falls flat."),
  5: form('Write a short launch note: the places to announce in order, the drafted posts, the people to reach, the day-of order, and the fallback if a place falls flat — the plan that keeps the launch from going out to silence.', "Capture a short launch note — the places to announce in order, the drafted posts, the people to reach, the day-of order, and the fallback if a place falls flat — the plan that keeps the launch from going out to silence."),
});

/** EARLY_USER_FEEDBACK (beginner) — keyword "show". Behavioural. */
export const EARLY_USER_FEEDBACK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before building more, show what you have to one real user and watch what they do.', "Just show what you have to one real user and watch what they do, before building more."),
  2: form('Show the build to a real user today — a quick screen-share or walk-through — and note what they actually do, not what you hoped.', "Put the build in front of a real user today — a quick screen-share or walk-through — and note what they actually do, not what you hoped; show it, don't describe it."),
  3: form("1. Before building more, show what you have to one real user today.\n2. A 10-minute screen-share or a quick recording is enough — watch what they actually do.\n3. Tell me their real reaction, not your read of it, and let's adjust from what you saw.", "Show what you have to one real user today — a 10-minute screen-share or quick recording is enough — watch what they actually do, and tell me their real reaction, not your read of it."),
  4: form("Watch a user use it with no help from you — don't show them how — note where they pause or go wrong, keep their real reaction separate from your read of it, and change direction from what you saw.", "Observe a user using it with no help — don't show them how — note where they pause or go wrong, keep their real reaction separate from your read, and change direction from what you saw."),
  5: form('Make showing it to a real user a regular habit: put the build in front of someone on a steady rhythm and steer from their reactions — so the work never drifts back into a bubble.', "Hold showing it to a real user as a regular habit — put the build in front of someone on a steady rhythm and steer from their reactions — so the work never drifts back into a bubble."),
});

/** SOLO_MAINTAINABILITY (beginner) — keyword "own". Behavioural. */
export const SOLO_MAINTAINABILITY_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before adding this, ask: when it breaks, can I own and fix the whole thing alone? Keep it that way.', "Just whether you can own and fix the whole thing alone when it breaks — kept that way before adding this."),
  2: form('Weigh what you would own with this addition: the fixing, extending, and re-learning you would carry alone with no one to help.', "Count what you'd own with this addition — the fixing, extending, and re-learning you'd carry alone, no one to help."),
  3: form("1. Before adding this — a service, an integration, an extra layer — remember you own it alone.\n2. Tell me: when it breaks, can you own the whole mess and fix it yourself, with no one to ask?\n3. If fixing it means reading docs for 30 minutes every time it breaks, that cost is real and never stops.", "Before adding a service, integration, or extra layer, ask whether you can own the whole mess and fix it yourself when it breaks — if fixing it means reading docs for 30 minutes each time, that cost is real and never stops."),
  4: form('Weigh it against going without: compare what you would own with this addition to the simplest version — or nothing at all — and keep it only if what it gives you clearly beats owning it alone forever.', "Set this addition against going without — what you'd own with it versus the simplest version or nothing at all — and keep it only if what it gives clearly beats owning it alone forever."),
  5: form('Make solo-ownership a habit: only add a service or layer you can fix and extend alone — so the project stays something one person can own.', "Hold solo-ownership as a habit — only add a service or layer you can fix and extend alone — so the project stays something one person can own."),
});

/** DISTRIBUTION_THINKING (beginner) — keyword "discover". File. */
export const DISTRIBUTION_THINKING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before building this, name how a new person discovers it exists in the first place.', "Just how a new person discovers this exists in the first place — named before building."),
  2: form('Sketch how people discover this: the path a brand-new person takes to find it and reach it the first time.', "Map how people discover this — the path a brand-new person takes to find it and reach it the first time."),
  3: form("1. Before building this, ask how a brand-new person would even discover it exists.\n2. Tell me the path — search, a share button, a link in a community, something inside the app.\n3. Counting on people to discover it by magic is how good features go unseen, so design the path in.", "Name the path a brand-new person takes to discover this exists — search, a share button, a community link, something inside the app — since counting on people to discover it by magic is how good features go unseen."),
  4: form('Pick the one way people discover it and build it for real: trace a brand-new person from that path to first use, and build the specific hook that carries them across — one path made real, not five listed.', "Choose the one way people discover it and build it for real — trace a brand-new person from that path to first use, and build the specific hook that carries them across, one path made real, not five listed."),
  5: form('Write a short note: how a new person discovers this and reaches first use, the in-app bits that support it, and where the build must change — so it can be discovered by design.', "Capture a short note — how a new person discovers this and reaches first use, the in-app bits that support it, and where the build must change — so it can be discovered by design."),
});

/** MONETIZATION_PATH_CLARITY (beginner) — keyword "money". File. */
export const MONETIZATION_PATH_CLARITY_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before building this, name how it connects to making money — even indirectly.', "Just how this connects to making money, even indirectly — named before building."),
  2: form('Say how this connects to money: it earns directly, or it keeps users around so they pay longer — not just "it makes the product nicer".', "Name how this connects to money — it earns directly, or it keeps users around so they pay longer — not just 'it makes the product nicer'."),
  3: form("1. Before building this, ask how it connects to making money.\n2. It needn't be direct — \"it keeps users around, so they stay paying\" counts.\n3. But \"it makes the product nicer\" doesn't — that's how you end up with a lovely product that never earns. Tell me the real link.", "Answer how this connects to making money — 'it keeps users around, so they stay paying' counts; 'it makes the product nicer' doesn't, that's how you end up with a lovely product that never earns."),
  4: form('Tie the money link to a specific lever: say whether this brings new paying users, keeps existing ones, or grows what they pay, and roughly how much — and if it moves none, decide build-now or later.', "Pin the money link to a specific lever — whether this brings new paying users, keeps existing ones, or grows what they pay, and roughly how much — and if it moves none, decide build-now or later."),
  5: form('Write a short note: the feature, the specific money lever it moves (directly or by keeping users), the rough size, and the build-or-later call — so the product earns by design, not free by accident.', "Capture a short note — the feature, the specific money lever it moves (directly or by keeping users), the rough size, and the build-or-later call — so the product earns by design, not free by accident."),
});

/** BUILD_IN_PUBLIC_OPPORTUNITY (beginner) — keyword "public". Behavioural. SENSITIVE. */
export const BUILD_IN_PUBLIC_OPPORTUNITY_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Think about sharing this milestone in public — a short post on what you shipped and learned.', "Just a short public post on this milestone — what you shipped and learned — considered before moving on."),
  2: form('Draft a short public post on this milestone — what you shipped, what you learned — to put in front of people.', "Put together a short public post on this milestone — what you shipped, what you learned — for people to see."),
  3: form("1. Think about sharing this milestone in public today — a short post, a quick clip, a community update.\n2. Say what you just shipped and what you learned.\n3. People who follow you during the build stick around through a rough launch; people you only reach at launch don't.", "Share this milestone in public today — a short post, a quick clip, a community update — saying what you shipped and learned, since people who follow you during the build stick around through a rough launch and people you only reach at launch don't."),
  4: form('Make the public post worth following: show the real progress and the lesson, not just the win, so people who follow the build gather before launch day — when it matters most.', "Give the public post something worth following — the real progress and the lesson, not just the win — so people who follow the build gather before launch day, when it matters most."),
  5: form('Make building in public a habit: share milestones and lessons in public as you go, so a following builds up during the build and stays through a bumpy launch.', "Hold building in public as a habit — share milestones and lessons in public as you go — so a following builds up during the build and stays through a bumpy launch."),
});

/** SCOPE_VS_TIME_CHECK (beginner) — keyword "time". File. */
export const SCOPE_VS_TIME_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before adding more, check the work against the time you have: is the ship date still realistic with this much in?', "Just the work checked against the time you have — is the ship date still realistic with this much in? — before adding more."),
  2: form('Compare what is left to the time you have: estimate the real finish date at this pace against the date you wanted.', "Weigh what's left against the time you have — the real finish date at this pace against the date you wanted."),
  3: form("1. Before adding more, look at how much is now in this versus the time you have.\n2. Tell me roughly when it'd really be done at this pace, against the date you wanted.\n3. If the date has slipped twice already, cut something to fit the time — and name exactly what moves to later.", "Look at how much is now in this versus the time you have, estimate when it'd really be done at this pace against the date you wanted, and if the date has slipped twice, cut something to fit the time and name exactly what moves to later."),
  4: form('Trade work against time on purpose: if the date has slipped twice, cut enough to fit the original time and name exactly what moves to later — instead of letting it quietly grow.', "Cut work against time on purpose — if the date has slipped twice, trim enough to fit the original time and name exactly what moves to later — instead of letting it quietly grow."),
  5: form('Write a short note: how much is in this now, the real finish date, the gap, and what you cut to hold the time — so the work and the schedule stay honest with each other.', "Capture a short note — how much is in this now, the real finish date, the gap, and what you cut to hold the time — so the work and the schedule stay honest with each other."),
});

// ── FORMAL-anchored (12 — product-manager, translated to plain beginner terms) ──

/** ACCEPTANCE_CRITERIA_BEFORE_DEV (beginner) — keyword "check". File. */
export const ACCEPTANCE_CRITERIA_BEFORE_DEV_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before building, write one thing you could check to know this is actually done.', "Just one thing to check to know this is actually done — written before building."),
  2: form('Write the main things you would check to know this works — each a plain yes/no — before any building.', "Set out the main things to check to know this works — each a plain yes/no — before any building."),
  3: form("1. Before building, write down what you'd check to know this is done right.\n2. Put each as something you can plainly test (\"when I do X, Y happens\") — at least three, covering the normal case and the most likely tricky one.\n3. Share them with me first — they're the target you build toward.", "Write what to check to know this is done right — each as something plainly testable ('when I do X, Y happens'), at least three covering the normal case and the most likely tricky one — the target you build toward."),
  4: form('Pair each check with how you confirm it — the test or the manual step that proves it — and add one thing that must NOT happen, so the checks drive testing, not just describe.', "Attach to each check how you confirm it — the test or manual step that proves it — plus one thing that must NOT happen, so the checks drive testing, not just describe."),
  5: form('Write a short note: each thing to check as a plain testable condition, how each is confirmed, and one must-not-happen — across the normal case and the tricky ones — the target you build and check against.', "Capture a short note — each thing to check as a plain testable condition, how each is confirmed, and one must-not-happen — across the normal case and the tricky ones — the target you build and check against."),
});

/** STAKEHOLDER_ALIGNMENT_CHECK (beginner) — keyword "agree". File. SENSITIVE. */
export const STAKEHOLDER_ALIGNMENT_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before building, name the one person whose agreement this most needs — whoever has a real say in it.', "Just the one person whose agreement this most needs — whoever has a real say — named before building."),
  2: form('List the people who have a say in this and what each needs to agree to — a yes, a quick review, or just a heads-up — before building.', "Name the people who have a say in this and what each needs to agree to — a yes, a quick review, or a heads-up — before building."),
  3: form("1. Before building, list everyone with a real say in this — whoever asked for it, whoever it affects, whoever pays.\n2. Tell me what each one needs from you: a yes, a look at the design, a quick check.\n3. Get those before building — finding out at the end that someone disagrees means redoing the work.", "List everyone with a real say in this — whoever asked for it, whoever it affects, whoever pays — and what each needs to agree (a yes, a design look, a quick check); getting those before building beats finding out at the end that someone disagrees and redoing the work."),
  4: form('Sort the agreement by risk: spot the one person most likely to say no, get their agreement before you sink time in, and surface any two people who want different things so they can be settled first.', "Order the agreement by risk — spot the one person most likely to say no, get their agreement before you sink time in, and surface any two people who want different things so they can be settled first."),
  5: form('Write a short note: each person who has a say, in risk order, what they need to agree to, when, the outcome, and any clashes to settle — so building starts on real agreement, not assumed agreement.', "Capture a short note — each person who has a say, in risk order, what they need to agree to, when, the outcome, and any clashes to settle — so building starts on real agreement, not assumed agreement."),
});

/** REQUIREMENTS_AMBIGUITY_FLAG (beginner) — keyword "vague". File. */
export const REQUIREMENTS_AMBIGUITY_FLAG_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Before building, find one vague word in the plan ('better', 'fast') and pin a real number to it.", "Just one vague word in the plan ('better', 'fast') pinned to a real number — before building."),
  2: form('Scan the plan for vague quality words and swap each for something measurable you could actually check.', "Find the vague quality words in the plan and swap each for a measurable target."),
  3: form("1. Before building, read the plan for vague words — \"better\", \"faster\", \"easy to use\".\n2. For each, tell me a real number or test that says when it's met (\"loads in under 2 seconds\").\n3. Vague words can't be checked, so two people will disagree later about whether it's done.", "Read the plan for vague words — 'better', 'faster', 'easy to use' — and for each give a real number or test that says when it's met ('loads in under 2 seconds'), since vague words can't be pinned down and two people will disagree later about whether it's done."),
  4: form('Tie each pinned-down target to where it\'s measured and who agreed it — so the once-vague word can\'t quietly drift back to meaning something else later.', "Anchor each pinned-down target to where it's measured and who agreed it — so the once-vague word can't quietly drift back to meaning something else later."),
  5: form('Write a short note: each vague word, the number or test that now defines it, how it\'s measured, and who agreed it — so what counts as done can be checked, not argued.', "Capture a short note — each vague word, the number or test that now defines it, how it's measured, and who agreed it — so what counts as done is pinned down, not argued."),
});

/** DEPENDENCY_MAPPING (beginner) — keyword "depend". File. */
export const DEPENDENCY_MAPPING_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before starting, name one thing this work depends on, and one thing that depends on it.', "Just one thing this work depends on, and one thing that depends on it — named before starting."),
  2: form('Sketch what this work depends on to start, and what is waiting on this work to finish.', "Map what this work depends on to start, and what's waiting on this work to finish."),
  3: form("1. Before starting, ask: what does this work depend on, and what depends on it being done?\n2. Tell me both — what has to be ready first, and who or what is waiting on this.\n3. A missed thing-it-depends-on blocks you mid-way; a missed thing-that-depends-on-it surprises someone later.", "Name what this work depends on and what depends on it being done — what has to be ready first, and who or what is waiting on this — since a missed thing-it-depends-on blocks you mid-way and a missed dependent surprises someone later."),
  4: form('Turn what-depends-on-what into an order: clear the thing blocking you first, and tell anyone waiting on this what you\'re assuming before they build on it.', "Sequence what-depends-on-what — clear the thing blocking you first, and tell anyone waiting on this what you're assuming before they build on it."),
  5: form('Write a short note: the things this depends on in the order they unblock you, and the things that depend on this with what you told each one — so blocks and surprises are seen early.', "Capture a short note — the things this depends on in the order they unblock you, and the things that depend on this with what you told each — so blocks and surprises are seen early."),
});

/** DEFINITION_OF_DONE (beginner) — keyword "done". File. */
export const DEFINITION_OF_DONE_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before starting, write one thing that must be true for this to count as done.', "Just one thing that must be true for this to count as done — written before starting."),
  2: form('Sketch what done means for this: it works, plus it is tested and written down enough to count.', "Set out what done means for this — it works, plus it's tested and written down enough to count."),
  3: form("1. Before starting, write down what \"done\" really means for this.\n2. Tell me the parts: it works, it's checked (a test or a review), it's written down if it needs to be, and it's where it needs to be.\n3. Put it as \"this is done when X and Y\" — so done isn't a feeling later.", "Write what 'done' really means for this — it works, it's checked (a test or a review), it's written down if it needs to be, and it's where it needs to be — as 'this is done when X and Y', so done isn't a feeling later."),
  4: form('Make each done condition something someone else could confirm without asking you — a passing test, a visible result — and agree it before starting, not at the end.', "Phrase each done condition so someone else could confirm it without asking you — a passing test, a visible result — and agree it before starting, not at the end."),
  5: form('Write a short note: the conditions that mean done — working, checked, written down, in place — so there\'s a shared bar instead of an argument later about whether it\'s done.', "Capture a short note — the conditions that mean done (working, checked, written down, in place) — so there's a shared bar instead of an argument later about whether it's done."),
});

/** CROSS_TEAM_IMPACT_CHECK (beginner) — keyword "tell". File. SENSITIVE. */
export const CROSS_TEAM_IMPACT_CHECK_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before changing this shared part, name the one person or group most affected — the one you should tell first.', "Just the one person or group most affected by this shared-part change — the one to tell first, named before changing it."),
  2: form('List who else uses this shared part and would feel the change, and what you would tell each one.', "Name who else uses this shared part and would feel the change, and what you'd tell each one."),
  3: form("1. Before changing something other people's code or work relies on, ask who else uses it.\n2. Tell me each person or group affected, and tell them what's changing before you change it.\n3. A quick heads-up costs a minute; a surprise break costs them days of confusion.", "Ask who else uses something your change touches, and tell each person or group what's changing before you change it — a quick heads-up costs a minute; a surprise break costs them days of confusion."),
  4: form('For each affected party, get ready to tell them before you change anything — what changes, when, and what they need to do — so you tell them before the change, not after.', "Line up what to tell each affected party before you change anything — what changes, when, and what they need to do — so they hear it before the change, not after."),
  5: form('Write a short note: everyone who relies on this shared part, what you tell each one, and that they got it — so telling them before the change replaces a broken surprise after.', "Capture a short note — everyone who relies on this shared part, what you tell each one, and that they got it — so telling them before the change replaces a broken surprise after."),
});

/** SUCCESS_METRIC_DEFINITION (beginner) — keyword "number". File. */
export const SUCCESS_METRIC_DEFINITION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before building, name the one number that would tell you this feature worked.', "Just the one number that would tell you this feature worked — named before building."),
  2: form('Define the success number: what it is, where you would see it, and roughly the target.', "Set the success number — what it is, where you'd see it, and roughly the target."),
  3: form("1. Before building, name the one number that says whether this worked.\n2. Tell me the number, where you'd see it, the target, and by when (\"30% of users use it within a month\").\n3. Without a number, you can't tell afterward whether it actually did anything.", "Name the one number that says whether this worked — the number, where you'd see it, the target, and by when ('30% of users use it within a month') — since without a number there's no telling afterward whether it did anything."),
  4: form('Add a starting point and a guardrail to the number: write down what it is now (so you can see the change), and one number that must NOT get worse — so success is a real change, not a figure with nothing to compare to.', "Give the number a starting point and a guardrail — what it is now (so the change shows), and one number that must NOT get worse — so success is a real change, not a figure with nothing to compare to."),
  5: form('Write a short note: the success number, how it\'s measured, where it starts, the target, the timeframe, and the number that must not get worse — the yardstick you judge this by after shipping.', "Capture a short note — the success number, how it's measured, where it starts, the target, the timeframe, and the number that must not get worse — the yardstick you judge this by after shipping."),
});

/** PRIORITY_JUSTIFICATION (beginner) — keyword "instead". File. */
export const PRIORITY_JUSTIFICATION_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before building, say in one line why you are doing this instead of the next-best thing.', "Just why you're doing this instead of the next-best thing, in one line — before building."),
  2: form('Give the reason for doing this instead of something else: the value, the urgency, and what you are setting aside.', "Set out the reason for doing this instead of something else — the value, the urgency, and what you're setting aside."),
  3: form("1. Before building, say why this is the thing to do now instead of something else.\n2. Tell me the value or urgency, and name the next-best thing you're setting aside to do this.\n3. Without that, work quietly drifts toward whatever's easiest instead of whatever matters.", "Say why this is the thing to do now instead of something else — the value or urgency, and the next-best thing you're setting aside to do it — since without that, work quietly drifts toward whatever's easiest instead of whatever matters."),
  4: form("Make it a real comparison: score this and the best thing you're setting aside to do it instead, on the same points — value, urgency, risk — and say what it costs to NOT do this now, so it's a defended choice.", "Turn it into a real comparison — score this and the best thing you're setting aside to do it instead, on the same points (value, urgency, risk), and say what it costs to NOT do this now — so it's a defended choice."),
  5: form('Write a short note: the value, urgency, and risk of this scored against the thing you set aside instead, plus the cost of not doing it now — so the order follows reasoning, not the easiest path.', "Capture a short note — the value, urgency, and risk of this scored against the thing you set aside instead, plus the cost of not doing it now — so the order follows reasoning, not the easiest path."),
});

/** USER_STORY_COMPLETENESS (beginner) — keyword "story". File. */
export const USER_STORY_COMPLETENESS_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Before building, write this as a one-line story: 'As a [person], I want [thing], so that [reason].'", "Just this written as a one-line story — 'As a [person], I want [thing], so that [reason]' — before building."),
  2: form("Draft the story for this — the person, the thing they want, the reason — and check the 'so that' reason really holds.", "Pin the story for this — the person, the thing they want, the reason — and check the 'so that' reason really holds."),
  3: form("1. Before building, write this as a story: \"As a [person], I want [thing], so that [reason].\"\n2. Tell me all three — and if you can't fill the \"so that\" reason, that's the most important gap to close first.\n3. The reason is what stops you building something correct that nobody needed.", "Write this as a story — 'As a [person], I want [thing], so that [reason]' — all three, and if you can't fill the 'so that' reason, that's the most important gap to close first, since the reason is what stops you building something correct that nobody needed."),
  4: form("Sharpen the story: make the person a specific kind of person not just \"a user\", split it if it has more than one \"so that\", and attach the one check that proves the reason was delivered.", "Tighten the story — make the person a specific kind not just 'a user', split it if it has more than one 'so that', and attach the one check that proves the reason was delivered."),
  5: form('Write a short story note: the specific person, the thing they want, the reason it helps them, and the one check that proves the reason landed — so the build aims at the value, not just a working thing.', "Capture a short story note — the specific person, the thing they want, the reason it helps them, and the one check that proves the reason landed — so the build aims at the value, not just a working thing."),
});

/** RISK_FLAG (beginner) — keyword "risk". File. */
export const RISK_FLAG_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before going ahead, name the single biggest risk in this and how likely it is.', "Just the single biggest risk in this and how likely it is — named before going ahead."),
  2: form('List the main risks here and rate each on how likely it is and how bad it would be.', "Name the main risks here and rate each on how likely it is and how bad it'd be."),
  3: form("1. Before going ahead, name what could go wrong with this.\n2. For each risk, tell me how likely it is (high/medium/low), how bad it'd be, and what you'd do about it.\n3. A risk you've named and watched is manageable; one you've ignored is what bites you.", "Name what could go wrong with this — for each risk, how likely it is (high/medium/low), how bad it'd be, and what you'd do about it — since a risk you've named and watched is manageable and one you've ignored is what bites you."),
  4: form('Rank and own the top risks: order them by likely-times-bad, and for the worst few name who watches each and the early sign it\'s starting — so the biggest risks are watched, not just listed.', "Order and own the top risks — by likely-times-bad, and for the worst few name who watches each and the early sign it's starting — so the biggest risks are watched, not just listed."),
  5: form('Write a short note: each risk with how likely and how bad, ranked by the two together, an early warning sign and an owner for the top ones, and what you\'ll do — so risks are watched, not silent.', "Capture a short note — each risk with how likely and how bad, ranked by the two together, an early warning sign and an owner for the top ones, and what you'll do — so risks are watched, not silent."),
});

/** SCOPE_CHANGE_IMPACT_ASSESSMENT (beginner) — keyword "change". File. */
export const SCOPE_CHANGE_IMPACT_ASSESSMENT_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before saying yes to this change, name the one in-progress thing it would push aside.', "Just the one in-progress thing this change would push aside — named before saying yes to it."),
  2: form('Check this change\'s effect: what it pushes aside, and whether the finish date moves.', "Weigh this change's effect — what it pushes aside, and whether the finish date moves."),
  3: form("1. Before saying yes to a change mid-way, check what it costs.\n2. Tell me: what in-progress thing does it push aside, does the finish date move, who else is waiting on what it touches, and what gets dropped to make room.\n3. A change taken on without that check is how a plan quietly falls apart.", "Check what this mid-way change costs — what in-progress thing it pushes aside, whether the finish date moves, who else is waiting on what it touches, and what gets dropped to make room — since a change taken on without that check is how a plan quietly falls apart."),
  4: form('Turn the change into a clear choice: lay out the trade-off — take it and move the date, or hold and do it later — to whoever owns the plan, and record their call, so the change is decided, not just absorbed.', "Put the change to a clear choice — lay out the trade-off (take it and move the date, or hold and do it later) to whoever owns the plan, and record their call — so the change is decided, not just absorbed."),
  5: form('Write a short note: what this change pushes aside, the date effect, who else it touches, the trade-off made, and the owner\'s decision — so mid-way changes are decided, not silently swallowed.', "Capture a short note — what this change pushes aside, the date effect, who else it touches, the trade-off made, and the owner's decision — so mid-way changes are decided, not silently swallowed."),
});

/** RETROSPECTIVE_HABIT (beginner) — keyword "learn". File. */
export const RETROSPECTIVE_HABIT_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form('Before the next round, look back and learn: name one thing that went well and one that did not.', "Just one thing that went well and one that didn't, to learn from — before the next round."),
  2: form('Take a short look back to learn: what went well, what did not, and one thing to change next round.', "Do a short look back to learn — what went well, what didn't, and one thing to change next round."),
  3: form("1. Before starting the next round, look back at this one and learn from it.\n2. Tell me what went well (keep doing it), what didn't (no blame), and one or two real changes to try next.\n3. Skipping the look-back means the same problems quietly repeat instead of getting fixed.", "Look back at this round and learn from it — what went well (keep doing it), what didn't (no blame), and one or two real changes to try next — since skipping the look-back means the same problems quietly repeat instead of getting fixed."),
  4: form('Make the lessons stick: give each change you want to try an owner and a date, and start by checking whether last round\'s changes actually happened — so you keep learning instead of resetting each time.', "Land the lessons — give each change you want to try an owner and a date, and start by checking whether last round's changes actually happened — so you keep learning instead of resetting each time."),
  5: form('Write a short note: what went well, what didn\'t, and the changes to try next — each with who does it and by when — so the lessons learned get acted on instead of repeating.', "Capture a short note — what went well, what didn't, and the changes to try next, each with who does it and by when — so the lessons learned get acted on instead of repeating."),
});
