import { createRequire } from 'node:module';
import type { Stage, ClassificationResult } from './types.js';
import { STAGES } from './types.js';

const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { TfIdf } = _require('natural') as { TfIdf: new () => any };

/**
 * Training corpus — 10 representative utterances per stage.
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
