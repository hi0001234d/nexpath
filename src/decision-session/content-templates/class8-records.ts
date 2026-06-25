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
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building this feature, name one user signal that says the problem is real — a request, a complaint, an observed behaviour.", "The lightest check: one user signal that the problem is real before building."),
    2: form("Gather the user signals you have for this feature — requests, conversations, observed behaviour — and judge whether they confirm the problem.", "A light pass: the available user signals gathered and weighed before building."),
    3: form("The single biggest waste in product development is building something nobody asked for. Lean Startup core loop: before any feature build, check whether you have a user signal — a conversation, a behavioral observation, a direct request, or survey data — that confirms the problem you're solving is real for your users. Without signal, you're making a bet, not a decision.", "User signal for this feature hasn't been validated — risk of building something nobody asked for."),
    4: form("Weigh the signal honestly: separate real user evidence (requests, behaviour, data) from your own assumption, and if the only signal is a hunch, get one piece of real evidence before building.", "Beyond gathering: real user signal separated from assumption, with evidence sought if it's thin."),
    5: form("Write a validation note: the user signals for this feature, how strong each is, and the gap to close — so the build rests on evidence, not a guess.", "A durable validation note of the user signals and the evidence gap."),
  },
};

/** ABSENCE_OUTCOME_DEFINITION — define the success outcome before building, keyword "outcome". Produces a written note. */
export const ABSENCE_OUTCOME_DEFINITION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_OUTCOME_DEFINITION', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building, write the one-sentence outcome: 'This feature is successful if [user behaviour] changes.'", "The lightest step: the success outcome stated in one sentence before building."),
    2: form("State the outcome this feature should produce — the user-behaviour change, not just the thing shipped — and how you'd notice it.", "A light pass: the behavioural outcome named and how it would show."),
    3: form("An output is something you ship. An outcome is the change in user behavior that justifies shipping it. The OKR discipline applied to product: before building, write one sentence that completes \"This feature is successful if...\". Without that sentence, you can't evaluate whether the feature worked, you can't communicate success criteria to teammates, and you can't decide when the feature is done enough to ship.", "The success outcome for this feature hasn't been defined — without it, ship/no-ship can't be evaluated."),
    4: form("Make the outcome measurable: name the behaviour change, the rough signal that proves it, and the point at which the feature is done enough to ship — so the outcome is evaluable, not a feeling.", "Beyond a sentence: the outcome made measurable with a proof signal and a done bar."),
    5: form("Write an outcome note: the success statement, the behaviour change it targets, the signal that confirms it, and the ship bar — the record ship/no-ship is judged against.", "A durable outcome note of the success statement and its proof signal."),
  },
};

/** ABSENCE_FEATURE_PRIORITIZATION — justify build priority by impact, keyword "priorit". Produces a written note. */
export const ABSENCE_FEATURE_PRIORITIZATION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_FEATURE_PRIORITIZATION', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building this, name one reason its priority beats the next thing you could build instead.", "The lightest priority check: one reason this beats the alternative."),
    2: form("Compare this feature's priority to one or two alternatives by impact for the same effort, and pick deliberately.", "A light pass: priority weighed against alternatives by impact-for-effort."),
    3: form("Building what comes to mind next — rather than what has the highest impact — is the feature factory pattern. Every hour of engineering time spent on a lower-impact feature is an hour not spent on a higher-impact one. Backlog prioritization question: what evidence suggests this feature delivers more value to users than any alternative you could build with the same engineering time?", "Priority rationale for this feature hasn't been stated — risk of feature-factory pattern building lower-impact work."),
    4: form("Rank by evidence: score this feature and its main alternatives on user impact versus engineering cost, and set the build priority by highest value — not the first that came to mind.", "Beyond one reason: the priorities ranked on impact-versus-cost evidence."),
    5: form("Write a priority note: the candidate features ranked by impact and cost, the chosen one, and why it beat the rest — so build order follows value, not the feature-factory reflex.", "A durable priority note ranking features by impact and cost."),
  },
};

/** ABSENCE_USER_PERSONA_CLARITY — name the specific user, keyword "user". Produces a written note. */
export const ABSENCE_USER_PERSONA_CLARITY_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_USER_PERSONA_CLARITY', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Name the specific user this feature serves in one line — who they are and what they're trying to do.", "The lightest step: the specific user named instead of 'users in general'."),
    2: form("Sketch the target user: who they are, the context they use the product in, and the goal this feature helps them reach.", "A light pass: the target user, their context, and their goal sketched."),
    3: form("Name the specific user this feature serves: 2 sentences describing who they are, what context they use the product in, and what they are trying to accomplish — concrete enough that a design decision can be tested against \"would Marcus understand this?\" rather than \"would users in general?\"", "The specific user this feature serves hasn't been named — building for 'users in general' loses every design decision."),
    4: form("Pressure-test the persona against real choices: take two design decisions in this feature and check each against this specific user — what they'd accept, what they'd reject — and fix the ones that only make sense for 'users in general'.", "Beyond naming the user: the persona pressure-tested against real design decisions."),
    5: form("Write a persona note: the specific user, their context, goal, and what they'd reject — the anchor every design decision for this feature is tested against.", "A durable persona note: the specific user and their context as the design anchor."),
  },
};

/** ABSENCE_COMPETITIVE_AWARENESS — check the competitive landscape, keyword "competit". Produces a written note. */
export const ABSENCE_COMPETITIVE_AWARENESS_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_COMPETITIVE_AWARENESS', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building this feature, check one thing: does a competitor already do it, and how?", "The lightest competitive check: whether a competitor already solves this."),
    2: form("Scan the main competitors for this feature: who has it, and roughly how well they do it.", "A light competitive pass: who already has the feature and how well."),
    3: form("Building a feature without knowing the competitive landscape means you're solving a problem that may already be solved — possibly better than you'll solve it. Before committing to any non-trivial feature, answer three questions: does a competitor already have this? If yes, how have they implemented it? And what would make your version a reason to switch rather than a reason to stay with the incumbent?", "Competitive landscape for this feature hasn't been checked — risk of solving an already-solved problem worse than incumbent."),
    4: form("Study the competitors' version: how they implement it, where they fall short, and the one thing that would make yours a competitive reason to switch — not just parity.", "Beyond a scan: the competitive implementations studied for a real reason-to-switch."),
    5: form("Write a competitive note: who already solves this, how, their gaps, and your differentiator — so the build improves on the incumbent instead of re-solving it worse.", "A durable competitive note of incumbents, their gaps, and your differentiator."),
  },
};

/** ABSENCE_MVP_BOUNDARY_DISCIPLINE — gate additions against the MVP hypothesis, keyword "mvp". Produces a written note. */
export const ABSENCE_MVP_BOUNDARY_DISCIPLINE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_MVP_BOUNDARY_DISCIPLINE', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before adding this, ask: does it reduce uncertainty about the riskiest MVP hypothesis, or is it extra?", "The lightest MVP gate: the addition checked against the riskiest hypothesis."),
    2: form("Test this addition against the MVP boundary: keep it only if it lowers risk on the core hypothesis, else defer.", "A light MVP pass: the addition kept only if it tests the core hypothesis."),
    3: form("Apply MVP discipline to this addition: name the riskiest hypothesis the MVP is meant to test, then state whether this addition reduces uncertainty about that hypothesis. If it does not, propose deferring it to post-validation scope.", "MVP-scope discipline hasn't been applied to this addition — risk of gold-plating the unvalidated MVP."),
    4: form("Draw the MVP boundary explicitly: list what the MVP must prove, mark this addition in-scope or post-validation, and defer everything that doesn't reduce the core uncertainty.", "Beyond gating one item: the MVP boundary drawn with in-scope versus deferred."),
    5: form("Write an MVP scope note: the riskiest hypothesis, the minimum that tests it, and the deferred extras — the boundary the build holds to so it doesn't gold-plate.", "A durable MVP scope note of the core hypothesis and the deferred extras."),
  },
};

/** ABSENCE_USER_ACQUISITION_CONSIDERATION — design how users find the feature, keyword "user". Produces a written note. */
export const ABSENCE_USER_ACQUISITION_CONSIDERATION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_USER_ACQUISITION_CONSIDERATION', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building this feature, name one way a target user actually finds and starts using it — its acquisition path.", "The lightest step: one path by which a user discovers the feature."),
    2: form("Sketch how target users reach this feature: the channel they come through and the hook that draws them in.", "A light pass: the channel and hook that bring users in."),
    3: form("A feature's value is zero for any user who never encounters it. Distribution fit is as important as product-market fit — and it has to be designed in, not discovered after launch. Before committing to a feature build, answer: what is the specific path through which target users will find and start using this feature? SEO, referral loop, in-app discovery, sharing mechanic, onboarding hook, community post — name the channel.", "Acquisition path for this feature hasn't been defined — feature value is zero for users who never discover it."),
    4: form("Design the path into the feature: pick the specific channel (SEO, referral, in-app), and shape the build so a new user discovers it — not hopes to after launch.", "Beyond a channel: the path for a user to discover the feature designed into the build."),
    5: form("Write an acquisition note: the channel target users arrive through, the discovery hook, and how the build supports it — so the feature reaches users instead of staying invisible.", "A durable acquisition note of the channel users arrive through and the discovery hook."),
  },
};

/** ABSENCE_RETENTION_MECHANISM_CHECK — name why users return, keyword "retention". Produces a written note. */
export const ABSENCE_RETENTION_MECHANISM_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_RETENTION_MECHANISM_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building this feature, name one reason a user comes back to it after the first use — its retention hook.", "The lightest retention check: one reason users return after first use."),
    2: form("Sketch the retention angle: why this feature pulls a user back, and how one use makes the next more likely.", "A light retention pass: the return reason and the repeat-use loop sketched."),
    3: form("Features that acquire users but don't retain them have diminishing returns forever. Every significant feature should have an answer to: why does a user return to this feature after the first use, and how does using it once make the next use more likely? Without a retention angle, you're building acquisition features, not engagement features.", "Retention mechanic for this feature hasn't been named — feature acquires users but doesn't bring them back."),
    4: form("Pick the one trigger that reliably brings users back — a notification, saved state, a streak — and design that single retention loop well, then name the return-rate it should move; one real hook beats three vague ones.", "Beyond a reason: one retention trigger chosen and tied to the return-rate it should move."),
    5: form("Write a retention note: the return trigger, the repeat value, the loop that compounds use, and the return-rate it should move — so the feature keeps users, not just attracts them once.", "A durable retention note of the return trigger, the compounding loop, and the return-rate."),
  },
};

/** ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT — set post-ship measurement, keyword "measure". Produces a written note. */
export const ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before shipping, name one thing you'll measure to know whether this feature worked.", "The lightest step: one measure of whether the feature worked, set before ship."),
    2: form("Decide how you'll measure this feature post-ship — the metric and where it's captured — before it goes out.", "A light pass: the measurement metric and capture point decided before ship."),
    3: form("Shipping without a way to measure whether the feature worked means the engineering investment produces no validated learning. The Lean Startup loop: Build → Measure → Learn. Skipping the Measure step after Build means the loop stops at the most expensive point and never produces the insight that informs the next build. Define your measurement mechanism before shipping, not after.", "Post-ship measurement mechanism hasn't been set — engineering investment produces no validated learning."),
    4: form("Close the Build-Measure-Learn loop: define the measure before shipping, where the data lands, and the decision each result drives — so shipping produces learning, not just code.", "Beyond a metric: the measurement wired to a decision so shipping yields learning."),
    5: form("Write a measurement note: what this feature must move, how it's measured, where the data lands, and the next decision each outcome triggers — the loop that turns the build into insight.", "A durable measurement note wiring the metric to the next decision."),
  },
};

/** ABSENCE_HYPOTHESIS_BEFORE_BUILD — write a falsifiable hypothesis, keyword "hypothesis". Produces a written note. */
export const ABSENCE_HYPOTHESIS_BEFORE_BUILD_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_HYPOTHESIS_BEFORE_BUILD', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building, write the one-line hypothesis: '[change] will cause [outcome] for [user].'", "The lightest step: a one-line hypothesis stated before building."),
    2: form("State the feature hypothesis: the change, the expected outcome, the user, and the signal you'd watch for.", "A light pass: the hypothesis's change, outcome, and watched signal stated."),
    3: form("Write the experiment hypothesis for this feature in the form: \"We believe [feature/change] will cause [observable outcome] for [user type]. We will know this is true when [signal] appears within [timeframe].\" If any bracket cannot be filled, propose what data or decision would resolve it before continuing.", "Falsifiable hypothesis for this feature hasn't been written — experiment outcome can't be evaluated."),
    4: form("Add the falsification condition to the hypothesis: beyond the success signal, state the result that would prove it WRONG and the threshold at which you'd kill or pivot — so the experiment can actually fail, not just confirm.", "Beyond filling brackets: the hypothesis given a falsification condition and a kill threshold."),
    5: form("Write the hypothesis note: the believed change, the observable outcome, the user, the proof signal, the timeframe, and the result that would disprove it — the testable claim the build is then evaluated against.", "A durable hypothesis note: the falsifiable claim, its proof signal, and its disproof result."),
  },
};

/** ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE — periodic product-direction check, keyword "direction". Behavioural cadence. */
export const ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Pause and run a quick product-direction check: is this still the right feature for the right user?", "The lightest direction check: a quick is-this-still-right pause."),
    2: form("Sample the recent work by type — implementation versus product-direction — and if it's all implementation, answer one direction question before continuing.", "A light pass: the work sampled for an implementation-versus-direction skew."),
    3: form("Pause implementation and run a product-direction check: count the last 10-15 prompts by category (implementation instructions vs product-direction questions). If heavily skewed to implementation, answer one product question before continuing — is this still the right feature to be building for the right user toward the right outcome?", "Product-direction check hasn't been done — heavy implementation skew risks optimising the wrong feature."),
    4: form("Set a direction target and act on it: decide the healthy implementation-to-product balance, and when a stretch breaches it, write the one product-direction decision to make before more code — not just a yes/no.", "Beyond a count: a direction target set and the next product decision written when it's breached."),
    5: form("Make the product-direction check a standing cadence: every stretch of heads-down implementation pauses for a direction check on feature, user, and outcome — so build effort stays pointed the right way.", "A standing cadence: a product-direction check punctuating heads-down implementation."),
  },
};

/** ABSENCE_NORTH_STAR_ALIGNMENT — trace the feature to the north star metric, keyword "north". Produces a written note. */
export const ABSENCE_NORTH_STAR_ALIGNMENT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_NORTH_STAR_ALIGNMENT', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building this, trace it to the north star metric in one step — how does it move the metric?", "The lightest step: the feature traced to the north star metric in one step."),
    2: form("Connect this feature to the north star: state the direct move or the downstream feature it enables that moves it.", "A light pass: the feature's connection to the north star stated."),
    3: form("Trace this feature to the product's north star metric in one or two steps: state how it moves the metric directly, or how it enables a downstream feature that does. If no traceable connection exists, propose deferring or removing it.", "North-star connection for this feature hasn't been traced — risk of scope inflation untethered from the core metric."),
    4: form("Quantify the north-star link: estimate how much this feature should move the metric and over what horizon, and rank it against the other candidates by that expected movement — so traceable-but-tiny contributions are caught too.", "Beyond tracing a link: the north-star movement quantified and ranked against alternatives."),
    5: form("Write a north-star note: the feature, the metric it moves, the path (direct or enabling), the expected movement, and how it ranks against alternatives — so scope stays tethered to the core metric.", "A durable north-star note of the feature's expected movement and its rank against alternatives."),
  },
};

/** ABSENCE_TIME_TO_VALUE_CHECK — right-size for current scale, keyword "scale". Produces a written note. */
export const ABSENCE_TIME_TO_VALUE_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_TIME_TO_VALUE_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building, right-size for current scale: what's the simplest tech that solves this at today's user count?", "The lightest step: the simplest tech for today's scale considered first."),
    2: form("Match the solution to current scale: name today's load and the simplest approach that handles it, deferring heavier infrastructure.", "A light pass: the solution matched to current scale, complexity deferred."),
    3: form("Right-size this solution for current scale: name the current user count, name the simplest technology that solves the problem at that scale (a database query, a single API call, a flat file), and propose using it. Defer infrastructure complexity until scale actually requires it.", "Right-sizing for current scale hasn't been done — risk of premature complexity for hoped-for traffic."),
    4: form("Right-size against real scale, not hoped-for scale: name the current user count, pick the simplest thing that works there, and note the threshold at which more complexity is justified.", "Beyond matching: the solution right-sized to real scale with a complexity threshold."),
    5: form("Write a right-sizing note: the current scale, the simplest solution that fits it, and the trigger that would justify more — so complexity arrives when scale demands it, not before.", "A durable right-sizing note of current scale and the complexity trigger."),
  },
};

/** ABSENCE_SHIP_READINESS_DEFINITION — write binary ship criteria, keyword "ship". Produces a written note. */
export const ABSENCE_SHIP_READINESS_DEFINITION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SHIP_READINESS_DEFINITION', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before adding more, write one binary ship condition that must be true to ship this.", "The lightest step: one binary ship condition written down."),
    2: form("List the must-be-true conditions to ship this build — binary, checkable — before layering more on.", "A light pass: the binary ship conditions listed before more is added."),
    3: form("Write the ship criteria for this build before more is added: list the specific, binary conditions that must be true to ship — \"users can sign up\", \"the core workflow completes end-to-end\", etc. This list is your Definition of Done; everything beyond it is post-launch scope.", "Ship criteria haven't been written — risk of always being 'not ready yet' without binary gates."),
    4: form("Turn ship-readiness into a gated checklist: each condition binary and testable, with anything beyond it marked explicitly post-launch — so 'ready to ship' is a checklist, not a feeling.", "Beyond a list: ship-readiness gated as a binary checklist, extras marked post-launch."),
    5: form("Write a ship-criteria note: the binary conditions that define done, the explicit post-launch scope, and the current status of each — the gate that ends 'not ready to ship yet'.", "A durable ship-criteria note of the binary done conditions."),
  },
};

/** ABSENCE_MANUAL_BEFORE_AUTOMATE — validate by hand before automating, keyword "manual". Behavioural habit. */
export const ABSENCE_MANUAL_BEFORE_AUTOMATE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_MANUAL_BEFORE_AUTOMATE', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before automating this, do it manually once and see what actually happens.", "The lightest step: the workflow run manually once before automating."),
    2: form("Run this workflow manually for the first users, noting where your assumptions about it were wrong, before building automation.", "A light pass: the workflow done manually to surface wrong assumptions."),
    3: form("Apply Paul Graham's \"do things that don't scale\" rule: do this workflow manually for the first users before automating it. Run the process by hand, capture what users actually need vs what you assumed, and only then automate the validated version.", "Manual-first validation hasn't been done — automation of an unvalidated process risks rebuild after discovery."),
    4: form("Track the manual runs to find what's worth automating: note where each run is slow, error-prone, or repetitive, and automate only the one step the data shows is the real bottleneck — not the whole workflow on a guess.", "Beyond repeating it: the manual runs tracked to pinpoint the one step worth automating."),
    5: form("Make manual-first the standing rule: every new workflow is run by hand until it's understood, and only the proven version gets automated — so automation never locks in a wrong guess.", "A standing rule: workflows proven manually before any automation is built."),
  },
};

/** ABSENCE_TECH_STACK_COMPLEXITY_CHECK — choose a solo-maintainable stack, keyword "stack". Produces a written note. */
export const ABSENCE_TECH_STACK_COMPLEXITY_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_TECH_STACK_COMPLEXITY_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before adding to the stack, ask: can I maintain this alone, or is it just impressive?", "The lightest stack check: can this be maintained solo, or just impressive."),
    2: form("Weigh this stack choice for solo upkeep: the debugging, extending, and re-understanding you'll own alone.", "A light pass: the stack choice weighed for the solo upkeep it adds."),
    3: form("Every technology choice for a solo indie project is a choice you'll maintain alone — debugging it at 2am, extending it when requirements change, understanding it after 3 months away. Complexity that would be distributed across a team of engineers is complexity a solo builder pays in full. The right lens: \"is this the simplest stack I can maintain alone, or is this the most impressive stack I can technically justify?\"", "Solo-maintainability check hasn't been applied — team-grade complexity costs solo dev in maintenance tax."),
    4: form("Compare stack options on maintenance cost, not capability: pick the simplest one you can debug at 2am alone, and justify any added complexity by a need you actually have now.", "Beyond a check: stack options compared on solo maintenance cost, simplest chosen."),
    5: form("Write a stack-decision note: the choice, the simpler alternative, the solo maintenance each carries, and why the pick is owned-alone-able — so the stack stays maintainable, not impressive.", "A durable stack-decision note weighing solo maintenance against capability."),
  },
};

/** ABSENCE_LAUNCH_STRATEGY_ABSENCE — draft a launch plan, keyword "launch". Produces a written note. SENSITIVE (publish). */
export const ABSENCE_LAUNCH_STRATEGY_ABSENCE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_LAUNCH_STRATEGY_ABSENCE', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  l2SafeguardRequired: true,
  l2SafeguardLine: "Before you publish or announce this launch publicly, ask me for go-ahead confirmation first.",
  levelForms: {
    1: form("Before shipping, name one channel where you'll announce this launch.", "The lightest launch step: one announcement channel named."),
    2: form("Sketch a minimum launch plan: the channel, a draft announcement, and who should see it.", "A light launch pass: the channel, draft post, and audience sketched."),
    3: form("Shipping without a launch plan means launching into silence. Good products do not attract users by themselves — distribution is a discipline that must be planned and executed, not discovered. The minimum viable launch strategy: name one specific channel where you will announce this product, write the post before launch day, and identify who in your network or community should see it. That's a launch plan.", "Launch plan hasn't been drafted — shipping without distribution risks launching into silence."),
    4: form("Sequence the launch to execute: order the channels, write each post, line up the specific people to notify on launch day, and decide what happens if the first channel underperforms — an executable plan, not a list.", "Beyond a sketch: the launch sequenced across channels with a fallback if one underperforms."),
    5: form("Write a launch note: the announcement channels in order, the drafted posts, the network to reach, the launch-day sequence, and the fallback if a channel underperforms — the distribution plan that keeps the ship from launching into silence.", "A durable launch note of ordered channels, drafted posts, the launch sequence, and a fallback."),
  },
};

/** ABSENCE_EARLY_USER_FEEDBACK — show the build to a real user, keyword "user". Behavioural cadence. */
export const ABSENCE_EARLY_USER_FEEDBACK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_EARLY_USER_FEEDBACK', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building more, show the current build to one real user and watch their reaction.", "The lightest step: the build shown to one real user before more is built."),
    2: form("Get the build in front of a real user today — a quick screen-share or walk-through — and capture what they actually do, not what you expected.", "A light pass: a real user shown the build and their actual reaction captured."),
    3: form("Break out of silo-building before more is built: identify one real user to show the current build to today — for a 10-minute screen-share, a Loom walk-through, or a screenshot review. Capture their actual reaction, not your interpretation, and adjust direction based on what you see.", "Recent feedback from real users hasn't been collected — silo-building risks building on unvalidated assumptions."),
    4: form("Watch a user use it without your guidance: note where they hesitate or go wrong, separate their real reaction from your interpretation, and adjust direction from what you saw.", "Beyond showing it: a user observed unguided and the direction adjusted from real reaction."),
    5: form("Make regular user contact the standing habit: show the build to a real user on a steady cadence and steer from their reactions — so the work never drifts back into a silo.", "A standing habit: steady real-user contact steering the build out of the silo."),
  },
};

/** ABSENCE_SOLO_MAINTAINABILITY — gate additions on solo-ownability, keyword "solo". Behavioural gate. */
export const ABSENCE_SOLO_MAINTAINABILITY_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SOLO_MAINTAINABILITY', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before adding this, ask: can I own the whole thing alone when it breaks? Keep it solo-ownable.", "The lightest solo check: can this be owned alone when it breaks."),
    2: form("Weigh the solo cost of this addition: the debugging, extending, and re-understanding you'll carry without help.", "A light pass: the solo cost of the addition weighed before adding it."),
    3: form("Every integration, service, or abstraction you add to a solo project is complexity you'll maintain alone — debugging it in production, extending it when requirements change, understanding it after weeks away. The solo maintainability question is not \"does this work?\" but \"can I own the full blast radius of this when it breaks, by myself, without help?\" If the answer requires reading documentation for 30 minutes every time something goes wrong, the complexity cost is real and ongoing.", "Solo-tax check hasn't been applied to this addition — risk of complexity solo dev can't own when it breaks."),
    4: form("Weigh it against doing without: compare this addition's solo blast radius to the simplest alternative — or none at all — and keep it only if the capability clearly beats the ongoing cost of owning it alone.", "Beyond judging the radius: the addition weighed against a simpler solo alternative."),
    5: form("Make solo-ownability a standing gate: every integration or abstraction must be one you can debug and extend alone before it goes in — so the solo project stays solo-maintainable.", "A standing gate: only solo-ownable complexity admitted to the project."),
  },
};

/** ABSENCE_DISTRIBUTION_THINKING — design the discovery path, keyword "distribution". Produces a written note. */
export const ABSENCE_DISTRIBUTION_THINKING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DISTRIBUTION_THINKING', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building this feature, name how a new user discovers it exists — the distribution path.", "The lightest step: one distribution path by which users discover the feature."),
    2: form("Sketch the distribution design for this feature: how a new user finds and reaches it the first time.", "A light pass: the distribution path to first use sketched."),
    3: form("Distribution is a design constraint, not a marketing task. Features that assume users will discover them organically are features built on distribution magic. Before building any significant feature, answer: what is the specific path through which a new user discovers this feature exists and reaches it for the first time? The answer shapes the implementation — SEO-friendly URLs, in-product sharing mechanics, referral hooks, and community-compatible output formats are all distribution design, not afterthoughts.", "Discovery path for this feature hasn't been designed — feature relies on distribution magic."),
    4: form("Pick the one distribution mechanic that fits and design it end-to-end: trace a brand-new user from the channel to first use, and build the specific hook that carries them across — one path made real, not five listed.", "Beyond listing channels: one distribution mechanic designed end-to-end for a new user."),
    5: form("Write a distribution note: the discovery path to first use, the in-product mechanics that support it, and where the build must change — so the feature is reachable by design.", "A durable distribution note of the discovery path and its supporting mechanics."),
  },
};

/** ABSENCE_MONETIZATION_PATH_CLARITY — articulate the revenue link, keyword "monetization". Produces a written note. */
export const ABSENCE_MONETIZATION_PATH_CLARITY_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_MONETIZATION_PATH_CLARITY', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building this feature, name how it connects to the revenue model — its monetization link, even indirectly.", "The lightest step: the feature's monetization connection named."),
    2: form("State this feature's monetization link: direct revenue, or a retention/LTV path — not just 'makes it better'.", "A light pass: the feature's monetization link stated, not assumed."),
    3: form("Building features without monetization awareness builds a free product by default — regardless of intent. Every significant feature should have an articulated answer to \"how does this connect to the revenue model?\" It doesn't need to be direct: \"this is a retention feature that reduces churn, which improves LTV\" is a valid connection. \"This makes the product better\" is not — it's the answer that leads to technically excellent, commercially unsustainable products.", "Monetization connection for this feature hasn't been articulated — risk of building free product by default."),
    4: form("Trace the monetization to a specific lever: name which revenue lever this feature moves (new conversions, retention, expansion) and roughly how much, and if it moves none, decide build-now versus defer.", "Beyond a link: the monetization tied to a specific revenue lever and a build-or-defer call."),
    5: form("Write a monetization note: the feature, the specific revenue lever it moves (direct or via retention/LTV), the rough magnitude, and the build-or-defer call — so the product earns by design, not free by default.", "A durable monetization note of the revenue lever, magnitude, and build-or-defer call."),
  },
};

/** ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY — share milestones publicly, keyword "public". Behavioural cadence. SENSITIVE (publish). */
export const ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  l2SafeguardRequired: true,
  l2SafeguardLine: "Before you publish this post to any public channel, ask me for go-ahead confirmation first.",
  levelForms: {
    1: form("Consider sharing this milestone publicly — a short post on what you shipped and learned.", "The lightest step: a public share of this milestone considered."),
    2: form("Draft a short public update on this milestone — what shipped, what you learned — to share with your audience.", "A light pass: a public update on the milestone drafted to share."),
    3: form("Share this milestone publicly today before continuing: draft a short post (tweet, Loom, community update) describing what you just shipped and what you learned. Audiences built during the build survive launch-day failures; audiences built launch-week do not.", "Milestone sharing hasn't been done — audience built during the build survives launch failures; audience built launch-week doesn't."),
    4: form("Make the public update count: show the real progress and the lesson, not just the win, so an audience that follows the build forms before launch day — when it matters most.", "Beyond a draft: the public update shaped to build a following during the build."),
    5: form("Make building in public a standing cadence: share milestones and lessons publicly as you go, so an audience accrues during the build and survives a rough launch.", "A standing cadence: public milestone-sharing that builds an audience during the build."),
  },
};

/** ABSENCE_SCOPE_VS_TIME_CHECK — trade scope against the timeline, keyword "scope". Produces a written note. */
export const ABSENCE_SCOPE_VS_TIME_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SCOPE_VS_TIME_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before adding more, check scope against the deadline: is the ship date still realistic at this scope?", "The lightest step: scope checked against the ship date before adding more."),
    2: form("Compare current scope to the timeline: estimate the ship date at this pace against the original target.", "A light pass: scope-versus-timeline estimated against the original target."),
    3: form("Run the scope-vs-time check on this build before more is added: name the current scope, estimate the shipping date at current pace, and compare to the original target. If the date has slipped twice in a row, cut scope to fit the original timeline — list specifically what gets deferred to post-launch.", "Scope-vs-time check hasn't been run — risk of expanding scope past timeline without acknowledgment."),
    4: form("Trade scope against time deliberately: if the date has slipped twice, cut scope to fit the original timeline and name exactly what's deferred — rather than letting scope expand silently.", "Beyond an estimate: scope traded against time with an explicit deferred list."),
    5: form("Write a scope-versus-time note: the current scope, the projected date, the gap, and what's cut to hold the timeline — so scope and schedule stay honest with each other.", "A durable scope-versus-time note of the projection and what's deferred."),
  },
};

// ── FORMAL-anchored signals (12 — product-manager register) ─────────────────────

/** ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV — verifiable acceptance criteria, keyword "acceptance". Produces a written note. */
export const ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before implementing, write one acceptance criterion: a verifiable condition that says this story is done.", "The lightest step: one verifiable acceptance criterion written before implementing."),
    2: form("Draft the main acceptance criteria for this story as checkable conditions before any implementation prompt.", "A light pass: the main acceptance criteria drafted as checkable conditions."),
    3: form("Write the acceptance criteria for this story before any implementation prompt: state each criterion as an independently verifiable condition, in Given/When/Then or \"this is done when [X]\" form. List at least three covering the primary scenario and the most likely edge case.", "Acceptance criteria for this story haven't been defined — risk of building the wrong thing correctly."),
    4: form("Pair each acceptance criterion with how it's checked — the test or manual step that proves it — and add at least one negative criterion (what must NOT happen), so the criteria drive verification, not just description.", "Beyond verifiable wording: each acceptance criterion paired with a check and a negative case."),
    5: form("Write the acceptance-criteria note onto the story: each criterion as a verifiable condition with the check that proves it, plus at least one negative case, across primary and edge scenarios — the target implementation is built and checked against.", "A durable acceptance-criteria note: verifiable conditions, their checks, and a negative case."),
  },
};

/** ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK — confirm stakeholder alignment, keyword "stakeholder". Produces a written note. SENSITIVE (contact). */
export const ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  l2SafeguardRequired: true,
  l2SafeguardLine: "Before you contact any stakeholder for sign-off, ask me for go-ahead confirmation first.",
  levelForms: {
    1: form("Before building, name the one stakeholder whose sign-off this feature most needs.", "The lightest step: the key stakeholder whose sign-off is needed named."),
    2: form("List the stakeholders with a stake in this feature and the alignment each needs — sign-off, review, consult.", "A light pass: the stakeholders and the alignment touchpoint each needs listed."),
    3: form("Identify every stakeholder with a legitimate opinion on this feature, name the alignment touchpoint required for each (sign-off, design review, security review, eng-lead consult), and confirm each is completed or scheduled before implementation begins. Document the date and outcome.", "Stakeholder alignment for this feature hasn't been confirmed — risk of rework on rejection at demo."),
    4: form("Order the alignment by risk: identify the stakeholder most likely to block or reject, align that one before sinking build time, and surface any conflicting stakeholder positions to resolve before implementation.", "Beyond a touchpoint list: stakeholder alignment ordered by who's likeliest to block, conflicts surfaced."),
    5: form("Write a stakeholder-alignment note: each stakeholder in risk order, their required touchpoint, the date, the outcome, and any conflicts to resolve — so implementation starts on confirmed alignment, not assumed agreement.", "A durable stakeholder-alignment note of risk-ordered touchpoints, dates, outcomes, and conflicts."),
  },
};

/** ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG — convert ambiguity to measurable targets, keyword "ambig". Produces a written note. */
export const ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before building, flag one ambiguous word in the requirements ('better', 'fast') and pin a number to it.", "The lightest step: one ambiguous requirement word pinned to a number."),
    2: form("Scan the requirements for ambiguous quality words and replace each with a measurable target.", "A light pass: the ambiguous quality words found and made measurable."),
    3: form("Audit this feature's requirements for ambiguity: identify every quality-attribute placeholder (\"better\", \"faster\", \"improved\", \"user-friendly\") and replace each with a measurable target — name the metric, the measurement method, and the success threshold.", "Ambiguous quality attributes haven't been converted to measurable targets — risk of unevaluable requirement satisfaction."),
    4: form("Pin each de-ambiguated target to a source and an owner: name where the metric is measured and who agrees the threshold is right, so the once-ambiguous requirement can't be quietly reinterpreted later.", "Beyond a number: each de-ambiguated target tied to a measurement source and an owner."),
    5: form("Write a requirements note: each previously-ambiguous attribute with its metric, measurement method, success threshold, measurement source, and the owner who agreed it — so requirement satisfaction is evaluable, not arguable.", "A durable requirements note converting ambiguity to measurable targets with a source and owner."),
  },
};

/** ABSENCE_DEPENDENCY_MAPPING — map upstream/downstream dependencies, keyword "dependenc". Produces a written note. */
export const ABSENCE_DEPENDENCY_MAPPING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DEPENDENCY_MAPPING', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before starting, name one dependency: one thing this work depends on, and one thing that depends on it.", "The lightest step: one upstream and one downstream dependency named."),
    2: form("Sketch this work's dependencies: what it waits on upstream and what waits on it downstream.", "A light pass: the upstream and downstream dependencies sketched."),
    3: form("Dependency identification is a foundational project management discipline (WBS, critical path method). Before any work begins: what does this work depend on (upstream), and what depends on this work completing (downstream)? Unmapped upstream dependencies create blocked work discovered mid-sprint; unmapped downstream dependencies create integration surprises at the worst time — when another team has built against an unstated assumption.", "Upstream/downstream dependencies for this work haven't been mapped — risk of mid-sprint blocked work or integration surprises."),
    4: form("Turn the dependency map into an order: clear the upstream blocker on the critical path first, and tell each downstream consumer the assumption it's relying on before it builds against it.", "Beyond mapping: the dependency order set by critical path and downstream consumers warned."),
    5: form("Write a dependency note: the upstream blockers in critical-path order and the downstream consumers told of the assumptions they rely on — so blocked work and integration surprises are seen early.", "A durable dependency note of critical-path-ordered blockers and notified downstream consumers."),
  },
};

/** ABSENCE_DEFINITION_OF_DONE — write the Definition of Done, keyword "done". Produces a written note. */
export const ABSENCE_DEFINITION_OF_DONE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DEFINITION_OF_DONE', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before starting, write one condition that must be true for this item to count as done.", "The lightest step: one done condition written before work starts."),
    2: form("Sketch the Definition of Done for this item: the functional result plus the quality and doc bars.", "A light pass: the item's done conditions sketched across function and quality."),
    3: form("Write the Definition of Done for this sprint item before work begins: state the functional condition, the quality gate (testing or review pass), the documentation requirement, and the target deployment state. Use the form \"this item is done when [X] AND [Y].\"", "Definition of Done for this item hasn't been written — risk of sprint-review debate over whether work is finished."),
    4: form("Make each Done condition checkable by someone else: phrase it so a reviewer can confirm it without asking you — a passing test, a visible output, a merged doc — and agree it before work starts, not at review.", "Beyond stating Done: each condition made reviewer-checkable and agreed before work starts."),
    5: form("Write the Definition-of-Done note onto the item: the functional, quality, documentation, and deployment conditions — the shared bar that ends sprint-review debate over whether it's done.", "A durable Definition-of-Done note across function, quality, docs, and deploy."),
  },
};

/** ABSENCE_CROSS_TEAM_IMPACT_CHECK — notify affected teams, keyword "team". Produces a written note. SENSITIVE (notify). */
export const ABSENCE_CROSS_TEAM_IMPACT_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_CROSS_TEAM_IMPACT_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  l2SafeguardRequired: true,
  l2SafeguardLine: "Before you send this change notification to any team, ask me for go-ahead confirmation first.",
  levelForms: {
    1: form("Before changing this shared system, name the one team most affected by it.", "The lightest step: the team most affected by the shared-system change named."),
    2: form("List the teams that touch this shared system and would feel the change, and what each needs to know.", "A light pass: the affected teams and what each needs to know listed."),
    3: form("Identify every team affected by this change to a shared system (API, schema, infrastructure), draft the notification message, send it, and document delivery in the sprint item before implementation begins. A pre-change Slack message costs minutes; a post-change broken integration costs team-days.", "Affected teams haven't been notified of this shared-system change — risk of post-change broken integration costing team-days."),
    4: form("Identify every affected team and draft the notification each needs — what changes, when, and the action required of them — ready to send before implementation starts.", "Beyond a list: each affected team's notification drafted with the action it requires."),
    5: form("Write a change-notification note: every team affected by this shared-system change, the message each received, and delivery confirmed — so a pre-change heads-up replaces a post-change broken integration.", "A durable change-notification note of affected teams and confirmed delivery."),
  },
};

/** ABSENCE_SUCCESS_METRIC_DEFINITION — define the success metric, keyword "metric". Produces a written note. */
export const ABSENCE_SUCCESS_METRIC_DEFINITION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SUCCESS_METRIC_DEFINITION', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before development, name the one metric that will say whether this feature succeeded.", "The lightest step: the one success metric for the feature named."),
    2: form("Define the success metric for this feature: the measure, where it's tracked, and the rough target.", "A light pass: the success metric, its source, and target defined."),
    3: form("Define the success metric for this feature before development: name the metric, the measurement method, the success threshold, and the measurement timeline — e.g. \"feature adoption rate, tracked via feature_used analytics event, threshold 30% of active users within 30 days.\" Add to the sprint item.", "Success metric for this feature hasn't been defined — risk of unevaluable post-ship outcome."),
    4: form("Add a baseline and a guardrail to the metric: record the current value the threshold is measured from, and name one metric that must NOT get worse — so success is a real change, not a number with no reference.", "Beyond specifying the metric: a baseline and a guardrail metric added."),
    5: form("Write a success-metric note onto the item: the metric, how it's measured, the baseline, the threshold, the timeline, and the guardrail that must not regress — the yardstick the feature's post-ship outcome is judged by.", "A durable success-metric note of baseline, measure, threshold, timeline, and guardrail."),
  },
};

/** ABSENCE_PRIORITY_JUSTIFICATION — justify the sprint-item priority, keyword "priorit". Produces a written note. */
export const ABSENCE_PRIORITY_JUSTIFICATION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_PRIORITY_JUSTIFICATION', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before development, state in one line why this item is the priority over the next-best alternative.", "The lightest step: the item's priority justified against the alternative in one line."),
    2: form("Give this item's priority rationale: the value, the urgency, and what it's chosen over.", "A light pass: the priority rationale's value, urgency, and trade-off stated."),
    3: form("State the priority justification for this sprint item in one sentence before development begins: name the user or business value, the urgency or time criticality, the risk reduction or strategic alignment — and the next-highest-priority alternative being deferred to make room for this item.", "Priority rationale for this item hasn't been articulated — risk of silent drift toward easiest work."),
    4: form("Make the priority comparative: score this item and the top deferred alternative on the same axes — value, urgency, risk — and state the cost of NOT doing this now, so it's a defended trade-off.", "Beyond a rationale: the priority scored against the deferred alternative with a cost-of-delay."),
    5: form("Write a priority-justification note onto the item: the value, urgency, and risk reduction scored against the deferred alternative, plus the cost of not doing it now — so sprint order follows reasoning, not the path of least resistance.", "A durable priority-justification note scoring value and urgency against the deferred alternative."),
  },
};

/** ABSENCE_USER_STORY_COMPLETENESS — complete the user story who/what/why, keyword "user". Produces a written note. */
export const ABSENCE_USER_STORY_COMPLETENESS_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_USER_STORY_COMPLETENESS', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before implementing, write this item as 'As a [user], I want [capability], so that [outcome].'", "The lightest step: the item written as a user story before implementing."),
    2: form("Draft the user story for this item — the user, the capability, the outcome — and check the 'so that' holds.", "A light pass: the user story drafted with a real 'so that' outcome."),
    3: form("Rewrite this work item in Connextra format before implementation: \"As a [specific user type], I want [the capability this feature enables], so that [the value or outcome delivered].\" If the \"so that\" cannot be completed, that is the most important thing to resolve — propose what stakeholder conversation closes it.", "User story who/what/why hasn't been completed — risk of technically-correct artifact missing the outcome."),
    4: form("Sharpen the user story: check the user is a specific type not 'the user', split it if it carries more than one 'so that', and attach the one acceptance check that proves the outcome was delivered.", "Beyond who/what/why: the user story made specific, single-outcome, and acceptance-checked."),
    5: form("Write the user-story note onto the item: the specific user, the capability, the outcome it delivers, and the acceptance check that proves it — so the build targets the value, not just a technically-correct artifact.", "A durable user-story note of the user, capability, outcome, and its acceptance check."),
  },
};

/** ABSENCE_RISK_FLAG — identify and rate risks, keyword "risk". Produces a written note. */
export const ABSENCE_RISK_FLAG_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_RISK_FLAG', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before proceeding, name the single biggest risk in this decision and how likely it is.", "The lightest step: the biggest risk in the decision named."),
    2: form("List the main risks for this decision by category and rate each on likelihood and impact.", "A light pass: the main risks listed and rated by likelihood and impact."),
    3: form("Identify the risks for this decision before proceeding: for each risk category (technical, scope, stakeholder, dependency, timeline), name the specific risk, estimate likelihood (H/M/L) and impact (H/M/L), and state the mitigation or acceptance decision. Document each in the sprint item.", "Risks for this decision haven't been identified — assumptions remain unmonitored uncertainties."),
    4: form("Rank and own the top risks: order them by likelihood times impact, and for the top few name who watches each and the early-warning sign that it's materialising — so the worst risks are monitored, not just listed.", "Beyond a rated list: the top risks ranked, owned, and given early-warning signs."),
    5: form("Write a risk note onto the item: each risk by category with its likelihood and impact, ranked by the product of the two, an owner and early-warning sign for the top ones, and the mitigation or acceptance — so assumptions become monitored risks, not silent uncertainties.", "A durable risk note of ranked, owned risks with early-warning signs and mitigation decisions."),
  },
};

/** ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT — assess a mid-sprint scope change, keyword "impact". Produces a written note. */
export const ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Before accepting this scope change, name the one in-progress item it displaces — its first impact.", "The lightest impact check: the item this scope change displaces named."),
    2: form("Assess the scope change's impact: what it displaces and whether the sprint end date moves.", "A light impact pass: the displacement and date effect assessed."),
    3: form("Before accepting this mid-sprint scope change, complete the four-point impact assessment: (1) what existing in-progress item is displaced, (2) does the sprint end date shift, (3) which downstream teams have a date dependency on what this change affects, (4) what is explicitly removed or deferred to make room. Document all four answers in the sprint item before the change enters scope.", "Sprint-impact assessment for this scope change hasn't been completed — risk of sprint failure from un-traded-off expansion."),
    4: form("Turn the impact assessment into a decision: present the trade-off — take it and slip the date, or hold scope and defer it — to whoever owns the sprint, and record their call, so the change is explicit, not absorbed.", "Beyond the four points: the scope-change impact turned into a recorded owner decision."),
    5: form("Write a scope-change impact note onto the item: the displaced work, the date effect, the downstream dependencies, the trade-off made, and the sprint-owner's recorded decision — so mid-sprint changes are traded off, not absorbed silently.", "A durable scope-change impact note of displacement, dates, trade-offs, and the owner's decision."),
  },
};

/** ABSENCE_RETROSPECTIVE_HABIT — run the sprint retrospective, keyword "retro". Produces a written note. */
export const ABSENCE_RETROSPECTIVE_HABIT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_RETROSPECTIVE_HABIT', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: CLASS8_PARAM_AXES,
  levelForms: {
    1: form("Run a quick retro before the next sprint: name one thing that went well and one that didn't.", "The lightest retro step: one went-well and one went-wrong named."),
    2: form("Hold a short retrospective: what went well, what didn't, and one change to try next sprint.", "A light retro pass: the went-well, went-wrong, and one change named."),
    3: form("Run the sprint retrospective now before the next sprint begins: list what went well (preserve and reinforce), what did not go well (process problems without blame), and one or two specific, actionable process changes to try in the next sprint. Document the chosen action items.", "Sprint retrospective hasn't been run before the next cycle — process problems repeat without action items."),
    4: form("Close the loop on retro actions: assign an owner and a date to each change, and start by checking whether last retro's actions actually happened — so improvements compound instead of resetting each sprint.", "Beyond listing changes: each retro action owned and dated, and the previous retro's actions reviewed."),
    5: form("Write a retrospective note: what went well, what didn't, and the chosen action items for the next sprint, each with an owner and a date — so process problems get fixed instead of repeating.", "A durable retrospective note of what to change and the owned, dated action items."),
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
