import OpenAI from 'openai';
import { readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { resolveOpenAIKey, getKeySource } from '../../config/ApiKeyResolver.js';
import type { Store } from '../../store/db.js';
import { openStore, closeStore, DEFAULT_DB_PATH } from '../../store/db.js';
import { classifyPrompt } from '../../classifier/PromptClassifier.js';
import { SessionStateManager } from '../../classifier/SessionStateManager.js';
import { detectAbsenceFlags, ABSENCE_MIN_PROMPTS } from '../../classifier/AbsenceDetector.js';
import { classifyStreamBPresence } from '../../classifier/StreamBPresenceClassifier.js';
import type { StreamBPresenceResult } from '../../classifier/StreamBPresenceClassifier.js';
import { shouldFireStage2, runStage2 } from '../../classifier/Stage2Trigger.js';
import { generatePinchLabel } from '../../decision-session/PinchGenerator.js';
import type { Stage } from '../../classifier/types.js';
import type { FlagType, Stage2TriggerResult } from '../../classifier/Stage2Trigger.js';
import { resolveLanguage } from '../../classifier/LanguageDetector.js';
import { insertPrompt } from '../../store/prompts.js';
import { getConfig } from '../../store/config.js';
import { getProject, upsertProject } from '../../store/projects.js';
import { importHistoricalPrompts } from '../../store/historical-import.js';
import { classifyUserProfileLLM, MIN_PROFILE_PROMPTS } from '../../classifier/LLMProfileClassifier.js';
import { isProfileStale } from '../../classifier/UserProfileClassifier.js';
import { logger, initLogger } from '../../logger.js';
import { extractApiError } from '../../utils/api-error.js';
import type { LogLevel } from '../../logger.js';
import { writeHookStats } from '../../store/hook-stats.js';
import { upsertPendingAdvisory } from '../../store/pending-advisories.js';
import { insertSkippedSession } from '../../store/skipped-sessions.js';
import { writeTelemetry } from '../../telemetry/index.js';
import { resolveFrequencyConfig, type AdvisoryFrequencyLevel } from '../../config/GlobalConfig.js';
import { recentPromptMetadata } from '../../telemetry/recent-prompts.js';

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
  writeTelemetry(input.projectRoot, 'prompt_received', { promptCount: mgr.current.promptCount }, store);

  // ── 1.5. Resolve frequency config and role — used throughout the pipeline ────
  const freq = (
    getConfig(store.db, `advisory_frequency:${input.projectRoot}`) ??
    getConfig(store.db, 'advisory_frequency') ??
    'every_event'
  ) as AdvisoryFrequencyLevel;
  const freqConfig = resolveFrequencyConfig(freq);

  const configuredRole = (
    getConfig(store.db, `role:${input.projectRoot}`) ??
    getConfig(store.db, 'role') ??
    null
  ) as import('../../classifier/types.js').UserRole | null;

  // ── 2. Stage 1 classifier ────────────────────────────────────────────────────
  const classification = await classifyPrompt(input.promptText);
  logger.debug('stage1_result', { classified: classification.stage, confidence: classification.confidence });
  writeTelemetry(input.projectRoot, 'prompt_classified', { stage: classification.stage, confidence: classification.confidence }, store);

  // ── 2.5. LLM profile classification — async, before processPrompt ────────────
  if (isProfileStale(mgr.current.profile, mgr.current.promptCount) &&
      mgr.current.promptHistory.length >= MIN_PROFILE_PROMPTS - 1) {
    const updatedProfile = await classifyUserProfileLLM(
      mgr.current.promptHistory as import('../../classifier/types.js').PromptRecord[],
      mgr.current.promptCount,
      mgr.current.profile,
      openai,
    );
    mgr.setProfile(updatedProfile);
    logger.debug('profile_classified', { nature: updatedProfile.nature, mood: updatedProfile.mood, depth: updatedProfile.depth });
    writeTelemetry(input.projectRoot, 'profile_computed', {
      nature:             updatedProfile.nature,
      mood:               updatedProfile.mood,
      depth:              updatedProfile.depth,
      precisionOrdinal:   updatedProfile.precisionOrdinal,
      playfulnessOrdinal: updatedProfile.playfulnessOrdinal,
      computedAt:         updatedProfile.computedAt,
    }, store);
  }

  // ── 2.7. Inject configured role into profile ────────────────────────────────
  const currentProfileForRole = mgr.current.profile;
  if (currentProfileForRole !== null) {
    mgr.setProfile({ ...currentProfileForRole, role: configuredRole });
  }

  // ── 2.8. Stream B presence classification ────────────────────────────────────
  // Start from prompt 3 — the earliest any Stream B absence threshold can fire.
  let streamBOverrides: StreamBPresenceResult | undefined;
  if (mgr.current.currentStage === 'implementation'
      && mgr.current.promptsInCurrentStage >= 3) {
    streamBOverrides = await classifyStreamBPresence(input.promptText, openai)
      .catch(() => {
        logger.debug('stream_b_presence_failed', { prompt: input.promptText.slice(0, 60) });
        return undefined; // fallback: vibeKeyword detection stands
      });
  }

  // ── 3. Process prompt → updates state (stage, history, counters) ─────────────
  mgr.processPrompt(store, input.promptText, classification, Date.now(),
    freqConfig.minStageChangeConfidence, streamBOverrides);
  logger.debug('after_process', { stage: mgr.current.currentStage, stageConfidence: mgr.current.stageConfidence });

  // ── 3.5. Effective language — read from projects table (detection runs in nexpath stop) ──
  const langOverride  = getConfig(store.db, 'language_override');
  const project       = getProject(store, input.projectRoot);
  const detectedLang  = project?.detectedLanguage ?? undefined;
  const projectType   = project?.projectType ?? undefined;
  const effectiveLang = resolveLanguage(langOverride, detectedLang);
  logger.debug('language', { effectiveLang: effectiveLang ?? null });

  // ── 4. Absence detection ─────────────────────────────────────────────────────
  const newFlags = detectAbsenceFlags(
    mgr.current as import('../../classifier/types.js').SessionState,
    mgr.current.profile,
    projectType,
    freqConfig.signalAbsenceThresholdMultiplier,
    freqConfig.signalAbsenceMinFloor,
  );
  logger.debug('absence_flags', { new: newFlags.length, total: mgr.current.absenceFlags.length });
  writeTelemetry(input.projectRoot, 'absence_flags_detected', {
    newFlagsCount:   newFlags.length,
    totalFlagsCount: mgr.current.absenceFlags.length,
    flagKeys:        newFlags.map((f) => f.signalKey),
  }, store);

  // ── 4.5. Frequency off fast-exit + minimum prompt guard ────────────────────
  if (freq === 'off') {
    writeTelemetry(input.projectRoot, 'advisory_freq_blocked', { freq }, store);
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'freq_off' });
    return { outcome: 'no_action' };
  }
  if (mgr.current.promptCount < freqConfig.minPromptsBeforeAdvisory) {
    writeTelemetry(input.projectRoot, 'advisory_min_prompts_blocked', { promptCount: mgr.current.promptCount, minRequired: freqConfig.minPromptsBeforeAdvisory }, store);
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'min_prompts_not_reached' });
    return { outcome: 'no_action' };
  }

  // ── 5. Should Stage 2 fire? ──────────────────────────────────────────────────
  const triggerResult: Stage2TriggerResult = shouldFireStage2(
    mgr.current as import('../../classifier/types.js').SessionState,
    prevStage,
    newFlags,
    freqConfig.stage2S1LowConfidence,
  );
  logger.debug('should_fire', { trigger: triggerResult?.kind ?? null });

  if (!triggerResult) {
    writeTelemetry(input.projectRoot, 'pipeline_no_action', { reason: 'no_flag' }, store);
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'no_flag' });
    return { outcome: 'no_action' };
  }

  // ── 6. Deduplication — already fired this session? ──────────────────────────
  // For absence: use first qualifying flag as the pre-Stage-2 guard proxy.
  const preCheckFiredKey = triggerResult.kind === 'stage_transition'
    ? buildFiredKey('stage_transition', prevStage, mgr.current.currentStage)
    : buildFiredKey(`absence:${triggerResult.qualifyingFlags[0]!.signalKey}` as FlagType, prevStage, mgr.current.currentStage);
  const alreadyFired = mgr.hasFiredDecisionSession(preCheckFiredKey);
  logger.debug('dedup', { firedKey: preCheckFiredKey, alreadyFired });
  if (alreadyFired) {
    writeTelemetry(input.projectRoot, 'advisory_dedup_blocked', { firedKey: preCheckFiredKey }, store);
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'already_fired', firedKey: preCheckFiredKey });
    return { outcome: 'no_action' };
  }

  // ── 6.5. Advisory frequency gate ────────────────────────────────────────────
  if (freq === 'major_only' && triggerResult.kind !== 'stage_transition') {
    writeTelemetry(input.projectRoot, 'advisory_freq_blocked', { freq, flagType: triggerResult.kind }, store);
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'freq_major_only', flagType: triggerResult.kind });
    return { outcome: 'no_action' };
  }
  if (freq === 'once_per_session' && mgr.current.firedDecisionSessions.length > 0) {
    writeTelemetry(input.projectRoot, 'advisory_freq_blocked', { freq, flagType: triggerResult.kind }, store);
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'freq_once_per_session' });
    return { outcome: 'no_action' };
  }

  // ── 6.6. Post-advisory cooldown — suppress rapid back-to-back advisories ─────
  const lastAdvisory = mgr.current.lastAdvisoryPromptIndex ?? -1;
  if (lastAdvisory >= 0 && mgr.current.promptCount - lastAdvisory < freqConfig.postAdvisoryCooldown) {
    writeTelemetry(input.projectRoot, 'advisory_cooldown_blocked', {
      promptCount:       mgr.current.promptCount,
      lastAdvisoryAt:    lastAdvisory,
      cooldownRemaining: freqConfig.postAdvisoryCooldown - (mgr.current.promptCount - lastAdvisory),
    }, store);
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'post_advisory_cooldown', promptsSinceLast: mgr.current.promptCount - lastAdvisory });
    return { outcome: 'no_action' };
  }

  // ── 6.7. Session advisory cap — profile-aware ceiling ───────────────────────
  const isVibeProfile =
    mgr.current.profile?.nature === 'beginner' ||
    mgr.current.profile?.nature === 'cool_geek';
  const advisoryCap = isVibeProfile
    ? freqConfig.sessionAdvisoryCapVibe
    : freqConfig.sessionAdvisoryCapDefault;
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
    writeTelemetry(input.projectRoot, 'advisory_cap_blocked', { advisoryCount, advisoryCap }, store);
    logger.info('pipeline_outcome', {
      outcome: 'no_action',
      reason:  'session_cap_reached',
      advisoryCount,
      advisoryCap,
    });
    return { outcome: 'no_action' };
  }

  // ── 6.8. Persist newly-detected absence flags — all qualify for Stage 2 consideration ──
  // Guard: Condition 2 only fires when newFlags is non-empty and trigger kind is absence.
  if (triggerResult.kind === 'absence' && newFlags.length > 0) {
    for (const flag of newFlags) {
      mgr.addAbsenceFlag(store, flag);
    }
  }

  // ── 7. Stage 2 LLM cross-confirmation ───────────────────────────────────────
  const stage2Input = {
    state:          mgr.current as import('../../classifier/types.js').SessionState,
    detectedStage:  mgr.current.currentStage,
    confidence:     mgr.current.stageConfidence,
    flagType:       triggerResult.kind as 'stage_transition' | 'absence',
    qualifyingFlags: triggerResult.kind === 'absence' ? triggerResult.qualifyingFlags : undefined,
  };

  let stage2Output: import('../../classifier/Stage2Trigger.js').Stage2Output;
  try {
    stage2Output = await runStage2(stage2Input, openai, {
      minConfidence: freqConfig.stage2MinConfidence,
      contextWindow: freqConfig.stage2ContextWindow,
    });
    logger.debug('stage2_result', { fire: stage2Output.fire_decision_session, confidence: stage2Output.stage_confidence, reason: stage2Output.reason });
    writeTelemetry(input.projectRoot, 'stage2_evaluated', { flagType: triggerResult.kind, confirmed: stage2Output.fire_decision_session }, store);
  } catch (err) {
    logger.warn('stage2_error', { ...extractApiError(err, 'openai'), stage: mgr.current.currentStage });
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'stage2_error' });
    writeTelemetry(input.projectRoot, 'pipeline_no_action', { reason: 'stage2_error' }, store);
    return { outcome: 'no_action' };
  }

  if (!stage2Output.fire_decision_session) {
    writeTelemetry(input.projectRoot, 'pipeline_no_action', { reason: 'stage2_declined' }, store);
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'stage2_declined', stage2Confidence: stage2Output.stage_confidence });
    return { outcome: 'no_action' };
  }

  // ── 7.5. Feed Stage 2 signal assessments back into signal counters ───────────
  mgr.applyStage2SignalUpdates(store, stage2Output.signals_present);

  // ── 8. Compute effective flagType from Stage 2 selection, then mark as fired ─
  const effectiveFlagType: FlagType = triggerResult.kind === 'stage_transition'
    ? 'stage_transition'
    : `absence:${stage2Output.selected_signal_key}`;
  const firedKey = buildFiredKey(effectiveFlagType, prevStage, mgr.current.currentStage);
  mgr.markDecisionSessionFired(store, firedKey);

  // ── 8.5. Read user profile (computed in processPrompt, null if < 5 prompts) ──
  const userProfile = mgr.current.profile ?? undefined;

  // ── 9. Pinch label — option gen runs in stop hook after Claude responds ──────
  const pinchLabel = await generatePinchLabel(
    mgr.current.currentStage,
    effectiveFlagType,
    openai,
    userProfile,
    effectiveLang,
  );

  // ── 10. Store pending advisory — Stop hook will show UI after Claude responds
  upsertPendingAdvisory(store, {
    projectRoot: input.projectRoot,
    stage:       mgr.current.currentStage,
    flagType:    effectiveFlagType,
    pinchLabel,
    sessionId:   mgr.current.sessionId,
    promptCount: mgr.current.promptCount,
    prevStage,
  });
  writeTelemetry(input.projectRoot, 'pipeline_advisory_pending', {
    flagType:                      effectiveFlagType,
    stage:                         mgr.current.currentStage,
    pinchLabel,
    // Item H — session-scoped advisory counter (from session state).
    advisoryCountInSession:        mgr.current.advisoryCount ?? 0,
    // Item J — project-scoped decision-session counter (from projects table).
    decisionSessionCountInProject: getProject(store, input.projectRoot)?.decisionSessionCount ?? 0,
    // Item B — last-5 prompt metadata, PII-safe (no text).
    recentPrompts:                 recentPromptMetadata(mgr.current.promptHistory),
  }, store);
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

      // Resolve OPENAI_API_KEY through the 4-layer chain (env → project .env →
      // OS keychain → 0600 fallback file). The resolver promotes the first
      // valid hit into process.env so downstream OpenAI() constructors pick it
      // up transparently. Order shift from the prior dotenv-with-override
      // behaviour: a pre-set env var now WINS over project .env.
      await resolveOpenAIKey(opts.project);

      const store = await openStore(opts.db);
      // Initialise logger — level from config key, then NEXPATH_LOG_LEVEL env var
      const logLevel = getConfig(store.db, 'log_level') as LogLevel | undefined;
      initLogger('auto', logLevel);

      // Diagnostic: log the source layer that produced the key so a missing
      // key (Stage-2 failure) can be traced to the actual fallback chain.
      const keySource = await getKeySource(opts.project);
      const keyFound  = !!process.env['OPENAI_API_KEY'];
      logger.debug('env_load', {
        cwd:       process.cwd(),
        project:   opts.project,
        keySource,
        keyFound,
      });

      // Surface a single visible warn line when no source produced a key. We
      // do NOT exit here — Stage-1-only hook calls (prompt capture, blocking
      // gates, low-confidence classifications) don't need the key and should
      // still run. Stage-2 paths surface a richer OpenAI error if they fire.
      if (!keyFound) {
        logger.warn('openai_api_key_missing', {
          project:    opts.project,
          actionable: 'Set OPENAI_API_KEY in the shell, in the project\'s .env file, or via the OS keychain — Stage 2 calls will fail until a key is configured.',
        });
      }

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
