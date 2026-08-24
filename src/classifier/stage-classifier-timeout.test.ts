import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import type { Stage } from './types.js';
import { classifyStage, STAGE_CLASSIFIER_TIMEOUT_MS } from './stage-classifier.js';
import type { StageClassifierInput } from './stage-classifier.js';

// Regression guard for the stage-classifier per-call timeout (raised 6s → 12s).
// The timeout is the SECOND argument to chat.completions.create (the request options),
// not the body — so the mock captures that arg and asserts the live 12s value is applied.
// This locks BOTH that the constant is 12s and that it is actually wired to the model call,
// so a silent drift back to 6s (which would re-trigger local-fallback degradation) fails the build.

function timeoutCapturingClient(content: string, onOptions: (opts: { timeout?: number }) => void): OpenAI {
  return {
    chat: { completions: { create: async (_req: unknown, opts?: { timeout?: number }) => {
      onOptions(opts ?? {});
      return { choices: [{ message: { content } }] };
    } } },
  } as unknown as OpenAI;
}
function input(promptText = 'ship this build to production'): StageClassifierInput {
  return { promptText, window: [{ text: promptText }], sessionStage: 'implementation' as Stage, sessionConfidence: 0.5, profile: null };
}
const VALID_REPLY = JSON.stringify({
  stage: 'Release', stage_confidence: 0.95, signals_present: [], signals_absent: [],
  fire_decision_session: false, selected_signal_key: '', reason: 'r',
});

describe('stage-classifier — per-call timeout wiring (6s → 12s)', () => {
  it('applies the 12s STAGE_CLASSIFIER_TIMEOUT_MS to the model call', async () => {
    let seen: { timeout?: number } = {};
    const client = timeoutCapturingClient(VALID_REPLY, (o) => { seen = o; });

    await classifyStage(input(), client);

    expect(STAGE_CLASSIFIER_TIMEOUT_MS).toBe(12_000);        // the value is 12s
    expect(seen.timeout).toBe(STAGE_CLASSIFIER_TIMEOUT_MS);  // ...and it reaches the create() call
    expect(seen.timeout).toBe(12_000);
  });
});
