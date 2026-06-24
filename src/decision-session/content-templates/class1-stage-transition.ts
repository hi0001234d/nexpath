// Per-class decision-session content (class1_stage_transition). Relocated verbatim from
// options.ts / options-beginner.ts — one home per signal class.

import type { DecisionContent } from '../options.js';
import { WHY_HELP_BY_SIGNAL_TYPE } from '../why-help-by-signal-type.js';

// ── Per-transition content ─────────────────────────────────────────────────────
/** Transition 1: Idea → PRD */
export const IDEA_TO_PRD: DecisionContent = {
  signalType:   "IDEA_TO_PRD",
  question:      'Before building — is the plan written?',
  pinchFallback: 'Before coding.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['IDEA_TO_PRD'],
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
export const PRD_TO_ARCHITECTURE: DecisionContent = {
  signalType:   "PRD_TO_ARCHITECTURE",
  question:      'Spec ready — is the architecture decided?',
  pinchFallback: 'Design first.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['PRD_TO_ARCHITECTURE'],
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
export const ARCHITECTURE_TO_TASKS: DecisionContent = {
  signalType:   "ARCHITECTURE_TO_TASKS",
  question:      'Architecture done — is the task list ordered?',
  pinchFallback: 'Break it down.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ARCHITECTURE_TO_TASKS'],
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
export const TASK_REVIEW: DecisionContent = {
  signalType:   "TASK_REVIEW",
  question:      'Task done — reviewed and tested?',
  pinchFallback: 'Quick check.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['TASK_REVIEW'],
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
export const TASK_REVIEW_CASUAL: DecisionContent = {
  signalType:   "TASK_REVIEW",
  question:      'Task done — quick check before moving on?',
  pinchFallback: 'Quick check.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['TASK_REVIEW'],
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
export const IMPLEMENTATION_TO_REVIEW: DecisionContent = {
  signalType:   "IMPLEMENTATION_TO_REVIEW",
  question:      'Phase done — full review before moving on?',
  pinchFallback: 'Phase done?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['IMPLEMENTATION_TO_REVIEW'],
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
export const REVIEW_TO_RELEASE: DecisionContent = {
  signalType:   "REVIEW_TO_RELEASE",
  question:      'Ready to ship — final checks done?',
  pinchFallback: 'Almost there.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['REVIEW_TO_RELEASE'],
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
export const RELEASE_TO_FEEDBACK: DecisionContent = {
  signalType:   "RELEASE_TO_FEEDBACK",
  question:      'Just shipped — is the feedback loop active?',
  pinchFallback: 'Watch it live.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['RELEASE_TO_FEEDBACK'],
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

export const IDEA_TO_PRD_BEGINNER: DecisionContent = {
  signalType:   "IDEA_TO_PRD",
  question:      'Before building — is the plan written?',
  pinchFallback: 'Before coding.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['IDEA_TO_PRD'],
  L1: [
    {
      option: '1. Help me describe what I\'m building in plain terms — what it does and who it\'s for.\n2. Share your understanding with me before we go further so I can confirm we\'re on the same page.\n3. Then tell me: what\'s the most important thing to figure out before we start building?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines first-person — "I've been talking about my project idea for a few prompts but I haven't written anything down clearly yet."}
I'm at the moment where talking about the idea turns into actually planning it; I need a shared understanding before going further.
The steps walk me through it: I describe, you confirm what you hear, then I pick the most important thing to nail down first.
{R4_CLOSE}`,
    },
    {
      option: 'Help me describe what I want to build in plain terms, then share it back with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "My recent prompts have been about the idea, but nothing concrete is written."}
Same moment, single back-and-forth instead of three steps.
Help me describe, then share back so I can confirm.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Ask me one question to understand what I\'m building better, then summarise what you hear back to me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "I've been talking about the idea but not in enough detail for you to act on it."}
Lighter version: one question, one summary back.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is anything about what I want to build still unclear to you?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea discussed; clarity not confirmed."}
Minimum next step: just tell me what's still unclear.
{R4_CLOSE}`,
    },
  ],
};

export const PRD_TO_ARCHITECTURE_BEGINNER: DecisionContent = {
  signalType:   "PRD_TO_ARCHITECTURE",
  question:      'Spec ready — is the architecture decided?',
  pinchFallback: 'Design first.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['PRD_TO_ARCHITECTURE'],
  L1: [
    {
      option: '1. List the main parts of what we\'re building and how they connect — in plain language, no technical terms.\n2. Share that list with me before we move on so I can confirm it covers everything.\n3. Then tell me: what\'s the one thing we need to decide before writing any code?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines first-person — "I have a sense of what to build but I don't know how the pieces connect yet."}
The spec feels solid; I need to know how the pieces fit together before any code gets written.
Walk me through it slowly: list the parts in plain language, share for confirmation, then point me at the one decision I need to make first.
{R4_CLOSE}`,
    },
    {
      option: 'Describe the main parts of this system and how they connect — then share it with me before we start building.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I know what I want to build but not how it's structured."}
Same moment, single pass: describe the parts and how they connect, then share so I can confirm.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the most important decision to make before we start coding? Share your answer with me first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Spec is there; first big decision not made."}
Lighter version: the single most important decision before coding.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything about the plan that could cause problems when we start coding?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Plan is there; trouble spots not surfaced."}
Minimum next step: anything in the plan that will bite during coding.
{R4_CLOSE}`,
    },
  ],
};

export const ARCHITECTURE_TO_TASKS_BEGINNER: DecisionContent = {
  signalType:   "ARCHITECTURE_TO_TASKS",
  question:      'Architecture done — is the task list ordered?',
  pinchFallback: 'Break it down.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ARCHITECTURE_TO_TASKS'],
  L1: [
    {
      option: '1. Break this down into small steps — each one should be something you can build in a single session.\n2. Share the list with me so I can check the order makes sense before you start.\n3. Then tell me: what\'s the first thing to build that shows the whole thing actually works?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines first-person — "I understand the structure now but I don't have a list of steps to actually start."}
I see how the pieces fit; I need this broken into steps I can actually start on, in order.
Walk me through it: small steps, share the list for ordering confirmation, then point out the first thing that proves the whole thing works.
{R4_CLOSE}`,
    },
    {
      option: 'List the first 3 steps to build this in order — then share them with me before you begin.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Structure is clear, no step list yet."}
Same moment, smaller scope: just the first three steps in order.
Share them for confirmation before starting.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the very first thing to build and why? Share your answer with me before we start.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Structure is clear, starting point not chosen."}
Lighter version: just the first thing to build and why.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is the order of these steps clear, or is anything missing before we start?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Step list is here; clarity not confirmed."}
Minimum next step: anything unclear or missing about the order.
{R4_CLOSE}`,
    },
  ],
};

export const TASK_REVIEW_BEGINNER: DecisionContent = {
  signalType:   "TASK_REVIEW",
  question:      'Task done — reviewed and tested?',
  pinchFallback: 'Quick check.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['TASK_REVIEW'],
  L1: [
    {
      option: '1. Review what was just built — does it do what this task asked for, in plain terms?\n2. Share your review with me before I mark this done, and flag anything that looks off.\n3. Then check: is there anything that might break something that was already working?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines first-person — "I just finished a task and the last few prompts have been about building it; I haven't reviewed it yet."}
A task just finished; I need a check before I mark it done and move on.
Walk me through it: review in plain terms, flag anything off, then check whether it broke something that was working.
{R4_CLOSE}`,
    },
    {
      option: 'Check if what was just built matches what the task asked for — share what you find with me first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Task just finished, no review yet."}
Same moment, simpler: did the build match what the task asked for? Share findings before I move on.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does what was just built look right to you? Flag anything that seems off and share it with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Task just finished."}
Lighter check: does the build look right? Flag the off stuff.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that looks wrong or incomplete?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Task just finished."}
Minimum next step: anything wrong or incomplete.
{R4_CLOSE}`,
    },
  ],
};

export const IMPLEMENTATION_TO_REVIEW_BEGINNER: DecisionContent = {
  signalType:   "IMPLEMENTATION_TO_REVIEW",
  question:      'Phase done — full review before moving on?',
  pinchFallback: 'Phase done?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['IMPLEMENTATION_TO_REVIEW'],
  L1: [
    {
      option: '1. Go through everything built in this phase — does it all work together the way it should?\n2. Share that with me before we move on and flag anything that looks incomplete or broken.\n3. Then check: is there anything a real person using this could run into that we haven\'t covered?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines first-person — "I've been building features through this phase across many prompts; no end-of-phase check yet."}
A whole phase just finished; I need to know it all works together before I start the next one.
Walk me through it: full coverage check, flag incomplete or broken pieces, then think about what a real user could hit that we haven't covered.
{R4_CLOSE}`,
    },
    {
      option: 'Check if everything in this phase is working as expected — share what you find with me before we move on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Phase just wrapped, no check yet."}
Same moment, simpler: is everything in the phase working? Share findings before moving on.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the most important thing to check before calling this phase done? Share your answer with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Phase just wrapped."}
Lighter check: the single most important thing to verify before calling the phase done.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything obviously broken or missing in what was just built?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Phase just wrapped."}
Minimum next step: anything obviously broken or missing.
{R4_CLOSE}`,
    },
  ],
};

export const REVIEW_TO_RELEASE_BEGINNER: DecisionContent = {
  signalType:   "REVIEW_TO_RELEASE",
  question:      'Ready to ship — final checks done?',
  pinchFallback: 'Almost there.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['REVIEW_TO_RELEASE'],
  L1: [
    {
      option: '1. Check that everything still works — go through the main things that need to pass before we ship.\n2. Share the results with me before we release anything.\n3. Then tell me: is there anything that could go wrong once this is live that we haven\'t tested in here?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines first-person — "Last few prompts: I've been reviewing and testing. Haven't done the final pre-ship gut check yet."}
Review is done; this is the last step before going live, and I need to be sure it's actually ready.
Walk me through it: go through what has to pass, share the results, then think about what could still break in production that we missed in here.
{R4_CLOSE}`,
    },
    {
      option: 'Check if this is ready to ship and share what still needs to be done before we release.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Review wrapped, ship status not yet checked."}
Same moment, simpler: is this ready to ship and what's still missing?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the biggest risk in shipping this right now? Share your answer with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship moment."}
Lighter check: the single biggest risk in shipping right now.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything that could break once this is live that we haven\'t tested?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship moment."}
Minimum next step: anything that could break in production we haven't tested.
{R4_CLOSE}`,
    },
  ],
};

export const RELEASE_TO_FEEDBACK_BEGINNER: DecisionContent = {
  signalType:   "RELEASE_TO_FEEDBACK",
  question:      'Just shipped — is the feedback loop active?',
  pinchFallback: 'Watch it live.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['RELEASE_TO_FEEDBACK'],
  L1: [
    {
      option: '1. Check that what was just built is actually working now that it\'s live — try the main thing it does and see if it works the way you expected.\n2. Share what you find with me before we move on and flag anything that looks off or unexpected.\n3. Then check: will we know if something breaks after we stop watching, or will it fail without showing an obvious error?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines first-person — "Just shipped; haven't checked it live and don't know yet if alerts would catch a silent break."}
It just went live; I need to know it actually works in production and that I'll find out if it breaks later.
Walk me through it: try the main thing, flag anything that looks off, then think about whether we'd know if something breaks after we stop watching.
{R4_CLOSE}`,
    },
    {
      option: 'Check if this project is set up to let us know if something goes wrong now that it\'s live — share what\'s in place and what\'s missing with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Just shipped; alerting/monitoring status not checked."}
Same moment, simpler: is the project set up to tell us if something goes wrong? What's there and what's missing?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'How would we find out if something is going wrong for a real person using this feature right now? Share your answer with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Just shipped."}
Lighter check: how would we even find out if a real user hits a problem right now?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that could go wrong without showing a clear error?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Just shipped."}
Minimum next step: anything in the build that could fail silently.
{R4_CLOSE}`,
    },
  ],
};
