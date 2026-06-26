/**
 * Spec / architecture content-template records (class 3). One record per signal;
 * column 3 is the existing shipped headline (frozen, kept verbatim), and columns
 * 1/2/4/5 escalate the same practice from a quick check up to a written artifact.
 *
 * Most signals here are spec/design work whose heaviest column yields a file
 * (a spec audit, a decision note, an API contract). Three are verification- or
 * note-style and thread a cadence across the columns; one — the prompt-context
 * signal — is a pure prompting habit, so its heaviest column stays a behaviour,
 * not a file.
 *
 * BATCH A = the 8 signals with a formal shipped headline (column-3 anchor = the
 * formal variant). BATCH B = the 3 casual-only signals (column-3 anchor = the
 * casual variant, which cites a named principle and so runs long).
 */

import type { ContentTemplateRecord, LevelForm, ParamAxisTag } from '../content-template-schema.js';
import {
  ALTERNATIVES_BEGINNER_OVERRIDE, API_DESIGN_REVIEW_BEGINNER_OVERRIDE, ARCH_CONFLICT_BEGINNER_OVERRIDE,
  CROSS_CONFIRMING_BEGINNER_OVERRIDE, PROMPT_CONTEXT_BEGINNER_OVERRIDE, SPEC_ACCEPTANCE_BEGINNER_OVERRIDE,
  SPEC_CROSS_CONFIRM_BEGINNER_OVERRIDE, SPEC_REVISION_BEGINNER_OVERRIDE,
} from './class3-records-beginner.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}

/** The param axes a spec/architecture why-desc grounds (same generic sources as the other classes). */
export const SPEC_ARCH_PARAM_AXES: Readonly<Record<string, ParamAxisTag>> = {
  workflow_pattern: 'extensible',
  decision_making_rhythm: 'closed-ordinal',
  explanation_learning_depth: 'closed-ordinal',
  abstraction_level_orientation: 'closed-ordinal',
  project_framework: 'open',
};

/** Cadence threads for the signals that carry one (verification / note signals). */
export const VERIFY_SPINE = ['review-cadence', 'commit-cadence'];
export const NOTE_SPINE = ['rationale-capture'];

// ── BATCH A — the 8 formal-headline signals ────────────────────────────────────

/** ABSENCE_SPEC_ACCEPTANCE — spec/design, keyword "spec". */
export const ABSENCE_SPEC_ACCEPTANCE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SPEC_ACCEPTANCE',
  registerOverrides: { beginner: SPEC_ACCEPTANCE_BEGINNER_OVERRIDE },
  source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: SPEC_ARCH_PARAM_AXES,
  levelForms: {
    1: form("Spot-check what was just built against the single most important spec requirement.", "The lightest spec check: confirm the one core requirement is met."),
    2: form("Check what was just built against the spec: run through the main requirements and flag any that are not met.", "A light spec pass: the main requirements checked and gaps flagged."),
    3: form("Review what was just built against the spec and acceptance criteria: go through each requirement and confirm whether it is fully implemented, partially implemented, or missing from what was just built.", "Compliance against the spec hasn't been audited for what was just built."),
    4: form("Audit what was just built against the full spec by category: each functional requirement, the acceptance criteria, and the edge cases — mark each met, partial, or missing.", "Beyond the main pass: every spec requirement and edge case audited and marked."),
    5: form("Write a spec-compliance report file: every requirement marked met / partial / missing, the gaps with evidence, and the acceptance criteria still open — kept with the feature.", "A durable spec-compliance report of per-requirement status and the open criteria."),
  },
};

/** ABSENCE_CROSS_CONFIRMING — verification of generated output, keyword "verif". */
export const ABSENCE_CROSS_CONFIRMING_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_CROSS_CONFIRMING',
  registerOverrides: { beginner: CROSS_CONFIRMING_BEGINNER_OVERRIDE },
  source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: SPEC_ARCH_PARAM_AXES, spine: VERIFY_SPINE,
  levelForms: {
    1: form("Verify the one part of what was just built most likely to be wrong — a generated call or assumption.", "The lightest verification: check the single most-likely-wrong generated part."),
    2: form("Verify the main path of what was just built: trace it and confirm the generated logic actually does what is expected.", "A light verification pass: the main generated path traced and confirmed."),
    3: form("Review what was just built critically: identify any hallucinated functions or APIs, logic that looks plausible but is incorrect, edge cases not handled, and any code that was generated but not verified against the actual system it will run in.", "AI-generated code in recent prompts hasn't been verified."),
    4: form("Verify what was just built adversarially: check for hallucinated functions or APIs, plausible-but-wrong logic, and unhandled edge cases — verify each against the real system.", "Beyond the main path: a full verification for hallucinations, wrong logic, and missed edges."),
    5: form("Write a verification note file: what was traced, the issues found (hallucinations, wrong logic, missed edges), and the fixes — committed so the verification is on record.", "A durable verification note of what was traced, found, and fixed."),
  },
};

/** ABSENCE_ALTERNATIVES — design tradeoffs, keyword "alternative". */
export const ABSENCE_ALTERNATIVES_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_ALTERNATIVES',
  registerOverrides: { beginner: ALTERNATIVES_BEGINNER_OVERRIDE },
  source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: SPEC_ARCH_PARAM_AXES,
  levelForms: {
    1: form("Name one alternative to the main decision in what was just built, and why it was not chosen.", "The lightest check: surface one unchosen alternative and the reason."),
    2: form("Review the key decision in what was just built: name the alternatives not chosen and the tradeoff that settled it.", "A light pass: the main decision's alternatives and tradeoff named."),
    3: form("Review the key decisions made in what was just built: name the alternatives that were not chosen, explain the tradeoffs between each approach, and confirm that the chosen solution is the best fit for the constraints of this project — not just the first viable option.", "Alternatives to the chosen approach haven't been weighed against the project's constraints."),
    4: form("Audit each significant decision in what was just built: per choice, name at least one alternative not explored and weigh it against the project's constraints.", "Beyond one decision: every significant choice's alternatives weighed against constraints."),
    5: form("Write a decision note file: per key decision, the chosen approach, the alternatives weighed, the tradeoffs, and why the choice wins — kept with the feature.", "A durable decision note of the alternatives weighed and the rationale."),
  },
};

/** ABSENCE_ARCH_CONFLICT — architectural consistency, keyword "architect". */
export const ABSENCE_ARCH_CONFLICT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_ARCH_CONFLICT',
  registerOverrides: { beginner: ARCH_CONFLICT_BEGINNER_OVERRIDE },
  source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: SPEC_ARCH_PARAM_AXES,
  levelForms: {
    1: form("Check whether what was just built follows the existing architectural patterns, or introduces a new one.", "The lightest architecture check: does it match the established patterns?"),
    2: form("Review what was just built for architectural consistency: flag any pattern, abstraction, or convention it diverges from.", "A light architecture pass: divergences from the established patterns flagged."),
    3: form("Review what was just built for architectural consistency: does this feature follow the same patterns, abstractions, and conventions established in the existing codebase, or does it introduce a parallel approach that will diverge over time and increase maintenance cost?", "Whether what was just built follows existing patterns and conventions hasn't been audited."),
    4: form("Audit what was just built against the project's architecture: module boundaries crossed, inconsistent shared-state access, and conflicting new dependencies — flag each with the architectural rule it breaks.", "Beyond pattern-match: boundaries, shared state, and dependencies audited against the architecture."),
    5: form("Write an architecture-consistency note file: the patterns followed, the violations found, and per violation the fix-or-document decision — kept with the feature.", "A durable architecture note of the violations and the fix-or-document calls."),
  },
};

/** ABSENCE_PROMPT_CONTEXT — prompting habit (pure behaviour, no file), keyword "context". */
export const ABSENCE_PROMPT_CONTEXT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_PROMPT_CONTEXT',
  registerOverrides: { beginner: PROMPT_CONTEXT_BEGINNER_OVERRIDE },
  source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: SPEC_ARCH_PARAM_AXES,
  levelForms: {
    1: form("Check whether the last prompt carried the spec and architecture context, or ran on assumptions.", "The lightest context check: did the last prompt carry the planning context?"),
    2: form("Before the next prompt, inject the missing planning context: paste the relevant spec or architecture section so the work is grounded in real context.", "A light pass: the missing planning context injected before continuing."),
    3: form("Review the prompts used to build this feature: are they grounded in the project's spec, architecture decisions, and task breakdown, or are they ad hoc instructions that you are implementing without access to the full planning context? If context is missing, inject it now before the next prompt.", "The spec / architecture / task-breakdown context hasn't been confirmed in recent prompts."),
    4: form("Audit the context behind what was just built and assemble the gap into one grounding block: identify which prompts ran without the spec, the architecture, or the acceptance criteria, gather those exact pieces, and paste them as a single context block before continuing.", "Beyond injecting ad hoc: the missing spec / architecture / criteria context assembled into one grounding block."),
    5: form("Make context-rich prompting the habit: before every prompt, paste the relevant spec section, the architecture decisions, and the acceptance criteria, and state exactly what is being built against them — so no prompt runs on missing context.", "A standing prompting discipline: full planning context pasted into every prompt."),
  },
};

/** ABSENCE_SPEC_CROSS_CONFIRM — spec vs requirements, keyword "spec". */
export const ABSENCE_SPEC_CROSS_CONFIRM_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SPEC_CROSS_CONFIRM',
  registerOverrides: { beginner: SPEC_CROSS_CONFIRM_BEGINNER_OVERRIDE },
  source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: SPEC_ARCH_PARAM_AXES,
  levelForms: {
    1: form("Spot-check one spec requirement: does it trace back to a real user need?", "The lightest spec check: one requirement traced to a stated need."),
    2: form("Review the spec against its source requirements: flag any requirement that does not trace to a stated need or an agreed decision.", "A light pass: untraceable spec requirements flagged."),
    3: form("Cross-confirm this project's spec against its source requirements: for each requirement in the spec, verify it traces back to a stated user need or stakeholder decision, covers the acceptance criteria completely, and does not contain assumptions that were not explicitly agreed upon.", "The spec itself hasn't been cross-confirmed against the original requirements."),
    4: form("Audit the spec end-to-end: each requirement's traceability, contradictions between requirements, ambiguous or untestable criteria, and unconfirmed scope — flag each.", "Beyond traceability: contradictions, ambiguity, and unconfirmed scope in the spec flagged."),
    5: form("Write a spec-audit note file: per requirement the traceability and feasibility verdict, the contradictions and ambiguities found, and the open scope questions — kept with the spec.", "A durable spec-audit of traceability, contradictions, and the open scope."),
  },
};

/** ABSENCE_SPEC_REVISION — keep the spec current, keyword "spec". */
export const ABSENCE_SPEC_REVISION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SPEC_REVISION',
  registerOverrides: { beginner: SPEC_REVISION_BEGINNER_OVERRIDE },
  source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: SPEC_ARCH_PARAM_AXES,
  levelForms: {
    1: form("Check whether the spec still matches one thing that changed during implementation.", "The lightest spec-drift check: one implementation change reflected in the spec?"),
    2: form("Review the spec against the current build: flag the main places the implementation has diverged from it.", "A light pass: the main spec-vs-build divergences flagged."),
    3: form("Revise this project's spec to reflect what has been learned since the initial draft: update any requirements that turned out to be more or less complex than anticipated, add acceptance criteria for edge cases discovered during implementation, and remove or defer any scope that has been implicitly dropped.", "The spec hasn't been updated to match what's been learned during implementation."),
    4: form("Audit the spec for drift end-to-end: every divergence between spec and build, the implementation-time decisions not captured, and the emergent constraints — decide per case update the spec or fix the build.", "Beyond the main drifts: every spec divergence and uncaptured decision resolved per case."),
    5: form("Revise the spec into an updated file: the corrected requirements, the new edge-case criteria, the captured decisions, and the deferred scope — so the spec is a true record of the build.", "A durable revised spec capturing the decisions, new criteria, and deferred scope."),
  },
};

/** ABSENCE_API_DESIGN_REVIEW — API surface/design, keyword "api". */
export const ABSENCE_API_DESIGN_REVIEW_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_API_DESIGN_REVIEW',
  registerOverrides: { beginner: API_DESIGN_REVIEW_BEGINNER_OVERRIDE },
  source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: SPEC_ARCH_PARAM_AXES,
  levelForms: {
    1: form("Check whether what was just built changes the API in a way that could break an existing caller.", "The lightest API check: any change that could surprise existing callers?"),
    2: form("Review the API surface of what was just built: list the endpoint, parameter, or response changes and flag any that are breaking.", "A light API pass: the surface changes listed and breaking ones flagged."),
    3: form("Review the API surface of what was just built for backwards compatibility: list any changes to existing endpoints, parameters, or response shapes, and confirm whether each change is backwards compatible or constitutes a breaking change that requires a version bump.", "The API contract for what was just built hasn't been reviewed for stability."),
    4: form("Audit the API design end-to-end: each endpoint's inputs, response shapes, and error codes, every breaking change against existing consumers, and the versioning strategy — flag each gap.", "Beyond the surface: the API inputs, errors, breaking changes, and versioning audited."),
    5: form("Write an API design note file: the locked contract per endpoint (inputs, responses, errors), the breaking changes with a consumer-migration plan, and the versioning strategy — kept with the API.", "A durable API design note of the locked contract, breaking changes, and versioning."),
  },
};

/** Class-3 BATCH A — the 8 formal-headline records. */
export const CLASS3_RECORDS_BATCH_A: readonly ContentTemplateRecord[] = [
  ABSENCE_SPEC_ACCEPTANCE_RECORD,
  ABSENCE_CROSS_CONFIRMING_RECORD,
  ABSENCE_ALTERNATIVES_RECORD,
  ABSENCE_ARCH_CONFLICT_RECORD,
  ABSENCE_PROMPT_CONTEXT_RECORD,
  ABSENCE_SPEC_CROSS_CONFIRM_RECORD,
  ABSENCE_SPEC_REVISION_RECORD,
  ABSENCE_API_DESIGN_REVIEW_RECORD,
];

// ── BATCH B — the 3 casual-only signals ────────────────────────────────────────
// These have no formal headline, so column 3 anchors on the casual variant, which
// cites a named principle and so runs longer than the copy-paste budget (exempt).

/** ABSENCE_ARCHITECTURE_NOTE_ABSENCE — record the rationale, keyword "architect". */
export const ABSENCE_ARCHITECTURE_NOTE_ABSENCE_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_ARCHITECTURE_NOTE_ABSENCE', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: SPEC_ARCH_PARAM_AXES, spine: NOTE_SPINE,
  levelForms: {
    1: form("Jot a one-line note on the architectural decision just made — what was chosen and why.", "The lightest architecture note: one line on the choice and the reason."),
    2: form("Write a short architecture note for the decision just made — context, choice, and consequences — and commit it with the code.", "A light pass: a short architecture note committed alongside the code."),
    3: form("Architecture Decision Records (Michael Nygard, 2011): 'An ADR captures a single architectural decision and its rationale. People months or years later need to understand why the system is constructed the way that it is.' For the structural decision just made — add a short note: context, decision, consequences. A code comment block or doc entry works.", "The rationale for the architectural decision just made hasn't been recorded."),
    4: form("Write a PR-style architecture note: the context, the decision, the alternatives considered, and the consequences — reviewed like a document, not just a code comment.", "Beyond a quick note: a reviewed architecture write-up of context, decision, and consequences."),
    5: form("Keep a maintained architecture decision file in the repo: this decision and its rationale recorded with context, consequences, and date — so the architectural why survives in a document, not just the code.", "A durable architecture decision file recording the why for future maintainers."),
  },
};

/** ABSENCE_API_CONTRACT_DEFINITION — interface before implementation, keyword "contract". */
export const ABSENCE_API_CONTRACT_DEFINITION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_API_CONTRACT_DEFINITION', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: SPEC_ARCH_PARAM_AXES,
  levelForms: {
    1: form("Before coding the handler, jot what this endpoint accepts and returns — the contract in one line.", "The lightest contract step: the accept/return shape noted before the handler."),
    2: form("Define the contract for this endpoint before implementing: the request shape, the response shape, and the error format — as a short doc comment.", "A light pass: the request/response/error contract sketched before the handler."),
    3: form("OpenAPI contract-first principle: define the API interface before writing the handler. For the endpoint being built — what does it accept (request schema: required fields, types, validation rules)? What does it return (response schema: success shape, error shape, status codes)? What is the error response format? Defining this first prevents implicit contracts that drift between callers and implementors — and makes mock servers and tests possible before the backend exists.", "The API contract (request schema, response schema, error format) hasn't been defined before implementation."),
    4: form("Define the full contract before the handler: the request schema with validation, the success and error response shapes, the status codes, and the conditions for each error — written above the handler.", "Beyond a sketch: the complete request/response/error contract specified before coding."),
    5: form("Write the API contract into a schema file: request schema, response schemas, error formats, and status codes — the source of truth callers and tests build against before the backend exists.", "A durable contract schema file as the source of truth for callers and tests."),
  },
};

/** ABSENCE_BACKWARDS_COMPATIBILITY_CHECK — check callers before changing, keyword "compatib". */
export const ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_BACKWARDS_COMPATIBILITY_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: SPEC_ARCH_PARAM_AXES, spine: VERIFY_SPINE,
  levelForms: {
    1: form("Before changing the interface, grep for its callers and check whether the change stays backwards-compatible.", "The lightest compatibility check: grep the callers, confirm the change is compatible."),
    2: form("Check backwards compatibility before the change: find the main callers of this interface and confirm the change does not break them.", "A light pass: the main callers checked for compatibility before the change."),
    3: form("Semantic Versioning (semver.org): MAJOR version = backwards-incompatible change. The formal rule: any change to an interface used by existing callers must enumerate those callers and assess the impact before implementation. For the function signature, API contract, or interface just changed — what calls it? What are the downstream effects? Have those callers been updated or is the change backwards-compatible?", "Existing callers of the interface haven't been enumerated before the change."),
    4: form("Audit backwards compatibility before the change: enumerate every caller of the interface, assess what each depends on, and classify the change as compatible or breaking per caller.", "Beyond the main callers: every caller enumerated and the change classified per caller for compatibility."),
    5: form("Write a compatibility-impact note file: every caller of the interface, the compatible-or-breaking verdict per caller, and the version-or-update plan for the breaks — before the change ships.", "A durable compatibility-impact note of the per-caller verdicts and the migration plan."),
  },
};

/** Class-3 BATCH B — the 3 casual-only records. */
export const CLASS3_RECORDS_BATCH_B: readonly ContentTemplateRecord[] = [
  ABSENCE_ARCHITECTURE_NOTE_ABSENCE_RECORD,
  ABSENCE_API_CONTRACT_DEFINITION_RECORD,
  ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_RECORD,
];

/** All class-3 records (batch A + batch B) = the 11 spec/architecture signals. */
export const CLASS3_RECORDS: readonly ContentTemplateRecord[] = [
  ...CLASS3_RECORDS_BATCH_A,
  ...CLASS3_RECORDS_BATCH_B,
];
