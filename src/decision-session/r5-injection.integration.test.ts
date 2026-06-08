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
