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
  'architecture',
  'feedback_loop',
  'idea',
  'implementation',
  'prd',
  'release',
  'review_testing',
  'task_breakdown',
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
  /**
   * null on records bootstrapped from the historical import — those prompts were
   * never classified, and a fabricated stage would bias stage reads. The classifier
   * fills real stages as live prompts arrive.
   */
  classifiedStage: Stage | null;
  confidence: number | null;
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
  stageConfirmedAt: number;     // prompt index when stage confidence first crossed STAGE_CONFIRM_THRESHOLD (EMA epoch marker — NOT used by AbsenceDetector)
  /**
   * Rolling count of prompts processed while currentStage has remained unchanged.
   * Resets to 0 on every genuine stage transition; increments on every other prompt
   * (same-stage classification or cross-stage classification below the confidence gate).
   * Used by AbsenceDetector as the "time in stage" metric instead of
   * (promptCount - stageConfirmedAt).  Decoupled from stageConfirmedAt so that
   * tuning the cross-stage confidence gate does not inadvertently delay absence detection.
   */
  promptsInCurrentStage: number;
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
  /**
   * Exact text of the advisory option last injected by the stop hook via { decision: 'block' }.
   * The auto hook reads and always clears this on its first invocation after a block.
   * If the incoming prompt matches, it is advisory-injected and all processing is skipped.
   * null when no injection is pending.
   */
  lastInjectedPrompt?: string | null;
  /**
   * promptCount value at the time the most recent advisory was stored (upsertPendingAdvisory).
   * Used to enforce a post-advisory cooldown: no new advisory fires within
   * POST_ADVISORY_COOLDOWN prompts of the last one.
   * -1 = no advisory has fired this session.
   */
  lastAdvisoryPromptIndex?: number;
  /**
   * promptCount when a PE / MPS-1 popup was last SHOWN (Stop hook). Used by the popup-cooldown gate:
   * after a popup, new PE / MPS-1 popups are suppressed for `prompt_enhancement.popup_cooldown`
   * prompts (CLI default 3; the browser keeps its own literal, 7). -1 / absent = none shown yet (the
   * first popup always shows). An active sequence's continuation items (MPS-2) are NOT gated by this —
   * they are not new popups.
   */
  lastPromptEnhancementPromptIndex?: number;
  /**
   * Count of advisories that have actually fired (passed Stage 2) this session.
   * Checked against profile-aware cap before Stage 2 runs.
   * Optional for backward compatibility with existing persisted state — read as 0 when absent.
   */
  advisoryCount?: number;
  /**
   * Keys of advisories whose PE / MPS-1 popup was actually SHOWN to the user this session.
   * The dedup gate reads THIS instead of `firedDecisionSessions` when the frequency level sets
   * `countBudgetOnShow`: an advisory the user never saw must not block its own signal later.
   * `firedDecisionSessions` keeps being written either way, so `once_per_session` and telemetry
   * are unchanged. Optional — absent on state written before this field existed.
   */
  shownAdvisoryKeys?: string[];
  /**
   * Count of PE / MPS-1 popups actually SHOWN this session. The session cap reads THIS instead of
   * `advisoryCount` when the frequency level sets `countBudgetOnShow`. Optional — read as 0 when absent.
   */
  shownPopupCount?: number;
  /**
   * What to charge if the pending PE row is shown — BOUND to the row it was written for.
   *
   * It carries BOTH the dedup pre-check key (built from the first qualifying flag) and the fired key
   * (built from the classifier's selected flag), because those two can differ and the row itself only
   * carries the second one. `promptCount` is the row's own prompt index, and the charge uses these
   * keys only when it matches the row being shown: a pending row is replaced (there is exactly one per
   * project) or consumed unseen by paths that know nothing about this state — the sequence-shaped
   * fallback, the Stop cooldown branch, the submit-time sweep — and without the binding those keys
   * would be spent by the NEXT popup, marking advice "seen" that was never displayed. Optional;
   * cleared after each charge.
   */
  pendingPopupCharge?: { promptCount: number; keys: string[] };
  /**
   * Number of consecutive prompts processed without a correction_seeking signal being detected.
   * Resets to 0 whenever correction_seeking is detected in a prompt; increments on every other prompt.
   * Used by the decision_fatigue_pattern signal detector.
   */
  consecutiveAcceptanceStreak: number;
  /** Consecutive processed prompts while the classified mood is 'frustrated' (frustration-spiral). Reset on any non-frustrated prompt. */
  consecutiveFrustratedPrompts: number;
  /**
   * The coding-agent's current permission mode, as last reported by the hook payload.
   * Sticky: a prompt that carries no mode keeps the last-known value. Undefined until a
   * mode is first seen. Optional for backward compatibility with existing persisted state.
   */
  currentAgentMode?: string;
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

/** Ordinal scale used for precision and playfulness axes from the LLM classifier. */
export type OrdinalAxis = 'low' | 'medium' | 'high' | 'very_high';

/** Computed user profile — produced by LLMProfileClassifier on demand. */
export interface UserProfile {
  nature: UserNature;
  /** Technical precision score 0–10 derived from precisionOrdinal via lookup table. */
  precisionScore: number;
  /** Playfulness / expressiveness score 0–10 derived from playfulnessOrdinal via lookup table. */
  playfulnessScore: number;
  /** Ordinal precision axis returned directly by the LLM classifier. */
  precisionOrdinal: OrdinalAxis;
  /** Ordinal playfulness axis returned directly by the LLM classifier. */
  playfulnessOrdinal: OrdinalAxis;
  mood: UserMood;
  depth: SessionDepth;
  /** Numeric depth score derived from depth via lookup table. */
  depthScore: number;
  /** promptCount when this profile was computed (for stickiness tracking by caller). */
  computedAt: number;
  /** Configured project role — injected from store config; null = no role configured (Dim2 signals inactive). */
  role?: UserRole | null;
}

// ── Role ──────────────────────────────────────────────────────────────────────

/** Explicit project role set via config. Unlocks Dim2 (role-based) signals. */
export type UserRole = 'founder' | 'indie_hacker' | 'pm' | 'vibe_coder';

// ── Signal definitions ─────────────────────────────────────────────────────────

export interface SignalDefinition {
  key: string;
  description: string;
  expectedStages: Stage[];
  /** Keywords that indicate this signal IS present in a prompt. */
  detectionKeywords: string[];    // full weight — any single match = signal present
  /** Informal vibe-coder phrases at 0.5 weight — 2+ matches required = signal present. */
  vibeKeywords?: string[];
  /** Number of prompts in confirmed stage before checking absence. */
  absenceThreshold: number; // 15–20 per research
  /**
   * Fire on first confident detection, skipping the in-stage accumulation floor
   * (the `promptsInCurrentStage` gate). For right-now signals whose own detector is
   * already confidence-gated (e.g. a mode-vs-stage mismatch); still bounded by the
   * per-signal cooldown + the once-per-session dedup downstream. Default: undefined (gated).
   */
  immediateFire?: boolean;
  /** Project types for which this signal is relevant. undefined = all project types. */
  relevantProjectTypes?: string[];
  /** Dim1: fire only when profile.nature matches. undefined = all natures (universal signal). */
  nature?: UserNature;
  /** Dim2: fire only when configuredRole matches. undefined = all roles (universal signal). */
  role?: UserRole;
}
