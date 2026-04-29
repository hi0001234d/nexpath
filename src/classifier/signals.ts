import type { SignalDefinition, Stage } from './types.js';

/**
 * Complete signal list derived from workflow-signals-research.md (22 signals).
 * Each entry drives both presence detection (in a prompt) and absence flagging
 * (when the signal hasn't appeared for absenceThreshold prompts in the expected stage).
 */
export const SIGNAL_DEFINITIONS: SignalDefinition[] = [
  // ── From original point 3.1 ───────────────────────────────────────────────
  {
    key: 'cross_confirming',
    description: 'Cross-confirming generated output with the agent',
    expectedStages: ['implementation', 'review_testing', 'architecture'],
    detectionKeywords: [
      'cross confirm', 'double check', 'double-check', 'review what you just',
      'verify this', 'check this', 'does this look right', 'is this correct',
      'confirm that', 'make sure this is right',
    ],
    vibeKeywords: [
      'wait is this right', 'does this look good', 'did you get that right',
      'are you sure this', 'is this what we wanted', 'does that make sense to you',
      'looks right to you', 'can you recheck',
    ],
    absenceThreshold: 15,
  },
  {
    key: 'correction_seeking',
    description: 'Seeking correction after spotting doubt',
    expectedStages: ['implementation', 'architecture', 'review_testing'],
    detectionKeywords: [
      'wait that', "that's wrong", "that doesn't look right", 'actually',
      'let me reconsider', 'is that right', 'i think there might be a bug',
      'something is off', 'this seems wrong', 'let me rethink',
    ],
    absenceThreshold: 20,
  },
  {
    key: 'problem_correction',
    description: 'Keenness on correcting spotted problems',
    expectedStages: ['implementation', 'review_testing'],
    detectionKeywords: [
      'fix this', 'correct this', 'this needs to be fixed', 'update this to',
      'change this so', 'the problem is', 'the issue is', 'bug here',
    ],
    absenceThreshold: 20,
  },
  {
    key: 'spec_cross_confirm',
    description: 'Cross-confirming spec during spec phase',
    expectedStages: ['prd', 'architecture'],
    detectionKeywords: [
      'does this spec', 'review the spec', 'check the requirements',
      'is the spec complete', 'does this cover', 'review the prd',
      'cross confirm the spec', 'review the requirements',
    ],
    absenceThreshold: 15,
  },
  {
    key: 'spec_revision',
    description: 'Maturity of spec revisions',
    expectedStages: ['prd'],
    detectionKeywords: [
      'update the spec', 'revise the requirements', 'refine the prd',
      'add to the spec', 'let me update the doc', 'add this requirement',
      'change the requirement', 'update the document',
    ],
    absenceThreshold: 15,
  },
  {
    key: 'phase_transition',
    description: 'Phase transition discipline (explicitly moving between phases)',
    expectedStages: ['implementation', 'review_testing', 'release'],
    detectionKeywords: [
      'move on to', 'next phase', 'ready to', 'now that', 'before we move',
      "let's start", "now let's", 'moving on', 'transition to', 'next step is',
    ],
    absenceThreshold: 20,
  },
  {
    key: 'test_creation',
    description: 'Test case creation after each module',
    expectedStages: ['implementation', 'review_testing'],
    detectionKeywords: [
      'write tests', 'add tests', 'create test', 'unit test', 'test suite',
      'write a test', 'add test coverage', 'test this module', 'test cases for',
      'add testing', 'write specs',
    ],
    vibeKeywords: [
      'does it work', 'can you try', 'try running', 'see if it works',
      'check if it works', 'make sure it works', 'test this out',
      'does this actually work', 'can you run this', 'try it out',
    ],
    absenceThreshold: 15,
  },
  {
    key: 'regression_check',
    description: 'Running all tests after each change',
    expectedStages: ['implementation', 'review_testing', 'release'],
    detectionKeywords: [
      'run all tests', 'run the test suite', 'check for regressions',
      'regression test', 'run tests', 'make sure nothing broke',
      'check existing tests', 'run the full test',
    ],
    vibeKeywords: [
      'did i break', 'did this break', 'make sure everything still works',
      'did anything break', 'still working after', 'broke anything',
      'nothing is broken', 'everything still working', 'check nothing broke',
    ],
    absenceThreshold: 15,
  },

  // ── From New-B research ──────────────────────────────────────────────────
  {
    key: 'security_check',
    description: 'Security check when adding auth/API/input handling',
    expectedStages: ['implementation', 'review_testing'],
    detectionKeywords: [
      'security', 'validate input', 'sanitize', 'authentication', 'authorization',
      'rate limit', 'cors', 'sql injection', 'xss', 'csrf', 'parameterized',
      'auth check', 'permission check',
    ],
    absenceThreshold: 15,
  },
  {
    key: 'error_handling',
    description: 'Specifying what to do when things fail',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'what happens when', 'error handling', 'handle errors', 'when this fails',
      'failure case', 'catch the error', 'error path', 'fallback', 'graceful',
    ],
    absenceThreshold: 20,
  },
  {
    key: 'comprehension',
    description: 'Code comprehension after generation',
    expectedStages: ['implementation', 'review_testing'],
    detectionKeywords: [
      'explain this', 'explain what', 'walk me through', 'why did you',
      'what does this do', 'help me understand', 'explain the logic',
      'what is this', 'how does this work',
    ],
    absenceThreshold: 20,
  },
  {
    key: 'alternatives_seeking',
    description: 'Seeking alternatives before major decisions',
    expectedStages: ['architecture', 'prd', 'implementation'],
    detectionKeywords: [
      'what are the alternatives', 'other options', 'what are the tradeoffs',
      'alternative approach', 'different way', 'which would you recommend',
      'pros and cons', 'options for', 'what are the options',
    ],
    absenceThreshold: 20,
  },
  {
    key: 'architecture_conflict',
    description: 'Architecture conflict check before adding features',
    expectedStages: ['implementation', 'architecture'],
    detectionKeywords: [
      'does this conflict', 'fits the architecture', 'consistent with',
      'does this match the existing', 'won\'t break existing', 'architecture conflict',
      'consistent with the design', 'align with the system',
    ],
    absenceThreshold: 20,
  },
  {
    key: 'dependency_management',
    description: 'Dependency version pinning and conflict check',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'pin the version', 'lock the version', 'version conflict', 'check compatibility',
      'dependency conflict', 'package version', 'peer dependencies',
    ],
    absenceThreshold: 20,
  },
  {
    key: 'deployment_planning',
    description: 'Deployment and environment configuration planning',
    expectedStages: ['release', 'implementation'],
    detectionKeywords: [
      'environment config', 'deployment config', 'production env', 'how do we deploy',
      'environment variables', 'deployment steps', 'deploy to', 'staging',
    ],
    absenceThreshold: 15,
  },
  {
    key: 'rollback_planning',
    description: 'Rollback planning before deployment',
    expectedStages: ['release'],
    detectionKeywords: [
      'rollback', 'roll back', 'revert', 'if this fails', 'recovery plan',
      'undo the deploy', 'how do we undo',
    ],
    absenceThreshold: 15,
  },
  {
    key: 'documentation',
    description: 'Documentation update after features',
    expectedStages: ['implementation', 'release'],
    detectionKeywords: [
      'document this', 'update the readme', 'add jsdoc', 'update the docs',
      'write documentation', 'api documentation', 'add comments', 'update docs',
    ],
    absenceThreshold: 20,
  },
  {
    key: 'refactoring_review',
    description: 'Refactoring review after implementation phases',
    expectedStages: ['review_testing', 'implementation'],
    detectionKeywords: [
      'refactor', 'clean up', 'clean this up', 'simplify', 'is there a better way',
      'can we improve', 'code quality', 'technical debt', 'rewrite this',
    ],
    absenceThreshold: 20,
  },
  {
    key: 'no_agent_pushback',
    description: 'Never pushing back on agent suggestions',
    expectedStages: ['implementation', 'architecture'],
    detectionKeywords: [
      "i don't agree", 'that seems wrong', 'but actually', 'let me challenge',
      'why did you choose', 'is there a better', 'reconsider',
      "i'd prefer", 'change your approach',
    ],
    absenceThreshold: 20,
  },
  {
    key: 'prompt_context_richness',
    description: 'Including spec/architecture references in prompts',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'per the spec', 'as defined in', 'according to the spec', 'in the prd',
      'as we discussed', 'per the architecture', 'as per the requirements',
      'following the spec',
    ],
    absenceThreshold: 20,
  },
  {
    key: 'spec_acceptance_check',
    description: 'Checking implementation against spec acceptance criteria',
    expectedStages: ['review_testing', 'implementation'],
    detectionKeywords: [
      'does this match the spec', 'meets the requirements', 'acceptance criteria',
      'spec compliance', 'matches what we defined', 'per the requirements',
      'does this satisfy',
    ],
    absenceThreshold: 15,
  },
  {
    key: 'observability',
    description: 'Monitoring and observability prompts for new features',
    expectedStages: ['implementation', 'release'],
    detectionKeywords: [
      'logging', 'monitoring', 'observability', 'error tracking', 'alerting',
      'how will we know if', 'metrics', 'traces', 'sentry', 'datadog',
    ],
    absenceThreshold: 20,
  },
  {
    key: 'behaviour_testing',
    description: 'Manual acceptance/behaviour testing from a real user perspective',
    expectedStages: ['implementation', 'review_testing'],
    detectionKeywords: [
      'manual test', 'acceptance test', 'test as a user', 'user scenario',
      'happy path', 'sad path', 'end to end test', 'e2e test',
      'user journey', 'test the flow', 'functional test', 'test from a user',
      'manually test', 'real user test', 'test the feature as',
    ],
    absenceThreshold: 15,
  },
];

// ── Signal detection from prompt text ────────────────────────────────────────

/**
 * Returns the keys of all signals detected as present in the given prompt text.
 */
export function detectSignals(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const sig of SIGNAL_DEFINITIONS) {
    // Full-weight check — any single match = signal present
    let fullHit = false;
    for (const kw of sig.detectionKeywords) {
      if (lower.includes(kw)) { fullHit = true; break; }
    }
    if (fullHit) { found.push(sig.key); continue; }

    // Vibe-keyword check — 2+ hits required (0.5 weight each = 1.0 credit)
    if (sig.vibeKeywords) {
      let vibeHits = 0;
      for (const vk of sig.vibeKeywords) {
        if (lower.includes(vk)) vibeHits++;
      }
      if (vibeHits >= 2) found.push(sig.key);
    }
  }
  return found;
}

// ── Signal lookup ─────────────────────────────────────────────────────────────

export const SIGNAL_MAP: Map<string, SignalDefinition> = new Map(
  SIGNAL_DEFINITIONS.map((s) => [s.key, s]),
);

// ── Initial counters (all signals, all absent) ────────────────────────────────

export function initialSignalCounters(): Record<string, import('./types.js').SignalCounter> {
  const counters: Record<string, import('./types.js').SignalCounter> = {};
  for (const sig of SIGNAL_DEFINITIONS) {
    counters[sig.key] = { present: false, lastSeenAt: null, windowsSinceLastSeen: 0 };
  }
  return counters;
}
