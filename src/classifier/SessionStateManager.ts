import { randomUUID } from 'node:crypto';
import type { Store } from '../store/db.js';
import { saveStore } from '../store/db.js';
import type { SessionState, Stage, PromptRecord, ClassificationResult } from './types.js';
import { detectSignals, initialSignalCounters } from './signals.js';

/** Gap in ms after which the session resets (30 minutes per research). */
export const SESSION_GAP_MS = 30 * 60 * 1000;

/** Maximum prompt records kept in history (saves memory + storage). */
export const MAX_HISTORY = 30;

/** Minimum stage confidence required before stage is considered "confirmed". */
export const STAGE_CONFIRM_THRESHOLD = 0.70;

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
    sessionId:         randomUUID(),
    projectRoot,
    startedAt:         now,
    lastPromptAt:      now,
    currentStage:      'idea',
    stageConfidence:   0,
    stageConfirmedAt:  -1,    // -1 = not yet confirmed
    promptCount:       0,
    promptHistory:     [],
    signalCounters:          initialSignalCounters(),
    absenceFlags:            [],
    firedDecisionSessions:   [],
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
    return new SessionStateManager(newSession(projectRoot, now));
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
      Object.assign(s, fresh);
    }

    const promptIndex = s.promptCount;

    // ── Stage update ─────────────────────────────────────────────────────────
    if (classification.stage !== s.currentStage) {
      s.currentStage    = classification.stage;
      s.stageConfidence = classification.confidence;
      s.stageConfirmedAt = classification.confidence >= STAGE_CONFIRM_THRESHOLD
        ? promptIndex
        : -1;
    } else {
      // Exponential moving average on confidence within the same stage
      s.stageConfidence = 0.7 * s.stageConfidence + 0.3 * classification.confidence;
      if (s.stageConfirmedAt === -1 && s.stageConfidence >= STAGE_CONFIRM_THRESHOLD) {
        s.stageConfirmedAt = promptIndex;
      }
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

    // ── Advance counter ───────────────────────────────────────────────────────
    s.promptCount   += 1;
    s.lastPromptAt   = now;

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
}
