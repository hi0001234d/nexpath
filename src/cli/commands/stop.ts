import { platform } from 'node:process';
import type { Store } from '../../store/db.js';
import { openStore, closeStore, DEFAULT_DB_PATH } from '../../store/db.js';
import { getPendingAdvisory, markAdvisoryShown } from '../../store/pending-advisories.js';
import { runDecisionSession } from '../../decision-session/DecisionSession.js';
import type { SelectFn } from '../../decision-session/DecisionSession.js';
import { createTtySelectFn } from '../../decision-session/TtySelectFn.js';
import { getConfig } from '../../store/config.js';
import { logger, initLogger } from '../../logger.js';
import type { LogLevel } from '../../logger.js';
import { writeHookStats } from '../../store/hook-stats.js';
import { readStdin } from './auto.js';

/**
 * nexpath stop — Claude Code Stop hook handler.
 *
 * Fires every time Claude finishes a response.  The handler:
 *   1. Exits immediately when stop_hook_active is true (loop guard).
 *   2. Looks up a pending advisory for the project (stored by the auto hook).
 *   3. If found: marks it shown, opens /dev/tty, renders the decision session UI.
 *   4. If the user picks an option: copies it to clipboard (Windows) and writes
 *      { decision: "block", reason: <option> } so Claude Code shows the selection.
 *   5. On dismiss / skip / no advisory: exits 0 silently (Claude stops normally).
 */

// ── Helpers ────────────────────────────────────────────────────────────────────

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StopPayload {
  session_id?:             string;
  cwd:                     string;
  hook_event_name:         string;
  stop_hook_active:        boolean;
  last_assistant_message?: string;
}

export type StopOutcome =
  | { outcome: 'loop_guard' }
  | { outcome: 'no_pending' }
  | { outcome: 'no_tty' }
  | { outcome: 'blocked';       reason: string }
  | { outcome: 'clipboard_only' }
  | { outcome: 'skipped' };

// ── Core logic ─────────────────────────────────────────────────────────────────

/**
 * Run the Stop hook pipeline.
 *
 * @param payload   Parsed Stop hook JSON payload from Claude Code stdin
 * @param store     Open SQLite store (caller manages lifecycle)
 * @param selectFn  Optional select replacement (injected in tests)
 */
export async function runStop(
  payload:   StopPayload,
  store:     Store,
  selectFn?: SelectFn,
): Promise<StopOutcome> {
  // 1. Loop guard — Claude is continuing because of a previous Stop block; let it land
  if (payload.stop_hook_active) {
    logger.debug('stop_loop_guard', { cwd: payload.cwd });
    return { outcome: 'loop_guard' };
  }

  // 2. Check for a pending advisory stored by the auto hook
  const advisory = getPendingAdvisory(store, payload.cwd);
  if (!advisory) {
    logger.debug('stop_no_pending', { cwd: payload.cwd });
    return { outcome: 'no_pending' };
  }

  // 3. Mark as shown immediately — prevents duplicate UI on rapid Stop re-fires
  markAdvisoryShown(store, advisory.id);

  // 4. TTY resolution — Stop hook stdin is always piped; open /dev/tty directly
  let effectiveSelectFn: SelectFn | undefined = selectFn;
  if (!effectiveSelectFn) {
    const ttySel = createTtySelectFn();
    if (!ttySel) {
      logger.info('stop_no_tty', { cwd: payload.cwd });
      return { outcome: 'no_tty' };
    }
    effectiveSelectFn = ttySel;
    logger.debug('stop_tty_resolved', { method: 'direct_tty' });
  }

  // 5. Render decision session UI
  const dsResult = await runDecisionSession(
    {
      stage:       advisory.stage,
      flagType:    advisory.flagType,
      pinchLabel:  advisory.pinchLabel,
      sessionId:   advisory.sessionId,
      projectRoot: payload.cwd,
      promptCount: advisory.promptCount,
    },
    store,
    effectiveSelectFn,
  );

  if (dsResult.outcome === 'selected') {
    logger.info('stop_blocked', { cwd: payload.cwd, reason: dsResult.selectedPrompt });
    return { outcome: 'blocked', reason: dsResult.selectedPrompt };
  }

  if (dsResult.outcome === 'clipboard_only') {
    logger.info('stop_clipboard_only', { cwd: payload.cwd });
    return { outcome: 'clipboard_only' };
  }

  logger.info('stop_skipped', { cwd: payload.cwd });
  return { outcome: 'skipped' };
}

// ── CLI entry point ────────────────────────────────────────────────────────────

export function registerStopCommand(program: import('commander').Command): void {
  program
    .command('stop')
    .description('Handle Claude Code Stop hook — show pending decision session UI if present')
    .option('--db <path>', 'Database path', DEFAULT_DB_PATH)
    .action(async (opts: { db: string }) => {
      const raw = await readStdin();
      if (!raw) process.exit(0);

      let payload: StopPayload;
      try {
        payload = JSON.parse(raw) as StopPayload;
      } catch {
        process.exit(0);
        return;
      }

      const store = await openStore(opts.db);
      const logLevel = getConfig(store.db, 'log_level') as LogLevel | undefined;
      initLogger('stop', logLevel);

      try {
        const result = await runStop(payload, store);
        writeHookStats(payload.cwd, result.outcome);

        if (result.outcome === 'blocked') {
          process.stderr.write('\n[nexpath] Prompt sent to Claude\n');
          // sql.js (WASM) keeps the event loop alive after db.close(), so the
          // process never exits naturally. Claude Code's 60-second hook timeout
          // would kill us and discard stdout. Force-exit after the write so the
          // block decision reaches Claude Code on a clean exit.
          closeStore(store);
          process.stdout.write(
            JSON.stringify({ decision: 'block', reason: result.reason }) + '\n',
          );
          process.exit(0);
        }

        if (result.outcome === 'clipboard_only') {
          if (platform === 'win32') {
            process.stderr.write('\n[nexpath] Copied to clipboard — paste and edit in Claude terminal\n');
          }
        }
        // All other outcomes → exit 0 (Claude stops normally)
      } finally {
        closeStore(store);
      }
    });
}
