import { describe, it, expect } from 'vitest';
import { FREQUENCY_LEVEL_CONFIGS, OPTIMUM_LEVEL_CONFIG, resolveFrequencyConfig } from './GlobalConfig.js';
import {
  STAGE2_LLM_MIN_CONFIDENCE,
  STAGE2_CONTEXT_WINDOW,
  STAGE2_S1_LOW_CONFIDENCE,
} from '../classifier/Stage2Trigger.js';
import { MIN_STAGE_CHANGE_CONFIDENCE } from '../classifier/SessionStateManager.js';

/**
 * Zero-behavior-change assertions: every_event GlobalConfig values must exactly
 * match the hardcoded constants that were in place before GlobalConfig was introduced.
 * These tests are the contract — if either the constant or the config value changes,
 * the migration is no longer backward-compatible and this file will catch it.
 */
describe('GlobalConfig — every_event backward compatibility', () => {
  const cfg = FREQUENCY_LEVEL_CONFIGS.every_event;

  it('minPromptsBeforeAdvisory matches previous hardcoded constant (3)', () => {
    expect(cfg.minPromptsBeforeAdvisory).toBe(3);
  });

  it('postAdvisoryCooldown matches previous hardcoded constant (5)', () => {
    expect(cfg.postAdvisoryCooldown).toBe(5);
  });

  it('sessionAdvisoryCapDefault matches previous hardcoded constant (5)', () => {
    expect(cfg.sessionAdvisoryCapDefault).toBe(5);
  });

  it('sessionAdvisoryCapVibe matches previous hardcoded constant (10)', () => {
    expect(cfg.sessionAdvisoryCapVibe).toBe(10);
  });

  it('stage2MinConfidence matches STAGE2_LLM_MIN_CONFIDENCE', () => {
    expect(cfg.stage2MinConfidence).toBe(STAGE2_LLM_MIN_CONFIDENCE);
  });

  it('stage2ContextWindow matches STAGE2_CONTEXT_WINDOW', () => {
    expect(cfg.stage2ContextWindow).toBe(STAGE2_CONTEXT_WINDOW);
  });

  it('stage2S1LowConfidence matches STAGE2_S1_LOW_CONFIDENCE', () => {
    expect(cfg.stage2S1LowConfidence).toBe(STAGE2_S1_LOW_CONFIDENCE);
  });

  it('signalAbsenceThresholdMultiplier is 1.0 (no multiplier effect)', () => {
    expect(cfg.signalAbsenceThresholdMultiplier).toBe(1.0);
  });

  it('minStageChangeConfidence matches MIN_STAGE_CHANGE_CONFIDENCE', () => {
    expect(cfg.minStageChangeConfidence).toBe(MIN_STAGE_CHANGE_CONFIDENCE);
  });
});

describe('GlobalConfig — resolveFrequencyConfig', () => {
  it('returns the correct config object for each level', () => {
    for (const level of ['off', 'major_only', 'once_per_session', 'every_event', 'optimum'] as const) {
      expect(resolveFrequencyConfig(level)).toBe(FREQUENCY_LEVEL_CONFIGS[level]);
    }
  });

  it('off level has minPromptsBeforeAdvisory of 999 (effectively disabled)', () => {
    expect(FREQUENCY_LEVEL_CONFIGS.off.minPromptsBeforeAdvisory).toBe(999);
  });

  it('off level has sessionAdvisoryCapDefault of 0', () => {
    expect(FREQUENCY_LEVEL_CONFIGS.off.sessionAdvisoryCapDefault).toBe(0);
  });

  it('once_per_session level has sessionAdvisoryCapDefault of 1', () => {
    expect(FREQUENCY_LEVEL_CONFIGS.once_per_session.sessionAdvisoryCapDefault).toBe(1);
  });

  it('major_only level has postAdvisoryCooldown of 10', () => {
    expect(FREQUENCY_LEVEL_CONFIGS.major_only.postAdvisoryCooldown).toBe(10);
  });
});

describe('GlobalConfig — optimum level activation', () => {
  it('optimum is a selectable level in FREQUENCY_LEVEL_CONFIGS', () => {
    expect(FREQUENCY_LEVEL_CONFIGS.optimum).toBeDefined();
  });

  it('FREQUENCY_LEVEL_CONFIGS.optimum is the same object as OPTIMUM_LEVEL_CONFIG', () => {
    expect(FREQUENCY_LEVEL_CONFIGS.optimum).toBe(OPTIMUM_LEVEL_CONFIG);
  });

  it('resolveFrequencyConfig("optimum") returns the optimum config', () => {
    expect(resolveFrequencyConfig('optimum')).toBe(FREQUENCY_LEVEL_CONFIGS.optimum);
  });
});

// ── optimum cap validation ────────────────────────────────────────────────────

describe('GlobalConfig — OPTIMUM_LEVEL_CONFIG cap values (Stream C validation)', () => {
  it('sessionAdvisoryCapDefault is 20', () => {
    expect(OPTIMUM_LEVEL_CONFIG.sessionAdvisoryCapDefault).toBe(20);
  });

  it('sessionAdvisoryCapVibe is 30', () => {
    expect(OPTIMUM_LEVEL_CONFIG.sessionAdvisoryCapVibe).toBe(30);
  });

  it('sessionAdvisoryCapDefault 20 is 4× the every_event cap of 5', () => {
    expect(OPTIMUM_LEVEL_CONFIG.sessionAdvisoryCapDefault).toBe(
      4 * FREQUENCY_LEVEL_CONFIGS.every_event.sessionAdvisoryCapDefault,
    );
  });

  it('sessionAdvisoryCapVibe 30 is 3× the every_event vibe cap of 10', () => {
    expect(OPTIMUM_LEVEL_CONFIG.sessionAdvisoryCapVibe).toBe(
      3 * FREQUENCY_LEVEL_CONFIGS.every_event.sessionAdvisoryCapVibe,
    );
  });

  it('postAdvisoryCooldown is 2 (tight cooldown for high-frequency target)', () => {
    expect(OPTIMUM_LEVEL_CONFIG.postAdvisoryCooldown).toBe(2);
  });

  it('signalAbsenceThresholdMultiplier is 0.25 (75% reduction on all signal thresholds)', () => {
    expect(OPTIMUM_LEVEL_CONFIG.signalAbsenceThresholdMultiplier).toBe(0.25);
  });

  it('minPromptsBeforeAdvisory is 1 (advisory can fire from the second prompt)', () => {
    expect(OPTIMUM_LEVEL_CONFIG.minPromptsBeforeAdvisory).toBe(1);
  });

  it('all 10 FrequencyLevelConfig fields are present', () => {
    const keys: Array<keyof typeof OPTIMUM_LEVEL_CONFIG> = [
      'minPromptsBeforeAdvisory',
      'postAdvisoryCooldown',
      'sessionAdvisoryCapDefault',
      'sessionAdvisoryCapVibe',
      'stage2MinConfidence',
      'stage2ContextWindow',
      'stage2S1LowConfidence',
      'signalAbsenceThresholdMultiplier',
      'minStageChangeConfidence',
      'signalAbsenceMinFloor',
    ];
    for (const key of keys) {
      expect(OPTIMUM_LEVEL_CONFIG[key]).toBeDefined();
    }
  });

  it('signalAbsenceMinFloor is 2 (lower floor for optimum multiplier benefit)', () => {
    expect(OPTIMUM_LEVEL_CONFIG.signalAbsenceMinFloor).toBe(2);
  });

  it('every_event signalAbsenceMinFloor is 5 (unchanged from original hardcoded value)', () => {
    expect(FREQUENCY_LEVEL_CONFIGS.every_event.signalAbsenceMinFloor).toBe(5);
  });

  it('standard cap of 20 is sufficient to sustain advisory coverage across 300-prompt sessions', () => {
    const cap = OPTIMUM_LEVEL_CONFIG.sessionAdvisoryCapDefault;
    // At typical advisory frequency in real sessions (~15 prompts per advisory),
    // cap × 15 must cover the full session length.
    expect(cap * 15).toBeGreaterThanOrEqual(300);
  });

  it('vibe cap of 30 is sufficient to sustain advisory coverage across 385-prompt sessions', () => {
    const cap = OPTIMUM_LEVEL_CONFIG.sessionAdvisoryCapVibe;
    expect(cap * 15).toBeGreaterThanOrEqual(385);
  });
});
