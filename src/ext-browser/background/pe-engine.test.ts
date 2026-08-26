import { afterEach, describe, expect, it, vi } from 'vitest';

type EnvHolder = { process?: { env?: Record<string, string | undefined> } };

describe('pe-engine seam', () => {
  afterEach(() => {
    delete (globalThis as EnvHolder).process?.env?.['OPENAI_API_KEY'];
    vi.resetModules();
  });

  it('does not clobber an existing process object at import time (Node test env)', async () => {
    const before = (globalThis as EnvHolder).process;
    await import('./pe-engine.js');
    expect((globalThis as EnvHolder).process).toBe(before);
  });

  it('refreshEngineKeyEnv sets the engine-visible key slot', async () => {
    const { refreshEngineKeyEnv } = await import('./pe-engine.js');
    refreshEngineKeyEnv('sk-test-abc123');
    expect((globalThis as EnvHolder).process?.env?.['OPENAI_API_KEY']).toBe('sk-test-abc123');
  });

  it('refreshEngineKeyEnv clears the slot for null / undefined / empty', async () => {
    const { refreshEngineKeyEnv } = await import('./pe-engine.js');
    refreshEngineKeyEnv('sk-test-abc123');
    refreshEngineKeyEnv(null);
    expect((globalThis as EnvHolder).process?.env?.['OPENAI_API_KEY']).toBeUndefined();
    refreshEngineKeyEnv('sk-test-abc123');
    refreshEngineKeyEnv('');
    expect((globalThis as EnvHolder).process?.env?.['OPENAI_API_KEY']).toBeUndefined();
  });

  it('re-exports the facade entries, validators, and helpers the SW consumes', async () => {
    const engine = await import('./pe-engine.js');
    expect(typeof engine.preparePromptEnhancement).toBe('function');
    expect(typeof engine.preparePromptEnhancementWithSequenceV1).toBe('function');
    expect(typeof engine.applyPromptEnhancementAction).toBe('function');
    expect(typeof engine.validatePromptEnhancementPrepareRequestV1).toBe('function');
    expect(typeof engine.validatePromptEnhancementPrepareResultV1).toBe('function');
    expect(typeof engine.isPromptEnhancementSequenceShapedTextV1).toBe('function');
    expect(typeof engine.emitPromptEnhancementCostObservabilityV1).toBe('function');
    expect(engine.PE_ENGINE_READY).toBe(true);
  });

  it('buildEngineLlmClient returns an SDK-shaped client without constructing the real SDK', async () => {
    const { buildEngineLlmClient } = await import('./pe-engine.js');
    const client = buildEngineLlmClient('sk-test-abc123');
    // The shim's whole contract: exactly the .chat.completions.create path.
    expect(typeof (client as { chat: { completions: { create: unknown } } }).chat.completions.create)
      .toBe('function');
  });
});
