import OpenAI from 'openai';
import { platform } from 'node:process';
import type { Store } from '../../store/db.js';
import { openStore, closeStore, releaseStoreLock, reacquireStoreLock, DEFAULT_DB_PATH } from '../../store/db.js';
import { getPendingAdvisory, markAdvisoryShown } from '../../store/pending-advisories.js';
import { isFeedbackEligible, markFeedbackShown } from '../../store/feedback-cadence.js';
import { recordAdvisoryFired, recordOptionSelected } from '../../store/feedback-signals.js';
import { sendFeedback } from '../../telemetry/feedback-send.js';
import { runFeedbackPopup, type FeedbackRenderFn, type FeedbackResult } from '../../decision-session/feedback-popup.js';
import { createFeedbackRenderFn } from '../../decision-session/feedback-tty.js';
import { runDecisionSession } from '../../decision-session/DecisionSession.js';
import type { SelectFn } from '../../decision-session/DecisionSession.js';
import { createTtySelectFn } from '../../decision-session/TtySelectFn.js';
import { getConfig } from '../../store/config.js';
import { detectLanguage, resolveLanguage, LANG_WINDOW, LANG_DETECT_INTERVAL } from '../../classifier/LanguageDetector.js';
import { SessionStateManager } from '../../classifier/SessionStateManager.js';
import { getRecentPrompts } from '../../store/prompts.js';
import { getProject, setDetectedLanguage } from '../../store/projects.js';
import { logger, initLogger } from '../../logger.js';
import type { LogLevel } from '../../logger.js';
import { writeHookStats } from '../../store/hook-stats.js';
import { writeTelemetry } from '../../telemetry/index.js';
import { triggerOpportunisticSync } from '../../telemetry/OpportunisticSync.js';
import { flushIfTelemetryOn, flushLifecycle } from '../../telemetry/lifecycle-flush.js';
import { recentPromptMetadata } from '../../telemetry/recent-prompts.js';
import { readStdin } from './auto.js';
import type { GeneratedOptions } from '../../decision-session/OptionGenerator.js';
import { resolveContentSource, selectionRegister } from '../../decision-session/selection-registry.js';
import { autogenAwareLookup, pinchSignalTypeForFlag } from '../../decision-session/content-template-source.js';
import { runAutogenForFire } from '../../decision-session/auto-template-generator.js';
import { loadRightGoodProfile } from '../../classifier/right-good-aggregator.js';
import { generateFromEngine, buildEngineGrounding, composeDeterministicOptions } from '../../decision-session/engine-option-generator.js';
import { resolveRecord } from '../../decision-session/content-template-engine.js';
import { appendVariantServedEvent } from '../../telemetry/param-events.js';
import { activePinFor, applyPinToLookup, applyPinToLevel, type ActivePin } from '../../decision-session/experiment-config.js';
import { resolvePinchFields } from '../../decision-session/signal-pinch-fields.js';
import { getWhyHelpForSignalType } from '../../decision-session/why-help-by-signal-type.js';
import type { WhyHelpEntry } from '../../decision-session/why-help.js';
import { getUserDepthLevel } from '../../store/user-depth-level.js';
import type { MaturityLevel } from '../../decision-session/content-template-schema.js';
import type { PromptRecord } from '../../classifier/types.js';
import { resolveOpenAIKey, getKeySource } from '../../config/ApiKeyResolver.js';

/**
 * nexpath stop — Claude Code Stop hook handler.
 *
 * Fires every time Claude finishes a response.  The handler:
 *   1. Exits immediately when stop_hook_active is true (loop guard).
 *   2. Looks up a pending advisory for the project (stored by the auto hook).
 *   3. If found: marks it shown, opens /dev/tty, renders the decision session UI.
 *   4. If the user picks "Send to your agent": writes { decision: "block", reason }
 *      so Claude Code receives the prompt as the next user turn.
 *      If the user picks "Copy to clipboard": text is already in clipboard
 *      (copied by the popup window); exits 0, Claude stops normally.
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
  | { outcome: 'feedback_shown' }
  | { outcome: 'skipped' };

/**
 * Injectable feedback popup dependencies. `render` is the terminal renderer
 * (null when none is available, e.g. no TTY); `send` transmits the rating.
 */
export interface FeedbackDeps {
  render: FeedbackRenderFn | null;
  send:   (store: Store, rating: number) => Promise<boolean>;
}

// ── Core logic ─────────────────────────────────────────────────────────────────

/**
 * Run the Stop hook pipeline.
 *
 * @param payload   Parsed Stop hook JSON payload from Claude Code stdin
 * @param store     Open SQLite store (caller manages lifecycle)
 * @param selectFn  Optional select replacement (injected in tests)
 */
export async function runStop(
  payload:       StopPayload,
  store:         Store,
  selectFn?:     SelectFn,
  openai?:       OpenAI,
  feedbackDeps?: FeedbackDeps,
): Promise<StopOutcome> {
  // 1. Loop guard — Claude is continuing because of a previous Stop block; let it land
  if (payload.stop_hook_active) {
    logger.debug('stop_loop_guard', { cwd: payload.cwd });
    return { outcome: 'loop_guard' };
  }

  // 1.3. Feedback popup — when due, show it in place of the advisory this turn.
  //      A rating is sent; either outcome resets the cadence. Skipped (without
  //      consuming the cadence) when no renderer is available.
  if (isFeedbackEligible(store)) {
    const fbRender = feedbackDeps ? feedbackDeps.render : createFeedbackRenderFn();
    const fbSend   = feedbackDeps ? feedbackDeps.send   : sendFeedback;
    if (fbRender) {
      // The popup blocks for user input; don't hold the global DB lock across it.
      // Release before, re-acquire + reload after, so other sessions are not
      // blocked and their concurrent writes are not clobbered. No-op for :memory:.
      releaseStoreLock(store);
      let result: FeedbackResult;
      try {
        result = await runFeedbackPopup({ render: fbRender });
      } finally {
        await reacquireStoreLock(store);
      }
      if (result.outcome === 'selected') {
        // The feedback click is the consent gate: flush any buffered lifecycle
        // events (install + advisory + option-selected), then send the rating.
        // Flush regardless of telemetry.enabled — this explicit action is the consent.
        await flushLifecycle(store);
        await fbSend(store, result.rating);
      }
      markFeedbackShown(store);
      logger.info('stop_feedback_shown', { cwd: payload.cwd, selected: result.outcome === 'selected' });
      return { outcome: 'feedback_shown' };
    }
  }

  // 1.5. Language detection — runs post-response, invisible latency
  //      Only fires when >= LANG_DETECT_INTERVAL prompts have been captured for this project.
  const recentPrompts = getRecentPrompts(store, payload.cwd, LANG_WINDOW);
  if (recentPrompts.length >= LANG_DETECT_INTERVAL) {
    const currentDetected = getProject(store, payload.cwd)?.detectedLanguage ?? undefined;
    const detected = detectLanguage(recentPrompts.map((p) => p.text), currentDetected);
    setDetectedLanguage(store, payload.cwd, detected);
    logger.debug('stop_lang_detected', { cwd: payload.cwd, detected: detected ?? null });
    writeTelemetry(payload.cwd, 'language_detected', { detectedLanguage: detected ?? null }, store);
  }

  // 1.7. Read decision_session_count for help-line gating in the decision session UI
  const decisionSessionCount = getProject(store, payload.cwd)?.decisionSessionCount ?? 0;

  // 2. Load session state — needed for session filter and option gen
  const mgr = SessionStateManager.load(store, payload.cwd);

  // 3. Check for a pending advisory stored by the auto hook
  const advisory = getPendingAdvisory(store, payload.cwd, mgr.current.sessionId);
  if (!advisory) {
    logger.debug('stop_no_pending', { cwd: payload.cwd });
    writeTelemetry(payload.cwd, 'stop_no_pending', undefined, store);
    return { outcome: 'no_pending' };
  }

  // 3. Mark as shown immediately — prevents duplicate UI on rapid Stop re-fires
  markAdvisoryShown(store, advisory.id);

  // 3.5. Advisory frequency gate — honour opt-out / frequency setting even for
  //      already-queued pending advisories (e.g. user pressed Ctrl+X on a prior
  //      advisory while a second was already pending in the DB).
  const freq =
    getConfig(store.db, `advisory_frequency:${payload.cwd}`) ??
    getConfig(store.db, 'advisory_frequency') ??
    'every_event';
  if (freq === 'off') {
    logger.info('stop_freq_gate', { cwd: payload.cwd, reason: 'freq_off' });
    return { outcome: 'skipped' };
  }

  // 4. TTY resolution — Stop hook stdin is always piped; open /dev/tty directly
  let effectiveSelectFn: SelectFn | undefined = selectFn;
  if (!effectiveSelectFn) {
    if (process.env['NEXPATH_SIM'] === '1') {
      // Sim mode: skip TTY entirely — runLevel intercepts NEXPATH_SIM before calling selectFn
      effectiveSelectFn = () => Promise.resolve('');
      logger.debug('stop_tty_resolved', { method: 'sim' });
    } else {
      const ttySel = createTtySelectFn(store, payload.cwd);
      if (!ttySel) {
        logger.info('stop_no_tty', { cwd: payload.cwd });
        return { outcome: 'no_tty' };
      }
      effectiveSelectFn = ttySel;
      logger.debug('stop_tty_resolved', { method: 'direct_tty' });
    }
  }

  // 5. Generate decision options — runs after Claude's response, within stop's 600s window
  const langOverride  = getConfig(store.db, 'language_override');
  const detectedLang  = getProject(store, payload.cwd)?.detectedLanguage ?? undefined;
  const effectiveLang = resolveLanguage(langOverride, detectedLang);

  // Dispatch: every signal is migrated, so the fired advisory's record serves it via the engine.
  // The record signalType comes from the flag (the `absence:` convention) or, for a stage transition
  // (no absence: key), from the destination stage — both via pinchSignalTypeForFlag, which needs no
  // static content (the B11 cutover removed it).
  const recordSignalType = pinchSignalTypeForFlag(advisory.flagType, advisory.stage);
  // The engine now serves role-tailored content directly (B11 `roleOverrides` — context_loss's
  // founder / indie_hacker / pm variants), so there is no role-precedence static guard: every
  // migrated signal, role-tailored or not, takes the engine path (the role is passed below).
  let generatedOptions: GeneratedOptions | null = null;
  // A migrated signal owns its popup question + per-class why-help in the record (no matching
  // static DecisionContent) — thread them to runDecisionSession as overrides.
  let questionOverride: string | undefined;
  let whyHelpOverride: WhyHelpEntry | null | undefined;
  const register = selectionRegister(mgr.current.profile?.nature);
  if (recordSignalType && resolveContentSource(recordSignalType) === 'content-template') {
    // An active experiment pin makes the served variant deterministic for this
    // installation: it can force the record source and/or the maturity level.
    // Fail-open — a missing/malformed config means no pinning.
    let activePin: ActivePin | null = null;
    try { activePin = activePinFor(store, recordSignalType); } catch { activePin = null; }
    const baseLookup = autogenAwareLookup(store, payload.cwd, recordSignalType);
    const lookup = activePin ? applyPinToLookup(baseLookup, activePin.pin) : baseLookup;
    const baseLevel = (getUserDepthLevel(store, payload.cwd)?.currentLevel ?? 2) as MaturityLevel;
    const level = activePin ? applyPinToLevel(baseLevel, activePin.pin) : baseLevel;
    const role   = mgr.current.profile?.role ?? undefined;
    // Popup question + per-class why-help are static (no LLM). The question comes from the
    // register-keyed pinch-fields map (the migrated question/pinchFallback layer), not the record.
    questionOverride = resolvePinchFields(recordSignalType, register)?.question;
    whyHelpOverride = getWhyHelpForSignalType(recordSignalType);
    // The engine grounding/weave needs an LLM client; on ANY failure (missing key, API error)
    // degrade below — the Stop hook must never crash on option gen.
    try {
      const promptHistory = mgr.current.promptHistory as PromptRecord[];
      const facts = await buildEngineGrounding(store, payload.cwd, promptHistory, openai);
      generatedOptions = await generateFromEngine({ lookup, level, register, role, facts, factCap: 3 }, openai);
    } catch (err) {
      logger.debug('stop_engine_option_gen_error', { error: String(err) });
      generatedOptions = null;
    }
    let composePath: 'llm' | 'deterministic' = 'llm';
    if (!generatedOptions) {
      // The grounded engine failed (missing key / API error). Serve a DETERMINISTIC engine composition
      // from the record — no LLM, register/role-aware, safeguard-carrying — so the fallback needs no
      // static content. (Records are the whole content layer after the B11 cutover.)
      generatedOptions = composeDeterministicOptions({ lookup, level, register, role });
      composePath = 'deterministic';
    }
    // Record WHICH content variant was served (identity only — level / register /
    // role / record source / compose path; never any option text) so downstream
    // measurement can compare served variants against outcomes. Best-effort —
    // never blocks the popup.
    if (generatedOptions) {
      try {
        const served = resolveRecord(lookup);
        if (served) {
          appendVariantServedEvent(store, {
            projectRoot:     payload.cwd,
            sessionId:       mgr.current.sessionId,
            promptIndex:     Math.max(0, mgr.current.promptCount - 1),
            signalKey:       recordSignalType,
            stage:           mgr.current.currentStage,
            stageConfidence: mgr.current.stageConfidence,
            variant: {
              level, register, role, source: served.source, path: composePath,
              ...(activePin ? { experiment: activePin.experimentId } : {}),
            },
          });
        }
      } catch { /* variant logging is non-fatal */ }
    }
  }

  writeTelemetry(payload.cwd, 'stop_advisory_shown', {
    flagType:         advisory.flagType,
    stage:            advisory.stage,
    generatedOptions: !!generatedOptions,
  }, store);
  recordAdvisoryFired(store, payload.cwd);
  // On-mode: emit the advisory-fired event now (backdated). Off-mode buffers it
  // for the feedback-consent flush. Fire-and-forget so the popup is never blocked.
  void flushIfTelemetryOn(store).catch(() => {});

  const dsResult = await runDecisionSession(
    {
      stage:                advisory.stage,
      flagType:             advisory.flagType,
      pinchLabel:           advisory.pinchLabel,
      sessionId:            advisory.sessionId,
      projectRoot:          payload.cwd,
      promptCount:          advisory.promptCount,
      decisionSessionCount,
      generatedOptions:     generatedOptions ?? undefined,
      questionOverride,
      whyHelpOverride,
      profile:              mgr.current.profile,
      // Phase 4 — Item B: last-5 prompt metadata for decision_session_started.
      recentPrompts:        recentPromptMetadata(mgr.current.promptHistory),
    },
    store,
    effectiveSelectFn,
  );

  // Per-user auto-gen loop — after the popup, off its critical path. The current
  // fire already served (the preset, or a previously-cached per-user record); this
  // runs the one-time ranking and lazily generates the fired topic's per-user record
  // so the NEXT fire of a selected topic serves it. Best-effort — never breaks the outcome.
  if (recordSignalType && resolveContentSource(recordSignalType) === 'content-template') {
    await runAutogenForFire({
      store,
      projectRoot:  payload.cwd,
      signalType:   recordSignalType,
      currentLevel: (getUserDepthLevel(store, payload.cwd)?.currentLevel ?? 2) as MaturityLevel,
      rightGood:    loadRightGoodProfile(store, payload.cwd),
      client:       openai,
    });
  }

  if (dsResult.outcome === 'selected') {
    // Record the selection (timestamp only — no option text or index).
    recordOptionSelected(store, payload.cwd);
    // On-mode: emit the option-selected event now; off-mode buffers it for the
    // feedback-consent flush. Fire-and-forget so the block decision is not delayed.
    void flushIfTelemetryOn(store).catch(() => {});
    // Store injected text in session — auto reads and clears this on its next invocation
    // to skip all pipeline processing for the advisory-injected prompt.
    mgr.setInjectedPrompt(store, dsResult.selectedPrompt);
    logger.info('stop_blocked', { cwd: payload.cwd, reason: dsResult.selectedPrompt });
    return { outcome: 'blocked', reason: dsResult.selectedPrompt };
  }

  if (dsResult.outcome === 'clipboard_only') {
    // Copy-to-clipboard is also engagement with an option (timestamp only).
    recordOptionSelected(store, payload.cwd);
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

      // Resolve OPENAI_API_KEY through the 4-layer chain (env → project .env →
      // OS keychain → 0600 fallback file). Matches the auto hook contract so the
      // stop hook works for every key source, not just project .env.
      await resolveOpenAIKey(payload.cwd);

      const store = await openStore(opts.db);
      const logLevel = getConfig(store.db, 'log_level') as LogLevel | undefined;
      initLogger('stop', logLevel);

      const keySource = await getKeySource(payload.cwd);
      const keyFound  = !!process.env['OPENAI_API_KEY'];
      logger.debug('env_load', { cwd: payload.cwd, keySource, keyFound });

      if (!keyFound) {
        logger.warn('openai_api_key_missing', {
          cwd:        payload.cwd,
          actionable: 'Set OPENAI_API_KEY in the shell, in the project\'s .env file, or via the OS keychain — decision option generation will fall back to static text until a key is configured.',
        });
      }

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
        void triggerOpportunisticSync(store).catch(() => {});
        // All other outcomes → exit 0 (Claude stops normally)
      } finally {
        closeStore(store);
      }
    });
}
