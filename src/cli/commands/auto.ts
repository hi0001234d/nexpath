import OpenAI from 'openai';
import type { Store } from '../../store/db.js';
import { openStore, closeStore, DEFAULT_DB_PATH } from '../../store/db.js';
import { classifyPrompt } from '../../classifier/PromptClassifier.js';
import { SessionStateManager } from '../../classifier/SessionStateManager.js';
import { detectAbsenceFlags } from '../../classifier/AbsenceDetector.js';
import { shouldFireStage2, runStage2 } from '../../classifier/Stage2Trigger.js';
import { generatePinchLabel } from '../../decision-session/PinchGenerator.js';
import { runDecisionSession } from '../../decision-session/DecisionSession.js';
import type { SelectFn } from '../../decision-session/DecisionSession.js';
import type { Stage } from '../../classifier/types.js';
import type { FlagType } from '../../classifier/Stage2Trigger.js';

/**
 * nexpath auto — orchestration command (per decision-session-ux-research.md).
 *
 * Wires the full pipeline for between-prompt advisory checks:
 *
 *   1. Stage 1 classifier (keyword → TF-IDF → optional MiniLM)
 *   2. Absence flag detection
 *   3. shouldFireStage2 decision
 *   4. Stage 2 LLM cross-confirmation (gpt-4o-mini)
 *   5. Pinch label generation (gpt-4o-mini, separate call)
 *   6. Decision session UI (@clack/prompts, 3-level cascade)
 *
 * Advisory frequency enforcement:
 *   - Once per stage transition event per session (firedDecisionSessions)
 *   - Never re-fires the same event in the same session
 *
 * Called between agent responses before the user types their next prompt.
 * If no action is needed, returns silently in < 50ms with no output.
 */

// ── Fired-event key helpers ────────────────────────────────────────────────────

/**
 * Build the deduplication key stored in firedDecisionSessions.
 *   stage_transition → 'stage_transition:<prev>→<next>'
 *   absence          → 'absence:<signalKey>@<stage>'
 */
export function buildFiredKey(flagType: FlagType, currentStage: Stage): string {
  if (flagType === 'stage_transition') {
    return `stage_transition:→${currentStage}`;
  }
  return `${flagType}@${currentStage}`;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AutoInput {
  /** Latest prompt text to classify. */
  promptText:  string;
  /** Project root — used to look up session state. */
  projectRoot: string;
}

export type AutoOutcome =
  | { outcome: 'no_action' }
  | { outcome: 'selected';  selectedPrompt: string }
  | { outcome: 'skipped' };

// ── Core orchestration ─────────────────────────────────────────────────────────

/**
 * Run the full nexpath auto pipeline.
 *
 * @param input      Prompt text + project root
 * @param store      Open SQLite store (caller manages lifecycle)
 * @param openai     Optional OpenAI client (injectable for testing)
 * @param selectFn   Optional @clack/prompts select replacement (injectable for testing)
 * @returns AutoOutcome — what the pipeline decided and did
 */
export async function runAuto(
  input:     AutoInput,
  store:     Store,
  openai?:   OpenAI,
  selectFn?: SelectFn,
): Promise<AutoOutcome> {
  // ── 1. Load session state ────────────────────────────────────────────────────
  const mgr = SessionStateManager.load(store, input.projectRoot);
  const prevStage: Stage = mgr.current.currentStage;

  // ── 2. Stage 1 classifier ────────────────────────────────────────────────────
  const classification = await classifyPrompt(input.promptText);

  // ── 3. Process prompt → updates state (stage, history, counters) ─────────────
  mgr.processPrompt(store, input.promptText, classification);

  // ── 4. Absence detection ─────────────────────────────────────────────────────
  const newFlags = detectAbsenceFlags(mgr.current as import('../../classifier/types.js').SessionState);
  for (const flag of newFlags) {
    mgr.addAbsenceFlag(store, flag);
  }

  // ── 5. Should Stage 2 fire? ──────────────────────────────────────────────────
  const flagType = shouldFireStage2(
    mgr.current as import('../../classifier/types.js').SessionState,
    prevStage,
    newFlags,
  );

  if (!flagType) return { outcome: 'no_action' };

  // ── 6. Deduplication — already fired this session? ──────────────────────────
  const firedKey = buildFiredKey(flagType, mgr.current.currentStage);
  if (mgr.hasFiredDecisionSession(firedKey)) {
    return { outcome: 'no_action' };
  }

  // ── 7. Stage 2 LLM cross-confirmation ───────────────────────────────────────
  const stage2Input = {
    state:         mgr.current as import('../../classifier/types.js').SessionState,
    detectedStage: mgr.current.currentStage,
    confidence:    mgr.current.stageConfidence,
    flagType,
  };

  let stage2Output: import('../../classifier/Stage2Trigger.js').Stage2Output;
  try {
    stage2Output = await runStage2(stage2Input, openai);
  } catch {
    // Stage 2 API failure → skip silently (non-blocking)
    return { outcome: 'no_action' };
  }

  if (!stage2Output.fire_decision_session) {
    return { outcome: 'no_action' };
  }

  // ── 8. Mark as fired (before rendering — prevents re-entry on restart) ───────
  mgr.markDecisionSessionFired(store, firedKey);

  // ── 9. Pinch label generation ────────────────────────────────────────────────
  const pinchLabel = await generatePinchLabel(
    mgr.current.currentStage,
    flagType,
    openai,
  );

  // ── 10. Decision session UI ──────────────────────────────────────────────────
  const dsResult = await runDecisionSession(
    {
      stage:       mgr.current.currentStage,
      flagType,
      pinchLabel,
      sessionId:   mgr.current.sessionId,
      projectRoot: input.projectRoot,
      promptCount: mgr.current.promptCount,
    },
    store,
    selectFn,
  );

  if (dsResult.outcome === 'selected') {
    return { outcome: 'selected', selectedPrompt: dsResult.selectedPrompt };
  }

  return { outcome: 'skipped' };
}

// ── CLI entry point ────────────────────────────────────────────────────────────

/**
 * Read all data from stdin (non-TTY).  Returns '' if stdin is a TTY or empty.
 * Used in hook mode to receive the Claude Code JSON payload.
 */
export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
    process.stdin.on('error', () => resolve(''));
    // Safety timeout — stdin closes in <100ms in normal hook operation.
    // If it never closes (misbehaving environment), fail fast after 5 s.
    setTimeout(() => resolve(data.trim()), 5000);
  });
}

/**
 * Register `nexpath auto` with the given Commander program.
 *
 * Usage:
 *   nexpath auto --project /path/to/project "The latest prompt text"
 *
 * Hook mode (Claude Code UserPromptSubmit):
 *   The command reads the prompt from the JSON payload on stdin when no
 *   positional argument is provided.  The project root defaults to CWD,
 *   which Claude Code sets to the project directory for hooks.
 *
 *   When a prompt is selected in hook mode the output is a JSON object
 *   using the Claude Code `additionalContext` format so the guidance is
 *   injected into the conversation automatically.
 *
 * If skipped or no action: exits silently.
 */
export function registerAutoCommand(program: import('commander').Command): void {
  program
    .command('auto')
    .description('Run the nexpath advisory pipeline between agent responses')
    .option('-p, --project <path>', 'Project root path', process.cwd())
    .option('--db <path>', 'Database path', DEFAULT_DB_PATH)
    .argument('[prompt]', 'The latest prompt text (omit to read from stdin in hook mode)')
    .action(async (promptArg: string | undefined, opts: { project: string; db: string }) => {
      let promptText = promptArg?.trim();
      let hookMode   = false;

      if (!promptText) {
        // Hook mode: read JSON payload from stdin (Claude Code UserPromptSubmit)
        const raw = await readStdin();
        if (raw) {
          try {
            const payload = JSON.parse(raw) as { prompt?: string };
            promptText = payload.prompt?.trim();
            hookMode   = true;
          } catch {
            // Not valid JSON — fall through to the error below
          }
        }
      }

      if (!promptText) {
        process.stderr.write('nexpath auto: prompt text is required\n');
        process.exit(1);
      }

      const store = await openStore(opts.db);
      try {
        const result = await runAuto(
          { promptText, projectRoot: opts.project },
          store,
        );

        if (result.outcome === 'selected') {
          if (hookMode) {
            // Claude Code hook output format — injected as additionalContext
            process.stdout.write(JSON.stringify({
              hookSpecificOutput: {
                hookEventName:     'UserPromptSubmit',
                additionalContext: result.selectedPrompt,
              },
            }) + '\n');
          } else {
            process.stdout.write(result.selectedPrompt + '\n');
          }
        }
        // 'no_action' and 'skipped' → exit silently
      } finally {
        closeStore(store);
      }
    });
}
