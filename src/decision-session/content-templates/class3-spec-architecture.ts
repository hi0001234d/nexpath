// Per-class decision-session content (class3_spec_architecture). Relocated verbatim from
// options.ts / options-beginner.ts — one home per signal class.

import type { DecisionContent } from '../options.js';
import { WHY_HELP_BY_SIGNAL_TYPE } from '../why-help-by-signal-type.js';

/** Absence: spec_acceptance_check — fires when implementation proceeds without checking against spec */
export const ABSENCE_SPEC_ACCEPTANCE: DecisionContent = {
  signalType:   "ABSENCE_SPEC_ACCEPTANCE",
  question:      'Implementation done — spec checked?',
  pinchFallback: 'Check the spec.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SPEC_ACCEPTANCE'],
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
export const ABSENCE_CROSS_CONFIRMING: DecisionContent = {
  signalType:   "ABSENCE_CROSS_CONFIRMING",
  question:      'AI generated it — have you verified it?',
  pinchFallback: 'Verify the output.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_CROSS_CONFIRMING'],
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

export const ABSENCE_ALTERNATIVES: DecisionContent = {
  signalType:   "ABSENCE_ALTERNATIVES",
  question:      'Decision made — alternatives considered?',
  pinchFallback: 'No alternatives.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ALTERNATIVES'],
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

export const ABSENCE_ARCH_CONFLICT: DecisionContent = {
  signalType:   "ABSENCE_ARCH_CONFLICT",
  question:      'Feature added — architecture consistency checked?',
  pinchFallback: 'Arch conflict.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ARCH_CONFLICT'],
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

export const ABSENCE_PROMPT_CONTEXT: DecisionContent = {
  signalType:   "ABSENCE_PROMPT_CONTEXT",
  question:      'Prompts sent — spec and arch referenced?',
  pinchFallback: 'Missing context.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_PROMPT_CONTEXT'],
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

export const ABSENCE_SPEC_CROSS_CONFIRM: DecisionContent = {
  signalType:   "ABSENCE_SPEC_CROSS_CONFIRM",
  question:      'Spec written — cross-confirmed against requirements?',
  pinchFallback: 'Spec not confirmed.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SPEC_CROSS_CONFIRM'],
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

export const ABSENCE_SPEC_REVISION: DecisionContent = {
  signalType:   "ABSENCE_SPEC_REVISION",
  question:      'Spec drafted — revised since initial version?',
  pinchFallback: 'Spec unrevised.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SPEC_REVISION'],
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

/** ABSENCE_SPEC_ACCEPTANCE_CASUAL — casual-register variant for pro_geek_soul and null profiles */
export const ABSENCE_SPEC_ACCEPTANCE_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_SPEC_ACCEPTANCE",
  question:      'Built something — does it match what was planned?',
  pinchFallback: 'Check the spec.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SPEC_ACCEPTANCE'],
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
export const ABSENCE_CROSS_CONFIRMING_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_CROSS_CONFIRMING",
  question:      'AI wrote it — have you actually checked it?',
  pinchFallback: 'Verify the output.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_CROSS_CONFIRMING'],
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

export const ABSENCE_ALTERNATIVES_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_ALTERNATIVES",
  question:      'Decision made — any alternatives looked at?',
  pinchFallback: 'No alternatives.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ALTERNATIVES'],
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

export const ABSENCE_ARCH_CONFLICT_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_ARCH_CONFLICT",
  question:      'Feature added — does it fit the codebase?',
  pinchFallback: 'Arch conflict.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ARCH_CONFLICT'],
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

export const ABSENCE_PROMPT_CONTEXT_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_PROMPT_CONTEXT",
  question:      'Sending prompts — have you shared the spec?',
  pinchFallback: 'Missing context.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_PROMPT_CONTEXT'],
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

export const ABSENCE_SPEC_CROSS_CONFIRM_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_SPEC_CROSS_CONFIRM",
  question:      'Spec exists — has it been checked against the plan?',
  pinchFallback: 'Spec not confirmed.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SPEC_CROSS_CONFIRM'],
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

export const ABSENCE_SPEC_REVISION_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_SPEC_REVISION",
  question:      'Spec written — has it been updated since the first draft?',
  pinchFallback: 'Spec unrevised.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SPEC_REVISION'],
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

export const ABSENCE_API_DESIGN_REVIEW: DecisionContent = {
  signalType:   "ABSENCE_API_DESIGN_REVIEW",
  question:      'API being built — design reviewed?',
  pinchFallback: 'API design?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_API_DESIGN_REVIEW'],
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

export const ABSENCE_API_DESIGN_REVIEW_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_API_DESIGN_REVIEW",
  question:      'API being built — design reviewed?',
  pinchFallback: 'API design?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_API_DESIGN_REVIEW'],
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

export const ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_ARCHITECTURE_NOTE_ABSENCE",
  question:      'Architecture decision made — noted the rationale?',
  pinchFallback: 'Add an architecture note.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ARCHITECTURE_NOTE_ABSENCE'],
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

export const ABSENCE_API_CONTRACT_DEFINITION_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_API_CONTRACT_DEFINITION",
  question:      'API being built — defined the contract first?',
  pinchFallback: 'Define the interface before implementing.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_API_CONTRACT_DEFINITION'],
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

export const ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_BACKWARDS_COMPATIBILITY_CHECK",
  question:      'Interface changed — checked existing consumers?',
  pinchFallback: 'Check what calls this before changing.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_BACKWARDS_COMPATIBILITY_CHECK'],
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

/** ABSENCE_SPEC_ACCEPTANCE_BEGINNER — beginner-register variant (L1×2 / L2×1 / L3×1) */
export const ABSENCE_SPEC_ACCEPTANCE_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_SPEC_ACCEPTANCE",
  question:      'Built something — does it match what was planned?',
  pinchFallback: 'Check the spec.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SPEC_ACCEPTANCE'],
  L1: [
    {
      option: '1. Look at what was just built and compare it to what we planned to build.\n2. Share with me: does it do everything it was supposed to, or is something missing or different?\n3. Then check: are there any situations it should handle that it doesn\'t?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built something but I haven't compared it back to what we planned."}
Spec-vs-build comparison hasn't been done.
Walk me through it: does each piece match the plan, is something missing or different, are there situations it should handle that it doesn't?
{R4_CLOSE}`,
    },
    {
      option: 'Walk through what was just built step by step and tell me — does each part match what we planned? Share anything that looks different from what we agreed on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; plan-match not verified."}
Same moment, simpler: does each part of the build match the plan?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does what was just built do what we planned it to do? Share any differences with me before we move on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Lighter: does it do what we planned? Share any differences.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that doesn\'t match what we originally planned to build?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: anything that doesn't match what we originally planned.
{R4_CLOSE}`,
    },
  ],
};

/** ABSENCE_CROSS_CONFIRMING_BEGINNER — beginner-register variant (L1×2 / L2×1 / L3×1) */
export const ABSENCE_CROSS_CONFIRMING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_CROSS_CONFIRMING",
  question:      'AI wrote it — have you actually checked it?',
  pinchFallback: 'Verify the output.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_CROSS_CONFIRMING'],
  L1: [
    {
      option: '1. Read through what was just built carefully — not just to check if it looks right, but to understand what it actually does.\n2. Share with me: is there anything that seems off, confusing, or that you\'re not sure about?\n3. Then tell me: is there anything in what was just built you haven\'t manually checked yet?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Code was generated for me but I've just been accepting it; I haven't checked the details."}
The piece-by-piece check on generated code hasn't been done.
Walk me through it: read carefully to understand what each part does, flag anything off/confusing, then point to anything I haven't manually checked.
{R4_CLOSE}`,
    },
    {
      option: 'Walk through what was just built step by step and tell me — do you understand what each part does? Share anything that looks unclear or that you just accepted without checking.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Generated output present; understanding-check not done."}
Same moment, simpler: do I understand what each part does? Flag anything unclear or accepted without checking.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that you accepted because it looked right, but haven\'t actually checked? Share it with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Generated; looks-right-but-not-checked items not flagged."}
Lighter: anything accepted because it looked right, not actually checked.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that you\'re not 100% sure is correct — something you haven\'t manually verified yet?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Generated."}
Minimum next step: anything I'm not 100% sure is correct.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_ALTERNATIVES_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_ALTERNATIVES",
  question:      'Decision made — any alternatives looked at?',
  pinchFallback: 'No alternatives.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ALTERNATIVES'],
  L1: [
    {
      option: '1. Think about the biggest decision that was made while building this feature.\n2. Share with me: what other ways could it have been done, and why did we go with this one?\n3. Then tell me: is this still the best approach now that you think about it, or would something else have been simpler?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I made a big decision while building this without thinking about other ways to do it."}
The biggest decision's alternatives haven't been talked through together.
Let's walk through it: what other ways could it have been done, why we went with this one, and whether this is still the best fit now.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through the most important choice made in what was just built — what were the other options we could have picked, and why did we choose this one? Share your thinking with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Made the most important choice without talking through the options first."}
The most-important-choice's other-options walkthrough hasn't been shared.
Let's go through the other options together and confirm why this one was picked.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there any choice made in what was just built where we just went with the first idea without thinking about other ways to do it? Share that with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Went with the first idea on some choices without thinking about other ways."}
A first-idea-without-thinking check hasn't been done.
Let's spot any place I just went with the first option and look at other ways now.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there any decision in what was just built that was made without thinking about other options first?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: let's check for any decision made without thinking about other options first.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_ARCH_CONFLICT_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_ARCH_CONFLICT",
  question:      'Feature added — does it fit the codebase?',
  pinchFallback: 'Arch conflict.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ARCH_CONFLICT'],
  L1: [
    {
      option: '1. Look at what was just built and compare it to how other parts of the project are written.\n2. Share with me: does it feel like it belongs, or does it do things in a different way than everything else?\n3. Then tell me: is there anything that could cause problems when we try to connect it with the rest of the project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built something new but I haven't compared it to how other parts of this project are written."}
Codebase-fit check hasn't been done.
Walk me through it: compare what I built to other parts, does it fit or do things differently, would it cause problems connecting with the rest?
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what was just built and tell me — does it fit with the way the rest of the project is structured, or does it work differently from everything else? Share what you notice with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; structural-fit unclear."}
Same moment, simpler: does it fit the project's structure, or does it work differently?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that looks different from how the rest of the project does things? Share it with me and let\'s check if that\'s a problem.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Lighter: anything that looks different from how the rest of the project does things.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that doesn\'t fit with the rest of the project\'s structure or patterns?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: anything that doesn't fit the project's patterns or structure.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_PROMPT_CONTEXT_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_PROMPT_CONTEXT",
  question:      'Sending prompts — have you shared the spec?',
  pinchFallback: 'Missing context.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_PROMPT_CONTEXT'],
  L1: [
    {
      option: '1. Think about what you\'ve been building in this session.\n2. Share with me: have you seen the original plan for what we\'re building, or have you just been following each instruction without knowing the bigger picture?\n3. Then paste the plan or the task description into the conversation and check that what was just built matches what was planned.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been building based on individual instructions but I'm not sure I've seen the full plan."}
The full-plan-vs-individual-instructions check hasn't been done.
Walk me through it: think about what I've been building, do I have the full plan or just instructions, then paste the plan and check the build matches.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what you\'ve been working from in this session — have you seen the full plan, or just individual instructions? Check whether what was just built matches the original plan if you have it, and share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Following individual prompts; full plan unclear."}
Same moment, simpler: do I have the full plan, or only individual instructions? Check build vs plan if available.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Have you seen the plan or the description of what this feature is supposed to do? If not, ask me for it — then check that what was just built matches and share what you find.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Following individual prompts."}
Lighter: have I seen the plan or description of this feature? If not, ask for it.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Do you know what the full plan says for this feature, or have you been building without seeing it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Following individual prompts."}
Minimum next step: I know what the full plan says, or building without it?
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SPEC_CROSS_CONFIRM_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_SPEC_CROSS_CONFIRM",
  question:      'Spec exists — has it been checked against the plan?',
  pinchFallback: 'Spec not confirmed.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SPEC_CROSS_CONFIRM'],
  L1: [
    {
      option: '1. Read through this project\'s spec and check: does everything in it come from something that was actually decided or agreed on?\n2. Share with me: is there anything in the spec that looks like an assumption rather than a confirmed requirement?\n3. Then tell me: is there anything that could be misunderstood or built in the wrong way because it\'s not specific enough?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I have a spec but I'm not sure everything in it was actually agreed on or specific enough."}
Spec-vs-actually-agreed check hasn't been done.
Walk me through it: does everything trace back to a real decision, anything that looks like an assumption, anything not specific enough to build correctly?
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through this project\'s spec and tell me — is there anything in it that you\'re not sure was actually agreed on, or anything that\'s vague enough to be confusing? Share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Spec present; assumption-vs-confirmed not separated."}
Same moment, simpler: anything in the spec I'm not sure was actually agreed, or anything vague enough to confuse?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in this project\'s spec that might be an assumption rather than something that was actually confirmed? Share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Spec present; assumption check not done."}
Lighter: anything in the spec that might be an assumption rather than confirmed.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in this project\'s spec that hasn\'t been checked against what was actually agreed on?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Spec present."}
Minimum next step: anything in the spec not checked against what was actually agreed.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SPEC_REVISION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_SPEC_REVISION",
  question:      'Spec written — has it been updated since the first draft?',
  pinchFallback: 'Spec unrevised.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SPEC_REVISION'],
  L1: [
    {
      option: '1. Look at this project\'s spec and then look at what has actually been built so far.\n2. Share with me: are they still in sync, or have things changed since the spec was first written?\n3. Then tell me: what would need to be updated in the spec to make it match what\'s actually happening?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been building from a spec but the spec hasn't been updated as things change."}
Spec-vs-build sync check hasn't been done.
Walk me through it: spec + build side-by-side, are they still in sync, what would need updating to make spec match what's happening?
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through this project\'s spec and tell me — is it still accurate, or have things changed since it was first written that aren\'t in there yet? Share what\'s out of date with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Spec present; current-accuracy unclear."}
Same moment, simpler: is the spec still accurate or out of date?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is this project\'s spec still accurate, or has something changed since it was written that isn\'t reflected in it yet? Share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Spec present; recent changes not reflected."}
Lighter: anything changed since the spec was written and not in it yet?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Does this project\'s spec still match what\'s actually being built, or is it out of date?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Spec present."}
Minimum next step: does the spec still match what's actually being built?
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_API_DESIGN_REVIEW_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_API_DESIGN_REVIEW",
  question:      'API being built — design reviewed?',
  pinchFallback: 'API design?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_API_DESIGN_REVIEW'],
  L1: [
    {
      option: '1. Look at what was just built and check whether it could break anything that\'s already using this API. 2. List any changes to how it works — what it expects and what it sends back. 3. Share your list with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built API endpoints but I haven't checked if they might break things already using the API."}
Breaking-change check on the API hasn't been done.
Walk me through it: changes to how endpoints work, what they expect, what they return — anything that'd surprise existing callers?
{R4_CLOSE}`,
    },
    {
      option: 'Go through this feature\'s API and check — could anything about how it works change after other code starts depending on it? Share what you find with me before we move on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "API present; change-stability unclear."}
Same moment, simpler: could anything about how it works change after other code depends on it?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does what was just built change the API in a way that might break something that\'s already using it? Tell me what changed and we\'ll figure out if it\'s a problem.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "API present."}
Lighter: any change in the API that might break something already using it.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s one thing about how this feature\'s API works that might need to change later — and could that cause a problem for anything depending on it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "API present."}
Minimum next step: one thing about the API that might need to change later + risk to dependents.
{R4_CLOSE}`,
    },
  ],
};
