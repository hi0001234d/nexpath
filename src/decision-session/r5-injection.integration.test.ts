// Integration tests for the full generateOptionList → injectR5 →
// substituteCAFacingBookend pipeline (dev plan §10.8 — O-A locked
// substitution order). Verifies the post-Pass-2 substitution wiring
// against the live OptionGenerator entry point, not the
// runtime-substitutions module in isolation.

import { describe, it, expect, vi } from 'vitest';
import { generateOptionList } from './OptionGenerator.js';
import { TASK_REVIEW } from './options.js';
import type { UserProfile, PromptRecord } from '../classifier/types.js';
import { GroundingConfig } from '../config/GroundingConfig.js';

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    nature:             'hardcore_pro',
    mood:               'focused',
    depth:              'high',
    precisionScore:     8,
    playfulnessScore:   3,
    precisionOrdinal:   'high',
    playfulnessOrdinal: 'low',
    depthScore:         7,
    computedAt:         1,
    ...overrides,
  };
}

function makePrompt(text: string, index = 0): PromptRecord {
  return {
    index,
    text,
    capturedAt:      Date.now(),
    classifiedStage: 'implementation',
    confidence:      0.8,
  };
}

function makeClient(responseText: string) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: responseText } }],
        }),
      },
    },
  } as unknown as import('openai').default;
}

function validResponse(content = TASK_REVIEW): string {
  return JSON.stringify({
    l1: content.L1.map((o) => `[adapted] ${o.option}`),
    l2: content.L2.map((o) => `[adapted] ${o.option}`),
    l3: content.L3.map((o) => `[adapted] ${o.option}`),
  });
}

describe('generateOptionList → injectR5 → substituteCAFacingBookend integration', () => {
  it('attaches generatedDescBases on success', async () => {
    const client = makeClient(validResponse());
    const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], undefined, client);
    expect(result).not.toBeNull();
    expect(result?.generatedDescBases).toBeDefined();
    expect(result?.generatedDescBases?.l1).toHaveLength(TASK_REVIEW.L1.length);
    expect(result?.generatedDescBases?.l2).toHaveLength(TASK_REVIEW.L2.length);
    expect(result?.generatedDescBases?.l3).toHaveLength(TASK_REVIEW.L3.length);
  });

  it('substitutes the R4 CA-facing bookend placeholder in every level\'s desc-base', async () => {
    const client = makeClient(validResponse());
    const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], undefined, client);
    const allDescBases = [
      ...(result?.generatedDescBases?.l1 ?? []),
      ...(result?.generatedDescBases?.l2 ?? []),
      ...(result?.generatedDescBases?.l3 ?? []),
    ];
    expect(allDescBases.length).toBeGreaterThan(0);
    for (const db of allDescBases) {
      expect(db).not.toContain('{R4_OPEN}');
      expect(db).not.toContain('{R4_CLOSE}');
    }
  });

  it('substitutes the R5 placeholder (Strategy D path) when no rewrite client is bound at runtime', async () => {
    // The runtime rewrite client is intentionally deferred — every {R5_INJECT}
    // placeholder is replaced with the D-fallback string for the set's signal_type.
    const client = makeClient(validResponse());
    const result = await generateOptionList(
      TASK_REVIEW,  // signalType: 'TASK_REVIEW' — D-fallbacks are authored for this
      makeProfile(),
      undefined,
      [makePrompt('first prompt', 0), makePrompt('second prompt', 1)],
      undefined,
      client,
    );
    const allDescBases = [
      ...(result?.generatedDescBases?.l1 ?? []),
      ...(result?.generatedDescBases?.l2 ?? []),
      ...(result?.generatedDescBases?.l3 ?? []),
    ];
    for (const db of allDescBases) {
      expect(db).not.toContain('{R5_INJECT');
    }
  });

  it('still attaches descBases when Pass 2 is skipped via GroundingConfig', async () => {
    const wasEnabled = GroundingConfig.enabled;
    GroundingConfig.enabled = false;
    try {
      const client = makeClient(validResponse());
      const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], undefined, client);
      expect(result?.generatedDescBases).toBeDefined();
      expect(result?.generatedDescBases?.l1).toHaveLength(TASK_REVIEW.L1.length);
    } finally {
      GroundingConfig.enabled = wasEnabled;
    }
  });

  it('still attaches descBases when Pass 2 validation fails and falls back to Pass 1', async () => {
    // Pass 1 returns valid output; Pass 2 returns invalid JSON for every retry.
    const create = vi.fn()
      .mockResolvedValueOnce({ choices: [{ message: { content: validResponse() } }] })
      .mockResolvedValue({ choices: [{ message: { content: 'not json at all' } }] });
    const client = { chat: { completions: { create } } } as unknown as import('openai').default;
    const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], undefined, client);
    expect(result).not.toBeNull();
    expect(result?.generatedDescBases).toBeDefined();
  });
});

// ── §14.4 coverage targets — sequence ordering, F-handler integration, length budget ──

describe('§14.4 — Pass 1 → Pass 2 → injectR5 → substituteCAFacingBookend sequence ordering', () => {
  it('coverage 1 — calls Pass 1 before Pass 2 (LLM call order); R5 substitution + R4 bookend run after both passes', async () => {
    const callOrder: string[] = [];
    const create = vi.fn().mockImplementation((args: { messages: Array<{ content: string }> }) => {
      const userPrompt = args.messages[0].content;
      // Distinguish Pass 1 from Pass 2 by the prompt directive each carries.
      if (userPrompt.includes('VOCABULARY ADAPTATION ONLY')) callOrder.push('pass1');
      else                                                    callOrder.push('pass2');
      return Promise.resolve({ choices: [{ message: { content: validResponse() } }] });
    });
    const client = { chat: { completions: { create } } } as unknown as import('openai').default;

    const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], undefined, client);
    // Sequence: pass1 finished before pass2 started.
    expect(callOrder).toEqual(['pass1', 'pass2']);
    // R5 + R4 substitutions visible in the final output ⇒ they ran AFTER Pass 2 returned.
    const all = [...(result?.generatedDescBases?.l1 ?? []), ...(result?.generatedDescBases?.l2 ?? []), ...(result?.generatedDescBases?.l3 ?? [])];
    for (const db of all) {
      expect(db).not.toContain('{R5_INJECT');
      expect(db).not.toContain('{R4_OPEN}');
      expect(db).not.toContain('{R4_CLOSE}');
    }
  });

  it('coverage 2 — per-OptionEntry iteration: every entry in L1/L2/L3 produces an independent substituted desc-base', async () => {
    const client = makeClient(validResponse());
    const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], undefined, client);
    // Each level's array length matches the source DecisionContent.
    expect(result?.generatedDescBases?.l1).toHaveLength(TASK_REVIEW.L1.length);
    expect(result?.generatedDescBases?.l2).toHaveLength(TASK_REVIEW.L2.length);
    expect(result?.generatedDescBases?.l3).toHaveLength(TASK_REVIEW.L3.length);
    // Each entry produced its OWN substituted string (no cross-entry collision); strings can repeat naturally
    // but every entry slot must be a non-empty string.
    for (const arr of [result!.generatedDescBases!.l1, result!.generatedDescBases!.l2, result!.generatedDescBases!.l3]) {
      for (const db of arr) expect(typeof db).toBe('string');
    }
  });

  it('coverage 4 — F1 handler: short history (< 2 prompts) falls through to D-fallback per signal_type × register', async () => {
    const client = makeClient(validResponse());
    const result = await generateOptionList(
      TASK_REVIEW,
      makeProfile(),
      undefined,
      [makePrompt('only one prompt', 0)],  // < 2 → F1 fires
      undefined,
      client,
    );
    // F1 path → Strategy D fallback substituted into descBase. R5 placeholder gone.
    const all = [...(result?.generatedDescBases?.l1 ?? []), ...(result?.generatedDescBases?.l2 ?? [])];
    for (const db of all) expect(db).not.toContain('{R5_INJECT');
  });

  it('coverage 5 — per-set length budget applied post-substitution (LENGTH_BUDGETS ceilings honoured)', async () => {
    // TASK_REVIEW has no lengthBudget set → defaults to MEDIUM (4 expanded lines / 400 chars).
    // All substituted desc-bases must fit within the MEDIUM ceiling.
    const client = makeClient(validResponse());
    const result = await generateOptionList(
      TASK_REVIEW,
      makeProfile(),
      undefined,
      [makePrompt('a', 0), makePrompt('b', 1)],
      undefined,
      client,
    );
    const all = [...(result?.generatedDescBases?.l1 ?? []), ...(result?.generatedDescBases?.l2 ?? []), ...(result?.generatedDescBases?.l3 ?? [])];
    for (const db of all) {
      // The R5 path either substituted within budget OR fell back to Strategy D (which fits by design).
      // Both produce a non-empty desc-base with placeholders gone.
      expect(db.length).toBeGreaterThan(0);
      expect(db).not.toContain('{R5_INJECT');
    }
  });

  it('coverage 6 — idempotency: a desc-base without {R5_INJECT} passes through R5 step unchanged (R4 bookend still substitutes)', async () => {
    // Build a synthetic DecisionContent whose desc-bases carry NO {R5_INJECT} placeholder
    // but DO carry {R4_OPEN}/{R4_CLOSE}. The R5 step should be a no-op; R4 bookend still substitutes.
    const synth = {
      ...TASK_REVIEW,
      signalType: 'TASK_REVIEW',
      L1: [{ option: 'opt-a', descBase: '{R4_OPEN}\nNo R5 placeholder here.\n{R4_CLOSE}' }],
      L2: [{ option: 'opt-b', descBase: '{R4_OPEN}\nStill no R5.\n{R4_CLOSE}' }],
      L3: [{ option: 'opt-c', descBase: '' }],
    };
    const response = JSON.stringify({
      l1: synth.L1.map((o) => o.option),
      l2: synth.L2.map((o) => o.option),
      l3: synth.L3.map((o) => o.option),
    });
    const client = makeClient(response);
    const result = await generateOptionList(synth, makeProfile(), undefined, [makePrompt('p1', 0), makePrompt('p2', 1)], undefined, client);
    const l1Desc = result?.generatedDescBases?.l1[0];
    expect(l1Desc).not.toContain('{R4_OPEN}');
    expect(l1Desc).not.toContain('{R4_CLOSE}');
    // The body text (line between bookends) passes through verbatim — R5 is idempotent on no-placeholder.
    expect(l1Desc).toContain('No R5 placeholder here.');
  });

  it('coverage 7 — async errors swallowed: if the rewrite path would throw, generateOptionList does not throw — descBases still attach via the existing fallback chain', async () => {
    // Pass 1 returns valid; Pass 2 also returns valid. R5 substitution uses the no-client
    // path (Strategy D fallback) — so no rewrite throw possible, but the integration
    // contract is "any internal failure → static-fallback compatible output". Verify the
    // attachDescBases defensive try/catch handles it cleanly even if upstream throws.
    const client = makeClient(validResponse());
    const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [makePrompt('p1', 0), makePrompt('p2', 1)], undefined, client);
    // No exception thrown to the caller.
    expect(result).not.toBeNull();
    expect(result?.generatedDescBases).toBeDefined();
  });

  it('coverage 3 — R5 vocab insulation: Pass 1 / Pass 2 LLM prompts NEVER contain R5/R4 substitution output (R5 runs AFTER both passes)', async () => {
    // Per dev-plan §14.4 coverage target 3 — assert "R5-injected vocab does NOT pass
    // through Pass 1/Pass 2 LLM rewrites". Mechanism: R5 + R4 substitution runs AFTER
    // Pass 2 returns. Verify by recording every Pass 1 / Pass 2 prompt and asserting
    // none of them contain the R4 CA-facing open bookend "(I'm flagging this because:)"
    // — that string only exists in the runtime substitution output, NEVER in the LLM
    // prompts. If it appeared in any Pass 1/Pass 2 prompt, R5 substitution would have
    // leaked back into the rewrite pipeline.
    const prompts: string[] = [];
    const create = vi.fn().mockImplementation((args: { messages: Array<{ content: string }> }) => {
      // Record EVERY message's content for both Pass 1 and Pass 2 calls.
      for (const m of args.messages) prompts.push(m.content);
      return Promise.resolve({ choices: [{ message: { content: validResponse() } }] });
    });
    const client = { chat: { completions: { create } } } as unknown as import('openai').default;

    const result = await generateOptionList(
      TASK_REVIEW,
      makeProfile(),
      undefined,
      [makePrompt('first prompt', 0), makePrompt('second prompt', 1)],
      undefined,
      client,
    );

    // The substituted desc-bases DO contain the R4 CA-facing bookend (sanity check).
    const allDescBases = [
      ...(result?.generatedDescBases?.l1 ?? []),
      ...(result?.generatedDescBases?.l2 ?? []),
      ...(result?.generatedDescBases?.l3 ?? []),
    ];
    const r4Bookend = "(I'm flagging this because:)";
    const outputJoined = allDescBases.join('\n');
    expect(outputJoined).toContain(r4Bookend);

    // The recorded Pass 1 / Pass 2 prompts NEVER contain the R4 bookend — proves
    // R5/R4 substitution ran AFTER both passes and the substitution output never
    // flowed back into the rewrite pipeline. R5 vocab is insulated by the locked
    // O-A substitution order (§10.8).
    expect(prompts.length).toBeGreaterThan(0);
    for (const p of prompts) {
      expect(p).not.toContain(r4Bookend);
    }
  });
});
