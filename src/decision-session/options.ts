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

export interface DecisionContent {
  question:      string;
  pinchFallback: string;
  L1: string[];
  L2: string[];
  L3: string[];
}

// ── Per-transition content ─────────────────────────────────────────────────────

/** Transition 1: Idea → PRD */
const IDEA_TO_PRD: DecisionContent = {
  question:      'Before building — is the plan written?',
  pinchFallback: 'Before coding.',
  L1: [
    'Write a PRD for this project: define the problem, target user, core features with acceptance criteria, what is explicitly out of scope, and any technical constraints.',
    'Define the problem and success criteria first: who is this for, what problem does it solve, and how will we know when it\'s done?',
    'Cross-confirm the idea before writing spec: review what I\'ve described so far and tell me — is the problem statement clear enough to write a PRD? What\'s missing or ambiguous?',
  ],
  L2: [
    'Write a one-paragraph scope statement: what this project does, what it does not do, and the single most important success criterion.',
    'Cross-confirm the idea: given what I\'ve described, what are the top 3 things that should be clarified before I start building?',
  ],
  L3: [
    'List the 3 most important acceptance criteria for this project so we can check them before release.',
  ],
};

/** Transition 2: PRD → Architecture */
const PRD_TO_ARCHITECTURE: DecisionContent = {
  question:      'Spec ready — is the architecture decided?',
  pinchFallback: 'Design first.',
  L1: [
    'Design the system architecture for this project: list the main components, how they interact, the data model, API contracts (if any), and the tech stack with rationale for key choices.',
    'Write a technical design doc: system components, data flows, key architectural decisions and why, and any constraints or risks I should know before coding starts.',
    'Cross-confirm the spec before architecture: review the PRD/spec we have and tell me — is it precise enough that you could implement it without asking clarifying questions? List every ambiguity or gap.',
    'Review the spec for architectural blind spots: based on the requirements, what architectural decisions will have the biggest impact on maintainability, performance, or security — and what\'s the recommended approach for each?',
  ],
  L2: [
    'Sketch the main components and data flow: what are the key parts of this system and how does data move between them?',
    'Cross-confirm the spec: given the current PRD, what are the top 3 architectural decisions I need to make before starting to code?',
  ],
  L3: [
    'Cross-confirm the plan: what is the single biggest architectural risk in what I\'ve described, and what\'s the simplest way to address it?',
  ],
};

/** Transition 3: Architecture → Task Breakdown */
const ARCHITECTURE_TO_TASKS: DecisionContent = {
  question:      'Architecture done — is the task list ordered?',
  pinchFallback: 'Break it down.',
  L1: [
    'Break the implementation into an ordered task list: each task should be completable in one coding session, delivered as a vertical slice where possible, and have a clear definition of done.',
    'Create a task list file for this implementation phase: list tasks in order, with a one-line definition of done for each, so I can track progress and you have context for each session.',
    'Cross-confirm the architecture before coding: review the architecture we\'ve designed and tell me — does it fully cover all the requirements in the spec? Are there any missing components, undefined data flows, or unresolved technical decisions?',
    'Identify the first vertical slice: what is the thinnest end-to-end feature I can build first to validate the architecture and get something working?',
  ],
  L2: [
    'List the top 5 implementation steps in order, with a one-line description of what done looks like for each.',
    'Cross-confirm the architecture: given the spec and architecture, what are the top 3 things that could go wrong during implementation and how should I handle them?',
  ],
  L3: [
    'Cross-confirm the first step: what should I build first and why — what validates the core assumption of this project fastest?',
  ],
};

/** Transition 4: task_breakdown → implementation (per-task review before coding starts) */
const TASK_REVIEW: DecisionContent = {
  question:      'Task done — reviewed and tested?',
  pinchFallback: 'Quick check.',
  L1: [
    'Review what was just built for this task: does the implementation match the spec and acceptance criteria? List any discrepancies, missing logic, hallucinated code, or potential issues before I mark this done.',
    'Run the tests for what was just built and report: which tests pass, which fail, and what needs to be fixed before moving to the next task.',
    'Cross-confirm this implementation against the spec: does what was just built fully satisfy the requirements for this task? What is missing or different from what the spec required?',
  ],
  L2: [
    'Quick review of what was just built: does it do what the task asked for? Any obvious issues?',
    'Cross-confirm this task: does this implementation match the task\'s definition of done?',
  ],
  L3: [
    'Is there anything in the code just generated that looks wrong or incomplete before I move on?',
  ],
};

/** TASK_REVIEW_CASUAL — casual-register variant for cool_geek and pro_geek_soul profiles */
const TASK_REVIEW_CASUAL: DecisionContent = {
  question:      'Task done — quick check before moving on?',
  pinchFallback: 'Quick check.',
  L1: [
    'Quick look at what was just built — does it do what the task asked for? Anything off, anything missing, any weird generated code before I say it\'s done?',
    'Run the tests for what was just built and report: which pass, which fail, and what needs fixing before moving on.',
    'Does what was just built actually do what was asked? What\'s off or missing compared to what was planned?',
  ],
  L2: [
    'Quick look at what was just built: does it do what the task asked for? Any obvious problems?',
    'Does what was just built match what the task asked for — definition of done covered?',
  ],
  L3: [
    'Anything in what was just built that looks off or incomplete before moving on?',
  ],
};

/** Transition 5: Implementation → Review/Testing */
const IMPLEMENTATION_TO_REVIEW: DecisionContent = {
  question:      'Phase done — full review before moving on?',
  pinchFallback: 'Phase done?',
  L1: [
    'Run the full test suite for this phase: unit tests, integration tests, and any regression tests. Report results, failures, and what needs to be fixed.',
    'Check the spec acceptance criteria against what was built: go through each acceptance criterion in the PRD and tell me whether it is fully satisfied, partially satisfied, or not yet implemented.',
    'Cross-confirm the full implementation against the spec: review everything built in this phase and identify any gaps between what was implemented and what the spec required — include security, error handling, and edge cases.',
    'Review for regression: does anything that was working before this phase now behave differently or break?',
    // v0.3.0 — acceptance/behaviour testing gap
    'Write a manual acceptance test script for what was just built: cover the spec scenarios — happy path, boundary conditions, and error states automated tests would miss — and document the expected outcome at each step.',
  ],
  L2: [
    'Run tests for the new code in this phase and report any failures.',
    'Cross-confirm the critical path: do the 3 most important acceptance criteria from the spec pass end-to-end?',
  ],
  L3: [
    'Cross-confirm before I move on: is there anything obviously broken or missing in what was just built?',
  ],
};

/** Transition 6: Review/Testing → Release */
const REVIEW_TO_RELEASE: DecisionContent = {
  question:      'Ready to ship — final checks done?',
  pinchFallback: 'Almost there.',
  L1: [
    'Run all tests one final time before release: unit, integration, and regression. Confirm everything passes or tell me what is still failing.',
    'Cross-confirm release readiness: have all tests passed, are all spec acceptance criteria met, have security concerns been addressed, and is there a rollback plan ready if something fails in production?',
    'Review the new code for security issues before shipping: check for input validation gaps, authentication/authorization issues, hardcoded secrets, unhandled errors, and any other obvious vulnerabilities.',
    'Write a release checklist for this deployment: what needs to happen before, during, and after the release to ensure it goes smoothly and I can roll back if needed.',
  ],
  L2: [
    'Cross-confirm readiness: what are the top 3 risks in shipping this right now and how should I handle each?',
    'Run the critical path tests only and confirm they pass.',
  ],
  L3: [
    'Cross-confirm one thing: is there anything that is likely to break in production that we haven\'t tested yet?',
  ],
};

/** Transition 7: Release → Feedback Loop */
const RELEASE_TO_FEEDBACK: DecisionContent = {
  question:      'Just shipped — is the feedback loop active?',
  pinchFallback: 'Watch it live.',
  L1: [
    'Verify the production monitoring setup for what was just built: confirm error tracking is active, alert thresholds are configured, and dashboards show live metrics — list what is collecting and what still needs to be set up.',
    'Set up the feedback loop for this feature: identify what signals will tell you it is working (analytics events, error rates, user reports), confirm what is already in place, and list what still needs to be added to close the loop.',
    'Run smoke checks on what was just built: confirm the main user path works end-to-end in the live environment, check for unexpected errors in the logs, and report anything that looks wrong.',
  ],
  L2: [
    'What are the top 3 signals I should watch in the first 24 hours to know if this feature is behaving as expected in production?',
    'What is the minimum feedback setup needed to know if this feature is landing well — and what is still missing from what is currently in place?',
  ],
  L3: [
    'Is there a signal in place that would tell you if this feature silently breaks in production — or would it fail without alerting anyone?',
  ],
};

/** Absence trigger: behaviour_testing — fires when implementation proceeds without manual acceptance testing */
const BEHAVIOUR_TESTING: DecisionContent = {
  question:      'Implementation done — user scenarios tested?',
  pinchFallback: 'User scenario?',
  L1: [
    'Write a manual test scenario for the main user journey: list each step a real user would take, what they would see, and what would confirm it is working correctly.',
    'List the acceptance tests for this feature: describe 3 to 5 scenarios a real user would run through, from happy path to edge cases, and the expected outcome for each.',
    'Identify the 3 most likely ways a real user could break this feature without triggering any automated tests — then tell me how to manually verify each one.',
  ],
  L2: [
    'Describe the happy path for the main use case: what does a user do, step by step, to successfully complete the core workflow?',
    'What is the most important thing to verify manually before I call this feature done — and how do I check it?',
  ],
  L3: [
    'What is one real user scenario I should manually test right now before moving on?',
  ],
};

/** BEHAVIOUR_TESTING_CASUAL — casual-register variant for cool_geek and pro_geek_soul profiles */
const BEHAVIOUR_TESTING_CASUAL: DecisionContent = {
  question:      'Implementation done — user scenarios tested?',
  pinchFallback: 'User scenario?',
  L1: [
    'Put yourself in a user\'s shoes and go through what was just built from start to finish — what\'s the main thing it does, does it actually work, and is anything confusing or broken along the way?',
    'Think of a few different ways someone might use this feature in real life — the obvious one and a couple of less obvious ones — and actually run through each to see what happens.',
    'Think about what could go wrong for a real user in what was just built — try the stuff that automated tests wouldn\'t catch and tell me what you see.',
  ],
  L2: [
    'What\'s the simplest way someone would use this feature end to end — walk me through what they do and whether it actually works.',
    'Is there anything in what was just built that you haven\'t actually tried yourself yet — and what would "working" look like if you did?',
  ],
  L3: [
    'What\'s one specific thing that could break for a real user in this feature that hasn\'t been tried by hand yet?',
  ],
};

// ── Absence signal content sets ───────────────────────────────────────────────

/** Absence: test_creation — fires when implementation proceeds without writing tests */
const ABSENCE_TEST_CREATION: DecisionContent = {
  question:      'Code added — where are the tests?',
  pinchFallback: 'Tests missing.',
  L1: [
    'Write tests for what was just built: unit tests for each function added or modified, and at least one integration test that covers the main path through this feature.',
    'Identify what was just built that has no test coverage and write tests for the top 3 riskiest parts — the logic most likely to break silently if changed.',
    'Review what was just built for testability: is it structured so tests can be written without extensive mocking? Flag any parts that would be hard to test as-is.',
  ],
  L2: [
    'Write at least one test for what was just built — the most critical path through this feature.',
    'What would break silently in what was just built if a future change introduced a bug? Write a test that catches that.',
  ],
  L3: [
    'Write one test for the most important behaviour in what was just built before moving on.',
  ],
};

/** Absence: regression_check — fires when changes are made without regression testing */
const ABSENCE_REGRESSION_CHECK: DecisionContent = {
  question:      'Changes made — regression verified?',
  pinchFallback: 'Regression check.',
  L1: [
    'Identify which existing tests cover the code paths changed in what was just built, run them, and flag any regressions — anything that was passing before this session that is now failing.',
    'Check what was just built against the existing test suite: identify which existing tests cover the code paths that were modified, run them, and report any failures.',
    'Review what was just built for regression risk: what existing functionality could be affected by these changes, and how would you verify it still works correctly?',
  ],
  L2: [
    'Run the tests for this project and report which ones fail — specifically any that touch code changed in this session.',
    'What existing functionality is most likely to be affected by what was just built? Verify it still works.',
  ],
  L3: [
    'Run the existing tests for this project and report whether anything is now failing that wasn\'t before.',
  ],
};

/** Absence: spec_acceptance_check — fires when implementation proceeds without checking against spec */
const ABSENCE_SPEC_ACCEPTANCE: DecisionContent = {
  question:      'Implementation done — spec checked?',
  pinchFallback: 'Check the spec.',
  L1: [
    'Review what was just built against the spec and acceptance criteria: go through each requirement and confirm whether it is fully implemented, partially implemented, or missing from what was just built.',
    'Cross-confirm what was just built against the original requirements: does the implementation match what was specified? List any deviations, missing behaviour, or scope creep introduced.',
    'Audit what was just built for spec compliance: check input validation, edge cases, and error handling against the acceptance criteria — flag anything that passes the happy path but fails under edge conditions.',
  ],
  L2: [
    'Check what was just built against the spec: does it fully satisfy the acceptance criteria, or are there gaps?',
    'Does what was just built match what was specified? List any differences between the implementation and the original requirements.',
  ],
  L3: [
    'Is there anything in what was just built that doesn\'t match the spec or acceptance criteria?',
  ],
};

/** Absence: cross_confirming — fires when implementation proceeds without cross-confirmation prompts */
const ABSENCE_CROSS_CONFIRMING: DecisionContent = {
  question:      'AI generated it — have you verified it?',
  pinchFallback: 'Verify the output.',
  L1: [
    'Review what was just built critically: identify any hallucinated functions or APIs, logic that looks plausible but is incorrect, edge cases not handled, and any code that was generated but not verified against the actual system it will run in.',
    'Cross-confirm what was just built: does the generated code actually do what you expect, or does it contain plausible-sounding logic that is subtly wrong? Trace the main path through the code and verify each step.',
    'Audit what was just built for AI generation artifacts: check for made-up function names, incorrect assumptions about the codebase, missing error handling that a human would have caught, and any logic that looks correct but hasn\'t been manually verified.',
  ],
  L2: [
    'Review what was just built for correctness: is there anything that looks right at a glance but would fail when actually run or tested?',
    'Does what was just built actually do what you think it does? Trace the main execution path and verify the logic is sound.',
  ],
  L3: [
    'Is there anything in what was just built that was generated but not verified — anything you haven\'t manually checked for correctness?',
  ],
};

const ABSENCE_SECURITY_CHECK: DecisionContent = {
  question:      'Feature built — security reviewed?',
  pinchFallback: 'Security gap.',
  L1: [
    'Review what was just built for security vulnerabilities: check authentication and authorization logic, input validation for injection risks (SQL, XSS, command), and any API endpoints for missing rate limiting, improper error responses, or exposed sensitive data.',
    'Audit what was just built against OWASP Top 10 exposure: does this feature handle untrusted input safely, authenticate and authorize correctly, and avoid leaking sensitive information in error messages or logs?',
    'Cross-confirm what was just built against your threat model: what assets are being protected, what attack surface has this feature introduced, and what is the highest-severity vulnerability an attacker could exploit right now?',
  ],
  L2: [
    'Check what was just built for the most critical security gaps: input validation, proper authentication and authorization checks, and sensitive data exposure in responses or logs.',
    'What is the biggest security risk introduced by what was just built, and what would be needed to mitigate it before this ships?',
  ],
  L3: [
    'Is there anything in what was just built that could be exploited — untrusted input not validated, missing auth checks, or sensitive data exposed to callers?',
  ],
};

const ABSENCE_ERROR_HANDLING: DecisionContent = {
  question:      'Feature built — error paths handled?',
  pinchFallback: 'Error handling.',
  L1: [
    'Review what was just built for error handling gaps: identify all failure modes (network errors, invalid input, missing dependencies, unexpected state), confirm each is handled explicitly, and flag any that are silently swallowed or produce unhelpful error messages.',
    'Audit the failure paths in what was just built: what happens when each external dependency fails, each input is invalid, or each assumption is violated? Is the failure propagated, logged, or recovered from correctly in each case?',
    'Cross-confirm what was just built against its error contract: are errors typed and documented, are retries or fallbacks implemented where appropriate, and are error messages safe to expose to callers without leaking internal state?',
  ],
  L2: [
    'What failure modes in what was just built are currently unhandled or silently swallowed? Identify and fix the most critical ones.',
    'What happens in what was just built when the most likely thing goes wrong — network failure, invalid input, or missing dependency? Verify that case is handled correctly.',
  ],
  L3: [
    'Is there anything in what was just built that could fail silently or produce an unhelpful error when something unexpected happens?',
  ],
};

const ABSENCE_DOCUMENTATION: DecisionContent = {
  question:      'Code written — any documentation added?',
  pinchFallback: 'Docs missing.',
  L1: [
    'Review what was just built for documentation coverage: identify functions, classes, and modules with non-obvious behaviour that lack docstrings or inline comments, and add documentation that explains the why — the constraint, the invariant, the tradeoff — not just the what.',
    'Audit what was just built for undocumented assumptions: what design decisions, invariants, or external constraints are embedded in this code that a future maintainer could not infer from reading it? Document those specifically.',
    'Check whether what was just built needs README updates, API reference additions, or architecture notes — not just inline comments. What context would someone need to understand this feature without asking the original author?',
  ],
  L2: [
    'What parts of what was just built would be hardest for another developer to understand without documentation? Add documentation for those first.',
    'Identify the non-obvious decisions in what was just built — the ones a future maintainer might change by mistake — and document the reasoning behind each.',
  ],
  L3: [
    'Is there anything in what was just built that has non-obvious behaviour or hidden assumptions that are not documented?',
  ],
};

const ABSENCE_OBSERVABILITY: DecisionContent = {
  question:      'Feature built — how will you know it\'s working?',
  pinchFallback: 'No observability.',
  L1: [
    'Review what was just built for observability gaps: identify what this feature does in production that is currently invisible — requests, failures, latency, state changes — and add structured logging for the events that would allow you to diagnose a production incident without SSH access.',
    'Audit what was just built for monitoring coverage: what SLI would you define for this feature, what metrics would you emit, and what alert condition would page someone if this feature degraded silently in production?',
    'Check what was just built for error tracking integration: are failures captured in your error tracking system with enough context — request ID, user ID, stack trace — to diagnose the issue without reproducing it locally?',
  ],
  L2: [
    'What events in what was just built are currently invisible in production? Add structured logging for the ones that would be essential to diagnose a failure.',
    'If this feature broke silently in production tonight, what would you see in your logs and monitoring to detect it? If the answer is "nothing", what needs to be added?',
  ],
  L3: [
    'Is there anything in what was just built that could fail silently in production with no log entry or alert to detect it?',
  ],
};

const ABSENCE_COMPREHENSION: DecisionContent = {
  question:      'AI generated it — do you understand it?',
  pinchFallback: 'Comprehension check.',
  L1: [
    'Review what was just built for comprehension: trace through the main execution path and explain what each significant function, class, and data structure does — independently, without relying on comments generated alongside the code.',
    'Audit your understanding of what was just built: identify any part of the code you could not explain to a colleague without reading it again. For each such part, either gain that understanding now or flag it as a comprehension debt before moving on.',
    'Check whether what was just built contains any abstractions, design patterns, or external library usage you accepted without fully understanding — verify what each one does and why it was chosen for this specific context.',
  ],
  L2: [
    'Is there any part of what was just built you could not confidently explain to another developer right now? Address that before moving on.',
    'Walk through what was just built and identify any code you accepted because it looked correct without actually verifying the logic yourself.',
  ],
  L3: [
    'Is there anything in what was just built that you haven\'t manually traced through and fully understood?',
  ],
};

const ABSENCE_REFACTORING: DecisionContent = {
  question:      'Extended implementation — code health reviewed?',
  pinchFallback: 'Refactor check.',
  L1: [
    'Review what was just built for refactoring opportunities: identify code duplication, functions that do more than one thing, abstractions that have grown inconsistent with their usage, and naming that no longer reflects current behaviour — prioritize by maintenance risk.',
    'Audit what was just built for code health: are there patterns that have emerged across this implementation that should be abstracted, any dead code that can be removed, or any modules that have grown beyond their original responsibility?',
    'Check what was just built against existing codebase conventions: does it introduce inconsistent patterns, style deviations, or compounding technical debt that would make the next feature harder to add if not addressed now?',
  ],
  L2: [
    'What is the most significant refactoring opportunity in what was just built — the thing that if left will make the next feature harder to add?',
    'Review what was just built for duplication or inconsistency that should be cleaned up before moving on to the next task.',
  ],
  L3: [
    'Is there anything in what was just built that should be refactored or cleaned up before moving on?',
  ],
};

const ABSENCE_NO_PUSHBACK: DecisionContent = {
  question:      'AI suggesting — are you evaluating critically?',
  pinchFallback: 'No pushback.',
  L1: [
    'Review the AI-generated outputs used in what was just built: identify any decisions, implementations, or suggestions you accepted without explicitly verifying the reasoning, checking for alternatives, or questioning the assumptions embedded in the response.',
    'Audit your acceptance pattern while building this feature: for each significant AI output, ask whether you evaluated it independently or accepted it because it was confident and plausible. Flag any output where you would struggle to justify the implementation choice to a peer reviewer.',
    'Cross-confirm the most recent AI suggestion used in what was just built: what assumptions did the AI make that were not in your prompt, what alternatives did it not consider, and is the approach it chose actually the best fit for this project?',
  ],
  L2: [
    'Take the last significant AI output used in what was just built and evaluate it critically: do you agree with the approach, and if so, can you explain why it is better than the alternatives?',
    'Is there any AI output used in what was just built that you accepted because it sounded right rather than because you verified it was right?',
  ],
  L3: [
    'Is there any AI suggestion used in what was just built that you accepted without questioning the reasoning or checking for better alternatives?',
  ],
};

const ABSENCE_CORRECTION_SEEKING: DecisionContent = {
  question:      'AI output — self-verification requested?',
  pinchFallback: 'No verification.',
  L1: [
    'Instruct the AI to self-review what was just built: ask it to identify any assumptions that may be incorrect, logic that could fail under edge cases, and any parts of the implementation it is not confident about.',
    'Request a critical re-evaluation of what was just built: ask the AI to argue against its own implementation — what would a skeptical senior engineer flag, what alternative approaches were not considered, and what are the weakest parts of this solution?',
    'Ask the AI to produce a failure analysis of what was just built: what are the most likely ways this implementation fails in production, what inputs would cause incorrect behaviour, and what would it change if asked to rebuild this from scratch?',
  ],
  L2: [
    'Ask the AI to review what was just built critically — what would it change or flag if it were reviewing this as a senior engineer rather than as the author?',
    'Request a self-critique of what was just built: what are the weakest parts, and what was the AI least confident about when generating this?',
  ],
  L3: [
    'Ask the AI to identify the part of what was just built it is least confident is correct.',
  ],
};

const ABSENCE_PROBLEM_CORRECTION: DecisionContent = {
  question:      'Bug noticed — explicitly corrected?',
  pinchFallback: 'Bug unresolved.',
  L1: [
    'Review the outstanding bugs and issues identified in this session: for each one, confirm whether it has been explicitly fixed, explicitly deferred with a tracking note, or left unaddressed. Address any that are unresolved and blocking correctness of what was just built.',
    'Audit what was just built for bugs that were noticed but not fixed: identify any error, failure, or incorrect behaviour that was mentioned in this session and is still present in the current implementation.',
    'Cross-confirm the current state of what was just built: run the tests, check the known failure cases, and verify that any issue identified earlier in this session has been resolved or explicitly acknowledged as a known limitation.',
  ],
  L2: [
    'Is there any bug or issue in what was just built that was noticed earlier in this session but not explicitly fixed? Address it before moving on.',
    'Run the tests for what was just built and confirm that any failure identified earlier in this session is now resolved.',
  ],
  L3: [
    'Is there any bug in what was just built that was noticed but not explicitly corrected before moving on?',
  ],
};

const ABSENCE_ALTERNATIVES: DecisionContent = {
  question:      'Decision made — alternatives considered?',
  pinchFallback: 'No alternatives.',
  L1: [
    'Review the key decisions made in what was just built: name the alternatives that were not chosen, explain the tradeoffs between each approach, and confirm that the chosen solution is the best fit for the constraints of this project — not just the first viable option.',
    'Audit the key technical choices made while building this feature: for each significant decision (architecture, library, algorithm, data structure), identify at least one alternative that was not explored and evaluate whether the chosen approach is still the right one given the project\'s constraints.',
    'Cross-confirm the approach taken in what was just built: what would a different engineering team have done differently, what are the known weaknesses of the chosen approach, and is there a simpler solution that would meet the requirements with fewer dependencies or moving parts?',
  ],
  L2: [
    'What was the most significant technical decision made in what was just built? Name the alternatives that were not explored and confirm the chosen approach is the right tradeoff.',
    'Is there any part of what was just built where a different approach would have been simpler, more maintainable, or better suited to the project\'s constraints?',
  ],
  L3: [
    'Is there any decision in what was just built that was made without considering alternatives — where the first approach was taken without evaluating other options?',
  ],
};

const ABSENCE_ARCH_CONFLICT: DecisionContent = {
  question:      'Feature added — architecture consistency checked?',
  pinchFallback: 'Arch conflict.',
  L1: [
    'Review what was just built for architectural consistency: does this feature follow the same patterns, abstractions, and conventions established in the existing codebase, or does it introduce a parallel approach that will diverge over time and increase maintenance cost?',
    'Audit what was just built for architecture conflicts: identify any module boundaries crossed without justification, any shared state accessed in ways inconsistent with the existing data flow, and any new dependencies introduced that conflict with the project\'s existing dependency strategy.',
    'Cross-confirm what was just built against the architectural decisions documented for this project: does this feature respect the layering, separation of concerns, and interface contracts that were established? Flag any violations and determine whether they require a refactor or an architecture decision update.',
  ],
  L2: [
    'Does what was just built follow the same patterns and conventions as the rest of the codebase, or does it introduce a new approach that conflicts with the existing architecture?',
    'Is there anything in what was just built that violates a design decision or architectural convention established earlier in this project?',
  ],
  L3: [
    'Is there anything in what was just built that doesn\'t fit the patterns or structure of the existing codebase?',
  ],
};

const ABSENCE_PROMPT_CONTEXT: DecisionContent = {
  question:      'Prompts sent — spec and arch referenced?',
  pinchFallback: 'Missing context.',
  L1: [
    'Review the prompts used to build this feature: are they grounded in the project\'s spec, architecture decisions, and task breakdown, or are they ad hoc instructions that the AI is implementing without access to the full planning context? If context is missing, inject it now before the next prompt.',
    'Audit the context richness of the prompts used to build this feature: does the AI have access to the current spec, the established architecture, and the specific acceptance criteria for what was just built, or is it making assumptions that a context-rich prompt would have resolved?',
    'Cross-confirm that what was just built is aligned with the project\'s planning artifacts: paste the relevant spec section, architecture diagram, or task definition into the conversation and ask the AI to verify that its implementation matches what was planned.',
  ],
  L2: [
    'Does the AI have the spec and architecture context it needs to build this feature correctly, or has it been working from ad hoc instructions? Inject the relevant planning context before continuing.',
    'Paste the spec or acceptance criteria for this feature into the conversation and ask the AI to check whether what was just built matches what was planned.',
  ],
  L3: [
    'Does the AI have enough context about the spec and architecture to be building this feature correctly, or is it working without the full picture?',
  ],
};

const ABSENCE_ROLLBACK_PLANNING: DecisionContent = {
  question:      'Release pending — rollback plan defined?',
  pinchFallback: 'No rollback plan.',
  L1: [
    'Define the rollback procedure for this feature before shipping: identify the steps to revert if the deployment fails, confirm the rollback can be completed within your acceptable downtime window, and verify that database migrations or data changes are reversible.',
    'Audit the rollback readiness of this feature: what happens to data, sessions, and dependent services if this deploy is reverted? Document the rollback steps, assign ownership, and confirm the plan can be executed without live debugging during an incident.',
    'Cross-confirm rollback viability for what was just built: if you rolled back this feature in production right now, what would break, what state would be left in an inconsistent state, and what would need to be cleaned up manually? Address any gaps before shipping.',
  ],
  L2: [
    'What is the rollback procedure if the deployment of this feature fails? Document it before shipping — it should be executable under pressure without needing to invent steps on the fly.',
    'Are there any parts of this feature — database migrations, external API integrations, data format changes — that cannot be cleanly rolled back? Address those before shipping or accept them as known risks.',
  ],
  L3: [
    'Is there a documented rollback plan for this feature that could be executed in production under pressure, or would reverting require improvisation?',
  ],
};

const ABSENCE_DEPLOYMENT_PLANNING: DecisionContent = {
  question:      'Release pending — deployment plan confirmed?',
  pinchFallback: 'No deploy plan.',
  L1: [
    'Define the deployment plan for this feature before shipping: confirm the target environment configuration, document any environment variables or secrets that need to be provisioned, and verify that the deployment process has been tested outside of production.',
    'Audit the deployment readiness of this feature: are there environment-specific configuration differences between staging and production that could cause a failure, any new environment variables required, or any infrastructure changes needed before this can deploy cleanly?',
    'Cross-confirm deployment readiness for this feature: what does the production environment need to have in place before this deploys successfully — configuration, secrets, database state, external service integrations — and is each of those confirmed and ready?',
  ],
  L2: [
    'What environment configuration does this feature require in production that is not yet confirmed — secrets, environment variables, infrastructure dependencies? Resolve each before shipping.',
    'Has this feature been deployed to a staging environment that mirrors production? If not, what deployment risks are you accepting by shipping without a staging verification?',
  ],
  L3: [
    'Is there a confirmed deployment plan for this feature, or is the deployment process still undefined and untested outside of development?',
  ],
};

const ABSENCE_DEPENDENCY_MGMT: DecisionContent = {
  question:      'Dependencies added — conflicts and risks reviewed?',
  pinchFallback: 'Dependency risk.',
  L1: [
    'Review the new dependencies introduced in what was just built: check for version conflicts with existing packages, known security vulnerabilities in the chosen version, and whether a more stable or widely-adopted alternative exists for the same purpose.',
    'Audit the packages added in what was just built for dependency health: are the chosen versions the latest stable releases, do any have known CVEs in the installed version, and are the licences compatible with this project\'s licence requirements?',
    'Cross-confirm the dependency decisions made in what was just built: for each new package, verify it is actively maintained, has adequate documentation, does not introduce transitive dependencies that conflict with the existing dependency tree, and is not a single-maintainer package with no succession plan.',
  ],
  L2: [
    'Check the new packages added in what was just built for version conflicts and known vulnerabilities — run a dependency audit and confirm there are no high-severity issues before shipping.',
    'Is there any package added in what was just built that is unmaintained, has an incompatible licence, or pulls in a transitive dependency that conflicts with what is already installed?',
  ],
  L3: [
    'Have the new packages added in what was just built been checked for version conflicts, known security vulnerabilities, and licence compatibility?',
  ],
};

const ABSENCE_PHASE_TRANSITION: DecisionContent = {
  question:      'Extended phase — transition readiness assessed?',
  pinchFallback: 'Phase check.',
  L1: [
    'Assess transition readiness for this project: define what must be complete before moving to the next phase, confirm which of those criteria are currently met, and identify what is blocking the transition. If no criteria are defined, define them now.',
    'Review the current phase of this project against its original definition: have the objectives for this phase been met, what work is still in progress, and is there a clear handoff point that marks the end of this phase and the beginning of the next?',
    'Cross-confirm phase completion for this project: what artifacts, decisions, or quality gates were supposed to be produced in this phase, which are complete, which are missing, and what would need to be done to be confident that proceeding to the next phase is the right call?',
  ],
  L2: [
    'What are the exit criteria for the current phase of this project? Assess which are met and which are not before committing to the next phase.',
    'Is there any unfinished work from the current phase of this project that should be resolved before transitioning — decisions deferred, quality gates not cleared, or artifacts not produced?',
  ],
  L3: [
    'What needs to be true for this project to be ready to move to the next phase, and is any of that currently incomplete or unresolved?',
  ],
};

const ABSENCE_SPEC_CROSS_CONFIRM: DecisionContent = {
  question:      'Spec written — cross-confirmed against requirements?',
  pinchFallback: 'Spec not confirmed.',
  L1: [
    'Cross-confirm this project\'s spec against its source requirements: for each requirement in the spec, verify it traces back to a stated user need or stakeholder decision, covers the acceptance criteria completely, and does not contain assumptions that were not explicitly agreed upon.',
    'Audit this project\'s spec for internal consistency and completeness: identify any requirements that contradict each other, any acceptance criteria that are ambiguous or untestable, and any scope decisions that were made without explicit stakeholder sign-off.',
    'Review this project\'s spec against what is actually feasible given the current technical constraints: flag any requirements that have no clear implementation path, any acceptance criteria that would require capabilities not available in the current stack, and any decisions that have been implicitly made but not documented.',
  ],
  L2: [
    'Go through this project\'s spec and identify any requirement that cannot be directly traced to a stated user need or a documented stakeholder decision — those are assumptions that need to be confirmed before implementation begins.',
    'Is there anything in this project\'s spec that is ambiguous enough that two developers could implement it differently and both be technically correct? Resolve those ambiguities before building.',
  ],
  L3: [
    'Is there anything in this project\'s spec that has not been verified against the original requirements — any assumption, scope decision, or acceptance criterion that was added without explicit confirmation?',
  ],
};

const ABSENCE_SPEC_REVISION: DecisionContent = {
  question:      'Spec drafted — revised since initial version?',
  pinchFallback: 'Spec unrevised.',
  L1: [
    'Revise this project\'s spec to reflect what has been learned since the initial draft: update any requirements that turned out to be more or less complex than anticipated, add acceptance criteria for edge cases discovered during implementation, and remove or defer any scope that has been implicitly dropped.',
    'Audit this project\'s spec for drift: compare the current implementation against the spec and identify where the two have diverged — either the spec is outdated and the implementation is correct, or the implementation has deviated from the spec and needs to be corrected. Resolve each divergence explicitly.',
    'Review this project\'s spec against the current state of the project: what decisions have been made during implementation that are not reflected in the spec, what requirements have been reinterpreted or changed in practice, and what new constraints or dependencies have emerged that the spec does not document?',
  ],
  L2: [
    'Compare the current implementation against this project\'s spec and flag every place they diverge — then decide for each divergence whether the spec needs to be updated or the implementation needs to change.',
    'Is there anything in this project\'s spec that was written before implementation started and no longer reflects the current technical decisions or scope? Update it now so the spec is a true record of what is being built.',
  ],
  L3: [
    'Does this project\'s spec still accurately reflect what is being built, or has the implementation diverged from the original spec without the spec being updated?',
  ],
};

/** ABSENCE_TEST_CREATION_CASUAL — casual-register variant for pro_geek_soul and null profiles */
const ABSENCE_TEST_CREATION_CASUAL: DecisionContent = {
  question:      'Built something — any tests written yet?',
  pinchFallback: 'Tests missing.',
  L1: [
    'Write tests for what was just built — unit tests for anything new or changed, and one test that runs the main flow. What\'s the most likely thing that could break?',
    'What\'s the riskiest part of what was just built that has no test? Write one test for that first, then keep going.',
    'Is what was just built easy to test as-is, or does it need a small refactor to make testing feasible? Share what you find.',
  ],
  L2: [
    'Write at least one test for what was just built — something that would catch it breaking silently.',
    'What\'s the most likely thing to break silently in what was just built? Write a test for that.',
  ],
  L3: [
    'Write one test for the most important behaviour in what was just built before moving on.',
  ],
};

/** ABSENCE_REGRESSION_CHECK_CASUAL — casual-register variant for pro_geek_soul and null profiles */
const ABSENCE_REGRESSION_CHECK_CASUAL: DecisionContent = {
  question:      'Changed something — did anything break?',
  pinchFallback: 'Regression check.',
  L1: [
    'Run the tests for this project and check — did what was just built break anything that was working before? Report what\'s failing and why.',
    'What existing code is most likely affected by what was just built? Run those tests and tell me if anything broke.',
    'Look at what was just built — what could it accidentally break in what was already working? Verify those paths still work.',
  ],
  L2: [
    'Run the test suite and flag anything that\'s now failing that wasn\'t before — especially anything near what was just built.',
    'What existing functionality is most likely affected by what was just built? Give it a quick check.',
  ],
  L3: [
    'Run the tests and tell me if anything broke after what was just built was added.',
  ],
};

/** ABSENCE_SPEC_ACCEPTANCE_CASUAL — casual-register variant for pro_geek_soul and null profiles */
const ABSENCE_SPEC_ACCEPTANCE_CASUAL: DecisionContent = {
  question:      'Built something — does it match what was planned?',
  pinchFallback: 'Check the spec.',
  L1: [
    'Check what was just built against the original plan — does it actually do what it was supposed to? List anything that\'s off, missing, or different from what was asked for.',
    'Compare what was just built to what was specified — any gaps, extra bits that weren\'t asked for, or things that work differently than planned?',
    'Does what was just built handle the edge cases from the spec, or just the happy path? Flag anything that would fail on a non-standard input.',
  ],
  L2: [
    'Does what was just built match what was planned? Flag anything that\'s different or missing.',
    'What\'s the biggest gap between what was just built and what the spec asked for?',
  ],
  L3: [
    'Is there anything in what was just built that doesn\'t match what was originally planned or specified?',
  ],
};

/** ABSENCE_CROSS_CONFIRMING_CASUAL — casual-register variant for pro_geek_soul and null profiles */
const ABSENCE_CROSS_CONFIRMING_CASUAL: DecisionContent = {
  question:      'AI wrote it — have you actually checked it?',
  pinchFallback: 'Verify the output.',
  L1: [
    'Take a real look at what was just built — not just \'does it look right\', but does it actually work correctly? Check for made-up functions, wrong assumptions, or logic that sounds good but doesn\'t hold up.',
    'Walk through what was just built and check each part — is there anything that looks right but is subtly off, handles the wrong case, or references something that doesn\'t exist?',
    'Check what was just built for the classic AI mistakes — hallucinated APIs, edge cases silently skipped, or missing error handling. Flag anything you haven\'t manually verified.',
  ],
  L2: [
    'Is there anything in what was just built that you accepted without actually checking if it works correctly?',
    'Walk through the main logic in what was just built — does it actually do what you expect, or just look like it does?',
  ],
  L3: [
    'Is there anything in what was just built that was generated but you haven\'t checked for correctness yet?',
  ],
};

const ABSENCE_SECURITY_CHECK_CASUAL: DecisionContent = {
  question:      'Built something — any security checks done?',
  pinchFallback: 'Security gap.',
  L1: [
    'Look at what was just built — is there anything that handles user input or touches auth that hasn\'t been checked for obvious security problems? What could an attacker do with this as it stands?',
    'Check what was just built for the easy wins an attacker would go for first — bad input handling, missing permission checks, or anything that leaks data it shouldn\'t.',
    'Walk through what was just built as if you\'re trying to break it — what\'s the first thing you\'d try? Flag anything that looks like it could be abused.',
  ],
  L2: [
    'What\'s the biggest security risk in what was just built? Flag it and explain what needs to change.',
    'Is there anything in what was just built that handles user input or auth that hasn\'t been properly validated or checked?',
  ],
  L3: [
    'Is there anything in what was just built that could be exploited — untrusted input, missing auth, or data that shouldn\'t be exposed?',
  ],
};

const ABSENCE_ERROR_HANDLING_CASUAL: DecisionContent = {
  question:      'Feature built — what happens when it breaks?',
  pinchFallback: 'Error handling.',
  L1: [
    'Look at what was just built — what happens when something goes wrong? Check for unhandled errors, anything that fails silently, and cases where the error message would tell an attacker more than the user needs to know.',
    'Walk through the unhappy paths in what was just built — what happens when a network call fails, the input is weird, or a dependency isn\'t available? Are those cases handled, or does it just crash?',
    'Think about what was just built from the angle of things going wrong — what\'s the most likely failure, and what does the user or caller see when it happens? Is that the right behaviour?',
  ],
  L2: [
    'What\'s the most likely thing to fail in what was just built, and what happens when it does? Fix it if it\'s not handled.',
    'Is there anything in what was just built that could fail without producing a useful error message or recovering gracefully?',
  ],
  L3: [
    'Is there anything in what was just built that fails silently or doesn\'t handle the obvious error cases?',
  ],
};

const ABSENCE_DOCUMENTATION_CASUAL: DecisionContent = {
  question:      'Code written — is anything documented?',
  pinchFallback: 'Docs missing.',
  L1: [
    'Look at what was just built — what parts would confuse someone reading it for the first time? Add short comments explaining the why, not just the what, for anything that isn\'t obvious from the code itself.',
    'Check what was just built for undocumented decisions — things that would make a future developer go "why did they do it this way?" Write a quick note for each before the context is forgotten.',
    'Does anything in what was just built need a README update or a note in the docs? What would someone need to know to use or maintain this feature without asking you directly?',
  ],
  L2: [
    'What\'s the most confusing part of what was just built for someone who didn\'t write it? Add a comment or doc for that.',
    'Are there any decisions in what was just built that future-you would wonder about in six months? Document them now.',
  ],
  L3: [
    'Is there anything in what was just built that needs a comment or note to explain why it works the way it does?',
  ],
};

const ABSENCE_OBSERVABILITY_CASUAL: DecisionContent = {
  question:      'Feature built — will you know when it breaks?',
  pinchFallback: 'No observability.',
  L1: [
    'Look at what was just built — if it breaks in production tonight, what would you see in your logs? If the answer is "not much", add logging for the key events: requests coming in, failures happening, anything that changed state.',
    'Check what was just built for blind spots in production — what does it do that you currently can\'t see? Add logging or metrics for the things you\'d want to know about when something goes wrong.',
    'What\'s the first thing you\'d check if what was just built stopped working in production? Is that thing actually observable right now, or would you be flying blind?',
  ],
  L2: [
    'What would you see in your logs if what was just built failed in production right now? If not much, add logging for the key failure points.',
    'Is there anything in what was just built that could break silently in production without triggering an alert or showing up in logs?',
  ],
  L3: [
    'If what was just built broke in production, would you be able to detect it from logs or monitoring? What\'s missing?',
  ],
};

const ABSENCE_COMPREHENSION_CASUAL: DecisionContent = {
  question:      'AI wrote it — do you actually get it?',
  pinchFallback: 'Comprehension check.',
  L1: [
    'Look at what was just built — is there any part you couldn\'t explain to someone else right now? Find the bit you\'re least confident about and trace through it until you actually understand what it does.',
    'Walk through what was just built and spot the parts you accepted because they looked right, not because you verified them. Pick the riskiest one and make sure you understand it properly.',
    'Is there anything in what was just built that uses a library or approach you haven\'t used before? Make sure you understand what it does — not just that it works — before moving on.',
  ],
  L2: [
    'What\'s the part of what was just built you\'re least confident you understand? Trace through it and make sure you get it.',
    'Is there anything in what was just built you accepted without really checking the logic? Flag it and go back through it.',
  ],
  L3: [
    'Is there anything in what was just built that you haven\'t fully understood and verified yourself?',
  ],
};

const ABSENCE_REFACTORING_CASUAL: DecisionContent = {
  question:      'Long build run — anything to clean up?',
  pinchFallback: 'Refactor check.',
  L1: [
    'Look at what was just built as a whole — is there anything that\'s gotten messy, duplicated, or harder to read than it needs to be? Flag the bits that would slow down the next person who touches this.',
    'Walk through what was just built and find the thing you\'d be embarrassed to show in a code review — the copy-pasted section, the function that does too much, the name that doesn\'t mean what it says anymore. Flag it and address it.',
    'Check if what was just built fits cleanly with the rest of the codebase or if it\'s starting to diverge in style or structure. Flag anything that would make future changes harder than they need to be.',
  ],
  L2: [
    'What\'s the messiest part of what was just built? Is it worth cleaning up now before it compounds?',
    'Is there anything in what was just built that\'s duplicated, overly complex, or inconsistent with the rest of the codebase?',
  ],
  L3: [
    'Is there anything in what was just built that should be cleaned up or simplified before moving on?',
  ],
};

const ABSENCE_NO_PUSHBACK_CASUAL: DecisionContent = {
  question:      'AI keeps suggesting — are you actually evaluating?',
  pinchFallback: 'No pushback.',
  L1: [
    'Look at the AI responses that produced what was just built — is there anything you accepted without really thinking about whether it was the right call? Pick the one you\'re least sure about and push back on it now.',
    'Check how you\'ve been accepting AI suggestions for this feature — have you been approving them because they look reasonable, or because you\'ve actually thought through the alternatives? Flag the ones where you\'re not sure.',
    'Take the most recent AI suggestion used in what was just built and challenge it: what assumptions did it make, what did it not consider, and is this actually the best way to do it for this project?',
  ],
  L2: [
    'What\'s the last AI output used in what was just built that you accepted without questioning it? Push back on it now and see if it holds up.',
    'Is there anything in what was just built where you accepted what the AI said because it sounded confident, not because you verified it yourself?',
  ],
  L3: [
    'Is there any AI suggestion used in what was just built that you accepted without actually evaluating whether it was the right approach?',
  ],
};

const ABSENCE_CORRECTION_SEEKING_CASUAL: DecisionContent = {
  question:      'Has the AI checked its own work?',
  pinchFallback: 'No verification.',
  L1: [
    'Ask the AI to take a second look at what was just built — not to explain it, but to actually critique it. What would it do differently, what assumptions did it make that might be wrong, and what are the riskiest parts?',
    'Get the AI to argue against its own output for what was just built: what\'s the case against this approach, what did it not consider, and what\'s the part it\'s least confident about?',
    'Ask the AI: if you had to find a bug or a flaw in what was just built, what would it be? Don\'t let it off the hook with "it looks fine."',
  ],
  L2: [
    'Ask the AI to review what was just built as if it hadn\'t written it — what would it flag or change?',
    'Get the AI to identify the weakest part of what was just built and explain what it\'s not sure about.',
  ],
  L3: [
    'Ask the AI to identify the part of what was just built it\'s least confident is correct.',
  ],
};

const ABSENCE_PROBLEM_CORRECTION_CASUAL: DecisionContent = {
  question:      'Spotted a bug — did it actually get fixed?',
  pinchFallback: 'Bug unresolved.',
  L1: [
    'Go through what was just built and check: is there anything that was flagged as broken or wrong earlier in this session that hasn\'t actually been fixed yet? Don\'t let it get buried under new code.',
    'Look at the known issues in what was just built — anything that came up as a bug or a problem in this session. Is each one fixed, or just acknowledged and skipped over?',
    'Run the tests for what was just built and check if any of the failures match issues that were mentioned earlier in this session. If yes, fix them before adding anything new.',
  ],
  L2: [
    'Is there anything in what was just built that was identified as broken or wrong earlier in this session but hasn\'t been fixed yet?',
    'Run the tests for what was just built and check — are any of the failures from issues that were already noticed earlier and not resolved?',
  ],
  L3: [
    'Is there any bug in what was just built that was noticed earlier in this session but not explicitly fixed?',
  ],
};

const ABSENCE_ALTERNATIVES_CASUAL: DecisionContent = {
  question:      'Decision made — any alternatives looked at?',
  pinchFallback: 'No alternatives.',
  L1: [
    'Look at the biggest decision made in what was just built — is it the right call, or just the first thing that came to mind? Name one or two other ways it could have been done and explain why this approach beats them.',
    'Check the key choices made while building this feature: is there anything where you went with the first option without stopping to think if there was a better or simpler way? Flag those and evaluate them now.',
    'Think about what was just built from the angle of a different developer on a different stack — what would they have done differently, and is the current approach actually the best fit for this project?',
  ],
  L2: [
    'What\'s the most important technical choice in what was just built? Name the alternatives you didn\'t go with and confirm this is still the right call.',
    'Is there anything in what was just built where a simpler or different approach would have worked just as well — or better?',
  ],
  L3: [
    'Is there any decision in what was just built that was made without really looking at other options first?',
  ],
};

const ABSENCE_ARCH_CONFLICT_CASUAL: DecisionContent = {
  question:      'Feature added — does it fit the codebase?',
  pinchFallback: 'Arch conflict.',
  L1: [
    'Look at what was just built and check if it fits with the rest of the codebase — does it follow the same patterns, or does it do things in a new way that the rest of the project doesn\'t? Flag anything that would make a future developer say "why is this one different?"',
    'Check what was just built for places where it crosses boundaries it probably shouldn\'t, pulls in data in a way the rest of the codebase doesn\'t, or introduces a new pattern without a clear reason. Is it consistent, or is it starting to diverge?',
    'Compare what was just built to how the same kind of thing is done elsewhere in the project — same approach, or something different? If different, is there a good reason for it, or did it just happen that way?',
  ],
  L2: [
    'Does what was just built follow the same patterns as the rest of the codebase, or does it introduce something new that might conflict with what\'s already there?',
    'Is there anything in what was just built that doesn\'t fit with the way the rest of the project is structured?',
  ],
  L3: [
    'Is there anything in what was just built that doesn\'t match the patterns or structure of the existing codebase?',
  ],
};

const ABSENCE_PROMPT_CONTEXT_CASUAL: DecisionContent = {
  question:      'Sending prompts — have you shared the spec?',
  pinchFallback: 'Missing context.',
  L1: [
    'Check the prompts used to build this feature — does the AI actually know what the spec says, what the architecture looks like, and what the task is supposed to achieve? If it\'s just getting ad hoc instructions, paste the relevant context in now so it\'s building the right thing.',
    'Has the AI been working with the full picture, or just the last thing you asked it to do? If there\'s a spec, an architecture doc, or a task breakdown it hasn\'t seen yet, share it and ask it to check that what was just built matches up.',
    'Paste the relevant spec or task definition into the conversation and ask the AI to confirm that what was just built actually does what it\'s supposed to. If there\'s a mismatch, now is a better time to find it than after shipping.',
  ],
  L2: [
    'Does the AI have enough context to build this feature correctly — has it seen the spec, the architecture, or the task breakdown? If not, share the relevant bits now.',
    'Paste the spec or the definition of done for this feature into the conversation and check whether what was just built actually matches it.',
  ],
  L3: [
    'Does the AI know what the spec says for this feature, or has it been building without seeing it?',
  ],
};

const ABSENCE_ROLLBACK_PLANNING_CASUAL: DecisionContent = {
  question:      'Shipping soon — what\'s the rollback plan?',
  pinchFallback: 'No rollback plan.',
  L1: [
    'Before you ship this feature, work out what you\'d do if the deployment goes wrong — what\'s the rollback plan, how long would it take, and is there anything in this feature that can\'t be undone cleanly?',
    'Walk through what would happen if you had to roll back this feature in production tonight — what steps would you follow, what could go wrong during the rollback, and is there anything left in an inconsistent state if you do?',
    'Check the rollback risk in this feature — any database migrations, external integrations, or data changes that would be a pain to undo? Flag those before shipping and decide if you\'re okay with them.',
  ],
  L2: [
    'What\'s the rollback plan for this feature if the deployment goes sideways? Write it down — it should be something you could follow in a panic without thinking.',
    'Is there anything in this feature that can\'t be rolled back cleanly? Know that before you ship.',
  ],
  L3: [
    'Do you have a plan for rolling back this feature if the deployment fails, or would you be making it up as you go?',
  ],
};

const ABSENCE_DEPLOYMENT_PLANNING_CASUAL: DecisionContent = {
  question:      'Shipping soon — is the deployment actually planned?',
  pinchFallback: 'No deploy plan.',
  L1: [
    'Before shipping this feature, check: do you actually have a deployment plan? What environment config does it need, what secrets need to be in place, and has anything been tested outside your local setup?',
    'Walk through how this feature is actually going to get deployed — what\'s the process, what needs to be configured in the production environment, and is there anything that only exists in your local config that hasn\'t been provisioned yet?',
    'Check the gap between where this feature runs now and what production actually needs — are there environment variables, secrets, or infrastructure pieces that aren\'t set up yet? Sort those out before shipping.',
  ],
  L2: [
    'What does the production environment need to have in place before this feature can deploy cleanly? Confirm each of those is actually ready.',
    'Has this feature been tested anywhere other than your local machine? If it goes straight to production, what are you not sure about?',
  ],
  L3: [
    'Is there a deployment plan for this feature, or are you planning to figure it out when you push?',
  ],
};

const ABSENCE_DEPENDENCY_MGMT_CASUAL: DecisionContent = {
  question:      'Added packages — any issues checked?',
  pinchFallback: 'Dependency risk.',
  L1: [
    'Check the packages added in what was just built — do they conflict with anything already installed, is there a security issue with the version you picked, and is there a better or more popular alternative you didn\'t consider?',
    'Look at the new dependencies in what was just built: are they actively maintained, is the version you\'re using the latest stable one, and do they pull in anything that clashes with what\'s already in the project?',
    'Run a quick audit on the packages added in what was just built — any known CVEs in the version you\'re using, licence issues that could cause problems, or extra packages they pull in that don\'t play nice with what\'s already there?',
  ],
  L2: [
    'Have the packages added in what was just built been checked for conflicts and vulnerabilities? Run a dependency audit and flag anything suspicious.',
    'Is there any package added in what was just built that looks risky — old version, no maintenance, licence mismatch, or something that clashes with existing dependencies?',
  ],
  L3: [
    'Have the new packages added in what was just built been checked for conflicts, vulnerabilities, or licence issues?',
  ],
};

const ABSENCE_PHASE_TRANSITION_CASUAL: DecisionContent = {
  question:      'Been in this phase a while — what comes next?',
  pinchFallback: 'Phase check.',
  L1: [
    'Step back from this project and think about where you are in the overall flow — have you actually finished this phase, or have you just been in it for a while? What needs to be done before it makes sense to move on?',
    'Look at what you set out to accomplish in this phase of this project — is it done, partially done, or have you moved past it without properly closing it off? Figure out where you actually are before starting something new.',
    'Check what you set out to finish before moving on from this phase of this project — what\'s actually done, what\'s been skipped or deferred? Make a call on whether you\'re ready to transition.',
  ],
  L2: [
    'Is there anything left unfinished in the current phase of this project that should be sorted before you move on to the next one?',
    'What\'s the next phase for this project, and what needs to be in place before you can properly start it? Are those things ready?',
  ],
  L3: [
    'Is this project actually ready to move to the next phase, or has it just been in the current phase for a long time without a clear exit point?',
  ],
};

const ABSENCE_SPEC_CROSS_CONFIRM_CASUAL: DecisionContent = {
  question:      'Spec exists — has it been checked against the plan?',
  pinchFallback: 'Spec not confirmed.',
  L1: [
    'Go through this project\'s spec and check it against the original plan — does every requirement actually come from something that was agreed on, or did some assumptions sneak in that no one has explicitly signed off on?',
    'Look at this project\'s spec for anything that\'s vague enough to be interpreted two different ways — anything that could lead to building the wrong thing and still technically meeting the spec. Fix those before coding starts.',
    'Check this project\'s spec against what you can actually build with the current stack — is there anything in there that\'s going to hit a wall when someone tries to implement it? Flag those now.',
  ],
  L2: [
    'Is there any part of this project\'s spec that came from an assumption rather than something explicitly agreed on? Track those down and confirm them.',
    'Is there anything in this project\'s spec vague enough that two people could implement it differently? Clarify it now before it causes a disagreement mid-build.',
  ],
  L3: [
    'Is there anything in this project\'s spec that hasn\'t been verified against what was actually agreed on — any assumptions that are being treated as confirmed requirements?',
  ],
};

const ABSENCE_SPEC_REVISION_CASUAL: DecisionContent = {
  question:      'Spec written — has it been updated since the first draft?',
  pinchFallback: 'Spec unrevised.',
  L1: [
    'Update this project\'s spec to match what you know now — any requirements that turned out harder or simpler than expected, any edge cases that came up during building, and any things that got quietly dropped or changed in scope.',
    'Check whether this project\'s spec still matches what\'s actually being built — where have things changed since the first draft, what decisions got made during implementation that aren\'t written down, and what would a new developer get wrong by reading the original spec?',
    'Look at where this project\'s spec and the actual implementation have drifted apart — for each gap, is it that the spec needs updating, or that the implementation went in the wrong direction?',
  ],
  L2: [
    'Is this project\'s spec still accurate, or has the implementation moved on from what was originally written? Update the parts that no longer match.',
    'What\'s changed in this project since the spec was first written that isn\'t reflected in the spec yet? Update it now while the context is still fresh.',
  ],
  L3: [
    'Does this project\'s spec still reflect what\'s actually being built, or has the implementation moved on without the spec being updated?',
  ],
};

// ── Sub-4 — idea / task_breakdown / feedback_loop ─────────────────────────────

// Group A — idea signals

const ABSENCE_IDEA_SCOPING: DecisionContent = {
  question:      'Idea in mind — is the scope defined?',
  pinchFallback: 'Scope undefined.',
  L1: [
    'Define the scope of this project precisely: what is the core problem it solves, what are the primary capabilities it must deliver, and what does a complete first version look like?',
    'Write a scope statement for this project: describe the problem in one sentence, the solution in one paragraph, and draw an explicit boundary around what is and is not included in the initial version.',
    'Cross-confirm the project scope: summarize in your own words what this project is, what problem it solves, and what \'built\' means for this project — then flag what is still ambiguous or undefined.',
  ],
  L2: [
    'Summarize the scope of this project in three sentences: the problem, the core solution, and the boundary of the first version.',
    'What is the single most important thing to define about this project before building starts? Articulate it precisely.',
  ],
  L3: [
    'What is this project, what problem does it solve, and what will the first version include?',
  ],
};

const ABSENCE_IDEA_SCOPING_CASUAL: DecisionContent = {
  question:      'Idea forming — what exactly are we building?',
  pinchFallback: 'Scope unclear.',
  L1: [
    'Walk me through this project — what\'s the main idea, what problem does it solve, and what\'s in vs out for the first version?',
    'What exactly are we building here? Describe this project in your own words — what it does, why it exists, and where the line is on what\'s included first.',
    'Summarize this project back to me in your own words — what it does, what problem it solves, and what \'done\' looks like. Flag anything that still feels fuzzy.',
  ],
  L2: [
    'What\'s this project and what\'s it supposed to do for the first version? Give me the short version.',
    'What\'s the most important thing to pin down about this project before we start building?',
  ],
  L3: [
    'What is this project and what will it do?',
  ],
};

const ABSENCE_IDEA_CONSTRAINT_CHECK: DecisionContent = {
  question:      'Idea scoped — are the non-goals defined?',
  pinchFallback: 'Non-goals missing.',
  L1: [
    'Define the constraints and non-goals for this project: what is explicitly out of scope for the first version, what functionality will not be built, and what technical constraints limit the solution space?',
    'Identify the boundary conditions of this project: what adjacent problems will not be solved, what user requests will be deferred, and what are the explicit constraints on scope, technology, or resources?',
    'Write the non-goals section for this project: list at least three things this project will not do, at least one technical constraint, and at least one explicit decision to defer for a future version.',
  ],
  L2: [
    'What are the top three things this project will not do in the first version? Document them explicitly so they do not creep in during implementation.',
    'What is the clearest out-of-scope decision for this project? State it as an explicit non-goal.',
  ],
  L3: [
    'What is one thing this project will not do, and why is that boundary important to state now?',
  ],
};

const ABSENCE_IDEA_CONSTRAINT_CHECK_CASUAL: DecisionContent = {
  question:      'Idea forming — what\'s out of scope?',
  pinchFallback: 'No non-goals set.',
  L1: [
    'What are we NOT building in the first version of this project? Walk me through what\'s intentionally out of scope — things that could be asked for but we\'re not doing yet.',
    'What are the constraints on this project? What won\'t it do, what can\'t it do, and what have we decided to skip for now?',
    'List the things this project will not do — at least three things that could be asked for but are deliberately left out. Then tell me which one is most likely to cause confusion if it\'s not stated clearly.',
  ],
  L2: [
    'What\'s one thing this project won\'t do — something someone might expect it to do but we\'re leaving out? State it clearly.',
    'What are we keeping out of this project on purpose? Give me the short list.',
  ],
  L3: [
    'Name one thing this project will not do that should be stated clearly before we start building.',
  ],
};

const ABSENCE_IDEA_USER_DEFINITION: DecisionContent = {
  question:      'Idea scoped — is the target user defined?',
  pinchFallback: 'Target user undefined.',
  L1: [
    'Define the target user for this project precisely: who is the primary user, what is their context and skill level, what problem do they have that this project solves, and what does success look like from their perspective?',
    'Write a target user profile for this project: describe who will use it, what they are trying to accomplish, what they already know and do not know, and how this project fits into their workflow.',
    'Cross-confirm the target user definition for this project: given what has been described, who is this project for, who is explicitly not the target user, and what does that boundary imply for the feature set?',
  ],
  L2: [
    'Who is the primary user of this project and what are they trying to accomplish? Define them precisely enough that you could make a product decision on their behalf.',
    'What does the target user of this project already know and not know? That context will drive every design decision.',
  ],
  L3: [
    'Who is this project for, and what are they trying to do?',
  ],
};

const ABSENCE_IDEA_USER_DEFINITION_CASUAL: DecisionContent = {
  question:      'Idea forming — who is this actually for?',
  pinchFallback: 'User not defined.',
  L1: [
    'Who is this project for? Walk me through who the main user is, what they\'re trying to do, and what they know going in — be specific enough that we could make decisions about this project on their behalf.',
    'Describe the person who\'ll use this project — who they are, what they want to do with it, and what level of experience they have. Then tell me who it\'s definitely NOT for.',
    'Think about the person using this project — who are they? Describe them to me, including what problem they have and how this project fits into what they\'re already doing.',
  ],
  L2: [
    'Who\'s the main person this project is for? Give me enough detail that we could make a feature decision based on what they need.',
    'What does the person using this project actually want to do with it? Describe them simply.',
  ],
  L3: [
    'Who is this project for and what are they trying to do?',
  ],
};

// Group B — task_breakdown signals

const ABSENCE_TASK_ORDERING: DecisionContent = {
  question:      'Tasks listed — have they been ordered?',
  pinchFallback: 'Tasks unordered.',
  L1: [
    'Order the tasks for this project by dependency and priority: identify which tasks block others, which can be done in parallel, and establish the sequence that minimises rework and delivers the earliest working state.',
    'Review the task list for this project and establish an explicit order: which task must be done first, which tasks have hard dependencies on others, and what is the critical path to a testable first version?',
    'Prioritize the task list for this project: rank tasks by impact and dependency, identify the single highest-priority task to start with, and flag any tasks that should be deferred until a working core is established.',
  ],
  L2: [
    'What is the correct order of tasks for this project? Identify the first three tasks in sequence and explain why each one must come before the next.',
    'Which task in this project should be done first, and why? Establish the top of the ordered list before anything else starts.',
  ],
  L3: [
    'What is the first task to work on for this project, and what does it unblock?',
  ],
};

const ABSENCE_TASK_ORDERING_CASUAL: DecisionContent = {
  question:      'Tasks listed — what order do we do them in?',
  pinchFallback: 'No order set.',
  L1: [
    'Put the tasks for this project in order — which ones have to happen before others, which ones are independent, and what\'s the sequence that gets us to something working as fast as possible?',
    'Look at the task list for this project and sort it — what comes first, what depends on what, and what\'s the critical path to something we can actually test?',
    'What\'s the right order to tackle the tasks for this project? Rank them by what\'s blocking what, and tell me which task to start with and why.',
  ],
  L2: [
    'What are the first three tasks for this project in order? Tell me what order makes sense and why.',
    'Which task should we do first for this project and why does it come before everything else?',
  ],
  L3: [
    'What\'s the first task to work on for this project?',
  ],
};

const ABSENCE_TASK_SIZING: DecisionContent = {
  question:      'Tasks defined — are they scoped to single sessions?',
  pinchFallback: 'Tasks oversized.',
  L1: [
    'Review the task list for this project and validate sizing: each task should be completable in a single focused session. Identify any tasks that span multiple concerns, require too many unknowns to resolve in one sitting, or are so large that progress cannot be verified at the end of a session.',
    'Break down any oversized tasks in this project: for each task that could not be completed in a single session, decompose it into subtasks — each subtask should have a clear output that can be verified when done.',
    'Assess the scope of each task for this project: flag any that are too large to complete in one session, too vague to know when they\'re done, or dependent on so many unknowns that work could not proceed without stopping midway.',
  ],
  L2: [
    'Which tasks in this project are too large to finish in a single session? Break the largest one down into smaller units now.',
    'Is there any task in this project that could not be completed in a single focused session? Identify it and propose how to split it.',
  ],
  L3: [
    'Identify any task in this project that is too large to finish in a single session and break it into smaller units.',
  ],
};

const ABSENCE_TASK_SIZING_CASUAL: DecisionContent = {
  question:      'Tasks listed — are they small enough to do in one go?',
  pinchFallback: 'Tasks too big.',
  L1: [
    'Go through the tasks for this project — are any of them too big to finish in one session? If so, break them down into smaller pieces that each have a clear endpoint.',
    'Check the task list for this project: which tasks are small enough to finish in one focused session, and which ones are really multiple tasks lumped together? Split the big ones.',
    'Is any task in this project too big to do in one go? Walk me through the tasks and flag anything that would require stopping midway because there\'s too much or too many unknowns.',
  ],
  L2: [
    'Which task in this project feels the biggest? Break it down into two or three smaller tasks that could each be finished in one session.',
    'Are the tasks for this project small enough to finish one at a time, or do any of them need to be split up?',
  ],
  L3: [
    'Is there any task in this project that\'s too big to do in one session?',
  ],
};

const ABSENCE_TASK_DEFINITION_OF_DONE: DecisionContent = {
  question:      'Tasks ordered — does each task have a definition of done?',
  pinchFallback: 'No done criteria.',
  L1: [
    'Define the completion criteria for each task in this project: for every task, state what must be true for the task to be considered complete — what output exists, what has been verified, and what has not been left in an ambiguous or partially done state.',
    'Audit the task list for this project for missing definitions of done: identify every task that lacks explicit completion criteria, then define what \'done\' means for each — the specific, verifiable condition that ends work on that task.',
    'Write the definition of done for the highest-priority task in this project: what is the exact state of the codebase, tests, and documentation when this task is complete? Use that as a template to define done for the remaining tasks in this project.',
  ],
  L2: [
    'For each task in this project, write one sentence stating what \'done\' looks like — a specific, verifiable condition, not a vague description of intent.',
    'Which task in this project is missing the clearest definition of done? Define what completion looks like for that task before it starts.',
  ],
  L3: [
    'Does every task in this project have a clear, verifiable definition of done, or are any tasks missing that?',
  ],
};

const ABSENCE_TASK_DEFINITION_OF_DONE_CASUAL: DecisionContent = {
  question:      'Tasks set — how do we know when each one\'s done?',
  pinchFallback: 'Done criteria missing.',
  L1: [
    'For each task in this project, define what done looks like — not just \'it works\' but what specifically is true when the task is finished. What can be checked? What exists that didn\'t before?',
    'Go through the tasks for this project and for each one, write what \'done\' means — the specific thing you\'d check to know it\'s complete. No vague descriptions, just the actual finish line.',
    'Pick the most important task for this project and tell me exactly what done looks like for it — what\'s been built, what\'s been tested, what\'s been verified. Use that as a template to define done for the remaining tasks in this project.',
  ],
  L2: [
    'What does done look like for each task in this project? Write a one-liner for each that describes the specific finish line.',
    'Is there any task in this project where it\'s not clear how we\'d know it\'s done? Define the finish line for that one first.',
  ],
  L3: [
    'How do we know when the first task in this project is done?',
  ],
};

// Group C — feedback_loop signals

const ABSENCE_USER_FEEDBACK_REVIEW: DecisionContent = {
  question:      'Feedback received — has it been reviewed systematically?',
  pinchFallback: 'Feedback not reviewed.',
  L1: [
    'Review the feedback received for this project systematically: collect all available feedback, categorize it by theme or feature area, and identify the recurring complaints, requests, and points of confusion that appear across multiple users.',
    'Analyze the feedback for this project for patterns: what issues surface most frequently, which complaints indicate users cannot complete their primary goal, and where does actual behavior diverge most from what was expected?',
    'Prioritize the feedback for this project by impact: distinguish critical feedback (blocking users from their goal) from high-friction feedback (users struggle but succeed) from low-signal noise, and establish which issues demand immediate action.',
  ],
  L2: [
    'What is the most critical piece of feedback for this project — the one issue that, if left unaddressed, blocks users from achieving their primary goal?',
    'What are the top two or three recurring themes across all feedback for this project?',
  ],
  L3: [
    'What are users saying about this project, and what is the most critical issue in the feedback?',
  ],
};

const ABSENCE_USER_FEEDBACK_REVIEW_CASUAL: DecisionContent = {
  question:      'Feedback in — have we actually gone through it?',
  pinchFallback: 'Feedback not reviewed.',
  L1: [
    'Go through the feedback for this project — collect what users have said, group it by theme, and tell me what comes up over and over. What are the most common complaints or requests?',
    'What patterns are you seeing in the feedback for this project? Walk me through what users are saying — what are the recurring issues, and where are people getting stuck?',
    'Look at the feedback for this project and rank it — what\'s critical (users can\'t do what they need to do), what\'s high friction (they get there but it\'s painful), and what\'s just noise? Tell me what needs to be fixed first.',
  ],
  L2: [
    'What\'s the most critical piece of feedback for this project — the one thing that, if we don\'t fix it, blocks users from doing what they came here to do?',
    'What are the top two or three things users keep saying about this project?',
  ],
  L3: [
    'What are users saying about this project?',
  ],
};

const ABSENCE_ITERATION_PLANNING: DecisionContent = {
  question:      'Feedback reviewed — has the next iteration been planned?',
  pinchFallback: 'Next iteration unplanned.',
  L1: [
    'Define the priorities for the next iteration of this project based on the feedback: rank the issues identified, determine what must be addressed in this iteration versus what can be deferred, and establish the scope of the next version.',
    'Identify the trade-offs for the next iteration of this project: which feedback-driven changes deliver the highest impact for the lowest effort, which require significant rework, and what should be deferred to preserve shipping velocity?',
    'Write the success criteria for the next iteration of this project: given the feedback received, what specific, measurable outcomes would confirm the next iteration resolved the most critical user issues?',
  ],
  L2: [
    'What are the top three changes to make in the next iteration of this project, ordered by priority? Identify them from the feedback.',
    'What is the single most important thing to build or fix in the next iteration of this project, and why does it take priority over everything else?',
  ],
  L3: [
    'What is the first change to make in the next iteration of this project based on what users said?',
  ],
};

const ABSENCE_ITERATION_PLANNING_CASUAL: DecisionContent = {
  question:      'Feedback reviewed — what are we building next?',
  pinchFallback: 'Next iteration unplanned.',
  L1: [
    'Figure out what to build next for this project based on the feedback — what needs to be fixed or added in the next round, what can wait, and what\'s the scope of the next version?',
    'Look at the feedback for this project and tell me what the trade-offs are for the next round — what\'s high impact and quick to do, what\'s a big change that needs more thought, and what should we hold off on?',
    'What does success look like for the next version of this project? Given what users said, what specific things would tell us the next iteration actually fixed the problems?',
  ],
  L2: [
    'What are the top three things to work on next for this project based on the feedback? Put them in priority order.',
    'What\'s the single most important thing to fix or build next for this project, and why does it come first?',
  ],
  L3: [
    'What\'s the first thing to build or fix in the next version of this project?',
  ],
};

// ── Sub-7 — formal content sets ───────────────────────────────────────────────

const ABSENCE_SCOPE_CREEP: DecisionContent = {
  question:      'Scope expanding — still on original plan?',
  pinchFallback: 'Scope check?',
  L1: [
    'Audit what was just built against the original scope for this iteration: list what is complete, what is still in progress, and what has been added that was not in the original plan — and decide whether each addition stays in scope, gets deferred, or gets cut.',
    'List every behaviour and feature added to this feature since implementation began — for each item, confirm whether it was in the agreed scope or was introduced along the way, and make a call: keep it, defer it, or cut it.',
    'Write a scope summary for this project before continuing: what was the original plan for this iteration, what is now in the implementation, and what is the delta — treat anything outside the original plan as a decision that must be made now.',
  ],
  L2: [
    'What was the original scope for this feature, and does the current implementation match it — or has it grown beyond the plan?',
    'What is the most important addition to what was just built that was not in the original scope — and what is the decision on it: in, deferred, or cut?',
  ],
  L3: [
    'What is one thing currently in this feature that was not in the original scope for this session?',
  ],
};

const ABSENCE_CONTEXT_LOSS: DecisionContent = {
  question:      'Long session — context recapped?',
  pinchFallback: 'Context recap?',
  L1: [
    'Summarize the current state of what was just built: what decisions have been made, what is working, what remains incomplete, and what has changed since the session started — use this as a re-anchor before continuing.',
    'Write a session summary for this project: what has been implemented, what the key technical decisions were, what the current blockers are, and what the next two or three steps are.',
    'Before continuing work on this feature: list every significant decision made in this session, the current working state of the implementation, and what remains to complete the agreed scope — this prevents the session from drifting.',
  ],
  L2: [
    'What is the current state of what was just built — what is working, what is still in progress, and what is the immediate next step?',
    'What is the most important technical decision made this session about this feature that must be explicitly carried forward before continuing?',
  ],
  L3: [
    'What is the one piece of context about this project that must not be lost before continuing — the single most important thing to anchor right now?',
  ],
};

const ABSENCE_API_DESIGN_REVIEW: DecisionContent = {
  question:      'API being built — design reviewed?',
  pinchFallback: 'API design?',
  L1: [
    'Review the API surface of what was just built for backwards compatibility: list any changes to existing endpoints, parameters, or response shapes, and confirm whether each change is backwards compatible or constitutes a breaking change that requires a version bump.',
    'Define the contract for this feature\'s API before finalizing implementation: document the endpoint paths, accepted inputs, response shapes, and any error codes — confirm these are stable and not likely to change once consumers depend on them.',
    'Establish the versioning strategy for this project\'s API: will breaking changes be managed through URL versioning, header versioning, or deprecation notices — and does the current implementation reflect that strategy?',
  ],
  L2: [
    'Does what was just built introduce any breaking changes to the existing API contract — and if so, what is the plan for consumers already depending on the current contract?',
    'Is the API surface of this feature explicitly documented and locked before implementation continues — or are the endpoint signatures, inputs, and responses still in flux?',
  ],
  L3: [
    'What is the most important API design decision for this feature that needs to be made before the implementation is considered complete?',
  ],
};

const ABSENCE_ACCESSIBILITY: DecisionContent = {
  question:      'UI being built — accessibility checked?',
  pinchFallback: 'Accessibility?',
  L1: [
    'Audit the ARIA labelling and semantic structure of what was just built: identify every interactive element and confirm it has an accessible name — via native semantics, aria-label, or aria-labelledby — and that its role is correctly communicated to assistive technologies.',
    'Test keyboard navigation for this feature: tab through every interactive element and confirm the tab order is logical, all interactive elements are reachable by keyboard, no focus is trapped unexpectedly, and all actions achievable with a mouse are also achievable without one.',
    'Review the visual accessibility of what was just built: check that all text meets WCAG AA contrast ratios against its background, that focus states are visually distinct, and that no information is conveyed by colour alone.',
  ],
  L2: [
    'Can a keyboard-only user complete the primary workflow in this feature without a mouse — and is the focus order logical as they tab through?',
    'Does every interactive element in what was just built have an accessible name that a screen reader would announce correctly?',
  ],
  L3: [
    'What is the most significant accessibility gap in this feature that a user with a disability would encounter right now?',
  ],
};

const ABSENCE_ENV_AND_SECRETS: DecisionContent = {
  question:      'Credentials in use — secrets management reviewed?',
  pinchFallback: 'Secrets setup?',
  L1: [
    'Audit the secrets storage pattern for what was just built: identify every credential, API key, and environment-specific value used — confirm none are hardcoded in source, all are loaded from environment variables, and the variable names are documented in a `.env.example` file.',
    'Review the environment configuration for this feature: confirm a `.env.example` exists with all required keys (values redacted), that `.env` is in `.gitignore`, and that any secret loaded at runtime has a clear failure path if the variable is missing.',
    'Define the secret rotation plan for this project: for each credential in use, identify who holds it, how it gets rotated if compromised, and whether the current implementation supports hot-swapping secrets without a redeploy.',
  ],
  L2: [
    'Are there any hardcoded credentials, API keys, or secrets in what was just built — and if so, what is the remediation plan before this reaches production?',
    'Is there a `.env.example` that documents every environment variable required by this feature, and is the actual `.env` file excluded from source control?',
  ],
  L3: [
    'What is the most sensitive credential used by this feature — and where is it currently stored?',
  ],
};

const ABSENCE_DATA_VALIDATION: DecisionContent = {
  question:      'Accepting input — data validation in place?',
  pinchFallback: 'Input validation?',
  L1: [
    'Define the input schema for what was just built: for every endpoint or form, document the expected shape — required fields, optional fields, data types, and any constraints (min/max, allowed values) — and implement schema validation using a library such as Zod, Yup, or Joi.',
    'Audit the validation coverage for this feature: for each input accepted, confirm there is an explicit check for required fields, correct data types, and acceptable value ranges — and that invalid inputs return a clear, descriptive error rather than failing silently or crashing.',
    'Write the unhappy-path scenarios for data validation in this project: what happens when a required field is missing, when a value is the wrong type, and when the payload structure is completely unexpected — confirm the implementation handles each case explicitly.',
  ],
  L2: [
    'Is there a schema validation layer for what was just built that rejects malformed inputs before they reach the business logic — and which library or approach is being used?',
    'What are the required fields for each input accepted by this feature, and what happens if any of them are missing or the wrong type?',
  ],
  L3: [
    'What is one input accepted by this feature that currently has no validation — and what is the worst-case outcome if it receives unexpected data?',
  ],
};

const ABSENCE_CI_PIPELINE: DecisionContent = {
  question:      'Moving toward release — CI pipeline configured?',
  pinchFallback: 'CI pipeline?',
  L1: [
    'Confirm automated test execution is configured for this project: check that a CI workflow (e.g. GitHub Actions) runs the full test suite on every pull request and push to main — verify the workflow file exists, the test command is correct, and test failures block merges.',
    'Review the CI build verification for this feature: confirm that a failing build — compilation errors, type errors, or broken imports — is caught automatically before code reaches the main branch, and that the pipeline status is visible on every pull request.',
    'Audit the CI pipeline coverage for what was just built: list every check currently configured (tests, linting, type-checking, security scans), confirm each is wired up correctly, and identify any verification that runs locally but is missing from the pipeline.',
  ],
  L2: [
    'Does this project have a CI pipeline that automatically runs its tests on every pull request — and does a test failure block a merge?',
    'What does the CI pipeline for this feature actually verify — and is there anything checked locally during development that is not running automatically in CI?',
  ],
  L3: [
    'What is the most important automated check missing from the CI pipeline for this project right now?',
  ],
};

const ABSENCE_RATE_LIMITING: DecisionContent = {
  question:      'API endpoint built — rate limiting designed?',
  pinchFallback: 'Rate limiting?',
  L1: [
    'Define the rate limiting strategy for what was just built: specify the throttle limits per user, per API key, or per IP address — confirm which identifier is used for tracking, what the limit is (requests per second or per minute), and what happens when the limit is exceeded.',
    'Design the throttle response for this feature: when a caller exceeds the rate limit, confirm the API returns a 429 status with a `Retry-After` header or equivalent signal — and document the expected backoff behaviour for clients.',
    'Establish the quota model for this project: decide whether rate limits are applied per second, per minute, or per hour, whether limits differ by user tier or API key, and whether the throttle resets on a rolling window or a fixed interval.',
  ],
  L2: [
    'What is the per-user or per-key request limit for what was just built — and is there any middleware or layer currently enforcing that limit?',
    'What response does this feature return when a caller is throttled — and does the response include enough information for the client to know when to retry?',
  ],
  L3: [
    'What is the most likely way this feature gets abused through excessive requests — and is there any throttle mechanism currently in place to prevent it?',
  ],
};

const ABSENCE_FEATURE_SCOPE: DecisionContent = {
  question:      'Feature started — Definition of Ready confirmed?',
  pinchFallback: 'Scope this first.',
  L1: [
    'Define the scope and acceptance criteria for this feature before implementation continues: what is the feature doing, what are the explicit out-of-scope items, and what conditions must be true for the feature to be accepted as done? This is the Definition of Ready for sprint planning.',
    'Write a feature specification before proceeding: intended behaviour, input/output contract, acceptance criteria (at least 3 scenarios covering happy path and key edge cases), and explicit scope boundaries. Implementation without this is a Definition of Ready violation.',
    'Cross-confirm the feature scope: given what has been built so far in this session, is there a written definition of what the feature does and how it will be accepted? If not, define it now — spec the behaviour before writing more code.',
  ],
  L2: [
    'State the acceptance criteria for this feature: what specific conditions must be true for this feature to be considered complete and ready for review?',
    'Define the scope boundary: what does this feature do, and what is explicitly deferred or out of scope? One paragraph before continuing implementation.',
  ],
  L3: [
    'What are the acceptance criteria for this feature? List them before adding more code.',
  ],
};

const ABSENCE_IMPLEMENTATION_CHECKPOINT: DecisionContent = {
  question:      'Implementation continued — current state verified?',
  pinchFallback: 'Verify first.',
  L1: [
    'Run an implementation checkpoint before continuing: verify the last unit of work is in a passing state — either by running the relevant tests or by manually tracing the main path through the recently added code. Per TDD Red-Green-Refactor practice, only continue building once the current state is green.',
    'Apply the TDD feedback loop to the last change: does what was just built satisfy its stated requirement? Trace the code path, run the tests if they exist, and confirm the current state is working before layering the next change on top of it.',
    'Checkpoint the implementation before proceeding: what is the current state — working, broken, or untested? Identify the specific condition that confirms this unit of work is done and verify it now.',
  ],
  L2: [
    'Before the next implementation step — does the current build pass? Run existing tests or manually verify the most recent change against its requirements.',
    'What was the last thing built, and is it verified to work? Run the tests or do a quick manual trace before continuing.',
  ],
  L3: [
    'Verify the last change works before adding the next one — run tests or manually confirm the current build is functional.',
  ],
};

const ABSENCE_SPEC_BEFORE_CODE: DecisionContent = {
  question:      'Implementation started — behaviour specified first?',
  pinchFallback: 'Spec before code.',
  L1: [
    'Write a behaviour specification before continuing implementation: using BDD Given/When/Then format, define at least the primary scenario — Given [context], When [action], Then [expected outcome]. Per spec-driven development practice, the specification is the source of truth; code is the verification.',
    "Define the acceptance criteria for what is being built before writing more code: what specific behaviour must be true for this implementation to be considered correct? Per Dan North's BDD principle: 'a story's behaviour is simply its acceptance criteria' — write them before you implement.",
    'Apply spec-first discipline to the current implementation unit: write the expected behaviour (inputs, process, outputs, error cases) before continuing. This is the boundary between planning and execution — the spec defines the target, implementation verifies against it.',
  ],
  L2: [
    'Write the Given/When/Then scenario for what is being built before adding more code: what context, what action, and what expected outcome?',
    'Define the expected behaviour of this implementation unit before continuing: what must be true for this to be considered correct?',
  ],
  L3: [
    'Write one Given/When/Then scenario for what is being built before the next implementation step.',
  ],
};

// ── Sub-7 — casual content sets ───────────────────────────────────────────────

const ABSENCE_SCOPE_CREEP_CASUAL: DecisionContent = {
  question:      'Scope expanding — still on original plan?',
  pinchFallback: 'Scope check?',
  L1: [
    'Take a look at what was just built and compare it to what you originally set out to do — is anything in there that wasn\'t part of the plan? Go through it and flag any extras before adding more.',
    'Think about what this feature was supposed to do when you started — has anything crept in that wasn\'t in the original idea? Go through it and decide what to keep, what to push to later, and what to drop.',
    'Before going further with this project — list what you originally planned to build this session and what\'s actually in there now. For anything extra, make a call: now, later, or never.',
  ],
  L2: [
    'What did you originally set out to build in this feature, and does what\'s there now actually match that — or has it grown?',
    'What\'s the most important thing added to what was just built that wasn\'t part of the original plan — and what are you going to do with it?',
  ],
  L3: [
    'What\'s one thing in this feature that ended up there but wasn\'t in the original plan?',
  ],
};

const ABSENCE_CONTEXT_LOSS_CASUAL: DecisionContent = {
  question:      'Long session — context recapped?',
  pinchFallback: 'Context recap?',
  L1: [
    'Let\'s get back on the same page — go through what was just built and give me a quick rundown: what\'s done, what\'s working, and what\'s still left to do.',
    'Take a minute to catch up on this project — what have we actually built this session, what decisions did we make, and what\'s coming next?',
    'Before going further with this feature — do a quick check: where are we, what\'s working, and what\'s the next thing that actually needs to happen?',
  ],
  L2: [
    'What\'s the situation with what was just built right now — what\'s working and what still needs to happen?',
    'What\'s the most important decision we made about this feature this session that you want to make sure we don\'t lose track of?',
  ],
  L3: [
    'What\'s the one thing you most need to remember about where this project is right now before you keep going?',
  ],
};

const ABSENCE_API_DESIGN_REVIEW_CASUAL: DecisionContent = {
  question:      'API being built — design reviewed?',
  pinchFallback: 'API design?',
  L1: [
    'Take a look at what was just built and check whether it could break anything that already uses this API — are there any changes to how endpoints work, what they expect, or what they return that might surprise existing callers?',
    'Before locking in the API for this feature — go through what it accepts and what it returns, and think about whether that\'s something you\'d be comfortable with other code depending on. Is anything likely to change again?',
    'Think about how this project\'s API handles changes over time — if something needs to change in a future version, how do you manage that without breaking code that\'s already using it?',
  ],
  L2: [
    'Does what was just built change how the API works in a way that could break something already depending on it — and if so, what\'s the plan?',
    'Is the shape of this feature\'s API settled enough that you\'re comfortable building other things on top of it — or is it likely to change?',
  ],
  L3: [
    'What\'s the most important API design question about this feature that hasn\'t been answered yet?',
  ],
};

const ABSENCE_ACCESSIBILITY_CASUAL: DecisionContent = {
  question:      'UI being built — accessibility checked?',
  pinchFallback: 'Accessibility?',
  L1: [
    'Go through what was just built and check whether a screen reader could make sense of it — does every button and link have a clear label, and are there any parts that would be confusing or silent for someone using one?',
    'Try using this feature with just the keyboard — no mouse. Can you get to everything, use everything, and does the tab order feel natural? Note anything that gets stuck or hard to reach.',
    'Take a look at the visual design of this feature from an accessibility angle — is the contrast readable, are focus states visible when you tab through, and is anything communicated only through colour that a colour-blind user might miss?',
  ],
  L2: [
    'Could someone who can\'t use a mouse still complete the main task in this feature using only the keyboard — and does tabbing through it feel natural?',
    'Does everything in what was just built have a label that a screen reader would announce — so someone who can\'t see the screen knows what each button and input is for?',
  ],
  L3: [
    'What\'s the one accessibility issue in this feature that would most get in the way of someone with a disability using it?',
  ],
};

const ABSENCE_ENV_AND_SECRETS_CASUAL: DecisionContent = {
  question:      'Credentials in use — secrets management reviewed?',
  pinchFallback: 'Secrets setup?',
  L1: [
    'Take a look at what was just built and check whether any API keys, passwords, or credentials are written directly into the code — if so, move them out now and load them from a separate config file instead.',
    'Go through the environment setup for this feature — is there a `.env.example` file that lists every variable the app needs to run? Does the real `.env` file stay out of the repo?',
    'Think about what happens if one of the secrets used by this project gets leaked or needs to be changed — how would you swap it out, and does the current setup make that easy or painful?',
  ],
  L2: [
    'Is there anything in what was just built that has a real password, API key, or token written directly into the code rather than loaded from a config file?',
    'What happens in this feature if a required environment variable isn\'t set — does something break immediately with a clear message, or does it fail in a confusing way later?',
  ],
  L3: [
    'Where are the passwords and API keys for this feature sitting right now — are they safe, or is there something that needs to move?',
  ],
};

const ABSENCE_DATA_VALIDATION_CASUAL: DecisionContent = {
  question:      'Accepting input — data validation in place?',
  pinchFallback: 'Input validation?',
  L1: [
    'Take a look at what was just built and check what happens when someone sends unexpected data — a missing field, the wrong type, or a completely random value. Is the app handling it gracefully or just crashing?',
    'Go through the inputs this feature accepts and think about what you\'re actually checking before using that data — are the required fields being verified, are the types right, and is there a clear error when something is off?',
    'Think about the worst data someone could realistically send to this project — a payload that\'s completely wrong, a value that would confuse the logic, or a field that shouldn\'t be there at all — and confirm the current code handles it.',
  ],
  L2: [
    'Is there anything in what was just built that accepts data from outside and uses it directly without first checking that it\'s in the right shape?',
    'What happens in this feature if a required field is missing from the input — does it fail clearly with a useful message, or does it just break in a confusing way?',
  ],
  L3: [
    'What\'s one input this feature accepts that isn\'t being validated yet?',
  ],
};

const ABSENCE_CI_PIPELINE_CASUAL: DecisionContent = {
  question:      'Moving toward release — CI pipeline configured?',
  pinchFallback: 'CI pipeline?',
  L1: [
    'Take a look at whether this project has something set up to automatically run the tests whenever code is pushed — if not, setting up a simple GitHub Actions workflow now means you catch failures before they reach the main branch.',
    'Go through what a CI run actually does for this feature — when someone pushes code, does it automatically run the tests and stop a bad merge if something fails?',
    'Think about what was just built and whether the CI pipeline is actually checking everything it should — are the tests running, is the build being verified, and is anything important only being checked locally but not automatically?',
  ],
  L2: [
    'Does this project run its tests automatically whenever code is pushed — and does it stop a bad merge if the tests fail?',
    'Is there anything about this feature that gets checked by hand during development but isn\'t running automatically in CI — and should it be?',
  ],
  L3: [
    'What\'s the most important thing the CI pipeline should be catching for this project that it isn\'t catching right now?',
  ],
};

const ABSENCE_RATE_LIMITING_CASUAL: DecisionContent = {
  question:      'API endpoint built — rate limiting designed?',
  pinchFallback: 'Rate limiting?',
  L1: [
    'Take a look at what was just built and think about what happens if someone calls this endpoint way too many times in a short period — is there anything stopping them from doing that, and if not, what would happen to the app?',
    'Think about how this feature handles someone who keeps hammering the API — what does it tell them when they\'ve made too many requests, and does it give them enough info to know when to try again?',
    'Go through the rate limiting design for this project — how many requests does a user or API key get before they\'re throttled, does the limit reset every minute or every hour, and does it work the same way for everyone?',
  ],
  L2: [
    'Is there anything in what was just built that prevents a single user or caller from hitting the endpoint too many times — and if not, is that something that needs to be added?',
    'What does this feature say back to someone who\'s sent too many requests — do they get a useful response that tells them when they can try again?',
  ],
  L3: [
    'What\'s the most realistic way this feature gets overwhelmed by too many requests — and is there anything in place right now to prevent that?',
  ],
};

const ABSENCE_FEATURE_SCOPE_CASUAL: DecisionContent = {
  question:      'Started building — is scope defined?',
  pinchFallback: 'What\'s in scope?',
  L1: [
    'Before going further — write a quick scope statement for this feature: what it does, what it doesn\'t do, and what done looks like. One paragraph is enough. This prevents mid-build scope drift.',
    'Quick scope check: what exactly is this feature supposed to do, and what would confirm it\'s working correctly? Define the boundaries before continuing — it saves rework.',
    'Write a one-sentence definition of done for this feature before the next prompt. What needs to be true for this to be \'finished\' — not perfect, just done?',
  ],
  L2: [
    'What are the 2-3 things this feature must do to be considered complete? List them before continuing.',
    'Scope check: what is this feature doing, and what is it explicitly NOT doing? Quick answer before next step.',
  ],
  L3: [
    'What does \'done\' look like for this feature? One sentence before continuing.',
  ],
};

const ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL: DecisionContent = {
  question:      'Kept building — is the last change verified?',
  pinchFallback: 'Checkpoint.',
  L1: [
    'Quick checkpoint before continuing — does what was last built actually work end to end? Try running it or walk through the main path manually. If it\'s broken, fix it now before the next change makes the bug harder to locate.',
    'Smoke test the last change before adding more: what\'s the simplest way to verify it works right now? Run it or try the main path and report what you get.',
    'Before moving to the next feature — does everything built so far still work? Quick manual check: try the main flow and flag anything that looks off.',
  ],
  L2: [
    'Does the last change work? Run it or try it manually before continuing — one quick verification before the next prompt.',
    'Checkpoint: what\'s the most recent thing that was built, and does it actually work? Verify before adding anything else.',
  ],
  L3: [
    'Does what was last built work? Quick try before the next step.',
  ],
};

const ABSENCE_SPEC_BEFORE_CODE_CASUAL: DecisionContent = {
  question:      'Building this — behaviour defined first?',
  pinchFallback: 'Spec it first.',
  L1: [
    'Before writing more code — write a quick behaviour spec: what inputs does this take, what should it do, and what output or side effect should it produce? One paragraph is enough. Spec before code avoids building the wrong thing.',
    'Define the expected behaviour before implementing: given X (the context), when Y (the trigger), then Z (the outcome). Even one sentence of Given/When/Then saves more time than it takes to write.',
    'Quick spec before continuing: what is this code supposed to DO? Not how — what. Describe the behaviour in plain terms, then implement against that description.',
  ],
  L2: [
    'What should this do? Describe the expected behaviour in one or two sentences before writing the implementation.',
    'Spec this out before coding it: what\'s the input, what happens, what\'s the expected output? Quick answer first.',
  ],
  L3: [
    'What is this supposed to do? One sentence spec before the next prompt.',
  ],
};

// ── Phase 5 D1 — incremental_build (CASUAL + FORMAL registers) ────────────────

const ABSENCE_INCREMENTAL_BUILD_CASUAL: DecisionContent = {
  question:      'Building incrementally — verifying between steps?',
  pinchFallback: 'Verify between steps.',
  L1: [
    'Between each change — stop and verify what was just built actually works before adding the next layer. Debugging compound changes is harder than debugging one change at a time.',
    'Before moving to the next part of the implementation — try what was just built. If it\'s broken, fix it now. Layering changes on top of a broken base will cost more time than the verification takes.',
    'What\'s the last thing that was built, and has it been verified as working? If not, verify before adding more. Incremental verification is faster than debugging a pile of changes at once.',
  ],
  L2: [
    'Has what was just built been tested before continuing? Quick verification now is faster than debugging later.',
    'Is each piece being verified as done before the next is added, or are multiple changes being stacked before any are checked?',
  ],
  L3: [
    'Is what was last built working and verified before adding the next change?',
  ],
};

const ABSENCE_INCREMENTAL_BUILD: DecisionContent = {
  question:      'Incremental build — is each step verified before the next?',
  pinchFallback: 'Verify before proceeding.',
  L1: [
    'Review the build cadence: is each incremental change being verified before the next is added? Compounding unverified changes increases debugging complexity — verify at each increment.',
    'Audit the current state: what was the last change made, and has it been confirmed working? If not, verify before continuing — a clean failing test is faster to diagnose than multiple layered failures.',
    'Check whether the implementation is proceeding incrementally with verification gates, or whether multiple changes are being stacked without intermediate confirmation. The latter increases rework risk significantly.',
  ],
  L2: [
    'Is each increment being verified before the next change is added? Identify the last unverified change and confirm it before proceeding.',
    'What is the current state of the build? Which pieces have been verified as working and which have not?',
  ],
  L3: [
    'Has the most recent change been verified as working before the next one is introduced?',
  ],
};

// ── Phase 5 D7 — pro_geek_soul cluster 1 (CASUAL register) ───────────────────

const ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL: DecisionContent = {
  question:      'Built it — are the non-obvious parts documented?',
  pinchFallback: 'Docs gap.',
  L1: [
    'Look at what was just built and find the parts that are non-obvious — the hidden invariant, the "why this approach", the constraint that only makes sense if you know the external system. Are those documented?',
    'Walk through what was just built from the perspective of someone who joins the team next month. What would they have to figure out the hard way? Document those things now.',
    'Identify the decisions embedded in what was just built that can\'t be inferred from the code alone — the ones that look arbitrary to a future reader. Add a comment for each that explains the why, not the what.',
  ],
  L2: [
    'What\'s the most non-obvious part of what was just built — the part that would take the longest for a new team member to understand without asking? Is it documented?',
    'Is there anything in what was just built that documents the tradeoffs or constraints behind key decisions, or just the implementation?',
  ],
  L3: [
    'Is there anything in what was just built that carries a hidden assumption or constraint that should be documented?',
  ],
};

const ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL: DecisionContent = {
  question:      'Technical debt introduced — has it been flagged?',
  pinchFallback: 'Flag the debt.',
  L1: [
    'Look at what was just built — is there anything that was done the quick way instead of the right way? Name it explicitly and add a TODO that describes the proper solution, so future-you knows exactly what needs to be fixed.',
    'Check for shortcuts taken in what was just built: workarounds, hardcoded values, skipped edge cases, or deliberate simplifications. Each one is debt. Flag it with a comment and estimated impact.',
    'Technical debt that\'s acknowledged is manageable; debt that\'s invisible accumulates silently. Scan what was just built for anything that would surprise the person who maintains this in six months, and flag it explicitly.',
  ],
  L2: [
    'Is there anything in what was just built that was done the quick way for now but should be revisited? Flag it with a comment before moving on.',
    'What shortcuts or compromises were made in what was just built? Make them visible — unlabelled debt is the most dangerous kind.',
  ],
  L3: [
    'Is there any technical debt in what was just built that should be flagged before moving on?',
  ],
};

const ABSENCE_TEST_DEPTH_CHECK_CASUAL: DecisionContent = {
  question:      'Tests written — are they testing the right things?',
  pinchFallback: 'Test depth check.',
  L1: [
    'Review the tests that were just written: are they covering behaviour (what the code is supposed to do) or just implementation (that it ran without throwing)? Tests should fail when the behaviour is wrong, not just when the code crashes.',
    'Look at the test suite for what was just built — are there edge cases, boundary conditions, and failure paths being tested, or only the happy path? Identify the most likely failure that the current tests wouldn\'t catch.',
    'Check what the tests prove: if someone subtly changed the logic in what was just built, would the tests catch it? If the answer is "probably not", what cases are missing?',
  ],
  L2: [
    'What behavior would need to change in what was just built for the tests to fail? If the answer is "a lot", the tests might not be providing useful coverage.',
    'Are there edge cases or failure paths in what was just built that aren\'t covered by the current tests?',
  ],
  L3: [
    'Do the tests for what was just built cover edge cases and failure paths, or just the happy path?',
  ],
};

const ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL: DecisionContent = {
  question:      'Architecture decision made — is it recorded?',
  pinchFallback: 'Record the call.',
  L1: [
    'A significant architectural decision was made in what was just built. Record it: what options were considered, what was chosen, and why? The reasoning is more valuable than the decision — document both.',
    'Look at what was just built for embedded design decisions: the choice of pattern, the data model shape, the external boundary drawn. These are architecture decisions. Are they recorded anywhere with their rationale?',
    'Architecture decisions become invisible as time passes — the code shows what was chosen, not why. Document the most significant call in what was just built: what were the alternatives, what were the tradeoffs, what made this the right choice?',
  ],
  L2: [
    'What was the most significant architectural choice in what was just built? Is the reasoning behind it recorded anywhere?',
    'Is there a decision embedded in what was just built that a future developer might reverse without realising it was deliberate? Document the constraint.',
  ],
  L3: [
    'Is there an architecture-level decision in what was just built that should be documented along with the reasoning?',
  ],
};

// ── Phase 5 D8 — pro_geek_soul cluster 2 (CASUAL register) ───────────────────

const ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL: DecisionContent = {
  question:      'New dependency added — has it been audited?',
  pinchFallback: 'Audit the dependency.',
  L1: [
    'Before committing this dependency — audit it: when was it last updated, who maintains it, how many open issues does it have, and does its licence match what the project can use? A quick check now is cheaper than replacing it later.',
    'Look at what was just added to the dependencies — is it actively maintained, does it have a track record, and is there a lighter alternative already in the project? Dependencies carry ongoing cost; audit before accepting them.',
    'Check the dependency addition against three criteria: (1) is it the smallest thing that solves the problem, (2) is it well-maintained with recent activity, (3) is there no reasonable alternative already in the project? If any fail, reconsider.',
  ],
  L2: [
    'Is the dependency that was just added actively maintained and appropriate for this use case? What\'s the fallback if it goes unmaintained?',
    'What would it take to remove this dependency if it caused a problem? The harder the answer, the more important the audit before adding it.',
  ],
  L3: [
    'Has the new dependency been audited for maintenance status and licence compatibility?',
  ],
};

const ABSENCE_SECURITY_REVIEW_GAP_CASUAL: DecisionContent = {
  question:      'Security-sensitive code — reviewed for risks?',
  pinchFallback: 'Security review gap.',
  L1: [
    'The code that was just built handles user data, authentication, or external input — review it for security: is user input validated and sanitised, are errors surfacing internal state, are secrets handled through environment variables only?',
    'Walk through what was just built as an attacker: what can be sent to this code, what can be manipulated, what assumptions are made that could be violated by a malicious input? Name the riskiest surface.',
    'Check what was just built against the basics: SQL injection (if applicable), XSS, CSRF, improper authorisation checks, hardcoded credentials, and exposure of stack traces to clients. Are any of these applicable here?',
  ],
  L2: [
    'What\'s the most security-sensitive part of what was just built — the place where a mistake would have the biggest impact? Has it been reviewed explicitly?',
    'Is user input being validated and sanitised before use in what was just built? What about error messages — do they expose internal details?',
  ],
  L3: [
    'Has what was just built been reviewed for basic security risks — input validation, error exposure, credential handling?',
  ],
};

const ABSENCE_API_CONTRACT_DEFINITION_CASUAL: DecisionContent = {
  question:      'Building an API endpoint — is the contract defined?',
  pinchFallback: 'Define the contract.',
  L1: [
    'Before building this API endpoint further — document the contract: request schema, response schema, error codes, and any authentication requirements. The contract is what consumers depend on — define it before building against it.',
    'Is there a defined contract for the API that was just built — not just "it works" but: what are the valid inputs, what are the guaranteed outputs, what errors are possible, and what\'s the versioning story? Define that first.',
    'Review what was just built against API contract requirements: are input types validated, are error responses structured consistently, are success responses shaped consistently? A well-defined contract enables independent development on both sides.',
  ],
  L2: [
    'What is the exact shape of the request and response for what was just built? Is that contract documented and enforced?',
    'How does what was just built handle malformed input — what\'s the error response, and is it consistent with the rest of the API?',
  ],
  L3: [
    'Is the API contract for what was just built defined — request schema, response schema, and error format?',
  ],
};

const ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL: DecisionContent = {
  question:      'Feature built — are error cases handled?',
  pinchFallback: 'Error coverage gap.',
  L1: [
    'Walk through what was just built and list every place a failure could occur: external API calls, database operations, file I/O, user input parsing. Is each one handled, or does the failure propagate silently?',
    'Check what was just built for unhandled failure paths: what happens when the external dependency is down, when input is malformed, when the database returns an unexpected result? Each unhandled path is a production incident waiting to happen.',
    'Review the error handling in what was just built: are failures caught at the right level, are errors logged with enough context to diagnose in production, and is the user shown a meaningful response or a raw exception?',
  ],
  L2: [
    'What happens when what was just built fails? Walk the error path: is it caught, logged, and surfaced appropriately?',
    'Is there any failure mode in what was just built that would result in a silent error, a crash, or a confusing user-facing message?',
  ],
  L3: [
    'Are the error paths in what was just built handled — or would a failure result in an unhandled exception?',
  ],
};

// ── Phase 5 D9 — pro_geek_soul cluster 3 (CASUAL register) ───────────────────

const ABSENCE_REFACTORING_CHECKPOINT_CASUAL: DecisionContent = {
  question:      'Extended implementation — anything worth refactoring now?',
  pinchFallback: 'Refactor check.',
  L1: [
    'Look at what was built in this session as a whole — is there anything that\'s grown messy, duplicated, or harder to read than it started? Flag the worst offender and decide whether to clean it up now or log it as acknowledged debt.',
    'Check what was just built for code that\'s drifted from the original design: abstractions that no longer fit their usage, names that no longer match the behaviour, or logic that\'s been copy-pasted where a shared function would be cleaner.',
    'Walk through the implementation and find the thing that would be hardest to change when the next feature arrives. That\'s the thing most worth refactoring now — while the context is fresh.',
  ],
  L2: [
    'What\'s the messiest part of what was just built? Is it worth a quick cleanup now, or is the mess small enough to flag and defer?',
    'Is there anything duplicated or inconsistent in what was just built that would compound if left as-is?',
  ],
  L3: [
    'Is there anything in what was just built that should be cleaned up before moving on?',
  ],
};

const ABSENCE_BACKWARDS_COMPAT_CHECK_CASUAL: DecisionContent = {
  question:      'Changed the interface — is it backwards compatible?',
  pinchFallback: 'Compat check.',
  L1: [
    'Check what was changed in this feature against anything that consumes it: API endpoints, exported functions, data schema. Did anything change that existing callers depend on? If yes, what\'s the migration or compatibility story?',
    'Walk through what was modified and identify any change that would break existing consumers if they haven\'t updated their code: renamed fields, removed parameters, changed response shapes. Each one needs an explicit decision — break it or maintain compatibility?',
    'Review the changes in what was just built for backwards compatibility: are changes additive, or do they require callers to update? If they require updates — is that intentional, and has it been flagged as a breaking change?',
  ],
  L2: [
    'Does anything in what was just built change the interface in a way that would break existing callers? If yes, is that intentional?',
    'What was the interface before and what is it now? Is the delta backwards compatible, or is this a breaking change?',
  ],
  L3: [
    'Is what was just changed backwards compatible with existing callers, or does it introduce a breaking change?',
  ],
};

const ABSENCE_SELF_REVIEW_HABIT_CASUAL: DecisionContent = {
  question:      'About to commit — has the diff been self-reviewed?',
  pinchFallback: 'Self-review first.',
  L1: [
    'Before committing — run git diff and read every change. Look for debug code, commented-out sections, leftover TODOs that shouldn\'t go in, and any changes that are larger in scope than what was intended.',
    'Self-review the diff before sending: what was intended to change vs. what actually changed? Are there any unintended changes, any debug lines, any scope creep in the diff?',
    'Read the diff as if you\'re reviewing someone else\'s work. Look for: is the change scoped correctly, is the commit message accurate, is there anything that shouldn\'t be there? Catch it now before someone else does.',
  ],
  L2: [
    'Have the changes been self-reviewed before committing? Check the diff for unintended changes, debug code, or scope that shouldn\'t be in this commit.',
    'Is the diff for this commit exactly what was intended — no more, no less?',
  ],
  L3: [
    'Has the diff been reviewed before committing — checking for unintended changes or debug code?',
  ],
};

const ABSENCE_PERFORMANCE_AWARENESS_CASUAL: DecisionContent = {
  question:      'Feature built — any obvious performance concerns?',
  pinchFallback: 'Performance check.',
  L1: [
    'Look at what was just built for obvious performance issues: N+1 queries, synchronous blocking operations, large payloads being serialised unnecessarily, or operations that scale linearly where a constant-time alternative exists. Flag anything that will be a problem at 10× the current load.',
    'Think through the load characteristics of what was just built: what\'s the most expensive operation, what happens to that cost as the dataset grows, and is there a caching or indexing opportunity that should be considered now?',
    'Check what was just built for performance anti-patterns: unbounded queries, missing indexes on foreign keys, repeated work that could be memoised, or synchronous calls that block a thread unnecessarily. Spot these now while the code is fresh.',
  ],
  L2: [
    'What\'s the most expensive operation in what was just built, and does it scale acceptably as load grows?',
    'Are there any obvious performance anti-patterns in what was just built — N+1 queries, missing indexes, or synchronous blocking operations?',
  ],
  L3: [
    'Is there anything in what was just built that would have obvious performance issues under real load?',
  ],
};

// ── Phase 5 D10 — hardcore_pro cluster 1 (FORMAL register) ───────────────────

const ABSENCE_DECISION_RECORD_ABSENCE: DecisionContent = {
  question:      'Significant decision made — decision record written?',
  pinchFallback: 'Record the decision.',
  L1: [
    'A significant design decision was embedded in what was just built. Write an ADR: document the context, the options considered, the decision made, and the consequences — including the tradeoffs accepted. The reasoning is what matters; the code only records the choice.',
    'Review what was just built for architecture decisions that lack a decision record: the choice of data model, the service boundary drawn, the pattern selected. Each significant call should have a written record of the alternatives considered and the rationale for the selection.',
    'Audit the decisions embedded in what was just built: which ones would a future team member be most likely to reverse without understanding the original constraints? Those are the decisions that require a record — document the constraint, the alternatives, and the reasoning.',
  ],
  L2: [
    'What was the most consequential design decision in what was just built, and is it documented with sufficient context for a future team member to understand why it was made?',
    'Is there a decision record for the architectural choices in what was just built, or only the implementation?',
  ],
  L3: [
    'Is there an architecture decision in what was just built that requires a written record of the rationale before moving on?',
  ],
};

const ABSENCE_OVER_ENGINEERING_CHECK: DecisionContent = {
  question:      'Complex implementation — is the complexity justified?',
  pinchFallback: 'Complexity justified?',
  L1: [
    'Review what was just built for unjustified complexity: abstractions that exist for anticipated rather than actual requirements, generalisation that complicates the simple case, or indirection layers that add cognitive overhead without providing flexibility that is actually needed now.',
    'Apply the simplicity check: what is the simplest implementation that satisfies the current requirements? Compare it to what was just built. Each layer of complexity above that floor requires explicit justification — identify them and confirm each is necessary.',
    'Audit what was just built for over-engineering signals: interfaces with one implementation, factories for objects that don\'t need to vary, configuration for options that are never changed, or event systems for synchronous workflows. Each is a complexity cost paid in advance for uncertain future benefit.',
  ],
  L2: [
    'What is the complexity that was introduced in what was just built, and what specific current requirement does it serve? If the answer is "anticipated future requirements", that is a red flag.',
    'Is every abstraction in what was just built grounded in a current requirement, or were any added speculatively for anticipated flexibility?',
  ],
  L3: [
    'Is there complexity in what was just built that is not justified by a current requirement?',
  ],
};

const ABSENCE_PAIR_REVIEW_ABSENCE: DecisionContent = {
  question:      'High-risk change — reviewed by a second engineer?',
  pinchFallback: 'Pair review gap.',
  L1: [
    'What was just built is consequential enough to warrant a second set of eyes before it lands. Who should review this, and what specific aspects are highest risk — the ones where a mistake would not surface until production?',
    'Identify the highest-risk elements of what was just built: the changes to shared state, the security-sensitive paths, the schema changes, the concurrent logic. These are the things that benefit most from a second reviewer before they are committed.',
    'Before this change goes in — who else has context on this area of the codebase? A review by someone familiar with this component is more valuable than a general review. Identify the right reviewer and flag the highest-risk areas for their attention.',
  ],
  L2: [
    'Has what was just built been reviewed by another engineer, or is it going straight in? For changes of this complexity, what is the case for or against a review before commit?',
    'What are the two or three things in what was just built that a second reviewer should look at most carefully?',
  ],
  L3: [
    'Is what was just built high-risk enough to warrant a second engineer\'s review before it is committed?',
  ],
};

// ── Phase 5 D11 — hardcore_pro cluster 2 (FORMAL register) ───────────────────

const ABSENCE_OBSERVABILITY_FIRST: DecisionContent = {
  question:      'Feature built — will production failures be observable?',
  pinchFallback: 'Observability gap.',
  L1: [
    'Audit what was just built for observability coverage: what structured log events, metrics, and traces are emitted? If this feature fails silently in production at 3am, what will the on-call engineer see? Define what "observable" means for this feature and verify it is in place.',
    'Review what was just built against production observability requirements: what SLI would you define, what metric tracks it, and what alert condition would trigger before the failure propagates to users? If these are not wired, they need to be before this ships.',
    'Check what was just built for the three pillars of observability: (1) structured logging at key events with request and correlation IDs, (2) metrics for the operations that could degrade, (3) tracing across service boundaries if applicable. Which are in place and which are missing?',
  ],
  L2: [
    'If what was just built degraded silently in production — no exceptions thrown, just wrong results — what would detect it? Is that detection in place?',
    'What structured logs, metrics, and alerts exist for what was just built? Are they sufficient to detect and diagnose a production incident without SSH access?',
  ],
  L3: [
    'Is what was just built sufficiently observable that a production failure could be detected and diagnosed without access to the host?',
  ],
};

const ABSENCE_FAILURE_MODE_ANALYSIS: DecisionContent = {
  question:      'Implementation complete — failure modes analyzed?',
  pinchFallback: 'Failure modes.',
  L1: [
    'Walk through what was just built and enumerate the failure modes: what external dependencies can be down, what inputs can be malformed, what concurrent conditions can occur, what state can become inconsistent? For each, is there a handling strategy, a timeout, a circuit breaker, or a degraded-mode fallback?',
    'Apply fault injection thinking to what was just built: what happens when the database is slow, the external API returns a 500, the queue is backed up, or the memory limit is hit? Is each failure mode an immediate crash, a silent bad result, a detected error, or a graceful degradation? All four need to be intentional.',
    'Identify the failure modes in what was just built that are most likely to affect users: the external dependency failure, the timeout, the malformed-input path. For each, confirm there is an explicit handling strategy — not just an implicit assumption that it won\'t happen.',
  ],
  L2: [
    'What are the two or three most likely ways what was just built could fail in production, and what is the current handling strategy for each?',
    'Is there any failure mode in what was just built that would result in silent data corruption or incorrect state, as opposed to an explicit error?',
  ],
  L3: [
    'Have the failure modes of what was just built been analyzed — specifically the external dependency failures and malformed input paths?',
  ],
};

const ABSENCE_CONTRACT_TESTING_GAP: DecisionContent = {
  question:      'Service integration built — contract tested?',
  pinchFallback: 'Contract test gap.',
  L1: [
    'What was just built integrates with another service. Verify that the contract is tested — not just that the integration works in the current environment, but that both sides agree on the schema and can detect breaking changes independently. Is a consumer-driven contract test in place?',
    'Audit the integration that was just built: are the request and response schemas validated at runtime, is there a contract test that would fail before a deployment if the provider changed incompatibly, and is the contract version tracked explicitly?',
    'Review what was just built for integration contract coverage: what happens when the provider changes the response shape, drops a field, or changes a status code? Is there a test that would catch that before it reaches production?',
  ],
  L2: [
    'Is the contract for the integration in what was just built tested — meaning a provider-side schema change would be detected before it reaches production?',
    'What would happen if the service that what was just built depends on changed its response format? Would it fail loudly at contract test time, or silently in production?',
  ],
  L3: [
    'Is the integration contract for what was just built tested — not just that it works today, but that it would detect breaking changes in the provider?',
  ],
};

// ── Phase 5 D12 — hardcore_pro clusters 3+4 (FORMAL register) ────────────────

const ABSENCE_CAPACITY_PLANNING_GAP: DecisionContent = {
  question:      'Scalable feature — capacity plan written?',
  pinchFallback: 'Capacity plan.',
  L1: [
    'What was just built introduces a resource-intensive operation or a data store that will grow over time. Document the capacity plan: what is the current load, what is the growth projection, at what scale do the current decisions break down, and what is the mitigation strategy for when they do?',
    'Audit what was just built for capacity assumptions: what database growth is expected, what query performance degrades at what row count, what throughput is the service designed to handle, and what happens when those limits are exceeded? Write down the assumptions before they become invisible.',
    'Review the data and compute footprint of what was just built: what grows indefinitely, what will need pagination, partitioning, or archival, and at what scale does a redesign become necessary? Identify the first capacity cliff and the plan for reaching it safely.',
  ],
  L2: [
    'What is the expected scale of what was just built — data volume, request volume, growth rate — and at what point do the current architectural decisions start to break down?',
    'Has a capacity plan been written for what was just built, or are growth assumptions implicit in the current design?',
  ],
  L3: [
    'Is there a capacity plan for what was just built — documenting the current scale assumptions and the point at which they would need to be revisited?',
  ],
};

const ABSENCE_SECURITY_THREAT_MODELING: DecisionContent = {
  question:      'Security-sensitive feature — threat model reviewed?',
  pinchFallback: 'Threat model.',
  L1: [
    'What was just built handles sensitive data or authentication. Conduct a threat model: identify the trust boundaries, enumerate the threats at each boundary (spoofing, tampering, repudiation, information disclosure, denial of service, elevation of privilege), and confirm a mitigation exists for each applicable threat.',
    'Review what was just built using the STRIDE framework: what can be spoofed, what can be tampered with, what lacks a non-repudiation mechanism, what data could be disclosed inappropriately, what could be used to cause denial of service, and what could allow privilege escalation? Document the findings.',
    'Audit what was just built for the highest-impact security risks: is the authentication surface complete, are all privileged operations authorisation-gated, is sensitive data encrypted at rest and in transit, and are audit logs written for operations that require non-repudiation?',
  ],
  L2: [
    'What is the highest-impact security risk in what was just built, and is there an explicit mitigation for it?',
    'Has a threat model been reviewed for what was just built — covering the trust boundaries and the threats at each one?',
  ],
  L3: [
    'Has a threat model been reviewed for what was just built to identify and mitigate the highest-impact security risks?',
  ],
};

const ABSENCE_DATABASE_MIGRATION_SAFETY: DecisionContent = {
  question:      'DB migration written — safe to run in production?',
  pinchFallback: 'Migration safety.',
  L1: [
    'Review the database migration that was just written against production safety criteria: is it reversible (does it have a down migration), does it run without a full table lock on large tables, is it tested against a production-scale dataset, and has the rollback procedure been documented?',
    'Audit the migration for production risk: does it add a NOT NULL column without a default (will fail on a non-empty table), does it rename a column in use by running application code, or does it drop anything that might be needed for rollback? Each of these requires a multi-phase deployment strategy.',
    'Check the migration against the deployment sequence: can the current application code run against both the pre- and post-migration schema? If not, the migration requires a coordinated cutover — document the deployment steps explicitly.',
  ],
  L2: [
    'Is the migration reversible, and has the rollback procedure been defined? What happens if the migration needs to be rolled back mid-deployment?',
    'Does the migration require a table lock on a large table, or will it run safely online? Has it been tested against a production-scale data volume?',
  ],
  L3: [
    'Has the database migration been reviewed for production safety — reversibility, table lock risk, and deployment sequence compatibility?',
  ],
};

const ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE: DecisionContent = {
  question:      'Ready to ship — deployment strategy defined?',
  pinchFallback: 'Deploy strategy.',
  L1: [
    'Before shipping what was just built — document the deployment strategy: is this a rolling deploy, a blue-green, a canary, or a feature-flag ramp? Each has different rollback characteristics. Define which applies here and what the rollback procedure is if the deploy goes wrong.',
    'Review what was just built against its deployment requirements: does it require a database migration to run first, does it require coordinated deployment of multiple services, does it have backward-compatibility requirements during rollout? Document the correct deployment sequence.',
    'Audit the release plan for what was just built: what is the deployment order, what is the health check that confirms a successful deploy, what is the rollback trigger, and how long is the observation window before the deploy is considered stable?',
  ],
  L2: [
    'What is the deployment strategy for what was just built — specifically the rollback procedure if something goes wrong after deploy?',
    'Are there any sequencing requirements for deploying what was just built — migrations that must run first, services that must be deployed in a specific order?',
  ],
  L3: [
    'Is the deployment strategy for what was just built defined — including the rollback procedure and any deployment sequencing requirements?',
  ],
};

const ABSENCE_OPERATIONAL_RUNBOOK_GAP: DecisionContent = {
  question:      'Going to production — runbook written?',
  pinchFallback: 'Runbook gap.',
  L1: [
    'Before what was just built goes to production — write the operational runbook entry: what does this feature do, what are the most likely operational failure modes, how does an on-call engineer diagnose each one, and what are the remediation steps? Write it now while the context is fresh.',
    'Audit the operational readiness of what was just built: is there runbook documentation for the failure modes that are most likely to page someone, do those runbooks include the relevant dashboards to check, the logs to query, and the remediation steps to follow?',
    'Review what was just built from an on-call perspective: if this feature is the source of an incident at 3am, what does the responding engineer need to know? That knowledge needs to be in a runbook — not in the head of the engineer who built it.',
  ],
  L2: [
    'Is there a runbook entry for what was just built that would allow an on-call engineer unfamiliar with this feature to diagnose and remediate the most likely failure modes?',
    'What are the operational procedures for what was just built — not the happy path, but the degraded-mode, rollback, and incident-response procedures?',
  ],
  L3: [
    'Is there operational runbook documentation for what was just built — covering the most likely failure scenarios an on-call engineer would face?',
  ],
};

const ABSENCE_SLO_DEFINITION_GAP: DecisionContent = {
  question:      'Feature shipping — SLOs defined?',
  pinchFallback: 'SLO gap.',
  L1: [
    'Before what was just built ships — define the SLOs: what is the availability target, what is the acceptable latency at the p95 and p99, and what is the error rate budget? Without defined SLOs, there is no objective signal for when the feature is degraded versus within normal operating parameters.',
    'Review what was just built against SLO requirements: what SLIs would you define for this feature, what is the current baseline for each, and what threshold constitutes a degradation that warrants an alert? Document the SLOs before the feature ships.',
    'Audit what was just built for SLO coverage: has an availability target been defined, has a latency budget been set, has an error rate threshold been established? These need to exist before the feature ships — without them, there is no agreed standard for what "working" means.',
  ],
  L2: [
    'What are the SLOs for what was just built — availability, latency, and error rate? If they have not been defined, define them before shipping.',
    'Is there an agreed-upon definition of "this feature is working" in terms of measurable SLOs, or is the health of this feature currently subjective?',
  ],
  L3: [
    'Have SLOs been defined for what was just built — measurable targets for availability, latency, and error rate — before it ships?',
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
  decision_record_absence:       ABSENCE_DECISION_RECORD_ABSENCE,
  over_engineering_check:        ABSENCE_OVER_ENGINEERING_CHECK,
  pair_review_absence:           ABSENCE_PAIR_REVIEW_ABSENCE,
  observability_first:           ABSENCE_OBSERVABILITY_FIRST,
  failure_mode_analysis:         ABSENCE_FAILURE_MODE_ANALYSIS,
  contract_testing_gap:          ABSENCE_CONTRACT_TESTING_GAP,
  capacity_planning_gap:         ABSENCE_CAPACITY_PLANNING_GAP,
  security_threat_modeling:      ABSENCE_SECURITY_THREAT_MODELING,
  database_migration_safety:     ABSENCE_DATABASE_MIGRATION_SAFETY,
  deployment_strategy_absence:   ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE,
  operational_runbook_gap:       ABSENCE_OPERATIONAL_RUNBOOK_GAP,
  slo_definition_gap:            ABSENCE_SLO_DEFINITION_GAP,
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
  code_documentation_gap:        ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL,
  technical_debt_acknowledgment: ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL,
  test_depth_check:              ABSENCE_TEST_DEPTH_CHECK_CASUAL,
  architecture_note_absence:     ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL,
  dependency_audit_gap:          ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL,
  security_review_gap:           ABSENCE_SECURITY_REVIEW_GAP_CASUAL,
  api_contract_definition:       ABSENCE_API_CONTRACT_DEFINITION_CASUAL,
  error_handling_coverage:       ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL,
  refactoring_checkpoint:        ABSENCE_REFACTORING_CHECKPOINT_CASUAL,
  backwards_compatibility_check: ABSENCE_BACKWARDS_COMPAT_CHECK_CASUAL,
  self_review_habit:             ABSENCE_SELF_REVIEW_HABIT_CASUAL,
  performance_awareness:         ABSENCE_PERFORMANCE_AWARENESS_CASUAL,
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
  const isVibe        = isBeginner || profile?.nature === 'cool_geek';
  const absenceMap    = isVibe ? ABSENCE_CONTENT_BEGINNER : selectAbsenceMap(profile?.nature);
  const transitionMap = isVibe ? TRANSITION_CONTENT_BEGINNER : TRANSITION_CONTENT;

  if (flagType.startsWith('absence:')) {
    const signalKey = flagType.slice('absence:'.length);
    const override  = absenceMap[signalKey];
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
  const contentOptions: string[] =
    level === 1 ? content.L1 :
    level === 2 ? content.L2 :
                  content.L3;

  const hasNextLevel = level < 3;
  const options: DecisionOption[] = [...contentOptions];

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
  ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL,
  ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL,
  ABSENCE_TEST_DEPTH_CHECK_CASUAL,
  ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL,
  ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL,
  ABSENCE_SECURITY_REVIEW_GAP_CASUAL,
  ABSENCE_API_CONTRACT_DEFINITION_CASUAL,
  ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL,
  ABSENCE_REFACTORING_CHECKPOINT_CASUAL,
  ABSENCE_BACKWARDS_COMPAT_CHECK_CASUAL,
  ABSENCE_SELF_REVIEW_HABIT_CASUAL,
  ABSENCE_PERFORMANCE_AWARENESS_CASUAL,
  ABSENCE_DECISION_RECORD_ABSENCE,
  ABSENCE_OVER_ENGINEERING_CHECK,
  ABSENCE_PAIR_REVIEW_ABSENCE,
  ABSENCE_OBSERVABILITY_FIRST,
  ABSENCE_FAILURE_MODE_ANALYSIS,
  ABSENCE_CONTRACT_TESTING_GAP,
  ABSENCE_CAPACITY_PLANNING_GAP,
  ABSENCE_SECURITY_THREAT_MODELING,
  ABSENCE_DATABASE_MIGRATION_SAFETY,
  ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE,
  ABSENCE_OPERATIONAL_RUNBOOK_GAP,
  ABSENCE_SLO_DEFINITION_GAP,
};
