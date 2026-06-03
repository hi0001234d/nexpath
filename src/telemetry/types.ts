export type TelemetryEventName =
  // Pipeline
  | 'prompt_received'
  | 'prompt_classified'
  | 'profile_computed'
  | 'absence_flags_detected'
  | 'stage2_evaluated'
  // Advisory gating
  | 'advisory_min_prompts_blocked'
  | 'advisory_cooldown_blocked'
  | 'advisory_dedup_blocked'
  | 'advisory_cap_blocked'
  | 'advisory_freq_blocked'
  // Outcomes
  | 'pipeline_no_action'
  | 'pipeline_advisory_pending'
  | 'stop_no_pending'
  | 'stop_advisory_shown'
  // Decision session
  | 'decision_session_started'
  | 'level_rendered'
  | 'option_selected'
  | 'decision_session_dismissed'
  | 'decision_session_sim_dismissed'
  // Language detection
  | 'language_detected'
  // Sync self-events
  | 'telemetry_sync_attempt'
  | 'telemetry_sync_success'
  | 'telemetry_sync_failed';

export interface TelemetryEvent {
  ts:              string;
  v:               1;
  // Identity IDs are present on every record once Phase 1 wiring lands at all
  // call sites. They remain optional in the type because some inner call sites
  // (e.g. DecisionSession.runLevel) do not yet receive the store handle — that
  // wiring lands in Phase 3.
  installationId?: string;
  userId?:         string;
  teamId?:         string;
  projectRoot:     string;
  event:           TelemetryEventName;
  [key: string]:   unknown;
}

export interface CursorState {
  inode:          number;
  offset:         number;
  last_synced_ts: string | null;
}

export interface SyncState {
  next_sync_at:         string | null;
  last_attempt_at:      string | null;
  last_success_at:      string | null;
  last_error:           string | null;
  consecutive_failures: number;
}

export interface PostHogSingleEnvelope {
  api_key:     string;
  event:       string;
  distinct_id: string;
  timestamp:   string;
  properties:  Record<string, unknown>;
}
