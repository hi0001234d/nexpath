import OpenAI from 'openai';
import { readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { resolveOpenAIKey, getKeySource } from '../../config/ApiKeyResolver.js';
import type { Store } from '../../store/db.js';
import { openStore, closeStore, DEFAULT_DB_PATH } from '../../store/db.js';
import { classifyStage } from '../../classifier/stage-classifier.js';
import { SessionStateManager } from '../../classifier/SessionStateManager.js';
import { detectAbsenceFlags, ABSENCE_MIN_PROMPTS } from '../../classifier/AbsenceDetector.js';
import { buildRuntimeContext } from '../../classifier/runtime-context.js';
import { ACTIVE_AGENT_ID } from '../../env/agent-capabilities.js';
import { recordEnvTrajectory } from '../../env/env-trajectory.js';
import { recordTranscriptCorroboration } from '../../telemetry/transcript-corroboration.js';
import { classifyStreamBPresence } from '../../classifier/StreamBPresenceClassifier.js';
import type { StreamBPresenceResult } from '../../classifier/StreamBPresenceClassifier.js';
import { shouldFireStage2 } from '../../classifier/Stage2Trigger.js';
import { generatePinchLabel } from '../../decision-session/PinchGenerator.js';
import { pinchSignalTypeForFlag } from '../../decision-session/content-template-source.js';
import { isInjectedPromptEcho } from '../../decision-session/whydesc-delivery.js';
import { selectionRegister } from '../../decision-session/selection-registry.js';
import { resolvePinchFields } from '../../decision-session/signal-pinch-fields.js';
import type { Stage } from '../../classifier/types.js';
import type { FlagType, Stage2TriggerResult } from '../../core/stage2.js';
import { resolveLanguage } from '../../classifier/LanguageDetector.js';
import { insertPrompt } from '../../store/prompts.js';
import { getConfig } from '../../store/config.js';
import { getProject, upsertProject } from '../../store/projects.js';
import { importHistoricalPrompts } from '../../store/historical-import.js';
import { classifyUserProfileLLM, MIN_PROFILE_PROMPTS } from '../../core/classifier/LLMProfileClassifier.js';
import { isProfileStale } from '../../classifier/UserProfileClassifier.js';
import { OpenAILLMAdapter } from '../adapters/llm.adapter.js';
import { loggerAdapter } from '../adapters/log.adapter.js';
import { logger, initLogger } from '../../logger.js';
import type { LogLevel } from '../../logger.js';
import { writeHookStats } from '../../store/hook-stats.js';
import { upsertPendingAdvisory } from '../../store/pending-advisories.js';
import { insertSkippedSession } from '../../store/skipped-sessions.js';
import { recordActivity } from '../../store/feedback-cadence.js';
import { writeTelemetry } from '../../telemetry/index.js';
import { triggerOpportunisticSync } from '../../telemetry/OpportunisticSync.js';
import { resolveFrequencyConfig, type AdvisoryFrequencyLevel } from '../../config/GlobalConfig.js';
import { recentPromptMetadata } from '../../telemetry/recent-prompts.js';

/**
 * nexpath auto — orchestration command (per decision-session-ux-research.md).
 *
 * Wires the full pipeline for between-prompt advisory checks:
 *
 *   1. Stage classifier — one gpt-4o-mini call per prompt (folds the former
 *      keyword/TF-IDF cascade + the cross-confirmation into a single classification)
 *   2. Absence flag detection
 *   3. shouldFireStage2 decision (deterministic trigger)
 *   4. Fire cross-confirmation — from the classifier's own fire assessment (no extra call)
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
  /**
   * The coding-agent's current permission mode, when the hook payload reports it.
   * Undefined when unavailable (CLI-argument mode, or an agent/version that does not
   * send it). Threaded onto session state and read by the runtime context.
   */
  currentAgentMode?: string;
  /**
   * Path to the agent's session transcript, when the hook payload reports it.
   * Read to corroborate practice claims against the agent's actual behaviour;
   * undefined when unavailable (CLI-argument mode, or an agent that does not
   * send it) — corroboration is then skipped.
   */
  transcriptPath?: string;
}

/** Parsed shape of the UserPromptSubmit hook stdin payload. */
export interface AutoHookPayload {
  promptText?:      string;
  currentAgentMode?: string;
  transcriptPath?:  string;
}

/**
 * Parse the JSON payload the coding-agent hook writes to stdin.
 *
 * Captures the prompt text, the reported permission mode, and the session
 * transcript path. The mode vocabulary evolves across agent versions, so an
 * unrecognised value is passed through verbatim — it is never checked against
 * a fixed list here. A missing field or malformed JSON yields an empty result
 * (the caller then treats that input as absent).
 */
export function parseAutoHookPayload(raw: string): AutoHookPayload {
  try {
    const payload = JSON.parse(raw) as { prompt?: string; permission_mode?: string; transcript_path?: string };
    return {
      promptText:       payload.prompt?.trim(),
      currentAgentMode: typeof payload.permission_mode === 'string' ? payload.permission_mode : undefined,
      transcriptPath:
        typeof payload.transcript_path === 'string' && payload.transcript_path.length > 0
          ? payload.transcript_path
          : undefined,
    };
  } catch {
    return {};
  }
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
  // ── Adapters — wire platform-specific deps to core port interfaces ───────────
  const llmAdapter = new OpenAILLMAdapter(openai);

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
      // Robust echo match (not exact ===): the delivered prompt may be option + why-desc
      // (multi-line) and the agent can reformat it, so recognise it by normalized / option-prefix.
      if (isInjectedPromptEcho(injectedText, input.promptText)) {
        logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'advisory_injected' });
        return { outcome: 'no_action' };
      }
    }
  }

  // ── -0.5. Record active usage — one heartbeat per genuine user prompt,
  //          accumulated globally (feeds the feedback popup cadence). Runs after
  //          the advisory-injected guard so synthetic prompts do not count.
  recordActivity(store);

  // ── 0.0. Implicit project registration (Issue 6) ─────────────────────────────
  if (!getProject(store, input.projectRoot)) {
    const name = resolveProjectName(input.projectRoot);
    upsertProject(store, { projectRoot: input.projectRoot, name });
    await importHistoricalPrompts(store, input.projectRoot);
  }

  // ── 0. Persist prompt text — runs before classifier so prompt is stored even if pipeline errors ──
  insertPrompt(store, { projectRoot: input.projectRoot, promptText: input.promptText, agent: ACTIVE_AGENT_ID });

  // ── 1. Load session state ────────────────────────────────────────────────────
  const mgr = SessionStateManager.load(store, input.projectRoot);
  // Record the coding-agent's current mode (when the hook reported it) before the
  // pipeline builds its runtime context; persisted by processPrompt below.
  mgr.setAgentMode(input.currentAgentMode);

  // Once per session (first prompt): record the dev-environment trajectory — probe the project's
  // env facts, and emit a flap-damped change event if a fact moved since the last confirmed probe
  // (e.g. version control added). Consent-gated + best-effort; never blocks the pipeline.
  if (mgr.current.promptCount === 0) {
    try {
      recordEnvTrajectory(store, input.projectRoot, {
        sessionId:       mgr.current.sessionId,
        promptIndex:     mgr.current.promptCount,
        stage:           mgr.current.currentStage,
        stageConfidence: mgr.current.stageConfidence,
      });
    } catch { /* trajectory recording is non-fatal */ }
  }
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
  ) as import('../../core/classifier/types.js').UserRole | null;

  // ── 2. LLM profile classification — runs before the stage classifier so the classifier
  //       calibrates on the freshly-computed profile ──────────────────────────────
  if (isProfileStale(mgr.current.profile, mgr.current.promptCount) &&
      mgr.current.promptHistory.length >= MIN_PROFILE_PROMPTS - 1) {
    const updatedProfile = await classifyUserProfileLLM(
      mgr.current.promptHistory as import('../../core/classifier/types.js').PromptRecord[],
      mgr.current.promptCount,
      mgr.current.profile,
      llmAdapter,
      loggerAdapter,
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

  // ── 2.9. Stage classifier — one LLM call (after profile + Stream-B, so it calibrates on the
  //        fresh profile); folds the former cascade + cross-confirmation. Its stage feeds processPrompt. ──
  const stageResult = await classifyStage(
    {
      promptText:        input.promptText,
      window:            [...mgr.current.promptHistory.map((p) => ({ text: p.text })), { text: input.promptText }],
      sessionStage:      prevStage,
      sessionConfidence: mgr.current.stageConfidence,
      profile:           mgr.current.profile,
    },
    openai,
    { minConfidence: freqConfig.stage2MinConfidence, contextWindow: freqConfig.stage2ContextWindow },
  );
  const classification = stageResult.classification;
  logger.debug('stage_classified', { stage: classification.stage, confidence: classification.confidence, fire: stageResult.fireRecommendation, degraded: stageResult.degraded });
  writeTelemetry(input.projectRoot, 'prompt_classified', { stage: classification.stage, confidence: classification.confidence }, store);

  // ── 3. Process prompt → updates state (stage, history, counters) ─────────────
  mgr.processPrompt(store, input.promptText, classification, Date.now(),
    freqConfig.minStageChangeConfidence, streamBOverrides);
  logger.debug('after_process', { stage: mgr.current.currentStage, stageConfidence: mgr.current.stageConfidence });

  // Corroborate practice claims against the agent's ACTUAL behaviour: read the
  // transcript entries appended since the previous hook and credit verified
  // behaviour (a test file written, the suite run) to the prompt the agent was
  // responding to. Rides prompt-capture consent (same hook payload as the
  // permission mode); best-effort — never blocks the pipeline. The prompt just
  // processed has index promptCount - 1 (processPrompt increments the count).
  if (input.transcriptPath) {
    try {
      recordTranscriptCorroboration(store, input.projectRoot, input.transcriptPath, {
        sessionId:       mgr.current.sessionId,
        promptIndex:     mgr.current.promptCount - 1,
        stage:           mgr.current.currentStage,
        stageConfidence: mgr.current.stageConfidence,
      });
    } catch { /* corroboration is non-fatal */ }
  }

  // ── 3.5. Effective language — read from projects table (detection runs in nexpath stop) ──
  const langOverride  = getConfig(store.db, 'language_override');
  const project       = getProject(store, input.projectRoot);
  const detectedLang  = project?.detectedLanguage ?? undefined;
  const projectType   = project?.projectType ?? undefined;
  const effectiveLang = resolveLanguage(langOverride, detectedLang);
  logger.debug('language', { effectiveLang: effectiveLang ?? null });

  // ── 4. Absence detection ─────────────────────────────────────────────────────
  const newFlags = detectAbsenceFlags(
    mgr.current as import('../../core/classifier/types.js').SessionState,
    mgr.current.profile,
    projectType,
    freqConfig.signalAbsenceThresholdMultiplier,
    freqConfig.signalAbsenceMinFloor,
    buildRuntimeContext(mgr.current as import('../../classifier/types.js').SessionState),
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
    mgr.current as import('../../core/classifier/types.js').SessionState,
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

  // ── 6.8. Persist newly-detected absence flags — all qualify for the fire consideration ──
  // Guard: Condition 2 only fires when newFlags is non-empty and trigger kind is absence.
  if (triggerResult.kind === 'absence' && newFlags.length > 0) {
    for (const flag of newFlags) {
      mgr.addAbsenceFlag(store, flag);
    }
  }

  // ── 7. Fire cross-confirmation — from the stage classifier's assessment (computed above) ──
  // The single classifier call already produced a per-signal assessment + a fire
  // recommendation for this prompt; combine it with the deterministic trigger. A
  // degraded classifier never recommends firing, so a model outage cleanly yields no
  // advisory (the stage still classifies locally, so session tracking continues).
  writeTelemetry(input.projectRoot, 'classifier_fire_evaluated', { flagType: triggerResult.kind, confirmed: stageResult.fireRecommendation }, store);
  if (!stageResult.fireRecommendation) {
    writeTelemetry(input.projectRoot, 'pipeline_no_action', { reason: 'classifier_declined' }, store);
    logger.info('pipeline_outcome', { outcome: 'no_action', reason: 'classifier_declined', confidence: stageResult.classification.confidence, degraded: stageResult.degraded });
    return { outcome: 'no_action' };
  }

  // ── 7.5. Feed the classifier's signal assessments back into signal counters ──
  mgr.applyStage2SignalUpdates(store, stageResult.signalsPresent);

  // ── 8. Compute effective flagType from the classifier's selection, then mark fired ─
  // For an absence trigger, use the classifier's selected signal when it is one of the
  // qualifying flags; else fall back to the first qualifying flag (deterministic).
  let effectiveFlagType: FlagType;
  if (triggerResult.kind === 'stage_transition') {
    effectiveFlagType = 'stage_transition';
  } else {
    const qualifyingKeys = new Set(triggerResult.qualifyingFlags.map((f) => f.signalKey));
    const selectedKey = qualifyingKeys.has(stageResult.selectedSignalKey)
      ? stageResult.selectedSignalKey
      : triggerResult.qualifyingFlags[0]!.signalKey;
    effectiveFlagType = `absence:${selectedKey}`;
  }
  const firedKey = buildFiredKey(effectiveFlagType, prevStage, mgr.current.currentStage);
  mgr.markDecisionSessionFired(store, firedKey);

  // ── 8.5. Read user profile (computed in processPrompt, null if < 5 prompts) ──
  const userProfile = mgr.current.profile ?? undefined;

  // ── 9. Pinch label — option gen runs in stop hook after Claude responds ──────
  // Seed the pinch header (+ its failure fallback) from the register-keyed pinch-fields map — the
  // migrated question/pinchFallback layer that supersedes the static DecisionContent for every signal.
  const pinchSignalType = pinchSignalTypeForFlag(effectiveFlagType, mgr.current.currentStage);
  const pinchOverrides = pinchSignalType
    ? resolvePinchFields(pinchSignalType, selectionRegister(userProfile?.nature))
    : undefined;
  const pinchLabel = await generatePinchLabel(
    mgr.current.currentStage,
    effectiveFlagType,
    openai,
    userProfile,
    effectiveLang,
    pinchOverrides,
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
      let currentAgentMode: string | undefined;
      let transcriptPath: string | undefined;

      if (!promptText) {
        // Hook mode: read JSON payload from stdin (Claude Code UserPromptSubmit)
        const raw = await readStdin();
        if (raw) {
          const parsed = parseAutoHookPayload(raw);
          promptText       = parsed.promptText;
          currentAgentMode = parsed.currentAgentMode;
          transcriptPath   = parsed.transcriptPath;
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
      // key (now a classifier degrade to local detection) can be traced to the fallback chain.
      const keySource = await getKeySource(opts.project);
      const keyFound  = !!process.env['OPENAI_API_KEY'];
      logger.debug('env_load', {
        cwd:       process.cwd(),
        project:   opts.project,
        keySource,
        keyFound,
      });

      // Surface a single visible warn line when no source produced a key. We do
      // NOT exit here — the pipeline still runs: prompt capture and the blocking
      // gates need no key, and the stage classifier degrades to the local
      // keyword/TF-IDF classifier when the key is missing (no advisory fires).
      if (!keyFound) {
        logger.warn('openai_api_key_missing', {
          project:    opts.project,
          actionable: 'Set OPENAI_API_KEY in the shell, in the project\'s .env file, or via the OS keychain — the classifier falls back to local stage detection (no advisories) until a key is configured.',
        });
      }

      try {
        const result = await runAuto(
          { promptText, projectRoot: opts.project, currentAgentMode, transcriptPath },
          store,
        );

        writeHookStats(opts.project, result.outcome);
        void triggerOpportunisticSync(store).catch(() => {});
        // 'no_action' and 'pending' → exit silently (Stop hook handles UI)
      } finally {
        closeStore(store);
      }
    });
}
