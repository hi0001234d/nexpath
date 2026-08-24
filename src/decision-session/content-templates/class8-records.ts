/**
 * Role-cluster content-template records (class 8). One record per signal; column 3 is
 * the existing shipped headline (kept verbatim), and columns 1/2/4/5 escalate the same
 * practice from a quick step up to its heaviest form.
 *
 * These are the founder / indie-hacker / product-manager signals — the product-thinking
 * cluster: user value, outcomes, prioritisation, personas, competition, MVP scope,
 * acquisition, retention, feedback loops, hypotheses, direction balance, north-star
 * alignment, scale right-sizing, ship readiness, manual-first, stack complexity, launch,
 * early feedback, solo maintainability, distribution, monetization, build-in-public,
 * scope-vs-time, and the PM-formal discipline set (acceptance criteria, stakeholder
 * alignment, requirements ambiguity, dependency mapping, definition of done, cross-team
 * impact, success metrics, priority justification, user stories, risk, scope-change
 * impact, retrospectives). Each signal is single-register — 23 anchor on the casual
 * (founder / indie) headline, 12 on the formal (PM) headline; there is no third variant,
 * so column 3 is the frozen casual/formal L1[0]. Several casual anchors cite a named
 * principle and run long, so the option length budget exempts the frozen col-3.
 *
 * Thirty produce a written record at the heaviest column (a validation / outcome /
 * priority / persona / competitive / MVP / acquisition / retention / measurement /
 * hypothesis / north-star / right-sizing / ship-criteria / stack / launch / distribution
 * / monetization / scope-time note, or an acceptance-criteria / alignment / requirements
 * / dependency / definition-of-done / notification / metric / priority / user-story /
 * risk / impact / retrospective record). Five are ongoing cadences or habits whose
 * heaviest column stays a behaviour (no file): the product-direction check, manual-first
 * validation, early-user-feedback contact, solo-maintainability gate, and build-in-public
 * cadence.
 *
 * Four signals concern an intrinsically-sensitive action — publishing a launch, posting
 * publicly, contacting stakeholders for sign-off, and notifying other teams of a
 * shared-system change — so each carries the confirm-seek safeguard (the
 * `l2SafeguardRequired` flag + an action-specific `l2SafeguardLine` the engine appends as
 * the LAST line of every served column, covering the frozen col-3 anchor too). The
 * escalation is the product/PM practice deepening, so none threads a separate spine.
 */

import type { ContentTemplateRecord, LevelForm, ParamAxisTag } from '../content-template-schema.js';
import {
  USER_VALUE_CHECK_BEGINNER_OVERRIDE, OUTCOME_DEFINITION_BEGINNER_OVERRIDE, FEATURE_PRIORITIZATION_BEGINNER_OVERRIDE,
  USER_PERSONA_CLARITY_BEGINNER_OVERRIDE, COMPETITIVE_AWARENESS_BEGINNER_OVERRIDE, MVP_BOUNDARY_DISCIPLINE_BEGINNER_OVERRIDE,
  USER_ACQUISITION_CONSIDERATION_BEGINNER_OVERRIDE, RETENTION_MECHANISM_CHECK_BEGINNER_OVERRIDE,
  FEEDBACK_LOOP_ESTABLISHMENT_BEGINNER_OVERRIDE, HYPOTHESIS_BEFORE_BUILD_BEGINNER_OVERRIDE,
  TECHNICAL_VS_PRODUCT_TIME_BALANCE_BEGINNER_OVERRIDE, NORTH_STAR_ALIGNMENT_BEGINNER_OVERRIDE,
  TIME_TO_VALUE_CHECK_BEGINNER_OVERRIDE, SHIP_READINESS_DEFINITION_BEGINNER_OVERRIDE,
  MANUAL_BEFORE_AUTOMATE_BEGINNER_OVERRIDE, TECH_STACK_COMPLEXITY_CHECK_BEGINNER_OVERRIDE,
  LAUNCH_STRATEGY_ABSENCE_BEGINNER_OVERRIDE, EARLY_USER_FEEDBACK_BEGINNER_OVERRIDE,
  SOLO_MAINTAINABILITY_BEGINNER_OVERRIDE, DISTRIBUTION_THINKING_BEGINNER_OVERRIDE,
  MONETIZATION_PATH_CLARITY_BEGINNER_OVERRIDE, BUILD_IN_PUBLIC_OPPORTUNITY_BEGINNER_OVERRIDE,
  SCOPE_VS_TIME_CHECK_BEGINNER_OVERRIDE, ACCEPTANCE_CRITERIA_BEFORE_DEV_BEGINNER_OVERRIDE,
  STAKEHOLDER_ALIGNMENT_CHECK_BEGINNER_OVERRIDE, REQUIREMENTS_AMBIGUITY_FLAG_BEGINNER_OVERRIDE,
  DEPENDENCY_MAPPING_BEGINNER_OVERRIDE, DEFINITION_OF_DONE_BEGINNER_OVERRIDE,
  CROSS_TEAM_IMPACT_CHECK_BEGINNER_OVERRIDE, SUCCESS_METRIC_DEFINITION_BEGINNER_OVERRIDE,
  PRIORITY_JUSTIFICATION_BEGINNER_OVERRIDE, USER_STORY_COMPLETENESS_BEGINNER_OVERRIDE,
  RISK_FLAG_BEGINNER_OVERRIDE, SCOPE_CHANGE_IMPACT_ASSESSMENT_BEGINNER_OVERRIDE,
  RETROSPECTIVE_HABIT_BEGINNER_OVERRIDE,
} from './class8-records-beginner.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}

/** The param axes a role-cluster why-desc grounds (same generic sources as the other classes). */
export const CLASS8_PARAM_AXES: Readonly<Record<string, ParamAxisTag>> = {
  workflow_pattern: 'extensible',
  decision_making_rhythm: 'closed-ordinal',
  explanation_learning_depth: 'closed-ordinal',
  abstraction_level_orientation: 'closed-ordinal',
  project_framework: 'open',
};

// ── CASUAL-anchored signals (23 — founder / indie-hacker register) ─────────────

/** ABSENCE_USER_VALUE_CHECK — validate a user signal before building, keyword "signal". Produces a written note. */
export const ABSENCE_USER_VALUE_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_USER_VALUE_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: USER_VALUE_CHECK_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building this feature, name one user signal that says the problem is real — a request, a complaint, an observed behaviour.", "Just one user signal that the problem is real — a request, a complaint, an observed behaviour — before building this feature."),
    2: form("Gather the user signals you have for this feature — requests, conversations, observed behaviour — and judge whether they confirm the problem.", "Pull together the user signals you have — requests, conversations, observed behaviour — and judge whether they actually confirm the problem."),
    3: form("The single biggest waste in product development is building something nobody asked for. Lean Startup core loop: before any feature build, check whether you have a user signal — a conversation, a behavioral observation, a direct request, or survey data — that confirms the problem you're solving is real for your users. Without signal, you're making a bet, not a decision.", "Confirm you have a real user signal — a conversation, an observed behaviour, a direct request, survey data — that the problem is real before building; without signal it's a bet, not a decision."),
    4: form("Weigh the signal honestly: separate real user evidence (requests, behaviour, data) from your own assumption, and if the only signal is a hunch, get one piece of real evidence before building.", "Separate real user signal (requests, behaviour, data) from your own assumption, and if the only signal is a hunch, get one piece of real evidence before building."),
    5: form("Write a validation note: the user signals for this feature, how strong each is, and the gap to close — so the build rests on evidence, not a guess.", "Capture a validation note — the user signals for this feature, how strong each is, and the gap to close — so the build rests on evidence, not a guess."),
  },
};

/** ABSENCE_OUTCOME_DEFINITION — define the success outcome before building, keyword "outcome". Produces a written note. */
export const ABSENCE_OUTCOME_DEFINITION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_OUTCOME_DEFINITION', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: OUTCOME_DEFINITION_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building, write the one-sentence outcome: 'This feature is successful if [user behaviour] changes.'", "Just the one-sentence success outcome before building — the user-behaviour change that means it worked."),
    2: form("State the outcome this feature should produce — the user-behaviour change, not just the thing shipped — and how you'd notice it.", "Name the outcome this feature should produce — the user-behaviour change, not just the thing shipped — and how you'd notice it."),
    3: form("An output is something you ship. An outcome is the change in user behavior that justifies shipping it. The OKR discipline applied to product: before building, write one sentence that completes \"This feature is successful if...\". Without that sentence, you can't evaluate whether the feature worked, you can't communicate success criteria to teammates, and you can't decide when the feature is done enough to ship.", "Write the sentence that completes 'This feature is successful if…' — the user-behaviour change, not the thing shipped — so ship/no-ship can be judged against it."),
    4: form("Make the outcome measurable: name the behaviour change, the rough signal that proves it, and the point at which the feature is done enough to ship — so the outcome is evaluable, not a feeling.", "Turn the outcome measurable — name the behaviour change, the rough signal that proves it, and the point it's done enough to ship — so it's evaluable, not a feeling."),
    5: form("Write an outcome note: the success statement, the behaviour change it targets, the signal that confirms it, and the ship bar — the record ship/no-ship is judged against.", "Capture an outcome note — the success statement, the behaviour change it targets, the signal that confirms it, and the ship bar — the record ship/no-ship is judged against."),
  },
};

/** ABSENCE_FEATURE_PRIORITIZATION — justify build priority by impact, keyword "priorit". Produces a written note. */
export const ABSENCE_FEATURE_PRIORITIZATION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_FEATURE_PRIORITIZATION', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: FEATURE_PRIORITIZATION_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building this, name one reason its priority beats the next thing you could build instead.", "Just one reason this feature's priority beats the next thing you could build instead — named before building."),
    2: form("Compare this feature's priority to one or two alternatives by impact for the same effort, and pick deliberately.", "Weigh this feature's priority against one or two alternatives by impact for the same effort, and pick deliberately."),
    3: form("Building what comes to mind next — rather than what has the highest impact — is the feature factory pattern. Every hour of engineering time spent on a lower-impact feature is an hour not spent on a higher-impact one. Backlog prioritization question: what evidence suggests this feature delivers more value to users than any alternative you could build with the same engineering time?", "Ask what evidence says this feature delivers more value than any alternative you could build with the same engineering time — building the next thing that comes to mind is the feature-factory trap."),
    4: form("Rank by evidence: score this feature and its main alternatives on user impact versus engineering cost, and set the build priority by highest value — not the first that came to mind.", "Score this feature and its main alternatives on user impact versus engineering cost, and set build priority by highest value — not the first that came to mind."),
    5: form("Write a priority note: the candidate features ranked by impact and cost, the chosen one, and why it beat the rest — so build order follows value, not the feature-factory reflex.", "Capture a priority note — the candidate features ranked by impact and cost, the chosen one, and why it beat the rest — so build order follows value, not the feature-factory reflex."),
  },
};

/** ABSENCE_USER_PERSONA_CLARITY — name the specific user, keyword "user". Produces a written note. */
export const ABSENCE_USER_PERSONA_CLARITY_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_USER_PERSONA_CLARITY', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: USER_PERSONA_CLARITY_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Name the specific user this feature serves in one line — who they are and what they're trying to do.", "Just the specific user this feature serves, in one line — who they are and what they're trying to do."),
    2: form("Sketch the target user: who they are, the context they use the product in, and the goal this feature helps them reach.", "Pin the target user — who they are, the context they use the product in, and the goal this feature helps them reach."),
    3: form("Name the specific user this feature serves: 2 sentences describing who they are, what context they use the product in, and what they are trying to accomplish — concrete enough that a design decision can be tested against \"would Marcus understand this?\" rather than \"would users in general?\"", "Describe the specific user this feature serves in two sentences — who they are, the context they use it in, what they're accomplishing — concrete enough to test a design decision against \"would Marcus understand this?\" not \"would users in general?\""),
    4: form("Pressure-test the persona against real choices: take two design decisions in this feature and check each against this specific user — what they'd accept, what they'd reject — and fix the ones that only make sense for 'users in general'.", "Check two design decisions in this feature against the specific user — what they'd accept, what they'd reject — and fix the ones that only make sense for 'users in general'."),
    5: form("Write a persona note: the specific user, their context, goal, and what they'd reject — the anchor every design decision for this feature is tested against.", "Capture a persona note — the specific user, their context, goal, and what they'd reject — the anchor every design decision for this feature is tested against."),
  },
};

/** ABSENCE_COMPETITIVE_AWARENESS — check the competitive landscape, keyword "competit". Produces a written note. */
export const ABSENCE_COMPETITIVE_AWARENESS_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_COMPETITIVE_AWARENESS', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: COMPETITIVE_AWARENESS_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building this feature, check one thing: does a competitor already do it, and how?", "Just one competitive check before building this feature — does a competitor already do it, and how?"),
    2: form("Scan the main competitors for this feature: who has it, and roughly how well they do it.", "Check the main competitors for this feature — who has it, and roughly how well they do it."),
    3: form("Building a feature without knowing the competitive landscape means you're solving a problem that may already be solved — possibly better than you'll solve it. Before committing to any non-trivial feature, answer three questions: does a competitor already have this? If yes, how have they implemented it? And what would make your version a reason to switch rather than a reason to stay with the incumbent?", "Answer, before a non-trivial feature: does a competitor already have this, how did they implement it, and what would make yours a reason to switch rather than stay with the incumbent?"),
    4: form("Study the competitors' version: how they implement it, where they fall short, and the one thing that would make yours a competitive reason to switch — not just parity.", "Take apart the competitors' version — how they implement it, where they fall short, and the one thing that makes yours a competitive reason to switch, not just parity."),
    5: form("Write a competitive note: who already solves this, how, their gaps, and your differentiator — so the build improves on the incumbent instead of re-solving it worse.", "Capture a competitive note — who already solves this, how, their gaps, and your differentiator — so the build improves on the incumbent instead of re-solving it worse."),
  },
};

/** ABSENCE_MVP_BOUNDARY_DISCIPLINE — gate additions against the MVP hypothesis, keyword "mvp". Produces a written note. */
export const ABSENCE_MVP_BOUNDARY_DISCIPLINE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_MVP_BOUNDARY_DISCIPLINE', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: MVP_BOUNDARY_DISCIPLINE_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before adding this, ask: does it reduce uncertainty about the riskiest MVP hypothesis, or is it extra?", "Just whether this addition reduces uncertainty about the riskiest MVP hypothesis, or is extra — asked before adding it."),
    2: form("Test this addition against the MVP boundary: keep it only if it lowers risk on the core hypothesis, else defer.", "Put this addition against the MVP boundary — keep it only if it lowers risk on the core hypothesis, else defer."),
    3: form("Apply MVP discipline to this addition: name the riskiest hypothesis the MVP is meant to test, then state whether this addition reduces uncertainty about that hypothesis. If it does not, propose deferring it to post-validation scope.", "Name the riskiest hypothesis the MVP tests, then say whether this addition reduces uncertainty about it — if not, propose deferring it to post-validation scope."),
    4: form("Draw the MVP boundary explicitly: list what the MVP must prove, mark this addition in-scope or post-validation, and defer everything that doesn't reduce the core uncertainty.", "Set the MVP boundary explicitly — list what the MVP must prove, mark this addition in-scope or post-validation, and defer everything that doesn't reduce the core uncertainty."),
    5: form("Write an MVP scope note: the riskiest hypothesis, the minimum that tests it, and the deferred extras — the boundary the build holds to so it doesn't gold-plate.", "Capture an MVP scope note — the riskiest hypothesis, the smallest thing that tests it, and the deferred extras — the boundary the build holds to so it doesn't gold-plate."),
  },
};

/** ABSENCE_USER_ACQUISITION_CONSIDERATION — design how users find the feature, keyword "user". Produces a written note. */
export const ABSENCE_USER_ACQUISITION_CONSIDERATION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_USER_ACQUISITION_CONSIDERATION', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: USER_ACQUISITION_CONSIDERATION_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building this feature, name one way a target user actually finds and starts using it — its acquisition path.", "Just one way a target user actually finds and starts using this feature — its acquisition path, named before building."),
    2: form("Sketch how target users reach this feature: the channel they come through and the hook that draws them in.", "Map how target users reach this feature — the channel they come through and the hook that draws them in."),
    3: form("A feature's value is zero for any user who never encounters it. Distribution fit is as important as product-market fit — and it has to be designed in, not discovered after launch. Before committing to a feature build, answer: what is the specific path through which target users will find and start using this feature? SEO, referral loop, in-app discovery, sharing mechanic, onboarding hook, community post — name the channel.", "Name the specific path target users take to find and start using this feature — SEO, referral loop, in-app discovery, sharing mechanic, onboarding hook, community post — since value is zero for a user who never encounters it."),
    4: form("Design the path into the feature: pick the specific channel (SEO, referral, in-app), and shape the build so a new user discovers it — not hopes to after launch.", "Build the discovery path in — pick the specific channel (SEO, referral, in-app) and shape the feature so a new user finds it, not hopes to after launch."),
    5: form("Write an acquisition note: the channel target users arrive through, the discovery hook, and how the build supports it — so the feature reaches users instead of staying invisible.", "Capture an acquisition note — the channel target users arrive through, the discovery hook, and how the build supports it — so the feature reaches users instead of staying invisible."),
  },
};

/** ABSENCE_RETENTION_MECHANISM_CHECK — name why users return, keyword "retention". Produces a written note. */
export const ABSENCE_RETENTION_MECHANISM_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_RETENTION_MECHANISM_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: RETENTION_MECHANISM_CHECK_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building this feature, name one reason a user comes back to it after the first use — its retention hook.", "Just one reason a user comes back to this feature after first use — its retention hook, named before building."),
    2: form("Sketch the retention angle: why this feature pulls a user back, and how one use makes the next more likely.", "Pin the retention angle — why this feature pulls a user back, and how one use makes the next more likely."),
    3: form("Features that acquire users but don't retain them have diminishing returns forever. Every significant feature should have an answer to: why does a user return to this feature after the first use, and how does using it once make the next use more likely? Without a retention angle, you're building acquisition features, not engagement features.", "Answer why a user returns to this feature after first use and how using it once makes the next use more likely — without a retention angle it acquires users but doesn't bring them back."),
    4: form("Pick the one trigger that reliably brings users back — a notification, saved state, a streak — and design that single retention loop well, then name the return-rate it should move; one real hook beats three vague ones.", "Choose the one trigger that reliably brings users back — a notification, saved state, a streak — and design that single retention loop well, then name the return-rate it should move; one real hook beats three vague ones."),
    5: form("Write a retention note: the return trigger, the repeat value, the loop that compounds use, and the return-rate it should move — so the feature keeps users, not just attracts them once.", "Capture a retention note — the return trigger, the repeat value, the loop that compounds use, and the return-rate it should move — so the feature keeps users, not just attracts them once."),
  },
};

/** ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT — set post-ship measurement, keyword "measure". Produces a written note. */
export const ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: FEEDBACK_LOOP_ESTABLISHMENT_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before shipping, name one thing you'll measure to know whether this feature worked.", "Just one thing you'll measure to know whether this feature worked — set before shipping."),
    2: form("Decide how you'll measure this feature post-ship — the metric and where it's captured — before it goes out.", "Settle how you'll measure this feature post-ship — the metric and where it's captured — before it goes out."),
    3: form("Shipping without a way to measure whether the feature worked means the engineering investment produces no validated learning. The Lean Startup loop: Build → Measure → Learn. Skipping the Measure step after Build means the loop stops at the most expensive point and never produces the insight that informs the next build. Define your measurement mechanism before shipping, not after.", "Define the measurement mechanism before shipping — Build→Measure→Learn stops at the most expensive point if you skip Measure — so the build produces validated learning, not just code."),
    4: form("Close the Build-Measure-Learn loop: define the measure before shipping, where the data lands, and the decision each result drives — so shipping produces learning, not just code.", "Wire the measure to a decision — define it before shipping, where the data lands, and the decision each result drives — so shipping produces learning, not just code."),
    5: form("Write a measurement note: what this feature must move, how it's measured, where the data lands, and the next decision each outcome triggers — the loop that turns the build into insight.", "Capture a measurement note — what this feature must move, how it's measured, where the data lands, and the next decision each outcome triggers — the loop that turns the build into insight."),
  },
};

/** ABSENCE_HYPOTHESIS_BEFORE_BUILD — write a falsifiable hypothesis, keyword "hypothesis". Produces a written note. */
export const ABSENCE_HYPOTHESIS_BEFORE_BUILD_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_HYPOTHESIS_BEFORE_BUILD', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: HYPOTHESIS_BEFORE_BUILD_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building, write the one-line hypothesis: '[change] will cause [outcome] for [user].'", "Just the one-line hypothesis before building — '[change] will cause [outcome] for [user].'"),
    2: form("State the feature hypothesis: the change, the expected outcome, the user, and the signal you'd watch for.", "Set out the feature hypothesis — the change, the expected outcome, the user, and the signal you'd watch for."),
    3: form("Write the experiment hypothesis for this feature in the form: \"We believe [feature/change] will cause [observable outcome] for [user type]. We will know this is true when [signal] appears within [timeframe].\" If any bracket cannot be filled, propose what data or decision would resolve it before continuing.", "Fill the hypothesis form — 'We believe [change] will cause [outcome] for [user]; we'll know when [signal] appears within [timeframe]' — and if a bracket can't be filled, say what data or decision would resolve it first."),
    4: form("Add the falsification condition to the hypothesis: beyond the success signal, state the result that would prove it WRONG and the threshold at which you'd kill or pivot — so the experiment can actually fail, not just confirm.", "Give the hypothesis a falsification condition — past the success signal, the result that would prove it WRONG and the threshold to kill or pivot — so the experiment can actually fail, not just confirm."),
    5: form("Write the hypothesis note: the believed change, the observable outcome, the user, the proof signal, the timeframe, and the result that would disprove it — the testable claim the build is then evaluated against.", "Capture the hypothesis note — the believed change, the observable outcome, the user, the proof signal, the timeframe, and the result that would disprove it — the testable claim the build is evaluated against."),
  },
};

/** ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE — periodic product-direction check, keyword "direction". Behavioural cadence. */
export const ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: TECHNICAL_VS_PRODUCT_TIME_BALANCE_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Pause and run a quick product-direction check: is this still the right feature for the right user?", "Just a quick product-direction check — is this still the right feature for the right user? — before continuing."),
    2: form("Sample the recent work by type — implementation versus product-direction — and if it's all implementation, answer one direction question before continuing.", "Look at the recent work by type — implementation versus product-direction — and if it's all implementation, answer one direction question before continuing."),
    3: form("Pause implementation and run a product-direction check: count the last 10-15 prompts by category (implementation instructions vs product-direction questions). If heavily skewed to implementation, answer one product question before continuing — is this still the right feature to be building for the right user toward the right outcome?", "Count the last 10-15 prompts by category — implementation versus product-direction — and if heavily skewed to implementation, answer one product question before more code: is this still the right feature, user, and outcome?"),
    4: form("Set a direction target and act on it: decide the healthy implementation-to-product balance, and when a stretch breaches it, write the one product-direction decision to make before more code — not just a yes/no.", "Pick a direction target — the healthy implementation-to-product balance — and when a stretch breaches it, write the one product-direction decision to make before more code, not just a yes/no."),
    5: form("Make the product-direction check a standing cadence: every stretch of heads-down implementation pauses for a direction check on feature, user, and outcome — so build effort stays pointed the right way.", "Hold the product-direction check as a standing cadence — every stretch of heads-down implementation pauses for a direction check on feature, user, and outcome — so build effort stays pointed the right way."),
  },
};

/** ABSENCE_NORTH_STAR_ALIGNMENT — trace the feature to the north star metric, keyword "north". Produces a written note. */
export const ABSENCE_NORTH_STAR_ALIGNMENT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_NORTH_STAR_ALIGNMENT', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: NORTH_STAR_ALIGNMENT_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building this, trace it to the north star metric in one step — how does it move the metric?", "Just the feature traced to the north star metric in one step — how does it move the metric? — before building."),
    2: form("Connect this feature to the north star: state the direct move or the downstream feature it enables that moves it.", "Tie this feature to the north star — the direct move, or the downstream feature it enables that moves it."),
    3: form("Trace this feature to the product's north star metric in one or two steps: state how it moves the metric directly, or how it enables a downstream feature that does. If no traceable connection exists, propose deferring or removing it.", "Follow this feature to the north star metric in one or two steps — how it moves the metric directly, or the downstream feature it enables — and if no connection exists, propose deferring or removing it."),
    4: form("Quantify the north-star link: estimate how much this feature should move the metric and over what horizon, and rank it against the other candidates by that expected movement — so traceable-but-tiny contributions are caught too.", "Estimate the north-star link — how much this feature should move the metric and over what horizon — and rank it against the other candidates by that movement, so traceable-but-tiny contributions are caught."),
    5: form("Write a north-star note: the feature, the metric it moves, the path (direct or enabling), the expected movement, and how it ranks against alternatives — so scope stays tethered to the core metric.", "Capture a north-star note — the feature, the metric it moves, the path (direct or enabling), the expected movement, and its rank against alternatives — so scope stays tethered to the core metric."),
  },
};

/** ABSENCE_TIME_TO_VALUE_CHECK — right-size for current scale, keyword "scale". Produces a written note. */
export const ABSENCE_TIME_TO_VALUE_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_TIME_TO_VALUE_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: TIME_TO_VALUE_CHECK_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building, right-size for current scale: what's the simplest tech that solves this at today's user count?", "Just the simplest tech that solves this at today's user count — right-sized for current scale before building."),
    2: form("Match the solution to current scale: name today's load and the simplest approach that handles it, deferring heavier infrastructure.", "Fit the solution to current scale — today's load and the simplest approach that handles it, deferring heavier infrastructure."),
    3: form("Right-size this solution for current scale: name the current user count, name the simplest technology that solves the problem at that scale (a database query, a single API call, a flat file), and propose using it. Defer infrastructure complexity until scale actually requires it.", "Name the current user count and the simplest technology that solves the problem at that scale — a database query, a single API call, a flat file — and defer infrastructure complexity until scale actually requires it."),
    4: form("Right-size against real scale, not hoped-for scale: name the current user count, pick the simplest thing that works there, and note the threshold at which more complexity is justified.", "Size against real scale, not hoped-for scale — the current user count, the simplest thing that works there, and the threshold at which more complexity is justified."),
    5: form("Write a right-sizing note: the current scale, the simplest solution that fits it, and the trigger that would justify more — so complexity arrives when scale demands it, not before.", "Capture a right-sizing note — the current scale, the simplest solution that fits it, and the trigger that would justify more — so complexity arrives when scale demands it, not before."),
  },
};

/** ABSENCE_SHIP_READINESS_DEFINITION — write binary ship criteria, keyword "ship". Produces a written note. */
export const ABSENCE_SHIP_READINESS_DEFINITION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SHIP_READINESS_DEFINITION', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: SHIP_READINESS_DEFINITION_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before adding more, write one binary ship condition that must be true to ship this.", "Just one binary ship condition that must be true to ship this — written before adding more."),
    2: form("List the must-be-true conditions to ship this build — binary, checkable — before layering more on.", "Set down the must-be-true conditions to ship this build — binary, checkable — before layering more on."),
    3: form("Write the ship criteria for this build before more is added: list the specific, binary conditions that must be true to ship — \"users can sign up\", \"the core workflow completes end-to-end\", etc. This list is your Definition of Done; everything beyond it is post-launch scope.", "List the specific binary conditions that must be true to ship this build — 'users can sign up', 'the core workflow completes end-to-end' — as the Definition of Done; everything past it is post-launch scope."),
    4: form("Turn ship-readiness into a gated checklist: each condition binary and testable, with anything beyond it marked explicitly post-launch — so 'ready to ship' is a checklist, not a feeling.", "Make ship-readiness a gated checklist — each condition binary and testable, anything past it marked post-launch — so 'ready to ship' is a checklist, not a feeling."),
    5: form("Write a ship-criteria note: the binary conditions that define done, the explicit post-launch scope, and the current status of each — the gate that ends 'not ready to ship yet'.", "Capture a ship-criteria note — the binary conditions that define done, the explicit post-launch scope, and the current status of each — the gate that ends 'not ready to ship yet'."),
  },
};

/** ABSENCE_MANUAL_BEFORE_AUTOMATE — validate by hand before automating, keyword "manual". Behavioural habit. */
export const ABSENCE_MANUAL_BEFORE_AUTOMATE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_MANUAL_BEFORE_AUTOMATE', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: MANUAL_BEFORE_AUTOMATE_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before automating this, do it manually once and see what actually happens.", "Just do this manually once and see what actually happens, before automating it."),
    2: form("Run this workflow manually for the first users, noting where your assumptions about it were wrong, before building automation.", "Walk this workflow manually for the first users — noting where your assumptions were wrong — before building automation."),
    3: form("Apply Paul Graham's \"do things that don't scale\" rule: do this workflow manually for the first users before automating it. Run the process by hand, capture what users actually need vs what you assumed, and only then automate the validated version.", "Do this workflow manually for the first users before automating — run it by hand, capture what users actually need versus what you assumed, and only then automate the validated version."),
    4: form("Track the manual runs to find what's worth automating: note where each run is slow, error-prone, or repetitive, and automate only the one step the data shows is the real bottleneck — not the whole workflow on a guess.", "Watch the manual runs to find what's worth automating — where each is slow, error-prone, or repetitive — and automate only the one step the data shows is the real bottleneck, not the whole workflow on a guess."),
    5: form("Make manual-first the standing rule: every new workflow is run by hand until it's understood, and only the proven version gets automated — so automation never locks in a wrong guess.", "Hold manual-first as the standing rule — every new workflow is run by hand until it's understood, and only the proven version gets automated — so automation never locks in a wrong guess."),
  },
};

/** ABSENCE_TECH_STACK_COMPLEXITY_CHECK — choose a solo-maintainable stack, keyword "stack". Produces a written note. */
export const ABSENCE_TECH_STACK_COMPLEXITY_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_TECH_STACK_COMPLEXITY_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: TECH_STACK_COMPLEXITY_CHECK_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before adding to the stack, ask: can I maintain this alone, or is it just impressive?", "Just whether you can maintain this stack alone, or it's only impressive — asked before adding to it."),
    2: form("Weigh this stack choice for solo upkeep: the debugging, extending, and re-understanding you'll own alone.", "Judge this stack choice for solo upkeep — the debugging, extending, and re-understanding you'll own alone."),
    3: form("Every technology choice for a solo indie project is a choice you'll maintain alone — debugging it at 2am, extending it when requirements change, understanding it after 3 months away. Complexity that would be distributed across a team of engineers is complexity a solo builder pays in full. The right lens: \"is this the simplest stack I can maintain alone, or is this the most impressive stack I can technically justify?\"", "Ask the right lens on any technology choice — is this the simplest stack I can maintain alone, or the most impressive I can technically justify? — since complexity a team would share, a solo builder pays in full."),
    4: form("Compare stack options on maintenance cost, not capability: pick the simplest one you can debug at 2am alone, and justify any added complexity by a need you actually have now.", "Weigh stack options on maintenance cost, not capability — pick the simplest one you can debug at 2am alone, and justify any added complexity by a need you actually have now."),
    5: form("Write a stack-decision note: the choice, the simpler alternative, the solo maintenance each carries, and why the pick is owned-alone-able — so the stack stays maintainable, not impressive.", "Capture a stack-decision note — the choice, the simpler alternative, the solo maintenance each carries, and why the pick is owned-alone-able — so the stack stays maintainable, not impressive."),
  },
};

/** ABSENCE_LAUNCH_STRATEGY_ABSENCE — draft a launch plan, keyword "launch". Produces a written note. SENSITIVE (publish). */
export const ABSENCE_LAUNCH_STRATEGY_ABSENCE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_LAUNCH_STRATEGY_ABSENCE', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: LAUNCH_STRATEGY_ABSENCE_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  l2SafeguardRequired: true,
  l2SafeguardLine: "Before you publish or announce this launch publicly, ask me for go-ahead confirmation first.",
  levelForms: {
    1: form("Before shipping, name one channel where you'll announce this launch.", "Just one channel where you'll announce this launch — named before shipping."),
    2: form("Sketch a minimum launch plan: the channel, a draft announcement, and who should see it.", "Draft a minimum launch plan — the channel, a draft announcement, and who should see it."),
    3: form("Shipping without a launch plan means launching into silence. Good products do not attract users by themselves — distribution is a discipline that must be planned and executed, not discovered. The minimum viable launch strategy: name one specific channel where you will announce this product, write the post before launch day, and identify who in your network or community should see it. That's a launch plan.", "Draft the launch plan before launch day — name one specific channel to announce on, write the post ahead of time, and identify who in your network or community should see it — since good products don't attract users by themselves."),
    4: form("Sequence the launch to execute: order the channels, write each post, line up the specific people to notify on launch day, and decide what happens if the first channel underperforms — an executable plan, not a list.", "Turn the launch plan into an executable sequence — order the channels, write each post, line up the specific people to notify on launch day, and decide what happens if the first channel underperforms."),
    5: form("Write a launch note: the announcement channels in order, the drafted posts, the network to reach, the launch-day sequence, and the fallback if a channel underperforms — the distribution plan that keeps the ship from launching into silence.", "Capture a launch note — the announcement channels in order, the drafted posts, the network to reach, the launch-day sequence, and the fallback if a channel underperforms — the distribution plan that keeps the ship from launching into silence."),
  },
};

/** ABSENCE_EARLY_USER_FEEDBACK — show the build to a real user, keyword "user". Behavioural cadence. */
export const ABSENCE_EARLY_USER_FEEDBACK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_EARLY_USER_FEEDBACK', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: EARLY_USER_FEEDBACK_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building more, show the current build to one real user and watch their reaction.", "Just show the current build to one real user and watch their reaction, before building more."),
    2: form("Get the build in front of a real user today — a quick screen-share or walk-through — and capture what they actually do, not what you expected.", "Put the build in front of a real user today — a quick screen-share or walk-through — and capture what they actually do, not what you expected."),
    3: form("Break out of silo-building before more is built: identify one real user to show the current build to today — for a 10-minute screen-share, a Loom walk-through, or a screenshot review. Capture their actual reaction, not your interpretation, and adjust direction based on what you see.", "Show the current build to one real user today — a 10-minute screen-share, a Loom walk-through, a screenshot review — capture their actual reaction, not your interpretation, and adjust direction from what you see."),
    4: form("Watch a user use it without your guidance: note where they hesitate or go wrong, separate their real reaction from your interpretation, and adjust direction from what you saw.", "Observe a user using it without your guidance — where they hesitate or go wrong — separate their real reaction from your interpretation, and adjust direction from what you saw."),
    5: form("Make regular user contact the standing habit: show the build to a real user on a steady cadence and steer from their reactions — so the work never drifts back into a silo.", "Hold steady real-user contact as the standing habit — show the build to a real user on a regular cadence and steer from their reactions — so the work never drifts back into a silo."),
  },
};

/** ABSENCE_SOLO_MAINTAINABILITY — gate additions on solo-ownability, keyword "solo". Behavioural gate. */
export const ABSENCE_SOLO_MAINTAINABILITY_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SOLO_MAINTAINABILITY', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: SOLO_MAINTAINABILITY_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before adding this, ask: can I own the whole thing alone when it breaks? Keep it solo-ownable.", "Just whether you can own the whole thing alone when it breaks — kept solo-ownable before adding it."),
    2: form("Weigh the solo cost of this addition: the debugging, extending, and re-understanding you'll carry without help.", "Count the solo cost of this addition — the debugging, extending, and re-understanding you'll carry without help."),
    3: form("Every integration, service, or abstraction you add to a solo project is complexity you'll maintain alone — debugging it in production, extending it when requirements change, understanding it after weeks away. The solo maintainability question is not \"does this work?\" but \"can I own the full blast radius of this when it breaks, by myself, without help?\" If the answer requires reading documentation for 30 minutes every time something goes wrong, the complexity cost is real and ongoing.", "Ask not just 'does this work?' but 'can I own the full blast radius alone when it breaks, without help?' — every integration or abstraction on a solo project is complexity you maintain alone."),
    4: form("Weigh it against doing without: compare this addition's solo blast radius to the simplest alternative — or none at all — and keep it only if the capability clearly beats the ongoing cost of owning it alone.", "Compare this addition's solo blast radius to the simplest alternative — or none at all — and keep it only if the capability clearly beats the ongoing cost of owning it alone."),
    5: form("Make solo-ownability a standing gate: every integration or abstraction must be one you can debug and extend alone before it goes in — so the solo project stays solo-maintainable.", "Hold solo-ownability as a standing gate — every integration or abstraction must be one you can debug and extend alone before it goes in — so the solo project stays solo-maintainable."),
  },
};

/** ABSENCE_DISTRIBUTION_THINKING — design the discovery path, keyword "distribution". Produces a written note. */
export const ABSENCE_DISTRIBUTION_THINKING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DISTRIBUTION_THINKING', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: DISTRIBUTION_THINKING_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building this feature, name how a new user discovers it exists — the distribution path.", "Just how a new user discovers this feature exists — its distribution path, named before building."),
    2: form("Sketch the distribution design for this feature: how a new user finds and reaches it the first time.", "Map the distribution design for this feature — how a new user finds and reaches it the first time."),
    3: form("Distribution is a design constraint, not a marketing task. Features that assume users will discover them organically are features built on distribution magic. Before building any significant feature, answer: what is the specific path through which a new user discovers this feature exists and reaches it for the first time? The answer shapes the implementation — SEO-friendly URLs, in-product sharing mechanics, referral hooks, and community-compatible output formats are all distribution design, not afterthoughts.", "Name the specific path a new user takes to discover this feature and reach it the first time — SEO-friendly URLs, in-product sharing, referral hooks, community-compatible output are all distribution design, not afterthoughts."),
    4: form("Pick the one distribution mechanic that fits and design it end-to-end: trace a brand-new user from the channel to first use, and build the specific hook that carries them across — one path made real, not five listed.", "Choose the one distribution mechanic that fits and design it end-to-end — trace a brand-new user from channel to first use, and build the specific hook that carries them across, one path made real, not five listed."),
    5: form("Write a distribution note: the discovery path to first use, the in-product mechanics that support it, and where the build must change — so the feature is reachable by design.", "Capture a distribution note — the discovery path to first use, the in-product mechanics that support it, and where the build must change — so the feature is reachable by design."),
  },
};

/** ABSENCE_MONETIZATION_PATH_CLARITY — articulate the revenue link, keyword "monetization". Produces a written note. */
export const ABSENCE_MONETIZATION_PATH_CLARITY_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_MONETIZATION_PATH_CLARITY', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: MONETIZATION_PATH_CLARITY_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building this feature, name how it connects to the revenue model — its monetization link, even indirectly.", "Just how this feature connects to the revenue model — its monetization link, even indirectly — named before building."),
    2: form("State this feature's monetization link: direct revenue, or a retention/LTV path — not just 'makes it better'.", "Name this feature's monetization link — direct revenue, or a retention/LTV path — not just 'makes it better'."),
    3: form("Building features without monetization awareness builds a free product by default — regardless of intent. Every significant feature should have an articulated answer to \"how does this connect to the revenue model?\" It doesn't need to be direct: \"this is a retention feature that reduces churn, which improves LTV\" is a valid connection. \"This makes the product better\" is not — it's the answer that leads to technically excellent, commercially unsustainable products.", "Answer how this feature connects to the revenue model — 'a retention feature that reduces churn, improving LTV' counts; 'makes the product better' doesn't — since building without monetization awareness ships a free product by default."),
    4: form("Trace the monetization to a specific lever: name which revenue lever this feature moves (new conversions, retention, expansion) and roughly how much, and if it moves none, decide build-now versus defer.", "Tie the monetization to a specific lever — which revenue lever this feature moves (new conversions, retention, expansion) and roughly how much — and if it moves none, decide build-now versus defer."),
    5: form("Write a monetization note: the feature, the specific revenue lever it moves (direct or via retention/LTV), the rough magnitude, and the build-or-defer call — so the product earns by design, not free by default.", "Capture a monetization note — the feature, the specific revenue lever it moves (direct or via retention/LTV), the rough magnitude, and the build-or-defer call — so the product earns by design, not free by default."),
  },
};

/** ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY — share milestones publicly, keyword "public". Behavioural cadence. SENSITIVE (publish). */
export const ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: BUILD_IN_PUBLIC_OPPORTUNITY_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  l2SafeguardRequired: true,
  l2SafeguardLine: "Before you publish this post to any public channel, ask me for go-ahead confirmation first.",
  levelForms: {
    1: form("Consider sharing this milestone publicly — a short post on what you shipped and learned.", "Just a short public post on this milestone — what you shipped and learned — considered before moving on."),
    2: form("Draft a short public update on this milestone — what shipped, what you learned — to share with your audience.", "Put together a short public update on this milestone — what shipped, what you learned — for your audience."),
    3: form("Share this milestone publicly today before continuing: draft a short post (tweet, Loom, community update) describing what you just shipped and what you learned. Audiences built during the build survive launch-day failures; audiences built launch-week do not.", "Draft a short public post on what you just shipped and learned — a tweet, Loom, or community update — since an audience built during the build survives launch-day failures, one built launch-week doesn't."),
    4: form("Make the public update count: show the real progress and the lesson, not just the win, so an audience that follows the build forms before launch day — when it matters most.", "Give the public update substance — show the real progress and the lesson, not just the win — so an audience that follows the build forms before launch day, when it matters most."),
    5: form("Make building in public a standing cadence: share milestones and lessons publicly as you go, so an audience accrues during the build and survives a rough launch.", "Hold building in public as a standing cadence — share milestones and lessons publicly as you go — so an audience accrues during the build and survives a rough launch."),
  },
};

/** ABSENCE_SCOPE_VS_TIME_CHECK — trade scope against the timeline, keyword "scope". Produces a written note. */
export const ABSENCE_SCOPE_VS_TIME_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SCOPE_VS_TIME_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: SCOPE_VS_TIME_CHECK_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before adding more, check scope against the deadline: is the ship date still realistic at this scope?", "Just scope checked against the deadline — is the ship date still realistic at this scope? — before adding more."),
    2: form("Compare current scope to the timeline: estimate the ship date at this pace against the original target.", "Estimate the ship date at this pace against the original target — current scope weighed against the timeline."),
    3: form("Run the scope-vs-time check on this build before more is added: name the current scope, estimate the shipping date at current pace, and compare to the original target. If the date has slipped twice in a row, cut scope to fit the original timeline — list specifically what gets deferred to post-launch.", "Name the current scope, estimate the shipping date at current pace, and compare to the original target — if the date has slipped twice in a row, cut scope to fit the original timeline and list what's deferred to post-launch."),
    4: form("Trade scope against time deliberately: if the date has slipped twice, cut scope to fit the original timeline and name exactly what's deferred — rather than letting scope expand silently.", "Cut scope against time deliberately — if the date has slipped twice, trim to fit the original timeline and name exactly what's deferred — rather than letting scope expand silently."),
    5: form("Write a scope-versus-time note: the current scope, the projected date, the gap, and what's cut to hold the timeline — so scope and schedule stay honest with each other.", "Capture a scope-versus-time note — the current scope, the projected date, the gap, and what's cut to hold the timeline — so scope and schedule stay honest with each other."),
  },
};

// ── FORMAL-anchored signals (12 — product-manager register) ─────────────────────

/** ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV — verifiable acceptance criteria, keyword "acceptance". Produces a written note. */
export const ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: ACCEPTANCE_CRITERIA_BEFORE_DEV_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before implementing, write one acceptance criterion: a verifiable condition that says this story is done.", "Just one acceptance criterion before implementing — a verifiable condition that says this story is done."),
    2: form("Draft the main acceptance criteria for this story as checkable conditions before any implementation prompt.", "Set out the main acceptance criteria for this story as checkable conditions before any implementation prompt."),
    3: form("Write the acceptance criteria for this story before any implementation prompt: state each criterion as an independently verifiable condition, in Given/When/Then or \"this is done when [X]\" form. List at least three covering the primary scenario and the most likely edge case.", "State each acceptance criterion as an independently verifiable condition — Given/When/Then or 'this is done when [X]' — at least three covering the primary scenario and the most likely edge case, before any implementation."),
    4: form("Pair each acceptance criterion with how it's checked — the test or manual step that proves it — and add at least one negative criterion (what must NOT happen), so the criteria drive verification, not just description.", "Attach to each acceptance criterion how it's checked — the test or manual step that proves it — plus at least one negative criterion (what must NOT happen), so the criteria drive verification, not just description."),
    5: form("Write the acceptance-criteria note onto the story: each criterion as a verifiable condition with the check that proves it, plus at least one negative case, across primary and edge scenarios — the target implementation is built and checked against.", "Capture the acceptance-criteria note onto the story — each criterion as a verifiable condition with the check that proves it, plus at least one negative case, across primary and edge scenarios — the target implementation is built and checked against."),
  },
};

/** ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK — confirm stakeholder alignment, keyword "stakeholder". Produces a written note. SENSITIVE (contact). */
export const ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: STAKEHOLDER_ALIGNMENT_CHECK_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  l2SafeguardRequired: true,
  l2SafeguardLine: "Before you contact any stakeholder for sign-off, ask me for go-ahead confirmation first.",
  levelForms: {
    1: form("Before building, name the one stakeholder whose sign-off this feature most needs.", "Just the one stakeholder whose sign-off this feature most needs — named before building."),
    2: form("List the stakeholders with a stake in this feature and the alignment each needs — sign-off, review, consult.", "Name the stakeholders with a stake in this feature and the alignment each needs — sign-off, review, consult."),
    3: form("Identify every stakeholder with a legitimate opinion on this feature, name the alignment touchpoint required for each (sign-off, design review, security review, eng-lead consult), and confirm each is completed or scheduled before implementation begins. Document the date and outcome.", "Map every stakeholder with a legitimate opinion on this feature, name the alignment touchpoint each needs (sign-off, design review, security review, eng-lead consult), and confirm each is completed or scheduled before implementation — recording date and outcome."),
    4: form("Order the alignment by risk: identify the stakeholder most likely to block or reject, align that one before sinking build time, and surface any conflicting stakeholder positions to resolve before implementation.", "Sort the alignment by risk — align the stakeholder most likely to block or reject before sinking build time — and surface any conflicting stakeholder positions to resolve before implementation."),
    5: form("Write a stakeholder-alignment note: each stakeholder in risk order, their required touchpoint, the date, the outcome, and any conflicts to resolve — so implementation starts on confirmed alignment, not assumed agreement.", "Capture a stakeholder-alignment note — each stakeholder in risk order, their required touchpoint, the date, the outcome, and any conflicts to resolve — so implementation starts on confirmed alignment, not assumed agreement."),
  },
};

/** ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG — convert ambiguity to measurable targets, keyword "ambig". Produces a written note. */
export const ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: REQUIREMENTS_AMBIGUITY_FLAG_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building, flag one ambiguous word in the requirements ('better', 'fast') and pin a number to it.", "Just one ambiguous word in the requirements ('better', 'fast') pinned to a number, before building."),
    2: form("Scan the requirements for ambiguous quality words and replace each with a measurable target.", "Find the ambiguous quality words in the requirements and replace each with a measurable target."),
    3: form("Audit this feature's requirements for ambiguity: identify every quality-attribute placeholder (\"better\", \"faster\", \"improved\", \"user-friendly\") and replace each with a measurable target — name the metric, the measurement method, and the success threshold.", "Find every quality-attribute placeholder ('better', 'faster', 'improved', 'user-friendly') and replace each with a measurable target — the metric, the measurement method, and the success threshold."),
    4: form("Pin each de-ambiguated target to a source and an owner: name where the metric is measured and who agrees the threshold is right, so the once-ambiguous requirement can't be quietly reinterpreted later.", "Tie each de-ambiguated target to a source and an owner — where the metric is measured and who agrees the threshold is right — so the once-ambiguous requirement can't be quietly reinterpreted later."),
    5: form("Write a requirements note: each previously-ambiguous attribute with its metric, measurement method, success threshold, measurement source, and the owner who agreed it — so requirement satisfaction is evaluable, not arguable.", "Capture a requirements note — each previously-ambiguous attribute with its metric, measurement method, success threshold, measurement source, and the owner who agreed it — so requirement satisfaction is evaluable, not arguable."),
  },
};

/** ABSENCE_DEPENDENCY_MAPPING — map upstream/downstream dependencies, keyword "dependenc". Produces a written note. */
export const ABSENCE_DEPENDENCY_MAPPING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DEPENDENCY_MAPPING', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: DEPENDENCY_MAPPING_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before starting, name one dependency: one thing this work depends on, and one thing that depends on it.", "Just one dependency named before starting — one thing this work depends on, and one thing that depends on it."),
    2: form("Sketch this work's dependencies: what it waits on upstream and what waits on it downstream.", "Map this work's dependencies — what it waits on upstream and what waits on it downstream."),
    3: form("Dependency identification is a foundational project management discipline (WBS, critical path method). Before any work begins: what does this work depend on (upstream), and what depends on this work completing (downstream)? Unmapped upstream dependencies create blocked work discovered mid-sprint; unmapped downstream dependencies create integration surprises at the worst time — when another team has built against an unstated assumption.", "Name what this work depends on (upstream) and what depends on it completing (downstream) — unmapped upstream dependencies block work mid-sprint; unmapped downstream ones surprise another team that built against an unstated assumption."),
    4: form("Turn the dependency map into an order: clear the upstream blocker on the critical path first, and tell each downstream consumer the assumption it's relying on before it builds against it.", "Sequence the dependency map — clear the upstream blocker on the critical path first, and tell each downstream consumer the assumption it's relying on before it builds against it."),
    5: form("Write a dependency note: the upstream blockers in critical-path order and the downstream consumers told of the assumptions they rely on — so blocked work and integration surprises are seen early.", "Capture a dependency note — the upstream blockers in critical-path order and the downstream consumers told of the assumptions they rely on — so blocked work and integration surprises are seen early."),
  },
};

/** ABSENCE_DEFINITION_OF_DONE — write the Definition of Done, keyword "done". Produces a written note. */
export const ABSENCE_DEFINITION_OF_DONE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DEFINITION_OF_DONE', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: DEFINITION_OF_DONE_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before starting, write one condition that must be true for this item to count as done.", "Just one condition that must be true for this item to count as done — written before starting."),
    2: form("Sketch the Definition of Done for this item: the functional result plus the quality and doc bars.", "Set out the Definition of Done for this item — the functional result plus the quality and doc bars."),
    3: form("Write the Definition of Done for this sprint item before work begins: state the functional condition, the quality gate (testing or review pass), the documentation requirement, and the target deployment state. Use the form \"this item is done when [X] AND [Y].\"", "State the Definition of Done before work begins — the functional condition, the quality gate (testing or review pass), the documentation requirement, and the target deployment state — as 'this item is done when [X] AND [Y].'"),
    4: form("Make each Done condition checkable by someone else: phrase it so a reviewer can confirm it without asking you — a passing test, a visible output, a merged doc — and agree it before work starts, not at review.", "Phrase each Done condition so a reviewer can confirm it without asking you — a passing test, a visible output, a merged doc — and agree it before work starts, not at review."),
    5: form("Write the Definition-of-Done note onto the item: the functional, quality, documentation, and deployment conditions — the shared bar that ends sprint-review debate over whether it's done.", "Capture the Definition-of-Done note onto the item — the functional, quality, documentation, and deployment conditions — the shared bar that ends sprint-review debate over whether it's done."),
  },
};

/** ABSENCE_CROSS_TEAM_IMPACT_CHECK — notify affected teams, keyword "team". Produces a written note. SENSITIVE (notify). */
export const ABSENCE_CROSS_TEAM_IMPACT_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_CROSS_TEAM_IMPACT_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: CROSS_TEAM_IMPACT_CHECK_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  l2SafeguardRequired: true,
  l2SafeguardLine: "Before you send this change notification to any team, ask me for go-ahead confirmation first.",
  levelForms: {
    1: form("Before changing this shared system, name the one team most affected by it.", "Just the one team most affected by this shared-system change — named before changing it."),
    2: form("List the teams that touch this shared system and would feel the change, and what each needs to know.", "Name the teams that touch this shared system and would feel the change, and what each needs to know."),
    3: form("Identify every team affected by this change to a shared system (API, schema, infrastructure), draft the notification message, send it, and document delivery in the sprint item before implementation begins. A pre-change Slack message costs minutes; a post-change broken integration costs team-days.", "Map every team affected by this change to a shared system (API, schema, infrastructure), draft the notification each needs, and confirm delivery in the sprint item before implementation — a pre-change heads-up costs minutes; a post-change broken integration costs team-days."),
    4: form("Identify every affected team and draft the notification each needs — what changes, when, and the action required of them — ready to send before implementation starts.", "Prepare the notification each affected team needs — what changes, when, and the action required of them — ready to send before implementation starts."),
    5: form("Write a change-notification note: every team affected by this shared-system change, the message each received, and delivery confirmed — so a pre-change heads-up replaces a post-change broken integration.", "Capture a change-notification note — every team affected by this shared-system change, the message each received, and delivery confirmed — so a pre-change heads-up replaces a post-change broken integration."),
  },
};

/** ABSENCE_SUCCESS_METRIC_DEFINITION — define the success metric, keyword "metric". Produces a written note. */
export const ABSENCE_SUCCESS_METRIC_DEFINITION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SUCCESS_METRIC_DEFINITION', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: SUCCESS_METRIC_DEFINITION_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before development, name the one metric that will say whether this feature succeeded.", "Just the one metric that will say whether this feature succeeded — named before development."),
    2: form("Define the success metric for this feature: the measure, where it's tracked, and the rough target.", "Set the success metric for this feature — the measure, where it's tracked, and the rough target."),
    3: form("Define the success metric for this feature before development: name the metric, the measurement method, the success threshold, and the measurement timeline — e.g. \"feature adoption rate, tracked via feature_used analytics event, threshold 30% of active users within 30 days.\" Add to the sprint item.", "Name the metric, the measurement method, the success threshold, and the measurement timeline — e.g. 'feature adoption rate, tracked via feature_used analytics event, threshold 30% of active users within 30 days' — and add it to the sprint item."),
    4: form("Add a baseline and a guardrail to the metric: record the current value the threshold is measured from, and name one metric that must NOT get worse — so success is a real change, not a number with no reference.", "Give the metric a baseline and a guardrail — the current value the threshold is measured from, and one metric that must NOT get worse — so success is a real change, not a number with no reference."),
    5: form("Write a success-metric note onto the item: the metric, how it's measured, the baseline, the threshold, the timeline, and the guardrail that must not regress — the yardstick the feature's post-ship outcome is judged by.", "Capture a success-metric note onto the item — the metric, how it's measured, the baseline, the threshold, the timeline, and the guardrail that must not regress — the yardstick the feature's post-ship outcome is judged by."),
  },
};

/** ABSENCE_PRIORITY_JUSTIFICATION — justify the sprint-item priority, keyword "priorit". Produces a written note. */
export const ABSENCE_PRIORITY_JUSTIFICATION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_PRIORITY_JUSTIFICATION', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: PRIORITY_JUSTIFICATION_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before development, state in one line why this item is the priority over the next-best alternative.", "Just why this item is the priority over the next-best alternative, in one line — before development."),
    2: form("Give this item's priority rationale: the value, the urgency, and what it's chosen over.", "Set out this item's priority rationale — the value, the urgency, and what it's chosen over."),
    3: form("State the priority justification for this sprint item in one sentence before development begins: name the user or business value, the urgency or time criticality, the risk reduction or strategic alignment — and the next-highest-priority alternative being deferred to make room for this item.", "Give in one sentence the user or business value, the urgency, the risk reduction or strategic alignment, and the next-highest-priority alternative deferred to make room — before development begins."),
    4: form("Make the priority comparative: score this item and the top deferred alternative on the same axes — value, urgency, risk — and state the cost of NOT doing this now, so it's a defended trade-off.", "Weigh the priority comparatively — score this item and the top deferred alternative on the same axes (value, urgency, risk), and state the cost of NOT doing this now — so it's a defended trade-off."),
    5: form("Write a priority-justification note onto the item: the value, urgency, and risk reduction scored against the deferred alternative, plus the cost of not doing it now — so sprint order follows reasoning, not the path of least resistance.", "Capture a priority-justification note onto the item — the value, urgency, and risk reduction scored against the deferred alternative, plus the cost of not doing it now — so sprint order follows reasoning, not the path of least resistance."),
  },
};

/** ABSENCE_USER_STORY_COMPLETENESS — complete the user story who/what/why, keyword "user". Produces a written note. */
export const ABSENCE_USER_STORY_COMPLETENESS_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_USER_STORY_COMPLETENESS', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: USER_STORY_COMPLETENESS_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before implementing, write this item as 'As a [user], I want [capability], so that [outcome].'", "Just this item written as 'As a [user], I want [capability], so that [outcome]' — before implementing."),
    2: form("Draft the user story for this item — the user, the capability, the outcome — and check the 'so that' holds.", "Pin the user story for this item — the user, the capability, the outcome — and check the 'so that' holds."),
    3: form("Rewrite this work item in Connextra format before implementation: \"As a [specific user type], I want [the capability this feature enables], so that [the value or outcome delivered].\" If the \"so that\" cannot be completed, that is the most important thing to resolve — propose what stakeholder conversation closes it.", "Recast this item in Connextra form — 'As a [specific user type], I want [capability], so that [value/outcome]' — and if the 'so that' can't be completed, that's the most important thing to resolve; propose the stakeholder conversation that closes it."),
    4: form("Sharpen the user story: check the user is a specific type not 'the user', split it if it carries more than one 'so that', and attach the one acceptance check that proves the outcome was delivered.", "Tighten the user story — make the user a specific type not 'the user', split it if it carries more than one 'so that', and attach one acceptance check that proves the outcome was delivered."),
    5: form("Write the user-story note onto the item: the specific user, the capability, the outcome it delivers, and the acceptance check that proves it — so the build targets the value, not just a technically-correct artifact.", "Capture the user-story note onto the item — the specific user, the capability, the outcome it delivers, and the acceptance check that proves it — so the build targets the value, not just a technically-correct artifact."),
  },
};

/** ABSENCE_RISK_FLAG — identify and rate risks, keyword "risk". Produces a written note. */
export const ABSENCE_RISK_FLAG_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_RISK_FLAG', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: RISK_FLAG_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before proceeding, name the single biggest risk in this decision and how likely it is.", "Just the single biggest risk in this decision and how likely it is — named before proceeding."),
    2: form("List the main risks for this decision by category and rate each on likelihood and impact.", "Name the main risks for this decision by category and rate each on likelihood and impact."),
    3: form("Identify the risks for this decision before proceeding: for each risk category (technical, scope, stakeholder, dependency, timeline), name the specific risk, estimate likelihood (H/M/L) and impact (H/M/L), and state the mitigation or acceptance decision. Document each in the sprint item.", "For each risk category (technical, scope, stakeholder, dependency, timeline), name the specific risk, estimate likelihood (H/M/L) and impact (H/M/L), and state the mitigation or acceptance decision — documented in the sprint item."),
    4: form("Rank and own the top risks: order them by likelihood times impact, and for the top few name who watches each and the early-warning sign that it's materialising — so the worst risks are monitored, not just listed.", "Order and own the top risks — by likelihood times impact, and for the top few name who watches each and the early-warning sign it's materialising — so the worst risks are monitored, not just listed."),
    5: form("Write a risk note onto the item: each risk by category with its likelihood and impact, ranked by the product of the two, an owner and early-warning sign for the top ones, and the mitigation or acceptance — so assumptions become monitored risks, not silent uncertainties.", "Capture a risk note onto the item — each risk by category with its likelihood and impact, ranked by the product of the two, an owner and early-warning sign for the top ones, and the mitigation or acceptance — so assumptions become monitored risks, not silent uncertainties."),
  },
};

/** ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT — assess a mid-sprint scope change, keyword "impact". Produces a written note. */
export const ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: SCOPE_CHANGE_IMPACT_ASSESSMENT_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before accepting this scope change, name the one in-progress item it displaces — its first impact.", "Just the one in-progress item this scope change displaces — its first impact, named before accepting it."),
    2: form("Assess the scope change's impact: what it displaces and whether the sprint end date moves.", "Weigh the scope change's impact — what it displaces and whether the sprint end date moves."),
    3: form("Before accepting this mid-sprint scope change, complete the four-point impact assessment: (1) what existing in-progress item is displaced, (2) does the sprint end date shift, (3) which downstream teams have a date dependency on what this change affects, (4) what is explicitly removed or deferred to make room. Document all four answers in the sprint item before the change enters scope.", "Complete the four-point impact assessment — what in-progress item is displaced, whether the sprint end date shifts, which downstream teams have a date dependency, and what's explicitly removed to make room — documented before the change enters scope."),
    4: form("Turn the impact assessment into a decision: present the trade-off — take it and slip the date, or hold scope and defer it — to whoever owns the sprint, and record their call, so the change is explicit, not absorbed.", "Push the impact assessment into a decision — present the trade-off (take it and slip the date, or hold scope and defer it) to whoever owns the sprint, and record their call — so the change is explicit, not absorbed."),
    5: form("Write a scope-change impact note onto the item: the displaced work, the date effect, the downstream dependencies, the trade-off made, and the sprint-owner's recorded decision — so mid-sprint changes are traded off, not absorbed silently.", "Capture a scope-change impact note onto the item — the displaced work, the date effect, the downstream dependencies, the trade-off made, and the sprint-owner's recorded decision — so mid-sprint changes are traded off, not absorbed silently."),
  },
};

/** ABSENCE_RETROSPECTIVE_HABIT — run the sprint retrospective, keyword "retro". Produces a written note. */
export const ABSENCE_RETROSPECTIVE_HABIT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_RETROSPECTIVE_HABIT', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: RETROSPECTIVE_HABIT_BEGINNER_OVERRIDE },
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Run a quick retro before the next sprint: name one thing that went well and one that didn't.", "Just one thing that went well and one that didn't — a quick retro before the next sprint."),
    2: form("Hold a short retrospective: what went well, what didn't, and one change to try next sprint.", "Do a short retrospective — what went well, what didn't, and one change to try next sprint."),
    3: form("Run the sprint retrospective now before the next sprint begins: list what went well (preserve and reinforce), what did not go well (process problems without blame), and one or two specific, actionable process changes to try in the next sprint. Document the chosen action items.", "List what went well (preserve and reinforce), what didn't (process problems without blame), and one or two specific, actionable process changes to try next sprint — documenting the chosen action items."),
    4: form("Close the loop on retro actions: assign an owner and a date to each change, and start by checking whether last retro's actions actually happened — so improvements compound instead of resetting each sprint.", "Own the retro actions — assign an owner and a date to each change, and start by checking whether last retro's actions actually happened — so improvements compound instead of resetting each sprint."),
    5: form("Write a retrospective note: what went well, what didn't, and the chosen action items for the next sprint, each with an owner and a date — so process problems get fixed instead of repeating.", "Capture a retrospective note — what went well, what didn't, and the chosen action items for the next sprint, each with an owner and a date — so process problems get fixed instead of repeating."),
  },
};

/** All class-8 role-cluster records = the 35 signals (23 casual-anchored + 12 formal-anchored). */
export const CLASS8_RECORDS: readonly ContentTemplateRecord[] = [
  ABSENCE_USER_VALUE_CHECK_RECORD,
  ABSENCE_OUTCOME_DEFINITION_RECORD,
  ABSENCE_FEATURE_PRIORITIZATION_RECORD,
  ABSENCE_USER_PERSONA_CLARITY_RECORD,
  ABSENCE_COMPETITIVE_AWARENESS_RECORD,
  ABSENCE_MVP_BOUNDARY_DISCIPLINE_RECORD,
  ABSENCE_USER_ACQUISITION_CONSIDERATION_RECORD,
  ABSENCE_RETENTION_MECHANISM_CHECK_RECORD,
  ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT_RECORD,
  ABSENCE_HYPOTHESIS_BEFORE_BUILD_RECORD,
  ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE_RECORD,
  ABSENCE_NORTH_STAR_ALIGNMENT_RECORD,
  ABSENCE_TIME_TO_VALUE_CHECK_RECORD,
  ABSENCE_SHIP_READINESS_DEFINITION_RECORD,
  ABSENCE_MANUAL_BEFORE_AUTOMATE_RECORD,
  ABSENCE_TECH_STACK_COMPLEXITY_CHECK_RECORD,
  ABSENCE_LAUNCH_STRATEGY_ABSENCE_RECORD,
  ABSENCE_EARLY_USER_FEEDBACK_RECORD,
  ABSENCE_SOLO_MAINTAINABILITY_RECORD,
  ABSENCE_DISTRIBUTION_THINKING_RECORD,
  ABSENCE_MONETIZATION_PATH_CLARITY_RECORD,
  ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY_RECORD,
  ABSENCE_SCOPE_VS_TIME_CHECK_RECORD,
  ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_RECORD,
  ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_RECORD,
  ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_RECORD,
  ABSENCE_DEPENDENCY_MAPPING_RECORD,
  ABSENCE_DEFINITION_OF_DONE_RECORD,
  ABSENCE_CROSS_TEAM_IMPACT_CHECK_RECORD,
  ABSENCE_SUCCESS_METRIC_DEFINITION_RECORD,
  ABSENCE_PRIORITY_JUSTIFICATION_RECORD,
  ABSENCE_USER_STORY_COMPLETENESS_RECORD,
  ABSENCE_RISK_FLAG_RECORD,
  ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_RECORD,
  ABSENCE_RETROSPECTIVE_HABIT_RECORD,
];
