/**
 * Vibe-coder content-template records (class 7). One record per signal; column 3 is
 * the existing shipped headline (kept verbatim), and columns 1/2/4/5 escalate the
 * same practice from a quick step up to its heaviest form.
 *
 * These are the casual / beginner coaching signals — finishing what's started,
 * polish-after-function, MVP discipline, idea-to-spec, demo-vs-real, user-journey
 * states, spike treatment, dependency restraint, restart restraint, creative-vs-core
 * balance, and the beginner habits (read the error, describe the bug, read generated
 * code, recap learning, simplest-first, one-ask-per-message, commit-before-change,
 * understand-as-you-build). Every signal is single-register — eleven anchor on the
 * casual headline, nine on the beginner headline; there is no formal-base variant, so
 * column 3 is the frozen casual/beginner L1[0].
 *
 * Eight produce a written record at the heaviest column (an MVP-scope note, a spec
 * doc, a demo-readiness note, a states note, a root-cause note, a creative/core ratio
 * note, a requirements note, a learning note). The other twelve are ongoing habits or
 * verification cadences whose heaviest column stays a behaviour (no file) — consistent
 * with the cadence-vs-record split used by the session-meta and planning classes.
 *
 * One signal concerns an intrinsically-sensitive action — adding a dependency — so it
 * carries the confirm-seek safeguard (the `l2SafeguardRequired` flag + an
 * action-specific `l2SafeguardLine` the engine appends as the LAST line of every
 * served column, covering the frozen col-3 anchor too). The escalation is the coaching
 * practice deepening, so none threads a separate spine.
 */

import type { ContentTemplateRecord, LevelForm, ParamAxisTag } from '../content-template-schema.js';
import {
  FEATURE_COMPLETION_CHECK_BEGINNER_OVERRIDE, FINISHING_LINE_AWARENESS_BEGINNER_OVERRIDE,
  POLISH_VS_FUNCTION_BEGINNER_OVERRIDE, MVP_SCOPE_DISCIPLINE_BEGINNER_OVERRIDE,
  IDEA_TO_SPEC_BRIDGE_BEGINNER_OVERRIDE, DEMO_VS_PRODUCT_BEGINNER_OVERRIDE,
  USER_JOURNEY_CHECK_BEGINNER_OVERRIDE, TECHNICAL_SPIKE_TREATMENT_BEGINNER_OVERRIDE,
  DEPENDENCY_ADVENTURE_BEGINNER_OVERRIDE, RESTART_IMPULSE_CHECK_BEGINNER_OVERRIDE,
  CREATIVE_VS_CORE_RATIO_BEGINNER_OVERRIDE,
} from './class7-records-beginner.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}

/** The param axes a vibe-coder why-desc grounds (same generic sources as the other classes). */
export const VIBE_PARAM_AXES: Readonly<Record<string, ParamAxisTag>> = {
  workflow_pattern: 'extensible',
  decision_making_rhythm: 'closed-ordinal',
  explanation_learning_depth: 'closed-ordinal',
  abstraction_level_orientation: 'closed-ordinal',
  project_framework: 'open',
};

// ── CASUAL-anchored signals (11) ───────────────────────────────────────────────

/** ABSENCE_FEATURE_COMPLETION_CHECK — finish before starting, keyword "feature". Behavioural cadence. */
export const ABSENCE_FEATURE_COMPLETION_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_FEATURE_COMPLETION_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: FEATURE_COMPLETION_CHECK_BEGINNER_OVERRIDE },
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Quick check: is the last feature actually done and working end-to-end before starting a new feature?", "The lightest completion check: the last feature confirmed working end-to-end before the next."),
    2: form("Check the last feature: run it on the main path and confirm it's done before starting the next feature.", "A light pass: the last feature run on the main path and confirmed done before the next."),
    3: form("Checkpoint: what's the state of the last feature started? Is it done and tested end-to-end? Scrum's Definition of Done exists because partially-done features compound — starting new ones before previous ones meet DoD means carrying technical debt through every subsequent sprint.", "The previous feature hasn't been verified done end-to-end — starting the next risks compounding unfinished work."),
    4: form("Before the next feature, confirm the last one against its done bar: the main path works, the obvious edge cases hold, and nothing is left half-wired.", "Beyond a quick look: the last feature checked against a done bar — main path, edge cases, nothing half-wired."),
    5: form("Make it a standing rule: no new feature starts until the last feature is verified done end-to-end — so unfinished work never stacks.", "A standing rule: each feature verified done end-to-end before the next begins."),
  },
};

/** ABSENCE_FINISHING_LINE_AWARENESS — drive WIP to done, keyword "progress". Behavioural cadence. */
export const ABSENCE_FINISHING_LINE_AWARENESS_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_FINISHING_LINE_AWARENESS', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: FINISHING_LINE_AWARENESS_BEGINNER_OVERRIDE },
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Count the work in progress: how many things are half-built versus finished? Push the closest one to done.", "The lightest finishing step: the work-in-progress counted and the closest one pushed to done."),
    2: form("List what's in progress, pick the one nearest done, and finish it before opening anything new.", "A light pass: the in-progress items listed and the nearest one finished first."),
    3: form("Count check: how many features are currently in-progress vs. complete end-to-end? A partially-done feature delivers zero user value. Three features 40% each is worse than one feature 100% — the user can use one, and none of three.", "Multiple in-progress features haven't been pushed to completion — WIP accumulates without delivering value."),
    4: form("Cap the work in progress: pick a small limit, finish what's open down to that cap before starting more, so half-done work converges instead of spreading.", "Beyond counting: a work-in-progress cap enforced so open items converge to done."),
    5: form("Make finish-before-start the cadence: keep one or two things in progress at a time and drive each to done before opening the next — so value ships instead of accumulating half-built.", "A standing cadence: work-in-progress kept low and each item driven to done before the next."),
  },
};

/** ABSENCE_POLISH_VS_FUNCTION — function before polish, keyword "polish". Behavioural cadence. */
export const ABSENCE_POLISH_VS_FUNCTION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_POLISH_VS_FUNCTION', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: POLISH_VS_FUNCTION_BEGINNER_OVERRIDE },
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before more polish, check: does the core actually work end-to-end yet?", "The lightest sequencing step: the core confirmed working before any polish."),
    2: form("Run the core path first and confirm it works, then spend effort on polish — not before.", "A light pass: the core path confirmed working before polish effort goes in."),
    3: form("Lean MVP principle: polish comes after function. Before spending more prompts on UI improvements — does the core functionality work end-to-end? 'MVP UI should be clean and usable, not museum-quality.' Fix the working before fixing the looking.", "Core functionality hasn't been verified end-to-end — UI polish on a non-functional core wastes effort and compounds rework."),
    4: form("Separate the two passes: get the core function working and verified first, then make a dedicated polish pass on top — never interleave polish into a core that isn't proven.", "Beyond a check: function-first then a dedicated polish pass, never interleaved on an unproven core."),
    5: form("Make function-before-polish the standing order: no polish work starts until the core is working end-to-end — so effort never lands on a base that doesn't run.", "A standing order: the core works end-to-end before any polish begins."),
  },
};

/** ABSENCE_MVP_SCOPE_DISCIPLINE — gate features against the MVP hypothesis, keyword "mvp". Produces a written note. */
export const ABSENCE_MVP_SCOPE_DISCIPLINE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_MVP_SCOPE_DISCIPLINE', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: MVP_SCOPE_DISCIPLINE_BEGINNER_OVERRIDE },
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before adding the next feature, ask one question: does this test the core MVP idea, or is it extra?", "The lightest MVP gate: the next feature checked against the core idea before it's added."),
    2: form("Run each candidate feature through the MVP test: keep what proves the core hypothesis, drop the rest for now.", "A light MVP pass: features kept only when they test the core hypothesis."),
    3: form("Eric Ries MVP heuristic: start with what you believe is needed, then eliminate half the features, then eliminate half again. Each addition should answer: does this test the core hypothesis? Is it the minimum needed to get real user feedback? If neither — it's gold-plating an unvalidated MVP.", "Feature additions haven't been gated against MVP-hypothesis — risk of gold-plating an unvalidated MVP."),
    4: form("Cut to the real MVP: list the planned features, mark each as core-hypothesis or nice-to-have, and defer everything that isn't needed to get real user feedback.", "Beyond gating one feature: the whole list split into core-MVP versus deferred."),
    5: form("Write an MVP scope note: the features that test the core hypothesis, the ones deferred, and why — the cut list the build holds to so it doesn't gold-plate.", "A durable MVP scope note of the core feature cut and what's deferred."),
  },
};

/** ABSENCE_IDEA_TO_SPEC_BRIDGE — spec before building, keyword "spec". Produces a written doc. */
export const ABSENCE_IDEA_TO_SPEC_BRIDGE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_IDEA_TO_SPEC_BRIDGE', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: IDEA_TO_SPEC_BRIDGE_BEGINNER_OVERRIDE },
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before building, write one line of spec: what does this feature do?", "The lightest spec step: a one-line spec of what the feature does before building."),
    2: form("Sketch a quick spec before building: what it does, what it doesn't, and how it fits what's there.", "A light spec pass: what it does, what it doesn't, and where it fits."),
    3: form("Spec-driven development principle: a feature idea is not a spec. Before building — write a one-paragraph description: what does this feature do? What does it NOT do? How does it fit into what already exists? The spec becomes the source of truth; code is its expression.", "The idea hasn't been spec'd before building — directed building gives way to creative wandering."),
    4: form("Turn the idea into a spec with acceptance criteria: the behaviour it must show, the explicit non-goals, and at least one concrete pass/fail scenario that says when it's correctly built.", "Beyond a description: a spec with at least one concrete pass/fail acceptance scenario."),
    5: form("Write the spec into a short doc: what the feature does, what it does NOT do, and how it fits the existing system — the source of truth the code is then written against.", "A durable spec doc: behaviour, non-goals, and fit as the source of truth."),
  },
};

/** ABSENCE_DEMO_VS_PRODUCT — name the demo-vs-real quality standard, keyword "demo". Produces a written note. */
export const ABSENCE_DEMO_VS_PRODUCT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DEMO_VS_PRODUCT', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: DEMO_VS_PRODUCT_BEGINNER_OVERRIDE },
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before building more, name it: is this a throwaway demo or the real thing people will use?", "The lightest step: the demo-versus-real standard named before more is built."),
    2: form("Mark the demo parts explicitly — hardcoded data, happy-path only — so demo work isn't mistaken for the real build.", "A light pass: the demo-grade parts marked so they aren't taken as real."),
    3: form("Production readiness check: what quality standard applies to what's being built? Demo code and production code have different requirements. If this is a demo — mark it explicitly: hardcoded data, no edge cases, visual-only. If it's the actual product — it needs real data connected, error states handled, and edge cases working.", "Demo-vs-production quality standard hasn't been named — prototype code risks being treated as production."),
    4: form("Draw the line per piece: which parts are demo-grade (hardcoded, no edge cases) and which must be real — connected data, error states, edge cases handled — before this counts as shippable.", "Beyond naming it: each piece marked demo-grade or must-be-real before it ships."),
    5: form("Write a readiness note: which parts are demo-grade and which must be real — connected data, error and empty states, edge cases — before the demo becomes the live product people depend on.", "A durable readiness note separating demo-grade parts from what must be real to ship."),
  },
};

/** ABSENCE_USER_JOURNEY_CHECK — map the non-happy-path states, keyword "state". Produces a written note. */
export const ABSENCE_USER_JOURNEY_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_USER_JOURNEY_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: USER_JOURNEY_CHECK_BEGINNER_OVERRIDE },
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Beyond the happy path, name one missing state: what shows when there's no data?", "The lightest journey step: one missing state — the empty state — named."),
    2: form("Walk the main states: first-use, empty, and error — and note which aren't handled yet.", "A light pass: first-use, empty, and error states checked for gaps."),
    3: form("Jeff Patton User Story Mapping: once a basic happy path is in place, consider edge cases, alternatives, and exceptions. Before building more — answer: (1) what does the user see the first time they encounter this feature? (2) what happens when there's no data — the empty state? (3) what happens when something goes wrong — the error state? Each is a must-handle state.", "Empty / error / first-use states haven't been mapped — happy-path-only feels complete but breaks user trust."),
    4: form("Map the journey state by state: first-use, empty, loading, error, and success — for each, what the user sees and what's still unhandled.", "Beyond three states: the full journey mapped state by state with the gaps named."),
    5: form("Write a states note that maps every state in the journey — first-use, empty, loading, error, success — what the user sees in each, and the must-handle gaps left to close.", "A durable states note mapping the journey with the must-handle gaps."),
  },
};

/** ABSENCE_TECHNICAL_SPIKE_TREATMENT — keep spike code out of the real build, keyword "spike". Behavioural rule. */
export const ABSENCE_TECHNICAL_SPIKE_TREATMENT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_TECHNICAL_SPIKE_TREATMENT', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: TECHNICAL_SPIKE_TREATMENT_BEGINNER_OVERRIDE },
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Name what this is: a spike to learn something, or real code to keep?", "The lightest step: the work named as a spike-to-learn or real code-to-keep."),
    2: form("Label the spike code as throwaway, and don't let it drift into the real codebase unrewritten.", "A light pass: the spike marked throwaway and kept out of the real code."),
    3: form("XP spike solution principle (Kent Beck / James Shore): 'Never copy spike code into production code. Even if it is exactly what you need, rewrite it using TDD so that it meets production standards.' The purpose of exploratory code is knowledge, not shipping. Name what's being done: spike (to learn) or production (to ship)?", "Exploratory code hasn't been distinguished from production code — spike code risks being committed as production."),
    4: form("Treat the spike as knowledge, not shippable code: capture what it taught, then rewrite the real version cleanly with tests rather than promoting the spike as-is.", "Beyond labelling it: the spike's lesson captured and the real version rewritten with tests."),
    5: form("Make it a standing rule: spike code is for learning only — never copy it into the real codebase; once it has taught you the approach, rewrite it properly with tests.", "A standing rule: spike code stays exploratory and the kept version is always rewritten with tests."),
  },
};

/** ABSENCE_DEPENDENCY_ADVENTURE — justify a dependency before adding it, keyword "dependency". SENSITIVE (install). */
export const ABSENCE_DEPENDENCY_ADVENTURE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DEPENDENCY_ADVENTURE', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: DEPENDENCY_ADVENTURE_BEGINNER_OVERRIDE },
  paramAxes: VIBE_PARAM_AXES,
  l2SafeguardRequired: true,
  l2SafeguardLine: "Before adding or installing this dependency, ask me for go-ahead confirmation first.",
  levelForms: {
    1: form("Before adding this dependency, ask: what specific problem does it solve that I can't easily solve without it?", "The lightest dependency gate: the new dependency justified by a specific need before adding."),
    2: form("Check the dependency before adding it: the specific need, whether it's maintained, and whether existing tools already cover it.", "A light pass: the dependency's need, health, and overlap checked before adding."),
    3: form("Dependency management principle: 'Dependencies are not free and extract an ongoing maintenance cost.' Every library added for interest rather than specific need becomes code you did not write but have localized responsibility for. Before adding this — what specific problem does it solve that you can't solve without it?", "Dependency necessity hasn't been evaluated — every interest-driven library becomes ongoing maintenance debt."),
    4: form("Weigh the dependency honestly: the specific problem it solves, the maintenance cost it adds, and the lighter alternative — and keep it only if the need clearly beats the cost.", "Beyond a quick check: the dependency weighed need-versus-cost against a lighter alternative."),
    5: form("Make justify-before-adding the standing gate: every dependency must earn its place against a specific need and its ongoing maintenance cost before it goes in — interest alone isn't enough.", "A standing gate: each dependency earns its place against need and maintenance cost before it's added."),
  },
};

/** ABSENCE_RESTART_IMPULSE_CHECK — diagnose before restarting from scratch, keyword "restart". Produces a written note. */
export const ABSENCE_RESTART_IMPULSE_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_RESTART_IMPULSE_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: RESTART_IMPULSE_CHECK_BEGINNER_OVERRIDE },
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before restarting from scratch, name the one thing that actually went wrong.", "The lightest restart check: the one real problem named before throwing work away."),
    2: form("Pause the restart: list what's actually broken and whether a fix is smaller than a rewrite.", "A light pass: the restart paused while the real problems are listed and weighed."),
    3: form("Joel Spolsky: 'When you start from scratch there is absolutely no reason to believe that you are going to do a better job than you did the first time. Each fixed bug took weeks or years of real-world usage to be discovered — when you throw away code, all the knowledge that went into it is lost.' Before restarting: what specifically went wrong and why?", "Root-cause debugging hasn't been done — restart impulse discards accumulated bug-knowledge."),
    4: form("Diagnose before restarting: what specifically broke, why, and what hard-won fixes already live in this code — then decide fix-versus-restart on evidence, not impulse.", "Beyond naming one issue: the breakage diagnosed and the restart weighed against the code it would discard."),
    5: form("Write a root-cause note before any restart: what went wrong and why, the fixes already baked into the current code, and the evidence for fixing versus rewriting — so a restart is a decision, not an impulse.", "A durable root-cause note weighing fix-versus-restart on evidence."),
  },
};

/** ABSENCE_CREATIVE_VS_CORE_RATIO — keep effort weighted to the core, keyword "creative". Produces a written note. */
export const ABSENCE_CREATIVE_VS_CORE_RATIO_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_CREATIVE_VS_CORE_RATIO', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: CREATIVE_VS_CORE_RATIO_BEGINNER_OVERRIDE },
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Quick gut-check: is more effort going to creative extras than to the core product right now?", "The lightest ratio check: creative-versus-core effort sensed before the next extra."),
    2: form("Eyeball the split: roughly how much of this session went to creative extras versus core function?", "A light pass: the creative-versus-core effort split estimated for the session."),
    3: form("Value-driven development: 'features that generate the maximum value for the users without creating the maximum cost.' Before the next creative or aesthetic feature — look at this session: what proportion of prompts went to core product functionality vs. creative/extra features? If more than 30-40% is creative, the core is under-served.", "Session ratio of core vs creative effort hasn't been audited — creative work risks outweighing core user value."),
    4: form("Tally the ratio honestly: count the prompts spent on core product function versus creative or aesthetic extras, and rebalance toward core if the extras are winning.", "Beyond a gut-check: the creative-versus-core ratio tallied and rebalanced toward core."),
    5: form("Write a quick ratio note: core-function effort versus creative effort this session, where it's out of balance, and the rebalance plan — so creative work supports the core instead of outweighing it.", "A durable ratio note of core-versus-creative effort and the rebalance plan."),
  },
};

// ── BEGINNER-anchored signals (9) ──────────────────────────────────────────────

/** ABSENCE_ERROR_UNDERSTANDING — read and explain the error first, keyword "error". Behavioural habit. */
export const ABSENCE_ERROR_UNDERSTANDING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_ERROR_UNDERSTANDING', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before asking me to fix this error, read the error message once and tell me what it says.", "The lightest step: the error message read and put in plain words before a fix."),
    2: form("Read the error message, then tell me what you think went wrong and where.", "A light pass: the error read and a first guess at the cause shared."),
    3: form("1. Before asking to fix this error — read the error message carefully.\n2. Share with me: what do you think it's saying went wrong?\n3. Then tell me: does your explanation match where the problem is in the code?", "The error message hasn't been read and explained — fixing without understanding leads to repeating the same class of error."),
    4: form("Read the whole error, not just the last line: the message, the exact file and line it points to, and what changed just before it appeared — then name which of those is the actual cause.", "Beyond a first read: the full error traced to a file, line, and recent change, and the real cause named."),
    5: form("Make read-the-error-first a habit: every time, read the error message and explain it before any fix — so fixes target the real cause, not a guess.", "A standing habit: the error read and understood before any fix is attempted."),
  },
};

/** ABSENCE_REQUIREMENT_CLARITY — describe what working looks like first, keyword "work". Produces a written note. */
export const ABSENCE_REQUIREMENT_CLARITY_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_REQUIREMENT_CLARITY', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before I build this, tell me in one line what it should do when it's working.", "The lightest step: what working looks like stated in one line before building."),
    2: form("Tell me what it should do, what working looks like, and one thing it should not do.", "A light pass: the goal, the working result, and one non-goal described."),
    3: form("1. Before I build this — tell me specifically what you want it to do.\n2. Share with me: what does it look like when it's working correctly?\n3. Then tell me: what should NOT happen — is there anything it should avoid doing?", "What 'working' looks like hasn't been described — building proceeds without a target."),
    4: form("Pin the target with an example: what it does, what 'working' looks like shown as one concrete input and the result it should give, and what it must avoid — so done is checkable, not a feeling.", "Beyond a description: the working result shown as a concrete input-and-result example."),
    5: form("Write a short requirements note: what it should do, what 'working' looks like in concrete terms, and what it must avoid — the target we build and check against.", "A durable requirements note of the working target and what to avoid."),
  },
};

/** ABSENCE_COPY_PASTE_AWARENESS — read generated code before using it, keyword "read". Behavioural habit. */
export const ABSENCE_COPY_PASTE_AWARENESS_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_COPY_PASTE_AWARENESS', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before adding the generated code, read through it once.", "The lightest step: the generated code read once before it's added."),
    2: form("Read the generated code and tell me, in plain words, what the main parts do.", "A light pass: the generated code read and its main parts explained."),
    3: form("1. Before adding the generated code to your project — read through it.\n2. Share with me: what does each part do in plain words?\n3. If there's a part you're not sure about, point it out and we'll go through it together before it goes in.", "Generated code hasn't been read for understanding — using code one can't explain creates future-debugging debt."),
    4: form("Before it goes in, read every part and actively check the one you're least sure of — confirm it does what you think by reading it closely or running it — and only then keep any of it.", "Beyond reading: the least-sure part actively confirmed, not just read."),
    5: form("Make read-before-use the rule: never add generated code you can't explain — read it, understand each part, and only then keep it.", "A standing rule: generated code is read and understood before it's ever kept."),
  },
};

/** ABSENCE_DEBUGGING_OBSERVATION — observe before fixing, keyword "bug". Behavioural habit. */
export const ABSENCE_DEBUGGING_OBSERVATION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DEBUGGING_OBSERVATION', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before I look at the bug, tell me what actually happened.", "The lightest step: what happened with the bug described before a fix."),
    2: form("Describe the bug: what you expected, what happened instead, and any error shown.", "A light pass: expected-versus-actual and any error captured for the bug."),
    3: form("1. Before I look at the bug — describe what happened.\n2. Share with me: what did you expect to happen, and what actually happened instead?\n3. Then tell me: is there an error message, and if so, what does it say?", "What happened vs expected hasn't been described — fixing without observation guesses at the bug."),
    4: form("Pin the bug down: the exact steps that trigger it, what you expected versus what happened, and the precise error or wrong output — the facts a fix can target.", "Beyond a description: the bug's repro steps and exact symptom pinned down."),
    5: form("Make observe-before-fixing the habit: every bug gets described — steps, expected, actual, error — before any fix, so the fix targets the real behaviour.", "A standing habit: each bug observed and described before a fix is tried."),
  },
};

/** ABSENCE_LEARNING_CONSOLIDATION — recap the session's learning, keyword "learn". Produces a written note. */
export const ABSENCE_LEARNING_CONSOLIDATION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_LEARNING_CONSOLIDATION', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before we wrap up, tell me one thing you learned this session.", "The lightest step: one thing learned this session named before wrapping up."),
    2: form("Recap what you learned: the main thing you understand now, and anything still unclear.", "A light pass: the main learning recapped and the unclear parts named."),
    3: form("1. We've covered a lot in this session — take a moment and think about what you actually learned.\n2. Share with me: what's the most important thing you now understand that you didn't before?\n3. Then tell me: is there anything we covered that still feels unclear or confusing?", "Session learning hasn't been recapped — built code without understanding becomes a maintenance problem."),
    4: form("Consolidate the learning: the key things you now understand, how they connect, and the specific parts still fuzzy enough to revisit next time.", "Beyond a recap: the learning connected and the fuzzy parts marked to revisit."),
    5: form("Write a short learning note: what you understood this session, how the pieces fit, and what to revisit — so the learning sticks instead of fading.", "A durable learning note of what was understood and what to revisit."),
  },
};

/** ABSENCE_SIMPLE_SOLUTION_FIRST — reach for the simplest solution first, keyword "simpl". Behavioural habit. */
export const ABSENCE_SIMPLE_SOLUTION_FIRST_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SIMPLE_SOLUTION_FIRST', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before building something complex, ask: is there a simpler way to get the same result?", "The lightest step: a simpler path considered before the complex one."),
    2: form("Describe what you're trying to do in plain terms, and let's find the simplest version that works first.", "A light pass: the goal stated plainly and the simplest working version tried first."),
    3: form("1. Before building something complex — ask: is there a simpler way to get the same result? The simplest solution that works is almost always the right one to start with.\n2. Share what you're trying to do in plain terms. Let's find the simple version first.", "Simple-first solution hasn't been tried — complexity-first creates code that can't be unsimplified."),
    4: form("Start from the simplest thing that could work: write it, see if it's enough, and add complexity only where the simple version actually falls short.", "Beyond trying simple: the simplest version built first and complexity added only where it's needed."),
    5: form("Make simple-first the habit: always reach for the simplest solution that works and add complexity only when a real need proves it — so code stays easy to change.", "A standing habit: the simplest working solution first, complexity only when proven needed."),
  },
};

/** ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING — one ask per message, keyword "message". Behavioural habit. */
export const ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Send just one thing in this message instead of several at once.", "The lightest step: a single ask in the message instead of many."),
    2: form("Pick the most important thing and put only that in this message; we'll do the next one after.", "A light pass: the top item sent alone in the message, the rest deferred."),
    3: form("1. When you send several things at once, the results get messy and hard to check. Try focusing on just one thing per message.\n2. What's the most important thing to do right now? Start with that — then we'll move to the next.", "Single-responsibility prompting hasn't been applied — multiple things asked in one message make responses harder to verify and harder to fix."),
    4: form("If a task has several parts, break it into a short numbered list and send one part per message, checking each result before sending the next.", "Beyond one ask: a multi-part task split into one-per-message steps, checked between each."),
    5: form("Make one-ask-per-message the habit: send a single focused request each time and move to the next only once it's done — so nothing gets muddled or skipped.", "A standing habit: one focused request per message, taken in sequence."),
  },
};

/** ABSENCE_ROLLBACK_AWARENESS — commit before a risky change, keyword "commit". Behavioural habit. */
export const ABSENCE_ROLLBACK_AWARENESS_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_ROLLBACK_AWARENESS', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before a big change, do a git commit so there's a snapshot to go back to.", "The lightest safety step: a commit saved before a big change."),
    2: form("Commit the working state first (git add . then git commit), then make the change.", "A light pass: the working state committed before the change is made."),
    3: form("1. Before making a big change to your code — do a git commit first. This saves a snapshot you can always go back to if something breaks.\n2. Not sure how? Try: git add . then git commit -m 'working before change'. Then make your change safely.", "Current working state hasn't been committed to git — change-without-snapshot leaves no return path."),
    4: form("Commit at safe points: a working commit before each risky change, with a clear message, so any step can be rolled back without losing the rest.", "Beyond one snapshot: a clear working commit before each risky step for clean rollback."),
    5: form("Make commit-before-change the habit: save a working commit before every significant change, so there's always a clean point to roll back to.", "A standing habit: a working commit before every significant change."),
  },
};

/** ABSENCE_BUILD_VS_UNDERSTAND_RATIO — keep understanding level with the build, keyword "understand". Behavioural habit. */
export const ABSENCE_BUILD_VS_UNDERSTAND_RATIO_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_BUILD_VS_UNDERSTAND_RATIO', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Pause and check your understanding: in your own words, what does the code we just added do?", "The lightest understanding check: the just-added code explained in plain words."),
    2: form("Explain the main pieces we built and flag anything you don't fully understand.", "A light pass: the main pieces explained and the gaps in understanding flagged."),
    3: form("1. We've added a lot of code — can you explain in your own words what it does? Even a rough description is fine.\n2. Understanding what you've built is as important as building it. Code you don't understand becomes a problem you can't fix later.", "Built code understanding hasn't been verified — code one can't explain becomes a problem one can't fix."),
    4: form("Check understanding across the build: walk each main part, explain what it does and why, and mark the parts you couldn't explain to learn before building more.", "Beyond one explanation: each main part explained and the gaps in understanding marked."),
    5: form("Make understand-as-you-build the habit: keep the code you can explain level with the code you've added, so you never rely on a part you don't understand.", "A standing habit: understanding kept level with the code being built."),
  },
};

/** All class-7 vibe-coder records = the 20 signals (11 casual-anchored + 9 beginner-anchored). */
export const CLASS7_RECORDS: readonly ContentTemplateRecord[] = [
  ABSENCE_FEATURE_COMPLETION_CHECK_RECORD,
  ABSENCE_FINISHING_LINE_AWARENESS_RECORD,
  ABSENCE_POLISH_VS_FUNCTION_RECORD,
  ABSENCE_MVP_SCOPE_DISCIPLINE_RECORD,
  ABSENCE_IDEA_TO_SPEC_BRIDGE_RECORD,
  ABSENCE_DEMO_VS_PRODUCT_RECORD,
  ABSENCE_USER_JOURNEY_CHECK_RECORD,
  ABSENCE_TECHNICAL_SPIKE_TREATMENT_RECORD,
  ABSENCE_DEPENDENCY_ADVENTURE_RECORD,
  ABSENCE_RESTART_IMPULSE_CHECK_RECORD,
  ABSENCE_CREATIVE_VS_CORE_RATIO_RECORD,
  ABSENCE_ERROR_UNDERSTANDING_RECORD,
  ABSENCE_REQUIREMENT_CLARITY_RECORD,
  ABSENCE_COPY_PASTE_AWARENESS_RECORD,
  ABSENCE_DEBUGGING_OBSERVATION_RECORD,
  ABSENCE_LEARNING_CONSOLIDATION_RECORD,
  ABSENCE_SIMPLE_SOLUTION_FIRST_RECORD,
  ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_RECORD,
  ABSENCE_ROLLBACK_AWARENESS_RECORD,
  ABSENCE_BUILD_VS_UNDERSTAND_RATIO_RECORD,
];
