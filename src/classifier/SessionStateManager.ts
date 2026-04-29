import { randomUUID } from 'node:crypto';
import type { Store } from '../store/db.js';
import { saveStore } from '../store/db.js';
import type { SessionState, Stage, PromptRecord, ClassificationResult } from './types.js';
import { detectSignals, initialSignalCounters } from './signals.js';
import { classifyUserProfile, isProfileStale, classifyMoodOnly } from './UserProfileClassifier.js';
import { getProject } from '../store/projects.js';

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

// ── Persistence helpers ────────────────────────────────────────────────────────

function loadState(store: Store, projectRoot: string): SessionState | null {
  const result = store.db.exec(
    'SELECT state_json FROM session_states WHERE project_root = ?',
    [projectRoot],
  );
  const row = result[0]?.values[0];
  if (!row) return null;
  try {
    return JSON.parse(row[0] as string) as SessionState;
  } catch {
    return null;
  }
}

function saveState(store: Store, state: SessionState): void {
  store.db.run(
    `INSERT INTO session_states (project_root, session_id, state_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(project_root) DO UPDATE SET
       session_id = excluded.session_id,
       state_json = excluded.state_json,
       updated_at = excluded.updated_at`,
    [state.projectRoot, state.sessionId, JSON.stringify(state), Date.now()],
  );
  saveStore(store);
}

// ── Factory ────────────────────────────────────────────────────────────────────

function newSession(projectRoot: string, now: number): SessionState {
  return {
    sessionId:              randomUUID(),
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
    lastInjectedPrompt:      null,
    lastAdvisoryPromptIndex: -1,
    advisoryCount:           0,
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
  static load(store: Store, projectRoot: string, now = Date.now()): SessionStateManager {
    const persisted = loadState(store, projectRoot);
    if (persisted && now - persisted.lastPromptAt < SESSION_GAP_MS) {
      return new SessionStateManager(persisted);
    }
    // New session — restore detected_language from projects table so it survives the gap
    const fresh = newSession(projectRoot, now);
    fresh.detectedLanguage = getProject(store, projectRoot)?.detectedLanguage ?? undefined;
    return new SessionStateManager(fresh);
  }

  /**
   * Process a new prompt: update stage, history, signal counters, then persist.
   */
  processPrompt(
    store: Store,
    promptText: string,
    classification: ClassificationResult,
    now = Date.now(),
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
      // Restore detected_language from projects table — survives the inactivity gap
      fresh.detectedLanguage = getProject(store, s.projectRoot)?.detectedLanguage ?? undefined;
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
    //
    // Why not use (promptCount - stageConfirmedAt) like the original design?
    // stageConfirmedAt records the prompt index at which stage confidence first
    // crossed STAGE_CONFIRM_THRESHOLD (the EMA confirmation epoch).  When
    // MIN_STAGE_CHANGE_CONFIDENCE (the minimum single-prompt confidence required
    // to flip the stage) is kept high to prevent noise prompts from resetting
    // accumulated state, early lower-confidence prompts do not cross that gate,
    // so the first stage flip happens later — and stageConfirmedAt is therefore
    // set later.  The absence window then starts later as a side-effect of
    // tuning the cross-stage gate, even though the project has genuinely been
    // in the new stage since the first prompt that signalled it.
    // promptsInCurrentStage counts wall-prompts in the stage, not confidence-
    // epoch prompts, so it remains accurate regardless of how that gate is tuned.
    // stageConfirmedAt is kept for the EMA / epoch logic below — it is just no
    // longer used as the absence-detection anchor.
    if (classification.stage !== s.currentStage
        && classification.confidence >= MIN_STAGE_CHANGE_CONFIDENCE) {
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
    for (const key of Object.keys(s.signalCounters)) {
      if (detected.includes(key)) {
        s.signalCounters[key].present    = true;
        s.signalCounters[key].lastSeenAt = promptIndex;
      }
    }

    // ── Mood — every prompt, 0.0088ms/call ───────────────────────────────────
    s.mood = classifyMoodOnly(s.promptHistory);

    // ── Advance counter ───────────────────────────────────────────────────────
    s.promptCount   += 1;
    s.lastPromptAt   = now;

    // ── User profile — nature + depth, every NATURE_DEPTH_RECOMPUTE_INTERVAL prompts ──
    if (isProfileStale(s.profile, s.promptCount)) {
      s.profile = classifyUserProfile(s.promptHistory, s.promptCount);
    }

    saveState(store, s);
  }

  /** Mark an absence flag as dismissed at the given prompt index. */
  dismissAbsenceFlag(store: Store, signalKey: string, promptIndex: number): void {
    const flag = this.state.absenceFlags.find(
      (f) => f.signalKey === signalKey && f.dismissedAtIndex === undefined,
    );
    if (flag) {
      flag.dismissedAtIndex = promptIndex;
      saveState(store, this.state);
    }
  }

  /** Add an absence flag (called by AbsenceDetector). */
  addAbsenceFlag(store: Store, flag: import('./types.js').AbsenceFlag): void {
    this.state.absenceFlags.push(flag);
    saveState(store, this.state);
  }

  /** Check whether a decision session has already fired for this key this session. */
  hasFiredDecisionSession(key: string): boolean {
    return (this.state.firedDecisionSessions ?? []).includes(key);
  }

  /** Persist the detected language so the sticky fallback survives across runAuto invocations. */
  setDetectedLanguage(store: Store, lang: string | undefined): void {
    this.state.detectedLanguage = lang;
    saveState(store, this.state);
  }

  /**
   * Record that an advisory was stored.  Sets lastAdvisoryPromptIndex so the
   * post-advisory cooldown gate in auto.ts suppresses rapid-fire follow-up advisories.
   */
  markAdvisoryFired(store: Store): void {
    this.state.lastAdvisoryPromptIndex = this.state.promptCount;
    this.state.advisoryCount = (this.state.advisoryCount ?? 0) + 1;
    saveState(store, this.state);
  }

  /**
   * Record that a decision session fired for the given event key.
   * Persists to the store so restarts within the same session don't re-fire.
   */
  markDecisionSessionFired(store: Store, key: string): void {
    if (!this.state.firedDecisionSessions) this.state.firedDecisionSessions = [];
    if (!this.state.firedDecisionSessions.includes(key)) {
      this.state.firedDecisionSessions.push(key);
      saveState(store, this.state);
    }
  }

  /** Store the advisory option text injected by the stop hook. Auto clears it on first read. */
  setInjectedPrompt(store: Store, text: string): void {
    this.state.lastInjectedPrompt = text;
    saveState(store, this.state);
  }

  /**
   * Clear the injected prompt field.  Always called by auto on its first invocation
   * after a stop-hook block — whether or not the prompt matched — so stale state
   * cannot accumulate if the injected execution was cancelled before auto ran.
   */
  clearInjectedPrompt(store: Store): void {
    this.state.lastInjectedPrompt = null;
    saveState(store, this.state);
  }

  /**
   * Pre-seed session state from imported historical prompts.
   * Called once per project after importHistoricalPrompts().
   * No-op if a session state already exists for this project.
   */
  static bootstrapFromHistory(
    store:         Store,
    projectRoot:   string,
    history:       import('./types.js').PromptRecord[],
    totalImported: number,
  ): void {
    if (loadState(store, projectRoot)) return;

    const now   = Date.now();
    const state = newSession(projectRoot, now);

    state.promptHistory = history;
    state.promptCount   = totalImported;
    state.lastPromptAt  = now;
    state.mood          = classifyMoodOnly(history);
    state.profile       = classifyUserProfile(history, totalImported);
    state.detectedLanguage =
      getProject(store, projectRoot)?.detectedLanguage ?? undefined;
    // Conservative: start absence detection from the first real prompt after
    // bootstrap rather than estimating time-in-stage from imported history.
    state.promptsInCurrentStage = 0;

    saveState(store, state);
  }
}
