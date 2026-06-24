// Per-class decision-session content (class2_verification_quality). Relocated verbatim from
// options.ts / options-beginner.ts — one home per signal class.

import type { DecisionContent } from '../options.js';
import { WHY_HELP_BY_SIGNAL_TYPE } from '../why-help-by-signal-type.js';

/** Absence trigger: behaviour_testing — fires when implementation proceeds without manual acceptance testing */
export const BEHAVIOUR_TESTING: DecisionContent = {
  signalType:   "BEHAVIOUR_TESTING",
  question:      'Implementation done — user scenarios tested?',
  pinchFallback: 'User scenario?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['BEHAVIOUR_TESTING'],
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
export const BEHAVIOUR_TESTING_CASUAL: DecisionContent = {
  signalType:   "BEHAVIOUR_TESTING",
  question:      'Implementation done — user scenarios tested?',
  pinchFallback: 'User scenario?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['BEHAVIOUR_TESTING'],
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
export const ABSENCE_TEST_CREATION: DecisionContent = {
  signalType:   "ABSENCE_TEST_CREATION",
  question:      'Code added — where are the tests?',
  pinchFallback: 'Tests missing.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_TEST_CREATION'],
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
export const ABSENCE_REGRESSION_CHECK: DecisionContent = {
  signalType:   "ABSENCE_REGRESSION_CHECK",
  question:      'Changes made — regression verified?',
  pinchFallback: 'Regression check.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_REGRESSION_CHECK'],
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

export const ABSENCE_SECURITY_CHECK: DecisionContent = {
  signalType:   "ABSENCE_SECURITY_CHECK",
  question:      'Feature built — security reviewed?',
  pinchFallback: 'Security gap.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SECURITY_CHECK'],
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

export const ABSENCE_ERROR_HANDLING: DecisionContent = {
  signalType:   "ABSENCE_ERROR_HANDLING",
  question:      'Feature built — error paths handled?',
  pinchFallback: 'Error handling.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ERROR_HANDLING'],
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

export const ABSENCE_DOCUMENTATION: DecisionContent = {
  signalType:   "ABSENCE_DOCUMENTATION",
  question:      'Code written — any documentation added?',
  pinchFallback: 'Docs missing.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DOCUMENTATION'],
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

export const ABSENCE_REFACTORING: DecisionContent = {
  signalType:   "ABSENCE_REFACTORING",
  question:      'Extended implementation — code health reviewed?',
  pinchFallback: 'Refactor check.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_REFACTORING'],
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

export const ABSENCE_CORRECTION_SEEKING: DecisionContent = {
  signalType:   "ABSENCE_CORRECTION_SEEKING",
  question:      'AI output — self-verification requested?',
  pinchFallback: 'No verification.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_CORRECTION_SEEKING'],
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

export const ABSENCE_PROBLEM_CORRECTION: DecisionContent = {
  signalType:   "ABSENCE_PROBLEM_CORRECTION",
  question:      'Bug noticed — explicitly corrected?',
  pinchFallback: 'Bug unresolved.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_PROBLEM_CORRECTION'],
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

/** ABSENCE_TEST_CREATION_CASUAL — casual-register variant for pro_geek_soul and null profiles */
export const ABSENCE_TEST_CREATION_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_TEST_CREATION",
  question:      'Built something — any tests written yet?',
  pinchFallback: 'Tests missing.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_TEST_CREATION'],
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
export const ABSENCE_REGRESSION_CHECK_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_REGRESSION_CHECK",
  question:      'Changed something — did anything break?',
  pinchFallback: 'Regression check.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_REGRESSION_CHECK'],
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

export const ABSENCE_SECURITY_CHECK_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_SECURITY_CHECK",
  question:      'Built something — any security checks done?',
  pinchFallback: 'Security gap.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SECURITY_CHECK'],
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

export const ABSENCE_ERROR_HANDLING_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_ERROR_HANDLING",
  question:      'Feature built — what happens when it breaks?',
  pinchFallback: 'Error handling.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ERROR_HANDLING'],
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

export const ABSENCE_DOCUMENTATION_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_DOCUMENTATION",
  question:      'Code written — is anything documented?',
  pinchFallback: 'Docs missing.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DOCUMENTATION'],
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

export const ABSENCE_REFACTORING_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_REFACTORING",
  question:      'Long build run — anything to clean up?',
  pinchFallback: 'Refactor check.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_REFACTORING'],
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

export const ABSENCE_CORRECTION_SEEKING_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_CORRECTION_SEEKING",
  question:      'Has the AI checked its own work?',
  pinchFallback: 'No verification.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_CORRECTION_SEEKING'],
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

export const ABSENCE_PROBLEM_CORRECTION_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_PROBLEM_CORRECTION",
  question:      'Spotted a bug — did it actually get fixed?',
  pinchFallback: 'Bug unresolved.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_PROBLEM_CORRECTION'],
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

export const ABSENCE_ACCESSIBILITY: DecisionContent = {
  signalType:   "ABSENCE_ACCESSIBILITY",
  question:      'UI being built — accessibility checked?',
  pinchFallback: 'Accessibility?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ACCESSIBILITY'],
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

export const ABSENCE_DATA_VALIDATION: DecisionContent = {
  signalType:   "ABSENCE_DATA_VALIDATION",
  question:      'Accepting input — data validation in place?',
  pinchFallback: 'Input validation?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DATA_VALIDATION'],
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

export const ABSENCE_ACCESSIBILITY_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_ACCESSIBILITY",
  question:      'UI being built — accessibility checked?',
  pinchFallback: 'Accessibility?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ACCESSIBILITY'],
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

export const ABSENCE_DATA_VALIDATION_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_DATA_VALIDATION",
  question:      'Accepting input — data validation in place?',
  pinchFallback: 'Input validation?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DATA_VALIDATION'],
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

// ── Phase 5 D7 — pro_geek_soul cluster 1 (CASUAL register) ───────────────────
export const ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_CODE_DOCUMENTATION_GAP",
  question:      'Complex logic added — documented the why?',
  pinchFallback: 'Add the why comment.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_CODE_DOCUMENTATION_GAP'],
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

export const ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT",
  question:      'Shortcut taken — tagged it as debt?',
  pinchFallback: 'Tag the shortcut.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT'],
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

export const ABSENCE_TEST_DEPTH_CHECK_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_TEST_DEPTH_CHECK",
  question:      'Tests written — covering beyond the happy path?',
  pinchFallback: 'Add edge and error path tests.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_TEST_DEPTH_CHECK'],
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

export const ABSENCE_SECURITY_REVIEW_GAP_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_SECURITY_REVIEW_GAP",
  question:      'Security surface touched — applied security checks?',
  pinchFallback: 'Apply security checks now.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SECURITY_REVIEW_GAP'],
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

export const ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_ERROR_HANDLING_COVERAGE",
  question:      'Implementation done — covered the error paths?',
  pinchFallback: 'Add error handling for failure cases.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ERROR_HANDLING_COVERAGE'],
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
export const ABSENCE_REFACTORING_CHECKPOINT_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_REFACTORING_CHECKPOINT",
  question:      'Adding to messy code — refactored first?',
  pinchFallback: 'Do a cleanup pass before extending.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_REFACTORING_CHECKPOINT'],
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

export const ABSENCE_SELF_REVIEW_HABIT_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_SELF_REVIEW_HABIT",
  question:      'Long implementation run — done a review pass?',
  pinchFallback: 'Read back through what was built.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SELF_REVIEW_HABIT'],
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

export const ABSENCE_PERFORMANCE_AWARENESS_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_PERFORMANCE_AWARENESS",
  question:      'Data-heavy operation — considered performance?',
  pinchFallback: 'Check for performance implications.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_PERFORMANCE_AWARENESS'],
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

export const BEHAVIOUR_TESTING_BEGINNER: DecisionContent = {
  signalType:   "BEHAVIOUR_TESTING",
  question:      'Implementation done — user scenarios tested?',
  pinchFallback: 'User scenario?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['BEHAVIOUR_TESTING'],
  L1: [
    {
      option: '1. Walk through this feature as if you\'re a real user — tell me each step, what you\'d click or type, and whether it works the way it should.\n2. Share what you find with me before we move on.\n3. Flag anything that feels wrong or missing along the way.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built this in the last few prompts but I haven't tried it as a user yet."}
I haven't manually used what was just built; automated tests miss the real-user feel.
Walk me through it as if I'm a user: each step, what I'd click or type, what I'd see, what I'd flag.
{R4_CLOSE}`,
    },
    {
      option: 'Walk through this as a real user would — then share what you find with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; not walked through as a user."}
Same moment, simpler: walk through as a user, share what works and what doesn't.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the most important thing to test by using it like a real person? Share that with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Lighter: the single most important real-user check.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything that feels off when you use this yourself?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: anything that feels off when I use it.
{R4_CLOSE}`,
    },
  ],
};

/** ABSENCE_TEST_CREATION_BEGINNER — beginner-register variant (L1×2 / L2×1 / L3×1) */
export const ABSENCE_TEST_CREATION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_TEST_CREATION",
  question:      'Built something — any tests written yet?',
  pinchFallback: 'Tests missing.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_TEST_CREATION'],
  L1: [
    {
      option: '1. Write a test for what was just built — start with the main thing it\'s supposed to do.\n2. Share the test with me so I can check it covers the right thing.\n3. Then tell me: is there anything else in what was just built that could break without a test catching it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I just built something but I haven't written any tests for it."}
Tests haven't been written; whatever I built could break next time I change something.
Walk me through it: write a test starting with the main thing, share it so I can check coverage, then point out anything else that could break without a test.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what was just built and tell me: what\'s the most important thing it does? Then write a test that checks that works correctly, and share it with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; no tests yet."}
Same moment, simpler: name the most important thing it does, then write a test for that.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Write one test for what was just built and share it with me — I want to see what you\'re checking and make sure it covers the right thing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; zero tests."}
Lighter: write one test, share what I'm checking.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that should have a test before we move on?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; zero tests."}
Minimum next step: one thing that should have a test before I move on.
{R4_CLOSE}`,
    },
  ],
};

/** ABSENCE_REGRESSION_CHECK_BEGINNER — beginner-register variant (L1×2 / L2×1 / L3×1) */
export const ABSENCE_REGRESSION_CHECK_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_REGRESSION_CHECK",
  question:      'Changed something — did anything break?',
  pinchFallback: 'Regression check.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_REGRESSION_CHECK'],
  L1: [
    {
      option: '1. Run the existing tests for this project now that what was just built has been added.\n2. Share the results with me — which ones pass, which ones fail.\n3. Then tell me: is there anything that used to work that might not work anymore?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I just added something but I haven't run the existing tests since."}
Whether the changes broke things that used to work hasn't been checked.
Walk me through it: run the existing tests, share pass/fail, then tell me if anything that used to work might not anymore.
{R4_CLOSE}`,
    },
    {
      option: 'Look at what was just built and tell me — what other parts of this project does it touch or depend on? Then check if those parts still work correctly and share what you find.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Made changes; affected-parts not mapped."}
Same moment, deeper: what other parts of this project does my change touch? Check those still work.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Run the tests for this project and share the results with me — I want to know if anything broke after what was just built was added.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Made changes; suite not run."}
Lighter: run the suite, tell me what broke.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything that was working before that might have stopped working after what was just built was added?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Made changes."}
Minimum next step: anything that used to work and might not now.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SECURITY_CHECK_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_SECURITY_CHECK",
  question:      'Built something — any security checks done?',
  pinchFallback: 'Security gap.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SECURITY_CHECK'],
  L1: [
    {
      option: '1. Look at what was just built and check if it handles anything a user types in or sends to the app.\n2. Share with me: could someone type something unexpected and cause a problem?\n3. Then check: does anything in what was just built need a login or permission to use, and is that actually enforced?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built something that takes user input or uses login; haven't checked it for security."}
Security check hasn't been done; the input-handling and permission paths are unchecked.
Walk me through it: check what handles user input, share what could go wrong with unexpected typing, then check whether login/permission is actually enforced.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what was just built and tell me — what could go wrong if someone tried to misuse it on purpose? Share what you find with me before we move on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it with user-input or auth; misuse path not considered."}
Same moment, mistake-on-purpose framing: what could go wrong if someone tried to misuse it on purpose?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that takes input from a user or checks if someone is logged in? Share how that\'s handled with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; input/auth handling unclear."}
Lighter: anything that takes input or checks login — how is that handled?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that a user could misuse or that isn\'t properly protected?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: anything a user could misuse or that isn't protected.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_ERROR_HANDLING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_ERROR_HANDLING",
  question:      'Feature built — what happens when it breaks?',
  pinchFallback: 'Error handling.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ERROR_HANDLING'],
  L1: [
    {
      option: '1. Look at what was just built and think: what happens if it doesn\'t work the way it\'s supposed to?\n2. Share with me: is there anything that could break without showing a useful message?\n3. Then check: what happens if a user does something unexpected — does the app handle it or crash?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built a feature but I haven't thought about what happens when it doesn't work."}
The "what happens when it breaks" hasn't been considered.
Walk me through it: anything that could break without a useful message, then check unexpected-user-action handling.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what was just built and tell me — what\'s the first thing that could go wrong, and what does the user see when that happens? Share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; first-thing-that-could-go-wrong not identified."}
Same moment, deeper: the first thing that could go wrong, what the user sees when it does.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that could fail without telling the user what went wrong? Share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Lighter: anything that could fail without telling the user what went wrong.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that could crash or fail silently when something unexpected happens?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: anything that could crash or fail silently on unexpected input.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_DOCUMENTATION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_DOCUMENTATION",
  question:      'Code written — is anything documented?',
  pinchFallback: 'Docs missing.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DOCUMENTATION'],
  L1: [
    {
      option: '1. Look at what was just built and find one part that would be hard to understand for someone who didn\'t write it.\n2. Add a short explanation of why it works that way and share it with me.\n3. Then check: is there anything else in what was just built that needs explaining before we move on?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built something without writing down why parts of it work the way they do — someone reading it later might be confused."}
A hard-to-understand part explanation hasn't been shared.
Let's find one part that would be hard for someone else to understand; write a short explanation of why it works that way; share it; then check whether anything else needs explaining.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what was just built and point out the part that would confuse someone reading it for the first time — then write a short explanation for that part and share it with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built something but didn't write down the explanation for the parts that would confuse a first-time reader."}
The confusing-part explanation hasn't been shared.
Let's walk through; identify the part that would confuse a first-time reader; write a short explanation; share it.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that you\'d have to explain to someone else? Write that explanation as a comment and share it with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Some parts of what was just built would need explaining to someone else."}
A would-need-explaining-to-someone-else capture hasn't been done.
Let's write that explanation as a comment and share it.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that isn\'t obvious — something that would confuse someone who didn\'t write it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: anything not obvious that would confuse someone who didn't write it.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_REFACTORING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_REFACTORING",
  question:      'Long build run — anything to clean up?',
  pinchFallback: 'Refactor check.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_REFACTORING'],
  L1: [
    {
      option: '1. Read through what was just built from start to finish — does it still feel organised and easy to follow?\n2. Share with me: is there anything that feels messy, repeated, or harder to understand than it needs to be?\n3. Then tell me: is there anything that should be tidied up before we add more features on top?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built a long stretch of code without checking whether it still feels organised and easy to follow."}
A start-to-finish read-through for organisation + clarity hasn't been shared.
Let's read through start to finish; share anything that feels messy / repeated / harder-than-it-needs-to-be; decide whether to tidy before adding more.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what was just built and tell me — is there any part that would be confusing or messy to someone who didn\'t write it? Share what you find with me so we can decide whether to clean it up now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it without thinking about whether it'd be confusing or messy to someone who didn't write it."}
The confusing-or-messy-to-outsider spot-check hasn't been shared.
Let's walk through; tell me what's confusing or messy to a new reader; we'll decide whether to clean up now.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that feels messy or repeated? Share it with me and let\'s decide whether to clean it up before moving on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; some parts feel messy or repeated."}
The messy / repeated check hasn't been shared.
Let's spot it; decide whether to clean up before moving on.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that should be cleaned up or simplified before we continue?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: anything to clean up or simplify before we continue.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_CORRECTION_SEEKING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_CORRECTION_SEEKING",
  question:      'Has the AI checked its own work?',
  pinchFallback: 'No verification.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_CORRECTION_SEEKING'],
  L1: [
    {
      option: '1. Look at what was just built again — but this time, find what might be wrong with it.\n2. Share what you find with me.\n3. Then tell me: does what you found make sense, or does something still seem off?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it without going back through to find what might be wrong with it."}
A find-what-might-be-wrong critique pass hasn't been shared.
Let's look at it again to find what might be wrong; share what we find; check whether the findings make sense or something still seems off.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the part of what was just built you\'re least sure about? — share what you find with me so we can check together.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; not sure which part I'm least confident about."}
The least-sure-part check hasn't been shared.
Let's spot the least-confident part; share it together; check it together.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Point out any part of what was just built that might not be right — then share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; haven't pointed out what might not be right."}
A might-not-be-right spot-check hasn't been done.
Let's point out the part that might not be right; share it.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Find one thing in what was just built that might be wrong or could be done better.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: one thing that might be wrong or could be done better.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_PROBLEM_CORRECTION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_PROBLEM_CORRECTION",
  question:      'Spotted a bug — did it actually get fixed?',
  pinchFallback: 'Bug unresolved.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_PROBLEM_CORRECTION'],
  L1: [
    {
      option: '1. Think back through this session — was there anything that didn\'t work or looked wrong earlier on?\n2. Share with me: is that thing actually fixed now, or did we move on without dealing with it?\n3. Then check: are there any other problems in what was just built that haven\'t been properly sorted out?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Earlier in this session something didn't work or looked wrong; not sure if it got fixed."}
A noticed-but-maybe-unfixed issue is hanging over what was just built.
Walk me through it: was there anything broken earlier in this session, is it actually fixed now, then check for other unresolved problems.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what was just built and tell me — is there anything we said was a problem earlier that still hasn\'t been fixed? Share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Issues came up earlier; status uncertain."}
Same moment, deeper: anything I said was a problem earlier that still isn't fixed.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that was flagged as broken or wrong earlier in this session but hasn\'t been fixed yet? Share it with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Earlier issue flagged; status unclear."}
Lighter: anything flagged broken earlier that still isn't fixed.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there any bug in what was just built that was noticed earlier but not actually fixed?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Earlier issue noticed."}
Minimum next step: any bug noticed earlier but not actually fixed.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_DOCUMENTATION_BEFORE_ASK_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_DOCUMENTATION_BEFORE_ASK",
  question:      'About to ask — have you checked the docs?',
  pinchFallback: 'Docs first.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DOCUMENTATION_BEFORE_ASK'],
  L1: [
    {
      option: '1. Before asking me this question — check the official documentation for this library or API.\n2. Share with me: what did you find, and is the answer there?\n3. Then ask me what you still couldn\'t find in the docs.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to ask without first checking the official documentation."}
An official-docs check before asking hasn't been shared.
Let's check the docs first; share what we find; then we'll handle anything not in them.
{R4_CLOSE}`,
    },
    {
      option: 'Look up the official docs for what you\'re asking about, then share what you found — I\'ll fill in anything the docs didn\'t make clear.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to ask without looking up the official docs for this topic."}
The official-docs lookup walkthrough hasn't been shared.
Let's look up the official docs together; share what we found; clarify what was unclear.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there official documentation for what you\'re asking about? Check it first and share what you find — then tell me what\'s still unclear.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Haven't checked official docs for the topic I'm about to ask about."}
The docs-first check hasn't been done.
Let's check the docs first; tell me what's still unclear after.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Have you checked the documentation for this before asking?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to ask a question."}
Minimum next step: docs check before asking.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_OUTPUT_VERIFICATION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_OUTPUT_VERIFICATION",
  question:      'Code generated — have you actually tried it?',
  pinchFallback: 'Test it first.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_OUTPUT_VERIFICATION'],
  L1: [
    {
      option: '1. Before moving on from what was just built — actually run it or try it.\n2. Share with me: does it behave the way you expected?\n3. If anything looks off, tell me what happened and we\'ll look at it together.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Code was generated for me but I haven't actually tried running it."}
Whether the generated code actually works hasn't been verified.
Walk me through it: run or try it, share what happens vs what I expected, then we look at anything off together.
{R4_CLOSE}`,
    },
    {
      option: 'Try what was just built and share what happens — does it do what you expected, or is something different?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Code generated; not tried yet."}
Same moment, simpler: try it and tell me what happens.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Have you run or tried what was just built? Tell me what it does when you use it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Code generated; not tried."}
Lighter: have I actually run or tried it, and what does it do when I do?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Have you actually tested what was just built to see if it works?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Code generated."}
Minimum next step: actually test it to see if it works.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_ACCESSIBILITY_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_ACCESSIBILITY",
  question:      'UI being built — accessibility checked?',
  pinchFallback: 'Accessibility?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ACCESSIBILITY'],
  L1: [
    {
      option: '1. Go through what was just built and check that every button and link has a clear label describing what it does. 2. Try tabbing through the whole feature using only the keyboard — no mouse. 3. Share what you find with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built UI without checking labels on buttons and links, and without trying keyboard-only navigation."}
A clear-label + keyboard-only walkthrough hasn't been shared together.
Let's go through it: every button and link has a clear label; tab through with keyboard only; share what we find before continuing.
{R4_CLOSE}`,
    },
    {
      option: 'Think about someone who can\'t see the screen trying to use this feature — would a screen reader be able to tell them what everything does? Go through it and share what you notice with me before we move on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Didn't think about how someone who can't see the screen would use this feature."}
The screen-reader user-perspective walkthrough hasn't been shared.
Let's imagine someone using a screen reader; go through the feature; share what we notice (announced clearly vs silent / confusing).
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Can you go through this feature and find one thing that someone with a disability might struggle to use — and tell me what it is?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Didn't check what a user with a disability might struggle with."}
A disability-impact spot check hasn't been done.
Let's find one thing someone with a disability might struggle to use and identify it.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that someone might have trouble using if they couldn\'t use a mouse or couldn\'t see the screen clearly?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built the UI."}
Minimum next step: anything mouse-only or sight-dependent that could trouble some users.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_DATA_VALIDATION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_DATA_VALIDATION",
  question:      'Accepting input — data validation in place?',
  pinchFallback: 'Input validation?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DATA_VALIDATION'],
  L1: [
    {
      option: '1. Think about what happens in this feature if someone sends the wrong data — a missing field, a number where text is expected, or something completely unexpected. 2. Try sending some bad data and see what happens. 3. Share what you find with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built input handling without trying bad data to see what happens."}
A bad-data behavior probe hasn't been done together.
Let's try sending some bad data (missing field / wrong type / unexpected value); see what happens; share findings before continuing.
{R4_CLOSE}`,
    },
    {
      option: 'Go through what was just built and check — is there anything checking that the data coming in is actually in the right format before the app tries to use it? Share what you find with me before we move on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Didn't check that incoming data is in the right format before the app uses it."}
The right-format input check hasn't been shared.
Let's go through and check whether anything verifies incoming data shape before use; share what we find before continuing.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What happens in this feature if someone sends a missing or wrong value — does it give a clear error message, or does it just break? Try it and tell me what you see.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Didn't try sending a missing or wrong value to see what happens."}
The missing / wrong-value behavior probe hasn't been done.
Let's try it; tell me whether it gives a clear error or just breaks.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s one piece of data this feature accepts that isn\'t being checked before it gets used?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: one piece of data accepted without being checked first.
{R4_CLOSE}`,
    },
  ],
};
