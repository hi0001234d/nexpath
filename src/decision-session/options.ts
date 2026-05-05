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
};

const ABSENCE_CONTENT_CASUAL: Partial<Record<string, DecisionContent>> = {
  test_creation:         ABSENCE_TEST_CREATION_CASUAL,
  regression_check:      ABSENCE_REGRESSION_CHECK_CASUAL,
  spec_acceptance_check: ABSENCE_SPEC_ACCEPTANCE_CASUAL,
  cross_confirming:      ABSENCE_CROSS_CONFIRMING_CASUAL,
  behaviour_testing:     BEHAVIOUR_TESTING,  // BEHAVIOUR_TESTING_CASUAL is out of sub-2 scope
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
  const absenceMap    = isVibe ? ABSENCE_CONTENT_BEGINNER : ABSENCE_CONTENT;
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
};
