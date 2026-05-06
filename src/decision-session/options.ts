import type { Stage, UserProfile } from '../classifier/types.js';
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
    'Write a manual acceptance test script for this phase: the main user journey from first action to goal completion, edge cases that automated tests would not catch, and the expected outcome at each step.',
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

/** Absence trigger: behaviour_testing — fires when implementation proceeds without manual acceptance testing */
const BEHAVIOUR_TESTING: DecisionContent = {
  question:      'Phase done — any real-user scenario tested?',
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
    'Run the regression test suite for this project and report: which tests pass, which fail, and what changed in this session that could have caused any failures.',
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
  refactoring:           ABSENCE_REFACTORING,
  no_agent_pushback:       ABSENCE_NO_PUSHBACK,
  correction_seeking:      ABSENCE_CORRECTION_SEEKING,
  problem_correction:      ABSENCE_PROBLEM_CORRECTION,
  alternatives_seeking:    ABSENCE_ALTERNATIVES,
  architecture_conflict:   ABSENCE_ARCH_CONFLICT,
  prompt_context_richness: ABSENCE_PROMPT_CONTEXT,
};

const ABSENCE_CONTENT_CASUAL: Partial<Record<string, DecisionContent>> = {
  test_creation:         ABSENCE_TEST_CREATION_CASUAL,
  regression_check:      ABSENCE_REGRESSION_CHECK_CASUAL,
  spec_acceptance_check: ABSENCE_SPEC_ACCEPTANCE_CASUAL,
  cross_confirming:      ABSENCE_CROSS_CONFIRMING_CASUAL,
  behaviour_testing:     BEHAVIOUR_TESTING,  // BEHAVIOUR_TESTING_CASUAL is out of sub-2 scope
  security_check:        ABSENCE_SECURITY_CHECK_CASUAL,
  error_handling:        ABSENCE_ERROR_HANDLING_CASUAL,
  documentation:         ABSENCE_DOCUMENTATION_CASUAL,
  observability:         ABSENCE_OBSERVABILITY_CASUAL,
  comprehension:         ABSENCE_COMPREHENSION_CASUAL,
  refactoring:           ABSENCE_REFACTORING_CASUAL,
  no_agent_pushback:       ABSENCE_NO_PUSHBACK_CASUAL,
  correction_seeking:      ABSENCE_CORRECTION_SEEKING_CASUAL,
  problem_correction:      ABSENCE_PROBLEM_CORRECTION_CASUAL,
  alternatives_seeking:    ABSENCE_ALTERNATIVES_CASUAL,
  architecture_conflict:   ABSENCE_ARCH_CONFLICT_CASUAL,
  prompt_context_richness: ABSENCE_PROMPT_CONTEXT_CASUAL,
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
export function resolveDecisionContent(
  currentStage: Stage,
  flagType:     FlagType,
  profile?:     UserProfile | null,
): DecisionContent {
  const isBeginner = profile?.nature === 'beginner';
  const isVibe     = isBeginner || profile?.nature === 'cool_geek';
  const absenceMap    = isVibe ? ABSENCE_CONTENT_BEGINNER : selectAbsenceMap(profile?.nature);
  const transitionMap = isVibe ? TRANSITION_CONTENT_BEGINNER : TRANSITION_CONTENT;

  if (flagType.startsWith('absence:')) {
    const signalKey = flagType.slice('absence:'.length);
    const override  = absenceMap[signalKey];
    if (override) return override;
  }

  const transitionContent = transitionMap[currentStage];
  if (transitionContent) return transitionContent;

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
  BEHAVIOUR_TESTING,
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
};
