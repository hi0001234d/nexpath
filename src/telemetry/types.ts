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
  | 'decision_session_sim_dismissed';

export interface TelemetryEvent {
  ts:          string;
  v:           1;
  projectRoot: string;
  event:       TelemetryEventName;
  [key: string]: unknown;
}
