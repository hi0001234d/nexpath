import { describe, it, expect, vi } from 'vitest';
import {
  buildAdaptationPrompt,
  buildEmbeddingPrompt,
  validateGeneratedOptions,
  generateOptionList,
  OPTION_GEN_MAX_RETRIES,
  type GeneratedOptions,
  type OptionGenContext,
} from './OptionGenerator.js';
import { TASK_REVIEW, IMPLEMENTATION_TO_REVIEW } from './options.js';
import { TASK_REVIEW_BEGINNER } from './options-beginner.js';
import type { UserProfile, PromptRecord } from '../classifier/types.js';
import { GroundingConfig } from '../config/GroundingConfig.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

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
    l1: content.L1.map((o) => `[adapted] ${o}`),
    l2: content.L2.map((o) => `[adapted] ${o}`),
    l3: content.L3.map((o) => `[adapted] ${o}`),
  });
}

// ── buildAdaptationPrompt — profile adaptation ───────────────────────────────

describe('buildAdaptationPrompt — profile adaptation', () => {
  it('includes nature and mood in prompt when profile is present', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, []);
    expect(prompt).toContain('nature=hardcore_pro');
    expect(prompt).toContain('mood=focused');
    expect(prompt).toContain('depth=high');
  });

  it('uses neutral style when profile is undefined', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, undefined, undefined, []);
    expect(prompt).toContain('not yet computed');
    expect(prompt).toContain('Neutral professional tone');
  });

  it('includes beginner style for beginner nature', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile({ nature: 'beginner', depth: 'low' }), undefined, []);
    expect(prompt).toContain('Plain English');
  });

  it('includes casual technical style for cool_geek nature', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile({ nature: 'cool_geek' }), undefined, []);
    expect(prompt).toContain('Casual technical');
  });

  it('depth=low overrides cool_geek nature — plain English wins', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile({ nature: 'cool_geek', depth: 'low' }), undefined, []);
    expect(prompt).toContain('Plain English');
    expect(prompt).not.toContain('Casual technical');
  });

  it('cool_geek with depth=medium keeps casual technical style', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile({ nature: 'cool_geek', depth: 'medium' }), undefined, []);
    expect(prompt).toContain('Casual technical');
  });

  it('cool_geek with depth=high keeps casual technical style — nature wins over depth=high', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile({ nature: 'cool_geek', depth: 'high' }), undefined, []);
    expect(prompt).toContain('Casual technical');
  });

  it('includes empathetic tone for frustrated mood', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile({ mood: 'frustrated' }), undefined, []);
    expect(prompt).toContain('Empathetic');
  });

  it('includes ultra-concise tone for rushed mood', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile({ mood: 'rushed' }), undefined, []);
    expect(prompt).toContain('Ultra-concise');
  });

  it('includes language note when language is non-English', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), 'fr', []);
    expect(prompt).toContain('fr-speaking developer');
  });

  it('does not include language note when language is en', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), 'en', []);
    expect(prompt).not.toContain('fr-speaking');
    expect(prompt).not.toContain('Language:');
  });
});

// ── buildAdaptationPrompt — precision/playfulness ordinal labels in context line

describe('buildAdaptationPrompt — ordinal labels in profile context line', () => {
  it('includes precisionOrdinal label alongside numeric score', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, []);
    expect(prompt).toContain('precision=high (8/10)');
  });

  it('includes playfulnessOrdinal label alongside numeric score', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, []);
    expect(prompt).toContain('playfulness=low (3/10)');
  });

  it('reflects very_high ordinal label correctly', () => {
    const prompt = buildAdaptationPrompt(
      TASK_REVIEW,
      makeProfile({ precisionOrdinal: 'very_high', precisionScore: 9 }),
      undefined, [],
    );
    expect(prompt).toContain('precision=very_high (9/10)');
  });

  it('reflects medium ordinal label correctly', () => {
    const prompt = buildAdaptationPrompt(
      TASK_REVIEW,
      makeProfile({ playfulnessOrdinal: 'medium', playfulnessScore: 5 }),
      undefined, [],
    );
    expect(prompt).toContain('playfulness=medium (5/10)');
  });

  it('numeric scores are still present — not replaced by ordinal labels', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, []);
    expect(prompt).toContain('8/10');
    expect(prompt).toContain('3/10');
  });

  it('ordinal labels absent when profile is undefined', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, undefined, undefined, []);
    expect(prompt).not.toContain('precision=');
    expect(prompt).not.toContain('playfulness=');
  });
});

// ── buildAdaptationPrompt — static options appear verbatim ───────────────────

describe('buildAdaptationPrompt — static options in prompt', () => {
  it('includes each L1 option text in the prompt', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, []);
    for (const opt of TASK_REVIEW.L1) {
      expect(prompt).toContain(opt.slice(0, 40)); // first 40 chars to avoid wrapping issues
    }
  });

  it('includes serialised options JSON and count enforcement rules in prompt', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, []);
    expect(prompt).toContain('"l1"');
    expect(prompt).toContain('"l2"');
    expect(prompt).toContain('"l3"');
    expect(prompt).toContain('Do NOT add, remove, or reorder options');
  });

  it('includes last 3 prompts from history', () => {
    const history = [
      makePrompt('build the auth module', 0),
      makePrompt('add password reset flow', 1),
      makePrompt('write the login handler', 2),
    ];
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, history);
    expect(prompt).toContain('write the login handler');
    expect(prompt).toContain('add password reset flow');
  });
});

// ── buildAdaptationPrompt — project grounding ────────────────────────────────

describe('buildAdaptationPrompt — project grounding', () => {
  it('excludes spec options when no spec signals in history', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, []);
    expect(prompt).toContain('EXCLUDE any option that references a spec');
  });

  it('hedges spec options when partial spec signals present', () => {
    const history = [makePrompt('write the requirements for auth'), makePrompt('now code the login')];
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, history);
    expect(prompt).toContain('if you have written requirements for this');
  });

  it('includes spec options as-is when strong spec signal present', () => {
    const history = [
      makePrompt('write the prd for this feature'),
      makePrompt('add the acceptance criteria to the spec'),
      makePrompt('review the requirements doc and update it'),
    ];
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, history);
    // At >60% confidence, no exclusion or hedge line should appear
    expect(prompt).not.toContain('EXCLUDE any option that references a spec');
    expect(prompt).not.toContain('if you have written requirements');
  });

  it('advances unit test options when unit test signals present', () => {
    const history = [
      makePrompt('write the vitest unit tests for the auth module'),
      makePrompt('run the tests — they all pass'),
    ];
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, history);
    expect(prompt).toContain('Unit tests are likely written');
  });

  it('advances e2e options when e2e signals present', () => {
    const history = [makePrompt('set up playwright for e2e testing')];
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, history);
    expect(prompt).toContain('E2E tests appear to be in progress');
  });

  it('advances task breakdown options when task signals present', () => {
    const history = [makePrompt('break this into tasks and create a checklist')];
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, history);
    expect(prompt).toContain('A task breakdown likely exists');
  });

  it('resets task window at new-task boundary', () => {
    const history = [
      makePrompt('write unit tests for old feature', 0),
      makePrompt('run the tests — all pass', 1),
      makePrompt('now let\'s work on the settings page', 2), // boundary
      makePrompt('add a dropdown for timezone', 3),
    ];
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, history);
    // Signals before the boundary should not count — unit test confidence should reset
    // The prompt should NOT say unit tests are written
    expect(prompt).not.toContain('Unit tests are likely written');
  });
});

// ── validateGeneratedOptions ──────────────────────────────────────────────────

describe('validateGeneratedOptions', () => {
  it('returns GeneratedOptions for well-formed response', () => {
    const result = validateGeneratedOptions(validResponse(), TASK_REVIEW);
    expect(result).not.toBeNull();
    expect(result?.l1).toHaveLength(TASK_REVIEW.L1.length);
    expect(result?.l2).toHaveLength(TASK_REVIEW.L2.length);
    expect(result?.l3).toHaveLength(TASK_REVIEW.L3.length);
  });

  it('returns null on JSON parse failure', () => {
    expect(validateGeneratedOptions('not json', TASK_REVIEW)).toBeNull();
  });

  it('returns null when l1 array is missing', () => {
    const bad = JSON.stringify({ l2: ['a', 'b'], l3: ['c'] });
    expect(validateGeneratedOptions(bad, TASK_REVIEW)).toBeNull();
  });

  it('returns null when l1 count does not match static', () => {
    const bad = JSON.stringify({
      l1: ['only one item'],
      l2: TASK_REVIEW.L2.map((o) => o),
      l3: TASK_REVIEW.L3.map((o) => o),
    });
    expect(validateGeneratedOptions(bad, TASK_REVIEW)).toBeNull();
  });

  it('returns null when l2 count does not match static', () => {
    const bad = JSON.stringify({
      l1: TASK_REVIEW.L1.map((o) => o),
      l2: ['only one'],
      l3: TASK_REVIEW.L3.map((o) => o),
    });
    expect(validateGeneratedOptions(bad, TASK_REVIEW)).toBeNull();
  });

  it('returns null when l3 count does not match static', () => {
    const bad = JSON.stringify({
      l1: TASK_REVIEW.L1.map((o) => o),
      l2: TASK_REVIEW.L2.map((o) => o),
      l3: [],
    });
    expect(validateGeneratedOptions(bad, TASK_REVIEW)).toBeNull();
  });

  it('returns null when any item is an empty string', () => {
    const bad = JSON.stringify({
      l1: [...TASK_REVIEW.L1.slice(0, -1), ''],
      l2: TASK_REVIEW.L2.map((o) => o),
      l3: TASK_REVIEW.L3.map((o) => o),
    });
    expect(validateGeneratedOptions(bad, TASK_REVIEW)).toBeNull();
  });

  it('returns null when any item is not a string', () => {
    const bad = JSON.stringify({
      l1: [...TASK_REVIEW.L1.slice(0, -1), 42],
      l2: TASK_REVIEW.L2.map((o) => o),
      l3: TASK_REVIEW.L3.map((o) => o),
    });
    expect(validateGeneratedOptions(bad, TASK_REVIEW)).toBeNull();
  });

  it('strips markdown fencing before parsing', () => {
    const fenced = '```json\n' + validResponse() + '\n```';
    const result = validateGeneratedOptions(fenced, TASK_REVIEW);
    expect(result).not.toBeNull();
  });

  it('works for IMPLEMENTATION_TO_REVIEW content (different array lengths)', () => {
    const resp = JSON.stringify({
      l1: IMPLEMENTATION_TO_REVIEW.L1.map((o) => `[a] ${o}`),
      l2: IMPLEMENTATION_TO_REVIEW.L2.map((o) => `[a] ${o}`),
      l3: IMPLEMENTATION_TO_REVIEW.L3.map((o) => `[a] ${o}`),
    });
    const result = validateGeneratedOptions(resp, IMPLEMENTATION_TO_REVIEW);
    expect(result).not.toBeNull();
    expect(result?.l1).toHaveLength(IMPLEMENTATION_TO_REVIEW.L1.length);
  });
});

// ── validateGeneratedOptions — multi-step fallback ───────────────────────────

describe('validateGeneratedOptions — multi-step fallback', () => {
  it('multi-step item with wrong step count falls back to source text', () => {
    const raw = JSON.stringify({
      l1: [['step one', 'step two'], 'Check done'],
      l2: ['Looks good'],
      l3: ['Nothing wrong'],
    });
    const result = validateGeneratedOptions(raw, TASK_REVIEW_BEGINNER);
    expect(result).not.toBeNull();
    expect(result!.l1[0]).toBe(TASK_REVIEW_BEGINNER.L1[0]);
    expect(result!.l1[1]).toBe('Check done');
    expect(result!.l2[0]).toBe('Looks good');
    expect(result!.l3[0]).toBe('Nothing wrong');
  });

  it('multi-step item returned as string falls back to source text', () => {
    const raw = JSON.stringify({
      l1: ['not an array', 'Check done'],
      l2: ['Looks good'],
      l3: ['Nothing wrong'],
    });
    const result = validateGeneratedOptions(raw, TASK_REVIEW_BEGINNER);
    expect(result).not.toBeNull();
    expect(result!.l1[0]).toBe(TASK_REVIEW_BEGINNER.L1[0]);
    expect(result!.l1[1]).toBe('Check done');
    expect(result!.l2[0]).toBe('Looks good');
    expect(result!.l3[0]).toBe('Nothing wrong');
  });

  it('valid multi-step item is joined and returned without fallback', () => {
    const raw = JSON.stringify({
      l1: [['step one', 'step two', 'step three'], 'Check done'],
      l2: ['Looks good'],
      l3: ['Nothing wrong'],
    });
    const result = validateGeneratedOptions(raw, TASK_REVIEW_BEGINNER);
    expect(result).not.toBeNull();
    expect(result!.l1[0]).toBe('step one\nstep two\nstep three');
  });

  it('correct-length array with empty step returns null', () => {
    const raw = JSON.stringify({
      l1: [['step one', '', 'step three'], 'Check done'],
      l2: ['Looks good'],
      l3: ['Nothing wrong'],
    });
    expect(validateGeneratedOptions(raw, TASK_REVIEW_BEGINNER)).toBeNull();
  });

  it('array returned for single-line source item returns null', () => {
    const raw = JSON.stringify({
      l1: [['step one', 'step two', 'step three'], '[a] item two', '[a] item three'],
      l2: ['[a] l2 one', '[a] l2 two'],
      l3: ['[a] l3 one'],
    });
    expect(validateGeneratedOptions(raw, TASK_REVIEW)).toBeNull();
  });
});

// ── generateOptionList ────────────────────────────────────────────────────────

describe('generateOptionList', () => {
  it('returns GeneratedOptions on success', async () => {
    const client = makeClient(validResponse());
    const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], undefined, client);
    expect(result).not.toBeNull();
    expect(result?.l1).toHaveLength(TASK_REVIEW.L1.length);
  });

  it('returns null when API throws', async () => {
    const client = {
      chat: { completions: { create: vi.fn().mockRejectedValue(new Error('API error')) } },
    } as unknown as import('openai').default;
    const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], undefined, client);
    expect(result).toBeNull();
  });

  it('returns null when response fails validation (count mismatch)', async () => {
    const bad = JSON.stringify({ l1: ['only one'], l2: ['x', 'y'], l3: ['z'] });
    const client = makeClient(bad);
    const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], undefined, client);
    expect(result).toBeNull();
  });

  it('returns null when response is not valid JSON', async () => {
    const client = makeClient('not json at all');
    const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], undefined, client);
    expect(result).toBeNull();
  });

  it('passes profile=undefined without throwing', async () => {
    const client = makeClient(validResponse());
    const result = await generateOptionList(TASK_REVIEW, undefined, undefined, [], undefined, client);
    expect(result).not.toBeNull();
  });

  it('calls the API with the generated prompt', async () => {
    const client = makeClient(validResponse());
    await generateOptionList(TASK_REVIEW, makeProfile(), 'en', [makePrompt('test prompt')], undefined, client);
    const create = client.chat.completions.create as ReturnType<typeof vi.fn>;
    expect(create).toHaveBeenCalledTimes(2);
    const pass1Arg = create.mock.calls[0][0];
    expect(pass1Arg.model).toBe('gpt-4o-mini');
    expect(pass1Arg.messages[0].content).toContain('test prompt');
    const pass2Arg = create.mock.calls[1][0];
    expect(pass2Arg.model).toBe('gpt-4o-mini');
  });

  it('calls the API with timeout 12000', async () => {
    const client = makeClient(validResponse());
    await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], undefined, client);
    const create = client.chat.completions.create as ReturnType<typeof vi.fn>;
    expect(create.mock.calls[0][1]).toEqual({ timeout: 12_000 });
    expect(create.mock.calls[1][1]).toEqual({ timeout: 12_000 });
  });
});

// ── buildAdaptationPrompt — Pass 1 semantics ─────────────────────────────────

describe('buildAdaptationPrompt — Pass 1 semantics', () => {
  it('prompt contains VOCABULARY ADAPTATION ONLY directive', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, []);
    expect(prompt).toContain('VOCABULARY ADAPTATION ONLY');
  });

  it('prompt contains artifact completion context label', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, []);
    expect(prompt).toContain('Artifact completion context (adjustments based on detected artifacts)');
  });

  it('prompt never contains feature grounding section', () => {
    const history = [makePrompt('build the login page', 0)];
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, history);
    expect(prompt).not.toContain('Feature word grounding');
  });

  it('prompt does not include Example 4 grounding example', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, []);
    expect(prompt).not.toContain('Example 4');
  });

  it('default no-artifact text does not reference vocabulary-only adaptation', () => {
    // Spec capped at 60 suppresses all grounding rules → lines=[] → default text fires
    const history = [
      makePrompt('write the prd for this feature', 0),
      makePrompt('add the acceptance criteria to the spec', 1),
    ];
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, history);
    expect(prompt).toContain('No completed artifacts detected — no artifact-specific substitutions needed');
    expect(prompt).not.toContain('use the options as-is, only adapt vocabulary');
  });
});

// ── generateOptionList — retry mechanism ─────────────────────────────────────

function makeRetryClient(
  responses: string[],
): import('openai').default {
  const create = vi.fn();
  for (const r of responses) {
    create.mockResolvedValueOnce({ choices: [{ message: { content: r } }] });
  }
  return { chat: { completions: { create } } } as unknown as import('openai').default;
}

describe('generateOptionList — retry on validation failure', () => {
  it('succeeds on second attempt when first response fails validation', async () => {
    const bad  = JSON.stringify({ l1: ['only one'], l2: ['x'], l3: ['z'] });
    const good = validResponse();
    const client = makeRetryClient([bad, good, validResponse()]);
    const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], undefined, client);
    expect(result).not.toBeNull();
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(3);
  });

  it('retry message contains the specific rejection error and failed response', async () => {
    const bad  = JSON.stringify({ l1: ['only one'], l2: TASK_REVIEW.L2.map(o => o), l3: TASK_REVIEW.L3.map(o => o) });
    const good = validResponse();
    const client = makeRetryClient([bad, good, validResponse()]);
    await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], undefined, client);
    const create   = client.chat.completions.create as ReturnType<typeof vi.fn>;
    const retryArg = create.mock.calls[1][0] as { messages: Array<{ role: string; content: string }> };
    expect(retryArg.messages).toHaveLength(3);
    expect(retryArg.messages[1].role).toBe('assistant');
    expect(retryArg.messages[1].content).toBe(bad);
    expect(retryArg.messages[2].role).toBe('user');
    expect(retryArg.messages[2].content).toContain('rejected');
    expect(retryArg.messages[2].content).toContain('l1');
  });

  it('returns null and exhausts exactly OPTION_GEN_MAX_RETRIES+1 attempts', async () => {
    const bad    = JSON.stringify({ l1: ['only one'], l2: ['x'], l3: ['z'] });
    const client = makeRetryClient(Array(OPTION_GEN_MAX_RETRIES + 1).fill(bad));
    const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], undefined, client);
    expect(result).toBeNull();
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(OPTION_GEN_MAX_RETRIES + 1);
  });

  it('uses json_object response format on every attempt', async () => {
    const bad    = JSON.stringify({ l1: ['only one'], l2: ['x'], l3: ['z'] });
    const good   = validResponse();
    const client = makeRetryClient([bad, good, validResponse()]);
    await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], undefined, client);
    const create = client.chat.completions.create as ReturnType<typeof vi.fn>;
    for (const call of create.mock.calls) {
      expect((call[0] as { response_format: unknown }).response_format).toEqual({ type: 'json_object' });
    }
  });

  it('returns null immediately on API error without retrying', async () => {
    const create = vi.fn().mockRejectedValue(new Error('network error'));
    const client = { chat: { completions: { create } } } as unknown as import('openai').default;
    const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], undefined, client);
    expect(result).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });
});

// ── generateOptionList — Pass 2 fallback behavior ────────────────────────────

describe('generateOptionList — Pass 2 fallback behavior', () => {
  it('returns Pass 1 output when Pass 2 exhausts all retries', async () => {
    const bad = JSON.stringify({ l1: ['only one'], l2: ['x'], l3: ['z'] });
    const client = makeRetryClient([validResponse(), ...Array(OPTION_GEN_MAX_RETRIES + 1).fill(bad)]);
    const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], undefined, client);
    expect(result).not.toBeNull();
    expect(result?.l1).toHaveLength(TASK_REVIEW.L1.length);
  });

  it('returns Pass 1 output when Pass 2 API throws', async () => {
    const pass1Good = validResponse();
    let callCount = 0;
    const create = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ choices: [{ message: { content: pass1Good } }] });
      }
      return Promise.reject(new Error('Pass 2 API error'));
    });
    const client = { chat: { completions: { create } } } as unknown as import('openai').default;
    const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], undefined, client);
    expect(result).not.toBeNull();
    expect(result?.l1).toHaveLength(TASK_REVIEW.L1.length);
  });

  it('GroundingConfig.enabled = false — skips Pass 2, returns Pass 1 output, only 1 API call', async () => {
    const config = GroundingConfig as unknown as { enabled: boolean };
    const saved = config.enabled;
    config.enabled = false;
    try {
      const client = makeClient(validResponse());
      const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], undefined, client);
      expect(result).not.toBeNull();
      expect((client.chat.completions.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    } finally {
      config.enabled = saved;
    }
  });
});

// ── buildAdaptationPrompt — type contract ────────────────────────────────────

describe('buildAdaptationPrompt — type contract', () => {
  it('includes type contract section in prompt', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, []);
    expect(prompt).toContain('Item type contract (absolute');
  });

  it('all-string content → all STRING labels', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW, makeProfile(), undefined, []);
    // TASK_REVIEW: L1×3 plain strings, L2×2 plain strings, L3×1 plain string
    expect(prompt).toContain('l1: [STRING, STRING, STRING]');
    expect(prompt).toContain('l2: [STRING, STRING]');
    expect(prompt).toContain('l3: [STRING]');
  });

  it('mixed content (ARRAY + STRING in L1) → correct per-position labels', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW_BEGINNER, makeProfile(), undefined, []);
    // TASK_REVIEW_BEGINNER.L1[0] has \n (3 steps), L1[1] is a plain string
    expect(prompt).toContain('l1: [ARRAY(3), STRING]');
  });

  it('type contract appears immediately before the input JSON block', () => {
    const prompt = buildAdaptationPrompt(TASK_REVIEW_BEGINNER, makeProfile(), undefined, []);
    const contractIdx = prompt.indexOf('Item type contract');
    const inputIdx    = prompt.indexOf('Now rewrite the following input');
    expect(contractIdx).toBeGreaterThan(-1);
    expect(inputIdx).toBeGreaterThan(-1);
    expect(contractIdx).toBeLessThan(inputIdx);
  });
});

// ── buildEmbeddingPrompt — feature word grounding ────────────────────────────

describe('buildEmbeddingPrompt — feature word grounding', () => {
  const adaptedOpts: GeneratedOptions = {
    l1: ['Check the login flow.', 'Run tests.', 'Flag gaps.'],
    l2: ['Quick check.', 'Verify.'],
    l3: ['Any problems?'],
  };

  it('contains R4 two-step extraction header with Step A and Step B', () => {
    const prompt = buildEmbeddingPrompt(adaptedOpts, [makePrompt('build the login page', 0)]);
    expect(prompt).toContain('Feature noun extraction — two steps');
    expect(prompt).toContain('Step A');
    expect(prompt).toContain('Step B');
  });

  it('R8 scoped non-quotation header present', () => {
    const prompt = buildEmbeddingPrompt(adaptedOpts, [makePrompt('build the login page', 0)]);
    expect(prompt).toContain('do not copy these prompts verbatim into option text');
    expect(prompt).toContain('extracting specific nouns for feature grounding is required');
  });

  it('includes stage_transition advisory context block when context provided', () => {
    const context: OptionGenContext = {
      flagType:              'stage_transition',
      currentStage:          'review_testing',
      prevStage:             'implementation',
      promptsInCurrentStage: 5,
    };
    const prompt = buildEmbeddingPrompt(adaptedOpts, [makePrompt('fix the tests', 0)], context);
    expect(prompt).toContain('stage_transition');
    expect(prompt).toContain('implementation');
    expect(prompt).toContain('testing');
  });

  it('includes absence advisory context block when context provided', () => {
    const context: OptionGenContext = {
      flagType:              'absence:test_creation',
      currentStage:          'implementation',
      promptsInCurrentStage: 12,
    };
    const prompt = buildEmbeddingPrompt(adaptedOpts, [makePrompt('add the login page', 0)], context);
    expect(prompt).toContain('absence advisory');
    expect(prompt).toContain('test_creation');
  });

  it('no advisory context block when context is undefined', () => {
    const prompt = buildEmbeddingPrompt(adaptedOpts, [makePrompt('build the login page', 0)]);
    expect(prompt).not.toContain('Advisory context:');
  });

  it('respects promptWindow — prompts outside window do not appear', () => {
    const history = [
      makePrompt('OUTSIDE_WINDOW_SENTINEL', 0),
      makePrompt('OUTSIDE_WINDOW_SENTINEL', 1),
      ...Array.from({ length: GroundingConfig.promptWindow - 1 }, (_, i) =>
        makePrompt(`inside-prompt-${i}`, i + 2),
      ),
      makePrompt('INSIDE_WINDOW_SENTINEL', GroundingConfig.promptWindow + 1),
    ];
    const prompt = buildEmbeddingPrompt(adaptedOpts, history);
    expect(prompt).not.toContain('OUTSIDE_WINDOW_SENTINEL');
    expect(prompt).toContain('INSIDE_WINDOW_SENTINEL');
  });
});

// ── buildEmbeddingPrompt — embedding instruction ──────────────────────────────

describe('buildEmbeddingPrompt — embedding instruction', () => {
  const adaptedOpts: GeneratedOptions = {
    l1: ['Check the login flow.', 'Run tests.', 'Flag gaps.'],
    l2: ['Quick check.', 'Verify.'],
    l3: ['Any problems?'],
  };

  it('embed instruction present and contains no "naturally" qualifier', () => {
    const prompt = buildEmbeddingPrompt(adaptedOpts, [makePrompt('build the login page', 0)]);
    expect(prompt).toContain('Embed the extracted feature noun');
    expect(prompt).not.toContain('naturally');
  });

  it('R4 positive and negative extraction examples present', () => {
    const prompt = buildEmbeddingPrompt(adaptedOpts, [makePrompt('build the login page', 0)]);
    // Positive — bug/styling prompt with a feature noun → noun extracted
    expect(prompt).toContain('"the login is not working on my phone" → "login"');
    // Negative — genuinely meta prompt with no feature noun → 'this feature' fallback
    expect(prompt).toContain('"fix this"');
    expect(prompt).toContain("'this feature'");
  });

  it('Design B fallback instruction present', () => {
    const prompt = buildEmbeddingPrompt(adaptedOpts, [makePrompt('build the login page', 0)]);
    expect(prompt).toContain('If none of these phrases survived adaptation');
  });

  it('input JSON reflects adaptedOptions not static content', () => {
    const unique = 'UNIQUE_ADAPTED_OPTION_TEXT_XYZ';
    const opts: GeneratedOptions = {
      l1: [unique, 'opt2', 'opt3'],
      l2: ['opt4', 'opt5'],
      l3: ['opt6'],
    };
    const prompt = buildEmbeddingPrompt(opts, [makePrompt('build something', 0)]);
    expect(prompt).toContain(unique);
  });

  it('type contract labels reflect adaptedOptions item types', () => {
    const multiStep: GeneratedOptions = {
      l1: ['step1\nstep2\nstep3', 'plain string'],
      l2: ['another string'],
      l3: ['last string'],
    };
    const prompt = buildEmbeddingPrompt(multiStep, [makePrompt('build something', 0)]);
    expect(prompt).toContain('l1: [ARRAY(3), STRING]');
  });

  it('type contract appears before input JSON block', () => {
    const prompt = buildEmbeddingPrompt(adaptedOpts, [makePrompt('build the login page', 0)]);
    const contractIdx = prompt.indexOf('Item type contract');
    const inputIdx    = prompt.indexOf('Now embed the feature noun');
    expect(contractIdx).toBeGreaterThan(-1);
    expect(inputIdx).toBeGreaterThan(-1);
    expect(contractIdx).toBeLessThan(inputIdx);
  });

  it('all 5 Research 5 examples are present', () => {
    const prompt = buildEmbeddingPrompt(adaptedOpts, [makePrompt('build the login page', 0)]);
    expect(prompt).toContain('Feature noun: "login flow"');       // P2-1
    expect(prompt).toContain('Feature noun: "recurring invoice"'); // P2-2
    expect(prompt).toContain('Feature noun: "client portal"');    // P2-3
    expect(prompt).toContain('Feature noun: "invoice reminder"'); // P2-4
    expect(prompt).toContain('login is still working');           // P2-5 Design B output
  });

  it('response format instruction present', () => {
    const prompt = buildEmbeddingPrompt(adaptedOpts, [makePrompt('build the login page', 0)]);
    expect(prompt).toContain('Response — return JSON only');
  });
});
