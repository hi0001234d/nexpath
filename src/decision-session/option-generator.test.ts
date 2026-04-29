import { describe, it, expect, vi } from 'vitest';
import {
  buildOptionPrompt,
  validateGeneratedOptions,
  generateOptionList,
  type GeneratedOptions,
} from './OptionGenerator.js';
import { TASK_REVIEW, IMPLEMENTATION_TO_REVIEW } from './options.js';
import type { UserProfile, PromptRecord } from '../classifier/types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    nature:           'hardcore_pro',
    mood:             'focused',
    depth:            'high',
    precisionScore:   8,
    playfulnessScore: 3,
    depthScore:       7,
    computedAt:       1,
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

// ── buildOptionPrompt — profile adaptation ────────────────────────────────────

describe('buildOptionPrompt — profile adaptation', () => {
  it('includes nature and mood in prompt when profile is present', () => {
    const prompt = buildOptionPrompt(TASK_REVIEW, makeProfile(), undefined, []);
    expect(prompt).toContain('nature=hardcore_pro');
    expect(prompt).toContain('mood=focused');
    expect(prompt).toContain('depth=high');
  });

  it('uses neutral style when profile is undefined', () => {
    const prompt = buildOptionPrompt(TASK_REVIEW, undefined, undefined, []);
    expect(prompt).toContain('not yet computed');
    expect(prompt).toContain('Neutral professional tone');
  });

  it('includes beginner style for beginner nature', () => {
    const prompt = buildOptionPrompt(TASK_REVIEW, makeProfile({ nature: 'beginner', depth: 'low' }), undefined, []);
    expect(prompt).toContain('Plain English');
  });

  it('includes casual technical style for cool_geek nature', () => {
    const prompt = buildOptionPrompt(TASK_REVIEW, makeProfile({ nature: 'cool_geek' }), undefined, []);
    expect(prompt).toContain('Casual technical');
  });

  it('depth=low overrides cool_geek nature — plain English wins', () => {
    const prompt = buildOptionPrompt(TASK_REVIEW, makeProfile({ nature: 'cool_geek', depth: 'low' }), undefined, []);
    expect(prompt).toContain('Plain English');
    expect(prompt).not.toContain('Casual technical');
  });

  it('cool_geek with depth=medium keeps casual technical style', () => {
    const prompt = buildOptionPrompt(TASK_REVIEW, makeProfile({ nature: 'cool_geek', depth: 'medium' }), undefined, []);
    expect(prompt).toContain('Casual technical');
  });

  it('cool_geek with depth=high keeps casual technical style — nature wins over depth=high', () => {
    const prompt = buildOptionPrompt(TASK_REVIEW, makeProfile({ nature: 'cool_geek', depth: 'high' }), undefined, []);
    expect(prompt).toContain('Casual technical');
  });

  it('includes empathetic tone for frustrated mood', () => {
    const prompt = buildOptionPrompt(TASK_REVIEW, makeProfile({ mood: 'frustrated' }), undefined, []);
    expect(prompt).toContain('Empathetic');
  });

  it('includes ultra-concise tone for rushed mood', () => {
    const prompt = buildOptionPrompt(TASK_REVIEW, makeProfile({ mood: 'rushed' }), undefined, []);
    expect(prompt).toContain('Ultra-concise');
  });

  it('includes language note when language is non-English', () => {
    const prompt = buildOptionPrompt(TASK_REVIEW, makeProfile(), 'fr', []);
    expect(prompt).toContain('fr-speaking developer');
  });

  it('does not include language note when language is en', () => {
    const prompt = buildOptionPrompt(TASK_REVIEW, makeProfile(), 'en', []);
    expect(prompt).not.toContain('fr-speaking');
    expect(prompt).not.toContain('Language:');
  });
});

// ── buildOptionPrompt — static options appear verbatim ────────────────────────

describe('buildOptionPrompt — static options in prompt', () => {
  it('includes each L1 option text in the prompt', () => {
    const prompt = buildOptionPrompt(TASK_REVIEW, makeProfile(), undefined, []);
    for (const opt of TASK_REVIEW.L1) {
      expect(prompt).toContain(opt.slice(0, 40)); // first 40 chars to avoid wrapping issues
    }
  });

  it('includes count constraints for all levels', () => {
    const prompt = buildOptionPrompt(TASK_REVIEW, makeProfile(), undefined, []);
    expect(prompt).toContain(`L1=${TASK_REVIEW.L1.length}`);
    expect(prompt).toContain(`L2=${TASK_REVIEW.L2.length}`);
    expect(prompt).toContain(`L3=${TASK_REVIEW.L3.length}`);
  });

  it('includes last 3 prompts from history', () => {
    const history = [
      makePrompt('build the auth module', 0),
      makePrompt('add password reset flow', 1),
      makePrompt('write the login handler', 2),
    ];
    const prompt = buildOptionPrompt(TASK_REVIEW, makeProfile(), undefined, history);
    expect(prompt).toContain('write the login handler');
    expect(prompt).toContain('add password reset flow');
  });
});

// ── buildOptionPrompt — project grounding ────────────────────────────────────

describe('buildOptionPrompt — project grounding', () => {
  it('excludes spec options when no spec signals in history', () => {
    const prompt = buildOptionPrompt(TASK_REVIEW, makeProfile(), undefined, []);
    expect(prompt).toContain('EXCLUDE any option that references a spec');
  });

  it('hedges spec options when partial spec signals present', () => {
    const history = [makePrompt('write the requirements for auth'), makePrompt('now code the login')];
    const prompt = buildOptionPrompt(TASK_REVIEW, makeProfile(), undefined, history);
    expect(prompt).toContain('if you have written requirements for this');
  });

  it('includes spec options as-is when strong spec signal present', () => {
    const history = [
      makePrompt('write the prd for this feature'),
      makePrompt('add the acceptance criteria to the spec'),
      makePrompt('review the requirements doc and update it'),
    ];
    const prompt = buildOptionPrompt(TASK_REVIEW, makeProfile(), undefined, history);
    // At >60% confidence, no exclusion or hedge line should appear
    expect(prompt).not.toContain('EXCLUDE any option that references a spec');
    expect(prompt).not.toContain('if you have written requirements');
  });

  it('advances unit test options when unit test signals present', () => {
    const history = [
      makePrompt('write the vitest unit tests for the auth module'),
      makePrompt('run the tests — they all pass'),
    ];
    const prompt = buildOptionPrompt(TASK_REVIEW, makeProfile(), undefined, history);
    expect(prompt).toContain('Unit tests are likely written');
  });

  it('advances e2e options when e2e signals present', () => {
    const history = [makePrompt('set up playwright for e2e testing')];
    const prompt = buildOptionPrompt(TASK_REVIEW, makeProfile(), undefined, history);
    expect(prompt).toContain('E2E tests appear to be in progress');
  });

  it('advances task breakdown options when task signals present', () => {
    const history = [makePrompt('break this into tasks and create a checklist')];
    const prompt = buildOptionPrompt(TASK_REVIEW, makeProfile(), undefined, history);
    expect(prompt).toContain('A task breakdown likely exists');
  });

  it('resets task window at new-task boundary', () => {
    const history = [
      makePrompt('write unit tests for old feature', 0),
      makePrompt('run the tests — all pass', 1),
      makePrompt('now let\'s work on the settings page', 2), // boundary
      makePrompt('add a dropdown for timezone', 3),
    ];
    const prompt = buildOptionPrompt(TASK_REVIEW, makeProfile(), undefined, history);
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

// ── generateOptionList ────────────────────────────────────────────────────────

describe('generateOptionList', () => {
  it('returns GeneratedOptions on success', async () => {
    const client = makeClient(validResponse());
    const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], client);
    expect(result).not.toBeNull();
    expect(result?.l1).toHaveLength(TASK_REVIEW.L1.length);
  });

  it('returns null when API throws', async () => {
    const client = {
      chat: { completions: { create: vi.fn().mockRejectedValue(new Error('API error')) } },
    } as unknown as import('openai').default;
    const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], client);
    expect(result).toBeNull();
  });

  it('returns null when response fails validation (count mismatch)', async () => {
    const bad = JSON.stringify({ l1: ['only one'], l2: ['x', 'y'], l3: ['z'] });
    const client = makeClient(bad);
    const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], client);
    expect(result).toBeNull();
  });

  it('returns null when response is not valid JSON', async () => {
    const client = makeClient('not json at all');
    const result = await generateOptionList(TASK_REVIEW, makeProfile(), undefined, [], client);
    expect(result).toBeNull();
  });

  it('passes profile=undefined without throwing', async () => {
    const client = makeClient(validResponse());
    const result = await generateOptionList(TASK_REVIEW, undefined, undefined, [], client);
    expect(result).not.toBeNull();
  });

  it('calls the API with the generated prompt', async () => {
    const client = makeClient(validResponse());
    await generateOptionList(TASK_REVIEW, makeProfile(), 'en', [makePrompt('test prompt')], client);
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    const callArg = (client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.model).toBe('gpt-4o-mini');
    expect(callArg.messages[0].content).toContain('test prompt');
  });
});
