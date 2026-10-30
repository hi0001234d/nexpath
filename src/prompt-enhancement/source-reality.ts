import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STAGES, type Stage } from '../classifier/types.js';
import { SIGNAL_MAP } from '../classifier/signals.js';
import { STAGE2_MODEL, buildFullSignalList } from '../classifier/Stage2Trigger.js';
import type { FlagType } from '../classifier/Stage2Trigger.js';
import { STAGE_CLASSIFIER_TIMEOUT_MS } from '../classifier/stage-classifier.js';
import { STREAM_B_TIMEOUT_MS } from '../classifier/StreamBPresenceClassifier.js';
import { SOURCE_CASCADE, contentTemplateEngine, resolveColumn, resolveRecord, resolveRegisterForms } from '../decision-session/content-template-engine.js';
import { autogenAwareLookup, pinchSignalTypeForFlag, shippedRecordLookup } from '../decision-session/content-template-source.js';
import { MIGRATED_SIGNALS, resolveContentSource } from '../decision-session/selection-registry.js';
import { resolvePinchFields } from '../decision-session/signal-pinch-fields.js';
import { SHIPPED_CONTENT_TEMPLATES } from '../decision-session/content-template-tooling.js';
import type { MaturityLevel } from '../decision-session/content-template-schema.js';
import { SCHEMA_VERSION } from '../store/schema.js';
import { DEFAULT_CONFIG } from '../store/config.js';
import type { Store } from '../store/db.js';
import { paramEventsPathFor } from '../telemetry/param-events.js';

export type SourceAuthorization = 'source_fact_only' | 'implementation_input' | 'non_runtime_gate';

export const SOURCE_REALITY_SOURCE_BASIS = {
  currentHead: '3d7dac549a31b01c9323a72389feb0e10d6c660f',
  sourceImpactRange: '4dc2ac1..6114317',
  containedUpstreamCommit: '6114317c6fa453048cd6773e0fdd06403a144494',
} as const;

export interface ContentTemplateSourceSnapshot {
  authorization: SourceAuthorization;
  flagType: FlagType | string;
  stage: Stage | string;
  recordSignalType?: string;
  contentSource: 'content-template' | 'static' | 'none';
  engineName: 'content-template';
  engineRunKind: 'content-template';
  allShippedRecordsEngineServed: boolean;
  migratedSignalCount: number;
  staticContentLayerServesShippedRecords: false;
  recordResolved: boolean;
  resolvedRecordIdentity?: string;
  sourceCascade: readonly string[];
  resolvedSource?: string;
  requestedLevel?: number;
  servedLevel?: number;
  register?: string;
  role?: string;
  registerOverridePath: 'beginner' | 'role' | 'structural-register' | 'base' | 'unresolved';
  hasRegisterOverrides: boolean;
  hasRoleOverrides: boolean;
  safeguardRequired: boolean;
  safeguardLinePresent: boolean;
  slotNames: readonly string[];
  paramAxes: readonly string[];
  shippedRecordCount: number;
  questionServing: 'signal-pinch-fields' | 'unavailable';
  question?: string;
  pinchFallback?: string;
  schemaFields: readonly string[];
  notAuthorized: readonly string[];
}

export function getContentTemplateSourceSnapshot(input: {
  flagType: FlagType | string;
  stage: Stage | string;
  register?: string;
  role?: string;
  level?: number;
  store?: Store;
  projectRoot?: string;
}): ContentTemplateSourceSnapshot {
  const recordSignalType = pinchSignalTypeForFlag(input.flagType, input.stage);
  const contentSource = recordSignalType ? resolveContentSource(recordSignalType) : 'none';
  const lookup = recordSignalType
    ? input.store && input.projectRoot
      ? autogenAwareLookup(input.store, input.projectRoot, recordSignalType)
      : shippedRecordLookup(recordSignalType)
    : undefined;
  const resolved = lookup ? resolveRecord(lookup) : null;
  const pinch = recordSignalType ? resolvePinchFields(recordSignalType, input.register) : undefined;
  const engineRun = contentTemplateEngine.run({
    state: {} as never,
    signalType: recordSignalType,
    level: input.level,
    register: input.register,
    recordLookup: lookup,
  });
  const record = resolved?.record;
  const registerForms = record ? resolveRegisterForms(record, input.register, input.role) : undefined;
  const servedColumn = record && registerForms
    ? resolveColumn({ ...record, levelForms: registerForms }, toMaturityLevel(input.level ?? 1))
    : null;

  return {
    authorization: 'implementation_input',
    flagType: input.flagType,
    stage: input.stage,
    recordSignalType,
    contentSource,
    engineName: 'content-template',
    engineRunKind: engineRun.kind === 'content-template' ? 'content-template' : 'content-template',
    allShippedRecordsEngineServed: MIGRATED_SIGNALS.size === SHIPPED_CONTENT_TEMPLATES.length,
    migratedSignalCount: MIGRATED_SIGNALS.size,
    staticContentLayerServesShippedRecords: false,
    recordResolved: resolved !== null,
    resolvedRecordIdentity: record?.signalType,
    sourceCascade: SOURCE_CASCADE,
    resolvedSource: resolved?.source,
    requestedLevel: input.level,
    servedLevel: servedColumn?.level,
    register: input.register,
    role: input.role,
    registerOverridePath: resolveRegisterOverridePath(record, input.register, input.role),
    hasRegisterOverrides: Object.keys(record?.registerOverrides ?? {}).length > 0,
    hasRoleOverrides: Object.keys(record?.roleOverrides ?? {}).length > 0,
    safeguardRequired: record?.l2SafeguardRequired === true,
    safeguardLinePresent: typeof record?.l2SafeguardLine === 'string' && record.l2SafeguardLine.length > 0,
    slotNames: record?.slots.map((slot) => slot.name) ?? [],
    paramAxes: Object.keys(record?.paramAxes ?? {}),
    shippedRecordCount: SHIPPED_CONTENT_TEMPLATES.length,
    questionServing: pinch ? 'signal-pinch-fields' : 'unavailable',
    question: pinch?.question,
    pinchFallback: pinch?.pinchFallback,
    schemaFields: [
      'question',
      'pinchFallback',
      'registerOverrides',
      'roleOverrides',
      'l2SafeguardRequired',
      'l2SafeguardLine',
    ],
    notAuthorized: [
      'copy_ds_content_templates_into_prompt_enhancement_templates',
      'rename_embed_or_collapse_ds_content_templates_into_pe_templates',
      'revive_static_decision_content_routing',
      'claim_prompt_body_quality_from_ds_template_tests',
      'treat_current_source_as_prompt_enhancement_implementation_proof',
    ],
  };
}

function toMaturityLevel(level: number): MaturityLevel {
  if (level <= 1) return 1;
  if (level >= 5) return 5;
  return Math.round(level) as MaturityLevel;
}

function resolveRegisterOverridePath(
  record: ContentTemplateSourceSnapshotRecord | undefined,
  register?: string,
  role?: string,
): ContentTemplateSourceSnapshot['registerOverridePath'] {
  if (!record) return 'unresolved';
  if (register === 'beginner' && record.registerOverrides?.['beginner']?.divergence === 'structurally-divergent') {
    return 'beginner';
  }
  if (register !== 'beginner' && role && record.roleOverrides?.[role]?.levelForms) {
    return 'role';
  }
  if (register && register !== 'beginner' && record.registerOverrides?.[register]?.divergence === 'structurally-divergent') {
    return 'structural-register';
  }
  return 'base';
}

type ContentTemplateSourceSnapshotRecord = NonNullable<ReturnType<typeof resolveRecord>>['record'];

export interface PromptStartStopSourceSnapshot {
  authorization: SourceAuthorization;
  hookBoundary: 'UserPromptSubmit -> runAuto';
  runAutoCanHoldOrReplaceSubmittedPrompt: false;
  deliveryBoundary: 'Stop -> runStop';
  classifierModel: typeof STAGE2_MODEL;
  classifierTimeoutMs: typeof STAGE_CLASSIFIER_TIMEOUT_MS;
  stages: readonly Stage[];
  sharedSignalCount: number;
  allStageChecklistLineCount: number;
  runAutoOrder: readonly string[];
  streamBThreshold: {
    stage: 'implementation';
    minimumPromptsInCurrentStage: 3;
    timeoutMs: typeof STREAM_B_TIMEOUT_MS;
    failureFallback: 'undefined_keep_vibe_keyword_detection';
  };
  promptStartInputs: readonly string[];
  sourceInputGroups: readonly string[];
  firstTriggerGates: readonly string[];
  classifierDegradedNoFireReasons: readonly string[];
  releaseGuard: 'scaffolding_without_release_verification_forces_no_fire';
  notAuthorized: readonly string[];
}

export function getPromptStartStopSourceSnapshot(): PromptStartStopSourceSnapshot {
  return {
    authorization: 'implementation_input',
    hookBoundary: 'UserPromptSubmit -> runAuto',
    runAutoCanHoldOrReplaceSubmittedPrompt: false,
    deliveryBoundary: 'Stop -> runStop',
    classifierModel: STAGE2_MODEL,
    classifierTimeoutMs: STAGE_CLASSIFIER_TIMEOUT_MS,
    stages: STAGES,
    sharedSignalCount: SIGNAL_MAP.size,
    allStageChecklistLineCount: buildFullSignalList().split('\n').filter(Boolean).length,
    runAutoOrder: [
      'advisory_injected_prompt_echo_guard',
      'record_activity_for_genuine_user_prompt',
      'implicit_project_registration_and_historical_import',
      'insert_current_prompt',
      'load_session_state',
      'resolve_frequency_and_configured_role',
      'profile_refresh_when_stale_and_eligible',
      'configured_role_injection',
      'stream_b_presence_classifier_when_implementation_threshold_allows',
      'single_llm_stage_classifier',
      'process_prompt_and_update_state',
      'transcript_corroboration_when_transcript_path_exists',
      'absence_detection',
      'frequency_and_min_prompt_gates',
      'shouldFireStage2',
      'dedupe_frequency_cooldown_session_cap',
      'classifier_fire_recommendation_gate',
      'effective_fired_source_recording',
      'pending_advisory_for_stop_bridge',
    ],
    streamBThreshold: {
      stage: 'implementation',
      minimumPromptsInCurrentStage: 3,
      timeoutMs: STREAM_B_TIMEOUT_MS,
      failureFallback: 'undefined_keep_vibe_keyword_detection',
    },
    promptStartInputs: [
      'prompt',
      'permission_mode',
      'transcript_path',
      'prevStage',
      'currentStage',
      'effective_fired_source',
      'fired_key',
      'trigger_kind',
      'selected_qualifying_absence',
      'absence_gate_reason',
      'profile',
      'role',
      'mode',
      'stream_b',
      'param_events',
      'RIGHT_GOOD',
      'work_style',
      'runtime_context',
      'content_template_source_outputs',
    ],
    sourceInputGroups: [
      'trigger_authority',
      'grounding_facts',
      'profile_role_mode',
      'param_event_channels',
      'right_good_work_style',
      'content_template_source_outputs',
    ],
    firstTriggerGates: [
      'frequency',
      'minimum_prompts',
      'shouldFireStage2',
      'dedupe',
      'major_only',
      'once_per_session',
      'post_advisory_cooldown',
      'session_advisory_cap',
      'classifier_fire_recommendation',
    ],
    classifierDegradedNoFireReasons: [
      'missing_or_invalid_api_key',
      'api_error_or_network_failure',
      'timeout',
      'empty_model_reply',
      'malformed_or_unparseable_model_reply',
      'low_confidence_below_threshold',
      'release_guard_scaffolding_without_verification_token',
    ],
    releaseGuard: 'scaffolding_without_release_verification_forces_no_fire',
    notAuthorized: [
      'same_turn_prompt_replacement',
      'pe_only_classifier',
      'generic_prompt_intent_popup_authority',
      'raw_signals_absent_popup_authority',
      'stale_active_flags_popup_authority',
      'hook_metadata_popup_authority',
      'low_confidence_local_fallback_popup_authority',
      'transcript_presence_popup_authority',
      'runtime_env_guesses_popup_authority',
      'shadow_or_mutate_decision_session_advisories',
    ],
  };
}

export interface StoreSourceSnapshot {
  authorization: SourceAuthorization;
  schemaVersion: number;
  tableNames: readonly string[];
  promptEnhancementOwnedTables: readonly string[];
  missingPromptEnhancementTables: readonly string[];
  contentTemplatesStoreOnlyUploadedAndAutogen: true;
  userDepthLevelIsPromptEnhancementMemory: false;
  feedbackSignalsArePromptEnhancementFeedbackMemory: false;
  promptStoreMaxDbConfigDrivesBytePressure: false;
  paramEventsPath: string | null;
  paramEventsIsDurablePromptEnhancementMemory: false;
  contentTemplateStoredSources: readonly string[];
  contentTemplateReadValidation: 'invalid_or_newer_rows_return_absent';
  contentTemplateAutogenCleanupScope: 'project_autogen_only';
  feedbackSignalKinds: readonly string[];
  statusCoverage: readonly string[];
  cleanupCoverage: readonly string[];
  cleanupGaps: readonly string[];
  notAuthorized: readonly string[];
}

const SOURCE_TABLES = [
  'config',
  'content_templates',
  'context_memory', // Feature 1 (context engineering), not PE memory
  'delivered_items', // Feature 1 (context engineering), not PE memory
  'feedback_signals',
  'pending_advisories',
  'pending_prompt_enhancements',
  'pending_prompt_sequences',
  'projects',
  'prompt_enhancement_feedback',
  'prompt_enhancement_generated_origin',
  'prompt_enhancement_memory',
  'prompt_enhancement_source_use',
  'prompt_enhancement_status',
  'prompts',
  'session_states',
  'skipped_sessions',
  'user_depth_level',
] as const;

const PROMPT_ENHANCEMENT_OWNED_TABLES = [
  'prompt_enhancement_feedback',
  'prompt_enhancement_generated_origin',
  'prompt_enhancement_memory',
  'prompt_enhancement_source_use',
  'prompt_enhancement_status',
] as const;

const MISSING_PE_TABLES = [
  'prompt_enhancement_bootstrap_status',
  'prompt_enhancement_fixture_result',
] as const;

export function getStoreSourceSnapshot(store?: Store): StoreSourceSnapshot {
  const tableNames = store ? listSqlTables(store) : SOURCE_TABLES;
  const presentTableNames = new Set(tableNames);
  return {
    authorization: 'implementation_input',
    schemaVersion: SCHEMA_VERSION,
    tableNames,
    promptEnhancementOwnedTables: PROMPT_ENHANCEMENT_OWNED_TABLES.filter((tableName) => presentTableNames.has(tableName)),
    missingPromptEnhancementTables: MISSING_PE_TABLES.filter((tableName) => !presentTableNames.has(tableName)),
    contentTemplatesStoreOnlyUploadedAndAutogen: true,
    userDepthLevelIsPromptEnhancementMemory: false,
    feedbackSignalsArePromptEnhancementFeedbackMemory: false,
    promptStoreMaxDbConfigDrivesBytePressure: false,
    paramEventsPath: store ? paramEventsPathFor(store) : null,
    paramEventsIsDurablePromptEnhancementMemory: false,
    contentTemplateStoredSources: ['uploaded', 'autogen'],
    contentTemplateReadValidation: 'invalid_or_newer_rows_return_absent',
    contentTemplateAutogenCleanupScope: 'project_autogen_only',
    feedbackSignalKinds: ['advisory_fired', 'option_selected'],
    statusCoverage: [
      'prompt_store_stats',
      'db_bytes',
      'prompt_enhancement_status',
      'prompt_enhancement_row_counts',
      'prompt_enhancement_estimated_bytes',
      'prompt_enhancement_prune_decay_delete_status',
    ],
    cleanupCoverage: [
      'prompts',
      'skipped_sessions',
      'prompt_enhancement_memory',
      'prompt_enhancement_source_use',
      'prompt_enhancement_generated_origin',
      'prompt_enhancement_feedback',
      'prompt_enhancement_status',
      'pending_prompt_sequences',
      'prompt_enhancement_project_delete',
      'prompt_enhancement_full_delete',
      'prompt_enhancement_prune_decay',
    ],
    cleanupGaps: [
      'content_templates',
      'feedback_signals',
      'user_depth_level',
      'param-events.jsonl',
      'session_states',
      'transcript_cursor_config',
      'ordinary_telemetry',
      'future_pe_bootstrap_status',
      'future_pe_fixture_result',
    ],
    notAuthorized: [
      'reuse_content_templates_as_pe_template_registry',
      'reuse_feedback_signals_as_pe_feedback_memory',
      'reuse_user_depth_level_as_pe_missing_signal_memory',
      'assume_prompt_store_max_db_mb_controls_db_byte_pressure',
      'treat_prompt_fifo_as_pe_cleanup',
      'treat_store_prune_delete_or_status_as_pe_cleanup_status_coverage',
      'treat_param_events_as_pe_quality_proof',
      'treat_param_events_as_durable_pe_memory',
    ],
  };
}

function listSqlTables(store: Store): string[] {
  const result = store.db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  return (result[0]?.values ?? []).map((row) => String(row[0]));
}

export interface HistoricalBootstrapSourceSnapshot {
  authorization: SourceAuthorization;
  sourceClass: 'claude_project_jsonl';
  importCap: 500;
  sourceOrdering: 'jsonl_files_newest_mtime_first';
  importedRowType: 'user_string_messages_only';
  promptRowsAreRedacted: true;
  importsAssistantRows: false;
  importsArrayContent: false;
  writesRawPromptTextToPromptRows: true;
  writesRawPromptTextToParamEvents: false;
  paramEventsSkippedForInMemoryStore: true;
  paramEventsRotateAroundBytes: number;
  paramEventSource: 'historical_import';
  paramEventStage: null;
  canSeedUserDepthLevelThroughSessionBootstrap: true;
  servedRowsAreMemoryAuthority: false;
  transcriptCorroborationIsHistoricalImport: false;
  policyAlternativesWithoutSelection: readonly string[];
  requiredAcceptanceOracles: readonly string[];
  requiredFutureStatuses: readonly string[];
  notAuthorized: readonly string[];
}

export function getHistoricalBootstrapSourceSnapshot(): HistoricalBootstrapSourceSnapshot {
  return {
    authorization: 'source_fact_only',
    sourceClass: 'claude_project_jsonl',
    importCap: 500,
    sourceOrdering: 'jsonl_files_newest_mtime_first',
    importedRowType: 'user_string_messages_only',
    promptRowsAreRedacted: true,
    importsAssistantRows: false,
    importsArrayContent: false,
    writesRawPromptTextToPromptRows: true,
    writesRawPromptTextToParamEvents: false,
    paramEventsSkippedForInMemoryStore: true,
    paramEventsRotateAroundBytes: 5 * 1024 * 1024,
    paramEventSource: 'historical_import',
    paramEventStage: null,
    canSeedUserDepthLevelThroughSessionBootstrap: true,
    servedRowsAreMemoryAuthority: false,
    transcriptCorroborationIsHistoricalImport: false,
    policyAlternativesWithoutSelection: [
      'no_pe_bootstrap',
      'aggregate_only_pe_bootstrap',
      'bounded_event_seed_pe_bootstrap',
    ],
    requiredAcceptanceOracles: [
      'empty_history',
      'existing_prompt_guard',
      'corrupt_lines_and_malformed_unreadable_input',
      'array_content_rejection',
      '500_import_cap',
      'newest_file_ordering',
      'disk_versus_memory_store_behavior',
      'stage_null_historical_events',
      'no_raw_content_in_sidecar_state',
      'idempotent_reimport_retry',
      'delete_reset_prune_coverage',
      'cross_project_isolation',
      'generated_origin_exclusion',
      'deterministic_no_memory_fallback',
    ],
    requiredFutureStatuses: [
      'not_run',
      'no_history',
      'policy_disabled',
      'unsupported_source',
      'malformed_or_unreadable',
      'partial_retryable',
      'stale_or_version_invalid',
      'privacy_rejected',
      'complete',
      'reset',
    ],
    notAuthorized: [
      'implement_historical_bootstrap_task_or_replay_worker',
      'raw_history_reader_for_pe_memory',
      'assistant_responses_as_pe_memory',
      'generated_bodies_as_pe_memory',
      'source_excerpts_or_edit_diffs_as_pe_memory',
      'raw_feedback_as_pe_memory',
      'cross_agent_or_cross_project_import',
      'old_ds_pending_advisories_as_pe_memory',
      'extension_clipboard_state_as_pe_memory',
      'historical_import_as_popup_trigger',
      'historical_import_as_durable_pe_event_log',
      'historical_import_as_current_stage_proof',
      'historical_import_as_behaviour_verified_practice',
      'served_rows_as_bootstrap_or_practice_scoring',
    ],
  };
}

export interface LaunchBoundarySourceSnapshot {
  authorization: SourceAuthorization;
  projectRoot: string;
  sourceBasis: typeof SOURCE_REALITY_SOURCE_BASIS;
  promptEnhancementPathExists: boolean;
  promptEnhancementIgnored: boolean;
  promptEnhancementNestedGitExists: boolean;
  trackedPromptEnhancementFiles: readonly string[];
  extVscodePrebuildsIgnored: boolean;
  trackedExtVscodePrebuildFiles: readonly string[];
  tsconfigIncludesSrcGlob: boolean;
  tsconfigExcludesExtVscode: boolean;
  buildGateIncludesContentTemplateCheck: boolean;
  promptEnhancementSpecificBuildRuleExists: false;
  launchReady: false;
  requiredRecheckAfterImplementation: readonly string[];
  notAuthorized: readonly string[];
}

export function getLaunchBoundarySourceSnapshot(input: {
  projectRoot: string;
  trackedFiles?: readonly string[];
}): LaunchBoundarySourceSnapshot {
  const gitignore = readGitignore(input.projectRoot);
  const tsconfig = readText(join(input.projectRoot, 'tsconfig.json'));
  const packageJson = readText(join(input.projectRoot, 'package.json'));
  const trackedFiles = input.trackedFiles ?? [];
  const promptEnhancementPrefix = 'src/prompt-enhancement/';
  const prebuildPrefix = 'src/ext-vscode/prebuilds/';

  return {
    authorization: 'non_runtime_gate',
    projectRoot: input.projectRoot,
    sourceBasis: SOURCE_REALITY_SOURCE_BASIS,
    promptEnhancementPathExists: existsSync(join(input.projectRoot, 'src/prompt-enhancement')),
    promptEnhancementIgnored: gitignore.includes('src/prompt-enhancement/'),
    promptEnhancementNestedGitExists: existsSync(join(input.projectRoot, 'src/prompt-enhancement/.git')),
    trackedPromptEnhancementFiles: trackedFiles.filter((file) => file.startsWith(promptEnhancementPrefix)),
    extVscodePrebuildsIgnored: gitignore.includes('src/ext-vscode/prebuilds/'),
    trackedExtVscodePrebuildFiles: trackedFiles.filter((file) => file.startsWith(prebuildPrefix)),
    tsconfigIncludesSrcGlob: tsconfig.includes('"src/**/*"'),
    tsconfigExcludesExtVscode: tsconfig.includes('"src/ext-vscode"'),
    buildGateIncludesContentTemplateCheck: packageJson.includes('check-build-gate'),
    promptEnhancementSpecificBuildRuleExists: false,
    launchReady: false,
    requiredRecheckAfterImplementation: [
      'ignore_tracking_state',
      'nested_git_boundary',
      'tracked_file_inventory',
      'import_build_test_inclusion',
      'package_docs_fixture_privacy',
      'private_planning_leakage',
    ],
    notAuthorized: [
      'public_launch_claim',
      'silent_gitignore_rewrite',
      'path_rewrite',
      'treat_ext_vscode_prebuilds_as_pe_source',
      'claim_import_stability_while_pe_source_absent_ignored_private',
      'claim_public_safe_docs_tests_fixtures_while_pe_source_absent_ignored_private',
      'claim_package_inclusion_while_pe_source_absent_ignored_private',
    ],
  };
}

function readGitignore(projectRoot: string): string {
  return readText(join(projectRoot, '.gitignore'));
}

function readText(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

export function getSourceRealityAdaptersSnapshot(input: {
  flagType: FlagType | string;
  stage: Stage | string;
  projectRoot: string;
  register?: string;
  role?: string;
  level?: number;
  store?: Store;
  trackedFiles?: readonly string[];
}) {
  return {
    contentTemplate: getContentTemplateSourceSnapshot(input),
    promptStartStop: getPromptStartStopSourceSnapshot(),
    store: getStoreSourceSnapshot(input.store),
    historicalBootstrap: getHistoricalBootstrapSourceSnapshot(),
    launchBoundary: getLaunchBoundarySourceSnapshot({
      projectRoot: input.projectRoot,
      trackedFiles: input.trackedFiles,
    }),
    currentStoreConfigFacts: {
      promptStoreMaxDbMb: DEFAULT_CONFIG.prompt_store_max_db_mb,
      configDoesNotDriveDbBytePressure: true,
    },
  };
}
