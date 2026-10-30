/**
 * Feature 1 — Context Engineering: Tag Generator & Token Estimator (Module 10)
 *
 * Produces internal context tags for metadata tracking and UI display (diff drawer),
 * and provides lightweight deterministic token estimation (~3.8 chars/token).
 */

import type {
  WorkspaceContext,
  ScoredFact,
} from '../types/context-engineering.js';

/**
 * Generates an array of unique context tags for injected facts and workspace metadata.
 * Format examples:
 *  - @file:src/auth.ts
 *  - @git:branch:main
 *  - @rule:max-retries
 *  - @failure:db-timeout
 */
export function generateContextTags(
  facts: ScoredFact[],
  context?: WorkspaceContext
): string[] {
  const tagsSet = new Set<string>();

  // 1. Workspace tags
  if (context?.activeFilePath) {
    tagsSet.add(`@file:${normalizeTagPath(context.activeFilePath)}`);
  }
  if (context?.gitBranch) {
    tagsSet.add(`@git:branch:${slugify(context.gitBranch)}`);
  }

  // 2. Fact tags
  for (const item of facts) {
    if (item.tag) {
      tagsSet.add(item.tag);
    } else {
      const kind = item.fact.kind;
      const key = slugify(item.fact.key);
      tagsSet.add(`@${kind}:${key}`);
    }

    // Also include file tags from fact identities if present
    if (item.fact.identities && Array.isArray(item.fact.identities)) {
      for (const id of item.fact.identities) {
        if (id.file) {
          tagsSet.add(`@file:${normalizeTagPath(id.file)}`);
        }
      }
    }
  }

  return Array.from(tagsSet);
}

/**
 * Fast deterministic token estimator (<0.05ms) using ~3.8 characters per token.
 * Avoids bundling heavy external BPE/tokenizer packages in the headless library.
 */
export function estimateTokenCount(text: string): number {
  if (!text || typeof text !== 'string') return 0;
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;

  // Approximate word count + punctuation weight
  // Standard English code/text averages ~3.8 to 4.0 characters per token
  const charCount = trimmed.length;
  const words = trimmed.split(/\s+/).length;

  // Hybrid estimation: combination of char length and word boundaries
  const estimated = Math.max(words, Math.round(charCount / 3.8));
  return Math.max(1, estimated);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_\-\/]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeTagPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}
