/**
 * Feature 1 — Context Engineering: Deterministic Task Classifier (Module 6, Piece 4 & 6)
 *
 * Fast keyword and regex-based task classifier executing in <1ms without LLM calls.
 * Categorizes developer tasks into:
 *  - bugfix: fix, bug, error, exception, crash, issue, broken, failed, patch, wrong, fails, regression
 *  - feature: add, create, implement, build, new, support, introduce, generate
 *  - refactor: refactor, clean, restructure, simplify, split, reorganize, extract, rename, deduplicate
 *  - test: test, spec, coverage, mock, unit test, e2e, assert, benchmark, vitest, jest
 *  - config: config, env, docker, ci, tsconfig, package.json, yaml, setup, install, build, webpack, vite
 *  - general: default fallback when no specific category dominates
 */

import type { TaskType, TaskClassification } from '../types/context-engineering.js';

interface CategoryDefinition {
  type: TaskType;
  keywords: string[];
  patterns: RegExp[];
  weight: number;
}

const CATEGORIES: CategoryDefinition[] = [
  {
    type: 'bugfix',
    keywords: [
      'fix', 'bug', 'error', 'exception', 'crash', 'issue', 'broken',
      'failed', 'patch', 'wrong', 'fails', 'regression', 'hotfix',
      'failing', 'revert', 'unhandled', 'corrupt', 'timeout',
    ],
    patterns: [
      /\b(fix(ing|ed|es)?|bugs?|errors?|exceptions?|crashes?|crashed|broken|failing|fails|failures?)\b/i,
      /\b(not working|doesn't work|syntax error|type error|segmentation fault)\b/i,
    ],
    weight: 1.2, // Prioritize bugfix keywords
  },
  {
    type: 'test',
    keywords: [
      'test', 'spec', 'coverage', 'mock', 'unit test', 'e2e',
      'assert', 'benchmark', 'vitest', 'jest', 'cypress', 'playwright',
      'testing', 'stub', 'verify', 'smoke test',
    ],
    patterns: [
      /\b(tests?|testing|specs?|coverage|mocks?|assert(ion)?s?|benchmarks?)\b/i,
      /\b(unit tests?|e2e tests?|integration tests?|smoke tests?)\b/i,
      /\b(vitest|jest|playwright|cypress|pytest)\b/i,
    ],
    weight: 1.15,
  },
  {
    type: 'refactor',
    keywords: [
      'refactor', 'clean', 'restructure', 'simplify', 'split',
      'reorganize', 'extract', 'rename', 'deduplicate', 'modularize',
      'cleanup', 'decouple', 'modernize', 'dry',
    ],
    patterns: [
      /\b(refactor(ing|ed|s)?|clean(ing)? up|restructur(e|ing)|simplif(y|ied|ying))\b/i,
      /\b(split|reorganiz(e|ing)|extract(ing)?|renam(e|ing)|deduplicat(e|ing))\b/i,
    ],
    weight: 1.1,
  },
  {
    type: 'config',
    keywords: [
      'config', 'env', 'docker', 'ci', 'tsconfig', 'package.json',
      'yaml', 'setup', 'install', 'build', 'webpack', 'vite',
      'kubernetes', 'k8s', 'pipeline', 'workflow', 'deploy', 'dotenv',
    ],
    patterns: [
      /\b(configs?|configuration|environment|\.env|docker|dockerfile|tsconfig|package\.json)\b/i,
      /\b(ci\/cd|github actions|pipelines?|deploy(ment)?|webpack|vite|rollup|turbopack)\b/i,
      /\b(npm install|pnpm|yarn|cargo|pip install)\b/i,
    ],
    weight: 1.05,
  },
  {
    type: 'feature',
    keywords: [
      'add', 'create', 'implement', 'build', 'new', 'support',
      'introduce', 'generate', 'enable', 'allow', 'extend',
    ],
    patterns: [
      /\b(add(ing|ed|s)?|creat(e|ing|ed)|implement(ing|ed|s)?|build(ing)?|support(ing|ed)?)\b/i,
      /\b(new feature|introduce|allow|extend|integrat(e|ing|ion))\b/i,
    ],
    weight: 1.0,
  },
];

/**
 * Deterministically classifies a developer's prompt into one of the 6 task types.
 * Executes in <1ms without network calls.
 */
export function classifyTask(prompt: string): TaskClassification {
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return {
      taskType: 'general',
      confidence: 0.5,
      matchedKeywords: [],
    };
  }

  const normalized = prompt.toLowerCase();
  const scores: Map<TaskType, { score: number; matches: Set<string> }> = new Map();

  for (const cat of CATEGORIES) {
    scores.set(cat.type, { score: 0, matches: new Set() });
  }

  // Evaluate keywords and patterns for each category
  for (const cat of CATEGORIES) {
    const entry = scores.get(cat.type)!;

    for (const kw of cat.keywords) {
      const kwRegex = new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i');
      if (kwRegex.test(normalized)) {
        entry.matches.add(kw);
        entry.score += 1.0 * cat.weight;
      }
    }

    for (const pat of cat.patterns) {
      const match = normalized.match(pat);
      if (match) {
        entry.matches.add(match[0].toLowerCase());
        entry.score += 1.5 * cat.weight;
      }
    }
  }

  // Find category with highest score
  let bestType: TaskType = 'general';
  let bestScore = 0;
  let bestMatches: string[] = [];

  for (const [type, { score, matches }] of scores.entries()) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
      bestMatches = Array.from(matches);
    }
  }

  // If no category matched or score is negligible, fall back to general
  if (bestScore === 0) {
    return {
      taskType: 'general',
      confidence: 0.5,
      matchedKeywords: [],
    };
  }

  // Confidence is normalized between 0.60 and 0.98 based on match strength
  const confidence = Math.min(0.98, Math.max(0.60, 0.50 + bestScore * 0.12));

  return {
    taskType: bestType,
    confidence: Number(confidence.toFixed(2)),
    matchedKeywords: bestMatches.slice(0, 5),
  };
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
