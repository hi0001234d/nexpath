/**
 * Class-2 (verification-quality) content-template records — BATCH A: the 11
 * formal-base signalTypes. Authored per §4.E3 / §5.10.12: col-3 = the frozen
 * existing headline; cols 1/2/4/5 radiate per family — A3 Verification (run/check:
 * spot-check → light pass → standard review → PR-grade audit → review file + pre-merge
 * checks) and A6 Maintainability (note → commit+README → standard → PR-style+project
 * doc → maintained doc file). Keyword-retained, de-jargoned, voice-clean; col-5 yields
 * a file/artifact (F2). These are corrective (ABSENCE_*) signals — content authored
 * here at §4.E2; §3.F later routes them to the AbsenceSignalEngine.
 *
 * F8 spine: A3 records thread the review + commit cadence; A6 records thread
 * commit-intent. Register (casual) = Pass-1 vocab; `_BEGINNER` overrides await §6.1.
 *
 * BATCH B (10 casual-only signalTypes) is authored separately.
 */

import type { ContentTemplateRecord, LevelForm, ParamAxisTag } from '../content-template-schema.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}

/** The param axes a verification why-desc grounds (same generic sources as class 1). */
const VERIFICATION_PARAM_AXES: Readonly<Record<string, ParamAxisTag>> = {
  workflow_pattern: 'extensible',
  decision_making_rhythm: 'closed-ordinal',
  explanation_learning_depth: 'closed-ordinal',
  abstraction_level_orientation: 'closed-ordinal',
  project_framework: 'open',
};

const A3_SPINE = ['review-cadence', 'commit-cadence'];
const A6_SPINE = ['commit-intent'];

/** BEHAVIOUR_TESTING — A3, keyword "test". */
export const BEHAVIOUR_TESTING_RECORD: ContentTemplateRecord = {
  signalType: 'BEHAVIOUR_TESTING', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VERIFICATION_PARAM_AXES, spine: A3_SPINE,
  levelForms: {
    1: form('Manually test the one main user journey before moving on.', 'Automated tests miss the user-facing path; one manual run is the lightest scenario test.'),
    2: form('Test the happy path as a real user would, step by step, and note what confirms it works.', 'A light scenario test: the main user journey walked through with confirmation points.'),
    3: form('Write a manual test scenario for the main user journey: list each step a real user would take, what they would see, and what would confirm it is working correctly.', "Manual acceptance testing hasn't been done; automated tests miss the user-facing scenarios."),
    4: form('Write the acceptance test scenarios for this feature — 3 to 5 user journeys from happy path to edge cases, each with the steps and the expected outcome.', 'Beyond the main journey: a test scenario set spanning happy path and the edge cases users actually hit.'),
    5: form('Write a manual test plan file: the user-journey scenarios (happy path, boundaries, error states), expected outcome per step, and the cases automated tests miss — kept with the feature.', 'A durable manual test plan file: the full scenario set and expected outcomes, kept alongside the feature.'),
  },
};

/** ABSENCE_TEST_CREATION — A3, keyword "test". */
export const ABSENCE_TEST_CREATION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_TEST_CREATION', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VERIFICATION_PARAM_AXES, spine: A3_SPINE,
  levelForms: {
    1: form('Write one test for the most important behaviour in what was just built.', 'No tests yet; one test on the most important behaviour is the lightest floor.'),
    2: form('Write a test for the most critical path through what was just built, then commit it.', 'A light test floor: the critical path covered and committed.'),
    3: form('Write tests for what was just built: unit tests for each function added or modified, and at least one integration test that covers the main path through this feature.', "Tests haven't been written for what was just built; silent regressions become possible the next time anyone touches this code."),
    4: form('Write tests for what was just built covering each function and the main integration path, run the full suite, and commit them as a rollback checkpoint.', 'Beyond the floor: per-function and integration tests, the full suite run, committed as a checkpoint.'),
    5: form('Write a test file for what was just built with unit + integration coverage of the riskiest paths, add a check of dependencies for known issues, and make the tests run before merging.', 'A durable test file covering the riskiest paths, with the tests gating the merge.'),
  },
};

/** ABSENCE_REGRESSION_CHECK — A3, keyword "regression". */
export const ABSENCE_REGRESSION_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_REGRESSION_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VERIFICATION_PARAM_AXES, spine: A3_SPINE,
  levelForms: {
    1: form('Run the existing tests and report any regression — anything passing before that now fails.', 'A regression on existing behaviour is the lightest thing to catch: run what exists, report new failures.'),
    2: form('Run the test suite, flag any regression touching the code changed this session, and commit the verified state.', 'A light regression check: the suite run, failures on changed paths flagged, the state committed.'),
    3: form('Identify which existing tests cover the code paths changed in what was just built, run them, and flag any regressions — anything that was passing before this session that is now failing.', "Regression on existing functionality hasn't been verified; changes may have broken paths that were previously passing."),
    4: form('Map the existing functionality the changes could affect, run the full suite for regression, and commit an atomic rollback checkpoint.', 'Beyond the targeted run: the affected-surface mapped, the full suite checked for regression, a rollback point.'),
    5: form('Write a regression-check note: the changed paths, the existing tests covering them, the at-risk functionality, and the results — and make the suite run before merging to catch future regressions.', 'A durable regression note of changed paths, coverage, and results, with the suite gating the merge.'),
  },
};

/** ABSENCE_SECURITY_CHECK — A3 (security verification), keyword "security". */
export const ABSENCE_SECURITY_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SECURITY_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VERIFICATION_PARAM_AXES, spine: A3_SPINE,
  levelForms: {
    1: form('Check what was just built for the one most obvious security issue — unvalidated input or a missing access check.', 'A quick security spot-check is the lightest pass: the most obvious unvalidated-input or access gap.'),
    2: form('Do a light security pass on the main path: input validation and access checks on what was just built.', 'A light security pass: input validation plus access checks on the main path.'),
    3: form('Review what was just built for security vulnerabilities: check authentication and authorization logic, input validation for injection risks (SQL, XSS, command), and any API endpoints for missing rate limiting, improper error responses, or exposed sensitive data.', "Security review hasn't been done; the new attack surface is unaudited."),
    4: form('Audit the security of what was just built thoroughly: authentication and authorization, injection risks, rate limiting, error-response leakage, and the highest-severity exploit path — like a pre-merge security review.', 'Beyond the standard pass: a thorough, severity-ranked security audit of the new surface.'),
    5: form('Write a security review note: the audited surface, findings ranked by severity, a check of dependencies for known issues, and the fixes — and make these security checks part of the pre-merge gate.', 'A durable security review note with severity-ranked findings, dependency checks, and pre-merge gating.'),
  },
};

/** ABSENCE_ERROR_HANDLING — A3, keyword "error". */
export const ABSENCE_ERROR_HANDLING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_ERROR_HANDLING', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VERIFICATION_PARAM_AXES, spine: A3_SPINE,
  levelForms: {
    1: form('Check what happens in what was just built when the most likely error occurs — a failed call or invalid input.', 'A quick error-path check is the lightest pass: the single most-likely failure handled or not.'),
    2: form('Review the main error paths in what was just built and confirm failures are handled, not silently swallowed.', 'A light error pass: the main failure paths handled rather than swallowed.'),
    3: form('Review what was just built for error handling gaps: identify all failure modes (network errors, invalid input, missing dependencies, unexpected state), confirm each is handled explicitly, and flag any that are silently swallowed or produce unhelpful error messages.', "Failure modes haven't been enumerated; silent or unhelpful errors are now possible."),
    4: form('Audit every failure path in what was just built — per dependency, input, and assumption: is the error propagated, logged, or recovered correctly, and are messages safe to expose?', 'Beyond the standard pass: per-dependency error behaviour audited for propagation, logging, and safe messages.'),
    5: form('Write an error-handling note: the failure modes, the handling per mode (propagate / log / recover), the error contract, and tests for the critical paths — kept with the feature.', 'A durable error-handling note of failure modes, the contract, and critical-path tests.'),
  },
};

/** ABSENCE_DOCUMENTATION — A6 (maintainability), keyword "document". */
export const ABSENCE_DOCUMENTATION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DOCUMENTATION', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VERIFICATION_PARAM_AXES, spine: A6_SPINE,
  levelForms: {
    1: form('Add a one-line note documenting the WHY behind the least-obvious part of what was just built.', 'The lightest documentation: one line on the why behind the least-obvious piece.'),
    2: form('Document the non-obvious decisions in what was just built with short inline comments explaining the why.', 'Light documentation: inline comments capturing the why of the non-obvious decisions.'),
    3: form('Review what was just built for documentation coverage: identify functions, classes, and modules with non-obvious behaviour that lack docstrings or inline comments, and add documentation that explains the why — the constraint, the invariant, the tradeoff — not just the what.', "Documentation coverage for non-obvious behavior (functions / classes / modules) hasn't been added."),
    4: form('Document what was just built thoroughly: docstrings for non-obvious components plus the embedded assumptions, invariants, and constraints a future maintainer could not infer from the code.', 'Beyond docstrings: the undocumented assumptions and invariants a maintainer would otherwise miss, documented.'),
    5: form('Update the documentation files for what was just built: README / API reference / architecture notes plus the inline docs, so a new reader understands the feature without asking the author.', 'A durable documentation update (README / API / architecture notes) that stands alone for a new reader.'),
  },
};

/** ABSENCE_REFACTORING — A6 (maintainability), keyword "refactor". */
export const ABSENCE_REFACTORING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_REFACTORING', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VERIFICATION_PARAM_AXES, spine: A6_SPINE,
  levelForms: {
    1: form('Name the one thing in what was just built most worth refactoring before moving on.', 'The lightest code-health step: name the single highest-value refactoring.'),
    2: form('Review what was just built for duplication or inconsistency to refactor before the next task.', 'A light refactor pass: the duplication or inconsistency worth cleaning now.'),
    3: form('Review what was just built for refactoring opportunities: identify code duplication, functions that do more than one thing, abstractions that have grown inconsistent with their usage, and naming that no longer reflects current behaviour — prioritize by maintenance risk.', "Refactoring opportunities in what was just built (duplication / multi-responsibility functions / drift / stale naming) haven't been identified."),
    4: form('Audit what was just built for code health and refactor the highest-risk items: emergent patterns to abstract, dead code to remove, modules grown beyond their responsibility, and convention drift.', 'Beyond spotting opportunities: the highest-risk refactoring done — abstractions, dead code, overgrown modules.'),
    5: form('Write a refactoring note: the prioritized opportunities, the convention and technical-debt findings, and the cleanups done — kept so the next feature is not harder to add.', 'A durable refactoring note of prioritized opportunities, debt findings, and the cleanups applied.'),
  },
};

/** ABSENCE_CORRECTION_SEEKING — A3 (self-review), keyword "review". */
export const ABSENCE_CORRECTION_SEEKING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_CORRECTION_SEEKING', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VERIFICATION_PARAM_AXES, spine: A3_SPINE,
  levelForms: {
    1: form('Review the one part of what was just built you are least confident is correct.', 'The lightest self-review: surface the single least-confident part.'),
    2: form('Review what was just built as a skeptical senior engineer would — name the weakest parts.', 'A light critical review: the weakest parts seen through a skeptical lens.'),
    3: form('Self-review what was just built: identify any assumptions that may be incorrect, logic that could fail under edge cases, and any parts of the implementation you are not confident about.', "Self-review of what was just built (incorrect assumptions / edge-case failures / low-confidence parts) hasn't been performed."),
    4: form('Review what was just built adversarially: argue against the implementation — what a skeptical senior would flag, the alternatives not considered, and the weakest parts.', 'Beyond a self-pass: an adversarial review surfacing flags, unconsidered alternatives, and weak points.'),
    5: form('Write a failure-analysis note from your review: the most likely production failure modes, the inputs that cause incorrect behaviour, and what you would change rebuilding from scratch.', 'A durable failure-analysis note from the review: failure modes, bad-input cases, and rebuild changes.'),
  },
};

/** ABSENCE_PROBLEM_CORRECTION — A3 (fix verification), keyword "fix". */
export const ABSENCE_PROBLEM_CORRECTION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_PROBLEM_CORRECTION', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VERIFICATION_PARAM_AXES, spine: A3_SPINE,
  levelForms: {
    1: form('Confirm the bug noticed this session was actually fixed, not just acknowledged.', 'The lightest correction check: confirm the noticed bug was really fixed.'),
    2: form('Go through the issues raised this session and confirm each was fixed or explicitly deferred with a note.', 'A light pass: each raised issue fixed or deferred-with-a-note, not left implicit.'),
    3: form('Review the outstanding bugs and issues identified in this session: for each one, confirm whether it has been explicitly fixed, explicitly deferred with a tracking note, or left unaddressed. Address any that are unresolved and blocking correctness of what was just built.', "Outstanding issues from this session haven't all been resolved or explicitly deferred."),
    4: form('Audit every issue raised this session: fixed (with the fix verified), deferred-with-a-note, or unaddressed — and fix the unresolved blocking ones, confirming each fix.', 'Beyond a checklist: each issue resolved with the fix verified, deferrals noted, blockers fixed.'),
    5: form('Write an issue-resolution note: each bug, its status (fixed / deferred / open), the fix and how it was verified, and a test guarding the ones most likely to recur.', 'A durable issue-resolution note tracking each fix, its verification, and a guard test for recurrence.'),
  },
};

/** ABSENCE_ACCESSIBILITY — A3 (accessibility verification), keyword "accessible". */
export const ABSENCE_ACCESSIBILITY_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_ACCESSIBILITY', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VERIFICATION_PARAM_AXES, spine: A3_SPINE,
  levelForms: {
    1: form('Check the most significant way what was just built is not accessible to a user with a disability.', 'The lightest check: the single biggest way the feature is not accessible to a disabled user.'),
    2: form('Confirm a keyboard-only user can complete the main workflow and every control is accessible (a name a screen reader announces).', 'A light pass: keyboard-only completion plus controls that are accessible by name.'),
    3: form('Audit the ARIA labelling and semantic structure of what was just built: identify every interactive element and confirm it has an accessible name — via native semantics, aria-label, or aria-labelledby — and that its role is correctly communicated to assistive technologies.', "Accessibility audit for what was just built (ARIA labelling, semantic structure, assistive-tech compatibility) hasn't been performed."),
    4: form('Audit thoroughly whether what was just built is accessible: accessible names and roles, keyboard navigation and focus order, and visual access (contrast, focus visibility, no colour-only signalling).', 'Beyond labelling: a full audit of whether the feature is accessible — names, keyboard, and visual access.'),
    5: form('Write an accessible-experience review note: the audited elements, the keyboard and visual findings against WCAG AA, and the fixes — kept so what you build stays accessible on every change.', 'A durable review note of what is and is not accessible against WCAG AA, with the fixes applied.'),
  },
};

/** ABSENCE_DATA_VALIDATION — A3 (input validation), keyword "validation". */
export const ABSENCE_DATA_VALIDATION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DATA_VALIDATION', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: VERIFICATION_PARAM_AXES, spine: A3_SPINE,
  levelForms: {
    1: form('Add validation for the most important untrusted input in what was just built.', 'The lightest validation step: guard the single most important untrusted input.'),
    2: form('Add validation on the main input path of what was just built — required fields and basic type checks.', 'A light validation pass: required fields and basic types on the main input path.'),
    3: form('Define the input schema for what was just built: for every endpoint or form, document the expected shape — required fields, optional fields, data types, and any constraints (min/max, allowed values) — and implement schema validation using a library such as Zod, Yup, or Joi.', "Input schema definition (required / optional / types / constraints) + schema-validation coverage hasn't been established for what was just built."),
    4: form('Implement thorough input validation: schemas for every endpoint and form with constraints, rejection of malformed input, and safe error messages on validation failure.', 'Beyond the main path: full-coverage input validation with constraints and safe rejection messages.'),
    5: form('Write a validation note plus the schema definitions: the validation rules per input, the rejection behaviour, and tests covering the boundary and malformed cases — kept with the feature.', 'A durable validation note and schemas, with boundary and malformed-input tests.'),
  },
};

/** Class-2 BATCH A — the 11 formal-base verification-quality records. */
export const CLASS2_RECORDS_BATCH_A: readonly ContentTemplateRecord[] = [
  BEHAVIOUR_TESTING_RECORD,
  ABSENCE_TEST_CREATION_RECORD,
  ABSENCE_REGRESSION_CHECK_RECORD,
  ABSENCE_SECURITY_CHECK_RECORD,
  ABSENCE_ERROR_HANDLING_RECORD,
  ABSENCE_DOCUMENTATION_RECORD,
  ABSENCE_REFACTORING_RECORD,
  ABSENCE_CORRECTION_SEEKING_RECORD,
  ABSENCE_PROBLEM_CORRECTION_RECORD,
  ABSENCE_ACCESSIBILITY_RECORD,
  ABSENCE_DATA_VALIDATION_RECORD,
];
