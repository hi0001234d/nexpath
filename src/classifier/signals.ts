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
      'one small piece at a time',
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
      'what does this error mean', 'why is this happening', 'explain this error',
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
      'the requirement is', 'specifically what i need is', 'acceptance criteria',
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
    vibeKeywords: [
      'i see what this does', 'i get what this code is doing',
      'makes sense what this does', 'so this part does',
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
    vibeKeywords: [
      'i see an error that says', 'when i run it i get',
      'getting this error', 'the screen shows',
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
      'okay so now i understand', 'got it', 'makes sense now', 'so basically',
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
      'simplest solution here', 'what\'s the easiest way to do this',
      'do i need all this complexity', 'is there a simpler approach',
    ],
    vibeKeywords: [
      'do i need all this', 'seems too complicated',
      'is this too much', 'can we keep it simpler',
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
    vibeKeywords: [
      'just this one thing', 'only this for now', 'let\'s just do this part',
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
    vibeKeywords: [
      'let me commit first', 'i\'ll save my progress', 'before i change this', 'can i undo this',
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
      'i want to understand this', 'walk me through what we built',
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
    vibeKeywords: [
      'is this feature done', 'let me finish this first',
      'this is complete now', 'make sure this is done before',
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
    vibeKeywords: [
      'almost done with this', 'let me finish this',
      'just need to wrap this up', 'getting this done before moving on',
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
    vibeKeywords: [
      'get it working first', 'make sure the core works',
      'test the main flow first', 'function before styling',
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
    vibeKeywords: [
      'do we need this for mvp', 'is this in scope',
      'minimum needed for this', 'can we add this later',
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
    vibeKeywords: [
      'how would this actually work', 'what does this feature need to do',
      'how does this fit with the rest', 'let me think through this idea',
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
    vibeKeywords: [
      'this needs to work with real data', 'remove the hardcoded values',
      'this is just a demo for now', 'make sure it handles real errors',
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
    vibeKeywords: [
      'what does the user see when', 'what happens if the user tries',
      'from the user\'s perspective', 'what happens when there\'s nothing there',
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
    vibeKeywords: [
      'just exploring here', 'not adding this to production yet',
      'proof of concept for now', 'throwaway code to learn',
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
    vibeKeywords: [
      'do we need this library', 'what does this solve that we can\'t do already',
      'is this dependency worth it', 'what\'s the maintenance cost of this',
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
    vibeKeywords: [
      'let me figure out what went wrong', 'what exactly is broken here',
      'before we rewrite let\'s see what\'s actually failing', 'let me understand the error first',
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
    vibeKeywords: [
      'what actually matters here', 'back to what we need',
      'focus on the main thing', 'is this really needed',
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
    vibeKeywords: [
      'let me add a comment here', 'explaining what this does',
      'added a note for this', 'comment on why this works',
    ],
    absenceThreshold: 10,
    nature: 'pro_geek_soul',
  },
  {
    key: 'technical_debt_acknowledgment',
    description: 'Explicitly tagging shortcuts and workarounds as technical debt',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'todo: clean this up', 'fixme: proper implementation needed',
      'noting this as tech debt', 'temporary workaround, needs refactor',
    ],
    vibeKeywords: [
      'todo here to clean this up', 'noting this as a shortcut',
      'will need to revisit this', 'marking this as temporary',
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
    vibeKeywords: [
      'test the edge cases', 'what if the input is empty',
      'test the failure case', 'test when this breaks',
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
    vibeKeywords: [
      'documenting why we chose this', 'note on this decision',
      'explaining the architecture here', 'adding a comment on the pattern choice',
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
    vibeKeywords: [
      'checking if this is maintained', 'what\'s the license on this',
      'are there alternatives to this', 'what\'s the bundle size impact',
    ],
    absenceThreshold: 8,
    nature: 'pro_geek_soul',
  },
  {
    key: 'security_review_gap',
    description: 'Reviewing security considerations for features touching user data or auth',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'security consideration for this', 'owasp check', 'input validation added',
      'authorization check', 'injection prevention',
    ],
    vibeKeywords: [
      'input validation for this', 'making sure this is secure',
      'check the permissions here', 'sanitize this input',
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
    vibeKeywords: [
      'what should this endpoint return', 'defining the interface first',
      'what does this api accept', 'let me define what this returns',
    ],
    absenceThreshold: 6,
    nature: 'pro_geek_soul',
  },
  {
    key: 'error_handling_coverage',
    description: 'Explicitly handling error paths for every non-trivial operation',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'error state handled', 'what happens when this fails', 'error boundary',
      'fallback for when this errors', 'error case covered',
    ],
    vibeKeywords: [
      'handle the error case', 'what if this doesn\'t work',
      'need to handle when this breaks', 'add error handling for this',
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
    vibeKeywords: [
      'cleaning this up before continuing', 'refactoring this first',
      'extracting this into a helper', 'simplifying this before adding',
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
    vibeKeywords: [
      'checking what uses this', 'making sure this is backwards compatible',
      'what else calls this', 'do existing callers need updating',
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
    vibeKeywords: [
      'read through this', 'let me check what we built',
      'looking back at this', 'does this make sense',
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
      'pagination added', 'memo/cache this', 'lazy load this',
    ],
    vibeKeywords: [
      'checking the performance here', 'is this going to be slow',
      'thinking about the query performance', 'watching the query count',
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
    vibeKeywords: [
      'documenting this decision', 'noting the rationale here',
      'recording why this choice', 'writing up the context',
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
    vibeKeywords: [
      'do we actually need this now', 'is this required today',
      'only what\'s needed for now', 'not adding that until we need it',
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
    vibeKeywords: [
      'getting eyes on this', 'pairing on this',
      'plan to review before merging', 'someone to review this',
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
    vibeKeywords: [
      'adding logging for this', 'metrics for this feature',
      'tracing this operation', 'alerting on this',
    ],
    absenceThreshold: 10,
    nature: 'hardcore_pro',
  },
  {
    key: 'failure_mode_analysis',
    description: 'Enumerating failure modes for each dependency before finalising design',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'failure mode for this', 'what happens when x fails', 'circuit breaker for',
      'fallback when', 'resilience for this',
    ],
    vibeKeywords: [
      'what if this service is down', 'handling when this fails',
      'fallback if this dependency fails', 'what\'s the timeout here',
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
    vibeKeywords: [
      'verifying the contract here', 'checking the api contract',
      'testing the service boundary', 'consumer-driven test for this',
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
    vibeKeywords: [
      'estimating the load here', 'how much traffic will this handle',
      'storage cost of this feature', 'scaling considerations for this',
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
    vibeKeywords: [
      'what\'s the attack surface here', 'security design for this',
      'potential vulnerabilities here', 'stride check for this',
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
    vibeKeywords: [
      'phasing this migration', 'checking migration rollback',
      'is this migration backwards compatible', 'safe to deploy this migration',
    ],
    absenceThreshold: 6,
    nature: 'hardcore_pro',
  },
  {
    key: 'deployment_strategy_absence',
    description: 'Defining a deployment strategy (feature flag, canary, blue-green) before shipping',
    expectedStages: ['release'],
    detectionKeywords: [
      'feature flag for this', 'canary deployment', 'rollback plan',
      'blue-green deployment', 'staged rollout',
    ],
    vibeKeywords: [
      'deployment strategy for this', 'rollback plan for this release',
      'canary this release', 'feature flagging this',
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
    vibeKeywords: [
      'operational notes for this', 'how to debug this when it breaks',
      'on-call notes for this', 'runbook content for this',
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
    vibeKeywords: [
      'what\'s the uptime target', 'defining the slo here',
      'acceptable error rate for this', 'latency expectation for this',
    ],
    absenceThreshold: 10,
    nature: 'hardcore_pro',
  },

  // ── Phase 6 E1-E3 — founder role signals ────────────────────────────────────

  {
    key: 'user_value_check',
    description: 'Lean Startup / Steve Blank (2005, 2011) — build only validated features. Customer discovery precedes engineering commitment. Every feature hypothesis needs a user signal before becoming a build task.',
    expectedStages: ['idea', 'implementation'],
    detectionKeywords: [
      'validated this with users', 'user research shows', 'users asked for',
      'market signal for this', 'user feedback confirms', 'user need validated',
    ],
    vibeKeywords: [
      'user testing showed', 'validated with users',
      'users confirmed this', 'got feedback from users',
    ],
    absenceThreshold: 5,
    role: 'founder',
  },
  {
    key: 'outcome_definition',
    description: 'OKR methodology (Doerr 2018) / Marty Cagan — features need defined success metrics before building starts. Output vs outcome: launching ≠ succeeding. Define the measurable outcome before committing to the build.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'success metric for this', 'how we\'ll measure this',
      'the outcome we\'re targeting', 'KPI for this feature',
    ],
    vibeKeywords: [
      'success looks like', 'measuring this by',
      'the metric we\'re tracking', 'how we\'ll know it worked',
    ],
    absenceThreshold: 6,
    role: 'founder',
  },
  {
    key: 'feature_prioritization',
    description: 'Agile backlog prioritization / Marty Cagan — features ordered by user/business impact, not recency or opportunism. Building without impact justification = feature factory pattern.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'highest priority because', 'impact-effort matrix',
      'most valuable next', 'prioritized this because', 'users need this most',
    ],
    vibeKeywords: [
      'this is priority one', 'highest impact next',
      'focusing on this first because', 'most valuable to work on',
    ],
    absenceThreshold: 8,
    role: 'founder',
  },
  {
    key: 'user_persona_clarity',
    description: 'Alan Cooper personas (1999) / JTBD (Christensen) — design for a concrete user, not a hypothetical generic user. Every feature needs a defined persona or user type for design decisions to be testable.',
    expectedStages: ['idea', 'implementation'],
    detectionKeywords: [
      'for our user type', 'persona this serves',
      'user segment for this', 'who specifically this helps', 'target user for this feature',
    ],
    vibeKeywords: [
      'this is designed for', 'our target user here',
      'specifically for users who', 'for the segment that',
    ],
    absenceThreshold: 8,
    role: 'founder',
  },
  {
    key: 'competitive_awareness',
    description: 'Marty Cagan / Steve Blank — competitive analysis is prerequisite to feature prioritization. Table stakes vs. differentiating vs. irrelevant: knowing which category a feature falls in shapes the build decision.',
    expectedStages: ['idea', 'implementation'],
    detectionKeywords: [
      'competitor analysis for this', 'how competitors do this',
      'our differentiation here', 'market has this via',
    ],
    vibeKeywords: [
      'checking how competitors', 'competitor research shows',
      'our differentiation is', 'how competitors handle this',
    ],
    absenceThreshold: 10,
    role: 'founder',
  },
  {
    key: 'mvp_boundary_discipline',
    description: 'Lean Startup MVP principle (Ries 2011) — MVP tests the riskiest hypothesis with minimum effort. Every addition beyond MVP scope delays validated learning. Feature creep in MVP phases is avoidance behaviour.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'is this MVP scope', 'minimum needed to test',
      'MVP boundary', 'core hypothesis test', 'this isn\'t MVP scope',
    ],
    vibeKeywords: [
      'staying MVP scope', 'minimum to test this',
      'keeping it minimal', 'just enough for the hypothesis',
    ],
    absenceThreshold: 5,
    role: 'founder',
  },
  {
    key: 'user_acquisition_consideration',
    description: 'Andrew Chen / Peter Thiel — distribution fit is as important as product fit. Features need a defined acquisition path at build time, not after launch.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'how users find this feature', 'acquisition path for this',
      'SEO/sharing/referral for this', 'distribution for this feature',
    ],
    vibeKeywords: [
      'users will discover this via', 'reach this audience by',
      'growth channel for this', 'user acquisition via',
    ],
    absenceThreshold: 10,
    role: 'founder',
  },
  {
    key: 'retention_mechanism_check',
    description: 'Nir Eyal (2014) / David Skok SaaS Metrics — retention thinking at feature design stage. Hook model: features should increase the likelihood of the next interaction. Acquisition without retention = high-churn product.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'retention impact of this', 'engagement loop for this',
      'why users come back for this', 'habit-forming aspect',
    ],
    vibeKeywords: [
      'keeps users coming back', 'engagement loop here',
      'retention angle for this', 'habit loop for this feature',
    ],
    absenceThreshold: 10,
    role: 'founder',
  },
  {
    key: 'feedback_loop_establishment',
    description: 'Lean Startup Build-Measure-Learn (Ries 2011) — shipping without a feedback mechanism breaks the learning loop at measure. Every ship requires analytics, survey trigger, or behavioral instrumentation.',
    expectedStages: ['release'],
    detectionKeywords: [
      'feedback mechanism for this', 'how we\'ll hear from users',
      'analytics added for this', 'measuring success of this',
    ],
    vibeKeywords: [
      'adding analytics for', 'tracking this with',
      'set up a feedback loop', 'will collect feedback via',
    ],
    absenceThreshold: 5,
    role: 'founder',
  },
  {
    key: 'hypothesis_before_build',
    description: 'Lean UX / hypothesis-driven development (Gothelf & Seiden 2013) — every feature is an experiment. Define hypothesis before building. Without hypothesis: the experiment has no measurement criteria.',
    expectedStages: ['idea', 'implementation'],
    detectionKeywords: [
      'hypothesis we\'re testing', 'what this proves if it works',
      'success evidence for this hypothesis', 'experiment definition',
    ],
    vibeKeywords: [
      'testing the hypothesis that', 'the hypothesis here is',
      'proving or disproving', 'experiment to test',
    ],
    absenceThreshold: 5,
    role: 'founder',
  },
  {
    key: 'technical_vs_product_time_balance',
    description: 'Marty Cagan / Lean Startup — founders systematically under-invest in product thinking relative to technical implementation. Product discovery should run alongside implementation, not after.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'product direction check', 'stepping back to think about the product',
      'am I building the right thing', 'product vs engineering focus',
    ],
    vibeKeywords: [
      'taking a product perspective', 'product check on this',
      'thinking about what we\'re building', 'product-level thinking here',
    ],
    absenceThreshold: 12,
    role: 'founder',
  },
  {
    key: 'north_star_alignment',
    description: 'OKR north star (Doerr 2018) / Sean Ellis — all features traceable to north star movement. Features with no traceable connection = noise consuming engineering capacity.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'this contributes to our north star by', 'how this moves our core metric',
      'aligned with core product goal', 'north star impact',
    ],
    vibeKeywords: [
      'ties to our north star', 'contributes to our core metric',
      'north star connection here', 'aligns with our main goal',
    ],
    absenceThreshold: 15,
    role: 'founder',
  },

  // ── Phase 6 E4-E6 — indie_hacker role signals ────────────────────────────────

  {
    key: 'time_to_value_check',
    description: '37signals (2006) / Lean Startup — solve for current scale, not hoped-for scale. Complex infrastructure for zero users optimizes the wrong problem. Solo builders pay the complexity maintenance cost forever.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'right for my current scale', 'appropriate for zero users',
      'simple enough for now', 'right size solution',
    ],
    vibeKeywords: [
      'keeping it simple for now', 'right size for current users',
      'simple solution for now', 'appropriate for this scale',
    ],
    absenceThreshold: 6,
    role: 'indie_hacker',
  },
  {
    key: 'ship_readiness_definition',
    description: '37signals / lean shipping — define ship criteria before building: ready when X is true. Without explicit criteria, "not ready yet" justifies infinite additions. Ship criteria must be binary and written before building begins.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'ready to ship when', 'ship criteria',
      'launch checklist', 'minimum to launch', 'what\'s blocking launch',
    ],
    vibeKeywords: [
      'clear on what done means', 'ship criteria set',
      'know when it\'s ready', 'launch conditions defined',
    ],
    absenceThreshold: 8,
    role: 'indie_hacker',
  },
  {
    key: 'manual_before_automate',
    description: 'Paul Graham (2013) — do manually first, automate the proven process. Automating an unvalidated workflow builds automation for something that may be abandoned. Manual execution is validation; automation is optimization.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'validated this manually first', 'done this manually to confirm',
      'automating a proven manual process',
    ],
    vibeKeywords: [
      'doing this manually first', 'manually tested this process',
      'proven manually before automating', 'validated the manual version',
    ],
    absenceThreshold: 5,
    role: 'indie_hacker',
  },
  {
    key: 'tech_stack_complexity_check',
    description: '37signals / solo architecture principle — evaluate every architectural choice against "can I maintain this alone?" CV-driven development adds complexity a team distributes but a solo builder pays in full.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'maintainable solo', 'complexity I can handle alone',
      'right complexity for solo', 'simple enough for me to maintain',
    ],
    vibeKeywords: [
      'simple enough to maintain solo', 'keeping the stack simple',
      'manageable complexity for one person', 'solo-friendly architecture',
    ],
    absenceThreshold: 5,
    role: 'indie_hacker',
  },
  {
    key: 'launch_strategy_absence',
    description: 'Weinberg & Mares (2014) / Peter Thiel — distribution must be planned before launch. 19 documented channels; none happen by accident. Silent launches are the default without explicit launch planning.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'launch strategy', 'where I\'m announcing this',
      'Product Hunt plan', 'community post planned', 'launch audience',
    ],
    vibeKeywords: [
      'announcing this via', 'launch plan includes',
      'posting to communities', 'pre-launch audience',
    ],
    absenceThreshold: 12,
    role: 'indie_hacker',
  },
  {
    key: 'early_user_feedback',
    description: 'Steve Blank customer development (2005) / Paul Graham — seek user feedback early and continuously. Building in a silo is the primary cause of PMF failure. The earlier the feedback, the lower the cost of pivoting.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'showed this to users', 'early user feedback on this',
      'user reaction to this', 'beta user tested this',
    ],
    vibeKeywords: [
      'showed this to a user', 'user reaction was',
      'beta tester said', 'early user said',
    ],
    absenceThreshold: 10,
    role: 'indie_hacker',
  },
  {
    key: 'solo_maintainability',
    description: '37signals — every architectural addition should pass the "alone at 2am" test. Each integration, abstraction, and service boundary is maintenance surface paid entirely by one person.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'maintainable by me alone', 'solo debug cost of this',
      'can I support this solo', 'complexity cost for one person',
    ],
    vibeKeywords: [
      'one-person maintainable', 'I can support this',
      'easy enough to debug alone', 'solo-sustainable',
    ],
    absenceThreshold: 8,
    role: 'indie_hacker',
  },
  {
    key: 'distribution_thinking',
    description: 'Weinberg & Mares (2014) — distribution is a design constraint, not a post-launch task. Every feature has a discovery question: how do users find and access it? Distribution thinking shapes implementation decisions.',
    expectedStages: ['idea', 'implementation'],
    detectionKeywords: [
      'discovery path for this', 'how users find this',
      'distribution channel for', 'SEO/community/referral strategy',
    ],
    vibeKeywords: [
      'reaching users through', 'distribution approach is',
      'users find this product via', 'community channel for',
    ],
    absenceThreshold: 10,
    role: 'indie_hacker',
  },
  {
    key: 'monetization_path_clarity',
    description: 'Ash Maurya (2012) / Steve Blank — revenue model must be validated continuously, not deferred to launch. Every significant feature should connect to the monetization path.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'monetization path for this', 'revenue model connected',
      'how this relates to the paid tier', 'business model alignment',
    ],
    vibeKeywords: [
      'connects to the paid tier', 'monetization angle here',
      'how this earns revenue', 'business model consideration',
    ],
    absenceThreshold: 12,
    role: 'indie_hacker',
  },
  {
    key: 'build_in_public_opportunity',
    description: 'Arvid Kahl (2021) — build-in-public builds audience before launch. Every milestone is a distribution opportunity: share what you built, what you learned, what surprised you.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'sharing this publicly', 'build-in-public post about this',
      'tweet about this milestone', 'sharing progress',
    ],
    vibeKeywords: [
      'worth sharing publicly', 'build-in-public moment',
      'time to share progress', 'posting this milestone',
    ],
    absenceThreshold: 15,
    role: 'indie_hacker',
  },
  {
    key: 'scope_vs_time_check',
    description: '37signals — scope hammering: build the smallest version that\'s still useful. Without time constraint acknowledgment, scope expands by default. Time-boxing is the solo builder\'s primary scope discipline.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'time budget for this', 'does this fit my timeline',
      'scope vs my available time', 'time-boxed to',
    ],
    vibeKeywords: [
      'checking scope vs time', 'fits within my timeline',
      'keeping scope manageable', 'scope check against time',
    ],
    absenceThreshold: 8,
    role: 'indie_hacker',
  },

  // ── Phase 6 E7-E9 — pm role signals ─────────────────────────────────────────

  {
    key: 'acceptance_criteria_before_dev',
    description: 'Mike Cohn (2004) / Scrum DoR — user story not ready without AC. AC defines what done means: without it, developers build to their imagination. PM obligation: AC exists and is testable before the first implementation prompt.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'acceptance criteria for this', 'AC defined',
      'how we know this is done', 'what done looks like for this story',
    ],
    vibeKeywords: [
      'when this is done it should', 'this story passes when',
      'done criteria for this', 'how I know this is complete',
    ],
    absenceThreshold: 4,
    role: 'pm',
  },
  {
    key: 'stakeholder_alignment_check',
    description: 'PMBOK stakeholder management / PMI-ACP — demo-time surprises have a clear root cause: alignment assumed, not verified. Every unvalidated assumption about stakeholder intent is a potential rework item.',
    expectedStages: ['idea', 'implementation'],
    detectionKeywords: [
      'stakeholder aligned on this', 'signed off on this',
      'confirmed with the team', 'stakeholders agree on',
    ],
    vibeKeywords: [
      'checking with the team', 'stakeholder sign-off',
      'aligning with stakeholders', 'getting team alignment',
    ],
    absenceThreshold: 6,
    role: 'pm',
  },
  {
    key: 'requirements_ambiguity_flag',
    description: 'Requirements ambiguity is the leading cause of rework (Wiegers, SEI). Words like better/faster/improved are quality attribute placeholders — they survive into implementation because they feel precise enough to build toward.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'measurable definition of', 'ambiguity resolved in',
      'clarified what better means', 'specific metric for',
    ],
    vibeKeywords: [
      'defining a measurable target', 'putting a number on this',
      'what specific improvement', 'measurable success definition',
    ],
    absenceThreshold: 5,
    role: 'pm',
  },
  {
    key: 'dependency_mapping',
    description: 'Dependency identification (WBS, critical path method) — before any work begins: what does this work depend on (upstream), and what depends on this work (downstream)? Unmapped dependencies create blocked work mid-sprint.',
    expectedStages: ['idea', 'implementation'],
    detectionKeywords: [
      'dependencies mapped', 'upstream dependency on',
      'downstream impact on', 'blocking and unblocking for this',
    ],
    vibeKeywords: [
      'checking dependencies for this', 'who else does this affect',
      'mapping out dependencies', 'identifying blockers for this',
    ],
    absenceThreshold: 6,
    role: 'pm',
  },
  {
    key: 'definition_of_done',
    description: 'Scrum Definition of Done (Schwaber & Sutherland 2020) / Mike Cohn — DoD is the shared understanding of what complete means. Without it, done is subjective: sprint review becomes a conflict resolution session.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'definition of done for this', 'DoD',
      'this is done when', 'completion criteria',
    ],
    vibeKeywords: [
      'accepted when', 'story closes when',
      'done condition is', 'sprint item done when',
    ],
    absenceThreshold: 4,
    role: 'pm',
  },
  {
    key: 'cross_team_impact_check',
    description: 'Cross-team coordination — changes to shared APIs, schemas, or services affect every dependent team. Notification before the change costs a message. Discovery after the change costs team-days of recovery.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'notified other team', 'cross-team coordination',
      'aligned with', 'impact on other teams checked',
    ],
    vibeKeywords: [
      'checking with the other team', 'notifying the other squad',
      'cross-team heads-up', 'impact check with other teams',
    ],
    absenceThreshold: 8,
    role: 'pm',
  },
  {
    key: 'success_metric_definition',
    description: 'Outcome-driven development (OKRs) — features need defined success metrics before building starts. A feature without a metric cannot be evaluated after it ships. Define metric, threshold, and timeline before building.',
    expectedStages: ['idea', 'implementation'],
    detectionKeywords: [
      'success metric for this', 'KPI for this feature',
      'how we measure success', 'metric that proves this worked',
    ],
    vibeKeywords: [
      'tracking success by', 'measure feature success by',
      'how to know this worked', 'defining the KPI',
    ],
    absenceThreshold: 5,
    role: 'pm',
  },
  {
    key: 'priority_justification',
    description: 'Agile backlog prioritization (WSJF, MoSCoW) — without explicit priority reasoning, teams default to whatever is easiest, most recently requested, or most loudly advocated for. Articulate why this item over the alternatives.',
    expectedStages: ['idea'],
    detectionKeywords: [
      'prioritized because', 'highest impact because',
      'this before that because', 'priority justification',
    ],
    vibeKeywords: [
      'highest priority because', 'this comes first because',
      'priority rationale', 'most valuable right now',
    ],
    absenceThreshold: 8,
    role: 'pm',
  },
  {
    key: 'user_story_completeness',
    description: 'Mike Cohn (2004) — Connextra format: "As a [user], I want [action], so that [value]." Missing "who": conflicting user needs go unnoticed. Missing "why": team cannot make value trade-offs. PM obligation: who/what/why before implementation.',
    expectedStages: ['idea', 'implementation'],
    detectionKeywords: [
      'as a [user type] I want [action] so that [value]',
      'user story format', 'who this is for and why',
    ],
    vibeKeywords: [
      'as a user who', 'so that the user can',
      'who benefits from this', 'user need this solves',
    ],
    absenceThreshold: 5,
    role: 'pm',
  },
  {
    key: 'risk_flag',
    description: 'PMBOK risk management (Ch.11) — risks must be identified before significant decisions. Unnamed risks are assumed risks, and assumed risks become unplanned work. Lightweight continuous risk naming in agile.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'risks identified for this', 'risk mitigation for',
      'flagging risk of', 'risk register updated',
    ],
    vibeKeywords: [
      'flagging a risk', 'risk to watch',
      'potential issue here', 'mitigating the risk',
    ],
    absenceThreshold: 8,
    role: 'pm',
  },
  {
    key: 'scope_change_impact_assessment',
    description: 'Scope change governance — every mid-sprint scope change either displaces a committed item, extends the sprint, or reduces quality. All three require an explicit decision before the change enters the sprint.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'impact assessed for this change', 'timeline impact of',
      'what we\'re trading off for this', 'scope change impact',
    ],
    vibeKeywords: [
      'assessing the impact', 'checking what this affects',
      'tradeoff for this change', 'timeline check for this scope',
    ],
    absenceThreshold: 5,
    role: 'pm',
  },
  {
    key: 'retrospective_habit',
    description: 'Sprint Retrospective (Scrum Guide 2020) — converts team experience into process improvement. Each skipped retrospective is compounding debt: process errors from Sprint N carry into Sprint N+1 unchanged.',
    expectedStages: ['feedback_loop'],
    detectionKeywords: [
      'retrospective on this sprint', 'what went well',
      'process improvements', 'lessons from this iteration', 'retro findings',
    ],
    vibeKeywords: [
      'retro on this sprint', 'what worked this sprint',
      'process learning from', 'lessons from this cycle',
    ],
    absenceThreshold: 20,
    role: 'pm',
  },

  // ── Phase 7 F1: Session-quality fatigue group ─────────────────────────────

  {
    key: 'decision_fatigue_pattern',
    description: 'Baumeister ego-depletion / Kahneman System 1 — consecutive AI acceptance without critical review is a decision fatigue signature, not deliberate evaluation. Each unreviewed response compounds review debt. 8+ consecutive acceptances = apply deliberate critical review before continuing.',
    expectedStages: ['implementation'],
    detectionKeywords: [],
    vibeKeywords: [],
    absenceThreshold: 8,
  },
  {
    key: 'work_rhythm_check',
    description: 'Ericsson deliberate practice — quality requires slow, intentional engagement with feedback. Rapid-fire prompting without reading AI output is a flow-state trap: high throughput, low verification. Prompt velocity exceeding verification rate compounds undetected errors. Read and verify each response before the next prompt.',
    expectedStages: ['implementation'],
    detectionKeywords: [],
    vibeKeywords: [],
    absenceThreshold: 10,
  },
  {
    key: 'focus_drift_detection',
    description: 'Weinberg \'Psychology of Computer Programming\' — single-focus produces highest quality. Newport \'Deep Work\' — context switches carry 15-20 min cognitive residue cost. Allen GTD — open loops degrade current task performance. 5+ unfinished domains = context fragmentation, not parallelism. Complete one domain before opening the next.',
    expectedStages: ['implementation'],
    detectionKeywords: [],
    vibeKeywords: [],
    absenceThreshold: 5,
  },

  // ── Phase 7 F2: Session-quality context/drift group ───────────────────────

  {
    key: 'session_length_checkpoint',
    description: 'XP navigator-driver model — solo AI-assisted dev requires the developer to perform the navigator role: periodic context reanchoring (\'here is where we are, here is what remains\') maintains shared mental model between developer and AI. Context drift is silent — it degrades output quality without warning. Reanchor at 25 prompts.',
    expectedStages: ['implementation', 'review_testing'],
    detectionKeywords: [
      'here\'s a summary of what we\'ve built', 'context checkpoint',
      'here\'s the current state', 'catching up on where we are',
    ],
    vibeKeywords: [
      'so where we are is', 'recap:', 'to summarize what we have',
    ],
    absenceThreshold: 25,
  },
  {
    key: 'progress_consolidation_gap',
    description: 'Pragmatic Programmer \'knowledge portfolio\' — undocumented progress is a liability, not an asset. DeMarco \'Peopleware\' — writing forces thinking; consolidation is a second pass at the design. Project state must be explicit in the codebase, not implicit in AI conversation history. Consolidate at 20 implementation prompts.',
    expectedStages: ['implementation'],
    detectionKeywords: [
      'summarizing what we built', 'documenting current state',
      'here\'s what\'s been built', 'updating the README',
    ],
    vibeKeywords: [
      'so we have', 'what we built was', 'summary of progress',
    ],
    absenceThreshold: 20,
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
