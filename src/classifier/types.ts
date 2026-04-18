// ── Stage enum ─────────────────────────────────────────────────────────────────

export type Stage =
  | 'idea'
  | 'prd'
  | 'architecture'
  | 'task_breakdown'
  | 'implementation'
  | 'review_testing'
  | 'release'
  | 'feedback_loop';

export const STAGES: Stage[] = [
  'idea', 'prd', 'architecture', 'task_breakdown',
  'implementation', 'review_testing', 'release', 'feedback_loop',
];

// ── Classifier output ──────────────────────────────────────────────────────────

export interface ClassificationResult {
  /** Primary stage detected. */
  stage: Stage;
  /** Confidence 0–1 for the primary stage. */
  confidence: number;
  /** Which tier produced this result. */
  tier: 1 | 2 | 3;
  /** Normalised score per stage (always present, others may be 0). */
  allScores: Partial<Record<Stage, number>>;
}

// ── Session state ──────────────────────────────────────────────────────────────

export interface PromptRecord {
  index: number;         // sequential index within the session
  text: string;
  capturedAt: number;    // unix ms timestamp
  classifiedStage: Stage;
  confidence: number;
}

export interface SignalCounter {
  present: boolean;
  lastSeenAt: number | null;    // prompt index when last detected
  windowsSinceLastSeen: number; // incremented each gap-reset
}

export interface AbsenceFlag {
  signalKey: string;
  stage: Stage;
  raisedAtIndex: number;
  dismissedAtIndex?: number;    // set when user acts on it
  cooldownUntil: number;        // prompt index — don't re-raise before this
}

export interface SessionState {
  sessionId: string;
  projectRoot: string;
  startedAt: number;            // unix ms
  lastPromptAt: number;         // unix ms — used for gap-based reset
  currentStage: Stage;
  stageConfidence: number;      // 0–1
  stageConfirmedAt: number;     // prompt index when stage reached ≥ 0.70 confidence
  promptCount: number;          // total prompts processed this session
  promptHistory: PromptRecord[]; // capped at 30
  signalCounters: Record<string, SignalCounter>;
  absenceFlags: AbsenceFlag[];
}

// ── Signal definitions ─────────────────────────────────────────────────────────

export interface SignalDefinition {
  key: string;
  description: string;
  expectedStages: Stage[];
  /** Keywords that indicate this signal IS present in a prompt. */
  detectionKeywords: string[];
  /** Number of prompts in confirmed stage before checking absence. */
  absenceThreshold: number; // 15–20 per research
}
