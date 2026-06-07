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
}

// ── Per-transition content ─────────────────────────────────────────────────────

/** Transition 1: Idea → PRD */
const IDEA_TO_PRD: DecisionContent = {
  question:      'Before building — is the plan written?',
  pinchFallback: 'Before coding.',
  L1: [
    { option: 'Write a PRD for this project: define the problem, target user, core features with acceptance criteria, what is explicitly out of scope, and any technical constraints.', descBase: '' },
    { option: 'Define the problem and success criteria first: who is this for, what problem does it solve, and how will we know when it\'s done?', descBase: '' },
    { option: 'Cross-confirm the idea before writing spec: review what I\'ve described so far and tell me — is the problem statement clear enough to write a PRD? What\'s missing or ambiguous?', descBase: '' },
  ],
  L2: [
    { option: 'Write a one-paragraph scope statement: what this project does, what it does not do, and the single most important success criterion.', descBase: '' },
    { option: 'Cross-confirm the idea: given what I\'ve described, what are the top 3 things that should be clarified before I start building?', descBase: '' },
  ],
  L3: [
    { option: 'List the 3 most important acceptance criteria for this project so we can check them before release.', descBase: '' },
  ],
};

/** Transition 2: PRD → Architecture */
const PRD_TO_ARCHITECTURE: DecisionContent = {
  question:      'Spec ready — is the architecture decided?',
  pinchFallback: 'Design first.',
  L1: [
    { option: 'Design the system architecture for this project: list the main components, how they interact, the data model, API contracts (if any), and the tech stack with rationale for key choices.', descBase: '' },
    { option: 'Write a technical design doc: system components, data flows, key architectural decisions and why, and any constraints or risks I should know before coding starts.', descBase: '' },
    { option: 'Cross-confirm the spec before architecture: review the PRD/spec we have and tell me — is it precise enough that you could implement it without asking clarifying questions? List every ambiguity or gap.', descBase: '' },
    { option: 'Review the spec for architectural blind spots: based on the requirements, what architectural decisions will have the biggest impact on maintainability, performance, or security — and what\'s the recommended approach for each?', descBase: '' },
  ],
  L2: [
    { option: 'Sketch the main components and data flow: what are the key parts of this system and how does data move between them?', descBase: '' },
    { option: 'Cross-confirm the spec: given the current PRD, what are the top 3 architectural decisions I need to make before starting to code?', descBase: '' },
  ],
  L3: [
    { option: 'Cross-confirm the plan: what is the single biggest architectural risk in what I\'ve described, and what\'s the simplest way to address it?', descBase: '' },
  ],
};

/** Transition 3: Architecture → Task Breakdown */
const ARCHITECTURE_TO_TASKS: DecisionContent = {
  question:      'Architecture done — is the task list ordered?',
  pinchFallback: 'Break it down.',
  L1: [
    { option: 'Break the implementation into an ordered task list: each task should be completable in one coding session, delivered as a vertical slice where possible, and have a clear definition of done.', descBase: '' },
    { option: 'Create a task list file for this implementation phase: list tasks in order, with a one-line definition of done for each, so I can track progress and you have context for each session.', descBase: '' },
    { option: 'Cross-confirm the architecture before coding: review the architecture we\'ve designed and tell me — does it fully cover all the requirements in the spec? Are there any missing components, undefined data flows, or unresolved technical decisions?', descBase: '' },
    { option: 'Identify the first vertical slice: what is the thinnest end-to-end feature I can build first to validate the architecture and get something working?', descBase: '' },
  ],
  L2: [
    { option: 'List the top 5 implementation steps in order, with a one-line description of what done looks like for each.', descBase: '' },
    { option: 'Cross-confirm the architecture: given the spec and architecture, what are the top 3 things that could go wrong during implementation and how should I handle them?', descBase: '' },
  ],
  L3: [
    { option: 'Cross-confirm the first step: what should I build first and why — what validates the core assumption of this project fastest?', descBase: '' },
  ],
};

/** Transition 4: task_breakdown → implementation (per-task review before coding starts) */
const TASK_REVIEW: DecisionContent = {
  question:      'Task done — reviewed and tested?',
  pinchFallback: 'Quick check.',
  L1: [
    { option: 'Review what was just built for this task: does the implementation match the spec and acceptance criteria? List any discrepancies, missing logic, hallucinated code, or potential issues before I mark this done.', descBase: '' },
    { option: 'Run the tests for what was just built and report: which tests pass, which fail, and what needs to be fixed before moving to the next task.', descBase: '' },
    { option: 'Cross-confirm this implementation against the spec: does what was just built fully satisfy the requirements for this task? What is missing or different from what the spec required?', descBase: '' },
  ],
  L2: [
    { option: 'Quick review of what was just built: does it do what the task asked for? Any obvious issues?', descBase: '' },
    { option: 'Cross-confirm this task: does this implementation match the task\'s definition of done?', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in the code just generated that looks wrong or incomplete before I move on?', descBase: '' },
  ],
};

/** TASK_REVIEW_CASUAL — casual-register variant for cool_geek and pro_geek_soul profiles */
const TASK_REVIEW_CASUAL: DecisionContent = {
  question:      'Task done — quick check before moving on?',
  pinchFallback: 'Quick check.',
  L1: [
    { option: 'Quick look at what was just built — does it do what the task asked for? Anything off, anything missing, any weird generated code before I say it\'s done?', descBase: '' },
    { option: 'Run the tests for what was just built and report: which pass, which fail, and what needs fixing before moving on.', descBase: '' },
    { option: 'Does what was just built actually do what was asked? What\'s off or missing compared to what was planned?', descBase: '' },
  ],
  L2: [
    { option: 'Quick look at what was just built: does it do what the task asked for? Any obvious problems?', descBase: '' },
    { option: 'Does what was just built match what the task asked for — definition of done covered?', descBase: '' },
  ],
  L3: [
    { option: 'Anything in what was just built that looks off or incomplete before moving on?', descBase: '' },
  ],
};

/** Transition 5: Implementation → Review/Testing */
const IMPLEMENTATION_TO_REVIEW: DecisionContent = {
  question:      'Phase done — full review before moving on?',
  pinchFallback: 'Phase done?',
  L1: [
    { option: 'Run the full test suite for this phase: unit tests, integration tests, and any regression tests. Report results, failures, and what needs to be fixed.', descBase: '' },
    { option: 'Check the spec acceptance criteria against what was built: go through each acceptance criterion in the PRD and tell me whether it is fully satisfied, partially satisfied, or not yet implemented.', descBase: '' },
    { option: 'Cross-confirm the full implementation against the spec: review everything built in this phase and identify any gaps between what was implemented and what the spec required — include security, error handling, and edge cases.', descBase: '' },
    { option: 'Review for regression: does anything that was working before this phase now behave differently or break?', descBase: '' },
    // v0.3.0 — acceptance/behaviour testing gap
    { option: 'Write a manual acceptance test script for what was just built: cover the spec scenarios — happy path, boundary conditions, and error states automated tests would miss — and document the expected outcome at each step.', descBase: '' },
  ],
  L2: [
    { option: 'Run tests for the new code in this phase and report any failures.', descBase: '' },
    { option: 'Cross-confirm the critical path: do the 3 most important acceptance criteria from the spec pass end-to-end?', descBase: '' },
  ],
  L3: [
    { option: 'Cross-confirm before I move on: is there anything obviously broken or missing in what was just built?', descBase: '' },
  ],
};

/** Transition 6: Review/Testing → Release */
const REVIEW_TO_RELEASE: DecisionContent = {
  question:      'Ready to ship — final checks done?',
  pinchFallback: 'Almost there.',
  L1: [
    { option: 'Run all tests one final time before release: unit, integration, and regression. Confirm everything passes or tell me what is still failing.', descBase: '' },
    { option: 'Cross-confirm release readiness: have all tests passed, are all spec acceptance criteria met, have security concerns been addressed, and is there a rollback plan ready if something fails in production?', descBase: '' },
    { option: 'Review the new code for security issues before shipping: check for input validation gaps, authentication/authorization issues, hardcoded secrets, unhandled errors, and any other obvious vulnerabilities.', descBase: '' },
    { option: 'Write a release checklist for this deployment: what needs to happen before, during, and after the release to ensure it goes smoothly and I can roll back if needed.', descBase: '' },
  ],
  L2: [
    { option: 'Cross-confirm readiness: what are the top 3 risks in shipping this right now and how should I handle each?', descBase: '' },
    { option: 'Run the critical path tests only and confirm they pass.', descBase: '' },
  ],
  L3: [
    { option: 'Cross-confirm one thing: is there anything that is likely to break in production that we haven\'t tested yet?', descBase: '' },
  ],
};

/** Transition 7: Release → Feedback Loop */
const RELEASE_TO_FEEDBACK: DecisionContent = {
  question:      'Just shipped — is the feedback loop active?',
  pinchFallback: 'Watch it live.',
  L1: [
    { option: 'Verify the production monitoring setup for what was just built: confirm error tracking is active, alert thresholds are configured, and dashboards show live metrics — list what is collecting and what still needs to be set up.', descBase: '' },
    { option: 'Set up the feedback loop for this feature: identify what signals will tell you it is working (analytics events, error rates, user reports), confirm what is already in place, and list what still needs to be added to close the loop.', descBase: '' },
    { option: 'Run smoke checks on what was just built: confirm the main user path works end-to-end in the live environment, check for unexpected errors in the logs, and report anything that looks wrong.', descBase: '' },
  ],
  L2: [
    { option: 'What are the top 3 signals I should watch in the first 24 hours to know if this feature is behaving as expected in production?', descBase: '' },
    { option: 'What is the minimum feedback setup needed to know if this feature is landing well — and what is still missing from what is currently in place?', descBase: '' },
  ],
  L3: [
    { option: 'Is there a signal in place that would tell you if this feature silently breaks in production — or would it fail without alerting anyone?', descBase: '' },
  ],
};

/** Absence trigger: behaviour_testing — fires when implementation proceeds without manual acceptance testing */
const BEHAVIOUR_TESTING: DecisionContent = {
  question:      'Implementation done — user scenarios tested?',
  pinchFallback: 'User scenario?',
  L1: [
    { option: 'Write a manual test scenario for the main user journey: list each step a real user would take, what they would see, and what would confirm it is working correctly.', descBase: '' },
    { option: 'List the acceptance tests for this feature: describe 3 to 5 scenarios a real user would run through, from happy path to edge cases, and the expected outcome for each.', descBase: '' },
    { option: 'Identify the 3 most likely ways a real user could break this feature without triggering any automated tests — then tell me how to manually verify each one.', descBase: '' },
  ],
  L2: [
    { option: 'Describe the happy path for the main use case: what does a user do, step by step, to successfully complete the core workflow?', descBase: '' },
    { option: 'What is the most important thing to verify manually before I call this feature done — and how do I check it?', descBase: '' },
  ],
  L3: [
    { option: 'What is one real user scenario I should manually test right now before moving on?', descBase: '' },
  ],
};

/** BEHAVIOUR_TESTING_CASUAL — casual-register variant for cool_geek and pro_geek_soul profiles */
const BEHAVIOUR_TESTING_CASUAL: DecisionContent = {
  question:      'Implementation done — user scenarios tested?',
  pinchFallback: 'User scenario?',
  L1: [
    { option: 'Put yourself in a user\'s shoes and go through what was just built from start to finish — what\'s the main thing it does, does it actually work, and is anything confusing or broken along the way?', descBase: '' },
    { option: 'Think of a few different ways someone might use this feature in real life — the obvious one and a couple of less obvious ones — and actually run through each to see what happens.', descBase: '' },
    { option: 'Think about what could go wrong for a real user in what was just built — try the stuff that automated tests wouldn\'t catch and tell me what you see.', descBase: '' },
  ],
  L2: [
    { option: 'What\'s the simplest way someone would use this feature end to end — walk me through what they do and whether it actually works.', descBase: '' },
    { option: 'Is there anything in what was just built that you haven\'t actually tried yourself yet — and what would "working" look like if you did?', descBase: '' },
  ],
  L3: [
    { option: 'What\'s one specific thing that could break for a real user in this feature that hasn\'t been tried by hand yet?', descBase: '' },
  ],
};

// ── Absence signal content sets ───────────────────────────────────────────────

/** Absence: test_creation — fires when implementation proceeds without writing tests */
const ABSENCE_TEST_CREATION: DecisionContent = {
  question:      'Code added — where are the tests?',
  pinchFallback: 'Tests missing.',
  L1: [
    { option: 'Write tests for what was just built: unit tests for each function added or modified, and at least one integration test that covers the main path through this feature.', descBase: '' },
    { option: 'Identify what was just built that has no test coverage and write tests for the top 3 riskiest parts — the logic most likely to break silently if changed.', descBase: '' },
    { option: 'Review what was just built for testability: is it structured so tests can be written without extensive mocking? Flag any parts that would be hard to test as-is.', descBase: '' },
  ],
  L2: [
    { option: 'Write at least one test for what was just built — the most critical path through this feature.', descBase: '' },
    { option: 'What would break silently in what was just built if a future change introduced a bug? Write a test that catches that.', descBase: '' },
  ],
  L3: [
    { option: 'Write one test for the most important behaviour in what was just built before moving on.', descBase: '' },
  ],
};

/** Absence: regression_check — fires when changes are made without regression testing */
const ABSENCE_REGRESSION_CHECK: DecisionContent = {
  question:      'Changes made — regression verified?',
  pinchFallback: 'Regression check.',
  L1: [
    { option: 'Identify which existing tests cover the code paths changed in what was just built, run them, and flag any regressions — anything that was passing before this session that is now failing.', descBase: '' },
    { option: 'Check what was just built against the existing test suite: identify which existing tests cover the code paths that were modified, run them, and report any failures.', descBase: '' },
    { option: 'Review what was just built for regression risk: what existing functionality could be affected by these changes, and how would you verify it still works correctly?', descBase: '' },
  ],
  L2: [
    { option: 'Run the tests for this project and report which ones fail — specifically any that touch code changed in this session.', descBase: '' },
    { option: 'What existing functionality is most likely to be affected by what was just built? Verify it still works.', descBase: '' },
  ],
  L3: [
    { option: 'Run the existing tests for this project and report whether anything is now failing that wasn\'t before.', descBase: '' },
  ],
};

/** Absence: spec_acceptance_check — fires when implementation proceeds without checking against spec */
const ABSENCE_SPEC_ACCEPTANCE: DecisionContent = {
  question:      'Implementation done — spec checked?',
  pinchFallback: 'Check the spec.',
  L1: [
    { option: 'Review what was just built against the spec and acceptance criteria: go through each requirement and confirm whether it is fully implemented, partially implemented, or missing from what was just built.', descBase: '' },
    { option: 'Cross-confirm what was just built against the original requirements: does the implementation match what was specified? List any deviations, missing behaviour, or scope creep introduced.', descBase: '' },
    { option: 'Audit what was just built for spec compliance: check input validation, edge cases, and error handling against the acceptance criteria — flag anything that passes the happy path but fails under edge conditions.', descBase: '' },
  ],
  L2: [
    { option: 'Check what was just built against the spec: does it fully satisfy the acceptance criteria, or are there gaps?', descBase: '' },
    { option: 'Does what was just built match what was specified? List any differences between the implementation and the original requirements.', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in what was just built that doesn\'t match the spec or acceptance criteria?', descBase: '' },
  ],
};

/** Absence: cross_confirming — fires when implementation proceeds without cross-confirmation prompts */
const ABSENCE_CROSS_CONFIRMING: DecisionContent = {
  question:      'AI generated it — have you verified it?',
  pinchFallback: 'Verify the output.',
  L1: [
    { option: 'Review what was just built critically: identify any hallucinated functions or APIs, logic that looks plausible but is incorrect, edge cases not handled, and any code that was generated but not verified against the actual system it will run in.', descBase: '' },
    { option: 'Cross-confirm what was just built: does the generated code actually do what you expect, or does it contain plausible-sounding logic that is subtly wrong? Trace the main path through the code and verify each step.', descBase: '' },
    { option: 'Audit what was just built for AI generation artifacts: check for made-up function names, incorrect assumptions about the codebase, missing error handling that a human would have caught, and any logic that looks correct but hasn\'t been manually verified.', descBase: '' },
  ],
  L2: [
    { option: 'Review what was just built for correctness: is there anything that looks right at a glance but would fail when actually run or tested?', descBase: '' },
    { option: 'Does what was just built actually do what you think it does? Trace the main execution path and verify the logic is sound.', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in what was just built that was generated but not verified — anything you haven\'t manually checked for correctness?', descBase: '' },
  ],
};

const ABSENCE_SECURITY_CHECK: DecisionContent = {
  question:      'Feature built — security reviewed?',
  pinchFallback: 'Security gap.',
  L1: [
    { option: 'Review what was just built for security vulnerabilities: check authentication and authorization logic, input validation for injection risks (SQL, XSS, command), and any API endpoints for missing rate limiting, improper error responses, or exposed sensitive data.', descBase: '' },
    { option: 'Audit what was just built against OWASP Top 10 exposure: does this feature handle untrusted input safely, authenticate and authorize correctly, and avoid leaking sensitive information in error messages or logs?', descBase: '' },
    { option: 'Cross-confirm what was just built against your threat model: what assets are being protected, what attack surface has this feature introduced, and what is the highest-severity vulnerability an attacker could exploit right now?', descBase: '' },
  ],
  L2: [
    { option: 'Check what was just built for the most critical security gaps: input validation, proper authentication and authorization checks, and sensitive data exposure in responses or logs.', descBase: '' },
    { option: 'What is the biggest security risk introduced by what was just built, and what would be needed to mitigate it before this ships?', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in what was just built that could be exploited — untrusted input not validated, missing auth checks, or sensitive data exposed to callers?', descBase: '' },
  ],
};

const ABSENCE_ERROR_HANDLING: DecisionContent = {
  question:      'Feature built — error paths handled?',
  pinchFallback: 'Error handling.',
  L1: [
    { option: 'Review what was just built for error handling gaps: identify all failure modes (network errors, invalid input, missing dependencies, unexpected state), confirm each is handled explicitly, and flag any that are silently swallowed or produce unhelpful error messages.', descBase: '' },
    { option: 'Audit the failure paths in what was just built: what happens when each external dependency fails, each input is invalid, or each assumption is violated? Is the failure propagated, logged, or recovered from correctly in each case?', descBase: '' },
    { option: 'Cross-confirm what was just built against its error contract: are errors typed and documented, are retries or fallbacks implemented where appropriate, and are error messages safe to expose to callers without leaking internal state?', descBase: '' },
  ],
  L2: [
    { option: 'What failure modes in what was just built are currently unhandled or silently swallowed? Identify and fix the most critical ones.', descBase: '' },
    { option: 'What happens in what was just built when the most likely thing goes wrong — network failure, invalid input, or missing dependency? Verify that case is handled correctly.', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in what was just built that could fail silently or produce an unhelpful error when something unexpected happens?', descBase: '' },
  ],
};

const ABSENCE_DOCUMENTATION: DecisionContent = {
  question:      'Code written — any documentation added?',
  pinchFallback: 'Docs missing.',
  L1: [
    { option: 'Review what was just built for documentation coverage: identify functions, classes, and modules with non-obvious behaviour that lack docstrings or inline comments, and add documentation that explains the why — the constraint, the invariant, the tradeoff — not just the what.', descBase: '' },
    { option: 'Audit what was just built for undocumented assumptions: what design decisions, invariants, or external constraints are embedded in this code that a future maintainer could not infer from reading it? Document those specifically.', descBase: '' },
    { option: 'Check whether what was just built needs README updates, API reference additions, or architecture notes — not just inline comments. What context would someone need to understand this feature without asking the original author?', descBase: '' },
  ],
  L2: [
    { option: 'What parts of what was just built would be hardest for another developer to understand without documentation? Add documentation for those first.', descBase: '' },
    { option: 'Identify the non-obvious decisions in what was just built — the ones a future maintainer might change by mistake — and document the reasoning behind each.', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in what was just built that has non-obvious behaviour or hidden assumptions that are not documented?', descBase: '' },
  ],
};

const ABSENCE_OBSERVABILITY: DecisionContent = {
  question:      'Feature built — how will you know it\'s working?',
  pinchFallback: 'No observability.',
  L1: [
    { option: 'Review what was just built for observability gaps: identify what this feature does in production that is currently invisible — requests, failures, latency, state changes — and add structured logging for the events that would allow you to diagnose a production incident without SSH access.', descBase: '' },
    { option: 'Audit what was just built for monitoring coverage: what SLI would you define for this feature, what metrics would you emit, and what alert condition would page someone if this feature degraded silently in production?', descBase: '' },
    { option: 'Check what was just built for error tracking integration: are failures captured in your error tracking system with enough context — request ID, user ID, stack trace — to diagnose the issue without reproducing it locally?', descBase: '' },
  ],
  L2: [
    { option: 'What events in what was just built are currently invisible in production? Add structured logging for the ones that would be essential to diagnose a failure.', descBase: '' },
    { option: 'If this feature broke silently in production tonight, what would you see in your logs and monitoring to detect it? If the answer is "nothing", what needs to be added?', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in what was just built that could fail silently in production with no log entry or alert to detect it?', descBase: '' },
  ],
};

const ABSENCE_COMPREHENSION: DecisionContent = {
  question:      'AI generated it — do you understand it?',
  pinchFallback: 'Comprehension check.',
  L1: [
    { option: 'Review what was just built for comprehension: trace through the main execution path and explain what each significant function, class, and data structure does — independently, without relying on comments generated alongside the code.', descBase: '' },
    { option: 'Audit your understanding of what was just built: identify any part of the code you could not explain to a colleague without reading it again. For each such part, either gain that understanding now or flag it as a comprehension debt before moving on.', descBase: '' },
    { option: 'Check whether what was just built contains any abstractions, design patterns, or external library usage you accepted without fully understanding — verify what each one does and why it was chosen for this specific context.', descBase: '' },
  ],
  L2: [
    { option: 'Is there any part of what was just built you could not confidently explain to another developer right now? Address that before moving on.', descBase: '' },
    { option: 'Walk through what was just built and identify any code you accepted because it looked correct without actually verifying the logic yourself.', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in what was just built that you haven\'t manually traced through and fully understood?', descBase: '' },
  ],
};

const ABSENCE_REFACTORING: DecisionContent = {
  question:      'Extended implementation — code health reviewed?',
  pinchFallback: 'Refactor check.',
  L1: [
    { option: 'Review what was just built for refactoring opportunities: identify code duplication, functions that do more than one thing, abstractions that have grown inconsistent with their usage, and naming that no longer reflects current behaviour — prioritize by maintenance risk.', descBase: '' },
    { option: 'Audit what was just built for code health: are there patterns that have emerged across this implementation that should be abstracted, any dead code that can be removed, or any modules that have grown beyond their original responsibility?', descBase: '' },
    { option: 'Check what was just built against existing codebase conventions: does it introduce inconsistent patterns, style deviations, or compounding technical debt that would make the next feature harder to add if not addressed now?', descBase: '' },
  ],
  L2: [
    { option: 'What is the most significant refactoring opportunity in what was just built — the thing that if left will make the next feature harder to add?', descBase: '' },
    { option: 'Review what was just built for duplication or inconsistency that should be cleaned up before moving on to the next task.', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in what was just built that should be refactored or cleaned up before moving on?', descBase: '' },
  ],
};

const ABSENCE_NO_PUSHBACK: DecisionContent = {
  question:      'AI suggesting — are you evaluating critically?',
  pinchFallback: 'No pushback.',
  L1: [
    { option: 'Review the recent generated outputs used in what was just built: identify any decisions, implementations, or suggestions you accepted without explicitly verifying the reasoning, checking for alternatives, or questioning the assumptions embedded in the response.', descBase: '' },
    { option: 'Audit your acceptance pattern while building this feature: for each significant AI output, ask whether you evaluated it independently or accepted it because it was confident and plausible. Flag any output where you would struggle to justify the implementation choice to a peer reviewer.', descBase: '' },
    { option: 'Cross-confirm the most recent suggestion used in what was just built: what assumptions were made that were not in your prompt, what alternatives were not considered, and is the approach chosen actually the best fit for this project?', descBase: '' },
  ],
  L2: [
    { option: 'Take the last significant AI output used in what was just built and evaluate it critically: do you agree with the approach, and if so, can you explain why it is better than the alternatives?', descBase: '' },
    { option: 'Is there any AI output used in what was just built that you accepted because it sounded right rather than because you verified it was right?', descBase: '' },
  ],
  L3: [
    { option: 'Is there any AI suggestion used in what was just built that you accepted without questioning the reasoning or checking for better alternatives?', descBase: '' },
  ],
};

const ABSENCE_CORRECTION_SEEKING: DecisionContent = {
  question:      'AI output — self-verification requested?',
  pinchFallback: 'No verification.',
  L1: [
    { option: 'Self-review what was just built: identify any assumptions that may be incorrect, logic that could fail under edge cases, and any parts of the implementation you are not confident about.', descBase: '' },
    { option: 'Argue against your own implementation of what was just built — what would a skeptical senior engineer flag, what alternative approaches were not considered, and what are the weakest parts of this solution?', descBase: '' },
    { option: 'Produce a failure analysis of what was just built: what are the most likely ways this implementation fails in production, what inputs would cause incorrect behaviour, and what would you change if rebuilding this from scratch?', descBase: '' },
  ],
  L2: [
    { option: 'Review what was just built critically — what would you change or flag if reviewing this as a senior engineer rather than as the author?', descBase: '' },
    { option: 'Self-critique what was just built: what are the weakest parts, and what were you least confident about when generating this?', descBase: '' },
  ],
  L3: [
    { option: 'Identify the part of what was just built you are least confident is correct.', descBase: '' },
  ],
};

const ABSENCE_PROBLEM_CORRECTION: DecisionContent = {
  question:      'Bug noticed — explicitly corrected?',
  pinchFallback: 'Bug unresolved.',
  L1: [
    { option: 'Review the outstanding bugs and issues identified in this session: for each one, confirm whether it has been explicitly fixed, explicitly deferred with a tracking note, or left unaddressed. Address any that are unresolved and blocking correctness of what was just built.', descBase: '' },
    { option: 'Audit what was just built for bugs that were noticed but not fixed: identify any error, failure, or incorrect behaviour that was mentioned in this session and is still present in the current implementation.', descBase: '' },
    { option: 'Cross-confirm the current state of what was just built: run the tests, check the known failure cases, and verify that any issue identified earlier in this session has been resolved or explicitly acknowledged as a known limitation.', descBase: '' },
  ],
  L2: [
    { option: 'Is there any bug or issue in what was just built that was noticed earlier in this session but not explicitly fixed? Address it before moving on.', descBase: '' },
    { option: 'Run the tests for what was just built and confirm that any failure identified earlier in this session is now resolved.', descBase: '' },
  ],
  L3: [
    { option: 'Is there any bug in what was just built that was noticed but not explicitly corrected before moving on?', descBase: '' },
  ],
};

const ABSENCE_ALTERNATIVES: DecisionContent = {
  question:      'Decision made — alternatives considered?',
  pinchFallback: 'No alternatives.',
  L1: [
    { option: 'Review the key decisions made in what was just built: name the alternatives that were not chosen, explain the tradeoffs between each approach, and confirm that the chosen solution is the best fit for the constraints of this project — not just the first viable option.', descBase: '' },
    { option: 'Audit the key technical choices made while building this feature: for each significant decision (architecture, library, algorithm, data structure), identify at least one alternative that was not explored and evaluate whether the chosen approach is still the right one given the project\'s constraints.', descBase: '' },
    { option: 'Cross-confirm the approach taken in what was just built: what would a different engineering team have done differently, what are the known weaknesses of the chosen approach, and is there a simpler solution that would meet the requirements with fewer dependencies or moving parts?', descBase: '' },
  ],
  L2: [
    { option: 'What was the most significant technical decision made in what was just built? Name the alternatives that were not explored and confirm the chosen approach is the right tradeoff.', descBase: '' },
    { option: 'Is there any part of what was just built where a different approach would have been simpler, more maintainable, or better suited to the project\'s constraints?', descBase: '' },
  ],
  L3: [
    { option: 'Is there any decision in what was just built that was made without considering alternatives — where the first approach was taken without evaluating other options?', descBase: '' },
  ],
};

const ABSENCE_ARCH_CONFLICT: DecisionContent = {
  question:      'Feature added — architecture consistency checked?',
  pinchFallback: 'Arch conflict.',
  L1: [
    { option: 'Review what was just built for architectural consistency: does this feature follow the same patterns, abstractions, and conventions established in the existing codebase, or does it introduce a parallel approach that will diverge over time and increase maintenance cost?', descBase: '' },
    { option: 'Audit what was just built for architecture conflicts: identify any module boundaries crossed without justification, any shared state accessed in ways inconsistent with the existing data flow, and any new dependencies introduced that conflict with the project\'s existing dependency strategy.', descBase: '' },
    { option: 'Cross-confirm what was just built against the architectural decisions documented for this project: does this feature respect the layering, separation of concerns, and interface contracts that were established? Flag any violations and determine whether they require a refactor or an architecture decision update.', descBase: '' },
  ],
  L2: [
    { option: 'Does what was just built follow the same patterns and conventions as the rest of the codebase, or does it introduce a new approach that conflicts with the existing architecture?', descBase: '' },
    { option: 'Is there anything in what was just built that violates a design decision or architectural convention established earlier in this project?', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in what was just built that doesn\'t fit the patterns or structure of the existing codebase?', descBase: '' },
  ],
};

const ABSENCE_PROMPT_CONTEXT: DecisionContent = {
  question:      'Prompts sent — spec and arch referenced?',
  pinchFallback: 'Missing context.',
  L1: [
    { option: 'Review the prompts used to build this feature: are they grounded in the project\'s spec, architecture decisions, and task breakdown, or are they ad hoc instructions that you are implementing without access to the full planning context? If context is missing, inject it now before the next prompt.', descBase: '' },
    { option: 'Audit the context richness of the prompts used to build this feature: do you have access to the current spec, the established architecture, and the specific acceptance criteria for what was just built, or are you making assumptions that a context-rich prompt would have resolved?', descBase: '' },
    { option: 'Cross-confirm that what was just built is aligned with the project\'s planning artifacts: paste the relevant spec section, architecture diagram, or task definition into the conversation and verify that your implementation matches what was planned.', descBase: '' },
  ],
  L2: [
    { option: 'Do you have the spec and architecture context needed to build this feature correctly, or have you been working from ad hoc instructions? Inject the relevant planning context before continuing.', descBase: '' },
    { option: 'Paste the spec or acceptance criteria for this feature into the conversation and check whether what was just built matches what was planned.', descBase: '' },
  ],
  L3: [
    { option: 'Do you have enough context about the spec and architecture to be building this feature correctly, or are you working without the full picture?', descBase: '' },
  ],
};

const ABSENCE_ROLLBACK_PLANNING: DecisionContent = {
  question:      'Release pending — rollback plan defined?',
  pinchFallback: 'No rollback plan.',
  L1: [
    { option: 'Define the rollback procedure for this feature before shipping: identify the steps to revert if the deployment fails, confirm the rollback can be completed within your acceptable downtime window, and verify that database migrations or data changes are reversible.', descBase: '' },
    { option: 'Audit the rollback readiness of this feature: what happens to data, sessions, and dependent services if this deploy is reverted? Document the rollback steps, assign ownership, and confirm the plan can be executed without live debugging during an incident.', descBase: '' },
    { option: 'Cross-confirm rollback viability for what was just built: if you rolled back this feature in production right now, what would break, what state would be left in an inconsistent state, and what would need to be cleaned up manually? Address any gaps before shipping.', descBase: '' },
  ],
  L2: [
    { option: 'What is the rollback procedure if the deployment of this feature fails? Document it before shipping — it should be executable under pressure without needing to invent steps on the fly.', descBase: '' },
    { option: 'Are there any parts of this feature — database migrations, external API integrations, data format changes — that cannot be cleanly rolled back? Address those before shipping or accept them as known risks.', descBase: '' },
  ],
  L3: [
    { option: 'Is there a documented rollback plan for this feature that could be executed in production under pressure, or would reverting require improvisation?', descBase: '' },
  ],
};

const ABSENCE_DEPLOYMENT_PLANNING: DecisionContent = {
  question:      'Release pending — deployment plan confirmed?',
  pinchFallback: 'No deploy plan.',
  L1: [
    { option: 'Define the deployment plan for this feature before shipping: confirm the target environment configuration, document any environment variables or secrets that need to be provisioned, and verify that the deployment process has been tested outside of production.', descBase: '' },
    { option: 'Audit the deployment readiness of this feature: are there environment-specific configuration differences between staging and production that could cause a failure, any new environment variables required, or any infrastructure changes needed before this can deploy cleanly?', descBase: '' },
    { option: 'Cross-confirm deployment readiness for this feature: what does the production environment need to have in place before this deploys successfully — configuration, secrets, database state, external service integrations — and is each of those confirmed and ready?', descBase: '' },
  ],
  L2: [
    { option: 'What environment configuration does this feature require in production that is not yet confirmed — secrets, environment variables, infrastructure dependencies? Resolve each before shipping.', descBase: '' },
    { option: 'Has this feature been deployed to a staging environment that mirrors production? If not, what deployment risks are you accepting by shipping without a staging verification?', descBase: '' },
  ],
  L3: [
    { option: 'Is there a confirmed deployment plan for this feature, or is the deployment process still undefined and untested outside of development?', descBase: '' },
  ],
};

const ABSENCE_DEPENDENCY_MGMT: DecisionContent = {
  question:      'Dependencies added — conflicts and risks reviewed?',
  pinchFallback: 'Dependency risk.',
  L1: [
    { option: 'Review the new dependencies introduced in what was just built: check for version conflicts with existing packages, known security vulnerabilities in the chosen version, and whether a more stable or widely-adopted alternative exists for the same purpose.', descBase: '' },
    { option: 'Audit the packages added in what was just built for dependency health: are the chosen versions the latest stable releases, do any have known CVEs in the installed version, and are the licences compatible with this project\'s licence requirements?', descBase: '' },
    { option: 'Cross-confirm the dependency decisions made in what was just built: for each new package, verify it is actively maintained, has adequate documentation, does not introduce transitive dependencies that conflict with the existing dependency tree, and is not a single-maintainer package with no succession plan.', descBase: '' },
  ],
  L2: [
    { option: 'Check the new packages added in what was just built for version conflicts and known vulnerabilities — run a dependency audit and confirm there are no high-severity issues before shipping.', descBase: '' },
    { option: 'Is there any package added in what was just built that is unmaintained, has an incompatible licence, or pulls in a transitive dependency that conflicts with what is already installed?', descBase: '' },
  ],
  L3: [
    { option: 'Have the new packages added in what was just built been checked for version conflicts, known security vulnerabilities, and licence compatibility?', descBase: '' },
  ],
};

const ABSENCE_PHASE_TRANSITION: DecisionContent = {
  question:      'Extended phase — transition readiness assessed?',
  pinchFallback: 'Phase check.',
  L1: [
    { option: 'Assess transition readiness for this project: define what must be complete before moving to the next phase, confirm which of those criteria are currently met, and identify what is blocking the transition. If no criteria are defined, define them now.', descBase: '' },
    { option: 'Review the current phase of this project against its original definition: have the objectives for this phase been met, what work is still in progress, and is there a clear handoff point that marks the end of this phase and the beginning of the next?', descBase: '' },
    { option: 'Cross-confirm phase completion for this project: what artifacts, decisions, or quality gates were supposed to be produced in this phase, which are complete, which are missing, and what would need to be done to be confident that proceeding to the next phase is the right call?', descBase: '' },
  ],
  L2: [
    { option: 'What are the exit criteria for the current phase of this project? Assess which are met and which are not before committing to the next phase.', descBase: '' },
    { option: 'Is there any unfinished work from the current phase of this project that should be resolved before transitioning — decisions deferred, quality gates not cleared, or artifacts not produced?', descBase: '' },
  ],
  L3: [
    { option: 'What needs to be true for this project to be ready to move to the next phase, and is any of that currently incomplete or unresolved?', descBase: '' },
  ],
};

const ABSENCE_SPEC_CROSS_CONFIRM: DecisionContent = {
  question:      'Spec written — cross-confirmed against requirements?',
  pinchFallback: 'Spec not confirmed.',
  L1: [
    { option: 'Cross-confirm this project\'s spec against its source requirements: for each requirement in the spec, verify it traces back to a stated user need or stakeholder decision, covers the acceptance criteria completely, and does not contain assumptions that were not explicitly agreed upon.', descBase: '' },
    { option: 'Audit this project\'s spec for internal consistency and completeness: identify any requirements that contradict each other, any acceptance criteria that are ambiguous or untestable, and any scope decisions that were made without explicit stakeholder sign-off.', descBase: '' },
    { option: 'Review this project\'s spec against what is actually feasible given the current technical constraints: flag any requirements that have no clear implementation path, any acceptance criteria that would require capabilities not available in the current stack, and any decisions that have been implicitly made but not documented.', descBase: '' },
  ],
  L2: [
    { option: 'Go through this project\'s spec and identify any requirement that cannot be directly traced to a stated user need or a documented stakeholder decision — those are assumptions that need to be confirmed before implementation begins.', descBase: '' },
    { option: 'Is there anything in this project\'s spec that is ambiguous enough that two developers could implement it differently and both be technically correct? Resolve those ambiguities before building.', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in this project\'s spec that has not been verified against the original requirements — any assumption, scope decision, or acceptance criterion that was added without explicit confirmation?', descBase: '' },
  ],
};

const ABSENCE_SPEC_REVISION: DecisionContent = {
  question:      'Spec drafted — revised since initial version?',
  pinchFallback: 'Spec unrevised.',
  L1: [
    { option: 'Revise this project\'s spec to reflect what has been learned since the initial draft: update any requirements that turned out to be more or less complex than anticipated, add acceptance criteria for edge cases discovered during implementation, and remove or defer any scope that has been implicitly dropped.', descBase: '' },
    { option: 'Audit this project\'s spec for drift: compare the current implementation against the spec and identify where the two have diverged — either the spec is outdated and the implementation is correct, or the implementation has deviated from the spec and needs to be corrected. Resolve each divergence explicitly.', descBase: '' },
    { option: 'Review this project\'s spec against the current state of the project: what decisions have been made during implementation that are not reflected in the spec, what requirements have been reinterpreted or changed in practice, and what new constraints or dependencies have emerged that the spec does not document?', descBase: '' },
  ],
  L2: [
    { option: 'Compare the current implementation against this project\'s spec and flag every place they diverge — then decide for each divergence whether the spec needs to be updated or the implementation needs to change.', descBase: '' },
    { option: 'Is there anything in this project\'s spec that was written before implementation started and no longer reflects the current technical decisions or scope? Update it now so the spec is a true record of what is being built.', descBase: '' },
  ],
  L3: [
    { option: 'Does this project\'s spec still accurately reflect what is being built, or has the implementation diverged from the original spec without the spec being updated?', descBase: '' },
  ],
};

/** ABSENCE_TEST_CREATION_CASUAL — casual-register variant for pro_geek_soul and null profiles */
const ABSENCE_TEST_CREATION_CASUAL: DecisionContent = {
  question:      'Built something — any tests written yet?',
  pinchFallback: 'Tests missing.',
  L1: [
    { option: 'Write tests for what was just built — unit tests for anything new or changed, and one test that runs the main flow. What\'s the most likely thing that could break?', descBase: '' },
    { option: 'What\'s the riskiest part of what was just built that has no test? Write one test for that first, then keep going.', descBase: '' },
    { option: 'Is what was just built easy to test as-is, or does it need a small refactor to make testing feasible? Share what you find.', descBase: '' },
  ],
  L2: [
    { option: 'Write at least one test for what was just built — something that would catch it breaking silently.', descBase: '' },
    { option: 'What\'s the most likely thing to break silently in what was just built? Write a test for that.', descBase: '' },
  ],
  L3: [
    { option: 'Write one test for the most important behaviour in what was just built before moving on.', descBase: '' },
  ],
};

/** ABSENCE_REGRESSION_CHECK_CASUAL — casual-register variant for pro_geek_soul and null profiles */
const ABSENCE_REGRESSION_CHECK_CASUAL: DecisionContent = {
  question:      'Changed something — did anything break?',
  pinchFallback: 'Regression check.',
  L1: [
    { option: 'Run the tests for this project and check — did what was just built break anything that was working before? Report what\'s failing and why.', descBase: '' },
    { option: 'What existing code is most likely affected by what was just built? Run those tests and tell me if anything broke.', descBase: '' },
    { option: 'Look at what was just built — what could it accidentally break in what was already working? Verify those paths still work.', descBase: '' },
  ],
  L2: [
    { option: 'Run the test suite and flag anything that\'s now failing that wasn\'t before — especially anything near what was just built.', descBase: '' },
    { option: 'What existing functionality is most likely affected by what was just built? Give it a quick check.', descBase: '' },
  ],
  L3: [
    { option: 'Run the tests and tell me if anything broke after what was just built was added.', descBase: '' },
  ],
};

/** ABSENCE_SPEC_ACCEPTANCE_CASUAL — casual-register variant for pro_geek_soul and null profiles */
const ABSENCE_SPEC_ACCEPTANCE_CASUAL: DecisionContent = {
  question:      'Built something — does it match what was planned?',
  pinchFallback: 'Check the spec.',
  L1: [
    { option: 'Check what was just built against the original plan — does it actually do what it was supposed to? List anything that\'s off, missing, or different from what was asked for.', descBase: '' },
    { option: 'Compare what was just built to what was specified — any gaps, extra bits that weren\'t asked for, or things that work differently than planned?', descBase: '' },
    { option: 'Does what was just built handle the edge cases from the spec, or just the happy path? Flag anything that would fail on a non-standard input.', descBase: '' },
  ],
  L2: [
    { option: 'Does what was just built match what was planned? Flag anything that\'s different or missing.', descBase: '' },
    { option: 'What\'s the biggest gap between what was just built and what the spec asked for?', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in what was just built that doesn\'t match what was originally planned or specified?', descBase: '' },
  ],
};

/** ABSENCE_CROSS_CONFIRMING_CASUAL — casual-register variant for pro_geek_soul and null profiles */
const ABSENCE_CROSS_CONFIRMING_CASUAL: DecisionContent = {
  question:      'AI wrote it — have you actually checked it?',
  pinchFallback: 'Verify the output.',
  L1: [
    { option: 'Take a real look at what was just built — not just \'does it look right\', but does it actually work correctly? Check for made-up functions, wrong assumptions, or logic that sounds good but doesn\'t hold up.', descBase: '' },
    { option: 'Walk through what was just built and check each part — is there anything that looks right but is subtly off, handles the wrong case, or references something that doesn\'t exist?', descBase: '' },
    { option: 'Check what was just built for the classic AI mistakes — hallucinated APIs, edge cases silently skipped, or missing error handling. Flag anything you haven\'t manually verified.', descBase: '' },
  ],
  L2: [
    { option: 'Is there anything in what was just built that you accepted without actually checking if it works correctly?', descBase: '' },
    { option: 'Walk through the main logic in what was just built — does it actually do what you expect, or just look like it does?', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in what was just built that was generated but you haven\'t checked for correctness yet?', descBase: '' },
  ],
};

const ABSENCE_SECURITY_CHECK_CASUAL: DecisionContent = {
  question:      'Built something — any security checks done?',
  pinchFallback: 'Security gap.',
  L1: [
    { option: 'Look at what was just built — is there anything that handles user input or touches auth that hasn\'t been checked for obvious security problems? What could an attacker do with this as it stands?', descBase: '' },
    { option: 'Check what was just built for the easy wins an attacker would go for first — bad input handling, missing permission checks, or anything that leaks data it shouldn\'t.', descBase: '' },
    { option: 'Walk through what was just built as if you\'re trying to break it — what\'s the first thing you\'d try? Flag anything that looks like it could be abused.', descBase: '' },
  ],
  L2: [
    { option: 'What\'s the biggest security risk in what was just built? Flag it and explain what needs to change.', descBase: '' },
    { option: 'Is there anything in what was just built that handles user input or auth that hasn\'t been properly validated or checked?', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in what was just built that could be exploited — untrusted input, missing auth, or data that shouldn\'t be exposed?', descBase: '' },
  ],
};

const ABSENCE_ERROR_HANDLING_CASUAL: DecisionContent = {
  question:      'Feature built — what happens when it breaks?',
  pinchFallback: 'Error handling.',
  L1: [
    { option: 'Look at what was just built — what happens when something goes wrong? Check for unhandled errors, anything that fails silently, and cases where the error message would tell an attacker more than the user needs to know.', descBase: '' },
    { option: 'Walk through the unhappy paths in what was just built — what happens when a network call fails, the input is weird, or a dependency isn\'t available? Are those cases handled, or does it just crash?', descBase: '' },
    { option: 'Think about what was just built from the angle of things going wrong — what\'s the most likely failure, and what does the user or caller see when it happens? Is that the right behaviour?', descBase: '' },
  ],
  L2: [
    { option: 'What\'s the most likely thing to fail in what was just built, and what happens when it does? Fix it if it\'s not handled.', descBase: '' },
    { option: 'Is there anything in what was just built that could fail without producing a useful error message or recovering gracefully?', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in what was just built that fails silently or doesn\'t handle the obvious error cases?', descBase: '' },
  ],
};

const ABSENCE_DOCUMENTATION_CASUAL: DecisionContent = {
  question:      'Code written — is anything documented?',
  pinchFallback: 'Docs missing.',
  L1: [
    { option: 'Look at what was just built — what parts would confuse someone reading it for the first time? Add short comments explaining the why, not just the what, for anything that isn\'t obvious from the code itself.', descBase: '' },
    { option: 'Check what was just built for undocumented decisions — things that would make a future developer go "why did they do it this way?" Write a quick note for each before the context is forgotten.', descBase: '' },
    { option: 'Does anything in what was just built need a README update or a note in the docs? What would someone need to know to use or maintain this feature without asking you directly?', descBase: '' },
  ],
  L2: [
    { option: 'What\'s the most confusing part of what was just built for someone who didn\'t write it? Add a comment or doc for that.', descBase: '' },
    { option: 'Are there any decisions in what was just built that future-you would wonder about in six months? Document them now.', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in what was just built that needs a comment or note to explain why it works the way it does?', descBase: '' },
  ],
};

const ABSENCE_OBSERVABILITY_CASUAL: DecisionContent = {
  question:      'Feature built — will you know when it breaks?',
  pinchFallback: 'No observability.',
  L1: [
    { option: 'Look at what was just built — if it breaks in production tonight, what would you see in your logs? If the answer is "not much", add logging for the key events: requests coming in, failures happening, anything that changed state.', descBase: '' },
    { option: 'Check what was just built for blind spots in production — what does it do that you currently can\'t see? Add logging or metrics for the things you\'d want to know about when something goes wrong.', descBase: '' },
    { option: 'What\'s the first thing you\'d check if what was just built stopped working in production? Is that thing actually observable right now, or would you be flying blind?', descBase: '' },
  ],
  L2: [
    { option: 'What would you see in your logs if what was just built failed in production right now? If not much, add logging for the key failure points.', descBase: '' },
    { option: 'Is there anything in what was just built that could break silently in production without triggering an alert or showing up in logs?', descBase: '' },
  ],
  L3: [
    { option: 'If what was just built broke in production, would you be able to detect it from logs or monitoring? What\'s missing?', descBase: '' },
  ],
};

const ABSENCE_COMPREHENSION_CASUAL: DecisionContent = {
  question:      'AI wrote it — do you actually get it?',
  pinchFallback: 'Comprehension check.',
  L1: [
    { option: 'Look at what was just built — is there any part you couldn\'t explain to someone else right now? Find the bit you\'re least confident about and trace through it until you actually understand what it does.', descBase: '' },
    { option: 'Walk through what was just built and spot the parts you accepted because they looked right, not because you verified them. Pick the riskiest one and make sure you understand it properly.', descBase: '' },
    { option: 'Is there anything in what was just built that uses a library or approach you haven\'t used before? Make sure you understand what it does — not just that it works — before moving on.', descBase: '' },
  ],
  L2: [
    { option: 'What\'s the part of what was just built you\'re least confident you understand? Trace through it and make sure you get it.', descBase: '' },
    { option: 'Is there anything in what was just built you accepted without really checking the logic? Flag it and go back through it.', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in what was just built that you haven\'t fully understood and verified yourself?', descBase: '' },
  ],
};

const ABSENCE_REFACTORING_CASUAL: DecisionContent = {
  question:      'Long build run — anything to clean up?',
  pinchFallback: 'Refactor check.',
  L1: [
    { option: 'Look at what was just built as a whole — is there anything that\'s gotten messy, duplicated, or harder to read than it needs to be? Flag the bits that would slow down the next person who touches this.', descBase: '' },
    { option: 'Walk through what was just built and find the thing you\'d be embarrassed to show in a code review — the copy-pasted section, the function that does too much, the name that doesn\'t mean what it says anymore. Flag it and address it.', descBase: '' },
    { option: 'Check if what was just built fits cleanly with the rest of the codebase or if it\'s starting to diverge in style or structure. Flag anything that would make future changes harder than they need to be.', descBase: '' },
  ],
  L2: [
    { option: 'What\'s the messiest part of what was just built? Is it worth cleaning up now before it compounds?', descBase: '' },
    { option: 'Is there anything in what was just built that\'s duplicated, overly complex, or inconsistent with the rest of the codebase?', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in what was just built that should be cleaned up or simplified before moving on?', descBase: '' },
  ],
};

const ABSENCE_NO_PUSHBACK_CASUAL: DecisionContent = {
  question:      'AI keeps suggesting — are you actually evaluating?',
  pinchFallback: 'No pushback.',
  L1: [
    { option: 'Look at the recent responses that produced what was just built — is there anything you accepted without really thinking about whether it was the right call? Pick the one you\'re least sure about and push back on it now.', descBase: '' },
    { option: 'Check how you\'ve been accepting AI suggestions for this feature — have you been approving them because they look reasonable, or because you\'ve actually thought through the alternatives? Flag the ones where you\'re not sure.', descBase: '' },
    { option: 'Take the most recent AI suggestion used in what was just built and challenge it: what assumptions did it make, what did it not consider, and is this actually the best way to do it for this project?', descBase: '' },
  ],
  L2: [
    { option: 'What\'s the last AI output used in what was just built that you accepted without questioning it? Push back on it now and see if it holds up.', descBase: '' },
    { option: 'Is there anything in what was just built where you accepted a recent suggestion because it sounded confident, not because you verified it yourself?', descBase: '' },
  ],
  L3: [
    { option: 'Is there any AI suggestion used in what was just built that you accepted without actually evaluating whether it was the right approach?', descBase: '' },
  ],
};

const ABSENCE_CORRECTION_SEEKING_CASUAL: DecisionContent = {
  question:      'Has the AI checked its own work?',
  pinchFallback: 'No verification.',
  L1: [
    { option: 'Take a second look at what was just built — not to explain it, but to actually critique it. What would you do differently, what assumptions did you make that might be wrong, and what are the riskiest parts?', descBase: '' },
    { option: 'Argue against your own output for what was just built: what\'s the case against this approach, what did you not consider, and what\'s the part you\'re least confident about?', descBase: '' },
    { option: 'If you had to find a bug or a flaw in what was just built, what would it be? Don\'t let yourself off the hook with "it looks fine."', descBase: '' },
  ],
  L2: [
    { option: 'Review what was just built as if you hadn\'t written it — what would you flag or change?', descBase: '' },
    { option: 'Identify the weakest part of what was just built and explain what you\'re not sure about.', descBase: '' },
  ],
  L3: [
    { option: 'Identify the part of what was just built you\'re least confident is correct.', descBase: '' },
  ],
};

const ABSENCE_PROBLEM_CORRECTION_CASUAL: DecisionContent = {
  question:      'Spotted a bug — did it actually get fixed?',
  pinchFallback: 'Bug unresolved.',
  L1: [
    { option: 'Go through what was just built and check: is there anything that was flagged as broken or wrong earlier in this session that hasn\'t actually been fixed yet? Don\'t let it get buried under new code.', descBase: '' },
    { option: 'Look at the known issues in what was just built — anything that came up as a bug or a problem in this session. Is each one fixed, or just acknowledged and skipped over?', descBase: '' },
    { option: 'Run the tests for what was just built and check if any of the failures match issues that were mentioned earlier in this session. If yes, fix them before adding anything new.', descBase: '' },
  ],
  L2: [
    { option: 'Is there anything in what was just built that was identified as broken or wrong earlier in this session but hasn\'t been fixed yet?', descBase: '' },
    { option: 'Run the tests for what was just built and check — are any of the failures from issues that were already noticed earlier and not resolved?', descBase: '' },
  ],
  L3: [
    { option: 'Is there any bug in what was just built that was noticed earlier in this session but not explicitly fixed?', descBase: '' },
  ],
};

const ABSENCE_ALTERNATIVES_CASUAL: DecisionContent = {
  question:      'Decision made — any alternatives looked at?',
  pinchFallback: 'No alternatives.',
  L1: [
    { option: 'Look at the biggest decision made in what was just built — is it the right call, or just the first thing that came to mind? Name one or two other ways it could have been done and explain why this approach beats them.', descBase: '' },
    { option: 'Check the key choices made while building this feature: is there anything where you went with the first option without stopping to think if there was a better or simpler way? Flag those and evaluate them now.', descBase: '' },
    { option: 'Think about what was just built from the angle of a different developer on a different stack — what would they have done differently, and is the current approach actually the best fit for this project?', descBase: '' },
  ],
  L2: [
    { option: 'What\'s the most important technical choice in what was just built? Name the alternatives you didn\'t go with and confirm this is still the right call.', descBase: '' },
    { option: 'Is there anything in what was just built where a simpler or different approach would have worked just as well — or better?', descBase: '' },
  ],
  L3: [
    { option: 'Is there any decision in what was just built that was made without really looking at other options first?', descBase: '' },
  ],
};

const ABSENCE_ARCH_CONFLICT_CASUAL: DecisionContent = {
  question:      'Feature added — does it fit the codebase?',
  pinchFallback: 'Arch conflict.',
  L1: [
    { option: 'Look at what was just built and check if it fits with the rest of the codebase — does it follow the same patterns, or does it do things in a new way that the rest of the project doesn\'t? Flag anything that would make a future developer say "why is this one different?"', descBase: '' },
    { option: 'Check what was just built for places where it crosses boundaries it probably shouldn\'t, pulls in data in a way the rest of the codebase doesn\'t, or introduces a new pattern without a clear reason. Is it consistent, or is it starting to diverge?', descBase: '' },
    { option: 'Compare what was just built to how the same kind of thing is done elsewhere in the project — same approach, or something different? If different, is there a good reason for it, or did it just happen that way?', descBase: '' },
  ],
  L2: [
    { option: 'Does what was just built follow the same patterns as the rest of the codebase, or does it introduce something new that might conflict with what\'s already there?', descBase: '' },
    { option: 'Is there anything in what was just built that doesn\'t fit with the way the rest of the project is structured?', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in what was just built that doesn\'t match the patterns or structure of the existing codebase?', descBase: '' },
  ],
};

const ABSENCE_PROMPT_CONTEXT_CASUAL: DecisionContent = {
  question:      'Sending prompts — have you shared the spec?',
  pinchFallback: 'Missing context.',
  L1: [
    { option: 'Check the prompts used to build this feature — do you actually know what the spec says, what the architecture looks like, and what the task is supposed to achieve? If you\'ve just been getting ad hoc instructions, paste the relevant context in now so you\'re building the right thing.', descBase: '' },
    { option: 'Have you been working with the full picture, or just the last thing asked of you? If there\'s a spec, an architecture doc, or a task breakdown you haven\'t seen, let me know — then check that what was just built matches up once you have the full context.', descBase: '' },
    { option: 'Paste the relevant spec or task definition into the conversation and confirm that what was just built actually does what it\'s supposed to. If there\'s a mismatch, now is a better time to find it than after shipping.', descBase: '' },
  ],
  L2: [
    { option: 'Do you have enough context to build this feature correctly — have you seen the spec, the architecture, or the task breakdown? If not, share the relevant bits now.', descBase: '' },
    { option: 'Paste the spec or the definition of done for this feature into the conversation and check whether what was just built actually matches it.', descBase: '' },
  ],
  L3: [
    { option: 'Do you know what the spec says for this feature, or have you been building without seeing it?', descBase: '' },
  ],
};

const ABSENCE_ROLLBACK_PLANNING_CASUAL: DecisionContent = {
  question:      'Shipping soon — what\'s the rollback plan?',
  pinchFallback: 'No rollback plan.',
  L1: [
    { option: 'Before you ship this feature, work out what you\'d do if the deployment goes wrong — what\'s the rollback plan, how long would it take, and is there anything in this feature that can\'t be undone cleanly?', descBase: '' },
    { option: 'Walk through what would happen if you had to roll back this feature in production tonight — what steps would you follow, what could go wrong during the rollback, and is there anything left in an inconsistent state if you do?', descBase: '' },
    { option: 'Check the rollback risk in this feature — any database migrations, external integrations, or data changes that would be a pain to undo? Flag those before shipping and decide if you\'re okay with them.', descBase: '' },
  ],
  L2: [
    { option: 'What\'s the rollback plan for this feature if the deployment goes sideways? Write it down — it should be something you could follow in a panic without thinking.', descBase: '' },
    { option: 'Is there anything in this feature that can\'t be rolled back cleanly? Know that before you ship.', descBase: '' },
  ],
  L3: [
    { option: 'Do you have a plan for rolling back this feature if the deployment fails, or would you be making it up as you go?', descBase: '' },
  ],
};

const ABSENCE_DEPLOYMENT_PLANNING_CASUAL: DecisionContent = {
  question:      'Shipping soon — is the deployment actually planned?',
  pinchFallback: 'No deploy plan.',
  L1: [
    { option: 'Before shipping this feature, check: do you actually have a deployment plan? What environment config does it need, what secrets need to be in place, and has anything been tested outside your local setup?', descBase: '' },
    { option: 'Walk through how this feature is actually going to get deployed — what\'s the process, what needs to be configured in the production environment, and is there anything that only exists in your local config that hasn\'t been provisioned yet?', descBase: '' },
    { option: 'Check the gap between where this feature runs now and what production actually needs — are there environment variables, secrets, or infrastructure pieces that aren\'t set up yet? Sort those out before shipping.', descBase: '' },
  ],
  L2: [
    { option: 'What does the production environment need to have in place before this feature can deploy cleanly? Confirm each of those is actually ready.', descBase: '' },
    { option: 'Has this feature been tested anywhere other than your local machine? If it goes straight to production, what are you not sure about?', descBase: '' },
  ],
  L3: [
    { option: 'Is there a deployment plan for this feature, or are you planning to figure it out when you push?', descBase: '' },
  ],
};

const ABSENCE_DEPENDENCY_MGMT_CASUAL: DecisionContent = {
  question:      'Added packages — any issues checked?',
  pinchFallback: 'Dependency risk.',
  L1: [
    { option: 'Check the packages added in what was just built — do they conflict with anything already installed, is there a security issue with the version you picked, and is there a better or more popular alternative you didn\'t consider?', descBase: '' },
    { option: 'Look at the new dependencies in what was just built: are they actively maintained, is the version you\'re using the latest stable one, and do they pull in anything that clashes with what\'s already in the project?', descBase: '' },
    { option: 'Run a quick audit on the packages added in what was just built — any known CVEs in the version you\'re using, licence issues that could cause problems, or extra packages they pull in that don\'t play nice with what\'s already there?', descBase: '' },
  ],
  L2: [
    { option: 'Have the packages added in what was just built been checked for conflicts and vulnerabilities? Run a dependency audit and flag anything suspicious.', descBase: '' },
    { option: 'Is there any package added in what was just built that looks risky — old version, no maintenance, licence mismatch, or something that clashes with existing dependencies?', descBase: '' },
  ],
  L3: [
    { option: 'Have the new packages added in what was just built been checked for conflicts, vulnerabilities, or licence issues?', descBase: '' },
  ],
};

const ABSENCE_PHASE_TRANSITION_CASUAL: DecisionContent = {
  question:      'Been in this phase a while — what comes next?',
  pinchFallback: 'Phase check.',
  L1: [
    { option: 'Step back from this project and think about where you are in the overall flow — have you actually finished this phase, or have you just been in it for a while? What needs to be done before it makes sense to move on?', descBase: '' },
    { option: 'Look at what you set out to accomplish in this phase of this project — is it done, partially done, or have you moved past it without properly closing it off? Figure out where you actually are before starting something new.', descBase: '' },
    { option: 'Check what you set out to finish before moving on from this phase of this project — what\'s actually done, what\'s been skipped or deferred? Make a call on whether you\'re ready to transition.', descBase: '' },
  ],
  L2: [
    { option: 'Is there anything left unfinished in the current phase of this project that should be sorted before you move on to the next one?', descBase: '' },
    { option: 'What\'s the next phase for this project, and what needs to be in place before you can properly start it? Are those things ready?', descBase: '' },
  ],
  L3: [
    { option: 'Is this project actually ready to move to the next phase, or has it just been in the current phase for a long time without a clear exit point?', descBase: '' },
  ],
};

const ABSENCE_SPEC_CROSS_CONFIRM_CASUAL: DecisionContent = {
  question:      'Spec exists — has it been checked against the plan?',
  pinchFallback: 'Spec not confirmed.',
  L1: [
    { option: 'Go through this project\'s spec and check it against the original plan — does every requirement actually come from something that was agreed on, or did some assumptions sneak in that no one has explicitly signed off on?', descBase: '' },
    { option: 'Look at this project\'s spec for anything that\'s vague enough to be interpreted two different ways — anything that could lead to building the wrong thing and still technically meeting the spec. Fix those before coding starts.', descBase: '' },
    { option: 'Check this project\'s spec against what you can actually build with the current stack — is there anything in there that\'s going to hit a wall when someone tries to implement it? Flag those now.', descBase: '' },
  ],
  L2: [
    { option: 'Is there any part of this project\'s spec that came from an assumption rather than something explicitly agreed on? Track those down and confirm them.', descBase: '' },
    { option: 'Is there anything in this project\'s spec vague enough that two people could implement it differently? Clarify it now before it causes a disagreement mid-build.', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in this project\'s spec that hasn\'t been verified against what was actually agreed on — any assumptions that are being treated as confirmed requirements?', descBase: '' },
  ],
};

const ABSENCE_SPEC_REVISION_CASUAL: DecisionContent = {
  question:      'Spec written — has it been updated since the first draft?',
  pinchFallback: 'Spec unrevised.',
  L1: [
    { option: 'Update this project\'s spec to match what you know now — any requirements that turned out harder or simpler than expected, any edge cases that came up during building, and any things that got quietly dropped or changed in scope.', descBase: '' },
    { option: 'Check whether this project\'s spec still matches what\'s actually being built — where have things changed since the first draft, what decisions got made during implementation that aren\'t written down, and what would a new developer get wrong by reading the original spec?', descBase: '' },
    { option: 'Look at where this project\'s spec and the actual implementation have drifted apart — for each gap, is it that the spec needs updating, or that the implementation went in the wrong direction?', descBase: '' },
  ],
  L2: [
    { option: 'Is this project\'s spec still accurate, or has the implementation moved on from what was originally written? Update the parts that no longer match.', descBase: '' },
    { option: 'What\'s changed in this project since the spec was first written that isn\'t reflected in the spec yet? Update it now while the context is still fresh.', descBase: '' },
  ],
  L3: [
    { option: 'Does this project\'s spec still reflect what\'s actually being built, or has the implementation moved on without the spec being updated?', descBase: '' },
  ],
};

// ── Sub-4 — idea / task_breakdown / feedback_loop ─────────────────────────────

// Group A — idea signals

const ABSENCE_IDEA_SCOPING: DecisionContent = {
  question:      'Idea in mind — is the scope defined?',
  pinchFallback: 'Scope undefined.',
  L1: [
    { option: 'Define the scope of this project precisely: what is the core problem it solves, what are the primary capabilities it must deliver, and what does a complete first version look like?', descBase: '' },
    { option: 'Write a scope statement for this project: describe the problem in one sentence, the solution in one paragraph, and draw an explicit boundary around what is and is not included in the initial version.', descBase: '' },
    { option: 'Cross-confirm the project scope: summarize in your own words what this project is, what problem it solves, and what \'built\' means for this project — then flag what is still ambiguous or undefined.', descBase: '' },
  ],
  L2: [
    { option: 'Summarize the scope of this project in three sentences: the problem, the core solution, and the boundary of the first version.', descBase: '' },
    { option: 'What is the single most important thing to define about this project before building starts? Articulate it precisely.', descBase: '' },
  ],
  L3: [
    { option: 'What is this project, what problem does it solve, and what will the first version include?', descBase: '' },
  ],
};

const ABSENCE_IDEA_SCOPING_CASUAL: DecisionContent = {
  question:      'Idea forming — what exactly are we building?',
  pinchFallback: 'Scope unclear.',
  L1: [
    { option: 'Walk me through this project — what\'s the main idea, what problem does it solve, and what\'s in vs out for the first version?', descBase: '' },
    { option: 'What exactly are we building here? Describe this project in your own words — what it does, why it exists, and where the line is on what\'s included first.', descBase: '' },
    { option: 'Summarize this project back to me in your own words — what it does, what problem it solves, and what \'done\' looks like. Flag anything that still feels fuzzy.', descBase: '' },
  ],
  L2: [
    { option: 'What\'s this project and what\'s it supposed to do for the first version? Give me the short version.', descBase: '' },
    { option: 'What\'s the most important thing to pin down about this project before we start building?', descBase: '' },
  ],
  L3: [
    { option: 'What is this project and what will it do?', descBase: '' },
  ],
};

const ABSENCE_IDEA_CONSTRAINT_CHECK: DecisionContent = {
  question:      'Idea scoped — are the non-goals defined?',
  pinchFallback: 'Non-goals missing.',
  L1: [
    { option: 'Define the constraints and non-goals for this project: what is explicitly out of scope for the first version, what functionality will not be built, and what technical constraints limit the solution space?', descBase: '' },
    { option: 'Identify the boundary conditions of this project: what adjacent problems will not be solved, what user requests will be deferred, and what are the explicit constraints on scope, technology, or resources?', descBase: '' },
    { option: 'Write the non-goals section for this project: list at least three things this project will not do, at least one technical constraint, and at least one explicit decision to defer for a future version.', descBase: '' },
  ],
  L2: [
    { option: 'What are the top three things this project will not do in the first version? Document them explicitly so they do not creep in during implementation.', descBase: '' },
    { option: 'What is the clearest out-of-scope decision for this project? State it as an explicit non-goal.', descBase: '' },
  ],
  L3: [
    { option: 'What is one thing this project will not do, and why is that boundary important to state now?', descBase: '' },
  ],
};

const ABSENCE_IDEA_CONSTRAINT_CHECK_CASUAL: DecisionContent = {
  question:      'Idea forming — what\'s out of scope?',
  pinchFallback: 'No non-goals set.',
  L1: [
    { option: 'What are we NOT building in the first version of this project? Walk me through what\'s intentionally out of scope — things that could be asked for but we\'re not doing yet.', descBase: '' },
    { option: 'What are the constraints on this project? What won\'t it do, what can\'t it do, and what have we decided to skip for now?', descBase: '' },
    { option: 'List the things this project will not do — at least three things that could be asked for but are deliberately left out. Then tell me which one is most likely to cause confusion if it\'s not stated clearly.', descBase: '' },
  ],
  L2: [
    { option: 'What\'s one thing this project won\'t do — something someone might expect it to do but we\'re leaving out? State it clearly.', descBase: '' },
    { option: 'What are we keeping out of this project on purpose? Give me the short list.', descBase: '' },
  ],
  L3: [
    { option: 'Name one thing this project will not do that should be stated clearly before we start building.', descBase: '' },
  ],
};

const ABSENCE_IDEA_USER_DEFINITION: DecisionContent = {
  question:      'Idea scoped — is the target user defined?',
  pinchFallback: 'Target user undefined.',
  L1: [
    { option: 'Define the target user for this project precisely: who is the primary user, what is their context and skill level, what problem do they have that this project solves, and what does success look like from their perspective?', descBase: '' },
    { option: 'Write a target user profile for this project: describe who will use it, what they are trying to accomplish, what they already know and do not know, and how this project fits into their workflow.', descBase: '' },
    { option: 'Cross-confirm the target user definition for this project: given what has been described, who is this project for, who is explicitly not the target user, and what does that boundary imply for the feature set?', descBase: '' },
  ],
  L2: [
    { option: 'Who is the primary user of this project and what are they trying to accomplish? Define them precisely enough that you could make a product decision on their behalf.', descBase: '' },
    { option: 'What does the target user of this project already know and not know? That context will drive every design decision.', descBase: '' },
  ],
  L3: [
    { option: 'Who is this project for, and what are they trying to do?', descBase: '' },
  ],
};

const ABSENCE_IDEA_USER_DEFINITION_CASUAL: DecisionContent = {
  question:      'Idea forming — who is this actually for?',
  pinchFallback: 'User not defined.',
  L1: [
    { option: 'Who is this project for? Walk me through who the main user is, what they\'re trying to do, and what they know going in — be specific enough that we could make decisions about this project on their behalf.', descBase: '' },
    { option: 'Describe the person who\'ll use this project — who they are, what they want to do with it, and what level of experience they have. Then tell me who it\'s definitely NOT for.', descBase: '' },
    { option: 'Think about the person using this project — who are they? Describe them to me, including what problem they have and how this project fits into what they\'re already doing.', descBase: '' },
  ],
  L2: [
    { option: 'Who\'s the main person this project is for? Give me enough detail that we could make a feature decision based on what they need.', descBase: '' },
    { option: 'What does the person using this project actually want to do with it? Describe them simply.', descBase: '' },
  ],
  L3: [
    { option: 'Who is this project for and what are they trying to do?', descBase: '' },
  ],
};

// Group B — task_breakdown signals

const ABSENCE_TASK_ORDERING: DecisionContent = {
  question:      'Tasks listed — have they been ordered?',
  pinchFallback: 'Tasks unordered.',
  L1: [
    { option: 'Order the tasks for this project by dependency and priority: identify which tasks block others, which can be done in parallel, and establish the sequence that minimises rework and delivers the earliest working state.', descBase: '' },
    { option: 'Review the task list for this project and establish an explicit order: which task must be done first, which tasks have hard dependencies on others, and what is the critical path to a testable first version?', descBase: '' },
    { option: 'Prioritize the task list for this project: rank tasks by impact and dependency, identify the single highest-priority task to start with, and flag any tasks that should be deferred until a working core is established.', descBase: '' },
  ],
  L2: [
    { option: 'What is the correct order of tasks for this project? Identify the first three tasks in sequence and explain why each one must come before the next.', descBase: '' },
    { option: 'Which task in this project should be done first, and why? Establish the top of the ordered list before anything else starts.', descBase: '' },
  ],
  L3: [
    { option: 'What is the first task to work on for this project, and what does it unblock?', descBase: '' },
  ],
};

const ABSENCE_TASK_ORDERING_CASUAL: DecisionContent = {
  question:      'Tasks listed — what order do we do them in?',
  pinchFallback: 'No order set.',
  L1: [
    { option: 'Put the tasks for this project in order — which ones have to happen before others, which ones are independent, and what\'s the sequence that gets us to something working as fast as possible?', descBase: '' },
    { option: 'Look at the task list for this project and sort it — what comes first, what depends on what, and what\'s the critical path to something we can actually test?', descBase: '' },
    { option: 'What\'s the right order to tackle the tasks for this project? Rank them by what\'s blocking what, and tell me which task to start with and why.', descBase: '' },
  ],
  L2: [
    { option: 'What are the first three tasks for this project in order? Tell me what order makes sense and why.', descBase: '' },
    { option: 'Which task should we do first for this project and why does it come before everything else?', descBase: '' },
  ],
  L3: [
    { option: 'What\'s the first task to work on for this project?', descBase: '' },
  ],
};

const ABSENCE_TASK_SIZING: DecisionContent = {
  question:      'Tasks defined — are they scoped to single sessions?',
  pinchFallback: 'Tasks oversized.',
  L1: [
    { option: 'Review the task list for this project and validate sizing: each task should be completable in a single focused session. Identify any tasks that span multiple concerns, require too many unknowns to resolve in one sitting, or are so large that progress cannot be verified at the end of a session.', descBase: '' },
    { option: 'Break down any oversized tasks in this project: for each task that could not be completed in a single session, decompose it into subtasks — each subtask should have a clear output that can be verified when done.', descBase: '' },
    { option: 'Assess the scope of each task for this project: flag any that are too large to complete in one session, too vague to know when they\'re done, or dependent on so many unknowns that work could not proceed without stopping midway.', descBase: '' },
  ],
  L2: [
    { option: 'Which tasks in this project are too large to finish in a single session? Break the largest one down into smaller units now.', descBase: '' },
    { option: 'Is there any task in this project that could not be completed in a single focused session? Identify it and propose how to split it.', descBase: '' },
  ],
  L3: [
    { option: 'Identify any task in this project that is too large to finish in a single session and break it into smaller units.', descBase: '' },
  ],
};

const ABSENCE_TASK_SIZING_CASUAL: DecisionContent = {
  question:      'Tasks listed — are they small enough to do in one go?',
  pinchFallback: 'Tasks too big.',
  L1: [
    { option: 'Go through the tasks for this project — are any of them too big to finish in one session? If so, break them down into smaller pieces that each have a clear endpoint.', descBase: '' },
    { option: 'Check the task list for this project: which tasks are small enough to finish in one focused session, and which ones are really multiple tasks lumped together? Split the big ones.', descBase: '' },
    { option: 'Is any task in this project too big to do in one go? Walk me through the tasks and flag anything that would require stopping midway because there\'s too much or too many unknowns.', descBase: '' },
  ],
  L2: [
    { option: 'Which task in this project feels the biggest? Break it down into two or three smaller tasks that could each be finished in one session.', descBase: '' },
    { option: 'Are the tasks for this project small enough to finish one at a time, or do any of them need to be split up?', descBase: '' },
  ],
  L3: [
    { option: 'Is there any task in this project that\'s too big to do in one session?', descBase: '' },
  ],
};

const ABSENCE_TASK_DEFINITION_OF_DONE: DecisionContent = {
  question:      'Tasks ordered — does each task have a definition of done?',
  pinchFallback: 'No done criteria.',
  L1: [
    { option: 'Define the completion criteria for each task in this project: for every task, state what must be true for the task to be considered complete — what output exists, what has been verified, and what has not been left in an ambiguous or partially done state.', descBase: '' },
    { option: 'Audit the task list for this project for missing definitions of done: identify every task that lacks explicit completion criteria, then define what \'done\' means for each — the specific, verifiable condition that ends work on that task.', descBase: '' },
    { option: 'Write the definition of done for the highest-priority task in this project: what is the exact state of the codebase, tests, and documentation when this task is complete? Use that as a template to define done for the remaining tasks in this project.', descBase: '' },
  ],
  L2: [
    { option: 'For each task in this project, write one sentence stating what \'done\' looks like — a specific, verifiable condition, not a vague description of intent.', descBase: '' },
    { option: 'Which task in this project is missing the clearest definition of done? Define what completion looks like for that task before it starts.', descBase: '' },
  ],
  L3: [
    { option: 'Does every task in this project have a clear, verifiable definition of done, or are any tasks missing that?', descBase: '' },
  ],
};

const ABSENCE_TASK_DEFINITION_OF_DONE_CASUAL: DecisionContent = {
  question:      'Tasks set — how do we know when each one\'s done?',
  pinchFallback: 'Done criteria missing.',
  L1: [
    { option: 'For each task in this project, define what done looks like — not just \'it works\' but what specifically is true when the task is finished. What can be checked? What exists that didn\'t before?', descBase: '' },
    { option: 'Go through the tasks for this project and for each one, write what \'done\' means — the specific thing you\'d check to know it\'s complete. No vague descriptions, just the actual finish line.', descBase: '' },
    { option: 'Pick the most important task for this project and tell me exactly what done looks like for it — what\'s been built, what\'s been tested, what\'s been verified. Use that as a template to define done for the remaining tasks in this project.', descBase: '' },
  ],
  L2: [
    { option: 'What does done look like for each task in this project? Write a one-liner for each that describes the specific finish line.', descBase: '' },
    { option: 'Is there any task in this project where it\'s not clear how we\'d know it\'s done? Define the finish line for that one first.', descBase: '' },
  ],
  L3: [
    { option: 'How do we know when the first task in this project is done?', descBase: '' },
  ],
};

// Group C — feedback_loop signals

const ABSENCE_USER_FEEDBACK_REVIEW: DecisionContent = {
  question:      'Feedback received — has it been reviewed systematically?',
  pinchFallback: 'Feedback not reviewed.',
  L1: [
    { option: 'Review the feedback received for this project systematically: collect all available feedback, categorize it by theme or feature area, and identify the recurring complaints, requests, and points of confusion that appear across multiple users.', descBase: '' },
    { option: 'Analyze the feedback for this project for patterns: what issues surface most frequently, which complaints indicate users cannot complete their primary goal, and where does actual behavior diverge most from what was expected?', descBase: '' },
    { option: 'Prioritize the feedback for this project by impact: distinguish critical feedback (blocking users from their goal) from high-friction feedback (users struggle but succeed) from low-signal noise, and establish which issues demand immediate action.', descBase: '' },
  ],
  L2: [
    { option: 'What is the most critical piece of feedback for this project — the one issue that, if left unaddressed, blocks users from achieving their primary goal?', descBase: '' },
    { option: 'What are the top two or three recurring themes across all feedback for this project?', descBase: '' },
  ],
  L3: [
    { option: 'What are users saying about this project, and what is the most critical issue in the feedback?', descBase: '' },
  ],
};

const ABSENCE_USER_FEEDBACK_REVIEW_CASUAL: DecisionContent = {
  question:      'Feedback in — have we actually gone through it?',
  pinchFallback: 'Feedback not reviewed.',
  L1: [
    { option: 'Go through the feedback for this project — collect what users have said, group it by theme, and tell me what comes up over and over. What are the most common complaints or requests?', descBase: '' },
    { option: 'What patterns are you seeing in the feedback for this project? Walk me through what users are saying — what are the recurring issues, and where are people getting stuck?', descBase: '' },
    { option: 'Look at the feedback for this project and rank it — what\'s critical (users can\'t do what they need to do), what\'s high friction (they get there but it\'s painful), and what\'s just noise? Tell me what needs to be fixed first.', descBase: '' },
  ],
  L2: [
    { option: 'What\'s the most critical piece of feedback for this project — the one thing that, if we don\'t fix it, blocks users from doing what they came here to do?', descBase: '' },
    { option: 'What are the top two or three things users keep saying about this project?', descBase: '' },
  ],
  L3: [
    { option: 'What are users saying about this project?', descBase: '' },
  ],
};

const ABSENCE_ITERATION_PLANNING: DecisionContent = {
  question:      'Feedback reviewed — has the next iteration been planned?',
  pinchFallback: 'Next iteration unplanned.',
  L1: [
    { option: 'Define the priorities for the next iteration of this project based on the feedback: rank the issues identified, determine what must be addressed in this iteration versus what can be deferred, and establish the scope of the next version.', descBase: '' },
    { option: 'Identify the trade-offs for the next iteration of this project: which feedback-driven changes deliver the highest impact for the lowest effort, which require significant rework, and what should be deferred to preserve shipping velocity?', descBase: '' },
    { option: 'Write the success criteria for the next iteration of this project: given the feedback received, what specific, measurable outcomes would confirm the next iteration resolved the most critical user issues?', descBase: '' },
  ],
  L2: [
    { option: 'What are the top three changes to make in the next iteration of this project, ordered by priority? Identify them from the feedback.', descBase: '' },
    { option: 'What is the single most important thing to build or fix in the next iteration of this project, and why does it take priority over everything else?', descBase: '' },
  ],
  L3: [
    { option: 'What is the first change to make in the next iteration of this project based on what users said?', descBase: '' },
  ],
};

const ABSENCE_ITERATION_PLANNING_CASUAL: DecisionContent = {
  question:      'Feedback reviewed — what are we building next?',
  pinchFallback: 'Next iteration unplanned.',
  L1: [
    { option: 'Figure out what to build next for this project based on the feedback — what needs to be fixed or added in the next round, what can wait, and what\'s the scope of the next version?', descBase: '' },
    { option: 'Look at the feedback for this project and tell me what the trade-offs are for the next round — what\'s high impact and quick to do, what\'s a big change that needs more thought, and what should we hold off on?', descBase: '' },
    { option: 'What does success look like for the next version of this project? Given what users said, what specific things would tell us the next iteration actually fixed the problems?', descBase: '' },
  ],
  L2: [
    { option: 'What are the top three things to work on next for this project based on the feedback? Put them in priority order.', descBase: '' },
    { option: 'What\'s the single most important thing to fix or build next for this project, and why does it come first?', descBase: '' },
  ],
  L3: [
    { option: 'What\'s the first thing to build or fix in the next version of this project?', descBase: '' },
  ],
};

// ── Sub-7 — formal content sets ───────────────────────────────────────────────

const ABSENCE_SCOPE_CREEP: DecisionContent = {
  question:      'Scope expanding — still on original plan?',
  pinchFallback: 'Scope check?',
  L1: [
    { option: 'Audit what was just built against the original scope for this iteration: list what is complete, what is still in progress, and what has been added that was not in the original plan — and decide whether each addition stays in scope, gets deferred, or gets cut.', descBase: '' },
    { option: 'List every behaviour and feature added to this feature since implementation began — for each item, confirm whether it was in the agreed scope or was introduced along the way, and make a call: keep it, defer it, or cut it.', descBase: '' },
    { option: 'Write a scope summary for this project before continuing: what was the original plan for this iteration, what is now in the implementation, and what is the delta — treat anything outside the original plan as a decision that must be made now.', descBase: '' },
  ],
  L2: [
    { option: 'What was the original scope for this feature, and does the current implementation match it — or has it grown beyond the plan?', descBase: '' },
    { option: 'What is the most important addition to what was just built that was not in the original scope — and what is the decision on it: in, deferred, or cut?', descBase: '' },
  ],
  L3: [
    { option: 'What is one thing currently in this feature that was not in the original scope for this session?', descBase: '' },
  ],
};

const ABSENCE_CONTEXT_LOSS: DecisionContent = {
  question:      'Long session — context recapped?',
  pinchFallback: 'Context recap?',
  L1: [
    { option: 'Summarize the current state of what was just built: what decisions have been made, what is working, what remains incomplete, and what has changed since the session started — use this as a re-anchor before continuing.', descBase: '' },
    { option: 'Write a session summary for this project: what has been implemented, what the key technical decisions were, what the current blockers are, and what the next two or three steps are.', descBase: '' },
    { option: 'Before continuing work on this feature: list every significant decision made in this session, the current working state of the implementation, and what remains to complete the agreed scope — this prevents the session from drifting.', descBase: '' },
  ],
  L2: [
    { option: 'What is the current state of what was just built — what is working, what is still in progress, and what is the immediate next step?', descBase: '' },
    { option: 'What is the most important technical decision made this session about this feature that must be explicitly carried forward before continuing?', descBase: '' },
  ],
  L3: [
    { option: 'What is the one piece of context about this project that must not be lost before continuing — the single most important thing to anchor right now?', descBase: '' },
  ],
};

const ABSENCE_API_DESIGN_REVIEW: DecisionContent = {
  question:      'API being built — design reviewed?',
  pinchFallback: 'API design?',
  L1: [
    { option: 'Review the API surface of what was just built for backwards compatibility: list any changes to existing endpoints, parameters, or response shapes, and confirm whether each change is backwards compatible or constitutes a breaking change that requires a version bump.', descBase: '' },
    { option: 'Define the contract for this feature\'s API before finalizing implementation: document the endpoint paths, accepted inputs, response shapes, and any error codes — confirm these are stable and not likely to change once consumers depend on them.', descBase: '' },
    { option: 'Establish the versioning strategy for this project\'s API: will breaking changes be managed through URL versioning, header versioning, or deprecation notices — and does the current implementation reflect that strategy?', descBase: '' },
  ],
  L2: [
    { option: 'Does what was just built introduce any breaking changes to the existing API contract — and if so, what is the plan for consumers already depending on the current contract?', descBase: '' },
    { option: 'Is the API surface of this feature explicitly documented and locked before implementation continues — or are the endpoint signatures, inputs, and responses still in flux?', descBase: '' },
  ],
  L3: [
    { option: 'What is the most important API design decision for this feature that needs to be made before the implementation is considered complete?', descBase: '' },
  ],
};

const ABSENCE_ACCESSIBILITY: DecisionContent = {
  question:      'UI being built — accessibility checked?',
  pinchFallback: 'Accessibility?',
  L1: [
    { option: 'Audit the ARIA labelling and semantic structure of what was just built: identify every interactive element and confirm it has an accessible name — via native semantics, aria-label, or aria-labelledby — and that its role is correctly communicated to assistive technologies.', descBase: '' },
    { option: 'Test keyboard navigation for this feature: tab through every interactive element and confirm the tab order is logical, all interactive elements are reachable by keyboard, no focus is trapped unexpectedly, and all actions achievable with a mouse are also achievable without one.', descBase: '' },
    { option: 'Review the visual accessibility of what was just built: check that all text meets WCAG AA contrast ratios against its background, that focus states are visually distinct, and that no information is conveyed by colour alone.', descBase: '' },
  ],
  L2: [
    { option: 'Can a keyboard-only user complete the primary workflow in this feature without a mouse — and is the focus order logical as they tab through?', descBase: '' },
    { option: 'Does every interactive element in what was just built have an accessible name that a screen reader would announce correctly?', descBase: '' },
  ],
  L3: [
    { option: 'What is the most significant accessibility gap in this feature that a user with a disability would encounter right now?', descBase: '' },
  ],
};

const ABSENCE_ENV_AND_SECRETS: DecisionContent = {
  question:      'Credentials in use — secrets management reviewed?',
  pinchFallback: 'Secrets setup?',
  L1: [
    { option: 'Audit the secrets storage pattern for what was just built: identify every credential, API key, and environment-specific value used — confirm none are hardcoded in source, all are loaded from environment variables, and the variable names are documented in a `.env.example` file.', descBase: '' },
    { option: 'Review the environment configuration for this feature: confirm a `.env.example` exists with all required keys (values redacted), that `.env` is in `.gitignore`, and that any secret loaded at runtime has a clear failure path if the variable is missing.', descBase: '' },
    { option: 'Define the secret rotation plan for this project: for each credential in use, identify who holds it, how it gets rotated if compromised, and whether the current implementation supports hot-swapping secrets without a redeploy.', descBase: '' },
  ],
  L2: [
    { option: 'Are there any hardcoded credentials, API keys, or secrets in what was just built — and if so, what is the remediation plan before this reaches production?', descBase: '' },
    { option: 'Is there a `.env.example` that documents every environment variable required by this feature, and is the actual `.env` file excluded from source control?', descBase: '' },
  ],
  L3: [
    { option: 'What is the most sensitive credential used by this feature — and where is it currently stored?', descBase: '' },
  ],
};

const ABSENCE_DATA_VALIDATION: DecisionContent = {
  question:      'Accepting input — data validation in place?',
  pinchFallback: 'Input validation?',
  L1: [
    { option: 'Define the input schema for what was just built: for every endpoint or form, document the expected shape — required fields, optional fields, data types, and any constraints (min/max, allowed values) — and implement schema validation using a library such as Zod, Yup, or Joi.', descBase: '' },
    { option: 'Audit the validation coverage for this feature: for each input accepted, confirm there is an explicit check for required fields, correct data types, and acceptable value ranges — and that invalid inputs return a clear, descriptive error rather than failing silently or crashing.', descBase: '' },
    { option: 'Write the unhappy-path scenarios for data validation in this project: what happens when a required field is missing, when a value is the wrong type, and when the payload structure is completely unexpected — confirm the implementation handles each case explicitly.', descBase: '' },
  ],
  L2: [
    { option: 'Is there a schema validation layer for what was just built that rejects malformed inputs before they reach the business logic — and which library or approach is being used?', descBase: '' },
    { option: 'What are the required fields for each input accepted by this feature, and what happens if any of them are missing or the wrong type?', descBase: '' },
  ],
  L3: [
    { option: 'What is one input accepted by this feature that currently has no validation — and what is the worst-case outcome if it receives unexpected data?', descBase: '' },
  ],
};

const ABSENCE_CI_PIPELINE: DecisionContent = {
  question:      'Moving toward release — CI pipeline configured?',
  pinchFallback: 'CI pipeline?',
  L1: [
    { option: 'Confirm automated test execution is configured for this project: check that a CI workflow (e.g. GitHub Actions) runs the full test suite on every pull request and push to main — verify the workflow file exists, the test command is correct, and test failures block merges.', descBase: '' },
    { option: 'Review the CI build verification for this feature: confirm that a failing build — compilation errors, type errors, or broken imports — is caught automatically before code reaches the main branch, and that the pipeline status is visible on every pull request.', descBase: '' },
    { option: 'Audit the CI pipeline coverage for what was just built: list every check currently configured (tests, linting, type-checking, security scans), confirm each is wired up correctly, and identify any verification that runs locally but is missing from the pipeline.', descBase: '' },
  ],
  L2: [
    { option: 'Does this project have a CI pipeline that automatically runs its tests on every pull request — and does a test failure block a merge?', descBase: '' },
    { option: 'What does the CI pipeline for this feature actually verify — and is there anything checked locally during development that is not running automatically in CI?', descBase: '' },
  ],
  L3: [
    { option: 'What is the most important automated check missing from the CI pipeline for this project right now?', descBase: '' },
  ],
};

const ABSENCE_RATE_LIMITING: DecisionContent = {
  question:      'API endpoint built — rate limiting designed?',
  pinchFallback: 'Rate limiting?',
  L1: [
    { option: 'Define the rate limiting strategy for what was just built: specify the throttle limits per user, per API key, or per IP address — confirm which identifier is used for tracking, what the limit is (requests per second or per minute), and what happens when the limit is exceeded.', descBase: '' },
    { option: 'Design the throttle response for this feature: when a caller exceeds the rate limit, confirm the API returns a 429 status with a `Retry-After` header or equivalent signal — and document the expected backoff behaviour for clients.', descBase: '' },
    { option: 'Establish the quota model for this project: decide whether rate limits are applied per second, per minute, or per hour, whether limits differ by user tier or API key, and whether the throttle resets on a rolling window or a fixed interval.', descBase: '' },
  ],
  L2: [
    { option: 'What is the per-user or per-key request limit for what was just built — and is there any middleware or layer currently enforcing that limit?', descBase: '' },
    { option: 'What response does this feature return when a caller is throttled — and does the response include enough information for the client to know when to retry?', descBase: '' },
  ],
  L3: [
    { option: 'What is the most likely way this feature gets abused through excessive requests — and is there any throttle mechanism currently in place to prevent it?', descBase: '' },
  ],
};

const ABSENCE_FEATURE_SCOPE: DecisionContent = {
  question:      'Feature started — Definition of Ready confirmed?',
  pinchFallback: 'Scope this first.',
  L1: [
    { option: 'Define the scope and acceptance criteria for this feature before implementation continues: what is the feature doing, what are the explicit out-of-scope items, and what conditions must be true for the feature to be accepted as done? This is the Definition of Ready for sprint planning.', descBase: '' },
    { option: 'Write a feature specification before proceeding: intended behaviour, input/output contract, acceptance criteria (at least 3 scenarios covering happy path and key edge cases), and explicit scope boundaries. Implementation without this is a Definition of Ready violation.', descBase: '' },
    { option: 'Cross-confirm the feature scope: given what has been built so far in this session, is there a written definition of what the feature does and how it will be accepted? If not, define it now — spec the behaviour before writing more code.', descBase: '' },
  ],
  L2: [
    { option: 'State the acceptance criteria for this feature: what specific conditions must be true for this feature to be considered complete and ready for review?', descBase: '' },
    { option: 'Define the scope boundary: what does this feature do, and what is explicitly deferred or out of scope? One paragraph before continuing implementation.', descBase: '' },
  ],
  L3: [
    { option: 'What are the acceptance criteria for this feature? List them before adding more code.', descBase: '' },
  ],
};

const ABSENCE_IMPLEMENTATION_CHECKPOINT: DecisionContent = {
  question:      'Implementation continued — current state verified?',
  pinchFallback: 'Verify first.',
  L1: [
    { option: 'Run an implementation checkpoint before continuing: verify the last unit of work is in a passing state — either by running the relevant tests or by manually tracing the main path through the recently added code. Per TDD Red-Green-Refactor practice, only continue building once the current state is green.', descBase: '' },
    { option: 'Apply the TDD feedback loop to the last change: does what was just built satisfy its stated requirement? Trace the code path, run the tests if they exist, and confirm the current state is working before layering the next change on top of it.', descBase: '' },
    { option: 'Checkpoint the implementation before proceeding: what is the current state — working, broken, or untested? Identify the specific condition that confirms this unit of work is done and verify it now.', descBase: '' },
  ],
  L2: [
    { option: 'Before the next implementation step — does the current build pass? Run existing tests or manually verify the most recent change against its requirements.', descBase: '' },
    { option: 'What was the last thing built, and is it verified to work? Run the tests or do a quick manual trace before continuing.', descBase: '' },
  ],
  L3: [
    { option: 'Verify the last change works before adding the next one — run tests or manually confirm the current build is functional.', descBase: '' },
  ],
};

const ABSENCE_SPEC_BEFORE_CODE: DecisionContent = {
  question:      'Implementation started — behaviour specified first?',
  pinchFallback: 'Spec before code.',
  L1: [
    { option: 'Write a behaviour specification before continuing implementation: using BDD Given/When/Then format, define at least the primary scenario — Given [context], When [action], Then [expected outcome]. Per spec-driven development practice, the specification is the source of truth; code is the verification.', descBase: '' },
    { option: "Define the acceptance criteria for what is being built before writing more code: what specific behaviour must be true for this implementation to be considered correct? Per Dan North's BDD principle: 'a story's behaviour is simply its acceptance criteria' — write them before you implement.", descBase: '' },
    { option: 'Apply spec-first discipline to the current implementation unit: write the expected behaviour (inputs, process, outputs, error cases) before continuing. This is the boundary between planning and execution — the spec defines the target, implementation verifies against it.', descBase: '' },
  ],
  L2: [
    { option: 'Write the Given/When/Then scenario for what is being built before adding more code: what context, what action, and what expected outcome?', descBase: '' },
    { option: 'Define the expected behaviour of this implementation unit before continuing: what must be true for this to be considered correct?', descBase: '' },
  ],
  L3: [
    { option: 'Write one Given/When/Then scenario for what is being built before the next implementation step.', descBase: '' },
  ],
};

// ── Sub-7 — casual content sets ───────────────────────────────────────────────

const ABSENCE_SCOPE_CREEP_CASUAL: DecisionContent = {
  question:      'Scope expanding — still on original plan?',
  pinchFallback: 'Scope check?',
  L1: [
    { option: 'Take a look at what was just built and compare it to what you originally set out to do — is anything in there that wasn\'t part of the plan? Go through it and flag any extras before adding more.', descBase: '' },
    { option: 'Think about what this feature was supposed to do when you started — has anything crept in that wasn\'t in the original idea? Go through it and decide what to keep, what to push to later, and what to drop.', descBase: '' },
    { option: 'Before going further with this project — list what you originally planned to build this session and what\'s actually in there now. For anything extra, make a call: now, later, or never.', descBase: '' },
  ],
  L2: [
    { option: 'What did you originally set out to build in this feature, and does what\'s there now actually match that — or has it grown?', descBase: '' },
    { option: 'What\'s the most important thing added to what was just built that wasn\'t part of the original plan — and what are you going to do with it?', descBase: '' },
  ],
  L3: [
    { option: 'What\'s one thing in this feature that ended up there but wasn\'t in the original plan?', descBase: '' },
  ],
};

const ABSENCE_CONTEXT_LOSS_CASUAL: DecisionContent = {
  question:      'Long session — context recapped?',
  pinchFallback: 'Context recap?',
  L1: [
    { option: 'Let\'s get back on the same page — go through what was just built and give me a quick rundown: what\'s done, what\'s working, and what\'s still left to do.', descBase: '' },
    { option: 'Take a minute to catch up on this project — what have we actually built this session, what decisions did we make, and what\'s coming next?', descBase: '' },
    { option: 'Before going further with this feature — do a quick check: where are we, what\'s working, and what\'s the next thing that actually needs to happen?', descBase: '' },
  ],
  L2: [
    { option: 'What\'s the situation with what was just built right now — what\'s working and what still needs to happen?', descBase: '' },
    { option: 'What\'s the most important decision we made about this feature this session that you want to make sure we don\'t lose track of?', descBase: '' },
  ],
  L3: [
    { option: 'What\'s the one thing you most need to remember about where this project is right now before you keep going?', descBase: '' },
  ],
};

const ABSENCE_API_DESIGN_REVIEW_CASUAL: DecisionContent = {
  question:      'API being built — design reviewed?',
  pinchFallback: 'API design?',
  L1: [
    { option: 'Take a look at what was just built and check whether it could break anything that already uses this API — are there any changes to how endpoints work, what they expect, or what they return that might surprise existing callers?', descBase: '' },
    { option: 'Before locking in the API for this feature — go through what it accepts and what it returns, and think about whether that\'s something you\'d be comfortable with other code depending on. Is anything likely to change again?', descBase: '' },
    { option: 'Think about how this project\'s API handles changes over time — if something needs to change in a future version, how do you manage that without breaking code that\'s already using it?', descBase: '' },
  ],
  L2: [
    { option: 'Does what was just built change how the API works in a way that could break something already depending on it — and if so, what\'s the plan?', descBase: '' },
    { option: 'Is the shape of this feature\'s API settled enough that you\'re comfortable building other things on top of it — or is it likely to change?', descBase: '' },
  ],
  L3: [
    { option: 'What\'s the most important API design question about this feature that hasn\'t been answered yet?', descBase: '' },
  ],
};

const ABSENCE_ACCESSIBILITY_CASUAL: DecisionContent = {
  question:      'UI being built — accessibility checked?',
  pinchFallback: 'Accessibility?',
  L1: [
    { option: 'Go through what was just built and check whether a screen reader could make sense of it — does every button and link have a clear label, and are there any parts that would be confusing or silent for someone using one?', descBase: '' },
    { option: 'Try using this feature with just the keyboard — no mouse. Can you get to everything, use everything, and does the tab order feel natural? Note anything that gets stuck or hard to reach.', descBase: '' },
    { option: 'Take a look at the visual design of this feature from an accessibility angle — is the contrast readable, are focus states visible when you tab through, and is anything communicated only through colour that a colour-blind user might miss?', descBase: '' },
  ],
  L2: [
    { option: 'Could someone who can\'t use a mouse still complete the main task in this feature using only the keyboard — and does tabbing through it feel natural?', descBase: '' },
    { option: 'Does everything in what was just built have a label that a screen reader would announce — so someone who can\'t see the screen knows what each button and input is for?', descBase: '' },
  ],
  L3: [
    { option: 'What\'s the one accessibility issue in this feature that would most get in the way of someone with a disability using it?', descBase: '' },
  ],
};

const ABSENCE_ENV_AND_SECRETS_CASUAL: DecisionContent = {
  question:      'Credentials in use — secrets management reviewed?',
  pinchFallback: 'Secrets setup?',
  L1: [
    { option: 'Take a look at what was just built and check whether any API keys, passwords, or credentials are written directly into the code — if so, move them out now and load them from a separate config file instead.', descBase: '' },
    { option: 'Go through the environment setup for this feature — is there a `.env.example` file that lists every variable the app needs to run? Does the real `.env` file stay out of the repo?', descBase: '' },
    { option: 'Think about what happens if one of the secrets used by this project gets leaked or needs to be changed — how would you swap it out, and does the current setup make that easy or painful?', descBase: '' },
  ],
  L2: [
    { option: 'Is there anything in what was just built that has a real password, API key, or token written directly into the code rather than loaded from a config file?', descBase: '' },
    { option: 'What happens in this feature if a required environment variable isn\'t set — does something break immediately with a clear message, or does it fail in a confusing way later?', descBase: '' },
  ],
  L3: [
    { option: 'Where are the passwords and API keys for this feature sitting right now — are they safe, or is there something that needs to move?', descBase: '' },
  ],
};

const ABSENCE_DATA_VALIDATION_CASUAL: DecisionContent = {
  question:      'Accepting input — data validation in place?',
  pinchFallback: 'Input validation?',
  L1: [
    { option: 'Take a look at what was just built and check what happens when someone sends unexpected data — a missing field, the wrong type, or a completely random value. Is the app handling it gracefully or just crashing?', descBase: '' },
    { option: 'Go through the inputs this feature accepts and think about what you\'re actually checking before using that data — are the required fields being verified, are the types right, and is there a clear error when something is off?', descBase: '' },
    { option: 'Think about the worst data someone could realistically send to this project — a payload that\'s completely wrong, a value that would confuse the logic, or a field that shouldn\'t be there at all — and confirm the current code handles it.', descBase: '' },
  ],
  L2: [
    { option: 'Is there anything in what was just built that accepts data from outside and uses it directly without first checking that it\'s in the right shape?', descBase: '' },
    { option: 'What happens in this feature if a required field is missing from the input — does it fail clearly with a useful message, or does it just break in a confusing way?', descBase: '' },
  ],
  L3: [
    { option: 'What\'s one input this feature accepts that isn\'t being validated yet?', descBase: '' },
  ],
};

const ABSENCE_CI_PIPELINE_CASUAL: DecisionContent = {
  question:      'Moving toward release — CI pipeline configured?',
  pinchFallback: 'CI pipeline?',
  L1: [
    { option: 'Take a look at whether this project has something set up to automatically run the tests whenever code is pushed — if not, setting up a simple GitHub Actions workflow now means you catch failures before they reach the main branch.', descBase: '' },
    { option: 'Go through what a CI run actually does for this feature — when someone pushes code, does it automatically run the tests and stop a bad merge if something fails?', descBase: '' },
    { option: 'Think about what was just built and whether the CI pipeline is actually checking everything it should — are the tests running, is the build being verified, and is anything important only being checked locally but not automatically?', descBase: '' },
  ],
  L2: [
    { option: 'Does this project run its tests automatically whenever code is pushed — and does it stop a bad merge if the tests fail?', descBase: '' },
    { option: 'Is there anything about this feature that gets checked by hand during development but isn\'t running automatically in CI — and should it be?', descBase: '' },
  ],
  L3: [
    { option: 'What\'s the most important thing the CI pipeline should be catching for this project that it isn\'t catching right now?', descBase: '' },
  ],
};

const ABSENCE_RATE_LIMITING_CASUAL: DecisionContent = {
  question:      'API endpoint built — rate limiting designed?',
  pinchFallback: 'Rate limiting?',
  L1: [
    { option: 'Take a look at what was just built and think about what happens if someone calls this endpoint way too many times in a short period — is there anything stopping them from doing that, and if not, what would happen to the app?', descBase: '' },
    { option: 'Think about how this feature handles someone who keeps hammering the API — what does it tell them when they\'ve made too many requests, and does it give them enough info to know when to try again?', descBase: '' },
    { option: 'Go through the rate limiting design for this project — how many requests does a user or API key get before they\'re throttled, does the limit reset every minute or every hour, and does it work the same way for everyone?', descBase: '' },
  ],
  L2: [
    { option: 'Is there anything in what was just built that prevents a single user or caller from hitting the endpoint too many times — and if not, is that something that needs to be added?', descBase: '' },
    { option: 'What does this feature say back to someone who\'s sent too many requests — do they get a useful response that tells them when they can try again?', descBase: '' },
  ],
  L3: [
    { option: 'What\'s the most realistic way this feature gets overwhelmed by too many requests — and is there anything in place right now to prevent that?', descBase: '' },
  ],
};

const ABSENCE_FEATURE_SCOPE_CASUAL: DecisionContent = {
  question:      'Started building — is scope defined?',
  pinchFallback: 'What\'s in scope?',
  L1: [
    { option: 'Before going further — write a quick scope statement for this feature: what it does, what it doesn\'t do, and what done looks like. One paragraph is enough. This prevents mid-build scope drift.', descBase: '' },
    { option: 'Quick scope check: what exactly is this feature supposed to do, and what would confirm it\'s working correctly? Define the boundaries before continuing — it saves rework.', descBase: '' },
    { option: 'Write a one-sentence definition of done for this feature before the next prompt. What needs to be true for this to be \'finished\' — not perfect, just done?', descBase: '' },
  ],
  L2: [
    { option: 'What are the 2-3 things this feature must do to be considered complete? List them before continuing.', descBase: '' },
    { option: 'Scope check: what is this feature doing, and what is it explicitly NOT doing? Quick answer before next step.', descBase: '' },
  ],
  L3: [
    { option: 'What does \'done\' look like for this feature? One sentence before continuing.', descBase: '' },
  ],
};

const ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL: DecisionContent = {
  question:      'Kept building — is the last change verified?',
  pinchFallback: 'Checkpoint.',
  L1: [
    { option: 'Quick checkpoint before continuing — does what was last built actually work end to end? Try running it or walk through the main path manually. If it\'s broken, fix it now before the next change makes the bug harder to locate.', descBase: '' },
    { option: 'Smoke test the last change before adding more: what\'s the simplest way to verify it works right now? Run it or try the main path and report what you get.', descBase: '' },
    { option: 'Before moving to the next feature — does everything built so far still work? Quick manual check: try the main flow and flag anything that looks off.', descBase: '' },
  ],
  L2: [
    { option: 'Does the last change work? Run it or try it manually before continuing — one quick verification before the next prompt.', descBase: '' },
    { option: 'Checkpoint: what\'s the most recent thing that was built, and does it actually work? Verify before adding anything else.', descBase: '' },
  ],
  L3: [
    { option: 'Does what was last built work? Quick try before the next step.', descBase: '' },
  ],
};

const ABSENCE_SPEC_BEFORE_CODE_CASUAL: DecisionContent = {
  question:      'Building this — behaviour defined first?',
  pinchFallback: 'Spec it first.',
  L1: [
    { option: 'Before writing more code — write a quick behaviour spec: what inputs does this take, what should it do, and what output or side effect should it produce? One paragraph is enough. Spec before code avoids building the wrong thing.', descBase: '' },
    { option: 'Define the expected behaviour before implementing: given X (the context), when Y (the trigger), then Z (the outcome). Even one sentence of Given/When/Then saves more time than it takes to write.', descBase: '' },
    { option: 'Quick spec before continuing: what is this code supposed to DO? Not how — what. Describe the behaviour in plain terms, then implement against that description.', descBase: '' },
  ],
  L2: [
    { option: 'What should this do? Describe the expected behaviour in one or two sentences before writing the implementation.', descBase: '' },
    { option: 'Spec this out before coding it: what\'s the input, what happens, what\'s the expected output? Quick answer first.', descBase: '' },
  ],
  L3: [
    { option: 'What is this supposed to do? One sentence spec before the next prompt.', descBase: '' },
  ],
};

// ── Phase 5 D1 — incremental_build (CASUAL + FORMAL registers) ────────────────

const ABSENCE_INCREMENTAL_BUILD_CASUAL: DecisionContent = {
  question:      'Building incrementally — verifying between steps?',
  pinchFallback: 'Verify between steps.',
  L1: [
    { option: 'Between each change — stop and verify what was just built actually works before adding the next layer. Debugging compound changes is harder than debugging one change at a time.', descBase: '' },
    { option: 'Before moving to the next part of the implementation — try what was just built. If it\'s broken, fix it now. Layering changes on top of a broken base will cost more time than the verification takes.', descBase: '' },
    { option: 'What\'s the last thing that was built, and has it been verified as working? If not, verify before adding more. Incremental verification is faster than debugging a pile of changes at once.', descBase: '' },
  ],
  L2: [
    { option: 'Has what was just built been tested before continuing? Quick verification now is faster than debugging later.', descBase: '' },
    { option: 'Is each piece being verified as done before the next is added, or are multiple changes being stacked before any are checked?', descBase: '' },
  ],
  L3: [
    { option: 'Is what was last built working and verified before adding the next change?', descBase: '' },
  ],
};

const ABSENCE_INCREMENTAL_BUILD: DecisionContent = {
  question:      'Incremental build — is each step verified before the next?',
  pinchFallback: 'Verify before proceeding.',
  L1: [
    { option: 'Review the build cadence: is each incremental change being verified before the next is added? Compounding unverified changes increases debugging complexity — verify at each increment.', descBase: '' },
    { option: 'Audit the current state: what was the last change made, and has it been confirmed working? If not, verify before continuing — a clean failing test is faster to diagnose than multiple layered failures.', descBase: '' },
    { option: 'Check whether the implementation is proceeding incrementally with verification gates, or whether multiple changes are being stacked without intermediate confirmation. The latter increases rework risk significantly.', descBase: '' },
  ],
  L2: [
    { option: 'Is each increment being verified before the next change is added? Identify the last unverified change and confirm it before proceeding.', descBase: '' },
    { option: 'What is the current state of the build? Which pieces have been verified as working and which have not?', descBase: '' },
  ],
  L3: [
    { option: 'Has the most recent change been verified as working before the next one is introduced?', descBase: '' },
  ],
};

// ── Phase 5 D4-D6 — cool_geek signals (CASUAL register) ──────────────────────

const ABSENCE_FEATURE_COMPLETION_CHECK_CASUAL: DecisionContent = {
  question:      'Adding more — is the previous feature actually done?',
  pinchFallback: 'Finish before starting next.',
  L1: [
    { option: 'Checkpoint: what\'s the state of the last feature started? Is it done and tested end-to-end? Scrum\'s Definition of Done exists because partially-done features compound — starting new ones before previous ones meet DoD means carrying technical debt through every subsequent sprint.', descBase: '' },
    { option: 'Before adding the next thing — is the previous feature fully working end-to-end? Not \'mostly done\', not \'works here\', but actually complete and tested? Unfinished features accumulate and come back as bugs and edge cases.', descBase: '' },
    { option: 'How complete is the most recently started feature? Rate it honestly: \'done and tested\', \'works but untested\', \'partially built\'. Starting the next feature before the previous one meets DoD is the classic unfinished-work accumulation pattern.', descBase: '' },
  ],
  L2: [
    { option: 'Is the previous feature done and tested? That\'s the bar — fully built, verified end-to-end. Start the next only after meeting it.', descBase: '' },
    { option: 'What\'s the completion state of the last feature? Only move to the next after the previous is actually done.', descBase: '' },
  ],
  L3: [
    { option: 'Is the last feature actually done and tested before starting the next?', descBase: '' },
  ],
};

const ABSENCE_FINISHING_LINE_AWARENESS_CASUAL: DecisionContent = {
  question:      'Multiple things in progress — how many are complete?',
  pinchFallback: 'Finish one before starting next.',
  L1: [
    { option: 'Count check: how many features are currently in-progress vs. complete end-to-end? A partially-done feature delivers zero user value. Three features 40% each is worse than one feature 100% — the user can use one, and none of three.', descBase: '' },
    { option: 'In iterative delivery, value is delivered by reaching shippable state, not by making progress. How many features started this session have reached shippable state? Pick the one closest to completion — finish that before starting another.', descBase: '' },
    { option: 'Before starting something new — pick the feature closest to completion and push it to done. Lean delivery: finish items, don\'t accumulate WIP. What\'s the one thing to finish right now?', descBase: '' },
  ],
  L2: [
    { option: 'How many things are in-progress? Complete the one closest to done before starting anything new.', descBase: '' },
    { option: 'What would it take to bring the most-started feature to shippable state? Do that before adding more.', descBase: '' },
  ],
  L3: [
    { option: 'Which feature is closest to done? Finish that one before starting the next.', descBase: '' },
  ],
};

const ABSENCE_POLISH_VS_FUNCTION_CASUAL: DecisionContent = {
  question:      'Working on the look — does the core work end-to-end?',
  pinchFallback: 'Function before polish.',
  L1: [
    { option: 'Lean MVP principle: polish comes after function. Before spending more prompts on UI improvements — does the core functionality work end-to-end? \'MVP UI should be clean and usable, not museum-quality.\' Fix the working before fixing the looking.', descBase: '' },
    { option: 'Does the core user flow work without errors from start to finish? If not, visual polish is blocked by a non-working core. Function first: build the thing that works, then make it look good.', descBase: '' },
    { option: 'UI polish on a non-functional core creates maintenance debt — you\'ll redo the style when the function changes. Core functionality working end-to-end is the prerequisite for polish. Is it?', descBase: '' },
  ],
  L2: [
    { option: 'Does the core work end-to-end before going further with styling? Function first — polish after it works.', descBase: '' },
    { option: 'Is the working flow solid end-to-end? Lean MVP says polish after function. What\'s left to make the core work?', descBase: '' },
  ],
  L3: [
    { option: 'Get the core working end-to-end before focusing on how it looks.', descBase: '' },
  ],
};

const ABSENCE_MVP_SCOPE_DISCIPLINE_CASUAL: DecisionContent = {
  question:      'Adding features — is each one actually MVP scope?',
  pinchFallback: 'MVP discipline check.',
  L1: [
    { option: 'Eric Ries MVP heuristic: start with what you believe is needed, then eliminate half the features, then eliminate half again. Each addition should answer: does this test the core hypothesis? Is it the minimum needed to get real user feedback? If neither — it\'s gold-plating an unvalidated MVP.', descBase: '' },
    { option: 'MVP scope discipline: for each new feature, ask — is this the minimum needed to test the core assumption, or is it a nice-to-have that could wait until after first validation? \'Lean startup MVP requires strict discipline, focusing on the minimum feature set to test a specific assumption.\'', descBase: '' },
    { option: 'Before adding this — what specific hypothesis does it help validate? Features without a hypothesis-connection aren\'t MVP scope. List what\'s left to build and categorize: core hypothesis vs. nice-to-have.', descBase: '' },
  ],
  L2: [
    { option: 'Is this feature minimum-viable — needed to test the core hypothesis — or is it gold-plating? Scope check before building.', descBase: '' },
    { option: 'What hypothesis does this feature validate? If it doesn\'t test the core assumption, it\'s post-MVP scope.', descBase: '' },
  ],
  L3: [
    { option: 'Is this feature MVP scope? Does it test the core hypothesis or is it a nice-to-have?', descBase: '' },
  ],
};

const ABSENCE_IDEA_TO_SPEC_BRIDGE_CASUAL: DecisionContent = {
  question:      'New idea — defined what it does before building?',
  pinchFallback: 'Spec the idea first.',
  L1: [
    { option: 'Spec-driven development principle: a feature idea is not a spec. Before building — write a one-paragraph description: what does this feature do? What does it NOT do? How does it fit into what already exists? The spec becomes the source of truth; code is its expression.', descBase: '' },
    { option: 'Jumping from idea to code skips the bridge. Quick spec for this idea: (1) what does it do — one sentence, (2) what are its boundaries — what it explicitly does not do, (3) how does it fit into the existing product — integration points. Five minutes of spec saves hours of rework.', descBase: '' },
    { option: 'An idea in your head is not a spec. A spec is a structured description of what the feature does and doesn\'t do, written before implementation. Write it, then build against it — this is the difference between directed building and creative wandering.', descBase: '' },
  ],
  L2: [
    { option: 'Spec this idea before building it: what does it do, what are its boundaries, and how does it fit into what already exists? One paragraph is enough.', descBase: '' },
    { option: 'Before implementing — write what it does and what it doesn\'t do. The spec is the source of truth; implementation is the verification.', descBase: '' },
  ],
  L3: [
    { option: 'Define what this idea does and doesn\'t do before writing any code for it.', descBase: '' },
  ],
};

const ABSENCE_DEMO_VS_PRODUCT_CASUAL: DecisionContent = {
  question:      'Is this demo quality or production quality — explicit distinction?',
  pinchFallback: 'Demo vs. production: name which.',
  L1: [
    { option: 'Production readiness check: what quality standard applies to what\'s being built? Demo code and production code have different requirements. If this is a demo — mark it explicitly: hardcoded data, no edge cases, visual-only. If it\'s the actual product — it needs real data connected, error states handled, and edge cases working.', descBase: '' },
    { option: 'The difference between demo and production: demo looks right; production works right under real conditions. Treating prototype code as production without explicit upgrade creates technical debt that compounds with every sprint. \'Low quality code contains 15x more defects and takes 124% longer to resolve.\' — name which standard applies right now.', descBase: '' },
    { option: 'Categorize explicitly what\'s being built: prototype (exploratory, disposable, no production quality required) or production (real data, real errors, edge cases, maintainable). If prototype — name it and plan the production upgrade path. If production — apply production standards now.', descBase: '' },
  ],
  L2: [
    { option: 'Is this demo-quality or production-quality? Name it explicitly. If demo — what\'s the plan to make it production-ready? If production — is it handling real data and real error states?', descBase: '' },
    { option: 'Demo code isn\'t wrong — treating it as production code is. What quality standard applies to what\'s being built right now?', descBase: '' },
  ],
  L3: [
    { option: 'Is this demo or production quality? Name which, explicitly.', descBase: '' },
  ],
};

const ABSENCE_USER_JOURNEY_CHECK_CASUAL: DecisionContent = {
  question:      'Feature being built — is the full user journey mapped?',
  pinchFallback: 'Map the user journey first.',
  L1: [
    { option: 'Jeff Patton User Story Mapping: once a basic happy path is in place, consider edge cases, alternatives, and exceptions. Before building more — answer: (1) what does the user see the first time they encounter this feature? (2) what happens when there\'s no data — the empty state? (3) what happens when something goes wrong — the error state? Each is a must-handle state.', descBase: '' },
    { option: 'Happy-path-only features feel complete in development but break user trust in production. \'Edge cases often reveal how thoughtful a product really is.\' Before marking this feature done — map the non-happy paths: empty state, error state, first-use experience. These are the normal user experience for many users.', descBase: '' },
    { option: 'User journey check — beyond the happy path, which of these states has been handled? (1) Empty state — no data yet. (2) Error state — something fails. (3) First-time experience — user sees this for the first time. (4) Edge case — unexpected input. Story mapping says: reveal the states the system must handle gracefully.', descBase: '' },
  ],
  L2: [
    { option: 'Has the full user journey been mapped? Beyond the happy path — what happens in the empty state, error state, and first-use experience?', descBase: '' },
    { option: 'The feature may work for you — does it work for users in non-ideal conditions? Empty state, error state, first-time experience — name each.', descBase: '' },
  ],
  L3: [
    { option: 'What\'s the empty state? The error state? The first-use experience? Name all three.', descBase: '' },
  ],
};

const ABSENCE_TECHNICAL_SPIKE_TREATMENT_CASUAL: DecisionContent = {
  question:      'Exploring / experimenting — spike or production code?',
  pinchFallback: 'Spike or production: name which.',
  L1: [
    { option: 'XP spike solution principle (Kent Beck / James Shore): \'Never copy spike code into production code. Even if it is exactly what you need, rewrite it using TDD so that it meets production standards.\' The purpose of exploratory code is knowledge, not shipping. Name what\'s being done: spike (to learn) or production (to ship)?', descBase: '' },
    { option: 'The output of a spike is not production code — it\'s knowledge. Time-box the exploration, answer the question it was meant to answer, then decide: throw the spike away and rewrite properly, or extract the validated pattern into clean production code. Right now — is this spike or production?', descBase: '' },
    { option: 'Exploratory code and production code have different standards by definition. Some practitioners keep a dedicated spikes/ directory to enforce this separation. Before committing what\'s been written — spike (throwaway, learning-focused) or production (clean, tested, maintainable)? Name which.', descBase: '' },
  ],
  L2: [
    { option: 'Is what\'s being written spike code (exploratory, throwaway, to learn) or production code (tested, maintainable, to ship)? Name which before committing.', descBase: '' },
    { option: 'The XP rule: never commit spike code directly as production. If this was a spike — extract the useful pattern and rewrite it cleanly before it enters the codebase.', descBase: '' },
  ],
  L3: [
    { option: 'Spike code or production code? Name which before committing.', descBase: '' },
  ],
};

const ABSENCE_DEPENDENCY_ADVENTURE_CASUAL: DecisionContent = {
  question:      'Adding a dependency — evaluated the need and maintenance cost?',
  pinchFallback: 'Evaluate before adding.',
  L1: [
    { option: 'Dependency management principle: \'Dependencies are not free and extract an ongoing maintenance cost.\' Every library added for interest rather than specific need becomes code you did not write but have localized responsibility for. Before adding this — what specific problem does it solve that you can\'t solve without it?', descBase: '' },
    { option: '\'Dependency hell\' occurs when two libraries demand incompatible versions of the same dependency — resolving this can derail development schedules. Maintenance consumes 70-90% of total project costs. Before installing this package — have alternatives been evaluated? What specific problem does it solve?', descBase: '' },
    { option: 'Three questions before adding any dependency: (1) what specific problem does it solve? (2) have existing tools or a small custom solution been considered? (3) what is the ongoing maintenance cost — updates, security patches, version conflicts? Explore-first library additions become unmaintained technical debt.', descBase: '' },
  ],
  L2: [
    { option: 'What specific problem does this dependency solve? Have alternatives been evaluated? What\'s the maintenance cost? Answer all three before installing.', descBase: '' },
    { option: 'Dependencies are not free — they extract ongoing maintenance. What need does this library solve that justifies its long-term cost?', descBase: '' },
  ],
  L3: [
    { option: 'What specific problem does this library solve that justifies adding it as a permanent dependency?', descBase: '' },
  ],
};

const ABSENCE_RESTART_IMPULSE_CHECK_CASUAL: DecisionContent = {
  question:      'Hitting friction — debugged before considering a restart?',
  pinchFallback: 'Debug before restarting.',
  L1: [
    { option: 'Joel Spolsky: \'When you start from scratch there is absolutely no reason to believe that you are going to do a better job than you did the first time. Each fixed bug took weeks or years of real-world usage to be discovered — when you throw away code, all the knowledge that went into it is lost.\' Before restarting: what specifically went wrong and why?', descBase: '' },
    { option: 'Root cause analysis principle: every restart impulse is a debugging failure. \'RCA explains why the system became vulnerable to the fault, how the fault was triggered, and what durable changes will reduce the probability of it happening again.\' Rewriting skips all three steps. Debug first — identify the root cause before deciding whether restart is warranted.', descBase: '' },
    { option: 'The restart impulse is almost always wrong. Problems in the current code are known. Problems in the rewrite are unknown — and most of the same issues will be reproduced without the bug knowledge that accumulated in the current version. What specifically is broken? Fix that.', descBase: '' },
  ],
  L2: [
    { option: 'Before rewriting — what specifically went wrong? Name the root cause. Debug first, then decide whether restart is actually warranted.', descBase: '' },
    { option: 'The current code has accumulated knowledge from real use. Rewriting discards that. What\'s the specific problem? Fix it.', descBase: '' },
  ],
  L3: [
    { option: 'What specifically is broken? Debug it before deciding to restart.', descBase: '' },
  ],
};

const ABSENCE_CREATIVE_VS_CORE_RATIO_CASUAL: DecisionContent = {
  question:      'Session balance — how much went to core vs. creative features?',
  pinchFallback: 'Core value first.',
  L1: [
    { option: 'Value-driven development: \'features that generate the maximum value for the users without creating the maximum cost.\' Before the next creative or aesthetic feature — look at this session: what proportion of prompts went to core product functionality vs. creative/extra features? If more than 30-40% is creative, the core is under-served.', descBase: '' },
    { option: 'Value vs. effort check: creative features have effort cost but often low core-product value. \'Value-driven development prevents feature bloat — adding features that don\'t provide value.\' For each creative feature added this session — what core user need does it serve? If it doesn\'t serve a core need, it\'s future technical debt.', descBase: '' },
    { option: 'Session ratio check: count prompts on core features (things users actually need) vs. creative/extra features (things that are interesting to build). If creative is outweighing core — core first. Creative features compound maintenance cost without proportional user value.', descBase: '' },
  ],
  L2: [
    { option: 'What\'s the ratio of core product prompts to creative/extra feature prompts this session? If creative is outweighing core — prioritize core functionality first.', descBase: '' },
    { option: 'Every creative feature has a maintenance cost. Does this one serve a core user need, or is it a fun-to-build extra? Core first.', descBase: '' },
  ],
  L3: [
    { option: 'Has core product gotten more attention than creative extras this session? Check the ratio.', descBase: '' },
  ],
};

// ── Phase 5 D7 — pro_geek_soul cluster 1 (CASUAL register) ───────────────────

const ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL: DecisionContent = {
  question:      'Complex logic added — documented the why?',
  pinchFallback: 'Add the why comment.',
  L1: [
    { option: 'Clean Code principle: \'Don\'t use comments to explain WHAT the code is doing — use them to explain WHY you did it.\' For the non-obvious logic just added — add a comment explaining the reasoning, constraint, or edge case it handles. Future maintainers (including you) will need this context.', descBase: '' },
    { option: 'Two things to add for complex code: (1) an inline comment explaining WHY this approach was chosen — what constraint, edge case, or tradeoff it addresses; (2) a docstring for any public function that explains parameters, return value, and edge behavior. Complex code without this context becomes invisible debt.', descBase: '' },
    { option: 'The WHY behind non-obvious code is not preserved in the implementation — only a comment captures it. What\'s the reasoning behind what was just written? The algorithm choice, the edge case it handles, the tradeoff it makes — add that as an inline comment now before the context is gone.', descBase: '' },
  ],
  L2: [
    { option: 'For the complex logic just added — add an inline comment explaining WHY this approach was chosen. What constraint or edge case does it address?', descBase: '' },
    { option: 'Docstrings for public interfaces, inline comments for non-obvious logic. Add the \'why\' before moving on — it becomes invisible after the context is gone.', descBase: '' },
  ],
  L3: [
    { option: 'Add an inline comment explaining why this logic works the way it does before continuing.', descBase: '' },
  ],
};

const ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL: DecisionContent = {
  question:      'Shortcut taken — tagged it as debt?',
  pinchFallback: 'Tag the shortcut.',
  L1: [
    { option: 'Martin Fowler\'s Technical Debt Quadrant: \'Prudent Deliberate\' debt — acknowledged and added to the backlog — is acceptable. \'Reckless Deliberate\' — shortcuts taken without acknowledgment — compounds invisibly. Tag any shortcut with a TODO or FIXME comment before moving on.', descBase: '' },
    { option: 'Ward Cunningham\'s debt metaphor: taking a shortcut is a legitimate decision — not tagging it is the anti-pattern. Minimum: // TODO: [what needs fixing] — [why it was deferred]. Takes 10 seconds, prevents invisible accumulation across every subsequent sprint.', descBase: '' },
    { option: 'Shortcut taken without a debt tag means it\'s invisible — no backlog item, no reminder, no context for the next person who reads it. Add a // TODO: or // FIXME: with what needs to be fixed and why it was deferred. Then it\'s Prudent Deliberate debt, not Reckless.', descBase: '' },
  ],
  L2: [
    { option: 'Is the shortcut tagged with a TODO/FIXME? That\'s the minimum for Prudent Deliberate debt — acknowledge it so it\'s not forgotten.', descBase: '' },
    { option: 'Untagged shortcuts are invisible debt. Add // TODO: [what to fix] before continuing.', descBase: '' },
  ],
  L3: [
    { option: 'Tag any shortcut with TODO/FIXME before moving on — untagged debt accumulates invisibly.', descBase: '' },
  ],
};

const ABSENCE_TEST_DEPTH_CHECK_CASUAL: DecisionContent = {
  question:      'Tests written — covering beyond the happy path?',
  pinchFallback: 'Add edge and error path tests.',
  L1: [
    { option: 'Testing pyramid (Mike Cohn, 2009): tests must cover happy paths, edge cases, and negative scenarios. \'Start with happy path tests, then add error cases that verify graceful failure handling.\' Happy-path-only tests provide false confidence — everything looks green but real-world conditions break the code.', descBase: '' },
    { option: 'Branch coverage over line coverage: every decision path needs a test. For what was just written — what are the edge cases? (empty input, null, boundary values). What are the error paths? (what happens when this fails). Add at least one test for each non-happy-path scenario.', descBase: '' },
    { option: 'Add tests beyond the happy path in three categories: (1) boundary values — empty, null, max, min; (2) error paths — what happens when the operation fails; (3) negative tests — invalid input, unexpected state. Write at least one test per category for what was just built before moving on.', descBase: '' },
  ],
  L2: [
    { option: 'Do the tests cover edge cases (empty, null, boundary values) and error paths (what happens when this fails)? Happy path only is false confidence.', descBase: '' },
    { option: 'Add at least one edge case test and one error path test for what was just implemented before the tests are considered adequate.', descBase: '' },
  ],
  L3: [
    { option: 'Add edge case and error path tests — happy path only is incomplete coverage.', descBase: '' },
  ],
};

const ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL: DecisionContent = {
  question:      'Architecture decision made — noted the rationale?',
  pinchFallback: 'Add an architecture note.',
  L1: [
    { option: 'Architecture Decision Records (Michael Nygard, 2011): \'An ADR captures a single architectural decision and its rationale. People months or years later need to understand why the system is constructed the way that it is.\' For the structural decision just made — add a short note: context, decision, consequences. A code comment block or doc entry works.', descBase: '' },
    { option: 'The question future maintainers will ask: \'why was it built this way?\' Without a note, that question has no answer. Minimum viable ADR: what was decided, why, and what the tradeoffs are. Keep doc/adr/ in the repo for significant decisions.', descBase: '' },
    { option: 'Pattern choice, new abstraction layer, architectural tradeoff — these deserve a note. The code shows WHAT was done; only documentation shows WHY. Add a short rationale note before continuing — context disappears from memory faster than the code does.', descBase: '' },
  ],
  L2: [
    { option: 'What was the rationale for the architectural decision just made? Add a short note — context, decision, and consequences. Even one paragraph captures what\'s needed.', descBase: '' },
    { option: 'Code shows what; only documentation shows why. Add an architecture note before the context is gone.', descBase: '' },
  ],
  L3: [
    { option: 'Add a brief rationale note for the architectural decision — why this approach was chosen.', descBase: '' },
  ],
};

// ── Phase 5 D8 — pro_geek_soul cluster 2 (CASUAL register) ───────────────────

const ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL: DecisionContent = {
  question:      'New dependency added — evaluated it before adopting?',
  pinchFallback: 'Check the dependency before adding.',
  L1: [
    { option: 'NIST SSDF requires evaluating third-party components for maintenance status, license compatibility, and security properties before integration. For the dependency just added: Is it actively maintained (last release date, open issues trend)? Is the license compatible? Are there lighter-weight alternatives? A few minutes of evaluation now prevents being stuck with an abandoned or license-incompatible package later.', descBase: '' },
    { option: 'Three things to check before committing to a new dependency: (1) maintenance status — last release date, whether the repo is active; (2) license compatibility — MIT/Apache are generally safe, GPL has restrictions; (3) bundle size impact — what does this add to the build? The smaller the scope of what\'s needed, the more alternatives to compare. Evaluate first, install after.', descBase: '' },
    { option: 'Dependencies aren\'t free — they\'re ongoing maintenance commitments. Before adopting: check when it was last released, check whether there are lighter-weight alternatives that cover the needed scope, and confirm the license is compatible with the project. A package left unevaluated is a silent risk every time a security advisory hits.', descBase: '' },
  ],
  L2: [
    { option: 'Before committing to this dependency: check maintenance status (last release date, open issues), license compatibility, and whether alternatives exist.', descBase: '' },
    { option: 'Dependencies are ongoing maintenance commitments. Evaluate maintenance status, license, and alternatives before adopting.', descBase: '' },
  ],
  L3: [
    { option: 'Check maintenance status, license compatibility, and alternatives before adding this dependency.', descBase: '' },
  ],
};

const ABSENCE_SECURITY_REVIEW_GAP_CASUAL: DecisionContent = {
  question:      'Security surface touched — applied security checks?',
  pinchFallback: 'Apply security checks now.',
  L1: [
    { option: 'OWASP Secure by Design: security must be designed in, not bolted on. For what was just implemented — what security surfaces were introduced? Input validation (are all inputs sanitized?), authorization (is access properly gated?), injection prevention (SQL, command, path traversal). These checks belong during implementation, not as a post-implementation audit. Shift-left: add the check when the surface is created.', descBase: '' },
    { option: 'Three security checks for implementation work: (1) input validation — all user-supplied values must be validated/sanitized before use; (2) authorization — is the action properly gated to the user who should be able to perform it; (3) injection prevention — SQL queries parameterized, shell commands avoided, file paths validated. Add these now while the code is in context, not after the feature is shipped.', descBase: '' },
    { option: 'Security surfaces introduced during implementation: auth endpoints, data storage, user input, file handling. For each: is input validated? Is access gated? Is there injection risk? OWASP Top 10 covers the categories — what was just built touches which of these? Add the check as part of completing the feature, not as a separate hardening pass.', descBase: '' },
  ],
  L2: [
    { option: 'For what was just implemented: is input validated, is access properly authorized, and is there injection risk? These are implementation-phase checks, not post-ship.', descBase: '' },
    { option: 'Security checks (input validation, authorization, injection) belong during implementation — add them now before moving on.', descBase: '' },
  ],
  L3: [
    { option: 'Apply input validation, authorization checks, and injection prevention for what was just built.', descBase: '' },
  ],
};

const ABSENCE_API_CONTRACT_DEFINITION_CASUAL: DecisionContent = {
  question:      'API being built — defined the contract first?',
  pinchFallback: 'Define the interface before implementing.',
  L1: [
    { option: 'OpenAPI contract-first principle: define the API interface before writing the handler. For the endpoint being built — what does it accept (request schema: required fields, types, validation rules)? What does it return (response schema: success shape, error shape, status codes)? What is the error response format? Defining this first prevents implicit contracts that drift between callers and implementors — and makes mock servers and tests possible before the backend exists.', descBase: '' },
    { option: 'Contract-first API development: the request schema, response schema, and error response format must be defined before implementation. Three things to specify: (1) what the request body/params accept; (2) what a successful response returns; (3) what error responses look like and under what conditions. Write these as a schema or doc comment before writing the handler logic.', descBase: '' },
    { option: 'Building a route without a defined interface creates an implicit contract — the caller infers what to send and what to expect from the implementation, and both sides drift independently. Define the interface first: request shape, response shape, error cases. Minimum viable contract: a comment block with the schema above the handler.', descBase: '' },
  ],
  L2: [
    { option: 'Before implementing the endpoint: define the request schema, response schema, and error response format. Interface-first prevents implicit contracts.', descBase: '' },
    { option: 'What does this API accept and return? Define the contract before writing the handler logic — implicit contracts drift between callers and implementors.', descBase: '' },
  ],
  L3: [
    { option: 'Define the request schema, response schema, and error response format before writing the handler.', descBase: '' },
  ],
};

const ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL: DecisionContent = {
  question:      'Implementation done — covered the error paths?',
  pinchFallback: 'Add error handling for failure cases.',
  L1: [
    { option: 'McConnell\'s defensive programming (Code Complete): \'Defensive programming mandates covering all failure paths, not just happy paths.\' For what was just implemented — what are the error states? What happens when an external call fails? What happens when input is malformed? What happens when a database write fails? Each needs explicit handling: error state, fallback behavior, user-facing message. Code that only works on the happy path is incomplete by construction standards.', descBase: '' },
    { option: 'Three error-path categories for every implementation: (1) external service failures — what if the API call, database query, or file operation fails; (2) input validation failures — malformed data, missing required fields, out-of-range values; (3) edge state failures — empty result sets, concurrent writes, unexpected null. Add explicit handling for each category before the feature is considered done.', descBase: '' },
    { option: 'The happy path is the easy path — every real-world user hits an error case eventually. For what was just built: what error states exist? Is there an error boundary? Is there a fallback? Does the error surface as a useful message or as a silent failure? Add error handling now while the implementation is in context, not during the first production incident.', descBase: '' },
  ],
  L2: [
    { option: 'Does the implementation cover error paths — external failures, malformed input, and edge states? Happy path only is incomplete by construction standards.', descBase: '' },
    { option: 'Add explicit error handling for failure cases before moving on — what happens when this breaks in production?', descBase: '' },
  ],
  L3: [
    { option: 'Add error handling for failure paths — external failures, malformed input, and edge states.', descBase: '' },
  ],
};

// ── Phase 5 D9 — pro_geek_soul cluster 3 (CASUAL register) ───────────────────

const ABSENCE_REFACTORING_CHECKPOINT_CASUAL: DecisionContent = {
  question:      'Adding to messy code — refactored first?',
  pinchFallback: 'Do a cleanup pass before extending.',
  L1: [
    { option: 'Boy Scout Rule (Clean Code): \'Leave the code cleaner than you found it.\' Before adding a feature to code that was already acknowledged as messy or complex — do a refactoring pass first. The alternative is adding features on top of complexity, which makes the next change harder, not the same difficulty. The refactoring pass before extending is the investment that prevents compound complexity debt.', descBase: '' },
    { option: 'Adding to messy code without cleaning it first means the next developer (including future you) inherits the original mess plus the new feature built on top of it. Before extending: extract repeated logic into helpers, simplify conditionals, rename confusing variables. The feature addition is then built on clean ground, not on accumulated complexity.', descBase: '' },
    { option: 'Three things to do before extending complex code: (1) extract any repeated logic into well-named helpers; (2) simplify long conditionals or deeply nested blocks; (3) rename anything that required a comment to explain. Then add the feature. The Boy Scout Rule applies here: leave the code cleaner than you found it, not messier than you found it.', descBase: '' },
  ],
  L2: [
    { option: 'Before adding to the existing messy or complex code: do a refactoring pass first. Extract, simplify, rename — then extend. Building on top of complexity doubles it.', descBase: '' },
    { option: 'The cleanup pass before the feature is the investment that prevents compound debt. What can be extracted, simplified, or renamed before adding to this?', descBase: '' },
  ],
  L3: [
    { option: 'Do a refactoring pass on the existing code before extending — leave it cleaner than you found it.', descBase: '' },
  ],
};

const ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL: DecisionContent = {
  question:      'Interface changed — checked existing consumers?',
  pinchFallback: 'Check what calls this before changing.',
  L1: [
    { option: 'Semantic Versioning (semver.org): MAJOR version = backwards-incompatible change. The formal rule: any change to an interface used by existing callers must enumerate those callers and assess the impact before implementation. For the function signature, API contract, or interface just changed — what calls it? What are the downstream effects? Have those callers been updated or is the change backwards-compatible?', descBase: '' },
    { option: 'Hyrum\'s Law: \'With a sufficient number of users of an API, it does not matter what you promise in the contract — all observable behaviors will be depended on by somebody.\' The practical implication: before changing any interface, find all callers (grep the codebase), assess what each expects, and either maintain compatibility or update each caller explicitly. Silent interface breaks cause runtime errors that show up later, not at the point of change.', descBase: '' },
    { option: 'Three steps before changing a function signature or API contract: (1) grep for all callers; (2) check whether the change is backwards-compatible or breaking; (3) if breaking — update all callers, or version the interface. A change made without step 1 is a change made blind. The downstream breakage shows up at runtime, not at compile.', descBase: '' },
  ],
  L2: [
    { option: 'Before the interface change: enumerate all callers, assess whether the change is backwards-compatible, and update any affected consumers. Changes made blind cause silent runtime breaks.', descBase: '' },
    { option: 'What calls this? Grep for it before changing — then decide whether to maintain compatibility or update all callers explicitly.', descBase: '' },
  ],
  L3: [
    { option: 'Check all callers of this interface before changing it — update or version any that are affected.', descBase: '' },
  ],
};

const ABSENCE_SELF_REVIEW_HABIT_CASUAL: DecisionContent = {
  question:      'Long implementation run — done a review pass?',
  pinchFallback: 'Read back through what was built.',
  L1: [
    { option: 'Google Engineering Practices: \'The author is the first reviewer.\' Before submitting or continuing, read back through the diff: does the code do what was intended? Are there naming inconsistencies? Is anything more complex than it needs to be? Are tests missing? The self-review pass catches what was obvious in the context of writing but invisible in isolation — logic errors, naming drift, gaps in coverage.', descBase: '' },
    { option: 'A 15-prompt implementation run without a review pass is a run where each decision was made in context but never assessed as a whole. Read back through what was built: does the overall structure make sense? Are there inconsistencies between early and late decisions? Did anything get added that\'s redundant or conflicts with earlier code? The review pass is the quality gate that catches accumulated drift.', descBase: '' },
    { option: 'Three things to check in a self-review pass: (1) does the implementation match the original intent — were any assumptions made that drifted from the goal; (2) naming and structure coherence — do variable and function names still make sense given the full implementation; (3) coverage gaps — are there paths or states that were implemented but not tested. Read the diff before moving on.', descBase: '' },
  ],
  L2: [
    { option: 'Read back through the implementation before continuing: does it make sense as a whole? Check for naming drift, structural inconsistencies, and coverage gaps.', descBase: '' },
    { option: 'The self-review pass catches what was invisible in the context of writing. Read the diff — does this all hang together?', descBase: '' },
  ],
  L3: [
    { option: 'Do a review pass on what was built — read the diff and check for drift, gaps, and inconsistencies.', descBase: '' },
  ],
};

const ABSENCE_PERFORMANCE_AWARENESS_CASUAL: DecisionContent = {
  question:      'Data-heavy operation — considered performance?',
  pinchFallback: 'Check for performance implications.',
  L1: [
    { option: 'Knuth (1974): \'We should not pass up our opportunities in that critical 3%.\' The full quote is not an excuse to avoid performance — it\'s a prioritization rule: ignore the 97% of noncritical paths, but act on the critical 3%. For what was just built — is this in the critical 3%? A full-table fetch, N+1 in a loop, or unthrottled list render qualifies. The check here is awareness, not micro-optimization: is there an obvious performance problem worth addressing before it ships?', descBase: '' },
    { option: 'Three data-heavy patterns that require a performance check before shipping: (1) N+1 queries — does this loop trigger a database call per iteration; (2) full-table fetches — is the query unbounded and potentially returning thousands of records; (3) expensive renders — is a large list rendering without virtualization, memoization, or lazy loading. These are not premature optimization targets — they\'re known problem patterns with well-understood solutions.', descBase: '' },
    { option: 'Performance awareness for this operation: what is the data volume? What happens at 10x, 100x the expected load? Is there an N+1 pattern? Is there pagination? Is there a memo or cache in front of an expensive computation? The question is not \'is this perfectly optimized?\' — it is \'is there an obvious performance problem that will hit in production that could be caught now?\'', descBase: '' },
  ],
  L2: [
    { option: 'For the data-heavy operation just built: check for N+1 queries, unbounded fetches, and expensive unthrottled renders before this ships.', descBase: '' },
    { option: 'Performance awareness at the right time — not micro-optimization, just checking: is there an obvious performance problem in what was just built?', descBase: '' },
  ],
  L3: [
    { option: 'Check for N+1 queries, unbounded fetches, or expensive renders before this feature ships.', descBase: '' },
  ],
};

// ── Phase 5 D10 — hardcore_pro cluster 1 (FORMAL register) ───────────────────

const ABSENCE_DECISION_RECORD_ABSENCE_FORMAL: DecisionContent = {
  question:      'Architectural decision made — ADR recorded?',
  pinchFallback: 'Record the decision with context and consequences.',
  L1: [
    { option: 'Write an architecture decision record for the key design decision made here: document the context (what problem was being solved), the decision made, the alternatives that were considered and rejected, and the consequences — so future engineers understand why this exists as it does.', descBase: '' },
    { option: 'Create an ADR capturing this architectural decision: what was decided, what were the alternatives, what tradeoffs were accepted, and what constraints or assumptions this decision depends on.', descBase: '' },
    { option: 'Record this architectural decision before the session ends: context, decision, consequences, alternatives considered — without this, the design rationale will be lost as team composition or memory changes.', descBase: '' },
  ],
  L2: [
    { option: 'Write an ADR for this decision — context, decision, consequences, and alternatives considered.', descBase: '' },
    { option: 'Document the key architectural decision made here: what was decided and why, and what the main alternative was.', descBase: '' },
  ],
  L3: [
    { option: 'Write an ADR for this decision: context, decision, consequences, and alternatives considered.', descBase: '' },
  ],
};

const ABSENCE_OVER_ENGINEERING_CHECK_FORMAL: DecisionContent = {
  question:      'Is this abstraction required by current requirements?',
  pinchFallback: 'Apply YAGNI — build only what current requirements require.',
  L1: [
    { option: 'Apply YAGNI to what was just built: identify any abstraction, interface, or configuration option that was added speculatively — not required by a current story or use case — and remove or defer it.', descBase: '' },
    { option: 'Audit what was just built for speculative design: flag any abstraction layer, plugin interface, or extensibility mechanism that has no current consumer, and propose removing or simplifying it.', descBase: '' },
    { option: 'Apply YAGNI: for each abstraction in what was just built, confirm there is a current requirement that justifies it — if not, propose the simpler implementation that still satisfies the present use case.', descBase: '' },
  ],
  L2: [
    { option: 'Apply YAGNI to what was just built — identify and remove any abstraction not required by a current story or use case.', descBase: '' },
    { option: 'Is there any abstraction in what was just built that has no current consumer? If so, propose removing it.', descBase: '' },
  ],
  L3: [
    { option: 'Apply YAGNI — remove speculative abstraction and implement only what current requirements require.', descBase: '' },
  ],
};

const ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL: DecisionContent = {
  question:      'Critical implementation complete — review plan established?',
  pinchFallback: 'Establish a review plan before merging.',
  L1: [
    { option: 'Establish a review plan for this change before merging: define who reviews it, what the review checklist covers (design correctness, error handling, edge cases, security, performance implications), and what the merge gate is — confirm the plan is in place before the branch is merged.', descBase: '' },
    { option: 'Define a review checklist for this change: design correctness, error handling completeness, edge case coverage, security implications, and any performance concerns — then assign reviewers and set a merge gate before proceeding.', descBase: '' },
    { option: 'Complete a structured review of what was just built: verify the design decision, check error handling for every failure path, confirm edge cases are covered, and flag any security implications before this merges.', descBase: '' },
  ],
  L2: [
    { option: 'Set up a review plan for this change: define the checklist, assign reviewers, and set a merge gate before merging.', descBase: '' },
    { option: 'What is the review plan for this change? Who reviews it, what does the checklist cover, and what is the merge gate?', descBase: '' },
  ],
  L3: [
    { option: 'Establish and complete a review plan before merging — design correctness, error handling, security surface.', descBase: '' },
  ],
};

// ── Phase 5 D11 — hardcore_pro cluster 2 (FORMAL register) ───────────────────

const ABSENCE_OBSERVABILITY_FIRST_FORMAL: DecisionContent = {
  question:      'Feature shipping — observability instrumented?',
  pinchFallback: 'Add logging, metrics, and tracing before shipping.',
  L1: [
    { option: 'Add observability to this feature before shipping: instrument all three pillars — structured logging at each significant event boundary, metrics for request rate, error rate, and latency, and distributed trace spans for every external call — so production behavior is visible from day one.', descBase: '' },
    { option: 'Define and implement the observability strategy for this feature before it ships: what events get logged (and at what level), what metrics are emitted, and what trace spans are added for every external dependency call.', descBase: '' },
    { option: 'Instrument this feature with logs, metrics, and traces before shipping: confirm all three observability pillars are in place, that the metrics are wired to dashboards, and that alerts are defined before launch.', descBase: '' },
  ],
  L2: [
    { option: 'Add logging, metrics, and distributed tracing to this feature before shipping — all three observability pillars required.', descBase: '' },
    { option: 'What logs, metrics, and trace spans does this feature emit? Confirm all three are in place before it ships.', descBase: '' },
  ],
  L3: [
    { option: 'Add logging, metrics, and tracing instrumentation before shipping — all three pillars required.', descBase: '' },
  ],
};

const ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL: DecisionContent = {
  question:      'External dependencies integrated — failure modes enumerated?',
  pinchFallback: 'Enumerate failure modes for each dependency.',
  L1: [
    { option: 'Enumerate failure modes for every external dependency this feature relies on: for each dependency, name the failure mode (timeout, error response, partial data, unavailability), specify the stability pattern that handles it (circuit breaker, timeout + fallback, bulkhead, retry with backoff), and confirm the pattern is implemented before shipping.', descBase: '' },
    { option: 'Identify the top three external dependencies in this feature and define the failure behavior for each: what happens when each dependency is slow, returns an error, or is unavailable — and what stability pattern prevents cascading failure.', descBase: '' },
    { option: 'Audit every external call in this feature for failure handling: confirm each has a timeout, a defined error response, and a documented degradation path.', descBase: '' },
  ],
  L2: [
    { option: 'For each external dependency in this feature: name the failure mode and confirm the stability pattern (circuit breaker, timeout, fallback) is in place.', descBase: '' },
    { option: 'What is the worst failure scenario for this feature\'s most critical external dependency, and is there a stability pattern preventing it?', descBase: '' },
  ],
  L3: [
    { option: 'Enumerate failure modes for each dependency and specify the stability pattern for each before shipping.', descBase: '' },
  ],
};

const ABSENCE_CONTRACT_TESTING_GAP_FORMAL: DecisionContent = {
  question:      'Service boundary established — contract tests defined?',
  pinchFallback: 'Define consumer-driven contract tests for this boundary.',
  L1: [
    { option: 'Define consumer-driven contract tests for this service boundary before independent deployment: write the contract from the consumer\'s perspective, verify the provider satisfies it in isolation, and add provider verification to the CI pipeline.', descBase: '' },
    { option: 'Write contract tests that verify this service\'s API from the consumer\'s view: define the expected request/response shape, the error responses, and the versioning behavior — independently of the provider\'s implementation.', descBase: '' },
    { option: 'Establish a contract testing gate for this service boundary: define what the consumer expects, implement provider verification, and confirm the CI pipeline enforces it before any consumer or provider changes ship independently.', descBase: '' },
  ],
  L2: [
    { option: 'Write consumer-driven contract tests for this service boundary — define the contract from the consumer\'s perspective and verify the provider satisfies it in isolation.', descBase: '' },
    { option: 'Define the expected API contract for this service boundary and implement provider verification before independent deployment.', descBase: '' },
  ],
  L3: [
    { option: 'Define consumer-driven contract tests for this service boundary before independent deployment.', descBase: '' },
  ],
};

// ── Phase 5 D12 — hardcore_pro clusters 3+4 (FORMAL register) ────────────────

const ABSENCE_CAPACITY_PLANNING_GAP_FORMAL: DecisionContent = {
  question:      'Load-adding feature — capacity estimate done?',
  pinchFallback: 'Complete a capacity estimate before shipping.',
  L1: [
    { option: 'Estimate capacity requirements for this feature before shipping: project peak request rate (RPS), storage growth over 90 days, and required infrastructure headroom — then verify current infrastructure can serve the estimated peak load.', descBase: '' },
    { option: 'Define capacity targets for this feature: what is the expected RPS at launch and at 10× scale, what is the storage growth rate, and is current provisioning sufficient for each?', descBase: '' },
    { option: 'Audit infrastructure requirements for this feature: estimate peak load, define headroom thresholds, and confirm monitoring alerts are in place before any metric approaches the estimated saturation point.', descBase: '' },
  ],
  L2: [
    { option: 'Estimate peak RPS, storage growth over 90 days, and infrastructure headroom for this feature before shipping.', descBase: '' },
    { option: 'At what RPS does this feature saturate its current infrastructure, and is that load likely within the next 90 days?', descBase: '' },
  ],
  L3: [
    { option: 'Capacity estimate required: RPS at peak, storage growth rate, infrastructure headroom. Provide all three before shipping.', descBase: '' },
  ],
};

const ABSENCE_SECURITY_THREAT_MODELING_FORMAL: DecisionContent = {
  question:      'Security-sensitive feature — STRIDE threat model completed?',
  pinchFallback: 'Complete a STRIDE threat model before shipping.',
  L1: [
    { option: 'Enumerate applicable STRIDE threats for this feature and define a mitigation control per threat: Spoofing (identity verification), Tampering (input validation + integrity checks), Repudiation (audit logging), Information Disclosure (data exposure scope), Denial of Service (rate limiting + timeouts), Elevation of Privilege (authorization checks) — confirm each relevant threat has a control before shipping.', descBase: '' },
    { option: 'Apply STRIDE to this feature\'s threat surface: for each applicable threat category, name the attack vector, identify the data or component at risk, and define the control that mitigates it.', descBase: '' },
    { option: 'Threat-model this feature using STRIDE categories: enumerate threats, assign severity, and confirm each threat has a documented mitigation or an accepted-risk decision before shipping.', descBase: '' },
  ],
  L2: [
    { option: 'Identify the top three STRIDE threats for this feature and define mitigation controls for each.', descBase: '' },
    { option: 'Apply STRIDE to this feature: for each applicable category, what is the threat and what control mitigates it?', descBase: '' },
  ],
  L3: [
    { option: 'STRIDE threat model required: enumerate applicable threats and define mitigation controls before shipping.', descBase: '' },
  ],
};

const ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL: DecisionContent = {
  question:      'Schema change — expand-migrate-contract pattern applied?',
  pinchFallback: 'Apply backwards-compatible phased migration.',
  L1: [
    { option: 'Apply the expand-migrate-contract sequence to this database change: confirm the schema change can be split into a backward-compatible add phase, a data migration phase, and a cleanup phase — so each phase deploys independently without downtime or rollback risk.', descBase: '' },
    { option: 'Verify this migration is reversible and safe under concurrent writes: confirm no destructive operation (DROP, NOT NULL without default, column rename) occurs in a single migration step, and that the expand-migrate-contract pattern applies.', descBase: '' },
    { option: 'Audit this database migration for safety: identify any destructive schema changes, verify backward compatibility during the migration window, and confirm rollback is possible at each step.', descBase: '' },
  ],
  L2: [
    { option: 'Verify this migration uses the expand-migrate-contract pattern — confirm no destructive schema operation happens in a single deployment step.', descBase: '' },
    { option: 'Is this migration reversible? Can it be rolled back without data loss if the deployment is reverted mid-migration?', descBase: '' },
  ],
  L3: [
    { option: 'Expand-migrate-contract required: no destructive schema changes in a single deployment. Phase across multiple deployments.', descBase: '' },
  ],
};

const ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL: DecisionContent = {
  question:      'Significant feature shipping — deployment strategy defined?',
  pinchFallback: 'Define deployment strategy and rollback plan before shipping.',
  L1: [
    { option: 'Define the deployment strategy for this feature before shipping: choose the strategy (canary, feature flag, blue-green, staged rollout), define the rollback procedure, and confirm the rollback can be completed within the acceptable downtime window.', descBase: '' },
    { option: 'Establish a deployment plan for this feature: what strategy isolates risk (canary or staged rollout), what signals trigger an abort, and what the rollback procedure is if those signals are observed post-deploy.', descBase: '' },
    { option: 'Audit deployment readiness: confirm deployment strategy, verify rollback procedure, and check that monitoring is in place to detect a failed deploy before it reaches full traffic.', descBase: '' },
  ],
  L2: [
    { option: 'Define deployment strategy and rollback plan for this feature before shipping.', descBase: '' },
    { option: 'What is the deployment strategy for this feature, and what triggers a rollback if the deploy fails?', descBase: '' },
  ],
  L3: [
    { option: 'Define deployment strategy (canary/feature flag/blue-green/staged) and rollback plan before shipping.', descBase: '' },
  ],
};

const ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL: DecisionContent = {
  question:      'New service/feature shipping — operational runbook written?',
  pinchFallback: 'Write the runbook before shipping.',
  L1: [
    { option: 'Write the operational runbook for this feature before shipping: document what the feature does, how to deploy it, the key health metrics to monitor, how to diagnose the most likely failure scenarios, and the escalation path if on-call cannot resolve the issue.', descBase: '' },
    { option: 'Define the operational documentation for this feature: deployment steps, expected normal behavior, failure indicators, debug steps for the top three failure modes, and escalation contacts.', descBase: '' },
    { option: 'Write the runbook before this ships: what it does, how it is deployed, how to confirm it is healthy, how to debug it when it is not, and who to escalate to.', descBase: '' },
  ],
  L2: [
    { option: 'Write the runbook for this feature before shipping — cover deploy steps, health metrics, failure scenarios, and escalation path.', descBase: '' },
    { option: 'Document how to debug this feature when it is misbehaving in production — the top two or three failure modes and how to diagnose each.', descBase: '' },
  ],
  L3: [
    { option: 'Write the runbook before shipping: what it does, how to debug failures, key metrics, and escalation path.', descBase: '' },
  ],
};

const ABSENCE_SLO_DEFINITION_GAP_FORMAL: DecisionContent = {
  question:      'User-facing feature/service — SLOs defined?',
  pinchFallback: 'Define SLOs before shipping.',
  L1: [
    { option: 'Define SLOs for this feature before shipping: specify the availability target, the latency p99 budget, and the error rate budget — then confirm alerting and on-call escalation are tied to each SLO before launch.', descBase: '' },
    { option: 'Establish service level objectives for this feature: what availability does the consumer depend on, what is the acceptable latency at p99, and what error rate triggers an incident — document these before any consumer dependency is established.', descBase: '' },
    { option: 'Set and document SLOs before this ships: availability %, latency p99, error rate budget, and the burn rate at which the error budget is exhausted — so on-call knows what to page on.', descBase: '' },
  ],
  L2: [
    { option: 'Define availability, latency p99, and error rate SLOs for this feature before shipping.', descBase: '' },
    { option: 'What are the SLOs for this feature? Specify availability %, latency p99, and error rate budget.', descBase: '' },
  ],
  L3: [
    { option: 'Define SLOs before shipping: availability target, latency target (p99), and error rate budget.', descBase: '' },
  ],
};

// ── Phase 6 E1-E3 — founder role CASUAL content ───────────────────────────────

export const ABSENCE_USER_VALUE_CHECK_CASUAL: DecisionContent = {
  question: 'Has this feature been validated with real users?',
  pinchFallback: 'Check user signal before committing to this build.',
  L1: [
    { option: 'The single biggest waste in product development is building something nobody asked for. Lean Startup core loop: before any feature build, check whether you have a user signal — a conversation, a behavioral observation, a direct request, or survey data — that confirms the problem you\'re solving is real for your users. Without signal, you\'re making a bet, not a decision.', descBase: '' },
    { option: 'User validation doesn\'t have to be formal. Showing a sketch to 5 users beats shipping a polished feature to zero signal. The goal is to reduce the chance that the feature solves a problem that only exists in the builder\'s imagination. Customer discovery question: did at least one real user tell you they need this, or did you observe them struggling with the absence of it?', descBase: '' },
    { option: 'If you haven\'t validated yet: pause and define the minimum signal that would confirm this feature is worth building. A user interview, a feature request count, a survey question, or behavioral data from existing usage. The cost of a short validation step is always lower than the cost of shipping an unvalidated feature and finding out it doesn\'t get used.', descBase: '' },
  ],
  L2: [
    { option: 'What user signal do you have that this feature is worth building? A request, observation, or research data — any concrete signal reduces the build risk.', descBase: '' },
    { option: 'Minimum validation: can you point to one user who said they need this, or behavioral data showing they struggle without it?', descBase: '' },
  ],
  L3: [
    { option: 'Pause to validate with at least one real user before committing to this build.', descBase: '' },
  ],
};

export const ABSENCE_OUTCOME_DEFINITION_CASUAL: DecisionContent = {
  question: 'What does success look like for this feature?',
  pinchFallback: 'Define the success metric before building starts.',
  L1: [
    { option: 'An output is something you ship. An outcome is the change in user behavior that justifies shipping it. The OKR discipline applied to product: before building, write one sentence that completes "This feature is successful if...". Without that sentence, you can\'t evaluate whether the feature worked, you can\'t communicate success criteria to teammates, and you can\'t decide when the feature is done enough to ship.', descBase: '' },
    { option: 'Write the success metric for this feature in observable form: name the user behaviour or system metric, the threshold that defines success, and the timeframe — e.g. "feature is used at least once by 40% of active users in the first month" — then state whether the current build can be evaluated against it.', descBase: '' },
    { option: 'Use the outcome definition as a scope filter: list every addition currently in this feature, evaluate each against the success metric, and flag any that do not contribute to hitting it for removal or deferral.', descBase: '' },
  ],
  L2: [
    { option: 'Finish this sentence before coding: "This feature succeeds if X happens for Y users within Z timeframe." Without this, you can\'t measure whether the feature worked.', descBase: '' },
    { option: 'What\'s the one metric that would tell you, 30 days after shipping, whether this feature justified the engineering time?', descBase: '' },
  ],
  L3: [
    { option: 'Define the success metric now — the observable outcome that tells you the feature worked.', descBase: '' },
  ],
};

export const ABSENCE_FEATURE_PRIORITIZATION_CASUAL: DecisionContent = {
  question: 'Why is this the highest-priority thing to build right now?',
  pinchFallback: 'Confirm this is the highest-impact item before building.',
  L1: [
    { option: 'Building what comes to mind next — rather than what has the highest impact — is the feature factory pattern. Every hour of engineering time spent on a lower-impact feature is an hour not spent on a higher-impact one. Backlog prioritization question: what evidence suggests this feature delivers more value to users than any alternative you could build with the same engineering time?', descBase: '' },
    { option: 'A useful prioritization heuristic: impact-effort scoring. Impact = estimated positive change in a key metric if this ships. Effort = engineering days to implement. Highest impact-to-effort ratio wins. You don\'t need a formal matrix — a quick mental comparison against 2-3 alternatives is enough. The question is: is there a feature you\'re not building that would deliver more value for less effort?', descBase: '' },
    { option: 'State the explicit priority rationale for this feature in one sentence — why this over the alternatives — and name the next-highest-priority alternative that is being deferred. If no rationale exists beyond "it seemed like a good idea," draft one now or pause the build.', descBase: '' },
  ],
  L2: [
    { option: 'Name the top 2 alternatives you\'re not building right now. Is this feature higher impact-to-effort than either of them? If yes, the prioritization is justified.', descBase: '' },
    { option: 'What\'s the user/business impact of NOT building this feature, vs. NOT building the next highest-priority alternative?', descBase: '' },
  ],
  L3: [
    { option: 'Confirm explicit prioritization rationale before starting — impact vs. alternatives.', descBase: '' },
  ],
};

export const ABSENCE_USER_PERSONA_CLARITY_CASUAL: DecisionContent = {
  question: 'Who specifically is this feature for?',
  pinchFallback: 'Name the specific user this feature is designed for.',
  L1: [
    { option: 'Name the specific user this feature serves: 2 sentences describing who they are, what context they use the product in, and what they are trying to accomplish — concrete enough that a design decision can be tested against "would Marcus understand this?" rather than "would users in general?"', descBase: '' },
    { option: 'Write a 2-sentence persona description for this feature\'s primary user — who they are, their context, and what they are trying to do — then check every recent design decision against that persona and flag any that serve "users in general" instead.', descBase: '' },
    { option: 'Define the target user for this feature in one sentence, then re-check the feature scope: list any request, addition, or behaviour that does not serve that user and propose removing or deferring it.', descBase: '' },
  ],
  L2: [
    { option: 'Name the specific user type this feature is for — 2 sentences about who they are and what they\'re trying to do. "For users" isn\'t an answer.', descBase: '' },
    { option: 'If you had to describe the one person who would get the most value from this feature, who would it be? Build for that person explicitly.', descBase: '' },
  ],
  L3: [
    { option: 'Name the specific user type this feature is designed for before making build decisions.', descBase: '' },
  ],
};

export const ABSENCE_COMPETITIVE_AWARENESS_CASUAL: DecisionContent = {
  question: 'Have you checked how competitors handle this?',
  pinchFallback: 'Run a quick competitive check before committing to this build.',
  L1: [
    { option: 'Building a feature without knowing the competitive landscape means you\'re solving a problem that may already be solved — possibly better than you\'ll solve it. Before committing to any non-trivial feature, answer three questions: does a competitor already have this? If yes, how have they implemented it? And what would make your version a reason to switch rather than a reason to stay with the incumbent?', descBase: '' },
    { option: 'Classify this feature as table stakes (required to compete), a differentiator (reason to switch), or irrelevant to user comparison — then state the implementation implication: polish parity, a clear wedge, or do not build. Confirm the current build matches the classification.', descBase: '' },
    { option: 'Run a 20-minute competitive audit: list the top 2-3 competitor implementations of this feature, summarize what each got right and wrong, and propose the specific differentiation angle this build will use. If no differentiation is identified, propose what would need to change.', descBase: '' },
  ],
  L2: [
    { option: 'What do the top 2 competitors do for this feature? And what would make your version a reason to choose you over them?', descBase: '' },
    { option: 'Is this feature table stakes, a differentiator, or something users don\'t compare? That classification should drive the implementation approach.', descBase: '' },
  ],
  L3: [
    { option: 'Run a quick competitive audit before building — check how competitors solve this and where you differentiate.', descBase: '' },
  ],
};

export const ABSENCE_MVP_BOUNDARY_DISCIPLINE_CASUAL: DecisionContent = {
  question: 'Is this addition within MVP scope?',
  pinchFallback: 'Check whether this is needed to test the core hypothesis.',
  L1: [
    { option: 'Apply MVP discipline to this addition: name the riskiest hypothesis the MVP is meant to test, then state whether this addition reduces uncertainty about that hypothesis. If it does not, propose deferring it to post-validation scope.', descBase: '' },
    { option: 'The discipline question for every addition: does this help test what we\'re trying to learn, or does it just make the product feel more complete? "Feel more complete" is the scope creep justification. If the feature doesn\'t reduce the uncertainty about whether the core hypothesis is true, it\'s out of MVP scope — not permanently, just for this phase. Ship the minimum, learn, then add.', descBase: '' },
    { option: 'Common MVP scope creep patterns: "nice to have" additions that don\'t affect hypothesis testing, polish passes that go beyond the minimum for usability, and "while we\'re in this area" additions. All three delay the learning loop without increasing its quality. Define the scope boundary explicitly: list the features that are in-hypothesis-scope and treat everything else as post-validation work.', descBase: '' },
  ],
  L2: [
    { option: 'Does this addition help test the core hypothesis, or does it just make the product feel more complete? If the latter, it\'s out of MVP scope for now.', descBase: '' },
    { option: 'What is the minimum set of features needed to get a real answer on the riskiest hypothesis? Is the current scope still within that minimum?', descBase: '' },
  ],
  L3: [
    { option: 'Check MVP scope — only include what\'s needed to test the core hypothesis, defer the rest.', descBase: '' },
  ],
};

export const ABSENCE_USER_ACQUISITION_CONSIDERATION_CASUAL: DecisionContent = {
  question: 'How will target users find and access this feature?',
  pinchFallback: 'Define the acquisition path before building.',
  L1: [
    { option: 'A feature\'s value is zero for any user who never encounters it. Distribution fit is as important as product-market fit — and it has to be designed in, not discovered after launch. Before committing to a feature build, answer: what is the specific path through which target users will find and start using this feature? SEO, referral loop, in-app discovery, sharing mechanic, onboarding hook, community post — name the channel.', descBase: '' },
    { option: 'Name the specific acquisition mechanic for this feature — built-in sharing, referral hook, SEO surface, in-app discovery, onboarding placement — then confirm the implementation actually supports that mechanic. If the channel and the build are misaligned, flag what needs to change.', descBase: '' },
    { option: 'Write the acquisition-path sentence for this feature in the exact form: "Users reach this via [channel], and the first time they see it they are shown [first-encounter UX]." If either bracket is empty, propose what would fill it before more is built.', descBase: '' },
  ],
  L2: [
    { option: 'Name the specific acquisition path: how do target users find out this feature exists, and how do they reach it for the first time?', descBase: '' },
    { option: 'Is the acquisition mechanic built into the feature, or does it rely on users discovering it organically? Distribution-by-design vs. distribution-by-hope.', descBase: '' },
  ],
  L3: [
    { option: 'Define the acquisition path before building — name how target users will find and reach this feature.', descBase: '' },
  ],
};

export const ABSENCE_RETENTION_MECHANISM_CHECK_CASUAL: DecisionContent = {
  question: 'How does this feature bring users back?',
  pinchFallback: 'Consider the retention angle before building.',
  L1: [
    { option: 'Features that acquire users but don\'t retain them have diminishing returns forever. Every significant feature should have an answer to: why does a user return to this feature after the first use, and how does using it once make the next use more likely? Without a retention angle, you\'re building acquisition features, not engagement features.', descBase: '' },
    { option: 'Pick one of three retention mechanics for this feature and confirm it is built in: (1) it saves something users want to return to, (2) it creates a loop where one session\'s output is the next session\'s input, or (3) it connects users to other users. Name the chosen mechanic and where it lives in the current build, or propose what to add.', descBase: '' },
    { option: 'Nir Eyal\'s Hook model: trigger → action → reward → investment. "Investment" is what makes the next trigger more effective — the user puts something into the product (data, preferences, connections, history) that increases the value of returning. Every feature should have an answer for what the "investment" is. If there isn\'t one, the feature has no retention loop.', descBase: '' },
  ],
  L2: [
    { option: 'What\'s the retention mechanic for this feature — what makes a user come back after the first use, and what makes returning more valuable than the first visit?', descBase: '' },
    { option: 'Does using this feature once make the next use more likely? If not, it\'s a one-visit feature — which may be fine, but should be an explicit design choice.', descBase: '' },
  ],
  L3: [
    { option: 'Define the retention angle now — what brings users back to this feature after the first use.', descBase: '' },
  ],
};

export const ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT_CASUAL: DecisionContent = {
  question: 'How will you know if this feature is working after you ship it?',
  pinchFallback: 'Add a feedback mechanism before shipping.',
  L1: [
    { option: 'Shipping without a way to measure whether the feature worked means the engineering investment produces no validated learning. The Lean Startup loop: Build → Measure → Learn. Skipping the Measure step after Build means the loop stops at the most expensive point and never produces the insight that informs the next build. Define your measurement mechanism before shipping, not after.', descBase: '' },
    { option: 'Specify the minimum viable feedback set for this feature: name the analytics event that fires on use, the user-feedback channel (in-product or support), and the indicator that ties to the defined success metric. Confirm each is in place or list what needs adding before shipping.', descBase: '' },
    { option: 'Common shipping patterns that break the feedback loop: shipping with no analytics instrumentation, shipping with analytics but no defined success threshold, and shipping with a metric but no scheduled review. All three mean the feature will run for weeks without producing a learning decision. Define the mechanism, the metric, and the review date before the code ships.', descBase: '' },
  ],
  L2: [
    { option: 'Name the feedback mechanism: what data will tell you whether this feature is being used, and what will tell you whether it\'s solving the problem it was built for?', descBase: '' },
    { option: 'When will you review the data, and what will you do if the feature isn\'t hitting the success metric you defined?', descBase: '' },
  ],
  L3: [
    { option: 'Add a feedback mechanism before shipping — analytics event, success metric, and review date.', descBase: '' },
  ],
};

export const ABSENCE_HYPOTHESIS_BEFORE_BUILD_CASUAL: DecisionContent = {
  question: 'What hypothesis does this feature test?',
  pinchFallback: 'Define the hypothesis before starting the build.',
  L1: [
    { option: 'Write the experiment hypothesis for this feature in the form: "We believe [feature/change] will cause [observable outcome] for [user type]. We will know this is true when [signal] appears within [timeframe]." If any bracket cannot be filled, propose what data or decision would resolve it before continuing.', descBase: '' },
    { option: 'The hypothesis doesn\'t have to be certain — it has to be falsifiable. "Users will use the export feature at least once per week" is falsifiable. "Users will find this useful" is not. The falsifiability test: after shipping, can you look at a single data point and say definitively whether the hypothesis was proven or disproven? If not, refine the hypothesis until you can.', descBase: '' },
    { option: 'State the falsification condition for this feature\'s hypothesis: what specific data point, observed within the success window, would prove the hypothesis wrong? Commit to that condition now — and use it as the post-ship review trigger.', descBase: '' },
  ],
  L2: [
    { option: 'Complete this before coding: "We believe [this feature] will [achieve outcome] for [user type]. We will know this is true when [observable signal]."', descBase: '' },
    { option: 'What would tell you this experiment failed? If you can\'t name a failure condition, the hypothesis isn\'t specific enough to be falsifiable.', descBase: '' },
  ],
  L3: [
    { option: 'Define the hypothesis now — what outcome does this feature test, and how will you know if it worked?', descBase: '' },
  ],
};

export const ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE_CASUAL: DecisionContent = {
  question: 'When did you last check product direction — not just implementation?',
  pinchFallback: 'Take a product perspective before continuing to build.',
  L1: [
    { option: 'Pause implementation and run a product-direction check: count the last 10-15 prompts by category (implementation instructions vs product-direction questions). If heavily skewed to implementation, answer one product question before continuing — is this still the right feature to be building for the right user toward the right outcome?', descBase: '' },
    { option: 'A useful ratio check: in the last 10-15 prompts, how many were implementation instructions ("build this", "add this", "fix this") vs. product-direction questions ("should we build this at all", "is this the right user experience", "does this move our core metric")? Heavy implementation skew is a signal that product thinking has been suspended. Suspend it too long and you optimize the implementation of the wrong feature.', descBase: '' },
    { option: 'Product check questions that take < 5 minutes: Is this feature still the highest-priority thing to build right now? Does the implementation direction still match the product goal? Is there a user I should talk to before the next build decision? Has anything changed about the problem I\'m solving? These questions don\'t interrupt implementation — they protect it from building in the wrong direction.', descBase: '' },
  ],
  L2: [
    { option: 'Pause the implementation for a moment: is the feature you\'re building still the right thing to be building right now, and is the direction still aligned with your product goal?', descBase: '' },
    { option: 'One product-direction question before continuing: is there anything you\'ve learned in the last few sessions that should change what you\'re building or how you\'re building it?', descBase: '' },
  ],
  L3: [
    { option: 'Take a product-direction check before continuing to build — not just what, but whether.', descBase: '' },
  ],
};

export const ABSENCE_NORTH_STAR_ALIGNMENT_CASUAL: DecisionContent = {
  question: 'How does this feature connect to your product\'s core metric?',
  pinchFallback: 'Check north star alignment before adding this feature.',
  L1: [
    { option: 'Trace this feature to the product\'s north star metric in one or two steps: state how it moves the metric directly, or how it enables a downstream feature that does. If no traceable connection exists, propose deferring or removing it.', descBase: '' },
    { option: 'Articulate the north star connection for this feature: name the metric, name the chain of cause-and-effect from this feature to the metric (one or two intermediate steps allowed), and confirm the chain holds. If it does not, flag the feature as candidate for scope removal.', descBase: '' },
    { option: 'Apply the north star filter to this feature\'s scope: if the feature does not connect to the north star directly or via one intermediate step, decide whether it belongs in a later phase, belongs as foundation for a north-star feature still to come, or should be cut from this scope entirely.', descBase: '' },
  ],
  L2: [
    { option: 'In one sentence: how does this feature move your north star metric? Direct path, or via which intermediate effect?', descBase: '' },
    { option: 'If this feature has no traceable connection to your north star, is it a foundation for features that will, or is it scope inflation?', descBase: '' },
  ],
  L3: [
    { option: 'Articulate the north star connection before building — direct or indirect, but traceable.', descBase: '' },
  ],
};

// ── Phase 6 E4-E6 — indie_hacker role CASUAL content ─────────────────────────

export const ABSENCE_TIME_TO_VALUE_CHECK_CASUAL: DecisionContent = {
  question: 'Is this solution the right size for your current scale?',
  pinchFallback: 'Check whether this complexity is justified at current user count.',
  L1: [
    { option: 'Right-size this solution for current scale: name the current user count, name the simplest technology that solves the problem at that scale (a database query, a single API call, a flat file), and propose using it. Defer infrastructure complexity until scale actually requires it.', descBase: '' },
    { option: 'Apply the 37signals match-current-traffic rule: confirm this solution fits today\'s traffic rather than hoped-for traffic. If you are reaching for a queue, cache, or distributed component before having users, propose the simpler version that will work at current scale and is easily replaceable later.', descBase: '' },
    { option: 'Right-sizing heuristic: if a simple database query, a single API call, or a flat file solves the problem — and you\'re reaching for a queue system, caching layer, or distributed component — ask whether your current user count justifies the complexity. "Not yet but it will eventually" is the premature optimization justification. Build the simple version, ship it, and complicate it when scale actually demands it.', descBase: '' },
  ],
  L2: [
    { option: 'What\'s your current user count, and does the complexity of this solution match that scale? What\'s the simplest version that works for the users you have right now?', descBase: '' },
    { option: 'Could a simpler technology solve the same problem and be easily replaced when scale actually requires the complex version?', descBase: '' },
  ],
  L3: [
    { option: 'Right-size this — build the simplest solution that works for your current scale, not future scale.', descBase: '' },
  ],
};

export const ABSENCE_SHIP_READINESS_DEFINITION_CASUAL: DecisionContent = {
  question: 'What needs to be true for this to be ready to ship?',
  pinchFallback: 'Write ship criteria before continuing to build.',
  L1: [
    { option: 'Write the ship criteria for this build before more is added: list the specific, binary conditions that must be true to ship — "users can sign up", "the core workflow completes end-to-end", etc. This list is your Definition of Done; everything beyond it is post-launch scope.', descBase: '' },
    { option: 'Ship criteria should be binary: each item is objectively true or false. "Users can sign up and complete the core workflow" is a valid ship criterion. "The design feels polished" is not. Criteria that can\'t be evaluated as pass/fail don\'t function as ship gates — they become "not ready yet" justifications that can always be renegotiated. Write criteria you can check off with a yes or a no.', descBase: '' },
    { option: 'A useful constraint: limit your ship criteria to what\'s needed for the first user to get value from the product. Everything beyond that is post-launch scope. Add it to a backlog, not the ship gate. The ship gate is about minimum viable launch, not minimum viable polish.', descBase: '' },
  ],
  L2: [
    { option: 'Write down the ship criteria right now: specific, binary conditions that must be true before you ship. This becomes your launch checklist.', descBase: '' },
    { option: 'Of those criteria, which ones are needed for the first user to get value — and which are "nice to have before launching"? Separate them: one list is the ship gate, the other is a post-launch backlog.', descBase: '' },
  ],
  L3: [
    { option: 'Write explicit ship criteria now — specific, binary. Everything else is post-launch scope.', descBase: '' },
  ],
};

export const ABSENCE_MANUAL_BEFORE_AUTOMATE_CASUAL: DecisionContent = {
  question: 'Have you done this manually to confirm it works before automating?',
  pinchFallback: 'Do it manually first, then automate the proven version.',
  L1: [
    { option: 'Apply Paul Graham\'s "do things that don\'t scale" rule: do this workflow manually for the first users before automating it. Run the process by hand, capture what users actually need vs what you assumed, and only then automate the validated version.', descBase: '' },
    { option: 'The manual-before-automate discipline: do the process manually for the first users, watch what actually happens — what\'s needed, what\'s not, what users ask for that you didn\'t anticipate — then automate the validated version. Every time automation is built for an unvalidated process, there\'s a real chance of needing to rebuild the automation after discovering the manual version was wrong.', descBase: '' },
    { option: 'Questions to ask before automating: have you done this manually at least once? Did it work as expected? Did users respond as expected? If any answer is no — do it manually first. Automation is optimization. Optimization of an unvalidated process is premature spend.', descBase: '' },
  ],
  L2: [
    { option: 'How many times have you done this process manually, and what did you learn that shaped the automation design? If the answer is zero — do it manually first.', descBase: '' },
    { option: 'What would happen if you did this manually for the first 10 users instead of building the automation now? Is there anything you\'d learn that might change how you automate it?', descBase: '' },
  ],
  L3: [
    { option: 'Do this manually first — validate it works for real users before building the automation.', descBase: '' },
  ],
};

export const ABSENCE_TECH_STACK_COMPLEXITY_CHECK_CASUAL: DecisionContent = {
  question: 'Can you maintain this architecture alone, at 2am, when it breaks?',
  pinchFallback: 'Apply the solo maintainability test before adding this complexity.',
  L1: [
    { option: 'Every technology choice for a solo indie project is a choice you\'ll maintain alone — debugging it at 2am, extending it when requirements change, understanding it after 3 months away. Complexity that would be distributed across a team of engineers is complexity a solo builder pays in full. The right lens: "is this the simplest stack I can maintain alone, or is this the most impressive stack I can technically justify?"', descBase: '' },
    { option: 'Run the CV-driven-development check on this stack choice: if the architecture is team-grade complexity for a solo build, propose the simpler stack that solves the same user problem. The user sees the product, not the architecture — choose the stack you can debug alone at 2 a.m.', descBase: '' },
    { option: 'Solo maintainability benchmark: if a production issue hit this system tonight, how long would it take you to find and fix it alone, without documentation? A simpler stack answers that in minutes. A complex one answers it in hours — and that difference is paid by you, every time something breaks. Simpler stack = lower maintenance tax = more time shipping.', descBase: '' },
  ],
  L2: [
    { option: 'What\'s the simplest architecture that solves the same problem? Is the added complexity of this approach worth the increased solo maintenance cost?', descBase: '' },
    { option: 'If this broke in production at midnight, how would you debug it alone? What\'s your mean-time-to-understand for this architecture under pressure?', descBase: '' },
  ],
  L3: [
    { option: 'Apply the solo maintainability test — choose the simplest architecture you can debug alone.', descBase: '' },
  ],
};

export const ABSENCE_LAUNCH_STRATEGY_ABSENCE_CASUAL: DecisionContent = {
  question: 'How are people going to find out this product exists when you launch?',
  pinchFallback: 'Define a launch strategy before getting closer to ship date.',
  L1: [
    { option: 'Shipping without a launch plan means launching into silence. Good products do not attract users by themselves — distribution is a discipline that must be planned and executed, not discovered. The minimum viable launch strategy: name one specific channel where you will announce this product, write the post before launch day, and identify who in your network or community should see it. That\'s a launch plan.', descBase: '' },
    { option: 'Pick one specific launch channel and execute it well: Product Hunt (write the listing and schedule), Hacker News Show HN (draft the post), a targeted subreddit, a niche community, or cold outreach to 5-10 target users. One channel done properly beats five attempted on launch day — name the channel and start the announcement draft now.', descBase: '' },
    { option: 'The launch plan question: when you ship, who specifically is going to see it, and how? If the answer is "people will find it" — that\'s not a plan, that\'s a hope. Name the channel, identify the audience, and write the announcement before you\'re in launch-day mode.', descBase: '' },
  ],
  L2: [
    { option: 'Name the specific channel and the specific audience: where will you announce, and who exactly will see it on launch day?', descBase: '' },
    { option: 'Write the launch announcement draft now — before you need it. It forces clarity on what the product is, who it\'s for, and what makes it worth trying.', descBase: '' },
  ],
  L3: [
    { option: 'Write a launch plan now: one specific channel, one specific audience, one drafted announcement.', descBase: '' },
  ],
};

export const ABSENCE_EARLY_USER_FEEDBACK_CASUAL: DecisionContent = {
  question: 'When did you last get a real user\'s reaction to what you\'re building?',
  pinchFallback: 'Show what you\'ve built to at least one real user before continuing.',
  L1: [
    { option: 'Break out of silo-building before more is built: identify one real user to show the current build to today — for a 10-minute screen-share, a Loom walk-through, or a screenshot review. Capture their actual reaction, not your interpretation, and adjust direction based on what you see.', descBase: '' },
    { option: 'Get rough early feedback before the next polish pass: show 2-3 real users the current build via screenshot, Loom, or live demo — the goal is not approval, it is friction (where they get confused, what they ignore, what they ask about). Capture each piece of friction and decide what to address before continuing.', descBase: '' },
    { option: 'A practical minimum: before finishing any significant feature, show a working or near-working version to one real user and watch them interact with it without explaining anything. What they struggle with, what they don\'t notice, what they ask about — that\'s the feedback that matters. You don\'t need a survey. You need one real person trying to use the thing.', descBase: '' },
  ],
  L2: [
    { option: 'Who can you show the current build state to today — not to get approval, but to watch them use it and see where they get confused or stuck?', descBase: '' },
    { option: 'What\'s the riskiest assumption in your current build? Is there a way to test that assumption with a real user before building further on top of it?', descBase: '' },
  ],
  L3: [
    { option: 'Show this to at least one real user now — watch them use it before building further.', descBase: '' },
  ],
};

export const ABSENCE_SOLO_MAINTAINABILITY_CASUAL: DecisionContent = {
  question: 'Is this addition maintainable by you alone, long-term?',
  pinchFallback: 'Run the solo maintainability check before adding this complexity.',
  L1: [
    { option: 'Every integration, service, or abstraction you add to a solo project is complexity you\'ll maintain alone — debugging it in production, extending it when requirements change, understanding it after weeks away. The solo maintainability question is not "does this work?" but "can I own the full blast radius of this when it breaks, by myself, without help?" If the answer requires reading documentation for 30 minutes every time something goes wrong, the complexity cost is real and ongoing.', descBase: '' },
    { option: 'Apply the solo-tax test before adding this integration: estimate the long-term maintenance cost (debugging, version churn, documentation drift) and compare to the long-term cost of building the simpler equivalent yourself. Adopt only if the maintenance cost is clearly lower.', descBase: '' },
    { option: 'Before adding any new service, integration, or complex abstraction: name the failure mode that\'s most likely to wake you up at 3am. Can you diagnose and fix that failure alone, in under 30 minutes, with the logs you\'ll have available? If not, the complexity is not solo-sustainable.', descBase: '' },
  ],
  L2: [
    { option: 'What\'s the most likely failure mode for this addition, and how long would it take you to diagnose and fix it alone, at night, with no colleagues to ask?', descBase: '' },
    { option: 'Is there a simpler alternative that solves the same problem with lower solo maintenance cost — even if it takes an extra day to build?', descBase: '' },
  ],
  L3: [
    { option: 'Apply the solo maintainability test: can you own the full failure mode of this, alone?', descBase: '' },
  ],
};

export const ABSENCE_DISTRIBUTION_THINKING_CASUAL: DecisionContent = {
  question: 'How will users discover and access this feature?',
  pinchFallback: 'Consider the distribution angle before building this feature.',
  L1: [
    { option: 'Distribution is a design constraint, not a marketing task. Features that assume users will discover them organically are features built on distribution magic. Before building any significant feature, answer: what is the specific path through which a new user discovers this feature exists and reaches it for the first time? The answer shapes the implementation — SEO-friendly URLs, in-product sharing mechanics, referral hooks, and community-compatible output formats are all distribution design, not afterthoughts.', descBase: '' },
    { option: 'The distribution question for indie products: are you relying on existing users to find this (in-product discovery), new users to find the product through this feature (SEO / social sharing), or explicit outreach to get people to try it? Each of these requires a different implementation approach. In-product discovery needs navigation design; SEO requires content structure; social sharing requires a shareable artifact. Choosing the distribution approach before building ensures the feature can actually fulfill it.', descBase: '' },
    { option: 'A minimum distribution consideration: for each feature, name the one most likely way a user first encounters it. Then check whether the current implementation supports that discovery path. If the implementation makes the feature invisible to the intended discovery mechanism, distribution is broken before the feature ships.', descBase: '' },
  ],
  L2: [
    { option: 'Name the specific discovery path for this feature: how does a user who has never seen it find out it exists and reach it?', descBase: '' },
    { option: 'Does the current implementation support that discovery path, or would a user arriving through that channel hit a dead end?', descBase: '' },
  ],
  L3: [
    { option: 'Name the distribution path for this feature before building — how does a user first find it?', descBase: '' },
  ],
};

export const ABSENCE_MONETIZATION_PATH_CLARITY_CASUAL: DecisionContent = {
  question: 'How does this feature connect to how the product makes money?',
  pinchFallback: 'Consider the monetization connection before building this feature.',
  L1: [
    { option: 'Building features without monetization awareness builds a free product by default — regardless of intent. Every significant feature should have an articulated answer to "how does this connect to the revenue model?" It doesn\'t need to be direct: "this is a retention feature that reduces churn, which improves LTV" is a valid connection. "This makes the product better" is not — it\'s the answer that leads to technically excellent, commercially unsustainable products.', descBase: '' },
    { option: 'Revenue model options for indie products: paid tier (freemium gate), usage-based pricing, one-time purchase, SaaS subscription, affiliate revenue, API access tier. For each feature, ask: is this in the free tier (acquisition) or the paid tier (monetization)? If free, why — what acquisition or retention goal does it serve that connects back to paid conversion? If paid, what makes it worth paying for? These questions don\'t slow development — they prevent building the wrong tier.', descBase: '' },
    { option: 'Lock the monetization decision for this feature now, before users learn to expect it for free: place it explicitly in the free tier (and name the acquisition or retention goal it serves) or the paid tier (and name what makes it worth paying for). Document the choice and the rationale.', descBase: '' },
  ],
  L2: [
    { option: 'Is this feature in the free or paid tier? What\'s the explicit reason — acquisition, retention, conversion, or direct revenue?', descBase: '' },
    { option: 'If this feature were behind a paywall, would users pay for it? If not, what would need to change about the feature — or the framing — to make it worth paying for?', descBase: '' },
  ],
  L3: [
    { option: 'Name the monetization connection for this feature before building — free tier or paid, and why.', descBase: '' },
  ],
};

export const ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY_CASUAL: DecisionContent = {
  question: 'Is this a milestone worth sharing publicly?',
  pinchFallback: 'Consider sharing this milestone publicly before moving to the next.',
  L1: [
    { option: 'Share this milestone publicly today before continuing: draft a short post (tweet, Loom, community update) describing what you just shipped and what you learned. Audiences built during the build survive launch-day failures; audiences built launch-week do not.', descBase: '' },
    { option: 'Pick the milestone type and write the share: first working core feature, first technical milestone, first 10 users, first revenue, or one specific lesson worth teaching. Draft a one-paragraph post (no polish required) and identify the audience — your followers, a relevant community, or a niche forum.', descBase: '' },
    { option: 'Pick the lowest-friction share format and ship it: a short tweet, a 60-second Loom walk-through, or a one-paragraph forum update. Frequency over polish — consistent presence during the build is what compounds into a launch-day audience.', descBase: '' },
  ],
  L2: [
    { option: 'What\'s the simplest format to share this milestone today — a tweet, a short post, a screen share? Who specifically should see it?', descBase: '' },
    { option: 'What did you learn building this that another indie hacker would find useful? That\'s the post. Share the process, not just the output.', descBase: '' },
  ],
  L3: [
    { option: 'Share this milestone publicly now — a short post about what you built and what you learned.', descBase: '' },
  ],
};

export const ABSENCE_SCOPE_VS_TIME_CHECK_CASUAL: DecisionContent = {
  question: 'Is the current scope still within your available time and energy?',
  pinchFallback: 'Run a scope-vs-time check before adding more to the build.',
  L1: [
    { option: 'Run the scope-vs-time check on this build before more is added: name the current scope, estimate the shipping date at current pace, and compare to the original target. If the date has slipped twice in a row, cut scope to fit the original timeline — list specifically what gets deferred to post-launch.', descBase: '' },
    { option: 'Time-box check: at the current scope, how long will it take to ship something a real user can use? If the answer is "a few more weeks" and it was "a few more weeks" last session too — scope has grown past the original timeline without acknowledgment. The fix is not to work faster; it\'s to cut scope to fit the original timeline, not to extend the timeline to fit the expanded scope.', descBase: '' },
    { option: 'A useful constraint: define the minimum version that\'s still shippable given the time you have available this week or this month. Everything beyond that goes to a post-launch backlog. The constraint is productive: it forces the prioritization decision that scope expansion defers indefinitely.', descBase: '' },
  ],
  L2: [
    { option: 'At current scope, when will you ship something a real user can actually use? If that date keeps moving, scope has grown past the timeline — cut something.', descBase: '' },
    { option: 'What\'s the minimum version that\'s shippable in your available time this week/month? What specifically gets cut to reach that minimum?', descBase: '' },
  ],
  L3: [
    { option: 'Cut scope to fit available time — define the minimum shippable version for this week/month.', descBase: '' },
  ],
};

// ── Phase 6 E7-E9 — pm role FORMAL content ───────────────────────────────────

export const ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_FORMAL: DecisionContent = {
  question: 'Are acceptance criteria defined for this story before development begins?',
  pinchFallback: 'Define acceptance criteria for this story before starting implementation.',
  L1: [
    { option: 'Write the acceptance criteria for this story before any implementation prompt: state each criterion as an independently verifiable condition, in Given/When/Then or "this is done when [X]" form. List at least three covering the primary scenario and the most likely edge case.', descBase: '' },
    { option: 'Apply the INVEST testability rule to this story\'s acceptance criteria: for each criterion, confirm a tester could write a test case from it. Rewrite any criterion that is too vague to be testable — use Given/When/Then or completion-condition form.', descBase: '' },
    { option: 'Before writing any implementation prompt: name the acceptance criteria. One sentence minimum: "This is done when [condition]." This 30-second discipline prevents the most expensive rework scenario: building the wrong thing correctly.', descBase: '' },
  ],
  L2: [
    { option: 'Write the acceptance criteria now, in Given/When/Then or completion-condition format, before starting the implementation prompt.', descBase: '' },
    { option: 'What is the explicit condition that would cause you to reject this story at demo? That condition IS the acceptance criteria.', descBase: '' },
  ],
  L3: [
    { option: 'State the acceptance criteria — "this is done when [condition]" — before any implementation.', descBase: '' },
  ],
};

export const ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_FORMAL: DecisionContent = {
  question: 'Have relevant stakeholders been aligned on this feature before development begins?',
  pinchFallback: 'Verify stakeholder alignment before proceeding with significant development work.',
  L1: [
    { option: 'Identify every stakeholder with a legitimate opinion on this feature, name the alignment touchpoint required for each (sign-off, design review, security review, eng-lead consult), and confirm each is completed or scheduled before implementation begins. Document the date and outcome.', descBase: '' },
    { option: 'Run a 15-minute stakeholder alignment pass for this feature before implementation: list the stakeholders, send the alignment request, capture responses, and document the result in the sprint item. State explicitly any assumption being made about a stakeholder\'s position.', descBase: '' },
    { option: 'Alignment threshold: not every feature requires formal sign-off. The question is: who has a legitimate opinion about this feature that, if unvalidated, could cause rejection at demo? If the answer is "anyone," alignment before development is required. Document who was aligned and when.', descBase: '' },
  ],
  L2: [
    { option: 'Who has a legitimate opinion about this feature that could cause rework if not validated? Contact them before writing the first implementation prompt.', descBase: '' },
    { option: 'What assumption about stakeholder expectations is embedded in this feature? Validate the assumption before coding it in.', descBase: '' },
  ],
  L3: [
    { option: 'Identify and align the relevant stakeholder for this feature before beginning implementation.', descBase: '' },
  ],
};

export const ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_FORMAL: DecisionContent = {
  question: 'Are there ambiguous quality attributes in these requirements that need a measurable definition?',
  pinchFallback: 'Resolve ambiguous quality attributes to measurable criteria before implementation.',
  L1: [
    { option: 'Audit this feature\'s requirements for ambiguity: identify every quality-attribute placeholder ("better", "faster", "improved", "user-friendly") and replace each with a measurable target — name the metric, the measurement method, and the success threshold.', descBase: '' },
    { option: 'Convert every ambiguous phrase in this requirement set to a measurable equivalent before implementation begins. Example: "faster" → "API p95 response time under 200 ms"; "intuitive" → "primary task completed by a new user in under 90 seconds without help." List the rewrites.', descBase: '' },
    { option: 'Apply SMART to every quality attribute in this feature\'s requirements: confirm each is Specific, Measurable, Achievable, Relevant, Time-bound. Reject or rewrite any criterion that does not pass all five before development starts.', descBase: '' },
  ],
  L2: [
    { option: 'Replace each quality attribute placeholder ("better," "faster," "improved") with a specific, measurable target. State the measurement method and success threshold.', descBase: '' },
    { option: 'What is the testable condition that would prove this requirement is met? Write it before building toward it.', descBase: '' },
  ],
  L3: [
    { option: 'Define a measurable acceptance target for every quality attribute before starting implementation.', descBase: '' },
  ],
};

export const ABSENCE_DEPENDENCY_MAPPING_FORMAL: DecisionContent = {
  question: 'Have upstream and downstream dependencies for this work been identified before starting?',
  pinchFallback: 'Map dependencies before beginning this work to prevent blocked integration.',
  L1: [
    { option: 'Dependency identification is a foundational project management discipline (WBS, critical path method). Before any work begins: what does this work depend on (upstream), and what depends on this work completing (downstream)? Unmapped upstream dependencies create blocked work discovered mid-sprint; unmapped downstream dependencies create integration surprises at the worst time — when another team has built against an unstated assumption.', descBase: '' },
    { option: 'Classify every dependency for this work item: technical, team, external, or knowledge. For each, name the specific dependency, its current status, and the resolution path (coordination, timeline negotiation, decision needed). Flag the longest-resolution dependency for immediate attention.', descBase: '' },
    { option: 'Run the 30-minute dependency-mapping conversation now for this work item: convene the relevant teams, list upstream and downstream items, capture each in the sprint item with owner and resolution date. The alternative is the 2-5× recovery cost when a dependency surfaces mid-sprint — pre-empt it.', descBase: '' },
  ],
  L2: [
    { option: 'List all upstream dependencies (what this work requires to proceed) and downstream impacts (what depends on this work completing). Who needs to be notified?', descBase: '' },
    { option: 'Which of these dependencies are currently unresolved? What specific action is needed before development can safely begin?', descBase: '' },
  ],
  L3: [
    { option: 'Map all upstream and downstream dependencies for this work item before the first implementation prompt.', descBase: '' },
  ],
};

export const ABSENCE_DEFINITION_OF_DONE_FORMAL: DecisionContent = {
  question: 'Is there an explicit Definition of Done for this sprint item?',
  pinchFallback: 'Define the completion criteria for this item before starting work.',
  L1: [
    { option: 'Write the Definition of Done for this sprint item before work begins: state the functional condition, the quality gate (testing or review pass), the documentation requirement, and the target deployment state. Use the form "this item is done when [X] AND [Y]."', descBase: '' },
    { option: 'Compose this item\'s DoD with all four required elements: (1) functional acceptance — what the system should do, (2) quality gate — what testing or review must pass, (3) documentation requirement, (4) deployment state. Address or explicitly exclude each before development starts.', descBase: '' },
    { option: 'Write the one-line DoD for this item now: "This item is done when [functional condition] AND [quality gate]." Add it to the sprint item — a one-line DoD prevents the sprint-review debate over whether work is finished.', descBase: '' },
  ],
  L2: [
    { option: 'Write the Definition of Done for this item now — "this is done when [condition]." State both the functional condition and the quality gate.', descBase: '' },
    { option: 'What would cause you to reject this item at sprint review? That rejection condition IS the Definition of Done.', descBase: '' },
  ],
  L3: [
    { option: 'State the Definition of Done — "this is done when [condition]" — before any work begins.', descBase: '' },
  ],
};

export const ABSENCE_CROSS_TEAM_IMPACT_CHECK_FORMAL: DecisionContent = {
  question: 'Have teams affected by this change been notified before development begins?',
  pinchFallback: 'Identify and notify affected teams before building this change to shared systems.',
  L1: [
    { option: 'Identify every team affected by this change to a shared system (API, schema, infrastructure), draft the notification message, send it, and document delivery in the sprint item before implementation begins. A pre-change Slack message costs minutes; a post-change broken integration costs team-days.', descBase: '' },
    { option: 'Classify this shared-system change by impact category — API contract, database schema, shared service behaviour, infrastructure — then route the notification to the affected consumers for each category. Confirm each team has received and acknowledged the change before this work proceeds.', descBase: '' },
    { option: 'Minimum notification standard: before building any change to a shared system, name the affected teams, send a notification, and document that notification in the sprint item. "Notified Team X on [date] — no blocking concerns raised" is sufficient. The documentation creates accountability and a paper trail for sprint retrospectives.', descBase: '' },
  ],
  L2: [
    { option: 'List the teams affected by this change. Send them a notification before writing the first implementation prompt. Document who was notified.', descBase: '' },
    { option: 'What would break in another team\'s work if this change deployed without warning? That team needs notification before you begin.', descBase: '' },
  ],
  L3: [
    { option: 'Notify all affected teams of this shared-system change before starting implementation.', descBase: '' },
  ],
};

export const ABSENCE_SUCCESS_METRIC_DEFINITION_FORMAL: DecisionContent = {
  question: 'Is there a success metric defined for this feature before development begins?',
  pinchFallback: 'Define how success will be measured for this feature before starting implementation.',
  L1: [
    { option: 'Define the success metric for this feature before development: name the metric, the measurement method, the success threshold, and the measurement timeline — e.g. "feature adoption rate, tracked via feature_used analytics event, threshold 30% of active users within 30 days." Add to the sprint item.', descBase: '' },
    { option: 'Success metric format: name the metric, the measurement method, the success threshold, and the measurement timeline. Example: "Success metric: feature adoption rate. Method: track feature_used events in analytics. Threshold: 30% of active users within 30 days of launch. Timeline: 60-day measurement window." A metric without a threshold is not a metric — it\'s an observation. A metric without a timeline is not actionable.', descBase: '' },
    { option: 'Confirm the three pre-ship functions of this feature\'s success metric are in place: (1) team alignment on what value the feature delivers, (2) the basis for the post-ship retrospective, (3) the forcing question — "if we cannot measure success, should we build this at all?" Resolve any of the three that is missing.', descBase: '' },
  ],
  L2: [
    { option: 'Define the success metric now: name the metric, measurement method, success threshold, and measurement timeline. Write it in the sprint item before coding begins.', descBase: '' },
    { option: 'If this feature shipped tomorrow and no one used it, would we know? If not, the success metric is missing — define it now.', descBase: '' },
  ],
  L3: [
    { option: 'State the success metric, threshold, and measurement timeline before any implementation work.', descBase: '' },
  ],
};

export const ABSENCE_PRIORITY_JUSTIFICATION_FORMAL: DecisionContent = {
  question: 'Is there an explicit justification for why this item is the current highest priority?',
  pinchFallback: 'Articulate the priority justification for this item before beginning work.',
  L1: [
    { option: 'State the priority justification for this sprint item in one sentence before development begins: name the user or business value, the urgency or time criticality, the risk reduction or strategic alignment — and the next-highest-priority alternative being deferred to make room for this item.', descBase: '' },
    { option: 'Priority justification components: user or business value (who benefits and how much?); urgency or time criticality (does delay reduce value?); risk reduction (does doing this now prevent a future problem?); effort estimate (relative cost). WSJF combines these: (Value + Time Criticality + Risk Reduction) / Effort. The formula is less important than the discipline — before committing to any item, articulate why this item over the alternatives.', descBase: '' },
    { option: 'One-sentence priority justification minimum: "This item is highest priority because [specific reason — user impact / time constraint / risk / strategic alignment]." This 30-second discipline makes backlog prioritization decisions explicit, reversible, and legible to the team. It prevents the silent drift toward whatever is easiest.', descBase: '' },
  ],
  L2: [
    { option: 'State the priority justification for this item in one sentence: why this item over the next item in the backlog? Name the specific reason.', descBase: '' },
    { option: 'What would be lost if this item were pushed to the next sprint? If the answer is "nothing significant," it may not be the highest priority item.', descBase: '' },
  ],
  L3: [
    { option: 'Justify this item\'s priority before starting: why this item now, over the alternatives?', descBase: '' },
  ],
};

export const ABSENCE_USER_STORY_COMPLETENESS_FORMAL: DecisionContent = {
  question: 'Is this work item expressed as a complete user story with who, what, and why?',
  pinchFallback: 'Reframe this work item as a user story — who benefits, what they need, why it matters.',
  L1: [
    { option: 'Rewrite this work item in Connextra format before implementation: "As a [specific user type], I want [the capability this feature enables], so that [the value or outcome delivered]." If the "so that" cannot be completed, that is the most important thing to resolve — propose what stakeholder conversation closes it.', descBase: '' },
    { option: 'For this user story, validate the proposed implementation approach against the "so that" clause: does the chosen approach deliver the stated value, or does it deliver a technically-correct artifact that misses the outcome? Propose adjustments if the latter.', descBase: '' },
    { option: 'Reframe now: "As a [specific user type], I want [the action this feature enables], so that [the outcome they can achieve]." If you cannot complete the "so that," the feature\'s value is not yet understood — and that is the most important thing to resolve before implementation begins.', descBase: '' },
  ],
  L2: [
    { option: 'Complete the user story template: "As a [user type], I want [action], so that [value]." If the "so that" is unclear, that is what to resolve before building.', descBase: '' },
    { option: 'Who specifically benefits from this feature? What outcome does it enable for them? That is the user story — write it before writing the implementation prompt.', descBase: '' },
  ],
  L3: [
    { option: 'Write the full user story — who/what/why — before any implementation begins.', descBase: '' },
  ],
};

export const ABSENCE_RISK_FLAG_FORMAL: DecisionContent = {
  question: 'Have risks been identified for this decision or scope change before proceeding?',
  pinchFallback: 'Identify and document risks before proceeding with this significant decision.',
  L1: [
    { option: 'Identify the risks for this decision before proceeding: for each risk category (technical, scope, stakeholder, dependency, timeline), name the specific risk, estimate likelihood (H/M/L) and impact (H/M/L), and state the mitigation or acceptance decision. Document each in the sprint item.', descBase: '' },
    { option: 'Risk categories relevant to PM + AI development: technical risk (the implementation approach may not work as designed or may have performance characteristics that break under load); scope risk (the feature may be more complex than the current estimate); stakeholder risk (a decision-maker may reject the direction at demo); dependency risk (an upstream team or external service may not deliver on time); timeline risk (effort estimates may be wrong). Each category should be briefly evaluated before proceeding.', descBase: '' },
    { option: 'Risk naming format: "[Risk]: [description] — [likelihood: H/M/L] — [impact: H/M/L] — [mitigation: action or accepted]." A one-sentence risk identification is better than no identification. It converts an assumption into a monitored uncertainty, which is the prerequisite for doing anything about it.', descBase: '' },
  ],
  L2: [
    { option: 'Name the risks for this decision before proceeding: what could go wrong, how likely, what the impact is, and whether there is a mitigation or it is accepted.', descBase: '' },
    { option: 'What assumption embedded in this decision, if wrong, would cause the most damage? That assumption IS the risk. Name it before committing to the decision.', descBase: '' },
  ],
  L3: [
    { option: 'Identify and document risks before proceeding — what could go wrong and how it would be mitigated.', descBase: '' },
  ],
};

export const ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_FORMAL: DecisionContent = {
  question: 'Has the impact of this scope change on the current sprint been assessed?',
  pinchFallback: 'Assess sprint impact before accepting this scope change.',
  L1: [
    { option: 'Before accepting this mid-sprint scope change, complete the four-point impact assessment: (1) what existing in-progress item is displaced, (2) does the sprint end date shift, (3) which downstream teams have a date dependency on what this change affects, (4) what is explicitly removed or deferred to make room. Document all four answers in the sprint item before the change enters scope.', descBase: '' },
    { option: 'Four-point impact assessment for any mid-sprint scope change: (1) Timeline impact — does this change the sprint end date? (2) In-progress item impact — what currently in-flight work is affected or displaced? (3) Downstream dependency impact — do other teams have a date dependency on something this change affects? (4) Trade-off decision — what is explicitly removed or deferred to make room for this change? All four must be answered before the change enters the sprint.', descBase: '' },
    { option: 'Scope change governance minimum: "Accepting [change X]. Impact: [timeline +N days / no change]. Displaces: [item Y — deferred to next sprint]. Downstream: [Team Z notified / no downstream impact]. Trade-off: [accepted — deferred item Y is lower priority]." This 60-second assessment prevents sprint failure and creates a paper trail for the retrospective.', descBase: '' },
  ],
  L2: [
    { option: 'Before accepting this scope change: what does it displace, does it affect the sprint end date, and are downstream teams impacted? Answer all three before committing.', descBase: '' },
    { option: 'What is being removed or deferred to make room for this change? If nothing is being removed, the sprint commitment has just expanded without capacity expanding.', descBase: '' },
  ],
  L3: [
    { option: 'Complete the four-point impact assessment before accepting this scope change into the sprint.', descBase: '' },
  ],
};

export const ABSENCE_RETROSPECTIVE_HABIT_FORMAL: DecisionContent = {
  question: 'Has this sprint or iteration been closed with a retrospective before starting the next?',
  pinchFallback: 'Run a retrospective on this sprint before moving to the next cycle.',
  L1: [
    { option: 'Run the sprint retrospective now before the next sprint begins: list what went well (preserve and reinforce), what did not go well (process problems without blame), and one or two specific, actionable process changes to try in the next sprint. Document the chosen action items.', descBase: '' },
    { option: 'Structure the retrospective in three parts: (1) what went well — name 2-3 practices to preserve, (2) what did not go well — name 2-3 process problems, (3) what to try next sprint — commit to one or two specific changes. Capture the commitments in the sprint board.', descBase: '' },
    { option: 'Draft the retrospective action items as specific, executable commitments — not platitudes. Reject "we should communicate better"; accept "we will use a shared Slack channel for async decisions, starting next sprint." Write 1-2 such commitments and assign owners.', descBase: '' },
  ],
  L2: [
    { option: 'Before starting the next sprint: run the retrospective — what went well, what didn\'t, and one specific process change to try next cycle. Document the action item.', descBase: '' },
    { option: 'What process mistake from this sprint, if not addressed now, will definitely repeat in the next sprint? That is the retrospective topic.', descBase: '' },
  ],
  L3: [
    { option: 'Run the sprint retrospective now — what went well, what didn\'t, one process change for next sprint.', descBase: '' },
  ],
};

// ── Phase 7 F1-F2 — session-quality signals (CASUAL register) ─────────────────

export const ABSENCE_DECISION_FATIGUE_PATTERN_CASUAL: DecisionContent = {
  question:      'Long acceptance streak — applied critical review recently?',
  pinchFallback: 'Streak alert.',
  L1: [
    { option: 'Review the last few AI responses critically — especially for edge cases, hidden assumptions, and anything that was accepted without being read carefully.', descBase: '' },
    { option: 'Push back on the last significant AI suggestion: what would you question if you were reviewing this code rather than writing it?', descBase: '' },
    { option: 'Check recent AI output for anything that looks right at a glance but might fail — edge cases, incorrect assumptions, or logic that was never validated.', descBase: '' },
  ],
  L2: [
    { option: 'Look at the last AI response with fresh eyes — is there anything you would question or verify before continuing?', descBase: '' },
    { option: 'Pick one thing from recent AI output to double-check before the next prompt.', descBase: '' },
  ],
  L3: [
    { option: 'Is there anything in the last AI response worth questioning before continuing?', descBase: '' },
  ],
};

export const ABSENCE_WORK_RHYTHM_CHECK_CASUAL: DecisionContent = {
  question:      'Rapid prompting — verified each response before continuing?',
  pinchFallback: 'Slow down.',
  L1: [
    { option: 'Read and verify the last AI response before continuing — check for anything that looks right at a glance but might be wrong: logic gaps, unchecked edge cases, incomplete error handling.', descBase: '' },
    { option: 'Before the next prompt: read the last response fully, identify anything not yet verified, and confirm the generated code is actually correct.', descBase: '' },
    { option: 'Slow down: read the last AI output in full and check for anything unverified before the next message.', descBase: '' },
  ],
  L2: [
    { option: 'Read the last AI response fully before continuing — has everything been verified?', descBase: '' },
    { option: 'Is there anything in the last response that was accepted without being read carefully?', descBase: '' },
  ],
  L3: [
    { option: 'Read the last response before sending the next message.', descBase: '' },
  ],
};

export const ABSENCE_FOCUS_DRIFT_DETECTION_CASUAL: DecisionContent = {
  question:      'Multiple areas open — completed any end-to-end?',
  pinchFallback: 'Focus drift.',
  L1: [
    { option: 'Finish one thing before starting another: identify what is open right now, pick the most important one, and close it completely before touching anything else.', descBase: '' },
    { option: 'List the open concerns in this session, pick the most critical one, and complete it — resist starting anything new until that one is done.', descBase: '' },
    { option: 'Close one open thread end-to-end before continuing: what is the most important unfinished thing right now?', descBase: '' },
  ],
  L2: [
    { option: 'What is the most important open concern to complete right now, before anything else?', descBase: '' },
    { option: 'Pick one thing to finish completely before starting something new.', descBase: '' },
  ],
  L3: [
    { option: 'Complete one thing before opening another.', descBase: '' },
  ],
};

export const ABSENCE_SESSION_LENGTH_CHECKPOINT_CASUAL: DecisionContent = {
  question:      'Extended session — context checkpoint done?',
  pinchFallback: 'Checkpoint due.',
  L1: [
    { option: 'Drop a context checkpoint before continuing: what has been built, what decisions were made, what is still open, and what the current goal is.', descBase: '' },
    { option: 'Summarize where things stand: what got done, what decisions were made, and what is still open — so the next part of the session starts with clear state.', descBase: '' },
    { option: 'What is the current build state — what works, what is in progress, and what is the next step?', descBase: '' },
  ],
  L2: [
    { option: 'What has been built this session — what is working and what is still in progress?', descBase: '' },
    { option: 'What is the most important decision made this session that needs to carry forward?', descBase: '' },
  ],
  L3: [
    { option: 'What is the one most important thing to not lose track of before continuing?', descBase: '' },
  ],
};

export const ABSENCE_PROGRESS_CONSOLIDATION_GAP_CASUAL: DecisionContent = {
  question:      'Extended implementation — progress documented?',
  pinchFallback: 'Document now.',
  L1: [
    { option: 'Consolidate: update the README, write a brief description of what was built, or add clarifying comments before continuing.', descBase: '' },
    { option: 'Lock in the current state: write down what was built, any key decisions made, and what is still open — before the session context is lost.', descBase: '' },
    { option: 'Write a quick progress note — what was built, what decisions were made, and what comes next.', descBase: '' },
  ],
  L2: [
    { option: 'Add a brief note or comment documenting what was just built before moving on.', descBase: '' },
    { option: 'Write one sentence about the key decision made in this implementation run.', descBase: '' },
  ],
  L3: [
    { option: 'Write a one-sentence note on what was built before continuing.', descBase: '' },
  ],
};

// ── Phase 7 F1-F2 — session-quality signals (FORMAL register) ─────────────────

export const ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL: DecisionContent = {
  question:      'Long acceptance streak — applied critical review recently?',
  pinchFallback: 'Streak alert.',
  L1: [
    { option: 'Apply deliberate critical review to the most recent AI responses: identify any assumptions that have not been validated, logic that could fail under edge cases, and changes made without explicit verification.', descBase: '' },
    { option: 'Self-review the last set of AI-generated changes: flag any hallucinated functions, plausible-but-incorrect logic, or unhandled edge cases before accepting the next response.', descBase: '' },
    { option: 'Audit recent AI output for correctness: check any state or data assumptions, verify control flow, and identify anything that was accepted without being read carefully.', descBase: '' },
  ],
  L2: [
    { option: 'Review recent AI responses critically — what would you flag if reviewing this as a senior engineer rather than as the author?', descBase: '' },
    { option: 'Pick the most significant recent AI response and push back on one aspect of it before continuing.', descBase: '' },
  ],
  L3: [
    { option: 'Identify one thing in recent AI output to verify or question before accepting the next response.', descBase: '' },
  ],
};

export const ABSENCE_WORK_RHYTHM_CHECK_FORMAL: DecisionContent = {
  question:      'Rapid prompting — verified each response before continuing?',
  pinchFallback: 'Slow down.',
  L1: [
    { option: 'Read and verify the last AI response in full before sending the next prompt: check any logic or state assumptions, confirm any generated code is complete and correct, and identify anything that was not explicitly validated.', descBase: '' },
    { option: 'Audit the last AI-generated change for correctness before proceeding: trace any control flow, check any state transitions, and verify all assumptions are grounded.', descBase: '' },
    { option: 'Pause and review the last response before continuing: identify any part that was generated but not read, any assumption that was not confirmed, and any error handling that may be missing.', descBase: '' },
  ],
  L2: [
    { option: 'Read the last AI response carefully before sending the next prompt — is there anything unread or unverified?', descBase: '' },
    { option: 'Check the last generated output for any assumptions or errors before continuing.', descBase: '' },
  ],
  L3: [
    { option: 'Pause — read the last response before sending the next message.', descBase: '' },
  ],
};

export const ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL: DecisionContent = {
  question:      'Multiple areas open — completed any end-to-end?',
  pinchFallback: 'Focus drift.',
  L1: [
    { option: 'Sequence your work: identify the highest-priority open concern in this session, complete it end-to-end, and define done for that domain before opening any additional concerns.', descBase: '' },
    { option: 'Close one open concern completely before touching another: list the current open concerns, pick the most critical, and do not touch the others until it is resolved.', descBase: '' },
    { option: 'Audit the current session\'s open concerns: name them all, rank them by criticality, and commit to completing the top one before any other context switch.', descBase: '' },
  ],
  L2: [
    { option: 'Pick the single most important open concern in this session and complete it before starting anything else.', descBase: '' },
    { option: 'What is the one thing in this session that must be finished before anything else can be safely started?', descBase: '' },
  ],
  L3: [
    { option: 'Complete one open concern end-to-end before opening another.', descBase: '' },
  ],
};

export const ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL: DecisionContent = {
  question:      'Extended session — context checkpoint done?',
  pinchFallback: 'Checkpoint due.',
  L1: [
    { option: 'Summarize the current state of what was just built: what decisions have been made, what is working, what remains incomplete, and what has changed since the session started — use this as a re-anchor before continuing.', descBase: '' },
    { option: 'Reconstruct the decision log for this session: what tradeoffs were made, what constraints were identified, and what is still unresolved — so the next phase starts with explicit context, not implicit state.', descBase: '' },
    { option: 'Audit the current build state against the original goal: what was actually completed, what was deferred, and what decisions may need revisiting before continuing.', descBase: '' },
  ],
  L2: [
    { option: 'What is the current state of what was just built — what is working, what is still in progress, and what is the immediate next step?', descBase: '' },
    { option: 'What is the most important technical decision made this session that must be explicitly carried forward before continuing?', descBase: '' },
  ],
  L3: [
    { option: 'What is the one piece of context about this project that must not be lost before continuing — the single most important thing to anchor right now?', descBase: '' },
  ],
};

export const ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL: DecisionContent = {
  question:      'Extended implementation — progress documented?',
  pinchFallback: 'Document now.',
  L1: [
    { option: 'Consolidate the current build state: document what has been implemented, capture the key decisions made, and record any outstanding work before continuing.', descBase: '' },
    { option: 'Update the project documentation to reflect the current state: what was built, why it was designed this way, and what has been deferred — make the implicit state explicit.', descBase: '' },
    { option: 'Write a progress summary covering what was built in this session, what technical decisions were made, and what remains before the feature is complete.', descBase: '' },
  ],
  L2: [
    { option: 'Update documentation or comments to reflect the current implementation state before continuing.', descBase: '' },
    { option: 'Write a brief note on what was built and what key technical decisions were made.', descBase: '' },
  ],
  L3: [
    { option: 'Write one sentence documenting the most important thing about what was just built before continuing.', descBase: '' },
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
