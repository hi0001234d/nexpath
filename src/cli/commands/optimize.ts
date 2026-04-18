import type { Store } from '../../store/db.js';
import { openStore, closeStore, DEFAULT_DB_PATH } from '../../store/db.js';
import {
  getSkippedSessions,
  deleteSkippedSession,
} from '../../store/skipped-sessions.js';
import { resolveDecisionContent } from '../../decision-session/options.js';
import { runDecisionSession } from '../../decision-session/DecisionSession.js';
import type { SelectFn } from '../../decision-session/DecisionSession.js';
import type { Stage } from '../../classifier/types.js';
import type { FlagType } from '../../classifier/Stage2Trigger.js';

/**
 * nexpath optimize — replay skipped decision session items.
 *
 * Surfaces every item the user previously skipped with
 * "Skip for now — nexpath optimize will remind me later", one by one,
 * in the order they were skipped (oldest first).
 *
 * For each item:
 *   - Renders the 3-level decision cascade starting at Level 1.
 *   - Uses the static pinch fallback label (no API call needed).
 *   - If the user selects a content option: deletes the item from the store
 *     and writes the selected prompt to stdout.
 *   - If the user skips again: leaves the item in the store and moves on.
 *
 * After the run, a summary line is written to stderr.
 * stdout contains only selected prompt texts (one per line) — safe to pipe.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface OptimizeInput {
  /** Project root — used to scope the skipped-items queue. */
  projectRoot: string;
}

export interface OptimizeOutcome {
  /** Total items in the queue at the start of this run. */
  total:     number;
  /** Items where the user selected a content option (deleted from store). */
  addressed: number;
  /** Items still remaining in the queue after the run. */
  remaining: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Human-readable age string for a skipped item.
 * Used in the "Item N of M — skipped X ago" header.
 */
export function describeAge(skippedAt: number, now = Date.now()): string {
  const ms      = now - skippedAt;
  const minutes = Math.floor(ms / 60_000);
  const hours   = Math.floor(ms / 3_600_000);
  const days    = Math.floor(ms / 86_400_000);
  if (days > 0)    return `skipped ${days} day${days === 1 ? '' : 's'} ago`;
  if (hours > 0)   return `skipped ${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (minutes > 0) return `skipped ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  return 'skipped just now';
}

// ── Core logic ─────────────────────────────────────────────────────────────────

/**
 * Run the optimize replay loop.
 *
 * @param input     Project root used to query the skipped-items queue.
 * @param store     Open SQLite store (caller manages lifecycle).
 * @param selectFn  Injectable select function (defaults to @clack/prompts select).
 * @returns         Outcome counts for the run.
 */
export async function runOptimize(
  input:     OptimizeInput,
  store:     Store,
  selectFn?: SelectFn,
): Promise<OptimizeOutcome> {
  const items = getSkippedSessions(store, input.projectRoot);

  if (items.length === 0) {
    return { total: 0, addressed: 0, remaining: 0 };
  }

  let addressed = 0;

  for (let i = 0; i < items.length; i++) {
    const item     = items[i];
    const stage    = item.stage    as Stage;
    const flagType = item.flagType as FlagType;
    const content  = resolveDecisionContent(stage, flagType);

    // Item header on stderr — keeps stdout clean for piping selected prompts
    process.stderr.write(
      `\nItem ${i + 1} of ${items.length} — ${describeAge(item.skippedAt)}\n`,
    );

    // Replay the cascade from Level 1 using the static pinch fallback.
    // We deliberately do NOT pass `store` here so that a fresh skip during
    // optimize does not create a duplicate skipped_sessions record.
    const dsResult = await runDecisionSession(
      {
        stage,
        flagType,
        pinchLabel:  content.pinchFallback,
        sessionId:   item.sessionId,
        projectRoot: input.projectRoot,
        promptCount: item.skippedAtPromptCount,
      },
      undefined,  // no store → skip during optimize does not re-insert
      selectFn,
    );

    if (dsResult.outcome === 'selected') {
      deleteSkippedSession(store, item.id);
      addressed++;
      process.stdout.write(dsResult.selectedPrompt + '\n');
    }
    // 'skipped' → item stays in store; move to next
  }

  return {
    total:     items.length,
    addressed,
    remaining: items.length - addressed,
  };
}

// ── CLI entry point ────────────────────────────────────────────────────────────

/**
 * Register `nexpath optimize` with the given Commander program.
 *
 * Usage:
 *   nexpath optimize [--project /path/to/project] [--db /path/to/db]
 *
 * Defaults project root to CWD — consistent with `nexpath auto`.
 */
export function registerOptimizeCommand(program: import('commander').Command): void {
  program
    .command('optimize')
    .description('Work through previously skipped decision session suggestions')
    .option('-p, --project <path>', 'Project root path', process.cwd())
    .option('--db <path>', 'Database path', DEFAULT_DB_PATH)
    .action(async (opts: { project: string; db: string }) => {
      const store = await openStore(opts.db);
      try {
        const outcome = await runOptimize({ projectRoot: opts.project }, store);
        if (outcome.total === 0) {
          process.stdout.write('No skipped items for this project.\n');
        } else {
          process.stderr.write(
            `\n${outcome.addressed} of ${outcome.total} items addressed. ${outcome.remaining} remaining.\n`,
          );
        }
      } finally {
        closeStore(store);
      }
    });
}
