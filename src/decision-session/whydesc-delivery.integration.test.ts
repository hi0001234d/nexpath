import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDecisionSession, type DecisionSessionInput, type SelectFn } from './DecisionSession.js';
import { SKIP_NOW } from './options.js';
import type { GeneratedOptions } from './OptionGenerator.js';
import { openStore } from '../store/index.js';
import { setConfig } from '../store/config.js';
import { findWhyDescVoiceViolations } from './whydesc-voice-lint.js';

// End-to-end for Bug 2: drive the real runDecisionSession selection→prompt path and confirm the
// delivery combine (2.1) resolves the gate (2.2) through the real DecisionSession wiring — for a
// grounded input (generatedOptions) AND deterministic-composed content, plus the OFF/skip paths.

function makeInput(overrides: Partial<DecisionSessionInput> = {}): DecisionSessionInput {
  return {
    stage:                'implementation',
    flagType:             'stage_transition',
    pinchLabel:           'Hold up.',
    sessionId:            'session-delivery',
    projectRoot:          '/test/delivery',
    promptCount:          20,
    decisionSessionCount: 5,
    ...overrides,
  };
}

const mockSelect = (value: string): SelectFn => vi.fn().mockResolvedValue(value);

const OPTION = 'Write one test for the most important behaviour in what was just built.';
const WHYDESC = 'Just the single most important behaviour, not full coverage yet.';
const gen: GeneratedOptions = {
  l1: [OPTION],
  l2: ['A lighter option.'],
  l3: ['A minimum option.'],
  generatedDescBases: { l1: [WHYDESC], l2: ['l2 why'], l3: ['l3 why'] },
};

async function storeWithGate(enabled: boolean) {
  const store = await openStore(':memory:');
  setConfig(store, 'whydesc_delivery_enabled', enabled ? 'true' : 'false');
  return store;
}

describe('whydesc-delivery integration — runDecisionSession selection→prompt', () => {
  it('gate ON (grounded input) → selectedPrompt = option + blank line + why-desc', async () => {
    const store = await storeWithGate(true);
    const result = await runDecisionSession(makeInput({ generatedOptions: gen }), store, mockSelect(OPTION));
    expect(result.outcome).toBe('selected');
    if (result.outcome === 'selected') expect(result.selectedPrompt).toBe(`${OPTION}\n\n${WHYDESC}`);
  });

  it('gate OFF (grounded input) → selectedPrompt = option alone (unchanged behaviour)', async () => {
    const store = await storeWithGate(false);
    const result = await runDecisionSession(makeInput({ generatedOptions: gen }), store, mockSelect(OPTION));
    expect(result.outcome).toBe('selected');
    if (result.outcome === 'selected') expect(result.selectedPrompt).toBe(OPTION);
  });

  it('no store → selectedPrompt = option alone (gate defaults OFF)', async () => {
    const result = await runDecisionSession(makeInput({ generatedOptions: gen }), undefined, mockSelect(OPTION));
    if (result.outcome === 'selected') expect(result.selectedPrompt).toBe(OPTION);
  });

  it('gate ON (deterministic-composed content) → combines the composed option + its why-desc', async () => {
    const store = await storeWithGate(true);
    let opt = '', desc = '';
    const pick: SelectFn = vi.fn(async (input: Parameters<SelectFn>[0]) => {
      opt = input.options[0].value;
      desc = input.options[0].descBase ?? '';
      return opt;
    });
    const result = await runDecisionSession(makeInput(), store, pick);
    expect(result.outcome).toBe('selected');
    if (result.outcome === 'selected') {
      const expected = desc.trim() ? `${opt}\n\n${desc.trim()}` : opt;
      expect(result.selectedPrompt).toBe(expected);
    }
  });

  it('gate ON → SKIP still yields outcome "skipped" (meta path unaffected)', async () => {
    const store = await storeWithGate(true);
    const result = await runDecisionSession(makeInput({ generatedOptions: gen }), store, mockSelect(SKIP_NOW));
    expect(result.outcome).toBe('skipped');
  });

  // Phase 17.2: drive the real selection→prompt path on an ISOLATED TEMP DB with the gate UNSET,
  // so delivery resolves through the NEW default (ON). Inspect the injected prompt = option +
  // agent-voiced why-desc, and confirm the popup sub-line (descBase) shows the same agent-voiced
  // text (dual-audience "reads well"), and that the why-desc is voice-lint clean.
  it('default (gate unset) on a temp DB → agent receives option + agent-voiced why-desc; popup reads well', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexpath-1702-'));
    try {
      const store = await openStore(join(dir, 'prompt-store.db')); // real on-disk DB; whydesc_delivery_enabled NOT set → default

      let popupSubLine = '';
      const pick: SelectFn = vi.fn(async (input: Parameters<SelectFn>[0]) => {
        const chosen = input.options.find((o) => o.value === OPTION) ?? input.options[0];
        popupSubLine = chosen.descBase ?? ''; // the ↳ sub-line the user sees in the popup
        return chosen.value;
      });

      const result = await runDecisionSession(makeInput({ generatedOptions: gen }), store, pick);
      expect(result.outcome).toBe('selected');
      if (result.outcome !== 'selected') return;

      // The injected prompt the agent receives = option + blank line + why-desc (default-ON, via real wiring).
      expect(result.selectedPrompt).toBe(`${OPTION}\n\n${WHYDESC}`);
      // Dual-audience: the popup showed the SAME agent-voiced why-desc as its sub-line.
      expect(popupSubLine).toBe(WHYDESC);
      // What reaches the agent is agent-voice clean (no caption / user-narration / human-only drift).
      expect(findWhyDescVoiceViolations(WHYDESC, OPTION)).toEqual([]);

      // eslint-disable-next-line no-console
      console.log('[17.2] INJECTED PROMPT >>>\n' + result.selectedPrompt + '\n<<< POPUP SUB-LINE: ' + popupSubLine);
      store.db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
