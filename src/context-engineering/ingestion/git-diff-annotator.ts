/**
 * Feature 1 — Context Engineering: Git Diff Impact Annotator
 *
 * Scans active memory facts against modified file paths from git diffs.
 * When a file referenced in a memory fact's `identities` has been edited,
 * annotates that fact with `staleness = 'code_changed_since'`.
 *
 * Implements:
 *  - TC-M3.5: markStaleByFile sets staleness = 'code_changed_since'
 *  - TC-ING-9: File staleness tagging on git diff modifications
 *  - TC-E2E-7: Git diff impact marking
 */

import type { Store } from '../../store/db.js';
import { getActiveContextMemory, markMemoryStale } from '../store/historical-map-store.js';

export function annotateStaleFactsFromGitDiff(
  store: Store,
  projectRoot: string,
  modifiedFiles: string[]
): number[] {
  if (!modifiedFiles || modifiedFiles.length === 0) {
    return [];
  }

  const activeRows = getActiveContextMemory(store, projectRoot);
  const updatedIds: number[] = [];

  // Normalize modified files for clean suffix/relative matching
  const normalizedModified = modifiedFiles.map((f) => f.replace(/^[./\\]+/, ''));

  for (const row of activeRows) {
    if (!row.identities || row.identities.length === 0) continue;

    const rowFiles = row.identities
      .map((i) => i.file)
      .filter((f): f is string => Boolean(f))
      .map((f) => f.replace(/^[./\\]+/, ''));

    const isImpacted = rowFiles.some((rf) =>
      normalizedModified.some((mf) => mf === rf || mf.endsWith(rf) || rf.endsWith(mf))
    );

    if (isImpacted) {
      markMemoryStale(store, projectRoot, row.id, 'code_changed_since');
      updatedIds.push(row.id);
    }
  }

  return updatedIds;
}
