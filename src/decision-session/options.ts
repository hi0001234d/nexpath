import type { Stage, UserProfile } from '../classifier/types.js';
import { STAGES } from '../classifier/types.js';
import type { FlagType } from '../classifier/Stage2Trigger.js';
import {
  ABSENCE_CONTENT_BEGINNER,
  TRANSITION_CONTENT_BEGINNER,
  TASK_REVIEW_BEGINNER,
} from './options-beginner.js';

/**
 * Per-stage decision session content (from spec-driven-stages-research.md Part 3).
 *
 * Each entry has:
 *   - question     : bold-white question line shown in the header pair
 *   - pinchFallback: static label used when the pinch-word API call fails/times-out
 *   - L1           : Level 1 options (full, pre-filled agent prompts)
 *   - L2           : Level 2 options (easier)
 *   - L3           : Level 3 options (minimum viable step)
 *
 * Every option IS a pre-filled prompt ready to send to the agent — user hits Enter.
 */

import type { WhyHelpVariants } from './why-help.js';

/**
 * Per-option entry — option text plus an optional desc-base template.
 *
 * `option`   is the prompt text the user sees and sends to the agent.
 * `descBase` is the R3 desc-base template attached to that option; it
 *            contains substitution placeholders that the runtime resolves
 *            before the option is rendered. Empty string means no
 *            desc-base for this option yet (populated by later content
 *            authoring passes).
 */
export interface OptionEntry {
  option:   string;
  descBase: string;
}

export interface DecisionContent {
  question:      string;
  pinchFallback: string;
  L1: OptionEntry[];
  L2: OptionEntry[];
  L3: OptionEntry[];
  /** Optional popup why-help block keyed by register. Populated per signal class. */
  whyHelp?:      WhyHelpVariants;
  /**
   * Per-set opt-out flag for the desc-base rendering + substitution pipeline.
   * When `false`, the runtime skips desc-base processing for this set's
   * options regardless of whether `descBase` content is present. Defaults
   * to `true` (desc-bases active) when omitted.
   */
  descBaseEnabled?: boolean;
  /**
   * Per-set marker for the deferred L2 safeguard pass. When `true`, this
   * set is in scope for the L2 sensitive-action safeguard authoring pass
   * — author inlines a confirmation-seek sentence into the relevant
   * options' desc-base content during the L2 pass. Sets without this
   * marker are out of scope. Defaults to `undefined` / `false` when
   * omitted.
   */
  l2SafeguardRequired?: boolean;
  /**
   * Per-set total-length budget that bounds the FULL desc-base after R5
   * runtime substitution (open bookend + gap-framing + direction-body +
   * substituted R5 content + close bookend). Three tiers:
   *
   *   LIGHT   — up to 2 visible lines, up to 2 expanded lines,  ≤  200 chars total
   *   MEDIUM  — up to 2 visible lines, up to 4 expanded lines,  ≤  400 chars total
   *   HEAVY   — up to 2 visible lines, up to 10 expanded lines, ≤ 1000 chars total
   *
   * Omitted = `MEDIUM` at runtime (the default tier).
   *
   * When the post-substitution total exceeds the set's tier, the
   * injection module falls back to the static D-fallback string for that
   * option — the fallback string is shorter and stays inside the budget.
   */
  lengthBudget?: 'LIGHT' | 'MEDIUM' | 'HEAVY';
}

// ── Per-transition content ─────────────────────────────────────────────────────

/** Transition 1: Idea → PRD */
const IDEA_TO_PRD: DecisionContent = {
  question:      'Before building — is the plan written?',
  pinchFallback: 'Before coding.',
  L1: [
    {
      option: 'Write a PRD for this project: define the problem, target user, core features with acceptance criteria, what is explicitly out of scope, and any technical constraints.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Last 4 prompts: project goal described, users discussed. No PRD or spec written."}
The idea has been in open-ended exploration; pinning it down is the next step before architecture decisions get made ad-hoc.
Produce the spec artifact itself — the document, with the five named sections. Don't branch into architecture or task work yet.
Treat every section as required: missing pieces compound later.
{R4_CLOSE}`,
    },
    {
      option: 'Define the problem and success criteria first: who is this for, what problem does it solve, and how will we know when it\'s done?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Goal mentioned across recent prompts but problem statement and success criteria not explicit."}
Same idea→PRD moment, narrower scope: lock the problem statement and how to recognise done.
Answer the three named questions directly. Don't expand into a full PRD.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm the idea before writing spec: review what I\'ve described so far and tell me — is the problem statement clear enough to write a PRD? What\'s missing or ambiguous?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Idea described in fragments over recent prompts. Clarity of the problem statement not yet assessed."}
Before the spec, the idea itself needs a clarity check rather than the spec itself.
List ambiguities and gaps. Don't write a PRD yet.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Write a one-paragraph scope statement: what this project does, what it does not do, and the single most important success criterion.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea-phase work in the visible window, no scope written."}
A one-paragraph scope is the smaller alternative to a full PRD at this transition.
Produce the paragraph only — three named pieces, nothing more.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm the idea: given what I\'ve described, what are the top 3 things that should be clarified before I start building?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea described over recent prompts; clarifying questions not surfaced."}
At this idea→PRD moment, the lighter alternative is a top-3 clarification list rather than a full clarity audit.
List three. Don't expand further.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'List the 3 most important acceptance criteria for this project so we can check them before release.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea-phase. No acceptance criteria listed."}
Minimum next step at this transition: three acceptance criteria — nothing else.
{R4_CLOSE}`,
    },
  ],
};

/** Transition 2: PRD → Architecture */
const PRD_TO_ARCHITECTURE: DecisionContent = {
  question:      'Spec ready — is the architecture decided?',
  pinchFallback: 'Design first.',
  L1: [
    {
      option: 'Design the system architecture for this project: list the main components, how they interact, the data model, API contracts (if any), and the tech stack with rationale for key choices.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Last 5 prompts include the PRD-level scope, problem definition, and acceptance criteria. Architecture not yet sketched."}
The spec is in place; this is the moment to translate it into architecture before any code gets written.
Produce the architecture artifact with the five named sections. Tech stack choices require rationale.
Don't begin code or tasks yet.
{R4_CLOSE}`,
    },
    {
      option: 'Write a technical design doc: system components, data flows, key architectural decisions and why, and any constraints or risks I should know before coding starts.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "PRD-level work present; technical design doc absent in the visible window."}
Same PRD→architecture moment; produce the design doc — a sibling artifact framed as decisions + risks.
List decisions with rationale and risks explicitly. Don't begin code yet.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm the spec before architecture: review the PRD/spec we have and tell me — is it precise enough that you could implement it without asking clarifying questions? List every ambiguity or gap.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Spec drafted across recent prompts. Precision/ambiguity audit not yet performed."}
Before architecture, the spec itself needs a precision check.
List every ambiguity or gap. Don't architect anything yet.
{R4_CLOSE}`,
    },
    {
      option: 'Review the spec for architectural blind spots: based on the requirements, what architectural decisions will have the biggest impact on maintainability, performance, or security — and what\'s the recommended approach for each?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Spec exists; impact-axis analysis (maintainability, performance, security) not yet done."}
PRD→architecture moment, impact-axis focused — before any component layout.
Group decisions by impact axis with recommended approaches. Don't sketch the architecture yet.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Sketch the main components and data flow: what are the key parts of this system and how does data move between them?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Spec present, no architecture artifact visible."}
Lighter alternative at this transition: a sketch instead of a full architecture brief.
Produce a sketch only — components + data flow.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm the spec: given the current PRD, what are the top 3 architectural decisions I need to make before starting to code?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Spec present; key decisions not yet enumerated."}
PRD→architecture moment, lighter scope: top-3 decisions to make before code.
List three. Don't expand into full architecture.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Cross-confirm the plan: what is the single biggest architectural risk in what I\'ve described, and what\'s the simplest way to address it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Spec present; risk surface not assessed."}
Minimum next step: one risk + one simplest mitigation.
{R4_CLOSE}`,
    },
  ],
};

/** Transition 3: Architecture → Task Breakdown */
const ARCHITECTURE_TO_TASKS: DecisionContent = {
  question:      'Architecture done — is the task list ordered?',
  pinchFallback: 'Break it down.',
  L1: [
    {
      option: 'Break the implementation into an ordered task list: each task should be completable in one coding session, delivered as a vertical slice where possible, and have a clear definition of done.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Architecture sketched across recent prompts. No task list yet."}
Architecture is laid out; translate it into ordered tasks before implementation begins.
Produce the task list with the three named constraints (session-sized, vertical slice when possible, clear DoD). Don't begin coding yet.
{R4_CLOSE}`,
    },
    {
      option: 'Create a task list file for this implementation phase: list tasks in order, with a one-line definition of done for each, so I can track progress and you have context for each session.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Architecture present; no persisted task list to share between sessions."}
Same arch→tasks moment; emphasis on persistence — task list lives in a file for cross-session continuity.
Create the file in the repo with task list + one-line DoD per task.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm the architecture before coding: review the architecture we\'ve designed and tell me — does it fully cover all the requirements in the spec? Are there any missing components, undefined data flows, or unresolved technical decisions?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Architecture sketched; coverage vs spec not yet audited."}
Before task breakdown, the architecture itself needs a coverage check against the spec.
List missing components, undefined data flows, unresolved decisions. Don't break down tasks yet.
{R4_CLOSE}`,
    },
    {
      option: 'Identify the first vertical slice: what is the thinnest end-to-end feature I can build first to validate the architecture and get something working?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Architecture present, first deliverable not yet identified."}
At this arch→tasks moment, focus is the thinnest end-to-end thing that validates the architecture.
Name the slice and what it validates. Don't break down everything else yet.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'List the top 5 implementation steps in order, with a one-line description of what done looks like for each.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Architecture present; tasks not enumerated."}
Lighter task-breakdown: top 5 steps in order with DoD.
List five only.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm the architecture: given the spec and architecture, what are the top 3 things that could go wrong during implementation and how should I handle them?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Architecture present; risks not enumerated."}
Arch→tasks moment, risk-focused: top 3 implementation risks + how to handle each.
List three.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Cross-confirm the first step: what should I build first and why — what validates the core assumption of this project fastest?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Architecture present; first build not chosen."}
Minimum next step: one first build that validates the core assumption fastest.
{R4_CLOSE}`,
    },
  ],
};

/** Transition 4: task_breakdown → implementation (per-task review before coding starts) */
const TASK_REVIEW: DecisionContent = {
  question:      'Task done — reviewed and tested?',
  pinchFallback: 'Quick check.',
  L1: [
    {
      option: 'Review what was just built for this task: does the implementation match the spec and acceptance criteria? List any discrepancies, missing logic, hallucinated code, or potential issues before I mark this done.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Last 3 prompts: implementation of the current task. No review or test step in between."}
A task just finished; this is the gap where a review catches misses before the next task starts.
Audit against spec + acceptance criteria. List discrepancies, missing logic, hallucinated code. Don't rewrite anything.
{R4_CLOSE}`,
    },
    {
      option: 'Run the tests for what was just built and report: which tests pass, which fail, and what needs to be fixed before moving to the next task.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Last 3 prompts: implementation of the current task. Tests not yet run on this code."}
Between-task moment; tests before the next task starts.
Run them and report. Don't fix failures here — the report tells me what's broken.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm this implementation against the spec: does what was just built fully satisfy the requirements for this task? What is missing or different from what the spec required?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Task implementation in recent prompts; spec-compliance check not yet done."}
Between-task moment, spec-focused: confirm this task's output against what the spec required.
List gaps. Don't fix them here.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Quick review of what was just built: does it do what the task asked for? Any obvious issues?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Task just implemented; quick check not yet done."}
Lighter between-task review: surface-level only.
Spot obvious issues. Skip the deeper audit.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm this task: does this implementation match the task\'s definition of done?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Task implemented; DoD not yet checked."}
Between-task moment, DoD-focused.
Yes/no per DoD bullet. Don't expand.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in the code just generated that looks wrong or incomplete before I move on?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Code just generated for this task."}
Minimum next step: one obvious issue check before moving on.
{R4_CLOSE}`,
    },
  ],
};

/** TASK_REVIEW_CASUAL — casual-register variant for cool_geek and pro_geek_soul profiles */
const TASK_REVIEW_CASUAL: DecisionContent = {
  question:      'Task done — quick check before moving on?',
  pinchFallback: 'Quick check.',
  L1: [
    {
      option: 'Quick look at what was just built — does it do what the task asked for? Anything off, anything missing, any weird generated code before I say it\'s done?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines first-person — "Just finished the current task — my last 3 prompts were implementation, no review step in between."}
Just finished a task; this is the moment to check before the next one starts.
Light scan against what the task asked for. Don't rewrite, just flag what's off.
{R4_CLOSE}`,
    },
    {
      option: 'Run the tests for what was just built and report: which pass, which fail, and what needs fixing before moving on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines first-person — "Task just built, my last few prompts have been code — haven't run the tests."}
Between-task moment; tests before moving on.
Run them and tell me what's failing. Don't fix yet.
{R4_CLOSE}`,
    },
    {
      option: 'Does what was just built actually do what was asked? What\'s off or missing compared to what was planned?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines first-person — "Just finished the task in the last couple prompts — haven't checked it against the plan."}
Between-task moment, plan-focused: did the built thing match what I asked for?
Tell me what's off or missing vs the plan.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Quick look at what was just built: does it do what the task asked for? Any obvious problems?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Task just built, no quick look yet."}
Lighter between-task check: surface stuff only.
{R4_CLOSE}`,
    },
    {
      option: 'Does what was just built match what the task asked for — definition of done covered?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Task just built; DoD not yet checked."}
Between-task moment, DoD-focused.
Yes/no per DoD piece.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Anything in what was just built that looks off or incomplete before moving on?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Task just built."}
Minimum next step: one off-looking thing before I move on.
{R4_CLOSE}`,
    },
  ],
};

/** Transition 5: Implementation → Review/Testing */
const IMPLEMENTATION_TO_REVIEW: DecisionContent = {
  question:      'Phase done — full review before moving on?',
  pinchFallback: 'Phase done?',
  L1: [
    {
      option: 'Run the full test suite for this phase: unit tests, integration tests, and any regression tests. Report results, failures, and what needs to be fixed.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Last 5+ prompts: implementation of phase features. Full suite not run since phase started."}
Implementation for this phase is complete; this is the gate where review and testing happen before the next phase starts.
Run unit + integration + regression suites. Report pass/fail and what needs fixing. Don't fix yet.
{R4_CLOSE}`,
    },
    {
      option: 'Check the spec acceptance criteria against what was built: go through each acceptance criterion in the PRD and tell me whether it is fully satisfied, partially satisfied, or not yet implemented.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Phase implementation complete; acceptance-criteria roll-up not yet performed."}
Phase-end gate, audit-focused — each acceptance criterion individually.
Per criterion: full / partial / not implemented. Don't fix gaps here.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm the full implementation against the spec: review everything built in this phase and identify any gaps between what was implemented and what the spec required — include security, error handling, and edge cases.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Phase implementation complete; spec coverage including security/error/edge not yet audited."}
Phase-end gate, comprehensive spec audit.
List gaps across functional + security + error handling + edge cases. Don't fix.
{R4_CLOSE}`,
    },
    {
      option: 'Review for regression: does anything that was working before this phase now behave differently or break?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Phase introduced changes; regression on previously-working behaviour not yet checked."}
Phase-end gate, regression-focused: did this phase break anything that worked before?
List regressions. Don't fix yet.
{R4_CLOSE}`,
    },
    // v0.3.0 — acceptance/behaviour testing gap
    {
      option: 'Write a manual acceptance test script for what was just built: cover the spec scenarios — happy path, boundary conditions, and error states automated tests would miss — and document the expected outcome at each step.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Phase implementation present; no manual acceptance script."}
Phase-end gate, manual-testing focused: a script for scenarios automated tests miss.
Cover happy path, boundary, error. Document expected outcomes per step.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Run tests for the new code in this phase and report any failures.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "New code in phase; tests not yet run."}
Lighter phase-end check: new-code tests only.
Run them and report failures.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm the critical path: do the 3 most important acceptance criteria from the spec pass end-to-end?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Phase complete; critical-path validation not done."}
Lighter spec check at phase end: top-3 criteria only.
Pass/fail per criterion.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Cross-confirm before I move on: is there anything obviously broken or missing in what was just built?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Phase complete."}
Minimum next step: any obvious break or missing piece before the next phase.
{R4_CLOSE}`,
    },
  ],
};

/** Transition 6: Review/Testing → Release */
const REVIEW_TO_RELEASE: DecisionContent = {
  question:      'Ready to ship — final checks done?',
  pinchFallback: 'Almost there.',
  L1: [
    {
      option: 'Run all tests one final time before release: unit, integration, and regression. Confirm everything passes or tell me what is still failing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Last few prompts: phase review complete. Final pre-release test pass not yet done."}
Review is complete; this is the final gate before shipping to production.
Run unit + integration + regression. Report pass/fail.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm release readiness: have all tests passed, are all spec acceptance criteria met, have security concerns been addressed, and is there a rollback plan ready if something fails in production?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Review complete; readiness roll-up across four named axes not yet performed."}
Final pre-release gate; audit the four readiness axes together.
Per axis: tests passed / criteria met / security addressed / rollback ready. State explicitly.
{R4_CLOSE}`,
    },
    {
      option: 'Review the new code for security issues before shipping: check for input validation gaps, authentication/authorization issues, hardcoded secrets, unhandled errors, and any other obvious vulnerabilities.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "New code in this phase; security review on the new surface not yet performed."}
Final pre-release gate, security-focused.
Audit input validation, auth, secrets, unhandled errors, obvious vulnerabilities. List findings. Don't fix.
{R4_CLOSE}`,
    },
    {
      option: 'Write a release checklist for this deployment: what needs to happen before, during, and after the release to ensure it goes smoothly and I can roll back if needed.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Pre-release stage; no release checklist authored yet."}
Final pre-release gate — produce the checklist artifact.
Cover before / during / after with rollback path.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Cross-confirm readiness: what are the top 3 risks in shipping this right now and how should I handle each?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Pre-release; ship-risk surface not enumerated."}
Lighter pre-release check: top-3 ship-risks + mitigation per risk.
{R4_CLOSE}`,
    },
    {
      option: 'Run the critical path tests only and confirm they pass.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Pre-release; critical-path tests not confirmed."}
Lighter pre-release test pass: critical-path subset only.
Run and report.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Cross-confirm one thing: is there anything that is likely to break in production that we haven\'t tested yet?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Pre-release."}
Minimum next step: one likely-production-break thing not yet tested.
{R4_CLOSE}`,
    },
  ],
};

/** Transition 7: Release → Feedback Loop */
const RELEASE_TO_FEEDBACK: DecisionContent = {
  question:      'Just shipped — is the feedback loop active?',
  pinchFallback: 'Watch it live.',
  L1: [
    {
      option: 'Verify the production monitoring setup for what was just built: confirm error tracking is active, alert thresholds are configured, and dashboards show live metrics — list what is collecting and what still needs to be set up.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Feature shipped; monitoring/alerts coverage on the new surface not audited."}
The feature just shipped to production; close the feedback loop before attention drifts.
Audit error tracking + alert thresholds + dashboards. List what's collecting and what's missing.
{R4_CLOSE}`,
    },
    {
      option: 'Set up the feedback loop for this feature: identify what signals will tell you it is working (analytics events, error rates, user reports), confirm what is already in place, and list what still needs to be added to close the loop.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Feature shipped; signal sources (analytics, errors, user reports) not yet enumerated."}
Post-ship moment; enumerate and gap-list the signals needed to know the feature works.
List present + missing signals. Don't add them yet.
{R4_CLOSE}`,
    },
    {
      option: 'Run smoke checks on what was just built: confirm the main user path works end-to-end in the live environment, check for unexpected errors in the logs, and report anything that looks wrong.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines — "Feature shipped; live-environment smoke check not yet performed."}
Post-ship moment, live-validation focused: exercise the main user path in the live environment.
Run smoke checks. Report unexpected errors.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What are the top 3 signals I should watch in the first 24 hours to know if this feature is behaving as expected in production?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature shipped; first-24h signals not chosen."}
Lighter post-ship check: top-3 signals to watch.
Name three.
{R4_CLOSE}`,
    },
    {
      option: 'What is the minimum feedback setup needed to know if this feature is landing well — and what is still missing from what is currently in place?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature shipped; minimum feedback baseline not defined."}
Lighter post-ship enumeration: minimum signals + what's missing.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there a signal in place that would tell you if this feature silently breaks in production — or would it fail without alerting anyone?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature shipped."}
Minimum next step: one signal that would catch silent failure.
{R4_CLOSE}`,
    },
  ],
};

/** Absence trigger: behaviour_testing — fires when implementation proceeds without manual acceptance testing */
const BEHAVIOUR_TESTING: DecisionContent = {
  question:      'Implementation done — user scenarios tested?',
  pinchFallback: 'User scenario?',
  L1: [
    {
      option: 'Write a manual test scenario for the main user journey: list each step a real user would take, what they would see, and what would confirm it is working correctly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Last several prompts: implementation work. No manual acceptance scenario written for the user-facing path."}
Manual acceptance testing hasn't been done; automated tests miss the user-facing scenarios.
Produce the scenario itself — a step-by-step user journey with confirmation criteria per step.
{R4_CLOSE}`,
    },
    {
      option: 'List the acceptance tests for this feature: describe 3 to 5 scenarios a real user would run through, from happy path to edge cases, and the expected outcome for each.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature implemented; acceptance-test scenarios not enumerated."}
Manual acceptance scenarios are missing; 3-5 scenarios across happy and edge cases form the floor.
List the scenarios with expected outcomes per case.
{R4_CLOSE}`,
    },
    {
      option: 'Identify the 3 most likely ways a real user could break this feature without triggering any automated tests — then tell me how to manually verify each one.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature implemented; user-break paths not enumerated."}
The break-paths automated tests don't catch haven't been mapped.
Identify the top 3 user-break paths and the manual verification for each.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Describe the happy path for the main use case: what does a user do, step by step, to successfully complete the core workflow?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature implemented; happy-path walkthrough not documented."}
The lighter alternative: just the happy path, step by step.
Walk through the core workflow.
{R4_CLOSE}`,
    },
    {
      option: 'What is the most important thing to verify manually before I call this feature done — and how do I check it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature implemented; manual-verify priority not chosen."}
Narrower scope: the single highest-value manual check.
Name it and the verification steps.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is one real user scenario I should manually test right now before moving on?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature implemented; no manual scenario tried."}
Minimum next step: one scenario to try manually.
{R4_CLOSE}`,
    },
  ],
};

/** BEHAVIOUR_TESTING_CASUAL — casual-register variant for cool_geek and pro_geek_soul profiles */
const BEHAVIOUR_TESTING_CASUAL: DecisionContent = {
  question:      'Implementation done — user scenarios tested?',
  pinchFallback: 'User scenario?',
  L1: [
    {
      option: 'Put yourself in a user\'s shoes and go through what was just built from start to finish — what\'s the main thing it does, does it actually work, and is anything confusing or broken along the way?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built this in the last few prompts but I haven't actually tried it as a user yet."}
I haven't manually used what was just built; automated tests don't cover the user-feel.
Run through it as a user from start to finish, flag anything confusing or broken.
{R4_CLOSE}`,
    },
    {
      option: 'Think of a few different ways someone might use this feature in real life — the obvious one and a couple of less obvious ones — and actually run through each to see what happens.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feature built; I've only checked the obvious flow."}
Different user paths haven't been tried; obvious ones plus a few less-obvious ones are what catches surprises.
Pick a few paths, run them, tell me what happens in each.
{R4_CLOSE}`,
    },
    {
      option: 'Think about what could go wrong for a real user in what was just built — try the stuff that automated tests wouldn\'t catch and tell me what you see.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feature built; haven't tried the things tests miss."}
The break paths between automated coverage and real users haven't been explored.
Try the stuff automated tests wouldn't catch and tell me what you see.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the simplest way someone would use this feature end to end — walk me through what they do and whether it actually works.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built; end-to-end user walk not done."}
Lighter: just the simplest end-to-end walk.
Walk me through it and tell me if it actually works.
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in what was just built that you haven\'t actually tried yourself yet — and what would "working" look like if you did?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built; untried-by-hand bits not identified."}
The bits that haven't been touched by hand yet are the risky ones.
Name them and define what "working" looks like.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s one specific thing that could break for a real user in this feature that hasn\'t been tried by hand yet?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built; not tried by hand."}
Minimum next step: one specific break-by-hand risk.
{R4_CLOSE}`,
    },
  ],
};

// ── Absence signal content sets ───────────────────────────────────────────────

/** Absence: test_creation — fires when implementation proceeds without writing tests */
const ABSENCE_TEST_CREATION: DecisionContent = {
  question:      'Code added — where are the tests?',
  pinchFallback: 'Tests missing.',
  L1: [
    {
      option: 'Write tests for what was just built: unit tests for each function added or modified, and at least one integration test that covers the main path through this feature.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: feature implementation. No test files added in the visible window."}
Tests haven't been written for what was just built; silent regressions become possible the next time anyone touches this code.
Produce the unit-test set + one integration test covering the main path.
{R4_CLOSE}`,
    },
    {
      option: 'Identify what was just built that has no test coverage and write tests for the top 3 riskiest parts — the logic most likely to break silently if changed.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation done; coverage gaps not enumerated."}
The test gap is present and the riskiest parts inside it haven't been ranked.
Rank the top 3 by silent-failure risk and write tests for those first.
{R4_CLOSE}`,
    },
    {
      option: 'Review what was just built for testability: is it structured so tests can be written without extensive mocking? Flag any parts that would be hard to test as-is.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation done; testability not assessed."}
Before tests can be written, the code's testability hasn't been checked.
Audit the structure; flag what needs a small refactor before tests can land cleanly.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Write at least one test for what was just built — the most critical path through this feature.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done; zero tests written."}
The lighter floor: one test on the most critical path.
Write that test.
{R4_CLOSE}`,
    },
    {
      option: 'What would break silently in what was just built if a future change introduced a bug? Write a test that catches that.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done; silent-failure path not identified."}
The highest-leverage test is the one catching the silent-failure mode.
Identify it and write the test.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Write one test for the most important behaviour in what was just built before moving on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done; zero tests."}
Minimum next step: one test for the most important behaviour.
{R4_CLOSE}`,
    },
  ],
};

/** Absence: regression_check — fires when changes are made without regression testing */
const ABSENCE_REGRESSION_CHECK: DecisionContent = {
  question:      'Changes made — regression verified?',
  pinchFallback: 'Regression check.',
  L1: [
    {
      option: 'Identify which existing tests cover the code paths changed in what was just built, run them, and flag any regressions — anything that was passing before this session that is now failing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: code changes touching multiple paths. Existing-test impact not assessed."}
Regression on existing functionality hasn't been verified; changes may have broken paths that were previously passing.
Identify the existing tests that cover the changed paths, run them, flag any new failures.
{R4_CLOSE}`,
    },
    {
      option: 'Check what was just built against the existing test suite: identify which existing tests cover the code paths that were modified, run them, and report any failures.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Code changes present; existing-suite run not done."}
The existing test suite hasn't been run against the changes.
Run the suite, report which tests fail and which touched the changed code.
{R4_CLOSE}`,
    },
    {
      option: 'Review what was just built for regression risk: what existing functionality could be affected by these changes, and how would you verify it still works correctly?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Code changes present; regression-risk surface not enumerated."}
The functions and paths that could break haven't been listed yet.
Enumerate at-risk functionality and the verification approach per item.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Run the tests for this project and report which ones fail — specifically any that touch code changed in this session.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Code changes present; suite not run."}
Lighter: just run the suite, report failures touching changed code.
{R4_CLOSE}`,
    },
    {
      option: 'What existing functionality is most likely to be affected by what was just built? Verify it still works.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Code changes present; highest-impact area not identified."}
Narrower: name the functionality most likely affected and verify it directly.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Run the existing tests for this project and report whether anything is now failing that wasn\'t before.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Code changes present."}
Minimum next step: run existing tests, report what's newly failing.
{R4_CLOSE}`,
    },
  ],
};

/** Absence: spec_acceptance_check — fires when implementation proceeds without checking against spec */
const ABSENCE_SPEC_ACCEPTANCE: DecisionContent = {
  question:      'Implementation done — spec checked?',
  pinchFallback: 'Check the spec.',
  L1: [
    {
      option: 'Review what was just built against the spec and acceptance criteria: go through each requirement and confirm whether it is fully implemented, partially implemented, or missing from what was just built.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: feature implementation. No spec-compliance audit performed."}
Compliance against the spec hasn't been audited for what was just built.
Per requirement: fully / partially / not implemented. Don't fix gaps in this pass.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm what was just built against the original requirements: does the implementation match what was specified? List any deviations, missing behaviour, or scope creep introduced.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature implemented; deviation/scope-creep check vs spec not done."}
The spec-compliance comparison hasn't been done.
List deviations, missing behaviour, scope creep. Don't fix yet.
{R4_CLOSE}`,
    },
    {
      option: 'Audit what was just built for spec compliance: check input validation, edge cases, and error handling against the acceptance criteria — flag anything that passes the happy path but fails under edge conditions.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature implemented; edge-case spec coverage not audited."}
The edge-case + error-handling audit against acceptance criteria hasn't been run.
Audit input validation, edge cases, error handling per criteria. List findings only.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Check what was just built against the spec: does it fully satisfy the acceptance criteria, or are there gaps?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature implemented; spec gap check not done."}
Lighter: does it satisfy the acceptance criteria, or are there gaps?
List gaps.
{R4_CLOSE}`,
    },
    {
      option: 'Does what was just built match what was specified? List any differences between the implementation and the original requirements.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature implemented; implementation-vs-spec diff not enumerated."}
Narrower: implementation vs spec diff — what differs.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that doesn\'t match the spec or acceptance criteria?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature implemented."}
Minimum next step: any spec or acceptance criterion not met.
{R4_CLOSE}`,
    },
  ],
};

/** Absence: cross_confirming — fires when implementation proceeds without cross-confirmation prompts */
const ABSENCE_CROSS_CONFIRMING: DecisionContent = {
  question:      'AI generated it — have you verified it?',
  pinchFallback: 'Verify the output.',
  L1: [
    {
      option: 'Review what was just built critically: identify any hallucinated functions or APIs, logic that looks plausible but is incorrect, edge cases not handled, and any code that was generated but not verified against the actual system it will run in.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: AI-generated implementation. No verification pass on the generated content."}
AI-generated code in recent prompts hasn't been verified.
Identify hallucinated functions/APIs, plausible-but-wrong logic, missed edge cases, unverified system assumptions.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm what was just built: does the generated code actually do what you expect, or does it contain plausible-sounding logic that is subtly wrong? Trace the main path through the code and verify each step.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "AI output present; execution-path verification not performed."}
The generated code's execution path hasn't been traced and verified.
Trace the main path; verify each step does what's expected.
{R4_CLOSE}`,
    },
    {
      option: 'Audit what was just built for AI generation artifacts: check for made-up function names, incorrect assumptions about the codebase, missing error handling that a human would have caught, and any logic that looks correct but hasn\'t been manually verified.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "AI output present; generation-artifact audit not done."}
Generation artifacts (hallucinated names, wrong assumptions, missing error handling) haven't been audited.
Audit for these specifically; list findings.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Review what was just built for correctness: is there anything that looks right at a glance but would fail when actually run or tested?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "AI output present; look-vs-actually-work check not done."}
Lighter: anything that looks right but fails when actually run.
{R4_CLOSE}`,
    },
    {
      option: 'Does what was just built actually do what you think it does? Trace the main execution path and verify the logic is sound.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "AI output present; main-path verification not done."}
Narrower: trace the main path and verify logic is sound.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that was generated but not verified — anything you haven\'t manually checked for correctness?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "AI output present."}
Minimum next step: anything generated but not manually verified.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_SECURITY_CHECK: DecisionContent = {
  question:      'Feature built — security reviewed?',
  pinchFallback: 'Security gap.',
  L1: [
    {
      option: 'Review what was just built for security vulnerabilities: check authentication and authorization logic, input validation for injection risks (SQL, XSS, command), and any API endpoints for missing rate limiting, improper error responses, or exposed sensitive data.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: feature with input-handling and/or auth surface. No security pass performed."}
Security review hasn't been done; the new attack surface is unaudited.
Audit auth/authorization, input validation (injection vectors), rate limiting, and error-response leakage. List findings.
{R4_CLOSE}`,
    },
    {
      option: 'Audit what was just built against OWASP Top 10 exposure: does this feature handle untrusted input safely, authenticate and authorize correctly, and avoid leaking sensitive information in error messages or logs?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature present; OWASP-axis exposure not assessed."}
The OWASP-axis exposure of what was just built hasn't been checked.
Audit against OWASP Top 10 — untrusted input, auth/authz, info disclosure. List findings.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm what was just built against your threat model: what assets are being protected, what attack surface has this feature introduced, and what is the highest-severity vulnerability an attacker could exploit right now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature present; threat-model alignment not done."}
The threat model hasn't been cross-checked against the new attack surface.
Identify protected assets, the surface this feature adds, and the highest-severity exploit path.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Check what was just built for the most critical security gaps: input validation, proper authentication and authorization checks, and sensitive data exposure in responses or logs.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature present; critical-gap check not done."}
Lighter: focus on input validation + auth checks + sensitive-data exposure.
List the critical gaps.
{R4_CLOSE}`,
    },
    {
      option: 'What is the biggest security risk introduced by what was just built, and what would be needed to mitigate it before this ships?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature present; top-risk not identified."}
Narrower: the single biggest security risk + its mitigation.
Name both.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that could be exploited — untrusted input not validated, missing auth checks, or sensitive data exposed to callers?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature present."}
Minimum next step: one exploitable issue — untrusted input, missing auth, or data leakage.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_ERROR_HANDLING: DecisionContent = {
  question:      'Feature built — error paths handled?',
  pinchFallback: 'Error handling.',
  L1: [
    {
      option: 'Review what was just built for error handling gaps: identify all failure modes (network errors, invalid input, missing dependencies, unexpected state), confirm each is handled explicitly, and flag any that are silently swallowed or produce unhelpful error messages.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: feature with external calls / inputs / dependencies. Error-handling audit not performed."}
Failure modes haven't been enumerated; silent or unhelpful errors are now possible.
Identify network / input / dependency / state failure modes. Per mode: handled or swallowed.
{R4_CLOSE}`,
    },
    {
      option: 'Audit the failure paths in what was just built: what happens when each external dependency fails, each input is invalid, or each assumption is violated? Is the failure propagated, logged, or recovered from correctly in each case?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature present; per-dependency failure behaviour not audited."}
Per-dependency failure behaviour hasn't been verified.
For each external dep / input / assumption: what happens on failure (propagated, logged, recovered).
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm what was just built against its error contract: are errors typed and documented, are retries or fallbacks implemented where appropriate, and are error messages safe to expose to callers without leaking internal state?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature present; error contract not defined."}
The error contract hasn't been cross-confirmed.
Audit: typed errors, documentation, retries/fallbacks, callable-safe error messages.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What failure modes in what was just built are currently unhandled or silently swallowed? Identify and fix the most critical ones.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature present; unhandled failures not identified."}
Lighter: which failure modes are unhandled or swallowed?
Identify the most critical ones.
{R4_CLOSE}`,
    },
    {
      option: 'What happens in what was just built when the most likely thing goes wrong — network failure, invalid input, or missing dependency? Verify that case is handled correctly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature present; most-likely failure not addressed."}
Narrower: the single most-likely failure case and how it's handled.
Verify it.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that could fail silently or produce an unhelpful error when something unexpected happens?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature present."}
Minimum next step: one silent or unhelpful failure path.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_DOCUMENTATION: DecisionContent = {
  question:      'Code written — any documentation added?',
  pinchFallback: 'Docs missing.',
  L1: [
    {
      option: 'Review what was just built for documentation coverage: identify functions, classes, and modules with non-obvious behaviour that lack docstrings or inline comments, and add documentation that explains the why — the constraint, the invariant, the tradeoff — not just the what.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: feature implementation. Documentation coverage for non-obvious behavior / decisions / assumptions not added."}
Documentation coverage for non-obvious behavior (functions / classes / modules) hasn't been added.
Per such component: write docstrings or inline comments explaining the WHY — constraint / invariant / tradeoff. Don't expand to fully-obvious code.
{R4_CLOSE}`,
    },
    {
      option: 'Audit what was just built for undocumented assumptions: what design decisions, invariants, or external constraints are embedded in this code that a future maintainer could not infer from reading it? Document those specifically.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation done; undocumented-assumptions audit (design decisions / invariants / external constraints) not done."}
The undocumented-assumptions audit hasn't been performed.
Per design decision / invariant / external constraint embedded in code: document specifically. List findings only.
{R4_CLOSE}`,
    },
    {
      option: 'Check whether what was just built needs README updates, API reference additions, or architecture notes — not just inline comments. What context would someone need to understand this feature without asking the original author?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature implemented; README / API reference / architecture-note updates not done."}
README + API reference + architecture-note coverage hasn't been updated.
Add what a new reader would need to understand this feature without asking the author. Don't backfill historical features.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What parts of what was just built would be hardest for another developer to understand without documentation? Add documentation for those first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done; hardest-to-understand-without-docs spot-check not done."}
Lighter: hardest-to-understand-without-docs parts haven't been identified.
Identify those; document them first.
{R4_CLOSE}`,
    },
    {
      option: 'Identify the non-obvious decisions in what was just built — the ones a future maintainer might change by mistake — and document the reasoning behind each.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done; non-obvious decision reasoning capture not done."}
Narrower: non-obvious decision reasoning capture.
Per such decision: document the reasoning that a future maintainer might otherwise change by mistake.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that has non-obvious behaviour or hidden assumptions that are not documented?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done."}
Minimum next step: anything with non-obvious behavior or hidden assumptions not documented.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_OBSERVABILITY: DecisionContent = {
  question:      'Feature built — how will you know it\'s working?',
  pinchFallback: 'No observability.',
  L1: [
    {
      option: 'Review what was just built for observability gaps: identify what this feature does in production that is currently invisible — requests, failures, latency, state changes — and add structured logging for the events that would allow you to diagnose a production incident without SSH access.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: feature implementation. Observability hooks not added in the visible window."}
Observability for what was just built hasn't been set up — silent failures in production could go undetected.
Identify invisible production events; add structured logging for diagnosable signals.
Still, before you add structured logging across the codebase you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Audit what was just built for monitoring coverage: what SLI would you define for this feature, what metrics would you emit, and what alert condition would page someone if this feature degraded silently in production?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature implemented; SLI/metrics/alert design not done."}
Monitoring coverage hasn't been designed.
Define SLI + emit metrics + alert condition. Don't fix coverage gaps in this pass.
{R4_CLOSE}`,
    },
    {
      option: 'Check what was just built for error tracking integration: are failures captured in your error tracking system with enough context — request ID, user ID, stack trace — to diagnose the issue without reproducing it locally?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature implemented; error-tracker context coverage not verified."}
Error tracking integration hasn't been verified for diagnostic completeness.
Per failure path: request ID / user ID / stack trace present? Flag gaps.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What events in what was just built are currently invisible in production? Add structured logging for the ones that would be essential to diagnose a failure.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature implemented; invisible events not enumerated."}
Lighter: invisible events first. Log the diagnostic-essential ones.
{R4_CLOSE}`,
    },
    {
      option: 'If this feature broke silently in production tonight, what would you see in your logs and monitoring to detect it? If the answer is "nothing", what needs to be added?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature implemented; silent-break detection not verified."}
Narrower: silent-break detection — what's already visible, what's missing.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that could fail silently in production with no log entry or alert to detect it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature implemented."}
Minimum next step: one silent-fail path with no log/alert.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

const ABSENCE_COMPREHENSION: DecisionContent = {
  question:      'AI generated it — do you understand it?',
  pinchFallback: 'Comprehension check.',
  L1: [
    {
      option: 'Review what was just built for comprehension: trace through the main execution path and explain what each significant function, class, and data structure does — independently, without relying on comments generated alongside the code.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: feature implementation accepted. Main-execution-path trace through generated code not performed."}
Comprehension of the main execution path hasn't been verified independently — generated code may carry plausible-but-unverified logic.
Trace each significant function / class / data structure; explain what each does without relying on inline-generated comments. Don't refactor in this pass.
{R4_CLOSE}`,
    },
    {
      option: 'Audit your understanding of what was just built: identify any part of the code you could not explain to a colleague without reading it again. For each such part, either gain that understanding now or flag it as a comprehension debt before moving on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation done; comprehension-debt enumeration not done."}
Comprehension-debt across what was just built hasn't been enumerated.
Per component: explain to a colleague-level audience without re-reading; flag any "could-not-explain" parts as debt. List only.
{R4_CLOSE}`,
    },
    {
      option: 'Check whether what was just built contains any abstractions, design patterns, or external library usage you accepted without fully understanding — verify what each one does and why it was chosen for this specific context.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation accepted; unfamiliar-abstraction / library-usage comprehension not verified."}
Abstraction / pattern / external-library usage accepted without full comprehension hasn't been audited.
Per each: verify what it does + why it was chosen for this specific context. Don't replace yet.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there any part of what was just built you could not confidently explain to another developer right now? Address that before moving on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done; confident-explanation test not run."}
Lighter: confident-explain-to-developer test hasn't been done.
Identify any part you couldn't explain confidently right now; address that part.
{R4_CLOSE}`,
    },
    {
      option: 'Walk through what was just built and identify any code you accepted because it looked correct without actually verifying the logic yourself.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation accepted; looked-correct-without-verification spot-check not done."}
Narrower: looked-correct-without-verification audit.
Walk through and flag any code accepted because it looked correct without verifying the logic.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that you haven\'t manually traced through and fully understood?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done."}
Minimum next step: anything not manually traced through + fully understood.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_REFACTORING: DecisionContent = {
  question:      'Extended implementation — code health reviewed?',
  pinchFallback: 'Refactor check.',
  L1: [
    {
      option: 'Review what was just built for refactoring opportunities: identify code duplication, functions that do more than one thing, abstractions that have grown inconsistent with their usage, and naming that no longer reflects current behaviour — prioritize by maintenance risk.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: feature implementation. Refactoring-opportunities scan (duplication / multi-responsibility / drift) not performed."}
Refactoring opportunities in what was just built (duplication / multi-responsibility functions / drift / stale naming) haven't been identified.
Scan and rank by maintenance risk; list duplication, multi-responsibility functions, inconsistent abstractions, stale naming. Don't refactor in this pass.
{R4_CLOSE}`,
    },
    {
      option: 'Audit what was just built for code health: are there patterns that have emerged across this implementation that should be abstracted, any dead code that can be removed, or any modules that have grown beyond their original responsibility?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation done; code-health audit (patterns / dead code / overgrown modules) not done."}
Code-health audit (emergent patterns to abstract / dead code / overgrown modules) hasn't been done.
Per category: list findings. Hold off on the actual abstractions until prioritized.
{R4_CLOSE}`,
    },
    {
      option: 'Check what was just built against existing codebase conventions: does it introduce inconsistent patterns, style deviations, or compounding technical debt that would make the next feature harder to add if not addressed now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation done; codebase-convention fit + technical-debt audit not done."}
Codebase-convention fit + compounding-tech-debt audit hasn't been done.
Flag inconsistent patterns / style deviations / debt that would block the next feature. List only.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the most significant refactoring opportunity in what was just built — the thing that if left will make the next feature harder to add?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done; most-significant refactoring spot not identified."}
Lighter: most-significant refactoring opportunity (next-feature blocker) hasn't been identified.
Name the one that, if left, makes the next feature harder.
{R4_CLOSE}`,
    },
    {
      option: 'Review what was just built for duplication or inconsistency that should be cleaned up before moving on to the next task.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done; duplication / inconsistency spot-check not done."}
Narrower: duplication / inconsistency cleanup spot-check.
List what should be cleaned up before moving on.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that should be refactored or cleaned up before moving on?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done."}
Minimum next step: anything that should be refactored or cleaned up before moving on.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_NO_PUSHBACK: DecisionContent = {
  question:      'AI suggesting — are you evaluating critically?',
  pinchFallback: 'No pushback.',
  L1: [
    {
      option: 'Review the recent generated outputs used in what was just built: identify any decisions, implementations, or suggestions you accepted without explicitly verifying the reasoning, checking for alternatives, or questioning the assumptions embedded in the response.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: generated output accepted without independent verification of reasoning / alternatives / embedded assumptions."}
The independent-verification audit of recent generated output hasn't been done.
Per significant decision / implementation / suggestion accepted: verify reasoning, check for unexplored alternatives, question embedded assumptions. List findings only.
{R4_CLOSE}`,
    },
    {
      option: 'Audit your acceptance pattern while building this feature: for each significant AI output, ask whether you evaluated it independently or accepted it because it was confident and plausible. Flag any output where you would struggle to justify the implementation choice to a peer reviewer.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent acceptance pattern unevaluated — confidence-plausibility-based acceptance may have replaced critical evaluation."}
The acceptance-pattern audit (confidence-plausibility vs critical-evaluation) hasn't been performed.
Per significant accepted output: would I struggle to justify it to a peer reviewer? Flag those. Listing only.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm the most recent suggestion used in what was just built: what assumptions were made that were not in your prompt, what alternatives were not considered, and is the approach chosen actually the best fit for this project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Latest accepted output not cross-confirmed — embedded assumptions / un-considered alternatives unaudited."}
Cross-confirmation of the most recently accepted output hasn't been done.
For that output: surface embedded-but-unstated assumptions; identify alternatives it did not consider; assess whether the chosen approach is the best fit for this project. Don't replace — flag.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Take the last significant AI output used in what was just built and evaluate it critically: do you agree with the approach, and if so, can you explain why it is better than the alternatives?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Last significant output accepted without critical evaluation."}
Lighter: critical evaluation of the last significant output hasn't been applied.
Take that output; evaluate the approach; articulate why it's better than alternatives (or flag if not).
{R4_CLOSE}`,
    },
    {
      option: 'Is there any AI output used in what was just built that you accepted because it sounded right rather than because you verified it was right?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Acceptance based on sounded-right pattern not separated from verified-right pattern."}
Narrower: sounded-right vs verified-right separation.
Identify any output accepted because it sounded right rather than verified-right.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there any AI suggestion used in what was just built that you accepted without questioning the reasoning or checking for better alternatives?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done."}
Minimum next step: any accepted output where reasoning wasn't questioned + alternatives weren't checked.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_CORRECTION_SEEKING: DecisionContent = {
  question:      'AI output — self-verification requested?',
  pinchFallback: 'No verification.',
  L1: [
    {
      option: 'Self-review what was just built: identify any assumptions that may be incorrect, logic that could fail under edge cases, and any parts of the implementation you are not confident about.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: implementation accepted. Self-review (incorrect-assumptions / edge-case-failures / low-confidence parts) not done."}
Self-review of what was just built (incorrect assumptions / edge-case failures / low-confidence parts) hasn't been performed.
List assumptions that might be wrong, logic that could fail under edge cases, and parts I'm not confident about. Don't fix — flag only.
{R4_CLOSE}`,
    },
    {
      option: 'Argue against your own implementation of what was just built — what would a skeptical senior engineer flag, what alternative approaches were not considered, and what are the weakest parts of this solution?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation accepted; skeptical-senior-engineer critique not surfaced."}
The skeptical-senior-engineer critique of what was just built hasn't been surfaced.
Argue against the implementation: what would a skeptical senior flag / what alternatives weren't considered / weakest parts. Listing only.
{R4_CLOSE}`,
    },
    {
      option: 'Produce a failure analysis of what was just built: what are the most likely ways this implementation fails in production, what inputs would cause incorrect behaviour, and what would you change if rebuilding this from scratch?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation accepted; production-failure analysis not done."}
The production-failure analysis (likely failure modes / incorrect-behaviour inputs / rebuild-from-scratch changes) hasn't been done.
List the failure modes, the incorrect-behaviour inputs, and the rebuild-from-scratch changes. Findings only — no rewrite.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Review what was just built critically — what would you change or flag if reviewing this as a senior engineer rather than as the author?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation accepted; senior-engineer-perspective review not done."}
Lighter: senior-engineer-perspective review hasn't been applied.
List what to change or flag if reviewing this as a senior engineer rather than author.
{R4_CLOSE}`,
    },
    {
      option: 'Self-critique what was just built: what are the weakest parts, and what were you least confident about when generating this?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation accepted; weakest-parts self-critique not surfaced."}
Narrower: weakest-parts + least-confident-during-generation audit.
Surface the weakest parts and the points of generation-time uncertainty.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Identify the part of what was just built you are least confident is correct.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation accepted."}
Minimum next step: the one part least confident as correct.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_PROBLEM_CORRECTION: DecisionContent = {
  question:      'Bug noticed — explicitly corrected?',
  pinchFallback: 'Bug unresolved.',
  L1: [
    {
      option: 'Review the outstanding bugs and issues identified in this session: for each one, confirm whether it has been explicitly fixed, explicitly deferred with a tracking note, or left unaddressed. Address any that are unresolved and blocking correctness of what was just built.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: bugs / issues mentioned without explicit fix-confirmation."}
Outstanding issues from this session haven't all been resolved or explicitly deferred.
Per issue: fixed / deferred-with-note / blocking. Address blocking ones.
{R4_CLOSE}`,
    },
    {
      option: 'Audit what was just built for bugs that were noticed but not fixed: identify any error, failure, or incorrect behaviour that was mentioned in this session and is still present in the current implementation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Issues mentioned earlier; current-implementation status not verified per issue."}
The bug-noticed-but-still-present surface hasn't been audited.
Identify each noticed-but-unfixed issue in current implementation.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm the current state of what was just built: run the tests, check the known failure cases, and verify that any issue identified earlier in this session has been resolved or explicitly acknowledged as a known limitation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation done; known-failure-case state not confirmed."}
The current state of the implementation against known failure cases hasn't been confirmed.
Run tests + known failure cases; verify earlier issues now resolved.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there any bug or issue in what was just built that was noticed earlier in this session but not explicitly fixed? Address it before moving on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Issue mentioned earlier; status unclear."}
Lighter: any issue noticed earlier not explicitly fixed.
Address before moving on.
{R4_CLOSE}`,
    },
    {
      option: 'Run the tests for what was just built and confirm that any failure identified earlier in this session is now resolved.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Earlier failure mentioned; resolution status unclear."}
Narrower: run the tests, confirm earlier failures now pass.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there any bug in what was just built that was noticed but not explicitly corrected before moving on?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Issue mentioned earlier."}
Minimum next step: any noticed-but-uncorrected bug.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_ALTERNATIVES: DecisionContent = {
  question:      'Decision made — alternatives considered?',
  pinchFallback: 'No alternatives.',
  L1: [
    {
      option: 'Review the key decisions made in what was just built: name the alternatives that were not chosen, explain the tradeoffs between each approach, and confirm that the chosen solution is the best fit for the constraints of this project — not just the first viable option.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: key decisions made during implementation. Alternatives-vs-chosen approach not weighed."}
Alternatives to the chosen approach haven't been weighed against the project's constraints.
For each key decision: name unselected alternatives, articulate tradeoffs, confirm the chosen approach beats them. Don't refactor in this pass.
{R4_CLOSE}`,
    },
    {
      option: 'Audit the key technical choices made while building this feature: for each significant decision (architecture, library, algorithm, data structure), identify at least one alternative that was not explored and evaluate whether the chosen approach is still the right one given the project\'s constraints.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature implementation chose first viable options without alternative exploration."}
Per-decision alternative exploration (architecture / library / algorithm / data structure) hasn't been done.
Per significant choice: identify one un-explored alternative + evaluate fit vs constraints. Listing only — no refactor.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm the approach taken in what was just built: what would a different engineering team have done differently, what are the known weaknesses of the chosen approach, and is there a simpler solution that would meet the requirements with fewer dependencies or moving parts?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Approach chosen; outside-perspective check + simpler-solution check not performed."}
The outside-perspective check (different team / simpler solution) hasn't been applied to the chosen approach.
Articulate what a different team would have done; identify known weaknesses; flag any simpler-solution option with fewer dependencies. List only.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What was the most significant technical decision made in what was just built? Name the alternatives that were not explored and confirm the chosen approach is the right tradeoff.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done; key-decision alternatives not enumerated."}
Lighter: most-significant-decision's alternatives haven't been enumerated.
Name the unselected alternatives + confirm the chosen tradeoff is right.
{R4_CLOSE}`,
    },
    {
      option: 'Is there any part of what was just built where a different approach would have been simpler, more maintainable, or better suited to the project\'s constraints?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done; simpler-approach check not run."}
Narrower: any-part-where-simpler-approach-fits check hasn't been done.
List spots where a different approach would have been simpler or better-suited.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there any decision in what was just built that was made without considering alternatives — where the first approach was taken without evaluating other options?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done."}
Minimum next step: any decision made without evaluating other options at all.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_ARCH_CONFLICT: DecisionContent = {
  question:      'Feature added — architecture consistency checked?',
  pinchFallback: 'Arch conflict.',
  L1: [
    {
      option: 'Review what was just built for architectural consistency: does this feature follow the same patterns, abstractions, and conventions established in the existing codebase, or does it introduce a parallel approach that will diverge over time and increase maintenance cost?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: new feature implementation. Consistency with existing codebase patterns not checked."}
Whether what was just built follows existing patterns and conventions hasn't been audited.
Identify deviations; flag parallel-approach risks that'll diverge over time.
{R4_CLOSE}`,
    },
    {
      option: 'Audit what was just built for architecture conflicts: identify any module boundaries crossed without justification, any shared state accessed in ways inconsistent with the existing data flow, and any new dependencies introduced that conflict with the project\'s existing dependency strategy.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature implemented; boundary-crossing and dep-strategy not audited."}
The boundary-crossing + dependency-strategy audit hasn't been done.
Flag module boundaries crossed without justification, inconsistent shared-state access, new conflicting deps.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm what was just built against the architectural decisions documented for this project: does this feature respect the layering, separation of concerns, and interface contracts that were established? Flag any violations and determine whether they require a refactor or an architecture decision update.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature implemented; alignment against documented arch decisions not checked."}
Alignment against documented architecture decisions hasn't been confirmed.
Flag violations + decide: refactor needed or arch-decision update needed.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does what was just built follow the same patterns and conventions as the rest of the codebase, or does it introduce a new approach that conflicts with the existing architecture?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature implemented; pattern match not checked."}
Lighter: does it follow the same patterns as the rest of the codebase?
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in what was just built that violates a design decision or architectural convention established earlier in this project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature implemented; design-decision violations not flagged."}
Narrower: anything that violates an earlier design decision in this project.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that doesn\'t fit the patterns or structure of the existing codebase?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature implemented."}
Minimum next step: anything that doesn't fit the existing codebase's structure.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_PROMPT_CONTEXT: DecisionContent = {
  question:      'Prompts sent — spec and arch referenced?',
  pinchFallback: 'Missing context.',
  L1: [
    {
      option: 'Review the prompts used to build this feature: are they grounded in the project\'s spec, architecture decisions, and task breakdown, or are they ad hoc instructions that you are implementing without access to the full planning context? If context is missing, inject it now before the next prompt.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: ad-hoc instructions, no explicit spec/arch context injection."}
The spec / architecture / task-breakdown context hasn't been confirmed in recent prompts.
Inject the relevant planning context now before the next prompt — paste spec section, arch diagram, or task definition.
{R4_CLOSE}`,
    },
    {
      option: 'Audit the context richness of the prompts used to build this feature: do you have access to the current spec, the established architecture, and the specific acceptance criteria for what was just built, or are you making assumptions that a context-rich prompt would have resolved?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: assumption-driven instead of context-rich."}
The context richness of recent prompts hasn't been audited.
Identify what context (spec / arch / criteria) is missing; inject it before continuing.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm that what was just built is aligned with the project\'s planning artifacts: paste the relevant spec section, architecture diagram, or task definition into the conversation and verify that your implementation matches what was planned.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature built; alignment with planning artifacts not verified."}
Alignment with planning artifacts hasn't been confirmed.
Paste relevant spec/arch/task context; verify implementation matches plan.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Do you have the spec and architecture context needed to build this feature correctly, or have you been working from ad hoc instructions? Inject the relevant planning context before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Recent prompts: ad-hoc; full picture not present."}
Lighter: spec + arch context needed for correctness — inject now.
{R4_CLOSE}`,
    },
    {
      option: 'Paste the spec or acceptance criteria for this feature into the conversation and check whether what was just built matches what was planned.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature built; spec-match not checked."}
Narrower: paste spec / acceptance criteria; check match against build.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Do you have enough context about the spec and architecture to be building this feature correctly, or are you working without the full picture?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Recent prompts: ad-hoc."}
Minimum next step: enough spec/arch context to build correctly, or full picture missing?
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_ROLLBACK_PLANNING: DecisionContent = {
  question:      'Release pending — rollback plan defined?',
  pinchFallback: 'No rollback plan.',
  L1: [
    {
      option: 'Define the rollback procedure for this feature before shipping: identify the steps to revert if the deployment fails, confirm the rollback can be completed within your acceptable downtime window, and verify that database migrations or data changes are reversible.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Pre-ship stage; rollback procedure not authored."}
A rollback plan for what was just built hasn't been defined.
Document revert steps + downtime window + migration reversibility.
{R4_CLOSE}`,
    },
    {
      option: 'Audit the rollback readiness of this feature: what happens to data, sessions, and dependent services if this deploy is reverted? Document the rollback steps, assign ownership, and confirm the plan can be executed without live debugging during an incident.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Pre-ship; rollback impact on data/sessions/deps not audited."}
The rollback impact audit hasn't been done.
Document data/session/dep effects + ownership + executable-under-pressure steps.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm rollback viability for what was just built: if you rolled back this feature in production right now, what would break, what state would be left in an inconsistent state, and what would need to be cleaned up manually? Address any gaps before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Pre-ship; revert-viability not confirmed."}
Whether a clean rollback is possible right now hasn't been confirmed.
Identify what would break + inconsistent-state items + manual cleanup. Address gaps.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the rollback procedure if the deployment of this feature fails? Document it before shipping — it should be executable under pressure without needing to invent steps on the fly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Pre-ship; rollback steps not documented."}
Lighter: document executable-under-pressure rollback steps.
{R4_CLOSE}`,
    },
    {
      option: 'Are there any parts of this feature — database migrations, external API integrations, data format changes — that cannot be cleanly rolled back? Address those before shipping or accept them as known risks.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Pre-ship; unrollback-able pieces not flagged."}
Narrower: parts that can't roll back cleanly (migrations, integrations, data formats).
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there a documented rollback plan for this feature that could be executed in production under pressure, or would reverting require improvisation?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Pre-ship."}
Minimum next step: rollback plan documented + executable under pressure, or improvisational?
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

const ABSENCE_DEPLOYMENT_PLANNING: DecisionContent = {
  question:      'Release pending — deployment plan confirmed?',
  pinchFallback: 'No deploy plan.',
  L1: [
    {
      option: 'Define the deployment plan for this feature before shipping: confirm the target environment configuration, document any environment variables or secrets that need to be provisioned, and verify that the deployment process has been tested outside of production.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Pre-ship stage; deployment plan not authored."}
A deployment plan hasn't been authored.
Define target env config + secrets/vars to provision + deploy-tested-outside-prod confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Audit the deployment readiness of this feature: are there environment-specific configuration differences between staging and production that could cause a failure, any new environment variables required, or any infrastructure changes needed before this can deploy cleanly?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Pre-ship; staging-vs-prod diff and infra-change check not done."}
The deploy-readiness audit hasn't been done.
Identify staging-vs-prod config differences, new env vars, required infra changes.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm deployment readiness for this feature: what does the production environment need to have in place before this deploys successfully — configuration, secrets, database state, external service integrations — and is each of those confirmed and ready?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Pre-ship; production-prerequisite audit not done."}
Production prerequisites haven't been cross-confirmed.
Per prerequisite (config / secrets / DB state / external integrations): confirmed-ready or pending?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What environment configuration does this feature require in production that is not yet confirmed — secrets, environment variables, infrastructure dependencies? Resolve each before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Pre-ship; prod-config gap not resolved."}
Lighter: prod config required but not confirmed — secrets, env vars, infra deps. Resolve each.
{R4_CLOSE}`,
    },
    {
      option: 'Has this feature been deployed to a staging environment that mirrors production? If not, what deployment risks are you accepting by shipping without a staging verification?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Pre-ship; staging verification not done."}
Narrower: staging-mirror verification status + accepted-risk list if skipped.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there a confirmed deployment plan for this feature, or is the deployment process still undefined and untested outside of development?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Pre-ship."}
Minimum next step: deployment plan confirmed + tested-outside-dev, or undefined?
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

const ABSENCE_DEPENDENCY_MGMT: DecisionContent = {
  question:      'Dependencies added — conflicts and risks reviewed?',
  pinchFallback: 'Dependency risk.',
  L1: [
    {
      option: 'Review the new dependencies introduced in what was just built: check for version conflicts with existing packages, known security vulnerabilities in the chosen version, and whether a more stable or widely-adopted alternative exists for the same purpose.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: new dependencies added. Conflict/CVE/alternative audit not done."}
New dependencies haven't been audited for conflicts/CVEs/alternatives.
Per package: version-conflict / known CVE / better alternative available?
{R4_CLOSE}`,
    },
    {
      option: 'Audit the packages added in what was just built for dependency health: are the chosen versions the latest stable releases, do any have known CVEs in the installed version, and are the licences compatible with this project\'s licence requirements?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Dependencies added; health audit not done."}
Dependency health hasn't been audited.
Per package: latest-stable / CVE-clean / licence-compatible.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm the dependency decisions made in what was just built: for each new package, verify it is actively maintained, has adequate documentation, does not introduce transitive dependencies that conflict with the existing dependency tree, and is not a single-maintainer package with no succession plan.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Dependencies added; maintenance/transitive-deps/bus-factor not cross-confirmed."}
The dependency decision cross-confirmation hasn't been done.
Per package: maintenance status / docs / transitive conflicts / bus-factor risk.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Check the new packages added in what was just built for version conflicts and known vulnerabilities — run a dependency audit and confirm there are no high-severity issues before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Dependencies added; npm/pip/cargo audit not run."}
Lighter: run a dependency audit; confirm zero high-severity issues.
{R4_CLOSE}`,
    },
    {
      option: 'Is there any package added in what was just built that is unmaintained, has an incompatible licence, or pulls in a transitive dependency that conflicts with what is already installed?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Dependencies added; risk audit not done."}
Narrower: any package unmaintained / licence-incompatible / transitive-conflict.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Have the new packages added in what was just built been checked for version conflicts, known security vulnerabilities, and licence compatibility?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Dependencies added."}
Minimum next step: conflict / CVE / licence check on new packages.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

const ABSENCE_PHASE_TRANSITION: DecisionContent = {
  question:      'Extended phase — transition readiness assessed?',
  pinchFallback: 'Phase check.',
  L1: [
    {
      option: 'Assess transition readiness for this project: define what must be complete before moving to the next phase, confirm which of those criteria are currently met, and identify what is blocking the transition. If no criteria are defined, define them now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended phase activity; exit criteria not assessed."}
Exit criteria for the current phase haven't been assessed — the phase has been active long enough to risk drift without a clean handoff.
Define exit criteria / confirm which are met / identify blockers.
{R4_CLOSE}`,
    },
    {
      option: 'Review the current phase of this project against its original definition: have the objectives for this phase been met, what work is still in progress, and is there a clear handoff point that marks the end of this phase and the beginning of the next?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended phase; review vs original definition not done."}
The phase-vs-original-definition review hasn't been done.
Check: objectives met / work still in progress / clear handoff point.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm phase completion for this project: what artifacts, decisions, or quality gates were supposed to be produced in this phase, which are complete, which are missing, and what would need to be done to be confident that proceeding to the next phase is the right call?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended phase; cross-confirmation of completion not done."}
Phase-completion cross-confirmation hasn't been done.
List: artifacts/decisions/gates expected vs complete vs missing — gate proceeding decision on that.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What are the exit criteria for the current phase of this project? Assess which are met and which are not before committing to the next phase.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended phase."}
Lighter: name exit criteria / met vs not.
{R4_CLOSE}`,
    },
    {
      option: 'Is there any unfinished work from the current phase of this project that should be resolved before transitioning — decisions deferred, quality gates not cleared, or artifacts not produced?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended phase; unfinished items not surveyed."}
Narrower: unfinished items — deferred decisions / un-cleared gates / un-produced artifacts.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What needs to be true for this project to be ready to move to the next phase, and is any of that currently incomplete or unresolved?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended phase."}
Minimum next step: name the next-phase-readiness condition + status.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_SPEC_CROSS_CONFIRM: DecisionContent = {
  question:      'Spec written — cross-confirmed against requirements?',
  pinchFallback: 'Spec not confirmed.',
  L1: [
    {
      option: 'Cross-confirm this project\'s spec against its source requirements: for each requirement in the spec, verify it traces back to a stated user need or stakeholder decision, covers the acceptance criteria completely, and does not contain assumptions that were not explicitly agreed upon.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Spec drafted across recent prompts; traceability to original requirements not audited."}
The spec itself hasn't been cross-confirmed against the original requirements.
Per requirement: traces to stated user need / covers acceptance criteria / no unconfirmed assumptions. Flag any failures.
{R4_CLOSE}`,
    },
    {
      option: 'Audit this project\'s spec for internal consistency and completeness: identify any requirements that contradict each other, any acceptance criteria that are ambiguous or untestable, and any scope decisions that were made without explicit stakeholder sign-off.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Spec drafted; internal-consistency audit not done."}
The internal-consistency audit hasn't been performed.
Find contradictions, ambiguous/untestable criteria, unconfirmed scope decisions.
{R4_CLOSE}`,
    },
    {
      option: 'Review this project\'s spec against what is actually feasible given the current technical constraints: flag any requirements that have no clear implementation path, any acceptance criteria that would require capabilities not available in the current stack, and any decisions that have been implicitly made but not documented.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Spec drafted; feasibility audit against current stack not done."}
Feasibility against the actual stack hasn't been verified.
Flag requirements with no clear implementation path, criteria needing unavailable capabilities, implicit-but-undocumented decisions.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Go through this project\'s spec and identify any requirement that cannot be directly traced to a stated user need or a documented stakeholder decision — those are assumptions that need to be confirmed before implementation begins.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Spec drafted; assumption check not done."}
Lighter: any requirement that's an assumption rather than traced.
List those for confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in this project\'s spec that is ambiguous enough that two developers could implement it differently and both be technically correct? Resolve those ambiguities before building.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Spec drafted; ambiguity audit not done."}
Narrower: anything ambiguous enough for two correct-but-different implementations.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in this project\'s spec that has not been verified against the original requirements — any assumption, scope decision, or acceptance criterion that was added without explicit confirmation?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Spec drafted."}
Minimum next step: any assumption / scope / criterion added without explicit confirmation.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_SPEC_REVISION: DecisionContent = {
  question:      'Spec drafted — revised since initial version?',
  pinchFallback: 'Spec unrevised.',
  L1: [
    {
      option: 'Revise this project\'s spec to reflect what has been learned since the initial draft: update any requirements that turned out to be more or less complex than anticipated, add acceptance criteria for edge cases discovered during implementation, and remove or defer any scope that has been implicitly dropped.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Spec drafted; implementation has progressed without spec updates."}
The spec hasn't been updated to match what's been learned during implementation.
Update requirements that turned out harder/simpler than expected; add edge-case criteria; remove/defer implicitly-dropped scope.
{R4_CLOSE}`,
    },
    {
      option: 'Audit this project\'s spec for drift: compare the current implementation against the spec and identify where the two have diverged — either the spec is outdated and the implementation is correct, or the implementation has deviated from the spec and needs to be corrected. Resolve each divergence explicitly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Spec and implementation present; drift not audited."}
The spec-vs-implementation drift audit hasn't been done.
Flag every divergence + decide per case: update spec OR correct implementation.
{R4_CLOSE}`,
    },
    {
      option: 'Review this project\'s spec against the current state of the project: what decisions have been made during implementation that are not reflected in the spec, what requirements have been reinterpreted or changed in practice, and what new constraints or dependencies have emerged that the spec does not document?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation has accumulated decisions; spec not updated to reflect them."}
The implementation-time decisions haven't been back-propagated into the spec.
List: undocumented decisions, reinterpreted requirements, emergent constraints/dependencies.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Compare the current implementation against this project\'s spec and flag every place they diverge — then decide for each divergence whether the spec needs to be updated or the implementation needs to change.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Spec present; impl drift not flagged."}
Lighter: spec-vs-impl drift — flag and decide direction per drift.
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in this project\'s spec that was written before implementation started and no longer reflects the current technical decisions or scope? Update it now so the spec is a true record of what is being built.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Spec present; pre-impl-only sections not refreshed."}
Narrower: spec sections written pre-impl that no longer reflect current decisions.
Update them.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Does this project\'s spec still accurately reflect what is being built, or has the implementation diverged from the original spec without the spec being updated?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Spec present; impl ongoing."}
Minimum next step: does the spec still reflect what's being built?
{R4_CLOSE}`,
    },
  ],
};

/** ABSENCE_TEST_CREATION_CASUAL — casual-register variant for pro_geek_soul and null profiles */
const ABSENCE_TEST_CREATION_CASUAL: DecisionContent = {
  question:      'Built something — any tests written yet?',
  pinchFallback: 'Tests missing.',
  L1: [
    {
      option: 'Write tests for what was just built — unit tests for anything new or changed, and one test that runs the main flow. What\'s the most likely thing that could break?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Recent prompts have been implementation. No tests written for what I built."}
Tests haven't been written; whatever I just built could regress silently next time someone changes it.
Write unit tests + one main-flow integration test. Name the riskiest thing.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the riskiest part of what was just built that has no test? Write one test for that first, then keep going.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; no tests yet."}
The riskiest untested bit hasn't been picked.
Pick it, write that test, then keep going.
{R4_CLOSE}`,
    },
    {
      option: 'Is what was just built easy to test as-is, or does it need a small refactor to make testing feasible? Share what you find.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; not sure if tests can be written without restructuring."}
The testability check hasn't been done.
Tell me what you find — easy or needs a small refactor first.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Write at least one test for what was just built — something that would catch it breaking silently.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Zero tests yet."}
Floor: one test that catches silent breakage.
Write it.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the most likely thing to break silently in what was just built? Write a test for that.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built; silent-break paths not mapped."}
Highest-leverage test = the one catching the most likely silent break.
Pick it and write it.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Write one test for the most important behaviour in what was just built before moving on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Zero tests."}
Minimum next step: one test on the most important behaviour.
{R4_CLOSE}`,
    },
  ],
};

/** ABSENCE_REGRESSION_CHECK_CASUAL — casual-register variant for pro_geek_soul and null profiles */
const ABSENCE_REGRESSION_CHECK_CASUAL: DecisionContent = {
  question:      'Changed something — did anything break?',
  pinchFallback: 'Regression check.',
  L1: [
    {
      option: 'Run the tests for this project and check — did what was just built break anything that was working before? Report what\'s failing and why.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been changing code in the recent prompts; haven't run the existing tests since."}
Regression on previously-working stuff hasn't been verified.
Run the existing tests, tell me what's failing and why.
{R4_CLOSE}`,
    },
    {
      option: 'What existing code is most likely affected by what was just built? Run those tests and tell me if anything broke.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Made changes; affected-paths not identified."}
The existing code most likely affected by what I just built hasn't been verified.
Check those paths' tests, tell me what broke.
{R4_CLOSE}`,
    },
    {
      option: 'Look at what was just built — what could it accidentally break in what was already working? Verify those paths still work.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Made changes; what-could-break not enumerated."}
The accidental-break paths haven't been surfaced.
Spot them, verify they still work.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Run the test suite and flag anything that\'s now failing that wasn\'t before — especially anything near what was just built.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Made changes; suite not run."}
Lighter: run the suite, flag what's newly failing near the changes.
{R4_CLOSE}`,
    },
    {
      option: 'What existing functionality is most likely affected by what was just built? Give it a quick check.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Made changes; impact-paths not checked."}
Narrower: pick the most-likely-affected functionality and check it.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Run the tests and tell me if anything broke after what was just built was added.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Made changes."}
Minimum next step: run the tests, tell me if anything broke.
{R4_CLOSE}`,
    },
  ],
};

/** ABSENCE_SPEC_ACCEPTANCE_CASUAL — casual-register variant for pro_geek_soul and null profiles */
const ABSENCE_SPEC_ACCEPTANCE_CASUAL: DecisionContent = {
  question:      'Built something — does it match what was planned?',
  pinchFallback: 'Check the spec.',
  L1: [
    {
      option: 'Check what was just built against the original plan — does it actually do what it was supposed to? List anything that\'s off, missing, or different from what was asked for.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built something but I haven't checked it against the original plan."}
Spec compliance hasn't been checked.
List anything off, missing, or different from what was asked for.
{R4_CLOSE}`,
    },
    {
      option: 'Compare what was just built to what was specified — any gaps, extra bits that weren\'t asked for, or things that work differently than planned?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; plan-vs-build comparison not done."}
The build hasn't been compared back to the spec.
Tell me gaps, extra bits unasked for, or different-than-planned behaviours.
{R4_CLOSE}`,
    },
    {
      option: 'Does what was just built handle the edge cases from the spec, or just the happy path? Flag anything that would fail on a non-standard input.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built happy path; edge-case spec coverage not checked."}
The edge-case spec check hasn't been done.
Flag anything that fails on non-standard input.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does what was just built match what was planned? Flag anything that\'s different or missing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built; spec match not verified."}
Lighter: anything different or missing vs the plan.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the biggest gap between what was just built and what the spec asked for?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built; biggest spec gap not identified."}
Narrower: the biggest gap between build and spec.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that doesn\'t match what was originally planned or specified?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built."}
Minimum next step: anything that doesn't match the original plan.
{R4_CLOSE}`,
    },
  ],
};

/** ABSENCE_CROSS_CONFIRMING_CASUAL — casual-register variant for pro_geek_soul and null profiles */
const ABSENCE_CROSS_CONFIRMING_CASUAL: DecisionContent = {
  question:      'AI wrote it — have you actually checked it?',
  pinchFallback: 'Verify the output.',
  L1: [
    {
      option: 'Take a real look at what was just built — not just \'does it look right\', but does it actually work correctly? Check for made-up functions, wrong assumptions, or logic that sounds good but doesn\'t hold up.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Code was generated for me; I've been accepting outputs without really checking them."}
The generated code hasn't been actually checked — just glanced at.
Look for made-up functions, wrong assumptions, plausible-sounding-but-wrong logic.
{R4_CLOSE}`,
    },
    {
      option: 'Walk through what was just built and check each part — is there anything that looks right but is subtly off, handles the wrong case, or references something that doesn\'t exist?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Generated output present; piece-by-piece check not done."}
The piece-by-piece walkthrough hasn't been done.
Find anything subtly off, handles the wrong case, or references something that doesn't exist.
{R4_CLOSE}`,
    },
    {
      option: 'Check what was just built for the classic AI mistakes — hallucinated APIs, edge cases silently skipped, or missing error handling. Flag anything you haven\'t manually verified.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Generated output present; classic AI mistakes not screened."}
The classic-AI-mistake screen hasn't been done.
Hallucinated APIs, silently-skipped edge cases, missing error handling. Flag what's unverified.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that you accepted without actually checking if it works correctly?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Generated output present; correctness-check not done."}
Lighter: anything accepted without checking it works correctly.
{R4_CLOSE}`,
    },
    {
      option: 'Walk through the main logic in what was just built — does it actually do what you expect, or just look like it does?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Generated; logic walkthrough not done."}
Narrower: walk through the main logic — does it actually do what I think?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that was generated but you haven\'t checked for correctness yet?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Generated."}
Minimum next step: anything generated but not checked for correctness yet.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_SECURITY_CHECK_CASUAL: DecisionContent = {
  question:      'Built something — any security checks done?',
  pinchFallback: 'Security gap.',
  L1: [
    {
      option: 'Look at what was just built — is there anything that handles user input or touches auth that hasn\'t been checked for obvious security problems? What could an attacker do with this as it stands?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built something with input/auth surface; haven't checked it for security yet."}
Security pass hasn't been done; what an attacker could do with this is unknown.
Look for the obvious problems — bad input handling, missing checks, anything that leaks.
{R4_CLOSE}`,
    },
    {
      option: 'Check what was just built for the easy wins an attacker would go for first — bad input handling, missing permission checks, or anything that leaks data it shouldn\'t.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; easy-wins for attackers not checked."}
The easy-wins an attacker goes for first haven't been audited.
Check for input handling gaps, missing permission checks, leaky data.
{R4_CLOSE}`,
    },
    {
      option: 'Walk through what was just built as if you\'re trying to break it — what\'s the first thing you\'d try? Flag anything that looks like it could be abused.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; not tried breaking it."}
The break-it-on-purpose walk hasn't been done.
Try breaking it — flag what looks abusable.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the biggest security risk in what was just built? Flag it and explain what needs to change.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; top-risk not picked."}
Lighter: the single biggest security risk + what needs changing.
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in what was just built that handles user input or auth that hasn\'t been properly validated or checked?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; input/auth validation not checked."}
Narrower: input-handling and auth checks specifically.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that could be exploited — untrusted input, missing auth, or data that shouldn\'t be exposed?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: one exploitable bit — untrusted input, missing auth, exposed data.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_ERROR_HANDLING_CASUAL: DecisionContent = {
  question:      'Feature built — what happens when it breaks?',
  pinchFallback: 'Error handling.',
  L1: [
    {
      option: 'Look at what was just built — what happens when something goes wrong? Check for unhandled errors, anything that fails silently, and cases where the error message would tell an attacker more than the user needs to know.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built something with external calls/inputs; haven't thought about what happens when things break."}
The "what happens when it breaks" hasn't been worked through.
Look for unhandled errors, silent failures, leaky error messages.
{R4_CLOSE}`,
    },
    {
      option: 'Walk through the unhappy paths in what was just built — what happens when a network call fails, the input is weird, or a dependency isn\'t available? Are those cases handled, or does it just crash?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; unhappy-path walk not done."}
The unhappy paths haven't been walked through.
Network fails / weird input / missing dep — handled or crash?
{R4_CLOSE}`,
    },
    {
      option: 'Think about what was just built from the angle of things going wrong — what\'s the most likely failure, and what does the user or caller see when it happens? Is that the right behaviour?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; failure-feel not considered."}
The user/caller experience on failure hasn't been considered.
Most likely failure → what the caller sees → is that the right behaviour?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the most likely thing to fail in what was just built, and what happens when it does? Fix it if it\'s not handled.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; most-likely-fail not identified."}
Lighter: the most likely thing to fail + what happens when it does.
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in what was just built that could fail without producing a useful error message or recovering gracefully?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; useful-error check not done."}
Narrower: anything that fails without a useful error or graceful recovery.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that fails silently or doesn\'t handle the obvious error cases?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: one silent-fail or obvious-error-case gap.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_DOCUMENTATION_CASUAL: DecisionContent = {
  question:      'Code written — is anything documented?',
  pinchFallback: 'Docs missing.',
  L1: [
    {
      option: 'Look at what was just built — what parts would confuse someone reading it for the first time? Add short comments explaining the why, not just the what, for anything that isn\'t obvious from the code itself.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Wrote code without commenting the non-obvious parts that would confuse someone reading it for the first time."}
The would-confuse-first-time-reader documentation check hasn't been done.
Spot the confusing parts; add short comments on the WHY (not the what); skip obvious-from-code spots.
{R4_CLOSE}`,
    },
    {
      option: 'Check what was just built for undocumented decisions — things that would make a future developer go "why did they do it this way?" Write a quick note for each before the context is forgotten.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Made decisions that would make a future dev ask 'why did they do it this way?' without leaving notes."}
The why-did-they-do-this-way decision-note coverage hasn't been done.
Write a quick note per such decision before context fades.
{R4_CLOSE}`,
    },
    {
      option: 'Does anything in what was just built need a README update or a note in the docs? What would someone need to know to use or maintain this feature without asking you directly?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built the feature but didn't update README or docs for what someone would need to use or maintain it."}
README + docs coverage for use-or-maintain context hasn't been updated.
Note what a new user / maintainer needs to know to work with this feature without asking directly.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the most confusing part of what was just built for someone who didn\'t write it? Add a comment or doc for that.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; didn't comment the most confusing parts."}
The most-confusing-part documentation hasn't been added.
Identify and add a comment / doc for that part.
{R4_CLOSE}`,
    },
    {
      option: 'Are there any decisions in what was just built that future-you would wonder about in six months? Document them now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Made decisions future-me will wonder about in 6 months without writing them down."}
Narrower: future-you decision-context capture.
Document the decisions that will be unclear later.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that needs a comment or note to explain why it works the way it does?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: anything needing a comment or note to explain why it works the way it does.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_OBSERVABILITY_CASUAL: DecisionContent = {
  question:      'Feature built — will you know when it breaks?',
  pinchFallback: 'No observability.',
  L1: [
    {
      option: 'Look at what was just built — if it breaks in production tonight, what would you see in your logs? If the answer is "not much", add logging for the key events: requests coming in, failures happening, anything that changed state.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built something but I haven't added any logging or monitoring yet."}
Production visibility for what was just built hasn't been set up.
Identify key events (requests, failures, state changes); add structured logs.
Still, before you add structured logs across the codebase you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Check what was just built for blind spots in production — what does it do that you currently can\'t see? Add logging or metrics for the things you\'d want to know about when something goes wrong.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; blind-spot list not made."}
The production blind-spot audit hasn't been done.
Spot what's invisible; add logs/metrics for diagnosable signals.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the first thing you\'d check if what was just built stopped working in production? Is that thing actually observable right now, or would you be flying blind?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; first-check observability not verified."}
The "first thing I'd check" observability path hasn't been verified.
Identify what I'd check first; confirm it's actually observable.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What would you see in your logs if what was just built failed in production right now? If not much, add logging for the key failure points.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built; failure-log coverage unclear."}
Lighter: what would I see in logs on failure? Add logging where missing.
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in what was just built that could break silently in production without triggering an alert or showing up in logs?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built; silent-fail audit not done."}
Narrower: silent-break paths with no alert/log trace.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'If what was just built broke in production, would you be able to detect it from logs or monitoring? What\'s missing?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built."}
Minimum next step: detection coverage from logs/monitoring; what's missing.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

const ABSENCE_COMPREHENSION_CASUAL: DecisionContent = {
  question:      'AI wrote it — do you actually get it?',
  pinchFallback: 'Comprehension check.',
  L1: [
    {
      option: 'Look at what was just built — is there any part you couldn\'t explain to someone else right now? Find the bit you\'re least confident about and trace through it until you actually understand what it does.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I went along with what was generated without fully understanding all the parts."}
The least-confident part of what was just built hasn't been traced through.
Find the bit I'm least confident about; trace through until I actually understand what it does. Don't rewrite — just trace.
{R4_CLOSE}`,
    },
    {
      option: 'Walk through what was just built and spot the parts you accepted because they looked right, not because you verified them. Pick the riskiest one and make sure you understand it properly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Accepted some parts of what was just built because they looked right, not because I verified them."}
The looked-right-without-verifying check hasn't been done.
Pick the riskiest accepted-without-verifying piece; trace its logic; confirm I actually get it.
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in what was just built that uses a library or approach you haven\'t used before? Make sure you understand what it does — not just that it works — before moving on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Used a library / approach I haven't used before in what was just built; only know that it works, not why."}
Comprehension of any unfamiliar library / approach used hasn't been verified.
Confirm what it does and why it fits — not just that it works. Don't broaden into other comprehension gaps.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the part of what was just built you\'re least confident you understand? Trace through it and make sure you get it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; not sure I understand every part."}
The least-confident-piece comprehension check hasn't been done.
Trace through that one piece; make sure I actually get it.
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in what was just built you accepted without really checking the logic? Flag it and go back through it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Took some parts as-is without really checking the logic."}
Narrower: accepted-without-checking-logic audit.
Flag the spot; go back through the logic now.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that you haven\'t fully understood and verified yourself?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: anything I haven't fully understood + verified myself.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_REFACTORING_CASUAL: DecisionContent = {
  question:      'Long build run — anything to clean up?',
  pinchFallback: 'Refactor check.',
  L1: [
    {
      option: 'Look at what was just built as a whole — is there anything that\'s gotten messy, duplicated, or harder to read than it needs to be? Flag the bits that would slow down the next person who touches this.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built a long stretch of code without checking for messy / duplicated / harder-than-it-needs-to-be parts."}
The messy / duplicated / harder-than-needs-to-be spot-check hasn't been done.
Flag the bits that would slow down the next person who touches this. List only.
{R4_CLOSE}`,
    },
    {
      option: 'Walk through what was just built and find the thing you\'d be embarrassed to show in a code review — the copy-pasted section, the function that does too much, the name that doesn\'t mean what it says anymore. Flag it and address it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it without surfacing the parts I'd be embarrassed to show in a code review."}
The embarrassing-in-code-review spot-check (copy-paste / too-many-responsibilities / misleading-name) hasn't been done.
Flag the one part; address it before moving on.
{R4_CLOSE}`,
    },
    {
      option: 'Check if what was just built fits cleanly with the rest of the codebase or if it\'s starting to diverge in style or structure. Flag anything that would make future changes harder than they need to be.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it without checking whether it fits cleanly with the rest of the codebase."}
The codebase-fit check (style / structure / divergence) hasn't been done.
Flag anything diverging that would make future changes harder. List only.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the messiest part of what was just built? Is it worth cleaning up now before it compounds?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; haven't found the messiest part."}
The messiest-part spot-check hasn't been done.
Identify it; decide whether to clean up now before compounding.
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in what was just built that\'s duplicated, overly complex, or inconsistent with the rest of the codebase?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; didn't audit for duplicated or overly-complex parts."}
Narrower: duplicated / overly-complex / inconsistent-with-codebase audit.
List the bits.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that should be cleaned up or simplified before moving on?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: anything to clean up or simplify before moving on.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_NO_PUSHBACK_CASUAL: DecisionContent = {
  question:      'AI keeps suggesting — are you actually evaluating?',
  pinchFallback: 'No pushback.',
  L1: [
    {
      option: 'Look at the recent responses that produced what was just built — is there anything you accepted without really thinking about whether it was the right call? Pick the one you\'re least sure about and push back on it now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Accepted recent suggestions without really pushing back on whether they were the right call."}
The pushback-on-recent-accepts audit hasn't been done.
Pick the suggestion I'm least sure about; push back on it now; see if it still holds up.
{R4_CLOSE}`,
    },
    {
      option: 'Check how you\'ve been accepting AI suggestions for this feature — have you been approving them because they look reasonable, or because you\'ve actually thought through the alternatives? Flag the ones where you\'re not sure.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Approving suggestions because they looked reasonable, not because I thought through alternatives."}
The looks-reasonable vs alternatives-actually-considered separation hasn't been audited.
Flag spots where I went on "looks reasonable" without checking alternatives. List only.
{R4_CLOSE}`,
    },
    {
      option: 'Take the most recent AI suggestion used in what was just built and challenge it: what assumptions did it make, what did it not consider, and is this actually the best way to do it for this project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Latest suggestion accepted without challenging its assumptions or fit for this project."}
The challenge-latest-suggestion review hasn't been done.
Take the most recent significant suggestion; surface assumptions it made; identify what it didn't consider; assess whether it's actually the best way to do it here.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the last AI output used in what was just built that you accepted without questioning it? Push back on it now and see if it holds up.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Accepted the last output without really questioning it."}
The last-output question-pushback hasn't been applied.
Push back on it now; check if it holds up.
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in what was just built where you accepted a recent suggestion because it sounded confident, not because you verified it yourself?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Accepted some output because it sounded confident, not because I verified it."}
Narrower: sounded-confident vs verified-right separation.
Identify the spot where confidence-plausibility replaced verification.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there any AI suggestion used in what was just built that you accepted without actually evaluating whether it was the right approach?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: any suggestion accepted without evaluating whether the approach was right.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_CORRECTION_SEEKING_CASUAL: DecisionContent = {
  question:      'Has the AI checked its own work?',
  pinchFallback: 'No verification.',
  L1: [
    {
      option: 'Take a second look at what was just built — not to explain it, but to actually critique it. What would you do differently, what assumptions did you make that might be wrong, and what are the riskiest parts?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; haven't taken a second look to critique it instead of just explain it."}
The second-look critique (different from re-explanation) hasn't been done.
Take a critical second look — what to do differently, which assumptions might be wrong, riskiest parts. Listing only.
{R4_CLOSE}`,
    },
    {
      option: 'Argue against your own output for what was just built: what\'s the case against this approach, what did you not consider, and what\'s the part you\'re least confident about?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; didn't argue against my own output."}
The argue-against-own-output critique hasn't been surfaced.
Case against the approach / what wasn't considered / least-confident part. Listing only.
{R4_CLOSE}`,
    },
    {
      option: 'If you had to find a bug or a flaw in what was just built, what would it be? Don\'t let yourself off the hook with "it looks fine."',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; gave myself the 'looks fine' pass without hunting for bugs or flaws."}
The find-a-bug-or-flaw hunt hasn't been done.
Force the question: if I had to find a bug or flaw, what would it be? Skip the "looks fine" out.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Review what was just built as if you hadn\'t written it — what would you flag or change?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; haven't reviewed it as if I didn't write it."}
The review-as-if-not-author pass hasn't been done.
List what to flag or change from that perspective.
{R4_CLOSE}`,
    },
    {
      option: 'Identify the weakest part of what was just built and explain what you\'re not sure about.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; haven't named the weakest part or what I'm unsure about."}
Narrower: weakest-part + uncertainty surface.
Identify the weakest part and explain what's unsure.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Identify the part of what was just built you\'re least confident is correct.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: the one part least confident is correct.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_PROBLEM_CORRECTION_CASUAL: DecisionContent = {
  question:      'Spotted a bug — did it actually get fixed?',
  pinchFallback: 'Bug unresolved.',
  L1: [
    {
      option: 'Go through what was just built and check: is there anything that was flagged as broken or wrong earlier in this session that hasn\'t actually been fixed yet? Don\'t let it get buried under new code.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Earlier in this session something was flagged as broken; not sure it actually got fixed."}
Outstanding issues from earlier may still be present.
Don't let them get buried under new code — confirm each is fixed or flag as still open.
{R4_CLOSE}`,
    },
    {
      option: 'Look at the known issues in what was just built — anything that came up as a bug or a problem in this session. Is each one fixed, or just acknowledged and skipped over?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Issues came up in this session; not sure all were fixed."}
The "fixed vs acknowledged-and-moved-on" status of session issues is unclear.
Per issue: fixed or skipped?
{R4_CLOSE}`,
    },
    {
      option: 'Run the tests for what was just built and check if any of the failures match issues that were mentioned earlier in this session. If yes, fix them before adding anything new.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Tests + earlier-issue cross-check not done."}
The test failures vs known earlier issues haven't been mapped.
Run the tests; for each failure, check if it matches a known issue.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that was identified as broken or wrong earlier in this session but hasn\'t been fixed yet?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Earlier issue flagged; status unclear."}
Lighter: anything flagged broken earlier and not yet fixed.
{R4_CLOSE}`,
    },
    {
      option: 'Run the tests for what was just built and check — are any of the failures from issues that were already noticed earlier and not resolved?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tests + earlier-issue match not checked."}
Narrower: run tests, check failures against earlier-noticed issues.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there any bug in what was just built that was noticed earlier in this session but not explicitly fixed?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Earlier issue noticed."}
Minimum next step: one bug noticed earlier and not explicitly fixed.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_ALTERNATIVES_CASUAL: DecisionContent = {
  question:      'Decision made — any alternatives looked at?',
  pinchFallback: 'No alternatives.',
  L1: [
    {
      option: 'Look at the biggest decision made in what was just built — is it the right call, or just the first thing that came to mind? Name one or two other ways it could have been done and explain why this approach beats them.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I made a big decision while building this without stopping to think about other ways to do it."}
Alternatives to the biggest decision haven't been weighed.
Name one or two other approaches; explain why the chosen one beats them. Don't redo the work yet.
{R4_CLOSE}`,
    },
    {
      option: 'Check the key choices made while building this feature: is there anything where you went with the first option without stopping to think if there was a better or simpler way? Flag those and evaluate them now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I picked the first option for some choices without stopping to consider alternatives."}
The first-option-without-thinking check hasn't been done across recent decisions.
Flag the spots; evaluate now whether a better or simpler way would have worked. List only.
{R4_CLOSE}`,
    },
    {
      option: 'Think about what was just built from the angle of a different developer on a different stack — what would they have done differently, and is the current approach actually the best fit for this project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Took my own approach without imagining how someone on a different stack would have built it."}
The outside-developer-perspective check hasn't been applied to the chosen approach.
Imagine what another dev would have done differently; confirm the current approach is actually the best fit. List only.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the most important technical choice in what was just built? Name the alternatives you didn\'t go with and confirm this is still the right call.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Made the key technical choice; didn't name what else I could have picked."}
Most-important-choice alternatives haven't been named.
Name the alternatives + confirm this is still the right call.
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in what was just built where a simpler or different approach would have worked just as well — or better?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it the way that came first; didn't check for simpler alternatives."}
Narrower: any-spot-where-simpler-approach-fits check.
List where a simpler or different approach would have worked just as well or better.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there any decision in what was just built that was made without really looking at other options first?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: any decision where I didn't look at other options first.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_ARCH_CONFLICT_CASUAL: DecisionContent = {
  question:      'Feature added — does it fit the codebase?',
  pinchFallback: 'Arch conflict.',
  L1: [
    {
      option: 'Look at what was just built and check if it fits with the rest of the codebase — does it follow the same patterns, or does it do things in a new way that the rest of the project doesn\'t? Flag anything that would make a future developer say "why is this one different?"',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built something new but haven't checked if it fits with how the rest of the codebase does things."}
Codebase consistency hasn't been checked.
Flag anything that'd make a future dev say "why is this one different?"
{R4_CLOSE}`,
    },
    {
      option: 'Check what was just built for places where it crosses boundaries it probably shouldn\'t, pulls in data in a way the rest of the codebase doesn\'t, or introduces a new pattern without a clear reason. Is it consistent, or is it starting to diverge?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; boundary-crossing / new-pattern issues not checked."}
The boundary-crossing / new-pattern audit hasn't been done.
Flag boundaries crossed without reason, off-pattern data access, new conventions without justification.
{R4_CLOSE}`,
    },
    {
      option: 'Compare what was just built to how the same kind of thing is done elsewhere in the project — same approach, or something different? If different, is there a good reason for it, or did it just happen that way?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; same-thing-done-differently-elsewhere comparison not done."}
The how-is-this-done-elsewhere comparison hasn't been done.
Same approach as similar code in the project? If different, was there a reason?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does what was just built follow the same patterns as the rest of the codebase, or does it introduce something new that might conflict with what\'s already there?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built; pattern match unclear."}
Lighter: does it follow the rest of the codebase or introduce something new?
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in what was just built that doesn\'t fit with the way the rest of the project is structured?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built; structural fit unclear."}
Narrower: anything that doesn't fit the project structure.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that doesn\'t match the patterns or structure of the existing codebase?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built."}
Minimum next step: anything that doesn't match existing patterns/structure.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_PROMPT_CONTEXT_CASUAL: DecisionContent = {
  question:      'Sending prompts — have you shared the spec?',
  pinchFallback: 'Missing context.',
  L1: [
    {
      option: 'Check the prompts used to build this feature — do you actually know what the spec says, what the architecture looks like, and what the task is supposed to achieve? If you\'ve just been getting ad hoc instructions, paste the relevant context in now so you\'re building the right thing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been following ad-hoc instructions without checking the full spec."}
The full-picture context hasn't been injected.
Paste relevant spec / arch / task into the conversation so I'm building the right thing.
{R4_CLOSE}`,
    },
    {
      option: 'Have you been working with the full picture, or just the last thing asked of you? If there\'s a spec, an architecture doc, or a task breakdown you haven\'t seen, let me know — then check that what was just built matches up once you have the full context.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Following individual prompts; full picture not in context."}
Whether I have the full picture or just the last thing asked hasn't been checked.
Tell me what's missing; once I have it, check the build matches.
{R4_CLOSE}`,
    },
    {
      option: 'Paste the relevant spec or task definition into the conversation and confirm that what was just built actually does what it\'s supposed to. If there\'s a mismatch, now is a better time to find it than after shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; spec-vs-build match not checked."}
The spec-vs-build match hasn't been confirmed.
Paste the relevant spec / task definition; confirm match. Finding mismatch now beats finding it after shipping.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Do you have enough context to build this feature correctly — have you seen the spec, the architecture, or the task breakdown? If not, share the relevant bits now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Recent prompts: ad-hoc."}
Lighter: enough context to build correctly, or missing pieces?
{R4_CLOSE}`,
    },
    {
      option: 'Paste the spec or the definition of done for this feature into the conversation and check whether what was just built actually matches it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; spec-match unverified."}
Narrower: paste spec / DoD; check build matches.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Do you know what the spec says for this feature, or have you been building without seeing it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Recent prompts: ad-hoc."}
Minimum next step: I know what the spec says, or I've been building without seeing it?
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_ROLLBACK_PLANNING_CASUAL: DecisionContent = {
  question:      'Shipping soon — what\'s the rollback plan?',
  pinchFallback: 'No rollback plan.',
  L1: [
    {
      option: 'Before you ship this feature, work out what you\'d do if the deployment goes wrong — what\'s the rollback plan, how long would it take, and is there anything in this feature that can\'t be undone cleanly?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I'm about to ship but I haven't worked out what to do if the deploy goes wrong."}
A rollback plan hasn't been worked out.
Define steps + time-to-revert + anything that can't be cleanly undone.
{R4_CLOSE}`,
    },
    {
      option: 'Walk through what would happen if you had to roll back this feature in production tonight — what steps would you follow, what could go wrong during the rollback, and is there anything left in an inconsistent state if you do?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Pre-ship; haven't walked through what a rollback would actually do."}
The rollback walkthrough hasn't been done.
Walk through: steps / what could go wrong / inconsistent-state risks.
{R4_CLOSE}`,
    },
    {
      option: 'Check the rollback risk in this feature — any database migrations, external integrations, or data changes that would be a pain to undo? Flag those before shipping and decide if you\'re okay with them.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Pre-ship; hard-to-undo pieces not flagged."}
The hard-to-undo audit hasn't been done.
Flag migrations / integrations / data changes; decide acceptance per item.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the rollback plan for this feature if the deployment goes sideways? Write it down — it should be something you could follow in a panic without thinking.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship; rollback plan not written."}
Lighter: write down the executable-in-panic rollback plan.
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in this feature that can\'t be rolled back cleanly? Know that before you ship.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship; clean-rollback check not done."}
Narrower: anything that can't roll back cleanly.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Do you have a plan for rolling back this feature if the deployment fails, or would you be making it up as you go?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship."}
Minimum next step: rollback plan documented or improvisational?
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

const ABSENCE_DEPLOYMENT_PLANNING_CASUAL: DecisionContent = {
  question:      'Shipping soon — is the deployment actually planned?',
  pinchFallback: 'No deploy plan.',
  L1: [
    {
      option: 'Before shipping this feature, check: do you actually have a deployment plan? What environment config does it need, what secrets need to be in place, and has anything been tested outside your local setup?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I'm about to ship but I haven't actually checked if there's a deployment plan."}
A deployment plan hasn't been confirmed.
Spot env config + secrets + outside-local testing status.
{R4_CLOSE}`,
    },
    {
      option: 'Walk through how this feature is actually going to get deployed — what\'s the process, what needs to be configured in the production environment, and is there anything that only exists in your local config that hasn\'t been provisioned yet?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Pre-ship; deploy-process walkthrough not done."}
The deployment process walkthrough hasn't been done.
Walk through process / prod env requirements / local-only-not-provisioned gaps.
{R4_CLOSE}`,
    },
    {
      option: 'Check the gap between where this feature runs now and what production actually needs — are there environment variables, secrets, or infrastructure pieces that aren\'t set up yet? Sort those out before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Pre-ship; local-to-prod gap not enumerated."}
The local-to-prod gap hasn't been enumerated.
Spot env vars / secrets / infra missing in prod; resolve each.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What does the production environment need to have in place before this feature can deploy cleanly? Confirm each of those is actually ready.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship; prod-readiness items not confirmed."}
Lighter: prod prerequisites — confirm each.
{R4_CLOSE}`,
    },
    {
      option: 'Has this feature been tested anywhere other than your local machine? If it goes straight to production, what are you not sure about?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship; only-local-tested risk unclear."}
Narrower: tested outside local? If straight-to-prod, accepted risks.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there a deployment plan for this feature, or are you planning to figure it out when you push?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship."}
Minimum next step: deploy plan exists, or figure-it-out-at-push?
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

const ABSENCE_DEPENDENCY_MGMT_CASUAL: DecisionContent = {
  question:      'Added packages — any issues checked?',
  pinchFallback: 'Dependency risk.',
  L1: [
    {
      option: 'Check the packages added in what was just built — do they conflict with anything already installed, is there a security issue with the version you picked, and is there a better or more popular alternative you didn\'t consider?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I installed some packages but I haven't checked them for issues."}
New packages haven't been checked.
Conflicts / security issues / better alternatives.
{R4_CLOSE}`,
    },
    {
      option: 'Look at the new dependencies in what was just built: are they actively maintained, is the version you\'re using the latest stable one, and do they pull in anything that clashes with what\'s already in the project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Packages added; maintenance/version/clash check not done."}
The maintenance + version + transitive-clash check hasn't been done.
Spot unmaintained / outdated / clashing pulled-in deps.
{R4_CLOSE}`,
    },
    {
      option: 'Run a quick audit on the packages added in what was just built — any known CVEs in the version you\'re using, licence issues that could cause problems, or extra packages they pull in that don\'t play nice with what\'s already there?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Packages added; CVE/licence/transitive audit not done."}
The quick audit hasn't been run.
Run it; spot CVEs / licence issues / nasty transitive pulls.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Have the packages added in what was just built been checked for conflicts and vulnerabilities? Run a dependency audit and flag anything suspicious.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Packages added; audit not run."}
Lighter: run audit, flag suspicious results.
{R4_CLOSE}`,
    },
    {
      option: 'Is there any package added in what was just built that looks risky — old version, no maintenance, licence mismatch, or something that clashes with existing dependencies?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Packages added; risk spot-check not done."}
Narrower: any risky package — old / unmaintained / licence-mismatched / clashing.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Have the new packages added in what was just built been checked for conflicts, vulnerabilities, or licence issues?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Packages added."}
Minimum next step: conflicts / vulnerabilities / licence issues on new packages.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

const ABSENCE_PHASE_TRANSITION_CASUAL: DecisionContent = {
  question:      'Been in this phase a while — what comes next?',
  pinchFallback: 'Phase check.',
  L1: [
    {
      option: 'Step back from this project and think about where you are in the overall flow — have you actually finished this phase, or have you just been in it for a while? What needs to be done before it makes sense to move on?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been in this phase a while; I haven't checked whether I've actually finished it."}
The finished-vs-just-been-in-it check hasn't been done for this phase.
Step back; name what's left before moving on.
{R4_CLOSE}`,
    },
    {
      option: 'Look at what you set out to accomplish in this phase of this project — is it done, partially done, or have you moved past it without properly closing it off? Figure out where you actually are before starting something new.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long phase; original-objectives check not done."}
The done-vs-partially-done-vs-skipped check on this phase hasn't been done.
Figure out where you actually are before starting something new.
{R4_CLOSE}`,
    },
    {
      option: 'Check what you set out to finish before moving on from this phase of this project — what\'s actually done, what\'s been skipped or deferred? Make a call on whether you\'re ready to transition.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long phase; transition-readiness call not made."}
The transition-readiness call hasn't been made.
What's done / skipped / deferred — then call: ready or not.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything left unfinished in the current phase of this project that should be sorted before you move on to the next one?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long phase."}
Lighter: anything unfinished in the current phase to sort before moving on.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the next phase for this project, and what needs to be in place before you can properly start it? Are those things ready?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long phase; next-phase prereqs not checked."}
Narrower: next phase + prereqs + ready-state.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is this project actually ready to move to the next phase, or has it just been in the current phase for a long time without a clear exit point?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long phase."}
Minimum next step: ready or just been-here-a-while?
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_SPEC_CROSS_CONFIRM_CASUAL: DecisionContent = {
  question:      'Spec exists — has it been checked against the plan?',
  pinchFallback: 'Spec not confirmed.',
  L1: [
    {
      option: 'Go through this project\'s spec and check it against the original plan — does every requirement actually come from something that was agreed on, or did some assumptions sneak in that no one has explicitly signed off on?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've drafted a spec but I haven't checked it against what was originally agreed on."}
The spec-vs-original-agreement check hasn't been done.
Spot assumptions that sneaked in without explicit sign-off.
{R4_CLOSE}`,
    },
    {
      option: 'Look at this project\'s spec for anything that\'s vague enough to be interpreted two different ways — anything that could lead to building the wrong thing and still technically meeting the spec. Fix those before coding starts.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Spec drafted; ambiguity check not done."}
The ambiguity-can-cause-divergent-builds check hasn't been done.
Spot anything two devs could implement differently and both technically meet spec.
{R4_CLOSE}`,
    },
    {
      option: 'Check this project\'s spec against what you can actually build with the current stack — is there anything in there that\'s going to hit a wall when someone tries to implement it? Flag those now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Spec drafted; stack-feasibility not verified."}
Whether the spec is buildable on the current stack hasn't been checked.
Flag anything that'll hit a wall during implementation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there any part of this project\'s spec that came from an assumption rather than something explicitly agreed on? Track those down and confirm them.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Spec drafted; assumption-vs-agreed not separated."}
Lighter: any assumption in the spec vs explicitly-agreed requirements.
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in this project\'s spec vague enough that two people could implement it differently? Clarify it now before it causes a disagreement mid-build.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Spec drafted; ambiguity unresolved."}
Narrower: anything vague enough to cause a mid-build disagreement.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in this project\'s spec that hasn\'t been verified against what was actually agreed on — any assumptions that are being treated as confirmed requirements?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Spec drafted."}
Minimum next step: any unconfirmed assumption being treated as requirement.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_SPEC_REVISION_CASUAL: DecisionContent = {
  question:      'Spec written — has it been updated since the first draft?',
  pinchFallback: 'Spec unrevised.',
  L1: [
    {
      option: 'Update this project\'s spec to match what you know now — any requirements that turned out harder or simpler than expected, any edge cases that came up during building, and any things that got quietly dropped or changed in scope.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been building from the spec but the spec hasn't been updated since the first draft."}
The spec hasn't been refreshed to match what's been learned.
Update requirements that turned out harder/easier, add edge cases discovered, remove silently-dropped scope.
{R4_CLOSE}`,
    },
    {
      option: 'Check whether this project\'s spec still matches what\'s actually being built — where have things changed since the first draft, what decisions got made during implementation that aren\'t written down, and what would a new developer get wrong by reading the original spec?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Spec present; build has diverged from it."}
Whether the spec still matches the build hasn't been checked.
Where have they diverged? What decisions got made that aren't in the doc? What would a new dev get wrong from the original spec?
{R4_CLOSE}`,
    },
    {
      option: 'Look at where this project\'s spec and the actual implementation have drifted apart — for each gap, is it that the spec needs updating, or that the implementation went in the wrong direction?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Spec + impl drift; resolution direction not chosen per gap."}
Per drift: spec needs updating OR impl went wrong direction?
Decide per case.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is this project\'s spec still accurate, or has the implementation moved on from what was originally written? Update the parts that no longer match.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Spec present; current-accuracy not checked."}
Lighter: is the spec still accurate, or has the impl moved on?
{R4_CLOSE}`,
    },
    {
      option: 'What\'s changed in this project since the spec was first written that isn\'t reflected in the spec yet? Update it now while the context is still fresh.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Spec present; recent changes not reflected."}
Narrower: what's changed since the spec was first written and isn't in there?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Does this project\'s spec still reflect what\'s actually being built, or has the implementation moved on without the spec being updated?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Spec present."}
Minimum next step: does the spec still reflect the actual build?
{R4_CLOSE}`,
    },
  ],
};

// ── Sub-4 — idea / task_breakdown / feedback_loop ─────────────────────────────

// Group A — idea signals

const ABSENCE_IDEA_SCOPING: DecisionContent = {
  question:      'Idea in mind — is the scope defined?',
  pinchFallback: 'Scope undefined.',
  L1: [
    {
      option: 'Define the scope of this project precisely: what is the core problem it solves, what are the primary capabilities it must deliver, and what does a complete first version look like?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Idea forming; scope not yet defined."}
The scope of this project hasn't been defined — what it is, what problem it solves, and what the first version includes are still implicit.
Define: core problem / primary capabilities / what a complete first version looks like.
{R4_CLOSE}`,
    },
    {
      option: 'Write a scope statement for this project: describe the problem in one sentence, the solution in one paragraph, and draw an explicit boundary around what is and is not included in the initial version.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Idea forming; scope statement not written."}
The scope statement hasn't been written.
Problem in one sentence / solution in one paragraph / explicit boundary on initial-version contents.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm the project scope: summarize in your own words what this project is, what problem it solves, and what \'built\' means for this project — then flag what is still ambiguous or undefined.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Idea forming; scope cross-confirm not done."}
Scope cross-confirmation hasn't been done.
Summarize: what / what problem / what 'built' means — flag ambiguous.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Summarize the scope of this project in three sentences: the problem, the core solution, and the boundary of the first version.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea forming."}
Lighter: 3-sentence scope — problem / solution / boundary.
{R4_CLOSE}`,
    },
    {
      option: 'What is the single most important thing to define about this project before building starts? Articulate it precisely.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea forming; key-anchor not pinned."}
Narrower: single most important thing to define before building.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is this project, what problem does it solve, and what will the first version include?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea forming."}
Minimum next step: what / problem / first version contents.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_IDEA_SCOPING_CASUAL: DecisionContent = {
  question:      'Idea forming — what exactly are we building?',
  pinchFallback: 'Scope unclear.',
  L1: [
    {
      option: 'Walk me through this project — what\'s the main idea, what problem does it solve, and what\'s in vs out for the first version?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I have an idea but I haven't walked through what's actually in vs out."}
The walk-through of main idea / problem / in vs out hasn't been done.
Main idea / problem / in-vs-out for v1.
{R4_CLOSE}`,
    },
    {
      option: 'What exactly are we building here? Describe this project in your own words — what it does, why it exists, and where the line is on what\'s included first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; haven't put it in plain words."}
The plain-words description hasn't been done.
What it does / why it exists / where v1's line is.
{R4_CLOSE}`,
    },
    {
      option: 'Summarize this project back to me in your own words — what it does, what problem it solves, and what \'done\' looks like. Flag anything that still feels fuzzy.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; summary back to me not done."}
The summary-back-to-me hasn't been done.
Summarize: what / problem / what done looks like + flag fuzzy.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s this project and what\'s it supposed to do for the first version? Give me the short version.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Lighter: short version — what + v1 contents.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the most important thing to pin down about this project before we start building?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming; key-anchor not pinned."}
Narrower: most important thing to pin down before building.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is this project and what will it do?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Minimum next step: what + what it does.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_IDEA_CONSTRAINT_CHECK: DecisionContent = {
  question:      'Idea scoped — are the non-goals defined?',
  pinchFallback: 'Non-goals missing.',
  L1: [
    {
      option: 'Define the constraints and non-goals for this project: what is explicitly out of scope for the first version, what functionality will not be built, and what technical constraints limit the solution space?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Idea scoped; non-goals not defined."}
Non-goals and constraints for this project haven't been stated — without explicit boundaries, scope creeps during implementation.
Define: out-of-scope / functionality-not-built / technical constraints.
{R4_CLOSE}`,
    },
    {
      option: 'Identify the boundary conditions of this project: what adjacent problems will not be solved, what user requests will be deferred, and what are the explicit constraints on scope, technology, or resources?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Idea scoped; boundary conditions not identified."}
Boundary conditions haven't been identified.
Adjacent problems not solved / user requests deferred / explicit scope/tech/resource constraints.
{R4_CLOSE}`,
    },
    {
      option: 'Write the non-goals section for this project: list at least three things this project will not do, at least one technical constraint, and at least one explicit decision to defer for a future version.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Idea scoped; non-goals section not written."}
The non-goals section hasn't been written.
List: 3+ things not done / 1+ technical constraint / 1+ explicit defer-to-future decision.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What are the top three things this project will not do in the first version? Document them explicitly so they do not creep in during implementation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea scoped."}
Lighter: top 3 will-not-do for v1.
{R4_CLOSE}`,
    },
    {
      option: 'What is the clearest out-of-scope decision for this project? State it as an explicit non-goal.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea scoped."}
Narrower: clearest out-of-scope decision as explicit non-goal.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is one thing this project will not do, and why is that boundary important to state now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea scoped."}
Minimum next step: one will-not-do + why-now.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_IDEA_CONSTRAINT_CHECK_CASUAL: DecisionContent = {
  question:      'Idea forming — what\'s out of scope?',
  pinchFallback: 'No non-goals set.',
  L1: [
    {
      option: 'What are we NOT building in the first version of this project? Walk me through what\'s intentionally out of scope — things that could be asked for but we\'re not doing yet.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; haven't said out loud what we're NOT doing."}
The not-building list for v1 hasn't been called out.
Walk through what's intentionally out of scope — could-be-asked-for but not-doing-yet.
{R4_CLOSE}`,
    },
    {
      option: 'What are the constraints on this project? What won\'t it do, what can\'t it do, and what have we decided to skip for now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; constraints not stated."}
The constraints haven't been stated.
Won't do / can't do / decided to skip for now.
{R4_CLOSE}`,
    },
    {
      option: 'List the things this project will not do — at least three things that could be asked for but are deliberately left out. Then tell me which one is most likely to cause confusion if it\'s not stated clearly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; will-not-do list not made."}
The will-not-do list hasn't been made.
List 3+ deliberate omissions / flag the one most likely to confuse if unsaid.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s one thing this project won\'t do — something someone might expect it to do but we\'re leaving out? State it clearly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Lighter: one won't-do — expected-but-leaving-out.
{R4_CLOSE}`,
    },
    {
      option: 'What are we keeping out of this project on purpose? Give me the short list.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Narrower: short list of intentional omissions.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Name one thing this project will not do that should be stated clearly before we start building.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Minimum next step: one will-not-do to state clearly before building.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_IDEA_USER_DEFINITION: DecisionContent = {
  question:      'Idea scoped — is the target user defined?',
  pinchFallback: 'Target user undefined.',
  L1: [
    {
      option: 'Define the target user for this project precisely: who is the primary user, what is their context and skill level, what problem do they have that this project solves, and what does success look like from their perspective?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Idea scoped; target user not defined."}
The target user for this project hasn't been defined — without a primary-user anchor, design decisions drift on assumptions.
Define: primary user / context+skill / problem they have / success from their perspective.
{R4_CLOSE}`,
    },
    {
      option: 'Write a target user profile for this project: describe who will use it, what they are trying to accomplish, what they already know and do not know, and how this project fits into their workflow.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Idea scoped; user profile not written."}
The target user profile hasn't been written.
Who / accomplishing what / knows-doesn't-know / fits-into-workflow.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm the target user definition for this project: given what has been described, who is this project for, who is explicitly not the target user, and what does that boundary imply for the feature set?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Idea scoped; user cross-confirm not done."}
Target-user cross-confirmation hasn't been done.
Who it's for / who it's not for / feature-set implications of the boundary.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Who is the primary user of this project and what are they trying to accomplish? Define them precisely enough that you could make a product decision on their behalf.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea scoped."}
Lighter: primary user + what they accomplish — decision-on-their-behalf-precise.
{R4_CLOSE}`,
    },
    {
      option: 'What does the target user of this project already know and not know? That context will drive every design decision.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea scoped."}
Narrower: known-vs-unknown context that drives design decisions.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Who is this project for, and what are they trying to do?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Idea scoped."}
Minimum next step: who + what they're trying to do.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_IDEA_USER_DEFINITION_CASUAL: DecisionContent = {
  question:      'Idea forming — who is this actually for?',
  pinchFallback: 'User not defined.',
  L1: [
    {
      option: 'Who is this project for? Walk me through who the main user is, what they\'re trying to do, and what they know going in — be specific enough that we could make decisions about this project on their behalf.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; haven't pinned down who this is for."}
The who-this-is-for walk-through hasn't been done.
Main user / what they're trying / what they know — specific enough for on-their-behalf decisions.
{R4_CLOSE}`,
    },
    {
      option: 'Describe the person who\'ll use this project — who they are, what they want to do with it, and what level of experience they have. Then tell me who it\'s definitely NOT for.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; user persona + non-user not described."}
The user-and-non-user description hasn't been done.
Who they are / want / experience-level / who it's NOT for.
{R4_CLOSE}`,
    },
    {
      option: 'Think about the person using this project — who are they? Describe them to me, including what problem they have and how this project fits into what they\'re already doing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; user-in-context not described."}
The user-in-context description hasn't been done.
Who / problem / how this fits into what they already do.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Who\'s the main person this project is for? Give me enough detail that we could make a feature decision based on what they need.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Lighter: main user with feature-decision-grade detail.
{R4_CLOSE}`,
    },
    {
      option: 'What does the person using this project actually want to do with it? Describe them simply.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Narrower: what they want to do with it — simply.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Who is this project for and what are they trying to do?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Minimum next step: who + what they're trying to do.
{R4_CLOSE}`,
    },
  ],
};

// Group B — task_breakdown signals

const ABSENCE_TASK_ORDERING: DecisionContent = {
  question:      'Tasks listed — have they been ordered?',
  pinchFallback: 'Tasks unordered.',
  L1: [
    {
      option: 'Order the tasks for this project by dependency and priority: identify which tasks block others, which can be done in parallel, and establish the sequence that minimises rework and delivers the earliest working state.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Tasks listed; not ordered."}
The task list hasn't been ordered by dependency and priority — work risks proceeding on tasks that block later progress or invite rework.
Order: blocking / parallel-eligible / sequence-minimising-rework / earliest-working-state.
{R4_CLOSE}`,
    },
    {
      option: 'Review the task list for this project and establish an explicit order: which task must be done first, which tasks have hard dependencies on others, and what is the critical path to a testable first version?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Tasks listed; explicit order not established."}
The explicit task order hasn't been established.
First task / hard dependencies / critical path to testable v1.
{R4_CLOSE}`,
    },
    {
      option: 'Prioritize the task list for this project: rank tasks by impact and dependency, identify the single highest-priority task to start with, and flag any tasks that should be deferred until a working core is established.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Tasks listed; prioritisation not done."}
Task prioritisation hasn't been done.
Rank by impact/dependency / single highest-priority start / defer-until-core-works items.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the correct order of tasks for this project? Identify the first three tasks in sequence and explain why each one must come before the next.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Tasks listed."}
Lighter: first 3 tasks in sequence + why-before-next.
{R4_CLOSE}`,
    },
    {
      option: 'Which task in this project should be done first, and why? Establish the top of the ordered list before anything else starts.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Tasks listed."}
Narrower: first task + why — top of the list before anything else.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is the first task to work on for this project, and what does it unblock?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Tasks listed."}
Minimum next step: first task + what it unblocks.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_TASK_ORDERING_CASUAL: DecisionContent = {
  question:      'Tasks listed — what order do we do them in?',
  pinchFallback: 'No order set.',
  L1: [
    {
      option: 'Put the tasks for this project in order — which ones have to happen before others, which ones are independent, and what\'s the sequence that gets us to something working as fast as possible?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've got a task list but haven't put it in order."}
The task ordering hasn't been done.
Which before which / independent ones / sequence to fastest-working-state.
{R4_CLOSE}`,
    },
    {
      option: 'Look at the task list for this project and sort it — what comes first, what depends on what, and what\'s the critical path to something we can actually test?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Task list unsorted."}
Sorting the task list hasn't been done.
First / dependencies / critical path to testable.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the right order to tackle the tasks for this project? Rank them by what\'s blocking what, and tell me which task to start with and why.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Task list unsorted; blocker analysis not done."}
The blocker-rank and start-task hasn't been called out.
Rank by what blocks what / start-task + why.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What are the first three tasks for this project in order? Tell me what order makes sense and why.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Task list unsorted."}
Lighter: first 3 tasks + why-this-order.
{R4_CLOSE}`,
    },
    {
      option: 'Which task should we do first for this project and why does it come before everything else?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Task list unsorted."}
Narrower: first task + why-it-comes-before-everything-else.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s the first task to work on for this project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Task list unsorted."}
Minimum next step: first task.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_TASK_SIZING: DecisionContent = {
  question:      'Tasks defined — are they scoped to single sessions?',
  pinchFallback: 'Tasks oversized.',
  L1: [
    {
      option: 'Review the task list for this project and validate sizing: each task should be completable in a single focused session. Identify any tasks that span multiple concerns, require too many unknowns to resolve in one sitting, or are so large that progress cannot be verified at the end of a session.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Tasks defined; sizing not validated."}
Tasks haven't been sized to single-session scope — oversized tasks cannot be verified done in one focused sitting.
Identify: spans-multiple-concerns / too-many-unknowns / too-large-to-verify-at-session-end.
{R4_CLOSE}`,
    },
    {
      option: 'Break down any oversized tasks in this project: for each task that could not be completed in a single session, decompose it into subtasks — each subtask should have a clear output that can be verified when done.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Oversized tasks not decomposed."}
Oversized task decomposition hasn't been done.
Decompose: per oversized task → subtasks with clear-and-verifiable outputs.
{R4_CLOSE}`,
    },
    {
      option: 'Assess the scope of each task for this project: flag any that are too large to complete in one session, too vague to know when they\'re done, or dependent on so many unknowns that work could not proceed without stopping midway.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Task scope assessment not done."}
The per-task scope assessment hasn't been done.
Flag: too-large / too-vague / too-many-unknowns-to-proceed.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Which tasks in this project are too large to finish in a single session? Break the largest one down into smaller units now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Tasks defined."}
Lighter: too-large tasks + break-down-largest-now.
{R4_CLOSE}`,
    },
    {
      option: 'Is there any task in this project that could not be completed in a single focused session? Identify it and propose how to split it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Tasks defined."}
Narrower: any not-single-session task + split proposal.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Identify any task in this project that is too large to finish in a single session and break it into smaller units.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Tasks defined."}
Minimum next step: identify too-large + break it.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_TASK_SIZING_CASUAL: DecisionContent = {
  question:      'Tasks listed — are they small enough to do in one go?',
  pinchFallback: 'Tasks too big.',
  L1: [
    {
      option: 'Go through the tasks for this project — are any of them too big to finish in one session? If so, break them down into smaller pieces that each have a clear endpoint.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Tasks listed; haven't checked if any are too big."}
The too-big check hasn't been done.
Go through; break too-big ones into smaller-clear-endpoint pieces.
{R4_CLOSE}`,
    },
    {
      option: 'Check the task list for this project: which tasks are small enough to finish in one focused session, and which ones are really multiple tasks lumped together? Split the big ones.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Task sizing not checked."}
The single-session-vs-lumped check hasn't been done.
Single-session-sized vs really-multiple — split the big.
{R4_CLOSE}`,
    },
    {
      option: 'Is any task in this project too big to do in one go? Walk me through the tasks and flag anything that would require stopping midway because there\'s too much or too many unknowns.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Task sizing not checked."}
Mid-session-stop risk hasn't been flagged.
Walk through; flag anything requiring midway-stop — too-much or too-many-unknowns.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Which task in this project feels the biggest? Break it down into two or three smaller tasks that could each be finished in one session.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks listed."}
Lighter: biggest task + break into 2-3 single-session pieces.
{R4_CLOSE}`,
    },
    {
      option: 'Are the tasks for this project small enough to finish one at a time, or do any of them need to be split up?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks listed."}
Narrower: small-enough vs need-splitting.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there any task in this project that\'s too big to do in one session?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks listed."}
Minimum next step: any task too big for one session?
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_TASK_DEFINITION_OF_DONE: DecisionContent = {
  question:      'Tasks ordered — does each task have a definition of done?',
  pinchFallback: 'No done criteria.',
  L1: [
    {
      option: 'Define the completion criteria for each task in this project: for every task, state what must be true for the task to be considered complete — what output exists, what has been verified, and what has not been left in an ambiguous or partially done state.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Tasks ordered; DoD not defined per task."}
Definition of Done hasn't been written per task — without explicit completion criteria, 'done' is ambiguous and verification cannot anchor.
Per task: output exists / verified / nothing left ambiguous or partially-done.
{R4_CLOSE}`,
    },
    {
      option: 'Audit the task list for this project for missing definitions of done: identify every task that lacks explicit completion criteria, then define what \'done\' means for each — the specific, verifiable condition that ends work on that task.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "DoD audit not done."}
The DoD-missing audit hasn't been done.
Identify DoD-lacking tasks / define per task: specific verifiable end-condition.
{R4_CLOSE}`,
    },
    {
      option: 'Write the definition of done for the highest-priority task in this project: what is the exact state of the codebase, tests, and documentation when this task is complete? Use that as a template to define done for the remaining tasks in this project.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "DoD not written for highest-priority task."}
The highest-priority-task DoD hasn't been written.
Codebase + tests + docs state when complete — use as template for the rest.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'For each task in this project, write one sentence stating what \'done\' looks like — a specific, verifiable condition, not a vague description of intent.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Tasks defined."}
Lighter: per-task one-sentence DoD — verifiable, not vague.
{R4_CLOSE}`,
    },
    {
      option: 'Which task in this project is missing the clearest definition of done? Define what completion looks like for that task before it starts.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Tasks defined."}
Narrower: DoD-clearest-missing task + define before-start.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Does every task in this project have a clear, verifiable definition of done, or are any tasks missing that?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Tasks defined."}
Minimum next step: every task has DoD or any missing?
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_TASK_DEFINITION_OF_DONE_CASUAL: DecisionContent = {
  question:      'Tasks set — how do we know when each one\'s done?',
  pinchFallback: 'Done criteria missing.',
  L1: [
    {
      option: 'For each task in this project, define what done looks like — not just \'it works\' but what specifically is true when the task is finished. What can be checked? What exists that didn\'t before?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Tasks listed; haven't pinned down what 'done' actually means per task."}
The per-task DoD hasn't been pinned down.
Per task: not 'it works' but what-specifically-true / what-can-be-checked / what-exists-that-didn't.
{R4_CLOSE}`,
    },
    {
      option: 'Go through the tasks for this project and for each one, write what \'done\' means — the specific thing you\'d check to know it\'s complete. No vague descriptions, just the actual finish line.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "DoD per task not written."}
The DoD-per-task walkthrough hasn't been done.
Specific thing-to-check per task — actual finish line, not vague.
{R4_CLOSE}`,
    },
    {
      option: 'Pick the most important task for this project and tell me exactly what done looks like for it — what\'s been built, what\'s been tested, what\'s been verified. Use that as a template to define done for the remaining tasks in this project.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "DoD not pinned for most important task."}
The most-important-task DoD hasn't been pinned.
Built / tested / verified — use as template for remaining.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What does done look like for each task in this project? Write a one-liner for each that describes the specific finish line.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks listed."}
Lighter: per-task one-liner finish line.
{R4_CLOSE}`,
    },
    {
      option: 'Is there any task in this project where it\'s not clear how we\'d know it\'s done? Define the finish line for that one first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks listed."}
Narrower: DoD-unclear task + define-first.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'How do we know when the first task in this project is done?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks listed."}
Minimum next step: how to know first task is done.
{R4_CLOSE}`,
    },
  ],
};

// Group C — feedback_loop signals

const ABSENCE_USER_FEEDBACK_REVIEW: DecisionContent = {
  question:      'Feedback received — has it been reviewed systematically?',
  pinchFallback: 'Feedback not reviewed.',
  L1: [
    {
      option: 'Review the feedback received for this project systematically: collect all available feedback, categorize it by theme or feature area, and identify the recurring complaints, requests, and points of confusion that appear across multiple users.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feedback received; not reviewed systematically."}
User feedback hasn't been reviewed systematically — recurring complaints, blockers, and pattern signals risk being missed without categorisation.
Collect / categorise by theme/feature / surface recurring complaints / requests / confusion points.
{R4_CLOSE}`,
    },
    {
      option: 'Analyze the feedback for this project for patterns: what issues surface most frequently, which complaints indicate users cannot complete their primary goal, and where does actual behavior diverge most from what was expected?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Pattern analysis on feedback not done."}
Feedback pattern analysis hasn't been done.
Most-frequent issues / cannot-complete-primary-goal complaints / behavior-vs-expected divergence.
{R4_CLOSE}`,
    },
    {
      option: 'Prioritize the feedback for this project by impact: distinguish critical feedback (blocking users from their goal) from high-friction feedback (users struggle but succeed) from low-signal noise, and establish which issues demand immediate action.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Impact prioritisation on feedback not done."}
The impact prioritisation of feedback hasn't been done.
Distinguish: critical (blocking) / high-friction (succeed-with-pain) / low-signal noise.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the most critical piece of feedback for this project — the one issue that, if left unaddressed, blocks users from achieving their primary goal?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feedback in."}
Lighter: most critical feedback — primary-goal blocker.
{R4_CLOSE}`,
    },
    {
      option: 'What are the top two or three recurring themes across all feedback for this project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feedback in."}
Narrower: top 2-3 recurring themes.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What are users saying about this project, and what is the most critical issue in the feedback?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feedback in."}
Minimum next step: what users say + most critical issue.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_USER_FEEDBACK_REVIEW_CASUAL: DecisionContent = {
  question:      'Feedback in — have we actually gone through it?',
  pinchFallback: 'Feedback not reviewed.',
  L1: [
    {
      option: 'Go through the feedback for this project — collect what users have said, group it by theme, and tell me what comes up over and over. What are the most common complaints or requests?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feedback in; I haven't actually gone through it systematically."}
The systematic walk-through of feedback hasn't been done.
Collect / group by theme / surface common complaints+requests.
{R4_CLOSE}`,
    },
    {
      option: 'What patterns are you seeing in the feedback for this project? Walk me through what users are saying — what are the recurring issues, and where are people getting stuck?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feedback patterns not surfaced."}
Feedback-pattern walk-through hasn't been done.
Recurring issues / where people get stuck.
{R4_CLOSE}`,
    },
    {
      option: 'Look at the feedback for this project and rank it — what\'s critical (users can\'t do what they need to do), what\'s high friction (they get there but it\'s painful), and what\'s just noise? Tell me what needs to be fixed first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feedback ranking not done."}
The feedback ranking hasn't been done.
Critical / high-friction / noise — fix-first call.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the most critical piece of feedback for this project — the one thing that, if we don\'t fix it, blocks users from doing what they came here to do?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feedback in."}
Lighter: most critical feedback — the blocker if unfixed.
{R4_CLOSE}`,
    },
    {
      option: 'What are the top two or three things users keep saying about this project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feedback in."}
Narrower: top 2-3 things users keep saying.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What are users saying about this project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feedback in."}
Minimum next step: what users are saying.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_ITERATION_PLANNING: DecisionContent = {
  question:      'Feedback reviewed — has the next iteration been planned?',
  pinchFallback: 'Next iteration unplanned.',
  L1: [
    {
      option: 'Define the priorities for the next iteration of this project based on the feedback: rank the issues identified, determine what must be addressed in this iteration versus what can be deferred, and establish the scope of the next version.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feedback reviewed; next iteration not planned."}
The next iteration hasn't been planned from feedback — without prioritised changes and success criteria, the next round risks repeating prior gaps.
Rank feedback / this-iteration vs deferred / scope of next version.
{R4_CLOSE}`,
    },
    {
      option: 'Identify the trade-offs for the next iteration of this project: which feedback-driven changes deliver the highest impact for the lowest effort, which require significant rework, and what should be deferred to preserve shipping velocity?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Iteration trade-offs not identified."}
Iteration trade-offs haven't been identified.
Highest impact/lowest effort / significant rework / defer-to-preserve-velocity.
{R4_CLOSE}`,
    },
    {
      option: 'Write the success criteria for the next iteration of this project: given the feedback received, what specific, measurable outcomes would confirm the next iteration resolved the most critical user issues?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Iteration success criteria not written."}
Iteration success criteria haven't been written.
Specific measurable outcomes confirming the most critical issues are resolved.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What are the top three changes to make in the next iteration of this project, ordered by priority? Identify them from the feedback.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feedback reviewed."}
Lighter: top 3 next-iteration changes — feedback-derived, priority-ordered.
{R4_CLOSE}`,
    },
    {
      option: 'What is the single most important thing to build or fix in the next iteration of this project, and why does it take priority over everything else?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feedback reviewed."}
Narrower: single most important next-iteration item + why-priority.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is the first change to make in the next iteration of this project based on what users said?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feedback reviewed."}
Minimum next step: first feedback-derived change.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_ITERATION_PLANNING_CASUAL: DecisionContent = {
  question:      'Feedback reviewed — what are we building next?',
  pinchFallback: 'Next iteration unplanned.',
  L1: [
    {
      option: 'Figure out what to build next for this project based on the feedback — what needs to be fixed or added in the next round, what can wait, and what\'s the scope of the next version?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feedback reviewed; what to build next is not pinned."}
The next-round build pinning hasn't been done.
What to fix/add next / what can wait / scope of next version.
{R4_CLOSE}`,
    },
    {
      option: 'Look at the feedback for this project and tell me what the trade-offs are for the next round — what\'s high impact and quick to do, what\'s a big change that needs more thought, and what should we hold off on?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Next-round trade-offs not surfaced."}
Next-round trade-off analysis hasn't been done.
High-impact-quick / big-change-needs-thought / hold-off items.
{R4_CLOSE}`,
    },
    {
      option: 'What does success look like for the next version of this project? Given what users said, what specific things would tell us the next iteration actually fixed the problems?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Next-version success criteria unclear."}
The next-version success-criteria sketch hasn't been done.
Specific things that would tell us the next iteration actually fixed the problems.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What are the top three things to work on next for this project based on the feedback? Put them in priority order.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feedback reviewed."}
Lighter: top 3 next-items priority-ordered.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the single most important thing to fix or build next for this project, and why does it come first?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feedback reviewed."}
Narrower: single most important next + why-first.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s the first thing to build or fix in the next version of this project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feedback reviewed."}
Minimum next step: first next-version item.
{R4_CLOSE}`,
    },
  ],
};

// ── Sub-7 — formal content sets ───────────────────────────────────────────────

const ABSENCE_SCOPE_CREEP: DecisionContent = {
  question:      'Scope expanding — still on original plan?',
  pinchFallback: 'Scope check?',
  L1: [
    {
      option: 'Audit what was just built against the original scope for this iteration: list what is complete, what is still in progress, and what has been added that was not in the original plan — and decide whether each addition stays in scope, gets deferred, or gets cut.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Build progressed; original-scope audit not done."}
What was built hasn't been audited against the original scope — additions that crept in haven't been resolved keep / defer / cut.
Audit: complete / in-progress / unplanned additions — per-addition decision.
{R4_CLOSE}`,
    },
    {
      option: 'List every behaviour and feature added to this feature since implementation began — for each item, confirm whether it was in the agreed scope or was introduced along the way, and make a call: keep it, defer it, or cut it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Per-addition keep/defer/cut call not made."}
The per-addition keep/defer/cut audit hasn't been done.
List behaviours+features added since start / agreed-scope vs introduced-along-way / per-item call.
{R4_CLOSE}`,
    },
    {
      option: 'Write a scope summary for this project before continuing: what was the original plan for this iteration, what is now in the implementation, and what is the delta — treat anything outside the original plan as a decision that must be made now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Scope-delta summary not written."}
The scope-delta summary hasn't been written.
Original plan / current state / delta — delta items are decisions now.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What was the original scope for this feature, and does the current implementation match it — or has it grown beyond the plan?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Build progressed."}
Lighter: original scope vs current — match or grown?
{R4_CLOSE}`,
    },
    {
      option: 'What is the most important addition to what was just built that was not in the original scope — and what is the decision on it: in, deferred, or cut?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Build progressed."}
Narrower: most important unplanned addition + in/deferred/cut decision.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is one thing currently in this feature that was not in the original scope for this session?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Build progressed."}
Minimum next step: one item in feature not in original-scope.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_CONTEXT_LOSS: DecisionContent = {
  question:      'Long session — context recapped?',
  pinchFallback: 'Context recap?',
  L1: [
    {
      option: 'Summarize the current state of what was just built: what decisions have been made, what is working, what remains incomplete, and what has changed since the session started — use this as a re-anchor before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended session; constraint / assumption / decision-thread reconstruction not done."}
Active constraints, assumptions, and decision-thread for this session haven't been reconstructed — silent compounding of forgotten context could distort follow-on decisions.
Reconstruct: constraints in play / assumptions still unverified / decision-thread from goal → current work.
{R4_CLOSE}`,
    },
    {
      option: 'Write a session summary for this project: what has been implemented, what the key technical decisions were, what the current blockers are, and what the next two or three steps are.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended session; decision-log reconstruction not done."}
The decision log for this session hasn't been reconstructed.
Capture: implementation milestones / key tech decisions / current blockers / next 2-3 steps.
{R4_CLOSE}`,
    },
    {
      option: 'Before continuing work on this feature: list every significant decision made in this session, the current working state of the implementation, and what remains to complete the agreed scope — this prevents the session from drifting.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended session; agreed-scope vs current-work map not done."}
The agreed-scope vs current-work map hasn't been built — session-drift risk.
List: significant decisions in this session / current implementation state / remaining-to-complete vs agreed scope.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the current state of what was just built — what is working, what is still in progress, and what is the immediate next step?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended session; current-state anchor not done."}
Lighter: working / in-progress / immediate next step — but in terms of remaining-constraints lens.
{R4_CLOSE}`,
    },
    {
      option: 'What is the most important technical decision made this session about this feature that must be explicitly carried forward before continuing?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended session; constraint/assumption carry-forward not flagged."}
Narrower: the single most important constraint or assumption decision that must be carried forward — not "decision" generically, but the one whose loss would silently distort follow-on work.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is the one piece of context about this project that must not be lost before continuing — the single most important thing to anchor right now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended session; decision-thread anchor not identified."}
Minimum next step: the one decision-thread anchor without which follow-on work would silently drift — the single link in the goal-to-current-work chain that cannot be reconstructed if lost.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_API_DESIGN_REVIEW: DecisionContent = {
  question:      'API being built — design reviewed?',
  pinchFallback: 'API design?',
  L1: [
    {
      option: 'Review the API surface of what was just built for backwards compatibility: list any changes to existing endpoints, parameters, or response shapes, and confirm whether each change is backwards compatible or constitutes a breaking change that requires a version bump.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: API implementation. Backwards-compatibility audit not done."}
The API contract for what was just built hasn't been reviewed for stability.
Per change: backwards compatible or breaking — version bump needed?
{R4_CLOSE}`,
    },
    {
      option: 'Define the contract for this feature\'s API before finalizing implementation: document the endpoint paths, accepted inputs, response shapes, and any error codes — confirm these are stable and not likely to change once consumers depend on them.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "API present; contract not locked."}
The API contract hasn't been explicitly defined and locked.
Document endpoints, inputs, response shapes, error codes; confirm stability before consumers depend.
{R4_CLOSE}`,
    },
    {
      option: 'Establish the versioning strategy for this project\'s API: will breaking changes be managed through URL versioning, header versioning, or deprecation notices — and does the current implementation reflect that strategy?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "API present; versioning strategy not established."}
The versioning strategy for the project's API hasn't been established.
URL / header / deprecation? Confirm current impl reflects that strategy.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does what was just built introduce any breaking changes to the existing API contract — and if so, what is the plan for consumers already depending on the current contract?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "API present; breaking-change check not done."}
Lighter: any breaking change to existing API contract + plan for existing consumers.
{R4_CLOSE}`,
    },
    {
      option: 'Is the API surface of this feature explicitly documented and locked before implementation continues — or are the endpoint signatures, inputs, and responses still in flux?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "API present; surface lock status unclear."}
Narrower: API surface documented and locked, or still in flux?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is the most important API design decision for this feature that needs to be made before the implementation is considered complete?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "API present."}
Minimum next step: most important API design decision still open.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_ACCESSIBILITY: DecisionContent = {
  question:      'UI being built — accessibility checked?',
  pinchFallback: 'Accessibility?',
  L1: [
    {
      option: 'Audit the ARIA labelling and semantic structure of what was just built: identify every interactive element and confirm it has an accessible name — via native semantics, aria-label, or aria-labelledby — and that its role is correctly communicated to assistive technologies.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: UI implementation. Accessibility audit (ARIA / semantic structure / labels) not performed."}
Accessibility audit for what was just built (ARIA labelling, semantic structure, assistive-tech compatibility) hasn't been performed.
Per interactive element: confirm accessible name (native / aria-label / aria-labelledby) + correct role for assistive tech. List findings only — don't fix in this pass.
{R4_CLOSE}`,
    },
    {
      option: 'Test keyboard navigation for this feature: tab through every interactive element and confirm the tab order is logical, all interactive elements are reachable by keyboard, no focus is trapped unexpectedly, and all actions achievable with a mouse are also achievable without one.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature implemented; keyboard-navigation audit not done."}
Keyboard-only navigation audit hasn't been done for this feature.
Tab through every interactive element; verify tab order is logical, all reachable, no focus traps, every mouse action achievable via keyboard. List gaps.
{R4_CLOSE}`,
    },
    {
      option: 'Review the visual accessibility of what was just built: check that all text meets WCAG AA contrast ratios against its background, that focus states are visually distinct, and that no information is conveyed by colour alone.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature implemented; visual-accessibility audit (contrast / focus / colour-only signaling) not done."}
Visual accessibility (WCAG AA contrast, focus visibility, non-colour-only signaling) hasn't been reviewed.
Check text contrast ratios, focus state visibility, and any information conveyed by colour alone. Flag gaps only.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Can a keyboard-only user complete the primary workflow in this feature without a mouse — and is the focus order logical as they tab through?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature implemented; keyboard-only primary-workflow check not done."}
Lighter: keyboard-only primary-workflow + logical tab-order check.
Confirm keyboard-only completion of the primary workflow with logical focus order.
{R4_CLOSE}`,
    },
    {
      option: 'Does every interactive element in what was just built have an accessible name that a screen reader would announce correctly?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature implemented; per-element accessible-name verification not done."}
Narrower: per-element accessible-name verification.
Confirm every interactive element has a screen-reader-announceable name.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is the most significant accessibility gap in this feature that a user with a disability would encounter right now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature implemented."}
Minimum next step: most-significant accessibility gap a user with a disability would encounter now.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_ENV_AND_SECRETS: DecisionContent = {
  question:      'Credentials in use — secrets management reviewed?',
  pinchFallback: 'Secrets setup?',
  L1: [
    {
      option: 'Audit the secrets storage pattern for what was just built: identify every credential, API key, and environment-specific value used — confirm none are hardcoded in source, all are loaded from environment variables, and the variable names are documented in a `.env.example` file.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: feature with credential/API-key usage. Storage pattern not audited."}
The secrets storage pattern hasn't been audited.
Per credential: not-hardcoded / env-loaded / documented in \`.env.example\`.
{R4_CLOSE}`,
    },
    {
      option: 'Review the environment configuration for this feature: confirm a `.env.example` exists with all required keys (values redacted), that `.env` is in `.gitignore`, and that any secret loaded at runtime has a clear failure path if the variable is missing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature with env vars; .env.example / .gitignore / failure-path not verified."}
The env-config hygiene hasn't been verified.
Confirm: \`.env.example\` complete / \`.env\` git-ignored / missing-var failure path.
{R4_CLOSE}`,
    },
    {
      option: 'Define the secret rotation plan for this project: for each credential in use, identify who holds it, how it gets rotated if compromised, and whether the current implementation supports hot-swapping secrets without a redeploy.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Project uses secrets; rotation plan not authored."}
A secret rotation plan hasn't been authored.
Per credential: holder / rotation procedure / hot-swap-support.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Are there any hardcoded credentials, API keys, or secrets in what was just built — and if so, what is the remediation plan before this reaches production?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature with secrets; hardcoded check not done."}
Lighter: hardcoded credentials in source + remediation plan if so.
Still, before you remediate any hardcoded credential (move it to env, rotate, or delete) you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Is there a `.env.example` that documents every environment variable required by this feature, and is the actual `.env` file excluded from source control?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature with env vars; example file + git exclusion not verified."}
Narrower: \`.env.example\` documents all required vars + \`.env\` excluded from VCS.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is the most sensitive credential used by this feature — and where is it currently stored?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature with credentials."}
Minimum next step: most sensitive credential identified + storage location confirmed.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

const ABSENCE_DATA_VALIDATION: DecisionContent = {
  question:      'Accepting input — data validation in place?',
  pinchFallback: 'Input validation?',
  L1: [
    {
      option: 'Define the input schema for what was just built: for every endpoint or form, document the expected shape — required fields, optional fields, data types, and any constraints (min/max, allowed values) — and implement schema validation using a library such as Zod, Yup, or Joi.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: input-accepting feature implementation. Input schema + schema-validation library coverage not established."}
Input schema definition (required / optional / types / constraints) + schema-validation coverage hasn't been established for what was just built.
Define schemas per endpoint or form; implement validation via Zod / Yup / Joi (or equivalent). Don't expand to unrelated endpoints in this pass.
{R4_CLOSE}`,
    },
    {
      option: 'Audit the validation coverage for this feature: for each input accepted, confirm there is an explicit check for required fields, correct data types, and acceptable value ranges — and that invalid inputs return a clear, descriptive error rather than failing silently or crashing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation done; per-input validation audit (required / types / ranges / error path) not done."}
Per-input validation audit hasn't been done for what was just built.
Per input accepted: confirm required-field check, type check, range check, descriptive error on invalid. Flag silent-fail / crash paths.
{R4_CLOSE}`,
    },
    {
      option: 'Write the unhappy-path scenarios for data validation in this project: what happens when a required field is missing, when a value is the wrong type, and when the payload structure is completely unexpected — confirm the implementation handles each case explicitly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation done; unhappy-path scenarios (missing field / wrong type / unexpected payload) not enumerated."}
Unhappy-path scenarios for input handling haven't been written.
Per scenario (missing field / wrong type / unexpected payload): confirm explicit handling. List findings only.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there a schema validation layer for what was just built that rejects malformed inputs before they reach the business logic — and which library or approach is being used?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done; schema-validation layer presence not confirmed."}
Lighter: schema-validation layer (rejecting malformed inputs before business logic) hasn't been confirmed.
Identify the validation library / approach in use; confirm coverage.
{R4_CLOSE}`,
    },
    {
      option: 'What are the required fields for each input accepted by this feature, and what happens if any of them are missing or the wrong type?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done; required-fields + missing-field handling not enumerated."}
Narrower: per-input required-fields + missing-field handling.
Enumerate required fields + describe what happens on missing-or-wrong-type.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is one input accepted by this feature that currently has no validation — and what is the worst-case outcome if it receives unexpected data?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done."}
Minimum next step: one un-validated input + its worst-case unexpected-data outcome.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_CI_PIPELINE: DecisionContent = {
  question:      'Moving toward release — CI pipeline configured?',
  pinchFallback: 'CI pipeline?',
  L1: [
    {
      option: 'Confirm automated test execution is configured for this project: check that a CI workflow (e.g. GitHub Actions) runs the full test suite on every pull request and push to main — verify the workflow file exists, the test command is correct, and test failures block merges.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Project moving toward release; automated test execution config not verified."}
Automated test execution on PR/main hasn't been confirmed.
Verify: workflow file present / test command correct / failures block merges.
{R4_CLOSE}`,
    },
    {
      option: 'Review the CI build verification for this feature: confirm that a failing build — compilation errors, type errors, or broken imports — is caught automatically before code reaches the main branch, and that the pipeline status is visible on every pull request.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "CI present; build-verification scope not confirmed."}
CI build-verification coverage hasn't been confirmed.
Confirm: compile / type errors / broken imports caught before main + PR-visible status.
{R4_CLOSE}`,
    },
    {
      option: 'Audit the CI pipeline coverage for what was just built: list every check currently configured (tests, linting, type-checking, security scans), confirm each is wired up correctly, and identify any verification that runs locally but is missing from the pipeline.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "CI present; full check inventory not audited."}
CI pipeline coverage hasn't been fully audited.
List configured checks; verify each wired correctly; spot local-only-not-in-CI gaps.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does this project have a CI pipeline that automatically runs its tests on every pull request — and does a test failure block a merge?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Project status; CI test-block check not done."}
Lighter: CI runs tests on PRs + failures block merge.
{R4_CLOSE}`,
    },
    {
      option: 'What does the CI pipeline for this feature actually verify — and is there anything checked locally during development that is not running automatically in CI?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "CI present; local-only-gap not enumerated."}
Narrower: CI verification scope + local-only-but-not-CI items.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is the most important automated check missing from the CI pipeline for this project right now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Project status."}
Minimum next step: most important missing automated CI check.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

const ABSENCE_RATE_LIMITING: DecisionContent = {
  question:      'API endpoint built — rate limiting designed?',
  pinchFallback: 'Rate limiting?',
  L1: [
    {
      option: 'Define the rate limiting strategy for what was just built: specify the throttle limits per user, per API key, or per IP address — confirm which identifier is used for tracking, what the limit is (requests per second or per minute), and what happens when the limit is exceeded.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: API endpoint built. Rate limiting strategy not defined."}
A rate limiting strategy hasn't been defined.
Specify: identifier (user / key / IP) + limit (rps / rpm) + over-limit behaviour.
{R4_CLOSE}`,
    },
    {
      option: 'Design the throttle response for this feature: when a caller exceeds the rate limit, confirm the API returns a 429 status with a `Retry-After` header or equivalent signal — and document the expected backoff behaviour for clients.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "API present; throttle response design not done."}
The throttle response hasn't been designed.
Confirm: 429 + Retry-After + documented client backoff.
{R4_CLOSE}`,
    },
    {
      option: 'Establish the quota model for this project: decide whether rate limits are applied per second, per minute, or per hour, whether limits differ by user tier or API key, and whether the throttle resets on a rolling window or a fixed interval.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "API present; quota model not established."}
The quota model hasn't been established.
Decide: time window (s/m/h) / per-tier differentiation / rolling-vs-fixed reset.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the per-user or per-key request limit for what was just built — and is there any middleware or layer currently enforcing that limit?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "API present; per-id limit + enforcement unclear."}
Lighter: per-user/key limit + middleware enforcing it.
{R4_CLOSE}`,
    },
    {
      option: 'What response does this feature return when a caller is throttled — and does the response include enough information for the client to know when to retry?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "API present; throttle-response detail unclear."}
Narrower: throttle response + retry-information completeness.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is the most likely way this feature gets abused through excessive requests — and is there any throttle mechanism currently in place to prevent it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "API present."}
Minimum next step: most likely abuse path + current throttle mechanism status.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

const ABSENCE_FEATURE_SCOPE: DecisionContent = {
  question:      'Feature started — Definition of Ready confirmed?',
  pinchFallback: 'Scope this first.',
  L1: [
    {
      option: 'Define the scope and acceptance criteria for this feature before implementation continues: what is the feature doing, what are the explicit out-of-scope items, and what conditions must be true for the feature to be accepted as done? This is the Definition of Ready for sprint planning.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature started; Definition of Ready not confirmed."}
Definition of Ready / acceptance criteria for this feature haven't been written — implementation is proceeding without a written target.
Define: what feature does / explicit out-of-scope / acceptance-as-done conditions.
{R4_CLOSE}`,
    },
    {
      option: 'Write a feature specification before proceeding: intended behaviour, input/output contract, acceptance criteria (at least 3 scenarios covering happy path and key edge cases), and explicit scope boundaries. Implementation without this is a Definition of Ready violation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature spec not written."}
The feature spec hasn't been written.
Intended behaviour / IO contract / 3+ acceptance scenarios (happy + edge) / scope boundaries.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm the feature scope: given what has been built so far in this session, is there a written definition of what the feature does and how it will be accepted? If not, define it now — spec the behaviour before writing more code.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature-scope cross-confirm not done."}
Feature-scope cross-confirmation hasn't been done.
Written definition: what does it do / acceptance — spec before more code.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'State the acceptance criteria for this feature: what specific conditions must be true for this feature to be considered complete and ready for review?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature in progress."}
Lighter: acceptance criteria — complete-and-ready-for-review conditions.
{R4_CLOSE}`,
    },
    {
      option: 'Define the scope boundary: what does this feature do, and what is explicitly deferred or out of scope? One paragraph before continuing implementation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature in progress."}
Narrower: scope boundary — what does / deferred / out-of-scope.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What are the acceptance criteria for this feature? List them before adding more code.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature in progress."}
Minimum next step: list acceptance criteria before more code.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_IMPLEMENTATION_CHECKPOINT: DecisionContent = {
  question:      'Implementation continued — current state verified?',
  pinchFallback: 'Verify first.',
  L1: [
    {
      option: 'Run an implementation checkpoint before continuing: verify the last unit of work is in a passing state — either by running the relevant tests or by manually tracing the main path through the recently added code. Per TDD Red-Green-Refactor practice, only continue building once the current state is green.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation continued; current state not verified."}
The last unit of work hasn't been verified before continuing — layering changes on an unverified base compounds debugging cost.
Verify: run tests or manually trace main path / continue only when green.
{R4_CLOSE}`,
    },
    {
      option: 'Apply the TDD feedback loop to the last change: does what was just built satisfy its stated requirement? Trace the code path, run the tests if they exist, and confirm the current state is working before layering the next change on top of it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "TDD feedback loop on last change not applied."}
The TDD feedback loop on the last change hasn't been applied.
Trace path / run tests if exist / confirm working before next layer.
{R4_CLOSE}`,
    },
    {
      option: 'Checkpoint the implementation before proceeding: what is the current state — working, broken, or untested? Identify the specific condition that confirms this unit of work is done and verify it now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation state not labeled."}
The implementation-state label hasn't been applied.
Working / broken / untested — identify done-condition and verify now.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Before the next implementation step — does the current build pass? Run existing tests or manually verify the most recent change against its requirements.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation continued."}
Lighter: build pass check — run tests or manually verify last change.
{R4_CLOSE}`,
    },
    {
      option: 'What was the last thing built, and is it verified to work? Run the tests or do a quick manual trace before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation continued."}
Narrower: last-thing-built + verified-or-not.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Verify the last change works before adding the next one — run tests or manually confirm the current build is functional.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation continued."}
Minimum next step: verify last change before next.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_SPEC_BEFORE_CODE: DecisionContent = {
  question:      'Implementation started — behaviour specified first?',
  pinchFallback: 'Spec before code.',
  L1: [
    {
      option: 'Write a behaviour specification before continuing implementation: using BDD Given/When/Then format, define at least the primary scenario — Given [context], When [action], Then [expected outcome]. Per spec-driven development practice, the specification is the source of truth; code is the verification.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation started; behaviour spec not written."}
Behaviour spec for what is being built hasn't been written — code is being produced without a Given/When/Then or equivalent target to verify against.
Write at minimum the primary Given/When/Then scenario — spec is source of truth, code is verification.
{R4_CLOSE}`,
    },
    {
      option: "Define the acceptance criteria for what is being built before writing more code: what specific behaviour must be true for this implementation to be considered correct? Per Dan North's BDD principle: 'a story's behaviour is simply its acceptance criteria' — write them before you implement.",
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Acceptance criteria not defined pre-code."}
Acceptance criteria for the current implementation unit haven't been defined before code.
What specific behaviour must be true for correctness — write before implementing.
{R4_CLOSE}`,
    },
    {
      option: 'Apply spec-first discipline to the current implementation unit: write the expected behaviour (inputs, process, outputs, error cases) before continuing. This is the boundary between planning and execution — the spec defines the target, implementation verifies against it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Spec-first discipline not applied."}
Spec-first discipline hasn't been applied to the current implementation unit.
Inputs / process / outputs / error cases — spec is the target, implementation verifies.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Write the Given/When/Then scenario for what is being built before adding more code: what context, what action, and what expected outcome?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation in progress."}
Lighter: G/W/T scenario — context / action / outcome.
{R4_CLOSE}`,
    },
    {
      option: 'Define the expected behaviour of this implementation unit before continuing: what must be true for this to be considered correct?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation in progress."}
Narrower: expected behaviour — what-must-be-true-for-correct.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Write one Given/When/Then scenario for what is being built before the next implementation step.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation in progress."}
Minimum next step: one G/W/T scenario before next step.
{R4_CLOSE}`,
    },
  ],
};

// ── Sub-7 — casual content sets ───────────────────────────────────────────────

const ABSENCE_SCOPE_CREEP_CASUAL: DecisionContent = {
  question:      'Scope expanding — still on original plan?',
  pinchFallback: 'Scope check?',
  L1: [
    {
      option: 'Take a look at what was just built and compare it to what you originally set out to do — is anything in there that wasn\'t part of the plan? Go through it and flag any extras before adding more.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been building; haven't compared to the original plan."}
The compare-to-original-plan check hasn't been done.
Look at what's built vs original / flag extras before adding more.
{R4_CLOSE}`,
    },
    {
      option: 'Think about what this feature was supposed to do when you started — has anything crept in that wasn\'t in the original idea? Go through it and decide what to keep, what to push to later, and what to drop.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Crept-in items not surfaced."}
The crept-in audit hasn't been done.
Original idea vs now / keep / push later / drop.
{R4_CLOSE}`,
    },
    {
      option: 'Before going further with this project — list what you originally planned to build this session and what\'s actually in there now. For anything extra, make a call: now, later, or never.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Original-vs-now list not made."}
The original-vs-now list hasn't been made.
Originally planned vs actually in / extras → now/later/never.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What did you originally set out to build in this feature, and does what\'s there now actually match that — or has it grown?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Build progressed."}
Lighter: originally-set-out vs now — match or grown.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the most important thing added to what was just built that wasn\'t part of the original plan — and what are you going to do with it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Build progressed."}
Narrower: most important unplanned addition + your call.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s one thing in this feature that ended up there but wasn\'t in the original plan?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Build progressed."}
Minimum next step: one not-in-original item.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_CONTEXT_LOSS_CASUAL: DecisionContent = {
  question:      'Long session — context recapped?',
  pinchFallback: 'Context recap?',
  L1: [
    {
      option: 'Let\'s get back on the same page — go through what was just built and give me a quick rundown: what\'s done, what\'s working, and what\'s still left to do.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been in this session for a while; I haven't paused to reconstruct what's still in scope and what's been decided."}
The session context hasn't been reconstructed — what's done / working / left is fuzzy.
Quick rundown: what's done, what's working, what's still left.
{R4_CLOSE}`,
    },
    {
      option: 'Take a minute to catch up on this project — what have we actually built this session, what decisions did we make, and what\'s coming next?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long session; recap of what was built / decided / coming-next not done."}
The catch-up recap hasn't been done.
Tell me: what we built / what decisions we made / what's coming next.
{R4_CLOSE}`,
    },
    {
      option: 'Before going further with this feature — do a quick check: where are we, what\'s working, and what\'s the next thing that actually needs to happen?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long session; pre-continue check not done."}
The pre-continue check hasn't been done.
Where are we / what's working / what's the next thing that needs to happen.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the situation with what was just built right now — what\'s working and what still needs to happen?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long session; current situation unclear."}
Lighter: situation now — working vs still-needs-to-happen.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the most important decision we made about this feature this session that you want to make sure we don\'t lose track of?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long session; key-decisions not flagged for carry-forward."}
Narrower: the most important decision I shouldn't lose track of.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s the one thing you most need to remember about where this project is right now before you keep going?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long session."}
Minimum next step: the one thing I most need to remember before continuing.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_API_DESIGN_REVIEW_CASUAL: DecisionContent = {
  question:      'API being built — design reviewed?',
  pinchFallback: 'API design?',
  L1: [
    {
      option: 'Take a look at what was just built and check whether it could break anything that already uses this API — are there any changes to how endpoints work, what they expect, or what they return that might surprise existing callers?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built API endpoints but haven't checked how they affect existing callers."}
Breaking-change risk for existing callers hasn't been checked.
Spot endpoint changes, expected-input changes, response-shape changes that'd surprise callers.
{R4_CLOSE}`,
    },
    {
      option: 'Before locking in the API for this feature — go through what it accepts and what it returns, and think about whether that\'s something you\'d be comfortable with other code depending on. Is anything likely to change again?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "API surface present; comfort with consumers depending on it not checked."}
Whether the API surface is settled-enough-for-consumers hasn't been checked.
Walk through inputs and responses; flag what's likely to change.
{R4_CLOSE}`,
    },
    {
      option: 'Think about how this project\'s API handles changes over time — if something needs to change in a future version, how do you manage that without breaking code that\'s already using it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "API present; versioning strategy not chosen."}
The over-time-change strategy for this API hasn't been thought through.
How is a future version managed without breaking dependents?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does what was just built change how the API works in a way that could break something already depending on it — and if so, what\'s the plan?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "API present; breaking-change plan unclear."}
Lighter: breaking change in what was just built + plan if so.
{R4_CLOSE}`,
    },
    {
      option: 'Is the shape of this feature\'s API settled enough that you\'re comfortable building other things on top of it — or is it likely to change?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "API present; settled-vs-flux unclear."}
Narrower: is the API shape settled enough for other things to depend on it?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s the most important API design question about this feature that hasn\'t been answered yet?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "API present."}
Minimum next step: most important API question still open.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_ACCESSIBILITY_CASUAL: DecisionContent = {
  question:      'UI being built — accessibility checked?',
  pinchFallback: 'Accessibility?',
  L1: [
    {
      option: 'Go through what was just built and check whether a screen reader could make sense of it — does every button and link have a clear label, and are there any parts that would be confusing or silent for someone using one?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built UI without checking whether a screen reader could make sense of it."}
The screen-reader sense check for what was just built hasn't been done.
Go through every button and link; confirm clear labels; flag silent or confusing parts. Note only — no fixing yet.
{R4_CLOSE}`,
    },
    {
      option: 'Try using this feature with just the keyboard — no mouse. Can you get to everything, use everything, and does the tab order feel natural? Note anything that gets stuck or hard to reach.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built this feature without trying it keyboard-only."}
The keyboard-only walkthrough hasn't been done.
Try the feature with no mouse — get to everything, use everything, confirm tab order natural. Note stuck or hard-to-reach spots.
{R4_CLOSE}`,
    },
    {
      option: 'Take a look at the visual design of this feature from an accessibility angle — is the contrast readable, are focus states visible when you tab through, and is anything communicated only through colour that a colour-blind user might miss?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built the UI without checking contrast, focus states, or colour-only signaling."}
Visual accessibility check (contrast / focus visibility / colour-only signaling) hasn't been done.
Confirm contrast readable, focus states visible while tabbing, no information conveyed via colour alone.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Could someone who can\'t use a mouse still complete the main task in this feature using only the keyboard — and does tabbing through it feel natural?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Didn't try the feature without a mouse."}
The mouse-free primary-task completion check hasn't been done.
Confirm someone keyboard-only can finish the main task + tab order feels natural.
{R4_CLOSE}`,
    },
    {
      option: 'Does everything in what was just built have a label that a screen reader would announce — so someone who can\'t see the screen knows what each button and input is for?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Didn't check screen-reader labels on each control."}
Narrower: per-control screen-reader-label verification.
Confirm each button / input announces what it's for.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s the one accessibility issue in this feature that would most get in the way of someone with a disability using it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: the one accessibility issue that would most block a disabled user.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_ENV_AND_SECRETS_CASUAL: DecisionContent = {
  question:      'Credentials in use — secrets management reviewed?',
  pinchFallback: 'Secrets setup?',
  L1: [
    {
      option: 'Take a look at what was just built and check whether any API keys, passwords, or credentials are written directly into the code — if so, move them out now and load them from a separate config file instead.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built something with credentials but I haven't checked if anything is hardcoded."}
The hardcoded-credentials check hasn't been done.
Find any inline API keys / passwords / credentials; load from config instead.
{R4_CLOSE}`,
    },
    {
      option: 'Go through the environment setup for this feature — is there a `.env.example` file that lists every variable the app needs to run? Does the real `.env` file stay out of the repo?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feature has env vars; setup hygiene not checked."}
The env-setup hygiene hasn't been verified.
Confirm: \`.env.example\` lists all vars + real \`.env\` out of repo.
{R4_CLOSE}`,
    },
    {
      option: 'Think about what happens if one of the secrets used by this project gets leaked or needs to be changed — how would you swap it out, and does the current setup make that easy or painful?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feature uses secrets; rotation hasn't been thought through."}
Secret-rotation feasibility hasn't been considered.
Walk through: how to swap a compromised secret + how painful the current setup makes it.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that has a real password, API key, or token written directly into the code rather than loaded from a config file?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature uses credentials; inline check not done."}
Lighter: any real credentials inline in source?
Still, before you move or rotate any credential you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'What happens in this feature if a required environment variable isn\'t set — does something break immediately with a clear message, or does it fail in a confusing way later?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature uses env vars; missing-var failure mode unclear."}
Narrower: missing-env-var failure path — clear immediate error or confusing later failure?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Where are the passwords and API keys for this feature sitting right now — are they safe, or is there something that needs to move?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature uses credentials."}
Minimum next step: where credentials sit + safe-vs-needs-moving verdict.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

const ABSENCE_DATA_VALIDATION_CASUAL: DecisionContent = {
  question:      'Accepting input — data validation in place?',
  pinchFallback: 'Input validation?',
  L1: [
    {
      option: 'Take a look at what was just built and check what happens when someone sends unexpected data — a missing field, the wrong type, or a completely random value. Is the app handling it gracefully or just crashing?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built input handling without checking what happens with missing fields, wrong types, or random values."}
The unexpected-data resilience check hasn't been done.
Probe with missing / wrong-type / random values; confirm graceful handling vs crash. Note findings.
{R4_CLOSE}`,
    },
    {
      option: 'Go through the inputs this feature accepts and think about what you\'re actually checking before using that data — are the required fields being verified, are the types right, and is there a clear error when something is off?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Took inputs without thinking through required / types / clear-error checks."}
Per-input verification coverage (required / types / clear-error) hasn't been done.
Confirm required-field + type checks + clear error on bad input. Flag silent-fail spots.
{R4_CLOSE}`,
    },
    {
      option: 'Think about the worst data someone could realistically send to this project — a payload that\'s completely wrong, a value that would confuse the logic, or a field that shouldn\'t be there at all — and confirm the current code handles it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Didn't think about the worst data someone could realistically send."}
The worst-case-data probe hasn't been done.
Imagine the worst realistic payload; confirm current code handles it.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that accepts data from outside and uses it directly without first checking that it\'s in the right shape?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Took outside data and used it directly without shape-checking."}
The direct-use vs shape-checking separation hasn't been audited.
Flag inputs used without a shape check; add the check.
{R4_CLOSE}`,
    },
    {
      option: 'What happens in this feature if a required field is missing from the input — does it fail clearly with a useful message, or does it just break in a confusing way?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Didn't pin down missing-field behavior."}
Narrower: missing-field clear-error vs confusing-break separation.
Verify what happens on missing required field; clear message or confusing break?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s one input this feature accepts that isn\'t being validated yet?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: one input that isn't being validated.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_CI_PIPELINE_CASUAL: DecisionContent = {
  question:      'Moving toward release — CI pipeline configured?',
  pinchFallback: 'CI pipeline?',
  L1: [
    {
      option: 'Take a look at whether this project has something set up to automatically run the tests whenever code is pushed — if not, setting up a simple GitHub Actions workflow now means you catch failures before they reach the main branch.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been pushing code but I'm not sure if there's a CI workflow running tests."}
Automated CI test execution hasn't been verified.
Check; if missing, set up a simple GH Actions workflow to catch failures pre-main.
{R4_CLOSE}`,
    },
    {
      option: 'Go through what a CI run actually does for this feature — when someone pushes code, does it automatically run the tests and stop a bad merge if something fails?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "CI exists; what-it-does walkthrough not done."}
The CI walkthrough hasn't been done.
Walk through: tests run on push + bad-merge block on failure?
{R4_CLOSE}`,
    },
    {
      option: 'Think about what was just built and whether the CI pipeline is actually checking everything it should — are the tests running, is the build being verified, and is anything important only being checked locally but not automatically?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "CI exists; coverage gaps not enumerated."}
CI coverage hasn't been checked against what's needed.
Tests / build / local-only-but-should-be-automated items.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does this project run its tests automatically whenever code is pushed — and does it stop a bad merge if the tests fail?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Project; auto-test-on-push unclear."}
Lighter: CI runs tests on push + blocks bad merge?
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything about this feature that gets checked by hand during development but isn\'t running automatically in CI — and should it be?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature; local-only-checks not promoted to CI."}
Narrower: hand-checked locally but not in CI; should it be?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s the most important thing the CI pipeline should be catching for this project that it isn\'t catching right now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Project."}
Minimum next step: most important uncaught-in-CI thing.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

const ABSENCE_RATE_LIMITING_CASUAL: DecisionContent = {
  question:      'API endpoint built — rate limiting designed?',
  pinchFallback: 'Rate limiting?',
  L1: [
    {
      option: 'Take a look at what was just built and think about what happens if someone calls this endpoint way too many times in a short period — is there anything stopping them from doing that, and if not, what would happen to the app?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built an API endpoint but I haven't added any rate limiting."}
Rate limiting hasn't been added.
Walk through abuse path; identify what'd happen to the app under hammer-traffic.
{R4_CLOSE}`,
    },
    {
      option: 'Think about how this feature handles someone who keeps hammering the API — what does it tell them when they\'ve made too many requests, and does it give them enough info to know when to try again?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "API present; over-limit response not designed."}
The over-limit response hasn't been designed.
Throttle response content + retry-info sufficiency.
{R4_CLOSE}`,
    },
    {
      option: 'Go through the rate limiting design for this project — how many requests does a user or API key get before they\'re throttled, does the limit reset every minute or every hour, and does it work the same way for everyone?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "API present; quota model not chosen."}
The quota model hasn't been chosen.
Limit per id / reset window / per-tier differentiation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that prevents a single user or caller from hitting the endpoint too many times — and if not, is that something that needs to be added?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "API present; per-user throttle status unclear."}
Lighter: any single-caller throttle present + needs-adding decision if not.
{R4_CLOSE}`,
    },
    {
      option: 'What does this feature say back to someone who\'s sent too many requests — do they get a useful response that tells them when they can try again?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "API present; over-limit response not verified."}
Narrower: throttle response + retry-when-info.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s the most realistic way this feature gets overwhelmed by too many requests — and is there anything in place right now to prevent that?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "API present."}
Minimum next step: most realistic overwhelm path + current prevention.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

const ABSENCE_FEATURE_SCOPE_CASUAL: DecisionContent = {
  question:      'Started building — is scope defined?',
  pinchFallback: 'What\'s in scope?',
  L1: [
    {
      option: 'Before going further — write a quick scope statement for this feature: what it does, what it doesn\'t do, and what done looks like. One paragraph is enough. This prevents mid-build scope drift.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Started building; no scope statement yet."}
The quick scope statement hasn't been written.
What it does / doesn't do / what done looks like — one paragraph.
{R4_CLOSE}`,
    },
    {
      option: 'Quick scope check: what exactly is this feature supposed to do, and what would confirm it\'s working correctly? Define the boundaries before continuing — it saves rework.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Scope boundaries unclear."}
The quick scope check hasn't been done.
What it does / what confirms it's working / define boundaries.
{R4_CLOSE}`,
    },
    {
      option: 'Write a one-sentence definition of done for this feature before the next prompt. What needs to be true for this to be \'finished\' — not perfect, just done?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "DoD for feature unwritten."}
The one-sentence DoD hasn't been written.
What needs to be true for finished — not perfect, just done.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What are the 2-3 things this feature must do to be considered complete? List them before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature in progress."}
Lighter: 2-3 must-do-for-complete items.
{R4_CLOSE}`,
    },
    {
      option: 'Scope check: what is this feature doing, and what is it explicitly NOT doing? Quick answer before next step.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature in progress."}
Narrower: doing vs explicitly-not-doing.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What does \'done\' look like for this feature? One sentence before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature in progress."}
Minimum next step: one-sentence done.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL: DecisionContent = {
  question:      'Kept building — is the last change verified?',
  pinchFallback: 'Checkpoint.',
  L1: [
    {
      option: 'Quick checkpoint before continuing — does what was last built actually work end to end? Try running it or walk through the main path manually. If it\'s broken, fix it now before the next change makes the bug harder to locate.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Kept building; I haven't checked the last thing works."}
The quick-checkpoint hasn't been done.
Run it or walk through manually / fix before next change layers a harder-bug.
{R4_CLOSE}`,
    },
    {
      option: 'Smoke test the last change before adding more: what\'s the simplest way to verify it works right now? Run it or try the main path and report what you get.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Smoke-test on last change not done."}
The smoke test hasn't been done.
Simplest verification / report what you get.
{R4_CLOSE}`,
    },
    {
      option: 'Before moving to the next feature — does everything built so far still work? Quick manual check: try the main flow and flag anything that looks off.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Pre-next-feature still-works check not done."}
The pre-next-feature still-works check hasn't been done.
Quick manual: try main flow / flag anything off.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does the last change work? Run it or try it manually before continuing — one quick verification before the next prompt.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Kept building."}
Lighter: last change verification before next prompt.
{R4_CLOSE}`,
    },
    {
      option: 'Checkpoint: what\'s the most recent thing that was built, and does it actually work? Verify before adding anything else.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Kept building."}
Narrower: most recent thing + works-or-not.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Does what was last built work? Quick try before the next step.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Kept building."}
Minimum next step: quick try of last.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_SPEC_BEFORE_CODE_CASUAL: DecisionContent = {
  question:      'Building this — behaviour defined first?',
  pinchFallback: 'Spec it first.',
  L1: [
    {
      option: 'Before writing more code — write a quick behaviour spec: what inputs does this take, what should it do, and what output or side effect should it produce? One paragraph is enough. Spec before code avoids building the wrong thing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building this; haven't spec'd the behaviour first."}
The quick behaviour spec hasn't been written.
Inputs / what it does / output or side effect — one paragraph.
{R4_CLOSE}`,
    },
    {
      option: 'Define the expected behaviour before implementing: given X (the context), when Y (the trigger), then Z (the outcome). Even one sentence of Given/When/Then saves more time than it takes to write.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "G/W/T not written."}
The G/W/T sentence hasn't been written.
Given X / When Y / Then Z.
{R4_CLOSE}`,
    },
    {
      option: 'Quick spec before continuing: what is this code supposed to DO? Not how — what. Describe the behaviour in plain terms, then implement against that description.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Quick spec unwritten."}
The quick what-it-does-spec hasn't been written.
What (not how) in plain terms / implement against it.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What should this do? Describe the expected behaviour in one or two sentences before writing the implementation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this."}
Lighter: 1-2 sentence expected-behaviour.
{R4_CLOSE}`,
    },
    {
      option: 'Spec this out before coding it: what\'s the input, what happens, what\'s the expected output? Quick answer first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this."}
Narrower: input / happens / expected output.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is this supposed to do? One sentence spec before the next prompt.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this."}
Minimum next step: one-sentence spec before next prompt.
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 5 D1 — incremental_build (CASUAL + FORMAL registers) ────────────────

const ABSENCE_INCREMENTAL_BUILD_CASUAL: DecisionContent = {
  question:      'Building incrementally — verifying between steps?',
  pinchFallback: 'Verify between steps.',
  L1: [
    {
      option: 'Between each change — stop and verify what was just built actually works before adding the next layer. Debugging compound changes is harder than debugging one change at a time.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been stacking changes without verifying between them."}
The between-changes verification hasn't been done.
Stop / verify / then add next — one-at-a-time debugging is faster.
{R4_CLOSE}`,
    },
    {
      option: 'Before moving to the next part of the implementation — try what was just built. If it\'s broken, fix it now. Layering changes on top of a broken base will cost more time than the verification takes.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Layering changes without verifying base."}
The pre-next-part verification hasn't been done.
Try what was built / fix if broken / no-layering-on-broken-base.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the last thing that was built, and has it been verified as working? If not, verify before adding more. Incremental verification is faster than debugging a pile of changes at once.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Last-thing-built verification not done."}
The last-thing-built verification hasn't been done.
What was last / verified or not / verify-before-more.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Has what was just built been tested before continuing? Quick verification now is faster than debugging later.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building incrementally."}
Lighter: tested-before-continuing check.
{R4_CLOSE}`,
    },
    {
      option: 'Is each piece being verified as done before the next is added, or are multiple changes being stacked before any are checked?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building incrementally."}
Narrower: per-piece verified vs stacked-without-check.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is what was last built working and verified before adding the next change?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building incrementally."}
Minimum next step: last-built working+verified before next.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_INCREMENTAL_BUILD: DecisionContent = {
  question:      'Incremental build — is each step verified before the next?',
  pinchFallback: 'Verify before proceeding.',
  L1: [
    {
      option: 'Review the build cadence: is each incremental change being verified before the next is added? Compounding unverified changes increases debugging complexity — verify at each increment.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Build cadence; incremental verification not happening."}
Verification between increments hasn't been done — multiple changes are stacking without intermediate confirmation, increasing rework risk.
Verify at each increment — compounding unverified changes raises debugging complexity.
{R4_CLOSE}`,
    },
    {
      option: 'Audit the current state: what was the last change made, and has it been confirmed working? If not, verify before continuing — a clean failing test is faster to diagnose than multiple layered failures.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Last-change confirmation not done."}
The last-change confirmation hasn't been done.
What was last / confirmed working / verify before continuing — one failing test diagnoses faster than layered.
{R4_CLOSE}`,
    },
    {
      option: 'Check whether the implementation is proceeding incrementally with verification gates, or whether multiple changes are being stacked without intermediate confirmation. The latter increases rework risk significantly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Incremental-vs-stacked pattern not audited."}
The incremental-vs-stacked audit hasn't been done.
Verification gates present? Or stacked without confirmation? Latter significantly increases rework.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is each increment being verified before the next change is added? Identify the last unverified change and confirm it before proceeding.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Build cadence."}
Lighter: increment verification + identify last unverified.
{R4_CLOSE}`,
    },
    {
      option: 'What is the current state of the build? Which pieces have been verified as working and which have not?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Build cadence."}
Narrower: verified-vs-unverified inventory.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Has the most recent change been verified as working before the next one is introduced?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Build cadence."}
Minimum next step: most-recent change verified before next.
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 5 D4-D6 — cool_geek signals (CASUAL register) ──────────────────────

const ABSENCE_FEATURE_COMPLETION_CHECK_CASUAL: DecisionContent = {
  question:      'Adding more — is the previous feature actually done?',
  pinchFallback: 'Finish before starting next.',
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

const ABSENCE_FINISHING_LINE_AWARENESS_CASUAL: DecisionContent = {
  question:      'Multiple things in progress — how many are complete?',
  pinchFallback: 'Finish one before starting next.',
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

const ABSENCE_POLISH_VS_FUNCTION_CASUAL: DecisionContent = {
  question:      'Working on the look — does the core work end-to-end?',
  pinchFallback: 'Function before polish.',
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

const ABSENCE_MVP_SCOPE_DISCIPLINE_CASUAL: DecisionContent = {
  question:      'Adding features — is each one actually MVP scope?',
  pinchFallback: 'MVP discipline check.',
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

const ABSENCE_IDEA_TO_SPEC_BRIDGE_CASUAL: DecisionContent = {
  question:      'New idea — defined what it does before building?',
  pinchFallback: 'Spec the idea first.',
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

const ABSENCE_DEMO_VS_PRODUCT_CASUAL: DecisionContent = {
  question:      'Is this demo quality or production quality — explicit distinction?',
  pinchFallback: 'Demo vs. production: name which.',
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

const ABSENCE_USER_JOURNEY_CHECK_CASUAL: DecisionContent = {
  question:      'Feature being built — is the full user journey mapped?',
  pinchFallback: 'Map the user journey first.',
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

const ABSENCE_TECHNICAL_SPIKE_TREATMENT_CASUAL: DecisionContent = {
  question:      'Exploring / experimenting — spike or production code?',
  pinchFallback: 'Spike or production: name which.',
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

const ABSENCE_DEPENDENCY_ADVENTURE_CASUAL: DecisionContent = {
  question:      'Adding a dependency — evaluated the need and maintenance cost?',
  pinchFallback: 'Evaluate before adding.',
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

const ABSENCE_RESTART_IMPULSE_CHECK_CASUAL: DecisionContent = {
  question:      'Hitting friction — debugged before considering a restart?',
  pinchFallback: 'Debug before restarting.',
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

const ABSENCE_CREATIVE_VS_CORE_RATIO_CASUAL: DecisionContent = {
  question:      'Session balance — how much went to core vs. creative features?',
  pinchFallback: 'Core value first.',
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

// ── Phase 5 D7 — pro_geek_soul cluster 1 (CASUAL register) ───────────────────

const ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL: DecisionContent = {
  question:      'Complex logic added — documented the why?',
  pinchFallback: 'Add the why comment.',
  L1: [
    {
      option: 'Clean Code principle: \'Don\'t use comments to explain WHAT the code is doing — use them to explain WHY you did it.\' For the non-obvious logic just added — add a comment explaining the reasoning, constraint, or edge case it handles. Future maintainers (including you) will need this context.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Just added non-obvious logic without a WHY-comment explaining the reasoning, constraint, or edge case it handles."}
The WHY behind non-obvious code just written hasn't been captured in comments.
Add a WHY-comment per non-obvious block: reasoning / constraint / edge-case. Don't comment WHAT — only WHY. Just this code; skip historical sweeps.
{R4_CLOSE}`,
    },
    {
      option: 'Two things to add for complex code: (1) an inline comment explaining WHY this approach was chosen — what constraint, edge case, or tradeoff it addresses; (2) a docstring for any public function that explains parameters, return value, and edge behavior. Complex code without this context becomes invisible debt.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Wrote complex code without leaving inline WHY comments or public-function docstrings explaining edge behavior."}
The two-piece doc capture (inline WHY + public-function docstring) hasn't been done.
Add inline WHY comments on complex logic + docstrings (params / returns / edge behavior) on public functions. Don't expand to obvious-from-code paths.
{R4_CLOSE}`,
    },
    {
      option: 'The WHY behind non-obvious code is not preserved in the implementation — only a comment captures it. What\'s the reasoning behind what was just written? The algorithm choice, the edge case it handles, the tradeoff it makes — add that as an inline comment now before the context is gone.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Wrote non-obvious logic without preserving the reasoning — algorithm choice / edge case / tradeoff — in a comment."}
The reasoning preservation (algorithm choice / edge case / tradeoff) hasn't been recorded in comments.
Add the reasoning as inline comments NOW before context fades. Just this logic; don't backfill prior code.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'For the complex logic just added — add an inline comment explaining WHY this approach was chosen. What constraint or edge case does it address?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Added complex logic; haven't added the WHY-comment."}
Lighter: WHY-comment for the complex logic hasn't been added.
Add the comment explaining why this approach + what constraint or edge case it addresses.
{R4_CLOSE}`,
    },
    {
      option: 'Docstrings for public interfaces, inline comments for non-obvious logic. Add the \'why\' before moving on — it becomes invisible after the context is gone.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Public interfaces + non-obvious logic without docstrings / inline WHY."}
Narrower: public-interface docstrings + non-obvious-logic inline WHY.
Add both before context fades.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Add an inline comment explaining why this logic works the way it does before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Added complex logic."}
Minimum next step: inline WHY-comment explaining why this logic works this way.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL: DecisionContent = {
  question:      'Shortcut taken — tagged it as debt?',
  pinchFallback: 'Tag the shortcut.',
  L1: [
    {
      option: 'Martin Fowler\'s Technical Debt Quadrant: \'Prudent Deliberate\' debt — acknowledged and added to the backlog — is acceptable. \'Reckless Deliberate\' — shortcuts taken without acknowledgment — compounds invisibly. Tag any shortcut with a TODO or FIXME comment before moving on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Took a shortcut without tagging it as debt — sliding from Prudent-Deliberate into Reckless-Deliberate territory."}
The just-taken shortcut hasn't been tagged as debt — invisible accumulation risk.
Add a TODO or FIXME comment with what needs fixing and why it was deferred. Just this shortcut.
{R4_CLOSE}`,
    },
    {
      option: 'Ward Cunningham\'s debt metaphor: taking a shortcut is a legitimate decision — not tagging it is the anti-pattern. Minimum: // TODO: [what needs fixing] — [why it was deferred]. Takes 10 seconds, prevents invisible accumulation across every subsequent sprint.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Took a shortcut without leaving a 10-second TODO behind to convert it from Reckless to Prudent debt."}
The TODO/FIXME conversion (Reckless → Prudent debt) hasn't been done.
Add \`// TODO: [what needs fixing] — [why it was deferred]\`. 10 seconds; prevents compounding.
{R4_CLOSE}`,
    },
    {
      option: 'Shortcut taken without a debt tag means it\'s invisible — no backlog item, no reminder, no context for the next person who reads it. Add a // TODO: or // FIXME: with what needs to be fixed and why it was deferred. Then it\'s Prudent Deliberate debt, not Reckless.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Shortcut taken without a backlog item, reminder, or context for the next reader — invisible debt formed."}
The visibility-tag for this shortcut hasn't been added.
Add \`// TODO:\` or \`// FIXME:\` with what to fix + why deferred. Then it's Prudent, not Reckless.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is the shortcut tagged with a TODO/FIXME? That\'s the minimum for Prudent Deliberate debt — acknowledge it so it\'s not forgotten.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Shortcut taken; not tagged with TODO/FIXME."}
The minimum debt-tag (TODO/FIXME) hasn't been added.
Add it now — acknowledge before forgetting.
{R4_CLOSE}`,
    },
    {
      option: 'Untagged shortcuts are invisible debt. Add // TODO: [what to fix] before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Untagged shortcut sitting in the code — invisible debt."}
Narrower: untagged shortcut visibility.
Add \`// TODO: [what to fix]\` before continuing.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Tag any shortcut with TODO/FIXME before moving on — untagged debt accumulates invisibly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Shortcut taken."}
Minimum next step: tag the shortcut with TODO/FIXME before moving on.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_TEST_DEPTH_CHECK_CASUAL: DecisionContent = {
  question:      'Tests written — covering beyond the happy path?',
  pinchFallback: 'Add edge and error path tests.',
  L1: [
    {
      option: 'Testing pyramid (Mike Cohn, 2009): tests must cover happy paths, edge cases, and negative scenarios. \'Start with happy path tests, then add error cases that verify graceful failure handling.\' Happy-path-only tests provide false confidence — everything looks green but real-world conditions break the code.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Wrote tests for the happy path only — no edge cases or negative scenarios yet."}
Test coverage beyond happy-path (edge cases + negative scenarios) hasn't been added.
Add edge-case + error-path tests; happy-path only is false confidence. Don't audit unrelated test suites.
{R4_CLOSE}`,
    },
    {
      option: 'Branch coverage over line coverage: every decision path needs a test. For what was just written — what are the edge cases? (empty input, null, boundary values). What are the error paths? (what happens when this fails). Add at least one test for each non-happy-path scenario.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Wrote tests by line coverage without ensuring branch coverage (every decision path tested)."}
Branch coverage for what was just built hasn't been verified — non-happy-path scenarios.
Per non-happy-path: empty input / null / boundary / error path. Add at least one test per scenario.
{R4_CLOSE}`,
    },
    {
      option: 'Add tests beyond the happy path in three categories: (1) boundary values — empty, null, max, min; (2) error paths — what happens when the operation fails; (3) negative tests — invalid input, unexpected state. Write at least one test per category for what was just built before moving on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Tests don't yet cover boundary values / error paths / negative tests."}
The three test-depth categories (boundary / error / negative) haven't been added.
One test per category: boundary (empty / null / max / min), error (operation failure), negative (invalid input / unexpected state).
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Do the tests cover edge cases (empty, null, boundary values) and error paths (what happens when this fails)? Happy path only is false confidence.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Happy-path-only tests; edge cases + error paths not covered."}
Edge case + error path coverage hasn't been added.
Add the missing tests before considering coverage adequate.
{R4_CLOSE}`,
    },
    {
      option: 'Add at least one edge case test and one error path test for what was just implemented before the tests are considered adequate.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tests don't yet cover at-least-one edge / error scenario."}
Narrower: at-least-one-edge + at-least-one-error test.
Add one of each before moving on.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Add edge case and error path tests — happy path only is incomplete coverage.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Wrote happy-path tests."}
Minimum next step: edge case + error path tests.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL: DecisionContent = {
  question:      'Architecture decision made — noted the rationale?',
  pinchFallback: 'Add an architecture note.',
  L1: [
    {
      option: 'Architecture Decision Records (Michael Nygard, 2011): \'An ADR captures a single architectural decision and its rationale. People months or years later need to understand why the system is constructed the way that it is.\' For the structural decision just made — add a short note: context, decision, consequences. A code comment block or doc entry works.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I made an architectural decision but didn't write down why."}
The rationale for the architectural decision just made hasn't been recorded.
Write a short ADR-style note now: context, decision, consequences. Code-comment block or doc entry. Don't expand scope to other decisions.
{R4_CLOSE}`,
    },
    {
      option: 'The question future maintainers will ask: \'why was it built this way?\' Without a note, that question has no answer. Minimum viable ADR: what was decided, why, and what the tradeoffs are. Keep doc/adr/ in the repo for significant decisions.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Picked an approach; didn't capture what was decided + why + tradeoffs."}
The minimum-viable ADR (what / why / tradeoffs) hasn't been written.
Capture the three in doc/adr/ — one paragraph is enough. Skip historical decisions; just this one.
{R4_CLOSE}`,
    },
    {
      option: 'Pattern choice, new abstraction layer, architectural tradeoff — these deserve a note. The code shows WHAT was done; only documentation shows WHY. Add a short rationale note before continuing — context disappears from memory faster than the code does.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Picked a pattern / introduced an abstraction layer without leaving a rationale note."}
The "why" behind the structural choice hasn't been documented — code shows WHAT, not WHY.
Add a short rationale note before context fades. Just this decision; don't backfill.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What was the rationale for the architectural decision just made? Add a short note — context, decision, and consequences. Even one paragraph captures what\'s needed.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Made an architectural call; didn't capture the rationale."}
Architectural-rationale capture (context / decision / consequences) hasn't been done.
Write the one-paragraph capture now.
{R4_CLOSE}`,
    },
    {
      option: 'Code shows what; only documentation shows why. Add an architecture note before the context is gone.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Took an architectural approach; context will fade if I don't note it."}
Narrower: rationale note before context fades.
Capture the why now — code already shows what.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Add a brief rationale note for the architectural decision — why this approach was chosen.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Made an architectural decision."}
Minimum next step: brief rationale note — why this approach.
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 5 D8 — pro_geek_soul cluster 2 (CASUAL register) ───────────────────

const ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL: DecisionContent = {
  question:      'New dependency added — evaluated it before adopting?',
  pinchFallback: 'Check the dependency before adding.',
  L1: [
    {
      option: 'NIST SSDF requires evaluating third-party components for maintenance status, license compatibility, and security properties before integration. For the dependency just added: Is it actively maintained (last release date, open issues trend)? Is the license compatible? Are there lighter-weight alternatives? A few minutes of evaluation now prevents being stuck with an abandoned or license-incompatible package later.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I just added a new dependency without evaluating it for maintenance status, license, or alternatives."}
The new dependency hasn't been evaluated against the third-party-component checks (maintenance, license, alternatives) before adoption.
Run the eval pass now: maintenance signals (last release, open issues), license compatibility, and lighter-weight alternative comparisons. Don't broaden into existing-deps audit in this pass.
{R4_CLOSE}`,
    },
    {
      option: 'Three things to check before committing to a new dependency: (1) maintenance status — last release date, whether the repo is active; (2) license compatibility — MIT/Apache are generally safe, GPL has restrictions; (3) bundle size impact — what does this add to the build? The smaller the scope of what\'s needed, the more alternatives to compare. Evaluate first, install after.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Added the dependency; didn't run the maintenance / license / bundle-size checks first."}
Pre-commit evaluation of this dependency (maintenance / license / bundle-size) hasn't been recorded.
Run the three checks: maintenance signals, license compatibility, bundle-size impact. Stop before broader project-deps audit.
{R4_CLOSE}`,
    },
    {
      option: 'Dependencies aren\'t free — they\'re ongoing maintenance commitments. Before adopting: check when it was last released, check whether there are lighter-weight alternatives that cover the needed scope, and confirm the license is compatible with the project. A package left unevaluated is a silent risk every time a security advisory hits.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Pulled in a new dependency without thinking about whether it's actively maintained or whether a lighter alternative exists."}
The maintenance-commitment evaluation for this dependency hasn't been done — last-release / alternatives / license remain unverified.
Confirm the dep is actively released, confirm no lighter-scope alternative exists, and confirm the license is compatible. Don't audit unrelated existing deps in this pass.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Before committing to this dependency: check maintenance status (last release date, open issues), license compatibility, and whether alternatives exist.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Added a new dep; didn't evaluate maintenance / license / alternatives."}
Pre-commit dependency evaluation hasn't been done.
Check maintenance status, license, and alternatives now before continuing.
{R4_CLOSE}`,
    },
    {
      option: 'Dependencies are ongoing maintenance commitments. Evaluate maintenance status, license, and alternatives before adopting.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Took on a new dependency without weighing the maintenance commitment."}
This dependency's ongoing-maintenance signals (status, license, alternatives) haven't been weighed.
Evaluate the three before continuing. Don't expand into a full project-wide deps sweep.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Check maintenance status, license compatibility, and alternatives before adding this dependency.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Added a dep; didn't audit it first."}
Pre-add dependency check (maintenance / license / alternatives) hasn't been done.
Run the minimum check on this single dependency now.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_SECURITY_REVIEW_GAP_CASUAL: DecisionContent = {
  question:      'Security surface touched — applied security checks?',
  pinchFallback: 'Apply security checks now.',
  L1: [
    {
      option: 'OWASP Secure by Design: security must be designed in, not bolted on. For what was just implemented — what security surfaces were introduced? Input validation (are all inputs sanitized?), authorization (is access properly gated?), injection prevention (SQL, command, path traversal). These checks belong during implementation, not as a post-implementation audit. Shift-left: add the check when the surface is created.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Touched security-relevant code (auth / data storage / input handling) without applying shift-left security checks."}
Security review (input validation / authorization / injection prevention) of the just-touched surfaces hasn't been done.
Per surface: confirm input sanitized, access gated, injection-safe (SQL / shell / path). Don't expand to unrelated surfaces.
{R4_CLOSE}`,
    },
    {
      option: 'Three security checks for implementation work: (1) input validation — all user-supplied values must be validated/sanitized before use; (2) authorization — is the action properly gated to the user who should be able to perform it; (3) injection prevention — SQL queries parameterized, shell commands avoided, file paths validated. Add these now while the code is in context, not after the feature is shipped.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Wrote implementation without the three implementation-phase security checks (input validation / authorization / injection prevention)."}
The three implementation-phase security checks haven't been done.
Add the three now while code is in context: input validation, authorization gating, injection-safe queries / commands / paths.
{R4_CLOSE}`,
    },
    {
      option: 'Security surfaces introduced during implementation: auth endpoints, data storage, user input, file handling. For each: is input validated? Is access gated? Is there injection risk? OWASP Top 10 covers the categories — what was just built touches which of these? Add the check as part of completing the feature, not as a separate hardening pass.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Touched auth / data storage / user input / file handling surfaces without the per-surface security check."}
The per-surface security check (validated / gated / injection-risk) hasn't been done.
Per surface: confirm the check; add as part of completing the feature, not a separate hardening pass.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'For what was just implemented: is input validated, is access properly authorized, and is there injection risk? These are implementation-phase checks, not post-ship.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Implementation done; security review (input / auth / injection) not done."}
The implementation-phase security review hasn't been done.
Verify input validation + authorization + injection risk before moving on.
{R4_CLOSE}`,
    },
    {
      option: 'Security checks (input validation, authorization, injection) belong during implementation — add them now before moving on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Wrote implementation; security checks deferred to post-ship instead of in-implementation."}
Narrower: security-check shift-left.
Add the checks now during implementation — not as a separate post-ship pass.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Apply input validation, authorization checks, and injection prevention for what was just built.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Implementation done."}
Minimum next step: input validation + authorization + injection prevention check.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_API_CONTRACT_DEFINITION_CASUAL: DecisionContent = {
  question:      'API being built — defined the contract first?',
  pinchFallback: 'Define the interface before implementing.',
  L1: [
    {
      option: 'OpenAPI contract-first principle: define the API interface before writing the handler. For the endpoint being built — what does it accept (request schema: required fields, types, validation rules)? What does it return (response schema: success shape, error shape, status codes)? What is the error response format? Defining this first prevents implicit contracts that drift between callers and implementors — and makes mock servers and tests possible before the backend exists.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Started building an endpoint without defining the request / response / error contract first."}
The API contract (request schema, response schema, error format) hasn't been defined before implementation.
Define request schema (fields + types + validation), response schema (success + error), error format now — before the handler. Just this endpoint.
{R4_CLOSE}`,
    },
    {
      option: 'Contract-first API development: the request schema, response schema, and error response format must be defined before implementation. Three things to specify: (1) what the request body/params accept; (2) what a successful response returns; (3) what error responses look like and under what conditions. Write these as a schema or doc comment before writing the handler logic.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Coded the handler before specifying what the request and response look like."}
The three contract specs (request / response / error) haven't been written.
Write the three as schema or doc-comment above the handler. Don't refactor other endpoints in this pass.
{R4_CLOSE}`,
    },
    {
      option: 'Building a route without a defined interface creates an implicit contract — the caller infers what to send and what to expect from the implementation, and both sides drift independently. Define the interface first: request shape, response shape, error cases. Minimum viable contract: a comment block with the schema above the handler.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Wrote the route without an explicit interface — the contract is implicit in the handler code."}
The explicit interface (request shape / response shape / error cases) hasn't been defined — callers infer from the implementation.
Write a comment block with the schema above the handler. Just this route.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Before implementing the endpoint: define the request schema, response schema, and error response format. Interface-first prevents implicit contracts.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Implementing the endpoint without defining the contract first."}
Pre-implementation contract definition (request / response / error) hasn't been done.
Write the three now — interface-first prevents implicit-contract drift.
{R4_CLOSE}`,
    },
    {
      option: 'What does this API accept and return? Define the contract before writing the handler logic — implicit contracts drift between callers and implementors.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building the handler; what it accepts and returns hasn't been pinned down explicitly."}
Narrower: accepts / returns / error definition.
Define the contract above the handler before continuing.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Define the request schema, response schema, and error response format before writing the handler.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Writing an endpoint."}
Minimum next step: define request schema + response schema + error format.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL: DecisionContent = {
  question:      'Implementation done — covered the error paths?',
  pinchFallback: 'Add error handling for failure cases.',
  L1: [
    {
      option: 'McConnell\'s defensive programming (Code Complete): \'Defensive programming mandates covering all failure paths, not just happy paths.\' For what was just implemented — what are the error states? What happens when an external call fails? What happens when input is malformed? What happens when a database write fails? Each needs explicit handling: error state, fallback behavior, user-facing message. Code that only works on the happy path is incomplete by construction standards.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Wrote happy-path logic without explicit handling for external-call failures, malformed input, or DB-write failures."}
Error-path coverage (external failures / malformed input / DB / edge states) for what was just built hasn't been verified.
Per error state: explicit handling + fallback + user-facing message. Happy-path-only is incomplete by construction standards.
{R4_CLOSE}`,
    },
    {
      option: 'Three error-path categories for every implementation: (1) external service failures — what if the API call, database query, or file operation fails; (2) input validation failures — malformed data, missing required fields, out-of-range values; (3) edge state failures — empty result sets, concurrent writes, unexpected null. Add explicit handling for each category before the feature is considered done.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Implementation done; three error-path categories (external / input / edge) not handled explicitly."}
The three error-path categories haven't been covered.
Per category — external service failures / input validation failures / edge state failures — add explicit handling. Before "done".
{R4_CLOSE}`,
    },
    {
      option: 'The happy path is the easy path — every real-world user hits an error case eventually. For what was just built: what error states exist? Is there an error boundary? Is there a fallback? Does the error surface as a useful message or as a silent failure? Add error handling now while the implementation is in context, not during the first production incident.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Happy path implemented; error states + boundaries + fallbacks not explicitly handled."}
The error-state / error-boundary / fallback / user-facing-message coverage hasn't been added.
Per error state: confirm explicit handling now while implementation is in context — not during first production incident.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does the implementation cover error paths — external failures, malformed input, and edge states? Happy path only is incomplete by construction standards.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Implementation done; error-path coverage (external / input / edge) not confirmed."}
Error-path coverage hasn't been confirmed.
Walk through external failures / malformed input / edge states; add handling per category.
{R4_CLOSE}`,
    },
    {
      option: 'Add explicit error handling for failure cases before moving on — what happens when this breaks in production?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Implementation done; failure-mode handling not explicit."}
Narrower: explicit failure-mode handling.
Add it now — what happens when this breaks in production?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Add error handling for failure paths — external failures, malformed input, and edge states.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Implementation done."}
Minimum next step: error handling for failure paths — external / input / edge.
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 5 D9 — pro_geek_soul cluster 3 (CASUAL register) ───────────────────

const ABSENCE_REFACTORING_CHECKPOINT_CASUAL: DecisionContent = {
  question:      'Adding to messy code — refactored first?',
  pinchFallback: 'Do a cleanup pass before extending.',
  L1: [
    {
      option: 'Boy Scout Rule (Clean Code): \'Leave the code cleaner than you found it.\' Before adding a feature to code that was already acknowledged as messy or complex — do a refactoring pass first. The alternative is adding features on top of complexity, which makes the next change harder, not the same difficulty. The refactoring pass before extending is the investment that prevents compound complexity debt.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to add a feature to code I already noticed was messy without doing a refactor pass first."}
A pre-extension refactor pass on the existing messy code hasn't been done.
Apply Boy Scout Rule: clean before extending — extract repeated logic, simplify conditionals, rename confusing parts. Stop at the cleanup; defer the feature add until after.
{R4_CLOSE}`,
    },
    {
      option: 'Adding to messy code without cleaning it first means the next developer (including future you) inherits the original mess plus the new feature built on top of it. Before extending: extract repeated logic into helpers, simplify conditionals, rename confusing variables. The feature addition is then built on clean ground, not on accumulated complexity.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to extend messy code without first cleaning it — feature would land on top of accumulated mess."}
The pre-extension cleanup hasn't been done — feature add would land on accumulated mess.
Extract repeated logic into named helpers; simplify the messy spots; rename confusing variables; then extend. Don't extend yet.
{R4_CLOSE}`,
    },
    {
      option: 'Three things to do before extending complex code: (1) extract any repeated logic into well-named helpers; (2) simplify long conditionals or deeply nested blocks; (3) rename anything that required a comment to explain. Then add the feature. The Boy Scout Rule applies here: leave the code cleaner than you found it, not messier than you found it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to extend complex code without first extracting / simplifying / renaming."}
The three pre-extension cleanup steps (extract / simplify / rename) haven't been done.
Apply the three: extract repeated logic, simplify nested blocks, rename anything that needed a comment. Cleaner ground first, feature second.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Before adding to the existing messy or complex code: do a refactoring pass first. Extract, simplify, rename — then extend. Building on top of complexity doubles it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to add to messy code without a cleanup pass."}
Lighter: cleanup pass before the feature add hasn't been done.
Extract / simplify / rename first — building on complexity doubles it.
{R4_CLOSE}`,
    },
    {
      option: 'The cleanup pass before the feature is the investment that prevents compound debt. What can be extracted, simplified, or renamed before adding to this?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to extend the code; haven't surveyed what to extract / simplify / rename first."}
Narrower: extract / simplify / rename survey.
Identify what to refactor before adding to this.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Do a refactoring pass on the existing code before extending — leave it cleaner than you found it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to extend messy code."}
Minimum next step: a refactor pass on the existing code before extending.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL: DecisionContent = {
  question:      'Interface changed — checked existing consumers?',
  pinchFallback: 'Check what calls this before changing.',
  L1: [
    {
      option: 'Semantic Versioning (semver.org): MAJOR version = backwards-incompatible change. The formal rule: any change to an interface used by existing callers must enumerate those callers and assess the impact before implementation. For the function signature, API contract, or interface just changed — what calls it? What are the downstream effects? Have those callers been updated or is the change backwards-compatible?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Changed an interface signature / API contract without first enumerating who depends on it."}
Existing callers of the interface haven't been enumerated before the change.
Grep for callers; assess each one's expectation; confirm backwards-compatible OR plan caller updates. Just this interface; don't audit unrelated ones.
{R4_CLOSE}`,
    },
    {
      option: 'Hyrum\'s Law: \'With a sufficient number of users of an API, it does not matter what you promise in the contract — all observable behaviors will be depended on by somebody.\' The practical implication: before changing any interface, find all callers (grep the codebase), assess what each expects, and either maintain compatibility or update each caller explicitly. Silent interface breaks cause runtime errors that show up later, not at the point of change.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Changed an interface — assumed callers handle it without checking what they actually rely on."}
Caller-impact assessment for the interface change hasn't been done.
Find all callers (grep), check what each expects, decide: maintain compatibility OR update each caller. List + plan only; no caller edits yet.
{R4_CLOSE}`,
    },
    {
      option: 'Three steps before changing a function signature or API contract: (1) grep for all callers; (2) check whether the change is backwards-compatible or breaking; (3) if breaking — update all callers, or version the interface. A change made without step 1 is a change made blind. The downstream breakage shows up at runtime, not at compile.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Made a signature change without grepping for callers first."}
The pre-change caller-grep + compatibility-vs-breaking decision hasn't been made.
Run the three steps: grep callers, classify compat-vs-break, plan version-or-update path. Don't ship the change yet.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Before the interface change: enumerate all callers, assess whether the change is backwards-compatible, and update any affected consumers. Changes made blind cause silent runtime breaks.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to change an interface; haven't enumerated callers yet."}
Pre-change caller-enumeration hasn't been done.
Find callers + assess compat + plan path before the change ships.
{R4_CLOSE}`,
    },
    {
      option: 'What calls this? Grep for it before changing — then decide whether to maintain compatibility or update all callers explicitly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Changing the interface; didn't check what calls it."}
Narrower: what-calls-this caller grep.
Run the grep + decide compatible-or-update path.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Check all callers of this interface before changing it — update or version any that are affected.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Interface change in progress."}
Minimum next step: check all callers before changing — update or version any affected.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_SELF_REVIEW_HABIT_CASUAL: DecisionContent = {
  question:      'Long implementation run — done a review pass?',
  pinchFallback: 'Read back through what was built.',
  L1: [
    {
      option: 'Google Engineering Practices: \'The author is the first reviewer.\' Before submitting or continuing, read back through the diff: does the code do what was intended? Are there naming inconsistencies? Is anything more complex than it needs to be? Are tests missing? The self-review pass catches what was obvious in the context of writing but invisible in isolation — logic errors, naming drift, gaps in coverage.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long implementation run without a diff-readback self-review pass."}
The diff-readback self-review hasn't been done.
Read back through the diff: intent match / naming inconsistencies / unneeded complexity / missing tests. Catch what was obvious in writing but invisible in isolation.
{R4_CLOSE}`,
    },
    {
      option: 'A 15-prompt implementation run without a review pass is a run where each decision was made in context but never assessed as a whole. Read back through what was built: does the overall structure make sense? Are there inconsistencies between early and late decisions? Did anything get added that\'s redundant or conflicts with earlier code? The review pass is the quality gate that catches accumulated drift.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "15+ prompt implementation run without an end-to-end whole-implementation assessment."}
The end-to-end whole-implementation assessment hasn't been done.
Read back through; check overall structure / early-vs-late decision consistency / redundancy / conflicts. Quality gate against accumulated drift.
{R4_CLOSE}`,
    },
    {
      option: 'Three things to check in a self-review pass: (1) does the implementation match the original intent — were any assumptions made that drifted from the goal; (2) naming and structure coherence — do variable and function names still make sense given the full implementation; (3) coverage gaps — are there paths or states that were implemented but not tested. Read the diff before moving on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Implementation run finished without the three self-review checks (intent-match / naming-structure-coherence / coverage gaps)."}
The three self-review checks haven't been done.
Read the diff: intent-match + naming-structure coherence + coverage gaps. Before continuing.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Read back through the implementation before continuing: does it make sense as a whole? Check for naming drift, structural inconsistencies, and coverage gaps.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long implementation run; haven't read back through the diff."}
The diff-readback hasn't been done.
Read it; check naming drift / structural inconsistencies / coverage gaps.
{R4_CLOSE}`,
    },
    {
      option: 'The self-review pass catches what was invisible in the context of writing. Read the diff — does this all hang together?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Run done; whole-implementation cohesion check not done."}
Narrower: whole-implementation cohesion check.
Read the diff — does it all hang together?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Do a review pass on what was built — read the diff and check for drift, gaps, and inconsistencies.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long implementation run done."}
Minimum next step: diff-readback for drift / gaps / inconsistencies.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_PERFORMANCE_AWARENESS_CASUAL: DecisionContent = {
  question:      'Data-heavy operation — considered performance?',
  pinchFallback: 'Check for performance implications.',
  L1: [
    {
      option: 'Knuth (1974): \'We should not pass up our opportunities in that critical 3%.\' The full quote is not an excuse to avoid performance — it\'s a prioritization rule: ignore the 97% of noncritical paths, but act on the critical 3%. For what was just built — is this in the critical 3%? A full-table fetch, N+1 in a loop, or unthrottled list render qualifies. The check here is awareness, not micro-optimization: is there an obvious performance problem worth addressing before it ships?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built data-heavy operation without checking if it falls into the Knuth-3%-critical-path category (N+1 / full-table / unthrottled render)."}
Critical-3%-path awareness check (N+1 / full-table fetch / unthrottled render) hasn't been done.
Identify whether this falls in the critical 3%; if yes, flag the obvious performance problem before ship. Don't micro-optimize unrelated code.
{R4_CLOSE}`,
    },
    {
      option: 'Three data-heavy patterns that require a performance check before shipping: (1) N+1 queries — does this loop trigger a database call per iteration; (2) full-table fetches — is the query unbounded and potentially returning thousands of records; (3) expensive renders — is a large list rendering without virtualization, memoization, or lazy loading. These are not premature optimization targets — they\'re known problem patterns with well-understood solutions.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built data-heavy operation; haven't audited for N+1 / full-table / expensive-render patterns."}
The three data-heavy-pattern check (N+1 / unbounded fetch / expensive unthrottled render) hasn't been done.
Per pattern: confirm presence-or-absence; flag the obvious-problem instances. Just this operation.
{R4_CLOSE}`,
    },
    {
      option: 'Performance awareness for this operation: what is the data volume? What happens at 10x, 100x the expected load? Is there an N+1 pattern? Is there pagination? Is there a memo or cache in front of an expensive computation? The question is not \'is this perfectly optimized?\' — it is \'is there an obvious performance problem that will hit in production that could be caught now?\'',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Wrote the operation; haven't asked what happens at 10x / 100x the expected load."}
The data-volume + load-projection awareness hasn't been done.
Ask: data volume / 10x-100x behavior / N+1 / pagination / memo or cache. Flag obvious problems; not micro-optimization.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'For the data-heavy operation just built: check for N+1 queries, unbounded fetches, and expensive unthrottled renders before this ships.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Data-heavy operation done; performance check not done."}
The performance awareness check (N+1 / unbounded fetches / expensive renders) hasn't been done.
Check the three; flag findings.
{R4_CLOSE}`,
    },
    {
      option: 'Performance awareness at the right time — not micro-optimization, just checking: is there an obvious performance problem in what was just built?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; haven't asked is-there-an-obvious-perf-problem."}
Narrower: obvious-performance-problem awareness.
Check now; address before ship.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Check for N+1 queries, unbounded fetches, or expensive renders before this feature ships.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Data-heavy operation built."}
Minimum next step: check for N+1 / unbounded fetches / expensive renders before ship.
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 5 D10 — hardcore_pro cluster 1 (FORMAL register) ───────────────────

const ABSENCE_DECISION_RECORD_ABSENCE_FORMAL: DecisionContent = {
  question:      'Architectural decision made — ADR recorded?',
  pinchFallback: 'Record the decision with context and consequences.',
  L1: [
    {
      option: 'Write an architecture decision record for the key design decision made here: document the context (what problem was being solved), the decision made, the alternatives that were considered and rejected, and the consequences — so future engineers understand why this exists as it does.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Architectural decision just made without an ADR written to capture rationale."}
An architecture decision record for this design decision hasn't been written — design rationale risks being lost as team composition changes.
Document: context / decision / alternatives considered + rejected / consequences.
{R4_CLOSE}`,
    },
    {
      option: 'Create an ADR capturing this architectural decision: what was decided, what were the alternatives, what tradeoffs were accepted, and what constraints or assumptions this decision depends on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "ADR with tradeoffs + assumptions not written."}
The ADR with tradeoffs + assumptions hasn't been written.
Decided / alternatives / tradeoffs accepted / constraints + assumptions.
{R4_CLOSE}`,
    },
    {
      option: 'Record this architectural decision before the session ends: context, decision, consequences, alternatives considered — without this, the design rationale will be lost as team composition or memory changes.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "End-of-session ADR write not done."}
The pre-session-end ADR write hasn't been done.
Context / decision / consequences / alternatives — lost otherwise as team or memory changes.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Write an ADR for this decision — context, decision, consequences, and alternatives considered.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Decision made."}
Lighter: ADR with context / decision / consequences / alternatives.
{R4_CLOSE}`,
    },
    {
      option: 'Document the key architectural decision made here: what was decided and why, and what the main alternative was.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Decision made."}
Narrower: key decision + why + main alternative.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Write an ADR for this decision: context, decision, consequences, and alternatives considered.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Decision made."}
Minimum next step: ADR with context / decision / consequences / alternatives.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_OVER_ENGINEERING_CHECK_FORMAL: DecisionContent = {
  question:      'Is this abstraction required by current requirements?',
  pinchFallback: 'Apply YAGNI — build only what current requirements require.',
  L1: [
    {
      option: 'Apply YAGNI to what was just built: identify any abstraction, interface, or configuration option that was added speculatively — not required by a current story or use case — and remove or defer it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Speculative abstractions added without current requirements justifying them."}
YAGNI hasn't been applied to what was just built — speculative abstractions accumulate as code with no current consumer.
Identify: abstraction / interface / config option added speculatively / remove or defer.
Still, before you delete or restructure any code you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Audit what was just built for speculative design: flag any abstraction layer, plugin interface, or extensibility mechanism that has no current consumer, and propose removing or simplifying it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Speculative-design audit not done."}
The speculative-design audit hasn't been done.
Flag: abstraction layer / plugin interface / extensibility mechanism with no current consumer / remove or simplify.
Still, before you delete or simplify any code you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Apply YAGNI: for each abstraction in what was just built, confirm there is a current requirement that justifies it — if not, propose the simpler implementation that still satisfies the present use case.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Per-abstraction current-requirement check not done."}
The per-abstraction requirement-check hasn't been done.
Per abstraction: current requirement justifies? / simpler-implementation proposal if not.
Still, before you delete or replace any abstraction in code you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Apply YAGNI to what was just built — identify and remove any abstraction not required by a current story or use case.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Code just built."}
Lighter: YAGNI — identify + remove unrequired abstraction.
Still, before you delete any abstraction you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Is there any abstraction in what was just built that has no current consumer? If so, propose removing it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Code just built."}
Narrower: any-no-current-consumer abstraction → propose removal.
Still, before you remove any abstraction you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Apply YAGNI — remove speculative abstraction and implement only what current requirements require.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Code just built."}
Minimum next step: YAGNI — remove speculative + implement current-requirement only.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

const ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL: DecisionContent = {
  question:      'Critical implementation complete — review plan established?',
  pinchFallback: 'Establish a review plan before merging.',
  L1: [
    {
      option: 'Establish a review plan for this change before merging: define who reviews it, what the review checklist covers (design correctness, error handling, edge cases, security, performance implications), and what the merge gate is — confirm the plan is in place before the branch is merged.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Critical change about to merge without a review plan established."}
A review plan for this change hasn't been established — risk of merging without checklist coverage of design / errors / edge cases / security.
Define: reviewer / checklist (design / errors / edge cases / security / performance) / merge gate — pre-merge.
{R4_CLOSE}`,
    },
    {
      option: 'Define a review checklist for this change: design correctness, error handling completeness, edge case coverage, security implications, and any performance concerns — then assign reviewers and set a merge gate before proceeding.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Review checklist + reviewer + merge gate not defined."}
The checklist + reviewer + merge-gate triple hasn't been defined.
Checklist / assigned reviewer / merge gate set pre-proceed.
{R4_CLOSE}`,
    },
    {
      option: 'Complete a structured review of what was just built: verify the design decision, check error handling for every failure path, confirm edge cases are covered, and flag any security implications before this merges.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Structured review of build not completed."}
The structured-review completion hasn't been done.
Design decision verified / per-failure-path error handling / edge-case coverage / security flag — pre-merge.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Set up a review plan for this change: define the checklist, assign reviewers, and set a merge gate before merging.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Change pending merge."}
Lighter: checklist + reviewers + merge gate pre-merge.
{R4_CLOSE}`,
    },
    {
      option: 'What is the review plan for this change? Who reviews it, what does the checklist cover, and what is the merge gate?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Change pending merge."}
Narrower: who reviews / checklist scope / merge gate.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Establish and complete a review plan before merging — design correctness, error handling, security surface.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Change pending merge."}
Minimum next step: review plan — design / errors / security — pre-merge.
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 5 D11 — hardcore_pro cluster 2 (FORMAL register) ───────────────────

const ABSENCE_OBSERVABILITY_FIRST_FORMAL: DecisionContent = {
  question:      'Feature shipping — observability instrumented?',
  pinchFallback: 'Add logging, metrics, and tracing before shipping.',
  L1: [
    {
      option: 'Add observability to this feature before shipping: instrument all three pillars — structured logging at each significant event boundary, metrics for request rate, error rate, and latency, and distributed trace spans for every external call — so production behavior is visible from day one.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature about to ship without observability across the three pillars."}
Observability instrumentation (logs / metrics / traces) hasn't been added — production behaviour invisible from day one.
Three pillars: structured logging at event boundaries / metrics (RPS, error rate, latency) / trace spans per external call.
Still, before you add instrumentation across multiple files you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Define and implement the observability strategy for this feature before it ships: what events get logged (and at what level), what metrics are emitted, and what trace spans are added for every external dependency call.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Observability strategy definition + implementation not done."}
The strategy + implementation pair hasn't been done.
Events logged + level / metrics emitted / trace spans per external-dep call.
Still, before you implement instrumentation across multiple files you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Instrument this feature with logs, metrics, and traces before shipping: confirm all three observability pillars are in place, that the metrics are wired to dashboards, and that alerts are defined before launch.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Three-pillar instrumentation + dashboard wire-up + alerts not in place."}
The instrumentation + dashboard + alerts triple hasn't been done.
Logs + metrics + traces / metrics → dashboards / alerts defined pre-launch.
Still, before you add instrumentation, dashboards, or alerts across the codebase you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Add logging, metrics, and distributed tracing to this feature before shipping — all three observability pillars required.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Lighter: logs + metrics + tracing — all three required.
{R4_CLOSE}`,
    },
    {
      option: 'What logs, metrics, and trace spans does this feature emit? Confirm all three are in place before it ships.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Narrower: per-pillar emission audit pre-ship.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Add logging, metrics, and tracing instrumentation before shipping — all three pillars required.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Minimum next step: instrument all three pillars pre-ship.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

const ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL: DecisionContent = {
  question:      'External dependencies integrated — failure modes enumerated?',
  pinchFallback: 'Enumerate failure modes for each dependency.',
  L1: [
    {
      option: 'Enumerate failure modes for every external dependency this feature relies on: for each dependency, name the failure mode (timeout, error response, partial data, unavailability), specify the stability pattern that handles it (circuit breaker, timeout + fallback, bulkhead, retry with backoff), and confirm the pattern is implemented before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature uses external dependencies without failure modes enumerated per dependency."}
Failure modes for external dependencies haven't been enumerated — risk of cascading failure when a dependency fails.
Per dependency: failure mode / stability pattern (circuit breaker / timeout+fallback / bulkhead / retry+backoff) / implemented pre-ship.
Still, before you implement any stability pattern across multiple files you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Identify the top three external dependencies in this feature and define the failure behavior for each: what happens when each dependency is slow, returns an error, or is unavailable — and what stability pattern prevents cascading failure.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Top-3 external deps + per-failure-behaviour not defined."}
The top-3-deps + per-behaviour definition hasn't been done.
Slow / error / unavailable per dep / stability pattern preventing cascade.
Still, before you implement any stability pattern in the codebase you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Audit every external call in this feature for failure handling: confirm each has a timeout, a defined error response, and a documented degradation path.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Per-external-call failure-handling audit not done."}
The per-call failure-handling audit hasn't been done.
Timeout / defined error response / documented degradation path per external call.
Still, before you add timeouts or error-handling across multiple call sites you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'For each external dependency in this feature: name the failure mode and confirm the stability pattern (circuit breaker, timeout, fallback) is in place.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "External deps in feature."}
Lighter: per-dep failure mode + stability pattern in place.
{R4_CLOSE}`,
    },
    {
      option: 'What is the worst failure scenario for this feature\'s most critical external dependency, and is there a stability pattern preventing it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "External deps in feature."}
Narrower: worst-failure + critical-dep + stability pattern preventing.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Enumerate failure modes for each dependency and specify the stability pattern for each before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "External deps in feature."}
Minimum next step: enumerate failure modes + stability pattern per dep pre-ship.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

const ABSENCE_CONTRACT_TESTING_GAP_FORMAL: DecisionContent = {
  question:      'Service boundary established — contract tests defined?',
  pinchFallback: 'Define consumer-driven contract tests for this boundary.',
  L1: [
    {
      option: 'Define consumer-driven contract tests for this service boundary before independent deployment: write the contract from the consumer\'s perspective, verify the provider satisfies it in isolation, and add provider verification to the CI pipeline.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Service boundary about to be deployed independently without contract tests."}
Consumer-driven contract tests for this service boundary haven't been defined — risk of breaking-change surprises during independent deployment.
Consumer-perspective contract / provider verifies in isolation / CI pipeline provider-verification gate.
{R4_CLOSE}`,
    },
    {
      option: 'Write contract tests that verify this service\'s API from the consumer\'s view: define the expected request/response shape, the error responses, and the versioning behavior — independently of the provider\'s implementation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Consumer-view contract-test write not done."}
The consumer-view contract-test write hasn't been done.
Request/response shape / error responses / versioning behaviour — independent of provider impl.
{R4_CLOSE}`,
    },
    {
      option: 'Establish a contract testing gate for this service boundary: define what the consumer expects, implement provider verification, and confirm the CI pipeline enforces it before any consumer or provider changes ship independently.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "CI-enforced contract-testing gate not established."}
The CI-enforced contract-testing gate hasn't been established.
Consumer expectations / provider verification impl / CI enforcement pre-independent-ship.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Write consumer-driven contract tests for this service boundary — define the contract from the consumer\'s perspective and verify the provider satisfies it in isolation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Service boundary in use."}
Lighter: consumer-driven contract / provider satisfies in isolation.
{R4_CLOSE}`,
    },
    {
      option: 'Define the expected API contract for this service boundary and implement provider verification before independent deployment.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Service boundary in use."}
Narrower: API contract + provider verification pre-independent-deploy.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Define consumer-driven contract tests for this service boundary before independent deployment.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Service boundary in use."}
Minimum next step: consumer-driven contract tests pre-independent-deploy.
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 5 D12 — hardcore_pro clusters 3+4 (FORMAL register) ────────────────

const ABSENCE_CAPACITY_PLANNING_GAP_FORMAL: DecisionContent = {
  question:      'Load-adding feature — capacity estimate done?',
  pinchFallback: 'Complete a capacity estimate before shipping.',
  L1: [
    {
      option: 'Estimate capacity requirements for this feature before shipping: project peak request rate (RPS), storage growth over 90 days, and required infrastructure headroom — then verify current infrastructure can serve the estimated peak load.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature adds load but capacity estimate not done."}
Capacity estimate for this feature hasn't been completed — risk of infrastructure saturation post-launch.
Project: peak RPS / 90-day storage growth / infra headroom — verify current infra serves estimated peak.
{R4_CLOSE}`,
    },
    {
      option: 'Define capacity targets for this feature: what is the expected RPS at launch and at 10× scale, what is the storage growth rate, and is current provisioning sufficient for each?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Capacity targets at launch + 10× scale not defined."}
The launch + 10× capacity targets haven't been defined.
RPS at launch + 10× / storage growth rate / current provisioning sufficient per each.
{R4_CLOSE}`,
    },
    {
      option: 'Audit infrastructure requirements for this feature: estimate peak load, define headroom thresholds, and confirm monitoring alerts are in place before any metric approaches the estimated saturation point.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Headroom thresholds + saturation monitoring not in place."}
The headroom + saturation-monitoring setup hasn't been done.
Peak load / headroom thresholds / monitoring alerts pre-saturation-approach.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Estimate peak RPS, storage growth over 90 days, and infrastructure headroom for this feature before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Lighter: peak RPS + 90-day storage + infra headroom estimate pre-ship.
{R4_CLOSE}`,
    },
    {
      option: 'At what RPS does this feature saturate its current infrastructure, and is that load likely within the next 90 days?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Narrower: saturation RPS + 90-day likelihood.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Capacity estimate required: RPS at peak, storage growth rate, infrastructure headroom. Provide all three before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Minimum next step: RPS + storage growth + headroom — all three pre-ship.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_SECURITY_THREAT_MODELING_FORMAL: DecisionContent = {
  question:      'Security-sensitive feature — STRIDE threat model completed?',
  pinchFallback: 'Complete a STRIDE threat model before shipping.',
  L1: [
    {
      option: 'Enumerate applicable STRIDE threats for this feature and define a mitigation control per threat: Spoofing (identity verification), Tampering (input validation + integrity checks), Repudiation (audit logging), Information Disclosure (data exposure scope), Denial of Service (rate limiting + timeouts), Elevation of Privilege (authorization checks) — confirm each relevant threat has a control before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Security-sensitive feature pending ship without STRIDE threat model."}
STRIDE threat model for this feature hasn't been completed — risk of un-mitigated attack vectors at ship.
Per STRIDE category: Spoofing / Tampering / Repudiation / Info Disclosure / DoS / Elevation — control per relevant threat pre-ship.
Still, before you implement any security control in code you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Apply STRIDE to this feature\'s threat surface: for each applicable threat category, name the attack vector, identify the data or component at risk, and define the control that mitigates it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "STRIDE-to-threat-surface application not done."}
The STRIDE → threat-surface application hasn't been done.
Per category: attack vector / at-risk data or component / mitigating control.
Still, before you implement any mitigating control in code you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Threat-model this feature using STRIDE categories: enumerate threats, assign severity, and confirm each threat has a documented mitigation or an accepted-risk decision before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "STRIDE threats + severity + mitigation/accepted-risk not documented."}
The threats + severity + mitigation-or-accepted-risk documentation hasn't been done.
Enumerate / severity / mitigation OR accepted-risk decision per threat pre-ship.
Still, before you implement any security mitigation in code you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Identify the top three STRIDE threats for this feature and define mitigation controls for each.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Security-sensitive feature."}
Lighter: top-3 STRIDE threats + mitigation per.
{R4_CLOSE}`,
    },
    {
      option: 'Apply STRIDE to this feature: for each applicable category, what is the threat and what control mitigates it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Security-sensitive feature."}
Narrower: per-category threat + mitigating control.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'STRIDE threat model required: enumerate applicable threats and define mitigation controls before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Security-sensitive feature."}
Minimum next step: STRIDE enumerate + mitigation controls pre-ship.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

const ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL: DecisionContent = {
  question:      'Schema change — expand-migrate-contract pattern applied?',
  pinchFallback: 'Apply backwards-compatible phased migration.',
  L1: [
    {
      option: 'Apply the expand-migrate-contract sequence to this database change: confirm the schema change can be split into a backward-compatible add phase, a data migration phase, and a cleanup phase — so each phase deploys independently without downtime or rollback risk.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Schema change pending without expand-migrate-contract sequencing."}
Expand-migrate-contract safety check for this schema change hasn't been applied — risk of destructive single-step migration without rollback.
3 phases: backward-compatible add / data migration / cleanup — each deploys independently no-downtime no-rollback-risk.
Still, before you run any schema migration you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Verify this migration is reversible and safe under concurrent writes: confirm no destructive operation (DROP, NOT NULL without default, column rename) occurs in a single migration step, and that the expand-migrate-contract pattern applies.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Reversibility + concurrent-write safety not verified."}
The reversibility + concurrent-write-safety verification hasn't been done.
No single-step destructive (DROP / NOT NULL no-default / rename) / expand-migrate-contract applies.
Still, before you run any schema migration you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Audit this database migration for safety: identify any destructive schema changes, verify backward compatibility during the migration window, and confirm rollback is possible at each step.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Migration safety audit not done."}
The migration safety audit hasn't been done.
Destructive changes identified / backward compat during window / rollback per step.
Still, before you apply any destructive schema change you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Verify this migration uses the expand-migrate-contract pattern — confirm no destructive schema operation happens in a single deployment step.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Schema change pending."}
Lighter: expand-migrate-contract pattern verified — no single-step destructive.
Still, before you run any schema migration you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Is this migration reversible? Can it be rolled back without data loss if the deployment is reverted mid-migration?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Schema change pending."}
Narrower: reversible + no-data-loss-on-mid-migration-revert.
Still, before you run any schema migration you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Expand-migrate-contract required: no destructive schema changes in a single deployment. Phase across multiple deployments.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Schema change pending."}
Minimum next step: phase the schema change across deployments.
Still, before you run any schema migration you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

const ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL: DecisionContent = {
  question:      'Significant feature shipping — deployment strategy defined?',
  pinchFallback: 'Define deployment strategy and rollback plan before shipping.',
  L1: [
    {
      option: 'Define the deployment strategy for this feature before shipping: choose the strategy (canary, feature flag, blue-green, staged rollout), define the rollback procedure, and confirm the rollback can be completed within the acceptable downtime window.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Significant feature pending ship without deployment strategy."}
Deployment strategy and rollback plan haven't been defined — risk of un-isolated full-traffic deploy.
Strategy: canary / feature flag / blue-green / staged rollout / rollback procedure / rollback within downtime window.
Still, before you trigger any deployment you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Establish a deployment plan for this feature: what strategy isolates risk (canary or staged rollout), what signals trigger an abort, and what the rollback procedure is if those signals are observed post-deploy.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Risk-isolating strategy + abort signals + rollback not defined."}
The strategy + abort-signals + rollback definition hasn't been done.
Risk-isolating strategy / abort signals / rollback procedure on signals observed post-deploy.
Still, before you trigger any deployment you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Audit deployment readiness: confirm deployment strategy, verify rollback procedure, and check that monitoring is in place to detect a failed deploy before it reaches full traffic.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Deployment readiness audit not done."}
The deployment readiness audit hasn't been done.
Strategy confirmed / rollback verified / failed-deploy-detection monitoring pre-full-traffic.
Still, before you trigger any deployment you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Define deployment strategy and rollback plan for this feature before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Lighter: strategy + rollback plan pre-ship.
Still, before you trigger any deployment you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'What is the deployment strategy for this feature, and what triggers a rollback if the deploy fails?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Narrower: strategy + rollback trigger on deploy-fail.
Still, before you trigger any deployment you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Define deployment strategy (canary/feature flag/blue-green/staged) and rollback plan before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Minimum next step: strategy (canary/flag/blue-green/staged) + rollback pre-ship.
Still, before you trigger any deployment you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

const ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL: DecisionContent = {
  question:      'New service/feature shipping — operational runbook written?',
  pinchFallback: 'Write the runbook before shipping.',
  L1: [
    {
      option: 'Write the operational runbook for this feature before shipping: document what the feature does, how to deploy it, the key health metrics to monitor, how to diagnose the most likely failure scenarios, and the escalation path if on-call cannot resolve the issue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "New service/feature pending ship without operational runbook."}
Operational runbook for this feature hasn't been written — risk of on-call without diagnostic or escalation path when the feature fails.
Document: what / deploy / key health metrics / diagnose likely failures / escalation path.
{R4_CLOSE}`,
    },
    {
      option: 'Define the operational documentation for this feature: deployment steps, expected normal behavior, failure indicators, debug steps for the top three failure modes, and escalation contacts.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Operational docs not defined."}
The operational-docs definition hasn't been done.
Deploy steps / normal behaviour / failure indicators / top-3 debug steps / escalation contacts.
{R4_CLOSE}`,
    },
    {
      option: 'Write the runbook before this ships: what it does, how it is deployed, how to confirm it is healthy, how to debug it when it is not, and who to escalate to.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Pre-ship runbook write not done."}
The pre-ship runbook write hasn't been done.
What / deploy / health-confirm / debug-when-not-healthy / escalate-to.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Write the runbook for this feature before shipping — cover deploy steps, health metrics, failure scenarios, and escalation path.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Lighter: deploy + health + failure scenarios + escalation pre-ship.
{R4_CLOSE}`,
    },
    {
      option: 'Document how to debug this feature when it is misbehaving in production — the top two or three failure modes and how to diagnose each.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Narrower: top 2-3 failure modes + diagnostic per.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Write the runbook before shipping: what it does, how to debug failures, key metrics, and escalation path.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Minimum next step: runbook — what / debug / metrics / escalation.
{R4_CLOSE}`,
    },
  ],
};

const ABSENCE_SLO_DEFINITION_GAP_FORMAL: DecisionContent = {
  question:      'User-facing feature/service — SLOs defined?',
  pinchFallback: 'Define SLOs before shipping.',
  L1: [
    {
      option: 'Define SLOs for this feature before shipping: specify the availability target, the latency p99 budget, and the error rate budget — then confirm alerting and on-call escalation are tied to each SLO before launch.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "User-facing feature/service pending ship without SLOs defined."}
SLOs for this feature haven't been defined — risk of un-evaluable service-quality contract with consumers.
Availability % / latency p99 budget / error rate budget / alerting + on-call escalation per SLO pre-launch.
{R4_CLOSE}`,
    },
    {
      option: 'Establish service level objectives for this feature: what availability does the consumer depend on, what is the acceptable latency at p99, and what error rate triggers an incident — document these before any consumer dependency is established.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Consumer-dependency SLO documentation not done."}
The consumer-dependency-SLO documentation hasn't been done.
Availability depended-on / p99 latency / error rate incident-trigger — pre-consumer-dependency.
{R4_CLOSE}`,
    },
    {
      option: 'Set and document SLOs before this ships: availability %, latency p99, error rate budget, and the burn rate at which the error budget is exhausted — so on-call knows what to page on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "SLO + burn-rate + page-trigger not set."}
The SLO + burn-rate + page-trigger setup hasn't been done.
Availability % / latency p99 / error budget / burn rate at budget-exhaustion / on-call page basis.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Define availability, latency p99, and error rate SLOs for this feature before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Lighter: availability + p99 latency + error rate SLOs pre-ship.
{R4_CLOSE}`,
    },
    {
      option: 'What are the SLOs for this feature? Specify availability %, latency p99, and error rate budget.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Narrower: SLO triple — availability % / p99 / error rate budget.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Define SLOs before shipping: availability target, latency target (p99), and error rate budget.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature pending ship."}
Minimum next step: SLOs — availability + p99 + error rate pre-ship.
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 6 E1-E3 — founder role CASUAL content ───────────────────────────────

export const ABSENCE_USER_VALUE_CHECK_CASUAL: DecisionContent = {
  question: 'Has this feature been validated with real users?',
  pinchFallback: 'Check user signal before committing to this build.',
  L1: [
    {
      option: 'The single biggest waste in product development is building something nobody asked for. Lean Startup core loop: before any feature build, check whether you have a user signal — a conversation, a behavioral observation, a direct request, or survey data — that confirms the problem you\'re solving is real for your users. Without signal, you\'re making a bet, not a decision.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to build but I haven't checked whether real users actually asked for this."}
User signal for this feature hasn't been validated — risk of building something nobody asked for.
Confirm signal: conversation / behavioral observation / direct request / survey data — before bet becomes decision.
{R4_CLOSE}`,
    },
    {
      option: 'User validation doesn\'t have to be formal. Showing a sketch to 5 users beats shipping a polished feature to zero signal. The goal is to reduce the chance that the feature solves a problem that only exists in the builder\'s imagination. Customer discovery question: did at least one real user tell you they need this, or did you observe them struggling with the absence of it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Lean validation not done."}
The customer-discovery validation hasn't been done.
Sketch to 5 users beats polished to zero signal — did one real user say they need this?
{R4_CLOSE}`,
    },
    {
      option: 'If you haven\'t validated yet: pause and define the minimum signal that would confirm this feature is worth building. A user interview, a feature request count, a survey question, or behavioral data from existing usage. The cost of a short validation step is always lower than the cost of shipping an unvalidated feature and finding out it doesn\'t get used.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Minimum validation signal not defined."}
The minimum-validation-signal definition hasn't been done.
Interview / request count / survey / behavioural data — short validation costs less than shipped-but-unused.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What user signal do you have that this feature is worth building? A request, observation, or research data — any concrete signal reduces the build risk.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Considering this build."}
Lighter: concrete signal — request / observation / research data.
{R4_CLOSE}`,
    },
    {
      option: 'Minimum validation: can you point to one user who said they need this, or behavioral data showing they struggle without it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Considering this build."}
Narrower: one user said-need OR behavioural struggle-without-it.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Pause to validate with at least one real user before committing to this build.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Considering this build."}
Minimum next step: one-real-user validation before commit.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_OUTCOME_DEFINITION_CASUAL: DecisionContent = {
  question: 'What does success look like for this feature?',
  pinchFallback: 'Define the success metric before building starts.',
  L1: [
    {
      option: 'An output is something you ship. An outcome is the change in user behavior that justifies shipping it. The OKR discipline applied to product: before building, write one sentence that completes "This feature is successful if...". Without that sentence, you can\'t evaluate whether the feature worked, you can\'t communicate success criteria to teammates, and you can\'t decide when the feature is done enough to ship.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to ship without defining what success looks like."}
The success outcome for this feature hasn't been defined — without it, ship/no-ship can't be evaluated.
Complete: "This feature is successful if ..." — output is ship; outcome is user behaviour change.
{R4_CLOSE}`,
    },
    {
      option: 'Write the success metric for this feature in observable form: name the user behaviour or system metric, the threshold that defines success, and the timeframe — e.g. "feature is used at least once by 40% of active users in the first month" — then state whether the current build can be evaluated against it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Observable success-metric not written."}
The observable success-metric hasn't been written.
Behaviour or metric / threshold / timeframe — evaluable against current build.
{R4_CLOSE}`,
    },
    {
      option: 'Use the outcome definition as a scope filter: list every addition currently in this feature, evaluate each against the success metric, and flag any that do not contribute to hitting it for removal or deferral.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Outcome-as-scope-filter not applied."}
The outcome-as-scope-filter pass hasn't been done.
List additions / evaluate each vs metric / flag non-contributors for removal or deferral.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Finish this sentence before coding: "This feature succeeds if X happens for Y users within Z timeframe." Without this, you can\'t measure whether the feature worked.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to code."}
Lighter: X happens / Y users / Z timeframe success sentence.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the one metric that would tell you, 30 days after shipping, whether this feature justified the engineering time?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to ship."}
Narrower: 30-day-post-ship metric for engineering-time-justification.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Define the success metric now — the observable outcome that tells you the feature worked.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to build."}
Minimum next step: observable-outcome success metric.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_FEATURE_PRIORITIZATION_CASUAL: DecisionContent = {
  question: 'Why is this the highest-priority thing to build right now?',
  pinchFallback: 'Confirm this is the highest-impact item before building.',
  L1: [
    {
      option: 'Building what comes to mind next — rather than what has the highest impact — is the feature factory pattern. Every hour of engineering time spent on a lower-impact feature is an hour not spent on a higher-impact one. Backlog prioritization question: what evidence suggests this feature delivers more value to users than any alternative you could build with the same engineering time?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building what came to mind; impact-vs-alternatives not checked."}
Priority rationale for this feature hasn't been stated — risk of feature-factory pattern building lower-impact work.
Evidence: more value than any alternative for same engineering hours?
{R4_CLOSE}`,
    },
    {
      option: 'A useful prioritization heuristic: impact-effort scoring. Impact = estimated positive change in a key metric if this ships. Effort = engineering days to implement. Highest impact-to-effort ratio wins. You don\'t need a formal matrix — a quick mental comparison against 2-3 alternatives is enough. The question is: is there a feature you\'re not building that would deliver more value for less effort?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Impact-effort scoring not applied."}
The impact-effort scoring hasn't been applied.
Impact / effort / ratio — any not-building alternative with better ratio?
{R4_CLOSE}`,
    },
    {
      option: 'State the explicit priority rationale for this feature in one sentence — why this over the alternatives — and name the next-highest-priority alternative that is being deferred. If no rationale exists beyond "it seemed like a good idea," draft one now or pause the build.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Explicit priority rationale not stated."}
The explicit priority rationale hasn't been stated.
Why this over alternatives / next-highest-deferred named / draft or pause.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Name the top 2 alternatives you\'re not building right now. Is this feature higher impact-to-effort than either of them? If yes, the prioritization is justified.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Choosing what to build."}
Lighter: top-2 alternatives + this-feature higher-ratio?
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the user/business impact of NOT building this feature, vs. NOT building the next highest-priority alternative?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Choosing what to build."}
Narrower: not-build-this vs not-build-alternative impact.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Confirm explicit prioritization rationale before starting — impact vs. alternatives.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Choosing what to build."}
Minimum next step: explicit rationale before start.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_USER_PERSONA_CLARITY_CASUAL: DecisionContent = {
  question: 'Who specifically is this feature for?',
  pinchFallback: 'Name the specific user this feature is designed for.',
  L1: [
    {
      option: 'Name the specific user this feature serves: 2 sentences describing who they are, what context they use the product in, and what they are trying to accomplish — concrete enough that a design decision can be tested against "would Marcus understand this?" rather than "would users in general?"',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Designing for 'users in general' without a specific named persona."}
The specific user this feature serves hasn't been named — building for 'users in general' loses every design decision.
2-sentence persona: who they are / context / what they're trying to accomplish — concrete-enough for design-decision test.
{R4_CLOSE}`,
    },
    {
      option: 'Write a 2-sentence persona description for this feature\'s primary user — who they are, their context, and what they are trying to do — then check every recent design decision against that persona and flag any that serve "users in general" instead.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Persona description + decision audit not done."}
The persona-write + decision-audit hasn't been done.
Persona / audit recent decisions / flag 'users in general' drift.
{R4_CLOSE}`,
    },
    {
      option: 'Define the target user for this feature in one sentence, then re-check the feature scope: list any request, addition, or behaviour that does not serve that user and propose removing or deferring it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Scope-re-check against target user not done."}
The target-user + scope-re-check hasn't been done.
Define / re-check scope / propose remove or defer non-serving items.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Name the specific user type this feature is for — 2 sentences about who they are and what they\'re trying to do. "For users" isn\'t an answer.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Designing this feature."}
Lighter: specific user-type — 2-sentence who/what; not 'for users'.
{R4_CLOSE}`,
    },
    {
      option: 'If you had to describe the one person who would get the most value from this feature, who would it be? Build for that person explicitly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Designing this feature."}
Narrower: one-person-most-value + build-for-them-explicitly.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Name the specific user type this feature is designed for before making build decisions.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Designing this feature."}
Minimum next step: specific user-type before build decisions.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_COMPETITIVE_AWARENESS_CASUAL: DecisionContent = {
  question: 'Have you checked how competitors handle this?',
  pinchFallback: 'Run a quick competitive check before committing to this build.',
  L1: [
    {
      option: 'Building a feature without knowing the competitive landscape means you\'re solving a problem that may already be solved — possibly better than you\'ll solve it. Before committing to any non-trivial feature, answer three questions: does a competitor already have this? If yes, how have they implemented it? And what would make your version a reason to switch rather than a reason to stay with the incumbent?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building without knowing competitive landscape."}
Competitive landscape for this feature hasn't been checked — risk of solving an already-solved problem worse than incumbent.
3-questions: competitor has this? / how implemented? / reason-to-switch vs reason-to-stay?
{R4_CLOSE}`,
    },
    {
      option: 'Classify this feature as table stakes (required to compete), a differentiator (reason to switch), or irrelevant to user comparison — then state the implementation implication: polish parity, a clear wedge, or do not build. Confirm the current build matches the classification.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feature classification not done."}
The feature classification hasn't been done.
Table stakes / differentiator / irrelevant → polish-parity / clear-wedge / do-not-build.
{R4_CLOSE}`,
    },
    {
      option: 'Run a 20-minute competitive audit: list the top 2-3 competitor implementations of this feature, summarize what each got right and wrong, and propose the specific differentiation angle this build will use. If no differentiation is identified, propose what would need to change.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "20-min competitive audit not run."}
The 20-min competitive audit hasn't been run.
Top 2-3 competitor implementations / right vs wrong / specific differentiation angle.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What do the top 2 competitors do for this feature? And what would make your version a reason to choose you over them?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Lighter: top-2 competitors + your reason-to-choose-over-them.
{R4_CLOSE}`,
    },
    {
      option: 'Is this feature table stakes, a differentiator, or something users don\'t compare? That classification should drive the implementation approach.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Narrower: table-stakes / differentiator / not-compared classification.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Run a quick competitive audit before building — check how competitors solve this and where you differentiate.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Minimum next step: quick competitive audit + differentiation angle.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_MVP_BOUNDARY_DISCIPLINE_CASUAL: DecisionContent = {
  question: 'Is this addition within MVP scope?',
  pinchFallback: 'Check whether this is needed to test the core hypothesis.',
  L1: [
    {
      option: 'Apply MVP discipline to this addition: name the riskiest hypothesis the MVP is meant to test, then state whether this addition reduces uncertainty about that hypothesis. If it does not, propose deferring it to post-validation scope.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Adding to MVP without checking against riskiest hypothesis."}
MVP-scope discipline hasn't been applied to this addition — risk of gold-plating the unvalidated MVP.
Riskiest hypothesis named / addition reduces uncertainty? / defer if not.
{R4_CLOSE}`,
    },
    {
      option: 'The discipline question for every addition: does this help test what we\'re trying to learn, or does it just make the product feel more complete? "Feel more complete" is the scope creep justification. If the feature doesn\'t reduce the uncertainty about whether the core hypothesis is true, it\'s out of MVP scope — not permanently, just for this phase. Ship the minimum, learn, then add.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Discipline question not asked."}
The discipline-question hasn't been asked.
Test-learning vs feel-more-complete / ship min / learn / then add.
{R4_CLOSE}`,
    },
    {
      option: 'Common MVP scope creep patterns: "nice to have" additions that don\'t affect hypothesis testing, polish passes that go beyond the minimum for usability, and "while we\'re in this area" additions. All three delay the learning loop without increasing its quality. Define the scope boundary explicitly: list the features that are in-hypothesis-scope and treat everything else as post-validation work.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Scope boundary not explicit."}
The explicit scope boundary hasn't been defined.
In-hypothesis-scope list / everything-else as post-validation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does this addition help test the core hypothesis, or does it just make the product feel more complete? If the latter, it\'s out of MVP scope for now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Adding to MVP."}
Lighter: test-hypothesis vs feel-more-complete check.
{R4_CLOSE}`,
    },
    {
      option: 'What is the minimum set of features needed to get a real answer on the riskiest hypothesis? Is the current scope still within that minimum?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Adding to MVP."}
Narrower: minimum-set-for-real-answer + current-scope check.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Check MVP scope — only include what\'s needed to test the core hypothesis, defer the rest.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Adding to MVP."}
Minimum next step: MVP-scope check — defer non-hypothesis additions.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_USER_ACQUISITION_CONSIDERATION_CASUAL: DecisionContent = {
  question: 'How will target users find and access this feature?',
  pinchFallback: 'Define the acquisition path before building.',
  L1: [
    {
      option: 'A feature\'s value is zero for any user who never encounters it. Distribution fit is as important as product-market fit — and it has to be designed in, not discovered after launch. Before committing to a feature build, answer: what is the specific path through which target users will find and start using this feature? SEO, referral loop, in-app discovery, sharing mechanic, onboarding hook, community post — name the channel.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building without acquisition path designed in."}
Acquisition path for this feature hasn't been defined — feature value is zero for users who never discover it.
Name the channel: SEO / referral loop / in-app discovery / sharing / onboarding / community.
{R4_CLOSE}`,
    },
    {
      option: 'Name the specific acquisition mechanic for this feature — built-in sharing, referral hook, SEO surface, in-app discovery, onboarding placement — then confirm the implementation actually supports that mechanic. If the channel and the build are misaligned, flag what needs to change.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Acquisition mechanic + implementation alignment not checked."}
The mechanic-vs-implementation alignment hasn't been checked.
Mechanic named / implementation supports it? / flag misalignment.
{R4_CLOSE}`,
    },
    {
      option: 'Write the acquisition-path sentence for this feature in the exact form: "Users reach this via [channel], and the first time they see it they are shown [first-encounter UX]." If either bracket is empty, propose what would fill it before more is built.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Acquisition-path sentence not written."}
The acquisition-path sentence hasn't been written.
Reach via [channel] / first-encounter UX [shown] — fill empty brackets before more built.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Name the specific acquisition path: how do target users find out this feature exists, and how do they reach it for the first time?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Lighter: specific path — find-out + first-reach.
{R4_CLOSE}`,
    },
    {
      option: 'Is the acquisition mechanic built into the feature, or does it rely on users discovering it organically? Distribution-by-design vs. distribution-by-hope.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Narrower: built-in vs organic-discovery — design vs hope.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Define the acquisition path before building — name how target users will find and reach this feature.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Minimum next step: acquisition path before build.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_RETENTION_MECHANISM_CHECK_CASUAL: DecisionContent = {
  question: 'How does this feature bring users back?',
  pinchFallback: 'Consider the retention angle before building.',
  L1: [
    {
      option: 'Features that acquire users but don\'t retain them have diminishing returns forever. Every significant feature should have an answer to: why does a user return to this feature after the first use, and how does using it once make the next use more likely? Without a retention angle, you\'re building acquisition features, not engagement features.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building feature without thinking about retention angle."}
Retention mechanic for this feature hasn't been named — feature acquires users but doesn't bring them back.
Why return after first use? / how does using-once make next-use more likely?
{R4_CLOSE}`,
    },
    {
      option: 'Pick one of three retention mechanics for this feature and confirm it is built in: (1) it saves something users want to return to, (2) it creates a loop where one session\'s output is the next session\'s input, or (3) it connects users to other users. Name the chosen mechanic and where it lives in the current build, or propose what to add.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Retention mechanic not picked + located."}
The retention-mechanic pick + locate hasn't been done.
Save / loop session-output→input / connect users — name chosen + where it lives.
{R4_CLOSE}`,
    },
    {
      option: 'Nir Eyal\'s Hook model: trigger → action → reward → investment. "Investment" is what makes the next trigger more effective — the user puts something into the product (data, preferences, connections, history) that increases the value of returning. Every feature should have an answer for what the "investment" is. If there isn\'t one, the feature has no retention loop.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Hook 'investment' not named."}
The Hook-investment hasn't been named.
Trigger → action → reward → investment / what does user put in that raises return-value?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the retention mechanic for this feature — what makes a user come back after the first use, and what makes returning more valuable than the first visit?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Lighter: mechanic + return-more-valuable-than-first.
{R4_CLOSE}`,
    },
    {
      option: 'Does using this feature once make the next use more likely? If not, it\'s a one-visit feature — which may be fine, but should be an explicit design choice.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Narrower: one-use → next-use likelier? / explicit one-visit design choice.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Define the retention angle now — what brings users back to this feature after the first use.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Minimum next step: retention angle before build.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT_CASUAL: DecisionContent = {
  question: 'How will you know if this feature is working after you ship it?',
  pinchFallback: 'Add a feedback mechanism before shipping.',
  L1: [
    {
      option: 'Shipping without a way to measure whether the feature worked means the engineering investment produces no validated learning. The Lean Startup loop: Build → Measure → Learn. Skipping the Measure step after Build means the loop stops at the most expensive point and never produces the insight that informs the next build. Define your measurement mechanism before shipping, not after.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to ship without measurement mechanism in place."}
Post-ship measurement mechanism hasn't been set — engineering investment produces no validated learning.
Build → Measure → Learn / define measurement before ship, not after.
{R4_CLOSE}`,
    },
    {
      option: 'Specify the minimum viable feedback set for this feature: name the analytics event that fires on use, the user-feedback channel (in-product or support), and the indicator that ties to the defined success metric. Confirm each is in place or list what needs adding before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Min viable feedback set not specified."}
The MV feedback set hasn't been specified.
Analytics event / feedback channel / success-metric indicator — confirm or list missing.
{R4_CLOSE}`,
    },
    {
      option: 'Common shipping patterns that break the feedback loop: shipping with no analytics instrumentation, shipping with analytics but no defined success threshold, and shipping with a metric but no scheduled review. All three mean the feature will run for weeks without producing a learning decision. Define the mechanism, the metric, and the review date before the code ships.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Mechanism / metric / review-date not defined."}
The mechanism + metric + review-date trio hasn't been defined.
No-instrumentation / no-threshold / no-review-date — define all three before ship.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Name the feedback mechanism: what data will tell you whether this feature is being used, and what will tell you whether it\'s solving the problem it was built for?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to ship."}
Lighter: mechanism — used-data + problem-solved-data.
{R4_CLOSE}`,
    },
    {
      option: 'When will you review the data, and what will you do if the feature isn\'t hitting the success metric you defined?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to ship."}
Narrower: review date + action-if-missed-metric.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Add a feedback mechanism before shipping — analytics event, success metric, and review date.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to ship."}
Minimum next step: event + metric + review-date.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_HYPOTHESIS_BEFORE_BUILD_CASUAL: DecisionContent = {
  question: 'What hypothesis does this feature test?',
  pinchFallback: 'Define the hypothesis before starting the build.',
  L1: [
    {
      option: 'Write the experiment hypothesis for this feature in the form: "We believe [feature/change] will cause [observable outcome] for [user type]. We will know this is true when [signal] appears within [timeframe]." If any bracket cannot be filled, propose what data or decision would resolve it before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building without falsifiable hypothesis stated."}
Falsifiable hypothesis for this feature hasn't been written — experiment outcome can't be evaluated.
We believe [X] will cause [Y] for [Z] / known true when [signal] appears within [timeframe].
{R4_CLOSE}`,
    },
    {
      option: 'The hypothesis doesn\'t have to be certain — it has to be falsifiable. "Users will use the export feature at least once per week" is falsifiable. "Users will find this useful" is not. The falsifiability test: after shipping, can you look at a single data point and say definitively whether the hypothesis was proven or disproven? If not, refine the hypothesis until you can.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Falsifiability test not applied."}
The falsifiability test hasn't been applied.
Single data point → proven or disproven? / refine until yes.
{R4_CLOSE}`,
    },
    {
      option: 'State the falsification condition for this feature\'s hypothesis: what specific data point, observed within the success window, would prove the hypothesis wrong? Commit to that condition now — and use it as the post-ship review trigger.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Falsification condition not stated."}
The falsification condition hasn't been stated.
Specific data point in success window / commit now / post-ship review trigger.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Complete this before coding: "We believe [this feature] will [achieve outcome] for [user type]. We will know this is true when [observable signal]."',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to code."}
Lighter: We-believe / achieve outcome / for user-type / observable signal.
{R4_CLOSE}`,
    },
    {
      option: 'What would tell you this experiment failed? If you can\'t name a failure condition, the hypothesis isn\'t specific enough to be falsifiable.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to build."}
Narrower: experiment-failed condition — if can't name → not falsifiable.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Define the hypothesis now — what outcome does this feature test, and how will you know if it worked?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to build."}
Minimum next step: hypothesis — outcome tested + how to know.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE_CASUAL: DecisionContent = {
  question: 'When did you last check product direction — not just implementation?',
  pinchFallback: 'Take a product perspective before continuing to build.',
  L1: [
    {
      option: 'Pause implementation and run a product-direction check: count the last 10-15 prompts by category (implementation instructions vs product-direction questions). If heavily skewed to implementation, answer one product question before continuing — is this still the right feature to be building for the right user toward the right outcome?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Heavy implementation prompts; product-direction check not done."}
Product-direction check hasn't been done — heavy implementation skew risks optimising the wrong feature.
Count last 10-15 / impl vs product-direction / answer one product-Q before continuing.
{R4_CLOSE}`,
    },
    {
      option: 'A useful ratio check: in the last 10-15 prompts, how many were implementation instructions ("build this", "add this", "fix this") vs. product-direction questions ("should we build this at all", "is this the right user experience", "does this move our core metric")? Heavy implementation skew is a signal that product thinking has been suspended. Suspend it too long and you optimize the implementation of the wrong feature.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Implementation-vs-product-direction ratio not checked."}
The impl-vs-product-direction ratio check hasn't been done.
Build/add/fix vs should-build/right-UX/moves-metric — heavy impl skew = suspended product thinking.
{R4_CLOSE}`,
    },
    {
      option: 'Product check questions that take < 5 minutes: Is this feature still the highest-priority thing to build right now? Does the implementation direction still match the product goal? Is there a user I should talk to before the next build decision? Has anything changed about the problem I\'m solving? These questions don\'t interrupt implementation — they protect it from building in the wrong direction.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "5-min product check questions not asked."}
The 5-min product-check questions haven't been asked.
Highest-priority? / impl-matches-goal? / user-to-talk-to? / problem-changed?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Pause the implementation for a moment: is the feature you\'re building still the right thing to be building right now, and is the direction still aligned with your product goal?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Deep in implementation."}
Lighter: still-right-feature + direction-aligned-with-goal.
{R4_CLOSE}`,
    },
    {
      option: 'One product-direction question before continuing: is there anything you\'ve learned in the last few sessions that should change what you\'re building or how you\'re building it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Deep in implementation."}
Narrower: learnings-that-should-change-what-or-how.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Take a product-direction check before continuing to build — not just what, but whether.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Deep in implementation."}
Minimum next step: product-direction check — not just what, but whether.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_NORTH_STAR_ALIGNMENT_CASUAL: DecisionContent = {
  question: 'How does this feature connect to your product\'s core metric?',
  pinchFallback: 'Check north star alignment before adding this feature.',
  L1: [
    {
      option: 'Trace this feature to the product\'s north star metric in one or two steps: state how it moves the metric directly, or how it enables a downstream feature that does. If no traceable connection exists, propose deferring or removing it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building feature without tracing to north-star metric."}
North-star connection for this feature hasn't been traced — risk of scope inflation untethered from the core metric.
Trace 1-2 steps: directly moves metric / enables downstream feature / else defer or remove.
{R4_CLOSE}`,
    },
    {
      option: 'Articulate the north star connection for this feature: name the metric, name the chain of cause-and-effect from this feature to the metric (one or two intermediate steps allowed), and confirm the chain holds. If it does not, flag the feature as candidate for scope removal.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "North-star chain not articulated."}
The north-star chain articulation hasn't been done.
Metric / chain of cause-and-effect / chain holds? / scope-removal candidate if not.
{R4_CLOSE}`,
    },
    {
      option: 'Apply the north star filter to this feature\'s scope: if the feature does not connect to the north star directly or via one intermediate step, decide whether it belongs in a later phase, belongs as foundation for a north-star feature still to come, or should be cut from this scope entirely.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "North-star filter not applied to scope."}
The north-star scope filter hasn't been applied.
Direct/1-step / else: later-phase / foundation-for-future / cut.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'In one sentence: how does this feature move your north star metric? Direct path, or via which intermediate effect?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Lighter: 1-sentence — moves metric direct or via intermediate.
{R4_CLOSE}`,
    },
    {
      option: 'If this feature has no traceable connection to your north star, is it a foundation for features that will, or is it scope inflation?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Narrower: no-traceable-connection — foundation or scope-inflation?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Articulate the north star connection before building — direct or indirect, but traceable.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Minimum next step: traceable north-star connection before build.
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 6 E4-E6 — indie_hacker role CASUAL content ─────────────────────────

export const ABSENCE_TIME_TO_VALUE_CHECK_CASUAL: DecisionContent = {
  question: 'Is this solution the right size for your current scale?',
  pinchFallback: 'Check whether this complexity is justified at current user count.',
  L1: [
    {
      option: 'Right-size this solution for current scale: name the current user count, name the simplest technology that solves the problem at that scale (a database query, a single API call, a flat file), and propose using it. Defer infrastructure complexity until scale actually requires it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building complex solution before checking if simpler fits current scale."}
Right-sizing for current scale hasn't been done — risk of premature complexity for hoped-for traffic.
Current user count / simplest tech that solves at this scale / defer infra complexity.
{R4_CLOSE}`,
    },
    {
      option: 'Apply the 37signals match-current-traffic rule: confirm this solution fits today\'s traffic rather than hoped-for traffic. If you are reaching for a queue, cache, or distributed component before having users, propose the simpler version that will work at current scale and is easily replaceable later.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "37signals match-current-traffic rule not applied."}
The match-current-traffic check hasn't been done.
Today's traffic vs hoped-for / reaching for queue/cache/distributed pre-users? / simpler + replaceable.
{R4_CLOSE}`,
    },
    {
      option: 'Right-sizing heuristic: if a simple database query, a single API call, or a flat file solves the problem — and you\'re reaching for a queue system, caching layer, or distributed component — ask whether your current user count justifies the complexity. "Not yet but it will eventually" is the premature optimization justification. Build the simple version, ship it, and complicate it when scale actually demands it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Right-sizing heuristic not applied."}
The right-sizing heuristic hasn't been applied.
Simple DB-query / single-API / flat-file solves it? / 'eventually' = premature optimisation / simple-first.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s your current user count, and does the complexity of this solution match that scale? What\'s the simplest version that works for the users you have right now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Choosing tech."}
Lighter: current count + complexity-matches-scale? + simplest-version-for-current-users.
{R4_CLOSE}`,
    },
    {
      option: 'Could a simpler technology solve the same problem and be easily replaced when scale actually requires the complex version?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Choosing tech."}
Narrower: simpler-tech + easy-replace-when-scale-demands.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Right-size this — build the simplest solution that works for your current scale, not future scale.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Choosing tech."}
Minimum next step: simplest for current scale, not future.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SHIP_READINESS_DEFINITION_CASUAL: DecisionContent = {
  question: 'What needs to be true for this to be ready to ship?',
  pinchFallback: 'Write ship criteria before continuing to build.',
  L1: [
    {
      option: 'Write the ship criteria for this build before more is added: list the specific, binary conditions that must be true to ship — "users can sign up", "the core workflow completes end-to-end", etc. This list is your Definition of Done; everything beyond it is post-launch scope.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building without explicit ship criteria written."}
Ship criteria haven't been written — risk of always being 'not ready yet' without binary gates.
Specific binary conditions / DoD list / everything else = post-launch scope.
{R4_CLOSE}`,
    },
    {
      option: 'Ship criteria should be binary: each item is objectively true or false. "Users can sign up and complete the core workflow" is a valid ship criterion. "The design feels polished" is not. Criteria that can\'t be evaluated as pass/fail don\'t function as ship gates — they become "not ready yet" justifications that can always be renegotiated. Write criteria you can check off with a yes or a no.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Binary criteria not written."}
The binary-criteria write hasn't been done.
Objectively T/F / yes-or-no check / no 'feels polished' renegotiable items.
{R4_CLOSE}`,
    },
    {
      option: 'A useful constraint: limit your ship criteria to what\'s needed for the first user to get value from the product. Everything beyond that is post-launch scope. Add it to a backlog, not the ship gate. The ship gate is about minimum viable launch, not minimum viable polish.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "First-user-value constraint not applied."}
The first-user-value constraint hasn't been applied.
First user gets value = ship gate / beyond = backlog / MV launch not MV polish.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Write down the ship criteria right now: specific, binary conditions that must be true before you ship. This becomes your launch checklist.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building."}
Lighter: binary conditions = launch checklist.
{R4_CLOSE}`,
    },
    {
      option: 'Of those criteria, which ones are needed for the first user to get value — and which are "nice to have before launching"? Separate them: one list is the ship gate, the other is a post-launch backlog.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building."}
Narrower: first-user-value vs nice-to-have-before-launch separation.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Write explicit ship criteria now — specific, binary. Everything else is post-launch scope.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building."}
Minimum next step: explicit binary ship criteria.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_MANUAL_BEFORE_AUTOMATE_CASUAL: DecisionContent = {
  question: 'Have you done this manually to confirm it works before automating?',
  pinchFallback: 'Do it manually first, then automate the proven version.',
  L1: [
    {
      option: 'Apply Paul Graham\'s "do things that don\'t scale" rule: do this workflow manually for the first users before automating it. Run the process by hand, capture what users actually need vs what you assumed, and only then automate the validated version.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to automate a process before running it manually first."}
Manual-first validation hasn't been done — automation of an unvalidated process risks rebuild after discovery.
Do-things-that-don't-scale / run by hand for first users / capture need-vs-assumed / then automate.
{R4_CLOSE}`,
    },
    {
      option: 'The manual-before-automate discipline: do the process manually for the first users, watch what actually happens — what\'s needed, what\'s not, what users ask for that you didn\'t anticipate — then automate the validated version. Every time automation is built for an unvalidated process, there\'s a real chance of needing to rebuild the automation after discovering the manual version was wrong.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Manual-watch-validate discipline not applied."}
The manual-watch-validate discipline hasn't been applied.
Manual for first users / watch needed / un-anticipated asks / automate validated version.
{R4_CLOSE}`,
    },
    {
      option: 'Questions to ask before automating: have you done this manually at least once? Did it work as expected? Did users respond as expected? If any answer is no — do it manually first. Automation is optimization. Optimization of an unvalidated process is premature spend.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Pre-automate questions not asked."}
The pre-automate questions haven't been asked.
Done manually once? / worked as expected? / users responded as expected? / any 'no' → manual first.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'How many times have you done this process manually, and what did you learn that shaped the automation design? If the answer is zero — do it manually first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to automate."}
Lighter: manual-times-done + learning-shaped-automation; zero → do manual.
{R4_CLOSE}`,
    },
    {
      option: 'What would happen if you did this manually for the first 10 users instead of building the automation now? Is there anything you\'d learn that might change how you automate it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to automate."}
Narrower: first-10-users manual / what'd change in automation design.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Do this manually first — validate it works for real users before building the automation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to automate."}
Minimum next step: manual-first + validate with real users.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_TECH_STACK_COMPLEXITY_CHECK_CASUAL: DecisionContent = {
  question: 'Can you maintain this architecture alone, at 2am, when it breaks?',
  pinchFallback: 'Apply the solo maintainability test before adding this complexity.',
  L1: [
    {
      option: 'Every technology choice for a solo indie project is a choice you\'ll maintain alone — debugging it at 2am, extending it when requirements change, understanding it after 3 months away. Complexity that would be distributed across a team of engineers is complexity a solo builder pays in full. The right lens: "is this the simplest stack I can maintain alone, or is this the most impressive stack I can technically justify?"',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Choosing tech stack without solo-maintainability lens."}
Solo-maintainability check hasn't been applied — team-grade complexity costs solo dev in maintenance tax.
Simplest-I-can-maintain-alone vs most-impressive-I-can-justify / debug 2am / extend / 3-months-away.
{R4_CLOSE}`,
    },
    {
      option: 'Run the CV-driven-development check on this stack choice: if the architecture is team-grade complexity for a solo build, propose the simpler stack that solves the same user problem. The user sees the product, not the architecture — choose the stack you can debug alone at 2 a.m.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "CV-driven-development check not run."}
The CV-driven-development check hasn't been run.
Team-grade-for-solo-build? / simpler stack same user problem / user sees product not architecture.
{R4_CLOSE}`,
    },
    {
      option: 'Solo maintainability benchmark: if a production issue hit this system tonight, how long would it take you to find and fix it alone, without documentation? A simpler stack answers that in minutes. A complex one answers it in hours — and that difference is paid by you, every time something breaks. Simpler stack = lower maintenance tax = more time shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "MTTR-alone benchmark not run."}
The MTTR-alone benchmark hasn't been run.
Find+fix alone no docs / minutes vs hours / lower tax = more shipping.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the simplest architecture that solves the same problem? Is the added complexity of this approach worth the increased solo maintenance cost?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Choosing tech."}
Lighter: simplest-same-problem + complexity-worth-solo-maintenance-cost.
{R4_CLOSE}`,
    },
    {
      option: 'If this broke in production at midnight, how would you debug it alone? What\'s your mean-time-to-understand for this architecture under pressure?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Choosing tech."}
Narrower: midnight-debug alone + MTTU under pressure.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Apply the solo maintainability test — choose the simplest architecture you can debug alone.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Choosing tech."}
Minimum next step: solo-maintainability test → simplest debuggable alone.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_LAUNCH_STRATEGY_ABSENCE_CASUAL: DecisionContent = {
  question: 'How are people going to find out this product exists when you launch?',
  pinchFallback: 'Define a launch strategy before getting closer to ship date.',
  L1: [
    {
      option: 'Shipping without a launch plan means launching into silence. Good products do not attract users by themselves — distribution is a discipline that must be planned and executed, not discovered. The minimum viable launch strategy: name one specific channel where you will announce this product, write the post before launch day, and identify who in your network or community should see it. That\'s a launch plan.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Approaching ship date without a launch plan drafted."}
Launch plan hasn't been drafted — shipping without distribution risks launching into silence.
One channel / write post pre-launch / network audience identified — that's a plan.
Still, before you publish or post this launch publicly you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Pick one specific launch channel and execute it well: Product Hunt (write the listing and schedule), Hacker News Show HN (draft the post), a targeted subreddit, a niche community, or cold outreach to 5-10 target users. One channel done properly beats five attempted on launch day — name the channel and start the announcement draft now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Channel not picked + draft not started."}
The pick-channel + draft-announcement hasn't been done.
PH / Show HN / subreddit / community / cold outreach 5-10 — one done well > five attempted.
Still, before you publish the announcement on any public channel you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'The launch plan question: when you ship, who specifically is going to see it, and how? If the answer is "people will find it" — that\'s not a plan, that\'s a hope. Name the channel, identify the audience, and write the announcement before you\'re in launch-day mode.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Who-sees-it / how-they-see-it not answered."}
The who-sees-it + how-they-see-it pair hasn't been answered.
Channel / audience / pre-launch announcement / 'people-will-find-it' = hope, not plan.
Still, before you post the announcement publicly you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Name the specific channel and the specific audience: where will you announce, and who exactly will see it on launch day?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Approaching ship."}
Lighter: channel + audience pair.
Still, before you publish to any public channel you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Write the launch announcement draft now — before you need it. It forces clarity on what the product is, who it\'s for, and what makes it worth trying.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Approaching ship."}
Narrower: draft pre-need / forces clarity on what / for whom / worth-trying.
Still, before you publish or post the draft publicly you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Write a launch plan now: one specific channel, one specific audience, one drafted announcement.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Approaching ship."}
Minimum next step: channel + audience + drafted announcement.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_EARLY_USER_FEEDBACK_CASUAL: DecisionContent = {
  question: 'When did you last get a real user\'s reaction to what you\'re building?',
  pinchFallback: 'Show what you\'ve built to at least one real user before continuing.',
  L1: [
    {
      option: 'Break out of silo-building before more is built: identify one real user to show the current build to today — for a 10-minute screen-share, a Loom walk-through, or a screenshot review. Capture their actual reaction, not your interpretation, and adjust direction based on what you see.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building in silo; haven't shown current state to a real user recently."}
Recent feedback from real users hasn't been collected — silo-building risks building on unvalidated assumptions.
Identify one user today / screen-share or Loom / capture actual reaction not interpretation.
{R4_CLOSE}`,
    },
    {
      option: 'Get rough early feedback before the next polish pass: show 2-3 real users the current build via screenshot, Loom, or live demo — the goal is not approval, it is friction (where they get confused, what they ignore, what they ask about). Capture each piece of friction and decide what to address before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Rough feedback before polish-pass not collected."}
The pre-polish rough-feedback hasn't been collected.
2-3 users / screenshot / Loom / live demo / goal is friction not approval.
{R4_CLOSE}`,
    },
    {
      option: 'A practical minimum: before finishing any significant feature, show a working or near-working version to one real user and watch them interact with it without explaining anything. What they struggle with, what they don\'t notice, what they ask about — that\'s the feedback that matters. You don\'t need a survey. You need one real person trying to use the thing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "One-real-user-watch not done."}
The one-real-user-watch hasn't been done.
Working or near-working / no explanation / struggle / don't-notice / asks-about = feedback that matters.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Who can you show the current build state to today — not to get approval, but to watch them use it and see where they get confused or stuck?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "In a build streak."}
Lighter: someone-to-show-today + watch-confusion-and-stuck.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the riskiest assumption in your current build? Is there a way to test that assumption with a real user before building further on top of it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "In a build streak."}
Narrower: riskiest assumption + test with real user before further build.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Show this to at least one real user now — watch them use it before building further.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "In a build streak."}
Minimum next step: show to one real user + watch.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SOLO_MAINTAINABILITY_CASUAL: DecisionContent = {
  question: 'Is this addition maintainable by you alone, long-term?',
  pinchFallback: 'Run the solo maintainability check before adding this complexity.',
  L1: [
    {
      option: 'Every integration, service, or abstraction you add to a solo project is complexity you\'ll maintain alone — debugging it in production, extending it when requirements change, understanding it after weeks away. The solo maintainability question is not "does this work?" but "can I own the full blast radius of this when it breaks, by myself, without help?" If the answer requires reading documentation for 30 minutes every time something goes wrong, the complexity cost is real and ongoing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Adding integration without solo-tax check."}
Solo-tax check hasn't been applied to this addition — risk of complexity solo dev can't own when it breaks.
Own full blast radius alone? / no help / 30-min docs per failure = real cost.
{R4_CLOSE}`,
    },
    {
      option: 'Apply the solo-tax test before adding this integration: estimate the long-term maintenance cost (debugging, version churn, documentation drift) and compare to the long-term cost of building the simpler equivalent yourself. Adopt only if the maintenance cost is clearly lower.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long-term maintenance cost not estimated."}
The long-term-cost estimate hasn't been done.
Debugging / version churn / docs drift vs simpler-equivalent build / adopt only if lower.
{R4_CLOSE}`,
    },
    {
      option: 'Before adding any new service, integration, or complex abstraction: name the failure mode that\'s most likely to wake you up at 3am. Can you diagnose and fix that failure alone, in under 30 minutes, with the logs you\'ll have available? If not, the complexity is not solo-sustainable.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "3am failure mode not named."}
The 3am-failure-mode + diagnose-alone check hasn't been done.
Likely failure / <30 min alone with available logs? / else not solo-sustainable.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the most likely failure mode for this addition, and how long would it take you to diagnose and fix it alone, at night, with no colleagues to ask?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Considering an addition."}
Lighter: likely failure + alone-diagnose-time at night.
{R4_CLOSE}`,
    },
    {
      option: 'Is there a simpler alternative that solves the same problem with lower solo maintenance cost — even if it takes an extra day to build?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Considering an addition."}
Narrower: simpler-alternative + lower-cost even-if-extra-day-build.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Apply the solo maintainability test: can you own the full failure mode of this, alone?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Considering an addition."}
Minimum next step: own-full-failure-alone test.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_DISTRIBUTION_THINKING_CASUAL: DecisionContent = {
  question: 'How will users discover and access this feature?',
  pinchFallback: 'Consider the distribution angle before building this feature.',
  L1: [
    {
      option: 'Distribution is a design constraint, not a marketing task. Features that assume users will discover them organically are features built on distribution magic. Before building any significant feature, answer: what is the specific path through which a new user discovers this feature exists and reaches it for the first time? The answer shapes the implementation — SEO-friendly URLs, in-product sharing mechanics, referral hooks, and community-compatible output formats are all distribution design, not afterthoughts.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building without designing discovery path."}
Discovery path for this feature hasn't been designed — feature relies on distribution magic.
Specific path: SEO URLs / sharing / referral / community-compatible output = design, not afterthought.
{R4_CLOSE}`,
    },
    {
      option: 'The distribution question for indie products: are you relying on existing users to find this (in-product discovery), new users to find the product through this feature (SEO / social sharing), or explicit outreach to get people to try it? Each of these requires a different implementation approach. In-product discovery needs navigation design; SEO requires content structure; social sharing requires a shareable artifact. Choosing the distribution approach before building ensures the feature can actually fulfill it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Distribution-approach + impl-alignment not chosen."}
The distribution-approach pick hasn't been done.
In-product / SEO-social / outreach → navigation / content structure / shareable artifact.
{R4_CLOSE}`,
    },
    {
      option: 'A minimum distribution consideration: for each feature, name the one most likely way a user first encounters it. Then check whether the current implementation supports that discovery path. If the implementation makes the feature invisible to the intended discovery mechanism, distribution is broken before the feature ships.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "First-encounter path not checked vs impl."}
The first-encounter + impl-support check hasn't been done.
Most likely first-encounter / impl supports it? / invisible-to-mechanism = broken pre-ship.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Name the specific discovery path for this feature: how does a user who has never seen it find out it exists and reach it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Lighter: specific discovery path — never-seen-user finds-and-reaches.
{R4_CLOSE}`,
    },
    {
      option: 'Does the current implementation support that discovery path, or would a user arriving through that channel hit a dead end?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Narrower: impl supports path / dead-end-on-arrival check.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Name the distribution path for this feature before building — how does a user first find it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Minimum next step: name distribution path before build.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_MONETIZATION_PATH_CLARITY_CASUAL: DecisionContent = {
  question: 'How does this feature connect to how the product makes money?',
  pinchFallback: 'Consider the monetization connection before building this feature.',
  L1: [
    {
      option: 'Building features without monetization awareness builds a free product by default — regardless of intent. Every significant feature should have an articulated answer to "how does this connect to the revenue model?" It doesn\'t need to be direct: "this is a retention feature that reduces churn, which improves LTV" is a valid connection. "This makes the product better" is not — it\'s the answer that leads to technically excellent, commercially unsustainable products.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building without monetization awareness."}
Monetization connection for this feature hasn't been articulated — risk of building free product by default.
Connection to revenue model / 'better' isn't an answer / direct or indirect-via-LTV.
{R4_CLOSE}`,
    },
    {
      option: 'Revenue model options for indie products: paid tier (freemium gate), usage-based pricing, one-time purchase, SaaS subscription, affiliate revenue, API access tier. For each feature, ask: is this in the free tier (acquisition) or the paid tier (monetization)? If free, why — what acquisition or retention goal does it serve that connects back to paid conversion? If paid, what makes it worth paying for? These questions don\'t slow development — they prevent building the wrong tier.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Free-vs-paid tier decision not made."}
The free-vs-paid tier decision hasn't been made.
Paid tier / usage / one-time / SaaS / affiliate / API / free with goal vs paid with worth-paying.
{R4_CLOSE}`,
    },
    {
      option: 'Lock the monetization decision for this feature now, before users learn to expect it for free: place it explicitly in the free tier (and name the acquisition or retention goal it serves) or the paid tier (and name what makes it worth paying for). Document the choice and the rationale.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Tier lock + rationale not documented."}
The tier-lock + rationale-document hasn't been done.
Lock pre-user-expectation / free with named goal OR paid with named worth-paying / document.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is this feature in the free or paid tier? What\'s the explicit reason — acquisition, retention, conversion, or direct revenue?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Lighter: free or paid + explicit reason — acquisition/retention/conversion/revenue.
{R4_CLOSE}`,
    },
    {
      option: 'If this feature were behind a paywall, would users pay for it? If not, what would need to change about the feature — or the framing — to make it worth paying for?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Narrower: paywall test + change-to-make-worth-paying-for.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Name the monetization connection for this feature before building — free tier or paid, and why.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Minimum next step: monetization connection + why.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY_CASUAL: DecisionContent = {
  question: 'Is this a milestone worth sharing publicly?',
  pinchFallback: 'Consider sharing this milestone publicly before moving to the next.',
  L1: [
    {
      option: 'Share this milestone publicly today before continuing: draft a short post (tweet, Loom, community update) describing what you just shipped and what you learned. Audiences built during the build survive launch-day failures; audiences built launch-week do not.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Shipped a milestone without sharing publicly."}
Milestone sharing hasn't been done — audience built during the build survives launch failures; audience built launch-week doesn't.
Short post / tweet / Loom / community update — shipped + learned.
Still, before you publish this post to any public channel you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Pick the milestone type and write the share: first working core feature, first technical milestone, first 10 users, first revenue, or one specific lesson worth teaching. Draft a one-paragraph post (no polish required) and identify the audience — your followers, a relevant community, or a niche forum.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Milestone-type + audience not picked."}
The milestone-type + audience pick hasn't been done.
First-feature / tech-milestone / 10-users / revenue / lesson — one-paragraph draft + audience.
Still, before you publish the drafted post to any public channel you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Pick the lowest-friction share format and ship it: a short tweet, a 60-second Loom walk-through, or a one-paragraph forum update. Frequency over polish — consistent presence during the build is what compounds into a launch-day audience.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Low-friction share format not picked."}
The low-friction-share pick hasn't been done.
Tweet / 60s Loom / forum paragraph — frequency over polish.
Still, before you publish the share to any public channel you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the simplest format to share this milestone today — a tweet, a short post, a screen share? Who specifically should see it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Shipped a milestone."}
Lighter: simplest format + who-specifically-sees-it.
Still, before you publish this share publicly you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'What did you learn building this that another indie hacker would find useful? That\'s the post. Share the process, not just the output.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Shipped a milestone."}
Narrower: indie-hacker-useful learning = the post / share process not just output.
Still, before you publish this learning-post publicly you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Share this milestone publicly now — a short post about what you built and what you learned.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Shipped a milestone."}
Minimum next step: short public post — built + learned.
Still, before you publish this post publicly you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_SCOPE_VS_TIME_CHECK_CASUAL: DecisionContent = {
  question: 'Is the current scope still within your available time and energy?',
  pinchFallback: 'Run a scope-vs-time check before adding more to the build.',
  L1: [
    {
      option: 'Run the scope-vs-time check on this build before more is added: name the current scope, estimate the shipping date at current pace, and compare to the original target. If the date has slipped twice in a row, cut scope to fit the original timeline — list specifically what gets deferred to post-launch.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Scope expanding; haven't checked vs available time."}
Scope-vs-time check hasn't been run — risk of expanding scope past timeline without acknowledgment.
Current scope / ship-date at pace vs target / 2× slip → cut scope, name deferred items.
{R4_CLOSE}`,
    },
    {
      option: 'Time-box check: at the current scope, how long will it take to ship something a real user can use? If the answer is "a few more weeks" and it was "a few more weeks" last session too — scope has grown past the original timeline without acknowledgment. The fix is not to work faster; it\'s to cut scope to fit the original timeline, not to extend the timeline to fit the expanded scope.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Time-box check not done."}
The time-box check hasn't been done.
Ship-something-usable timing / 'few more weeks' twice → cut scope not extend timeline.
{R4_CLOSE}`,
    },
    {
      option: 'A useful constraint: define the minimum version that\'s still shippable given the time you have available this week or this month. Everything beyond that goes to a post-launch backlog. The constraint is productive: it forces the prioritization decision that scope expansion defers indefinitely.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Min-shippable-this-week constraint not applied."}
The min-shippable-in-available-time constraint hasn't been applied.
This-week or this-month min / beyond = backlog / forces prioritization scope expansion defers.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'At current scope, when will you ship something a real user can actually use? If that date keeps moving, scope has grown past the timeline — cut something.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Scope expanding."}
Lighter: ship-real-user-use date + moving = cut.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the minimum version that\'s shippable in your available time this week/month? What specifically gets cut to reach that minimum?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Scope expanding."}
Narrower: min-shippable + specifically-what-cut.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Cut scope to fit available time — define the minimum shippable version for this week/month.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Scope expanding."}
Minimum next step: cut scope to available time.
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 6 E7-E9 — pm role FORMAL content ───────────────────────────────────

export const ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_FORMAL: DecisionContent = {
  question: 'Are acceptance criteria defined for this story before development begins?',
  pinchFallback: 'Define acceptance criteria for this story before starting implementation.',
  L1: [
    {
      option: 'Write the acceptance criteria for this story before any implementation prompt: state each criterion as an independently verifiable condition, in Given/When/Then or "this is done when [X]" form. List at least three covering the primary scenario and the most likely edge case.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Story about to enter dev without acceptance criteria stated."}
Acceptance criteria for this story haven't been defined — risk of building the wrong thing correctly.
3+ independently-verifiable criteria / G/W/T or done-when form / primary + likely edge.
{R4_CLOSE}`,
    },
    {
      option: 'Apply the INVEST testability rule to this story\'s acceptance criteria: for each criterion, confirm a tester could write a test case from it. Rewrite any criterion that is too vague to be testable — use Given/When/Then or completion-condition form.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "INVEST testability not applied."}
The INVEST testability check hasn't been applied.
Per criterion: tester writes test from it? / rewrite vague ones in G/W/T.
{R4_CLOSE}`,
    },
    {
      option: 'Before writing any implementation prompt: name the acceptance criteria. One sentence minimum: "This is done when [condition]." This 30-second discipline prevents the most expensive rework scenario: building the wrong thing correctly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "30-second AC discipline skipped."}
The 30-second AC discipline hasn't been done.
'Done when [condition]' / prevents wrong-thing-correctly rework.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Write the acceptance criteria now, in Given/When/Then or completion-condition format, before starting the implementation prompt.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Story entering dev."}
Lighter: G/W/T or done-when before impl prompt.
{R4_CLOSE}`,
    },
    {
      option: 'What is the explicit condition that would cause you to reject this story at demo? That condition IS the acceptance criteria.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Story entering dev."}
Narrower: demo-rejection condition = AC.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'State the acceptance criteria — "this is done when [condition]" — before any implementation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Story entering dev."}
Minimum next step: 'done when [condition]' pre-impl.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_FORMAL: DecisionContent = {
  question: 'Have relevant stakeholders been aligned on this feature before development begins?',
  pinchFallback: 'Verify stakeholder alignment before proceeding with significant development work.',
  L1: [
    {
      option: 'Identify every stakeholder with a legitimate opinion on this feature, name the alignment touchpoint required for each (sign-off, design review, security review, eng-lead consult), and confirm each is completed or scheduled before implementation begins. Document the date and outcome.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature entering dev without stakeholder alignment confirmed."}
Stakeholder alignment for this feature hasn't been confirmed — risk of rework on rejection at demo.
Identify stakeholders / per-stakeholder touchpoint type / each completed or scheduled / date + outcome documented.
Still, before you send any alignment request to a stakeholder you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Run a 15-minute stakeholder alignment pass for this feature before implementation: list the stakeholders, send the alignment request, capture responses, and document the result in the sprint item. State explicitly any assumption being made about a stakeholder\'s position.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "15-min alignment pass not run."}
The 15-min alignment pass hasn't been run.
List / send request / capture responses / document in sprint item / state stakeholder-position assumptions.
Still, before you send the alignment request to any stakeholder you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Alignment threshold: not every feature requires formal sign-off. The question is: who has a legitimate opinion about this feature that, if unvalidated, could cause rejection at demo? If the answer is "anyone," alignment before development is required. Document who was aligned and when.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Alignment-threshold question not asked."}
The alignment-threshold question hasn't been asked.
Legitimate opinion → demo-rejection risk? / if 'anyone' → align pre-dev / document who + when.
Still, before you contact any stakeholder you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Who has a legitimate opinion about this feature that could cause rework if not validated? Contact them before writing the first implementation prompt.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature entering dev."}
Lighter: legitimate-opinion + contact-before-first-prompt.
Still, before you contact the stakeholder you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'What assumption about stakeholder expectations is embedded in this feature? Validate the assumption before coding it in.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature entering dev."}
Narrower: embedded stakeholder-expectation assumption + validate pre-code.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Identify and align the relevant stakeholder for this feature before beginning implementation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature entering dev."}
Minimum next step: identify + align stakeholder pre-impl.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_FORMAL: DecisionContent = {
  question: 'Are there ambiguous quality attributes in these requirements that need a measurable definition?',
  pinchFallback: 'Resolve ambiguous quality attributes to measurable criteria before implementation.',
  L1: [
    {
      option: 'Audit this feature\'s requirements for ambiguity: identify every quality-attribute placeholder ("better", "faster", "improved", "user-friendly") and replace each with a measurable target — name the metric, the measurement method, and the success threshold.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Quality-attribute placeholders not converted to measurables."}
Ambiguous quality attributes haven't been converted to measurable targets — risk of unevaluable requirement satisfaction.
Identify placeholders / replace with metric + method + threshold.
{R4_CLOSE}`,
    },
    {
      option: 'Convert every ambiguous phrase in this requirement set to a measurable equivalent before implementation begins. Example: "faster" → "API p95 response time under 200 ms"; "intuitive" → "primary task completed by a new user in under 90 seconds without help." List the rewrites.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Ambiguous-phrase conversions not done."}
The ambiguous-phrase conversions haven't been done.
faster → p95 latency / intuitive → completion-time / list rewrites pre-impl.
{R4_CLOSE}`,
    },
    {
      option: 'Apply SMART to every quality attribute in this feature\'s requirements: confirm each is Specific, Measurable, Achievable, Relevant, Time-bound. Reject or rewrite any criterion that does not pass all five before development starts.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "SMART check not applied per attribute."}
The per-attribute SMART check hasn't been done.
Specific / Measurable / Achievable / Relevant / Time-bound — fail any → reject or rewrite pre-dev.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Replace each quality attribute placeholder ("better," "faster," "improved") with a specific, measurable target. State the measurement method and success threshold.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Requirements have placeholders."}
Lighter: placeholder → specific + measurable + method + threshold.
{R4_CLOSE}`,
    },
    {
      option: 'What is the testable condition that would prove this requirement is met? Write it before building toward it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Requirements not all testable."}
Narrower: testable proven-met condition pre-build.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Define a measurable acceptance target for every quality attribute before starting implementation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Requirements with placeholders."}
Minimum next step: measurable target per attribute pre-impl.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_DEPENDENCY_MAPPING_FORMAL: DecisionContent = {
  question: 'Have upstream and downstream dependencies for this work been identified before starting?',
  pinchFallback: 'Map dependencies before beginning this work to prevent blocked integration.',
  L1: [
    {
      option: 'Dependency identification is a foundational project management discipline (WBS, critical path method). Before any work begins: what does this work depend on (upstream), and what depends on this work completing (downstream)? Unmapped upstream dependencies create blocked work discovered mid-sprint; unmapped downstream dependencies create integration surprises at the worst time — when another team has built against an unstated assumption.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Work about to start without dependency mapping."}
Upstream/downstream dependencies for this work haven't been mapped — risk of mid-sprint blocked work or integration surprises.
WBS/CPM discipline / what this depends on + what depends on this / unmapped = mid-sprint blocks + downstream surprises.
{R4_CLOSE}`,
    },
    {
      option: 'Classify every dependency for this work item: technical, team, external, or knowledge. For each, name the specific dependency, its current status, and the resolution path (coordination, timeline negotiation, decision needed). Flag the longest-resolution dependency for immediate attention.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Dependency classification not done."}
The dependency classification hasn't been done.
Technical / team / external / knowledge — name + status + resolution-path / longest-resolution flagged.
{R4_CLOSE}`,
    },
    {
      option: 'Run the 30-minute dependency-mapping conversation now for this work item: convene the relevant teams, list upstream and downstream items, capture each in the sprint item with owner and resolution date. The alternative is the 2-5× recovery cost when a dependency surfaces mid-sprint — pre-empt it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "30-min dependency-mapping conversation not held."}
The 30-min dependency-mapping conversation hasn't been held.
Convene / upstream + downstream / owner + resolution date / 2-5× recovery if surfaces mid-sprint.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'List all upstream dependencies (what this work requires to proceed) and downstream impacts (what depends on this work completing). Who needs to be notified?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Work about to start."}
Lighter: list upstream + downstream + who-to-notify.
{R4_CLOSE}`,
    },
    {
      option: 'Which of these dependencies are currently unresolved? What specific action is needed before development can safely begin?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Work about to start."}
Narrower: unresolved + specific-action-for-safe-start.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Map all upstream and downstream dependencies for this work item before the first implementation prompt.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Work about to start."}
Minimum next step: map upstream + downstream pre-first-prompt.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_DEFINITION_OF_DONE_FORMAL: DecisionContent = {
  question: 'Is there an explicit Definition of Done for this sprint item?',
  pinchFallback: 'Define the completion criteria for this item before starting work.',
  L1: [
    {
      option: 'Write the Definition of Done for this sprint item before work begins: state the functional condition, the quality gate (testing or review pass), the documentation requirement, and the target deployment state. Use the form "this item is done when [X] AND [Y]."',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Sprint item entering work without DoD."}
Definition of Done for this item hasn't been written — risk of sprint-review debate over whether work is finished.
Functional / quality gate / docs / deployment state / 'done when [X] AND [Y]' form.
{R4_CLOSE}`,
    },
    {
      option: 'Compose this item\'s DoD with all four required elements: (1) functional acceptance — what the system should do, (2) quality gate — what testing or review must pass, (3) documentation requirement, (4) deployment state. Address or explicitly exclude each before development starts.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Four-element DoD not composed."}
The four-element DoD hasn't been composed.
Functional / quality gate / docs / deployment — address or explicitly exclude pre-dev.
{R4_CLOSE}`,
    },
    {
      option: 'Write the one-line DoD for this item now: "This item is done when [functional condition] AND [quality gate]." Add it to the sprint item — a one-line DoD prevents the sprint-review debate over whether work is finished.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "One-line DoD not added to sprint item."}
The one-line DoD hasn't been added to the sprint item.
Functional condition AND quality gate / prevents sprint-review debate.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Write the Definition of Done for this item now — "this is done when [condition]." State both the functional condition and the quality gate.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Item entering work."}
Lighter: functional + quality-gate in 'done when' form.
{R4_CLOSE}`,
    },
    {
      option: 'What would cause you to reject this item at sprint review? That rejection condition IS the Definition of Done.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Item entering work."}
Narrower: sprint-review-rejection condition = DoD.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'State the Definition of Done — "this is done when [condition]" — before any work begins.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Item entering work."}
Minimum next step: 'done when [condition]' pre-work.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_CROSS_TEAM_IMPACT_CHECK_FORMAL: DecisionContent = {
  question: 'Have teams affected by this change been notified before development begins?',
  pinchFallback: 'Identify and notify affected teams before building this change to shared systems.',
  L1: [
    {
      option: 'Identify every team affected by this change to a shared system (API, schema, infrastructure), draft the notification message, send it, and document delivery in the sprint item before implementation begins. A pre-change Slack message costs minutes; a post-change broken integration costs team-days.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Shared-system change about to start without affected teams notified."}
Affected teams haven't been notified of this shared-system change — risk of post-change broken integration costing team-days.
Identify teams / draft notification / send / document delivery / pre-change Slack < post-change broken integration.
Still, before you send the notification to any team you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Classify this shared-system change by impact category — API contract, database schema, shared service behaviour, infrastructure — then route the notification to the affected consumers for each category. Confirm each team has received and acknowledged the change before this work proceeds.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Impact-category classification + routing not done."}
The impact-category classification + routing hasn't been done.
API contract / schema / shared service / infra → route + receive + acknowledge per category.
Still, before you route the notification to any affected consumer team you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Minimum notification standard: before building any change to a shared system, name the affected teams, send a notification, and document that notification in the sprint item. "Notified Team X on [date] — no blocking concerns raised" is sufficient. The documentation creates accountability and a paper trail for sprint retrospectives.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Minimum notification standard not met."}
The minimum notification standard hasn't been met.
Name teams / send / document with date + outcome — accountability + retro paper trail.
Still, before you send the cross-team notification you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'List the teams affected by this change. Send them a notification before writing the first implementation prompt. Document who was notified.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Shared-system change pending."}
Lighter: list + send + document.
Still, before you send the notification to any team you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'What would break in another team\'s work if this change deployed without warning? That team needs notification before you begin.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Shared-system change pending."}
Narrower: break-without-warning team → notify before begin.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Notify all affected teams of this shared-system change before starting implementation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Shared-system change pending."}
Minimum next step: notify affected teams pre-impl.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_SUCCESS_METRIC_DEFINITION_FORMAL: DecisionContent = {
  question: 'Is there a success metric defined for this feature before development begins?',
  pinchFallback: 'Define how success will be measured for this feature before starting implementation.',
  L1: [
    {
      option: 'Define the success metric for this feature before development: name the metric, the measurement method, the success threshold, and the measurement timeline — e.g. "feature adoption rate, tracked via feature_used analytics event, threshold 30% of active users within 30 days." Add to the sprint item.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature entering dev without success metric defined."}
Success metric for this feature hasn't been defined — risk of unevaluable post-ship outcome.
Metric / method / threshold / timeline — add to sprint item pre-dev.
{R4_CLOSE}`,
    },
    {
      option: 'Success metric format: name the metric, the measurement method, the success threshold, and the measurement timeline. Example: "Success metric: feature adoption rate. Method: track feature_used events in analytics. Threshold: 30% of active users within 30 days of launch. Timeline: 60-day measurement window." A metric without a threshold is not a metric — it\'s an observation. A metric without a timeline is not actionable.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Success-metric four-part format not applied."}
The four-part success-metric format hasn't been applied.
Metric / method / threshold / timeline — no threshold = observation; no timeline = unactionable.
{R4_CLOSE}`,
    },
    {
      option: 'Confirm the three pre-ship functions of this feature\'s success metric are in place: (1) team alignment on what value the feature delivers, (2) the basis for the post-ship retrospective, (3) the forcing question — "if we cannot measure success, should we build this at all?" Resolve any of the three that is missing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Three pre-ship metric functions not confirmed."}
The three pre-ship metric functions haven't been confirmed.
Team-value alignment / retro basis / 'measurable-or-build?' forcing question / resolve missing.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Define the success metric now: name the metric, measurement method, success threshold, and measurement timeline. Write it in the sprint item before coding begins.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature entering dev."}
Lighter: metric + method + threshold + timeline.
{R4_CLOSE}`,
    },
    {
      option: 'If this feature shipped tomorrow and no one used it, would we know? If not, the success metric is missing — define it now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature entering dev."}
Narrower: would-we-know-if-unused test → missing metric.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'State the success metric, threshold, and measurement timeline before any implementation work.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature entering dev."}
Minimum next step: metric + threshold + timeline pre-impl.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_PRIORITY_JUSTIFICATION_FORMAL: DecisionContent = {
  question: 'Is there an explicit justification for why this item is the current highest priority?',
  pinchFallback: 'Articulate the priority justification for this item before beginning work.',
  L1: [
    {
      option: 'State the priority justification for this sprint item in one sentence before development begins: name the user or business value, the urgency or time criticality, the risk reduction or strategic alignment — and the next-highest-priority alternative being deferred to make room for this item.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Sprint item entering dev without priority rationale."}
Priority rationale for this item hasn't been articulated — risk of silent drift toward easiest work.
Value / urgency / risk / strategic alignment / next-highest-priority deferred.
{R4_CLOSE}`,
    },
    {
      option: 'Priority justification components: user or business value (who benefits and how much?); urgency or time criticality (does delay reduce value?); risk reduction (does doing this now prevent a future problem?); effort estimate (relative cost). WSJF combines these: (Value + Time Criticality + Risk Reduction) / Effort. The formula is less important than the discipline — before committing to any item, articulate why this item over the alternatives.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "WSJF-style justification not articulated."}
The WSJF-style justification hasn't been articulated.
Value / time criticality / risk reduction / effort — WSJF ratio / discipline > formula.
{R4_CLOSE}`,
    },
    {
      option: 'One-sentence priority justification minimum: "This item is highest priority because [specific reason — user impact / time constraint / risk / strategic alignment]." This 30-second discipline makes backlog prioritization decisions explicit, reversible, and legible to the team. It prevents the silent drift toward whatever is easiest.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "One-sentence justification not written."}
The one-sentence priority justification hasn't been written.
'Highest priority because [specific reason]' / 30-sec discipline / explicit + reversible + legible.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'State the priority justification for this item in one sentence: why this item over the next item in the backlog? Name the specific reason.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Item entering dev."}
Lighter: one-sentence why-this-over-next-backlog.
{R4_CLOSE}`,
    },
    {
      option: 'What would be lost if this item were pushed to the next sprint? If the answer is "nothing significant," it may not be the highest priority item.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Item entering dev."}
Narrower: what-lost-if-pushed / 'nothing significant' = priority check.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Justify this item\'s priority before starting: why this item now, over the alternatives?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Item entering dev."}
Minimum next step: why-this-now-over-alternatives.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_USER_STORY_COMPLETENESS_FORMAL: DecisionContent = {
  question: 'Is this work item expressed as a complete user story with who, what, and why?',
  pinchFallback: 'Reframe this work item as a user story — who benefits, what they need, why it matters.',
  L1: [
    {
      option: 'Rewrite this work item in Connextra format before implementation: "As a [specific user type], I want [the capability this feature enables], so that [the value or outcome delivered]." If the "so that" cannot be completed, that is the most important thing to resolve — propose what stakeholder conversation closes it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Work item missing Connextra-format user story."}
User story who/what/why hasn't been completed — risk of technically-correct artifact missing the outcome.
As-a / I-want / so-that — 'so that' unfillable = most important to resolve pre-impl.
{R4_CLOSE}`,
    },
    {
      option: 'For this user story, validate the proposed implementation approach against the "so that" clause: does the chosen approach deliver the stated value, or does it deliver a technically-correct artifact that misses the outcome? Propose adjustments if the latter.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Impl-vs-'so-that' check not done."}
The impl-vs-'so-that' check hasn't been done.
Delivers stated value or technically-correct-missing-outcome? / adjust if latter.
{R4_CLOSE}`,
    },
    {
      option: 'Reframe now: "As a [specific user type], I want [the action this feature enables], so that [the outcome they can achieve]." If you cannot complete the "so that," the feature\'s value is not yet understood — and that is the most important thing to resolve before implementation begins.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Connextra-format reframe not done."}
The Connextra reframe hasn't been done.
As-a / I-want / so-that / 'so-that' unfilled = feature-value not yet understood.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Complete the user story template: "As a [user type], I want [action], so that [value]." If the "so that" is unclear, that is what to resolve before building.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Work item pending."}
Lighter: complete As-a/I-want/so-that — unclear 'so-that' → resolve first.
{R4_CLOSE}`,
    },
    {
      option: 'Who specifically benefits from this feature? What outcome does it enable for them? That is the user story — write it before writing the implementation prompt.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Work item pending."}
Narrower: who-benefits + outcome-enabled = user story before impl prompt.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Write the full user story — who/what/why — before any implementation begins.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Work item pending."}
Minimum next step: full user story who/what/why before impl.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_RISK_FLAG_FORMAL: DecisionContent = {
  question: 'Have risks been identified for this decision or scope change before proceeding?',
  pinchFallback: 'Identify and document risks before proceeding with this significant decision.',
  L1: [
    {
      option: 'Identify the risks for this decision before proceeding: for each risk category (technical, scope, stakeholder, dependency, timeline), name the specific risk, estimate likelihood (H/M/L) and impact (H/M/L), and state the mitigation or acceptance decision. Document each in the sprint item.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Decision pending; risks not identified per category."}
Risks for this decision haven't been identified — assumptions remain unmonitored uncertainties.
Categories: technical / scope / stakeholder / dependency / timeline / likelihood + impact + mitigation per risk.
{R4_CLOSE}`,
    },
    {
      option: 'Risk categories relevant to PM + AI development: technical risk (the implementation approach may not work as designed or may have performance characteristics that break under load); scope risk (the feature may be more complex than the current estimate); stakeholder risk (a decision-maker may reject the direction at demo); dependency risk (an upstream team or external service may not deliver on time); timeline risk (effort estimates may be wrong). Each category should be briefly evaluated before proceeding.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Per-category risk evaluation not done."}
The per-category risk evaluation hasn't been done.
Technical / scope / stakeholder / dependency / timeline — brief evaluation each pre-proceed.
{R4_CLOSE}`,
    },
    {
      option: 'Risk naming format: "[Risk]: [description] — [likelihood: H/M/L] — [impact: H/M/L] — [mitigation: action or accepted]." A one-sentence risk identification is better than no identification. It converts an assumption into a monitored uncertainty, which is the prerequisite for doing anything about it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Risk-naming format not applied."}
The risk-naming format hasn't been applied.
[Risk] / [description] / [L: H/M/L] / [I: H/M/L] / [mitigation: action or accepted].
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Name the risks for this decision before proceeding: what could go wrong, how likely, what the impact is, and whether there is a mitigation or it is accepted.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Decision pending."}
Lighter: what-wrong / likely / impact / mitigation-or-accepted.
{R4_CLOSE}`,
    },
    {
      option: 'What assumption embedded in this decision, if wrong, would cause the most damage? That assumption IS the risk. Name it before committing to the decision.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Decision pending."}
Narrower: most-damaging-if-wrong assumption = the risk.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Identify and document risks before proceeding — what could go wrong and how it would be mitigated.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Decision pending."}
Minimum next step: identify + document risks + mitigation.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_FORMAL: DecisionContent = {
  question: 'Has the impact of this scope change on the current sprint been assessed?',
  pinchFallback: 'Assess sprint impact before accepting this scope change.',
  L1: [
    {
      option: 'Before accepting this mid-sprint scope change, complete the four-point impact assessment: (1) what existing in-progress item is displaced, (2) does the sprint end date shift, (3) which downstream teams have a date dependency on what this change affects, (4) what is explicitly removed or deferred to make room. Document all four answers in the sprint item before the change enters scope.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Mid-sprint scope change pending without four-point impact assessment."}
Sprint-impact assessment for this scope change hasn't been completed — risk of sprint failure from un-traded-off expansion.
4 points: displaced-item / sprint-end-shift / downstream-date-dep / removed-or-deferred — document all pre-enter-scope.
{R4_CLOSE}`,
    },
    {
      option: 'Four-point impact assessment for any mid-sprint scope change: (1) Timeline impact — does this change the sprint end date? (2) In-progress item impact — what currently in-flight work is affected or displaced? (3) Downstream dependency impact — do other teams have a date dependency on something this change affects? (4) Trade-off decision — what is explicitly removed or deferred to make room for this change? All four must be answered before the change enters the sprint.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Four-point assessment per change not done."}
The four-point per-change assessment hasn't been done.
Timeline / in-progress / downstream / trade-off — answer all four pre-enter-sprint.
{R4_CLOSE}`,
    },
    {
      option: 'Scope change governance minimum: "Accepting [change X]. Impact: [timeline +N days / no change]. Displaces: [item Y — deferred to next sprint]. Downstream: [Team Z notified / no downstream impact]. Trade-off: [accepted — deferred item Y is lower priority]." This 60-second assessment prevents sprint failure and creates a paper trail for the retrospective.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Governance minimum not met."}
The governance minimum hasn't been met.
Accepting / Impact / Displaces / Downstream / Trade-off — 60-sec format / retro paper trail.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Before accepting this scope change: what does it displace, does it affect the sprint end date, and are downstream teams impacted? Answer all three before committing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Scope change pending."}
Lighter: displaces / end-date-shift / downstream-impact — all three pre-commit.
{R4_CLOSE}`,
    },
    {
      option: 'What is being removed or deferred to make room for this change? If nothing is being removed, the sprint commitment has just expanded without capacity expanding.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Scope change pending."}
Narrower: removed-or-deferred trade-off / else capacity not expanding.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Complete the four-point impact assessment before accepting this scope change into the sprint.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Scope change pending."}
Minimum next step: complete 4-point impact assessment pre-accept.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_RETROSPECTIVE_HABIT_FORMAL: DecisionContent = {
  question: 'Has this sprint or iteration been closed with a retrospective before starting the next?',
  pinchFallback: 'Run a retrospective on this sprint before moving to the next cycle.',
  L1: [
    {
      option: 'Run the sprint retrospective now before the next sprint begins: list what went well (preserve and reinforce), what did not go well (process problems without blame), and one or two specific, actionable process changes to try in the next sprint. Document the chosen action items.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Next sprint about to start without retrospective on this one."}
Sprint retrospective hasn't been run before the next cycle — process problems repeat without action items.
What went well / what didn't go well / 1-2 specific actionable changes / document action items.
{R4_CLOSE}`,
    },
    {
      option: 'Structure the retrospective in three parts: (1) what went well — name 2-3 practices to preserve, (2) what did not go well — name 2-3 process problems, (3) what to try next sprint — commit to one or two specific changes. Capture the commitments in the sprint board.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Three-part retro structure not run."}
The three-part retro structure hasn't been run.
2-3 preserve / 2-3 problems / 1-2 next-sprint commitments / sprint board capture.
{R4_CLOSE}`,
    },
    {
      option: 'Draft the retrospective action items as specific, executable commitments — not platitudes. Reject "we should communicate better"; accept "we will use a shared Slack channel for async decisions, starting next sprint." Write 1-2 such commitments and assign owners.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Specific executable commitments not drafted."}
The specific-executable-commitments draft hasn't been done.
Reject platitudes / accept specific 'we will [X]' / 1-2 commitments + owners.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Before starting the next sprint: run the retrospective — what went well, what didn\'t, and one specific process change to try next cycle. Document the action item.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Next sprint imminent."}
Lighter: well / didn't / one specific change + document.
{R4_CLOSE}`,
    },
    {
      option: 'What process mistake from this sprint, if not addressed now, will definitely repeat in the next sprint? That is the retrospective topic.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Next sprint imminent."}
Narrower: will-definitely-repeat-if-not-addressed = retro topic.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Run the sprint retrospective now — what went well, what didn\'t, one process change for next sprint.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Next sprint imminent."}
Minimum next step: retro + one process change for next sprint.
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 7 F1-F2 — session-quality signals (CASUAL register) ─────────────────

export const ABSENCE_DECISION_FATIGUE_PATTERN_CASUAL: DecisionContent = {
  question:      'Long acceptance streak — applied critical review recently?',
  pinchFallback: 'Streak alert.',
  L1: [
    {
      option: 'Review the last few AI responses critically — especially for edge cases, hidden assumptions, and anything that was accepted without being read carefully.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been accepting AI responses fast without really reviewing them critically."}
The critical-review hasn't been done on recent responses.
Look at recent output for edge cases / hidden assumptions / accepted-without-reading items.
{R4_CLOSE}`,
    },
    {
      option: 'Push back on the last significant AI suggestion: what would you question if you were reviewing this code rather than writing it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Streak of acceptances; pushback not done."}
The pushback on the last significant suggestion hasn't been done.
Question what a reviewer would question.
{R4_CLOSE}`,
    },
    {
      option: 'Check recent AI output for anything that looks right at a glance but might fail — edge cases, incorrect assumptions, or logic that was never validated.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Streak; looks-right-but-might-fail check not done."}
The looks-right-but-might-fail check hasn't been done.
Spot edge cases / incorrect assumptions / never-validated logic.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Look at the last AI response with fresh eyes — is there anything you would question or verify before continuing?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Streak; fresh-eyes review not done."}
Lighter: fresh-eyes look at last response — anything to question or verify.
{R4_CLOSE}`,
    },
    {
      option: 'Pick one thing from recent AI output to double-check before the next prompt.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Streak; one-thing double-check not done."}
Narrower: one thing from recent output to double-check.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in the last AI response worth questioning before continuing?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Streak."}
Minimum next step: anything in the last response worth questioning.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_WORK_RHYTHM_CHECK_CASUAL: DecisionContent = {
  question:      'Rapid prompting — verified each response before continuing?',
  pinchFallback: 'Slow down.',
  L1: [
    {
      option: 'Read and verify the last AI response before continuing — check for anything that looks right at a glance but might be wrong: logic gaps, unchecked edge cases, incomplete error handling.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been sending prompts fast without really reading the responses."}
The last response hasn't been read and verified.
Spot looks-right-but-might-be-wrong items — logic gaps / unchecked edge cases / incomplete error handling.
{R4_CLOSE}`,
    },
    {
      option: 'Before the next prompt: read the last response fully, identify anything not yet verified, and confirm the generated code is actually correct.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Rapid sends; pre-next-prompt verify not done."}
The pre-next-prompt verify hasn't been done.
Read fully / unverified items / generated-code-correctness check.
{R4_CLOSE}`,
    },
    {
      option: 'Slow down: read the last AI output in full and check for anything unverified before the next message.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Rapid sends; slow-down read not done."}
The slow-down read hasn't been done.
Read in full; check unverified items.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Read the last AI response fully before continuing — has everything been verified?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Rapid sends; full read not done."}
Lighter: full read + everything-verified check.
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in the last response that was accepted without being read carefully?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Rapid sends; carefully-read check not done."}
Narrower: accepted-without-reading-carefully items.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Read the last response before sending the next message.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Rapid sends."}
Minimum next step: read the last response before the next send.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_FOCUS_DRIFT_DETECTION_CASUAL: DecisionContent = {
  question:      'Multiple areas open — completed any end-to-end?',
  pinchFallback: 'Focus drift.',
  L1: [
    {
      option: 'Finish one thing before starting another: identify what is open right now, pick the most important one, and close it completely before touching anything else.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been jumping between multiple things this session without finishing any of them."}
Finishing one thing before starting another hasn't been done.
Spot opens; pick most important; close it completely before touching anything else.
{R4_CLOSE}`,
    },
    {
      option: 'List the open concerns in this session, pick the most critical one, and complete it — resist starting anything new until that one is done.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Multiple open concerns; resist-new not applied."}
The resist-new discipline hasn't been applied.
List opens / pick critical / complete it / hold the line against starting new.
{R4_CLOSE}`,
    },
    {
      option: 'Close one open thread end-to-end before continuing: what is the most important unfinished thing right now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Open threads; close-one-end-to-end not done."}
The close-one-end-to-end discipline hasn't been applied.
Spot the most important unfinished thing; close it; then continue.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the most important open concern to complete right now, before anything else?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Multiple open concerns."}
Lighter: most important open to complete right now.
{R4_CLOSE}`,
    },
    {
      option: 'Pick one thing to finish completely before starting something new.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Multiple open concerns; one-to-finish not picked."}
Narrower: pick one to finish before new.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Complete one thing before opening another.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Multiple open concerns."}
Minimum next step: complete one before opening another.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SESSION_LENGTH_CHECKPOINT_CASUAL: DecisionContent = {
  question:      'Extended session — context checkpoint done?',
  pinchFallback: 'Checkpoint due.',
  L1: [
    {
      option: 'Drop a context checkpoint before continuing: what has been built, what decisions were made, what is still open, and what the current goal is.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long session; haven't dropped a checkpoint."}
A context checkpoint hasn't been dropped.
Built / decisions / still open / current goal.
{R4_CLOSE}`,
    },
    {
      option: 'Summarize where things stand: what got done, what decisions were made, and what is still open — so the next part of the session starts with clear state.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long session; status summary not done."}
The status summary hasn't been done.
Where-things-stand: done / decisions / still open.
{R4_CLOSE}`,
    },
    {
      option: 'What is the current build state — what works, what is in progress, and what is the next step?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long session; current build state unclear."}
Current build state hasn't been called out.
Works / in-progress / next step.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What has been built this session — what is working and what is still in progress?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long session."}
Lighter: what's built — working / in-progress.
{R4_CLOSE}`,
    },
    {
      option: 'What is the most important decision made this session that needs to carry forward?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long session; carry-forward decision unclear."}
Narrower: most important carry-forward decision.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is the one most important thing to not lose track of before continuing?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long session."}
Minimum next step: the one most important thing to not lose track of.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_PROGRESS_CONSOLIDATION_GAP_CASUAL: DecisionContent = {
  question:      'Extended implementation — progress documented?',
  pinchFallback: 'Document now.',
  L1: [
    {
      option: 'Consolidate: update the README, write a brief description of what was built, or add clarifying comments before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been building a lot in this session and I haven't written any of it down."}
Consolidation hasn't been done.
Update README / write brief description / add clarifying comments.
{R4_CLOSE}`,
    },
    {
      option: 'Lock in the current state: write down what was built, any key decisions made, and what is still open — before the session context is lost.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long build run; current state not locked in."}
The state lock-in hasn't been done.
Write: built / key decisions / still open.
{R4_CLOSE}`,
    },
    {
      option: 'Write a quick progress note — what was built, what decisions were made, and what comes next.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long build run; progress note not written."}
The progress note hasn't been written.
Quick note: built / decisions / what comes next.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Add a brief note or comment documenting what was just built before moving on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long build run."}
Lighter: brief note or comment documenting what was just built.
{R4_CLOSE}`,
    },
    {
      option: 'Write one sentence about the key decision made in this implementation run.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long build run."}
Narrower: one sentence about the key decision in this implementation run.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Write a one-sentence note on what was built before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long build run."}
Minimum next step: one-sentence note on what was built.
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 7 F1-F2 — session-quality signals (FORMAL register) ─────────────────

export const ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL: DecisionContent = {
  question:      'Long acceptance streak — applied critical review recently?',
  pinchFallback: 'Streak alert.',
  L1: [
    {
      option: 'Apply deliberate critical review to the most recent AI responses: identify any assumptions that have not been validated, logic that could fail under edge cases, and changes made without explicit verification.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: long AI-acceptance streak. No critical review of the streak done."}
A critical review of the recent AI-acceptance streak hasn't been done — assumptions or edge-case failures may have slipped through unchallenged.
Apply deliberate critical review: unvalidated assumptions / edge-case logic / unverified changes.
{R4_CLOSE}`,
    },
    {
      option: 'Self-review the last set of AI-generated changes: flag any hallucinated functions, plausible-but-incorrect logic, or unhandled edge cases before accepting the next response.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Long acceptance streak; self-review on recent changes not performed."}
The self-review on recent AI-generated changes hasn't been performed.
Flag: hallucinated functions / plausible-but-incorrect logic / unhandled edge cases.
{R4_CLOSE}`,
    },
    {
      option: 'Audit recent AI output for correctness: check any state or data assumptions, verify control flow, and identify anything that was accepted without being read carefully.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Acceptance streak; correctness audit not done."}
The correctness audit on recent output hasn't been done.
Check state/data assumptions / verify control flow / identify accepted-but-unread items.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Review recent AI responses critically — what would you flag if reviewing this as a senior engineer rather than as the author?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Acceptance streak; senior-reviewer lens not applied."}
Lighter: senior-engineer-reviewer lens — what'd you flag?
{R4_CLOSE}`,
    },
    {
      option: 'Pick the most significant recent AI response and push back on one aspect of it before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Acceptance streak; pushback not exercised."}
Narrower: most-significant recent response + push back on one aspect.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Identify one thing in recent AI output to verify or question before accepting the next response.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Acceptance streak."}
Minimum next step: one thing to verify or question before next-response acceptance.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_WORK_RHYTHM_CHECK_FORMAL: DecisionContent = {
  question:      'Rapid prompting — verified each response before continuing?',
  pinchFallback: 'Slow down.',
  L1: [
    {
      option: 'Read and verify the last AI response in full before sending the next prompt: check any logic or state assumptions, confirm any generated code is complete and correct, and identify anything that was not explicitly validated.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: rapid send rate. Last AI response not fully read/verified."}
The last AI response hasn't been read and verified before the next prompt — rapid prompting risks accepting unverified content.
Read fully; check logic / state assumptions / generated-code correctness / unvalidated items.
{R4_CLOSE}`,
    },
    {
      option: 'Audit the last AI-generated change for correctness before proceeding: trace any control flow, check any state transitions, and verify all assumptions are grounded.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Rapid prompting; correctness audit on last change not done."}
The correctness audit on the last AI change hasn't been done.
Trace control flow / check state transitions / verify assumptions grounded.
{R4_CLOSE}`,
    },
    {
      option: 'Pause and review the last response before continuing: identify any part that was generated but not read, any assumption that was not confirmed, and any error handling that may be missing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Rapid prompting; pause-and-review not done."}
The pause-and-review on the last response hasn't been done.
Identify generated-but-not-read / unconfirmed assumptions / missing error handling.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Read the last AI response carefully before sending the next prompt — is there anything unread or unverified?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Rapid prompting; careful read not done."}
Lighter: careful read of last response; unread / unverified items.
{R4_CLOSE}`,
    },
    {
      option: 'Check the last generated output for any assumptions or errors before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Rapid prompting; assumption/error check not done."}
Narrower: assumptions or errors in the last generated output.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Pause — read the last response before sending the next message.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Rapid prompting."}
Minimum next step: pause + read last response.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL: DecisionContent = {
  question:      'Multiple areas open — completed any end-to-end?',
  pinchFallback: 'Focus drift.',
  L1: [
    {
      option: 'Sequence your work: identify the highest-priority open concern in this session, complete it end-to-end, and define done for that domain before opening any additional concerns.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: multiple concerns touched. No end-to-end completion."}
Multiple open concerns in this session haven't been completed end-to-end — context-switching costs are compounding.
Identify highest-priority open concern; complete it end-to-end; define done; only then open new concerns.
{R4_CLOSE}`,
    },
    {
      option: 'Close one open concern completely before touching another: list the current open concerns, pick the most critical, and do not touch the others until it is resolved.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Multiple open concerns; close-one-before-touching-another discipline not applied."}
The one-at-a-time discipline hasn't been applied.
List current opens / pick most critical / hold off others until resolved.
{R4_CLOSE}`,
    },
    {
      option: 'Audit the current session\'s open concerns: name them all, rank them by criticality, and commit to completing the top one before any other context switch.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Multiple open concerns; audit + commitment not done."}
The open-concerns audit hasn't been done.
Name all open concerns / rank by criticality / commit to top one before next context switch.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Pick the single most important open concern in this session and complete it before starting anything else.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Multiple open concerns; pick-one not done."}
Lighter: pick single most-important; complete; only then start anything else.
{R4_CLOSE}`,
    },
    {
      option: 'What is the one thing in this session that must be finished before anything else can be safely started?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Multiple open concerns; finish-before-safe-start not identified."}
Narrower: the one thing to finish before any safe new start.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Complete one open concern end-to-end before opening another.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Multiple open concerns."}
Minimum next step: complete one end-to-end before opening another.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL: DecisionContent = {
  question:      'Extended session — context checkpoint done?',
  pinchFallback: 'Checkpoint due.',
  L1: [
    {
      option: 'Summarize the current state of what was just built: what decisions have been made, what is working, what remains incomplete, and what has changed since the session started — use this as a re-anchor before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended session; status checkpoint not done."}
A status checkpoint for this extended session hasn't been done — current state, working pieces, and next steps aren't anchored.
Summarize current build status: decisions made / working / incomplete / changes since start.
{R4_CLOSE}`,
    },
    {
      option: 'Reconstruct the decision log for this session: what tradeoffs were made, what constraints were identified, and what is still unresolved — so the next phase starts with explicit context, not implicit state.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended session; decision log not reconstructed."}
The decision log for this session hasn't been reconstructed.
Reconstruct: tradeoffs / constraints identified / still unresolved — explicit context, not implicit state.
{R4_CLOSE}`,
    },
    {
      option: 'Audit the current build state against the original goal: what was actually completed, what was deferred, and what decisions may need revisiting before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended session; goal-vs-actual audit not done."}
The original-goal-vs-actual-state audit hasn't been done.
List: actually completed / deferred / decisions to revisit.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the current state of what was just built — what is working, what is still in progress, and what is the immediate next step?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended session."}
Lighter: current state — working / in-progress / immediate next step.
{R4_CLOSE}`,
    },
    {
      option: 'What is the most important technical decision made this session that must be explicitly carried forward before continuing?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended session; carry-forward decision not flagged."}
Narrower: most important decision needing explicit carry-forward.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is the one piece of context about this project that must not be lost before continuing — the single most important thing to anchor right now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended session."}
Minimum next step: one not-to-be-lost context anchor.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL: DecisionContent = {
  question:      'Extended implementation — progress documented?',
  pinchFallback: 'Document now.',
  L1: [
    {
      option: 'Consolidate the current build state: document what has been implemented, capture the key decisions made, and record any outstanding work before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended implementation; consolidation not done."}
Progress made in this session hasn't been consolidated — implicit state risks being lost as the session continues.
Document: implemented / key decisions / outstanding work.
{R4_CLOSE}`,
    },
    {
      option: 'Update the project documentation to reflect the current state: what was built, why it was designed this way, and what has been deferred — make the implicit state explicit.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended implementation; doc update not done."}
Project docs haven't been updated.
Update: built / design rationale / deferred items — make implicit state explicit.
{R4_CLOSE}`,
    },
    {
      option: 'Write a progress summary covering what was built in this session, what technical decisions were made, and what remains before the feature is complete.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended implementation; progress summary not written."}
The progress summary hasn't been written.
Cover: built this session / technical decisions / remaining-before-complete.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Update documentation or comments to reflect the current implementation state before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended implementation; docs not updated."}
Lighter: update docs or comments to reflect current state.
{R4_CLOSE}`,
    },
    {
      option: 'Write a brief note on what was built and what key technical decisions were made.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended implementation; brief-note not written."}
Narrower: brief note — built + key decisions.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Write one sentence documenting the most important thing about what was just built before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended implementation."}
Minimum next step: one sentence documenting the most important thing.
{R4_CLOSE}`,
    },
  ],
};

// ── Content resolution ─────────────────────────────────────────────────────────

/**
 * Absence-signal content overrides.
 * When Stage 2 fires for an absence flag, map the signal to the most relevant content.
 * Signals not listed here fall back to the stage-based transition content.
 */
const ABSENCE_CONTENT: Partial<Record<string, DecisionContent>> = {
  test_creation:         ABSENCE_TEST_CREATION,
  regression_check:      ABSENCE_REGRESSION_CHECK,
  spec_acceptance_check: ABSENCE_SPEC_ACCEPTANCE,
  cross_confirming:      ABSENCE_CROSS_CONFIRMING,
  behaviour_testing:     BEHAVIOUR_TESTING,
  security_check:        ABSENCE_SECURITY_CHECK,
  error_handling:        ABSENCE_ERROR_HANDLING,
  documentation:         ABSENCE_DOCUMENTATION,
  observability:         ABSENCE_OBSERVABILITY,
  comprehension:         ABSENCE_COMPREHENSION,
  refactoring_review:      ABSENCE_REFACTORING,
  no_agent_pushback:       ABSENCE_NO_PUSHBACK,
  correction_seeking:      ABSENCE_CORRECTION_SEEKING,
  problem_correction:      ABSENCE_PROBLEM_CORRECTION,
  alternatives_seeking:    ABSENCE_ALTERNATIVES,
  architecture_conflict:   ABSENCE_ARCH_CONFLICT,
  prompt_context_richness: ABSENCE_PROMPT_CONTEXT,
  rollback_planning:       ABSENCE_ROLLBACK_PLANNING,
  deployment_planning:     ABSENCE_DEPLOYMENT_PLANNING,
  dependency_management:   ABSENCE_DEPENDENCY_MGMT,
  phase_transition:        ABSENCE_PHASE_TRANSITION,
  spec_cross_confirm:      ABSENCE_SPEC_CROSS_CONFIRM,
  spec_revision:           ABSENCE_SPEC_REVISION,
  idea_scoping:            ABSENCE_IDEA_SCOPING,
  idea_constraint_check:   ABSENCE_IDEA_CONSTRAINT_CHECK,
  idea_user_definition:    ABSENCE_IDEA_USER_DEFINITION,
  task_ordering:           ABSENCE_TASK_ORDERING,
  task_sizing:             ABSENCE_TASK_SIZING,
  task_definition_of_done: ABSENCE_TASK_DEFINITION_OF_DONE,
  user_feedback_review:    ABSENCE_USER_FEEDBACK_REVIEW,
  iteration_planning:      ABSENCE_ITERATION_PLANNING,
  scope_creep:             ABSENCE_SCOPE_CREEP,
  context_loss:            ABSENCE_CONTEXT_LOSS,
  api_design_review:       ABSENCE_API_DESIGN_REVIEW,
  accessibility:           ABSENCE_ACCESSIBILITY,
  environment_and_secrets: ABSENCE_ENV_AND_SECRETS,
  data_validation:         ABSENCE_DATA_VALIDATION,
  ci_pipeline:             ABSENCE_CI_PIPELINE,
  rate_limiting:           ABSENCE_RATE_LIMITING,
  feature_scope_before_build:    ABSENCE_FEATURE_SCOPE,
  implementation_checkpoint:     ABSENCE_IMPLEMENTATION_CHECKPOINT,
  spec_before_code:              ABSENCE_SPEC_BEFORE_CODE,
  incremental_build:             ABSENCE_INCREMENTAL_BUILD,
  decision_record_absence:       ABSENCE_DECISION_RECORD_ABSENCE_FORMAL,
  over_engineering_check:        ABSENCE_OVER_ENGINEERING_CHECK_FORMAL,
  pair_review_absence:           ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL,
  observability_first:           ABSENCE_OBSERVABILITY_FIRST_FORMAL,
  failure_mode_analysis:         ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL,
  contract_testing_gap:          ABSENCE_CONTRACT_TESTING_GAP_FORMAL,
  capacity_planning_gap:         ABSENCE_CAPACITY_PLANNING_GAP_FORMAL,
  security_threat_modeling:      ABSENCE_SECURITY_THREAT_MODELING_FORMAL,
  database_migration_safety:     ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL,
  deployment_strategy_absence:   ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL,
  operational_runbook_gap:       ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL,
  slo_definition_gap:            ABSENCE_SLO_DEFINITION_GAP_FORMAL,
  decision_fatigue_pattern:      ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL,
  work_rhythm_check:             ABSENCE_WORK_RHYTHM_CHECK_FORMAL,
  focus_drift_detection:         ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL,
  session_length_checkpoint:     ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL,
  progress_consolidation_gap:    ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL,
};

const ABSENCE_CONTENT_CASUAL: Partial<Record<string, DecisionContent>> = {
  test_creation:         ABSENCE_TEST_CREATION_CASUAL,
  regression_check:      ABSENCE_REGRESSION_CHECK_CASUAL,
  spec_acceptance_check: ABSENCE_SPEC_ACCEPTANCE_CASUAL,
  cross_confirming:      ABSENCE_CROSS_CONFIRMING_CASUAL,
  behaviour_testing:     BEHAVIOUR_TESTING_CASUAL,
  security_check:        ABSENCE_SECURITY_CHECK_CASUAL,
  error_handling:        ABSENCE_ERROR_HANDLING_CASUAL,
  documentation:         ABSENCE_DOCUMENTATION_CASUAL,
  observability:         ABSENCE_OBSERVABILITY_CASUAL,
  comprehension:         ABSENCE_COMPREHENSION_CASUAL,
  refactoring_review:      ABSENCE_REFACTORING_CASUAL,
  no_agent_pushback:       ABSENCE_NO_PUSHBACK_CASUAL,
  correction_seeking:      ABSENCE_CORRECTION_SEEKING_CASUAL,
  problem_correction:      ABSENCE_PROBLEM_CORRECTION_CASUAL,
  alternatives_seeking:    ABSENCE_ALTERNATIVES_CASUAL,
  architecture_conflict:   ABSENCE_ARCH_CONFLICT_CASUAL,
  prompt_context_richness: ABSENCE_PROMPT_CONTEXT_CASUAL,
  rollback_planning:       ABSENCE_ROLLBACK_PLANNING_CASUAL,
  deployment_planning:     ABSENCE_DEPLOYMENT_PLANNING_CASUAL,
  dependency_management:   ABSENCE_DEPENDENCY_MGMT_CASUAL,
  phase_transition:        ABSENCE_PHASE_TRANSITION_CASUAL,
  spec_cross_confirm:      ABSENCE_SPEC_CROSS_CONFIRM_CASUAL,
  spec_revision:           ABSENCE_SPEC_REVISION_CASUAL,
  idea_scoping:            ABSENCE_IDEA_SCOPING_CASUAL,
  idea_constraint_check:   ABSENCE_IDEA_CONSTRAINT_CHECK_CASUAL,
  idea_user_definition:    ABSENCE_IDEA_USER_DEFINITION_CASUAL,
  task_ordering:           ABSENCE_TASK_ORDERING_CASUAL,
  task_sizing:             ABSENCE_TASK_SIZING_CASUAL,
  task_definition_of_done: ABSENCE_TASK_DEFINITION_OF_DONE_CASUAL,
  user_feedback_review:    ABSENCE_USER_FEEDBACK_REVIEW_CASUAL,
  iteration_planning:      ABSENCE_ITERATION_PLANNING_CASUAL,
  scope_creep:             ABSENCE_SCOPE_CREEP_CASUAL,
  context_loss:            ABSENCE_CONTEXT_LOSS_CASUAL,
  api_design_review:       ABSENCE_API_DESIGN_REVIEW_CASUAL,
  accessibility:           ABSENCE_ACCESSIBILITY_CASUAL,
  environment_and_secrets: ABSENCE_ENV_AND_SECRETS_CASUAL,
  data_validation:         ABSENCE_DATA_VALIDATION_CASUAL,
  ci_pipeline:             ABSENCE_CI_PIPELINE_CASUAL,
  rate_limiting:           ABSENCE_RATE_LIMITING_CASUAL,
  feature_scope_before_build:    ABSENCE_FEATURE_SCOPE_CASUAL,
  implementation_checkpoint:     ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL,
  spec_before_code:              ABSENCE_SPEC_BEFORE_CODE_CASUAL,
  incremental_build:             ABSENCE_INCREMENTAL_BUILD_CASUAL,
  feature_completion_check:      ABSENCE_FEATURE_COMPLETION_CHECK_CASUAL,
  finishing_line_awareness:      ABSENCE_FINISHING_LINE_AWARENESS_CASUAL,
  polish_vs_function:            ABSENCE_POLISH_VS_FUNCTION_CASUAL,
  mvp_scope_discipline:          ABSENCE_MVP_SCOPE_DISCIPLINE_CASUAL,
  idea_to_spec_bridge:           ABSENCE_IDEA_TO_SPEC_BRIDGE_CASUAL,
  demo_vs_product:               ABSENCE_DEMO_VS_PRODUCT_CASUAL,
  user_journey_check:            ABSENCE_USER_JOURNEY_CHECK_CASUAL,
  technical_spike_treatment:     ABSENCE_TECHNICAL_SPIKE_TREATMENT_CASUAL,
  dependency_adventure:          ABSENCE_DEPENDENCY_ADVENTURE_CASUAL,
  restart_impulse_check:         ABSENCE_RESTART_IMPULSE_CHECK_CASUAL,
  creative_vs_core_ratio:        ABSENCE_CREATIVE_VS_CORE_RATIO_CASUAL,
  code_documentation_gap:        ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL,
  technical_debt_acknowledgment: ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL,
  test_depth_check:              ABSENCE_TEST_DEPTH_CHECK_CASUAL,
  architecture_note_absence:     ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL,
  dependency_audit_gap:          ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL,
  security_review_gap:           ABSENCE_SECURITY_REVIEW_GAP_CASUAL,
  api_contract_definition:       ABSENCE_API_CONTRACT_DEFINITION_CASUAL,
  error_handling_coverage:       ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL,
  refactoring_checkpoint:        ABSENCE_REFACTORING_CHECKPOINT_CASUAL,
  backwards_compatibility_check: ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL,
  self_review_habit:             ABSENCE_SELF_REVIEW_HABIT_CASUAL,
  performance_awareness:         ABSENCE_PERFORMANCE_AWARENESS_CASUAL,
  decision_fatigue_pattern:      ABSENCE_DECISION_FATIGUE_PATTERN_CASUAL,
  work_rhythm_check:             ABSENCE_WORK_RHYTHM_CHECK_CASUAL,
  focus_drift_detection:         ABSENCE_FOCUS_DRIFT_DETECTION_CASUAL,
  session_length_checkpoint:     ABSENCE_SESSION_LENGTH_CHECKPOINT_CASUAL,
  progress_consolidation_gap:    ABSENCE_PROGRESS_CONSOLIDATION_GAP_CASUAL,
};

const ABSENCE_CONTENT_FOUNDER: Partial<Record<string, DecisionContent>> = {
  user_value_check:                  ABSENCE_USER_VALUE_CHECK_CASUAL,
  outcome_definition:                ABSENCE_OUTCOME_DEFINITION_CASUAL,
  feature_prioritization:            ABSENCE_FEATURE_PRIORITIZATION_CASUAL,
  user_persona_clarity:              ABSENCE_USER_PERSONA_CLARITY_CASUAL,
  competitive_awareness:             ABSENCE_COMPETITIVE_AWARENESS_CASUAL,
  mvp_boundary_discipline:           ABSENCE_MVP_BOUNDARY_DISCIPLINE_CASUAL,
  user_acquisition_consideration:    ABSENCE_USER_ACQUISITION_CONSIDERATION_CASUAL,
  retention_mechanism_check:         ABSENCE_RETENTION_MECHANISM_CHECK_CASUAL,
  feedback_loop_establishment:       ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT_CASUAL,
  hypothesis_before_build:           ABSENCE_HYPOTHESIS_BEFORE_BUILD_CASUAL,
  technical_vs_product_time_balance: ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE_CASUAL,
  north_star_alignment:              ABSENCE_NORTH_STAR_ALIGNMENT_CASUAL,
};

const ABSENCE_CONTENT_INDIE_HACKER: Partial<Record<string, DecisionContent>> = {
  time_to_value_check:         ABSENCE_TIME_TO_VALUE_CHECK_CASUAL,
  ship_readiness_definition:   ABSENCE_SHIP_READINESS_DEFINITION_CASUAL,
  manual_before_automate:      ABSENCE_MANUAL_BEFORE_AUTOMATE_CASUAL,
  tech_stack_complexity_check: ABSENCE_TECH_STACK_COMPLEXITY_CHECK_CASUAL,
  launch_strategy_absence:     ABSENCE_LAUNCH_STRATEGY_ABSENCE_CASUAL,
  early_user_feedback:         ABSENCE_EARLY_USER_FEEDBACK_CASUAL,
  solo_maintainability:        ABSENCE_SOLO_MAINTAINABILITY_CASUAL,
  distribution_thinking:       ABSENCE_DISTRIBUTION_THINKING_CASUAL,
  monetization_path_clarity:   ABSENCE_MONETIZATION_PATH_CLARITY_CASUAL,
  build_in_public_opportunity: ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY_CASUAL,
  scope_vs_time_check:         ABSENCE_SCOPE_VS_TIME_CHECK_CASUAL,
};

const ABSENCE_CONTENT_PM: Partial<Record<string, DecisionContent>> = {
  acceptance_criteria_before_dev: ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_FORMAL,
  stakeholder_alignment_check:    ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_FORMAL,
  requirements_ambiguity_flag:    ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_FORMAL,
  dependency_mapping:             ABSENCE_DEPENDENCY_MAPPING_FORMAL,
  definition_of_done:             ABSENCE_DEFINITION_OF_DONE_FORMAL,
  cross_team_impact_check:        ABSENCE_CROSS_TEAM_IMPACT_CHECK_FORMAL,
  success_metric_definition:      ABSENCE_SUCCESS_METRIC_DEFINITION_FORMAL,
  priority_justification:         ABSENCE_PRIORITY_JUSTIFICATION_FORMAL,
  user_story_completeness:        ABSENCE_USER_STORY_COMPLETENESS_FORMAL,
  risk_flag:                      ABSENCE_RISK_FLAG_FORMAL,
  scope_change_impact_assessment: ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_FORMAL,
  retrospective_habit:            ABSENCE_RETROSPECTIVE_HABIT_FORMAL,
  decision_fatigue_pattern:       ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL,
  work_rhythm_check:              ABSENCE_WORK_RHYTHM_CHECK_FORMAL,
  focus_drift_detection:          ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL,
  session_length_checkpoint:      ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL,
  progress_consolidation_gap:     ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL,
};

const ABSENCE_CONTENT_PRO_GEEK_SOUL: Partial<Record<string, DecisionContent>> = {
  decision_fatigue_pattern:   ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL,
  work_rhythm_check:          ABSENCE_WORK_RHYTHM_CHECK_FORMAL,
  focus_drift_detection:      ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL,
  session_length_checkpoint:  ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL,
  progress_consolidation_gap: ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL,
};

/**
 * Stage transition content lookup.
 * Keyed by the DESTINATION stage (currentStage after transition).
 */
const TRANSITION_CONTENT: Partial<Record<Stage, DecisionContent>> = {
  prd:            IDEA_TO_PRD,
  architecture:   PRD_TO_ARCHITECTURE,
  task_breakdown: ARCHITECTURE_TO_TASKS,
  review_testing: IMPLEMENTATION_TO_REVIEW,
  release:        REVIEW_TO_RELEASE,
  feedback_loop:  RELEASE_TO_FEEDBACK,
};

function selectAbsenceMap(nature: UserProfile['nature'] | null | undefined): Partial<Record<string, DecisionContent>> {
  if (nature === 'hardcore_pro') return ABSENCE_CONTENT;
  return ABSENCE_CONTENT_CASUAL;
}

function selectRoleAbsenceMap(role: UserProfile['role'] | null | undefined): Partial<Record<string, DecisionContent>> | null {
  if (role === 'founder')      return ABSENCE_CONTENT_FOUNDER;
  if (role === 'indie_hacker') return ABSENCE_CONTENT_INDIE_HACKER;
  if (role === 'pm')           return ABSENCE_CONTENT_PM;
  return null;
}

function selectNonBeginnerVariant(nature: UserProfile['nature'] | null | undefined): DecisionContent {
  if (nature === 'hardcore_pro') return TASK_REVIEW;
  return TASK_REVIEW_CASUAL;
}

/**
 * Resolve the decision content to display.
 *
 * Priority:
 *   1. Absence flag with a specific override → use it
 *   2. Stage transition → use destination-stage content
 *   3. Implementation stage (within-stage absence) → heuristic variant by profile.nature
 *   4. Ultimate fallback → heuristic variant by profile.nature
 */
function resolveSkippedTransitionContent(
  transitionMap: Partial<Record<Stage, DecisionContent>>,
  prevStage:     Stage,
  currentStage:  Stage,
): DecisionContent | null {
  const prevIdx = STAGES.indexOf(prevStage);
  const currIdx = STAGES.indexOf(currentStage);
  if (prevIdx < 0 || currIdx < 0 || currIdx - prevIdx <= 1) return null;
  for (let i = currIdx - 1; i > prevIdx; i--) {
    const stage = STAGES[i];
    if (stage && transitionMap[stage]) return transitionMap[stage]!;
  }
  return null;
}

export function resolveDecisionContent(
  currentStage: Stage,
  flagType:     FlagType,
  profile?:     UserProfile | null,
  prevStage?:   Stage,
): DecisionContent {
  const isBeginner    = profile?.nature === 'beginner';
  const isVibe        = isBeginner;
  const absenceMap    = isVibe ? ABSENCE_CONTENT_BEGINNER : selectAbsenceMap(profile?.nature);
  const roleMap       = isVibe ? null : selectRoleAbsenceMap(profile?.role);
  const transitionMap = isVibe ? TRANSITION_CONTENT_BEGINNER : TRANSITION_CONTENT;

  if (flagType.startsWith('absence:')) {
    const signalKey  = flagType.slice('absence:'.length);
    const roleHit    = roleMap?.[signalKey];
    if (roleHit) return roleHit;
    if (profile?.nature === 'pro_geek_soul') {
      const pgOverride = ABSENCE_CONTENT_PRO_GEEK_SOUL[signalKey];
      if (pgOverride) return pgOverride;
    }
    const override   = absenceMap[signalKey];
    if (override) return override;
  }

  if (flagType === 'stage_transition' && prevStage) {
    const skipped = resolveSkippedTransitionContent(transitionMap, prevStage, currentStage);
    if (skipped) return skipped;
  }

  const direct = transitionMap[currentStage];
  if (direct) return direct;

  if (currentStage === 'implementation') return isBeginner ? TASK_REVIEW_BEGINNER : selectNonBeginnerVariant(profile?.nature);

  return isBeginner ? TASK_REVIEW_BEGINNER : selectNonBeginnerVariant(profile?.nature);
}

// ── Option list building ───────────────────────────────────────────────────────

export const SHOW_SIMPLER  = 'Show simpler options →' as const;
export const SKIP_NOW      = 'Skip for now — nexpath optimize will remind me later' as const;

export type SpecialOption  = typeof SHOW_SIMPLER | typeof SKIP_NOW;
export type DecisionOption = string | SpecialOption;

export interface BuiltOptionList {
  /** The selectable options for this level, including "Show simpler options →" and "Skip for now". */
  options: DecisionOption[];
  /** Whether "Show simpler options →" is included (levels 1 and 2 only). */
  hasNextLevel: boolean;
}

/**
 * Build the full option list for a given level.
 *
 * Structure (per research):
 *   - Content options for this level
 *   - [separator implied in UI — not a selectable option]
 *   - "Show simpler options →"  (levels 1 and 2 only)
 *   - "Skip for now — nexpath optimize will remind me later"  (always last)
 */
export function buildOptionList(
  content: DecisionContent,
  level:   1 | 2 | 3,
): BuiltOptionList {
  const contentOptions: OptionEntry[] =
    level === 1 ? content.L1 :
    level === 2 ? content.L2 :
                  content.L3;

  const hasNextLevel = level < 3;
  // Surface the user-facing option text for the list. Desc-base content
  // attached to each OptionEntry is consumed by the render layer when
  // rendering the why-help / desc-base regions, not in the flat option
  // list shown for selection.
  const options: DecisionOption[] = contentOptions.map((e) => e.option);

  if (hasNextLevel) options.push(SHOW_SIMPLER);
  options.push(SKIP_NOW);

  return { options, hasNextLevel };
}

// ── Level subtitle ─────────────────────────────────────────────────────────────

/** Returns the level subtitle shown below the pinch label (research spec). */
export function getLevelSubtitle(level: 1 | 2 | 3): string | null {
  if (level === 1) return null;
  if (level === 2) return '— lighter options';
  return '— minimum viable step';
}

// ── Re-exports ─────────────────────────────────────────────────────────────────

export {
  IDEA_TO_PRD,
  PRD_TO_ARCHITECTURE,
  ARCHITECTURE_TO_TASKS,
  TASK_REVIEW,
  TASK_REVIEW_CASUAL,
  IMPLEMENTATION_TO_REVIEW,
  REVIEW_TO_RELEASE,
  RELEASE_TO_FEEDBACK,
  BEHAVIOUR_TESTING,
  BEHAVIOUR_TESTING_CASUAL,
  ABSENCE_TEST_CREATION,
  ABSENCE_TEST_CREATION_CASUAL,
  ABSENCE_REGRESSION_CHECK,
  ABSENCE_REGRESSION_CHECK_CASUAL,
  ABSENCE_SPEC_ACCEPTANCE,
  ABSENCE_SPEC_ACCEPTANCE_CASUAL,
  ABSENCE_CROSS_CONFIRMING,
  ABSENCE_CROSS_CONFIRMING_CASUAL,
  ABSENCE_SECURITY_CHECK,
  ABSENCE_SECURITY_CHECK_CASUAL,
  ABSENCE_ERROR_HANDLING,
  ABSENCE_ERROR_HANDLING_CASUAL,
  ABSENCE_DOCUMENTATION,
  ABSENCE_DOCUMENTATION_CASUAL,
  ABSENCE_OBSERVABILITY,
  ABSENCE_OBSERVABILITY_CASUAL,
  ABSENCE_COMPREHENSION,
  ABSENCE_COMPREHENSION_CASUAL,
  ABSENCE_REFACTORING,
  ABSENCE_REFACTORING_CASUAL,
  ABSENCE_NO_PUSHBACK,
  ABSENCE_NO_PUSHBACK_CASUAL,
  ABSENCE_CORRECTION_SEEKING,
  ABSENCE_CORRECTION_SEEKING_CASUAL,
  ABSENCE_PROBLEM_CORRECTION,
  ABSENCE_PROBLEM_CORRECTION_CASUAL,
  ABSENCE_ALTERNATIVES,
  ABSENCE_ALTERNATIVES_CASUAL,
  ABSENCE_ARCH_CONFLICT,
  ABSENCE_ARCH_CONFLICT_CASUAL,
  ABSENCE_PROMPT_CONTEXT,
  ABSENCE_PROMPT_CONTEXT_CASUAL,
  ABSENCE_ROLLBACK_PLANNING,
  ABSENCE_ROLLBACK_PLANNING_CASUAL,
  ABSENCE_DEPLOYMENT_PLANNING,
  ABSENCE_DEPLOYMENT_PLANNING_CASUAL,
  ABSENCE_DEPENDENCY_MGMT,
  ABSENCE_DEPENDENCY_MGMT_CASUAL,
  ABSENCE_PHASE_TRANSITION,
  ABSENCE_PHASE_TRANSITION_CASUAL,
  ABSENCE_SPEC_CROSS_CONFIRM,
  ABSENCE_SPEC_CROSS_CONFIRM_CASUAL,
  ABSENCE_SPEC_REVISION,
  ABSENCE_SPEC_REVISION_CASUAL,
  ABSENCE_IDEA_SCOPING,
  ABSENCE_IDEA_SCOPING_CASUAL,
  ABSENCE_IDEA_CONSTRAINT_CHECK,
  ABSENCE_IDEA_CONSTRAINT_CHECK_CASUAL,
  ABSENCE_IDEA_USER_DEFINITION,
  ABSENCE_IDEA_USER_DEFINITION_CASUAL,
  ABSENCE_TASK_ORDERING,
  ABSENCE_TASK_ORDERING_CASUAL,
  ABSENCE_TASK_SIZING,
  ABSENCE_TASK_SIZING_CASUAL,
  ABSENCE_TASK_DEFINITION_OF_DONE,
  ABSENCE_TASK_DEFINITION_OF_DONE_CASUAL,
  ABSENCE_USER_FEEDBACK_REVIEW,
  ABSENCE_USER_FEEDBACK_REVIEW_CASUAL,
  ABSENCE_ITERATION_PLANNING,
  ABSENCE_ITERATION_PLANNING_CASUAL,
  ABSENCE_SCOPE_CREEP,
  ABSENCE_SCOPE_CREEP_CASUAL,
  ABSENCE_CONTEXT_LOSS,
  ABSENCE_CONTEXT_LOSS_CASUAL,
  ABSENCE_API_DESIGN_REVIEW,
  ABSENCE_API_DESIGN_REVIEW_CASUAL,
  ABSENCE_ACCESSIBILITY,
  ABSENCE_ACCESSIBILITY_CASUAL,
  ABSENCE_ENV_AND_SECRETS,
  ABSENCE_ENV_AND_SECRETS_CASUAL,
  ABSENCE_DATA_VALIDATION,
  ABSENCE_DATA_VALIDATION_CASUAL,
  ABSENCE_CI_PIPELINE,
  ABSENCE_CI_PIPELINE_CASUAL,
  ABSENCE_RATE_LIMITING,
  ABSENCE_RATE_LIMITING_CASUAL,
  ABSENCE_FEATURE_SCOPE,
  ABSENCE_FEATURE_SCOPE_CASUAL,
  ABSENCE_IMPLEMENTATION_CHECKPOINT,
  ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL,
  ABSENCE_SPEC_BEFORE_CODE,
  ABSENCE_SPEC_BEFORE_CODE_CASUAL,
  ABSENCE_INCREMENTAL_BUILD,
  ABSENCE_INCREMENTAL_BUILD_CASUAL,
  ABSENCE_FEATURE_COMPLETION_CHECK_CASUAL,
  ABSENCE_FINISHING_LINE_AWARENESS_CASUAL,
  ABSENCE_POLISH_VS_FUNCTION_CASUAL,
  ABSENCE_MVP_SCOPE_DISCIPLINE_CASUAL,
  ABSENCE_IDEA_TO_SPEC_BRIDGE_CASUAL,
  ABSENCE_DEMO_VS_PRODUCT_CASUAL,
  ABSENCE_USER_JOURNEY_CHECK_CASUAL,
  ABSENCE_TECHNICAL_SPIKE_TREATMENT_CASUAL,
  ABSENCE_DEPENDENCY_ADVENTURE_CASUAL,
  ABSENCE_RESTART_IMPULSE_CHECK_CASUAL,
  ABSENCE_CREATIVE_VS_CORE_RATIO_CASUAL,
  ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL,
  ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL,
  ABSENCE_TEST_DEPTH_CHECK_CASUAL,
  ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL,
  ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL,
  ABSENCE_SECURITY_REVIEW_GAP_CASUAL,
  ABSENCE_API_CONTRACT_DEFINITION_CASUAL,
  ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL,
  ABSENCE_REFACTORING_CHECKPOINT_CASUAL,
  ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL,
  ABSENCE_SELF_REVIEW_HABIT_CASUAL,
  ABSENCE_PERFORMANCE_AWARENESS_CASUAL,
  ABSENCE_DECISION_RECORD_ABSENCE_FORMAL,
  ABSENCE_OVER_ENGINEERING_CHECK_FORMAL,
  ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL,
  ABSENCE_OBSERVABILITY_FIRST_FORMAL,
  ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL,
  ABSENCE_CONTRACT_TESTING_GAP_FORMAL,
  ABSENCE_CAPACITY_PLANNING_GAP_FORMAL,
  ABSENCE_SECURITY_THREAT_MODELING_FORMAL,
  ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL,
  ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL,
  ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL,
  ABSENCE_SLO_DEFINITION_GAP_FORMAL,
};
