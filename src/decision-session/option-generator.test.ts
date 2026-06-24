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
import {
  TASK_REVIEW,
  IMPLEMENTATION_TO_REVIEW,
  ABSENCE_CORRECTION_SEEKING,
  ABSENCE_CORRECTION_SEEKING_CASUAL,
  ABSENCE_PROMPT_CONTEXT,
  ABSENCE_PROMPT_CONTEXT_CASUAL,
} from './options.js';
import {
  TASK_REVIEW_BEGINNER,
  ABSENCE_CORRECTION_SEEKING_BEGINNER,
  ABSENCE_PROMPT_CONTEXT_BEGINNER,
  ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER,
} from './options-beginner.js';
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
    l1: content.L1.map((o) => `[adapted] ${o.option}`),
    l2: content.L2.map((o) => `[adapted] ${o.option}`),
    l3: content.L3.map((o) => `[adapted] ${o.option}`),
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
    for (const entry of TASK_REVIEW.L1.map((e) => e.option)) {
      expect(prompt).toContain(entry.slice(0, 40)); // first 40 chars to avoid wrapping issues
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
      l1: [...TASK_REVIEW.L1.map((e) => e.option).slice(0, -1), ''],
      l2: TASK_REVIEW.L2.map((o) => o),
      l3: TASK_REVIEW.L3.map((o) => o),
    });
    expect(validateGeneratedOptions(bad, TASK_REVIEW)).toBeNull();
  });

  it('returns null when any item is not a string', () => {
    const bad = JSON.stringify({
      l1: [...TASK_REVIEW.L1.map((e) => e.option).slice(0, -1), 42],
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
    expect(result!.l1[0]).toBe(TASK_REVIEW_BEGINNER.L1[0].option);
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
    expect(result!.l1[0]).toBe(TASK_REVIEW_BEGINNER.L1[0].option);
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

  it('returns null (not throws) when no client passed and OPENAI_API_KEY missing', async () => {
    // Honour the JSDoc "Never throws" contract: a missing key should surface as a
    // null return so callers (stop hook) fall back to static options instead of
    // crashing the whole pipeline.
    const savedKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, []);
      expect(result).toBeNull();
    } finally {
      if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
      else                         process.env.OPENAI_API_KEY = savedKey;
    }
  });
});

// Post-Pass-2 substitution wiring tests live in r5-injection.integration.test.ts.

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
    // TASK_REVIEW_BEGINNER.L1[0].option has \n (3 steps), L1[1] is a plain string
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

  it('contains holistic multi-prompt extraction instruction (no Step A/B)', () => {
    const prompt = buildEmbeddingPrompt(adaptedOpts, [makePrompt('build the login page', 0)]);
    expect(prompt).toContain('Feature noun extraction — identify the primary feature area');
    expect(prompt).toContain('favour the noun that appears across multiple recent prompts');
    expect(prompt).not.toContain('Step A');
    expect(prompt).not.toContain('Step B');
  });

  it('holistic instruction favors recurring feature noun over last-prompt-only noun', () => {
    // Last prompt has a unique noun ("button"); preceding prompts consistently reference "booking system"
    const history = [
      makePrompt('add the booking form to the booking system', 0),
      makePrompt('the booking confirmation email is not sending', 1),
      makePrompt('fix the booking system date picker', 2),
      makePrompt('the button is too small', 3),
    ];
    const prompt = buildEmbeddingPrompt(adaptedOpts, history);
    // Holistic instruction tells LLM to weight recurring nouns over last-prompt-only
    expect(prompt).toContain('favour the noun that appears across multiple recent prompts');
    expect(prompt).toContain('over a noun that appears only in the last prompt');
    // All prompts appear in the grounding section
    expect(prompt).toContain('booking system');
    expect(prompt).toContain('button is too small');
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

  it('merges the action anchor into the Pass-2 prompt when provided', () => {
    const context: OptionGenContext = {
      flagType:              'stage_transition',
      currentStage:          'review_testing',
      promptsInCurrentStage: 3,
      actionAnchor:          'then run tests',
    };
    const prompt = buildEmbeddingPrompt(adaptedOpts, [makePrompt('fix the tests', 0)], context);
    expect(prompt).toContain('Action anchor');
    expect(prompt).toContain('then run tests');
    expect(prompt).toContain('merge it into ONE option only');
  });

  it('no action anchor section when actionAnchor is absent', () => {
    const prompt = buildEmbeddingPrompt(adaptedOpts, [makePrompt('build the login page', 0)]);
    expect(prompt).not.toContain('Action anchor');
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

  it('holistic extraction instruction includes feature noun examples and this-feature fallback', () => {
    const prompt = buildEmbeddingPrompt(adaptedOpts, [makePrompt('build the login page', 0)]);
    // Feature noun examples in the holistic instruction
    expect(prompt).toContain('"booking system"');
    // 'this feature' fallback still present
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

// ── Issue 16 Phase 1 — content regression: ABSENCE_CORRECTION_SEEKING_BEGINNER ─

describe('Issue 16 Phase 1 — ABSENCE_CORRECTION_SEEKING_BEGINNER content', () => {
  const RELAY_PATTERNS = ['Ask the AI', 'ask the AI', 'ask it to', 'what it says', 'its answer', 'Has the AI', 'Does the AI'];

  it('question and pinchFallback are unchanged', () => {
    expect(ABSENCE_CORRECTION_SEEKING_BEGINNER.question).toBe('Has the AI checked its own work?');
    expect(ABSENCE_CORRECTION_SEEKING_BEGINNER.pinchFallback).toBe('No verification.');
  });

  it('L1[0] is a 3-step ARRAY with corrected imperative text', () => {
    const steps = ABSENCE_CORRECTION_SEEKING_BEGINNER.L1[0].option.split('\n');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toBe('1. Look at what was just built again — but this time, find what might be wrong with it.');
    expect(steps[1]).toBe('2. Share what you find with me.');
    expect(steps[2]).toBe('3. Then tell me: does what you found make sense, or does something still seem off?');
  });

  it('L1[1] has no relay wrapper or coaching-voice framing', () => {
    expect(ABSENCE_CORRECTION_SEEKING_BEGINNER.L1[1].option).toBe(
      "What's the part of what was just built you're least sure about? — share what you find with me so we can check together.",
    );
  });

  it('L2[0] uses direct imperative', () => {
    expect(ABSENCE_CORRECTION_SEEKING_BEGINNER.L2[0].option).toBe(
      'Point out any part of what was just built that might not be right — then share what you find with me.',
    );
  });

  it('L3[0] uses direct imperative', () => {
    expect(ABSENCE_CORRECTION_SEEKING_BEGINNER.L3[0].option).toBe(
      'Find one thing in what was just built that might be wrong or could be done better.',
    );
  });

  it('no option contains coaching-voice relay patterns', () => {
    const opts = [...ABSENCE_CORRECTION_SEEKING_BEGINNER.L1.map((e) => e.option), ...ABSENCE_CORRECTION_SEEKING_BEGINNER.L2.map((e) => e.option), ...ABSENCE_CORRECTION_SEEKING_BEGINNER.L3.map((e) => e.option)];
    for (const text of opts) {
      for (const p of RELAY_PATTERNS) {
        expect(text, `found "${p}" in: ${text}`).not.toContain(p);
      }
    }
  });
});

// ── Issue 16 Phase 1 — content regression: ABSENCE_PROMPT_CONTEXT_BEGINNER ────

describe('Issue 16 Phase 1 — ABSENCE_PROMPT_CONTEXT_BEGINNER content', () => {
  const RELAY_PATTERNS = ['Ask the AI', 'ask the AI', 'ask it to', 'what it says', 'Has the AI', 'Does the AI', 'has it seen', 'has it been'];

  it('question and pinchFallback are unchanged', () => {
    expect(ABSENCE_PROMPT_CONTEXT_BEGINNER.question).toBe('Sending prompts — have you shared the spec?');
    expect(ABSENCE_PROMPT_CONTEXT_BEGINNER.pinchFallback).toBe('Missing context.');
  });

  it('L1[0] is a 3-step ARRAY with corrected text — no relay, no phantom reference', () => {
    const steps = ABSENCE_PROMPT_CONTEXT_BEGINNER.L1[0].option.split('\n');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toBe("1. Think about what you've been building in this session.");
    expect(steps[1]).toBe("2. Share with me: have you seen the original plan for what we're building, or have you just been following each instruction without knowing the bigger picture?");
    expect(steps[2]).toBe('3. Then paste the plan or the task description into the conversation and check that what was just built matches what was planned.');
  });

  it('L1[1] has no phantom plan reference and no relay', () => {
    expect(ABSENCE_PROMPT_CONTEXT_BEGINNER.L1[1].option).toBe(
      "Walk me through what you've been working from in this session — have you seen the full plan, or just individual instructions? Check whether what was just built matches the original plan if you have it, and share what you find with me.",
    );
  });

  it('L2[0] has no phantom reference and uses ask-me fallback', () => {
    expect(ABSENCE_PROMPT_CONTEXT_BEGINNER.L2[0].option).toBe(
      'Have you seen the plan or the description of what this feature is supposed to do? If not, ask me for it — then check that what was just built matches and share what you find.',
    );
  });

  it('L3[0] uses second-person direct address', () => {
    expect(ABSENCE_PROMPT_CONTEXT_BEGINNER.L3[0].option).toBe(
      'Do you know what the full plan says for this feature, or have you been building without seeing it?',
    );
  });

  it('no option contains coaching-voice relay or third-person AI patterns', () => {
    const opts = [...ABSENCE_PROMPT_CONTEXT_BEGINNER.L1.map((e) => e.option), ...ABSENCE_PROMPT_CONTEXT_BEGINNER.L2.map((e) => e.option), ...ABSENCE_PROMPT_CONTEXT_BEGINNER.L3.map((e) => e.option)];
    for (const text of opts) {
      for (const p of RELAY_PATTERNS) {
        expect(text, `found "${p}" in: ${text}`).not.toContain(p);
      }
    }
  });
});

// ── Issue 16 Phase 1 — content regression: ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER ─

describe('Issue 16 Phase 1 — ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER content', () => {
  it('question and pinchFallback are unchanged', () => {
    expect(ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER.question).toBe("Asking a lot at once — let's do one thing at a time");
    expect(ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER.pinchFallback).toBe('One thing at a time.');
  });

  it('L1[0] step count is preserved at 2', () => {
    const steps = ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER.L1[0].option.split('\n');
    expect(steps).toHaveLength(2);
  });

  it('L1[0] step 1 has no self-referential "ask the AI" phrase', () => {
    const steps = ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER.L1[0].option.split('\n');
    expect(steps[0]).toBe('1. When you send several things at once, the results get messy and hard to check. Try focusing on just one thing per message.');
  });

  it('L1[0] step 2 is unchanged', () => {
    const steps = ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER.L1[0].option.split('\n');
    expect(steps[1]).toBe("2. What's the most important thing to do right now? Start with that — then we'll move to the next.");
  });

  it('L1[1], L2[0], L3[0] are unchanged', () => {
    expect(ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER.L1[1].option).toBe(
      "One task per message works better than many — it's easier to see if it worked, easier to fix if it didn't, and easier to understand what happened. What's the single next step?",
    );
    expect(ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER.L2[0].option).toBe(
      "What's the one thing to do right now? Focus on that first — we'll do the rest after.",
    );
    expect(ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER.L3[0].option).toBe(
      "One thing at a time — what's the most important next step?",
    );
  });

  it('L1[0] contains no "ask the AI" self-referential phrase', () => {
    expect(ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER.L1[0].option).not.toContain('ask the AI');
    expect(ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER.L1[0].option).not.toContain('Ask the AI');
  });
});

// ── Issue 16 Phase 2 — content regression: ABSENCE_CORRECTION_SEEKING ──────────────────────────

describe('Issue 16 Phase 2 — ABSENCE_CORRECTION_SEEKING content', () => {
  it('question and pinchFallback are unchanged', () => {
    expect(ABSENCE_CORRECTION_SEEKING.question).toBe('AI output — self-verification requested?');
    expect(ABSENCE_CORRECTION_SEEKING.pinchFallback).toBe('No verification.');
  });

  it('L1[0] is the self-review corrected text', () => {
    expect(ABSENCE_CORRECTION_SEEKING.L1[0].option).toBe(
      'Self-review what was just built: identify any assumptions that may be incorrect, logic that could fail under edge cases, and any parts of the implementation you are not confident about.',
    );
  });

  it('L1[1] is the adversarial-argument corrected text', () => {
    expect(ABSENCE_CORRECTION_SEEKING.L1[1].option).toBe(
      'Argue against your own implementation of what was just built — what would a skeptical senior engineer flag, what alternative approaches were not considered, and what are the weakest parts of this solution?',
    );
  });

  it('L1[2] is the failure-analysis corrected text', () => {
    expect(ABSENCE_CORRECTION_SEEKING.L1[2].option).toBe(
      'Produce a failure analysis of what was just built: what are the most likely ways this implementation fails in production, what inputs would cause incorrect behaviour, and what would you change if rebuilding this from scratch?',
    );
  });

  it('L2[0] is the senior-engineer-review corrected text', () => {
    expect(ABSENCE_CORRECTION_SEEKING.L2[0].option).toBe(
      'Review what was just built critically — what would you change or flag if reviewing this as a senior engineer rather than as the author?',
    );
  });

  it('L2[1] is the self-critique corrected text', () => {
    expect(ABSENCE_CORRECTION_SEEKING.L2[1].option).toBe(
      'Self-critique what was just built: what are the weakest parts, and what were you least confident about when generating this?',
    );
  });

  it('L3[0] is the least-confident corrected text', () => {
    expect(ABSENCE_CORRECTION_SEEKING.L3[0].option).toBe(
      'Identify the part of what was just built you are least confident is correct.',
    );
  });

  it('no option text contains coaching-voice relay patterns', () => {
    const allTexts = [
      ...ABSENCE_CORRECTION_SEEKING.L1.map((e) => e.option),
      ...ABSENCE_CORRECTION_SEEKING.L2.map((e) => e.option),
      ...ABSENCE_CORRECTION_SEEKING.L3.map((e) => e.option),
    ];
    const patterns = ['Ask the AI', 'ask the AI', 'ask it to', 'what it says', 'its answer', 'Has the AI', 'Does the AI', 'has it seen', 'has it been'];
    for (const text of allTexts) {
      for (const pattern of patterns) {
        expect(text).not.toContain(pattern);
      }
    }
  });
});

// ── Issue 16 Phase 2 — content regression: ABSENCE_CORRECTION_SEEKING_CASUAL ────────────────────

describe('Issue 16 Phase 2 — ABSENCE_CORRECTION_SEEKING_CASUAL content', () => {
  it('question and pinchFallback are unchanged', () => {
    expect(ABSENCE_CORRECTION_SEEKING_CASUAL.question).toBe('Has the AI checked its own work?');
    expect(ABSENCE_CORRECTION_SEEKING_CASUAL.pinchFallback).toBe('No verification.');
  });

  it('L1[0] is the second-look critique corrected text', () => {
    expect(ABSENCE_CORRECTION_SEEKING_CASUAL.L1[0].option).toBe(
      "Take a second look at what was just built — not to explain it, but to actually critique it. What would you do differently, what assumptions did you make that might be wrong, and what are the riskiest parts?",
    );
  });

  it('L1[1] is the argue-against corrected text', () => {
    expect(ABSENCE_CORRECTION_SEEKING_CASUAL.L1[1].option).toBe(
      "Argue against your own output for what was just built: what's the case against this approach, what did you not consider, and what's the part you're least confident about?",
    );
  });

  it('L1[2] is the find-a-bug corrected text', () => {
    expect(ABSENCE_CORRECTION_SEEKING_CASUAL.L1[2].option).toBe(
      'If you had to find a bug or a flaw in what was just built, what would it be? Don\'t let yourself off the hook with "it looks fine."',
    );
  });

  it('L2[0] is the reviewer corrected text', () => {
    expect(ABSENCE_CORRECTION_SEEKING_CASUAL.L2[0].option).toBe(
      "Review what was just built as if you hadn't written it — what would you flag or change?",
    );
  });

  it('L2[1] is the weakest-part corrected text', () => {
    expect(ABSENCE_CORRECTION_SEEKING_CASUAL.L2[1].option).toBe(
      'Identify the weakest part of what was just built and explain what you\'re not sure about.',
    );
  });

  it('L3[0] is the least-confident corrected text', () => {
    expect(ABSENCE_CORRECTION_SEEKING_CASUAL.L3[0].option).toBe(
      "Identify the part of what was just built you're least confident is correct.",
    );
  });

  it('no option text contains coaching-voice relay patterns', () => {
    const allTexts = [
      ...ABSENCE_CORRECTION_SEEKING_CASUAL.L1.map((e) => e.option),
      ...ABSENCE_CORRECTION_SEEKING_CASUAL.L2.map((e) => e.option),
      ...ABSENCE_CORRECTION_SEEKING_CASUAL.L3.map((e) => e.option),
    ];
    const patterns = ['Ask the AI', 'ask the AI', 'ask it to', 'what it says', 'its answer', 'Has the AI', 'Does the AI', 'has it seen', 'has it been'];
    for (const text of allTexts) {
      for (const pattern of patterns) {
        expect(text).not.toContain(pattern);
      }
    }
  });
});

// ── Issue 16 Phase 2 — content regression: ABSENCE_PROMPT_CONTEXT ───────────────────────────────

describe('Issue 16 Phase 2 — ABSENCE_PROMPT_CONTEXT content', () => {
  it('question and pinchFallback are unchanged', () => {
    expect(ABSENCE_PROMPT_CONTEXT.question).toBe('Prompts sent — spec and arch referenced?');
    expect(ABSENCE_PROMPT_CONTEXT.pinchFallback).toBe('Missing context.');
  });

  it('L1[0] is the review-prompts corrected text', () => {
    expect(ABSENCE_PROMPT_CONTEXT.L1[0].option).toBe(
      "Review the prompts used to build this feature: are they grounded in the project's spec, architecture decisions, and task breakdown, or are they ad hoc instructions that you are implementing without access to the full planning context? If context is missing, inject it now before the next prompt.",
    );
  });

  it('L1[1] is the audit-context-richness corrected text', () => {
    expect(ABSENCE_PROMPT_CONTEXT.L1[1].option).toBe(
      'Audit the context richness of the prompts used to build this feature: do you have access to the current spec, the established architecture, and the specific acceptance criteria for what was just built, or are you making assumptions that a context-rich prompt would have resolved?',
    );
  });

  it('L1[2] is the cross-confirm corrected text', () => {
    expect(ABSENCE_PROMPT_CONTEXT.L1[2].option).toBe(
      "Cross-confirm that what was just built is aligned with the project's planning artifacts: paste the relevant spec section, architecture diagram, or task definition into the conversation and verify that your implementation matches what was planned.",
    );
  });

  it('L2[0] is the have-spec corrected text', () => {
    expect(ABSENCE_PROMPT_CONTEXT.L2[0].option).toBe(
      'Do you have the spec and architecture context needed to build this feature correctly, or have you been working from ad hoc instructions? Inject the relevant planning context before continuing.',
    );
  });

  it('L2[1] is the paste-spec corrected text', () => {
    expect(ABSENCE_PROMPT_CONTEXT.L2[1].option).toBe(
      'Paste the spec or acceptance criteria for this feature into the conversation and check whether what was just built matches what was planned.',
    );
  });

  it('L3[0] is the enough-context corrected text', () => {
    expect(ABSENCE_PROMPT_CONTEXT.L3[0].option).toBe(
      'Do you have enough context about the spec and architecture to be building this feature correctly, or are you working without the full picture?',
    );
  });

  it('no option text contains coaching-voice relay patterns', () => {
    const allTexts = [
      ...ABSENCE_PROMPT_CONTEXT.L1.map((e) => e.option),
      ...ABSENCE_PROMPT_CONTEXT.L2.map((e) => e.option),
      ...ABSENCE_PROMPT_CONTEXT.L3.map((e) => e.option),
    ];
    const patterns = ['Ask the AI', 'ask the AI', 'ask it to', 'what it says', 'its answer', 'Has the AI', 'Does the AI', 'has it seen', 'has it been'];
    for (const text of allTexts) {
      for (const pattern of patterns) {
        expect(text).not.toContain(pattern);
      }
    }
  });
});

// ── Issue 16 Phase 2 — content regression: ABSENCE_PROMPT_CONTEXT_CASUAL ────────────────────────

describe('Issue 16 Phase 2 — ABSENCE_PROMPT_CONTEXT_CASUAL content', () => {
  it('question and pinchFallback are unchanged', () => {
    expect(ABSENCE_PROMPT_CONTEXT_CASUAL.question).toBe('Sending prompts — have you shared the spec?');
    expect(ABSENCE_PROMPT_CONTEXT_CASUAL.pinchFallback).toBe('Missing context.');
  });

  it('L1[0] is the check-prompts corrected text', () => {
    expect(ABSENCE_PROMPT_CONTEXT_CASUAL.L1[0].option).toBe(
      "Check the prompts used to build this feature — do you actually know what the spec says, what the architecture looks like, and what the task is supposed to achieve? If you've just been getting ad hoc instructions, paste the relevant context in now so you're building the right thing.",
    );
  });

  it('L1[1] is the full-picture corrected text', () => {
    expect(ABSENCE_PROMPT_CONTEXT_CASUAL.L1[1].option).toBe(
      "Have you been working with the full picture, or just the last thing asked of you? If there's a spec, an architecture doc, or a task breakdown you haven't seen, let me know — then check that what was just built matches up once you have the full context.",
    );
  });

  it('L1[2] is the paste-and-confirm corrected text', () => {
    expect(ABSENCE_PROMPT_CONTEXT_CASUAL.L1[2].option).toBe(
      "Paste the relevant spec or task definition into the conversation and confirm that what was just built actually does what it's supposed to. If there's a mismatch, now is a better time to find it than after shipping.",
    );
  });

  it('L2[0] is the enough-context corrected text', () => {
    expect(ABSENCE_PROMPT_CONTEXT_CASUAL.L2[0].option).toBe(
      "Do you have enough context to build this feature correctly — have you seen the spec, the architecture, or the task breakdown? If not, share the relevant bits now.",
    );
  });

  it('L2[1] is the paste-and-check corrected text (unchanged)', () => {
    expect(ABSENCE_PROMPT_CONTEXT_CASUAL.L2[1].option).toBe(
      'Paste the spec or the definition of done for this feature into the conversation and check whether what was just built actually matches it.',
    );
  });

  it('L3[0] is the know-the-spec corrected text', () => {
    expect(ABSENCE_PROMPT_CONTEXT_CASUAL.L3[0].option).toBe(
      "Do you know what the spec says for this feature, or have you been building without seeing it?",
    );
  });

  it('no option text contains coaching-voice relay patterns', () => {
    const allTexts = [
      ...ABSENCE_PROMPT_CONTEXT_CASUAL.L1.map((e) => e.option),
      ...ABSENCE_PROMPT_CONTEXT_CASUAL.L2.map((e) => e.option),
      ...ABSENCE_PROMPT_CONTEXT_CASUAL.L3.map((e) => e.option),
    ];
    const patterns = ['Ask the AI', 'ask the AI', 'ask it to', 'what it says', 'its answer', 'Has the AI', 'Does the AI', 'has it seen', 'has it been'];
    for (const text of allTexts) {
      for (const pattern of patterns) {
        expect(text).not.toContain(pattern);
      }
    }
  });
});
