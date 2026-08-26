import { describe, expect, it, vi } from 'vitest';
import { openStore } from '../store/index.js';
import { getConfig } from '../store/config.js';
import { configSetAction } from '../cli/commands/config.js';
import {
  PROMPT_ENHANCEMENT_SEQUENCE_ENABLED_KEY,
  PROMPT_ENHANCEMENT_SEQUENCE_ENABLED_VALUES,
  promptEnhancementSequenceProjectKey,
  resolvePromptEnhancementSequenceConfig,
  setPromptEnhancementSequenceEnabled,
  validatePromptEnhancementSequenceEnabled,
} from './PromptEnhancementConfig.js';
import { ConfigValidationError } from './prompt-enhancement-errors.js';

describe('DEP-TEST-01-B4-01 typed PE config contract', () => {
  it('resolves the owner default as off without an explicit row', async () => {
    const store = await openStore(':memory:');
    try {
      const snapshot = resolvePromptEnhancementSequenceConfig(store.db, '/project/a');
      expect(snapshot.sequenceEnabled).toBe('off');
      expect(snapshot.validatedEffectiveConfigState).toBe('validated_default');
      expect(snapshot.sourceScope).toBe('default');
      expect(snapshot.arbitraryConfigRowsAreAuthority).toBe(false);
      expect(getConfig(store.db, PROMPT_ENHANCEMENT_SEQUENCE_ENABLED_KEY)).toBe('off');
    } finally {
      store.db.close();
    }
  });

  it.each(PROMPT_ENHANCEMENT_SEQUENCE_ENABLED_VALUES)('accepts the typed value %s', (value) => {
    expect(validatePromptEnhancementSequenceEnabled(value)).toBe(value);
  });

  it('rejects unknown values and unknown keys without persistence', async () => {
    const store = await openStore(':memory:');
    try {
      expect(() => validatePromptEnhancementSequenceEnabled('true')).toThrow(ConfigValidationError);
      expect(() => setPromptEnhancementSequenceEnabled(store, 'prompt_enhancement.sequence.other', 'on')).toThrow(ConfigValidationError);
      expect(getConfig(store.db, 'prompt_enhancement.sequence.other')).toBeUndefined();
    } finally {
      store.db.close();
    }
  });

  it('resolves explicit global and project-over-global overrides', async () => {
    const store = await openStore(':memory:');
    try {
      setPromptEnhancementSequenceEnabled(store, PROMPT_ENHANCEMENT_SEQUENCE_ENABLED_KEY, 'off');
      expect(resolvePromptEnhancementSequenceConfig(store.db, '/project/a')).toMatchObject({
        sequenceEnabled: 'off', sourceScope: 'global', validatedEffectiveConfigState: 'disabled_by_config',
      });
      setPromptEnhancementSequenceEnabled(store, promptEnhancementSequenceProjectKey('/project/a'), 'on');
      expect(resolvePromptEnhancementSequenceConfig(store.db, '/project/a')).toMatchObject({
        sequenceEnabled: 'on', sourceScope: 'project', validatedEffectiveConfigState: 'validated_project_override',
      });
    } finally {
      store.db.close();
    }
  });

  it('keeps an invalid project override invalid instead of falling through to global', async () => {
    const store = await openStore(':memory:');
    try {
      setPromptEnhancementSequenceEnabled(store, PROMPT_ENHANCEMENT_SEQUENCE_ENABLED_KEY, 'on');
      store.db.run('INSERT INTO config (key, value) VALUES (?, ?)', [promptEnhancementSequenceProjectKey('/project/a'), 'invalid']);
      expect(resolvePromptEnhancementSequenceConfig(store.db, '/project/a')).toMatchObject({
        sequenceEnabled: 'off', sourceScope: 'project', validatedEffectiveConfigState: 'invalid_or_unknown_key',
      });
    } finally {
      store.db.close();
    }
  });

  it('routes the typed key through the CLI setter path', async () => {
    const dbPath = `/tmp/nexpath-pe-config-${Date.now()}-${Math.random().toString(16).slice(2)}.db`;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await configSetAction(PROMPT_ENHANCEMENT_SEQUENCE_ENABLED_KEY, 'off', dbPath);
      const store = await openStore(dbPath);
      try {
        expect(resolvePromptEnhancementSequenceConfig(store.db)).toMatchObject({
          sequenceEnabled: 'off', sourceScope: 'global', validatedEffectiveConfigState: 'disabled_by_config',
        });
      } finally {
        store.db.close();
      }
    } finally {
      logSpy.mockRestore();
    }
  });
});

