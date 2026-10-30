/**
 * Feature 1 — Context Engineering: Stop Hook Ingestion Trigger (Path A)
 *
 * Primary entry point for capturing session turns and facts at Stop hook
 * checkpoints. Operates completely in-process with fail-open safety.
 *
 * Implements:
 *  - TC-ING-1: Stop hook fact extraction
 *  - TC-ING-2: Sub-2ms deterministic execution with 0 external network calls
 *  - TC-ING-10: Asynchronous non-blocking MemOS turn persistence
 */

import type { Store } from '../../store/db.js';
import { canonicalizeWorkspacePath } from '../core/project-scope.js';
import { ingestSessionFacts, type IngestionResult } from './decision-chainer.js';
import { annotateStaleFactsFromGitDiff } from './git-diff-annotator.js';
import { MemOSAdapter } from '../adapters/memos-adapter.js';

export interface StopHookInput {
  projectRoot?: string;
  prompt: string;
  assistantResponse: string;
  sessionId?: string;
  modifiedFiles?: string[];
  memosAdapter?: MemOSAdapter;
}

export interface StopHookResult {
  ok: boolean;
  factsCaptured: number;
  supersededCount: number;
  staleCount: number;
}

export async function handleStopHookCapture(
  store: Store,
  input: StopHookInput
): Promise<StopHookResult> {
  try {
    const canonicalProject = canonicalizeWorkspacePath(input.projectRoot);

    // 1. Ingest typed facts & chain superseded decisions
    const ingestion: IngestionResult = ingestSessionFacts(store, {
      projectRoot: canonicalProject,
      prompt: input.prompt,
      assistantResponse: input.assistantResponse,
    });

    // 2. Mark git diff staleness if files were modified
    let staleCount = 0;
    if (input.modifiedFiles && input.modifiedFiles.length > 0) {
      const staleIds = annotateStaleFactsFromGitDiff(
        store,
        canonicalProject,
        input.modifiedFiles
      );
      staleCount = staleIds.length;
    }

    // 3. Asynchronous MemOS turn persistence (non-blocking, TC-ING-10)
    const memos =
      input.memosAdapter ??
      new MemOSAdapter({ projectRoot: canonicalProject });

    // Non-blocking fire-and-forget turn persistence
    void memos
      .saveTurn({
        prompt: input.prompt,
        response: input.assistantResponse,
        timestamp: Date.now(),
      })
      .catch(() => {
        // Silently fail-open
      });

    return {
      ok: true,
      factsCaptured: ingestion.insertedCount,
      supersededCount: ingestion.supersededCount,
      staleCount,
    };
  } catch {
    // Absolute fail-open safety shell (Spec §1)
    return {
      ok: true,
      factsCaptured: 0,
      supersededCount: 0,
      staleCount: 0,
    };
  }
}
