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
    1: form("Quick check: is the last feature actually done and working end-to-end before starting a new feature?", "Just confirm the last feature actually works end-to-end before starting a new feature."),
    2: form("Check the last feature: run it on the main path and confirm it's done before starting the next feature.", "Run the last feature on its main path and confirm it's done before starting the next."),
    3: form("Checkpoint: what's the state of the last feature started? Is it done and tested end-to-end? Scrum's Definition of Done exists because partially-done features compound — starting new ones before previous ones meet DoD means carrying technical debt through every subsequent sprint.", "Say the state of the last feature started — is it done and tested end-to-end? — before starting the next, so unfinished work doesn't compound."),
    4: form("Before the next feature, confirm the last one against its done bar: the main path works, the obvious edge cases hold, and nothing is left half-wired.", "Check the last feature against its done bar — the main path works, the obvious edge cases hold, and nothing's left half-wired — before the next."),
    5: form("Make it a standing rule: no new feature starts until the last feature is verified done end-to-end — so unfinished work never stacks.", "Hold it as a standing rule — no new feature starts until the last is verified done end-to-end, so unfinished work never stacks."),
  },
};

/** ABSENCE_FINISHING_LINE_AWARENESS — drive WIP to done, keyword "progress". Behavioural cadence. */
export const ABSENCE_FINISHING_LINE_AWARENESS_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_FINISHING_LINE_AWARENESS', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: FINISHING_LINE_AWARENESS_BEGINNER_OVERRIDE },
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Count the work in progress: how many things are half-built versus finished? Push the closest one to done.", "Just count the work in progress — how many things are half-built versus finished — and push the closest one to done."),
    2: form("List what's in progress, pick the one nearest done, and finish it before opening anything new.", "For what's in progress, pick the one nearest done and finish it before opening anything new."),
    3: form("Count check: how many features are currently in-progress vs. complete end-to-end? A partially-done feature delivers zero user value. Three features 40% each is worse than one feature 100% — the user can use one, and none of three.", "Weigh how many features are in-progress versus complete end-to-end — three at 40% each is worse than one at 100%, since the user can use one and none of three."),
    4: form("Cap the work in progress: pick a small limit, finish what's open down to that cap before starting more, so half-done work converges instead of spreading.", "Set a work-in-progress cap — a small limit, finish what's open down to it before starting more, so half-done work converges instead of spreading."),
    5: form("Make finish-before-start the cadence: keep one or two things in progress at a time and drive each to done before opening the next — so value ships instead of accumulating half-built.", "Hold finish-before-start as the cadence — keep one or two things in progress at a time and drive each to done before opening the next, so value ships instead of accumulating half-built."),
  },
};

/** ABSENCE_POLISH_VS_FUNCTION — function before polish, keyword "polish". Behavioural cadence. */
export const ABSENCE_POLISH_VS_FUNCTION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_POLISH_VS_FUNCTION', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: POLISH_VS_FUNCTION_BEGINNER_OVERRIDE },
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before more polish, check: does the core actually work end-to-end yet?", "Just check the core actually works end-to-end before any more polish."),
    2: form("Run the core path first and confirm it works, then spend effort on polish — not before.", "Get the core path working and confirmed first, then spend effort on polish — not before."),
    3: form("Lean MVP principle: polish comes after function. Before spending more prompts on UI improvements — does the core functionality work end-to-end? 'MVP UI should be clean and usable, not museum-quality.' Fix the working before fixing the looking.", "Confirm the core functionality works end-to-end before spending more prompts on UI — fix the working before fixing the looking."),
    4: form("Separate the two passes: get the core function working and verified first, then make a dedicated polish pass on top — never interleave polish into a core that isn't proven.", "Split the two passes — get the core function working and verified first, then make a dedicated polish pass on top, never interleaving polish into a core that isn't proven."),
    5: form("Make function-before-polish the standing order: no polish work starts until the core is working end-to-end — so effort never lands on a base that doesn't run.", "Hold function-before-polish as the standing order — no polish work starts until the core works end-to-end, so effort never lands on a base that doesn't run."),
  },
};

/** ABSENCE_MVP_SCOPE_DISCIPLINE — gate features against the MVP hypothesis, keyword "mvp". Produces a written note. */
export const ABSENCE_MVP_SCOPE_DISCIPLINE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_MVP_SCOPE_DISCIPLINE', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: MVP_SCOPE_DISCIPLINE_BEGINNER_OVERRIDE },
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before adding the next feature, ask one question: does this test the core MVP idea, or is it extra?", "Just ask one thing before adding the next feature — does it test the core MVP idea, or is it extra?"),
    2: form("Run each candidate feature through the MVP test: keep what proves the core hypothesis, drop the rest for now.", "Put each candidate feature through the MVP test — keep what proves the core hypothesis, drop the rest for now."),
    3: form("Eric Ries MVP heuristic: start with what you believe is needed, then eliminate half the features, then eliminate half again. Each addition should answer: does this test the core hypothesis? Is it the minimum needed to get real user feedback? If neither — it's gold-plating an unvalidated MVP.", "For each addition, ask whether it tests the core hypothesis and is no larger than what's needed to get real user feedback — if neither, it's gold-plating an unvalidated MVP."),
    4: form("Cut to the real MVP: list the planned features, mark each as core-hypothesis or nice-to-have, and defer everything that isn't needed to get real user feedback.", "Trim to the real MVP — list the planned features, mark each core-hypothesis or nice-to-have, and defer everything not needed to get real user feedback."),
    5: form("Write an MVP scope note: the features that test the core hypothesis, the ones deferred, and why — the cut list the build holds to so it doesn't gold-plate.", "Capture an MVP scope note — the features that test the core hypothesis, the ones deferred, and why — the cut list the build holds to so it doesn't gold-plate."),
  },
};

/** ABSENCE_IDEA_TO_SPEC_BRIDGE — spec before building, keyword "spec". Produces a written doc. */
export const ABSENCE_IDEA_TO_SPEC_BRIDGE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_IDEA_TO_SPEC_BRIDGE', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: IDEA_TO_SPEC_BRIDGE_BEGINNER_OVERRIDE },
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before building, write one line of spec: what does this feature do?", "Just one line of spec before building — what does this feature do?"),
    2: form("Sketch a quick spec before building: what it does, what it doesn't, and how it fits what's there.", "Rough out a quick spec before building — what it does, what it doesn't, and how it fits what's there."),
    3: form("Spec-driven development principle: a feature idea is not a spec. Before building — write a one-paragraph description: what does this feature do? What does it NOT do? How does it fit into what already exists? The spec becomes the source of truth; code is its expression.", "Before building, write a one-paragraph description — what this feature does, what it does NOT do, and how it fits what already exists — as the source of truth the code expresses."),
    4: form("Turn the idea into a spec with acceptance criteria: the behaviour it must show, the explicit non-goals, and at least one concrete pass/fail scenario that says when it's correctly built.", "Build the idea into a spec with acceptance criteria — the behaviour it must show, the explicit non-goals, and at least one concrete pass/fail scenario that says when it's correctly built."),
    5: form("Write the spec into a short doc: what the feature does, what it does NOT do, and how it fits the existing system — the source of truth the code is then written against.", "Capture the spec in a short doc — what the feature does, what it does NOT do, and how it fits the existing system — the source of truth the code is written against."),
  },
};

/** ABSENCE_DEMO_VS_PRODUCT — name the demo-vs-real quality standard, keyword "demo". Produces a written note. */
export const ABSENCE_DEMO_VS_PRODUCT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DEMO_VS_PRODUCT', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: DEMO_VS_PRODUCT_BEGINNER_OVERRIDE },
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before building more, name it: is this a throwaway demo or the real thing people will use?", "Just name it before building more — is this a throwaway demo or the real thing people will use?"),
    2: form("Mark the demo parts explicitly — hardcoded data, happy-path only — so demo work isn't mistaken for the real build.", "Flag the demo parts explicitly — hardcoded data, happy-path only — so demo work isn't mistaken for the real build."),
    3: form("Production readiness check: what quality standard applies to what's being built? Demo code and production code have different requirements. If this is a demo — mark it explicitly: hardcoded data, no edge cases, visual-only. If it's the actual product — it needs real data connected, error states handled, and edge cases working.", "Name the quality standard for what's being built — if it's a demo, mark it (hardcoded data, no edge cases, visual-only); if it's the real product, it needs real data, error states, and edge cases working."),
    4: form("Draw the line per piece: which parts are demo-grade (hardcoded, no edge cases) and which must be real — connected data, error states, edge cases handled — before this counts as shippable.", "Split it per piece — which parts are demo-grade (hardcoded, no edge cases) and which must be real (connected data, error states, edge cases handled) before this counts as shippable."),
    5: form("Write a readiness note: which parts are demo-grade and which must be real — connected data, error and empty states, edge cases — before the demo becomes the live product people depend on.", "Capture a readiness note — which parts are demo-grade and which must be real (connected data, error and empty states, edge cases) before the demo becomes the live product people depend on."),
  },
};

/** ABSENCE_USER_JOURNEY_CHECK — map the non-happy-path states, keyword "state". Produces a written note. */
export const ABSENCE_USER_JOURNEY_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_USER_JOURNEY_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: USER_JOURNEY_CHECK_BEGINNER_OVERRIDE },
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Beyond the happy path, name one missing state: what shows when there's no data?", "Just one missing state past the happy path — what shows when there's no data (the empty state)?"),
    2: form("Walk the main states: first-use, empty, and error — and note which aren't handled yet.", "Step through the main states — first-use, empty, and error — and note which aren't handled yet."),
    3: form("Jeff Patton User Story Mapping: once a basic happy path is in place, consider edge cases, alternatives, and exceptions. Before building more — answer: (1) what does the user see the first time they encounter this feature? (2) what happens when there's no data — the empty state? (3) what happens when something goes wrong — the error state? Each is a must-handle state.", "Answer, before building more: what the user sees the first time, what shows when there's no data (empty state), and what happens when something goes wrong (error state) — each a must-handle state."),
    4: form("Map the journey state by state: first-use, empty, loading, error, and success — for each, what the user sees and what's still unhandled.", "Go through the journey state by state — first-use, empty, loading, error, and success — and for each, what the user sees and what's still unhandled."),
    5: form("Write a states note that maps every state in the journey — first-use, empty, loading, error, success — what the user sees in each, and the must-handle gaps left to close.", "Capture a states note mapping every state in the journey — first-use, empty, loading, error, success — what the user sees in each, and the must-handle gaps left to close."),
  },
};

/** ABSENCE_TECHNICAL_SPIKE_TREATMENT — keep spike code out of the real build, keyword "spike". Behavioural rule. */
export const ABSENCE_TECHNICAL_SPIKE_TREATMENT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_TECHNICAL_SPIKE_TREATMENT', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: TECHNICAL_SPIKE_TREATMENT_BEGINNER_OVERRIDE },
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Name what this is: a spike to learn something, or real code to keep?", "Just name what this is — a spike to learn something, or real code to keep?"),
    2: form("Label the spike code as throwaway, and don't let it drift into the real codebase unrewritten.", "Mark the spike code throwaway, and don't let it drift into the real codebase unrewritten."),
    3: form("XP spike solution principle (Kent Beck / James Shore): 'Never copy spike code into production code. Even if it is exactly what you need, rewrite it using TDD so that it meets production standards.' The purpose of exploratory code is knowledge, not shipping. Name what's being done: spike (to learn) or production (to ship)?", "Name what's being done — spike (to learn) or production (to ship) — and never copy spike code into production; rewrite it with tests once it's taught you the approach."),
    4: form("Treat the spike as knowledge, not shippable code: capture what it taught, then rewrite the real version cleanly with tests rather than promoting the spike as-is.", "Keep the spike as knowledge, not shippable code — capture what it taught, then rewrite the real version cleanly with tests rather than promoting the spike as-is."),
    5: form("Make it a standing rule: spike code is for learning only — never copy it into the real codebase; once it has taught you the approach, rewrite it properly with tests.", "Hold it as a standing rule — spike code is for learning only, never copied into the real codebase; once it's taught you the approach, rewrite it properly with tests."),
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
    1: form("Before adding this dependency, ask: what specific problem does it solve that I can't easily solve without it?", "Just name the specific problem this dependency solves that you can't easily solve without it, before adding it."),
    2: form("Check the dependency before adding it: the specific need, whether it's maintained, and whether existing tools already cover it.", "Weigh the dependency before adding it — the specific need, whether it's maintained, and whether existing tools already cover it."),
    3: form("Dependency management principle: 'Dependencies are not free and extract an ongoing maintenance cost.' Every library added for interest rather than specific need becomes code you did not write but have localized responsibility for. Before adding this — what specific problem does it solve that you can't solve without it?", "Before adding this, ask what specific problem it solves that you can't solve without it — every interest-driven library becomes code you didn't write but must maintain."),
    4: form("Weigh the dependency honestly: the specific problem it solves, the maintenance cost it adds, and the lighter alternative — and keep it only if the need clearly beats the cost.", "Judge the dependency honestly — the specific problem it solves, the maintenance cost it adds, and the lighter alternative — and keep it only if the need clearly beats the cost."),
    5: form("Make justify-before-adding the standing gate: every dependency must earn its place against a specific need and its ongoing maintenance cost before it goes in — interest alone isn't enough.", "Hold justify-before-adding as the standing gate — every dependency must earn its place against a specific need and its ongoing maintenance cost before it goes in; interest alone isn't enough."),
  },
};

/** ABSENCE_RESTART_IMPULSE_CHECK — diagnose before restarting from scratch, keyword "restart". Produces a written note. */
export const ABSENCE_RESTART_IMPULSE_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_RESTART_IMPULSE_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: RESTART_IMPULSE_CHECK_BEGINNER_OVERRIDE },
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before restarting from scratch, name the one thing that actually went wrong.", "Just the one thing that actually went wrong — name it before restarting from scratch."),
    2: form("Pause the restart: list what's actually broken and whether a fix is smaller than a rewrite.", "Hold off the restart — list what's actually broken and whether a fix is smaller than a rewrite."),
    3: form("Joel Spolsky: 'When you start from scratch there is absolutely no reason to believe that you are going to do a better job than you did the first time. Each fixed bug took weeks or years of real-world usage to be discovered — when you throw away code, all the knowledge that went into it is lost.' Before restarting: what specifically went wrong and why?", "Before restarting, say what specifically went wrong and why — throwing away code loses the bug-knowledge each fix took weeks or years of real use to find."),
    4: form("Diagnose before restarting: what specifically broke, why, and what hard-won fixes already live in this code — then decide fix-versus-restart on evidence, not impulse.", "Work out before restarting — what specifically broke, why, and what hard-won fixes already live in this code — then decide fix-versus-restart on evidence, not impulse."),
    5: form("Write a root-cause note before any restart: what went wrong and why, the fixes already baked into the current code, and the evidence for fixing versus rewriting — so a restart is a decision, not an impulse.", "Capture a root-cause note before any restart — what went wrong and why, the fixes already baked into the current code, and the evidence for fixing versus rewriting — so a restart is a decision, not an impulse."),
  },
};

/** ABSENCE_CREATIVE_VS_CORE_RATIO — keep effort weighted to the core, keyword "creative". Produces a written note. */
export const ABSENCE_CREATIVE_VS_CORE_RATIO_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_CREATIVE_VS_CORE_RATIO', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: CREATIVE_VS_CORE_RATIO_BEGINNER_OVERRIDE },
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Quick gut-check: is more effort going to creative extras than to the core product right now?", "Just a rough sense of whether creative extras are outweighing the core right now — no exact count needed yet."),
    2: form("Eyeball the split: roughly how much of this session went to creative extras versus core function?", "Estimate the split by feel — roughly what share of the session went to creative extras versus core — not a precise tally yet."),
    3: form("Value-driven development: 'features that generate the maximum value for the users without creating the maximum cost.' Before the next creative or aesthetic feature — look at this session: what proportion of prompts went to core product functionality vs. creative/extra features? If more than 30-40% is creative, the core is under-served.", "Compare, for this session, the share of prompts spent on core product function versus creative extras — if creative runs past 30-40%, treat the core as under-served and rebalance."),
    4: form("Tally the ratio honestly: count the prompts spent on core product function versus creative or aesthetic extras, and rebalance toward core if the extras are winning.", "Base the tally on actual prompt counts, not impression — core function versus creative extras — and call it balanced only once core is clearly ahead."),
    5: form("Write a quick ratio note: core-function effort versus creative effort this session, where it's out of balance, and the rebalance plan — so creative work supports the core instead of outweighing it.", "Capture a short ratio note — core-function effort versus creative effort this session, where it's out of balance, and the rebalance plan — so creative work stays in support of the core, not ahead of it."),
  },
};

// ── BEGINNER-anchored signals (9) ──────────────────────────────────────────────

/** ABSENCE_ERROR_UNDERSTANDING — read and explain the error first, keyword "error". Behavioural habit. */
export const ABSENCE_ERROR_UNDERSTANDING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_ERROR_UNDERSTANDING', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before asking me to fix this error, read the error message once and tell me what it says.", "Just put what the error message reports into plain words first — understand it before any fix, don't guess at it."),
    2: form("Read the error message, then tell me what you think went wrong and where.", "Take one read of the error, then give a first guess at what went wrong and where — the cause, not just the text."),
    3: form("1. Before asking to fix this error — read the error message carefully.\n2. Share with me: what do you think it's saying went wrong?\n3. Then tell me: does your explanation match where the problem is in the code?", "Trace the error to what it actually reports, say that back, then confirm it matches where the problem sits in the code — so the fix targets the cause, not a symptom."),
    4: form("Read the whole error, not just the last line: the message, the exact file and line it points to, and what changed just before it appeared — then name which of those is the actual cause.", "Take the whole error — message, the file and line it points to, and what changed just before it appeared — and name which of those is the real cause, not just the last line."),
    5: form("Make read-the-error-first a habit: every time, read the error message and explain it before any fix — so fixes target the real cause, not a guess.", "Hold read-the-error-first as a standing habit — every error gets read and explained before any fix, so fixes land on the real cause instead of a guess."),
  },
};

/** ABSENCE_REQUIREMENT_CLARITY — describe what working looks like first, keyword "work". Produces a written note. */
export const ABSENCE_REQUIREMENT_CLARITY_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_REQUIREMENT_CLARITY', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before I build this, tell me in one line what it should do when it's working.", "Just one line on what working looks like before building — a target to aim at, not the full spec yet."),
    2: form("Tell me what it should do, what working looks like, and one thing it should not do.", "Name the goal, what a working result looks like, and one thing it must not do — enough to build against, no more."),
    3: form("1. Before I build this — tell me specifically what you want it to do.\n2. Share with me: what does it look like when it's working correctly?\n3. Then tell me: what should NOT happen — is there anything it should avoid doing?", "Pin down what it should do, what working correctly looks like, and what must not happen — so building has a target instead of a guess."),
    4: form("Pin the target with an example: what it does, what 'working' looks like shown as one concrete input and the result it should give, and what it must avoid — so done is checkable, not a feeling.", "Anchor the target to one concrete example — the input and the working result it should give — plus what it must avoid, so done is checkable, not a feeling."),
    5: form("Write a short requirements note: what it should do, what 'working' looks like in concrete terms, and what it must avoid — the target we build and check against.", "Capture a short requirements note — what it does, what working looks like in concrete terms, and what it must avoid — the target the build is checked against."),
  },
};

/** ABSENCE_COPY_PASTE_AWARENESS — read generated code before using it, keyword "read". Behavioural habit. */
export const ABSENCE_COPY_PASTE_AWARENESS_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_COPY_PASTE_AWARENESS', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before adding the generated code, read through it once.", "Just enough of a read to know what the generated code does before adding it — not a full audit yet."),
    2: form("Read the generated code and tell me, in plain words, what the main parts do.", "Go through the generated code once and put its main parts in plain words — so nothing goes in unexamined; a read, not a skim."),
    3: form("1. Before adding the generated code to your project — read through it.\n2. Share with me: what does each part do in plain words?\n3. If there's a part you're not sure about, point it out and we'll go through it together before it goes in.", "Walk the generated code part by part, say what each does in plain words, and flag anything you're unsure of to resolve before it goes in — using code you can't explain builds debugging debt."),
    4: form("Before it goes in, read every part and actively check the one you're least sure of — confirm it does what you think by reading it closely or running it — and only then keep any of it.", "Give every part a real read before it goes in, and actively test the one you're least sure of — confirm it by reading closely or running it — keeping only what you can vouch for."),
    5: form("Make read-before-use the rule: never add generated code you can't explain — read it, understand each part, and only then keep it.", "Hold read-before-use as the rule — never keep generated code you can't explain; read it, understand each part, then keep it."),
  },
};

/** ABSENCE_DEBUGGING_OBSERVATION — observe before fixing, keyword "bug". Behavioural habit. */
export const ABSENCE_DEBUGGING_OBSERVATION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DEBUGGING_OBSERVATION', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before I look at the bug, tell me what actually happened.", "Just what actually happened with the bug, in plain terms, before any fix — the symptom first, not a guess at the cause."),
    2: form("Describe the bug: what you expected, what happened instead, and any error shown.", "Give the bug's expected-versus-actual and any error shown — the observation a fix can start from."),
    3: form("1. Before I look at the bug — describe what happened.\n2. Share with me: what did you expect to happen, and what actually happened instead?\n3. Then tell me: is there an error message, and if so, what does it say?", "Set down what you expected, what happened instead, and any error message for the bug — fixing without that observation is guessing."),
    4: form("Pin the bug down: the exact steps that trigger it, what you expected versus what happened, and the precise error or wrong output — the facts a fix can target.", "Nail the bug to facts — the exact steps that trigger it, expected versus actual, and the precise error or wrong output — so the fix has something concrete to target."),
    5: form("Make observe-before-fixing the habit: every bug gets described — steps, expected, actual, error — before any fix, so the fix targets the real behaviour.", "Hold observe-before-fixing as the habit — every bug gets its steps, expected, actual, and error written down before any fix, so the fix targets real behaviour."),
  },
};

/** ABSENCE_LEARNING_CONSOLIDATION — recap the session's learning, keyword "learn". Produces a written note. */
export const ABSENCE_LEARNING_CONSOLIDATION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_LEARNING_CONSOLIDATION', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before we wrap up, tell me one thing you learned this session.", "Just one thing learned this session, named before wrapping up — a single takeaway, not a full recap."),
    2: form("Recap what you learned: the main thing you understand now, and anything still unclear.", "Pull together the main thing learned and name whatever's still unclear — the session's takeaway plus its open gaps."),
    3: form("1. We've covered a lot in this session — take a moment and think about what you actually learned.\n2. Share with me: what's the most important thing you now understand that you didn't before?\n3. Then tell me: is there anything we covered that still feels unclear or confusing?", "Name the most important thing learned this session that you didn't understand before, and flag anything still confusing — so the learning consolidates instead of fading."),
    4: form("Consolidate the learning: the key things you now understand, how they connect, and the specific parts still fuzzy enough to revisit next time.", "Connect the learning — the key things now understood, how they fit together, and the parts still fuzzy enough to revisit next time — not just a list of topics."),
    5: form("Write a short learning note: what you understood this session, how the pieces fit, and what to revisit — so the learning sticks instead of fading.", "Capture a short learning note — what was understood this session, how the pieces fit, and what to revisit — so it sticks instead of fading."),
  },
};

/** ABSENCE_SIMPLE_SOLUTION_FIRST — reach for the simplest solution first, keyword "simpl". Behavioural habit. */
export const ABSENCE_SIMPLE_SOLUTION_FIRST_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SIMPLE_SOLUTION_FIRST', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before building something complex, ask: is there a simpler way to get the same result?", "Just check for a simpler way to the same result before reaching for something complex — one honest look, not a redesign."),
    2: form("Describe what you're trying to do in plain terms, and let's find the simplest version that works first.", "State the goal plainly, then try the simplest version that works before anything heavier — prove the easy path can't carry it first."),
    3: form("1. Before building something complex — ask: is there a simpler way to get the same result? The simplest solution that works is almost always the right one to start with.\n2. Share what you're trying to do in plain terms. Let's find the simple version first.", "Reach for the simplest thing that works before anything complex, and escalate only if it genuinely can't carry the case — the simple solution is almost always the right start."),
    4: form("Start from the simplest thing that could work: write it, see if it's enough, and add complexity only where the simple version actually falls short.", "Build the simplest thing that could work first, see if it's enough, and add complexity only where that version actually falls short — not preemptively."),
    5: form("Make simple-first the habit: always reach for the simplest solution that works and add complexity only when a real need proves it — so code stays easy to change.", "Hold simple-first as the habit — always reach for the simplest working solution and add complexity only when a real need proves it, so the code stays easy to change."),
  },
};

/** ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING — one ask per message, keyword "message". Behavioural habit. */
export const ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Send just one thing in this message instead of several at once.", "Just one ask in this message instead of several — a single focus keeps the result checkable."),
    2: form("Pick the most important thing and put only that in this message; we'll do the next one after.", "Put only the most important thing in this message and defer the rest — one item, checked, before the next."),
    3: form("1. When you send several things at once, the results get messy and hard to check. Try focusing on just one thing per message.\n2. What's the most important thing to do right now? Start with that — then we'll move to the next.", "Keep each message to a single ask rather than several at once — bundled asks get messy and hard to verify; take the most important first and move on once it's done."),
    4: form("If a task has several parts, break it into a short numbered list and send one part per message, checking each result before sending the next.", "For a multi-part task, split it into a short numbered list and send one part per message, checking each result before the next goes out."),
    5: form("Make one-ask-per-message the habit: send a single focused request each time and move to the next only once it's done — so nothing gets muddled or skipped.", "Hold one-ask-per-message as the habit — a single focused request each time, moving on only once it's done, so nothing gets muddled or skipped."),
  },
};

/** ABSENCE_ROLLBACK_AWARENESS — commit before a risky change, keyword "commit". Behavioural habit. */
export const ABSENCE_ROLLBACK_AWARENESS_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_ROLLBACK_AWARENESS', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Before a big change, do a git commit so there's a snapshot to go back to.", "Just a git commit before the big change — a snapshot to return to if it breaks, nothing more involved."),
    2: form("Commit the working state first (git add . then git commit), then make the change.", "Snapshot the working state with a commit first, then make the change — so there's a clean point to return to."),
    3: form("1. Before making a big change to your code — do a git commit first. This saves a snapshot you can always go back to if something breaks.\n2. Not sure how? Try: git add . then git commit -m 'working before change'. Then make your change safely.", "Save the current working state as a git commit before the big change — without that snapshot a broken change leaves no return path."),
    4: form("Commit at safe points: a working commit before each risky change, with a clear message, so any step can be rolled back without losing the rest.", "Put a clear working commit before each risky change, with a descriptive message, so any single step can be rolled back without losing the rest."),
    5: form("Make commit-before-change the habit: save a working commit before every significant change, so there's always a clean point to roll back to.", "Hold commit-before-change as the habit — a working commit before every significant change, so there's always a clean point to roll back to."),
  },
};

/** ABSENCE_BUILD_VS_UNDERSTAND_RATIO — keep understanding level with the build, keyword "understand". Behavioural habit. */
export const ABSENCE_BUILD_VS_UNDERSTAND_RATIO_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_BUILD_VS_UNDERSTAND_RATIO', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VIBE_PARAM_AXES,
  levelForms: {
    1: form("Pause and check your understanding: in your own words, what does the code we just added do?", "Just put the just-added code in your own words to confirm you understand it — a quick check before moving on, not a full walkthrough."),
    2: form("Explain the main pieces we built and flag anything you don't fully understand.", "Talk through the main pieces built and flag whatever you don't fully understand — surface the gaps, not only the parts you know."),
    3: form("1. We've added a lot of code — can you explain in your own words what it does? Even a rough description is fine.\n2. Understanding what you've built is as important as building it. Code you don't understand becomes a problem you can't fix later.", "Put the added code in your own words and name what you can't yet — understanding it matters as much as building it, since code you can't explain becomes a problem you can't fix."),
    4: form("Check understanding across the build: walk each main part, explain what it does and why, and mark the parts you couldn't explain to learn before building more.", "Go part by part across the build — explain what each does and why, and mark whatever you couldn't explain to understand before building further."),
    5: form("Make understand-as-you-build the habit: keep the code you can explain level with the code you've added, so you never rely on a part you don't understand.", "Hold understand-as-you-build as the habit — keep the code you can explain level with the code you've added, so you never lean on a part you don't understand."),
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
