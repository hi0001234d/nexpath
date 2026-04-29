import OpenAI from 'openai';
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import type { Store } from '../../store/db.js';
import { openStore, closeStore, DEFAULT_DB_PATH } from '../../store/db.js';
import { classifyPrompt } from '../../classifier/PromptClassifier.js';
import { SessionStateManager } from '../../classifier/SessionStateManager.js';
import { detectAbsenceFlags } from '../../classifier/AbsenceDetector.js';
import { shouldFireStage2, runStage2 } from '../../classifier/Stage2Trigger.js';
import { generatePinchLabel } from '../../decision-session/PinchGenerator.js';
import { generateOptionList } from '../../decision-session/OptionGenerator.js';
import { resolveDecisionContent } from '../../decision-session/options.js';
import type { Stage } from '../../classifier/types.js';
import type { FlagType } from '../../classifier/Stage2Trigger.js';
import { resolveLanguage } from '../../classifier/LanguageDetector.js';
import { insertPrompt } from '../../store/prompts.js';
import { getConfig } from '../../store/config.js';
import { getProject, upsertProject } from '../../store/projects.js';
import { importHistoricalPrompts } from '../../store/historical-import.js';
import { logger, initLogger } from '../../logger.js';
import { extractApiError } from '../../utils/api-error.js';
import type { LogLevel } from '../../logger.js';
import { writeHookStats } from '../../store/hook-stats.js';
import { upsertPendingAdvisory } from '../../store/pending-advisories.js';
import { insertSkippedSession } from '../../store/skipped-sessions.js';

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

const MIN_PROMPTS_BEFORE_ADVISORY = 3;
/** Prompts to suppress after any advisory fires — prevents rapid back-to-back advisories. */
const POST_ADVISORY_COOLDOWN = 5;

function resolveProjectName(projectRoot: string): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(projectRoot, 'package.json'), 'utf8'),
    ) as { name?: unknown };
    if (typeof pkg.name === 'string' && pkg.name.trim()) return pkg.name.trim();
  } catch { /* fall through */ }
  return basename(projectRoot);
}

// ── Fired-event key helpers ────────────────────────────────────────────────────

/**
 * Build the deduplication key stored in firedDecisionSessions.
 *   stage_transition → 'stage_transition:<prev>→<next>'
 *   absence          → 'absence:<signalKey>@<stage>'
 */
export function buildFiredKey(flagType: FlagType, prevStage: Stage, currentStage: Stage): string {
  if (flagType === 'stage_transition') {
    return `stage_transition:${prevStage}→${currentStage}`;
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
  | { outcome: 'pending' };

// ── Core orchestration ─────────────────────────────────────────────────────────

/**
 * Run the full nexpath auto pipeline.
 *
 * @param input    Prompt text + project root
 * @param store    Open SQLite store (caller manages lifecycle)
 * @param openai   Optional OpenAI client (injectable for testing)
 * @returns AutoOutcome — what the pipeline decided and did
 */
export async function runAuto(
  input:   AutoInput,
  store:   Store,
  openai?: OpenAI,
): Promise<AutoOutcome> {
  // ── -1. Advisory-injected prompt guard ──────────────────────────────────────
  // When the stop hook injects an advisory option as a new Claude turn (block decision),
  // Claude Code fires UserPromptSubmit with that option text — it arrives here like any
  // real user prompt.  We must skip ALL processing: the text is synthetic and would
  // corrupt signals, stage confidence, user profile, mood, and can re-fire an advisory.
  //
  // The field is always cleared (match or no match) so a cancelled injection cannot
  // leave stale state that silently skips the next genuine user prompt.
  {
    const guardMgr = SessionStateManager.load(store, input.projectRoot);
    const injectedText = guardMgr.current.lastInjectedPrompt ?? null;
    if (injectedText !== null) {
      guardMgr.clearInjectedPrompt(store);
      if (injectedText === input.promptText) {
        logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'advisory_injected' });
        return { outcome: 'no_action' };
      }
    }
  }

  // ── 0.0. Implicit project registration (Issue 6) ─────────────────────────────
  if (!getProject(store, input.projectRoot)) {
    const name = resolveProjectName(input.projectRoot);
    upsertProject(store, { projectRoot: input.projectRoot, name });
    await importHistoricalPrompts(store, input.projectRoot);
  }

  // ── 0. Persist prompt text — runs before classifier so prompt is stored even if pipeline errors ──
  insertPrompt(store, { projectRoot: input.projectRoot, promptText: input.promptText, agent: 'claude-code' });

  // ── 1. Load session state ────────────────────────────────────────────────────
  const mgr = SessionStateManager.load(store, input.projectRoot);
  const prevStage: Stage = mgr.current.currentStage;
  logger.debug('session_loaded', { promptCount: mgr.current.promptCount, stage: prevStage, project: input.projectRoot });

  // ── 2. Stage 1 classifier ────────────────────────────────────────────────────
  const classification = await classifyPrompt(input.promptText);
  logger.debug('stage1_result', { classified: classification.stage, confidence: classification.confidence });

  // ── 3. Process prompt → updates state (stage, history, counters) ─────────────
  mgr.processPrompt(store, input.promptText, classification);
  logger.debug('after_process', { stage: mgr.current.currentStage, stageConfidence: mgr.current.stageConfidence });

  // ── 3.5. Effective language — read from projects table (detection runs in nexpath stop) ──
  const langOverride  = getConfig(store.db, 'language_override');
  const detectedLang  = getProject(store, input.projectRoot)?.detectedLanguage ?? undefined;
  const effectiveLang = resolveLanguage(langOverride, detectedLang);
  logger.debug('language', { effectiveLang: effectiveLang ?? null });

  // ── 4. Absence detection ─────────────────────────────────────────────────────
  const newFlags = detectAbsenceFlags(
    mgr.current as import('../../classifier/types.js').SessionState,
    mgr.current.profile,
  );
  for (const flag of newFlags) {
    mgr.addAbsenceFlag(store, flag);
  }
  logger.debug('absence_flags', { new: newFlags.length, total: mgr.current.absenceFlags.length });

  // ── 4.5. Minimum prompt guard ────────────────────────────────────────────────
  if (mgr.current.promptCount < MIN_PROMPTS_BEFORE_ADVISORY) {
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'min_prompts_not_reached' });
    return { outcome: 'no_action' };
  }

  // ── 5. Should Stage 2 fire? ──────────────────────────────────────────────────
  const flagType = shouldFireStage2(
    mgr.current as import('../../classifier/types.js').SessionState,
    prevStage,
    newFlags,
  );
  logger.debug('should_fire', { flagType: flagType ?? null });

  if (!flagType) {
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'no_flag' });
    return { outcome: 'no_action' };
  }

  // ── 6. Deduplication — already fired this session? ──────────────────────────
  const firedKey     = buildFiredKey(flagType, prevStage, mgr.current.currentStage);
  const alreadyFired = mgr.hasFiredDecisionSession(firedKey);
  logger.debug('dedup', { firedKey, alreadyFired });
  if (alreadyFired) {
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'already_fired', firedKey });
    return { outcome: 'no_action' };
  }

  // ── 6.5. Advisory frequency gate ────────────────────────────────────────────
  const freq =
    getConfig(store.db, `advisory_frequency:${input.projectRoot}`) ??
    getConfig(store.db, 'advisory_frequency') ??
    'every_event';

  if (freq === 'off') {
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'freq_off' });
    return { outcome: 'no_action' };
  }
  if (freq === 'major_only' && flagType !== 'stage_transition') {
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'freq_major_only', flagType });
    return { outcome: 'no_action' };
  }
  if (freq === 'once_per_session' && mgr.current.firedDecisionSessions.length > 0) {
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'freq_once_per_session' });
    return { outcome: 'no_action' };
  }

  // ── 6.6. Post-advisory cooldown — suppress rapid back-to-back advisories ─────
  const lastAdvisory = mgr.current.lastAdvisoryPromptIndex ?? -1;
  if (lastAdvisory >= 0 && mgr.current.promptCount - lastAdvisory < POST_ADVISORY_COOLDOWN) {
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'post_advisory_cooldown', promptsSinceLast: mgr.current.promptCount - lastAdvisory });
    return { outcome: 'no_action' };
  }

  // ── 6.7. Session advisory cap — profile-aware ceiling ───────────────────────
  const isVibeProfile =
    mgr.current.profile?.nature === 'beginner' ||
    mgr.current.profile?.nature === 'cool_geek';
  const advisoryCap   = isVibeProfile ? 10 : 5;
  const advisoryCount = mgr.current.advisoryCount ?? 0;
  if (advisoryCount >= advisoryCap) {
    insertSkippedSession(store, {
      projectRoot:          input.projectRoot,
      sessionId:            mgr.current.sessionId,
      flagType:             'session_cap_reached',
      stage:                mgr.current.currentStage,
      levelReached:         0,
      skippedAtPromptCount: mgr.current.promptCount,
    });
    logger.info('pipeline_outcome', {
      outcome: 'no_action',
      reason:  'session_cap_reached',
      advisoryCount,
      advisoryCap,
    });
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
    logger.debug('stage2_result', { fire: stage2Output.fire_decision_session, confidence: stage2Output.stage_confidence, reason: stage2Output.reason });
  } catch (err) {
    logger.warn('stage2_error', { ...extractApiError(err, 'openai'), stage: mgr.current.currentStage });
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'stage2_error' });
    // Stage 2 API failure → skip silently (non-blocking)
    return { outcome: 'no_action' };
  }

  if (!stage2Output.fire_decision_session) {
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'stage2_declined', stage2Confidence: stage2Output.stage_confidence });
    return { outcome: 'no_action' };
  }

  // ── 8. Mark as fired (before storing — prevents re-entry on restart) ────────
  mgr.markDecisionSessionFired(store, firedKey);

  // ── 8.5. Read user profile (computed in processPrompt, null if < 5 prompts) ──
  const userProfile = mgr.current.profile ?? undefined;

  // ── 9. Pinch label + option text — run concurrently ─────────────────────────
  const decisionContent = resolveDecisionContent(mgr.current.currentStage, flagType);

  const [pinchLabel, generatedOptions] = await Promise.all([
    generatePinchLabel(
      mgr.current.currentStage,
      flagType,
      openai,
      userProfile,
      effectiveLang,
    ),
    generateOptionList(
      decisionContent,
      userProfile,
      effectiveLang,
      mgr.current.promptHistory as import('../../classifier/types.js').PromptRecord[],
      openai,
    ),
  ]);

  // ── 10. Store pending advisory — Stop hook will show UI after Claude responds
  upsertPendingAdvisory(store, {
    projectRoot: input.projectRoot,
    stage:       mgr.current.currentStage,
    flagType,
    pinchLabel,
    sessionId:   mgr.current.sessionId,
    promptCount: mgr.current.promptCount,
    generatedL1: generatedOptions?.l1,
    generatedL2: generatedOptions?.l2,
    generatedL3: generatedOptions?.l3,
  });
  mgr.markAdvisoryFired(store);

  logger.info('pipeline_outcome', { outcome: 'pending', pinchLabel });
  return { outcome: 'pending' };
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

      if (!promptText) {
        // Hook mode: read JSON payload from stdin (Claude Code UserPromptSubmit)
        const raw = await readStdin();
        if (raw) {
          try {
            const payload = JSON.parse(raw) as { prompt?: string };
            promptText = payload.prompt?.trim();
          } catch {
            // Not valid JSON — fall through to the error below
          }
        }
      }

      if (!promptText) {
        process.stderr.write('nexpath auto: prompt text is required\n');
        process.exit(1);
      }

      // Load project .env so OPENAI_API_KEY is available for Stage 2 calls.
      // Uses override:true so the project key always wins over any ambient env var.
      const envPath = join(opts.project, '.env');
      loadDotenv({ path: envPath, override: true });

      const store = await openStore(opts.db);
      // Initialise logger — level from config key, then NEXPATH_LOG_LEVEL env var
      const logLevel = getConfig(store.db, 'log_level') as LogLevel | undefined;
      initLogger('auto', logLevel);

      // Diagnostic: log env resolution details so CWD mismatches are visible in the log
      // instead of silently producing a missing-credentials error in Stage 2.
      logger.debug('env_load', {
        cwd:      process.cwd(),
        project:  opts.project,
        envPath,
        envExists: existsSync(envPath),
        keyFound:  !!process.env['OPENAI_API_KEY'],
      });

      try {
        const result = await runAuto(
          { promptText, projectRoot: opts.project },
          store,
        );

        writeHookStats(opts.project, result.outcome);
        // 'no_action' and 'pending' → exit silently (Stop hook handles UI)
      } finally {
        closeStore(store);
      }
    });
}
