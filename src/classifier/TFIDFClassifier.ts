import { createRequire } from 'node:module';
import type { Stage, ClassificationResult } from './types.js';
import { STAGES } from './types.js';

const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { TfIdf } = _require('natural') as { TfIdf: new () => any };

/**
 * Training corpus — 20 representative utterances per stage (per research spec: 20-30).
 * Each string represents what a developer might type at that stage.
 * The TF-IDF model learns the vocabulary distribution per stage.
 */
const TRAINING_DATA: Record<Stage, string[]> = {
  idea: [
    'i am thinking about building a feature for sharing results',
    'what if we added a recommendation engine to the platform',
    'let me brainstorm the core concept for this new product idea',
    'could we build something that automatically detects anomalies',
    'exploring the problem space around developer workflow inefficiencies',
    'i have an idea for a new tool that helps teams track velocity',
    'thinking about what the core value proposition should be',
    'what problem are we actually solving here with this product',
    'vision for the mvp is a simple one click deployment tool',
    'let us explore different approaches to solving this user problem',
    'what would a minimum viable version of this idea look like',
    'brainstorming ways to differentiate this product in the market',
    'is there a simpler way to think about the core concept here',
    'what pain point does this tool address for developers',
    'conceptually what should the user experience feel like on day one',
    'let us validate the assumption that users want this capability',
    'thinking through the core workflow before we write any code',
    'what is the opportunity we are trying to capture with this',
    'could this concept scale beyond the initial use case',
    'exploring the product space to find the right angle for this idea',
  ],
  prd: [
    'write a product requirements document for this authentication feature',
    'let us define the acceptance criteria for the user module',
    'i need to write the spec for the payment integration system',
    'define what done looks like for this sprint milestone',
    'write a user story for the notification and alert system',
    'document the requirements before we start building any code',
    'create a feature brief for the dashboard analytics redesign',
    'define what the search feature should do for end users',
    'write up the requirements for all the api endpoints needed',
    'the prd should cover the onboarding flow in detail',
    'specify the edge cases and error states for the registration flow',
    'what are the non-functional requirements for performance and security',
    'write the functional specification for the subscription billing module',
    'document the user journey from signup through to first value moment',
    'define the success metrics and kpis for this feature launch',
    'create the requirements document so the team knows what to build',
    'write acceptance tests in plain english before we implement anything',
    'scope the mvp requirements so we can ship something small first',
    'document all the constraints and assumptions for this feature',
    'the spec needs to cover the happy path and all the error states',
  ],
  architecture: [
    'let us design the system architecture for this new service',
    'how should we structure the database schema for user profiles',
    'draw the component diagram for the frontend application architecture',
    'design the data model for the analytics pipeline processing',
    'should we use microservices or a monolith system design approach',
    'what design pattern should we use for the event handling system',
    'how should we structure the codebase at a high level',
    'let us think about the dependencies between these backend modules',
    'create an adr for the choice of authentication library decision',
    'what schema should we use for the relational database tables',
    'design the api contracts between the frontend and backend services',
    'how do we handle state management in this distributed architecture',
    'what caching strategy makes sense for this read-heavy workload',
    'design the event-driven architecture for the notification pipeline',
    'should the file storage be on-premise or use an object store',
    'map out the service boundaries and the interfaces between them',
    'what are the technical tradeoffs between a queue and a database poll',
    'design the security model including authentication and authorisation layers',
    'how should we handle database migrations without downtime',
    'architecture decision record for choosing between rest and graphql',
  ],
  task_breakdown: [
    'break this feature down into smaller tasks we can work on',
    'create a backlog of tickets for the authentication module',
    'list the subtasks needed to complete the user profile feature',
    'make a checklist of everything we need to build for version one',
    'break this down into a sprint plan with concrete work items',
    'create a todo list for implementing the full payment flow',
    'what are all the tasks needed to complete this feature',
    'organize these features into a prioritized development backlog',
    'create development tickets for each part of the analytics dashboard',
    'break the implementation into smaller chunks we can tackle individually',
    'create a task list so we can estimate the work involved',
    'what is the order of work items and which ones have dependencies',
    'split this large feature into deliverable milestones and subtasks',
    'list all the backend tickets and the frontend tickets separately',
    'create a sprint board with the tasks needed for this release',
    'break this epic down into user stories and individual tasks',
    'organize the backlog so the highest priority items are at the top',
    'what tickets do we need for the database layer of this feature',
    'create a checklist of all the things we need to complete before launch',
    'list the work items for this iteration so everyone knows what to do',
  ],
  implementation: [
    'implement the user authentication middleware for the api',
    'build the api endpoint for creating new user projects',
    'add the email notification service to the backend system',
    'create the react component for the dashboard header navigation',
    'write the function to calculate monthly revenue for billing',
    'fix the bug where users cannot update their profile picture',
    'refactor the database query to improve performance and efficiency',
    'implement the websocket handler for real time live updates',
    'add input validation to the user registration form fields',
    'create the database migration script for adding the new columns',
    'implement the retry logic for failed api calls in the service',
    'add the rate limiting middleware to the public api endpoints',
    'write the background job to clean up expired session tokens',
    'implement the search indexing logic for the new product catalog',
    'add the oauth2 integration for google and github social login',
    'create the webhook handler for receiving payment provider events',
    'implement the csv export function for the reporting dashboard',
    'write the unit under test before implementing the production code',
    'add the feature flag check before running the new billing logic',
    'refactor the legacy authentication module to use the new pattern',
  ],
  review_testing: [
    'write unit tests for the authentication module we just built',
    'run all the tests and check for any regressions introduced',
    'review the code that was generated for any obvious issues',
    'add integration tests for the payment flow end to end',
    'check if this implementation handles all edge cases correctly',
    'verify that the api returns the correct response format always',
    'does this implementation match what the spec document defines',
    'run the test suite and make sure coverage is above eighty percent',
    'audit the security of the new authentication implementation thoroughly',
    'check if there are any bugs in the new form validation logic',
    'write the acceptance tests for the user registration happy path',
    'review the generated code for any security vulnerabilities or issues',
    'mock the external dependencies and write unit tests for the service',
    'verify the database schema migration works correctly on staging',
    'check the test coverage report and write tests for uncovered paths',
    'does the feature behave as described in the acceptance criteria',
    'run regression tests after this refactor to ensure nothing broke',
    'review the pull request and check for code quality issues',
    'test the api endpoints with realistic payloads and edge cases',
    'verify the integration with the third party payment service works',
  ],
  release: [
    'deploy this service to the production environment now',
    'ship the new feature to staging environment first for testing',
    'release version two of the api to all customers',
    'push this change to production after all the tests pass',
    'set up the ci cd pipeline for automated deployment processes',
    'publish the npm package with the new breaking changes',
    'go live with the feature after qa team approves everything',
    'create a changelog entry for this new release version',
    'tag this commit as version one point two point zero for release',
    'push the docker image to the container registry today',
    'configure the environment variables for the production deployment',
    'set up the deployment pipeline for automated releases on merge',
    'create the release branch and bump the version number',
    'push the hotfix to production and monitor for any new errors',
    'write the release notes summarizing all the changes in this version',
    'verify the rollback procedure before pushing to production',
    'deploy the database migration to production after backing up',
    'ship the feature behind a feature flag and enable it gradually',
    'set up the production monitoring and alerting for the new service',
    'push the container image and update the kubernetes deployment',
  ],
  feedback_loop: [
    'users are reporting that the login page is completely broken today',
    'we got bug reports about the payment flow failing in production',
    'there is a complaint from users about very slow page loading times',
    'we need a hotfix for the critical authentication bug in production',
    'post launch feedback shows users really want a dark mode option',
    'there is an incident with the database going down under heavy load',
    'user reported that they cannot complete the onboarding flow at all',
    'fix the critical bug that was introduced in the last deployment',
    'we need to roll back the deployment due to production outage issues',
    'issue reported that the search feature returns completely wrong results',
    'customers are complaining that invoices are showing incorrect amounts',
    'monitoring alert fired because error rates spiked after the last release',
    'a user submitted a bug report with reproduction steps for the crash',
    'post-launch we discovered the email notifications are not being sent',
    'the support team escalated a critical issue affecting enterprise customers',
    'production incident the api is returning five hundred errors for all requests',
    'users are seeing duplicate entries in their transaction history',
    'feedback from beta users shows the onboarding flow is too confusing',
    'high priority bug the data export is producing corrupted csv files',
    'we need to patch the security vulnerability reported by a researcher',
  ],
};

/** Lazy-initialised TF-IDF model — built once, reused across calls. */
let _tfidf: ReturnType<typeof buildModel> | null = null;

function buildModel() {
  const tfidf = new TfIdf();
  const stageOrder: Stage[] = [];
  for (const stage of STAGES) {
    tfidf.addDocument(TRAINING_DATA[stage].join(' '));
    stageOrder.push(stage);
  }
  return { tfidf, stageOrder };
}

/**
 * Tier 2 — TF-IDF cosine-style classification.
 *
 * Sums TF-IDF weights for each query token across every stage document.
 * The stage whose document accumulates the highest weight wins.
 * Always returns a result (confidence may be low if vocabulary is foreign).
 */
export function classifyWithTFIDF(text: string): ClassificationResult {
  if (!_tfidf) _tfidf = buildModel();
  const { tfidf, stageOrder } = _tfidf;

  const tokens = text.toLowerCase().split(/[\s,.'";:!?()]+/).filter(Boolean);
  const sums = new Array<number>(stageOrder.length).fill(0);

  for (const token of tokens) {
    tfidf.tfidfs(token, (i: number, measure: number) => {
      sums[i] += measure;
    });
  }

  const total = sums.reduce((a, b) => a + b, 0);

  let topIdx = 0;
  for (let i = 1; i < sums.length; i++) {
    if (sums[i] > sums[topIdx]) topIdx = i;
  }

  const confidence = total > 0 ? sums[topIdx] / total : 0;

  const allScores: Partial<Record<Stage, number>> = {};
  for (let i = 0; i < stageOrder.length; i++) {
    if (total > 0) allScores[stageOrder[i]] = sums[i] / total;
  }

  return {
    stage: stageOrder[topIdx],
    confidence,
    tier: 2,
    allScores,
  };
}

/** Reset the cached model (useful in tests). */
export function resetTFIDFModel(): void {
  _tfidf = null;
}
