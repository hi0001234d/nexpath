/**
 * Desktop writer version: when Nexpath would show its popup, the desktop gets the writer's
 * text as enhancedPrompt with isEnhanced true, in exactly the 7-field contract.
 * runAuto is mocked here; its real behaviour is covered by nexpath-writer.test.ts.
 */

import { describe, it, expect, vi } from 'vitest';

const runAutoCalls: { options: any; sawScopedClient: boolean }[] = [];
let showPopup = true;

vi.mock('../../cli/commands/auto.js', async () => {
  const { scopedNexpathLlmClient } = await import('../../config/llm-client-scope.js');
  return {
    runAuto: vi.fn(async (_input: unknown, _store: unknown, _openai: unknown, _pe: unknown, options: any) => {
      runAutoCalls.push({ options, sawScopedClient: scopedNexpathLlmClient() !== undefined });
      options.host.onFeature1Memory?.({
        isEnhanced: true, enhancedPrompt: 'x', stage: 'implementation', stageConfidence: 0.8,
        injectedContextTags: ['@rule:processretry-entry-point'], contextTokenEstimate: 20, processingTimeMs: 3,
      });
      if (showPopup) {
        options.host.onShownPromptEnhancement({
          currentBody: { text: 'My original request (verbatim):\nfix the retry crash\n\nContext and constraints:\n- processRetry must stay the only entry point.' },
        });
      }
      return { outcome: 'no_action' };
    }),
  };
});

const { openStore } = await import('../../store/db.js');
const { prepareNexpathWriterEnhancement } = await import('../delivery/nexpath-writer-enhancer.js');

describe('prepareNexpathWriterEnhancement — result mapping', () => {
  const ctx = async () => ({
    workspacePath: '/workspaces/desktop-writer',
    store: await openStore(':memory:'),
    sessionId: 'desktop-session-9',
    deviceToken: 'npd_t',
    deviceId: 'dev-9',
    activeFilePath: 'src/payment.ts',
  });

  it('returns the writer text with isEnhanced true and exactly the 7 fields', async () => {
    showPopup = true;
    const r = await prepareNexpathWriterEnhancement('fix the retry crash', await ctx());

    expect(r.isEnhanced).toBe(true);
    expect(r.enhancedPrompt).toContain('processRetry must stay the only entry point.');
    expect(r.injectedContextTags).toEqual(['@rule:processretry-entry-point']);
    expect(r.stageConfidence).toBe(0.8);
    expect(Object.keys(r).sort()).toEqual(['contextTokenEstimate', 'enhancedPrompt', 'injectedContextTags', 'isEnhanced', 'processingTimeMs', 'stage', 'stageConfidence']);
  });

  it('returns the original prompt when Nexpath has nothing to add', async () => {
    showPopup = false;
    const r = await prepareNexpathWriterEnhancement('fix the retry crash', await ctx());
    expect(r.isEnhanced).toBe(false);
    expect(r.enhancedPrompt).toBe('fix the retry crash');
  });

  it('runs the pipeline inside the scoped client, with the desktop session and editor context for Feature 1', async () => {
    showPopup = true;
    runAutoCalls.length = 0;
    await prepareNexpathWriterEnhancement('fix the retry crash', await ctx());
    expect(runAutoCalls[0].sawScopedClient).toBe(true);
    expect(runAutoCalls[0].options.host.feature1SessionId).toBe('desktop-session-9');
    expect(runAutoCalls[0].options.host.feature1Context.activeFilePath).toBe('src/payment.ts');
  });
});
