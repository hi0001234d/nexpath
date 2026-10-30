import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { SIGNAL_MAP } from '../classifier/signals.js';
import { STAGE2_MODEL } from '../classifier/Stage2Trigger.js';
import { openStore, closeStore, type Store } from '../store/db.js';
import {
  getContentTemplateSourceSnapshot,
  getHistoricalBootstrapSourceSnapshot,
  getLaunchBoundarySourceSnapshot,
  getPromptStartStopSourceSnapshot,
  getSourceRealityAdaptersSnapshot,
  getStoreSourceSnapshot,
} from './source-reality.js';

describe('prompt-enhancement source-reality adapters', () => {
  let store: Store | null = null;
  const tempDirs: string[] = [];

  afterEach(() => {
    if (store) {
      closeStore(store);
      store = null;
    }
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('adapts decision-session content-template facts without copying DS content', () => {
    const snapshot = getContentTemplateSourceSnapshot({
      flagType: 'absence:debugging_observation_gap',
      stage: 'implementation',
      register: 'beginner',
    });

    expect(snapshot.authorization).toBe('implementation_input');
    expect(snapshot.recordSignalType).toBe('ABSENCE_DEBUGGING_OBSERVATION');
    expect(snapshot.contentSource).toBe('content-template');
    expect(snapshot.engineName).toBe('content-template');
    expect(snapshot.engineRunKind).toBe('content-template');
    expect(snapshot.allShippedRecordsEngineServed).toBe(true);
    expect(snapshot.migratedSignalCount).toBe(144);
    expect(snapshot.staticContentLayerServesShippedRecords).toBe(false);
    expect(snapshot.recordResolved).toBe(true);
    expect(snapshot.resolvedRecordIdentity).toBe('ABSENCE_DEBUGGING_OBSERVATION');
    expect(snapshot.resolvedSource).toBe('shipped');
    expect(snapshot.sourceCascade).toEqual(['uploaded', 'autogen', 'shipped', 'default']);
    expect(snapshot.registerOverridePath).toBe('base');
    expect(snapshot.hasRegisterOverrides).toBe(false);
    expect(snapshot.hasRoleOverrides).toBe(false);
    expect(snapshot.safeguardRequired).toBe(false);
    expect(snapshot.safeguardLinePresent).toBe(false);
    expect(snapshot.slotNames).toEqual([]);
    expect(snapshot.paramAxes).toContain('workflow_pattern');
    expect(snapshot.shippedRecordCount).toBe(144);
    expect(snapshot.questionServing).toBe('signal-pinch-fields');
    expect(snapshot.question).toContain('what did you actually see');
    expect(snapshot.schemaFields).toEqual([
      'question',
      'pinchFallback',
      'registerOverrides',
      'roleOverrides',
      'l2SafeguardRequired',
      'l2SafeguardLine',
    ]);
    expect(snapshot.notAuthorized).toContain('copy_ds_content_templates_into_prompt_enhancement_templates');
    expect(snapshot.notAuthorized).toContain('revive_static_decision_content_routing');
    expect(snapshot.notAuthorized).toContain('treat_current_source_as_prompt_enhancement_implementation_proof');
  });

  it('adapts stage-transition content-template facts through the Stop-side signal mapping', () => {
    const snapshot = getContentTemplateSourceSnapshot({
      flagType: 'stage_transition',
      stage: 'review_testing',
      register: 'formal',
      level: 3,
    });

    expect(snapshot.recordSignalType).toBe('IMPLEMENTATION_TO_REVIEW');
    expect(snapshot.contentSource).toBe('content-template');
    expect(snapshot.recordResolved).toBe(true);
    expect(snapshot.requestedLevel).toBe(3);
    expect(snapshot.servedLevel).toBeGreaterThanOrEqual(1);
    expect(snapshot.questionServing).toBe('signal-pinch-fields');
  });

  it('exposes register/role and safeguard metadata without exposing records as PE templates', () => {
    const roleSnapshot = getContentTemplateSourceSnapshot({
      flagType: 'absence:context_loss',
      stage: 'implementation',
      register: 'formal',
      role: 'founder',
    });
    const sensitiveSnapshot = getContentTemplateSourceSnapshot({
      flagType: 'absence:environment_and_secrets',
      stage: 'implementation',
    });

    expect(roleSnapshot.recordSignalType).toBe('ABSENCE_CONTEXT_LOSS');
    expect(roleSnapshot.hasRoleOverrides).toBe(true);
    expect(roleSnapshot.registerOverridePath).toBe('role');
    expect(sensitiveSnapshot.recordSignalType).toBe('ABSENCE_ENV_AND_SECRETS');
    expect(sensitiveSnapshot.safeguardRequired).toBe(true);
    expect(sensitiveSnapshot.safeguardLinePresent).toBe(true);
    expect(sensitiveSnapshot.notAuthorized).toContain('copy_ds_content_templates_into_prompt_enhancement_templates');
  });

  it('adapts prompt-start and Stop source boundaries as read-only facts', () => {
    const snapshot = getPromptStartStopSourceSnapshot();

    expect(snapshot.hookBoundary).toBe('UserPromptSubmit -> runAuto');
    expect(snapshot.runAutoCanHoldOrReplaceSubmittedPrompt).toBe(false);
    expect(snapshot.deliveryBoundary).toBe('Stop -> runStop');
    expect(snapshot.classifierModel).toBe(STAGE2_MODEL);
    expect(snapshot.classifierTimeoutMs).toBe(12_000);
    expect(snapshot.sharedSignalCount).toBe(SIGNAL_MAP.size);
    expect(snapshot.allStageChecklistLineCount).toBeGreaterThan(130);
    expect(snapshot.runAutoOrder).toEqual([
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
    ]);
    expect(snapshot.streamBThreshold).toEqual({
      stage: 'implementation',
      minimumPromptsInCurrentStage: 3,
      timeoutMs: 5_000,
      failureFallback: 'undefined_keep_vibe_keyword_detection',
    });
    expect(snapshot.promptStartInputs).toContain('effective_fired_source');
    expect(snapshot.promptStartInputs).toContain('selected_qualifying_absence');
    expect(snapshot.promptStartInputs).toContain('RIGHT_GOOD');
    expect(snapshot.promptStartInputs).toContain('content_template_source_outputs');
    expect(snapshot.sourceInputGroups).toEqual([
      'trigger_authority',
      'grounding_facts',
      'profile_role_mode',
      'param_event_channels',
      'right_good_work_style',
      'content_template_source_outputs',
    ]);
    expect(snapshot.stages).toEqual([
      'idea',
      'prd',
      'architecture',
      'task_breakdown',
      'implementation',
      'review_testing',
      'release',
      'feedback_loop',
    ]);
    expect(snapshot.firstTriggerGates).toContain('classifier_fire_recommendation');
    expect(snapshot.classifierDegradedNoFireReasons).toContain('missing_or_invalid_api_key');
    expect(snapshot.classifierDegradedNoFireReasons).toContain('malformed_or_unparseable_model_reply');
    expect(snapshot.classifierDegradedNoFireReasons).toContain('release_guard_scaffolding_without_verification_token');
    expect(snapshot.releaseGuard).toBe('scaffolding_without_release_verification_forces_no_fire');
    expect(snapshot.notAuthorized).toContain('same_turn_prompt_replacement');
    expect(snapshot.notAuthorized).toContain('pe_only_classifier');
    expect(snapshot.notAuthorized).toContain('generic_prompt_intent_popup_authority');
    expect(snapshot.notAuthorized).toContain('stale_active_flags_popup_authority');
    expect(snapshot.notAuthorized).toContain('hook_metadata_popup_authority');
    expect(snapshot.notAuthorized).toContain('low_confidence_local_fallback_popup_authority');
    expect(snapshot.notAuthorized).toContain('transcript_presence_popup_authority');
    expect(snapshot.notAuthorized).toContain('runtime_env_guesses_popup_authority');
  });

  it('adapts existing store/schema reality without treating old stores as PE memory', async () => {
    store = await openStore(':memory:');
    const snapshot = getStoreSourceSnapshot(store);

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.tableNames).toEqual([
      'config',
      'content_templates',
      'context_memory',
      'delivered_items',
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
    ]);
    expect(snapshot.promptEnhancementOwnedTables).toEqual([
      'prompt_enhancement_feedback',
      'prompt_enhancement_generated_origin',
      'prompt_enhancement_memory',
      'prompt_enhancement_source_use',
      'prompt_enhancement_status',
    ]);
    expect(snapshot.missingPromptEnhancementTables).not.toContain('prompt_enhancement_memory');
    expect(snapshot.missingPromptEnhancementTables).not.toContain('prompt_enhancement_source_use');
    expect(snapshot.missingPromptEnhancementTables).not.toContain('prompt_enhancement_generated_origin');
    expect(snapshot.missingPromptEnhancementTables).not.toContain('prompt_enhancement_feedback');
    expect(snapshot.missingPromptEnhancementTables).not.toContain('prompt_enhancement_status');
    expect(snapshot.missingPromptEnhancementTables).toContain('prompt_enhancement_bootstrap_status');
    expect(snapshot.missingPromptEnhancementTables).toContain('prompt_enhancement_fixture_result');
    expect(snapshot.contentTemplatesStoreOnlyUploadedAndAutogen).toBe(true);
    expect(snapshot.contentTemplateStoredSources).toEqual(['uploaded', 'autogen']);
    expect(snapshot.contentTemplateReadValidation).toBe('invalid_or_newer_rows_return_absent');
    expect(snapshot.contentTemplateAutogenCleanupScope).toBe('project_autogen_only');
    expect(snapshot.userDepthLevelIsPromptEnhancementMemory).toBe(false);
    expect(snapshot.feedbackSignalsArePromptEnhancementFeedbackMemory).toBe(false);
    expect(snapshot.feedbackSignalKinds).toEqual(['advisory_fired', 'option_selected']);
    expect(snapshot.promptStoreMaxDbConfigDrivesBytePressure).toBe(false);
    expect(snapshot.paramEventsPath).toBeNull();
    expect(snapshot.paramEventsIsDurablePromptEnhancementMemory).toBe(false);
    expect(snapshot.statusCoverage).toEqual([
      'prompt_store_stats',
      'db_bytes',
      'prompt_enhancement_status',
      'prompt_enhancement_row_counts',
      'prompt_enhancement_estimated_bytes',
      'prompt_enhancement_prune_decay_delete_status',
    ]);
    expect(snapshot.cleanupCoverage).toEqual([
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
    ]);
    expect(snapshot.cleanupGaps).toContain('future_pe_bootstrap_status');
    expect(snapshot.cleanupGaps).toContain('future_pe_fixture_result');
    expect(snapshot.cleanupGaps).toContain('param-events.jsonl');
    expect(snapshot.cleanupGaps).toContain('ordinary_telemetry');
    expect(snapshot.notAuthorized).toContain('assume_prompt_store_max_db_mb_controls_db_byte_pressure');
    expect(snapshot.notAuthorized).toContain('treat_store_prune_delete_or_status_as_pe_cleanup_status_coverage');
    expect(snapshot.notAuthorized).toContain('treat_param_events_as_durable_pe_memory');
  });

  it('adapts historical-bootstrap constraints as candidate evidence only', () => {
    const snapshot = getHistoricalBootstrapSourceSnapshot();

    expect(snapshot.authorization).toBe('source_fact_only');
    expect(snapshot.sourceClass).toBe('claude_project_jsonl');
    expect(snapshot.importCap).toBe(500);
    expect(snapshot.sourceOrdering).toBe('jsonl_files_newest_mtime_first');
    expect(snapshot.importedRowType).toBe('user_string_messages_only');
    expect(snapshot.promptRowsAreRedacted).toBe(true);
    expect(snapshot.importsAssistantRows).toBe(false);
    expect(snapshot.importsArrayContent).toBe(false);
    expect(snapshot.writesRawPromptTextToPromptRows).toBe(true);
    expect(snapshot.writesRawPromptTextToParamEvents).toBe(false);
    expect(snapshot.paramEventsSkippedForInMemoryStore).toBe(true);
    expect(snapshot.paramEventsRotateAroundBytes).toBe(5 * 1024 * 1024);
    expect(snapshot.paramEventSource).toBe('historical_import');
    expect(snapshot.paramEventStage).toBeNull();
    expect(snapshot.servedRowsAreMemoryAuthority).toBe(false);
    expect(snapshot.transcriptCorroborationIsHistoricalImport).toBe(false);
    expect(snapshot.policyAlternativesWithoutSelection).toEqual([
      'no_pe_bootstrap',
      'aggregate_only_pe_bootstrap',
      'bounded_event_seed_pe_bootstrap',
    ]);
    expect(snapshot.requiredAcceptanceOracles).toContain('delete_reset_prune_coverage');
    expect(snapshot.requiredAcceptanceOracles).toContain('generated_origin_exclusion');
    expect(snapshot.requiredAcceptanceOracles).toContain('deterministic_no_memory_fallback');
    expect(snapshot.requiredFutureStatuses).toContain('privacy_rejected');
    expect(snapshot.notAuthorized).toContain('historical_import_as_popup_trigger');
    expect(snapshot.notAuthorized).toContain('assistant_responses_as_pe_memory');
    expect(snapshot.notAuthorized).toContain('generated_bodies_as_pe_memory');
    expect(snapshot.notAuthorized).toContain('source_excerpts_or_edit_diffs_as_pe_memory');
    expect(snapshot.notAuthorized).toContain('old_ds_pending_advisories_as_pe_memory');
    expect(snapshot.notAuthorized).toContain('extension_clipboard_state_as_pe_memory');
    expect(snapshot.notAuthorized).toContain('historical_import_as_current_stage_proof');
  });

  it('adapts launch-boundary checks as non-runtime gates', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'nexpath-pe-launch-'));
    tempDirs.push(projectRoot);
    mkdirSync(join(projectRoot, 'src/prompt-enhancement/.git'), { recursive: true });
    mkdirSync(join(projectRoot, 'src/ext-vscode'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.gitignore'),
      'dist/\nsrc/prompt-enhancement/\nsrc/ext-vscode/prebuilds/\n',
      'utf8',
    );
    writeFileSync(join(projectRoot, 'tsconfig.json'), '{"include":["src/**/*"],"exclude":["src/ext-vscode"]}', 'utf8');
    writeFileSync(join(projectRoot, 'package.json'), '{"scripts":{"prebuild":"tsx scripts/check-build-gate.ts"}}', 'utf8');

    const snapshot = getLaunchBoundarySourceSnapshot({
      projectRoot,
      trackedFiles: [
        'src/prompt-enhancement/source-reality.ts',
        'src/ext-vscode/prebuilds/native.node',
        'src/cli/index.ts',
      ],
    });

    expect(snapshot.authorization).toBe('non_runtime_gate');
    expect(snapshot.sourceBasis).toEqual({
      currentHead: '3d7dac549a31b01c9323a72389feb0e10d6c660f',
      sourceImpactRange: '4dc2ac1..6114317',
      containedUpstreamCommit: '6114317c6fa453048cd6773e0fdd06403a144494',
    });
    expect(snapshot.promptEnhancementPathExists).toBe(true);
    expect(snapshot.promptEnhancementIgnored).toBe(true);
    expect(snapshot.promptEnhancementNestedGitExists).toBe(true);
    expect(snapshot.trackedPromptEnhancementFiles).toEqual(['src/prompt-enhancement/source-reality.ts']);
    expect(snapshot.extVscodePrebuildsIgnored).toBe(true);
    expect(snapshot.trackedExtVscodePrebuildFiles).toEqual(['src/ext-vscode/prebuilds/native.node']);
    expect(snapshot.tsconfigIncludesSrcGlob).toBe(true);
    expect(snapshot.tsconfigExcludesExtVscode).toBe(true);
    expect(snapshot.buildGateIncludesContentTemplateCheck).toBe(true);
    expect(snapshot.promptEnhancementSpecificBuildRuleExists).toBe(false);
    expect(snapshot.launchReady).toBe(false);
    expect(snapshot.requiredRecheckAfterImplementation).toContain('private_planning_leakage');
    expect(snapshot.notAuthorized).toContain('public_launch_claim');
    expect(snapshot.notAuthorized).toContain('claim_import_stability_while_pe_source_absent_ignored_private');
    expect(snapshot.notAuthorized).toContain('claim_public_safe_docs_tests_fixtures_while_pe_source_absent_ignored_private');
    expect(snapshot.notAuthorized).toContain('claim_package_inclusion_while_pe_source_absent_ignored_private');
  });

  it('builds one combined Phase 1 source-reality snapshot', async () => {
    store = await openStore(':memory:');
    const projectRoot = mkdtempSync(join(tmpdir(), 'nexpath-pe-combined-'));
    tempDirs.push(projectRoot);
    mkdirSync(join(projectRoot, 'src/prompt-enhancement'), { recursive: true });
    writeFileSync(join(projectRoot, '.gitignore'), 'src/prompt-enhancement/\n', 'utf8');

    const snapshot = getSourceRealityAdaptersSnapshot({
      flagType: 'absence:debugging_observation_gap',
      stage: 'implementation',
      register: 'formal',
      role: 'founder',
      level: 3,
      projectRoot,
      store,
      trackedFiles: [],
    });

    expect(snapshot.contentTemplate.recordSignalType).toBe('ABSENCE_DEBUGGING_OBSERVATION');
    expect(snapshot.contentTemplate.register).toBe('formal');
    expect(snapshot.contentTemplate.role).toBe('founder');
    expect(snapshot.contentTemplate.requestedLevel).toBe(3);
    expect(snapshot.promptStartStop.runAutoCanHoldOrReplaceSubmittedPrompt).toBe(false);
    expect(snapshot.store.paramEventsPath).toBeNull();
    expect(snapshot.historicalBootstrap.authorization).toBe('source_fact_only');
    expect(snapshot.launchBoundary.launchReady).toBe(false);
    expect(snapshot.currentStoreConfigFacts.promptStoreMaxDbMb).toBe('100');
    expect(snapshot.currentStoreConfigFacts.configDoesNotDriveDbBytePressure).toBe(true);
  });
});
