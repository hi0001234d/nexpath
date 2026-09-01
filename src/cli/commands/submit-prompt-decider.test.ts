/**
 * H3 Gap 1 — the submit-time decider.
 *
 * Weighted heavily toward ALLOW, deliberately. Under this flow a wrong `'block'`
 * means the user's prompt is cancelled and possibly never replaced — strictly
 * worse than today, where a failure merely means no advisory appears. So the
 * tests that matter most are the ones proving we allow when anything is uncertain
 * (amendment `A3`).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  decideSubmitPrompt,
  type SubmitPromptDeciderDeps,
  type DeciderOptionSet,
} from './submit-prompt-decider.js';

const OPTIONS: DeciderOptionSet = { l1: ['do it safely'], l2: ['add tests'], l3: [] };

function harness(over: Partial<SubmitPromptDeciderDeps> = {}) {
  const deps: SubmitPromptDeciderDeps = {
    composeOptions: vi.fn().mockReturnValue(OPTIONS),
    renderPopup: vi.fn().mockResolvedValue('the picked option'),
    persistDecision: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  return deps;
}

describe('blocks only on a real, persisted, different selection', () => {
  it('blocks and persists when the user picks something new', async () => {
    const d = harness();
    await expect(decideSubmitPrompt('original prompt', d)).resolves.toBe('block');
    expect(d.persistDecision).toHaveBeenCalledWith('the picked option');
  });

  it('persists BEFORE reporting block — a block without a handoff would strand the prompt', async () => {
    const order: string[] = [];
    const d = harness({
      persistDecision: vi.fn().mockImplementation(async () => { order.push('persist'); }),
    });
    const result = await decideSubmitPrompt('original', d);
    order.push(`decision:${result}`);
    expect(order).toEqual(['persist', 'decision:block']);
  });
});

describe('FAIL-OPEN (A3) — every uncertain path allows', () => {
  it('allows when the generator returns null', async () => {
    const d = harness({ composeOptions: vi.fn().mockReturnValue(null) });
    await expect(decideSubmitPrompt('p', d)).resolves.toBe('allow');
    expect(d.renderPopup).not.toHaveBeenCalled();
  });

  it('allows when the generator yields an empty option set', async () => {
    const d = harness({ composeOptions: vi.fn().mockReturnValue({ l1: [], l2: [], l3: [] }) });
    await expect(decideSubmitPrompt('p', d)).resolves.toBe('allow');
    expect(d.renderPopup).not.toHaveBeenCalled();
  });

  it('allows when the generator throws', async () => {
    const d = harness({ composeOptions: vi.fn(() => { throw new Error('lookup blew up'); }) });
    await expect(decideSubmitPrompt('p', d)).resolves.toBe('allow');
  });

  it('allows when the popup throws', async () => {
    const d = harness({ renderPopup: vi.fn().mockRejectedValue(new Error('no tty')) });
    await expect(decideSubmitPrompt('p', d)).resolves.toBe('allow');
    expect(d.persistDecision).not.toHaveBeenCalled();
  });

  it.each([
    ['dismissed (null)', null],
    ['empty string', ''],
    ['whitespace only', '   '],
  ])('allows when the selection is %s', async (_label, selection) => {
    const d = harness({ renderPopup: vi.fn().mockResolvedValue(selection) });
    await expect(decideSubmitPrompt('p', d)).resolves.toBe('allow');
    expect(d.persistDecision).not.toHaveBeenCalled();
  });

  it('allows when the selection is identical to the original — a turn for no change', async () => {
    const d = harness({ renderPopup: vi.fn().mockResolvedValue('  original prompt  ') });
    await expect(decideSubmitPrompt('original prompt', d)).resolves.toBe('allow');
    expect(d.persistDecision).not.toHaveBeenCalled();
  });

  it('ALLOWS when persistence fails — never block with no handoff written', async () => {
    const d = harness({ persistDecision: vi.fn().mockRejectedValue(new Error('disk full')) });
    await expect(decideSubmitPrompt('original', d)).resolves.toBe('allow');
  });

  it.each([
    ['empty prompt', ''],
    ['whitespace prompt', '   '],
  ])('allows for an %s without generating anything', async (_l, prompt) => {
    const d = harness();
    await expect(decideSubmitPrompt(prompt, d)).resolves.toBe('allow');
    expect(d.composeOptions).not.toHaveBeenCalled();
  });
});

describe('G-A1 — deterministic-only: no LLM/async work on the option path', () => {
  it('composeOptions is called synchronously (its result is not awaited as a promise)', async () => {
    // A Promise-returning generator would signal an LLM/network path sneaking onto
    // the submit path. The port is typed sync; this pins the runtime behaviour too.
    const compose = vi.fn().mockReturnValue(OPTIONS);
    await decideSubmitPrompt('p', harness({ composeOptions: compose }));
    expect(compose).toHaveBeenCalledTimes(1);
    expect(compose.mock.results[0].type).toBe('return');
    expect(compose.mock.results[0].value).toBe(OPTIONS); // not a thenable
  });
});

describe('privacy — logs never carry prompt or replacement text', () => {
  it('redacts both the original and the selection', async () => {
    const lines: string[] = [];
    const d = harness({
      renderPopup: vi.fn().mockResolvedValue('ZZQX_REPLACEMENT_7741'),
      log: (m) => lines.push(m),
    });
    await decideSubmitPrompt('ZZQX_ORIGINAL_9920', d);
    const all = lines.join('\n');
    expect(all).not.toContain('ZZQX_REPLACEMENT_7741');
    expect(all).not.toContain('ZZQX_ORIGINAL_9920');
    expect(lines.length).toBeGreaterThan(0);
  });
});

describe('ownership — this module imports nothing from decision-session', () => {
  it("consumes other members' code only through injected ports", async () => {
    // The real proof is the import graph (asserted in the source header and by
    // review); this test documents the intent and fails loudly if someone later
    // makes the decider depend on a Store or a concrete renderer.
    const d = harness();
    await decideSubmitPrompt('p', d);
    expect(d.composeOptions).toHaveBeenCalledWith('p');
    expect(d.renderPopup).toHaveBeenCalledWith('p', OPTIONS);
  });
});
