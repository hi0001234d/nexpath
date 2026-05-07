import type { Stage, ClassificationResult } from './types.js';
import { STAGES } from './types.js';

/**
 * Tier 1 — keyword / phrase matching.
 *
 * Uses a flat Map<phrase, [Stage, weight]> for O(1) per lookup after a single
 * toLowerCase pass on the input. Multi-keyword hits accumulate weight so that
 * prompts that clearly reference a stage return high confidence quickly.
 *
 * Returns null when no keywords match — caller should fall through to Tier 2.
 */

// Weight ≥ 1.0 = high-confidence keyword; < 1.0 = soft/secondary keyword.
const KEYWORD_MAP: Array<[string, Stage, number]> = [
  // Idea
  ['idea', 'idea', 1.0],
  ['concept', 'idea', 0.9],
  ['brainstorm', 'idea', 1.0],
  ['what if', 'idea', 0.9],
  ['could we', 'idea', 0.8],
  ['thinking about building', 'idea', 0.9],
  ['explore the problem', 'idea', 0.9],
  ['problem space', 'idea', 0.9],
  ['vision for', 'idea', 0.8],
  ['opportunity', 'idea', 0.7],

  // PRD / Spec
  ['prd', 'prd', 1.0],
  ['spec', 'prd', 1.0],
  ['requirements', 'prd', 1.0],
  ['user story', 'prd', 0.9],
  ['user stories', 'prd', 0.9],
  ['acceptance criteria', 'prd', 0.9],
  ['write a document', 'prd', 0.8],
  ['define what', 'prd', 0.8],
  ['feature brief', 'prd', 0.8],
  ['product doc', 'prd', 0.8],

  // Architecture
  ['architecture', 'architecture', 1.0],
  ['system design', 'architecture', 1.0],
  ['adr', 'architecture', 0.9],
  ['how should we structure', 'architecture', 0.9],
  ['design the system', 'architecture', 0.9],
  ['data model', 'architecture', 0.9],
  ['database schema', 'architecture', 0.9],
  ['high level design', 'architecture', 0.9],
  ['component diagram', 'architecture', 0.8],
  ['design pattern', 'architecture', 0.8],

  // Task Breakdown
  ['subtasks', 'task_breakdown', 1.0],
  ['break this down', 'task_breakdown', 1.0],
  ['break down into', 'task_breakdown', 1.0],
  ['backlog', 'task_breakdown', 0.9],
  ['tickets', 'task_breakdown', 0.9],
  ['todo list', 'task_breakdown', 0.8],
  ['checklist', 'task_breakdown', 0.8],
  ['work items', 'task_breakdown', 0.8],
  ['sprint plan', 'task_breakdown', 0.9],
  ['task list', 'task_breakdown', 0.9],

  // Implementation
  ['implement', 'implementation', 1.0],
  ['write the function', 'implementation', 0.9],
  ['write the code', 'implementation', 0.9],
  ['build the', 'implementation', 0.7],
  ['create the', 'implementation', 0.6],
  ['add the', 'implementation', 0.5],
  ['refactor', 'implementation', 0.8],
  ['endpoint', 'implementation', 0.7],
  ['the handler', 'implementation', 0.7],
  ['migration', 'implementation', 0.7],

  // Review / Testing
  ['unit test', 'review_testing', 1.0],
  ['integration test', 'review_testing', 1.0],
  ['run all tests', 'review_testing', 1.0],
  ['run the tests', 'review_testing', 1.0],
  ['regression', 'review_testing', 1.0],
  ['test coverage', 'review_testing', 0.9],
  ['edge case', 'review_testing', 0.9],
  ['write tests', 'review_testing', 0.9],
  ['add tests', 'review_testing', 0.8],
  ['does this work', 'review_testing', 0.8],

  // Release
  ['deploy', 'release', 1.0],
  ['npm publish', 'release', 1.0],
  ['docker push', 'release', 1.0],
  ['push to prod', 'release', 1.0],
  ['go live', 'release', 1.0],
  ['ci/cd', 'release', 0.9],
  ['changelog', 'release', 0.9],
  ['release version', 'release', 1.0],
  ['tag this', 'release', 0.8],
  ['ship this', 'release', 0.9],

  // Feedback Loop
  ['user reported', 'feedback_loop', 1.0],
  ['users are seeing', 'feedback_loop', 1.0],
  ['post-launch', 'feedback_loop', 1.0],
  ['hotfix', 'feedback_loop', 0.9],
  ['incident', 'feedback_loop', 0.8],
  ['rollback', 'feedback_loop', 0.8],
  ['users reporting', 'feedback_loop', 1.0],
  ['bug report', 'feedback_loop', 0.9],
  ['production issue', 'feedback_loop', 1.0],
  ['feedback from users', 'feedback_loop', 0.9],
  ['plan the next iteration', 'feedback_loop', 0.9],
  ['based on user feedback', 'feedback_loop', 0.8],
  ['based on what users said', 'feedback_loop', 0.8],
  ['what to prioritize based on feedback', 'feedback_loop', 0.9],
  ['what should we work on next', 'feedback_loop', 0.7],
];

export function matchKeywords(text: string): ClassificationResult | null {
  const lower = text.toLowerCase();

  // Accumulate score per stage
  const scores: Partial<Record<Stage, number>> = {};
  for (const [phrase, stage, weight] of KEYWORD_MAP) {
    if (lower.includes(phrase)) {
      scores[stage] = (scores[stage] ?? 0) + weight;
    }
  }

  if (Object.keys(scores).length === 0) return null;

  // Find highest-scoring stage
  let topStage: Stage = 'implementation';
  let topScore = 0;
  for (const s of STAGES) {
    const v = scores[s] ?? 0;
    if (v > topScore) { topScore = v; topStage = s; }
  }

  // Normalise: 3 strong hits (weight 1.0 each) → confidence 1.0
  const NORMALISER = 3.0;
  const allScores: Partial<Record<Stage, number>> = {};
  for (const s of STAGES) {
    const raw = scores[s] ?? 0;
    if (raw > 0) allScores[s] = Math.min(raw / NORMALISER, 1.0);
  }

  return {
    stage: topStage,
    confidence: Math.min(topScore / NORMALISER, 1.0),
    tier: 1,
    allScores,
  };
}
