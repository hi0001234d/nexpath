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

  // ── Sub-7 — new advisory types ─────────────────────────────────────────────
  {
    key: 'scope_creep',
    description: 'Checking for scope creep — staying focused on current feature before adding new ones',
    expectedStages: ['implementation', 'review_testing'],
    detectionKeywords: [
      'scope creep', 'let\'s focus on', 'finish this first', 'let\'s not add more',
      'that\'s out of scope for now', 'feature creep', 'before we add anything else',
      'let\'s complete this first', 'stay focused on', 'we\'re getting sidetracked',
      'not in scope for this', 'let\'s scope this down',
    ],
    vibeKeywords: [
      'one thing at a time', 'don\'t get sidetracked', 'let\'s not scope creep',
      'scope check', 'let\'s keep it focused', 'just this one thing for now',
    ],
    absenceThreshold: 15,
  },
  {
    key: 'context_loss',
    description: 'Recapping or re-anchoring session context in a long session',
    expectedStages: ['implementation', 'review_testing', 'architecture'],
    detectionKeywords: [
      'let me summarize', 'to recap', 'here\'s where we are', 'so far we\'ve',
      'as a reminder', 'let me bring you up to speed', 'to summarize our progress',
      'before we continue let me recap', 'to catch you up', 'summary of what we\'ve done',
    ],
    vibeKeywords: [
      'just to recap', 'so here\'s what we\'ve done', 'here\'s where we\'re at',
      'to bring you up to speed', 'let me catch you up',
    ],
    absenceThreshold: 30,
  },
  {
    key: 'api_design_review',
    description: 'API contract, versioning, and backwards compatibility discussion',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'api contract', 'api versioning', 'backwards compatible', 'breaking change',
      'openapi', 'swagger', 'api design', 'contract-first', 'api specification',
      'api version', 'versioning strategy', 'backwards compatibility',
    ],
    vibeKeywords: [
      'does this api work with older versions', 'what about existing clients',
      'will this break anything using the api', 'is this backwards compatible',
      'what if the api changes', 'how do we version this',
    ],
    absenceThreshold: 20,
    relevantProjectTypes: ['api', 'web-app', 'library'],
  },
  {
    key: 'accessibility',
    description: 'Accessibility considerations during UI development',
    expectedStages: ['implementation', 'review_testing'],
    detectionKeywords: [
      'accessibility', 'aria', 'screen reader', 'wcag', 'alt text',
      'keyboard navigation', 'color contrast', 'focus management', 'a11y',
      'aria-label', 'aria-describedby', 'tab order', 'focus trap',
    ],
    vibeKeywords: [
      'can someone use this without a mouse', 'what about people with disabilities',
      'is this keyboard accessible', 'does this work with a screen reader',
      'can blind users use this', 'is the contrast good enough',
    ],
    absenceThreshold: 20,
    relevantProjectTypes: ['web-app', 'mobile', 'desktop'],
  },
  {
    key: 'environment_and_secrets',
    description: 'Environment config and secrets management during implementation',
    expectedStages: ['implementation'],
    detectionKeywords: [
      '.env file', 'dotenv', 'secrets management', 'api key storage',
      'credential storage', '.env.example', 'secrets vault', 'environment secrets',
      'secret rotation', 'env secret', 'store the secret', 'secret management',
    ],
    vibeKeywords: [
      'where do the api keys go', 'how do we handle secrets',
      'where do secrets live', 'how do we store credentials',
      'should the key be in the code', 'where does the password go',
    ],
    absenceThreshold: 15,
  },
  {
    key: 'data_validation',
    description: 'Data schema and structural validation of inputs',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'schema validation', 'zod', 'yup', 'joi', 'form validation',
      'validate the form', 'required fields', 'data schema', 'input schema',
      'payload validation', 'validate the request body', 'data type check',
    ],
    vibeKeywords: [
      'what if someone sends bad data', 'what if the input is wrong',
      'what if they put something unexpected', 'checking the input format',
      'making sure the data is right', 'what if the fields are missing',
    ],
    absenceThreshold: 15,
  },
  {
    key: 'ci_pipeline',
    description: 'CI/CD pipeline setup and automation discussion',
    expectedStages: ['review_testing', 'release'],
    detectionKeywords: [
      'github actions', 'ci/cd', 'continuous integration', 'build pipeline',
      'ci pipeline', 'workflow yaml', 'ci configuration', 'pipeline setup',
      'run in ci', 'ci runs', 'run tests automatically', 'on push trigger',
    ],
    vibeKeywords: [
      'does this run automatically', 'can we automate the build',
      'what about deployment automation', 'how does this deploy automatically',
      'automating the release', 'trigger on commit',
    ],
    absenceThreshold: 15,
  },
  {
    key: 'rate_limiting',
    description: 'API rate limiting and throttling design',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'throttle requests', 'request throttling', 'requests per second',
      'api quota', 'rate cap', 'throttle middleware', 'too many requests limit',
      'backoff strategy', '429 handling', 'rate limit per user',
      'request rate', 'throttle the api',
    ],
    vibeKeywords: [
      'what if someone calls this too many times', 'what if too many requests come in',
      'protecting the api from overuse', 'preventing api abuse',
      'what if they spam the endpoint', 'limiting how often this can be called',
    ],
    absenceThreshold: 20,
    relevantProjectTypes: ['api', 'web-app'],
  },
  {
    key: 'feature_scope_before_build',
    description: 'Defining feature scope or acceptance criteria before implementation',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'define the scope', 'feature scope is', 'acceptance criteria for this',
      'definition of done for this feature', 'scope statement',
      'feature requirements are', 'let me spec this feature',
      'define what done looks like for this',
    ],
    vibeKeywords: [
      'what are we actually building here', 'what exactly should this do',
      'let me think about what we want', 'let me scope this out',
      'what are we supposed to be building', 'let me be clear about what this needs to do',
      'ok what does this actually need to do', 'before i keep going what should this do',
    ],
    absenceThreshold: 3,
  },
  {
    key: 'implementation_checkpoint',
    description: 'Pausing to verify or smoke-test a step before continuing',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'smoke test this', 'verify this works before continuing', 'checkpoint test',
      'quick validation before next step', 'test this before moving on',
      'verify this before continuing', 'make sure this works first',
      'quick check before moving on', 'confirm this is working before',
    ],
    vibeKeywords: [
      'does this actually work', 'try this out', 'let me check this real quick',
      'quick test before we continue', 'is this working',
      'let me just make sure this works', 'does this still work',
      'let me try this real quick',
    ],
    absenceThreshold: 4,
  },
  {
    key: 'spec_before_code',
    description: 'Writing the behavior spec before writing code for it',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'let me define this before coding', 'spec this out first',
      'write the behavior first', 'define the behavior before',
      'specify the expected behavior', 'write the expected output',
      'behavior spec for this', 'describe what this should do before coding',
    ],
    vibeKeywords: [
      'what should this do exactly', 'let me think about what this needs',
      'before coding what does this need to do', 'what is this supposed to do',
      'ok what should happen when', 'let me figure out what this needs to do first',
      'what exactly is this supposed to do',
    ],
    absenceThreshold: 3,
  },

  // ── Phase 5 D1 — beginner cluster 1 (R04) ────────────────────────────────────
  {
    key: 'incremental_build',
    description: 'Building incrementally — verifying each small piece before adding the next',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'let me test this small piece', 'verify one thing at a time',
      'incremental build', 'build and verify step by step',
    ],
    vibeKeywords: [
      'does each part work', 'test as we go', 'one step at a time then check',
    ],
    absenceThreshold: 5,
  },
  {
    key: 'error_understanding',
    description: 'Understanding root cause of an error before applying a fix',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'root cause of this error', 'why did this error happen',
      'understand the error before fixing', 'what does this error mean',
    ],
    vibeKeywords: [
      'why is this happening', 'explain this error',
    ],
    absenceThreshold: 6,
    nature: 'beginner',
  },
  {
    key: 'documentation_before_ask',
    description: 'Consulting primary documentation before asking the agent for help',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'i checked the docs and', 'per the documentation', 'docs say',
      'reading the api reference', 'the readme says',
    ],
    vibeKeywords: [
      'what does the docs say', 'let me look this up', 'checking docs first',
    ],
    absenceThreshold: 8,
    nature: 'beginner',
  },
  {
    key: 'output_verification',
    description: 'Manually verifying AI-generated output before moving on',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'i ran this and it works', 'verified the output', 'tested the result',
      'confirmed this does what we wanted', 'checked the output',
    ],
    vibeKeywords: [
      'let me try this', 'running it now', 'does this actually work',
    ],
    absenceThreshold: 5,
    nature: 'beginner',
  },

  // ── Phase 5 D2 — beginner cluster 2 (R05) ────────────────────────────────────
  {
    key: 'requirement_clarity_before_ask',
    description: 'Specifying a clear requirement before prompting for implementation',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'the requirement is', 'specifically what i need is',
      'the expected behavior is', 'success looks like',
    ],
    vibeKeywords: [
      'i want it to', 'make it so that', 'what i mean is',
    ],
    absenceThreshold: 4,
    nature: 'beginner',
  },
  {
    key: 'copy_paste_awareness',
    description: 'Understanding code before integrating AI-generated blocks',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'i understand what this code does', 'reviewing the generated code',
      'walking through this code', 'this code works because',
    ],
    absenceThreshold: 7,
    nature: 'beginner',
  },
  {
    key: 'debugging_observation_gap',
    description: 'Describing observed behavior precisely before asking for a fix',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'i observed that', 'the actual behavior is', 'expected vs actual',
      'what i see is', 'the error message says',
    ],
    absenceThreshold: 5,
    nature: 'beginner',
  },
  {
    key: 'learning_consolidation',
    description: 'Pausing to consolidate and recap what was understood in the session',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'so to summarize what i learned', 'now i understand how',
      'let me recap what we did', 'i now know how to',
    ],
    vibeKeywords: [
      'okay so now i understand', 'makes sense now', 'so basically',
    ],
    absenceThreshold: 15,
    nature: 'beginner',
  },

  // ── Phase 5 D3 — beginner cluster 3 (R06) ────────────────────────────────────
  {
    key: 'simple_solution_first',
    description: 'Choosing the simplest solution before adding unnecessary complexity',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'simplest solution here', 'easiest way to do this',
      'do i need all this complexity', 'is there a simpler approach',
    ],
    absenceThreshold: 6,
    nature: 'beginner',
  },
  {
    key: 'single_responsibility_prompting',
    description: 'Keeping each prompt focused on one concern at a time',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'one thing at a time', 'let\'s focus on just this part',
      'separate these concerns', 'do this step only',
    ],
    absenceThreshold: 4,
    nature: 'beginner',
  },
  {
    key: 'rollback_awareness',
    description: 'Verifying ability to revert before making significant code changes',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'i committed before changing', 'i can revert this if needed',
      'git stash', 'i\'ll check this into git first', 'backup this working state',
    ],
    absenceThreshold: 10,
    nature: 'beginner',
  },
  {
    key: 'build_vs_understand_ratio',
    description: 'Periodically pausing to understand what was built rather than only continuing to build',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'explain how this works', 'how does this piece connect to',
      'i want to understand this', 'i want to understand what we built',
    ],
    vibeKeywords: [
      'how does this work', 'what does this do', 'explain this',
    ],
    absenceThreshold: 12,
    nature: 'beginner',
  },

  // ── Phase 5 D4 — cool_geek cluster 1 (R07) ───────────────────────────────────
  {
    key: 'feature_completion_check',
    description: 'Finishing and verifying the current feature before starting the next',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'finishing this feature before starting the next',
      'this feature is done and tested', 'completed and verified before moving on',
    ],
    absenceThreshold: 5,
    nature: 'cool_geek',
  },
  {
    key: 'finishing_line_awareness',
    description: 'Recognising that partial features deliver no user value — pushing to completion',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'this is fully complete', 'shipped this feature',
      'ready to use', 'end-to-end working',
    ],
    absenceThreshold: 8,
    nature: 'cool_geek',
  },
  {
    key: 'polish_vs_function',
    description: 'Keeping visual polish deferred until core functionality works end-to-end',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'core functionality is working first', 'polish after function is done',
      'visual improvements after it works', 'functional before aesthetic',
    ],
    absenceThreshold: 5,
    nature: 'cool_geek',
  },
  {
    key: 'mvp_scope_discipline',
    description: 'Checking each addition against the MVP boundary before building',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'is this mvp scope', 'minimum needed to test this', 'mvp boundary check',
      'core hypothesis still being tested', 'this is beyond mvp',
    ],
    absenceThreshold: 5,
    nature: 'cool_geek',
  },

  // ── Phase 5 D5 — cool_geek cluster 2 (R08) ───────────────────────────────────
  {
    key: 'idea_to_spec_bridge',
    description: 'Specifying what a new idea does and its boundaries before building it',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'the spec for this idea is', 'how this fits into the product',
      'what this feature does and doesn\'t do', 'boundaries of this idea',
    ],
    absenceThreshold: 4,
    nature: 'cool_geek',
  },
  {
    key: 'demo_vs_product',
    description: 'Distinguishing demo-quality code from production-ready code',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'production-ready', 'real data connected', 'handles edge cases',
      'error states working', 'this is demo vs production',
    ],
    absenceThreshold: 6,
    nature: 'cool_geek',
  },
  {
    key: 'user_journey_check',
    description: 'Designing the full user journey for a feature — not just the happy path',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'full user journey for this', 'what does the user experience end to end',
      'empty state for this', 'error state for this', 'first time user sees this',
    ],
    absenceThreshold: 6,
    nature: 'cool_geek',
  },

  // ── Phase 5 D6 — cool_geek cluster 3 (R09) ───────────────────────────────────
  {
    key: 'technical_spike_treatment',
    description: 'Treating exploratory code as a spike to be extracted or discarded, not committed directly',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'this was a spike to learn', 'cleaning up the exploration code',
      'extracting the useful part from the experiment', 'production version of this',
    ],
    absenceThreshold: 7,
    nature: 'cool_geek',
  },
  {
    key: 'dependency_adventure',
    description: 'Adding dependencies only for need, not for exploration or novelty',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'need this library for', 'this solves the specific problem of',
      'evaluated alternatives before adding', 'maintenance burden considered',
    ],
    absenceThreshold: 8,
    nature: 'cool_geek',
  },
  {
    key: 'restart_impulse_check',
    description: 'Debugging the current approach before starting over from scratch',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'debugging this before starting over', 'root cause before restart',
      'fix the current approach', 'what specifically went wrong',
    ],
    absenceThreshold: 5,
    nature: 'cool_geek',
  },
  {
    key: 'creative_vs_core_ratio',
    description: 'Keeping creative/aesthetic prompts proportional to core-feature prompts',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'this serves the core product', 'this is the core feature',
      'prioritizing core value', 'the main feature first',
    ],
    absenceThreshold: 10,
    nature: 'cool_geek',
  },

  // ── Phase 5 D7 — pro_geek_soul cluster 1 (R10) ───────────────────────────────
  {
    key: 'code_documentation_gap',
    description: 'Adding inline documentation for non-obvious logic and complex functions',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'documenting this function', 'inline comment for this logic',
      'docstring for this', 'commenting why this works this way',
    ],
    absenceThreshold: 10,
    nature: 'pro_geek_soul',
  },
  {
    key: 'technical_debt_acknowledgment',
    description: 'Explicitly tagging shortcuts and workarounds as technical debt',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'noting this as tech debt', 'temporary workaround, needs refactor',
    ],
    vibeKeywords: [
      'quick and dirty', 'good enough for now', 'workaround for now',
      'hacky solution', 'fix later',
    ],
    absenceThreshold: 8,
    nature: 'pro_geek_soul',
  },
  {
    key: 'test_depth_check',
    description: 'Writing tests that cover edge cases and error paths, not just the happy path',
    expectedStages: ['review_testing'],
    detectionKeywords: [
      'edge case test', 'boundary value test', 'error path test',
      'null input test', 'concurrent access test', 'negative test case',
    ],
    absenceThreshold: 10,
    nature: 'pro_geek_soul',
  },
  {
    key: 'architecture_note_absence',
    description: 'Documenting the rationale for significant structural or architectural decisions',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'note on why this architecture', 'decision record for this',
      'commenting the architectural rationale', 'why this pattern was chosen',
    ],
    absenceThreshold: 12,
    nature: 'pro_geek_soul',
  },

  // ── Phase 5 D8 — pro_geek_soul cluster 2 (R11) ───────────────────────────────
  {
    key: 'dependency_audit_gap',
    description: 'Evaluating maintenance status, alternatives, and license before adding a dependency',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'checked maintenance status', 'evaluated alternatives to',
      'license is compatible', 'bundle size impact of', 'last release date',
    ],
    absenceThreshold: 8,
    nature: 'pro_geek_soul',
  },
  {
    key: 'security_review_gap',
    description: 'Reviewing security considerations for features touching user data or auth',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'security consideration for this', 'owasp check',
      'authorization check', 'injection prevention',
    ],
    absenceThreshold: 10,
    nature: 'pro_geek_soul',
  },
  {
    key: 'api_contract_definition',
    description: 'Defining the API contract before implementing an endpoint or service layer',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'api contract defined', 'request schema is', 'response schema is',
      'error response format', 'defining the interface before implementing',
    ],
    absenceThreshold: 6,
    nature: 'pro_geek_soul',
  },
  {
    key: 'error_handling_coverage',
    description: 'Explicitly handling error paths for every non-trivial operation',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'error state handled', 'fallback for when this errors', 'error case covered',
    ],
    vibeKeywords: [
      'what happens when this fails', 'error boundary',
    ],
    absenceThreshold: 8,
    nature: 'pro_geek_soul',
  },

  // ── Phase 5 D9 — pro_geek_soul cluster 3 (R12) ───────────────────────────────
  {
    key: 'refactoring_checkpoint',
    description: 'Running a refactor pass before adding features to already-complex code',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'refactored this before adding', 'cleaned up first',
      'extracted this into', 'simplified before extending',
    ],
    absenceThreshold: 12,
    nature: 'pro_geek_soul',
  },
  {
    key: 'backwards_compatibility_check',
    description: 'Checking all callers and considering versioning before changing an interface',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'callers of this updated', 'backwards compatible change',
      'versioning this change', 'existing consumers checked',
    ],
    absenceThreshold: 8,
    nature: 'pro_geek_soul',
  },
  {
    key: 'self_review_habit',
    description: 'Running a self-review pass before committing after an extended build run',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'reviewing what we wrote', 'reading through the implementation',
      'checking the diff', 'does this all make sense together',
    ],
    absenceThreshold: 15,
    nature: 'pro_geek_soul',
  },
  {
    key: 'performance_awareness',
    description: 'Noting performance implications for data-heavy operations before shipping',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'performance impact of this', 'n+1 query check',
      'pagination added', 'lazy load this',
    ],
    vibeKeywords: [
      'fetch all the data', 'load everything', 'get all records',
    ],
    absenceThreshold: 12,
    nature: 'pro_geek_soul',
  },

  // ── Phase 5 D10 — hardcore_pro cluster 1 (R13) ───────────────────────────────
  {
    key: 'decision_record_absence',
    description: 'Recording the context and rationale for significant architectural choices',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'adr for this', 'recording the decision', 'context and consequences',
      'why this over alternatives', 'decision record',
    ],
    absenceThreshold: 10,
    nature: 'hardcore_pro',
  },
  {
    key: 'over_engineering_check',
    description: 'Applying YAGNI — not building for hypothetical future requirements',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'this is needed now', 'yagni check', 'current requirements require',
      'building this because we need it today',
    ],
    absenceThreshold: 8,
    nature: 'hardcore_pro',
  },
  {
    key: 'pair_review_absence',
    description: 'Having a review plan (peer, self, or diff review) before committing critical code',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'getting this reviewed', 'pair programming this',
      'review plan for this', 'diff review before merge',
    ],
    absenceThreshold: 15,
    nature: 'hardcore_pro',
  },

  // ── Phase 5 D11 — hardcore_pro cluster 2 (R14) ───────────────────────────────
  {
    key: 'observability_first',
    description: 'Adding logging, metrics, and tracing before or alongside a new feature',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'observability for this', 'logging added', 'metrics instrumented',
      'tracing span added', 'alert for this',
    ],
    absenceThreshold: 10,
    nature: 'hardcore_pro',
  },
  {
    key: 'failure_mode_analysis',
    description: 'Enumerating failure modes for each dependency before finalising design',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'failure mode for this', 'circuit breaker for',
      'fallback when', 'resilience for this',
    ],
    vibeKeywords: [
      'what happens when x fails',
    ],
    absenceThreshold: 8,
    nature: 'hardcore_pro',
  },
  {
    key: 'contract_testing_gap',
    description: 'Adding contract tests for service boundaries and API integrations',
    expectedStages: ['review_testing'],
    detectionKeywords: [
      'contract test for this', 'pact test', 'consumer-driven contract',
      'integration contract verified',
    ],
    absenceThreshold: 12,
    nature: 'hardcore_pro',
  },

  // ── Phase 5 D12 — hardcore_pro clusters 3+4 (R15–R16) ────────────────────────
  {
    key: 'capacity_planning_gap',
    description: 'Estimating capacity implications before shipping a load-adding feature',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'capacity estimate for this', 'load this will add',
      'storage growth projection', 'rps estimate', 'resource utilization',
    ],
    absenceThreshold: 10,
    nature: 'hardcore_pro',
  },
  {
    key: 'security_threat_modeling',
    description: 'Running a threat model before finalising security-sensitive feature design',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'threat model for this', 'stride analysis',
      'attack surface review', 'privilege escalation considered', 'security design review',
    ],
    absenceThreshold: 8,
    nature: 'hardcore_pro',
  },
  {
    key: 'database_migration_safety',
    description: 'Applying expand-migrate-contract pattern for backwards-compatible schema migrations',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'backwards compatible migration', 'expand-migrate-contract',
      'phased migration', 'rollback migration', 'migration safety review',
    ],
    absenceThreshold: 6,
    nature: 'hardcore_pro',
  },
  {
    key: 'deployment_strategy_absence',
    description: 'Defining a deployment strategy (feature flag, canary, blue-green) before shipping',
    expectedStages: ['release'],
    detectionKeywords: [
      'feature flag for this', 'canary deployment', 'blue-green deployment', 'staged rollout',
    ],
    absenceThreshold: 6,
    nature: 'hardcore_pro',
  },
  {
    key: 'operational_runbook_gap',
    description: 'Writing an operational runbook for new services before release',
    expectedStages: ['release'],
    detectionKeywords: [
      'runbook for this', 'operational documentation',
      'how to debug this in production', 'on-call guide for',
    ],
    absenceThreshold: 8,
    nature: 'hardcore_pro',
  },
  {
    key: 'slo_definition_gap',
    description: 'Defining SLO (availability, latency, error rate targets) before shipping a service',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'slo for this', 'availability target', 'latency target',
      'error rate budget', 'reliability target',
    ],
    absenceThreshold: 10,
    nature: 'hardcore_pro',
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
