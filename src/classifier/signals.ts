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
    vibeKeywords: [
      'did we miss anything', 'does this cover everything',
      'is anything missing', 'have we got everything',
      'looks complete to you', 'anything we forgot',
      'is this complete', 'have we covered it all',
      'does this look finished', 'anything left out',
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
    vibeKeywords: [
      'what else could we do', 'any other options', 'which is better',
      'what would you use instead', 'any other ways to do this',
      'could we do it differently', 'is there an easier way',
      "what's the best approach here", 'what else is there',
      'which approach do you prefer',
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
    vibeKeywords: [
      'will this break anything', 'will this mess things up',
      'does this play nice with the rest', "won't mess up what we have",
      'does this fit with everything', 'is this okay with what we already have',
      'will this cause problems', 'does this work with the existing setup',
      "is this compatible with what's there",
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
    vibeKeywords: [
      'wait is that right', 'are you sure about that',
      "that doesn't sound right", "i'm not sure about this",
      'is that the best way', "i'm not convinced",
      'that seems off to me', "i really don't think so",
      'are you certain about that', "hmm i don't think that's right",
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

  // ── Sub-4 — idea / task_breakdown / feedback_loop ─────────────────────────
  {
    key: 'idea_scoping',
    description: 'User has not articulated what they are building clearly',
    expectedStages: ['idea'],
    detectionKeywords: [
      'the goal is', "the problem i'm solving", 'the app should', 'the main feature',
      'the scope is', "here's what it needs to do", 'it needs to', 'the key features',
      'the core thing', 'the main thing we need', 'this solves', "what i'm building is",
    ],
    vibeKeywords: [
      'basically it should', 'the point is to', 'what it does is', 'i need it to',
      'it will let you', 'the main thing it does', 'what i want is', 'it should be able to',
    ],
    absenceThreshold: 8,
  },
  {
    key: 'idea_constraint_check',
    description: 'No discussion of constraints or non-goals',
    expectedStages: ['idea'],
    detectionKeywords: [
      'out of scope', 'not in scope', "won't do", "we don't need", 'no need for',
      'just the basics', 'not required', 'skip for now', "that's out of scope",
    ],
    vibeKeywords: [
      'mvp', "i don't want to worry about", "let's not do", 'that can come later',
      'just the simple version', "we don't need that yet", 'keep it basic',
      'not needed for now', 'later maybe',
    ],
    absenceThreshold: 10,
  },
  {
    key: 'idea_user_definition',
    description: 'Target user/audience not discussed',
    expectedStages: ['idea'],
    detectionKeywords: [
      'who is this for', 'the user is', 'my users', 'people who',
      'the target user', 'end users', 'users who want', 'someone who',
    ],
    vibeKeywords: [
      'for people who', 'for someone who', "it's for", 'people like',
      'someone who wants to', 'the kind of person who', 'for my client', 'for anyone who',
    ],
    absenceThreshold: 10,
  },
  {
    key: 'task_ordering',
    description: 'Tasks not being ordered or prioritized',
    expectedStages: ['task_breakdown'],
    detectionKeywords: [
      'what should i do first', 'which task comes first', 'what order should',
      'order of tasks', 'which task has priority', 'prioritize the tasks',
      'task priority', 'what to tackle first', 'sequence the tasks',
      'which should we start with',
    ],
    vibeKeywords: [
      'where do i start', 'which one first', 'what should we tackle first',
      'which is more important', 'should i start with', 'what comes next',
      'what first', 'which one do we do first',
    ],
    absenceThreshold: 12,
  },
  {
    key: 'task_sizing',
    description: 'Tasks not being scoped to single sessions',
    expectedStages: ['task_breakdown'],
    detectionKeywords: [
      'this task is too big', 'break this task down', 'scope this down',
      'should i split this', 'is this too large', 'this needs to be smaller',
      'bite-sized', 'can we break this up', 'this task is too large',
      'single session task',
    ],
    vibeKeywords: [
      'one session', 'can i do this in one go', 'this feels too big',
      'how do i split this up', 'break it into smaller pieces',
      'too much to do at once', 'this is a lot to do', 'can i finish this today',
    ],
    absenceThreshold: 12,
  },
  {
    key: 'task_definition_of_done',
    description: 'No definition of done per task',
    expectedStages: ['task_breakdown'],
    detectionKeywords: [
      'definition of done', 'how do i know when this is done', 'what makes this task complete',
      'when is this task done', 'done criteria', 'success criteria for this task',
      "how will i know it's finished", 'what does complete look like',
    ],
    vibeKeywords: [
      'when is this done', 'done when', 'finished when', "how do i know i'm done",
      'what does done look like', 'when can i check this off',
      'when is it good enough', 'done means what',
    ],
    absenceThreshold: 12,
  },
  {
    key: 'user_feedback_review',
    description: 'No structured review of user/production feedback',
    expectedStages: ['feedback_loop'],
    detectionKeywords: [
      'going through the feedback', 'reviewing the feedback', 'what are users saying',
      'feedback analysis', 'user feedback shows', 'aggregate the feedback',
      'what patterns do we see', 'the feedback tells us', 'feedback summary',
      'categorize the feedback',
    ],
    vibeKeywords: [
      'what are people saying', 'what did users say', 'have we looked at the feedback',
      'what complaints are we getting', 'what are users asking for',
      'what feedback did we get', 'what did people think', 'user sentiment',
    ],
    absenceThreshold: 12,
  },
  {
    key: 'iteration_planning',
    description: 'No planning of next iteration based on feedback',
    expectedStages: ['feedback_loop'],
    detectionKeywords: [
      'plan the next iteration', 'next iteration priorities',
      'based on the feedback we received', 'prioritize based on feedback',
      'what to work on next', 'next sprint based on feedback',
      'feedback-driven priorities', 'plan based on user feedback',
    ],
    vibeKeywords: [
      'what should we fix next', 'what do users want most', 'based on what they said',
      'fix the most complained about', 'what to work on next based on',
      'top feedback items', 'what does the feedback tell us to do',
      'what should we tackle next',
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
