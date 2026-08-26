import type { StoragePort } from './ports/storage.port.js';
import type { SessionState, Stage, PromptRecord, ClassificationResult, UserProfile } from './classifier/types.js';
import { detectSignals, initialSignalCounters } from './classifier/signals.js';
import { buildSafeDefaults } from './classifier/LLMProfileClassifier.js';
import type { StreamBPresenceResult } from './classifier/StreamBPresenceClassifier.js';

/** Gap in ms after which the session resets (30 minutes per research). */
export const SESSION_GAP_MS = 30 * 60 * 1000;

/** Maximum prompt records kept in history (saves memory + storage). */
export const MAX_HISTORY = 30;

/** Minimum stage confidence required before stage is considered "confirmed". */
export const STAGE_CONFIRM_THRESHOLD = 0.33;

/**
 * Minimum confidence a cross-stage classification must have to trigger a stage change.
 * Below this floor, low-signal prompts (e.g. "ok", "sure") cannot wipe accumulated state.
 */
export const MIN_STAGE_CHANGE_CONFIDENCE = 0.50;

// ── Factory ────────────────────────────────────────────────────────────────────

function newSession(projectRoot: string, now: number): SessionState {
  return {
    sessionId:              globalThis.crypto.randomUUID(),
    projectRoot,
    startedAt:              now,
    lastPromptAt:           now,
    currentStage:           'idea',
    stageConfidence:        0,
    stageConfirmedAt:       -1,    // -1 = not yet confirmed
    promptsInCurrentStage:  0,
    promptCount:            0,
    promptHistory:          [],
    signalCounters:          initialSignalCounters(),
    absenceFlags:            [],
    firedDecisionSessions:   [],
    profile:                 null,
    mood:                    undefined,
    detectedLanguage:        undefined,
    lastInjectedPrompt:           null,
    lastAdvisoryPromptIndex:      -1,
    advisoryCount:                0,
    consecutiveAcceptanceStreak:  0,
    consecutiveFrustratedPrompts: 0,
  };
}

// ── SessionStateManager ────────────────────────────────────────────────────────

export class SessionStateManager {
  private state: SessionState;

  constructor(state: SessionState) {
    this.state = state;
  }

  get current(): Readonly<SessionState> {
    return this.state;
  }

  /**
   * Load or create session state for a project.
   * Resets to a new session if the last prompt was > SESSION_GAP_MS ago.
   */
  static load(storage: StoragePort, projectRoot: string, now = Date.now()): SessionStateManager {
    const persisted = storage.loadSessionState(projectRoot);
    if (persisted && now - persisted.lastPromptAt < SESSION_GAP_MS) {
      return new SessionStateManager(persisted);
    }
    // New session — restore detected_language from storage so it survives the gap
    const fresh = newSession(projectRoot, now);
    fresh.detectedLanguage = storage.getProjectDetectedLanguage(projectRoot);
    return new SessionStateManager(fresh);
  }

  /**
   * Process a new prompt: update stage, history, signal counters, then persist.
   */
  processPrompt(
    storage: StoragePort,
    promptText: string,
    classification: ClassificationResult,
    now = Date.now(),
    minStageChangeConfidence = MIN_STAGE_CHANGE_CONFIDENCE,
    streamBOverrides?: StreamBPresenceResult,
  ): void {
    const s = this.state;

    // ── Gap reset check ──────────────────────────────────────────────────────
    if (s.promptCount > 0 && now - s.lastPromptAt >= SESSION_GAP_MS) {
      // Increment windowsSinceLastSeen for all signals that were absent before reset
      for (const counter of Object.values(s.signalCounters)) {
        if (counter.lastSeenAt === null) counter.windowsSinceLastSeen += 1;
      }
      // Reset to new session in-place (keeps projectRoot, resets everything else)
      const fresh = newSession(s.projectRoot, now);
      fresh.detectedLanguage = storage.getProjectDetectedLanguage(s.projectRoot);
      Object.assign(s, fresh);
    }

    const promptIndex = s.promptCount;

    // ── Stage update ─────────────────────────────────────────────────────────
    //
    // promptsInCurrentStage is the rolling "time in stage" counter consumed by
    // AbsenceDetector.  It resets to 0 on a genuine stage transition and
    // increments on every prompt where the stage stays the same — whether
    // because the classification agreed with the current stage, or because a
    // cross-stage classification was blocked by the MIN_STAGE_CHANGE_CONFIDENCE
    // gate.
    if (classification.stage !== s.currentStage
        && classification.confidence >= minStageChangeConfidence) {
      s.currentStage          = classification.stage;
      s.stageConfidence       = classification.confidence;
      s.stageConfirmedAt      = classification.confidence >= STAGE_CONFIRM_THRESHOLD
        ? promptIndex
        : -1;
      s.promptsInCurrentStage = 0;          // entering a new stage
    } else {
      if (classification.stage === s.currentStage) {
        // Exponential moving average on confidence within the same stage
        s.stageConfidence = 0.7 * s.stageConfidence + 0.3 * classification.confidence;
        if (s.stageConfirmedAt === -1 && s.stageConfidence >= STAGE_CONFIRM_THRESHOLD) {
          s.stageConfirmedAt = promptIndex;
        }
      }
      // else: cross-stage below MIN_STAGE_CHANGE_CONFIDENCE — no confidence update,
      // but wall-time in stage still advances.
      s.promptsInCurrentStage += 1;         // staying in same stage
    }

    // ── Prompt history ────────────────────────────────────────────────────────
    const record: PromptRecord = {
      index:           promptIndex,
      text:            promptText,
      capturedAt:      now,
      classifiedStage: classification.stage,
      confidence:      classification.confidence,
    };
    s.promptHistory.push(record);
    if (s.promptHistory.length > MAX_HISTORY) s.promptHistory.shift();

    // ── Signal counters ───────────────────────────────────────────────────────
    const detected = detectSignals(promptText);

    // Inject or suppress Stream B signals based on LLM result.
    // `effectiveDetected` is used ONLY for signalCounters — NOT for correction_seeking below.
    const effectiveDetected = [...detected];
    if (streamBOverrides) {
      const streamBMap: Record<string, boolean> = {
        feature_scope_before_build: streamBOverrides.feature_scope_before_build,
        implementation_checkpoint:  streamBOverrides.implementation_checkpoint,
        spec_before_code:           streamBOverrides.spec_before_code,
      };
      for (const [key, present] of Object.entries(streamBMap)) {
        const idx = effectiveDetected.indexOf(key);
        if (present && idx === -1) effectiveDetected.push(key);
        else if (!present && idx !== -1) effectiveDetected.splice(idx, 1);
      }
    }

    for (const key of Object.keys(s.signalCounters)) {
      if (effectiveDetected.includes(key)) {
        s.signalCounters[key].present    = true;
        s.signalCounters[key].lastSeenAt = promptIndex;
      }
    }

    // ── Consecutive acceptance streak ─────────────────────────────────────────
    // Uses original `detected`, NOT effectiveDetected — correction_seeking is not a
    // Stream B signal and must not be affected by the LLM override.
    if (detected.includes('correction_seeking')) {
      s.consecutiveAcceptanceStreak = 0;
    } else {
      s.consecutiveAcceptanceStreak = (s.consecutiveAcceptanceStreak ?? 0) + 1;
    }

    // ── Advance counter ───────────────────────────────────────────────────────
    s.promptCount   += 1;
    s.lastPromptAt   = now;

    storage.saveSessionState(s);
  }

  /** Mark an absence flag as dismissed at the given prompt index. */
  dismissAbsenceFlag(storage: StoragePort, signalKey: string, promptIndex: number): void {
    const flag = this.state.absenceFlags.find(
      (f) => f.signalKey === signalKey && f.dismissedAtIndex === undefined,
    );
    if (flag) {
      flag.dismissedAtIndex = promptIndex;
      storage.saveSessionState(this.state);
    }
  }

  /** Add an absence flag (called by AbsenceDetector). */
  addAbsenceFlag(storage: StoragePort, flag: import('./classifier/types.js').AbsenceFlag): void {
    this.state.absenceFlags.push(flag);
    storage.saveSessionState(this.state);
  }

  /** Check whether a decision session has already fired for this key this session. */
  hasFiredDecisionSession(key: string): boolean {
    return (this.state.firedDecisionSessions ?? []).includes(key);
  }

  /** Persist the detected language so the sticky fallback survives across invocations. */
  setDetectedLanguage(storage: StoragePort, lang: string | undefined): void {
    this.state.detectedLanguage = lang;
    storage.saveSessionState(this.state);
  }

  /**
   * Record that an advisory was stored.  Sets lastAdvisoryPromptIndex so the
   * post-advisory cooldown gate suppresses rapid-fire follow-up advisories.
   */
  markAdvisoryFired(storage: StoragePort): void {
    this.state.lastAdvisoryPromptIndex = this.state.promptCount;
    this.state.advisoryCount = (this.state.advisoryCount ?? 0) + 1;
    storage.saveSessionState(this.state);
  }

  /**
   * Record that a PE / MPS-1 popup was SHOWN this prompt — resets the
   * prompt-enhancement popup cooldown (`prompt_enhancement.popup_cooldown`,
   * default 7). Mirrors the CLI manager's method of the same name; the field is
   * optional on persisted state, so pre-PE session rows load unchanged and read
   * as "none shown yet" (-1 semantics at the gate).
   */
  markPromptEnhancementPopupShown(storage: StoragePort): void {
    this.state.lastPromptEnhancementPromptIndex = this.state.promptCount;
    storage.saveSessionState(this.state);
  }

  /**
   * Update the cached user profile in memory before processPrompt persists state.
   * Called after the async LLM classification resolves.
   */
  setProfile(profile: UserProfile): void {
    this.state.profile = profile;
  }

  /**
   * Record that a decision session fired for the given event key.
   * Persists to storage so restarts within the same session don't re-fire.
   */
  markDecisionSessionFired(storage: StoragePort, key: string): void {
    if (!this.state.firedDecisionSessions) this.state.firedDecisionSessions = [];
    if (!this.state.firedDecisionSessions.includes(key)) {
      this.state.firedDecisionSessions.push(key);
      storage.saveSessionState(this.state);
    }
  }

  /** Store the advisory option text injected by the stop hook. Auto clears it on first read. */
  setInjectedPrompt(storage: StoragePort, text: string): void {
    this.state.lastInjectedPrompt = text;
    storage.saveSessionState(this.state);
  }

  /**
   * Clear the injected prompt field.  Always called on the first invocation
   * after a stop-hook block — whether or not the prompt matched — so stale state
   * cannot accumulate if the injected execution was cancelled before auto ran.
   */
  clearInjectedPrompt(storage: StoragePort): void {
    this.state.lastInjectedPrompt = null;
    storage.saveSessionState(this.state);
  }

  /**
   * Feed Stage 2 signal assessments back into signal counters.
   * Called after runStage2 confirms an advisory, before the dedup write.
   * Only updates keys that exist in signalCounters — unknown LLM-returned keys are ignored.
   */
  applyStage2SignalUpdates(storage: StoragePort, signalsPresent: string[]): void {
    const promptIndex = this.state.promptCount - 1;
    for (const key of signalsPresent) {
      if (key in this.state.signalCounters) {
        this.state.signalCounters[key].present    = true;
        this.state.signalCounters[key].lastSeenAt = promptIndex;
      }
    }
    storage.saveSessionState(this.state);
  }

  /**
   * Pre-seed session state from imported historical prompts.
   * Called once per project after importHistoricalPrompts().
   * No-op if a session state already exists for this project.
   */
  static bootstrapFromHistory(
    storage:       StoragePort,
    projectRoot:   string,
    history:       import('./classifier/types.js').PromptRecord[],
    totalImported: number,
  ): void {
    if (storage.loadSessionState(projectRoot)) return;

    const now   = Date.now();
    const state = newSession(projectRoot, now);

    state.promptHistory = history;
    state.promptCount   = totalImported;
    state.lastPromptAt  = now;
    state.profile       = buildSafeDefaults(totalImported);
    state.detectedLanguage = storage.getProjectDetectedLanguage(projectRoot);
    // Conservative: start absence detection from the first real prompt after
    // bootstrap rather than estimating time-in-stage from imported history.
    state.promptsInCurrentStage = 0;

    storage.saveSessionState(state);
  }
}
