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
  /**
   * Keys of decision session events that have already fired this session.
   * Format: 'stage_transition:<prev>→<next>' | 'absence:<signalKey>@<stage>'
   * Enforces the "once per stage transition event, never re-fires same event same session" rule.
   */
  firedDecisionSessions: string[];
  /** Cached user profile — null until first prompt processed. Updated every NATURE_DEPTH_RECOMPUTE_INTERVAL prompts. */
  profile: UserProfile | null;
  /** Per-prompt mood — updated unconditionally on every processPrompt() call. */
  mood?: UserMood;
  /** Last successfully detected/resolved language code. undefined = not yet detected. */
  detectedLanguage: string | undefined;
}

// ── User nature / mood / depth (item 9) ───────────────────────────────────────

/** Four developer archetypes derived from the 2D precision × playfulness quadrant. */
export type UserNature =
  | 'cool_geek'      // Low precision, High playfulness
  | 'hardcore_pro'   // High precision, Low playfulness
  | 'pro_geek_soul'  // High precision, High playfulness
  | 'beginner';      // Low precision, Low playfulness

/** Six session mood categories detectable from the last 5 prompts. */
export type UserMood =
  | 'focused'
  | 'excited'
  | 'frustrated'
  | 'casual'
  | 'rushed'
  | 'methodical';

/** Session technical depth based on vocabulary scoring over the last 10 prompts. */
export type SessionDepth = 'low' | 'medium' | 'high';

/** Computed user profile — produced by UserProfileClassifier on demand. */
export interface UserProfile {
  nature: UserNature;
  /** Technical precision score 0–10 (drives nature + option phrasing). */
  precisionScore: number;
  /** Playfulness / expressiveness score 0–10 (drives nature + pinch tone). */
  playfulnessScore: number;
  mood: UserMood;
  depth: SessionDepth;
  /** Raw avg depth score before thresholding. */
  depthScore: number;
  /** promptCount when this profile was computed (for stickiness tracking by caller). */
  computedAt: number;
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
