import { describe, expect, it } from 'vitest';
import { SessionStateManager } from './session-state.js';
import type { StoragePort } from './ports/storage.port.js';
import type { SessionState } from './classifier/types.js';

/**
 * PE popup-cooldown bookkeeping on the browser-side session manager
 * (`markPromptEnhancementPopupShown`, mirroring the CLI manager's method).
 * Kept in its own file so the pre-existing session-state suite stays untouched.
 */

function makePort(initial?: SessionState): { port: StoragePort; saved: SessionState[] } {
  const saved: SessionState[] = [];
  let stored: SessionState | null = initial ?? null;
  const port: StoragePort = {
    loadSessionState: () => stored,
    saveSessionState: (state) => {
      saved.push(structuredClone(state));
      stored = state;
    },
    getProjectDetectedLanguage: () => undefined,
  };
  return { port, saved };
}

describe('SessionStateManager — prompt-enhancement popup cooldown field', () => {
  it('markPromptEnhancementPopupShown records the current promptCount and persists', () => {
    const { port, saved } = makePort();
    const mgr = SessionStateManager.load(port, '/proj');
    // Simulate a session that has processed some prompts.
    for (let i = 0; i < 4; i++) {
      mgr.processPrompt(port, `prompt ${i}`, { stage: 'implementation', confidence: 0.9, tier: 1, allScores: {} });
    }
    mgr.markPromptEnhancementPopupShown(port);
    expect(mgr.current.lastPromptEnhancementPromptIndex).toBe(mgr.current.promptCount);
    expect(saved.at(-1)?.lastPromptEnhancementPromptIndex).toBe(mgr.current.promptCount);
  });

  it('a legacy persisted state WITHOUT the field loads unchanged and reads as "none shown yet"', () => {
    const { port } = makePort();
    const fresh = SessionStateManager.load(port, '/proj');
    fresh.processPrompt(port, 'seed', { stage: 'implementation', confidence: 0.9, tier: 1, allScores: {} });
    // Strip the field the way a pre-PE row on disk would look.
    const legacy = structuredClone(fresh.current) as SessionState;
    delete (legacy as Partial<SessionState>).lastPromptEnhancementPromptIndex;
    const { port: port2 } = makePort(legacy);
    const mgr = SessionStateManager.load(port2, '/proj');
    expect(mgr.current.lastPromptEnhancementPromptIndex).toBeUndefined();
    // The cooldown gate's read shape (`?? -1`) treats absent as "first popup always shows".
    expect(mgr.current.lastPromptEnhancementPromptIndex ?? -1).toBe(-1);
  });
});
