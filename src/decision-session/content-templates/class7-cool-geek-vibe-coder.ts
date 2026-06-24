// Per-class decision-session content (class7_cool_geek_vibe_coder). Relocated verbatim from
// options.ts / options-beginner.ts — one home per signal class.

import type { DecisionContent } from '../options.js';
import { WHY_HELP_BY_SIGNAL_TYPE } from '../why-help-by-signal-type.js';

// ── Phase 5 D4-D6 — cool_geek signals (CASUAL register) ──────────────────────
export const ABSENCE_FEATURE_COMPLETION_CHECK_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_FEATURE_COMPLETION_CHECK",
  question:      'Adding more — is the previous feature actually done?',
  pinchFallback: 'Finish before starting next.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_FEATURE_COMPLETION_CHECK'],
  L1: [
    {
      option: 'Checkpoint: what\'s the state of the last feature started? Is it done and tested end-to-end? Scrum\'s Definition of Done exists because partially-done features compound — starting new ones before previous ones meet DoD means carrying technical debt through every subsequent sprint.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I started another feature without checking whether the previous one is actually done."}
The previous feature hasn't been verified done end-to-end — starting the next risks compounding unfinished work.
Checkpoint last feature: done-and-tested vs partially-built — meet DoD before next.
{R4_CLOSE}`,
    },
    {
      option: 'Before adding the next thing — is the previous feature fully working end-to-end? Not \'mostly done\', not \'works here\', but actually complete and tested? Unfinished features accumulate and come back as bugs and edge cases.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Adding new things; haven't checked if the previous is actually finished."}
The fully-working-end-to-end check on the previous feature hasn't been done.
Not 'mostly done', not 'works here' — actually complete and tested.
{R4_CLOSE}`,
    },
    {
      option: 'How complete is the most recently started feature? Rate it honestly: \'done and tested\', \'works but untested\', \'partially built\'. Starting the next feature before the previous one meets DoD is the classic unfinished-work accumulation pattern.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Honest completion rating not done."}
The honest completion rating hasn't been done.
Rate: done-and-tested / works-but-untested / partially-built — only proceed after DoD met.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is the previous feature done and tested? That\'s the bar — fully built, verified end-to-end. Start the next only after meeting it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Adding new features."}
Lighter: previous-feature done-and-tested bar — meet it before next.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the completion state of the last feature? Only move to the next after the previous is actually done.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Adding new features."}
Narrower: completion-state of last feature.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is the last feature actually done and tested before starting the next?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Adding new features."}
Minimum next step: last-feature actually-done-and-tested check.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_FINISHING_LINE_AWARENESS_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_FINISHING_LINE_AWARENESS",
  question:      'Multiple things in progress — how many are complete?',
  pinchFallback: 'Finish one before starting next.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_FINISHING_LINE_AWARENESS'],
  L1: [
    {
      option: 'Count check: how many features are currently in-progress vs. complete end-to-end? A partially-done feature delivers zero user value. Three features 40% each is worse than one feature 100% — the user can use one, and none of three.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've got multiple things going at once without pushing any to done."}
Multiple in-progress features haven't been pushed to completion — WIP accumulates without delivering value.
Count in-progress vs complete-end-to-end / 3×40% delivers zero, 1×100% delivers one.
{R4_CLOSE}`,
    },
    {
      option: 'In iterative delivery, value is delivered by reaching shippable state, not by making progress. How many features started this session have reached shippable state? Pick the one closest to completion — finish that before starting another.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Multiple started this session; shippable-state count not done."}
The shippable-state count hasn't been done.
Pick closest to completion / finish that first / value = shippable, not progress.
{R4_CLOSE}`,
    },
    {
      option: 'Before starting something new — pick the feature closest to completion and push it to done. Lean delivery: finish items, don\'t accumulate WIP. What\'s the one thing to finish right now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Tempted to start something new; closest-to-done not pushed."}
The one-to-finish-now pick hasn't been made.
Closest to done → push to done / lean delivery: finish, don't accumulate WIP.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'How many things are in-progress? Complete the one closest to done before starting anything new.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Multiple in-progress."}
Lighter: in-progress count + complete-closest-to-done.
{R4_CLOSE}`,
    },
    {
      option: 'What would it take to bring the most-started feature to shippable state? Do that before adding more.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Multiple in-progress."}
Narrower: most-started feature → what-to-do-to-ship.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Which feature is closest to done? Finish that one before starting the next.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Multiple in-progress."}
Minimum next step: closest-to-done → finish that.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_POLISH_VS_FUNCTION_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_POLISH_VS_FUNCTION",
  question:      'Working on the look — does the core work end-to-end?',
  pinchFallback: 'Function before polish.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_POLISH_VS_FUNCTION'],
  L1: [
    {
      option: 'Lean MVP principle: polish comes after function. Before spending more prompts on UI improvements — does the core functionality work end-to-end? \'MVP UI should be clean and usable, not museum-quality.\' Fix the working before fixing the looking.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I'm polishing UI but haven't verified the core works end-to-end."}
Core functionality hasn't been verified end-to-end — UI polish on a non-functional core wastes effort and compounds rework.
Polish after function / MVP UI clean+usable, not museum-quality.
{R4_CLOSE}`,
    },
    {
      option: 'Does the core user flow work without errors from start to finish? If not, visual polish is blocked by a non-working core. Function first: build the thing that works, then make it look good.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Polishing without verifying core works."}
The core-user-flow end-to-end check hasn't been done.
Visual polish blocked by non-working core / function first, then looking.
{R4_CLOSE}`,
    },
    {
      option: 'UI polish on a non-functional core creates maintenance debt — you\'ll redo the style when the function changes. Core functionality working end-to-end is the prerequisite for polish. Is it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Polishing UI; style-redo risk not surfaced."}
The polish-debt risk hasn't been surfaced.
Style gets redone when function changes / prerequisite is working core.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does the core work end-to-end before going further with styling? Function first — polish after it works.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Working on styling."}
Lighter: core-works-end-to-end check before more styling.
{R4_CLOSE}`,
    },
    {
      option: 'Is the working flow solid end-to-end? Lean MVP says polish after function. What\'s left to make the core work?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Working on styling."}
Narrower: working-flow-solid check + what-left-to-make-core-work.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Get the core working end-to-end before focusing on how it looks.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Working on styling."}
Minimum next step: core-working-end-to-end before looks-focus.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_MVP_SCOPE_DISCIPLINE_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_MVP_SCOPE_DISCIPLINE",
  question:      'Adding features — is each one actually MVP scope?',
  pinchFallback: 'MVP discipline check.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_MVP_SCOPE_DISCIPLINE'],
  L1: [
    {
      option: 'Eric Ries MVP heuristic: start with what you believe is needed, then eliminate half the features, then eliminate half again. Each addition should answer: does this test the core hypothesis? Is it the minimum needed to get real user feedback? If neither — it\'s gold-plating an unvalidated MVP.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Adding features without checking each against MVP hypothesis."}
Feature additions haven't been gated against MVP-hypothesis — risk of gold-plating an unvalidated MVP.
Per addition: tests core hypothesis? min for real feedback? — else it's gold-plating.
{R4_CLOSE}`,
    },
    {
      option: 'MVP scope discipline: for each new feature, ask — is this the minimum needed to test the core assumption, or is it a nice-to-have that could wait until after first validation? \'Lean startup MVP requires strict discipline, focusing on the minimum feature set to test a specific assumption.\'',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building features without strict MVP gating."}
The MVP-discipline gate hasn't been applied.
Per feature: min-to-test-assumption vs nice-to-have-post-validation.
{R4_CLOSE}`,
    },
    {
      option: 'Before adding this — what specific hypothesis does it help validate? Features without a hypothesis-connection aren\'t MVP scope. List what\'s left to build and categorize: core hypothesis vs. nice-to-have.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Hypothesis-connection not checked per feature."}
The hypothesis-connection check hasn't been done.
List remaining-to-build / categorise: core hypothesis vs nice-to-have.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is this feature minimum-viable — needed to test the core hypothesis — or is it gold-plating? Scope check before building.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Adding features."}
Lighter: MV-needed-to-test-hypothesis vs gold-plating.
{R4_CLOSE}`,
    },
    {
      option: 'What hypothesis does this feature validate? If it doesn\'t test the core assumption, it\'s post-MVP scope.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Adding features."}
Narrower: which hypothesis validated? else post-MVP.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is this feature MVP scope? Does it test the core hypothesis or is it a nice-to-have?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Adding features."}
Minimum next step: MVP-scope test — hypothesis or nice-to-have?
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_IDEA_TO_SPEC_BRIDGE_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_IDEA_TO_SPEC_BRIDGE",
  question:      'New idea — defined what it does before building?',
  pinchFallback: 'Spec the idea first.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_IDEA_TO_SPEC_BRIDGE'],
  L1: [
    {
      option: 'Spec-driven development principle: a feature idea is not a spec. Before building — write a one-paragraph description: what does this feature do? What does it NOT do? How does it fit into what already exists? The spec becomes the source of truth; code is its expression.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I have an idea but haven't bridged to a written spec before building."}
The idea hasn't been spec'd before building — directed building gives way to creative wandering.
One-paragraph spec: what / what-not / how-it-fits — spec is source of truth, code is expression.
{R4_CLOSE}`,
    },
    {
      option: 'Jumping from idea to code skips the bridge. Quick spec for this idea: (1) what does it do — one sentence, (2) what are its boundaries — what it explicitly does not do, (3) how does it fit into the existing product — integration points. Five minutes of spec saves hours of rework.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Jumping idea→code; bridge skipped."}
The idea-to-code bridge spec hasn't been written.
What does / boundaries / integration points — 5 min spec saves hours of rework.
{R4_CLOSE}`,
    },
    {
      option: 'An idea in your head is not a spec. A spec is a structured description of what the feature does and doesn\'t do, written before implementation. Write it, then build against it — this is the difference between directed building and creative wandering.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea in head, not written down."}
The structured-spec write hasn't been done.
Structured description of does/doesn't / write then build against it.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Spec this idea before building it: what does it do, what are its boundaries, and how does it fit into what already exists? One paragraph is enough.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "New idea."}
Lighter: one-paragraph spec — does / boundaries / fit.
{R4_CLOSE}`,
    },
    {
      option: 'Before implementing — write what it does and what it doesn\'t do. The spec is the source of truth; implementation is the verification.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "New idea."}
Narrower: write does/doesn't before implement.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Define what this idea does and doesn\'t do before writing any code for it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "New idea."}
Minimum next step: does/doesn't before code.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_DEMO_VS_PRODUCT_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_DEMO_VS_PRODUCT",
  question:      'Is this demo quality or production quality — explicit distinction?',
  pinchFallback: 'Demo vs. production: name which.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DEMO_VS_PRODUCT'],
  L1: [
    {
      option: 'Production readiness check: what quality standard applies to what\'s being built? Demo code and production code have different requirements. If this is a demo — mark it explicitly: hardcoded data, no edge cases, visual-only. If it\'s the actual product — it needs real data connected, error states handled, and edge cases working.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building but haven't named the quality standard — demo or production."}
Demo-vs-production quality standard hasn't been named — prototype code risks being treated as production.
Demo: hardcoded data / no edge cases / visual-only. Production: real data / error states / edge cases working.
{R4_CLOSE}`,
    },
    {
      option: 'The difference between demo and production: demo looks right; production works right under real conditions. Treating prototype code as production without explicit upgrade creates technical debt that compounds with every sprint. \'Low quality code contains 15x more defects and takes 124% longer to resolve.\' — name which standard applies right now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Looks-right vs works-right not distinguished."}
The looks-right vs works-right distinction hasn't been named.
Treating prototype as production = compounding tech debt — name standard now.
{R4_CLOSE}`,
    },
    {
      option: 'Categorize explicitly what\'s being built: prototype (exploratory, disposable, no production quality required) or production (real data, real errors, edge cases, maintainable). If prototype — name it and plan the production upgrade path. If production — apply production standards now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Build categorisation not done."}
The explicit prototype-vs-production categorisation hasn't been done.
Prototype: disposable + name upgrade path. Production: apply standards now.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is this demo-quality or production-quality? Name it explicitly. If demo — what\'s the plan to make it production-ready? If production — is it handling real data and real error states?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Quality standard not named."}
Lighter: name standard + demo-plan-to-prod OR prod-handling-check.
{R4_CLOSE}`,
    },
    {
      option: 'Demo code isn\'t wrong — treating it as production code is. What quality standard applies to what\'s being built right now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Quality standard not named."}
Narrower: demo isn't wrong, treating-as-production is — name standard now.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is this demo or production quality? Name which, explicitly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Quality standard not named."}
Minimum next step: demo or production — name which.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_USER_JOURNEY_CHECK_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_USER_JOURNEY_CHECK",
  question:      'Feature being built — is the full user journey mapped?',
  pinchFallback: 'Map the user journey first.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_USER_JOURNEY_CHECK'],
  L1: [
    {
      option: 'Jeff Patton User Story Mapping: once a basic happy path is in place, consider edge cases, alternatives, and exceptions. Before building more — answer: (1) what does the user see the first time they encounter this feature? (2) what happens when there\'s no data — the empty state? (3) what happens when something goes wrong — the error state? Each is a must-handle state.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Happy-path built; non-happy states not mapped."}
Empty / error / first-use states haven't been mapped — happy-path-only feels complete but breaks user trust.
First-use / empty / error — each is must-handle.
{R4_CLOSE}`,
    },
    {
      option: 'Happy-path-only features feel complete in development but break user trust in production. \'Edge cases often reveal how thoughtful a product really is.\' Before marking this feature done — map the non-happy paths: empty state, error state, first-use experience. These are the normal user experience for many users.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Non-happy-path mapping not done."}
The non-happy-path mapping hasn't been done.
Empty / error / first-use — normal for many users.
{R4_CLOSE}`,
    },
    {
      option: 'User journey check — beyond the happy path, which of these states has been handled? (1) Empty state — no data yet. (2) Error state — something fails. (3) First-time experience — user sees this for the first time. (4) Edge case — unexpected input. Story mapping says: reveal the states the system must handle gracefully.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Beyond-happy-path states not enumerated."}
The state-by-state handling check hasn't been done.
Empty / error / first-time / edge case — reveal what must be handled gracefully.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Has the full user journey been mapped? Beyond the happy path — what happens in the empty state, error state, and first-use experience?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Happy-path built."}
Lighter: full journey + empty / error / first-use.
{R4_CLOSE}`,
    },
    {
      option: 'The feature may work for you — does it work for users in non-ideal conditions? Empty state, error state, first-time experience — name each.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Happy-path built."}
Narrower: name each non-ideal state.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s the empty state? The error state? The first-use experience? Name all three.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Happy-path built."}
Minimum next step: name empty / error / first-use.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_TECHNICAL_SPIKE_TREATMENT_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_TECHNICAL_SPIKE_TREATMENT",
  question:      'Exploring / experimenting — spike or production code?',
  pinchFallback: 'Spike or production: name which.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_TECHNICAL_SPIKE_TREATMENT'],
  L1: [
    {
      option: 'XP spike solution principle (Kent Beck / James Shore): \'Never copy spike code into production code. Even if it is exactly what you need, rewrite it using TDD so that it meets production standards.\' The purpose of exploratory code is knowledge, not shipping. Name what\'s being done: spike (to learn) or production (to ship)?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Exploring code without distinguishing spike vs production."}
Exploratory code hasn't been distinguished from production code — spike code risks being committed as production.
Spike = knowledge / production = ship — name which now.
{R4_CLOSE}`,
    },
    {
      option: 'The output of a spike is not production code — it\'s knowledge. Time-box the exploration, answer the question it was meant to answer, then decide: throw the spike away and rewrite properly, or extract the validated pattern into clean production code. Right now — is this spike or production?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Spike output not gated to throw-or-extract decision."}
The throw-vs-extract decision hasn't been made.
Time-box / answer question / throw away or extract clean.
{R4_CLOSE}`,
    },
    {
      option: 'Exploratory code and production code have different standards by definition. Some practitioners keep a dedicated spikes/ directory to enforce this separation. Before committing what\'s been written — spike (throwaway, learning-focused) or production (clean, tested, maintainable)? Name which.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Code about to be committed; spike-or-production not named."}
The pre-commit spike-or-production naming hasn't been done.
Spike: throwaway, learning. Production: clean, tested, maintainable. Name which.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is what\'s being written spike code (exploratory, throwaway, to learn) or production code (tested, maintainable, to ship)? Name which before committing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Exploring code."}
Lighter: spike vs production — name before committing.
{R4_CLOSE}`,
    },
    {
      option: 'The XP rule: never commit spike code directly as production. If this was a spike — extract the useful pattern and rewrite it cleanly before it enters the codebase.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Spike code might enter codebase."}
Narrower: XP rule — extract pattern, rewrite cleanly before codebase entry.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Spike code or production code? Name which before committing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Exploring code."}
Minimum next step: spike or production — name before commit.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_DEPENDENCY_ADVENTURE_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_DEPENDENCY_ADVENTURE",
  question:      'Adding a dependency — evaluated the need and maintenance cost?',
  pinchFallback: 'Evaluate before adding.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DEPENDENCY_ADVENTURE'],
  L1: [
    {
      option: 'Dependency management principle: \'Dependencies are not free and extract an ongoing maintenance cost.\' Every library added for interest rather than specific need becomes code you did not write but have localized responsibility for. Before adding this — what specific problem does it solve that you can\'t solve without it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to add a library; necessity not evaluated."}
Dependency necessity hasn't been evaluated — every interest-driven library becomes ongoing maintenance debt.
Specific problem? Can-do-without-it? — before adding.
Still, before you install this dependency you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: '\'Dependency hell\' occurs when two libraries demand incompatible versions of the same dependency — resolving this can derail development schedules. Maintenance consumes 70-90% of total project costs. Before installing this package — have alternatives been evaluated? What specific problem does it solve?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to install; alternatives not evaluated."}
The alternatives-evaluation hasn't been done.
Specific problem solved? alternatives evaluated? — before install.
Still, before you install this package you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Three questions before adding any dependency: (1) what specific problem does it solve? (2) have existing tools or a small custom solution been considered? (3) what is the ongoing maintenance cost — updates, security patches, version conflicts? Explore-first library additions become unmaintained technical debt.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Three-question gate not applied."}
The three-question dependency gate hasn't been applied.
Specific problem / existing tools considered / maintenance cost.
Still, before you add this dependency you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What specific problem does this dependency solve? Have alternatives been evaluated? What\'s the maintenance cost? Answer all three before installing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Considering a new dependency."}
Lighter: problem / alternatives / maintenance cost — answer all three before install.
Still, before you install this dependency you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Dependencies are not free — they extract ongoing maintenance. What need does this library solve that justifies its long-term cost?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Considering a new dependency."}
Narrower: what need + long-term cost justified?
Still, before you install this dependency you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What specific problem does this library solve that justifies adding it as a permanent dependency?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Considering a new dependency."}
Minimum next step: specific problem justifying permanent dependency.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_RESTART_IMPULSE_CHECK_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_RESTART_IMPULSE_CHECK",
  question:      'Hitting friction — debugged before considering a restart?',
  pinchFallback: 'Debug before restarting.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_RESTART_IMPULSE_CHECK'],
  L1: [
    {
      option: 'Joel Spolsky: \'When you start from scratch there is absolutely no reason to believe that you are going to do a better job than you did the first time. Each fixed bug took weeks or years of real-world usage to be discovered — when you throw away code, all the knowledge that went into it is lost.\' Before restarting: what specifically went wrong and why?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Hitting friction; tempted to restart from scratch."}
Root-cause debugging hasn't been done — restart impulse discards accumulated bug-knowledge.
Before restart: what specifically went wrong and why?
{R4_CLOSE}`,
    },
    {
      option: 'Root cause analysis principle: every restart impulse is a debugging failure. \'RCA explains why the system became vulnerable to the fault, how the fault was triggered, and what durable changes will reduce the probability of it happening again.\' Rewriting skips all three steps. Debug first — identify the root cause before deciding whether restart is warranted.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Restart impulse without RCA."}
RCA on the current friction hasn't been done.
Why-vulnerable / how-triggered / durable change — debug first.
{R4_CLOSE}`,
    },
    {
      option: 'The restart impulse is almost always wrong. Problems in the current code are known. Problems in the rewrite are unknown — and most of the same issues will be reproduced without the bug knowledge that accumulated in the current version. What specifically is broken? Fix that.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Tempted to rewrite; current-vs-rewrite comparison not done."}
The known-vs-unknown-problems comparison hasn't been done.
Current: known. Rewrite: unknown + lost-knowledge — fix specific broken part instead.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Before rewriting — what specifically went wrong? Name the root cause. Debug first, then decide whether restart is actually warranted.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Restart impulse."}
Lighter: specific went-wrong + root cause + debug-first.
{R4_CLOSE}`,
    },
    {
      option: 'The current code has accumulated knowledge from real use. Rewriting discards that. What\'s the specific problem? Fix it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Restart impulse."}
Narrower: accumulated-knowledge / specific problem to fix.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What specifically is broken? Debug it before deciding to restart.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Restart impulse."}
Minimum next step: specific broken part + debug before restart.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_CREATIVE_VS_CORE_RATIO_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_CREATIVE_VS_CORE_RATIO",
  question:      'Session balance — how much went to core vs. creative features?',
  pinchFallback: 'Core value first.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_CREATIVE_VS_CORE_RATIO'],
  L1: [
    {
      option: 'Value-driven development: \'features that generate the maximum value for the users without creating the maximum cost.\' Before the next creative or aesthetic feature — look at this session: what proportion of prompts went to core product functionality vs. creative/extra features? If more than 30-40% is creative, the core is under-served.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Creative features accumulating; core-ratio not checked."}
Session ratio of core vs creative effort hasn't been audited — creative work risks outweighing core user value.
Look at session: core vs creative — if >30-40% creative, core is under-served.
{R4_CLOSE}`,
    },
    {
      option: 'Value vs. effort check: creative features have effort cost but often low core-product value. \'Value-driven development prevents feature bloat — adding features that don\'t provide value.\' For each creative feature added this session — what core user need does it serve? If it doesn\'t serve a core need, it\'s future technical debt.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Creative features added; core-need served not verified."}
The per-creative-feature core-need check hasn't been done.
Effort cost + core-product-value — each creative feature serves a core need or becomes debt.
{R4_CLOSE}`,
    },
    {
      option: 'Session ratio check: count prompts on core features (things users actually need) vs. creative/extra features (things that are interesting to build). If creative is outweighing core — core first. Creative features compound maintenance cost without proportional user value.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Session ratio not counted."}
The session-ratio count hasn't been done.
Core (users need) vs creative (interesting to build) — if creative outweighing, core first.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the ratio of core product prompts to creative/extra feature prompts this session? If creative is outweighing core — prioritize core functionality first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Session prompts mix."}
Lighter: core-vs-creative ratio — core-first if creative outweighing.
{R4_CLOSE}`,
    },
    {
      option: 'Every creative feature has a maintenance cost. Does this one serve a core user need, or is it a fun-to-build extra? Core first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Considering a creative feature."}
Narrower: serves core-user-need or fun-to-build-extra?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Has core product gotten more attention than creative extras this session? Check the ratio.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Session mix."}
Minimum next step: core-vs-creative attention ratio.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_ERROR_UNDERSTANDING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_ERROR_UNDERSTANDING",
  question:      'Got an error — do you know what it means?',
  pinchFallback: 'Understand the error.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ERROR_UNDERSTANDING'],
  L1: [
    {
      option: '1. Before asking to fix this error — read the error message carefully.\n2. Share with me: what do you think it\'s saying went wrong?\n3. Then tell me: does your explanation match where the problem is in the code?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Got an error; about to ask to fix it without understanding it."}
The error message hasn't been read and explained — fixing without understanding leads to repeating the same class of error.
Walk me through: read carefully / what it's saying / does explanation match code location.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through the error message — what does it say, where is it pointing, and what do you think caused it? Share your understanding before we fix anything.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Got an error; understanding-before-fix not shared."}
Same moment, simpler: walk-through of message + understanding-before-fix.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What do you think this error means? Share your best guess with me — even if you\'re not sure — before we fix it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Got an error."}
Lighter: best-guess meaning before fix.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Do you understand what this error is telling you, or does it need more explaining before we fix it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Got an error."}
Minimum next step: understand-or-needs-explaining check.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_REQUIREMENT_CLARITY_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_REQUIREMENT_CLARITY",
  question:      'About to build — is the requirement clear?',
  pinchFallback: 'Clarify first.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_REQUIREMENT_CLARITY'],
  L1: [
    {
      option: '1. Before I build this — tell me specifically what you want it to do.\n2. Share with me: what does it look like when it\'s working correctly?\n3. Then tell me: what should NOT happen — is there anything it should avoid doing?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to build but haven't said specifically what 'working' looks like."}
What 'working' looks like hasn't been described — building proceeds without a target.
Walk me through: what to do specifically / what working looks like / what should NOT happen.
{R4_CLOSE}`,
    },
    {
      option: 'Describe what you want built in your own words — what it should do, and how you\'d know it\'s working right. Share that with me before we start.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building this; plain-words description not shared."}
Same moment, simpler: plain-words description — what + how-I'd-know-working.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What exactly should this do, and how will you know when it\'s working? Be specific — not just "make it work" but what does "working" look like.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this."}
Lighter: exact-do + working-looks-like — specific, not 'make it work'.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What do you want this to do? In plain words — what\'s the goal?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this."}
Minimum next step: plain-words goal.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_COPY_PASTE_AWARENESS_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_COPY_PASTE_AWARENESS",
  question:      'Code generated — do you understand it before using it?',
  pinchFallback: 'Understand first.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_COPY_PASTE_AWARENESS'],
  L1: [
    {
      option: '1. Before adding the generated code to your project — read through it.\n2. Share with me: what does each part do in plain words?\n3. If there\'s a part you\'re not sure about, point it out and we\'ll go through it together before it goes in.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to paste generated code without reading it for understanding."}
Generated code hasn't been read for understanding — using code one can't explain creates future-debugging debt.
Walk me through: read through / plain-words per part / point out unsure parts.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through the code that was just generated — what does it do and how does it work? Share your understanding before we add it to the project.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Generated code about to be added."}
Same moment, simpler: walk-through of generated + understanding before add.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there any part of the code that was just generated that you\'re not sure you understand? Point it out and we\'ll go through it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Generated code reviewed."}
Lighter: any-unsure parts to walk through together.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Do you understand what the generated code does before adding it to your project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Generated code."}
Minimum next step: understand-before-add check.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_DEBUGGING_OBSERVATION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_DEBUGGING_OBSERVATION",
  question:      'Something\'s broken — what did you actually see?',
  pinchFallback: 'Describe it first.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DEBUGGING_OBSERVATION'],
  L1: [
    {
      option: '1. Before I look at the bug — describe what happened.\n2. Share with me: what did you expect to happen, and what actually happened instead?\n3. Then tell me: is there an error message, and if so, what does it say?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Something's broken; haven't described what I saw vs expected."}
What happened vs expected hasn't been described — fixing without observation guesses at the bug.
Walk me through: what happened / expected vs actual / error message text.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what\'s broken — what did you expect to happen, what actually happened, and what error or weird behaviour did you see? Share that with me and we\'ll figure it out.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Something's broken; symptom-vs-expectation not shared."}
Same moment, simpler: walk-through — expected / actual / error or weird behaviour.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What happened when you ran this? Describe what you expected vs what you actually saw — I need to know the difference before we fix it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Something's broken."}
Lighter: expected-vs-actual delta before fix.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What exactly went wrong — what did you see happen, and what were you expecting?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Something's broken."}
Minimum next step: what-went-wrong + saw vs expected.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_LEARNING_CONSOLIDATION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_LEARNING_CONSOLIDATION",
  question:      'We\'ve built a lot — do you feel like you understood it?',
  pinchFallback: 'Recap learning.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_LEARNING_CONSOLIDATION'],
  L1: [
    {
      option: '1. We\'ve covered a lot in this session — take a moment and think about what you actually learned.\n2. Share with me: what\'s the most important thing you now understand that you didn\'t before?\n3. Then tell me: is there anything we covered that still feels unclear or confusing?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long session of building; haven't paused to recap what I learned."}
Session learning hasn't been recapped — built code without understanding becomes a maintenance problem.
Walk me through: think about learned / most important now-understood / what still unclear.
{R4_CLOSE}`,
    },
    {
      option: 'Recap what you learned in this session in your own words — what did we build, how does it work, and what new thing do you understand now that you didn\'t before? Share that with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long session; recap-in-own-words not done."}
Same moment, simpler: own-words recap — built / how-it-works / new-understanding.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the one thing from this session that you feel like you actually understood — not just copied, but actually understood? Share it with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long session."}
Lighter: one-thing actually-understood (not just copied).
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there something we built in this session that you\'re confident you understand well enough to explain to someone else?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long session."}
Minimum next step: anything understood well enough to explain to someone else.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SIMPLE_SOLUTION_FIRST_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_SIMPLE_SOLUTION_FIRST",
  question:      'Building this — is there a simpler way to do it?',
  pinchFallback: 'Simplest first.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SIMPLE_SOLUTION_FIRST'],
  L1: [
    {
      option: '1. Before building something complex — ask: is there a simpler way to get the same result? The simplest solution that works is almost always the right one to start with.\n2. Share what you\'re trying to do in plain terms. Let\'s find the simple version first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to build complex; simpler-first not asked."}
Simple-first solution hasn't been tried — complexity-first creates code that can't be unsimplified.
Walk me through: simpler way to same result? / what I'm trying to do, plain terms.
{R4_CLOSE}`,
    },
    {
      option: 'The KISS principle in engineering: if the simple solution works, use it. You can always make things more complex later — you can\'t unsimplify them. What\'s the simplest version of what you\'re building?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to build; KISS check not done."}
Same moment, simpler: KISS — simplest version of what's being built.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there a simpler way to do this? Describe what you need — let\'s find the smallest solution.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this."}
Lighter: simpler way + smallest solution.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s the simplest way to get this done? Start there.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this."}
Minimum next step: simplest way to get this done.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING",
  question:      'Asking a lot at once — let\'s do one thing at a time',
  pinchFallback: 'One thing at a time.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING'],
  L1: [
    {
      option: '1. When you send several things at once, the results get messy and hard to check. Try focusing on just one thing per message.\n2. What\'s the most important thing to do right now? Start with that — then we\'ll move to the next.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I'm asking several things at once; single-responsibility prompting not applied."}
Single-responsibility prompting hasn't been applied — multiple things asked in one message make responses harder to verify and harder to fix.
Walk me through: one thing per message / most important to do right now / then next.
{R4_CLOSE}`,
    },
    {
      option: 'One task per message works better than many — it\'s easier to see if it worked, easier to fix if it didn\'t, and easier to understand what happened. What\'s the single next step?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Combined requests becoming hard to verify."}
Same moment, simpler: one-task-per-message — easier to see/fix/understand.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the one thing to do right now? Focus on that first — we\'ll do the rest after.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Asking multiple things."}
Lighter: one-thing-right-now + focus + then-rest.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'One thing at a time — what\'s the most important next step?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Asking multiple things."}
Minimum next step: most important single-next-step.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_ROLLBACK_AWARENESS_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_ROLLBACK_AWARENESS",
  question:      'About to change things — do you know how to undo it?',
  pinchFallback: 'Save before changing.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ROLLBACK_AWARENESS'],
  L1: [
    {
      option: '1. Before making a big change to your code — do a git commit first. This saves a snapshot you can always go back to if something breaks.\n2. Not sure how? Try: git add . then git commit -m \'working before change\'. Then make your change safely.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to make a big change without saving current state."}
Current working state hasn't been committed to git — change-without-snapshot leaves no return path.
Walk me through: git commit first / git add . + git commit -m 'working before change' / then change safely.
{R4_CLOSE}`,
    },
    {
      option: 'Git is your safety net. Always commit a working version of your code before changing something significant. If the change breaks everything, you can get back to where things worked with one command.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Big change pending; safety-net commit not done."}
Same moment, simpler: git as safety net — commit working before significant change.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Do a git commit before making this change — save a working snapshot first, then change.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to change code."}
Lighter: commit + snapshot before change.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Commit your current code before changing it — so you can get back if needed.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to change code."}
Minimum next step: commit before change.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_BUILD_VS_UNDERSTAND_RATIO_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_BUILD_VS_UNDERSTAND_RATIO",
  question:      'We\'ve been building — do you understand what we\'ve built?',
  pinchFallback: 'Pause and understand.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_BUILD_VS_UNDERSTAND_RATIO'],
  L1: [
    {
      option: '1. We\'ve added a lot of code — can you explain in your own words what it does? Even a rough description is fine.\n2. Understanding what you\'ve built is as important as building it. Code you don\'t understand becomes a problem you can\'t fix later.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Lots of code added; understanding-of-built not verified."}
Built code understanding hasn't been verified — code one can't explain becomes a problem one can't fix.
Walk me through: explain in own words / understanding as important as building.
{R4_CLOSE}`,
    },
    {
      option: 'Pick one part of what we just built and walk me through what it does. Not how I explained it — how YOU understand it. This is how you turn building into learning.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Lots built; one-part walk-through-in-own-words not done."}
Same moment, simpler: pick one part / own-understanding walk-through / building-into-learning.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Can you explain in your own words what the code we just wrote does? Take a moment.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Lots built."}
Lighter: own-words explanation of what was written.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Walk me through what we just built — in your own words.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Lots built."}
Minimum next step: own-words walk-through.
{R4_CLOSE}`,
    },
  ],
};
