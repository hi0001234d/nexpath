/**
 * Feature 1 — Context Engineering: Core TypeScript Types & Contracts
 *
 * Locked against:
 *  - CONTEXT-ENGINE-HANDOFF.md
 *  - Feature 3 (BHA) Dynamic Router M8 Contract
 *  - Feature 6 / Ollama Local LLM transparent proxy
 *  - Feature 3 / Desktop Runtime Lead (Ved) Contract
 */

// ============================================================================
// 1. Workspace Context & Prompt Enhancement Entry Contract
// ============================================================================

export interface WorkspaceContext {
  /** Canonical workspace path (normalized via canonicalizeCwd) */
  workspacePath: string;
  /** Currently active file in the editor (optional) */
  activeFilePath?: string;
  /** Active git branch (optional) */
  gitBranch?: string;
  /** Git status clean/dirty summary (optional) */
  gitStatus?: string;
  /** Recently modified files in the session (optional) */
  recentModifiedFiles?: string[];
  /** Desktop session credential token (npd_... injected by Desktop Runtime) */
  deviceToken?: string;
  /** Hardware device ID (injected by Desktop Runtime) */
  deviceId?: string;
  /** Custom data directory for ~/.nexpath persistence (optional) */
  dataDir?: string;
  /** Pre-opened Store instance (optional, for in-memory tests or shared runtime) */
  store?: any;
  /** Active session ID (optional) */
  sessionId?: string;
}

/** Alias for Desktop Runtime Lead (Ved) integration contract */
export type F1Context = WorkspaceContext;

export interface TurnPayload {
  prompt: string;
  response: string;
  gitDiff?: string;
  turnNumber?: number;
}

export type EnhancementStage =
  | 'idea'
  | 'prd'
  | 'architecture'
  | 'task_breakdown'
  | 'implementation'
  | 'review_testing'
  | 'release'
  | 'feedback_loop'
  | 'fallback';

export interface PromptSection {
  id: string;
  title: string;
  lines: string[];
  isMandatorySurvivorSection: boolean;
}

export interface EnhancementResult {
  /** True if context was attached; triggers the 6-second Cancel Toast */
  isEnhanced: boolean;
  /** Final enhanced prompt with injected context fences */
  enhancedPrompt: string;
  /** Detected lifecycle stage */
  stage: EnhancementStage;
  /** Confidence in stage classification (0.0 to 1.0) */
  stageConfidence: number;
  /** Tags of injected facts, e.g. ["@file:auth.ts", "@rule:payment-retry"] */
  injectedContextTags: string[];
  /** Estimated token count of injected context */
  contextTokenEstimate: number;
  /** Total processing latency in milliseconds */
  processingTimeMs: number;
}

/** EnhancementResult plus the Two-Tier sections, for the CLI popup (not part of the Ved contract) */
export interface EnhancementResultWithSections extends EnhancementResult {
  sections?: PromptSection[];
  /** The facts placed in `sections`, with what the CLI needs to hand them to Nexpath's writer. */
  facts?: Feature1SelectedFact[];
}

/** One memory fact Feature 1 selected for a prompt (CLI only; not part of the 7-field contract). */
export interface Feature1SelectedFact {
  id: number;
  kind: ContextMemoryKind;
  locked: boolean;
  content: string;
  /** Id of the section it was routed to, e.g. 'context_and_constraints'. */
  sectionId: string;
}

export interface EnhancementOptions {
  /** Hard timeout ceiling in ms (default: 2500ms) */
  timeoutMs?: number;
  /** Abort signal for immediate cancellation */
  signal?: AbortSignal;
  /** Bypass the 6-second Cancel Toast for headless/automated runs */
  bypassCancelToast?: boolean;
  /** Force LLM synthesis via Feature 3 / Feature 6 / Cloud Pro */
  delegateToLlm?: boolean;
  /**
   * Record the facts as delivered for this session (default true). The CLI passes false and
   * records them itself, only once Nexpath has actually decided to show its popup.
   */
  recordDelivery?: boolean;
  /**
   * Skip Feature 1's own LLM rewrite (F3 + local/cloud). Used when Nexpath's writer AI
   * does the writing and Feature 1 only supplies memory.
   */
  skipLlmRewrite?: boolean;
  /** Custom F3 router client instance */
  f3Client?: any;
  /** Local model execution allowed (defaults to true) */
  localAllowed?: boolean;
  /** F3 router base URL. Wins over NEXPATH_F3_URL; default https://parseos.tech. */
  f3BaseUrl?: string;
  /** Cloud Pro chat-completions URL. Wins over NEXPATH_CLOUD_PRO_URL; default parseos.tech. */
  cloudProUrl?: string;
  /** Custom bridge or local execution options */
  localExecutionOptions?: {
    bridgePort?: number;
    bridgeUrl?: string;
    timeoutMs?: number;
    deviceToken?: string;
    deviceId?: string;
  };
}

// ============================================================================
// 2. Feature 3 (BHA) Dynamic Engine Router (Milestone M8)
// ============================================================================

export type F3CallKind =
  | 'stage_classifier'
  | 'pe_composer'
  | 'route_rescue'
  | 'sequence_planner'
  | 'sequence_batch'
  | 'profile_classifier'
  | 'stream_b'
  | 'queue_rank'
  | 'sensitive_action';

export type F3Language = 'en' | 'hi' | 'hi-Latn' | 'gu' | 'gu-Latn' | string;

export type F3FailType =
  | 'LOCAL_TIMEOUT'
  | 'LOCAL_ERROR'
  | 'CONNECT_FAILED'
  | 'BAD_OUTPUT'
  | 'PRO_ERROR'
  | 'timeout'
  | 'conn_refused'
  | 'http_5xx'
  | 'parse_error'
  | 'cancelled';

export interface F3ResourceRequest {
  requestId: string;
  callKind: F3CallKind;
  approxInputTokens: number;
  typicalOutputTokens: number;
  maxOutputTokens: number;
  timeoutMs: number;
  needsJson: boolean;
  language: F3Language;
  background: boolean;
  localAllowed: boolean;
}

export interface F3LanDevice {
  deviceId: string;
  tier: string;
  model: string;
  endpoint: string; // Iroh node ID / peer address
}

export interface F3ResourceDecision {
  decisionId: string;
  target: 'local' | 'pro';
  reason: string;
  lanDevice: F3LanDevice | null;
  pro: { model: string } | null;
}

export interface F3ResourceResultReport {
  decisionId: string;
  ranOn: 'local' | 'pro';
  ok: boolean;
  latencyMs: number;
  failType: F3FailType | null; // Mandatory when ok=false or fellBackToPro=true
  fellBackToPro: boolean;
}

// ============================================================================
// 3. Feature 6 / Ollama Local LLM Execution Contracts (Iroh Proxy)
// ============================================================================

export interface LocalChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LocalChatCompletionRequest {
  model: string; // Passed verbatim (e.g. "qwen2.5-coder:7b")
  messages: LocalChatMessage[];
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: 'json_object' };
}

export interface LocalChatCompletionResponse {
  id: string;
  choices: Array<{
    index: number;
    message: LocalChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================================================
// 4. Historical Map & Context Memory Data Contracts
// ============================================================================

export type ContextMemoryKind =
  | 'decision'
  | 'convention'
  | 'constraint'
  | 'pattern'
  | 'rule'
  | 'failure'
  | 'intent'
  | 'pattern_alert';

export interface ContextIdentity {
  file?: string;
  symbol?: string;
  type?: 'file' | 'function' | 'class' | 'interface';
}

export interface ContextMemoryRow {
  id: number;
  project_root: string;
  kind: ContextMemoryKind;
  key: string;
  content: string;
  verbatim: string | null;
  identities: ContextIdentity[] | null;
  locked: number; // 0 = unlocked, 1 = locked
  confidence: number; // 0.0 to 1.0
  staleness: string | null; // e.g. "code_changed_since"
  superseded_by: number | null; // Pointer to replacement ID
  active: number; // 1 = active, 0 = inactive/superseded
  evidence: string | null;
  created_at: number;
  updated_at: number;
}

export interface InsertContextMemoryInput {
  projectRoot: string;
  kind: ContextMemoryKind;
  key: string;
  content: string;
  verbatim?: string;
  identities?: ContextIdentity[];
  locked?: boolean;
  confidence?: number;
  evidence?: string;
}

export interface DeliveredItemRow {
  id: number;
  project_root: string;
  session_id: string | null;
  raw_prompt: string;
  enhanced_prompt: string;
  is_enhanced: number; // 0 or 1
  stage: string;
  stage_confidence: number;
  injected_context_tags: string[];
  context_token_estimate: number;
  processing_time_ms: number;
  created_at: number;
}

export interface InsertDeliveredItemInput {
  projectRoot: string;
  sessionId?: string;
  rawPrompt: string;
  enhancedPrompt: string;
  isEnhanced: boolean;
  stage: string;
  stageConfidence: number;
  injectedContextTags: string[];
  contextTokenEstimate: number;
  processingTimeMs: number;
}

// ============================================================================
// 5. Phase 3: Retrieval, Gap Detection & Budget Ranking Contracts
// ============================================================================

export type GapCategory = 'missing_file' | 'missing_error' | 'ambiguous_intent';

export interface DetectedGap {
  category: GapCategory;
  rawToken: string;
  suggestedQuery: string;
  resolvedFromWorkspace?: string;
}

export interface GapAnalysisResult {
  hasGaps: boolean;
  gaps: DetectedGap[];
  executionTimeMs: number;
}

export type TaskType = 'bugfix' | 'feature' | 'refactor' | 'test' | 'config' | 'general';

export interface TaskClassification {
  taskType: TaskType;
  confidence: number;
  matchedKeywords: string[];
}

export interface ScoreBreakdown {
  keywordMatch: number;
  confidence: number;
  recencyDecay: number;
  fileProximity: number;
}

export interface ScoredFact {
  fact: ContextMemoryRow;
  score: number;
  breakdown: ScoreBreakdown;
  formattedLine: string;
  tag: string;
}

export interface BudgetRankingOptions {
  sessionId?: string;
  deliveredMemoryIds?: Set<number>;
  deliveredTags?: Set<string>;
  context?: WorkspaceContext;
  maxTotalLines?: number; // Defaults to 10
}

export interface BudgetRankingResult {
  allocatedLines: ScoredFact[];
  workspaceLines: string[];
  totalLines: number;
  taskType: TaskType;
  deduplicatedCount: number;
  executionTimeMs: number;
}

// ============================================================================
// 6. Phase 5: Work-Pattern Learner (R3) & Post-Session Contracts
// ============================================================================

export type PatternAlertCategory = 'under_implemented' | 'behavioral_drift' | 'operational_risk';

export interface PatternAlert {
  kind: 'pattern_alert';
  category: PatternAlertCategory;
  text: string;
  targetFile?: string;
  evidence: string;
  confidence: number;
  key?: string;
}

export interface SessionTurn {
  prompt: string;
  response: string;
  turnNumber?: number;
  timestamp?: number;
}

export interface PostSessionAnalysisResult {
  sessionId?: string;
  projectId: string;
  alerts: PatternAlert[];
  resolvedAlertIds: number[];
  executionTimeMs: number;
}

export type AnalysisTriggerReason = 'rolling_checkpoint' | 'session_close' | 'inactivity_boundary';

